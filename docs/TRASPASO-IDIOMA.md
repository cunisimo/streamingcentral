# Traspaso: el trabajo de idioma de los títulos

**2026-08-23.** Para retomar en otra sesión sin perder contexto.

---

## El problema, en una línea

Yump muestra los títulos en **español de España** y las plataformas argentinas
usan otros nombres, así que el usuario no encuentra lo que la app le recomienda.
El caso que lo disparó: `movie:12535` — Yump dice "Máxima ansiedad", Disney+ AR
publica "Las ansiedades del Dr. Mel Brooks", y el usuario tuvo que googlearla.

## Qué se decidió, y con qué evidencia

Se midió contra el buscador **real** de cada plataforma argentina, **29 casos
verificados** (8 los probó el dueño en Netflix, Disney+ y Max; 10 los probé yo
en el catálogo público de Prime Video y Crunchyroll; 12 más en una submuestra
dirigida):

| Variante | Encuentra |
|---|---|
| `es-ES` (lo que hay hoy) | **18/29** |
| `es-MX` | **28/29** |
| Título original | 28/29 |
| Alternativo argentino de TMDB | 2/5 |
| **`es-MX` ∪ original** | **29/29** |

**Los 11 fallos de `es-ES` son TODOS de Netflix, Disney+ y Max.** En Disney+
falla 8 de 9. En Prime Video no falla nunca, porque su buscador indexa títulos
alternativos y el de las tres grandes no.

Tres hallazgos que cambiaron el plan:

1. **`es-AR` no sirve.** 0% de cobertura en la muestra de 60: TMDB solo tiene
   `ES` y `MX` para el español.
2. **Cuando falta la traducción MX, TMDB cae al título ORIGINAL, no a `es-ES`.**
   Por eso `es-MX` a veces devuelve `런닝맨` o deja la sinopsis vacía. Es la
   causa de las dos regresiones que el fallback repara.
3. **El nombre que publica una plataforma no siempre es una consulta que su
   propio buscador reconozca.** "Las ansiedades del Dr. Mel Brooks" devuelve
   **cero** en Disney+. Lo único que la encuentra es `High Anxiety`. Por eso la
   tabla propia guarda **consultas verificadas**, no nombres publicados.

Informe completo: `docs/medidas/2026-08-23-idioma-informe.md`.
Plan: `docs/medidas/2026-08-23-idioma-plan.md`.

---

## Estado actual

**Producción sigue en `es-ES` y no se tocó.** La tanda 1 está desplegada
(`main` = `5fc0c2e`) y lo único visible ahí es el aviso "En Disney+, buscala como
«High Anxiety»" en `movie:12535`.

### La Tanda 2 está en `feat/idioma-tanda-2`, sin mergear

Un solo cambio de código: los once call sites pasaban `HUELLA_EN_CLAVES` —la
cadena vacía del modo compatible— y ahora pasan `HUELLA_IDIOMA`. La constante
vacía se eliminó, y el candado que ocupa su lugar es un barrido nuevo que exige
`HUELLA_IDIOMA` en todas las llamadas a un constructor y fija el total en 11.

**318 tests, 0 fallas. `tsc` limpio. `next build` completo.**

Medición contra una línea de base **nueva** (los 612/655 son referencia
histórica: la tanda 1 los movió). Todo en
`docs/medidas/2026-08-23-idioma-tanda2-e2e.json`.

| Home frío `n,d,m` | Base (es-ES) | Tanda 2 (es-MX+f) | Tope | |
|---|---|---|---|---|
| Llamadas a TMDB | 613 · 614 · 614 | 649 · 649 · 649 | ≤ 660 | ✅ |
| Comandos de Upstash | 660 · 657 · 657 | 655 · 655 · 654 | ≤ 670 | ✅ |
| Páginas de fallback | 0 | 38 | ~32 | ✅ |
| Payload | 84.318 B | 84.390 B | ≤ 85.000 B | ✅ |
| `degradado` / `fallos` | false / 0 | false / 0 | | ✅ |
| Títulos por riel | …·40·38 | …·**39·39** | idénticos | ⚠️ |

El desvío tiene causa medida: **TMDB ordena `discover` por idioma** (mismos ids,
otro orden), así que el Home se recompone aunque el catálogo sea idéntico. Los
dos carruseles de audiencia suman 78 en los dos casos y ningún riel queda vacío.
El criterio "idénticos" no es alcanzable con un cambio de idioma.

**Ensayo de rollback (local):** `IDIOMA_TITULOS=es-ES` devuelve exactamente la
línea de base — mismos rieles, mismo hero, mismas fichas. Lo que **no** devuelve
es el cache: la huella pasa a `es-ES.r1` y eso cuesta un **segundo** arranque
frío.

## Lo que falta: Vercel

**Bloqueo actual: `vercel whoami` responde "The specified token is not valid".**
La sesión del CLI está vencida, así que las variables y el Preview quedaron sin
hacer. En orden:

1. **Aislar Preview del Redis de producción.** Sacar `KV_*` del scope Preview
   (sin tocar Production) y confirmar con `GET /api/health` en el Preview:
   `503` + `"cache":"memoria"` está bien; `200` + `"redis"` obliga a frenar,
   porque el Preview estaría precalentando las claves `es-MX+f.r1` que
   producción tiene que estrenar en frío. El 503 es deliberado, no un deploy
   roto.
2. **`IDIOMA_TITULOS=es-MX` solo en Preview**, y recién después pushear la rama:
   un deployment toma el valor que existía cuando se creó.
3. Probar a mano la checklist de abajo.
4. Recién ahí, sumar el scope Production y redeployar.

### Qué mirar a mano en el Preview

1. `[home] MISS home:es-MX+f.r1:v5:…` en el primer request; el segundo, `HIT`.
2. `movie:278` → "Sueño de fuga" + el respaldo "The Shawshank Redemption".
3. `movie:12535` → la ayuda de Disney+ sigue, **sin** duplicarse.
4. `tv:1399` → "Game of Thrones"; `movie:585` → "Monsters, Inc.";
   `movie:1084242` → "Zootopia 2".
5. `/top` y `/personas` (las claves menos obvias) y `/buscar` con "Duro de
   matar" y "Mi pobre angelito".
6. La ruleta: encabezado y cuerpo sin contradicción; se esperan **cero**.

### Después, la Tanda 3

`upcoming_content` (Próximamente) sigue en `es-ES`: Edge Function `tmdb-sync` a
`es-MX` + backfill. El backfill necesita **dry-run, snapshot obligatorio y
compensación automática verificada**; el plan explica por qué "revertir la
función y re-sincronizar" no alcanza (el sync solo reescribe su ventana).

---

## Decisiones que NO hay que volver a discutir

- **El pasaje al inglés NO se repara.** Los 38 títulos donde `es-MX` devuelve el
  original inglés son "Monsters, Inc.", "Moana 2", "WandaVision", "Black Widow",
  "Game of Thrones": en Argentina **esos son los nombres publicados**. Verificado
  con 12 casos. Medido en Disney+: "Zootopia 2" aparece, "Zootrópolis 2" no.
  Hay tests que lo fijan.
- **El buscador queda clavado en `es-MX`** (`searchDeTipo`). Es lo que hace que
  "Duro de matar" encuentre la 562.
- **`searchTitles` queda en `en-US`.** Matchea el TSV de Netflix.
- **`alternative_titles` está fuera de la v1.** Encontró 2 de 5, agrega payload y
  falló en el caso que disparó todo.
- **La búsqueda del admin queda fuera de alcance.** Es del dashboard editorial,
  la usa solo el dueño para elegir un id.
- **Paramount+ sin verificar** (el dueño no tiene cuenta). No cuenta como fallo.

---

## Cosas que muerden, aprendidas a los golpes

- **Nunca `git add -A`.** Así se colaron tres archivos ajenos del dueño en un
  commit. Se sacaron con `git rm --cached` (que no toca la copia de trabajo).
  **Commits con rutas explícitas, siempre.**
- **Estos tres archivos son del dueño y van sin registrar, a propósito:**
  `prompts/noticias-filtro.md`, `prompts/noticias-redaccion.md`,
  `supabase/migrations/004_news.sql`. Tienen que seguir apareciendo como `??`.
- **Dos procesos de Next sobre la misma carpeta corrompen `.next`** y dan
  `Cannot read properties of undefined (reading 'call')` en `options.factory`,
  que parece un bug de código y no lo es. Matar todo
  `next/dist/server/lib/start-server.js` que sobre, borrar `.next`, levantar de
  nuevo. Un `kill` sobre `npx next dev` mata el wrapper, **no** el servidor.
- **`.env.local` no tiene credenciales de Upstash**: el dev local corre con el
  caché en memoria. El `0 requests` de la línea `[home]` lo confirma.
- **Un test que reimplementa lo que dice probar no prueba nada.** Pasó tres
  veces en esta sesión. Por eso `resolverConCache` y los adaptadores son
  compartidos entre producción y tests, y hay un test que falla si `cachedIf`
  deja de delegar.
- **Los tests de un camino de fallo tienen que forzar `activo: true`**: con la
  config en `es-ES` la guarda de inercia sale antes y el test pasa sin ejecutar
  nada.

---

## Ramas sin mergear

| Rama | Qué es |
|---|---|
| `audit/idioma-titulos` | La auditoría: informe, plan y scripts de medición. Los artefactos de `docs/medidas/` ya viajaron dentro de la Tanda 1; el informe y el plan viven ahí. **Decisión pendiente del dueño: mergear o dejar como registro.** |
| `feat/dia-rotacion` | `diaYump()` con borde a las 04:00 y `TTL.home` 26 h. **Anterior a este trabajo**, quedó pendiente de una prueba manual del agujero de cuota. Está muy detrás de `main`: hay que rebasarla. |

---

## Otros pendientes del proyecto, ajenos a esto

- **Bloqueante para Google Play:** la página pública `/eliminar-cuenta`,
  accesible sin la app. El mecanismo del servidor ya está listo.
- `docs/ISSUES.md` tiene **12 abiertos**. El más relevante es el **#12**: el
  piso de 60 votos por defecto en `discover()` excluye cine regional en toda la
  app. El dueño pidió no tocarlo hasta decidir viendo qué aparece sin él.
- **No hay `.gitattributes`** y `core.autocrlf=true`: esa combinación ya produjo
  un churn de 1600 líneas. Va a volver a pasar.

---

## Dos cosas que este entorno no puede verificar

- **El scroll.** El panel del navegador no dispara eventos de scroll ni ejecuta
  `requestAnimationFrame`, así que todo lo de "volver de una ficha" está
  verificado hasta el último paso menos el `scrollTo` final.
- **Las capturas de pantalla.** El panel no compone frames; se verifica por DOM
  y estilos computados.

---

## Dónde está cada cosa

```
docs/medidas/2026-08-23-idioma-informe.md    el informe con los 29 casos
docs/medidas/2026-08-23-idioma-plan.md       el plan en tres tandas
docs/IDIOMA-COBERTURA.md                     matriz: qué superficie repara qué
docs/MANTENIMIENTO.md                        la trampa de Preview/Redis y el 503
docs/ESTADO.md                               estado de la rama y archivos ajenos
scripts/medir-idioma-titulos.mjs             instrumento/muestra/medición
scripts/medir-fallback-idioma.mjs            coste del fallback
scripts/auditar-ruleta-idioma.mjs            auditoría de roulette_titles
```
