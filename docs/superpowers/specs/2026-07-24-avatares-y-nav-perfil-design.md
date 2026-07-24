# Avatares de personajes + reacomodo de nav y perfil — diseño

Fecha: 2026-07-24
Estado: aprobado (brainstorming), pendiente de plan de implementación.

## Objetivo

Cuatro cambios de UI, sin tocar API, Supabase ni el Service Worker:

1. Intercambiar el ícono de perfil y la lupa de búsqueda entre el TopBar y el
   BottomNav, y dar un poco de aire arriba (fecha + lupa despegadas del techo).
2. Reemplazar los avatares generativos (DiceBear) por un set de 24 avatares SVG
   de personajes (4 sagas × 6) + 1 avatar por defecto, todos con un mismo
   sistema visual.
3. En el hub de usuario, cambiar los textos "Editar perfil" y "Configuración"
   por un ícono de lápiz y uno de tuerca.
4. Bajar el bloque avatar+nombre+íconos del hub para que no quede pegado al
   TopBar.

## Restricción legal aceptada

Nada de fotos ni caras reales de actores/personajes (copyright + derecho de
imagen). Los avatares son **ilustraciones SVG originales** que evocan al
personaje por silueta y rasgo distintivo, no por su rostro real. Decisión del
dueño registrada en el chat.

## 1. Swap TopBar ↔ BottomNav + aire

### BottomNav (`components/BottomNav.tsx`)

- El 5º ítem deja de ser **Buscar** y pasa a ser **Cuenta**.
- `href="/cuenta"`, activo con `p.startsWith("/cuenta")`, label `"Cuenta"`.
- Deslogueado: ícono de persona de línea (mismo tratamiento stroke que el resto
  del nav, `viewBox 0 0 24 24`).
- Logueado: mini-avatar circular (el SVG del personaje elegido) en lugar del
  ícono de línea, con el mismo tamaño visual (~25px) que los demás íconos del
  nav. Decisión aprobada: mostrar el avatar, no el ícono de línea.
- Como el ítem ahora depende del estado de auth, `BottomNav` pasa a leer
  `useAuth()` (ya es client component). El resto de los ítems no cambia.

### TopBar (`components/TopBar.tsx`)

- La fila superior (`.topbar-top`) queda: **fecha** (izquierda) + **lupa de
  búsqueda** (derecha) linkeando a `/buscar`.
- Se elimina de esa fila el bloque de cuenta (avatar logueado / "Ingresar"
  deslogueado) — esa entrada ahora vive en el BottomNav.
- La lupa reusa el ícono de búsqueda existente (`circle` + `path`) dentro de un
  `<Link href="/buscar">` con `aria-label="Buscar"`.
- `TopBar` deja de necesitar `useAuth`, `avatarSvg` y el estado de cuenta si no
  se usan en otro lado del componente (verificar en implementación; el resto del
  TopBar —marca, panel de plataformas— no cambia).

### Aire (`app/globals.css`)

- `.topbar-top`: padding-top `7px` → `14px`.
- Media `max-width:620px`: `.topbar-top` padding-top `6px` → `12px`.
- Ajuste chico y deliberado; no mover el resto del layout.

## 2. Avatares SVG (24 personajes + 1 por defecto)

### Sistema visual único (obligatorio para los 25)

- Lienzo `viewBox="0 0 100 100"`, recorte circular, sin gradientes (o mínimos),
  formas planas y bold.
- Misma gramática de construcción en todos: disco de fondo circular, cabeza/
  rostro con proporción y encuadre idénticos, mismo tratamiento (sin stroke o
  stroke plano uniforme). Entre un avatar y otro sólo cambian **silueta +
  rasgo distintivo + color**, nunca el estilo de dibujo.
- Paleta acotada y cohesiva, compartida por todos (no una paleta por saga que
  rompa la unidad; el color diferencia personajes dentro de un mismo lenguaje).
- Reconocibilidad por rasgo, ejemplos: Vader = casco negro; C3PO = cabeza
  droide dorada; Gandalf = barba gris + sombrero puntudo; Voldemort = calvo
  pálido sin nariz; Harry = anteojos redondos + cicatriz; Big Bang (humanos)
  por pelo/color/accesorio (Sheldon remera con rayo, Penny rubia, Raj piel más
  oscura, Howard flequillo tazón + cuello alto, Amy anteojos + rebeca).

### Manifest y contrato de datos

Nuevo `lib/avatars/` (o `lib/avatars.ts` si entra cómodo en un archivo):

```ts
export type Saga = "lotr" | "bigbang" | "starwars" | "hp";
export type CharAvatar = { id: string; name: string; saga: Saga; svg: string };

export const SAGAS: { key: Saga; label: string }[] = [
  { key: "lotr",     label: "El Señor de los Anillos" },
  { key: "bigbang",  label: "The Big Bang Theory" },
  { key: "starwars", label: "Star Wars" },
  { key: "hp",       label: "Harry Potter" },
];

export const DEFAULT_AVATAR_ID = "default";
export const AVATARS: CharAvatar[];   // 24 personajes
```

IDs (25 en total, `avatar_seed` guarda uno de estos strings):

- LOTR: `lotr-gandalf`, `lotr-gimli`, `lotr-legolas`, `lotr-frodo`,
  `lotr-sam`, `lotr-sauron`
- Big Bang: `bb-sheldon`, `bb-leonard`, `bb-rajesh`, `bb-howard`,
  `bb-penny`, `bb-amy`
- Star Wars: `sw-anakin`, `sw-luke`, `sw-han`, `sw-c3po`, `sw-vader`,
  `sw-obiwan`
- Harry Potter: `hp-harry`, `hp-hermione`, `hp-ron`, `hp-dumbledore`,
  `hp-snape`, `hp-voldemort`
- Por defecto: `default` (ícono de persona neutro, no pertenece a ninguna saga).

### `lib/avatar.ts`

- `avatarSvg(id: string): string` devuelve el data URI del SVG cuyo `id`
  coincide; **si el id no existe (incluye seeds DiceBear viejas) → SVG del
  avatar por defecto**.
- Se elimina la dependencia de `@dicebear/*` y la función `randomSeed`.
- Sin cambio de schema: `profiles.avatar_seed` sigue siendo un `string` que
  ahora contiene un id de personaje. Usuarios previos con seed DiceBear ven el
  avatar por defecto hasta reelegir (aceptado por etapa temprana).

### AvatarPicker (`components/AvatarPicker.tsx`)

- Deja de generar seeds random y quita el botón "Mostrar más".
- Grid tipo Crunchyroll **agrupado por saga**: el `default` primero (fuera de
  saga o en una sección "General"), luego una sección por saga con su `label`
  como subtítulo y sus 6 avatares.
- Cada opción es el avatar SVG circular; marca el seleccionado (`.on`) como hoy.
- Reusa `.avpick`/`.avopt`; se agregan estilos de sección/subtítulo si hacen
  falta (clases nuevas en globals.css, siguiendo lo existente).

## 3. Perfil: texto → íconos (`components/UserHub.tsx`)

- En `.hub-links`: "Editar perfil ›" → **ícono lápiz**; "Configuración ›" →
  **ícono tuerca**.
- Siguen siendo `<Link>` a `/cuenta/perfil` y `/cuenta/configuracion`, cada uno
  con `aria-label` ("Editar perfil" / "Configuración") por accesibilidad.
- Estilo: botón-ícono redondo discreto (clase nueva reutilizando tokens
  existentes; SVG stroke `viewBox 0 0 24 24`, ~18-20px).

## 4. Bajar el header del hub (`app/globals.css`)

- `.hub-head`: `padding: 6px 0 18px` → `padding-top: 24px` (mantener el bottom).
- Sólo afecta el bloque avatar+nombre+íconos del hub; no toca el resto.

## Archivos afectados

- `components/BottomNav.tsx` — ítem Cuenta + `useAuth`.
- `components/TopBar.tsx` — lupa arriba, se quita cuenta.
- `components/UserHub.tsx` — lápiz/tuerca.
- `components/AvatarPicker.tsx` — grid por saga.
- `lib/avatar.ts` — `avatarSvg` por id, sin DiceBear.
- `lib/avatars/` (nuevo) — manifest + los 25 SVG.
- `app/globals.css` — aire topbar, header hub, estilos picker/íconos.
- `package.json` — se puede quitar `@dicebear/*` si no queda otro uso.

Fuera de alcance: rutas API, Supabase/schema, Service Worker, manifest PWA.

## Verificación

- `npx tsc --noEmit` sin errores.
- Revisar visualmente: nav inferior con Cuenta (avatar logueado / persona
  deslogueado), TopBar con fecha+lupa y aire arriba, picker agrupado por saga
  con estilo unificado, hub con lápiz/tuerca y bajado del techo.
- Confirmar que un `avatar_seed` legacy (seed DiceBear) cae al avatar por
  defecto sin romper.
