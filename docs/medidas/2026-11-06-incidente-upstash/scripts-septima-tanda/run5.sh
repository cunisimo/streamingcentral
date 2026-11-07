#!/usr/bin/env bash
# Código final contra referencia. Sólo localhost.
source "$(dirname "$0")/comun.sh"
var() { et="$1"; wt="$2"; shift 2
  banco
  app "$et" "$wt" 3140 "$@"; app "$et" "$wt" 3150 "$@"; app "$et" "$wt" 3151 "$@"
  esperar 3140 3150 3151
  (cd "$INC"; node flujos.mjs "$et" 3140; node simult.mjs "$et" 3140,3150,3151; node escalonado.mjs "$et" 3140)
  parar_app; dormir 800
}
var produccion wt-inc-redis X=1
var rama wt-fichas-exp X=1
var final wt-fichas X=1
var finalB wt-fichas X=1
# Robots, sobre el build final.
banco; app final wt-fichas 3140 X=1; esperar 3140
curl -s -o "$INC/robots-final.txt" -w 'robots.txt status=%{http_code} tipo=%{content_type}\n' http://127.0.0.1:3140/robots.txt
parar_app; parar_banco
echo "puertos abiertos: $(abiertos)"
