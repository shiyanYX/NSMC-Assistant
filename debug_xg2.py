"""Full login test with hardcoded credentials (edit and run)"""
import requests, urllib3, re, random, sys
urllib3.disable_warnings()

username = sys.argv[1] if len(sys.argv) > 1 else input("xg2 学号: ")
password = sys.argv[2] if len(sys.argv) > 2 else input("xg2 密码: ")

s = requests.Session()
s.headers.update({'User-Agent': 'Mozilla/5.0 Chrome/150.0.0.0'})
s.verify = False

r1 = s.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', timeout=15)
html = r1.text
print(f'[1] GET login page OK, length={len(html)}')
print(f'    Cookies: {s.cookies.get_dict()}')

m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', html)
if not m:
    print('FATAL: RSA key not found'); exit(1)
modulus = m.group(3)

vs = re.search(r'__VIEWSTATE[^>]*value="([^"]*)"', html)
ev = re.search(r'__EVENTVALIDATION[^>]*value="([^"]*)"', html)
vsg = re.search(r'__VIEWSTATEGENERATOR[^>]*value="([^"]*)"', html)
viewstate = vs.group(1) if vs else ''
eventvalidation = ev.group(1) if ev else ''
viewstategen = vsg.group(1) if vsg else ''

import base64 as b64
raw = b64.b64encode(username.encode()).decode() + '\\' + b64.b64encode(password.encode()).decode()
raw_bytes = raw.encode()

n = int(modulus, 16); e = 0x010001; digit_size = 128
msg_len = len(raw_bytes); padded_size = max(8, digit_size - 3 - msg_len)
b = bytearray(digit_size)
for x in range(msg_len): b[x] = raw_bytes[msg_len - 1 - x]
b[msg_len] = 0
for x in range(padded_size): b[msg_len + 1 + x] = random.randint(1, 255)
b[digit_size - 2] = 2; b[digit_size - 1] = 0
m_int = int.from_bytes(b, 'little')
encrypted = hex(pow(m_int, e, n))[2:]

cap_chars = ['2','3','4','5','6','7','8','9','b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z','B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z']
captcha = ''.join(random.choice(cap_chars) for _ in range(4))
print(f'[2] POST login with captcha={captcha}, encrypted_len={len(encrypted)}')

form = {'__LASTFOCUS':'','__EVENTTARGET':'','__EVENTARGUMENT':'','__VIEWSTATE':viewstate,'__VIEWSTATEGENERATOR':viewstategen,'__VIEWSTATEENCRYPTED':'','__EVENTVALIDATION':eventvalidation,'UserName':'******','posx':encrypted,'codeInput':captcha,'queryBtn':'登          录'}

r2 = s.post('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', data=form, timeout=15)
login_html = r2.text

print(f'[3] Login response status={r2.status_code}, url={r2.url}')
print(f'    Response length={len(login_html)}')

if 'Navigation.aspx' in login_html:
    print('    ✅ SUCCESS: Navigation.aspx found!')
elif 'MainFrame.aspx' in login_html:
    print('    ✅ SUCCESS: MainFrame.aspx found!')
else:
    print('    ❌ FAILED')
    alert = re.search(r"alert\(['\"]([^'\"]+)['\"]\)", login_html)
    if alert:
        print(f'    Alert: {alert.group(1)}')
    else:
        with open('xg2_login_resp.html', 'w', encoding='utf-8') as f:
            f.write(login_html)
        print('    Response saved to xg2_login_resp.html')
        if 'queryBtn' in login_html: print('    Still on login page')
        if '失败' in login_html:
            idx = login_html.index('失败')
            print(f'    Context: ...{login_html[max(0,idx-40):idx+40]}...')

print(f'[4] Cookies: {s.cookies.get_dict()}')
