# 🦞 OpenClaw Dashboard

**OpenClaw Dashboard** 是一个专为 OpenClaw AI Gateway 设计的 Web 管理控制台。提供美观的响应式界面，集成了系统监控、配置管理和实时日志功能。

## ✨ 核心特性

### 1. 📱 全平台响应式 UI
- **移动端适配**: 手机上自动切换为折叠侧边栏 + 卡片式视图
- **暗色日志**: 沉浸式实时日志流，支持自动滚动/暂停
- **无需验证**: 本地访问，打开即用

### 2. 📊 实时监控
- **系统指标**: CPU 负载、内存使用率、运行时间
- **业务数据**: 活跃会话列表 (Sessions)、计划任务 (Cron) 状态
- **服务控制**: 一键 Start / Stop / Restart

### 3. ⚙️ 配置管理
- **在线编辑**: 直接在网页上修改 openclaw.json 配置文件
- **配置验证**: 保存前自动验证 JSON 格式
- **备份恢复**: 自动备份历史配置，支持一键恢复

### 4. 🛡️ 智能看门狗 (Auto Watchdog)
- **进程守护**: 实时监控 Gateway 进程，意外退出自动拉起
- **配置自愈**: 检测配置文件损坏时自动从稳定备份恢复
- **告警广播**: 恢复操作实时推送到前端日志窗口

## 🚀 快速开始

### 一键启动（推荐）
```bash
/openclaw-data/openclaw-dashboard/start.sh
```

### 手动运行
```bash
cd /openclaw-data/openclaw-dashboard
npm install
node server.js
```

访问：**http://localhost:3000**

### 作为 Systemd 服务运行
```bash
# 复制服务文件
sudo cp openclaw-dashboard.service /etc/systemd/system/

# 重新加载并启动
sudo systemctl daemon-reload
sudo systemctl enable openclaw-dashboard
sudo systemctl start openclaw-dashboard

# 查看状态
sudo systemctl status openclaw-dashboard
```

## 📂 项目结构

```
openclaw-dashboard/
├── public/                      # 前端静态资源
│   └── index.html               # 单页应用入口 (响应式)
├── server.js                    # 后端服务 (Express + Socket.io + Watchdog)
├── start.sh                     # 一键启动脚本
├── openclaw-dashboard.service   # Systemd 配置文件
├── logs/                        # 日志目录
│   └── dashboard.log
└── package.json                 # 依赖描述
```

## 🛠️ 技术栈

- **Backend**: Express, Socket.io, Child Process
- **Frontend**: Vanilla JS, CSS3 (Flexbox/Grid), WebSocket
- **Design**: Clean, Dark/Light Hybrid Theme

## 🔐 安全说明

- **本地访问**: 默认仅监听本地，无需身份验证
- **如需外网访问**: 建议配置防火墙或通过反向代理添加认证
- **配置备份**: 自动保留最近 10 个配置备份

## 📝 功能说明

### 仪表盘
- 系统运行时间、内存使用、CPU 负载
- Gateway 服务状态和控制按钮
- 网关 Token、端口、版本信息

### 实时日志
- 实时查看 OpenClaw Gateway 日志
- 支持自动滚动/暂停
- 日志级别高亮显示

### 会话管理
- 查看活跃会话列表
- 查看 Cron 计划任务状态

### 配置编辑
- 在线编辑 openclaw.json
- JSON 格式验证
- 配置备份和恢复

## 📝 License

MIT
