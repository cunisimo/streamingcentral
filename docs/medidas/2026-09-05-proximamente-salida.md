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
| **1. Tests del modelo** | la DECISIÓN de pedir o no pedir, bajo un orden de efectos fiel | ✅ 962 pasan |
| **2. Navegador real con respuestas interceptadas** | el comportamiento de la interfaz: cuántas peticiones, qué se muestra, qué se restaura | 🟡 **parcial — con un fallo abierto** |
| **3. Integración real con Supabase** | que el read-path lea de verdad, con la columna y los datos reales | ⏳ **pendiente**: necesita la migración `008` |

⚠️ El nivel 2 usa datos inventados servidos desde el navegador. **No prueba nada
de Supabase ni de producción**, y no reemplaza al nivel 3.

### Nivel 2: cómo se corrió

`next dev` apuntado al worktree (puerto 3098), viewport 820×900, y un
interceptor de `window.fetch` instalado **desde el navegador** que responde
`/api/upcoming` con el formato real de la API —`{ items, hayMas, total, page }`—
sobre un dataset de 60 elementos (45 series + 15 películas), 20 por página. La
app no se modificó: sólo la red.

**Endpoints interceptados: `/api/upcoming` únicamente** (todas sus variantes:
`page`, `mediaType`, `mix`). La ficha se dejó REAL: la primera tarjeta usa un
`tmdb_id` que existe (`tv/290193`), así que `/titulo/tv/290193` y su
`/api/title/...` fueron a la API de verdad. En un intento anterior se interceptó
también `/api/title/` devolviendo `{}` y eso **rompió `DetailView`** (`Cannot read
properties of undefined (reading 'filter')`) dejando la página en blanco: esa
corrida se descartó por contaminada.

Para entrar se navegó por SPA desde el Home —"Reintentar" del riel → "Ver
todas"— para que el interceptor siguiera vivo al montar la vista.

⚠️ **Las peticiones se contaron con el log del propio interceptor, no con
`performance.getEntriesByType("resource")`.** Esa API **no se reinicia en las
navegaciones internas de Next**: sólo se limpia en una carga de documento, así
que para medir ficha → atrás habría acumulado las de antes. Sirve para una
entrada con recarga completa y nada más; para todo lo demás hace falta un
registro propio, o una marca previa que delimite cada escenario.

### Nivel 2: lo que salió bien

| Escenario | Esperado | Medido |
|---|---|---|
| Entrada nueva por SPA | 1 petición | ✅ **1** — `/api/upcoming?page=1` |
| Tocar Series | 1 petición | ✅ **1** — `mediaType=tv&page=1`, 20 tarjetas |
| "Cargar más" | 1 petición | ✅ **1** — `mediaType=tv&page=2`, 40 tarjetas |
| Scroll efectivo | documento > viewport | ✅ 3927 px contra 900 |
| Guardado del snapshot | página, items, filtro, scroll | ✅ `{pagina:2, items:40, filtro:"tv", scrollY:1000}` en `sessionStorage` |
| Strict Mode duplica el arranque | no | ✅ no (activo: `StrictModeIfEnabled = true ? React.StrictMode : 0`) |

### 🔴 Nivel 2: el fallo abierto

**Al volver de la ficha con Atrás, la vista NO restaura.** Medido, con el
snapshot correcto en `sessionStorage`:

| | Antes de la ficha | Después de volver |
|---|---|---|
| Filtro | Series | **Todos** |
| Tarjetas | 40 | **20** |
| Página confirmada | 2 | **1** |
| Peticiones a `/api/upcoming` | — | **1** (debía ser 0) |

La traza instrumentada dice por qué:

```
55045  consumirVuelta? hay=false   @/proximamente
55047  consumirVuelta? hay=false   @/proximamente   (2ª pasada de Strict Mode)
55049  popstate                    @/proximamente
55050  FETCH /api/upcoming?page=1
```

**El componente monta y consulta la marca de vuelta ~4 ms ANTES de que el
`popstate` la escriba.** El listener del store la escribe en `popstate`, pero
para entonces `useListaPaginada` ya decidió "entrada limpia" — y con
`volvio:false`, `decidirRestauracion` además **borra el snapshot**
(`olvidarLista`), así que la vuelta siguiente tampoco tiene qué restaurar.

Eso contradice el supuesto escrito en `lista-paginada-store.ts`: *"al apretar
atrás el orden es popstate → render de la ruta anterior → montaje de la vista"*.
En esta medición el montaje llegó primero.

**Qué NO está establecido todavía**, y no hay que darlo por sabido:

* **Si lo introdujo este cambio.** La implementación anterior de `/proximamente`
  usaba `useEstadoSimple`, que consume la MISMA marca en un efecto de montaje, así
  que la carrera es estructuralmente la misma. En una corrida contra `main` la
  restauración **sí** funcionó (filtro Series, 96 tarjetas, scroll 1200), pero su
  traza muestra `consumirVuelta hay=true` **antes** del `popstate`, o sea que
  encontró una marca **dejada por una vuelta anterior**, no por ésta. Es un
  acierto por arrastre, no una prueba de que `main` no tenga la carrera.
* **De qué depende el orden.** La hipótesis a medir es si el montaje es síncrono
  cuando la ruta ya está en el caché del router de Next y asíncrono cuando hay que
  pedir el RSC — lo que haría que la carrera dependa del caché y no del código de
  la vista.

Hasta resolverlo, **la restauración de `/proximamente` no está verificada y el
requisito no se cumple**. Los escenarios que dependen de ella —el primer clic
manual después de restaurar y el clic sobre el filtro ya activo— quedan sin
medir, porque no hay restauración de la cual partir.

⚠️ Esto NO se arregla tocando `lista-paginada-store` a las apuradas: lo comparten
`/lista/miniseries`, `/lista/ultimos`, `/directores`, `/buscar`, `/categoria` y
`/top`. Corresponde diagnosticarlo con el orden de eventos medido antes de
proponer nada.

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
