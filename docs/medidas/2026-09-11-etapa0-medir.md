# Etapa 0 de capacidad — Poder medir: instrumentación por solicitud y banco aislado

**Fecha:** 2026-09-11 (segunda versión, tras la auditoría de Codex de `ceeed75`: ver §7.5)
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
  importa:** en la recuperación controlada (F5b: Redis cortando el socket
  durante los primeros 15 s de la solicitud), una solicitud registró **1.026
  llamadas lógicas, 1.655 intentos HTTP y 921 comandos**; con el doble
  respondiendo 500 (F6), **1.055 / 1.055 / 0**. El doble contó exactamente los
  mismos intentos y comandos.
- **Composición ≠ MISS, ya desde el modelo.** `home.composiciones` se incrementa
  donde corre `composeHome`; `home.cache` dice lo que decidió el resolver;
  `home.esperasCompartidas` existe y vale 0 hasta que haya single-flight.
- **Dos solicitudes no se mezclan**, probado en unitario (concurrencia
  entrelazada) y en el banco (5 solicitudes simultáneas: cinco líneas `[home]`
  distintas cuya suma de TMDB es exactamente lo que el doble recibió).
- **La coincidencia app ↔ dobles la verifica el corredor, escenario por
  escenario, y una diferencia invalida la corrida** (`lib/banco-validacion.ts`,
  con tests). La corrida publicada es válida: **23 escenarios totales: 22
  completos** con las cuatro igualdades cerradas **y 1 incompleto declarado**
  (F5a), sin igualdades que no puede cumplir. La primera versión de este informe afirmó
  la coincidencia sin verificarla y era falsa en dos escenarios (§7.5).
- **Dos hechos de comportamiento que el banco puso sobre la mesa** (§7): con
  Redis cortando el socket de forma sostenida, un Home frío **no completó en 60
  s** (F5a: 1.943 intentos HTTP al doble en esa ventana, cero comandos) — en
  Vercel, con `maxDuration = 60`, eso sería un 504, **inferido**, no medido —;
  y con Supabase inalcanzable el Home **no se marca degradado y se guarda 6 h**
  sin "Lo más votados" (bajo las condiciones del banco; ver la salvedad).
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
| `lib/home.ts` | Cuenta la composición explícitamente donde corre `composeHome`; fija `home.cache`, `degradado` y `fuentesCaidas`; la línea `[home]` sale de `lineaHome()` y lleva la clave; deja `[home] pedido <clave>` al entrar (segunda versión: es lo que hace contables las solicitudes activas) |
| `lib/banco-validacion.ts`, `lib/banco-validacion.test.ts` | **nuevos** (segunda versión), puro + 18 tests: la validación del banco, escenario por escenario (§7.5) |
| `.gitignore` | `.banco-logs/`: los logs de los procesos de Next que levanta el corredor |
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

Ejemplo real del banco (F5b, la solicitud que atravesó una caída de Redis de
15 s): `redis 1026 llamadas / 1655 intentos http / 921 comandos`. Con el modelo
viejo eso era `1026 requests`.

### 3.5 La línea `[home]`

```
[home] 2576ms total | cache MISS | 1 composición | 0 esperas compartidas | tmdb 926 llamadas (926 ok) 24389ms | supabase 4 consultas (4 ok) 123ms | redis 993 llamadas / 993 intentos http / 993 comandos | 958 claves (30 hit / 928 miss) | 30775ms | lotes: 65 de [1,93,…]
```

Con degradación: `… | 1 composición | 0 esperas compartidas | DEGRADADO (1 fuente(s)) | tmdb 277 llamadas (0 ok, 277 x5xx) …`.
Con fallos de Redis: `… | 989 claves (0 hit / 989 miss) | 66 fallo(s) lectura, 989 fallo(s) escritura | …`.

No lleva tokens, claves de API ni parámetros. Termina con `| clave <clave del
Home>` —la misma que ya viaja en `[home] MISS <clave>`, que se conserva— para
poder atribuir cada línea a una solicitud cuando hay varias concurrentes. Y al
entrar a `homePayload` se escribe `[home] pedido <clave>`: pedidos sin línea
terminal = solicitudes todavía corriendo, que un timeout del cliente no cancela.

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
cortar el socket:** en F5b (recuperación controlada, una sola solicitud viva en
un proceso recién arrancado) la solicitud anotó **1.655 intentos HTTP y 921
comandos**; el doble recibió **1.655 peticiones HTTP y ejecutó 921 comandos**.
Coincidencia exacta, verificada por el corredor. (La primera versión citaba
"3.426 = 3.167 + 259" de una solicitud que se había solapado con el escenario
siguiente; la cuenta cerraba, pero venía de una corrida inválida — §7.5.)

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
- **Lo que la app dice = lo que el doble recibió, verificado AUTOMÁTICAMENTE
  por escenario** (`validarEscenario`, §7.5): sumas de las líneas `[home]` del
  escenario contra los deltas de los dobles en TMDB, Supabase, intentos HTTP y
  comandos de Redis; líneas terminales = respuestas completadas; pedidos =
  solicitudes hechas; ninguna línea de otra clave. Una diferencia → corrida
  inválida, JSON bajo otro nombre, código de salida 1.
- **Ningún escenario empieza con trabajo ajeno vivo en Next:** cada solicitud
  deja `[home] pedido <clave>` al entrar; pedidos − terminales = activas. Si
  hay activas, el corredor reinicia Next y lo demuestra (§7.5).
- **Repetibilidad** (B1 vs B1b): mismas cuentas exactas (926 / 4 / 993-993-993).
- **Variantes que deben distinguirse se distinguen y las equivalentes no**
  (B4a–B4d).

### 7.3 Resultados

Columnas: `estado`, pared (ms, del corredor), lo que dijo la app (`cache`,
composiciones, TMDB, Supabase, Redis lógicas / intentos / comandos, hits/misses,
fallos lectura/escritura, degradado, tiempo total y acumulado por dependencia) y
lo que recibieron los dobles.

| # | Escenario | HTTP | Pared | Cache | Comp. | TMDB | Supabase | Redis L/I/C | hit/miss | fallos L/E | Degr. | Total app | Acumulado tmdb · sb · redis | Dobles (tmdb · sb · redis http/cmd) | Validación |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C0 | control: la app mueve los dobles desde cero | 200 | 2550 | MISS | 1 | 926 (926 ok) | 4 | 993/993/993 | 30/928 | 0/0 | no | 2454 | 22921 · 205 · 27575 | 926 · 4 · 993/993 (65 MGET, 928 SET) | ✅ |
| B1 | Home frío | 200 | 1950 | MISS | 1 | 926 (926 ok) | 4 | 993/993/993 | 30/928 | 0/0 | no | 1932 | — | 926 · 4 · 993/993 | ✅ |
| B1b | repetición de B1 | 200 | 1804 | MISS | 1 | 926 (926 ok) | 4 | 993/993/993 | 30/928 | 0/0 | no | 1783 | — | idéntico a B1 | ✅ |
| B2 | Home caliente | 200 | 20 | HIT | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 13 | — | 0 · 0 · 1/1 (1 MGET) | ✅ |
| B3 | 5 iguales, caché fría | 200 ×5 | 6473 | MISS ×5 | **1 ×5 = 5** | 926, 664, 708, 658, 642 | 4, 3, 3, 3, 3 | 993, 729, 773, 723, 707 (L=I=C) | 30/928 … 315/643 | 0/0 | no | 6260–6459 c/u | — | **3598** · 16 · 3925/3925 (321 MGET, 3604 SET) | ✅ sumas |
| B4a | `d,m,n` (equivalente) | 200 | 29 | **HIT** | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 15 | — | 0 · 0 · 1/1 | ✅ |
| B4b | `n,d` (distinta) | 200 | 1342 | MISS | 1 | 404 | 2 | 471/471/471 | 565/403 | 0/0 | no | 1330 | — | 404 · 2 · 471/471 | ✅ |
| B4c | `n,d,m&t=accion:tv` | 200 | 852 | MISS | 1 | 119 | 2 | 178/178/178 | 837/119 | 0/0 | no | 833 | — | 119 · 2 · 178/178 | ✅ |
| B4d | `n,d,m&t=accion:movie` — HOY (#18 abierto) es OTRA clave que sin `t` | 200 | 794 | **MISS** | **1** | 1 | 2 | 60/60/60 | 955/1 | 0/0 | no | 773 | — | 1 · 2 · 60/60 | ✅ |
| F1 | TMDB 500 | 200 | 463 | MISS | 1 | 277 (0 ok, **277 x5xx**) | 6 | 31/31/31 | 0/281 | 0/0 | **sí** | 449 | — | 277 · 6 · 31/31 (27 MGET, 4 SET) | ✅ |
| F1r | TMDB vuelve | 200 | 2154 | MISS | 1 | 957 (957 ok) | 2 | 1022/1022/1022 | 32/957 | 0/0 | no | 2131 | — | 957 · 2 · 1022/1022 | ✅ |
| F1h | siguiente | 200 | 27 | HIT | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 14 | — | 0 · 0 · 1/1 | ✅ |
| F2 | TMDB 429 + Retry-After | 200 | 385 | MISS | 1 | 277 (0 ok, **277 x429**) | 6 | 31/31/31 | 0/281 | 0/0 | **sí** | 369 | — | 277 · 6 · 31/31 | ✅ |
| F3 | TMDB caído (socket) | 200 | 617 | MISS | 1 | 277 (0 ok, **277 red**) | 6 | 31/31/31 | 0/281 | 0/0 | **sí** | 602 | — | 277 · 6 · 31/31 | ✅ |
| F3r | TMDB vuelve | 200 | 2017 | MISS | 1 | 957 | 2 | 1022/1022/1022 | 32/957 | 0/0 | no | 1998 | — | 957 · 2 · 1022/1022 | ✅ |
| F4 | Supabase caído (socket) | 200 | **8814** | MISS | 1 | 957 | **30 (0 ok, 30 red)** | 1030/1030/1030 | 25/964 | 0/0 | **no** | 8798 | 15406 · 264 · 18624 | 957 · 30 · 1030/1030 | ✅ |
| F4r | Supabase vuelve | 200 | 30 | **HIT** | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 14 | — | 0 · 0 · 1/1 | ✅ |
| **F5a** | **Redis caído (socket) de forma SOSTENIDA, ventana de 60 s** | **abortada por el cliente a 60 s** | 60014 | — | — | — | — | — | — | — | — | — | — | actividad observada: tmdb 297 · sb 11 · redis **1943 http / 0 cmd**; 323 `[cache] … falló` | ✅ **incompleto declarado**: "no completó en más de 60000 ms", 1 activa en el servidor → **reinicio de Next** (pid 40024 → 27080) |
| **F5b** | **recuperación CONTROLADA**: clave exclusiva, Redis caído al pedir, **vuelve a los 15,003 s**, se espera a que ESA solicitud termine | 200 | **17678** | MISS | 1 | 957 | 5 | **1026 / 1655 / 921** | 29/960 | **4/101** | no | 17598 | 29145 · 149 · 602331 | 957 · 5 · **1655/921** (62 MGET, 859 SET) | ✅ |
| F5c | la solicitud siguiente | 200 | 32 | **HIT** | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 16 | — | 0 · 0 · 1/1 | ✅ |
| F5d | …y la siguiente | 200 | 37 | HIT | 0 | 0 | 0 | 1/1/1 | 1/0 | 0/0 | no | 21 | — | 0 · 0 · 1/1 | ✅ |
| F6 | Redis responde 500 | 200 | 3081 | MISS | 1 | 957 | **34** | **1055 / 1055 / 0** | 0/989 | **66/989** | no | 3069 | 20549 · 615 · 27977 | 957 · 34 · **1055 http / 0 cmd** | ✅ |
| L1 | TMDB +100 ms por llamada | 200 | **8052** | MISS | 1 | 957 | 4 | 1025/1025/1025 | 30/959 | 0/0 | no | 8032 | — | 957 · 4 · 1025/1025 | ✅ |

Los escenarios de fallo usan combinaciones de plataformas propias para no
heredar lo guardado por el anterior; por eso el Home frío de cuatro plataformas
cuesta 957 llamadas y el de tres 926.

### 7.5 El defecto del primer corredor, y cómo se cerró — **REPRODUCIDO Y CORREGIDO**

La auditoría de Codex sobre `ceeed75` señaló que el banco había mezclado dos
escenarios. Reproducido sobre el JSON publicado entonces, sumando las líneas
de cada escenario contra sus dobles:

| Escenario (ceeed75) | Respuestas | Líneas `[home]` | App (tmdb / sb / intentos / cmd) | Dobles | |
|---|---|---|---|---|---|
| F5 (Redis caído, timeout 180 s) | 0/1 | **0** | 0 / 0 / 0 / 0 | **481 / 17 / 3167 / 0** | 🔴 |
| F5r (Redis vuelve) | 1/1 | **2** | **1662 / 21 / 4451 / 1284** | **1181 / 4 / 1284 / 1284** | 🔴 |
| los otros 22 | — | — | iguales | iguales | ✅ |

**Qué pasó:** abortar el `fetch` del corredor no cancela el handler de Next; la
solicitud de F5 siguió viva. El corredor arrancó F5r y `sanos()` rehabilitó el
doble de Redis con esa solicitud todavía corriendo; la solicitud tardía terminó
**dentro de la ventana de F5r** (segunda línea, 3.426 intentos) y movió los
dobles de F5r. El informe afirmó "coincidencia en todos los escenarios" sin
haberla sumado: era falsa en dos. Y "Redis inalcanzable durante 183,5 s" era
impreciso: lo comprobado es que la solicitud superó los 180 s y terminó **3,5 s
después de que el corredor rehabilitara Redis**. El corredor sólo controlaba
C0, y ahí ni siquiera abortaba.

**Qué se cambió:**

1. **Aislamiento verificable, sin timers.** Cada solicitud deja `[home] pedido
   <clave>` al entrar (lib/home.ts) y su línea terminal lleva `| clave <clave>`.
   Pedidos − terminales = solicitudes activas en el servidor. Un escenario no
   empieza con activas; si las hay (F5a), el corredor **reinicia Next y lo
   demuestra**: el proceso viejo emite `exit` (`taskkill /T /F` → código 1), el
   puerto 3000 deja de aceptar conexiones, y el nuevo responde `/api/health`
   con otro PID — registrado en el JSON (`reinicios`: 40024 → 27080). Recién
   con el proceso viejo muerto se ponen sanos los dobles: rehabilitar Redis con
   una solicitud vieja viva era exactamente el defecto.
2. **Correlación por clave.** El sufijo esperado sale de la query como lo arma
   `claveHome` (plataformas ordenadas, toggles); los escenarios de fallo usan
   combinaciones exclusivas. Una línea con clave ajena invalida el escenario.
3. **Validación automática** (`lib/banco-validacion.ts`, puro, 18 tests): por
   escenario completado, sumas de líneas = deltas de dobles en las cuatro
   unidades; líneas terminales = respuestas completadas; pedidos = solicitudes
   hechas. Los escenarios que pueden quedar incompletos lo declaran
   (`permiteIncompleto`): si no completan, quedan como "no completó en más de
   X ms" con la actividad observada y **sin igualdades**; si una línea aparece
   sin respuesta (el servidor terminó lo que el cliente abortó), es inválido.
   Cualquier problema → corrida inválida, JSON con `valida: false` bajo el
   nombre `…-INVALIDA.json`, código de salida 1.
4. **Redis caído en dos escenarios separados:** F5a (sostenida, ventana de 60 s,
   puede quedar incompleto) y F5b (recuperación controlada, con el momento
   exacto en que vuelve Redis registrado como evento), más F5c/F5d.
5. **B4d** ya no dice que el default "debería ser HIT": describe el
   comportamiento actual (#18 abierto) — es MISS y otra clave.

**Controles de la validación (tests):** una coincidencia pasa; una diferencia
en cada una de las cuatro unidades falla; una línea tardía de otra clave falla;
dos líneas para una respuesta fallan; un timeout del cliente no cuenta como
finalización (y si el servidor terminó igual, es inválido); un incompleto sin
permiso falla, con permiso queda declarado y sin igualdades. Y una **regresión**:
los números de F5/F5r de `ceeed75` salen inválidos. Aplicado el módulo nuevo al
JSON viejo completo: **inválidos F5 y F5r, válidos los otros 22** — exactamente
el diagnóstico de la auditoría.

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
5. 🔴 **Redis cortando el socket, en tres escenarios separados a propósito:**
   - **Caída SOSTENIDA (F5a):** un Home frío **no completó en 60 s**. Es lo
     único que se afirma: el cliente abortó a los 60.014 ms, la solicitud seguía
     viva en Next (pedido sin terminal), y en esa ventana el doble recibió 1.943
     intentos HTTP y ejecutó 0 comandos, con 323 líneas `[cache] … falló`. No
     hay duración final, respuesta ni métricas de esa solicitud: no se
     inventan. Cada llamada lógica paga hasta 6 intentos con backoff (~4,3 s)
     y hay cientos, en cadenas parcialmente secuenciales. En Vercel, con
     `maxDuration = 60`, sería un **504 — inferido, no medido**. Después el
     corredor **reinició Next** y lo demostró (§7.5). Es el E8c de la §10.3.
   - **Recuperación CONTROLADA (F5b):** clave exclusiva, proceso recién
     arrancado, una sola solicitud con Redis caído, **Redis vuelve a los
     15,003 s**, y se espera a que esa misma solicitud termine: lo hizo a los
     **17,7 s**, con 1.026 llamadas lógicas, **1.655 intentos HTTP y 921
     comandos** (4 fallos de lectura, 101 de escritura), 200 y Home entero. El
     doble recibió 1.655 y ejecutó 921: verificado. Cuando Redis vuelve, la
     solicitud en curso termina de guardar lo que le faltaba —incluido el
     Home— y la **siguiente es HIT** (F5c, F5d).
   - **Redis respondiendo 500 (F6):** el SDK no reintenta: 1.055 intentos,
     0 comandos, 3,1 s y el Home entero servido con **66 fallos de lectura y
     989 de escritura registrados** — la Etapa PREVIA (#21) funcionando bajo el
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
- Todo lo de §7 (línea base), con la coincidencia app ↔ dobles **verificada
  automáticamente en los 22 escenarios completos** (de 23 totales) y la
  repetibilidad; el escenario incompleto (F5a) está declarado como tal y no
  afirma coincidencia.
- Que el defecto del primer corredor era real (§7.5): reproducido sobre el JSON
  viejo y detectado por el módulo nuevo.
- Aislamiento entre solicitudes: unitario (concurrencia entrelazada, microtask,
  captura) y banco (B3).
- Intentos HTTP de Redis = 1 + reintentos, cotejado con el doble en F5b (1.655 = 1.655; comandos 921 = 921).
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
- Que en Vercel el F5a sería un 504: sale de `maxDuration = 60` y de que la
  solicitud no completó en 60 s en el banco; no se provocó en Vercel.
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
| `node --test lib/metricas.test.ts lib/tmdb-base.test.ts` final | **26/26** (24/24 en la primera versión; la segunda sumó los dos tests de la clave en la línea y de `[home] pedido`) |
| `node --test lib/banco-validacion.test.ts` antes de escribir el módulo | **RED**: `ERR_MODULE_NOT_FOUND` |
| `node --test lib/banco-validacion.test.ts` | **18/18** |
| Módulo nuevo aplicado al JSON de `ceeed75` | inválidos F5 y F5r; válidos los otros 22 |
| `node scripts/banco/correr.mjs` (corrida publicada) | **corrida VÁLIDA**, exit 0: 23 escenarios totales — 22 completos y 1 incompleto declarado (F5a) —, 1 reinicio de Next |
| `node --test lib/escritura-cache.test.ts` (#21, tras ajustar el nombre del campo de tiempo) | 18/18 |
| `npm test` (con `.next` de producción fresco) | **1409 tests: 1399 pasan, 0 fallos, 10 omitidos** (segunda versión; la primera: 1389/1379) |
| `npx tsc --noEmit` | limpio |
| `npm run build` **sin** entorno de banco, `.next` borrado antes | **exit 0 en 1 min 31 s**, `BUILD_ID bb_rE11uH6SxNRRBdKXlh`, sin aviso `[tmdb]` (segunda versión; la primera: 1 min 42 s, `fpFT9GAH5cM87aVGMB-0R`) |
| `npm run build` **con** `scripts/banco/entorno.sh` (el que corrió la línea base publicada) | exit 0 en 1 min 51 s |
| `git diff --check` | limpio |

Tests nuevos (44 = 20 de métricas + 6 de la base de TMDB + 18 de la validación del banco): el modelo y sus nombres; composición ≠ MISS; concurrencia
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
- **El aislamiento del banco depende de las líneas `pedido`/terminal.** Una
  ruta del Home que saliera por una excepción antes de la línea terminal
  dejaría un "activo" fantasma y forzaría un reinicio de Next (el corredor lo
  registra; no lo oculta). No pasó en la corrida publicada.
- **Los tiempos de pared del banco incluyen el arranque en frío de cada proceso
  de Next** sólo en el primer escenario tras un reinicio (F5b arrancó en un
  proceso nuevo): su tiempo de pared es comparable con el resto salvo por eso.
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

**La Etapa 0 vuelve a estar lista para la auditoría de Codex**, con estas
cuatro cosas señaladas para que las mire primero: (1) el punto de
instrumentación de los reintentos de Upstash (§4) y su cotejo en F5b (1.655 =
1.655); (2) la captura del batcher (§5), que cambia a quién se le anotan
hits/misses respecto del código anterior; (3) el corredor corregido (§7.5): el
aislamiento por pedidos/terminales con reinicio demostrado, la validación
automática y el tratamiento del escenario incompleto; (4) los dos hechos de
comportamiento de §7.4 (Redis caído de forma sostenida → no completa en 60 s;
Supabase inalcanzable → Home guardado), que no son de esta etapa arreglar pero
sí de esta etapa haber medido. No hay nada que mergear hasta que Codex audite.
