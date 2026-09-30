//! Physical 68-key matrix for the Aula WIN68 HE Pro.
//!
//! `id` is the HID usage id the firmware uses to address the key.
//! `row` / `col` index the real-time 6x21 sensor grid (rows 1..=5, cols 0..=20).
//! `x`, `y`, `w` are in keycap units and drive the on-screen layout.

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
pub struct KeyDef {
    pub id: u16,
    pub row: u8,
    pub col: u8,
    pub label: &'static str,
    pub x: f32,
    pub y: f32,
    pub w: f32,
}

#[rustfmt::skip]
pub static KEYS: &[KeyDef] = &[
    KeyDef { id: 41,  row: 1, col: 0,  label: "Esc",  x: 0.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 30,  row: 1, col: 1,  label: "1",    x: 1.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 31,  row: 1, col: 2,  label: "2",    x: 2.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 32,  row: 1, col: 3,  label: "3",    x: 3.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 33,  row: 1, col: 4,  label: "4",    x: 4.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 34,  row: 1, col: 5,  label: "5",    x: 5.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 35,  row: 1, col: 6,  label: "6",    x: 6.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 36,  row: 1, col: 7,  label: "7",    x: 7.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 37,  row: 1, col: 8,  label: "8",    x: 8.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 38,  row: 1, col: 9,  label: "9",    x: 9.0,   y: 0.0, w: 1.0  },
    KeyDef { id: 39,  row: 1, col: 10, label: "0",    x: 10.0,  y: 0.0, w: 1.0  },
    KeyDef { id: 45,  row: 1, col: 11, label: "-",    x: 11.0,  y: 0.0, w: 1.0  },
    KeyDef { id: 46,  row: 1, col: 12, label: "=",    x: 12.0,  y: 0.0, w: 1.0  },
    KeyDef { id: 42,  row: 1, col: 13, label: "Bksp",  x: 13.0,  y: 0.0, w: 2.0  },
    KeyDef { id: 73,  row: 1, col: 14, label: "Ins",  x: 15.0,  y: 0.0, w: 1.0  },

    KeyDef { id: 43,  row: 2, col: 0,  label: "Tab",   x: 0.0,   y: 1.0, w: 1.5  },
    KeyDef { id: 20,  row: 2, col: 1,  label: "Q",    x: 1.5,   y: 1.0, w: 1.0  },
    KeyDef { id: 26,  row: 2, col: 2,  label: "W",    x: 2.5,   y: 1.0, w: 1.0  },
    KeyDef { id: 8,   row: 2, col: 3,  label: "E",    x: 3.5,   y: 1.0, w: 1.0  },
    KeyDef { id: 21,  row: 2, col: 4,  label: "R",    x: 4.5,   y: 1.0, w: 1.0  },
    KeyDef { id: 23,  row: 2, col: 5,  label: "T",    x: 5.5,   y: 1.0, w: 1.0  },
    KeyDef { id: 28,  row: 2, col: 6,  label: "Y",    x: 6.5,   y: 1.0, w: 1.0  },
    KeyDef { id: 24,  row: 2, col: 7,  label: "U",    x: 7.5,   y: 1.0, w: 1.0  },
    KeyDef { id: 12,  row: 2, col: 8,  label: "I",    x: 8.5,   y: 1.0, w: 1.0  },
    KeyDef { id: 18,  row: 2, col: 9,  label: "O",    x: 9.5,   y: 1.0, w: 1.0  },
    KeyDef { id: 19,  row: 2, col: 10, label: "P",    x: 10.5,  y: 1.0, w: 1.0  },
    KeyDef { id: 47,  row: 2, col: 11, label: "[",    x: 11.5,  y: 1.0, w: 1.0  },
    KeyDef { id: 48,  row: 2, col: 12, label: "]",    x: 12.5,  y: 1.0, w: 1.0  },
    KeyDef { id: 49,  row: 2, col: 13, label: "\\",   x: 13.5,  y: 1.0, w: 1.5  },
    KeyDef { id: 76,  row: 2, col: 14, label: "Del",  x: 15.0,  y: 1.0, w: 1.0  },

    KeyDef { id: 57,  row: 3, col: 0,  label: "Caps",  x: 0.0,   y: 2.0, w: 1.75 },
    KeyDef { id: 4,   row: 3, col: 1,  label: "A",    x: 1.75,  y: 2.0, w: 1.0  },
    KeyDef { id: 22,  row: 3, col: 2,  label: "S",    x: 2.75,  y: 2.0, w: 1.0  },
    KeyDef { id: 7,   row: 3, col: 3,  label: "D",    x: 3.75,  y: 2.0, w: 1.0  },
    KeyDef { id: 9,   row: 3, col: 4,  label: "F",    x: 4.75,  y: 2.0, w: 1.0  },
    KeyDef { id: 10,  row: 3, col: 5,  label: "G",    x: 5.75,  y: 2.0, w: 1.0  },
    KeyDef { id: 11,  row: 3, col: 6,  label: "H",    x: 6.75,  y: 2.0, w: 1.0  },
    KeyDef { id: 13,  row: 3, col: 7,  label: "J",    x: 7.75,  y: 2.0, w: 1.0  },
    KeyDef { id: 14,  row: 3, col: 8,  label: "K",    x: 8.75,  y: 2.0, w: 1.0  },
    KeyDef { id: 15,  row: 3, col: 9,  label: "L",    x: 9.75,  y: 2.0, w: 1.0  },
    KeyDef { id: 51,  row: 3, col: 10, label: ";",    x: 10.75, y: 2.0, w: 1.0  },
    KeyDef { id: 52,  row: 3, col: 11, label: "'",    x: 11.75, y: 2.0, w: 1.0  },
    KeyDef { id: 40,  row: 3, col: 13, label: "Enter", x: 12.75, y: 2.0, w: 2.25 },
    KeyDef { id: 75,  row: 3, col: 14, label: "PgUp",  x: 15.0,  y: 2.0, w: 1.0  },

    KeyDef { id: 225, row: 4, col: 0,  label: "Shift", x: 0.0,   y: 3.0, w: 2.25 },
    KeyDef { id: 29,  row: 4, col: 2,  label: "Z",    x: 2.25,  y: 3.0, w: 1.0  },
    KeyDef { id: 27,  row: 4, col: 3,  label: "X",    x: 3.25,  y: 3.0, w: 1.0  },
    KeyDef { id: 6,   row: 4, col: 4,  label: "C",    x: 4.25,  y: 3.0, w: 1.0  },
    KeyDef { id: 25,  row: 4, col: 5,  label: "V",    x: 5.25,  y: 3.0, w: 1.0  },
    KeyDef { id: 5,   row: 4, col: 6,  label: "B",    x: 6.25,  y: 3.0, w: 1.0  },
    KeyDef { id: 17,  row: 4, col: 7,  label: "N",    x: 7.25,  y: 3.0, w: 1.0  },
    KeyDef { id: 16,  row: 4, col: 8,  label: "M",    x: 8.25,  y: 3.0, w: 1.0  },
    KeyDef { id: 54,  row: 4, col: 9,  label: ",",    x: 9.25,  y: 3.0, w: 1.0  },
    KeyDef { id: 55,  row: 4, col: 10, label: ".",    x: 10.25, y: 3.0, w: 1.0  },
    KeyDef { id: 56,  row: 4, col: 11, label: "/",    x: 11.25, y: 3.0, w: 1.0  },
    KeyDef { id: 229, row: 4, col: 12, label: "Shift", x: 12.25, y: 3.0, w: 1.75 },
    KeyDef { id: 82,  row: 4, col: 13, label: "▲", x: 14.0, y: 3.0, w: 1.0 },
    KeyDef { id: 78,  row: 4, col: 14, label: "PgDn",  x: 15.0,  y: 3.0, w: 1.0  },

    KeyDef { id: 224, row: 5, col: 0,  label: "Ctrl",  x: 0.0,   y: 4.0, w: 1.25 },
    KeyDef { id: 227, row: 5, col: 1,  label: "Win",   x: 1.25,  y: 4.0, w: 1.25 },
    KeyDef { id: 226, row: 5, col: 2,  label: "Alt",   x: 2.5,   y: 4.0, w: 1.25 },
    KeyDef { id: 44,  row: 5, col: 6,  label: "Space", x: 3.75,  y: 4.0, w: 6.25 },
    KeyDef { id: 230, row: 5, col: 9,  label: "Alt",   x: 10.0,  y: 4.0, w: 1.0  },
    KeyDef { id: 1,   row: 5, col: 10, label: "Fn",    x: 11.0,  y: 4.0, w: 1.0  },
    KeyDef { id: 228, row: 5, col: 11, label: "Ctrl",  x: 12.0,  y: 4.0, w: 1.0  },
    KeyDef { id: 80,  row: 5, col: 12, label: "←", x: 13.0, y: 4.0, w: 1.0 },
    KeyDef { id: 81,  row: 5, col: 13, label: "↓", x: 14.0, y: 4.0, w: 1.0 },
    KeyDef { id: 79,  row: 5, col: 14, label: "→", x: 15.0, y: 4.0, w: 1.0 },
];

pub fn all_ids() -> Vec<u16> {
    KEYS.iter().map(|k| k.id).collect()
}

/// Named selection presets exposed in the UI.
pub fn presets() -> Vec<(&'static str, Vec<u16>)> {
    let letters: Vec<u16> = KEYS
        .iter()
        .filter(|k| {
            k.label.len() == 1
                && k.label
                    .chars()
                    .next()
                    .is_some_and(|c| c.is_ascii_alphabetic())
        })
        .map(|k| k.id)
        .collect();
    let digits: Vec<u16> = KEYS
        .iter()
        .filter(|k| {
            k.label.len() == 1 && k.label.chars().next().is_some_and(|c| c.is_ascii_digit())
        })
        .map(|k| k.id)
        .collect();
    let arrows: Vec<u16> = KEYS
        .iter()
        .filter(|k| matches!(k.label, "←" | "↑" | "↓" | "→"))
        .map(|k| k.id)
        .collect();
    let modifiers: Vec<u16> = KEYS
        .iter()
        .filter(|k| matches!(k.label, "Shift" | "Ctrl" | "Alt" | "Win" | "Fn"))
        .map(|k| k.id)
        .collect();

    vec![
        ("wasd", vec![26, 4, 22, 7]),
        ("qwer", vec![20, 26, 8, 21]),
        ("arrows", arrows),
        ("digits", digits),
        ("letters", letters),
        ("modifiers", modifiers),
        ("all", all_ids()),
    ]
}

/// HID usage id -> human readable name, used by the SOCD key pickers.
pub fn key_name(id: u16) -> String {
    KEYS.iter()
        .find(|k| k.id == id)
        .map(|k| k.label.to_string())
        .unwrap_or_else(|| format!("#{id}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_68_unique_keys() {
        assert_eq!(KEYS.len(), 68);
        let mut ids: Vec<_> = all_ids();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 68, "key ids must be unique");
    }

    #[test]
    fn sensor_grid_has_no_collisions() {
        let mut seen = std::collections::HashSet::new();
        for key in KEYS {
            assert!(
                seen.insert((key.row, key.col)),
                "duplicate sensor cell for {key:?}"
            );
        }
    }

    #[test]
    fn presets_are_non_empty() {
        for (name, ids) in presets() {
            assert!(!ids.is_empty(), "preset {name} is empty");
        }
    }
}
