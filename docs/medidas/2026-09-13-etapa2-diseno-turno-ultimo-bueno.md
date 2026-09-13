# Etapa 2 de capacidad — Turno distribuido y último Home bueno: auditoría y diseño

**Fecha:** 2026-09-13 — **versión 2**, revisada tras la auditoría de Codex de `7cfc979` (§0).
**Rama:** `diseno/etapa2-turno-ultimo-bueno`, nacida de `main` = `b60f985`
(worktree `wt-etapa2`). **Sólo documentación: sin código productivo, sin
infraestructura, sin variables, sin merge ni push.** Diseño **revisado,
pendiente de nueva auditoría**; nada de lo que sigue está implementado.
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

## 0. Qué cambió respecto de la versión 1 (auditoría de Codex sobre `7cfc979`)

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
caído no tumba la app; servir el Home anterior mientras uno reconstruye
(aprobado). **No entra** (Etapa 3 y siguientes): reintentos de TMDB,
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
sin publicación (degradado, error): compare-and-delete, nunca `DEL` a secas.

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
`ESPERA_MS`: (a) `MGET [fresca, ub]` — si aparece la fresca la sirve
(`esperada`); si apareció un UB (otro publicó) lo sirve; (b) intenta **adquirir
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

### 3.7 Redis no disponible: componer sin coordinar, marcado

Si `tomar` da `indeterminado` (transporte o error del servidor) y la
reconciliación tampoco responde, la solicitud compone (single-flight local
intacto), escribe por `guardarSinRomper`, y anota `turno = "sin-redis"`. Es el
comportamiento actual (Etapa 0, F5a/F6) con una etiqueta. Cuando Redis
"flapea", esto puede producir composiciones duplicadas: se acepta y se mide.

### 3.8 Deadline integral del request

Todo cabe dentro de `maxDuration = 60`:

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

### 3.9 Degradado con último bueno: se entrega el último bueno

El propietario lee `[fresca, ub]` antes de tomar el turno. Si su composición
sale degradada y **había UB**, responde el UB (`origen = "ultimo-bueno"`,
`degradadoDescartado: true` en las métricas), no escribe nada y libera. Sólo si
no hay UB se entrega el degradado. Es la decisión del dueño aplicada también al
que compuso.

---

## 4. Representación, claves, TTL y operaciones

### 4.1 Cuatro claves

| Copia | Clave (constructores nuevos en `lib/claves.ts`) | Vive | Quién la escribe |
|---|---|---|---|
| **Fresca** | `home:<huella>v6:<semilla>:<providers>:<tipos>` — sin cambios | `TTL.home` = 6 h | `PUBLICAR` |
| **Último bueno (UB)** | `homeub:<huella>v1:<providers>:<tipos>` — **sin semilla** | `TTL.homeUltimoBueno` (§4.2) | `PUBLICAR` |
| **Generación del UB** | `homeub:gen:<huella>v1:<providers>:<tipos>` = `"<YYYY-MM-DD>:<propietario>"` | igual que el UB | `PUBLICAR` |
| **Turno** | `home:turno:<huella>v6:<semilla>:<providers>:<tipos>` = `<propietario>` | `TURNO_MS`, renovado | `SET NX PX`; `RENOVAR`; `PUBLICAR`/`LIBERAR` lo borran |

**Por qué el UB no lleva la semilla:** la semilla cambia a la medianoche
argentina y con ella la clave fresca de todas las combinaciones (`lib/home.ts:667`);
un UB con semilla no existiría en el primer minuto del día, que es cuando más
hace falta. Sin semilla, se sirve el Home de ayer durante los segundos que tarda
el de hoy — **aprobado por el dueño**. Lleva la huella de idioma como las otras
familias (rollback de idioma).

**Por qué hace falta la generación:** el UB sin semilla es compartido entre
días, así que un propietario de ayer que termina tarde podría pisar el UB de
hoy. `homeub:gen` guarda el **día** (`hoyAR()`, `YYYY-MM-DD`, monotónico —la
semilla es un hash y no sirve para comparar) y el propietario que publicó;
`PUBLICAR` rechaza si el día guardado es mayor que el suyo. El propietario en
`gen` es además lo que permite reconciliar una publicación con respuesta
perdida (§4.4).

**Por qué el turno sí lleva la semilla:** coordina la composición de **esa**
clave fresca; a la medianoche la composición de hoy no espera a un turno de ayer.

### 4.2 TTL del último bueno: 36 h, y lo que garantiza

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
| Liberar (sin publicar) | `EVAL LIBERAR 1 turno <propietario>` | **No** | `1` liberado; `0` no era mío |
| Leer | `MGET fresca ub` | Sí | Un comando, batcheado con el resto de la solicitud |

```lua
-- RENOVAR: KEYS[1]=turno · ARGV[1]=propietario · ARGV[2]=ms
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end

-- LIBERAR: KEYS[1]=turno · ARGV[1]=propietario
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end

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
argumentos para no depender de que Lua lo copie: ~100–150 KB estimados, **a
medir**; el límite de tamaño de petición de Upstash para el plan real hay que
consultarlo en el panel, no está en el repositorio). La comparación de días es
lexicográfica sobre `YYYY-MM-DD`, que ordena bien. Los tres scripts se cargan
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

Un `indeterminado` en `renovar`, `publicar` o `liberar` **nunca habilita una
operación insegura** (no hay `SET XX` ni `DEL` de respaldo): lo peor que pasa es
un turno que vence solo o una publicación reintentada por el mismo script
idempotente (si ya publicó, la segunda ejecución encuentra el turno borrado y
devuelve `0`, y la reconciliación por `gen` lo aclara).

### 4.5 `EVAL` es condición obligatoria — sin fallback

Este diseño **no se implementa** si la base real no acepta `EVAL`/`EVALSHA` con
cuatro claves: no existe variante sin liberación y publicación seguras. Lo que
está y lo que no:

- **Verificado (código):** el cliente 1.38.0 envía `SET … NX PX`, `EVAL`,
  `EVALSHA`, `SCRIPT LOAD`, y `Script.exec` maneja `NOSCRIPT`.
- **NO verificado (ejecutado):** que la base de Producción acepte `EVAL` con
  varias claves. Las credenciales de Redis no están en local (`.env.local` sin
  `UPSTASH_*`/`KV_*`; el cache local corre en memoria) y esta ronda no toca
  variables.
- **Verificación obligatoria antes del RED de la implementación:** desde un
  Preview o con credenciales que el dueño exponga, `EVAL "return 1" 0`, `EVAL`
  con 4 claves efímeras propias (`health:eval:*`, 5 s) y `SET … NX PX` sobre
  una de ellas; el resultado se pega en el informe de implementación. Si falla,
  la etapa se detiene y se elige otra primitiva atómica (por ejemplo
  `SET … GET`, o Upstash `JSON`), en una ronda de diseño nueva.
- **El doble de Redis del banco** implementa **exactamente esos tres scripts**
  por texto (no un intérprete Lua): prueba la lógica de carreras, no la
  compatibilidad con Upstash.

---

## 5. El algoritmo: propietario y seguidor

### 5.1 Secuencia de una solicitud (el líder del single-flight local)

```
 0. t0 = ahora; presupuesto = PRESUPUESTO_REQUEST_MS
 1. MGET [fresca, ub]                                   (1 comando, batcheado)
 2. fresca            → servir; cache=hit; fin
 3. tomar (SET NX PX) → adquirido | ocupado | indeterminado→reconciliar (§4.4)
    sin-redis         → componer sin coordinar; guardar por guardarSinRomper; turno="sin-redis"; fin
 4. adquirido:
    4a. log "[home] compone <clave> <propietario>"      (evidencia de composición iniciada, §6)
    4b. renovación cada TURNO_MS/3 (RENOVAR); `perdido` → seguir componiendo, no publicar
    4c. componer (single-flight local delante)
    4d. degradado → si ub: servir ub (origen=ultimo-bueno, degradadoDescartado) ; si no: servir degradado.
                    LIBERAR. fin (nada escrito)
    4e. bueno → PUBLICAR: publicado → servir (origen=propia)
                          rechazado → servir (origen=propia-sin-publicar)   ← perdió el turno: no pisa nada
                          indeterminado → reconciliar por gen/turno (§4.4); servir
 5. ocupado:
    5a. ub → servir ub; cache=ultimo-bueno; fin           (no espera, no compone: +1 comando)
    5b. sin ub → bucle cada ESPERA_MS mientras ahora − t0 < TOPE_ESPERA_MS:
          MGET [fresca, ub]: fresca → servir (esperada); ub → servir (ultimo-bueno)
          tomar: adquirido → ir a 4 si el presupuesto restante ≥ COMPOSICION_MAX_MS,
                              si no: LIBERAR y responder vacío degradado (espera-agotada)
        al agotarse: responder 200 vacío degradado (motivo espera-agotada), sin escribir
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
                                                    │
                                                    └─ sigo componiendo; PUBLICAR=0 (no escribo); sirvo a mi usuario
   indeterminado en cualquier arista: reconciliar; nunca cambia de estado por sí solo
```

### 5.3 Las carreras, una por una

| Carrera | Qué pasa | Por qué no rompe |
|---|---|---|
| Dos instancias `SET NX` a la vez | una `OK`, otra `null` | atómico |
| `SET NX` ejecutó, respuesta perdida, el SDK reintentó y recibió `null` | `tomar` reconcilia con `GET turno == propietario` → adquirido | §4.4; sin reconciliación el turno propio quedaría huérfano 15 s |
| El turno vence a mitad (renovaciones perdidas) y otro lo toma | dos composiciones; **una sola publica** (`PUBLICAR` compara propietario) | fencing; medido en E-tarde |
| Propietario de ayer termina después de que el de hoy publicó el UB | `PUBLICAR` ve `gen` con día mayor → **no toca el UB**; escribe sólo su fresca (clave de ayer, ya inútil) y devuelve `-1` | fencing por generación (§4.3); medido en E-medianoche |
| Propietario muere antes de publicar | turno vence; con UB, se sirve UB y el siguiente que adquiere compone; sin UB, los que esperan reintentan `tomar` cada vuelta y **exactamente uno** lo adquiere al vencer | §3.6; medido en E-muere |
| Todos sin UB y el propietario vivo tarda más que el tope | responden vacío degradado; **nadie compone sin turno** | §3.6; medido |
| Degradado con UB | el propietario sirve UB; nada se escribe; turno liberado | §3.9 |
| Degradado sin UB, TMDB caído | una composición degradada por ventana de turno; los demás esperan y al vencer uno rescata (y degrada otra vez) | acotado a una por ventana; el resto es #19 / Etapa 3 |
| `PUBLICAR` con respuesta perdida | reconciliación por `gen` (`:<propietario>`) o reintento idempotente | §4.4 |
| Escritura falla dentro de `PUBLICAR` (Redis responde error) | el script no corrió: nada escrito, turno sigue mío hasta vencer; la solicitud sirve lo compuesto; el siguiente vuelve a intentar | `guardarSinRomper` en el wrapper; Etapa PREVIA |
| Dos claves distintas | turnos distintos | no se bloquean |
| Medianoche con tráfico | fresca y turno cambian de clave; el UB de ayer se sirve hasta que uno publica el de hoy; `gen` sube al día nuevo | aprobado por el dueño |

### 5.4 Interacción con `AsyncLocalStorage`, métricas y `guardarSinRomper`

- El temporizador de renovación nace dentro del scope del propietario y sus
  comandos se anotan a él. Los seguidores locales no ven nada de esto.
- Comandos nuevos por `anotar` (`llamadasLogicas`, `intentosHttp`, `comandos`);
  el `backoff` instrumentado cubre sus reintentos.
- `SET NX`, `RENOVAR`, `PUBLICAR`, `LIBERAR` y la reconciliación entran por un
  wrapper con la misma política que `guardarSinRomper`: un fallo se registra en
  `redis.fallos` y devuelve `indeterminado`; nunca sube al handler.
- Campos nuevos en `MetricasRequest.home`: `turno: "adquirido" | "ocupado" |
  "sin-redis" | "reconciliado" | null`, `renovaciones`, `turnoPerdido`,
  `publicacion: "publicado" | "publicada-solo-fresca" | "rechazado" |
  "indeterminado" | null`, `origen: "fresca" | "ultimo-bueno" | "esperada" |
  "propia" | "propia-sin-publicar" | "vacio-espera-agotada" | "compartida"`,
  `esperaMs`, `degradadoDescartado`. `cache` conserva `hit | miss | compartida`
  y suma `ultimo-bueno`, `esperada`, `vacio`. La línea `[home]` los imprime, y
  la línea `[home] compone <clave> <propietario>` sale al iniciar la composición.

### 5.5 Integración con `lib/home-vuelo.ts`: dónde se lee qué, y qué archivo cambia

Hoy `crearVueloHome` hace **una** lectura previa (`deps.leer(clave)` →
`backendCache.leer` → `batchGet`, `lib/home-vuelo.ts:56`) y, si falta, entra al
vuelo local con `deps.resolver` = `cachedLocIf` (`lib/home.ts:679-689`).

| Archivo | Cambio |
|---|---|
| `lib/home-vuelo.ts` | La lectura previa pasa a `deps.leer(claveFresca, claveUb)` → **dos `batchGet` en el mismo tick = un MGET**. Si hay fresca: hit. Si no, el vuelo local sigue igual; lo que cambia es **qué resuelve el líder**: en vez de `cachedLocIf`, `servirConTurno` (abajo) recibiendo el UB ya leído (para §3.9 y §5.1-5a) |
| `lib/home-servir.ts` (**nuevo**, puro) | La secuencia §5.1 con deps inyectadas: `tomar`, `renovar`, `publicar`, `liberar`, `leer`, `producir`, `ahora`, `dormir`. Es lo que se prueba en RED |
| `lib/turno.ts` (**nuevo**, puro) | Estados y reconciliación de §4.4 sobre deps `setNx`, `get`, `eval` |
| `lib/cache.ts` | `tomarTurno`, `renovarTurno`, `publicarHome`, `liberarTurno`, `leerTurno` sobre el cliente real (con emulación sobre `mem` sin Redis), todo por `anotar` y por el wrapper de fallos; `TTL.homeUltimoBueno` |
| `lib/claves.ts` | `claveHomeUltimoBueno`, `claveHomeGeneracion`, `claveTurnoHome` (+ `lib/claves.test.ts`) |
| `lib/home.ts` | `servirHome` cablea las deps reales; `homeKey` sin cambios; el productor emite la línea `compone` |
| `lib/metricas.ts` | campos de §5.4 y la línea |
| `lib/reparar-y-cachear.ts`, `lib/escritura-cache.ts`, `lib/single-flight.ts` | **sin cambios** |

**MGET reales por camino** (después del batcher):

| Camino | MGET | Otros comandos |
|---|---|---|
| HIT de la fresca | 1 (fresca+ub en el mismo lote) | 0 |
| Propietario, sin renovar | 1 | `SET NX` 1 + `PUBLICAR` 1 |
| Propietario con renovaciones | 1 | + `RENOVAR` × r |
| Ocupado con UB | 1 | `SET NX` 1 + `GET turno` 1 (reconciliación del `null`) |
| Espera sin UB, `k` vueltas | 1 + k | `SET NX` (1 + k) + `GET turno` (1 + k) |
| Degradado con turno | 1 | `SET NX` 1 + `LIBERAR` 1 (+ renovaciones) |
| Redis caído | 0 confirmados | intentos fallidos (Etapa 0) |

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
| TMDB caído | degradado por solicitud | quien compuso: UB si hay, degradado si no; los demás: UB; sin UB: una composición degradada por ventana, el resto espera |
| Sin UB y el propietario tarda más que el tope | — | Home vacío marcado degradado, una vez; la siguiente carga encuentra fresca o UB |
| Redis caído | rearmado por solicitud, lento | igual, marcado |

---

## 6. Criterios de aceptación (verificables en el banco multiproceso)

Cada proceso de Next escribe su log; el corredor cuenta por proceso
**composiciones iniciadas** (líneas `[home] compone`), **terminadas** (líneas
terminales con `composiciones = 1`) e **interrumpidas** (iniciadas −
terminadas), y las coteja con los dobles: el de TMDB cuenta llamadas por
ventana, y el de Redis registra **cada** `SET NX` (con su propietario y si fue
`OK`/`null`), `RENOVAR`, `PUBLICAR`, `LIBERAR` y expiraciones.

1. **E2 — 3 procesos × 34 simultáneas, misma clave fría, composición dentro de la ventana:** iniciadas = terminadas = **1**; `PUBLICAR = 1` en el doble; los otros 101: `compartida`, `ultimo-bueno` o `esperada`; TMDB = las llamadas de una composición.
2. **E3 — fresca expirada por control del doble, UB presente:** las primeras solicitudes sin turno responden `ultimo-bueno` en ≤ 3× el HIT de B2; exactamente una compone y publica; el UB nuevo reemplaza al viejo (gen sube de propietario).
3. **E-muere — el corredor mata el proceso propietario tras ver su línea `compone`:** en ese proceso iniciadas = 1, terminadas = 0, interrumpidas = 1; en el doble, el turno expira (sin `PUBLICAR` ni `LIBERAR` del muerto) y **exactamente un** `SET NX = OK` posterior de otro propietario; ese proceso termina y publica; los demás sirven UB o `esperada`; **ninguno** compone sin turno (cero líneas `compone` sin `SET NX = OK` previo del mismo propietario); nadie excede el presupuesto.
4. **E-renueva — composición > `TURNO_MS` (latencia declarada):** `renovaciones ≥ 1`; sigue siendo 1 composición; el doble no registra ningún `SET NX = OK` ajeno mientras el propietario vive.
5. **E-tarde — el doble borra el turno por control a mitad; otro lo toma; el viejo termina después:** 2 composiciones iniciadas y terminadas; el viejo: `publicacion = rechazado`, `origen = propia-sin-publicar`; el doble muestra **un solo** `PUBLICAR = 1` (el nuevo) y la fresca/UB con el propietario nuevo en `gen`.
6. **E-medianoche — el corredor cambia `YUMP_FECHA` del proceso nuevo (fecha forzada, `lib/fecha.ts`) mientras el viejo compone:** el viejo termina con `PUBLICAR = -1`: su fresca (clave de ayer) escrita, **`gen` y UB con el día nuevo intactos**.
7. **E-primera-vez — sin UB, 3 procesos:** un propietario compone; los demás sirven `esperada` con latencia ≈ la composición; se mide `esperaMs`, vueltas y comandos de espera; con el propietario matado: **uno** rescata al vencer el turno, los demás sirven lo que él publica.
8. **E-agotada — sin UB, propietario vivo con composición > `TOPE_ESPERA_MS` (latencia declarada alta):** los que esperan responden 200 vacío `degradado` con `motivo = espera-agotada` **sin componer**; ninguna línea `compone` sin turno; la siguiente ronda es HIT.
9. **E-degradado — TMDB 500 con UB presente:** el doble no recibe `PUBLICAR` ni `SET` de fresca/UB; el propietario responde UB (`degradadoDescartado`); los demás UB; turno liberado (`LIBERAR = 1`). **E-degradado-sin-UB:** el propietario responde degradado; nada escrito.
10. **E-perdida — el doble simula respuesta perdida en `SET NX` (ejecuta y corta el socket):** el SDK reintenta, recibe `null`, y `tomar` reconcilia a `adquirido` con `GET turno`; una sola composición; `turno = reconciliado`.
11. **E-eval-falla — el doble devuelve error en `RENOVAR`/`PUBLICAR`/`LIBERAR`:** el resultado es `indeterminado`; no aparece ningún `DEL` ni `SET XX` en el doble; el turno vence solo; la solicitud sirve igual.
12. **E-redis — Redis caído y vuelve:** `turno = sin-redis`, todos componen (como hoy), 200; al volver, la ventana siguiente vuelve a 1.
13. **E-claves — dos claves, dos procesos:** dos composiciones en paralelo (pared < suma).
14. **Deadline:** en todos los escenarios, ninguna solicitud completa supera `PRESUPUESTO_REQUEST_MS`; el test puro de la desigualdad de §3.8 pasa con las constantes finales.
15. **Etapa 1 intacta:** E1 (100 en un proceso) sigue 1 + 99; barrido de `cached`/`cachedIf`.
16. **Costo:** un HIT no suma comandos; una composición suma ≤ 2 + renovaciones (+1 por reconciliación de `null`); medido contra el doble.

---

## 7. Costo en comandos de Redis — cálculo, no medición

Sobre lo que ya cuesta hoy (cold ≈ 994 comandos, HIT = 1). `EVAL` se cuenta
como **un** comando desde el cliente; **si Upstash factura los comandos internos
del script** (`PUBLICAR` ejecuta hasta 4 + 2 lecturas), serían hasta 6 — hay que
mirarlo en el panel, no está en el repositorio.

| Caso | Comandos extra (cliente) | Detalle |
|---|---|---|
| HIT de la fresca | **0** | el UB va en el mismo MGET |
| Propietario, sin renovar | **+2** | `SET NX`, `PUBLICAR` |
| Propietario con renovaciones | +2 + r | `RENOVAR` cada 5 s |
| Ocupado con UB | **+2** | `SET NX` rechazado, `GET turno` de reconciliación |
| Espera sin UB, `k` vueltas de 500 ms | +2 + 3k | `MGET` + `SET NX` + `GET` por vuelta (≈ 6 comandos/s por instancia que espera, acotado por el tope) |
| Degradado con turno | +2 (+ r) | `SET NX`, `LIBERAR` |
| Propietario tardío | +2 (+ r) | `PUBLICAR` rechazado cuenta igual |
| Redis caído | 0 confirmados | intentos fallidos aparte |

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
  tres scripts por texto**; registro por comando de turno con propietario y
  resultado; controles `expirar`, `borrar`, `perderRespuesta` (ejecuta y corta),
  `fallarEval`.
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
   - **propietario muerto → exactamente un seguidor vuelve a tomar el turno**
     (3 seguidores esperando, turno que expira, `setNx` del doble atómico);
   - **los demás no arrancan rescates simultáneos** (cero `producir` sin
     `adquirido`);
   - **propietario perdido no modifica fresca ni UB** (`publicar` devuelve 0;
     el backend no recibe escrituras);
   - **propietario viejo que cruza medianoche no pisa el UB nuevo**
     (`publicar` con gen de día mayor → `-1`, UB intacto);
   - **degradado con UB devuelve UB; sin UB se devuelve el degradado**;
   - **espera + composición nunca excede el deadline** (reloj inyectado; test
     de la desigualdad de constantes);
   - fresca → hit sin turno; ocupado + UB → UB sin componer; espera → sirve
     `esperada`; Redis caído → compone marcado; dos claves independientes;
     escritura fallida → sirve igual; single-flight local delante.
3. `lib/claves.ts` — tres constructores; **RED** en `claves.test.ts`.
4. `lib/cache.ts` — operaciones reales + emulación en memoria; guards: sin
   `DEL` suelto, sin `SET … XX` para el turno; `cached`/`cachedIf` intactos.
5. `lib/home.ts` + `lib/home-vuelo.ts` — cableado (§5.5); guard del
   single-flight sólo ahí.
6. Banco (§8) y corrida antes/después; los 16 criterios de §6.
7. Verificación: específicos, suite, `tsc`, build fresco, `git diff --check`.

**Condición de entrada al paso 1:** la verificación de `EVAL` de §4.5 hecha y
pegada. **Sin cambiar la versión de la clave fresca**: ni la forma ni el
contenido del payload cambian; `homeub`/`gen`/`turno` son familias nuevas. Si
la implementación agregara un campo al payload, ahí sí `v7`.

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

---

## 11. Qué cerraría del #17, y qué no

Cerraría: composición única entre procesos dentro de la ventana; renovación que
sostiene o duplicación documentada y medida; muerte del propietario con
convergencia; liberación y **publicación** seguras; UB en tiempo de HIT con la
fresca vencida; espera sin UB decidida, con tope y presupuesto; TMDB caído con
UB acotado a una composición por ventana. **No cierra:** protección ante Redis
caído (que #17 ya declara fuera) ni observación del número real de instancias
(#20). #17 se cerraría al desplegar y medir los criterios de §6.

## 12. Relación con la Etapa 3 y lo que queda separado

Con UB, una caída de TMDB rearma **una vez por ventana de turno** y sirve UB el
resto. La Etapa 2 no decide cuánto esperar a TMDB, cuándo dejar de intentar ni
qué hacer con un 429 (`Retry-After`, circuito): eso es la Etapa 3 y queda
separado; E-degradado lo va a mostrar (cada ventana vuelve a intentar).

---

## 13. Conclusión para la nueva auditoría

Implementable con lo instalado **si** la base real acepta `EVAL` con cuatro
claves (condición obligatoria, no verificada todavía). Toca `lib/claves.ts`,
`lib/cache.ts`, `lib/home.ts`, `lib/home-vuelo.ts`, `lib/metricas.ts`, dos
módulos puros nuevos y el banco; conserva el single-flight local, la regla del
degradado y la Etapa PREVIA. Los números (15 s, 5 s, 500 ms, 20 s, 36 h, margen
de 10 s) son cálculos con su evidencia y quedan sujetos al banco; el deadline
integral es una desigualdad fijada por test. La decisión de servir el Home
anterior está aprobada.
