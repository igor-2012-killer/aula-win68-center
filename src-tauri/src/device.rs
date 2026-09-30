//! HID transport and hardware driver.
//!
//! All USB traffic happens on one dedicated I/O thread so the webview never
//! blocks. The thread owns the `HidDevice`, applies state patches to a cached
//! [`KeyboardState`], and emits Tauri events when the UI needs an update.
//!
//! # Hardware notes discovered by probing real firmware 9.1
//!
//! * Changing the polling rate makes the vendor HID collection vanish from USB
//!   enumeration for roughly a second. The watchdog notices and reconnects.
//! * Global press/release deadzones are **read-only** on this firmware. Deadzones
//!   are therefore written per key through `layout::PRESS_DEADZONE` /
//!   `layout::RELEASE_DEADZONE`.
//! * `cmd::LOGO_RGB` is not implemented on this firmware; it is never sent.

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
use crate::state::{KeyMode, KeyboardState, Lighting};

pub const EVENT_STATE: &str = "kb://state";
pub const EVENT_TRAVEL: &str = "kb://travel";
pub const EVENT_STATUS: &str = "kb://status";

const WATCHDOG_INTERVAL: Duration = Duration::from_millis(400);
const STREAM_INTERVAL: Duration = Duration::from_millis(16);
const SENSOR_COUNT: usize = 21 * 6;
/// Per-key deadzones above this are meaningless and only occur as shipped
/// defaults, so readings are clamped to it.
const DEADZONE_MAX_MM: f32 = 0.5;

/// Millimetres -> micrometres, clamped to a sane 16-bit range.
fn um(mm: f32) -> u16 {
    (mm.clamp(0.0, 65.535) * 1000.0).round() as u16
}

fn mm(value: u16) -> f32 {
    (value as f32 / 1000.0 * 100.0).round() / 100.0
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
            let (step_um, min_um, max_um) = r.precision();
            if step_um > 0 {
                state.step = mm(step_um);
            }
            if (1..=1000).contains(&min_um) {
                state.min_travel = mm(min_um);
            }
            if (2000..=4000).contains(&max_um) {
                state.max_travel = mm(max_um);
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
            (p::layout::PRESS_DEADZONE, PressDeadzone),
            (p::layout::RELEASE_DEADZONE, ReleaseDeadzone),
        ] {
            let values = read_layout(link, layout_id, &ids);
            for (id, value) in values {
                let entry = state.keys.entry(id).or_default();
                match apply {
                    Mode => entry.mode = KeyMode::from_wire(value),
                    Actuation => entry.actuation = mm(value),
                    RtPress => entry.rt_press = mm(value),
                    RtRelease => entry.rt_release = mm(value),
                    // The shipped defaults for these two fields are 2.0 mm and
                    // 3.0 mm, far above the useful deadzone range, so clamp on
                    // read rather than showing a slider pinned at its maximum.
                    PressDeadzone => entry.press_deadzone = mm(value).min(DEADZONE_MAX_MM),
                    ReleaseDeadzone => entry.release_deadzone = mm(value).min(DEADZONE_MAX_MM),
                }
            }
        }
    }

    // ----------------------------------------------------------- writes

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
                    link.send(p::key_layout_packet(
                        true,
                        p::layout::PRESS_DEADZONE,
                        chunk,
                        &vec![um(press); chunk.len()],
                    ));
                    link.send(p::key_layout_packet(
                        true,
                        p::layout::RELEASE_DEADZONE,
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
        | Job::PollingRate(_, tx)
        | Job::Profile(_, tx)
        | Job::Streaming(_, tx)
        | Job::OsMode { reply: tx, .. } => {
            let _ = tx.send(());
        }
    }
}

/// Tests that talk to real hardware.
///
/// Skipped unless `AULA_HW_TESTS=1` is set, so `cargo test` stays hermetic:
/// ```sh
/// $env:AULA_HW_TESTS=1; cargo test --lib -- --ignored hardware
/// ```
#[cfg(test)]
mod hardware {
    use super::*;

    fn link() -> (HidApi, Link) {
        let mut api = HidApi::new().expect("hidapi");
        let mut link = Link::default();
        assert!(
            link.open(&mut api),
            "Aula keyboard not found � is it plugged in?"
        );
        (api, link)
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
        let (mut api, mut link) = link();
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
    #[ignore = "requires a connected Aula keyboard"]
    fn hardware_reads_every_key() {
        let (_, mut link) = link();
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
        let (_, mut link) = link();
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
    fn hardware_writes_and_restores_rapid_trigger() {
        let (_, mut link) = link();
        let ids = keymap::all_ids();
        let probe_id = ids[0];
        let original_mode = read_layout(&mut link, p::layout::MODE, &[probe_id])
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
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard, writes to the keyboard"]
    fn hardware_snap_tap_is_read_only_on_firmware_9_1() {
        let (_, mut link) = link();

        // Command 44 answers reads, so build the packets inline: the packer was
        // removed from the protocol module because the feature is unusable.
        let packet = |payload: &[u8]| {
            let mut buf = [0u8; p::PACKET_LEN];
            buf[0] = p::HEADER;
            buf[2] = p::cmd::SOCD;
            buf[1] = payload.len() as u8;
            buf[4..4 + payload.len()].copy_from_slice(payload);
            let mut sum: u32 = 53 + buf[0] as u32 + buf[1] as u32 + buf[2] as u32;
            sum += buf[buf[1] as usize + 3] as u32;
            buf[3] = (sum & 0xFF) as u8;
            buf
        };

        let read_socd = |link: &mut Link| -> (u16, u16, u8, u16) {
            link.query(packet(&[0; 6]))
                .filter(|r| r.matches(p::cmd::SOCD))
                .expect("socd reply")
                .socd()
        };

        let before = read_socd(&mut link);
        // Every write variant the reverse engineering tried: mode flag 0/1/2/255,
        // both resolver modes, and a zeroed disable. None are persisted.
        for payload in [
            vec![1u8, 4, 7, 0, 10, 0],
            vec![1, 4, 7, 3, 0, 0],
            vec![0, 4, 7, 0, 10, 0],
            vec![2, 4, 7, 0, 10, 0],
            vec![255, 4, 7, 0, 10, 0],
        ] {
            link.send(packet(&payload));
            let after = read_socd(&mut link);
            assert_eq!(
                after, before,
                "firmware unexpectedly accepted SOCD write {payload:?} - re-check whether \
                 Snap Tap is now configurable and can be re-enabled in the UI"
            );
        }
    }

    #[test]
    #[ignore = "requires a connected Aula keyboard"]
    fn hardware_reads_lighting() {
        let (_, mut link) = link();
        let query = p::rgb_packet(false, &[[255, 0, 0]; 7], false, false, false, 0, 0, 0, 0, 0);
        let r = link
            .query(query)
            .filter(|r| r.matches(p::cmd::RGB))
            .expect("RGB query rejected � is this firmware 9.x?");
        assert!(r.rgb_brightness() <= 4, "brightness out of range");
        assert!(r.rgb_speed() <= 4, "speed out of range");
    }
}
