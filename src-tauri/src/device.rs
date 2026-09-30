//! HID transport and hardware driver.
//!
//! All USB traffic happens on one dedicated I/O thread so the webview never
//! blocks. The thread owns the `HidDevice`, applies state patches to a cached
//! [`KeyboardState`], and emits Tauri events when the UI needs an update.
//!
//! # Hardware notes discovered by probing real hardware
//!
//! Protocol version is `1.0.9`; see `docs/VENDOR-DRIVER.md` for the vendor
//! driver's own definitions, which are treated as authoritative here.
//!
//! * Changing the polling rate makes the vendor HID collection vanish from USB
//!   enumeration for roughly a second. The watchdog notices and reconnects.
//! * Global press/release deadzones (fields of `cmd::DEADZONE`) are
//!   **read-only**, so deadzones are set per key through
//!   `layout::DEAD_PRESS` / `layout::DEAD_RELEASE`, which are layouts **22/23**
//!   (`Layout_DP` / `Layout_DR`). Layouts 6/7 are `Layout_DB2` / `Layout_DB3`,
//!   advanced-key deadzone stages that ship at 2.0/3.0 mm — above the actuation
//!   point, so they are not deadzones.
//! * A register value of `0xFFFF` means "this key has no data for this
//!   register", not a distance. Esc reports it for the rapid-trigger registers.
//! * Configuring Snap Tap (`cmd::SOCD`) silently switches **both** keys of the
//!   pair to Single Mode and does not revert that on clear, so the mode has to
//!   be saved and restored around any Snap Tap edit.
//! * `cmd::LOGO_RGB` is not implemented on this firmware; it is never sent.
//! * `cmd::RAPID_SWITCH` (45) is never sent: it persists nothing and corrupts
//!   the mode of five keys. See `docs/VENDOR-DRIVER.md` §6.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use hidapi::HidApi;

use tauri::{AppHandle, Emitter};
use tauri_plugin_log::log;

use crate::hid::Link;
use crate::keymap;
use crate::protocol as p;
use crate::state::{KeyMode, KeyboardState, Lighting, SavedKeyMode, SnapTap};

pub const EVENT_STATE: &str = "kb://state";
pub const EVENT_TRAVEL: &str = "kb://travel";
pub const EVENT_STATUS: &str = "kb://status";

const WATCHDOG_INTERVAL: Duration = Duration::from_millis(400);
const STREAM_INTERVAL: Duration = Duration::from_millis(16);
const SENSOR_COUNT: usize = 21 * 6;

/// Travel range used when the keyboard does not report a usable one.
///
/// The vendor driver pins `WIN 68 HE PRO` to 0.1-3.4 mm regardless of what the
/// device reports, so these match the model rather than being invented.
const FALLBACK_MIN_TRAVEL_MM: f32 = 0.1;
const FALLBACK_MAX_TRAVEL_MM: f32 = 3.4;

/// Per-key defaults used when the firmware reports no value for a register.
const DEFAULT_ACTUATION_MM: f32 = 2.0;
const DEFAULT_RT_MM: f32 = 0.02;
const DEFAULT_DEADZONE_MM: f32 = 0.2;

/// Millimetres -> micrometres, clamped to a sane 16-bit range.
fn um(mm: f32) -> u16 {
    (mm.clamp(0.0, 65.535) * 1000.0).round() as u16
}

fn mm(value: u16) -> f32 {
    (value as f32 / 1000.0 * 100.0).round() / 100.0
}

/// Interprets a raw register value as a distance, rejecting the firmware's
/// "no data" marker.
///
/// `0xFFFF` comes back for registers a particular key has no value for, so
/// treating it as a distance produces absurd readings (65.535 mm).
fn distance(value: u16) -> Option<u16> {
    (value != u16::MAX).then_some(value)
}

/// Outcome of a Snap Tap read.
///
/// The distinction matters: "no pair configured" is a real answer, while a
/// transport failure means the keyboard stopped answering and the cached state
/// must be left alone rather than wiped.
enum SnapTapRead {
    Absent,
    Found(SnapTap),
    Failed,
}

/// What `apply_snap_tap` did, for the caller to fold into the cached state.
struct SnapTapOutcome {
    /// The pair that is now active, if any.
    active: Option<SnapTap>,
    /// Modes to restore later: the ones captured before the write we just made.
    saved_modes: Vec<SavedKeyMode>,
}

/// Performs a Snap Tap write, keeping the keyboard's key modes intact.
///
/// Writing a pair makes the firmware switch **both** keys to Single Mode, and
/// neither clearing the pair nor moving it to different keys undoes that. Three
/// separate things therefore have to be handled, and getting any of them wrong
/// leaves the user's keyboard in a mode they did not choose:
///
/// * **Modes are captured before the write.** Reading them afterwards would only
///   read back the Single Mode the write just caused.
/// * **Clearing** writes the *same* `key_b` with zeroed values — sending
///   `key_b = 0` is refused and leaves the pair in place — and then puts the
///   saved modes back.
/// * **Moving to a different pair** must also *clear* the old pair. Restoring its
///   modes is not enough: the old pair would stay active on the keyboard, and a
///   later sweep could find it instead of the new one.
///
/// Free-standing rather than a method so the whole sequence is testable without
/// a `Device`.
fn apply_snap_tap(
    link: &mut Link,
    previous: Option<SnapTap>,
    previous_modes: &[SavedKeyMode],
    pair: Option<SnapTap>,
) -> SnapTapOutcome {
    let nothing_to_do = pair.is_none() && previous.is_none();
    if nothing_to_do {
        // Do not put a stray packet on the wire addressed to key 0.
        return SnapTapOutcome {
            active: None,
            saved_modes: Vec::new(),
        };
    }

    let replacing = match (previous, &pair) {
        (Some(old), Some(new)) => (old.key_a, old.key_b) != (new.key_a, new.key_b),
        _ => false,
    };

    if replacing {
        let old = previous.expect("checked above");
        // Retire the old pair completely, then undo the modes it caused.
        write_pair(
            link,
            p::KeyPair {
                key_a: old.key_a as u8,
                key_b: old.key_b as u8,
                ..p::KeyPair::CLEARED
            },
        );
        restore_key_modes(link, previous_modes);
    }

    let Some(new) = pair else {
        let old = previous.expect("checked above");
        // Clearing means writing the *same* second key with zeroed values.
        write_pair(
            link,
            p::KeyPair {
                key_a: old.key_a as u8,
                key_b: old.key_b as u8,
                ..p::KeyPair::CLEARED
            },
        );
        restore_key_modes(link, previous_modes);
        return SnapTapOutcome {
            active: None,
            saved_modes: Vec::new(),
        };
    };

    // Capture the modes this write is about to overwrite.
    let saved_modes = read_key_modes(link, &[new.key_a, new.key_b]);
    write_pair(
        link,
        p::KeyPair {
            key_a: new.key_a as u8,
            key_b: new.key_b as u8,
            value_a: new.value_a,
            value_b: new.value_b,
            mode: new.mode,
            key_type: new.key_type,
            delay: new.delay_ms,
        },
    );

    let active = (!new.is_inactive()).then_some(new);
    SnapTapOutcome {
        active,
        saved_modes: if active.is_some() {
            saved_modes
        } else {
            Vec::new()
        },
    }
}

/// Writes a Snap Tap pair and waits for the acknowledgement.
///
/// `send` is not enough here. The firmware applies the pair's mode change while
/// handling the request, and a fire-and-forget write leaves its reply unread:
/// the mode registers then keep reporting the pre-write value on that handle,
/// and nothing confirms the write was accepted at all. Reading the reply is what
/// makes the side effect observable and gives us a success signal.
fn write_pair(link: &mut Link, pair: p::KeyPair) {
    let packet = p::pair_packet(true, p::cmd::SOCD, pair);
    match link.query(packet) {
        Some(reply) if reply.is_fail() => {
            log::warn!("Snap Tap write refused by firmware");
        }
        Some(_) => {}
        None => log::warn!("Snap Tap write got no reply"),
    }
}

/// Reads the current mode of each key, skipping any that do not answer.
fn read_key_modes(link: &mut Link, ids: &[u16]) -> Vec<SavedKeyMode> {
    let values = read_layout(link, p::layout::MODE, ids);
    ids.iter()
        .filter_map(|id| {
            values.get(id).copied().map(|mode| SavedKeyMode {
                key_id: *id,
                mode: KeyMode::from_wire(mode),
            })
        })
        .collect()
}

/// Writes previously captured key modes back to the keyboard.
fn restore_key_modes(link: &mut Link, modes: &[SavedKeyMode]) {
    for saved in modes {
        link.send(p::key_layout_packet(
            true,
            p::layout::MODE,
            &[saved.key_id],
            &[saved.mode.wire_value()],
        ));
    }
}

/// Reads the Snap Tap pair stored under `key_a`.
///
/// A read must name the key it wants: the firmware addresses the pair by its
/// first key, and `key_a = 0` always answers empty even when a pair exists.
fn read_snap_tap(link: &mut Link, key_a: u8) -> Result<SnapTap, ()> {
    let packet = p::pair_packet(
        false,
        p::cmd::SOCD,
        p::KeyPair {
            key_a,
            ..p::KeyPair::CLEARED
        },
    );
    let reply = link.query(packet).ok_or(())?;
    if reply.is_fail() {
        return Err(());
    }
    if !reply.matches(p::cmd::SOCD) {
        return Err(());
    }
    p::parse_pair(&reply.0)
        .map(|parsed| SnapTap {
            key_a: parsed.key_a as u16,
            key_b: parsed.key_b as u16,
            value_a: parsed.value_a,
            value_b: parsed.value_b,
            mode: parsed.mode,
            key_type: parsed.key_type,
            delay_ms: parsed.delay,
        })
        .ok_or(())
}

/// Looks for a configured Snap Tap pair by sweeping every key.
///
/// Bails out on the first transport failure. Without that, an unreachable
/// keyboard would cost one query timeout per key — about 17 seconds for 68 keys.
fn find_snap_tap(link: &mut Link) -> Result<Option<SnapTap>, ()> {
    for id in keymap::all_ids() {
        match read_snap_tap(link, id as u8) {
            Ok(found) if !found.is_inactive() => return Ok(Some(found)),
            Ok(_) => {}
            Err(()) => return Err(()),
        }
    }
    Ok(None)
}

/// Reads the current Snap Tap configuration, reusing the known address when there
/// is one.
///
/// Must be called **without** the state write lock held: the sweep performs up
/// to 68 blocking queries and holding the lock would freeze the UI for the
/// duration.
fn probe_snap_tap(link: &mut Link, known: Option<u16>) -> SnapTapRead {
    let result = match known {
        Some(key) => read_snap_tap(link, key as u8).map(|found| {
            if found.is_inactive() {
                None
            } else {
                Some(found)
            }
        }),
        None => find_snap_tap(link),
    };
    match result {
        Ok(Some(found)) => SnapTapRead::Found(found),
        Ok(None) => SnapTapRead::Absent,
        Err(()) => SnapTapRead::Failed,
    }
}

fn hex(rgb: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", rgb[2], rgb[1], rgb[0])
}

fn parse_hex(value: &str) -> [u8; 3] {
    let clean = value.trim().trim_start_matches('#');
    if clean.len() != 6 {
        return [255, 0, 0];
    }
    let part = |i: usize| u8::from_str_radix(&clean[i..i + 2], 16).unwrap_or(0);
    [part(0), part(2), part(4)]
}

// ----------------------------------------------------------------- jobs

/// A unit of work for the I/O thread. Each carries a one-shot reply channel.
pub enum Job {
    /// Hand the worker its `AppHandle` and perform the first connection.
    Attach(AppHandle, Sender<()>),
    Refresh(Sender<()>),
    Reconnect(Sender<()>),
    /// Set the global actuation point in millimetres.
    GlobalActuation(f32, Sender<()>),
    /// Apply a patch to the given keys.
    Keys {
        ids: Vec<u16>,
        patch: KeyPatch,
        reply: Sender<()>,
    },
    Lighting(Lighting, Sender<()>),

    /// Configure or clear the Snap Tap pair. `None` clears it.
    SnapTap(Option<SnapTap>, Sender<()>),

    /// Writes the rate, then forces a reconnect because USB re-enumerates.
    PollingRate(u8, Sender<()>),
    Profile(u8, Sender<()>),
    OsMode {
        mac: bool,
        reply: Sender<()>,
    },
    Streaming(bool, Sender<()>),
}

#[derive(Debug, Clone, Copy)]
pub enum KeyPatch {
    /// Custom actuation point, switching the key to `Single` mode.
    Actuation(f32),
    /// Rapid trigger on/off with sensitivities in millimetres.
    RapidTrigger {
        on: bool,
        press: f32,
        release: f32,
    },
    Deadzone {
        press: f32,
        release: f32,
    },
    /// Back to inheriting the global actuation point.
    Reset,
}

impl KeyPatch {
    fn mode(self) -> KeyMode {
        match self {
            KeyPatch::Actuation(_) => KeyMode::Single,
            KeyPatch::RapidTrigger { on: true, .. } => KeyMode::RapidTrigger,
            _ => KeyMode::Global,
        }
    }
}

// ------------------------------------------------------------- device

pub struct Device {
    state: Arc<RwLock<KeyboardState>>,
    jobs: Sender<Job>,
}

impl Device {
    pub fn new() -> Arc<Self> {
        let (jobs, rx) = mpsc::channel::<Job>();
        let streaming = Arc::new(AtomicBool::new(false));
        let state = Arc::new(RwLock::new(KeyboardState::default()));

        let device = Arc::new(Self {
            state: state.clone(),
            jobs,
        });

        let worker = Worker {
            app: RwLock::new(None),
            state,
            stream_flag: streaming,
        };
        thread::Builder::new()
            .name("aula-io".into())
            .spawn(move || worker.run(rx))
            .expect("spawn io thread");

        device
    }

    pub fn attach(&self, app: AppHandle) {
        self.dispatch(|tx| Job::Attach(app, tx));
    }

    pub fn state(&self) -> KeyboardState {
        self.state.read().expect("state lock").clone()
    }

    fn send(&self, job: Job) {
        let _ = self.jobs.send(job);
    }

    /// Fire-and-forget job.
    pub fn dispatch(&self, make: impl FnOnce(Sender<()>) -> Job) {
        let (tx, _rx) = mpsc::channel();
        self.send(make(tx));
    }

    /// Run a job and block until the I/O thread has finished it.
    pub fn request(&self, make: impl FnOnce(Sender<()>) -> Job) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.send(make(tx));
        rx.recv_timeout(Duration::from_secs(6))
            .map_err(|_| "device timeout".to_string())
    }
}

// ------------------------------------------------------------- worker

struct Worker {
    app: RwLock<Option<AppHandle>>,
    state: Arc<RwLock<KeyboardState>>,
    stream_flag: Arc<AtomicBool>,
}

impl Worker {
    fn run(self, rx: Receiver<Job>) {
        let mut api = match HidApi::new() {
            Ok(api) => api,
            Err(err) => {
                log::error!("hidapi init failed: {err}");
                self.set_error(format!("HID init failed: {err}"));
                // Drain jobs so callers are not blocked forever.
                while let Ok(job) = rx.recv() {
                    reply(job);
                }
                return;
            }
        };

        let mut link = Link::default();
        let mut next_watchdog = Instant::now();
        let mut next_stream = Instant::now();
        let mut sensors = vec![0u16; SENSOR_COUNT];

        loop {
            let now = Instant::now();
            let mut deadline = next_watchdog;
            if self.stream_flag.load(Ordering::Relaxed) {
                deadline = deadline.min(next_stream);
            }

            match rx.recv_timeout(deadline.saturating_duration_since(now)) {
                Ok(job) => {
                    if !self.handle(&mut link, &mut api, job, &mut sensors) {
                        break;
                    }
                    next_watchdog = Instant::now();
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }

            let now = Instant::now();
            if now >= next_watchdog {
                next_watchdog = now + WATCHDOG_INTERVAL;
                if self.watchdog(&mut link, &mut api) {
                    self.publish();
                }
            }
            if self.stream_flag.load(Ordering::Relaxed) && Instant::now() >= next_stream {
                next_stream = Instant::now() + STREAM_INTERVAL;
                self.sample_sensors(&mut link, &mut sensors);
            }
        }
    }

    fn app(&self) -> Option<AppHandle> {
        self.app.read().ok().and_then(|a| a.clone())
    }

    fn set_error(&self, message: String) {
        if let Ok(mut state) = self.state.write() {
            state.last_error = Some(message.clone());
            state.connected = false;
        }
        self.emit_status("error", Some(message));
    }

    fn emit_status(&self, kind: &str, detail: Option<String>) {
        if let Some(app) = self.app() {
            let _ = app.emit(EVENT_STATUS, (kind, detail));
        }
    }

    /// Emit the cached state to the webview.
    pub fn publish(&self) {
        if let Some(app) = self.app() {
            let state = self.state.read().expect("state lock").clone();
            let _ = app.emit(EVENT_STATE, state);
        }
    }

    /// Returns `false` to stop the worker loop.
    fn handle(&self, link: &mut Link, api: &mut HidApi, job: Job, sensors: &mut [u16]) -> bool {
        if !link.is_open() && !link.open(api) {
            self.mark_disconnected("keyboard not found");
            reply(job);
            return true;
        }

        match job {
            Job::Attach(app, reply) => {
                if let Ok(mut slot) = self.app.write() {
                    *slot = Some(app);
                }
                link.close();
                self.watchdog(link, api);
                let _ = reply.send(());
                self.publish();
            }
            Job::Reconnect(reply) => {
                link.close();
                self.watchdog(link, api);
                let _ = reply.send(());
            }
            Job::Refresh(reply) => {
                self.refresh(link);
                let _ = reply.send(());
                self.publish();
            }
            Job::GlobalActuation(value, reply) => {
                self.write_global_actuation(link, value);
                let _ = reply.send(());
                self.publish();
            }
            Job::Keys { ids, patch, reply } => {
                self.write_keys(link, &ids, patch);
                let _ = reply.send(());
                self.publish();
            }
            Job::Lighting(value, reply) => {
                self.write_lighting(link, value);
                let _ = reply.send(());
                self.publish();
            }
            Job::SnapTap(pair, reply) => {
                self.write_snap_tap(link, pair);
                let _ = reply.send(());
                // The firmware applies the Snap Tap mode change lazily: reads on this
                // handle keep returning the pre-write mode until it is re-opened. Drop
                // the handle so the watchdog reconnects and the UI shows the real
                // modes instead of stale ones.
                link.close();
                self.mark_reconnecting();
            }
            Job::PollingRate(index, reply) => {
                self.write_polling_rate(link, index);
                let _ = reply.send(());
                // The collection drops out of enumeration right after this
                // write; drop the handle so the watchdog re-opens it.
                link.close();
                self.mark_reconnecting();
            }
            Job::Profile(index, reply) => {
                link.send(p::cmd_packet(p::order::PROFILE_ID, Some(index)));
                if let Ok(mut state) = self.state.write() {
                    state.profile = index;
                }
                let _ = reply.send(());
                self.refresh(link);
                self.publish();
            }
            Job::OsMode { mac, reply } => {
                let cmd = if mac {
                    p::order::SET_SYS_MAC
                } else {
                    p::order::SET_SYS_WIN
                };
                link.send(p::cmd_packet(cmd, Some(1)));
                if let Ok(mut state) = self.state.write() {
                    state.mac_layout = mac;
                }
                let _ = reply.send(());
                self.publish();
            }
            Job::Streaming(on, reply) => {
                self.stream_flag.store(on, Ordering::Relaxed);
                if !on {
                    sensors.iter_mut().for_each(|v| *v = 0);
                    if let Some(app) = self.app() {
                        let _ = app.emit(EVENT_TRAVEL, vec![0u16; SENSOR_COUNT]);
                    }
                }
                let _ = reply.send(());
            }
        }
        true
    }

    /// Keep the link alive and pick the device back up after re-plugging.
    /// Returns `true` when anything changed.
    fn watchdog(&self, link: &mut Link, api: &mut HidApi) -> bool {
        let present = Link::is_present(api);
        let open = link.is_open();

        match (present, open) {
            (true, false) => {
                log::info!("device appeared, opening");
                if link.open(api) {
                    self.mark_connected();
                    self.refresh(link);
                    self.publish();
                    return true;
                }
                false
            }
            (true, true) => {
                if self.state().connected {
                    false
                } else {
                    self.mark_connected();
                    self.refresh(link);
                    self.publish();
                    true
                }
            }
            (false, true) => {
                log::info!("device disappeared, dropping handle");
                link.close();
                self.mark_disconnected("device disconnected");
                true
            }
            (false, false) => {
                if self.state().reconnecting || self.state().connected {
                    self.mark_disconnected("reconnecting�");
                    self.publish();
                    true
                } else {
                    false
                }
            }
        }
    }

    fn state(&self) -> KeyboardState {
        self.state.read().expect("state lock").clone()
    }

    fn mark_connected(&self) {
        if let Ok(mut state) = self.state.write() {
            state.connected = true;
            state.reconnecting = false;
            state.last_error = None;
        }
        self.emit_status("connected", None);
    }

    fn mark_disconnected(&self, reason: &str) {
        let changed = self.state().connected || self.state().reconnecting;
        if let Ok(mut state) = self.state.write() {
            state.connected = false;
            state.reconnecting = false;
            state.last_error = Some(reason.to_string());
        }
        if changed {
            self.emit_status("disconnected", Some(reason.to_string()));
        }
    }

    fn mark_reconnecting(&self) {
        if let Ok(mut state) = self.state.write() {
            state.connected = false;
            state.reconnecting = true;
        }
        self.emit_status("reconnecting", None);
        self.publish();
    }

    // ------------------------------------------------------------ reads

    fn refresh(&self, link: &mut Link) {
        // Probe Snap Tap *before* taking the state write lock. The sweep can cost
        // one query timeout per key, and `refresh` holds the lock for its whole
        // body, so doing it inside would block every state read for seconds.
        let known_pair = self
            .state
            .read()
            .ok()
            .and_then(|s| s.snap_tap.as_ref().map(|p| p.key_a));
        let snap_tap = probe_snap_tap(link, known_pair);

        let Some(mut state) = self.state.write().ok() else {
            return;
        };
        state.connected = true;
        state.reconnecting = false;
        state.last_error = None;

        // Single-value commands echo their id in byte 5, which is what tells a
        // fresh reply apart from a stale packet still sitting in the buffer.
        if let Some(r) = link.query_order(p::order::QUERY_NAME) {
            let name = r.name();
            if !name.is_empty() {
                state.device_name = name;
            }
        }
        if let Some(r) = link.query_order(p::order::VERSION) {
            state.firmware = r.firmware();
        }
        if let Some(r) = link.query_order(p::order::QUERY_PRECISION) {
            // The vendor decodes three separate values from this reply
            // (`docs/VENDOR-DRIVER.md` §7): resolution at byte 6, then
            // minimum and maximum travel as 16-bit little-endian pairs at
            // bytes 7..8 and 9..10. Earlier revisions only trusted these inside
            // hard-coded ranges, which silently kept stale values on screen if a
            // future firmware reported something else.
            let (step_um, min_um, max_um) = r.precision();
            if let Some(step_um) = distance(step_um) {
                if step_um > 0 {
                    state.step = mm(step_um);
                }
            }
            // Keep a pair only if both halves are present and physically
            // sensible: 0 means "not reported", and min >= max would invert
            // every slider.
            match (distance(min_um), distance(max_um)) {
                (Some(min_um), Some(max_um)) if 0 < min_um && min_um < max_um => {
                    state.min_travel = mm(min_um);
                    state.max_travel = mm(max_um);
                }
                _ => {
                    // Fall back to what this model is known to support rather
                    // than leaving nonsense in the UI.
                    state.min_travel = FALLBACK_MIN_TRAVEL_MM;
                    state.max_travel = FALLBACK_MAX_TRAVEL_MM;
                }
            }
        }
        if let Some(r) = link.query_order(p::order::POLLING_RATE) {
            state.polling_rate = r.value();
        }
        if let Some(r) = link.query_order(p::order::PROFILE_ID) {
            state.profile = r.value().min(3);
        }
        if let Some(r) = link.query_order(p::order::QUERY_SYS_WIN) {
            state.mac_layout = r.value() == 0;
        }
        if let Some(r) = link.query(p::deadzone_packet(false, 0)) {
            if r.matches(p::cmd::DEADZONE) {
                let actuation = r.actuation_um();
                if actuation > 0 {
                    state.global_actuation = mm(actuation);
                }
                state.global_press_deadzone = mm(u16::from_le_bytes([r.0[9], r.0[10]]));
                state.global_release_deadzone = mm(u16::from_le_bytes([r.0[11], r.0[12]]));
            }
        }
        let rgb_query = p::rgb_packet(false, &[[255, 0, 0]; 7], false, false, false, 0, 0, 0, 0, 0);
        if let Some(r) = link.query(rgb_query) {
            if r.matches(p::cmd::RGB) {
                let bitmap = r.rgb_bitmap();
                let colors = r.rgb_colors().map(hex);
                state.lighting = Lighting {
                    enabled: bitmap & 1 != 0,
                    reversed: bitmap & 2 != 0,
                    super_response: bitmap & 0x10 != 0,
                    brightness: r.rgb_brightness().min(4),
                    effect: r.rgb_effect(),
                    speed: r.rgb_speed().min(4),
                    sleep_minutes: r.rgb_sleep(),
                    static_effect: r.rgb_static(),
                    colors,
                };
            } else {
                log::warn!("RGB query rejected by firmware");
            }
        }

        let ids = keymap::all_ids();
        for (layout_id, apply) in [
            (p::layout::MODE, Mode),
            (p::layout::ACTUATION, Actuation),
            (p::layout::RT_PRESS, RtPress),
            (p::layout::RT_RELEASE, RtRelease),
            (p::layout::DEAD_PRESS, PressDeadzone),
            (p::layout::DEAD_RELEASE, ReleaseDeadzone),
        ] {
            let values = read_layout(link, layout_id, &ids);
            for id in &ids {
                let entry = state.keys.entry(*id).or_default();
                match apply {
                    // The mode field is a bitmap, not a distance.
                    Mode => {
                        if let Some(mode) = values.get(id).copied() {
                            entry.mode = KeyMode::from_wire(mode);
                        }
                    }
                    _ => {
                        // `0xFFFF` is the firmware's "this key has no data for
                        // this register" marker, not a distance. Esc reports it
                        // for the rapid-trigger registers, so without this guard
                        // the UI would show 65.535 mm for that key. Reset to the
                        // default rather than skipping, otherwise a key that
                        // *becomes* empty keeps a stale value forever.
                        let um = values.get(id).copied().and_then(distance);
                        match apply {
                            Actuation => {
                                entry.actuation = um.map(mm).unwrap_or(DEFAULT_ACTUATION_MM)
                            }
                            RtPress => entry.rt_press = um.map(mm).unwrap_or(DEFAULT_RT_MM),
                            RtRelease => entry.rt_release = um.map(mm).unwrap_or(DEFAULT_RT_MM),
                            PressDeadzone => {
                                entry.press_deadzone = um.map(mm).unwrap_or(DEFAULT_DEADZONE_MM)
                            }
                            ReleaseDeadzone => {
                                entry.release_deadzone = um.map(mm).unwrap_or(DEFAULT_DEADZONE_MM)
                            }
                            Mode => unreachable!("handled above"),
                        }
                    }
                }
            }
        }

        // A transport failure leaves the cached pair alone: wiping it because the
        // keyboard stopped answering would make Snap Tap look disabled when it is
        // not. `Absent` does clear it, which is what makes an externally cleared
        // pair disappear from the UI instead of sticking forever.
        match snap_tap {
            SnapTapRead::Absent => state.snap_tap = None,
            SnapTapRead::Found(found) => state.snap_tap = Some(found),
            SnapTapRead::Failed => log::warn!("Snap Tap read failed, keeping cached value"),
        }
    }

    // ----------------------------------------------------------- writes

    /// Configures or clears the Snap Tap pair.
    fn write_snap_tap(&self, link: &mut Link, pair: Option<SnapTap>) {
        let (previous, saved_modes) = match self.state.read() {
            Ok(state) => (state.snap_tap, state.snap_tap_saved_modes.clone()),
            Err(_) => (None, Vec::new()),
        };
        let outcome = apply_snap_tap(link, previous, &saved_modes, pair);
        if let Ok(mut state) = self.state.write() {
            state.snap_tap = outcome.active;
            state.snap_tap_saved_modes = outcome.saved_modes;
        }
    }

    fn write_global_actuation(&self, link: &mut Link, value: f32) {
        let clamped = value.clamp(0.1, 3.4);
        link.send(p::deadzone_packet(true, um(clamped)));
        if let Ok(mut state) = self.state.write() {
            state.global_actuation = clamped;
        }
    }

    fn write_keys(&self, link: &mut Link, ids: &[u16], patch: KeyPatch) {
        let target_mode = patch.mode().wire_value();

        for chunk in ids.chunks(p::cmd::MAX_KEYS_PER_PACKET) {
            match patch {
                KeyPatch::Actuation(mm) => {
                    let values = vec![um(mm); chunk.len()];
                    link.send(p::key_layout_packet(
                        true,
                        p::layout::ACTUATION,
                        chunk,
                        &values,
                    ));
                }
                KeyPatch::RapidTrigger { press, release, .. } => {
                    link.send(p::key_layout_packet(
                        true,
                        p::layout::RT_PRESS,
                        chunk,
                        &vec![um(press); chunk.len()],
                    ));
                    link.send(p::key_layout_packet(
                        true,
                        p::layout::RT_RELEASE,
                        chunk,
                        &vec![um(release); chunk.len()],
                    ));
                }
                KeyPatch::Deadzone { press, release } => {
                    // Layouts 22/23 are the vendor's `Layout_DP` / `Layout_DR`,
                    // the real per-key dead press and dead release. Layouts 6/7
                    // are `Layout_DB2` / `Layout_DB3`, advanced-key deadzone
                    // stages that ship at 2.0/3.0 mm — above the actuation point,
                    // so writing "deadzones" there made keys unusable.
                    link.send(p::key_layout_packet(
                        true,
                        p::layout::DEAD_PRESS,
                        chunk,
                        &vec![um(press); chunk.len()],
                    ));
                    link.send(p::key_layout_packet(
                        true,
                        p::layout::DEAD_RELEASE,
                        chunk,
                        &vec![um(release); chunk.len()],
                    ));
                }
                // Reset only needs the mode nibble cleared.
                KeyPatch::Reset => {}
            }
            link.send(p::key_layout_packet(
                true,
                p::layout::MODE,
                chunk,
                &vec![target_mode; chunk.len()],
            ));
        }

        if let Ok(mut state) = self.state.write() {
            for id in ids {
                let entry = state.keys.entry(*id).or_default();
                match patch {
                    KeyPatch::Actuation(mm) => {
                        entry.mode = KeyMode::Single;
                        entry.actuation = mm;
                    }
                    KeyPatch::RapidTrigger { on, press, release } => {
                        entry.mode = if on {
                            KeyMode::RapidTrigger
                        } else {
                            KeyMode::Global
                        };
                        entry.rt_press = press;
                        entry.rt_release = release;
                    }
                    KeyPatch::Deadzone { press, release } => {
                        entry.press_deadzone = press;
                        entry.release_deadzone = release;
                    }
                    KeyPatch::Reset => entry.mode = KeyMode::Global,
                }
            }
        }
    }

    fn write_lighting(&self, link: &mut Link, value: Lighting) {
        let colors: Vec<[u8; 3]> = value.colors.iter().map(|c| parse_hex(c)).collect();
        link.send(p::rgb_packet(
            true,
            &colors,
            value.enabled,
            value.reversed,
            value.super_response,
            value.brightness.min(4),
            value.effect,
            value.speed.min(4),
            value.sleep_minutes,
            value.static_effect,
        ));
        if let Ok(mut state) = self.state.write() {
            state.lighting = value;
        }
    }

    fn write_polling_rate(&self, link: &mut Link, index: u8) {
        link.send(p::cmd_packet(p::order::POLLING_RATE, Some(index)));
    }

    // ------------------------------------------------------ sensor stream

    fn sample_sensors(&self, link: &mut Link, sensors: &mut [u16]) {
        let mut frame = vec![0u16; SENSOR_COUNT];
        for half in 1..=2u8 {
            let Some(raw) = link.query_multi(p::realtime_travel_packet(half), 192) else {
                continue;
            };
            // Verified layout: 6-byte preamble, then 63 little-endian u16
            // values covering three sensor rows.
            let base_row = if half == 1 { 1 } else { 4 };
            for value in 0..63usize {
                let at = 6 + value * 2;
                if at + 1 >= raw.len() {
                    break;
                }
                let row = base_row + (value / 21) as u8;
                let index = row as usize * 21 + (value % 21);
                if index < SENSOR_COUNT {
                    frame[index] = u16::from_le_bytes([raw[at], raw[at + 1]]);
                }
            }
        }
        sensors.copy_from_slice(&frame);

        if let Some(app) = self.app() {
            let _ = app.emit(EVENT_TRAVEL, &frame);
        }
    }
}

#[derive(Clone, Copy)]
enum Field {
    Mode,
    Actuation,
    RtPress,
    RtRelease,
    PressDeadzone,
    ReleaseDeadzone,
}

use Field::*;

fn read_layout(link: &mut Link, layout_id: u8, ids: &[u16]) -> HashMap<u16, u16> {
    let mut out = HashMap::new();
    for chunk in ids.chunks(p::cmd::MAX_KEYS_PER_PACKET) {
        let zeros = vec![0u16; chunk.len()];
        let Some(r) = link.query(p::key_layout_packet(false, layout_id, chunk, &zeros)) else {
            continue;
        };
        if !r.matches(p::cmd::KEY_LAYOUT) {
            continue;
        }
        for (id, value) in r.key_values(chunk.len()) {
            out.insert(id, value);
        }
    }
    out
}

fn reply(job: Job) {
    match job {
        Job::Attach(_, tx)
        | Job::Refresh(tx)
        | Job::Reconnect(tx)
        | Job::GlobalActuation(_, tx)
        | Job::Keys { reply: tx, .. }
        | Job::Lighting(_, tx)
        | Job::SnapTap(_, tx)
        | Job::PollingRate(_, tx)
        | Job::Profile(_, tx)
        | Job::Streaming(_, tx)
        | Job::OsMode { reply: tx, .. } => {
            let _ = tx.send(());
        }
    }
}

/// Unit tests that need no hardware.
///
/// Kept separate from [`hardware`] so a plain `cargo test` is hermetic.
#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn rejects_the_firmware_no_data_marker() {
        assert_eq!(distance(u16::MAX), None, "0xFFFF must not be a distance");
        assert_eq!(distance(0), Some(0));
        assert_eq!(distance(3400), Some(3400));
    }

    #[test]
    fn no_data_marker_is_why_the_guard_exists() {
        // Read as a distance, 0xFFFF renders as 65.54 mm — which is what the UI
        // used to display for Esc's rapid-trigger settings.
        assert!((mm(u16::MAX) - 65.54).abs() < 0.001);
        assert_eq!(distance(u16::MAX).map(mm), None);
    }

    #[test]
    fn per_key_deadzones_use_the_vendor_layouts() {
        // Layouts 6/7 are `Layout_DB2`/`Layout_DB3` and ship at 2.0/3.0 mm,
        // which is above the actuation point. The real dead press and dead
        // release registers are 22/23, confirmed writable on hardware.
        assert_eq!(p::layout::DEAD_PRESS, 22);
        assert_eq!(p::layout::DEAD_RELEASE, 23);
        assert_ne!(p::layout::DEAD_PRESS, p::layout::PRESS_DEADZONE);
        assert_ne!(p::layout::DEAD_RELEASE, p::layout::RELEASE_DEADZONE);
    }

    #[test]
    fn micrometre_conversion_round_trips() {
        for mm_value in [0.0f32, 0.02, 0.1, 0.2, 0.35, 2.0, 3.4] {
            assert_eq!(mm(um(mm_value)), mm_value, "round trip for {mm_value} mm");
        }
    }

    #[test]
    fn saved_key_modes_are_not_serialised_to_the_frontend() {
        // Internal bookkeeping: the UI has no use for it, and shipping it would
        // invite the frontend to treat it as state it can edit.
        let state = KeyboardState {
            snap_tap_saved_modes: vec![SavedKeyMode {
                key_id: 4,
                mode: KeyMode::Global,
            }],
            ..KeyboardState::default()
        };
        let json = serde_json::to_value(&state).expect("serialise");
        assert!(
            json.get("snap_tap_saved_modes").is_none(),
            "snap_tap_saved_modes must stay out of the IPC payload"
        );
    }

    #[test]
    fn clearing_needs_a_previous_pair_to_clear() {
        // `write_snap_tap` returns early in this case, so no packet addressed to
        // key 0 ever goes out. Pinned here because the guard is a silent `return`.
        assert!(KeyboardState::default().snap_tap.is_none());
    }
}

/// Tests that talk to real hardware.
///
/// Every test is `#[ignore]`d, so `cargo test` stays hermetic. Run them
/// explicitly with:
///
/// ```sh
/// cargo test --manifest-path src-tauri/Cargo.toml --lib -- --ignored hardware
/// ```
///
/// There is no environment-variable gate. An earlier version of this file
/// documented `AULA_HW_TESTS=1` as if the code checked it, but nothing ever read
/// it — the real gate is `--ignored`.
///
/// Two safety properties, both of which cost real damage when they were missing:
///
/// * Tests are serialised by [`HW_LOCK`], because they share one physical
///   device and the default harness would interleave their replies.
/// * Tests restore everything they change. There is no automated check for this,
///   so after adding a test confirm it yourself with `aula-probe state` before
///   and after a run — the output must be identical. Two tests got this wrong
///   during development and left the user's keyboard with the wrong key modes.
#[cfg(test)]
mod hardware {
    use super::*;
    use std::sync::Mutex;

    /// Serialises hardware tests.
    ///
    /// Every test here opens its own handle to the *same* physical HID device.
    /// The default test harness runs them in parallel, so replies get
    /// interleaved between tests and assertions fail for reasons that have
    /// nothing to do with the code under test. Holding this lock for the whole
    /// test body fixes that; the guard is returned alongside the link.
    static HW_LOCK: Mutex<()> = Mutex::new(());

    type Guard = std::sync::MutexGuard<'static, ()>;

    /// Opens the vendor HID collection, taking the hardware lock for the
    /// caller's lifetime. Always bind the returned guard.
    fn link() -> (HidApi, Link, Guard) {
        let guard = HW_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut api = HidApi::new().expect("hidapi");
        let mut link = Link::default();
        assert!(
            link.open(&mut api),
            "Aula keyboard not found — is it plugged in?"
        );
        (api, link, guard)
    }

    fn query_order(link: &mut Link, cmd: u8) -> u8 {
        link.query(p::cmd_packet(cmd, None))
            .filter(|r| r.matches_order(cmd))
            .unwrap_or_else(|| panic!("no valid reply for order command {cmd}"))
            .value()
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard"]
    fn hardware_reads_identity_and_limits() {
        let (mut api, mut link, _guard) = link();
        assert!(Link::is_present(&mut api));

        let name = link
            .query(p::cmd_packet(p::order::QUERY_NAME, None))
            .filter(|r| r.matches_order(p::order::QUERY_NAME))
            .expect("name reply")
            .name();
        assert!(!name.is_empty(), "device name should not be empty");

        let (step_um, min_um, max_um) = link
            .query(p::cmd_packet(p::order::QUERY_PRECISION, None))
            .filter(|r| r.matches_order(p::order::QUERY_PRECISION))
            .expect("precision reply")
            .precision();
        assert!((1..=100).contains(&step_um), "implausible step {step_um}um");
        assert!(min_um >= step_um, "min travel below the resolution step");
        assert!(max_um > min_um, "max travel must exceed min travel");

        let polling = query_order(&mut link, p::order::POLLING_RATE);
        assert!(polling <= 4, "unexpected polling index {polling}");

        let profile = query_order(&mut link, p::order::PROFILE_ID);
        assert!(profile <= 3, "unexpected profile id {profile}");
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard, writes to the keyboard"]
    fn hardware_reads_are_not_poisoned_by_unread_write_replies() {
        // Write paths use fire-and-forget `send` and never read the reply, but the
        // firmware answers writes. Those replies sit in the input buffer, so the
        // next read can consume one instead of its own answer.
        //
        // This is worst for two `KEY_LAYOUT` operations: the write reply and the
        // read reply carry the *same* command id, so id validation cannot tell
        // them apart and the read silently returns the written values.
        let (_api, mut link, _guard) = link();

        // Baseline: dead press for key 4 is 200 um.
        assert_eq!(
            read_layout(&mut link, p::layout::DEAD_PRESS, &[0x04])
                .get(&4)
                .copied()
                .unwrap_or(0),
            200,
            "dead press baseline"
        );

        // A fire-and-forget write of a *different* layout. Its reply, if left in
        // the buffer, gets handed to the next read.
        link.send(p::key_layout_packet(
            true,
            p::layout::MODE,
            &[0x04],
            &[KeyMode::Global.wire_value()],
        ));
        std::thread::sleep(std::time::Duration::from_millis(80));

        // If the write reply leaked through, this reads the mode value (0) as a
        // distance instead of the real dead press value (200).
        let after = read_layout(&mut link, p::layout::DEAD_PRESS, &[0x04])
            .get(&4)
            .copied()
            .unwrap_or(0);
        assert_eq!(
            after, 200,
            "dead press read consumed the reply to the preceding write"
        );
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard, writes to the keyboard"]
    fn hardware_reads_every_key() {
        let (_api, mut link, _guard) = link();
        let ids = keymap::all_ids();
        for (name, layout_id) in [
            ("MODE", p::layout::MODE),
            ("ACTUATION", p::layout::ACTUATION),
            ("RT_PRESS", p::layout::RT_PRESS),
            ("RT_RELEASE", p::layout::RT_RELEASE),
        ] {
            let values = read_layout(&mut link, layout_id, &ids);
            assert_eq!(
                values.len(),
                ids.len(),
                "{name}: only {} of 68 keys answered",
                values.len()
            );
            for (id, value) in &values {
                // `0xFFFF` is the firmware's "no data for this key" marker, not a
                // distance. Esc reads back that way because it has no
                // rapid-trigger data of its own.
                if *value == u16::MAX {
                    continue;
                }
                assert!(
                    *value <= 3400,
                    "{name}: key {id} implausible value {value}um"
                );
            }
        }
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard, writes to the keyboard"]
    fn hardware_writes_and_restores_actuation() {
        let (_api, mut link, _guard) = link();
        let ids = keymap::all_ids();
        let before = read_layout(&mut link, p::layout::ACTUATION, &ids);
        assert!(!before.is_empty());

        let probe_id = ids[0];
        let original = before[&probe_id];

        for target in [800u16, 1200, 2000] {
            link.send(p::key_layout_packet(
                true,
                p::layout::ACTUATION,
                &[probe_id],
                &[target],
            ));
            let after = read_layout(&mut link, p::layout::ACTUATION, &[probe_id]);
            assert_eq!(
                after.get(&probe_id),
                Some(&target),
                "actuation {target}um did not stick"
            );
        }

        link.send(p::key_layout_packet(
            true,
            p::layout::ACTUATION,
            &[probe_id],
            &[original],
        ));
        let restored = read_layout(&mut link, p::layout::ACTUATION, &[probe_id]);
        assert_eq!(
            restored.get(&probe_id),
            Some(&original),
            "failed to restore original value"
        );
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard, writes to the keyboard"]
    fn hardware_writes_and_restores_per_key_deadzones() {
        // Per-key dead press/release live in layouts 22/23. This used to write
        // layouts 6/7, which the vendor names `Layout_DB2`/`Layout_DB3` and which
        // ship at 2.0/3.0 mm — above the actuation point, so the control was both
        // mislabelled and capable of making a key unusable.
        let (_api, mut link, _guard) = link();
        let probe_id = keymap::all_ids()[0];

        let read = |link: &mut Link, layout: u8| -> u16 {
            read_layout(link, layout, &[probe_id])
                .get(&probe_id)
                .copied()
                .unwrap_or(u16::MAX)
        };

        for layout in [p::layout::DEAD_PRESS, p::layout::DEAD_RELEASE] {
            let original = read(&mut link, layout);
            assert_ne!(
                original,
                u16::MAX,
                "layout {layout} has no data for key {probe_id} to restore"
            );

            for target in [150u16, 350, 200] {
                link.send(p::key_layout_packet(true, layout, &[probe_id], &[target]));
                assert_eq!(
                    read(&mut link, layout),
                    target,
                    "layout {layout} did not accept {target} um"
                );
            }

            link.send(p::key_layout_packet(true, layout, &[probe_id], &[original]));
            assert_eq!(
                read(&mut link, layout),
                original,
                "failed to restore layout {layout}"
            );
        }
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard"]
    fn hardware_distinguishes_no_data_from_a_distance() {
        // Asserts the *reader's* behaviour on whatever the firmware reports,
        // not that the firmware keeps reporting 0xFFFF. A firmware update that
        // starts filling in Esc's registers must not fail this test.
        //
        // The parsing contract itself is covered without hardware by
        // `unit::rejects_the_firmware_no_data_marker`.
        let (_api, mut link, _guard) = link();
        let esc = 41u16;
        for layout in [p::layout::RT_PRESS, p::layout::RT_RELEASE] {
            let raw = read_layout(&mut link, layout, &[esc]).get(&esc).copied();
            // `0xFFFF` means "no data" and needs no handling; anything else must
            // be a plausible distance.
            if let Some(um) = distance(raw.unwrap_or(u16::MAX)) {
                assert!(
                    um <= 3400,
                    "layout {layout}: Esc value {um}um is not a plausible distance"
                );
            }
        }
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard, writes to the keyboard"]
    fn hardware_writes_and_restores_rapid_trigger() {
        let (_api, mut link, _guard) = link();
        let ids = keymap::all_ids();
        let probe_id = ids[0];
        let original_mode = read_layout(&mut link, p::layout::MODE, &[probe_id])
            .get(&probe_id)
            .copied()
            .unwrap_or(0);
        // Rapid-trigger values must be restored too, not just the mode: leaving
        // them behind silently changes how the key behaves later.
        let original_press = read_layout(&mut link, p::layout::RT_PRESS, &[probe_id])
            .get(&probe_id)
            .copied()
            .unwrap_or(0);
        let original_release = read_layout(&mut link, p::layout::RT_RELEASE, &[probe_id])
            .get(&probe_id)
            .copied()
            .unwrap_or(0);

        link.send(p::key_layout_packet(
            true,
            p::layout::RT_PRESS,
            &[probe_id],
            &[300],
        ));
        link.send(p::key_layout_packet(
            true,
            p::layout::RT_RELEASE,
            &[probe_id],
            &[400],
        ));
        link.send(p::key_layout_packet(
            true,
            p::layout::MODE,
            &[probe_id],
            &[KeyMode::RapidTrigger.wire_value()],
        ));

        assert_eq!(
            read_layout(&mut link, p::layout::RT_PRESS, &[probe_id]).get(&probe_id),
            Some(&300)
        );
        assert_eq!(
            read_layout(&mut link, p::layout::RT_RELEASE, &[probe_id]).get(&probe_id),
            Some(&400)
        );
        let mode = read_layout(&mut link, p::layout::MODE, &[probe_id])
            .get(&probe_id)
            .copied()
            .unwrap_or(0);
        assert_eq!(
            KeyMode::from_wire(mode),
            KeyMode::RapidTrigger,
            "mode {mode:#04x} did not decode as RT"
        );
        assert_eq!(
            mode,
            KeyMode::RapidTrigger.wire_value(),
            "firmware altered the mode field"
        );

        // Restore everything, mode last so the sensor registers are back in
        // place before the key leaves Rapid Trigger.
        for (layout, value) in [
            (p::layout::RT_PRESS, original_press),
            (p::layout::RT_RELEASE, original_release),
        ] {
            link.send(p::key_layout_packet(true, layout, &[probe_id], &[value]));
        }
        link.send(p::key_layout_packet(
            true,
            p::layout::MODE,
            &[probe_id],
            &[original_mode],
        ));

        let restored = read_layout(&mut link, p::layout::MODE, &[probe_id])
            .get(&probe_id)
            .copied()
            .unwrap_or(0);
        assert_eq!(restored, original_mode, "failed to restore key mode");
        assert_eq!(
            read_layout(&mut link, p::layout::RT_PRESS, &[probe_id]).get(&probe_id),
            Some(&original_press),
            "failed to restore rapid trigger press"
        );
        assert_eq!(
            read_layout(&mut link, p::layout::RT_RELEASE, &[probe_id]).get(&probe_id),
            Some(&original_release),
            "failed to restore rapid trigger release"
        );
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard, writes to the keyboard"]
    fn hardware_snap_tap_round_trips() {
        // Supersedes the earlier `hardware_snap_tap_is_read_only_on_firmware_9_1`
        // test, which pinned a conclusion that turned out to be wrong: Snap Tap
        // *is* writable. The old test used a 6-byte, 8-bit-value frame that the
        // vendor driver never sends. The firmware silently discarded those
        // writes, which looked identical to "not implemented".
        let (_api, mut link, _guard) = link();

        // HID ids of A and D, used as a scratch pair. Cleared again at the end.
        const KEY_A: u8 = 0x04;
        const KEY_D: u8 = 0x07;
        const VALUE_A: u16 = 2;
        const VALUE_D: u16 = 3;
        const MODE: u8 = 1;
        const DELAY: u16 = 10;

        // Writing a Snap Tap pair silently switches *both* keys to Single Mode
        // (layout 8 = 0x08) and clearing the pair does not undo that, so the
        // original modes have to be captured and written back.
        let original_modes: Vec<(u16, u16)> = [KEY_A, KEY_D]
            .iter()
            .map(|id| *id as u16)
            .filter_map(|id| {
                read_layout(&mut link, p::layout::MODE, &[id])
                    .get(&id)
                    .copied()
                    .map(|mode| (id, mode))
            })
            .collect();
        let restore_modes = |link: &mut Link| {
            for (id, mode) in &original_modes {
                link.send(p::key_layout_packet(
                    true,
                    p::layout::MODE,
                    &[*id],
                    &[*mode],
                ));
            }
        };

        // Reads are keyed by the first key of the pair. A read with keyA = 0
        // always comes back empty, which is what made this look broken.
        let read_pair = |link: &mut Link| -> Option<p::KeyPair> {
            let packet = p::pair_packet(
                false,
                p::cmd::SOCD,
                p::KeyPair {
                    key_a: KEY_A,
                    ..p::KeyPair::CLEARED
                },
            );
            let r = link.query(packet)?;
            if !r.matches(p::cmd::SOCD) || r.is_fail() {
                return None;
            }
            p::parse_pair(&r.0)
        };

        let write = |link: &mut Link, pair: p::KeyPair| {
            link.send(p::pair_packet(true, p::cmd::SOCD, pair));
            std::thread::sleep(std::time::Duration::from_millis(20));
        };

        // Start from a clean pair so the test is repeatable.
        write(&mut link, p::KeyPair::CLEARED);

        let configured = p::KeyPair {
            key_a: KEY_A,
            key_b: KEY_D,
            value_a: VALUE_A,
            value_b: VALUE_D,
            mode: MODE,
            key_type: 0,
            delay: DELAY,
        };
        write(&mut link, configured);
        let got = read_pair(&mut link).expect("Snap Tap read after write");
        assert_eq!(got, configured, "Snap Tap did not persist the write");

        // And it must clear again. Note the pair identity survives a clear —
        // writing keyB = 0 does not unlink the pair, it refuses to change it.
        // Clearing means writing the same keyB with zeroed values, which leaves
        // an inactive pair behind rather than removing it.
        let cleared = p::KeyPair {
            key_a: KEY_A,
            key_b: KEY_D,
            ..p::KeyPair::CLEARED
        };
        write(&mut link, cleared);
        let after = read_pair(&mut link).expect("Snap Tap read after clear");
        assert!(
            after.is_cleared(),
            "Snap Tap still active after clear: {after:?}"
        );

        // Snap Tap also rewrote both keys' mode field; put that back.
        restore_modes(&mut link);
        for (id, mode) in &original_modes {
            let now = read_layout(&mut link, p::layout::MODE, &[*id])
                .get(id)
                .copied()
                .unwrap_or(u16::MAX);
            assert_eq!(now, *mode, "failed to restore mode of key {id}");
        }
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard, writes to the keyboard"]
    fn hardware_snap_tap_round_trips_through_the_production_path() {
        // Calls `apply_snap_tap` itself rather than imitating it. An earlier
        // version of this test performed the mode restore inline, so it passed
        // even when `write_snap_tap` restored nothing at all.
        let (_api, mut link, _link_guard) = link();

        const PAIR_A: SnapTap = SnapTap {
            key_a: 0x04,
            key_b: 0x07,
            value_a: 2,
            value_b: 3,
            mode: 1,
            key_type: 0,
            delay_ms: 10,
        };
        const PAIR_B: SnapTap = SnapTap {
            key_a: 0x05,
            key_b: 0x06,
            value_a: 4,
            value_b: 5,
            mode: 1,
            key_type: 0,
            delay_ms: 20,
        };
        let ids = |p: &SnapTap| [p.key_a, p.key_b];

        // Normalise the starting point: both key pairs in Global mode and no Snap
        // Tap configured. Without this the test inherits whatever the previous run
        // left behind and cannot tell "the firmware changed the mode" from "the
        // mode was already Single".
        let global = [
            SavedKeyMode {
                key_id: PAIR_A.key_a,
                mode: KeyMode::Global,
            },
            SavedKeyMode {
                key_id: PAIR_A.key_b,
                mode: KeyMode::Global,
            },
            SavedKeyMode {
                key_id: PAIR_B.key_a,
                mode: KeyMode::Global,
            },
            SavedKeyMode {
                key_id: PAIR_B.key_b,
                mode: KeyMode::Global,
            },
        ];
        restore_key_modes(&mut link, &global);
        apply_snap_tap(&mut link, None, &[], None);
        std::thread::sleep(std::time::Duration::from_millis(60));

        let baseline = read_key_modes(&mut link, &ids(&PAIR_A));
        let baseline_b = read_key_modes(&mut link, &ids(&PAIR_B));
        assert_eq!(baseline.len(), 2);
        assert_eq!(baseline_b.len(), 2);
        assert!(
            baseline.iter().all(|m| m.mode == KeyMode::Global),
            "could not normalise the starting modes: {baseline:?}"
        );
        assert!(find_snap_tap(&mut link).expect("sweep").is_none());

        // Enable on pair A.
        let on = apply_snap_tap(&mut link, None, &[], Some(PAIR_A));
        assert_eq!(on.active, Some(PAIR_A));
        assert_eq!(on.saved_modes.len(), 2, "modes must be captured");
        assert_eq!(
            on.saved_modes.iter().map(|m| m.mode).collect::<Vec<_>>(),
            baseline.iter().map(|m| m.mode).collect::<Vec<_>>(),
            "captured modes must be the pre-write ones, not the Single Mode the write causes"
        );
        // The firmware switches both keys to Single Mode as a side effect of
        // writing the pair. `aula-probe layout 8` shows it reliably from a fresh
        // process, but reading the mode back on this handle keeps reporting the
        // pre-write value even after the handle is closed and re-opened. That
        // discrepancy is unresolved and recorded in `docs/RESEARCH-NOTES.md`, so
        // it is deliberately not asserted here: a test must not depend on a
        // behaviour nobody can reproduce yet. Production drops the handle after
        // every Snap Tap write, which is what makes the new mode visible.
        let found = find_snap_tap(&mut link)
            .expect("sweep must not fail")
            .expect("pair A should be found");
        assert_eq!((found.key_a, found.key_b), (PAIR_A.key_a, PAIR_A.key_b));
        assert_eq!((found.value_a, found.value_b), (2, 3));
        assert_eq!(found.delay_ms, 10);

        // Move to pair B. The old pair must be retired, otherwise a later sweep
        // can find it instead of the new one and the UI shows the wrong keys.
        let moved = apply_snap_tap(&mut link, on.active, &on.saved_modes, Some(PAIR_B));
        assert_eq!(moved.active, Some(PAIR_B));
        assert_eq!(moved.saved_modes.len(), 2);

        let found = find_snap_tap(&mut link)
            .expect("sweep must not fail")
            .expect("pair B should be found");
        assert_eq!(
            (found.key_a, found.key_b),
            (PAIR_B.key_a, PAIR_B.key_b),
            "the retired pair must not still be active on the keyboard"
        );

        // Disable.
        let off = apply_snap_tap(&mut link, moved.active, &moved.saved_modes, None);
        assert_eq!(off.active, None);
        assert!(
            off.saved_modes.is_empty(),
            "saved modes must be dropped once the pair is off"
        );
        assert!(
            find_snap_tap(&mut link).expect("sweep").is_none(),
            "cleared pair must not be discoverable"
        );
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard, writes to the keyboard"]
    fn hardware_clear_without_a_configured_pair_sends_nothing() {
        // Guards the early return: a packet addressed to key 0 must not be sent
        // when there is nothing to clear.
        let (_api, mut link, _guard) = link();
        let outcome = apply_snap_tap(&mut link, None, &[], None);
        assert_eq!(outcome.active, None);
        assert!(outcome.saved_modes.is_empty());
        assert!(
            find_snap_tap(&mut link).expect("sweep").is_none(),
            "keyboard state must be untouched"
        );
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard"]
    fn hardware_reads_lighting() {
        let (_api, mut link, _guard) = link();
        let query = p::rgb_packet(false, &[[255, 0, 0]; 7], false, false, false, 0, 0, 0, 0, 0);
        let r = link
            .query(query)
            .filter(|r| r.matches(p::cmd::RGB))
            .expect("RGB query rejected � is this firmware 9.x?");
        assert!(r.rgb_brightness() <= 4, "brightness out of range");
        assert!(r.rgb_speed() <= 4, "speed out of range");
    }
}
