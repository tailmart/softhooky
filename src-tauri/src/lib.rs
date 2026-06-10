use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

struct ServerProcess(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

fn find_server_script(app: &tauri::AppHandle) -> String {
    let resource_path = app.path().resource_dir().unwrap_or_default().join("server.cjs");
    if resource_path.exists() {
        return resource_path.to_string_lossy().to_string();
    }
    let dev_path = std::env::current_dir().unwrap_or_default().join("..").join("server.cjs");
    if dev_path.exists() {
        return dev_path.to_string_lossy().to_string();
    }
    std::env::current_dir().unwrap_or_default().join("server.cjs").to_string_lossy().to_string()
}

fn start_node_server(app: &tauri::AppHandle) -> Option<tauri_plugin_shell::process::CommandChild> {
    let server_script = find_server_script(app);
    println!("[tauri] Starting server: {}", server_script);

    let shell = app.shell();
    match shell.command("node").arg(&server_script).env("NODE_ENV", "production").spawn() {
        Ok((mut rx, child)) => {
            println!("[tauri] Server started");
            std::thread::spawn(move || {
                while let Some(event) = rx.blocking_recv() {
                    match event {
                        tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                            println!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                            eprintln!("[server:err] {}", String::from_utf8_lossy(&line));
                        }
                        tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                            println!("[tauri] Server exited: code={:?}", payload.code);
                            break;
                        }
                        _ => {}
                    }
                }
            });
            Some(child)
        }
        Err(e) => {
            eprintln!("[tauri] Failed to start server: {}", e);
            None
        }
    }
}

fn wait_for_server(port: u16, max_retries: u32) -> bool {
    for i in 0..max_retries {
        if let Ok(mut stream) = TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            Duration::from_secs(1),
        ) {
            let _ = stream.write_all(b"GET /api/health HTTP/1.0\r\n\r\n");
            let mut buf = [0u8; 256];
            if stream.read(&mut buf).is_ok() {
                let resp = String::from_utf8_lossy(&buf);
                if resp.contains("200") || resp.contains("OK") {
                    println!("[tauri] Server is ready on port {}", port);
                    return true;
                }
            }
        }
        println!("[tauri] Waiting for server... {}/{}", i + 1, max_retries);
        std::thread::sleep(Duration::from_millis(1000));
    }
    false
}

#[tauri::command]
fn check_server_health() -> Result<String, String> {
    match TcpStream::connect_timeout(&"127.0.0.1:3001".parse().unwrap(), Duration::from_secs(3)) {
        Ok(mut stream) => {
            let _ = stream.write_all(b"GET /api/health HTTP/1.0\r\n\r\n");
            let mut buf = [0u8; 256];
            match stream.read(&mut buf) {
                Ok(n) => Ok(String::from_utf8_lossy(&buf[..n]).to_string()),
                Err(e) => Err(format!("读取响应失败: {}", e)),
            }
        }
        Err(e) => Err(format!("服务未就绪: {}", e)),
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Some(child) = start_node_server(&handle) {
                    let state = handle.state::<ServerProcess>();
                    *state.0.lock().unwrap() = Some(child);
                }
                if wait_for_server(3001, 30) {
                    println!("[tauri] Server ready");
                    if let Some(window) = handle.get_webview_window("main") {
                        println!("[tauri] Navigating to http://localhost:3001");
                        let url = tauri::Url::parse("http://localhost:3001").unwrap();
                        let _ = window.navigate(url);
                    }
                } else {
                    eprintln!("[tauri] Server failed to start within timeout");
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<ServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                            println!("[tauri] Server process terminated");
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![check_server_health])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {});
}
