# Próximamente — procedimiento de salida

**Rama:** `fix/proximamente-rediseno`. **Nada de esto está ejecutado todavía.**

El orden NO es opcional: el paso 1 tiene que estar hecho antes del paso 5. El
read-path pide `original_language` en su `SELECT`, y sin la columna PostgREST
responde `400` → `upcomingList` lanza → **`/api/upcoming` entero devuelve 500**,
no sólo la lista: también el riel del Home, `?month=` y el cruce con la watchlist.
Verificado contra la base viva:

```
{"code":"42703","message":"column upcoming_content.original_language does not exist"}
```

Cada paso tiene su comprobación. Si una falla, **parar ahí** — los pasos 1 a 4 no
tocan la web, así que hasta el 5 no hay nada visible para el usuario.

---

🔴 **ÉSTA ES LA ÚNICA SECUENCIA.** El documento tuvo dos numeraciones en
paralelo —una vieja y una corregida— y eso era una trampa: se podía seguir la
equivocada entera. Quedó la corregida. Lo que no es un paso —la evidencia y la
vuelta atrás— está al final, sin número.

---

## 0. Las tres cosas que NO son lo mismo

El costo de esta app tiene tres capas y mezclarlas lleva a conclusiones falsas:

| | Qué es | Quién la paga | Cuota |
|---|---|---|---|
| **Llamada a TMDB** | tráfico saliente a `api.themoviedb.org` | **sólo la Edge Function `tmdb-sync`** | la de TMDB |
| **Petición a `/api/upcoming`** | fetch del navegador a nuestra propia API | el cliente | invocaciones de Vercel |
| **Consulta a Supabase** | `select` de PostgREST sobre `upcoming_content` | el server, por cada `/api/upcoming` | la de Supabase |

**`/api/upcoming` NO llama a TMDB, ni una vez.** Verificado sobre el código:
`lib/upcoming.ts` sólo importa `supabaseServer`, y su única mención de TMDB es
`TMDB_IMG`, que arma la URL de una imagen — una cadena, sin red. La agenda la
escribe únicamente el sync.

De ahí la cadena que importa: **menos peticiones a `/api/upcoming` = menos
consultas a Supabase, y CERO efecto sobre TMDB.**

### El arreglo de restauración no agrega llamadas a TMDB

No podría: no toca el sync. Y tampoco agrega peticiones internas — las quita.
Medido en el navegador, volver de una ficha pasó de **1 petición** a
`/api/upcoming` a **0** en los tres filtros. O sea:

| | Antes | Después |
|---|---|---|
| Llamadas a TMDB al volver | 0 | **0** |
| Peticiones a `/api/upcoming` al volver | 1 | **0** |
| Consultas a Supabase al volver | 1 | **0** |

El snapshot sale de `sessionStorage`. Es una mejora de costo, no un costo nuevo.

---

## 1. Aplicar la migración `008`

🔴 **INTENTADO EL 2026-09-05 Y NO SE PUDO: falta una credencial con permiso de
DDL.** El servidor MCP de Supabase responde *Unauthorized*, y el CLI —que sí
encuentra un `SUPABASE_ACCESS_TOKEN` en el entorno— también: ese token no sirve.
El `.env.local` sólo tiene la anon key, la service role key y la URL, y ninguna
de las tres puede ejecutar un `alter table`: la service role key es un JWT para
PostgREST, no una contraseña de Postgres.

**Lo tiene que correr el dueño**, desde el SQL editor del panel de Supabase o con
el CLI autenticado. Es una sola sentencia y es idempotente.

```sql
alter table public.upcoming_content
  add column if not exists original_language text;
```

**Aceptación:** la sentencia termina sin error. Es `if not exists`, así que
correrla dos veces también pasa.

**Costo:** 0 TMDB · 0 `/api/upcoming` · 1 DDL. Columna nullable sin default: en
Postgres es sólo metadata, no reescribe las ~250 filas ni toma un lock largo.

## 2. Confirmar que la columna es `text` y nullable

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name  = 'upcoming_content'
  and column_name = 'original_language';
```

**Aceptación: exactamente una fila**, y `data_type = text`, `is_nullable = YES`.
Cero filas = la migración no se aplicó. `is_nullable = NO` = alguien le puso un
`not null`; hay que sacarlo, porque las filas viejas quedan en `NULL` hasta la
próxima corrida del sync.

## 3. Leerla con la anon key, por PostgREST

**Estado medido el 2026-09-05, ANTES de la migración** (sólo lectura, anon key):

| Comprobación | Resultado |
|---|---|
| Columna suelta | `HTTP 400`, `code 42703`, *column upcoming_content.original_language does not exist* |
| SELECT completo del read-path | `HTTP 400`, mismo `42703` |
| **Control**: el mismo SELECT **sin** `original_language` | **`HTTP 200`** |

El control es lo que aísla el problema: con la anon key se leen las otras 14
columnas **y el join anidado devuelve un array**. O sea que los privilegios y el
join ya funcionan, y lo único que falta es la columna. Cuando el paso 1 esté
hecho, estas dos comprobaciones tienen que pasar a `200` sin tocar nada más.

⚠️ **Sin credenciales en la línea de comandos ni en logs**: las dos variables
salen del entorno, y por eso los comandos no traen ningún valor literal. `-s -S`
calla la barra de progreso pero deja pasar los errores.

```bash
# En una shell que ya tenga las variables cargadas desde .env.local.
curl -s -S -w '\nHTTP %{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/upcoming_content?select=tmdb_id,original_language&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

**Aceptación: `HTTP 200`** y un cuerpo que sea un array JSON con un objeto que
tenga la clave `original_language` (su valor puede ser `null` antes del paso 5:
eso es lo esperado, no un fallo).

## 4. El SELECT COMPLETO del read-path

Éste es el que decide, porque es literalmente el `select` que manda la app —
incluido el join anidado a proveedores. El de arriba sólo prueba la columna suelta.

```bash
curl -s -S -w '\nHTTP %{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/upcoming_content?select=tmdb_id,media_type,title,poster_path,backdrop_path,overview,release_date,season_number,episode_number,episode_name,is_season_premiere,genre_ids,popularity,vote_average,original_language,upcoming_content_providers(provider_id)&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

**Aceptación: `HTTP 200`** y el objeto trae `original_language` **y**
`upcoming_content_providers` como array.

⚠️ Si el select del código cambia, este comando queda viejo. La fuente de verdad
es la constante `SELECT` de `lib/upcoming.ts`; conviene copiarla de ahí.

### Ante un error, mirar el cuerpo — no el status solo

| `code` | Qué es | Qué hacer |
|---|---|---|
| `42703` *undefined_column* | PostgREST no ve la columna | el paso 1 no se aplicó, o su caché de esquema está viejo: `notify pgrst, 'reload schema';` |
| `42501` *insufficient_privilege* | el rol no puede leerla | `grant select on public.upcoming_content to anon;` |
| otro / ninguno | **no se puede clasificar de antemano** | PostgREST tiene códigos propios, y la respuesta puede venir de un proxy o del gateway. Mirar **status, `code` y `message` juntos** |

⚠️ `42501` llega como `401` **o** `403` según si la petición venía autenticada:
**no todo `401`/`403` es una clave mal puesta.**
Ver <https://docs.postgrest.org/en/v14/references/errors.html>.

**Costo de los pasos 2 a 4:** 0 TMDB · 0 `/api/upcoming` · 3 consultas a Supabase.

---

## 5. Desplegar el sync, y su costo real en TMDB

```bash
supabase functions deploy tmdb-sync
```

### El deploy en sí: 0 llamadas a TMDB

Desplegar no ejecuta nada. **El cambio tampoco agrega llamadas**, y esta vez está
verificado sobre el camino de código, no supuesto:

1. `original_language` se lee de `t`, que es el resultado de **`discover`** — el
   mismo objeto del que ya salían `title`, `genre_ids` y `popularity`
   (`sync-upcoming.ts`, películas y series). No hay un fetch nuevo.
2. **`discover` ya devolvía el campo**, comprobado contra la API en las dos
   formas: `discover/movie` y `discover/tv` lo traen en cada resultado.
3. **La reparación de idioma no lo pierde**: `fusionarPorCampo`
   (`_shared/idioma-nucleo.ts`) hace `{ ...base }` y sólo pisa `title`, `name` y
   `overview`, así que el `original_language` del idioma base sobrevive la fusión
   con el respaldo.
4. Los cuatro sitios que llaman a TMDB en el sync —`discover`, su `discover` de
   respaldo, `tvDetailsConProveedores` y `episodeDetails`— **no cambiaron**.

### Ejecutar `syncUpcoming` a mano SÍ cuesta, y es aparte

⚠️ **Es el costo de la corrida, no del cambio.** Una corrida manual gasta lo
mismo que la del cron, y si se dispara el mismo día, se **suma** a ella.

Estructura del gasto, leída del código (`SYNC_WINDOW_DAYS = 90`, sin
`SYNC_MAX_PAGES`, tope de la fuente `TOPE_PAGINAS_TMDB = 500`, `BATCH = 10`):

| Concepto | Llamadas |
|---|---|
| Catálogo de proveedores AR | **2** (`providerList` movie + tv) |
| `discover` de películas | 1 por página de la ventana |
| `discover` de series | 1 por página de la ventana |
| `discover` de respaldo | 1 por página **que tenga títulos rotos** |
| Detalle de cada serie descubierta | **1 por serie** (`tvDetailsConProveedores`, trae proveedores adentro) |
| Nombre de episodio de respaldo | 1 por episodio que lo necesite |

El término que domina es **una llamada por serie descubierta**. Como referencia
del orden de magnitud, ya medido en este repo: la ventana tenía ~1900 series
elegibles y `discover` pagina de a 20.

🔴 **No se corrió para medirlo, y no se va a correr sin autorización.** Cuando se
autorice, la propia respuesta de la función trae `{ candidates, kept, upserted,
providers, dropped, deleted, window, durationMs }` y el log imprime
`[idioma] fallback: N llamadas`, así que el número real queda registrado sin
tener que estimarlo.

**Aceptación del deploy:** `supabase functions list` muestra `tmdb-sync` con una
versión mayor a la anterior (**v8** al escribir esto).

## 6. Correr el sync y medir el llenado

```bash
curl -s -S -X POST "https://<ref>.supabase.co/functions/v1/tmdb-sync" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"job":"syncUpcoming"}'
```

⚠️ La service role key sale del entorno. **No pegar la respuesta con la clave en
ningún lado**; el cuerpo de la respuesta no la trae, pero el comando sí.

```sql
select count(*) as filas,
       count(original_language) as con_idioma,
       count(*) - count(original_language) as nulas
from public.upcoming_content
where release_date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date;
```

**Aceptación: `nulas = 0`.** `syncUpcoming` hace `upsert` con
`onConflict: 'tmdb_id,media_type'` de la fila **entera**, así que toda fila
vigente se reescribe con el idioma puesto.

🟡 **Si quedan nulas, no es bloqueante**: son filas que el descubrimiento no
volvió a ver y que la reconciliación borra a los `GRACE_DAYS` (2). Mientras
estén, cuentan como anime sólo si están en Crunchyroll — 83% de recall en vez de
100%. Anotar cuántas y seguir.

Y el desglose, para ver que el dato tiene sentido:

```sql
select original_language, count(*)
from public.upcoming_content
where release_date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
group by 1 order by 2 desc;
```

**Aceptación:** `ja` aparece con una cantidad del orden de las decenas. Medido el
2026-09-04 sobre 238 filas: `en` 119, **`ja` 81**, `ko` 10, `es` 7, `zh` 5,
`pt` 5, `fr` 4. Con `ja` en 0, la clasificación de anime quedaría sólo con
Crunchyroll y habría que revisar el sync antes de seguir.

---

## 7. La prueba local contra Supabase real (después de la migración)

Recién acá se puede probar el nivel 3. **En local, contra la misma base, sin
desplegar la web.**

```bash
npm run dev     # o el preview del worktree
```

### Lo que hay que verificar, y con qué criterio

| # | Qué | Aceptación |
|---|---|---|
| 1 | `/api/upcoming?page=1` | `200`, y el cuerpo trae `items`, `hayMas`, `total`, `page` |
| 2 | Los tres filtros | `Todos` y `Series` con varias páginas; `Películas` con `hayMas:false`. Cada solapa, tipo puro |
| 3 | Paginación | las páginas sucesivas no repiten ni saltean: servidos = únicos = `total` |
| 4 | Anime | ≤ 20% en cada tanda acumulada |
| 5 | Ninguna fecha con más de 3 series | contar por `releaseDate` |
| 6 | **Restauración** | volver de una ficha con cada filtro: filtro, tarjetas, página y scroll, **0 peticiones a `/api/upcoming`** |
| 7 | Primer cambio manual tras restaurar | **1** petición, `page=1` del filtro elegido |
| 8 | Fallo y reintento de tanda | con la red cortada, "Cargar más" conserva lo visible y ofrece Reintentar; al volver la red, reintenta **la misma página**, sin hueco |
| 9 | Home | `?mix=1&limit=15` devuelve **15** y en orden cronológico |

**Costo de esta prueba: 0 llamadas a TMDB.** Todo el recorrido pega a
`/api/upcoming`, que lee Supabase. Lo único que sube es el contador de consultas
a Supabase: una por petición.

⚠️ La ficha sí puede llamar a TMDB (`/api/title/...` pasa por `enrich`), así que
conviene entrar a **la misma ficha** en las tres repeticiones: la segunda y la
tercera salen del caché.


### Y en el navegador, que es lo que los curls no cubren


1. Abrir `/proximamente`. **Tocar Películas** — tiene que cambiar a la lista de
   películas **en el primer toque**. Ése era el bug del selector: el primer clic
   se tragaba y seguía mostrando series.
2. Volver a Todos y tocar **Cargar más** cinco veces. Cada tanda suma 20 sin
   borrar lo anterior y sin repetir tarjetas; al final el botón desaparece.
3. **Con Series elegido**, entrar a una ficha y volver con atrás. Tiene que volver
   el filtro, todas las tarjetas cargadas y la posición del scroll — y en la
   pestaña Red **no puede haber ninguna llamada a `/api/upcoming`**. Ése es el
   bloqueo que cerró la auditoría: la restauración no pide nada. Repetir con
   Películas.
4. Inmediatamente después de esa vuelta, tocar **Películas**: tiene que pedir
   `mediaType=movie&page=1` y **nada más** — una sola llamada, no dos.
5. Con las herramientas de red en modo offline, tocar **Cargar más**: lo que está
   en pantalla **no se borra** y aparece "No se pudo cargar el resto ·
   Reintentar". Volver a poner red y tocar Reintentar: entra la misma tanda que
   había fallado, sin saltearla.


## 8. Confirmar que Home y `/proximamente` no devuelven 500

```bash
for u in / /proximamente /api/upcoming?mix=1\&limit=15 /api/upcoming?page=1 /api/home /api/health; do
  printf '%-42s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' "https://app.yump.ar$u")"
done
```

Las seis en `200`. Un `500` en `/api/upcoming` con las otras en `200` apunta
directo al paso 1 o 2: la columna.

**Y el riel del Home tiene que traer 15, no 12:**

```bash
curl -s "https://app.yump.ar/api/upcoming?mix=1&limit=15" \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
    const d=j.items.map(i=>i.releaseDate);
    console.log(`items=${j.items.length} (esperado 15)`);
    console.log(`cronologico: ${d.every((x,i)=>i===0||d[i-1]<=x) ? "OK" : "🔴 ROTO"}`);'
```

Antes devolvía **12** y ponía la única película —del 30/09— en la **segunda**
posición, entre dos títulos del 04/09.

---

## 9. La prueba manual del dueño — condición previa al merge

**El merge no se propone hasta que el dueño pruebe la sección a mano.** Lo que
conviene mirar, en este orden:

1. Que `/proximamente` abra y muestre una agenda que **cubra semanas**, no cinco
   días.
2. Tocar **Películas** y que cambie **en el primer toque**.
3. **Cargar más** cinco veces: suma de a 20, sin repetir, hasta que el botón se va.
4. Entrar a una ficha y **volver con Atrás**: tiene que volver todo — filtro,
   tarjetas y posición.
5. Que el riel del Home muestre **15** y en orden de fecha.

## Orden de ejecución, y qué bloquea qué

```
1 migración → 2 columna → 3 anon key → 4 SELECT completo
                                             │
                                             ▼
                            5 deploy del sync → 6 correr y medir
                                             │
                                             ▼
                                    7 prueba local (Supabase real)
                                             │
                                             ▼
                            8 Home y /proximamente sin 500
                                             │
                                             ▼
                                 9 prueba manual del dueño
                                             │
                                             ▼
                                          MERGE
```

**Del 1 al 4 no se toca la web**: si algo falla ahí, nadie lo ve. El paso 5 es el
primero que cambia algo que corre solo (el cron diario). Los pasos 8 y 9 son
posteriores al deploy de la web, que va con el merge.

---

# Anexo: la evidencia (no son pasos)

## La evidencia, en tres niveles

No son intercambiables y conviene no mezclarlas.

| Nivel | Qué cubre | Estado |
|---|---|---|
| **1. Tests automáticos** | la decisión de pedir o no pedir, y las guardas estructurales | ✅ 966 pasan |
| **2. Navegador real con respuestas interceptadas** | el comportamiento de la interfaz: peticiones, restauración, scroll | ✅ **todos los escenarios** |
| **3. Integración real con Supabase** | que el read-path lea de verdad, con la columna y los datos reales | ⏳ **pendiente**: necesita la migración `008` |

⚠️ El nivel 2 usa datos inventados servidos desde el navegador. **No prueba nada
de Supabase ni de producción**, y no reemplaza al nivel 3.

## El fallo de restauración, y su causa demostrada

Al volver de una ficha, `/proximamente` no restauraba: volvía con Todos, 20
tarjetas, página 1 y una petición que no debía existir.

**La causa, medida con los stacks de cada acceso a `sessionStorage`** (no deducida
de un listener de logging):

```
67879.5  consumirVuelta      hay=false      <- la vista monta y DECIDE
67879.8  leerLista           hay=true       <- el snapshot SÍ estaba
67880.3  olvidarLista        {} olvidar     <- y lo BORRA
67883.8  (listener de popstate agregado al final, o sea el ÚLTIMO)
67884.0  marcarVuelta        MARCA          <- la marca llega 4,5 ms tarde
67885.6  fetch /api/upcoming?page=1
```

Tres hechos que fija esa traza:

1. **La marca se escribe después de que la vista decidió.** No es una hipótesis
   sobre el orden: `marcarVuelta` aparece 4,5 ms más tarde que `consumirVuelta`,
   y el stack dice que cada una vino de donde se espera.
2. **El montaje ocurre DENTRO del evento `popstate`.** Un listener agregado al
   final —o sea el último de la cola— corre a los 67883.8, después del montaje
   (67879.5) y antes de `marcarVuelta` (67884.0). Next registra su `popstate` en
   un `useEffect` de `AppRouter` y, adentro de ese handler, renderiza la ruta
   restaurada.
3. **El snapshot estaba y se perdió.** `leerLista` lo encontró; `decidirRestauracion`
   con `volvio:false` llamó a `olvidarLista`.

**Por qué el listener del store llegaba último:** se registraba al evaluar
`hooks/lista-paginada-store.ts`, y ese módulo viaja en el chunk de cada ruta que
lo importa. Se registraba recién cuando esa ruta se cargaba por primera vez — o
sea después del de Next, que se registra al arrancar la app.

**Por qué a veces parecía andar:** cuando quedaba una marca de una vuelta
anterior sin consumir, la vista la encontraba y restauraba. Un acierto por
arrastre. Las primeras corridas contra `main` que "funcionaron" eran justamente
eso: su traza muestra `hay=true` **antes** del `popstate` de esa vuelta.

### El arreglo

`registrarVueltaAtras()`, idempotente, llamada en el **scope del módulo** de
`components/NavHistorial.tsx` — un componente cliente del layout raíz, así que su
módulo se evalúa al arrancar la app, **antes de cualquier efecto**, incluido el de
`AppRouter`. El registro al evaluar el store se conserva como respaldo para quien
lo importe sin pasar por el layout.

Sin temporizadores, sin restaurar por el mero hecho de que exista un snapshot
—entrar por link sigue empezando limpio— y sin tocar la invalidación por firma.

⚠️ Es un arreglo del **mecanismo compartido**: lo usan `/lista/miniseries`,
`/lista/ultimos`, `/directores`, `/buscar`, `/categoria` y `/top`. Los tres tipos
de consumidor se verificaron en el navegador (abajo).

## Nivel 2: cómo se corrió

`next dev` apuntado al worktree (puerto 3098), viewport 820×900, e interceptor de
`window.fetch` instalado desde el navegador que responde `/api/upcoming` con el
formato real —`{ items, hayMas, total, page }`— sobre 60 elementos (45 series +
15 películas), 20 por página. La app no se modificó: sólo la red.

**Endpoint interceptado: `/api/upcoming` únicamente.** La ficha se dejó REAL: la
primera tarjeta usa un `tmdb_id` que existe (`tv/290193`). Antes de cada recorrido
se borraron **sólo** `yump:lista-paginada` y `yump:lista-vuelta`, y se verificó
que no hubiera marca heredada.

⚠️ Las peticiones se contaron con el log del interceptor. `performance
.getEntriesByType("resource")` **no se reinicia en las navegaciones internas de
Next**, así que no sirve para medir ficha → atrás.

## Nivel 2: resultados, antes y después del arreglo

| Escenario | Antes | Después |
|---|---|---|
| Entrada nueva por link | 1 petición ✅ | **1 petición** ✅ |
| **Volver con Series** | 🔴 Todos, 20 tarjetas, 1 petición | ✅ **Series, 40 tarjetas, scroll 1100, 0 peticiones** |
| **Volver con Todos** | 🔴 no restauraba | ✅ **Todos, 40 tarjetas, scroll 600, 0 peticiones** |
| **Volver con Películas** | 🔴 no restauraba | ✅ **Películas, 15 tarjetas, scroll 400, 0 peticiones** |
| Segunda vuelta seguida | — | ✅ **0 peticiones**, con la marca en `null` al irse |
| Clic en el filtro activo | — | ✅ **0 peticiones** |
| Primer cambio manual tras restaurar | — | ✅ **1**, `mediaType=movie&page=1` |
| "Cargar más" tras restaurar | — | ✅ **1**, `mediaType=tv&page=3` (la siguiente a la confirmada) |
| Entrada por link **con** snapshot previo | — | ✅ empieza limpio: Todos, 20, scroll 0, 1 petición |

La traza después del arreglo, mismo recorrido:

```
63628.4  marcarVuelta    MARCA        <- ahora va PRIMERO
63641.2  consumirVuelta  hay=true     <- y la vista la encuentra
63642.2  DEL vuelta                   <- la consume
63642.9  leerLista       hay=true     <- restaura
```

### Los otros consumidores del store

| Vista | Mecanismo | Resultado |
|---|---|---|
| `/lista/miniseries` | `useListaPaginada` | ✅ 40 tarjetas y scroll 1300 restaurados (datos reales) |
| `/categoria/terror` | store directo | ✅ tipo Series y scroll 900 restaurados |
| `/top` | `useEstadoSimple` | ✅ 60 tarjetas y scroll 800 restaurados |

⚠️ Queda una rareza **sólo de desarrollo**: con Strict Mode, la segunda pasada del
efecto no encuentra la marca —la consumió la primera— y llama a `olvidarLista`,
que borra el snapshot de `sessionStorage`. No rompe nada porque el estado de React
ya tiene lo restaurado y el guardado siguiente lo reescribe, y en producción no
hay doble invocación. Está anotado para que nadie lo persiga como un bug.

## Vuelta atrás

**El código y la migración se revierten por separado, y en ese orden.**

1. **Revertir el deploy web** (Vercel → promover el deployment anterior, o
   `git revert` del merge y push). Con eso la sección vuelve al comportamiento
   viejo y deja de leer `original_language`.
2. **La columna se puede dejar.** No molesta a nadie: el código viejo no la
   selecciona, es nullable y el sync viejo simplemente no la escribe. Sacarla
   sería un cambio destructivo sin beneficio.
3. Si además se revierte el sync (`supabase functions deploy` de la versión
   anterior), la columna deja de completarse y queda con los valores que ya
   tenía. Nada se rompe.

⚠️ **No revertir la migración con el código nuevo desplegado**: eso es
exactamente el 500 del paso 1.

---
