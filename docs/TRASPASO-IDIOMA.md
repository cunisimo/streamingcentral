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

**`main` = `b172982`, sincronizado con `origin/main`. Desplegado y verificado en
producción.**

### La Tanda 1 está en producción

Lo único que el usuario ve: en `/titulo/movie/12535` aparece
**"En Disney+, buscala como «High Anxiety»"** con botón de copiar.

**El idioma NO cambió.** Todo sigue en `es-ES`: "Bitelchús", "Vaiana 2",
"Monstruos, S.A.". Eso es lo esperado.

Lo que entró, todo **inerte y cableado**, para que la Tanda 2 sea solo una
variable de entorno:

| Módulo | Qué hace |
|---|---|
| `lib/idioma.ts` | Configuración, el predicado `queReparar`, la fusión por campo, el mecanismo `repararLote`/`repararUno`, métricas por request (AsyncLocalStorage) y `pedirRespaldoIdioma()` — el punto ÚNICO donde se pide un respaldo |
| `lib/claves.ts` | Los **once** constructores de claves localizadas, en *modo compatible*: producen los mismos bytes que antes |
| `lib/consultas-verificadas.ts` | El mapa de consultas verificadas (una fila: Mel Brooks) y el resolver |
| `lib/idioma-adaptadores.ts` | Los cuatro `producir` que usan producción y tests |
| `lib/reparar-y-cachear.ts` | `resolverConCache`: "leer → producir → decidir si guardar" |
| `lib/single-flight.ts` | Une lo que está en vuelo, clave `idioma:tipo:id` |
| `lib/recordatorio-texto.ts` | El texto del `.ics` |
| `components/AyudasBusqueda.tsx` | Pinta lo que el servidor ya resolvió |

**311 tests, 0 fallas. `tsc` limpio.**

### Configuración viva

```
IDIOMA_BASE       = "es-ES"   (default; IDIOMA_TITULOS no está definida)
FALLBACK_ACTIVO   = false     (base === fallback ⇒ inerte)
HUELLA_EN_CLAVES  = ""        (modo compatible, ninguna clave cambió)
```

Verificado en producción: `/api/health` → `cache: redis`, 2752 claves. No hubo
arranque frío.

---

## Lo que sigue: la Tanda 2

**Es el único cambio global del idioma del catálogo y del Home, y el único
arranque frío del plan.**

Trabajo de código: **uno solo**.

1. Pasar `HUELLA_IDIOMA` a los once constructores de `lib/claves.ts` (hoy
   reciben `HUELLA_EN_CLAVES`, que es `""`).
2. `IDIOMA_TITULOS=es-MX` en Vercel.

El idioma base, el fallback y el respaldo genérico al original **ya están
implementados y probados**: se encienden solos con la variable.

### La trampa que hay que revisar ANTES

**Preview no puede compartir el Redis de producción.** La integración de Vercel
asigna `KV_*` a los tres scopes, así que un Preview probando `es-MX`
precalentaría exactamente las claves `es-MX+f.r1` que producción va a usar, y el
arranque frío que hay que medir llegaría **caliente**.

Solución elegida (costo 0): sacar `KV_*` del scope Preview → cae al caché en
memoria. Se confirma con `GET /api/health` en el Preview:

```
HTTP 503 + "cache":"memoria"  → Preview aislado, SE PUEDE medir
HTTP 200 + "cache":"redis"    → está pegándole a producción, PARAR
```

El 503 es deliberado y **no** es un deploy roto. Todo en `docs/MANTENIMIENTO.md`.

### Criterios de aceptación de la Tanda 2

Contra la línea de base medida end-to-end (Home frío de `n,d,m`):

| | Base | Tope |
|---|---|---|
| Llamadas a TMDB | 612 | ≤ 660 |
| Comandos de Upstash | 655 | ≤ 670 |
| Payload del Home | 84.063 B | ≤ 85.000 B |
| `degradado` / `fallos` | false / 0 | false / 0 |

Y `[home] MISS` en el primer request: si dice `HIT`, la huella no se cableó.

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
