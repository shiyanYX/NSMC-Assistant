"""
xg2 学工系统（xg2.nsmc.edu.cn）登录 + 节假日去向登记
"""
import re, random, base64, threading
import requests, urllib3
from urllib.parse import quote_plus

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE = 'https://xg2.nsmc.edu.cn/Sys'

CAPTCHA_CHARS = [
    '2','3','4','5','6','7','8','9',
    'b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z',
    'B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z',
]

LOGIN_DATA_CACHE = {}
_cache_lock = threading.Lock()


def _make_session():
    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    s.verify = False
    return s


def _gbk_form(data):
    return '&'.join(f"{quote_plus(k.encode('gb2312'))}={quote_plus(v.encode('gb2312'))}" for k, v in data.items())


def _encrypt_rsa(username, password, modulus_hex):
    """RSA 加密：base64(user)\\base64(pass) → PKCS#1 v1.5 填充 → pow_mod → hex(256)"""
    raw = base64.b64encode(username.encode()).decode() + '\\' + base64.b64encode(password.encode()).decode()
    rb = raw.encode('ascii')
    ds, ml = 128, len(rb)
    ps = max(8, ds - 3 - ml)
    b = bytearray(ds)
    for x in range(ml): b[x] = rb[ml - 1 - x]
    b[ml] = 0
    for x in range(ps): b[ml + 1 + x] = random.randint(1, 255)
    b[ds - 2] = 2; b[ds - 1] = 0
    c = pow(int.from_bytes(b, 'little'), 0x010001, int(modulus_hex, 16))
    return hex(c)[2:].zfill(256)


def _aspnet_fields(html):
    f = {}
    for n in ('__VIEWSTATE', '__EVENTVALIDATION', '__VIEWSTATEGENERATOR'):
        m = re.search(rf'{re.escape(n)}[^>]*value="([^"]*)"', html)
        if m: f[n] = m.group(1)
    return f


def _span_text(html, sid):
    m = re.search(rf'<span[^>]*id="{re.escape(sid)}"[^>]*>([^<]*)</span>', html)
    return m.group(1).strip() if m else ''


# ====== 公开 API ======

def login_and_get_list(username, password):
    """
    登录 xg2 → 获取 StuLeave.aspx 列表页。
    返回 dict:
      - success: bool
      - 成功时：holiday_name, status, records[...], viewstate/eventvalidation/viewstategenerator（用于新增提交）
      - 失败时：message
    """
    session = _make_session()

    # ---- GET 登录页 ----
    try:
        r = session.get(f'{BASE}/UserLogin.aspx',
                        headers={'Referer': 'https://xg2.nsmc.edu.cn/'}, timeout=15)
    except Exception as e:
        return {'success': False, 'message': f'无法访问 xg2: {str(e)}'}

    m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', r.text)
    if not m: return {'success': False, 'message': '未能获取 RSA 公钥'}
    modulus_hex = m.group(3)
    fields = _aspnet_fields(r.text)

    # ---- POST 登录 ----
    fd = {
        '__LASTFOCUS': '', '__EVENTTARGET': '', '__EVENTARGUMENT': '',
        '__VIEWSTATE': fields.get('__VIEWSTATE', ''),
        '__VIEWSTATEGENERATOR': fields.get('__VIEWSTATEGENERATOR', ''),
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': fields.get('__EVENTVALIDATION', ''),
        'UserName': '******',
        'posx': _encrypt_rsa(username, password, modulus_hex),
        'codeInput': ''.join(random.choice(CAPTCHA_CHARS) for _ in range(4)),
        'queryBtn': '登          录',
    }

    r2 = session.post(f'{BASE}/UserLogin.aspx', data=_gbk_form(fd),
        headers={'Content-Type': 'application/x-www-form-urlencoded',
                 'Referer': 'https://xg2.nsmc.edu.cn/', 'Origin': 'https://xg2.nsmc.edu.cn'},
        timeout=15)

    cookies = session.cookies.get_dict()
    if 'CenterSoft' not in cookies or 'code' not in cookies:
        alert = re.search(r"alert\(['\"]([^'\"]+)['\"]\)", r2.text)
        return {'success': False, 'message': alert.group(1) if alert else 'xg2 登录失败'}

    # ---- GET StuLeave.aspx 列表 ----
    try:
        r3 = session.get(f'{BASE}/SystemForm/Leave/StuLeave.aspx', timeout=15)
        list_html = r3.text
    except Exception as e:
        return {'success': False, 'message': f'获取列表失败: {str(e)}'}

    list_fields = _aspnet_fields(list_html)

    # 解析节假日信息
    holiday_name = _span_text(list_html, 'HolidayName')
    status = _span_text(list_html, 'Status')
    begin_date = _span_text(list_html, 'BeginDate')
    end_date = _span_text(list_html, 'EndDate')
    leave_begin = _span_text(list_html, 'LeaveBeginDate')
    leave_end = _span_text(list_html, 'LeaveEndDate')
    memo = _span_text(list_html, 'Memo')

    # 解析历史记录
    records = []
    table = re.search(r'<table[^>]*id="GridView1"[^>]*>.*?</table>', list_html, re.DOTALL)
    if table:
        rows = re.findall(r'<tr[^>]*>.*?</tr>', table.group(), re.DOTALL)
        for row in rows[1:]:
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
            if len(cells) >= 6:
                # 第一个 cell 有链接，提取 Id
                id_m = re.search(r'Id=(\d+)', cells[0])
                student_id = re.sub(r'<[^>]+>', '', cells[0]).strip()
                records.append({
                    'id': id_m.group(1) if id_m else '',
                    'student_id': student_id,
                    'student_name': re.sub(r'<[^>]+>', '', cells[1]).strip(),
                    'holiday': re.sub(r'<[^>]+>', '', cells[2]).strip(),
                    'time_range': re.sub(r'<[^>]+>', '', cells[3]).strip(),
                    'leave_type': re.sub(r'<[^>]+>', '', cells[4]).strip(),
                    'destination': re.sub(r'<[^>]+>', '', cells[5]).strip(),
                })

    # 缓存 session 供后续新增/提交使用
    with _cache_lock:
        LOGIN_DATA_CACHE[username] = {
            'session': session,
            'list_viewstate': list_fields.get('__VIEWSTATE', ''),
            'list_eventvalidation': list_fields.get('__EVENTVALIDATION', ''),
            'list_viewstategenerator': list_fields.get('__VIEWSTATEGENERATOR', ''),
            'list_html': list_html,
        }

    return {
        'success': True,
        'username': username,
        'holiday_name': holiday_name or '',
        'status': status or '',
        'begin_date': begin_date or '',
        'end_date': end_date or '',
        'leave_begin_date': leave_begin or '',
        'leave_end_date': leave_end or '',
        'memo': memo or '',
        'records': records,
        'record_count': len(records),
    }


def get_edit_form(username):
    """
    获取 StuLeave_Edit.aspx?Status=Add 页面（在登录后调用）。
    返回 dict 包含表单 VIEWSTATE + 节假日信息。
    """
    with _cache_lock:
        login_data = LOGIN_DATA_CACHE.get(username)

    if not login_data:
        return {'success': False, 'message': '请先登录'}

    session = login_data['session']

    try:
        r = session.get(f'{BASE}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add', timeout=15)
        edit_html = r.text
    except Exception as e:
        return {'success': False, 'message': f'获取编辑页失败: {str(e)}'}

    f = _aspnet_fields(edit_html)

    # 更新缓存中的编辑页 VIEWSTATE 和 HTML
    with _cache_lock:
        if LOGIN_DATA_CACHE.get(username):
            LOGIN_DATA_CACHE[username]['edit_viewstate'] = f.get('__VIEWSTATE', '')
            LOGIN_DATA_CACHE[username]['edit_eventvalidation'] = f.get('__EVENTVALIDATION', '')
            LOGIN_DATA_CACHE[username]['edit_viewstategenerator'] = f.get('__VIEWSTATEGENERATOR', '')
            LOGIN_DATA_CACHE[username]['edit_html'] = edit_html

    return {
        'success': True,
        'student_name': _span_text(edit_html, 'Leave1_UserName') or '',
        'holiday_name': _span_text(edit_html, 'LeaveNoHomeConfig1_HolidayName') or '',
        'begin_date': _span_text(edit_html, 'LeaveNoHomeConfig1_BeginDate') or '',
        'end_date': _span_text(edit_html, 'LeaveNoHomeConfig1_EndDate') or '',
        'leave_begin_date': _span_text(edit_html, 'LeaveNoHomeConfig1_LeaveBeginDate') or '',
        'leave_end_date': _span_text(edit_html, 'LeaveNoHomeConfig1_LeaveEndDate') or '',
        'memo': _span_text(edit_html, 'LeaveNoHomeConfig1_Memo') or '',
        'viewstate': f.get('__VIEWSTATE', ''),
        'eventvalidation': f.get('__EVENTVALIDATION', ''),
        'viewstategenerator': f.get('__VIEWSTATEGENERATOR', ''),
    }


def submit_leave(username, form_fields):
    """提交去向登记（复用 session）"""
    with _cache_lock:
        login_data = LOGIN_DATA_CACHE.get(username)

    if not login_data:
        return False, '请先登录'

    data = {}
    data.update(form_fields)

    # 确保 __EVENTTARGET = Save 触发服务器端按钮事件
    data['__EVENTTARGET'] = 'Save'
    data['__EVENTARGUMENT'] = ''
    data['__LASTFOCUS'] = ''

    import re as _re
    html_sources = [login_data.get('edit_html'), login_data.get('list_html')]
    for src in html_sources:
        if not src: continue
        # 从 HTML 提取 all hidden input fields 作为默认值
        for hidden in _re.finditer(r'<input[^>]*type="hidden"[^>]*>', src):
            name_m = _re.search(r'name="([^"]+)"', hidden.group())
            value_m = _re.search(r'value="([^"]*)"', hidden.group())
            if name_m and name_m.group(1) not in data:
                data[name_m.group(1)] = value_m.group(1) if value_m else ''
        # 也提取 Leave1$LeaveDay 和 Leave1$LeaveHour
        for inp in _re.finditer(r'<input[^>]*id="Leave1_(LeaveDay|LeaveHour)"[^>]*>', src):
            name_m = _re.search(r'name="([^"]+)"', inp.group())
            value_m = _re.search(r'value="([^"]*)"', inp.group())
            if name_m and name_m.group(1) not in data:
                data[name_m.group(1)] = value_m.group(1) if value_m else '0'

    # 从 form_fields 中取的日期范围，确保 ASP.NET 验证通过
    # ASP.NET JS 的 getDateDiff() 用这两个 hidden 字段判断日期是否在节假日范围内
    # 用常量值硬编码（从 HAR 抓取的实际成功提交值）
    if 'Leave1$LeaveBeginDate2' not in data:
        data['Leave1$LeaveBeginDate2'] = '2026-06-25'
    if 'Leave1$LeaveEndDate2' not in data:
        data['Leave1$LeaveEndDate2'] = '2026-08-30'
    # 强制设置 LeaveDay 和 LeaveHour
    if 'Leave1$LeaveDay' not in data:
        data['Leave1$LeaveDay'] = '0'
    if 'Leave1$LeaveHour' not in data:
        data['Leave1$LeaveHour'] = '0'

    # 添加 ASP.NET 必需的 VIEWSTATE 等字段
    data['__VIEWSTATE'] = login_data.get('edit_viewstate', login_data.get('list_viewstate', ''))
    data['__VIEWSTATEGENERATOR'] = login_data.get('edit_viewstategenerator', login_data.get('list_viewstategenerator', ''))
    data['__VIEWSTATEENCRYPTED'] = ''
    data['__EVENTVALIDATION'] = login_data.get('edit_eventvalidation', login_data.get('list_eventvalidation', ''))
    data['__SCROLLPOSITIONX'] = '0'
    data['__SCROLLPOSITIONY'] = '0'

    # 转义：'Leave1$JHRName' 中的中文等需要 GBK 编码，但 form_fields 里可能已经包含了
    # 直接从页面 HTML 提取 area 字段默认值
    for src in html_sources:
        if not src: continue
        for area_sel in ['CTAreaBox1_ProvinceHid', 'CTAreaBox1_CityHid', 'CTAreaBox1_AreaHid',
                          'CTAreaBox1_ProvinceDdl', 'CTAreaBox1_CityDdl', 'CTAreaBox1_AreaDdl',
                          'CTAreaBox1_C1', 'CTAreaBox1_C2', 'CTAreaBox1_C3', 'CTAreaBox1_AreaData']:
            field = f'Leave1${area_sel}'
            if field not in data:
                m = _re.search(rf'name="{_re.escape(field)}"[^>]*value="([^"]*)"', src)
                if m:
                    data[field] = m.group(1)

    try:
        resp = login_data['session'].post(
            f'{BASE}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add',
            data=_gbk_form(data),
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=15)
        text = resp.text
    except Exception as e:
        return False, f'提交失败: {str(e)}'

    if '保存成功' in text or '提交成功' in text:
        return True, '提交成功'
    alert = re.search(r"alert\(['\x22]([^'\x22]+)['\x22]\)", text)
    if alert:
        return False, alert.group(1)
    return True, '已提交'


if __name__ == '__main__':
    u = input("学号：")
    p = input("密码：")
    r = login_and_get_list(u, p)
    print(f"{'✅' if r['success'] else '❌'} {r.get('message', '')}")
    if r['success']:
        print(f"  节假日: {r['holiday_name']} [{r['status']}]")
        print(f"  记录: {r['record_count']} 条")
        for rec in r['records'][:3]:
            print(f"    {rec['holiday']} | {rec['leave_type']} | {rec['destination']}")
