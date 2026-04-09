use std::sync::{Arc, Mutex};
use std::process::Child;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      // 启动后端
      if let Ok(exe_path) = std::env::current_exe() {
        let exe_dir = exe_path.parent().unwrap();
        let backend_path = exe_dir.join("resources").join("backend.exe");
        
        if backend_path.exists() {
          let mut command = std::process::Command::new(backend_path);
          
          // 在Windows上隐藏窗口
          #[cfg(windows)]
          {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
          }
          
          match command.spawn() {
            Ok(child) => {
              println!("后端启动成功");
              
              // 保存后端进程句柄以便后续清理
              app.manage(Arc::new(Mutex::new(Some(child))));
            },
            Err(e) => println!("后端启动失败: {:?}", e),
          }
        } else {
          println!("后端文件不存在: {:?}", backend_path);
        }
      } else {
        println!("无法获取当前可执行文件路径");
      }
      
      Ok(())
    })
    .on_window_event(|app_handle, event| match event {
      tauri::WindowEvent::Destroyed => {
        // 当窗口被销毁时，尝试关闭后端进程
        let process_state: tauri::State<Arc<Mutex<Option<Child>>>> = app_handle.state();
        if let Ok(mut guard) = process_state.inner().lock() {
          if let Some(child) = guard.take() {
            #[cfg(windows)]
            {
              // 在Windows上使用taskkill命令结束进程
              use std::process::Command;
              if let Ok(_) = Command::new("cmd").args(&["/C", &format!("taskkill /F /PID {}", child.id())]).output() {
                println!("成功关闭后端进程");
              } else {
                println!("关闭后端进程失败");
              }
            }
            #[cfg(unix)]
            {
              // 在Unix系统上发送SIGTERM信号
              use std::process::Command;
              if let Ok(_) = Command::new("kill").args(&["-15", &child.id().to_string()]).output() {
                println!("成功关闭后端进程");
              } else {
                println!("关闭后端进程失败");
              }
            }
          }
        }
      }
      _ => {}
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
