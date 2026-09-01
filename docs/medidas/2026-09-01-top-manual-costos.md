# Top semanal manual: costo antes y después — 2026-09-01

Medición de la rama `feat/top-manual`. **La migración 007 no se ejecutó en
ningún entorno**, así que el "después" del cutover se deriva del código, no de
una corrida. Está marcado dónde es medición y dónde es derivación.

## Las tres etapas que hay que distinguir

| | Fuente del ranking | Estado |
|---|---|---|
| **Antes** | Netflix oficial + popularidad TMDB | lo que hay en Producción hoy |
| **Preparación** | igual que antes, **más el gate de cutover** | lo que corre apenas se mergee |
| **Después del cutover** | doce bloques manuales | cuando estén los doce publicados |

## Supabase

Consultas por cada `GET /api/top?tipo=…`:

| | Antes | Preparación | Después |
|---|---|---|---|
| `latestWeekRows` (Netflix) | **2** | 2 | 0 |
| `ultimasPublicaciones` (gate) | 0 | **≤1** | **≤1** |
| **Total por request** | **2** | **≤3** | **≤1** |

⚠️ **El `≤1` es por el cache que se agregó al medir.** `/api/top` es
`force-dynamic`, así que la consulta de publicaciones corría en cada pedido y
durante la preparación habría llevado de 2 a 3 consultas por request. Con
`TTL_PUBLICACIONES = 60` el techo son **60 por hora**, haya el tráfico que
haya. El precio es que un bloque recién publicado tarda hasta un minuto en
aparecer — aceptable para algo que se publica una vez por semana.

**Evidencia de disponibilidad** (`disp:top-manual`, TTL 5 min): techo de **12
consultas por hora**, el mismo criterio y el mismo número que la evidencia del
top oficial de Netflix.

**Escrituras**: sólo las del dashboard, cuando el dueño edita. Publicar los doce
bloques son 12 `UPDATE` de una fila. Nada periódico.

**Crecimiento de tabla**: una fila de `top_rankings` + diez de
`top_ranking_entries` por bloque publicado. Publicando los doce cada jueves son
**12 + 120 filas por semana**, ~6.900 filas al año. Es historial y se conserva a
propósito; a ese ritmo la tabla es irrelevante para el plan.

## TMDB

Llamadas por `/api/top?tipo=…` **en frío** (derivado del código):

| | Antes | Después |
|---|---|---|
| `discover` de los bloques por popularidad | 5 | **0** |
| Enriquecido de títulos | ~110 (5 × 20 + 10 de Netflix) | **60** (6 × 10) |
| **Total en frío** | **~115** | **~60** |

En caliente los dos caminos son 0: antes por `top:pop:`, después porque
`cardsByIds` reusa `card:` y `pv3:`, que comparte con el Home y la búsqueda.

🔴 **La cuenta de "antes" es más alta de lo que parece porque los bloques por
popularidad enriquecen 20 títulos para mostrar 10.** El manual pide exactamente
los diez que va a mostrar.

**`/api/admin-search`**: 1 `search` + hasta 8 `cardsByIds` por consulta, con
debounce de 250 ms. Antes esta ruta **no validaba nada** y cualquiera podía
gastar esa cuota; ahora exige admin con MFA.

## Upstash

| Clave | Antes | Después |
|---|---|---|
| `top:pop:<huella><plataforma>:<tipo>` | 10 (5 × 2) | **0** |
| `top:manual:publicaciones` | 0 | **1** |
| `disp:top-manual` | 0 | **1** |
| `card:`, `pv3:` | compartidas | **igual** |

Neto: **−8 claves**. Los comandos por request bajan en la misma dirección: antes
un `/top` frío escribía diez entradas `top:pop:`; después escribe dos.

## Lo que no se pudo medir

- **El "después" no está instrumentado**: la migración no se ejecutó y no hay
  bloques publicados. Los números salen de contar las llamadas en el código.
- **El tiempo de respuesta post-cutover**: depende de cuántas de las 60 fichas
  estén en `card:`, que a su vez depende del tráfico del Home. No tiene sentido
  estimarlo sin datos reales.

## Lo que empeora, y conviene decirlo

1. **Una consulta más por request durante la preparación** (2 → ≤3), acotada por
   el cache de 60 s.
2. **Una tabla que crece**, por diseño: el historial de publicaciones no se
   borra. ~6.900 filas al año.
3. **Un minuto de latencia** entre publicar y ver el cambio, incluido el
   cutover.
