<h1 align="center">HiveHub</h1>

<p align="center">把服务器、待办和提示词，放进一个个人事务中心。</p>

<p align="center">
  <a href="INSTALL.md">安装指南</a> ·
  <a href="#功能">功能</a> ·
  <a href="#架构">架构</a> ·
  <a href="#开发">开发</a>
</p>

HiveHub 是一个在本机运行的个人 Hub。你可以查看 Linux 服务器状态、整理日常待办，并收藏常用提示词。界面参考 Claude 的简洁风格，适配桌面与手机。

通过 Docker Compose 在自己的电脑上运行，也可以通过 Tailscale HTTPS 从自己的其他设备访问。

## 功能

| 模块         | 能力                                                                |
| ------------ | ------------------------------------------------------------------- |
| 概览         | 查看服务器状态、未完成任务和收藏提示词                              |
| 服务器       | 管理资产、分组和标签，通过 SSH 每分钟采集 CPU、内存、磁盘及运行时间 |
| 待办清单     | 多清单、任务备注、完成与恢复、状态筛选                              |
| 提示词模板库 | 纯文本保存、分类、标签、收藏、搜索与一键复制                        |
| 账户与凭据   | 单管理员登录、会话管理、SSH 私钥加密保存、主机指纹确认              |

当前版本面向个人使用，仅保留最新监控快照。暂不支持多人协作、网页终端、历史监控、任务提醒或模型调用。

## 快速开始

准备好 Docker Compose，在项目根目录执行：

```sh
cp .env.example .env
```

按 [安装指南](INSTALL.md#本机启动) 生成并填写数据库密码和加密主密钥，然后启动：

```sh
docker compose up -d --build
```

完成 [管理员初始化](INSTALL.md#本机启动) 后，打开 <http://localhost:8080> 登录。首次启动会从源码构建镜像，并自动执行数据库迁移。

需要跨设备访问时，按 [Tailscale HTTPS 配置](INSTALL.md#tailscale-https) 设置私网访问地址。

## 架构

前后端独立构建，通过 REST API 通信；后端按业务模块组织，便于继续扩展个人工具。

```text
浏览器
  │
  ├─ 本机 HTTP / Tailscale HTTPS
  │
Nginx ── React 页面
  │
  └─ /api/v1 ── Fastify ── PostgreSQL
                   │
                   └─ SSH ── Linux 服务器
```

| 层级   | 技术                                                  |
| ------ | ----------------------------------------------------- |
| 前端   | React、Vite、TypeScript、Tailwind CSS、TanStack Query |
| 后端   | Fastify、TypeScript、Drizzle ORM                      |
| 数据库 | PostgreSQL                                            |
| 部署   | Docker Compose、Nginx，可选 Tailscale Serve           |

前端端口仅绑定本机 `127.0.0.1:8080`；API 和数据库位于容器网络中。数据保存在 PostgreSQL 持久化卷，SSH 凭据使用独立主密钥加密。

## 开发

使用 Node.js 24 和 pnpm 10。配置数据库与环境变量的完整步骤见 [开发与 API](INSTALL.md#开发与-api)。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

```text
apps/web             前端页面
apps/api             API、数据库与服务器采集
packages/contracts   共享 API 契约
```

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

默认测试使用内存中的 PGlite 和本地 SSH 测试服务。登录后可在 `/api/v1/docs` 查看 OpenAPI 文档。

## 文档

- [安装与运行](INSTALL.md)：本机部署、管理员初始化及日常启停。
- [服务器连接](INSTALL.md#服务器连接)：监控账户、密钥和主机指纹配置。
- [升级与备份](INSTALL.md#升级与备份)：数据库备份、恢复和主密钥保管。
- [验证记录](VALIDATION.md)：已执行的检查与尚未完成的环境验收。
