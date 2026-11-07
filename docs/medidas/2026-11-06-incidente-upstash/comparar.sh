#!/usr/bin/env bash
# Corre la misma comparación sobre cada SHA ya compilado. Sólo localhost.
INC="$(cd "$(dirname "$0")" && pwd)"
RAIZ="D:/DESARROLLO/stream central"
parar() { pid=$(netstat -ano | grep -E "0.0.0.0:3140 .*LISTEN" | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1; }
parar
cd "$RAIZ/wt-inc-redis"
(BANCO_PUERTO_BASE=4811 node scripts/banco/dobles.mjs > "$INC/dobles.log" 2>&1 &)
(node "$INC/proxies.mjs" > "$INC/proxies.log" 2>&1 &)
rm -f "$INC/nav.jsonl"
for par in "915ef2e:wt-inc-d" "ca02c4f:wt-inc-a" "e8929e5:wt-inc-b" "dffd1d7:wt-inc-redis"; do
  sha="${par%%:*}"; wt="${par##*:}"
  cd "$RAIZ/$wt"; echo; echo "=========== $sha ($(git rev-parse --short HEAD))"
  source scripts/banco/entorno.sh
  export TMDB_BASE_URL=http://127.0.0.1:4805 UPSTASH_REDIS_REST_URL=http://127.0.0.1:4804 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3141 SUPABASE_SERVICE_ROLE_KEY=banco-sin-clave-real
  (npx next start -p 3140 > "$INC/next-$sha.log" 2>&1 &)
  for i in $(seq 1 30); do curl -s -m 2 -o /dev/null http://127.0.0.1:3140/top && break; node -e "setTimeout(()=>{},1000)"; done
  curl -s "http://127.0.0.1:4802/__modulo?v=0" >/dev/null
  node "$INC/medir6.mjs" "$sha"
  node "$INC/nav.mjs" "$sha" 412
  node "$INC/nav.mjs" "$sha" 1280
  if [ "$sha" = "dffd1d7" ] || [ "$sha" = "e8929e5" ]; then
    curl -s "http://127.0.0.1:4802/__modulo?v=1" >/dev/null
    node "$INC/nav.mjs" "$sha-resenas-on" 412
    curl -s "http://127.0.0.1:4802/__modulo?v=0" >/dev/null
  fi
  if [ "$sha" = "dffd1d7" ]; then
    node "$INC/nav.mjs" "$sha-googlebot" 412 "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  fi
  parar
done
for p in 3141 4804 4811 4802 4805; do pid=$(netstat -ano | grep -E "(127.0.0.1|0.0.0.0):$p .*LISTEN" | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1; done
echo; echo "puertos abiertos: $(netstat -ano | grep -cE ':(3140|3141|4802|4804|4805|4811|4812|4813) .*LISTEN')"
