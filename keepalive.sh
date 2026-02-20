#!/bin/bash
CONF="$(cd "$(dirname "$0")" && pwd)/nginx.local.conf"

reload_nginx() {
    docker exec cf-proxy nginx -s reload 2>/dev/null && echo "nginx reloaded"
}

if [ "$1" = "--update" ]; then
    [ -z "$2" ] && echo "Usage: $0 --update \"<cookie>\"" && exit 1
    sed -i '' "s|proxy_set_header Cookie \"[^\"]*\"|proxy_set_header Cookie \"$2\"|g" "$CONF"
    reload_nginx
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cookie updated and nginx reloaded"
    exit 0
fi

INTERVAL=${1:-600}
get_cookie() {
    grep 'proxy_set_header Cookie' "$CONF" | head -1 | sed 's/.*Cookie "\([^"]*\)".*/\1/'
}

while true; do
    COOKIE=$(get_cookie)
    RESP=$(curl -s --max-time 15 -H "Cookie: $COOKIE" \
        -H "Referer: https://www.codefather.cn" \
        "https://api.codefather.cn/api/user/get/login")
    CODE=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code','?'))" 2>/dev/null)
    TS=$(date '+%Y-%m-%d %H:%M:%S')
    if [ "$CODE" = "0" ]; then
        echo "[$TS] OK  session alive"
    else
        echo "[$TS] WARN session expired (code=$CODE) — run: $0 --update \"<new_cookie>\""
        osascript -e 'display notification "SESSION 已过期，运行 keepalive.sh --update 更新 Cookie" with title "codefather proxy"' 2>/dev/null
    fi
    sleep "$INTERVAL"
done
