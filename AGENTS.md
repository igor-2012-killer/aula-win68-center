# AGENTS.md

Instructions for AI agents working in this repository.

## What this is

Native desktop control panel for the **Aula WIN68 HE Pro** magnetic keyboard
(Windows). Tauri v2: the Rust back end owns the HID handle; the UI is
Preact + TypeScript. The USB protocol was reverse-engineered from the vendor's
public driver JavaScript, so `docs/VENDOR-DRIVER.md` is the protocol authority
and the board itself is the arbiter. Not affiliated with Aula/Aulastar.

## Commands

```sh
npm run build                 # frontend: tsc --noEmit + vite build
npm run app                   # Tauri dev with hot reload

cargo test --manifest-path src-tauri/Cargo.toml --lib              # unit tests, no hardware
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check

cargo build --manifest-path tools/probe/Cargo.toml --release       # probe must build standalone
cargo clippy --manifest-path tools/probe/Cargo.toml --all-targets -- -D warnings

cargo run --manifest-path tools/probe/Cargo.toml --release -- state    # hardware snapshot
```

Hardware tests write to a real keyboard (snapshot → verify → restore) and are
opt-in only: `cargo test --manifest-path src-tauri/Cargo.toml --lib -- --ignored hardware`.
`#[ignore]` is the only gate — there is no environment variable.

CI runs five jobs: frontend build, backend test + clippy + fmt, standalone
probe build, Windows release build, markdown link check.

## Architecture rules

* One I/O thread owns the HID handle (`device.rs`). Never add a second reader
  and never block the UI thread on USB I/O.
* `protocol.rs`, `hid.rs` and `keymap.rs` must stay free of Tauri and logging —
  `tools/probe` includes them by source path. A protocol change that only
  builds in the app is a bug; build the probe too.
* `src/types.ts` deliberately mirrors `src-tauri/src/state.rs`; it is the IPC
  contract. Change both sides together.
* Every reply is validated against the command sent — stale packets and request
  echoes look like valid 64-byte frames. Details in `docs/ARCHITECTURE.md`.

## Hardware safety

Writes change a real keyboard the user is holding. Non-negotiable:

* **Never send commands 12/13** (bootloader `BL_WRITE`/`BL_READ`) or
  **command 45** (Rapid Switch — silently corrupts five key modes while
  answering with a valid-looking frame).
* Advanced-key writes (Snap Tap, Mod-Tap, DKS) stay gated until the frame and
  every field value are confirmed. Snap Tap writes are disabled in `lib.rs`
  (`SNAP_TAP_WRITES_ENABLED = false`); an unverified guess already left the
  user with two dead keys once.
* Snapshot with `aula-probe state` before and after touching hardware.
* Hardware tests probe with key `T` (0x17), never Esc, and are serialised by a
  mutex in the test module — do not remove the mutex.
* The board's current live state is the user's own experimentation, not the
  baseline. Do not revert it without asking.

## Conventions

* Byte offsets come from real captures only; guessed offsets are rejected.
  Known quirks: colours travel BGR, the mode field lives in the high nibble,
  single-value replies echo the command id in byte 5.
* Changing a byte offset requires a unit test in `protocol.rs` built from a
  real captured packet — use the `reply()` and `*_packet` helpers.
* Protocol claims in the docs are labelled confirmed-by-capture vs
  transcribed-from-vendor-bundle; keep that distinction.
* Docs exist in English and Russian (`README.md` / `README.ru.md`); no Python.
* The UI is RU/EN (`src/i18n.ts`) and must not hide a hardware limitation —
  leave the control out and document why instead.
* Sliders commit on release, not per pixel: one drag = one HID write.
* Behaviour changes update `docs/PROTOCOL.md` and `docs/RESEARCH-NOTES.md`;
  the docs are part of the deliverable.
* Push only after the user has seen the change.
* Line endings are enforced to LF by `.gitattributes`; don't fight it.

## Read before touching

| Area | Read first |
|---|---|
| Protocol / commands | `docs/VENDOR-DRIVER.md`, then `docs/PROTOCOL.md` |
| Feature status and dead ends | `docs/RESEARCH-NOTES.md` (includes corrected conclusions) |
| I/O thread, reply validation, hotplug | `docs/ARCHITECTURE.md` |
| Current state and next work | `docs/HANDOFF.md` |
| Hardware-test etiquette, PR rules | `CONTRIBUTING.md` |

## Build gotcha

`generate_context!()` resolves `frontendDist` (`../dist`) at compile time, so a
bare `cargo build` on a clean checkout panics — run `npm run build` first (the
Windows CI job does this).
