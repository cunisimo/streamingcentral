# Etapa 2 de capacidad — Turno distribuido y último Home bueno: auditoría y diseño

**Fecha:** 2026-09-13
**Rama:** `diseno/etapa2-turno-ultimo-bueno`, nacida de `main` = `b60f985`
(worktree `wt-etapa2`). **Sólo documentación: sin código productivo, sin
infraestructura, sin variables, sin merge ni push.** Diseño **pendiente de
auditoría de Codex**; nada de lo que sigue está implementado.
**Antecedentes:** Etapa PREVIA (#21, [`2026-09-10-capacidad-trafico.md` §9](2026-09-10-capacidad-trafico.md)),
Etapa 0 ([`2026-09-11-etapa0-medir.md`](2026-09-11-etapa0-medir.md)),
Etapa 1 ([`2026-09-11-etapa1-canonizar-single-flight.md`](2026-09-11-etapa1-canonizar-single-flight.md)),
issue #17 y `feat/dia-rotacion` (revisada como antecedente, **no** como fuente).

> ⚠️ Lo que este diseño promete es **menos composiciones duplicadas entre
> instancias y contenido válido mientras una sola reconstruye**. No promete
> exclusión indefinida ("el turno es una optimización probabilística", informe
> §9 [R6]), no protege de una caída de Redis (§3.3.c), y no es capacidad medida
> de Producción.

---

## 1. Evidencia del comportamiento actual (archivo:línea, `main` = `b60f985`)

| Qué | Dónde | Consecuencia |
|---|---|---|
| Una sola copia del Home por clave, TTL 6 h | `lib/cache.ts:114` (`TTL.home = 60*60*6`), escrita en `lib/cache.ts:309` (`redis!.set(key, data, { ex: ttl })`) | Al vencer, **no queda nada**: la siguiente solicitud paga el rearmado completo y, mientras tanto, no hay contenido que servir |
| La clave del Home lleva la **semilla del día** | `lib/home.ts:667` (`claveHome(dailySeed(), p, t, HUELLA_IDIOMA)`), formato en `lib/claves.ts:58-60` (`home:<huella>v6:<semilla>:<providers>:<tipos>`) | A la medianoche argentina cambia la clave entera: **todas** las combinaciones arrancan frías a la vez, y un "último bueno" atado a esa misma clave no serviría para cruzar el día |
| Leer → producir → guardar sin coordinación entre procesos | `lib/reparar-y-cachear.ts:39-44` | Dos instancias con la misma clave fría componen las dos |
| El single-flight es **por proceso** | `lib/home-vuelo.ts:53-66` (mapa en vuelo de módulo), cableado en `lib/home.ts:677-690` y `:739` | Dentro de una instancia, 100 → 1 (Etapa 1); entre instancias, N |
| Un degradado no se guarda | `lib/reparar-y-cachear.ts:43` (`if (!fallo) escribir`), predicado en `lib/home.ts:683-690` | Regla a extender a la copia larga: **un degradado tampoco promociona a último bueno** |
| La escritura fallida no rompe el request | `lib/cache.ts:294-323` → `guardarSinRomper` (`lib/escritura-cache.ts`) | Cualquier escritura nueva (último bueno, turno) tiene que entrar por la misma política |
| Redis caído: lecturas capturadas, escrituras absorbidas, sin turno posible | `lib/cache.ts:188-206` (`getSuelto`), `:231-283` (`flush`) | Decisión 7: sin Redis no hay coordinación; hay que decidir qué se hace |
| Ningún `SET NX`, `EVAL` ni segunda copia en `main` | `git grep -n "nx: true\|eval(" lib/` → nada | Todo lo de esta etapa es nuevo |
| El cliente instalado admite `SET … NX PX`, `EVAL`, `EVALSHA` y `createScript` con fallback ante `NOSCRIPT` | `@upstash/redis` **1.38.0**: `SetCommand` (`nodejs.js:2058-2083`: `nx`, `xx`, `get`, `ex`, `px`, `keepTtl`), `EvalCommand` (`:765`), `EvalshaCommand` (`:779`), `Script.exec` (`:4340-4395`, `evalsha` y si falla `eval`) | Las primitivas que el diseño necesita existen en el cliente. **Que Upstash las acepte no se verificó contra la base real**: las credenciales viven sólo en Vercel (§4.4) |
| `maxDuration = 60` en `/api/home` | `app/api/home/route.ts:14` | Cota superior dura de cualquier composición, y por lo tanto de cualquier turno |
| Composición medida | Etapa 0 en Producción: **4,05 s** un MISS (una foto); banco: 2,1–2,7 s frío, 8 s con +100 ms de latencia en TMDB (L1) | Evidencia para la duración del turno (§3.2) |
| Antecedente `feat/dia-rotacion` | `tomarTurno` (`git show feat/dia-rotacion:lib/cache.ts:309-327`): `SET key 1 NX EX`, sin propietario, sin renovación, liberación implícita por vencimiento, y **cae a "no rearmar" si Redis falla**; atado a `fresh=1`, que `main` no tiene | Se reusa la idea del `SET NX`; **se descartan** el valor `1` (decisión 1), la ausencia de renovación (3) y de liberación segura (4), y `fresh` |

---

## 2. Objetivo y lo que NO entra

Entra: turno distribuido por clave del Home; segunda copia "último bueno";
conservar el single-flight local; ningún degradado guardado ni promovido;
Redis caído no tumba la app. **No entra** (Etapa 3 y siguientes): reintentos de
TMDB, `Retry-After`, circuit breaker, CDN, límites por ruta. Tampoco `fresh=1`.

---

## 3. Las siete decisiones del #17

### 3.1 Propietario: un identificador único por composición

`propietario = <instancia>:<pid>:<contador>` donde `instancia` es un
`randomUUID()` generado al cargar el módulo (uno por proceso), y `contador` un
entero por composición. Vercel no expone un id de instancia estable y confiable
al runtime; el UUID por proceso cumple lo único que hace falta: que dos
constructores nunca compartan valor. Se anota en la línea `[home]` (§6.4) para
correlacionar en logs.

### 3.2 Duración inicial: 15 s, y de dónde sale

Evidencia disponible: un MISS real en Producción tardó 4,05 s (Etapa 0, una
solicitud); en el banco, 2,1–2,7 s con dobles locales y 8 s con +100 ms por
llamada a TMDB (L1); `maxDuration = 60`. **15 s ≈ 3,5× la única medida real y
~2× el peor caso del banco.** No es un número medido para el turno: es una
cota inicial que la renovación (3.3) vuelve poco crítica — una duración corta
sólo obliga a renovar antes; una larga bloquearía hasta 15 s a los demás si el
constructor muere. **El banco la ejercita (E-renueva, E-muere) y el informe de
implementación tiene que decir con qué valor se midió.** Constante declarada,
`TURNO_MS = 15_000`, con esta justificación al lado.

### 3.3 Renovación: cada `TURNO_MS / 3` mientras se compone, sólo si sigo siendo el propietario

Un temporizador durante `producir()` ejecuta `RENOVAR` (Lua, §4.3): *si
`GET turno == propietario`, `PEXPIRE turno TURNO_MS`*. Con período de 5 s, dos
renovaciones perdidas seguidas (10 s) todavía dejan 5 s de margen. La
renovación **se corta** al terminar la composición, al perder el turno (la
respuesta del script es `0`) o al llegar a `maxDuration`. Perder el turno no
aborta la composición (3.5).

### 3.4 Liberación segura: sólo el propietario actual, con compare-and-delete

`LIBERAR` (Lua): *si `GET turno == propietario`, `DEL turno`; si no, `0`*. Un
`DEL` a secas borraría el turno de otro que lo tomó tras el vencimiento. Se
libera en `finally`, pase lo que pase con la composición.

### 3.5 Muerte del constructor: el turno vence solo, y el que termina tarde no rompe nada

Timeout de la función, deploy o reciclado: no hay `finally`. El turno expira a
los `TURNO_MS` desde la última renovación y otro lo toma. Si el constructor
"muerto" en realidad seguía vivo (perdió el turno por no renovar y termina
después), **escribe igual la copia fresca y el último bueno** —es un Home
válido del mismo día—, no renueva más, y su `LIBERAR` devuelve `0` sin tocar el
turno ajeno. Dos escrituras válidas en distinto orden son aceptables: la última
gana y las dos son correctas. Esto es lo que hace que el turno sea probabilístico
y no una garantía: en esa ventana puede haber dos composiciones, y **se mide**
(E-tarde).

### 3.6 Sin último bueno (primera vez, o tras un día nuevo sin copia larga): esperar con tope, después componer

El que no tiene turno ni último bueno **espera** consultando la copia fresca
cada `ESPERA_MS = 500` ms hasta `TOPE_ESPERA_MS = 20_000` ms (≈ `TURNO_MS` + un
margen para la escritura). Si aparece, la sirve (`cache = "esperada"`). Si vence
el tope, **compone por su cuenta** ("rescate": el usuario no puede quedarse sin
Home) y lo anota como tal. Alternativas descartadas: (a) 503 con `Retry-After` —
rompe la experiencia por una optimización; (b) componer todos como hoy — es lo
que la etapa viene a evitar; (c) esperar sin tope — con un constructor muerto es
un cuelgue hasta `maxDuration`. **500 ms y 20 s son propuestas, no medidas:** el
banco (E-primera-vez) tiene que mostrar la latencia percibida y el costo en
comandos de la espera, y el número final sale de ahí.

### 3.7 Redis no disponible: componer sin coordinar, como hoy, y registrarlo

Si `SET NX` falla por transporte o por error del servidor, la solicitud **no se
degrada ni espera**: compone (con el single-flight local intacto), la escritura
del resultado entra por `guardarSinRomper`, y la métrica lo marca
(`turno = "sin-redis"`). Es exactamente el comportamiento actual con Redis
caído (Etapa 0, F5a/F6), más una línea que lo dice. Lo contrario de
`feat/dia-rotacion` ("no se rearma"), que aplicaba a un botón de reintento, no
a la primera carga.

---

## 4. Representación, claves, TTL y operaciones

### 4.1 Tres cosas distintas, tres claves

| Copia | Clave (constructor nuevo en `lib/claves.ts`) | Vive | Quién la escribe | Quién la lee |
|---|---|---|---|---|
| **Fresca** (la de hoy) | `home:<huella>v6:<semilla>:<providers>:<tipos>` — **sin cambios** | `TTL.home` = 6 h | el propietario, tras componer sin degradación | todos, en la lectura previa (MGET, ya batcheada) |
| **Último bueno** | `homeub:<huella>v1:<providers>:<tipos>` — **sin semilla** | `TTL.homeUltimoBueno` (§4.2) | el propietario, en la misma escritura que la fresca (`SET` aparte) | quien no encontró la fresca |
| **Turno** | `home:turno:<huella>v6:<semilla>:<providers>:<tipos>` (la fresca con prefijo) | `TURNO_MS`, renovado | `SET NX PX` por quien lo toma; `RENOVAR`/`LIBERAR` por el propietario | nadie lo lee "a mano": sólo `SET NX` y los scripts |

**Por qué el último bueno no lleva la semilla:** la semilla cambia a la
medianoche argentina y con ella cambia la clave fresca de **todas** las
combinaciones a la vez (`lib/home.ts:667`). Si el último bueno llevara la
semilla, a las 00:00 no habría último bueno para nadie y el primer minuto del
día sería una estampida de rearmados sin nada que servir — justo el momento
que más lo necesita. Sin semilla, se sirve el Home de ayer durante los segundos
que tarda el de hoy. Es "el último bueno", literalmente. Lleva la huella de
idioma por la misma razón que las otras once familias (`lib/claves.ts`, tanda
2): un rollback de idioma no puede seguir leyendo la copia larga en otro idioma.

**Por qué el turno sí lleva la semilla:** coordina la composición de **esa**
clave fresca; a la medianoche la composición de hoy no tiene por qué esperar a
un turno de ayer.

### 4.2 TTL del último bueno: 36 h, y por qué no es un número medido

Tiene que sobrevivir, como mínimo, al vencimiento de la fresca (6 h) y al
cambio de día (24 h), para que exista siempre algo que servir mientras uno
reconstruye: 6 + 24 = 30 h, y 36 h deja margen para un día sin visitas a esa
combinación. Más largo sólo costaría memoria en Upstash por claves de
combinaciones que nadie vuelve a pedir. **Es un cálculo, no una medición;** la
cuota lo decide (§7), y E3 lo ejercita.

### 4.3 Operaciones atómicas y el contrato Lua

| Operación | Comando | Atómico sin Lua | Contrato |
|---|---|---|---|
| Tomar el turno | `SET turno <propietario> NX PX <TURNO_MS>` | **Sí** (`SetCommand`, `nodejs.js:2062-2072`) | `"OK"` = mío; `null` = de otro |
| Renovar | `EVAL RENOVAR 1 turno <propietario> <TURNO_MS>` | **No** (GET + PEXPIRE por separado deja una ventana en la que el turno vence y otro lo toma entre las dos) | `1` = renovado; `0` = ya no es mío |
| Liberar | `EVAL LIBERAR 1 turno <propietario>` | **No** (GET + DEL, misma ventana) | `1` = liberado; `0` = no era mío, no se tocó |
| Leer fresca + último bueno | `MGET fresca ub` | Sí | Un solo comando, y **el batcher ya lo junta** con las lecturas de la misma solicitud |
| Escribir resultado | `SET fresca … EX 6h`, `SET ub … EX 36h` | Sí (dos comandos; la fresca primero) | Ambos por `guardarSinRomper` |

```lua
-- RENOVAR: KEYS[1]=turno, ARGV[1]=propietario, ARGV[2]=ms
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end
-- LIBERAR: KEYS[1]=turno, ARGV[1]=propietario
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end
```

Se cargan con `redis.createScript(...)` una vez por proceso y se ejecutan con
`.exec()` (`EVALSHA`, y ante `NOSCRIPT` el propio cliente reintenta con `EVAL`:
`nodejs.js:4389-4395`). Los dos scripts tocan **una** clave, son deterministas
y no dependen de la hora del servidor.

**Alternativa sin Lua, descartada:** renovar con `SET turno <propietario> XX PX`
y liberar con `DEL`. `XX` no compara el valor: si el turno venció y otro lo
tomó, el `SET XX` del viejo propietario **pisa el turno ajeno** con el suyo, y
el `DEL` lo borra. Es exactamente la carrera que la decisión 4 prohíbe.

### 4.4 Compatibilidad con Upstash: lo que está verificado y lo que no

- **Verificado (código):** el cliente instalado construye y envía `SET … NX PX`,
  `EVAL`, `EVALSHA` y `SCRIPT LOAD`, y `Script.exec` maneja `NOSCRIPT`.
- **NO verificado (ejecutado):** que la base de Producción acepte `EVAL`. Las
  credenciales de Redis no existen en local (`.env.local` no tiene `UPSTASH_*`
  ni `KV_*`: el cache local corre en memoria), viven sólo en Vercel, y esta
  ronda no toca variables. Upstash documenta `EVAL`/`EVALSHA` como soportados
  en todos los planes, pero acá no se afirma nada que no se haya ejecutado.
  **Verificación propuesta, previa a implementar:** un `EVAL "return 1" 0` y
  un `SET … NX PX` sobre una clave efímera propia (`health:eval-check`, 5 s)
  desde `/api/health` en un Preview, o desde un script con las credenciales
  que el dueño decida exponer. Si `EVAL` no estuviera disponible, el diseño
  cae a la variante "sin liberación segura" (§8) y hay que decirlo.
- **El doble de Redis del banco no implementa `EVAL`.** Para el banco se le
  agregan **exactamente esos dos scripts** por texto (no un intérprete Lua): eso
  prueba la lógica de carreras, no la compatibilidad con Upstash.

---

## 5. El algoritmo: propietario y seguidor

### 5.1 Secuencia de una solicitud

```
1. leer MGET [fresca, ub]                        (1 comando, batcheado)
2. fresca existe            → servir; cache=hit; fin.
3. SET turno prop NX PX     (1 comando)
   3a. Redis falla          → turno="sin-redis"; componer (single-flight local); escribir por guardarSinRomper; fin.
4. "OK" (soy propietario):
   4a. arrancar renovación cada TURNO_MS/3 (RENOVAR; si devuelve 0 → perdíTurno=true, parar)
   4b. componer (single-flight local: otros del mismo proceso comparten esta promesa)
   4c. degradado?  → NO escribir nada; LIBERAR; servir el degradado; fin.
   4d. bueno       → SET fresca EX 6h; SET ub EX 36h (guardarSinRomper); LIBERAR; servir; fin.
5. null (turno ajeno):
   5a. ub existe            → servir ub; cache=ultimo-bueno; fin.   (no espera, no compone)
   5b. sin ub               → esperar: cada ESPERA_MS leer fresca, hasta TOPE_ESPERA_MS
        - aparece           → servir; cache=esperada; fin.
        - vence el tope     → componer sin turno ("rescate"), escribir, fin.
```

En el mismo proceso, el single-flight de la Etapa 1 sigue delante de todo esto:
las solicitudes concurrentes a la misma clave comparten la promesa del líder, y
es **el líder** quien recorre 1–5. Los seguidores locales reciben lo que él
sirvió (fresca, último bueno, esperada o rescate) y anotan `esperasCompartidas`.

### 5.2 Máquina de estados del turno

```
        SET NX ok                    RENOVAR=1 (cada TURNO_MS/3)
 [libre] ────────▶ [mío] ◀────────────────────────────┐
    ▲                │  │                             │
    │   LIBERAR=1    │  │ vence sin renovar / RENOVAR=0│
    └────────────────┘  └───────────▶ [perdido] ──────┘ (otro puede tomarlo)
                                        │
                                        └─ mi composición sigue; escribo igual; LIBERAR=0 (no toco el ajeno)
```

### 5.3 Las carreras, una por una

| Carrera | Qué pasa | Por qué no rompe |
|---|---|---|
| Dos instancias hacen `SET NX` a la vez | Una recibe `OK`, la otra `null` | Atómico en Redis |
| El turno vence a mitad de la composición (renovación perdida) y otro lo toma | Dos composiciones en vuelo | Aceptado y **medido** (E-tarde): el turno es probabilístico. Las dos escriben Homes válidos; el segundo `LIBERAR` no toca el turno del otro |
| Vencimiento entre `RENOVAR` y la siguiente renovación | Igual que arriba | Período `TURNO_MS/3`: hacen falta dos fallos seguidos |
| Escritura de la fresca por el propietario viejo después de que el nuevo escribió | La copia queda con el Home del viejo (mismo día, minutos más viejo) | Válido; se puede afinar con `SET … GET` o versión por semilla+hora más adelante, fuera de alcance |
| `LIBERAR` tardío | Devuelve `0` | Compare-and-delete |
| Redis vence el turno y **nadie** lo vuelve a pedir (todos sirviendo último bueno) | La próxima solicitud lo toma y reconstruye | Sin daño: mientras tanto se sirvió contenido válido |
| El propietario muere antes de escribir | Turno vence; sin fresca; con ub se sirve ub y el siguiente reconstruye; sin ub, los que esperaban rescatan al vencer su tope | Convergencia sin intervención (E-muere) |
| Resultado degradado | No se escribe ni fresca ni ub; se libera el turno; se sirve el degradado al que compuso | Los demás con ub siguen sirviendo ub; los sin ub esperan/rescatan y **volverán a degradar** mientras TMDB esté caído — eso es #19 / Etapa 3, y acá sólo se acota a una composición por turno |
| Escritura del resultado falla (Redis escribe mal) | `guardarSinRomper` absorbe; se sirve igual; el turno se libera | Etapa PREVIA; el siguiente vuelve a intentar |
| Medianoche argentina | Fresca y turno cambian de clave; ub no | Se sirve el Home de ayer mientras uno compone el de hoy |
| Dos claves distintas | Turnos distintos | No se bloquean (E-claves) |

### 5.4 Interacción con `AsyncLocalStorage`, métricas y `guardarSinRomper`

- El temporizador de renovación se crea **dentro** del scope de la solicitud
  propietaria (`setInterval` hereda el contexto async): sus comandos se anotan
  a ella. Los seguidores locales del single-flight no ven nada de esto (ya es
  así en la Etapa 1).
- Los comandos nuevos entran por `anotar` como los demás (`llamadasLogicas`,
  `intentosHttp`, `comandos`): el `backoff` instrumentado ya cubre sus
  reintentos.
- Las escrituras (fresca, ub) usan `guardar` → `guardarSinRomper`; `SET NX`,
  `RENOVAR` y `LIBERAR` reciben el mismo trato: un fallo se registra en
  `redis.fallos` y **nunca** sube al handler.
- Nuevos campos de `MetricasRequest.home`: `turno: "propietario" | "ajeno" |
  "sin-redis" | null`, `renovaciones: number`, `turnoPerdido: boolean`,
  `origen: "fresca" | "ultimo-bueno" | "esperada" | "rescate" | "compartida" | "propia"`,
  `esperaMs: number`. `cache` conserva `hit | miss | compartida` y suma
  `ultimo-bueno` y `esperada`. La línea `[home]` los imprime.

### 5.5 Una instancia, varias, y Redis en memoria

- **Una instancia:** el single-flight local ya deja una composición; el turno
  agrega 2–3 comandos por composición y nada por HIT. Sin beneficio, costo
  chico, y el último bueno sí aporta (vencimiento del TTL y medianoche).
- **Varias instancias:** el beneficio de la etapa. Con `K` instancias y `N`
  solicitudes frías simultáneas: **1 composición** dentro de la ventana (K−1
  instancias sirven ub o esperan), en vez de `K`.
- **Redis en memoria** (desarrollo, `lib/cache.ts:25-29` sin credenciales): el
  turno y el ub se emulan sobre el `Map`, como hace hoy `mem`; no hay varias
  instancias, así que sólo prueba la secuencia. El banco usa el doble REST,
  que sí es compartido entre procesos.

### 5.6 Qué ve el usuario

| Escenario | Hoy | Con la Etapa 2 |
|---|---|---|
| Fresca en caché | HIT, ~30 ms | igual |
| Fresca vencida, primera solicitud en la instancia | rearmado completo (2–8 s) | **si hay ub: ub en tiempo de HIT**; el que tomó el turno paga el rearmado y recibe lo nuevo |
| Misma clave fría en varias instancias a la vez | K rearmados, cada uno lento | 1 rearmado (lento para ese usuario), los demás ub en tiempo de HIT, o espera ≤ tope si no hay ub |
| Medianoche | todos rearman | ub de ayer en tiempo de HIT hasta que uno termina |
| TMDB caído | rearmado degradado por solicitud | quien tiene turno: degradado; los demás: ub (contenido válido de antes). Sin ub: esperan/rescatan degradado |
| Redis caído | rearmado por solicitud, lento (Etapa 0 F5a) | igual, marcado |

---

## 6. Criterios de aceptación (verificables en el banco)

1. **E2 — 3 procesos × 34 solicitudes simultáneas, misma clave fría, composición dentro de la ventana:** composiciones totales (suma de `home.composiciones` de las 102 líneas de los 3 logs) = **1**; el resto: `compartida` (mismo proceso), `ultimo-bueno` o `esperada`; los dobles confirman 1× las llamadas de una composición.
2. **E3 — fresca vencida, ub presente (el doble de Redis expira la fresca por control):** la primera solicitud de cada proceso sin turno responde con `origen = "ultimo-bueno"` en tiempo de HIT (≤ el HIT de B2 × 3), y exactamente una compone.
3. **E-muere — el constructor muere a mitad (el corredor mata el proceso propietario):** otro proceso toma el turno **después** de `TURNO_MS` desde la última renovación y converge; composiciones totales = 2 (la interrumpida no cuenta como terminada) y ninguna solicitud queda activa en los otros procesos más de `TOPE_ESPERA_MS`.
4. **E-renueva — composición más larga que `TURNO_MS` (latencia declarada en TMDB):** `renovaciones ≥ 1`, sigue siendo **1** composición, y el turno nunca aparece libre en el doble mientras el propietario vive (el doble registra cada `SET NX` rechazado).
5. **E-tarde — el propietario pierde el turno (el doble lo borra por control) y termina después:** la segunda composición existe y se cuenta (**2**), el `LIBERAR` tardío devuelve `0` y **el turno del nuevo propietario sigue en el doble** hasta que él lo libera.
6. **E-liberación — liberación tardía contra turno nuevo:** idem 5, comprobado por el valor del turno en el doble antes y después.
7. **E-primera-vez — sin ub, 3 procesos:** un propietario compone; los demás esperan y sirven `esperada` (latencia ≈ la de la composición); con el propietario matado, rescatan al vencer `TOPE_ESPERA_MS` — se mide la latencia percibida y los comandos de espera.
8. **E-degradado — TMDB en 500 con ub presente:** ninguna solicitud escribe fresca ni ub (el doble no recibe `SET` de esas claves); los sin turno reciben ub; el propietario recibe degradado; el turno se libera.
9. **E-redis — Redis caído y vuelve:** con Redis caído, `turno = "sin-redis"`, todos componen (como hoy) y se sirve 200; al volver, la siguiente ventana vuelve a 1 composición.
10. **E-claves — dos claves distintas, dos procesos:** cada una compone una vez, en paralelo (pared < suma).
11. **Etapa 1 intacta:** E1 (100 en un proceso) sigue dando 1 + 99; `cached`/`cachedIf` sin single-flight ni turno (barrido).
12. **Costo:** un HIT no suma comandos; una composición suma ≤ 3 + renovaciones (§7), medido contra el doble.

Todo con validación automática (`lib/banco-validacion.ts`, extendida a varios
procesos: las líneas de **todos** los logs contra los deltas de los dobles).

---

## 7. Costo en comandos de Redis — cálculo, no medición

Por solicitud, sobre lo que ya cuesta hoy (Etapa 0: cold ≈ 994 comandos, HIT = 1):

| Caso | Comandos extra | Detalle |
|---|---|---|
| HIT de la fresca | **0** | el ub se lee en el mismo MGET que la fresca (el batcher los junta) |
| Composición con turno, sin renovar | **+3** | `SET NX`, `SET ub`, `LIBERAR` |
| Composición con renovaciones | +3 + r | una `RENOVAR` cada 5 s de composición |
| Servir ub sin turno | **+1** | `SET NX` rechazado (la lectura ya era el mismo MGET) |
| Espera sin ub | +1 + (esperaMs / 500) | un GET por vuelta de espera |
| Redis caído | 0 confirmados; +1 intento fallido por solicitud | reintentos del SDK aparte (Etapa 0) |
| Degradado | +2 | `SET NX`, `LIBERAR` |

Contra el ahorro: cada composición evitada son ~1.000 comandos y ~900 llamadas
a TMDB (Etapa 0/1). Con la cuota citada en `lib/cache.ts:83-85` (500.000/mes,
**sin verificar**), el costo del turno es despreciable frente a una sola
composición ahorrada; la espera sin ub es lo único que puede escalar (2
comandos/s por instancia que espera), y por eso tiene tope. **Todo esto es
aritmética; el banco lo mide y la cuota real se consulta en el panel (§10.5 del
informe de capacidad).**

---

## 8. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| `SET NX` con valor `1`, sin propietario (`feat/dia-rotacion`) | No permite renovar ni liberar con seguridad (decisiones 1, 3, 4) |
| Renovar/liberar sin Lua (`SET XX` / `DEL`) | Pisa o borra el turno ajeno tras un vencimiento (§4.3) |
| Reconstruir en segundo plano tras responder ub (`waitUntil`) | Depende de `@vercel/functions` y del comportamiento de congelado de la función; el que toma el turno compone en primer plano y paga él: más simple, medible, sin dependencia nueva |
| Último bueno con semilla del día | A la medianoche no hay último bueno para nadie (§4.1) |
| Turno sin renovación y duración larga (60 s) | Una instancia muerta bloquea a todos hasta 60 s; con renovación, 15 s |
| Esperar sin tope cuando no hay ub | Cuelga hasta `maxDuration` si el constructor murió |
| Responder 503 sin ub | Rompe la experiencia por una optimización |
| Integrar `feat/dia-rotacion` | Divergida; introduce `fresh=1` (`app/api/home/route.ts:33` de esa rama) que `main` no tiene; su `tomarTurno` cae a "no rearmar" ante Redis caído |
| Guardar el degradado como último bueno "por si acaso" | Congela una caída (la regla de `cachedIf`, `lib/home.ts:683-690`) |

---

## 9. Plan RED → GREEN

Módulos puros nuevos, probados con `node --test` **antes** del cableado
(misma regla que las tres etapas anteriores):

1. `lib/turno.ts` — la máquina del turno con deps inyectadas (`tomar`,
   `renovar`, `liberar`, `ahora`): estados, renovación, pérdida, liberación
   segura. **Tests RED:** propietario único; renovación periódica; `RENOVAR=0`
   marca perdido y corta; `LIBERAR` de un tardío devuelve 0 y no toca; muerte =
   ninguna llamada más.
2. `lib/home-servir.ts` — la secuencia §5.1 sobre `BackendCache` + turno + ub,
   con `resolverConCache` real y las métricas reales. **Tests RED:** fresca →
   hit; sin fresca + turno → compone y escribe fresca y ub; turno ajeno + ub →
   ub sin componer; turno ajeno sin ub → espera y sirve, o rescata al tope;
   degradado → nada escrito, turno liberado; escritura fallida → sirve igual;
   Redis caído → compone marcado; dos claves independientes; el single-flight
   local sigue delante.
3. `lib/claves.ts` — `claveHomeUltimoBueno`, `claveTurnoHome`; **RED** en
   `lib/claves.test.ts` (familias con huella; `CLAVES_SIN_HUELLA` no cambia).
4. `lib/cache.ts` — `tomarTurno`/`renovarTurno`/`liberarTurno` con `SET NX PX` y
   los dos scripts, emulados sobre `mem` sin Redis; todo por `anotar` y
   `guardarSinRomper`. Guards de fuente: los comandos existen, el `DEL` a secas
   no aparece, `cached`/`cachedIf` intactos.
5. `lib/home.ts` — `servirHome` pasa a usar `home-servir` con el vuelo local
   delante. Guard: `crearSingleFlight` sigue sólo ahí.
6. Banco: `dobles.mjs` con `EVAL` de los dos scripts por texto, `TTL` real de
   claves y control para expirar/borrar una clave; `correr.mjs` con varios
   procesos (`BANCO_PROCESOS=3`, puertos 3000–3002), validación multi-log y los
   escenarios de §6.
7. Verificación: específicos, suite, `tsc`, build fresco, `git diff --check`, y
   la corrida del banco antes (Etapa 1) / después.

**Sin cambiar la versión de la clave fresca:** ni la forma ni el contenido del
payload cambian; el ub es una familia nueva (`homeub:…v1`). Si en la
implementación el payload sumara un campo (`servidoDesde`, por ejemplo), ahí sí
habría que subir a `v7`, por la regla de `CLAUDE.md`.

---

## 10. Riesgos y límites que seguirán existiendo

- **Probabilístico:** con renovación perdida o constructor muerto puede haber
  dos composiciones por ventana. Se mide, no se niega.
- **Redis caído = sin coordinación y sin último bueno** (viven en Redis): la
  protección es contra el vencimiento del TTL, la medianoche y una caída de
  TMDB — no contra Redis (§3.3.c del informe de capacidad).
- **Contenido de ayer durante segundos** a la medianoche y tras vencer el TTL:
  es la decisión de producto de esta etapa; hay que decirla, no esconderla.
- **`EVAL` en Upstash sin verificar** hasta que se ejecute la comprobación de §4.4.
- **La espera sin ub cuesta comandos** proporcionales a los procesos que
  esperan; el tope lo acota, y la primera vez de cada combinación nueva del día
  pasa por ahí.
- **Vercel puede levantar más instancias de las que el banco simula**; el
  número real sigue sin observarse (#20, Etapa 5).
- **El propietario viejo que termina tarde pisa la fresca del nuevo** (mismo
  día): válido pero no ideal; fuera de alcance.

---

## 11. Qué cerraría del #17, y qué no

Cerraría los criterios "100 peticiones en varios procesos con composición
dentro de la ventana = una", "composición que excede la ventana: la renovación
la sostiene o se documenta", "muerte del propietario: otro toma el turno",
"liberación segura probada", "con la copia fresca vencida la respuesta llega en
tiempo de HIT", "sin último bueno: comportamiento decidido, documentado y con
tope" y "TMDB caído con último bueno: no más de una composición por ventana".
**No cierra** la protección ante Redis caído (que #17 ya declara fuera) ni la
observación del número de instancias reales. #17 se cerraría al desplegar y
medir en el banco los criterios de §6; hasta entonces sigue abierto.

## 12. Relación con la Etapa 3 y lo que queda separado

La Etapa 3 (resistencia frente a TMDB: `Retry-After`, circuito) se apoya en
esto: con último bueno, una caída de TMDB deja de rearmar en cada solicitud —
rearma **una vez por ventana de turno** y sirve ub el resto. Pero la Etapa 2
**no** decide cuánto esperar a TMDB, cuándo dejar de intentar ni qué hacer con
un 429: eso queda separado a propósito, y el escenario E-degradado lo va a
mostrar (cada ventana vuelve a intentar mientras TMDB esté caído). Tampoco
entra el "rescate" degradado sin ub: es el mismo comportamiento de hoy, acotado.

---

## 13. Conclusión para la auditoría

El diseño es implementable con lo instalado (SET NX PX y dos scripts Lua de
una clave), toca `lib/claves.ts`, `lib/cache.ts`, `lib/home.ts`, dos módulos
puros nuevos y el banco; conserva el single-flight local, la regla del
degradado y la Etapa PREVIA. Las decisiones con números (15 s, 5 s, 500 ms,
20 s, 36 h) están justificadas como cálculo y quedan sujetas a medición en el
banco. Lo que hay que resolver **antes** de implementar: la verificación de
`EVAL` contra la base real (§4.4) y la decisión del dueño sobre servir contenido
de ayer durante los segundos de reconstrucción (§5.6).
