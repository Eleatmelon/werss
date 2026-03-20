# WeRSS 开发环境快速开始指南

## 📋 目录

1. [方式一：本地开发（推荐）](#方式一本地开发推荐)
2. [方式二：Docker 开发](#方式二docker-开发)
3. [开发工作流](#开发工作流)
4. [开发模式配置](#开发模式配置)
5. [常见问题](#常见问题)

---

## 🚀 方式一：本地开发（推荐）

### 前置要求

- Python 3.11+
- PostgreSQL（或 SQLite）
- 系统依赖（见下方）

### 步骤 1: 安装系统依赖

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y \
    wget git build-essential zlib1g-dev \
    libgdbm-dev libnss3-dev libssl-dev libreadline-dev \
    libffi-dev libsqlite3-dev procps
```

**macOS:**
```bash
brew install python@3.11
```

### 步骤 2: 创建虚拟环境

**方式一：使用 uv（推荐，更快）**
```bash
cd /path/to/werss

# 安装 uv（如果还没有）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 创建虚拟环境（默认创建 .venv）
uv venv

# 激活虚拟环境
source .venv/bin/activate  # Linux/Mac
# 或
.venv\Scripts\activate  # Windows
```

**方式二：使用传统 venv**
```bash
cd /path/to/werss

# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows
```

### 步骤 3: 安装 Python 依赖

**使用 pip（传统方式）：**
```bash
# 使用国内镜像加速
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

**使用 uv（推荐，更快）：**
```bash
# 确保虚拟环境已激活
source .venv/bin/activate  # 或 source venv/bin/activate

# 使用 uv 安装依赖（如果使用 uv 创建的虚拟环境）
uv pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 或使用默认源
uv pip install -r requirements.txt
```

> **注意**：如果使用 `uv venv` 创建虚拟环境，虚拟环境目录是 `.venv`（不是 `venv`）。激活方式相同：`source .venv/bin/activate`

### 步骤 4: 配置环境变量

创建 `.env` 文件（或直接导出环境变量）：

```bash
# 数据库配置（使用 PostgreSQL）
export DB=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_WERSS_DB}

# 用户认证（首次运行需要设置）
export USERNAME=admin
export PASSWORD=your_password

# 开发环境配置
export DEBUG=True
export AUTO_RELOAD=True  # 启用代码自动重载
export PORT=8001
export LOG_LEVEL=DEBUG

# 服务器配置
export ENABLE_JOB=True   # 启用定时任务
export THREADS=1         # 开发环境使用单线程
```

或者创建 `config.yaml`（从模板复制）：

```bash
cp config.example.yaml config.yaml
# 编辑 config.yaml，修改数据库连接等配置
```

### 步骤 5: 初始化数据库

```bash
# 初始化数据库和创建默认用户
python main.py -init True
```

### 步骤 6: 启动开发服务器

**方式1: 完整启动（包含定时任务）**
```bash
python main.py -job True -init False
```

**方式2: 仅启动 API 服务器（不启动定时任务）**
```bash
python main.py -job False -init False
```

**方式3: 使用 uvicorn 直接启动（更灵活）**
```bash
uvicorn web:app --host 0.0.0.0 --port 8001 --reload --reload-dir core --reload-dir apis
```

### 步骤 7: 访问服务

- **Web 界面**: http://localhost:8001
- **API 文档**: http://localhost:8001/api/docs
- **ReDoc 文档**: http://localhost:8001/api/redoc

---

## 🐳 方式二：Docker 开发

### 快速开始

```bash
# 1. 进入主项目目录
cd /path/to/werss

# 2. 确保 PostgreSQL 已启动
docker-compose -f docker-compose.dev.yml up -d postgres

# 3. 启动 werss 服务（自动构建）
docker-compose -f docker-compose.dev.yml up -d --build werss

# 4. 查看日志
docker-compose -f docker-compose.dev.yml logs -f werss

# 5. 进入容器调试
docker exec -it werss-dev bash
```

### Docker 开发模式特点

- ✅ 自动构建镜像（使用 `Dockerfile.cn`）
- ✅ 代码修改需要重新构建才能生效
- ✅ 数据持久化到 `./data/werss-data`
- ✅ 与 PostgreSQL、MinIO 等服务在同一网络

### 代码修改后重新构建

```bash
# 方式1: 重新构建并启动
docker-compose -f docker-compose.dev.yml up -d --build werss

# 方式2: 仅重新构建
docker-compose -f docker-compose.dev.yml build werss
docker-compose -f docker-compose.dev.yml restart werss
```

### 直接使用 Docker

```bash
cd /path/to/werss

# 构建镜像
docker build -f Dockerfile.cn -t werss:dev .

# 运行容器
docker run -d \
  --name werss-dev \
  -p 8001:8001 \
  -e DB=postgresql://user:pass@host.docker.internal:5432/werss_db \
  -e USERNAME=admin \
  -e PASSWORD=your_password \
  -e DEBUG=True \
  -e AUTO_RELOAD=False \
  -v $(pwd)/data:/app/data \
  werss:dev

# 查看日志
docker logs -f werss-dev

# 进入容器调试
docker exec -it werss-dev bash
```

---

## 🔧 开发工作流

### 1. 代码修改和自动重载

**本地开发模式**（推荐）：
- 设置 `AUTO_RELOAD=True` 后，修改 `core/` 或 `apis/` 下的代码会自动重启
- 无需手动重启服务

**Docker 模式**：
- 代码修改后需要重新构建镜像
- 或使用 volume 挂载代码目录（需要修改 docker-compose.dev.yml）

### 2. 添加新 API

```python
# 1. 在 apis/ 目录下创建新文件
# apis/my_feature.py
from fastapi import APIRouter
from core.config import cfg

router = APIRouter(prefix="/my-feature", tags=["我的功能"])

@router.get("/")
async def my_endpoint():
    return {"message": "Hello"}

# 2. 在 web.py 中注册路由
from apis.my_feature import router as my_feature_router
api_router.include_router(my_feature_router)
```

### 3. 修改数据库模型

```python
# 1. 在 core/models/ 下修改模型
# core/models/article.py
from core.models.base import Base
from sqlalchemy import Column, String

class Article(Base):
    __tablename__ = "articles"
    new_field = Column(String(255))  # 添加新字段

# 2. 运行数据库迁移
python main.py -init True
```

### 4. 调试技巧

**查看日志**：
```bash
# 本地开发：日志直接输出到终端
python main.py -job True -init False

# Docker 开发：查看容器日志
docker-compose -f docker-compose.dev.yml logs -f werss
```

**API 测试**：
- 访问 http://localhost:8001/api/docs 使用 Swagger UI 测试 API
- 或使用 Postman、curl 等工具

**数据库操作**：
```bash
# 连接 PostgreSQL
psql -h localhost -U ${POSTGRES_USER} -d ${POSTGRES_WERSS_DB}

# 查看表结构
\dt

# 查询数据
SELECT * FROM articles LIMIT 10;

# SQLite（如果使用）
sqlite3 data/db.db
```

---

## ⚙️ 开发模式配置

### 启用自动重载

**本地运行:**
```bash
export AUTO_RELOAD=True
python main.py -job True -init False
```

**Docker 运行:**
```yaml
# docker-compose.dev.yml
environment:
  - AUTO_RELOAD=True
```

**注意**: Docker 环境下自动重载需要挂载代码目录：
```yaml
volumes:
  - ./werss:/app  # 挂载代码目录
```

### 启用调试模式

```bash
export DEBUG=True
export LOG_LEVEL=DEBUG
```

### 禁用定时任务（仅测试 API）

```bash
export ENABLE_JOB=False
python main.py -job False -init False
```

### 单线程运行（便于调试）

```bash
export THREADS=1
python main.py -job True -init False
```

### 环境变量优先级

1. **环境变量**（最高优先级）
2. `config.yaml`
3. `config.example.yaml` 默认值

### 开发环境推荐配置

```bash
# 开发模式
export DEBUG=True
export AUTO_RELOAD=True
export LOG_LEVEL=DEBUG

# 数据库配置
export DB=postgresql://user:pass@localhost:5432/werss_db

# 用户认证
export USERNAME=admin
export PASSWORD=your_password

# 服务器配置
export PORT=8001
export THREADS=1  # 开发环境使用单线程
export ENABLE_JOB=True  # 启用定时任务
```

---

## 🐛 常见问题

### 问题1: 端口被占用

```bash
# 检查端口占用
lsof -i :8001  # Linux/Mac
netstat -ano | findstr :8001  # Windows

# 修改端口
export PORT=8002
python main.py -job True -init False
```

### 问题2: 数据库连接失败

**检查配置:**
```bash
# 确认环境变量
echo $DB

# 测试连接
psql $DB  # PostgreSQL
```

**Docker 环境注意事项**：
- 确保使用服务名 `postgres` 而不是 `localhost`
- 数据库连接字符串：`postgresql://user:pass@postgres:5432/werss_db`

### 问题3: 依赖安装失败

```bash
# 使用国内镜像
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 或使用阿里云镜像
pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

# 或使用 uv（推荐）
uv pip install -r requirements.txt
```

### 问题4: Playwright 浏览器未安装

```bash
# 安装浏览器（需要先安装 playwright）
pip install playwright
playwright install firefox  # 或 webkit, chromium

# Docker 环境需要设置环境变量
export INSTALL=True
```

### 问题5: 权限问题

```bash
# 确保脚本有执行权限
chmod +x install.sh start.sh

# 确保数据目录可写
mkdir -p data
chmod 755 data
```

### 问题6: 代码修改不生效

1. **检查自动重载是否启用:**
   ```bash
   echo $AUTO_RELOAD  # 应该是 True
   ```

2. **手动重启服务:**
   ```bash
   # 停止当前进程（Ctrl+C）
   # 重新启动
   python main.py -job True -init False
   ```

3. **Docker 环境需要重新构建:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d --build werss
   ```

---

## 📝 快速命令参考

### 本地开发

```bash
# 完整启动流程
cd /path/to/werss
source venv/bin/activate
export DB=postgresql://user:pass@localhost:5432/werss_db
export DEBUG=True AUTO_RELOAD=True
python main.py -job True -init False
```

### Docker 开发

```bash
# 启动
cd /path/to/werss
docker-compose -f docker-compose.dev.yml up -d --build werss

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f werss

# 重启
docker-compose -f docker-compose.dev.yml restart werss

# 停止
docker-compose -f docker-compose.dev.yml stop werss
```

### 调试命令

```bash
# 进入容器
docker exec -it werss-dev bash

# 查看 Python 进程
ps aux | grep python

# 查看端口监听
netstat -tlnp | grep 8001
```

---

## 🎯 推荐开发流程

1. **首次设置**：
   ```bash
   # 本地开发环境
   cd /path/to/werss
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   export DB=postgresql://user:pass@localhost:5432/werss_db
   python main.py -init True
   ```

2. **日常开发**：
   ```bash
   # 启动开发服务器（自动重载）
   export DEBUG=True AUTO_RELOAD=True
   python main.py -job True -init False
   ```

3. **测试验证**：
   - 访问 http://localhost:8001/api/docs 测试 API
   - 查看日志确认功能正常

4. **提交代码**：
   ```bash
   git add .
   git commit -m "feat: 添加新功能"
   git push
   ```

---

## 💡 开发建议

1. **优先使用本地开发模式**进行代码修改和调试（更快、更灵活）
2. **使用 Docker 模式**进行集成测试和部署验证
3. **启用 DEBUG 模式**查看详细日志和错误信息
4. **使用 API 文档**（Swagger UI）测试接口功能
5. **定期备份数据库**（开发时也很重要）
6. **遵循代码规范**：Python PEP 8，使用类型提示

---

## 📚 相关文档

- [详细开发指南](DEVELOPMENT.md) - 完整的开发环境设置和项目结构说明
- [贡献指南](CONTRIBUTING.md) - 代码贡献规范
- [uv 使用指南](UV_USAGE.md) - uv 依赖管理工具使用说明
