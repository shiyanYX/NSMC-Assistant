from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import score_fetcher_http
import re
import os

app = Flask(__name__, static_folder=None)
CORS(app)

@app.route('/api/login', methods=['POST'])
def login():
    """登录验证API"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'success': False, 'message': '请提供学号和密码'}), 400

        success, real_name, _, error_msg = score_fetcher_http.verify_login(username, password)

        if success:
            return jsonify({
                'success': True,
                'data': {'username': username, 'name': real_name},
                'message': '登录成功'
            })
        else:
            return jsonify({'success': False, 'message': error_msg}), 401

    except Exception as e:
        return jsonify({'success': False, 'message': f'服务器错误: {str(e)}'}), 500


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