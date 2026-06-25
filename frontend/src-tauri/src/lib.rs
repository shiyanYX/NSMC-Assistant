use std::sync::{Arc, Mutex};
use std::process::{Child, Command};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      // 启动后端
      if let Ok(exe_path) = std::env::current_exe() {
        let exe_dir = exe_path.parent().unwrap();
        let backend_path = exe_dir.join("resources").join("backend.exe");

        if backend_path.exists() {
          let mut command = Command::new(backend_path);

          #[cfg(windows)]
          {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
          }

          match command.spawn() {
            Ok(child) => {
              app.manage(Arc::new(Mutex::new(Some(child))));
            },
            Err(_) => {},
          }
        }
      }

      Ok(())
    })
    .on_window_event(|app_handle, event| match event {
      tauri::WindowEvent::Destroyed => {
        let process_state: tauri::State<Arc<Mutex<Option<Child>>>> = app_handle.state();
        if let Ok(mut guard) = process_state.inner().lock() {
          if let Some(child) = guard.take() {
            // 直接 kill 进程，不通过 cmd.exe，避免弹窗
            let _ = Command::new("taskkill")
              .args(&["/F", "/PID", &child.id().to_string()])
              .creation_flags(0x08000000) // CREATE_NO_WINDOW
              .output();
          }
        }
      }
      _ => {}
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
