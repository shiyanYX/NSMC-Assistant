import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Checkbox,
  Card,
  CardHeader,
  CardFooter,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components';
import ScoreQuery from './components/ScoreQuery';
import EvaluationQuery from './components/EvaluationQuery';

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

const useStyles = makeStyles({
  // ---- Login ----
  loginContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0d1117 0%, #1a2332 50%, #0d47a1 100%)',
    padding: '20px'
  },
  loginCard: {
    width: '100%',
    maxWidth: '380px',
    backgroundColor: '#1e1e1e',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
  },
  loginForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  rememberMe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8px',
    marginTop: '-8px'
  },
  errorMessage: {
    marginTop: '-8px',
    marginBottom: '8px',
    color: tokens.colorPaletteRedForeground1
  },
  loginButton: {
    width: '100%',
    marginTop: '4px'
  },

  // ---- Main shell ----
  appContainer: {
    minHeight: '100vh',
    backgroundColor: '#1e1e1e',
    display: 'flex',
    flexDirection: 'column'
  },
  appLayout: {
    display: 'flex',
    flex: 1,
    minHeight: 0
  },

  // ---- Top bar (Task Manager style) ----
  appHeader: {
    height: '32px',
    background: '#2d2d2d',
    borderBottom: '1px solid #3d3d3d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    userSelect: 'none',
    WebkitAppRegion: 'drag'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  appIcon: {
    fontSize: '12px',
    color: '#0078d4'
  },
  headerTitle: {
    color: '#e0e0e0'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  userName: {
    color: '#a0a0a0'
  },

  // ---- Sidebar (Task Manager nav pane) ----
  sidebar: {
    width: '48px',
    background: '#2d2d2d',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #3d3d3d',
    flexShrink: 0
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '44px',
    cursor: 'pointer',
    fontSize: '18px',
    borderLeft: '2px solid transparent',
    transition: 'all 0.15s',
    '&:hover': {
      backgroundColor: '#3a3a3a'
    },
    '&.active': {
      backgroundColor: '#1e3a5f',
      borderLeftColor: '#0078d4'
    }
  },

  // ---- Content ----
  contentArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    backgroundColor: '#1e1e1e'
  },
  appMain: {
    flex: 1,
    padding: '12px',
    overflowY: 'auto'
  },

  // ---- Footer status bar ----
  appFooter: {
    height: '24px',
    background: '#007acc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 12px',
    fontSize: '11px',
    color: '#fff'
  }
});

function App() {
  const styles = useStyles();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);

  const [navItems] = useState([
    { id: 'score', name: '成绩查询', icon: '📊', component: ScoreQuery },
    { id: 'evaluation', name: '教学评价', icon: '🏫', component: EvaluationQuery }
  ]);
  const [currentNav, setCurrentNav] = useState('score');

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
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }
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
    if (!loginForm.username || !loginForm.password) {
      setError('请输入学号和密码');
      return;
    }
    setLoading(true);
    setError('');
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
        } else {
          localStorage.removeItem('savedLogin');
        }
        setIsLoggedIn(true);
        setError('');
      } else {
        setError(data.message || '登录失败，请检查学号和密码');
      }
    } catch (err) {
      setError('网络错误，请稍后重试: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLoginForm(prev => ({ ...prev, [name]: value }));
  };

  // Login screen
  if (!isLoggedIn) {
    return (
      <div className={styles.loginContainer}>
        <Card className={styles.loginCard}>
          <CardHeader>
            <Text variant="xxLarge" weight="semibold" style={{ color: '#e0e0e0' }}>川北医助手</Text>
            <Text variant="medium" style={{ color: '#888' }}>NSMC Assistant</Text>
          </CardHeader>
          <div style={{ padding: '24px' }}>
            <form onSubmit={handleLogin} className={styles.loginForm}>
              <div className={styles.formGroup}>
                <Text variant="small" weight="medium" style={{ color: '#ccc' }}>学号</Text>
                <Input name="username" value={loginForm.username} onChange={handleInputChange} placeholder="请输入学号" />
              </div>
              <div className={styles.formGroup}>
                <Text variant="small" weight="medium" style={{ color: '#ccc' }}>密码</Text>
                <Input name="password" type="password" value={loginForm.password} onChange={handleInputChange} placeholder="请输入密码" />
              </div>
              <div className={`${styles.formGroup} ${styles.rememberMe}`}>
                <Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} label="记住账号密码" />
              </div>
              {error && <Text variant="small" className={styles.errorMessage}>{error}</Text>}
              <Button type="submit" appearance="primary" disabled={loading} className={styles.loginButton}>
                {loading ? '登录中...' : '登录'}
              </Button>
            </form>
          </div>
          <CardFooter>
            <Text variant="small" style={{ color: '#666' }}>© 2026 川北医助手 | NSMC Assistant</Text>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Main app
  return (
    <div className={styles.appContainer}>
      {/* Title bar */}
      <header className={styles.appHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.appIcon}>■</span>
          <Text variant="medium" weight="semibold" className={styles.headerTitle}>川北医助手</Text>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.userInfo}>
            <Text variant="small" className={styles.userName}>{currentUser.name}</Text>
            <Button appearance="outline" size="small" onClick={handleLogout}>退出登录</Button>
          </div>
        </div>
      </header>

      <div className={styles.appLayout}>
        {/* Sidebar - icon only */}
        <aside className={styles.sidebar}>
          {navItems.map((item) => (
            <div key={item.id}
              className={`${styles.navItem} ${currentNav === item.id ? 'active' : ''}`}
              onClick={() => setCurrentNav(item.id)}
              title={item.name}>
              <span>{item.icon}</span>
            </div>
          ))}
        </aside>

        {/* Content */}
        <div className={styles.contentArea}>
          <main className={styles.appMain}>
            {currentNav === 'score' && <ScoreQuery account={currentUser} />}
            {currentNav === 'evaluation' && <EvaluationQuery account={currentUser} />}
          </main>
          <footer className={styles.appFooter}>
            <span>川北医助手 | NSMC Assistant</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
