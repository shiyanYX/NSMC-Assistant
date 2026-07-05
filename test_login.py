"""xg2 login test — 请在此文件中填写真实账号密码后运行"""
import sys
sys.path.insert(0, 'G:\\项目\\NSMC-Assistant')
import xg2_fetcher

# ===== 请在这里填入你的真实 xg2 账号密码 =====
USERNAME = "你的学号"
PASSWORD = "你的密码"
# ============================================

result = xg2_fetcher.login_and_get_form(USERNAME, PASSWORD)
if result['success']:
    print(f"✅ SUCCESS!")
    print(f"  节假日: {result['holiday_name']}")
    print(f"  学生: {result['student_name']}")
else:
    print(f"❌ {result.get('message', 'Unknown error')}")
