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

Lo que no se puede decidir desde esta máquina es si Android usa las metas o el
`theme_color` del manifest, y si actualiza la barra cuando cambian.

No se tocó el Top, Supabase ni Capacitor. Los HTML instrumentados eran
temporales y ya se borraron de los dos `public/`.

---

# Los experimentos, y cuál quedó

Cada variante se midió con el mismo instrumento —observador en la primerísima
línea del `<head>`— en las **cuatro** combinaciones de tema del sistema × tema
de la app.

## Experimento 1 — meta explícita en el JSX con `suppressHydrationWarning`

Se sacó `themeColor` del `viewport` y se declaró una sola meta a mano en el
`<head>`, sin `media`, para que el script le corrigiera el `content`.

| sistema | app | ¿el script cambió el valor? | metas al final | inserciones de React |
|---|---|---|---|---|
| claro | clara | no (`#FAFAFD`→`#FAFAFD`) | 1 | 0 |
| claro | **oscura** | **sí** (`#FAFAFD`→`#0F0E13`) | **2** | **1** (`#FAFAFD`, t=130 ms) |
| oscuro | clara | no | 1 | 0 |
| oscuro | **oscura** | **sí** | **2** | **1** (`#FAFAFD`, t=339 ms) |

🔴 **Descartado.** `suppressHydrationWarning` no evita la re-emisión: sólo
silencia una advertencia que además nunca se emitía. Duplica siempre que el
script cambia el valor de verdad, con cualquier tema del sistema.

**La regla que queda:** mutar antes de hidratar **cualquier** meta que React
renderee provoca la copia. No importa cómo se declare.

## Experimento 2 — que React no renderee ninguna (la que quedó)

Sin `themeColor` en el `viewport` y sin etiqueta en el JSX. La crea el script de
arranque con `createElement`, y `applyTheme` muta esa misma.

HTML servido: **0 metas**. Y en las cuatro combinaciones:

| sistema | app | metas al final | valor | `--bg` | React inserta | remociones | advertencias | color listo |
|---|---|---|---|---|---|---|---|---|
| claro | clara | **1** | `#FAFAFD` | `#fafafd` | 0 | 0 | 0 | t=4,0 ms |
| claro | oscura | **1** | `#0F0E13` | `#0f0e13` | 0 | 0 | 0 | t=3,5 ms |
| oscuro | oscura | **1** | `#0F0E13` | `#0f0e13` | 0 | 0 | 0 | t=2,2 ms |
| oscuro | clara | **1** | `#FAFAFD` | `#fafafd` | 0 | 0 | 0 | t=2,4 ms |

Toggle en runtime, sobre la Home ya hidratada, tres cambios seguidos:

```
ANTES (dark): <meta name="theme-color" content="#0F0E13">
toggle -> dark    --bg=#0f0e13   1 meta  #0F0E13
toggle -> light   --bg=#fafafd   1 meta  #FAFAFD
toggle -> dark    --bg=#0f0e13   1 meta  #0F0E13
6 s después: 1 meta · inserciones/remociones/advertencias posteriores: 0
```

## Alternativa con cookies, medida antes de descartarla

Leer el tema de una cookie y renderear el color en el servidor resolvería el
problema sin JavaScript, pero `cookies()` en el layout raíz saca del prerender a
**todo** el árbol:

| | páginas estáticas | dinámicas |
|---|---|---|
| solución adoptada | **23** | 32 |
| con `cookies()` en el layout raíz | **4** | 51 |

19 páginas pierden el prerender. La solución adoptada cuesta **cero**: sigue
siendo el mismo build estático.

## Contra los criterios de aceptación

| criterio | estado |
|---|---|
| una sola meta efectiva | ✅ 1 en las cuatro combinaciones |
| color correcto antes del primer pintado | ✅ 2,2–4,0 ms, en el `<head>`, antes de pintar |
| cero inserciones de React al hidratar | ✅ 0 en las cuatro |
| cero advertencias | ✅ 0 |
| cambio claro/oscuro en runtime | ✅ sigue a `--bg`, sin duplicar |
| sin duplicar áreas seguras ni tocar Capacitor | ✅ `viewportFit` y el CSS de safe areas intactos |

Service worker: los archivos tocados son `app/layout.tsx`,
`components/ThemeContext.tsx` y los tests. **Ninguno es `public/sw*`, así que no
corresponde subir `SC_CACHE_VERSION`**; el HTML va por `Network First`.

## La pregunta que queda abierta, y por qué no bloquea

Si Android **repinta** la barra cuando el color cambia después del arranque, o si
**conserva** el del primer pintado. De eso depende si la ventana de 301 ms
explica del todo la captura original.

**No bloquea el arreglo**, y por eso se cerró sin contestarla: la solución pone
el color correcto **antes del primer pintado** (2,2–4,0 ms), así que las dos
respuestas posibles dan lo mismo — si Android latea el color inicial, ya es el
correcto; si repinta, también.

Hubo una ruta de diagnóstico para preguntárselo a un teléfono (los commits
`6c8d798` y `3ac21a4` la traen y la explican). **Se eliminó**: era código
ejecutable temporal y quedarse en el árbol sin usarse no le hace bien a nadie.
Si algún día hace falta, está en la historia.
