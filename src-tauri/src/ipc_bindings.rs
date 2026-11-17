//! Generates `src/generated/ipc.ts` from the Rust IPC surface and fails if the
//! committed file disagrees.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use heck::{ToLowerCamelCase, ToSnakeCase};
use serde::Serialize;
use syn::ext::IdentExt;
use syn::visit::Visit;
use syn::{Ident, Type};
use ts_rs::TS;

use crate::keymap;
use crate::state::{KeyMode, KeySettings, KeyboardState, Lighting, ModTapAssignment, SnapTap};

const BINDINGS_RELATIVE: &str = "../src/generated/ipc.ts";

#[test]
fn ipc_bindings_are_fresh() {
    assert_eq!("key_ids".to_lower_camel_case(), "keyIds");
    assert_eq!("press_mm".to_lower_camel_case(), "pressMm");
    assert_eq!("release_mm".to_lower_camel_case(), "releaseMm");
    assert_eq!("key_id".to_lower_camel_case(), "keyId");
    assert_eq!("mm".to_lower_camel_case(), "mm");

    let generated = render().unwrap_or_else(|err| panic!("{err}"));
    assert_serde_matches_typescript();

    let path = bindings_path();
    if std::env::var("UPDATE_IPC_BINDINGS").ok().as_deref() == Some("1") {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap_or_else(|err| {
                panic!("create {}: {err}", parent.display());
            });
        }
        fs::write(&path, &generated)
            .unwrap_or_else(|err| panic!("write {}: {err}", path.display()));
    }

    let committed = fs::read_to_string(&path)
        .unwrap_or_default()
        .replace("\r\n", "\n");
    if committed != generated {
        panic!("{}", drift_message(&path, &generated, &committed));
    }
}

fn bindings_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(BINDINGS_RELATIVE)
}

fn drift_message(path: &Path, generated: &str, committed: &str) -> String {
    let display = "src/generated/ipc.ts";
    let mut message = format!(
        "\
IPC bindings are stale: {display} does not match the Rust IPC surface.

The file is generated from command signatures, event payloads, and state types
(serde renames included). An edit on one side did not update the other.

Regenerate the file and commit it:

    UPDATE_IPC_BINDINGS=1 cargo test --manifest-path src-tauri/Cargo.toml --lib ipc_bindings_are_fresh
"
    );
    if committed.is_empty() {
        message.push_str(&format!(
            "\n{display} is missing. The command above creates it ({}).\n",
            path.display()
        ));
        return message;
    }

    let generated_lines: Vec<&str> = generated.lines().collect();
    let committed_lines: Vec<&str> = committed.lines().collect();
    let mut index = 0;
    while index < generated_lines.len()
        && index < committed_lines.len()
        && generated_lines[index] == committed_lines[index]
    {
        index += 1;
    }
    message.push_str(&format!("\nFirst difference at line {}:\n", index + 1));
    let start = index.saturating_sub(2);
    let end = (index + 4).max(start + 1);
    let last = generated_lines.len().max(committed_lines.len());
    for line in start..end.min(last) {
        let generated_line = generated_lines.get(line).copied();
        let committed_line = committed_lines.get(line).copied();
        match (generated_line, committed_line) {
            (Some(same), Some(other)) if same == other => {
                message.push_str(&format!("  {:>4}  {same}\n", line + 1));
            }
            (generated_line, committed_line) => {
                message.push_str(&format!(
                    "  {:>4}  generated: {}\n",
                    line + 1,
                    generated_line.unwrap_or("<eof>")
                ));
                message.push_str(&format!(
                    "        committed: {}\n",
                    committed_line.unwrap_or("<eof>")
                ));
            }
        }
    }
    message
}

fn render() -> Result<String, String> {
    let sources = rust_sources()?;
    let commands = collect_commands(&sources)?;
    let events = collect_events(&sources)?;
    let types = render_state_types()?;

    let mut out = String::new();
    out.push_str("// Generated from the Rust IPC surface. Do not edit.\n");
    out.push_str("// Regenerate: UPDATE_IPC_BINDINGS=1 cargo test --manifest-path src-tauri/Cargo.toml --lib ipc_bindings_are_fresh\n\n");
    out.push_str(&types);
    out.push('\n');
    out.push_str(&render_commands(&commands));
    out.push('\n');
    out.push_str(&render_events(&events));
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

fn rust_sources() -> Result<Vec<(PathBuf, syn::File)>, String> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut paths = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|err| format!("read {}: {err}", dir.display()))? {
        let entry = entry.map_err(|err| format!("read {}: {err}", dir.display()))?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "rs") {
            paths.push(path);
        }
    }
    paths.sort();
    paths
        .into_iter()
        .map(|path| {
            let text = fs::read_to_string(&path)
                .map_err(|err| format!("read {}: {err}", path.display()))?;
            let file =
                syn::parse_file(&text).map_err(|err| format!("parse {}: {err}", path.display()))?;
            Ok((path, file))
        })
        .collect()
}

struct StateType {
    name: String,
    declaration: String,
}

fn render_state_types() -> Result<String, String> {
    let exported = exported_state_types();
    let mut seen = BTreeSet::new();
    for ty in &exported {
        seen.insert(ty.name.clone());
    }
    for name in dependency_names::<KeyboardState>() {
        if !seen.contains(&name) && name != "KeyboardState" {
            return Err(format!(
                "type `{name}` is part of `KeyboardState` but is not generated.\n\
                 Derive `ts_rs::TS` on it and add it to `exported_state_types`."
            ));
        }
    }

    let mut out = String::new();
    for ty in exported {
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&ty.declaration);
        if !ty.declaration.ends_with('\n') {
            out.push('\n');
        }
    }
    Ok(out)
}

fn exported_state_types() -> Vec<StateType> {
    vec![
        declare::<KeyMode>(),
        declare::<KeySettings>(),
        declare::<Lighting>(),
        declare::<SnapTap>(),
        declare::<ModTapAssignment>(),
        declare::<keymap::KeyDef>(),
        declare::<KeyboardState>(),
    ]
}

fn declare<T: TS>() -> StateType {
    let mut declaration = String::new();
    if let Some(docs) = T::DOCS {
        declaration.push_str(docs);
        if !docs.ends_with('\n') {
            declaration.push('\n');
        }
    }
    declaration.push_str("export ");
    declaration.push_str(&T::decl());
    declaration.push('\n');
    StateType {
        name: T::ident(),
        declaration,
    }
}

fn dependency_names<T: TS + 'static>() -> Vec<String> {
    struct Collector(Vec<String>);
    impl ts_rs::TypeVisitor for Collector {
        fn visit<U: TS + 'static + ?Sized>(&mut self) {
            if U::output_path().is_some() {
                let name = U::ident();
                if !self.0.contains(&name) {
                    self.0.push(name);
                }
            }
        }
    }
    let mut collector = Collector(Vec::new());
    T::visit_dependencies(&mut collector);
    collector.0
}

fn assert_serde_matches_typescript() {
    assert_enum_json::<KeyMode>(&[KeyMode::Global, KeyMode::Single, KeyMode::RapidTrigger]);
    assert_object_fields(&KeySettings::default());
    assert_object_fields(&Lighting::default());
    assert_object_fields(&SnapTap {
        key_a: 1,
        key_b: 2,
        mode: 0,
        delay_ms: 0,
    });
    assert_object_fields(&ModTapAssignment {
        key_id: 1,
        hold_key: 2,
        tap_key: 3,
        delay_ms: 0,
    });
    assert_object_fields(&keymap::KEYS[0]);
    assert_object_fields(&KeyboardState::default());
    let decl = KeyboardState::decl();
    assert!(
        !decl.contains("snap_tap_saved_modes"),
        "snap_tap_saved_modes is #[serde(skip)] and must not cross IPC.\n{decl}"
    );
}

fn assert_enum_json<T: Serialize + TS>(variants: &[T]) {
    let decl = T::decl();
    for variant in variants {
        let json = serde_json::to_string(variant).unwrap_or_else(|err| {
            panic!("{} failed to serialize: {err}", std::any::type_name::<T>())
        });
        assert!(
            decl.contains(&json),
            "{} serializes as {json}, which is missing from its TypeScript declaration.\n{decl}",
            std::any::type_name::<T>()
        );
    }
}

fn assert_object_fields<T: Serialize + TS>(sample: &T) {
    let value = serde_json::to_value(sample)
        .unwrap_or_else(|err| panic!("{} failed to serialize: {err}", std::any::type_name::<T>()));
    let object = value.as_object().unwrap_or_else(|| {
        panic!(
            "{} serialized as {value}, not a JSON object",
            std::any::type_name::<T>()
        )
    });
    let decl = T::decl();
    for key in object.keys() {
        let needle = format!("{key}:");
        assert!(
            decl.contains(&needle),
            "{} JSON field `{key}` is missing from its TypeScript declaration.\n\
             serde and ts-rs disagree on the field name.\n{decl}",
            std::any::type_name::<T>()
        );
    }
}

#[derive(Clone)]
struct CommandSpec {
    wire_name: String,
    args: Vec<(String, String)>,
    result: String,
}

fn render_commands(commands: &[CommandSpec]) -> String {
    let mut out = String::from("export interface IpcCommands {\n");
    for command in commands {
        out.push_str(&format!("  {}: {{\n", command.wire_name));
        if command.args.is_empty() {
            out.push_str("    args: undefined;\n");
        } else {
            out.push_str("    args: {\n");
            for (name, ty) in &command.args {
                out.push_str(&format!("      {name}: {ty};\n"));
            }
            out.push_str("    };\n");
        }
        out.push_str(&format!("    result: {};\n", command.result));
        out.push_str("  };\n");
    }
    out.push_str("}\n");
    out
}

fn collect_commands(sources: &[(PathBuf, syn::File)]) -> Result<Vec<CommandSpec>, String> {
    let mut commands = BTreeMap::<String, CommandSpec>::new();
    let mut handler = Vec::new();
    let known = exported_state_types()
        .into_iter()
        .map(|ty| ty.name)
        .collect::<BTreeSet<_>>();

    for (path, file) in sources {
        let mut visitor = CommandVisitor {
            path,
            commands: &mut commands,
            handler: &mut handler,
            known: &known,
        };
        visitor.visit_file(file);
    }

    if handler.is_empty() {
        return Err("no tauri::generate_handler! found".into());
    }

    let registered: BTreeSet<&str> = handler.iter().map(String::as_str).collect();
    let defined: BTreeSet<&str> = commands.keys().map(String::as_str).collect();
    if let Some(name) = registered.difference(&defined).next() {
        return Err(format!(
            "`{name}` is registered in tauri::generate_handler! but has no #[tauri::command]"
        ));
    }
    if let Some(name) = defined.difference(&registered).next() {
        return Err(format!(
            "`{name}` is a #[tauri::command] but is missing from tauri::generate_handler!, so it is not callable"
        ));
    }

    let mut ordered = Vec::new();
    for name in &handler {
        let spec = commands
            .get(name)
            .ok_or_else(|| format!("`{name}` is registered but its signature was not collected"))?;
        ordered.push(spec.clone());
    }
    Ok(ordered)
}

struct CommandVisitor<'a> {
    path: &'a Path,
    commands: &'a mut BTreeMap<String, CommandSpec>,
    handler: &'a mut Vec<String>,
    known: &'a BTreeSet<String>,
}

impl<'a> Visit<'_> for CommandVisitor<'a> {
    fn visit_item_fn(&mut self, func: &syn::ItemFn) {
        if let Some(meta) = command_meta(&func.attrs) {
            let function_name = func.sig.ident.to_string();
            let wire_name = meta.rename.unwrap_or_else(|| function_name.clone());
            let spec = command_spec(self.path, func, &wire_name, meta.case, self.known)
                .unwrap_or_else(|err| panic!("{err}"));
            if self.commands.insert(function_name.clone(), spec).is_some() {
                panic!("duplicate #[tauri::command] `{function_name}`");
            }
        }
        syn::visit::visit_item_fn(self, func);
    }

    fn visit_macro(&mut self, mac: &syn::Macro) {
        if mac
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "generate_handler")
        {
            let idents = mac
                .parse_body_with(
                    syn::punctuated::Punctuated::<Ident, syn::Token![,]>::parse_terminated,
                )
                .unwrap_or_else(|err| {
                    panic!(
                        "parse tauri::generate_handler! in {}: {err}",
                        self.path.display()
                    )
                });
            self.handler
                .extend(idents.into_iter().map(|ident| ident.to_string()));
        }
        syn::visit::visit_macro(self, mac);
    }
}

struct CommandMeta {
    case: ArgCase,
    rename: Option<String>,
}

enum ArgCase {
    Camel,
    Snake,
}

fn command_meta(attrs: &[syn::Attribute]) -> Option<CommandMeta> {
    let attr = attrs.iter().find(|attr| {
        let segments: Vec<_> = attr
            .path()
            .segments
            .iter()
            .map(|s| s.ident.to_string())
            .collect();
        segments == ["command"] || segments == ["tauri", "command"]
    })?;
    let mut meta = CommandMeta {
        case: ArgCase::Camel,
        rename: None,
    };
    if let syn::Meta::List(list) = &attr.meta {
        let nested = list
            .parse_args_with(
                syn::punctuated::Punctuated::<syn::Meta, syn::Token![,]>::parse_terminated,
            )
            .unwrap_or_else(|err| panic!("parse #[tauri::command] arguments: {err}"));
        for item in nested {
            if let syn::Meta::NameValue(name_value) = item {
                let key = name_value.path.get_ident().map(ToString::to_string);
                let value = match &name_value.value {
                    syn::Expr::Lit(syn::ExprLit {
                        lit: syn::Lit::Str(lit),
                        ..
                    }) => lit.value(),
                    _ => panic!("#[tauri::command] {key:?} must be a string literal"),
                };
                match key.as_deref() {
                    Some("rename_all") => {
                        meta.case = match value.as_str() {
                            "camelCase" => ArgCase::Camel,
                            "snake_case" => ArgCase::Snake,
                            other => panic!(
                                "#[tauri::command(rename_all = {other:?})] is not camelCase or snake_case"
                            ),
                        };
                    }
                    Some("rename") => meta.rename = Some(value),
                    _ => {}
                }
            }
        }
    }
    Some(meta)
}

fn command_spec(
    path: &Path,
    func: &syn::ItemFn,
    wire_name: &str,
    case: ArgCase,
    known: &BTreeSet<String>,
) -> Result<CommandSpec, String> {
    let function_name = func.sig.ident.to_string();
    let mut args = Vec::new();
    for input in &func.sig.inputs {
        let typed = match input {
            syn::FnArg::Typed(typed) => typed,
            syn::FnArg::Receiver(_) => {
                return Err(format!(
                    "{function_name} in {} takes self, which cannot be a command argument",
                    path.display()
                ));
            }
        };
        if is_injected(&typed.ty) {
            continue;
        }
        let rust_name = match &*typed.pat {
            syn::Pat::Ident(ident) => ident.ident.unraw().to_string(),
            _ => {
                return Err(format!(
                    "{function_name} has a pattern argument; command args must be plain identifiers"
                ));
            }
        };
        let json_name = match case {
            ArgCase::Camel => rust_name.to_lower_camel_case(),
            ArgCase::Snake => rust_name.to_snake_case(),
        };
        let ty = to_ts(&typed.ty, known)
            .map_err(|err| format!("command `{function_name}` argument `{rust_name}`: {err}"))?;
        args.push((json_name, ty));
    }
    let result = return_ts(&func.sig.output, known)
        .map_err(|err| format!("command `{function_name}` return type: {err}"))?;
    Ok(CommandSpec {
        wire_name: wire_name.to_string(),
        args,
        result,
    })
}

fn return_ts(output: &syn::ReturnType, known: &BTreeSet<String>) -> Result<String, String> {
    match output {
        syn::ReturnType::Default => Ok("null".into()),
        syn::ReturnType::Type(_, ty) => {
            if let Some(ok) = result_ok(ty) {
                to_ts(ok, known)
            } else {
                to_ts(ty, known)
            }
        }
    }
}

fn result_ok(ty: &Type) -> Option<&Type> {
    let syn::Type::Path(path) = ty else {
        return None;
    };
    let segment = path.path.segments.last()?;
    if segment.ident != "Result" {
        return None;
    }
    let syn::PathArguments::AngleBracketed(args) = &segment.arguments else {
        return None;
    };
    let mut types = args.args.iter().filter_map(|arg| match arg {
        syn::GenericArgument::Type(ty) => Some(ty),
        _ => None,
    });
    let ok = types.next()?;
    let _err = types.next()?;
    if types.next().is_some() {
        return None;
    }
    Some(ok)
}

const INJECTED: &[&str] = &[
    "Dev",
    "State",
    "AppHandle",
    "Window",
    "Webview",
    "WebviewWindow",
    "Request",
    "CommandScope",
    "GlobalScope",
];

fn is_injected(ty: &Type) -> bool {
    type_ident(ty).is_some_and(|name| INJECTED.contains(&name.as_str()))
}

fn type_ident(ty: &Type) -> Option<String> {
    match ty {
        Type::Reference(reference) => type_ident(&reference.elem),
        Type::Path(path) => path
            .path
            .segments
            .last()
            .map(|segment| segment.ident.to_string()),
        _ => None,
    }
}

fn to_ts(ty: &Type, known: &BTreeSet<String>) -> Result<String, String> {
    match ty {
        Type::Reference(reference) => to_ts(&reference.elem, known),
        Type::Paren(inner) => to_ts(&inner.elem, known),
        Type::Group(inner) => to_ts(&inner.elem, known),
        Type::Slice(slice) => Ok(format!("Array<{}>", to_ts(&slice.elem, known)?)),
        Type::Array(array) => array_ts(array, known),
        Type::Tuple(tuple) if tuple.elems.is_empty() => Ok("null".into()),
        Type::Tuple(tuple) => {
            let parts = tuple
                .elems
                .iter()
                .map(|elem| to_ts(elem, known))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", parts.join(", ")))
        }
        Type::Path(path) => path_ts(path, known),
        other => Err(format!("unsupported type `{}`", quote::quote!(#other))),
    }
}

fn array_ts(array: &syn::TypeArray, known: &BTreeSet<String>) -> Result<String, String> {
    let len = match &array.len {
        syn::Expr::Lit(syn::ExprLit {
            lit: syn::Lit::Int(lit),
            ..
        }) => lit
            .base10_parse::<usize>()
            .map_err(|err| format!("array length: {err}"))?,
        _ => {
            return Err(format!(
                "array length `{}` is not an integer literal",
                quote::quote!(#array.len)
            ))
        }
    };
    let inner = to_ts(&array.elem, known)?;
    if len > 64 {
        return Ok(format!("Array<{inner}>"));
    }
    Ok(format!("[{}]", vec![inner; len].join(", ")))
}

fn path_ts(path: &syn::TypePath, known: &BTreeSet<String>) -> Result<String, String> {
    let segment = path
        .path
        .segments
        .last()
        .ok_or_else(|| "empty type path".to_string())?;
    let name = segment.ident.to_string();
    let args = type_args(&segment.arguments)?;
    match (name.as_str(), args.as_slice()) {
        ("Vec", [inner]) => Ok(format!("Array<{}>", parenthesize(&to_ts(inner, known)?))),
        ("Option", [inner]) => Ok(format!("{} | null", to_ts(inner, known)?)),
        ("HashMap" | "BTreeMap", [key, value]) => Ok(format!(
            "{{ [key in {}]?: {} }}",
            to_ts(key, known)?,
            to_ts(value, known)?
        )),
        ("Result", _) => {
            Err("Result is a command success/failure channel, not an argument type".into())
        }
        (_, []) => primitive_or_known(&name, known),
        _ => Err(format!("unsupported type `{}`", quote::quote!(#path))),
    }
}

fn parenthesize(ty: &str) -> String {
    if ty.contains('|') {
        format!("({ty})")
    } else {
        ty.to_string()
    }
}

fn primitive_or_known(name: &str, known: &BTreeSet<String>) -> Result<String, String> {
    let primitive = match name {
        "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "usize" | "isize" | "f32" | "f64" => {
            Some("number")
        }
        "u64" | "i64" | "u128" | "i128" => Some("bigint"),
        "bool" => Some("boolean"),
        "String" | "str" | "char" => Some("string"),
        _ => None,
    };
    if let Some(primitive) = primitive {
        return Ok(primitive.into());
    }
    if known.contains(name) {
        return Ok(name.into());
    }
    Err(format!(
        "type `{name}` is not a primitive and is not a generated IPC struct.\n\
         Derive `ts_rs::TS` on it and add it to `exported_state_types`."
    ))
}

fn type_args(arguments: &syn::PathArguments) -> Result<Vec<&Type>, String> {
    match arguments {
        syn::PathArguments::None => Ok(Vec::new()),
        syn::PathArguments::AngleBracketed(generic) => {
            let mut types = Vec::new();
            for arg in &generic.args {
                match arg {
                    syn::GenericArgument::Type(ty) => types.push(ty),
                    syn::GenericArgument::Lifetime(_) => {}
                    other => {
                        return Err(format!(
                            "unsupported generic argument `{}`",
                            quote::quote!(#other)
                        ))
                    }
                }
            }
            Ok(types)
        }
        syn::PathArguments::Parenthesized(_) => Err("function types are not IPC values".into()),
    }
}

struct EventSpec {
    const_name: String,
    event_name: String,
    payload: String,
}

fn render_events(events: &[EventSpec]) -> String {
    let mut out = String::new();
    for event in events {
        out.push_str(&format!(
            "export const {} = {} as const;\n",
            event.const_name,
            ts_string(&event.event_name)
        ));
    }
    out.push('\n');
    out.push_str("export interface IpcEvents {\n");
    for event in events {
        out.push_str(&format!(
            "  {}: {};\n",
            ts_string(&event.event_name),
            event.payload
        ));
    }
    out.push_str("}\n");
    out
}

fn ts_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn collect_events(sources: &[(PathBuf, syn::File)]) -> Result<Vec<EventSpec>, String> {
    let mut constants = BTreeMap::new();
    let mut emitters = Vec::new();
    let known = exported_state_types()
        .into_iter()
        .map(|ty| ty.name)
        .collect::<BTreeSet<_>>();

    for (path, file) in sources {
        let mut visitor = EventVisitor {
            path,
            constants: &mut constants,
            emitters: &mut emitters,
            error: None,
        };
        visitor.visit_file(file);
        if let Some(error) = visitor.error {
            return Err(error);
        }
    }

    if emitters.is_empty() {
        return Err("no ipc_emit_* functions found".into());
    }

    let mut events = Vec::new();
    let mut used = BTreeSet::new();
    for (path, func) in emitters {
        let spec = event_spec(path, func, &constants, &known)?;
        if !used.insert(spec.const_name.clone()) {
            return Err(format!("`{}` is emitted more than once", spec.const_name));
        }
        events.push(spec);
    }
    for name in constants.keys() {
        if !used.contains(name) {
            return Err(format!(
                "`{name}` is declared but no `ipc_emit_*` function emits it"
            ));
        }
    }
    Ok(events)
}

struct EventVisitor<'src, 'out> {
    path: &'src Path,
    constants: &'out mut BTreeMap<String, String>,
    emitters: &'out mut Vec<(&'src Path, &'src syn::ItemFn)>,
    error: Option<String>,
}

impl<'src> Visit<'src> for EventVisitor<'src, '_> {
    fn visit_item_const(&mut self, item: &'src syn::ItemConst) {
        if let Some((name, value)) = event_const(item) {
            self.constants.insert(name, value);
        }
    }

    fn visit_item_fn(&mut self, func: &'src syn::ItemFn) {
        if self.error.is_some() {
            return;
        }
        if func.sig.ident.to_string().starts_with("ipc_emit_") {
            self.emitters.push((self.path, func));
        } else if function_emits(func) {
            self.error = Some(format!(
                "{} `{}` calls `.emit` outside an `ipc_emit_*` function.\n\
                 Add an `ipc_emit_*` function whose parameters are the payload and emit from there.",
                self.path.display(),
                func.sig.ident
            ));
            return;
        }
        syn::visit::visit_item_fn(self, func);
    }
}

fn event_const(item: &syn::ItemConst) -> Option<(String, String)> {
    let name = item.ident.to_string();
    if !name.starts_with("EVENT_") {
        return None;
    }
    let syn::Expr::Lit(syn::ExprLit {
        lit: syn::Lit::Str(lit),
        ..
    }) = &*item.expr
    else {
        panic!("`{name}` must be a string literal");
    };
    Some((name, lit.value()))
}

fn function_emits(func: &syn::ItemFn) -> bool {
    struct Finder(bool);
    impl Visit<'_> for Finder {
        fn visit_expr_method_call(&mut self, call: &syn::ExprMethodCall) {
            if call.method == "emit" {
                self.0 = true;
            }
            syn::visit::visit_expr_method_call(self, call);
        }
    }
    let mut finder = Finder(false);
    finder.visit_item_fn(func);
    finder.0
}

fn event_spec(
    path: &Path,
    func: &syn::ItemFn,
    constants: &BTreeMap<String, String>,
    known: &BTreeSet<String>,
) -> Result<EventSpec, String> {
    let function_name = func.sig.ident.to_string();
    let call = single_emit(func)
        .ok_or_else(|| format!("`{function_name}` must contain exactly one `.emit(...)` call"))?;
    if call.args.len() != 2 {
        return Err(format!(
            "`{function_name}` must emit an event name and one payload"
        ));
    }
    let mut args = call.args.iter();
    let event_expr = args.next().expect("len checked");
    let payload_expr = args.next().expect("len checked");
    let const_name = expr_path_ident(event_expr).ok_or_else(|| {
        format!("`{function_name}` must emit an EVENT_* constant, not a string literal")
    })?;
    let event_name = constants.get(&const_name).cloned().ok_or_else(|| {
        format!("`{function_name}` emits `{const_name}`, which is not an EVENT_* string constant")
    })?;

    let params = payload_params(path, func, known)?;
    let payload = if let [(name, ty)] = params.as_slice() {
        if expr_binding(payload_expr).as_deref() != Some(name) {
            return Err(format!(
                "`{function_name}` must emit its parameter `{name}` so the TypeScript payload stays tied to the signature"
            ));
        }
        ty.clone()
    } else if params.is_empty() {
        return Err(format!(
            "`{function_name}` has no payload parameter in {}",
            path.display()
        ));
    } else {
        let syn::Expr::Tuple(tuple) = payload_expr else {
            return Err(format!(
                "`{function_name}` must emit its parameters as a tuple, in order"
            ));
        };
        if tuple.elems.len() != params.len() {
            return Err(format!(
                "`{function_name}` emits {} values but has {} payload parameters",
                tuple.elems.len(),
                params.len()
            ));
        }
        for (expr, (name, _)) in tuple.elems.iter().zip(&params) {
            if expr_binding(expr).as_deref() != Some(name) {
                return Err(format!(
                    "`{function_name}` must emit ({names}) in parameter order",
                    names = params
                        .iter()
                        .map(|(name, _)| name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ));
            }
        }
        format!(
            "[{}]",
            params
                .iter()
                .map(|(_, ty)| ty.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    Ok(EventSpec {
        const_name,
        event_name,
        payload,
    })
}

fn single_emit(func: &syn::ItemFn) -> Option<syn::ExprMethodCall> {
    struct Finder(Vec<syn::ExprMethodCall>);
    impl Visit<'_> for Finder {
        fn visit_expr_method_call(&mut self, call: &syn::ExprMethodCall) {
            if call.method == "emit" {
                self.0.push(call.clone());
            }
            syn::visit::visit_expr_method_call(self, call);
        }
    }
    let mut finder = Finder(Vec::new());
    finder.visit_item_fn(func);
    if finder.0.len() == 1 {
        finder.0.pop()
    } else {
        None
    }
}

fn payload_params(
    path: &Path,
    func: &syn::ItemFn,
    known: &BTreeSet<String>,
) -> Result<Vec<(String, String)>, String> {
    let function_name = func.sig.ident.to_string();
    let mut params = Vec::new();
    for input in &func.sig.inputs {
        match input {
            syn::FnArg::Receiver(_) => {}
            syn::FnArg::Typed(typed) if is_app_handle(&typed.ty) => {}
            syn::FnArg::Typed(typed) => {
                let name = match &*typed.pat {
                    syn::Pat::Ident(ident) => ident.ident.to_string(),
                    _ => {
                        return Err(format!(
                            "`{function_name}` payload parameters must be plain identifiers ({})",
                            path.display()
                        ))
                    }
                };
                let ty = to_ts(&typed.ty, known)
                    .map_err(|err| format!("`{function_name}` parameter `{name}`: {err}"))?;
                params.push((name, ty));
            }
        }
    }
    Ok(params)
}

fn is_app_handle(ty: &Type) -> bool {
    type_ident(ty).as_deref() == Some("AppHandle")
}

fn expr_path_ident(expr: &syn::Expr) -> Option<String> {
    let syn::Expr::Path(path) = expr else {
        return None;
    };
    if path.path.segments.len() != 1 {
        return None;
    }
    Some(path.path.segments[0].ident.to_string())
}

fn expr_binding(expr: &syn::Expr) -> Option<String> {
    match expr {
        syn::Expr::Path(path) if path.path.segments.len() == 1 => {
            Some(path.path.segments[0].ident.to_string())
        }
        syn::Expr::Reference(reference) => expr_binding(&reference.expr),
        _ => None,
    }
}
