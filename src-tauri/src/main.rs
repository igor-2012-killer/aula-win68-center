// Release builds must not spawn a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    if std::env::args().any(|arg| arg == "--raw-input-recorder") {
        aula_win68_center_lib::run_raw_input_helper();
        return;
    }
    aula_win68_center_lib::run()
}
