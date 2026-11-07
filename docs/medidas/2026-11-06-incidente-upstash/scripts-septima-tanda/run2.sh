#!/usr/bin/env bash
# Latencia de la barrera: producción, rama sin barrera, rama y su control A/A. Sólo localhost.
source "$(dirname "$0")/comun.sh"
banco
app produccion wt-inc-redis 3140 X=1
app sinBarrera wt-fichas-exp 3150 EXP_SIN_BARRERA=1
app rama wt-fichas-exp 3151 X=1
app ramaB wt-fichas-exp 3152 X=1
esperar 3140 3150 3151 3152
cd "$INC"
node latencia.mjs latencia-barrera.json produccion=3140 sinBarrera=3150 rama=3151 ramaB=3152
parar_app; parar_banco
echo "puertos abiertos: $(abiertos)"
