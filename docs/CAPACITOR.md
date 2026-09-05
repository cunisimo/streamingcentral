# Capacitor: auditoría y diseño técnico (Android + iOS)

**Etapa de auditoría y diseño. No se instaló Capacitor, no se creó ningún
proyecto Android ni iOS, no se tocó una línea de código de la app, no se
desplegó nada y no se escribió en Supabase.** Lo único que cambia este trabajo
es documentación, en la rama `docs/capacitor-auditoria`.

**Fecha: 28 de agosto de 2026.** Punto de partida: `main` = `origin/main` =
`210aa06`, desplegado en `app.yump.ar`.

---

## Cómo leer este documento

Misma convención que `docs/PLAY-STORE.md`, y por el mismo motivo: no mezclar lo
verificado con lo opinado.

| Marca | Qué significa |
|---|---|
| ✅ **CONFIRMADO** | Verificado en el código de este repo, con archivo y línea |
| 🔵 **DECISIÓN** | Depende del dueño. No la tomo yo |
| 🔍 **VERIFICAR** | No se puede saber desde el repo: hay que probarlo en el spike o mirar un panel |
| 🟡 **RECOMENDACIÓN** | Mi criterio. **No es asesoramiento legal.** Nada de lo que sigue lo es |

**Advertencia sobre las versiones.** Todo lo que digo de Capacitor, de las
políticas de Apple y de las de Google sale de conocimiento general, **no de
haber corrido Capacitor contra este repo ni de haber abierto las consolas hoy**.
Los defaults de una versión mayor de Capacitor cambian entre versiones. Todo lo
que dependa de eso está marcado 🔍 y hay que confirmarlo en la Etapa 0.

---

## 0. VEREDICTO — Etapa 2 cerrada el 5 de septiembre de 2026

> 🟢 **Capacitor es viable para Yump en Android, y se recomienda avanzar a una
> implementación publicable.** La arquitectura de este documento —cáscara local
> en el binario + API remota en Vercel, **sin `server.url`**— se probó entera en
> un motorola edge 60 con Android 16, `appId ar.yump.app.dev` y firma debug.
>
> Funcionó: PWA neutralizada en el APK y conservada en web · export estático
> completo con `/t` y `/p` · Preview aislada de Redis · CORS exacto desde
> `https://localhost` sin comodín ni `Allow-Credentials` · sesión persistente ·
> `POST /api/te-va-a-gustar` **200** con `Bearer` de la app · modo avión con
> `OfflineState` en 674 ms · navegación SPA con los `href` naciendo nativos ·
> los tres plugins de CP9 · **los tráileres de YouTube reproduciendo de verdad**,
> sin error 153 · cero secretos y sólo el permiso `INTERNET`.
>
> ⚠️ **Lo que es sólo de debug**: YouTube y todo lo atado al `appId` hay que
> repetirlo con la firma de publicación y el identificador definitivo.
>
> 🔴 **Lo que sigue abierto y bloquea integrar a `main`**: la decisión `noindex`
> frente a `canonical` para `/t` y `/p`, el identificador `ar.yump.app`
> —irreversible—, la cuenta de Play, las notificaciones locales de v1 e iOS.
> Además quedan cuatro limitaciones técnicas medidas y no resueltas: las
> subrutas directas caen en la Home, una ruta inexistente devuelve 200,
> `navigator.onLine` miente en modo avión y el `.ics` no llegó a probarse.
>
> El detalle completo, con la evidencia de cada checkpoint, está en
> `docs/superpowers/plans/2026-08-30-etapa2-prototipo-android-capacitor.md`.

## 0. Resumen ejecutivo

**Tres líneas.**

1. Yump **ya es una SPA**: ninguna de sus 20 páginas hace un solo fetch en el
   servidor. Eso hace que el empaquetado local sea mucho más barato acá que en
   un Next típico — y es el hallazgo que decide todo lo demás.
2. Aun así, **el export estático NO sale gratis**: hay cuatro bloqueantes
   concretos y verificados, y uno de ellos (las rutas de ficha y persona) es de
   los que rompen en silencio si no se atacan a propósito.
3. La arquitectura es **bundle local + API remota** (opción B). Cargar
   `app.yump.ar` dentro del contenedor (opción A) es *exactamente* lo que la
   regla 4.2 de Apple rechaza, y además la documentación oficial de Capacitor
   dice que `server.url` **"no está pensado para producción"** (§14).

---

## 0.a Decisiones vigentes — 29 de agosto de 2026

**Este apartado manda sobre cualquier cosa que diga el resto del documento.**
Lo de abajo se escribió durante la auditoría del 28/08, cuando varias de estas
preguntas todavía estaban abiertas; se conserva porque explica **por qué** se
decidió cada cosa, pero donde haya contradicción, vale esto.

| # | Decisión | Qué cierra |
|---|---|---|
| 1 | **Yump se empaqueta con Capacitor** | §3: la comparación de opciones queda cerrada |
| 2 | **Android es la primera plataforma** en desarrollarse y publicarse | §10: el plan se ordena alrededor de esto |
| 3 | **iOS es objetivo posterior y NO exige comprar una Mac** | §7.b se reescribió entero: una Mac remota alcanza |
| 4 | **TWA y PWA quedan descartadas** como arquitectura de la app de tienda. **La PWA existente se conserva y tiene que seguir funcionando** | §9 |
| 5 | **Cáscara local + API en el servidor.** La app consume `https://app.yump.ar/api/...`. `api.yump.ar` es una **opción futura, no un requisito** | §3.4, reescrito |
| 6 | **Compatibilidad con iOS desde el diseño**, aunque Android se construya primero. No se aceptan atajos Android-only que obliguen a rehacer la arquitectura | §3.4, §10 |
| 7 | **Estimaciones separadas**: Android ~8-12 sesiones; iOS se estima aparte y después | §10 |
| 8 | **Issue #14 (parpadeo del avatar) queda postergado** y no bloquea nada de esto | `docs/ISSUES.md` #14 |
| 9 | **El bug de compartir está CERRADO y verificado en producción** | §4.h, reescrito |

### Lo que cambió respecto de la auditoría del 28/08

Tres cosas, y las tres salen de haber ido a la documentación oficial (§14):

1. **La configuración que proponía §3.4 no es posible.** Sugería servir la
   cáscara como `https://app.yump.ar` con `server.hostname` + `iosScheme`.
   Capacitor documenta que `iosScheme` **no puede** ser `http` ni `https`
   (WKWebView ya los maneja) y que conviene dejar `hostname` en `localhost`,
   porque es lo que habilita las Web APIs que exigen contexto seguro. La sección
   está reescrita con la arquitectura que sí funciona.
2. **El target SDK no se personaliza; sí se verifica.** §7.a decía "tocar
   `variables.gradle`" como si el valor fuera libre. No lo es: Capacitor
   documenta que **cada versión mayor exige su target SDK y sólo da soporte a
   ése**. Pero el valor **sí vive en `android/variables.gradle`** y **hay que
   mirarlo**: crear el proyecto con **Capacitor 8**, confirmar que quedó en
   `compileSdkVersion = 36` y `targetSdkVersion = 36`, y no cambiarlos a
   valores no soportados. Cuando Google exija un SDK posterior, lo que se sube
   es **la versión mayor de Capacitor**, no ese archivo.
3. **La Mac dejó de ser un bloqueante.** Era el riesgo #1 de §11.a. Con Mac
   remota, iOS pasa a ser una decisión de gasto y de momento, no un muro.

### Configuración web vigente (informada por el dueño, 29/08)

- Vercel: `NEXT_PUBLIC_SITE_URL = https://app.yump.ar` en Production y Preview.
- Supabase: Site URL = `https://app.yump.ar`.
- Redirect URLs incluye `https://app.yump.ar/cuenta/reset`.
- Se conservan **temporalmente** `localhost` y el redirect del dominio anterior.
- Recuperación de contraseña, confirmación de registro y compartir: **probados
  correctamente por el dueño**.

⚠️ **El dominio anterior no se toca todavía.** La PWA instalada desde
`streamingcentral.vercel.app` necesita seguir llegando al proyecto para recibir
actualizaciones. Retirarlo antes de tiempo deja a esos usuarios congelados.

---

## 1. El hallazgo que cambia el presupuesto: Yump ya es una SPA

Esto no estaba escrito en ningún lado y es lo más importante de la auditoría.

✅ **CONFIRMADO — ninguna página hace fetch en el servidor.** Las 20 rutas de
`app/**/page.tsx` son cáscaras. Las seis que son Server Components no piden un
solo dato: arman `<TopBar />`, un componente cliente y `<BottomNav />`.

| Página | Qué hace el servidor |
|---|---|
| `app/page.tsx` | monta `<CatalogView />`. El Home lo pide el cliente a `/api/home` |
| `app/titulo/[tipo]/[id]/page.tsx` | pasa `tipo` e `id` como props a `<DetailView />` |
| `app/categoria/[slug]/page.tsx` | valida el slug contra `CATEGORIES` y lee `searchParams.tipo` |
| `app/lista/[key]/page.tsx` | elige una de tres vistas según la key |
| `app/persona/[id]/page.tsx`, `top`, `buscar`, `proximamente`, `directores`, `onboarding` | cáscara pura |
| Las 11 de `admin/` y `cuenta/` | `"use client"` de entrada |

✅ **CONFIRMADO — la sesión NO vive en cookies.** `supabaseBrowser()` usa
`persistSession: true`, o sea `localStorage` (`lib/supabase.ts:8`). Las dos
rutas autenticadas (`/api/te-va-a-gustar`, `/api/cuenta/eliminar`) reciben el
token por **`Authorization: Bearer`**, no por cookie. El comentario de
`lib/supabase.ts:35` lo dice explícito: *"el resto de la app es anónima del lado
del servidor"*.

✅ **CONFIRMADO — no hay `middleware.ts`.** Nada intercepta requests.

✅ **CONFIRMADO — el servidor no lee ninguna cookie.** `grep -i cookie app/api`
no devuelve nada. La cookie `sc_platforms` la escribe el cliente
(`components/PlatformsContext.tsx:45`) y **no la lee nadie**. Es la decisión 9
de `PLAY-STORE.md` §4.c ("¿se saca?"): la auditoría de Capacitor le agrega un
argumento — en el contenedor no sirve para nada y es dato personal viajando sin
destinatario.

✅ **CONFIRMADO — no se usa `next/image`.** Cero importaciones. Los pósters son
`<img>` contra `image.tmdb.org`. Esto elimina de un plumazo el bloqueante más
molesto del export estático (el optimizador de imágenes necesita servidor).

✅ **CONFIRMADO — `next/font/google`** se autohospeda en build
(`app/layout.tsx:2`). No hay petición saliente de fuentes en runtime, así que el
bundle local arranca con la tipografía correcta y sin red.

**Consecuencia.** El corte entre "lo que puede ir en el teléfono" y "lo que
tiene que quedar en Vercel" **ya está hecho y es limpio**: cáscara + cliente de
un lado, `app/api/*` del otro. En un Next con datos en Server Components esto
sería una reescritura; acá es una adaptación.

---

## 2. Lo que igual NO se puede exportar (los cuatro bloqueantes)

El pedido decía explícitamente que no diera por hecho el export estático. No lo
doy: hay cuatro bloqueantes, tres duros y uno chico.

### 2.a Las 25 rutas de `app/api/*` — bloqueante estructural, sin vuelta

✅ **CONFIRMADO.** 25 rutas, todas `force-dynamic`, cinco con
`maxDuration = 60`. Dependen de `TMDB_READ_TOKEN`, de Upstash y de la service
role key. **Nada de eso puede vivir en el teléfono**: el token de TMDB en el
bundle es el token de TMDB publicado.

**Esto define el techo de todo el proyecto y conviene decirlo antes de empezar:
la app empaquetada NO va a funcionar sin conexión.** Con bundle local, la
cáscara abre instantánea y sin red — pero se queda mirando un estado vacío hasta
que haya internet. Es la misma limitación que hoy, sólo que mejor presentada.
Lo que se gana no es offline: es **arranque instantáneo** y **un binario con
contenido adentro**, que es lo que mira Apple.

### 2.b Las rutas dinámicas sin universo finito — bloqueante real

✅ **CONFIRMADO.** Con `output: "export"`, cada ruta dinámica necesita
`generateStaticParams`. El universo de dos de ellas es infinito:

| Ruta | Universo | ¿Exportable? |
|---|---|---|
| `categoria/[slug]` | los slugs de `CATEGORIES` | sí, se enumeran |
| `lista/[key]` | 4 en `LISTAS` + `ultimos` + miniseries | sí, se enumeran |
| `titulo/[tipo]/[id]` | **todo TMDB** | **no** |
| `persona/[id]` | **todo TMDB** | **no** |

Y esto **no falla con un error de build**: falla en runtime y de la peor manera.
En un export, el router cliente de Next pide el payload RSC de la ruta destino
(`/titulo/movie/278.txt`); si el archivo no existe, cae a navegación dura y el
contenedor devuelve 404. O sea: **tocar una card te tira de la app**. Es el tipo
de bug que aparece recién con la app armada.

🟡 **La salida es barata porque los links están centralizados en 10 lugares.**
`grep` da 8 usos de `` `/titulo/${...}` `` y 2 de `` `/persona/${...}` ``
(TitleCard, RuletaCard ×3, UpcomingCard, DesempateResult, CastRail, PersonCard,
DetailView). Un helper `hrefTitulo(tipo, id)` / `hrefPersona(id)` que en web
devuelva la ruta de hoy y en contenedor devuelva una ruta estática con query
(`/t?tipo=movie&id=278`) resuelve las diez de una. `DetailView` y `PersonView`
**ya reciben `tipo`/`id` como props**, así que las páginas nuevas son de cinco
líneas cada una. La web no cambia de URLs: los links compartidos siguen siendo
`app.yump.ar/titulo/movie/278`.

### 2.c `searchParams` en un Server Component — bloqueante chico

✅ **CONFIRMADO, y RESUELTO en CP8 para `/lista/ultimos`.** `app/categoria/[slug]/page.tsx`
lee `searchParams.tipo` en el servidor. Bajo `output: "export"` eso no está
permitido. Se resuelve moviendo esa lectura al cliente — y **el cliente ya sabe
hacerlo**: `hooks/categoria-generaciones.ts` restaura el tipo del snapshot, no de
la URL (está documentado en `CLAUDE.md`). O sea que la lectura del servidor es
casi decorativa.

🔴 **Apareció de verdad en `/lista/ultimos`, y el error es este:**

```
Route /lista/ultimos/ with `dynamic = "error"` couldn't be rendered
statically because it used `searchParams.tipo`
```

No degrada esa ruta: **aborta el export entero**. Se resolvió leyendo el
parámetro en el cliente con `useSearchParams()` dentro de un `<Suspense>`
(`components/UltimosDesdeQuery.tsx`).

Dos cosas que hay que saber antes de repetir el patrón en `/categoria`:

- **El fallback del `Suspense` no puede ser `null`.** Con `output: export` esa
  rama se prerenderiza CON el fallback puesto: es lo que viaja en el HTML del
  artefacto, así que un `null` deja la pantalla en blanco hasta hidratar.
- **No sirve leerlo en un `useEffect`.** Un efecto corre después del primer
  render, así que la vista arranca pidiendo el tipo por defecto y recién después
  cambia: dos pedidos, y el primero mal. `useSearchParams` devuelve el valor en
  el primer render del cliente. Verificado en un Android físico: un solo
  `/api/latest`, y con `tipo=tv`.

⚠️ **Un intento previo que NO hay que repetir:** esconder la lectura detrás de
`ES_NATIVO`. Salva el export y deja el bug — dentro del APK el parámetro se
ignora en silencio.

⚠️ Y **no alcanza con esto para la URL directa**: el servidor local de Capacitor
no resuelve `/ruta/` a `/ruta/index.html`, así que escribir la URL a mano cae en
la Home igual. Ver el hallazgo #16 de CP8.

### 2.d Vercel Analytics y Speed Insights — no bloquea, pero se muere callado

✅ **CONFIRMADO.** Los dos están montados en el layout. Postean a
`/_vercel/insights/*` **del mismo origen**. Con bundle local ese origen es el
contenedor, así que los beacons van a fallar en silencio: **las métricas de la
app instalada no van a existir**, y el número de la web va a quedar mezclado o
incompleto sin que nadie se entere. No rompe nada. Hay que decidir si se
reemplaza por algo o se acepta el hueco. 🔵

---

## 3. Las tres opciones, comparadas

### 3.1 Opción A — cargar `app.yump.ar` desde el contenedor (`server.url`)

Capacitor permite apuntar el WebView a una URL remota. El binario queda
prácticamente vacío.

**A favor:** cero divergencia, cero adaptación de código, cero CORS, el service
worker sigue funcionando tal cual, el origen sigue siendo `https://app.yump.ar`
(así que YouTube, los links compartidos y las cookies andan igual que hoy), y
cada deploy a Vercel actualiza las dos apps al instante.

**En contra, y es terminal:**

- 🟡 **Es la definición literal de lo que rechaza la regla 4.2 de Apple.** Un
  binario sin contenido que abre un sitio. La probabilidad de rechazo acá no es
  un riesgo a mitigar, es el resultado esperado. Descartar TWA por este motivo y
  después hacer esto es cambiarle el nombre al problema.
- **La documentación oficial de Capacitor lo dice con todas las letras**: sobre
  `server.url`, *"Load an external URL in the Web View. This is intended for use
  with live-reload servers. **This is not intended for use in production.**"*
  (consultado el 29/08/2026, ver §14). No es una interpretación mía.
- **Sin red no hay nada**: un arranque en frío sin conexión muestra la pantalla
  de error del WebView, no `offline.html` (el SW todavía no está instalado).
- Toda la app pasa a depender de que un dominio responda, sin ningún respaldo
  dentro del binario.

**Veredicto: descartada.** Por el mismo motivo por el que se descartó TWA, que
es el motivo que dio origen a este pedido.

### 3.2 Opción B — bundle local (`webDir`) + API en Vercel

El export estático de la cáscara viaja dentro del `.aab` y del `.ipa`. Los datos
siguen viniendo de Vercel.

**A favor:**

- Arranque instantáneo y sin red de toda la interfaz.
- El binario **tiene contenido**, que es la mitad del argumento contra 4.2.
- Los plugins nativos funcionan sin fricción; el bridge está en su terreno.
- Se puede envolver en integraciones nativas de verdad (§5).

**En contra, y todo esto es trabajo real:**

- Los cuatro bloqueantes de §2.
- **Desfasaje cáscara/API.** La cáscara sólo se actualiza con una release de
  tienda. Hay un atenuante fuerte y verificado: **los títulos de los rieles
  viajan dentro del payload de `/api/home`** (está en `CLAUDE.md`), así que
  renombrar un riel llega a la app instalada sin release. Lo que sí rompe es un
  campo nuevo en un lado que el otro no conoce. Hace falta una regla de
  compatibilidad escrita.
- **CORS**, o el truco para no tenerlo — ver §3.4.
- Los seis puntos de fricción de §4 (YouTube, compartir, reset de contraseña,
  storage de iOS, SW, banners de instalación).

### 3.3 Opción C — híbrido

"Híbrido" puede significar dos cosas distintas y conviene separarlas:

**C1 — cáscara local + superficies remotas puntuales.** Es la que recomiendo, y
en realidad es la opción B bien hecha: bundle local para la app, y todo lo que
es web de verdad (las cuatro páginas legales de `yump.ar`, los links de alta de
plataformas, el agregador de TMDB) **fuera del WebView principal**, en Custom
Tabs / `SFSafariViewController`. No es una concesión: Apple espera exactamente
eso, y renderizar sitios ajenos dentro del WebView de la app es su propio motivo
de rechazo.

**C2 — bundle local con actualización OTA de la capa web** (Capacitor Live
Updates, Capgo y similares). Permite corregir la cáscara sin pasar por tienda.
🟡 **No para la v1.** Suma un servicio pago o un servidor propio, y las dos
tiendas ponen límites a lo que se puede cambiar sin revisión (no puede alterar
el propósito de la app). Es una optimización de la etapa 2, cuando ya haya algo
publicado que valga la pena parchear rápido.

### 3.4 La configuración real — ⚠️ REESCRITA el 29/08

**Lo que decía antes, y por qué estaba mal.** La versión del 28/08 proponía
servir la cáscara local bajo `https://app.yump.ar` usando `server.hostname` y
`iosScheme`, para que el origen del WebView fuera un https real. Estaba marcada
🔍 "hay que probarla". Fui a la documentación oficial y **no se puede**:

- `server.iosScheme` **no admite `http` ni `https`**: son esquemas que WKWebView
  ya maneja. El origen en iOS va a ser `capacitor://localhost` y punto.
- `server.hostname`: Capacitor **recomienda dejarlo en `localhost`**, porque es
  lo que habilita las Web APIs que exigen contexto seguro.

Se conserva el párrafo anterior tachado en el historial de git, no acá, para que
esta sección no confunda. **La arquitectura correcta es la de abajo, y es más
simple.**

### La arquitectura, en cuatro líneas

| Pieza | Dónde vive |
|---|---|
| Cáscara, CSS, JS, fuentes, íconos | **dentro del binario** (`webDir`) |
| Origen del WebView | `https://localhost` (Android) · `capacitor://localhost` (iOS) — **los defaults** |
| Datos | `https://app.yump.ar/api/...`, en Vercel, como hoy |
| CORS | la API **selecciona por request** cuál de los dos orígenes del contenedor autoriza, más `Vary: Origin` (§3.5) |

**`api.yump.ar` no hace falta.** Era una consecuencia del truco que se cayó: si
el contenedor no reclama el host `app.yump.ar`, no hay colisión que resolver.
Queda como **opción futura** —si algún día conviene separar la API por
operación o por costos— y **no es un bloqueante para nada de este plan**.

### Los tres efectos del origen local, y cómo se resuelve cada uno

Que el origen sea `localhost` tiene consecuencias concretas. Las tres están
identificadas y ninguna es cara:

| Efecto | Estado |
|---|---|
| `fetch("/api/...")` relativo no resuelve | se arregla con una base URL explícita (Etapa 3) |
| El embed de YouTube puede dar el **error 153** que ya documenta `lib/trailer.ts:38` | ⚠️ **abierto, sin solución confirmada** — ver abajo. Es el punto de mayor incertidumbre técnica del proyecto |
| El enlace compartido saldría con el origen del contenedor | ✅ **YA RESUELTO Y EN PRODUCCIÓN** — ver §4.h |

El tercero ya está resuelto por `lib/compartir.ts`, que se construyó el 29/08
para arreglar el bug de compartir y expone `SITIO_PUBLICO`: es el ejemplo de la
decisión 6, una pieza pensada para la web que sirve igual en los dos
contenedores. **El segundo NO está resuelto**, y merece su propio apartado.

### El tráiler de YouTube — ✅ CERRADO el 5/09: FUNCIONA, y sin cambios

> 🔴 **MEDIDO EN CP10, EN UN ANDROID FÍSICO. La preocupación de esta sección no
> se materializó.** Con `appId = ar.yump.app.dev`, firma debug, contenido local
> bajo `https://localhost` y sin `server.url`, los tráileres **reproducen**. Dos
> títulos, con el reloj del reproductor leído por la IFrame API dos veces con 6 s
> de espera: avanzó 8,5 s en los dos. `videoplayback` de googlevideo devuelve
> 200. **Cero errores de YouTube en consola, y ningún "error 153".**
>
> 🔴 **Y ESTA SECCIÓN SE EQUIVOCABA EN SU PREMISA.** Daba por sentado que en una
> app móvil el `Referer` viene vacío. Medido en Network —no deducido de
> `location.origin`— el WebView **sí lo manda**: el documento del embed viaja con
> `Referer: https://localhost/`, y los recursos internos de YouTube con la URL
> completa del embed. YouTube lo acepta.
>
> No se fijó ningún `Referer` a mano, no se tocó WebView Media Integrity y no se
> cambió el parámetro `origin`: no había nada que arreglar, y fabricar un arreglo
> habría sido inventar el problema.
>
> ⚠️ **Lo que esto NO cierra:** se probó con firma **debug**. Si Media Integrity
> llegara a intervenir sería con la firma de publicación o el identificador
> definitivo, así que **hay que volver a verificarlo** cuando se arme la build
> firmada. El detalle completo, en CP10 del plan de Etapa 2.

Lo que sigue es la investigación previa, que se conserva porque explica el
mecanismo y por qué se temía el problema.

### El tráiler de YouTube — la preocupación original (30/08)

**Acá había una afirmación mía que era falsa y conviene decirlo sin vueltas.**
Este documento decía que el error 153 se arreglaba "con una línea", pasando
`SITIO_PUBLICO` como parámetro `origin`. **Eso no está demostrado, y la
documentación de YouTube apunta a otro mecanismo.**

**Qué es realmente el error 153.** La referencia del IFrame Player API dice:
*"Error `153` indicates the request does not include the `HTTP Referer` header
or equivalent API Client identification."* O sea que **no habla del parámetro
`origin`**: habla del **encabezado `Referer`**. No son lo mismo — `origin` es un
parámetro de la URL del embed y su función documentada es de seguridad
(*"protects against malicious third-party JavaScript being injected into your
page"*), no de identificación ante YouTube.

**Qué pide YouTube para un WebView.** Los términos de funcionalidad mínima son
explícitos: *"API Clients that use the YouTube embedded player must provide
identification through the `HTTP Referer` request header."* Y para apps
móviles, donde ese encabezado **viene vacío por defecto**, hay que fijarlo con
métodos propios de la plataforma. El valor tiene que ser una URL completa, con
**HTTPS**, cuyo dominio sea **el identificador de la aplicación** — o sea, con
el identificador propuesto en §6, algo de la forma `https://ar.yump.app`.

**Lo que sí está a favor nuestro:** los mismos términos piden usar *"one of the
OS-provided WebView types"* —el `WebView` de Android, `WKWebView` en iOS—, que
es exactamente lo que usa Capacitor. Esa parte se cumple sola.

**Los caminos posibles, en orden de probabilidad:**

1. **Fijar el `Referer` del WebView** con el identificador de la app. Es lo que
   la documentación describe, y por eso es la primera hipótesis a probar.
2. **URL base del contenido local.** Con HTML servido localmente, puede hacer
   falta configurar la URL base para que el embed no quede sin referente.
3. **Pasar `SITIO_PUBLICO` como `origin`.** 🔍 **Hipótesis, no solución.** Puede
   ayudar, pero por la definición del error 153 no debería alcanzar por sí sola.
4. **WebView Media Integrity** (Android) como forma de identificación. 🔍 Hay
   que verificarlo en el entorno real; no lo doy por bueno desde acá.

**Cómo se decide.** No desde este documento. **La solución definitiva se elige
después de reproducir un tráiler en un dispositivo Android físico y con una
build firmada** — firmada importa, porque la identidad de la app es justamente
lo que está en discusión. Es un punto explícito del checklist de la Etapa 2.

🔴 **Y si falla, lo que NO se hace es esconder el tráiler.** Se investiga la
configuración del WebView o se integra de otra forma. Desactivar la función en
silencio sería tapar el problema y perder una parte visible del producto.

### 3.5 El CORS — ⚠️ REESCRITA el 30/08

Con el origen del contenedor en `localhost`, **todas** las llamadas a
`app.yump.ar/api` son cross-origin. Esto ya no es un "si hace falta": hace falta.

**El error que tenía esta sección.** Decía: *"una allowlist de dos orígenes…
son dos valores fijos y conocidos de antemano, así que **no hay que echar el
origen dinámicamente**"*. Eso es falso, y de una forma que se descubriría recién
al probar en el teléfono.

**`Access-Control-Allow-Origin` acepta UN solo origen, o `*`. No acepta una
lista.** No existe forma de escribir los dos valores en una respuesta estática:
mandar `https://localhost, capacitor://localhost` no es un valor válido y el
navegador lo rechaza. Como no queremos `*`, **la API tiene que elegir, para cada
request, cuál de los dos devolver**. O sea que sí o sí hay lógica por request.

### El diseño, punto por punto

Esto es **diseño, no implementación**: no se escribió una línea todavía.

1. **Leer el encabezado `Origin`** del request.
2. **Compararlo contra una allowlist de coincidencia EXACTA** — comparación de
   cadena completa, no `startsWith`, no expresiones regulares, no "termina en":
   - `https://localhost` (Android)
   - `capacitor://localhost` (iOS)
3. **Si coincide, devolver EXACTAMENTE ese valor** en `Access-Control-Allow-Origin`.
   Uno solo, el que coincidió.
4. **Agregar `Vary: Origin`.** Sin esto, cualquier caché intermedia puede
   guardar la respuesta preparada para un origen y servírsela al otro, y ahí la
   allowlist deja de existir en la práctica. Es el punto que más fácil se olvida
   y el más difícil de diagnosticar después.
5. **Responder el preflight `OPTIONS` sin ejecutar la lógica normal de la ruta.**
   No es un detalle de prolijidad: `/api/home` puede tardar hasta 60 s y gastar
   cientos de comandos de Upstash. Un preflight que caiga en el handler real
   duplica ese costo por cada llamada.
6. **Declarar, como mínimo:**
   - **Los métodos que la API usa de verdad.** Auditado hoy: **23 `GET` y 2
     `POST`**, más el `OPTIONS` del propio preflight. **No hay `PUT`, `PATCH`
     ni `DELETE`** — no declarar métodos que no existen.
   - `Access-Control-Allow-Headers: Authorization, Content-Type`
   - Un `Access-Control-Max-Age` prudente **si** se decide cachear el preflight.
7. **NO agregar `Access-Control-Allow-Credentials`** salvo necesidad demostrada.
   La sesión viaja por `Authorization: Bearer`, no por cookies de autenticación
   (§4.a). Activarlo sin necesitarlo además prohíbe el comodín y arrastra reglas
   que no queremos.
8. **A un origen desconocido no se le entregan encabezados CORS.** Y sobre todo:
   **no reflejar cualquier `Origin` recibido.** Un reflector es funcionalmente
   idéntico a `*`, pero parece seguro — que es peor.
9. **Las peticiones normales de la web no cambian.** `app.yump.ar` pidiéndole a
   `app.yump.ar/api` es **same-origin**: no necesita CORS, y muchas veces ni
   siquiera manda `Origin`. Sin `Origin`, el diseño no hace nada. Esto es lo que
   garantiza que la web de hoy no se entere del cambio.

### Dónde vive esto — 🔵 deliberadamente sin cerrar

La documentación **puede** proponer un helper reutilizable para no repetir los
mismos encabezados en 25 rutas, y sería raro no hacerlo. Pero **dónde se
integra** —en cada ruta, en un wrapper, en otra capa— **no se decide acá**: se
decide midiendo el impacto en la Etapa 3, con el proyecto armado.

⚠️ **Lo que sí sigue decidido: no meter `middleware.ts` preventivamente.** Hoy
no hay ninguno (§1) y agregarlo pone latencia y costo en *todos* los requests,
incluidos los de la web, que son la mayoría y no necesitan nada de esto.

### La decisión de seguridad que sigue siendo del dueño — 🔵

La salida más rápida sería `Access-Control-Allow-Origin: *` en `/api/:path*`
desde `next.config.mjs`, sin lógica ninguna. Es inocua para la autenticación:
las dos rutas con sesión usan `Bearer`, no cookies, así que el comodín no filtra
nada.

**Pero abre la API a cualquier sitio web.** Hoy cualquiera puede llamarla desde
un servidor; el comodín agrega poder llamarla desde el navegador de cualquier
página, que es lo que hace fácil el scraping. Y `/api/home` cuesta hasta 60 s y
cientos de comandos de Upstash. 🟡 Por eso se recomienda la allowlist, aunque
cueste lógica por request.

⚠️ La alternativa que Capacitor ofrece —activar `CapacitorHttp`, que parchea el
`fetch` global para salir por vía nativa y esquivar CORS entero— **no se
recomienda acá**: parchea también el fetch de `supabase-js`, y eso es una fuente
conocida de fallas sutiles (§4.b).

---

## 4. Compatibilidad, punto por punto

Los nueve puntos del pedido. Cada uno con lo que verifiqué del repo, y con lo
que cambia en cada plataforma.

### 4.a Autenticación y sesión

✅ **La parte difícil ya está resuelta sin querer.** Sesión en `localStorage` y
`Authorization: Bearer` a la API. **No hay cookies de sesión, no hay middleware,
no hay callback de servidor.** Eso significa que login, registro y logout andan
en los dos contenedores sin tocar una línea.

**Los dos agujeros son los correos:**

1. 🔴 **Recuperación de contraseña.** `resetPassword` manda a
   `${NEXT_PUBLIC_SITE_URL}/cuenta/reset` (`components/AuthContext.tsx:117`).
   Desde la app, el usuario recibe un mail que **lo lleva al navegador, no a la
   app**. Cambia la contraseña en la web y después vuelve a la app a loguearse.
   Funciona, pero es un salto feo.
2. 🔴 **Confirmación de registro.** `signUp` devuelve `needsConfirm` cuando
   Supabase tiene "Confirm email" activo. Mismo salto, en el peor momento
   posible: el primer minuto del usuario nuevo.

🟡 **Recomendación:** resolverlo con **Universal Links / App Links** (§5), que
hacen falta igual. El link del mail sigue apuntando a `app.yump.ar/cuenta/reset`
y el sistema operativo lo abre dentro de la app. Requiere agregar esa URL a la
allowlist de Redirect URLs de Supabase — el archivo `.env.local.example` ya
avisa que si no está, **Supabase lo descarta en silencio**, que es como se rompió
esto la primera vez.

⚠️ **Riesgo de iOS que hay que atacar sí o sí:** WKWebView puede **purgar el
`localStorage`** cuando el sistema necesita espacio. Ahí se pierden la sesión,
las plataformas elegidas y los `tmdb_id` ya mostrados de la ruleta. En la web es
un fastidio; en una app instalada se lee como "la app me deslogueó sola".
🟡 Mitigación concreta y chica: pasarle a `createClient` un `auth.storage`
respaldado por `@capacitor/preferences` (almacenamiento nativo real), y hacer lo
mismo con la clave `sc:platforms`. Son dos adaptadores.

### 4.b Supabase

✅ Sin problemas de fondo. `@supabase/supabase-js` v2 es HTTP + WebSocket contra
`*.supabase.co`, ambos permitidos desde los dos WebViews. El SW **no lo
intercepta** (`public/sw/routes.js:30`: sólo mismo origen). No hay realtime en
uso.

⚠️ Una sola advertencia: si en §3.5 se termina activando `CapacitorHttp` (que
parchea el `fetch` global para esquivar CORS por vía nativa), **también parchea
el fetch de supabase-js**, y eso es una fuente conocida de fallas sutiles. Es
otro argumento para la configuración de §3.4, que no necesita `CapacitorHttp`.

### 4.c Cookies y almacenamiento

| Qué | Hoy | En el contenedor |
|---|---|---|
| Sesión Supabase | `localStorage` | anda; **riesgo de purga en iOS** (§4.a) |
| `sc:platforms` | `localStorage` | anda; mismo riesgo |
| Cookie `sc_platforms` | espejo para el servidor | **inútil**: nadie la lee, y con host propio ni siquiera llega |
| `sc:theme`, `sc:pwa:*`, `yump:ruleta-mostrados` | `localStorage` | anda |
| `yump:lista-paginada` (71 KB medidos) | `sessionStorage` | anda; se vacía cuando el sistema mata la app |
| Cache de imágenes del SW | Cache API | **no existe en el contenedor** (§4.d) |

🔵 La cookie `sc_platforms` es la decisión 9 de `PLAY-STORE.md` §4.c. Esta
auditoría le suma el argumento definitivo: en la app empaquetada no hace nada.

### 4.d Service worker y offline

✅ **CONFIRMADO — el SW es propio, sin librerías, y hace cinco cosas**
(`public/sw/routes.js`): imágenes de TMDB Cache First (300 items, 30 días),
`/_next/static` Cache First, assets propios Cache First, navegación Network
First con `offline.html`, y `/api/*` + Supabase **Network Only**.

**Qué pasa en el contenedor:**

- **iOS:** con el esquema `capacitor://` **no hay service worker**, punto. No es
  configurable.
- **Android:** con `https://localhost` sí es contexto seguro y *podría*
  registrarse — 🔍 pero no debería. Su regla de navegación Network First
  competiría con el servidor de archivos local de Capacitor.
- 🟡 **Decisión de diseño: el SW no se registra en nativo.** Gatear
  `ServiceWorkerRegister` con `Capacitor.isNativePlatform()`. Una condición.

**Qué se pierde y qué no:**

| Función del SW | En el contenedor |
|---|---|
| Cachear `/_next/static` y assets | **innecesaria**: ya están en el bundle |
| `offline.html` | **innecesaria**: la cáscara siempre abre |
| Network Only para `/api/*` | **innecesaria**: sin SW no hay quién cachee |
| **Cache de pósters de TMDB** | 🔴 **se pierde de verdad** |

El cache de imágenes es lo único con valor real que desaparece. Queda el cache
HTTP del WebView, que funciona pero no tiene el LRU de 300 ni los 30 días.
🟡 Aceptarlo en la v1 y medirlo; si molesta, hay plugins de cache de imágenes.
**No** vale la pena reimplementarlo antes de saber si duele.

**La PWA web no se toca.** Sigue existiendo, instalable, con su SW intacto.

### 4.e Enlaces externos y páginas legales

✅ **CONFIRMADO — las cuatro páginas legales NO son rutas de esta app.** Viven
en `yump.ar` y las prepara el dueño (`PLAY-STORE.md` §0.a, decisión 8). Desde el
contenedor son navegación externa pura.

Enlaces externos que existen hoy: los cuatro legales
(`components/legal/SobreYump.tsx`), `wa.me` para compartir, el alta de
plataformas (`suscripcion.url` en DetailView), Google Calendar
(`RecordarButton`) y el agregador de TMDB.

🔴 **Todos tienen que salir del WebView principal.** Hoy son `target="_blank"` y
`window.open`, que dentro de un WebView **o no hacen nada, o cargan el sitio
ajeno dentro de la app** — lo segundo es motivo de rechazo en App Store.
🟡 `@capacitor/browser` (Custom Tabs en Android, `SFSafariViewController` en
iOS). Son ~6 call sites y conviene un helper `abrirExterno(url)`.

### 4.f Navegación y botón Atrás

✅ **CONFIRMADO — la lógica de "volver" ya está pensada y es correcta.**
`hayHistorialInterno()` (`components/nav-historial.ts`) compara `history.length`
contra el largo al arrancar, justamente para no sacar al usuario de la app
cuando la ficha se abrió por un link compartido. Ese razonamiento vale igual en
el contenedor.

🔴 **Lo que falta es el botón físico de Android.** Sin un listener de
`@capacitor/app` (`backButton`), el back de Android **cierra la app** desde
cualquier pantalla. Es rechazo de Play y, sobre todo, es la queja número uno de
los usuarios. La implementación correcta: si hay historial interno, `back`; si
no, en el Home, patrón "tocá de nuevo para salir".

✅ El sistema de restauración de vistas (`hooks/lista-paginada-store.ts`, un solo
`popstate` en toda la app, `sessionStorage`) funciona igual. La ventana de 8 s de
la marca de vuelta sigue siendo la misma limitación conocida.

⚠️ iOS: el gesto de deslizar desde el borde **no** viene gratis con el router de
Next. 🔍 Ver en el spike si hace falta habilitarlo.

### 4.g Teclado, barra de estado y safe areas

✅ **Esta es la parte que está mejor preparada de todas.** `app/layout.tsx` ya
declara:

- `viewportFit: "cover"` — sin esto, todo el CSS de safe areas es inerte (el
  comentario del archivo ya lo explica).
- `interactiveWidget: "resizes-content"` — el teclado achica el viewport en vez
  de tapar la barra inferior.
- `themeColor` con dos entradas por `prefers-color-scheme`, y `ThemeContext` las
  reescribe en runtime.
- `appleWebApp.statusBarStyle: "black-translucent"`.

✅ `app/globals.css:21-24` define `--safe-t/-b/-l/-r` con `env(safe-area-inset-*)`.

**Qué cambia:** las meta `apple-*` y el `themeColor` del manifest **son inertes
en el contenedor**. El equivalente nativo es `@capacitor/status-bar`, y hay que
sincronizarlo con `ThemeContext` (una llamada en el mismo lugar donde hoy se
reescribe la meta). `env(safe-area-inset-*)` **sí** sigue funcionando en los dos
WebViews. 🔍 Confirmar en iOS que el `viewport-fit=cover` del contenedor lo
respeta.

Splash: los 18 splash de iOS hechos a mano (`AppleSplashLinks`) quedan inertes;
los reemplaza `@capacitor/splash-screen` con **una** imagen. Menos trabajo, no
más.

### 4.h Fichas y enlaces hacia plataformas

✅ **CONFIRMADO — y acá hay una buena noticia que viene de una limitación.** La
app **no tiene deep links a plataformas**, a propósito: TMDB no los da, y
`components/DetailView.tsx:120` dice explícitamente que "Disponible en" **no es
un link**, porque mandar al usuario a un listado agregador no le resuelve nada.

Eso elimina de raíz el problema clásico de estas apps (abrir Netflix con la
película justa) — no porque esté resuelto, sino porque no se prometió nunca. Lo
que sí sale afuera es el `signupUrl` del alta de plataforma, y eso va por §4.e.

✅ **Compartir: la mitad difícil YA ESTÁ RESUELTA Y EN PRODUCCIÓN** (29/08).

Cuando se escribió esta auditoría, la URL compartida se armaba con el origen del
navegador y por eso figuraba acá como trabajo pendiente de Capacitor. **Ya no lo
es**: se arregló como bug de la web —una PWA instalada desde el dominio anterior
compartía enlaces viejos— y el arreglo dejó justo la pieza que el contenedor
necesita.

`lib/compartir.ts` es la fuente única del enlace público: `SITIO_PUBLICO` es una
constante, **no depende del origen**, y hay una prueba que lo fija simulando el
dominio viejo. Verificado en producción por el dueño desde la PWA instalada.

Lo que queda es chico y sigue siendo trabajo de contenedor: `navigator.share`
**no existe** en WKWebView ni en el WebView de Android, así que hoy caería
siempre al fallback de WhatsApp. 🟡 `@capacitor/share` da la hoja nativa real en
las dos plataformas — y como la URL ya sale canónica, ese plugin sólo cambia
**cómo** se comparte, no **qué**. Es además una integración nativa que suma
para 4.2.

### 4.i Actualización de la web y de la app instalada

**Tres carriles, y hay que tenerlos separados:**

| Carril | Cómo se actualiza | Latencia |
|---|---|---|
| PWA web (`app.yump.ar`) | deploy a Vercel + `UpdateToast` del SW | minutos |
| **API** | deploy a Vercel | minutos, **para todos, incluidas las apps ya instaladas** |
| **Cáscara empaquetada** | release de tienda | **días** (Play: horas a días; Apple: revisión) |

🔴 **La regla que hay que escribir antes de la primera release: la API no puede
romper una cáscara vieja.** Campos nuevos, sí; campos que desaparecen o cambian
de tipo, no, hasta que la versión vieja esté fuera de circulación.

✅ Hay un atenuante fuerte y ya construido: **los textos de la interfaz viajan
dentro del payload** (los títulos de los rieles, ver `CLAUDE.md`), así que buena
parte de los cambios de copy llegan sin release.

⚠️ **La otra cara:** hoy renombrar un riel obliga a subir la versión de la clave
de cache del Home (`v5`, TTL 6 h). Con app publicada, ese mecanismo pasa a ser
también el canal de actualización de la app instalada. Vale la pena tenerlo
presente antes de tocarlo.

🟡 Agregar un chequeo de versión mínima en `/api/home` (un campo
`minVersionApp`) para poder forzar "actualizá la app" el día que haga falta.
Barato ahora, imposible de retrofitear después.

---

## 5. Apple y la regla 4.2 (funcionalidad mínima)

**El riesgo, sin edulcorar.** Yump es un catálogo con un lector de una API
ajena. Es exactamente la silueta de lo que Apple rechaza por 4.2 y por 4.2.2
("apps que son sólo un sitio web reempaquetado"). Que sea Capacitor y no TWA no
cambia nada por sí solo: **lo que cambia el resultado es qué tiene el binario
adentro y qué hace de nativo.**

### 5.a Lo que Yump ya tiene y sí es "app"

Esto no hay que inventarlo, ya está construido:

| Función | Por qué cuenta |
|---|---|
| **La ruleta** | una recomendación por vez, con escenario, exclusión persistida por dispositivo y texto editorial propio. **No existe en ningún sitio web**: es producto propio, no datos de TMDB |
| **Mis plataformas** | la app se configura por usuario y el Home cambia entero |
| **Votos de la comunidad** | contenido generado por usuarios, con cuenta |
| **Mi lista / Ya la vi / Vistos** | estado personal persistente |
| **Home personalizado y rotación diaria** | contenido distinto cada día, por semilla argentina |
| **Próximamente + Recordarme** | agenda personal |

🟡 En el texto de revisión conviene **liderar con la ruleta**: es lo único
imposible de explicar como "un sitio web", y es el diferencial declarado del
producto.

### 5.b La integración nativa mínima que recomiendo

Ordenada por relación valor/costo. Las cuatro primeras son, a mi criterio, el
piso para presentarse a revisión.

| # | Integración | Plugin | Por qué |
|---|---|---|---|
| 1 | **Botón Atrás de Android** | `@capacitor/app` | **obligatorio**, no es opcional (§4.f) |
| 2 | **Enlaces externos nativos** | `@capacitor/browser` | **obligatorio**: sitios ajenos fuera del WebView (§4.e) |
| 3 | **Deep links / Universal Links** | `@capacitor/app` + AASA/assetlinks | arregla los mails de auth (§4.a) **y** hace que un link compartido abra la app. Muy visible como "app" |
| 4 | **Hoja de compartir nativa** | `@capacitor/share` | arregla un bug real (§4.h) y es nativo evidente |
| 5 | **Notificaciones locales para "Recordarme"** | `@capacitor/local-notifications` | 🟡 **el argumento más fuerte contra 4.2.** Hoy "Recordarme" abre Google Calendar en el navegador; en la app puede ser un recordatorio de verdad, en el teléfono, sin depender de una cuenta de Google. Es una función que **la web no puede dar** |
| 6 | **Storage nativo para sesión y plataformas** | `@capacitor/preferences` | no es vistoso, pero evita el "me deslogueó solo" de iOS (§4.a) |
| 7 | Barra de estado y splash | `@capacitor/status-bar`, `@capacitor/splash-screen` | terminación; barato |

🔴 **Lo que NO recomiendo para la v1: push notifications.** Suman APNs,
Firebase, un permiso nuevo, una política de privacidad más larga y una decisión
de producto que no está tomada. Los módulos `push.js` y `sync.js` del SW están
**reservados y comentados** a propósito: dejarlos así.

### 5.c Riesgos de revisión que no son 4.2

- **5.1.1(v) — borrado de cuenta desde la app.** ✅ Ya existe
  (`/cuenta/configuracion` + `/eliminar-cuenta` en `yump.ar`). Apple lo exige y
  está cubierto.
- **Cuenta de prueba para el revisor.** Login email+contraseña sin 2FA: alcanza
  con crear una. Es el mismo ítem que ya está en `PLAY-STORE.md` §7.b.
- **Marcas de terceros.** Los nombres de plataforma ya pasaron a texto neutro
  (mergeado en `27669c0`). El aviso de no afiliación también. Esto ya estaba
  auditado para Play y sirve igual para Apple.
- **Atribución de TMDB.** Ya está, con logo local y texto literal.
- 🔍 **Etiquetas de privacidad de App Store.** Son un formulario distinto del
  Data Safety de Play, aunque los datos sean los mismos. Hay que llenarlo. La
  matriz de `PLAY-STORE.md` §2 se puede reusar casi entera.

---

## 6. El identificador — 🟡 propuesta, sin registrar

**Propuesta: `ar.yump.app` para las dos tiendas.**

El motivo es que es **el DNS invertido del host real de la app**:
`app.yump.ar` → `ar.yump.app`. Eso no es estética: es exactamente lo que van a
mirar `assetlinks.json` (Android App Links) y el AASA (Universal Links), así que
el identificador y el dominio quedan diciendo lo mismo, y cualquiera que audite
la cadena en dos años la sigue sin preguntar.

- Android (`applicationId`): `ar.yump.app` — válido (≥2 segmentos, ninguno
  arranca con dígito, `app` no es palabra reservada de Java).
- iOS (`CFBundleIdentifier`): `ar.yump.app` — idéntico, que es lo que se quiere.
- Variantes futuras: `ar.yump.app.dev` para desarrollo, si algún día hacen falta
  las dos instaladas a la vez.

🔴 **Es permanente en las dos tiendas.** Después de la primera publicación no se
puede cambiar ni en Play ni en App Store: cambiarlo es una app nueva, sin
usuarios, sin reseñas y sin instalaciones. Es la decisión más irreversible de
todo el proyecto y se toma antes de la primera subida.

🔍 Antes de fijarlo, verificar en Play Console que `ar.yump.app` esté libre (un
`applicationId` quemado por una subida ajena no se recupera).

---

## 7. Firma, certificados, herramientas, cuentas y dispositivos

### 7.a Android

| Qué | Estado | Nota |
|---|---|---|
| Android Studio + JDK | ❌ no instalado | Capacitor genera un proyecto Gradle estándar |
| **Capacitor 8** | ❌ | La versión mayor **es** la que decide el target SDK: Capacitor documenta que cada una exige el suyo y **sólo da soporte a ése**. Capacitor 8 → SDK 36. Por eso se crea el proyecto con 8 desde el principio, no con una anterior |
| **`android/variables.gradle`** | ❌ | ⚠️ **Matiz importante, corregido el 30/08.** Antes acá se dijo primero "fijar `targetSdk 36` a mano" y después, sobrecorrigiendo, "no se toca". Las dos son inexactas. **El valor vive en ese archivo y hay que VERIFICARLO** después de crear el proyecto: `compileSdkVersion = 36` y `targetSdkVersion = 36`. Lo que no se hace es **personalizarlo** a un valor distinto del que pide la versión mayor |
| **Target API 36** | ❌ | Google Play lo exige a **apps nuevas y actualizaciones desde el 31/08/2026**. Yump es nueva, así que arranca en 36 — que es lo que trae Capacitor 8 y **lo que hay que confirmar en `variables.gradle`**. *La prórroga al 01/11/2026 existe pero es para apps que ya están publicadas: **a Yump no le aplica y no es un camino disponible**.* |
| **Actualizaciones futuras** | — | Cuando Google exija un SDK posterior, la acción es **subir la versión mayor de Capacitor**, no editar Gradle. Capacitor saca una mayor por año justamente para eso |
| Keystore de subida | ❌ | `keytool`. **Perderlo es un trámite con Google, no un `rm`** |
| Play App Signing | ❌ | Google guarda la clave de firma final |
| `assetlinks.json` en `yump.ar` | ❌ | ⚠️ **el SHA-256 que va acá es el de Play App Signing, no el del keystore de subida.** Es el error clásico y sólo se ve cuando los deep links no abren |
| Cuenta de Play | 🔍 | US$25 una vez. **Si es personal y se creó después del 13/11/2023: 12 testers opted-in de forma continua durante 14 días corridos** antes de poder pedir acceso a producción. Confirmado en la ayuda de Play (§14). Mueve el cronograma dos semanas |

### 7.b iOS — ⚠️ REESCRITA el 29/08: la Mac ya no es un muro

**Lo que decía antes:** "no sé si el dueño tiene Mac; es un requisito duro".
Figuraba como el bloqueante #1 de todo el proyecto. **Eso cambió**: sigue
haciendo falta macOS, pero **no hace falta comprarlo**.

**Lo que es cierto y no cambió:** en algún momento hay que tocar Xcode. No
existe camino a la App Store que lo evite — Xcode Cloud tampoco, porque los
workflows **se configuran desde Xcode** (§14), así que es una forma de no tener
que *compilar* en una máquina propia, no de no necesitar macOS nunca.

**Lo que cambió: esa Mac puede ser alquilada.** Y acá hay una distinción que
importa más que el precio:

| Tipo de plan | Qué da | Sirve para Capacitor? |
|---|---|---|
| **Administrado / pay-as-you-go** (el tramo barato, por hora o por día) | una cuenta de usuario en una Mac compartida. MacinCloud documenta que **no dan root/admin**: las tareas de administrador las hace su soporte a pedido | 🔍 **a verificar, no a descartar** — ver abajo |
| **Dedicado** (Mac mini entero) | **acceso root completo** | ✅ sin fricción; es a lo que se escala **si aparece un bloqueo demostrado**, no por las dudas |

⚠️ **Corregido el 30/08: acá se decía que un build de Capacitor "necesita Node,
npm y CocoaPods", y de ahí se deducía que sin root el plan barato no serviría.
Las dos mitades estaban mal.**

- **CocoaPods ya no es el default.** Capacitor 8 *"now creates iOS SPM projects
  as default"* (Swift Package Manager). CocoaPods sólo entra si se elige a
  propósito —hay una bandera `--packagemanager CocoaPods`— o si algún plugin
  concreto lo exige. O sea que la dependencia que motivaba el miedo a no tener
  root **puede directamente no existir**.
- **Y no hay que afirmar que hace falta root antes de probarlo.** Que el
  proveedor no lo ofrezca no equivale a que el build no corra: lo que importa es
  si el entorno **ya tiene** lo necesario, no quién puede instalarlo.

**Lo que sí hay que verificar de ese plan barato, y es otra lista:**

| # | Qué verificar | Por qué |
|---|---|---|
| 1 | Versión de **macOS** capaz de correr Xcode 26 | Capacitor 8 lo exige; un plan con macOS viejo no sirve por más root que dé |
| 2 | **Xcode 26 disponible** en la imagen | no alcanza con que la máquina lo aguante |
| 3 | Posibilidad de usar **Node 22 o superior** | Capacitor 8 *"requires NodeJS 22 or greater"* |
| 4 | Que se pueda correr `npx cap sync ios` y abrir el proyecto | la prueba de fuego, y la única que vale |

🟡 **Recomendación: empezar por el plan más económico que cumpla esas cuatro, y
escalar a dedicado SÓLO ante un bloqueo demostrado.** No comprometerse a un plan
anual antes de haber compilado una vez.

⚠️ **Sobre los precios: son referencias, no tarifas.** Varían por proveedor,
plan, disponibilidad, región e impuestos, y cambian sin aviso. Los verificados
el **29/08/2026** están en §14, con la fuente. **Confirmar el precio del día
antes de contratar** — no tomar ningún número de este documento como el que se
va a pagar.

| Qué | Estado | Nota |
|---|---|---|
| macOS + **Xcode 26 o superior** | ❌ | lo exige Capacitor 8 (§14). **Remoto sirve**; ver arriba |
| **Node 22 o superior** | ❌ | lo exige Capacitor 8. Vale para la Mac remota igual que para la máquina local |
| **Deployment target iOS 15** | — | mínimo de Capacitor 8. No es trabajo: es el piso que queda declarado |
| **Gestor de paquetes iOS** | — | **Swift Package Manager por defecto** en Capacitor 8. CocoaPods sólo si se elige explícitamente o si un plugin concreto lo pide |
| Apple Developer Program | ❌ | **US$99 por año de membresía**, según la propia Apple (§14). Se renueva. Los precios pueden variar por región y se muestran en moneda local al inscribirse. Individual: figura el nombre real como vendedor. Organización: hace falta D-U-N-S |
| **iPhone físico** | 🔵 | 🟡 **fuertemente recomendado, NO obligatorio.** Corregido el 30/08: **no hace falta para compilar ni para enviar el binario**. Hace falta para **validar con responsabilidad** — ver §7.c, que detalla qué no reproduce bien el simulador. Publicar sin haberlo probado en un iPhone es una decisión de riesgo, no un impedimento técnico |
| Certificados y perfiles | ❌ | Xcode los gestiona con "automatically manage signing" |
| AASA en `yump.ar` | ❌ | para Universal Links, con el Team ID |
| `ITSAppUsesNonExemptEncryption = false` | ❌ | 🟡 declararlo en `Info.plist` desde el principio: sólo se usa HTTPS estándar, y sin esto Apple pregunta lo mismo en **cada** subida |
| **Trader status (UE)** | 🔍 | Apple exige declararlo para distribuir en la Unión Europea. Si Yump se publica sólo en Argentina/LatAm, se restringen territorios y no aplica. 🔵 Decisión |

**La condición de todo esto:** iOS queda **sujeto al resultado de Android** y a
que el dueño apruebe el gasto. **No hay fecha de lanzamiento de iOS**, y no se
fija una acá.


### 7.c Dispositivos físicos

**No son la misma exigencia, y mezclarlas confunde. Corregido el 30/08.**

🔴 **Android físico: OBLIGATORIO.** Es criterio de salida del prototipo
(Etapa 2). Sin un teléfono real no se aprueba nada: el emulador no resuelve el
punto abierto del tráiler —que depende de la identidad de una build firmada—,
ni el arranque en frío, ni el comportamiento real del teclado.

🟡 **iPhone físico: fuertemente recomendado, NO obligatorio.** No hace falta
para compilar ni para enviar el binario. Hace falta para validar con
responsabilidad antes de publicar.

**Qué NO valida bien el simulador de iOS**, que es lo que hay que pesar al
decidir:

| Qué | Por qué el simulador no alcanza |
|---|---|
| **Safe areas reales** | no reproduce el notch ni el home indicator de un dispositivo concreto |
| **Teclado** | el comportamiento real, y la app depende de `interactiveWidget` |
| **Universal Links** | la asociación con el dominio se resuelve distinto |
| **Rendimiento** | corre sobre el CPU de la Mac; el Home tarda ~2,9 s con todo cacheado y eso ahí no se mide |
| **Comportamiento del WebView** | la purga de `localStorage` bajo presión de memoria, y el embed de YouTube |

---

## 8. Permisos — el mínimo real, sin preventivos

> **Medido en CP9, con los tres plugins instalados.** El APK compilado declara
> `android.permission.INTERNET` —el único de sistema, y ya venía en la
> plantilla— más `ar.yump.app.dev.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
> que es interno de AndroidX, **de la propia app**, autogenerado al fusionar el
> manifest y sin acceso a nada del dispositivo. `@capacitor/app`,
> `@capacitor/status-bar` y `@capacitor/share` declaran **0 permisos** cada uno.
>
> ⚠️ CP9 sí agregó un atributo al manifest, y conviene saber por qué:
> `android:enableOnBackInvokedCallback="false"`. Con `targetSdk 36` el atrás
> predictivo queda activo por defecto y nadie lo implementa acá. **No era la
> causa del botón Atrás roto** —eso fue `canGoBack`, ver CP9 en el plan— pero se
> conserva para no dejar activo un modelo sin manejar.


**Android** — sólo uno:

```
android.permission.INTERNET
```

Lo agrega Capacitor solo. Nada más.

- `ACCESS_NETWORK_STATE`: sólo si se usa `@capacitor/network`. **No hace falta**:
  `useApi` ya distingue `offline` de `error`.
- `POST_NOTIFICATIONS`: **sólo** si entra la recomendación 5 de §5.b
  (notificaciones locales). Si entra, es un permiso pedido en contexto, cuando
  el usuario toca "Recordarme" — nunca al arrancar.
- 🔴 **Nada de** cámara, ubicación, almacenamiento, contactos,
  `QUERY_ALL_PACKAGES`.
- ⚠️ Revisar el `AndroidManifest.xml` generado y **sacar lo que Capacitor o un
  plugin hayan metido de más**. Un permiso que sobra es una pregunta de más en
  Data Safety y una razón de más para un rechazo.

**iOS** — ninguna clave de uso:

- Sin `NSCameraUsageDescription`, sin ubicación, sin fotos, sin micrófono.
- `NSUserTrackingUsageDescription`: **no**. No se usa IDFA ni se rastrea entre
  apps (`PLAY-STORE.md` §7.b ítem 15 ya lo deja dicho para Play).
- ATS: todo el tráfico es HTTPS (TMDB, Supabase, Vercel, YouTube). **Sin
  excepciones de ATS.**
- `LSApplicationQueriesSchemes`: **no**. Haría falta para detectar si Netflix
  está instalado; no se hace, y §4.h explica por qué no se va a hacer.

---

## 9. La PWA: qué se conserva, qué cambia, qué choca

**La PWA web no se toca en absoluto.** Sigue en `app.yump.ar`, instalable, con
su SW. Lo de abajo es sólo sobre la cáscara empaquetada.

| Pieza | En el contenedor |
|---|---|
| `app/manifest.ts` | inerte, inofensivo. **Se conserva** (lo usa la web) |
| Íconos y splash (26 assets) | los de la web quedan; el contenedor usa los suyos, generados aparte de la misma `assets/brand/logo.svg` |
| `AppleSplashLinks` (18 splash) | inerte. Lo reemplaza `@capacitor/splash-screen` |
| Safe areas, `viewportFit`, `interactiveWidget` | ✅ **se conservan y son la parte que ya está bien** |
| `public/sw.js` + `public/sw/*` | **no se registra en nativo** (§4.d). Se conserva para la web |
| `offline.html` + `OfflineState` | `offline.html` inerte; **`OfflineState` se conserva** y pasa a ser el único estado offline |
| `useApi` con `offline`/`error`/`retry` | ✅ se conserva tal cual. Es la pieza clave |
| `UpdateToast` | inerte en nativo. Ahí actualiza la tienda |

**Los dos choques reales:**

1. 🔴 **`InstallPrompt` se va a mostrar dentro de la app instalada.**
   `detectIOS()` mira el user agent, y el WKWebView de iOS dice iOS. La rama de
   iOS **no espera `beforeinstallprompt`**: muestra las instrucciones
   directamente. O sea que el usuario que bajó la app de la App Store vería un
   cartel que le dice *"Compartir → Agregar a inicio"*. Es absurdo para el
   usuario **y es riesgo de rechazo** (referir a otro canal de distribución).
   Hay que gatearlo con `Capacitor.isNativePlatform()`.

2. ⚠️ **`StandaloneWelcome` se va a disparar en el primer arranque nativo.**
   `isStandalone()` matchea `display-mode: standalone`, que en el contenedor da
   `true`. Y en realidad **el comportamiento es correcto** (instalación nueva =
   contexto de storage nuevo = hay que elegir plataformas). Pero el texto habla
   de la barra superior y de haber perdido la sesión de Safari: hay que
   revisarlo para que tenga sentido en una app bajada de una tienda.

Los dos son condiciones de una línea, pero **los dos pasan desapercibidos hasta
que alguien abre la app instalada**, así que van en la checklist de la Etapa 2.

---

## 10. Plan por etapas — ⚠️ REORDENADO el 29/08

Cambió respecto de la versión del 28/08: **Android va entero primero y se
evalúa antes de tocar iOS.** Antes iOS estaba intercalado, y eso sólo tiene
sentido si las dos salen juntas.

Estimación en **sesiones de trabajo** (media jornada), no en días de calendario.
Incluye la curva de Android Studio, que es primer proyecto nativo del dueño.

### Estimaciones, separadas

| Bloque | Trabajo | Calendario aparte |
|---|---|---|
| **Android (etapas 1-6)** | **~8-12 sesiones** | + prueba cerrada (12 testers × 14 días corridos) + revisión de Play |
| **iOS (etapas 8-9)** | **se estima cuando se llegue**, no ahora | + TestFlight + revisión de Apple |

**Por qué iOS no se estima todavía**, y no es cautela de más: el número depende
de cuánto de la Etapa 3 resultó realmente reutilizable, de si el plan de Mac
remota administrado alcanzó o hubo que ir a dedicado, y de la curva de Xcode,
que no se puede estimar sin haberla tocado. Un número ahora sería inventado.
Lo que sí está decidido es **qué incluye** cuando se estime: adaptación,
pruebas —en iPhone físico si el dueño decide conseguir uno—, TestFlight y
revisión.

### Etapa 1 — Auditoría y documentación cerradas ✅

Esta etapa. Este documento, `docs/PLAY-STORE.md` y los de estado, sin
contradicciones y con las decisiones vigentes escritas. **Terminada.**

### Etapa 2 — Prototipo Android local y descartable (1-2 sesiones)

**Existe para poder cancelar barato.** No se escribe código de producto: se
contesta si la opción B funciona. El proyecto se tira al terminar.

Lo que **tiene que validar** —y esta lista es el criterio de salida—:

- [ ] empaquetado de la cáscara local;
- [ ] consumo de `https://app.yump.ar/api` con el CORS de §3.5, y **cinco
      comprobaciones concretas**: un `GET` público; un `POST` con cuerpo JSON;
      una llamada con `Authorization: Bearer`; el **preflight `OPTIONS`** (que
      se dispara justo en las dos rutas con sesión, porque `Authorization` más
      `Content-Type: application/json` deja de ser un request simple); y que
      **un origen NO permitido no reciba autorización CORS**;
- [ ] rutas dinámicas de títulos y personas (§2.b — el que rompe en silencio);
- [ ] autenticación y persistencia de sesión;
- [ ] **tráiler de YouTube en el WebView, en un Android físico y con build
      firmada** (§3.4). Es el punto abierto con más incertidumbre: hay que
      determinar **qué mecanismo de identificación acepta YouTube** (`Referer`
      del WebView, URL base, `origin`, WebView Media Integrity), no dar por
      buena ninguna hipótesis de antemano;
- [ ] compartir con URL canónica;
- [ ] enlaces externos;
- [ ] botón Atrás;
- [ ] teclado, barra de estado y safe areas;
- [ ] comportamiento sin conexión;
- [ ] arranque frío y caliente **en un Android físico**;
- [ ] **decisiones que permitan reutilizar el trabajo en iOS** (decisión 6).

Ese último punto no es decorativo: es lo que separa este plan de un atajo
Android-only. Concretamente significa **no** resolver nada con APIs que sólo
existan en el WebView de Android, **no** asumir que el origen es `https://`, y
**no** meter ramas por plataforma donde alcance una constante compartida.

### Etapa 3 — Adaptación de la capa web para bundle local (3-5 sesiones)

Código de este repo, detrás de banderas, **sin romper la web**:

- Base URL de la API + CORS (§3.5). **Acá se decide dónde vive el helper**,
  midiendo el impacto — no antes.
- Helper `hrefTitulo`/`hrefPersona` (10 call sites, §2.b).
- `abrirExterno()` con `@capacitor/browser` (~6 call sites, §4.e).
- `@capacitor/share` (§4.h — la URL ya sale canónica).
- El embed de YouTube: aplicar **lo que haya resultado de la Etapa 2**, no una
  solución elegida de antemano (§3.4).
- Gatear `InstallPrompt`, `ServiceWorkerRegister`, `UpdateToast`; revisar
  `StandaloneWelcome` (§9).
- Adaptador de `@capacitor/preferences` para la sesión y `sc:platforms` (§4.a).
- `searchParams` de `/categoria` al cliente (§2.c).
- `npx tsc --noEmit`, la suite y `npm run build` de la web, limpios.

### Etapa 4 — Aplicación Android usable (3-4 sesiones)

- Proyecto Android con Capacitor 8, `applicationId`, íconos y splash.
- Botón Atrás (§4.f) — **primero, es lo que más se nota**.
- Barra de estado sincronizada con `ThemeContext`.
- Keystore + Play App Signing + `assetlinks.json` (⚠️ el SHA-256 correcto).
- Deep links y el retorno del mail de reset.
- Notificaciones locales de "Recordarme", si entra en alcance (§5.b).
- Recorrer la checklist de §9 en un teléfono real.

### Etapa 5 — Pruebas internas (2-3 sesiones + calendario)

- Internal testing de Play.
- **Si la cuenta es personal post-13/11/2023: 12 testers opted-in de forma
  continua durante 14 días corridos.** Es calendario, no trabajo: **arrancarlo
  lo antes posible**, en paralelo con la Etapa 4 si se puede.

### Etapa 6 — Publicación en Google Play (2-3 sesiones)

- Data Safety (matriz de `PLAY-STORE.md` §2), IARC, público objetivo (16 años).
- Capturas reales — **los `public/screenshots/` son placeholders del manifest y
  no sirven para Play**.
- Los ítems abiertos de `PLAY-STORE.md` §7.b.

### Etapa 7 — Evaluación del resultado de Android 🔵

**Punto de decisión, no de trabajo.** Con la app publicada y datos reales
—instalaciones, retención, si alguien la usa— el dueño decide si iOS se
justifica. Es la condición que él mismo puso: el gasto de iOS se aprueba contra
resultados, no contra expectativas.

**Si acá la respuesta es no, el proyecto está completo.** Las etapas 8 y 9 no
son deuda pendiente.

### Etapa 8 — Prototipo iOS con Mac remota (estimación pendiente)

- **Empezar por el plan más económico que cumpla las cuatro condiciones de
  §7.b** (macOS apto para Xcode 26, Xcode 26 disponible, Node 22, y que corra
  `npx cap sync ios`). Escalar a dedicado **sólo ante un bloqueo demostrado**,
  no preventivamente.
- Proyecto iOS, `Info.plist` (`ITSAppUsesNonExemptEncryption`), splash, íconos.
- AASA + Universal Links.
- Safe areas y teclado — 🟡 en un iPhone físico si hay uno disponible; si no,
  queda como riesgo asumido y declarado (§7.c).
- 🔍 Probar a propósito la **purga de `localStorage`** y confirmar que
  `@capacitor/preferences` la sobrevive.
- 🔍 El embed de YouTube bajo `capacitor://`: hay que **repetir la
  determinación de la Etapa 2 en iOS**, porque el mecanismo para fijar el
  `Referer` es propio de cada plataforma y lo que funcione en Android no se
  traslada solo.

### Etapa 9 — TestFlight y App Store (estimación pendiente) 🔵

**Sujeta a que el dueño apruebe costo y alcance.**

- Etiquetas de privacidad, capturas por tamaño de pantalla, cuenta de prueba.
- 🟡 Notas para el revisor: **liderar con la ruleta** y con las notificaciones
  locales (§5.a).
- Presupuestar **al menos un rechazo**. Es lo normal en una primera app, y más
  con este perfil de producto.

**Sin fecha.** No se fija una acá y no se debería fijar hasta terminar la
Etapa 7.

---

## 11. Riesgos, bloqueantes y decisiones del dueño

### 11.a Bloqueantes duros — ⚠️ ACTUALIZADO el 29/08

**El bloqueante #1 de la versión anterior era "no hay Mac". Ya no lo es**: con
Mac remota, iOS pasa de muro a decisión de gasto, y además queda después de la
Etapa 7. Lo que queda:

| # | Bloqueante | Impacto |
|---|---|---|
| 1 | **Target API 36** | Google Play lo exige a apps nuevas desde el **31/08/2026**. Se cubre creando el proyecto con **Capacitor 8** **y verificando** `compileSdkVersion`/`targetSdkVersion` = 36 en `android/variables.gradle` (§7.a). No es automático: es un chequeo de la Etapa 2. *La prórroga al 01/11 es sólo para apps ya publicadas; a Yump no le aplica.* |
| 2 | **Tipo de cuenta de Play** 🔵 | personal post-13/11/2023 = 12 testers × 14 días corridos antes de producción |
| 3 | **Identificador definitivo** 🔵 | irreversible después de la primera subida (§6) |

**Ya NO son bloqueantes** (se resolvieron o se reclasificaron):

- ~~No hay Mac~~ → Mac remota, y recién en la Etapa 8.
- ~~`api.yump.ar`~~ → no hace falta (§3.4).
- ~~El bug de compartir~~ → cerrado y verificado en producción (§4.h).
- ~~Issue #14, parpadeo del avatar~~ → **postergado por decisión del dueño**; no
  bloquea el prototipo ni el empaquetado.

### 11.b Riesgos técnicos, ordenados por probabilidad × daño

| Riesgo | Prob. | Daño | Mitigación |
|---|---|---|---|
| **Back de Android cierra la app** | **alta** | alto | `@capacitor/app`, Etapa 4 |
| **`InstallPrompt` dentro de la app** | **alta** | medio | una condición, pero hay que acordarse (§9) |
| **Rutas dinámicas rompen al tocar una card** | **alta** si no se ataca | alto | §2.b, Etapa 2 lo valida |
| **Desfasaje cáscara/API** | media | alto | regla de compatibilidad escrita + `minVersionApp` (§4.i) |
| **YouTube error 153 en el contenedor** | 🔍 **desconocida** | **alto** — es una función visible del producto | ⚠️ **sin mitigación confirmada.** Se determina en la Etapa 2, en un Android físico con build firmada (§3.4). Antes decía "una línea con `SITIO_PUBLICO`": era falso |
| **CORS abierto = API scrapeable** | media | medio | allowlist de coincidencia exacta con selección por request, no comodín ni reflector (§3.5) |
| **El plan de Mac administrado no deja compilar** | 🔍 media | medio | verificarlo en el spike de la Etapa 8 antes de pagar de más (§7.b) |
| **Rechazo de Apple por 4.2** | media | alto | las 5 integraciones nativas de §5.b — **pero recién en la Etapa 9** |
| **Purga de `localStorage` en iOS** | media | alto | `@capacitor/preferences`, y se diseña en la Etapa 3 aunque se pruebe en la 8 |
| **Se pierde el cache de pósters** | alta | bajo | aceptar y medir |
| **Analytics muertos en la app** | alta | bajo | 🔵 decidir si se reemplaza |

### 11.c Decisiones que todavía necesitan al dueño

Las de arquitectura ya están tomadas (§0.a). Quedan estas:

| # | Decisión | Cuándo hace falta |
|---|---|---|
| 1 | **Identificador: ¿`ar.yump.app`?** | **antes de la primera subida**. Irreversible |
| 2 | **Cuenta de Play: ¿personal u organización?** | antes de la Etapa 5. ±14 días de calendario |
| 3 | **¿Entran las notificaciones locales en la v1?** | Etapa 4. Es el mejor argumento contra 4.2, y suma un permiso |
| 4 | **¿Se reemplaza Vercel Analytics en la app?** | Etapa 3. Si no, no hay métricas de la app instalada |
| 5 | **¿Se saca la cookie `sc_platforms`?** | Etapa 3. En el contenedor no hace nada |
| 6 | **¿iOS se hace?** | **Etapa 7**, contra resultados de Android |
| 7 | **Apple: ¿individual u organización?** | sólo si la 6 es sí. Organización pide D-U-N-S |
| 8 | **¿Se distribuye en la UE?** | sólo si la 6 es sí. Trader status |
| 9 | **¿OTA (Capgo/Live Updates)?** | 🟡 no para la v1 |

---

## 12. Lo que esta auditoría NO verificó

Para que nadie lo tome por confirmado:

- **No se corrió Capacitor.** Nada de esto se probó contra este repo. Lo que
  cambió el 29/08 es que las afirmaciones sobre `server.url`, `iosScheme`,
  `hostname` y el target SDK **ya no salen de conocimiento general**: salen de la
  documentación oficial, citada en §14. Lo que sigue sin probarse es cómo se
  comporta ESTE proyecto adentro de un contenedor — para eso está la Etapa 2.
- **No se abrieron Play Console ni App Store Connect.** El estado de las
  cuentas, la disponibilidad del identificador y las fechas exactas de las
  políticas hay que confirmarlos ahí.
- **No se probó ningún export estático de este proyecto.** Los cuatro
  bloqueantes de §2 salen de leer el código y de cómo funciona `output:
  "export"`, no de haber corrido el build. La Etapa 0 existe exactamente para
  eso.
- **No se midió** cuánto pesa el bundle exportado ni cuánto tarda el arranque en
  frío en un teléfono real.
- **Los defaults de versión de Capacitor cambian entre versiones mayores.** Nada
  de lo que dependa de eso se dio por sentado.

---

## 13. Qué queda decidido en `docs/PLAY-STORE.md`

Esta auditoría cierra la **decisión 10 de §4.c ("¿TWA o nativo?")**: TWA queda
descartado por la ventana de iOS, y el camino es **Capacitor con bundle local**.

Como consecuencia, la fila 3 de §7.b (`assetlinks.json`, "imprescindible para
TWA") cambia de motivo pero **no de estado**: sigue haciendo falta, ahora para
los App Links de Android y el retorno de los mails de autenticación.


---

## 14. Fuentes consultadas — 29 de agosto de 2026

Todo lo que este documento afirma sobre plataformas, herramientas y precios sale
de acá. **Las fechas importan**: los requisitos de tienda y los precios cambian,
y una cita sin fecha envejece sin avisar.

### Oficiales

| Qué se confirmó | Fuente |
|---|---|
| `server.url` **"is not intended for use in production"**; `iosScheme` no admite `http`/`https`; se recomienda dejar `hostname` en `localhost` por el contexto seguro | [Capacitor — Configuration](https://capacitorjs.com/docs/config) |
| El target SDK se especifica en **`/android/variables.gradle`**; *"Capacitor Android does not support custom target SDK versions. Each version of Capacitor Android requires a specific target SDK version and support is only provided for that matching version"*; y hay que **mantener la versión mayor al día** porque cada una trae el SDK que Google pide ese año | [Capacitor — Setting Android Target SDK](https://capacitorjs.com/docs/android/setting-target-sdk) |
| **Capacitor 8**: *"requires NodeJS 22 or greater"*, *"requires Xcode 26.0+"*, deployment target mínimo **iOS 15.0**, `minSdkVersion = 24`, `targetSdkVersion = 36`, `compileSdkVersion = 36`, y *"Capacitor CLI now creates iOS SPM projects as default"* | [Capacitor — Updating to 8.0](https://capacitorjs.com/docs/updating/8-0) |
| Apps nuevas y actualizaciones deben apuntar a **API 36 desde el 31/08/2026**; prórroga al **01/11/2026** solicitable **para apps existentes** | [Google Play — Target API level requirements](https://developer.android.com/google/play/requirements/target-sdk) |
| Cuentas personales creadas después del **13/11/2023**: **12 testers** opted-in de forma continua **14 días** antes de pedir acceso a producción | [Play Console Help — App testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) |
| Apple Developer Program: **99 USD por año de membresía**; puede variar por región y se muestra en moneda local al inscribirse. Organizaciones necesitan **D-U-N-S** | [Apple — Membership Details](https://developer.apple.com/programs/whats-included/) · [Enroll](https://developer.apple.com/programs/enroll/) |
| Xcode Cloud: requiere **Xcode 15+** y membresía; **los workflows se configuran desde Xcode**. Incluye 25 horas de cómputo al mes | [Apple — Get started with Xcode Cloud](https://developer.apple.com/xcode-cloud/get-started/) |

| **Error 153** = *"the request does not include the `HTTP Referer` header or equivalent API Client identification"*; el parámetro `origin` es una medida de seguridad (*"protects against malicious third-party JavaScript being injected into your page"*), **no** el mecanismo de identificación | [YouTube — IFrame Player API Reference](https://developers.google.com/youtube/iframe_api_reference) |
| *"API Clients that use the YouTube embedded player must provide identification through the `HTTP Referer` request header"*; en apps móviles ese encabezado viene vacío y hay que fijarlo con métodos de la plataforma, con una URL HTTPS cuyo dominio sea **el identificador de la app**; y hay que usar *"one of the OS-provided WebView types"* (Capacitor ya lo cumple) | [YouTube — Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality) |

### Comerciales — ⚠️ referencias, NO tarifas

**Estos números no son un presupuesto.** Cambian por proveedor, plan,
configuración, disponibilidad, región e impuestos, y pueden haber cambiado desde
que se escribió esto. **Verificar el precio del día antes de contratar.**

| Proveedor | Lo relevante, al 29/08/2026 | Fuente |
|---|---|---|
| **MacinCloud** | Los planes **administrados / pay-as-you-go** (el tramo barato, por hora o por día) **no dan acceso root/admin**: las tareas de administrador las hace su soporte a pedido. Para autogestión hay que ir a los planes dedicados. **Esta es la distinción que importa, más que el precio** | [MacinCloud — Pay-as-you-go](https://support.macincloud.com/support/solutions/articles/8000044698-what-is-macincloud-s-pay-as-you-go-server-plan-) |
| **MacStadium** | Mac mini dedicados **desde ~US$109/mes** (M2.S) hasta ~US$349. Dan *"full, root-access control"*. Facturación mensual, prepaga, en dólares; la página **no aclara impuestos** | [MacStadium — Pricing](https://macstadium.com/pricing) |

**Sobre la referencia de ~US$25/mes** que manejaba el dueño: es plausible para
el tramo **administrado por hora/día**, no para un Mac dedicado. La diferencia no
es de comodidad — es si se puede instalar lo que un build de Capacitor necesita
(§7.b). **Es la primera pregunta a resolver en la Etapa 8, y se resuelve
pagando el plan más barato una vez, no leyendo páginas de precios.**
