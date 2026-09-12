# Etapa 1 de capacidad — Canonizar entradas y single-flight acotado al Home

**Fecha:** 2026-09-11
**Rama:** `feat/etapa1-canonizar-single-flight`, nacida de `main` = `dd1ffd0`
(= `194b500` + la corrección del "lo que sigue" en `ESTADO.md`). **Sin mergear,
sin push, sin deploy.** Worktree `wt-etapa1`, sin `.env.local`.
**Alcance:** exclusivamente la Etapa 1 del plan
([`2026-09-10-capacidad-trafico.md`](2026-09-10-capacidad-trafico.md) §9):
canonización de `providers` y `t`, topes para `q` e `items`, y `crearSingleFlight`
**sólo** alrededor del Home completo. **No** hay turno distribuido, último Home
bueno, CDN, límites por ruta, reintentos de TMDB ni circuit breaker, y
`feat/dia-rotacion` no se integró.
**Datos crudos:** [`2026-09-11-etapa1-linea-base.json`](2026-09-11-etapa1-linea-base.json)
(después, 40 escenarios) y [`2026-09-11-etapa1-antes-E1.json`](2026-09-11-etapa1-antes-E1.json)
(antes: E1 sobre el build de la Etapa 0).

> ⚠️ **Nada de esto es capacidad de Producción ni "cantidad de usuarios
> soportados"**, y **el single-flight es POR PROCESO**: entre instancias de
> Vercel no coordina nada. La coordinación entre instancias y el último Home
> bueno son la Etapa 2.

---

## 1. Resumen

| | Antes (Etapa 0, `81aa8fe`) | Después (esta rama) |
|---|---|---|
| **100 solicitudes simultáneas, misma clave, caché fría (E1)** | **100 composiciones**, 91.106 TMDB, 241 Supabase, 97.548 intentos = comandos Redis, ~162 s de pared, cada solicitud ~157–162 s | **1 composición + 99 esperas compartidas**, 926 TMDB, 4 Supabase, 1.093 Redis, **2,7 s** de pared, cada solicitud 2,1–2,5 s |
| 5 simultáneas (B3) | 5 composiciones, 3.598 TMDB, ~6,5 s | 1 + 4 esperas, 926 TMDB, 2,1 s |
| `t=accion:movie` frente a sin `t` (B4d) | MISS: otra clave, otra composición | **HIT**: la misma clave |
| `N,D,M`, `n,,d,m`, `n,n,d,m,m`, `n,d,m,zzz`, las 7 claves en default, `t=inventado:tv` (E4a–g) | claves distintas | **HIT** todas, 0 TMDB, 0 Supabase |
| `zzz`, `___` (E4i–j) | — | sin plataformas: **0 TMDB, 0 Supabase** |
| `n` / `n,d` / `d,m` (E4k–n, control) | tres claves | **siguen siendo tres**, cada una compone y conserva su contenido |

Todo verificado automáticamente contra los dobles (§5). **Lo que esto no
cambia:** un Home frío sigue costando 926 llamadas a TMDB; sólo deja de pagarse
N veces por la misma clave en el mismo proceso y por variantes equivalentes.

---

## 2. Qué se cambió, y qué no

| Archivo | Qué |
|---|---|
| `lib/canonizar-home.ts` | **nuevo**, puro. `canonizarProviders` (minúsculas → filtrar contra el catálogo → deduplicar → ordenar → tope), `tiposDesdeParam` + `canonizarTipos` (forma mínima), `claveDeTipos`, `MAX_PLATAFORMAS` |
| `lib/home-vuelo.ts` | **nuevo**, puro. `crearVueloHome`: lectura previa + `crearSingleFlight` por clave + métricas (líder/seguidor) |
| `lib/limites-entrada.ts` | **nuevo**, puro. `MAX_Q = 120`, `MAX_ITEMS_UPCOMING = 100`, `acotarQ`, `acotarRefs` |
| `lib/home.ts` | `homePayload` recibe crudos y canoniza; la lista canónica va a `homeKey` **y** a `composeHome`; `homeKey` usa `claveDeTipos`; el productor sólo lo ejecuta el líder del vuelo; línea `[home] COMPARTIDA <clave>` |
| `app/api/home/route.ts` | ya no parsea ni afirma tipos: pasa `providers` crudo y `tiposDesdeParam(t)` |
| `app/api/search/route.ts` | `acotarQ` antes de buscar (y por lo tanto antes de la clave de caché) |
| `app/api/upcoming/route.ts` | `acotarRefs` antes de consultar |
| `lib/metricas.ts` | `home.cache` admite `"compartida"`; la línea imprime `cache COMPARTIDA` |
| `lib/banco-validacion.ts`, `scripts/banco/correr.mjs` | expectativas por escenario, clave esperada con la canonización real, `BANCO_SOLO`, escenarios E1/E4 |
| Tests nuevos | `canonizar-home` (21), `home-vuelo` (12), `limites-entrada` (6), +1 en `banco-validacion` |

**No se tocó:** `lib/cache.ts` (`cached`/`cachedIf`/`cachedLocIf` intactos, y un
test lo barre), `lib/reparar-y-cachear.ts`, `lib/escritura-cache.ts`,
`lib/claves.ts`, `lib/single-flight.ts`, `composeHome` y sus fuentes, los otros
20 llamadores del caché, `lib/reco.ts` y `lib/idioma.ts` (sus dos usos previos de
`crearSingleFlight` son de `titleDetails`, no del Home).

---

## 3. Canonización (#18)

### 3.1 `providers`

`canonizarProviders(raw)`, en este orden y no en otro:

1. **minúsculas** — antes de filtrar, porque `N,D,M` son Netflix, Disney+ y Max
   mal escritas, no basura. (La primera versión del plan las convergía a `n` y
   le borraba dos plataformas al usuario; la revisión independiente lo cazó.)
2. **filtrar contra el catálogo** (`ALL_CODES` de `lib/providers-ar.ts`, 15 códigos);
3. **deduplicar**;
4. **ordenar**;
5. **tope** = `MAX_PLATAFORMAS` = tamaño del catálogo. No es un número inventado:
   es la única cantidad que puede quedar después de 2 y 3. Se aplica igual para
   que la longitud de la clave esté acotada por construcción.

La lista canónica va a la **clave** y al **contenido** (`composeHome`) desde
`homePayload`. Normalizar sólo la clave habría dado dos entradas equivalentes con
la misma clave y contenidos distintos.

### 3.2 `t`

- Sólo rieles de `TOGGLE_KEYS` (`hooks/home-types-nucleo.ts`: los seis géneros y
  `ultimos`); los de filtro (`mas-votados`, `hacete-cargo`) no entran — el
  cliente nunca los manda.
- Sólo `movie` / `tv`, comparación exacta.
- Duplicados: **la última ocurrencia gana** (determinista; es lo mismo que hace
  `URLSearchParams.get` con un parámetro repetido).
- **Forma mínima**: sólo los que difieren de su default (`tipoDe`). Así `t`
  ausente, `t=accion:movie` y las **siete claves en default que el cliente manda
  siempre** (`paramDeTipos`) son la misma clave. El Home inicial de todo el
  mundo, que hasta hoy se cacheaba bajo la forma completa, pasa a la clave de
  "sin `t`"; no hace falta subir la versión de la clave porque el contenido es
  el mismo — las entradas viejas con forma completa quedan huérfanas hasta su
  TTL de 6 h.
- Crecimiento: como máximo una entrada por clave conocida (7).

### 3.3 Topes de `q` e `items`

| | Valor | De dónde sale | Uso legítimo comprobado |
|---|---|---|---|
| `q` (`/api/search`) | **120 caracteres**, se **trunca** | El título más largo del pool curado de la app mide **91** (`data/contexto-ruleta.json`); el caso famoso de TMDB, "Borat: Cultural Learnings…", **83** | Los dos pasan enteros (test). El input del buscador no tiene `maxLength`; nada del cliente cambia |
| `items` (`/api/upcoming`) | **100 refs**, se conservan los primeros en orden | El mismo tope que el handler **ya** aplicaba a `limit` (`Math.min(limitRaw, 100)`); 100 refs son ~1,3 KB de query y un `.in()` de 100 ids | **Hoy ninguna vista manda `items=`** a `/api/upcoming` (sólo `mix`; el cruce con la watchlist es un eje previsto): no puede cortar uso actual |

(`/api/cards?items=`, que sí usa `UserShelf`, es otra ruta y no estaba en el
alcance; queda anotado en §9.)

---

## 4. Single-flight acotado al Home (#17)

`crearVueloHome` (`lib/home-vuelo.ts`), cableado en `homePayload` y en ningún
otro lado:

1. **Lectura previa** del caché con el backend real. Si está: `cache = "hit"` y
   se devuelve. Con caché caliente, N solicitudes simultáneas son N HIT — no se
   crea una "espera compartida" de una lectura, que sería una espera innecesaria
   y una métrica que miente. (El batcher de `lib/cache.ts` ya junta esas N
   lecturas en un MGET.)
2. Si no está: **vuelo por clave** (`crearSingleFlight`, el módulo que ya existía
   y estaba probado). El primero resuelve con `cachedLocIf` **entero** —leer de
   nuevo, producir, decidir con el predicado, guardar una vez—; los demás esperan
   esa misma promesa y reciben el mismo payload, **con el verdicto de degradación
   adentro**. El seguidor no produce, no evalúa predicado y **no escribe**: por
   eso no existe el riesgo del single-flight profundo (contadores de degradación
   por request desincronizados), que es lo que dejó a `cached`/`cachedIf` fuera.
3. **Métricas** (Etapa 0): el líder anota `composiciones += 1` y `cache = "miss"`
   dentro del productor, en su scope; cada seguidor anota `esperasCompartidas +=
   1` y `cache = "compartida"` en el suyo. HIT, MISS, composición propia y espera
   compartida quedan diferenciados sin deducir ninguno de otro.
4. **Rechazo:** `crearSingleFlight` borra la entrada en `finally`; todos los que
   esperaban ven el rechazo y la petición siguiente vuelve a intentar.
5. **Degradación:** el payload degradado viaja a todos y **nadie lo guarda**
   (`resolverConCache` no escribe con `fallo`).
6. **Escritura fallida en Redis (#21):** el líder intenta guardar una vez,
   `guardarSinRomper` absorbe el fallo y el payload llega a todos.

**Costo:** una lectura de Redis más por solicitud (la previa): un Home frío pasa
de 993 a 994 llamadas lógicas; en E1, 1.093 = 993 + 1 (líder) + 99 (seguidores).
Contra las 97.548 de antes.

**Límite:** por proceso. Dos instancias de Vercel que reciban la misma clave fría
al mismo tiempo la componen las dos. Eso es la Etapa 2 (turno distribuido) y
**no se afirma nada al respecto acá**.

---

## 5. El banco: antes y después, validado

Mismo corredor (`scripts/banco/correr.mjs`), mismos dobles, mismas condiciones
declaradas que la Etapa 0 (dobles locales, 20 títulos por página, todo con
proveedor AR, Supabase vacío). El validador comprueba además lo que cada
escenario **afirma** (`esperado`: composiciones, esperas, cache de todas,
TMDB/Supabase = 0); una diferencia invalida la corrida.

**Antes** (`BANCO_SOLO=E1,E1h BANCO_ETAPA=0` sobre el build de `81aa8fe`, en `wt-etapa0`):

| # | Escenario | Comp. / esperas | TMDB | Supabase | Redis I/C | Pared | Por solicitud |
|---|---|---|---|---|---|---|---|
| C0 | control | 1 / 0 | 926 | 4 | 993/993 | 2,9 s | — |
| **E1** | 100 simultáneas, caché fría | **100 / 0** (100 MISS) | **91.106** | **241** | **97.548/97.548** | **162 s** | 157–162 s |
| E1h | siguiente | 0 / 0 (HIT) | 0 | 0 | 1/1 | 17 ms | — |

**Después** (corrida completa, 40 escenarios; los de la Etapa 0 se conservan y
cierran igual salvo la lectura previa: +1 Redis por solicitud):

| # | Escenario | Comp. / esperas | Cache | TMDB | Supabase | Redis I/C | Pared |
|---|---|---|---|---|---|---|---|
| B3 | 5 simultáneas, caché fría | **1 / 4** | 1 MISS + 4 COMPARTIDA | 926 | 4 | 998/998 | 2,1 s |
| B4d | `t=accion:movie` | 0 / 0 | **HIT** | 0 | 0 | 1/1 | 21 ms |
| **E1** | 100 simultáneas, caché fría | **1 / 99** | 1 MISS + 99 COMPARTIDA | **926** | **4** | **1.093/1.093** | **2,7 s** (2,1–2,5 s por solicitud) |
| E1h | siguiente | 0 / 0 | HIT | 0 | 0 | 1/1 | 33 ms |
| E4-0 | `n,d,m` frío | 1 / 0 | MISS | 926 | 4 | 994/994 | 2,1 s |
| E4a | `N,D,M` | 0 / 0 | **HIT** | 0 | 0 | 1/1 | 19 ms |
| E4b | `n,,d,m` | 0 / 0 | HIT | 0 | 0 | 1/1 | 26 ms |
| E4c | `n,n,d,m,m` | 0 / 0 | HIT | 0 | 0 | 1/1 | 26 ms |
| E4d | `n,d,m,zzz` | 0 / 0 | HIT | 0 | 0 | 1/1 | 34 ms |
| E4e | `t=accion:movie` | 0 / 0 | HIT | 0 | 0 | 1/1 | 26 ms |
| E4f | las 7 claves en default | 0 / 0 | HIT | 0 | 0 | 1/1 | 37 ms |
| E4g | `t=inventado:tv` | 0 / 0 | HIT | 0 | 0 | 1/1 | 22 ms |
| E4h | `t=accion:tv` (no default) | 1 / 0 | MISS | 122 | 2 | 182/182 | 1,2 s |
| E4i | `zzz` | 1* / 0 | MISS | **0** | **0** | 2/2 | 51 ms |
| E4j | `___` | 1* / 0 | MISS | **0** | **0** | 2/2 | 52 ms |
| E4k | `n` (control) | 1 / 0 | MISS | 862 | 4 | 969/969 | 2,7 s |
| E4l | `n,d` (control) | 1 / 0 | MISS | 498 | 2 | 571/571 | 1,5 s |
| E4m | `d,m` (control) | 1 / 0 | MISS | 483 | 2 | 551/551 | 1,4 s |
| E4n | `n` de nuevo | 0 / 0 | HIT | 0 | 0 | 1/1 | 32 ms |
| F1–F6, L1, F5a–d | como en la Etapa 0 (+1 Redis) | | | | | | F5a incompleto declarado, 1 reinicio |

\* En `zzz`/`___` el contador cuenta la entrada al productor (que devuelve
`sinPlataformas` antes de pedir nada): 0 TMDB y 0 Supabase, que es lo que el
criterio exige; el payload no se guarda (predicado `!sinPlataformas`). Es una
"composición" vacía, y conviene saberlo al leer ese contador.

Fuera del banco, en unitario: 100 solicitudes con caché fría → 1 composición
(y un **control** que sin el vuelo da 100); dos claves distintas no se
bloquean; caliente → todas HIT; rechazo → todos lo ven y la siguiente reintenta;
degradado → nadie guarda; escritura fallida → todos reciben.

---

## 6. Tests y comandos (RED → GREEN)

| Qué | Resultado |
|---|---|
| `canonizar-home.test.ts` antes del módulo | RED: `ERR_MODULE_NOT_FOUND`; con el módulo puro y sin cablear: 18/21 (3 guards en rojo) |
| `home-vuelo.test.ts` antes del módulo | RED: `ERR_MODULE_NOT_FOUND`; con el módulo puro y sin cablear: 11/12 (el guard de `lib/home.ts` en rojo) |
| `limites-entrada.test.ts` antes del módulo | RED; con el módulo y sin cablear las rutas: 4/6 |
| Todos, cableados | **21/21, 12/12, 6/6**; `banco-validacion` 19/19; `metricas` 20/20; `escritura-cache` 18/18 |
| `npm test` (con `.next` fresco) | **1449 tests: 1439 pasan, 0 fallos, 10 omitidos** |
| `npx tsc --noEmit` | limpio |
| `npm run build` sin entorno de banco, `.next` borrado, sin otro Next | **exit 0 en 1 min 44 s**, `BUILD_ID aJiq1sMrb5KkBFiYB0Zsw` |
| `npm run build` con entorno de banco (el de la corrida) | exit 0 en 2 min 58 s |
| `node scripts/banco/correr.mjs` (después) | **VÁLIDA**: 40 escenarios, 39 completos, 1 incompleto declarado, 1 reinicio |
| Corredor sobre `81aa8fe` (antes) | VÁLIDA: 3 escenarios |
| `git diff --check` | limpio |

---

## 7. Comprobado, inferido, desconocido

**Ejecutado y comprobado:** todo §5, con igualdades app ↔ dobles y expectativas
por escenario; cada caso obligatorio de canonización en unitario y en el banco;
los ocho casos obligatorios del single-flight en unitario, y E1/B3/E1h en el
banco; que la instrumentación de la Etapa 0 sigue cerrando (+1 lectura por
solicitud, explicada); suite, `tsc`, build.

**Inferido:** que en Producción, con el catálogo real, el ahorro por proceso es
del mismo orden — depende de cuántas solicitudes iguales coincidan en la misma
instancia de Vercel, que no se ha observado (Etapa 5).

**Desconocido / no verificable acá:** cuántas instancias levanta Vercel y cómo
reparte; por lo tanto cuántas composiciones reales evita esto. Entre instancias
sigue habiendo una composición por instancia por clave fría: **Etapa 2**.

---

## 8. Lo que queda para la Etapa 2

1. **Turno distribuido** (`SET NX` con propietario, duración, renovación,
   liberación segura, muerte del constructor): las siete decisiones del #17.
2. **Último Home bueno**: servir el vencido mientras uno solo reconstruye; hoy,
   al vencer el TTL de 6 h, la primera solicitud de cada instancia paga el
   rearmado.
3. Medir E2 (varias instancias) y E3 (caliente sostenido) en el banco, que hoy
   corre un solo proceso.

---

## 9. Limitaciones y notas

- El vuelo es por proceso; con `maxDuration = 60` y un Home frío de ~2–4 s en
  Producción, el mapa en vuelo vive segundos.
- La lectura previa suma un MGET por solicitud (batcheado con las concurrentes).
- `/api/cards?items=` no tiene tope (fuera de alcance; `UserShelf` manda la
  lista entera del usuario).
- Las entradas cacheadas con la forma completa de `t` quedan huérfanas hasta su
  TTL; no se subió la versión de la clave porque el contenido no cambió.
- El control de contenido idéntico entre variantes (`N,D,M` = `n,d,m`) se
  demuestra por HIT en la misma clave; el banco no compara los bytes de los
  payloads.
