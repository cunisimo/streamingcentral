# Estado de Yump

> Documento de traspaso. Se actualiza al cerrar una sesión de trabajo larga.
> **Última actualización: 23 de agosto de 2026.**

`CLAUDE.md` se carga solo en cada conversación y ya contiene las decisiones de
arquitectura, las limitaciones de TMDB y las reglas de cada feature. **Este
archivo no las repite**: acá va el estado del momento y lo que queda pendiente.

---

## Estado de despliegue

```
origin/main               361cf5b   ← Merge feat/idioma-tanda-2, DESPLEGADO en producción
feat/idioma-tanda-2       2d9e970   ← mergeada; la rama sobrevive pero ya no sirve (ver abajo)
feat/ejes-rieles-genero   1912f56   ← pusheada como respaldo, SIN mergear
```

**Este bloque se actualiza en el mismo commit que mueve `main`.** Quedó tres
semanas diciendo `ab4e189` mientras `main` iba por `5fc0c2e`, y un SHA viejo acá
es peor que ninguno: se lee como "esto es lo que hay desplegado".

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
  **Corregido el 18/08**: esa frase era falsa para DOS rieles. `useTrackScroll`
  vivía solo dentro de `Shelf`, y "6 para hoy" y "Próximamente" tienen su propio
  `.track` sin pasar por ahí — los dos volvían al principio. Ya están
  conectados, y el hero además recuerda el chip y la tanda: volver de una ficha
  te devuelve al mismo conjunto, no solo a la misma posición sobre otro
  contenido.
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

## Eliminar cuenta (Apple / Google Play)

`Cuenta → Configuración → Zona de riesgo → Eliminar cuenta`.

**Qué elimina.** Una sola operación —`admin.deleteUser(id, false)`— y todo lo
demás cae por CASCADE. Verificado contra la base real con una cuenta
descartable el 22/08: antes 1 perfil, 3 votos, 3 `user_items` (los tres kinds),
3 en historial, 1 reseña, 1 identidad y 3 sesiones; después, 0 en todas.

| Dato | Tabla | Cómo se borra |
|---|---|---|
| Cuenta, email, hash de contraseña | `auth.users` | `admin.deleteUser` |
| Identidades, sesiones, tokens, MFA, WebAuthn, OAuth | `auth.*` (8 tablas) | CASCADE |
| Nombre, avatar, país, plataformas | `profiles` | CASCADE |
| Votos | `votes` | CASCADE |
| Mi lista, Ya la vi, descartes | `user_items` | CASCADE |
| Reseñas de usuario | `user_reviews` | CASCADE |
| Historial de fichas | `view_history` | CASCADE |

**Storage no participa**: el proyecto tiene 0 buckets y 0 objetos — los avatares
son DiceBear generados desde `avatar_seed`. Si algún día se suben archivos, el
lugar donde agregar su borrado es `lib/eliminar-cuenta.ts`.

**En el dispositivo** se borra el estado personal (`yump:ruleta-mostrados`,
`yump:hero-estado`, `yump:lista-paginada`, `yump:lista-vuelta`,
`yump:track-scroll`, y la sesión `sb-*-auth-token`) y **se conservan** las
preferencias: `sc:platforms` y su cookie, `sc:theme`, `sc:pais`, `sc:visits`,
`yump:shelf-type`. La persona sigue usando Yump como invitada sin reconfigurar
nada. El reparto vive en `lib/limpieza-local.ts`, que es puro y tiene tests.

**En Upstash no queda nada personal**: ninguna clave de cache lleva un id de
usuario. La única derivada es la del riel personalizado, que es un hash de las
señales — no identifica a nadie y expira sola en 6 h.

**Sin `SUPABASE_SERVICE_ROLE_KEY` el endpoint responde 503 `no-disponible` y NO
comprueba ninguna contraseña.** No es un detalle de robustez: validarla antes
convertía la falta de configuración en un oráculo —contraseña incorrecta 401,
correcta 500— que responde "¿esta clave es la buena?" a cualquiera con un token,
que es justo lo que la revalidación viene a impedir. Ese pedido tampoco suma al
límite de intentos, porque no se comprobó ninguna contraseña.

**Seguridad.** La identidad sale SOLO del token (`sesionDeToken`); el cuerpo del
pedido lleva únicamente la contraseña, así que no hay ningún campo del cliente
que pueda cambiar a quién se borra. La contraseña se revalida con un cliente
Supabase aislado por pedido (`persistSession`, `autoRefreshToken` y
`detectSessionInUrl` en false) y su sesión se cierra al terminar. Límite de 5
intentos fallidos por usuario cada 15 minutos. La ruta es `force-dynamic` con
`Cache-Control: no-store` en TODAS las respuestas, y no registra cuerpo, token,
email ni contraseña.

**El orden es el punto delicado**: primero el servidor; recién con un 200 se
cierra la sesión y se limpia el dispositivo. Si falla, la cuenta y la sesión
quedan intactas y se muestra el motivo.

### Pendiente para Google Play

Falta la **página pública `/eliminar-cuenta`**, accesible sin la app, que Google
exige enlazar desde la ficha de Play. El mecanismo del servidor ya está listo
para reutilizarse: depende solo de un token válido, así que esa página solo
tiene que pedir email y contraseña, iniciar sesión y llamar al mismo endpoint.
No hace falta tocar `lib/eliminar-cuenta.ts` ni la ruta.

También falta declarar en Play qué datos se recogen y cuáles se borran; la tabla
de arriba es la fuente para ese formulario.

---

## Tanda 3 del idioma: implementada y ENSAYADA, sin desplegar

Rama `feat/idioma-tanda-3`, sin mergear. **Producción intacta**: el cron sigue
corriendo, la Edge Function sigue en es-ES, no se tocaron secrets y
`public.upcoming_content` no se escribió ni una vez.

### Qué hay

| Pieza | Estado |
|---|---|
| `supabase/functions/_shared/idioma-nucleo.ts` | núcleo compartido por la app, la Edge Function y el backfill |
| Edge Function con idioma por entorno + fallback | escrita, **no desplegada** |
| `006_backfill_upcoming_idioma.sql` | **aplicada** en la base |
| `scripts/backfill-upcoming-idioma.mjs` | escrito y ensayado |
| Tests | 365 |

### El ensayo integral, cerrado el 2026-08-24

Sobre un espejo `ensayo.upcoming_content` creado con `LIKE ... INCLUDING ALL`,
en un esquema **no expuesto** en PostgREST, con dos títulos REALES de TMDB que no
están en la tabla (`movie:278` y `tv:1399`) para ejercitar el camino de películas
—que producción no puede probar, porque hoy las 43 filas son todas series—.

| Etapa | Resultado |
|---|---|
| Sembrar + dry-run | 45 filas, 40 cambian, 58 campos, 181 llamadas a TMDB |
| Episodio por coordenadas | **verificado**: se pidió `/tv/1399/season/1/episode/1` en los dos idiomas |
| Aplicar desde el snapshot | 40 filas, verificado con `===` contra `después` |
| Restaurar | 40 filas, verificado con `===` contra `antes` |
| `--fallar-en` | abortó con `23502 not-null`, **0 campos cambiados**, tres veces |
| `public.upcoming_content` | `sha256 492993ee122c0bd5` antes y después: **0 campos distintos** |
| Limpieza | esquema 0, tablas 0, funciones `ensayo_*` 0, `backfill_upcoming_idioma` 1 |

**El `23502` es la prueba de que el espejo conservó el `NOT NULL`.** Con
`CREATE TABLE AS SELECT` no habría constraint que violar y el ensayo habría dado
verde sin probar nada.

**Dos bugs los encontró el ensayo, no la revisión de código:**

1. `ensayo_leer()` no devolvía las coordenadas del episodio, así que los títulos
   sintéticos —los únicos que no están en la tabla real— caían en el camino del
   404 y el episodio exacto nunca se ejercitaba.
2. El script salía con **127** en vez de 1: en Windows, `process.exit()` con
   stdout en vuelo tumba a libuv. Un script que avisa "esto falló" no puede
   comunicarlo con un crash.

### Lo que falta, en orden, y necesita aprobación

1. Pausar el cron (`update cron.job set active = false where jobname = 'tmdb-sync-upcoming-daily'`).
2. Desplegar la Edge Function **inerte** (su default sigue siendo es-ES).
3. `supabase secrets set IDIOMA_TITULOS=es-MX` y **una** corrida manual del sync.
4. Dry-run sobre la tabla real → snapshot → revisarlo.
5. `--aplicar --desde-plan=<ese snapshot>`.
6. Verificar `/proximamente` contra la ficha del mismo título.
7. Reactivar el cron.

**El orden importa**: si el backfill fuera antes del sync, la próxima corrida en
es-ES pisaría lo reparado. Y entre el paso 3 y el 5 el cron tiene que estar
pausado, o el bloqueo optimista de la RPC va a abortar el backfill — que es lo
que tiene que hacer, pero mejor no llegar ahí.

---

## Tanda 2 del idioma: EN PRODUCCIÓN

**Activada el 2026-08-24.** `main` = `361cf5b` (`Merge feat/idioma-tanda-2`),
desplegado, con `IDIOMA_TITULOS=es-MX` en el scope **Production** únicamente.

Evidencia del cierre, leída de producción y no del banco:

| Qué | Resultado |
|---|---|
| Commit desplegado | `361cf5b`, rama `main` |
| `/api/health` | **200**, `cache: redis`, ping OK |
| Claves del Home | **siete**, todas `home:es-MX+f.r1:v5:…` — una por combinación |
| Precalentamiento | **7/7**, 12 rieles cada una, ninguna degradada, salida 0 |
| Segunda vuelta | las siete desde caché (354-501 ms) |
| Fallos de respaldo | **0** acumulados sobre 16 requests de Home |
| Errores 5xx | **0** |
| Claves en Upstash | 1.593 → **2.378** |

**El arranque en frío fue PARCIAL, y eso es el diseño funcionando**: el primer
`MISS` registró `401 hit / 236 miss` de 637 claves. Las familias que **no**
llevan huella —`pv:`, `videos:`, `genre:covers:`, `blocklist:`— seguían
calientes de la etapa `es-ES` y no se invalidaron. Solo se rearmó lo localizado.

**Rollback**: `IDIOMA_TITULOS=es-ES` + un deployment nuevo del **mismo** `main`.
Nunca revertir el código: el código sin huella con la variable en `es-MX` es la
combinación que envenena las claves de `es-ES`.

### La rama `feat/idioma-tanda-2` quedó viva y ya no es segura

Sigue en el remoto, pero **sus seis variables de aislamiento se borraron** (paso
final del runbook). Con `IDIOMA_TITULOS` solo en Production, un push nuevo a esa
rama arma un Preview que **comparte el Redis de producción** y corre `es-ES` con
huella: escribiría un espacio `es-ES.r1` entero contra la cuota de producción,
para nada. Si no se va a usar más, borrarla.

---

## Cómo llegó acá (histórico de la tanda 2)

**Un solo cambio de código**: los once call sites pasaban `HUELLA_EN_CLAVES` —la
cadena vacía del modo compatible de la tanda 1— y ahora pasan `HUELLA_IDIOMA`.
Con eso la clave depende de la configuración: `card:es-MX+f.r1:movie:278` en vez
de `card:movie:278`. Las once familias juntas, que es lo que provoca **un** solo
arranque frío en vez de once, y evita un Home mitad es-MX y mitad es-ES mientras
durara el escalonamiento.

`HUELLA_EN_CLAVES` se **eliminó** en vez de repuntarse: mientras existiera, un
call site nuevo podía quedarse en modo compatible sin que nada lo notara, y el
síntoma no es un error sino títulos mezclados. En su lugar hay un barrido nuevo
(`lib/claves.test.ts`) que exige `HUELLA_IDIOMA` en **todas** las llamadas a un
constructor y fija el total en 11. Visto en rojo inyectando `""` en `lib/top.ts`.

El idioma base, el fallback, `ayudaOriginal` y la consulta verificada ya estaban
implementados y probados desde la tanda 1: **se encienden con la variable, sin
tocar código.**

### Medición, contra una línea de base NUEVA

Los 612 / 655 del informe de la tanda 1 son **referencia histórica**: la tanda 1
movió esos números. Todo en `docs/medidas/2026-08-23-idioma-tanda2-e2e.json`.

| Home frío `n,d,m` | Base (es-ES) | Tanda 2 (es-MX+f) | Tope | |
|---|---|---|---|---|
| Llamadas a TMDB | 613 · 613 · 613 | 651 · 652 · 651 | ≤ 660 | ✅ |
| Comandos de Upstash | 656 · 656 · 656 | 656 · 658 · 656 | ≤ 670 | ✅ |
| Llamadas de respaldo | 0 | 39 = **37 páginas + 2 detalles** | ~32 páginas | ✅ |
| Payload | 84.413 B | 84.750 B | ≤ 85.000 B | ✅ |
| **Tiempo frío (pared)** | 8,07 · 7,69 · 7,90 s | 8,46 · 8,53 · 7,06 s | — | ✅ |
| **Tiempo frío (composer)** | 5.895 · 5.518 · 5.747 ms | 6.079 · 6.029 · 5.725 ms | — | ✅ |
| Home caliente | 1 comando, 0 TMDB | 1 comando, 0 TMDB | igual | ✅ |
| `degradado` / `fallos` | false / 0 | false / 0 | | ✅ |
| Títulos por riel | 20·40·30·20×6·20·39·39 | **idénticos** | idénticos | ✅ |

**Las dos variantes se midieron alternadas en la misma ventana**, tres corridas
cada una. Es la corrección más importante de esta revisión: la primera comparó
dos ventanas separadas por hora y media y le atribuyó al idioma lo que era
deriva del catálogo de TMDB.

**Corrección importante sobre la primera revisión de esta medición.** Se publicó
que el idioma cambiaba las cantidades por riel (family 40→39, adult-anime 38→39)
y que "casi todos los rieles difieren". **Las dos cosas eran deriva del catálogo,
no del idioma.** Medido en la misma ventana:

| Comparación | Rieles con contenido distinto |
|---|---|
| es-ES contra es-ES (control) | 0 de 12 |
| es-MX contra es-MX (control) | 0 de 12 |
| **es-ES contra es-MX** | **1 de 12** |

El único que se mueve es "Últimos lanzamientos": 19 de 20 títulos en la misma
posición, uno cambiado. Es el riel que ordena por fecha y sin piso de votos, así
que el borde entre entrar y no entrar es de horas. El hero es idéntico.

La causa de fondo sigue siendo real —**TMDB ordena `discover` por idioma**, 18 de
20 en la misma posición en la página 1— pero su efecto sobre el Home es de un
título en 314, no de un riel entero.

### El pico de 27 segundos: era TMDB, no el fallback

La primera medición tuvo una corrida de `es-MX` de 27,2 s en frío y quedó sin
explicar. Cuatro evidencias:

1. **`es-ES` también lo hace**: una corrida de `es-ES` dio 21,2 s de pared y
   17,5 s de composer, con **cero** llamadas de respaldo.
2. En la misma ventana, `es-ES` y `es-MX` dan **5.747 y 5.725 ms**: indistinguibles.
3. Aislado contra su propio control (`FALLBACK_IDIOMA=0`), el fallback cuesta
   **440 ms**, no 18 segundos.
4. **No es el compilado de `next dev`**: `/api/home` compila en 1,3-2,3 s en
   todas las corridas, incluidas las lentas.

**Lo que sí lo explica, demostrado:** se lanzó el script de medición (144
requests a 16 concurrentes) y encima un Home frío. **TMDB empezó a devolver 502**
en `/watch/providers` y el Home salió degradado. TMDB se degrada bajo
concurrencia: primero se pone lento, después falla. Las corridas lentas venían
justo después de ráfagas de medición.

De yapa, esa corrida degradada confirmó dos cosas del diseño **en vivo**: `safe`
degrada riel por riel en vez de tirar el Home entero, y `cachedIf` **no guarda**
un payload degradado.

**Regla: no medir tiempos con otra cosa pegándole a TMDB al mismo tiempo.** Los
conteos (llamadas, comandos, bytes, títulos) aguantan; los tiempos no.

### Ensayo de rollback

`IDIOMA_TITULOS=es-ES` devuelve **exactamente** la línea de base: mismas
llamadas, mismos comandos, mismo payload, los mismos 12 rieles, el mismo hero y
las 7 fichas de control idénticas.

**Lo que el rollback NO devuelve es el cache.** La huella pasa a `es-ES.r1`, que
no es el espacio vacío de la tanda 1: **volver atrás cuesta un segundo arranque
frío**. Es el precio de que el rollback sea inmediato en vez de esperar TTLs de
hasta 30 h.

### Qué mirar a mano (Preview)

1. `[home] MISS home:es-MX+f.r1:v5:…` en el primer request. Si dice `HIT`, la
   huella no llegó.
2. `movie:278` → "Sueño de fuga", y **ahora sí** aparece el respaldo original.
3. `movie:12535` → sigue la ayuda verificada de Disney+, **sin** duplicarla con
   el respaldo genérico.
4. `tv:1399` → "Game of Thrones"; `movie:585` → "Monsters, Inc.";
   `movie:1084242` → "Zootopia 2". El pasaje al inglés **no** se repara.
5. `/top` y `/personas`: las dos superficies de `top:pop:` y `people:popular:`,
   las claves menos obvias.
6. La ruleta: encabezado y cuerpo sin contradicción. Se esperan **cero**
   contradicciones conocidas.

### El Preview: aislado y desplegado

```
https://streamingcentral-git-feat-4b4d31-jfgalindez-gmailcoms-projects.vercel.app
```

**Producción sigue en `es-ES` y sus variables no se tocaron.**

**El plan decía "sacar `KV_*` del scope Preview" y eso no se puede hacer sin
romper producción.** La integración crea **una sola entrada por variable con los
dos targets** (`Production, Preview`), así que borrar "la de Preview" se lleva
puesta la de Production — y producción sin Redis rearma el Home entero en cada
request. Lo que se hizo en cambio: **variables de Preview acotadas a la rama**,
que conviven con la entrada compartida y la pisan solo ahí. Las cinco de Redis
en vacío (`lib/cache.ts` exige URL y token no vacíos) más `IDIOMA_TITULOS=es-MX`.
Procedimiento completo, con la trampa del orden, en `docs/MANTENIMIENTO.md`.

**Verificado, no asumido:** `GET /api/health` en el Preview devuelve **503** con
`cache: "memoria"`, `fuente: null` y las dos credenciales en `false`. Confirmado
también del lado del servidor en los logs de runtime (`environment: preview`,
`branch: feat/idioma-tanda-2`, `503`).

**Los Previews están detrás de Vercel SSO**, así que la verificación visual la
hace el dueño con su sesión; lo automatizable es `vercel logs --json`, que está
autenticado por CLI.

### Verificado EN EL PREVIEW, no solo en el banco

El arranque en frío real, leído de los logs de runtime de Vercel:

```
[home] MISS home:es-MX+f.r1:v5:3439782971:d,m,n,p:accion:movie,…
[idioma] fallback: 47 llamadas | 47 lotes con rotos | 85 títulos reparados | 0 fallos
[home] 7121ms total | cache 0ms | 682 comandos | 0 requests | 661 claves (18 hit / 643 miss)
```

| Qué | Evidencia |
|---|---|
| La huella entra en la clave | `home:es-MX+f.r1:v5:…` en el `MISS` **y** en el `HIT` |
| El payload se guarda y se sirve | `HIT` con **1 comando / 0 requests** |
| El respaldo no falla en Vercel | **`0 fallos`** sobre 47 llamadas y 85 títulos reparados |
| Nada roto en la navegación | 100 eventos, 49 rutas, **0 errores 5xx** |
| El aislamiento, por tercera vía | **682 comandos contados y `0 requests` reales**: se contabiliza el patrón de acceso pero no sale un solo round-trip a Upstash |

**Ese `MISS` es de `d,m,n,p` (cuatro plataformas), no de `n,d,m`**, porque la
forma de forzar un arranque en frío fue agregar Prime Video. Sus 682 comandos y
47 llamadas de respaldo **no se comparan** contra los topes de la tabla de
aceptación, que son de tres plataformas. Lo que sí vale de acá es lo que no
depende del tamaño: la huella en la clave, el `0 fallos` y el `0 requests`.

**Un detalle del log que confirma otra cosa, de paso**:
`[ejes] aud-family/tv: "hondo" trajo 1 (piso 24), se cae a "pop" con 69` — el
guard de ejes que no puede llenar, funcionando en producción real.

### Lo que falta, en orden

1. Borrar las seis variables de rama (comando en `MANTENIMIENTO.md`).
2. `IDIOMA_TITULOS=es-MX` en **Production**.
3. Redeploy de producción (editar la variable **no** toca ningún deployment
   existente).
4. `scripts/precalentar-home.mjs --base=… --aplicar`, con las combinaciones que
   decida el dueño.

### Archivos ajenos, sin registrar y a propósito

Estos **cuatro** son del dueño, son **preexistentes** y **no** pertenecen a
ninguna rama de idioma:

| Archivo | Cómo está protegido |
|---|---|
| `prompts/noticias-filtro.md` | aparece como `??`; hay que no agregarlo a mano |
| `prompts/noticias-redaccion.md` | ídem |
| `supabase/migrations/004_news.sql` | ídem |
| `.claude/settings.local.json` | **`.gitignore` del repo** |

**El cuarto faltaba en esta lista y estaba peor protegido que los otros tres.**
`git status` no lo mostraba, y eso no era porque estuviera a salvo: lo tapaba el
ignore GLOBAL de esta máquina (`~/.config/git/ignore`). En cualquier otro clon,
un `git add -A` lo habría incluido — y es configuración de permisos, no del
proyecto. Ahora está en el `.gitignore` del repo, así que la protección viaja
con él. `.claude/settings.json` y `.claude/launch.json` **sí** se versionan: esa
es la parte compartida.

La tabla `news_items` ya está aplicada en la base, pero su migración sigue sin
versionar — es una decisión pendiente del dueño, no un olvido.

**Al preparar commits, agregar rutas explícitas y nunca `git add -A`**: fue así
como se colaron en un commit de esta rama, y hubo que sacarlos con
`git rm --cached` (que no toca la copia de trabajo).
