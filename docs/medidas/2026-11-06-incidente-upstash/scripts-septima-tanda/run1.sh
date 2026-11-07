#!/usr/bin/env bash
# Flujos y simultáneas por variante. Sólo localhost.
source "$(dirname "$0")/comun.sh"
var() { # etiqueta worktree flags...
  et="$1"; wt="$2"; shift 2
  banco
  app "$et" "$wt" 3140 "$@"; app "$et" "$wt" 3150 "$@"; app "$et" "$wt" 3151 "$@"
  esperar 3140 3150 3151
  (cd "$INC"; node flujos.mjs "$et" 3140; node simult.mjs "$et" 3140,3150,3151)
  parar_app; dormir 800
}
var produccion wt-inc-redis X=1
var rama wt-fichas-exp X=1
var ramaB wt-fichas-exp X=1
var sinDisp wt-fichas-exp EXP_SIN_DISP=1
var tmTanda wt-fichas-exp EXP_TM_TANDA=1
var tmTodas wt-fichas-exp EXP_TM_TANDA=1 EXP_TM_FICHA=1
var ambas wt-fichas-exp EXP_SIN_DISP=1 EXP_TM_TANDA=1
var ambasFicha wt-fichas-exp EXP_SIN_DISP=1 EXP_TM_TANDA=1 EXP_TM_FICHA=1
var sinBarrera wt-fichas-exp EXP_SIN_BARRERA=1
var sbSinDisp wt-fichas-exp EXP_SIN_BARRERA=1 EXP_SIN_DISP=1
var sbAmbasFicha wt-fichas-exp EXP_SIN_BARRERA=1 EXP_SIN_DISP=1 EXP_TM_TANDA=1 EXP_TM_FICHA=1
parar_app; parar_banco
echo "puertos abiertos: $(abiertos)"
