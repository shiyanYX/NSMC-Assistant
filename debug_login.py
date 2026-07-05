"""xg2 login debug - 请填入真实账号密码后运行"""
import requests, urllib3, re, random
urllib3.disable_warnings()

USERNAME = "请替换为真实学号"
PASSWORD = "请替换为真实密码"

# 模拟浏览器完整请求
s = requests.Session()
s.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
})
s.verify = False

# 1. GET 登录页
r1 = s.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', timeout=15)
html = r1.text
print(f'[1] GET {r1.status_code} len={len(html)}')
print(f'    Cookies: {dict(s.cookies)}')

# 2. 提取公钥+隐藏字段
m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', html)
modulus = m.group(3) if m else 'NOT_FOUND'
print(f'[2] RSA modulus len={len(modulus)}: {modulus[:40]}...')

def get_val(name):
    p = rf'name="{re.escape(name)}"[^>]*value="([^"]*)"'
    x = re.search(p, html)
    return x.group(1) if x else ''

# 用浏览器式方法提取所有字段
form_fields = {
    '__LASTFOCUS': '',
    '__EVENTTARGET': '',
    '__EVENTARGUMENT': '',
    '__VIEWSTATE': get_val('__VIEWSTATE'),
    '__VIEWSTATEGENERATOR': get_val('__VIEWSTATEGENERATOR'),
    '__VIEWSTATEENCRYPTED': get_val('__VIEWSTATEENCRYPTED'),
    '__EVENTVALIDATION': get_val('__EVENTVALIDATION'),
}
print(f'[3] VIEWSTATE len={len(form_fields["__VIEWSTATE"])}')
print(f'    EVENTVALIDATION len={len(form_fields["__EVENTVALIDATION"])}')
print(f'    VIEWSTATEGEN={form_fields["__VIEWSTATEGENERATOR"][:20]}')

# 3. RSA 加密
import base64 as b64
raw = b64.b64encode(USERNAME.encode()).decode() + '\\' + b64.b64encode(PASSWORD.encode()).decode()
raw_bytes = raw.encode()
print(f'[4] RSA plaintext ({len(raw_bytes)} bytes): {raw_bytes[:20]}...\\...{raw_bytes[-10:]}')

n = int(modulus, 16); e = 0x010001; digit_size = 128
msg_len = len(raw_bytes); padded_size = max(8, digit_size - 3 - msg_len)
b = bytearray(digit_size)
for x in range(msg_len): b[x] = raw_bytes[msg_len - 1 - x]
b[msg_len] = 0
for x in range(padded_size): b[msg_len + 1 + x] = random.randint(1, 255)
b[digit_size - 2] = 2; b[digit_size - 1] = 0
m_int = int.from_bytes(b, 'little')
encrypted = hex(pow(m_int, e, n))[2:]
print(f'[5] RSA output hex len={len(encrypted)}')

# 4. 生成验证码
cap = ''.join(random.choice(['2','3','4','5','6','7','8','9','b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z','B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z']) for _ in range(4))
form_fields.update({
    'UserName': '******',
    'posx': encrypted,
    'codeInput': cap,
    'queryBtn': '登          录',
})
print(f'[6] Captcha: {cap}')

# 5. 方法A: POST 用 dict（requests 自动 UTF-8 编码）
print('\n[7A] POST with dict (UTF-8 encoding)...')
rA = s.post('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', data=form_fields, timeout=15)
hA = rA.text
if 'Navigation.aspx' in hA:
    print('  ✅ UTF-8 encoding WORKS!')
elif re.search(r"alert\(['\"]([^'\"]+)['\"]\)", hA):
    print('  ❌ Server alert:', re.search(r"alert\(['\"]([^'\"]+)['\"]\)", hA).group(1))
else:
    print(f'  ❌ Failed. len={len(hA)}')

# 6. 方法B: 重新 GET（新 session）→ GB2312 编码 POST
print('\n[7B] Fresh session with GB2312 encoded body...')
s2 = requests.Session()
s2.headers.update(s.headers)
s2.verify = False
r2 = s2.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', timeout=15)
html2 = r2.text

m2 = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', html2)
mod2 = m2.group(3) if m2 else ''

enc2 = hex(pow(int.from_bytes(b, 'little'), e, int(mod2, 16)))[2:]  # reuse same padding
cap2 = ''.join(random.choice(['2','3','4','5','6','7','8','9','b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z','B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z']) for _ in range(4))

fd2 = {
    '__LASTFOCUS': '', '__EVENTTARGET': '', '__EVENTARGUMENT': '',
    '__VIEWSTATE': get_val('__VIEWSTATE') if False else re.search(r'__VIEWSTATE[^>]*value="([^"]*)"', html2).group(1) if re.search(r'__VIEWSTATE[^>]*value="([^"]*)"', html2) else '',
    '__VIEWSTATEGENERATOR': re.search(r'__VIEWSTATEGENERATOR[^>]*value="([^"]*)"', html2).group(1) if re.search(r'__VIEWSTATEGENERATOR[^>]*value="([^"]*)"', html2) else '',
    '__VIEWSTATEENCRYPTED': '',
    '__EVENTVALIDATION': re.search(r'__EVENTVALIDATION[^>]*value="([^"]*)"', html2).group(1) if re.search(r'__EVENTVALIDATION[^>]*value="([^"]*)"', html2) else '',
    'UserName': '******', 'posx': enc2, 'codeInput': cap2,
    'queryBtn': '登          录',
}

import urllib.parse
body_parts = []
for k, v in fd2.items():
    body_parts.append(f"{urllib.parse.quote_from_bytes(k.encode('gb2312'))}={urllib.parse.quote_from_bytes(v.encode('gb2312'))}")
body_str = '&'.join(body_parts)

rB = s2.post('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', data=body_str,
             headers={'Content-Type': 'application/x-www-form-urlencoded'}, timeout=15)
hB = rB.text
if 'Navigation.aspx' in hB:
    print('  ✅ GB2312 encoding WORKS!')
elif re.search(r"alert\(['\"]([^'\"]+)['\"]\)", hB):
    print('  ❌ Server alert:', re.search(r"alert\(['\"]([^'\"]+)['\"]\)", hB).group(1))
else:
    print(f'  ❌ Failed. len={len(hB)}')
    with open('xg2_debug_fail.html', 'w', encoding='utf-8') as f:
        f.write(hB)
    print('  Saved to xg2_debug_fail.html')
    # Print context around error keywords
    for kw in ['失败', '错误', 'alert', 'error', 'Exception']:
        if kw in hB:
            idx = hB.lower().index(kw.lower())
            print(f'  Found "{kw}" at {idx}: ...{hB[max(0,idx-40):idx+80]}...')

# 7. 方法C: 只 POST queryBtn 看响应（验证是否真的触发了 ASP.NET 事件）
print('\n[7C] Minimal POST to check ASP.NET button handling...')
s3 = requests.Session()
s3.headers.update(s.headers)
s3.verify = False
s3.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', timeout=10)
minimal = urllib.parse.urlencode({'queryBtn': '登          录'})
rC = s3.post('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', data=minimal,
             headers={'Content-Type': 'application/x-www-form-urlencoded'}, timeout=10)
print(f'  Status: {rC.status_code}, len={len(rC.text)}')
# If we get the login page back (with queryBtn), ASP.NET is processing the button click
if 'queryBtn' in rC.text:
    print('  Still on login page (expected without VIEWSTATE)')
print()
print('=== Summary ===')
print('If both method A and B fail with the same error message,')
print('the issue is likely with RSA encryption or credentials.')
print('If method B works but A fails, it is an encoding issue.')
print('If method A works but B fails, something is wrong with GB2312 encoding.')
