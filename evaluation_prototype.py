"""
PROTOTYPE — 教学评价自动评教流程验证
流程: 登录 → 获取评价批次 → 进入批次获取教师列表 → 对第一个自动填写并提交

用法: python evaluation_prototype.py
"""

import requests
import base64
import re
from bs4 import BeautifulSoup
import urllib3
import os

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE = 'https://jiaowu3.nsmc.edu.cn'
LOGIN_URL = f'{BASE}/jsxsd/'
LOGIN_API = f'{BASE}/jsxsd/xk/LoginToXk'
XSPJ_FIND_URL = f'{BASE}/jsxsd/xspj/xspj_find.do'
XSPJ_SAVE_URL = f'{BASE}/jsxsd/xspj/xspj_save.do'


def encode_inp(input_str):
    return base64.b64encode(input_str.encode('utf-8')).decode('utf-8')


def login(session, username, password):
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
        return False


def get_batches(session):
    """Step 1: 获取评价批次列表"""
    print("\n=== Step 1: 获取评价批次 ===")
    print(f"请求: {XSPJ_FIND_URL}")
    resp = session.get(XSPJ_FIND_URL, verify=False, timeout=10)
    print(f"响应 URL: {resp.url}")

    soup = BeautifulSoup(resp.text, 'html.parser')
    table = soup.find('table')
    if not table:
        print("未找到表格!")
        return []

    # 找表头确定列索引
    ths = table.find_all('th')
    print(f"表头: {[t.get_text(strip=True)[:20] for t in ths]}")

    batches = []
    rows = table.find_all('tr')[1:]  # 跳过表头
    for row in rows:
        cells = row.find_all('td')
        if len(cells) >= 8:
            links = row.find_all('a')
            for a in links:
                href = a.get('href', '')
                if 'xspj_list.do' in href:
                    b = {
                        'seq': cells[0].get_text(strip=True),
                        'term': cells[1].get_text(strip=True),
                        'type': cells[2].get_text(strip=True),
                        'batch': cells[3].get_text(strip=True),
                        'course_type': cells[4].get_text(strip=True),
                        'start_time': cells[5].get_text(strip=True),
                        'end_time': cells[6].get_text(strip=True),
                        'url': href
                    }
                    batches.append(b)
                    print(f"  {b['seq']}. {b['batch']} ({b['course_type']}) → {href[:80]}...")

    return batches


def get_teacher_list(session, list_url):
    """Step 2: 进入某个批次，获取所有页的待评教师列表"""
    full_url = BASE + list_url if list_url.startswith('/') else list_url
    print(f"\n=== Step 2: 获取教师列表 ===")

    all_teachers = []
    page = 1
    max_pages = 20
    seen_names = set()  # 防重复（系统可能是回环而不是空页）

    while page <= max_pages:
        # 用 pageIndex 参数翻页
        if 'pageIndex' in full_url:
            page_url = re.sub(r'pageIndex=\d+', f'pageIndex={page}', full_url)
        else:
            sep = '&' if '?' in full_url else '?'
            page_url = f"{full_url}{sep}pageIndex={page}"
        print(f"\n--- 第 {page} 页 ---")
        resp = session.get(page_url, verify=False, timeout=10)

        soup = BeautifulSoup(resp.text, 'html.parser')
        tables = soup.find_all('table')

        teachers_on_page = []
        seen_on_page = set()

        for table in tables:
            rows = table.find_all('tr')
            for row in rows[1:]:
                cells = row.find_all('td')
                links = row.find_all('a')
                for a in links:
                    href = a.get('href', '')
                    text = a.get_text(strip=True)
                    if ('xspj_edit.do' in href or text in ('评价', '查看')) and len(cells) >= 8:
                        tid = cells[1].get_text(strip=True)
                        if tid == '教师编号' or tid in seen_on_page:
                            continue  # 跳过表头和重复
                        seen_on_page.add(tid)
                        t = {
                            'seq': cells[0].get_text(strip=True),
                            'teacher_id': tid,
                            'teacher_name': cells[2].get_text(strip=True),
                            'dept': cells[3].get_text(strip=True),
                            'eval_type': cells[4].get_text(strip=True),
                            'submitted': cells[7].get_text(strip=True),
                            'url': href
                        }
                        teachers_on_page.append(t)

        # 检测回环：本页第一条老师是否已在前几页出现
        if teachers_on_page and teachers_on_page[0]['teacher_name'] in seen_names:
            print(f"  检测到重复 → 已翻完所有页")
            break

        for t in teachers_on_page:
            status = '✓已评' if t['submitted'] == '是' else '待评'
            print(f"  {status} {t['teacher_name']} [{t['dept']}]")
            seen_names.add(t['teacher_name'])  # 注意: 同名不同老师的极端情况，但实际教务不会有

        if not teachers_on_page:
            print(f"  第 {page} 页无数据，停止翻页")
            break

        for t in teachers_on_page:
            status = '✓已评' if t['submitted'] == '是' else '待评'
            print(f"  {status} {t['teacher_name']} [{t['dept']}]")

        all_teachers.extend(teachers_on_page)
        page += 1

    unsubmitted = [t for t in all_teachers if t['submitted'] != '是']
    print(f"\n总计: {len(all_teachers)} 位教师, 未评: {len(unsubmitted)} 位")
    return all_teachers


def fetch_evaluation_form(session, edit_url):
    """Step 3: 获取评价表单，解析题目和选项（保持显示顺序）"""
    full_url = BASE + edit_url if edit_url.startswith('/') else edit_url
    print(f"\n=== Step 3: 获取评价表单 ===")
    print(f"请求: {full_url}")
    resp = session.get(full_url, verify=False, timeout=10)
    soup = BeautifulSoup(resp.text, 'html.parser')

    hidden_fields = {}
    duplicated_fields = []  # 同名多值字段 (如 pj06xh 每道题一个)
    for hidden in soup.find_all('input', type='hidden'):
        name = hidden.get('name')
        value = hidden.get('value', '')
        if not name:
            continue
        if name in hidden_fields:
            # 已有同名键，移到重复列表
            if name not in {k for k, _ in duplicated_fields}:
                duplicated_fields.append((name, hidden_fields[name]))
            duplicated_fields.append((name, value))
        else:
            hidden_fields[name] = value

    print(f"隐藏字段: {len(hidden_fields)} 个唯一 + {len(duplicated_fields)} 个重复")

    # 按显示顺序提取题目 (遍历 tr 而不是 radio)
    questions = []  # 改为列表，保持显示顺序

    form_table = soup.find('table', id='table1')
    if not form_table:
        print("⚠ 未找到表单表格 #table1")
        return hidden_fields, []

    for tr in form_table.find_all('tr'):
        td = tr.find('td')
        if not td:
            continue
        # 找 pj06xh (题目序号)
        pj06xh_input = td.find('input', attrs={'name': 'pj06xh'})
        if not pj06xh_input:
            continue
        seq = pj06xh_input.get('value', '')
        text = td.get_text(strip=True)
        text = text.replace(seq, '').strip()

        # 找对应的选项 radio (在相邻的 td 中)
        opt_td = tr.find('td', attrs={'name': 'zbtd'})
        options = {}
        if opt_td:
            for radio in opt_td.find_all('input', type='radio'):
                opt_title = radio.get('title', '')
                opt_value = radio.get('value', '')
                opt_name = radio.get('name', '')
                if opt_title and opt_value:
                    options[opt_title] = opt_value
                    # 记住 radio name (用于后续表单提交)
                    # radio name 格式: pj0601id_{seq}
                    if 'radio_name' not in locals() or True:
                        pass

        # 提取 radio name
        radio_name = f"pj0601id_{seq}"
        if opt_td:
            first_radio = opt_td.find('input', type='radio')
            if first_radio:
                radio_name = first_radio.get('name', radio_name)

        questions.append({
            'seq': seq,
            'radio_name': radio_name,
            'title_text': text,
            'options': options
        })

    print(f"\n题目 (按显示顺序, {len(questions)} 道):")
    for i, q in enumerate(questions):
        opts = '/'.join(q['options'].keys())
        print(f"  [{i+1}] pj06xh={q['seq']} {q['title_text'][:50]}")
        print(f"       radio={q['radio_name']} 选项: {opts}")

    return hidden_fields, questions, duplicated_fields


def submit_evaluation(session, hidden_fields, questions, duplicated_fields, do_submit=False):
    """提交评价 (do_submit=False 则仅保存, True 则正式提交)"""
    action = "提交" if do_submit else "保存"
    print(f"\n=== Step 4: {action}评价 ===")

    # 核心字段 + pj0601fz_* 权重 + pj06xh
    core_keys = {'issubmit', 'pj09id', 'pj01id', 'pj0502id', 'jg0101id',
                 'jx0404id', 'xsflid', 'xnxq01id', 'jx02id', 'pj02id',
                 'pageIndex', 'ifypjxx', 'pj03id', 'isxtjg'}
    form_data = {}
    for k, v in hidden_fields.items():
        if k in core_keys or k.startswith('pj0601fz_'):
            form_data[k] = v
    # 加上所有重复字段 (pj06xh 等)
    for k, v in duplicated_fields:
        form_data[k] = v

    form_data['issubmit'] = '1' if do_submit else '0'

    # 按显示顺序: 最后一题选满意，其余选非常满意
    last_idx = len(questions) - 1

    for i, q in enumerate(questions):
        radio_name = q['radio_name']
        if i == last_idx:
            if '满意' in q['options']:
                form_data[radio_name] = q['options']['满意']
                print(f"  {radio_name} → 满意 ({q['title_text'][:30]}...)")
            else:
                print(f"  ⚠ 题目 {i+1} 没有'满意'选项!")
                return False
        else:
            if '非常满意' in q['options']:
                form_data[radio_name] = q['options']['非常满意']
                print(f"  {radio_name} → 非常满意 ({q['title_text'][:30]}...)")
            else:
                print(f"  ⚠ 题目 {i+1} 没有'非常满意'选项!")
                return False

    form_data['jynr'] = ''

    # 打印所有选中项供审核
    check_keys = [k for k in form_data if k.startswith('pj0601id_')]
    print(f"\n=== 审核: 共 {len(check_keys)} 道题 ===")
    for k in sorted(check_keys, key=lambda x: int(x.replace('pj0601id_', ''))):
        print(f"  {k} = {form_data[k]}")

    print(f"\n(action={action})")

    resp = session.post(XSPJ_SAVE_URL, data=form_data, verify=False, timeout=10)
    print(f"状态码: {resp.status_code}")
    print(f"响应 (前 300): {resp.text[:300]}")

    if resp.status_code == 200:
        print("✓ 提交请求成功")
        return True
    else:
        print(f"✗ HTTP {resp.status_code}")
        return False


def main():
    print("=" * 60)
    print("PROTOTYPE — 教学评价自动评教验证")
    print("=" * 60)

    username = input("\n学号: ").strip()
    password = input("密码: ").strip()

    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    if not login(session, username, password):
        print("登录失败，终止")
        return

    # Step 1: 获取批次
    batches = get_batches(session)
    if not batches:
        print("未找到评价批次")
        return

    # 选第一个批次
    target_batch = batches[0]
    print(f"\n→ 进入批次: {target_batch['batch']}")

    # Step 2: 获取教师列表
    teachers = get_teacher_list(session, target_batch['url'])
    if not teachers:
        print("未找到待评教师（可能已全部评完或解析失败）")
        return

    # 找第一个未提交的
    unsubmitted = [t for t in teachers if t['submitted'] != '是']
    if not unsubmitted:
        print("\n🎉 全部已评完!")
        return

    target = unsubmitted[0]
    print(f"\n→ 目标: {target['teacher_name']} ({target['dept']}) [{target['seq']}/{len(teachers)}]")
    print(f"   剩余未评: {len(unsubmitted)} 位教师")

    confirm = input("\n按 Enter 提交, s 跳过: ").strip()
    if confirm.lower() == 's':
        print("跳过。")
        return

    # Step 3: 获取表单
    hidden_fields, questions, duplicated_fields = fetch_evaluation_form(session, target['url'])
    if not questions:
        print("未解析到题目")
        return

    # Step 4: 提交
    success = submit_evaluation(session, hidden_fields, questions, duplicated_fields, do_submit=False)
    if success:
        print("\n" + "=" * 60)
        print("✓ 流程已验证")
        print("=" * 60)
    else:
        print("\n✗ 验证失败")


if __name__ == '__main__':
    main()
