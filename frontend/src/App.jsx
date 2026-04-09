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

// 检查是否在Tauri环境中运行
const isTauri = typeof window !== 'undefined' && window.__TAURI__;

let Command = null;
let backendProcess = null;
let appPath = null;
let appWindow = null;

// 动态导入Tauri API
if (isTauri) {
  try {
    Command = require('@tauri-apps/api/shell').Command;
    appWindow = require('@tauri-apps/api/window').appWindow;
  } catch (e) {
    console.log('Tauri API not available in development mode');
  }
}

// 使用 makeStyles 创建样式
const useStyles = makeStyles({
  loginContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px'
  },
  loginCard: {
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
  },
  loginForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
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
    marginTop: '8px'
  },
  appContainer: {
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
    display: 'flex',
    flexDirection: 'column'
  },
  appLayout: {
    display: 'flex',
    flex: 1,
    minHeight: 0
  },
  sidebar: {
    width: '180px',
    background: '#f1f1f1',
    color: '#333',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #e0e0e0',
    transition: 'width 0.3s ease',
    overflow: 'hidden',
    '&.collapsed': {
      width: '56px'
    }
  },
  sidebarHeader: {
    padding: '12px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    background: 'white'
  },
  sidebarTitle: {
    color: '#333',
    fontSize: '14px',
    fontWeight: '600',
    marginLeft: '8px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  sidebarToggle: {
    color: '#666',
    background: 'transparent',
    border: '1px solid #e0e0e0',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: '3px',
    flexShrink: 0,
    '&:hover': {
      backgroundColor: '#e0e0e0'
    }
  },
  sidebarNav: {
    flex: 1,
    padding: '8px 0'
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    borderLeft: '3px solid transparent',
    '&:hover': {
      backgroundColor: '#e0e0e0'
    },
    '&.active': {
      backgroundColor: '#0078d4',
      color: 'white',
      borderLeftColor: '#0078d4'
    }
  },
  navIcon: {
    fontSize: '16px',
    width: '20px',
    textAlign: 'center'
  },
  navName: {
    fontSize: '13px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    '&.active': {
      color: 'white'
    }
  },
  contentArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    background: 'white'
  },
  appHeader: {
    height: '40px',
    background: '#f1f1f1',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  appMain: {
    flex: 1,
    padding: '16px',
    overflowY: 'auto',
    background: 'white'
  },
  appFooter: {
    height: '40px',
    background: '#f1f1f1',
    borderTop: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 16px',
    fontSize: '12px'
  }
});

function App() {
  const styles = useStyles();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backendStarted, setBackendStarted] = useState(false);
  
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: ''
  });
  const [rememberMe, setRememberMe] = useState(false);
  
  // 导航菜单
  const [navItems] = useState([
    {
      id: 'score',
      name: '成绩查询',
      icon: '📊',
      component: ScoreQuery
    }
  ]);
  
  const [currentNav, setCurrentNav] = useState('score');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 启动后端
  const startBackend = async () => {
    if (!isTauri || !Command) {
      console.log('非Tauri环境，跳过后端启动');
      return;
    }
    
    // 检查当前工作目录
    try {
      const { app } = await import('@tauri-apps/api');
      const appPath = await app.getAppDir();
      console.log('应用目录:', appPath);
    } catch (e) {
      console.log('无法获取应用目录:', e);
    }
    
    let retryCount = 0;
    const maxRetries = 3;
    let lastError = null;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`正在启动后端... (尝试 ${retryCount + 1}/${maxRetries})`);
        
        // 尝试多种启动方式
        let backendStarted = false;
        
        // 方式1: 使用sidecar启动后端
        try {
          console.log('尝试使用sidecar启动后端...');
          
          // 启动后端服务
          backendProcess = Command.sidecar('resources/backend.exe', [], {
            cwd: '.',
            env: {},
            shell: false
          });
          
          // 启动后端
          await backendProcess.spawn();
          console.log('使用sidecar启动后端成功！');
          backendStarted = true;
        } catch (sidecarError) {
          console.error('使用sidecar启动后端失败:', sidecarError);
          lastError = sidecarError;
          
          // 方式2: 直接运行后端可执行文件
          try {
            console.log('尝试直接运行后端可执行文件...');
            
            // 启动后端服务
            backendProcess = Command.create('resources/backend.exe', [], {
              cwd: '.',
              env: {},
              shell: false,
              stdout: 'ignore',
              stderr: 'ignore'
            });
            
            // 启动后端
            await backendProcess.spawn();
            console.log('直接运行后端可执行文件成功！');
            backendStarted = true;
          } catch (directError) {
            console.error('直接运行后端可执行文件失败:', directError);
            lastError = directError;
          }
        }
        
        if (backendStarted) {
          setBackendStarted(true);
          
          // 等待后端启动
          console.log('等待后端启动...');
          await new Promise(resolve => setTimeout(resolve, 3000)); // 等待时间
          console.log('后端启动完成！');
          
          // 测试后端是否正常运行
          try {
            console.log('测试后端连接...');
            const response = await fetch('http://localhost:5000/api/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                username: 'test',
                password: 'test'
              })
            });
            console.log('后端连接测试结果:', response.status);
            
            // 后端连接成功
            console.log('后端服务正常运行！');
            setError('');
            return;
          } catch (testError) {
            console.error('后端连接测试失败:', testError);
            lastError = testError;
            
            // 停止当前进程
            if (backendProcess) {
              try {
                await backendProcess.kill();
                console.log('已停止失败的后端进程');
              } catch (killError) {
                console.error('停止后端进程失败:', killError);
              }
            }
          }
        }
        
        // 增加重试计数
        retryCount++;
        console.log(`后端启动失败，${retryCount < maxRetries ? '正在重试...' : '已达到最大重试次数'}`);
        
        // 重试前等待
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (err) {
        console.error('启动后端失败:', err);
        lastError = err;
        retryCount++;
        
        // 重试前等待
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // 所有尝试都失败
    console.error('所有尝试都失败，后端启动失败:', lastError);
    setError('后端启动失败，请检查网络连接或重新启动应用');
  };

  // 停止后端
  const stopBackend = async () => {
    if (!isTauri || !backendProcess) {
      return;
    }
    
    try {
      console.log('正在停止后端...');
      await backendProcess.kill();
      console.log('后端已停止');
    } catch (err) {
      console.error('停止后端失败:', err);
    }
  };

  // 检查是否已登录和记住密码，并启动后端
  useEffect(() => {
    // 启动后端
    startBackend();
    
    // 检查是否已登录
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }
    
    // 检查是否有记住的密码
    const savedLogin = localStorage.getItem('savedLogin');
    if (savedLogin) {
      const loginData = JSON.parse(savedLogin);
      setLoginForm({
        username: loginData.username,
        password: loginData.password
      });
      setRememberMe(true);
    }
    
    // 监听窗口关闭事件
    if (isTauri && appWindow) {
      // 监听Tauri窗口关闭事件
      const handleClose = () => {
        stopBackend();
      };
      
      appWindow.once('close-requested', handleClose);
      
      // 组件卸载时停止后端
      return () => {
        stopBackend();
      };
    } else {
      // 普通浏览器环境
      // 组件卸载时停止后端
      return () => {
        stopBackend();
      };
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
      console.log('开始登录...');
      console.log('后端状态:', backendStarted);
      
      // 调用后端API验证登录
      console.log('尝试连接后端...');
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password
        })
      });

      console.log('后端响应状态:', response.status);
      const data = await response.json();
      console.log('后端响应数据:', data);

      if (data.success) {
        const user = {
          username: loginForm.username,
          password: loginForm.password,
          name: data.data?.name || loginForm.username
        };
        setCurrentUser(user);
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        // 记住密码
        if (rememberMe) {
          localStorage.setItem('savedLogin', JSON.stringify({
            username: loginForm.username,
            password: loginForm.password
          }));
        } else {
          localStorage.removeItem('savedLogin');
        }
        
        setIsLoggedIn(true);
        setError('');
      } else {
        setError(data.message || '登录失败，请检查学号和密码');
      }
    } catch (err) {
      console.error('登录错误:', err);
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
    setLoginForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 登录界面
  if (!isLoggedIn) {
    return (
      <div className={styles.loginContainer}>
        <Card className={styles.loginCard}>
          <CardHeader>
            <Text variant="xxLarge" weight="semibold">川北医助手</Text>
            <Text variant="medium" color="secondary">NSMC Assistant</Text>
          </CardHeader>
          <div style={{ padding: '24px' }}>
            <form onSubmit={handleLogin} className={styles.loginForm}>
              <div className={styles.formGroup}>
                <Text variant="small" weight="medium">学号</Text>
                <Input
                  name="username"
                  value={loginForm.username}
                  onChange={handleInputChange}
                  placeholder="请输入学号"
                />
              </div>
              
              <div className={styles.formGroup}>
                <Text variant="small" weight="medium">密码</Text>
                <Input
                  name="password"
                  type="password"
                  value={loginForm.password}
                  onChange={handleInputChange}
                  placeholder="请输入密码"
                />
              </div>
              
              <div className={`${styles.formGroup} ${styles.rememberMe}`}>
                <Checkbox
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  label="记住账号密码"
                />
              </div>
              
              {error && (
                <Text variant="small" className={styles.errorMessage}>
                  {error}
                </Text>
              )}
              
              <Button
                type="submit"
                appearance="primary"
                disabled={loading}
                className={styles.loginButton}
              >
                {loading ? '登录中...' : '登录'}
              </Button>
            </form>
          </div>
          <CardFooter>
            <Text variant="small" color="secondary">© 2026 川北医助手 | NSMC Assistant</Text>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 主界面
  return (
    <div className={styles.appContainer}>
      {/* 顶部标题栏 */}
      <header className={styles.appHeader}>
        <div className={styles.headerLeft}>
          <Text variant="large" weight="semibold">
            川北医助手
          </Text>
        </div>
        
        <div className={styles.headerRight}>
          <div className={styles.userInfo}>
            <Text variant="medium">{currentUser.name}</Text>
            <Button
              appearance="outline"
              size="small"
              onClick={handleLogout}
            >
              退出登录
            </Button>
          </div>
        </div>
      </header>
      
      {/* 下方内容区 */}
      <div className={styles.appLayout}>
        {/* 侧边栏导航 */}
        <aside className={styles.sidebar} style={{ width: sidebarCollapsed ? '56px' : '180px' }}>
          <div className={styles.sidebarHeader}>
            <button
              className={styles.sidebarToggle}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label="切换侧边栏"
            >
              ☰
            </button>
          </div>
          <nav className={styles.sidebarNav}>
            {navItems.map((item) => (
              <div
                key={item.id}
                className={`${styles.navItem} ${currentNav === item.id ? 'active' : ''}`}
                onClick={() => setCurrentNav(item.id)}
                title={sidebarCollapsed ? item.name : ''}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {!sidebarCollapsed && (
                  <Text variant="medium" className={`${styles.navName} ${currentNav === item.id ? 'active' : ''}`}>
                    {item.name}
                  </Text>
                )}
              </div>
            ))}
          </nav>
        </aside>
        
        {/* 主内容区 */}
        <div className={styles.contentArea}>

          
          <main className={styles.appMain}>
            {/* 成绩查询组件 */}
            {currentNav === 'score' && <ScoreQuery account={currentUser} />}
          </main>
          
          <footer className={styles.appFooter}>
            <Text variant="small" color="secondary">
              © 2026 川北医助手 | NSMC Assistant
            </Text>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;