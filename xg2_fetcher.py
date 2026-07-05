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


# ====== RSA 加密（与 xg2 JS 实现完全一致） ======

def _bi_from_hex(hex_str):
    """模拟 JS biFromHex：将 hex 解析成数字数组（每个元素 0-15）"""
    digits = []
    for c in hex_str:
        v = int(c, 16)
        if v == 0 and not digits:
            continue  # JS 中跳过前导 0
        digits.append(v)
    return digits or [0]


def _bi_high_index(digits):
    """模拟 JS biHighIndex"""
    i = len(digits) - 1
    while i > 0 and digits[i] == 0:
        i -= 1
    return i


def _encrypted_string(username, password, modulus_hex):
    """
    完整模拟 JS RSA.js 的 encryptedString。
    使用 Python 大整数运算。
    """
    # 1. 构建明文：base64(user) + "\\" + base64(pass)
    raw = base64.b64encode(username.encode()).decode() + '\\' + base64.b64encode(password.encode()).decode()
    msg_bytes = raw.encode('ascii')
    msg_len = len(msg_bytes)

    # 2. 计算 digitSize 和 chunkSize（同 JS 逻辑）
    m_digits = _bi_from_hex(modulus_hex)
    bi_high = _bi_high_index(m_digits)
    digit_size = 2 * bi_high + 2  # = 128 for 1024-bit key

    # 3. 填充消息（PKCS#1 v1.5 type 02，消息逆序）
    padded_size = max(8, digit_size - 3 - msg_len)
    b = bytearray(digit_size)
    # 消息字节逆序
    for x in range(msg_len):
        b[x] = msg_bytes[msg_len - 1 - x]
    b[msg_len] = 0  # 分隔符
    for x in range(padded_size):
        b[msg_len + 1 + x] = random.randint(1, 255)  # 随机非零
    b[digit_size - 2] = 2  # 标记
    b[digit_size - 1] = 0  # 标记

    # 4. digits 映射（同 JS block.digits[j] = b[k++] + (b[k++]<<8)）
    # 即：block.digits[j] 是 b[2j] + (b[2j+1] << 8)，即小端字节对组织
    # 所以整数 = sum(b[i] * 256^i) = int.from_bytes(b, 'little')
    m_int = int.from_bytes(b, 'little')

    # 5. RSA 计算 c = m^e mod n
    n = int(modulus_hex, 16)
    e = 0x010001
    c = pow(m_int, e, n)

    # 6. 输出 hex（同 JS biToHex）
    hex_str = hex(c)[2:]
    # 补满到 256 hex 字符（128 字节）
    return hex_str.zfill(256)


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

    # 手动编码所有字段到 GB2312（因为 queryBtn 含中文）
    from urllib.parse import quote_plus
    body = '&'.join(f"{quote_plus(k.encode('gb2312'))}={quote_plus(v.encode('gb2312'))}" for k, v in form_data.items())

    try:
        resp = session.post(f'{BASE}/UserLogin.aspx', data=body,
            headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://xg2.nsmc.edu.cn/',
                'Origin': 'https://xg2.nsmc.edu.cn',
            }, timeout=15)
        html = resp.text
    except Exception as e:
        return {'success': False, 'message': f'登录请求失败: {str(e)}'}

    # 4. 检查登录结果
    # 成功标志：服务器设置 CenterSoft 和 code Cookie
    # 即使弹出密码强度提示（checkPass），会话也已生效
    resp_cookies = {c.name: c.value for c in session.cookies}
    is_authenticated = 'CenterSoft' in resp_cookies and 'code' in resp_cookies

    if not is_authenticated:
        alert = re.search(r"alert\(['\"]([^'\"]+)['\"]\)", html)
        return {'success': False, 'message': alert.group(1) if alert else 'xg2 登录失败'}

    # 如果弹出了密码强度提示，自动处理：点击确定按钮并重定向到 UserLogin.aspx
    if 'checkPass' in html or '密码强度过低' in html:
        # 密码强度提示意味着已登录，只是需要修改密码
        # 对话框点击"确定"后会打开 ChangePass.aspx 子窗口
        # 我们跳过密码修改，直接访问目标页面
        pass

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
