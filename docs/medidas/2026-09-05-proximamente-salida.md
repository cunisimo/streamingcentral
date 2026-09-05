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

## 1. Aplicar la migración `008`

```sql
-- supabase/migrations/008_upcoming_original_language.sql
alter table public.upcoming_content
  add column if not exists original_language text;
```

Es `if not exists`, nullable y sin default: idempotente, y en Postgres un
`add column` así es sólo metadata — no reescribe las ~250 filas ni toma un lock
largo.

**Comprobación:** la columna existe y es nullable.

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'upcoming_content'
  and column_name = 'original_language';
```

Tiene que devolver **una** fila: `original_language | text | YES`.

## 2. Confirmar que se lee con los permisos REALES de la app

⚠️ **No alcanza con el SQL editor**, que corre como owner y ve todo. La app lee
con la **anon key**, que es otro rol y tiene otros privilegios.

Y la distinción importa para no buscar el problema en el lugar equivocado: **RLS
decide FILAS, no columnas.** Lo que gobierna si un rol puede leer una columna son
los privilegios `SELECT` de tabla o de columna (`grant select on … to anon`, o
`grant select (col1, col2) …`). Si el `grant` de la tabla es por columnas
enumeradas, una columna nueva **no queda incluida automáticamente** y el rol no
la ve, aunque la policy de RLS la deje pasar entera. En ese caso el paso 1
pasaría y el paso 5 rompería igual.

Por eso la comprobación que vale es preguntarle a PostgREST con la misma clave
que usa la app, que ejercita rol, privilegios y RLS todos juntos:

```bash
curl -s -w '\nHTTP %{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/upcoming_content?select=tmdb_id,original_language&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

**Tiene que dar `200`.** Se pide el cuerpo y no sólo el código a propósito: ante un
error, **lo que dice qué pasó es el `code` y el `message` del JSON**, no el status.

| Cuerpo | Qué es | Qué hacer |
|---|---|---|
| `42703` — *undefined_column* | la columna no existe para PostgREST | el paso 1 no se aplicó; o se aplicó y **el caché de esquema de PostgREST está viejo** (ver abajo) |
| `42501` — *insufficient_privilege* | el rol no puede leer la columna | otorgar el `SELECT` (abajo) |
| otro | **no se puede clasificar de antemano** | ver abajo |

⚠️ **`42501` llega como `401` o `403` según si la petición venía autenticada**, así
que **no todo `401`/`403` es una clave mal puesta** — puede ser un privilegio que
falta.

⚠️ Y al revés: **una respuesta sin `code` de Postgres tampoco significa
"clave mal puesta"**. PostgREST tiene sus propios códigos —de esquema, de
negociación de contenido, del propio grupo de conexiones— y además puede
responder algo que ni siquiera venga de PostgREST: un proxy, el gateway de
Supabase o un corte de red. La regla es mirar las **tres cosas juntas —status,
`code` y `message`—** y no deducir la causa de una sola.
Ver <https://docs.postgrest.org/en/v14/references/errors.html>.

Si el cuerpo dice `42501`, el `grant` que falta:

```sql
-- Alcanza con el de tabla; el de columna es la alternativa más estrecha.
grant select on public.upcoming_content to anon;
-- o bien:  grant select (original_language) on public.upcoming_content to anon;
```

⚠️ **NO usar `information_schema.column_privileges` para saber si el permiso vino
por tabla o por columnas: no sirve para eso.** Esa vista refleja los privilegios de
tabla **como una fila por cada columna aplicable**, así que un `grant select on
tabla` se ve exactamente igual que un `grant` columna por columna
([docs](https://www.postgresql.org/docs/16/infoschema-column-privileges.html)). Si
hiciera falta saber de dónde viene el privilegio, eso está en los ACL crudos —
`pg_class.relacl` para la tabla y `pg_attribute.attacl` para la columna—, pero para
este paso **no hace falta**: la comprobación que decide es el `curl` de arriba, y
el remedio es el `grant`.

🟡 **Si el paso 1 salió bien y esto igual da `42703`**, puede ser el caché de
esquema de PostgREST, que no se enteró del `ALTER TABLE`:

```sql
notify pgrst, 'reload schema';
```

Y el `SELECT` completo, que es el que la app realmente manda:

```bash
curl -s -w '\nHTTP %{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/upcoming_content?select=tmdb_id,media_type,title,poster_path,backdrop_path,overview,release_date,season_number,episode_number,episode_name,is_season_premiere,genre_ids,popularity,vote_average,original_language,upcoming_content_providers(provider_id)&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

También `200`. Éste es el que importa: el otro prueba la columna suelta, y este
prueba el `select` textual del read-path, con el join anidado incluido.

## 3. Desplegar el sync

```bash
supabase functions deploy tmdb-sync
```

Lo que cambió son cuatro líneas: `original_language` en `RawTitle`
(`lib/tmdb.ts`), en `Candidate` y en los dos armados de candidato de
`jobs/sync-upcoming.ts`. **Cero llamadas nuevas a TMDB** — `discover` ya devolvía
el campo en cada resultado y el sync lo estaba descartando.

**Comprobación:** la función responde y quedó en una versión nueva.

```bash
supabase functions list | grep tmdb-sync
```

## 4. Sincronizar y medir cuántas filas quedaron completas

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/tmdb-sync" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"job":"syncUpcoming"}'
```

**La medición, que es el punto del paso:**

```sql
select
  count(*)                                          as filas,
  count(original_language)                          as con_idioma,
  count(*) - count(original_language)               as nulas,
  round(100.0 * count(original_language) / count(*), 1) as pct_completo
from public.upcoming_content
where release_date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date;
```

**Esperado: `nulas = 0`.** `syncUpcoming` hace `upsert` con
`onConflict: 'tmdb_id,media_type'` de la fila **entera** —no de un subconjunto de
columnas— para todos los candidatos que descubre, así que toda fila vigente se
reescribe con el idioma puesto. Por eso no hace falta un backfill.

Y el desglose, para ver que el dato tiene sentido y no es basura:

```sql
select original_language, count(*)
from public.upcoming_content
where release_date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
group by 1 order by 2 desc;
```

Medido el 2026-09-04 sobre 238 filas: `en` 119, **`ja` 81**, `ko` 10, `es` 7,
`zh` 5, `pt` 5, `fr` 4, y uno cada uno de `sv th pl tr ru it de`. Si `ja`
apareciera en 0, la clasificación de anime quedaría sólo con Crunchyroll.

🟡 **Si quedan nulas**, NO es bloqueante para seguir: son filas que el
descubrimiento no volvió a ver y que la reconciliación va a borrar a los
`GRACE_DAYS` (2). Mientras estén, cuentan como anime sólo si están en
Crunchyroll — 83% de recall en vez de 100%. Anotar cuántas y seguir.

## 5. Desplegar la web

Merge de `fix/proximamente-rediseno` a `main` y push. Vercel construye solo.

**Comprobación:** el deploy quedó READY y sirve el commit esperado.

```bash
curl -sI https://app.yump.ar/ | head -1
```

⚠️ Si Vercel no detecta el push —ya pasó tres veces en este proyecto— se
destraba con un commit vacío, **no** con Redeploy.

## 6. Probar los tres filtros y cinco cargas sucesivas

Contra Producción, sólo lectura. Cada llamada tiene que dar `200`.

```bash
for q in "" "&mediaType=movie" "&mediaType=tv"; do
  printf '%s -> ' "${q:-todos}"
  curl -s "https://app.yump.ar/api/upcoming?page=1$q" \
    | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
      console.log(`items=${j.items?.length} hayMas=${j.hayMas} total=${j.total} page=${j.page}`)'
done
```

Esperado, con la agenda del 2026-09-05: Todos `total=96` (5 páginas), Series
`total=95` (5 páginas), Películas `total=1` (1 página, `hayMas=false`).

**Las cinco cargas, verificando que no haya huecos ni repetidos:**

```bash
node -e '
const B = "https://app.yump.ar/api/upcoming";
let vistos = [], p = 1, hayMas = true;
while (hayMas && p <= 6) {
  const j = await (await fetch(`${B}?page=${p}`)).json();
  vistos.push(...j.items.map(i => `${i.type}:${i.id}`));
  console.log(`pagina ${p}: ${j.items.length} items, hayMas=${j.hayMas}, total=${j.total}`);
  hayMas = j.hayMas; p++;
}
const u = new Set(vistos);
console.log(`servidos ${vistos.length} | unicos ${u.size} | ${vistos.length === u.size ? "SIN REPETIDOS" : "🔴 HAY REPETIDOS"}`);
' --input-type=module
```

**Y en el navegador, que es lo que los curls no cubren:**

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

## 7. Confirmar que Home y `/proximamente` no devuelven 500

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
