#!/bin/bash
# WeRSS 一键启动开发环境脚本（前端 + 后台）

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}🚀 WeRSS 一键启动开发环境${NC}"
echo "================================"

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}正在停止服务...${NC}"
    # 停止后台服务
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    # 停止前端服务
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    # 清理 vite 进程
    pkill -f "vite" 2>/dev/null || true
    echo -e "${GREEN}✅ 服务已停止${NC}"
    exit 0
}

# 注册清理函数
trap cleanup SIGINT SIGTERM

# ==================== OpenAI API 测试 ====================
test_openai_api() {
    # 检查 API Key 是否未设置或为占位符
    if [ -z "$OPENAI_API_KEY" ]; then
        echo -e "${YELLOW}⚠️  OPENAI_API_KEY 未配置或为占位符，跳过 API 测试${NC}"
        echo -e "${YELLOW}   提示: 如需使用 AI 标签提取功能，请在 .env 文件中配置有效的 OPENAI_API_KEY${NC}"
        echo ""
        return 0
    fi
    
    # 检查是否为占位符（如 sk-your_openai、sk-your_openai_api_key_here 等）
    case "$OPENAI_API_KEY" in
        "sk-your_openai_api_key_here"|"sk-your_openai"|"sk-***")
            echo -e "${YELLOW}⚠️  OPENAI_API_KEY 为占位符值，跳过 API 测试${NC}"
            echo -e "${YELLOW}   提示: 请在 .env 文件中配置有效的 OPENAI_API_KEY${NC}"
            echo ""
            return 0
            ;;
        sk-your*)
            echo -e "${YELLOW}⚠️  OPENAI_API_KEY 为占位符值，跳过 API 测试${NC}"
            echo -e "${YELLOW}   提示: 请在 .env 文件中配置有效的 OPENAI_API_KEY（当前值: ${OPENAI_API_KEY:0:20}...）${NC}"
            echo ""
            return 0
            ;;
    esac
    
    echo -e "${BLUE}🧪 测试 OpenAI API 连接...${NC}"
    
    # 使用 Python 测试 OpenAI API（确保环境变量传递）
    python3 << PYTHON_SCRIPT
import os
import sys

# 从环境变量获取配置
api_key = os.getenv("OPENAI_API_KEY")
base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
model = os.getenv("OPENAI_MODEL", "gpt-4o")

# 检查是否为占位符或未设置
placeholder_patterns = [
    "sk-your_openai_api_key_here",
    "sk-your_openai",
    "sk-***",
    "sk-your_",
]

is_placeholder = False
if not api_key:
    is_placeholder = True
else:
    api_key_lower = api_key.lower()
    for pattern in placeholder_patterns:
        if api_key_lower.startswith(pattern.lower()):
            is_placeholder = True
            break
    # 检查是否以 sk-your 开头（占位符模式）
    if api_key_lower.startswith("sk-your"):
        is_placeholder = True

if is_placeholder:
    print("⚠️  OPENAI_API_KEY 未配置或为占位符，跳过 API 测试")
    print("   提示: 如需使用 AI 标签提取功能，请在 .env 文件中配置有效的 OPENAI_API_KEY")
    sys.exit(0)

print(f"测试配置:")
print(f"  API Key: {api_key[:15]}..." if api_key and len(api_key) > 15 else f"  API Key: {api_key or '未设置'}")
print(f"  Base URL: {base_url}")
print(f"  Model: {model}")
print()

try:
    from openai import OpenAI
except ImportError:
    print("⚠️  openai 模块未安装，跳过 API 测试")
    print("   安装命令: pip install openai")
    sys.exit(0)

try:
    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
    )
    
    # 发送一个简单的测试请求
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "user", "content": "Hello"}
        ],
        max_tokens=10,
        timeout=15
    )
    
    if response.choices and len(response.choices) > 0:
        content = response.choices[0].message.content
        print(f"✅ OpenAI API 测试成功")
        print(f"   响应: {content}")
        sys.exit(0)
    else:
        print("❌ API 响应异常：未返回内容")
        sys.exit(1)
        
except Exception as e:
    error_msg = str(e)
    error_type = type(e).__name__
    
    print(f"❌ API 测试失败")
    print(f"   错误类型: {error_type}")
    
    # 检查 HTTP 状态码
    if hasattr(e, 'status_code'):
        status_code = e.status_code
        print(f"   HTTP 状态码: {status_code}")
        if status_code == 401:
            print(f"   原因: API Key 无效或未授权")
        elif status_code == 404:
            print(f"   原因: 模型 '{model}' 不存在或 Base URL '{base_url}' 错误")
        elif status_code == 429:
            print(f"   原因: 请求频率过高")
        elif status_code >= 500:
            print(f"   原因: 服务器错误")
    
    # 检查响应体
    if hasattr(e, 'response') and e.response is not None:
        try:
            error_body = e.response.json() if hasattr(e.response, 'json') else str(e.response)
            print(f"   响应详情: {error_body}")
        except:
            pass
    
    # 通用错误信息
    if "401" in error_msg or "Unauthorized" in error_msg or "authentication" in error_msg.lower():
        print(f"   原因: API Key 无效或未授权")
    elif "404" in error_msg or "Not Found" in error_msg or "model" in error_msg.lower():
        print(f"   原因: 模型 '{model}' 可能不存在，请检查模型名称")
        print(f"   提示: 请确认 Base URL '{base_url}' 支持模型 '{model}'")
    elif "timeout" in error_msg.lower():
        print(f"   原因: 请求超时（可能是网络问题或服务器响应慢）")
    else:
        print(f"   错误信息: {error_msg[:200]}")
    
    sys.exit(1)
PYTHON_SCRIPT
    
    TEST_RESULT=$?
    if [ $TEST_RESULT -eq 0 ]; then
        echo -e "${GREEN}✅ OpenAI API 测试通过${NC}"
    elif [ $TEST_RESULT -eq 1 ]; then
        echo -e "${RED}❌ OpenAI API 测试失败，请检查配置${NC}"
        echo -e "${YELLOW}   提示: 请确保 OPENAI_API_KEY 正确，且网络连接正常${NC}"
    else
        echo -e "${YELLOW}⚠️  跳过 OpenAI API 测试${NC}"
    fi
    echo ""
}

# ==================== 后台服务启动 ====================
start_backend() {
    echo -e "${BLUE}📦 启动后台服务...${NC}"
    
    # 检查 Python 版本
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}❌ 错误: 未找到 python3，请先安装 Python 3.11+${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Python 版本: $(python3 --version)${NC}"
    
    # 检查是否使用 uv（默认使用 uv，按回车即选择）
    USE_UV=true
    if command -v uv &> /dev/null; then
        read -p "是否使用 uv 创建虚拟环境? (Y/n，默认使用 uv): " -n 1 -r
        echo
        # 如果输入为空（回车）或输入 y/Y，则使用 uv；输入 n 则不使用
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            USE_UV=false
        else
            USE_UV=true
        fi
    else
        echo -e "${YELLOW}⚠️  未找到 uv 命令，将使用传统方式创建虚拟环境${NC}"
        USE_UV=false
    fi
    
    # 检查虚拟环境
    if [ "$USE_UV" = true ]; then
        # 使用 uv 创建虚拟环境
        if [ ! -d ".venv" ]; then
            echo -e "${YELLOW}📦 使用 uv 创建虚拟环境...${NC}"
            uv venv
        fi
        VENV_DIR=".venv"
    else
        # 使用传统方式创建虚拟环境
        if [ ! -d "venv" ]; then
            echo -e "${YELLOW}📦 创建虚拟环境...${NC}"
            python3 -m venv venv
        fi
        VENV_DIR="venv"
    fi
    
    # 激活虚拟环境
    echo -e "${YELLOW}🔧 激活虚拟环境...${NC}"
    source $VENV_DIR/bin/activate
    
    # 检查依赖
    if [ ! -f "$VENV_DIR/.installed" ] || [ "requirements.txt" -nt "$VENV_DIR/.installed" ]; then
        echo -e "${YELLOW}📥 安装 Python 依赖...${NC}"
        if [ "$USE_UV" = true ]; then
            uv pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple || \
            uv pip install -r requirements.txt
        else
            pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple || \
            pip install -r requirements.txt
        fi
        touch $VENV_DIR/.installed
    else
        echo -e "${GREEN}✅ Python 依赖已安装${NC}"
    fi
    
    # 检查配置文件
    if [ ! -f "config.yaml" ]; then
        echo -e "${YELLOW}📝 创建配置文件...${NC}"
        cp config.example.yaml config.yaml
    fi
    
    # 检查并启动 Docker 数据库服务
    echo -e "${BLUE}🗄️  检查数据库服务...${NC}"
    DOCKER_COMPOSE_FILE="../docker-compose.dev.yml"
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        DOCKER_COMPOSE_FILE="docker-compose.dev.yml"
    fi
    
    if command -v docker-compose &> /dev/null || command -v docker &> /dev/null; then
        # 检查 PostgreSQL 容器是否运行
        if ! docker ps | grep -q "postgres-dev"; then
            echo -e "${YELLOW}📦 启动 PostgreSQL 数据库服务...${NC}"
            if [ -f "$DOCKER_COMPOSE_FILE" ]; then
                cd ..
                docker-compose -f docker-compose.dev.yml up -d postgres
                cd werss
                echo -e "${YELLOW}⏳ 等待数据库服务就绪...${NC}"
                sleep 5
            else
                echo -e "${YELLOW}⚠️  未找到 docker-compose.dev.yml，请手动启动数据库服务${NC}"
            fi
        else
            echo -e "${GREEN}✅ 数据库服务已运行${NC}"
        fi
        
        # 确保 werss_db 数据库存在
        if docker ps | grep -q "postgres-dev"; then
            echo -e "${YELLOW}🔍 检查数据库 werss_db 是否存在...${NC}"
            # 从环境变量读取配置
            if [ -f ".env" ]; then
                source .env 2>/dev/null || true
            fi
            POSTGRES_USER=${POSTGRES_USER:-admin}
            POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-your_password}
            POSTGRES_DB=${POSTGRES_DB:-werss_db}
            
            # 检查数据库是否存在，不存在则创建（使用 postgres 系统数据库连接）
            DB_EXISTS=$(docker exec postgres-dev psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" 2>/dev/null || echo "0")
            if [ "$DB_EXISTS" != "1" ]; then
                echo -e "${YELLOW}📦 创建数据库 $POSTGRES_DB...${NC}"
                docker exec postgres-dev psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB;" 2>/dev/null && \
                echo -e "${GREEN}✅ 数据库 $POSTGRES_DB 创建成功${NC}" || \
                echo -e "${YELLOW}⚠️  数据库可能已存在或创建失败${NC}"
            else
                echo -e "${GREEN}✅ 数据库 $POSTGRES_DB 已存在${NC}"
            fi
        fi
    else
        echo -e "${YELLOW}⚠️  未找到 Docker，请确保数据库服务已启动${NC}"
    fi
    
    # 从主项目的 .env 文件加载所有环境变量
    if [ -f ".env" ]; then
        echo -e "${YELLOW}📝 加载外层 .env 文件...${NC}"
        # 使用 source 加载所有环境变量（包括 USERNAME, PASSWORD, OPENAI_API_KEY 等）
        set -a  # 自动导出所有变量
        source .env 2>/dev/null || true
        set +a  # 关闭自动导出
        
        # 显式导出 OpenAI 相关环境变量（确保传递给 Python 进程）
        if grep -q "^OPENAI_API_KEY=" .env 2>/dev/null; then
            export OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            echo -e "${GREEN}✅ 已加载 OPENAI_API_KEY${NC}"
        fi
        if grep -q "^OPENAI_BASE_URL=" .env 2>/dev/null; then
            export OPENAI_BASE_URL=$(grep "^OPENAI_BASE_URL=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        if grep -q "^OPENAI_MODEL=" .env 2>/dev/null; then
            export OPENAI_MODEL=$(grep "^OPENAI_MODEL=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        
        # 显式导出文章标签提取相关环境变量
        if grep -q "^ARTICLE_TAG_EXTRACT_METHOD=" .env 2>/dev/null; then
            export ARTICLE_TAG_EXTRACT_METHOD=$(grep "^ARTICLE_TAG_EXTRACT_METHOD=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            echo -e "${GREEN}✅ 已加载 ARTICLE_TAG_EXTRACT_METHOD=${ARTICLE_TAG_EXTRACT_METHOD}${NC}"
        fi
        if grep -q "^ARTICLE_TAG_MAX_TAGS=" .env 2>/dev/null; then
            export ARTICLE_TAG_MAX_TAGS=$(grep "^ARTICLE_TAG_MAX_TAGS=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        if grep -q "^ARTICLE_TAG_AUTO_EXTRACT=" .env 2>/dev/null; then
            export ARTICLE_TAG_AUTO_EXTRACT=$(grep "^ARTICLE_TAG_AUTO_EXTRACT=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        
        # 显式导出 MinIO 相关环境变量
        if grep -q "^MINIO_ENABLED=" .env 2>/dev/null; then
            export MINIO_ENABLED=$(grep "^MINIO_ENABLED=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            echo -e "${GREEN}✅ 已加载 MINIO_ENABLED=${MINIO_ENABLED}${NC}"
        fi
        if grep -q "^MINIO_ENDPOINT=" .env 2>/dev/null; then
            export MINIO_ENDPOINT=$(grep "^MINIO_ENDPOINT=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        if grep -q "^MINIO_ACCESS_KEY=" .env 2>/dev/null; then
            export MINIO_ACCESS_KEY=$(grep "^MINIO_ACCESS_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        if grep -q "^MINIO_SECRET_KEY=" .env 2>/dev/null; then
            export MINIO_SECRET_KEY=$(grep "^MINIO_SECRET_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        if grep -q "^MINIO_BUCKET=" .env 2>/dev/null; then
            export MINIO_BUCKET=$(grep "^MINIO_BUCKET=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        if grep -q "^MINIO_SECURE=" .env 2>/dev/null; then
            export MINIO_SECURE=$(grep "^MINIO_SECURE=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        if grep -q "^MINIO_PUBLIC_URL=" .env 2>/dev/null; then
            export MINIO_PUBLIC_URL=$(grep "^MINIO_PUBLIC_URL=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        fi
        
        echo -e "${GREEN}✅ 环境变量已加载${NC}"
        
        # 测试 OpenAI API（如果已配置）
        if [ ! -z "$OPENAI_API_KEY" ]; then
            test_openai_api
        fi
    fi
    
    # 设置开发环境变量
    export DEBUG=True
    export AUTO_RELOAD=True
    export LOG_LEVEL=DEBUG
    export ENABLE_JOB=True
    export THREADS=1
    
    # 统一数据库配置（从环境变量或使用默认值）
    if [ -z "$DB" ]; then
        # 从主项目的 .env 文件读取配置，或使用默认值
        if [ -f ".env" ]; then
            # 使用 grep 读取，避免 source 可能的问题（如果上面的 source 失败）
            if [ -z "$POSTGRES_USER" ]; then
            export POSTGRES_USER=$(grep "^POSTGRES_USER=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "admin")
            fi
            if [ -z "$POSTGRES_PASSWORD" ]; then
            export POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
            fi
            if [ -z "$POSTGRES_DB" ]; then
            export POSTGRES_DB=$(grep "^POSTGRES_DB=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "werss_db")
            fi
        fi
        
        # 如果密码为空，尝试从 Docker 容器获取
        if [ -z "$POSTGRES_PASSWORD" ] && docker ps | grep -q "postgres-dev"; then
            POSTGRES_PASSWORD=$(docker exec postgres-dev printenv POSTGRES_PASSWORD 2>/dev/null || echo "")
        fi
        
        # 设置默认值
        POSTGRES_USER=${POSTGRES_USER:-admin}
        POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-your_password}
        POSTGRES_DB=${POSTGRES_DB:-werss_db}
        
        export DB="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
        echo -e "${GREEN}✅ 数据库连接: postgresql://${POSTGRES_USER}:***@localhost:5432/${POSTGRES_DB}${NC}"
    else
        echo -e "${GREEN}✅ 使用环境变量 DB 配置${NC}"
    fi
    
    # 确保登录相关的环境变量已设置（支持 WERSS_USERNAME/WERSS_PASSWORD 或 USERNAME/PASSWORD）
    if [ -z "$USERNAME" ]; then
        if [ -n "$WERSS_USERNAME" ]; then
            export USERNAME=$WERSS_USERNAME
        else
            export USERNAME=${USERNAME:-admin}
            echo -e "${YELLOW}⚠️  USERNAME 未设置，使用默认值: admin${NC}"
        fi
    fi
    
    if [ -z "$PASSWORD" ]; then
        if [ -n "$WERSS_PASSWORD" ]; then
            export PASSWORD=$WERSS_PASSWORD
        else
            export PASSWORD=${PASSWORD:-admin@123}
            echo -e "${YELLOW}⚠️  PASSWORD 未设置，使用默认值: admin@123${NC}"
        fi
    fi
    
    echo -e "${GREEN}✅ 登录用户名: ${USERNAME}${NC}"
    
    # 询问是否初始化数据库
    if [ ! -f "data/.initialized" ]; then
        echo -e "${YELLOW}🗄️  首次运行，需要初始化数据库...${NC}"
        read -p "是否现在初始化数据库? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            $VENV_DIR/bin/python main.py -init True
            touch data/.initialized
        fi
    fi
    
    # 检查端口是否被占用
    PORT=8001
    if lsof -i :$PORT >/dev/null 2>&1 || netstat -tlnp 2>/dev/null | grep -q ":$PORT " || ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
        echo -e "${YELLOW}⚠️  端口 $PORT 已被占用${NC}"
        echo -e "${YELLOW}正在尝试停止占用端口的进程...${NC}"
        # 尝试停止占用端口的进程
        if command -v lsof >/dev/null 2>&1; then
            PID=$(lsof -ti :$PORT 2>/dev/null | head -1)
        elif command -v fuser >/dev/null 2>&1; then
            PID=$(fuser $PORT/tcp 2>/dev/null | awk '{print $NF}')
        else
            PID=$(netstat -tlnp 2>/dev/null | grep ":$PORT " | awk '{print $7}' | cut -d'/' -f1 | head -1)
        fi
        if [ ! -z "$PID" ] && [ "$PID" != "$$" ]; then
            echo -e "${YELLOW}停止进程 PID: $PID${NC}"
            kill $PID 2>/dev/null && sleep 2 || true
        fi
        # 再次检查端口
        if lsof -i :$PORT >/dev/null 2>&1 || netstat -tlnp 2>/dev/null | grep -q ":$PORT " || ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
            echo -e "${RED}❌ 端口 $PORT 仍被占用，请手动停止占用端口的进程${NC}"
            echo -e "${YELLOW}   或修改 PORT 环境变量使用其他端口${NC}"
            exit 1
        fi
    fi
    
    # 启动后台服务
    echo -e "${GREEN}🎯 启动后台服务器...${NC}"
    # 使用虚拟环境中的 Python，确保依赖正确加载（特别是后台运行时）
    # 环境变量已通过 export 导出，子进程会自动继承
    # 注意：使用 nohup 和重定向输出，确保可以看到日志
    $VENV_DIR/bin/python main.py -job True -init False > backend.log 2>&1 &
    BACKEND_PID=$!
    echo -e "${GREEN}✅ 后台服务 PID: $BACKEND_PID${NC}"
    echo -e "${YELLOW}📝 后端日志文件: backend.log (使用 'tail -f backend.log' 查看实时日志)${NC}"
    
    # 等待后台服务启动
    echo -e "${YELLOW}⏳ 等待后台服务启动...${NC}"
    for i in {1..30}; do
        if curl -s http://localhost:8001/api/docs > /dev/null 2>&1; then
            echo -e "${GREEN}✅ 后台服务已启动${NC}"
            break
        fi
        sleep 1
    done
}

# ==================== 前端服务启动 ====================
start_frontend() {
    echo -e "${BLUE}🎨 启动前端服务...${NC}"
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ 错误: 未找到 node，请先安装 Node.js${NC}"
        exit 1
    fi
    
    # 检查 pnpm
    if ! command -v pnpm &> /dev/null; then
        echo -e "${RED}❌ 错误: 未找到 pnpm，请先安装 pnpm${NC}"
        echo "   安装命令: npm install -g pnpm"
        exit 1
    fi
    
    cd web_ui
    
    # 检查依赖
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}📥 安装前端依赖...${NC}"
        pnpm install
    else
        echo -e "${GREEN}✅ 前端依赖已安装${NC}"
    fi
    
    # 检查环境变量文件
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}📝 创建前端环境变量文件...${NC}"
        echo "VITE_API_BASE_URL=http://localhost:8001" > .env
    fi
    
    # 启动前端服务
    echo -e "${GREEN}🎯 启动前端开发服务器...${NC}"
    pnpm dev &
    FRONTEND_PID=$!
    
    cd ..
    
    # 等待前端服务启动
    echo -e "${YELLOW}⏳ 等待前端服务启动...${NC}"
    for i in {1..30}; do
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            echo -e "${GREEN}✅ 前端服务已启动${NC}"
            break
        fi
        sleep 1
    done
}

# ==================== 主流程 ====================
main() {
    # 启动后台服务
    start_backend
    
    # 启动前端服务
    start_frontend
    
    # 显示访问信息
    echo ""
    echo "================================"
    echo -e "${GREEN}✅ 开发环境启动完成！${NC}"
    echo ""
    echo -e "${BLUE}访问地址:${NC}"
    echo -e "  前端界面: ${GREEN}http://localhost:5173${NC}"
    echo -e "  后台 API: ${GREEN}http://localhost:8001/api${NC}"
    echo -e "  API 文档: ${GREEN}http://localhost:8001/api/docs${NC}"
    echo ""
    echo -e "${YELLOW}📝 查看后端日志:${NC}"
    echo -e "  ${GREEN}tail -f backend.log${NC}  (实时查看)"
    echo -e "  ${GREEN}cat backend.log${NC}      (查看全部)"
    echo ""
    echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"
    echo "================================"
    echo ""
    
    # 等待用户中断
    wait
}

# 运行主流程
main

