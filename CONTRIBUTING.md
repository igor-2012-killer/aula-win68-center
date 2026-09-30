# Contributing

Thanks for looking. This project is small and the bar for a useful contribution
is low — documentation, a test built from a packet capture, and a UI tweak are
all real contributions.

**You do not need to own an Aula keyboard.** The most valuable thing we lack is
protocol information, and that can come from firmware source, packet captures,
or simply knowing which firmware version introduced a feature.

---

## Ways to help

| | |
|---|---|
| **Report a protocol finding** | Read [docs/RESEARCH-NOTES.md](docs/RESEARCH-NOTES.md#open-questions). If you know any of it, [open a Protocol research issue](.github/ISSUE_TEMPLATE/protocol_research.yml) — you do not have to implement anything. |
| **Contribute packet captures** | Every capture becomes a hardware-free unit test. See [Testing](#testing). |
| **Fix the UI** | Design, layout, accessibility, RU/EN strings, keyboard navigation. |
| **Add a sibling model** | `WIN68 HE MAX`, `WIN60 HE PRO` — the USB IDs are the only thing missing. |
| **Package for other platforms** | Linux and macOS support in `tauri.conf.json`. |
| **Improve the docs** | Especially if something here confused you. |

---

## Getting set up

```sh
git clone https://github.com/igor-2012-killer/aula-win68-center
cd aula-win68-center
npm install
npm run app          # development build with hot reload
```

Needs Node 20+, a stable Rust toolchain, and WebView2 (preinstalled on Windows 11
and current Windows 10).

| Command | |
|---|---|
| `npm run app` | dev build with hot reload |
| `npm run app:build` | release build + NSIS installer |
| `npm run build` | `tsc --noEmit` then `vite build` |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib` | unit tests, no hardware |
| `cargo run --manifest-path tools/probe/Cargo.toml --release -- --help` | protocol tool |

---

## Working on the protocol

**Read [docs/VENDOR-DRIVER.md](docs/VENDOR-DRIVER.md) first**, then
[docs/PROTOCOL.md](docs/PROTOCOL.md). The vendor's public driver JavaScript turns
out to be the authoritative specification, and it corrects things we had wrong:
Snap Tap and Rapid Switch *are* implemented, per-key deadzones are layouts 22/23
rather than 6/7, and command 37 returns travel limits we were assuming.

Every offset in the codebase was derived from a real capture, and several are
counter-intuitive — colours travel BGR, the mode field lives in the high nibble,
and single-value replies echo the command in byte 5.

If you change a byte offset, add or update a unit test in
`src-tauri/src/protocol.rs` using a **real captured packet**. That way your change
is verified without anyone needing hardware.

### Turning a capture into a test

`protocol.rs` has a small `reply()` helper for building a reply the way the
firmware does:

```rust
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
fn parses_my_capture() {
    let r = Response(reply(cmd::RGB + RESP_OK_FLAG, &[/* payload bytes */]));
    assert_eq!(r.rgb_brightness(), 3);
}
```

For request packets, `cmd_packet`, `deadzone_packet`, `key_layout_packet`,
`rgb_packet` and `realtime_travel_packet` already exist — extend them rather
than hand-rolling bytes.

---

## Testing

```sh
# no hardware needed
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run build
```

### Hardware tests

Some tests talk to a real keyboard. They are `#[ignore]`d and only run when you
ask for them:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --ignored hardware
```

There is no environment-variable gate — `--ignored` is the only gate. (An older
revision of this file mentioned `AULA_HW_TESTS=1`; nothing ever read it.)

**Rules if you run these against a keyboard you care about:**

* Serialisation is handled for you by a mutex in the test module, so
  `--test-threads=1` is no longer needed. Do not remove the mutex: two tests
  sharing one HID handle interleave replies and produce nonsense.
* Each existing hardware test **snapshots the value, writes, verifies, then
  restores**. Follow that pattern in new ones.
* If a test fails mid-way, restore by hand: `aula-probe state` shows what the
  keyboard currently holds, and `aula-probe set <what> <value> --yes` writes it.
* Do not add tests that write to flash, reboot the device, or touch the
  bootloader command range (structured ids 8–15).

---

## Pull requests

1. Fork and branch from `main`.
2. Keep the change focused — one topic per pull request.
3. Make sure `cargo test --lib`, `npm run build` and `cargo clippy` are clean.
4. Describe **what** changed and **how you verified it**. If you tested on
   hardware, say which keyboard and firmware version.
5. Update the docs if you changed behaviour. `docs/PROTOCOL.md` and
   `docs/RESEARCH-NOTES.md` are part of the deliverable, not an afterthought.

Do not commit build output. `dist/`, `target/`, `node_modules/` and
`src-tauri/gen/` are all ignored.

---

## Things that will be rejected

* Offsets or command ids guessed rather than captured, without saying so.
* UI that hides a hardware limitation instead of documenting it. If a feature
  does not exist in the firmware, the honest move is to leave it out and note
  why — that is why there is no Snap Tap tab today.
* Code that blocks the UI thread on USB I/O.
* Binaries, vendored vendor source, or anything that looks like leaked
  proprietary code.

---

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Please
include `aula-probe state` output — it is the fastest way to see what the
firmware thinks is going on.

---

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
