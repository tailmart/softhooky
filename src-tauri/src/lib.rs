use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    eprintln!("[Softhooky] Starting application...");

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            eprintln!("[Softhooky] Setup started");
            // 设置窗口标题
            if let Some(window) = app.get_webview_window("main") {
                window.set_title("Softhooky - 智能设计平台")?;
                eprintln!("[Softhooky] Window title set");
            } else {
                eprintln!("[Softhooky] Warning: main window not found");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
