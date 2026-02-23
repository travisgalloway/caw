use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let sidecar = app.shell().sidecar("caw").unwrap();
            let (_rx, child) = sidecar
                .args(["--server", "--transport", "http", "--port", "3100"])
                .spawn()
                .expect("failed to spawn caw sidecar");

            // Store the child process handle for cleanup
            app.manage(SidecarState(std::sync::Mutex::new(Some(child))));

            // Poll health endpoint until ready
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let client = reqwest::Client::new();
                for _ in 0..60 {
                    if let Ok(resp) = client.get("http://localhost:3100/health").send().await {
                        if resp.status().is_success() {
                            // Sidecar is ready — show the window
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = window.show();
                            }
                            return;
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }
                eprintln!("Warning: sidecar health check timed out");
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Kill the sidecar on exit
                if let Some(state) = app.try_state::<SidecarState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}

struct SidecarState(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);
