from flask import Flask, request, jsonify
from flask_cors import CORS
import score_fetcher_http
import re

app = Flask(__name__)
CORS(app)  # 允许跨域请求

@app.route('/api/login', methods=['POST'])
def login():
    """登录验证API"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({
                'success': False,
                'message': '请提供学号和密码'
            }), 400

        # 尝试登录验证（只验证，不获取成绩）
        import requests
        from bs4 import BeautifulSoup
        import base64

        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

        # 访问登录页面获取cookie
        login_url = 'https://jiaowu3.nsmc.edu.cn/jsxsd/'
        session.get(login_url, verify=False, timeout=10)

        # 准备登录数据
        encoded_user = base64.b64encode(username.encode('utf-8')).decode('utf-8')
        encoded_pass = base64.b64encode(password.encode('utf-8')).decode('utf-8')
        encoded = f'{encoded_user}%%%{encoded_pass}'

        # 发送登录请求
        login_api = 'https://jiaowu3.nsmc.edu.cn/jsxsd/xk/LoginToXk'
        response = session.post(login_api, data={'encoded': encoded}, verify=False, timeout=10)

        # 检查登录是否成功
        if 'xsMain' in response.url or 'framework' in response.url:
            # 获取用户姓名
            real_name = username
            try:
                main_page = session.get('https://jiaowu3.nsmc.edu.cn/jsxsd/framework/xsMain.jsp', verify=False, timeout=10)
                soup = BeautifulSoup(main_page.text, 'html.parser')
                
                # 尝试从用户信息区域获取姓名
                user_info = soup.select_one('.edu-user')
                if user_info:
                    # 尝试直接从userInfo中获取姓名
                    user_info_div = user_info.select_one('.userInfo')
                    if user_info_div:
                        name_p = user_info_div.find('p')
                        if name_p:
                            real_name = name_p.get_text(strip=True)
                    
                    # 备选方法：从所有标签中提取
                    if real_name == username:
                        name_tags = user_info.find_all(['p', 'span', 'div'])
                        for tag in name_tags:
                            text = tag.get_text(strip=True)
                            if text:
                                # 尝试判断是否为姓名，过滤掉身份信息
                                clean_text = text.replace('学生', '').replace('老师', '').replace('教职工', '').strip()
                                if len(clean_text) > 1 and len(clean_text) < 10 and not clean_text.isdigit():
                                    real_name = clean_text
                                    break
            except Exception as e:
                print(f"获取姓名时出错: {e}")
                pass

            return jsonify({
                'success': True,
                'data': {
                    'username': username,
                    'name': real_name
                },
                'message': '登录成功'
            })
        else:
            return jsonify({
                'success': False,
                'message': '登录失败，请检查学号和密码'
            }), 401

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'服务器错误: {str(e)}'
        }), 500


@app.route('/api/evaluation/list', methods=['POST'])
def evaluation_list():
    """获取教学评价待评列表"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'success': False, 'message': '请提供学号和密码'}), 400

        teachers, session, error_msg = score_fetcher_http.evaluation_login_and_get_list(username, password)

        if error_msg:
            return jsonify({'success': False, 'message': error_msg}), 400

        # 计算统计
        unsubmitted_count = sum(1 for t in teachers if t['submitted'] != '是')
        submitted_count = len(teachers) - unsubmitted_count

        return jsonify({
            'success': True,
            'data': {
                'teachers': teachers,
                'total': len(teachers),
                'submitted': submitted_count,
                'unsubmitted': unsubmitted_count
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'服务器错误: {str(e)}'}), 500


@app.route('/api/evaluation/submit', methods=['POST'])
def evaluation_submit():
    """提交单个教师的评价"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        teacher_info = data.get('teacher')  # 包含 url 等字段
        do_submit = data.get('do_submit', False)  # True=提交, False=保存

        if not username or not password or not teacher_info:
            return jsonify({'success': False, 'message': '缺少必要参数'}), 400

        from score_fetcher_http import _create_session, _login_session

        session = _create_session()
        if not _login_session(session, username, password):
            return jsonify({'success': False, 'message': '登录失败'}), 401

        success, msg = score_fetcher_http.evaluation_submit_one(session, teacher_info, do_submit)

        return jsonify({
            'success': success,
            'message': msg
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'服务器错误: {str(e)}'}), 500


@app.route('/api/evaluation/submit-all', methods=['POST'])
def evaluation_submit_all():
    """一键全评"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'success': False, 'message': '请提供学号和密码'}), 400

        result, _ = score_fetcher_http.evaluation_submit_all(username, password)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': f'服务器错误: {str(e)}'}), 500


@app.route('/api/score', methods=['POST'])
def get_score():
    """获取成绩API"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        name = data.get('name')
        term_filter = data.get('term')

        if not username or not password:
            return jsonify({
                'success': False,
                'message': '请提供学号和密码'
            }), 400

        # 使用HTTP方式获取成绩
        df, user, real_name, error_msg = score_fetcher_http.http_login_and_get_scores(
            username, password, name, term_filter
        )

        if error_msg:
            return jsonify({
                'success': False,
                'message': error_msg
            }), 400

        # 转换为字典列表
        if df is not None:
            scores = df.to_dict('records')
        else:
            scores = []

        return jsonify({
            'success': True,
            'data': {
                'username': user,
                'name': real_name,
                'scores': scores
            }
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'服务器错误: {str(e)}'
        }), 500

if __name__ == '__main__':
    import socket
    # 尝试绑定端口，如果5000被占用，则尝试其他端口
    ports_to_try = [5000, 5001, 5002, 5003, 5004]
    for port in ports_to_try:
        try:
            # 测试端口是否可用
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('0.0.0.0', port))
                s.close()
            # 端口可用，启动应用
            print(f"在端口 {port} 上启动Flask应用")
            app.run(host='0.0.0.0', port=port, debug=True)
            break
        except OSError:
            print(f"端口 {port} 被占用，尝试下一个端口")
    else:
        print("所有尝试的端口都被占用，无法启动Flask应用")