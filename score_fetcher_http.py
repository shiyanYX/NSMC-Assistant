import requests
import base64
import pandas as pd
from bs4 import BeautifulSoup
import re
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


LOGIN_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/'
LOGIN_API = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xk/LoginToXk'
SCORE_QUERY_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/kscj/cjcx_list'
SCORE_QUERY_FORM_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/kscj/cjcx_query'
MAIN_PAGE_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/framework/xsMain.jsp'
# 评教
XSPJ_FIND_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_find.do'
XSPJ_SAVE_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_save.do'


def get_available_terms(session):
    """获取所有可用的学期选项"""
    try:
        response = session.get(SCORE_QUERY_FORM_URL, verify=False, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 查找开课时间下拉框
        term_select = soup.find('select', id='kksja')
        if not term_select:
            term_select = soup.find('select', {'name': 'kksja'})
        
        terms = []
        if term_select:
            for option in term_select.find_all('option'):
                value = option.get('value', '')
                text = option.get_text(strip=True)
                if value and value != '':  # 排除"全部学期"空值选项
                    terms.append({'value': value, 'text': text})
        
        return terms
    except Exception as e:
        print(f"获取学期列表失败: {e}")
        return []


def encode_inp(input_str):
    return base64.b64encode(input_str.encode('utf-8')).decode('utf-8')


def get_user_name(session):
    """从教务系统获取用户姓名"""
    try:
        # 访问个人主页
        main_response = session.get(MAIN_PAGE_URL, verify=False, timeout=10)
        print(f"个人主页响应状态码: {main_response.status_code}")
        
        # 保存页面内容到文件，以便分析
        with open('main_page.html', 'w', encoding='utf-8') as f:
            f.write(main_response.text)
        print("个人主页内容已保存到 main_page.html 文件")
        
        soup_main = BeautifulSoup(main_response.text, 'html.parser')
        
        # 尝试从页面中查找姓名
        # 方法1: 尝试从欢迎信息中获取
        print("\n尝试方法1: 从欢迎信息中获取姓名")
        welcome_text = soup_main.find(string=re.compile(r'欢迎|你好|Hello'))
        if welcome_text:
            print(f"找到欢迎信息: {welcome_text}")
            match = re.search(r'[欢迎你好Hello]\s*([^,，\s]+)', welcome_text)
            if match:
                name = match.group(1)
                print(f"从欢迎信息中提取姓名: {name}")
                return name
        
        # 方法2: 尝试从用户信息区域获取
        print("\n尝试方法2: 从用户信息区域获取姓名")
        user_info = soup_main.select_one('.edu-user')
        if user_info:
            print("找到用户信息区域")
            # 打印用户信息区域的HTML
            print(f"用户信息区域HTML: {user_info.prettify()}")
            # 尝试不同的选择器
            # 尝试直接从userInfo中获取姓名
            user_info_div = user_info.select_one('.userInfo')
            if user_info_div:
                name_p = user_info_div.find('p')
                if name_p:
                    name = name_p.get_text(strip=True)
                    print(f"从userInfo中提取姓名: {name}")
                    return name
            
            # 备选方法：从所有标签中提取
            name_tags = user_info.find_all(['p', 'span', 'div'])
            for tag in name_tags:
                text = tag.get_text(strip=True)
                if text:
                    print(f"找到文本: {text}")
                    # 尝试判断是否为姓名，过滤掉身份信息
                    clean_text = text.replace('学生', '').replace('老师', '').replace('教职工', '').strip()
                    if len(clean_text) > 1 and len(clean_text) < 10 and not clean_text.isdigit():
                        print(f"可能的姓名: {clean_text}")
                        return clean_text
        
        # 方法3: 尝试从页面中的所有p标签获取
        print("\n尝试方法3: 从所有p标签获取姓名")
        all_p = soup_main.find_all('p')
        for p in all_p:
            text = p.get_text(strip=True)
            if text:
                print(f"p标签文本: {text}")
                # 尝试判断是否为姓名，过滤掉明显不是姓名的文本
                if (len(text) > 1 and len(text) < 10 and not text.isdigit() and 
                    '课表' not in text and '查询' not in text and '中心' not in text and 
                    '申请' not in text and '报名' not in text and '计划' not in text and
                    '通知' not in text and '公告' not in text and '留言' not in text):
                    print(f"可能的姓名: {text}")
                    return text
        
        # 方法4: 尝试从页面标题获取
        print("\n尝试方法4: 从页面标题获取姓名")
        title = soup_main.find('title')
        if title:
            print(f"页面标题: {title.get_text()}")
        
        # 方法5: 尝试从脚本标签获取
        print("\n尝试方法5: 从脚本标签获取姓名")
        scripts = soup_main.find_all('script')
        for script in scripts:
            script_text = script.get_text()
            if 'user' in script_text.lower() and 'name' in script_text.lower():
                print("找到包含用户信息的脚本")
                # 尝试提取姓名
                match = re.search(r'name[\s*]=[\s*]["\']([^"\']+)["\']', script_text)
                if match:
                    name = match.group(1)
                    print(f"从脚本中提取姓名: {name}")
                    return name
        
        print("\n所有方法都尝试失败，无法获取姓名")
        return None
    except Exception as e:
        print(f"获取姓名时出错: {e}")
        return None


def http_login_and_get_scores(username, password, name=None, term_filter=None):
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    
    try:
        session.get(LOGIN_URL, verify=False, timeout=10)
        
        encoded_account = encode_inp(username)
        encoded_password = encode_inp(password)
        encoded = f"{encoded_account}%%%{encoded_password}"
        
        login_data = {
            'encoded': encoded,
            'loginMethod': 'LoginToXk'
        }
        
        login_response = session.post(LOGIN_API, data=login_data, verify=False, allow_redirects=True, timeout=10)
        
        print(f"登录响应状态码: {login_response.status_code}")
        print(f"登录响应URL: {login_response.url}")
        
        if 'xsMain' not in login_response.text and '个人中心' not in login_response.text:
            return None, username, name, '登录失败，可能账号或密码错误'
        
        real_name = name
        
        if not real_name:
            print("\n开始尝试获取姓名...")
            real_name = get_user_name(session)
            print(f"获取到的姓名: {real_name}")
        
        if not real_name:
            real_name = username
            print(f"使用学号作为姓名: {real_name}")
        
        # 获取可用学期列表
        available_terms = get_available_terms(session)
        if available_terms:
            print(f"\n检测到 {len(available_terms)} 个学期:")
            for i, term in enumerate(available_terms[:5], 1):  # 只显示前5个
                print(f"  {i}. {term['text']}")
            if len(available_terms) > 5:
                print(f"  ... 还有 {len(available_terms) - 5} 个学期")
        
        # 构建查询参数
        all_scores = []  # 存储所有学期的成绩
        headers = None
        
        if term_filter:
            # 如果指定了学期，只查询该学期
            terms_to_query = [term_filter]
        else:
            # 否则查询所有学期
            terms_to_query = [term['value'] for term in available_terms] if available_terms else ['']
        
        print(f"\n开始查询成绩，共 {len(terms_to_query)} 个学期...")
        
        for term_value in terms_to_query:
            query_params = {'kksj': term_value} if term_value else {}
            
            try:
                score_response = session.get(SCORE_QUERY_URL, params=query_params, verify=False, timeout=10)
                soup = BeautifulSoup(score_response.text, 'html.parser')
                table = soup.find('table', id='dataList')
                
                if not table:
                    continue
                
                # 获取表头（只获取一次）
                if headers is None:
                    thead = table.find('thead')
                    if thead:
                        header_row = thead.find('tr')
                        if header_row:
                            headers = [th.get_text(strip=True) for th in header_row.find_all(['th', 'td'])]
                    else:
                        first_row = table.find('tr')
                        if first_row:
                            headers = [th.get_text(strip=True) for th in first_row.find_all(['th', 'td'])]
                
                # 获取数据行
                rows = []
                for tr in table.find_all('tr')[1:]:  # 跳过表头
                    cols = [td.get_text(strip=True) for td in tr.find_all('td')]
                    if cols and not any('未查询到数据' in c for c in cols):
                        rows.append(cols)
                
                if rows:
                    all_scores.extend(rows)
                    print(f"  [OK] 学期 {term_value}: 获取到 {len(rows)} 条记录")
                else:
                    print(f"  [无数据] 学期 {term_value}: 无成绩数据")
                    
            except Exception as e:
                print(f"  [失败] 学期 {term_value} 查询失败: {e}")
                continue
        
        if not all_scores:
            return None, username, real_name, '未找到成绩数据'
        
        # 创建 DataFrame
        df = pd.DataFrame(all_scores, columns=headers if headers else None)
        
        return df, username, real_name, None
        
    except requests.exceptions.Timeout:
        return None, username, name, '请求超时，请检查网络连接'
    except requests.exceptions.RequestException as e:
        return None, username, name, f'网络请求错误: {str(e)}'
    except Exception as e:
        return None, username, name, f'发生错误: {str(e)}'


if __name__ == '__main__':
    test_username = input('请输入测试账号: ')
    test_password = input('请输入测试密码: ')
    df, username, real_name, err = http_login_and_get_scores(test_username, test_password)
    if err:
        print(f'错误: {err}')
    else:
        print(f'成功获取 {real_name} 的成绩!')
        print(df)


# ========== 教学评价 ==========

def verify_login(username, password):
    """只验证登录并获取姓名，不爬取任何数据。返回 (success, real_name, session, error_msg)"""
    session = _create_session()
    if not _login_session(session, username, password):
        return False, None, None, '登录失败，请检查学号和密码'

    real_name = get_user_name(session)
    if not real_name:
        real_name = username

    return True, real_name, session, None

def _create_session():
    """创建带 User-Agent 的 requests session"""
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    return session


def _login_session(session, username, password):
    """登录教务系统，成功返回 True"""
    session.get(LOGIN_URL, verify=False, timeout=10)
    encoded_account = encode_inp(username)
    encoded_password = encode_inp(password)
    encoded = f"{encoded_account}%%%{encoded_password}"
    login_data = {'encoded': encoded, 'loginMethod': 'LoginToXk'}
    login_response = session.post(LOGIN_API, data=login_data, verify=False, allow_redirects=True, timeout=10)
    return 'xsMain' in login_response.text or '个人中心' in login_response.text


def get_evaluation_batches(session):
    """获取评价批次列表"""
    resp = session.get(XSPJ_FIND_URL, verify=False, timeout=10)
    soup = BeautifulSoup(resp.text, 'html.parser')
    table = soup.find('table')
    if not table:
        return []

    batches = []
    rows = table.find_all('tr')[1:]
    for row in rows:
        cells = row.find_all('td')
        links = row.find_all('a')
        for a in links:
            href = a.get('href', '')
            if 'xspj_list.do' in href and len(cells) >= 8:
                batches.append({
                    'seq': cells[0].get_text(strip=True),
                    'term': cells[1].get_text(strip=True),
                    'type': cells[2].get_text(strip=True),
                    'batch_name': cells[3].get_text(strip=True),
                    'course_type': cells[4].get_text(strip=True),
                    'start_time': cells[5].get_text(strip=True),
                    'end_time': cells[6].get_text(strip=True),
                    'url': href
                })
    return batches


def get_evaluation_teachers(session, list_url):
    """获取指定批次下所有待评教师（自动翻页）"""
    if not list_url.startswith('http'):
        list_url = f'https://jiaowu3.nsmc.edu.cn{list_url}'

    all_teachers = []
    seen_names = set()
    page = 1

    while page <= 20:
        page_url = re.sub(r'pageIndex=\d+', f'pageIndex={page}', list_url)
        if 'pageIndex' not in page_url:
            sep = '&' if '?' in page_url else '?'
            page_url = f'{page_url}{sep}pageIndex={page}'

        resp = session.get(page_url, verify=False, timeout=10)
        soup = BeautifulSoup(resp.text, 'html.parser')
        tables = soup.find_all('table')

        teachers_on_page = []
        seen_on_page = set()

        for table in tables:
            for row in table.find_all('tr')[1:]:
                cells = row.find_all('td')
                links = row.find_all('a')
                for a in links:
                    href = a.get('href', '')
                    text = a.get_text(strip=True)
                    if ('xspj_edit.do' in href or text in ('评价', '查看')) and len(cells) >= 8:
                        tid = cells[1].get_text(strip=True)
                        if tid == '教师编号' or tid in seen_on_page:
                            continue
                        seen_on_page.add(tid)
                        teachers_on_page.append({
                            'seq': cells[0].get_text(strip=True),
                            'teacher_id': tid,
                            'teacher_name': cells[2].get_text(strip=True),
                            'dept': cells[3].get_text(strip=True),
                            'eval_type': cells[4].get_text(strip=True),
                            'total_score': cells[5].get_text(strip=True),
                            'evaluated': cells[6].get_text(strip=True),
                            'submitted': cells[7].get_text(strip=True),
                            'url': href
                        })

        if not teachers_on_page or teachers_on_page[0]['teacher_name'] in seen_names:
            break

        for t in teachers_on_page:
            seen_names.add(t['teacher_name'])
        all_teachers.extend(teachers_on_page)
        page += 1

    return all_teachers


def _parse_evaluation_form(session, edit_url):
    """解析评价表单，返回 (hidden_fields, questions_list, duplicated_fields)"""
    if not edit_url.startswith('http'):
        edit_url = f'https://jiaowu3.nsmc.edu.cn{edit_url}'

    resp = session.get(edit_url, verify=False, timeout=10)
    soup = BeautifulSoup(resp.text, 'html.parser')

    hidden_fields = {}
    duplicated_fields = []

    for hidden in soup.find_all('input', type='hidden'):
        name = hidden.get('name')
        value = hidden.get('value', '')
        if not name:
            continue
        if name in hidden_fields:
            duplicated_fields.append((name, value))
        else:
            hidden_fields[name] = value

    questions = []
    form_table = soup.find('table', id='table1')
    if not form_table:
        form_table = soup.find('table')

    if form_table:
        for tr in form_table.find_all('tr'):
            td = tr.find('td')
            if not td:
                continue
            pj06xh_input = td.find('input', attrs={'name': 'pj06xh'})
            if not pj06xh_input:
                continue
            seq = pj06xh_input.get('value', '')
            text = td.get_text(strip=True)
            text = text.replace(seq, '').strip()

            opt_td = tr.find('td', attrs={'name': 'zbtd'})
            options = {}
            radio_name = f'pj0601id_{seq}'
            if opt_td:
                first_radio = opt_td.find('input', type='radio')
                if first_radio:
                    radio_name = first_radio.get('name', radio_name)
                for radio in opt_td.find_all('input', type='radio'):
                    opt_title = radio.get('title', '')
                    opt_value = radio.get('value', '')
                    if opt_title and opt_value:
                        options[opt_title] = opt_value

            questions.append({
                'seq': seq,
                'radio_name': radio_name,
                'title_text': text,
                'options': options
            })

    return hidden_fields, questions, duplicated_fields


def submit_single_evaluation(session, hidden_fields, questions, duplicated_fields, do_submit=False):
    """提交单份评价，成功返回 (True, message)，失败返回 (False, message)"""
    # 用列表保证重复字段名都发送
    form_data = []
    for k, v in hidden_fields.items():
        if k != 'issubmit':
            form_data.append((k, v))
    for k, v in duplicated_fields:
        if k != 'issubmit':
            form_data.append((k, v))

    form_data.append(('issubmit', '1' if do_submit else '0'))

    # 按显示顺序：最后一题选满意，其余选非常满意
    last_idx = len(questions) - 1
    for i, q in enumerate(questions):
        radio_name = q['radio_name']
        if i == last_idx:
            if '满意' in q['options']:
                form_data.append((radio_name, q['options']['满意']))
            else:
                return False, f"题目 '{q['title_text'][:30]}' 缺少'满意'选项"
        else:
            if '非常满意' in q['options']:
                form_data.append((radio_name, q['options']['非常满意']))
            else:
                return False, f"题目 '{q['title_text'][:30]}' 缺少'非常满意'选项"

    form_data.append(('jynr', ''))

    resp = session.post(XSPJ_SAVE_URL, data=form_data, verify=False, timeout=10)
    resp_text = resp.text

    if '保存成功' in resp_text:
        return True, '保存成功'
    elif '提交成功' in resp_text:
        return True, '提交成功'
    elif '保存失败' in resp_text or '提交失败' in resp_text:
        # 提取失败原因
        import re as _re
        match = _re.search(r"alert\('([^']+)'\)", resp_text)
        reason = match.group(1) if match else resp_text[:100]
        return False, reason
    return True, 'ok'


def evaluation_login_and_get_list(username, password):
    """登录并获取评价列表（完整流程）"""
    session = _create_session()
    if not _login_session(session, username, password):
        return None, session, '登录失败，请检查学号和密码'

    batches = get_evaluation_batches(session)
    if not batches:
        return [], session, '未找到评价批次'

    all_teachers = []
    for batch in batches:
        teachers = get_evaluation_teachers(session, batch['url'])
        for t in teachers:
            t['batch_name'] = batch['batch_name']
            t['batch_url'] = batch['url']
        all_teachers.extend(teachers)

    return all_teachers, session, None


def evaluation_submit_one(session, teacher_info, do_submit=False):
    """提交一位教师的评价"""
    hidden_fields, questions, duplicated_fields = _parse_evaluation_form(session, teacher_info['url'])
    if not questions:
        return False, '未解析到评价题目'
    return submit_single_evaluation(session, hidden_fields, questions, duplicated_fields, do_submit)


def evaluation_submit_all(username, password):
    """登录后一次性提交所有未评教师（全自动）"""
    session = _create_session()
    if not _login_session(session, username, password):
        return {'success': False, 'message': '登录失败'}, session

    batches = get_evaluation_batches(session)
    if not batches:
        return {'success': False, 'message': '未找到评价批次'}, session

    results = []
    for batch in batches:
        teachers = get_evaluation_teachers(session, batch['url'])
        unsubmitted = [t for t in teachers if t['submitted'] != '是']

        for t in unsubmitted:
            hidden_fields, questions, duplicated_fields = _parse_evaluation_form(session, t['url'])
            if not questions:
                results.append({'teacher_name': t['teacher_name'], 'success': False, 'message': '未解析到题目'})
                continue

            success, msg = submit_single_evaluation(session, hidden_fields, questions, duplicated_fields, do_submit=True)
            results.append({
                'teacher_name': t['teacher_name'],
                'teacher_id': t['teacher_id'],
                'dept': t['dept'],
                'success': success,
                'message': msg
            })

    all_ok = all(r['success'] for r in results)
    return {
        'success': all_ok,
        'total': len(results),
        'results': results
    }, session
