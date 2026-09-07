# Próximamente — diagnóstico y simulación

**Fecha de medición:** 2026-09-04 (hora argentina).
**Rama:** `fix/proximamente-rediseno`, worktree `D:/DESARROLLO/stream central/wt-proximamente-v2`, desde `main` en `5297e25`.
**Estado:** diagnóstico y simulación. **Nada implementado.**

Todas las mediciones son contra la base viva y contra Producción, **sólo lectura**.

---

## 1. El bug del selector

### Causa raíz

Una línea: `components/upcoming/UpcomingAllView.tsx:78`.

```js
if (filtroPrevio.current === null) { filtroPrevio.current = filtro; return; }
```

`filtroPrevio` se inicializa de forma perezosa **dentro del efecto que lo usa**. Ese
efecto depende de `[filtro, load]`, y en el render donde ocurre la carga inicial
—cuando `fase` pasa a `"listo"`— ninguna de las dos cambió, así que **el efecto no
corre** y `filtroPrevio` se queda en `null`.

El primer clic del usuario es entonces consumido como "la inicialización": el
efecto corre, ve `null`, lo pone en `"movie"` y **retorna sin cargar nada**.

### No es una respuesta fuera de orden: no hay ninguna respuesta

La pregunta era *"qué respuesta termina mostrando Series bajo el botón Películas"*.
La respuesta es: **ninguna**. `load()` no se llama, no se emite ningún `fetch`, y la
grilla conserva los items de la carga `all` anterior — que hoy son **100 de 100
series, 51% anime** (medido más abajo).

Esto importa para el arreglo: **`reqId` funciona bien** y no es el culpable. Un
arreglo dirigido a la carrera de respuestas no cambiaría nada.

### Reproducción

`scratch/11-bug-selector.mjs` simula el orden real de efectos de React (orden de
declaración, re-ejecución sólo por cambio de dependencias, refs sin render) sobre la
máquina de estados exacta de las líneas 59–84.

| Escenario | `filtroPrevio` al primer clic | Resultado |
|---|---|---|
| **A.** Entrada directa por link, sin snapshot | `null` | **BUG** — el clic se traga |
| **B.** Vuelta de una ficha, snapshot con filtro `all` | `null` | **BUG** — el clic se traga |
| **C.** Vuelta de una ficha, snapshot con filtro `tv` | `"tv"` | correcto |

En C el `setFiltro("tv")` de la restauración **cambia** `filtro`, así que el efecto
sí corre y `filtroPrevio` queda inicializado bien.

**Eso explica el "a veces" del reporte.** No es intermitente ni una carrera: es
determinístico. Falla siempre que se llega a la página con el filtro en `Todos`
—el caso normal— y anda siempre que se vuelve de una ficha con Películas o Series
ya elegido. Y el rodeo "tocar Series y después Películas" funciona porque el primer
clic ya dejó `filtroPrevio` inicializado.

### Consecuencia peor: el snapshot se guarda corrompido

Durante la ventana en que el botón dice `movie` pero los items son de `all`,
`useEstadoSimple` guarda ese par. El efecto de guardado depende de `extra`, que en
`UpcomingAllView:33` es un objeto literal nuevo en cada render, así que **guarda en
cada render**:

```js
extra: { filtro },   // objeto nuevo cada render -> el efecto de guardado corre siempre
```

Se persiste `{ datos: <items de all>, extra: { filtro: "movie" } }`. Volver de una
ficha restaura entonces series bajo el botón Películas **de forma estable**, no
transitoria. Y de paso se serializan los 100 items en cada render.

---

## 2. El riel del Home también está roto, y no es sólo lentitud

Medido contra Producción, `GET /api/upcoming?mix=1&limit=15`:

```
pedidos: 15   devueltos: 12      (1 película + 11 series)
```

`upcomingMix` calcula `per = Math.ceil(limit / 2) + 3 = 11` por tipo, asumiendo que
los dos tipos tienen oferta. Hay **una sola película en toda la agenda**, así que el
riel se queda en 12 tarjetas y nunca llega a 15.

Peor: el intercalado pone esa única película **en la posición 2**, entre dos títulos
del 04/09.

```
1. 2026-09-04  tv     El Señor de los Cielos
2. 2026-09-30  movie  Libera nos: Il trionfo sul male   <- salta 26 días
3. 2026-09-04  tv     La Promesa
```

El riel se presenta como cronológico y no lo es.

---

## 3. Distribución actual completa

Base viva, `release_date >= 2026-09-04`:

| | |
|---|---|
| Filas vigentes | 246 |
| Con plataforma soportada (lo que se muestra) | **238** |
| Descartadas por plataforma no mapeada | 8 |
| Títulos únicos `tipo:id` | 238 — **sin repetidos** |

### Por tipo y naturaleza

| | n | % |
|---|---|---|
| Series (`tv`) | 237 | 99.6% |
| **Películas** | **1** | **0.4%** |
| Episodios semanales | 156 | 65.5% |
| Estrenos de temporada (`is_season_premiere`) | 81 | 34.0% |
| **De ésos, temporada 1 (serie NUEVA)** | **0** | **0%** |

### Dos supuestos del criterio editorial no tienen oferta

El orden de prioridad aprobado empieza por:

1. **Películas con plataforma AR confirmada** → hay **1** en toda la agenda:
   *Libera nos: Il trionfo sul male*, 30/09, popularidad **0.60**.
2. **Series nuevas** → hay **0**. Ninguno de los 81 premieres es temporada 1. Son
   T57 de *Rodando por América*, T29 de *South Park*, T30 de *La voz de América*.

La lista va a estar dominada por las prioridades 3 y 4 sí o sí. Eso no invalida el
criterio —el orden sigue siendo el correcto— pero conviene saberlo antes de esperar
una portada de películas y series nuevas que los datos no pueden llenar.

### Fechas: el problema está acá

Rango total: **04/09 → 01/12**, 50 días con contenido.

```
04/09  28    10/09  10    (y de acá en adelante entre 1 y 4 por día)
05/09  18    11/09   3
06/09  28    12/09   1
07/09  22    13/09   1
08/09  19    14/09   4
09/09  26    15/09   1
```

**141 de 238 elementos caen en los primeros 6 días.** Por eso `limit=100` ordenado
por fecha nunca pasa del 08/09.

### Lo que hoy devuelve `/api/upcoming?limit=100`

| | |
|---|---|
| Rango | 04/09 → 08/09 — **5 días de 50** |
| Series | 100 / 100 |
| Películas | **0** |
| Género Animación | 58 (58.0%) |
| Crunchyroll | 47 (47.0%) |
| Episodios semanales | 99 |
| Estrenos de temporada | 1 |

Reproduce la medición de Producción (96 series 04–07/09, 57 animación, 46
Crunchyroll) con un día más de ventana.

### Plataformas

`cr` 67 · `n` 58 · `m` 40 · `d` 30 · `p` 22 · `mv` 22 · `pp` 21 · `un` 21 · `at` 8 · `cv` 7 · `ok` 3 · `vx` 1

---

## 4. Anime: qué clasificación se sostiene con los datos de HOY

### `original_language` y `origin_country` NO existen en la tabla

Columnas reales de `upcoming_content`: `tmdb_id, media_type, title, original_title,
overview, poster_path, backdrop_path, release_date, season_number, episode_number,
episode_name, is_season_premiere, tv_status, genre_ids, popularity, vote_average,
status, created_at, updated_at`.

Lo que sí hay para clasificar: **`genre_ids`** (16 = Animación), **`original_title`**
y **los proveedores**.

### Los clasificadores posibles, medidos

| | Marca | % del total |
|---|---|---|
| A. Sólo Crunchyroll | 67 | 28.2% |
| B. Sólo género Animación | 100 | 42.0% |
| C. Animación + escritura japonesa en `original_title` | 74 | 31.1% |
| **D. Crunchyroll ∪ (Animación + escritura japonesa)** | **78** | **32.8%** |

**"Animación" y "anime" no son lo mismo, y los datos lo muestran.** De los 100 con
género Animación, 33 no están en Crunchyroll, y ese grupo es mezcla real:

- **Es anime:** *Chiikawa* (`ちいかわ`), *Destellos del mañana* (`二十世紀電氣目録`), *Magilumiere* (`株式会社マジルミエ`), *THE GHOST IN THE SHELL* (`攻殻機動隊`)
- **No es anime:** *Los Simpson*, *South Park*, *Futurama*, *American Dad*, *Teen Titans Go!*, *Gabby's Dollhouse*, *Masha y el Oso* (`Маша и Медведь`, rusa), *Blaze and the Monster Machines*

### Por qué D es la recomendación

**Crunchyroll está contenido en Animación de forma exacta en estos datos:** hay
**0** títulos de Crunchyroll sin género Animación. O sea que Crunchyroll es señal de
precisión perfecta, con recall de 67/100.

`original_title` con escritura japonesa (hiragana, katakana, kanji) recupera el
resto. De los 22 que D deja afuera, **19 son aciertos** (los Simpson y compañía) y
sólo **3 son anime real perdido**, los tres con título romanizado:

- *Bleach* → `BLEACH`
- *Beyblade X* → `BEYBLADE X`
- *MAO* → `MAO`

(*Super Wings* → `출동! 슈퍼윙스` es coreana: animación, no anime japonés. Discutible
si cuenta como falso negativo.)

**Precisión cercana al 100%, recall 78/81 ≈ 96%, sin migración y sin una llamada más.**

### Costo real de agregar los campos

Verificado contra TMDB: **`discover` YA devuelve los dos campos en cada resultado.**

```
campos de discover/tv: adult, backdrop_path, first_air_date, genre_ids, id, name,
  origin_country, original_language, original_name, overview, popularity,
  poster_path, softcore, vote_average, vote_count
```

El sync los recibe y los tira: `RawTitle`
(`supabase/functions/tmdb-sync/lib/tmdb.ts:30`) no los declara.

El costo es entonces:

| | |
|---|---|
| Llamadas extra a TMDB | **0** |
| Migración | 2 columnas nullable (`original_language text`, `origin_country text[]`) |
| Código | ~4 líneas: `RawTitle`, `Candidate`, el payload del upsert |
| Backfill | **innecesario** — el sync reescribe la fila entera cada corrida (6am), así que en 24 h están todas |
| Riesgo | bajo: columnas nullable, nadie las lee hasta que se decida usarlas |

**Es barato.** `original_language = "ja"` sería más limpio que la heurística de
escritura y recuperaría *BLEACH*, *BEYBLADE X* y *MAO*. Pero **no es bloqueante**:
D funciona hoy con 96% de recall, y la migración se puede hacer después sin tocar
nada del rediseño.

---

## 5. Películas de TMDB: las cuatro preguntas

Ventana 04/09 → 03/12 (90 días), región AR.

### 1. Qué devuelve TMDB como upcoming para Argentina

| | |
|---|---|
| `/movie/upcoming?region=AR` | **14** resultados |
| `/discover/movie` con la ventana de 90 días | **2714** en 136 páginas |

### 2. Cuántas son estrenos de cine/general

Muestra de 200 por popularidad; 120 verificadas una por una con `watch/providers`:

| | |
|---|---|
| Con `flatrate` AR | **0** |
| Sólo alquiler/compra AR | **0** |
| **Sin NINGÚN proveedor AR** | **120 / 120** |

Son todas estrenos de cine. Esto confirma lo que ya estaba medido y anotado en
`sync-upcoming.ts` ("de 120 películas muestreadas… **0** tenían proveedor flatrate
argentino").

### 3. Cuántas tienen `flatrate` AR confirmado

Con el filtro puesto sobre los 59 proveedores que TMDB publica para AR: **2** en 90 días.

```
2026-09-30  Libera nos: Il trionfo sul male
2026-10-01  டிமான்டி காலனி 3            (tamil)
```

### 4. Cuántas tienen anuncio de streaming sin proveedor en TMDB

Sobre las 200 más populares de la ventana, verificando `homepage` contra los
dominios oficiales que la app ya acepta para películas (Netflix, Disney+, Prime,
Apple TV+):

| | |
|---|---|
| Con `homepage` no vacío | 5 / 200 |
| Con `homepage` de plataforma soportada | **3** |
| Con `flatrate` AR informado por TMDB | 0 |

```
2026-09-23  [Prime]      La hipótesis del amor          pop 54   primevideo.com/detail/0IH8VKX…
2026-10-08  [Apple TV+]  Matchbox: La película          pop  9   tv.apple.com/es/movie/umc…
2026-11-24  [Apple TV+]  El camino del pequeño guerrero pop  5   tv.apple.com/es/movie/umc…
```

### La pérdida de precisión que produciría relajar el requisito

**No recomiendo relajarlo, pero acá está el número que se pidió:**

| | Películas en 90 días |
|---|---|
| Regla estricta (sólo `flatrate` AR de TMDB) | **2** |
| Relajada con dominio oficial en `homepage` | **5** (+3) |

De esas 3, una es sustancial (*La hipótesis del amor*, original de Prime, pop 54) y
dos son marginales (pop 9 y 5).

**Y hay un obstáculo estructural:** `evidenciaOficialDe` (`lib/enlace-oficial.ts:394`)
arranca con

```ts
if (!estreno || estreno > opts.hoy) return null;
```

O sea que la maquinaria de evidencia oficial que la app ya tiene **está deliberadamente
cerrada a títulos futuros**, que es exactamente el caso de Próximamente. Relajar el
requisito no es reusar lo que existe: es abrir ese gate, y eso toca disponibilidad
en toda la app, no sólo en esta sección.

**Recomendación:** mantener el requisito estricto. Gana 3 títulos, cuesta abrir un
gate central y arriesga presentar como "próxima en streaming" una película que
llegue a cine. Si el dueño quiere los 3, es una decisión aparte y posterior.

---

## 6. Simulación del criterio nuevo

### El algoritmo simulado

1. Dedup por `tipo:id`.
2. Clasificar en niveles: 1 película con plataforma AR · 2 serie nueva · 3 estreno de temporada · 4 episodio semanal.
3. **Presupuesto de episodios: top-`K` de cada día por popularidad.** Los niveles 1–3 entran siempre.
4. **Cupo de anime.** Si el tope es 20% del acumulado y hay `M` no-anime, entonces `a ≤ M·0.20/0.80`. Se eligen los `a` anime **más populares**.
5. Orden **total y determinístico**: fecha asc → nivel asc → popularidad desc → `tmdb_id` asc.
6. Recorrido en ese orden admitiendo un anime sólo si está en el cupo **y** si `(anime+1) ≤ 0.20·(total+1)`. Los rechazados se descartan, no se posponen — así no hay duplicados entre páginas.
7. Paginar con `slice(offset, offset+20)` sobre esa lista.

### Actual vs nuevo

| | Actual | `K=2` | **`K=3`** | `K=4` | `K=6` |
|---|---|---|---|---|---|
| Total | 100 | 107 | **113** | 119 | 125 |
| Rango | 04/09→08/09 | 04/09→01/12 | **04/09→01/12** | 04/09→01/12 | 04/09→01/12 |
| Días cubiertos | **5** | 50 | **50** | 50 | 50 |
| Películas | 0 | 1 | **1** | 1 | 1 |
| Estrenos de temporada | 1 | 81 | **81** | 81 | 81 |
| Episodios semanales | 99 | 25 | **31** | 37 | 43 |
| **Anime** | **51 (51.0%)** | 9 (8.4%) | **11 (9.7%)** | 13 (10.9%) | 14 (11.2%) |

**Recomendado `K=3`:** 113 elementos, 50 días, 9.7% de anime.

### El invariante de 20% en cada tanda acumulada

| Acumulado | Anime | % | |
|---|---|---|---|
| 20 | 3 | 15.0% | OK |
| 40 | 4 | 10.0% | OK |
| 60 | 5 | 8.3% | OK |
| 80 | 10 | 12.5% | OK |
| 100 | 11 | 11.0% | OK |
| 113 | 11 | 9.7% | OK |

### Qué mecanismo hace el trabajo (y no es el tope de anime)

| Variante | n | anime | % anime | epi | días |
|---|---|---|---|---|---|
| 0. Actual: fecha asc, `limit=100` | 100 | 51 | **51.0%** | 99 | 5 |
| 1. Sin ningún tope | 238 | 78 | 32.8% | 156 | 50 |
| 2. **Sólo** tope de anime 20% | 184 | 24 | 13.0% | 103 | 50 |
| 3. **Sólo** tope de 3 episodios/día | 114 | 12 | 10.5% | 32 | 50 |
| 4. Los dos (el diseño) | 113 | 11 | 9.7% | 31 | 50 |

**El tope por día es lo que baja el ruido.** La variante 3, sin tope de anime
alguno, ya da 10.5%. El tope del 20% saca **1 elemento más**.

Eso no lo hace inútil: queda como **garantía** de que un día raro con muchos
estrenos de anime no rompa la sección. Pero conviene saberlo para no atribuirle una
mejora que produce otra cosa.

### Plataformas en la selección nueva

`n` 34 (30%) · `d` 22 · `mv` 20 · `m` 19 · `p` 16 · `un` 15 · `pp` 13 · **`cr` 7 (6.2%)** · `at` 7 · `cv` 5 · `ok` 1 · `vx` 1

Crunchyroll baja de 47% a 6.2%.

### Títulos que entran y salen

**Entran 100.** Los de más peso, que hoy no se ven nunca:

```
09-08  Ted Lasso                            pop 283
09-09  Reacher                              pop 595
09-16  South Park T29                       pop 107
09-16  Caballos lentos T6                   pop  80
09-10  Materia oscura                       pop  99
09-13  American Dad                         pop 157
09-17  Stranger Things: Relatos del 85 T2   pop  29
09-18  Tierra de Mafia T2                   pop  57
09-30  Libera nos (la única película)
```

**Salen 87**, todos episodios semanales del 04–08/09 con popularidad baja o anime
que excede el cupo:

```
09-04  The Rotten Files with Stephanie Soo        pop   1
09-04  The Adam Ray Show                         pop   4
09-04  Crowned in a Hundred Days         [anime]  pop   8
09-04  Kore Kaite Shine                  [anime]  pop  25
09-04  The Frontier Lord Begins…         [anime]  pop  25
09-04  Hasta que la camiseta se seque             pop  12
```

Detalle completo en `scratch/simulacion.json`.

---

## 7. Dónde está la demora del Home

### Producción, `GET /api/upcoming?mix=1&limit=15`

| | |
|---|---|
| **Frío (1ra llamada)** | **1543 ms** |
| Caliente | mediana **499 ms**, min 307, max 515 |
| Referencia: `/api/health` | 548–572 ms |

**Caliente, la sección no cuesta nada medible.** Los ~500 ms son la latencia base
de mi máquina a Vercel — `/api/health`, que no hace nada, tarda lo mismo. **Frío
cuesta ~1 s**, y eso es arranque en frío de la lambda.

`/api/upcoming` es una lambda **distinta** de `/api/home`, así que una visita fresca
paga dos arranques en frío independientes.

### La capa de datos, aislada

Consultas directas a Supabase, 6 corridas cada una:

| Consulta | Frío | Mediana | Filas | Peso |
|---|---|---|---|---|
| `movie`, limit 11, **con** join de providers | 931 ms | 274 ms | 1 | 0.4 KB |
| `tv`, limit 11, **con** join | 268 ms | 268 ms | 11 | 6.8 KB |
| `movie`, limit 11, **sin** join | 253 ms | 263 ms | 1 | 0.3 KB |
| `tv`, limit 11, **sin** join | 265 ms | 265 ms | 11 | 6.2 KB |
| `tv`, limit 100, **con** join | 489 ms | 488 ms | 100 | 70.7 KB |
| `tv`, limit 100, **sin** join | 485 ms | 485 ms | 100 | 64.3 KB |
| **ambos tipos, limit 1000, con join** | **491 ms** | 681 ms | **246** | 169.3 KB |

### Conclusiones

1. **El join de proveedores NO es el problema.** 268 vs 265 ms con 11 filas; 489 vs 485 con 100. Cuesta ~3 ms.
2. **El piso es latencia, no trabajo.** Traer 1 fila de 0.3 KB tarda 260 ms.
3. **Traer la agenda ENTERA sale igual que traer 100.** 246 filas y 169 KB en ~490 ms, lo mismo que `limit=100`. **El diseño nuevo —una consulta completa y seleccionar en el servidor— no cuesta más que lo de ahora.**
4. **La función de selección no está medida porque todavía no existe**, pero opera sobre 246 elementos en memoria: es despreciable frente a 490 ms de red.
5. **Lo que queda es el arranque en frío**, ~1 s. Es de la plataforma, no del código.

Según lo pedido, **no propongo caché todavía**. Y si se propusiera, no atacaría lo
medido: el caché no arregla arranques en frío de la primera visita.

### "El Home no debe esperar a Próximamente"

**Ya no espera.** `UpcomingSection` se monta en `components/CatalogView.tsx:108`,
fuera del gate `cargando` de los rieles, y hace su propio fetch por `useUpcoming`.
Mientras carga muestra sus propios skeletons y los rieles de abajo se pintan igual.
**No hace falta cambiar nada acá.**

---

## 8. Verificado y limpio

- **Fechas en hora argentina.** `upcomingList` filtra con `hoyAR()` (`lib/fecha.ts:33`)
  y `formatReleaseDate` parsea a mano para no correr el día. **No hay bug de fecha en
  Próximamente.**
- **Sin repetidos en los datos.** Los 238 elementos son 238 `tipo:id` distintos: el
  sync guarda sólo el próximo episodio de cada serie. El dedup igual va como guarda.
- **`useEstadoSimple` es el mecanismo correcto** para la restauración de hoy, pero con
  paginación 20+20 la vista deja de ser "trae todo de una". Corresponde
  **`useListaPaginada`**, que ya restaura items + página + scroll. No hay que
  inventar nada.

### Un detalle aparte, fuera de alcance

`upcomingThisMonth` (`lib/upcoming.ts:190`) calcula el mes con
`getUTCFullYear`/`getUTCMonth` sobre `new Date()`. El 31/12 a las 22:00 AR daría
enero. Es el **issue #4** de `docs/ISSUES.md`. Sólo lo alcanza `?month=`, que ninguna
vista llama hoy. **No lo toqué.**

---

## 9. Lo que falta decidir antes de implementar

| # | Decisión | Recomendación |
|---|---|---|
| 1 | `K` = episodios semanales por día | **3** (113 elementos, 50 días, 9.7% anime) |
| 2 | Clasificador de anime | **D**: Crunchyroll ∪ (Animación + escritura japonesa). 96% de recall, sin migración |
| 3 | ¿Migrar `original_language`/`origin_country`? | **Sí, pero después.** 0 llamadas extra, sin backfill. No bloquea |
| 4 | ¿Relajar el requisito de plataforma en películas? | **No.** Gana 3 títulos y obliga a abrir un gate central de disponibilidad |
| 5 | ¿Piso de popularidad para estrenos de temporada? | **Pregunta abierta.** 81 premieres son el 72% de la lista y algunos son *Mark Rober's CrunchLabs* (pop 2) o *Campeonato de reposteros* (pop 12). El criterio aprobado los pone sobre los episodios, así que no filtré nada. Decisión del dueño |
| 6 | El riel del Home devuelve 12 de 15 | Arreglar `per` para que rellene con el tipo que sí tiene oferta, y **respetar el orden cronológico** |

### Limitación conocida del diseño

La selección se reconstruye en cada pedido de página. Es determinística mientras la
tabla no cambie, pero **el sync corre a las 6am** y una página pedida después podría
salir de una selección distinta. Es la misma clase de limitación ya documentada para
`/lista/miniseries` con la paginación de TMDB. El dedup por `tipo:id` en el cliente
—que ya está pedido— la cubre.
