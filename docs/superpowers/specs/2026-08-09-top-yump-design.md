# Top Yump — diseño

Fecha: 2026-08-09
Estado: aprobado, listo para plan de implementación

## Qué es

Una sección nueva, con acceso propio en el nav inferior, que muestra el top 10
de cada plataforma en Argentina, separado en películas y series.

Netflix se muestra con **consumo real** (dato oficial de Netflix). Las otras
cinco plataformas se muestran con **popularidad de TMDB**, etiquetada como tal.
La sección está diseñada para que, cuando Yump tenga señal propia de clics,
la fuente de esas cinco se reemplace sin cambiar la estructura.

## Por qué así

### Netflix es la única plataforma con dato público real

Verificado el 2026-08-09:

- `https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv` responde
  200 sin autenticación, 31 MB, `text/tab-separated-values`.
- Cubre Argentina desde `2021-07-04`: 266 semanas, 2660 filas `Films` + 2660
  `TV`. Diez posiciones por categoría y semana.
- Columnas: `country_name, country_iso2, week, category, weekly_rank,
  show_title, season_title, cumulative_weeks_in_top_10`.
- Se actualiza los martes con la semana cerrada el domingo anterior.

Disney+, Prime Video, Max, Paramount+ y Apple TV+ **no publican nada**. Tienen
un riel "Top 10" dentro de la app y no lo exponen. Nielsen publica ranking de
streaming solo para Estados Unidos.

Las dos fuentes de terceros que agregan el dato de todas son de pago:
FlixPatrol (scrapea el riel in-app de cada plataforma, API v2 con Basic Auth) y
JustWatch (acuerdo comercial).

### JustWatch no tiene el dato de las plataformas — lo fabrica

Su metodología pública: actividad de sus usuarios en las últimas 24 h / 7 d /
30 d — clic en una oferta de streaming, agregar a una lista, marcar como visto.
Sobre 60 millones de usuarios mensuales, 140 países, actualizado a diario. Y su
chart es **uno solo, unificado**; el "Top 10 en Netflix" de JustWatch es ese
ranking filtrado por proveedor.

O sea: JustWatch es la misma categoría de cosa que la popularidad de TMDB, con
mejor señal (intención de compra, con peso por país) pero sin medir consumo.

Yump ya registra dos de los tres eventos de esa receta: agregar a lista
(`setItem` en `lib/userdata.ts`) y marcar como visto (`recordView`). Falta el
tercero, el clic en "Ver en" de `DetailView.tsx`, que hoy es un `<a
target="_blank">` sin registro. Instrumentarlo es el camino para que las cinco
plataformas restantes pasen de popularidad a señal propia. **Queda fuera de
este spec**, pero es la razón por la que el campo `source` existe en el modelo.

## Alcance

### Plataformas incluidas

Catálogo medido el 2026-08-09 (`discover`, `watch_region=AR`, `flatrate`):

| Plataforma | Pelis | Series | Entra |
|---|---|---|---|
| Netflix | 4769 | 3369 | sí — dato real |
| Prime Video | 6396 | 1566 | sí |
| Max | 2115 | 1760 | sí |
| Disney+ | 2164 | 1149 | sí |
| Apple TV+ | 104 | 217 | sí — ver prerrequisito |
| Crunchyroll | 212 | 1713 | sí |
| Paramount+ | 351 | 321 | no en v1 |
| MovistarTV | 6965 | 994 | no — cifra sospechosa, sin auditar |
| Claro video | 1702 | 176 | no |
| MUBI | 598 | 5 | no — curaduría rotativa, un top 10 la contradice |
| OnDemandKorea | 35 | 505 | no |
| Universal+ | 299 | 146 | no |
| ViX | 79 | 203 | no |
| DIRECTV GO | 31 | 15 | no — 46 títulos totales |
| Star+ | 0 | 0 | no — fusionada con Disney+ en 2024 |

Seis plataformas en v1. Cubren seis mundos distintos: masivo, catálogo ancho,
HBO, familiar, prestigio y anime. Las descartadas no dan para diez posiciones
sin que el riel se vea vacío al lado del de Netflix.

### Prerrequisito: el id 2 de Apple TV+

`lib/providers-ar.ts` mapea Apple TV+ a `[350, 2, 2243]`. El id **2 es "Apple
TV", la tienda de alquiler y compra**, y TMDB lo devuelve bajo `flatrate` en AR:

| id | qué es | pelis | series |
|---|---|---|---|
| 350 | Apple TV+ (suscripción) | 104 | 217 |
| 2 | Apple TV — tienda | 5068 | 0 |
| 2243 | Apple TV+ Amazon Channel | 98 | 214 |

Es la misma inconsistencia de TMDB ya documentada para Pluto TV. Sin sacar el
id 2, el top de Apple TV+ por popularidad sería casi todo cine de alquiler.

**Sacar el id 2 es prerrequisito del bloque de Apple TV+.** Es un arreglo de una
línea que además corrige un bug existente en toda la app: hoy quien elige Apple
TV+ en "mis plataformas" ve 5068 películas de alquiler como si estuvieran
incluidas en la suscripción.

Star+ (`sp`, id 619) da 0 en todo y puede sacarse del selector en el mismo
cambio. No bloquea nada.

### Fuera de alcance

- Historial de semanas anteriores. El dato queda guardado en la tabla desde el
  día uno, pero no se expone en v1.
- Editor en `/admin` para los títulos marcados `needs_review`. Se corrigen con
  un `update` en Supabase.
- Instrumentar el clic de "Ver en" para construir señal propia.
- Paramount+ como séptima plataforma.
- Auditar MovistarTV.

## Modelo de datos

```sql
create table netflix_top10 (
  week date not null,
  category text not null check (category in ('movie','tv')),
  rank int not null check (rank between 1 and 10),
  raw_title text not null,        -- el título tal cual viene del TSV
  tmdb_id int,                    -- null si no se pudo resolver
  needs_review boolean not null default false,
  primary key (week, category, rank)
);
create index netflix_top10_raw_title_idx on netflix_top10 (raw_title);
```

RLS: `select` público para `anon`, escritura solo con service role.

La tabla cumple dos funciones: es el ranking y es el mapa de títulos. Antes de
buscar en TMDB, el cron consulta si ese `raw_title` ya se resolvió en alguna
semana anterior **para la misma `category`** (un mismo título puede existir como
película y como serie, y no son el mismo id). Como los títulos permanecen varias
semanas en el top, en régimen son 2-4 búsquedas nuevas por semana, no 20.

Consecuencia deseada: una corrección manual sobre un `tmdb_id` queda fija para
las semanas siguientes.

## Ingesta

`GET /api/cron/netflix-top10`, disparado por Vercel Cron los martes 09:00 AR:

```json
{ "crons": [{ "path": "/api/cron/netflix-top10", "schedule": "0 12 * * 2" }] }
```

Protegido con `CRON_SECRET` (Vercel manda `Authorization: Bearer $CRON_SECRET`).

El TSV está ordenado por país ascendente y semana descendente, así que
**Argentina de la última semana son las primeras 20 filas de datos**. El handler
lee el stream y lo corta en la línea 21; no baja los 31 MB. Debe validar que las
filas leídas sean efectivamente `AR` y de una sola semana, y abortar sin
escribir si el orden del archivo cambia.

La operación es un upsert por `(week, category, rank)`. Para no pisar
correcciones manuales, la regla de conflicto es explícita: si la fila ya existe
y su `raw_title` es el mismo, **no se toca** (`do nothing`); solo se
sobrescriben `tmdb_id` y `needs_review` cuando el `raw_title` cambió. Correr el
cron dos veces seguidas no produce ningún cambio.

### Resolución de título a TMDB

El TSV trae solo el título en inglés, sin id ni año. El método validado:
`search/{movie|tv}` con `language=en-US` acotado por la categoría, y desempate
por "¿TMDB lo lista en Netflix AR?" (`provider_id` 8 en `watch/providers`).

Medido contra las 20 filas de la semana `2026-08-02`: **19 de 20 resueltos**.

Los dos casos límite observados, que definen las reglas:

- *Fear* (película, puesto 9) matcheó `State of Fear` (id 1426964): está en
  Netflix AR pero **no se llama igual**. Título no exacto → `needs_review`.
- *My Daughter's Father* (serie, puesto 1) matcheó exacto (id 329394) pero TMDB
  todavía no le cargó el provider. Título exacto → se acepta aunque no aparezca
  en Netflix AR; es lag de TMDB en un estreno reciente.

Reglas, en orden:

1. Título normalizado exacto **y** figura en Netflix AR → se acepta.
2. Título normalizado exacto, no figura en Netflix AR → se acepta,
   `needs_review = false`.
3. Título no exacto, figura en Netflix AR → se acepta con `needs_review = true`.
4. Ningún candidato → `tmdb_id` null, `needs_review = true`.

Normalizar: minúsculas, sin acentos, sin puntuación, espacios colapsados.

## Lectura

`GET /api/top?tipo=movie|tv&providers=n,d,m` devuelve:

```ts
{ mine: Block[], others: Block[] }
// Block = { platform: PlatformCode, source: "netflix" | "popular",
//           week?: string, items: UITitle[] }
```

- Bloque de Netflix: los diez `tmdb_id` de la semana más reciente de la tabla
  (`max(week)`, resuelto en una sola consulta), hidratados con la misma función
  de `lib/enrich.ts` que usa `/api/cards`.
- Los otros cinco: `discover` con `sort_by=popularity.desc`, `watch_region=AR`,
  `flatrate` y el `with_watch_providers` de la plataforma. Cacheado 24 h en
  Redis.
- `mine` son las plataformas del usuario en el orden de `PLATFORMS`; `others`,
  el resto de las seis.

Las seis plataformas se piden con **tope de concurrencia**, no en paralelo
abierto. El Home ya llegó a ~400 requests simultáneos a TMDB por no ponerlo.

En el Top **no** corren los filtros de animación ni de familia de
`lib/audience.ts`. Es un ranking, no un riel curado: si *Kung Fu Panda 4* está
cuarto, va cuarto.

El dedup del Home tampoco aplica. Un título puede estar en el Home y en el Top
a la vez; esconderlo daría un ranking falso.

## UX

### Nav inferior

Quinto ítem, entre Inicio y Buscador. Etiqueta **"Top"**, ícono de podio.

No hace falta tocar `.bottomnav`: `.navitem` usa `flex:1` y reparte solo. La
etiqueta es corta a propósito — a 12px, en cinco columnas y en un viewport de
320px, cada celda queda en 64px.

### Página `/top`

```
Top Yump                                    .section-title
Lo que más se está viendo en Argentina.     .section-sub
        [ Películas  |  Series ]            ShelfTypeToggle, sticky

TUS PLATAFORMAS                             .chip-group-label

  [logo] Netflix                       ⓘ
  Lo más visto esta semana · dato oficial
  ┌────┐ ┌────┐ ┌────┐ …                    .track, cards de 158px
  │ 1  │ │ 2  │ │ 3  │
  └────┘ └────┘ └────┘

  [logo] Max
  Lo más popular ahora
  …

EN OTRAS PLATAFORMAS
  …
```

Componente `TopView.tsx`. Un solo fetch a `/api/top`; los bloques se renderizan
con `.shelf` y `.track`, reusando las clases existentes.

**Toggle global, uno solo para toda la página.** Se reusa `ShelfTypeToggle`
(presentacional puro) y `useShelfType` para persistir la preferencia. A
diferencia del Home, acá no va uno por riel: los bloques son la misma pregunta
repetida por plataforma, y seis toggles independientes permiten estados
incoherentes (Netflix en películas, Max en series) que rompen la lectura de "el
top de ahora".

**Distinción de fuente, explícita.** Netflix lleva el subtítulo "Lo más visto
esta semana · dato oficial"; las otras cinco, "Lo más popular ahora". El `ⓘ` del
bloque de Netflix abre una nota corta: de dónde sale el dato, que corresponde a
la semana cerrada el domingo, y que en las demás plataformas es popularidad y no
consumo medido.

Decidido así porque el diferencial declarado de Yump es criterio editorial y
confianza. Poner "Top 10" sobre popularidad de TMDB es detectable por el usuario
en cuanto ve un título liderando algo que no lidera. Además deja el camino
limpio: cuando la señal propia reemplace a TMDB, el subtítulo pasa a "Lo más
visto por los usuarios de Yump" sin haber mentido antes.

### Número de ranking

Nueva clase `.rank-num`: dentro del póster, abajo a la izquierda, tipografía
`--display` a 46px, peso 800, `line-height: .8`, blanco sobre el degradado que
`.poster::after` ya dibuja ahí. Los tres primeros en `--accent`.

No choca con nada: `.ed-flag` va arriba a la izquierda y `.quick-add` arriba a
la derecha. Cuando el título no tiene póster, `.ptitle` ocupa ese mismo rincón y
necesita corrimiento.

Se descartó el número gigante al costado estilo Netflix: obliga a ensanchar cada
ítem de 158px a ~230px, y el riel dejaría de calzar con todos los demás de la
app.

Implementación: prop opcional `rank?: number` en `TitleCard`, no un componente
nuevo. Evita duplicar el markup de la card.

## Estados

- **Sin datos de Netflix** (el cron nunca corrió o falló): el bloque no
  desaparece, cae a popularidad como los otros cinco, con el subtítulo "Lo más
  popular ahora". Nunca se muestra un bloque roto ni un hueco.
- **Título sin resolver** (`tmdb_id` null): la posición se ocupa igual con una
  card neutra que muestra el número y el título crudo, sin link. Un top 9 se lee
  como un bug; un slot sin póster se lee como "todavía no tenemos la ficha".
- **Offline**: `useApi` ya expone `offline`; se conecta `OfflineState` como en
  `CategoryView`.
- **Toggle en Series**: no se oculta ninguna plataforma. A Apple TV+ le sobran
  217 series y a Crunchyroll 212 películas.
- **Bloque con menos de 10 ítems**: se muestra lo que haya.

## Verificación

- `npx tsc --noEmit`.
- `npx next build` — es el que caza el arrastre de clientes server-only al
  bundle del navegador, que `tsc` no ve.
- Correr el cron a mano una vez y confirmar 20 filas en `netflix_top10`.
- Correrlo dos veces seguidas y confirmar que no duplica.
- Vaciar la tabla y confirmar que el bloque de Netflix cae a popularidad.
- Con el toggle en Series, confirmar que las seis plataformas siguen visibles.
