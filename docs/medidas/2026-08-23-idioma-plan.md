# Plan de implementación — idioma de los títulos

**2026-08-23 · revisión 4 del plan · rama `audit/idioma-titulos`**
**Producto aprobado. Código de producción sin tocar.**
**Base: solo las dos filas de la ruleta aprobadas por el dueño (§6).**

Decisión aprobada: `es-MX` como idioma base, fallback controlado a `es-ES`,
título original como respaldo y consulta verificada para excepciones.

Datos y mediciones: [`2026-08-23-idioma-informe.md`](2026-08-23-idioma-informe.md).

> **Correcciones de esta revisión:** el idioma base y `ayudaOriginal` se
> implementan y prueban **en la tanda 1**, inertes (§7); los constructores se
> cablean en la tanda 1 **en modo compatible** y el barrido mira llamadas de
> caché, no texto suelto (§4); los dos switches son **independientes** —
> `CONSULTA_VERIFICADA=0` no apaga el respaldo original (§1); el backfill tiene
> **atomicidad real** con compensación verificada y ensayo de falla parcial
> (§5); los dos textos de la ruleta están **aplicados y verificados** (§6).

---

## 1. Las ayudas de búsqueda se resuelven en el servidor

`DetailView` **no importa el mapa, no lee `process.env` y no decide nada**.
Recibe datos ya resueltos y solo los pinta.

### Contrato

```ts
// lib/types.ts
export interface AyudaBusqueda {
  plataforma: PlatformCode;   // a cuál corresponde
  consulta: string;           // qué escribir en su buscador
}

export interface UITitleDetail {
  // …
  /** Solo si difiere del título visible. Ver el coste en el informe §3. */
  originalTitle?: string;
  /** Una por plataforma con consulta verificada, ya filtradas. */
  ayudas?: AyudaBusqueda[];
  /** El respaldo genérico, UNA sola vez para toda la ficha. */
  ayudaOriginal?: string;
}
```

### Resolver

```ts
// lib/consultas-verificadas.ts
export async function ayudasDeBusqueda(opts: {
  tipo: MediaType;
  tmdbId: number;
  tituloVisible: string;
  originalTitle?: string;
  plataformas: PlatformCode[];   // SOLO donde el título está disponible
  pais?: string;                 // "AR"
}): Promise<{ ayudas: AyudaBusqueda[]; ayudaOriginal?: string }>
```

**Es `async` desde el primer día aunque el mapa estático sea síncrono.** Ese es
el punto: el día que el mapa pase a Supabase, la firma no cambia, el
componente no se toca y no hace falta convertir la cadena de llamadas.

Corre dentro de `detail()` (`lib/enrich.ts`), que ya tiene el título visible,
`prov.codes` y el original. **`/api/title` no gana lógica**: sigue parseando
query params y llamando a `enrich.ts`, como el resto de las rutas.

### Reglas de filtrado, todas del lado del servidor

1. `CONSULTA_VERIFICADA === "0"` → devuelve `{ ayudas: [] }` y nada más. Se
   evalúa acá, nunca en el cliente.
2. Solo plataformas donde el título **está disponible** (`prov.codes`). Una
   ayuda para Max en un título que no está en Max no se emite.
3. Se descarta toda ayuda cuya `consulta` sea igual al `tituloVisible`
   (comparación insensible a mayúsculas y acentos). En 13 de los 17 casos
   medidos la consulta verificada **es** el `es-MX`: sin esta regla el bloque
   aparecería casi siempre y diría lo obvio.
4. `ayudaOriginal` se emite **una sola vez** y solo si se cumple todo:
   - `IDIOMA_BASE === "es-MX"` (informe §3: con `es-ES` la unión da 28/29 y
     manda al usuario a fallar dos veces);
   - `originalTitle` existe y difiere del `tituloVisible`;
   - **no coincide con ninguna `ayudas[].consulta` de las que efectivamente se
     emitieron**. Es el caso Mel Brooks: la consulta verificada ya **es** "High
     Anxiety", así que repetirla como respaldo genérico sería decir dos veces lo
     mismo.

### Los dos switches son independientes

`CONSULTA_VERIFICADA=0` apaga **solo el mapa por plataforma**. No apaga el
respaldo original: con `es-MX`, si el mapa se desactiva, el usuario tiene que
seguir viendo "probá con el título original". Son dos ayudas distintas y una no
depende de la otra.

El orden del cálculo, que es lo que lo garantiza:

1. Si `CONSULTA_VERIFICADA !== "0"` → resolver `ayudas`. Si está apagado,
   `ayudas` queda vacío **y el cálculo sigue**.
2. `ayudaOriginal` se calcula **aparte**, mirando solo `IDIOMA_BASE === "es-MX"`
   y si el original difiere del título visible.
3. La deduplicación es lo **último** y solo mira las `ayudas` **emitidas**. Con
   el mapa apagado no hay ninguna, así que no puede suprimir el original.

Consecuencia deliberada: con `CONSULTA_VERIFICADA=0` y `es-MX`, Mel Brooks pasa
de "En Disney+, buscala como «High Anxiety»" a "probá con el título original:
«High Anxiety»" — misma cadena, copy más débil, pero **sigue sirviendo**. Si la
deduplicación mirara el mapa en vez de las ayudas emitidas, se quedaría sin
nada.

Las cuatro combinaciones van a tests:

| `IDIOMA_BASE` | `CONSULTA_VERIFICADA` | `ayudas` | `ayudaOriginal` |
|---|---|---|---|
| `es-ES` | encendido | Mel Brooks sí | **no** |
| `es-ES` | `0` | vacío | **no** |
| `es-MX` | encendido | Mel Brooks sí | **no** (dedup) |
| `es-MX` | `0` | vacío | **sí** |

`ayudas` y `ayudaOriginal` viajan **ausentes** cuando no aplican, no como array
vacío: así el componente no tiene que distinguir.

---

## 2. Presentación

| Situación | Qué se ve |
|---|---|
| Consulta verificada para una plataforma | **En Disney+, buscala como "High Anxiety"** + copiar |
| Dos plataformas con consultas **distintas** | una línea por plataforma |
| Dos plataformas con la **misma** consulta | el servidor las emite igual, una por plataforma; si el copy queda repetitivo se agrupan **en el componente**, sin cambiar el contrato |
| Original difiere del título visible | **Si no aparece, probá con el título original: "…"** + copiar. **Una sola vez para toda la ficha**, nunca por plataforma |
| La consulta coincide con el título visible | **nada**: el servidor ya la descartó |
| Ninguna de las dos | el bloque entero no se renderiza |

El original genérico **no se repite por plataforma** porque no es un dato por
plataforma: es el título original de la obra, uno solo.

---

## 3. Runbook de Vercel

**La variable tiene que existir ANTES del deployment que la necesita.** Un
deployment toma el valor que había cuando se creó; editar la variable después no
lo modifica.

### Por cada tanda

1. **Vercel → Settings → Environment Variables.** Crear la variable con scope
   **Preview** únicamente.
2. **Push de la rama.** Vercel crea un Preview *posterior* a la variable, así
   que la toma.
3. **Probar en la URL de Preview**, con la checklist de la tanda.
4. **Recién ahí**, agregar el scope **Production** a la misma variable.
5. **Generar un deployment de producción nuevo** (merge a `main`, o *Promote*
   del preview ya probado).
6. Verificar en los logs de producción que el valor llegó — para la tanda 2, el
   `[home] MISS` con la huella nueva en la clave.

### Para cambiar el valor de una variable ya existente

Editar el valor **no toca ningún deployment existente**. Hay que redeployar:
Vercel → Deployments → el de producción → **Redeploy**. Ese redeploy toma el
valor nuevo.

### El commit vacío

Se usa **solo** cuando Vercel **no detectó el push** y por lo tanto no arrancó
ningún deployment — pasó tres veces en este proyecto. **No reemplaza al redeploy
necesario para aplicar una variable**: si el deployment existe y lo que cambió
es el valor de una variable, el commit vacío no aporta nada; lo que hace falta
es el *Redeploy*.

### Variables

| Variable | Valor | Tanda | Scope inicial |
|---|---|---|---|
| `CONSULTA_VERIFICADA` | (ausente = encendido); `0` apaga | 1 | Preview → Production |
| `FALLBACK_IDIOMA` | (ausente = encendido); `0` apaga | 1 | Preview → Production |
| `IDIOMA_TITULOS` | `es-MX` | 2 | Preview → Production |

En la tanda 1, `IDIOMA_TITULOS` **no se configura**: el default del código es
`es-ES` y así la tanda entra sin cambio de idioma.

---

## 4. Claves y rollback de caché

### Huella

```ts
// lib/idioma.ts
export const IDIOMA_BASE     = process.env.IDIOMA_TITULOS ?? "es-ES";
export const IDIOMA_FALLBACK = "es-ES";
const RESOLVER_VERSION       = "r1";   // sube al cambiar señales o fusión

// El fallback solo entra si PUEDE cambiar la salida: con base es-ES es inerte
// y no debe abrir un espacio de claves nuevo.
const fallbackActivo = process.env.FALLBACK_IDIOMA !== "0"
                    && IDIOMA_BASE !== IDIOMA_FALLBACK;

export const HUELLA_IDIOMA =
  `${IDIOMA_BASE}${fallbackActivo ? "+f" : ""}.${RESOLVER_VERSION}`;
```

### Los cuatro estados que hay que fijar con tests

| Configuración | Huella | Debe |
|---|---|---|
| `es-MX`, fallback encendido | `es-MX+f.r1` | espacio propio |
| `es-MX`, `FALLBACK_IDIOMA=0` | `es-MX.r1` | **no leer nada escrito con fallback** |
| `es-ES` (rollback) | `es-ES.r1` | no leer nada mexicano |
| `es-ES`, `FALLBACK_IDIOMA=0` | `es-ES.r1` | **la misma que la anterior**: con base `es-ES` el fallback es inerte y no debe fragmentar |

Las cuatro huellas se afirman como valores literales, y se afirma que los tres
espacios (`es-MX+f.r1`, `es-MX.r1`, `es-ES.r1`) son **disjuntos dos a dos**.

### Prueba de rollback, sin contaminar caché

En el entorno de tests no hay credenciales de Upstash, así que `lib/cache.ts`
cae al `Map` en memoria. Cero contaminación.

1. Generar y cachear un pool y una card con `es-MX+f.r1`. Anotar las claves.
2. Pasar a `es-MX.r1` → afirmar: clave distinta, el fetcher **volvió a correr**,
   el valor devuelto **no** es el generado con fallback.
3. Pasar a `es-ES.r1` → lo mismo, y no lee ninguno de los dos anteriores.
4. Volver a `es-MX+f.r1` → lee su propio espacio, sin mezclar.
5. Afirmar que los tres conjuntos de claves son disjuntos.

Como `HUELLA_IDIOMA` se calcula al importar, **los constructores reciben la
huella por parámetro** en vez de leerla del módulo. Eso los vuelve funciones
puras y es lo que hace testeable todo esto sin recargar módulos.

### Constructores centralizados — cableados en modo compatible

**Corrección.** La tanda 1 no puede afirmar que los prefijos viven solo en
`lib/claves.ts` si todavía no cableó nada. Se cablean **en la tanda 1**, en
**modo compatible**: los constructores generan **exactamente los mismos bytes de
clave que hoy**, sin huella.

```ts
// lib/claves.ts — tanda 1
export function claveCard(tipo: MediaType, id: number, huella = ""): ClaveLocalizada {
  return `card:${huella}${huella ? ":" : ""}${tipo}:${id}` as ClaveLocalizada;
}
```

Con `huella = ""` sale `card:movie:123`, byte a byte lo de hoy. En la tanda 2 se
le pasa `HUELLA_IDIOMA` y sale `card:es-MX+f.r1:movie:123`.

Las **diez familias localizadas** salen de ese único módulo: `home`, `disc`
(pool y combinada), `card`, `top:pop`, `reco`, `reco:mismo`, `reco:cruce`,
`reco:perfil`, `people:popular`.

**Comprobación de que el modo compatible no invalida nada:** en Preview, cargar
el Home, deployar la tanda 1, volver a cargarlo → **`[home] HIT` con la misma
clave**. Un solo `MISS` significa que algún constructor cambió los bytes.

Dos mecanismos para que no quede una clave a mano:

1. **Tipo marcado.** Los constructores devuelven `ClaveLocalizada`
   (`string & { readonly __localizada: unique symbol }`), y `cached`/`cachedIf`
   pasan a exigir ese tipo en las familias localizadas. **Una clave escrita a
   mano no compila.**
2. **Test de barrido, sobre llamadas de caché y no sobre texto suelto.**
   Buscar prefijos en cualquier texto encontraría comentarios, logs, tests y
   `TTL.home`. El test parsea los fuentes de `lib/` y `app/` y mira **solo el
   primer argumento de `cached(` y `cachedIf(`**; falla si ese argumento es un
   literal o un template en vez de una llamada a `lib/claves.ts`. Comentarios y
   logs quedan fuera por construcción.

El test de barrido **tiene que verse en rojo una vez**: se introduce a propósito
una clave manual **en una llamada real a caché** —no en un comentario— y se
comprueba que falla. Si nunca falló, no está probado.

---

## 5. Rollback real de `upcoming_content`

**"Revertir la función y volver a sincronizar" no sirve** y hay que decirlo: el
sync normal solo reescribe los títulos dentro de su ventana de estrenos. Las
filas viejas se quedarían en `es-MX` para siempre.

### Columnas

Se tocan **solo las localizadas**: `title`, `overview`, `episode_name`.
**No** se tocan `original_title` (no es localizado), `tv_status` (enum en
inglés), ni ninguna otra columna.

### `scripts/backfill-upcoming-idioma.mjs`

```
node --env-file=.env.local scripts/backfill-upcoming-idioma.mjs \
  --idioma=es-MX [--aplicar] [--desde=<snapshot.json>]
```

- **`--dry-run` es el default.** Sin `--aplicar` no escribe nada.
- El dry-run informa: **cuántas filas cambiarían**, la lista de claves
  `(tmdb_id, media_type)`, y un diff por columna de las primeras 20.
- **Antes de escribir, snapshot obligatorio**: vuelca `tmdb_id`, `media_type`,
  `title`, `overview`, `episode_name` de **todas** las filas que va a tocar, a
  `docs/medidas/snapshot-upcoming-<fecha>-<idioma>.json`. Si el snapshot no se
  escribió, **no escribe en la base**.
- `--idioma=es-ES` hace el camino inverso desde TMDB;
  `--desde=<snapshot.json>` restaura literalmente lo que había, que es la
  reversión exacta y no depende de que TMDB devuelva hoy lo mismo que ayer.
- El fallback del informe §4 corre **antes de escribir**, así que lo persistido
  ya viene reparado.
### Atomicidad — corregido

**"Abortar si el conteo no coincide" no deshace los lotes ya escritos.** Hace
falta una garantía real, y hay dos caminos según lo que permita el acceso a la
base:

**Preferido — una sola transacción.** Todas las actualizaciones dentro de un
`begin … commit`. El cliente REST de `@supabase/supabase-js` **no** expone
transacciones, así que esto exige una de dos cosas: una función
`plpgsql` `security definer` que reciba el lote y haga el `update` adentro, o
una conexión Postgres directa (`postgres://`) desde el script. **Se decide al
implementar la tanda 3, probando cuál está disponible**, y se deja escrito cuál
se usó.

**Si no es posible — compensación automática y verificada.** Ante *cualquier*
fallo a mitad de camino:

1. El script mantiene en memoria la lista de claves **ya escritas**.
2. Restaura **automáticamente** esas filas desde el snapshot, sin intervención.
3. Vuelve a leerlas y compara **byte a byte** las tres columnas contra el
   snapshot.
4. Recién entonces termina con código distinto de cero, informando si la
   compensación fue completa o si quedaron filas sin restaurar — que es el único
   estado que exige mano humana, y tiene que decirlo con las claves exactas.

Un abort sin compensación deja la tabla a mitad de camino y es justamente lo que
no puede pasar.

### Verificación de la reversión

Después de `--desde=<snapshot>`: releer las mismas claves y afirmar que las tres
columnas coinciden **byte a byte** con el snapshot, para **todas** las filas, no
una muestra. Código distinto de cero si alguna no coincide.

### Ensayo de falla parcial — obligatorio antes de promover

**No se promociona la tanda 3 habiendo ensayado solo el camino feliz.** En
Preview, con `--fallar-en=<n>` (bandera solo de prueba), forzar un error después
de escribir `n` filas y comprobar:

- que la compensación corrió sola;
- que **todas** las filas tocadas volvieron al valor del snapshot;
- que el código de salida es distinto de cero;
- que el mensaje nombra las claves afectadas.

---

## 6. Ruleta editorial — corregida y verificada

Los dos textos aprobados por el dueño el 2026-08-23 **ya están aplicados**
(`scripts/corregir-ruleta-idioma.mjs`, dry-run primero).

| Fila | Antes | Ahora |
|---|---|---|
| `movie:277834` | "…**Vaiana** no depende de un romance para moverse…" | "…**Moana** no depende de un romance para moverse…" |
| `movie:13179` | "…la inseguridad de **Campanilla** por no encontrarle sentido…" | "…la inseguridad de **su protagonista** por no encontrarle sentido…" |

Para `movie:13179` se usó la alternativa neutral: no vuelve a romperse si el
título cambia otra vez. Su `advertencia` no se tocó — no nombra a nadie.

**Verificación**

- Snapshot previo en `docs/medidas/2026-08-23-ruleta-antes.json`; resultado en
  `-despues.json`.
- Cada `update` acotado por `media_type` **y** `tmdb_id`.
- `roulette_titles` tiene el trigger `roulette_titles_touch`, así que cualquier
  fila tocada mueve su `updated_at`. Conteo con `updated_at >= marca`:
  **exactamente 2 filas**, `movie:277834` y `movie:13179`.
- El texto viejo no quedó en ninguna de las dos.

**Auditoría re-corrida después del cambio**: de 2.401 filas, quedan 20 con el
título dentro del texto y título que cambia en `es-MX`, y las 20 están
triadas como sustantivo común, nombre de franquicia o de personaje, o cambio de
mayúscula. **Cero contradicciones conocidas**, que es lo que la tanda 2 exige
como criterio de aceptación.

---

## 7. Las tres tandas

### Tanda 1 — sin cambio global de idioma, sin invalidación de caché y sin arranque frío

**No es "sin efecto visible": el usuario ve el aviso verificado de Mel Brooks.**
Lo que no cambia es el idioma, ninguna clave de caché y ningún arranque frío.

| Commit | Qué |
|---|---|
| 1 | `lib/idioma.ts`: `IDIOMA_BASE`, `IDIOMA_FALLBACK`, `HUELLA_IDIOMA`, las tres señales, `fusionarPorCampo`. |
| 2 | **`lib/tmdb.ts`: `DEFAULTS.language = IDIOMA_BASE`.** Con el default `es-ES` no cambia nada, pero deja la activación por variable **cableada y probada**. |
| 3 | `lib/claves.ts`: los diez constructores + `ClaveLocalizada`, **cableados en modo compatible** (§4): mismos bytes que hoy. |
| 4 | `originalTitle` en `UITitleDetail`, poblado en `detail()`. |
| 5 | `lib/consultas-verificadas.ts` + `ayudasDeBusqueda()` (async), con la entrada de Mel Brooks. |
| 6 | `AyudaBusqueda`, `ayudas`, `ayudaOriginal` en el contrato; resolución en `detail()`; `CONSULTA_VERIFICADA` leído en el servidor. **`ayudaOriginal` queda implementado entero e inerte mientras `IDIOMA_BASE` sea `es-ES`.** |
| 7 | `DetailView` pinta lo que recibe. **Sin importar el mapa ni leer `process.env`.** |
| 8 | Fallback cableado en `pool()`, `candidatosCombinados()` y `detail()`, **inerte por configuración**. |
| 9 | Tests. |

**Nada queda a medias para la tanda 2.** El idioma base y `ayudaOriginal` se
implementan y se prueban acá; en la tanda 2 se activan **solo con
`IDIOMA_TITULOS=es-MX`**, sin una línea más de código en esos dos frentes. Lo
único que la tanda 2 sí modifica es pasar `HUELLA_IDIOMA` a los constructores.

**Tests**

- Inercia por configuración: con `IDIOMA_BASE === IDIOMA_FALLBACK`, cero
  llamadas de fallback y salida idéntica, **corriendo con un lote que sí tiene
  títulos rotos** para que no pueda pasar por casualidad.
- Los cuatro estados de huella y los tres espacios disjuntos (§4).
- Rollback de caché, los cinco pasos (§4).
- **Barrido de claves construidas a mano** (§4), visto en rojo al menos una vez.
- Las tres señales: `tv:33238`, `tv:117217`, `movie:1510795`, `tv:12513`.
- El pasaje al inglés **no** se repara: `tv:1399`, `movie:1084242`, `movie:585`.
- Fusión por campo: sinopsis vacía + título `es-MX` válido conserva el `es-MX`.
- `ayudasDeBusqueda`: filtra por plataforma disponible; descarta la que coincide
  con el título visible; **`movie:278` con `es-ES` no emite `ayudaOriginal`**;
  Mel Brooks **no** duplica el original como respaldo genérico; con
  `CONSULTA_VERIFICADA=0` devuelve vacío.
- `DEFAULTS.language` es `IDIOMA_BASE` **y ya está cableado**; `searchTitles`
  sigue en `en-US`. El mismo test corre con `IDIOMA_BASE` forzado a `es-MX` para
  probar que la activación por variable funciona **antes** de la tanda 2.
- Modo compatible de las claves: cada constructor devuelve **exactamente** la
  cadena que producía el código viejo. Se afirma con los literales de hoy
  (`card:movie:278`, `top:pop:n:movie`, …).

**Manual, en Preview**

1. `/titulo/movie/12535` con Disney+ activa → "En Disney+, buscala como «High
   Anxiety»", el botón copia esa cadena, y **no** aparece además el respaldo
   genérico.
2. `/titulo/movie/278` con Netflix → **sin bloque**.
3. `/titulo/movie/557` (Prime) → **sin bloque**: la consulta es el título visible.
4. Home frío: **612 llamadas** y **cero páginas de fallback**. Si sube, algo se
   cableó de más.
5. Segunda carga: `[home] HIT` con **la misma clave que antes del deploy**. Si
   dice `MISS`, hay un arranque frío no previsto.

**Reversión:** `CONSULTA_VERIFICADA=0` + redeploy.

---

### Tanda 2 — cambio de idioma

**El único arranque frío del plan, y el único cambio GLOBAL del idioma del
catálogo y del Home.** No es el único cambio visible: la tanda 1 ya muestra la
ayuda de Mel Brooks y la tanda 3 cambia los títulos de Próximamente.

| Commit | Qué |
|---|---|
| 1 | **Pasar `HUELLA_IDIOMA` a los diez constructores, de una sola vez.** Es el único cambio de código de la tanda. |
| 2 | `IDIOMA_TITULOS=es-MX`, primero en Preview (§3). |

El idioma base y `ayudaOriginal` **ya están implementados y probados desde la
tanda 1**: acá se encienden con la variable, sin tocar código.

**Aceptación antes de promover**

- `npx tsc --noEmit` limpio y **todos los tests en verde — los 221 existentes más los nuevos**.
- `medir-fallback-idioma.mjs`: rotos ≤ 1 de 1021.
- Subcomando `sinopsis`: ≤ 2 de 60 sin sinopsis.

**Medición después**, contra la línea de base (informe §5):

| | Base | Tope |
|---|---|---|
| Llamadas a TMDB, Home frío | 612 | **≤ 660** |
| Comandos de Upstash, Home frío | 655 | **≤ 670** |
| Páginas de fallback | 0 | ~32 |
| Payload del Home | 84.063 B | ≤ 85.000 B |
| Home caliente | 1 comando, 2 ms | idéntico |
| `degradado` / `fallos` | false / 0 | false / 0 |
| Títulos por riel | 20×6 · 40 · 30 · 20 · 40 · 38 | idénticos |

**Manual**

1. **`[home] MISS` con la huella en la clave.** Si dice `HIT`, no se cableó.
2. Un riel y la ficha del mismo título muestran **el mismo nombre**.
3. `movie:278` → "Sueño de fuga"; `tv:1399` → "Game of Thrones";
   `movie:1084242` → "Zootopia 2"; `movie:585` → "Monsters, Inc."
4. `/titulo/movie/278` → ahora **sí** aparece `ayudaOriginal`.
5. `/titulo/movie/12535` → sigue mostrando la verificada, **sin** duplicar.
6. Ruleta: varias tarjetas, encabezado y cuerpo sin contradicción.
   **Se esperan CERO contradicciones conocidas**: las dos que había
   (`movie:277834`, `movie:13179`) están corregidas y verificadas. Si aparece
   una, es nueva y hay que anotarla.
7. `/buscar`: "Duro de matar" y "Mi pobre angelito" siguen encontrando.
8. `/top` y `/personas`: títulos en `es-MX` — las dos superficies de `top:pop:`
   y `people:popular:`, las claves menos obvias.

**Reversión:** `IDIOMA_TITULOS=es-ES` + redeploy. Apaga el idioma **y**
`ayudaOriginal` en el mismo movimiento, y las claves vuelven a `es-ES.r1`.

---

### Tanda 3 — upcoming

| Commit | Qué |
|---|---|
| 1 | `supabase/functions/tmdb-sync/lib/tmdb.ts` a `es-MX` + fallback antes de escribir. |
| 2 | `scripts/backfill-upcoming-idioma.mjs` (§5), con dry-run por default. |

**Manual**

1. Sync a mano; las filas nuevas entran en `es-MX`.
2. **Dry-run** del backfill: revisar el conteo y las claves antes de aplicar.
3. `--aplicar`; confirmar que el snapshot quedó escrito y que las filas
   afectadas coinciden con el dry-run.
4. `/proximamente` y la ficha del mismo título muestran el mismo nombre.
5. Ningún título en alfabeto no latino y ninguna sinopsis vacía nueva.
6. **Ensayar la reversión**: `--desde=<snapshot>` en Preview y verificar que
   restaura **todas** las filas. Si la reversión no se ensayó, no está probada.

---

## 8bis. Trampa del banco: procesos huérfanos

**Pasó, y rompió el `.next` del repo principal.** El arnés hacía `kill $PID`
sobre lo que devuelve `npx next dev`, que es solo el **wrapper**: el servidor de
Next real es un hijo y sobrevivía. Después de siete corridas quedaron **ocho
servidores de Next vivos**, todos con `node_modules` compartido con el repo por
el junction. Con eso, un `npm run dev` normal devolvía:

```
TypeError: Cannot read properties of undefined (reading 'call')
  at options.factory (.next/static/chunks/webpack.js)
```

Síntoma clásico de chunks corruptos, y **no tiene nada que ver con el código**:
se descartó primero verificando que `lib/providers-ar` ya lo importan seis
componentes cliente, incluido `DetailView`, y que `node_modules/.cache` ni
siquiera existía.

**Corregido en el arnés:** `taskkill /T /F` sobre el árbol y espera activa hasta
que el puerto quede libre. **El junction se eliminó**: el banco ya no comparte
`node_modules`. Para volver a usarlo hay que recrearlo **con el dev del repo
apagado**:

```powershell
New-Item -ItemType Junction -Path "<banco>
ode_modules" -Target "<repo>
ode_modules"
```

**Si el error vuelve a aparecer:**

1. Matar todo `next/dist/server/lib/start-server.js` que no sea el dev deseado.
2. `rm -rf .next`.
3. Levantar el dev de nuevo.

Misma familia que la nota ya conocida del proyecto ("`next build` con el dev
activo rompe `.next`"): **dos procesos de Next tocando los mismos artefactos**.

---

## 8. El banco de pruebas

El worktree de `scratchpad/banco` **se conserva** hasta cerrar la comparación
posterior a la tanda 2. Es lo que produce las cifras de la tabla de aceptación,
y sin él la comparación "antes/después" no se puede rehacer con el mismo
instrumento.

**Después de la tanda 2, y solo cuando estén versionadas** la medición
post-cambio en `docs/medidas/` y la comparación contra la línea de base:

```bash
git worktree remove --force "…/scratchpad/banco" && git worktree prune
```

Explícito, no implícito: mientras el worktree exista, `git worktree list` lo
muestra y puede confundir a quien mire el repo.

---

## 9. Fuera de alcance, declarado

- **Paramount+**: sin cuenta, sin verificar. No bloquea.
- **`alternative_titles`**: fuera de la v1 (2 de 5, agrega payload, falló en el
  caso que disparó todo).
- **Migrar el mapa a Supabase**: pasadas ~50 filas, o la primera vez que haga
  falta corregir una sin deployar. `ayudasDeBusqueda()` ya es `async`, así que
  no cambia ninguna firma.
- **Los dos textos de la ruleta**: pendientes de tu aprobación (§6).
