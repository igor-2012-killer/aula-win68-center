//! Opt-in, device-filtered Windows keyboard events. Never reads the vendor HID handle.
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, ts_rs::TS)]
pub struct KeyEvent {
    #[ts(type = "number")]
    pub elapsed_us: u64,
    #[ts(type = "\"Z\" | \"X\"")]
    pub key: String,
    pub down: bool,
}

#[derive(Debug, Serialize, Deserialize, ts_rs::TS)]
pub struct Recording {
    #[ts(type = "number")]
    pub duration_us: u64,
    pub events: Vec<KeyEvent>,
    pub repeats: u32,
    pub truncated: bool,
}

// Win32 Raw Input FFI requires unsafe calls against raw handles and message loops.
#[allow(unsafe_code)]
#[cfg(windows)]
mod windows {
    use super::{KeyEvent, Recording};
    use std::{
        mem::size_of,
        ptr::{null, null_mut},
        sync::{mpsc, Arc, Mutex},
        thread::{self, JoinHandle},
        time::Instant,
    };
    use windows_sys::Win32::{
        Foundation::HWND,
        System::Threading::GetCurrentThreadId,
        UI::{
            Input::{
                GetRawInputData, GetRawInputDeviceInfoW, GetRawInputDeviceList,
                GetRegisteredRawInputDevices, RegisterRawInputDevices, RAWINPUT, RAWINPUTDEVICE,
                RAWINPUTDEVICELIST, RAWINPUTHEADER, RIDEV_INPUTSINK, RIDEV_REMOVE, RIDI_DEVICENAME,
                RID_INPUT, RIM_TYPEKEYBOARD,
            },
            WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
                PostThreadMessageW, SetTimer, TranslateMessage, HWND_MESSAGE, MSG, WM_INPUT,
                WM_QUIT, WM_TIMER,
            },
        },
    };

    const MAX_EVENTS: usize = 50_000;
    const LIMIT_MS: u32 = 180_000;
    struct Session {
        thread_id: u32,
        handle: JoinHandle<Result<Recording, String>>,
        finished: Arc<Mutex<bool>>,
    }
    #[derive(Default)]
    pub struct RawInputRecorder {
        session: Mutex<Option<Session>>,
    }

    fn matching_path(path: &str) -> bool {
        let path = path.to_ascii_lowercase();
        path.contains("vid_1ca2&pid_1901&mi_00#")
    }

    // RAWKEYBOARD's make codes are physical scan codes, independent of language.
    fn key_for_scan(code: u16, flags: u16) -> Option<(&'static str, bool)> {
        if flags & 0x06 != 0 {
            return None;
        } // RI_KEY_E0 / RI_KEY_E1
        let key = match code {
            0x2c => "Z",
            0x2d => "X",
            _ => return None,
        };
        Some((key, flags & 0x01 == 0)) // RI_KEY_BREAK
    }

    fn record_key_transition(
        held: &mut [bool; 2],
        seen: &mut [bool; 2],
        result: &mut Recording,
        key: &'static str,
        down: bool,
        elapsed_us: u64,
    ) -> bool {
        let index = usize::from(key == "X");
        if down && held[index] {
            result.repeats += 1;
            return false;
        }
        if !down && !held[index] && seen[index] {
            return false;
        }
        seen[index] = true;
        held[index] = down;
        result.events.push(KeyEvent {
            elapsed_us,
            key: key.to_string(),
            down,
        });
        if result.events.len() >= MAX_EVENTS {
            result.truncated = true;
            return true;
        }
        false
    }

    unsafe fn device_name(handle: *mut core::ffi::c_void) -> Option<String> {
        let mut length = 0;
        if GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, null_mut(), &mut length) == u32::MAX
            || length == 0
        {
            return None;
        }
        let mut buf = vec![0u16; length as usize + 1];
        if GetRawInputDeviceInfoW(
            handle,
            RIDI_DEVICENAME,
            buf.as_mut_ptr().cast(),
            &mut length,
        ) == u32::MAX
        {
            return None;
        }
        let end = buf.iter().position(|&x| x == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..end]))
    }

    unsafe fn find_device() -> Result<usize, String> {
        let mut count = 0;
        let size = size_of::<RAWINPUTDEVICELIST>() as u32;
        if GetRawInputDeviceList(null_mut(), &mut count, size) == u32::MAX {
            return Err("Cannot enumerate Windows input devices".into());
        }
        let mut devices = vec![RAWINPUTDEVICELIST::default(); count as usize];
        let actual = GetRawInputDeviceList(devices.as_mut_ptr(), &mut count, size);
        if actual == u32::MAX {
            return Err("Cannot enumerate Windows input devices".into());
        }
        let matched: Vec<_> = devices
            .iter()
            .take(actual as usize)
            .filter(|d| {
                d.dwType == RIM_TYPEKEYBOARD
                    && device_name(d.hDevice).is_some_and(|name| matching_path(&name))
            })
            .collect();
        if matched.len() != 1 {
            return Err(format!(
                "Expected one Aula WIN68 keyboard input device, found {}",
                matched.len()
            ));
        }
        Ok(matched[0].hDevice as usize)
    }

    unsafe fn ensure_not_registered() -> Result<(), String> {
        let mut count = 0;
        let size = size_of::<RAWINPUTDEVICE>() as u32;
        if GetRegisteredRawInputDevices(null_mut(), &mut count, size) == u32::MAX {
            return Err("Cannot inspect Raw Input registrations".into());
        }
        if count == 0 {
            return Ok(());
        }
        let mut registrations = vec![RAWINPUTDEVICE::default(); count as usize];
        let actual = GetRegisteredRawInputDevices(registrations.as_mut_ptr(), &mut count, size);
        if actual == u32::MAX {
            return Err("Cannot inspect Raw Input registrations".into());
        }
        if registrations
            .iter()
            .take(actual as usize)
            .any(|r| r.usUsagePage == 1 && r.usUsage == 6)
        {
            return Err("Keyboard Raw Input is already registered by this application".into());
        }
        Ok(())
    }

    unsafe fn run(sender: mpsc::SyncSender<Result<u32, String>>) -> Result<Recording, String> {
        let device = match find_device().and_then(|d| ensure_not_registered().map(|()| d)) {
            Ok(device) => device,
            Err(e) => {
                let _ = sender.send(Err(e.clone()));
                return Err(e);
            }
        };
        let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
        let hwnd: HWND = CreateWindowExW(
            0,
            class.as_ptr(),
            null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            null_mut(),
            null_mut(),
            null(),
        );
        if hwnd.is_null() {
            let e = "Cannot create Raw Input window".to_string();
            let _ = sender.send(Err(e.clone()));
            return Err(e);
        }
        let registration = RAWINPUTDEVICE {
            usUsagePage: 1,
            usUsage: 6,
            dwFlags: RIDEV_INPUTSINK,
            hwndTarget: hwnd,
        };
        if RegisterRawInputDevices(&registration, 1, size_of::<RAWINPUTDEVICE>() as u32) == 0 {
            DestroyWindow(hwnd);
            let e = "Cannot register Raw Input".to_string();
            let _ = sender.send(Err(e.clone()));
            return Err(e);
        }
        if SetTimer(hwnd, 1, LIMIT_MS, None) == 0 {
            let remove = RAWINPUTDEVICE {
                dwFlags: RIDEV_REMOVE,
                hwndTarget: null_mut(),
                ..registration
            };
            RegisterRawInputDevices(&remove, 1, size_of::<RAWINPUTDEVICE>() as u32);
            DestroyWindow(hwnd);
            let e = "Cannot start recording timer".to_string();
            let _ = sender.send(Err(e.clone()));
            return Err(e);
        }
        let start = Instant::now();
        let mut result = Recording {
            duration_us: 0,
            events: Vec::new(),
            repeats: 0,
            truncated: false,
        };
        let mut held = [false; 2];
        let mut seen = [false; 2];
        let _ = sender.send(Ok(GetCurrentThreadId()));
        let mut msg = MSG::default();
        loop {
            let status = GetMessageW(&mut msg, null_mut(), 0, 0);
            if status <= 0 {
                break;
            }
            if msg.message == WM_TIMER {
                result.truncated = true;
                break;
            }
            if msg.message == WM_INPUT {
                let mut raw = RAWINPUT::default();
                let mut size = size_of::<RAWINPUT>() as u32;
                let got = GetRawInputData(
                    msg.lParam as _,
                    RID_INPUT,
                    (&mut raw as *mut RAWINPUT).cast(),
                    &mut size,
                    size_of::<RAWINPUTHEADER>() as u32,
                );
                if got != u32::MAX
                    && raw.header.dwType == RIM_TYPEKEYBOARD
                    && raw.header.hDevice as usize == device
                {
                    let data = raw.data.keyboard;
                    if let Some((key, down)) = key_for_scan(data.MakeCode, data.Flags) {
                        if record_key_transition(
                            &mut held,
                            &mut seen,
                            &mut result,
                            key,
                            down,
                            start.elapsed().as_micros() as u64,
                        ) {
                            break;
                        }
                    }
                }
                // Foreground WM_INPUT requires default cleanup.
                DefWindowProcW(msg.hwnd, msg.message, msg.wParam, msg.lParam);
            } else {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        result.duration_us = start.elapsed().as_micros() as u64;
        let remove = RAWINPUTDEVICE {
            dwFlags: RIDEV_REMOVE,
            hwndTarget: null_mut(),
            ..registration
        };
        RegisterRawInputDevices(&remove, 1, size_of::<RAWINPUTDEVICE>() as u32);
        DestroyWindow(hwnd);
        Ok(result)
    }

    impl RawInputRecorder {
        pub fn start(&self) -> Result<(), String> {
            let mut session = self.session.lock().map_err(|e| e.to_string())?;
            if session.is_some() {
                return Err("Recording already active or awaiting retrieval".into());
            }
            let (tx, rx) = mpsc::sync_channel(1);
            let finished = Arc::new(Mutex::new(false));
            let worker_finished = Arc::clone(&finished);
            let handle = thread::spawn(move || {
                let result = unsafe { run(tx) };
                // Hold the gate while marking completion so stop cannot post to
                // an ID after this thread has exited and Windows has reused it.
                *worker_finished.lock().unwrap_or_else(|e| e.into_inner()) = true;
                result
            });
            match rx.recv() {
                Ok(Ok(thread_id)) => {
                    *session = Some(Session {
                        thread_id,
                        handle,
                        finished,
                    });
                    Ok(())
                }
                Ok(Err(e)) => {
                    let _ = handle.join();
                    Err(e)
                }
                Err(e) => {
                    let _ = handle.join();
                    Err(e.to_string())
                }
            }
        }
        pub fn stop(&self) -> Result<Recording, String> {
            let session = self
                .session
                .lock()
                .map_err(|e| e.to_string())?
                .take()
                .ok_or("No recording is active")?;
            {
                let finished = session.finished.lock().unwrap_or_else(|e| e.into_inner());
                if !*finished {
                    unsafe {
                        PostThreadMessageW(session.thread_id, WM_QUIT, 0, 0);
                    }
                }
            }
            session
                .handle
                .join()
                .map_err(|_| "Raw Input thread failed".to_string())?
        }
    }
    impl Drop for RawInputRecorder {
        fn drop(&mut self) {
            if let Ok(slot) = self.session.get_mut() {
                if let Some(session) = slot.take() {
                    {
                        let finished = session.finished.lock().unwrap_or_else(|e| e.into_inner());
                        if !*finished {
                            unsafe {
                                PostThreadMessageW(session.thread_id, WM_QUIT, 0, 0);
                            }
                        }
                    }
                    let _ = session.handle.join();
                }
            }
        }
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn recognizes_only_physical_z_x_and_matching_device() {
            assert_eq!(key_for_scan(0x2c, 0), Some(("Z", true)));
            assert_eq!(key_for_scan(0x2d, 1), Some(("X", false)));
            assert_eq!(key_for_scan(0x2c, 2), None);
            assert_eq!(key_for_scan(0x1e, 0), None);
            assert!(matching_path(r"\\?\HID#VID_1CA2&PID_1901&MI_00#ABC"));
            assert!(!matching_path(r"\\?\HID#VID_1CA2&PID_1901&MI_02#ABC"));
        }

        #[test]
        fn records_initial_release_and_filters_repeats_and_duplicate_breaks() {
            let mut held = [false; 2];
            let mut seen = [false; 2];
            let mut result = Recording {
                duration_us: 0,
                events: Vec::new(),
                repeats: 0,
                truncated: false,
            };
            // Key held before start: first break must be recorded, duplicate break ignored.
            assert!(!record_key_transition(
                &mut held,
                &mut seen,
                &mut result,
                "Z",
                false,
                10
            ));
            assert!(!record_key_transition(
                &mut held,
                &mut seen,
                &mut result,
                "Z",
                false,
                20
            ));
            // Normal press, held repeat, and release on Z; plus normal pair on X.
            assert!(!record_key_transition(
                &mut held,
                &mut seen,
                &mut result,
                "Z",
                true,
                30
            ));
            assert!(!record_key_transition(
                &mut held,
                &mut seen,
                &mut result,
                "Z",
                true,
                40
            ));
            assert!(!record_key_transition(
                &mut held,
                &mut seen,
                &mut result,
                "Z",
                false,
                50
            ));
            assert!(!record_key_transition(
                &mut held,
                &mut seen,
                &mut result,
                "X",
                true,
                60
            ));
            assert!(!record_key_transition(
                &mut held,
                &mut seen,
                &mut result,
                "X",
                false,
                70
            ));

            assert_eq!(result.repeats, 1);
            assert_eq!(result.events.len(), 5);
            assert_eq!(
                result
                    .events
                    .iter()
                    .map(|e| (e.key.as_str(), e.down, e.elapsed_us))
                    .collect::<Vec<_>>(),
                vec![
                    ("Z", false, 10),
                    ("Z", true, 30),
                    ("Z", false, 50),
                    ("X", true, 60),
                    ("X", false, 70),
                ]
            );
        }
    }
}
#[cfg(windows)]
mod isolated {
    use super::{windows::RawInputRecorder, Recording};
    use std::{
        io::{BufRead, BufReader, Write},
        os::windows::process::CommandExt,
        process::{Child, ChildStdin, ChildStdout, Command, Stdio},
        sync::Mutex,
    };

    struct Session {
        child: Child,
        stdin: ChildStdin,
        stdout: BufReader<ChildStdout>,
    }
    #[derive(Default)]
    pub struct Recorder {
        session: Mutex<Option<Session>>,
    }

    fn read_line<T: serde::de::DeserializeOwned>(reader: &mut impl BufRead) -> Result<T, String> {
        let mut line = String::new();
        if reader.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
            return Err("Raw Input helper exited unexpectedly".into());
        }
        serde_json::from_str(&line).map_err(|e| e.to_string())
    }

    impl Recorder {
        pub fn start(&self) -> Result<(), String> {
            let mut slot = self.session.lock().map_err(|e| e.to_string())?;
            if slot.is_some() {
                return Err("Recording already active".into());
            }
            let mut child = Command::new(std::env::current_exe().map_err(|e| e.to_string())?)
                .arg("--raw-input-recorder")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .spawn()
                .map_err(|e| e.to_string())?;
            let stdin = child.stdin.take().ok_or("Missing helper input")?;
            let mut stdout = BufReader::new(child.stdout.take().ok_or("Missing helper output")?);
            let ready: Result<(), String> = match read_line(&mut stdout) {
                Ok(value) => value,
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(e);
                }
            };
            if let Err(e) = ready {
                let _ = child.wait();
                return Err(e);
            }
            *slot = Some(Session {
                child,
                stdin,
                stdout,
            });
            Ok(())
        }

        pub fn stop(&self) -> Result<Recording, String> {
            let mut session = self
                .session
                .lock()
                .map_err(|e| e.to_string())?
                .take()
                .ok_or("No recording is active")?;
            let result = writeln!(session.stdin, "stop")
                .map_err(|e| e.to_string())
                .and_then(|()| read_line::<Result<Recording, String>>(&mut session.stdout))
                .and_then(|r| r);
            if result.is_err() {
                let _ = session.child.kill();
            }
            let _ = session.child.wait();
            result
        }
    }
    impl Drop for Recorder {
        fn drop(&mut self) {
            if let Ok(slot) = self.session.get_mut() {
                if let Some(mut session) = slot.take() {
                    let _ = session.child.kill();
                    let _ = session.child.wait();
                }
            }
        }
    }

    pub fn helper() {
        let recorder = RawInputRecorder::default();
        let result = recorder.start();
        let ok = result.is_ok();
        let mut stdout = std::io::stdout().lock();
        let _ = writeln!(
            stdout,
            "{}",
            serde_json::to_string(&result).expect("serializable result")
        );
        let _ = stdout.flush();
        drop(stdout);
        if !ok {
            return;
        }
        let mut input = String::new();
        let _ = std::io::stdin().read_line(&mut input);
        let result = recorder.stop();
        let mut stdout = std::io::stdout().lock();
        let _ = writeln!(
            stdout,
            "{}",
            serde_json::to_string(&result).expect("serializable result")
        );
        let _ = stdout.flush();
    }
}
#[cfg(windows)]
pub use isolated::Recorder;

#[cfg(windows)]
pub fn run_helper() {
    isolated::helper();
}

#[cfg(not(windows))]
#[derive(Default)]
pub struct Recorder;
#[cfg(not(windows))]
impl Recorder {
    pub fn start(&self) -> Result<(), String> {
        Err("Background key recording is only supported on Windows".into())
    }
    pub fn stop(&self) -> Result<Recording, String> {
        Err("Background key recording is only supported on Windows".into())
    }
}
