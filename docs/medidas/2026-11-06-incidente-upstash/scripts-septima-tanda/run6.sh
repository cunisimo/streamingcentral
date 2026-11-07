#!/usr/bin/env bash
# Latencia del código final: proveedor lento/colgado y por flujo. Sólo localhost, sin otra carga.
source "$(dirname "$0")/comun.sh"
banco
app produccion wt-inc-redis 3140 X=1
app rama wt-fichas-exp 3150 X=1
app final wt-fichas 3151 X=1
app finalB wt-fichas 3152 X=1
app sinDisp wt-fichas-exp 3153 EXP_SIN_BARRERA=1 EXP_SIN_DISP=1
app tmTodas wt-fichas-exp 3154 EXP_SIN_BARRERA=1 EXP_TM_TANDA=1 EXP_TM_FICHA=1
esperar 3140 3150 3151 3152 3153 3154
cd "$INC"
node latencia.mjs latencia-final-lento.json produccion=3140 rama=3150 final=3151 finalB=3152
node latencia2.mjs latencia-final-flujos.json produccion=3140 rama=3150 final=3151 finalB=3152 sinDisp=3153 tmTodas=3154
parar_app; parar_banco
echo "puertos abiertos: $(abiertos)"
