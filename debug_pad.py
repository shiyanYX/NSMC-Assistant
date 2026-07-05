# 精细对比: Python vs JS RSA 加密
import requests, urllib3, re, random, base64, urllib.parse as up
urllib3.disable_warnings()

USERNAME = "你的学号"
PASSWORD = "你的密码"

s = requests.Session()
s.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'})
s.verify = False
r = s.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx',
          headers={'Referer': 'https://xg2.nsmc.edu.cn/'}, timeout=15)
m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', r.text)
modulus = m.group(3); exponent = m.group(1)
n = int(modulus, 16); e = 0x010001

raw = base64.b64encode(USERNAME.encode()).decode() + '\\' + base64.b64encode(PASSWORD.encode()).decode()
print(f'raw ({len(raw)} chars): {raw}')
rb = raw.encode('ascii')
print(f'rb ({len(rb)} bytes): {rb.hex()}')

# 验证 JS BigInt 结构
# 在 JS 中，digitSize = 2*biHighIndex(m) + 2 = 2*63+2 = 128 (因为 256 hex = 128 bytes = 64 shorts)
ds = 128
ml = len(rb)
ps = max(8, ds - 3 - ml)
print(f'ds={ds}, ml={ml}, ps={ps}')

# 构建消息数组 b (与 JS 完全一致)
b = bytearray(ds)
# 消息（逆序）
for x in range(ml):
    b[x] = rb[ml - 1 - x]
b[ml] = 0  # 分隔
# 随机填充
for x in range(ps):
    b[ml + 1 + x] = random.randint(1, 255)
b[ds - 2] = 2
b[ds - 1] = 0

# JS digits[j] = b[2j] + b[2j+1] << 8
# 这等价于 int.from_bytes(b, 'little')
m_int = int.from_bytes(b, 'little')
print(f'm padded int.bit_length(): {m_int.bit_length()}')
print(f'n.bit_length(): {n.bit_length()}')
print(f'm < n: {m_int < n}')

c = pow(m_int, e, n)
hex_c = hex(c)[2:].zfill(256)
print(f'c len: {len(hex_c)}')
print(f'c starts: {hex_c[:40]}...')

# ==== 做两次加密验证 ====
c2 = pow(m_int, e, n)
print(f'Same result: {c == c2}')

# ==== 用不同方法验证 ====
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes

pub = rsa.RSAPublicNumbers(e, n).public_key()
# 用 raw int 构建 PKCS1 块 — 防止库函数给出不同结果
# 直接用 pow 结果

vs = re.search(r'__VIEWSTATE[^>]*value="([^"]*)"', r.text).group(1)
ev = re.search(r'__EVENTVALIDATION[^>]*value="([^"]*)"', r.text).group(1)
vsg = re.search(r'__VIEWSTATEGENERATOR[^>]*value="([^"]*)"', r.text).group(1)

print('\n=== 尝试登录 ===')
for tries in range(3):
    cap = ''.join(random.choice(['2','3','4','5','6','7','8','9','b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z','B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z']) for _ in range(4))

    # 重新生成填充（每次不同）
    b2 = bytearray(ds)
    for x in range(ml): b2[x] = rb[ml-1-x]
    b2[ml] = 0
    for x in range(ps): b2[ml+1+x] = random.randint(1, 255)
    b2[ds-2] = 2; b2[ds-1] = 0
    m_int2 = int.from_bytes(b2, 'little')
    c_new = pow(m_int2, e, n)
    hex_new = hex(c_new)[2:].zfill(256)

    fd = {'__LASTFOCUS':'','__EVENTTARGET':'','__EVENTARGUMENT':'',
          '__VIEWSTATE':vs,'__VIEWSTATEGENERATOR':vsg,'__VIEWSTATEENCRYPTED':'',
          '__EVENTVALIDATION':ev,
          'UserName':'******','posx':hex_new,'codeInput':cap,
          'queryBtn':'登          录'}

    body = '&'.join(f"{up.quote_plus(k.encode('gb2312'))}={up.quote_plus(v.encode('gb2312'))}" for k,v in fd.items())

    s2 = requests.Session()
    s2.headers.update(s.headers)
    s2.verify = False

    r2 = s2.post('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', data=body,
                 headers={'Content-Type':'application/x-www-form-urlencoded',
                         'Referer':'https://xg2.nsmc.edu.cn/', 'Origin':'https://xg2.nsmc.edu.cn'},
                 timeout=15)
    h = r2.text
    if 'Navigation.aspx' in h or 'MainFrame.aspx' in h:
        print(f'  [try {tries+1}] ✅ SUCCESS!')
        exit(0)
    elif 'IndexOutOfRangeException' in h or '索引超出了数组' in h:
        print(f'  [try {tries+1}] ❌ IndexOutOfRangeException')
    else:
        al = re.search(r"alert\(['\"]([^'\"]+)['\"]\)", h)
        print(f'  [try {tries+1}] ❌ {al.group(1) if al else "unknown, len="+str(len(h))}')
