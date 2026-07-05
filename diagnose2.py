# 分析 diagnose.py 的输出
# Cookie 有 code 和 CenterSoft => 登录成功或至少部分通过
# 但是仍然返回了登录页面 => 可能是密码强度不足被拒绝

# 测试：直接用 diagnose.py 跑第二次，并看是否有密码强度提示
# 用同一个 session 再试一次
import sys, re, random, base64, urllib.parse as up
import requests, urllib3
urllib3.disable_warnings()

USER = "202302012127"
PASS = "Jyx1593574682"

s = requests.Session()
s.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
    'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9',
})
s.verify = False

# 获取页面
r1 = s.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx',
           headers={'Referer': 'https://xg2.nsmc.edu.cn/'}, timeout=15)
m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', r1.text)
modulus = m.group(3)

def gv(name):
    x = re.search(rf'{re.escape(name)}[^>]*value="([^"]*)"', r1.text)
    return x.group(1) if x else ''
vs = gv('__VIEWSTATE'); ev = gv('__EVENTVALIDATION'); vsg = gv('__VIEWSTATEGENERATOR')

# RSA
raw = base64.b64encode(USER.encode()).decode() + '\\' + base64.b64encode(PASS.encode()).decode()
rb = raw.encode('ascii')
ds = 128; ml = len(rb); ps = max(8, ds - 3 - ml)
b = bytearray(ds)
for x in range(ml): b[x] = rb[ml - 1 - x]
b[ml] = 0
for x in range(ps): b[ml + 1 + x] = random.randint(1, 255)
b[ds - 2] = 2; b[ds - 1] = 0
m_int = int.from_bytes(b, 'little')
hex_c = hex(pow(m_int, 0x010001, int(modulus, 16)))[2:].zfill(256)

cap = ''.join(random.choice(['2','3','4','5','6','7','8','9','b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z','B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z']) for _ in range(4))

fd = {'__LASTFOCUS':'','__EVENTTARGET':'','__EVENTARGUMENT':'',
      '__VIEWSTATE':vs,'__VIEWSTATEGENERATOR':vsg,'__VIEWSTATEENCRYPTED':'',
      '__EVENTVALIDATION':ev,
      'UserName':'******','posx':hex_c,'codeInput':cap,
      'queryBtn':'登          录'}

body = '&'.join(f"{up.quote_plus(k.encode('gb2312'))}={up.quote_plus(v.encode('gb2312'))}" for k,v in fd.items())

r2 = s.post('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', data=body,
    headers={'Content-Type':'application/x-www-form-urlencoded','Referer':'https://xg2.nsmc.edu.cn/','Origin':'https://xg2.nsmc.edu.cn'},
    timeout=15)

h = r2.text
print(f'Status={r2.status_code}, len={len(h)}, cookies={dict(s.cookies)}')
print(f'Navigation.aspx: {"Navigation.aspx" in h}')
print(f'MainFrame.aspx: {"MainFrame.aspx" in h}')

# Save full response
with open('xg2_diag_resp.html', 'w', encoding='utf-8') as f:
    f.write(h)

# Check for alert
al = re.search(r"alert\(['\"]([^'\"]+)['\"]\)", h)
if al: print(f'alert: {al.group(1)}')

la = re.search(r"layer\.alert\(['\"]([^'\"]+?)['\"]", h)
if la: print(f'layer.alert: {la.group(1)}')

lc = re.search(r"layer\.confirm\(['\"]([^'\"]+?)['\"]", h)
if lc: print(f'layer.confirm: {lc.group(1)}')

# Check for CheckPass
if 'checkPass' in h:
    print('checkPass function found in response - password strength check triggered!')

# Check for Navigation.aspx reference even outside the response itself
# Maybe it redirects via JS
redir = re.search(r"location\.href\s*=\s*['\"]([^'\"]+)['\"]", h)
if redir: print(f'JS redirect: {redir.group(1)}')

# The issue: after login, server sets CenterSoft cookie but still returns login page
# This means: login processed but password fails strength check?
# OR maybe the cookie is set BEFORE successful login
print()
print('CenterSoft cookie present:', 'CenterSoft' in str(s.cookies))
# Decode the code cookie
import base64 as b64
code_val = s.cookies.get('code', '')
if code_val:
    try:
        decoded = b64.b64decode(code_val).decode()
        print(f'code cookie decoded: {decoded}')
    except:
        print(f'code cookie raw: {code_val}')
