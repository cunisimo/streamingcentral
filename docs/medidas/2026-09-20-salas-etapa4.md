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
`Link` a `/sala/nueva` (nada se despliega ni corre en el Home). Desde el 22/09
se llama **Pelimatch** y abre en pestaña nueva — ver la ronda de abajo.

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
   botones bajan a 54/54/62 px.
3. **Apertura en pestaña nueva** (`lib/sala/apertura.ts`, 4 tests):
   `target="_blank"` + `rel="noopener noreferrer"` en el navegador, conservando el
   Home en la pestaña original. **En PWA instalada y en el contenedor NO se usa**:
   ahí no hay pestañas y `_blank` expulsa al navegador, que es otro contexto de
   almacenamiento (limitación de iOS ya documentada) — o sea que no conservaría
   el Home, lo reemplazaría por una ventana sin sesión ni plataformas. Queda
   declarado por si el dueño quiere otra cosa. El target se resuelve **después de
   montar**, así que el HTML del servidor no lo trae y no hay hydration mismatch.
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
| Mock con el CSS real a **360×640** y **320×568**, card con "Por qué verla" y "Pero" largos | ✅ barra fija visible, texto que se desvanece bajo ella, sin solapar la nav (barra 400–495, nav 495), botones 54/54/62 en la pantalla baja |
| App real a 360×640, ronda de 10 con textos largos | ✅ barra `fixed` pegada a la nav sin solaparla (barra 486–567, navTop 567), los tres botones visibles, al final del scroll la última línea NO queda tapada, y el voto manual desde la barra avanza 3 → 4 |
| Entrada del Home en la app | ✅ dice "Pelimatch", va inmediatamente después del bloque de la ruleta, y el enlace lleva `target="_blank"` y `rel="noopener noreferrer"` |
| Que la pestaña nueva se abra de verdad | ⛔ **no se puede observar en el panel**: el navegador integrado abre los enlaces `target="_blank"` en la misma pestaña, también con un `<a>` suelto de prueba. Queda para probar en un navegador de escritorio o en el teléfono |

## Verificación automática

- `node --test components/sala/sin-computo-cliente.test.ts` → 3/3.
- `npx tsc --noEmit` limpio. `npm run build` en verde: `/sala/[id]` 12,5 kB (ƒ).
- `lib/sala/acciones-host.test.ts` 10/10, `lib/sala/apertura.test.ts` 4/4,
  `components/sala/entrada-pelimatch.test.ts` 4/4. Sala completa (lib/sala +
  hooks + guards de componentes): **119/119**.
- Suite completa post-build: **1852 tests, 1842 ok, 0 fallos, 10 omitidos**
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
- **Que la pestaña nueva se abra de verdad** (el panel no lo permite observar).

## Qué NO se hizo

Aplicar 009 en Producción; deploy; encender salas; refresco del catálogo;
merge; push; Etapas 5 y 6; la definición de nombre y bajada de la entrada; la
fila fija de botones de voto (hallazgo, a decidir).
