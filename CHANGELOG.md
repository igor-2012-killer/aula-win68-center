# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

* **Mod-Tap tab** — assign a hold output and a tap output to any key with a
  hold threshold in 10 ms steps. The frame was already verified against the
  vendor driver's own captured traffic; this adds the UI, a whole-board scan
  for existing assignments, and a clear path that also resets the advanced-key
  flag while keeping the key's touch mode.
* **Configuration export/import** in the System tab: actuation, Rapid Trigger,
  deadzones, lighting, polling rate, profile and OS layout travel to a JSON
  file and back.
* **Disconnect handling** — an offline banner with a working Reconnect button,
  connection state driven by backend status events, and an honest boot screen
  instead of an eternal "Connecting…".
* Snap Tap resolver mode labels recovered from the vendor bundle
  (last-pressed-wins / first-key priority / second-key priority / neutral);
  documented in [VENDOR-DRIVER.md §6](docs/VENDOR-DRIVER.md).

### Fixed

* **The app handle was lost when the keyboard was absent at startup**, leaving
  every event and every later reconnect blind until an app restart.
* **Applying a deadzone silently rewrote the key's touch mode to Global on the
  wire** while the UI kept saying Rapid Trigger. Deadzone patches no longer
  touch the mode register.
* **A short HID reply could abort the whole process** in release builds
  (`panic = "abort"`); short reads are rejected instead.
* **Commands reported success while the keyboard was absent.** Jobs refused
  before the device opened now answer with an error, so the UI cannot show a
  save that never reached the keyboard.
* **Arrows preset missed ↑** — the keymap labelled it `▲`, so the preset carried
  three of the four arrows.
* **Sensor peak hold never decayed** — the decay interval was re-created ~60
  times per second and never got to tick. Peaks now decay, have a reset button,
  and stream frames are coalesced to one store update per animation frame.
* **Every IPC call leaked an 8-second pending rejection** behind its timeout.
* **Sliders kept showing a value the keyboard refused.** A failed commit now
  rolls the draft back; commits are silent on success and loud on failure.
* Two hardware tests wrote to Esc against their own documented rule and one
  never restored the mode it overwrote; they now use the mid-board probe key
  and restore what they change.
* Tauri commands are async now — synchronous ones could block the main thread
  for the full 6 s request timeout against a stalling device.
* The English string table had a Russian "delay" label; effect and sleep-timer
  names are localized; dead i18n keys removed.

## [2.0.0] — 2026-09-30

Complete rewrite. The previous version could not communicate with the keyboard
at all; see "Fixed" below.

### Added

* **Native HID driver** with a verified wire protocol, reverse engineered from
  real hardware (WIN68 HE Pro, firmware 9.1, protocol v1).
* **Single I/O thread** owning the HID handle, so the UI never blocks and
  multi-packet writes stay atomic.
* **Hotplug watchdog** that detects unplugging and the ~1 s USB re-enumeration
  caused by polling-rate changes.
* **Actuation control** — global point bounded by the range the keyboard reports,
  per-key points, reset to global for a selection or all 68 keys.
* **Rapid Trigger** with per-key press/release sensitivity and game presets.
* **Per-key deadzones**, working around the read-only global deadzone fields.
* **Lighting control** — 21 effects, brightness, speed, direction, sleep timer,
  Super Response, and a 7-colour palette with a full colour picker.
* **Live Hall-sensor monitor** — 68 gauges with peak hold, streamed as events at
  ~60 Hz instead of being polled from JavaScript.
* **System tab** — polling rate 500–8000 Hz with per-step latency, 4 on-keyboard
  profiles, Windows/macOS layout switching, full device readout.
* **Interactive 68-key diagram** with mode colouring, live travel overlay and
  multi-select.
* **RU/EN interface.**
* **`aula-probe`**, a standalone protocol research CLI that links the same
  protocol code as the app.
* **Hardware-gated integration tests** that write to a keyboard and restore what
  they changed.
* **Documentation** — [protocol reference](docs/PROTOCOL.md), [research notes
  with open questions](docs/RESEARCH-NOTES.md), and an
  [architecture overview](docs/ARCHITECTURE.md).

### Fixed

* **The application could not talk to the backend at all.** `withGlobalTauri` was
  never enabled, so `window.__TAURI__` was undefined and every call silently fell
  through to a `fetch` that always failed. No setting could be changed.
* **Calibration and factory reset did nothing.** Both pointed at commands 12 and
  13, which are bootloader commands (`BL_WRITE`/`BL_READ`), not calibration. The
  keyboard does not answer them at all.
* **Per-key mode was written to the wrong nibble.** The firmware stores the mode
  field verbatim, so writing an unshifted nibble read back as "global" and lost
  Rapid Trigger after a restart. `KeyMode::wire_value()` now makes the shift
  impossible to get wrong, with a round-trip test.
* **Precision and travel limits were never read from the device**, so slider
  bounds were hard-coded. They now come from command 37.
* **Rapid Trigger defaults were wrong** (0.20 mm assumed; the keyboard reports
  0.02 mm).
* **Key remapping and profile switching were fake** — the UI showed controls that
  only displayed a toast and never sent anything.

### Removed

Features that do not exist in firmware 9.1. They are gone from the UI rather than
present and broken; each has a regression test documenting the finding.

* **Snap Tap / SOCD** — command 44 answers reads but always returns zeros.
  Eleven write variants were rejected, as was writing through command 45.
* **Mod-Tap (36), Dynamic DKS (39), Rapid Switch (45)** — return `0xFF`.
* **Logo / ambient lighting (25)** — returns `0xFF`.
* **Global deadzones** — the fields always read back as zero. Per-key deadzones
  replace them and do work.

### Changed

* Front end moved from 848 lines of vanilla JavaScript to Preact + TypeScript
  with Vite. The bundle is 43 kB (16 kB gzipped).
* Per-key writes chunked to the firmware's 14-key packet limit.
* Sliders commit on release instead of on every drag step, so a drag issues one
  HID write rather than two hundred.
* Release build reduced to a 3.2 MB binary; the installer is 1.2 MB.

[Unreleased]: https://github.com/igor-2012-killer/aula-win68-center/compare/v2.0.0...HEAD
