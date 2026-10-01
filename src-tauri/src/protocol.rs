//! Aula WIN68 HE Pro — vendor HID wire protocol.
//!
//! Every constant and byte offset in this file was verified empirically against
//! real hardware (VID 0x1CA2 / PID 0x1901, firmware 9.1, protocol v1) by
//! enumerating and probing the full command space. Do not "fix" offsets from
//! guesswork — re-probe instead.
//!
//! # Frame layout
//!
//! ```text
//! [0] 0x5C        header
//! [1] len         payload length (bytes after this field, excluding checksum)
//! [2] cmd         command id
//! [3] checksum    (53 + b0 + b1 + b2 + b[len+3]) & 0xFF
//! [4..] payload
//! ```
//!
//! On Windows the report id `0x00` must be prepended before writing.
//!
//! Responses set `[2] = cmd | 0x80` for structured commands, a bare `0x80` for
//! single-value ones (with the command id echoed in byte 5), or `[2] = 0xFF` to
//! signal failure.
//!
//! Constants that the app does not currently exercise are kept as a verified
//! reference table — several of them (`LOGO_RGB`, `DEFAULT_KEYS`) document
//! firmware behaviour that shaped the UI.

#![allow(dead_code)]

pub const HEADER: u8 = 0x5C;
pub const PACKET_LEN: usize = 64;
pub const RESP_OK_FLAG: u8 = 0x80;
pub const RESP_FAIL: u8 = 0xFF;

/// Single-value commands (`CMD` family). Payload: `[cmd, value]`.
pub mod order {
    pub const VERSION: u8 = 1;
    pub const QUERY_SYS_WIN: u8 = 33;
    pub const QUERY_SYS_MAC: u8 = 34;
    pub const QUERY_PRECISION: u8 = 37;
    pub const QUERY_NAME: u8 = 38;
    pub const SET_SYS_WIN: u8 = 48;
    pub const SET_SYS_MAC: u8 = 49;
    pub const POLLING_RATE: u8 = 80;
    pub const PROFILE_ID: u8 = 112;

    /// Commands that answer with `0x80` and a value at `res[6]`.
    pub const VALUE_QUERY: &[u8] = &[
        QUERY_SYS_WIN,
        QUERY_SYS_MAC,
        QUERY_PRECISION,
        QUERY_NAME,
        POLLING_RATE,
        PROFILE_ID,
    ];
}

/// Structured commands (`CMD2` family). Payload starts at `[4]`.
pub mod cmd {
    pub const REALTIME_TRAVEL: u8 = 18;
    pub const RGB: u8 = 24;
    /// Verified unsupported on firmware 9.1 — replies `0xFF`. Kept for reference.
    pub const LOGO_RGB: u8 = 25;
    pub const KEY_LAYOUT: u8 = 35;
    pub const DEADZONE: u8 = 41;
    pub const DEFAULT_KEYS: u8 = 43;
    /// Mod-Tap. Built by the vendor driver as `MTPack`; see `mod_tap_packet`.
    pub const MOD_TAP: u8 = 36;
    /// Snap Tap. Built by the vendor driver as `SOCDPack`; see `pair_packet`.
    pub const SOCD: u8 = 44;
    /// Rapid Switch. Built by the vendor driver as `RSPack`, byte-identical to
    /// `SOCDPack` apart from the command id.
    pub const RAPID_SWITCH: u8 = 45;

    /// `KEY_LAYOUT` transfers at most 14 (key, layout, value) triples.
    pub const MAX_KEYS_PER_PACKET: usize = 14;
}

/// Per-key `layout` selector inside a `KEY_LAYOUT` packet.
///
/// Names and ids below are taken from the `KeyLayout` enum in the vendor's
/// public driver JavaScript (`docs/VENDOR-DRIVER.md` §5), which is the
/// authoritative source. Two of our earlier labels were wrong: 5/6/7 are
/// advanced-key deadzone *stages*, not the classic release-travel/deadzone
/// pair, and the real dead press / dead release registers are 22 and 23.
pub mod layout {
    pub const FN0: u8 = 0;
    pub const FN1: u8 = 1;
    /// `Layout_DB0` — actuation point, µm.
    pub const ACTUATION: u8 = 4;
    /// `Layout_DB1` — advanced-key deadzone stage 1. Not release travel.
    pub const DB1: u8 = 5;
    /// `Layout_DB2` — advanced-key deadzone stage 2.
    pub const DB2: u8 = 6;
    /// `Layout_DB3` — advanced-key deadzone stage 3.
    pub const DB3: u8 = 7;
    /// High nibble of the value = touch mode, low nibble = advanced key mode.
    pub const MODE: u8 = 8;
    /// `Layout_MTDelay` — mod-tap delay, value × 10 ms.
    pub const MT_DELAY: u8 = 19;
    /// `Layout_RTP` — quick-touch / rapid-trigger press sensitivity, µm.
    pub const RT_PRESS: u8 = 20;
    /// `Layout_RTR` — quick-touch / rapid-trigger release sensitivity, µm.
    pub const RT_RELEASE: u8 = 21;
    /// `Layout_DP` — dead press, µm. This is the real per-key deadzone.
    pub const DEAD_PRESS: u8 = 22;
    /// `Layout_DR` — dead release, µm.
    pub const DEAD_RELEASE: u8 = 23;
    /// `Layout_KR` — single-touch release, µm.
    pub const SINGLE_TOUCH_RELEASE: u8 = 24;

    /// Previously believed to be the deadzone pair. The vendor names these
    /// `Layout_DB1..3`, and writes to them persist, so the app still uses them
    /// for backward compatibility — but they are *not* dead press/release.
    pub const PRESS_DEADZONE: u8 = DB2;
    pub const RELEASE_DEADZONE: u8 = DB3;
    /// Previously believed to be release travel; the vendor calls it `Layout_DB1`.
    pub const RELEASE_TRAVEL: u8 = DB1;
}

/// High nibble of `layout::MODE` values.
pub mod touch_mode {
    pub const GLOBAL: u8 = 0;
    pub const SINGLE: u8 = 1;
    pub const RAPID_TRIGGER: u8 = 2;
}

/// `SOCD` resolver mode.
///
/// Verified: command 44 answers reads but always reports zeros, and no payload
/// variant changes them. Snap Tap is **not configurable** on firmware 9.1 of the
/// WIN68 HE Pro, so the app does not expose it. See `device::hardware`.
pub mod socd_mode {
    pub const LAST_WON: u8 = 0;
    pub const NEUTRAL: u8 = 3;
}

fn checksum(buf: &[u8; PACKET_LEN]) -> u8 {
    let mut sum: u32 = 53 + buf[0] as u32 + buf[1] as u32 + buf[2] as u32;
    let len = buf[1] as usize;
    if len > 0 && len <= PACKET_LEN * 4 {
        sum += buf[len + 3] as u32;
    }
    (sum & 0xFF) as u8
}

fn base(cmd: u8) -> [u8; PACKET_LEN] {
    let mut buf = [0u8; PACKET_LEN];
    buf[0] = HEADER;
    buf[2] = cmd;
    buf
}

/// Appends payload bytes starting at index 4 and stamps the length + checksum.
///
/// The length field counts payload bytes, and the checksum folds in the *last*
/// payload byte (`buf[len + 3]`), so both depend on the final cursor position.
struct Builder {
    buf: [u8; PACKET_LEN],
    at: usize,
}

impl Builder {
    fn new(cmd: u8) -> Self {
        Self {
            buf: base(cmd),
            at: 4,
        }
    }

    /// Reserve `count` bytes and hand back the starting index.
    fn slot(&mut self, count: usize) -> usize {
        let start = self.at;
        self.at += count;
        start
    }

    fn put(&mut self, byte: u8) {
        self.buf[self.at] = byte;
        self.at += 1;
    }

    fn put_u16(&mut self, value: u16) {
        let at = self.slot(2);
        self.buf[at] = value as u8;
        self.buf[at + 1] = (value >> 8) as u8;
    }

    fn finish(mut self) -> [u8; PACKET_LEN] {
        self.buf[1] = (self.at - 4) as u8;
        self.buf[3] = checksum(&self.buf);
        self.buf
    }
}

/// `CMD` family packet carrying a single optional value.
///
/// Payload is `[cmd, value?, 0xFF, 0xFF]`.
pub fn cmd_packet(cmd: u8, value: Option<u8>) -> [u8; PACKET_LEN] {
    let mut b = Builder::new(0);
    b.put(cmd);
    if let Some(v) = value {
        b.put(v);
    }
    b.put(0xFF);
    b.put(0xFF);
    b.finish()
}

/// One Snap Tap / Rapid Switch pair, as stored on the keyboard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct KeyPair {
    /// First key of the pair, by HID id.
    ///
    /// This is also the **read address**: a read carries `key_a` and the
    /// firmware answers with whichever pair is configured under it. A read with
    /// `key_a = 0` therefore always looks empty, which is a large part of why
    /// Snap Tap looked broken for so long.
    pub key_a: u8,
    /// Second key of the pair. Stays recorded even after the pair is cleared.
    pub key_b: u8,
    pub value_a: u16,
    pub value_b: u16,
    /// Resolver mode. `0` disables the pair.
    pub mode: u8,
    /// Trigger type, as sent by the vendor driver.
    pub key_type: u8,
    /// Dynamic delay in milliseconds.
    pub delay: u16,
}

impl KeyPair {
    /// A pair that reads back as unconfigured.
    pub const CLEARED: Self = Self {
        key_a: 0,
        key_b: 0,
        value_a: 0,
        value_b: 0,
        mode: 0,
        key_type: 0,
        delay: 0,
    };

    /// True when the pair is **inert**, i.e. cleared.
    ///
    /// The firmware keeps the two key ids recorded after a clear — writing
    /// `key_b = 0` refuses to unlink the pair — so an inert pair may still report
    /// `key_b != 0`. What matters is that no resolver values or mode remain.
    pub fn is_cleared(&self) -> bool {
        self.value_a == 0 && self.value_b == 0 && self.mode == 0 && self.delay == 0
    }
}

/// Snap Tap / Rapid Switch pair packet, dynamic-delay layout.
///
/// Reproduces the vendor driver's `SOCDV4Pack`, which is the variant used on
/// protocol `1.0.9` (the `SOCDDynamicDelay` gate is satisfied there, while
/// `socdV2` and `socdV3` are not):
///
/// ```text
/// 5c 0b <cmd> <ck> <rw> <keyA> <keyB> <vA_lo> <vA_hi> <vB_lo> <vB_hi>
///              <mode> <type> <delay_lo> <delay_hi> 00 ...
/// ```
///
/// * byte 4 is **read (0) / write (1)**, not a selector — the vendor driver
///   sends `0` to read and `1` to write.
/// * `value_a` / `value_b` are **16-bit**, not one byte each.
/// * payload length is **11**.
///
/// The older `SOCDPack` shape (length 5, 8-bit values, no mode/type/delay) is a
/// different firmware generation. Writes in that shape are accepted but never
/// persist, which is easy to mistake for "not implemented".
pub fn pair_packet(write: bool, cmd: u8, pair: KeyPair) -> [u8; PACKET_LEN] {
    let mut b = Builder::new(cmd);
    b.put(u8::from(write));
    b.put(pair.key_a);
    b.put(pair.key_b);
    b.put_u16(pair.value_a);
    b.put_u16(pair.value_b);
    b.put(pair.mode);
    b.put(pair.key_type);
    b.put_u16(pair.delay);
    b.finish()
}

/// Decodes a `SOCD` / `RAPID_SWITCH` reply into a [`KeyPair`].
///
/// The reply mirrors the request layout, shifted by the `rw` byte, so the fields
/// live at offsets 5..15.
///
/// Returns `None` for a reply too short to contain them. A `SOCD` reply is
/// always 11 payload bytes, but this function takes a slice and is public, so it
/// must not index past the end on a malformed frame.
pub fn parse_pair(reply: &[u8]) -> Option<KeyPair> {
    if reply.len() < 15 {
        return None;
    }
    Some(KeyPair {
        key_a: reply[5],
        key_b: reply[6],
        value_a: u16::from_le_bytes([reply[7], reply[8]]),
        value_b: u16::from_le_bytes([reply[9], reply[10]]),
        mode: reply[11],
        key_type: reply[12],
        delay: u16::from_le_bytes([reply[13], reply[14]]),
    })
}

/// One Mod-Tap assignment: a key that emits `key` when tapped and the two
/// modifier keys when held.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ModTap {
    /// The key the Mod-Tap is assigned to. Also the read address.
    pub key: u8,
    /// Modifier emitted on hold, first half.
    pub modifier_a: u16,
    /// Modifier emitted on hold, second half.
    pub modifier_b: u16,
    /// Hold threshold in **10 ms units**, which is how the vendor driver sends
    /// it. [`ModTap::delay_ms`] converts for the UI.
    pub delay_tenths: u8,
}

impl ModTap {
    /// The driver's own default: 200 ms.
    pub const DEFAULT_DELAY_MS: u16 = 200;

    /// Hold threshold in milliseconds.
    pub fn delay_ms(&self) -> u16 {
        self.delay_tenths as u16 * 10
    }

    pub fn from_delay_ms(ms: u16) -> Self {
        Self {
            delay_tenths: (ms / 10).min(u8::MAX as u16) as u8,
            ..Self::default()
        }
    }
}

/// Mod-Tap packet, command 36.
///
/// Reproduces the vendor driver's `MTPack` on the `advancedKeyV2` branch, which
/// is the one that applies to protocol `1.0.9` (the gate needs `>= 1.0.3`). The
/// older branch sends 8-bit values and is deliberately not implemented.
///
/// ```text
/// 5c 07 24 <ck> <rw> <key> <modA_lo> <modA_hi> <modB_lo> <modB_hi> <delay>
/// ```
///
/// `delay` is in 10 ms units. The driver's UI holds a millisecond value and
/// divides by 10 on the way out.
pub fn mod_tap_packet(write: bool, tap: ModTap) -> [u8; PACKET_LEN] {
    let mut b = Builder::new(cmd::MOD_TAP);
    b.put(u8::from(write));
    b.put(tap.key);
    b.put_u16(tap.modifier_a);
    b.put_u16(tap.modifier_b);
    b.put(tap.delay_tenths);
    b.finish()
}

/// Decodes a Mod-Tap reply, which mirrors the request from offset 5.
pub fn parse_mod_tap(reply: &[u8]) -> Option<ModTap> {
    if reply.len() < 12 {
        return None;
    }
    Some(ModTap {
        key: reply[5],
        modifier_a: u16::from_le_bytes([reply[6], reply[7]]),
        modifier_b: u16::from_le_bytes([reply[8], reply[9]]),
        delay_tenths: reply[10],
    })
}

fn u16le(buf: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([buf[at], buf[at + 1]])
}

/// Global actuation packet. `write` selects read (0) or write (1).
///
/// Verified quirk: only the actuation field is writable on firmware 9.1; the
/// press/release deadzone fields always read back as 0. Use per-key
/// `layout::PRESS_DEADZONE` / `layout::RELEASE_DEADZONE` for deadzones.
pub fn deadzone_packet(write: bool, actuation_um: u16) -> [u8; PACKET_LEN] {
    let mut b = Builder::new(cmd::DEADZONE);
    b.put(u8::from(write));
    b.put(0);
    b.put(0);
    b.put_u16(actuation_um);
    b.put_u16(0); // press deadzone — ignored by firmware 9.1
    b.put_u16(0); // release deadzone — ignored by firmware 9.1
    for _ in 0..6 {
        b.put(0);
    }
    b.finish()
}

/// Read/write up to 14 per-key layout values.
pub fn key_layout_packet(
    write: bool,
    layout_id: u8,
    keys: &[u16],
    values: &[u16],
) -> [u8; PACKET_LEN] {
    debug_assert_eq!(keys.len(), values.len());
    let mut b = Builder::new(cmd::KEY_LAYOUT);
    b.put(u8::from(write));
    for (key, value) in keys
        .iter()
        .zip(values.iter())
        .take(cmd::MAX_KEYS_PER_PACKET)
    {
        b.put(*key as u8);
        b.put(layout_id);
        b.put_u16(*value);
    }
    b.finish()
}

/// Main RGB lighting. `write` selects read (0) or write (1).
#[allow(clippy::too_many_arguments)]
pub fn rgb_packet(
    write: bool,
    colors: &[[u8; 3]],
    enabled: bool,
    reversed: bool,
    super_response: bool,
    brightness: u8,
    effect: u8,
    speed: u8,
    sleep_minutes: u8,
    static_effect: u8,
) -> [u8; PACKET_LEN] {
    let mut b = Builder::new(cmd::RGB);
    b.put(u8::from(write));
    for _ in 0..4 {
        b.put(0);
    }
    for slot in 0..7 {
        let [r, g, blue] = colors.get(slot).copied().unwrap_or([255, 0, 0]);
        b.put(blue);
        b.put(g);
        b.put(r);
        b.put(0xFF);
    }
    for _ in 0..4 {
        b.put(0);
    }
    let mut bitmap = 0u8;
    bitmap |= u8::from(enabled);
    bitmap |= u8::from(reversed) << 1;
    bitmap |= u8::from(super_response) << 4;
    b.put(bitmap);
    b.put(brightness);
    b.put(effect);
    b.put(speed);
    b.put(sleep_minutes);
    b.put(static_effect);
    b.finish()
}

/// Requests one half of the real-time 6x21 travel matrix. `half` is 1 or 2.
pub fn realtime_travel_packet(half: u8) -> [u8; PACKET_LEN] {
    let mut b = Builder::new(cmd::REALTIME_TRAVEL);
    b.put(2);
    b.put(half);
    b.put(0xFF);
    b.put(0xFF);
    b.finish()
}

// ---------------------------------------------------------------- responses

/// A validated inbound packet.
#[derive(Debug, Clone)]
pub struct Response(pub [u8; PACKET_LEN]);

impl Response {
    pub fn is_fail(&self) -> bool {
        self.0[2] == RESP_FAIL
    }

    /// True when the device answered a structured command (`cmd::KEY_LAYOUT`,
    /// `cmd::DEADZONE`, ...), which reply with `cmd | 0x80`.
    pub fn matches(&self, cmd: u8) -> bool {
        self.0[2] == cmd.wrapping_add(RESP_OK_FLAG)
    }

    /// True when the device answered a single-value command (`order::*`).
    ///
    /// These reply with a bare `0x80` in byte 2 and echo the command in
    /// byte 5, so the echo is what distinguishes a fresh reply from a stale
    /// packet left over in the input buffer.
    pub fn matches_order(&self, cmd: u8) -> bool {
        self.0[2] == RESP_OK_FLAG && self.0[5] == cmd
    }

    /// Single-value `CMD` reply payload byte.
    pub fn value(&self) -> u8 {
        self.0[6]
    }

    pub fn firmware(&self) -> String {
        format!("{}.{}", self.0[6], self.0[7])
    }

    pub fn name(&self) -> String {
        let bytes: Vec<u8> = self.0[6..36]
            .iter()
            .copied()
            .take_while(|b| *b != 0)
            .collect();
        String::from_utf8_lossy(&bytes).trim().to_string()
    }

    /// `(step_um, min_travel_um, max_travel_um)`
    pub fn precision(&self) -> (u16, u16, u16) {
        (self.0[6] as u16, u16le(&self.0, 7), u16le(&self.0, 9))
    }

    /// Global actuation in micrometres.
    pub fn actuation_um(&self) -> u16 {
        u16le(&self.0, 7)
    }

    /// Seven RGB triplets in wire order (B, G, R).
    pub fn rgb_colors(&self) -> [[u8; 3]; 7] {
        let mut out = [[0u8; 3]; 7];
        for (i, slot) in out.iter_mut().enumerate() {
            let at = 9 + i * 4;
            *slot = [self.0[at], self.0[at + 1], self.0[at + 2]];
        }
        out
    }

    pub fn rgb_bitmap(&self) -> u8 {
        self.0[41]
    }

    pub fn rgb_brightness(&self) -> u8 {
        self.0[42]
    }

    pub fn rgb_effect(&self) -> u8 {
        self.0[43]
    }

    pub fn rgb_speed(&self) -> u8 {
        self.0[44]
    }

    pub fn rgb_sleep(&self) -> u8 {
        self.0[45]
    }

    pub fn rgb_static(&self) -> u8 {
        self.0[46]
    }

    /// `(key_a, key_b, mode, delay_ms)` — always zeros on firmware 9.1.
    pub fn socd(&self) -> (u16, u16, u8, u16) {
        (
            u16::from(self.0[5]),
            u16::from(self.0[6]),
            self.0[7],
            u16le(&self.0, 8),
        )
    }

    /// Decode the `KEY_LAYOUT` reply into `(key_id, value)` pairs.
    ///
    /// The reply repeats `(key_id, layout, value_lo, value_hi)` starting at
    /// byte 5, one quadruple per requested key.
    pub fn key_values(&self, expected: usize) -> Vec<(u16, u16)> {
        let mut out = Vec::with_capacity(expected);
        for i in 0..expected {
            let at = 5 + i * 4;
            if at + 3 >= PACKET_LEN {
                break;
            }
            out.push((u16::from(self.0[at]), u16le(&self.0, at + 2)));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a reply packet the way the firmware does.
    fn reply(cmd_byte: u8, payload: &[u8]) -> [u8; PACKET_LEN] {
        let mut buf = [0u8; PACKET_LEN];
        buf[0] = HEADER;
        buf[1] = payload.len() as u8;
        buf[2] = cmd_byte;
        for (i, byte) in payload.iter().enumerate() {
            buf[4 + i] = *byte;
        }
        buf[3] = checksum(&buf);
        buf
    }

    #[test]
    fn cmd_packet_length_and_checksum() {
        // Matches the shape Python's reference packer produced and the
        // firmware accepted: payload is [cmd, 0xFF, 0xFF].
        let pkt = cmd_packet(order::POLLING_RATE, None);
        assert_eq!(pkt[0], HEADER);
        assert_eq!(pkt[1], 3);
        assert_eq!(pkt[3], checksum(&pkt));
        assert_eq!(&pkt[4..7], &[80, 0xFF, 0xFF]);

        let with_value = cmd_packet(order::POLLING_RATE, Some(2));
        assert_eq!(with_value[1], 4);
        assert_eq!(&with_value[4..8], &[80, 2, 0xFF, 0xFF]);
        assert_eq!(with_value[3], checksum(&with_value));
    }

    #[test]
    fn checksum_folds_last_payload_byte() {
        // Hand-computed: 53 + 0x5C(92) + len(3) + cmd(0x00) + last(0xFF) = 403 = 0x193
        let pkt = cmd_packet(order::POLLING_RATE, None);
        assert_eq!(pkt[3], 0x93);
    }

    #[test]
    fn deadzone_packet_layout() {
        let pkt = deadzone_packet(true, 2000);
        assert_eq!(pkt[2], cmd::DEADZONE);
        assert_eq!(pkt[1], 15);
        assert_eq!(pkt[4], 1);
        assert_eq!(u16::from_le_bytes([pkt[7], pkt[8]]), 2000);
        assert_eq!(pkt[3], checksum(&pkt));
    }

    #[test]
    fn key_layout_packet_carries_14_triples() {
        let keys: Vec<u16> = (0..14).collect();
        let values = vec![2000u16; 14];
        let pkt = key_layout_packet(true, layout::ACTUATION, &keys, &values);
        assert_eq!(pkt[1], 1 + 14 * 4);
        assert_eq!(pkt[4], 1);
        assert_eq!(pkt[5], 0); // first key id
        assert_eq!(pkt[6], layout::ACTUATION);
        assert_eq!(u16::from_le_bytes([pkt[7], pkt[8]]), 2000);
        assert_eq!(pkt[3], checksum(&pkt));
    }

    #[test]
    fn rgb_packet_places_control_block() {
        // Payload = mode(1) + 4 pad + 7x4 colors + 4 pad + 6 control = 43 bytes.
        let pkt = rgb_packet(true, &[[1, 2, 3]; 7], true, false, true, 4, 1, 2, 3, 0);
        assert_eq!(pkt[1], 43);
        // Colors are transmitted as B, G, R.
        assert_eq!(&pkt[9..12], &[3, 2, 1]);
        assert_eq!(pkt[41], 0b0001_0001); // enabled | super response
        assert_eq!(pkt[42], 4);
        assert_eq!(pkt[43], 1);
        assert_eq!(pkt[3], checksum(&pkt));
    }

    #[test]
    fn parses_order_reply() {
        // Captured: 5C 04 80 14 | 00 50 00 FF
        let r = Response(reply(
            RESP_OK_FLAG,
            &[0x00, order::POLLING_RATE, 0x00, 0xFF],
        ));
        assert!(r.matches_order(order::POLLING_RATE));
        assert!(!r.matches_order(order::PROFILE_ID));
        assert_eq!(r.value(), 0);
    }

    #[test]
    fn parses_precision_reply() {
        // Captured: 5C 07 80 25 | 00 25 14 14 00 48 0D
        let r = Response(reply(
            RESP_OK_FLAG,
            &[0x00, order::QUERY_PRECISION, 0x14, 0x14, 0x00, 0x48, 0x0D],
        ));
        assert!(r.matches_order(order::QUERY_PRECISION));
        // resolution 20 um, min travel 20 um, max travel 3400 um
        assert_eq!(r.precision(), (20, 20, 3400));
    }

    #[test]
    fn precision_passes_through_the_no_data_marker_unchanged() {
        // The vendor reads these three fields raw and does no filtering, so
        // `precision()` must not invent values either — rejecting `0xFFFF` is
        // the caller's job (`device::distance`). Silently substituting a
        // default here would hide a firmware that stopped reporting limits.
        let r = Response(reply(
            RESP_OK_FLAG,
            &[
                0x00,
                order::QUERY_PRECISION,
                0xFF,
                0xFF,
                0xFF,
                0xFF,
                0xFF,
                0xFF,
            ],
        ));
        assert_eq!(r.precision(), (0xFF, u16::MAX, u16::MAX));
    }

    #[test]
    fn parses_name_reply() {
        let mut payload = vec![0x00, order::QUERY_NAME];
        payload.extend_from_slice(b"WIN 68 HE PRO");
        let r = Response(reply(RESP_OK_FLAG, &payload));
        assert_eq!(r.name(), "WIN 68 HE PRO");
    }

    #[test]
    fn parses_version_reply() {
        // Captured: 5C 05 80 15 | 00 01 09 01 FF
        let r = Response(reply(
            RESP_OK_FLAG,
            &[0x00, order::VERSION, 0x09, 0x01, 0xFF],
        ));
        assert_eq!(r.firmware(), "9.1");
    }

    #[test]
    fn parses_rgb_reply() {
        // Captured: 5C 2D 98 ... with bitmap 0xC3, lum 4, mode 1, speed 2
        let mut payload = vec![0x00; 45];
        payload[5..9].copy_from_slice(&[0x00, 0x00, 0xFF, 0xFF]); // color0 = #ff0000
        payload[9..13].copy_from_slice(&[0x00, 0xFF, 0x00, 0xFF]); // color1 = #00ff00
        payload[37] = 0xC3;
        payload[38] = 4;
        payload[39] = 1;
        payload[40] = 2;
        let r = Response(reply(cmd::RGB.wrapping_add(RESP_OK_FLAG), &payload));
        assert!(r.matches(cmd::RGB));
        assert_eq!(r.rgb_colors()[0], [0x00, 0x00, 0xFF]);
        assert_eq!(r.rgb_colors()[1], [0x00, 0xFF, 0x00]);
        assert_eq!(r.rgb_bitmap(), 0xC3);
        assert_eq!(r.rgb_brightness(), 4);
        assert_eq!(r.rgb_effect(), 1);
        assert_eq!(r.rgb_speed(), 2);
    }

    #[test]
    fn parses_key_layout_reply() {
        // Captured: 5C 39 A3 6D | 00 | 29 08 00 00 | 1E 08 00 00
        let payload = [
            0x00,
            41,
            layout::MODE,
            0x00,
            0x00,
            30,
            layout::MODE,
            0x00,
            0x00,
        ];
        let r = Response(reply(cmd::KEY_LAYOUT.wrapping_add(RESP_OK_FLAG), &payload));
        assert!(r.matches(cmd::KEY_LAYOUT));
        assert_eq!(r.key_values(2), vec![(41, 0), (30, 0)]);
    }

    #[test]
    fn parses_socd_reply() {
        // Captured: 5C 0B AC 48 | 00 00 00 00 00 00 00
        let r = Response(reply(cmd::SOCD.wrapping_add(RESP_OK_FLAG), &[0u8; 7]));
        assert!(r.matches(cmd::SOCD));
        assert_eq!(r.socd(), (0, 0, 0, 0));
    }

    #[test]
    fn builds_pair_frames_like_the_vendor_driver() {
        // `SOCDV4Pack(1, keyA, keyB, vA, vB, mode, type, delay)` from the
        // public driver — the dynamic-delay layout used on protocol 1.0.9.
        let pair = KeyPair {
            key_a: 0x04,
            key_b: 0x07,
            value_a: 2,
            value_b: 3,
            mode: 0x01,
            key_type: 0x00,
            delay: 10,
        };
        for cmd_id in [cmd::SOCD, cmd::RAPID_SWITCH] {
            let p = pair_packet(true, cmd_id, pair);
            assert_eq!(p[0], HEADER);
            assert_eq!(p[1], 11, "length counts payload bytes only");
            assert_eq!(p[2], cmd_id);
            assert_eq!(
                &p[4..15],
                &[1, 0x04, 0x07, 2, 0, 3, 0, 0x01, 0x00, 10, 0],
                "rw flag, keys, 16-bit values, mode, type, 16-bit delay"
            );
            assert_eq!(p[3], checksum(&p), "checksum must validate");
            assert!(p[15..].iter().all(|&b| b == 0), "padding stays zero");

            let read = pair_packet(false, cmd_id, KeyPair::CLEARED);
            assert_eq!(read[4], 0, "byte 4 is the read/write flag");
        }
    }

    #[test]
    fn builds_mod_tap_frames_like_the_vendor_driver() {
        // MTPack(1, [key], [modA], [modB], [Delay/10]) on the advancedKeyV2
        // branch, which is the one that applies to protocol 1.0.9.
        let tap = ModTap {
            key: 0x04,        // A
            modifier_a: 0xE0, // left Ctrl
            modifier_b: 0xE4, // left Alt
            delay_tenths: 20, // 200 ms, the driver's default
        };
        let p = mod_tap_packet(true, tap);
        assert_eq!(p[0], HEADER);
        assert_eq!(p[1], 7, "rw + key + two 16-bit values + delay");
        assert_eq!(p[2], cmd::MOD_TAP);
        assert_eq!(
            &p[4..11],
            &[1, 0x04, 0xE0, 0x00, 0xE4, 0x00, 20],
            "rw, key, both 16-bit modifiers little-endian, delay"
        );
        assert_eq!(p[3], checksum(&p), "checksum must validate");
        assert!(p[11..].iter().all(|&b| b == 0), "padding stays zero");

        assert_eq!(mod_tap_packet(false, tap)[4], 0, "byte 4 is read/write");
    }

    #[test]
    fn matches_a_frame_captured_from_the_vendor_driver() {
        // Captured rather than hand-assembled: in the vendor WebHID driver, drop
        // Z on the first target and E on the second for key T, then press save.
        // The 0xD0 checksum is the driver's own, so this pins header, command,
        // checksum and payload against the real thing.
        let tap = ModTap {
            key: 0x17,      // T
            modifier_a: 29, // Z
            modifier_b: 8,  // E
            delay_tenths: 20,
        };
        let p = mod_tap_packet(true, tap);
        assert_eq!(
            &p[..11],
            &[0x5C, 0x07, 0x24, 0xD0, 0x01, 0x17, 0x1D, 0x00, 0x08, 0x00, 0x14]
        );

        // The driver labels its two targets "hold" and "click", and writes them
        // to the first and second slot respectively.
        assert_eq!(tap.modifier_a, 0x1D);
        assert_eq!(tap.modifier_b, 0x08);
    }

    #[test]
    fn mod_tap_delay_converts_to_the_drivers_tenths() {
        assert_eq!(ModTap::from_delay_ms(200).delay_tenths, 20);
        assert_eq!(ModTap::from_delay_ms(200).delay_ms(), 200);
        // The driver divides by 10, so anything under 10 ms cannot be expressed.
        assert_eq!(ModTap::from_delay_ms(5).delay_tenths, 0);
        assert_eq!(ModTap::from_delay_ms(5).delay_ms(), 0);
    }

    #[test]
    fn mod_tap_round_trips_through_the_reply_layout() {
        let tap = ModTap {
            key: 0x04,
            modifier_a: 0x1234,
            modifier_b: 0x5678,
            delay_tenths: 25,
        };
        let p = mod_tap_packet(true, tap);
        let mut reply = [0u8; PACKET_LEN];
        reply[0] = HEADER;
        reply[1] = 7;
        reply[2] = cmd::MOD_TAP.wrapping_add(RESP_OK_FLAG);
        reply[5..11].copy_from_slice(&p[5..11]);
        assert_eq!(parse_mod_tap(&reply), Some(tap));
        assert_eq!(parse_mod_tap(&[0u8; 11]), None, "needs offsets up to 10");
    }

    #[test]
    fn pair_round_trips_through_the_reply_layout() {
        let pair = KeyPair {
            key_a: 0x04,
            key_b: 0x07,
            value_a: 0x0102,
            value_b: 0x0304,
            mode: 0x01,
            key_type: 0x00,
            delay: 10,
        };
        let p = pair_packet(true, cmd::SOCD, pair);
        // The reply mirrors the request from offset 5 onward.
        let mut reply = [0u8; PACKET_LEN];
        reply[0] = HEADER;
        reply[1] = 11;
        reply[2] = cmd::SOCD.wrapping_add(RESP_OK_FLAG);
        reply[5..15].copy_from_slice(&p[5..15]);
        assert_eq!(parse_pair(&reply), Some(pair));
        assert!(!pair.is_cleared());
        assert!(KeyPair::CLEARED.is_cleared());
    }

    #[test]
    fn pair_parser_rejects_a_truncated_reply() {
        assert_eq!(parse_pair(&[]), None);
        assert_eq!(parse_pair(&[0u8; 14]), None, "needs offsets up to 14");
        assert!(parse_pair(&[0u8; 15]).is_some());
    }

    #[test]
    fn pair_frames_differ_from_the_old_socd_probe_shape() {
        // The old probe sent length 6 with no read/write flag. The firmware
        // accepts such writes but never persists them, which looked exactly
        // like "Snap Tap is not implemented".
        let mut old = [0u8; PACKET_LEN];
        old[0] = HEADER;
        old[2] = cmd::SOCD;
        old[4] = 0;
        old[1] = 6;
        old[3] = checksum(&old);
        let new = pair_packet(true, cmd::SOCD, KeyPair::CLEARED);
        assert_ne!(old[1], new[1]);
        assert_ne!(old[4..], new[4..]);
    }

    #[test]
    fn recognises_failure_replies() {
        let r = Response(reply(RESP_FAIL, &[0xFF, 0x00, 0xFF]));
        assert!(r.is_fail());
        assert!(!r.matches(cmd::RGB));
    }
}
