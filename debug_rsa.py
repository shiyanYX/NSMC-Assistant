"""Debug: test both custom RSA and pycryptodome RSA against known test vector"""
import requests, urllib3, re, random, base64, struct
urllib3.disable_warnings()

USERNAME = "请替换"
PASSWORD = "请替换"

# ====== Get real modulus from server ======
s = requests.Session()
s.headers.update({'User-Agent': 'Mozilla/5.0 Chrome/150.0.0.0'})
s.verify = False
r = s.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', timeout=15)
m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', r.text)
modulus = m.group(3)
print(f'Modulus len={len(modulus)}')

# ====== Base plaintext ======
raw = base64.b64encode(USERNAME.encode()).decode() + '\\' + base64.b64encode(PASSWORD.encode()).decode()
raw_bytes = raw.encode()
print(f'Plaintext ({len(raw_bytes)} bytes): {raw}')

n = int(modulus, 16)
e = 0x010001
digit_size = 128
msg_len = len(raw_bytes)

# ====== Method A: custom padding (little-endian) ======
padded = max(8, digit_size - 3 - msg_len)
b = bytearray(digit_size)
for x in range(msg_len): b[x] = raw_bytes[msg_len - 1 - x]
b[msg_len] = 0
for x in range(padded): b[msg_len + 1 + x] = random.randint(1, 255)
b[digit_size - 2] = 2
b[digit_size - 1] = 0
custom_int = int.from_bytes(b, 'little')
custom_enc = hex(pow(custom_int, e, n))[2:].zfill(256)
print(f'\nMethod A (custom little-endian): hex_len={len(custom_enc)}')

# ====== Method B: pycryptodome PKCS1-v1.5 ======
from Crypto.PublicKey import RSA as CRSA
from Crypto.Cipher import PKCS1_v1_5 as CPKCS

# Build RSA public key
rsa_key = CRSA.construct((n, e))
cipher = CPKCS.new(rsa_key)
# In PKCS1-v1.5 type 2, cipher.encrypt() handles padding automatically
ciphertext = cipher.encrypt(raw_bytes)
b64_enc = base64.b64encode(ciphertext).decode()
pycrypto_hex = ciphertext.hex()
print(f'Method B (pycryptodome PKCS1-v1.5): hex_len={len(pycrypto_hex)}')
print(f'  b64: {b64_enc}')

# ====== Try both on server ======
s2 = requests.Session()
s2.headers.update({'User-Agent': 'Mozilla/5.0 Chrome/150.0.0.0'})
s2.verify = False
s2.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', timeout=10)

cap = ''.join(random.choice(['2','3','4','5','6','7','8','9','b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z','B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z']) for _ in range(4))

def try_login(session, encrypted_hex, label):
    """Try login with a given encrypted value"""
    # Get fresh fields from the page we already have
    cap2 = ''.join(random.choice(['2','3','4','5','6','7','8','9','b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z','B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z']) for _ in range(4))

    fd = {
        '__LASTFOCUS': '', '__EVENTTARGET': '', '__EVENTARGUMENT': '',
        '__VIEWSTATE': re.search(r'__VIEWSTATE[^>]*value="([^"]*)"', r.text).group(1) if re.search(r'__VIEWSTATE[^>]*value="([^"]*)"', r.text) else '',
        '__VIEWSTATEGENERATOR': re.search(r'__VIEWSTATEGENERATOR[^>]*value="([^"]*)"', r.text).group(1) if re.search(r'__VIEWSTATEGENERATOR[^>]*value="([^"]*)"', r.text) else '',
        '__VIEWSTATEENCRYPTED': '',
        '__EVENTVALIDATION': re.search(r'__EVENTVALIDATION[^>]*value="([^"]*)"', r.text).group(1) if re.search(r'__EVENTVALIDATION[^>]*value="([^"]*)"', r.text) else '',
        'UserName': '******', 'posx': encrypted_hex, 'codeInput': cap2,
        'queryBtn': '登          录',
    }

    import urllib.parse
    body = '&'.join(f"{urllib.parse.quote_from_bytes(k.encode('gb2312'), safe='')}={urllib.parse.quote_from_bytes(v.encode('gb2312'), safe='')}" for k,v in fd.items())

    resp = session.post('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', data=body,
                        headers={'Content-Type': 'application/x-www-form-urlencoded'}, timeout=15)
    h = resp.text
    if 'Navigation.aspx' in h:
        print(f'  [{label}] ✅ SUCCESS!')
        return True
    if 'MainFrame.aspx' in h:
        print(f'  [{label}] ✅ SUCCESS (MainFrame)!')
        return True
    if 'StuLeave' in h:
        print(f'  [{label}] ✅ SUCCESS (Leave page mention)!')
        return True
    alert = re.search(r"alert\(['\"]([^'\"]+)['\"]\)", h)
    if alert:
        print(f'  [{label}] Server alert: {alert.group(1)}')
    elif 'IndexOutOfRangeException' in h or '索引超出了数组' in h:
        print(f'  [{label}] ❌ IndexOutOfRangeException')
    else:
        print(f'  [{label}] ❌ Unknown, len={len(h)} vs login page 10758')
        print(f'  Contains Navigation.aspx: {"Navigation.aspx" in h}')
        print(f'  Contains MainFrame.aspx: {"MainFrame.aspx" in h}')
        print(f'  Contains queryBtn: {"queryBtn" in h}')
        # look for layer.alert
        layer = re.search(r'layer\.alert\([\'"]([^\'"]+)[\'"]\)', h)
        if layer:
            print(f'  layer.alert: {layer.group(1)}')
        with open(f'xg2_resp_{label}.html', 'w', encoding='utf-8') as f:
            f.write(h)
    return False

# Try both methods
try_login(s2, custom_enc, 'Custom')
try_login(s2, pycrypto_hex, 'Pycryptodome')
