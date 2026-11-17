# 验证记录

本次实现了 React 前端、Fastify API、共享契约、PostgreSQL 表与迁移，以及本机 Docker Compose 配置。

## 已通过

- `pnpm install --frozen-lockfile --offline --ignore-scripts`：锁文件一致，可用已缓存依赖安装。
- `pnpm typecheck`、`pnpm lint`、`pnpm build`：通过。
- `pnpm test`：6 项测试通过，无跳过。默认数据库集成测试使用 PGlite；不是 Docker PostgreSQL 部署验收。
- 最后补充的关联记录不存在处理：API 集成测试、类型检查和 lint 再次通过。
- 数据库集成覆盖登录、来源校验、退出后会话失效、输入校验、清单删除迁移任务、分类删除保留正文、服务器凭据不回传、OpenAPI 文档及未确认指纹禁止采集。
- 本地 SSH 协议测试覆盖主机指纹探测、固定指纹连接、指纹不匹配、认证失败、采集去重和采集失败保留最近成功指标。
- Playwright 实际浏览器验证登录、任务新增与完成、提示词保存与收藏、复制操作反馈、服务器资料新增和手机退出登录。桌面 1440px、手机 390px 布局无横向溢出，并查看了页面截图。复制操作已触发，未独立读取操作系统剪贴板核对内容。
- `docker compose config --quiet`：通过，使用临时示例配置，不写入生产凭据。
- 对所有新增文件执行 whitespace 检查：通过。

## 尚未完成的环境验收

Docker Hub 拉取 `postgres:17-alpine` 时先出现 EOF，重试出现 TLS 握手超时。因此没有运行实际 Compose 构建、PostgreSQL 容器、容器重启持久化及恢复备份验收。

没有修改本机 Tailscale 配置，没有验证真实 tailnet HTTPS、安全 Cookie 或 Docker 到真实服务器的网络可达性。SSH 协议验证连接的是本机临时服务，没有连接用户服务器。20 秒超时和定时调度已经实现，但未进行真实网络超时及本机休眠恢复实验。

测试用前端和内存数据库后端已停止。尚未创建正式管理员、正式 `.env` 或部署实例。按 README 配置后可以启动实际本机部署。
