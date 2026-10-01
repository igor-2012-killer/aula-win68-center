# Vendor driver analysis (Aulastar Online Driver System)

This document is derived from the **vendor's own public client-side JavaScript**,
not from guesswork and not from firmware disassembly.

| | |
|---|---|
| Source | `https://magnet.aulastar.com/assets/index-C7aUVaaC.js` |
| Size | 2.17 MB, minified, single line |
| Retrieved | 2026-09-30, via `agent-browser` / HTTP with browser-like headers |
| SHA-256 (first 8 bytes) | `636245FE485FA9DD` |

The bundle is plain JavaScript delivered to every visitor of the vendor's driver
page. Everything below is a verbatim quote or a byte-level deduction from code
found in it.

> Fetching note: requesting this URL without a browser `User-Agent` returns
> `404`. It is gated on the `Referer`/`User-Agent` pair, not on authentication.

---

## 1. Why this matters

Two long-standing open questions were answered by this bundle:

1. **Snap Tap (SOCD) and Rapid Switch (RS) are real, implemented features.**
   They are written with commands `44` and `45`. Our earlier probes concluded
   they were "not implemented" because we read them with the wrong payload.
2. **Feature availability is gated on a protocol version**, not on the
   firmware number. The keyboard reports protocol version **`1.0.9`**.

Nothing here required reading or modifying firmware. The vendor driver is the
authoritative protocol specification and it is public.

---

## 2. Transport

`writeData` in the bundle:

```js
async writeData(t){
  if(!this.device) throw new Error("No device to write to");
  const r=64;
  if(t.length===0){ console.warn("No data to send"); return }
  for(let n=0;n<t.length;n+=r){
    const a=t.slice(n,n+r);
    await this.device.sendReport(0,a)
  }
}
```

* Report size **64 bytes**, report id **0**.
* Longer payloads are simply sent as consecutive 64-byte reports.
* Device filter uses `usagePage: 65440` (`0xFFA0`) and `usage: 1`.

This matches the Rust transport in `src-tauri/src/hid.rs` exactly: 64-byte
frames, and Windows `hidapi` reports are 65 bytes with a leading `0x00`
report id.

---

## 3. Protocol version and feature gating

The version reply is parsed as:

```js
}else if(M==oe.CMDOrder.KB2_CMDODER_PROTOCOL_VERSION){
  const {ProtocolVersion:R}=qe(P);
  let E=n[3]&15, V=n[2]>>4&15, $=n[2]&15;
  R.value=`${E}.${V}.${$}`
}
```

`n` is the payload, i.e. the frame from offset 4. Our keyboard returns
`5c 05 80 15 | 00 01 09 01 ff`, giving `n[2]=0x09`, `n[3]=0x01`, therefore
**protocol version `1.0.9`**.

Features are gated by `isFeatureSupported(name)` against that version:

| Feature | Supported when |
|---|---|
| `socdV2` | `1.0.0`-`1.0.4` or `>= 1.2.0` |
| `rs` (Rapid Switch) | `1.0.0`-`1.2.5` or `>= 1.3.0` |
| `signalDead` | `>= 1.0.1` |
| `signalSwitch` | `>= 1.0.2` |
| `advancedKeyV2` | `>= 1.0.3` |
| `macroV2` | `>= 1.0.4` |
| `socdV3` | `1.0.5`-`1.0.6` |
| `topDeadSwitch` | `>= 1.0.6` |
| `SOCDDynamicDelay` | `>= 1.0.7` |
| `DynamicLightColor` | `>= 1.0.9` |

### Resolved for our keyboard (`1.0.9`)

| Feature | Status on `1.0.9` |
|---|---|
| `socdV2` | **off** (falls in the gap between `1.0.4` and `1.2.0`) |
| `socdV3` | **off** (window is `1.0.5`-`1.0.6`) |
| `SOCDDynamicDelay` | **on** |
| `rs` | **on** |
| `topDeadSwitch` | **on** |
| `signalDead`, `signalSwitch` | **on** |
| `advancedKeyV2`, `macroV2` | **on** |
| `DynamicLightColor` | **on** |

`socdV2` and `socdV3` being off on `1.0.9` is the key detail: our device uses
neither the V2 nor the V3 SOCD layout, but the dynamic-delay one.

---

## 4. Command enums (verbatim)

### `ProtocolCMD` (structured, `cmd | 0x80` reply)

```js
ProtocolCMD:{
  KB2_CMD:0, KB2_CMD_SYNC:1, KB2_CMD_KEY:35, KB2_CMD_DB:41,
  KB2_CMD_DEFKEY:43, KB2_CMD_RM6X21:18, KB2_CMD_MT:36, KB2_CMD_TGL:37,
  KB2_CMD_TDKS:38, KB2_CMD_DDKS:39, KB2_CMD_END:40, KB2_CMD_MACRO:32,
  KB2_CMD_MACROMODE:33, KB2_CMD_SOCD:44, KB2_CMD_RS:45, KB2_CMD_PRGB:24,
  KB2_CMD_LOGORGB:25, KB2_CMD_KRGB:42, KB2_BL_SIGN:8, KB2_BL_ERASE:9,
  KB2_BL_REBOOT:10, KB2_BL_TOAPP:11, KB2_BL_WRITE:12, KB2_BL_READ:13,
  KB2_BL_RCRC:14, KB2_CMD_FAIL:255
}
```

### `CMDOrder` (one-shot commands)

```js
CMDOrder:{
  KB2_CMDODER_PROTOCOL_VERSION:1, KB2_CMDODER_START_ADJUSTING:12,
  KB2_CMDODER_SAVE_ADJUSTING:13, KB2_CMDODER_FACTORY_DATA_RESET:12,
  KB2_CMDODER_QUERY_PRECISION:37, KB2_CMDODER_QUERY_KEYBOARD_NAME:38,
  KB2_CMDODER_QUERY_SYS_WIN:33, KB2_CMDODER_QUERY_SYS_MAC:34,
  KB2_CMDODER_CHANGE_SYS_WIN:48, KB2_CMDODER_CHANGE_SYS_MAC:49,
  KB2_CMDODER_RATEOFRETURN:80, KB2_CMDODER_CONFIGID:112,
  KB2_CMDODER_AXISLIST:118
}
```

`head` is `92` = `0x5C`, and every packer starts with
`[0x5C, 0, cmd, checksum]` then fills the payload at offset 4. This matches
`src-tauri/src/protocol.rs`.

### Two notes on collisions

* **`12` / `13` are dual-named.** `KB2_BL_WRITE`/`KB2_BL_READ` (bootloader) and
  `START_ADJUSTING`/`SAVE_ADJUSTING` share the same numbers *in the vendor's
  own enum*. Treat 12 and 13 as bootloader-only; never send them.
* **`33` is dual-meaning.** `KB2_CMDODER_QUERY_SYS_WIN` (order) and
  `KB2_CMD_MACROMODE` (structured) are the same command id. A bare query and a
  payload-bearing request are interpreted differently by the firmware.

---

## 5. `KeyLayout` enum and its real semantics

```js
KeyLayout:{
  Layout_Fn0:0, Layout_Fn1:1, Layout_Fn2:2, Layout_Fn3:3,
  Layout_DB0:4, Layout_DB1:5, Layout_DB2:6, Layout_DB3:7,
  Layout_Mode:8, Layout_DKS1:9, Layout_DKS2:10, Layout_DKS3:11, Layout_DKS4:12,
  Layout_TRPS1:13, Layout_TRPS2:14, Layout_TRPS3:15, Layout_TRPS4:16,
  Layout_MacroAddr:17, Layout_MacroSize:18, Layout_MTDelay:19,
  Layout_RTP:20, Layout_RTR:21, Layout_DP:22, Layout_DR:23,
  Layout_KR:24, Layout_AXIS:25
}
```

From the `KB2_CMD_KEY` reply handler, layout ids map to:

| id | Vendor name | Meaning |
|---|---|---|
| 4 | `Layout_DB0` | actuation / touch travel |
| 5,6,7 | `Layout_DB1..3` | advanced-key deadzone stages |
| 8 | `Layout_Mode` | `updateTouchMode(key, g>>4&15)` + `updateAdvancedKeyMode(key, g&15)` |
| 9-12 | `Layout_DKS1..4` | dynamic key switch |
| 13-16 | `Layout_TRPS1..4` | trigger-release / step |
| 17,18 | `Layout_MacroAddr/Size` | macro binding |
| 19 | `Layout_MTDelay` | mod-tap delay, `value*10` ms |
| 20,21 | `Layout_RTP/RTR` | quick touch press/release travel |
| **22** | **`Layout_DP`** | **dead press** |
| **23** | **`Layout_DR`** | **dead release** |
| 24 | `Layout_KR` | single-touch release |
| 25 | `Layout_AXIS` | axis id |

> Correction to earlier notes in this repo: **layouts 22 and 23 are the dead
> press / dead release zones.** Layouts 5, 6 and 7 are advanced-key deadzone
> stages, not the classic per-key deadzone pair. Values written to 6 and 7 did
> persist, but they were being interpreted as advanced-key fields.

`Layout_Mode` confirms the mode-nibble behaviour implemented by
`KeyMode::wire_value()` / `KeyMode::from_wire()`: the high nibble is the touch
mode (`GlobalMode:0`, `SingleMode:1`, `QuickMode:2`) and the low nibble is the
advanced-key mode.

---

## 6. Snap Tap and Rapid Switch

**Headline result: Snap Tap (44) works on our keyboard and is fully
configurable. Rapid Switch (45) is unsupported and actively harmful.** Both
statements were verified on real hardware, after this repo had spent a long time
concluding the opposite.

Both features are **AdvancedKey type 8** pages in the vendor UI. The bundle
contains four generations of the packet builder. The one our protocol version
uses is `SOCDV4Pack`.

### The correct frame for protocol 1.0.9 — `SOCDV4Pack`

Call sites in the bundle:

```js
// write
await r.writeData(oe.SOCDV4Pack(1,l.DKS[0],l.DKS[1],l.DKSV[0],l.DKSV[1],v.value,d.value,l.Delay))
// read
await r.writeData(oe.SOCDV4Pack(0,i.value,l.DKS[1],l.DKSV[0],l.DKSV[1],v.value,d.value,l.Delay))
await t(10);  // the driver waits 10 ms before reading
```

```js
SOCDV4Pack(e,t,r,n,a,i,o,l){
  const s=new Uint8Array(64); let u=4;
  s[0]=this.head; s[1]=0; s[2]=this.ProtocolCMD.KB2_CMD_SOCD;
  s[u++]=e; s[u++]=t; s[u++]=r;
  s[u++]=n&255; s[u++]=n>>8&255;
  s[u++]=a&255; s[u++]=a>>8&255;
  s[u++]=i; s[u++]=o;
  s[u++]=l&255; s[u++]=l>>8&255;
  s[1]=u-4; s[3]=ve.ComputeCheckSum(s);
  return s
}
```

| offset | field | notes |
|---|---|---|
| 0 | `0x5C` | `head` |
| 1 | `11` | payload length |
| 2 | `44` | `KB2_CMD_SOCD` |
| 3 | checksum | |
| 4 | `rw` | **0 = read, 1 = write** — not a selector |
| 5 | key A | also the read address |
| 6 | key B | |
| 7-8 | value A | **16-bit LE** |
| 9-10 | value B | **16-bit LE** |
| 11 | mode | resolver mode; `0` disables |
| 12 | type | trigger type |
| 13-14 | delay | **16-bit LE**, ms |

Implemented in Rust as `protocol::pair_packet` / `protocol::KeyPair` /
`protocol::parse_pair`.

### Reply parsing

```js
}else if(r===oe.ProtocolCMD.KB2_CMD_SOCD+128){
  const M=Ze();
  if(ve.isFeatureSupported("socdV3")||ve.isFeatureSupported("SOCDDynamicDelay")){
    const P=n[4]<<8|n[3], R=n[6]<<8|n[5], E=n[10]<<8|n[9];
    M.setSOCDV3Buff(n[1],n[2],P,R,n[7],n[8],E)
  }
}
```

**There is no `else` branch.** On `1.0.9` the dynamic-delay path runs, so the
reply mirrors the request from offset 5:

| payload index | frame offset | field |
|---|---|---|
| 1 | 5 | key A |
| 2 | 6 | key B |
| 3-4 | 7-8 | value A (16-bit LE) |
| 5-6 | 9-10 | value B (16-bit LE) |
| 7 | 11 | mode |
| 8 | 12 | type |
| 9-10 | 13-14 | delay (16-bit LE) |

The reply is always 11 payload bytes (`5c 0b ac ..`), even when no pair is
configured.

### Why every earlier probe saw zeros — three separate mistakes

All three had to be fixed before the feature appeared:

1. **Wrong read address.** Reads are keyed by `key_a`. A read with `key_a = 0`
   returns zeros *by design*, because key 0 is not a configured pair. This alone
   makes an unconfigured keyboard look identical to a broken one.
2. **Wrong field widths.** The old probe sent 8-bit values; the correct frame is
   16-bit.
3. **Wrong payload length.** 6 bytes before, 11 in the real frame. A
   wrong-length write is accepted and silently discarded, which is exactly what
   "unimplemented" looks like from the outside.

There is also a fourth, subtler point: the `SOCDPack` builder in the bundle
(length 5, 8-bit values, no mode/type/delay) is a **different firmware
generation**. The vendor UI page that calls it is only reachable on devices where
`socdV2`/`socdV3` apply. Copying that call site instead of the `SOCDV4Pack` one
reproduces the original bug exactly.

### Verified behaviour on our keyboard

Write, then read back, then clear:

```text
tx  5c 0b 2c c8 01 04 07 02 00 03 00 01 00 0a 00
rx  5c 0b ac 48 00 04 07 02 00 03 00 01 00 0a 00     <- echoes the pair
read back via keyA=4: keyA=0x04 keyB=0x07 vA=2 vB=3 mode=0x01 delay=10
```

Three firmware behaviours that any UI must handle:

1. **Configuring Snap Tap silently switches both keys to Single Mode.** Writing
   a pair for A/D sets the per-key mode field (layout 8) of *both* keys to
   `0x08`. Clearing the pair does **not** put them back, so the mode has to be
   saved and restored around any Snap Tap edit. Verified by isolating the test:
   modes went `0 (all)` -> `A[4]=8 D[7]=8`.
2. **A cleared pair stays recorded.** Writing `key_b = 0` does not unlink the
   pair; the firmware refuses to change it. Clearing means writing the *same*
   `key_b` with zeroed values and `mode = 0`, which leaves an inert pair behind.
   Any "no pairs configured" UI has to treat zero values as "off" rather than
   treating a non-zero `key_b` as "configured".
3. **No commit step.** The write is immediately persistent; no save/apply
   command is involved. The vendor's `SAVE_ADJUSTING` (`13`) collides with
   `BL_READ` and must never be sent.

Regression tests: `hardware_snap_tap_round_trips`, which writes, reads back,
clears, and restores the modes it disturbed.

### Mod-Tap (MT), command 36 — frame confirmed on the wire

`MTPack` was transcribed from this bundle and then **verified against real
traffic captured from the vendor's own driver** running in Chromium against the
board. See "Capture setup" at the end of this document.

Assigning Mod-Tap to `T` with a 30 ms hold threshold produced exactly one frame:

```text
5c 07 24 d0 | 01 17 00 00 00 00 00 | 14
header len cmd ck | rw key DKS0:16 DKS1:16 delay
```

* `len = 7`, `cmd = 36` (`KB2_CMD_MT`)
* byte 4 = `1` for write, `0` for read
* byte 5 = the assigned key (`0x17` = T)
* bytes 6..9 = two **16-bit** values, i.e. the `advancedKeyV2` branch, which
  applies from protocol `1.0.3` and so is the right one at `1.0.9`
* byte 10 = hold threshold in **10 ms units**; the UI held 30 ms and the driver
  sent `0x14` = 20

This is byte-identical to `protocol::mod_tap_packet`, so the Rust builder is
correct and the "the frame must be wrong" hypothesis is **eliminated** rather
than merely unfalsified. What remains unknown is only what `DKS[0]` and
`DKS[1]` *mean*: the capture showed the driver writing both as zero when no
output keys had been chosen.

### Rapid Switch (45) — never send this

`RSPack` is defined identically to `SOCDPack`, and the UI has a page for it. On
our firmware, however, command 45:

* answers with a **valid** structured reply (`45 | 0x80`) whose fields are filled
  with `0xFF` — "unset", not a refusal;
* echoes written values in the immediate response but **never persists** them;
* and, when a write is attempted, **corrupts the mode field of five keys**,
  flipping A, G, C, B and Fn into Rapid Trigger mode.

That last point is a firmware bug and the reason this repo has no test for
command 45. A test that merely asserted "45 is unsupported" was written, and
deleting it was necessary because running it changed the user's keyboard. If
Rapid Switch is ever implemented, it has to be added with full state save and
restore, like Snap Tap.

### Other SOCD generations

Present in the bundle, for firmware generations we do not have:

```js
SOCDPack(e,t,r)                 // rw, then (key,value) pairs, 8-bit values
SOCDV2Pack(e,t,r,n)             // adds a 2-bit pair selector per key
SOCDV3Pack(e,t,r,n,a,i,o)       // rw, keyA, keyB, vA16, vB16, mode, mode
SOCDV4Pack(e,t,r,n,a,i,o,l)     // adds type and a 16-bit trailing delay
```

---

## 7. `QUERY_PRECISION` (command 37) returns far more than precision

```js
const {precision:R, decimalPlace:E, minTouchTravel:V, maxTouchTravel:$,
       rtMinTouchTravel:Z, KeyboardName:J, showSuperModeSwitch:re,
       rtPrecision:j, VID:le, PID:he}=qe(P);
R.value=n[2]/1e3;
let fe=n[4]<<8|n[3]; V.value=fe/1e3;
let _e=n[6]<<8|n[5]; $.value=_e/1e3;
```

| payload index | field |
|---|---|
| 2 | precision, micrometres / 1000 |
| 3-4 | min touch travel |
| 5-6 | max touch travel |

The device supplies all three, so travel limits should be read rather than
hardcoded. The bundle then overrides by model name, for `WIN 68 HE PRO`:

```js
J.value=="WIN 68 HE PRO" && (
  V.value=.1,   // minTouchTravel
  $.value=3.4,  // maxTouchTravel
  R.value=.02,  // precision
  j.value=.02,  // rtPrecision
  Z.value=.02,  // rtMinTouchTravel
  re.value=!0   // showSuperModeSwitch
)
```

So for this board: **travel 0.1-3.4 mm, resolution 0.02 mm, RT resolution
0.02 mm, and Super Mode is available.** Our default actuation of 2000 µm
(2.0 mm) is inside the valid range, and `showSuperModeSwitch = true` is
independent confirmation that the mode nibble is meaningful.

Other models are hardcoded in the same way (`WIN 68 HE MAX` -> 0.01 mm and
`showSuperModeSwitch = false`), so the model name from command 38 is worth
reading before trusting the numbers.

---

## 8. `KB2_CMD_SYNC` (command 1, full form)

A longer variant of command 1 exposes identity data:

| payload index | field |
|---|---|
| 1-4 | `BoardID` (little-endian u32) |
| 3 | `KeyType` (overlaps `BoardID`) |
| 4 | `KeyboardLayout` (overlaps `BoardID`) |
| 5-6 | firmware version code, `>= 1000` selects the `firmwareSpaceSize` path |
| 7 | `KeyboardRunMode` |
| 9-24 | `KeyboardSN`, UTF-8 |

The overlapping reads at indices 3 and 4 look like sloppiness in the vendor
code. Our keyboard answers the short `PROTOCOL_VERSION` form with only 5 payload
bytes, so this extended form likely needs a different request; that is still
unexplored.

---

## 9. Command-by-command state, corrected

| id | Vendor name | Corrected understanding |
|---|---|---|
| 8-10, 14 | bootloader | **never send** |
| 12, 13 | `BL_WRITE` / `BL_READ`, `START_ADJUSTING` / `SAVE_ADJUSTING` | bootloader aliases, **never send** |
| 18 | `REALTIME_TRAVEL` | works, 192-byte replies are reassembled from `0x92` frames |
| 24 | `PRGB` | works |
| 25 | `LOGORGB` | answers `0xFF` on this model |
| 32 | `MACRO` | answers, `macroV2` feature present |
| 33 | `MACROMODE` / `QUERY_SYS_WIN` | dual meaning by payload shape |
| 35 | `KEY` | works; full layout enum above |
| 36 | `MT` | answers; `Layout_MTDelay` = `value*10` ms |
| 39 | `DDKS` | answers; `advancedKeyV2` present |
| 41 | `DB` | actuation works; dead press/release are layouts 22/23 |
| 42 | `KRGB` | per-key RGB, `DynamicLightColor` present |
| **44** | **`SOCD`** | **works** — Snap Tap, writable and persistent; see §6 |
| **45** | **`RS`** | **unsupported and unsafe** — corrupts 5 key modes; never send |
| 1 | `SYNC` / `PROTOCOL_VERSION` | protocol version `1.0.9`, plus identity in the long form |

---

## 10. Open items

1. ~~Re-read `44` and `45` and confirm the reply.~~ **Done** for `44`: the
   dynamic-delay frame round-trips, see §6.
2. **Physically confirm Snap Tap behaviour.** The frames store and read back
   correctly, but nobody has yet watched a press actually switch from key A to
   key B. The meaning of `mode`, `type` and the `value_a` / `value_b` fields in
   milliseconds is still inferred from the UI, not measured.
3. Determine what `mode` values `1`..`3` mean. The vendor UI has a four-entry
   mode list, so the encoding is not yet mapped.
4. Read `QUERY_PRECISION` fields 3-6 instead of assuming a travel range. The
   device reports `0xFFFF` for registers it has no data for, so the parser needs
   to treat that as "unknown" rather than a distance.
5. Determine whether `Layout_DP` / `Layout_DR` (22/23) are the real deadzones
   and what 5/6/7 actually do on this model.
6. Explore `KB2_CMD_DEFKEY` (43), which the UI uses for advanced keys.
7. Try the long `KB2_CMD_SYNC` form for serial number and true firmware version.
8. Work out whether `value_a` / `value_b` are milliseconds, Hall counts, or
   something else, and what `type` selects.

---

## 11. Safety notes for anyone poking at this firmware

* **Never send 12 or 13.** `BL_WRITE` / `BL_READ` are bootloader commands. The
  `12` / `13` names also appear as `START_ADJUSTING` / `SAVE_ADJUSTING` in the
  same enum, which is almost certainly why some old code tried them. There is no
  calibration or factory reset on this firmware.
* **Never send 45.** See §6 — it corrupts the mode field of five keys.
* **Capture the whole key state before any command you do not fully
  understand.** Snap Tap already shows the hazard: it rewrites the mode field of
  both keys in the pair as a side effect, and clearing the pair does not undo
  it.
* **`0xFFFF` means "no data", not a value.** Esc reports it for rapid-trigger
  registers, which is why a naive range check fails on it.
* Save and restore per-key modes and rapid-trigger values around every test. The
  hardware tests in `src-tauri/src/device.rs` do this, and they also take a
  global lock so the Rust test harness cannot run them against the same physical
  device in parallel.

---

## 12. Capture setup

The vendor driver is the authoritative specification, and it can be **observed**
rather than inferred. This is the harness that confirmed the Mod-Tap frame:

```sh
npx --no-install agent-browser --session hidcap --headed \
  --init-script hid-logger.js open https://magnet.aulastar.com
```

`hid-logger.js` wraps `HIDDevice.prototype.sendReport` and `receiveReport` and
pushes every frame into `window.__hidlog` as hex. It is registered as an **init
script**, so it runs before the page's own code and cannot miss the opening
handshake. Frames are read back with `agent-browser eval`, and
`window.__hidclear()` resets the buffer between experiments so a single UI action
shows up as a single frame.

The one step that cannot be automated is Chrome's WebHID permission prompt:
`navigator.hid.requestDevice` must be answered by a human once per browser
profile. Everything after that is scriptable — the "Connect" button, the
Config List, the Custom Key key picker, the delay slider and Save are all
reachable through `click`, `fill` and `eval`.

What this settled: the Mod-Tap frame (section 6) is confirmed rather than merely
transcribed.

What it did not settle: the semantics of Snap Tap's `mode` and `type`, and of
Mod-Tap's `DKS[0]` / `DKS[1]`. Both need the same harness with the corresponding
UI dialog driven far enough to write non-zero values — the Mod-Tap dialog exposes
its two output-key slots only after the assignment card exists, and the SOCD page
needs its resolver mode chosen from a list whose size is not evident from the
bundle.

No packet logger or HID proxy is needed. Wrapping `sendReport` in the page is
sufficient and far less invasive.
