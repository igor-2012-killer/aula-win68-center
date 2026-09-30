# Security policy

## Scope

This project talks to a keyboard over USB HID. There is no server, no account,
no telemetry, and no network access at all. The realistic threat surface is
small, but not empty.

### What is in scope

* HID packets that could permanently damage a keyboard's configuration —
  bootloader commands, flash writes, anything that might survive a factory
  reset.
* Paths where a crafted USB input could run arbitrary code locally.
* Anything in the bundled dependencies that is reachable from the app.

### What is not in scope

* Bugs that only affect the user's own keyboard settings. Those are
  [bugs](.github/ISSUE_TEMPLATE/bug_report.yml), not vulnerabilities.
* Physical attacks on your machine.
* The absence of features the firmware does not implement.
* Vulnerabilities in Tauri, WebView2 or `hidapi` themselves — please report
  those upstream. We will happily update the pinned version.

## Bootloader commands are never sent

Structured command ids **8 through 15** are the bootloader interface
(`BL_SIGN`, `BL_ERASE`, `BL_REBOOT`, `BL_TOAPP`, `BL_WRITE`, `BL_READ`,
`BL_RCRC`). The application never sends them, `aula-probe` refuses to scan that
range in `--space struct`, and contributions that add them will be rejected.

Please report anything that does send them.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://docs.github.com/en/communities/maintaining-your-safety-on-github/reporting-abuse-or-spam)
on this repository, or contact a maintainer directly via the details in their
GitHub profile.

Please do not open a public issue for a security problem first.

Include:

* what the issue is and what an attacker gains
* the version or commit you tested
* reproduction steps, ideally with `aula-probe` output
* whether real hardware was involved, and if so which model and firmware

You can expect an acknowledgement within a week. Please give us reasonable time
to ship a fix before disclosing publicly.

## Hardware safety

The tool writes to real hardware. If you are not certain a write is safe:

* Run `aula-probe state` first to record the current configuration.
* Prefer one of the `--yes`-guarded subcommands over `aula-probe raw`.
* Take a photo of your keyboard settings in the vendor app if you are unsure.
