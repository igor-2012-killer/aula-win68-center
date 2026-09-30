# Wire protocol

Everything here was determined empirically against real hardware — an **Aula
WIN68 HE Pro**, USB IDs `0x1CA2:0x1901`, **protocol version `1.0.9`**.

> Much of this file was later cross-checked against the **vendor's own public
> driver JavaScript**, which is the authoritative spec. See
> [`VENDOR-DRIVER.md`](VENDOR-DRIVER.md) for the enum definitions, the feature
> gating table, and the real Snap Tap / Rapid Switch frame layouts. Where the
> two disagree, the vendor driver wins and this file is the thing that is
> wrong.

> If you change an offset, re-derive it from a capture. `aula-probe raw <hex>`
> prints packets, and `src-tauri/src/protocol.rs` has unit tests built from real
> captured bytes so a regression fails the test suite rather than the keyboard.

---

## 1. Transport

The keyboard exposes several HID collections. Only one speaks the vendor
protocol:

| Interface | Usage page | Usage | Purpose |
|---|---|---|---|
| `MI_00` | `0x0001` | `0x0006` | boot keyboard |
| `MI_01` Col01–04 | `0x0001`, `0x000C` | various | consumer control, media, mouse, touch |
| **`MI_02`** | **`0xFFA0`** | **`0x0001`** | **vendor control** |

Because the vendor interface is separate from the keyboard interface, opening
it never disturbs normal typing.

* Reports are **64 bytes**.
* On Windows a report id of `0x00` must be prepended, so writes are 65 bytes.
* hidapi in non-blocking mode with ~300 µs of settle time before a write and
  ~6 ms after it works reliably.

```rust
let mut framed = [0u8; 65];
framed[1..].copy_from_slice(&packet);   // framed[0] stays 0x00
device.write(&framed)?;
```

---

## 2. Frame format

```text
byte  0     1      2      3       4..
      0x5C  len    cmd    cksum   payload
```

* `len` counts payload bytes, starting at byte 4.
* `cksum = (53 + b[0] + b[1] + b[2] + b[len + 3]) & 0xFF`, where `b[len + 3]`
  is the **last payload byte**. Verified: `53 + 0x5C + 3 + 0x00 + 0xFF = 0x93`.

Worked example — read the keyboard name (`cmd 38`):

```text
tx  5c 04 00 2e 26 ff ff 00 00 ...
       ^  ^     ^        ^-- 53+0x5c+4+0x00+0x26 = 0x2e
       |  |     +-- command 38 in the payload
       |  +-------- payload length 4
       +----------- header

rx  5c 22 80 33 00 26 57 49 4e 20 36 38 20 48 45 20 50 52 4f 00 ...
       ^     ^        ^
       |     |        +-- payload: 0x00, echo of 38, then "WIN 68 HE PRO"
       |     +----------- 38 | 0x80 -> answered
       +----------------- header
```

---

## 3. Reply conventions

Two different conventions, and mixing them up silently reads stale data:

| Sender | Byte 2 | Meaning |
|---|---|---|
| Structured command | `cmd \| 0x80` | A real answer. |
| Single-value (`order`) command | `0x80` | Byte 5 **echoes the command id**. |
| Either | `0xFF` | The firmware rejected the packet. |

Byte 5's echo is what distinguishes a fresh reply from a leftover packet still
sitting in the input buffer. `protocol.rs` exposes `matches()` and
`matches_order()` for exactly this, and `aula-probe scan` prints mismatching
replies in a dim colour so they can be ignored.

> **Not every reply is an answer.** Command 24 (RGB) echoes `0x18` instead of
> `0x98` if the packet is too short. A command can also answer with the *previous*
> command's reply. Always validate.

---

## 4. Single-value commands (`order`)

Sent as `cmd = 0`, payload `[id, value?, 0xFF, 0xFF]`.

| id | Name | Byte 6 holds |
|---|---|---|
| 1 | `VERSION` | firmware major (byte 6), minor (byte 7) |
| 33 | `QUERY_SYS_WIN` | `1` = Windows layout |
| 34 | `QUERY_SYS_MAC` | `1` = macOS layout |
| 37 | `QUERY_PRECISION` | see below |
| 38 | `QUERY_NAME` | ASCII name, bytes 6..36 |
| 48 | `SET_SYS_WIN` | write `1` |
| 49 | `SET_SYS_MAC` | write `1` |
| 80 | `POLLING_RATE` | `0`=8 kHz `1`=4 k `2`=2 k `3`=1 k `4`=500 Hz |
| 112 | `PROFILE_ID` | profile slot `0..=3` |
| 118 | `AXIS_LIST` | raw, semantics unknown |

### `QUERY_PRECISION` (37) — verified reply

```text
5c 07 80 25 | 00 25 14 14 00 48 0d
              ^^  ^^^^^ ^^^^^ ^^^^
              |  |     |     max travel  0x0d48 = 3400 um = 3.40 mm
              |  |     +-- min travel   0x0014 =   20 um = 0.02 mm
              |  +-------- step         0x14   =   20 um = 0.02 mm
              +----------- echo of 37
```

These three values drive the slider bounds in the UI. Do not hard-code them.

---

## 5. Structured commands

Sent with `cmd` in byte 2 and the payload starting at byte 4.

| id | Name | State on protocol 1.0.9 |
|---|---|---|
| 8, 9, 10, 14 | bootloader sign / erase / reboot / crc | **never send these** |
| 18 | `REALTIME_TRAVEL` | works |
| 20, 21, 22, 23 | layout register aliases | answer, semantics unclear |
| 24 | `RGB` | works |
| 25 | `LOGO_RGB` | `0xFF`, not implemented |
| 32 | `MACRO` | answers, contents unknown |
| 35 | `KEY_LAYOUT` | works — the workhorse |
| 36 | `MOD_TAP` | `0xFF`, not implemented |
| 39 | `DYNAMIC_DKS` | `0xFF`, not implemented |
| 40 | `ENDURANCE` | answers, read-only |
| 41 | `DEADZONE` | actuation works, deadzone fields read-only |
| 42 | `KRGB` | per-key RGB, unimplemented |
| 43 | `DEFAULT_KEYS` | read-only |
| 44 | `SOCD` | **works** — Snap Tap, writable and persistent; dynamic-delay frame, see VENDOR-DRIVER.md §6 |
| 45 | `RAPID_SWITCH` | **never send** — unsupported, and a write corrupts 5 key modes |

### 5.1 `KEY_LAYOUT` (35) — per-key settings

Payload: `mode`, then up to 14 triples of `(key_id, layout, value_lo, value_hi)`.
`mode` `0` reads, `1` writes. Values are micrometres unless noted.

| layout id | Meaning | Unit |
|---|---|---|
| 0 | `FN0` — base layer key code | HID code |
| 1 | `FN1` — Fn layer key code | HID code |
| 4 | actuation point (`Layout_DB0`) | µm |
| 5, 6, 7 | advanced-key deadzone stages (`Layout_DB1..3`) | µm |
| 8 | mode — **high nibble is the touch mode**, low nibble is the advanced key mode | bitmap |
| 9-12 | dynamic key switch stages (`Layout_DKS1..4`) | – |
| 13-16 | trigger-release step (`Layout_TRPS1..4`) | µm |
| 19 | mod-tap delay, `value * 10` ms (`Layout_MTDelay`) | ms |
| 20 | RT press sensitivity (`Layout_RTP`) | µm |
| 21 | RT release sensitivity (`Layout_RTR`) | µm |
| **22** | **dead press** (`Layout_DP`) | µm |
| **23** | **dead release** (`Layout_DR`) | µm |
| 24 | single-touch release (`Layout_KR`) | µm |
| 25 | axis id (`Layout_AXIS`) | – |

> **Correction.** Earlier revisions of this table listed 5/6/7 as release travel
> and the press/release deadzone pair. The vendor driver names 5/6/7
> `Layout_DB1..3`, i.e. advanced-key deadzone stages, and puts the classic
> dead press / dead release on **22 and 23**. Both pairs are writable on this
> firmware, but 5/6/7 ship at 1000/2000/3000 µm — above the actuation point — so
> writing "deadzones" there makes keys unusable. Confirmed by round-trip in
> `hardware_writes_and_restores_per_key_deadzones`.
> See [`VENDOR-DRIVER.md`](VENDOR-DRIVER.md) §5.

### The `0xFFFF` "no data" marker

**Any per-key register can come back as `0xFFFF`, and it means "this key has no
value for this register", not a distance.** Read as millimetres it is 65.54 mm,
which is how Esc's rapid-trigger settings used to show up in the UI as a
nonsensical value.

Treat it as absent, not as a number. `device::distance()` is the single place
that does this, and `aula-probe` reports such keys as `no data` rather than as
outliers.

Touch modes in the high nibble of layout 8:

| nibble | Meaning |
|---|---|
| 0 | inherit the global actuation point |
| 1 | own actuation point |
| 2 | rapid trigger active |

Verified round-trip:

```text
tx  5c 05 23 bc | 01 04 04 20 03        write key 4 (A) layout 8 value 0x20
rx  5c 05 a3 6d | 00 29 08 00 00        key 41 (Esc) layout 8 value 0x00
```

> **The firmware stores byte-for-byte, it does not normalise nibbles.** Writing
> `2` reads back as `2`, which decodes as *global*. Always write
> `mode << 4`. `KeyMode::wire_value()` in `state.rs` exists so this cannot be
> got wrong by hand.

Reply layout repeats `(key_id, layout, value_lo, value_hi)` starting at byte 5,
one quadruple per requested key — so the reply is aligned with the request order.

### 5.2 `DEADZONE` (41) — global actuation

Payload: `mode`, 2 reserved bytes, then `actuation_lo/hi`, `press_dead_lo/hi`,
`release_dead_lo/hi`, then 6 reserved bytes. Length 15.

```text
tx  5c 0f 29 49 | 01 00 00 d0 07 00 00 00 00 00 00 00 00 00 00 00
                   ^^       ^^^^^^^^
                   |        2000 um = 2.00 mm
                   write
```

Only the actuation field persists. The two deadzone fields always read back as
zero — use per-key layouts **22 and 23** (`Layout_DP` / `Layout_DR`) instead.

### 5.2.1 `SOCD` (44) — Snap Tap

Works. Payload length **11**:

```text
byte  4         0 = read, 1 = write
byte  5         key A  (this is also the read address)
byte  6         key B
bytes 7..8      value A, 16-bit LE
bytes 9..10     value B, 16-bit LE
byte  11        mode (0 = disabled)
byte  12        type
bytes 13..14    delay, 16-bit LE ms
```

```text
tx  5c 0b 2c c8 01 04 07 02 00 03 00 01 00 0a 00
                 ^^  rw=1  A  B  vA=2  vB=3 mode=1 type=0 delay=10
rx  5c 0b ac 48 00 04 07 02 00 03 00 01 00 0a 00
```

Reads are keyed by byte 5. A read with byte 5 = 0 always returns zeros, which
looks exactly like "unconfigured". The reply is 11 payload bytes and mirrors the
request from offset 5 onward.

Two side effects to handle:

* Writing a pair **silently sets the mode field of both keys to `0x08`**
  (Single Mode). Clearing the pair does not revert it.
* Clearing means writing the *same* key B with zeroed values and `mode = 0`. The
  pair identity stays recorded, so treat zero values as "off".

See [VENDOR-DRIVER.md](VENDOR-DRIVER.md) §6 for the vendor source of this
layout. Rust: `protocol::pair_packet`, `protocol::KeyPair`,
`protocol::parse_pair`.

### 5.3 `RGB` (24)

Payload length **43**. Layout:

```text
byte  4        write flag (0 read / 1 write)
bytes 5..8     reserved
bytes 9..36    7 colours, each as (blue, green, red, 0xFF)
bytes 37..40   reserved
byte  41       bitmap: bit0 on, bit1 reversed, bit4 super response
byte  42       brightness 0..4
byte  43       effect 0..20
byte  44       speed 0..4
byte  45       sleep timer, minutes (0 = never)
byte  46       static effect
```

Colours travel **BGR**, not RGB. `static_effect` selects how the palette is
applied (`0` = normal cycling, `1` = solid).

Verified reply from an idle keyboard:

```text
5c 2d 98 55 | 00 00 00 00 00 00 00 | ff ff 00 ff 00 ff 00 ...
              bitmap=0xc3  lum=4  effect=1  speed=2  sleep=0  static=0
```

### 5.4 `REALTIME_TRAVEL` (18)

Payload: `mode` (`2` = millimetres), `half` (`1` = sensor rows 1–3, `2` = rows 4–6),
then `0xFF 0xFF`. Length 8.

The reply is **192 bytes across three 64-byte packets**. After a 6-byte preamble,
**63 little-endian `u16`** values in millimetres follow:

```text
byte  0..3    frame header (0x5C, len, 0x92, checksum)
bytes 4..5    payload start, half id
bytes 6..     63 x u16 LE travel, row-major, 21 columns per row
```

Half 1 covers sensor rows 1–3, half 2 covers rows 4–6. Row 6 is padding — this
keyboard has rows 1–5, i.e. 105 real sensors out of the 126-cell matrix.

---

## 6. Quirks worth knowing

**Changing the polling rate re-enumerates USB.** Writing command 80 makes the
`MI_02` collection vanish from enumeration for roughly a second. Writes issued
immediately afterwards fail silently, and reads time out without an error. The
app closes the handle, waits for the collection to reappear, then re-reads
everything. If you script against the keyboard, do the same.

**The lighting controller can latch into echo mode.** If command 24 starts
replying `0x18` instead of `0x98`, the RGB state cannot be read back — but any
RGB *write* clears it. Treat an unexpected reply as "keep the last known value"
rather than "the setting is zero".

**Layouts 5/6/7 ship at implausibly large values (1000/2000/3000 µm).** They are
`Layout_DB1..3`, advanced-key deadzone *stages*. The real deadzones are layouts
**22/23** (`Layout_DP` / `Layout_DR`), which ship at a sensible 200 µm and are
what the app now writes.

**`QUERY_SYS_WIN` returning 0 means macOS**, not "disconnected". There is no
single boolean; check both 33 and 34.

---

## 7. Verifying a change

```sh
# Build the standalone probe — no Tauri, builds in about a second.
cargo run --manifest-path tools/probe/Cargo.toml --release -- state

# Send one packet by hand and see the reply.
cargo run --manifest-path tools/probe/Cargo.toml --release -- \
    raw 5c04002 6ff ff00

# Sweep a command range. Green = answered, dim = echo or stale packet.
cargo run --manifest-path tools/probe/Cargo.toml --release -- \
    scan --space struct --from 16 --to 46
```

Add every new finding to [RESEARCH-NOTES.md](RESEARCH-NOTES.md), including the
negative results — those are the ones that save the next person a week.
