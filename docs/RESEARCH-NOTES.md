# Research notes

A log of what has been tried against the **Aula WIN68 HE Pro**, firmware **9.1**,
protocol version **1**. The point of this file is to stop the next person from
repeating work, and to make the open questions obvious to anyone who has
information we do not.

See [PROTOCOL.md](PROTOCOL.md) for the packet formats that *do* work.

---

## Confirmed working

Verified by write → read-back on real hardware, and pinned by the tests in
`src-tauri/src/device.rs` (run with `--ignored hardware`).

| Area | Commands | Notes |
|---|---|---|
| Name, firmware, travel limits | 38, 1, 37 | limits drive the UI sliders |
| Global actuation | 41 | deadzone fields in the same packet are read-only |
| Per-key actuation | 35 / layout 4 | 14 keys per packet |
| Per-key mode | 35 / layout 8 | touch mode in the **high** nibble |
| Rapid trigger | 35 / layouts 20, 21, 8 | |
| Per-key deadzones | 35 / layouts 6, 7 | the workaround for read-only globals |
| Lighting | 24 | 43-byte payload, BGR colours |
| Polling rate | 80 | re-enumerates USB |
| Hardware profiles | 112 | |
| OS layout | 33, 34, 48, 49 | |
| Live sensor matrix | 18 | 192-byte multi-packet reply |

---

## Dead ends

These are **not** bugs in this app. The firmware does not implement them.

### Snap Tap / SOCD — command 44, read-only

This is the important one, because Snap Tap is the headline feature people expect
from a magnetic keyboard.

Command 44 **answers reads**, which is what makes it look supported: the reply is
well-formed (`0xAC`), the length is right, and the checksum validates. But the
payload is **always zero**, no matter what has been configured.

Variants attempted, all rejected:

* write flag `0`, `1`, `2`, `255`
* both documented resolvers (`0` last-won, `3` neutral)
* payload lengths 3, 6 and 7 bytes
* key pairs as HID ids (`4`/`7` for A/D) and as shifted values (`0x84`/`0x88`)
* non-zero and zeroed "disable" payloads
* delays of 0 and 10 ms
* settling for 0, 20, 60, 120 and 250 ms after the write
* writing through command **45** (`RAPID_SWITCH`) instead — also unimplemented,
  replies `0xFF` with every byte `0xFF`
* re-reading through a freshly opened handle after a profile switch

The original code in this project pointed calibration and factory reset at
commands **12 and 13**. Those are `BL_WRITE` and `BL_READ` from the *bootloader*
enum, and the keyboard does not answer them at all — which is exactly why those
features never worked.

A regression test pins the finding so it cannot be forgotten:

```
device::hardware::hardware_snap_tap_is_read_only_on_firmware_9_1
```

If a future firmware makes Snap Tap configurable, that test fails and says so.
That is the intended signal to bring the feature back.

### Mod-Tap (36), Dynamic DKS (39), Rapid Switch (45)

All answer with `0xFF` and a payload of `0xFF` bytes. Unimplemented.

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

1. **Does any released firmware implement Snap Tap?** If yes, which command, and
   does it need a separate commit step (profile save) after the write?
2. **Is there a profile "save/commit" command?** Every setting written so far
   appears to persist immediately. If profiles need an explicit commit, several
   write paths here might be subtly incomplete.
3. **What are commands 20, 21, 22, 23 as standalone structured commands?** They
   answer, and their numbers coincide with layout registers
   (`RT_PRESS`/`RT_RELEASE`/`DP`/`DR`), which suggests global variants of the
   per-key Rapid Trigger settings. Nothing has been made to change.
4. **Is there a Mod-Tap implementation under a different command id?**
5. **What does command 32 (`MACRO`) read and write?** It answers; the app has no
   macro support.
6. **Can per-key RGB (42) be driven?** It answers with a repeating
   `00 ff 00 00 00` pattern that does not look like real data.
7. **Do the unused bitmap bits (0x40, 0x80) in the RGB control byte mean
   anything?** They were set on the test keyboard and the app does not touch them.
8. **Is `QUERY_PRECISION` min travel really 0.02 mm?** That is unusually low for
   this class of keyboard and may indicate Super Response was enabled at the
   time, or that the field means something else.
9. **Do sibling models in the series share this protocol?** `WIN68 HE MAX` and
   `WIN60 HE Pro` are advertised as compatible with the vendor web driver. The
   app currently matches `0x1CA2:0x1901` only; the USB IDs of the siblings are
   unknown.
10. **What is the correct interpretation of layout 5 (`RELEASE_TRAVEL`)?** It
    ships at 1000 µm and is never written by the app.

---

## How to contribute a finding

The fastest path is [`aula-probe`](../tools/probe), which builds in about a
second and links the exact same protocol code as the app:

```sh
cargo run --manifest-path tools/probe/Cargo.toml --release -- state
cargo run --manifest-path tools/probe/Cargo.toml --release -- scan --space struct
cargo run --manifest-path tools/probe/Cargo.toml --release -- raw 5c...ff
```

Please include the packet bytes in your report — both the request and the reply
— so the finding can be turned into a unit test in `protocol.rs` that runs
without hardware. Then open a pull request against this file.

If you found something by reading firmware source rather than probing, that is
even better: open a **Protocol research** issue and include the relevant
function names or offsets.
