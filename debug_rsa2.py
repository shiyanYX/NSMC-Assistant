"""测试：直接用 HAR 中的成功 POST 数据验证我们的 RSA 实现"""
import re
import base64

# 从 HAR 提取浏览器成功登录的值
HAR_POSX = "a2c7a178c0d64eec83893dba3fc7824dfe376a33a41b6b46aaed623b2a5a5970eb6f8f7c8ca434a8fd29049eef019ca92e3f82c670191092e8af70e11ac091ae75f454732357b4329a7e726c69973c6976318fca9b2d5df6a937f95ff8e322b2ecc3b22d56d545afe835a8dc0604261042e86fda9a3f65a5a19da55151093341"

# 浏览器访问时间戳对应的 modulus（从第一个 HAR 的页面 html 中提取）
# 但 modulus 每次不同。让我们先做另一件事：
# 检查两个不同的 RSAKeyPair 调用中的 modulus 是否真不同

import requests, urllib3
urllib3.disable_warnings()

# 第一次请求
s1 = requests.Session()
s1.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'})
s1.verify = False
r1 = s1.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', timeout=15)
m1 = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', r1.text)
mod1 = m1.group(3) if m1 else ''

# 第二次请求
import time
time.sleep(1)
s2 = requests.Session()
s2.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'})
s2.verify = False
r2 = s2.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', timeout=15)
m2 = re.search(r'new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)', r2.text)
mod2 = m2.group(3) if m2 else ''

print(f"Modulus 1: {mod1[:40]}...")
print(f"Modulus 2: {mod2[:40]}...")
print(f"Same: {mod1 == mod2}")
print(f"Len 1: {len(mod1)}, Len 2: {len(mod2)}")
