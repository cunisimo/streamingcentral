# Etapa 2 de capacidad — Turno distribuido y último Home bueno: auditoría y diseño

**Fecha:** 2026-09-13 — **versión 3**, revisada tras las auditorías de Codex de `7cfc979` (v1 → v2) y de `c8fc235` (v2 → v3), ver §0.
**Rama:** `diseno/etapa2-turno-ultimo-bueno`, nacida de `main` = `b60f985`
(worktree `wt-etapa2`). **Sólo documentación: sin código productivo, sin
infraestructura, sin variables, sin merge ni push.** Diseño **v3 aprobado por Codex**, precondición de Upstash **superada**
(§14) y **la Etapa 2 IMPLEMENTADA en la rama `feat/etapa2-turno-ultimo-bueno`
(§15), auditada por Codex y CORREGIDA en la misma rama dos veces (§16 y §17),
auditada sin hallazgos bloqueantes y **MERGEADA en `main` (`cd1f393`),
pendiente de push y deploy** (§18).**
**Antecedentes:** Etapa PREVIA (#21, [`2026-09-10-capacidad-trafico.md` §9](2026-09-10-capacidad-trafico.md)),
Etapa 0 ([`2026-09-11-etapa0-medir.md`](2026-09-11-etapa0-medir.md)),
Etapa 1 ([`2026-09-11-etapa1-canonizar-single-flight.md`](2026-09-11-etapa1-canonizar-single-flight.md)),
issue #17 y `feat/dia-rotacion` (revisada como antecedente, **no** como fuente).
**Decisión del dueño (13/09), aprobada:** se puede servir el Home anterior
durante la reconstrucción — es contenido público y se prefiere a una espera o
a un payload degradado.

> ⚠️ Lo que este diseño promete es **menos composiciones duplicadas entre
> instancias y contenido válido mientras una sola reconstruye**. No promete
> exclusión indefinida ("el turno es una optimización probabilística", informe
> §9 [R6]), no protege de una caída de Redis (§3.3.c), y no es capacidad medida
> de Producción.

---

## 0. Qué cambió en cada versión

### 0.a Versión 3 (auditoría de Codex sobre `c8fc235`)

| # | Hallazgo | Dónde se resolvió | Afirmación anterior descartada |
|---|---|---|---|
| 1 | El camino `sin-redis` terminaba en una escritura directa sin fencing: si Redis volvía durante la composición, A podía pisar la fresca, el UB y la generación publicados por B | §3.7: **no se guarda** ese resultado; sólo se sirve. Escenario E-sinredis-vuelve | "compone (single-flight local intacto), escribe por `guardarSinRomper`" (v2 §3.7 y §5.1 paso 3) |
| 2 | Liberar el turno apenas sale un degradado permitía, con solicitudes escalonadas, una reconstrucción degradada tras otra | §3.10: **enfriamiento**: el degradado convierte el turno en una marca de enfriamiento (`ENFRIAR`, atómico) que dura `ENFRIAMIENTO_MS`, y guarda el degradado en una clave aparte de vida corta que nunca se promociona. Escenarios E-rafaga con y sin UB | "Degradado → LIBERAR" (v2 §3.4, §3.9, §5.1 4d) y "una composición degradada por ventana de turno" sin mecanismo que lo sostuviera |
| 3 | La desigualdad de tiempos no era un deadline: nada cancelaba la espera ni la composición (F5a de la Etapa 0 dejó una composición viva pasados los 60 s) | §3.8: `AbortSignal` por solicitud que cancela la espera, la renovación y las llamadas a TMDB; qué NO se puede cancelar (los reintentos del SDK de Redis por solicitud) y **la promesa reducida**: el deadline vale con Redis respondiendo; con Redis caído se sigue en F5a hasta `maxDuration`. Escenario E-cancelacion | "ninguna solicitud completa supera `PRESUPUESTO_REQUEST_MS`" (v2 §6.14) como criterio universal |
| 4 | Fresca `v6`, UB `homeub…v1` y `gen` con versiones independientes de un mismo contrato de payload | §4.1: una sola `VERSION_HOME` en `lib/claves.ts` de la que derivan fresca, UB, generación, degradado y turno; subirla invalida las cinco familias juntas; los turnos quedan separados por versión durante un despliegue gradual. Tests en §9 | "`homeub:<huella>v1:…`" (v2 §4.1) |

Se conservan de la v2: adquisición durante la espera, fencing atómico de
publicación, estados diferenciados con reconciliación, UB ante degradación,
liberación segura y `EVAL` como condición obligatoria.

### 0.a-bis Tras la aprobación condicional (13/09)

Cuatro correcciones documentales mínimas pedidas por el dueño (§3.8 promesa
real antes de la desigualdad; §2/§5.7 "Redis caído puede terminar en timeout";
§4.2 período de adopción del UB; §5.3/§9.2 cancelación del líder con
seguidores) y la **precondición de Upstash ejecutada** (§14): `SET NX PX` y los
cuatro scripts reales contra la base real, con el payload real del Home,
resultados positivos y negativos, lectura posterior y limpieza. Lo que la
precondición **corrige** del diseño: el payload real de `n,d,m` mide **85.328
B** (no "100–150 KB"); y hay un **hallazgo de costo** para la implementación
(§14.6: leer tres copias en el HIT triplica los bytes del camino caliente).

### 0.a-ter Antes de implementar (13/09, tras la aprobación de la precondición)

Tres correcciones pedidas por el dueño: (1) **una carrera nueva, lectura →
turno** (§5.3, §5.1 paso 4.0): entre la lectura inicial y el `SET NX` otro
puede publicar la fresca y liberar; sin una segunda lectura, quien adquiere
recompone algo que ya existe. Después de **cada** adquisición —directa o
reconciliada— se vuelve a leer la fresca antes de componer; si apareció, no se
compone, se libera con `LIBERAR`, se sirve esa fresca y se anota
`origen = "fresca-tras-turno"`. Test RED que intercala exactamente esa
publicación (§9.2). (2) **Lecturas escalonadas** (§5.1, §5.5, §7): el camino
caliente lee **sólo la fresca**; `[ub, degradado]` se leen únicamente en el
MISS; la segunda lectura tras adquirir es sólo de la fresca; la espera sin
contenido conserva la lectura de las tres. Un HIT transfiere una sola copia.
(3) **Afirmación de aislamiento corregida** (§14.1): las operaciones Lua usaron
sólo claves temporales, pero el payload representativo salió de una solicitud
**normal** a Producción (`/api/home?providers=n,d,m`), que sí leyó —y, si la
clave hubiera estado fría, habría reconstruido— una clave normal del Home.

### 0.b Versión 2 (auditoría de Codex sobre `7cfc979`)

| # | Hallazgo | Dónde se resolvió |
|---|---|---|
| 1 | El seguidor sin último bueno sólo consultaba la copia fresca; con el propietario muerto, todos llegaban al tope y componían a la vez | §3.6 y §5.1: la espera **reintenta adquirir el turno** en cada vuelta; el rescate sólo existe con turno; al vencer el presupuesto sin turno se responde vacío degradado, no se compone sin turno |
| 2 | Faltaba un deadline integral del request contra `maxDuration = 60` | §3.8: presupuesto del request, regla de composición y test que la fija; los números definitivos salen del banco |
| 3 | Un propietario con resultado degradado y último bueno leído entregaba el degradado | §3.9: entrega el último bueno; el degradado sólo si no hay UB |
| 4 | Sin fencing de publicación: un propietario tardío podía pisar fresca/UB del siguiente, y a medianoche el UB del día nuevo | §4.3 `PUBLICAR`: atómico, compara propietario y generación (día) antes de escribir; §3.5 y §5.3 |
| 5 | `SET NX`, renovar y liberar no distinguían error de "ocupado"/"perdí"; una adquisición ejecutada con respuesta perdida quedaba como ajena | §4.4: tres estados por operación, reconciliación por `GET turno` y por la clave de generación |
| 6 | Existía una variante "sin liberación segura" si `EVAL` no estuviera | §4.5: `EVAL` es **condición obligatoria**; sin `EVAL` no se implementa este diseño |
| 7 | No estaba dicho dónde se leen fresca y UB ni cuántos MGET produce cada camino | §5.5 y §7: integración con `lib/home-vuelo.ts`, archivo por archivo, y tabla de costos recalculada |
| 8 | E-muere no tenía evidencia de "composición iniciada" independiente de la línea terminal | §6 y §8: línea `[home] compone …` al iniciar, contadores iniciadas/terminadas/interrumpidas por proceso, cotejados con los dobles |
| 9 | Faltaban controles RED para las carreras nuevas | §9: los ocho controles pedidos, con qué falla en cada uno |
| 10 | "36 h garantiza que siempre exista UB" era falso | §4.2: garantiza disponibilidad hasta 36 h desde la última publicación válida, y nada más |

---

## 1. Evidencia del comportamiento actual (archivo:línea, `main` = `b60f985`)

| Qué | Dónde | Consecuencia |
|---|---|---|
| Una sola copia del Home por clave, TTL 6 h | `lib/cache.ts:114` (`TTL.home = 60*60*6`), escrita en `lib/cache.ts:309` (`redis!.set(key, data, { ex: ttl })`) | Al vencer, **no queda nada**: la siguiente solicitud paga el rearmado completo y, mientras tanto, no hay contenido que servir |
| La clave del Home lleva la **semilla del día** | `lib/home.ts:667` (`claveHome(dailySeed(), p, t, HUELLA_IDIOMA)`), formato en `lib/claves.ts:58-60` (`home:<huella>v6:<semilla>:<providers>:<tipos>`) | A la medianoche argentina cambia la clave entera: **todas** las combinaciones arrancan frías a la vez |
| `dailySeed()` es un hash de la fecha, **no monotónico**; `hoyAR()` devuelve `YYYY-MM-DD` | `lib/fecha.ts:33-44` | La "generación" para el fencing tiene que ser el día (`hoyAR`), no la semilla (§4.3) |
| Leer → producir → guardar sin coordinación entre procesos | `lib/reparar-y-cachear.ts:39-44` | Dos instancias con la misma clave fría componen las dos |
| El single-flight es **por proceso**, con lectura previa **sólo de la fresca** | `lib/home-vuelo.ts:53-66` (`deps.leer(clave)` = `backendCache.leer`, un `batchGet`), cableado en `lib/home.ts:677-690` y `:739` | Dentro de una instancia, 100 → 1 (Etapa 1); entre instancias, N. La lectura previa es el punto donde entra el UB (§5.5) |
| Las lecturas se agrupan en un MGET por tick | `lib/cache.ts:199-283` (`batchGet`/`flush`, `LOTE = 100`) | Leer fresca y UB en el mismo tick cuesta **un** comando |
| Un degradado no se guarda | `lib/reparar-y-cachear.ts:43` (`if (!fallo) escribir`), predicado en `lib/home.ts:683-690` | Regla a extender: **un degradado tampoco promociona a UB** |
| La escritura fallida no rompe el request | `lib/cache.ts:294-323` → `guardarSinRomper` (`lib/escritura-cache.ts`) | Toda operación nueva entra por la misma política |
| Redis caído: lecturas capturadas, escrituras absorbidas | `lib/cache.ts:188-206`, `:231-283` | Decisión 7 |
| Ningún `SET NX`, `EVAL` ni segunda copia en `main` | `git grep -n "nx: true\|eval(" lib/` → nada | Todo lo de esta etapa es nuevo |
| El cliente instalado admite `SET … NX PX`, `EVAL`, `EVALSHA`, `SCRIPT LOAD` y `createScript` con fallback ante `NOSCRIPT` | `@upstash/redis` **1.38.0**: `SetCommand` (`nodejs.js:2058-2083`), `EvalCommand` (`:765`), `EvalshaCommand` (`:779`), `ScriptLoadCommand` (`:2037`), `Script.exec` (`:4340-4395`) | Las primitivas existen en el cliente; que Upstash las acepte **no se verificó** (§4.5) |
| El SDK reintenta sólo fallos de transporte, hasta 6 intentos | Etapa 0, §4 de su informe; `nodejs.js:191-212` | Una respuesta perdida de `SET NX` puede repetir el comando (§4.4) |
| `maxDuration = 60` en `/api/home` | `app/api/home/route.ts:14` | Cota dura de espera + composición + escritura (§3.8) |
| Composición medida | Producción: **4,05 s** un MISS (Etapa 0, una foto); banco: 2,1–2,7 s frío, 8 s con +100 ms de latencia (L1) | Evidencia para la duración del turno (§3.2) y el presupuesto (§3.8) |
| Antecedente `feat/dia-rotacion` | `tomarTurno` (`git show feat/dia-rotacion:lib/cache.ts:309-327`): `SET key 1 NX EX`, sin propietario, sin renovación, sin liberación, cae a "no rearmar" si Redis falla; atado a `fresh=1` | Se reusa la idea del `SET NX`; se descartan el resto y `fresh` |

---

## 2. Objetivo y lo que NO entra

Entra: turno distribuido por clave del Home; segunda copia "último bueno" (UB);
conservar el single-flight local; ningún degradado guardado ni promovido; Redis
caído **no produce un error lógico** (ninguna operación nueva lanza al handler,
§5.4) **pero sí puede terminar en timeout** (F5a: la solicitud agota
`maxDuration` y responde 504) — no se afirma que "no tumba la app"; servir el
Home anterior mientras uno reconstruye (aprobado). **No entra** (Etapa 3 y siguientes): reintentos de TMDB,
`Retry-After`, circuit breaker, CDN, límites por ruta. Tampoco `fresh=1`.

---

## 3. Las siete decisiones del #17, más las que la auditoría exigió

### 3.1 Propietario: un identificador único por composición

`propietario = <instancia>:<pid>:<contador>`; `instancia` es un `randomUUID()`
por proceso (Vercel no expone un id de instancia estable al runtime), `contador`
un entero por composición. Se anota en las líneas `[home]` para correlacionar.

### 3.2 Duración inicial del turno: 15 s, y de dónde sale

Evidencia: un MISS real en Producción tardó 4,05 s (una foto); banco 2,1–2,7 s
frío y 8 s con +100 ms por llamada; `maxDuration = 60`. **15 s ≈ 3,5× la única
medida real y ~2× el peor caso del banco.** Cota inicial que la renovación
vuelve poco crítica: corta obliga a renovar antes; larga bloquea hasta 15 s si
el constructor muere. Constante `TURNO_MS = 15_000`; **el banco la ejercita y
el informe de implementación dice con qué valor se midió.**

### 3.3 Renovación: cada `TURNO_MS / 3` mientras se compone, sólo si sigo siendo el propietario

`RENOVAR` (§4.3) cada 5 s: dos renovaciones perdidas seguidas dejan 5 s de
margen. Se corta al terminar la composición, al recibir `perdido` o al agotar
el presupuesto (§3.8). Un resultado `indeterminado` **no** corta ni marca
perdido: se reintenta en la siguiente vuelta (§4.4).

### 3.4 Liberación segura: sólo el propietario actual

Ya no hay `LIBERAR` suelto en el camino feliz: la liberación es parte de
`PUBLICAR` (§4.3), atómica con la escritura. `LIBERAR` queda para los caminos
sin publicación **que no son un degradado** (cancelación, error interno):
compare-and-delete, nunca `DEL` a secas. El degradado no libera: **enfría**
(`ENFRIAR`, §3.10), que también es compare-and-set sobre el propietario.

### 3.5 Muerte del constructor, y el propietario que termina tarde

Timeout, deploy o reciclado: no hay `finally`; el turno expira a los
`TURNO_MS` desde la última renovación y otro lo toma. Si el constructor seguía
vivo y termina después de perder el turno, **`PUBLICAR` es rechazado** (el
turno ya no es suyo): **no escribe fresca ni UB**, no renueva más, y le responde
a su propio usuario con lo que compuso (`origen = "propia-sin-publicar"`). La
composición duplicada existe y **se mide** (E-tarde): el turno sigue siendo
probabilístico; lo que ya no es probabilístico es **quién publica**.

### 3.6 Sin último bueno: esperar reintentando el turno, con presupuesto; nunca componer sin turno

Quien no obtuvo el turno y no tiene UB entra en un bucle con período
`ESPERA_MS`: (a) `MGET [fresca, ub, degradado]` — si aparece la fresca la sirve
(`esperada`); si apareció un UB (otro publicó) lo sirve; si apareció un
degradado compartido (§3.10) lo sirve; (b) intenta **adquirir
el turno** (`SET NX PX`) — si lo obtiene, **es el nuevo propietario y compone**
(un solo rescatista, por construcción); si está ocupado, sigue. El bucle
termina al agotarse el presupuesto de espera (§3.8): en ese punto, **si el
turno sigue ocupado por un propietario vivo que renueva, no se compone sin
turno**: se responde 200 con un payload vacío marcado `degradado: true` y
`motivo: "espera-agotada"`, sin escribir nada; la siguiente solicitud encontrará
la fresca o el UB. Es el último recurso, ocurre sólo sin UB y con una
composición ajena más larga que el presupuesto, y **se mide** cuántas veces
pasa en el banco. Alternativas descartadas: componer todos al tope (lo que la
auditoría señaló: estampida sin turno), esperar sin tope (cuelgue hasta
`maxDuration`), 503 (rompe la experiencia sin dar nada más que el vacío).

### 3.7 Redis no disponible: componer sin coordinar, servir, y NO guardar

Si `tomar` da `indeterminado` y la reconciliación tampoco responde, la solicitud
compone (single-flight local intacto), **sirve** lo compuesto y anota
`turno = "sin-redis"`. **No escribe fresca, UB ni generación.** La carrera que
lo exige (reproducida en el banco, E-sinredis-vuelve): A no puede tomar el turno
y compone; Redis vuelve; B toma el turno y publica; A termina después. Con una
escritura directa, A pisaría lo de B sin ningún fencing. Alternativa evaluada y
descartada: que A, al terminar, intente `tomar` y publique por `PUBLICAR` — es
segura contra el turno pero **no** contra la generación del mismo día: A
tomaría el turno ya libre y `PUBLICAR` aceptaría su payload más viejo sobre el
de B. Sin un número de generación por composición (fuera de alcance), lo
correcto es no guardar. Costo: mientras Redis está caído nada queda cacheado,
que es lo que pasa hoy (`guardar` falla igual). Con Redis "flapeando" puede
haber composiciones duplicadas: se aceptan y se miden. Las lecturas de grano
fino del composer (`pv3:` etc., `cached()`) siguen escribiendo como siempre: no
son el contrato del Home.

### 3.8 Deadline integral del request

**La promesa real, antes que la desigualdad:** el deadline se cumple **cuando
Redis responde**. Con Redis caído o flapeando **sigue existiendo el
comportamiento F5a** (Etapa 0): la solicitud puede agotar `maxDuration = 60` y
terminar en 504, porque los reintentos del SDK no se cancelan por solicitud
(tabla más abajo). La desigualdad que sigue acota espera + composición +
publicación **dentro de esa promesa**, no la reemplaza:

```
PRESUPUESTO_REQUEST_MS = 60_000 − MARGEN_MS                      (MARGEN_MS = 10_000: arranque frío, red, serialización)
TOPE_ESPERA_MS + COMPOSICION_MAX_MS + PUBLICACION_MAX_MS ≤ PRESUPUESTO_REQUEST_MS
```

- `COMPOSICION_MAX_MS` y `PUBLICACION_MAX_MS` **salen del banco**: el máximo
  observado de la composición (hoy 8 s en L1, 4 s en Producción) y de
  `PUBLICAR` (un EVAL con el payload como argumento), cada uno con su factor
  de seguridad declarado.
- `TOPE_ESPERA_MS` es lo que sobra: con 8 s × 2 de composición y 1 s de
  publicación, ≈ 33 s. Provisorio: **20 s**, a confirmar con E-primera-vez.
- Un **test puro** fija la desigualdad con las constantes del módulo (falla si
  alguien sube la espera sin bajar otra cosa), y el banco publica los tres
  máximos medidos. Un rescatista que adquiere el turno tarde tiene además su
  propio presupuesto restante: si `restante < COMPOSICION_MAX_MS`, no compone
  y responde vacío degradado (no arranca algo que va a morir en 504).

**La desigualdad no es un deadline: hace falta una cancelación.** F5a (Etapa 0)
lo mostró: con Redis caído, una composición siguió viva más allá de los 60 s.
Lo que cancela, y hasta dónde llega:

| Qué | Cómo se cancela | Alcance |
|---|---|---|
| La espera del seguidor (§3.6) | `AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)` creado en `homePayload`; el bucle lo consulta en cada vuelta y `dormir` lo respeta | Total |
| La renovación del turno | el temporizador se limpia al abortar | Total |
| Las llamadas a TMDB de la composición | `lib/tmdb.ts` recibe la señal de la solicitud por el scope (`AsyncLocalStorage`, como las métricas) y la combina con su timeout propio (`AbortSignal.any([solicitud, timeout(8000)])`); al abortar, cada `fetch` rechaza, `safe()` cuenta el fallo y la composición **termina degradada en el orden de milisegundos**, sin publicar | Total (cambio mecánico de una línea en `tmdb()`, dentro del alcance) |
| Las consultas a Supabase | el `fetch` del cliente de servidor puede recibir la misma señal | Total |
| **Los reintentos del SDK de Redis** | **no cancelables por solicitud**: el cliente acepta una `signal` sólo global (`nodejs.js:130`, `:165`), no por comando, y cada comando reintenta hasta 6 veces con backoff | **Ninguno** en esta etapa |

Una composición abortada por la señal **no** es un degradado de TMDB: no
enfría (§3.10), libera el turno (`LIBERAR`), no escribe, y responde UB si hay o
vacío marcado `motivo = "cancelada"`. Las promesas que queden en vuelo (un
`fetch` abortando, un `SET` de grano fino) terminan solas; nada las espera.

🔴 **Promesa reducida, y así queda escrita:** el deadline integral se cumple
**cuando Redis responde** (bien o con error HTTP, que el SDK no reintenta).
**Con Redis caído o flapeando, la solicitud puede seguir hasta `maxDuration`**
exactamente como en F5a: las cadenas de reintentos del SDK (hasta ~4,3 s por
comando, cientos de comandos por composición) no se pueden cortar desde una
solicitud sin un cliente por solicitud o un `retry` global más corto — y
cambiar la política de reintentos de Redis es de la Etapa 3, no de esta. El
criterio de aceptación §6.14 dice eso y no otra cosa.

### 3.9 Degradado con último bueno: se entrega el último bueno

El propietario lee `[fresca, ub, degradado]` antes de tomar el turno. Si su
composición sale degradada y **había UB**, responde el UB (`origen =
"ultimo-bueno"`, `degradadoDescartado: true`), no publica nada y **enfría**
(§3.10). Sólo si no hay UB se entrega el degradado. Es la decisión del dueño
aplicada también al que compuso.

### 3.10 Enfriamiento tras un degradado: el turno no se libera, se convierte

Liberar el turno apenas sale un degradado (v2) no sostenía "una composición
degradada por ventana": con solicitudes **escalonadas** —una cada segundo, TMDB
caído— cada una encontraba el turno libre y volvía a componer. Ahora, ante un
degradado, el propietario ejecuta `ENFRIAR` (§4.3): en una operación atómica y
sólo si el turno sigue siendo suyo, (a) reescribe el turno con el valor
`enfriando:<propietario>` y `PX ENFRIAMIENTO_MS`, y (b) guarda el payload
degradado en `home:degradado:…` con el mismo vencimiento. Efectos:

- `SET NX` de cualquier otro **falla** durante el enfriamiento (la clave existe)
  y la reconciliación (`GET turno` ≠ mío) devuelve `ocupado`: nadie compone.
- Quien encuentra `ocupado` sirve, en este orden, fresca → UB → **degradado
  compartido** (`origen = "degradado-compartido"`): con UB se ve el Home
  anterior; sin UB se ve el mismo degradado que compuso el propietario, no un
  Home vacío ni una espera.
- El degradado **nunca se promociona**: vive en su clave, con vida corta, y
  `PUBLICAR` no lo mira.
- `ENFRIAMIENTO_MS = TURNO_MS` (15 s) como valor inicial, **a medir** en
  E-rafaga: cota superior de composiciones degradadas = ⌈duración de la caída /
  `ENFRIAMIENTO_MS`⌉ por clave. No es la política de reintentos de la Etapa 3
  (`Retry-After`, circuito, backoff creciente): es sólo el freno mínimo que
  hace verdadera la frase "una por ventana".
- Una composición **cancelada** por la señal (§3.8) no enfría: libera.

---

## 4. Representación, claves, TTL y operaciones

### 4.1 Cinco claves, una sola versión

Hoy la versión del contrato del payload está escrita adentro de `claveHome`
(`lib/claves.ts:59`: el literal `v6`). Pasa a una constante única,
`VERSION_HOME = 6`, y **todas** las familias del Home la toman de ahí:

| Copia | Clave (constructores en `lib/claves.ts`) | Vive | Quién la escribe |
|---|---|---|---|
| **Fresca** | `home:<huella>v${VERSION_HOME}:<semilla>:<providers>:<tipos>` — bytes idénticos a hoy | `TTL.home` = 6 h | `PUBLICAR` |
| **Último bueno (UB)** | `home:ub:<huella>v${VERSION_HOME}:<providers>:<tipos>` — **sin semilla** | `TTL.homeUltimoBueno` (§4.2) | `PUBLICAR` |
| **Generación del UB** | `home:gen:<huella>v${VERSION_HOME}:<providers>:<tipos>` = `"<YYYY-MM-DD>:<propietario>"` | igual que el UB | `PUBLICAR` |
| **Degradado compartido** | `home:degradado:<huella>v${VERSION_HOME}:<semilla>:<providers>:<tipos>` | `ENFRIAMIENTO_MS` | `ENFRIAR` |
| **Turno** | `home:turno:<huella>v${VERSION_HOME}:<semilla>:<providers>:<tipos>` = `<propietario>` o `enfriando:<propietario>` | `TURNO_MS` / `ENFRIAMIENTO_MS` | `SET NX PX`; `RENOVAR`; `PUBLICAR`/`LIBERAR` lo borran; `ENFRIAR` lo convierte |

**Por qué una sola versión:** el UB y el degradado son el **mismo contrato de
payload** que la fresca; si cambia el contenido (v7), un UB v6 servido a un
cliente que espera v7 es exactamente el bug que la versión existe para
impedir. Subir `VERSION_HOME` invalida las cinco familias juntas (test en §9).
La v2 tenía `homeub…v1` aparte: **descartado**.

**Despliegue gradual con dos versiones coexistiendo:** durante un rollout de
Vercel conviven instancias v6 y v7. Cada versión tiene **su** turno
(`home:turno:…v6…` y `…v7…`), su fresca, su UB y su degradado: las v6
coordinan entre ellas y las v7 entre ellas; ninguna lee ni publica claves de la
otra. El costo es una composición extra por versión durante el rollout (como
hoy con la fresca), y ningún cruce de contratos.

**Por qué el UB no lleva la semilla:** la semilla cambia a la medianoche
argentina y con ella la clave fresca de todas las combinaciones (`lib/home.ts:667`);
un UB con semilla no existiría en el primer minuto del día, que es cuando más
hace falta. Sin semilla, se sirve el Home de ayer durante los segundos que tarda
el de hoy — **aprobado por el dueño**. Lleva la huella de idioma como las otras
familias (rollback de idioma).

**Por qué hace falta la generación:** el UB sin semilla es compartido entre
días, así que un propietario de ayer que termina tarde podría pisar el UB de
hoy. La generación (`home:gen`, §4.1) guarda el **día** (`hoyAR()`,
`YYYY-MM-DD`, monotónico —la semilla es un hash y no sirve para comparar) y el
propietario que publicó; `PUBLICAR` rechaza si el día guardado es mayor que el suyo. El propietario en
`gen` es además lo que permite reconciliar una publicación con respuesta
perdida (§4.4).

**Por qué el turno y el degradado sí llevan la semilla:** coordinan (o
sustituyen por unos segundos) la composición de **esa** clave fresca; a la
medianoche la composición de hoy no espera a un turno de ayer ni sirve un
degradado de ayer — para eso está el UB.

### 4.2 TTL del último bueno: 36 h, y lo que garantiza

**Período de adopción tras el deploy.** Las frescas `…v6…` que ya existan en
Redis siguen siendo HIT (bytes idénticos, §4.1) y **no crean un UB por sí
solas**: el UB sólo lo escribe `PUBLICAR`, y `PUBLICAR` sólo corre al final de
una composición con turno. Cada combinación obtiene su UB **en su primera
reconstrucción posterior al deploy** (cuando venza su fresca, ≤ 6 h; o en su
primer MISS si no estaba cacheada). Hasta entonces, para esa combinación, la
Etapa 2 se comporta como la Etapa 1 más el turno: quien vence la fresca
compone; los demás esperan (§3.6) en vez de recibir un UB. **Decisión: se
acepta esa ventana.** No hay regresión respecto de hoy (hoy tampoco hay UB) y
dura como mucho un TTL de la fresca. **No se agrega ninguna escritura a los
HIT** para "sembrar" el UB: un HIT sigue costando 0 comandos de escritura
(§7), y sembrar desde un HIT significaría copiar a UB un payload cuya
generación no se conoce. Si el dueño quiere acortar la ventana para las
combinaciones principales, el instrumento ya existe y es una decisión aparte:
`scripts/precalentar-home.mjs --aplicar` después del deploy (compone con turno
y por lo tanto publica UB); no forma parte de esta etapa.

36 h = 6 h de la fresca + 24 h de un día entero + 6 h de margen. **Garantiza que
haya UB durante 36 h desde la última publicación válida de esa combinación, y
nada más:** una combinación que nadie pide durante más de 36 h vuelve a
arrancar sin UB (§3.6). No es "siempre hay UB". Es un cálculo, no una medición;
la cuota (§7) y E3 lo ejercitan.

### 4.3 Operaciones atómicas y el contrato Lua

| Operación | Comando | Atómico sin Lua | Resultado |
|---|---|---|---|
| Tomar | `SET turno <propietario> NX PX <TURNO_MS>` | Sí | `"OK"` → adquirido; `null` → ocupado (o mío con respuesta perdida: §4.4) |
| Reconciliar | `GET turno` | Sí | `== propietario` → mío |
| Renovar | `EVAL RENOVAR 1 turno <propietario> <TURNO_MS>` | **No** | `1` renovado; `0` perdido |
| **Publicar** | `EVAL PUBLICAR 4 turno fresca ub gen <propietario> <fresca_json> <ttl_fresca> <ub_json> <ttl_ub> <dia>` | **No** | `1` publicado (fresca, UB y gen escritos, turno borrado); `0` rechazado (turno ajeno, o gen de un día posterior); `-1` publicada sólo la fresca porque gen es de un día posterior (ver script) |
| Liberar (cancelación, error) | `EVAL LIBERAR 1 turno <propietario>` | **No** | `1` liberado; `0` no era mío |
| **Enfriar** (degradado) | `EVAL ENFRIAR 2 turno degradado <propietario> <degradado_json> <enfriamiento_ms>` | **No** | `1` enfriado; `0` no era mío (nada escrito) |
| Leer | `MGET fresca ub degradado` | Sí | Un comando, batcheado con el resto de la solicitud |

```lua
-- RENOVAR: KEYS[1]=turno · ARGV[1]=propietario · ARGV[2]=ms
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end

-- LIBERAR: KEYS[1]=turno · ARGV[1]=propietario
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end

-- ENFRIAR: KEYS[1]=turno, KEYS[2]=degradado · ARGV[1]=propietario · ARGV[2]=degradado_json · ARGV[3]=ms
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], 'enfriando:' .. ARGV[1], 'PX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
return 1

-- PUBLICAR: KEYS = turno, fresca, ub, gen · ARGV = propietario, fresca_json, ttl_fresca_s, ub_json, ttl_ub_s, dia
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end            -- fencing por propietario
local gen = redis.call('GET', KEYS[4])
local diaGuardado = gen and string.sub(gen, 1, 10) or ''
if diaGuardado > ARGV[6] then                                          -- fencing por generación (medianoche)
  redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])                   -- la fresca de MI día sí vale
  redis.call('DEL', KEYS[1])
  return -1
end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('SET', KEYS[3], ARGV[4], 'EX', ARGV[5])
redis.call('SET', KEYS[4], ARGV[6] .. ':' .. ARGV[1], 'EX', ARGV[5])
redis.call('DEL', KEYS[1])
return 1
```

Notas: `fresca_json` y `ub_json` son el **mismo** payload serializado (dos
argumentos para no depender de que Lua lo copie: **medido el 13/09: 85.328 B**
el payload real de `n,d,m`, o sea un `PUBLICAR` de **195.211 B** de cuerpo, que
la base real aceptó — §14; el límite de tamaño de petición del plan sigue sin
conocerse: sólo se sabe que es ≥ 195 KB). La comparación de días es
lexicográfica sobre `YYYY-MM-DD`, que ordena bien. Los cuatro scripts se cargan
con `redis.createScript(...)` una vez por proceso y se ejecutan con `.exec()`
(`EVALSHA`; ante `NOSCRIPT` el propio cliente reintenta con `EVAL`,
`nodejs.js:4389-4395`). Las cuatro claves de `PUBLICAR` viven en la misma base
(Upstash no es cluster para este plan; **a confirmar en el panel** junto con
`EVAL`).

**Alternativa sin Lua, descartada:** `SET … XX PX` para renovar y `DEL` para
liberar pisan o borran el turno ajeno tras un vencimiento; y sin `PUBLICAR`
atómico un propietario tardío pisa la fresca y el UB del siguiente. Es
exactamente lo que la auditoría pidió impedir.

### 4.4 Estados diferenciados y reconciliación

Cada operación devuelve **tres** clases de resultado, y el error de transporte
nunca se confunde con "ocupado" ni con "perdí":

| Operación | Éxito | Negativo | Indeterminado (excepción, timeout, respuesta perdida) | Qué se hace ante indeterminado |
|---|---|---|---|---|
| `tomar` | `adquirido` | `ocupado` | `indeterminado` | **Reconciliar**: `GET turno`; si `== propietario` → `adquirido` (la respuesta se perdió y el comando ejecutó; el SDK pudo reintentar y recibir `null` por SU propio turno); si distinto → `ocupado`; si el `GET` también falla → `sin-redis` (§3.7) |
| `tomar` con `null` | — | `ocupado` | — | **También se reconcilia con `GET turno`** sólo en el camino frío: cuesta 1 comando y evita que un turno propio con respuesta perdida quede huérfano 15 s |
| `renovar` | `renovado` | `perdido` (script devolvió `0`) | `indeterminado` | Seguir componiendo; reintentar en la vuelta siguiente; **no** marcar perdido. Sólo `0` marca perdido |
| `publicar` | `publicado` / `publicada-solo-fresca` | `rechazado` (`0`) | `indeterminado` | Reconciliar: `GET gen`; si termina en `:<propietario>` → publicado; si no y `GET turno == propietario` → el script no corrió: reintentar `PUBLICAR` una vez; si el turno no es mío y gen no es mío → rechazado |
| `liberar` | `liberado` | `no-era-mio` | `indeterminado` | Nada: el turno vence solo |
| `enfriar` | `enfriado` | `no-era-mio` (`0`) | `indeterminado` | Nada: el turno vence solo; el degradado se sirve igual al usuario que lo compuso |

Un `indeterminado` en `renovar`, `publicar` o `liberar` **nunca habilita una
operación insegura** (no hay `SET XX` ni `DEL` de respaldo): lo peor que pasa es
un turno que vence solo o una publicación reintentada por el mismo script
idempotente (si ya publicó, la segunda ejecución encuentra el turno borrado y
devuelve `0`, y la reconciliación por `gen` lo aclara).

### 4.5 `EVAL` es condición obligatoria — sin fallback — **VERIFICADA el 13/09**

Este diseño **no se implementa** si la base real no acepta `EVAL`/`EVALSHA` con
cuatro claves: no existe variante sin liberación y publicación seguras.

- **Verificado (código):** el cliente 1.38.0 envía `SET … NX PX`, `EVAL`,
  `EVALSHA`, `SCRIPT LOAD`, y `Script.exec` maneja `NOSCRIPT`.
- **Verificado (ejecutado, §14):** la base real que usa Producción acepta
  `EVAL "return 1" 0`, `EVALSHA` con `NOSCRIPT` → `EVAL` de respaldo, y los
  cuatro scripts del diseño **tal como están escritos en §4.3** (`PUBLICAR` con
  cuatro claves y un cuerpo de 195 KB), con los resultados positivos y
  negativos esperados: 48 pasos, 48 correctos, 60 comandos HTTP, ningún error.
  Las credenciales de Redis son variables *Sensitive* de Vercel (el CLI no las
  puede bajar: `vercel env pull` escribe `[SENSITIVE]`), así que la única vía
  fue un Preview descartable y protegido; el detalle está en §14.
- **El doble de Redis del banco** implementa **exactamente esos cuatro scripts**
  por texto (no un intérprete Lua): prueba la lógica de carreras, no la
  compatibilidad con Upstash.

---

## 5. El algoritmo: propietario y seguidor

### 5.1 Secuencia de una solicitud (el líder del single-flight local)

```
 0. t0 = ahora; señal = AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)          (§3.8)
 1. GET fresca                                            (UNA copia: el camino caliente)
 2. fresca            → servir; cache=hit; fin
 2b. MISS → MGET [ub, degradado]                          (1 comando, sólo acá)
 3. tomar (SET NX PX) → adquirido | ocupado | indeterminado→reconciliar (§4.4)
    sin-redis         → componer sin coordinar; SERVIR; NO guardar nada; turno="sin-redis"; fin   (§3.7)
 4. adquirido (directo o reconciliado):
    4.0 GET fresca otra vez (carrera lectura → turno, §5.3): si apareció →
        LIBERAR; servir esa fresca; origen=fresca-tras-turno; NO componer; fin
    4a. log "[home] compone <clave> <propietario>"       (evidencia de composición iniciada, §6)
    4b. renovación cada TURNO_MS/3 (RENOVAR); `perdido` → seguir componiendo, no publicar
    4c. componer (single-flight local delante; la señal llega a TMDB y Supabase)
    4d. cancelada (señal) → LIBERAR; servir ub si hay, si no vacío (motivo=cancelada); nada escrito
    4e. degradado → ENFRIAR (turno → enfriando, degradado guardado aparte, §3.10);
                    servir ub si hay (origen=ultimo-bueno, degradadoDescartado), si no el degradado
    4f. bueno → PUBLICAR: publicado → servir (origen=propia)
                          rechazado → servir (origen=propia-sin-publicar)   ← perdió el turno: no pisa nada
                          indeterminado → reconciliar por gen/turno (§4.4); servir
 5. ocupado (turno ajeno o enfriando):
    5a. ub → servir ub; cache=ultimo-bueno; fin            (no espera, no compone)
    5b. degradado compartido → servir (origen=degradado-compartido); fin
    5c. sin nada → bucle cada ESPERA_MS mientras !señal.aborted && ahora − t0 < TOPE_ESPERA_MS:
          MGET [fresca, ub, degradado]: fresca → servir (esperada); ub → servir; degradado → servir
          tomar: adquirido → ir a 4 (con su 4.0) si el presupuesto restante ≥ COMPOSICION_MAX_MS,
                              si no: LIBERAR y responder vacío degradado (espera-agotada)
        al agotarse o abortar: responder 200 vacío degradado (motivo espera-agotada | cancelada), sin escribir
```

Los seguidores del single-flight local reciben lo que el líder sirvió y anotan
`esperasCompartidas` (Etapa 1, sin cambios).

### 5.2 Máquina de estados del turno

```
                  tomar=adquirido                 RENOVAR=1 (cada TURNO_MS/3)
   [libre] ─────────────────────▶ [mío] ◀──────────────────────────────┐
      ▲                            │ │                                  │
      │  PUBLICAR=1 / LIBERAR=1    │ │ vence sin renovar / RENOVAR=0    │
      └────────────────────────────┘ └──────────▶ [perdido] ────────────┘ (otro puede tomarlo)
      ▲                            │                │
      │ vence ENFRIAMIENTO_MS      │ ENFRIAR=1      └─ sigo componiendo; PUBLICAR=0 / ENFRIAR=0 (no escribo); sirvo a mi usuario
      └──────── [enfriando] ◀──────┘   (degradado; SET NX de otros = null; sirven UB o degradado compartido)
   indeterminado en cualquier arista: reconciliar; nunca cambia de estado por sí solo
```

### 5.3 Las carreras, una por una

| Carrera | Qué pasa | Por qué no rompe |
|---|---|---|
| Dos instancias `SET NX` a la vez | una `OK`, otra `null` | atómico |
| **Lectura → turno:** A lee fresca ausente; B publica la fresca y libera; A hace `SET NX`, lo obtiene y compondría de nuevo | tras **cada** adquisición (directa o reconciliada) A vuelve a leer la fresca; si apareció, `LIBERAR`, sirve esa fresca, `origen = fresca-tras-turno`, cero composiciones | §5.1 paso 4.0; test RED que intercala exactamente esa publicación entre la lectura y el `SET NX`, y su variante con adquisición reconciliada tras respuesta perdida |
| `SET NX` ejecutó, respuesta perdida, el SDK reintentó y recibió `null` | `tomar` reconcilia con `GET turno == propietario` → adquirido | §4.4; sin reconciliación el turno propio quedaría huérfano 15 s |
| El turno vence a mitad (renovaciones perdidas) y otro lo toma | dos composiciones; **una sola publica** (`PUBLICAR` compara propietario) | fencing; medido en E-tarde |
| Propietario de ayer termina después de que el de hoy publicó el UB | `PUBLICAR` ve `gen` con día mayor → **no toca el UB**; escribe sólo su fresca (clave de ayer, ya inútil) y devuelve `-1` | fencing por generación (§4.3); medido en E-medianoche |
| Propietario muere antes de publicar | turno vence; con UB, se sirve UB y el siguiente que adquiere compone; sin UB, los que esperan reintentan `tomar` cada vuelta y **exactamente uno** lo adquiere al vencer | §3.6; medido en E-muere |
| Todos sin UB y el propietario vivo tarda más que el tope | responden vacío degradado; **nadie compone sin turno** | §3.6; medido |
| Degradado con UB | el propietario sirve UB; nada se publica; el turno pasa a `enfriando` | §3.9, §3.10 |
| Degradado sin UB, TMDB caído, solicitudes **escalonadas** | la primera compone y enfría; las siguientes encuentran `ocupado` y sirven el degradado compartido; al vencer el enfriamiento, **una** vuelve a componer | §3.10; medido en E-rafaga (con y sin UB) |
| `sin-redis`: A compone sin turno, Redis vuelve, B toma el turno y publica, A termina después | A sirve lo suyo y **no escribe nada**; la fresca, el UB y la generación siguen siendo de B | §3.7; medido en E-sinredis-vuelve |
| La señal de la solicitud aborta en plena composición | TMDB/Supabase rechazan, la composición termina degradada en ms, se marca `cancelada`, se libera (no enfría), se sirve UB o vacío | §3.8; medido en E-cancelacion |
| El líder del single-flight local es cancelado con seguidores en vuelo | todos reciben el mismo resultado compartido; nadie recompone; el turno queda libre para la siguiente solicitud | §9.2; E-cancelacion con N simultáneas |
| Rollout con dos versiones | cada versión coordina y publica en sus propias claves | §4.1; test de familias en §9 |
| `PUBLICAR` con respuesta perdida | reconciliación por `gen` (`:<propietario>`) o reintento idempotente | §4.4 |
| Escritura falla dentro de `PUBLICAR` (Redis responde error) | el script no corrió: nada escrito, turno sigue mío hasta vencer; la solicitud sirve lo compuesto; el siguiente vuelve a intentar | `guardarSinRomper` en el wrapper; Etapa PREVIA |
| Dos claves distintas | turnos distintos | no se bloquean |
| Medianoche con tráfico | fresca y turno cambian de clave; el UB de ayer se sirve hasta que uno publica el de hoy; `gen` sube al día nuevo | aprobado por el dueño |

### 5.4 Interacción con `AsyncLocalStorage`, métricas y `guardarSinRomper`

- El temporizador de renovación nace dentro del scope del propietario y sus
  comandos se anotan a él. Los seguidores locales no ven nada de esto.
- Comandos nuevos por `anotar` (`llamadasLogicas`, `intentosHttp`, `comandos`);
  el `backoff` instrumentado cubre sus reintentos.
- `SET NX`, `RENOVAR`, `PUBLICAR`, `ENFRIAR`, `LIBERAR` y la reconciliación entran por un
  wrapper con la misma política que `guardarSinRomper`: un fallo se registra en
  `redis.fallos` y devuelve `indeterminado`; nunca sube al handler.
- Campos nuevos en `MetricasRequest.home`: `turno: "adquirido" | "ocupado" |
  "sin-redis" | "reconciliado" | null`, `renovaciones`, `turnoPerdido`,
  `publicacion: "publicado" | "publicada-solo-fresca" | "rechazado" |
  "indeterminado" | null`, `origen: "fresca" | "ultimo-bueno" | "esperada" |
  "propia" | "propia-sin-publicar" | "vacio-espera-agotada" | "compartida"`,
  `esperaMs`, `degradadoDescartado`, `enfriado: boolean`, `cancelada: boolean`.
  `origen` suma `degradado-compartido` y `sin-redis`. `cache` conserva `hit |
  miss | compartida` y suma `ultimo-bueno`, `esperada`, `vacio`. La línea
  `[home]` los imprime, y la línea `[home] compone <clave> <propietario>` sale al
  iniciar la composición.
- La señal de cancelación viaja por el mismo scope (`AsyncLocalStorage`) que
  las métricas: `lib/tmdb.ts` y el `fetch` de `supabaseServer()` la leen de ahí
  sin cambiar sus firmas.

### 5.5 Integración con `lib/home-vuelo.ts`: dónde se lee qué, y qué archivo cambia

Hoy `crearVueloHome` hace **una** lectura previa (`deps.leer(clave)` →
`backendCache.leer` → `batchGet`, `lib/home-vuelo.ts:56`) y, si falta, entra al
vuelo local con `deps.resolver` = `cachedLocIf` (`lib/home.ts:679-689`).

| Archivo | Cambio |
|---|---|
| `lib/home-vuelo.ts` | La lectura previa **sigue siendo sólo la fresca** (una copia). Si hay fresca: hit. Si no, el vuelo local sigue igual; lo que cambia es **qué resuelve el líder**: en vez de `cachedLocIf` (que escribiría la fresca sin fencing), `home-servir`, que lee `[ub, degradado]` recién en el MISS |
| `lib/tmdb.ts`, `lib/supabase.ts` | `AbortSignal.any([señalDeLaSolicitud, timeout(8000)])` en el `fetch`, leyendo la señal del scope; sin señal en el scope, comportamiento idéntico al actual |
| `lib/home-servir.ts` (**nuevo**, puro) | La secuencia §5.1 con deps inyectadas: `tomar`, `renovar`, `publicar`, `liberar`, `leer`, `producir`, `ahora`, `dormir`. Es lo que se prueba en RED |
| `lib/turno.ts` (**nuevo**, puro) | Estados y reconciliación de §4.4 sobre deps `setNx`, `get`, `eval` |
| `lib/cache.ts` | `tomarTurno`, `renovarTurno`, `publicarHome`, `liberarTurno`, `leerTurno` sobre el cliente real (con emulación sobre `mem` sin Redis), todo por `anotar` y por el wrapper de fallos; `TTL.homeUltimoBueno` |
| `lib/claves.ts` | `VERSION_HOME` única; `claveHome` la usa; `claveHomeUltimoBueno`, `claveHomeGeneracion`, `claveHomeDegradado`, `claveTurnoHome` (+ `lib/claves.test.ts`, §9) |
| `lib/home.ts` | `servirHome` cablea las deps reales; `homeKey` sin cambios; el productor emite la línea `compone` |
| `lib/metricas.ts` | campos de §5.4 y la línea |
| `lib/reparar-y-cachear.ts`, `lib/escritura-cache.ts`, `lib/single-flight.ts` | **sin cambios** |

**MGET reales por camino** (después del batcher):

| Camino | MGET | Otros comandos |
|---|---|---|
| HIT de la fresca | 1 lectura de **una** copia (§14.6 aplicado) | 0 |
| Propietario, sin renovar | 1 (fresca) + 1 (`[ub, degradado]`) + 1 (fresca, paso 4.0) | `SET NX` 1 + `PUBLICAR` 1 |
| Propietario con renovaciones | 3 | + `RENOVAR` × r |
| Adquirió pero la fresca ya estaba (`fresca-tras-turno`) | 3 | `SET NX` 1 + `LIBERAR` 1; **0 composiciones** |
| Ocupado con UB | 2 | `SET NX` 1 + `GET turno` 1 (reconciliación del `null`) |
| Espera sin UB, `k` vueltas | 2 + k (las tres copias por vuelta) | `SET NX` (1 + k) + `GET turno` (1 + k) |
| Degradado con turno | 3 | `SET NX` 1 + `ENFRIAR` 1 (+ renovaciones) |
| Ocupado por enfriamiento | 2 | `SET NX` 1 + `GET turno` 1; sirve UB o degradado compartido |
| Cancelada | 3 | `SET NX` 1 + `LIBERAR` 1 (+ renovaciones) |
| Redis caído | 0 confirmados; **nada escrito** | intentos fallidos (Etapa 0) |

### 5.6 Una instancia, varias, y Redis en memoria

Una instancia: el single-flight local ya da una composición; el turno suma
~3 comandos por composición y 0 por HIT; el UB sí aporta (vencimiento y
medianoche). Varias: el beneficio de la etapa — 1 composición por ventana,
K−1 instancias sirviendo UB o esperando. Memoria (desarrollo): turno, UB y gen
emulados sobre `mem`; sólo prueba la secuencia. El banco usa el doble REST,
compartido entre procesos.

### 5.7 Qué ve el usuario

| Escenario | Hoy | Con la Etapa 2 |
|---|---|---|
| Fresca en caché | HIT, ~30 ms | igual |
| Fresca vencida, con UB | rearmado (2–8 s) | **UB en tiempo de HIT**; el que tomó el turno paga el rearmado y recibe lo nuevo |
| Misma clave fría en varias instancias | K rearmados | 1 rearmado; los demás UB, o espera acotada sin UB |
| Medianoche | todos rearman | UB de ayer hasta que uno publica el de hoy (aprobado) |
| TMDB caído | degradado por solicitud | quien compuso: UB si hay, degradado si no; los demás durante el enfriamiento: UB, o el mismo degradado compartido (sin espera); una composición degradada por `ENFRIAMIENTO_MS` |
| Redis caído y vuelve a mitad | lo compuesto se guardaba sin fencing | lo compuesto se sirve y no se guarda; el siguiente con turno publica |
| Sin UB y el propietario tarda más que el tope | — | Home vacío marcado degradado, una vez; la siguiente carga encuentra fresca o UB |
| Redis caído | rearmado por solicitud, lento; puede agotar `maxDuration` (504, F5a) | igual, marcado, y sin guardar nada; **el 504 por timeout sigue siendo posible** |

---

## 6. Criterios de aceptación (verificables en el banco multiproceso)

Cada proceso de Next escribe su log; el corredor cuenta por proceso
**composiciones iniciadas** (líneas `[home] compone`), **terminadas** (líneas
terminales con `composiciones = 1`) e **interrumpidas** (iniciadas −
terminadas), y las coteja con los dobles: el de TMDB cuenta llamadas por
ventana, y el de Redis registra **cada** `SET NX` (con su propietario y si fue
`OK`/`null`), `RENOVAR`, `PUBLICAR`, `ENFRIAR`, `LIBERAR` y expiraciones.

1. **E2 — 3 procesos × 34 simultáneas, misma clave fría, composición dentro de la ventana:** iniciadas = terminadas = **1**; `PUBLICAR = 1` en el doble; los otros 101: `compartida`, `ultimo-bueno` o `esperada`; TMDB = las llamadas de una composición.
2. **E3 — fresca expirada por control del doble, UB presente:** las primeras solicitudes sin turno responden `ultimo-bueno` en ≤ 3× el HIT de B2; exactamente una compone y publica; el UB nuevo reemplaza al viejo (gen sube de propietario).
3. **E-muere — el corredor mata el proceso propietario tras ver su línea `compone`:** en ese proceso iniciadas = 1, terminadas = 0, interrumpidas = 1; en el doble, el turno expira (sin `PUBLICAR` ni `LIBERAR` del muerto) y **exactamente un** `SET NX = OK` posterior de otro propietario; ese proceso termina y publica; los demás sirven UB o `esperada`; **ninguno** compone sin turno (cero líneas `compone` sin `SET NX = OK` previo del mismo propietario); nadie excede el presupuesto.
4. **E-renueva — composición > `TURNO_MS` (latencia declarada):** `renovaciones ≥ 1`; sigue siendo 1 composición; el doble no registra ningún `SET NX = OK` ajeno mientras el propietario vive.
5. **E-tarde — el doble borra el turno por control a mitad; otro lo toma; el viejo termina después:** 2 composiciones iniciadas y terminadas; el viejo: `publicacion = rechazado`, `origen = propia-sin-publicar`; el doble muestra **un solo** `PUBLICAR = 1` (el nuevo) y la fresca/UB con el propietario nuevo en `gen`.
6. **E-medianoche — el corredor cambia `YUMP_FECHA` del proceso nuevo (fecha forzada, `lib/fecha.ts`) mientras el viejo compone:** el viejo termina con `PUBLICAR = -1`: su fresca (clave de ayer) escrita, **`gen` y UB con el día nuevo intactos**.
7. **E-primera-vez — sin UB, 3 procesos:** un propietario compone; los demás sirven `esperada` con latencia ≈ la composición; se mide `esperaMs`, vueltas y comandos de espera; con el propietario matado: **uno** rescata al vencer el turno, los demás sirven lo que él publica.
8. **E-agotada — sin UB, propietario vivo con composición > `TOPE_ESPERA_MS` (latencia declarada alta):** los que esperan responden 200 vacío `degradado` con `motivo = espera-agotada` **sin componer**; ninguna línea `compone` sin turno; la siguiente ronda es HIT.
9. **E-degradado — TMDB 500 con UB presente:** el doble no recibe `PUBLICAR`; el propietario responde UB (`degradadoDescartado`); `ENFRIAR = 1` y el turno queda `enfriando:` con `PX`; los demás UB. **E-degradado-sin-UB:** el propietario responde degradado; el degradado va a `home:degradado`, no a fresca ni UB.
9b. **E-rafaga — TMDB 500, una solicitud por segundo durante 40 s, 2 procesos, con UB y sin UB:** composiciones iniciadas ≤ ⌈40 / `ENFRIAMIENTO_MS`⌉ + 1 (= 4 con 15 s); las demás responden UB (con UB) o `degradado-compartido` (sin UB) sin componer y sin esperar; cero `SET NX = OK` durante cada enfriamiento; ningún `PUBLICAR`.
9c. **E-sinredis-vuelve — el doble de Redis está caído cuando A pide (A compone sin turno); el doble vuelve a mitad; B toma el turno y publica; A termina después:** A responde `origen = sin-redis`; el doble **no** recibe de A ningún `SET` de fresca/UB/gen ni `PUBLICAR`; fresca, UB y gen quedan con el propietario B; la siguiente solicitud es HIT del payload de B.
9d. **E-cancelacion — TMDB con latencia declarada tal que la composición supera `PRESUPUESTO_REQUEST_MS`:** la solicitud propietaria responde antes de `maxDuration` con `cancelada` (UB si hay, vacío si no), `LIBERAR = 1`, ningún `ENFRIAR` ni `PUBLICAR`; el doble de TMDB deja de recibir llamadas de esa solicitud en < 1 s desde el aborto. **Control E-cancelacion-redis:** con el doble de Redis caído, la solicitud **sigue** más allá del presupuesto (F5a): es la promesa reducida de §3.8, y el escenario existe para que nadie la afirme.
9e. **E-version — con `VERSION_HOME` subida en un proceso y no en otro (rollout simulado):** cada proceso publica y lee sólo sus claves (`…v6…` / `…v7…`); dos turnos, dos frescas, dos UB; ninguna solicitud del proceso v7 sirve un payload v6.
10. **E-perdida — el doble simula respuesta perdida en `SET NX` (ejecuta y corta el socket):** el SDK reintenta, recibe `null`, y `tomar` reconcilia a `adquirido` con `GET turno`; una sola composición; `turno = reconciliado`.
11. **E-eval-falla — el doble devuelve error en `RENOVAR`/`PUBLICAR`/`ENFRIAR`/`LIBERAR`:** el resultado es `indeterminado`; no aparece ningún `DEL` ni `SET XX` en el doble; el turno vence solo; la solicitud sirve igual.
12. **E-redis — Redis caído y vuelve:** `turno = sin-redis`, todos componen (como hoy), 200, y el doble **no recibe ninguna escritura de fresca/UB/gen** de esas solicitudes (§3.7); al volver, la ventana siguiente vuelve a 1 composición con `PUBLICAR = 1`.
13. **E-claves — dos claves, dos procesos:** dos composiciones en paralelo (pared < suma).
14. **Deadline (promesa reducida):** en todos los escenarios **con Redis respondiendo**, ninguna solicitud completa supera `PRESUPUESTO_REQUEST_MS`, y una composición que lo excedería se cancela (9d); con Redis caído **no se afirma** (control 9d-redis). El test puro de la desigualdad de §3.8 pasa con las constantes finales.
15. **Etapa 1 intacta:** E1 (100 en un proceso) sigue 1 + 99; barrido de `cached`/`cachedIf`.
16. **Costo:** un HIT no suma comandos; una composición suma ≤ 2 + renovaciones (+1 por reconciliación de `null`); medido contra el doble.
17. **Subir la versión invalida las familias juntas:** con `VERSION_HOME` subida, la primera solicitud no encuentra fresca, UB ni degradado de la versión anterior y compone; el doble muestra las cinco familias nuevas con `v7` y ninguna lectura de `v6`.

---

## 7. Costo en comandos de Redis — cálculo, no medición

Sobre lo que ya cuesta hoy (cold ≈ 994 comandos, HIT = 1). `EVAL` se cuenta
como **un** comando desde el cliente; **si Upstash factura los comandos internos
del script** (`PUBLICAR` ejecuta hasta 4 + 2 lecturas), serían hasta 6 — hay que
mirarlo en el panel, no está en el repositorio.

| Caso | Comandos extra (cliente) | Detalle |
|---|---|---|
| HIT de la fresca | **0** comandos, **0 bytes extra**: una sola copia, como hoy | la lectura de `[ub, degradado]` se paga sólo en el MISS |
| Propietario, sin renovar | **+4** | `MGET [ub, degradado]`, `SET NX`, `GET fresca` (paso 4.0), `PUBLICAR` |
| Propietario con renovaciones | +4 + r | `RENOVAR` cada 5 s |
| `fresca-tras-turno` | +4 | `MGET`, `SET NX`, `GET fresca`, `LIBERAR`; ahorra una composición entera (~1.000 comandos) |
| Ocupado con UB | **+3** | `MGET [ub, degradado]`, `SET NX` rechazado, `GET turno` de reconciliación |
| Espera sin UB, `k` vueltas de 500 ms | +3 + 3k | `MGET` (tres copias) + `SET NX` + `GET` por vuelta (≈ 6 comandos/s por instancia que espera, acotado por el tope) |
| Degradado con turno | +4 (+ r) | `MGET`, `SET NX`, `GET fresca`, `ENFRIAR` |
| Ocupado por enfriamiento | +3 | `MGET`, `SET NX` rechazado, `GET turno`; sirve UB o degradado compartido |
| Cancelada | +4 (+ r) | `MGET`, `SET NX`, `GET fresca`, `LIBERAR` |
| Propietario tardío | +4 (+ r) | `PUBLICAR` rechazado cuenta igual |
| Redis caído | 0 confirmados, nada escrito | intentos fallidos aparte |

Contra el ahorro: cada composición evitada son ~1.000 comandos y ~900 llamadas
a TMDB. La espera sin UB es lo único que escala con los procesos, y por eso
tiene tope y se mide (E-primera-vez, E-agotada). **Aritmética; la cuota real y
la facturación de EVAL se consultan en el panel (§10.5 del informe de
capacidad).**

---

## 8. Banco: la extensión, y la evidencia de "composición iniciada"

- `scripts/banco/correr.mjs`: `BANCO_PROCESOS=K` levanta K procesos de Next
  (puertos 3000…3000+K−1) contra los **mismos** dobles; cada uno con su log;
  `YUMP_FECHA` por proceso para E-medianoche; matar por PID al detectar la línea
  `compone` del propietario (E-muere).
- `lib/banco-validacion.ts`: valida **todos** los logs contra los deltas de los
  dobles; suma iniciadas/terminadas/interrumpidas; nuevas expectativas
  (`publicaciones`, `setNxOk`, `interrumpidas`, `sinTurno = 0`).
- `scripts/banco/dobles.mjs` (Redis): TTL real y expiración; `EVAL` **de los
  cuatro scripts por texto**; registro por comando de turno con propietario y
  resultado; controles `expirar`, `borrar`, `perderRespuesta` (ejecuta y corta),
  `fallarEval`, y `caido`/`ok` cambiable a mitad de una solicitud
  (E-sinredis-vuelve). El doble de TMDB respeta el aborto del `fetch`
  (E-cancelacion).
- `scripts/banco/correr.mjs`: solicitudes **escalonadas** (`cadaMs`) además de
  simultáneas (E-rafaga); `VERSION_HOME` sobreescribible por proceso sólo en el
  banco (E-version); la cancelación se ejercita con latencia declarada en el
  doble de TMDB.
- La línea `[home] compone <clave> <propietario>` es la evidencia que un
  proceso asesinado sí alcanza a dejar: sin ella, E-muere sólo vería la
  ausencia de una línea terminal.

---

## 9. Plan RED → GREEN, con los controles pedidos

Módulos puros nuevos, probados **antes** del cableado:

1. `lib/turno.ts` (estados y reconciliación) — **RED:** `tomar` distingue
   `adquirido`/`ocupado`/`indeterminado`; `null` + `GET == mío` → `adquirido`
   (**adquisición ejecutada con respuesta perdida se reconcilia**); excepción
   en `renovar` → `indeterminado` y **no** `perdido`; **un fallo de EVAL no
   habilita ninguna operación insegura** (el doble de deps no tiene `del` ni
   `setXx` y el test falla si se los llama).
2. `lib/home-servir.ts` (secuencia §5.1) con `resolverConCache`, las métricas
   reales y un reloj inyectado — **RED:**
   - **lectura → turno** (la carrera de §5.3): entre la lectura inicial de A
     (fresca ausente) y su `SET NX`, el test hace que B publique la fresca y
     libere; A obtiene el turno, **vuelve a leer**, encuentra la fresca, llama
     a `liberar` (no a `publicar`), sirve esa fresca con
     `origen = fresca-tras-turno`, y `producir` **no corre**: una sola
     composición/publicación total (la de B). Variante: la adquisición de A es
     **reconciliada** (`setNx` lanza, `GET turno == A`) y la segunda lectura
     igual ocurre. Control: sin la publicación intercalada, A compone;
   - **lecturas escalonadas**: en un HIT sólo se lee la fresca (cero lecturas
     de `[ub, degradado]`); en el MISS se leen una vez; tras adquirir se lee
     sólo la fresca; en la espera se leen las tres por vuelta;
   - **propietario muerto → exactamente un seguidor vuelve a tomar el turno**
     (3 seguidores esperando, turno que expira, `setNx` del doble atómico);
   - **los demás no arrancan rescates simultáneos** (cero `producir` sin
     `adquirido`);
   - **propietario perdido no modifica fresca ni UB** (`publicar` devuelve 0;
     el backend no recibe escrituras);
   - **propietario viejo que cruza medianoche no pisa el UB nuevo**
     (`publicar` con gen de día mayor → `-1`, UB intacto);
   - **degradado con UB devuelve UB; sin UB se devuelve el degradado**;
   - **espera + composición nunca excede el deadline con Redis respondiendo**
     (reloj y señal inyectados; test de la desigualdad de constantes); y el
     **control** de que con el backend de Redis "caído" (que nunca responde) la
     secuencia **no** promete terminar — el test fija la promesa reducida;
   - **`sin-redis` no escribe**: con Redis vuelto a mitad y B publicando, el
     backend no recibe ninguna escritura de A (fresca, UB, gen) y lo publicado
     sigue siendo de B;
   - **enfriamiento**: tras un degradado el turno queda `enfriando:` y una
     ráfaga escalonada de N solicitudes con TMDB caído produce ≤ ⌈duración /
     `ENFRIAMIENTO_MS`⌉ + 1 composiciones, con y sin UB; con UB las demás
     reciben UB, sin UB el degradado compartido; ninguna espera;
   - **cancelación**: al abortar la señal, `producir` termina (el doble de
     TMDB rechaza con `AbortError`), se llama a `liberar` y **no** a `enfriar`
     ni `publicar`, y se sirve UB o vacío `cancelada`;
   - **cancelación del líder con seguidores del single-flight local**
     (`crearVueloHome` con 1 líder + N seguidores en vuelo sobre la misma
     clave, y la señal del líder aborta): **todos** reciben el mismo resultado
     compartido (UB si hay, vacío `cancelada` si no) con `cache = compartida`;
     `producir` corre **una sola vez** (cero composiciones duplicadas: ningún
     seguidor arranca la suya al ver fallar la del líder); `liberar` se llama
     una vez; y una solicitud **posterior** al vuelo encuentra el turno libre y
     lo adquiere (`setNx` del doble devuelve `OK`). Control: con la señal de
     un **seguidor** abortada, el líder sigue y publica — la señal de un
     seguidor no cancela el vuelo compartido;
   - fresca → hit sin turno; ocupado + UB → UB sin componer; espera → sirve
     `esperada`; Redis caído → compone marcado; dos claves independientes;
     escritura fallida → sirve igual; single-flight local delante.
3. `lib/claves.ts` — `VERSION_HOME` y cuatro constructores; **RED** en
   `claves.test.ts`: (a) `claveHome` produce los mismos bytes que hoy con
   `VERSION_HOME = 6`; (b) las cinco familias comparten el segmento `v<N>`
   (se parsea de cada clave); (c) **subir `VERSION_HOME` cambia las cinco
   claves a la vez** y ninguna conserva `v6`; (d) los turnos de dos versiones
   son claves distintas.
4. `lib/cache.ts` — operaciones reales (`tomar`, `renovar`, `publicar`,
   `enfriar`, `liberar`, `leerTurno`) + emulación en memoria; guards: sin `DEL`
   suelto, sin `SET … XX` para el turno, **sin ninguna escritura directa de la
   fresca/UB/gen fuera de `publicar`** (el camino `sin-redis` no puede llamar a
   `guardar` con esas claves); `cached`/`cachedIf` intactos.
5. `lib/home.ts` + `lib/home-vuelo.ts` — cableado (§5.5); guard del
   single-flight sólo ahí.
6. Banco (§8) y corrida antes/después; los 21 criterios de §6 (16 de la v2 + 9b–9e y 17).
7. Verificación: específicos, suite, `tsc`, build fresco, `git diff --check`.

**Condición de entrada al paso 1:** la verificación de `EVAL` de §4.5 hecha y
pegada. **Sin subir `VERSION_HOME`**: ni la forma ni el contenido del payload
cambian, así que la fresca sigue siendo `…v6…` byte a byte y `ub`/`gen`/
`degradado`/`turno` son familias nuevas bajo la misma versión. Si la
implementación agregara un campo al payload, ahí sí `VERSION_HOME = 7`, y las
cinco familias se renuevan juntas.

---

## 10. Riesgos y límites que seguirán existiendo

- **Probabilístico en composiciones, no en publicación:** puede haber dos
  composiciones por ventana (renovación perdida, muerte, Redis flapeando); sólo
  una publica. Se mide.
- **Redis caído = sin coordinación y sin UB**: la protección es contra el
  vencimiento del TTL, la medianoche y una caída de TMDB, no contra Redis.
- **Contenido de ayer durante segundos** — aprobado; hay que decirlo en la
  documentación de producto.
- **Sin UB y composición ajena más larga que el tope: Home vacío una vez.** Es
  el único caso en que el usuario ve menos que hoy (hoy vería el rearmado
  completo, lento); ocurre sólo la primera vez de una combinación en más de 36 h
  y con un constructor lento; se mide.
- **`EVAL` y el tamaño de petición de Upstash sin verificar** hasta la
  comprobación de §4.5 y la medida del payload.
- **Facturación de los comandos internos de `EVAL`**: a mirar en el panel.
- **Vercel puede levantar más instancias de las que el banco simula**; el
  número real sigue sin observarse (#20, Etapa 5).
- **El presupuesto integral es una desigualdad sobre máximos medidos en el
  banco**, no en Producción; un TMDB real más lento que el doble se cubre con el
  factor de seguridad, que también hay que declarar y revisar.
- **La cancelación no alcanza a los reintentos del SDK de Redis** (señal sólo
  global en el cliente): con Redis caído la solicitud puede seguir hasta
  `maxDuration`, como en F5a. Es una promesa reducida a propósito y cambiarla
  (cliente por solicitud o `retry` global más corto) es de la Etapa 3.
- **Con Redis caído no se guarda nada del Home** (antes se intentaba y fallaba;
  ahora no se intenta): mientras dure la caída, cada instancia compone por
  solicitud, como hoy.
- **El enfriamiento es un freno mínimo, no una política**: con TMDB caído sigue
  habiendo una composición degradada por `ENFRIAMIENTO_MS` y por clave; el
  backoff creciente y el circuito son de la Etapa 3.

---

## 11. Qué cerraría del #17, y qué no

Cerraría: composición única entre procesos dentro de la ventana; renovación que
sostiene o duplicación documentada y medida; muerte del propietario con
convergencia; liberación y **publicación** seguras; UB en tiempo de HIT con la
fresca vencida; espera sin UB decidida, con tope y presupuesto; TMDB caído con
UB acotado a una composición por `ENFRIAMIENTO_MS`. **No cierra:** protección
ante Redis caído (que #17 ya declara fuera; y con la promesa reducida de §3.8
tampoco el deadline con Redis caído) ni observación del número real de
instancias (#20). #17 se cerraría al desplegar y medir los criterios de §6.

## 12. Relación con la Etapa 3 y lo que queda separado

Con UB, una caída de TMDB rearma **una vez por ventana de turno** y sirve UB el
resto. La Etapa 2 no decide cuánto esperar a TMDB, cuándo dejar de intentar ni
qué hacer con un 429 (`Retry-After`, circuito): eso es la Etapa 3 y queda
separado; E-degradado lo va a mostrar (cada ventana vuelve a intentar).

---

## 13. Conclusión para la nueva auditoría

Implementable con lo instalado: la base real **acepta** `EVAL` con cuatro
claves y los cuatro scripts del diseño (condición obligatoria, **verificada el
13/09**, §14). Toca `lib/claves.ts`
(versión única), `lib/cache.ts`, `lib/home.ts`, `lib/home-vuelo.ts`,
`lib/tmdb.ts` y `lib/supabase.ts` (una línea: la señal), `lib/metricas.ts`, dos
módulos puros nuevos y el banco; conserva el single-flight local, la regla del
degradado y la Etapa PREVIA. Los números (15 s de turno y de enfriamiento, 5 s,
500 ms, 20 s, 36 h, margen de 10 s) son cálculos con su evidencia y quedan
sujetos al banco. **Lo que esta versión deja de prometer:** que toda solicitud
termine antes de `maxDuration` — vale con Redis respondiendo; con Redis caído
sigue F5a. **Lo que deja de hacer:** guardar el resultado de una composición
sin turno, y liberar el turno tras un degradado. La decisión de servir el Home
anterior está aprobada.

---

## 14. Precondición de Upstash — ejecutada el 13/09/2026

**Evidencia:** [`2026-09-13-etapa2-precondicion-upstash.json`](2026-09-13-etapa2-precondicion-upstash.json)
(la respuesta de la ruta, reducida: en cada comando HTTP se conserva sólo el
nombre del comando; los resultados largos ya venían recortados por la ruta) y
[`2026-09-13-etapa2-precondicion-upstash.route.ts.txt`](2026-09-13-etapa2-precondicion-upstash.route.ts.txt)
(el código exacto que corrió). Corrida `mu00bddh-v1j4n2`; prefijo de todas las
claves: `precond-etapa2:mu00bddh-v1j4n2:` (`turno`, `fresca`, `ub`, `gen`,
`degradado`).

### 14.1 Cómo se ejecutó, y por qué así

- Las credenciales de Redis (`KV_REST_API_URL`/`KV_REST_API_TOKEN`) son
  variables **Sensitive** de Vercel: `vercel env pull` para `production`,
  `preview` y `preview@spike/capacitor-android` escribió `[SENSITIVE]` en las
  tres (**ejecutado**). No existe camino local sin exponer credenciales, y no
  se buscó otro.
- Se creó una rama **descartable** `tmp/etapa2-precondicion-upstash` desde
  `main` = `b60f985`, en un worktree aparte, con **una sola ruta temporal**
  `app/api/precondicion-etapa2/route.ts` (`b8f768f`, luego `d2ccb45`: el
  secreto pasó a un encabezado propio porque `vercel curl` ocupa
  `Authorization`). `tsc` limpio. **Nunca se pusheó**: se subió con
  `vercel deploy --yes` (el CLI sube los archivos; target `preview`).
- Deployments: `streamingcentral-3ytonv63s…` (descartado por lo del encabezado)
  y `streamingcentral-77qg89zsx…` (el de la corrida), ambos `target preview`,
  `● Ready`. **Aislamiento a nivel app, demostrado:** una petición anónima a la
  URL del Preview devuelve el HTML de login de Vercel (Deployment Protection
  activa; **ejecutado**: 200 con `text/html` de 339.531 B, no la ruta); la
  ruta sólo se alcanzó con `vercel curl` (bypass autenticado del CLI) **y**
  además exige un secreto propio comparado en tiempo constante contra
  `CRON_SECRET` (variable existente; **ejecutado**: sin encabezado → 401 "sin
  encabezado"; con valor equivocado → 401 "no coincide"). `app.yump.ar` siguió
  aliasado al mismo deployment de Producción antes y después
  (`streamingcentral-fsda4ubk5…`, creado el 12/09 16:02 -03; **ejecutado** con
  `vercel inspect`).
- **Aislamiento a nivel datos:** la base es **la misma que usa Producción** —
  eso es lo que había que verificar; en `vercel env ls` las variables `KV_*`
  son una sola fila para "Production, Preview". Lo que aísla es el prefijo, el
  TTL ≤ 60 s y el `DEL` final: `SCAN MATCH precond-etapa2:*` devolvió **0
  claves antes y 0 después** (cursor a 0 en una vuelta), `DBSIZE` = **2.923
  antes y 2.923 después**. **Qué estuvo aislado y qué no:** todas las
  operaciones Lua, el `SET NX PX` y las lecturas/borrados de la prueba usaron
  **exclusivamente** las cinco claves temporales del prefijo. Pero el payload
  representativo se obtuvo con **una solicitud normal a Producción**
  (`GET https://app.yump.ar/api/home?providers=n,d,m`, paso 0 de la ruta),
  que **sí leyó una clave normal del Home** (`home:…v6:…:d,m,n:`) y, de haber
  estado fría, la habría reconstruido y escrito como cualquier visita. Fue una
  solicitud normal, no una operación aislada; no se repite para corregir esto.
- Limpieza (**ejecutada**): `vercel remove` de los dos deployments (`inspect`
  del segundo: "Can't find the deployment"); worktree y rama descartable
  borrados; el archivo de variables bajado (sin credenciales de Redis) borrado.
  No se cambió ninguna variable ni configuración del proyecto.
- Comandos ejecutados, en orden: `vercel env ls` · `vercel env pull` ×3 (→
  `[SENSITIVE]`) · `git worktree add -b tmp/… ../wt-precond b60f985` · edición
  de la ruta · `npx tsc --noEmit` · `git commit` ×2 · `vercel link --yes
  --project streamingcentral` · `vercel deploy --yes` ×2 · `vercel inspect` ·
  `vercel curl /api/precondicion-etapa2 --deployment … -- -s -H
  "x-precond-secret: <secreto>" -o resultado.json` · `vercel remove` ×2 ·
  `vercel inspect app.yump.ar` · `git worktree remove` · `git branch -D`.

### 14.2 Resultado de cada operación (48 pasos, 48 correctos; `ok: true`)

Latencia por comando: **mediana 118,1 ms**, mínimo 116,3, máximo 351,3 (n =
60). El payload representativo es el Home real de `n,d,m` de Producción (GET
pasivo a `app.yump.ar/api/home`, 200, **85.328 B**).

| # | Operación | Esperado | Resultado | HTTP (comando · estado · ms · bytes enviados/recibidos) |
|---|---|---|---|---|
| 1 | `PING` | PONG | PONG | 200 · 135,9 · 10/23 |
| 2 | `DBSIZE` antes | número | 2.923 | 200 · 122,8 |
| 3 | `SCAN precond-etapa2:*` antes | 0 claves | 0 (1 vuelta, completo) | 200 · 140 |
| 4 | `EVAL "return 1" 0` | 1 | 1 | 200 · 118,6 · 23/14 |
| 5 | `SET turno A NX PX 15000` | OK | OK | 200 · 117,7 · 84/17 |
| 6 | `SET turno B NX PX` (ocupado) | null | null | 200 · 118,1 |
| 7 | `GET turno` (reconciliación) | A | A | 200 · 118,1 |
| 8 | `PTTL turno` | (0, 15000] | 14.645 | 200 · 118 |
| 9 | `RENOVAR` (B, propiedad ajena) | 0 | 0 | EVALSHA 200 (NOSCRIPT, 59 B) → EVAL 200 · 117,4 · 192/14 |
| 10 | `RENOVAR` (A) | 1 | 1 | EVALSHA 200 · 119,2 · 125/14 |
| 11 | `PTTL turno` renovado | > 14000 | 14.883 | 200 · 117,7 |
| 12 | `RENOVAR` (A) otra vez | 1 | 1 | EVALSHA 200 · 117,1 |
| 13 | **`PUBLICAR` (A, payload real, gen vacía)** | 1 | 1 | EVALSHA 200 (NOSCRIPT) → **EVAL 200 · 351,3 · 195.669/14** |
| 14 | `GET turno` tras publicar | null | null | 200 · 117,1 |
| 15 | `MGET fresca ub` | == payload, byte a byte | igual, igual | 200 · 231,7 · 86/227.564 |
| 16 | `GET gen` | `2026-09-13:A` | `2026-09-13:A-mu00bddh-v1j4n2` | 200 · 117,1 |
| 17 | `TTL fresca/ub/gen` | (50, 60] | 59 / 59 / 59 | 3 × 200 · ~117 |
| 18 | `SET turno B NX PX` (turno libre) | OK | OK | 200 · 118,6 |
| 19 | **`PUBLICAR` (A) con turno de B — propiedad perdida** | 0 | 0 | EVALSHA 200 · 129,6 · 195.253/14 |
| 20 | fresca/ub/gen/turno tras el rechazo | intactos; turno == B | fresca == payload, ub == payload, gen `…:A`, turno B | MGET 200 · 233,7 |
| 21 | `LIBERAR` (A, no era mío) | 0 | 0 | EVALSHA (NOSCRIPT) → EVAL 200 · 118,5 |
| 22 | `LIBERAR` (B) | 1 | 1 | EVALSHA 200 · 117,7 |
| 23 | `GET turno` liberado | null | null | 200 · 118,8 |
| 24 | `SET gen = 2026-09-14:otro EX 60` (publicador de un día posterior) | OK | OK | 200 · 118,8 |
| 25 | `SET turno A NX PX` | OK | OK | 200 · 118,9 |
| 26 | **`PUBLICAR` (A, hoy) con gen de mañana** | −1 (sólo fresca) | −1 | EVALSHA 200 · 130,2 · 195.253/15 |
| 27 | tras el −1 | fresca == payload2, ub == payload (intacto), gen de mañana intacta, turno borrado | todo cierto | MGET 200 · 234,3 |
| 28 | `SET gen = 2026-09-13:otro` (mismo día) | OK | OK | 200 · 117,4 |
| 29 | `SET turno A NX PX` | OK | OK | 200 · 116,8 |
| 30 | `PUBLICAR` (A, hoy) con gen del mismo día | 1 | 1 | EVALSHA 200 · 129 · 195.211/14 |
| 31 | `GET gen` | `2026-09-13:A` | `2026-09-13:A-…` | 200 · 117,9 |
| 32 | `SET turno A NX PX` | OK | OK | 200 · 117,4 |
| 33 | `ENFRIAR` (B, no era mío) | 0 | 0 | EVALSHA (NOSCRIPT) → EVAL 200 · 124,3 · 97.820/14 |
| 34 | `GET degradado` tras el rechazo | null (nada escrito) | null | 200 · 118,5 |
| 35 | **`ENFRIAR` (A, payload degradado real)** | 1 | 1 | EVALSHA 200 · 123,5 · 97.675/14 |
| 36 | `GET turno` | `enfriando:A` | `enfriando:A-mu00bddh-v1j4n2` | 200 · 117,5 |
| 37 | `PTTL turno`, `PTTL degradado` | (10000, 15000] | 14.763 / 14.644 | 2 × 200 · ~118 |
| 38 | `GET degradado` | == payloadDeg byte a byte | igual (85.270 chars) | 200 · 232,5 · 52/113.819 |
| 39 | `SET turno C NX PX` durante el enfriamiento | null (ocupado) | null | 200 · 116,7 |
| 40 | `RENOVAR` (A) durante el enfriamiento | 0 | 0 | EVALSHA 200 · 118,6 |
| 41 | `ENFRIAR` (A) otra vez | 0 | 0 | EVALSHA 200 · 122 |
| 42 | `LIBERAR` (A) durante el enfriamiento | 0 | 0 | EVALSHA 200 · 117,2 |
| 43 | lectura final `MGET fresca ub degradado` | payload, payload, payloadDeg | igual, igual, igual | 200 · **348,2 · 129/341.371** |
| 44 | lectura final gen, turno, TTL/PTTL | gen `hoy:A`; turno `enfriando:A`; TTL > 0 | gen `2026-09-13:A-…`; turno `enfriando:A-…`; TTL 57/57/57; PTTL turno 12.879, degradado 12.762 | 7 × 200 · ~117 |
| 45 | `DEL` de las cinco claves | 5 | 5 | 200 · 117 · 204/14 |
| 46 | `SCAN precond-etapa2:*` después | 0 claves | 0 (completo) | 200 · 118,1 |
| 47 | `DBSIZE` después | número | 2.923 | 200 · 116,8 |

Totales de la corrida: **60 comandos HTTP, 1.371.352 B enviados, 1.139.270 B
recibidos, 27.883 ms dentro de la función** (respuesta HTTP completa en
28,9 s, dentro de `maxDuration = 60`).

### 14.3 Comprobado

- `SET … NX PX` adquiere y rechaza; `PTTL` refleja `PX`.
- **Los cuatro scripts corren tal como están en §4.3** y devuelven lo que el
  diseño espera en cada rama: `RENOVAR` 1/0; `LIBERAR` 1/0; `ENFRIAR` 1/0 (sin
  escribir nada en el 0); `PUBLICAR` 1 (gen vacía y mismo día), 0 (propiedad
  perdida, sin tocar fresca/UB/gen) y −1 (gen de un día posterior: fresca
  escrita, UB y gen intactos, turno borrado).
- `EVALSHA` con `NOSCRIPT` cae a `EVAL` dentro del propio cliente 1.38.0
  (pasos 9, 13, 21, 33) y las ejecuciones siguientes son `EVALSHA` directo.
- **Con el payload real:** `PUBLICAR` acepta un cuerpo de 195 KB (351 ms la
  primera vez con el texto del script, ~129 ms después); `ENFRIAR` 97,7 KB en
  ~123 ms; `MGET` de tres copias de 85 KB = 341 KB en 348 ms; `GET` de una
  copia 232 ms.
- El estado `enfriando:` bloquea `SET NX` de terceros y también `RENOVAR`,
  `ENFRIAR` y `LIBERAR` del propietario original (el valor ya no es suyo): el
  enfriamiento dura lo que dice su `PX` y nadie lo acorta — coherente con
  §3.10.
- Lectura posterior de fresca, UB, generación, degradado y turno con contenido
  y TTL correctos (pasos 43–44).
- Limpieza total: 5 borradas, 0 restantes bajo el prefijo, `DBSIZE` igual.

### 14.4 Desconocido (y así queda)

- **Facturación de `EVAL`:** si Upstash cuenta un `EVAL` como un comando o
  como los comandos que ejecuta adentro. No hay acceso al panel de Upstash
  desde esta sesión y la API REST no lo informa: **desconocido**.
- **Límite de tamaño de petición del plan:** sólo se sabe que ≥ 195 KB pasa.
- **Región de la función del Preview:** la ruta no la registró. El build corrió
  en `iad1` y el proyecto no fija región en `vercel.json`, así que la latencia
  de ~117 ms por comando se **infiere** como Vercel-`iad1` → Upstash; la
  región de la base tampoco se conoce.

### 14.5 Correcciones al diseño que salen de la corrida

- Tamaño del payload: **85.328 B** medidos para `n,d,m` (§4.3 decía "~100–150
  KB estimados, a medir").
- **El SDK instalado activa `enableAutoPipelining` por defecto**
  (`nodejs.js:4503`: `opts?.enableAutoPipelining ?? true`) y `lib/cache.ts` no
  lo desactiva: los cuerpos de esta corrida fueron `[[…]]` (endpoint
  `/pipeline`, 84 B contra 82 B del formato plano). En la corrida cada paso
  esperó al anterior, así que 60 comandos = 60 peticiones; en la app, comandos
  emitidos en el mismo tick viajan juntos. No cambia el diseño; cambia cómo se
  leen `llamadasLogicas` contra `intentosHttp` de la Etapa 0 (nota para ese
  informe, no para éste).

### 14.6 Hallazgo para la implementación: el `MGET` de tres copias en el HIT

El diseño lee `[fresca, ub, degradado]` en **un** comando también en el camino
caliente (§5.1 paso 1, §5.5). En comandos es gratis; **en bytes no**: con UB
presente (lo normal después de la adopción, §4.2) cada HIT transfiere **dos
copias de 85 KB** en vez de una, y tres durante un enfriamiento. Medido acá:
`GET` de una copia 232 ms, `MGET` de tres 348 ms (+116 ms, +50 %), a lo que se
suma el ancho de banda de Upstash. **Decisión pendiente para la
implementación**, con recomendación: leer **sólo la fresca** en el primer
comando y pedir `[ub, degradado]` únicamente en el MISS (un round-trip más,
~120 ms, en el camino frío, que ya cuesta segundos), manteniendo en el HIT los
bytes de hoy. El costo en comandos de §7 pasa a "MISS: +1 lectura", el HIT
queda en 0 escrituras y 1 lectura como hoy. Queda escrito como alternativa;
**Decisión del dueño (13/09): aplicada** — §5.1, §5.5 y §7 ya describen las
lecturas escalonadas; el banco compara el HIT antes/después.

---

## 15. Implementación — rama `feat/etapa2-turno-ultimo-bueno`, pendiente de auditoría

**Fork point:** `8dfa49b` (la punta de `diseno/etapa2-turno-ultimo-bueno`, que
a su vez nace de `main` = `b60f985`). **Worktree:** `wt-etapa2-impl`, sin
`.env.local`. **Sin merge, sin push, sin deploy.** Los cuatro archivos ajenos
del checkout principal no se tocaron; todos los commits van con rutas
explícitas.

### 15.1 Qué se implementó (y en qué archivo)

| Módulo | Qué | Tests (escritos antes, RED → GREEN) |
|---|---|---|
| `lib/claves.ts` | `VERSION_HOME` única (6); `familiasHome()`; `claveHomeUltimoBueno`, `claveHomeGeneracion`, `claveHomeDegradado`, `claveTurnoHome`; la fresca byte a byte igual | `lib/claves-home.test.ts` (6); el barrido de `lib/claves.test.ts` pasa a 16 constructores / 17 call sites |
| `lib/turno-lua.ts` | los cuatro scripts, **los mismos bytes** que la precondición verificada contra Upstash | `lib/turno-lua.test.ts` (2): compara contra la evidencia de §14 |
| `lib/turno.ts` | estados y reconciliación (§4.4) sobre seis primitivas inyectadas; ningún `DEL` ni `SET XX` | `lib/turno.test.ts` (20; deps Proxy que lanza ante cualquier otra operación) |
| `lib/turno-memoria.ts` | las seis primitivas sobre un `Map` con la semántica de los scripts (desarrollo sin Redis, y backend de los tests) | en `lib/turno.test.ts` |
| `lib/home-servir.ts` | la secuencia §5.1 con lecturas escalonadas y la segunda lectura tras adquirir; renovación; ENFRIAR; cancelación; espera con tope; rescatista tardío | `lib/home-servir.test.ts` (27; emulación en memoria + reloj virtual) |
| `lib/senal-solicitud.ts` | la señal de la solicitud por `AsyncLocalStorage`; `combinarSenales` | `lib/senal-solicitud.test.ts` (2) |
| `lib/metricas.ts` | `turno`, `origen`, `publicacion`, `renovaciones`, `turnoPerdido`, `esperaMs`, `degradadoDescartado`, `enfriado`, `cancelada`, `propietario`; la línea `[home]` los imprime | `lib/metricas.test.ts` (+2) |
| `lib/cache.ts` | `opsTurnoHome` real (SET NX PX, GET, EVALSHA → EVAL ante NOSCRIPT, tres unidades contadas) o emulado; `leerVarias`; `TTL.homeUltimoBueno = 36 h`; proveedor de la señal para Supabase | `lib/home-turno-cableado.test.ts` (5, estructural) |
| `lib/home.ts` | las cinco claves; el resolver del vuelo es `servirConTurno` (ya no `cachedLocIf`); `AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)` por solicitud; propietario `<instancia>:<pid>:<n>`; `hoyAR()` como día; payload vacío con `motivo` | ídem + `lib/home-vuelo.test.ts`, inventario de cachés, barrido de disponibilidad actualizados |
| `lib/tmdb.ts`, `lib/supabase.ts` | la señal combinada con el timeout propio; una solicitud ya cancelada no sale ni se cuenta | ídem |
| `lib/fecha.ts` | la fecha forzada vale también en el banco (`YUMP_BANCO=1`, nunca con `VERCEL_ENV=production`) | `lib/fecha.test.ts` (+1) |
| Banco | `scripts/banco/dobles.mjs` (scripts por texto, NX/PX, PTTL, registro del turno, bytes, controles), `scripts/banco/correr-etapa2.mjs` (K procesos), `lib/banco-validacion.ts` (turno/origen/publicaciones, composición sin turno = inválida, interrupciones declaradas) | `lib/banco-validacion.test.ts` (+5) |

**RED comprobado:** cada archivo de tests falló al importar el módulo que no
existía (`ERR_MODULE_NOT_FOUND` / `does not provide an export named …`) antes de
escribirlo; los estructurales fallaron sobre el `lib/home.ts` y `lib/cache.ts`
previos. **GREEN:** suite completa **1.525 tests, 1.515 aprobados, 0 fallos,
10 omitidos** (los 10 de siempre: artefacto nativo); antes de la etapa eran
1.455 / 1.445 / 10 → **+70 tests**. `tsc --noEmit` limpio. Build fresco
(`.next` borrado antes): exit 0. `git diff --check` limpio.

### 15.2 Los controles RED del diseño, uno por uno

| Control (§9) | Test | Resultado |
|---|---|---|
| Lectura → turno (directa y reconciliada), y su control | `home-servir.test.ts` "lectura → turno…" ×3 | A no compone, `LIBERAR`, sirve la fresca de B, `origen = fresca-tras-turno`; una sola composición/publicación total |
| Lecturas escalonadas | "HIT: sólo se lee la fresca…", "MISS frío…" | HIT = `[fresca]`; MISS = `[fresca], [ub, degradado], [fresca]`; espera = las tres por vuelta |
| Propietario muerto → exactamente un rescatista | "propietario muerto…" | 3 seguidores, 1 `producir`, cero `compone` sin turno |
| Perdido no modifica fresca ni UB | "propietario perdido…" | `PUBLICAR` rechazado, `propia-sin-publicar`, fresca y UB de B |
| Medianoche | "propietario viejo que cruza la medianoche…" | `-1`, UB y gen del día nuevo intactos |
| Degradado con/sin UB, enfriamiento, ráfaga escalonada con y sin UB | 4 tests | ≤ ⌈40/15⌉+1 composiciones; con UB todas UB; sin UB degradado compartido; ninguna espera |
| `sin-redis` no escribe | "sin-redis: compone, sirve y no escribe…" | lo de B queda |
| Cancelación (composición, espera, líder con seguidores) y su control | 4 tests | `LIBERAR`, no `ENFRIAR`, UB o vacío `cancelada`; todos los seguidores reciben lo mismo; una composición; el turno queda libre |
| Deadline con Redis respondiendo + promesa reducida | "desigualdad…", "PROMESA REDUCIDA (control)…" | con Redis colgado la secuencia NO termina: fijado |
| Claves: (a)–(d) | `claves-home.test.ts` | byte a byte, `v<N>` común, salto conjunto, turnos distintos por versión |
| `cache.ts`: sin `DEL` suelto, sin `SET XX`, sin escritura directa fuera de PUBLICAR | `home-turno-cableado.test.ts` + Proxy en `turno.test.ts` | pasa |

### 15.3 El banco multiproceso (3 procesos de Next contra los mismos dobles)

**Evidencia:** [`2026-09-13-etapa2-banco.json`](2026-09-13-etapa2-banco.json)
(corrida **VÁLIDA**: 27 escenarios, 26 completos + 1 incompleto **declarado**;
las igualdades app ↔ dobles verificadas en todos los completos salvo E-muere,
donde el proceso asesinado consumió sin dejar su línea y la validación lo
declara) y [`2026-09-13-etapa2-banco-antes-E1.json`](2026-09-13-etapa2-banco-antes-E1.json)
(el build de la Etapa 1 —`wt-etapa1` = `af8d7c6`, código idéntico a `8dfa49b`
fuera de `docs/`— con **el mismo corredor y los mismos dobles**). Build del
banco con `entorno.sh`, doble de TMDB en 4801, Supabase 4802, Redis 4803.
Constantes medidas: `TURNO_MS = ENFRIAMIENTO_MS = 15 s`, `RENOVACION_MS = 5 s`,
`ESPERA_MS = 500 ms`, `TOPE_ESPERA_MS = 20 s`, `PRESUPUESTO_REQUEST_MS = 50 s`.

**El camino caliente no empeoró (antes / después, mismo corredor):**

| | Etapa 1 (`antes`) | Etapa 2 |
|---|---|---|
| B2 HIT, un proceso | 1 comando (`MGET`), **40.505 B** bajados, 16 ms | 1 comando (`MGET`), **40.505 B**, 15 ms |
| B2b HIT desde otro proceso | 1 comando, 40.505 B | 1 comando, 40.505 B |
| B1 frío, un proceso | 926 TMDB, **994** comandos, 1,6 s | 926 TMDB, **997** comandos (+3: `MGET [ub, degradado]`, `SET NX`, `GET` fresca del paso 4.0; `PUBLICAR` reemplaza al `SET` de la fresca), 1,8 s |
| E1: 100 simultáneas en un proceso | 1 composición + 99 esperas compartidas | 1 + 99 (Etapa 1 intacta) |
| **E2: 3 procesos × 34 simultáneas, clave fría** | **3 composiciones** (2.110 TMDB, 2.412 comandos, 3,0 s) | **1 composición** (957 TMDB, 1.155 comandos, 2,6 s): 1 `propia`, 2 `esperada`, 99 `compartida` |
| E3: fresca expirada, con UB | 3 composiciones | 1 composición; los otros 2 **`ultimo-bueno`** en el acto (886 ms de pared) |
| E-degradado-sinUB: TMDB 500 | 3 composiciones degradadas (651 TMDB) | 1 (217 TMDB), `ENFRIAR = 1`, los otros 2 `degradado-compartido` |

**Los escenarios de la Etapa 2 (todos ✅ salvo el control incompleto):**

| Escenario | Qué afirmaba (§6) | Medido |
|---|---|---|
| E-renueva (TMDB +250 ms) | renovaciones ≥ 1, 1 composición, ningún `SET NX` ajeno prospera | composición 17,7 s, **3 renovaciones**, `setNxOk = 1`, 2 `esperada` |
| E-muere (propietario asesinado a los 644 ms de su `compone`) | el turno vence, **exactamente uno** rescata, nadie compone sin turno | `compone = 2` (1 interrumpido + 1 rescate), `setNxOk = 2`, `PUBLICAR = 1`, 1 `esperada`, cero sin turno; 17,7 s de pared |
| E-tarde (turno borrado a mitad, otro lo toma) | 2 composiciones, 1 publicada, el viejo `propia-sin-publicar` | exacto; el viejo con 4 renovaciones (la última devolvió 0: `TURNO PERDIDO`) |
| E-medianoche (proceso de mañana publica primero) | `PUBLICAR = -1` del de hoy; UB y gen del día nuevo intactos | 1 publicada + 1 parcial; ambas `propia` |
| E-agotada (TMDB +700 ms, sin UB) | los que esperan → vacío `espera-agotada`, sin componer | 1 composición (45 s, 9 renovaciones); 2 `vacio-espera-agotada`; siguiente ronda HIT |
| E-degradado (TMDB 500, UB presente) | UB para todos, `ENFRIAR = 1`, nada publicado | `ultimo-bueno = 3`, 1 composición, enfriadas 1, publicaciones 0 |
| E-rafaga-sinUB (1/s × 40 s) | ≤ 4 composiciones; las demás degradado compartido; ninguna espera | **3** composiciones, 37 `degradado-compartido`, máx 510 ms por solicitud |
| E-rafaga-conUB | ≤ 4; **todas** UB | **2** composiciones, **40 `ultimo-bueno`**, máx 871 ms |
| E-perdida (SET NX ejecuta, socket cortado) | reconciliación → 1 composición | `turno = reconciliado`, 1 publicada, 1 comando con respuesta perdida en el doble |
| E-eval-falla (EVAL falla 2×) | indeterminado, nada inseguro, se sirve | `propia-sin-publicar`, publicaciones 0, 2 errores en el doble, ningún `DEL` |
| E-sinredis-vuelve (Redis vuelve a los 35 s; #1 publica) | #0 `sin-redis`, no escribe; lo de #1 queda | `origenes {sin-redis: 1, propia: 1}`, `setNxOk = 1` (el de #1), 1 publicada; la siguiente es HIT |
| E-cancelacion (TMDB +1.500 ms) | responde `cancelada` antes de 60 s; `LIBERAR`; TMDB deja de recibir | **50,4 s**, `vacio-cancelada`, liberadas 1, 0 enfriadas/publicadas, 9 renovaciones; TMDB recibió **0** llamadas en los 4 s posteriores (561 en total) |
| E-cancelacion-redis (control) | NO termina en 60 s (F5a) | incompleto declarado, 60,0 s, reinicio demostrado |
| E-version (v6 en #0, v7 en #2) | dos turnos, dos frescas, dos UB; nadie lee al otro | 2 composiciones, 2 publicadas; en el doble las familias `…v6…` y `…v7…` de fresca/ub/gen; después cada proceso HIT de su versión |

**Lo que el banco NO cubre:** E-claves (dos claves en dos procesos, pared <
suma) — la atribución del corredor es de una clave por escenario; lo cubre el
test puro "dos claves distintas no se bloquean". Y todo lo que es Producción:
la latencia real de Upstash (~117 ms por comando, §14) multiplica los +3
comandos del frío y cada vuelta de espera (3 comandos cada 500 ms).

### 15.4 Costo del camino caliente nuevo

- **HIT: 0 comandos extra, 0 bytes extra** — medido idéntico a la Etapa 1
  (1 `MGET`, 40.505 B en el banco; en Producción sería una copia de ~85 KB, la
  misma que hoy).
- **MISS con turno:** +3 comandos sobre la Etapa 1 (997 vs 994) y una lectura
  más de `[ub, degradado]`; ~+350 ms en Producción por la latencia por comando
  de §14, sobre una composición de 2–4 s.
- **Ocupado con UB:** 2 lecturas + `SET NX` + `GET turno` y se responde en
  tiempo de HIT (886 ms de pared en E3 con tres procesos, incluida la
  composición del propietario).
- **Espera sin UB:** 3 comandos por vuelta de 500 ms por instancia que espera,
  acotado por `TOPE_ESPERA_MS`.

### 15.5 Desviaciones respecto del diseño v3, y por qué

1. `tomar` con `SET NX = null` y `GET = null` (nadie lo tiene: el propietario
   publicó y borró el turno entre las dos) devuelve `ocupado` con valor vacío;
   la vuelta siguiente del bucle encuentra la fresca. El diseño no cubría ese
   intersticio.
2. `tomar` con `SET NX` que lanza y `GET = null` hace **un segundo** `SET NX`
   (acotado a uno); si también lanza, `sin-redis`. El diseño sólo reconciliaba.
3. El payload vacío de los dos finales sin contenido lleva `motivo:
   "espera-agotada" | "cancelada"`; nunca se publica ni se cachea, así que no
   cambia el contrato de lo cacheado ni `VERSION_HOME`.
4. `lib/fecha.ts` cambió (no estaba en la lista de §5.5): `next start` fija
   `NODE_ENV=production` y sin la excepción del banco E-medianoche no se podía
   medir. La excepción exige `YUMP_BANCO=1` y nunca `VERCEL_ENV=production`.
5. `lib/tmdb.ts`: una solicitud ya cancelada no sale ni se cuenta como llamada
   (dos chequeos: antes y después del semáforo). Sin el segundo, 4 de 565
   llamadas contadas no llegaban al doble y la igualdad no cerraba.
6. `crearVueloHome` no cambió: la lectura previa ya era sólo la fresca; lo que
   cambió es el `resolver` en `lib/home.ts`. Las otras cuatro claves llegan al
   resolver por un `Map` clave fresca → cinco claves.
7. "Sin plataformas" (payload no publicable, no degradado): se sirve y se
   libera el turno; ni `PUBLICAR` ni `ENFRIAR`.
8. Nombres de origen finales: `fresca`, `fresca-tras-turno`, `ultimo-bueno`,
   `esperada`, `propia`, `propia-sin-publicar`, `degradado-propio`,
   `degradado-compartido`, `sin-redis`, `vacio-espera-agotada`,
   `vacio-cancelada`; `cache` suma `ultimo-bueno`, `esperada`, `vacio`,
   `degradado-compartida`.
9. El doble de Redis cuenta como `comandos` sólo los confirmados al cliente
   (errores y respuestas perdidas aparte), que es la unidad de la app; lo que
   Upstash factura en esos casos sigue siendo desconocido (§14.4).
10. `VERSION_HOME` se puede sobreescribir por proceso **sólo** con
    `YUMP_BANCO=1` (`YUMP_BANCO_VERSION_HOME`), para E-version.
11. E-claves no está en el banco (arriba).

### 15.6 Comprobado, inferido, desconocido

- **Comprobado (ejecutado):** todo lo de §15.1–15.4 en el banco aislado y en
  los tests; que los scripts que corren son los verificados contra Upstash
  (test de bytes); que el HIT no empeoró contra la Etapa 1 con el mismo
  corredor.
- **Inferido:** el costo en Producción del MISS (+3 comandos ≈ +350 ms) sale de
  la latencia por comando medida en §14, no de una corrida en Producción; los
  tiempos del banco (composición ~2 s) no son los de Producción (~4 s).
- **Desconocido:** cómo factura Upstash los comandos de los scripts y los de
  respuesta perdida; el comportamiento con varias instancias REALES de Vercel
  (el banco usa tres procesos en una máquina contra un doble local); el valor
  óptimo de `TOPE_ESPERA_MS`, `TURNO_MS` y `ENFRIAMIENTO_MS` en Producción
  (los iniciales pasaron el banco; se miden después del deploy).

**Nada de esto está mergeado, pusheado ni desplegado.**

---

## 16. Corrección tras la auditoría de Codex sobre `fb3a3f1` — superada por §17

Codex ejecutó 62 pruebas específicas (todas pasaron) y encontró cinco puntos.
Cada uno se corrigió con RED → GREEN en la misma rama; **`main` = `origin/main`
= `b60f985` intacto**; los cuatro archivos ajenos sin tocar. **Sin merge, sin
push, sin deploy.**

| # | Hallazgo | Corrección | RED contra `fb3a3f1` | Commit |
|---|---|---|---|---|
| 1 | Si `producir()` rechazaba, el `finally` sólo apagaba la renovación: el turno quedaba huérfano hasta vencer | `lib/home-servir.ts`: `catch` → cortar y esperar la renovación → `LIBERAR` (compare-and-delete por script) → `errorProductor` en las métricas; **con UB** se sirve el UB y se registra el error (`console.error`); **sin UB** el error se propaga (la ruta responde 500, como antes de la Etapa 2) pero ya sin turno huérfano ni temporizador vivo. Ni `DEL` suelto ni `SET XX` | "productor que rechaza CON UB", "SIN UB", "rechaza a mitad de una renovación" | `46016eb` |
| 2 | `void renovacion` dejaba un temporizador de 5 s vivo tras una composición rápida, y una renovación en vuelo podía anotar métricas después de la línea terminal | La renovación duerme con una señal propia (`dormirCancelable`: `setTimeout` que la señal limpia en el acto) y al terminar la composición —bien o mal— se aborta **y se espera** la promesa. La espera sin UB también duerme con la señal de la solicitud. ⚠️ **Límite:** `await renovacion` espera también a un `RENOVAR` ya enviado a Redis; si esa operación no responde, la respuesta se demora lo que tarde el SDK (sus reintentos no se cancelan por solicitud: la promesa reducida de §3.8). No es una garantía absoluta de deadline ni de "ninguna promesa viva" con Redis colgado; el cliente de Redis no se rediseña acá | "composición rápida: ningún temporizador ni renovación activa", "las métricas NO cambian después de la línea terminal", "renovaciones largas legítimas (12 s → 2)", `dormirCancelable` | `46016eb` |
| 3 | `clavesEnVuelo`: un `Map` global de `lib/home.ts` que crecía con cada combinación y nunca se vaciaba | `crearVueloHome<T, K, C>` recibe un **contexto por solicitud** y le pasa al resolver el del líder; la clave de coordinación sigue siendo sólo la fresca; `servir.enVuelo()` (sobre `crearSingleFlight.enVuelo`) demuestra cero al terminar. Sin mapas de módulo | "el vuelo pasa el contexto del líder", "no queda estado acumulado (misma clave y claves distintas)", "lib/home.ts ya no retiene un mapa" | `ef05e55` |
| 4 | `randomUUID().slice(0, 8)` recortaba la identidad del propietario, que es parte del fencing | UUID completo; guard en `lib/home-turno-cableado.test.ts` (falla si vuelve `.slice`/`.substring`) | "el propietario lleva el UUID COMPLETO" | `ef05e55` |
| 5 | `lib/home-vuelo.ts` y su test seguían describiendo `cachedLocIf` como la resolución vigente | Comentarios al día (la resolución es `servirConTurno`; `cachedLocIf` queda como antecedente de la Etapa 1); `docs/ESTADO.md` aclara que en `main` sigue `cachedLocIf` | — | `ef05e55` |

**RED (ejecutado contra el módulo de `fb3a3f1`):** los seis tests nuevos de
`lib/home-servir.test.ts` fallaron (los cinco del productor/renovación más
"renovaciones largas", que exige cero durmientes al terminar); los tres de
`lib/home-vuelo.test.ts` fallaron; el guard del UUID falló con el `lib/home.ts`
de `fb3a3f1` (comprobado con ese archivo repuesto por `git stash`, con tag y
SHA, y vuelto a aplicar). **GREEN:** específicos turno 20, servicio 34, vuelo
15, single-flight 8, señal 2, claves 6 + 26, métricas 22, escritura 18,
validación del banco 24, Lua 2, cableado 6; **suite 1.536 tests, 1.526
aprobados, 0 fallos, 10 omitidos** (antes de la corrección 1.525 / 1.515);
`tsc --noEmit` limpio; build fresco (`.next` borrado, sin entorno del banco)
exit 0; `git diff --check` limpio.

### 16.1 Serialización real (Preview descartable, claves efímeras, sin claves reales)

[`2026-09-13-etapa2-serializacion.json`](2026-09-13-etapa2-serializacion.json)
y el código exacto en
[`2026-09-13-etapa2-serializacion.route.ts.txt`](2026-09-13-etapa2-serializacion.route.ts.txt).
Rama descartable `tmp/etapa2-serializacion` (`8aae8c8`, desde `ef05e55`) con
una sola ruta temporal, subida con `vercel deploy` (Preview protegido por
Vercel Authentication + secreto propio), **borrada** con el deployment después;
ninguna ruta temporal queda en la rama. Lo que corrió es **el camino de
producción**: `crearTurno(opsTurnoHome)` de `lib/cache.ts` (SET NX PX real,
`PUBLICAR` y `ENFRIAR` por EVALSHA/EVAL con `JSON.stringify(payload)`, la misma
llamada de `lib/home-servir.ts`) y la lectura por `leerVarias` (`batchGet` →
MGET con la deserialización predeterminada del cliente). Payload **sintético**
con la forma del Home (140.987 B; ningún pedido a Producción), con títulos que
traen comillas, barras, saltos de línea, acentos y emoji, y strings que parecen
número, JSON y booleano. Claves `precond-etapa2-serial:mu0cud0t-7ksaqx:*` de
60 s, borradas al final (`DEL` = 5, `SCAN` = 0). **11 pasos, 11 correctos:**
fresca y UB vuelven como **objetos** estructuralmente iguales al publicado;
`"007"`, `'{"a":1}'` y `"true"` vuelven como **strings** (la deserialización
sólo actúa sobre el valor entero, que es un objeto); `null`, `""`, `0` y
`false` intactos; `gen` vuelve `"2026-09-13:serial-…"` y el turno `null` tras
publicar y `"enfriando:serial-…"` tras enfriar; las tres copias en un MGET
iguales a lo publicado; TTL 58 s en la base (aquí 60; en producción
`TTL.home` 21.600 y `TTL.homeUltimoBueno` 129.600). `app.yump.ar` siguió en el
mismo deployment de Producción antes y después.

### 16.2 Banco, antes y después de la corrección

Corrida completa nueva (el código de la app cambió; el corredor no):
[`2026-09-13-etapa2-banco.json`](2026-09-13-etapa2-banco.json) — **VÁLIDA**, 27
escenarios, 26 completos + 1 incompleto declarado (E-cancelacion-redis).
Comparada escenario por escenario con la corrida de `fb3a3f1`: **mismos
resultados en todos** (composiciones, orígenes, publicaciones, TMDB, comandos,
renovaciones): B2 HIT 1 comando / 40.505 B; E2 1 composición (1 `propia`, 2
`esperada`); E3 UB en el acto; E-renueva 3 renovaciones; E-muere 1 rescate;
E-cancelacion 50,5 s con `LIBERAR = 1` y TMDB en 0 después; E-perdida
`reconciliado`; E-sinredis-vuelve sin escribir; E-version separada. Es lo
esperado: las correcciones tocan el camino de error del productor y el ciclo de
vida del temporizador, que el banco no ejercita.

**El error del productor NO tiene escenario en el banco, y así queda dicho:**
`composeHome` envuelve cada fuente en `safe()` y no rechaza con ninguna
configuración de los dobles (TMDB 500/429/caído, Supabase caído, Redis caído
degradan, no lanzan). Provocarlo exigiría un gancho artificial en código de
producción, que no se agrega. Está cubierto por los tres tests puros con la
emulación en memoria (con UB, sin UB, y a mitad de una renovación).

### 16.3 Comprobado, inferido, desconocido (de esta corrección)

- **Comprobado:** los cinco puntos en tests que fallaban contra `fb3a3f1` y
  pasan ahora; el banco completo con el mismo resultado; la serialización real
  por el camino de producción contra la base real; ninguna ruta temporal en
  la rama.
- **Inferido:** que en Producción el temporizador huérfano de `fb3a3f1` no
  llegaba a anotar métricas fuera de la línea (una composición rápida deja el
  `setTimeout` de 5 s vivo, pero la renovación que dispara sólo anota si el
  turno sigue siendo suyo); no se midió, se corrigió.
- **Desconocido:** lo mismo que en §15.6 (facturación de Upstash, instancias
  reales de Vercel, constantes óptimas en Producción).

**Estado tras §16: corregida en rama; ver §17 para la corrección siguiente.**

---

## 17. Corrección final: UN instante por solicitud (auditoría de Codex sobre `82842a5`) — pendiente de auditoría final

**Hallazgo bloqueante:** `homePayload` consultaba el reloj tres veces para una
misma solicitud — `homeKey` → `dailySeed()` para la clave del vuelo,
`clavesDelHome` → otro `dailySeed()` para las cinco claves del contexto, y el
resolver → `hoyAR()` para el día de la generación. Con la medianoche argentina
entre dos de esas lecturas, la clave de coordinación, la fresca/turno/degradado
y el `dia` podían ser de días distintos: identidad de coordinación rota (dos
solicitudes del mismo instante con claves distintas esquivan el single-flight),
logs falsos y fencing diario debilitado justo en el límite que la Etapa 2
protege.

**Corrección (`fbae88c`), RED → GREEN:**

- `lib/fecha.ts`: `semillaDeDia(dia)` — la cuenta de `dailySeed` extraída,
  para derivar la semilla de un día ya capturado sin volver al reloj
  (`dailySeed` la usa).
- `lib/home-instante.ts` (nuevo, puro): `instanteHome(ahora?)` captura el día
  (`hoyAR(ahora)`; sin fecha, `hoyAR()` a secas honra `YUMP_FECHA` en el
  banco) y su semilla; `clavesDelHome(instante, providers, tipos)` construye
  las cinco claves con **esa** semilla (los cinco constructores con
  `HUELLA_IDIOMA`, como exige el barrido de `lib/claves.test.ts`) y devuelve
  `dia` y `semilla` junto con ellas.
- `lib/home.ts`: `clavesDeLaSolicitud()` = **una sola** `instanteHome()`; la
  clave del vuelo es exactamente `claves.fresca`; el resolver usa `dia:
  claves.dia` del contexto del líder; `homeKey` desaparece (ya no hay un camino
  separado para la fresca). `dailySeed()` sigue existiendo dentro de
  `composeHome` (semillas de los rieles): es contenido, no identidad de
  coordinación, y es anterior a la Etapa 2 — no se toca.
- `lib/home-instante.test.ts` (7 tests, **RED contra `82842a5`**: el módulo no
  existía y el test estructural sobre `lib/home.ts` fallaba —`instanteHome()`
  0 veces, `dia: hoyAR()` presente, `function homeKey(` presente—): un
  instante = día + semilla iguales a `hoyAR`/`dailySeed` de esa fecha; las
  cinco claves **byte a byte** contra los constructores con la semilla del
  instante, fresca/turno/degradado con la misma semilla y ub/gen sin ella;
  el cruce de medianoche entre lecturas reproducido con dos fechas (23:59:59
  y 00:00:00 AR) e imposible con un instante; una solicitud iniciada **antes**
  publica `gen = 2026-09-13:A` aunque el reloj cruce durante la composición;
  una iniciada **después** usa otra fresca/turno/degradado, el mismo UB y
  `gen = 2026-09-14:B`, y el propietario viejo termina con `-1` sin pisar UB
  ni gen (E-medianoche en puro); `instanteHome()` sin fecha = `hoyAR()`.
- Guards actualizados: `lib/canonizar-home.test.ts` (la clave se arma con la
  lista canonizada vía `clavesDeLaSolicitud` y es `claves.fresca`),
  `lib/home-vuelo.test.ts`, `lib/home-turno-cableado.test.ts` (los cinco
  constructores viven en `lib/home-instante.ts`; el día del contexto es el del
  instante).

**GREEN:** específicos instante 7, fecha 5, servicio 34, vuelo 15, turno 20,
claves 6 + 26, canonización 27, cableado 6, métricas 22, validación 24; **suite
1.543 tests, 1.533 aprobados, 0 fallos, 10 omitidos** (antes de esta ronda
1.536 / 1.526; en `fb3a3f1` 1.525 / 1.515); `tsc --noEmit` limpio; build fresco
exit 0; `git diff --check` limpio.

**Banco (la construcción de claves cambió → corrida completa):**
[`2026-09-13-etapa2-banco.json`](2026-09-13-etapa2-banco.json) — **VÁLIDA**,
28 escenarios, 27 completos + 1 incompleto declarado (E-cancelacion-redis).
Escenario por escenario, mismas composiciones, orígenes, publicaciones y
renovaciones que la corrida de `82842a5` (21 idénticos hasta en comandos; en
los otros 7 sólo difiere el orden de las claves del objeto `origenes` o el
conteo de comandos/TMDB de los que esperan, que depende de los milisegundos).
**E-medianoche** conservado: el proceso con `YUMP_FECHA` de mañana publica
(`gen` nueva) y el propietario de hoy termina después con `PUBLICAR = -1`
(fresca de su semilla `2312121320`, distinta de la de mañana `2429564653`);
E2 1 composición (1 `propia`, 2 `esperada`); E3 UB en el acto; E-renueva 3
renovaciones; E-cancelacion 50,5 s con `LIBERAR = 1` y TMDB en 0 después.

**Comprobado:** todo lo anterior. **Inferido:** que el cruce entre lecturas
ocurría en Producción con probabilidad proporcional a los microsegundos entre
las tres lecturas (nunca se observó; se eliminó la posibilidad). **Desconocido:**
lo de §15.6.

**Estado: corregida en rama, pendiente de auditoría final. Nada mergeado,
pusheado ni desplegado.**
