#![windows_subsystem = "windows"]
use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use backend_rust::*;
use log::{info, error};
use scraper::{Html, Selector};
use std::collections::HashMap;

async fn login(req: web::Json<LoginRequest>) -> impl Responder {
    let client = create_client();
    if let Err(e) = client.get(LOGIN_URL).send().await { return HttpResponse::InternalServerError().json(ApiResponse { success: false, data: None, message: format!("网络错误: {}", e) }); }
    let encoded = format!("{}%%%{}", encode_input(&req.username), encode_input(&req.password));
    let mut fd = HashMap::new(); fd.insert("encoded", encoded); fd.insert("loginMethod", "LoginToXk".to_string());
    match client.post(LOGIN_API).form(&fd).send().await {
        Ok(response) => {
            let url = response.url().to_string();
            if !url.contains("xsMain") && !url.contains("个人中心") { return HttpResponse::Unauthorized().json(ApiResponse { success: false, data: None, message: "登录失败".to_string() }); }
            let name = get_user_name(&client).await.unwrap_or_else(|| req.username.clone());
            HttpResponse::Ok().json(ApiResponse { success: true, data: Some(serde_json::json!({"username": req.username, "name": name})), message: "登录成功".to_string() })
        }
        Err(e) => HttpResponse::InternalServerError().json(ApiResponse { success: false, data: None, message: format!("网络错误: {}", e) }),
    }
}

async fn get_score(req: web::Json<ScoreRequest>) -> impl Responder {
    let (scores, user, real_name, err) = login_and_get_scores(&req.username, &req.password, req.name.as_deref(), req.term.as_deref()).await;
    if let Some(e) = err { return HttpResponse::BadRequest().json(ApiResponse { success: false, data: None, message: e }); }
    HttpResponse::Ok().json(ApiResponse { success: true, data: Some(serde_json::to_value(ScoreData { username: user, name: real_name, scores: scores.unwrap_or_default() }).unwrap()), message: "获取成绩成功".to_string() })
}

async fn evaluation_list(req: web::Json<EvaluationListRequest>) -> impl Responder {
    let client = create_client();
    if !evaluation_login(&client, &req.username, &req.password).await { return HttpResponse::Unauthorized().json(ApiResponse { success: false, data: None, message: "登录失败".to_string() }); }
    let mut all = Vec::new();
    for b in get_evaluation_batches(&client).await {
        if let Some(url) = b["url"].as_str() { all.extend(get_evaluation_teachers(&client, url).await); }
    }
    let total = all.len(); let submitted = all.iter().filter(|t| t["submitted"].as_str().unwrap_or("") == "是").count();
    HttpResponse::Ok().json(ApiResponse { success: true, data: Some(serde_json::to_value(EvaluationListData { teachers: all, total, submitted, unsubmitted: total - submitted }).unwrap()), message: "获取成功".to_string() })
}

async fn evaluation_submit(req: web::Json<EvaluationSubmitRequest>) -> impl Responder {
    let client = create_client();
    if !evaluation_login(&client, &req.username, &req.password).await { return HttpResponse::Unauthorized().json(ApiResponse { success: false, data: None, message: "登录失败".to_string() }); }
    let url = if req.teacher.url.starts_with("http") { req.teacher.url.clone() } else { format!("https://jiaowu3.nsmc.edu.cn{}", req.teacher.url) };
    let body = match client.get(&url).send().await { Ok(r) => match r.text().await { Ok(t) => t, Err(e) => return HttpResponse::InternalServerError().json(ApiResponse { success: false, data: None, message: format!("获取表单失败: {}", e) }) }, Err(e) => return HttpResponse::InternalServerError().json(ApiResponse { success: false, data: None, message: format!("获取表单失败: {}", e) }) };
    let html = Html::parse_document(&body);
    let mut fd: Vec<(String, String)> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for input in html.select(&Selector::parse("input[type='hidden']").unwrap()) {
        if let (Some(name), Some(value)) = (input.attr("name"), input.attr("value")) {
            let n = name.to_string(); let v = value.to_string();
            if seen.contains(&n) { fd.push((n, v)); } else { seen.insert(n.clone()); fd.push((n, v)); }
        }
    }
    fd.retain(|(k,_)| k != "issubmit");
    fd.push(("issubmit".to_string(), if req.do_submit.unwrap_or(false) { "1".to_string() } else { "0".to_string() }));
    let mut questions = Vec::new();
    if let Some(table) = html.select(&Selector::parse("table#table1").unwrap()).next() {
        for row in table.select(&Selector::parse("tr").unwrap()) {
            let tds: Vec<_> = row.select(&Selector::parse("td").unwrap()).collect();
            if tds.is_empty() { continue; }
            let pj = tds[0].select(&Selector::parse("input[name='pj06xh']").unwrap()).next();
            if pj.is_none() { continue; }
            let seq = pj.unwrap().attr("value").unwrap_or("");
            let text = tds[0].text().collect::<String>().trim().to_string().replace(seq, "").trim().to_string();
            let opt_td = tds.iter().find(|td| td.attr("name") == Some("zbtd"));
            let mut opts = HashMap::new(); let mut rn = format!("pj0601id_{}", seq);
            if let Some(otd) = opt_td {
                if let Some(fr) = otd.select(&Selector::parse("input[type='radio']").unwrap()).next() { if let Some(n) = fr.attr("name") { rn = n.to_string(); } }
                for radio in otd.select(&Selector::parse("input[type='radio']").unwrap()) { if let (Some(t), Some(v)) = (radio.attr("title"), radio.attr("value")) { opts.insert(t.to_string(), v.to_string()); } }
            }
            questions.push((rn, text, opts));
        }
    }
    if questions.is_empty() { return HttpResponse::BadRequest().json(ApiResponse { success: false, data: None, message: "未解析到题目".to_string() }); }
    let last = questions.len() - 1;
    for (i, (rn, _, opts)) in questions.iter().enumerate() {
        let key = if i == last { "满意" } else { "非常满意" };
        if let Some(v) = opts.get(key) { fd.push((rn.clone(), v.clone())); } else { return HttpResponse::BadRequest().json(ApiResponse { success: false, data: None, message: format!("缺少'{}'选项", key) }); }
    }
    fd.push(("jynr".to_string(), "".to_string()));
    let save_text = match client.post(XSPJ_SAVE_URL).form(&fd).send().await { Ok(r) => match r.text().await { Ok(t) => t, Err(_) => "".to_string() }, Err(_) => "".to_string() };
    let ok = save_text.contains("保存成功") || save_text.contains("提交成功");
    HttpResponse::Ok().json(ApiResponse { success: ok, data: None, message: if ok { "提交成功".to_string() } else { format!("失败: {}", &save_text[..save_text.len().min(100)]) } })
}

async fn xg2_login_handler(req: web::Json<Xg2LoginRequest>) -> impl Responder {
    let client = create_client();
    match xg2_login_handler_inner(&client, &req.username, &req.password).await {
        Ok(data) => {
            *XG2_SESSION.lock().unwrap() = Some((req.username.clone(), client));
            HttpResponse::Ok().json(ApiResponse { success: true, data: Some(serde_json::to_value(data).unwrap()), message: "登录成功".to_string() })
        }
        Err(e) => HttpResponse::BadRequest().json(ApiResponse { success: false, data: None, message: e }),
    }
}

async fn xg2_edit_form_handler(req: web::Json<Xg2EditFormRequest>) -> impl Responder {
    let guard = XG2_SESSION.lock().unwrap();
    let client = match guard.as_ref() { Some((u, c)) if u == &req.username => c, _ => return HttpResponse::BadRequest().json(ApiResponse { success: false, data: None, message: "请先登录".to_string() }) };
    match xg2_get_edit_form(client).await {
        Ok(data) => HttpResponse::Ok().json(ApiResponse { success: true, data: Some(serde_json::to_value(data).unwrap()), message: "获取成功".to_string() }),
        Err(e) => HttpResponse::BadRequest().json(ApiResponse { success: false, data: None, message: e }),
    }
}

async fn xg2_submit_handler(req: web::Json<Xg2SubmitRequest>) -> impl Responder {
    let guard = XG2_SESSION.lock().unwrap();
    let client = match guard.as_ref() { Some((u, c)) if u == &req.username => c, _ => return HttpResponse::BadRequest().json(ApiResponse { success: false, data: None, message: "请先登录".to_string() }) };
    match xg2_submit(client, &req.form_fields).await {
        Ok(msg) => HttpResponse::Ok().json(ApiResponse { success: msg.contains("成功"), data: None, message: msg }),
        Err(e) => HttpResponse::BadRequest().json(ApiResponse { success: false, data: None, message: e }),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    info!("启动后端服务...");

    let ports = [5000u16, 5001, 5002, 5003, 5004];
    let mut server = None;

    for port in &ports {
        let addr = format!("0.0.0.0:{}", port);
        match HttpServer::new(|| {
            App::new()
                .wrap(actix_cors::Cors::default().allow_any_origin().allow_any_method().allow_any_header())
                .route("/api/login", web::post().to(login))
                .route("/api/score", web::post().to(get_score))
                .route("/api/evaluation/list", web::post().to(evaluation_list))
                .route("/api/evaluation/submit", web::post().to(evaluation_submit))
                .route("/api/xg2/login", web::post().to(xg2_login_handler))
                .route("/api/xg2/edit-form", web::post().to(xg2_edit_form_handler))
                .route("/api/xg2/submit", web::post().to(xg2_submit_handler))
        }).bind(&addr) {
            Ok(s) => { info!("绑定端口 {}", port); server = Some(s.run()); break; }
            Err(e) => { info!("端口 {} 被占用: {}", port, e); continue; }
        }
    }

    match server { Some(s) => s.await, None => { error!("所有端口被占用"); Err(std::io::Error::new(std::io::ErrorKind::AddrInUse, "所有端口被占用")) } }
}
