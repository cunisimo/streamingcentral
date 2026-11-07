#!/usr/bin/env bash
# Compila el código final definitivo, repite el navegador y mide todo. Sólo localhost, sin credenciales productivas.
source "$(dirname "$0")/comun.sh"
(cd "$RAIZ/wt-fichas"; source scripts/banco/entorno.sh
 export TMDB_BASE_URL=http://127.0.0.1:4805 UPSTASH_REDIS_REST_URL=http://127.0.0.1:4804 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3141 SUPABASE_SERVICE_ROLE_KEY=banco-sin-clave-real IDIOMA_TITULOS=es-MX YUMP_FECHA=2026-11-06
 npm run build > "$INC/build-finalTM.log" 2>&1; echo "build=$?")
banco; app finalTM wt-fichas 3140 X=1; esperar 3140; (cd "$INC"; node nav-final.mjs finalTM); parar_app; dormir 800
bash "$INC/run8.sh"
