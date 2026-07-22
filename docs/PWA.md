# PWA — Arquitectura

Documentación operativa de la Progressive Web App de StreamingCentral.
Diseño y decisiones originales: `docs/superpowers/specs/2026-07-21-pwa-design.md`.

---

## 1. Qué es y qué no es

StreamingCentral es una **PWA instalable** en Android, iPhone y escritorio: se
abre desde un ícono propio, sin barra del navegador, con splash screen.

**No es una app offline.** Es una app online con **degradación elegante**: sin
conexión abre, navega por lo ya visitado y muestra un estado "Sin conexión"
claro. Nunca muestra datos viejos para simular que funciona.

> **Regla que gobierna todo el diseño:** frescura > disponibilidad.
> Ante la duda entre mostrar un dato cacheado o fallar, **falla**.

---

## 2. Mapa de archivos

```
public/
  sw.js                    Entry del SW: install / activate / fetch / message
  sw/config.js             CACHE_VERSION, nombres de cache, límites, PRECACHE
  sw/strategies.js         cacheFirst · networkFirst · networkOnly · cacheFirstImage · trimCache
  sw/routes.js             Router: request → estrategia
  sw/push.js               RESERVADO (Web Push)
  sw/sync.js               RESERVADO (Background Sync)
  sw/share-target.js       RESERVADO (Web Share Target)
  offline.html             Fallback offline — HTML estático autónomo
  icons/                   8 íconos (any, maskable, favicon, shortcuts)
  splash/                  18 splash de iOS
  screenshots/             4 screenshots del manifest

app/
  manifest.ts              Manifest tipado (metadata route de Next)
  icon.png                 Favicon 32×32
  apple-icon.png           Apple touch icon 180×180
  layout.tsx               viewport (viewport-fit=cover), metadata apple-*, PwaClient

components/pwa/
  PwaClient.tsx            Orquestador cliente (montado en el layout)
  ServiceWorkerRegister.tsx  Registro del SW + detección de updates
  InstallPrompt.tsx        Banner de instalación (Android) / instrucciones (iOS)
  InstallRow.tsx           Fila "Instalar" en /cuenta/configuracion
  UpdateToast.tsx          Aviso de versión nueva
  StandaloneWelcome.tsx    Bienvenida al primer arranque instalado
  OfflineState.tsx         Estado offline dentro de una vista
  AppleSplashLinks.tsx     18 <link> de splash — GENERADO, no editar

hooks/
  useOnline.ts             navigator.onLine + eventos online/offline
  useInstallPrompt.ts      beforeinstallprompt + detección iOS/standalone

scripts/
  generate-pwa-assets.mjs  Genera los 26 assets + AppleSplashLinks.tsx
  pwa-devices.mjs          Lista canónica de dispositivos iOS (fuente única)

assets/brand/logo.svg      Fuente única de la marca
```

---

## 3. Estrategias de caché

El router (`public/sw/routes.js`) evalúa **en este orden**. Dos reglas
transversales primero:

- **Solo `GET`.** Cualquier POST/PATCH/DELETE pasa directo a la red, sin tocar.
- **Solo lo declarado.** Lo que no matchea ninguna regla devuelve `null` y va a
  la red sin intervención del SW.

| # | Recurso | Estrategia | Cache | Por qué |
|---|---|---|---|---|
| 1 | `image.tmdb.org` (pósters, backdrops) | **Cache First** + expiración 30d + tope 300 (FIFO) | `sc-images-v2` | Las URLs de TMDB son inmutables: el contenido de `/t/p/w500/abc.jpg` nunca cambia. Revalidar sería gastar datos para recibir lo mismo. |
| 2 | Otros hosts externos (Supabase, YouTube, `api.themoviedb.org`) | **Sin interceptar** | — | Supabase = sesión y datos del usuario. YouTube = video (cachearlo es inútil y rompe el player). |
| 3 | `/api/*` (propia) | **Network Only** | ninguno | **La regla más importante.** Catálogo, listas y votos nunca se cachean. Si falla, la UI muestra `OfflineState`. |
| 4 | `/_next/static/*` (JS, CSS, fuentes) | **Cache First**, sin expiración | `sc-static-v2` | Next hashea por contenido: un cambio produce otro nombre de archivo. Imposible servir algo obsoleto. |
| 5 | `/icons/*`, `/splash/*`, `/screenshots/*`, `/manifest.webmanifest` | **Cache First** | `sc-static-v2` | Assets propios estáticos. |
| 6 | Documentos de navegación (`mode: navigate`) | **Network First** → cache → `/offline.html` | `sc-pages-v2` | Ver abajo. |
| 7 | Cualquier otro GET del mismo origen | **Sin interceptar** | — | |

### Por qué los documentos son Network First y no Cache First

Cache First en HTML es el bug clásico de PWA: tras un deploy, un HTML cacheado
apunta a chunks de JS que ya no existen en el servidor → **pantalla en blanco**.

Network First evita eso y no tiene el costo que tendría en otra app, porque
**todas las páginas de StreamingCentral son shells estáticos**: son server
components que solo montan client components, y los datos se buscan desde el
cliente contra `/api/*`. El HTML no contiene ni un dato dinámico, así que
cachearlo no puede mostrar información vieja.

### Por qué `/offline.html` es HTML plano y no una ruta de Next

Se probó primero con `app/offline/page.tsx`. **No funciona:** cuando el SW sirve
el HTML de `/offline` bajo otra URL (ej. `/series`), el payload RSC embebido
corresponde a `/offline` pero la URL es `/series`; el router de Next detecta el
desajuste al hidratar y tira `Application error: a client-side exception`.

`public/offline.html` es autónomo — sin React, sin RSC, sin hidratación — así que
se puede servir bajo cualquier URL. Es theme-aware por `prefers-color-scheme`.

### Expiración y tope de imágenes

`cacheFirstImage` guarda cada respuesta con un header propio `sw-cached-at`.
Al leer, si pasaron más de 30 días, borra la entrada y va a la red. Después de
cada escritura, `trimCache` recorta a las 300 entradas más recientes (FIFO, que
para URLs inmutables aproxima bien un LRU). Sin ese tope el cache crece sin
límite y iOS termina desalojándolo entero.

---

## 4. Versionado e invalidación de caches

### El mecanismo

`public/sw/config.js` define una sola constante:

```js
const CACHE_VERSION = "v2";
```

De ahí salen los tres nombres de cache: `sc-static-v2`, `sc-pages-v2`,
`sc-images-v2`. El handler de `activate` borra **todo cache cuyo nombre no esté
en la lista de la versión actual**:

```js
caches.keys()
  .then(keys => Promise.all(
    keys.filter(k => !VALID_CACHES.includes(k)).map(k => caches.delete(k))
  ))
  .then(() => self.clients.claim());
```

Subir la versión invalida los tres caches de una. No hay invalidación selectiva
—y no hace falta: `/_next/static` se auto-invalida por hash, y `/api/*` no se
cachea.

### ⚠️ Regla operativa

**Al modificar cualquier archivo del SW (`public/sw.js` o `public/sw/*`), subir
`CACHE_VERSION`.** Si no, los caches viejos sobreviven y podés servir un shell
que ya no corresponde.

**Excepción: `offline.html` no requiere bump manual.** Su revisión se resuelve
sola por hash (ver abajo).

### Revisioning del fallback offline (por hash, automático)

`public/offline.html` no tiene hash en la URL, así que un cambio de contenido no
cambiaría los bytes del SW: `install` no se re-ejecutaría y los clientes
instalados seguirían sirviendo la copia vieja **para siempre**. Es el problema
que Workbox resuelve con `__WB_REVISION__`; acá no usamos Workbox.

La solución: `scripts/stamp-sw.mjs` corre como `prebuild`, hashea
`public/offline.html` y estampa el resultado dentro de `public/sw.js`:

```js
self.SC_OFFLINE_URL = "/offline.html?v=bed1ff07da";
```

**Vive en `sw.js` y no en `sw/config.js` a propósito.** El algoritmo de update
del SW compara byte a byte el *script principal*; la comparación de los scripts
traídos por `importScripts` existe en Chrome moderno pero no es consistente entre
motores. Estampar en `sw.js` garantiza que el byte-diff se dispare.

`activate` además borra las entradas `/offline.html?v=…` de revisiones anteriores,
porque el nombre del cache no cambia cuando solo cambia el hash.

⚠️ **`npx next build` NO dispara los hooks de npm.** Usar `npm run build` (que es
lo que corre Vercel). Con `npx next build` el SW queda con el hash anterior.

### Cómo se propaga una actualización

1. El navegador pide `/sw.js` (con `Cache-Control: no-cache`, ver §7) y compara
   bytes. Si cambió, instala el SW nuevo.
2. `install` precachea y llama `skipWaiting()` → el SW nuevo activa enseguida.
3. `activate` borra los caches de versiones viejas y hace `clients.claim()`.
4. `ServiceWorkerRegister` detecta el update (`updatefound` + ya había
   controller) y avisa a `PwaClient` → aparece el `UpdateToast`.
5. El usuario toca **Actualizar** → `postMessage("SKIP_WAITING")` + `reload()`.

**`skipWaiting()` inmediato es una decisión consciente:** actualiza rápido, a
costa de que una pestaña abierta pueda quedar con JS viejo y HTML nuevo. Eso lo
cubre el `UpdateToast`. La alternativa —esperar a que se cierren todas las
pestañas— deja usuarios semanas con versiones viejas, que es peor.

### ⚠️ Por qué NO recargamos en `controllerchange`

Sería tentador recargar automáticamente cuando el SW nuevo toma control. **No
hacerlo.** En la primera instalación, `skipWaiting()` + `clients.claim()`
disparan un `controllerchange`, así que **cada primera visita se recargaría
sola**. Medido con Lighthouse: +4,5s de penalización por "multiple page
redirects" y LCP 8.2s. La recarga tras un update la decide el usuario desde el
`UpdateToast`.

---

## 5. Qué funciona sin conexión

| Situación | Resultado |
|---|---|
| Abrir la app (ruta ya visitada) | ✅ Carga del cache `sc-pages` |
| Abrir una ruta **nunca visitada** | ✅ Muestra `/offline.html` (no un error del navegador) |
| JS, CSS y fuentes | ✅ Cache First (`sc-static`) |
| Pósters y backdrops ya vistos | ✅ Cache First (`sc-images`) |
| Íconos, splash, manifest | ✅ Precacheados |
| Cualquier sección con datos (Home, Series, Películas, ficha, Mi lista) | ⚠️ Carga el shell y muestra `OfflineState` con **Reintentar** |
| Votar, agregar a Mi Lista, login | ❌ Falla con aviso (sin Background Sync — ver §6) |
| Trailers de YouTube | ❌ Necesitan red por definición |

**Importante:** "funciona offline" significa que **la app abre y navega**, no que
haya datos. Los datos nunca se cachean, a propósito.

`OfflineState` reintenta solo cuando vuelve la conexión (escucha el evento
`online` vía `useOnline`). Está conectado en `DetailView`, `FilterGrid`,
`CountryGrid` y `PersonView`. Los rieles (`Shelf`) se auto-ocultan si fallan:
mostrar 15 errores iguales en la Home sería peor que no mostrar el riel.

---

## 5.b Precache: crítico vs. opcional

`install` distingue dos niveles, y la diferencia es de seguridad, no de estilo:

```js
const cache = await caches.open(CACHE.static);
await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));   // CRÍTICO, sin catch
await Promise.allSettled(                                          // OPCIONAL
  PRECACHE_OPTIONAL.map((url) => cache.add(new Request(url, { cache: "reload" })))
);
await self.skipWaiting();
```

**El crítico no lleva `catch`.** Si `/offline.html` no se puede traer, la promesa
rechaza, `waitUntil` falla y el SW **no se activa**. Es lo correcto: un SW activo
sin fallback anuncia soporte offline que no puede cumplir, y queda así hasta el
próximo deploy. Es preferible que la app funcione sin SW.

> Esto fue un bug real: la versión anterior tenía `.catch(() => {})` **por
> entrada** dentro de un `Promise.all`, así que `install` no podía fallar nunca y
> activaba SWs sin fallback. Verificado con dos SW de prueba:
> - crítico 404 → `installing → redundant`, no activa ✅
> - crítico OK + opcional 404 → `installing → installed → activating → activated` ✅

## 6. Módulos reservados

Tres archivos existen con los listeners comentados y documentados, para poder
agregar las features **sin refactorizar** la estructura:

| Archivo | Feature | Qué falta para activarlo | Soporte |
|---|---|---|---|
| `sw/push.js` | Web Push | Claves VAPID, tabla `push_subscriptions`, endpoint `/api/push/subscribe` | iOS solo 16.4+ **y ya instalada** |
| `sw/sync.js` | Background Sync | Cola en IndexedDB + `registration.sync.register()` | ❌ No existe en iOS ni Safari |
| `sw/share-target.js` | Web Share Target | Bloque `share_target` en el manifest + ruta `/compartido` | ❌ Solo Android |

---

## 7. Configuración del servidor

`next.config.mjs` fuerza revalidación del SW:

```js
{ source: "/sw.js",     headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }
{ source: "/sw/:path*", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }
```

**Sin esto la app no se puede actualizar nunca:** si el navegador cachea
`/sw.js`, sigue ejecutando el SW viejo indefinidamente.

---

## 8. Assets: una sola fuente de verdad

Todo sale de `assets/brand/logo.svg`:

```bash
node scripts/generate-pwa-assets.mjs
```

Genera 10 íconos + 18 splash + 4 screenshots **y reescribe**
`components/pwa/AppleSplashLinks.tsx`. Si cambia el logo, se re-ejecuta y listo.

La lista de dispositivos iOS vive en `scripts/pwa-devices.mjs` y la comparten el
generador y el componente de `<link>`. **Es a propósito:** si las dos listas se
desincronizaran, el splash no aparecería y iOS caería a pantalla blanca.

Los **maskable** llevan 20% de padding (zona segura del 80%): Android recorta el
ícono a la forma del launcher, y sin ese margen el logo se corta.

Los screenshots actuales son placeholders branded; se pueden reemplazar por
capturas reales sin tocar el manifest.

---

## 9. Detalles de plataforma

| Capacidad | Android | iOS | Escritorio |
|---|---|---|---|
| Instalación | ✅ Automática | ⚠️ Manual (Compartir → Agregar a inicio) | ✅ Automática |
| Banner propio | ✅ `beforeinstallprompt` | ❌ **Solo instrucciones** | ✅ |
| Splash | ✅ Del manifest | ⚠️ 18 imágenes a mano | ➖ |
| Shortcuts | ✅ | ❌ Ignorados | ✅ Jump list |
| `theme_color` | ✅ | ⚠️ Vía meta `apple-*` | ✅ |
| Service Worker | ✅ | ✅ | ✅ |
| Cache API | ✅ | ⚠️ **Desalojo a ~7 días sin uso** | ✅ |

### Limitaciones de iOS (no son bugs — no prometer fixes)

- **Safari no soporta `beforeinstallprompt`.** En iPhone es imposible un botón
  que instale; solo se pueden dar instrucciones.
- **iOS ignora casi todo el manifest** (display, theme_color, shortcuts,
  orientation). Se cubre con meta `apple-mobile-web-app-*` y los 18 splash.
- **Instalar crea un contexto de almacenamiento nuevo.** Se pierden plataformas,
  tema y sesión de Safari. Por eso existe `StandaloneWelcome`: presenta el primer
  arranque como bienvenida y manda a elegir plataformas. Si alguien reporta "se
  borró todo al instalar", **es esto, no un bug**.

### Safe areas

`app/layout.tsx` declara `viewportFit: "cover"`. **Sin eso, todos los
`env(safe-area-inset-*)` devuelven 0** y el CSS de notch queda inerte. De ahí
salen las variables de `globals.css`:

```css
--nav-h: 72px;
--safe-b: env(safe-area-inset-bottom, 0px);
--nav-total: calc(var(--nav-h) + var(--safe-b));
```

`main` usa `padding-bottom: calc(var(--nav-total) + 20px)`. Con un iPhone con
home indicator la barra mide 106px, no 72px: el `92px` fijo que había antes
dejaba el contenido tapado.

---

## 10. Cómo probar

**El SW no corre en `next dev`.** Es deliberado: cachear en desarrollo produce
horas de depuración fantasma. `ServiceWorkerRegister` no registra si
`NODE_ENV !== "production"`.

```bash
npx next build && npx next start
```

Chequeos en DevTools → Application:

- **Manifest**: sin errores, íconos previsualizados
- **Service Workers**: registrado y activado
- **Cache Storage**: `sc-static-v2`, `sc-pages-v2`, `sc-images-v2`
- **Cache Storage NO debe contener respuestas de `/api/*` ni de Supabase** ← el
  chequeo más importante

**Nota sobre Lighthouse:** la categoría PWA **fue eliminada en Lighthouse 12**.
No existe un "PWA score". La instalabilidad se verifica en DevTools → Manifest y
con el hecho de que Chrome ofrezca instalar.

Prueba offline real (más fiable que el modo offline de DevTools):

```bash
# 1. Con el server arriba, visitar / y /peliculas
# 2. Apagar el server
# 3. Navegar: / y /peliculas cargan del cache; /series muestra offline.html
```

---

## 11. Errores que ya cometimos (para no repetirlos)

1. **`const` duplicados entre módulos del SW.** `importScripts` comparte un único
   scope global: dos archivos con `const CACHE` rompen el SW entero con
   `Identifier 'CACHE' has already been declared`. **Cada módulo va envuelto en
   un IIFE.**
2. **Fallback offline buscado en el cache equivocado.** `/offline.html` se
   precachea en `sc-static`, pero `networkFirst` operaba sobre `sc-pages`; el
   `cache.match()` nunca lo encontraba. Se usa **`caches.match()` global**, que
   busca en todos.
3. **`addAll` es atómico.** Si un item del precache falla, no se cachea
   **ninguno** — incluida la página offline. Ahora se cachea item por item con
   `catch` individual.
4. **Recargar en `controllerchange`** hacía que cada primera visita se recargara
   sola (§4).
5. **Usar una ruta de Next como fallback offline** rompe la hidratación (§3).
6. **`install` que no puede fallar.** Con un `.catch()` por entrada, un fetch
   fallido del fallback activaba un SW que anunciaba offline sin tenerlo (§5.b).
7. **Precache sin revisioning.** Sin el hash estampado, editar `offline.html` no
   llegaba nunca a los clientes instalados (§4).

---

## 12. Kill-switch

`docs/kill-switch-sw.js` es un SW mínimo que borra todos los caches, se
desregistra y recarga las pestañas. **No se despliega desde `docs/`**: para
usarlo, copiarlo sobre `public/sw.js` y deployar.

Es la salida de emergencia si un SW publicado queda sirviendo algo roto y no
alcanza con un bump de `CACHE_VERSION`. Instrucciones completas en el encabezado
del archivo.
