#!/bin/bash

echo "🚀 HTML to PPT 转换器 - 开发环境初始化"
echo "=========================================="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo "✅ npm 版本: $(npm -v)"

# 安装依赖
echo ""
echo "📦 安装项目依赖..."
npm install

# 启动开发服务器
echo ""
echo "🌐 启动开发服务器..."
npm run dev
