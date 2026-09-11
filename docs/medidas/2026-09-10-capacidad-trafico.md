# Auditoría de capacidad y resistencia ante tráfico

> **Revisión independiente del 10/09: requiere correcciones antes de implementar.**
> Leer [el dictamen de Codex](2026-09-10-revision-capacidad-codex.md): confirma
> riesgos centrales, pero corrige la equivalencia de plataformas, los reintentos
> del SDK Redis, la caída en escritura, las unidades de concurrencia, el alcance
> del banco, el contrato del bloqueo y el conteo publicado de claves. El texto
> original se conserva debajo como evidencia de lo revisado; sus criterios
> señalados no deben ejecutarse sin corregirlos.

**Fecha:** 2026-09-10
**Rama auditada:** `main` = `origin/main` = `fd2cd23`
**Método:** lectura del código con evidencia por archivo y línea, más una
ejecución aislada del constructor de claves. **No se ejecutó ninguna prueba de
carga**, ni contra Producción ni contra nada.
**Encargo:** diagnóstico comprobado y plan priorizado, sin implementar cambios.

> **Revisado de forma independiente el 10/09** — ver
> [`2026-09-10-revision-capacidad-codex.md`](2026-09-10-revision-capacidad-codex.md).
> La revisión sostuvo los riesgos centrales y encontró **siete correcciones**, dos
> de ellas en criterios de aceptación que, como estaban escritos, habrían roto el
> producto. **Todas están incorporadas en esta versión**, verificadas de nuevo por
> cuenta propia, y cada una queda marcada con **[R1]…[R7]** donde corresponde.
> El resumen de qué cambió está en la §12.

---

## 0. Lo primero: qué es medición y qué no

Este informe distingue tres cosas y no las mezcla:

| Marca | Significa |
|---|---|
| **COMPROBADO (código)** | Se leyó el camino completo y no tiene ramas que lo cambien. Se cita archivo y línea. |
| **COMPROBADO (ejecutado)** | Se corrió código de producción y se pega la salida. |
| **HIPÓTESIS** | Plausible y sin verificar. Se dice qué la confirmaría. |

**No hay ninguna cifra de capacidad medida hoy.** Los números que circulan
—"150 ms cacheado", "5-10 s en frío", "más de 600 llamadas a TMDB", "de 391
operaciones Redis a 19"— vienen del traspaso del 09/09 y de comentarios del
repositorio. **Son históricos y no se reprodujeron en esta auditoría.** Se citan
como antecedente, nunca como estado actual.

Y sobre todo: **no hay un máximo de usuarios simultáneos.** No se puede deducir
de leer código — y, **[R5]**, tampoco lo da un banco aislado: lo que da un banco
es un número comparable contra sí mismo. El máximo real sale de observar
Producción (§10.6) o de una prueba controlada contra Producción, que hoy está
prohibida. La §10.0 separa las cuatro fuentes y qué puede cada una.

Las dos únicas mediciones propias de hoy son:

1. La ejecución del constructor de claves (§2.1).
2. `dbsize` de Redis leído por `/api/health`: **1259 claves el 07/09 ~18:20** y
   **2382 claves el 10/09 ~12:30**. Es un dato real y **no dice qué familia
   creció**: `dbsize` no desglosa, y la mayoría de las claves son `card:` y
   `pv3:` por título, que crecen con el catálogo visitado y no con el problema.
   No usar este número como evidencia de fragmentación.

---

## 1. Concurrencia sobre el mismo Home sin caché

### 1.1 No hay unión de peticiones en vuelo — **COMPROBADO (código)**

`cached()` y `cachedIf()` hacen leer → si falta, producir → guardar. No hay mapa
de promesas en vuelo:

- `lib/cache.ts:298-304` (`cached`)
- `lib/reparar-y-cachear.ts:39-44` (`resolverConCache`, donde delega `cachedIf`)

Diez peticiones al mismo Home frío en el mismo proceso ejecutan **diez**
`composeHome`.

**Esto no es una sospecha del auditor: el repositorio ya lo tiene escrito.**
`lib/single-flight.ts:9-11` y `lib/reco.ts:138-139` dicen textualmente que
*"`cached()` no hace single-flight: en un MISS concurrente los tres salen a
TMDB"*. El mecanismo **existe y está probado** (`lib/single-flight.ts`), y hoy
se usa en dos lugares —`lib/reco.ts:156` y `lib/idioma.ts:155`— y **no** en el
camino del Home.

**Matiz que sí funciona, y conviene no romperlo:** las *lecturas* sí se unen
entre peticiones concurrentes. La cola del batcher es de módulo
(`lib/cache.ts:166`), así que dos Homes simultáneos comparten los `MGET`. Lo que
se multiplica es el trabajo del *fetcher*, no el de lectura.

### 1.2 No hay bloqueo distribuido — **COMPROBADO (código)**

Un barrido por `SET NX`, `setnx`, `lock`, `ratelimit` y `rate limit` sobre
`lib/`, `app/` y `hooks/` en `main` no devuelve **ninguna** coincidencia de
implementación. Entre instancias de Vercel no hay nada que coordine: todo el
estado de coordinación que existe (el semáforo de TMDB, la cola del batcher, los
mapas de single-flight) es **estado de módulo**, o sea por proceso.

`tomarTurno` (SET NX, un rearmado por minuto y por clave) existe **sólo en
`feat/dia-rotacion`**, sin mergear. Ver §5.

### 1.3 Impacto

| Escenario | Qué pasa |
|---|---|
| N visitas al mismo Home frío, misma instancia | N composiciones completas |
| N visitas repartidas entre instancias | N composiciones completas, y además cada instancia con su propio techo de concurrencia (§4) |
| Vencimiento del TTL con tráfico | La primera oleada después del vencimiento paga el rearmado entera, no una sola petición |

---

## 2. Normalización y validación de parámetros

### 2.1 `/api/home` no valida nada — **COMPROBADO (ejecutado)**

El handler toma los parámetros crudos:

- `app/api/home/route.ts:29` — `sp.get("providers")?.split(",").filter(Boolean) as PlatformCode[]`.
  El `as` es una afirmación de tipo, no una validación.
- `app/api/home/route.ts:18-25` — `parseTypes` acepta **cualquier** clave con
  valor `movie`/`tv`.

Y la clave sólo ordena, no canoniza (`lib/home.ts:642-644`).

**[R7] La primera versión de este informe publicó "14 pedidos → 11 claves" con
una salida de 13 filas y 10 claves.** La revisión independiente lo detectó: al
pegar la salida se había perdido una fila. La cifra del arnés original era
correcta; **la evidencia publicada no la sostenía**. Se rehízo el ensayo, ampliado
y con la salida íntegra, y va también el arnés para que sea reproducible.

**El arnés** (ejecuta código real: `claveHome` de `lib/claves.ts`, las dos
expresiones textuales de `app/api/home/route.ts:18-25` y `:29`, y las tres líneas
de `lib/home.ts:642-644`; fecha y huella fijas para que la salida no dependa del
día):

```js
const parseProviders = (raw) => (raw?.split(",").filter(Boolean) ?? []);
function parseTypes(raw) {
  const out = {};
  for (const par of raw?.split(",").filter(Boolean) ?? []) {
    const [k, v] = par.split(":");
    if (k && (v === "movie" || v === "tv")) out[k] = v;
  }
  return out;
}
const clave = (provRaw, tRaw) => {
  const providers = parseProviders(provRaw), types = parseTypes(tRaw);
  const p = [...providers].sort().join(",");
  const t = Object.keys(types).sort().map((k) => `${k}:${types[k]}`).join(",");
  return claveHome(20260910, p, t, "es-ES+f.r1:");
};
```

**Salida íntegra, sin recortar:**

```
codigos validos: n,d,m,at,p,cr,pp,mb,un,mv,cv,vx,dg,ok
HOME_GENRES: accion,scifi,terror,drama,comedia,documental | default de 'accion': movie

--- A. orden y vacios (equivalentes)
  providers=n,d,m      t=null                  -> home:es-ES+f.r1::v6:20260910:d,m,n:
  providers=d,m,n      t=null                  -> home:es-ES+f.r1::v6:20260910:d,m,n:
  providers=m,n,d      t=null                  -> home:es-ES+f.r1::v6:20260910:d,m,n:
  providers=n,,d,m     t=null                  -> home:es-ES+f.r1::v6:20260910:d,m,n:
--- B. duplicados
  providers=n          t=null                  -> home:es-ES+f.r1::v6:20260910:n:
  providers=n,n        t=null                  -> home:es-ES+f.r1::v6:20260910:n,n:
  providers=n,n,n      t=null                  -> home:es-ES+f.r1::v6:20260910:n,n,n:
--- C. mayusculas
  providers=N,D,M      t=null                  -> home:es-ES+f.r1::v6:20260910:D,M,N:
  providers=N,d,M      t=null                  -> home:es-ES+f.r1::v6:20260910:M,N,d:
--- D. codigos inexistentes
  providers=zzz        t=null                  -> home:es-ES+f.r1::v6:20260910:zzz:
  providers=___        t=null                  -> home:es-ES+f.r1::v6:20260910:___:
  providers=n,zzz      t=null                  -> home:es-ES+f.r1::v6:20260910:n,zzz:
--- E. toggles: default omitido vs explicito
  providers=n          t=null                  -> home:es-ES+f.r1::v6:20260910:n:
  providers=n          t=accion:movie          -> home:es-ES+f.r1::v6:20260910:n:accion:movie
--- F. claves de riel arbitrarias
  providers=n          t=inventado:movie       -> home:es-ES+f.r1::v6:20260910:n:inventado:movie
  providers=n          t=a:movie,b:tv,c:movie  -> home:es-ES+f.r1::v6:20260910:n:a:movie,b:tv,c:movie
--- G. conjuntos VALIDOS distintos (NO deben converger)
  providers=n          t=null                  -> home:es-ES+f.r1::v6:20260910:n:
  providers=n,d        t=null                  -> home:es-ES+f.r1::v6:20260910:d,n:
  providers=d,m        t=null                  -> home:es-ES+f.r1::v6:20260910:d,m:

TOTAL: 19 filas -> 14 claves distintas
```

**Cuentas exactas, para que no vuelva a pasar:** 19 filas ejecutadas, de las
cuales **17 son entradas distintas** (`providers=n, t=null` aparece tres veces a
propósito, como punto de referencia de los bloques B, E y G), y **14 claves
distintas**.

Lo que prueba, bloque por bloque:

| Bloque | Entrada | Resultado | Lectura |
|---|---|---|---|
| A | `n,d,m` / `d,m,n` / `m,n,d` / `n,,d,m` | **una clave** | ✅ orden y vacíos ya convergen |
| B | `n` / `n,n` / `n,n,n` | tres claves | 🔴 duplicados |
| C | `N,D,M` / `N,d,M` | dos claves, **y ninguna es `d,m,n`** | 🔴 mayúsculas |
| D | `zzz` / `___` / `n,zzz` | tres claves | 🔴 códigos inexistentes |
| E | `t` ausente vs `t=accion:movie` | dos claves | 🔴 el default omitido y el explícito son el mismo Home |
| F | `t=inventado:movie`, `t=a:…,b:…,c:…` | dos claves | 🔴 claves de riel arbitrarias, sin tope |
| G | `n` / `n,d` / `d,m` | tres claves | ✅ **así tiene que ser**: son Homes distintos |

**[R1] Dos cosas que el bloque C obliga a decir bien**, y que la primera versión
de este informe escribió mal en su criterio de aceptación (§9, Etapa 1):

1. `N,D,M` son **tres plataformas válidas mal escritas**: Netflix, Disney+ y Max.
   Canonizar **no puede** significar quedarse con una. Tiene que converger a
   `d,m,n`, con las tres.
2. La ordenación es ASCII, así que ni siquiera es consistente entre sí:
   `N,D,M` → `D,M,N` pero `N,d,M` → `M,N,d`. Las mayúsculas se ordenan antes que
   las minúsculas.

**[R1] Y el bloque E es una clase de equivalencia que no estaba vista.** El
default de `accion` es `movie` (`components/data.ts:19-20`), así que `t` ausente y
`t=accion:movie` piden **exactamente el mismo Home** y hoy son dos entradas de
caché. Con seis rieles de género más `ultimos`, la cantidad de formas de escribir
el mismo Home crece de forma combinatoria. La canonización tiene que expandir los
toggles a su forma completa —o recortarlos a la mínima— pero **una sola de las
dos, siempre la misma**.

**[R1] El bloque G es el control**, y es tan importante como el resto: tres
conjuntos válidos y distintos tienen que seguir dando tres claves distintas. Un
criterio de canonización que los junte no está normalizando, está borrando
plataformas del usuario.

**Corrección al traspaso del 09/09:** dice *"combinaciones equivalentes pueden
producir claves de caché diferentes"*. **Para el ORDEN es falso** —ya converge—.
Es cierto para duplicados, mayúsculas, códigos inexistentes y toggles por
defecto.

### 2.2 La validación existe, pero no donde decide el costo — **COMPROBADO (código)**

`plataformasValidas()` (`lib/ultimos.ts:101-103`) filtra los códigos que no están
en el catálogo. Se usa en **dos** lugares (`lib/enrich.ts:587`,
`lib/ultimos.ts:169`) y **no** en la construcción de la clave ni en las demás
fuentes del Home.

### 2.3 Una clave basura NO cuesta un Home completo — **HIPÓTESIS DESCARTADA**

La hipótesis natural era: código desconocido → `codesToTmdbIds` devuelve `[]` →
`discover` sale **sin** `with_watch_providers` → catálogo entero de AR. Se
verificó y **no es así**: los dos caminos de pools cortan antes.

- `lib/pools.ts:147-148` — `const ids = codesToTmdbIds([plataforma]); if (!ids.length) return [];`
- `lib/pools.ts:230-231` — mismo guard en la consulta combinada.
- `lib/enrich.ts:876-877` — `audienceTitles` idem.
- `lib/enrich.ts:587` — `latestReleases` idem, vía `plataformasValidas`.

Dicho en el idioma de `MANTENIMIENTO.md` 8.b.2: la hipótesis era plausible y
había que mirar el control antes de creerle.

### 2.4 Pero no sale gratis — **COMPROBADO (código)**

Con `providers=zzz` la petición **pasa** el guard de `composeHome`
(`lib/home.ts:420-422`, que sólo mira `!providers.length`) y llega a la única
fuente que no valida los códigos:

- `lib/enrich.ts:1561` — `votedCards` guarda por `!providers.length`, **no** por
  `plataformasValidas`.
- `lib/votes.ts:16-19` — `topVotedRows` va **directo a Supabase, sin caché**.
- Se llama **dos veces** por Home (`mostVoted` y `mostPanned`,
  `lib/enrich.ts:1581-1589`), cada una pidiendo hasta `VOTED_ROWS = 60` filas
  (`lib/enrich.ts:1534`), y por cada fila un `titleCard`.

Y el payload vacío resultante **se guarda**: el predicado de
`lib/home.ts:706` es `!v.degradado && !v.sinPlataformas`, y un Home de rieles
vacíos con plataformas inexistentes no es ninguna de las dos cosas.

**Costo por clave basura, comprobado por lectura: al menos** 1 invocación
serverless + 2 RPC a Supabase sin caché + hasta 120 lecturas de `titleCard` + 1
escritura en Redis de una entrada inútil que vive 6 h.

⚠️ **"Al menos", y la palabra importa.** Eso es lo que se puede afirmar leyendo
`votedCards`; **no es un inventario completo del costo**. Si `top_voted` devuelve
filas, además se llama a `publishedIds` y se enriquece cada título, y ese
enriquecido puede tocar otras dependencias. **La magnitud exacta no está medida**,
y sólo la da el contador de la Etapa 0.

### 2.5 El resto de las rutas

| Ruta | Normaliza | No normaliza |
|---|---|---|
| `/api/home` | orden y vacíos de `providers` | duplicados, mayúsculas, códigos inexistentes, claves de `t`, cantidad, **toggles por defecto vs explícitos** |
| `/api/search` | `trim` + `toLowerCase` de `q`, orden de `providers` (`lib/enrich.ts:1022,1036`) | **longitud de `q` sin tope**, duplicados y códigos de `providers` |
| `/api/upcoming` | `page` y `limit` (`app/api/upcoming/route.ts:38-43`) | **cantidad de `items=` sin tope** (líneas 47-52) |
| `/api/latest` | `page` (`lib/ultimos.ts:105-113`) | — |

`/api/search` es hoy **el amplificador más barato del sistema**: sin autenticar,
cada cadena distinta es una entrada nueva de caché y, según el comentario de
`lib/cache.ts:100-106`, *"7 llamadas de búsqueda a TMDB más un `providersOf` por
título"*. Esa cifra es del comentario, **no medida hoy**.

**Lo que ya está bien y conviene no perder:** `page` se normaliza en las dos
rutas paginadas, y el comentario de `lib/ultimos.ts:111-113` explica por qué —
`?page=x` metía `NaN` y hacía recorrer `total_pages` entero. Es exactamente la
clase de agujero que este informe describe, ya cerrado una vez.

---

## 3. Vencimientos, degradados, errores y límites externos

### 3.1 Un degradado no se guarda, y eso tiene una cara cara de pagar — **COMPROBADO (código)**

`lib/home.ts:703-706` y `lib/reparar-y-cachear.ts:43`: si el payload salió
degradado, se devuelve y **no** se escribe.

La decisión es correcta y está bien argumentada (congelar una caída 6 h para
todos es peor). **La consecuencia que no está cubierta es la otra mitad:**
mientras TMDB esté caído, **cada visita rearma**. La carga contra el servicio que
ya está fallando crece linealmente con el tráfico, y no hay nada que la frene.

### 3.2 El cliente de TMDB no reintenta ni se protege — **COMPROBADO (código)**

`lib/tmdb.ts:56-67`, el cuerpo entero de `tmdb()`:

- `if (!res.ok) throw new Error(...)` — **cualquier** error, incluido 429, es una
  excepción inmediata.
- **No lee `Retry-After`.**
- **No reintenta**, ni con espera ni sin ella.
- **No hay circuito de protección.**
- `AbortSignal.timeout(8000)` por request (línea 60).

La cadena completa: 429 de TMDB → excepción → `safe()` la degrada a riel vacío
(`lib/home.ts:123-135`) → el payload sale `degradado` → **no se guarda** (§3.1) →
la próxima visita rearma y vuelve a golpear a TMDB. **Es un lazo de
realimentación, y está comprobado por lectura de las cuatro piezas.**

### 3.3 Redis caído: la LECTURA está cubierta — **COMPROBADO (código)**

`lib/cache.ts:189-195` (`getSuelto`) y `247-253` (`flush`) capturan el error, lo
registran y devuelven `null`, o sea "no estaba". El contrato es deliberado
("seguí sin caché"), pero con Redis caído **todo** es MISS: cada petición rearma
el Home entero contra TMDB. Es el peor caso de carga externa y no tiene freno
propio.

### 3.3.b [R3] Pero la ESCRITURA no, y un Home BUENO termina en 500 — **COMPROBADO (ejecutado)**

Lo trajo la revisión independiente y es el hallazgo más incómodo del expediente,
porque el camino de lectura está cuidado y el de escritura no.

`guardar` (`lib/cache.ts:258-271`) es `try { await redis.set(...) } finally {…}`
— **sin `catch`**. Compará con `getSuelto` justo arriba, que sí lo tiene. Y
`resolverConCache` (`lib/reparar-y-cachear.ts:43`) **espera** la escritura antes
de devolver:

```ts
const { valor, fallo } = await opts.producir();
if (!fallo) await opts.backend.escribir(opts.clave, valor, opts.ttl);
return valor;
```

Así que si el payload salió **bien** y Redis falla al guardarlo, el rechazo sube
por `cachedIf` → `homePayload`. Ninguno de los tres envoltorios de métricas lo
captura (`withMetricasIdioma`, `withCacheMetrics`, `conRegistroDeEjes`), y
tampoco `safe()`, que envuelve las fuentes **adentro** de `composeHome`, no el
guardado. Termina en el `catch` del handler (`app/api/home/route.ts:32-42`), que
responde **500** con `hero: []` y `rails: []`.

Reproducido sobre el resolver real, con un backend cuyo `escribir()` rechaza:

```
RECHAZO: Redis caido
-> el payload era correcto y el usuario no lo recibe
control (degradado, no escribe): {"hero":["payload DEGRADADO"]}
```

🔴 **Leé el control, que es la parte absurda.** Un payload **degradado** se sirve
sin problema —porque nunca intenta escribir— y un payload **completo y correcto**
se pierde en un 500. El sistema se porta peor cuanto mejor le salió el trabajo.

**Lo que NO se ejecutó:** el handler HTTP completo. La cadena hasta el 500 está
comprobada por lectura de las cinco piezas, no corriendo Next.

**Lo que hay que decidir, y es una decisión de producto, no técnica:** qué recibe
el usuario cuando el Home se armó bien y sólo falló guardarlo. La respuesta
razonable es **servir el payload igual y registrar el fallo de escritura**, que
es lo mismo que ya hace la lectura. Pero es una decisión que hay que tomar
explícitamente, no deducirla, y entra en la Etapa 1.

### 3.3.c [R3] Los cuatro estados de Redis, que hay que tratar por separado

Hoy el informe y el código sólo distinguían dos. Son cuatro, y el plan tiene que
nombrarlos:

| Estado | Hoy | Qué falta decidir |
|---|---|---|
| Lectura caída | Cubierto: `null`, sigue sin caché | Nada |
| **Escritura caída** | **No cubierto: 500 con el payload bueno en la mano** | Qué se sirve (§3.3.b) |
| Redis totalmente caído | Todo MISS, cada petición rearma | Con qué freno, ya que no hay ni turno ni último bueno |
| Recuperación | Sin comportamiento definido | Que no haya una estampida al volver |

🔴 **Y una consecuencia que ordena la Etapa 2:** el "último Home bueno" y el
turno distribuido **viven los dos en Redis**. Si Redis no está, no hay último
bueno que servir ni turno que pedir — o sea que **esa copia no protege de una
caída de Redis**, protege del vencimiento del TTL y de una caída de TMDB. No
hay que venderla como lo que no es.

### 3.4 La única fuente del Home sin caché propia — **COMPROBADO (código)**

`topVotedRows` (`lib/votes.ts:16-19`) va a Supabase en cada MISS. Comparar con
`publishedIds` (`lib/reviews.ts:39`), que sí cachea 5 min. No es grave mientras
el Home pegue en caché; sí lo es en el escenario de §3.1 y en el de §2.4.

### 3.5 Límites de los tres servicios

**Ninguno está medido ni verificado en esta auditoría.** Lo único que hay son
afirmaciones escritas en el repositorio, que se citan como tales:

- TMDB: *"throttlea alrededor de 50 req/s"* (`lib/tmdb.ts:26`). Sin verificar.
- Upstash: *"plan gratuito (500.000/mes)"* (`lib/cache.ts:83-85`). Sin verificar
  contra la cuenta.
- Supabase: no hay ninguna afirmación de límite en el repositorio.

---

## 4. Alcance real de los límites de concurrencia y reintentos

### 4.1 El semáforo de TMDB es por proceso — **COMPROBADO (código)**

`lib/tmdb.ts:38-40`:

```ts
const MAX_EN_VUELO = Math.max(1, Number(process.env.TMDB_MAX_CONCURRENT) || 24);
let enVuelo = 0;
const espera: (() => void)[] = [];
```

`enVuelo` y `espera` son variables de módulo. En Vercel cada instancia de la
función tiene las suyas. **El techo de peticiones en vuelo del sistema es 24 ×
(instancias activas)**, y la cantidad de instancias la decide Vercel según la
carga: o sea que el techo global crece justo cuando más habría que contenerlo.
El 24 además es un default configurable por entorno (`TMDB_MAX_CONCURRENT`).

### [R4] Y acá hay que tener cuidado con las unidades

La primera versión de este informe decía: *"El comentario de al lado dice que
TMDB throttlea cerca de 50 req/s. Con tres instancias el techo declarado ya está
en 72."* **Esa comparación no vale, y la revisión independiente tenía razón.**

- **24 son peticiones EN VUELO** (concurrencia): cuántas están abiertas a la vez.
- **50 req/s es una TASA**: cuántas se emiten por segundo.

No se convierte una en otra sin la latencia media: `tasa ≈ concurrencia /
latencia`. Con 24 en vuelo y respuestas de 200 ms son ~120 req/s **por
instancia**; con respuestas de 2 s son ~12. **72 en vuelo no demuestra 72 req/s,
ni que se pase de 50.**

Lo que sí queda en pie, y es lo que importa: **el techo es por proceso y no hay
ningún límite global**, ni de concurrencia ni de tasa. Que eso alcance o no es
una pregunta abierta.

**Lo que no se puede afirmar:** cuántas instancias levanta Vercel con qué carga,
cuál es la latencia media real, y cuál es el límite verdadero de la cuenta de
TMDB. Son **tres mediciones distintas** y hay que hacer las tres: las dos
primeras en el banco (§10), la tercera consultando la cuenta (§10.5).

### 4.2 [R2] Reintentos: no es "no hay", y la diferencia importa — **COMPROBADO (ejecutado)**

La primera versión decía *"no hay reintentos en ningún lado"*, incluyendo Redis.
**Es falso para Redis**, y lo señaló la revisión independiente. Verificado por
cuenta propia sobre el paquete instalado:

| Cliente | Reintenta | Evidencia |
|---|---|---|
| **Redis (Upstash)** | **Sí, 6 intentos**, sólo fallos de **transporte** | `@upstash/redis` **1.38.0**; `node_modules/@upstash/redis/nodejs.js:152` → `attempts: config.retry?.retries ?? 5`, y el bucle `for (let i = 0; i <= this.retry.attempts; i++)` en :191. `lib/cache.ts:27` instancia `new Redis({ url, token })` **sin** opción `retry`, así que rigen los defaults |
| **TMDB** | **No** | `lib/tmdb.ts:56-67`: `if (!res.ok) throw`. Sin `Retry-After`, sin espera, sin circuito |
| **Supabase** | No se encontró configuración propia | `lib/supabase.ts` |

**El matiz que hay que respetar:** el bucle del SDK envuelve **sólo el `fetch`**.
Una respuesta HTTP de error (`res` llega, no-ok) **sale del bucle y se procesa
afuera**: no se reintenta. O sea que reintenta "no pude hablar con el servidor",
no "el servidor me dijo que no".

**Y trae una consecuencia operativa que no estaba vista.** El backoff por defecto
es `Math.exp(i) * 50` ms: 50, 136, 369, 1004 y 2730 ms. Con el endpoint
inalcanzable, **un solo comando de Redis puede bloquear ~4,3 s dentro del
request** antes de rendirse. Con `maxDuration = 60` no llega a agotar la función,
pero es latencia que hoy nadie ve.

**[R2] Tres cosas distintas que las métricas actuales confunden en una.**
`getSuelto` y `flush` anotan `m.requests += 1` por **llamada lógica**
(`lib/cache.ts:184-188`, `242-245`), sin importar cuántos intentos HTTP hizo el
SDK por debajo. Hay que separar:

1. **Llamadas lógicas** — lo que el código pidió.
2. **Intentos HTTP** — lo que salió al cable, reintentos incluidos.
3. **Comandos ejecutados** — lo que factura Upstash.

Hoy sólo se cuenta la primera y se la llama `requests`. Entra en la Etapa 0.

### 4.3 Límite por IP o por ruta: no hay — **COMPROBADO (código)**

Sin coincidencias en el barrido. No existe `middleware.ts` (lo fija además
`lib/cors-inventario.test.ts`). Nada limita cuántas veces por minuto una IP puede
pedir `/api/home` o `/api/search`.

---

## 5. Servir el último Home bueno mientras uno solo reconstruye

**Hoy no existe, en ninguna de sus dos mitades.** — **COMPROBADO (código)**

- **Una sola copia por clave.** `lib/reparar-y-cachear.ts:39-44`: se lee, y si no
  está, se produce. No hay copia "último bueno" ni servido de contenido vencido
  mientras se revalida.
- **Nadie arbitra quién reconstruye.** §1.1 y §1.2.

Efecto directo, con `TTL.home = 6 h` (`lib/cache.ts:91`): **cada 6 horas, por
cada combinación viva de plataformas y toggles, hay una visita que paga el Home
frío completo.** Con poco tráfico eso es un usuario lento cada tanto. Con
tráfico concentrado, son todos los que lleguen en esa ventana.

### 5.1 Antecedente: `feat/dia-rotacion` — revisada, no integrada

Rama local `14fb256`, remota `0543582`, **divergida**: 242 commits de `main` que
no tiene, 6 propios. Base común `25da546`. Toca 13 archivos.

Lo que aporta, y es genuinamente útil como diseño:

| Pieza | Dónde | Sirve para |
|---|---|---|
| `tomarTurno` (SET NX, un rearmado por minuto y por clave) | `lib/cache.ts` de la rama | Es el bloqueo distribuido que falta (§1.2) |
| `lib/home-refresco.ts` (módulo puro + 8 tests) | nuevo en la rama | La política de "cuándo se permite rearmar" |
| Día con borde a las 04:00, TTL 26 h | `lib/fecha.ts`, `lib/cache.ts` | Mueve el arranque frío fuera del horario de uso |
| Caché corta para el degradado | `lib/cache.ts` | Ataca el lazo de §3.1 |

**Y una advertencia importante sobre esa rama.** Su commit `50b2e75` **introduce**
`fresh=1` y su commit `e243d3d` lo arregla. En `main` **no existe `fresh` en
absoluto** — se verificó en la base común (`25da546`) y en `main` de hoy: la
única aparición es un comentario. O sea: **la rama no arregla un agujero de
`main`; arregla uno que ella misma abre.** Integrarla "porque trae el arreglo de
`fresh`" sería importar el problema junto con la solución.

**No integrarla a ciegas.** Lo que vale es el diseño de `tomarTurno` y de
`home-refresco.ts`, reimplementado sobre `main`.

---

## 6. Caché de CDN y límites por ruta

### 6.1 Hoy no hay ningún caché de CDN — **COMPROBADO (código)**

**Las 26 rutas de `app/api/` declaran `force-dynamic`** (26 archivos `route.ts`,
26 con la directiva). **Ninguna declara caché compartida**: no hay un solo
`s-maxage` ni `stale-while-revalidate` en todo `app/api/`. Las dos únicas que
fijan `Cache-Control` lo hacen para *impedir* el caché o para acotarlo al
navegador — `app/api/cuenta/eliminar/route.ts:15` (`no-store`) y
`app/api/recordatorio/route.ts:165` (`private, max-age=300`) — que es lo
correcto en las dos. `next.config.mjs:56-74` sólo fija encabezados para `/sw.js`
y `/sw/*`, y son `no-store` a propósito. `vercel.json` no tiene configuración de
caché.

**Consecuencia:** cada petición a cualquier API es una invocación serverless.

### 6.2 El Home es un candidato legítimo — **COMPROBADO (código)**

- No lee cookies ni `Authorization`: un barrido sobre `app/api/home/route.ts` y
  `lib/home.ts` no encuentra ninguna de las dos.
- No está personalizado: `personalize()` es la identidad (`lib/home.ts:407`), y
  el comentario de `lib/home.ts:638-640` dice que la clave deja de alcanzar el
  día que eso cambie.
- La respuesta depende sólo de parámetros de la URL.

### 6.3 Qué habría que cuidar con CORS

`Vary: Origin` ya se emite **siempre**, también ante un origen rechazado
(verificado en Producción el 07/09, y fijado por `lib/cors.test.ts:106`). Eso es
justamente lo que hace segura una caché compartida: la respuesta con
`Access-Control-Allow-Origin: https://localhost` no se puede servir a otro
origen. **Sin `Vary: Origin`, agregar `s-maxage` sería un bug de seguridad.** Ya
está, pero hay que verificarlo otra vez después de tocar el caché, no asumirlo.

### 6.4 Y una cosa que CORS no hace, y conviene decirla

CORS es una regla que aplica **el navegador**. `lib/cors.ts` sólo agrega
encabezados a la respuesta; no rechaza la petición. Un tercero puede llamar a
`/api/home` desde su servidor y recibir el payload completo. **Esto no es un
defecto de la implementación de CORS** —ningún CORS hace eso— sino la razón por
la que el límite por IP/ruta de §4.3 es la única defensa real.

### 6.5 Rutas que NO pueden ir a CDN

Cualquiera con `Authorization`: `/api/te-va-a-gustar`, `/api/admin/*`,
`/api/admin-search`, `/api/cron/*`. Y las que dependen de datos del usuario.

---

## 7. Observabilidad

### 7.1 Lo que hay — **COMPROBADO (código)**

| Instrumento | Dónde | Qué mide |
|---|---|---|
| `[home] HIT/MISS <clave>` | `lib/home.ts:711` | Tasa de aciertos y fragmentación de claves |
| `[home] Xms \| N comandos \| N requests \| hits/misses \| lotes` | `lib/home.ts:719-724` | Latencia y **comandos de Redis** |
| `[idioma] ...` | `lib/home.ts:712-715` | Llamadas de respaldo de idioma |
| `console.error` | 3 rutas: home, top, te-va-a-gustar | Fallos del handler |
| `/api/health` | `app/api/health/route.ts` | Estado de Redis y `dbsize` |
| Vercel Analytics + Speed Insights | `app/layout.tsx:133-138` | **Visitas** y Web Vitals del navegador, **sólo en la web** |

### 7.2 Lo que falta, y es lo que hace falta para esta pregunta

1. **No hay contador de llamadas a TMDB.** `CacheMetrics`
   (`lib/cache.ts:123-131`) tiene `comandos`, `requests`, `claves`, `hits`,
   `misses`, `lotes`, `msCache` — **todos de Redis**. Ninguno de TMDB. Hoy no se
   puede responder "cuántas llamadas a TMDB costó este Home" sin agregar
   instrumentación. Es exactamente la cifra que el traspaso afirma ("más de
   600") y que **no se puede verificar con lo que hay**.
2. **No hay contador de consultas a Supabase.**
3. **Analytics mide visitas, no solicitudes.** Un usuario que rearma el Home
   cuatro veces por tocar toggles es una visita y cuatro reconstrucciones.
4. **El tráfico de Android no aparece en Analytics, y es una decisión tomada.**
   `app/layout.tsx:133` monta Analytics y Speed Insights sólo si `!ES_NATIVO`.
   El comentario de al lado documenta por qué (medido el 06/09: en el contenedor
   los dos piden su script al origen local, reciben 404 y no miden nada; lo único
   que dejaban eran dos errores de consola por arranque). O sea: no es un defecto
   a corregir, es una limitación que hay que rodear — **justo para el tráfico que
   está creciendo con la prueba cerrada de Play, no hay ninguna medición del lado
   del cliente.** Lo único que deja rastro son las peticiones a la API, que hoy no
   se pueden separar por origen.

   ⚠️ **Corrección a un informe anterior.** El de la release (07/09, §20.e de
   `docs/superpowers/plans/2026-09-05-etapa3-android-publicable.md`) dice que en
   el contenedor esos scripts producen "dos pedidos muertos al arrancar". **Es
   incorrecto**: los componentes no se montan, así que no se pide nada. Lo que sí
   es cierto de aquel informe es que las librerías **siguen adentro del bundle**
   —el propio comentario del layout lo dice y explica que sacarlas de verdad
   pediría sustituir el módulo en el staging del build nativo—. El error fue mío:
   se dedujo del literal presente en el artefacto sin leer el gate del layout.
5. **Los logs no se pudieron recuperar.** `vercel logs` sobre el deployment de
   Producción devolvió `No logs found` el 10/09. Los `[home] HIT/MISS` —el único
   instrumento de tasa de aciertos que tiene la app— **no fueron legibles a
   posteriori** con el CLI en esta cuenta. No se investigó si es la retención del
   plan o del comando; el hecho es que hoy no hay serie histórica.
6. **`/api/health` cuesta 3 comandos de Redis por llamada** (`SET` + `GET` +
   `DBSIZE`, `lib/cache.ts:62-65`). Un monitor externo cada minuto son ~4.320
   comandos por día, ~130.000 por mes. Contra el plan gratuito que el propio
   repositorio cita, es **~26% de la cuota mensual gastada en monitorear**. Si
   hay un monitor configurado, esto importa; no se verificó si lo hay.

---

## 8. Resumen de hallazgos, ordenados por lo que cuestan

| # | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| H1 | Ninguna unión de peticiones en vuelo: N visitas al Home frío = N composiciones | `lib/cache.ts:298-304`, `lib/reparar-y-cachear.ts:39-44` | COMPROBADO (código) |
| H2 | Sin bloqueo distribuido: las instancias no se coordinan | barrido sin coincidencias | COMPROBADO (código) |
| H3 | Un degradado no se guarda **y** TMDB no reintenta: durante una caída, cada visita rearma | `lib/home.ts:706`, `lib/tmdb.ts:62` | COMPROBADO (código) |
| H4 | El techo de concurrencia de TMDB es por proceso: real = 24 × instancias | `lib/tmdb.ts:38-40` | COMPROBADO (código) |
| H5 | `/api/home` no valida `providers` ni `t`: duplicados, mayúsculas y códigos inexistentes son claves nuevas | ejecutado, §2.1 | COMPROBADO (ejecutado) |
| H6 | Una clave con plataformas inexistentes igual cuesta 2 RPC de Supabase sin caché y hasta 120 `titleCard`, y **se guarda** | `lib/enrich.ts:1561`, `lib/votes.ts:16`, `lib/home.ts:706` | COMPROBADO (código) |
| H7 | Sin "último bueno": al vencer el TTL, alguien paga el Home frío completo | `lib/reparar-y-cachear.ts:39-44`, `lib/cache.ts:91` | COMPROBADO (código) |
| H8 | Cero caché de CDN: 26/26 rutas `force-dynamic` | conteo | COMPROBADO (código) |
| H9 | Sin límite por IP/ruta, y CORS no lo suple | barrido; `lib/cors.ts` | COMPROBADO (código) |
| H10 | `/api/search`: `q` sin tope de longitud, cada cadena distinta es una entrada de caché | `app/api/search/route.ts:9`, `lib/enrich.ts:1036` | COMPROBADO (código) |
| H11 | `/api/upcoming?items=` sin tope de cantidad | `app/api/upcoming/route.ts:47-52` | COMPROBADO (código) |
| H12 | No hay contador de llamadas a TMDB ni a Supabase | `lib/cache.ts:123-131` | COMPROBADO (código) |
| H13 | El tráfico de Android no genera ninguna medición del lado del cliente (decisión tomada, no defecto) | `app/layout.tsx:133` | COMPROBADO (código) |
| H14 | `/api/health` cuesta 3 comandos de Redis por llamada | `lib/cache.ts:62-65` | COMPROBADO (código) |
| H15 | Comentario obsoleto: `te-va-a-gustar/route.ts:35` menciona "el `fresh=1` del Home", que no existe en `main` | `git grep` en `main` | COMPROBADO (ejecutado) |
| **H16** | **Un Home BUENO termina en 500 si falla la escritura en Redis**, mientras que uno degradado se sirve sin problema | `lib/cache.ts:258-271` sin `catch`, `lib/reparar-y-cachear.ts:43` | **COMPROBADO (ejecutado)** |
| H17 | Las métricas cuentan llamadas lógicas, no intentos HTTP: el SDK de Redis reintenta 6 veces por debajo y eso no se ve | `lib/cache.ts:184-188`, `@upstash/redis/nodejs.js:152` | COMPROBADO (ejecutado) |

### Dónde quedó registrado cada uno

Los hallazgos de este informe se llaman **H**; los issues de `ISSUES.md` se
llaman **#**. No son la misma numeración y conviene no confundirlas:

| Issue | Hallazgos que agrupa |
|---|---|
| [#17](../ISSUES.md) — Home frío rearmado N veces | H1, H2, H7 |
| #18 — `/api/home` no canoniza | H5, H6, H10, H11 |
| #19 — Caída de TMDB realimentada | H3, H4 |
| #20 — No se puede medir el costo externo | H12, H13, H14, H17 |
| **#21** — Escritura fallida en Redis → 500 — **RESUELTO el 11/09** (Etapa PREVIA, §9) | **H16** |

H8 (sin CDN), H9 (sin límite por ruta) y H15 (comentario obsoleto) no tienen
issue propio: van en la Etapa 4 y en el margen.

### Lo que se revisó y **no** es un problema

- El **orden** de `providers` ya converge (§2.1).
- Un código de plataforma inexistente **no** dispara un `discover` sin filtro:
  los tres caminos de pools cortan (§2.3).
- Las **lecturas** de Redis sí se unen entre peticiones concurrentes (§1.1).
- `page` está normalizada en las rutas paginadas (§2.5).
- `Vary: Origin` ya se emite siempre, que es la condición previa de cualquier
  caché compartida (§6.3).
- Analytics **no** se monta en el contenedor: está gateado por `!ES_NATIVO`
  (`app/layout.tsx:133`), con la medición que lo motivó escrita al lado.
- **El cliente de Redis sí reintenta** fallos de transporte (§4.2). La afirmación
  contraria de la primera versión de este informe era incorrecta.
- **La LECTURA de Redis está bien cubierta**: captura, registra y sigue. Lo que
  no está cubierto es la escritura (§3.3.b).

---

## 9. Plan por etapas

Cada etapa es independiente y se puede parar después de cualquiera. **Ninguna
fija un número definitivo sin medición.**

| Etapa | Qué hace | ¿Depende de medir? |
|---|---|---|
| **PREVIA** ✅ hecha el 11/09 | El 500 por escritura fallida en Redis (#21) | **No** |
| 0 | Poder medir | — |
| 1 | Canonizar entradas + single-flight **del Home** | Sí, para verificar |
| 2 | Turno distribuido + último bueno | Sí |
| 3 | Resistencia frente a TMDB | Sí |
| 4 | CDN + límite por ruta | Sí |
| 5 | Observabilidad permanente | — |

La **Etapa PREVIA** existe justamente porque es la única casilla con "No" en esa
columna: todo el resto arranca por instrumentar, y ella no tiene por qué esperar.

### Etapa PREVIA — El 500 que no espera a que sepamos medir (#21)

**Va antes que la Etapa 0, y es la única que no depende de ninguna medición.**
Todo el resto del plan arranca por instrumentar; esto no, porque no hay nada que
medir: el comportamiento actual es incorrecto en cualquier escenario de carga y
también sin carga.

**El problema** (§3.3.b, issue #21): `guardar` (`lib/cache.ts:258-271`) es
`try { await redis.set(...) } finally { … }` **sin `catch`**, y
`resolverConCache` (`lib/reparar-y-cachear.ts:43`) espera esa escritura antes de
devolver. Un rechazo de `redis.set` sube hasta el `catch` del handler
(`app/api/home/route.ts:32-42`) y sale como **500 con `hero: []` y `rails: []`**.
Reproducido sobre el resolver real.

🔴 **Y el control es la parte que lo vuelve indefendible:** un payload
**degradado** se sirve sin problema —porque nunca intenta escribir— y uno
**completo y correcto** se pierde. El sistema se porta peor cuanto mejor le salió
el trabajo.

#### La decisión, aprobada por el dueño el 10/09

> **Si el payload se produjo correctamente y sólo falla la escritura en Redis, se
> entrega al usuario y se registra el error.**

No es un detalle de implementación: es la única de las tres opciones posibles
—entregar, reintentar, fallar— que hay que elegir explícitamente, y **ya está
elegida**. Es además el mismo contrato que la lectura ya cumple desde siempre
(`lib/cache.ts:189-195`: capturar, registrar, seguir). Esta etapa cierra la
asimetría entre los dos caminos, no inventa una política nueva.

#### Alcance

1. `guardar` captura el fallo de escritura, lo registra y **no lo propaga**.
2. El registro tiene que ser distinguible de un fallo de lectura: no es lo mismo
   "no pude leer el caché" que "armé un Home bueno y no lo pude guardar". El
   segundo significa además que **el próximo request va a rearmar**.
3. **No** se cambia el resto del contrato: un degradado sigue sin guardarse, y
   una lectura caída sigue siendo un MISS.

#### Criterios de aceptación

- Con la escritura de Redis fallando y un payload **correcto**: el usuario
  **recibe el payload**, con 200, y el fallo queda registrado.
- Con la escritura fallando y un payload **degradado**: comportamiento idéntico
  al de hoy — se entrega y no se guarda. **No puede haber una regresión acá.**
- Con la **lectura** fallando: comportamiento idéntico al de hoy (MISS, sigue sin
  caché).
- Un fallo de escritura y uno de lectura se distinguen en el registro.
- Los tests existentes siguen en verde.

⚠️ **Lo que esta etapa NO arregla, y conviene decirlo:** no reduce ni una llamada
externa, no coordina nada y no mejora la capacidad. Sólo deja de perder trabajo
que ya estaba bien hecho. Está primera por barata y por segura, no por
importante.

#### Por qué va antes de la Etapa 0 y no adentro de la Etapa 1

Estaba escrita como el punto 5 de la Etapa 1 y **eso la ponía detrás de toda la
instrumentación**, que es la parte más lenta del plan. No hay ninguna razón para
esperar: el arreglo es un `catch`, la decisión ya está tomada, y sus criterios de
aceptación se comprueban con el resolver real —igual que se reprodujo el
problema— sin necesitar el banco, ni contadores, ni Producción.

#### Cierre — 11/09/2026: implementada, mergeada, pusheada y desplegada

- **Rama** `fix/cache-escritura-no-rompe`: `fix(cache)` + `test(cache)`, auditada
  por Codex (`f8f42a5`) sin bloqueos técnicos; rebaseada sobre `07ccecf` y
  mergeada en `main` con `--no-ff` como **`3ad935d`**. Documentales: `548ffb6`
  (mergeado, sin deploy) y el commit que cierra esta sección.
- **Verificado desde cero sobre el `main` mergeado:** `lib/escritura-cache.test.ts`
  18/18; `npm test` 1355/1365, 0 fallos, 10 omitidos; `tsc --noEmit` limpio;
  `npm run build` exit 0 en 2 min 2 s con `.next` borrado antes
  (`BUILD_ID ZFfliiMz09Hs25ZLT5evT`); `git diff --check` limpio.
- **Deploy:** push `adf7065..548ffb6`; deployment de Producción de Vercel para
  `548ffb6` con estado `success` (GitHub Deployments API) y, por `vercel inspect
  app.yump.ar`, el dominio **aliasado a ese mismo deployment**
  (`streamingcentral-qdsh71vxj…`, `● Ready`). El cambio es de servidor
  (`lib/cache.ts`), así que ningún byte del cliente lo distingue del deploy
  anterior: la evidencia es el alias, no el bundle.
- **Lo comprobado ejecutando:** el comportamiento del resolver con la política
  compuesta (los siete escenarios y sus controles), y que producción entra por
  `guardarSinRomper` (guards que fallan 3 de 3 contra el código anterior).
- **Lo inferido:** el HTTP 200 al usuario. Se deduce del handler
  (`NextResponse.json(await homePayload(...))` ya no entra al `catch` del 500);
  **no se probó provocando una caída real de Redis**, ni en Producción ni en
  un banco.
- **Lo que esto NO hace:** no agrega capacidad, single-flight, bloqueo ni CDN.
  Únicamente evita perder un payload válido cuando falla su escritura. La
  siguiente etapa es la **Etapa 0** (poder medir), que no se inició.

#### El issue #21, tal como estaba en `ISSUES.md` al retirarlo (11/09) — Si falla la escritura en Redis, un Home BUENO termina en 500

**Detectado el 10/09/2026** por la revisión independiente
(`medidas/2026-09-10-revision-capacidad-codex.md`, punto 3) y **reproducido**
sobre el resolver real. Es el más chico de los cinco y **el más urgente**: es un
`catch` que falta y no depende de medir nada.

##### La asimetría

El camino de **lectura** de Redis está cuidado: `getSuelto` (`lib/cache.ts:189-195`)
y `flush` (`247-253`) capturan el error, lo registran y devuelven `null`, o sea
"no estaba". El contrato es explícito: *"seguí sin cache"*.

El de **escritura** no. `guardar` (`lib/cache.ts:258-271`) es
`try { await redis.set(...) } finally { … }` — **sin `catch`**. Y
`resolverConCache` (`lib/reparar-y-cachear.ts:43`) **espera** la escritura antes
de devolver:

```ts
const { valor, fallo } = await opts.producir();
if (!fallo) await opts.backend.escribir(opts.clave, valor, opts.ttl);
return valor;
```

Así que un rechazo de `redis.set` sube por `cachedIf` → `homePayload`. Ninguno de
los tres envoltorios de métricas lo captura (`withMetricasIdioma`,
`withCacheMetrics`, `conRegistroDeEjes`), y `safe()` tampoco: envuelve las fuentes
**adentro** de `composeHome`, no el guardado. Termina en el `catch` del handler
(`app/api/home/route.ts:32-42`) → **500** con `hero: []` y `rails: []`.

##### Reproducido

Ejecutado sobre `resolverConCache` real con un backend cuyo `escribir()` rechaza:

```
RECHAZO: Redis caido
-> el payload era correcto y el usuario no lo recibe
control (degradado, no escribe): {"hero":["payload DEGRADADO"]}
```

🔴 **El control es la parte absurda.** Un payload **degradado** se sirve sin
problema —porque nunca intenta escribir— y uno **completo y correcto** se pierde
en un 500. **El sistema se porta peor cuanto mejor le salió el trabajo.**

**Lo que NO se ejecutó:** el handler HTTP completo. La cadena hasta el 500 está
comprobada leyendo las cinco piezas, no corriendo Next.

##### Los cuatro estados de Redis, que hay que tratar por separado

| Estado | Hoy | Falta |
|---|---|---|
| Lectura caída | Cubierto | Nada |
| **Escritura caída** | **500 con el payload bueno en la mano** | Decidir qué se sirve |
| Redis totalmente caído | Todo MISS, cada petición rearma | Con qué freno: no hay ni turno ni último bueno (viven en Redis, ver #17) |
| Recuperación | Sin definir | Que no haya estampida al volver |

##### La decisión — **APROBADA por el dueño el 10/09**

> **Si el payload se produjo correctamente y sólo falla la escritura en Redis, se
> entrega al usuario y se registra el error.**

Era una de tres opciones posibles —entregar, reintentar, fallar— y estaba
planteada como propuesta. Ya está elegida. Es además el mismo contrato que la
**lectura** cumple desde siempre (`lib/cache.ts:189-195`: capturar, registrar,
seguir): esto cierra la asimetría entre los dos caminos, no inventa una política
nueva.

##### 🔴 Prioridad: ETAPA PREVIA, antes de la Etapa 0

Este issue **no depende de ninguna medición** y es el único del expediente del
que se puede decir eso. Estaba escrito como punto 5 de la Etapa 1, o sea detrás
de toda la instrumentación, y el dueño lo corrigió el 10/09: pasa a ser una etapa
propia, anterior a la Etapa 0. Ver la **Etapa PREVIA** en
`medidas/2026-09-10-capacidad-trafico.md` §9.

El arreglo es un `catch`; sus criterios se comprueban con el resolver real —igual
que se reprodujo el problema— sin banco, sin contadores y sin Producción.

##### Alcance del arreglo

1. `guardar` captura el fallo de escritura, lo registra y **no lo propaga**.
2. El registro distingue "no pude leer el caché" de "armé un Home bueno y no lo
   pude guardar". El segundo además implica que el próximo request va a rearmar.
3. **No** cambia el resto del contrato: un degradado sigue sin guardarse, y una
   lectura caída sigue siendo un MISS.

##### Estado: MERGEADO en `main` (`3ad935d`), todavía sin deploy

Al 11/09/2026. Codex auditó `f8f42a5` sin bloqueos técnicos; la rama
`fix/cache-escritura-no-rompe` se rebaseó sobre `main` = `07ccecf` (`e4a9d52`) y
entró con `--no-ff` como `3ad935d`. **Sin pushear ni desplegar todavía.** Sobre
el `main` mergeado, desde cero: `lib/escritura-cache.test.ts` 18/18; `npm test`
1355/1365, 0 fallos, 10 omitidos; `tsc --noEmit` limpio; `npm run build` exit 0
en 2 min 2 s con `.next` borrado antes (`BUILD_ID ZFfliiMz09Hs25ZLT5evT`);
`git diff --check adf7065..3ad935d` limpio. **Comprobado: el comportamiento del
resolver. Inferido: el HTTP 200** — se deduce del handler, no se probó
provocando una caída real de Redis. El alcance es el de siempre: `guardar` captura el fallo de escritura, lo registra y no lo
propaga. Nada más — sin instrumentación, single-flight, bloqueo, CDN ni límites.

La política vive en `lib/escritura-cache.ts` (módulo puro, por el mismo motivo
que `lib/reparar-y-cachear.ts`: `lib/cache.ts` arrastra Upstash y no se puede
importar desde `node --test`) y `guardar` delega en ella.

**18 tests en `lib/escritura-cache.test.ts`**, en dos grupos que se necesitan:

- **Los siete escenarios** componen la política con `resolverConCache` REAL —la
  misma función que corre en producción—, cada uno con su control contra el
  `guardar` viejo. Los dos que faltaban del criterio de cierre, agregados el
  11/09:
  - **Redis entero caído** (lectura y escritura fallan en el mismo recorrido):
    el payload correcto se entrega, el productor corre una vez, la lectura
    fallida cuenta como MISS, el fallo de escritura queda registrado con su
    clave y **no queda nada guardado**. Control: el mismo recorrido con el
    `guardar` viejo rechaza.
  - **Recuperación:** la primera solicitud no puede leer ni guardar y entrega
    el payload (1 producción, 1 aviso, nada guardado); Redis vuelve; la segunda
    lee MISS, rearma y guarda (2 producciones, sin aviso nuevo); la tercera es
    **HIT** — devuelve lo guardado por la segunda, **no ejecuta el productor**
    (sigue en 2) y no intenta escribir. Control: con el `guardar` viejo la
    primera rechaza; y se deja dicho que rearmar y guardar tras volver no es
    mérito del arreglo — el código viejo también lo hace.
  ⚠️ Los siete pasan **también contra el `lib/cache.ts` de `main`** (verificado
  el 11/09 sustituyendo el archivo: 15 pasan, 3 fallan — los tres guards). No
  importan `lib/cache.ts`, así que no pueden verlo: prueban que la política es
  correcta, no que producción la use.
- **Los guards estructurales** son los que atan producción: `guardar` delega en
  `guardarSinRomper`, el `redis!.set` está adentro del callback que la política
  envuelve, el camino de lectura quedó intacto y el aviso distingue escritura de
  lectura. **Fallan 3 de 3 contra el código de `main`.**

**Sobre "el usuario recibe el payload, con 200":** lo que se ejecuta es el
resolver (`resolverConCache`) devolviendo el payload con la escritura fallando.
**El handler HTTP no se ejecuta en ningún test**: `app/api/home/route.ts`
importa `lib/home.ts` → Upstash y TMDB, y no se puede levantar aislado sin
credenciales. El 200 se **deduce** del camino del handler: `manejar` hace
`NextResponse.json(await homePayload(...))`, y con el resolver resolviendo en
vez de rechazar ya no entra al `catch` que responde 500. Es una inferencia sobre
código leído, no una prueba realizada, y queda como tal.

Verificación del 11/09 sobre la rama antes del merge: `lib/escritura-cache.test.ts`
18/18; `npm test` **1355/1365, 0 fallos, 10 omitidos** (con `.next` de
producción; con el `.next` ausente omite 18); `tsc --noEmit` limpio; `npm run
build` exit 0 en 2 min 16 s. Repetida sobre el `main` mergeado (arriba).
Pendiente: push y deploy.

##### Criterio de cierre

- Escritura fallando + payload **correcto** → el usuario **recibe el payload**,
  con 200, y el fallo queda registrado.
- Escritura fallando + payload **degradado** → idéntico a hoy: se entrega y no se
  guarda. **No puede haber regresión acá.**
- **Lectura** fallando → idéntico a hoy (MISS, sigue sin caché).
- Un fallo de escritura y uno de lectura se distinguen en el registro.
- Probados por separado: sólo lectura caída, sólo escritura caída, Redis entero
  caído, y recuperación.

⚠️ **Lo que este issue NO arregla:** no reduce una sola llamada externa, no
coordina nada y no mejora la capacidad. Sólo deja de perder trabajo que ya estaba
bien hecho.

### Etapa 0 — Poder medir (antes de tocar el resto)

Sin esto, las etapas siguientes se evalúan a ciegas.

1. Contador de llamadas a TMDB y a Supabase por petición, con el **mismo**
   mecanismo que ya usa el caché (`AsyncLocalStorage`, `lib/cache.ts:132`), y
   sumado a la línea `[home]` que ya existe.
2. **[R2] Separar las tres unidades que hoy se llaman `requests`**: llamadas
   lógicas, intentos HTTP (reintentos del SDK incluidos) y comandos facturados.
   Sin esto, la Etapa 3 se mide contra un número que miente.
3. **Contador de composiciones ejecutadas**, no sólo de HIT/MISS. Es lo que
   arbitra el criterio central de las Etapas 1 y 2.
4. Una variable para la base de TMDB (hoy `lib/tmdb.ts:11` está clavada), para
   poder apuntar el banco a un doble.
5. El banco de la §10.

**Aceptación:** una petición al Home frío en el banco imprime, **por separado**:
llamadas a TMDB, consultas a Supabase, llamadas lógicas / intentos HTTP /
comandos de Redis, y composiciones ejecutadas. **Ese es el primer número real de
este expediente.**

⚠️ **Una trampa de medición que hay que resolver en esta etapa, no después.** Las
métricas de Redis se le anotan **a quien programa el flush**, no a quien pidió la
clave — está escrito en `lib/cache.ts:143-146` y es deliberado ("para diagnóstico
está bien; no lo uses para facturar"). En cuanto entre el single-flight de la
Etapa 1, un lector que **espera** una composición ajena va a ser indistinguible
de un HIT y de un productor propio. **Hay que poder separar tres estados: HIT de
caché, espera compartida, y composición propia.** Si no, el criterio "una sola
composición" se vuelve incomprobable justo cuando hace falta.

### Etapa 1 — Canonizar entradas y unir lo que está en vuelo

Barato, sin infraestructura nueva, y ataca H1, H5, H6, H10, H11.

1. Una función de canonización de `providers`, en este orden: **minúsculas →
   filtrar contra el catálogo → deduplicar → ordenar → tope de cantidad**.
   Aplicarla **antes** de construir la clave. El orden importa: bajar a
   minúsculas **antes** de filtrar es lo que conserva `N,D,M`.
2. Lo mismo para `t`: sólo claves de riel conocidas, y **una forma canónica
   única** frente a los defaults (o siempre completa, o siempre mínima).
3. Tope de longitud para `q` y de cantidad para `items=`.
4. Aplicar `crearSingleFlight` (`lib/single-flight.ts`, **ya existe y ya está
   probado**) — **acotado al Home**. Ver el alcance más abajo, que es una
   decisión y no un detalle.

*(El punto que estaba acá sobre la escritura fallida en Redis se movió a la Etapa
PREVIA: no tiene por qué esperar a la instrumentación.)*

**Aceptación — la parte que preserva plataformas [R1]:**

| Entrada | Clave esperada | Por qué |
|---|---|---|
| `n,d,m` / `d,m,n` / `n,,d,m` | `d,m,n` | ya funciona, no romperlo |
| **`N,D,M` / `N,d,M`** | **`d,m,n`** | 🔴 **las TRES plataformas, no `n`**. Son Netflix, Disney+ y Max mal escritas |
| `n,n` / `n,n,n` | `n` | duplicados |
| `n,zzz` | `n` | se descarta el desconocido, se conserva el válido |
| `zzz` / `___` | vacío → `sinPlataformas` | no queda ninguna válida |
| `t` ausente vs `t=accion:movie` | la misma | `movie` es el default de `accion` |
| **`n` / `n,d` / `d,m`** | **tres claves distintas** | 🔴 **control**: son Homes distintos y tienen que seguir siéndolo |

🔴 **La última fila no es una formalidad.** La primera versión de este informe
pedía que `N,D,M` convergiera a `n`, o sea que **le borraba Disney+ y Max al
usuario**. Un criterio de canonización sin el control de conjuntos válidos
distintos no distingue "normalizar" de "perder datos".

**Aceptación — el resto:**
- Un `providers` que queda vacío después de canonizar responde como
  `sinPlataformas` y **no** consulta Supabase.
- 100 peticiones concurrentes al mismo Home frío en un solo proceso ejecutan
  **una** composición (medido con el contador de composiciones de la Etapa 0, no
  deducido de HIT/MISS).
- **El single-flight toca `lib/home.ts` y nada más.** Un barrido falla si aparece
  en `cached`/`cachedIf` o en otro de los 20 sitios sin la demostración de los
  cinco puntos de arriba.
- Con dos peticiones concurrentes al mismo Home y un fallo de disponibilidad en
  el medio, **ninguna de las dos guarda el payload degradado como sano**.
- Los tests existentes siguen en verde.
- *(El criterio de la escritura fallida se movió a la Etapa PREVIA.)*

#### El alcance del single-flight: acotado al Home, y por qué

La primera versión de este plan decía "aplicar `crearSingleFlight` al camino de
`cached`/`cachedIf`", o sea **a los 21 llamadores de una vez**. Eso es un cambio
global de semántica en la capa que usa toda la aplicación, propuesto sin
inventario. **Se acota al Home**, y abajo está la evidencia de por qué.

**El inventario, que antes no existía.** 21 sitios de llamada fuera de
`lib/cache.ts`, con **seis familias de TTL** distintas:

| Módulo | Sitios | TTL |
|---|---|---|
| `lib/enrich.ts` | 12 (`:89`, `:133`, `:165`, `:491`, `:541`, `:1035`, `:1152`, `:1236`, `:1246`, `:1418`, `:1502`) | `providers`, `editorial`, `search`, `catalog` |
| `lib/reco.ts` | 4 (`:167`, `:205`, `:243`, `:335`) | `catalog`, `reco` |
| `lib/pools.ts` | 2 (`:170`, `:234`) | `pool` |
| `lib/top.ts` | 1 (`:69`) | `catalog` |
| `lib/curated.ts` | 1 (`:112`) | `catalog` |
| `lib/reviews.ts` | 1 (`:39`) | `editorial` |
| **`lib/home.ts`** | **1 (`:688`)** | **`home`** |

🔴 **El riesgo concreto, y no es teórico: los contextos de degradación son
`AsyncLocalStorage` por request.** `lib/fallos-disponibilidad.ts:40` y
`lib/idioma.ts:120` guardan sus contadores ahí, y de esos contadores sale el
`degradado` que decide **si el payload se guarda o no** (`lib/home.ts:619-627` y
`:696-706`).

Con un single-flight profundo, el trabajo compartido corre dentro del contexto
async de **quien lo empezó**. O sea: si el request B comparte una promesa del
request A, los `registrarFalloDisponibilidad` que ocurran durante ese trabajo se
anotan en el contador de **A**, y el de **B queda en cero**. B recibe entonces un
payload construido con fallos, lo cree limpio y **lo guarda como bueno**.

**Congelar una degradación bajo una clave sana, hasta 6 h, es exactamente el bug
que `cachedIf` existe para impedir.** Se lo introduciría el mecanismo que viene a
mejorar las cosas.

**Por qué el Home no tiene ese problema, y es por construcción.** Ahí el
single-flight envuelve la llamada entera a `cachedLocIf` (`lib/home.ts:688`), o
sea la decisión de degradación **ya viene tomada adentro del payload que se
comparte**. El que llega segundo no produce, no evalúa ningún predicado y **no
escribe**: sólo recibe el resultado de A, con su verdicto adentro. No hay
contador propio que pueda quedar desincronizado, porque no hay nada que decidir.

**Y es donde está casi todo el beneficio.** Una composición del Home es el
trabajo más caro del sistema; los otros 20 sitios son lecturas de grano fino que
el batcher (`lib/cache.ts:166`) **ya une entre requests concurrentes** — no las
llamadas externas, pero sí los viajes a Redis.

#### Qué haría falta para que la integración global sea aprobable

No está prohibida: está **sin demostrar**. Para proponerla hay que traer, y en
este orden:

1. **Inventario cerrado** de los 21 sitios con, por cada uno: familia de clave,
   TTL, tipo del valor, predicado, y **qué contexto async lee o escribe**.
2. **Demostración de que ninguna familia de clave la producen dos sitios con TTL,
   tipo o predicado distintos.** Si dos sitios pueden generar la misma clave, el
   que gane la carrera le impone su TTL al otro.
3. **Prueba del caso de degradación compartida**: dos "requests" concurrentes
   sobre la misma clave, con un fallo de disponibilidad o de idioma en el medio,
   y verificar que **ninguno de los dos** guarda un payload degradado como sano.
   Es la prueba que hoy no existe y sin la cual esto no se puede aprobar.
4. **Semántica del error compartido**: hoy si el fetcher de A lanza, sólo A lo
   ve. Compartida, B recibe la excepción de A y su `safe()` cuenta un fallo que
   B no causó. Hay que decidir si eso es correcto —probablemente sí, el fetch
   realmente falló— y **documentarlo**, no descubrirlo.
5. **Métricas ya separadas** (Etapa 0): HIT, espera compartida y composición
   propia. Sin eso no se puede ni medir si el cambio global sirvió.

**Mientras tanto**, el Home cubre el caso caro y el resto queda como está.

### Etapa 2 — Turno distribuido y último bueno

Ataca H2 y H7. Es donde está el salto de resistencia.

1. Turno con `SET NX` y vencimiento, en Redis, por clave. Diseño ya escrito en
   `feat/dia-rotacion` (`tomarTurno`): **reimplementar sobre `main`, no
   mergear** (§5.1).
2. Segunda copia "último bueno" con TTL largo. Al vencer la copia fresca: servir
   el último bueno, dejar que **uno** reconstruya.
3. **Un degradado nunca pisa el último bueno.** Es la regla que ya existe
   (`lib/reparar-y-cachear.ts:43`), extendida a la copia larga.

#### [R6] El contrato del turno, completo — porque `SET NX` solo no alcanza

La primera versión de este informe decía "turno con `SET NX` y vencimiento" y
daba por hecho el resto. **No alcanza**, y lo señaló la revisión independiente:
`SET NX` con vencimiento **no garantiza una sola composición** si la composición
tarda más que el vencimiento. Con un Home frío que puede tardar segundos y un
turno de, digamos, 30 s, que se pase no es un caso raro.

Siete decisiones que hay que tomar **antes** de escribir una línea:

| # | Decisión | Por qué no se puede dejar implícita |
|---|---|---|
| 1 | **Propietario**: el valor del turno es un identificador único de quien lo tomó, no un `1` | Sin eso nadie puede saber si el turno que va a liberar sigue siendo suyo |
| 2 | **Duración inicial** | Corta y se vence en pleno trabajo; larga y una instancia muerta bloquea a todos |
| 3 | **Renovación** mientras se compone | Es lo único que evita que un trabajo largo pierda su propio turno |
| 4 | **Liberación segura**: sólo si el propietario sigue siendo el mismo | Un `DEL` a secas puede borrar el turno de **otro** que ya lo tomó después del vencimiento |
| 5 | **Muerte del constructor** (timeout de la función, deploy, instancia reciclada) | El turno tiene que vencer solo; es el único camino de recuperación |
| 6 | **Espera SIN último bueno** — la primera vez, o después de invalidar | ¿El que espera aguarda al constructor, con qué tope, o compone también? Es la decisión más visible para el usuario |
| 7 | **Redis no disponible** | No hay turno que pedir. ¿Se compone sin coordinar, o se degrada? |

🔴 **Y la que no es negociable:** el turno es una **optimización probabilística**,
no una garantía. Un turno temporal reduce muchísimo las composiciones duplicadas;
**no promete exclusión indefinida**, y el criterio de aceptación no puede
escribirse como si lo hiciera.

**Aceptación — redactada con esas condiciones adentro:**
- 100 peticiones concurrentes repartidas en varios procesos, **con una composición
  que termina dentro de la ventana de turno**, ejecutan **una** composición.
- Con una composición que **excede** la ventana: o la renovación la sostiene y
  sigue siendo una, o se documenta cuántas se permiten y por qué. **Lo que no
  vale es no medirlo.**
- **Muerte del propietario a mitad del trabajo**: otro toma el turno al vencer, y
  el sistema converge sin intervención.
- **Liberación segura**: un propietario que vuelve tarde **no** borra el turno
  ajeno. Probado explícitamente.
- Con la copia fresca vencida y último bueno presente, la respuesta llega con el
  contenido anterior en el tiempo de un HIT, no de un rearmado.
- **Sin último bueno** (primera vez), el comportamiento del que espera es el
  decidido en el punto 6, con su tope, y está documentado.
- Con TMDB caído y último bueno presente, ninguna petición rearma más de una vez
  por ventana de turno.
- **Con Redis caído**, el comportamiento es el decidido en el punto 7 — y el
  informe deja dicho que ni el turno ni el último bueno protegen de eso (§3.3.c).

### Etapa 3 — Resistencia frente a TMDB

Ataca H3 y H4.

1. Respetar `Retry-After`; reintentar **sólo** errores transitorios, con espera
   con jitter y un tope bajo de intentos.
2. Circuito de protección: tras N fallos seguidos, dejar de intentar por una
   ventana y devolver degradado sin salir a la red.
3. Techo global de peticiones por segundo, no sólo de concurrencia por proceso.
   **El valor sale de la Etapa 0, no de memoria.**

**Aceptación:** con el doble de TMDB devolviendo 429 con `Retry-After`, el
sistema respeta la espera, **no supera ni el techo de concurrencia ni el de tasa
declarados —los dos, medidos por separado [R4]—**, no entra en lazo y se recupera
solo cuando el doble vuelve.

⚠️ **Esto verifica que el sistema respeta el límite que se le declara. NO
verifica cuál es el límite real de TMDB**, que hay que consultar aparte (§10.5).

### Etapa 4 — CDN y límite por ruta

Ataca H8 y H9. Va última porque sin las anteriores tapa el síntoma.

1. `s-maxage` corto con `stale-while-revalidate` en `/api/home`, y sólo ahí para
   empezar.
2. Límite por IP y por ruta.

**Aceptación:** la segunda petición idéntica sale del CDN **con HIT verificado en
el encabezado de caché** (no inferido de la latencia); alternando orígenes —
`https://localhost`, uno ajeno, y sin `Origin`— cada uno recibe la respuesta que
le corresponde y `Vary: Origin` está presente en todas; las rutas con
`Authorization` siguen sin cachearse y siguen exigiendo Bearer.

⚠️ **`Vary: Origin` no es autenticación ni sustituye un límite de abuso.** Hace
que el CDN no mezcle respuestas entre orígenes, y nada más. El límite por ruta de
esta misma etapa sigue siendo la única defensa contra el abuso (§6.4).

### Etapa 5 — Observabilidad permanente

Ataca H12, H13, H14. Serie histórica de tasa de aciertos, llamadas externas,
latencia y errores que sobreviva al reinicio de una instancia.

---

## 10. Diseño de la prueba de carga, aislada de Producción

### 10.0 [R5] Lo primero: qué puede y qué NO puede responder un banco aislado

La primera versión de este informe cerraba diciendo que las seis incógnitas de la
§11 *"se responden con la Etapa 0 y la prueba de la §10"*. **Es falso, y es el
error más engañoso que tenía**, porque promete que un entorno simulado va a
revelar hechos de Producción. Un doble de TMDB y bases propias verifican
**comportamiento bajo condiciones que uno mismo declara**; no saben nada de las
cuotas de las cuentas reales, de los testers, ni de cómo escala el deployment.

Son **cuatro** fuentes de conocimiento distintas y no se sustituyen entre sí:

| Fuente | Qué da | Qué NO da |
|---|---|---|
| **A. Pruebas de comportamiento** (§10.3, banco) | Que el sistema hace lo que debe: una sola composición, canonización correcta, respeta `Retry-After`, sirve el último bueno, se recupera | Ningún número de capacidad real |
| **B. Capacidad bajo condiciones declaradas** (§10.3, E3/E5) | Cuánto aguanta **con las latencias y límites que le declaré al doble**. Sirve para comparar antes/después de un cambio | La capacidad real en Producción |
| **C. Observación pasiva de Producción** (§10.6) | Tasa de aciertos real, tráfico real, fragmentación real de claves, latencia real, escalado real | Nada sobre escenarios que no ocurrieron todavía |
| **D. Consulta de límites y configuración** (§10.5) | Los límites verdaderos de TMDB, Upstash, Supabase y Vercel para **estas** cuentas | Nada sobre el comportamiento propio |

🔴 **Un máximo de usuarios simultáneos real no sale de A ni de B.** Sale de C, o
de una prueba controlada contra Producción — que hoy está expresamente prohibida
y que, si algún día se autoriza, es otra conversación. **Lo que B da es un número
comparable contra sí mismo**, útil para decir "esto mejoró 4×", no para decir
"aguantamos N personas".

### 10.1 Aislamiento — condición innegociable

| Dependencia | En el banco |
|---|---|
| Redis | Base **nueva y propia**. Nunca las credenciales de Producción. |
| Supabase | Proyecto aparte, o un doble que devuelva filas fijas. Nunca el de Producción. |
| TMDB | **Doble local**, no la API real. Ver 10.2. |
| Despliegue | Preview propio, o local. Nunca el dominio de Producción. |

### 10.2 Por qué TMDB tiene que ser un doble

Con la API real, una prueba de carga mide **a TMDB**, no a Yump: los 429 llegan
antes que el límite propio y el resultado no dice nada del sistema. Además
gastaría cuota compartida con Producción.

El doble tiene que poder: responder con latencia configurable, devolver 429 con
`Retry-After`, devolver 500, cortar y volver, y **contar las llamadas
recibidas**. Ese contador es el árbitro de casi todos los criterios de
aceptación.

### 10.3 Escenarios

| # | Escenario | Qué mide | Criterio |
|---|---|---|---|
| E1 | N peticiones simultáneas, caché fría, misma clave (N = 1, 10, 50, 100) | Unión de peticiones | Composiciones = 1 en todos los N |
| E2 | Igual que E1 con varias instancias | Turno distribuido | Composiciones = 1 |
| E3 | Caché caliente, carga sostenida creciente | Techo con caché | Curva de latencia y punto donde se quiebra |
| E4 | Variantes equivalentes (orden, duplicados, mayúsculas, códigos inexistentes, toggles por defecto) | Canonización | Convergen **conservando las plataformas válidas** (`N,D,M` → `d,m,n`); las que quedan sin ninguna válida no consultan a nadie |
| **E4b** | **Conjuntos válidos DISTINTOS** (`n`, `n,d`, `d,m`) | **Control de E4** | **NO convergen**, y cada uno conserva su contenido |
| E5 | K combinaciones **válidas** distintas, caché fría | Concurrencia y tasa hacia TMDB | No se supera **ni el techo de concurrencia ni el de tasa declarados**, medidos por separado [R4] |
| E6 | Doble de TMDB con 429 + `Retry-After` | Reintentos y circuito | Se respeta el `Retry-After`, no hay lazo |
| E7 | Doble de TMDB caído, con último bueno presente | Continuidad | Se sirve el último bueno; el degradado no lo pisa |
| **E8a** | **Sólo la LECTURA de Redis falla** | Camino ya cubierto | Sigue sin caché, sin error al usuario |
| **E8b** | **Sólo la ESCRITURA de Redis falla, con payload BUENO** | 🔴 El agujero de §3.3.b | El usuario **recibe el payload**, no un 500, y queda registrado |
| E8c | Redis totalmente caído | Peor caso | Se mide qué pasa; hoy es "todo rearma", **y sin turno ni último bueno** (§3.3.c) |
| **E8d** | **Redis vuelve** | Recuperación | No hay estampida al reconectar |
| **E11** | **Turno: la composición EXCEDE la ventana**; y **el propietario muere a mitad** | Contrato del turno [R6] | La renovación sostiene el turno, o se documenta cuántas composiciones se permiten; al morir el propietario otro toma el turno al vencer; un propietario tardío **no** borra turno ajeno |
| E9 | Recuperación: E6/E7 y el doble vuelve | Recuperación | Vuelve a contenido fresco sin intervención |
| E10 | Segunda petición idéntica con CDN activo | CDN | HIT, y CORS intacto |

### 10.4 Qué se registra en cada corrida

Llamadas al doble de TMDB, consultas a Supabase, **llamadas lógicas / intentos
HTTP / comandos** de Redis por separado [R2], composiciones ejecutadas, esperas
compartidas, HIT de caché, latencia p50/p95/p99, errores por clase, invocaciones
serverless. **Separados, nunca sumados en un solo número.**

### 10.5 [R5] Lo que hay que CONSULTAR, no medir

Ninguna de estas cuatro sale de una prueba. Hay que ir a mirar la cuenta:

| Qué | Dónde |
|---|---|
| Límite real de TMDB para este token | Documentación y panel de TMDB. Hoy lo único que hay es un comentario en `lib/tmdb.ts:26` que dice "alrededor de 50 req/s", **sin verificar** |
| Cuota real de Upstash y consumo del mes | Panel de Upstash. El repositorio cita "500.000/mes" (`lib/cache.ts:83-85`), también **sin verificar** |
| Límites de Supabase | Panel de Supabase |
| Concurrencia y escalado de funciones en Vercel | Panel de Vercel |

⚠️ **También hay que mirar si ya existe alguna configuración fuera del código** —
un límite de tasa, una regla de firewall, un monitor externo—. **Este informe
auditó el repositorio; no puede afirmar que no exista nada configurado en un
panel.**

### 10.6 [R5] Lo que hay que OBSERVAR en Producción, sin cargarla

Esto no es una prueba de carga: es mirar el tráfico que ya existe. Es la única
fuente de los hechos reales, y hoy **no está disponible** porque falta la
instrumentación (#20) y porque los logs no fueron recuperables.

| Qué observar | Para qué |
|---|---|
| Tasa de aciertos del Home, por clave | La métrica que más decide el consumo |
| Cuántas claves `home:` distintas viven a la vez | Fragmentación **real**, que `dbsize` no da |
| Llamadas a TMDB y Supabase por petición | El costo real de un Home frío |
| Latencia real p50/p95/p99 | El multiplicador de concurrencia a tasa [R4] |
| Cuántas instancias levanta Vercel | El multiplicador del techo por proceso |
| Volumen y origen del tráfico, con Android separado | Si los testers están generando carga |

**Requiere Etapa 0 y Etapa 5 desplegadas.** Sin eso no hay nada que observar.

### 10.7 Los controles, que no son opcionales

Por `MANTENIMIENTO.md` 8.b y 8.b.2:

- **La misma configuración dos veces tiene que dar el mismo resultado.** Si no,
  el instrumento está roto y no hay nada que interpretar.
- **Si prendido y apagado dan lo mismo, dudar del interruptor primero.**
- **Antes de creerle a un resultado malo, mirar si el control también falló.**
- **La salida completa, sin `tail`.**

---

## 11. Conclusión

### Antes de ampliar el lanzamiento

**Etapa 0 y Etapa 1.** No porque haya evidencia de que el sistema se cae —no la
hay— sino porque **sin la Etapa 0 no hay forma de saberlo**, y porque la Etapa 1
es barata, no toca infraestructura y cierra los caminos por los que un tercero
puede multiplicar el trabajo del servidor sin autenticarse (H5, H6, H10, H11).

**Y antes que las dos, la Etapa PREVIA (H16 / issue #21)**, que es lo más chico
del expediente y lo primero que hay que hacer: hoy un Home que se armó **bien** se
pierde en un 500 si falla guardarlo, mientras que uno degradado se sirve sin
problema (§3.3.b). Es un `catch` que falta, la decisión ya está tomada por el
dueño —**se entrega el payload y se registra el error**— y **no depende de medir
nada**, así que no tiene por qué esperar a la Etapa 0.

**Etapa 2** antes de cualquier difusión concentrada. El escenario que la pide no
es un ataque: es que el TTL venza justo cuando llegan muchos a la vez, o que
TMDB parpadee mientras hay tráfico. Ahí es donde H1, H3 y H7 se suman.

### Puede esperar

- **Etapa 4 (CDN y límites por ruta).** Es la que más alivia el número, y por eso
  mismo conviene que llegue después: puesta primero, tapa los síntomas de H1 y
  H3 y esconde si se arreglaron.
- **Etapa 3**, salvo que la Etapa 0 muestre que ya se están comiendo 429.
- El comentario obsoleto de H15.

### Lo que todavía **no** podemos afirmar, y de dónde saldría cada cosa

**[R5] Corrección importante.** La primera versión decía que las seis *"se
responden con la Etapa 0 y la prueba de la §10"*. **No es cierto**: un banco
aislado verifica comportamiento, no revela hechos de Producción. Cada incógnita
tiene su fuente, y son cuatro distintas (§10.0):

| # | Incógnita | De dónde sale | ¿La da el banco? |
|---|---|---|---|
| 1 | **Cuántos usuarios simultáneos aguanta** | Observación pasiva de Producción (§10.6), o una prueba controlada contra Producción que **hoy está prohibida** | 🔴 **No.** El banco da un número comparable contra sí mismo, no una capacidad real |
| 2 | **Cuánto cuesta hoy un Home frío** en llamadas a TMDB, consultas a Supabase y segundos | Etapa 0 desplegada + observación (§10.6). El banco da el costo **con el doble**, que es el mismo conteo de llamadas pero no la misma latencia | Parcialmente |
| 3 | **Tasa de aciertos del caché en Producción** | Sólo observación pasiva (§10.6). El instrumento existe (`[home] HIT/MISS`) pero los logs no fueron recuperables (§7.2) | 🔴 **No** |
| 4 | **Cuántas instancias levanta Vercel** y con qué carga | Panel de Vercel (§10.5) + observación (§10.6) | 🔴 **No** |
| 5 | **Si los 20 testers generan tráfico**, y cuánto | Observación (§10.6), y hace falta poder separar el origen. Analytics no corre en el contenedor por decisión (H13) | 🔴 **No** |
| 6 | **Los límites reales** de TMDB, Upstash, Supabase y Vercel | Consultar las cuentas (§10.5). Hoy lo único que hay son dos comentarios del repositorio, **sin verificar** | 🔴 **No** |

**Lo que el banco sí da, y no es poco:** que el sistema se comporte como debe
—una sola composición, canonización que no borra plataformas, respeto de
`Retry-After`, último bueno servido, recuperación sin intervención— y un número
de capacidad **bajo condiciones declaradas**, que sirve para comparar antes y
después de cada etapa. Eso es exactamente lo que hace falta para decidir si una
mitigación funcionó. **No es lo mismo que saber cuánta gente aguanta la app.**

Ninguna de las seis se responde leyendo código.

---

## 12. [R1-R7] Qué cambió en esta versión, y por qué

La revisión independiente del 10/09
([`2026-09-10-revision-capacidad-codex.md`](2026-09-10-revision-capacidad-codex.md))
sostuvo los riesgos centrales y encontró siete correcciones. **Las siete están
incorporadas y verificadas por cuenta propia**, no aceptadas de palabra.

| | Qué decía la primera versión | Qué dice ahora | Gravedad |
|---|---|---|---|
| **R1** | Criterio de aceptación: `N,D,M` debe converger a **`n`** | Debe converger a **`d,m,n`**, con las tres plataformas. Y se agregó el control de conjuntos válidos distintos (E4b) y el caso de toggles por defecto | 🔴 **El criterio, tal como estaba, le borraba Disney+ y Max al usuario.** Es el peor error del informe original |
| **R2** | "No hay reintentos en ningún lado", Redis incluido | Redis **sí** reintenta 6 veces, sólo transporte, con backoff exponencial (~4,3 s en el peor caso). TMDB no reintenta, confirmado. Y las métricas confunden llamadas lógicas, intentos HTTP y comandos | 🟠 Afirmación falsa sobre una dependencia |
| **R3** | §3.3 sólo cubría la lectura de Redis | Se agregó §3.3.b: **una escritura fallida convierte un Home BUENO en un 500**, reproducido sobre el resolver real. Y §3.3.c con los cuatro estados de Redis | 🔴 Hallazgo nuevo, y el más barato de arreglar |
| **R4** | "Con tres instancias el techo ya está en 72" contra "50 req/s" | Son unidades distintas: concurrencia ≠ tasa. Se necesita la latencia media para convertir. Lo que queda en pie es que **no hay ningún límite global** | 🟠 Comparación inválida que inflaba el riesgo |
| **R5** | "Las seis incógnitas se responden con la Etapa 0 y la §10" | **No**: son cuatro fuentes distintas (§10.0). El banco no revela cuotas, testers, hit rate ni escalado reales | 🔴 Prometía información que un entorno simulado no puede dar |
| **R6** | Etapa 2: "turno con `SET NX` y vencimiento" | Contrato completo: propietario, duración, renovación, liberación segura, muerte del constructor, espera sin último bueno, Redis caído. Y el turno es **probabilístico**, no exclusión garantizada | 🟠 El criterio prometía algo que `SET NX` no da |
| **R7** | "14 pedidos → 11 claves", con 13 filas pegadas | Ensayo rehecho y ampliado, **con el arnés y la salida íntegra**: 19 filas, 17 entradas distintas, 14 claves | 🟡 La cifra original era correcta; la evidencia publicada no la sostenía |

**Lo que la revisión confirmó y no cambió:** la falta de coordinación del Home, la
fragmentación de claves, el degradado que no se guarda, la cola de TMDB local que
no lee `Retry-After`, `topVotedRows` sin caché, `votedCards` sin validar códigos,
y la falta de contadores. Los riesgos centrales del informe siguen en pie.

**Lo que la revisión no verificó**, y por lo tanto sigue apoyado sólo en esta
auditoría: las lecturas de `dbsize`, el intento de leer los logs, y los hashes de
los archivos ajenos.

**Una advertencia de la revisión que vale la pena repetir**, porque no es un
hallazgo sino una trampa futura: **este informe auditó el repositorio.** No puede
afirmar que no exista un límite de tasa, una regla de firewall o un monitor
configurados en un panel, fuera del código.

---

## 13. Dos ajustes al plan, pedidos por el dueño el 10/09

Posteriores a la revisión independiente, y los dos afectan **el plan**, no el
diagnóstico.

### 13.a El #21 pasa a ser una etapa previa explícita

**Estaba inconsistente entre documentos**, y el dueño lo marcó: `ESTADO.md` decía
"#21 primero" mientras el informe decía "Etapa 0 antes de tocar nada" y dejaba el
#21 como punto 5 de la Etapa 1 — o sea **detrás de toda la instrumentación**.

Ahora es la **Etapa PREVIA**, con su propia sección, sus criterios de aceptación y
el motivo escrito de por qué va antes: es la única del plan que **no depende de
medir nada**.

Y la decisión que estaba planteada como propuesta ahora está **aprobada**:

> Si el payload se produjo correctamente y sólo falla la escritura en Redis, se
> entrega al usuario y se registra el error.

### 13.b El single-flight se acota al Home

La primera versión decía "aplicar `crearSingleFlight` al camino de
`cached`/`cachedIf`" — **21 llamadores de una vez, sin inventario**. El dueño
pidió auditar los consumidores antes de tocar la capa compartida, y tenía razón:
al hacerlo apareció un riesgo concreto.

**Los contextos de degradación son `AsyncLocalStorage` por request**
(`lib/fallos-disponibilidad.ts:40`, `lib/idioma.ts:120`), y de ellos sale el
`degradado` que decide si un payload se guarda. Con un single-flight profundo, el
trabajo compartido corre en el contexto de **quien lo empezó**: el que llega
segundo vería su contador en cero, creería limpio un payload construido con
fallos y **lo guardaría como bueno**. Es exactamente el bug que `cachedIf` existe
para impedir, reintroducido por el mecanismo que venía a mejorar las cosas.

En el Home ese problema **no existe por construcción**: el single-flight envuelve
la llamada entera, el verdicto de degradación ya viaja adentro del payload
compartido, y el que llega segundo no produce, no evalúa predicado y no escribe.

El inventario completo (21 sitios, seis familias de TTL) y los cinco requisitos
para que una integración global sea aprobable están en la Etapa 1. **No está
prohibida: está sin demostrar.**
