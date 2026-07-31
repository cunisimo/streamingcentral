# Trailer en el Hero de la ficha — diseño

Fecha: 2026-07-30
Estado: aprobado para pasar a plan

## Objetivo

En la ficha de película/serie (`DetailView`), cuando el título tenga trailer de
YouTube disponible, mostrar un botón "▶ Ver tráiler" integrado en el Hero. Al
tocarlo, la franja del Hero (`.dhero`) se transforma con un fade suave en un
reproductor de YouTube que ocupa **exactamente** el mismo contenedor. El usuario
nunca abandona la ficha, no se abre modal, no se navega, no cambia el layout ni
el scroll. Al cerrar, el Hero vuelve idéntico a su estado anterior.

## Contexto de la arquitectura actual (relevante)

- `.dhero` (`app/globals.css:245`) es solo la franja del backdrop: `min-height:50dvh`,
  `background-size:cover`, gradiente `::after`, `display:flex; align-items:flex-end`.
  Hoy contiene únicamente el botón de volver (`.dback`). El título, meta y el
  botón "Ver en…" están en `.dpad`, **debajo** del hero.
- Toda la ficha es una columna angosta: `.detail-inner { max-width:560px }`
  (`app/globals.css:244`), incluso en desktop. El reproductor vive en esa columna.
- Los datos de la ficha llegan en un solo request: `DetailView` llama
  `/api/title/${tipo}/${id}` → `detail()` en `lib/enrich.ts:268`, que hace
  `titleDetails()` con `append_to_response` (`lib/tmdb.ts:132`).
- El Service Worker deja YouTube sin tocar (documentado en `CLAUDE.md`); no se
  editan archivos del SW en esta feature, así que **no** hay que subir
  `SC_CACHE_VERSION`.

## Decisiones tomadas (brainstorming)

1. **Botón**: play grande integrado en el Hero, alineado abajo-izquierda (sobre
   el `align-items:flex-end` existente), estilo Netflix/Apple TV+/Max. No
   centrado, no tapa el arte del backdrop.
2. **Tamaño del player**: mantiene la altura actual del Hero (`50dvh`). Sin
   cambio de layout (CLS = 0). El video llena el contenedor con estrategia
   **cover** (recorte), no letterbox.
3. **Audio**: arranca **muteado** siempre (autoplay garantizado en todos los
   navegadores/dispositivos). Botón flotante 🔇/🔊 para activar/desactivar
   sonido; el estado persiste mientras el trailer está abierto y **resetea a
   muteado** al cerrar. Consistente en desktop/Android/iOS.

## Límites reales de YouTube embed (no son bugs, no prometer fixes)

- **`rel=0` ya no elimina los videos relacionados** al final (desde 2018 solo
  los limita al mismo canal). "Sin relacionados" es best-effort, no garantizable.
- **Autoplay con sonido no es confiable en mobile** → por eso arrancamos muteado.
- **Cover recorta el botón de fullscreen nativo**: un `<iframe>` no obedece
  `object-fit:cover`. Para cubrir el contenedor de 560px × 50dvh con un video
  16:9 hay que sobredimensionar el iframe y recortar con `overflow:hidden`. En
  esta columna el video queda más ancho que el contenedor → se recorta a los
  **costados**; el botón de fullscreen nativo (esquina inferior derecha) queda
  cortado. Se compensa con un botón de fullscreen propio (ver Controles).

## Arquitectura de datos (sin fetch nuevo, sin ruta nueva)

Se reutiliza el flujo existente en vez de crear un `services/trailerService.ts`
que fetchee aparte (respeta "`enrich.ts` es el único lugar que toca TMDB junto").

1. **`lib/tmdb.ts`** — agregar `videos` al `append_to_response` de
   `titleDetails()` (movie y tv). Cero requests extra. Tipar en `RawDetail`:
   ```ts
   videos?: { results: RawVideo[] };
   // RawVideo: { key: string; site: string; type: string; official: boolean;
   //             name: string; published_at: string }
   ```

2. **`lib/trailer.ts`** (helper puro, reutilizable — sirve también para el futuro
   Trailer Zone):
   ```ts
   export function pickTrailer(videos: RawVideo[]): string | null; // devuelve youtubeKey o null
   export function trailerEmbedUrl(key: string): string;           // embedUrl muteado+jsapi
   ```
   - `pickTrailer`: filtra `site === "YouTube"`, luego prioriza en 4 niveles:
     1. `official === true && type === "Trailer"`
     2. `type === "Trailer"` (cualquiera)
     3. `official === true && type === "Teaser"`
     4. `type === "Teaser"` (cualquiera)
     Dentro de cada nivel, el primero de la lista de TMDB. **Solo** se consideran
     `Trailer` y `Teaser`: se ignoran explícitamente `Clip`, `Featurette`,
     `Behind the Scenes`, `Bloopers`, `Opening Credits` y cualquier otro tipo.
     Si no hay ninguno de los 4 niveles → `null` (el botón no se muestra).
   - `trailerEmbedUrl(key)`:
     `https://www.youtube-nocookie.com/embed/{key}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`

3. **`lib/enrich.ts` → `detail()`** — llamar `pickTrailer(d.videos?.results ?? [])`
   y devolver `trailerKey` en el objeto.

4. **`lib/types.ts` → `UITitleDetail`** — agregar `trailerKey: string | null`.
   (Contrato estable: se agrega del lado de datos primero, como marca `CLAUDE.md`.)

Si `trailerKey === null`, el botón "Ver tráiler" no se muestra (decisión
server-side; el cliente no adivina).

## Componentes (responsabilidades separadas, DetailView queda fino)

Ubicación: `components/` (flat, como el resto del proyecto).

### `HeroTrailer.tsx` (client)
- Recibe: `backdrop: string | null`, `title: string`, `trailerKey: string | null`,
  y el contenido del hero actual (botón volver) como children o props.
- Dueño del estado `playing: boolean`.
- `playing === false` → renderiza el hero actual (backdrop + `.dback`) + `TrailerButton`.
- `playing === true` → renderiza `TrailerPlayer`.
- La transición backdrop↔player es un **cross-fade** dentro del mismo contenedor
  `.dhero` (misma caja, misma altura → sin CLS, sin tocar scroll).
- Maneja `Esc` para cerrar y el foco (al abrir → foco al ✕; al cerrar → foco al
  botón de play).
- `DetailView` delega el bloque `.dhero` a este componente. Cambio mínimo en
  `DetailView`: reemplazar el `<div className="dhero">…</div>` actual por
  `<HeroTrailer … />`.

### `TrailerButton.tsx`
- Botón play grande, abajo-izquierda del hero. `aria-label="Ver tráiler"`.
- Reutiliza el ícono play y estilos base existentes (`.dprimary .play` como
  referencia visual); clase nueva `.htrailer-btn` en `globals.css`.
- `onClick` → `setPlaying(true)`.

### `TrailerPlayer.tsx`
- Monta el `<iframe>` **lazy** (solo cuando `playing === true` — antes ni existe
  en el DOM). `src = trailerEmbedUrl(key)`.
- Wrapper cover: contenedor `overflow:hidden`; iframe sobredimensionado y
  centrado con transform para llenar 560px × 50dvh recortando a los costados.
- **Estados**:
  - *Loading*: spinner/overlay sobre el hero mientras el iframe no disparó
    `onLoad`; fade-in del video al cargar.
  - *Error*: si el iframe no carga en ~8s (timeout), mostrar "No se pudo cargar el
    tráiler" con opción de reintentar/cerrar. No rompe el hero.
- **Controles flotantes propios** (arriba a la derecha, apilados o en fila):
  - `✕` cerrar (`aria-label="Cerrar tráiler"`) → desmonta el iframe (stop total,
    sin background playback), vuelve al hero, resetea sonido a muteado.
  - `🔇/🔊` sonido → `postMessage` al iframe (`enablejsapi=1`):
    `{"event":"command","func":"mute"|"unMute","args":[]}`. Estado visual
    actualizado; persiste mientras está abierto.
  - `⛶` fullscreen → `iframe.requestFullscreen()` (el nativo queda recortado por
    el cover). `aria-label="Pantalla completa"`.
  - Play/pausa y seek: se usan los **controles nativos** de YouTube (barra
    inferior central, visible pese al recorte).
- Al desmontar (cerrar o salir de la ficha): React destruye el iframe →
  reproducción detenida por completo. No se usa la JS API para "stop"; el
  unmount alcanza.

## Estilos (en `app/globals.css`, sin CSS-in-JS)

Clases nuevas, reusando tokens existentes (`--accent`, `--sh`, etc.):
- `.htrailer-btn` — botón play abajo-izquierda sobre el hero.
- `.htrailer-player` — contenedor cover (`position:absolute; inset:0; overflow:hidden`).
- `.htrailer-player iframe` — sobredimensionado + `transform: translate(-50%,-50%)`
  centrado, sizing para cubrir 16:9.
- `.htrailer-ctl` — botones flotantes (✕ / sonido / fullscreen), arriba a la derecha.
- Transición: `opacity` con `transition` corta para el cross-fade backdrop↔video.
- Respetar `prefers-reduced-motion`: fade instantáneo si está activo.

No se modifica identidad visual de Yump (colores, tipografía, espaciados,
sombras). El botón de volver (`.dback`) sigue funcionando en ambos estados.

## Responsive

- El player siempre ocupa la caja del hero (560px × 50dvh) en desktop y mobile.
- `playsinline=1` evita que iOS fuerce fullscreen automático.
- Cover se adapta a cualquier proporción del contenedor (recorta lo que sobre).

## Accesibilidad

- Todos los controles son `<button>` (focusables, Enter/Space).
- `aria-label` en play, cerrar, sonido, fullscreen.
- `Esc` cierra el player.
- Manejo de foco: al abrir → ✕; al cerrar → botón de play.
- `prefers-reduced-motion` → sin animación de fade.

## Performance

- El iframe **no** se carga hasta el clic (render condicional; antes no existe
  en el DOM).
- El Hero renderiza inmediatamente con el backdrop (sin cambios).
- Al cerrar, el iframe se desmonta y destruye (sin reproducción en segundo plano).
- `trailerKey` viaja en la misma respuesta de `/api/title/...` → sin request extra.

## Flujo resultante

Ficha → Hero con backdrop + "▶ Ver tráiler" → clic → cross-fade a reproductor en
la misma caja → autoplay muteado → 🔊 opcional / ⛶ fullscreen / controles nativos
→ ✕ cerrar → vuelve al Hero idéntico, scroll intacto, sin recargar.

## Fuera de alcance (v1)

- Autoplay silencioso al entrar a la ficha (hover-preview estilo Netflix) — futura mejora.
- Reproductor propio / no-YouTube — futura mejora.
- Trailer Zone (feed vertical) — feature separada, ya tiene su propio spec.

## Verificación

- `npx tsc --noEmit` (0 errores).
- El SW no corre en `next dev`; para validar la ficha alcanza `next dev`, pero
  probar el embed real conviene con `npx next build && npx next start`.
- Verificación visual: botón aparece solo con trailer; cross-fade suave; cover
  sin barras; mute/unmute; fullscreen; ✕ detiene y restaura; sin salto de layout;
  título sin trailer no muestra botón.
