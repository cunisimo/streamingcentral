# Seguimiento del incidente de Redis (desde el deploy del 7/11)

Deploy medido: Production `7623078068`, `main` = `5be7d96`, 2026-11-07 15:25 UTC (12:25 ART).
Sólo lectura: no se publican reglas de Firewall ni se cambia el plan de Upstash.

## Fuentes y zonas horarias

- **Upstash** (`yumpapp`, consola vía Vercel → Storage → yumpapp → Open in Upstash → Usage):
  gráfico "Daily Commands per Region", **días UTC** (00:00–24:00 UTC = 21:00–21:00 ART),
  sólo los **últimos 5 días**. Los valores exactos están en el árbol de accesibilidad
  (`listitem "sa-east-1-0 <n>"`). Los gráficos de 3 h usan hora local del navegador (ART).
- **Vercel Firewall → Traffic** (plan Hobby): sólo "Past Hour" y "Past Day" (ventana móvil).
  "Top Request Paths" lista los 50 primeros: las rutas con id (`/titulo/…`, `/api/title/…`)
  quedan casi todas fuera, así que el volumen del bot se mide por agente y por rutas fijas.
- **Vercel Logs → Request Logs**: ventana de ~30 min; no muestra el agente por fila.

## Métrica para separar tráfico de optimización

Cada visita del bot repite un ciclo fijo: `/titulo/<tipo>/<id>` (×2) → `/api/title/<tipo>/<id>`
→ precargas de `/`, `/cuenta`, `/cuenta/lista`, `/top`, `/buscar` y de `/persona/<id>` del
reparto, más `/api/providers` y `/api/comunidad/resenas/lista`. Las rutas fijas (`/`, `/top`…)
cuentan **ciclos**. **Comandos de Redis por ciclo** = comandos diarios / pedidos a `/` del día.
- Si bajan los comandos y los ciclos en la misma proporción → menos tráfico.
- Si bajan los comandos por ciclo → efecto de la optimización (u otro cambio de costo).

Limitación: `/` también lo piden usuarios reales (pocos: ~600 solicitudes/día no-bot el 7/11).

## Línea de base (antes del deploy)

| Día UTC | Comandos Upstash | Nota |
|---|---:|---|
| 2/11 | — | fuera de la ventana de 5 días; el dueño informó 100.000–145.000/día del 2 al 5/11 |
| 3/11 (mar) | 125.489 | |
| 4/11 (mié) | 144.083 | |
| 5/11 (jue) | 144.005 | |
| 6/11 (vie) | 94.634 | **no comparable**: cuota agotada (comandos rechazados) hasta el cambio a Fixed 250 MB |
| 7/11 (sáb) | 105.690 parcial a las 16:30 UTC | mixto: deploy a las 15:25 UTC |

Primera revisión (7/11, 13:30 ART):
- **Firewall, Past Day** (≈ 6/11 13:30 → 7/11 13:30 ART): 47,3 mil solicitudes permitidas;
  Reflectionbot (agente `Reflectionbot/1.0`) **46,7 mil (98,7 %)**; AS Google LLC 46,7 mil;
  IPs top en `16.216.88.0/23`. El tráfico arrancó ~17:00 ART del 6/11 y se mantuvo en
  400–850 por intervalo. `/` 2,3 mil, `/top` 2,3 mil, `/buscar` 2,3 mil.
- **Firewall, Past Hour** (12:33–13:33 ART, todo después del deploy): 2,4 mil; Reflectionbot
  **2,3 mil**; `/` 120; `/robots.txt` 3 (sin poder atribuir a quién).
- **Request Logs** 13:30–13:32 ART: el ciclo descripto arriba sigue activo.
- **Upstash, 3 h** (10:32–13:29 ART): 1,76 comandos/s antes del deploy (≈152 mil/día) y
  1,52 después (≈131 mil/día), sobre ~66 min posteriores. **Indicativo, no concluyente.**
  Comandos por ciclo, estimado grueso: ~55 antes y ~46 después.

## Regla de Firewall publicada (2026-11-07, autorizada por el dueño)

- **Antes de publicar** (Past Hour 13:37–14:37 ART): Reflectionbot 2,6 mil solicitudes de ~2,6 mil;
  seguía activo ~2 h 15 min después del deploy de `robots.txt`.
- **Regla** "Deny Reflectionbot" (Custom Rule, publicada ≈ 14:40 ART / 17:40 UTC):
  `User Agent` *contains* `Reflectionbot` AND `Request Path` *does not equal* `/robots.txt` → **Deny**.
  Única regla custom del proyecto; no se tocó Bot Protection, IP Blocking ni Upstash.
- **Comprobado con curl (17:41 UTC)**: con el UA del bot, `/`, `/titulo/movie/550` y
  `/api/title/movie/550` → 403; `/robots.txt` → 200 con `User-agent: Reflectionbot / Disallow: /`.
  Sin ese UA: `/titulo/movie/550` 200, `/api/title/movie/550` 200, `/api/health` 200
  (Redis "lectura y escritura OK", 0 × 429).
- **Comprobado en panel** (Traffic, Past Hour, filtro Denied, ≈ 14:42 ART): denegadas con UA
  Reflectionbot desde `16.216.88.x` (AS Google LLC) en `/`, `/persona/…`, `/titulo/…`, además
  de las 3 de prueba propias (Telecom Argentina). El gráfico muestra caer las permitidas a ~0
  en el último intervalo. Pocos minutos de observación: el efecto sobre los comandos diarios de
  Upstash se mide en las lecturas diarias (a partir del 8/11 UTC el día es entero con regla;
  el 7/11 UTC queda mixto).
- Consecuencia para la comparación: la baja posterior ya no separa "optimización" de "menos
  bot" por día completo; los comandos por ciclo del 7/11 (~46 tras el deploy, antes de la regla)
  quedan como única estimación del efecto de la optimización con el bot presente.

## Lecturas diarias

| Día UTC | Comandos Upstash | Firewall Past Day (fin) | Reflectionbot | `/` | Cmd/ciclo | `/robots.txt` |
|---|---:|---|---:|---:|---:|---:|
| — | sin lectura 8/11–13/11 (no hubo tareas programadas ni pedidos diarios) | — | — | — | — | — |

## Estado al 14/11 (Firewall, sólo lectura)

Audit Log: una sola publicación (07/11, "Deny Reflectionbot"). Traffic, último día:
974 permitidas, 189 denegadas, todas por "DDoS Mitigation" de Vercel (IP `34.79.135.70`,
AS Google LLC, otro cliente) y **ninguna por la regla**: Reflectionbot no aparece entre
los agentes del día. La comparación final de comandos de Upstash del 8 al 10/11 quedó
**sin hacer**: el panel sólo conserva 5 días y no se tomaron las lecturas diarias.
