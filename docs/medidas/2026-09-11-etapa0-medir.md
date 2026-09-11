# Etapa 0 de capacidad — Poder medir: instrumentación por solicitud y banco aislado

**Fecha:** 2026-09-11
**Rama:** `feat/etapa0-medir`, nacida de `main` = `aa7772e`. **Sin mergear, sin push,
sin deploy.** Worktree `wt-etapa0`, sin `.env.local`: ninguna credencial real.
**Alcance:** exclusivamente la Etapa 0 del plan
([`2026-09-10-capacidad-trafico.md`](2026-09-10-capacidad-trafico.md) §9) y el
banco de la §10. **No** hay canonización, single-flight, turno distribuido,
último Home bueno, reintentos de TMDB, CDN ni límites por ruta.
**Datos crudos:** [`2026-09-11-etapa0-linea-base.json`](2026-09-11-etapa0-linea-base.json).

> ⚠️ **Nada de lo que sigue es capacidad de Producción ni "cantidad de usuarios
> soportados".** El banco demuestra comportamiento bajo condiciones que uno mismo
> declara (§10.0 del informe: fuente **A/B**, nunca **C/D**). Sirve para comparar
> cambios contra sí mismo. Las cuotas reales, el tráfico real y el escalado de
> Vercel siguen sin observarse (§10.5, §10.6).

---

## 1. Resumen

- **Una solicitud al Home frío en el banco imprime, por separado:** llamadas a
  TMDB, consultas a Supabase, llamadas lógicas / intentos HTTP / comandos de
  Redis, y composiciones ejecutadas. Es el criterio de aceptación de la Etapa 0 y
  **el primer número real del expediente**: en el banco, un Home frío de `n,d,m`
  cuesta **926 llamadas a TMDB** (94 `discover` + 832 `watch/providers`), **4
  consultas a Supabase** y **993 llamadas lógicas a Redis = 993 intentos HTTP =
  993 comandos** (65 MGET + 928 SET). El doble recibió exactamente eso.
- **Las tres unidades de Redis están separadas y la separación se ve cuando
  importa:** con el doble de Redis cortando el socket, una solicitud registró
  **786 llamadas lógicas, 3.426 intentos HTTP y 259 comandos**; con el doble
  respondiendo 500, **1.055 / 1.055 / 0**. El doble contó los mismos intentos.
- **Composición ≠ MISS, ya desde el modelo.** `home.composiciones` se incrementa
  donde corre `composeHome`; `home.cache` dice lo que decidió el resolver;
  `home.esperasCompartidas` existe y vale 0 hasta que haya single-flight.
- **Dos solicitudes no se mezclan**, probado en unitario (concurrencia
  entrelazada) y en el banco (5 solicitudes simultáneas: cinco líneas `[home]`
  distintas cuya suma de TMDB es exactamente lo que el doble recibió).
- **Dos hechos de comportamiento que el banco puso sobre la mesa** (§7): con
  Redis inalcanzable, un Home frío tardó **183,5 s** (los reintentos del SDK
  compuestos con cientos de llamadas lógicas) — en Vercel, con `maxDuration =
  60`, eso es un 504 —; y con Supabase inalcanzable el Home **no se marca
  degradado y se guarda 6 h** sin "Lo más votados" (bajo las condiciones del
  banco; ver la salvedad).
- **#20 sigue abierto:** el criterio de cierre pide además que la tasa de
  aciertos de Producción se pueda leer sin depender de los logs. Eso es
  observación pasiva (Etapa 5) y no estaba en el alcance de esta etapa.

---

## 2. Qué se cambió, y qué no

| Archivo | Qué |
|---|---|
| `lib/metricas.ts` | **nuevo**, puro. El modelo (`MetricasRequest`), el scope por solicitud (`withMetricas`/`anotar`), la captura para el batcher (`capturar`/`anotarEn`), el `backoff` instrumentado de Upstash, la clasificación de estados HTTP y el formateador de la línea `[home]` |
| `lib/tmdb-base.ts` | **nuevo**, puro. La decisión de la base de TMDB, segura por defecto |
| `lib/cache.ts` | Deja de tener su propio `CacheMetrics`; anota en el modelo nuevo con las tres unidades de Redis; el cliente de Upstash se crea con `retry: { backoff: backoffRedisInstrumentado() }` (mismos reintentos y misma espera); el batcher captura el contador de quien pide cada clave; registra el observador de Supabase |
| `lib/tmdb.ts` | Base desde `baseTmdb(...)`, con un aviso único si se ignoró una configuración; cuenta cada llamada, la clasifica (ok / 429 / 5xx / otros 4xx / red) y acumula su tiempo |
| `lib/supabase.ts` | El `fetch` del cliente de **servidor** avisa a un observador (`observarSupabase`) con tiempo y estado. **Sin ningún import nuevo**: este archivo llega al bundle del navegador |
| `lib/home.ts` | Cuenta la composición explícitamente donde corre `composeHome`; fija `home.cache`, `degradado` y `fuentesCaidas`; la línea `[home]` sale de `lineaHome()` |
| `lib/metricas.test.ts`, `lib/tmdb-base.test.ts` | **nuevos**, escritos antes del código (fallaban al importar) |
| `lib/escritura-cache.test.ts` | un guard del #21 miraba el nombre viejo del campo de tiempo (`msCache` → `redis.ms`); ajustado, con el motivo escrito |
| `scripts/banco/dobles.mjs`, `correr.mjs`, `entorno.sh` | **nuevos**: el banco de la §10 |

**Lo que NO se tocó, y es la garantía de que la instrumentación no cambia
nada visible:** `lib/claves.ts` (las claves), `lib/reparar-y-cachear.ts` (la
decisión de `cachedIf`: un degradado sigue sin guardarse), `lib/escritura-cache.ts`
(#21), `app/api/home/route.ts` (el contrato HTTP), el composer entero
(`composeHome` y sus fuentes). `git diff --stat main..HEAD` lo muestra. En el
banco, B4a (`d,m,n` → HIT de la clave de `n,d,m`) y F1→F1r→F1h (degradado no
guardado → rearma → HIT) lo confirman ejecutando.

---

## 3. El modelo de métricas: significado exacto de cada contador

Todo vive en `MetricasRequest` (`lib/metricas.ts`), un objeto por solicitud.

### 3.1 Home

| Campo | Significado | Cómo se anota |
|---|---|---|
| `home.cache` | `"hit"` / `"miss"` / `null`: lo que decidió el resolver para la clave del Home | `"miss"` dentro del fetcher de `cachedLocIf`; `"hit"` si al terminar sigue en `null` |
| `home.composiciones` | Composiciones del Home **ejecutadas por esta solicitud** | `+= 1` en el fetcher, justo antes de `composeHome`. **No se deduce del MISS** |
| `home.esperasCompartidas` | Veces que esta solicitud esperó una composición ajena | Nadie lo anota todavía: **siempre 0**. Existe para que la Etapa 1 no redefina el modelo: HIT, MISS, composición propia y espera compartida son cuatro cosas |
| `home.degradado`, `home.fuentesCaidas` | Lo que ya viaja en el payload (`degradado`, `fallos`) | Al terminar `homePayload` |

### 3.2 TMDB

| Campo | Significado |
|---|---|
| `tmdb.llamadas` | Llamadas pedidas por el código. `lib/tmdb.ts` **no reintenta**, así que también son los intentos HTTP |
| `tmdb.ok` | Respuestas 2xx |
| `tmdb.errores.http429` / `http5xx` / `http4xx` | Respuestas con ese estado (clasificadas con `clasificarEstadoHttp`) |
| `tmdb.errores.red` | El `fetch` rechazó: red, DNS o el timeout de 8 s. No hubo respuesta |
| `tmdb.ms` | Tiempo **acumulado** dentro de las llamadas, medido después de obtener el permiso del semáforo (es lo que tardó TMDB, no la espera en la cola). Las llamadas van en paralelo: **no es tiempo de pared** |

### 3.3 Supabase

| Campo | Significado |
|---|---|
| `supabase.consultas` | Cada `fetch` del cliente de servidor (`supabaseServer()`): una consulta REST o RPC. supabase-js no reintenta: también son intentos HTTP |
| `supabase.ok`, `errores.http`, `errores.red` | 2xx / otro estado / sin respuesta |
| `supabase.ms` | Acumulado dentro de las consultas |

Sólo cuenta el cliente de **servidor**. `supabaseAdmin()` (service role, cron) y
el cliente del navegador no pasan por acá.

### 3.4 Redis — las tres unidades que antes se llamaban `requests`

| Campo | Significado | Dónde se anota |
|---|---|---|
| `redis.llamadasLogicas` | Lo que el código pidió: cada `GET`, `MGET` o `SET` | Al entrar en `getSuelto`, en cada lote de `flush` y en `guardar` |
| `redis.intentosHttp` | Lo que salió al cable: **1 por llamada lógica contra Redis + 1 por cada reintento del SDK**. En memoria (sin Redis) es 0 | El 1 inicial junto a la llamada lógica; cada reintento desde `backoffRedisInstrumentado` (§4) |
| `redis.comandos` | Lo que Upstash **confirmó** — lo que factura. Sólo respuestas correctas | Después del `await` exitoso |
| `redis.claves` / `hits` / `misses` | Claves pedidas (deduplicadas por lote) y su resultado | A nombre de **quien pidió la clave** (captura), no de quien programó el flush |
| `redis.lotes` | Tamaño de cada MGET | Quien programó el flush |
| `redis.fallos.lectura` / `escritura` | Llamadas que fallaron, por camino | En los `catch` de lectura y en `avisar` de `guardarSinRomper` |
| `redis.ms` | Acumulado dentro del caché | — |
| `redis.modo` | `"redis"` o `"memoria"` | Al primer uso |

Ejemplo real del banco (F5r, la solicitud que atravesó la caída de Redis):
`redis 786 llamadas / 3426 intentos http / 259 comandos`. Con el modelo viejo
eso era `786 requests`.

### 3.5 La línea `[home]`

```
[home] 2576ms total | cache MISS | 1 composición | 0 esperas compartidas | tmdb 926 llamadas (926 ok) 24389ms | supabase 4 consultas (4 ok) 123ms | redis 993 llamadas / 993 intentos http / 993 comandos | 958 claves (30 hit / 928 miss) | 30775ms | lotes: 65 de [1,93,…]
```

Con degradación: `… | 1 composición | 0 esperas compartidas | DEGRADADO (1 fuente(s)) | tmdb 277 llamadas (0 ok, 277 x5xx) …`.
Con fallos de Redis: `… | 989 claves (0 hit / 989 miss) | 66 fallo(s) lectura, 989 fallo(s) escritura | …`.

No lleva tokens, claves de API ni parámetros. La línea `[home] MISS <clave>` de
siempre se conserva (la clave es la combinación de plataformas y toggles, y
contar claves distintas sigue siendo la medida de fragmentación).

---

## 4. `@upstash/redis`: qué se puede observar de cada intento HTTP — **COMPROBADO (código y ejecutado)**

Versión instalada: **1.38.0** (`node_modules/@upstash/redis/nodejs.js`).

**Lo que hace el SDK** (`HttpClient.request`, `pkg/http.ts`):

1. Llama al **`fetch` global** — `res = await fetch(requestUrl, requestOptions)` —
   y **no acepta un `fetch` propio** en la configuración (`RedisConfigNodejs`
   tiene `agent`, `retry`, `signal`, `keepAlive`, `cache`, `readYourWrites`…, no
   `fetch`).
2. Reintenta **sólo fallos de transporte**: `for (i = 0; i <= attempts; i++) {
   try { res = await fetch(...); break } catch { … if (i < attempts) await
   backoff(i) } }`. Una respuesta HTTP de error (`!res.ok`) sale del bucle y se
   lanza como `UpstashError` **sin reintento**.
3. Defaults: `attempts = retry?.retries ?? 5` (→ 6 intentos), `backoff =
   retry?.backoff ?? (i => Math.exp(i) * 50)` ms.

**Los puntos de instrumentación posibles, y por qué se eligió uno:**

| Punto | Ve los reintentos | Atribuible por solicitud | Costo |
|---|---|---|---|
| Envolver el `fetch` global | Sí | Sí (mismo contexto async) | Toca a TODA la app (TMDB, Supabase, Next) y al `fetch` parcheado de Next: invasivo, y un error acá rompe todo |
| Un `Requester` propio (`new Redis(requester)`) | No: vería la llamada lógica, no los intentos del bucle interno | Sí | Habría que reimplementar el bucle de reintentos |
| **`retry.backoff`** | **Sí**: el SDK lo llama **exactamente una vez antes de cada reintento** | **Sí**: se invoca dentro del `await` del comando, así que `AsyncLocalStorage` conserva el scope de la solicitud | Cero: se devuelve la misma espera por defecto |

Se eligió `retry.backoff`: **intentos = 1 (anotado con la llamada lógica) + 1
por cada `backoff`**. No cambia `retries` ni la espera (`Math.exp(i) * 50`,
verificado en test: 50, 136, 369 ms).

**Verificado en el banco contra el doble, que cuenta cada petición HTTP antes de
cortar el socket:** en F5 + F5r la solicitud que atravesó la caída anotó
**3.426 intentos HTTP**; el doble recibió **3.167 durante la caída + 259 tras
volver = 3.426**. Coincidencia exacta.

**Límites, declarados:**

- Si una versión futura del SDK dejara de llamar a `backoff` por reintento, los
  intentos se subestimarían en silencio. El test de fuente ata que el cliente se
  cree con el `backoff` instrumentado; la versión del SDK no está fijada por
  test (está en `package-lock.json`).
- El intento que se aborta por `signal` no pasa por `backoff`; hoy no se usa
  `signal`.
- `comandos` cuenta lo que Upstash **respondió bien**. Si Upstash ejecutó un
  comando y la respuesta se perdió en la red, se factura y acá no se cuenta:
  es la única discrepancia posible entre "confirmado" y "facturado", y no se
  puede ver desde el cliente.

---

## 5. `AsyncLocalStorage`: los límites, auditados antes de usarlo

`withMetricas` corre `fn` en `als.run(metricas, fn)`; el scope se propaga por
`await`, promesas y `queueMicrotask`. Dos límites, ambos con test:

1. **Un callback hereda el contexto de quien lo programó.** Es el batcher de
   `lib/cache.ts`: `batchGet` encola la clave y **la primera solicitud** en
   encolar programa el `flush` con `queueMicrotask`; ese flush corre en SU
   contexto. Antes, todo lo que el flush anotaba (claves, hits, misses, el
   MGET) iba a esa solicitud, y estaba escrito como limitación ("no lo uses para
   facturar"). Ahora `batchGet` **captura** el contador de quien pide
   (`capturar()`) y el flush anota hits/misses/claves **en ese contador**
   (`anotarEn`). Lo único que queda a nombre de quien programó es el viaje HTTP
   del MGET y su tamaño, que es uno para todas las claves del lote — eso no se
   puede repartir sin inventar.
2. **Fuera de un scope no se anota nada** y no rompe. Las rutas que no abren
   `withMetricas` (`/api/top`, `/api/ruleta`, …) no miden. La Etapa 0 abre el
   scope sólo en `homePayload`, como pedía el plan.

**Probado:** dos solicitudes concurrentes entrelazadas con `await` no se mezclan
(unitario); cinco solicitudes simultáneas en el banco produjeron cinco líneas
`[home]` distintas cuya suma de TMDB (926+664+708+658+642 = **3.598**) es
exactamente lo que el doble recibió (**3.598**).

---

## 6. La base de TMDB, segura por defecto — **COMPROBADO (unitario y ejecutado)**

`lib/tmdb-base.ts` → `baseTmdb({ base, banco, vercelEnv })`:

| `TMDB_BASE_URL` | `YUMP_BANCO` | `VERCEL_ENV` | Base | Aviso |
|---|---|---|---|---|
| — | — | cualquiera | oficial | — |
| doble | — | cualquiera | **oficial** | `TMDB_BASE_URL ignorada: falta YUMP_BANCO=1` |
| doble | `1` | `production` | **oficial** | `TMDB_BASE_URL ignorada: VERCEL_ENV=production nunca usa un doble` |
| doble | `1` | otro / ausente | doble | — |
| malformada | `1` | — | oficial | `no es una URL http(s) válida` |

Ejecutado con `next start` sin `.env.local`: con `TMDB_BASE_URL` + `YUMP_BANCO=1`
+ `VERCEL_ENV=production` el log dice `[tmdb] TMDB_BASE_URL ignorada: VERCEL_ENV=production…`;
con `TMDB_BASE_URL` sola, `…falta YUMP_BANCO=1…`. Y el build de verificación (§9)
no emitió ningún `[tmdb]`: sin configurar nada, es la oficial.

---

## 7. El banco aislado y la línea base

### 7.1 Qué es

`scripts/banco/dobles.mjs` levanta tres dobles locales en un proceso: **TMDB**
(4801), **Supabase** (4802, PostgREST y RPC con listas vacías) y **Redis** (4803,
la REST de Upstash: `GET`/`SET EX`/`MGET`/`DEL`/`DBSIZE`, con `Upstash-Encoding:
base64`). Cada uno cuenta las peticiones que recibe (por familia de ruta y, en
Redis, por comando) y acepta por `/__banco/config` un modo: `ok`, `429` (con
`Retry-After`), `500`, `caido` (corta el socket: fallo de transporte, lo único
que el SDK de Upstash reintenta) y una latencia por petición. Devuelven
contenido **fijo y determinístico** derivado de un hash de la consulta.

`scripts/banco/entorno.sh` es el entorno: URLs de los dobles, `YUMP_BANCO=1`,
tokens de mentira, y `unset` de las variables de Vercel. La app se construye y
arranca con eso, **en un worktree sin `.env.local`**. `scripts/banco/correr.mjs`
corre los escenarios, lee las líneas `[home]` del log de `next start` y las
compara con los contadores de los dobles.

**Condiciones declaradas de esta corrida:** un proceso de `next start` local
(Windows 10, Node 24), dobles en el mismo equipo (latencia ~0 salvo L1), 20
títulos por página de `discover`, todos con proveedor AR de Netflix / Disney+ /
Max según el id, Supabase siempre vacío. **Nada de esto es Producción.**

### 7.2 Controles previos (docs/MANTENIMIENTO.md 8.b y 8.b.2)

- **El doble arranca en cero y la app lo mueve** (C0): sin eso, se estaría
  midiendo otro servidor. El corredor aborta si no.
- **Lo que la app dice = lo que el doble recibió**, en TODOS los escenarios:
  TMDB, Supabase, intentos HTTP y comandos de Redis. Un solo desacuerdo habría
  invalidado la corrida.
- **Repetibilidad** (B1 vs B1b): mismas cuentas exactas (926 / 4 / 993-993-993).
- **Variantes que deben distinguirse se distinguen y las equivalentes no**
  (B4a–B4d).

### 7.3 Resultados

Columnas: `estado`, pared (ms, del corredor), lo que dijo la app (`cache`,
composiciones, TMDB, Supabase, Redis lógicas / intentos / comandos, hits/misses,
fallos lectura/escritura, degradado, tiempo total y acumulado por dependencia) y
lo que recibieron los dobles.

| # | Escenario | HTTP | Pared | Cache | Comp. | TMDB | Supabase | Redis L/I/C | hit/miss | fallos L/E | Degr. | Total app | Acumulado tmdb · sb · redis | Dobles |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C0 | control: la app mueve los dobles | 200 | 2618 | MISS | 1 | 926 (926 ok) | 4 | 993/993/993 | 30/928 | 0/0 | no | 2606 | 29353 · 251 · 33987 | tmdb 926 · sb 4 · redis 993 http / 993 cmd |
| B1 | Home frío | 200 | 2582 | MISS | 1 | 926 (926 ok) | 4 | 993/993/993 | 30/928 | 0/0 | no | 2576 | 24389 · 123 · 30775 | 926 · 4 · 993/993 (65 MGET, 928 SET) |
| B1b | repetición de B1 | 200 | 2155 | MISS | 1 | 926 (926 ok) | 4 | 993/993/993 | 30/928 | 0/0 | no | 2133 | 20456 · 97 · 25258 | idéntico a B1 |
| B2 | Home caliente | 200 | 288 | HIT | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 266 | 0 · 0 · 265 | 0 · 0 · 1/1 (1 MGET) |
| B3 | 5 iguales, caché fría | 200 ×5 | 9872 | MISS ×5 | **1 ×5 = 5** | 926, 664, 708, 658, 642 | 4, 3, 3, 3, 3 | 993, 729, 773, 723, 707 (L=I=C) | 30/928 … 315/643 | 0/0 | no | 9685–9811 c/u | — | **3598** · 16 · 3925/3925 (321 MGET, 3604 SET) |
| B4a | `d,m,n` (equivalente) | 200 | 30 | **HIT** | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 12 | — | 0 · 0 · 1/1 |
| B4b | `n,d` (distinta) | 200 | 1280 | MISS | 1 | 404 | 2 | 471/471/471 | 565/403 | 0/0 | no | 1264 | 4877 · 26 · 5594 | 404 · 2 · 471/471 |
| B4c | `n,d,m&t=accion:tv` | 200 | 950 | MISS | 1 | 119 | 2 | 178/178/178 | 837/119 | 0/0 | no | 932 | 1687 · 51 · 2658 | 119 · 2 · 178/178 |
| B4d | `n,d,m&t=accion:movie` (el default) | 200 | 813 | **MISS** | **1** | 1 | 2 | 60/60/60 | 955/1 | 0/0 | no | 797 | 12 · 78 · 774 | 1 · 2 · 60/60 |
| F1 | TMDB 500 | 200 | 400 | MISS | 1 | 277 (0 ok, **277 x5xx**) | 6 | 31/31/31 | 0/281 | 0/0 | **sí** | 383 | 3831 · 72 · 451 | 277 · 6 · 31/31 (27 MGET, 4 SET) |
| F1r | TMDB vuelve | 200 | 1850 | MISS | 1 | 957 (957 ok) | 2 | 1022/1022/1022 | 32/957 | 0/0 | no | 1831 | 17656 · 12 · 21816 | 957 · 2 · 1022/1022 |
| F1h | siguiente | 200 | 36 | HIT | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 16 | — | 0 · 0 · 1/1 |
| F2 | TMDB 429 + Retry-After | 200 | 366 | MISS | 1 | 277 (0 ok, **277 x429**) | 6 | 31/31/31 | 0/281 | 0/0 | **sí** | 351 | 3761 · 28 · 420 | 277 · 6 · 31/31 |
| F3 | TMDB caído (socket) | 200 | 538 | MISS | 1 | 277 (0 ok, **277 red**) | 6 | 31/31/31 | 0/281 | 0/0 | **sí** | 519 | 7976 · 57 · 460 | 277 · 6 · 31/31 |
| F3r | TMDB vuelve | 200 | 2122 | MISS | 1 | 957 | 2 | 1022/1022/1022 | 32/957 | 0/0 | no | 2102 | 19445 · 36 · 23818 | 957 · 2 · 1022/1022 |
| F4 | Supabase caído (socket) | 200 | **8979** | MISS | 1 | 957 | **30 (0 ok, 30 red)** | 1030/1030/1030 | 25/964 | 0/0 | **no** | 8963 | 18620 · 392 · 22021 | 957 · 30 · 1030/1030 |
| F4r | Supabase vuelve | 200 | 33 | **HIT** | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 17 | — | 0 · 0 · 1/1 |
| F5 | Redis caído (socket) | **timeout del corredor a 180 s** | 180032 | — | — | — | — | — | — | — | — | — | — | tmdb 481 · sb 17 · redis **3167 http / 0 cmd** en la ventana |
| F5 (tardía) | la misma solicitud, terminada cuando Redis volvió | (línea en la ventana de F5r) | — | MISS | 1 | 705 | 17 | **786 / 3426 / 259** | 269/720 | **32/495** | no | **183516** | 32398 · 199 · 2479192 | 259 http/cmd en la ventana de F5r |
| F5r | Redis vuelve | 200 | 3044 | MISS | 1 | 957 | 4 | 1025/1025/1025 | 30/959 | 0/0 | no | 3036 | 34982 · 192 · 41395 | 1181 · 4 · 1284/1284 (con la cola de F5) |
| F5h | siguiente | 200 | 30 | HIT | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 17 | — | 0 · 0 · 1/1 |
| F6 | Redis responde 500 | 200 | 3515 | MISS | 1 | 957 | **34** | **1055 / 1055 / 0** | 0/989 | **66/989** | no | 3503 | 25197 · 643 · 35569 | 957 · 34 · **1055 http / 0 cmd** |
| L1 | TMDB +100 ms por llamada | 200 | **8085** | MISS | 1 | 957 | 4 | 1025/1025/1025 | 30/959 | 0/0 | no | 8064 | **113982** · 46 · 10741 | 957 · 4 · 1025/1025 |

Los escenarios de fallo usan combinaciones de plataformas propias para no
heredar lo guardado por el anterior; por eso el Home frío de cuatro plataformas
cuesta 957 llamadas y el de tres 926.

### 7.4 Lo que la línea base dice — **EJECUTADO, bajo las condiciones declaradas**

1. **Costo de un Home frío (n,d,m):** 926 TMDB / 4 Supabase / 993 Redis, ~2,2–2,6 s
   de pared con dobles locales. El 90 % de TMDB son `watch/providers`, uno por
   título (832 de 926). Caliente: 1 MGET, ~30 ms.
2. **Sin single-flight, 5 solicitudes iguales sobre caché fría son 5
   composiciones** (B3), 3.598 llamadas a TMDB en vez de 926, y cada una tarda
   ~9,7 s en vez de ~2,5 (se disputan el semáforo de 24). Que las 2.ª a 5.ª
   cuesten 642–708 y no 926 es porque los cachés de título (`pv3:` etc.) de la
   primera ya iban quedando: es reparto parcial por casualidad de timing, no
   coordinación. **Es la línea contra la que la Etapa 1 se va a medir.**
3. **`t=accion:movie` es OTRA clave que la ausencia de `t`** (B4d: MISS con 1
   llamada a TMDB, 955 hits de título). Es el issue #18 visto con el instrumento
   nuevo: un default escrito y uno implícito rearman por separado. No se corrige
   acá.
4. **Con TMDB caído (500, 429 o red), el Home sale degradado, cuesta 277
   llamadas fallidas, se sirve con 200 y NO se guarda** (F1r vuelve a rearmar).
   Los tres modos se distinguen en la línea (`x5xx`, `x429`, `red`). Los 4 SET
   son cachés que no dependen de TMDB.
5. 🔴 **Con Redis inalcanzable, un Home frío tardó 183,5 s.** Cada llamada lógica
   paga hasta 6 intentos con backoff (~4,3 s) y hay cientos, en cadenas parcialmente
   secuenciales: 786 llamadas lógicas → 3.426 intentos HTTP, 527 líneas
   `[cache] … falló`. El corredor lo abortó a los 180 s; en Vercel, `maxDuration
   = 60` lo convierte en **504**. Cuando Redis volvió a mitad de la solicitud,
   los 259 comandos finales se confirmaron y la solicitud terminó. **Es el
   escenario E8c ("se mide qué pasa") de la §10.3, medido.** Con Redis
   respondiendo 500 (F6), en cambio, el SDK no reintenta: 1.055 intentos, 0
   comandos, 3,5 s y el Home entero servido con **66 fallos de lectura y 989 de
   escritura registrados** — la Etapa PREVIA (#21) funcionando bajo el
   instrumento.
6. **Con Supabase inalcanzable (F4) el Home NO se marca degradado y se guarda:**
   F4r es HIT. Bajo las condiciones del banco, ninguna de las 30 consultas
   fallidas alimenta la señal de degradación (`withFallosDisponibilidad` sólo se
   dispara en la evidencia de disponibilidad, que en el banco nunca se consulta
   porque el doble de TMDB siempre da proveedor AR). Resultado: un Home sin "Lo
   más votados" ni reseñas queda 6 h en caché. ⚠️ **Salvedad:** en Producción,
   con títulos sin proveedor AR, la misma caída sí llegaría a esa señal; el
   banco no puede decir cuál de los dos casos domina. Y hay otro dato: **30
   consultas en vez de 4**. No es reintento de supabase-js ni de Yump (no hay
   ninguno en el código): es que sin respuesta nada se guarda en Redis y cada
   llamador vuelve a preguntar — lo mismo que en F6 (34). Los ~7 s de pared
   extra **no están dentro de las consultas** (392 ms acumulados) y **no se
   explicaron** en esta corrida; es una pregunta para la Etapa 3, no para la 0.
7. **La latencia de TMDB domina la pared:** +100 ms por llamada (L1) llevan el
   Home frío de ~2,5 s a **8,1 s**, con 957 llamadas por un semáforo de 24.
   `tmdb.ms` acumulado pasa de ~20 s a 114 s. Es el multiplicador que el
   informe pedía medir antes de hablar de "req/s" (§4, [R4]).

---

## 8. Qué está comprobado, qué es inferencia, qué no se puede afirmar

### Ejecutado y comprobado
- Todo lo de §7 (línea base), incluida la coincidencia app ↔ dobles en cada
  escenario y la repetibilidad.
- Aislamiento entre solicitudes: unitario (concurrencia entrelazada, microtask,
  captura) y banco (B3).
- Intentos HTTP de Redis = 1 + reintentos, cotejado con el doble (3.426 = 3.167 + 259).
- La base de TMDB: la decisión en unitario y los dos avisos con `next start`.
- Que un degradado no se guarda y que la clave normalizada sigue igual
  (F1→F1r→F1h, B4a).
- Tests y build (§9).

### Comprobado por lectura
- El bucle de reintentos del SDK y que `backoff` se llama una vez por reintento
  (`nodejs.js:191-212`); que el SDK no reintenta respuestas HTTP de error.
- Que `lib/supabase.ts` llega al bundle del navegador (por `supabaseBrowser`) y
  por eso no puede importar `node:async_hooks`.
- Que `app/api/home/route.ts` devuelve `NextResponse.json(payload)` sin cambios.

### Inferido
- Que en Vercel el F5 sería un 504: sale de `maxDuration = 60` y de los 183,5 s
  medidos localmente; no se provocó en Vercel.
- Que en Producción la caída de Supabase sí llegaría a la señal de degradación
  en los títulos sin proveedor AR (§7.4-6).

### No verificable todavía
- **Comandos facturados** vs confirmados: el cliente sólo ve las respuestas.
  Lo facturado se lee en el panel de Upstash (§10.5), no en el código.
- La causa de los ~7 s extra de F4.
- Cuántas instancias levanta Vercel y cómo reparte solicitudes: el
  `AsyncLocalStorage` es por proceso; entre instancias no hay nada que mezclar
  ni nada que sumar sin la Etapa 5.

### Hechos de Producción que el banco NO puede revelar
- La tasa de aciertos real, la fragmentación real de claves, el costo real de un
  Home frío con el catálogo real de TMDB (en el banco todo título tiene
  proveedor AR y cada página trae 20; en Producción la cosecha es otra), la
  latencia real de TMDB/Upstash/Supabase, los límites de las cuentas, el
  tráfico y su origen. Fuentes **C** y **D** de §10.0.

---

## 9. Tests y comandos ejecutados

Sobre la rama, en `wt-etapa0`, sin `.env.local`:

| Qué | Resultado |
|---|---|
| `node --test lib/metricas.test.ts lib/tmdb-base.test.ts` antes de escribir los módulos | **RED**: `ERR_MODULE_NOT_FOUND` en los dos |
| Lo mismo con los módulos puros pero sin cablear producción | 17/24: los 7 guards de fuente en rojo |
| `node --test lib/metricas.test.ts lib/tmdb-base.test.ts` final | **24/24** |
| `node --test lib/escritura-cache.test.ts` (#21, tras ajustar el nombre del campo de tiempo) | 18/18 |
| `npm test` (con `.next` de producción fresco) | **1389 tests: 1379 pasan, 0 fallos, 10 omitidos** |
| `npx tsc --noEmit` | limpio |
| `npm run build` **sin** entorno de banco, `.next` borrado antes | **exit 0 en 1 min 42 s**, `BUILD_ID fpFT9GAH5cM87aVGMB-0R`, sin aviso `[tmdb]` |
| `npm run build` **con** `scripts/banco/entorno.sh` (el que corrió la línea base) | exit 0 en 3 min 17 s |
| `git diff --check` | limpio |

Tests nuevos (24): el modelo y sus nombres; composición ≠ MISS; concurrencia
entrelazada; scope ausente; el límite del microtask; captura + anotación
cruzada; el `backoff` instrumentado y su espera; clasificación de estados; la
línea `[home]` en tres formas (MISS completo, HIT, memoria) y que no contiene
`requests`; siete guards de fuente (cache.ts sin `requests` y con las tres
unidades; el cliente con el `backoff` y sin `retries`; el batcher con captura;
tmdb.ts contando y clasificando; supabase.ts con observador y sin
`async_hooks`; home.ts contando la composición y usando `lineaHome`); y la
decisión de la base de TMDB (6 casos + guard de fuente).

---

## 10. Limitaciones y riesgos

- **`intentosHttp` depende de que el SDK llame a `backoff` por reintento.** Está
  atado a la versión instalada (1.38.0) por lectura, no por test de runtime.
  Punto de instrumentación mínimo si eso cambiara: envolver el `fetch` global
  filtrando por el host de Upstash — se descartó hoy por invasivo.
- **`comandos` es "confirmado", no "facturado".** Ver §8.
- **La captura del batcher reparte hits/misses/claves, no el viaje del MGET.**
  Con muchas solicitudes concurrentes, `llamadasLogicas`/`intentosHttp`/`comandos`
  de lectura se concentran en quien programó cada flush. Es inherente a agrupar.
- **Sólo el Home mide.** Las otras rutas no abren scope (por diseño de la Etapa 0).
- **Los tiempos por dependencia son acumulados, no de pared.** Sumar `tmdb.ms`
  como si fuera latencia sería el error de unidades que esta etapa vino a evitar.
- **La línea `[home]` sigue viviendo en los logs de Vercel**, que el 10/09 no se
  pudieron leer a posteriori. Esta etapa produce el número; que sobreviva es la
  Etapa 5.
- **El banco corre en Windows con dobles en el mismo equipo**: los tiempos de
  pared son comparables entre sí, no con nada de afuera.
- **`lib/supabase.ts` registra un solo observador global.** Si otro módulo
  server-only registrara otro, pisaría el de `lib/cache.ts`. Hoy hay uno.
- **Riesgo de regresión silenciosa en la seguridad de la base de TMDB:** está
  cubierta por tests puros y por dos corridas reales, pero la variable
  `VERCEL_ENV` la pone Vercel, no el repositorio; si algún día se corriera un
  "production" fuera de Vercel, la marca `YUMP_BANCO` sigue siendo obligatoria.

---

## 11. Estado del issue #20 tras esta etapa

| Criterio de cierre | Estado |
|---|---|
| Una petición al Home frío informa por separado TMDB, Supabase, las tres unidades de Redis y las composiciones (distinguidas de HIT y de espera compartida) | ✅ **Cumplido y ejecutado** (§7) |
| La tasa de aciertos del caché en Producción se puede leer sin depender de que los logs sigan ahí | ❌ No: es serie histórica (Etapa 5), fuera de esta etapa |
| Puntos 3–6 del issue (Analytics mide visitas; Android sin medición; logs no recuperables; `/api/health` cuesta 3 comandos) | Sin cambios: no eran de la Etapa 0 |

**#20 sigue abierto**, con la primera mitad de su criterio cumplida.

---

## 12. Recomendación

**La Etapa 0 está lista para la auditoría de Codex**, con estas tres cosas
señaladas para que las mire primero: (1) el punto de instrumentación de los
reintentos de Upstash (§4) y su cotejo 3.426 = 3.167 + 259; (2) la captura del
batcher (§5), que cambia a quién se le anotan hits/misses respecto del código
anterior; (3) los dos hechos de comportamiento de §7.4 (Redis inalcanzable → 183 s;
Supabase inalcanzable → Home guardado), que no son de esta etapa arreglar pero
sí de esta etapa haber medido. No hay nada que mergear hasta que Codex audite.
