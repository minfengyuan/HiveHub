# HiveHub 安装与运行指南

本文包含本机启动、Tailscale HTTPS、服务器连接、开发环境和备份恢复的详细步骤。项目介绍与功能概览见 [README.md](README.md)。

- [本机启动](#本机启动)
- [Tailscale HTTPS](#tailscale-https)
- [服务器连接](#服务器连接)
- [开发与 API](#开发与-api)
- [升级与备份](#升级与备份)

## 本机启动

需要 Docker Compose、Git 和可选的 Tailscale。

```sh
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

将两次生成的值分别填入 `.env` 的 `POSTGRES_PASSWORD` 和 `MASTER_KEY`。不要复用密钥，也不要提交 `.env`。数据库密码使用十六进制值，避免连接 URL 转义问题。

本机访问先保留 `APP_ORIGIN=http://localhost:8080`。

```sh
docker compose up -d --build
# 交互输入初始用户名与密码，密码至少 12 字符：
read -r 'ADMIN_USERNAME?管理员用户名: '
read -rs 'ADMIN_PASSWORD?管理员密码: '
export ADMIN_USERNAME ADMIN_PASSWORD
docker compose exec -e ADMIN_USERNAME -e ADMIN_PASSWORD api pnpm bootstrap-admin
unset ADMIN_USERNAME ADMIN_PASSWORD
```

上述 `read` 语法用于 macOS 默认 zsh。打开 <http://localhost:8080> 登录。初始化命令仅允许创建一个管理员。不要将 ADMIN_PASSWORD 写入 Compose 或提交到仓库。

```sh
docker compose logs --tail=100 api
docker compose stop
docker compose start
```

容器设置 `restart: unless-stopped`；Docker 启动后恢复未手动停止的容器。本机睡眠、关机或 Docker 停止时无法访问，也不会采集。应用不修改系统登录项与休眠设置。

## Tailscale HTTPS

先在宿主机安装并登录 Tailscale，并启用 tailnet 的 MagicDNS 和 HTTPS。使用 Serve，不需要 Funnel。

```sh
tailscale serve --bg http://127.0.0.1:8080
tailscale serve status
```

把显示的完整 HTTPS origin（例如 `https://computer.tailxxxx.ts.net`，不带路径）填入 `.env` 的 `APP_ORIGIN`，然后：

```sh
docker compose up -d api web
```

通过该 HTTPS 地址登录。切换 origin 后，本机 HTTP 地址不再支持登录和写操作。HTTPS 模式下 Cookie 自动启用 Secure。只有前端端口绑定到宿主机 loopback；API 和数据库无宿主机端口。访问设备必须在被允许访问的 tailnet 中。本机 Docker 网络必须能到达被监控主机，包括使用 Tailscale 地址的主机。

## 服务器连接

服务器需运行 Linux、OpenSSH，以及 `head`、`cat`、`sleep`、`df`，并允许读取 `/proc/stat`、`/proc/meminfo` 和 `/proc/uptime`。建议单独创建普通监控账户；不要求 root 或 sudo。

添加服务器并保存私钥，然后点击“测试连接 / 指纹”。通过服务器控制台等可信渠道核对 SHA256 主机指纹后确认，再刷新指标。指纹变更会阻止采集；重新核对后才能信任新指纹。连接测试在验证主机身份阶段结束；实际认证和采集由刷新操作验证。

采集并发最多 5 个、单次最多 20 秒，同一主机不并行采集。失败时保留最近成功的数据并显示错误，超过 180 秒标记过期。新建或改变地址的服务器必须重新确认指纹。

## 开发与 API

使用 Node.js 24 和 pnpm 10。依赖版本由锁文件固定。

```sh
pnpm install --frozen-lockfile
# 本地开发需自行准备 PostgreSQL，并设置环境变量：
export DATABASE_URL='postgresql://hivehub:YOUR_HEX_PASSWORD@localhost:5432/hivehub'
export MASTER_KEY='YOUR_64_HEX_CHARACTERS'
export APP_ORIGIN='http://localhost:5173'
pnpm --filter @hivehub/api migrate
# 按上文交互输入并 export 管理员凭据后执行：
pnpm --filter @hivehub/api bootstrap-admin
pnpm dev
```

Vite 默认访问地址为 <http://localhost:5173>，代理 `/api` 到后端 3000 端口。若端口被占用，需同步修改 APP_ORIGIN。`apps/api` 按契约、数据库、认证和采集组织；新增模块通过独立资源路由接入。

业务接口位于 `/api/v1`，登录后可访问 `/api/v1/docs` 的 OpenAPI 文档。写接口要求 Origin 与 APP_ORIGIN 一致。更新使用 PUT，提交完整可编辑记录；私钥留空代表保留原凭据。错误格式为 `{ "error": { "code": 400, "message": "..." } }`。

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

集成测试必须使用独立测试数据库：测试会清空该数据库中的业务表。

```sh
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @hivehub/api migrate
TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:PORT/TEST_DB' pnpm test
```

未提供 TEST_DATABASE_URL 时，API 集成测试使用内存中的 PGlite（PostgreSQL 引擎）；提供该变量时使用独立 PostgreSQL 数据库。SSH 测试在临时 loopback 端口启动本地测试服务，不连接外部服务器。

## 升级与备份

API 启动前自动运行带事务和迁移记录的数据库迁移。升级前备份数据库，保留旧代码版本，然后执行 `docker compose up -d --build`。

```sh
docker compose exec -T db pg_dump -U hivehub -d hivehub -Fc > hivehub.dump
```

将 `.env` 中的 MASTER_KEY 独立备份到安全位置。丢失主密钥后，数据库中的 SSH 凭据无法解密。数据库备份包含密码哈希和加密凭据，也应保密。

恢复到已启动且版本匹配的数据库（会替换现有数据）：

```sh
docker compose stop api web
docker compose exec -T db pg_restore -U hivehub -d hivehub --clean --if-exists < hivehub.dump
docker compose start api web
```

恢复时必须使用原 MASTER_KEY。普通 `docker compose down` 保留数据卷；不要使用 `down -v`，除非明确要删除数据。
