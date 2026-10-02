# Handoff

State of the work as of the last commit in this file's history. Written for an
agent picking the project up cold, so it leads with what is true now rather than
with the order things were discovered in.

Read this, then `docs/RESEARCH-NOTES.md`. The notes are the real knowledge base
here: they record what was tried, what failed, and — importantly — which earlier
conclusions turned out to be wrong. Do not treat a claim in them as settled
without checking whether it sits under "Confirmed working" or under a section
that has since been corrected.

## What the project is

A Tauri v2 desktop app that configures a magnetic keyboard, the Aula WIN 68 HE
Pro (Windows). Rust owns the HID handle; the UI is Preact + TypeScript.

The protocol was not obtained from a spec. It was recovered from the vendor's
own JavaScript driver and then verified frame by frame against the hardware. When
something is unknown here, the vendor driver is the reference and the board is the
arbiter.

## Current state

| Area | Status |
|---|---|
| Native HID driver, framing, checksum | verified on hardware |
| Actuation (global + per-key), rapid trigger, deadzones | working, user-confirmed |
| Per-key deadzones | layouts 22/23, not the 6/7 once believed |
| Live sensor overlay | working, user-confirmed after an off-by-one fix |
| OS layout, lighting, polling, hardware profiles | working |
| **Mod-Tap** | **working, semantics confirmed** |
| **Snap Tap** | stores correctly, does not switch. Writes disabled. |
| CI | 5/5 jobs green |

Local gates, all currently passing: 36 unit tests (11 hardware tests are
`#[ignore]`d), clippy clean under `-D warnings` for both the app and the probe,
`cargo fmt --check` clean, `npm run build` clean, markdown link check clean.

## The one thing to understand about this project

Three separate times, a feature looked broken when the frame was fine and the
*interpretation* was wrong. The expensive part was never the protocol work; it
was drawing a system-level conclusion from a single observation.

The clearest case is Mod-Tap. A table of experiments showed a key emitting `Z`
on both a tap and a hold, which I concluded meant the first output slot was the
tap output and the second was dead. Wrong. The vendor labels that slot
`messages.hold`. `Z` was the hold output winning every time, and the tap slot was
never observed at all. Re-running it through the vendor's own UI produced `E` on
a short press and `Z` on a long press, and both slots worked fine.

So: when a feature appears broken, check whether the meaning of the fields is
actually known before blaming the subsystem. The vendor's own labels and
templates are the authority on field meaning, and the cheapest possible
non-zero test is worth more than any amount of further code reading.

## Hardware safety

Every write changes a real keyboard the user is holding. These are not
reversible in the usual sense:

* **Commands 12 and 13 are bootloader `BL_WRITE` / `BL_READ`.** Never send them.
* **Command 45 (Rapid Switch) corrupts the A, G, C, B and Fn modes.** It answers
  with a valid-looking structured frame rather than refusing, so it looks like it
  worked. Never send it.
* Snap Tap and Mod-Tap writes do change real key behaviour. They store and clear
  cleanly, but an unverified guess has already cost the user two dead keys once.
  **No further advanced-key writes until the frame and both field values are
  confirmed.**

Working rules, all established the hard way:

* Snapshot with `aula-probe state` before touching anything, and restore
  afterwards. Hardware test runs are serialised behind a mutex for this reason.
* The hardware test suite probes with key `T` (`0x17`), not Esc. Probing Esc wrote
  to its rapid-trigger registers and left it at 0 instead of the factory
  `0xFFFF`. Esc is now permanently `0`, which is inert in Global mode and cannot
  be restored.
* Clearing a Mod-Tap packet does **not** clear the key's mode register. Follow a
  `modtap <key> 0 0 0 --yes` with `set reset <key> --yes` or the key stays flagged
  as an advanced key.
* WebHID permission in Chrome cannot be automated. It needs one human click per
  browser profile.

Note that the board's current live state is **not** the baseline: actuation is at
3400 µm, `Z` and `X` carry mode 32, and lighting differs. That is the user's own
experimentation since the last snapshot. Do not revert it without asking.

## Repo layout

```
src-tauri/src/
  hid.rs        151  raw HID handle, I/O thread
  protocol.rs   939  framing, checksums, every command, unit tests
  keymap.rs     180  68-key layout
  state.rs      251  decoded device state
  device.rs   1835  high-level ops, hardware tests
  lib.rs        226  Tauri commands, write gates
src/                  Preact UI
tools/probe/          standalone CLI, shares protocol.rs by source path
tools/hid-capture/    WebHID frame logger, init script
docs/                 see below
```

`tools/probe` deliberately `#include`s the app's `protocol.rs`, `hid.rs` and
`keymap.rs` rather than depending on them, so it catches those modules drifting.
A protocol change that only builds in the app is a bug CI will not find; a
protocol change that breaks the probe is caught immediately.

The one I/O thread owns the HID handle. Do not add a second reader.

## Docs

* `docs/VENDOR-DRIVER.md` — the recovered protocol, with which parts are
  confirmed by capture and which are transcribed from the bundle.
* `docs/RESEARCH-NOTES.md` — everything tried, including the corrected
  conclusions. Long, and the long part is the point.
* `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md` — reference and structure.

## Next work, in priority order

### 1. Snap Tap (the real open feature)

Snap Tap is the headline feature people expect from a magnetic keyboard, and it
is the only major gap. Storage works and persists; nothing switches.

What is known: command 44, `SOCDV4Pack`, 11-byte payload, read-back matches
writes, no commit step, forces both keys to Single Mode. Writes are disabled in
`src-tauri/src/lib.rs` behind `SNAP_TAP_WRITES_ENABLED = false`, and the UI is
read-and-clear only.

What is not known: what `mode` and `type` mean. They have never had a non-zero
value that produced a behaviour change.

The reason this has not gone further is that Snap Tap has never produced a frame
with non-zero fields, so it has never been tested with a pair that was known
good. The Mod-Tap lesson applies directly. The approach that worked there:

1. Run the vendor driver under the WebHID logger.
2. Fill the slots the vendor's own UI exposes, with distinct keys, and press its
   own Save. The resulting frame is authoritative by construction.
3. Read it back over our protocol and compare.
4. Only then test behaviour, and only with values whose meaning is known.

Do not carry the Mod-Tap result over as an assumption that Snap Tap works
similarly. They are different commands with different layouts, and the parallel
is exactly the reasoning that produced the Mod-Tap error.

### 2. Dynamic DKS (command 39)

Answers `0xFF` as probed, but the vendor ships a UI page for it and
`advancedKeyV2` is on for this firmware. Check the frame shape before declaring
it dead. Same `MTPack`-style reconstruction applies.

### 3. Mod-Tap UI

The protocol is done and tested; there is no UI for it. Deliberately held back
until the semantics were confirmed, and they now are, so this is unblocked. Worth
checking against the vendor's page for the slot order and the delay slider's
range before writing it.

## How to verify

```sh
# unit tests
cargo test --manifest-path src-tauri/Cargo.toml --lib

# hardware tests, against a real board
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --ignored hardware

# protocol changes must also build standalone
cargo build --manifest-path tools/probe/Cargo.toml --release
cargo clippy --manifest-path tools/probe/Cargo.toml --all-targets -- -D warnings

# full hardware snapshot
.\tools\probe\target\release\aula-probe.exe state
```

CI (`.github/workflows/ci.yml`) runs five jobs: frontend typecheck and build,
backend test plus clippy plus fmt, standalone probe build, Windows release build,
and a markdown link check. All five were red at `53975a7` for environmental
reasons rather than code defects; `0e6c856` fixed them. The two worth knowing
about:

* The Windows job must run `npm run build` before `cargo build`. Tauri's
  `beforeBuildCommand` only fires for `tauri build`, and `generate_context!()`
  resolves `frontendDist` at compile time, so a bare `cargo build` on a clean
  checkout panics on a missing `../dist`.
* Backend and probe need Linux system libraries: Tauri's webkit2gtk set for the
  app, `libudev-dev` for `hidapi` in both.

## Conventions

* MIT, English and Russian docs, no Python.
* Every protocol claim in the docs is labelled as either confirmed by capture or
  transcribed from the bundle. Keep that distinction.
* Hardware tests restore what they change.
* Push only after the user has seen the change.
