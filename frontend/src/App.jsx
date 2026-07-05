import React, { useState, useEffect } from 'react';
import ScoreQuery from './components/ScoreQuery';
import EvaluationQuery from './components/EvaluationQuery';
import LeaveRegistration from './components/LeaveRegistration';

const isTauri = typeof window !== 'undefined' && window.__TAURI__;

let Command = null;
let backendProcess = null;
let appWindow = null;

if (isTauri) {
  try {
    Command = require('@tauri-apps/api/shell').Command;
    appWindow = require('@tauri-apps/api/window').appWindow;
  } catch (e) {
    console.log('Tauri API not available in development mode');
  }
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);

  const [currentNav, setCurrentNav] = useState('score');
  const [showHome, setShowHome] = useState(false);

  // Apply / toggle theme
  useEffect(() => {
    document.body.classList.toggle('theme-dark', dark);
  }, [dark]);

  const toggleTheme = () => setDark(d => !d);

  const startBackend = async () => {
    if (!isTauri || !Command) return;
    let retryCount = 0;
    const maxRetries = 3;
    while (retryCount < maxRetries) {
      try {
        backendProcess = Command.sidecar('resources/backend.exe', [], {
          cwd: '.', env: {}, shell: false
        });
        await backendProcess.spawn();
        await new Promise(r => setTimeout(r, 3000));
        try {
          const res = await fetch('http://localhost:5000/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'test', password: 'test' })
          });
          if (res.status) { setError(''); return; }
        } catch (_) {}
        try { await backendProcess.kill(); } catch (_) {}
      } catch (_) {}
      retryCount++;
      if (retryCount < maxRetries) await new Promise(r => setTimeout(r, 2000));
    }
    setError('后端启动失败，请检查网络连接或重新启动应用');
  };

  const stopBackend = async () => {
    if (!isTauri || !backendProcess) return;
    try { await backendProcess.kill(); } catch (_) {}
  };

  useEffect(() => {
    startBackend();
    const savedLogin = localStorage.getItem('savedLogin');
    if (savedLogin) {
      const loginData = JSON.parse(savedLogin);
      setLoginForm({ username: loginData.username, password: loginData.password });
      setRememberMe(true);
    }
    if (isTauri && appWindow) {
      appWindow.once('close-requested', () => stopBackend());
      return () => stopBackend();
    } else {
      return () => stopBackend();
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginForm.username || !loginForm.password) { setError('请输入学号和密码'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginForm.username, password: loginForm.password })
      });
      const data = await response.json();
      if (data.success) {
        const user = { username: loginForm.username, password: loginForm.password, name: data.data?.name || loginForm.username };
        setCurrentUser(user);
        localStorage.setItem('currentUser', JSON.stringify(user));
        if (rememberMe) {
          localStorage.setItem('savedLogin', JSON.stringify({ username: loginForm.username, password: loginForm.password }));
        } else { localStorage.removeItem('savedLogin'); }
        setIsLoggedIn(true); setError('');
      } else { setError(data.message || '登录失败，请检查学号和密码'); }
    } catch (err) { setError('网络错误，请稍后重试: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    setIsLoggedIn(false); setCurrentUser(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('savedLogin');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLoginForm(prev => ({ ...prev, [name]: value }));
  };

  const switchNav = (tab) => {
    setCurrentNav(tab);
    setShowHome(false);
  };

  const goHome = () => {
    setShowHome(true);
  };

  // Login screen (always dark)
  if (!isLoggedIn) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-logo">川</div>
            <h1>川北医助手</h1>
            <p>NSMC Assistant</p>
          </div>

          {error && <div className="msg-bar msg-error">{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="login-field">
              <label>学号</label>
              <input name="username" value={loginForm.username} onChange={handleInputChange} placeholder="请输入学号" />
            </div>
            <div className="login-field">
              <label>密码</label>
              <input name="password" type="password" value={loginForm.password} onChange={handleInputChange} placeholder="请输入密码" />
            </div>

            <label className="login-checkbox">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>记住账号密码</span>
            </label>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <span className="login-spinner" /> : null}
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          <div className="login-footer">© 2026 川北医助手 | NSMC Assistant</div>
        </div>

        <style>{`
          .login-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #0d1117 0%, #1a2332 50%, oklch(38% 0.14 255) 100%);
            padding: 20px;
          }
          .login-card {
            width: 100%; max-width: 380px;
            background: #1e1e1e; border-radius: 14px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            padding: 32px 28px 24px;
          }
          .login-brand { text-align: center; margin-bottom: 28px; }
          .login-logo {
            width: 48px; height: 48px; border-radius: 12px;
            background: var(--accent); color: #fff;
            display: inline-flex; align-items: center; justify-content: center;
            font: 700 24px/1 system-ui; margin-bottom: 10px;
          }
          .login-brand h1 { font-size: 20px; font-weight: 700; color: #e0e0e0; margin: 0 0 2px; letter-spacing: -0.01em; }
          .login-brand p { font-size: 13px; color: #888; margin: 0; }
          .login-field { margin-bottom: 18px; }
          .login-field label { display: block; font-size: 13px; color: #ccc; margin-bottom: 5px; font-weight: 500; }
          .login-field input {
            width: 100%; height: 44px; padding: 0 14px;
            border: 1px solid #333; border-radius: 8px;
            font: 15px/1 system-ui; color: #e0e0e0;
            background: #2a2a2a; outline: none;
          }
          .login-field input:focus { border-color: var(--accent); }
          .login-field input::placeholder { color: #666; }
          .login-checkbox { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; cursor: pointer; }
          .login-checkbox input { accent-color: var(--accent); width: 16px; height: 16px; cursor: pointer; }
          .login-checkbox span { font-size: 13px; color: #888; }
          .login-btn {
            width: 100%; height: 46px; border: 0; border-radius: 8px;
            background: var(--accent); color: #fff;
            font: 600 15px/1 system-ui; cursor: pointer;
            display: flex; align-items: center; justify-content: center; gap: 6px;
            transition: opacity 0.15s;
          }
          .login-btn:hover { opacity: 0.9; }
          .login-btn:disabled { opacity: 0.5; cursor: default; }
          .login-spinner {
            width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff; border-radius: 50%;
            animation: spin 0.6s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          .login-footer { text-align: center; margin-top: 24px; font-size: 11px; color: #555; }
          .msg-bar { padding: 10px 14px; margin-bottom: 14px; border-radius: 8px; font-size: 13px; background: #b71c1c30; color: #ef9a9a; }
        `}</style>
      </div>
    );
  }

  // Main app
  return (
    <div className="app-root">
      <header className="app-header">
        <div className="header-left">
          <div className="header-logo" onClick={goHome} title="首页">川</div>
          <span className="header-title">川北医助手</span>
          <nav className="header-nav">
            <a className={currentNav === 'score' && !showHome ? 'active' : ''}
               onClick={() => switchNav('score')}>成绩查询</a>
            <a className={currentNav === 'evaluation' && !showHome ? 'active' : ''}
               onClick={() => switchNav('evaluation')}>教学评价</a>
            <a className={currentNav === 'leave' && !showHome ? 'active' : ''}
               onClick={() => switchNav('leave')}>去向登记</a>
          </nav>
        </div>
        <div className="header-right">
          <button className="theme-btn" onClick={toggleTheme} title={dark ? '浅色模式' : '深色模式'}>
            {dark ? '☀' : '☾'}
          </button>
          <span className="user-name">{currentUser.name}</span>
          <button className="logout-btn" onClick={handleLogout}>退出</button>
        </div>
      </header>

      {showHome ? (
        <div className="home-page">
          <h1>欢迎回来，{currentUser.name}</h1>
          <p>选择功能开始使用</p>
          <div className="home-cards">
            <div className="home-card" onClick={() => switchNav('score')}>
              <div className="home-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <h3>成绩查询</h3>
              <p>按学期查看各科成绩、绩点、学分统计</p>
              <span className="hc-badge hc-blue">常用功能</span>
            </div>
            <div className="home-card" onClick={() => switchNav('evaluation')}>
              <div className="home-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                  <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
              </div>
              <h3>教学评价</h3>
              <p>一键评教，实时查看进度和结果</p>
              <span className="hc-badge hc-orange">每学期一次</span>
            </div>
            <div className="home-card" onClick={() => switchNav('leave')}>
              <div className="home-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <h3>去向登记</h3>
              <p>节假日去向登记，支持模板快速填写</p>
              <span className="hc-badge hc-blue">学工系统</span>
            </div>
          </div>
        </div>
      ) : (
        <main className="app-main">
          {currentNav === 'score' && <ScoreQuery account={currentUser} />}
          {currentNav === 'evaluation' && <EvaluationQuery account={currentUser} />}
          {currentNav === 'leave' && <LeaveRegistration account={currentUser} />}
        </main>
      )}

      <footer className="app-footer">川北医助手 | NSMC Assistant</footer>

      <style>{`
        .app-root { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }

        .app-header {
          height: 48px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px; background: var(--surface);
          border-bottom: 1px solid var(--border);
        }
        .header-left { display: flex; align-items: center; gap: 10px; }
        .header-logo {
          width: 28px; height: 28px; border-radius: 8px;
          background: var(--accent); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font: 700 14px/1 system-ui; cursor: pointer; letter-spacing: -0.01em;
          user-select: none;
        }
        .header-title { font: 600 14px/1 var(--font); letter-spacing: -0.01em; }
        .header-nav { display: flex; align-items: center; gap: 2px; margin-left: 16px; }
        .header-nav a {
          padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 500;
          color: var(--muted); text-decoration: none; cursor: pointer; transition: all 0.12s;
          user-select: none;
        }
        .header-nav a:hover { color: var(--fg); background: var(--accent-bg); }
        .header-nav a.active { color: var(--accent); background: var(--accent-soft); }

        .header-right { display: flex; align-items: center; gap: 8px; }
        .theme-btn {
          background: none; border: 0; cursor: pointer; font-size: 16px;
          color: var(--muted); padding: 4px; border-radius: 4px;
          line-height: 1; transition: background 0.12s;
        }
        .theme-btn:hover { background: var(--accent-bg); }
        .user-name { font-size: 13px; color: var(--muted); }
        .logout-btn {
          background: none; border: 1px solid var(--border); border-radius: 6px;
          padding: 4px 10px; font-size: 12px; color: var(--muted); cursor: pointer;
          transition: background 0.12s;
        }
        .logout-btn:hover { background: var(--surface-hover); color: var(--fg); }

        .app-main { flex: 1; padding: 16px 20px; overflow-y: auto; }
        .app-footer {
          height: 26px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; color: var(--muted);
          border-top: 1px solid var(--border); background: var(--surface);
        }

        .home-page { padding: 40px 28px; max-width: 700px; margin: 0 auto; }
        .home-page h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 4px; }
        .home-page p { font-size: 14px; color: var(--muted); margin: 0 0 28px; }
        .home-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .home-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 24px; cursor: pointer; transition: border-color 0.15s;
        }
        .home-card:hover { border-color: var(--accent); }
        .home-card-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: var(--accent-bg); color: var(--accent);
          display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
        }
        .home-card-icon svg { width: 20px; height: 20px; }
        .home-card h3 { font-size: 16px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em; }
        .home-card p { font-size: 13px; color: var(--muted); margin: 0; line-height: 1.5; }
        .hc-badge {
          display: inline-block; margin-top: 12px; padding: 2px 8px; border-radius: 4px;
          font-size: 11px; font-weight: 600;
        }
        .hc-blue { background: oklch(50% 0.14 255 / 0.1); color: oklch(38% 0.14 255); }
        .hc-orange { background: oklch(55% 0.14 50 / 0.1); color: oklch(45% 0.12 50); }
      `}</style>
    </div>
  );
}

export default App;
