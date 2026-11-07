#!/usr/bin/env bash
# Recorridos en navegador: producción y código final. Sólo localhost.
source "$(dirname "$0")/comun.sh"
var() { et="$1"; wt="$2"; shift 2; banco; app "$et" "$wt" 3140 "$@"; esperar 3140; (cd "$INC"; node nav-final.mjs "$et"); parar_app; dormir 800; }
var produccion wt-inc-redis X=1
var final wt-fichas X=1
parar_app; parar_banco
echo "puertos abiertos: $(abiertos)"
