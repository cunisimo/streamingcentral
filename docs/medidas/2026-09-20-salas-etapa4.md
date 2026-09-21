# Salas compartidas — Etapa 4: resultados, animaciones y otra tanda

Plan: [`superpowers/plans/2026-09-17-salas-compartidas.md`](../superpowers/plans/2026-09-17-salas-compartidas.md), Tareas 4.1 y 4.2.
Rama `feat/salas`, commit `cf60bc6`. **Nada en Producción; sin deploy, merge ni
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

## Verificación automática

- `node --test components/sala/sin-computo-cliente.test.ts` → 3/3.
- `npx tsc --noEmit` limpio. `npm run build` en verde: `/sala/[id]` 11,8 kB (ƒ).
- Suite completa post-build: **1834 tests, 1824 ok, 0 fallos, 10 omitidos**
  (artefacto Capacitor). El total incluye los tests sin commitear de la otra
  sesión que hay en el árbol (issue #24, supresiones de Disney+), que también
  pasan.

## Verificación visual/manual — PENDIENTE

No se pudo hacer: al arrancar la base local, **Docker Desktop no levantó**.
Primer intento: `vpnkit-bridge handshake failed`; tras `wsl --shutdown` y
relanzar: `Wsl/Service/CreateInstance/CreateVm/E_ABORT` (WSL no crea la VM;
suele resolverse con un reinicio de Windows). Es del entorno, no del código.
Queda para la prueba completa de la Etapa 4, junto con las cuatro manuales
heredadas de la Etapa 3:

| Qué | Cómo |
|---|---|
| Match a dos: corazón, confeti, elegida, Compartir, "Otra tanda" sólo host | host desde node vota Sí; invitado toca Sí en el navegador |
| Sin coincidencias: cards que se separan, pie, "Otra tanda" sólo host | host vota No; invitado pasa |
| Empate a tres: entrada de cards, contador, "Desempatar" sólo host, rueda que frena en `ganador_pos`, elegida | host + Carla (node) Sí en 0 y 1; invitado pasa; `sala_desempatar` desde node |
| "Otra tanda" desde `resultado`: `preparando` → ronda 2 sin repetir títulos, `expires_at` renovado | API desde node; comprobar `room_titles` |
| "Otra tanda" NO disponible con empate sin resolver | API durante `empate` → 409 `estado`; pie sin botón |
| "Reducir movimiento" activado: estados finales sin animación | emulación de `prefers-reduced-motion` |
| Dos teléfonos reales | requisito del plan (Step 2 de 4.1) |
| Heredadas de la Etapa 3 | pantalla del organizador, red cortada, lector de pantalla, card sin "Pero" |

## Qué NO se hizo

Aplicar 009 en Producción; deploy; encender salas; refresco del catálogo;
merge; push; Etapas 5 y 6; la definición de nombre y bajada de la entrada.
