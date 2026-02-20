#!/usr/bin/env python3
import http.server, subprocess, re, os, json, html, ssl, urllib.request, urllib.error, threading, time
from datetime import datetime
from urllib.parse import parse_qs

_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=_SSL), _NoRedirect
)

CONF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nginx.local.conf")
CONTAINER = "cf-proxy"
PORT = 3367
_RE = re.compile(r"(?m)(^\s*proxy_set_header Cookie )(\S[^;]*)(;)")
_STATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".session_state.json")

PAGE = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CF Proxy</title>
<style>
  :root {{
    --bg:#0f0f0f;--surface:#1a1a1a;--border:#2a2a2a;
    --text:#e8e8e8;--muted:#888;--accent:#3b82f6;
    --ok:#22c55e;--err:#ef4444;
  }}
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);height:100vh;display:grid;grid-template-columns:320px 1fr}}
  .side{{background:var(--surface);border-right:1px solid var(--border);padding:24px 20px;display:flex;flex-direction:column;gap:18px;overflow-y:auto}}
  .main{{padding:24px;display:flex;flex-direction:column;gap:12px;overflow:hidden}}
  h1{{font-size:15px;font-weight:600;letter-spacing:-.3px}}
  h2{{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}}
  .card{{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px}}
  .dot{{width:8px;height:8px;border-radius:50%;flex-shrink:0}}
  .ok{{background:var(--ok);box-shadow:0 0 6px var(--ok)}}
  .browser{{background:var(--accent);box-shadow:0 0 6px var(--accent)}}
  .expired{{background:var(--err);box-shadow:0 0 6px var(--err)}}
  .row{{display:flex;align-items:center;gap:10px}}
  .lbl{{font-size:13px;font-weight:500}}
  .sub{{font-size:11px;color:var(--muted);margin-top:2px}}
  textarea{{width:100%;padding:9px 11px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font:12px/1.4 monospace;resize:vertical;min-height:72px;outline:none;transition:border-color .15s}}
  textarea:focus{{border-color:var(--accent)}}
  .btns{{display:flex;gap:8px;margin-top:8px}}
  button{{padding:7px 13px;border-radius:6px;border:1px solid var(--border);font:13px/1 inherit;cursor:pointer;transition:all .15s}}
  .primary{{background:var(--accent);border-color:var(--accent);color:#fff}}
  .primary:hover{{background:#2563eb}}
  .ghost{{background:transparent;color:var(--muted)}}
  .ghost:hover{{background:var(--border);color:var(--text)}}
  hr{{border:none;border-top:1px solid var(--border)}}
  pre{{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;overflow:auto;font:11px/1.5 monospace;color:#aaa;white-space:pre-wrap;word-break:break-all}}
  a{{color:var(--accent);text-decoration:none;font-size:12px}}
  a:hover{{text-decoration:underline}}
  .log-hdr{{display:flex;align-items:center;justify-content:space-between}}
  .badge{{font-size:11px;padding:2px 8px;border-radius:4px;background:var(--border);color:var(--muted)}}
</style>
</head>
<body>
<div class="side">
  <div>
    <h1>CF Proxy Panel</h1>
    <a href="http://localhost:3366" target="_blank" style="margin-top:4px;display:block">localhost:3366 ↗</a>
  </div>
  <div class="card">
    <h2>Cookie 状态</h2>
    <div class="row">
      <div class="dot {dot}"></div>
      <div><div class="lbl">{label}</div><div class="sub">{mode}</div></div>
    </div>
    <div class="sub" style="margin-top:8px">SESSION 更新时间：{session_time}</div>
    <div class="sub">SESSION 预计过期：{session_expire}</div>
  </div>
  <form method="post" action="set">
    <h2>硬编码 Cookie <span style="font-weight:400;text-transform:none;letter-spacing:0">（留空=透传浏览器）</span></h2>
    <textarea name="cookie" placeholder="SESSION=abc123...">{cookie}</textarea>
    <div class="btns">
      <button type="submit" class="primary">保存并重载</button>
      <button type="submit" name="cookie" value="" class="ghost">清除</button>
    </div>
  </form>
  <hr>
  <form method="post" action="import-json">
    <h2>从 JSON 导入</h2>
    <textarea name="json" placeholder='[{{"name":"SESSION","value":"..."}}]' style="min-height:80px"></textarea>
    <div class="btns"><button type="submit" class="primary">提取 SESSION 并保存</button></div>
  </form>
  <hr>
  <form method="post" action="reload">
    <h2>Nginx</h2>
    <button type="submit" class="ghost">↺ 重载配置</button>
  </form>
  <div style="margin-top:auto"><a href=".">↺ 刷新</a></div>
</div>
<div class="main">
  <div class="log-hdr"><h2 style="margin:0">Nginx 日志</h2><span class="badge">最近 80 行</span></div>
  <pre id="log">{logs}</pre>
</div>
<script>var l=document.getElementById('log');if(l)l.scrollTop=l.scrollHeight;</script>
</body></html>"""


def _conf():
    return open(CONF).read()


def get_cookie():
    m = _RE.search(_conf())
    if m:
        v = m.group(2).strip().strip('"')
        if v != "$http_cookie":
            return v
    return ""


def _read_state():
    try:
        with open(_STATE) as f:
            return json.load(f)
    except Exception:
        return {}


def _write_state(updated_at=None, expires_at=None):
    st = _read_state()
    if updated_at:
        st["updated_at"] = updated_at
    if expires_at is not None:
        st["expires_at"] = expires_at
    with open(_STATE, "w") as f:
        json.dump(st, f)


def _extract_max_age(cookie_text):
    m = re.search(r"(?:^|;\s*)max-age=(\d+)", cookie_text, re.I)
    return int(m.group(1)) if m else None


def _persist_session(session, max_age=None):
    current = get_cookie()
    target = f"SESSION={session}"
    if current == target:
        return
    set_cookie(target)
    reload()
    now = int(time.time())
    _write_state(updated_at=now, expires_at=(now + max_age) if max_age else None)


def get_session_time():
    st = _read_state()
    ts = st.get("updated_at")
    if not ts:
        return "未记录"
    try:
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return "未知"


def get_session_expire():
    st = _read_state()
    exp = st.get("expires_at")
    if not exp:
        return "未知"
    try:
        return datetime.fromtimestamp(exp).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return "未知"


def set_cookie(cookie):
    val = "$http_cookie" if not cookie else f'"{cookie}"'
    new_conf = _RE.sub(lambda m: m.group(1) + val + m.group(3), _conf())
    with open(CONF, "w") as f:
        f.write(new_conf)


def _extract_session(cookie_text):
    m = re.search(r"(?:^|;\s*)SESSION=([^;]+)", cookie_text)
    return m.group(1) if m else None


def reload():
    return (
        subprocess.run(
            ["docker", "exec", CONTAINER, "nginx", "-s", "reload"], capture_output=True
        ).returncode
        == 0
    )


def check_status(cookie):
    if not cookie:
        return "browser", "使用浏览器 Cookie", "动态模式"
    r = subprocess.run(
        [
            "curl",
            "-s",
            "--max-time",
            "5",
            "-H",
            f"Cookie: {cookie}",
            "https://api.codefather.cn/api/user/get/login",
        ],
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(r.stdout)
        if data.get("code") == 0:
            name = data.get("data", {}).get("userName", "已登录")
            return "ok", f"✓ {name}", "硬编码 Cookie"
        return "expired", f"已过期 (code={data.get('code')})", "硬编码 Cookie"
    except:
        return "expired", "检测失败", "硬编码 Cookie"


def get_logs():
    r = subprocess.run(
        ["docker", "logs", CONTAINER, "--tail", "80"], capture_output=True, text=True
    )
    return html.escape((r.stdout + r.stderr)[-6000:])


def _proxy_alive():
    try:
        with urllib.request.urlopen("http://proxy/", timeout=3) as r:
            return r.status < 500
    except Exception:
        return False


def _restart_proxy():
    subprocess.run(["docker", "restart", CONTAINER], capture_output=True)


def _self_heal_loop():
    fails = 0
    while True:
        if _proxy_alive():
            fails = 0
        else:
            fails += 1
            if fails >= 2:
                _restart_proxy()
                fails = 0
        time.sleep(15)


def _bootstrap_state():
    st = _read_state()
    if st.get("updated_at"):
        return
    c = get_cookie()
    if "SESSION=" not in c:
        return
    try:
        _write_state(updated_at=int(os.path.getmtime(CONF)))
    except Exception:
        pass


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/"):
            self._intercept()
            return
        c = get_cookie()
        dot, label, mode = check_status(c)
        session_time = get_session_time()
        session_expire = get_session_expire()
        body = PAGE.format(
            dot=dot,
            label=html.escape(label),
            mode=mode,
            session_time=html.escape(session_time),
            session_expire=html.escape(session_expire),
            cookie=html.escape(c),
            logs=get_logs(),
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._intercept()
            return
        length = int(self.headers.get("Content-Length", 0))
        d = parse_qs(self.rfile.read(length).decode())
        if self.path == "/set":
            set_cookie(d.get("cookie", [""])[0])
            reload()
        elif self.path == "/import-json":
            try:
                cookies = json.loads(d.get("json", ["[]"])[0])
                sv = next(
                    (c["value"] for c in cookies if c.get("name") == "SESSION"), None
                )
                if sv:
                    set_cookie(f"SESSION={sv}")
                    reload()
            except Exception:
                pass
        else:
            reload()
        self.send_response(302)
        self.send_header("Location", self.headers.get("Referer", "."))
        self.end_headers()

    def _intercept(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        upstream = "https://api.codefather.cn" + self.path
        req = urllib.request.Request(upstream, data=body, method=self.command)
        req.add_header("Host", "api.codefather.cn")
        for h in (
            "Cookie",
            "Content-Type",
            "Referer",
            "Origin",
            "Accept",
            "Authorization",
        ):
            v = self.headers.get(h)
            if v:
                req.add_header(h, v)
        req_cookie = self.headers.get("Cookie", "")
        req_session = _extract_session(req_cookie)
        if req_session:
            _persist_session(req_session)
        try:
            resp = _OPENER.open(req, timeout=15)
            code, hdrs, data = resp.status, resp.getheaders(), resp.read()
        except urllib.error.HTTPError as e:
            code, hdrs, data = e.code, list(e.headers.items()), e.read()
        for k, v in hdrs:
            if k.lower() == "set-cookie":
                session = _extract_session(v)
                if session:
                    _persist_session(session, _extract_max_age(v))
        self.send_response(code)
        skip = {"transfer-encoding", "connection", "server", "date"}
        for k, v in hdrs:
            if k.lower() not in skip:
                self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(data)
        except BrokenPipeError:
            pass

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    _bootstrap_state()
    env_cookie = os.environ.get("COOKIE", "").strip()
    if env_cookie:
        set_cookie(env_cookie)
    threading.Thread(target=_self_heal_loop, daemon=True).start()
    print(f"Panel → http://localhost:{PORT}")
    http.server.HTTPServer(("", PORT), H).serve_forever()
