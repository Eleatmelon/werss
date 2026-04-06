# WeRSS 开发指南

## 项目结构

```
werss/
├── apis/              # API 路由层
│   ├── article.py     # 文章相关 API
│   ├── auth.py        # 认证相关 API
│   ├── mps.py         # 微信公众号相关 API
│   └── ...
├── core/              # 核心业务逻辑
│   ├── config.py      # 配置管理
│   ├── database.py    # 数据库操作
│   ├── wx/            # 微信公众号核心逻辑
│   ├── models/        # 数据模型
│   └── ...
├── jobs/              # 定时任务
├── driver/            # 浏览器驱动（Playwright）
├── web_ui/            # 前端 Vue 应用
├── main.py            # 应用入口
├── web.py             # FastAPI 应用定义
├── config.example.yaml # 配置文件模板
└── requirements.txt   # Python 依赖
```

## 开发环境设置

### 1. 本地开发（推荐）

```bash
# 1. 安装 Python 3.11+
python3 --version

# 2. 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置环境变量
cp config.example.yaml config.yaml
# 编辑 config.yaml 或通过环境变量配置

# 5. 初始化数据库
python main.py -init True

# 6. 启动开发服务器（带自动重载）
python main.py -job True -init False
```

### 2. Docker 开发环境

```bash
# 使用 docker-compose.dev.yml
cd /path/to/werss
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build werss

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f werss
```

## 配置说明

### 环境变量配置

项目支持通过环境变量覆盖 `config.yaml` 中的配置：

```bash
# 数据库配置
export DB=postgresql://user:pass@localhost:5432/werss_db

# 服务器配置
export PORT=8001
export DEBUG=True
export AUTO_RELOAD=True  # 开发时启用自动重载

# 微信公众号配置
export WERSS_USERNAME=your_username
export WERSS_PASSWORD=your_password
```

### 配置文件优先级

1. 环境变量（最高优先级）
2. `config.yaml`
3. `config.example.yaml` 默认值

## 开发工作流

### 1. 修改代码

项目使用 FastAPI，支持自动重载：

```python
# 修改 core/ 或 apis/ 下的代码
# 服务器会自动检测并重启（如果 AUTO_RELOAD=True）
```

### 2. 添加新 API

在 `apis/` 目录下创建新的路由文件：

```python
# apis/my_feature.py
from fastapi import APIRouter
from core.config import cfg

router = APIRouter(prefix="/my-feature", tags=["我的功能"])

@router.get("/")
async def my_endpoint():
    return {"message": "Hello"}
```

然后在 `web.py` 中注册：

```python
from apis.my_feature import router as my_feature_router
api_router.include_router(my_feature_router)
```

### 3. 修改数据库模型

在 `core/models/` 下修改模型：

```python
# core/models/article.py
from core.models.base import Base
from sqlalchemy import Column, String, Text

class Article(Base):
    __tablename__ = "articles"
    
    # 添加新字段
    new_field = Column(String(255))
```

运行迁移：

```bash
python main.py -init True
```

### 4. 添加定时任务

在 `jobs/` 目录下创建任务：

```python
# jobs/my_job.py
from jobs import register_job

@register_job(interval=60)  # 每60秒执行一次
def my_task():
    print("执行我的任务")
```

## 调试技巧

### 1. 启用调试模式

```bash
export DEBUG=True
export LOG_LEVEL=DEBUG
```

### 2. 查看日志

```bash
# 如果配置了日志文件
tail -f /path/to/log/file.log

# Docker 环境
docker-compose logs -f werss
```

### 3. API 文档

启动服务后访问：
- Swagger UI: http://localhost:8001/api/docs
- ReDoc: http://localhost:8001/api/redoc

## 常见修改场景

### 场景1: 修改数据库连接

```yaml
# config.yaml
db: postgresql://user:pass@localhost:5432/werss_db
```

或使用环境变量：

```bash
export DB=postgresql://user:pass@localhost:5432/werss_db
```

### 场景2: 修改端口

```yaml
# config.yaml
port: 8002
```

或：

```bash
export PORT=8002
```

### 场景3: 添加自定义功能

1. 在 `core/` 下创建业务逻辑模块
2. 在 `apis/` 下创建 API 路由
3. 在 `web.py` 中注册路由
4. 如果需要定时任务，在 `jobs/` 下创建

### 场景4: 修改前端界面

前端代码在 `web_ui/` 目录：

```bash
cd web_ui
npm install  # 或 yarn install
npm run dev   # 开发模式
npm run build # 构建生产版本
```

## 与主项目集成

### 数据库共享

WeRSS 使用独立的数据库（`POSTGRES_WERSS_DB`），与主项目数据库（`POSTGRES_DB`）分离。

### 服务通信

- WeRSS API: http://localhost:8001
- Article Agent API: http://localhost:8002
- 可以通过 HTTP 请求进行服务间通信

## 注意事项

1. **不要提交敏感信息**
   - `config.yaml` 已在 `.gitignore` 中
   - 使用环境变量管理敏感配置

2. **数据库迁移**
   - 修改模型后需要运行 `python main.py -init True`
   - 生产环境谨慎操作

3. **代码风格**
   - 遵循 Python PEP 8
   - 使用类型提示（Type Hints）

4. **测试**
   - 修改代码后先在开发环境测试
   - 使用 Docker 环境进行集成测试

## 下一步

1. 熟悉项目结构和代码
2. 确定要修改/添加的功能
3. 创建功能分支进行开发
4. 测试验证
5. 提交代码

