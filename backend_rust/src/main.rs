use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use log::{info, error};
use reqwest::{Client, ClientBuilder, cookie::Jar};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

// 常量定义
const LOGIN_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/";
const LOGIN_API: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/xk/LoginToXk";
const SCORE_QUERY_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/kscj/cjcx_list";
const SCORE_QUERY_FORM_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/kscj/cjcx_query";
const MAIN_PAGE_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/framework/xsMain.jsp";

// 数据结构定义
#[derive(Debug, Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct ScoreRequest {
    username: String,
    password: String,
    name: Option<String>,
    term: Option<String>,
}

#[derive(Debug, Serialize)]
struct Term {
    value: String,
    text: String,
}

#[derive(Debug, Serialize)]
struct Score {
    #[serde(flatten)]
    data: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
struct ApiResponse {
    success: bool,
    data: Option<serde_json::Value>,
    message: String,
}

#[derive(Debug, Serialize)]
struct LoginData {
    username: String,
    name: String,
}

#[derive(Debug, Serialize)]
struct ScoreData {
    username: String,
    name: String,
    scores: Vec<Score>,
}

// 辅助函数：创建HTTP客户端
fn create_client() -> Client {
    let jar = Jar::default();
    ClientBuilder::new()
        .cookie_provider(Arc::new(jar))
        .danger_accept_invalid_certs(true)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap()
}

// 辅助函数：编码用户名和密码
fn encode_input(input: &str) -> String {
    STANDARD.encode(input)
}

// 获取可用学期列表
async fn get_available_terms(client: &Client) -> Vec<Term> {
    let mut terms = Vec::new();
    
    match client.get(SCORE_QUERY_FORM_URL).send().await {
        Ok(response) => {
            match response.text().await {
                Ok(body) => {
                    let html = Html::parse_document(&body);
                    
                    // 查找开课时间下拉框
                    let selector = Selector::parse("select#kksja").unwrap();
                    let mut term_select = html.select(&selector).next();
                    
                    if term_select.is_none() {
                        let selector = Selector::parse("select[name='kksja']").unwrap();
                        term_select = html.select(&selector).next();
                    }
                    
                    if let Some(select) = term_select {
                        let option_selector = Selector::parse("option").unwrap();
                        for option in select.select(&option_selector) {
                            if let Some(value) = option.attr("value") {
                                let text = option.text().collect::<String>().trim().to_string();
                                if !value.is_empty() {
                                    terms.push(Term {
                                        value: value.to_string(),
                                        text,
                                    });
                                }
                            }
                        }
                    }
                }
                Err(e) => error!("获取学期列表失败: {}", e),
            }
        }
        Err(e) => error!("获取学期列表失败: {}", e),
    }
    
    terms
}

// 从教务系统获取用户姓名
async fn get_user_name(client: &Client) -> Option<String> {
    match client.get(MAIN_PAGE_URL).send().await {
        Ok(response) => {
            match response.text().await {
                Ok(body) => {
                    let html = Html::parse_document(&body);
                    
                    // 方法1: 尝试从用户信息区域获取
                    let selector = Selector::parse(".edu-user").unwrap();
                    if let Some(user_info) = html.select(&selector).next() {
                        // 尝试从userInfo中获取姓名
                        let selector = Selector::parse(".userInfo").unwrap();
                        if let Some(user_info_div) = user_info.select(&selector).next() {
                            let selector = Selector::parse("p").unwrap();
                            if let Some(name_p) = user_info_div.select(&selector).next() {
                                let name = name_p.text().collect::<String>().trim().to_string();
                                if !name.is_empty() {
                                    return Some(name);
                                }
                            }
                        }
                        
                        // 备选方法：从所有标签中提取
                        let selector = Selector::parse("p, span, div").unwrap();
                        for tag in user_info.select(&selector) {
                            let text = tag.text().collect::<String>().trim().to_string();
                            if !text.is_empty() {
                                // 尝试判断是否为姓名，过滤掉身份信息
                                let clean_text = text.replace("学生", "").replace("老师", "").replace("教职工", "").trim().to_string();
                                if clean_text.len() > 1 && clean_text.len() < 10 && !clean_text.chars().all(|c| c.is_ascii_digit()) {
                                    return Some(clean_text);
                                }
                            }
                        }
                    }
                    
                    // 方法2: 尝试从所有p标签获取
                    let selector = Selector::parse("p").unwrap();
                    for p in html.select(&selector) {
                        let text = p.text().collect::<String>().trim().to_string();
                        if !text.is_empty() {
                            // 尝试判断是否为姓名，过滤掉明显不是姓名的文本
                            if text.len() > 1 && text.len() < 10 && !text.chars().all(|c| c.is_ascii_digit()) &&
                               !text.contains("课表") && !text.contains("查询") && !text.contains("中心") &&
                               !text.contains("申请") && !text.contains("报名") && !text.contains("计划") &&
                               !text.contains("通知") && !text.contains("公告") && !text.contains("留言") {
                                return Some(text);
                            }
                        }
                    }
                }
                Err(e) => error!("获取姓名失败: {}", e),
            }
        }
        Err(e) => error!("获取姓名失败: {}", e),
    }
    
    None
}

// 登录并获取成绩
async fn login_and_get_scores(username: &str, password: &str, name: Option<&str>, term_filter: Option<&str>) -> (Option<Vec<Score>>, String, String, Option<String>) {
    let client = create_client();
    
    // 访问登录页面获取cookie
    match client.get(LOGIN_URL).send().await {
        Ok(_) => {},
        Err(e) => return (None, username.to_string(), name.unwrap_or(username).to_string(), Some(format!("网络请求错误: {}", e))),
    }
    
    // 准备登录数据
    let encoded_account = encode_input(username);
    let encoded_password = encode_input(password);
    let encoded = format!("{}%%%{}", encoded_account, encoded_password);
    
    let mut form_data = HashMap::new();
    form_data.insert("encoded", encoded);
    form_data.insert("loginMethod", "LoginToXk".to_string());
    
    // 发送登录请求
    match client.post(LOGIN_API).form(&form_data).send().await {
        Ok(response) => {
            let response_url = response.url().to_string();
            if !response_url.contains("xsMain") && !response_url.contains("个人中心") {
                return (None, username.to_string(), name.unwrap_or(username).to_string(), Some("登录失败，可能账号或密码错误".to_string()));
            }
            
            // 获取用户姓名
            let real_name = match name {
                Some(n) => n.to_string(),
                None => match get_user_name(&client).await {
                    Some(name) => name,
                    None => username.to_string(),
                },
            };
            
            // 获取可用学期列表
            let available_terms = get_available_terms(&client).await;
            
            // 构建查询参数
            let terms_to_query: Vec<String> = if let Some(term) = term_filter {
                vec![term.to_string()]
            } else {
                available_terms.into_iter().map(|t| t.value).collect()
            };
            
            let mut all_scores = Vec::new();
            let mut headers: Option<Vec<String>> = None;
            
            // 查询每个学期的成绩
            for term_value in terms_to_query {
                let url = if term_value.is_empty() {
                    SCORE_QUERY_URL.to_string()
                } else {
                    format!("{}?kksj={}", SCORE_QUERY_URL, term_value)
                };
                
                match client.get(&url).send().await {
                    Ok(response) => {
                        match response.text().await {
                            Ok(body) => {
                                let html = Html::parse_document(&body);
                                
                                // 查找成绩表格
                                let selector = Selector::parse("table#dataList").unwrap();
                                if let Some(table) = html.select(&selector).next() {
                                    // 获取表头（只获取一次）
                                    if headers.is_none() {
                                        let selector = Selector::parse("thead").unwrap();
                                        if let Some(thead) = table.select(&selector).next() {
                                            let selector = Selector::parse("tr").unwrap();
                                            if let Some(header_row) = thead.select(&selector).next() {
                                                let selector = Selector::parse("th, td").unwrap();
                                                headers = Some(header_row.select(&selector).map(|th| th.text().collect::<String>().trim().to_string()).collect());
                                            }
                                        } else {
                                            let selector = Selector::parse("tr").unwrap();
                                            if let Some(first_row) = table.select(&selector).next() {
                                                let selector = Selector::parse("th, td").unwrap();
                                                headers = Some(first_row.select(&selector).map(|th| th.text().collect::<String>().trim().to_string()).collect());
                                            }
                                        }
                                    }
                                    
                                    // 获取数据行
                                    let selector = Selector::parse("tr").unwrap();
                                    for (i, tr) in table.select(&selector).enumerate() {
                                        if i == 0 { continue; } // 跳过表头
                                        
                                        let selector = Selector::parse("td").unwrap();
                                        let cols: Vec<String> = tr.select(&selector).map(|td| td.text().collect::<String>().trim().to_string()).collect();
                                        
                                        if !cols.is_empty() && !cols.iter().any(|c| c.contains("未查询到数据")) {
                                            if let Some(ref header_names) = headers {
                                                if header_names.len() == cols.len() {
                                                    let mut score_data = HashMap::new();
                                                    for (header, value) in header_names.iter().zip(cols.iter()) {
                                                        score_data.insert(header.clone(), value.clone());
                                                    }
                                                    all_scores.push(Score { data: score_data });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => error!("获取成绩失败: {}", e),
                        }
                    }
                    Err(e) => error!("获取成绩失败: {}", e),
                }
            }
            
            if all_scores.is_empty() {
                return (None, username.to_string(), real_name, Some("未找到成绩数据".to_string()));
            }
            
            (Some(all_scores), username.to_string(), real_name, None)
        }
        Err(e) => (None, username.to_string(), name.unwrap_or(username).to_string(), Some(format!("网络请求错误: {}", e))),
    }
}

// 登录API处理函数
async fn login(req: web::Json<LoginRequest>) -> impl Responder {
    let username = &req.username;
    let password = &req.password;
    
    if username.is_empty() || password.is_empty() {
        let response = ApiResponse {
            success: false,
            data: None,
            message: "请提供学号和密码".to_string(),
        };
        return HttpResponse::BadRequest().json(response);
    }
    
    // 尝试登录验证（只验证，不获取成绩）
    let client = create_client();
    
    // 访问登录页面获取cookie
    match client.get(LOGIN_URL).send().await {
        Ok(_) => {},
        Err(e) => {
            let response = ApiResponse {
                success: false,
                data: None,
                message: format!("网络请求错误: {}", e),
            };
            return HttpResponse::InternalServerError().json(response);
        },
    }
    
    // 准备登录数据
    let encoded_account = encode_input(username);
    let encoded_password = encode_input(password);
    let encoded = format!("{}%%%{}", encoded_account, encoded_password);
    
    let mut form_data = HashMap::new();
    form_data.insert("encoded", encoded);
    form_data.insert("loginMethod", "LoginToXk".to_string());
    
    // 发送登录请求
    match client.post(LOGIN_API).form(&form_data).send().await {
        Ok(response) => {
            let response_url = response.url().to_string();
            if !response_url.contains("xsMain") && !response_url.contains("个人中心") {
                let response = ApiResponse {
                    success: false,
                    data: None,
                    message: "登录失败，请检查学号和密码".to_string(),
                };
                return HttpResponse::Unauthorized().json(response);
            }
            
            // 获取用户姓名
            let real_name = match get_user_name(&client).await {
                Some(name) => name,
                None => username.to_string(),
            };
            
            let login_data = LoginData {
                username: username.to_string(),
                name: real_name.clone(),
            };
            
            let response = ApiResponse {
                success: true,
                data: Some(serde_json::to_value(login_data).unwrap()),
                message: "登录成功".to_string(),
            };
            
            HttpResponse::Ok().json(response)
        }
        Err(e) => {
            let response = ApiResponse {
                success: false,
                data: None,
                message: format!("网络请求错误: {}", e),
            };
            HttpResponse::InternalServerError().json(response)
        },
    }
}

// 获取成绩API处理函数
async fn get_score(req: web::Json<ScoreRequest>) -> impl Responder {
    let username = &req.username;
    let password = &req.password;
    let name = req.name.as_deref();
    let term = req.term.as_deref();
    
    if username.is_empty() || password.is_empty() {
        let response = ApiResponse {
            success: false,
            data: None,
            message: "请提供学号和密码".to_string(),
        };
        return HttpResponse::BadRequest().json(response);
    }
    
    // 登录并获取成绩
    let (scores, user, real_name, error_msg) = login_and_get_scores(username, password, name, term).await;
    
    if let Some(error) = error_msg {
        let response = ApiResponse {
            success: false,
            data: None,
            message: error,
        };
        return HttpResponse::BadRequest().json(response);
    }
    
    let score_data = ScoreData {
        username: user,
        name: real_name,
        scores: scores.unwrap_or(Vec::new()),
    };
    
    let response = ApiResponse {
        success: true,
        data: Some(serde_json::to_value(score_data).unwrap()),
        message: "获取成绩成功".to_string(),
    };
    
    HttpResponse::Ok().json(response)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // 初始化日志
    env_logger::init();
    
    info!("启动后端服务...");
    
    // 尝试绑定端口，如果5000被占用，则尝试其他端口
    let ports_to_try = [5000, 5001, 5002, 5003, 5004];
    let mut server = None;
    
    for port in &ports_to_try {
        let addr = format!("0.0.0.0:{}", port);
        match HttpServer::new(|| {
            App::new()
                .wrap(actix_cors::Cors::default()
                    .allow_any_origin()
                    .allow_any_method()
                    .allow_any_header())
                .route("/api/login", web::post().to(login))
                .route("/api/score", web::post().to(get_score))
        }).bind(&addr) {
            Ok(http_server) => {
                info!("成功绑定到端口 {}", port);
                server = Some(http_server.run());
                break;
            }
            Err(e) => {
                info!("端口 {} 被占用，尝试下一个端口: {}", port, e);
                continue;
            }
        }
    }
    
    match server {
        Some(server) => server.await,
        None => {
            error!("无法绑定到任何端口，所有尝试的端口都被占用");
            Err(std::io::Error::new(std::io::ErrorKind::AddrInUse, "所有尝试的端口都被占用"))
        }
    }
}
