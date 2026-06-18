// 显示控制台窗口以便调试，确认无问题后改回 windows_subsystem = "windows"
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    softhooky_lib::run()
}
