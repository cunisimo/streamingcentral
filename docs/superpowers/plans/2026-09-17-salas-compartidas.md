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

- [ ] **Step 1: El archivo ya existe en la rama** (`scripts/sala/auditoria-pool.sql`, commits `b3a3246`, `b264a16` y la corrección del 2026-09-18 que hace opcional la `advertencia`). Es la referencia: cinco consultas con los filtros exactos de `sala_candidatos` — `media_type = 'movie'`, `razon is not null`, `runtime > 0`, `not apto_chicos`, `not requiere_contexto`, disponibilidad en AR — **sin exigir `advertencia`**. La consulta 1 informa `total_movie, con_razon, con_razon_y_pero, con_razon_y_duracion, servibles_sala, cortas, largas`; la 2, antigüedad de `title_availability` con umbrales de 24 h / 7 d / 30 d (la RPC no filtra por `checked_at`); la 3, servibles por unión de plataformas con la columna `sin_pero` (admitidas sin "Pero"); la 4, nombres de plataforma; la 5, el peso de cada filtro, donde `con_razon_sin_pero` son títulos **admitidos**, no descartados.

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

### Task 1.1: Tablas, cierre de acceso, tocar/publicar

**Files:**
- Create: `supabase/migrations/009_salas.sql` (se completa en 1.1–1.6; una sola migración)
- Test: `lib/salas-migracion.test.ts` (Create; guards textuales sobre la migración)

**Interfaces:**
- Produces: tablas `rooms`, `room_participants`, `room_rounds`, `room_titles`, `room_votes`, `sala_config`; funciones internas `sala_tocar(uuid)`, `sala_codigos_permitidos()`, `sala_activas()`.

**Inventario de funciones y exposición** (es el contrato que el test de abajo hace cumplir; toda función nueva tiene que entrar acá o el test falla):

| Función | Exposición |
|---|---|
| `sala_codigos_permitidos`, `sala_activas`, `sala_hash`, `sala_nuevo_token`, `sala_plataformas_validas`, `sala_nombre_valido`, `sala_participante`, `sala_limite_seg`, `sala_tocar`, `rooms_publicar_cambio`, `sala_computar`, `sala_aplicar_vencimientos`, `sala_barrido` | **interna**: `revoke … from public, anon, authenticated`, sin `grant` |
| `sala_unirse`, `sala_estado`, `sala_votar` | **participante**: `grant … to anon, authenticated` |
| `sala_crear`, `sala_reclamar`, `sala_desempatar`, `sala_cerrar` | **organizador/cuenta**: `grant … to authenticated` |
| `sala_iniciar_preparacion`, `sala_candidatos`, `sala_publicar_ronda`, `sala_abortar_preparacion` | **servidor**: `grant … to service_role` |

- [ ] **Step 1: Test textual que falla** (`lib/salas-migracion.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ALL_CODES } from "./providers-ar.ts";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/009_salas.sql"), "utf8");

// El inventario: quién puede ejecutar qué. Cualquier `create function` que no
// esté acá hace fallar el test; cualquier fila sin su revoke/grant, también.
const EXPOSICION: Record<string, "interna" | "participante" | "cuenta" | "servidor"> = {
  sala_codigos_permitidos: "interna", sala_activas: "interna", sala_hash: "interna", sala_nuevo_token: "interna",
  sala_plataformas_validas: "interna", sala_nombre_valido: "interna", sala_participante: "interna",
  sala_limite_seg: "interna", sala_tocar: "interna", rooms_publicar_cambio: "interna",
  sala_computar: "interna", sala_aplicar_vencimientos: "interna", sala_barrido: "interna",
  sala_unirse: "participante", sala_estado: "participante", sala_votar: "participante",
  sala_crear: "cuenta", sala_reclamar: "cuenta", sala_desempatar: "cuenta", sala_cerrar: "cuenta",
  sala_iniciar_preparacion: "servidor", sala_candidatos: "servidor", sala_publicar_ronda: "servidor", sala_abortar_preparacion: "servidor",
};
const GRANT: Record<string, string | null> = { interna: null, participante: "anon, authenticated", cuenta: "authenticated", servidor: "service_role" };

function funcionesDeclaradas(): string[] {
  return [...sql.matchAll(/create or replace function\s+(\w+)\s*\(/g)].map((m) => m[1]);
}

test("cada función declarada está en el inventario, y cada fila del inventario existe", () => {
  const declaradas = funcionesDeclaradas().sort();
  assert.deepEqual(declaradas, Object.keys(EXPOSICION).sort());
});

test("toda función revoca EXECUTE a public, anon y authenticated; sólo las expuestas tienen grant", () => {
  for (const [fn, clase] of Object.entries(EXPOSICION)) {
    assert.match(sql, new RegExp(`revoke execute on function ${fn}\\([^)]*\\) from public, anon, authenticated;`), `${fn}: falta el revoke`);
    const grants = [...sql.matchAll(new RegExp(`grant execute on function ${fn}\\([^)]*\\) to ([^;]+);`, "g"))].map((m) => m[1].trim());
    if (GRANT[clase] === null) assert.deepEqual(grants, [], `${fn}: es interna y tiene grant`);
    else assert.deepEqual(grants, [GRANT[clase]], `${fn}: grant incorrecto`);
  }
});

test("las seis tablas tienen RLS y sin privilegios para anon/authenticated", () => {
  for (const t of ["rooms", "room_participants", "room_rounds", "room_titles", "room_votes", "sala_config"]) {
    assert.match(sql, new RegExp(`alter table ${t} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on ${t} from anon, authenticated`));
    assert.doesNotMatch(sql, new RegExp(`create policy [^\\n]* on ${t}\\b`), `${t} no debe tener policies`);
  }
});

test("la lista de códigos permitidos en SQL es exactamente ALL_CODES", () => {
  const m = sql.match(/sala_codigos_permitidos\(\)[\s\S]*?array\[([^\]]+)\]/);
  assert.ok(m, "falta sala_codigos_permitidos");
  const codigos = m[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();
  assert.deepEqual(codigos, [...ALL_CODES].sort());
});

test("ninguna RPC acepta participant_id como parámetro", () => {
  assert.doesNotMatch(sql, /p_participant/i);
});

test("toda security definer pinea el search_path", () => {
  const defs = sql.match(/security definer[\s\S]*?set search_path = public, extensions, pg_temp/g) ?? [];
  const total = (sql.match(/security definer/g) ?? []).length;
  assert.equal(defs.length, total);
});

test("orden de bloqueo: ninguna función bloquea room_rounds antes que rooms", () => {
  // Por cuerpo de función: si hay un `from room_rounds … for update`, tiene que
  // haber antes un `from rooms … for update` en el MISMO cuerpo, o el cuerpo
  // tiene que declarar que su llamador ya bloqueó la sala.
  const cuerpos = sql.split(/create or replace function/).slice(1);
  for (const c of cuerpos) {
    const nombre = c.match(/^\s*(\w+)/)![1];
    const ronda = c.search(/from room_rounds[^;]*for update/);
    if (ronda < 0) continue;
    const sala = c.search(/from rooms[^;]*for update/);
    const declara = /-- llamador: sala bloqueada/.test(c);
    assert.ok(declara || (sala >= 0 && sala < ronda), `${nombre}: bloquea la ronda antes que la sala`);
  }
});
```

- [ ] **Step 2:** `node --test lib/salas-migracion.test.ts` → FAIL (archivo no existe).
- [ ] **Step 3: Escribir el comienzo de `009_salas.sql`:**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Salas compartidas (MVP). Ver docs/SALAS.md.
--
-- Cinco tablas CERRADAS: RLS activo sin policies y sin privilegios para
-- anon/authenticated. Toda operación pasa por las RPCs de abajo (security
-- definer, search_path pineado). El participante se identifica por un token
-- portador del que la base guarda sólo el sha256; el organizador, por su JWT.
-- Requiere pgcrypto (gen_random_bytes, digest) y realtime.send.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists rooms (
  id               uuid primary key default gen_random_uuid(),
  host_user_id     uuid not null references auth.users (id) on delete cascade,
  estado           text not null default 'lobby'
                   check (estado in ('lobby','preparando','votando','empate','resultado','vencida')),
  estado_previo    text,
  seed             text not null,
  version          bigint not null default 0,
  lobby_expires_at timestamptz not null,
  expires_at       timestamptz not null,
  platforms_frozen text[],
  round_actual     uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists rooms_expires_idx on rooms (expires_at);
create index if not exists rooms_host_activa_idx on rooms (host_user_id) where estado <> 'vencida';

create table if not exists room_participants (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references rooms (id) on delete cascade,
  token_hash   bytea not null unique,
  user_id      uuid references auth.users (id) on delete set null,
  nombre       text not null check (char_length(nombre) between 1 and 24),
  platforms    text[] not null check (cardinality(platforms) between 1 and 14),
  es_host      boolean not null default false,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists room_participants_un_usuario on room_participants (room_id, user_id) where user_id is not null;
create unique index if not exists room_participants_un_host on room_participants (room_id) where es_host;
create index if not exists room_participants_room_idx on room_participants (room_id);

create table if not exists room_rounds (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms (id) on delete cascade,
  numero      int not null,
  estado      text not null default 'preparando' check (estado in ('preparando','votando','cerrada')),
  size        int not null check (size in (5,10,20)),
  duracion    text not null check (duracion in ('cualquiera','corta','larga')),
  limite_seg  int not null,
  prep_token  uuid not null default gen_random_uuid(),
  started_at  timestamptz,
  deadline_at timestamptz,
  closed_at   timestamptz,
  resultado   text check (resultado in ('match','ganador','empate','sin_coincidencias','vencida')),
  ganador_pos int,
  empatadas   int[],
  desempatado_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (room_id, numero)
);
create index if not exists room_rounds_room_estado_idx on room_rounds (room_id, estado);

create table if not exists room_titles (
  round_id    uuid not null references room_rounds (id) on delete cascade,
  pos         int not null check (pos >= 0),
  tmdb_id     int not null,
  titulo      text not null,
  anio        int,
  runtime     int not null check (runtime > 0),
  poster      text,
  generos     text[] not null default '{}',
  platforms   text[] not null default '{}',
  razon       text not null,
  advertencia text,             -- NULL = sin "Pero"; la card no muestra la sección
  primary key (round_id, pos),
  unique (round_id, tmdb_id)
);

create table if not exists room_votes (
  round_id       uuid not null,
  participant_id uuid not null references room_participants (id) on delete cascade,
  pos            int not null,
  voto           text not null check (voto in ('yes','no','pass')),
  at             timestamptz not null default now(),
  primary key (round_id, participant_id, pos),
  foreign key (round_id, pos) references room_titles (round_id, pos) on delete cascade
);
create index if not exists room_votes_round_pos_idx on room_votes (round_id, pos) where voto = 'yes';

-- Kill switch EN LA BASE: `activas = 'false'` impide crear salas y unirse sin
-- deploy (las variables de Vercel se aplican recién con el siguiente
-- deployment). Se cambia con SQL desde el panel. Tabla cerrada como las demás.
create table if not exists sala_config (
  clave text primary key,
  valor text not null
);
-- Nace APAGADO: en Producción se enciende a mano después del deploy (Tarea 6.3).
-- En local, scripts/sala/fixtures-local.sql lo pone en 'true'.
insert into sala_config (clave, valor) values ('activas', 'false') on conflict (clave) do nothing;

-- Cierre total: sin policies, sin privilegios directos.
alter table rooms enable row level security;
alter table room_participants enable row level security;
alter table room_rounds enable row level security;
alter table room_titles enable row level security;
alter table room_votes enable row level security;
alter table sala_config enable row level security;
revoke all on rooms from anon, authenticated;
revoke all on room_participants from anon, authenticated;
revoke all on room_rounds from anon, authenticated;
revoke all on room_titles from anon, authenticated;
revoke all on room_votes from anon, authenticated;
revoke all on sala_config from anon, authenticated;

-- ⚠️ Postgres concede EXECUTE a PUBLIC en toda función nueva. Por eso CADA
-- función de este archivo lleva su `revoke … from public, anon, authenticated`
-- inmediatamente después de crearse, y sólo las de cara al cliente reciben un
-- `grant` explícito. lib/salas-migracion.test.ts inventaría las dos cosas.

-- Códigos de plataforma permitidos. TIENE que coincidir con ALL_CODES de
-- lib/providers-ar.ts: lib/salas-migracion.test.ts lo compara textualmente.
create or replace function sala_codigos_permitidos() returns text[]
language sql immutable as $$
  select array['n','d','m','at','p','cr','pp','mb','un','mv','cv','vx','dg','ok']
$$;
revoke execute on function sala_codigos_permitidos() from public, anon, authenticated;

create or replace function sala_activas() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce((select valor = 'true' from sala_config where clave = 'activas'), false)
$$;
revoke execute on function sala_activas() from public, anon, authenticated;

-- Bump de versión + señal. Cualquier cambio visible pasa por acá.
create or replace function sala_tocar(p_room uuid) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  update rooms set version = version + 1, updated_at = now() where id = p_room;
$$;
revoke execute on function sala_tocar(uuid) from public, anon, authenticated;

create or replace function rooms_publicar_cambio() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.version <> old.version then
    -- Señal mínima y pública: sólo la versión. Sin nombres, votos ni resultado.
    perform realtime.send(jsonb_build_object('v', new.version), 'cambio', 'sala:' || new.id::text, false);
  end if;
  return new;
end;
$$;
revoke execute on function rooms_publicar_cambio() from public, anon, authenticated;
drop trigger if exists rooms_publicar_cambio on rooms;
create trigger rooms_publicar_cambio after update on rooms
  for each row execute function rooms_publicar_cambio();
```

- [ ] **Step 4:** correr el test → los cuatro pasan cuando estén las RPCs (los dos últimos ya pasan; los de tablas también). Commit parcial: `git commit -m "feat(salas): tablas cerradas, versión y señal de cambio"`.

### Task 1.2: Helpers internos (token, plataformas, nombre, vencimientos, cómputo)

**Files:** Modify `supabase/migrations/009_salas.sql` (append)

**Interfaces:**
- Produces: `sala_hash(text) bytea`, `sala_nuevo_token() text`, `sala_plataformas_validas(text[]) text[]`, `sala_nombre_valido(text) text`, `sala_participante(uuid, text) room_participants` (lanza `sala_token_invalido`), `sala_limite_seg(int) int`, `sala_computar(uuid)`, `sala_aplicar_vencimientos(uuid)`.

- [ ] **Step 1: Append:**

```sql
create or replace function sala_hash(p_token text) returns bytea
language sql immutable set search_path = public, extensions, pg_temp as $$
  select extensions.digest(p_token, 'sha256')
$$;
revoke execute on function sala_hash(text) from public, anon, authenticated;

-- 32 bytes aleatorios en base64url (43 caracteres). Se devuelve UNA vez.
create or replace function sala_nuevo_token() returns text
language sql volatile set search_path = public, extensions, pg_temp as $$
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_')
$$;
revoke execute on function sala_nuevo_token() from public, anon, authenticated;

-- Deduplica y ordena, pero RECHAZA el array entero si trae un código
-- desconocido: ["n","zz","d"] no se convierte en silencio en ["n","d"].
create or replace function sala_plataformas_validas(p text[]) returns text[]
language plpgsql immutable set search_path = public, extensions, pg_temp as $$
declare v text[]; desconocidos text[];
begin
  if p is null or cardinality(p) < 1 then raise exception 'sala_sin_plataformas' using errcode = '22023'; end if;
  if cardinality(p) > 14 then raise exception 'sala_demasiadas_plataformas' using errcode = '22023'; end if;
  select array_agg(c) into desconocidos from unnest(p) c where c is null or not (c = any (sala_codigos_permitidos()));
  if desconocidos is not null then raise exception 'sala_plataforma_desconocida: %', array_to_string(desconocidos, ',') using errcode = '22023'; end if;
  select array_agg(distinct c order by c) into v from unnest(p) c;
  return v;
end;
$$;
revoke execute on function sala_plataformas_validas(text[]) from public, anon, authenticated;

-- Normaliza y valida el nombre en el servidor: sin controles, espacios
-- colapsados, 1..24 caracteres.
create or replace function sala_nombre_valido(p text) returns text
language plpgsql immutable set search_path = public, extensions, pg_temp as $$
declare v text;
begin
  v := btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[\x00-\x1F\x7F]', '', 'g'), '\s+', ' ', 'g'));
  if char_length(v) < 1 or char_length(v) > 24 then raise exception 'sala_nombre_invalido' using errcode = '22023'; end if;
  return v;
end;
$$;
revoke execute on function sala_nombre_valido(text) from public, anon, authenticated;

-- El participante detrás de un token, EN ESA sala. El id siempre sale de acá.
create or replace function sala_participante(p_room uuid, p_token text) returns room_participants
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare p room_participants;
begin
  select * into p from room_participants where room_id = p_room and token_hash = sala_hash(p_token);
  if not found then raise exception 'sala_token_invalido' using errcode = '28000'; end if;
  return p;
end;
$$;
revoke execute on function sala_participante(uuid, text) from public, anon, authenticated;

create or replace function sala_limite_seg(p_size int) returns int
language sql immutable as $$
  select case p_size when 5 then 120 when 10 then 180 when 20 then 300 end
$$;
revoke execute on function sala_limite_seg(int) from public, anon, authenticated;

-- Cómputo AUTORITATIVO del resultado de una ronda. N = participantes de la sala.
-- ORDEN DE BLOQUEO: la llama sala_votar o sala_aplicar_vencimientos, que ya
-- tienen bloqueada la fila de rooms; acá se bloquea la ronda DESPUÉS. La marca
-- `-- llamador: sala bloqueada` DENTRO del cuerpo es lo que lee el test de orden.
create or replace function sala_computar(p_round uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r room_rounds; n int; maximo int; ganadores int[];
begin
  -- llamador: sala bloqueada
  select * into r from room_rounds where id = p_round for update;
  if r.estado <> 'votando' then return; end if;
  select count(*) into n from room_participants where room_id = r.room_id;

  with c as (
    select pos, count(*) as sies from room_votes where round_id = p_round and voto = 'yes' group by pos
  )
  select coalesce(max(sies), 0), coalesce(array_agg(pos order by pos) filter (where sies = (select max(sies) from c)), '{}')
  into maximo, ganadores from c;

  if maximo < 2 then
    update room_rounds set estado = 'cerrada', closed_at = now(), resultado = 'sin_coincidencias' where id = p_round;
    update rooms set estado = 'resultado', expires_at = now() + interval '5 minutes' where id = r.room_id;
  elsif cardinality(ganadores) = 1 then
    update room_rounds set estado = 'cerrada', closed_at = now(),
      resultado = case when n = 2 then 'match' else 'ganador' end, ganador_pos = ganadores[1] where id = p_round;
    update rooms set estado = 'resultado', expires_at = now() + interval '5 minutes' where id = r.room_id;
  else
    update room_rounds set estado = 'cerrada', closed_at = now(), resultado = 'empate', empatadas = ganadores where id = p_round;
    update rooms set estado = 'empate', expires_at = now() + interval '5 minutes' where id = r.room_id;
  end if;
  perform sala_tocar(r.room_id);
end;
$$;
revoke execute on function sala_computar(uuid) from public, anon, authenticated;

-- Vencimientos por reloj de la base, aplicados de forma perezosa por
-- sala_estado y por el barrido. Idempotente. Bloquea la fila de la sala
-- PRIMERO; la ronda, si hace falta, después (sala_computar).
create or replace function sala_aplicar_vencimientos(p_room uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms; r room_rounds;
begin
  select * into s from rooms where id = p_room for update;
  if not found then return; end if;

  if s.estado = 'lobby' and now() > s.lobby_expires_at then
    update rooms set estado = 'vencida', expires_at = least(expires_at, now() + interval '5 minutes') where id = p_room;
    perform sala_tocar(p_room); return;
  end if;

  if s.estado = 'preparando' then
    select * into r from room_rounds where room_id = p_room and estado = 'preparando' order by numero desc limit 1;
    if found and r.created_at < now() - interval '90 seconds' then
      delete from room_rounds where id = r.id;
      -- Misma regla que sala_abortar_preparacion: al volver al lobby se renueva
      -- también lobby_expires_at por 5 min, acotado.
      update rooms set estado = coalesce(estado_previo, 'lobby'), estado_previo = null,
        round_actual = (select id from room_rounds where room_id = p_room order by numero desc limit 1),
        expires_at = greatest(expires_at, now() + interval '5 minutes'),
        lobby_expires_at = case when coalesce(estado_previo, 'lobby') = 'lobby'
                                then greatest(lobby_expires_at, now() + interval '5 minutes') else lobby_expires_at end
      where id = p_room;
      perform sala_tocar(p_room);
    end if;
    -- Una sala en `preparando` NUNCA se marca vencida ni se borra desde acá.
    return;
  end if;

  if s.estado = 'votando' then
    select * into r from room_rounds where id = s.round_actual;
    if found and r.estado = 'votando' and now() > r.deadline_at then perform sala_computar(r.id); end if;
    return;
  end if;

  if s.estado in ('empate', 'resultado') and now() > s.expires_at then
    update rooms set estado = 'vencida' where id = p_room;
    update room_rounds set resultado = 'vencida' where id = s.round_actual and resultado = 'empate';
    perform sala_tocar(p_room);
  end if;
end;
$$;
revoke execute on function sala_aplicar_vencimientos(uuid) from public, anon, authenticated;
```

- [ ] **Step 2:** `node --test lib/salas-migracion.test.ts` → el inventario todavía falla (faltan las RPCs de 1.3/1.4); los tests de revoke de las internas ya pasan. Commit: `git commit -m "feat(salas): helpers de token, validación, cómputo y vencimientos"`.

### Task 1.3: RPCs de participante (crear, unirse, reclamar, estado, votar)

**Files:** Modify `supabase/migrations/009_salas.sql` (append)

**Interfaces:**
- Produces (contratos que consume el cliente):
  - `sala_crear(p_nombre text, p_platforms text[]) → jsonb {room_id, token}` — `authenticated`.
  - `sala_unirse(p_room uuid, p_nombre text, p_platforms text[]) → jsonb {token}` — `anon, authenticated`.
  - `sala_reclamar(p_room uuid) → jsonb {token}` — `authenticated`.
  - `sala_estado(p_room uuid, p_token text) → jsonb` (forma en `lib/sala/tipos.ts`, Tarea 3.1) — `anon, authenticated`.
  - `sala_votar(p_room uuid, p_token text, p_round uuid, p_pos int, p_voto text) → jsonb {ok, motivo?, termine, estado}` — `anon, authenticated`.

- [ ] **Step 1: Append:**

```sql
create or replace function sala_crear(p_nombre text, p_platforms text[]) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); rid uuid; tok text; activas int;
begin
  if uid is null then raise exception 'sala_sin_sesion' using errcode = '28000'; end if;
  if not sala_activas() then raise exception 'sala_desactivadas' using errcode = '55000'; end if;
  -- Serializa la creación POR USUARIO hasta el fin de la transacción: dos
  -- llamadas concurrentes de la misma cuenta se ejecutan una detrás de otra y
  -- la segunda ve la sala que insertó la primera. Sin esto, count + insert
  -- es una carrera y las dos pasan.
  perform pg_advisory_xact_lock(hashtext('sala_crear:' || uid::text));
  select count(*) into activas from rooms where host_user_id = uid and estado <> 'vencida' and expires_at > now();
  if activas >= 1 then raise exception 'sala_ya_tiene_activa' using errcode = '23505'; end if;
  insert into rooms (host_user_id, seed, lobby_expires_at, expires_at)
  values (uid, encode(extensions.gen_random_bytes(16), 'hex'), now() + interval '15 minutes', now() + interval '20 minutes')
  returning id into rid;
  tok := sala_nuevo_token();
  insert into room_participants (room_id, token_hash, user_id, nombre, platforms, es_host)
  values (rid, sala_hash(tok), uid, sala_nombre_valido(p_nombre), sala_plataformas_validas(p_platforms), true);
  perform sala_tocar(rid);
  return jsonb_build_object('room_id', rid, 'token', tok);
end;
$$;
revoke execute on function sala_crear(text, text[]) from public, anon, authenticated;
grant execute on function sala_crear(text, text[]) to authenticated;

create or replace function sala_unirse(p_room uuid, p_nombre text, p_platforms text[]) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms; uid uuid := auth.uid(); tok text; n int; existente room_participants;
begin
  if not sala_activas() then raise exception 'sala_desactivadas' using errcode = '55000'; end if;
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room for update;
  if not found then raise exception 'sala_inexistente' using errcode = 'P0002'; end if;
  if s.estado <> 'lobby' then raise exception 'sala_no_admite_ingresos' using errcode = '55000'; end if;
  tok := sala_nuevo_token();
  -- Una cuenta autenticada no ocupa dos lugares: rota su token.
  if uid is not null then
    select * into existente from room_participants where room_id = p_room and user_id = uid;
    if found then
      update room_participants set token_hash = sala_hash(tok), last_seen_at = now() where id = existente.id;
      return jsonb_build_object('token', tok);
    end if;
  end if;
  select count(*) into n from room_participants where room_id = p_room;
  if n >= 6 then raise exception 'sala_llena' using errcode = '54000'; end if;
  insert into room_participants (room_id, token_hash, user_id, nombre, platforms)
  values (p_room, sala_hash(tok), uid, sala_nombre_valido(p_nombre), sala_plataformas_validas(p_platforms));
  perform sala_tocar(p_room);
  return jsonb_build_object('token', tok);
end;
$$;
revoke execute on function sala_unirse(uuid, text, text[]) from public, anon, authenticated;
grant execute on function sala_unirse(uuid, text, text[]) to anon, authenticated;

-- Recuperar la participación (organizador u invitado con cuenta) desde otro
-- navegador: rota el token. El anterior deja de servir.
create or replace function sala_reclamar(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); p room_participants; tok text;
begin
  if uid is null then raise exception 'sala_sin_sesion' using errcode = '28000'; end if;
  select * into p from room_participants where room_id = p_room and user_id = uid;
  if not found then raise exception 'sala_no_participa' using errcode = 'P0002'; end if;
  tok := sala_nuevo_token();
  update room_participants set token_hash = sala_hash(tok), last_seen_at = now() where id = p.id;
  return jsonb_build_object('token', tok);
end;
$$;
revoke execute on function sala_reclamar(uuid) from public, anon, authenticated;
grant execute on function sala_reclamar(uuid) to authenticated;

-- Lo que ESTE participante puede ver. Aplica vencimientos antes de leer.
create or replace function sala_estado(p_room uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  s rooms; yo room_participants; r room_rounds; n int; k int; mi_sig int; res jsonb;
begin
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room;
  if not found then return jsonb_build_object('estado', 'inexistente'); end if;
  yo := sala_participante(p_room, p_token);
  update room_participants set last_seen_at = now() where id = yo.id;
  select count(*) into n from room_participants where room_id = p_room;

  res := jsonb_build_object(
    'estado', s.estado, 'version', s.version, 'ahora', now(), 'expires_at', s.expires_at,
    'lobby_expires_at', s.lobby_expires_at,
    'soy', jsonb_build_object('id', yo.id, 'nombre', yo.nombre, 'platforms', to_jsonb(yo.platforms), 'es_host', yo.es_host),
    'participantes', (
      select coalesce(jsonb_agg(jsonb_build_object('nombre', p.nombre, 'es_host', p.es_host, 'soy', p.id = yo.id) order by p.joined_at), '[]')
      from room_participants p where p.room_id = p_room),
    'union', to_jsonb(coalesce(s.platforms_frozen, (select array_agg(distinct c) from room_participants p, unnest(p.platforms) c where p.room_id = p_room))),
    'n', n, 'config_default', jsonb_build_object('size', 10, 'duracion', 'cualquiera')
  );

  if s.round_actual is not null then
    select * into r from room_rounds where id = s.round_actual;
    select count(*) into k from room_participants p where p.room_id = p_room
      and (select count(*) from room_votes v where v.round_id = r.id and v.participant_id = p.id) >= r.size;
    select count(*) into mi_sig from room_votes v where v.round_id = r.id and v.participant_id = yo.id;

    res := res || jsonb_build_object('ronda', jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'size', r.size, 'duracion', r.duracion, 'limite_seg', r.limite_seg,
      'estado', r.estado, 'started_at', r.started_at, 'deadline_at', r.deadline_at,
      'terminaron', k, 'mi_siguiente_pos', mi_sig,
      'mis_votos', (select coalesce(jsonb_object_agg(v.pos, v.voto), '{}') from room_votes v where v.round_id = r.id and v.participant_id = yo.id),
      'titulos', case when r.estado in ('votando','cerrada') then (
        select coalesce(jsonb_agg(jsonb_build_object('pos', t.pos, 'tmdb_id', t.tmdb_id, 'titulo', t.titulo, 'anio', t.anio,
          'runtime', t.runtime, 'poster', t.poster, 'generos', to_jsonb(t.generos), 'platforms', to_jsonb(t.platforms),
          'razon', t.razon, 'advertencia', t.advertencia) order by t.pos), '[]')
        from room_titles t where t.round_id = r.id) else '[]'::jsonb end
    ));

    if r.estado = 'cerrada' then
      res := res || jsonb_build_object('resultado', jsonb_build_object(
        'tipo', r.resultado, 'ganador_pos', r.ganador_pos, 'empatadas', to_jsonb(r.empatadas),
        'desempatado', r.desempatado_at is not null,
        'puede_desempatar', yo.es_host and s.estado = 'empate',
        'puede_otra_tanda', yo.es_host and s.estado = 'resultado'
      ));
    end if;
  end if;
  return res;
end;
$$;
revoke execute on function sala_estado(uuid, text) from public, anon, authenticated;
grant execute on function sala_estado(uuid, text) to anon, authenticated;

create or replace function sala_votar(p_room uuid, p_token text, p_round uuid, p_pos int, p_voto text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  s rooms; yo room_participants; r room_rounds; n int; mios int; previo text; otro int; terminaron int;
begin
  if p_voto not in ('yes','no','pass') then raise exception 'sala_voto_invalido' using errcode = '22023'; end if;
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room for update;        -- serializa por sala
  if not found then return jsonb_build_object('ok', false, 'motivo', 'inexistente'); end if;
  yo := sala_participante(p_room, p_token);                       -- el id sale del token, nunca del cuerpo
  select * into r from room_rounds where id = p_round and room_id = p_room;
  if not found or r.estado <> 'votando' or s.round_actual is distinct from r.id or now() > r.deadline_at then
    return jsonb_build_object('ok', false, 'motivo', 'ronda_cerrada', 'estado', s.estado);
  end if;

  select count(*) into mios from room_votes where round_id = r.id and participant_id = yo.id;
  if p_pos < mios then
    select voto into previo from room_votes where round_id = r.id and participant_id = yo.id and pos = p_pos;
    if previo = p_voto then return jsonb_build_object('ok', true, 'idempotente', true, 'termine', mios >= r.size, 'estado', s.estado); end if;
    return jsonb_build_object('ok', false, 'motivo', 'ya_votado', 'siguiente', mios);
  end if;
  if p_pos > mios or p_pos >= r.size then return jsonb_build_object('ok', false, 'motivo', 'fuera_de_orden', 'siguiente', mios); end if;

  insert into room_votes (round_id, participant_id, pos, voto) values (r.id, yo.id, p_pos, p_voto);
  mios := mios + 1;
  select count(*) into n from room_participants where room_id = p_room;

  -- Dos personas: el primer segundo Sí confirmado en esta transacción es el match.
  if n = 2 and p_voto = 'yes' then
    select count(*) into otro from room_votes v where v.round_id = r.id and v.pos = p_pos and v.voto = 'yes' and v.participant_id <> yo.id;
    if otro = 1 then
      update room_rounds set estado = 'cerrada', closed_at = now(), resultado = 'match', ganador_pos = p_pos where id = r.id;
      update rooms set estado = 'resultado', expires_at = now() + interval '5 minutes' where id = p_room;
      perform sala_tocar(p_room);
      return jsonb_build_object('ok', true, 'termine', true, 'estado', 'resultado');
    end if;
  end if;

  if mios >= r.size then
    perform sala_tocar(p_room);  -- "terminaron k de N" cambió
    select count(*) into terminaron from room_participants p where p.room_id = p_room
      and (select count(*) from room_votes v where v.round_id = r.id and v.participant_id = p.id) >= r.size;
    if terminaron >= n then perform sala_computar(r.id); end if;
  end if;
  return jsonb_build_object('ok', true, 'termine', mios >= r.size, 'estado', (select estado from rooms where id = p_room));
end;
$$;
revoke execute on function sala_votar(uuid, text, uuid, int, text) from public, anon, authenticated;
grant execute on function sala_votar(uuid, text, uuid, int, text) to anon, authenticated;
```

- [ ] **Step 2:** `node scripts/sala/db-local.mjs` (con 009 en la lista) → `✔ 009`. Si falla por `extensions.digest`, revisar que pgcrypto esté en `extensions` (Supabase local lo trae).
- [ ] **Step 3: Commit:** `git commit -m "feat(salas): RPCs de participante (crear, unirse, reclamar, estado, votar)"`.

### Task 1.4: RPCs del organizador y de preparación, barrido y cron

**Files:** Modify `supabase/migrations/009_salas.sql` (append)

**Interfaces:**
- `sala_desempatar(p_room uuid) → jsonb {ganador_pos}` — `authenticated` (host).
- `sala_cerrar(p_room uuid) → void` — `authenticated` (host).
- `sala_iniciar_preparacion(p_room uuid, p_host uuid, p_size int, p_duracion text) → jsonb {round_id, prep_token, union, excluir, numero}` — `service_role`.
- `sala_candidatos(p_providers text[], p_duracion text, p_excluir int[], p_seed text, p_limit int) → table(tmdb_id, runtime, razon, advertencia, year, genres)` — `service_role`.
- `sala_publicar_ronda(p_round uuid, p_prep_token uuid, p_titulos jsonb) → jsonb {ok, started_at, deadline_at}` — `service_role`.
- `sala_abortar_preparacion(p_round uuid, p_prep_token uuid) → void` — `service_role`.
- `sala_barrido() → jsonb {cerradas, abortadas, borradas}` — la llama `pg_cron`.

- [ ] **Step 1: Append:**

```sql
create or replace function sala_desempatar(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms; r room_rounds; g int;
begin
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room for update;
  if not found or s.host_user_id <> auth.uid() then raise exception 'sala_no_es_host' using errcode = '42501'; end if;
  select * into r from room_rounds where id = s.round_actual;
  if r.resultado <> 'empate' then raise exception 'sala_sin_empate' using errcode = '55000'; end if;
  if r.desempatado_at is not null then return jsonb_build_object('ganador_pos', r.ganador_pos); end if;  -- idempotente
  -- Determinístico por semilla de sala, sólo entre las empatadas, sin popularidad ni nota.
  select t.pos into g from room_titles t where t.round_id = r.id and t.pos = any (r.empatadas)
  order by md5(s.seed || t.tmdb_id::text) limit 1;
  update room_rounds set ganador_pos = g, desempatado_at = now() where id = r.id;
  update rooms set estado = 'resultado', expires_at = now() + interval '5 minutes' where id = p_room;
  perform sala_tocar(p_room);
  return jsonb_build_object('ganador_pos', g);
end;
$$;
revoke execute on function sala_desempatar(uuid) from public, anon, authenticated;
grant execute on function sala_desempatar(uuid) to authenticated;

create or replace function sala_cerrar(p_room uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms;
begin
  select * into s from rooms where id = p_room for update;
  if not found or s.host_user_id <> auth.uid() then raise exception 'sala_no_es_host' using errcode = '42501'; end if;
  if s.estado = 'preparando' then raise exception 'sala_preparando' using errcode = '55000'; end if;  -- primero termina o aborta la preparación
  -- Cerrar NO borra en el acto: la sala queda `vencida` y conserva los 5 min
  -- para que los participantes vean "el organizador cerró la sala".
  update rooms set estado = 'vencida', expires_at = now() + interval '5 minutes' where id = p_room;
  perform sala_tocar(p_room);
end;
$$;
revoke execute on function sala_cerrar(uuid) from public, anon, authenticated;
grant execute on function sala_cerrar(uuid) to authenticated;

-- ── Preparación: sólo service_role (la llama Vercel tras verificar el JWT) ──
create or replace function sala_iniciar_preparacion(p_room uuid, p_host uuid, p_size int, p_duracion text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms; n int; rid uuid; ptok uuid; num int; u text[];
begin
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room for update;
  if not found or s.host_user_id <> p_host then raise exception 'sala_no_es_host' using errcode = '42501'; end if;
  if s.estado not in ('lobby', 'resultado') then raise exception 'sala_estado_no_permite' using errcode = '55000'; end if;
  if p_size not in (5,10,20) or p_duracion not in ('cualquiera','corta','larga') then raise exception 'sala_config_invalida' using errcode = '22023'; end if;
  select count(*) into n from room_participants where room_id = p_room;
  if n < 2 then raise exception 'sala_sin_quorum' using errcode = '55000'; end if;
  u := coalesce(s.platforms_frozen, (select array_agg(distinct c order by c) from room_participants p, unnest(p.platforms) c where p.room_id = p_room));
  select coalesce(max(numero), 0) + 1 into num from room_rounds where room_id = p_room;
  insert into room_rounds (room_id, numero, size, duracion, limite_seg)
  values (p_room, num, p_size, p_duracion, sala_limite_seg(p_size)) returning id, prep_token into rid, ptok;
  -- "Otra tanda" cancela y reemplaza el vencimiento anterior: una sala en
  -- `preparando` nunca puede quedar con `expires_at` en el pasado.
  update rooms set estado = 'preparando', estado_previo = s.estado, platforms_frozen = u, round_actual = rid,
    expires_at = greatest(s.expires_at, now() + interval '5 minutes') where id = p_room;
  perform sala_tocar(p_room);
  return jsonb_build_object('round_id', rid, 'prep_token', ptok, 'numero', num, 'union', to_jsonb(u),
    'excluir', (select coalesce(jsonb_agg(distinct t.tmdb_id), '[]') from room_titles t join room_rounds rr on rr.id = t.round_id where rr.room_id = p_room));
end;
$$;
revoke execute on function sala_iniciar_preparacion(uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function sala_iniciar_preparacion(uuid, uuid, int, text) to service_role;

-- Candidatas del pool curado. Cualquiera = corta ∪ larga, estrictamente. Nunca
-- apto_chicos, nunca sin duración, nunca sin "por qué" (razon con texto real tras btrim). El "pero" (advertencia) es OPCIONAL: NULL, vacío o sólo espacios se sirven igual. Orden por
-- semilla de sala: sin popularidad ni nota.
create or replace function sala_candidatos(p_providers text[], p_duracion text, p_excluir int[], p_seed text, p_limit int)
returns table (tmdb_id int, runtime int, razon text, advertencia text, year int, genres text[])
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select rt.tmdb_id, rt.runtime, rt.razon, rt.advertencia, rt.year, rt.genres
  from roulette_titles rt
  join title_availability ta on ta.tmdb_id = rt.tmdb_id and ta.media_type = rt.media_type and ta.region = 'AR'
  where rt.media_type = 'movie'
    and nullif(btrim(rt.razon), '') is not null   -- razón con texto real: ni NULL, ni '', ni espacios
    and rt.runtime is not null and rt.runtime > 0
    and not rt.apto_chicos
    and not rt.requiere_contexto
    and ta.providers && p_providers
    and not (rt.tmdb_id = any (coalesce(p_excluir, '{}')))
    and case p_duracion when 'corta' then rt.runtime <= 90 when 'larga' then rt.runtime > 90 else true end
  order by md5(p_seed || rt.tmdb_id::text)
  limit least(greatest(coalesce(p_limit, 40), 1), 80)
$$;
revoke execute on function sala_candidatos(text[], text, int[], text, int) from public, anon, authenticated;
grant execute on function sala_candidatos(text[], text, int[], text, int) to service_role;

-- Publica la ronda de forma atómica: valida TODO el lote, inserta TODAS las
-- cards y recién ahí fija started_at/deadline_at. Si algo falla, no publica nada.
-- ORDEN DE BLOQUEO: la sala (leyendo primero el room_id de la ronda SIN
-- bloquear) y después la ronda.
create or replace function sala_publicar_ronda(p_round uuid, p_prep_token uuid, p_titulos jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r room_rounds; s rooms; rid uuid; cant int; t0 timestamptz := now(); permitidos text[] := sala_codigos_permitidos();
begin
  select room_id into rid from room_rounds where id = p_round;
  if rid is null then raise exception 'sala_prep_invalida' using errcode = '55000'; end if;
  select * into s from rooms where id = rid for update;
  select * into r from room_rounds where id = p_round for update;
  if not found or r.prep_token <> p_prep_token or r.estado <> 'preparando' or s.estado <> 'preparando' or s.round_actual is distinct from r.id then
    raise exception 'sala_prep_invalida' using errcode = '55000';
  end if;

  -- 1. Forma: un array con EXACTAMENTE size elementos.
  if jsonb_typeof(p_titulos) <> 'array' or jsonb_array_length(p_titulos) <> r.size then
    raise exception 'sala_tanda_incompleta' using errcode = '23514';
  end if;
  -- 2. Posiciones exactas 0..size-1, sin huecos ni repetidos.
  if (select array_agg((x->>'pos')::int order by (x->>'pos')::int) from jsonb_array_elements(p_titulos) x)
     is distinct from (select array_agg(g) from generate_series(0, r.size - 1) g) then
    raise exception 'sala_posiciones_invalidas' using errcode = '23514';
  end if;
  -- 3. Campos obligatorios, duración coherente con la ronda, plataformas válidas
  --    Y compatibles con la unión congelada de la sala, tmdb_id no repetido en
  --    rondas anteriores de esta sala.
  if exists (
    select 1 from jsonb_array_elements(p_titulos) x
    left join lateral (select coalesce(array(select jsonb_array_elements_text(x->'platforms')), '{}') as plats) pl on true
    where nullif(btrim(x->>'titulo'), '') is null
       or nullif(btrim(x->>'razon'), '') is null
       -- 'advertencia' puede venir NULL o vacía: es opcional y NO se rechaza.
       or (x->>'tmdb_id') !~ '^\d+$'
       or coalesce((x->>'runtime')::int, 0) <= 0
       or (r.duracion = 'corta' and (x->>'runtime')::int > 90)
       or (r.duracion = 'larga' and (x->>'runtime')::int <= 90)
       or cardinality(pl.plats) = 0
       or not (pl.plats <@ permitidos)
       or not (pl.plats && s.platforms_frozen)
       or exists (select 1 from room_titles t join room_rounds rr on rr.id = t.round_id
                  where rr.room_id = rid and rr.id <> r.id and t.tmdb_id = (x->>'tmdb_id')::int)
  ) then
    raise exception 'sala_card_invalida' using errcode = '23514';
  end if;

  insert into room_titles (round_id, pos, tmdb_id, titulo, anio, runtime, poster, generos, platforms, razon, advertencia)
  select p_round, (x->>'pos')::int, (x->>'tmdb_id')::int, btrim(x->>'titulo'), (x->>'anio')::int, (x->>'runtime')::int, x->>'poster',
         coalesce(array(select jsonb_array_elements_text(x->'generos')), '{}'),
         coalesce(array(select jsonb_array_elements_text(x->'platforms')), '{}'),
         x->>'razon', nullif(btrim(x->>'advertencia'), '')   -- vacía → NULL: sin "Pero"
  from jsonb_array_elements(p_titulos) x;
  select count(*) into cant from room_titles where round_id = p_round;
  if cant <> r.size then raise exception 'sala_tanda_incompleta' using errcode = '23514'; end if;

  update room_rounds set estado = 'votando', started_at = t0, deadline_at = t0 + make_interval(secs => r.limite_seg) where id = p_round;
  update rooms set estado = 'votando', estado_previo = null, expires_at = t0 + make_interval(secs => r.limite_seg) + interval '5 minutes' where id = rid;
  perform sala_tocar(rid);
  return jsonb_build_object('ok', true, 'started_at', t0, 'deadline_at', t0 + make_interval(secs => r.limite_seg));
end;
$$;
revoke execute on function sala_publicar_ronda(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function sala_publicar_ronda(uuid, uuid, jsonb) to service_role;

-- Idempotente. Mismo orden de bloqueo: sala y después ronda.
create or replace function sala_abortar_preparacion(p_round uuid, p_prep_token uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare r room_rounds; rid uuid;
begin
  select room_id into rid from room_rounds where id = p_round;
  if rid is null then return; end if;
  perform 1 from rooms where id = rid for update;
  select * into r from room_rounds where id = p_round for update;
  if not found or r.prep_token <> p_prep_token or r.estado <> 'preparando' then return; end if;
  delete from room_rounds where id = p_round;
  -- Vuelve al estado anterior con una ventana fresca de 5 min: el organizador
  -- tiene que poder leer el motivo y reintentar. round_actual apunta a la
  -- ronda cerrada anterior si la hubo (para seguir mostrando su resultado).
  -- Si vuelve al LOBBY, también se renueva `lobby_expires_at` por 5 min: si
  -- los 15 originales ya pasaron, la siguiente sala_estado la vencería en el
  -- acto y el reintentar que se promete no existiría.
  update rooms set estado = coalesce(estado_previo, 'lobby'), estado_previo = null,
    round_actual = (select id from room_rounds where room_id = rid order by numero desc limit 1),
    expires_at = greatest(expires_at, now() + interval '5 minutes'),
    lobby_expires_at = case when coalesce(estado_previo, 'lobby') = 'lobby'
                            then greatest(lobby_expires_at, now() + interval '5 minutes') else lobby_expires_at end
  where id = rid;
  perform sala_tocar(rid);
end;
$$;
revoke execute on function sala_abortar_preparacion(uuid, uuid) from public, anon, authenticated;
grant execute on function sala_abortar_preparacion(uuid, uuid) to service_role;

-- ── Barrido periódico, idempotente y autoritativo ──────────────────────────
create or replace function sala_barrido() returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare tocadas int := 0; borradas int; rid uuid;
begin
  for rid in select id from rooms where (estado = 'lobby' and now() > lobby_expires_at)
                                    or estado = 'preparando'
                                    or (estado = 'votando' and round_actual is not null)
                                    or (estado in ('empate','resultado') and now() > expires_at) loop
    perform sala_aplicar_vencimientos(rid); tocadas := tocadas + 1;
  end loop;
  -- El borrado físico es SÓLO para el estado terminal `vencida`. Todo lo demás
  -- llega a `vencida` por sala_aplicar_vencimientos (lobby vencido, ventana de
  -- resultado/empate agotada, cierre manual) y recién ahí, 5 min después, se
  -- borra. Una sala en `preparando` o `votando` jamás se borra por acá.
  delete from rooms where estado = 'vencida' and expires_at < now();
  get diagnostics borradas = row_count;
  return jsonb_build_object('revisadas', tocadas, 'borradas', borradas);
end;
$$;
revoke execute on function sala_barrido() from public, anon, authenticated;

-- Cron: cada minuto (pg_cron). Si el proyecto está en Postgres >= 15.1.1.61 se
-- puede bajar a '30 seconds'; no hace falta para una ventana de 5 minutos.
select cron.unschedule('sala-barrido') where exists (select 1 from cron.job where jobname = 'sala-barrido');
select cron.schedule('sala-barrido', '* * * * *', $$ select public.sala_barrido(); $$);
```

- [ ] **Step 2:** En `lib/salas-migracion.test.ts` agregar:

```ts
test("sala_candidatos excluye apto_chicos y exige duración y razón (no advertencia) en TODAS las duraciones", () => {
  const cuerpo = sql.match(/function sala_candidatos[\s\S]*?\$\$;/)![0];
  assert.match(cuerpo, /not rt\.apto_chicos/);
  assert.match(cuerpo, /rt\.runtime > 0/);
  assert.match(cuerpo, /nullif\(btrim\(rt\.razon\), ''\) is not null/, "la razón vale sólo con texto real");
  assert.doesNotMatch(cuerpo, /advertencia is not null/, "el pero es opcional: no puede filtrarse");
  assert.match(cuerpo, /order by md5\(p_seed/);
  assert.doesNotMatch(cuerpo, /popularity|vote_average/);
});
test("sólo service_role ejecuta la preparación", () => {
  for (const f of ["sala_iniciar_preparacion", "sala_candidatos", "sala_publicar_ronda", "sala_abortar_preparacion"]) {
    assert.match(sql, new RegExp(`grant execute on function ${f}\\([^)]*\\) to service_role`));
    assert.match(sql, new RegExp(`revoke execute on function ${f}\\([^)]*\\) from public, anon, authenticated`));
  }
});
```

- [ ] **Step 3:** `node --test lib/salas-migracion.test.ts` → PASS. `node scripts/sala/db-local.mjs` → `✔` en todos (en local `cron.schedule` puede fallar si `pg_cron` no está habilitada: `supabase start` la trae; si no, `create extension pg_cron;` sólo en local).
- [ ] **Step 4: Commit:** `git commit -m "feat(salas): RPCs de organizador y preparación, barrido y cron"`.

### Task 1.5: Batería de pruebas con la anon key local

**Files:**
- Create: `scripts/sala/pruebas-rls.mjs` (corre con `node --env-file=.env.sala-local scripts/sala/pruebas-rls.mjs`)

**Interfaces:**
- Consumes: URL/anon/service_role de `.env.sala-local`; usa `@supabase/supabase-js` ya instalado. Crea dos usuarios con `service_role` (`auth.admin.createUser`) para el host y para un invitado autenticado; borra todo al final.

- [ ] **Step 1: Escribir el script** (estructura: helpers `esperaError(fn, codigo)`, `crearUsuario(email)`, `clienteCon(jwt)`; cada prueba imprime `✔`/`✖` y el proceso termina con 1 si alguna falla):

```js
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL, SRV, { auth: { persistSession: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false } });
const como = (jwt) => createClient(URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
const fallos = [];
const prueba = async (nombre, fn) => { try { await fn(); console.log("✔", nombre); } catch (e) { fallos.push(nombre); console.log("✖", nombre, "\n   ", e.message); } };
const debeFallar = async (p, patron) => { const { error } = await p; assert.ok(error, "debía fallar"); if (patron) assert.match(error.message, patron); };

async function usuario(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Prueba-1234", email_confirm: true });
  if (error) throw error;
  const { data: s } = await anon().auth.signInWithPassword({ email, password: "Prueba-1234" });
  return { id: data.user.id, jwt: s.session.access_token };
}
const rpc = (c, fn, args) => c.rpc(fn, args).then(({ data, error }) => { if (error) throw new Error(error.message); return data; });

const host = await usuario(`host-${Date.now()}@sala.test`);
const inv = await usuario(`inv-${Date.now()}@sala.test`);
let sala, tokHost;

await prueba("1. lectura y escritura directa rechazadas", async () => {
  for (const t of ["rooms", "room_participants", "room_rounds", "room_titles", "room_votes"]) {
    await debeFallar(anon().from(t).select("*").limit(1), /permission denied|42501/);
    await debeFallar(como(host.jwt).from(t).select("*").limit(1), /permission denied|42501/);
  }
});
await prueba("2. crear sala exige sesión y devuelve token una vez", async () => {
  await debeFallar(anon().rpc("sala_crear", { p_nombre: "X", p_platforms: ["n"] }));
  await debeFallar(como(host.jwt).rpc("sala_crear", { p_nombre: "Facu", p_platforms: ["n", "zz", "d"] }), /sala_plataforma_desconocida/); // no se limpia en silencio
  await debeFallar(como(host.jwt).rpc("sala_crear", { p_nombre: "Facu", p_platforms: [] }), /sala_sin_plataformas/);
  const r = await rpc(como(host.jwt), "sala_crear", { p_nombre: "  Facu  ", p_platforms: ["n", "n", "d"] });
  sala = r.room_id; tokHost = r.token; assert.equal(tokHost.length, 43);
});
await prueba("3. una sola sala activa por organizador", async () => {
  await debeFallar(como(host.jwt).rpc("sala_crear", { p_nombre: "Otra", p_platforms: ["n"] }), /sala_ya_tiene_activa/);
});
await prueba("4. plataformas: dedup, lista permitida, nombre normalizado", async () => {
  const e = await rpc(anon(), "sala_estado", { p_room: sala, p_token: tokHost });
  assert.deepEqual(e.soy.platforms, ["d", "n"]); assert.equal(e.soy.nombre, "Facu");
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "A", p_platforms: ["zz"] }), /sala_plataforma_desconocida/);
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "A", p_platforms: ["n", "zz"] }), /sala_plataforma_desconocida/);
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "A", p_platforms: [] }), /sala_sin_plataformas/);
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "x".repeat(25), p_platforms: ["n"] }), /sala_nombre_invalido/);
});
let tokA, tokB, tokInv;
await prueba("5. unirse anónimo y autenticado; cuenta no ocupa dos lugares", async () => {
  tokA = (await rpc(anon(), "sala_unirse", { p_room: sala, p_nombre: "Ana", p_platforms: ["m"] })).token;
  tokInv = (await rpc(como(inv.jwt), "sala_unirse", { p_room: sala, p_nombre: "Inv", p_platforms: ["p"] })).token;
  const otra = (await rpc(como(inv.jwt), "sala_unirse", { p_room: sala, p_nombre: "Inv2", p_platforms: ["p"] })).token;
  assert.notEqual(otra, tokInv);
  await debeFallar(anon().rpc("sala_estado", { p_room: sala, p_token: tokInv }), /sala_token_invalido/); // rotado
  tokInv = otra;
  const e = await rpc(anon(), "sala_estado", { p_room: sala, p_token: tokHost });
  assert.equal(e.n, 3);
});
await prueba("6. token de otra sala no sirve", async () => {
  const r2 = await rpc(como(inv.jwt), "sala_crear", { p_nombre: "Inv", p_platforms: ["n"] });
  await debeFallar(anon().rpc("sala_estado", { p_room: r2.room_id, p_token: tokHost }), /sala_token_invalido/);
  await rpc(como(inv.jwt), "sala_cerrar", { p_room: r2.room_id });
});
const toksExtra = [];
await prueba("7. máximo seis participantes", async () => {
  for (const n of ["P4", "P5", "P6"]) toksExtra.push((await rpc(anon(), "sala_unirse", { p_room: sala, p_nombre: n, p_platforms: ["n"] })).token);
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "P7", p_platforms: ["n"] }), /sala_llena/);
  assert.equal((await rpc(anon(), "sala_estado", { p_room: sala, p_token: tokHost })).n, 6);
});
await prueba("8. invitado no ejecuta acciones del organizador", async () => {
  await debeFallar(como(inv.jwt).rpc("sala_desempatar", { p_room: sala }), /sala_no_es_host|sala_sin_empate/);
  await debeFallar(como(inv.jwt).rpc("sala_cerrar", { p_room: sala }), /sala_no_es_host/);
  await debeFallar(anon().rpc("sala_iniciar_preparacion", { p_room: sala, p_host: host.id, p_size: 5, p_duracion: "cualquiera" }), /permission denied|42501/);
});
// Preparación con service_role (lo que hace Vercel), con fixtures 90000001..
let ronda;
await prueba("9. publicar ronda atómica; tanda incompleta no publica", async () => {
  const ini = await rpc(admin, "sala_iniciar_preparacion", { p_room: sala, p_host: host.id, p_size: 5, p_duracion: "cualquiera" });
  const cand = await rpc(admin, "sala_candidatos", { p_providers: ["Netflix", "Disney Plus", "HBO Max", "Amazon Prime Video"], p_duracion: "cualquiera", p_excluir: [], p_seed: "s", p_limit: 80 });
  // Controles negativos de las fixtures: infantiles, sin duración, SIN RAZÓN, con contexto, serie, sin AR y la exclusiva de MUBI.
  assert.ok(cand.every((c) => c.runtime > 0 && c.razon && ![90000101, 90000102, 90000103, 90000104, 90000105, 90000106, 90000107, 90000108, 90000041].includes(c.tmdb_id)));
  // "Sin pero" (90000042) SÍ entra: la advertencia es opcional.
  assert.ok(cand.some((c) => c.tmdb_id === 90000042 && c.advertencia === null), "la película sin pero tiene que ser candidata");
  assert.equal(cand.length, 41);
  const card = (c, pos) => ({ pos, tmdb_id: c.tmdb_id, titulo: "T" + c.tmdb_id, anio: 2000, runtime: c.runtime, poster: null, generos: ["drama"], platforms: ["n"], razon: c.razon, advertencia: c.advertencia });
  const pub = (titulos) => admin.rpc("sala_publicar_ronda", { p_round: ini.round_id, p_prep_token: ini.prep_token, p_titulos: titulos });
  await debeFallar(pub(cand.slice(0, 4).map(card)), /sala_tanda_incompleta/);
  await debeFallar(pub(cand.slice(0, 5).map((c, i) => card(c, i === 4 ? 7 : i))), /sala_posiciones_invalidas/);
  await debeFallar(pub(cand.slice(0, 5).map((c, i) => ({ ...card(c, i), razon: i === 2 ? "" : c.razon }))), /sala_card_invalida/);  // sin razón no entra
  await debeFallar(pub(cand.slice(0, 5).map((c, i) => ({ ...card(c, i), platforms: i === 1 ? ["mb"] : ["n"] }))), /sala_card_invalida/);  // mb no está en la unión
  await debeFallar(pub(cand.slice(0, 5).map((c, i) => ({ ...card(c, i), platforms: i === 1 ? ["zz"] : ["n"] }))), /sala_card_invalida/);  // código no permitido
  // Publicación real: pos 0 es la card SIN "pero" (advertencia null) y pos 1 lleva advertencia "" → las dos se aceptan.
  const sinPero = cand.find((c) => c.tmdb_id === 90000042);
  const tanda = [sinPero, ...cand.filter((c) => c.tmdb_id !== 90000042).slice(0, 4)]
    .map(card).map((c, i) => ({ ...c, pos: i, advertencia: i === 1 ? "" : c.advertencia }));
  assert.equal(tanda[0].advertencia, null);
  const publicado = await rpc(admin, "sala_publicar_ronda", { p_round: ini.round_id, p_prep_token: ini.prep_token, p_titulos: tanda });
  assert.ok(publicado.ok); ronda = ini.round_id;
  const e = await rpc(anon(), "sala_estado", { p_room: sala, p_token: tokHost });
  assert.equal(e.estado, "votando"); assert.equal(e.ronda.titulos.length, 5);
  // La card sin pero viaja con advertencia NULL, y la vacía se normalizó a NULL.
  assert.equal(e.ronda.titulos[0].tmdb_id, 90000042); assert.equal(e.ronda.titulos[0].advertencia, null);
  assert.equal(e.ronda.titulos[1].advertencia, null);
  assert.ok(e.ronda.titulos.every((t) => typeof t.razon === "string" && t.razon.length > 0));
});
await prueba("10. lobby cerrado: no entran participantes nuevos", async () => {
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "Tarde", p_platforms: ["n"] }), /sala_no_admite_ingresos/);
});
await prueba("11. voto: sólo la siguiente pos; idempotente; título fuera de la ronda", async () => {
  const v = (tok, pos, voto) => rpc(anon(), "sala_votar", { p_room: sala, p_token: tok, p_round: ronda, p_pos: pos, p_voto: voto });
  assert.equal((await v(tokA, 1, "yes")).motivo, "fuera_de_orden");
  assert.ok((await v(tokA, 0, "no")).ok);
  assert.ok((await v(tokA, 0, "no")).idempotente);
  assert.equal((await v(tokA, 0, "yes")).motivo, "ya_votado");
  assert.equal((await v(tokA, 9, "yes")).motivo, "fuera_de_orden");
});
await prueba("12. nadie ve votos ajenos; el host no vota por otro", async () => {
  const e = await rpc(anon(), "sala_estado", { p_room: sala, p_token: tokHost });
  assert.deepEqual(e.ronda.mis_votos, {});
  assert.ok(!JSON.stringify(e).includes('"participant_id"'));
  // El host sólo puede votar con SU token: no existe parámetro para votar por otro.
});
await prueba("13. seis participantes; el último voto de cada uno se manda a la vez; un único resultado 'ganador'", async () => {
  const seis = [tokHost, tokA, tokInv, ...toksExtra];
  assert.equal(seis.length, 6);
  const v = (tok, pos, voto) => rpc(anon(), "sala_votar", { p_room: sala, p_token: tok, p_round: ronda, p_pos: pos, p_voto: voto });
  // pos 0 ya la votó Ana (no). El resto vota 0..3 en serie; pos 2 = "yes" para todos → ganador con 6 síes.
  for (const t of seis) for (let pos = t === tokA ? 1 : 0; pos < 4; pos++) await v(t, pos, pos === 2 ? "yes" : "no");
  const antes = await rpc(anon(), "sala_estado", { p_room: sala, p_token: tokHost });
  assert.equal(antes.ronda.terminaron, 0); assert.equal(antes.estado, "votando");
  // El voto que cierra la ronda, los seis a la vez: el lock por sala serializa y sala_computar corre UNA vez.
  const res = await Promise.all(seis.map((t) => v(t, 4, "no")));
  assert.ok(res.every((r) => r.ok));
  const e = await rpc(anon(), "sala_estado", { p_room: sala, p_token: tokHost });
  assert.equal(e.estado, "resultado"); assert.equal(e.resultado.tipo, "ganador"); assert.equal(e.resultado.ganador_pos, 2);
  assert.equal(e.ronda.terminaron, 6);
  // Ningún resultado duplicado: una sola ronda cerrada con resultado en esta sala.
  const { data: rondas } = await admin.from("room_rounds").select("id, resultado, closed_at").eq("room_id", sala);
  assert.equal(rondas.filter((r) => r.resultado).length, 1);
});
await prueba("16. voto posterior al cierre rechazado", async () => {
  const r = await rpc(anon(), "sala_votar", { p_room: sala, p_token: tokA, p_round: ronda, p_pos: 4, p_voto: "yes" });
  assert.equal(r.ok, false); assert.equal(r.motivo, "ronda_cerrada");
});
// (14) dos Sí simultáneos en sala de 2 → un match (abajo); (15) desempate repetido conserva ganador (sala de 3 con dos
// títulos a 2 síes cada uno → empate → sala_desempatar × 3 devuelve el mismo ganador_pos); (17) barrido borra todo tras
// expires_at (forzado con `update rooms set expires_at = now() - interval '1 second'` vía admin; después las cinco tablas
// en 0 para esa sala); (18) nueva tanda excluye títulos anteriores (sala_candidatos con `excluir` de la ronda 1 no trae
// ninguno de sus tmdb_id, y sala_publicar_ronda con uno repetido → sala_card_invalida); (19) payload falso en el tópico
// no cambia `version` ni estado.
console.log(fallos.length ? `\n${fallos.length} fallos: ${fallos.join(", ")}` : "\nTodo verde");
process.exit(fallos.length ? 1 : 0);
```

- [ ] **Step 2:** Completar en el script las pruebas 14–19 con el mismo patrón (`prueba(...)`), incluyendo para la 14:

```js
const dos = await rpc(como(host2.jwt), "sala_crear", { p_nombre: "H", p_platforms: ["n"] });
const tB = (await rpc(anon(), "sala_unirse", { p_room: dos.room_id, p_nombre: "B", p_platforms: ["n"] })).token;
// preparar 5 con admin como en 9 …
const res = await Promise.all([
  rpc(anon(), "sala_votar", { p_room: dos.room_id, p_token: dos.token, p_round: r2, p_pos: 0, p_voto: "yes" }),
  rpc(anon(), "sala_votar", { p_room: dos.room_id, p_token: tB, p_round: r2, p_pos: 0, p_voto: "yes" }),
]);
const e = await rpc(anon(), "sala_estado", { p_room: dos.room_id, p_token: tB });
assert.equal(e.resultado.tipo, "match"); assert.equal(e.resultado.ganador_pos, 0);
assert.equal((await rpc(anon(), "sala_votar", { p_room: dos.room_id, p_token: tB, p_round: r2, p_pos: 1, p_voto: "yes" })).motivo, "ronda_cerrada");
```

y para la 19: `await anon().channel("sala:" + sala).subscribe(); ch.send({ type: "broadcast", event: "cambio", payload: { v: 999999 } })` y comprobar que `sala_estado(...).version` no cambió.

- [ ] **Step 2b: Pruebas de concurrencia y de permisos internos (20–24):**

```js
await prueba("20. una sola sala activa por creador, bajo concurrencia", async () => {
  const h3 = await usuario(`h3-${Date.now()}@sala.test`);
  const res = await Promise.allSettled(Array.from({ length: 10 }, () => rpc(como(h3.jwt), "sala_crear", { p_nombre: "H3", p_platforms: ["n"] })));
  const ok = res.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 1, `creó ${ok.length} salas`);
  assert.ok(res.filter((r) => r.status === "rejected").every((r) => /sala_ya_tiene_activa/.test(r.reason.message)));
  await rpc(como(h3.jwt), "sala_cerrar", { p_room: ok[0].value.room_id });
});

// Helper: sala de 2 en `preparando` con candidatas listas (service_role), devuelve {room, ini, cards}
async function salaPreparando(jwtHost, hostId, size = 5) {
  const r = await rpc(como(jwtHost), "sala_crear", { p_nombre: "H", p_platforms: ["n", "d", "m"] });
  const tB = (await rpc(anon(), "sala_unirse", { p_room: r.room_id, p_nombre: "B", p_platforms: ["n"] })).token;
  const ini = await rpc(admin, "sala_iniciar_preparacion", { p_room: r.room_id, p_host: hostId, p_size: size, p_duracion: "cualquiera" });
  const cand = await rpc(admin, "sala_candidatos", { p_providers: ["Netflix", "Disney Plus", "HBO Max"], p_duracion: "cualquiera", p_excluir: [], p_seed: "s", p_limit: 80 });
  const cards = cand.slice(0, size).map((c, pos) => ({ pos, tmdb_id: c.tmdb_id, titulo: "T" + c.tmdb_id, anio: 2000, runtime: c.runtime, poster: null, generos: ["drama"], platforms: ["n"], razon: c.razon, advertencia: c.advertencia }));
  return { room: r.room_id, tokHost: r.token, tB, ini, cards };
}

await prueba("21. publicar y abortar a la vez: un solo desenlace", async () => {
  const h = await usuario(`h21-${Date.now()}@sala.test`);
  const s = await salaPreparando(h.jwt, h.id);
  const [pub, ab] = await Promise.allSettled([
    rpc(admin, "sala_publicar_ronda", { p_round: s.ini.round_id, p_prep_token: s.ini.prep_token, p_titulos: s.cards }),
    rpc(admin, "sala_abortar_preparacion", { p_round: s.ini.round_id, p_prep_token: s.ini.prep_token }),
  ]);
  const e = await rpc(anon(), "sala_estado", { p_room: s.room, p_token: s.tB });
  // O publicó (votando, 5 títulos) o abortó (lobby, sin ronda): nunca un estado intermedio.
  assert.ok((e.estado === "votando" && e.ronda.titulos.length === 5) || (e.estado === "lobby" && !e.ronda), JSON.stringify({ pub: pub.status, ab: ab.status, estado: e.estado }));
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
});

await prueba("22. publicar contra el vencimiento de la preparación (barrido): sin deadlock, un solo desenlace", async () => {
  const h = await usuario(`h22-${Date.now()}@sala.test`);
  const s = await salaPreparando(h.jwt, h.id);
  await admin.rpc("sala_barrido"); // control: recién creada, el barrido no la toca
  const { error: e1 } = await admin.from("room_rounds").update({ created_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", s.ini.round_id);
  assert.equal(e1, null);
  const res = await Promise.allSettled([
    rpc(admin, "sala_publicar_ronda", { p_round: s.ini.round_id, p_prep_token: s.ini.prep_token, p_titulos: s.cards }),
    rpc(admin, "sala_barrido"),
  ]);
  assert.ok(res.every((r) => r.status !== "rejected" || !/deadlock/i.test(r.reason.message)), "deadlock detectado");
  const e = await rpc(anon(), "sala_estado", { p_room: s.room, p_token: s.tB });
  assert.ok((e.estado === "votando" && e.ronda.titulos.length === 5) || (e.estado === "lobby" && !e.ronda));
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
});

await prueba("23. voto contra el cierre por plazo: o entra antes del cierre o es 'ronda_cerrada'; nunca los dos", async () => {
  const h = await usuario(`h23-${Date.now()}@sala.test`);
  const s = await salaPreparando(h.jwt, h.id);
  await rpc(admin, "sala_publicar_ronda", { p_round: s.ini.round_id, p_prep_token: s.ini.prep_token, p_titulos: s.cards });
  await admin.from("room_rounds").update({ deadline_at: new Date(Date.now() + 1500).toISOString() }).eq("id", s.ini.round_id);
  await new Promise((r) => setTimeout(r, 1400));
  const res = await Promise.all([
    rpc(anon(), "sala_votar", { p_room: s.room, p_token: s.tB, p_round: s.ini.round_id, p_pos: 0, p_voto: "yes" }),
    new Promise((r) => setTimeout(r, 150)).then(() => rpc(admin, "sala_barrido")),
    rpc(anon(), "sala_votar", { p_room: s.room, p_token: s.tokHost, p_round: s.ini.round_id, p_pos: 0, p_voto: "yes" }),
  ]);
  const e = await rpc(anon(), "sala_estado", { p_room: s.room, p_token: s.tB });
  const { data: votos } = await admin.from("room_votes").select("participant_id").eq("round_id", s.ini.round_id);
  const aceptados = [res[0], res[2]].filter((r) => r.ok).length;
  assert.equal(votos.length, aceptados, "un voto rechazado quedó escrito, o uno aceptado no quedó");
  assert.ok(["votando", "resultado"].includes(e.estado));
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
});

await prueba("24. las funciones internas no se pueden ejecutar con anon ni authenticated", async () => {
  const internas = [["sala_tocar", { p_room: sala }], ["sala_participante", { p_room: sala, p_token: tokA }], ["sala_computar", { p_round: ronda }],
    ["sala_aplicar_vencimientos", { p_room: sala }], ["sala_barrido", {}], ["sala_activas", {}], ["sala_hash", { p_token: "x" }], ["sala_nuevo_token", {}],
    ["sala_codigos_permitidos", {}], ["sala_limite_seg", { p_size: 5 }], ["sala_plataformas_validas", { p: ["n"] }], ["sala_nombre_valido", { p: "x" }]];
  for (const [fn, args] of internas) {
    await debeFallar(anon().rpc(fn, args), /permission denied|42501|Could not find the function/);
    await debeFallar(como(inv.jwt).rpc(fn, args), /permission denied|42501|Could not find the function/);
  }
});

await prueba("25. kill switch en la base: con activas='false' no se crea ni se entra", async () => {
  await admin.from("sala_config").update({ valor: "false" }).eq("clave", "activas");
  const h = await usuario(`h25-${Date.now()}@sala.test`);
  await debeFallar(como(h.jwt).rpc("sala_crear", { p_nombre: "H", p_platforms: ["n"] }), /sala_desactivadas/);
  await admin.from("sala_config").update({ valor: "true" }).eq("clave", "activas");
});

await prueba("26. 'Otra tanda' iniciada a segundos del vencimiento renueva expires_at y el barrido no la toca", async () => {
  const h = await usuario(`h26-${Date.now()}@sala.test`);
  const s = await salaPreparando(h.jwt, h.id);
  await rpc(admin, "sala_publicar_ronda", { p_round: s.ini.round_id, p_prep_token: s.ini.prep_token, p_titulos: s.cards });
  // Ronda 1 termina "sin coincidencias": ambos votan no a todo.
  for (let pos = 0; pos < 5; pos++) for (const t of [s.tokHost, s.tB]) await rpc(anon(), "sala_votar", { p_room: s.room, p_token: t, p_round: s.ini.round_id, p_pos: pos, p_voto: "no" });
  let e = await rpc(anon(), "sala_estado", { p_room: s.room, p_token: s.tB });
  assert.equal(e.estado, "resultado"); assert.equal(e.resultado.tipo, "sin_coincidencias");
  // La ventana está por vencer: 2 s.
  await admin.from("rooms").update({ expires_at: new Date(Date.now() + 2000).toISOString() }).eq("id", s.room);
  const ini2 = await rpc(admin, "sala_iniciar_preparacion", { p_room: s.room, p_host: h.id, p_size: 5, p_duracion: "cualquiera" });
  assert.deepEqual(ini2.excluir.sort(), s.cards.map((c) => c.tmdb_id).sort());
  const { data: fila } = await admin.from("rooms").select("estado, expires_at").eq("id", s.room).single();
  assert.equal(fila.estado, "preparando");
  assert.ok(new Date(fila.expires_at).getTime() > Date.now() + 4 * 60_000, "expires_at no se renovó");
  await new Promise((r) => setTimeout(r, 2500));
  await rpc(admin, "sala_barrido");
  e = await rpc(anon(), "sala_estado", { p_room: s.room, p_token: s.tB });
  assert.equal(e.estado, "preparando", "el barrido tocó una sala en preparación");
  // Publicar la ronda 2 con títulos NO usados en la 1
  const cand = await rpc(admin, "sala_candidatos", { p_providers: ["Netflix", "Disney Plus", "HBO Max"], p_duracion: "cualquiera", p_excluir: ini2.excluir, p_seed: "s2", p_limit: 80 });
  assert.ok(cand.every((c) => !ini2.excluir.includes(c.tmdb_id)));
  const cards2 = cand.slice(0, 5).map((c, pos) => ({ pos, tmdb_id: c.tmdb_id, titulo: "T" + c.tmdb_id, anio: 2000, runtime: c.runtime, poster: null, generos: ["drama"], platforms: ["n"], razon: c.razon, advertencia: c.advertencia }));
  await debeFallar(admin.rpc("sala_publicar_ronda", { p_round: ini2.round_id, p_prep_token: ini2.prep_token, p_titulos: [{ ...cards2[0], tmdb_id: s.cards[0].tmdb_id }, ...cards2.slice(1)] }), /sala_card_invalida/);
  const pub2 = await rpc(admin, "sala_publicar_ronda", { p_round: ini2.round_id, p_prep_token: ini2.prep_token, p_titulos: cards2 });
  assert.ok(pub2.ok);
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
});

await prueba("27. una sala en `preparando` nunca es eliminada por el barrido, aun con expires_at en el pasado", async () => {
  const h = await usuario(`h27-${Date.now()}@sala.test`);
  const s = await salaPreparando(h.jwt, h.id);
  // Forzamos el peor caso: expires_at vencido Y preparación de más de 90 s.
  await admin.from("rooms").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", s.room);
  await admin.from("room_rounds").update({ created_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", s.ini.round_id);
  await rpc(admin, "sala_barrido");
  const { data: fila } = await admin.from("rooms").select("estado, expires_at, round_actual").eq("id", s.room).single();
  assert.ok(fila, "la sala fue borrada");
  // Se abortó la preparación colgada y volvió al lobby con ventana renovada; no se borró.
  assert.equal(fila.estado, "lobby");
  assert.ok(new Date(fila.expires_at).getTime() > Date.now());
  const { data: rondas } = await admin.from("room_rounds").select("id").eq("room_id", s.room);
  assert.equal(rondas.length, 0);
  // Control: `sala_cerrar` conserva 5 min (no borra en el acto) y recién después el barrido la elimina.
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
  await rpc(admin, "sala_barrido");
  assert.ok((await admin.from("rooms").select("id").eq("id", s.room).single()).data, "cerrar borró en el acto");
  await admin.from("rooms").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", s.room);
  await rpc(admin, "sala_barrido");
  assert.equal((await admin.from("rooms").select("id").eq("id", s.room)).data.length, 0);
});

await prueba("28. preparación desde el lobby abortada con los 15 min ya vencidos: el lobby se renueva 5 min y se puede reintentar", async () => {
  const h = await usuario(`h28-${Date.now()}@sala.test`);
  const s = await salaPreparando(h.jwt, h.id);  // estado_previo = 'lobby'
  // Los 15 minutos originales ya pasaron mientras se preparaba.
  await admin.from("rooms").update({ lobby_expires_at: new Date(Date.now() - 30_000).toISOString() }).eq("id", s.room);
  await rpc(admin, "sala_abortar_preparacion", { p_round: s.ini.round_id, p_prep_token: s.ini.prep_token });
  const { data: fila } = await admin.from("rooms").select("estado, lobby_expires_at, expires_at").eq("id", s.room).single();
  assert.equal(fila.estado, "lobby");
  const lobbyMs = new Date(fila.lobby_expires_at).getTime() - Date.now();
  assert.ok(lobbyMs > 4 * 60_000 && lobbyMs <= 5 * 60_000 + 2000, `lobby_expires_at renovado fuera de la ventana acotada: ${lobbyMs} ms`);
  // La siguiente lectura NO la vence, y el organizador puede reintentar.
  const e = await rpc(anon(), "sala_estado", { p_room: s.room, p_token: s.tB });
  assert.equal(e.estado, "lobby");
  const ini2 = await rpc(admin, "sala_iniciar_preparacion", { p_room: s.room, p_host: h.id, p_size: 5, p_duracion: "cualquiera" });
  assert.ok(ini2.round_id);
  // Mismo caso por la vía del barrido (preparación colgada > 90 s con lobby vencido).
  await admin.from("rooms").update({ lobby_expires_at: new Date(Date.now() - 30_000).toISOString() }).eq("id", s.room);
  await admin.from("room_rounds").update({ created_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", ini2.round_id);
  await rpc(admin, "sala_barrido");
  const e2 = await rpc(anon(), "sala_estado", { p_room: s.room, p_token: s.tB });
  assert.equal(e2.estado, "lobby");
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
});
```

- [ ] **Step 3:** `node --env-file=.env.sala-local scripts/sala/pruebas-rls.mjs` → `Todo verde`. Guardar la salida en `docs/medidas/2026-09-XX-salas-rls-local.txt`.
- [ ] **Step 4: Commit:** `git commit -m "test(salas): batería de RLS/RPC con anon key contra Supabase local"`.

---

# Etapa 2 — Preparación en Vercel

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
- [ ] **Step 3: Go a Etapa 3:** 20 cards caliente ≤ 2 s, frío ≤ 6 s p95 (3 corridas). Si no, bajar el default a 10 queda como decisión del dueño con el número a la vista.

---

# Etapa 3 — Cliente: lobby y votación

### Task 3.1: Contratos del estado, token local, temporizador

**Files:**
- Create: `lib/sala/estado.ts` (tipo `EstadoSala` = forma del JSON de `sala_estado`, con `esTerminal(e)`, `venceEnSeg(e, ahora)`)
- Create: `lib/sala/token-store.ts` (`leerToken(roomId)`, `guardarToken(roomId, tok)`, `borrarToken(roomId)`; clave `yump:sala:<id>`; try/catch alrededor de `localStorage`)
- Create: `hooks/temporizador-card.ts` (máquina pura + persistencia inyectable): `arrancar(store, clave, ahoraMs) → { arrancoEn }` lee `store.get(clave)` y, si no hay nada, guarda `ahoraMs`; `restante(arrancoEn, ahoraMs)` en s (10 − transcurridos, mínimo 0); `vencio(arrancoEn, ahoraMs)` a los 10.000 ms; `cerrar(store, clave)` borra la entrada. `clave = \`yump:sala:${room}:${round}:${pos}:inicio\``. **Recargar la página no reinicia los 10 s**: el comienzo persiste en `localStorage` por sala, ronda y posición y **se borra sólo cuando el servidor confirmó el avance** (`sala_votar` aceptado, o `sala_estado` con `mi_siguiente_pos > pos`). Un fallo de red conserva el comienzo, vencido o no: al volver, si ya venció, se reintenta el `pass` de inmediato. El plazo global sigue siendo el del servidor: esto sólo evita que el contador local se regale con F5.
- Tests: `lib/sala/estado.test.ts`, `lib/sala/token-store.test.ts` (con un `localStorage` doble), `hooks/temporizador-card.test.ts` (casos: arranque nuevo guarda; segundo `arrancar` con la misma clave conserva el comienzo original y `restante` sigue bajando; `cerrar` borra y un `arrancar` posterior arranca de cero; `vencio` exacto a 10.000 ms; store que lanza → se comporta como sin persistencia)

- [ ] **Step 1:** Tests que fallan → implementación mínima → PASS → commit `feat(salas): contratos de estado, token local y temporizador`.

### Task 3.2: `useSala` — Realtime + relectura acotada

**Files:**
- Create: `hooks/sala-relectura-nucleo.ts` (puro: `programar(ultimaMs, ahoraMs) → { enMs }` con ventana 1500 ms, trailing; testeable)
- Create: `hooks/useSala.ts`
- Test: `hooks/sala-relectura-nucleo.test.ts`

**Interfaces:**
- `useSala(roomId, token) → { estado: EstadoSala | null; cargando; error; releer(); canal: "conectado" | "desconectado" }`
- Comportamiento: (1) `sala_estado` al montar; (2) canal `supabaseBrowser().channel(\`sala:${roomId}\`, { config: { private: false } }).on("broadcast", { event: "cambio" }, () => programarRelectura())`; (3) **nunca publica**; (4) `visibilitychange` → releer; `online` → releer; (5) mientras el canal no esté `SUBSCRIBED`, `setInterval` de 5 s; al quedar `SUBSCRIBED` se limpia; (6) timers locales: releer 1 s después de `deadline_at`, `lobby_expires_at` y `expires_at`; (7) en estado terminal vencido/inexistente: `channel.unsubscribe()` y `borrarToken`; (8) `useEffect` cleanup: unsubscribe.

- [ ] **Step 1:** Test del núcleo: dos señales a 100 ms → una relectura a los 1500 ms; una señal aislada 3 s después → inmediata.
- [ ] **Step 2:** Implementar hook. Commit `feat(salas): useSala con Broadcast público, relectura acotada y respaldo`.

### Task 3.3: Páginas y componentes de lobby

**Files:**
- Create: `app/sala/nueva/page.tsx` → `components/sala/CrearSala.tsx` (requiere `useAuth().user`; nombre precargado con `profile.display_name`; plataformas precargadas desde `usePlatforms().platforms` en **estado local** — nunca `set()` del contexto; botón "Crear" → `rpc sala_crear` con el cliente `supabaseBrowser()` (ya lleva la sesión) → `guardarToken` → `router.replace(/sala/<id>)`)
- Create: `app/sala/[id]/page.tsx` → `components/sala/SalaView.tsx` (lee token; sin token: si `user` → intenta `sala_reclamar`; si falla → `UnirseForm`; con token → `useSala`)
- Create: `components/sala/UnirseForm.tsx`, `components/sala/SelectorPlataformasSala.tsx` (reusa `ProviderCard`; lista desde `/api/providers` mapeada con `codeForTmdbId`, orden `platformOrder`), `components/sala/Lobby.tsx` (participantes, contador de lobby, `ConfigTanda` sólo para host, botón "Empezar" habilitado con `n ≥ 2`, mensaje de `insuficientes` con los tamaños alcanzables)
- Create: `components/sala/ConfigTanda.tsx` (segmentos 5/10/20 y Cualquiera/Corta/Larga; default 10 + Cualquiera)
- Modify: `components/CatalogView.tsx` (entrada "Crear sala" debajo de `RuletaBanner`, sólo `!ES_NATIVO`; sin sesión lleva a `/cuenta`), `components/UserHub.tsx` (tile "Crear sala" en `hub-tiles`, sólo `!ES_NATIVO`)
- Modify: `app/globals.css` (`.sala-*`)

- [ ] **Step 1:** Implementar; el "Empezar" hace `fetch(apiUrl("/api/sala/preparar"), { method: "POST", headers: { Authorization: \`Bearer ${session.access_token}\` }, body })` con el patrón de `TeVaAGustar.tsx:89-100`.
- [ ] **Step 2:** Verificación en navegador (dos ventanas, una incógnito) con `next dev` + `.env.sala-local`: crear, unirse, ver nombres en ambas sin recargar (señal + relectura), lobby vence a los 15 min (probar con `update rooms set lobby_expires_at = now()` vía admin → ambas ventanas muestran "La sala venció").
- [ ] **Step 3:** Commit `feat(salas): crear sala, unirse y lobby`.

### Task 3.4: Votación

**Files:**
- Create: `components/sala/Votacion.tsx`, `components/sala/CardSala.tsx`, `components/sala/BotonesVoto.tsx`, `components/sala/ProgresoRonda.tsx`
- Modify: `app/globals.css`

**Detalle de `CardSala`:** póster (`.rlt-poster` sin `Link`), título, `runtime` formateado `Xh Ym`, `generos.map(genreLabel)`, `PlatformLogo` por cada `platforms` (destacando las de la unión), "Por qué verla" (`.rlt-razon`) y "Pero" (`.rlt-pero`) **sólo si `advertencia` tiene contenido** (`advertencia && advertencia.trim()`): sin "pero" la sección no se renderiza, sin texto de reemplazo ni espacio reservado. **Sin** enlace a la ficha.
**`BotonesVoto`:** tres `<button type="button" className="act sala-act" aria-label="No|Paso|Sí">` con **sólo el ícono** (sin `.lab` visible; el texto va únicamente en `aria-label`): cruz = `M18 6L6 18M6 6l12 12`; salto = `M5 4l10 8-10 8V4zM19 5v14`; corazón = `M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z`. Mismo trazo `1.8` y `viewBox 0 0 24 24` que `.act svg`; el corazón se rellena con `var(--accent)` en `:active`. CSS: `.sala-act { min-width: 64px; min-height: 64px; border-radius: 999px; border: 1px solid var(--line-2) } .sala-act svg { width: 30px; height: 30px } .sala-act:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }`. Mientras hay un `sala_votar` en vuelo los tres llevan el atributo real **`disabled`** (es lo único que impide pulsaciones nuevas; `aria-disabled` puede acompañarlo pero no lo reemplaza) y `.sala-act:disabled { opacity: .5; cursor: default }`.
**Contador:** `temporizador-card` con `setInterval` de 250 ms y **persistencia por sala/ronda/pos** (Tarea 3.1): al montar la card se llama `arrancar(localStorage, clave, Date.now())`, que reusa el comienzo guardado si existe. **`cerrar` se llama únicamente cuando el servidor confirmó el avance**: cuando `sala_votar` devolvió `ok: true` (incluido `idempotente`), o devolvió `motivo: "ya_votado"` / `"fuera_de_orden"` con `siguiente > pos`, o cuando un `sala_estado` posterior trae `mi_siguiente_pos > pos`. Si la solicitud falla (red, 5xx, timeout) el comienzo persistido **se conserva**, aunque ya esté vencido: al recargar, `vencio` es verdadero y se reintenta el `pass` de inmediato en vez de regalar otros 10 s. Si al montar `vencio` ya es verdadero, se registra `pass` sin mostrar la card. Al montar con `mi_siguiente_pos` del estado se retoma desde ahí y se limpian las claves de posiciones anteriores a ésa. Tras el último voto: pantalla "Listo, esperando a los demás (k de N)". Al llegar `estado ≠ votando` → `Resultado*`.

- [ ] **Step 1:** Implementar. Verificar con dos navegadores: orden idéntico, `pass` automático a los 10 s, **recargar a los 6 s deja 4 s (no vuelve a 10)**, recarga tras votar retoma en la siguiente con 10 s, voto tardío tras deadline muestra resultado. **Con la red cortada (DevTools → Offline):** al votar, los tres botones quedan con `disabled` real (un segundo toque no dispara nada), la solicitud falla, el comienzo persistido sigue ahí; recargar sin red no reinicia los 10 s y, si venció, intenta el `pass` en cuanto vuelve la red. Con un lector de pantalla (TalkBack/VoiceOver) los tres botones se anuncian "No", "Paso", "Sí". **Una card con `advertencia` null (la fixture "Sin pero") no muestra la sección "Pero"** —ni título ni caja vacía— y la siguiente con advertencia sí la muestra.
- [ ] **Step 2:** Commit `feat(salas): votación con tres botones, contador local y reanudación`.

---

# Etapa 4 — Resultados y animaciones

### Task 4.1: Pantallas de resultado

**Files:**
- Create: `components/sala/ResultadoMatch.tsx` (pantalla completa; dos mitades de corazón que se juntan con `@keyframes sala-mitad-izq/der`; "¡HAY MATCH!"; póster, título, `PlatformLogo` de las plataformas; `CompartirMatch`; para el host "Otra tanda")
- Create: `components/sala/ResultadoEmpate.tsx` (las cards empatadas entran y forman una ruleta con `@keyframes sala-entra`; "¡Tenemos empate!"; host: "Desempatar" → `rpc sala_desempatar` → la animación de ruleta **se detiene en `ganador_pos` ya guardado**; demás: "Esperando al organizador"; contador de la ventana de 5 min)
- Create: `components/sala/ResultadoSinCoincidencias.tsx` (cards que se separan suavemente; "Esta vez no coincidieron"; sin corazón roto; host: "Otra tanda")
- Create: `components/sala/CompartirMatch.tsx`
- Modify: `app/globals.css` — todas las animaciones dentro de `@media (prefers-reduced-motion: no-preference)`; con `reduce`, estado final sin transición.

El **texto** de resultado en grupos también es "¡Nuestro match!" (en la pantalla y al compartir), aunque el ganador tenga 2 votos.

- [ ] **Step 1:** Implementar consumiendo **sólo** `estado.resultado` de la RPC. Prohibido: cualquier conteo de votos en el cliente (test textual en `components/sala/sin-computo-cliente.test.ts` que falla si en `components/sala/*.tsx` aparece `filter(` sobre `votos` o `"yes"`).
- [ ] **Step 2:** Verificar en dos teléfonos y con "Reducir movimiento" activado. Commit `feat(salas): resultados y animaciones`.

### Task 4.2: Otra tanda

- [ ] **Step 1:** En `ResultadoMatch`/`ResultadoSinCoincidencias`/`ResultadoEmpate` (sólo tras desempate) el host ve `ConfigTanda` + "Otra tanda" → mismo POST de la Tarea 3.3. Verificar: la ronda 2 no repite ningún `tmdb_id` de la 1 (prueba 18 del script), `expires_at` se reemplaza, participantes y plataformas se conservan; **no** disponible con empate sin resolver.
- [ ] **Step 2:** Commit `feat(salas): otra tanda`.

---

# Etapa 5 — Compartir

### Task 5.1: Mensaje y acción de compartir

**Files:**
- Modify: `lib/compartir.ts` — `mensajeMatch(t: { title: string; type: MediaType; id: number }, plataformas: string[]): MensajeCompartir` con texto exacto: `¡Nuestro match!\nDisponible en ${plataformas.join(", ")}\nVer ficha en Yump:` y `url = urlDeTitulo(t.type, t.id)`.
- Create: `lib/compartir-accion.ts` (`compartir(m: MensajeCompartir): Promise<void>`: en nativo `@capacitor/share` por import dinámico; si no, `navigator.share` si existe; si no, `window.open(enlaceWhatsapp(m), "_blank", "noopener")` — extraído de `components/DetailView.tsx:99-150`)
- Modify: `components/DetailView.tsx` para usar `compartir()` (sin cambio de comportamiento)
- Test: `lib/compartir.test.ts` (agregar caso de `mensajeMatch` con el texto exacto y que la URL sea `https://app.yump.ar/titulo/movie/<id>`)

- [ ] **Step 1:** Test → FAIL → implementar → PASS → commit `feat(salas): mensaje de match y acción de compartir compartida con la ficha`.

### Task 5.2: `generateMetadata` de la ficha

**Files:**
- Modify: `app/titulo/[tipo]/[id]/page.tsx`
- Test: `lib/compartir.test.ts` (agregar: el archivo de la página exporta `generateMetadata` y `revalidate = 21600`)

- [ ] **Step 1: Código:**

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

- [ ] **Step 2:** Medir TTFB de `/titulo/movie/278` antes y después (`curl -o /dev/null -s -w "%{time_starttransfer}\n"` × 5, caliente). Anotar en `docs/medidas/…`.
- [ ] **Step 3: Prueba real (Preview de Vercel, no Producción):** compartir un match desde iPhone y desde Android por WhatsApp; capturar la vista previa. **Sin esta prueba, no afirmar que el póster se ve.** Si WhatsApp no muestra imagen: revisar tamaño (`w500` ≈ 40-80 KB) y `og:image` absoluta; si sigue sin verse, queda documentado como limitación y se decide después si vale una imagen propia (fuera del MVP).
- [ ] **Step 4:** Commit `feat(ficha): metadata Open Graph para la vista previa al compartir`.

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
