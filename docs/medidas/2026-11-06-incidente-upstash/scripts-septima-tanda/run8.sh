#!/usr/bin/env bash
# Código final definitivo (con `disp:` por título y lectura compartida) contra producción. Sólo localhost.
source "$(dirname "$0")/comun.sh"
var() { et="$1"; wt="$2"; shift 2
  banco
  app "$et" "$wt" 3140 "$@"; app "$et" "$wt" 3150 "$@"; app "$et" "$wt" 3151 "$@"
  esperar 3140 3150 3151
  (cd "$INC"; node flujos.mjs "$et" 3140; node simult.mjs "$et" 3140,3150,3151; node escalonado.mjs "$et" 3140)
  parar_app; dormir 800
}
var produccion wt-inc-redis X=1
var finalTM wt-fichas X=1
var finalTMB wt-fichas X=1
# Robots, sobre el build final.
banco; app finalTM wt-fichas 3140 X=1; esperar 3140
curl -s -o "$INC/robots-finalTM.txt" -w 'robots.txt status=%{http_code} tipo=%{content_type}\n' http://127.0.0.1:3140/robots.txt
parar_app
# Latencia, en la misma ventana y con control A/A.
banco
app produccion wt-inc-redis 3140 X=1
app finalTM wt-fichas 3151 X=1
app finalTMB wt-fichas 3152 X=1
esperar 3140 3151 3152
cd "$INC"
node latencia.mjs latencia-tm-lento.json produccion=3140 finalTM=3151 finalTMB=3152
node latencia2.mjs latencia-tm-flujos.json produccion=3140 finalTM=3151 finalTMB=3152
parar_app; parar_banco
echo "puertos abiertos: $(abiertos)"
