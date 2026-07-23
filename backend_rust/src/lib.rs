use base64::{Engine as _, engine::general_purpose::STANDARD};
use log::{info, error};
use reqwest::{Client, ClientBuilder, cookie::Jar};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use regex::Regex;
use once_cell::sync::Lazy;
use num_bigint::BigUint;
use num_traits::FromPrimitive;

pub static XG2_SESSION: Lazy<Mutex<Option<(String, Client)>>> = Lazy::new(|| Mutex::new(None));

// ==================== jiaowu3 常量 ====================
pub const LOGIN_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/";
pub const LOGIN_API: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/xk/LoginToXk";
pub const SCORE_QUERY_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/kscj/cjcx_list";
pub const SCORE_QUERY_FORM_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/kscj/cjcx_query";
pub const MAIN_PAGE_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/framework/xsMain.jsp";
pub const XSPJ_FIND_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_find.do";
pub const XSPJ_SAVE_URL: &str = "https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_save.do";

// ==================== xg2 常量 ====================
pub const XG2_BASE: &str = "https://xg2.nsmc.edu.cn/Sys";

// ==================== 数据结构 ====================
#[derive(Debug, Deserialize)]
pub struct LoginRequest { pub username: String, pub password: String }
#[derive(Debug, Deserialize)]
pub struct ScoreRequest { pub username: String, pub password: String, pub name: Option<String>, pub term: Option<String> }
#[derive(Debug, Serialize)]
pub struct Term { pub value: String, pub text: String }
#[derive(Debug, Serialize)]
pub struct Score { #[serde(flatten)] pub data: HashMap<String, String> }
#[derive(Debug, Serialize)]
pub struct ApiResponse { pub success: bool, pub data: Option<serde_json::Value>, pub message: String }
#[derive(Debug, Serialize)]
pub struct LoginData { pub username: String, pub name: String }
#[derive(Debug, Serialize)]
pub struct ScoreData { pub username: String, pub name: String, pub scores: Vec<Score> }

#[derive(Debug, Deserialize)]
pub struct EvaluationListRequest { pub username: String, pub password: String }
#[derive(Debug, Deserialize)]
pub struct EvaluationSubmitRequest { pub username: String, pub password: String, pub teacher: TeacherInfo, pub do_submit: Option<bool> }
#[derive(Debug, Deserialize)]
pub struct TeacherInfo { pub url: String, pub seq: Option<String>, pub teacher_id: Option<String>, pub teacher_name: Option<String>, pub dept: Option<String>, pub eval_type: Option<String>, pub submitted: Option<String>, pub total_score: Option<String>, pub evaluated: Option<String>, pub batch_name: Option<String>, pub batch_url: Option<String> }
#[derive(Debug, Serialize)]
pub struct EvaluationResult { pub teacher_name: String, pub teacher_id: String, pub dept: String, pub success: bool, pub message: String }
#[derive(Debug, Serialize)]
pub struct EvaluationListData { pub teachers: Vec<serde_json::Value>, pub total: usize, pub submitted: usize, pub unsubmitted: usize }
#[derive(Debug, Serialize)]
pub struct EvaluationSubmitAllResult { pub success: bool, pub total: usize, pub results: Vec<EvaluationResult> }

// xg2
#[derive(Debug, Deserialize)]
pub struct Xg2LoginRequest { pub username: String, pub password: String }
#[derive(Debug, Deserialize)]
pub struct Xg2EditFormRequest { pub username: String }
#[derive(Debug, Deserialize)]
pub struct Xg2SubmitRequest { pub username: String, pub form_fields: HashMap<String, String> }

#[derive(Debug, Serialize)]
pub struct Xg2Record {
    pub id: String,
    pub student_id: String,
    pub student_name: String,
    pub holiday: String,
    pub time_range: String,
    pub leave_type: String,
    pub destination: String,
}

#[derive(Debug, Serialize)]
pub struct Xg2LoginData {
    pub username: String,
    pub holiday_name: String,
    pub status: String,
    pub begin_date: String,
    pub end_date: String,
    pub leave_begin_date: String,
    pub leave_end_date: String,
    pub memo: String,
    pub records: Vec<Xg2Record>,
    pub record_count: usize,
}

#[derive(Debug, Serialize)]
pub struct Xg2EditFormData {
    pub student_name: String,
    pub holiday_name: String,
    pub begin_date: String,
    pub end_date: String,
    pub leave_begin_date: String,
    pub leave_end_date: String,
    pub memo: String,
}

// ==================== 辅助函数 ====================
pub fn create_client() -> Client {
    let jar = Jar::default();
    ClientBuilder::new()
        .cookie_provider(Arc::new(jar))
        .danger_accept_invalid_certs(true)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0")
        .build().unwrap()
}

pub fn encode_input(input: &str) -> String { STANDARD.encode(input) }

pub async fn get_available_terms(client: &Client) -> Vec<Term> {
    let mut terms = Vec::new();
    match client.get(SCORE_QUERY_FORM_URL).send().await {
        Ok(response) => {
            match response.text().await {
                Ok(body) => {
                    let html = Html::parse_document(&body);
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
                                if !value.is_empty() { terms.push(Term { value: value.to_string(), text }); }
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

pub async fn get_user_name(client: &Client) -> Option<String> {
    match client.get(MAIN_PAGE_URL).send().await {
        Ok(response) => {
            match response.text().await {
                Ok(body) => {
                    let html = Html::parse_document(&body);
                    let selector = Selector::parse(".edu-user").unwrap();
                    if let Some(user_info) = html.select(&selector).next() {
                        let selector = Selector::parse(".userInfo").unwrap();
                        if let Some(div) = user_info.select(&selector).next() {
                            let selector = Selector::parse("p").unwrap();
                            if let Some(p) = div.select(&selector).next() {
                                let name = p.text().collect::<String>().trim().to_string();
                                if !name.is_empty() { return Some(name); }
                            }
                        }
                        let selector = Selector::parse("p, span, div").unwrap();
                        for tag in user_info.select(&selector) {
                            let text = tag.text().collect::<String>().trim().to_string();
                            if !text.is_empty() {
                                let clean = text.replace("学生", "").replace("老师", "").replace("教职工", "").trim().to_string();
                                if clean.len() > 1 && clean.len() < 10 && !clean.chars().all(|c| c.is_ascii_digit()) { return Some(clean); }
                            }
                        }
                    }
                    let selector = Selector::parse("p").unwrap();
                    for p in html.select(&selector) {
                        let text = p.text().collect::<String>().trim().to_string();
                        if text.len() > 1 && text.len() < 10 && !text.chars().all(|c| c.is_ascii_digit()) &&
                           !["课表","查询","中心","申请","报名","计划","通知","公告","留言"].iter().any(|k| text.contains(k)) { return Some(text); }
                    }
                }
                Err(e) => error!("获取姓名失败: {}", e),
            }
        }
        Err(e) => error!("获取姓名失败: {}", e),
    }
    None
}

pub async fn login_and_get_scores(username: &str, password: &str, name: Option<&str>, term_filter: Option<&str>) -> (Option<Vec<Score>>, String, String, Option<String>) {
    let client = create_client();
    if let Err(e) = client.get(LOGIN_URL).send().await { return (None, username.to_string(), name.unwrap_or(username).to_string(), Some(format!("网络错误: {}", e))); }
    let encoded = format!("{}%%%{}", encode_input(username), encode_input(password));
    let mut fd = HashMap::new(); fd.insert("encoded", encoded); fd.insert("loginMethod", "LoginToXk".to_string());
    match client.post(LOGIN_API).form(&fd).send().await {
        Ok(response) => {
            let url = response.url().to_string();
            if !url.contains("xsMain") && !url.contains("个人中心") { return (None, username.to_string(), name.unwrap_or(username).to_string(), Some("登录失败".to_string())); }
            let real_name = match name { Some(n) => n.to_string(), None => get_user_name(&client).await.unwrap_or_else(|| username.to_string()) };
            let available = get_available_terms(&client).await;
            let terms: Vec<String> = if let Some(t) = term_filter { vec![t.to_string()] } else { available.into_iter().map(|t| t.value).collect() };
            let mut all = Vec::new(); let mut headers: Option<Vec<String>> = None;
            for tv in terms {
                let url = if tv.is_empty() { SCORE_QUERY_URL.to_string() } else { format!("{}?kksj={}", SCORE_QUERY_URL, tv) };
                if let Ok(resp) = client.get(&url).send().await {
                    if let Ok(body) = resp.text().await {
                        let html = Html::parse_document(&body);
                        let sel = Selector::parse("table#dataList").unwrap();
                        if let Some(table) = html.select(&sel).next() {
                            if headers.is_none() {
                                let th_sel = Selector::parse("th, td").unwrap();
                                let tr_sel = Selector::parse("tr").unwrap();
                                if let Some(thead) = table.select(&Selector::parse("thead").unwrap()).next() {
                                    if let Some(row) = thead.select(&tr_sel).next() { headers = Some(row.select(&th_sel).map(|c| c.text().collect::<String>().trim().to_string()).collect()); }
                                } else if let Some(row) = table.select(&tr_sel).next() { headers = Some(row.select(&th_sel).map(|c| c.text().collect::<String>().trim().to_string()).collect()); }
                            }
                            let td_sel = Selector::parse("td").unwrap();
                            for (i, tr) in table.select(&Selector::parse("tr").unwrap()).enumerate() {
                                if i == 0 { continue; }
                                let cols: Vec<String> = tr.select(&td_sel).map(|c| c.text().collect::<String>().trim().to_string()).collect();
                                if !cols.is_empty() && !cols.iter().any(|c| c.contains("未查询到数据")) {
                                    let mut m = HashMap::new();
                                    for (k, v) in headers.as_ref().unwrap_or(&vec![]).iter().zip(cols.iter()) { m.insert(k.clone(), v.clone()); }
                                    all.push(Score { data: m });
                                }
                            }
                        }
                    }
                }
            }
            if all.is_empty() { return (None, username.to_string(), real_name, Some("未找到成绩数据".to_string())); }
            (Some(all), username.to_string(), real_name, None)
        }
        Err(e) => (None, username.to_string(), name.unwrap_or(username).to_string(), Some(format!("网络错误: {}", e))),
    }
}

pub async fn evaluation_login(client: &Client, username: &str, password: &str) -> bool {
    let _ = client.get(LOGIN_URL).send().await;
    let encoded = format!("{}%%%{}", STANDARD.encode(username), STANDARD.encode(password));
    let mut fd = HashMap::new(); fd.insert("encoded", encoded); fd.insert("loginMethod", "LoginToXk".to_string());
    matches!(client.post(LOGIN_API).form(&fd).send().await, Ok(resp) if resp.url().to_string().contains("xsMain"))
}

pub async fn get_evaluation_batches(client: &Client) -> Vec<serde_json::Value> {
    let mut batches = Vec::new();
    if let Ok(resp) = client.get(XSPJ_FIND_URL).send().await {
        if let Ok(body) = resp.text().await {
            let html = Html::parse_document(&body);
            let table_sel = Selector::parse("table").unwrap();
            if let Some(table) = html.select(&table_sel).next() {
                let td_sel = Selector::parse("td").unwrap();
                let a_sel = Selector::parse("a").unwrap();
                for row in table.select(&Selector::parse("tr").unwrap()).skip(1) {
                    let cells: Vec<String> = row.select(&td_sel).map(|c| c.text().collect::<String>().trim().to_string()).collect();
                    for a in row.select(&a_sel) {
                        if let Some(href) = a.attr("href") {
                            if href.contains("xspj_list.do") && cells.len() >= 8 {
                                batches.push(serde_json::json!({"seq": cells[0], "term": cells[1], "type": cells[2], "batch_name": cells[3], "course_type": cells[4], "start_time": cells[5], "end_time": cells[6], "url": href}));
                            }
                        }
                    }
                }
            }
        }
    }
    batches
}

pub async fn get_evaluation_teachers(client: &Client, list_url: &str) -> Vec<serde_json::Value> {
    let mut all: Vec<serde_json::Value> = Vec::new(); let re = Regex::new(r"pageIndex=\d+").unwrap();
    for page in 1..=20 {
        let page_url = if re.is_match(list_url) { re.replace(list_url, format!("pageIndex={}", page)).to_string() } else { let s = if list_url.contains('?') { "&" } else { "?" }; format!("{}{}pageIndex={}", list_url, s, page) };
        let body = match client.get(&page_url).send().await { Ok(r) => match r.text().await { Ok(t) => t, Err(_) => break }, Err(_) => break };
        let html = Html::parse_document(&body);
        let td_sel = Selector::parse("td").unwrap();
        let a_sel = Selector::parse("a").unwrap();
        let mut pt = Vec::new();
        for table in html.select(&Selector::parse("table").unwrap()) {
            for row in table.select(&Selector::parse("tr").unwrap()).skip(1) {
                let cells: Vec<String> = row.select(&td_sel).map(|c| c.text().collect::<String>().trim().to_string()).collect();
                for a in row.select(&a_sel) {
                    if let Some(href) = a.attr("href") {
                        let text = a.text().collect::<String>().trim().to_string();
                        if (href.contains("xspj_edit.do") || text == "评价" || text == "查看") && cells.len() >= 8 && cells[1] != "教师编号" {
                            pt.push(serde_json::json!({"seq": cells[0], "teacher_id": cells[1], "teacher_name": cells[2], "dept": cells[3], "eval_type": cells[4], "total_score": cells[5], "evaluated": cells[6], "submitted": cells[7], "url": href}));
                        }
                    }
                }
            }
        }
        if pt.is_empty() { break; }
        if !all.is_empty() && pt[0]["teacher_name"].as_str() == all[0]["teacher_name"].as_str() { break; }
        all.extend(pt);
    }
    all
}

// ==================== xg2 学工系统 ====================

/// xg2 验证码字符集
const CAPTCHA_CHARS: &[u8] = b"23456789bcefghjkmnpqrstuvwxyzBCEFGHJKMNPQRSTUVWXYZ";

fn generate_captcha() -> String {
    (0..4).map(|_| {
        let idx = rand::random::<usize>() % CAPTCHA_CHARS.len();
        CAPTCHA_CHARS[idx] as char
    }).collect()
}

/// PKCS#1 v1.5 填充 + RSA 加密（与 xg2 JS 实现一致）
pub fn rsa_encrypt(username: &str, password: &str, modulus_hex: &str) -> String {
    use num_bigint::BigUint;
    use num_traits::FromPrimitive;

    let raw = format!("{}\\{}", STANDARD.encode(username), STANDARD.encode(password));
    let rb = raw.as_bytes();
    let ds = 128usize;
    let ml = rb.len();
    let ps = std::cmp::max(8, ds - 3 - ml);
    let mut b = vec![0u8; ds];
    for x in 0..ml { b[x] = rb[ml - 1 - x]; }
    b[ml] = 0;
    for x in 0..ps { b[ml + 1 + x] = rand::random::<u8>().max(1); }
    b[ds - 2] = 2;
    b[ds - 1] = 0;

    let m_int = BigUint::from_bytes_le(&b);
    let n = BigUint::parse_bytes(modulus_hex.as_bytes(), 16).unwrap();
    let e = BigUint::from_u64(0x010001).unwrap();
    let c = m_int.modpow(&e, &n);
    let hex = c.to_str_radix(16);
    format!("{:0>256}", hex)
}

/// 从 HTML 提取 ASP.NET 隐藏字段
pub fn aspnet_fields(html: &str) -> HashMap<String, String> {
    let mut f = HashMap::new();
    for name in &["__VIEWSTATE", "__EVENTVALIDATION", "__VIEWSTATEGENERATOR"] {
        let re_str = format!(r#"(?:name|id)="{}"[^>]*value="([^"]*)""#, regex::escape(name));
        if let Some(caps) = Regex::new(&re_str).unwrap().captures(html) {
            f.insert(name.to_string(), caps[1].to_string());
        }
    }
    f
}

/// 提取 <span id="...">text</span>
pub fn span_text(html: &str, sid: &str) -> String {
    let re_str = format!(r#"<span[^>]*id="{}"[^>]*>([^<]*)</span>"#, regex::escape(sid));
    Regex::new(&re_str).unwrap().captures(html).map(|c| c[1].trim().to_string()).unwrap_or_default()
}

/// GB2312 编码表单 body（空格用 +）
pub fn gbk_form(data: &HashMap<String, String>) -> Vec<u8> {
    use encoding_rs::GBK;
    let mut parts = Vec::new();
    for (k, v) in data {
        let (k_bytes, _, _) = GBK.encode(k);
        let (v_bytes, _, _) = GBK.encode(v);
        let k_q = urlencoding_plus(k_bytes.as_ref());
        let v_q = urlencoding_plus(v_bytes.as_ref());
        parts.push(format!("{}={}", k_q, v_q));
    }
    parts.join("&").into_bytes()
}

/// Urlencode + 空格转 +
fn urlencoding_plus(input: &[u8]) -> String {
    let mut out = String::new();
    for &b in input {
        match b {
            b' ' => out.push('+'),
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// 登录 xg2 + 获取列表页
pub async fn xg2_login_handler_inner(client: &Client, username: &str, password: &str) -> Result<Xg2LoginData, String> {
    let html = client.get(&format!("{}/UserLogin.aspx", XG2_BASE))
        .header("Referer", "https://xg2.nsmc.edu.cn/")
        .send().await.map_err(|e| format!("无法访问 xg2: {}", e))?
        .text().await.map_err(|e| format!("无法访问 xg2: {}", e))?;

    let re = Regex::new(r#"new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)"#).unwrap();
    let caps = re.captures(&html).ok_or("无法获取 RSA 公钥".to_string())?;
    let modulus = caps[3].to_string();
    let fields = aspnet_fields(&html);

    let encrypted = rsa_encrypt(username, password, &modulus);
    let captcha = generate_captcha();

    let mut fd = HashMap::new();
    fd.insert("__LASTFOCUS".to_string(), "".to_string());
    fd.insert("__EVENTTARGET".to_string(), "".to_string());
    fd.insert("__EVENTARGUMENT".to_string(), "".to_string());
    fd.insert("__VIEWSTATE".to_string(), fields.get("__VIEWSTATE").cloned().unwrap_or_default());
    fd.insert("__VIEWSTATEGENERATOR".to_string(), fields.get("__VIEWSTATEGENERATOR").cloned().unwrap_or_default());
    fd.insert("__VIEWSTATEENCRYPTED".to_string(), "".to_string());
    fd.insert("__EVENTVALIDATION".to_string(), fields.get("__EVENTVALIDATION").cloned().unwrap_or_default());
    fd.insert("UserName".to_string(), "******".to_string());
    fd.insert("posx".to_string(), encrypted);
    fd.insert("codeInput".to_string(), captcha);
    fd.insert("queryBtn".to_string(), "登          录".to_string());

    let body = gbk_form(&fd);
    let _ = client.post(&format!("{}/UserLogin.aspx", XG2_BASE))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Referer", "https://xg2.nsmc.edu.cn/")
        .header("Origin", "https://xg2.nsmc.edu.cn")
        .body(body)
        .send().await.map_err(|e| format!("登录请求失败: {}", e))?;

    let list_html = client
        .get(&format!("{}/SystemForm/Leave/StuLeave.aspx", XG2_BASE))
        .send().await.map_err(|_| "xg2 登录失败".to_string())?
        .text().await.map_err(|_| "xg2 登录失败".to_string())?;

    let list_fields = aspnet_fields(&list_html);
    let records = parse_leave_records(&list_html);

    Ok(Xg2LoginData {
        username: username.to_string(),
        holiday_name: span_text(&list_html, "HolidayName"),
        status: span_text(&list_html, "Status"),
        begin_date: span_text(&list_html, "BeginDate"),
        end_date: span_text(&list_html, "EndDate"),
        leave_begin_date: span_text(&list_html, "LeaveBeginDate"),
        leave_end_date: span_text(&list_html, "LeaveEndDate"),
        memo: span_text(&list_html, "Memo"),
        record_count: records.len(),
        records,
    })
}

pub fn parse_leave_records(html: &str) -> Vec<Xg2Record> {
    let mut records = Vec::new();
    let re = Regex::new(r#"<tr[^>]*>.*?</tr>"#).unwrap();
    let td_re = Regex::new(r#"<td[^>]*>(.*?)</td>"#).unwrap();
    let id_re = Regex::new(r#"Id=(\d+)"#).unwrap();
    let strip = Regex::new(r#"<[^>]+>"#).unwrap();

    let table_re = Regex::new(r#"<table[^>]*id="GridView1"[^>]*>.*?</table>"#).unwrap();
    if let Some(table_match) = table_re.find(html) {
        let table_html = table_match.as_str();
        for (i, tr_match) in re.find_iter(table_html).enumerate() {
            if i == 0 { continue; }
            let cells: Vec<String> = td_re.captures_iter(tr_match.as_str())
                .map(|c| strip.replace_all(&c[1], "").trim().to_string())
                .collect();
            if cells.len() >= 6 {
                let id = id_re.captures(&td_re.captures(tr_match.as_str()).map(|c| c[1].to_string()).unwrap_or_default())
                    .map(|c| c[1].to_string()).unwrap_or_default();
                records.push(Xg2Record {
                    id,
                    student_id: cells[0].clone(),
                    student_name: cells[1].clone(),
                    holiday: cells[2].clone(),
                    time_range: cells[3].clone(),
                    leave_type: cells[4].clone(),
                    destination: cells[5].clone(),
                });
            }
        }
    }
    records
}

/// 获取 xg2 编辑页信息
pub async fn xg2_get_edit_form(client: &Client) -> Result<Xg2EditFormData, String> {
    let edit_html = client.get(&format!("{}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add", XG2_BASE))
        .send().await.map_err(|e| format!("获取编辑页失败: {}", e))?
        .text().await.map_err(|e| format!("获取编辑页失败: {}", e))?;

    Ok(Xg2EditFormData {
        student_name: span_text(&edit_html, "Leave1_UserName"),
        holiday_name: span_text(&edit_html, "LeaveNoHomeConfig1_HolidayName"),
        begin_date: span_text(&edit_html, "LeaveNoHomeConfig1_BeginDate"),
        end_date: span_text(&edit_html, "LeaveNoHomeConfig1_EndDate"),
        leave_begin_date: span_text(&edit_html, "LeaveNoHomeConfig1_LeaveBeginDate"),
        leave_end_date: span_text(&edit_html, "LeaveNoHomeConfig1_LeaveEndDate"),
        memo: span_text(&edit_html, "LeaveNoHomeConfig1_Memo"),
    })
}

/// 提交去向登记
pub async fn xg2_submit(client: &Client, form_fields: &HashMap<String, String>) -> Result<String, String> {
    let edit_html = client.get(&format!("{}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add", XG2_BASE))
        .send().await.map_err(|e| format!("获取编辑页失败: {}", e))?
        .text().await.map_err(|e| format!("获取编辑页失败: {}", e))?;

    let f = aspnet_fields(&edit_html);

    let mut data = HashMap::new();
    data.insert("__VIEWSTATE".to_string(), f.get("__VIEWSTATE").cloned().unwrap_or_default());
    data.insert("__VIEWSTATEGENERATOR".to_string(), f.get("__VIEWSTATEGENERATOR").cloned().unwrap_or_default());
    data.insert("__VIEWSTATEENCRYPTED".to_string(), "".to_string());
    data.insert("__EVENTVALIDATION".to_string(), f.get("__EVENTVALIDATION").cloned().unwrap_or_default());
    data.insert("__EVENTTARGET".to_string(), "".to_string());
    data.insert("__EVENTARGUMENT".to_string(), "".to_string());
    data.insert("__SCROLLPOSITIONX".to_string(), "0".to_string());
    data.insert("__SCROLLPOSITIONY".to_string(), "0".to_string());
    for (k, v) in form_fields { data.insert(k.clone(), v.clone()); }

    let body = gbk_form(&data);
    let resp = client.post(&format!("{}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add", XG2_BASE))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send().await.map_err(|e| format!("提交失败: {}", e))?
        .text().await.map_err(|e| format!("提交失败: {}", e))?;

    let ok = resp.contains("保存成功") || resp.contains("提交成功");
    let msg = Regex::new(r#"alert\(['"]([^'"]+)['"]\)"#).unwrap()
        .captures(&resp).map(|c| c[1].to_string()).unwrap_or_else(|| if ok { "提交成功".to_string() } else { "提交失败".to_string() });
    Ok(msg)
}
