# StreamingCentral

Agregador de streaming (Argentina): qué ver en tus plataformas, sin perder 45 minutos buscando.
Catálogo desde TMDB, ratings de OMDB, reseñas editoriales propias en Supabase, caché en Upstash Redis.

## Stack
- Next.js 14 (App Router) + TypeScript
- TMDB (catálogo, watch providers, búsqueda) · OMDB (IMDb + Metacritic)
- Upstash Redis (caché) · Supabase (reseñas + auth del dashboard)

## Puesta en marcha (lo que tenés que hacer vos)

### 1. Crear cuentas y obtener claves (todas tienen tier gratis)
- **TMDB**: https://www.themoviedb.org/settings/api → copiá el **API Read Access Token (v4)**.
- **OMDB**: https://www.omdbapi.com/apikey.aspx → API key (gratis o USD 1/mes para 100k req/día).
- **Upstash**: https://upstash.com → creá una base Redis → copiá REST URL y REST TOKEN.
- **Supabase**: https://supabase.com → nuevo proyecto → Settings > API → URL y anon key.

### 2. Variables de entorno
Copiá `.env.local.example` a `.env.local` y completá las claves.

### 3. Base de datos
En Supabase → SQL Editor → pegá y ejecutá `supabase/schema.sql`.
Creá tu usuario editor en Supabase → Authentication > Users > Add user (email + password).

### 4. Instalar y correr
```bash
npm install
npm run dev
```
Abrí http://localhost:3000

## Estructura
- `app/` — páginas (Inicio, Películas, Series, Buscar, ficha, persona) + `app/admin` (dashboard) + `app/api` (backend).
- `components/` — UI (cards, shelves, filtros, detalle, búsqueda, nav).
- `lib/` — TMDB, OMDB, caché, categorías, providers AR, supabase, y `enrich.ts` (el merge).
- `supabase/schema.sql` — reseñas editoriales (activo) + votos/críticas de usuario (seam dormido).

## Dashboard editorial
`/admin/login` → con el usuario que creaste en Supabase. Cargás reseñas, marcás "Publicada",
y aparece el badge "Reseña" en las cards y la sección en la ficha.

## Notas técnicas
- "Mis plataformas" se guarda en localStorage (sin cuentas en la parte pública).
- Los provider IDs de AR están en `lib/providers-ar.ts`. Verificá la lista canónica con
  `GET /watch/providers/movie?watch_region=AR` y ajustá si hace falta.
- En las cards el rating es el de TMDB (rápido); IMDb + Metacritic (OMDB) salen en la ficha.
- Acento provisional: naranja (`--accent` en `app/globals.css`). Cambialo al definir la marca.
- Votos/críticas de usuario y la pestaña de perfil quedan preparados en el schema, sin construir.

## Deploy
Pensado para Vercel (frontend + API), con Upstash y Supabase ya externos.
También corre en tu propio servidor con `npm run build && npm start` detrás de un reverse proxy.
