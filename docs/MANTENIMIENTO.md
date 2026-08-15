# Mantenimiento — chips curados y ruleta

Todo lo que sigue corre **offline, desde la raíz del repo**, y termina
pegando SQL a mano en el editor de Supabase. Nada de esto toca la app.

Requisitos: `.env.local` con `TMDB_READ_TOKEN`, y `claude` logueado con la
suscripción (`claude` → `/status` tiene que mostrar el plan, no una API key).

---

## Cadencias

| Cada cuánto | Qué |
|---|---|
| Mensual | Disponibilidad de la ruleta (§2) |
| Trimestral | Títulos nuevos en la ruleta (§3) |
| Octubre | Chip Mágica navidad, antes de la temporada (§4) |
| Después de cada corrida | Diff del mapa de plataformas (§5) |

---

## 1. Reglas que valen para todo

**Los scripts son reanudables.** Si una corrida se corta —error, se acaba la
cuota, cerrás la terminal— volvés a correr **el mismo comando** y retoma
donde quedó. No repite lo hecho ni lo cobra de nuevo.

**Generar no es cargar.** `generate-copy.mjs` escribe en `data/`, no en
Supabase. La carga es un paso aparte y explícito. Es el error más fácil de
cometer: ver la generación terminar y creer que ya está en la base.

**`--max-turns 4` es necesario.** Con 1 los lotes fallan intermitentemente
con `terminal_reason=max_turns`. Ya está puesto en los scripts; no lo bajes.

**El costo sale de la cuota del plan Max, no de la API.** El
`total_cost_usd` que informan los scripts es sólo una referencia. Medí el
porcentaje de sesión antes y después si vas a hacer una tanda grande, y
acordate de que Claude Code para programar come del mismo pozo.

---

## 2. Refrescar disponibilidad (mensual)

Las plataformas rotan catálogo. Sin esto, la app recomienda películas que ya
no están.

```bash
node --env-file=.env.local scripts/build-roulette-pool.mjs --min-nota 6.0 --pages 8
node scripts/build-roulette-sql.mjs
```

Pegá en Supabase `data/carga-ruleta-1.sql` … `-N.sql`, **en orden**.

El upsert usa `coalesce` en `razon`, `advertencia` y `atencion`: recargar el
pool **no borra** los textos ya escritos.

Verificación:

```sql
select count(*) as total, count(razon) as con_texto,
       count(*) filter (where advertencia is not null) as con_pero
from roulette_titles;
```

---

## 3. Sumar títulos nuevos a la ruleta (trimestral)

Cuatro comandos, en este orden. **Ninguno se puede saltear**: si generás
textos pero no clasificás contexto, las secuelas nuevas entran a la ruleta
con `requiere_contexto = false` y se sirven mal.

```bash
# 1. Traer lo que se estrenó o llegó a alguna plataforma
node --env-file=.env.local scripts/build-roulette-pool.mjs --min-nota 6.0 --pages 8

# 2. Escribir razón, advertencia y atención para los nuevos
node scripts/generate-copy.mjs --todos

# 3. Detectar cuáles son secuelas
node --env-file=.env.local scripts/enrich-roulette-collections.mjs

# 4. Decidir cuáles piden haber visto las anteriores
node scripts/classify-context.mjs

# 5. Armar el SQL
node scripts/build-roulette-sql.mjs
```

El paso 2 es el caro. Si querés medir la cuota, hacelo por tramos con
`--por-decada 160`, `210`, `260`… antes de cerrar con `--todos`.

### Carga en Supabase

1. `data/carga-ruleta-1.sql` … `-N.sql`, en orden
2. `data/carga-contexto.sql` **al final** — marca todo en `false` antes de
   aplicar su lista, así que si va antes, los títulos nuevos quedan sin marcar

### ⚠ El paso que se olvida siempre

`classify-context.mjs` **reescribe** `data/carga-contexto.sql` y se lleva
puestas las excepciones manuales. Antes de pegarlo, agregá esto arriba del
`commit;`:

```sql
-- Excepciones a mano: el clasificador lee la saga Harry Potter como
-- episódica, y usa orden cronológico para Star Wars en vez de estreno.
update roulette_titles set requiere_contexto = true
where title in (
  'Harry Potter y la cámara secreta',
  'Harry Potter y el prisionero de Azkaban',
  'Harry Potter y el cáliz de fuego',
  'Harry Potter y la Orden del Fénix',
  'Harry Potter y el misterio del príncipe',
  'La guerra de las galaxias. Episodio I: La amenaza fantasma'
);
```

Verificación (el número tiene que **subir** respecto de la corrida anterior):

```sql
select count(*) filter (where requiere_contexto) from roulette_titles;
```

Y que los tres escenarios tengan catálogo:

```bash
node scripts/preview-escenarios.mjs --corte 90
```

### Si falta cine corto

El escenario `corta` (≤ 90 min) es el que primero se queda sin catálogo,
porque el piso de votos del pool principal sesga hacia películas largas.

```bash
node --env-file=.env.local scripts/build-shorts-pool.mjs
```

Trae películas de 60 a 100 minutos con piso de 50 votos y las **suma** al
pool (hace backup en `data/pool-ruleta.backup.json`). Después hay que correr
igual los pasos 2 a 5.

---

## 4. Actualizar un chip curado

Hoy sólo está curado `magica-navidad`. Correr en octubre, antes de la
temporada.

```bash
node --env-file=.env.local scripts/extract-pool-navidad.mjs
node scripts/inspect-pool.mjs
node scripts/prefilter.mjs --chip magica-navidad
node scripts/classify.mjs --chip magica-navidad
node --env-file=.env.local scripts/enrich-collections.mjs --chip magica-navidad
node scripts/select.mjs --chip magica-navidad
node --env-file=.env.local scripts/availability.mjs --chip magica-navidad
node scripts/build-sql.mjs --chip magica-navidad
node scripts/build-blocklist-sql.mjs --chip magica-navidad
```

Pegar en Supabase `data/carga-magica-navidad.sql` y después
`data/blocklist-magica-navidad.sql`.

`inspect-pool` chequea 12 títulos canónicos. Si faltan más de dos, las
keywords no cubrieron bien y hay que revisar `chips/magica-navidad.json`
antes de seguir.

El upsert **no pisa** el campo `revisado`: el trabajo de revisión humana
sobrevive a las recargas.

### Para agregar otro chip

Copiar `chips/magica-navidad.json` y `chips/magica-navidad.criterio.md` con
el slug nuevo, cambiar keywords y criterio editorial, y correr los mismos
scripts con `--chip <slug>`. No hace falta tocar código.

La excepción es la extracción: `extract-pool-navidad.mjs` tiene las keywords
hardcodeadas y habría que parametrizarla.

---

## 5. Diff del mapa de plataformas

**Después de cualquier corrida que agrande el pool.** El mapa de la app
(`lib/providers-ar.ts` y el mapa que armó Claude Code) se hizo contra una
lista fija de nombres. Si aparece un proveedor nuevo, queda invisible: la
ruleta anda, muestra menos títulos, y nadie se entera.

```sql
select distinct unnest(providers) as proveedor
from title_availability where region = 'AR' order by 1;
```

Comparar esa lista contra el mapa. El guard en runtime detecta códigos sin
mapear, pero **no** detecta un nombre mal escrito — la app no conoce la
lista de la base. Este diff es manual y no hay forma de automatizarlo del
lado de la app.

Referencia: `MovistarTV` es el proveedor más grande del pool. Si ese nombre
no matchea, se pierde un tercio del catálogo sin ningún error.

---

## 5.b Qué es realmente `upcoming_content`

Antes de tocar esa tabla, o de sacar conclusiones de lo que hay adentro:

> **`upcoming_content` no es "la agenda de estrenos". Es lo que estaba en el top
> 60 de popularidad el día en que se escribió cada fila.**

Eso no se deduce del esquema, y explica cosas que si no parecen bugs sueltos:

- Las filas son **sedimento de días distintos**, no una foto coherente. Dos filas
  vecinas pueden tener `updated_at` con una semana de diferencia.
- Un título puede **desaparecer y volver** sin que nadie lo toque, porque el
  ranking de popularidad de TMDB fluctúa a diario.
- Un título que nunca fue lo bastante popular **no entra nunca**, aunque estrene
  en una plataforma soportada y dentro de la ventana.
- Una fila que dejó de refrescarse no queda solo vencida: queda **equivocada**.
  En series, `next_episode_to_air` se mueve cada semana, así que una fila vieja
  anuncia un episodio que ya pasó y esconde el que viene.

El motivo es `collectSeries`: `discover/tv` ordenado por `popularity.desc` con
`MAX_PAGES = 3`. Medido el 2026-08-15, eran **60 series de 1696 elegibles**.

Las dos consecuencias están separadas a propósito en `docs/ISSUES.md` — #7
(frescura) y #8 (cobertura) — porque el arreglo de la primera no toca la segunda,
y si van juntas se implementa el refresco y se da el tema por cerrado.

La lectura ya no muestra lo vencido (`upcomingList` filtra por fecha del día
argentino), así que el síntoma no se ve en la app; el dato de la tabla sigue
siendo el que es.

## 6. Revisión de calidad (opcional, gratis)

```bash
node scripts/check-vocabulario.mjs
```

Busca vocabulario de España en los textos generados. El pool se extrae con
`language=es-ES`, así que el prompt recibe títulos traducidos en España y el
modelo a veces lo arrastra. En la última corrida fueron 2 de 765: si son
pocos, se editan a mano en `data/copy-ruleta.json`.

```bash
node scripts/review.mjs --chip magica-navidad --solo revisar
```

Lista los títulos del chip con confianza media o baja. Es el trabajo humano
pendiente y lo único que separa esto de un filtro automático.

---

## 7. Dónde se cambia cada cosa

| Qué querés cambiar | Archivo |
|---|---|
| Criterio editorial de un chip | `chips/<slug>.criterio.md` |
| Keywords, géneros excluidos, piso de votos de un chip | `chips/<slug>.json` |
| Voz y reglas de los textos de la ruleta | `prompts/ruleta-copy.md` |
| Corte de duración de los escenarios | función `get_roulette_picks` en Supabase **y** `supabase/migrations/002_roulette.sql` |
| Frases de la etiqueta de atención | `components/ruleta/frases.ts` |

Editar el `.sql` de migración **no cambia nada**: la base tiene su propia
copia. Hay que pegar la función entera (de `create or replace` hasta `$$;`)
en el SQL Editor.

⚠ `frases.ts` usa `fondo` como **nivel de atención**, no como escenario. El
escenario `fondo` se eliminó; el nivel sigue existiendo. Un buscar-y-
reemplazar de esa palabra rompe el banco de frases.

---

## 8. Errores conocidos y qué significan

| Síntoma | Causa | Solución |
|---|---|---|
| `terminal_reason=max_turns` | `--max-turns` muy bajo | Ya está en 4; si vuelve, subilo |
| `claude falló: ?` sin detalle | Sesión OAuth vencida | `claude` → `/login` |
| Lotes fallando en cadena | Se acabó la cuota de sesión | Esperar y correr el mismo comando |
| `column ... does not exist` | Falta un `alter table` que está fuera del `begin;` | Pegar el archivo SQL **entero**, no desde `begin;` |
| El conteo en Supabase no cambió | Se pegó una pestaña vieja de VS Code | Cerrar y reabrir el archivo |
| `requiere_contexto` no subió | Falta pegar `carga-contexto.sql` | §3 |
| Escenario devuelve todo sin filtrar | Se llamó con un escenario inexistente | Sólo valen `corta`, `larga`, `chicos` |

---

## 9. Estado actual (11/08/2026)

**Ruleta** — `roulette_titles`: 2401 filas, 2259 con texto, 1782 con
advertencia, 144 con `requiere_contexto`. Piso de 51 votos.
Escenarios: `corta` (≤ 90 min), `larga` (> 90), `chicos`.

**Chip Mágica navidad** — `chip_titles`: 122 curados, 75 disponibles en AR.
`chip_blocklist`: 95 exclusiones. 48 títulos con confianza media o baja sin
revisión humana.

**Pendientes conocidos**

- El pipeline del chip aplica el tope por saga *antes* de conocer la
  disponibilidad. El orden correcto sería calidad → disponibilidad → tope.
  Cuesta entre 5 y 10 títulos.
- La ruleta es sólo películas. Las series serían la mejora natural del
  escenario `corta`, pero necesitan criterio propio (¿la serie entera o la
  primera temporada?).
- `extract-pool-navidad.mjs` no está parametrizado por chip.
