const UPSTREAM_MAIN    = 'https://www.codefather.cn';
const UPSTREAM_API     = 'https://api.codefather.cn';
const MY_HOST          = 'yupi.caiths.com';
const FALLBACK_SESSION = 'MzhjYTBiODAtOWQ4MS00YTI3LWFlOTItOWZiOGZhYjQ4Mzk0';
const SESSION_TTL      = 2592000;

let cachedSession = null;

const CACHEABLE_API_PATHS = [
  '/api/tag/get/all_select',
  '/api/keywordHighlight/list/all',
  '/api/tag/list/all_select',
  '/api/post/tag/list/all',
];
const API_CACHE_TTL = 60;

const REWRITE_TYPES = [
  'text/html',
  'text/javascript',
  'application/javascript',
  'application/json',
  'text/plain',
  'text/css',
  'text/x-component',
];

const PANEL_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>cf-proxy 管理面板</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:24px}
.wrap{max-width:720px;margin:0 auto}
h1{font-size:1.5rem;font-weight:700;color:#f8fafc;margin-bottom:24px}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:16px}
.card h2{font-size:.875rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:.8rem;font-weight:600}
.badge.ok{background:#052e16;color:#4ade80;border:1px solid #166534}
.badge.warn{background:#431407;color:#fb923c;border:1px solid #9a3412}
.mono{font-family:'SF Mono',Consolas,monospace;font-size:.8rem;word-break:break-all;color:#a5f3fc;background:#0f172a;padding:10px 12px;border-radius:8px;margin-top:8px;border:1px solid #1e3a5f}
.row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1e293b}
.row:last-child{border-bottom:none}
.label{color:#94a3b8;font-size:.875rem}
.val{color:#f1f5f9;font-size:.875rem;font-weight:500}
textarea{width:100%;background:#0f172a;border:1px solid #334155;color:#e2e8f0;border-radius:8px;padding:10px;font-family:'SF Mono',monospace;font-size:.8rem;resize:vertical;margin-top:8px;min-height:80px}
textarea:focus{outline:none;border-color:#3b82f6}
button{background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:.875rem;font-weight:600;cursor:pointer;margin-top:10px;transition:background .2s}
button:hover{background:#2563eb}
.msg{margin-top:10px;font-size:.8rem;padding:8px 12px;border-radius:8px;display:none}
.msg.ok{background:#052e16;color:#4ade80;border:1px solid #166534;display:block}
.msg.err{background:#431407;color:#fb923c;border:1px solid #9a3412;display:block}
</style>
</head>
<body>
<div class="wrap">
  <h1>⚡ cf-proxy 管理面板</h1>
  <div class="card" id="status-card">
    <h2>SESSION 状态</h2>
    <div id="status-body">加载中...</div>
  </div>
  <div class="card">
    <h2>手动更新 SESSION</h2>
    <p style="color:#94a3b8;font-size:.875rem;margin-bottom:4px">粘贴新的 SESSION Cookie 值（仅值，不含 "SESSION="）</p>
    <textarea id="session-input" placeholder="MzhjYTBi..."></textarea>
    <button onclick="updateSession()">保存并生效</button>
    <div id="update-msg" class="msg"></div>
  </div>
  <div class="card">
    <h2>操作</h2>
    <button onclick="clearCache()">清除 Worker 内存缓存</button>
    <span style="color:#475569;font-size:.8rem;margin-left:12px">强制下次请求从 KV 重新读取</span>
    <div id="cache-msg" class="msg"></div>
  </div>
</div>
<script>
async function fetchStatus() {
  const r = await fetch('/panel/api/status');
  const d = await r.json();
  const ok = d.valid;
  document.getElementById('status-body').innerHTML = \`
    <div style="margin-bottom:12px"><span class="badge \${ok?'ok':'warn'}">\${ok?'✓ 有效':'✗ 已过期或无效'}</span></div>
    <div class="row"><span class="label">SESSION 来源</span><span class="val">\${d.source}</span></div>
    <div class="row"><span class="label">用户名</span><span class="val">\${d.username||'（未能获取）'}</span></div>
    <div class="row"><span class="label">Worker 内存缓存</span><span class="val">\${d.memCached?'已命中':'未命中（首次访问）'}</span></div>
    <div class="mono">\${d.sessionPreview}</div>
  \`;
}
async function updateSession() {
  const val = document.getElementById('session-input').value.trim();
  const msg = document.getElementById('update-msg');
  if (!val) { showMsg(msg,'err','请填写 SESSION 值'); return; }
  const r = await fetch('/panel/api/update', { method:'POST', body:val });
  const d = await r.json();
  if (d.ok) { showMsg(msg,'ok','✅ 已写入 KV 并刷新内存缓存'); fetchStatus(); }
  else       { showMsg(msg,'err','❌ 失败: '+d.error); }
}
async function clearCache() {
  await fetch('/panel/api/clear-cache', { method:'POST' });
  showMsg(document.getElementById('cache-msg'),'ok','✅ 内存缓存已清除');
}
function showMsg(el,cls,text) {
  el.textContent=text; el.className='msg '+cls;
  setTimeout(()=>{ el.style.display='none'; el.className='msg'; },4000);
}
fetchStatus();
</script>
</body>
</html>`;

function needsRewrite(ct) {
  if (!ct) return false;
  const base = ct.split(';')[0].trim().toLowerCase();
  return REWRITE_TYPES.some(t => base === t || base.startsWith(t + ';'));
}

function rewriteUrls(text, scheme) {
  return text
    .replaceAll('https://pic.code-nav.cn',   scheme + '://' + MY_HOST + '/pic')
    .replaceAll('https://api.codefather.cn',  scheme + '://' + MY_HOST)
    .replaceAll('https://www.codefather.cn',  scheme + '://' + MY_HOST)
    .replaceAll('http://localhost:3366',       scheme + '://' + MY_HOST);
}

function rewriteSetCookie(raw) {
  return raw
    .replace(/;\s*domain=[^;]*/gi, '')
    .replace(/;\s*samesite=\w+/gi, '; SameSite=Lax');
}

function cleanRequestHeaders(headers, upstreamHost) {
  const h = new Headers(headers);
  h.set('Host', upstreamHost);
  h.delete('x-forwarded-for');
  h.delete('cf-connecting-ip');
  h.delete('cf-ipcountry');
  h.delete('cf-ray');
  h.delete('cf-visitor');
  h.delete('Accept-Encoding');
  return h;
}

function getUserSession(cookieHeader) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)SESSION=([^;]+)/);
  return m ? m[1] : null;
}

function extractSessionFromSetCookie(headers) {
  const entries = headers.getAll
    ? headers.getAll('set-cookie')
    : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  for (const raw of entries) {
    const m = raw.match(/SESSION=([^;]+)/i);
    if (m) return m[1];
  }
  return null;
}

async function getActiveSession(env, browserSession) {
  if (browserSession)  return browserSession;
  if (cachedSession)   return cachedSession;
  if (env.SESSION_KV) {
    const stored = await env.SESSION_KV.get('session');
    if (stored) { cachedSession = stored; return stored; }
  }
  return FALLBACK_SESSION;
}

async function buildUpstreamCookie(request, loginPath, env) {
  const userSession = getUserSession(request.headers.get('Cookie') || '');
  if (loginPath) return userSession ? 'SESSION=' + userSession : '';
  return 'SESSION=' + await getActiveSession(env, userSession);
}

function copySetCookies(upstreamHeaders, outHeaders) {
  const entries = upstreamHeaders.getAll
    ? upstreamHeaders.getAll('set-cookie')
    : (upstreamHeaders.get('set-cookie') ? [upstreamHeaders.get('set-cookie')] : []);
  for (const entry of entries) outHeaders.append('Set-Cookie', rewriteSetCookie(entry));
}

function copyHeaders(src, excludeKeys) {
  const out = new Headers();
  for (const [k, v] of src.entries()) {
    if (!excludeKeys.includes(k.toLowerCase())) out.set(k, v);
  }
  return out;
}


const SKIP_HEADERS = ['set-cookie', 'content-security-policy', 'x-frame-options'];

const INJECT_SCRIPT = `<script>
(function(){
  window._hmt=window._hmt||{push:function(){}};
  var _f=window.fetch;
  window.fetch=function(input,init){
    var url=(typeof input==='string')?input:(input&&input.url)||'';
    var fixed=url.replace(/(\/api)\/api\//,'$1/');
    if(fixed!==url)input=(typeof input==='string')?fixed:new Request(fixed,input);
    return _f.call(this,input,init);
  };
  function hardHome(e){
    var a=e.target.closest('a[href="/"]');
    if(!a)return;
    var logo=a.closest('#logo, .ant-pro-top-nav-header-logo');
    if(!logo&&!a.closest('.ant-pro-base-menu-horizontal'))return;
    e.preventDefault();e.stopPropagation();
    if('caches'in window)caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});});
    window.location.replace('/');
  }
  document.addEventListener('click',hardHome,true);
})();
<\/script>`;

async function handlePanel(path, request, env) {
  if (path === '/panel' || path === '/panel/') {
    return new Response(PANEL_HTML, {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (path === '/panel/api/status') {
    const kv = env.SESSION_KV ? await env.SESSION_KV.get('session') : null;
    const active = cachedSession || kv || FALLBACK_SESSION;
    const source = cachedSession ? 'Worker 内存缓存' : kv ? 'Workers KV' : 'FALLBACK_SESSION 常量';
    let username = null, valid = false;
    try {
      const r = await fetch('https://api.codefather.cn/api/user/get/login', {
        headers: { Cookie: 'SESSION=' + active, Host: 'api.codefather.cn' },
      });
      const j = await r.json();
      if (j.code === 0 && j.data) { valid = true; username = j.data.userName || j.data.userAccount || null; }
    } catch (_) {}
    return Response.json({ ok: true, valid, source, username, memCached: !!cachedSession,
      sessionPreview: active.slice(0, 20) + '...' + active.slice(-8) });
  }
  if (path === '/panel/api/update' && request.method === 'POST') {
    const newVal = (await request.text()).trim();
    if (!newVal || newVal.length < 10) return Response.json({ ok: false, error: 'SESSION 值无效' }, { status: 400 });
    if (!env.SESSION_KV) return Response.json({ ok: false, error: 'KV 未绑定' }, { status: 500 });
    await env.SESSION_KV.put('session', newVal, { expirationTtl: SESSION_TTL });
    cachedSession = newVal;
    return Response.json({ ok: true });
  }
  if (path === '/panel/api/clear-cache' && request.method === 'POST') {
    cachedSession = null;
    return Response.json({ ok: true });
  }
  return new Response('Not Found', { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const scheme = 'https';
    const path   = url.pathname;

    if (url.hostname === 'hm.baidu.com' || path === '/hm.js') {
      return new Response('', {
        status: 200,
        headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    if (path.startsWith('/panel')) return handlePanel(path, request, env);

    // ── /pic/* ──────────────────────────────────────────────────────────────
    if (path.startsWith('/pic/')) {
      const picPath   = path.slice(4);
      const originUrl = 'https://pic.code-nav.cn' + picPath + url.search;
      const isSvg    = picPath.toLowerCase().endsWith('.svg');
      const fetchUrl = isSvg ? originUrl
        : 'https://www.codefather.cn/_next/image?url=' + encodeURIComponent(originUrl) + '&w=1920&q=90';
      const resp = await fetch(fetchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.codefather.cn/',
          ...(isSvg ? {} : { 'Accept': 'image/avif,image/webp,image/apng,*/*' }) },
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
      const rh = new Headers(resp.headers);
      rh.set('Cache-Control', 'public, max-age=86400');
      rh.set('Access-Control-Allow-Origin', '*');
      return new Response(resp.body, { status: resp.status, headers: rh });
    }

    // ── /api/* ──────────────────────────────────────────────────────────────
    if (path.startsWith('/api/')) {
      const isCacheableApi = CACHEABLE_API_PATHS.includes(path) && request.method === 'GET';
      const isLoginPath    = path.startsWith('/api/user/login') ||
                             path.startsWith('/api/user/logout') ||
                             path === '/api/user/get/login';

      const targetUrl = UPSTREAM_API + path + url.search;
      const rh = cleanRequestHeaders(request.headers, 'api.codefather.cn');
      rh.set('Origin',  'https://www.codefather.cn');
      rh.set('Referer', 'https://www.codefather.cn/');

      const cookieVal = await buildUpstreamCookie(request, isLoginPath, env);
      if (cookieVal) rh.set('Cookie', cookieVal);
      else           rh.delete('Cookie');

      const upstream = await fetch(targetUrl, {
        method:  request.method,
        headers: rh,
        body:    ['GET', 'HEAD'].includes(request.method) ? null : request.body,
        cf: isCacheableApi ? { cacheTtl: API_CACHE_TTL, cacheEverything: true } : {},
      });

      const ct   = upstream.headers.get('content-type') || '';
      const outH = copyHeaders(upstream.headers, SKIP_HEADERS);
      outH.set('Access-Control-Allow-Origin',      scheme + '://' + MY_HOST);
      outH.set('Access-Control-Allow-Credentials', 'true');
      outH.set('Access-Control-Expose-Headers',    '*');
      outH.set('Cache-Control', isCacheableApi ? `public, s-maxage=${API_CACHE_TTL}` : 'no-store');
      copySetCookies(upstream.headers, outH);

      if (isLoginPath && env.SESSION_KV) {
        const newSession = extractSessionFromSetCookie(upstream.headers);
        if (newSession) {
          cachedSession = newSession;
          ctx.waitUntil(env.SESSION_KV.put('session', newSession, { expirationTtl: SESSION_TTL }));
        }
      }

      if (needsRewrite(ct)) {
        const text = await upstream.text();
        outH.delete('content-length');
        return new Response(rewriteUrls(text, scheme), { status: upstream.status, headers: outH });
      }
      return new Response(upstream.body, { status: upstream.status, headers: outH });
    }

    // ── /_next/static/* ──────────────────────────────────────────────────────
    if (path.startsWith('/_next/static/')) {
      const rh = cleanRequestHeaders(request.headers, 'www.codefather.cn');
      const upstream = await fetch(UPSTREAM_MAIN + path + url.search, {
        headers: rh,
        cf: { cacheTtl: 31536000, cacheEverything: true },
      });
      const ct   = upstream.headers.get('content-type') || '';
      const outH = new Headers(upstream.headers);
      outH.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (needsRewrite(ct)) {
        const text = await upstream.text();
        outH.delete('content-length');
        return new Response(rewriteUrls(text, scheme), { status: upstream.status, headers: outH });
      }
      return new Response(upstream.body, { status: upstream.status, headers: outH });
    }

    // ── /_next/image ─────────────────────────────────────────────────────────
    if (path.startsWith('/_next/image')) {
      const rh = cleanRequestHeaders(request.headers, 'www.codefather.cn');
      const upstream = await fetch(UPSTREAM_MAIN + path + url.search, {
        headers: rh,
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
      const outH = new Headers(upstream.headers);
      outH.set('Cache-Control', 'public, max-age=86400');
      return new Response(upstream.body, { status: upstream.status, headers: outH });
    }

    // ── ALL OTHER REQUESTS → www.codefather.cn ──────────────────────────────
    const rh = cleanRequestHeaders(request.headers, 'www.codefather.cn');
    rh.set('Cookie',  await buildUpstreamCookie(request, false, env));
    rh.set('Referer', 'https://www.codefather.cn/');
    rh.set('Origin',  'https://www.codefather.cn');

    const upstream = await fetch(UPSTREAM_MAIN + path + url.search, {
      method:  request.method,
      headers: rh,
      body:    ['GET', 'HEAD'].includes(request.method) ? null : request.body,
    });

    const ct   = upstream.headers.get('content-type') || '';
    const outH = copyHeaders(upstream.headers, SKIP_HEADERS);
    copySetCookies(upstream.headers, outH);

    if (needsRewrite(ct)) {
      let text = await upstream.text();
      text = rewriteUrls(text, scheme);

      if (ct.includes('text/html')) {
        const insertAt = text.lastIndexOf('</body>');
        text = insertAt !== -1
          ? text.slice(0, insertAt) + INJECT_SCRIPT + text.slice(insertAt)
          : text + INJECT_SCRIPT;

        outH.delete('content-length');
        outH.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
        return new Response(text, { status: upstream.status, headers: outH });
      }

      outH.delete('content-length');
      return new Response(text, { status: upstream.status, headers: outH });
    }

    return new Response(upstream.body, { status: upstream.status, headers: outH });
  },
};
