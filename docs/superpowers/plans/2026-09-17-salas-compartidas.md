# Salas compartidas (MVP) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un usuario registrado crea una sala, comparte un enlace, y entre 2 y 6 personas votan Sí/No/Paso sobre la misma tanda congelada de películas curadas; la sala determina match, ganador, empate o "no coincidieron", con votos individuales privados.

**Architecture:** Next.js/Vercel entrega la app y prepara las tandas (`/api/sala/preparar`, única ruta que toca TMDB/Redis, con `service_role`). Supabase guarda todo en cinco tablas cerradas (RLS sin policies, `revoke` a `anon`/`authenticated`) accesibles sólo por RPCs `security definer`; el participante se identifica por un token portador hasheado; el organizador por su JWT. Realtime Broadcast **público** transporta sólo "cambió la versión" desde un trigger de la base; los clientes releen el estado autoritativo con la RPC `sala_estado`, con una relectura como máximo cada 1,5 s. `pg_cron` barre cada minuto (cierres por plazo, preparaciones colgadas, borrado a los 5 min del último estado terminal).

**Tech Stack:** Next 14.2 App Router, TypeScript, `@supabase/supabase-js` 2.108 (Auth + PostgREST RPC + Realtime), Postgres (pgcrypto, pg_cron, `realtime.send`), Upstash Redis vía `lib/cache.ts`, TMDB vía `lib/enrich.ts`, `node --test`.

## Global Constraints

- Copy en español rioplatense. Nombres de producto exactos: "¡Nuestro match!", "¡HAY MATCH!", "¡Tenemos empate!", "Esta vez no coincidieron", "Desempatar", "Esperando al organizador", "Compartir nuestro match", "Crear sala", "Otra tanda".
- Participantes: mínimo **2**, máximo **6** (organizador incluido). Lobby vence a los **15 min** de crear la sala. Ventanas posteriores a empate/resultado: **5 min**. Preparación colgada: **90 s** (se aborta, nunca se borra la sala). Borrado físico: **sólo** salas en estado `vencida` con `expires_at` pasado, o sea 5 min después del último estado terminal; `sala_cerrar` **no** borra en el acto, marca `vencida` y conserva los 5 min. "Otra tanda" renueva `expires_at`.
- Contador local de **10 s** por card, con el comienzo persistido en `localStorage` por sala/ronda/posición: recargar no lo reinicia; se borra sólo cuando el servidor confirmó el avance (un fallo de red lo conserva). Los botones de voto usan el atributo real `disabled` durante la solicitud.
- Tandas: **5 → 120 s**, **10 → 180 s**, **20 → 300 s**. Default **10** y **Cualquiera**. Duraciones: `cualquiera` (unión estricta de `corta` ∪ `larga`), `corta` (`runtime <= 90`), `larga` (`runtime > 90`). **Siempre** `apto_chicos = false`, `media_type = 'movie'`, `razon` con texto real (`nullif(btrim(razon), '') is not null`: ni NULL, ni vacía, ni sólo espacios), `runtime > 0`. **`advertencia` ("Pero") es OPCIONAL** — "sin pero" = NULL, vacía o sólo espacios; "con pero" = texto real tras `btrim` — (decisión del dueño, 2026-09-18): una película sin "pero" entra igual, no se genera ningún texto de reemplazo, y `CardSala` no renderiza la sección "Pero" cuando no hay contenido.
- Contador local **10 s** por card → registra `pass`. El servidor sólo conoce el plazo global.
- Votos: `yes` | `no` | `pass`. Sólo la siguiente `pos` pendiente. Idempotente. El `participant_id` **siempre** se deriva del token; ninguna RPC lo acepta como parámetro.
- El cliente **nunca** calcula match/empate/ganador; la réplica TS de `sala_computar` existe **sólo en tests**.
- Relecturas disparadas por Broadcast: **máximo una cada 1500 ms** (trailing). Polling **sólo** mientras el canal no esté `SUBSCRIBED`, cada 5 s. Sin polling permanente.
- Nada de popularidad ni `vote_average` para elegir, ordenar o desempatar. Desempate = `min(md5(seed || tmdb_id))` entre empatadas.
- La revalidación con `cardsByIds` reusa `card:` (TTL 24 h) y `pv3:` (TTL 8 h): **la disponibilidad puede tener hasta 24 h de antigüedad**. Documentarlo así, nunca como "instantánea".
- El token nunca va en la URL ni en logs; en la base sólo `sha256`. `SUPABASE_SERVICE_ROLE_KEY` sólo en `lib/supabase-admin.ts` (server-only).
- Enlaces públicos siempre desde `SITIO_PUBLICO` (`lib/compartir.ts`), nunca `window.location.origin`.
- MVP web/PWA. En el contenedor Android (`ES_NATIVO`) la entrada "Crear sala" **no se muestra** y `app/sala` se excluye del build nativo.
- Una sola sala activa por organizador, garantizada **en la base** (bloqueo consultivo por usuario dentro de `sala_crear`), no por un `count` previo.
- **Toda función de la migración** tiene `revoke execute … from public, anon, authenticated`; sólo las de cara al cliente reciben un `grant` explícito. Un test inventaría cada `create function` y exige su fila de permisos.
- **Orden de bloqueo único: primero la fila de `rooms`, después la de `room_rounds`.** Ninguna función bloquea una ronda sin haber bloqueado antes su sala.
- Kill switch en dos capas: `SALAS_ACTIVAS=0` (servidor: la ruta responde 503) y `NEXT_PUBLIC_SALAS_ACTIVAS=0` (cliente: oculta la entrada; se inlinea en el build); ambas exigen redeploy. Para impedir de verdad la creación de salas existe `sala_config.activas` en la base, que `sala_crear` y `sala_unirse` consultan y que se cambia con SQL sin deploy.
- La API rechaza con **400** cantidad o duración inválidas; no aplica valores por defecto. El default (10, Cualquiera) vive en la interfaz.
- **El refresco productivo del pool NO es parte de este plan.** La Etapa 0 sólo audita en sólo lectura y deja listo el generador `--solo-datos`; ejecutar el refresco en Producción requiere una autorización aparte (Apéndice A).
- Si `realtime.send` no está disponible en el proyecto: **no-go**, sujeto a un nuevo diseño. Vercel no puede reemplazar la señal mientras los teléfonos escriban los votos directamente en Supabase.
- Nuevos `catch` en `app/api/**/route.ts` se clasifican en `lib/descartes-tmdb-inventario.test.ts` (el inventario falla si no).
- Antes de dar por bueno cualquier etapa: `npm test`, `npx tsc --noEmit`; al cerrar: `npm run build`.
- Sin merge, push ni deploy sin autorización del dueño. Sin cambios de panel sin autorización.

---

## Estado de precondiciones (comprobado el 2026-09-17)

| Precondición | Estado | Cómo se cierra |
|---|---|---|
| Docker Desktop | **instalado, daemon apagado** (`docker version` → `npipe` no encontrado) | El dueño abre Docker Desktop antes de la Etapa 1 |
| Supabase CLI | **2.111.0 instalada** | — |
| `supabase/config.toml` | **no existe** | `supabase init` en la rama (Tarea 0.4) |
| `pgcrypto`, `pg_cron`, `realtime.send`, versión de Postgres, "Allow public access" de Realtime, plan | **pendiente de panel** (MCP `Unauthorized`/`CONNECT_TIMEOUT`) | Tarea 0.1, lo lee el dueño |
| `SUPABASE_SERVICE_ROLE_KEY` en Vercel Production | **pendiente de panel** | Tarea 0.1 |

---

# Etapa 0 — Precondiciones y auditoría del pool (sólo lectura)

> Esta etapa **no escribe nada en el catálogo de Producción**. Audita en sólo lectura, deja listo el generador `--solo-datos` (probado con tests, sin ejecutarlo contra Producción) y arma el entorno local. El refresco productivo de disponibilidad y metadata es un procedimiento separado (Apéndice A) que requiere su propia autorización; **no amplía el pool ni incorpora textos editoriales**.

### Task 0.1: Lectura de panel (sin cambios)

**Files:** ninguno (el resultado va a `docs/ESTADO.md` en la Tarea 6.3).

- [ ] **Step 1: Supabase → Settings → General / Infrastructure:** anotar plan y versión de Postgres (para saber si `pg_cron` admite `"N seconds"`: exige ≥ 15.1.1.61 según https://supabase.com/docs/guides/cron/quickstart).
- [ ] **Step 2: Database → Extensions:** confirmar `pgcrypto` y `pg_cron` habilitadas. Si `pgcrypto` no está, habilitarla **requiere autorización** (es un cambio de panel) y se hace antes de la Tarea 1.1.
- [ ] **Step 3: SQL Editor (sólo lectura):**

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'realtime' and proname in ('send', 'broadcast_changes');
select jobname, schedule, active from cron.job;
select extname, extversion from pg_extension where extname in ('pgcrypto','pg_cron','pg_net');
```

Expected: `send` presente; `tmdb-sync-upcoming-daily` en `cron.job` (o anotar que no está); las tres extensiones listadas.

- [ ] **Step 4: Realtime → Settings:** confirmar que "Allow public access" está **activo** (default). Anotar conexiones concurrentes actuales.
- [ ] **Step 5: Vercel → Project → Settings → Environment Variables:** confirmar `SUPABASE_SERVICE_ROLE_KEY` en Production. **No** copiar el valor a ningún lado.
- [ ] **Step 6:** Vercel → Usage: anotar Function Invocations, Active CPU, Provisioned Memory y Fast Data Transfer de los últimos 30 días (números del panel, no de la doc).

### Task 0.2: Auditoría del pool (sólo lectura)

**Files:** `scripts/sala/auditoria-pool.sql` (Create — es texto SQL para pegar en el editor; no se ejecuta desde la app).

- [ ] **Step 1: El archivo ya existe en la rama** (`scripts/sala/auditoria-pool.sql`, commits `b3a3246`, `b264a16` y la corrección del 2026-09-18 que hace opcional la `advertencia`). Es la referencia: cinco consultas con los filtros exactos de `sala_candidatos` — `media_type = 'movie'`, `nullif(btrim(razon), '') is not null` (razón con texto real: ni NULL, ni vacía, ni sólo espacios), `runtime > 0`, `not apto_chicos`, `not requiere_contexto`, disponibilidad en AR — **sin exigir `advertencia`**. La consulta 1 informa `total_movie, con_razon, con_razon_y_pero, con_razon_y_duracion, servibles_sala, cortas, largas`; la 2, antigüedad de `title_availability` con umbrales de 24 h / 7 d / 30 d (la RPC no filtra por `checked_at`); la 3, servibles por unión de plataformas con la columna `sin_pero` (admitidas sin "Pero"); la 4, nombres de plataforma; la 5, el peso de cada filtro, donde `con_razon_sin_pero` son títulos **admitidos**, no descartados.

- [ ] **Step 2:** El dueño pega y guarda los resultados en `docs/medidas/2026-09-XX-salas-pool.md` (tabla tal cual). **Criterio go de la Etapa 1:** `cualquiera ≥ 20` en `n,d,m`, `n,d` y `n,d,m,p`; `≥ 10` en `n`. Si no, decisión del dueño antes de seguir.
- [ ] **Step 3:** Si la consulta 4 trae un nombre que no está en `lib/roulette-providers.ts` ni en su lista de exclusiones, anotarlo en `docs/ISSUES.md` (no se corrige en esta etapa).

### Task 0.3: `--solo-datos` en el generador de SQL del pool

**Files:**
- Modify: `scripts/build-roulette-sql.mjs`
- Test: `scripts/build-roulette-sql.test.mjs` (Create; corre con `node --test scripts/build-roulette-sql.test.mjs`)

**Interfaces:**
- Produces: la función exportada `armarUpsert(titulos, textos, { soloDatos })` que devuelve el SQL del `insert … on conflict`; con `soloDatos: true` **no menciona** `razon`, `advertencia` ni `atencion` ni en las columnas ni en el `do update`.

- [ ] **Step 1: Leer el script completo** (`sed -n 1,120p scripts/build-roulette-sql.mjs`) para ubicar el bloque que arma `insert into roulette_titles (...)` y el `on conflict … do update set` (hoy en las líneas ~60-83). Si las estructuras reales (`titulos`, mapa de textos) no coinciden con las que asume el test de abajo, **ajustar el test a las formas reales**, no al revés.
- [ ] **Step 2: Escribir el test que falla:**

```js
// scripts/build-roulette-sql.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarUpsert } from "./build-roulette-sql.mjs";

const titulo = { tmdb_id: 1, media_type: "movie", title: "X", year: 2000, runtime: 100, genres: ["Drama"], edad: "todos", apto_chicos: false, vote_count: 10, vote_average: 7.1 };

test("--solo-datos no toca las columnas editoriales", () => {
  const sql = armarUpsert([titulo], new Map([[1, { razon: "r", advertencia: "a", atencion: "alta" }]]), { soloDatos: true });
  assert.ok(!/razon|advertencia|atencion/.test(sql), sql);
  assert.match(sql, /on conflict \(tmdb_id, media_type\) do update set/);
  assert.match(sql, /runtime = excluded\.runtime/);
});

test("sin --solo-datos conserva el coalesce de siempre", () => {
  const sql = armarUpsert([titulo], new Map([[1, { razon: "r", advertencia: "a", atencion: "alta" }]]), { soloDatos: false });
  assert.match(sql, /razon = coalesce\(excluded\.razon, roulette_titles\.razon\)/);
});
```

- [ ] **Step 3: Correr:** `node --test scripts/build-roulette-sql.test.mjs` → FAIL (`armarUpsert` no exportada).
- [ ] **Step 4: Refactor mínimo del script:** extraer el armado del `insert` a `export function armarUpsert(titulos, textos, { soloDatos = false } = {})`; leer `--solo-datos` de `process.argv`; en modo `soloDatos` omitir las tres columnas de la lista y del `do update`. Proteger la ejecución principal con `if (import.meta.url === pathToFileURL(process.argv[1]).href)` para que el `import` desde el test no corra el generador.
- [ ] **Step 5: Correr el test** → PASS. Correr también el generador en modo normal contra `data/` y verificar con `git diff --stat data/` que **no cambia** ningún `carga-ruleta-*.sql` (el modo por defecto es byte a byte el de antes).
- [ ] **Step 6: Commit:** `git commit -m "chore(ruleta): --solo-datos en build-roulette-sql, sin tocar textos editoriales"`.

### Task 0.4: (reservada) — el refresco productivo salió de este plan

Ver **Apéndice A**. No se ejecuta dentro de la implementación de salas.

### Task 0.5: Entorno local de Supabase

**Files:**
- Create: `supabase/config.toml` (lo genera `supabase init`; se versiona)
- Create: `scripts/sala/db-local.mjs`
- Create: `scripts/sala/fixtures-local.sql`
- Create: `.env.sala-local.example`

**Interfaces:**
- Produces: `node scripts/sala/db-local.mjs` deja la base local con `schema.sql`, `001`, `002`, `003`, `009` (cuando exista) y las fixtures, aplicadas vía `docker exec -i <contenedor> psql -U postgres`.

- [ ] **Step 1:** Dueño abre Docker Desktop. Verificar: `docker version --format '{{.Server.Version}}'` → una versión, no error.
- [ ] **Step 2:** `supabase init` (crea `supabase/config.toml`; responder "N" a generar settings de VS Code/IntelliJ). **No** correr `supabase link`.
- [ ] **Step 3:** En `supabase/config.toml` poner `[db.migrations] enabled = false` (las migraciones del repo no siguen el orden/formato del CLI y dependen de `schema.sql`; se aplican con el script de abajo) y `[db.seed] enabled = false`.
- [ ] **Step 4:** `supabase start` → anotar `API URL`, `anon key`, `service_role key` locales (`supabase status`). Son claves **locales**, no secretas.
- [ ] **Step 5: Escribir `scripts/sala/db-local.mjs`:**

```js
// Aplica, en orden, lo que la sala necesita en la base LOCAL de `supabase start`.
// No usa psql local: manda cada archivo por stdin al psql del contenedor.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// `--catalogo-real` agrega los data/carga-ruleta-*.sql (autorizado por el dueño
// el 2026-09-18, sólo en local) para las mediciones de la Tarea 2.3. Las fixtures
// sintéticas (ids 90000001+) van siempre: las usa la batería de RLS.
import { readdirSync } from "node:fs";
const conCatalogo = process.argv.includes("--catalogo-real");
const cargas = conCatalogo
  ? readdirSync("data").filter((f) => /^carga-ruleta-\d+\.sql$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])).map((f) => `data/${f}`)
  : [];
const ARCHIVOS = [
  "supabase/schema.sql",
  "supabase/migrations/001_chip_titles.sql",
  "supabase/migrations/002_roulette.sql",
  "supabase/migrations/003_lock_roulette.sql",
  "supabase/migrations/009_salas.sql",
  ...cargas,
  "scripts/sala/fixtures-local.sql",
];

const nombre = execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" }).trim().split("\n")[0];
if (!nombre) { console.error("No hay contenedor supabase_db_*: ¿corriste `supabase start`?"); process.exit(1); }

for (const f of ARCHIVOS) {
  const r = spawnSync("docker", ["exec", "-i", nombre, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    input: readFileSync(f, "utf8"), encoding: "utf8",
  });
  if (r.status !== 0) { console.error(`✖ ${f}\n${r.stderr}`); process.exit(r.status ?? 1); }
  console.log(`✔ ${f}`);
}
```

- [ ] **Step 6: `scripts/sala/fixtures-local.sql` (ya en la rama; es la referencia).** Todo con ids ≥ 90000001, un rango que TMDB no alcanza (el catálogo real llega a 1.668.364). **41 servibles** con `n,d,m`: 40 "Ficticia" (`runtime` 82..160; las 5 primeras son `corta`) repartidas entre Netflix / Disney Plus / HBO Max, más **"Sin pero" (90000042)**, con `razon` presente y `advertencia` NULL, en HBO Max — servible desde el 2026-09-18 porque el "pero" es opcional. **Una** exclusiva de MUBI (90000041). Controles negativos que **nunca** salen de `sala_candidatos`: 2 `apto_chicos` (90000101-102), 1 sin duración (90000103), 1 **sin `razon`** (90000104), 1 con `requiere_contexto` (90000105), 1 serie `tv` (90000106), 1 sin disponibilidad en AR (90000107) y 1 con `razon` de **sólo espacios** (90000108, con disponibilidad: prueba el criterio `btrim`). El archivo además enciende `sala_config.activas` en local si la tabla existe.

Con `n,d,m` quedan **41** candidatas `cualquiera` (5 `corta`, 36 `larga`): alcanza para 20 y para probar `insuficientes` pidiendo 20 en `corta`.

- [ ] **Step 7: `.env.sala-local.example`:**

```
# Para correr `next dev` y las pruebas de RLS contra la base LOCAL de `supabase start`.
# Copiar a .env.sala-local y completar con `supabase status`. Nunca poner acá claves de Producción.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TMDB_READ_TOKEN=
```

- [ ] **Step 8:** `node scripts/sala/db-local.mjs` → `✔` en cada archivo (009 fallará hasta la Tarea 1.1: correr por ahora con la lista sin `009`, o aceptar el `✖` como esperado).
- [ ] **Step 9: Commit:** `git commit -m "chore(salas): entorno local de Supabase (config.toml, db-local, fixtures)"`.

---

# Etapa 1 — Base de datos (`009_salas.sql`)

### Tasks 1.1–1.4: `009_salas.sql` — HECHAS (rama `feat/salas`, 2026-09-18)

**El archivo real es la referencia**, no este documento:
[`supabase/migrations/009_salas.sql`](../../../supabase/migrations/009_salas.sql)
(up) y [`supabase/migrations/009_salas_down.sql`](../../../supabase/migrations/009_salas_down.sql)
(rollback), con [`lib/salas-migracion.test.ts`](../../../lib/salas-migracion.test.ts)
como guard textual (12 tests). Lo que se diseñó en las rondas de revisión del
plan está implementado tal cual, y estas son las **diferencias que aparecieron
al implementar**:

1. **La credencial la genera EL CLIENTE, y es la clave de idempotencia**
   (hueco encontrado por la auditoría: respuesta HTTP perdida en teléfonos; una
   primera versión con un `p_intento` uuid y tokens generados por la base se
   descartó porque cada reintento rotaba el token y las respuestas podían
   llegar desordenadas, y porque el intento en claro era una credencial de
   recuperación sin hashear). Ahora el cliente genera **32 bytes aleatorios en
   base64url (43 caracteres)**, los **persiste en `localStorage` antes de la
   primera solicitud** y manda siempre la misma en `sala_crear(p_nombre,
   p_platforms, p_credencial)`, `sala_unirse(p_room, p_nombre, p_platforms,
   p_credencial)` y `sala_reclamar(p_room, p_credencial)`. La base valida la
   forma (`sala_credencial_valida`), guarda **sólo el sha256**
   (`room_participants.token_hash`, único global) y **nunca genera ni devuelve
   tokens** (`sala_nuevo_token` no existe). Repetir la misma credencial devuelve
   la misma sala/participación con `repetido: true`, **sin rotar nada**: da
   igual cuántos reintentos concurrentes haya ni en qué orden lleguen las
   respuestas, la única credencial válida es la que el cliente ya tiene. La
   recuperación va **antes del kill switch y del estado** (recuperar no es
   crear ni ingresar). Una cuenta ya participante que entra con una credencial
   nueva pasa su participación a esa credencial (la anterior muere), y repetirla
   después —aun con la sala empezada— la recupera. **No se deduplica por
   nombre.** Una credencial distinta sigue chocando con `sala_ya_tiene_activa`,
   y una ya usada por otro participante con `sala_credencial_en_uso`.
2. **Regla de una sola sala activa, sin discrepancia con el índice.** Antes de
   contar, `sala_crear` aplica `sala_aplicar_vencimientos` a las salas no
   vencidas del organizador (un lobby con los 15 min pasados o una ventana de
   resultado agotada que el barrido todavía no procesó se marcan `vencida`
   ahí mismo), y el conteo usa exactamente el predicado del índice
   `rooms_host_activa_idx`: `estado <> 'vencida'`. El índice es de apoyo, no
   único; la regla la garantiza el bloqueo consultivo.
3. **`grant all on <tabla> to service_role` explícito** en las seis tablas: los
   default privileges difieren entre el stack local (sin SELECT para
   `service_role`) y Producción, y la migración no depende de ninguno.
4. **`sala_barrido` es "servidor"** (grant a `service_role` además del cron
   como `postgres`): la batería y Vercel pueden barrer a mano.
5. **Sin sobrecargas**: el up borra las firmas previas (sin credencial, o con
   `p_intento uuid`; sólo existieron en bases locales) y la batería las llama
   exigiendo que ninguna función responda — una sobrecarga vieja saltearía la
   idempotencia.
6. El down usa `drop table … cascade` (`sala_participante` devuelve el tipo de
   fila de `room_participants`) y borra también las firmas previas.

Contratos vigentes de las RPCs de cara al cliente:

- `sala_crear(p_nombre text, p_platforms text[], p_credencial text) → {room_id, repetido, estado}` — `authenticated`. La credencial es la que mandó el cliente; no se devuelve.
- `sala_unirse(p_room uuid, p_nombre text, p_platforms text[], p_credencial text) → {repetido}` — `anon, authenticated`.
- `sala_reclamar(p_room uuid, p_credencial text) → {ok, repetido}` — `authenticated` (otro navegador: la participación pasa a la credencial nueva).
- `sala_estado(p_room uuid, p_token text) → jsonb` — `anon, authenticated`.
- `sala_votar(p_room uuid, p_token text, p_round uuid, p_pos int, p_voto text) → {ok, motivo?, siguiente?, idempotente?, termine, estado}` — `anon, authenticated`.
- `sala_desempatar(p_room uuid) → {ganador_pos}`, `sala_cerrar(p_room uuid)` — `authenticated` (host).
- Servidor (`service_role`): `sala_iniciar_preparacion`, `sala_candidatos`, `sala_publicar_ronda`, `sala_abortar_preparacion`, `sala_barrido`.

**Para el cliente (Etapa 3):** `lib/sala/token-store.ts` genera la credencial
con `crypto.getRandomValues(new Uint8Array(32))` → base64url, la persiste
**antes** de la primera solicitud (`yump:sala:credencial:crear` hasta conocer
el `room_id`, y desde ahí `yump:sala:<room_id>`; para unirse, directamente
`yump:sala:<room_id>`) y reintenta `sala_crear`/`sala_unirse` **siempre con la
misma credencial**. Las respuestas sólo confirman `room_id`/`repetido`; ninguna
puede cambiar la credencial, así que el orden en que lleguen no importa.

### Task 1.5: Batería de pruebas con la anon key local — HECHA (37 pruebas en verde)

**El archivo real es la referencia:** [`scripts/sala/pruebas-rls.mjs`](../../../scripts/sala/pruebas-rls.mjs)
(`node --env-file=.env.sala-local scripts/sala/pruebas-rls.mjs`, contra la base
de `supabase start` con `db-local.mjs` aplicado). Usa la **anon key** y JWTs de
usuarios reales; `service_role` sólo para lo que en producción hace el servidor
(usuarios de prueba, relojes forzados, preparación, barrido). Las fixtures
llevan el proveedor sintético `Pruebas` para aislarse del catálogo real.
Salida guardada en `docs/medidas/2026-09-18-salas-rls-local.txt`.

Cobertura (número = prueba):

1 acceso directo a las seis tablas rechazado (anon y JWT) · 2 crear exige
sesión, rechaza plataformas desconocidas/vacías, token de 43 · 3 una sola sala
activa · 4 dedup/orden de plataformas, nombre normalizado · 5 anónimo y
autenticado, una cuenta no ocupa dos lugares, `sala_reclamar` rota · 6 token de
otra sala inválido · 7 máximo seis · 8 invitado sin acciones de host, anon y JWT
sin preparación · 9 candidatas (controles negativos afuera, "Sin pero" adentro,
unión congelada) y publicación atómica con siete rechazos sin filas a medias,
`advertencia` nula/vacía aceptada y normalizada, doble publicación rechazada ·
10 lobby cerrado · 11 voto en la siguiente `pos`, idempotente, `ya_votado` con
`siguiente`, fuera de orden, voto inválido · 12 nadie ve votos ajenos, sin
tokens ni ids ajenos · 13 seis participantes cerrando a la vez → un único
`ganador` · 14 dos Sí simultáneos en sala de 2 → un único `match`; un Sí solo
no es match · 15 empate en sala de 3, sólo el host desempata, ×3 el mismo
ganador = `min(md5(seed || tmdb_id))`, ventana renovada · 16 voto tras cierre ·
17 el barrido borra las seis tablas · 18 otra tanda excluye la anterior y una
repetida se rechaza · 19 payload falso en el tópico público no cambia nada ·
20 una sola sala activa bajo 10 `sala_crear` concurrentes · 21 publicar vs
abortar · 22 publicar vs barrido · 23 voto vs cierre por plazo sin votos
fantasma · 24 doce internas inejecutables · 25 kill switch en la base · 26
"otra tanda" a segundos del vencimiento renueva `expires_at` y el barrido no
toca `preparando` · 27 `preparando` nunca se borra, `sala_cerrar` conserva
5 min · 28 aborto con lobby vencido renueva `lobby_expires_at` · **29 crear con
respuesta perdida: misma credencial → misma sala, un solo host, la credencial
del cliente sirve; ninguna respuesta trae token · 29b ninguna firma previa
responde · 30 unirse anónimo con respuesta perdida: misma credencial → un solo
participante, también después de que la sala empezó; otra credencial con el
mismo nombre es otra persona · 31 seis reintentos concurrentes de la misma
credencial → una sala / un participante, y todas las respuestas llevan a la
misma credencial válida · 31b respuestas concurrentes procesadas en orden
inverso: el cliente termina con una credencial válida · 32 una credencial
distinta sigue respetando una sola sala activa · 33 una sala vencida por reloj y
no barrida (lobby o ventana de resultado) se vence al crear y la nueva nace;
repetir la credencial de una vencida devuelve esa sala con `estado: 'vencida'` ·
34 la recuperación va antes del kill switch: con `activas=false`, la misma
credencial recupera y una nueva es rechazada · 35 cuenta ya participante con
credencial nueva y respuesta perdida; la sala empieza; repetirla recupera la
misma participación.** (37 pruebas.)

# Etapa 2 — Preparación en Vercel

> **HECHA (rama `feat/salas`, 2026-09-19).** Los archivos reales son la
> referencia: `lib/sala/tipos.ts`, `lib/sala/preparacion-nucleo.ts`,
> `lib/sala/preparar-nucleo.ts` (orquestación con deps inyectadas; lotes: el
> primero del tamaño de la tanda, los siguientes `max(5, 2·faltan)` hasta 20),
> `lib/sala/preparar-ruta.ts` (handler HTTP puro), `lib/sala/preparar.ts`
> (cableado server-only con `supabaseAdmin`), `app/api/sala/preparar/route.ts`,
> `scripts/sala/medir-preparacion.mjs`. Diferencias respecto de lo escrito
> abajo: la ruta cablea un handler puro en vez de validar en línea; el resultado
> `ok` trae `consultadas` / `enriquecidas` / `descartadas` (candidatas
> enviadas, cards devueltas, descartadas) para la línea `[sala]`; el `detalle`
> interno de un 500 se queda en el log del servidor, acotado, y nunca en el
> body; la configuración de `next dev` local es `sala-local` en
> `.claude/launch.json`. **Tests: 25 en `lib/sala`** (9 + 10 + 6). Cierre
> aprobado por el dueño el 19/09 con auditoría de Codex; la Etapa 3 **no está
> autorizada todavía**. Medición y evidencia:
> `docs/medidas/2026-09-19-salas-etapa2.md` (líneas crudas en
> `docs/medidas/2026-09-19-salas-preparacion-crudo.txt`).

### Task 2.1: Tipos y selección pura

**Files:**
- Create: `lib/sala/tipos.ts`
- Create: `lib/sala/preparacion-nucleo.ts` (puro, sin `server-only`)
- Test: `lib/sala/preparacion-nucleo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Duracion = "cualquiera" | "corta" | "larga";
  export type Size = 5 | 10 | 20;
  export const SIZES: readonly Size[]; export const DURACIONES: readonly Duracion[];
  export const LIMITE_SEG: Record<Size, number>; // {5:120,10:180,20:300}
  export const CONFIG_DEFAULT = { size: 10, duracion: "cualquiera" } as const; // lo usa SÓLO la interfaz
  export interface Candidata { tmdb_id: number; runtime: number; razon: string; advertencia: string | null; year: number | null; genres: string[] }
  export interface CardSala { pos: number; tmdb_id: number; titulo: string; anio: number | null; runtime: number; poster: string | null; generos: string[]; platforms: PlatformCode[]; razon: string; advertencia: string | null }  // null = sin "Pero"
  export function elegirCards(candidatas: Candidata[], cards: Map<number, UITitle>, union: PlatformCode[], size: Size): { cards: CardSala[]; faltan: number };
  export function tamaniosAlcanzables(disponibles: number): Size[];  // [5,10,20].filter(s => s <= disponibles)
  ```
- `elegirCards` recorre `candidatas` **en su orden** (ya es el orden por semilla), toma las que tienen card y `card.platforms.some(p => union.includes(p))`, asigna `pos` 0..size-1 y corta en `size`. Documentar en el archivo: *"`card.platforms` sale de `cardsByIds` (`card:` 24 h, `pv3:` 8 h): la disponibilidad puede tener hasta 24 h de antigüedad."*

- [ ] **Step 1: Test que falla:**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirCards, tamaniosAlcanzables, LIMITE_SEG } from "./preparacion-nucleo.ts";
import type { UITitle } from "../types.ts";

const card = (id: number, platforms: string[]): UITitle => ({ id, type: "movie", title: "T" + id, year: 2001, runtime: null, poster: "p", country: null, genres: ["drama"], platforms: platforms as UITitle["platforms"], tmdb: null, hasEditorial: false });
const cand = (id: number) => ({ tmdb_id: id, runtime: 100, razon: "r", advertencia: "a", year: 2001, genres: ["Drama"] });

test("toma en orden las que siguen en la unión y corta en size", () => {
  const cards = new Map([[1, card(1, ["n"])], [2, card(2, ["mb"])], [3, card(3, ["d"])], [4, card(4, ["n"])]]);
  const r = elegirCards([cand(1), cand(2), cand(3), cand(4)], cards, ["n", "d"], 5);
  assert.deepEqual(r.cards.map((c) => c.tmdb_id), [1, 3, 4]);
  assert.deepEqual(r.cards.map((c) => c.pos), [0, 1, 2]);
  assert.equal(r.faltan, 2);
});
test("una candidata sin pero conserva advertencia null en la card (no se inventa texto)", () => {
  const c = { ...cand(7), advertencia: null };
  const r = elegirCards([c], new Map([[7, card(7, ["n"])]]), ["n"], 5);
  assert.equal(r.cards[0].advertencia, null);
  assert.equal(r.cards[0].razon, "r");
});
test("una candidata sin card se descarta", () => {
  const r = elegirCards([cand(1), cand(2)], new Map([[2, card(2, ["n"])]]), ["n"], 5);
  assert.deepEqual(r.cards.map((c) => c.tmdb_id), [2]);
});
test("tamaños alcanzables", () => {
  assert.deepEqual(tamaniosAlcanzables(4), []); assert.deepEqual(tamaniosAlcanzables(12), [5, 10]); assert.deepEqual(tamaniosAlcanzables(20), [5, 10, 20]);
});
test("límites globales", () => { assert.deepEqual(LIMITE_SEG, { 5: 120, 10: 180, 20: 300 }); });
```

- [ ] **Step 2:** `node --test lib/sala/preparacion-nucleo.test.ts` → FAIL.
- [ ] **Step 3: Implementar `lib/sala/tipos.ts` y `lib/sala/preparacion-nucleo.ts`** conforme a la interfaz (código directo; `elegirCards` con un `for` y `break` al llegar a `size`; `faltan = Math.max(0, size - cards.length)`).
- [ ] **Step 4:** Test → PASS. `npx tsc --noEmit`. Commit: `git commit -m "feat(salas): tipos y selección pura de cards"`.

### Task 2.2: Ruta `POST /api/sala/preparar`

**Files:**
- Create: `app/api/sala/preparar/route.ts`
- Create: `lib/sala/preparar.ts` (`server-only`)
- Modify: `lib/descartes-tmdb-inventario.test.ts` (INVENTARIO: filas para los `catch` de la ruta)
- Test: `lib/sala/preparar.test.ts` (con dobles inyectados)

**Interfaces:**
- `prepararRonda(deps, { roomId, hostUid, size, duracion }) → { ok: true; deadline_at: string } | { ok: false; motivo: "sin_quorum" | "estado" | "insuficientes" | "fallo"; alcanzables?: Size[] }`
- `deps = { rpc: (fn, args) => Promise<unknown>, cards: (pairs) => Promise<UITitle[]>, nombres: (codes) => string[], seed: () => string }`; en producción `rpc` = `supabaseAdmin().rpc`, `cards` = `cardsByIds`, `nombres` = `roulettePlatformNames`.
- Algoritmo: `sala_iniciar_preparacion` → `sala_candidatos(limit 80)` → `cardsByIds` en lotes de 20 hasta que `elegirCards` llene `size` o se agoten → si llena: `sala_publicar_ronda`; si no: `sala_abortar_preparacion` y `{ok:false, motivo:'insuficientes', alcanzables: tamaniosAlcanzables(validas)}`; cualquier excepción → abortar (idempotente) y `{ok:false, motivo:'fallo'}`.

- [ ] **Step 1: Test con dobles** (`lib/sala/preparar.test.ts`): tres casos — llena 5 con 8 candidatas de las que 2 no están en la unión; con 20 pedidas y 12 válidas devuelve `insuficientes` con `alcanzables [5,10]` y **llamó a `sala_abortar_preparacion`**; si `cards` lanza, aborta y devuelve `fallo`. Verificar además que `sala_publicar_ronda` recibió exactamente `size` cards con `pos` 0..size-1.
- [ ] **Step 2:** FAIL → implementar `lib/sala/preparar.ts` con la interfaz; enriquecer por lotes:

```ts
for (let i = 0; i < candidatas.length && elegido.cards.length < size; i += 20) {
  const lote = candidatas.slice(i, i + 20);
  const cards = await deps.cards(lote.map((c) => ({ tipo: "movie" as const, id: c.tmdb_id })));
  for (const c of cards) mapa.set(c.id, c);
  elegido = elegirCards(candidatas.slice(0, i + 20), mapa, union, size);
}
```

- [ ] **Step 3: Ruta:**

```ts
import { NextRequest, NextResponse } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { usuarioDeToken } from "@/lib/supabase";
import { tokenDeHeader } from "@/lib/admin-auth-nucleo";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cardsByIds } from "@/lib/enrich";
import { roulettePlatformNames } from "@/lib/roulette-providers";
import { conDescartesRegistrados } from "@/lib/fallos-tmdb";
import { withMetricas } from "@/lib/cache";
import { prepararRonda } from "@/lib/sala/preparar";
import { SIZES, DURACIONES } from "@/lib/sala/tipos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function manejar(req: NextRequest) {
  // Kill switch del SERVIDOR (`SALAS_ACTIVAS`, sin prefijo: no llega al
  // navegador). El del cliente es `NEXT_PUBLIC_SALAS_ACTIVAS` y sólo oculta la
  // entrada; los dos se aplican con el siguiente deployment. El que impide de
  // verdad crear salas o entrar sin deploy es `sala_config.activas` en la base.
  if (process.env.SALAS_ACTIVAS === "0") return NextResponse.json({ ok: false, motivo: "desactivado" }, { status: 503 });
  const uid = await usuarioDeToken(tokenDeHeader(req.headers.get("authorization")));
  if (!uid) return NextResponse.json({ ok: false, motivo: "sin_sesion" }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, motivo: "sin_servicio" }, { status: 503 });
  let cuerpo: { room_id?: unknown; size?: unknown; duracion?: unknown };
  try { cuerpo = await req.json(); } catch { return NextResponse.json({ ok: false, motivo: "cuerpo" }, { status: 400 }); }
  // Sin valores por defecto: cantidad o duración inválidas son 400. El default
  // (10, Cualquiera) vive en la interfaz, no acá.
  const size = SIZES.find((s) => s === cuerpo.size);
  const duracion = DURACIONES.find((d) => d === cuerpo.duracion);
  if (!size) return NextResponse.json({ ok: false, motivo: "size_invalido", permitidos: SIZES }, { status: 400 });
  if (!duracion) return NextResponse.json({ ok: false, motivo: "duracion_invalida", permitidas: DURACIONES }, { status: 400 });
  if (typeof cuerpo.room_id !== "string" || !/^[0-9a-f-]{36}$/.test(cuerpo.room_id)) return NextResponse.json({ ok: false, motivo: "room_id_invalido" }, { status: 400 });
  const t0 = Date.now();
  const { res, metricas } = await withMetricas(() => conDescartesRegistrados("api/sala/preparar", () => prepararRonda({
    rpc: async (fn, args) => { const { data, error } = await admin.rpc(fn, args); if (error) throw new Error(`${fn}: ${error.message}`); return data; },
    cards: cardsByIds, nombres: roulettePlatformNames, seed: () => cuerpo.room_id!,
  }, { roomId: cuerpo.room_id, hostUid: uid, size, duracion })));
  console.log(`[sala] preparar ${size}/${duracion} ${res.ok ? "publicada" : res.motivo} | tmdb ${metricas.tmdb.llamadas} | redis ${metricas.redis.comandos} | supabase ${metricas.supabase.consultas} | ${Date.now() - t0}ms`);
  return NextResponse.json(res, { status: res.ok ? 200 : 409 });
}
export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
```

(El `p_seed` de `sala_candidatos` es el `room_id`; la semilla de desempate es `rooms.seed`, distinta y no expuesta.)

- [ ] **Step 3b: Test de validación de la ruta** (`lib/sala/preparar-ruta.test.ts`, sobre un `manejarConDeps` exportado desde `lib/sala/preparar-ruta.ts` que recibe `{ usuarioDeToken, admin, preparar }` inyectados, y la ruta sólo lo cablea): sin Bearer → 401; `size: 7` → 400 `size_invalido`; `duracion: "chicos"` → 400 `duracion_invalida`; `size` ausente → 400 (no se rellena con 10); `room_id` no uuid → 400; con `SALAS_ACTIVAS="0"` → 503 antes de validar la sesión.

- [ ] **Step 4:** `npm test` → el inventario de `catch` falla por el `catch` del JSON: agregar en `INVENTARIO` la fila `{ archivo: "app/api/sala/preparar/route.ts", ancla: "catch { return NextResponse.json({ ok: false, motivo: \"cuerpo\" }", clase: "no-tmdb", motivo: "JSON del cliente" }` y, si `prepararRonda` tiene `catch` propios, quedan fuera del barrido (`lib/sala/` no se recorre) pero igual pasan por `conDescartesRegistrados`.
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit` → limpios. Commit: `git commit -m "feat(salas): ruta de preparación con service_role y métricas [sala]"`.

### Task 2.3: Medición fría y caliente

**Files:** Create `scripts/sala/medir-preparacion.mjs`

- [ ] **Step 0:** `node scripts/sala/db-local.mjs --catalogo-real` (autorizado el 2026-09-18: carga `data/carga-ruleta-*.sql` **sólo en la base local**; Producción no se toca).
- [ ] **Step 1:** Script que, contra `next dev` con `.env.sala-local` **y `TMDB_READ_TOKEN` real**, crea una sala con 2 participantes (RPC) con plataformas `n,d,m`, llama a `/api/sala/preparar` para `size` 5, 10 y 20 en `cualquiera`, y lee del stdout del servidor la línea `[sala]`. Corrida A (frío): sin `UPSTASH_*` en el env (caché en memoria) y proceso recién levantado; corrida B (caliente): repetir inmediatamente con otra sala y las mismas plataformas, mismo proceso. Alternar A/B/A/B por tamaño (MANTENIMIENTO "alternar, nunca contra una foto vieja") y no correr nada más contra TMDB mientras tanto.
- [ ] **Step 2:** Registrar en `docs/medidas/2026-09-XX-salas-preparacion.md`: por tamaño y estado, `tmdb / redis / supabase / ms`, con las dos corridas alternadas (MANTENIMIENTO "alternar, nunca contra una foto vieja") y sin otra carga sobre TMDB.
- [x] **Step 3: Go a Etapa 3:** 20 cards caliente ≤ 2 s, **máximo de tres mediciones frías independientes ≤ 6 s** (criterio corregido por el dueño el 19/09: antes decía "frío ≤ 6 s p95 (3 corridas)", y tres observaciones no son un p95). Si no, bajar el default a 10 queda como decisión del dueño con el número a la vista.
  **Resultado (19/09, código final):** tres frías INDEPENDIENTES de 20 (proceso reiniciado y caché vacía antes de cada una) → **2952 / 2856 / 2046 ms de servidor, máximo 2952 ms**; caliente 0,31–0,65 s. Máximo 2952 ms ≤ 6 s: dentro del umbral; el default 10 no cambia. Los descartes por TMDB en local son los fixtures (404), sesgo pesimista. Evidencia: `docs/medidas/2026-09-19-salas-etapa2.md`.

---

# Etapa 3 — Cliente: lobby y votación

> **HECHA (rama `feat/salas`, 2026-09-19), pendiente de aprobación del dueño.**
> Cuatro commits, uno por tarea: `75e51cc` (3.1), `31db791` (3.2), `25f0cb9`
> (3.3), `a2440d2` (3.4). Los archivos reales son la referencia:
> `lib/sala/{estado,token-store,mensajes,entrada,votacion-nucleo}.ts`,
> `hooks/{temporizador-card,sala-relectura-nucleo,useSala,useVenceEn}.ts`,
> `components/sala/*`, `app/sala/nueva`, `app/sala/[id]`. **60 tests nuevos**
> (36 + la ronda de tres bloqueantes del dueño en `7580a1b` + la segunda ronda de
> cuatro casos de integración en `e8a46fd`: match temprano, lector sin efectos
> descartados, intento ≠ confirmada, error visual por intento).
> Desvíos declarados: selector desde `PLATFORMS` (no `/api/providers`);
> resultado PROVISORIO hasta la Etapa 4; enlace + Copiar en el lobby (compartir
> es la Etapa 5); `claveCard` se llama `claveInicioCard`; `app/sala/[id]`
> todavía no está en `APP_FUERA` (Tarea 6.1). Evidencia y verificación manual:
> `docs/medidas/2026-09-19-salas-etapa3.md`.
### Task 3.1: Contratos del estado, token local, temporizador

**Files:**
- Create: `lib/sala/estado.ts` (tipo `EstadoSala` = forma del JSON de `sala_estado`, con `esTerminal(e)`, `venceEnSeg(e, ahora)`)
- Create: `lib/sala/token-store.ts` — la credencial ES el token: `nuevaCredencial()` = 32 bytes de `crypto.getRandomValues` en base64url (43 chars); `credencialParaCrear()` devuelve la persistida en `yump:sala:credencial:crear` o genera y persiste una **antes** de la primera solicitud; `confirmarSala(roomId)` la mueve a `yump:sala:<roomId>`; `credencialParaUnirse(roomId)` devuelve la de `yump:sala:<roomId>` o genera y persiste; `leerToken(roomId)` / `borrarToken(roomId)`. Ninguna respuesta del servidor escribe la credencial: sólo confirma. try/catch alrededor de `localStorage`. Tests: reintento devuelve la misma credencial; confirmar mueve la clave; respuestas aplicadas en orden inverso no cambian nada.
- Create: `hooks/temporizador-card.ts` (máquina pura + persistencia inyectable): `arrancar(store, clave, ahoraMs) → { arrancoEn }` lee `store.get(clave)` y, si no hay nada, guarda `ahoraMs`; `restante(arrancoEn, ahoraMs)` en s (10 − transcurridos, mínimo 0); `vencio(arrancoEn, ahoraMs)` a los 10.000 ms; `cerrar(store, clave)` borra la entrada. `clave = \`yump:sala:${room}:${round}:${pos}:inicio\``. **Recargar la página no reinicia los 10 s**: el comienzo persiste en `localStorage` por sala, ronda y posición y **se borra sólo cuando el servidor confirmó el avance** (`sala_votar` aceptado, o `sala_estado` con `mi_siguiente_pos > pos`). Un fallo de red conserva el comienzo, vencido o no: al volver, si ya venció, se reintenta el `pass` de inmediato. El plazo global sigue siendo el del servidor: esto sólo evita que el contador local se regale con F5.
- Tests: `lib/sala/estado.test.ts`, `lib/sala/token-store.test.ts` (con un `localStorage` doble), `hooks/temporizador-card.test.ts` (casos: arranque nuevo guarda; segundo `arrancar` con la misma clave conserva el comienzo original y `restante` sigue bajando; `cerrar` borra y un `arrancar` posterior arranca de cero; `vencio` exacto a 10.000 ms; store que lanza → se comporta como sin persistencia)

- [x] **Step 1:** Tests que fallan → implementación mínima → PASS → commit `feat(salas): contratos de estado, token local y temporizador`.

### Task 3.2: `useSala` — Realtime + relectura acotada

**Files:**
- Create: `hooks/sala-relectura-nucleo.ts` (puro: `programar(ultimaMs, ahoraMs) → { enMs }` con ventana 1500 ms, trailing; testeable)
- Create: `hooks/useSala.ts`
- Test: `hooks/sala-relectura-nucleo.test.ts`

**Interfaces:**
- `useSala(roomId, token) → { estado: EstadoSala | null; cargando; error; releer(); canal: "conectado" | "desconectado" }`
- Comportamiento: (1) `sala_estado` al montar; (2) canal `supabaseBrowser().channel(\`sala:${roomId}\`, { config: { private: false } }).on("broadcast", { event: "cambio" }, () => programarRelectura())`; (3) **nunca publica**; (4) `visibilitychange` → releer; `online` → releer; (5) mientras el canal no esté `SUBSCRIBED`, `setInterval` de 5 s; al quedar `SUBSCRIBED` se limpia; (6) timers locales: releer 1 s después de `deadline_at`, `lobby_expires_at` y `expires_at`; (7) en estado terminal vencido/inexistente: `channel.unsubscribe()` y `borrarToken`; (8) `useEffect` cleanup: unsubscribe.

- [x] **Step 1:** Test del núcleo: dos señales a 100 ms → una relectura a los 1500 ms; una señal aislada 3 s después → inmediata.
- [x] **Step 2:** Implementar hook. Commit `feat(salas): useSala con Broadcast público, relectura acotada y respaldo`.

### Task 3.3: Páginas y componentes de lobby

**Files:**
- Create: `app/sala/nueva/page.tsx` → `components/sala/CrearSala.tsx` (requiere `useAuth().user`; nombre precargado con `profile.display_name`; plataformas precargadas desde `usePlatforms().platforms` en **estado local** — nunca `set()` del contexto; botón "Crear" → `rpc sala_crear` con el cliente `supabaseBrowser()` (ya lleva la sesión) → `guardarToken` → `router.replace(/sala/<id>)`)
- Create: `app/sala/[id]/page.tsx` → `components/sala/SalaView.tsx` (lee token; sin token: si `user` → intenta `sala_reclamar`; si falla → `UnirseForm`; con token → `useSala`)
- Create: `components/sala/UnirseForm.tsx`, `components/sala/SelectorPlataformasSala.tsx` (reusa `ProviderCard`; lista desde `/api/providers` mapeada con `codeForTmdbId`, orden `platformOrder`), `components/sala/Lobby.tsx` (participantes, contador de lobby, `ConfigTanda` sólo para host, botón "Empezar" habilitado con `n ≥ 2`, mensaje de `insuficientes` con los tamaños alcanzables)
- Create: `components/sala/ConfigTanda.tsx` (segmentos 5/10/20 y Cualquiera/Corta/Larga; default 10 + Cualquiera)
- Modify: `components/CatalogView.tsx` (entrada "Crear sala" debajo de `RuletaBanner`, sólo `!ES_NATIVO`; sin sesión lleva a `/cuenta`), `components/UserHub.tsx` (tile "Crear sala" en `hub-tiles`, sólo `!ES_NATIVO`)
- Modify: `app/globals.css` (`.sala-*`)

- [x] **Step 1:** Implementar; el "Empezar" hace `fetch(apiUrl("/api/sala/preparar"), { method: "POST", headers: { Authorization: \`Bearer ${session.access_token}\` }, body })` con el patrón de `TeVaAGustar.tsx:89-100`.
- [x] **Step 2:** Verificación en navegador (dos ventanas, una incógnito) con `next dev` + `.env.sala-local`: crear, unirse, ver nombres en ambas sin recargar (señal + relectura), lobby vence a los 15 min (probar con `update rooms set lobby_expires_at = now()` vía admin → ambas ventanas muestran "La sala venció").
- [x] **Step 3:** Commit `feat(salas): crear sala, unirse y lobby`.

### Task 3.4: Votación

**Files:**
- Create: `components/sala/Votacion.tsx`, `components/sala/CardSala.tsx`, `components/sala/BotonesVoto.tsx`, `components/sala/ProgresoRonda.tsx`
- Modify: `app/globals.css`

**Detalle de `CardSala`:** póster (`.rlt-poster` sin `Link`), título, `runtime` formateado `Xh Ym`, `generos.map(genreLabel)`, `PlatformLogo` por cada `platforms` (destacando las de la unión), "Por qué verla" (`.rlt-razon`) y "Pero" (`.rlt-pero`) **sólo si `advertencia` tiene contenido** (`advertencia && advertencia.trim()`): sin "pero" la sección no se renderiza, sin texto de reemplazo ni espacio reservado. **Sin** enlace a la ficha.
**`BotonesVoto`:** tres `<button type="button" className="act sala-act" aria-label="No|Paso|Sí">` con **sólo el ícono** (sin `.lab` visible; el texto va únicamente en `aria-label`): cruz = `M18 6L6 18M6 6l12 12`; salto = `M5 4l10 8-10 8V4zM19 5v14`; corazón = `M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z`. Mismo trazo `1.8` y `viewBox 0 0 24 24` que `.act svg`; el corazón se rellena con `var(--accent)` en `:active`. CSS: `.sala-act { min-width: 64px; min-height: 64px; border-radius: 999px; border: 1px solid var(--line-2) } .sala-act svg { width: 30px; height: 30px } .sala-act:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }`. Mientras hay un `sala_votar` en vuelo los tres llevan el atributo real **`disabled`** (es lo único que impide pulsaciones nuevas; `aria-disabled` puede acompañarlo pero no lo reemplaza) y `.sala-act:disabled { opacity: .5; cursor: default }`.
**Contador:** `temporizador-card` con `setInterval` de 250 ms y **persistencia por sala/ronda/pos** (Tarea 3.1): al montar la card se llama `arrancar(localStorage, clave, Date.now())`, que reusa el comienzo guardado si existe. **`cerrar` se llama únicamente cuando el servidor confirmó el avance**: cuando `sala_votar` devolvió `ok: true` (incluido `idempotente`), o devolvió `motivo: "ya_votado"` / `"fuera_de_orden"` con `siguiente > pos`, o cuando un `sala_estado` posterior trae `mi_siguiente_pos > pos`. Si la solicitud falla (red, 5xx, timeout) el comienzo persistido **se conserva**, aunque ya esté vencido: al recargar, `vencio` es verdadero y se reintenta el `pass` de inmediato en vez de regalar otros 10 s. Si al montar `vencio` ya es verdadero, se registra `pass` sin mostrar la card. Al montar con `mi_siguiente_pos` del estado se retoma desde ahí y se limpian las claves de posiciones anteriores a ésa. Tras el último voto: pantalla "Listo, esperando a los demás (k de N)". Al llegar `estado ≠ votando` → `Resultado*`.

- [x] **Step 1:** Implementar. Verificar con dos navegadores: orden idéntico, `pass` automático a los 10 s, **recargar a los 6 s deja 4 s (no vuelve a 10)**, recarga tras votar retoma en la siguiente con 10 s, voto tardío tras deadline muestra resultado. **Con la red cortada (DevTools → Offline):** al votar, los tres botones quedan con `disabled` real (un segundo toque no dispara nada), la solicitud falla, el comienzo persistido sigue ahí; recargar sin red no reinicia los 10 s y, si venció, intenta el `pass` en cuanto vuelve la red. Con un lector de pantalla (TalkBack/VoiceOver) los tres botones se anuncian "No", "Paso", "Sí". **Una card con `advertencia` null (la fixture "Sin pero") no muestra la sección "Pero"** —ni título ni caja vacía— y la siguiente con advertencia sí la muestra.
- [x] **Step 2:** Commit `feat(salas): votación con tres botones, contador local y reanudación`.

---

# Etapa 4 — Resultados y animaciones

> **CONSTRUIDA (rama `feat/salas`, `cf60bc6`, 2026-09-20) y corregida tras la
> auditoría del dueño (`be5a4e3`, 21/09: celebración a pantalla completa,
> relectura tras éxito, Ver la ficha en el empate). Verificada en local a 375 px
> el 21/09 (empate, desempate, ganador, sin coincidencias, otra tanda);
> pendientes: reducir movimiento, dos teléfonos, pantalla del organizador.**
> Archivos:
> `components/sala/{ResultadoMatch,ResultadoEmpate,ResultadoSinCoincidencias,
> CompartirMatch,PrepararTanda}.tsx`, `sin-computo-cliente.test.ts`; `Wheel`
> acepta `TileRueda`. "Desempatar" y "Otra tanda" los habilita la base
> (`puede_desempatar` / `puede_otra_tanda`), sólo para el organizador.
> `CompartirMatch` reusa el mensaje de ficha: el texto del match es la Etapa 5.
> **Segunda y tercera ronda del dueño (22/09, `231c9be` + `38d5b64`):** nombre
> visible **Pelimatch** en las dos entradas (bajada provisoria, rutas sin
> cambios), botones de voto en barra fija sobre la nav con área táctil de 64 px,
> navegación en la MISMA pestaña, y reintentos acotados de la relectura tras
> Empezar/Desempatar —con el contrato de `sala-lector.leer()` corregido dos
> veces: primero porque se tragaba el error, después porque una lectura
> descartada por la compuerta contaba como éxito aunque la que había ganado
> hubiera fallado (cuarta ronda, `22aec59`)—.
> Evidencia y lista de verificación pendiente:
> `docs/medidas/2026-09-20-salas-etapa4.md`.
### Task 4.1: Pantallas de resultado

**Files:**
- Create: `components/sala/ResultadoMatch.tsx` (pantalla completa; dos mitades de corazón que se juntan con `@keyframes sala-mitad-izq/der`; "¡HAY MATCH!"; póster, título, `PlatformLogo` de las plataformas; `CompartirMatch`; para el host "Cerrar sala" —ver el cambio de la Tarea 4.2—)
- Create: `components/sala/ResultadoEmpate.tsx` (las cards empatadas entran y forman una ruleta con `@keyframes sala-entra`; "¡Tenemos empate!"; host: "Desempatar" → `rpc sala_desempatar` → la animación de ruleta **se detiene en `ganador_pos` ya guardado**; demás: "Esperando al organizador"; contador de la ventana de 5 min)
- Create: `components/sala/ResultadoSinCoincidencias.tsx` (cards que se separan suavemente; "Esta vez no coincidieron"; sin corazón roto; host: "Otra tanda")
- Create: `components/sala/CompartirMatch.tsx`
- Modify: `app/globals.css` — todas las animaciones dentro de `@media (prefers-reduced-motion: no-preference)`; con `reduce`, estado final sin transición.

El **texto** de resultado en grupos también es "¡Nuestro match!" (en la pantalla y al compartir), aunque el ganador tenga 2 votos.

- [x] **Step 1:** Implementar consumiendo **sólo** `estado.resultado` de la RPC. Prohibido: cualquier conteo de votos en el cliente (test textual en `components/sala/sin-computo-cliente.test.ts` que falla si en `components/sala/*.tsx` aparece `filter(` sobre `votos` o `"yes"`).
- [ ] ⏳ **Step 2:** Verificar en dos teléfonos y con "Reducir movimiento" activado. Commit `feat(salas): resultados y animaciones`. (Verificado en local a 375 px el 21/09 —ver evidencia—; teléfonos reales y reducir movimiento siguen pendientes.)

### Task 4.1.b: el lobby avisa que ya se puede empezar (CAMBIO DEL DUEÑO, 23/09)

Probando, el organizador no se enteraba de que su invitado había entrado y leyó "Empezar" como el botón que da el enlace. 🔴 **No faltaba información**: la lista "Quiénes están (2 de 6)" ya existía y ya se actualizaba sola por Realtime. Lo que fallaba es **dónde estaba**: la lista arriba de todo y "Empezar" abajo del todo, con las plataformas, el enlace y la configuración en el medio; en un teléfono, mirando el botón la lista queda fuera de pantalla. Y el botón deshabilitado no decía por qué.

- [x] **Step 1:** La cuenta va **al botón**: el rótulo pasa a "Falta que se sume alguien" / "Empezar con N" y justo encima se repite el estado ("Están 2 de 6. Pueden seguir sumándose hasta que empieces."), con un aviso resaltado cuando alguien entra ("Se sumó Ana.", 6 s). `lib/sala/lobby-nucleo.ts`, puro y con pruebas.
- [x] **Step 2:** ⚠️ **NO se automatiza el arranque**, y se evaluó: la app sabe cuántos entraron pero no cuántos faltan, así que "cuando estén todos" no es un dato que tenga; un arranque a los 2 minutos empezaría la tanda —10 s por película— mientras el organizador sigue pegando el enlace en WhatsApp; y cerrar la sala a los 2 minutos pelearía con los 15 del lobby, que existen para invitar sin apuro. La única forma que no adivina sería preguntar cuántos van a ser al crear la sala: queda fuera del MVP.

### Task 4.1.c: la animación del match (CAMBIO DEL DUEÑO, 23/09)

La unión del corazón quedaba básica: **un solo movimiento de 900 ms** con la misma curva para las dos mitades, sin anticipación ni impacto, y después `sala-latido` repetido dos veces durante 2,2 s. `cubic-bezier(.2,.8,.2,1)` no puede rebotar (su tercer par es .2 y el cuarto 1: desacelera hasta el final y nunca lo pasa), y las mitades hacían `opacity 0 → 1` a lo largo de todo el viaje, así que se veía un corazón fantasma desde el frame 0.

- [x] **Step 1:** Coreografía en cinco tramos, **870 ms** en total, sólo `transform` y `opacity`: anticipación (0-42 ms), unión acelerando con `cubic-bezier(.55,0,.85,.35)` que se pasa 4% al chocar (42-300), asiento (300-420), pulso único 1 → 1.15 → 1 con `cubic-bezier(.34,1.56,.64,1)` (440-680) y destello + 8 chispas en `--accent` desde el centro (490-870). Los tiempos por tramo van DENTRO de cada keyframe (`animation-timing-function` por paso). La mitad derecha llega **30 ms** tarde: una milésima no existe a 60 fps (un frame son 16,7 ms) y 2 frames es el mínimo que se percibe.
- [x] **Step 2:** El auto-cierre del overlay baja de 3,3 s a **2,4 s**, y es un techo: ya se descartaba con un toque en cualquier parte, Escape, Enter o "Seguir". Confeti de la celebración de 90 a **60** (es lo más caro de la pantalla); el default del componente sigue en 70 porque lo comparte `DesempateResult`, que no se toca.
- [x] **Step 3:** `prefers-reduced-motion` **sin cambios** (decisión del dueño): la celebración sigue sin montarse y el destello y las chispas nacen en `opacity: 0`, así que no hay nada que apagar.
- [x] **Step 4:** `components/sala/celebracion-animacion.test.ts` (9 pruebas textuales): la secuencia, el desfasaje, el overshoot, que no se anime nada fuera de transform/opacity, que todo viva bajo la media query, que la coreografía entre en 600-900 ms y que los **dos** números del auto-cierre (TS y CSS) coincidan.

### Task 4.2: Otra tanda

- [x] **Step 1:** El host ve `ConfigTanda` + "Otra tanda" → mismo POST de la Tarea 3.3. Verificar: la ronda 2 no repite ningún `tmdb_id` de la 1 (prueba 18 del script), `expires_at` se reemplaza, participantes y plataformas se conservan; **no** disponible con empate sin resolver.
- [x] **Step 1.b (CAMBIO DEL DUEÑO, 23/09):** 🔴 **Con ganadora no hay "Otra tanda".** El plan la ofrecía en las tres pantallas de resultado; el dueño decidió que si el grupo ya tiene película —match directo, más votada del grupo o desempate resuelto— la sala se termina, y para otra ronda se arma una nueva. Queda **sólo** en "Esta vez no coincidieron". Lo decide la base: `puede_otra_tanda` suma `r.ganador_pos is null` (mira el ganador y no el tipo, porque `sala_desempatar` deja `resultado = 'empate'` y sólo llena `ganador_pos`). En su lugar, el host ve **"Cerrar sala"** ahí mismo: no puede tener dos salas activas y la del resultado sigue activa 5 minutos, así que sin ese botón no podría armar la siguiente hasta que venciera sola.
- [x] **Step 2:** Commit `feat(salas): otra tanda`.

---

# Etapa 5 — Compartir

> **HECHA (rama `feat/salas`, 2026-09-22): `a01e150` (5.1) y `81a287c` (5.2).**
> `mensajeMatch` con el texto del plan, `lib/compartir-accion.ts` (la acción
> extraída de DetailView, sin cambio de comportamiento, usada por la ficha y por
> Pelimatch) y `generateMetadata` + `revalidate = 21600` en la ficha. TTFB
> caliente: 32,4 → 38,5 ms de mediana (+6,1). 🔴 **La vista previa real de
> WhatsApp en iPhone/Android NO se probó** (Step 3: necesita Preview y
> dispositivos). Evidencia: `docs/medidas/2026-09-22-salas-etapa5.md`.
### Task 5.1: Mensaje y acción de compartir

**Files:**
- Modify: `lib/compartir.ts` — `mensajeMatch(t: { title: string; type: MediaType; id: number }, plataformas: string[]): MensajeCompartir` con texto exacto: `¡Nuestro match!\nDisponible en ${plataformas.join(", ")}\nVer ficha en Yump:` y `url = urlDeTitulo(t.type, t.id)`.
- Create: `lib/compartir-accion.ts` (`compartir(m: MensajeCompartir): Promise<void>`: en nativo `@capacitor/share` por import dinámico; si no, `navigator.share` si existe; si no, `window.open(enlaceWhatsapp(m), "_blank", "noopener")` — extraído de `components/DetailView.tsx:99-150`)
- Modify: `components/DetailView.tsx` para usar `compartir()` (sin cambio de comportamiento)
- Test: `lib/compartir.test.ts` (agregar caso de `mensajeMatch` con el texto exacto y que la URL sea `https://app.yump.ar/titulo/movie/<id>`)

- [x] **Step 1:** Test → FAIL → implementar → PASS → commit `feat(salas): mensaje de match y acción de compartir compartida con la ficha`.

### Task 5.2: `generateMetadata` de la ficha

**Files:**
- Modify: `app/titulo/[tipo]/[id]/page.tsx`
- Test: `lib/compartir.test.ts` (agregar: el archivo de la página exporta `generateMetadata` y `revalidate = 21600`)

- [x] **Step 1: Código:**

```tsx
import type { Metadata } from "next";
import { cardsByIds } from "@/lib/enrich";
import { SITIO_PUBLICO, urlDeTitulo } from "@/lib/compartir";
import { platformByCode } from "@/lib/providers-ar";

export const revalidate = 21600; // 6 h: misma escala que TTL.home; el póster y las plataformas no cambian más rápido.

export async function generateMetadata({ params }: { params: { tipo: string; id: string } }): Promise<Metadata> {
  const tipo = params.tipo === "tv" ? "tv" : "movie";
  const id = Number(params.id);
  const base: Metadata = { metadataBase: new URL(SITIO_PUBLICO), alternates: { canonical: urlDeTitulo(tipo, params.id) } };
  if (!Number.isInteger(id)) return base;
  const [card] = await cardsByIds([{ tipo, id }]).catch(() => []);
  if (!card) return base;
  const plataformas = card.platforms.map((c) => platformByCode(c)?.name).filter(Boolean).join(", ");
  const titulo = `${card.title}${card.year ? ` (${card.year})` : ""} · Yump`;
  const description = plataformas ? `Disponible en ${plataformas}. Ver en Yump.` : "Ver en Yump.";
  return {
    ...base, title: titulo, description,
    openGraph: { title: titulo, description, url: urlDeTitulo(tipo, params.id), type: "video.movie", images: card.poster ? [{ url: card.poster, width: 500, height: 750 }] : [] },
    twitter: { card: "summary_large_image", title: titulo, description, images: card.poster ? [card.poster] : [] },
  };
}
```

- [x] **Step 2:** Medir TTFB de `/titulo/movie/278` antes y después (`curl -o /dev/null -s -w "%{time_starttransfer}\n"` × 5, caliente). Anotar en `docs/medidas/…`.
- [ ] ⏳ PENDIENTE (necesita Preview y teléfonos; no se probó) **Step 3: Prueba real (Preview de Vercel, no Producción):** compartir un match desde iPhone y desde Android por WhatsApp; capturar la vista previa. **Sin esta prueba, no afirmar que el póster se ve.** Si WhatsApp no muestra imagen: revisar tamaño (`w500` ≈ 40-80 KB) y `og:image` absoluta; si sigue sin verse, queda documentado como limitación y se decide después si vale una imagen propia (fuera del MVP).
- [x] **Step 4:** Commit `feat(ficha): metadata Open Graph para la vista previa al compartir`.

---

# Etapa 6 — Mediciones, nativo, documentación y cierre

### Task 6.0: Mediciones de sala (Preview de Vercel + panel de Supabase, sin Producción)

**Files:** Create `docs/medidas/2026-09-XX-salas-realtime.md` (resultados; sin código).

- [ ] **Step 1: Mensajes Realtime por sala.** Panel → Reports → Realtime antes y después de correr una sala completa de 6 participantes y 10 películas (6 teléfonos/ventanas). Anotar el delta y compararlo con la fórmula `E × (N+1)` con `E ≈ 2N+3` (esperado ≈ 105 para N=6). Si el delta es mucho mayor, contar cuántas veces se llamó `sala_tocar` (log de la RPC) — cada `update rooms` con bump publica.
- [ ] **Step 2: Conexiones simultáneas.** Panel → Realtime → conexiones durante la misma sala (esperado 6, más las pestañas duplicadas que se abran a propósito: 2 pestañas del mismo participante = 2 conexiones).
- [ ] **Step 3: Tamaño real de una sala máxima** (SQL Editor, tras una sala de 6 × 20):

```sql
select relname, pg_total_relation_size(oid) from pg_class
where relname in ('rooms','room_participants','room_rounds','room_titles','room_votes');
select (select count(*) from rooms) salas, (select count(*) from room_votes) votos;
```

- [ ] **Step 4: Realtime desconectado.** En DevTools → Network bloquear `wss://*.supabase.co/realtime/*`; comprobar que `useSala` pasa a `canal: "desconectado"`, hace polling cada 5 s (contar RPCs en Network) y que al volver a primer plano relee. Al desbloquear, el polling se detiene al quedar `SUBSCRIBED`.
- [ ] **Step 5: Safari/iPhone suspendido.** Con una ronda de 5 (120 s): bloquear el teléfono 3 minutos, desbloquear → la vista debe mostrar el resultado calculado por el servidor (o "venció"), nunca seguir votando.
- [ ] **Step 6:** Registrar todo con fecha, dispositivo y navegador; marcar explícitamente lo que no se probó.

### Task 6.1: Exclusión del build nativo

**Files:** Modify `scripts/build-capacitor.mjs` (`APP_FUERA` += `"sala"`), y verificar que las dos entradas (`CatalogView`, `UserHub`) están detrás de `!ES_NATIVO`. Test: `scripts/rutas-nativas` no necesita cambios (no hay ruta nativa nueva). Correr `npm run build:capacitor` en modo diagnóstico y confirmar que `out-capacitor/` no contiene `sala/`.

### Task 6.2: Docs

- `docs/SALAS.md` (arquitectura, RPCs, estados, Realtime público + relectura acotada, **disponibilidad hasta 24 h de antigüedad**, retención 5 min, cron por minuto, qué queda fuera).
- `CLAUDE.md`: nota de arquitectura "Salas compartidas" (fuente curada, token portador, Broadcast público sólo señal, `service_role` sólo en la ruta de preparación, `SALAS_ACTIVAS=0`), tabla de rutas (`POST /api/sala/preparar`), estructura (`app/sala/`, `components/sala/`, `lib/sala/`, `hooks/useSala.ts`).
- `docs/ESTADO.md`: bloque canónico con lo comprobado en panel (Tarea 0.1), en local (RLS) y en dispositivo; lo pendiente (WhatsApp, medición en Producción).
- `docs/ISSUES.md`: issue nuevo si la Tarea 0.2 encontró nombres de plataforma sin mapear; issue "salas: sin serie histórica de `[sala]`" enlazado a #20.
- `docs/MANTENIMIENTO.md` §2: el refresco de disponibilidad ahora es `--solo-datos` para no tocar textos.

### Task 6.3: Cierre

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build` (con red), `git diff --check`.
- [ ] Batería RLS local en verde (Tarea 1.5), mediciones registradas (Tareas 2.3 y 5.2), pruebas en dos teléfonos (Tareas 3.x/4.x).
- [ ] Pedir auditoría de Codex sobre la rama. Merge/push/deploy y aplicación de `009_salas.sql` en Producción **sólo con autorización del dueño**, en este orden: (1) migración en Producción con `sala_config.activas = 'false'` (nace apagado), (2) verificar `cron.job` y que `select sala_activas()` como `postgres` devuelve `false`, (3) deploy con `SALAS_ACTIVAS` y `NEXT_PUBLIC_SALAS_ACTIVAS` sin definir, (4) encender con `update sala_config set valor = 'true' where clave = 'activas'` cuando el dueño lo decida.

---

## Rollback

Tres capas, de la más rápida a la más completa:

1. **Base, sin deploy (inmediato):** `update sala_config set valor = 'false' where clave = 'activas';` → `sala_crear` y `sala_unirse` rechazan con `sala_desactivadas`; las salas en curso terminan solas y el barrido las borra. Es el único apagado que actúa sobre lo que los teléfonos escriben directo en Supabase.
2. **Vercel (siguiente deployment):** `SALAS_ACTIVAS=0` → `/api/sala/preparar` responde 503 (ninguna sala nueva puede pasar de lobby); `NEXT_PUBLIC_SALAS_ACTIVAS=0` → la interfaz oculta "Crear sala". Son dos variables distintas porque la segunda se inlinea en el bundle del navegador y la primera no debe llegar ahí.
3. **Retirar todo:** `supabase/migrations/009_salas_down.sql` (a escribir en la Tarea 1.4): `cron.unschedule('sala-barrido')`, `drop function` de las **24** funciones del inventario, `drop table` de las seis tablas en orden inverso. No toca nada preexistente.

- Quitar `generateMetadata` no afecta datos.
- El refresco productivo del pool tiene su propio rollback (Apéndice A) y no forma parte de éste.

## Go / No-go

- **Go Etapa 1:** Tarea 0.1 completa (extensiones, **`realtime.send` presente**, acceso público de Realtime, variable en Vercel); Tarea 0.2 con `cualquiera ≥ 20` en `n,d,m`; Docker + `supabase start` funcionando.
- **Go Etapa 3:** Tarea 1.5 en verde (incluidas las pruebas 20–25 de concurrencia y permisos); Tarea 2.3 dentro de umbral.
- **Go merge:** Tarea 6.3 completa; WhatsApp probado en ambos sistemas (o aceptado sin póster por el dueño); consumo actual de Vercel/Supabase leído en panel con margen ≥ 50 %.
- **No-go:** pool < 5 en `n,d,m`; imposibilidad de correr la batería con anon key; **`realtime.send` ausente** → se detiene el plan y se rediseña la señal. Vercel **no** puede reemplazarla mientras los votos se escriban directo en Supabase: la ruta no se entera de los cambios de estado que producen las RPCs. Un rediseño tendría que mover las escrituras a Vercel o adoptar otra señal, y eso cambia la matriz de responsabilidades entera; se re-aprueba.

---

## Apéndice A — Refresco productivo de disponibilidad y metadata (FUERA de este plan)

Procedimiento separado, **no ejecutar como parte de la implementación de salas**. Requiere una autorización propia del dueño el día que se decida correrlo. No amplía el pool ni toca textos editoriales.

1. **Backup** desde el panel: Table Editor → `roulette_titles` → Export CSV; ídem `title_availability`. Guardar fuera del repo.
2. `node --env-file=.env.local scripts/build-roulette-pool.mjs --min-nota 6.0 --pages 8` (MANTENIMIENTO §2; **no** correr `generate-copy.mjs`).
3. `node scripts/build-roulette-sql.mjs --solo-datos` (Tarea 0.3; el SQL emitido no menciona `razon`, `advertencia` ni `atencion`).
4. Pegar `data/carga-ruleta-1.sql … -N.sql` en orden en el SQL Editor.
5. **Verificación:** repetir las consultas 1 y 2 de la Tarea 0.2. `con_textos` **no puede bajar**; `max(checked_at)` es de hoy. Repetir la consulta 4 y diffear contra `lib/roulette-providers.ts` (MANTENIMIENTO §5).
6. `node scripts/preview-escenarios.mjs --corte 90` como control (los tres escenarios de la ruleta siguen con catálogo).
7. **Rollback:** restaurar las dos tablas desde los CSV del paso 1.
