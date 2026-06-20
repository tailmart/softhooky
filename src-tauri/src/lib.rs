use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // 确保主窗口创建成功
            match app.get_webview_window("main") {
                Some(window) => {
                    // 设置窗口标题
                    if let Err(e) = window.set_title("Softhooky - 智能设计平台") {
                        eprintln!("[Softhooky] Failed to set window title: {}", e);
                    }
                    // 确保窗口可见
                    let _ = window.show();
                    let _ = window.set_focus();
                    println!("[Softhooky] Main window initialized successfully");
                }
                None => {
                    eprintln!("[Softhooky] CRITICAL: Main window not found after creation!");
                    eprintln!("[Softhooky] Check tauri.conf.json window label matches 'main'");
                }
            }
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                println!("[Softhooky] Window destroyed");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
