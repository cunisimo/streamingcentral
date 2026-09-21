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

**La entrada del Home no se tocó**: sigue debajo de la ruleta, es un `Link` a
`/sala/nueva` (misma pestaña; nada se despliega ni corre en el Home), y sus
textos siguen siendo los provisorios de la Etapa 3 hasta que el dueño defina
nombre y bajada.

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

## Verificación automática

- `node --test components/sala/sin-computo-cliente.test.ts` → 3/3.
- `npx tsc --noEmit` limpio. `npm run build` en verde: `/sala/[id]` 12,4 kB (ƒ).
- `lib/sala/acciones-host.test.ts` 6/6. Sala completa (lib/sala + hooks + guards):
  107/107.
- Suite completa post-build: **1840 tests, 1830 ok, 0 fallos, 10 omitidos**
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

**Hallazgo (no corregido, decisión del dueño):** en el teléfono, con "Por qué
verla" y "Pero" largos, los tres botones de voto quedan debajo del pliegue y hay
que scrollear con 10 s por card. Una fila de botones fija abajo lo resolvería.

**Incidente del entorno:** el proceso de `next dev` terminó solo una vez (código
−1) justo después de cerrar la ronda 4; se relanzó y la sesión del invitado se
recuperó de `localStorage`. Sin nada en su log que lo explique.

**Sigue pendiente (requiere al dueño o un dispositivo real):**

- "Reducir movimiento" activado: el pane no lo emula. En código: la celebración
  no se monta (`permiteCelebracion`), las animaciones CSS están dentro de
  `no-preference` y la rueda dura 300 ms. Probar en un teléfono con la opción.
- Dos teléfonos reales (Step 2 de la Tarea 4.1).
- Pantalla del organizador en el navegador (Desempatar, Otra tanda, Empezar,
  Cerrar sala): requiere iniciar sesión en la pestaña; la lógica se probó por
  API y con tests.
- Red cortada y lector de pantalla (heredadas de la Etapa 3).

## Qué NO se hizo

Aplicar 009 en Producción; deploy; encender salas; refresco del catálogo;
merge; push; Etapas 5 y 6; la definición de nombre y bajada de la entrada; la
fila fija de botones de voto (hallazgo, a decidir).
