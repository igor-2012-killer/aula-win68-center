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
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets    # levels: that Cargo.toml [lints]
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check

cargo build --manifest-path tools/probe/Cargo.toml --release       # probe must build standalone
cargo test --manifest-path tools/probe/Cargo.toml                  # unit tests, no hardware
cargo clippy --manifest-path tools/probe/Cargo.toml --all-targets  # levels: that Cargo.toml [lints]
cargo fmt --manifest-path tools/probe/Cargo.toml -- --check

cargo run --manifest-path tools/probe/Cargo.toml --release -- state    # hardware snapshot
```

Hardware tests write to a real keyboard (snapshot → verify → restore) and are
opt-in only: `cargo test --manifest-path src-tauri/Cargo.toml --lib -- --ignored hardware`.
`#[ignore]` is the only gate — there is no environment variable.

CI runs five jobs: frontend build, backend test + clippy + fmt, standalone
probe build + test + clippy + fmt, Windows release build, markdown link check.
The docs job also runs `tools/check-repo-rules.sh` (both READMEs, no Python,
range inputs only inside `Slider`, LF in the git index). Clippy strictness is
the `[lints]` table in each `Cargo.toml` (keep the shared entries aligned: the
probe compiles `protocol.rs`, `hid.rs`, and `keymap.rs` by path). CI still
passes `-D warnings` as a backstop.

## Architecture rules

* One I/O thread owns the HID handle (`device.rs`). Never add a second reader
  and never block the UI thread on USB I/O. Locked by
  `hid_handle_is_only_opened_on_the_io_thread`: `HidDevice`, `open_device`, and
  `Link::open` / `.open(` may appear only in `hid.rs` and `device.rs` (the I/O
  thread and its `hardware` tests). `tools/probe` may call `Link::open` because
  it is a separate process, not a second reader in the app; it may not name
  `HidDevice` or call `open_device`.
* `protocol.rs`, `hid.rs` and `keymap.rs` must stay free of Tauri and logging —
  `tools/probe` includes them by source path. A protocol change that only
  builds in the app is a bug; build the probe too. Locked by
  `shared_modules_stay_free_of_tauri_and_logging` in `protocol.rs` (the app and
  the probe both run it): no `tauri`, `tauri_plugin_log`, or `log::` in code.
* IPC types, command arguments, and event payloads are generated from Rust
  into `src/generated/ipc.ts`. `cargo test` fails if that file is stale.
  Regenerate with
  `UPDATE_IPC_BINDINGS=1 cargo test --manifest-path src-tauri/Cargo.toml --lib ipc_bindings_are_fresh`.
* Every reply is validated against the command sent — stale packets and request
  echoes look like valid 64-byte frames. Details in `docs/ARCHITECTURE.md`.

## Hardware safety

Writes change a real keyboard the user is holding. Non-negotiable:

* **Never send command ids 8–15** (the bootloader block) or **command 45**
  (Rapid Switch — silently corrupts five key modes while answering with a
  valid-looking frame). `Link::send` refuses them through
  `protocol::reject_forbidden` (`protocol::FORBIDDEN_COMMANDS`); do not relax
  that guard.
* Advanced-key writes stay gated until the frame and every field value are
  confirmed against the vendor driver. Snap Tap and Mod-Tap are confirmed and
  ship enabled (`SNAP_TAP_WRITES_ENABLED` in `lib.rs` remains as a kill
  switch); an unverified guess already left the user with two dead keys once.
* Snapshot with `aula-probe state` before and after touching hardware.
* Hardware tests probe with key `T` (0x17), never Esc, and are serialised by a
  mutex in the test module — do not remove the mutex. Locked by
  `probe_key_is_t_not_esc_and_hardware_tests_hold_the_mutex`: `PROBE_KEY` must
  be 23 and must not be the Esc key id, and every `#[ignore]` test in
  `mod hardware` must bind the guard from `link()` (which locks `HW_LOCK`) for
  the whole test.
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
  Locked by `tools/check-repo-rules.sh`: both READMEs must exist, and the git
  index must not contain `*.py`, `requirements.txt`, or `pyproject.toml`.
* The UI is RU/EN (`src/i18n.ts`) and must not hide a hardware limitation —
  leave the control out and document why instead.
* Sliders commit on release, not per pixel: one drag = one HID write. Locked
  by the same script: a range input may appear only inside `function Slider`
  in `src/components/ui.tsx`.
* Behaviour changes update `docs/PROTOCOL.md` and `docs/RESEARCH-NOTES.md`;
  the docs are part of the deliverable.
* Push only after the user has seen the change.
* Line endings are enforced to LF by `.gitattributes`; don't fight it. Locked
  by the same script: `git ls-files --eol` must not report `i/crlf` or `i/mixed`.

## Read before touching

| Area | Read first |
|---|---|
| Protocol / commands | `docs/VENDOR-DRIVER.md`, then `docs/PROTOCOL.md` |
| Feature status and dead ends | `docs/RESEARCH-NOTES.md` (includes corrected conclusions) |
| I/O thread, reply validation, hotplug | `docs/ARCHITECTURE.md` |
| Current state and next work | `docs/HANDOFF.md` |
| Hardware-test etiquette, PR rules | `CONTRIBUTING.md` |

## Build gotcha

`generate_context!()` resolves `frontendDist` (`../dist`) at compile time when
the crate is built with `custom-protocol`. `src-tauri/build.rs` fails that
build with this rule — run `npm run build` first — instead of the
`generate_context!` panic "this path doesn't exist". Dev and `cargo test` use
`devUrl` and do not need `dist/`. The Windows CI job runs `npm run build`
first.
