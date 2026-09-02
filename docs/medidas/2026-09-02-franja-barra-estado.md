# La franja superior en Android: quién crea cada meta y cuándo

Fecha: 2026-09-02 · Rama `fix/pwa-franja-superior` · Commit auditado: `bc43a15`

## Cómo se midió

Emular un inset de safe-area no sirve: pinta un `div`, no la barra de Android.
Y engancharse desde la consola llega tarde — el primer sondeo cayó con
`readyState: complete`, con todo ya resuelto.

Lo que sí sirvió: pedirle al servidor el HTML real, **inyectarle un observador
como primerísima línea del `<head>`** —antes que las metas y antes que el script
inline— y servir esa copia desde el mismo origen. El observador parchea
`insertBefore` / `appendChild` / `replaceChild` / `removeChild` para capturar el
*stack* de quien inserta, envuelve `console.error`/`warn` y observa los cambios
de atributo.

🔴 **Lo que crea el parser del HTML no pasa por esas funciones.** Esa es
justamente la discriminación: si una meta aparece por `appendChild`, la puso un
script, y el stack dice cuál.

Escenario de la captura del dueño en las dos builds: **app en oscuro, sistema en
claro**.

## Corrección de lo que informé antes

Dije que en `main` el DOM nunca sostiene un valor casi blanco. **Era falso.** Esa
medición se tomó después del efecto de `ThemeContext`, aunque la rotulé t=0.
Instrumentado desde la primera línea, en `main` la meta clara —que es la que
aplica con el sistema en claro— vale `#FAFAFD` **desde que se parsea hasta los
301 ms**, con la app en oscuro.

## `main` (lo que corre en Producción)

```
t=0,2 ms  [loading]   observador instalado
t=7,7 ms  [loading]   (light)=#FAFAFD   (dark)=#0F0E13     <- las 2 del parser
t=37 ms   [interactive] DOMContentLoaded  ... sin cambios
t=92 ms   [complete]  window load         ... sin cambios
t=301 ms  [complete]  ATRIBUTO content (light) #FAFAFD -> #16171B
t=301 ms  [complete]  ATRIBUTO content (dark)  #0F0E13 -> #16171B
t=8 s                 (light)=#16171B   (dark)=#16171B
```

- **Cero inserciones. Cero remociones. Cero advertencias de hidratación.** Dos
  metas de punta a punta, las que vinieron en el HTML.
- El único que las toca es `applyTheme`, en el `useEffect` de `ThemeContext`, a
  los 301 ms.
- 🔴 **Hay una ventana de 301 ms en la que la meta que aplica es `#FAFAFD`, casi
  blanca, con la app en oscuro.** En una máquina de escritorio con todo
  cacheado. En un teléfono es bastante más larga.

## `bc43a15` (con el arreglo)

```
t=0,9 ms   [loading]   observador instalado
t=4,3 ms   [loading]   ATRIBUTO content (light) #FAFAFD -> #0F0E13   <- script inline
t=4,3 ms   [loading]   ATRIBUTO content (dark)  #0F0E13 -> #0F0E13   <- sin efecto
t=9,5 ms   [interactive] DOMContentLoaded   -> 2 metas, las dos #0F0E13
t=134 ms   [complete]  window load          -> 2 metas, las dos #0F0E13
t=253,8 ms [complete]  >>> INSERCION via appendChild
                       <meta media="(prefers-color-scheme: light)" content="#FAFAFD">
                       STACK  at a5 (_next/static/chunks/fd9d1056-…js:1:80193)
                              at a6 (_next/static/chunks/fd9d1056-…js:1:78371)
                              at a5 (_next/static/chunks/fd9d1056-…js:1:83724)
t=263,1 ms [complete]  ATRIBUTO content (light) #FAFAFD -> #0F0E13   <- applyTheme
```

El script inline arregla la ventana de 301 ms: a los 4,3 ms la meta que aplica ya
es `#0F0E13`. Ese era su objetivo y lo cumple.

**El precio es la tercera meta.** La inserta **React**, por `appendChild`, a los
253,8 ms, con el valor **original** `#FAFAFD`.

### Quién es, con nombre

El stack cae entero en `_next/static/chunks/fd9d1056-*.js`, que es el chunk de
`react-dom` (`a5`/`a6` son sus funciones minificadas). No es código de la app, no
es Next emitiendo metadata en el servidor y no es el manifest: es React
insertando durante la hidratación.

### La firma que confirma el mecanismo

Se predijo y se midió: **React repone exactamente la meta cuyo `content` dejó de
coincidir con lo que él renderizó**, y la repone con el valor de
`viewport.themeColor`.

| App | Script inline mutó | React inserta | ¿Cuál queda sin duplicar? |
|---|---|---|---|
| oscura | la **clara** (`#FAFAFD`→`#0F0E13`) | **clara** `#FAFAFD` | la oscura (mutación nula) |
| clara | la **oscura** (`#0F0E13`→`#FAFAFD`) | **oscura** `#0F0E13` | la clara (mutación nula) |

La meta que el script tocó de verdad es la que se duplica. La que quedó igual, no.
No hay remociones: el nodo mutado se queda y el nuevo se suma.

**React no avisa.** Ni un `console.error` ni un `warn` de hidratación en ninguna
corrida: administra las metas como *hoistable resources* y las repone en
silencio.

### Por qué importa

`applyTheme` corre **una sola vez** (`useEffect` con `[]`). Acá corrigió la
tercera a los 263 ms porque llegó después. Si el orden se invierte —y ya quedó
capturado— queda esto, vivo y estable:

```
[0] (light) #0F0E13
[1] (dark)  #0F0E13
[2] (light) #FAFAFD   <- casi blanca, aplicando, con la app en oscuro
```

## El manifest no puede insertar una meta

Confirmado por tres vías:

1. En `main` el DOM tiene exactamente las dos metas del HTML servido y **cero
   inserciones**. El `theme_color` del manifest nunca se materializa como nodo.
2. La meta que sí se inserta trae `media="(prefers-color-scheme: …)"`. El
   manifest **no expresa esquema de color**: su `theme_color` es un color pelado
   (`'#FAFAFD'`, sin campo `media`). Un nodo con `media` no puede venir de ahí.
3. Los valores insertados son el par de `viewport.themeColor`
   (`#FAFAFD` / `#0F0E13`): React re-emitiendo su propio render. Que el claro
   coincida con el `theme_color` del manifest es porque los dos salen de
   `COLOR_FONDO.light`, no porque uno alimente al otro.

Barrido del repo: los únicos que escriben `theme-color` son `viewport` en
`app/layout.tsx`, el script inline y `applyTheme`. Nadie más.

## Estado

Quedan dos fuentes de casi-blanco, y son distintas:

| | Dónde | Cuándo | ¿Quién la introdujo? |
|---|---|---|---|
| A | meta clara sin corregir | del parseo hasta el `useEffect` (301 ms acá) | ya está en Producción |
| B | tercera meta insertada por React | desde la hidratación; corregida sólo si `applyTheme` llega después | **`bc43a15`** |

`bc43a15` cierra A y abre B. **No se mergea así.**

Lo que todavía no se puede decidir desde esta máquina es si Android usa las
metas o el `theme_color` del manifest, y si actualiza la barra cuando cambian.
Eso lo contesta `/diag-pwa` en el teléfono, con el botón rojo.

No se tocó el Top, Supabase ni Capacitor. Sin push, merge ni despliegue. Los
HTML instrumentados eran temporales y ya se borraron de los dos `public/`.
