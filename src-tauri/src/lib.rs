use tauri::Manager;
use std::fs;
use std::path::PathBuf;

/// 读取应用运行时配置
/// 代理只需在客户端安装目录放一个 config.json 即可定制 API 地址
#[tauri::command]
fn read_app_config(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    // 尝试多个路径查找 config.json
    let paths = vec![
        // 1. 应用数据目录（标准位置）
        app_handle.path().app_config_dir().ok().map(|d| d.join("config.json")),
        // 2. 应用资源目录（打包时附带）
        app_handle.path().resource_dir().ok().map(|d| d.join("config.json")),
        // 3. 当前工作目录（exe 同目录）
        std::env::current_dir().ok().map(|d| d.join("config.json")),
    ];

    for path in paths.into_iter().flatten() {
        if path.exists() {
            match fs::read_to_string(&path) {
                Ok(content) => return Ok(Some(content)),
                Err(e) => eprintln!("[Softhooky] Failed to read config at {:?}: {}", path, e),
            }
        }
    }

    Ok(None)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![read_app_config])
        .setup(|app| {
            // 确保主窗口创建成功
            match app.get_webview_window("main") {
                Some(window) => {
                    if let Err(e) = window.set_title("Softhooky - 智能设计平台") {
                        eprintln!("[Softhooky] Failed to set window title: {}", e);
                    }
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
