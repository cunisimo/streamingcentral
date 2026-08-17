# Estado de Yump

> Documento de traspaso. Se actualiza al cerrar una sesión de trabajo larga.
> **Última actualización: 17 de agosto de 2026.**

`CLAUDE.md` se carga solo en cada conversación y ya contiene las decisiones de
arquitectura, las limitaciones de TMDB y las reglas de cada feature. **Este
archivo no las repite**: acá va el estado del momento y lo que queda pendiente.

---

## Estado de despliegue

```
origin/main   ab4e189   ← main al día, nada sin pushear
feat/ejes-rieles-genero  1912f56   ← pusheada como respaldo, SIN mergear
```

`feat/ejes-rieles-genero` está en el remoto solo para que no viva en una sola
máquina. **No está mergeada**: espera la prueba a mano del dueño, y tiene un
criterio de aceptación fallado (ver más abajo).

`feat/hero-universo` está mergeada (probada a mano por el dueño) y **todo lo que
estaba pendiente de subir se pusheó el 16/08**: la rotación de ejes de los
carruseles de audiencia, el cacheo de `publishedIds` y el hero ampliado con su
arreglo de ejes.

**Verificar que Vercel haya tomado el push.** Ya pasó tres veces que no lo
detecta; se destraba con un commit vacío, no con Redeploy (ver la nota en la
memoria del proyecto).

---

## Qué se hizo en esta sesión

### Rendimiento y cache

| Cambio | Resultado medido |
|---|---|
| **CLS** — reserva de espacio, `font-display: optional`, ancho fijo en el navbar | 0.0857 → **0.0036** |
| **MGET** — las lecturas de Redis se agrupan en lotes | Lecturas de un rearmado: 391 comandos → **19** |
| **Pool cache** — `discover` cacheado por plataforma individual | Segundo usuario con plataformas que se solapan: 26 llamadas → **8** |
| **`publishedIds`** cacheado | 16 viajes a Supabase por rearmado → **1** |

### Variedad del catálogo

- **Tope de 2 por saga en todo el Home.** Sci-fi mostraba 7 Spider-Man; ahora
  ninguno se repite más de dos veces en todo el Home.
- **Rotación de ejes en los carruseles de audiencia.** Cinco ejes (`pop`, `top`,
  `nuevo`, `taquilla`, `hondo`) rotan con la semilla del día. Cobertura semanal:
  **20 títulos fijos → 198 y 166**. Solapamiento día a día: 100% → 0-21%.
  La rotación es **invisible**: los títulos de los rieles no cambian nunca.

### Correcciones

- **`dailySeed()` en hora argentina.** Todo lo que rota por día cambiaba a las
  21:00 locales. Tiene test (`lib/fecha.test.ts`, `npm test`).
- **"Recordarme"** ya no agenda la fecha de cine en películas: usa la digital
  argentina y devuelve 404 si no existe. El `.ics` de series usaba
  `first_air_date` —el estreno original, de años atrás— y ahora usa
  `next_episode_to_air`. El 404 se avisa en la interfaz en vez de descargar el
  JSON del error.
- **"Próximamente"** filtra lo vencido al leer, sin depender de que el sync esté
  fresco.
- **Contexto al volver de una ficha**: el scroll vertical se restauraba a 930 en
  vez de 1800; ahora vuelve entero, y cada riel recupera su scroll horizontal.
- **Deep links**: "Volver" en una ficha compartida ya no saca al usuario de la
  app.

---

## El hero — **cerrado y en producción**

Mergeado el 16/08 tras la prueba a mano del dueño. Código en `tandaAncha`
(`lib/enrich.ts`); la decisión de arquitectura está en `CLAUDE.md`. Todos los
criterios acordados se cumplen:

| | Objetivo | Medido |
|---|---|---|
| Clics limpios de "Otras" antes de repetir | ≥ 12 | **> 40** (5 antes) |
| Cobertura semanal del hero | ≥ 100 | **236** (40 antes) |
| Tiempo de respuesta de "Otras" | no empeora | **mejora** (ver abajo) |
| Payload del Home vs `offset=0` | idénticos | **idénticos** ✔ |
| Chips curados | idénticos a la foto | **`navidad` 18/18** ✔ |
| Ningún chip vacío en 7 días | 0 vacíos de 112 | **0** ✔ |

El último criterio lo agregó el dueño **después** de probar la rama, porque la
primera versión rompía "Contacto extraterrestre" y ninguna de las otras métricas
lo veía: todas miran el hero base o promedian los 16 chips. Ver
`MANTENIMIENTO.md` 8.d, que es la lección general.

Reproducible con:

```bash
node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
     scripts/medir-hero.mjs informe 2026-08-15
```

Corre las mismas métricas con el camino viejo y el nuevo en un solo proceso
(`HERO_ANCHO=0` es el interruptor). Fotos en `docs/medidas/`.

**Sobre el tiempo**: el camino viejo pedía discover a TMDB **sin cachear** en
cada clic (156-168 ms); el nuevo lee pools cacheados (0-1 ms en local). El número
local exagera la mejora porque acá el cache es en memoria y en Vercel es Upstash:
lo sólido es que dejó de haber una llamada a TMDB por clic, no el "0 ms".

**La condición 2 del dueño** (no mergear sin probarlo a mano) se cumplió y fue lo
que encontró el bug: ninguna de las métricas de arriba veía que "Contacto
extraterrestre" no mostrara nada. Eso pasó a ser el sexto criterio.

**Sobre la condición 1** (comparar contra la foto y no contra una corrida nueva):
se cumplió, y de paso quedó claro por qué la foto igual no es reproducible al
100%: TMDB reordena su catálogo todos los días. Corriendo el **código viejo** con
la semilla del 15/08 un día después, la base ya daba 90% del mismo conjunto pero
solo 31% en la misma posición. Eso es la deriva, no una rotura. Por eso el
informe reporta *posición* y *conjunto* por separado, y por eso quedaron tres
chips de control en el camino viejo (`navidad`, `reales`, `supervivencia`): si
alguno se moviera, el cambio estaría tocando lo que no debe. Detalle en
`docs/MANTENIMIENTO.md` 8.c.

### Cómo volver a probarlo a mano

```bash
npm run dev
```

Sin `next build` en paralelo (corrompe `.next`; si pasa, borrar la carpeta).
Después, en el Home:

1. **"6 para hoy"** — tocar "Mostrame otras" diez o doce veces seguidas y ver que
   no se repita nada y que lo que sale siga siendo mirable.
2. **"Mágica navidad"** — es el chip que no se tocó: tiene que traer películas de
   navidad, igual que antes.
3. **"Historias reales" y "Supervivencia extrema"** — tampoco se tocaron.
4. **El resto de los chips** — acá sí cambia el contenido, y es el punto a
   juzgar: el eje rota por día, así que un día "Palomitas" sale por taquilla y
   otro por estrenos. Vale la pena mirarlo más de un día.
5. **"Contacto extraterrestre", "Odisea espacial" y "Fuego cruzado"** — son los
   tres chips angostos que se vaciaban en un día de `hondo`. Los días en que
   caen se ven en la consola del server: `[ejes] ... se cae a "pop"`.
6. **El mensaje de lista vacía** — "Activá alguna" ahora aparece solo si no hay
   ninguna plataforma elegida. Se comprueba vaciando `sc:platforms` en el
   almacenamiento local del navegador y recargando.

Para ver un día distinto sin esperar, `YUMP_FECHA=2026-08-20 npm run dev`.

Si algo se ve mal y hay que descartar que sea esto: `HERO_ANCHO=0 npm run dev`
devuelve el hero al camino viejo sin tocar código.

---

## Rieles de género con rotación de ejes — **cerrado, con una falla ACEPTADA**

Rama `feat/ejes-rieles-genero` (`1912f56`). Cierra el paso 3: era la última
superficie del Home que pedía siempre popularidad páginas 1-3.

| Criterio | Resultado |
|---|---|
| Cobertura semanal ≥ hoy | ✅ 5 de 6 suben; `scifi/tv` plano (22 títulos en total, issue #10) |
| Solapamiento día a día baja | ✅ 13%→2%, 10%→3%, 12%→5%, 9%→2%, 19%→2% |
| Piso de 15 ítems por riel | ✅ mínimo 20/día (19 un día en scifi/series) |
| Ningún riel vacío en 7 días, películas y series | ✅ 0 vacíos en los tres bloques |
| Kill switch | ✅ `EJES_RIELES=0` (se usó para medir todo el "antes") |
| TMDB en frío en día de `hondo`/`nuevo` | ✅ +9 pools, sin diferencia de tiempo |
| **Calidad: no empeorar el % bajo 6.0 por riel** | ❌ **FALLA, aceptada** (ver abajo) |

Cobertura (base): accion 99→**120**, terror 102→**126**, drama 96→**121**,
comedia 98→**120**, documental 72→**110**, scifi 22→22.

### El criterio de calidad FALLÓ y se aceptó igual — no pasó

Promediado sobre los 7 días, estado base:

| riel | <6.0 antes→después | <5.0 antes→después |
|---|---|---|
| comedia | 4% → **12%** | 0% → 1% |
| terror | 24% → **31%** | 1% → 2% |
| accion | 4% → **8%** | 0% → 1% |
| drama | 0% → **1%** | 0% → 1% |
| documental | 5% → 3% | 4% → 2% |
| scifi | 5% → 5% | 0% → 0% |

**NO ESTÁ CUMPLIDO. Se aceptó como falla, no como cumplido.** Si alguien lee
esto en seis meses: este criterio no pasó. Se mergeó de todas formas, y el
motivo está abajo.

**Por qué se aceptó.** El dueño probó a mano los dos peores días (17/08 en
terror con `hondo`, 21/08 en comedia con `taquilla`) y miró los títulos que
entran, no los porcentajes. Son secuelas de terror de los 2000 y comedias de
Eddie Murphy: **cine popular con nota tibia, que cae en la franja de 5 a 6 y que
forma parte de la variedad que el producto busca.** El veredicto fue sobre el
contenido, que es lo que ningún porcentaje contesta.

**Por qué aceptarlo NO sería acomodar la vara.** El umbral de 5.0 se pidió
**antes** de ver estos resultados, porque el dueño no confiaba en el 6.0 como
línea (el puntaje de TMDB está sesgado por popularidad e idioma). La
reinterpretación quedó registrada de antemano, y esa es exactamente la
diferencia con mover el arco después del tiro: el criterio secundario existía
antes del disparo, no se inventó para justificar el resultado. Lo que el 5.0
dice es que lo que entra son títulos de 5 a 6 —el catálogo abriéndose hacia el
medio, que es la variedad buscada— y no cine malo.

**Si de la prueba a mano sale que hay que ajustar algo, se ajusta QUÉ ejes rotan
y con qué frecuencia** —que `nuevo` o `hondo` pesen menos, que no le toquen al
mismo riel dos días seguidos—, **nunca agregando un piso de nota. Ninguna
película se saca del Home por su puntaje.** Está escrito como principio en
`CLAUDE.md`, en el comentario de `discover()` y en el issue #12.

### Cómo volver a mirar el peor caso

Mergeado el 17/08. Los dos días de abajo son los que más títulos de 5 a 6 meten
en cada riel: sirven para volver a juzgar la composición si alguna vez se duda
de la decisión.

```bash
npm run dev
```

Sin `next build` en paralelo (corrompe `.next`; si pasa, borrar la carpeta).

**Los dos peores días, para no probar uno que salga lindo de casualidad.** Son
los que más títulos de 5 a 6 meten en cada riel:

```bash
YUMP_FECHA=2026-08-17 npm run dev
```

Terror, eje `hondo`: **7 de 20 entre 5 y 6** (y 2 bajo 5). Lo que entra:
El Halloween de Hubie (5.9), Mr. Crocket (5.2), Sé lo que hicisteis el último
verano (5.6), El caimán humano (5.6), Cuarentena terminal (5.7), Pesadilla en
Elm Street: El origen (5.5), La clásica historia de terror (5.8).

```bash
YUMP_FECHA=2026-08-21 npm run dev
```

Comedia, eje `taquilla`: **5 de 20 entre 5 y 6** (0 bajo 5). Lo que entra:
Into the Woods (5.8), El profesor chiflado II (5.0), El profesor chiflado (5.6),
Separados (5.9), Abuelos al poder (5.9).

Qué más mirar:

1. **Los seis rieles llenan 20** en los dos días, en Películas y en Series.
2. **El toggle Películas/Series** de cada riel: el lado de series es donde
   `scifi` y `terror` se quedaban en cero antes del guard.
3. **La consola del server**: `[home] EJES` dice qué eje le tocó a cada riel, con
   asterisco (`pop*`) cuando saltó el guard; `[home] VUELTAS` dice cuánto pagó
   cada uno.
4. **`scifi` en Series** va a verse casi igual todos los días: tiene 22 títulos
   en total y no hay rotación posible (issue #10).

Para volver al camino viejo y comparar en la misma pantalla:
`EJES_RIELES=0 npm run dev`.

---

## Lo que queda por hacer

- **`home:v2`** — evaluar si el payload compuesto sigue teniendo sentido, ahora
  sí con los números del hero puestos.
- **Pipeline de escrituras a Upstash** — baja round-trips, no comandos. Poco
  retorno; el rearmado en frío es el caso raro.
- Los diez issues de `docs/ISSUES.md`.

---

## Issues abiertos (`docs/ISSUES.md`)

| # | Qué |
|---|---|
| #1 | Lighthouse Performance 61 en móvil |
| #2 | `--faint` no cumple contraste AA |
| #3 | Caminos de red sin ejercitar en la PWA |
| #4 | Fechas en UTC: `porEstrenar`, `today()`, el sync |
| #5 | ¿"Próximamente" muestra estreno en cine o llegada a streaming? |
| #6 | "Próximamente" mezcla estrenos con episodios semanales |
| #7 | `upcoming_content`: las filas existentes se quedan viejas |
| #8 | `upcoming_content`: sesgo permanente hacia lo popular |
| #9 | La popularidad es el orden por defecto en toda la app |
| #10 | La rotación de ejes no le llega a los chips angostos (18 de 112 casillas caen a `pop`) |
| #11 | "Últimos lanzamientos" tiene 35% de títulos bajo 6.0 |
| #12 | **El piso de 60 votos de `discover()` excluye cine regional en toda la app** |

---

## Cosas que cuestan tiempo si no se saben

**El tope de vueltas está calibrado para el eje más fácil de llenar.** Un día de
`hondo` termina con 21 tarjetas y uno de `pop` con 39, y la conclusión obvia
—que `hondo` es caro— es al revés: gastó 407 enriquecidos contra 434. Le sobró
presupuesto sin usar. Está documentado junto a `MAX_VUELTAS` en `lib/home.ts`.
**Cuando se toquen los rieles de género, ese número se revisa con ese dato.**

**Que dos cosas que deberían diferir den lo mismo es una alarma.** Documentado en
`MANTENIMIENTO.md` 8.b. Así se encontró el kill switch roto del pool cache.

**`upcoming_content` no es la agenda de estrenos**: es lo que estaba en el top 60
de popularidad el día en que se escribió cada fila. `MANTENIMIENTO.md` 5.b.

**El pool de una plataforma no es único**: hay una variante por configuración de
filtros, porque `withoutGenres` depende del conjunto completo de plataformas.
Documentado en `lib/pools.ts`.

**Interruptores de emergencia**: `POOL_CACHE=0` vuelve al camino viejo completo
de discover; `CACHE_BATCH=0` vuelve al GET por clave.

**`next build` con `next dev` corriendo corrompe `.next`.** Matar el dev antes.

---

## Sin trackear, de otra línea de trabajo

`prompts/noticias-filtro.md`, `prompts/noticias-redaccion.md` y
`supabase/migrations/004_news.sql`. Estaban al empezar la sesión y no se
tocaron. Si `004_news.sql` está aplicado en producción, debería versionarse por
el mismo motivo que el resto del pipeline.
