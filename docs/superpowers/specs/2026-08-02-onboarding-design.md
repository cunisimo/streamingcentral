# Onboarding inicial (MVP) — diseño

Fecha: 2026-08-02
Estado: aprobado para pasar a plan

## Context

Hoy, tras registrarse e ingresar, el usuario cae directo al Home sin personalizar
nada. Queremos un **onboarding premium de una sola pantalla** (no wizard) que se
muestre **una única vez** (primer login con `onboarding_completed = false`) y
capture: plataformas, avatar y nombre. Rápido (<1 min), con el lenguaje visual
actual de Yump.

**Decisión de alcance (fase 1):** el onboarding NO incluye país (se difiere a la
arquitectura multi-región futura). El catálogo sigue en AR. Pero la persistencia
queda preparada para multi-país. La selección de plataformas se guarda como
**`provider_id` de TMDB** en el perfil (para la fase 2), y además —decisión del
dueño— se **sincroniza con "mis plataformas"** del app (mapeando provider_id →
código para las 9 conocidas) para que el Home refleje lo elegido desde ya.

**Fuente de plataformas:** dinámica desde la tabla `providers` (no listas
hardcodeadas). Esa tabla hoy es parcial (solo providers de estrenos); se completa
implementando el job **`syncProviders`** que la puebla con la lista completa de AR
desde TMDB.

## Decisiones tomadas (brainstorming)

1. **Puente a fase 1: SÍ.** Onboarding guarda provider_ids en el perfil y además
   sincroniza `PlatformsContext` (sc:platforms) con los códigos mapeables.
2. **Completar la tabla con `syncProviders`.** Se implementa el job (hoy stub) que
   trae la lista completa de providers AR de TMDB. El dueño redepliega el Edge
   Function y corre el job.
3. Onboarding de **una sola pantalla** con scroll, 3 bloques, botón "Comenzar"
   sticky. Sin país en el MVP.

## 1 y 2 · Base de datos — cambios en `profiles`

Agregar al final de la sección `profiles` en `supabase/schema.sql` (idempotente):

```sql
-- Onboarding: se completa una vez. Los usuarios EXISTENTES se marcan como
-- completado (no deben ver el onboarding); los nuevos arrancan en false.
alter table profiles add column if not exists onboarding_completed boolean;
update profiles set onboarding_completed = true where onboarding_completed is null;
alter table profiles alter column onboarding_completed set default false;
alter table profiles alter column onboarding_completed set not null;

-- Plataformas elegidas, como provider_id de TMDB (fase 2 usará esto para el
-- filtro real por región). Vacío = "no tengo ninguna".
alter table profiles add column if not exists platforms integer[] not null default '{}';

-- País (prep multi-región; el onboarding MVP no lo pide todavía).
alter table profiles add column if not exists country_code text not null default 'AR';
```

RLS: cubierto por las policies existentes de `profiles` (el dueño lee/edita su
fila). El trigger `protect_is_admin` no afecta estas columnas.

## 3 · Componentes que se reutilizan

- **`AvatarPicker`** (+ `AvatarModal`/`AvatarGrid`/`AvatarCard`) — bloque 2, sin
  duplicar nada. Ya persiste vía `updateAvatar` de AuthContext.
- **`AuthContext`** — fuente del `user`/`profile`; se extiende (ver §Servicios).
- **`PlatformsContext`** — para el puente a "mis plataformas" (se le agrega un
  método `set`).
- **`codeForTmdbId`** (`lib/providers-ar.ts`) — mapeo provider_id → código para el
  puente.
- Tokens/estilos existentes (`.btn`, `.field`, `.card`, grid, `--accent`, etc.).
- `TMDB_IMG` para armar la URL del logo desde `logo_path`.

## 4 · Componentes / archivos nuevos

- `app/onboarding/page.tsx` — ruta que renderiza `OnboardingView`.
- `app/api/providers/route.ts` — GET; lee la tabla `providers`, filtra ruido
  (nombres con "Channel"), ordena por `display_priority`, devuelve
  `{ providers: [{ id, name, logo }] }` con `logo` = URL TMDB (`w92`). Acepta
  `?region=` para forward-compat (hoy siempre AR).
- `components/onboarding/OnboardingView.tsx` — orquestador de la pantalla única:
  encabezado ("👋 ¡Bienvenido a Yump! Personalizá tu experiencia. Solo te llevará
  un minuto."), los 3 bloques, botón "Comenzar" sticky/accesible durante el scroll.
- `components/onboarding/PlatformPicker.tsx` (bloque 1) — fetch a `/api/providers`,
  grilla responsive de `ProviderCard` + tarjeta "➕ No tengo ninguna por ahora";
  multi-selección; texto inferior "Podrás cambiarlas cuando quieras desde
  Configuración."
- `components/onboarding/ProviderCard.tsx` — tarjeta: logo + nombre + estado
  seleccionado.
- `components/onboarding/NameBlock.tsx` (bloque 3) — input de nombre.
- `components/onboarding/useOnboarding.ts` — hook: estado + orquestación de
  persistencia (carga inicial desde el perfil; guarda cada bloque).
- `components/onboarding/OnboardingGate.tsx` — guard client-side (en el layout).
- **`supabase/functions/tmdb-sync/jobs/sync-providers.ts`** — implementar el job:
  trae `/watch/providers/movie?watch_region=AR` + `/tv` de TMDB, mergea y hace
  upsert en `providers` (id, name, logo_path, display_priority, updated_at).
  Wire en el dispatcher (`index.ts`: sacar del set de "no implementado", agregar a
  `HANDLERS`).

## 5 · Servicios / persistencia

Extender `AuthContext` (patrón de `updateAvatar`/`updateDisplayName` ya existente),
para mantener el `profile` del contexto consistente y que el gate reaccione:

- `Profile` suma: `onboarding_completed: boolean`, `platforms: number[]`,
  `country_code: string`. `loadProfile` agrega esas columnas al `select`.
- `updatePlatforms(ids: number[])` — `update profiles.platforms` + refresca el
  contexto.
- `completeOnboarding()` — `update onboarding_completed = true` + refresca el
  contexto.

`PlatformsContext` suma `set(codes: PlatformCode[])` (persiste a localStorage).

**Puente a "mis plataformas":** al cambiar la selección, `useOnboarding` mapea los
provider_ids → códigos con `codeForTmdbId`; si el set mapeado es **no vacío**,
llama `PlatformsContext.set(codes)` (los no mapeables — VIX/Claro — quedan solo en
`profile.platforms` para fase 2). Si es vacío (ninguna o solo no mapeables), **no
toca** sc:platforms (deja el default para no dejar el Home vacío).

Persistencia **inmediata por bloque**:
- Plataformas: al togglear → `updatePlatforms(ids)` + puente.
- Nombre: al `blur` del input → `updateDisplayName(name)`.
- Avatar: el "Guardar" del `AvatarPicker` → `updateAvatar` (ya existe).
- "Comenzar": `completeOnboarding()` → `router.push("/")`.

## 6 · Flujo completo

```
Registro → (confirmación mail si aplica) → primer login
   → OnboardingGate ve user && profile && !onboarding_completed
   → redirige a /onboarding
   → Bloque 1 plataformas (guarda al togglear) 
   → Bloque 2 avatar (guarda con su botón)
   → Bloque 3 nombre (guarda al blur)
   → "Comenzar" → onboarding_completed = true → Home
Próximos logins: onboarding_completed = true → el gate no redirige.
```

`OnboardingGate` (en `app/layout.tsx`, dentro de AuthProvider): cuando
`ready && user && profile && !onboarding_completed && pathname !== "/onboarding"`
→ `router.replace("/onboarding")`. En `/onboarding` con el flag ya en true →
`router.replace("/")`. No redirige logueado-out ni durante la carga.

## 7 · Recuperación si queda incompleto

El **perfil en Supabase es la fuente de verdad**. Cada bloque se guarda al
instante, así que si el usuario cierra la app a mitad:
- El flag sigue en `false` → el gate lo vuelve a mandar a `/onboarding`.
- `useOnboarding` inicializa su estado leyendo el `profile`: plataformas =
  `profile.platforms`, nombre = `profile.display_name` (o metadata de auth),
  avatar = `profile.avatar_*`. Todo lo ya hecho aparece precargado.
- El flag solo se setea con "Comenzar". Nunca se pierde información.

## 8 · Preparado para bloques futuros

`OnboardingView` renderiza una **lista ordenada de bloques**; agregar uno nuevo
(país, géneros favoritos, idioma, notificaciones) = agregar su sección + su estado
en `useOnboarding` + (si persiste) su columna/servicio, **sin** rediseñar la
arquitectura. La persistencia por-bloque y el gate no cambian. El módulo
`components/onboarding/` queda desacoplado del login.

## Integración con futuras funcionalidades

- **Filtros por plataforma / migración multi-región (fase 2):** `profile.platforms`
  (provider_ids) y `profile.country_code` ya están; la fase 2 hace que el app filtre
  por ellos y use `country_code` como `watch_region`, retirando el puente.
- **Planner / recomendaciones / notificaciones / estrenos:** consumen
  `profile.platforms` + `country_code` como preferencias del usuario.

## Diseño visual / accesibilidad

- Lenguaje visual de Yump intacto (colores, tipografía, espaciados, componentes).
  Reusa `.btn`, `.field`, patrón de `.card`, grid responsive, tokens.
- Microanimaciones suaves (fade/scale en selección de tarjetas; transición del
  botón). Respetar `prefers-reduced-motion`.
- Botón "Comenzar" sticky (o siempre accesible) durante el scroll.
- Responsive: desktop centrado con `max-width`; mobile a una mano.
- Accesibilidad: focus visible, navegación por teclado, labels correctos,
  `aria-pressed` en tarjetas de plataforma, contraste adecuado.

## Fuera de alcance

- Selección de país (fase 2 multi-región).
- Migración del sistema de plataformas de códigos → provider_ids en todo el app
  (fase 2). Esta fase solo agrega el puente.
- OAuth (Google/Apple): no hay login social todavía; el prefill de nombre lee
  `user_metadata` (cubre el caso actual y el futuro OAuth sin cambios).
- `StandaloneWelcome` (welcome de la PWA instalada) queda como está; es un flujo
  distinto (anónimo, primer arranque instalado).

## Verificación

- `npx tsc --noEmit` (0 errores).
- `syncProviders`: el dueño redepliega el Edge Function y corre
  `{"job":"syncProviders"}`; verificar que `providers` incluye MUBI (id 11) y el
  resto de AR.
- Visual/funcional (dev): usuario nuevo (o `onboarding_completed=false`) → cae en
  /onboarding; elegir plataformas se refleja en el Home (puente); avatar y nombre
  se guardan; "Comenzar" → Home y no vuelve a aparecer; cerrar a mitad y volver →
  precarga lo hecho. Usuario existente → NO ve el onboarding.
