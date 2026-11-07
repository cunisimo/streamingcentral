#!/usr/bin/env bash
# Corre las variantes sobre copias ya compiladas. Sólo localhost.
INC="$(cd "$(dirname "$0")" && pwd)"
RAIZ="D:/DESARROLLO/stream central"
parar() { for pp in 3140 3150 3151; do pid=$(netstat -ano | grep -E "0.0.0.0:$pp .*LISTEN" | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1; done; }
parar
cd "$RAIZ/wt-inc-redis"
(BANCO_PUERTO_BASE=4811 node scripts/banco/dobles.mjs > "$INC/dobles.log" 2>&1 &)
(node "$INC/proxies.mjs" > "$INC/proxies.log" 2>&1 &)
node -e "setTimeout(()=>{},1500)"
curl -s -X POST -H "content-type: application/json" -d '{"latenciaMs":40,"latenciaP95Ms":120,"semilla":7}' http://127.0.0.1:4811/__banco/config >/dev/null
curl -s -X POST -H "content-type: application/json" -d '{"latenciaMs":10,"latenciaP95Ms":30,"semilla":7}' http://127.0.0.1:4813/__banco/config >/dev/null
correr() { # etiqueta carpeta entorno
  et="$1"; wt="$2"; shift 2
  cd "$RAIZ/$wt"; source scripts/banco/entorno.sh
  export TMDB_BASE_URL=http://127.0.0.1:4805 UPSTASH_REDIS_REST_URL=http://127.0.0.1:4804 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3141 SUPABASE_SERVICE_ROLE_KEY=banco-sin-clave-real IDIOMA_TITULOS=es-MX
  for pp in 3140 3150 3151; do (env "$@" npx next start -p $pp > "$INC/next-$et-$pp.log" 2>&1 &); done
  for pp in 3140 3150 3151; do for i in $(seq 1 30); do curl -s -m 2 -o /dev/null http://127.0.0.1:$pp/top && break; node -e "setTimeout(()=>{},1000)"; done; done
  node "$INC/etapas.mjs" "$et" 3140,3150,3151
  parar
  node -e "setTimeout(()=>{},800)"
}
correr produccion wt-inc-redis X=1
correr rama wt-fichas-exp X=1
correr sinDisp wt-fichas-exp EXP_SIN_DISP=1
correr sfTop wt-fichas-exp EXP_SF_TM=1
correr videos wt-fichas-exp EXP_VIDEOS=1
correr sfCached wt-fichas-exp EXP_SF_CACHED=1
correr todas wt-fichas-exp EXP_SIN_DISP=1 EXP_SF_TM=1 EXP_VIDEOS=1 EXP_SF_CACHED=1
for p in 3141 4804 4811 4802 4805; do pid=$(netstat -ano | grep -E "(127.0.0.1|0.0.0.0):$p .*LISTEN" | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1; done
echo "puertos abiertos: $(netstat -ano | grep -cE ':(3140|3150|3151|3141|4802|4804|4805|4811|4812|4813) .*LISTEN')"
