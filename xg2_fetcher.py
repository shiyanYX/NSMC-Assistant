"""
xg2 学工系统（xg2.nsmc.edu.cn）登录 + 节假日去向登记

核心难点：
  1. RSA 加密（JS 自定义 PKCS#1 v1.5 padding，消息字节逆序）
  2. 验证码全程客户端生成，无需 OCR
  3. ASP.NET WebForms __VIEWSTATE 机制
  4. 登录后 session 通过 Cookie 维持
"""
import re
import random
import requests
import urllib3

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


def generate_captcha():
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
        (r'id="__VIEWSTATE"[^>]*value="([^"]*)"', '__VIEWSTATE'),
        (r'id="__EVENTVALIDATION"[^>]*value="([^"]*)"', '__EVENTVALIDATION'),
        (r'id="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"', '__VIEWSTATEGENERATOR'),
    ]
    for pattern, key in patterns:
        m = re.search(pattern, html)
        if m:
            fields[key] = m.group(1)
    return fields


def _extract_rsa_modulus(html):
    """从登录页面 HTML 中提取 RSA 模数（每次不同）"""
    # 查找 cmdEncrypt() 中的 new RSAKeyPair 调用
    m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', html)
    if m:
        return m.group(3)  # modulus 是第三个参数
    return None


# ====== 公开 API ======

def prepare_login():
    """
    第 1 步：访问登录页，提取 RSA 公钥 + ASP.NET 隐藏字段，生成验证码。
    返回 dict:
      - captcha: 验证码文字（前端展示用）
      - viewstate/hid: ASP.NET 隐藏字段
      - rsa_modulus: RSA 模数（hex）
    """
    session = _make_session()
    resp = session.get(f'{BASE}/UserLogin.aspx', timeout=15)
    html = resp.text

    fields = _extract_aspnet_fields(html)
    modulus = _extract_rsa_modulus(html)
    captcha = generate_captcha()

    return {
        'captcha': captcha,
        'viewstate': fields.get('__VIEWSTATE', ''),
        'eventvalidation': fields.get('__EVENTVALIDATION', ''),
        'viewstategenerator': fields.get('__VIEWSTATEGENERATOR', ''),
        'rsa_modulus': modulus or '',
    }


def do_login(username, password, captcha, viewstate, eventvalidation, viewstategenerator, rsa_modulus, session=None):
    """
    第 2 步：执行登录 POST，成功返回 session。
    返回 (success, session, error_msg)
    """
    if not session:
        session = _make_session()

    # 先 GET 一次初始化 cookie
    session.get(f'{BASE}/UserLogin.aspx', timeout=15)

    # RSA 加密凭证
    encrypted = _rsa_encrypt(username, password, rsa_modulus)

    form_data = {
        '__LASTFOCUS': '',
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': viewstategenerator,
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': eventvalidation,
        'UserName': '******',
        'posx': encrypted,
        'codeInput': captcha,
        'queryBtn': '登          录',
    }

    resp = session.post(f'{BASE}/UserLogin.aspx', data=form_data, timeout=15)

    # 登录成功标志：响应中包含 Navigation.aspx 的跳转或非登录页内容
    if 'Navigation.aspx' in resp.text or 'MainFrame.aspx' in resp.text:
        return True, session, None

    # 尝试找错误信息
    msg_match = re.search(r'alert\([\'"]([^\'"]+)[\'"]\)', resp.text)
    if msg_match:
        return False, session, msg_match.group(1)

    return False, session, '登录失败，请检查学号、密码或验证码'


def get_leave_form(session):
    """
    第 3 步：获取节假日去向编辑页面。
    返回 dict:
      - holiday_name: 节假日名称
      - begin_date / end_date: 放假起止
      - leave_begin_date / leave_end_date: 登记起止
      - memo: 备注
      - viewstate / eventvalidation: 提交时需要的隐藏字段
      - student_name: 学生姓名
      - edit_url: 编辑页完整 URL
    """
    edit_url = f'{BASE}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add'
    resp = session.get(edit_url, timeout=15)
    html = resp.text

    fields = _extract_aspnet_fields(html)

    # 提取节假日信息
    holiday_name = _extract_span_text(html, 'LeaveNoHomeConfig1_HolidayName')
    begin_date = _extract_span_text(html, 'LeaveNoHomeConfig1_BeginDate')
    end_date = _extract_span_text(html, 'LeaveNoHomeConfig1_EndDate')
    leave_begin = _extract_span_text(html, 'LeaveNoHomeConfig1_LeaveBeginDate')
    leave_end = _extract_span_text(html, 'LeaveNoHomeConfig1_LeaveEndDate')
    memo = _extract_span_text(html, 'LeaveNoHomeConfig1_Memo')
    student_name = _extract_span_text(html, 'Leave1_UserName')

    return {
        'holiday_name': holiday_name or '',
        'begin_date': begin_date or '',
        'end_date': end_date or '',
        'leave_begin_date': leave_begin or '',
        'leave_end_date': leave_end or '',
        'memo': memo or '',
        'student_name': student_name or '',
        'viewstate': fields.get('__VIEWSTATE', ''),
        'eventvalidation': fields.get('__EVENTVALIDATION', ''),
        'viewstategenerator': fields.get('__VIEWSTATEGENERATOR', ''),
        'edit_url': edit_url,
    }


def submit_leave(session, form_fields, viewstate, eventvalidation, viewstategenerator):
    """
    第 4 步：提交去向登记表单。
    form_fields 示例：
    {
        'Leave1$LeaveBeginDate': '2026-07-01',
        'Leave1$LeaveBeginTime': '08',
        'Leave1$LeaveEndDate': '2026-07-20',
        'Leave1$LeaveEndTime': '18',
        'Leave1$LeaveType': '02045003',  # 返家
        'Leave1$LeaveThing': '暑假回家',
        'Leave1$CTAreaBox1_ProvinceHid': '510000',  # 四川
        'Leave1$CTAreaBox1_CityHid': '510100',      # 成都
        'Leave1$OutAddress': '详细地址',
        'Leave1$IsTellRbl': '1',  # 已告知家长
        'Leave1$WithNumNo': '0',
        'Leave1$JHRName': '家长姓名',
        'Leave1$JHRPhone': '13800138000',
        'Leave1$OutTel': '',
        'Leave1$OutMoveTel': '13900139000',
        'Leave1$Relation': '父子',
        'Leave1$OutName': '联系人姓名',
        'Leave1$StuMoveTel': '13700137000',
        'Leave1$StuOtherTel': '',
        'Leave1$GoDate': '2026-07-01',
        'Leave1$GoTime': '08',
        'Leave1$GoVehicle': '火车',
        'Leave1$BackDate': '2026-08-28',
        'Leave1$BackTime': '12',
        'Leave1$BackVehicle': '火车',
    }
    """
    data = {
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': viewstategenerator,
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': eventvalidation,
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__SCROLLPOSITIONX': '0',
        '__SCROLLPOSITIONY': '0',
    }
    data.update(form_fields)

    # 提交 URL（与编辑页相同）
    edit_url = f'{BASE}/SystemForm/Leave/StuLeave_Edit.aspx?Status=Add'

    resp = session.post(edit_url, data=data, timeout=15)
    text = resp.text

    # 通过响应判断成功
    if '保存成功' in text or '提交成功' in text:
        return True, '提交成功'
    # 尝试提取错误
    msg_match = re.search(r"alert\(['\x22]([^'\x22]+)['\x22]\)", text)
    if msg_match:
        return False, msg_match.group(1)
    return True, '已提交（请确认）'


def _extract_span_text(html, span_id):
    """提取 <span id="xxx">内容</span>"""
    m = re.search(rf'<span[^>]*id="{re.escape(span_id)}"[^>]*>([^<]*)</span>', html)
    if m:
        return m.group(1).strip()
    return ''



# ====== CLI 测试 ======
if __name__ == '__main__':
    import json

    print("=== xg2 节假日去向登记 测试 ===")

    # 1. 准备
    print("\n[1] 准备登录...")
    prep = prepare_login()
    print(f"  验证码: {prep['captcha']}")
    print(f"  RSA Modulus: {prep['rsa_modulus'][:40]}...")
    print(f"  VIEWSTATE 长度: {len(prep.get('viewstate', ''))}")

    # 手动输入验证码（测试用）
    captcha = input(f"  请输入验证码 [{prep['captcha']}]：") or prep['captcha']

    username = input("  学号：")
    password = input("  密码：")

    # 2. 登录
    print("\n[2] 登录 xg2...")
    ok, sess, err = do_login(
        username, password, captcha,
        prep['viewstate'], prep['eventvalidation'],
        prep.get('viewstategenerator', ''), prep['rsa_modulus']
    )
    if not ok:
        print(f"  ❌ 登录失败: {err}")
        exit(1)
    print("  ✅ 登录成功")

    # 3. 获取表单
    print("\n[3] 获取去向编辑表单...")
    form = get_leave_form(sess)
    print(f"  节假日: {form['holiday_name']}")
    print(f"  起止: {form['begin_date']} ~ {form['end_date']}")
    print(f"  学生: {form['student_name']}")
    print(f"  VIEWSTATE 长度: {len(form.get('viewstate', ''))}")

    print("\n✅ 测试通过")
