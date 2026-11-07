#!/usr/bin/env bash
INC="$(cd "$(dirname "$0")" && pwd)"
RAIZ="D:/DESARROLLO/stream central"
parar() { pid=$(netstat -ano | grep -E "0.0.0.0:3140 .*LISTEN" | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1; }
parar
cd "$RAIZ/wt-inc-redis"
(BANCO_PUERTO_BASE=4811 node scripts/banco/dobles.mjs > "$INC/dobles.log" 2>&1 &)
(node "$INC/proxies.mjs" > "$INC/proxies.log" 2>&1 &)
node -e "setTimeout(()=>{},1500)"
for ronda in "antes:wt-inc-redis" "despues:wt-fichas"; do
  et="${ronda%%:*}"; wt="${ronda##*:}"
  cd "$RAIZ/$wt"
  source scripts/banco/entorno.sh
  export TMDB_BASE_URL=http://127.0.0.1:4805 UPSTASH_REDIS_REST_URL=http://127.0.0.1:4804 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3141 SUPABASE_SERVICE_ROLE_KEY=banco-sin-clave-real
  (npx next start -p 3140 > "$INC/next-$et.log" 2>&1 &)
  for i in $(seq 1 30); do curl -s -m 2 -o /dev/null http://127.0.0.1:3140/top && break; node -e "setTimeout(()=>{},1000)"; done
  node "$INC/verificar.mjs" "$et"
  parar
done
for p in 3141 4804 4811 4802 4805; do pid=$(netstat -ano | grep -E "(127.0.0.1|0.0.0.0):$p .*LISTEN" | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1; done
echo "puertos abiertos: $(netstat -ano | grep -cE ':(3140|3141|4802|4804|4805|4811|4812|4813) .*LISTEN')"
