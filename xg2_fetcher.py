"""
xg2 学工系统（xg2.nsmc.edu.cn）登录 + 节假日去向登记

核心难点：
  1. RSA 加密（JS 自定义 PKCS#1 v1.5 padding，消息字节逆序）
  2. 验证码全程客户端生成，无服务端校验，后端可自动填充
  3. ASP.NET WebForms __VIEWSTATE 机制
  4. 登录后 session 通过 Cookie 维持
"""
import re
import random
import requests
import urllib3
from urllib.parse import urlencode

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE = 'https://xg2.nsmc.edu.cn/Sys'

# 验证码字符集（与 login.js 完全一致）
CAPTCHA_CHARS = [
    '2', '3', '4', '5', '6', '7', '8', '9',
    'b', 'c', 'e', 'f', 'g', 'h', 'j', 'k', 'm', 'n', 'p', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    'B', 'C', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'N', 'P', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
]


def _make_session():
    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'
    })
    s.verify = False
    return s


def _generate_captcha():
    """生成 4 位验证码文字（与 login.js 一致）"""
    return ''.join(random.choice(CAPTCHA_CHARS) for _ in range(4))


def _build_rsa_padded(msg_bytes, digit_size):
    """
    模拟 JS RSA.js encryptedString 的填充方式。
    布局：消息字节（逆序）|| 0x00 || 随机非零字节 >= 8 || 0x02 || 0x00
    总长 = digit_size
    """
    msg_len = len(msg_bytes)
    padded_size = max(8, digit_size - 3 - msg_len)

    b = bytearray(digit_size)
    # 消息字节逆序放入开头
    for x in range(msg_len):
        b[x] = msg_bytes[msg_len - 1 - x]
    # 分隔标记
    b[msg_len] = 0
    # 随机填充 [1, 255]
    for x in range(padded_size):
        b[msg_len + 1 + x] = random.randint(1, 255)
    # 尾部标记
    b[digit_size - 2] = 2
    b[digit_size - 1] = 0
    return bytes(b)


def _rsa_encrypt(username, password, modulus_hex):
    """
    RSA 加密用户名+密码。
    加密内容 = base64(username) + "\\" + base64(password)
    返回 hex 字符串（与 JS 的 encryptedString 一致）
    """
    import base64 as b64

    raw = b64.b64encode(username.encode('utf-8')).decode('ascii') \
          + '\\' \
          + b64.b64encode(password.encode('utf-8')).decode('ascii')

    raw_bytes = raw.encode('ascii')

    # 密钥信息（1024-bit RSA）
    n = int(modulus_hex, 16)
    e = 0x010001

    # digit_size = 128（对应 1024-bit，每个 digit 16 位，即 64 digits，digitSize=2*63+2=128）
    digit_size = 128
    padded = _build_rsa_padded(raw_bytes, digit_size)

    # 将 little-endian 字节数组转为整数
    m = int.from_bytes(padded, 'little')

    # RSA 加密：c = m^e mod n
    c = pow(m, e, n)

    # 转为 hex
    hex_str = hex(c)[2:]
    return hex_str


def _extract_aspnet_fields(html):
    """从 ASP.NET 页面提取隐藏字段"""
    fields = {}
    patterns = [
        (r'name="__VIEWSTATE"[^>]*value="([^"]*)"', '__VIEWSTATE'),
        (r'name="__EVENTVALIDATION"[^>]*value="([^"]*)"', '__EVENTVALIDATION'),
        (r'name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"', '__VIEWSTATEGENERATOR'),
    ]
    for pattern, key in patterns:
        m = re.search(pattern, html)
        if m:
            fields[key] = m.group(1)
    return fields


def _extract_rsa_modulus(html):
    """从登录页面 HTML 中提取 RSA 模数（每次不同）"""
    m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', html)
    if m:
        return m.group(3)  # modulus 是第三个参数
    return None


def _extract_span_text(html, span_id):
    """提取 <span id="xxx">内容</span>"""
    m = re.search(rf'<span[^>]*id="{re.escape(span_id)}"[^>]*>([^<]*)</span>', html)
    if m:
        return m.group(1).strip()
    return ''


def _gbk_form_body(form_dict):
    """
    ASP.NET 页面是 gb2312 编码，按钮值含中文。
    requests 默认用 UTF-8 编码 POST body，会导致服务器不认。
    需要手动用 GB2312 编码每个字段值。
    """
    import urllib.parse
    parts = []
    for key, value in form_dict.items():
        # 对 key 和 value 分别用 gb2312 编码后 percent-encode
        key_q = urllib.parse.quote_from_bytes(key.encode('gb2312'))
        val_q = urllib.parse.quote_from_bytes(value.encode('gb2312'))
        parts.append(f'{key_q}={val_q}')
    return '&'.join(parts)


# ====== 公开 API ======
# 验证码纯客户端生成、服务端不校验，后端直接自动生成并填好，前端无需用户输入

LOGIN_DATA_CACHE = {}


def login_and_get_form(username, password):
    """
    完整流程：登录 xg2 → 获取节假日去向登记表。

    返回 dict:
      - success: bool
      - 成功时：holiday_name, begin_date, end_date, leave_begin_date, leave_end_date,
                 memo, student_name, login_data（提交时需传回）
      - 失败时：message
    """
    session = _make_session()

    # 1. GET 登录页 → 获取 RSA 公钥 + VIEWSTATE
    try:
        resp = session.get(f'{BASE}/UserLogin.aspx', timeout=15)
        html = resp.text
    except Exception as e:
        return {'success': False, 'message': f'无法访问 xg2 登录页: {str(e)}'}

    modulus = _extract_rsa_modulus(html)
    fields = _extract_aspnet_fields(html)

    if not modulus:
        return {'success': False, 'message': '未能获取 RSA 公钥'}

    # 2. 自动生成验证码（服务端不校验，纯客户端 JS 行为）
    captcha = _generate_captcha()

    # 3. RSA 加密并 POST 登录（注意！页面是 gb2312 编码，表单需用 gb2312 编码）
    try:
        encrypted = _rsa_encrypt(username, password, modulus)

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

        body = _gbk_form_body(form_data)
        login_resp = session.post(
            f'{BASE}/UserLogin.aspx',
            data=body,
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=15
        )
        login_html = login_resp.text
    except Exception as e:
        return {'success': False, 'message': f'登录请求失败: {str(e)}'}

    # 检查登录是否成功
    if 'Navigation.aspx' not in login_html and 'MainFrame.aspx' not in login_html:
        msg_match = re.search(r"alert\(['\"]([^'\"]+)['\"]\)", login_html)
        err_msg = msg_match.group(1) if msg_match else 'xg2 登录失败，请检查学号和密码'
        return {'success': False, 'message': err_msg}

    # 4. 登录成功 → 获取节假日去向编辑页面
    try:
        edit_url = f'{BASE}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add'
        edit_resp = session.get(edit_url, timeout=15)
        edit_html = edit_resp.text
    except Exception as e:
        return {'success': False, 'message': f'获取去向登记表失败: {str(e)}'}

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

    # 缓存登录信息供后续提交使用
    import threading
    _cache_lock = threading.Lock()
    with _cache_lock:
        global LOGIN_DATA_CACHE
        LOGIN_DATA_CACHE[username] = {
            'session': session,
            'edit_viewstate': edit_fields.get('__VIEWSTATE', ''),
            'edit_eventvalidation': edit_fields.get('__EVENTVALIDATION', ''),
            'edit_viewstategenerator': edit_fields.get('__VIEWSTATEGENERATOR', ''),
        }

    return result


def submit_leave(username, form_fields):
    """
    提交去向登记（复用之前缓存的登录 session）。
    返回 (success, message)
    """
    import threading
    _cache_lock = threading.Lock()
    with _cache_lock:
        login_data = LOGIN_DATA_CACHE.pop(username, None)

    if not login_data:
        return False, '登录信息已过期，请重新登录'

    session = login_data['session']

    data = {
        '__VIEWSTATE': login_data['edit_viewstate'],
        '__VIEWSTATEGENERATOR': login_data['edit_viewstategenerator'],
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': login_data['edit_eventvalidation'],
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__SCROLLPOSITIONX': '0',
        '__SCROLLPOSITIONY': '0',
    }
    data.update(form_fields)

    try:
        edit_url = f'{BASE}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add'
        body = _gbk_form_body(data)
        resp = session.post(
            edit_url, data=body,
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=15
        )
        text = resp.text
    except Exception as e:
        return False, f'提交请求失败: {str(e)}'

    if '保存成功' in text or '提交成功' in text:
        return True, '提交成功'
    msg_match = re.search(r"alert\(['\x22]([^'\x22]+)['\x22]\)", text)
    if msg_match:
        return False, msg_match.group(1)
    return True, '已提交'


# ====== CLI 测试 ======
if __name__ == '__main__':
    username = input("学号：")
    password = input("密码：")

    print("\n[1] 登录 xg2...")
    result = login_and_get_form(username, password)
    if not result['success']:
        print(f"失败: {result['message']}")
        exit(1)

    print(f"✅ 登录成功")
    print(f"  节假日: {result['holiday_name']}")
    print(f"  起止: {result['begin_date']} ~ {result['end_date']}")
    print(f"  学生: {result['student_name']}")

    print("\n[2] 提交测试（空表单，实际应填充完整字段）...")
    ok, msg = submit_leave(username, {
        'Leave1$LeaveBeginDate': result['begin_date'],
        'Leave1$LeaveThing': '回家',
    })
    print(f"  {'✅' if ok else '❌'} {msg}")
