const UPSTREAM_MAIN  = 'https://www.codefather.cn';
const UPSTREAM_API   = 'https://api.codefather.cn';
const MY_HOST        = 'yupi.caiths.com';
const FALLBACK_SESSION = 'MzhjYTBiODAtOWQ4MS00YTI3LWFlOTItOWZiOGZhYjQ4Mzk0';

const REWRITE_TYPES = [
  'text/html',
  'text/javascript',
  'application/javascript',
  'application/json',
  'text/plain',
  'text/css',
  'text/x-component',
];

const INJECT_SCRIPT = `<script>
(function(){
  window._hmt = window._hmt || { push: function(){} };

  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var fixed = url.replace(/(\/api)\/api\//, '$1/');
    if (fixed !== url) {
      input = (typeof input === 'string') ? fixed : new Request(fixed, input);
    }
    return _fetch.call(this, input, init);
  };

  function hardHome(e){
    var a = e.target.closest('a[href="/"]');
    if(!a) return;
    var logo = a.closest('#logo, .ant-pro-top-nav-header-logo');
    if(!logo && !a.closest('.ant-pro-base-menu-horizontal')) return;
    e.preventDefault();
    e.stopPropagation();
    if('caches' in window){
      caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); });
    }
    window.location.replace('/');
  }
  document.addEventListener('click', hardHome, true);
})();
</script>
`;

function needsRewrite(ct) {
  if (!ct) return false;
  const base = ct.split(';')[0].trim().toLowerCase();
  return REWRITE_TYPES.some(t => base === t || base.startsWith(t + ';'));
}

function rewriteUrls(text, scheme) {
  return text
    .replaceAll('https://pic.code-nav.cn',  scheme + '://' + MY_HOST + '/pic')
    .replaceAll('https://api.codefather.cn', scheme + '://' + MY_HOST)
    .replaceAll('https://www.codefather.cn', scheme + '://' + MY_HOST)
    .replaceAll('http://localhost:3366',      scheme + '://' + MY_HOST);
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

function buildUpstreamCookie(request, loginPath) {
  const incoming = request.headers.get('Cookie') || '';
  const userSession = getUserSession(incoming);
  if (loginPath) {
    return userSession ? 'SESSION=' + userSession : '';
  }
  return 'SESSION=' + (userSession || FALLBACK_SESSION);
}

function copySetCookies(upstreamHeaders, outHeaders) {
  const entries = upstreamHeaders.getAll
    ? upstreamHeaders.getAll('set-cookie')
    : (upstreamHeaders.get('set-cookie') ? [upstreamHeaders.get('set-cookie')] : []);
  for (const entry of entries) {
    outHeaders.append('Set-Cookie', rewriteSetCookie(entry));
  }
}

function copyHeaders(src, excludeKeys) {
  const out = new Headers();
  for (const [k, v] of src.entries()) {
    if (!excludeKeys.includes(k.toLowerCase())) out.set(k, v);
  }
  return out;
}

const SKIP_HEADERS = ['set-cookie', 'content-security-policy', 'x-frame-options'];

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

    // ── /pic/* ──────────────────────────────────────────────────────────────
    if (path.startsWith('/pic/')) {
      const picPath   = path.slice(4);
      const originUrl = 'https://pic.code-nav.cn' + picPath + url.search;
      const isSvg    = picPath.toLowerCase().endsWith('.svg');

      if (isSvg) {
        const resp = await fetch(originUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.codefather.cn/' },
          cf: { cacheTtl: 86400, cacheEverything: true },
        });
        const rh = new Headers(resp.headers);
        rh.set('Cache-Control', 'public, max-age=86400');
        rh.set('Access-Control-Allow-Origin', '*');
        return new Response(resp.body, { status: resp.status, headers: rh });
      }

      const proxyUrl = 'https://www.codefather.cn/_next/image?url='
                       + encodeURIComponent(originUrl) + '&w=1920&q=90';
      const resp = await fetch(proxyUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://www.codefather.cn/',
          'Accept': 'image/avif,image/webp,image/apng,*/*',
        },
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
      const rh = new Headers(resp.headers);
      rh.set('Cache-Control', 'public, max-age=86400');
      rh.set('Access-Control-Allow-Origin', '*');
      return new Response(resp.body, { status: resp.status, headers: rh });
    }

    // ── /api/* ──────────────────────────────────────────────────────────────
    if (path.startsWith('/api/')) {
      const targetUrl = UPSTREAM_API + path + url.search;
      const rh = cleanRequestHeaders(request.headers, 'api.codefather.cn');
      rh.set('Origin',  'https://www.codefather.cn');
      rh.set('Referer', 'https://www.codefather.cn/');

      const isLoginPath = path.startsWith('/api/user/login') ||
                          path.startsWith('/api/user/logout') ||
                          path === '/api/user/get/login';

      const cookieVal = buildUpstreamCookie(request, isLoginPath);
      if (cookieVal) {
        rh.set('Cookie', cookieVal);
      } else {
        rh.delete('Cookie');
      }

      const upstream = await fetch(targetUrl, {
        method:  request.method,
        headers: rh,
        body:    ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      });

      const ct   = upstream.headers.get('content-type') || '';
      const outH = copyHeaders(upstream.headers, SKIP_HEADERS);
      outH.set('Access-Control-Allow-Origin',      scheme + '://' + MY_HOST);
      outH.set('Access-Control-Allow-Credentials', 'true');
      outH.set('Access-Control-Expose-Headers',    '*');
      outH.set('Cache-Control', 'no-store');
      copySetCookies(upstream.headers, outH);

      if (needsRewrite(ct)) {
        const text = await upstream.text();
        outH.delete('content-length');
        return new Response(rewriteUrls(text, scheme), { status: upstream.status, headers: outH });
      }
      return new Response(upstream.body, { status: upstream.status, headers: outH });
    }

    // ── /_next/static/* ─────────────────────────────────────────────────────
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

    // ── ALL OTHER REQUESTS → www.codefather.cn ──────────────────────────────
    const rh = cleanRequestHeaders(request.headers, 'www.codefather.cn');
    rh.set('Cookie',  buildUpstreamCookie(request, false));
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
        outH.delete('content-length');
        const insertAt = text.lastIndexOf('</body>');
        text = insertAt !== -1
          ? text.slice(0, insertAt) + INJECT_SCRIPT + text.slice(insertAt)
          : text + INJECT_SCRIPT;
      }

      outH.delete('content-length');
      return new Response(text, { status: upstream.status, headers: outH });
    }

    return new Response(upstream.body, { status: upstream.status, headers: outH });
  },
};
