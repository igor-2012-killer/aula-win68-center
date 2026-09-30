//! Tauri command surface and application entry point.

mod device;
mod hid;
mod keymap;
mod protocol;
mod state;

use std::sync::Arc;

use tauri::{Manager, State};

use device::{Device, Job, KeyPatch};
use state::{KeyboardState, Lighting, SnapTap, POLLING_RATES};

type Dev<'a> = State<'a, Arc<Device>>;

/// Reject values the firmware cannot represent before they reach the wire.
fn clamp_mm(value: f32, min: f32, max: f32) -> Result<f32, String> {
    if !value.is_finite() {
        return Err("value must be a finite number".into());
    }
    Ok(value.clamp(min, max))
}

#[tauri::command]
fn get_state(device: Dev) -> KeyboardState {
    device.state()
}

#[tauri::command]
fn refresh(device: Dev) -> Result<(), String> {
    device.request(Job::Refresh)
}

#[tauri::command]
fn reconnect(device: Dev) -> Result<(), String> {
    device.request(Job::Reconnect)
}

#[tauri::command]
fn set_global_actuation(device: Dev, mm: f32) -> Result<(), String> {
    let value = clamp_mm(mm, 0.1, 3.4)?;
    device.request(|tx| Job::GlobalActuation(value, tx))
}

#[tauri::command]
fn set_keys_actuation(device: Dev, key_ids: Vec<u16>, mm: f32) -> Result<(), String> {
    let value = clamp_mm(mm, 0.1, 3.4)?;
    apply(device, key_ids, KeyPatch::Actuation(value))
}

#[tauri::command]
fn set_keys_rapid_trigger(
    device: Dev,
    key_ids: Vec<u16>,
    on: bool,
    press_mm: f32,
    release_mm: f32,
) -> Result<(), String> {
    let press = clamp_mm(press_mm, 0.01, 2.5)?;
    let release = clamp_mm(release_mm, 0.01, 2.5)?;
    apply(
        device,
        key_ids,
        KeyPatch::RapidTrigger { on, press, release },
    )
}

#[tauri::command]
fn set_keys_deadzone(
    device: Dev,
    key_ids: Vec<u16>,
    press_mm: f32,
    release_mm: f32,
) -> Result<(), String> {
    let press = clamp_mm(press_mm, 0.0, 0.5)?;
    let release = clamp_mm(release_mm, 0.0, 0.5)?;
    apply(device, key_ids, KeyPatch::Deadzone { press, release })
}

#[tauri::command]
fn reset_keys(device: Dev, key_ids: Vec<u16>) -> Result<(), String> {
    apply(device, key_ids, KeyPatch::Reset)
}

/// Upper bound for the Snap Tap dynamic delay, in milliseconds.
///
/// The wire field is 16-bit, so this is a sanity limit rather than a
/// representability one. `MAX_DELAY_MS` in `src/components/tabs/SnapTapTab.tsx`
/// must match, otherwise the slider and the backend disagree.
const MAX_SNAP_TAP_DELAY_MS: u16 = 500;

/// Whether Snap Tap may be written at all.
///
/// Storage is verified and clearing works, but the resolver's `mode` and `type`
/// fields are not understood. Two written configurations were tried on real
/// hardware: one made the keys emit a non-printable HID code so they appeared
/// dead, the other was stored and had no effect at all.
///
/// Refusing the write is deliberate. A control that stores a plausible-looking
/// configuration which silently does nothing — or which bricks two keys — is
/// worse than no control, and the values that would be needed to make it work
/// are guesses. Flip this once the semantics are known; see
/// `docs/RESEARCH-NOTES.md`.
const SNAP_TAP_WRITES_ENABLED: bool = false;

#[tauri::command]
fn set_snap_tap(device: Dev, pair: SnapTap) -> Result<(), String> {
    if !SNAP_TAP_WRITES_ENABLED {
        return Err(
            "Snap Tap writes are disabled: the resolver's mode and type fields are not \
             understood, and writing a guessed value can leave keys unusable. \
             See docs/RESEARCH-NOTES.md."
                .into(),
        );
    }
    if pair.key_a == pair.key_b {
        return Err("Snap Tap needs two different keys".into());
    }
    if pair.key_a > 0xFF || pair.key_b > 0xFF {
        return Err("key id out of range".into());
    }
    if pair.mode == 0 {
        return Err("mode 0 disables Snap Tap — use clear_snap_tap instead".into());
    }
    if pair.delay_ms > MAX_SNAP_TAP_DELAY_MS {
        return Err(format!("delay must be 0..={MAX_SNAP_TAP_DELAY_MS} ms"));
    }
    device.request(|tx| Job::SnapTap(Some(pair), tx))
}

/// Turns Snap Tap off and puts the pair's keys back the way they were.
#[tauri::command]
fn clear_snap_tap(device: Dev) -> Result<(), String> {
    device.request(|tx| Job::SnapTap(None, tx))
}

#[tauri::command]
fn set_lighting(device: Dev, config: Lighting) -> Result<(), String> {
    let mut value = config;
    value.brightness = value.brightness.min(4);
    value.speed = value.speed.min(4);
    value.sleep_minutes = value.sleep_minutes.min(60);
    value.effect = value.effect.min(20);
    device.request(|tx| Job::Lighting(value, tx))
}

#[tauri::command]
fn set_polling_rate(device: Dev, index: u8) -> Result<(), String> {
    if POLLING_RATES.iter().all(|(i, _)| *i != index) {
        return Err(format!("unknown polling rate index {index}"));
    }
    device.request(|tx| Job::PollingRate(index, tx))
}

#[tauri::command]
fn set_profile(device: Dev, index: u8) -> Result<(), String> {
    if index > 3 {
        return Err("profile must be 0..=3".into());
    }
    device.request(|tx| Job::Profile(index, tx))
}

#[tauri::command]
fn set_os_mode(device: Dev, mac: bool) -> Result<(), String> {
    device.request(|tx| Job::OsMode { mac, reply: tx })
}

/// Ask the backend to start or stop the real-time sensor stream.
#[tauri::command]
fn set_streaming(device: Dev, on: bool) -> Result<(), String> {
    device.request(|tx| Job::Streaming(on, tx))
}

fn apply(device: Dev, key_ids: Vec<u16>, patch: KeyPatch) -> Result<(), String> {
    let ids: Vec<u16> = key_ids
        .into_iter()
        .filter(|id| keymap::KEYS.iter().any(|k| k.id == *id))
        .collect();
    if ids.is_empty() {
        return Err("no valid keys selected".into());
    }
    device.request(|tx| Job::Keys {
        ids,
        patch,
        reply: tx,
    })
}

#[tauri::command]
fn key_name(id: u16) -> String {
    keymap::key_name(id)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let device = Device::new();
            device.attach(handle);
            app.manage(device);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            refresh,
            reconnect,
            set_global_actuation,
            set_keys_actuation,
            set_keys_rapid_trigger,
            set_keys_deadzone,
            reset_keys,
            set_snap_tap,
            clear_snap_tap,
            set_lighting,
            set_polling_rate,
            set_profile,
            set_os_mode,
            set_streaming,
            key_name,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start application");
}
