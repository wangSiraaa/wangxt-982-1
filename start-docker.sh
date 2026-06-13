#!/bin/bash

echo "========================================="
echo "  园区会议室资源协同系统 - Docker启动"
echo "========================================="
echo ""

echo "[1/3] 检查 Docker 环境..."
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi
echo "✅ Docker 版本: $(docker --version)"

if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到 docker-compose"
    exit 1
fi

echo ""
echo "[2/3] 构建并启动容器..."
docker-compose up -d --build

echo ""
echo "[3/3] 等待服务启动..."
sleep 5

echo ""
echo "========================================="
echo "  服务已启动!"
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:3001"
echo "========================================="
echo ""
echo "查看日志: docker-compose logs -f"
echo "停止服务: docker-compose down"
echo ""
