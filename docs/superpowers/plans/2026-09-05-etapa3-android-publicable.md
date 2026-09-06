# Etapa 3 — Android publicable (plan, revisión 1)

> Escrito el **5 de septiembre de 2026**, después de cerrar la Etapa 2. Reemplaza
> operativamente la lista de "Etapa 3" de `docs/CAPACITOR.md`, que se escribió
> **antes** del prototipo y quedó desactualizada. Ese texto se conserva ahí como
> historia de lo que se planeaba, no como cola de trabajo.

Rama: **`integracion/capacitor-base`**, nacida de `main` en `5297e25`. **No sale
del spike descartable** — el spike (`spike/capacitor-android`, `5d5180f`) queda
íntegro como archivo de evidencia y no se toca.

## 0. Diagnóstico: qué de la Etapa 3 histórica ya no aplica

La sección "Etapa 3" de `docs/CAPACITOR.md` listaba nueve ítems. **Siete están
resueltos y dos resultaron innecesarios**, y eso lo demostró el prototipo, no una
opinión:

| Ítem histórico | Estado real | Evidencia |
|---|---|---|
| Base URL de la API + CORS | ✅ **hecho y extraído** | `lib/api-base.ts`, `lib/cors.ts`, 26 rutas clasificadas |
| Helper `hrefTitulo`/`hrefPersona` | ✅ **hecho y extraído** | `lib/rutas.ts`; en el teléfono, 304 cards nacieron como `/t/?…` |
| `abrirExterno()` con `@capacitor/browser` | ❌ **INNECESARIO** | CP8 #2: un enlace externo abrió la app de Google Calendar y la WebView **no se secuestró**, quedó en `https://localhost/` |
| `@capacitor/share` | ✅ **hecho y extraído** | CP9: `ChooserActivity` nativo con `https://app.yump.ar/titulo/...` |
| Embed de YouTube | ✅ **funciona sin cambios** | CP10: `videoplayback` 200 y el reloj avanza 8,5 s en dos títulos |
| Gatear `InstallPrompt`, `ServiceWorkerRegister`, `UpdateToast` | ✅ **hecho y extraído** | CP6; en el artefacto `getRegistrations()` → `[]` |
| Adaptador de `@capacitor/preferences` | ❌ **INNECESARIO** | CP8 #14 y #15: la sesión y `sc:platforms` sobreviven a `am force-stop` con `localStorage` |
| `searchParams` de `/categoria` al cliente | ✅ **hecho y extraído** | `CategoriaEntrada` + `CategoriaSkeleton` |
| `tsc`, suite y build limpios | ✅ | 1021/1021, `tsc` 0, build 43/43 en la rama limpia |

🔴 **No se reinstala ni se reimplementa nada de eso.** Dos plugins que el plan
viejo daba por necesarios —`@capacitor/browser` y `@capacitor/preferences`— **no
se instalan**, porque el prototipo demostró que no hacen falta.

### Afirmación operativa corregida

`docs/ESTADO.md` decía *"Capacitor: PAUSADO después de CP6, el spike sigue en
`e4d4a6f`, CP7 sin empezar"*. Era cierto cuando se escribió y dejó de serlo:
la Etapa 2 se completó hasta CP11. Se corrige, porque es una línea de **estado
vigente**, no un registro fechado.

## 1. Trabajo ya resuelto y extraído

Los 84 archivos que trajo la extracción de CP11, en cinco commits
(`29e0176`…`ab48f76`): la bandera `ES_NATIVO`, `apiUrl()`, `lib/rutas.ts`, el
staging del export, CORS con inventario cerrado, la neutralización de la PWA, el
`?tipo=` fuera del Server Component, las rutas `/t` y `/p`, y los tres plugins
con sus adaptadores.

**`lib/compartir.ts` sigue sin tocarse**, y hay un test que lo vigila.

## 2. Primera tanda — aprobada el 5/09

Decisiones que el dueño aprobó y que esta tanda ejecuta:

1. **`/t` y `/p` con `noindex`**, no canonical.
2. **`appId: ar.yump.app`**, nombre visible **Yump**.
3. Los **seis** paquetes de Capacitor pasan a formar parte de la app.

Alcance:

- `noindex` en `/t` y `/p`, RED → GREEN, verificado en el **HTML generado** y no
  sólo por grep. Las rutas normales conservan su metadata.
- `capacitor.config.ts` limpio, **generado**, no copiado del spike.
- `android/` **generado desde cero** con el identificador definitivo.
- Confirmar las seis dependencias en su sección.

⚠️ **`android:enableOnBackInvokedCallback="false"` NO se copia.** En CP9 se
agregó al spike sobre una hipótesis que resultó falsa —la causa del botón Atrás
era `canGoBack`, que no ve las navegaciones `pushState`— y el atributo se
conservó allá por precaución. Acá se arranca **sin él**; si una prueba sobre el
proyecto limpio demuestra que hace falta, se agrega con esa evidencia escrita.

**Esta tanda NO instala el APK en el teléfono.** Termina con el proyecto generado
y compilado.

## 3. Decisiones pendientes — ninguna se toma en esta tanda

| Decisión | Por qué importa | Cuándo |
|---|---|---|
| **Tipo de cuenta de Google Play** | personal u organización cambia requisitos de verificación y tiempos | antes de crear la ficha |
| **Keystore y Play App Signing** | perder la clave de subida es un trámite con Google | antes del primer AAB |
| **Íconos y splash definitivos** | hoy son los de la plantilla de Capacitor | antes de publicar |
| **Notificaciones locales en v1** | define si entra un plugin más | antes de cerrar el alcance de v1 |
| **Reemplazo de Vercel Analytics en Android** | 2 pedidos por arranque, 404, **0 bytes**; en Android no mide nada | medido, §8 |
| **Destino de la cookie `sc_platforms`** | no la lee nadie y en el contenedor ni siquiera puede llegar al servidor | medido, §9 |
| **Subrutas directas y 404 del servidor local** | toda ruta sin punto sirve el `index.html` raíz con 200 | medido, §11 |
| **`.ics`** | anda, pero sale de la app: lo termina descargando Chrome | medido, §10 |
| **iOS** | Mac remota y guideline 4.2 | Etapa 8 |

## 4. Tareas de etapas posteriores

- Íconos, splash y ficha de Play.
- Keystore, Play App Signing y `assetlinks.json` con el SHA-256 correcto.
- Pruebas internas y publicación (Etapas 5 y 6).
- Evaluación del resultado de Android (Etapa 7).
- iOS (Etapas 8 y 9).

## 5. Criterios de cierre de esta tanda

Cierra cuando, **en la rama limpia**:

- `/t` y `/p` emiten `noindex` en el HTML del build web, y siguen presentes y
  funcionales en el export nativo;
- existe `capacitor.config.ts` con `ar.yump.app` / `Yump` / `out-capacitor`, sin
  `server.url` y sin iOS;
- existe `android/` generado con ese identificador, `compileSdk` y `targetSdk`
  36, un solo permiso de sistema (`INTERNET`) y los tres plugins registrados;
- **no queda ni un rastro de `ar.yump.app.dev`** ni rutas absolutas de esta
  máquina versionadas;
- la suite, `tsc`, el build web, el export nativo, `cap sync` y el build Android
  debug pasan;
- la PWA web sigue intacta y el artefacto nativo sigue sin PWA.

## 6. Puntos de parada

🔴 **Se frena y se pide decisión antes de:** crear un keystore o cualquier firma
de publicación, tocar Google Play, instalar el APK en el teléfono, pushear la
rama, mergear a `main`, o empezar la tanda siguiente.

Nada de esta etapa toca Producción, Vercel, Supabase ni sus variables.

## 7. Segunda tanda — diagnóstico del 6 de septiembre de 2026

Sobre el proyecto **regenerado** (`ar.yump.app`, firma debug), instalado en el
motorola edge 60 (Android 16, SDK 36) **junto a** `ar.yump.app.dev`, que no se
tocó. La API fue exclusivamente la Preview aislada ya verificada del spike; no se
creó ninguna Preview nueva ni se tocó Vercel, Supabase ni Producción. `/api/health`
se comprobó antes de abrir la app: `503`, `cache: "memoria"`, credenciales Redis
`url: false` y `token: false`.

Antes de instalar, dentro del APK: `package ar.yump.app`, etiqueta `Yump`,
`targetSdk` 36, un solo permiso de sistema (`INTERNET`), la Preview aislada como
**única** API remota (2 apariciones), **0** de `app.yump.ar/api`, 0 secretos —el
único JWT es `role=anon`—, 0 `sw.js`, 0 `rel="manifest"`, 0 splash, y **0**
apariciones de `enableOnBackInvokedCallback`. Datos de la app recién instalada:
sólo `cache` y `code_cache`, con UID propio. No hereda nada de `.dev`, y no puede:
Android aísla por nombre de paquete.

`app.yump.ar` aparece dos veces y ninguna es la API: una es `NEXT_PUBLIC_SITE_URL`
(el destino del mail de recuperación) y la otra la URL canónica de compartir.

### Regresiones

| | Resultado |
|---|---|
| Arranque | `COLD`, **898 ms** |
| Home con datos | 13 rieles, 107 cards, 0 esqueletos, sin `OfflineState` |
| Ficha y Atrás físico | vuelve al Home y la app sigue en foco; en la raíz sale y la actividad deja la pila. **Sin `enableOnBackInvokedCallback="false"`** |
| Barra de estado | claro `#FAFAFD` con iconos oscuros, oscuro `#0F0E13` con iconos blancos; **una sola** meta `theme-color` |
| Compartir | `ChooserActivity` nativo con `https://app.yump.ar/titulo/movie/324552` |
| Tráiler | reloj 19,75 s → 26,92 s (**+7,17 s** reales), `videoplayback` **200** con 815 KB, `onError` null |
| Service workers y cachés | `getRegistrations()` → 0, `caches.keys()` → 0 |
| Herencia de `.dev` | `localStorage` y `sessionStorage` **vacíos** |

El log del puente lo confirma desde el otro lado: `App.addListener`,
`StatusBar.setStyle` y el `Share.share` con la URL canónica.

⚠️ **El tema se cambió por el arranque, no por el interruptor.** El interruptor
vive en `/cuenta/configuracion`, que exige sesión, y no se usó ninguna cuenta.
`applyTheme` es la MISMA función que llama el interruptor —y la única que llama a
`aplicarBarraDeEstado`—, así que la barra queda verificada; lo que no se repitió
acá es el cambio instantáneo, que ya midió CP9.

⚠️ **Al cerrar el selector de compartir, el Atrás cayó en WhatsApp.** Se salió con
Atrás sin tocar Enviar: **no se envió ningún mensaje**. Queda anotado porque pasó,
no porque sea un defecto de la app.

## 8. Analytics — medido, no estimado

`<Analytics />` y `<SpeedInsights />` (`app/layout.tsx:109-110`) piden sus scripts
al **origen local**, que no los tiene:

| Pedido | Código | Bytes |
|---|---|---|
| `/_vercel/insights/script.js` | **404** (`net::ERR_ABORTED`) | **0** |
| `/_vercel/speed-insights/script.js` | **404** (`net::ERR_ABORTED`) | **0** |

**Dos pedidos por arranque de documento y ninguno más**: durante una ventana de
navegación SPA completa (Home → ficha → atrás → Top) hubo **0** pedidos `_vercel`.
Y como el script nunca carga, **nunca se dispara el beacon**
`/_vercel/insights/view`: en Android estas dos librerías **no miden nada**.

No hay error visible para el usuario: sólo dos avisos de las propias librerías y
dos `404` en consola. Sobre 350 pedidos y 2,53 MB de una sesión de Home, su aporte
es **0 bytes** — y ni siquiera salen a la red, mueren contra el servidor local del
contenedor, así que no consumen datos del usuario ni cuota de Vercel.

🔴 Que den 404 y no la Home es consecuencia de lo mismo que la §11: terminan en
`.js`, tienen punto, y por eso el servidor local los busca como archivo en vez de
devolver el `index.html`.

### Alternativas

| | Costo en Vercel | Servicios extra | Qué se pierde |
|---|---|---|---|
| **1. Apagarlas sólo en nativo** (`{!ES_NATIVO && <Analytics/>}`) | **cero**; la web sigue igual | ninguno | nada: hoy en Android no miden nada |
| **2. Dejarlas fallando** | **cero** | ninguno | nada medible; quedan 2 pedidos y 2 errores de consola por arranque |
| **3. Reemplazarlas más adelante** | el del producto que se elija | uno nuevo | — |

🟡 **Recomendación: la 1.** Es la única que no deja ruido y cuesta cero. La 2 es
aceptable y tampoco cuesta nada; la 3 es una decisión de producto, no de esta
etapa, y **no se adopta ninguna herramienta sin aprobación**. La 1 exige código y
**no se implementó**.

## 9. `sc_platforms` — la contradicción de CP8 era mía

🔴 **El comentario del código es CORRECTO, y la documentación equivocada era la de
esta misma etapa.** `components/PlatformsContext.tsx` dice que la cookie *"nunca
gana y nadie la lee"*, y es exacto. La línea falsa era la del §3 de este plan
—"en el contenedor es lo único que sostiene las plataformas"— y queda corregida.
`docs/CAPACITOR.md` §4 y `docs/PLAY-STORE.md` §4.c ya decían lo correcto.

Quién escribe y quién lee:

| | `localStorage` `sc:platforms` | Cookie `sc_platforms` |
|---|---|---|
| Escribe | `guardar()`, llamada por `toggle` y `set` | `escribirCookie()`, desde `guardar()` **y** desde el efecto de montaje |
| Lee | el efecto de montaje: es la fuente de verdad | **nadie**. `leerCookie()` tiene una sola llamada, y sólo para comparar y no reescribir de gusto |
| Servidor | viaja como `?providers=` | **cero** llamadas a `cookies()` en todo el árbol |

**Lo observado en CP8** —`localStorage` vacío y las plataformas apareciendo— se
reprodujo idéntico en la instalación nueva: `localStorage` `[]` y cookie
`sc_platforms=n,d,m`. La atribución era la equivocada: lo que se mostraba eran
`DEFAULT_PLATFORMS` (`["n","d","m"]`), y la cookie tenía ese mismo valor **porque
la acababa de escribir el efecto de montaje**, no porque alguien la leyera.

**Experimento decisivo**: se puso la cookie en `cr` (sólo Crunchyroll) y se
recargó. Volvió sola a `n,d,m` y el Home no cambió. La cookie no decide nada.

Y en el contenedor **no serviría aunque alguien la leyera**: su dominio es
`localhost` —el servidor local— mientras la API vive en otro origen. Medido: los
tres pedidos (`/api/providers`, `/api/upcoming`, `/api/home`) salen **sin
encabezado `Cookie`**, y las plataformas viajan en `?providers=n,d,m`.

Qué pasa en cada lado:

| | Web | Android recién instalado | Tras cierre forzado |
|---|---|---|---|
| `localStorage` | fuente de verdad | vacío hasta que el usuario elige | **sobrevive** (CP8 #14 y #15) |
| Cookie | espejo que nadie lee | la escribe el montaje con el default | sobrevive, y sigue sin leerse |

Retirarla del camino nativo **no afectaría al Home, al SSR ni a la selección
inicial**, porque hoy no participa de ninguno de los tres. No se cambió nada: la
decisión 9 de `PLAY-STORE.md` §4.c sigue abierta.

## 10. `.ics` — anda, pero se va de la app

Se buscó por la API, **sin escrituras**: `/api/upcoming` dio 97 títulos, 66 con
fecha estrictamente futura, y `/api/title/tv/<id>` confirmó cuáles ofrecen de
verdad el botón (`puedeRecordar` mira `nextAirDate` en series y `digitalAR` en
películas, no `releaseDate`). Caso usado: **Futurama** (`tv/615`, Disney+, próximo
episodio 2026-09-07), abierto por navegación SPA desde el buscador. No hizo falta
ningún fixture.

| Paso | Resultado |
|---|---|
| `fetch` de validación | **200**, `text/calendar; charset=utf-8`, 702 bytes |
| CORS | `access-control-allow-origin: https://localhost` **exacto**, con `vary: …, Origin`. Sin comodín |
| Cabecera de descarga | `content-disposition: attachment; filename="futurama.ics"` |
| `window.location.href = ics` | la WebView **no navega**: Android le pasa la URL a **Chrome** (`capturedLink` en el log de WindowManager) |
| Qué ofrece Chrome | descargar `futurama.ics` a Descargas, con **Cancelar**. Se canceló, así que no se agendó nada |
| La WebView al volver | **intacta**: sigue en `/t/?tipo=tv&id=615` con la ficha y sin error |

El otro camino, Google Calendar, arma bien la plantilla con la fecha correcta
(`dates=20260907/20260908`) y es el que corresponde en Android.

⚠️ **Esto es un hallazgo, no un arreglo.** El `.ics` cumple —el archivo se puede
bajar y la app no se rompe— pero termina en la carpeta de Descargas de otra
aplicación, que es exactamente lo que el comentario de `RecordarButton` marca como
insuficiente en escritorio. Corregirlo exige código y **se frena acá**.

## 11. Subrutas y 404 — causa exacta

La causa está en **`WebViewLocalServer.java:425`** de `@capacitor/android`:

```java
if (path.equals("/") || (!request.getUrl().getLastPathSegment().contains(".") && html5mode)) {
    // sirve basePath + "/index.html"  <- el index.html RAIZ, siempre
}
```

`Uri.getLastPathSegment()` descarta la barra final, así que `/lista/ultimos/` tiene
por último segmento `ultimos`, **sin punto** → cae en el fallback SPA. La rama
**nunca comprueba si existe** `/lista/ultimos/index.html`. O sea: la regla real no
es "subruta o no", es **"¿el último segmento tiene un punto?"**.

Medido pidiéndole al servidor local, con los tamaños de respuesta como firma
inequívoca (raíz 50.396 B, `/lista/ultimos/` 13.874 B, `/top/` 13.629 B):

| Pedido | Sirve | Código |
|---|---|---|
| `/` | raíz (50.396) | 200 |
| `/t/`, `/p/`, `/top/`, `/lista/ultimos/`, `/lista/ultimos`, `/cuenta/configuracion/` | **raíz (50.396)** | 200 |
| `/lista/ultimos/index.html` | **el suyo** (13.874) | 200 |
| `/top/index.html` | **el suyo** (13.629), `<title>Top Yump</title>` | 200 |
| `/404.html` | el 404 de Next (11.321) | 200 |
| `/no-existe-nada` y `/no-existe-nada/` | **raíz** | **200**, nunca 404 |
| `/lista/ultimos/index.htm` | nada | **404** |

La última fila es el control que cierra el caso: con punto y sin archivo hay un 404
de verdad; sin punto no lo hay nunca.

De punta a punta, con `Page.navigate`, **todas** las rutas sin punto terminan
mostrando el **Home** con la barra de direcciones diciendo otra cosa —incluido el
enlace profundo `/t/?tipo=movie&id=278`—, y sólo `/top/index.html` muestra el Top.
El router de Next **no se recupera**: el HTML que llega trae la carga RSC del Home.

| Escenario | Qué pasa |
|---|---|
| Navegación SPA normal | ✅ correcta; es el camino que la app usa siempre |
| Apertura directa de `/t/`, `/p/`, `/lista/ultimos/` | ❌ Home |
| Recarga estando en una subruta | ❌ Home, con la URL de la ficha en la barra |
| Android mata y restaura la actividad | ✅ arranca limpio en `/` con `history.length` 1. **No** intenta restaurar, así que no muestra una pantalla equivocada |
| Ruta inexistente | ❌ Home con **200**; el `404.html` existe pero es inalcanzable |
| `/ruta/` frente a `/ruta/index.html` | el segundo resuelve bien, el primero no |

### Alternativas

Un `RouteProcessor` **no alcanza solo**: en la rama del fallback el procesador se
llama con `"/index.html"` fijo, no con la ruta pedida. Sólo recibe la ruta real en
el `PathHandler`, o sea en los pedidos que **sí** tienen punto.

| | Cómo | Next / build web | Android | iOS | Deep links | `output: export` | Riesgo de pantalla equivocada | Costo |
|---|---|---|---|---|---|---|---|---|
| **A. Dejarlo así** | — | intacto | Home en toda apertura directa | igual | inservibles | compatible | **alto** hoy: recargar pierde la pantalla | cero |
| **B. `server.html5mode: false` + `RouteProcessor` propio** | resuelve `/x/` → `/x/index.html`, y lo inexistente → `404.html` | intacto | resuelve bien y habilita un 404 real | el servidor de iOS es otra clase: **hay que rehacerlo** | los habilita | compatible | bajo | medio: código Java propio a mantener contra cada versión de Capacitor |
| **C. `trailingSlash: false` y rutas `.html`** | `/lista/ultimos.html` | **cambia todas las URLs de la web**, incluidas las indexadas | resolvería por el punto | igual | forzaría `.html` en los enlaces | compatible | bajo | alto, y toca la web pública |
| **D. Enrutar todo por la raíz** | es lo que ya hacen `/t` y `/p` | intacto | correcto por construcción | reutilizable | hay que mapearlos a `/t` y `/p` | compatible | ninguno | bajo, pero **no** arregla la recarga |

🔵 **No se elige ninguna.** `server.url` sigue prohibido y ninguna de éstas lo usa.
La comparación queda para decisión del dueño.

## 12. Qué quedó frenado esperando autorización

Los tres hallazgos que exigen código y **no se tocaron**:

1. Apagar Analytics y Speed Insights en nativo (§8, recomendación 1).
2. El `.ics`, que hoy sale a Chrome (§10).
3. La resolución de subrutas y el 404 (§11, alternativas B/C/D).
