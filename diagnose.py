"""
一次性 xg2 登录诊断脚本
请在下方填入学号和密码，运行后把完整输出发给我
"""
import sys, re, random, base64, urllib.parse as up
import requests, urllib3
urllib3.disable_warnings()

# ====== 请填入真实 xg2 账号密码 ======
USER = "你的学号"
PASS = "你的密码"
# ====================================

s = requests.Session()
s.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
    'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9',
})
s.verify = False

# 1. GET 登录页
r1 = s.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx',
           headers={'Referer': 'https://xg2.nsmc.edu.cn/'}, timeout=15)
print(f'[1] GET /Sys/UserLogin.aspx -> {r1.status_code}, {len(r1.text)} bytes')
print(f'    Set-Cookie: {dict(s.cookies)}')
html = r1.text

# 2. 提取 RSA 公钥
m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', html)
if not m: print('FATAL: no RSA key'); sys.exit(1)
modulus = m.group(3); exponent = m.group(1)
print(f'[2] RSA modulus len={len(modulus)} exponent={exponent}')

# 3. 提取 form 字段
def gv(name):
    x = re.search(rf'{re.escape(name)}[^>]*value="([^"]*)"', html)
    return x.group(1) if x else ''
vs = gv('__VIEWSTATE'); ev = gv('__EVENTVALIDATION'); vsg = gv('__VIEWSTATEGENERATOR')
print(f'[3] VS={len(vs)}, EV={len(ev)}, VSG={vsg}')

# 4. RSA 加密 - 打印所有细节
raw = base64.b64encode(USER.encode()).decode() + '\\' + base64.b64encode(PASS.encode()).decode()
rb = raw.encode('ascii')
print(f'[4] raw plaintext: "{raw}" ({len(rb)} bytes)')
print(f'    raw hex: {rb.hex()}')

# 手工构建 PKCS1 块
digit_size = 128
ml = len(rb)
padded_size = max(8, digit_size - 3 - ml)

b = bytearray(digit_size)
for x in range(ml):
    b[x] = rb[ml - 1 - x]  # 逆序
b[ml] = 0
for x in range(padded_size):
    b[ml + 1 + x] = random.randint(1, 255)
b[digit_size - 2] = 2
b[digit_size - 1] = 0

print(f'[5] padded block ({len(b)} bytes): {b.hex()}')
n = int(modulus, 16); e_val = 0x010001
m_int = int.from_bytes(b, 'little')
print(f'    m_int bit_length={m_int.bit_length()}, n bit_length={n.bit_length()}')
print(f'    m_int < n: {m_int < n}')
if m_int >= n:
    print('    ⚠️  m_int >= n, RSA 不会正确工作!')

c = pow(m_int, e_val, n)
hex_c = hex(c)[2:].zfill(256)
print(f'[6] ciphertext hex ({len(hex_c)} chars): {hex_c[:50]}...')

# 5. POST 登录并查看完整响应
cap = ''.join(random.choice(['2','3','4','5','6','7','8','9','b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z','B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z']) for _ in range(4))

fd = {
    '__LASTFOCUS':'','__EVENTTARGET':'','__EVENTARGUMENT':'',
    '__VIEWSTATE':vs,'__VIEWSTATEGENERATOR':vsg,'__VIEWSTATEENCRYPTED':'',
    '__EVENTVALIDATION':ev,
    'UserName':'******','posx':hex_c,'codeInput':cap,
    'queryBtn':'登          录',
}

body = '&'.join(f"{up.quote_plus(k.encode('gb2312'))}={up.quote_plus(v.encode('gb2312'))}" for k,v in fd.items())

r2 = s.post('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', data=body,
    headers={
        'Content-Type':'application/x-www-form-urlencoded',
        'Referer':'https://xg2.nsmc.edu.cn/',
        'Origin':'https://xg2.nsmc.edu.cn',
    }, timeout=15)

h = r2.text
print(f'\n[7] POST response: {r2.status_code}, {len(h)} bytes')

if 'Navigation.aspx' in h:
    print('✅ LOGIN SUCCESS! (Navigation.aspx)')
elif 'MainFrame.aspx' in h:
    print('✅ LOGIN SUCCESS! (MainFrame.aspx)')
else:
    # 找错误信息
    for pat, label in [
        (r"alert\(['\"]([^'\"]+)['\"]\)", 'alert()'),
        (r"layer\.alert\(['\"]([^'\"]+?)['\"]", 'layer.alert()'),
    ]:
        mm = re.search(pat, h)
        if mm:
            print(f'Server message: {mm.group(1)}')
            break
    else:
        if 'queryBtn' in h:
            print('Still on login page (queryBtn found)')
        if '浏览器版本' in h:
            print('Contains 浏览器版本')
        # 找所有疑似错误关键词
        for kw in ['失败', '错误', 'Exception', 'Index', '密码', 'alert']:
            if kw in h:
                idx = h.index(kw)
                print(f'  Found [{kw}]: ...{h[max(0,idx-30):idx+80]}...')

print(f'\n[8] Final cookie: {dict(s.cookies)}')
