# cf-proxy

<div align="center">

**codefather.cn 反向代理 · 多设备共享会员 · 自动 SESSION 持久化**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Nginx](https://img.shields.io/badge/nginx-alpine-009639?logo=nginx)](https://nginx.org)
[![Python](https://img.shields.io/badge/python-3.11--alpine-3776AB?logo=python)](https://python.org)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker)](https://docs.docker.com/compose/)
[![Cloudflare Workers](https://img.shields.io/badge/cloudflare-workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Docker Hub](https://img.shields.io/docker/pulls/poboll/cf-panel?logo=docker&label=poboll%2Fcf-panel)](https://hub.docker.com/r/poboll/cf-panel)

</div>

---

## 概述

cf-proxy 提供两套方案将 `www.codefather.cn` 完整镜像到你自己的域名，并注入主账号 SESSION Cookie 实现多设备共享会员权益。

| 方案 | 适合场景 | 所需资源 |
|------|----------|----------|
| **Cloudflare Worker** | 有 CF 域名，想零成本、零服务器部署 | Cloudflare 账号（免费计划可用） |
| **Docker（本地/局域网）** | 局域网共享，自动扫码持久化 | Docker + Docker Compose |
| **宝塔（生产）** | 有服务器，纯 Nginx，手动管理 Cookie | Nginx |

---

## 方式一：Cloudflare Worker（推荐 · 零服务器）

### 原理

```
浏览器
  │
  ▼
yupi.example.com  (CF Worker)
  │
  ├── /pic/*          → pic.code-nav.cn（图片代理）
  ├── /api/*          → api.codefather.cn（API 层）
  └── /*              → www.codefather.cn（主站 Next.js SSR）
        │
        注入 SESSION Cookie + 修复 URL + 注入 JS 补丁
```

**核心能力**：

- **SESSION 注入** — 服务端注入固定 Cookie，SSR 直出已登录 HTML
- **URL 重写** — 将所有 `codefather.cn` 域名替换为镜像域名
- **图片代理** — `/pic/*` 路径代理图片资源，解决跨域 514 错误
- **JS 补丁注入** — 修复浏览器缓存旧 chunk 时的 `/api/api/` 双前缀 bug
- **百度统计屏蔽** — 在 CF 境外节点拦截 `hm.baidu.com`，消除控制台连接错误

### 部署步骤

**第一步：创建 Worker**

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧 → Workers & Pages → Create → Create Worker
3. 命名（如 `yupi-proxy`）→ Deploy

**第二步：配置代码**

1. Worker 创建后 → Edit Code
2. 将 [`worker.js`](./worker.js) 的全部内容粘贴进编辑器
3. 修改顶部四个常量：

```js
const UPSTREAM_MAIN    = 'https://www.codefather.cn';   // 源站主域
const UPSTREAM_API     = 'https://api.codefather.cn';   // 源站 API 域
const MY_HOST          = 'yupi.example.com';            // 你的镜像域名
const FALLBACK_SESSION = '你的SESSION值';               // 主账号 SESSION Cookie
```

4. Save & Deploy

**第三步：绑定自定义域名**

1. Worker 页面 → Settings → Triggers → Custom Domains → Add
2. 填入你的域名（需在 Cloudflare 托管，如 `yupi.example.com`）
3. Save

> **也可用 Route 方式**：Websites → 你的域名 → Workers Routes → Add Route → `yupi.example.com/*` → 选择 Worker

**第四步：获取 SESSION**

1. 浏览器登录 `codefather.cn`
2. DevTools → Application → Cookies → 复制 `SESSION` 的值
3. 粘贴到 `FALLBACK_SESSION` 常量，重新 Deploy

### 通过 API 一键部署

```bash
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER_NAME}" \
  -H "X-Auth-Email: {EMAIL}" \
  -H "X-Auth-Key: {GLOBAL_API_KEY}" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2024-01-01"};type=application/json' \
  -F 'worker.js=@worker.js;type=application/javascript+module'
```

### 路由说明

| 路径 | 行为 |
|------|------|
| `/_next/static/*` | 反代静态资源，1 年强缓存 |
| `/api/*` | 转发到 `api.codefather.cn`，注入 SESSION Cookie |
| `/pic/*` | 反代 `pic.code-nav.cn` 图片（SVG 直接代理，其余走 `_next/image` 优化） |
| `/*` | 反代 `www.codefather.cn`，重写所有域名引用，注入 JS 补丁 |

### 注意事项

- SESSION Cookie 有效期约 30 天，过期后替换 `FALLBACK_SESSION` 常量并重新 Deploy
- 微信扫码登录**完全支持**：登录 API 路径不注入 FALLBACK_SESSION，避免覆盖用户自己的登录态
- CF 免费计划每天 10 万次请求，通常足够个人使用

---

## 方式二：Docker（本地 / 局域网）

**前置要求**：Docker + Docker Compose

```bash
git clone https://github.com/poboll/cf-proxy.git
cd cf-proxy
docker compose up -d
```

> 镜像已发布至 Docker Hub，`docker compose up -d` 会自动拉取，无需本地构建。
> - `nginx:alpine` — 官方镜像
> - [`poboll/cf-panel`](https://hub.docker.com/r/poboll/cf-panel) — 管理面板

访问 `http://localhost:3366`，微信扫码登录后 SESSION 自动持久化。

管理面板：`http://localhost:3366/panel/`

---

## 方式三：宝塔（生产域名）

> 无需 Docker，无需 Python，纯 Nginx。

**第一步：获取 Cookie**

1. Chrome 登录 `codefather.cn`
2. DevTools → Network → 任意请求 → 复制 `Cookie` 请求头完整值

**第二步：宝塔主 nginx.conf 添加缓存区**

软件商店 → Nginx → 配置修改，在 `http {` 下一行加：

```nginx
proxy_cache_path /tmp/nginx_pic_cache levels=1:2 keys_zone=pic_cache:10m max_size=500m inactive=7d use_temp_path=off;
```

**第三步：新建站点并配置**

1. 宝塔 → 网站 → 新建站点（域名填你的域名，不需要数据库/PHP）
2. 站点设置 → 配置文件 → 清空全部内容
3. 将 `nginx.conf` 内容粘贴进去，全局替换：
   - `YOUR_DOMAIN` → 你的域名（如 `yu.caiths.com`）
   - `YOUR_COOKIE_HERE` → 第一步复制的 Cookie 字符串（**两处**）
4. 保存 → 重载 Nginx

---

## 架构（Docker 模式）

```
浏览器
  │
  ▼
┌─────────────────────────────────────────┐
│  cf-proxy  (nginx:alpine · port 3366)   │
│                                         │
│  /panel/            ──────────────┐     │
│  /api/user/login    ──────────┐   │     │
│  /api/*  → api.codefather.cn  │   │     │
│  /*      → www.codefather.cn  │   │     │
└───────────────────────────────┼───┼─────┘
                                │   │
                    ┌───────────▼───▼──────────────┐
                    │  cf-panel  (python · 3367)    │
                    │                               │
                    │  · 管理面板 UI                │
                    │  · 拦截登录响应提取 SESSION    │
                    │  · 写回 nginx.local.conf      │
                    │  · 执行 nginx -s reload       │
                    │  · 15s 健康检查 + 自动重启     │
                    └───────────────────────────────┘
```

> **宝塔部署无需 cf-panel**，纯 Nginx 配置即可，手动更新 Cookie。

---

## Docker Hub

| 镜像 | 链接 |
|------|------|
| `poboll/cf-panel` | [hub.docker.com/r/poboll/cf-panel](https://hub.docker.com/r/poboll/cf-panel) |
| `nginx:alpine` | 官方镜像，自动拉取 |

---

## 管理面板（Docker 模式专属）

访问 `http://localhost:3366/panel/`

| 功能 | 说明 |
|------|------|
| Cookie 状态 | 实时检测 SESSION 是否有效，显示登录用户名 |
| SESSION 更新时间 | 最近一次自动持久化的时间 |
| SESSION 预计过期 | 根据 `max-age` 计算的过期时间 |
| 硬编码 Cookie | 手动粘贴 Cookie 并保存 |
| 从 JSON 导入 | 粘贴浏览器导出的 Cookie JSON，自动提取 SESSION |
| Nginx 日志 | 实时查看最近 80 行代理日志 |
| 重载配置 | 手动触发 `nginx -s reload` |

---

## 配置文件说明

| 文件 | 用途 |
|------|------|
| `worker.js` | Cloudflare Worker 脚本（CF 方式） |
| `nginx.local.conf` | Docker 模式 server 配置（自动管理） |
| `nginx.main.conf` | Docker 模式主配置（性能调优） |
| `nginx.conf` | 宝塔模式模板（手动部署用） |
| `docker-compose.yml` | Docker 服务编排 |
| `Dockerfile.panel` | 管理面板镜像构建 |
| `panel.py` | 管理面板服务（Python 单文件，仅 Docker 模式） |

---

## 常见问题

**Q: CF Worker SESSION 过期怎么办？**
替换 `worker.js` 顶部的 `FALLBACK_SESSION` 值，重新 Deploy Worker 即可。

**Q: 微信扫码登录支持吗？（CF Worker）**
支持。登录 API 路径（`/api/user/login/*`）不注入 FALLBACK_SESSION，用户扫码后的 SESSION 由浏览器直接保存。

**Q: 宝塔部署需要 Python 或 Docker 吗？**
不需要。宝塔模式是纯 Nginx 配置，无需任何额外依赖。

**Q: Docker 模式的 Python panel 占用资源多吗？**
不多。常驻内存约 10MB，CPU 接近 0%。

**Q: SESSION 多久过期？**
通常 30 天（`max-age=2592000`）。

**Q: 出现 ERR_EMPTY_RESPONSE 怎么办？**
Docker 模式下 panel 每 15 秒健康检查，连续 2 次失败自动重启 proxy，通常 30 秒内自愈。宝塔模式手动重载 Nginx。

---

## 资源占用

| 方案 | 资源 |
|------|------|
| CF Worker | 免费 · 无服务器 |
| cf-proxy (nginx:alpine) | ~2 MB 内存 |
| cf-panel (poboll/cf-panel) | ~10 MB 内存 |

---

## License

MIT © [poboll](https://github.com/poboll)
