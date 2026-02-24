use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::webview::WebviewWindowBuilder;
use tauri::WebviewUrl;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

struct SidecarState(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

/// Resolve the database path for the sidecar.
/// 1. Try `git rev-parse --show-toplevel` → `<repo_root>/.caw/workflows.db`
/// 2. Fall back to `~/.caw/workflows.db` (global mode)
fn resolve_db_path() -> String {
    if let Ok(output) = std::process::Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
    {
        if output.status.success() {
            let repo_root = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !repo_root.is_empty() {
                return format!("{repo_root}/.caw/workflows.db");
            }
        }
    }

    // Fall back to global ~/.caw/workflows.db
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    format!("{home}/.caw/workflows.db")
}

#[cfg(target_os = "macos")]
fn set_traffic_light_position<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, x: f64, y: f64) {
    use objc2_app_kit::{NSWindow, NSWindowButton};
    use objc2_foundation::NSRect;

    let ns_window_ptr = match window.ns_window() {
        Ok(ptr) => ptr,
        Err(_) => return,
    };

    unsafe {
        let ns_window: &NSWindow = &*(ns_window_ptr as *const NSWindow);

        let close = ns_window.standardWindowButton(NSWindowButton::CloseButton);
        let miniaturize = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton);
        let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton);

        let (close, miniaturize, zoom) = match (close, miniaturize, zoom) {
            (Some(c), Some(m), Some(z)) => (c, m, z),
            _ => return,
        };

        // Resize and reposition the title bar container (superview's superview)
        let title_bar_container = close.superview().and_then(|sv| sv.superview());
        if let Some(container) = title_bar_container {
            let close_rect: NSRect = close.frame();
            let title_bar_height = close_rect.size.height + y;
            let mut container_frame: NSRect = container.frame();
            container_frame.size.height = title_bar_height;
            container_frame.origin.y = ns_window.frame().size.height - title_bar_height;
            container.setFrame(container_frame);
        }

        // Reposition buttons within the container
        let close_rect: NSRect = close.frame();
        let button_height = close_rect.size.height;
        let space_between = miniaturize.frame().origin.x - close_rect.origin.x;
        // Center buttons vertically in the resized container (Cocoa: y is from bottom)
        let button_y = (y - button_height) / 2.0;

        let buttons = [close, miniaturize, zoom];
        for (i, button) in buttons.iter().enumerate() {
            let mut rect: NSRect = button.frame();
            rect.origin.x = x + (i as f64 * space_between);
            rect.origin.y = button_y;
            button.setFrameOrigin(rect.origin);
        }
    }
}

#[tauri::command]
async fn server_status() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get("http://localhost:3100/health").send().await {
        Ok(resp) if resp.status().is_success() => {
            Ok(serde_json::json!({ "running": true }))
        }
        _ => Ok(serde_json::json!({ "running": false })),
    }
}

#[tauri::command]
async fn restart_server(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    // Kill existing sidecar
    let state = app.state::<SidecarState>();
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    }

    // Small delay to let the port free up
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // Re-spawn sidecar
    let db_path = resolve_db_path();
    let sidecar = app.shell().sidecar("caw").map_err(|e| e.to_string())?;
    let (_rx, child) = sidecar
        .args(["--server", "--transport", "http", "--port", "3100", "--db", &db_path])
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    // Poll health until ready
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    for _ in 0..30 {
        if let Ok(resp) = client.get("http://localhost:3100/health").send().await {
            if resp.status().is_success() {
                return Ok(serde_json::json!({ "success": true }));
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    Err("Server did not become healthy within 15 seconds".to_string())
}

#[tauri::command]
async fn stop_server(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<SidecarState>();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| format!("Failed to kill sidecar: {e}"))?;
    }
    Ok(serde_json::json!({ "success": true }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![server_status, restart_server, stop_server])
        .setup(|app| {
            // Build native macOS menu bar
            build_menu(app)?;

            // Spawn sidecar
            let db_path = resolve_db_path();
            let sidecar = app.shell().sidecar("caw").unwrap();
            let (_rx, child) = sidecar
                .args(["--server", "--transport", "http", "--port", "3100", "--db", &db_path])
                .spawn()
                .expect("failed to spawn caw sidecar");

            app.manage(SidecarState(std::sync::Mutex::new(Some(child))));

            // Show window immediately — don't gate on sidecar health
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let _ = apply_vibrancy(
                        &window,
                        NSVisualEffectMaterial::Sidebar,
                        None,
                        None,
                    );
                    set_traffic_light_position(&window, 14.0, 18.0);
                }
                let _ = window.show();
            }

            // Log sidecar readiness in the background
            tauri::async_runtime::spawn(async move {
                let client = reqwest::Client::new();
                for _ in 0..60 {
                    if let Ok(resp) = client.get("http://localhost:3100/health").send().await {
                        if resp.status().is_success() {
                            eprintln!("Sidecar ready on port 3100");
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

fn build_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let handle = app.handle();

    // App submenu
    let settings_item = MenuItemBuilder::with_id("settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(handle)?;

    let app_submenu = SubmenuBuilder::new(handle, "caw")
        .item(&PredefinedMenuItem::about(handle, Some("About caw"), None)?)
        .separator()
        .item(&settings_item)
        .separator()
        .item(&PredefinedMenuItem::quit(handle, Some("Quit caw"))?)
        .build()?;

    // Edit submenu
    let edit_submenu = SubmenuBuilder::new(handle, "Edit")
        .item(&PredefinedMenuItem::undo(handle, None)?)
        .item(&PredefinedMenuItem::redo(handle, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(handle, None)?)
        .item(&PredefinedMenuItem::copy(handle, None)?)
        .item(&PredefinedMenuItem::paste(handle, None)?)
        .item(&PredefinedMenuItem::select_all(handle, None)?)
        .build()?;

    // View submenu
    let reload_item = MenuItemBuilder::with_id("reload", "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(handle)?;
    let fullscreen_item = MenuItemBuilder::with_id("fullscreen", "Toggle Full Screen")
        .accelerator("Ctrl+CmdOrCtrl+F")
        .build(handle)?;

    let view_submenu = SubmenuBuilder::new(handle, "View")
        .item(&reload_item)
        .separator()
        .item(&fullscreen_item)
        .build()?;

    // Window submenu
    let window_submenu = SubmenuBuilder::new(handle, "Window")
        .item(&PredefinedMenuItem::minimize(handle, None)?)
        .item(&MenuItemBuilder::with_id("zoom", "Zoom").build(handle)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(handle, Some("Close"))?)
        .build()?;

    // Help submenu
    let help_item = MenuItemBuilder::with_id("help", "caw Help")
        .build(handle)?;

    let help_submenu = SubmenuBuilder::new(handle, "Help")
        .item(&help_item)
        .build()?;

    let menu = MenuBuilder::new(handle)
        .item(&app_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .item(&help_submenu)
        .build()?;

    app.set_menu(menu)?;

    // Handle menu events
    let handle_clone = app.handle().clone();
    app.on_menu_event(move |_app, event| {
        let id = event.id().0.as_str();
        if let Some(window) = handle_clone.get_webview_window("main") {
            match id {
                "settings" => {
                    if let Some(win) = handle_clone.get_webview_window("settings") {
                        let _ = win.set_focus();
                    } else {
                        let _ = WebviewWindowBuilder::new(
                            &handle_clone,
                            "settings",
                            WebviewUrl::App("/settings".into()),
                        )
                        .title("Settings")
                        .inner_size(700.0, 600.0)
                        .min_inner_size(500.0, 400.0)
                        .build();
                    }
                }
                "help" => {
                    if let Some(win) = handle_clone.get_webview_window("settings") {
                        let _ = win.set_focus();
                    } else {
                        let _ = WebviewWindowBuilder::new(
                            &handle_clone,
                            "settings",
                            WebviewUrl::App("/settings".into()),
                        )
                        .title("Settings")
                        .inner_size(700.0, 600.0)
                        .min_inner_size(500.0, 400.0)
                        .build();
                    }
                }
                "reload" => {
                    // Standard Tauri pattern for page reload
                    let js = "window.location.reload()";
                    let _ = window.eval(js);
                }
                "fullscreen" => {
                    if let Ok(is_fullscreen) = window.is_fullscreen() {
                        let _ = window.set_fullscreen(!is_fullscreen);
                    }
                }
                "zoom" => {
                    if let Ok(is_maximized) = window.is_maximized() {
                        if is_maximized {
                            let _ = window.unmaximize();
                        } else {
                            let _ = window.maximize();
                        }
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}
