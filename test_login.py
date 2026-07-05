"""
测试 xg2 登录 — 在下面填写账号密码后运行
输出详细的每一步结果，帮助我们定位问题
"""
import sys, re, urllib3
urllib3.disable_warnings()

sys.path.insert(0, 'G:\\项目\\NSMC-Assistant')
import xg2_fetcher

USERNAME = "你的学号"
PASSWORD = "你的密码"

# ====== 测试 1: 基础连接 ======
print("=== [1] 测试登录页连接 ===")
session = xg2_fetcher._make_session()
try:
    r = session.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx',
                    headers={'Referer': 'https://xg2.nsmc.edu.cn/'},
                    timeout=15)
    print(f"  状态码: {r.status_code}")
    print(f"  长度: {len(r.text)}")
    print(f"  Encoding: {r.encoding}")
    html = r.text
except Exception as e:
    print(f"  连接失败: {e}")
    sys.exit(1)

# ====== 测试 2: 字段提取 ======
print("\n=== [2] 测试字段提取 ===")
m = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', html)
if m:
    print(f"  RSA exponent: {m.group(1)}")
    print(f"  RSA modulus: {m.group(3)[:40]}...")
    print(f"  modulus len: {len(m.group(3))}")
else:
    print("  RSA KEY NOT FOUND!")
    sys.exit(1)

vs = re.search(r'name="__VIEWSTATE"[^>]*value="([^"]*)"', html)
ev = re.search(r'name="__EVENTVALIDATION"[^>]*value="([^"]*)"', html)
print(f"  VIEWSTATE: {'Found' if vs else 'MISSING'}, len={len(vs.group(1)) if vs else 0}")
print(f"  EVENTVALIDATION: {'Found' if ev else 'MISSING'}, len={len(ev.group(1)) if ev else 0}")

# ====== 测试 3: RSA 加密 ======
print("\n=== [3] 测试 RSA 加密 ===")
import base64
raw_plaintext = base64.b64encode(USERNAME.encode()).decode() + '\\' + base64.b64encode(PASSWORD.encode()).decode()
print(f"  明文 ({len(raw_plaintext)}B): {raw_plaintext}")

encrypted = xg2_fetcher._rsa_encrypt(USERNAME, PASSWORD, m.group(3))
print(f"  密文 hex: {encrypted[:40]}...")
print(f"  密文长度: {len(encrypted)}")

# ====== 测试 4: GB2312 编码 ======
print("\n=== [4] 测试 GB2312 表单编码 ===")
import urllib.parse as up
queryBtn_gb = up.quote_plus('登          录'.encode('gb2312'))
expected = 'queryBtn=%B5%C7++++++++++%C2%BC'
actual = f'queryBtn={queryBtn_gb}'
print(f"  期望: {expected}")
print(f"  实际: {actual}")
print(f"  匹配: {actual == expected}")

# 5. 测试完整登录并捕获详细错误
print("\n=== [5] 测试完整登录 ===")
try:
    result = xg2_fetcher.login_and_get_form(USERNAME, PASSWORD)
    if result['success']:
        print(f"  ✅ 成功!")
        print(f"  节假日: {result['holiday_name']}")
        print(f"  学生: {result['student_name']}")
    else:
        print(f"  ❌ 失败: {result.get('message', '无错误消息')}")
except Exception as ex:
    print(f"  ❌ 异常: {ex}")
    import traceback; traceback.print_exc()
