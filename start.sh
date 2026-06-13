#!/bin/bash

echo "========================================="
echo "  园区会议室资源协同系统 - 启动脚本"
echo "========================================="
echo ""

echo "[1/4] 检查 Node.js 环境..."
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js 20+"
    exit 1
fi
echo "✅ Node.js 版本: $(node --version)"

echo ""
echo "[2/4] 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖中..."
    npm install
else
    echo "✅ 依赖已存在"
fi

echo ""
echo "[3/4] 初始化数据库..."
echo "✅ SQLite 内存数据库将在服务启动时自动初始化"

echo ""
echo "[4/4] 启动服务..."
echo ""
echo "========================================="
echo "  服务地址:"
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:3001"
echo "========================================="
echo ""
echo "可用演示账号:"
echo "  - admin      行政管理员"
echo "  - employee   员工"
echo "  - frontdesk  前台"
echo "  - equipadmin 设备管理员"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

npm run dev
