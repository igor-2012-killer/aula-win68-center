//! Serializable keyboard state shared with the frontend.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::keymap::{self, KeyDef};
use crate::protocol::touch_mode;

/// High nibble of a key's mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KeyMode {
    /// Inherits the global actuation point.
    Global,
    /// Uses a custom actuation point.
    Single,
    /// Rapid trigger is active.
    RapidTrigger,
}

impl KeyMode {
    pub fn from_wire(value: u16) -> Self {
        // The touch mode lives in the high nibble; the low nibble carries the
        // advanced key mode.
        match (value >> 4) as u8 & 0x0F {
            v if v == touch_mode::SINGLE => Self::Single,
            v if v == touch_mode::RAPID_TRIGGER => Self::RapidTrigger,
            _ => Self::Global,
        }
    }

    /// Raw `layout::MODE` value to write back to the keyboard.
    ///
    /// The firmware stores this field verbatim, so writing the bare nibble
    /// instead of the shifted value would round-trip as "global". Always use
    /// this rather than shifting by hand.
    pub fn wire_value(self) -> u16 {
        (self.nibble() as u16) << 4
    }

    fn nibble(self) -> u8 {
        match self {
            Self::Global => touch_mode::GLOBAL,
            Self::Single => touch_mode::SINGLE,
            Self::RapidTrigger => touch_mode::RAPID_TRIGGER,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct KeySettings {
    pub mode: KeyMode,
    /// Actuation point in millimetres.
    pub actuation: f32,
    pub rt_press: f32,
    pub rt_release: f32,
    pub press_deadzone: f32,
    pub release_deadzone: f32,
}

impl Default for KeySettings {
    fn default() -> Self {
        Self {
            mode: KeyMode::Global,
            actuation: 2.0,
            rt_press: 0.02,
            rt_release: 0.02,
            press_deadzone: 0.2,
            release_deadzone: 0.3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lighting {
    pub enabled: bool,
    pub effect: u8,
    pub brightness: u8,
    pub speed: u8,
    pub reversed: bool,
    pub super_response: bool,
    pub sleep_minutes: u8,
    pub static_effect: u8,
    /// Seven `#rrggbb` colours, in wire order.
    pub colors: [String; 7],
}

impl Default for Lighting {
    fn default() -> Self {
        Self {
            enabled: true,
            effect: 1,
            brightness: 3,
            speed: 3,
            reversed: false,
            super_response: false,
            sleep_minutes: 0,
            static_effect: 0,
            colors: [
                "#ff0000".into(),
                "#00ff00".into(),
                "#ffff00".into(),
                "#0000ff".into(),
                "#ff00ff".into(),
                "#00ffff".into(),
                "#ffffff".into(),
            ],
        }
    }
}

/// A configured Snap Tap pair.
///
/// Snap Tap switches a single key between two outputs: press once for the first
/// key, tap twice for the second. The firmware stores it as an "advanced key"
/// pair addressed by the **first** key, which is why reading it needs a sweep —
/// see `docs/VENDOR-DRIVER.md` §6.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SnapTap {
    /// First key of the pair, by HID id. This is the read address.
    pub key_a: u16,
    /// Second key of the pair.
    pub key_b: u16,
    /// Resolver threshold for the first key, in firmware units.
    ///
    /// The vendor calls these `DKSV[0]` and `DKSV[1]`. Their unit has not been
    /// confirmed by measurement, so the UI labels them as raw values rather
    /// than pretending to be milliseconds.
    pub value_a: u16,
    /// Resolver threshold for the second key.
    pub value_b: u16,
    /// Resolver mode. `0` means Snap Tap is off for this pair.
    pub mode: u8,
    /// Trigger type, as sent by the vendor driver.
    pub key_type: u8,
    /// Dynamic delay in milliseconds.
    pub delay_ms: u16,
}

impl SnapTap {
    /// True when the pair is stored but inactive.
    pub fn is_inactive(&self) -> bool {
        self.mode == 0 && self.value_a == 0 && self.value_b == 0
    }
}

/// A key mode captured before Snap Tap overwrote it.
///
/// Writing a Snap Tap pair makes the firmware switch both keys to Single Mode and
/// clearing the pair does not undo that. The only way to put a key back the way
/// the user had it is to remember the mode from *before* the write — reading it
/// afterwards just reads back the Single Mode the write caused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SavedKeyMode {
    pub key_id: u16,
    pub mode: KeyMode,
}

/// Everything the UI needs in one payload.
#[derive(Debug, Clone, Serialize)]
pub struct KeyboardState {
    pub connected: bool,
    /// Set while the device is re-enumerating after a polling-rate change.
    pub reconnecting: bool,
    pub last_error: Option<String>,
    pub device_name: String,
    pub firmware: String,
    /// Device-reported travel limits in millimetres.
    pub min_travel: f32,
    pub max_travel: f32,
    /// Smallest adjustable increment in millimetres.
    pub step: f32,
    pub polling_rate: u8,
    pub profile: u8,
    pub mac_layout: bool,
    pub global_actuation: f32,
    pub global_press_deadzone: f32,
    pub global_release_deadzone: f32,
    pub lighting: Lighting,
    /// Configured Snap Tap pair, or `None` when Snap Tap is off.
    pub snap_tap: Option<SnapTap>,
    /// Key modes to restore when the Snap Tap pair is cleared or changed.
    ///
    /// Internal bookkeeping, not part of the UI payload.
    #[serde(skip)]
    pub snap_tap_saved_modes: Vec<SavedKeyMode>,
    pub keys: HashMap<u16, KeySettings>,
    pub layout: Vec<KeyDef>,
    pub presets: Vec<(&'static str, Vec<u16>)>,
    /// Real-time travel in millimetres, keyed by sensor row * 21 + col.
    pub sensors: Vec<f32>,
}

impl Default for KeyboardState {
    fn default() -> Self {
        let mut keys = HashMap::new();
        for k in keymap::KEYS {
            keys.insert(k.id, KeySettings::default());
        }
        Self {
            connected: false,
            reconnecting: false,
            last_error: None,
            device_name: "Aula".into(),
            firmware: String::new(),
            min_travel: 0.1,
            max_travel: 3.4,
            step: 0.01,
            polling_rate: 0,
            profile: 0,
            mac_layout: false,
            global_actuation: 2.0,
            global_press_deadzone: 0.2,
            global_release_deadzone: 0.3,
            lighting: Lighting::default(),
            snap_tap: None,
            snap_tap_saved_modes: Vec::new(),
            keys,
            layout: keymap::KEYS.to_vec(),
            presets: keymap::presets(),
            sensors: vec![0.0; 21 * 6],
        }
    }
}

/// Polling rate table surfaced in the UI (index maps to the wire value).
pub const POLLING_RATES: [(u8, u32); 5] =
    [(0, 8_000), (1, 4_000), (2, 2_000), (3, 1_000), (4, 500)];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_mode_round_trips_through_the_wire_value() {
        // The firmware stores `layout::MODE` verbatim, so an unshifted nibble
        // would read back as "global" and silently lose the setting.
        for mode in [KeyMode::Global, KeyMode::Single, KeyMode::RapidTrigger] {
            assert_eq!(KeyMode::from_wire(mode.wire_value()), mode);
        }
    }

    #[test]
    fn advanced_key_mode_in_the_low_nibble_is_ignored() {
        assert_eq!(
            KeyMode::from_wire(KeyMode::RapidTrigger.wire_value() | 0x0002),
            KeyMode::RapidTrigger
        );
        assert_eq!(KeyMode::from_wire(0x0099), KeyMode::Global);
    }
}
