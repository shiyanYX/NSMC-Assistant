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

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LOGIN_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/'
LOGIN_API = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xk/LoginToXk'
XSPJ_FIND_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_find.do'
XSPJ_EDIT_BASE = 'https://jiaowu3.nsmc.edu.cn'
XSPJ_SAVE_URL = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xspj/xspj_save.do'


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
    print(f"登录页面标题: {login_response.url}")

    if 'xsMain' in login_response.text or '个人中心' in login_response.text:
        print("✓ 登录成功")
        return True
    else:
        print("✗ 登录失败")
        # 打印部分响应以便调试
        soup = BeautifulSoup(login_response.text, 'html.parser')
        title = soup.find('title')
        if title:
            print(f"  页面标题: {title.get_text()}")
        return False


def get_evaluation_list(session):
    """获取待评课程列表"""
    print("\n=== 获取待评课程列表 ===")
    print(f"请求: {XSPJ_FIND_URL}")

    response = session.get(XSPJ_FIND_URL, verify=False, timeout=10)
    print(f"响应 URL: {response.url}")

    # 保存页面以便分析
    with open('xspj_list_page.html', 'w', encoding='utf-8') as f:
        f.write(response.text)
    print("列表页已保存到 xspj_list_page.html")

    soup = BeautifulSoup(response.text, 'html.parser')

    # 尝试找到列表表格
    tables = soup.find_all('table', class_='layui-table')
    print(f"找到 {len(tables)} 个 layui-table")

    evaluations = []

    for table in tables:
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 8:
                # 尝试提取评价链接
                links = row.find_all('a')
                for link in links:
                    href = link.get('href', '')
                    text = link.get_text(strip=True)
                    if '评价' in text and href:
                        teacher_name = cells[2].get_text(strip=True) if len(cells) > 2 else '?'
                        dept = cells[3].get_text(strip=True) if len(cells) > 3 else '?'
                        submitted = cells[6].get_text(strip=True) if len(cells) > 6 else '?'

                        ev = {
                            'teacher_name': teacher_name,
                            'teacher_id': cells[1].get_text(strip=True) if len(cells) > 1 else '?',
                            'dept': dept,
                            'eval_type': cells[4].get_text(strip=True) if len(cells) > 4 else '?',
                            'submitted': submitted,
                            'url': href
                        }
                        evaluations.append(ev)
                        print(f"  {len(evaluations)}. {teacher_name} [{dept}] - 已提交:{submitted} - {href[:80]}...")

    if not evaluations:
        # 打印页面关键部分帮助调试
        print("\n未提取到评价列表，页面关键内容:")
        print(response.text[:2000])

    return evaluations


def fetch_evaluation_form(session, edit_url):
    """获取评价表单，解析题目和选项"""
    full_url = XSPJ_EDIT_BASE + edit_url if edit_url.startswith('/') else edit_url
    print(f"\n=== 获取评价表单 ===")
    print(f"请求: {full_url}")

    response = session.get(full_url, verify=False, timeout=10)
    soup = BeautifulSoup(response.text, 'html.parser')

    # 提取隐藏字段
    hidden_fields = {}
    for hidden in soup.find_all('input', type='hidden'):
        name = hidden.get('name')
        value = hidden.get('value', '')
        if name:
            hidden_fields[name] = value

    print(f"\n隐藏字段 ({len(hidden_fields)} 个):")
    for k, v in hidden_fields.items():
        print(f"  {k} = {v}")

    # 提取每道题的 radio 选项
    # 结构: <input type="radio" name="pj0601id_X" value="UUID" title="非常满意/满意/...">
    questions = {}
    all_radios = soup.find_all('input', type='radio')

    for radio in all_radios:
        name = radio.get('name', '')
        if name.startswith('pj0601id_'):
            seq = name.replace('pj0601id_', '')
            title = radio.get('title', '?')
            value = radio.get('value', '')

            if seq not in questions:
                questions[seq] = {
                    'seq': seq,
                    'title_text': '',
                    'options': {}
                }

            questions[seq]['options'][title] = value

    # 提取每道题的文本
    for tr in soup.find_all('tr'):
        td = tr.find('td')
        if td:
            hidden = td.find('input', attrs={'name': 'pj06xh'})
            if hidden:
                seq = hidden.get('value', '')
                text = td.get_text(strip=True)
                # 去掉隐藏 input 的值
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

    # 构造表单数据
    form_data = {}

    # 复制所有隐藏字段
    for k, v in hidden_fields.items():
        form_data[k] = v

    # 设置提交标志
    form_data['issubmit'] = '1'

    # 对每道题选择答案
    seq_list = sorted(questions.keys(), key=int)
    last_seq = seq_list[-1]  # 最后一道题

    print("\n选择策略:")
    for seq in seq_list:
        q = questions[seq]
        if seq == last_seq:
            # 最后一道题选"满意"
            if '满意' in q['options']:
                form_data[f'pj0601id_{seq}'] = q['options']['满意']
                print(f"  [{seq}] {q['title_text'][:30]}... → 满意 ({q['options']['满意']})")
            else:
                print(f"  ⚠ [{seq}] 没有'满意'选项!")
                return False
        else:
            # 其余选"非常满意"
            if '非常满意' in q['options']:
                form_data[f'pj0601id_{seq}'] = q['options']['非常满意']
            else:
                print(f"  ⚠ [{seq}] 没有'非常满意'选项!")
                return False

    # 建议留空
    form_data['jynr'] = ''

    print(f"\n提交 {len(form_data)} 个字段到: {XSPJ_SAVE_URL}")

    response = session.post(
        XSPJ_SAVE_URL,
        data=form_data,
        verify=False,
        timeout=10
    )

    print(f"响应状态码: {response.status_code}")
    print(f"响应 URL: {response.url}")
    print(f"响应内容 (前 500 字符):")
    print(response.text[:500])

    # 检查成功标志
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

    # Step 1: 登录
    if not login(session, username, password):
        print("\n测试终止: 登录失败")
        return

    # Step 2: 获取待评列表
    evaluations = get_evaluation_list(session)

    if not evaluations:
        print("\n测试终止: 未找到待评课程列表（可能需要先确认学期或教务系统状态）")
        return

    # Step 3: 只处理第一门课
    target = evaluations[0]
    print(f"\n准备测试第一门课:")
    print(f"  教师: {target['teacher_name']}")
    print(f"  院系: {target['dept']}")
    print(f"  URL: {target['url']}")

    confirm = input("\n按 Enter 继续提交, 输入 's' 跳过提交: ").strip()
    if confirm.lower() == 's':
        print("跳过提交。")
        return

    # Step 4: 获取表单
    hidden_fields, questions = fetch_evaluation_form(session, target['url'])

    if not questions:
        print("\n测试终止: 未解析到题目")
        return

    # Step 5: 提交
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
