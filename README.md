# 🦞 OpenClaw Super Dashboard

**OpenClaw Super Dashboard** 是一个专为 OpenClaw AI Gateway 设计的高级 Web 管理控制台。它不仅提供美观的响应式界面，还集成了系统守护、配置安全验证和实时监控功能。

![Dashboard Preview](https://via.placeholder.com/800x400?text=OpenClaw+Super+Dashboard)

## ✨ 核心特性

### 1. 🛡️ 智能看门狗 (Auto Watchdog)
- **进程守护**: 实时监控 Gateway 进程，意外退出自动拉起。
- **配置自愈**: 检测 `openclaw.json` 损坏时，自动从稳定备份 (`.stable_v1`) 恢复并重启服务。
- **告警广播**: 恢复操作会实时推送到前端日志窗口。

### 2. 📱 全平台响应式 UI
- **移动端适配**: 手机上自动切换为折叠侧边栏 + 卡片式视图。
- **Token 优化**: 智能处理长 Token 显示，防止溢出。
- **暗色日志**: 沉浸式实时日志流，支持自动滚动/暂停。

### 3. ⚙️ 安全配置管理
- **在线编辑**: 直接在网页上修改配置文件。
- **原子更新**: 集成后端验证逻辑，防止错误配置导致服务崩溃（配合 `safe-config-updater` 技能）。

### 4. 📊 实时监控
- **系统指标**: CPU 负载、内存使用率、运行时间。
- **业务数据**: 活跃会话列表 (Sessions)、计划任务 (Cron) 状态。
- **服务控制**: 一键 Start / Stop / Restart。

## 🚀 安装部署

### 前置要求
- Node.js v18+
- OpenClaw Gateway 已安装

### 手动运行
```bash
cd /OpenClaw/dashboard
npm install
node server.js
```
访问: `http://<服务器IP>:3000`

### 作为 Systemd 服务运行 (推荐)
本项目包含自动守护配置 `openclaw-dashboard.service`。

```bash
# 1. 复制服务文件
sudo cp openclaw-dashboard.service /etc/systemd/system/

# 2. 重新加载并启动
sudo systemctl daemon-reload
sudo systemctl enable openclaw-dashboard
sudo systemctl start openclaw-dashboard

# 3. 查看状态
sudo systemctl status openclaw-dashboard
```

## 📂 项目结构
```
/OpenClaw/dashboard
├── public/             # 前端静态资源
│   └── index.html      # 单页应用入口 (响应式)
├── server.js           # 后端服务 (Express + Socket.io + Watchdog)
├── openclaw-dashboard.service # Systemd 配置文件
└── package.json        # 依赖描述
```

## 🛠️ 技术栈
- **Backend**: Express, Socket.io, Child Process
- **Frontend**: Vanilla JS, CSS3 (Flexbox/Grid), WebSocket
- **Design**: Clean, Dark/Light Hybrid Theme

## 📝 License
MIT
