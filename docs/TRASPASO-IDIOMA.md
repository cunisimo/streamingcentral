# Traspaso: el idioma de los títulos, cerrado — y lo que quedó abierto

**2026-08-25.** Reemplaza al traspaso del 23/08, que cubría solo las tandas 1 y 2.
Para retomar en otra sesión sin perder contexto.

---

## En una línea

**Toda la app está en `es-MX`** —catálogo, Home y Próximamente— con respaldo a
`es-ES`. Las tres tandas están mergeadas y desplegadas. Lo que quedó abierto no
es del idioma: es que **el cron semanal del Top 10 de Netflix nunca disparó**
(issue #13).

## Estado de despliegue

```
main = ba4a5aa   Merge feat/idioma-tanda-3   ← desplegado y verificado
```

`origin/main` sincronizado. La rama `feat/idioma-tanda-3` se borró de los dos
lados con borrado seguro. Sin worktrees colgados.

| Pieza | Estado |
|---|---|
| `IDIOMA_TITULOS` en **Vercel** (app) | `es-MX`, scope Production |
| `IDIOMA_TITULOS` en **Supabase** (Edge Functions) | `es-MX` |
| Edge Function `tmdb-sync` | desplegada, **version 7** |
| Migración `006_backfill_upcoming_idioma.sql` | aplicada |
| Cron `tmdb-sync-upcoming-daily` (pg_cron) | **activo**, jobid 2, `0 6 * * *` |
| Cron `netflix-top10` (Vercel) | **ROTO — ver issue #13** |

---

## Qué se hizo, por tanda

### Tanda 2 — el catálogo y el Home a es-MX

Un solo cambio de código: pasar `HUELLA_IDIOMA` a los **once** constructores de
`lib/claves.ts`. Con eso la clave de cache depende de la configuración
(`card:es-MX+f.r1:movie:278`) y un rollback selecciona otro espacio en vez de
esperar TTLs de hasta 30 h.

Medido con las dos variantes **alternadas en la misma ventana**: +38 llamadas a
TMDB (+6,2%), +0 a +2 comandos de Upstash, +337 B de payload. Las 38-39 llamadas
de respaldo son **37 páginas de `discover` + 2 detalles**, no 39 páginas.

**El arranque frío fue PARCIAL y eso es el diseño funcionando**: el primer MISS
dio `401 hit / 236 miss` de 637 claves. Las familias sin huella —`pv:`,
`videos:`, `genre:covers:`, `blocklist:`— siguieron calientes.

### Tanda 3 — Próximamente

`upcoming_content` pasó a es-MX por dos vías: el sync escribe en es-MX de acá en
adelante, y un **backfill** corrigió las filas que el sync no alcanza (mira 3
páginas por popularidad, así que hay filas que no se refrescan nunca).

Backfill: **13 filas, 16 campos**, aplicado desde un snapshot aprobado. Los 44
títulos de la agenda coinciden con su ficha (0 diferencias).

---

## Las decisiones que no hay que volver a discutir

- **El pasaje al inglés NO se repara.** "Monsters, Inc.", "Moana 2", "Game of
  Thrones" son los nombres publicados en Argentina. Hay tests que lo fijan.
- **`searchDeTipo` sigue en `es-MX` y `searchTitles` en `en-US`** (matchea el TSV
  de Netflix).
- **`poster_path` cambia con es-MX y es deliberado**: los pósters de TMDB son
  localizados y acompañan la encontrabilidad. Documentado en `docs/UPCOMING.md`.
  **El backfill sigue limitado a `title`, `overview` y `episode_name`.**
- **El rollback de la app** es `IDIOMA_TITULOS=es-ES` + un deployment nuevo del
  **mismo** `main`. **Nunca revertir el código**: código sin huella con la
  variable en es-MX escribe títulos mexicanos en las claves de es-ES, y ahí el
  rollback deja de revertir. En el sync, el rollback es el secret de Supabase y
  hay que hacerlo **antes** de restaurar un snapshot, o el sync pisa la
  restauración.
- **Un rollback cuesta un SEGUNDO arranque frío**: la huella pasa a `es-ES.r1`,
  que no es el espacio vacío de la tanda 1.

---

## Lo que costó tres iteraciones, y es lo más transferible

La política del sync ante un respaldo que no alcanza se equivocó **dos veces**, y
las dos las encontró **una corrida real, no la revisión de código**:

1. **Descartar todo lo que el respaldo no mejorara** → tiró 79 títulos de 120,
   casi todos sin sinopsis en ningún idioma. El descubrimiento bajó a un tercio.
2. **Escribir todo lo que el respaldo no mejorara** → habría persistido títulos
   coreanos que es-ES tenía en español.

Las dos preguntaban *"¿la fusión cambió algo?"*. **La pregunta correcta es "¿qué
sigue roto DESPUÉS de fusionar?", y se decide por campo.** La regla final:

```
título final no vacío y en alfabeto latino  ->  se escribe, aunque coincida
                                                con el original y no exista
                                                traducción en ningún idioma
título final vacío o en escritura no latina ->  el candidato queda fuera
sinopsis vacía en los dos idiomas           ->  se escribe
solo un fallo de TRANSPORTE justifica reintentar
```

Ese último corte es un **piso de calidad, no una protección de idioma**: la
fusión ya repara todo lo que es-ES pueda mejorar. Candidatos: 40 → 83 → **113 de
120**.

### Otras cosas que encontró correr y no leer

- **Un título vacío con sinopsis buena no dispara ninguna señal**
  (`cayoAlOriginal` exige que el original exista). Se escribía el vacío. El piso
  ahora corre sobre todos los items y en los tres caminos.
- **El script salía con 127 en vez de 1**: en Windows, `process.exit()` con
  stdout en vuelo tumba a libuv. Un script que avisa "esto falló" no puede
  comunicarlo con un crash.
- **`ensayo_leer()` no devolvía las coordenadas del episodio**, así que los
  títulos sintéticos —los únicos que no están en la tabla real— caían en el
  camino del 404 y el episodio exacto nunca se ejercitaba.
- **El episodio se pide por COORDENADAS EXACTAS**
  (`/tv/{id}/season/{n}/episode/{m}`), nunca `next_episode_to_air`: el backfill
  corre días después del sync y "el próximo" ya avanzó.

---

## Reglas de medición que se ganaron a los golpes

- **Alternar las variantes en la misma ventana.** El catálogo de TMDB deriva
  solo, y la deriva es del mismo orden que el efecto que se busca. Comparar
  contra una foto de hace una hora hizo publicar una conclusión equivocada sobre
  las cantidades por riel.
- **Correr el control**: la misma variante dos veces. Si da 0 diferencias, el
  composer es determinístico y lo que se mide es el cambio.
- **TMDB se degrada bajo concurrencia.** Demostrado: corriendo el script de
  medición y un Home frío a la vez, TMDB devolvió **502** en `/watch/providers`.
  Los conteos aguantan la carga; **los tiempos no**.
- **Un puerto distinto por corrida**, y verificar en la salida qué variante
  respondió. `kill` sobre `npx next dev` mata el wrapper, no el servidor.
- **`YUMP_FECHA` fija** en todas las corridas, o cruzar la medianoche argentina
  mezcla el cambio de código con el cambio de día.

---

## Trampas de infraestructura, documentadas

- **"Sacar `KV_*` del scope Preview" es una instrucción PELIGROSA.** La
  integración de Vercel crea **una entrada por variable con los dos targets**, así
  que borrar "la de Preview" se lleva puesta la de Production. Lo que sí funciona:
  **variables de Preview acotadas a la rama**, en vacío. Ver `docs/MANTENIMIENTO.md`.
- **Los Previews están detrás de Vercel SSO**: `curl` recibe un 302. Lo
  automatizable es `vercel logs --json`, autenticado por CLI.
- **Un deploy de Edge Function no se verifica por hash.** `functions download`
  devuelve el código **transpilado**; los 11 archivos dan distinto sin que eso
  signifique nada. La verificación es **semántica**: marcadores que tienen que
  estar y marcadores que no.
- **`deno check` en un contenedor** prueba el bundling de `_shared` sin
  desplegar; `deno info` muestra el grafo de módulos.
- **Deno genera un `deno.lock`** cada vez que corre `deno check`. Hay que
  borrarlo; no está en `.gitignore`.

---

## Archivos ajenos, sin registrar y a propósito

Estos **cuatro** son del dueño y no pertenecen a ninguna rama de trabajo:

| Archivo | Cómo está protegido |
|---|---|
| `prompts/noticias-filtro.md` | aparece como `??`; no agregarlo a mano |
| `prompts/noticias-redaccion.md` | ídem |
| `supabase/migrations/004_news.sql` | ídem |
| `.claude/settings.local.json` | **`.gitignore` del repo** (antes solo el ignore global) |

**Nunca `git add -A`.** Commits con rutas explícitas, siempre.

---

## PENDIENTES

### 1. El Top 10 de Netflix — issue #13, lo más fresco

**El cron semanal nunca disparó.** El bloque de Netflix está mostrando
popularidad en vez del top oficial porque la última semana ingestada
(`2026-08-09`) superó los 14 días de la guarda. Netflix ya publicó `2026-08-16`.

Las dos escrituras de la tabla son fuera de horario (domingo y miércoles, contra
un cron de martes 12:00 UTC): **las dos ingestas fueron manuales**.

Dos cosas, separadas:

1. **Recuperar la semana que falta**: una llamada a `/api/cron/netflix-top10` con
   el `CRON_SECRET`. Upsert idempotente de 20 filas. **Pendiente de aprobación
   del dueño.**
2. **Arreglar el cron.** Hay que mirar **Vercel → Settings → Cron Jobs**. Sin
   eso, el bloque vuelve a caer a popularidad en 14 días.

Detalle completo en `docs/ISSUES.md` #13.

### 2. Bloqueante de Google Play

La página pública **`/eliminar-cuenta`**, accesible sin la app. El mecanismo del
servidor ya está listo: depende solo de un token válido.

### 3. Los issues de `upcoming_content` que quedaron fuera de alcance

Declarados fuera de la tanda 3 **a propósito**: frescura (#7), cobertura (#8),
la mezcla de estrenos con episodios semanales (#6) y las fechas en UTC (#4).

### 4. Ramas sin mergear, anteriores a todo esto

`feat/dia-rotacion` (`diaYump()` con borde a las 04:00 y `TTL.home` 26 h) quedó
pendiente de una prueba manual y está **muy** detrás de `main`: hay que rebasarla.

---

## Lo que NO es un bug, por si vuelve a aparecer

- **Prime Video y Max comparten títulos en el Top.** Verificado contra TMDB:
  *El hombre araña*, *El Sorprendente Hombre-Araña* y *El Origen* tienen flatrate
  en `119 Amazon Prime Video` **y** en `1899 HBO Max` en Argentina. Es catálogo no
  exclusivo. Y el mapeo no infla: los ids **9** (Prime) y **384** (Max legacy) no
  existen en AR y aportan **0 títulos**.
- **La interfaz del Top no miente.** El copy es
  `source === "netflix" ? "…dato oficial" : "Lo más popular ahora"`.

---

## Dónde está cada cosa

```
docs/ISSUES.md                                 #13, el cron del Top 10
docs/ESTADO.md                                 estado de las tres tandas
docs/UPCOMING.md                               el idioma del sync y el póster
docs/MANTENIMIENTO.md                          Preview/Redis, precalentado, medición
docs/IDIOMA-COBERTURA.md                       qué superficie repara qué
docs/medidas/2026-08-23-idioma-tanda2-e2e.json la medición de la tanda 2
docs/medidas/foto-upcoming-*.json              fotos de la agenda, con hash
docs/medidas/snapshot-upcoming-*.json          los planes del backfill
scripts/backfill-upcoming-idioma.mjs           dry-run por default
scripts/foto-upcoming.mjs                      fotos completas con hash
scripts/precalentar-home.mjs                   runbook de activación
scripts/banco-idioma-*.{sh,mjs}                el arnés de medición
supabase/functions/_shared/idioma-nucleo.ts    el predicado y la fusión, compartidos
supabase/ensayo/upcoming-idioma.sql            el espejo del ensayo (con su guarda)
```
