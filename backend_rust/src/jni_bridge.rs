#![cfg(feature = "android-jni")]

use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::jstring;
use std::collections::HashMap;
use std::sync::Mutex;

fn run_async<F, T>(f: F) -> Result<T, String>
where
    F: std::future::Future<Output = Result<T, String>>,
{
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    rt.block_on(f)
}

fn jstring_to_string(env: &mut JNIEnv, input: &JString) -> Result<String, String> {
    env.get_string(input).map(|s| s.into()).map_err(|e| e.to_string())
}

fn string_to_jstring(env: &mut JNIEnv, input: &str) -> jstring {
    env.new_string(input).map(|s| s.into_raw()).unwrap_or(std::ptr::null_mut())
}

fn ok_json(data: serde_json::Value) -> String {
    serde_json::json!({"success": true, "data": data}).to_string()
}

fn err_json(msg: &str) -> String {
    serde_json::json!({"success": false, "message": msg}).to_string()
}

#[no_mangle]
pub extern "C" fn Java_com_nsmc_assistant_RustBridge_nativelogin(
    mut env: JNIEnv,
    _class: JClass,
    username: JString,
    password: JString,
) -> jstring {
    let uname = match jstring_to_string(&mut env, &username) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let pass = match jstring_to_string(&mut env, &password) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let result = run_async(async move {
        let client = crate::create_client();
        client.get(crate::LOGIN_URL).send().await.map_err(|e| format!("网络错误: {}", e))?;
        let encoded = format!("{}%%%{}", crate::encode_input(&uname), crate::encode_input(&pass));
        let mut fd = HashMap::new();
        fd.insert("encoded", encoded);
        fd.insert("loginMethod", "LoginToXk".to_string());
        let response = client.post(crate::LOGIN_API).form(&fd).send().await.map_err(|e| format!("网络错误: {}", e))?;
        let url = response.url().to_string();
        if !url.contains("xsMain") && !url.contains("个人中心") {
            return Err("登录失败，请检查学号和密码".to_string());
        }
        let name = crate::get_user_name(&client).await.unwrap_or_else(|| uname.clone());
        Ok(serde_json::json!({"username": uname, "name": name}))
    });
    match result {
        Ok(data) => string_to_jstring(&mut env, &ok_json(data)),
        Err(e) => string_to_jstring(&mut env, &err_json(&e)),
    }
}

#[no_mangle]
pub extern "C" fn Java_com_nsmc_assistant_RustBridge_nativegetScore(
    mut env: JNIEnv,
    _class: JClass,
    username: JString,
    password: JString,
    name: JString,
    term: JString,
) -> jstring {
    let uname = match jstring_to_string(&mut env, &username) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let pass = match jstring_to_string(&mut env, &password) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let name_opt = match jstring_to_string(&mut env, &name) {
        Ok(s) if !s.is_empty() => Some(s), _ => None,
    };
    let term_opt = match jstring_to_string(&mut env, &term) {
        Ok(s) if !s.is_empty() => Some(s), _ => None,
    };
    let result = run_async(async move {
        let (scores, user, real_name, err) = crate::login_and_get_scores(&uname, &pass, name_opt.as_deref(), term_opt.as_deref()).await;
        if let Some(e) = err { return Err(e); }
        Ok(serde_json::json!({"username": user, "name": real_name, "scores": scores.unwrap_or_default()}))
    });
    match result {
        Ok(data) => string_to_jstring(&mut env, &ok_json(data)),
        Err(e) => string_to_jstring(&mut env, &err_json(&e)),
    }
}

#[no_mangle]
pub extern "C" fn Java_com_nsmc_assistant_RustBridge_nativeevaluationList(
    mut env: JNIEnv,
    _class: JClass,
    username: JString,
    password: JString,
) -> jstring {
    let uname = match jstring_to_string(&mut env, &username) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let pass = match jstring_to_string(&mut env, &password) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let result = run_async(async move {
        let client = crate::create_client();
        if !crate::evaluation_login(&client, &uname, &pass).await {
            return Err("登录失败".to_string());
        }
        let mut all = Vec::new();
        for b in crate::get_evaluation_batches(&client).await {
            if let Some(url) = b["url"].as_str() {
                all.extend(crate::get_evaluation_teachers(&client, url).await);
            }
        }
        let total = all.len();
        let submitted = all.iter().filter(|t| t["submitted"].as_str().unwrap_or("") == "是").count();
        Ok(serde_json::json!({"teachers": all, "total": total, "submitted": submitted, "unsubmitted": total - submitted}))
    });
    match result {
        Ok(data) => string_to_jstring(&mut env, &ok_json(data)),
        Err(e) => string_to_jstring(&mut env, &err_json(&e)),
    }
}

#[no_mangle]
pub extern "C" fn Java_com_nsmc_assistant_RustBridge_nativeevaluationSubmit(
    mut env: JNIEnv,
    _class: JClass,
    username: JString,
    password: JString,
    teacher_json: JString,
    do_submit: jni::sys::jboolean,
) -> jstring {
    let uname = match jstring_to_string(&mut env, &username) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let pass = match jstring_to_string(&mut env, &password) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let t_json_str = match jstring_to_string(&mut env, &teacher_json) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let teacher: serde_json::Value = match serde_json::from_str(&t_json_str) {
        Ok(v) => v, Err(e) => return string_to_jstring(&mut env, &err_json(&format!("解析teacher失败: {}", e))),
    };
    let submit = do_submit != 0;
    let result = run_async(async move {
        let client = crate::create_client();
        if !crate::evaluation_login(&client, &uname, &pass).await {
            return Err("登录失败".to_string());
        }
        let url_str = teacher["url"].as_str().unwrap_or("");
        let url = if url_str.starts_with("http") { url_str.to_string() } else { format!("https://jiaowu3.nsmc.edu.cn{}", url_str) };
        let body = client.get(&url).send().await.map_err(|e| format!("获取表单失败: {}", e))?.text().await.map_err(|e| format!("获取表单失败: {}", e))?;
        let html = scraper::Html::parse_document(&body);
        let mut fd: Vec<(String, String)> = Vec::new();
        let mut seen = std::collections::HashSet::new();
        if let Ok(sel) = scraper::Selector::parse("input[type='hidden']") {
            for input in html.select(&sel) {
                if let (Some(name), Some(value)) = (input.attr("name"), input.attr("value")) {
                    let n = name.to_string(); let v = value.to_string();
                    if !seen.contains(&n) { seen.insert(n.clone()); fd.push((n, v)); }
                }
            }
        }
        fd.retain(|(k,_)| k != "issubmit");
        fd.push(("issubmit".to_string(), if submit { "1".to_string() } else { "0".to_string() }));
        let mut questions = Vec::new();
        if let Ok(table_sel) = scraper::Selector::parse("table#table1") {
            if let Some(table) = html.select(&table_sel).next() {
                if let Ok(tr_sel) = scraper::Selector::parse("tr") {
                    for row in table.select(&tr_sel) {
                        let tds: Vec<_> = row.select(&scraper::Selector::parse("td").unwrap()).collect();
                        if tds.is_empty() { continue; }
                        if let Ok(input_sel) = scraper::Selector::parse("input[name='pj06xh']") {
                            let pj = tds[0].select(&input_sel).next();
                            if pj.is_none() { continue; }
                            let seq = pj.unwrap().attr("value").unwrap_or("");
                            questions.push(seq.to_string());
                        }
                    }
                }
            }
        }
        let last = questions.len().saturating_sub(1);
        for (i, seq) in questions.iter().enumerate() {
            let rn = format!("pj0601id_{}", seq);
            let key = if i == last { "满意" } else { "非常满意" };
            fd.push((rn.clone(), key.to_string()));
        }
        fd.push(("jynr".to_string(), "".to_string()));
        let save_text = match client.post(crate::XSPJ_SAVE_URL).form(&fd).send().await {
            Ok(r) => r.text().await.unwrap_or_default(),
            Err(_) => String::new(),
        };
        let ok = save_text.contains("保存成功") || save_text.contains("提交成功");
        let msg = if ok { "提交成功".to_string() } else { format!("失败: {}", &save_text[..save_text.len().min(100)]) };
        Ok(serde_json::json!({"success": ok, "message": msg}))
    });
    match result {
        Ok(data) => string_to_jstring(&mut env, &ok_json(data)),
        Err(e) => string_to_jstring(&mut env, &err_json(&e)),
    }
}

#[no_mangle]
pub extern "C" fn Java_com_nsmc_assistant_RustBridge_nativexg2Login(
    mut env: JNIEnv,
    _class: JClass,
    username: JString,
    password: JString,
) -> jstring {
    let uname = match jstring_to_string(&mut env, &username) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let pass = match jstring_to_string(&mut env, &password) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let result = run_async(async move {
        let client = crate::create_client();
        let data = crate::xg2_login_handler_inner(&client, &uname, &pass).await?;
        *crate::XG2_SESSION.lock().unwrap() = Some((uname, client));
        serde_json::to_value(data).map_err(|e| e.to_string())
    });
    match result {
        Ok(data) => string_to_jstring(&mut env, &ok_json(data)),
        Err(e) => string_to_jstring(&mut env, &err_json(&e)),
    }
}

#[no_mangle]
pub extern "C" fn Java_com_nsmc_assistant_RustBridge_nativexg2EditForm(
    mut env: JNIEnv,
    _class: JClass,
    username: JString,
) -> jstring {
    let uname = match jstring_to_string(&mut env, &username) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let result = run_async(async move {
        let client = {
            let guard = crate::XG2_SESSION.lock().unwrap();
            match guard.as_ref() {
                Some((u, c)) if u == &uname => c.clone(),
                _ => return Err("请先登录学工系统".to_string()),
            }
        };
        let data = crate::xg2_get_edit_form(&client).await?;
        serde_json::to_value(data).map_err(|e| e.to_string())
    });
    match result {
        Ok(data) => string_to_jstring(&mut env, &ok_json(data)),
        Err(e) => string_to_jstring(&mut env, &err_json(&e)),
    }
}

#[no_mangle]
pub extern "C" fn Java_com_nsmc_assistant_RustBridge_nativexg2Submit(
    mut env: JNIEnv,
    _class: JClass,
    username: JString,
    form_fields_json: JString,
) -> jstring {
    let uname = match jstring_to_string(&mut env, &username) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let ff_str = match jstring_to_string(&mut env, &form_fields_json) {
        Ok(s) => s, Err(e) => return string_to_jstring(&mut env, &err_json(&e)),
    };
    let fields: HashMap<String, String> = match serde_json::from_str(&ff_str) {
        Ok(f) => f, Err(e) => return string_to_jstring(&mut env, &err_json(&format!("解析表单字段失败: {}", e))),
    };
    let result = run_async(async move {
        let client = {
            let guard = crate::XG2_SESSION.lock().unwrap();
            match guard.as_ref() {
                Some((u, c)) if u == &uname => c.clone(),
                _ => return Err("请先登录学工系统".to_string()),
            }
        };
        crate::xg2_submit(&client, &fields).await
    });
    match result {
        Ok(msg) => string_to_jstring(&mut env, &serde_json::json!({"success": true, "message": msg}).to_string()),
        Err(e) => string_to_jstring(&mut env, &err_json(&e)),
    }
}
