//! `aula-probe` — a dependency-light HID probing tool for Aula magnetic
//! keyboards.
//!
//! It exists so that protocol research does not require building the GUI. It
//! links the *same* `protocol.rs` and `hid.rs` the app uses, so anything it
//! prints is directly comparable with the bytes the app sends.
//!
//! ```text
//! aula-probe devices                    list vendor HID collections
//! aula-probe state                      dump the decoded keyboard state
//! aula-probe raw <hex>                  send one packet, print the reply
//! aula-probe query <id> [--space s]     read one command
//! aula-probe scan [--space s] [--range] sweep the command space
//! aula-probe set <what> <args...>       guarded writes (need --yes)
//! aula-probe travel                     sample the live Hall-sensor matrix
//! ```

// The modules below are shared with the GUI app by source inclusion, so this
// crate only exercises part of each. `dead_code` is allowed on the module
// declarations rather than crate-wide, to keep the probe's own code checked.
// (`protocol.rs` carries its own inner allow, since the app needs it too.)
#[path = "../../../src-tauri/src/protocol.rs"]
mod protocol;

#[path = "../../../src-tauri/src/hid.rs"]
#[allow(dead_code)]
mod hid;

#[path = "../../../src-tauri/src/keymap.rs"]
#[allow(dead_code)]
mod keymap;

use std::process::ExitCode;

use hid::Link;
use hidapi::HidApi;
use protocol as p;

const RESET: &str = "\x1b[0m";
const DIM: &str = "\x1b[2m";
const BOLD: &str = "\x1b[1m";
const RED: &str = "\x1b[31m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || args[0] == "-h" || args[0] == "--help" {
        print_help();
        return ExitCode::SUCCESS;
    }

    let confirmed = args.iter().any(|a| a == "--yes");
    let positional: Vec<&str> = args
        .iter()
        .map(String::as_str)
        .filter(|a| *a != "--yes")
        .collect();

    let mut api = match HidApi::new() {
        Ok(api) => api,
        Err(err) => {
            eprintln!("{RED}hidapi init failed:{RESET} {err}");
            return ExitCode::FAILURE;
        }
    };

    let mut link = Link::default();
    if !link.open(&mut api) {
        eprintln!(
            "{RED}No Aula keyboard found.{RESET}\n\
             Looking for VID {:#06x} PID {:#06x}, usage page {:#06x} usage {:#06x}.",
            hid::VENDOR_ID,
            hid::PRODUCT_ID,
            hid::USAGE_PAGE,
            hid::USAGE
        );
        return ExitCode::FAILURE;
    }

    let result = match positional[0] {
        "devices" => cmd_devices(&mut api),
        "state" => cmd_state(&mut link),
        "raw" => cmd_raw(&mut link, &positional[1..]),
        "query" => cmd_query(&mut link, &positional[1..]),
        "scan" => cmd_scan(&mut api, &mut link, &positional[1..]),
        "set" => cmd_set(&mut api, &mut link, &positional[1..], confirmed),
        "travel" => cmd_travel(&mut link),
        other => {
            eprintln!("{RED}unknown command{RESET} {other:?} — try --help");
            ExitCode::FAILURE
        }
    };
    result
}

fn print_help() {
    println!(
        "\
{BOLD}aula-probe{RESET} {DIM}— HID probing tool for Aula magnetic keyboards{RESET}

{BOLD}USAGE{RESET}
  aula-probe <command> [args]

{BOLD}COMMANDS{RESET}
  {BOLD}devices{RESET}                          list every HID collection of the keyboard
  {BOLD}state{RESET}                            dump the decoded keyboard state
  {BOLD}raw <hex>{RESET}                        send one packet, print the reply
  {BOLD}query <id> [--space order|struct]{RESET} read one command
  {BOLD}scan [--space order|struct] [--from N] [--to N]{RESET}
                                          sweep the command space
  {BOLD}travel{RESET}                           sample the live Hall-sensor matrix
  {BOLD}set <what> <args...> --yes{RESET}      guarded writes

{BOLD}WRITES{RESET}
  set actuation <mm>                    global actuation point
  set key-actuation <ids> <mm>          per-key actuation point
  set rt <ids> <press> <release>        per-key rapid trigger
  set deadzone <ids> <press> <release>  per-key deadzones
  set reset <ids>                       per-key back to global mode
  set polling <index>                   0=8k 1=4k 2=2k 3=1k 4=500   (re-enumerates USB)
  set profile <0-3>                     hardware profile slot
  set os <win|mac>                      OS layout profile

{BOLD}NOTES{RESET}
  <ids> accepts comma separated HID ids, e.g. {BOLD}4,22,26{RESET} for A, S, W.
  {YELLOW}Changing the polling rate makes the USB interface disappear for ~1s.{RESET}
  {YELLOW}Every write changes real hardware. `--yes` is mandatory.{RESET}
"
    );
}

fn flag(args: &[&str], name: &str) -> Option<String> {
    let key = format!("--{name}");
    args.iter()
        .position(|a| *a == key)
        .and_then(|i| args.get(i + 1))
        .map(|s| (*s).to_string())
}

fn open_link<'a>(api: &'a mut HidApi, link: &'a mut Link) -> &'a mut Link {
    if !link.is_open() {
        if !link.open(api) {
            eprintln!("{RED}device went away and could not be reopened{RESET}");
            std::process::exit(1);
        }
        println!("{DIM}(reopened after USB re-enumeration){RESET}");
    }
    link
}

// ----------------------------------------------------------------- commands

fn cmd_devices(api: &mut HidApi) -> ExitCode {
    let _ = api.refresh_devices();
    println!("{BOLD}HID collections for the keyboard{RESET}\n");
    let mut found = false;
    for d in api.device_list() {
        let ours = hid::matches_vendor(d);
        if !ours && d.vendor_id() != hid::VENDOR_ID {
            continue;
        }
        found = true;
        let tag = if ours {
            format!("{GREEN}<- vendor control{RESET}")
        } else {
            DIM.into()
        };
        println!(
            "  {:<34} page {:#06x} usage {:#06x} if{}  {}{}",
            d.product_string().unwrap_or("?"),
            d.usage_page(),
            d.usage(),
            d.interface_number(),
            d.serial_number().unwrap_or(""),
            tag
        );
    }
    if !found {
        println!("  {DIM}no collections found{RESET}");
    }
    ExitCode::SUCCESS
}

fn cmd_state(link: &mut Link) -> ExitCode {
    println!("{BOLD}Keyboard state{RESET}\n");

    if let Some(r) = link.query_order(p::order::QUERY_NAME) {
        println!("  name            {}", r.name());
    }
    if let Some(r) = link.query_order(p::order::VERSION) {
        println!("  firmware        {}", r.firmware());
    }
    if let Some(r) = link.query_order(p::order::QUERY_PRECISION) {
        let (step, min, max) = r.precision();
        println!(
            "  travel          {min}..{max} um, step {step} um  ({:.2}..{:.2} mm, step {:.2} mm)",
            min as f32 / 1000.0,
            max as f32 / 1000.0,
            step as f32 / 1000.0
        );
    }
    if let Some(r) = link.query_order(p::order::POLLING_RATE) {
        println!("  polling index   {}", r.value());
    }
    if let Some(r) = link.query_order(p::order::PROFILE_ID) {
        println!("  profile         {}", r.value());
    }
    if let Some(r) = link.query_order(p::order::QUERY_SYS_WIN) {
        println!(
            "  os layout       {}",
            if r.value() == 1 { "windows" } else { "macos" }
        );
    }

    if let Some(r) = link.query(p::deadzone_packet(false, 0)) {
        if r.matches(p::cmd::DEADZONE) {
            println!(
                "  actuation       {} um ({:.2} mm)",
                r.actuation_um(),
                r.actuation_um() as f32 / 1000.0
            );
        }
    }

    let query = p::rgb_packet(false, &[[255, 0, 0]; 7], false, false, false, 0, 0, 0, 0, 0);
    if let Some(r) = link.query(query) {
        if r.matches(p::cmd::RGB) {
            let b = r.rgb_bitmap();
            println!(
                "  lighting        on={} reversed={} super={} brightness={}/4 effect={} speed={}/4 sleep={}min static={}",
                b & 1 != 0,
                b & 2 != 0,
                b & 0x10 != 0,
                r.rgb_brightness(),
                r.rgb_effect(),
                r.rgb_speed(),
                r.rgb_sleep(),
                r.rgb_static()
            );
            let hexes: Vec<String> = r
                .rgb_colors()
                .iter()
                .map(|c| format!("#{:02x}{:02x}{:02x}", c[2], c[1], c[0]))
                .collect();
            println!("  palette         {}", hexes.join(" "));
        } else {
            println!(
                "  lighting        {YELLOW}query rejected (0x{:02x}){RESET}",
                r.0[2]
            );
        }
    }

    if let Some(r) = link.query(socd_read()) {
        if r.matches(p::cmd::SOCD) {
            let (a, b, mode, delay) = r.socd();
            println!("  snap tap        a={a} b={b} mode={mode} delay={delay}ms  {DIM}(always zero on fw 9.1){RESET}");
        }
    }

    let ids = keymap::all_ids();
    for (label, layout_id) in [
        ("mode         ", p::layout::MODE),
        ("actuation um ", p::layout::ACTUATION),
        ("rt press um  ", p::layout::RT_PRESS),
        ("rt release um", p::layout::RT_RELEASE),
    ] {
        let values = read_layout(link, layout_id, &ids);
        let mut distinct: Vec<(u16, usize)> = Vec::new();
        for id in &ids {
            let v = values.get(id).copied().unwrap_or(0);
            match distinct.iter_mut().find(|(value, _)| *value == v) {
                Some((_, n)) => *n += 1,
                None => distinct.push((v, 1)),
            }
        }
        let summary: Vec<String> = distinct
            .iter()
            .map(|(v, n)| {
                if *n == ids.len() {
                    format!("{v} (all)")
                } else {
                    format!("{v} x{n}")
                }
            })
            .collect();
        println!("  {label}      {}", summary.join(", "));
    }

    println!(
        "\n  keys           {} total, all answered: {}",
        ids.len(),
        read_layout(link, p::layout::MODE, &ids).len() == ids.len()
    );
    ExitCode::SUCCESS
}

fn cmd_raw(link: &mut Link, args: &[&str]) -> ExitCode {
    let Some(hex) = args.first() else {
        eprintln!("usage: aula-probe raw <64 hex chars>");
        return ExitCode::FAILURE;
    };
    let Some(bytes) = decode_hex(hex) else {
        eprintln!("{RED}invalid hex{RESET}");
        return ExitCode::FAILURE;
    };
    if bytes.len() != p::PACKET_LEN {
        eprintln!(
            "{RED}packets are {} bytes{RESET} — got {}. The leading 00 report id is added automatically.",
            p::PACKET_LEN,
            bytes.len()
        );
        return ExitCode::FAILURE;
    }
    let mut packet = [0u8; p::PACKET_LEN];
    packet.copy_from_slice(&bytes);
    dump_packet("tx", &packet);

    match link.query(packet) {
        Some(r) => {
            dump_packet("rx", &r.0);
            let _ = link.send(packet);
            ExitCode::SUCCESS
        }
        None => {
            println!("{DIM}no reply (the keyboard echoes nothing for writes){RESET}");
            ExitCode::SUCCESS
        }
    }
}

fn cmd_query(link: &mut Link, args: &[&str]) -> ExitCode {
    let Some(id) = args.first().and_then(|s| s.parse::<u8>().ok()) else {
        eprintln!("usage: aula-probe query <id> [--space order|struct]");
        return ExitCode::FAILURE;
    };
    let space = flag(args, "space").unwrap_or_else(|| "order".into());

    let packet = if space == "struct" {
        // Structured read: payload of `len` zero bytes, padded with 0xFF.
        let mut buf = [0u8; p::PACKET_LEN];
        buf[0] = p::HEADER;
        buf[2] = id;
        let len: usize = args
            .iter()
            .find_map(|a| a.strip_prefix("--len="))
            .and_then(|v| v.parse().ok())
            .unwrap_or(8);
        buf[1] = len as u8;
        for slot in buf[4..4 + len].iter_mut() {
            *slot = 0;
        }
        let mut sum: u32 = 53 + buf[0] as u32 + buf[1] as u32 + buf[2] as u32;
        sum += buf[len + 3] as u32;
        buf[3] = (sum & 0xFF) as u8;
        buf
    } else {
        p::cmd_packet(id, None)
    };

    dump_packet("tx", &packet);
    match link.query(packet) {
        Some(r) => {
            dump_packet("rx", &r.0);
            classify(&r);
            let _ = link.send(packet);
            ExitCode::SUCCESS
        }
        None => {
            println!("{DIM}no reply{RESET}");
            ExitCode::SUCCESS
        }
    }
}

fn cmd_scan(api: &mut HidApi, link: &mut Link, args: &[&str]) -> ExitCode {
    let space = flag(args, "space").unwrap_or_else(|| "order".into());
    let from: u8 = flag(args, "from").and_then(|v| v.parse().ok()).unwrap_or(0);
    let to: u8 = flag(args, "to").and_then(|v| v.parse().ok()).unwrap_or(127);
    let verbose = args.contains(&"--verbose");

    println!("{BOLD}Scanning{RESET} space={space} range={from}..={to}  {DIM}(bootloader range 8..15 is skipped){RESET}\n");
    println!(
        "  {DIM}green{RESET} = the firmware answered, {DIM}dim{RESET} = echo or stale packet\n"
    );
    println!("  {:>4}  {:>6}  meaning", "id", "reply");
    println!("  {}", DIM.to_string() + &"-".repeat(58) + RESET);

    for id in from..=to {
        if space == "struct" && (8..=15).contains(&id) {
            continue;
        }
        let link = open_link(api, link);
        let packet = if space == "struct" {
            struct_read(id)
        } else {
            p::cmd_packet(id, None)
        };
        let Some(r) = link.query(packet) else {
            if verbose {
                println!("  {id:>4}  {DIM}no reply{RESET}");
            }
            continue;
        };
        let _ = link.send(packet);
        // Structured commands answer with `id | 0x80`; single-value commands
        // answer with a bare `0x80` and echo the id in byte 5. Anything else is
        // an echo or a leftover packet from the previous probe, so it is
        // reported separately instead of being counted as a hit.
        let reply = r.0[2];
        let matched = if space == "struct" {
            reply == id.wrapping_add(p::RESP_OK_FLAG)
        } else {
            reply == p::RESP_OK_FLAG && r.0[5] == id
        };
        let note = classify(&r);
        if matched {
            println!("  {id:>4}  {reply:#06x}  {GREEN}{note}{RESET}");
        } else if note != "fail" {
            println!(
                "  {id:>4}  {reply:#06x}  {DIM}{note} — reply does not match, ignoring{RESET}"
            );
        } else if verbose {
            println!("  {id:>4}  {DIM}no reply{RESET}");
        }
    }
    ExitCode::SUCCESS
}

fn cmd_travel(link: &mut Link) -> ExitCode {
    println!("{BOLD}Live Hall-sensor matrix{RESET} {DIM}(press keys while this runs){RESET}\n");
    for round in 0..10 {
        let mut row = String::new();
        for key in keymap::KEYS {
            let index = key.row as usize * 21 + key.col as usize;
            if let Some(mm) = read_cell(link, index) {
                if mm > 0.05 {
                    row.push_str(&format!("{}[{}]{:.2}  ", key.label, key.id, mm));
                }
            }
        }
        if !row.is_empty() {
            println!("  round {round:>2}  {row}");
        } else {
            println!("  round {round:>2}  {DIM}all keys at rest{RESET}");
        }
        std::thread::sleep(std::time::Duration::from_millis(120));
    }
    ExitCode::SUCCESS
}

fn cmd_set(api: &mut HidApi, link: &mut Link, args: &[&str], confirmed: bool) -> ExitCode {
    if args.is_empty() {
        eprintln!("usage: aula-probe set <what> <args...> --yes");
        return ExitCode::FAILURE;
    }
    if !confirmed {
        eprintln!(
            "{YELLOW}This writes to real hardware.{RESET}\n\
             Re-run with {BOLD}--yes{RESET} to confirm."
        );
        return ExitCode::FAILURE;
    }

    match args[0] {
        "actuation" => {
            let Some(mm) = args.get(1).and_then(|v| v.parse::<f32>().ok()) else {
                return usage("set actuation <mm>");
            };
            let link = open_link(api, link);
            write_actuation(link, mm);
        }
        "key-actuation" | "rt" | "deadzone" | "reset" => {
            let ids = match parse_ids(args.get(1)) {
                Some(ids) if !ids.is_empty() => ids,
                _ => return usage(&format!("set {} <ids> ...", args[0])),
            };
            match args[0] {
                "key-actuation" => {
                    let Some(mm) = args.get(2).and_then(|v| v.parse::<f32>().ok()) else {
                        return usage("set key-actuation <ids> <mm>");
                    };
                    write_keys(link, &ids, p::layout::ACTUATION, mm * 1000.0);
                }
                "rt" => {
                    let (Some(press), Some(release)) = (
                        args.get(2).and_then(|v| v.parse::<f32>().ok()),
                        args.get(3).and_then(|v| v.parse::<f32>().ok()),
                    ) else {
                        return usage("set rt <ids> <press_mm> <release_mm>");
                    };
                    write_keys(link, &ids, p::layout::RT_PRESS, press * 1000.0);
                    write_keys(link, &ids, p::layout::RT_RELEASE, release * 1000.0);
                    // Rapid Trigger lives in the high nibble of the mode field.
                    for chunk in ids.chunks(p::cmd::MAX_KEYS_PER_PACKET) {
                        let values = vec![(p::touch_mode::RAPID_TRIGGER as u16) << 4; chunk.len()];
                        let _ =
                            link.send(p::key_layout_packet(true, p::layout::MODE, chunk, &values));
                    }
                }
                "deadzone" => {
                    let (Some(press), Some(release)) = (
                        args.get(2).and_then(|v| v.parse::<f32>().ok()),
                        args.get(3).and_then(|v| v.parse::<f32>().ok()),
                    ) else {
                        return usage("set deadzone <ids> <press_mm> <release_mm>");
                    };
                    write_keys(link, &ids, p::layout::PRESS_DEADZONE, press * 1000.0);
                    write_keys(link, &ids, p::layout::RELEASE_DEADZONE, release * 1000.0);
                }
                "reset" => {
                    for chunk in ids.chunks(p::cmd::MAX_KEYS_PER_PACKET) {
                        let values = vec![0u16; chunk.len()];
                        let _ =
                            link.send(p::key_layout_packet(true, p::layout::MODE, chunk, &values));
                    }
                }
                _ => unreachable!(),
            }
        }
        "polling" => {
            let Some(idx) = args.get(1).and_then(|v| v.parse::<u8>().ok()) else {
                return usage("set polling <index>");
            };
            let _ = link.send(p::cmd_packet(p::order::POLLING_RATE, Some(idx)));
            println!(
                "{YELLOW}polling rate set to index {idx}; the USB interface will disappear for ~1s{RESET}"
            );
        }
        "profile" => {
            let Some(idx) = args.get(1).and_then(|v| v.parse::<u8>().ok()) else {
                return usage("set profile <0-3>");
            };
            let _ = link.send(p::cmd_packet(p::order::PROFILE_ID, Some(idx)));
        }
        "os" => {
            let cmd = match args.get(1).copied() {
                Some("win") => p::order::SET_SYS_WIN,
                Some("mac") => p::order::SET_SYS_MAC,
                _ => return usage("set os <win|mac>"),
            };
            let _ = link.send(p::cmd_packet(cmd, Some(1)));
        }
        other => return usage(other),
    }

    println!("{GREEN}done{RESET} — verify with {BOLD}aula-probe state{RESET}");
    ExitCode::SUCCESS
}

// ------------------------------------------------------------------ helpers

fn usage(what: &str) -> ExitCode {
    eprintln!("usage: aula-probe {what} --yes");
    ExitCode::FAILURE
}

fn parse_ids(arg: Option<&&str>) -> Option<Vec<u16>> {
    arg.map(|s| {
        s.split(',')
            .filter_map(|part| part.trim().parse::<u16>().ok())
            .filter(|id| keymap::KEYS.iter().any(|k| k.id == *id))
            .collect()
    })
}

fn decode_hex(text: &str) -> Option<Vec<u8>> {
    let clean: String = text
        .chars()
        .filter(|c| !c.is_whitespace() && *c != ':')
        .collect();
    if !clean.len().is_multiple_of(2) {
        return None;
    }
    (0..clean.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&clean[i..i + 2], 16).ok())
        .collect()
}

fn dump_packet(label: &str, bytes: &[u8]) {
    let hex: Vec<String> = bytes.iter().take(50).map(|b| format!("{b:02x}")).collect();
    println!(
        "  {BOLD}{label}{RESET} len={} cksum={:#04x}  {}",
        bytes[1],
        bytes[3],
        hex.join(" ")
    );
}

/// Human-readable summary of a reply's command byte.
fn classify(r: &p::Response) -> String {
    let cmd = r.0[2];
    if cmd == p::RESP_FAIL {
        return "fail".into();
    }
    if cmd == p::RESP_OK_FLAG {
        let echo = r.0[5];
        return format!(
            "order reply, echo={echo} ({})",
            p::cmd_packet(echo, None)[4]
        );
    }
    let stripped = cmd & !p::RESP_OK_FLAG;
    let name = match stripped {
        8 => "bootloader sign",
        9 => "bootloader erase",
        10 => "bootloader reboot",
        14 => "bootloader crc",
        18 => "live travel matrix",
        20 => "layout RTP / DP",
        21 => "layout RTR / DR",
        22 => "layout DP",
        23 => "layout DR",
        24 => "RGB lighting",
        25 => "logo lighting (not implemented)",
        32 => "macro",
        35 => "per-key layout",
        36 => "mod-tap (not implemented)",
        39 => "dynamic DKS (not implemented)",
        40 => "endurance",
        41 => "deadzone / actuation",
        42 => "per-key RGB (not implemented)",
        43 => "default key matrix",
        44 => "snap tap (read only)",
        45 => "rapid switch (not implemented)",
        _ => return format!("unknown 0x{stripped:02x}"),
    };
    let note = if cmd == stripped {
        format!("{YELLOW}echo, not an answer{RESET}")
    } else {
        name.to_string()
    };
    note
}

fn read_layout(link: &mut Link, layout_id: u8, ids: &[u16]) -> std::collections::HashMap<u16, u16> {
    let mut out = std::collections::HashMap::new();
    for chunk in ids.chunks(p::cmd::MAX_KEYS_PER_PACKET) {
        let zeros = vec![0u16; chunk.len()];
        let Some(r) = link.query(p::key_layout_packet(false, layout_id, chunk, &zeros)) else {
            continue;
        };
        if !r.matches(p::cmd::KEY_LAYOUT) {
            continue;
        }
        for (id, value) in r.key_values(chunk.len()) {
            out.insert(id, value);
        }
    }
    out
}

fn write_actuation(link: &mut Link, mm: f32) {
    let _ = link.send(p::deadzone_packet(
        true,
        (mm.clamp(0.0, 65.535) * 1000.0) as u16,
    ));
}

fn write_keys(link: &mut Link, ids: &[u16], layout_id: u8, value: f32) {
    let um = (value.clamp(0.0, 65.535) * 1000.0) as u16;
    for chunk in ids.chunks(p::cmd::MAX_KEYS_PER_PACKET) {
        let values = vec![um; chunk.len()];
        let _ = link.send(p::key_layout_packet(true, layout_id, chunk, &values));
    }
}

fn read_cell(link: &mut Link, index: usize) -> Option<f32> {
    let half = if index / 21 < 3 { 1 } else { 2 };
    let raw = link.query_multi(p::realtime_travel_packet(half), 192)?;
    let value_index = if half == 1 { index - 21 } else { index - 63 };
    let at = 6 + value_index * 2;
    if at + 1 >= raw.len() {
        return None;
    }
    Some(u16::from_le_bytes([raw[at], raw[at + 1]]) as f32 / 1000.0)
}

fn struct_read(id: u8) -> [u8; p::PACKET_LEN] {
    let mut buf = [0u8; p::PACKET_LEN];
    buf[0] = p::HEADER;
    buf[2] = id;
    buf[1] = 8;
    let mut sum: u32 = 53 + buf[0] as u32 + buf[1] as u32 + buf[2] as u32;
    sum += buf[11] as u32;
    buf[3] = (sum & 0xFF) as u8;
    buf
}

/// Read-mode SOCD query. Kept here rather than in `protocol.rs` because the app
/// does not use it: Snap Tap is not configurable on firmware 9.1 and the packet
/// builder was deleted. The probe keeps it so the dead end stays verifiable.
fn socd_read() -> [u8; p::PACKET_LEN] {
    let mut buf = [0u8; p::PACKET_LEN];
    buf[0] = p::HEADER;
    buf[2] = p::cmd::SOCD;
    buf[4] = 0;
    buf[1] = 6;
    let mut sum: u32 = 53 + buf[0] as u32 + buf[1] as u32 + buf[2] as u32;
    sum += buf[9] as u32;
    buf[3] = (sum & 0xFF) as u8;
    buf
}
