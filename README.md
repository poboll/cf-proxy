# cf-proxy

<div align="center">

**codefather.cn 反向代理 · 多设备共享会员 · 自动 SESSION 持久化**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Nginx](https://img.shields.io/badge/nginx-alpine-009639?logo=nginx)](https://nginx.org)
[![Python](https://img.shields.io/badge/python-3.11--alpine-3776AB?logo=python)](https://python.org)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker)](https://docs.docker.com/compose/)

</div>

---

## 概述

cf-proxy 是一个基于 Nginx 的反向代理，将主账号 Cookie 注入所有请求，实现多设备共享 codefather.cn 会员权益。

**核心机制**：Nginx 在服务端注入固定 Cookie → Next.js SSR 直接输出已登录 HTML → 初始加载即显示登录态，无闪烁、无前端 JS 干预。

### 特性

- **零感知登录** — 服务端注入 Cookie，页面直出登录态
- **自动 SESSION 持久化** — 扫码登录后自动提取并写回配置，重启不丢失
- **自愈代理** — 后台健康检查，连续失败自动重启 Nginx 容器
- **可视化管理面板** — 实时查看 Cookie 状态、SESSION 更新时间、Nginx 日志
- **极低资源占用** — proxy 2MB / panel 10MB 内存
- **双部署模式** — 本地 Docker 一键启动 / 宝塔生产部署

---

## 架构

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

## 快速开始

### 方式一：Docker（本地 / 局域网）

**前置要求**：Docker + Docker Compose

```bash
git clone https://github.com/poboll/cf-proxy.git
cd cf-proxy
docker compose up -d
```

访问 `http://localhost:3366`，微信扫码登录后 SESSION 自动持久化。

管理面板：`http://localhost:3366/panel/`

---

### 方式二：宝塔（生产域名）

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

**验证**：访问域名，右上角直接显示用户头像/昵称即为成功。

**Cookie 过期后**：重新复制，替换配置文件中两处 `Cookie` 值，重载 Nginx。

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
| `nginx.local.conf` | Docker 模式 server 配置（自动管理） |
| `nginx.main.conf` | Docker 模式主配置（性能调优） |
| `nginx.conf` | 宝塔模式模板（手动部署用） |
| `docker-compose.yml` | Docker 服务编排 |
| `Dockerfile.panel` | 管理面板镜像构建 |
| `panel.py` | 管理面板服务（Python 单文件，仅 Docker 模式） |

---

## 常见问题

**Q: 宝塔部署需要 Python 或 Docker 吗？**
不需要。宝塔模式是纯 Nginx 配置，无需任何额外依赖。

**Q: Docker 模式的 Python panel 占用资源多吗？**
不多。常驻内存约 10MB，CPU 接近 0%。

**Q: SESSION 多久过期？**
通常 30 天（`max-age=2592000`）。面板显示预计过期时间，过期后扫码登录自动更新。

**Q: 出现 ERR_EMPTY_RESPONSE 怎么办？**
Docker 模式下 panel 每 15 秒健康检查，连续 2 次失败自动重启 proxy，通常 30 秒内自愈。宝塔模式手动重载 Nginx。

**Q: 如何更新 Cookie？**
- Docker：面板粘贴新 Cookie → 保存并重载；或扫码登录自动更新
- 宝塔：替换配置文件中的 Cookie 值 → 重载 Nginx

---

## 资源占用

| 容器 | 镜像 | 内存 |
|------|------|------|
| cf-proxy | nginx:alpine | ~2 MB |
| cf-panel | codefather-panel | ~10 MB |

---

## License

MIT © [poboll](https://github.com/poboll)
