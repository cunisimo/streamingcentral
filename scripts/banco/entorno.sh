# El entorno del BANCO AISLADO. Se carga con `source scripts/banco/entorno.sh`
# antes de `npm run build` y de `npx next start`, en un worktree SIN
# `.env.local`: ninguna de estas variables es una credencial real y ninguna
# apunta a Producción. Los tres dobles los levanta `node scripts/banco/dobles.mjs`.
#
# Las dos primeras son las que lib/tmdb-base.ts exige para salir de la API
# oficial: la URL del doble Y la marca explícita. Sin `YUMP_BANCO=1` la URL se
# ignora; con `VERCEL_ENV=production` se ignoran las dos.
export YUMP_BANCO=1
export TMDB_BASE_URL=http://127.0.0.1:4801
export TMDB_READ_TOKEN=banco-sin-token-real

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4802
export NEXT_PUBLIC_SUPABASE_ANON_KEY=banco-sin-clave-real

export UPSTASH_REDIS_REST_URL=http://127.0.0.1:4803
export UPSTASH_REDIS_REST_TOKEN=banco-sin-token-real

export NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
# Que ninguna variable heredada del shell apunte al Redis de Vercel.
unset KV_REST_API_URL KV_REST_API_TOKEN SUPABASE_SERVICE_ROLE_KEY VERCEL_ENV
