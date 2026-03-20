# WeRSS 部署指南

WeRSS 支持两种部署模式，按需选择：

| 模式 | 文件 | 适用场景 |
|------|------|----------|
| **完整栈** | `docker-compose.yml` | 新用户一键启动，自带 Postgres + MinIO |
| **仅应用** | `docker-compose.app-only.yml` | 已有外部数据库/对象存储/反代 |
| 开发覆盖 | `docker-compose.dev.yml`（叠加在完整栈上） | 本地开发，启用 DEBUG，数据目录隔离 |

---

## 模式一：完整栈

包含 PostgreSQL、MinIO 和 WeRSS 三个服务。适合首次使用或独立部署。

```bash
cp .env.example .env   # 按需修改密码和 API Key
docker compose up -d
```

数据目录默认在 `./data/`，可通过环境变量覆盖。

### 本地开发

在完整栈基础上叠加开发配置（DEBUG=True、容器名加 `-dev` 后缀、数据目录隔离）：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

---

## 模式二：仅应用

只启动 WeRSS 容器，数据库和对象存储由外部提供。

```bash
# 编辑 .env，设置 DB 和 MinIO 相关变量
docker compose -f docker-compose.app-only.yml up -d --build
```

### 数据库连接

WeRSS 唯一读取的连库变量是 `DB`。在 `.env` 中设置：

```env
DB=postgresql://user:password@host:5432/werss_db
```

#### 容器内如何访问宿主机上的数据库

`docker-compose.app-only.yml` 已配置 `extra_hosts: host.docker.internal:host-gateway`。

| 宿主机 Postgres 端口映射 | 容器内连法 |
|--------------------------|-----------|
| `0.0.0.0:5432->5432` 或 `5432:5432` | `DB=...@host.docker.internal:5432/...` |
| `127.0.0.1:5432->5432`（仅回环） | `host.docker.internal` 不通，需改为 Docker 网络方式（见下文） |

**注意：** 容器内 `localhost` 是容器自己，不是宿主机。

#### 通过 Docker 网络连接

如果 Postgres 跑在另一个 Docker Compose 栈里，且端口只绑到 `127.0.0.1`，可以让 WeRSS 加入该网络：

```bash
# 查看 Postgres 容器所在的网络名
docker inspect postgres --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'

# 设置 WERSS_EXTERNAL_NETWORK 并启动
WERSS_EXTERNAL_NETWORK=your_postgres_network docker compose -f docker-compose.app-only.yml up -d
```

此时 `.env` 中的 `DB` 用服务名访问：

```env
DB=postgresql://user:password@postgres:5432/werss_db
```

### Traefik 反向代理

`docker-compose.app-only.yml` 内置了 Traefik labels，默认不启用。要接入已有 Traefik：

1. 查清 Traefik 所在的 Docker 网络名和 entrypoints/certresolver 名称：

```bash
docker inspect <traefik容器> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

2. 在 `.env` 中配置：

```env
WERSS_EXTERNAL_NETWORK=traefik           # Traefik 所在网络
WERSS_TRAEFIK_ENABLE=true
WERSS_HOST=werss.example.com
WERSS_TLS_RESOLVER=letsencrypt           # 与 Traefik 静态配置一致
WERSS_ENTRYPOINTS=websecure              # 默认 websecure
```

3. 启动后验证：

```bash
# Traefik 容器内应能访问 werss
docker exec <traefik容器> wget -qO- http://werss:8001/api/health

# 浏览器访问 https://werss.example.com（DNS A 记录须指向服务器公网 IP）
```

由 Traefik 提供 HTTPS 时，可注释掉 `.env` 中的 `WERSS_PUBLISH_PORT` 或将其设为不暴露的端口，避免多余暴露。

### MinIO / 对象存储

在 `.env` 中配置与容器内可访问的 endpoint：

```env
MINIO_ENDPOINT=your-minio-host:9000
MINIO_ACCESS_KEY=your_key
MINIO_SECRET_KEY=your_secret
MINIO_BUCKET=werss-images
MINIO_PUBLIC_URL=https://cdn.example.com
```

不要沿用 `minio:9000`，除非 WeRSS 和 MinIO 在同一 Docker 网络中。

---

## 配置优先级

运行时 `cfg.get()` 的取值顺序：

| `WERSS_ENV_OVERRIDES_DB` | 行为 |
|--------------------------|------|
| 未设置 / `false`（默认） | 若 PostgreSQL 表 `config_management` 中有该键，优先用数据库；否则用 `config.yaml` + 环境变量。连接串 `db` 从不走表覆盖。 |
| `true` | 先用 yaml + 环境变量；仅当值为空时才回退到 `config_management` 表。 |

控制台保存的配置写在 `config_management` 表里。若你改了 `.env` 仍看到旧值，检查表中是否仍有该键。

---

## 可配置环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WERSS_PUBLISH_PORT` | `8001` | 对外映射的端口 |
| `WERSS_CONTAINER_NAME` | `werss` | 容器名 |
| `WERSS_DATA_DIR` | `./data/werss-data` | 数据目录 |
| `WERSS_LOGS_DIR` | `./logs` | 日志目录 |
| `WERSS_EXTERNAL_NETWORK` | — | 加入已有 Docker 网络（Postgres、Traefik 等） |
| `WERSS_TRAEFIK_ENABLE` | `false` | 启用 Traefik labels |
| `WERSS_HOST` | — | Traefik Host 规则域名 |
| `WERSS_TLS_RESOLVER` | `letsencrypt` | Traefik 证书解析器名 |
| `WERSS_ENTRYPOINTS` | `websecure` | Traefik entrypoints |

---

## 与外部数据库共库注意事项

如果 WeRSS 与其他项目共用同一个 PostgreSQL 数据库，且该数据库中 `articles.id` 是 `integer`（如 Prisma 生成的），而 WeRSS 使用字符串主键（`公众号id-文章id`），`article_tags` 表不会在数据库层声明外键约束，关联由应用层 `JOIN` 维护。更稳妥的做法是为 WeRSS 使用独立数据库。

---

## 常见问题

| 现象 | 排查 |
|------|------|
| `Connection refused` 连不上数据库 | 检查 Postgres 端口映射是否为 `0.0.0.0:5432`；若为 `127.0.0.1:5432` 需通过 Docker 网络连接 |
| Traefik 502 / 无路由 | `werss` 是否在 Traefik 网络中；`loadbalancer.server.port` 是否为 `8001`；容器是否健康 |
| 证书不下发 | `certresolver` 名是否正确；80 端口是否通（HTTP-01）；防火墙 |
| 只要 HTTP 内网访问 | `WERSS_ENTRYPOINTS=web`，不设 `WERSS_TLS_RESOLVER` |
| 健康检查 404 | 确认镜像包含 `/api/health` 端点（需 rebuild） |
