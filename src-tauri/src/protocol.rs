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
    pub const SOCD: u8 = 44;

    /// `KEY_LAYOUT` transfers at most 14 (key, layout, value) triples.
    pub const MAX_KEYS_PER_PACKET: usize = 14;
}

/// Per-key `layout` selector inside a `KEY_LAYOUT` packet.
pub mod layout {
    pub const FN0: u8 = 0;
    pub const FN1: u8 = 1;
    pub const ACTUATION: u8 = 4;
    pub const RELEASE_TRAVEL: u8 = 5;
    pub const PRESS_DEADZONE: u8 = 6;
    pub const RELEASE_DEADZONE: u8 = 7;
    /// High nibble of the value = touch mode, low nibble = advanced key mode.
    pub const MODE: u8 = 8;
    pub const RT_PRESS: u8 = 20;
    pub const RT_RELEASE: u8 = 21;
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
        assert_eq!(r.precision(), (20, 20, 3400));
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
    fn recognises_failure_replies() {
        let r = Response(reply(RESP_FAIL, &[0xFF, 0x00, 0xFF]));
        assert!(r.is_fail());
        assert!(!r.matches(cmd::RGB));
    }
}
