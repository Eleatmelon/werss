# GitHub Actions 工作流配置指南

本文档说明 werss 项目中所有 GitHub Actions 自动化工作流的配置和使用方法。

## 📋 工作流概览

项目包含以下 7 个自动化工作流：

| 工作流文件 | 功能 | 触发条件 |
|-----------|------|---------|
| `base_os.yaml` | 构建 Python 3.8 基础镜像 | 推送到 main，且 `Dockerfiles/py38/Dockerfile` 变化 |
| `buidweb.yaml` | 构建并部署前端到 GitHub Pages | 被其他工作流调用 |
| `docker_hub.yaml` | 构建并推送到 Docker Hub | 推送到 main，且相关文件变化 |
| `docker-publish.yaml` | 构建并推送到 GHCR（可选腾讯云） | 推送到 main，且相关文件变化 |
| `docker-tencent.yaml` | 构建并推送到腾讯云容器镜像服务 | 推送到 main 或手动触发 |
| `issues.yaml` | Issue 自动回复 | Issue 被添加标签 |
| `release.yaml` | 创建 GitHub Release | 推送版本标签（v*.*.*） |

---

## 🔧 详细配置说明

### 1. base_os.yaml - 基础镜像构建

**功能：**
- 构建 Python 3.8 基础镜像
- 推送到 GitHub Container Registry

**触发条件：**
- 推送到 `main` 分支
- 且 `Dockerfiles/py38/Dockerfile` 文件发生变化

**所需 Secrets：**
- `TOKEN`: GitHub Personal Access Token（需要 `write:packages` 权限）

**输出镜像：**
- `ghcr.io/wang-h/python38:latest`

---

### 2. buidweb.yaml - 前端构建和部署

**功能：**
- 构建 Vite 前端项目
- 部署到 GitHub Pages

**触发条件：**
- 被其他工作流通过 `workflow_call` 调用
- 需要传入 `target` 参数

**工作步骤：**
1. 安装 Node.js 20.18.3
2. 在 `web_ui` 目录安装依赖（yarn）
3. 构建前端项目
4. 部署到 `gh-pages` 分支

**所需 Secrets：**
- `TOKEN`: GitHub Personal Access Token（需要 `repo` 权限）

**输出：**
- 前端静态文件部署到 GitHub Pages

---

### 3. docker_hub.yaml - 推送到 Docker Hub

**功能：**
- 构建多架构 Docker 镜像（amd64 + arm64）
- 推送到 Docker Hub 和 GitHub Container Registry

**触发条件：**
- 推送到 `main` 分支
- 且以下文件之一发生变化：
  - `ReadMe.md`
  - `README.zh-CN.md`
  - `core/ver.py`
  - `Dockerfile`
  - `requirements.txt`

**所需 Secrets：**
- `DOCKER_HUB_USERNAME`: Docker Hub 用户名
- `DOCKER_HUB_TOKEN`: Docker Hub 访问令牌（在 Docker Hub → Account Settings → Security 创建）
- `TOKEN`: GitHub Personal Access Token（需要 `write:packages` 权限）

**输出镜像：**
- `docker.io/<repository>:latest`（Docker Hub）
- `ghcr.io/<repository>:latest`（GitHub Container Registry）

**特性：**
- 多架构支持（amd64 + arm64）
- 自动生成镜像元数据和标签

---

### 4. docker-publish.yaml - 推送到 GitHub Container Registry（支持腾讯云）

**功能：**
- 构建多架构 Docker 镜像（amd64 + arm64）
- 推送到 GitHub Container Registry
- 如果配置了腾讯云 secrets，同时推送到腾讯云容器镜像服务

**触发条件：**
- 推送到 `main` 分支
- 且以下文件之一发生变化：
  - `ReadMe.md`
  - `README.zh-CN.md`
  - `core/ver.py`
  - `Dockerfile`
  - `requirements.txt`

**所需 Secrets：**

**必需：**
- `TOKEN`: GitHub Personal Access Token（需要 `write:packages` 权限）

**可选（推送到腾讯云）：**
- `TENCENT_REGISTRY_USERNAME`: 腾讯云容器镜像服务用户名
- `TENCENT_REGISTRY_PASSWORD`: 腾讯云容器镜像服务密码或访问令牌
- `TENCENT_REGISTRY`: 腾讯云镜像仓库地址（默认：`ccr.ccs.tencentyun.com`）
- `TENCENT_IMAGE_NAMESPACE`: 腾讯云命名空间（默认：`default`）

**输出镜像：**
- `ghcr.io/<repository>:latest`（GitHub Container Registry）
- `ccr.ccs.tencentyun.com/<namespace>/werss:latest`（腾讯云，如果配置了）

**特性：**
- 多架构支持（amd64 + arm64）
- GitHub Actions 缓存加速构建
- 自动生成镜像标签和元数据
- 智能判断是否推送到腾讯云（如果配置了 secrets）

---

### 5. docker-tencent.yaml - 推送到腾讯云容器镜像服务

**功能：**
- 使用 `Dockerfile.cn`（国内镜像源版本）构建镜像
- 构建多架构 Docker 镜像（amd64 + arm64）
- 推送到腾讯云容器镜像服务
- 自动生成多个标签（latest、分支名、SHA 等）

**触发条件：**
- 推送到 `main` 分支（且指定文件变化）
- 或手动触发（`workflow_dispatch`）

**文件变化触发：**
- `ReadMe.md`
- `README.zh-CN.md`
- `core/ver.py`
- `Dockerfile`
- `Dockerfile.cn`
- `requirements.txt`

**所需 Secrets：**

**必需：**
- `TENCENT_REGISTRY_USERNAME`: 腾讯云容器镜像服务用户名
- `TENCENT_REGISTRY_PASSWORD`: 腾讯云容器镜像服务密码或访问令牌

**可选：**
- `TENCENT_REGISTRY`: 镜像仓库地址（默认：`ccr.ccs.tencentyun.com`）
  - 旧版：`ccr.ccs.tencentyun.com`
  - 新版：`mirror.ccs.tencentyun.com`
- `TENCENT_IMAGE_NAMESPACE`: 镜像命名空间（默认：`default`）

**输出镜像：**
- `ccr.ccs.tencentyun.com/<namespace>/werss:latest`
- `ccr.ccs.tencentyun.com/<namespace>/werss:<branch>-<sha>`

**特性：**
- 使用国内镜像源，构建速度更快
- 多架构支持（amd64 + arm64）
- GitHub Actions 缓存加速构建
- 支持手动触发
- 自动生成多个标签

**详细配置请参考：** [README-TENCENT.md](./README-TENCENT.md)

---

### 6. issues.yaml - Issue 自动回复

**功能：**
- 当 Issue 被标记为 `help wanted` 时，自动添加欢迎评论

**触发条件：**
- Issue 被添加标签（`labeled`）

**所需 Secrets：**
- `TOKEN`: GitHub Personal Access Token（需要 `issues:write` 权限）

**行为：**
- 检测到 Issue 被标记为 `help wanted` 时
- 自动添加中英文欢迎评论，鼓励提交 PR

---

### 7. release.yaml - 版本发布

**功能：**
- 创建 GitHub Release
- 可以附加文件、发布说明等

**触发条件：**
- 推送版本标签，格式为 `v*.*.*`
- 例如：`v1.0.0`、`v2.1.3`

**所需 Secrets：**
- `GitToken`: GitHub Personal Access Token（需要 `repo` 权限）

**使用方法：**
```bash
# 创建并推送版本标签
git tag v1.0.0
git push origin v1.0.0
```

**输出：**
- 在 GitHub Releases 中创建新版本
- 可以附加构建产物、发布说明等

---

## 🔐 GitHub Secrets 配置指南

### 如何配置 Secrets

1. 进入你的 GitHub 仓库
2. 点击 `Settings` → `Secrets and variables` → `Actions`
3. 点击 `New repository secret`
4. 输入名称和值，点击 `Add secret`

### 必需的 Secrets

#### 1. TOKEN（多个工作流需要）

**用途：** GitHub Container Registry 推送、GitHub Pages 部署、Issue 回复

**创建步骤：**
1. 进入 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 点击 `Generate new token (classic)`
3. 选择以下权限：
   - `repo`（完整仓库访问权限）
   - `write:packages`（推送包到 GitHub Container Registry）
   - `read:packages`（从 GitHub Container Registry 读取包）
   - `workflow`（更新 GitHub Actions 工作流）
4. 生成后复制 token，添加到 Secrets 中

#### 2. GitToken（用于 release.yaml）

**用途：** 创建 GitHub Release

**创建步骤：** 同 TOKEN，需要 `repo` 权限

### 可选的 Secrets（按需配置）

#### 3. DOCKER_HUB_USERNAME 和 DOCKER_HUB_TOKEN

**用途：** 推送到 Docker Hub（`docker_hub.yaml`）

**创建步骤：**
1. 登录 [Docker Hub](https://hub.docker.com/)
2. 进入 Account Settings → Security
3. 点击 `New Access Token`
4. 输入描述，选择权限（Read & Write）
5. 复制生成的 token

#### 4. TENCENT_REGISTRY_USERNAME 和 TENCENT_REGISTRY_PASSWORD

**用途：** 推送到腾讯云容器镜像服务

**创建步骤：**
1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 进入「容器镜像服务」或「容器服务」
3. 创建命名空间和镜像仓库
4. 在「访问管理」中创建 API 密钥，或使用镜像仓库的访问凭证

**详细配置请参考：** [README-TENCENT.md](./README-TENCENT.md)

---

## 🚀 使用示例

### 示例 1：推送到 GitHub Container Registry

1. 配置 `TOKEN` secret
2. 修改 `Dockerfile` 或 `requirements.txt`
3. 推送到 `main` 分支
4. 工作流 `docker-publish.yaml` 自动触发
5. 镜像推送到 `ghcr.io/<repository>:latest`

### 示例 2：推送到腾讯云

1. 配置腾讯云相关 secrets（见 [README-TENCENT.md](./README-TENCENT.md)）
2. 修改 `Dockerfile.cn` 或相关文件
3. 推送到 `main` 分支
4. 工作流 `docker-tencent.yaml` 自动触发
5. 镜像推送到腾讯云容器镜像服务

### 示例 3：手动触发构建

1. 进入 GitHub 仓库的 `Actions` 标签页
2. 选择 `Build and Push to Tencent Cloud Container Registry`
3. 点击 `Run workflow`
4. 选择分支，点击 `Run workflow`
5. 工作流开始执行

### 示例 4：创建版本发布

```bash
# 1. 创建版本标签
git tag v1.0.0

# 2. 推送标签
git push origin v1.0.0

# 3. 工作流自动触发，创建 GitHub Release
```

---

## 📊 工作流执行流程图

```
推送到 main 分支
│
├── 文件变化检测
│   ├── Dockerfiles/py38/Dockerfile
│   │   └── base_os.yaml（构建基础镜像）
│   │
│   ├── Dockerfile / requirements.txt 等
│   │   ├── docker_hub.yaml（推送到 Docker Hub + GHCR）
│   │   ├── docker-publish.yaml（推送到 GHCR + 可选腾讯云）
│   │   └── docker-tencent.yaml（推送到腾讯云）
│   │
│   └── web_ui/ 相关文件
│       └── buidweb.yaml（被其他工作流调用）
│
├── Issue 事件
│   └── issues.yaml（自动回复）
│
└── 推送标签 v*.*.*
    └── release.yaml（创建 Release）
```

---

## ⚙️ 优化建议

### 1. 避免重复构建

`docker_hub.yaml` 和 `docker-publish.yaml` 可能同时触发，建议：
- 如果只需要推送到 GitHub Container Registry，只使用 `docker-publish.yaml`
- 如果需要推送到 Docker Hub，使用 `docker_hub.yaml`
- 如果需要推送到腾讯云，使用 `docker-tencent.yaml` 或配置 `docker-publish.yaml` 的腾讯云 secrets

### 2. 使用缓存加速构建

所有 Docker 构建工作流都已配置 GitHub Actions 缓存：
- `cache-from: type=gha`
- `cache-to: type=gha,mode=max`

第二次构建会显著加快。

### 3. 手动触发

`docker-tencent.yaml` 支持手动触发（`workflow_dispatch`），适合：
- 测试构建流程
- 按需构建特定版本
- 修复构建问题后重新构建

### 4. 条件执行

`docker-publish.yaml` 中的腾讯云推送使用了条件判断：
```yaml
if: ${{ secrets.TENCENT_REGISTRY_USERNAME != '' && secrets.TENCENT_REGISTRY_PASSWORD != '' }}
```
只有在配置了腾讯云 secrets 时才会推送到腾讯云。

---

## 🔍 故障排查

### 构建失败

1. **检查 Secrets 配置**
   - 确认所有必需的 secrets 都已配置
   - 检查 secret 名称是否正确（区分大小写）

2. **检查权限**
   - GitHub token 需要有足够的权限
   - Docker Hub token 需要有推送权限
   - 腾讯云凭证需要有推送权限

3. **查看日志**
   - 进入 `Actions` 标签页
   - 点击失败的工作流运行
   - 查看详细错误信息

### 推送失败

1. **认证问题**
   - 检查用户名和密码/令牌是否正确
   - 确认访问凭证是否过期
   - 验证是否有推送权限

2. **镜像仓库问题**
   - 确认镜像仓库已创建
   - 检查命名空间是否正确
   - 验证镜像仓库地址是否正确

### 构建缓慢

1. **使用缓存**
   - 工作流已配置缓存，第二次构建会更快
   - 确保缓存没有被清理

2. **使用国内镜像源**
   - `docker-tencent.yaml` 使用 `Dockerfile.cn`，构建更快
   - 其他工作流可以使用 `Dockerfile.cn` 替代 `Dockerfile`

---

## 📚 相关文档

- [腾讯云容器镜像服务配置指南](./README-TENCENT.md)
- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [Docker Buildx 文档](https://docs.docker.com/buildx/)
- [GitHub Container Registry 文档](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

---

## 💡 最佳实践

1. **使用语义化版本标签**
   - 使用 `v1.0.0` 格式的标签
   - 便于版本管理和回滚

2. **定期更新 Actions**
   - 使用最新版本的 GitHub Actions
   - 定期检查并更新工作流中的 actions 版本

3. **保护敏感信息**
   - 所有敏感信息都使用 Secrets
   - 不要在代码中硬编码密码或令牌

4. **监控构建状态**
   - 设置 GitHub 通知，及时了解构建状态
   - 定期检查构建日志，优化构建流程

5. **使用多架构构建**
   - 支持 amd64 和 arm64 架构
   - 兼容更多部署环境

---

## 📝 更新日志

- **2024-12-20**: 添加腾讯云容器镜像服务支持
- **2024-12-20**: 更新所有工作流使用最新版本的 Actions
- **2024-12-20**: 添加构建缓存支持
- **2024-12-20**: 优化工作流配置，支持条件执行

---

如有问题或建议，请提交 Issue 或 PR。

