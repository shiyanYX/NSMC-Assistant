"""
xg2 学工系统（xg2.nsmc.edu.cn）登录 + 节假日去向登记
"""
import re, random, base64, threading
import requests, urllib3

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    s.verify = False
    return s


# ====== RSA 加密（与 xg2 JS 实现一致） ======


def _encrypted_string(username, password, modulus_hex):
    """
    RSA 加密。与 JS RSA.js 兼容：
    base64(user) + '\\' + base64(pass) → PKCS#1 v1.5 填充 → pow_mod → hex(256)
    """
    raw = base64.b64encode(username.encode()).decode() + '\\' + base64.b64encode(password.encode()).decode()
    rb = raw.encode('ascii')

    ds = 128  # 1024-bit RSA = 128 bytes
    ml = len(rb)
    ps = max(8, ds - 3 - ml)

    b = bytearray(ds)
    for x in range(ml):
        b[x] = rb[ml - 1 - x]  # 消息逆序
    b[ml] = 0  # 分隔
    for x in range(ps):
        b[ml + 1 + x] = random.randint(1, 255)  # 随机非零填充
    b[ds - 2] = 2
    b[ds - 1] = 0

    m_int = int.from_bytes(b, 'little')
    c = pow(m_int, 0x010001, int(modulus_hex, 16))
    return hex(c)[2:].zfill(256)


def _extract_aspnet_fields(html):
    fields = {}
    for name in ('__VIEWSTATE', '__EVENTVALIDATION', '__VIEWSTATEGENERATOR'):
        m = re.search(rf'{re.escape(name)}[^>]*value="([^"]*)"', html)
        if m:
            fields[name] = m.group(1)
    return fields


def _extract_span_text(html, span_id):
    m = re.search(rf'<span[^>]*id="{re.escape(span_id)}"[^>]*>([^<]*)</span>', html)
    return m.group(1).strip() if m else ''


# ====== 公开 API ======

def login_and_get_form(username, password):
    """登录 xg2 + 获取节假日去向登记表"""
    session = _make_session()

    # 1. GET 登录页 → 提取 RSA 公钥 + VIEWSTATE
    try:
        resp = session.get(f'{BASE}/UserLogin.aspx',
                           headers={'Referer': 'https://xg2.nsmc.edu.cn/'}, timeout=15)
        html = resp.text
    except Exception as e:
        return {'success': False, 'message': f'无法访问 xg2: {str(e)}'}

    m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', html)
    if not m:
        return {'success': False, 'message': '未能获取 RSA 公钥'}
    modulus_hex = m.group(3)
    fields = _extract_aspnet_fields(html)

    # 2. 生成验证码 + RSA 加密
    captcha = ''.join(random.choice(CAPTCHA_CHARS) for _ in range(4))
    encrypted = _encrypted_string(username, password, modulus_hex)

    # 3. POST 登录
    form_data = {
        '__LASTFOCUS': '',
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': fields.get('__VIEWSTATE', ''),
        '__VIEWSTATEGENERATOR': fields.get('__VIEWSTATEGENERATOR', ''),
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': fields.get('__EVENTVALIDATION', ''),
        'UserName': '******',
        'posx': encrypted,
        'codeInput': captcha,
        'queryBtn': '登          录',
    }

    from urllib.parse import quote_plus
    body = '&'.join(f"{quote_plus(k.encode('gb2312'))}={quote_plus(v.encode('gb2312'))}" for k, v in form_data.items())

    resp = session.post(f'{BASE}/UserLogin.aspx', data=body,
        headers={
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'https://xg2.nsmc.edu.cn/',
            'Origin': 'https://xg2.nsmc.edu.cn',
        }, timeout=15)
    html = resp.text

    # 调试：检查所有响应 cookie
    cookie_dict = session.cookies.get_dict()
    import os as _os
    dbg_path = _os.path.join(_os.path.dirname(__file__) or '.', 'xg2_cookies.txt')
    with open(dbg_path, 'w') as _f:
        _f.write(str(cookie_dict))
    # 检查 encrypt 是否与 diagnose 方法一致
    dbg2_path = _os.path.join(_os.path.dirname(__file__) or '.', 'xg2_enc_debug.txt')
    with open(dbg2_path, 'w') as _f:
        _f.write(f'encrypted={encrypted}\ncaptcha={captcha}\n')

    # 调试：检查 POST 后的 cookie
    cookie_dict = session.cookies.get_dict()
    import os as _os
    with open(_os.path.join(_os.path.dirname(__file__) or '.', 'xg2_cookies.txt'), 'w') as _f:
        _f.write(str(cookie_dict))

    # 4. 检查登录结果
    cookie_dict = session.cookies.get_dict()
    is_authenticated = 'CenterSoft' in cookie_dict and 'code' in cookie_dict

    if not is_authenticated:
        alert = re.search(r"alert\(['\"]([^'\"]+)['\"]\)", html)
        return {'success': False, 'message': alert.group(1) if alert else 'xg2 登录失败'}

    # 5. 获取节假日去向编辑页
    try:
        edit_resp = session.get(f'{BASE}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add', timeout=15)
        edit_html = edit_resp.text
    except Exception as e:
        return {'success': False, 'message': f'获取登记表失败: {str(e)}'}

    edit_fields = _extract_aspnet_fields(edit_html)

    result = {
        'success': True,
        'username': username,
        'student_name': _extract_span_text(edit_html, 'Leave1_UserName') or '',
        'holiday_name': _extract_span_text(edit_html, 'LeaveNoHomeConfig1_HolidayName') or '',
        'begin_date': _extract_span_text(edit_html, 'LeaveNoHomeConfig1_BeginDate') or '',
        'end_date': _extract_span_text(edit_html, 'LeaveNoHomeConfig1_EndDate') or '',
        'leave_begin_date': _extract_span_text(edit_html, 'LeaveNoHomeConfig1_LeaveBeginDate') or '',
        'leave_end_date': _extract_span_text(edit_html, 'LeaveNoHomeConfig1_LeaveEndDate') or '',
        'memo': _extract_span_text(edit_html, 'LeaveNoHomeConfig1_Memo') or '',
    }

    # 缓存 session 供提交使用
    with _cache_lock:
        LOGIN_DATA_CACHE[username] = {
            'session': session,
            'edit_viewstate': edit_fields.get('__VIEWSTATE', ''),
            'edit_eventvalidation': edit_fields.get('__EVENTVALIDATION', ''),
            'edit_viewstategenerator': edit_fields.get('__VIEWSTATEGENERATOR', ''),
        }

    return result


def submit_leave(username, form_fields):
    """提交去向登记（复用 session）"""
    with _cache_lock:
        login_data = LOGIN_DATA_CACHE.pop(username, None)

    if not login_data:
        return False, '登录信息已过期'

    data = {
        '__VIEWSTATE': login_data['edit_viewstate'],
        '__VIEWSTATEGENERATOR': login_data['edit_viewstategenerator'],
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': login_data['edit_eventvalidation'],
        '__EVENTTARGET': '', '__EVENTARGUMENT': '',
        '__SCROLLPOSITIONX': '0', '__SCROLLPOSITIONY': '0',
    }
    data.update(form_fields)

    from urllib.parse import quote_plus
    body = '&'.join(f"{quote_plus(k.encode('gb2312'))}={quote_plus(v.encode('gb2312'))}" for k, v in data.items())

    try:
        resp = login_data['session'].post(
            f'{BASE}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add',
            data=body,
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
    r = login_and_get_form(u, p)
    print(f"{'✅' if r['success'] else '❌'} {r.get('message', '')}")
    if r['success']:
        print(f"  {r['holiday_name']} — {r['student_name']}")
