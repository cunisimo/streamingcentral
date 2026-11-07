#!/usr/bin/env bash
# Repetición enfocada de persona y «Ver más» en frío, con A/A de ambas versiones. Sólo localhost.
source "$(dirname "$0")/comun.sh"
banco
app produccion wt-inc-redis 3140 X=1
app produccionB wt-inc-redis 3150 X=1
app finalTM wt-fichas 3151 X=1
app finalTMB wt-fichas 3152 X=1
esperar 3140 3150 3151 3152
cd "$INC"
node latencia3.mjs latencia-persona.json produccion=3140 produccionB=3150 finalTM=3151 finalTMB=3152
parar_app; parar_banco
echo "puertos abiertos: $(abiertos)"
