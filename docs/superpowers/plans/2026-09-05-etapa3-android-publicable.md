# Etapa 3 — Android publicable (plan, revisión 1)

> ✅ **ETAPA 3 TERMINADA** el 6 de septiembre de 2026, en cuatro tandas. El
> cierre y lo que queda abierto, en §15. La Etapa 4 (íconos y splash) arranca
> desde acá.

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
| ~~**Reemplazo de Vercel Analytics en Android**~~ | ✅ **RESUELTO el 6/09**: apagadas sólo en nativo. Cero pedidos, cero 404. La web intacta | §8 y §13.a |
| **Destino de la cookie `sc_platforms`** | no la lee nadie y en el contenedor ni siquiera puede llegar al servidor | medido, §9 |
| ~~**Subrutas directas**~~ | ✅ **RESUELTO el 6/09** desde el cliente: cada ruta directa carga su propio index.html, con query y hash. La alternativa B nativa se había probado y descartada. ⚠️ El 404 se ve pero el HTTP sigue siendo 200 | §11, §13.c y §14 |
| ~~**`.ics`**~~ | ✅ **RESUELTO el 6/09**: en Android "Recordarme" va derecho a Google Calendar. En la web el `.ics` sigue igual | §10 y §13.b |
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

## 13. Tercera tanda — 6 de septiembre de 2026

Tres decisiones del dueño. Dos entraron; **la tercera se probó entera y se
revirtió**, que era uno de los dos resultados previstos.

### 13.a Analytics y Speed Insights, apagados sólo en nativo ✅

`app/layout.tsx` monta las dos detrás de `{!ES_NATIVO && …}`.

| | Antes | Después |
|---|---|---|
| Pedidos `_vercel` por arranque en Android | **2**, ambos 404 | **0** |
| Errores de consola por arranque | 2 | 0 |
| `<script>` de Vercel en el DOM | — | 0 |
| Pedidos totales de una sesión de Home | 350 | 344 |
| Bundle de la web | las dos presentes | **sin cambios** |

⚠️ **Esto NO las saca del bundle nativo, y conviene no creer lo contrario.** Son
componentes de CLIENTE importados por un layout de SERVIDOR: Next mete su
implementación en el chunk por el solo hecho de estar importadas. Se midió dos
veces —con el gate en el layout, el chunk salió byte a byte idéntico al de antes;
y moviéndolo a un componente de cliente con el mismo corte adentro, igual—. Lo
que el gate garantiza, y es lo que importa, es que **no se montan**: cero
pedidos, cero 404. Sacarlas de verdad pediría sustituir el módulo en el staging
del build nativo, y eso no se hizo.

### 13.b "Recordarme" en Android: Google Calendar, sin `.ics` ✅

En el contenedor la variante de texto deja de ser un menú de dos filas y pasa a
ser un enlace directo al **mismo** `googleCalendarUrl` que ya usaba la web: mismo
`resumen`, misma `fecha`, mismo constructor. No se duplicó una sola línea de
fechas, títulos ni husos, y hay tests que lo fijan.

Medido con **Futurama** (`tv/615`, Disney+, 2026-09-07):

| | Resultado |
|---|---|
| Enlace | `calendar.google.com/calendar/render?action=TEMPLATE&…&dates=20260907%2F20260908` |
| Pedidos a `/api/recordatorio` o `.ics` | **0** |
| Qué abre | la app **Google Calendar**, en la pantalla de crear evento |
| ¿Guarda solo? | **no**: ofrece × y Guardar, y la decisión queda en el usuario |
| Evento guardado tras cancelar | **ninguno** (consultado el proveedor de calendario: *No result found*) |
| Archivo en Descargas | **ninguno** nuevo |
| Al volver | Yump sigue en `/t/?tipo=tv&id=615` con la ficha |
| Plugins nuevos | **ninguno**. Sin `@capacitor/browser`, sin permisos nuevos |

En la web no cambia nada: siguen las dos filas, el `.ics` sigue vivo, el endpoint
`/api/recordatorio` no se tocó y `googleCalendarUrl` conserva sus parámetros.

⚠️ Igual que en Analytics, la etiqueta de la fila del `.ics` **sigue en el
bundle** nativo —misma causa, mismos 3 chunks antes y después—; lo que no ocurre
es que se ofrezca.

### 13.c 🔴 Alternativa B para subrutas: PROBADA Y REVERTIDA

**No es apta.** Se implementó completa, se compiló, se instaló y se midió en el
teléfono antes de descartarla.

**El gate técnico lo pasaba.** El punto de extensión existe y es público en
Capacitor Android 8.5.1: `RouteProcessor` y `ProcessedRoute` son interfaces
públicas, `BridgeActivity.bridgeBuilder` es `protected`, y
`Bridge.Builder.setRouteProcessor` y `CapConfig.Builder.setHTML5mode` son
`public`. Nada de parchear `node_modules`, copiar `WebViewLocalServer`, forkear,
reflexión ni `server.url`.

**Lo que falla está ANTES del punto de extensión.** `handleLocalRequest` decide
si responde antes de llamar al `PathHandler`, y su última rama es:

```java
int periodIndex = path.lastIndexOf(".");
if (periodIndex >= 0) { ...responde... }
return null;
```

Una ruta **sin ningún punto** —`/top/`, `/t/`, `/lista/ultimos/`— sale por ese
`return null`. Para la WebView eso significa "resolvelo vos", y como
`https://localhost` no existe fuera del contenedor, la navegación **falla**.

Medido en el teléfono, con el resolvedor puesto:

| Pedido | `html5mode` **apagado** (alternativa B) | `html5mode` prendido (como está) |
|---|---|---|
| `/` | 200, Home ✅ | 200, Home ✅ |
| `/top/` | **`Failed to fetch`** ❌ | 200, **Home** (49.701 B) ❌ |
| `/buscar/` | **`Failed to fetch`** ❌ | 200, **Home** ❌ |
| `/lista/ultimos/?tipo=tv` | **`Failed to fetch`** ❌ | 200, **Home** ❌ |
| `/t/?tipo=movie&id=278` | **`Failed to fetch`** ❌ | 200, **Home** ❌ |
| `/p/?id=287` | **`Failed to fetch`** ❌ | — |
| `/cuenta/configuracion/` | **`Failed to fetch`** ❌ | — |
| `/no-existe-nada` | **`Failed to fetch`** ❌ | 200, **Home** ❌ |
| `/lista/ultimos/index.html` | 200, la suya ✅ | 200, la suya ✅ |
| `/404.html` | 200, la de Next ✅ | 200 ✅ |

Los dos experimentos se corrieron sobre el mismo APK cambiando **sólo** esa
bandera, así que la atribución es directa: con la bandera prendida el
`RouteProcessor` ni llega a ver la ruta —esa rama lo llama con `"/index.html"`
fijo—, y con la bandera apagada no hay respuesta.

**O sea que la alternativa B no puede cumplir el contrato: lo empeora.** Deja seis
de las siete rutas obligatorias sin cargar, en vez de cargarlas con la pantalla
equivocada. Se revirtió entera —`RutasExportadas.java`, sus 23 tests JUnit,
`MainActivity` y el guard de repositorio— y quedó, en su lugar, un comentario en
`MainActivity` que explica por qué no se vuelve a intentar por ese camino.

Se verificó después de revertir que las subrutas volvieron **exactamente** al
estado documentado en §11, ni mejor ni peor.

#### Lo que sí quedó aprendido, para la próxima vez

- El resolvedor en sí era correcto: 23 casos JUnit en verde, con canario —al
  quitar el rechazo de traversal fallaban 5—, cubriendo raíz, query, ruta
  inexistente, archivo estático, barra final y sin barra, y traversal simple,
  codificado, con barra invertida y hacia un archivo con extensión. La estrategia
  era lista blanca **por existencia** (sólo se reescribe si el archivo está de
  verdad en `assets/public`), con el rechazo de rutas peligrosas antes de la
  regla que deja pasar los archivos con extensión.
- **La única salida real es reemplazar `shouldInterceptRequest`**, o sea el
  servidor local de Capacitor. Eso es exactamente lo que el dueño excluyó, y con
  razón: sería código propio en el camino crítico de cada pedido, a mantener
  contra cada versión de Capacitor.
- Queda una alternativa que **no** se probó y que no toca Android: que la propia
  app, al arrancar en la raíz con una URL que no es la raíz, se reencamine del
  lado del cliente. No estaba en el alcance de esta tanda.

### 13.d Estado de las decisiones

| Decisión | Estado |
|---|---|
| Analytics/Speed Insights sólo en web | ✅ hecho y medido |
| "Recordarme" nativo por Google Calendar | ✅ hecho y medido |
| Alternativa B para subrutas | 🔴 **probada y revertida**: no apta |
| `sc_platforms` | intacta, no se tocó |
| `.ics` en la web | intacto |
| `server.url` | no se usa |

## 14. Cuarta tanda — subrutas resueltas desde el cliente (6/09)

🟢 **Las subrutas directas quedan RESUELTAS.** Después de que la alternativa B
—nativa— se probara y se descartara (§13.c), quedaba una sola vía: recuperar la
ruta del lado del cliente al arrancar. Funciona, y se verificó en el teléfono.

### 14.a Cómo funciona

Un `<script>` de 2,5 KB en el `<head>`, antes que cualquier recurso de Next, con
dos fases:

| Fase | Cuándo | Qué hace |
|---|---|---|
| **1. Saltar** | llegó el `index.html` raíz donde debía llegar otra página | `location.replace("/top/index.html?…#…")` — el servidor **sí** resuelve las rutas con punto |
| **2. Limpiar** | ya llegó el documento correcto | `history.replaceState(…, "/top/?…#…")` antes de que Next hidrate |

La fase 2 es la que hace que `usePathname()` lea `/top/` y que la pestaña de la
barra inferior se marque sola. Y las dos usan `replace`, no `assign`: **no queda
una entrada de más en el historial**, medido abajo.

El arranque normal —`/`— sale por la primera regla sin hacer nada.

**El orden de las reglas** (`scripts/rutas-nativas.mjs`):

1. rechazo de rutas peligrosas — **antes que todo**;
2. la vuelta (`…/index.html`): es la marca de que el salto ya ocurrió, y es lo
   que hace **imposible el bucle**;
3. la raíz;
4. la lista blanca;
5. los archivos con extensión, intactos —acá cae `/404.html`, que es lo que evita
   que rebote sobre sí mismo—;
6. todo lo demás, el 404 local.

🔴 **El rechazo va primero, y eso no es prudencia: es un bug que ya pasó.** Estaba
tercero, después de la regla de la vuelta, y `/top/./index.html` **termina** en
`/index.html`: entraba por ahí y salía como `{limpiar, "/top/./"}`, o sea que un
traversal se colaba a la barra de direcciones. Lo agarró un test antes de llegar
al teléfono.

### 14.b Dónde se inyecta, y por qué ahí

En **`scripts/build-capacitor.mjs`, sobre el artefacto ya exportado**, justo
después de publicarlo. Es el punto mínimo, y elige ese lugar por dos razones:

- 🔴 **La lista de rutas sale de recorrer el artefacto**, buscando los
  directorios que de verdad tienen un `index.html`. **No hay un segundo
  inventario que se pueda desincronizar**: si mañana entra o sale una ruta, la
  lista cambia sola en el mismo build. Hoy son 33 rutas en 36 archivos HTML, y un
  test recalcula la lista desde el artefacto y la compara con la embebida.
- 🔴 **La web no puede incluirlo ni por accidente.** No pasa por
  `app/layout.tsx` ni por ningún bundle. Un test comprueba que el guion no
  aparece en `.next/`.

🔴 **El guion embebe las funciones reales con `toString()`**, no una copia escrita
a mano. Lo que corre en el teléfono es exactamente lo que prueban los tests, y hay
un test que **ejecuta el guion serializado** con un `location`/`history` de
mentira y compara su comportamiento contra el módulo, caso por caso.

### 14.c Contrato mínimo, medido en el teléfono

| Pedido | Navegaciones | URL final | Resultado |
|---|---|---|---|
| `/` | 1 | `/` | Home, el guion no hace nada |
| `/top/` | 2 | `/top/` | **Top Yump**, pestaña Top marcada |
| `/buscar/` | 2 | `/buscar/` | **"¿Qué vemos hoy?"**, pestaña Buscador marcada |
| `/lista/ultimos/?tipo=tv` | 2 | `/lista/ultimos/?tipo=tv` | **"Últimos lanzamientos"** con el toggle en **Series** y 20 series |
| `/t/?tipo=movie&id=278` | 2 | `/t/?tipo=movie&id=278` | la ficha de **Cadena perpetua** |
| `/p/?id=287` | 2 | `/p/?id=287` | la filmografía de **Brad Pitt** (El club de la lucha, Seven…) |
| `/cuenta/configuracion/` | 2 | `/cuenta/` | carga y el guard de sesión de la app manda a "Ingresar" |
| `/no-existe-nada` | 2 | `/404.html` | el **404 local**, no el Home |

**El control que cierra la query**: `/lista/ultimos/` **sin** query abre en
Películas, y con `?tipo=tv` abre en Series. No es que la query sobreviva en la
barra: llega a la aplicación y la decide.

### 14.d Lo demás que se comprobó

| | Resultado |
|---|---|
| **Historial** | +1 por navegación, siempre (1→2→3…→9 en ocho aperturas directas). `location.replace` no agrega entradas |
| **Recarga en `/lista/ultimos/?tipo=tv`** | conserva la pantalla y la query; **no** vuelve al Home; el historial no crece |
| **Navegación SPA** | Home → ficha: `performance.getEntriesByType("navigation").length` sigue en **1**. El guion no se ejecuta de nuevo |
| **Atrás** | ficha → Home sin recarga de documento; y desde el Home abierto directamente, Atrás vuelve al Top correcto |
| **Bucles** | ninguno: abrir `/top/`, ir al Home por SPA y volver con Atrás da `Top Yump`, con una sola navegación de documento |
| **Archivos estáticos** | `/brand/…png` 200 (73 KB), `/top/index.txt` 200 (el payload RSC que usa el prefetch), `/404.html` 200; un chunk inexistente sigue dando 404 |
| **Consola** | sin errores |

### 14.e ⚠️ Limitaciones reales

1. 🔴 **NO hay un HTTP 404 de verdad.** Una ruta desconocida termina en
   `/404.html`, que el servidor local sirve con **HTTP 200**. Lo que cambia es lo
   que se VE: antes salía el Home, ahora sale el documento de "no encontrado".
   El código HTTP no se puede controlar desde acá, y del lado nativo tampoco
   (§13.c).
2. **La URL de una ruta desconocida queda como `/404.html`**, no como la que se
   pidió.
3. ⚠️ **Ese 404 es el de Next por defecto**: dice *"This page could not be
   found"*, en inglés, sin la tipografía ni la navegación de Yump, y sin forma de
   volver. Funciona, pero desentona con una aplicación entera en castellano.
   Arreglarlo es agregar `app/not-found.tsx`, y eso **cambiaría también la web**,
   que esta tanda tenía prohibido tocar. Queda como pendiente aparte.
4. **La apertura directa cuesta una navegación extra** (dos cargas de documento en
   vez de una). Sólo en la apertura directa; el arranque normal no paga nada.
5. La recuperación depende de que **cada ruta tenga su `index.html`** en el
   artefacto, que es lo que produce `output: export` con `trailingSlash`. Un test
   comprueba que no haya archivos sin extensión en el artefacto, que serían
   inalcanzables.

### 14.f Qué NO se tocó

`server.url` sigue sin usarse · `node_modules` intacto · `WebViewLocalServer` sin
copiar · sin reflexión ni APIs privadas · `trailingSlash` sin cambiar y ninguna
URL pública convertida a `.html` · **cero** dependencias, plugins, permisos y
llamadas externas nuevas · **cero** costo en Vercel, Supabase, Upstash o TMDB (el
guion es un archivo local que ya viajaba en el APK) · `sc_platforms` intacta · la
web sin un solo cambio.

`MainActivity` sigue siendo la clase vacía de siempre, con el comentario que
explica por qué no lleva un `RouteProcessor`.

## 15. ✅ ETAPA 3 TERMINADA — 6 de septiembre de 2026

Cuatro tandas, todas auditadas. Los criterios de §5 están satisfechos y las tres
decisiones que la etapa tenía abiertas quedaron cerradas con medición, no con
opinión. Lo que sigue pendiente pertenece a etapas posteriores.

### Qué quedó resuelto

| | Estado |
|---|---|
| **Subrutas directas** | ✅ **resueltas para el usuario**: abrir `/top/`, `/t/?tipo=movie&id=278` o `/lista/ultimos/?tipo=tv` carga la pantalla correcta, con query y hash. Recargar conserva la pantalla |
| **404** | ⚠️ **se ve, pero responde HTTP 200.** Una ruta desconocida muestra el documento local de "no encontrado" en vez del Home; el código de estado no se puede controlar (§14.e) |
| **Analytics y Speed Insights** | ✅ **apagados en nativo**: cero pedidos y cero 404 en Android, donde no medían nada. La web sin cambios |
| **"Recordarme"** | ✅ en Android **abre Google Calendar**, sin `.ics`, sin descargas y sin plugins nuevos. En la web el `.ics` sigue igual |
| **`sc_platforms`** | ✅ **se conserva sin cambios**, por decisión del dueño. Medido: no la lee nadie, y en el contenedor su dominio es `localhost` así que ni siquiera puede llegar a la API |
| **Identificador** | ✅ **`ar.yump.app`** es el definitivo, con nombre visible **Yump**. Compilado, instalado y probado |
| **`/t` y `/p`** | ✅ `noindex, nofollow` en el HTML de la web; presentes y funcionales en el artefacto nativo |
| **Proyecto Android** | ✅ generado limpio: `compileSdk`/`targetSdk` 36, `minSdk` 24, **un solo permiso** (`INTERNET`), tres plugins |
| **PWA** | ✅ intacta en la web, ausente del artefacto nativo |
| **Higiene** | ✅ cero rastros de `ar.yump.app.dev`, cero rutas absolutas versionadas, cero secretos en el artefacto |

### Lo que NO entra en Etapa 3 y hay que integrar antes del paquete publicable

🔴 **Próximamente y "¿No sabés qué ver?" tienen cambios pendientes que todavía no
se integraron a esta rama.** No son parte de la Etapa 3 y no se tocaron en
ninguna de sus cuatro tandas. **Se integran antes de armar el paquete publicable**
y conviene tenerlo presente: un AAB armado antes de esa integración no llevaría
esos cambios.

### Pendientes que pertenecen a etapas posteriores

Tipo de cuenta de Google Play · keystore y Play App Signing · ficha de Play ·
`assetlinks.json` · deep links · notificaciones locales en v1 · iOS · y el
**404 propio**, que hoy es el de Next por defecto y cuyo arreglo tocaría también
la web.

### Estado de la rama al cerrar

`integracion/capacitor-base`, nacida de `main` en `5297e25`, **local y sin
pushear**. `main` y Producción sin un solo cambio. El spike descartable sigue
archivado en `5d5180f` y no se tocó.

## 16. Etapa 4 — íconos y pantalla de inicio nativos (6/09)

Primera pieza de la Etapa 4. **Aprobada visualmente por el dueño** mirando las
previews a tamaño real, no descrita.

### 16.a La fuente, y una corrección a la documentación

🔴 **`assets/brand/logo.svg` NO es la fuente de la marca, aunque `CLAUDE.md` lo
llame "fuente única de verdad".** Es un placeholder anterior —un cuadrado naranja
liso con un triángulo— que no se parece a la marca actual. Se nota hasta en el
color: dice `#FF6A1A` afirmando ser "el mismo `--accent` de globals.css", y
`--accent` es `#F58634`. Y tampoco es cierto que de ahí salgan los assets de la
PWA: `scripts/generate-pwa-assets.mjs` lee `public/brand/yump-icon.png`.

La fuente real son los cuatro archivos que pasó el dueño el 6/09, ahora en el
repo:

| Archivo | Tamaño | Qué es |
|---|---|---|
| `assets/brand/yump-simbolo.png` | 1200×1200 | el símbolo solo |
| `assets/brand/yump-simbolo-circular.png` | 286×287 | el mismo, ya recortado en círculo |
| `assets/brand/yump-logo.png` | 1000×1000 | símbolo + "yump" en gris oscuro |
| `assets/brand/yump-logo-blanco.png` | 1000×1000 | símbolo + "yump" en blanco |

**`logo.svg` se dejó sin tocar**: borrarlo o reemplazarlo es una decisión que el
dueño todavía no tomó.

### 16.b 🔴 La flecha es un calado, no pintura blanca

Verificado muestreando píxeles: en el centro de la flecha el alfa es **0** en los
cuatro archivos. **La flecha toma el color de lo que tenga detrás.** Eso ordena
todo el generador: se aplana sobre blanco antes de componer, y el fondo del ícono
adaptativo es blanco.

Es también la explicación de un efecto visible: en el splash **oscuro** la flecha
se ve oscura y no blanca. El dueño lo vio así y lo aprobó. Si alguna vez se la
quiere blanca ahí, hace falta una versión del logo con la flecha pintada.

### 16.c Qué va en cada lado, y por qué no es lo mismo

| | Qué lleva | Por qué |
|---|---|---|
| **Ícono del lanzador** | **sólo el símbolo** | medido a tamaño real: con el texto adentro, a 48 px "yump" es una mancha ilegible. Y Android ya escribe *Yump* debajo del ícono, así que el nombre saldría dos veces |
| **Pantalla de inicio** | **el bloque con "yump"** | ahí se ve grande, se lee perfecto, y es el único lugar donde la app dice su nombre |

Las dos decisiones son del dueño, tomadas el 6/09 sobre la comparación a 48, 72,
96, 144 y 192 px.

### 16.d 🔴 Por qué el símbolo no va a sangre

Se intentó el ícono de color de borde a borde —que es como se ven las dos piezas
de marca que pasó el dueño— y **no funciona**: el sistema recorta los **72dp
centrales** del ícono adaptativo **antes** de aplicar la máscara, así que una
marca que llega justo al borde pierde el 33% exterior. Medido: la burbuja
desaparecía y quedaba una flecha gigante partida.

Un ícono a sangre necesitaría una fuente con **sangrado** —el degradado siguiendo
más allá de la marca—, y estirarlo o inventarlo sería dibujar marca nueva. Así
que el símbolo se inserta sobre blanco, al **50%** del lienzo: el máximo que deja
los vértices redondeados justo en el borde del círculo garantizado, que es lo que
da el aspecto lleno de las piezas de marca.

Geometría: lienzo 432 px (108dp a xxxhdpi), área visible 288 (72dp), círculo
garantizado 264 (66dp).

### 16.e Lo que se generó

`node scripts/generate-android-assets.mjs` escribe **44 archivos** y es
re-ejecutable; `--previews <carpeta>` genera lo mismo sin tocar `android/`.

- `ic_launcher.png` y `ic_launcher_round.png` heredados, 48 a 192 px;
- `ic_launcher_foreground.png` adaptativo, 108 a 432 px;
- **`ic_launcher_monochrome.png`**, que no existía;
- `splash.png` en vertical y horizontal, cinco densidades, **en claro y en
  oscuro** (`-night`), más el fallback sin densidad.

Entra la capa `<monochrome>` en los dos XML adaptativos: Android 13+ la tiñe con
el color del tema del usuario. **La silueta sale sola del calado de la flecha**,
no se dibujó nada.

El splash oscuro es un agregado sobre la plantilla, que sólo traía la variante
clara: sin él, quien tenga el sistema en oscuro veía un destello blanco al abrir.

### 16.f Verificación

`BUILD SUCCESSFUL` · el APK declara `ar.yump.app` con etiqueta **Yump**,
`targetSdk` 36 y **un solo permiso** (`INTERNET`) · el adaptativo empaquetado
tiene `background`, `foreground` y `monochrome` · 25 entradas de `ic_launcher` y
44 de `splash` dentro del APK.

⚠️ **Probado en el teléfono el 6/09 — ver §17.** El ícono salió bien; **la pantalla de inicio no**: Android muestra el ícono del lanzador, no el splash con "yump". Lo que sigue de este párrafo describe el estado de aquel momento. Las previews de control se
hicieron desde los archivos que quedaron escritos en `android/`, que es lo que va
en el APK, no desde la fuente. Falta la confirmación en pantalla real.

**La PWA web no se tocó**: cero cambios en `public/`, `app/` y
`generate-pwa-assets.mjs`. Son dos juegos de recursos y dos scripts.

### 16.g Lo que sigue sin empezar

Firma y keystore · Play App Signing · ficha de Play · `assetlinks.json` · deep
links · notificaciones locales · 404 propio · iOS · y la integración de
Próximamente y "¿No sabés qué ver?", que sigue pendiente antes del paquete
publicable.

## 17. Etapa 4 — prueba visual en el teléfono (6/09)

Sobre el APK de `72be8a6`, **sin recompilar**: se comprobó que los 42 PNG del
árbol están byte a byte dentro del APK, y que desde el commit de recursos
(`1234682`) hasta HEAD sólo cambió documentación.

motorola edge 60, Android 16. **No se abrió la API ni la Preview**: esta prueba
es visual.

### 17.a El ícono: ✅ correcto

En el cajón de aplicaciones aparece **Yump** con el símbolo sobre blanco, con la
máscara **cuadrada redondeada** que aplica el lanzador de Motorola. Idéntico a lo
aprobado: nada recortado, tamaño correcto, sin rastro del ícono X de Capacitor.

`Yump Dev` sigue con su ícono viejo y sin tocar (`lastUpdateTime` del 5/09).

⚠️ **En el cajón hay TRES entradas llamadas "Yump"**, y no es un defecto de esta
tanda: son la app nativa **más dos WebAPK de Chrome**
(`org.chromium.webapk.a0e4563c9e8465aed_v2` y `…ad21783079edeeff7_v2`), o sea la
PWA instalada dos veces. Se ven casi iguales porque comparten la marca. Cuando se
publique conviene tenerlo presente.

⚠️ **El ícono monocromático no se pudo activar.** La capa está bien: el
`ic_launcher.xml` empaquetado declara `background`, `foreground` y `monochrome`,
y el recurso renderizado se ve correcto. Pero el lanzador de Motorola no expone
un interruptor de íconos tematizados por `adb`; hay que activarlo a mano en
Personalizar. **Queda sin verificar en pantalla real.**

### 17.b 🔴 El splash aprobado NO es el que muestra Android

**Esto es una diferencia real respecto de lo aprobado, y por eso no se tocó ni un
archivo.**

Lo que se ve al abrir, en claro y en oscuro, es **el ícono del lanzador —sólo el
símbolo— centrado sobre un fondo liso**. La pantalla con la palabra "yump" que el
dueño aprobó **no aparece nunca**.

La causa está en el tema y es anterior a esta tanda:

```xml
<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
    <item name="android:background">@drawable/splash</item>
</style>
```

Con `targetSdk 36`, la pantalla de inicio la maneja la **SplashScreen API**, que
no mira `android:background`. Usa `windowSplashScreenBackground` y
`windowSplashScreenAnimatedIcon`, **ninguno de los dos está declarado**, así que
el sistema cae a su default: fondo liso del tema + **el ícono de la aplicación**.

🔴 **Los 44 `splash.png` que se generaron son, en Android 12+, peso muerto** —
igual que lo eran los de la plantilla, que tenían el mismo problema. No es una
regresión introducida acá: es un defecto heredado que esta prueba destapó.

Efectos secundarios visibles del mismo mecanismo: el sistema toma la capa
**foreground** del ícono adaptativo, **sin** su fondo blanco, así que la flecha
—que es un calado— toma el color del fondo del splash y se ve gris en vez de
blanca; y el símbolo se recorta en un cuadrado de bordes duros.

✅ **Lo que sí está bien: no hay destello blanco.** Con el sistema en oscuro el
fondo del arranque es oscuro y la app entra en oscuro, sin ningún fogonazo. Con
el sistema en claro, todo claro. La secuencia medida en las dos es: fondo del
sistema con el ícono → fondo liso → la app.

**No se corrigió nada**: arreglarlo pide tocar el tema y los recursos, y el
mandato pedía frenar ante cualquier diferencia visual. La corrección mínima sería
declarar `windowSplashScreenBackground` y `windowSplashScreenAnimatedIcon` en un
`values-v31/styles.xml`, decidiendo antes si el ícono del arranque lleva o no la
palabra "yump" — porque la SplashScreen API lo muestra dentro de un círculo
chico, donde el texto volvería a ser ilegible.

### 17.c El estado real de las dos fuentes de marca

Verificado leyendo los dos generadores, no la documentación:

| | Fuente real | Comando | Escribe en |
|---|---|---|---|
| **Web / PWA** | `public/brand/yump-icon.png` | `generate-pwa-assets.mjs` | `public/icons/`, `public/splash/` |
| **Android** | `assets/brand/yump-simbolo.png`, `yump-logo.png`, `yump-logo-blanco.png` | `generate-android-assets.mjs` | `android/app/src/main/res/` |

**`assets/brand/logo.svg` no lo lee nadie**: no aparece en ninguna ruta de
`scripts/`, `app/`, `components/` ni `lib/`. Es un placeholder huérfano.

⚠️ **No hay riesgo de que el generador de la PWA pise la marca con un
placeholder.** Se comprobó replicando su transformación **sin escribir en
`public/`**: lo que produciría hoy es **pixel a pixel idéntico** (diferencia media
0,00/255) a lo que ya está publicado. El generador nunca leyó el SVG.

**El riesgo real es la deriva**: son el mismo dibujo con encuadres distintos —el
de la web conserva la cola de la burbuja, el de Android la recorta en cuadrado— y
cambiar una fuente no actualiza la otra. Unificarlas tocaría los íconos de la
web, así que **queda como decisión pendiente del dueño** y no se implementó.

⚠️ `assets/brand/yump-simbolo-circular.png` quedó versionado pero **ningún
generador lo usa**. Se conserva como pieza de marca; no es una dependencia.

## 18. Etapa 4 — la pantalla de inicio, resuelta (6/09)

🟢 **La marca completa aparece al arrancar, en claro y en oscuro**, y el símbolo
suelto no se ve nunca. Verificado grabando el arranque real y mirándolo cuadro a
cuadro.

### 18.a Ganó la Alternativa A, y eso fue una sorpresa

El mandato preveía que la SplashScreen API podía no servir —que Android
achicaría o recortaría el bloque dentro de su máscara circular— y dejaba
preparada una Alternativa B con una fase propia encima. **No hizo falta: la A
cumple todo.**

La clave es el tamaño, y es aritmética, no gusto. La ranura del ícono del sistema
es un lienzo de **288dp** del que sólo se ve un **círculo de 192dp** (66,7%), y
Android enmascara. El bloque de marca es casi cuadrado, así que manda su
diagonal: para entrar entero, su ancho no puede pasar de **0,667 / 1,44 = 46%**
del lienzo. Con ese número entra completo y se lee.

**Alternativa B quedó descartada por innecesaria**, no por mala. Habría pedido
una capa nativa encima de la WebView con su propio ciclo de vida —cuándo
mostrarla, cuándo sacarla, qué pasa si el JavaScript tarda o falla— y eso es más
superficie de la que el problema justifica cuando el camino del sistema alcanza.

### 18.b Qué se tocó

| Archivo | Qué hace |
|---|---|
| `values-v31/styles.xml` y `values-night-v31/` | declaran `windowSplashScreenBackground`, `windowSplashScreenAnimatedIcon` y `postSplashScreenTheme`. **Son los únicos atributos que la SplashScreen API mira**; `android:background` lo ignora, que era la causa |
| `values/colors_splash.xml` y `values-night/` | el color del arranque: `#FAFAFD` y `#0F0E13`, los mismos con los que abre la app |
| `values/styles.xml` | se le agregó `android:windowBackground` al tema de la app |
| `drawable/splash_logo.png` y `drawable-night/` | el bloque con "yump", generado al 46% |
| `generate-android-assets.mjs` | genera esos dos, con el porqué del 46% escrito al lado |

🔴 **`android:windowBackground` no es adorno.** Entre que la pantalla de inicio se
va y la WebView pinta hay un hueco de unos 300 ms. Sin declararlo, ese hueco
quedaba en manos del default de AppCompat —que acertaba de casualidad—; ahora es
exactamente el mismo color, así que no hay destello posible en ninguno de los dos
temas.

⚠️ **No se declara `windowSplashScreenAnimationDuration`.** Ese atributo sólo
alarga la pantalla para lucir el logo, y hay un guard que falla si alguien lo
agrega. Tampoco se usa `windowSplashScreenBrandingImage`: Android la desaconseja
y la pone **abajo**, no centrada — serviría para decir que "yump aparece" sin que
la marca esté donde tiene que estar.

### 18.c Medido en el teléfono, cuadro por cuadro

Grabado a 10 cuadros por segundo en el motorola edge 60 con Android 16.

| | Frío en oscuro | Frío en claro | Caliente / regreso |
|---|---|---|---|
| Marca completa "yump" | **sí**, ~600 ms | **sí**, ~500 ms | no hay pantalla de inicio |
| Símbolo suelto | **nunca** | **nunca** | — |
| Cuadrado de bordes duros | **no** | **no** | — |
| Destello | **ninguno**: oscuro de punta a punta | **ninguno**: claro de punta a punta | va directo a la app |
| Dos pantallas distintas | no | no | no |
| Llega a la app | sí, ~2,4 s | sí, ~2,2 s | sí, ~100 ms |

El arranque caliente **no muestra ninguna pantalla de inicio**: pasa directo a la
app con su estado anterior. Era el riesgo de "dos splash seguidos" y no ocurre.

⚠️ **Una cosa que se ve en las grabaciones y conviene entender.** Con el sistema
en claro, la app puede abrir en oscuro: el fondo del arranque lo decide el
**sistema**, y el tema de la app lo decide `sc:theme` en `localStorage`. Si el
usuario eligió oscuro y su teléfono está en claro, va a ver un arranque claro y
después la app oscura. **No tiene arreglo desde Android**: la pantalla de inicio
corre antes de que exista JavaScript, así que no puede consultar esa preferencia.
No es un defecto de este cambio.

### 18.d Lo que NO se tocó

🔴 **El ícono del lanzador quedó byte a byte idéntico**: los 20 PNG
(`ic_launcher`, `_round`, `_foreground`, `_monochrome` × 5 densidades) tienen el
mismo hash que en `e0b46c3`. Hay además un guard que falla si el ícono adaptativo
llegara a apuntar al logotipo.

🔴 **Los 44 `splash.png` heredados se conservan.** En Android 12+ son peso
muerto, pero `minSdk` es 24 y no hay evidencia sobre Android 11 y anteriores.
Borrarlos pediría probar todo ese rango, que no se hizo. Un guard falla si
desaparecen.

**Cero dependencias nuevas.** No se instaló `@capacitor/splash-screen`: sus
opciones tradicionales no controlan el arranque bajo Android 12, así que habría
agregado paquetes para no resolver el problema. **Cero permisos nuevos**: sigue
habiendo uno solo, `INTERNET`.

**La web y la PWA no se tocaron**: cero cambios en `public/`, `app/`,
`components/` y `generate-pwa-assets.mjs`.
