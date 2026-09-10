# Antecedente del issue #13 — Top automático de Netflix

**Retirado de los issues abiertos el 09/09/2026.** El dueño confirma que resolvió
la operación del Top con el dashboard manual `/admin/top`, donde carga series
y películas para las plataformas del ranking. Código comprobado: dashboard en
`app/admin/top/page.tsx`, publicaciones en `lib/top-manual.ts` y selección de
fuente manual en `lib/top.ts`. Estado vigente: [ESTADO.md](../ESTADO.md).

El cierre corresponde al problema del ranking público: no significa que se haya
reparado o apagado el cron. `vercel.json` conserva su programación y
`lib/enrich.ts` aún usa `disponiblesEnTopOficial` como respaldo de disponibilidad.
`lib/top.ts` conserva la fuente anterior cuando faltan publicaciones iniciales
o falla su lectura. No se verificaron ejecuciones actuales ni la base en esta
sesión; no se abre un nuevo pendiente sólo por la existencia de ese código.

El relato siguiente es histórico: sus diagnósticos, fechas y propuestas no deben
reintroducirse como trabajo pendiente del Top manual.

## #13 — El cron semanal del Top 10 de Netflix nunca disparó

**Detectado el 2026-08-25, reportado por el dueño**: "el Top 10 de Netflix me
trae lo más popular; hasta hace dos días estaba bien".

**No es un bug del código: es que dejaron de entrar datos.** `latestWeekRows()`
devuelve `null` si la semana guardada tiene más de `SEMANA_VIEJA_MS` (14 días), y
el bloque cae a popularidad. Esa guarda es deliberada — no sostener datos viejos
bajo el sello "dato oficial" — e hizo exactamente lo que tenía que hacer.

| | |
|---|---|
| Última semana guardada | **2026-08-09**, escrita el 2026-08-12 18:10 UTC |
| Antigüedad al detectarlo | **16,4 días** (cruzó los 14 hace ~2,4) |
| Última semana publicada por Netflix | **2026-08-16**, disponible desde el ~18/08 |

### La causa raíz

El cron es `0 12 * * 2` (martes 12:00 UTC), pero las dos escrituras que existen
en la tabla son **fuera de horario**:

- semana `2026-08-02` → **domingo** 09/08, 17:27 UTC
- semana `2026-08-09` → **miércoles** 12/08, 18:10 UTC

Ninguna coincide con un martes al mediodía. **Las dos ingestas fueron manuales**:
el cron de Vercel no disparó nunca. La guarda de 14 días lo tapó durante dos
semanas — mientras el dato aguantó, nadie se enteró.

**Sospecha sin confirmar**: el scope de Vercel se llama
`jfgalindez-gmailcom's projects`, que es el nombre de un plan Hobby, y ahí los
cron jobs tienen límites. **No está verificado** y hay que mirarlo en
Vercel → Settings → Cron Jobs, donde se ve si el cron está registrado y sus
últimas ejecuciones. No dar por sentado cómo se comporta la plataforma: es el
tipo de suposición que ya mordió en este proyecto.

### Lo que NO es

- **No tiene relación con el cambio de idioma a es-MX.** `latestWeekRows` no toca
  claves de caché ni idioma. La coincidencia de fechas es casual.
- **La interfaz no miente.** El copy es
  `source === "netflix" ? "Lo más visto esta semana · dato oficial" : "Lo más popular ahora"`,
  así que mientras sirve popularidad lo dice. Degradó con honestidad, y por eso
  se pudo detectar mirando la pantalla.

### Cómo se arregla

Dos cosas separadas:

1. **Recuperar la semana que falta**: una llamada a `/api/cron/netflix-top10`
   con el `CRON_SECRET`. Es un upsert idempotente de 20 filas.
2. **Arreglar el cron**, que es el problema de fondo. Sin eso, el bloque vuelve a
   caer a popularidad en 14 días.

### Lo que este issue enseña, más allá del cron

**Una guarda que degrada en silencio esconde la falla que la disparó.** El bloque
se venía degradando bien, pero nada avisaba que hacía dos semanas que no entraba
un dato. Vale la pena un chequeo de frescura visible —en `/api/health`, por
ejemplo— para las fuentes que dependen de un cron.

### Desenlace parcial — 2026-08-25

**El cron disparó.** La semana `2026-08-16` entró el **martes 2026-08-25 a las
12:58 UTC**: el día que corresponde y dentro de la hora de su `0 12 * * 2`, que
es el margen con el que Vercel dispara los cron. Es la primera escritura de esta
tabla que parece automática. El bloque de Netflix volvió a "dato oficial".

**Lo que sigue sin explicación**: esa semana tendría que haber entrado el martes
**2026-08-18**, no siete días después. O el cron no disparó ese día o disparó y
falló, y desde acá no hay forma de distinguirlo — hay que mirar los logs de
Vercel.

**Y la fragilidad de fondo no se movió**: la guarda mide la antigüedad desde la
FECHA DE LA SEMANA, no desde la ingesta. La semana que tenemos hoy ya nació con
9 días encima, así que **una sola corrida perdida vuelve a degradar el bloque**.
Verificado de paso que no hay un desfase sistemático: el TSV de Netflix todavía
publica `2026-08-16` como su semana más nueva, así que la corrida de hoy se
llevó lo más fresco que había.

### Volvió a vencer — 2026-08-30

Comprobado en la base, no deducido:

| semana | primera escritura | filas |
|---|---|--:|
| `2026-08-16` | **2026-08-25 12:58:03 UTC** (martes) | 20 |
| `2026-08-09` | 2026-08-12 18:10 UTC | 20 |
| `2026-08-02` | 2026-08-09 17:27 UTC | 20 |

**El cron corrió el 25/08 y entró en horario.** La semana `2026-08-16` es la más
nueva que hay, y hoy tiene **exactamente 14 días**: la guarda mide desde `week`,
no desde la ingesta, así que **la evidencia venció otra vez** — por horas.

⚠️ **`week` es la semana del RANKING, no cuándo corrió la ingesta.** Que la fila
diga `2026-08-16` no prueba que hayan faltado corridas: la del 25/08 existe y
está fechada. Una versión anterior de esta nota afirmaba que faltaban las
corridas del 18 y del 25, y **era falso** — salía de leer `week` como si fuera la
fecha de ejecución.

**Consecuencia hoy:** ningún título recibe el respaldo del top oficial, así que
`/api/title/tv/322428` (Moria) devuelve `[]`. **Moria no está resuelta
actualmente**, y no lo está en `main` tampoco: la regla de ventana no cambió.
Esto NO lo arregla la rama `fix/disponibilidad-oficial` y no se intentó ahí — es
este issue, que sigue abierto.

Lo que hay que decidir acá (no en la rama de disponibilidad): si la guarda debe
medir desde `week` o desde `updated_at`. Medir desde `week` es lo honesto para el
rótulo "dato oficial" —el ranking es viejo aunque lo hayamos bajado hoy— pero
condena al bloque a degradarse cada dos semanas mientras Netflix publique con 9
días de retraso.


---

