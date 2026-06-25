use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use log::{info, error};
use reqwest::{Client, ClientBuilder, cookie::Jar};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use regex::Regex;

// 常量定义
const LOGIN_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/";
const LOGIN_API: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/xk/LoginToXk";
const SCORE_QUERY_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/kscj/cjcx_list";
const SCORE_QUERY_FORM_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/kscj/cjcx_query";
const MAIN_PAGE_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/framework/xsMain.jsp";
const XSPJ_FIND_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_find.do";
const XSPJ_SAVE_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_save.do";

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

// 评教数据结构
#[derive(Debug, Deserialize)]
struct EvaluationListRequest {
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct EvaluationSubmitRequest {
    username: String,
    password: String,
    teacher: TeacherInfo,
    #[serde(rename = "do_submit")]
    do_submit: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct TeacherInfo {
    url: String,
    seq: Option<String>,
    teacher_id: Option<String>,
    teacher_name: Option<String>,
    dept: Option<String>,
    eval_type: Option<String>,
    submitted: Option<String>,
    total_score: Option<String>,
    evaluated: Option<String>,
    batch_name: Option<String>,
    batch_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct EvaluationResult {
    teacher_name: String,
    teacher_id: String,
    dept: String,
    success: bool,
    message: String,
}

#[derive(Debug, Serialize)]
struct EvaluationListData {
    teachers: Vec<serde_json::Value>,
    total: usize,
    submitted: usize,
    unsubmitted: usize,
}

#[derive(Debug, Serialize)]
struct EvaluationSubmitAllResult {
    success: bool,
    total: usize,
    results: Vec<EvaluationResult>,
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

// ==================== 教学评价 API ====================

// 通用登录辅助
async fn evaluation_login(client: &Client, username: &str, password: &str) -> bool {
    let _ = client.get(LOGIN_URL).send().await;
    let encoded_account = STANDARD.encode(username);
    let encoded_password = STANDARD.encode(password);
    let encoded = format!("{}%%%{}", encoded_account, encoded_password);

    let mut form_data = HashMap::new();
    form_data.insert("encoded", encoded);
    form_data.insert("loginMethod", "LoginToXk".to_string());

    if let Ok(resp) = client.post(LOGIN_API).form(&form_data).send().await {
        let url = resp.url().to_string();
        url.contains("xsMain") || url.contains("个人中心")
    } else {
        false
    }
}

// 获取评价批次
async fn get_evaluation_batches(client: &Client) -> Vec<serde_json::Value> {
    let mut batches = Vec::new();
    if let Ok(resp) = client.get(XSPJ_FIND_URL).send().await {
        if let Ok(body) = resp.text().await {
            let html = Html::parse_document(&body);
            let table_sel = Selector::parse("table").unwrap();
            if let Some(table) = html.select(&table_sel).next() {
                let row_sel = Selector::parse("tr").unwrap();
                let td_sel = Selector::parse("td").unwrap();
                let a_sel = Selector::parse("a").unwrap();
                for row in table.select(&row_sel).skip(1) {
                    let cells: Vec<String> = row.select(&td_sel).map(|c| c.text().collect::<String>().trim().to_string()).collect();
                    for a in row.select(&a_sel) {
                        if let Some(href) = a.attr("href") {
                            if href.contains("xspj_list.do") && cells.len() >= 8 {
                                let mut batch = serde_json::json!({
                                    "seq": cells[0],
                                    "term": cells[1],
                                    "type": cells[2],
                                    "batch_name": cells[3],
                                    "course_type": cells[4],
                                    "start_time": cells[5],
                                    "end_time": cells[6],
                                    "url": href
                                });
                                batches.push(batch);
                            }
                        }
                    }
                }
            }
        }
    }
    batches
}

// 获取教师列表（自动翻页）
async fn get_evaluation_teachers(client: &Client, list_url: &str) -> Vec<serde_json::Value> {
    let mut all = Vec::new();
    let mut page = 1;
    let re = Regex::new(r"pageIndex=\d+").unwrap();

    loop {
        if page > 20 { break; }

        let page_url = if re.is_match(list_url) {
            re.replace(list_url, format!("pageIndex={}", page)).to_string()
        } else {
            let sep = if list_url.contains('?') { "&" } else { "?" };
            format!("{}{}pageIndex={}", list_url, sep, page)
        };

        let resp = match client.get(&page_url).send().await {
            Ok(r) => r,
            Err(_) => break,
        };
        let body = match resp.text().await {
            Ok(b) => b,
            Err(_) => break,
        };

        let html = Html::parse_document(&body);
        let table_sel = Selector::parse("table").unwrap();
        let row_sel = Selector::parse("tr").unwrap();
        let td_sel = Selector::parse("td").unwrap();
        let a_sel = Selector::parse("a").unwrap();

        let mut page_teachers = Vec::new();
        let mut page_seen = std::collections::HashSet::new();

        for table in html.select(&table_sel) {
            for row in table.select(&row_sel).skip(1) {
                let cells: Vec<String> = row.select(&td_sel).map(|c| c.text().collect::<String>().trim().to_string()).collect();
                for a in row.select(&a_sel) {
                    if let Some(href) = a.attr("href") {
                        let text = a.text().collect::<String>().trim().to_string();
                        if (href.contains("xspj_edit.do") || text == "评价" || text == "查看") && cells.len() >= 8 {
                            let tid = &cells[1];
                            if tid == "教师编号" || page_seen.contains(tid) { continue; }
                            page_seen.insert(tid.clone());

                            let t = serde_json::json!({
                                "seq": cells[0],
                                "teacher_id": tid,
                                "teacher_name": cells[2],
                                "dept": cells[3],
                                "eval_type": cells[4],
                                "total_score": cells[5],
                                "evaluated": cells[6],
                                "submitted": cells[7],
                                "url": href
                            });
                            page_teachers.push(t);
                        }
                    }
                }
            }
        }

        if page_teachers.is_empty() {
            break;
        }
        // 检查回环
        if !all.is_empty() {
            let first_name = page_teachers[0]["teacher_name"].as_str().unwrap_or("").to_string();
            if all.iter().any(|t: &serde_json::Value| t["teacher_name"].as_str().unwrap_or("") == first_name) {
                break;
            }
        }

        all.extend(page_teachers);
        page += 1;
    }

    all
}

async fn evaluation_list(req: web::Json<EvaluationListRequest>) -> impl Responder {
    let client = create_client();

    if !evaluation_login(&client, &req.username, &req.password).await {
        return HttpResponse::Unauthorized().json(ApiResponse {
            success: false,
            data: None,
            message: "登录失败，请检查学号和密码".to_string(),
        });
    }

    let batches = get_evaluation_batches(&client).await;
    let mut all_teachers: Vec<serde_json::Value> = Vec::new();

    for batch in &batches {
        let url = batch["url"].as_str().unwrap_or("");
        let teachers = get_evaluation_teachers(&client, url).await;
        for t in teachers {
            all_teachers.push(t);
        }
    }

    let total = all_teachers.len();
    let submitted = all_teachers.iter().filter(|t| t["submitted"].as_str().unwrap_or("") == "是").count();
    let unsubmitted = total - submitted;

    let data = EvaluationListData {
        teachers: all_teachers,
        total,
        submitted,
        unsubmitted,
    };

    HttpResponse::Ok().json(ApiResponse {
        success: true,
        data: Some(serde_json::to_value(data).unwrap()),
        message: "获取成功".to_string(),
    })
}

async fn evaluation_submit(req: web::Json<EvaluationSubmitRequest>) -> impl Responder {
    let client = create_client();

    if !evaluation_login(&client, &req.username, &req.password).await {
        return HttpResponse::Unauthorized().json(ApiResponse {
            success: false,
            data: None,
            message: "登录失败".to_string(),
        });
    }

    let url = &req.teacher.url;
    let full_url = if url.starts_with("http") { url.clone() } else { format!("https://jiaowu3.nsmc.edu.cn{}", url) };

    let resp = match client.get(&full_url).send().await {
        Ok(r) => r,
        Err(e) => return HttpResponse::InternalServerError().json(ApiResponse {
            success: false, data: None, message: format!("获取表单失败: {}", e),
        }),
    };
    let body = match resp.text().await {
        Ok(b) => b,
        Err(e) => return HttpResponse::InternalServerError().json(ApiResponse {
            success: false, data: None, message: format!("读取表单失败: {}", e),
        }),
    };

    let html = Html::parse_document(&body);
    let input_sel = Selector::parse("input[type='hidden']").unwrap();

    let mut form_data: Vec<(String, String)> = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    for input in html.select(&input_sel) {
        if let (Some(name), Some(value)) = (input.attr("name"), input.attr("value")) {
            let name = name.to_string();
            let value = value.to_string();
            if seen_names.contains(&name) {
                form_data.push((name, value));
            } else {
                seen_names.insert(name.clone());
                form_data.push((name, value));
            }
        }
    }

    // 设置 issubmit
    let do_submit = req.do_submit.unwrap_or(false);
    form_data.retain(|(k, _)| k != "issubmit");
    form_data.push(("issubmit".to_string(), if do_submit { "1".to_string() } else { "0".to_string() }));

    // 解析题目并按显示顺序选答案
    let table_sel = Selector::parse("table#table1").unwrap();
    let row_sel = Selector::parse("tr").unwrap();
    let td_sel = Selector::parse("td").unwrap();
    let radio_sel = Selector::parse("input[type='radio']").unwrap();

    let mut questions: Vec<(String, String, HashMap<String, String>)> = Vec::new(); // (radio_name, title, options)

    let target_table = html.select(&table_sel).next();

    if let Some(table) = target_table {
        for row in table.select(&row_sel) {
            let tds: Vec<_> = row.select(&td_sel).collect();
            if tds.is_empty() { continue; }

            let pj06xh = tds[0].select(&Selector::parse("input[name='pj06xh']").unwrap()).next();
            if pj06xh.is_none() { continue; }

            let seq = pj06xh.unwrap().attr("value").unwrap_or("");
            let text = tds[0].text().collect::<String>().trim().to_string();
            let text = text.replace(seq, "").trim().to_string();

            let opt_td = tds.iter().find(|td| td.attr("name") == Some("zbtd"));
            let mut options = HashMap::new();
            let mut radio_name = format!("pj0601id_{}", seq);

            if let Some(otd) = opt_td {
                if let Some(first_radio) = otd.select(&radio_sel).next() {
                    if let Some(rn) = first_radio.attr("name") {
                        radio_name = rn.to_string();
                    }
                }
                for radio in otd.select(&radio_sel) {
                    if let (Some(title), Some(value)) = (radio.attr("title"), radio.attr("value")) {
                        options.insert(title.to_string(), value.to_string());
                    }
                }
            }

            questions.push((radio_name, text, options));
        }
    }

    if questions.is_empty() {
        return HttpResponse::BadRequest().json(ApiResponse {
            success: false, data: None, message: "未解析到评价题目".to_string(),
        });
    }

    let last_idx = questions.len() - 1;
    for (i, (radio_name, _text, options)) in questions.iter().enumerate() {
        if i == last_idx {
            if let Some(val) = options.get("满意") {
                form_data.push((radio_name.clone(), val.clone()));
            } else {
                return HttpResponse::BadRequest().json(ApiResponse {
                    success: false, data: None, message: "缺少'满意'选项".to_string(),
                });
            }
        } else {
            if let Some(val) = options.get("非常满意") {
                form_data.push((radio_name.clone(), val.clone()));
            } else {
                return HttpResponse::BadRequest().json(ApiResponse {
                    success: false, data: None, message: "缺少'非常满意'选项".to_string(),
                });
            }
        }
    }
    form_data.push(("jynr".to_string(), "".to_string()));

    let save_resp = match client.post(XSPJ_SAVE_URL).form(&form_data).send().await {
        Ok(r) => r,
        Err(e) => return HttpResponse::InternalServerError().json(ApiResponse {
            success: false, data: None, message: format!("提交失败: {}", e),
        }),
    };
    let save_text = match save_resp.text().await {
        Ok(t) => t,
        Err(_) => "".to_string(),
    };

    let success = save_text.contains("保存成功") || save_text.contains("提交成功") || save_text.contains("成功");
    let msg = if success { "提交成功".to_string() } else { format!("失败: {}", &save_text[..save_text.len().min(100)]) };

    HttpResponse::Ok().json(ApiResponse {
        success,
        data: None,
        message: msg,
    })
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
                .route("/api/evaluation/list", web::post().to(evaluation_list))
                .route("/api/evaluation/submit", web::post().to(evaluation_submit))
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
