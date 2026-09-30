// Release builds must not spawn a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    aula_win68_center_lib::run()
}
