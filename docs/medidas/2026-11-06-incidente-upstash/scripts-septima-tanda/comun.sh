#!/usr/bin/env bash
# Sólo localhost, con dobles. Sin credenciales productivas.
INC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="D:/DESARROLLO/stream central"
dormir() { node -e "setTimeout(()=>{},$1)"; }
matar_puerto() { pid=$(netstat -ano | grep -E "(127.0.0.1|0.0.0.0):$1 .*LISTEN" | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1; }
parar_app() { for p in 3140 3150 3151 3152 3153 3154 3155; do matar_puerto $p; done; }
parar_banco() { for p in 3141 4804 4811 4802 4805 4812 4813; do matar_puerto $p; done; }
banco() {
  parar_app; parar_banco; dormir 500
  cd "$RAIZ/wt-inc-redis"
  (BANCO_PUERTO_BASE=4811 node scripts/banco/dobles.mjs > "$INC/dobles.log" 2>&1 &)
  (node "$INC/proxies.mjs" > "$INC/proxies.log" 2>&1 &)
  dormir 1500
  curl -s -X POST -H "content-type: application/json" -d '{"latenciaMs":40,"latenciaP95Ms":120,"semilla":7}' http://127.0.0.1:4811/__banco/config >/dev/null
  curl -s -X POST -H "content-type: application/json" -d '{"latenciaMs":20,"latenciaP95Ms":60,"semilla":7}' http://127.0.0.1:4812/__banco/config >/dev/null
  curl -s -X POST -H "content-type: application/json" -d '{"latenciaMs":10,"latenciaP95Ms":30,"semilla":7}' http://127.0.0.1:4813/__banco/config >/dev/null
}
# app <etiqueta> <worktree> <puerto> [VAR=1 ...]
app() {
  et="$1"; wt="$2"; pp="$3"; shift 3
  (cd "$RAIZ/$wt"; source scripts/banco/entorno.sh
   export TMDB_BASE_URL=http://127.0.0.1:4805 UPSTASH_REDIS_REST_URL=http://127.0.0.1:4804 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3141 SUPABASE_SERVICE_ROLE_KEY=banco-sin-clave-real IDIOMA_TITULOS=es-MX YUMP_FECHA=2026-11-06
   env "$@" npx next start -p "$pp" > "$INC/next-$et-$pp.log" 2>&1 &)
}
esperar() { for pp in "$@"; do for i in $(seq 1 40); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$pp/top" && break; dormir 1000; done; done; }
abiertos() { netstat -ano | grep -cE ':(3140|3141|3150|3151|3152|3153|3154|3155|4802|4804|4805|4811|4812|4813) .*LISTEN'; }
