fn main() {
    println!("cargo:rustc-check-cfg=cfg(ipc_bindings)");
}
