# Salas compartidas — Etapa 3: cliente (lobby y votación)

Plan: [`superpowers/plans/2026-09-17-salas-compartidas.md`](../superpowers/plans/2026-09-17-salas-compartidas.md), Tareas 3.1–3.4.
Rama `feat/salas`. **Todo en local: base de `supabase start` (catálogo real +
fixtures), `next dev` con `.env.sala-local`, TMDB real. Nada en Producción; sin
deploy, merge ni push.** Cuatro commits, uno por tarea, más el de la ronda de
correcciones del dueño (`7580a1b`).

## Qué hay

### Tarea 3.1 — contratos, credencial local, temporizador (`75e51cc`)

- `lib/sala/estado.ts` — forma del JSON de `sala_estado` (`EstadoSala`,
  `RondaSala`, `ResultadoSala`, `EstadoInexistente`), `esTerminal`,
  `plazoVigente` (lobby → `lobby_expires_at`; votando → `deadline_at`;
  empate/resultado → `expires_at`), `venceEnSeg` y `desfaseReloj` (`ahora` del
  servidor contra el momento de llegada). 4 tests.
- `lib/sala/token-store.ts` — **la credencial ES el token**: 32 bytes de
  `crypto.getRandomValues` en base64url (43 chars, codificación propia sin
  `Buffer`), persistida ANTES de la primera solicitud; `confirmarSala` sólo
  MUEVE `yump:sala:credencial:crear` → `yump:sala:<id>`; ninguna respuesta del
  servidor la escribe; respuestas repetidas o en orden inverso no cambian nada;
  store que lanza → credencial estable en memoria (ver correcciones). 12 tests.
- `hooks/temporizador-card.ts` — comienzo por sala/ronda/pos
  (`yump:sala:<room>:<round>:<pos>:inicio`); `arrancar` reusa el guardado (F5
  no reinicia); `cerrar` sólo con avance confirmado; comienzo corrupto o futuro
  se ignora; `limpiarAnteriores`. 8 tests.

### Tarea 3.2 — `useSala` (`31db791`)

- `hooks/sala-relectura-nucleo.ts` — máquina pura: una relectura por ventana
  de 1500 ms, trailing; señal aislada → inmediata. 5 tests.
- `hooks/useSala.ts` — `sala_estado` al montar; canal `sala:<id>`
  (`private: false`) que sólo escucha `cambio` y **nunca publica**; respaldo
  cada 5 s mientras no está `SUBSCRIBED`; `visibilitychange` y `online`
  releen; relectura 1 s después del plazo vigente (con desfase de reloj);
  `sala_token_invalido` → `sinAcceso` + borra la credencial; terminal →
  `unsubscribe` + `borrarToken`; un fallo de red conserva el último estado.

### Tarea 3.3 — crear, unirse, lobby (`25f0cb9`)

- `app/sala/nueva` → `CrearSala` (exige sesión; nombre del perfil y "mis
  plataformas" precargados en **estado local**, nunca `set()` del contexto;
  `sala_crear` con `credencialParaCrear()` → `confirmarSala` → `/sala/<id>`).
- `app/sala/[id]` (uuid validado; si no, `ParametrosInvalidos`) → `SalaView`:
  credencial guardada → si no hay y hay sesión, `sala_reclamar` con una nueva
  de este navegador → si no, `UnirseForm`. Con credencial, `useSala` y el
  estado decide la vista: lobby / "Armando la tanda…" / votación / resultado
  (provisorio) / terminó / no existe.
- `Lobby`: participantes (vos + organiza), contador del lobby, unión de
  plataformas, enlace + Copiar, y para el organizador `ConfigTanda`
  (5/10/20, Cualquiera/Corta/Larga, default 10 + Cualquiera) + "Empezar"
  (`POST /api/sala/preparar` con el JWT; `insuficientes` nombra los tamaños
  alcanzables) + "Cerrar sala".
- `SelectorPlataformasSala` reusa `ProviderCard` sobre `PLATFORMS`.
- `lib/sala/mensajes.ts` — códigos `sala_*` → castellano; nunca el código
  crudo en pantalla. 4 tests. `lib/sala/entrada.ts` — `SALAS_VISIBLES`.
- Entrada en el Home (link con estilo `.dsmp-banner`, debajo de la ruleta; sin
  sesión va a `/cuenta`) y tile "Crear sala" en el hub de cuenta.

### Tarea 3.4 — votación (`a2440d2`)

- `lib/sala/votacion-nucleo.ts` — decisiones puras tras `sala_votar` y tras un
  `sala_estado` (`decidirTrasVotar`, `sincronizarPos`), `formatoDuracion`,
  `hayAdvertencia`. 6 tests.
- `Votacion` + `CardSala` + `BotonesVoto` + `ProgresoRonda`. Una card por vez;
  10 s locales persistidos; pass automático al vencer (reintento acotado a 3 s
  si falló la solicitud; `online` lo adelanta); botones con `disabled` real en
  vuelo; "Listo, esperando a los demás (k de N)"; el "Pero" sólo con contenido;
  sin enlace a la ficha.

## Ronda de correcciones del dueño (19/09, `7580a1b`) — tres bloqueantes

1. **`token-store` con `localStorage` roto.** Antes, dos llamadas generaban
   credenciales distintas (rompía la idempotencia dentro de la pestaña) y
   `confirmarSala` borraba el origen aunque el destino no hubiera quedado.
   Ahora hay un respaldo EN MEMORIA por clave: todos los reintentos de la misma
   clave devuelven la misma credencial; `confirmarSala` relee el destino y borra
   el origen SÓLO si el store lo conserva (si no, el origen persistido queda y
   el destino vive en memoria — repetir `sala_crear` devuelve la misma sala).
   Tests nuevos: store que lanza (estabilidad), `setItem` que lanza sólo en la
   clave de sala, `setItem` mudo que no persiste. `token-store`: 9 → 12 tests.
2. **`useSala` y respuestas fuera de orden.** Compuerta monotónica
   (`hooks/sala-compuerta.ts`): cada lectura sale con un ticket `{gen, n}` y
   sólo se aplica si es más nueva que la última aplicada y de la generación
   vigente; cambiar `roomId`/token reinicia la generación. Vale para el éxito y
   para el error. Test con promesas diferidas: responde primero la lectura nueva
   y después la vieja → el estado final sigue siendo el nuevo; una lectura de la
   generación anterior no actualiza la nueva. 5 tests.
3. **`Votacion` tras `ronda_cerrada`/`inexistente`.** El bucle pasó a
   `lib/sala/votacion-control.ts` con reloj y RPC inyectados. La compuerta se
   CIERRA antes de releer y sin mirar si la relectura anduvo: no sale ni un
   `sala_votar` más aunque el intervalo siga vencido. Test con reloj controlado:
   1 envío, 20 ticks vencidos en 5 s con `releer` fallando → sigue en 1 (el test
   se puso en rojo quitando el cerrojo, y volvió a verde con él). También fija un
   solo voto en vuelo y el reintento acotado a 3 s. 5 tests.

Además: quitado el comentario obsoleto de `009_salas.sql` que decía que
`sala_reclamar` "rota el token". Smoke en navegador tras el refactor: pass a
los 10 s, No manual, pass 10 s después del manual, Sí → `match`.

## Desvíos respecto del plan (declarados)

- **Plataformas del selector desde `PLATFORMS`, no desde `/api/providers`.**
  Es el conjunto exacto que la base acepta (`sala_codigos_permitidos`, atado a
  `ALL_CODES` por test), ya en el orden del selector y sin petición.
- **Resultado provisorio.** Con `estado` `empate` / `resultado` la vista muestra
  "La ronda terminó · Resultado: <tipo>" para que el flujo cierre; las pantallas
  reales, el desempate y "Otra tanda" son la Etapa 4.
- **Enlace de la sala como texto + Copiar** en el lobby; el mensaje y la acción
  de compartir del sistema son la Etapa 5.
- **`sala_ya_tiene_activa` no enlaza a la sala existente**: la RPC no devuelve
  su id. El texto dice "Cerrala antes de crear otra".
- **`claveCard` se llama `claveInicioCard`**: el nombre del plan colisionaba
  con el barrido de constructores de claves de caché (`lib/claves.test.ts`).
- **Tarea 6.1 pendiente**: `app/sala/[id]` es dinámica y hoy NO está en
  `APP_FUERA` de `scripts/build-capacitor.mjs`; el export nativo fallaría hasta
  esa tarea. No se corrió `build:capacitor` en esta etapa.

## Corregido durante la verificación

- **El contador se llevaba la card siguiente.** Con el comienzo como número
  suelto, el efecto del contador corría una vez con el comienzo VENCIDO de la
  card anterior y mandaba el `pass` de la nueva en el acto: medido 0 → salta 1
  → 2 → salta 3 → 4 (la ronda de 5 duró ~25 s). Ahora el comienzo va atado a su
  posición y el contador arranca en el mismo efecto que lo lee. Después: votos
  a `:04.3`, `:14.4`, `:24.4` — exactamente 10 s.
- El aviso "Sin conexión en vivo" aparecía en la pantalla terminal, donde el
  canal se cierra a propósito: ahora no se muestra si la sala terminó.

## Verificación automática

- `node --test` de lo nuevo: **49 tests** — estado 4, token-store 12, temporizador 8,
  relectura 5, compuerta 5, mensajes 4, votación-núcleo 6, votación-control 5
  (eran 36 antes de la ronda de correcciones).
- `npm run build` en verde: `/sala/[id]` dinámica (ƒ, 8,39 kB), `/sala/nueva` estática.
- Suite completa **después del build**: **1794 tests, 1784 ok, 0 fallos, 10
  omitidos** (artefacto Capacitor, línea base). `npx tsc --noEmit` limpio. En la
  primera corrida falló una vez `home-fondo-orden.test.ts:154`, uno de los dos
  tests de reloj de pared del **issue #23** (pasa 3/3 aislado; no se tocó).

## Verificación manual en navegador (local)

Pestaña del preview como **invitado sin cuenta**; el organizador y el tercer
participante se manejaron desde node con la anon key y el JWT del usuario local
(la contraseña no se tipeó en el navegador: es regla de trabajo de la IA).

| Qué | Resultado |
|---|---|
| `/sala/<id>` sin credencial → `UnirseForm` con "mis plataformas" precargadas | ✅ |
| Entrar (nombre + plataformas) → lobby con "Beto (vos)" y "Facu · organiza" | ✅ |
| Tercer participante desde node → aparece en el lobby **sin recargar** | ✅ (Broadcast + relectura) |
| `update rooms set lobby_expires_at = now()` → "La sala terminó" en el invitado | ✅ (≤ 60 s: barrido/respaldo) |
| Organizador prepara (API) → "Armando la tanda…" → primera card, todo por el canal | ✅ |
| Card: póster, título, año · duración · géneros, plataforma destacada, razón, PERO, tres botones sólo ícono | ✅ (captura) |
| Pass automático exactamente cada 10 s (timestamps de `room_votes`) | ✅ |
| Recargar a mitad de card: 9 s → recarga → 6 s (no vuelve a 10) | ✅ |
| Tras la última card: "Listo, esperando a los demás · Terminaron 1 de 2" | ✅ |
| Cierre por votos del otro → `sin_coincidencias` llega sin recargar | ✅ |
| Sí sobre una card donde el otro ya dijo Sí → `match` en el acto | ✅ (round 3, `ganador_pos 2`) |
| Tres rondas seguidas sin repetir títulos (`excluir`) | ✅ 15 distintos |
| Entrada "Crear sala" en el Home | ✅ (`find`) |
| Consola: sólo los 500 preexistentes de `/api/providers` y `/api/upcoming` (tablas ausentes en la base local) y el aviso `data-theme` | ✅ nada de salas |

**No verificado (queda para el dueño o para la Etapa 4/6):**

- Pantalla del organizador en el navegador (ConfigTanda, "Empezar",
  `insuficientes` con tamaños alcanzables, "Cerrar sala"): requiere iniciar
  sesión en la pestaña del preview.
- Red cortada (DevTools → Offline): botones `disabled`, comienzo conservado,
  reintento del `pass` al volver la red. La lógica está en código y tests puros;
  el navegador integrado no permite simular offline.
- Lector de pantalla (TalkBack/VoiceOver): los tres botones llevan
  `aria-label` No / Paso / Sí; no se probó con un lector real.
- Card con `advertencia` NULL en pantalla: los fixtures "Sin pero" no llegan a
  ser card en local (TMDB devuelve 404 para sus ids) y en las tres rondas no
  salió ningún título real sin "Pero". `hayAdvertencia` está testeado.
- Recarga después de votar retoma en la siguiente con 10 s: cubierto por
  `sincronizarPos` + `limpiarAnteriores` (tests), no reproducido a mano.
- Layout a ancho de teléfono: no se capturó; reusa `.rlt-*` y `.ob-grid`, que
  ya tienen breakpoints.

## Qué NO se hizo

Aplicar 009 en Producción; deploy; encender salas; refresco del catálogo;
merge; push; Etapa 4 (resultados, desempate, otra tanda), 5 (compartir) y 6.
