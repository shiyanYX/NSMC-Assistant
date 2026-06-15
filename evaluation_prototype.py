"""
PROTOTYPE — 教学评价自动评教流程验证
问题：HTTP 流程能不能走通？POST 提交后系统接受吗？

用法: python evaluation_prototype.py
交互式输入学号密码 → 获取待评列表 → 对第一门课自动填写并提交

扔弃代码，验证后删除或并入正式代码。
"""

import requests
import base64
from bs4 import BeautifulSoup
import urllib3
import os

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LOGIN_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/'
LOGIN_API = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xk/LoginToXk'
XSPJ_FIND_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_find.do'
XSPJ_EDIT_BASE = 'https://jiaowu3.nsmc.edu.cn'
XSPJ_SAVE_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_save.do'

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def encode_inp(input_str):
    return base64.b64encode(input_str.encode('utf-8')).decode('utf-8')


def login(session, username, password):
    """登录教务系统"""
    session.get(LOGIN_URL, verify=False, timeout=10)

    encoded_account = encode_inp(username)
    encoded_password = encode_inp(password)
    encoded = f"{encoded_account}%%%{encoded_password}"

    login_data = {'encoded': encoded, 'loginMethod': 'LoginToXk'}
    login_response = session.post(LOGIN_API, data=login_data, verify=False, allow_redirects=True, timeout=10)

    print(f"登录响应 URL: {login_response.url}")

    if 'xsMain' in login_response.text or '个人中心' in login_response.text:
        print("✓ 登录成功")
        return True
    else:
        print("✗ 登录失败")
        soup = BeautifulSoup(login_response.text, 'html.parser')
        title = soup.find('title')
        if title:
            print(f"  页面标题: {title.get_text()}")
        return False


def get_evaluation_list(session):
    """获取待评课程列表"""
    print("\n=== 获取待评课程列表 ===")
    print(f"请求: {XSPJ_FIND_URL}")

    response = session.get(XSPJ_FIND_URL, verify=False, timeout=10, allow_redirects=True)
    print(f"最终响应 URL: {response.url}")
    print(f"响应长度: {len(response.text)} 字符")

    # 保存到文件
    html_path = os.path.join(OUT_DIR, 'xspj_list_page.html')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(response.text)
    print(f"已保存到: {html_path}")

    soup = BeautifulSoup(response.text, 'html.parser')

    # 直接打印所有表格结构
    all_tables = soup.find_all('table')
    print(f"\n找到 {len(all_tables)} 个表格")

    for i, table in enumerate(all_tables):
        rows = table.find_all('tr')
        print(f"\n--- 表格 #{i+1} ({len(rows)} 行) ---")
        for j, row in enumerate(rows[:5]):  # 只展示前5行
            cells = row.find_all('td')
            ths = row.find_all('th')
            if ths:
                print(f"  Row {j}: TH={[t.get_text(strip=True)[:40] for t in ths]}")
            if cells:
                links = row.find_all('a')
                link_info = [f"{a.get_text(strip=True)} -> {a.get('href','')[:60]}" for a in links]
                print(f"  Row {j}: TD({len(cells)})={[c.get_text(strip=True)[:30] for c in cells]}")
                if link_info:
                    print(f"          LINKS: {link_info}")

    return []


def fetch_evaluation_form(session, edit_url):
    """获取评价表单，解析题目和选项"""
    full_url = XSPJ_EDIT_BASE + edit_url if edit_url.startswith('/') else edit_url
    print(f"\n=== 获取评价表单 ===")
    print(f"请求: {full_url}")

    response = session.get(full_url, verify=False, timeout=10)
    soup = BeautifulSoup(response.text, 'html.parser')

    hidden_fields = {}
    for hidden in soup.find_all('input', type='hidden'):
        name = hidden.get('name')
        value = hidden.get('value', '')
        if name:
            hidden_fields[name] = value

    print(f"\n隐藏字段 ({len(hidden_fields)} 个):")
    for k, v in hidden_fields.items():
        print(f"  {k} = {v}")

    questions = {}
    all_radios = soup.find_all('input', type='radio')

    for radio in all_radios:
        name = radio.get('name', '')
        if name.startswith('pj0601id_'):
            seq = name.replace('pj0601id_', '')
            title = radio.get('title', '?')
            value = radio.get('value', '')

            if seq not in questions:
                questions[seq] = {'seq': seq, 'title_text': '', 'options': {}}
            questions[seq]['options'][title] = value

    for tr in soup.find_all('tr'):
        td = tr.find('td')
        if td:
            hidden = td.find('input', attrs={'name': 'pj06xh'})
            if hidden:
                seq = hidden.get('value', '')
                text = td.get_text(strip=True)
                text = text.replace(seq, '').strip()
                if seq in questions:
                    questions[seq]['title_text'] = text

    print(f"\n题目列表 ({len(questions)} 道):")
    for seq in sorted(questions.keys(), key=int):
        q = questions[seq]
        print(f"  [{seq}] {q['title_text']}")
        for opt_title, opt_val in q['options'].items():
            print(f"      {opt_title}: {opt_val}")

    return hidden_fields, questions


def submit_evaluation(session, hidden_fields, questions):
    """提交一份评价"""
    print(f"\n=== 提交评价 ===")

    form_data = {}
    for k, v in hidden_fields.items():
        form_data[k] = v

    form_data['issubmit'] = '1'

    seq_list = sorted(questions.keys(), key=int)
    last_seq = seq_list[-1]

    print("\n选择策略:")
    for seq in seq_list:
        q = questions[seq]
        if seq == last_seq:
            if '满意' in q['options']:
                form_data[f'pj0601id_{seq}'] = q['options']['满意']
                print(f"  [{seq}] {q['title_text'][:30]}... → 满意 ({q['options']['满意']})")
            else:
                print(f"  ⚠ [{seq}] 没有'满意'选项!")
                return False
        else:
            if '非常满意' in q['options']:
                form_data[f'pj0601id_{seq}'] = q['options']['非常满意']
            else:
                print(f"  ⚠ [{seq}] 没有'非常满意'选项!")
                return False

    form_data['jynr'] = ''

    print(f"\n提交 {len(form_data)} 个字段到: {XSPJ_SAVE_URL}")

    response = session.post(XSPJ_SAVE_URL, data=form_data, verify=False, timeout=10)

    print(f"响应状态码: {response.status_code}")
    print(f"响应 URL: {response.url}")
    print(f"响应内容 (前 500 字符):")
    print(response.text[:500])

    if response.status_code == 200:
        print("\n✓ 提交请求成功发送")
        return True
    else:
        print(f"\n✗ 提交请求异常 (HTTP {response.status_code})")
        return False


def main():
    print("=" * 60)
    print("PROTOTYPE — 评教自动提交流程验证")
    print("=" * 60)

    username = input("\n请输入学号: ").strip()
    password = input("请输入密码: ").strip()

    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    if not login(session, username, password):
        print("\n测试终止: 登录失败")
        return

    # Step 2: 获取待评列表（调试模式）
    evaluations = get_evaluation_list(session)

    if not evaluations:
        print("\n== 调试模式: 已保存 HTML，手动检查表结构 ==")
        return

    target = evaluations[0]
    print(f"\n准备测试第一门课:")
    print(f"  教师: {target['teacher_name']}")
    print(f"  院系: {target['dept']}")
    print(f"  URL: {target['url']}")

    confirm = input("\n按 Enter 继续提交, 输入 's' 跳过提交: ").strip()
    if confirm.lower() == 's':
        print("跳过提交。")
        return

    hidden_fields, questions = fetch_evaluation_form(session, target['url'])
    if not questions:
        print("\n测试终止: 未解析到题目")
        return

    success = submit_evaluation(session, hidden_fields, questions)
    if success:
        print("\n" + "=" * 60)
        print("✓ 原型验证通过 — 流程可正常执行")
        print("=" * 60)
    else:
        print("\n" + "=" * 60)
        print("✗ 原型验证失败 — 需要排查")
        print("=" * 60)


if __name__ == '__main__':
    main()
