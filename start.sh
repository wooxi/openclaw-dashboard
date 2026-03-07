#!/bin/bash

# OpenClaw Dashboard 一键启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🌸 OpenClaw Dashboard 启动中..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未找到 Node.js，请先安装 Node.js v18+"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，安装依赖..."
    npm install
fi

# 启动服务
echo "✅ 启动 Dashboard 服务..."
echo "🌐 访问地址：http://localhost:3000"
echo "🔐 无需验证，直接访问"
echo ""

node server.js
