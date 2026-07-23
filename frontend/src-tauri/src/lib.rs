#[cfg(not(mobile))]
use std::sync::{Arc, Mutex};
#[cfg(not(mobile))]
use std::process::{Child, Command};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(not(mobile))]
use tauri::Manager;

// ==================== Tauri 命令（jiao wu 3） ====================

#[tauri::command]
async fn login(username: String, password: String) -> Result<serde_json::Value, String> {
    let client = backend_rust::create_client();
    if let Err(e) = client.get(backend_rust::LOGIN_URL).send().await {
        return Err(format!("网络错误: {}", e));
    }
    let encoded = format!("{}%%%{}", backend_rust::encode_input(&username), backend_rust::encode_input(&password));
    let mut fd = std::collections::HashMap::new();
    fd.insert("encoded", encoded);
    fd.insert("loginMethod", "LoginToXk".to_string());
    match client.post(backend_rust::LOGIN_API).form(&fd).send().await {
        Ok(response) => {
            let url = response.url().to_string();
            if !url.contains("xsMain") && !url.contains("个人中心") {
                return Err("登录失败".to_string());
            }
            let name = backend_rust::get_user_name(&client).await.unwrap_or_else(|| username.clone());
            Ok(serde_json::json!({"username": username, "name": name}))
        }
        Err(e) => Err(format!("网络错误: {}", e)),
    }
}

#[tauri::command]
async fn get_score(username: String, password: String, name: Option<String>, term: Option<String>) -> Result<serde_json::Value, String> {
    let (scores, user, real_name, err) = backend_rust::login_and_get_scores(&username, &password, name.as_deref(), term.as_deref()).await;
    if let Some(e) = err {
        return Err(e);
    }
    Ok(serde_json::json!({
        "username": user,
        "name": real_name,
        "scores": scores.unwrap_or_default()
    }))
}

#[tauri::command]
async fn evaluation_list(username: String, password: String) -> Result<serde_json::Value, String> {
    let client = backend_rust::create_client();
    if !backend_rust::evaluation_login(&client, &username, &password).await {
        return Err("登录失败".to_string());
    }
    let mut all = Vec::new();
    for b in backend_rust::get_evaluation_batches(&client).await {
        if let Some(url) = b["url"].as_str() {
            all.extend(backend_rust::get_evaluation_teachers(&client, url).await);
        }
    }
    let total = all.len();
    let submitted = all.iter().filter(|t| t["submitted"].as_str().unwrap_or("") == "是").count();
    Ok(serde_json::json!({
        "teachers": all,
        "total": total,
        "submitted": submitted,
        "unsubmitted": total - submitted
    }))
}

fn parse_evaluation_form(body: &str, do_submit: Option<bool>) -> Result<(Vec<(String, String)>, Vec<(String, String, std::collections::HashMap<String, String>)>), String> {
    let html = scraper::Html::parse_document(body);
    let mut fd: Vec<(String, String)> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for input in html.select(&scraper::Selector::parse("input[type='hidden']").unwrap()) {
        if let (Some(name), Some(value)) = (input.attr("name"), input.attr("value")) {
            let n = name.to_string(); let v = value.to_string();
            if seen.contains(&n) { fd.push((n, v)); } else { seen.insert(n.clone()); fd.push((n, v)); }
        }
    }
    fd.retain(|(k,_)| k != "issubmit");
    fd.push(("issubmit".to_string(), if do_submit.unwrap_or(false) { "1".to_string() } else { "0".to_string() }));
    let mut questions = Vec::new();
    if let Some(table) = html.select(&scraper::Selector::parse("table#table1").unwrap()).next() {
        for row in table.select(&scraper::Selector::parse("tr").unwrap()) {
            let tds: Vec<_> = row.select(&scraper::Selector::parse("td").unwrap()).collect();
            if tds.is_empty() { continue; }
            let pj = tds[0].select(&scraper::Selector::parse("input[name='pj06xh']").unwrap()).next();
            if pj.is_none() { continue; }
            let seq = pj.unwrap().attr("value").unwrap_or("");
            let text = tds[0].text().collect::<String>().trim().to_string().replace(seq, "").trim().to_string();
            let opt_td = tds.iter().find(|td| td.attr("name") == Some("zbtd"));
            let mut opts = std::collections::HashMap::new(); let mut rn = format!("pj0601id_{}", seq);
            if let Some(otd) = opt_td {
                if let Some(fr) = otd.select(&scraper::Selector::parse("input[type='radio']").unwrap()).next() { if let Some(n) = fr.attr("name") { rn = n.to_string(); } }
                for radio in otd.select(&scraper::Selector::parse("input[type='radio']").unwrap()) { if let (Some(t), Some(v)) = (radio.attr("title"), radio.attr("value")) { opts.insert(t.to_string(), v.to_string()); } }
            }
            questions.push((rn, text, opts));
        }
    }
    if questions.is_empty() { return Err("未解析到题目".to_string()); }
    Ok((fd, questions))
}

#[tauri::command]
async fn evaluation_submit(username: String, password: String, teacher: serde_json::Value, do_submit: Option<bool>) -> Result<serde_json::Value, String> {
    let client = backend_rust::create_client();
    if !backend_rust::evaluation_login(&client, &username, &password).await {
        return Err("登录失败".to_string());
    }
    let url_str = teacher["url"].as_str().unwrap_or("");
    let url = if url_str.starts_with("http") {
        url_str.to_string()
    } else {
        format!("https://jiaowu3.nsmc.edu.cn{}", url_str)
    };
    let body = client.get(&url).send().await
        .map_err(|e| format!("获取表单失败: {}", e))?
        .text().await
        .map_err(|e| format!("获取表单失败: {}", e))?;
    let (mut fd, questions) = parse_evaluation_form(&body, do_submit)?;
    let last = questions.len() - 1;
    for (i, (rn, _, opts)) in questions.iter().enumerate() {
        let key = if i == last { "满意" } else { "非常满意" };
        if let Some(v) = opts.get(key) { fd.push((rn.clone(), v.clone())); } else { return Err(format!("缺少'{}'选项", key)); }
    }
    fd.push(("jynr".to_string(), "".to_string()));
    let save_text = match client.post(backend_rust::XSPJ_SAVE_URL).form(&fd).send().await { Ok(r) => match r.text().await { Ok(t) => t, Err(_) => "".to_string() }, Err(_) => "".to_string() };
    let ok = save_text.contains("保存成功") || save_text.contains("提交成功");
    let msg = if ok { "提交成功".to_string() } else { format!("失败: {}", &save_text[..save_text.len().min(100)]) };
    Ok(serde_json::json!({"success": ok, "message": msg}))
}

// ==================== Tauri 命令（xg2 学工系统） ====================

#[tauri::command]
async fn xg2_login(username: String, password: String) -> Result<serde_json::Value, String> {
    let client = backend_rust::create_client();
    let data = backend_rust::xg2_login_handler_inner(&client, &username, &password).await?;
    *backend_rust::XG2_SESSION.lock().unwrap() = Some((username, client));
    Ok(serde_json::to_value(data).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn xg2_edit_form(username: String) -> Result<serde_json::Value, String> {
    let client = {
        let guard = backend_rust::XG2_SESSION.lock().unwrap();
        match guard.as_ref() {
            Some((u, c)) if u == &username => c.clone(),
            _ => return Err("请先登录".to_string()),
        }
    };
    let data = backend_rust::xg2_get_edit_form(&client).await?;
    Ok(serde_json::to_value(data).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn xg2_submit(username: String, form_fields: std::collections::HashMap<String, String>) -> Result<String, String> {
    let client = {
        let guard = backend_rust::XG2_SESSION.lock().unwrap();
        match guard.as_ref() {
            Some((u, c)) if u == &username => c.clone(),
            _ => return Err("请先登录".to_string()),
        }
    };
    backend_rust::xg2_submit(&client, &form_fields).await
}

// ==================== 桌面端后端启动/清理 ====================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(not(mobile))]
            {
                if let Ok(exe_path) = std::env::current_exe() {
                    let exe_dir = exe_path.parent().unwrap();
                    let backend_path = exe_dir.join("resources").join("backend.exe");

                    if backend_path.exists() {
                        let mut command = Command::new(backend_path);

                        #[cfg(windows)]
                        {
                            use std::os::windows::process::CommandExt;
                            command.creation_flags(0x08000000);
                        }

                        match command.spawn() {
                            Ok(child) => {
                                app.manage(Arc::new(Mutex::new(Some(child))));
                            },
                            Err(_) => {},
                        }
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|app_handle, event| match event {
            tauri::WindowEvent::Destroyed => {
                #[cfg(not(mobile))]
                {
                    let process_state: tauri::State<Arc<Mutex<Option<Child>>>> = app_handle.state();
                    if let Ok(mut guard) = process_state.inner().lock() {
                        if let Some(child) = guard.take() {
                            let _ = Command::new("taskkill")
                                .args(&["/F", "/PID", &child.id().to_string()])
                                .creation_flags(0x08000000)
                                .output();
                        }
                    }
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            login,
            get_score,
            evaluation_list,
            evaluation_submit,
            xg2_login,
            xg2_edit_form,
            xg2_submit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
