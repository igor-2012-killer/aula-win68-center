# Architecture

## Two processes, one thread

```
┌──────────────────────── Rust / Tauri ────────────────────────┐
│                                                                │
│  webview (Preact)  ──invoke──▶  commands (lib.rs)             │
│        ▲                              │                        │
│        └────── events ────────────────┤                        │
│                                       ▼                        │
│                            ┌────────────────────┐              │
│                            │  channel (mpsc)    │              │
│                            └─────────┬──────────┘              │
│                                      ▼                         │
│                            ┌────────────────────┐              │
│                            │  I/O thread        │              │
│                            │  owns HidDevice    │              │
│                            │  refresh / writes  │              │
│                            │  watchdog          │              │
│                            │  sensor stream     │              │
│                            └─────────┬──────────┘              │
│                                      ▼                         │
│                            RwLock<KeyboardState>               │
└──────────────────────────────────┬─────────────────────────────┘
                                   ▼
                            Windows HID stack
                                   ▼
                        Aula WIN68 HE Pro (MI_02)
```

### Why a dedicated I/O thread

All USB traffic goes through one thread that owns the `HidDevice`. This buys
three things:

1. **The webview never blocks.** Tauri commands hand a job to the channel and
   return; even a full 68-key refresh (27 sequential round-trips) does not stall
   rendering.
2. **Multi-packet operations are atomic.** Writing 20 keys takes two
   `KEY_LAYOUT` packets plus mode updates. Nothing can interleave between them
   and corrupt the sequence.
3. **The sensor stream and the watchdog share one clock.** There is no
   possibility of the streamer and a settings write fighting over the handle.

Cached state lives in an `RwLock` outside the actor, so `get_state` is a memory
read and never waits on I/O.

### Reply validation

The keyboard can answer with a stale packet from a previous request, or with an
echo of the request itself. Both look like valid 64-byte frames. Every reply is
therefore checked against the command that was sent:

* structured commands must answer with `cmd | 0x80` → `Response::matches()`
* single-value commands must answer with byte 2 = `0x80` **and** byte 5 echoing
  the command id → `Response::matches_order()`

A reply that fails validation is discarded and the cached value is kept. This is
what makes the lighting "echo mode" quirk survivable.

### Writing keys

`KeyPatch` describes an intent rather than a packet:

| Patch | Packets sent |
|---|---|
| `Actuation(mm)` | layout 4 with the value, then layout 8 = `Single << 4` |
| `RapidTrigger { on, press, release }` | layouts 20 and 21, then layout 8 = `RapidTrigger << 4` or `Global << 4` |
| `Deadzone { press, release }` | layouts 6 and 7 |
| `Reset` | layout 8 = 0 |

Keys are chunked into groups of 14 because that is the firmware's per-packet
limit. After writing, the cached state is patched optimistically so the UI
updates immediately; the next full refresh reconciles anything that drifted.

`KeyMode::wire_value()` exists because the firmware stores the mode field
verbatim — writing an unshifted nibble would read back as "global" and silently
lose the setting.

### Hotplug and the watchdog

Every 400 ms the I/O thread asks whether the vendor collection is still visible
to Windows. This is the only reliable disconnect test: after a polling-rate
change the keyboard stops answering queries *without reporting an error*, but it
also disappears from enumeration for about a second.

| Observed | Action |
|---|---|
| present → absent | drop the handle, mark disconnected |
| absent → present | open, full refresh, publish |
| absent → absent | stay disconnected, but keep checking |
| present → present | nothing |

### The sensor stream

The 6x21 travel matrix needs two round-trips per frame (half 1 and half 2) and
returns 192 bytes each, so it is polled on the I/O thread at ~60 Hz and pushed
to the webview as an event rather than pulled from JavaScript. Latency therefore
does not depend on the render loop, and the stream only runs while the sensor
tab is open.

---

## Frontend

Preact with hooks, no state-management library. The bundle is ~43 kB of
JavaScript (16 kB gzipped) and 20 kB of CSS.

```
src/
├── main.tsx      mount
├── app.tsx       shell: title bar, tabs, keyboard deck
├── store.ts      state, toasts, key selection, event wiring
├── ipc.ts        typed invoke wrappers + event subscriptions
├── types.ts      mirror of src-tauri/src/state.rs
├── i18n.ts       RU / EN strings
└── components/
    ├── Keyboard.tsx   interactive 68-key diagram
    ├── ui.tsx         Slider, Toggle, Segmented, Select, Button, Panel
    └── tabs/
```

`src/types.ts` duplicates the Rust state model on purpose — it is the IPC
contract, and keeping it in one file on each side makes a mismatch obvious
during review.

Sliders commit on release rather than on every pixel of drag, so dragging a
slider across the track issues one HID write, not two hundred.

---

## Module boundaries

| File | Responsibility | Depends on |
|---|---|---|
| `protocol.rs` | packet building, checksum, reply parsing | nothing |
| `hid.rs` | opening the collection, send, query, reconnect | `protocol` |
| `keymap.rs` | the 68-key physical layout | serde only |
| `state.rs` | the serialisable model | `protocol`, `keymap` |
| `device.rs` | the I/O actor, refresh, writes, streaming | all of the above + tauri |
| `lib.rs` | command surface and input validation | `device`, `state` |

`protocol.rs`, `hid.rs` and `keymap.rs` are free of Tauri and logging, which is
what lets `tools/probe` include them by source path and stay a sub-second build
with no dependency on the GUI.

---

## Testing

| Layer | How it runs |
|---|---|
| Protocol parsing | unit tests built from **captured packets** — no hardware needed |
| Key map | 68 unique keys, unique sensor cells, non-empty presets |
| Mode round-trip | `KeyMode::wire_value()` survives `from_wire()` for every mode |
| Transport and writes | `#[ignore]`d tests that run against a real keyboard |

The hardware tests restore whatever they change, so they are safe to run against
a keyboard you care about — but they do write to it, which is why they are
opt-in:

```sh
$env:AULA_HW_TESTS = 1
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --ignored hardware --test-threads=1
```

They must run single-threaded: two tests sharing one HID handle would interleave
packets.
