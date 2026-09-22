# Salas compartidas — Etapa 4: resultados, animaciones y otra tanda

Plan: [`superpowers/plans/2026-09-17-salas-compartidas.md`](../superpowers/plans/2026-09-17-salas-compartidas.md), Tareas 4.1 y 4.2.
Rama `feat/salas`, commits `cf60bc6` (construcción) y `be5a4e3` + el de cierre (correcciones del dueño y verificación). **Nada en Producción; sin deploy, merge ni
push.** Autorizada por el dueño el 20/09 tras la aprobación técnica de la Etapa 3.

## Qué hay

- `components/sala/ResultadoMatch.tsx` — "¡Hay match!" para `match` (dos
  personas) y `ganador` (grupos: la más votada, "nuestro match"). Dos mitades de
  corazón que se juntan (`sala-mitad-izq/der`) + el confeti de "Desempatá",
  la película elegida (`Ganadora`: póster, identidad, plataformas con las de la
  sala destacadas, "Por qué verla"), `CompartirMatch` y "Ver la ficha". Exporta
  `PieResultado`: la ventana de 5 min y, si la base dice `puede_otra_tanda`,
  `ConfigTanda` + "Otra tanda".
- `components/sala/ResultadoEmpate.tsx` — dos fases dictadas por
  `estado.resultado`: sin resolver, las cards empatadas entran (`sala-entra`),
  corre el contador y **sólo quien tiene `puede_desempatar`** ve "Desempatar"
  (`rpc sala_desempatar`; los demás "Esperando a que <organizador> desempate");
  resuelto (`desempatado: true`), la rueda de "Desempatá" gira y **se detiene en
  `ganador_pos` ya guardado** (no elige nada), y al frenar muestra la elegida y
  el pie. Con el empate sin resolver no hay "Otra tanda": `puede_otra_tanda` es
  false en la base y la API responde 409 `estado`.
- `components/sala/ResultadoSinCoincidencias.tsx` — "Esta vez no coincidieron",
  cards que se separan suavemente (`sala-separa`), sin corazón roto, pie común.
- `components/sala/CompartirMatch.tsx` — reusa `mensajeCompartir` de
  `lib/compartir.ts` (url canónica, plataforma en el texto), `navigator.share` o
  WhatsApp. **El mensaje propio del match es la Etapa 5**: acá no se inventó
  texto.
- `components/sala/PrepararTanda.tsx` — `ConfigTanda` + `POST /api/sala/preparar`
  extraído de `Lobby`; lo usan "Empezar" (lobby) y "Otra tanda" (resultados).
- `SalaView` — un componente de resultado por ronda (`key = ronda.id`) elegido
  por `resultado.tipo`; la rueda y las animaciones corren una vez por tanda, no
  por relectura. `vencida` → pantalla terminal.
- `components/desempate/Wheel.tsx` — acepta `{ poster, title }` (`TileRueda`)
  para reusarse con las cards congeladas de `room_titles`.
- `app/globals.css` — todas las animaciones nuevas dentro de
  `@media (prefers-reduced-motion: no-preference)`; con `reduce`, estado final
  sin transición (la rueda ya dura 300 ms en ese caso, y `Confetti` no se dibuja).
- `components/sala/sin-computo-cliente.test.ts` — barrido textual: falla si un
  componente de sala lee `mis_votos`/`room_votes`, filtra o compara por `"yes"`,
  o calcula el resultado; fija que las pantallas leen `resultado.tipo`,
  `ganador_pos`, `empatadas`, `desempatado`, `puede_desempatar` y
  `puede_otra_tanda` de la RPC. Un caso EN ROJO comprueba que el barrido detecta
  las formas típicas de contar síes.

**Textos** (del plan, no de marca): "¡Hay match!", "¡Tenemos empate!",
"Esta vez no coincidieron", "Desempatando…", "nuestro match".

**La entrada del Home**: sigue inmediatamente debajo de Ruleta Yump, es un
`Link` a `/sala/nueva` **en la misma pestaña** (como el "Ver todas" de los
rieles; nada se despliega ni corre en el Home). Desde el 22/09 se llama
**Pelimatch**.

## Correcciones del dueño (21/09, `be5a4e3`)

1. **Celebración del match a pantalla completa** (`CelebracionMatch`): overlay
   `position: fixed; inset: 0` por encima de la barra inferior, corazón grande
   (~46 % del ancho; geometría clásica de dos lóbulos en porcentajes, compartida
   con la versión chica), "¡Hay match!", póster, nombre y confeti; ~3,3 s con
   fundido, o antes con "Seguir" / Escape / Enter / un toque; bloquea el scroll
   de atrás. Debajo ya está la pantalla de resultado completa. Con
   `prefers-reduced-motion: reduce` no se monta (`permiteCelebracion()`) y el
   resultado queda en su estado final.
2. **Relectura tras éxito** (`lib/sala/acciones-host.ts`, 6 tests): `pedirTanda`
   y `desempatar` releen el estado en el acto tras un 2xx / RPC ok; quien tocó no
   depende de recibir su propio aviso por Realtime. Un fallo de la relectura no
   convierte el éxito en error; con 4xx/5xx o error de RPC no se relee.
3. **"Ver la ficha"** para la ganadora en el empate resuelto.
4. Pequeño ajuste hallado en la verificación: los pósters de "no coincidieron"
   se encogen en 375 px en vez de desbordar.

## Segunda ronda del dueño (22/09, `231c9be`)

1. **Nombre visible: Pelimatch.** Las dos entradas —la del Home, debajo de
   Ruleta Yump, y la del hub de la cuenta (`components/sala/PelimatchTile.tsx`)—
   dicen "Pelimatch". **La bajada sigue siendo provisoria** (no se inventó
   ninguna) y **las rutas técnicas no cambiaron**: `/sala/nueva`, `/sala/[id]`,
   `/api/sala/*`. `components/sala/entrada-pelimatch.test.ts` (4 tests) fija el
   nombre, las rutas, que la entrada sea un link debajo de la ruleta y que el
   target no esté escrito a mano.
2. **Botones de voto siempre a mano** (era el hallazgo de la ronda anterior).
   `.sala-votos` es ahora una **barra fija** sobre la barra inferior: fondo del
   tema, borde superior y un degradado para que el texto se desvanezca al entrar
   debajo en vez de cortarse seco; `z-index` 30, debajo del 35 de la nav, así que
   nunca la tapa. `.sala-votacion` **reserva el alto de la barra**, de modo que
   ningún texto queda inalcanzable. En pantallas de menos de 700 px de alto los
   botones se compactan **sin bajar de 64 px** de área táctil (ver la tercera ronda).
3. **Apertura en pestaña nueva** — ⛔ **REVERTIDO el 22/09** (ver la tercera
   ronda): había sido una lectura equivocada de "otra pantalla". Pelimatch
   navega en la MISMA pestaña.
4. **Reintentos acotados de la relectura.** Si la relectura inmediata tras
   "Empezar" / "Desempatar" falla, el respaldo de `useSala` no alcanza: **sólo
   corre mientras el canal NO está `SUBSCRIBED`**, así que con el canal conectado
   y el aviso perdido la pantalla del que tocó se quedaba quieta. Ahora
   `asegurarRelectura` reintenta con esperas **0,8 s + 2 s + 5 s y abandona**
   (`ESPERAS_RELECTURA`). No es polling: la cadena termina sola, no se reprograma
   y la respuesta al botón no la espera (test con espera bloqueante que lo
   demuestra). 4 tests nuevos; 10 en `acciones-host`.

### Verificación de esta ronda

| Qué | Resultado |
|---|---|
| Mock con el CSS real a **360×640** y **320×568**, card con "Por qué verla" y "Pero" largos | ✅ barra fija visible, texto que se desvanece bajo ella, sin solapar la nav (barra 400–495, nav 495) |
| App real a 360×640, ronda de 10 con textos largos | ✅ barra `fixed` pegada a la nav sin solaparla (barra 486–567, navTop 567), los tres botones visibles, al final del scroll la última línea NO queda tapada, y el voto manual desde la barra avanza 3 → 4 |
| Entrada del Home en la app | ✅ dice "Pelimatch" y va inmediatamente después del bloque de la ruleta |

## Tercera ronda del dueño (22/09, `38d5b64`)

1. **Misma pestaña, no pestaña nueva.** Entendí al revés "otra pantalla": el
   pedido es que Pelimatch navegue a `/sala/nueva` como el "Ver todas" de los
   rieles. Se borró `lib/sala/apertura.ts` y su test, y las dos entradas
   volvieron a ser un `Link` común — sin `target`, sin ventana flotante, sin
   lógica de standalone. El guard ahora exige lo contrario de lo que exigía: que
   no haya `target=`, ni `window.open`, ni módulo de apertura.
2. **El reintento de la relectura no funcionaba con el cableado real.**
   Diagnóstico del dueño, exacto: `useSala.releer()` llamaba a
   `sala-lector.leer()`, que **atrapaba el error de la RPC, lo avisaba por
   `alError` y no devolvía nada**; `asegurarRelectura` veía una promesa resuelta,
   daba la lectura por buena y la cadena NUNCA arrancaba. Corregido el contrato:
   `leer()` devuelve `ResultadoLectura` —`aplicada` | `descartada` | `fallo` |
   `invalida` | `omitida`— y `releerDe(lector)`, que es lo que usa
   `useSala.releer`, **rechaza sólo con `fallo`**: una lectura descartada por la
   compuerta (hay otra más nueva), un token inválido o un lector terminal no son
   cosas que reintentar.
3. **Área táctil de 64 px** en la barra compacta (&lt;700 px de alto): No y Paso
   vuelven a 64 y Sí queda en 70; antes bajaban a 54/54/62. Lo que se compacta es
   el aire (separación y padding), no el área de toque.

### Verificación de esta ronda

| Qué | Resultado |
|---|---|
| `lib/sala/relectura-cableada.test.ts` — recorrido completo con el lector REAL y una RPC que devuelve error | ✅ 6 tests: la cadena arranca y reintenta 0,8 s + 2 s + 5 s y abandona (4 lecturas, ninguna más); si la RPC se recupera, el reintento **aplica el estado**; con la RPC sana no hay cadena ni esperas; un caso **EN ROJO** reproduce el contrato viejo (una sola lectura, sin cadena) y otro fija el cableado de `useSala` |
| `sala-lector`: los cinco resultados de `leer()` y `releerDe` | ✅ 2 tests nuevos (7 en el archivo) |
| Entrada del Home en la app | ✅ "Pelimatch", `href="/cuenta"` sin sesión, **sin `target` ni `rel`** |
| Barra de voto a 320×568 (mock con el CSS real) y a 360×640 (app) | ✅ **64 / 64 / 70 px** en los dos, sin solapar la nav y sin texto tapado al final del scroll |

## Cuarta ronda del dueño (22/09, `22aec59`) — la carrera de la relectura

**Reproducida primero, con el lector real y sin tocar código:**

1. "Empezar" / "Desempatar" arranca su lectura de `sala_estado` y queda pendiente.
2. Entra una segunda lectura (aviso de Realtime) y **falla**.
3. Vuelve la primera con un estado válido y **la compuerta la descarta** por ser
   anterior.

Medido: el log del lector quedaba en `["error Failed to fetch", "cargado"]` —o
sea, **ninguna lectura aplicó el estado nuevo**— y el `releer()` de la acción
**resolvía igual**, así que la cadena de reintentos no arrancaba. El agujero era
real.

**Corrección del contrato, conservando la protección contra estados viejos:**

- `crearLector` cuenta cuántas lecturas APLICARON estado. Al descartar una,
  distingue: **`descartada`** (otra aplicó, o la sala quedó terminal → nada que
  reintentar) y **`descartada-sin-estado`** (nadie aplicó → cuenta como fallo).
- `releerDe` rechaza con `fallo` **y** con `descartada-sin-estado`.
- La compuerta no cambió: la lectura vieja se sigue descartando y su estado **no**
  se aplica encima del nuevo.

| Prueba | Resultado |
|---|---|
| La carrera exacta con el lector REAL + `pedirTanda` | ✅ la cadena arranca, reintenta 0,8 s + 2 s + 5 s y abandona |
| Caso normal: la lectura que gana SÍ aplica estado y la vieja llega tarde | ✅ **ni una solicitud extra**, sin cadena, y el estado viejo no se aplica encima |
| Descartada con la sala ya terminal (token inválido en la que ganó) | ✅ no reintenta |
| Los dos descartes distinguidos en `sala-lector` (gana-aplica vs gana-falla, y la variante con excepción de red) | ✅ |
| `releerDe` sobre los seis resultados | ✅ rechaza sólo `fallo` y `descartada-sin-estado` |

## Texto visible definitivo (22/09, `4e02ba6`)

El dueño definió el copy de la entrada; se aplicó **literal** en las dos, y
`entrada-pelimatch.test.ts` lo fija pieza por pieza:

| | |
|---|---|
| Emoji | 🍿 |
| Nombre | Pelimatch |
| Bajada | "Cada uno vota en su teléfono. Sale una sola película." |
| Botón | "Matcheá" |

El hub ya no dice la provisoria "Elegir entre varios". La navegación no cambió:
`Link` a `/sala/nueva`, misma pestaña, pantalla propia.

**Dos ajustes de CSS que hizo falta hacer** (no de copy):

- 🔴 `.dsmp-banner-sub` estaba **oculta abajo de 560 px** —regla de los otros dos
  banners—, así que en teléfono la bajada no se veía. Ahora se muestra siempre
  para `.sala-banner`.
- Los tiles del hub llevan padding: con la bajada de dos líneas el texto llegaba
  al borde de la tarjeta.

**Medido** con el CSS real: banner **120 px** de alto a 360 (bajada en 3 líneas)
y **159 px** a 320 (4 líneas), con el botón siempre adentro; tile del hub 123 px
con el texto dentro de la tarjeta. En la app, a 360: 🍿 / Pelimatch / bajada
visible / "Matcheá" / sin `target`. ⚠️ El banner queda bastante más alto que los
otros dos (la ruleta mide ~68 px): si el dueño lo quiere más compacto, es
decisión suya —achicar el texto o esconderlo en teléfono sería cambiar lo que
definió—.

## Verificación automática

- `node --test components/sala/sin-computo-cliente.test.ts` → 3/3.
- `npx tsc --noEmit` limpio. `npm run build` en verde: `/sala/[id]` 12,7 kB (ƒ).
- `lib/sala/acciones-host.test.ts` 10/10, `lib/sala/relectura-cableada.test.ts`
  9/9, `hooks/sala-lector.test.ts` 8/8, `components/sala/entrada-pelimatch.test.ts`
  5/5. Sala completa, con los guards: **264/264**.
- Suite completa post-build: **1861 tests, 1851 ok, 0 fallos, 10 omitidos**
  (artefacto Capacitor). El total incluye los tests sin commitear de la otra
  sesión que hay en el árbol (issue #24, supresiones de Disney+), que también
  pasan.

## Verificación visual/manual (21/09, local, viewport 375×812)

El 20/09 no se pudo (Docker Desktop: `vpnkit-bridge handshake failed`, después
`Wsl/Service/CreateInstance/CreateVm/E_ABORT`). El 21/09 WSL volvió a crear la
VM sin reinicio, Docker levantó y se corrió todo en local: pestaña del preview
como **invitado sin cuenta** a 375 px; organizador (Facu) y Carla desde node.
Una sala, **7 rondas** (6 de 5 y 1 de 10): 30 títulos servidos en las seis
primeras, **30 distintos**.

| Qué | Resultado |
|---|---|
| Empate a tres (Sí de Facu y Carla en 0 y 1; invitado pasa): cards que entran, contador, sin "Desempatar" para el invitado ("Esperando a que Facu desempate…") | ✅ captura |
| "Otra tanda" durante el empate sin resolver | ✅ API 409 `estado`; el pie no muestra el botón |
| `sala_desempatar` (host, node) → el invitado pasa a "Desempatando…" con la rueda (`.dsmp-wheel` en el DOM) y después a "¡Hay match! · La rueda desempató entre 2", elegida con la plataforma de la sala destacada, **Compartir + Ver la ficha**, confeti | ✅ (la rueda se comprobó en el DOM; la captura llegó ya en el estado final: la pestaña tarda más que los 4,2 s del giro) |
| "Otra tanda" desde `resultado` (API) → "Armando la tanda…" → ronda nueva sin repetir | ✅ |
| Ganador a tres (Facu Sí a todo, Carla pasa, invitado Sí en una): **celebración a pantalla completa** en el invitado — corazón grande, "¡Hay match!", póster, nombre, confeti, "Seguir", por encima de la barra inferior — y debajo la pantalla con póster, plataformas, razón, Compartir, Ver la ficha, timer y "Quien organiza puede pedir otra tanda" (sin botón, no es host) | ✅ captura de ambas |
| Sin coincidencias (Facu No, Carla y el invitado pasan): pósters que se separan, texto, pie | ✅ captura |
| Card sin "Pero" real (round 7, "El color del dinero"): sin sección ni rótulo, botones visibles | ✅ captura (heredada de la Etapa 3) |
| Recarga del invitado a mitad de sala: vuelve con la credencial y el estado vigente | ✅ |
| Consola: sólo los 500 preexistentes de `/api/providers` y `/api/upcoming` (tablas ausentes en local) | ✅ |
| Mock estático con el CSS real (`scratchpad/mock/match.html`): overlay y pantalla de resultado a 375 px | ✅ capturas (sirvió para ajustar la geometría del corazón antes de la prueba viva) |

**Hallazgo de esa pasada, CORREGIDO el 22/09:** con "Por qué verla" y "Pero"
largos los tres botones quedaban debajo del pliegue y había que scrollear con
10 s por card. Ahora la fila es fija (punto 2 de la ronda del 22/09).

**Incidente del entorno:** el proceso de `next dev` terminó solo una vez (código
−1) justo después de cerrar la ronda 4; se relanzó y la sesión del invitado se
recuperó de `localStorage`. Sin nada en su log que lo explique.

**Sigue pendiente (requiere al dueño o un dispositivo real):**

- **Dos teléfonos reales** (Step 2 de la Tarea 4.1).
- **Organizador en el navegador** (Empezar, Desempatar, Otra tanda, Cerrar
  sala): requiere iniciar sesión en la pestaña; la lógica se probó por API y con
  tests.
- **Red cortada** (botones `disabled`, contador conservado, reintento del pass y
  ahora también los reintentos acotados de la relectura).
- **Lector de pantalla** (TalkBack/VoiceOver: No / Paso / Sí).
- **Movimiento reducido**: el panel no emula `prefers-reduced-motion`. En código
  la celebración no se monta (`permiteCelebracion`), las animaciones están dentro
  de `no-preference` y la rueda dura 300 ms.

## Qué NO se hizo

Aplicar 009 en Producción; deploy; encender salas; refresco del catálogo;
merge; push; Etapas 5 y 6; la definición de nombre y bajada de la entrada; la
fila fija de botones de voto (hallazgo, a decidir).
