#!/usr/bin/env bash
# Costo con TMDB disperso por variante. Sólo localhost.
source "$(dirname "$0")/comun.sh"
var() { et="$1"; wt="$2"; shift 2; banco; app "$et" "$wt" 3140 "$@"; esperar 3140; (cd "$INC"; node disperso.mjs "$et" 3140); parar_app; dormir 800; }
var produccion wt-inc-redis X=1
var rama wt-fichas-exp X=1
var sinBarrera wt-fichas-exp EXP_SIN_BARRERA=1
var ambasFicha wt-fichas-exp EXP_SIN_DISP=1 EXP_TM_TANDA=1 EXP_TM_FICHA=1
var sbAmbasFicha wt-fichas-exp EXP_SIN_BARRERA=1 EXP_SIN_DISP=1 EXP_TM_TANDA=1 EXP_TM_FICHA=1
parar_app; parar_banco
echo "puertos abiertos: $(abiertos)"
