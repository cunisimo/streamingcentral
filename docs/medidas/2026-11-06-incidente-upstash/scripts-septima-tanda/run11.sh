#!/usr/bin/env bash
# Build del árbol final sobre main y verificación de robots.txt y una ficha. Sólo localhost, dobles.
source "$(dirname "$0")/comun.sh"
(cd "$RAIZ/wt-fichas"; source scripts/banco/entorno.sh
 export TMDB_BASE_URL=http://127.0.0.1:4805 UPSTASH_REDIS_REST_URL=http://127.0.0.1:4804 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3141 SUPABASE_SERVICE_ROLE_KEY=banco-sin-clave-real IDIOMA_TITULOS=es-MX YUMP_FECHA=2026-11-06
 npm run build > "$INC/build-final-main.log" 2>&1; echo "build=$?")
banco; app finalMain wt-fichas 3140 X=1; esperar 3140
curl -s -o "$INC/robots-final-main.txt" -w 'robots status=%{http_code} tipo=%{content_type}\n' http://127.0.0.1:3140/robots.txt
od -c "$INC/robots-final-main.txt"
curl -s -o /dev/null -w 'ficha status=%{http_code}\n' "http://127.0.0.1:3140/api/title/movie/905001?providers=n,d,m"
curl -s -o /dev/null -w 'persona status=%{http_code}\n' "http://127.0.0.1:3140/api/person/906001?filmografia=v2"
curl -s -o /dev/null -w 'home status=%{http_code}\n' "http://127.0.0.1:3140/"
parar_app; parar_banco; echo "puertos abiertos: $(abiertos)"
