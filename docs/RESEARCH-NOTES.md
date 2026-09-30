# Research notes

A log of what has been tried against the **Aula WIN68 HE Pro**, **protocol
version `1.0.9`**. The point of this file is to stop the next person from
repeating work, and to make the open questions obvious to anyone who has
information we do not.

See [PROTOCOL.md](PROTOCOL.md) for the packet formats that *do* work, and
**[VENDOR-DRIVER.md](VENDOR-DRIVER.md)** for the authoritative command, layout
and feature-gate definitions recovered from the vendor's public driver
JavaScript.

> **Several "dead ends" below were later shown to be wrong.** Snap Tap is
> implemented and configurable; the earlier probes used an incorrect frame shape
> and the wrong read address. Read the correction before trusting any entry in
> the Dead ends section. One dead end got *worse* on contact: command 45 damages
> key state, so it is not merely useless.

---

## Confirmed working

Verified by write → read-back on real hardware, and pinned by the tests in
`src-tauri/src/device.rs` (run with `--ignored hardware`).

| Area | Commands | Notes |
|---|---|---|
| Name, firmware, travel limits | 38, 1, 37 | cmd 37 also returns min/max travel and Super Mode availability; see VENDOR-DRIVER.md §7 |
| Global actuation | 41 | deadzone fields in the same packet are read-only |
| Per-key actuation | 35 / layout 4 | 14 keys per packet |
| Per-key mode | 35 / layout 8 | touch mode in the **high** nibble |
| Rapid trigger | 35 / layouts 20, 21, 8 | |
| Per-key deadzones | 35 / layouts **22, 23** — *pending verification* | previously believed to be 6, 7; the vendor names 22/23 `Layout_DP`/`Layout_DR` |
| **Snap Tap** | **44, dynamic-delay frame** | **works** — writable, persistent, no commit step; forces both keys to Single Mode |
| Lighting | 24 | 43-byte payload, BGR colours |
| Polling rate | 80 | re-enumerates USB |
| Hardware profiles | 112 | |
| OS layout | 33, 34, 48, 49 | |
| Live sensor matrix | 18 | 192-byte multi-packet reply |

---

## Dead ends

These are **not** bugs in this app. The firmware does not implement them.

### Snap Tap / SOCD — command 44 — **WORKS** (previous conclusion was wrong)

This is the important one, because Snap Tap is the headline feature people expect
from a magnetic keyboard.

**Snap Tap is implemented, writable and persistent on this keyboard.** The
earlier conclusion that it was read-only was caused by three separate mistakes in
the probe, all now fixed:

1. **Reads are keyed by the first key of the pair.** A read with `key_a = 0`
   returns zeros *by design*. Every earlier read used `0`, so an unconfigured
   keyboard was indistinguishable from a broken one.
2. **The resolver values are 16-bit**, not one byte each.
3. **The payload is 11 bytes**, not 6. A wrong-length write is accepted and
   silently discarded, which is indistinguishable from "not implemented" when
   you only look at the read-back.

The authoritative frame comes from the vendor's own driver
([`VENDOR-DRIVER.md`](VENDOR-DRIVER.md) §6). Verified round-trip:

```text
tx  5c 0b 2c c8 01 04 07 02 00 03 00 01 00 0a 00
rx  5c 0b ac 48 00 04 07 02 00 03 00 01 00 0a 00
read back via keyA=4: keyA=0x04 keyB=0x07 vA=2 vB=3 mode=0x01 delay=10
```

Pinned by `device::hardware::hardware_snap_tap_round_trips`, which writes, reads
back, clears, and restores the key modes it disturbed.

Two firmware behaviours that a UI must accommodate:

* **Configuring Snap Tap silently sets the mode field of both keys to `0x08`**
  (Single Mode). Clearing the pair does **not** revert it. Verified by isolation:
  modes went `0 (all)` -> `A[4]=8 D[7]=8`.
* **A cleared pair stays recorded.** Writing `key_b = 0` refuses to unlink it.
  Clearing means writing the same `key_b` with zeroed values and `mode = 0`.
  Treat zero values as "off", not a non-zero `key_b` as "configured".

No commit step exists: writes are immediately persistent. The vendor's
`SAVE_ADJUSTING` (`13`) collides with `BL_READ` and must never be sent.

#### Why the feature gates looked like a dead end

`isFeatureSupported` gates on protocol version, and our keyboard reports
`1.0.9`:

| feature | window | on `1.0.9` |
|---|---|---|
| `socdV2` | `1.0.0`-`1.0.4`, `>=1.2.0` | off (gap) |
| `socdV3` | `1.0.5`-`1.0.6` | off |
| `SOCDDynamicDelay` | `>= 1.0.7` | **on** |

So the driver skips its V2 and V3 code paths and uses the dynamic-delay builder.
Anyone porting Snap Tap by copying the `SOCDPack` call site — the one that is
easiest to find — reproduces the original bug exactly, because that call site
belongs to a different firmware generation.

#### Provenance of the older conclusion

The original code in this project pointed calibration and factory reset at
commands **12 and 13**. Those are `BL_WRITE` and `BL_READ` from the *bootloader*
enum, and the keyboard does not answer them at all. The vendor's own enum
contains the same collision: `KB2_BL_WRITE`/`KB2_BL_READ` and
`START_ADJUSTING`/`SAVE_ADJUSTING` are both `12`/`13`.

The test that used to pin the old conclusion,
`hardware_snap_tap_is_read_only_on_firmware_9_1`, has been **deleted and
replaced**. Its name asserted something now known to be false.

### Mod-Tap (36), Dynamic DKS (39)

All answer with `0xFF` and a payload of `0xFF` bytes. Unimplemented *as probed*.
The vendor driver confirms both exist on this generation (`advancedKeyV2` is on
for `1.0.9`, and `Layout_MTDelay` is `value * 10` ms), so these deserve the same
treatment as Snap Tap: check the frame shape in [`VENDOR-DRIVER.md`](VENDOR-DRIVER.md)
before declaring them dead.

### Rapid Switch (45) — **never send this command**

`RSPack` is built exactly like the Snap Tap packet and the vendor ships a UI page
for it, so it looks supported. It is not, and it is actively harmful:

* the reply is a **valid** structured frame (`45 | 0x80`), not a refusal, with
  every field filled with `0xFF` — "unset";
* a write is echoed back in the immediate response but **never persists**;
* attempting a write **corrupts the per-key mode field of five keys**, flipping
  A, G, C, B and Fn into Rapid Trigger mode.

That last point was discovered the hard way: a hardware test asserting "45 does
nothing" was written, and running it left the user's keyboard with five keys in
the wrong mode. The test was deleted, because a test that knowingly damages
hardware state does not belong in a suite. Anyone re-testing this must snapshot
and restore every key mode first.

If Rapid Switch is ever implemented, add it with the same state discipline as
Snap Tap.

### Logo / ambient lighting (25)

Answers `0xFF`. Not implemented. The removed UI tab was showing controls that
could never have worked.

### Calibration and factory reset

No command exists for either anywhere in the reachable range. A scan of all 256
values in both the single-value and structured spaces produced nothing.

### Endianness command (40)

Answers, but the payload alternates `00 ff ff ff` / `00 00 ff ff ff`, which looks
like uninitialised memory rather than a defined structure.

### Axis list (118)

Answers with `00 0f 00 01 00 0e 00 03`. Semantics unknown; probably switch-type
definitions. Not used by the app.

---

## Open questions

If you have firmware source, a newer version, or information from the vendor,
these are the gaps. Any of them would be a genuinely useful contribution.

Most of these were open when this file was written and have since been answered
from the vendor's driver JavaScript. Answers are given inline so the next person
does not re-derive them.

1. ~~**Does any released firmware implement Snap Tap?**~~ **Yes, and it works.**
   Command `44`, payload length 11, byte 4 is read/write, values 16-bit, reads
   keyed by the first key. See [VENDOR-DRIVER.md §6](VENDOR-DRIVER.md) and
   `hardware_snap_tap_round_trips`. *Still open:* what do `mode`, `type` and the
   two resolver values mean physically, and has anyone watched a press actually
   switch keys?
2. **Is there a profile "save/commit" command?** Every setting written so far
   appears to persist immediately. If profiles need an explicit commit, several
   write paths here might be subtly incomplete. Note the vendor enum's
   `SAVE_ADJUSTING` is `13`, which collides with `BL_READ` and is therefore not
   safe to send.
3. **What are commands 20, 21, 22, 23 as standalone structured commands?** They
   answer, and their numbers coincide with layout registers. The vendor's
   `ProtocolCMD` enum has **no** entries 20-23, so they are probably global
   variants of the per-key registers rather than commands in their own right.
   Unresolved.
4. **Is there a Mod-Tap implementation under a different command id?** The vendor
   uses command `36` with `Layout_MTDelay` (layout 19) as `value * 10` ms, so the
   feature exists on this generation; the frame shape is still unknown to us.
   Given what command 44 turned out to be, assume nothing here until a real
   frame is captured.
5. **What does command 32 (`MACRO`) read and write?** It answers; the app has no
   macro support. The `macroV2` feature gate is satisfied on `1.0.9`, and the
   vendor defines `Layout_MacroAddr`/`Layout_MacroSize` as layouts 17/18.
6. **Can per-key RGB (42) be driven?** It answers with a repeating
   `00 ff 00 00 00` pattern that does not look like real data. The
   `DynamicLightColor` feature is enabled on `1.0.9`, so the data is probably
   real and our parser is wrong.
7. **Do the unused bitmap bits (0x40, 0x80) in the RGB control byte mean
   anything?** They were set on the test keyboard and the app does not touch them.
8. ~~**Is `QUERY_PRECISION` min travel really 0.02 mm?**~~ **Resolved — it was a
   misread field.** The vendor decodes three separate 16-bit values from the
   reply: `precision = n[2]/1000`, `minTouchTravel = (n[4]<<8|n[3])/1000`,
   `maxTouchTravel = (n[6]<<8|n[5])/1000`. For `WIN 68 HE PRO` it then pins
   `minTouchTravel = 0.1`, `maxTouchTravel = 3.4`, `precision = 0.02`,
   `rtPrecision = 0.02`, `rtMinTouchTravel = 0.02`, `showSuperModeSwitch = true`.
   The 0.02 we saw was Rapid Trigger resolution, not a travel floor. The board
   itself reports `20..3400 um`, and the vendor's 3.4 mm maximum matches exactly.
9. ~~**Do sibling models share this protocol?**~~ **Partly resolved.** The vendor
   device filter enumerates `0x1CA2:0x1901`-`0x190B`, `0x1CA3:0x0E01`-`0x0E04`
   and `0x0701`, `0x1CA5:0x0401`-`0x0418`, `0x1C4F:0xEEA8`, and
   `0x1A86:0x8300` (that last one on usage page `0xFF80`). The app currently
   matches only `0x1CA2:0x1901`.
10. ~~**What is layout 5 (`RELEASE_TRAVEL`)?**~~ **Resolved.** Layout 5 is
    `Layout_DB1`, the first advanced-key deadzone stage. There is no
    `RELEASE_TRAVEL` register in the vendor's layout enum; quick-touch press and
    release travel are layouts 20 and 21.
11. **What are layouts 22 and 23 (`Layout_DP` / `Layout_DR`) on this model, and do
    they replace the clamp currently applied to layouts 6/7?**
12. **What is the real identity layout?** The vendor exposes a long
    `KB2_CMD_SYNC` form with `BoardID`, `KeyboardSN` and a firmware version code.
    Our board only answers the short version query. What triggers the long form?
13. **Why do rapid-trigger registers read `0xFFFF` on Esc but `20` on the other
    67 keys?** Presumably no sensor or no stored data for that key, but it means
    any parser has to treat `0xFFFF` as "unknown" rather than a distance.
14. **Does anything else besides Snap Tap have hidden write side effects?** Snap
    Tap rewrites the mode field of both keys as a side effect, and command 45
    corrupts five unrelated keys. Nobody has audited the remaining commands for
    this class of bug.

---

## Two dead ends that were our own bugs, not the firmware

Worth recording, because both looked exactly like a hardware limitation and both
cost real time. If a feature "cannot be set", check the tool before concluding
the firmware refuses.

**Wrong register.** Per-key deadzones were written to layouts 6/7, which the
vendor names `Layout_DB2`/`Layout_DB3` — advanced-key deadzone stages shipping
at 2.0/3.0 mm, above the actuation point. The real dead press/release are
layouts 22/23. Both pairs accept writes, so this was only ever a naming and
intent error. The tell was the factory values: 2000/3000 µm is not a deadzone
anybody ships.

**Double unit conversion.** `aula-probe`'s `write_keys` takes millimetres and
converts internally, but its callers passed micrometres, so the value was
multiplied by 1000 twice, clamped to 65535, and written as `0xFFFF` — the
firmware's "no data" marker. Every write appeared to be silently discarded, and
layouts 22/23 looked read-only. The control experiment that cracked it: the Rust
hardware test used the same packet through the same code path and round-tripped
fine, so the fault had to be in the tool. Fixed, and layouts 22/23 turned out to
be perfectly writable.

`0xFFFF` is now treated as absent everywhere (`device::distance()`), which is
also what Esc legitimately reports for its rapid-trigger registers.

---

## Snap Tap: storage works, behaviour does not (yet)

The pair **writes, reads back and persists**. It does not switch anything, and
the reason is not known. Recording this in full because two wrong guesses cost
the user a pair of dead keys.

### What is verified

* The 11-byte dynamic-delay frame (`cmd 44`) round-trips on real hardware.
* The firmware stores the pair: a read addressed at the first key returns it.
* Writing a pair switches both keys to Single Mode (layout 8 = `0x08`), and
  clearing puts their modes back.
* Clearing works from both `aula-probe` and the app, so a bad pair is always
  recoverable.

### What is not

Pressing the key does not switch between the two outputs. Two configurations were
tried on real hardware:

| `DKS` | `DKSV` | `mode` | `type` | `delay` | Result |
|---|---|---|---|---|---|
| `[4, 7]` | `[2, 2]` | 1 | 0 | 150 ms | **keys went silent** |
| `[4, 7]` | `[4, 7]` | 1 | 0 | 150 ms | stored, no effect; keys typed normally |

In the first case the keys stopped emitting anything. `DKSV` is rendered by the
vendor UI through `Keyboard_Text[DKSV[w]]` — a table of *key names* — so
`DKSV` holds HID ids, not thresholds. I had presented them in the app as numeric
"threshold" sliders and defaulted them to `2`, which is not a printable key, so
the keys dutifully emitted a code that types nothing.

Correcting that to `DKSV = [4, 7]` produced no behaviour change, which means the
remaining unknowns are `mode` and `type`. `mode` indexes a list the bundle
defines elsewhere; the only `mode1..mode4` strings found near these structures
belong to **macros**, so the Snap Tap mode list was not located.

### Why the app refuses to write

`SNAP_TAP_WRITES_ENABLED` in `src-tauri/src/lib.rs` is `false`, and
`CAN_ENABLE_SNAP_TAP` in `SnapTapTab.tsx` mirrors it. Reading and clearing stay
available, because clearing is the recovery path for anyone who wrote a pair
with an intermediate build.

A control that stores a plausible-looking configuration which silently does
nothing, or which bricks two keys, is worse than no control. The values needed
to make it work are guesses, and the cost of a wrong guess is the user's
keyboard.

### How to settle it

Run the **vendor's own driver** against the keyboard and read the packets it
sends. `https://magnet.aulastar.com` is a WebHID page; connect the board, set up
Snap Tap in its UI, and capture what goes over the wire. That answers `mode`,
`type` and the `DKSV` role in one pass, without guessing. A browser with a
WebHID-capable Chromium and a user gesture for the permission prompt is enough;
the driver's JavaScript is already in `docs/VENDOR-DRIVER.md`'s provenance notes.

Alternative: a firmware dump would show the handler for `cmd 44` outright.

---

## Open: Snap Tap's mode side effect is not visible in-process

Writing a Snap Tap pair makes the firmware switch both keys to Single Mode
(layout 8 = `0x08`). Reproducible from a fresh process every time:

```text
aula-probe set reset 4,7 --yes
aula-probe layout 8 4,7                     -> 0 x2
aula-probe pair snap 4 7 2 3 1 0 10 --yes
aula-probe layout 8 4,7                     -> 8 x2
```

Doing the same write and read from a **single long-lived process** returns the
pre-write mode, and keeps returning it after the HID handle is closed and
re-opened — even though a separate process run immediately afterwards sees `8`.
Ruled out so far: a settle delay (tried up to 2 s), the 68-query Snap Tap sweep,
reading the mode register immediately before the write, using `query` instead of
fire-and-forget `send` for the write, and holding two HID handles open at once.

So either the firmware caches the mode per connection, or the reply is being
served from a stale buffer that a fresh enumeration clears. Not yet known.

**What the app does about it:** after every Snap Tap write it drops the HID
handle and lets the watchdog reconnect, which is exactly what makes the new mode
visible. That costs about a second and only happens on an explicit Snap Tap
change. The restore of the pre-write modes does not depend on reading them back,
so it is unaffected.

**Why there is no test for it:** the behaviour cannot be reproduced
in-process, so asserting it would produce a test that passes or fails for reasons
nobody can explain. `snap_tap_mode_side_effect_is_only_visible_from_a_fresh_connection`
documents the procedure instead.

Anyone with a logic analyser or a firmware dump could settle this quickly.

---

## Esc's rapid-trigger registers do not follow the normal convention

Worth recording because it silently damaged test runs rather than failing them.

* Factory state is `0xFFFF`, the firmware's "no data" marker, like every other
  key that has no rapid-trigger data.
* **Writing 20 to Esc reads back as 20000** — a factor of 1000 that no other key
  shows.
* The `0xFFFF` marker **cannot be reproduced by writing**. Writing 0 yields 0, not
  "no data".

The second point is the trap. A test that snapshots a value and restores it will
happily read back its own earlier damage as the "original" and put it straight
back, so a wrong value becomes permanent and self-perpetuating. That is exactly
what happened: `aula-probe state` reported `300 x1, 20 x67` for Esc's rapid
trigger long after any test had run.

The hardware tests now use a mid-board key (`PROBE_KEY`, T) instead of
`all_ids()[0]`, which was Esc. A key that behaves predictably makes the restore
assertion meaningful instead of circular.

Esc itself is currently left at 0 for both rapid-trigger registers. It sits in
Global mode, where those registers do not apply, so this is inert — but the
factory `0xFFFF` is not reachable through the protocol and would need a firmware
dump to explain.

---

## Migration note for 2.0.0

Earlier builds of this app wrote per-key deadzones to layouts 6 and 7, which the
vendor names `Layout_DB2` / `Layout_DB3`. Those are advanced-key deadzone stages
that ship at 2000/3000 µm — above the actuation point — so values written there
had no useful effect and could make a key unusable. The real dead press and dead
release are layouts **22/23** (`Layout_DP` / `Layout_DR`), which ship at 200 µm.

The app now reads and writes 22/23, so **any deadzone set with an earlier build
is not carried over** and the affected keys read the factory 0.2 mm until set
again. Nothing needs fixing on the keyboard; re-apply the values in the UI.

---

## How to contribute a finding

The fastest path is [`aula-probe`](../tools/probe), which builds in about a
second and links the exact same protocol code as the app:

```sh
cargo run --manifest-path tools/probe/Cargo.toml --release -- state
cargo run --manifest-path tools/probe/Cargo.toml --release -- layout 22
cargo run --manifest-path tools/probe/Cargo.toml --release -- scan --space struct
cargo run --manifest-path tools/probe/Cargo.toml --release -- pair snap 4 7
cargo run --manifest-path tools/probe/Cargo.toml --release -- raw 5c...ff
```

`state` also lists any per-key value that differs from the majority, which is how
you confirm the keyboard is really in a known state, and it sweeps all 68 keys
for configured Snap Tap pairs. `layout <id>` reads one raw register across the
whole keymap, which is how the `KeyLayout` enum gets mapped onto real hardware.

Please include the packet bytes in your report — both the request and the reply
— so the finding can be turned into a unit test in `protocol.rs` that runs
without hardware. Then open a pull request against this file.

If you found something by reading firmware source rather than probing, that is
even better: open a **Protocol research** issue and include the relevant
function names or offsets.
