## What this changes

<!-- One or two sentences. Link the issue it closes: Closes #123 -->

## Why

<!-- The problem, not the solution. -->

## How it was verified

<!-- Be specific. "Ran it and looked at it" is not verification. -->

- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --lib` passes
- [ ] `npm run build` passes (`tsc --noEmit` + `vite build`)
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets` is clean
- [ ] Tested on real hardware — model and firmware version:
- [ ] New unit test added for any changed byte offset, built from a real capture
- [ ] Docs updated (`docs/PROTOCOL.md` / `docs/RESEARCH-NOTES.md` / `README`)

## Screenshots

<!-- Before and after for anything visual. -->

## Checklist

- [ ] One topic per pull request
- [ ] No build output committed (`dist/`, `target/`, `node_modules/`, `src-tauri/gen/`)
- [ ] Does not send bootloader commands (structured ids 8–15)
- [ ] Does not block the UI thread on USB I/O
- [ ] Any new hardware write restores what it changed
