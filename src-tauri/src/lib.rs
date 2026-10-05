//! Tauri command surface and application entry point.

mod device;
mod hid;
mod keymap;
mod protocol;
mod state;

use std::sync::Arc;

use tauri::{Manager, State};

use device::{Device, Job, KeyPatch, Reply};
use state::{KeyboardState, Lighting, ModTapAssignment, SnapTap, POLLING_RATES};

type Dev<'a> = State<'a, Arc<Device>>;

/// Reject values the firmware cannot represent before they reach the wire.
fn clamp_mm(value: f32, min: f32, max: f32) -> Result<f32, String> {
    if !value.is_finite() {
        return Err("value must be a finite number".into());
    }
    Ok(value.clamp(min, max))
}

/// Runs a job on the I/O thread without blocking the main thread.
///
/// Tauri runs synchronous commands on the main thread, and a refresh against a
/// degraded device can take seconds — enough to freeze the whole window. Every
/// command that waits for the I/O thread therefore goes through
/// `spawn_blocking`.
async fn run_job(
    device: Dev<'_>,
    make: impl FnOnce(Reply) -> Job + Send + 'static,
) -> Result<(), String> {
    let device = device.inner().clone();
    tauri::async_runtime::spawn_blocking(move || device.request(make))
        .await
        .map_err(|err| format!("worker unavailable: {err}"))?
}

#[tauri::command]
fn get_state(device: Dev) -> KeyboardState {
    device.state()
}

#[tauri::command]
async fn refresh(device: Dev<'_>) -> Result<(), String> {
    run_job(device, Job::Refresh).await
}

#[tauri::command]
async fn reconnect(device: Dev<'_>) -> Result<(), String> {
    run_job(device, Job::Reconnect).await
}

#[tauri::command]
async fn set_global_actuation(device: Dev<'_>, mm: f32) -> Result<(), String> {
    let value = clamp_mm(mm, 0.1, 3.4)?;
    run_job(device, move |tx| Job::GlobalActuation(value, tx)).await
}

#[tauri::command]
async fn set_keys_actuation(device: Dev<'_>, key_ids: Vec<u16>, mm: f32) -> Result<(), String> {
    let value = clamp_mm(mm, 0.1, 3.4)?;
    apply(device, key_ids, KeyPatch::Actuation(value)).await
}

#[tauri::command]
async fn set_keys_rapid_trigger(
    device: Dev<'_>,
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
    .await
}

#[tauri::command]
async fn set_keys_deadzone(
    device: Dev<'_>,
    key_ids: Vec<u16>,
    press_mm: f32,
    release_mm: f32,
) -> Result<(), String> {
    let press = clamp_mm(press_mm, 0.0, 0.5)?;
    let release = clamp_mm(release_mm, 0.0, 0.5)?;
    apply(device, key_ids, KeyPatch::Deadzone { press, release }).await
}

#[tauri::command]
async fn reset_keys(device: Dev<'_>, key_ids: Vec<u16>) -> Result<(), String> {
    apply(device, key_ids, KeyPatch::Reset).await
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
async fn set_snap_tap(device: Dev<'_>, pair: SnapTap) -> Result<(), String> {
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
    run_job(device, move |tx| Job::SnapTap(Some(pair), tx)).await
}

/// Turns Snap Tap off and puts the pair's keys back the way they were.
#[tauri::command]
async fn clear_snap_tap(device: Dev<'_>) -> Result<(), String> {
    run_job(device, move |tx| Job::SnapTap(None, tx)).await
}

/// Upper bound for the Mod-Tap hold threshold, in milliseconds.
///
/// The wire field is one byte in 10 ms units, so 2550 ms is the representable
/// maximum. `MAX_DELAY_MS` in `src/components/tabs/ModTapTab.tsx` must match,
/// otherwise the slider and the backend disagree.
const MAX_MOD_TAP_DELAY_MS: u16 = 2550;

/// Rejects key ids the keymap does not know.
fn known_key(id: u16) -> Result<(), String> {
    if keymap::KEYS.iter().any(|k| k.id == id) {
        Ok(())
    } else {
        Err(format!("unknown key id {id}"))
    }
}

/// Lists Mod-Tap assignments known to the cache.
///
/// Only keys seen in a refresh or scan appear here; the Mod-Tap tab can sweep
/// the whole board with `scan_mod_tap`.
#[tauri::command]
fn list_mod_tap(device: Dev) -> Vec<ModTapAssignment> {
    device.state().mod_tap
}

/// Sweeps keys for Mod-Tap assignments. An empty id list scans all 68 keys.
#[tauri::command]
async fn scan_mod_tap(device: Dev<'_>, key_ids: Vec<u16>) -> Result<(), String> {
    run_job(device, move |tx| Job::ModTapScan(key_ids, tx)).await
}

/// Assigns Mod-Tap to one key: `hold_key` on a hold past `delay_ms`,
/// `tap_key` on a short press. Both are HID usage ids; 0 means "no output".
#[tauri::command]
async fn set_mod_tap(device: Dev<'_>, assignment: ModTapAssignment) -> Result<(), String> {
    known_key(assignment.key_id)?;
    if assignment.hold_key == 0 && assignment.tap_key == 0 {
        return Err(
            "Mod-Tap needs at least one output key — use clear_mod_tap to remove it".into(),
        );
    }
    if assignment.delay_ms > MAX_MOD_TAP_DELAY_MS {
        return Err(format!("delay must be 0..={MAX_MOD_TAP_DELAY_MS} ms"));
    }
    run_job(device, move |tx| Job::ModTapWrite(assignment, tx)).await
}

/// Removes the Mod-Tap assignment from a key and clears its advanced-key flag,
/// keeping the touch mode the key had.
#[tauri::command]
async fn clear_mod_tap(device: Dev<'_>, key_id: u16) -> Result<(), String> {
    known_key(key_id)?;
    run_job(device, move |tx| Job::ModTapClear(key_id, tx)).await
}

#[tauri::command]
async fn set_lighting(device: Dev<'_>, config: Lighting) -> Result<(), String> {
    let mut value = config;
    value.brightness = value.brightness.min(4);
    value.speed = value.speed.min(4);
    value.sleep_minutes = value.sleep_minutes.min(60);
    value.effect = value.effect.min(20);
    run_job(device, move |tx| Job::Lighting(value, tx)).await
}

#[tauri::command]
async fn set_polling_rate(device: Dev<'_>, index: u8) -> Result<(), String> {
    if POLLING_RATES.iter().all(|(i, _)| *i != index) {
        return Err(format!("unknown polling rate index {index}"));
    }
    run_job(device, move |tx| Job::PollingRate(index, tx)).await
}

#[tauri::command]
async fn set_profile(device: Dev<'_>, index: u8) -> Result<(), String> {
    if index > 3 {
        return Err("profile must be 0..=3".into());
    }
    run_job(device, move |tx| Job::Profile(index, tx)).await
}

#[tauri::command]
async fn set_os_mode(device: Dev<'_>, mac: bool) -> Result<(), String> {
    run_job(device, move |tx| Job::OsMode { mac, reply: tx }).await
}

/// Ask the backend to start or stop the real-time sensor stream.
#[tauri::command]
async fn set_streaming(device: Dev<'_>, on: bool) -> Result<(), String> {
    run_job(device, move |tx| Job::Streaming(on, tx)).await
}

async fn apply(device: Dev<'_>, key_ids: Vec<u16>, patch: KeyPatch) -> Result<(), String> {
    let ids: Vec<u16> = key_ids
        .into_iter()
        .filter(|id| keymap::KEYS.iter().any(|k| k.id == *id))
        .collect();
    if ids.is_empty() {
        return Err("no valid keys selected".into());
    }
    run_job(device, move |tx| Job::Keys {
        ids,
        patch,
        reply: tx,
    })
    .await
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
            list_mod_tap,
            scan_mod_tap,
            set_mod_tap,
            clear_mod_tap,
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
