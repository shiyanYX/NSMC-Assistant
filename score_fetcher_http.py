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
