# 川北医助手 - NSMC Assistant

川北医助手是一个专为川北医学院学生设计的成绩查询工具，提供便捷的成绩查询和管理功能。

## 功能特性

- **自动登录**：支持学号密码自动登录教务系统
- **成绩查询**：查询并展示学生成绩
- **学期筛选**：支持按学期筛选成绩
- **教学评价**：一键评教，实时查看进度和结果
- **去向登记**：节假日去向登记，支持模板快速填写（开发中）

## 技术栈

### 前端

- React
- Vite
- Tauri (桌面应用框架)
- Fluent UI

### 后端

- Rust 
- Flask 
- Actix Web (Rust Web框架)

## 项目结构

```
├── backend_rust/       # Rust后端服务
│   ├── src/            # Rust源代码
│   ├── Cargo.lock      # 依赖锁定文件
│   └── Cargo.toml      # Rust项目配置
├── frontend/           # 前端应用
│   ├── dist/           # 构建输出目录
│   ├── src/            # React源代码
│   ├── src-tauri/      # Tauri配置和代码
│   ├── index.html      # 前端入口HTML
│   ├── package.json    # npm项目配置
│   └── vite.config.js  # Vite配置
├── 发布版/             # 发布版本
│   ├── resources/      # 资源文件
│   └── 川北医助手.exe   # 可执行文件
├── accounts.db         # 账户数据库
├── accounts.txt        # 账户信息文件
├── app.py               # Flask后端应用
├── score_fetcher_http.py# 成绩获取 + 评教模块
├── xg2_fetcher.py       # 学工系统去向登记爬虫
├── backend_rust/        # Rust后端 (Actix-web)
├── frontend/            # Tauri + React前端
└── README.md
```

## 安装说明

### 直接使用发布版

1. 进入 `发布版` 目录
2. 双击 `川北医助手.exe` 即可运行
3. 应用会自动启动后端服务，无需手动操作

### 从源码构建

1. **构建后端**：
   ```bash
   cd backend_rust
   cargo build --release
   ```
2. **构建前端**：
   ```bash
   cd frontend
   npm install
   npm run build
   npx tauri build
   ```
3. **复制文件**：
   - 将 `backend_rust/target/release/backend_rust.exe` 复制到 `发布版/resources/backend.exe`
   - 将 `frontend/src-tauri/target/release/app.exe` 复制到 `发布版/川北医助手.exe`

## 使用方法

1. 运行 `川北医助手.exe`
2. 在登录界面输入学号和密码
3. 点击登录按钮
4. 登录成功后，系统会自动获取并展示成绩
5. 可以使用学期筛选功能查看特定学期的成绩

## 注意事项

1. **网络连接**：使用时需要保持网络连接，确保能够访问教务系统
2. **账号安全**：请妥善保管个人账号密码，不要在公共设备上使用
3. **权限要求**：应用需要获取当前可执行文件路径的权限，用于启动后端服务
4. **兼容性**：目前仅支持Windows系统

## 常见问题

### 无法登录

- 检查学号和密码是否正确
- 检查网络连接是否正常
- 检查教务系统是否可用

### 成绩加载失败

- 检查网络连接
- 尝试重新登录
- 检查教务系统是否正在维护

### 应用无法启动

- 检查 `发布版/resources/backend.exe` 文件是否存在
- 检查系统权限是否足够

## 许可证

本项目仅供学习和个人使用，请勿用于商业用途。
