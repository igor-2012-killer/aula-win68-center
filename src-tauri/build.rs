fn main() {
    println!("cargo:rustc-check-cfg=cfg(ipc_bindings)");
    println!("cargo:rustc-cfg=ipc_bindings");
    tauri_build::build()
}
