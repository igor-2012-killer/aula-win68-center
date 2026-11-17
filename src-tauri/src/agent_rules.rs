//! Unit tests that lock the AGENTS.md rules a reviewer would otherwise have to
//! remember. Failure text names the rule and the fix. Nothing here runs against
//! hardware or changes what the app sends.

use std::fs;
use std::path::{Path, PathBuf};

use syn::visit::Visit;

use crate::keymap;

const DEVICE_RS: &str = "src-tauri/src/device.rs";
const HID_RS: &str = "src-tauri/src/hid.rs";
const PROBE_RS: &str = "tools/probe/src/main.rs";

#[test]
fn probe_key_is_t_not_esc_and_hardware_tests_hold_the_mutex() {
    let mut errors = Vec::new();
    let src = include_str!("device.rs");
    let file = syn::parse_file(src).unwrap_or_else(|err| {
        panic!("parse {DEVICE_RS}: {err}");
    });
    let module = hardware_module(&file).unwrap_or_else(|err| {
        panic!("{}", hardware_rule(&err));
    });
    let items = module_items(module).unwrap_or_else(|err| {
        panic!("{}", hardware_rule(&err));
    });

    match probe_key_literal(items) {
        Ok(value) => check_probe_key(value, &mut errors),
        Err(err) => errors.push(hardware_rule(&err)),
    }
    match hw_lock_static(items) {
        Ok(()) => {}
        Err(err) => errors.push(hardware_rule(&err)),
    }
    match link_function(items) {
        Ok(func) => {
            if !locks_hw_lock(func) {
                errors.push(hardware_rule(
                    "`link()` does not call `HW_LOCK.lock()`. The mutex would no longer serialise hardware tests.",
                ));
            }
        }
        Err(err) => errors.push(hardware_rule(&err)),
    }

    for item in items {
        let syn::Item::Fn(func) = item else {
            continue;
        };
        let name = func.sig.ident.to_string();
        let is_test = has_attr(&func.attrs, "test");
        let is_ignored = has_attr(&func.attrs, "ignore");
        if is_test && !is_ignored {
            errors.push(hardware_rule(&format!(
                "`{name}` in `mod hardware` is a `#[test]` without `#[ignore]`. `cargo test` would open the keyboard. `#[ignore]` is the only gate."
            )));
        }
        if is_test && is_ignored && !holds_link_guard(func) {
            errors.push(hardware_rule(&format!(
                "`{name}` is `#[ignore]` but does not hold the `HW_LOCK` guard. Bind it with `let (_api, mut link, _guard) = link();` in the function body. `_` drops the guard immediately, so the mutex would not cover the test."
            )));
        }
    }

    let root = repo_root();
    for path in rust_files(&root) {
        let text = fs::read_to_string(&path).unwrap_or_else(|err| {
            panic!("read {}: {err}", path.display());
        });
        let parsed = syn::parse_file(&text).unwrap_or_else(|err| {
            panic!("parse {}: {err}", path.display());
        });
        let mut finder = IgnoredTests::default();
        finder.visit_file(&parsed);
        let rel = relative(&root, &path);
        for hit in finder.hits {
            let inside = rel == DEVICE_RS && hit.mods == ["hardware"] && !hit.in_impl;
            if inside {
                continue;
            }
            errors.push(hardware_rule(&format!(
                "`{}` in `{rel}` is a `#[ignore]` test outside `device.rs` `mod hardware`. Hardware tests stay in that module so this check can see that they take the mutex via `link()`.",
                hit.name
            )));
        }
    }

    if !errors.is_empty() {
        panic!("{}", errors.join("\n\n"));
    }
}

#[test]
fn hid_handle_is_only_opened_on_the_io_thread() {
    let root = repo_root();
    let mut errors = Vec::new();
    for path in rust_files(&root) {
        let rel = relative(&root, &path);
        let text = fs::read_to_string(&path).unwrap_or_else(|err| {
            panic!("read {}: {err}", path.display());
        });
        let parsed = syn::parse_file(&text).unwrap_or_else(|err| {
            panic!("parse {}: {err}", path.display());
        });
        let mut finder = HidOpens::default();
        finder.visit_file(&parsed);
        for kind in finder.kinds {
            if hid_open_allowed(&rel, kind) {
                continue;
            }
            let line = first_code_line(&text, kind);
            errors.push(hid_rule(&rel, kind, line));
        }
    }
    if !errors.is_empty() {
        panic!("{}", errors.join("\n\n"));
    }
}

fn hardware_rule(detail: &str) -> String {
    format!(
        "AGENTS.md hardware-safety rule: hardware tests probe with key T (0x17), never Esc, and are serialised by a mutex in the test module — do not remove the mutex.\n\
         \n\
         {detail}\n\
         \n\
         Fix: keep `const PROBE_KEY: u16 = 23` (T, not Esc) in `device.rs` `mod hardware`. Keep `static HW_LOCK` and lock it inside `link()`. Every `#[ignore]` test there must bind the guard with `let (_api, mut link, _guard) = link();` for the whole test. Do not delete the mutex, do not drop the guard with `_`, and do not add a hardware test that opens the device any other way."
    )
}

fn check_probe_key(value: u16, errors: &mut Vec<String>) {
    let esc = match key_id("Esc") {
        Ok(id) => id,
        Err(err) => {
            errors.push(hardware_rule(&err));
            return;
        }
    };
    let tee = match key_id("T") {
        Ok(id) => id,
        Err(err) => {
            errors.push(hardware_rule(&err));
            return;
        }
    };
    if value != 23 || value != tee || value == esc {
        errors.push(hardware_rule(&format!(
            "`PROBE_KEY` is {value}. Esc is {esc}. T is {tee}. `PROBE_KEY` must stay 23 (T, 0x17) and must not be the Esc key id."
        )));
    }
}

fn key_id(label: &str) -> Result<u16, String> {
    let mut ids = keymap::KEYS
        .iter()
        .filter(|key| key.label == label)
        .map(|key| key.id);
    let id = ids
        .next()
        .ok_or_else(|| format!("keymap has no `{label}` key, so the Esc/T check cannot run"))?;
    if ids.next().is_some() {
        return Err(format!("keymap has more than one `{label}` key"));
    }
    Ok(id)
}

fn hardware_module(file: &syn::File) -> Result<&syn::ItemMod, String> {
    let mut found = None;
    for item in &file.items {
        if let syn::Item::Mod(module) = item {
            if module.ident == "hardware" {
                if found.is_some() {
                    return Err("`device.rs` has two `mod hardware` modules".into());
                }
                found = Some(module);
            }
        }
    }
    found.ok_or_else(|| {
        "`device.rs` has no `mod hardware`. The mutex and `PROBE_KEY` live there.".into()
    })
}

fn module_items(module: &syn::ItemMod) -> Result<&[syn::Item], String> {
    module
        .content
        .as_ref()
        .map(|(_, items)| items.as_slice())
        .ok_or_else(|| {
            "`mod hardware` has no body. Keep the tests, `PROBE_KEY`, and `HW_LOCK` in `device.rs`."
                .into()
        })
}

fn probe_key_literal(items: &[syn::Item]) -> Result<u16, String> {
    let mut value = None;
    for item in items {
        let syn::Item::Const(konst) = item else {
            continue;
        };
        if konst.ident != "PROBE_KEY" {
            continue;
        }
        let syn::Expr::Lit(syn::ExprLit {
            lit: syn::Lit::Int(int),
            ..
        }) = &*konst.expr
        else {
            return Err("`PROBE_KEY` must be an integer literal (`23`), not an expression.".into());
        };
        let parsed = int
            .base10_parse::<u16>()
            .map_err(|err| format!("`PROBE_KEY` is not a u16 literal: {err}"))?;
        if value.replace(parsed).is_some() {
            return Err("`mod hardware` has two `PROBE_KEY` constants.".into());
        }
    }
    value.ok_or_else(|| "`PROBE_KEY` is missing from `mod hardware`.".into())
}

fn hw_lock_static(items: &[syn::Item]) -> Result<(), String> {
    let mut found = false;
    for item in items {
        let syn::Item::Static(stat) = item else {
            continue;
        };
        if stat.ident != "HW_LOCK" {
            continue;
        }
        if found {
            return Err("`mod hardware` has two `HW_LOCK` statics.".into());
        }
        found = true;
        if !type_names_mutex(&stat.ty) {
            return Err("`HW_LOCK` is not a `Mutex`. Hardware tests must share one mutex.".into());
        }
    }
    if found {
        Ok(())
    } else {
        Err("`HW_LOCK` is missing. Do not remove the mutex that serialises hardware tests.".into())
    }
}

fn type_names_mutex(ty: &syn::Type) -> bool {
    let syn::Type::Path(path) = ty else {
        return false;
    };
    path.path
        .segments
        .iter()
        .any(|segment| segment.ident == "Mutex")
}

fn link_function(items: &[syn::Item]) -> Result<&syn::ItemFn, String> {
    let mut found = None;
    for item in items {
        let syn::Item::Fn(func) = item else {
            continue;
        };
        if func.sig.ident != "link" {
            continue;
        }
        if found.is_some() {
            return Err("`mod hardware` has two `link` functions.".into());
        }
        found = Some(func);
    }
    found.ok_or_else(|| "`link()` is missing. Hardware tests must open the device through it so they take `HW_LOCK`.".into())
}

fn locks_hw_lock(func: &syn::ItemFn) -> bool {
    struct Finder {
        found: bool,
    }
    impl Visit<'_> for Finder {
        fn visit_expr_method_call(&mut self, call: &syn::ExprMethodCall) {
            if call.method == "lock" && expr_names(&call.receiver, "HW_LOCK") {
                self.found = true;
            }
            syn::visit::visit_expr_method_call(self, call);
        }
    }
    let mut finder = Finder { found: false };
    finder.visit_item_fn(func);
    finder.found
}

fn holds_link_guard(func: &syn::ItemFn) -> bool {
    func.block.stmts.iter().any(|stmt| {
        let syn::Stmt::Local(local) = stmt else {
            return false;
        };
        let Some(init) = &local.init else {
            return false;
        };
        is_link_call(&init.expr) && pattern_holds_guard(&local.pat)
    })
}

fn is_link_call(expr: &syn::Expr) -> bool {
    let syn::Expr::Call(call) = expr else {
        return false;
    };
    let syn::Expr::Path(path) = &*call.func else {
        return false;
    };
    call.args.is_empty() && path.path.segments.len() == 1 && path.path.segments[0].ident == "link"
}

fn pattern_holds_guard(pat: &syn::Pat) -> bool {
    match pat {
        syn::Pat::Ident(_) => is_real_binding(pat),
        syn::Pat::Tuple(tuple) => tuple.elems.len() == 3 && tuple.elems.iter().all(is_real_binding),
        syn::Pat::Type(ty) => pattern_holds_guard(&ty.pat),
        _ => false,
    }
}

fn is_real_binding(pat: &syn::Pat) -> bool {
    match pat {
        // `let _ = link()` is `Pat::Wild` and drops the guard immediately.
        // `_guard` is a real binding and holds it until the end of the scope.
        syn::Pat::Ident(ident) => ident.ident != "_",
        syn::Pat::Type(ty) => is_real_binding(&ty.pat),
        syn::Pat::Reference(reference) => is_real_binding(&reference.pat),
        _ => false,
    }
}

fn has_attr(attrs: &[syn::Attribute], name: &str) -> bool {
    attrs.iter().any(|attr| attr.path().is_ident(name))
}

#[derive(Default)]
struct IgnoredTests {
    mods: Vec<String>,
    hits: Vec<IgnoredHit>,
}

struct IgnoredHit {
    mods: Vec<String>,
    name: String,
    in_impl: bool,
}

impl Visit<'_> for IgnoredTests {
    fn visit_item_mod(&mut self, module: &syn::ItemMod) {
        self.mods.push(module.ident.to_string());
        syn::visit::visit_item_mod(self, module);
        self.mods.pop();
    }

    fn visit_item_fn(&mut self, func: &syn::ItemFn) {
        self.record(&func.attrs, &func.sig.ident, false);
    }

    fn visit_impl_item_fn(&mut self, func: &syn::ImplItemFn) {
        self.record(&func.attrs, &func.sig.ident, true);
    }
}

impl IgnoredTests {
    fn record(&mut self, attrs: &[syn::Attribute], ident: &syn::Ident, in_impl: bool) {
        if has_attr(attrs, "test") && has_attr(attrs, "ignore") {
            self.hits.push(IgnoredHit {
                mods: self.mods.clone(),
                name: ident.to_string(),
                in_impl,
            });
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum HidOpen {
    Handle,
    OpenDevice,
    OpenCall,
    LinkOpen,
}

impl HidOpen {
    fn token(self) -> &'static str {
        match self {
            // The variant is not named after the type: this file is scanned too,
            // and a path segment with that name would look like a use of it.
            Self::Handle => "HidDevice",
            Self::OpenDevice => "open_device",
            Self::OpenCall => ".open(",
            Self::LinkOpen => "Link::open",
        }
    }
}

#[derive(Default)]
struct HidOpens {
    kinds: Vec<HidOpen>,
}

impl Visit<'_> for HidOpens {
    fn visit_expr_method_call(&mut self, call: &syn::ExprMethodCall) {
        if call.method == "open_device" {
            self.kinds.push(HidOpen::OpenDevice);
        } else if call.method == "open" {
            self.kinds.push(HidOpen::OpenCall);
        }
        syn::visit::visit_expr_method_call(self, call);
    }

    fn visit_path(&mut self, path: &syn::Path) {
        let idents: Vec<_> = path
            .segments
            .iter()
            .map(|segment| segment.ident.to_string())
            .collect();
        if idents.iter().any(|ident| ident == "HidDevice") {
            self.kinds.push(HidOpen::Handle);
        }
        if idents.last().map(String::as_str) == Some("open")
            && idents.iter().any(|ident| ident == "Link")
        {
            self.kinds.push(HidOpen::LinkOpen);
        }
        syn::visit::visit_path(self, path);
    }
}

fn hid_open_allowed(rel: &str, kind: HidOpen) -> bool {
    match rel {
        // The handle type and the I/O thread (including its hardware tests).
        HID_RS | DEVICE_RS => true,
        // Separate process. It may call `Link::open` and must not touch the
        // raw handle; that would be a second owner beside `Link`.
        PROBE_RS => matches!(kind, HidOpen::OpenCall | HidOpen::LinkOpen),
        _ => false,
    }
}

fn hid_rule(rel: &str, kind: HidOpen, line: Option<usize>) -> String {
    let at = match line {
        Some(line) => format!("{rel}:{line}"),
        None => rel.to_string(),
    };
    format!(
        "AGENTS.md architecture rule: one I/O thread owns the HID handle (`device.rs`). Never add a second reader and never block the UI thread on USB I/O.\n\
         \n\
         {at} uses `{}`.\n\
         \n\
         `HidDevice`, `open_device`, and `Link::open` / `.open(` are allowed only in `src-tauri/src/hid.rs` and `src-tauri/src/device.rs` (the I/O thread and its `hardware` tests). `tools/probe/src/main.rs` may call `Link::open` / `.open(` because the probe is a separate process, not a second reader in the app. It may not name `HidDevice` or call `open_device`.\n\
         \n\
         Fix: open the keyboard from the I/O thread in `device.rs` (the handle itself stays in `hid.rs`). Do not construct a `HidDevice` or call `Link::open` from a command, the UI, or a new module.",
        kind.token()
    )
}

fn expr_names(expr: &syn::Expr, name: &str) -> bool {
    match expr {
        syn::Expr::Path(path) => path
            .path
            .segments
            .iter()
            .any(|segment| segment.ident == name),
        syn::Expr::Paren(paren) => expr_names(&paren.expr, name),
        syn::Expr::Reference(reference) => expr_names(&reference.expr, name),
        _ => false,
    }
}

fn first_code_line(src: &str, kind: HidOpen) -> Option<usize> {
    let needle = kind.token();
    src.lines().enumerate().find_map(|(index, line)| {
        let hit = match kind {
            HidOpen::OpenCall => line.contains(needle),
            _ => {
                let bytes = line.as_bytes();
                (0..line.len()).any(|i| {
                    line.is_char_boundary(i)
                        && line[i..].starts_with(needle)
                        && (i == 0 || !is_ident_byte(bytes[i - 1]))
                })
            }
        };
        hit.then_some(index + 1)
    })
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has a parent")
        .to_path_buf()
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn rust_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    collect_rs(root, &mut out);
    out.sort();
    out
}

fn collect_rs(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = fs::read_dir(dir).unwrap_or_else(|err| {
        panic!("read {}: {err}", dir.display());
    });
    for entry in entries {
        let entry = entry.unwrap_or_else(|err| {
            panic!("read entry in {}: {err}", dir.display());
        });
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if path.is_dir() {
            if matches!(
                name.as_ref(),
                ".git" | "node_modules" | "target" | "dist" | ".cursor"
            ) {
                continue;
            }
            collect_rs(&path, out);
        } else if name.ends_with(".rs") {
            out.push(path);
        }
    }
}

fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}
