# HomeLab Dashboard

Vue 3 + Vite + Element Plus dark dashboard prototype with Node.js API and MariaDB schema.

## Development

```bash
npm install
npm run dev
```

## Production deployment

Build the Vue client, then start the Node server. The server serves both the API under `/api` and the dashboard, including client-side routes, from `dist`.

```bash
npm install
npm run build
npm start
```

Set `API_PORT` in `.env` when the deployment platform provides a different port.

## MariaDB

Create the initial database and `services` table:

```bash
mariadb -u root -p < server/schema.sql
```

Copy the visible `config.env.example` file to `.env`, then set the MariaDB connection in the `DB_*` fields. The existing `.env.example` is the same template, but macOS hides dotfiles by default:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=homelab_dashboard
DB_USER=homelab
DB_PASSWORD=your_database_password
```

The Node API loads `.env` automatically. Start it separately with:

```bash
npm run server
```

管理员账号和密码直接在 `.env` 中设置：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password
```

登录成功后会创建 24 小时 HttpOnly 会话；退出登录或会话过期后，控制台路由会自动回到登录页。

登录接口默认限制同一来源 15 分钟内最多 10 次失败尝试，修改密码接口默认限制 5 次请求。成功和失败的登录会写入审计日志，可在“系统设置”查看最近记录。已有数据库需要先执行：

```bash
mariadb -u root -p YOUR_DATABASE_NAME < server/migrations/004_login_audit_logs.sql
mariadb -u root -p YOUR_DATABASE_NAME < server/migrations/005_app_settings.sql
```

`settings` 表使用键值结构保存站点名称、副标题、主题色、检查频率、通知开关和服务分类；设置页修改后，其他浏览器和设备会读取同一份配置。

通过 FRP、Nginx 或 Caddy 代理访问时，应用会根据可信代理链读取访客 IP。默认仅信任本机和内网代理，也可以在 `.env` 中明确填写代理节点 IP 或 CIDR：

```env
TRUST_PROXY=loopback,linklocal,uniquelocal
```

HTTP/HTTPS 代理需要传递 `X-Forwarded-For`。纯 TCP FRP 转发若未启用 Proxy Protocol 或未经过会写入转发头的反向代理，应用只能记录 FRP 节点地址。不要把 `TRUST_PROXY` 设置为 `true` 或 `*`，否则公网客户端可能伪造来源 IP。

The API reads the `services` table through a MariaDB connection pool. Database passwords stay in `.env` and are excluded by `.gitignore`.

Minecraft Bedrock servers can be checked with a RakNet UDP ping by using an address such as `udp://192.168.1.10:19132` in the LAN or public address field. A valid Bedrock Pong response is required before the service is marked online.

The first version uses only one business table, `services`. Docker, frp, local path, GitHub version data, and access URLs are stored directly on that record.

## Service management

The **Service Manager** page reads and writes the `services` table through `/api/services`. It supports searching, filtering, adding, editing, and deleting services.

服务管理页支持通过上下箭头自定义服务顺序。首次使用前请执行 `server/migrations/003_service_sort_order.sql`，之后首页和服务列表都会按保存的顺序显示。搜索或状态筛选开启时，排序按钮会暂时禁用。

Each service has a **检测版本** action. It runs on the deployment server and writes the result back to the database:

| Version source | Detection behavior | Required fields |
| --- | --- | --- |
| Git 标签 | Reads the latest GitHub tag and optionally the local Git tag | GitHub URL; local path is optional |
| GitHub Release | Reads the latest GitHub Release | GitHub URL |
| package.json | Reads `version` from the local `package.json` | Local path |
| Docker 镜像 | Reads container state and locally available image tags | Docker container name; Docker CLI access |
| 手动维护 | Does not run automated detection | Enter versions manually |

The deployment process must have outbound access to `api.github.com` for GitHub checks. For local Git, package.json, and Docker checks, the configured `local_path` and Docker socket must be accessible to the user running the Node service.

GitHub 检查默认等待 20 秒并自动重试一次。若部署环境无法直连 GitHub，可在 `.env` 设置一个可访问的兼容 API 代理：

```env
GITHUB_API_BASE=https://api.github.com
GITHUB_TIMEOUT_MS=20000
```

Service state fields are stored as numbers:

| Field | Mapping |
| --- | --- |
| `status` | `0` offline, `1` running, `2` warning, `3` error, `4` maintenance |
| `version_type` | `0` manual, `1` git tag, `2` GitHub release, `3` package.json, `4` Docker image, `5` Git commit |
| `version_status` | `0` unknown, `1` latest, `2` update available, `3` check failed |
| `docker_status` | `0` unknown, `1` running, `2` stopped, `3` exited, `4` unhealthy |

For an existing database created with the earlier ENUM schema, run the one-time migration before deploying the new API:

```bash
mariadb -u root -p YOUR_DATABASE_NAME < server/migrations/001_numeric_statuses.sql
```

已有数据库还需要依次补充服务图标和自定义排序字段：

```bash
mariadb -u root -p YOUR_DATABASE_NAME < server/migrations/002_service_icons.sql
mariadb -u root -p YOUR_DATABASE_NAME < server/migrations/003_service_sort_order.sql
mariadb -u root -p YOUR_DATABASE_NAME < server/migrations/004_login_audit_logs.sql
```

## Version detection fields

`version_type` supports `git_tag`, `git_release`, `package_json`, `docker`, and `manual`. A later API job can read `local_path` for local versions and the GitHub Releases API for `git_release` remote versions.
