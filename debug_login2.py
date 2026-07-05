"""xg2 login - full browser simulation. Args: username password"""
import requests, urllib3, re, random, sys
urllib3.disable_warnings()

USERNAME = sys.argv[1] if len(sys.argv) > 1 else input("学号: ")
PASSWORD = sys.argv[2] if len(sys.argv) > 2 else input("密码: ")

s = requests.Session()
s.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Upgrade-Insecure-Requests': '1',
})
s.verify = False

r1 = s.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx',
           headers={'Referer': 'https://xg2.nsmc.edu.cn/'}, timeout=15)
html = r1.text
print(f'[1] GET login -> {r1.status_code}, len={len(html)}')

m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', html)
if not m: print("RSA NOT FOUND"); sys.exit(1)
modulus = m.group(3)

def gv(name):
    x = re.search(rf'{re.escape(name)}[^>]*value="([^"]*)"', html)
    return x.group(1) if x else ''

vs = gv('__VIEWSTATE'); ev = gv('__EVENTVALIDATION'); vsg = gv('__VIEWSTATEGENERATOR')
print(f'[2] VS={len(vs)} EV={len(ev)}')

import base64 as b64
raw = b64.b64encode(USERNAME.encode()).decode() + '\\' + b64.b64encode(PASSWORD.encode()).decode()
rb = raw.encode()
print(f'[3] plaintext len={len(rb)}')

n = int(modulus, 16); e = 0x010001; ds = 128
ml = len(rb); ps = max(8, ds - 3 - ml)
b = bytearray(ds)
for x in range(ml): b[x] = rb[ml-1-x]
b[ml] = 0
for x in range(ps): b[ml+1+x] = random.randint(1, 255)
b[ds-2] = 2; b[ds-1] = 0
c_int = int.from_bytes(b, 'little')
encrypted = hex(pow(c_int, e, n))[2:].zfill(256)
print(f'[4] enc len={len(encrypted)}')

cap = ''.join(random.choice(['2','3','4','5','6','7','8','9','b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z','B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z']) for _ in range(4))

fd = {
    '__LASTFOCUS':'','__EVENTTARGET':'','__EVENTARGUMENT':'',
    '__VIEWSTATE':vs,'__VIEWSTATEGENERATOR':vsg,'__VIEWSTATEENCRYPTED':'',
    '__EVENTVALIDATION':ev,
    'UserName':'******','posx':encrypted,'codeInput':cap,
    'queryBtn':'登          录',
}

# Try with headers fully mimicking browser POST
r2 = s.post('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', data=fd,
            headers={
                'Referer': 'https://xg2.nsmc.edu.cn/',
                'Origin': 'https://xg2.nsmc.edu.cn',
            },
            timeout=15)
h = r2.text
print(f'[5] POST {r2.status_code}, len={len(h)}')
if 'Navigation.aspx' in h:
    print('✅ SUCCESS!')
elif 'MainFrame.aspx' in h:
    print('✅ SUCCESS!')
else:
    print(f'queryBtn: {"queryBtn" in h}')
    alert = re.search(r"alert\(['\"]([^'\"]+)['\"]\)", h)
    if alert: print(f'alert: {alert.group(1)}')
    layer = re.search(r'layer\.alert\([\'"]([^\'"]+)[\'"]\)', h)
    if layer: print(f'layer.alert: {layer.group(1)}')
    # check JS checkVersion
    if '浏览器版本' in h: print('Browser version check triggered')
    # dump key context
    for kw in ['失败', '成功', '密码', '错误']:
        if kw in h:
            idx = h.index(kw)
            print(f'  [{kw}] ...{h[max(0,idx-40):idx+60]}...')
