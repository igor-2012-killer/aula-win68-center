use std::path::Path;

fn main() {
    println!("cargo:rustc-check-cfg=cfg(ipc_bindings)");
    println!("cargo:rustc-cfg=ipc_bindings");

    // `tauri::generate_context!` embeds `frontendDist` (`../dist`) only when
    // this crate is built with `custom-protocol`. Dev and test builds set
    // `dev` (tauri-macros: `cfg!(not(feature = "custom-protocol"))`) and use
    // `devUrl`, so they must keep compiling when `dist/` has not been built.
    // Cargo sets this variable from the feature name; an empty value still
    // means the feature is on.
    if std::env::var_os("CARGO_FEATURE_CUSTOM_PROTOCOL").is_some() {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
            .expect("CARGO_MANIFEST_DIR is set when the build script runs");
        let dist = Path::new(&manifest_dir).join("../dist");
        if !dist.is_dir() {
            panic!(
                "AGENTS.md build gotcha: `frontendDist` (`../dist`) does not exist, so `tauri::generate_context!()` would panic with \"this path doesn't exist\".\n\
                 \n\
                 Fix: from the repository root, run `npm run build` before `cargo build --features custom-protocol`. The Windows CI job does this. Dev (`npm run app`) and `cargo test` do not need `dist/`."
            );
        }
    }

    tauri_build::build();
}
