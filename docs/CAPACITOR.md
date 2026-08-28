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

## 0. Resumen ejecutivo

**Tres líneas.**

1. Yump **ya es una SPA**: ninguna de sus 20 páginas hace un solo fetch en el
   servidor. Eso hace que el empaquetado local sea mucho más barato acá que en
   un Next típico — y es el hallazgo que decide todo lo demás.
2. Aun así, **el export estático NO sale gratis**: hay cuatro bloqueantes
   concretos y verificados, y uno de ellos (las rutas de ficha y persona) es de
   los que rompen en silencio si no se atacan a propósito.
3. La recomendación es **bundle local + API remota** (opción B), con el detalle
   de configuración de §3.4. Cargar `app.yump.ar` dentro del contenedor
   (opción A) es *exactamente* lo que la regla 4.2 de Apple rechaza, y sería
   cambiar el bloqueo de TWA por el mismo bloqueo con otro nombre.

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

✅ **CONFIRMADO.** `app/categoria/[slug]/page.tsx` lee `searchParams.tipo` en el
servidor. Bajo `output: "export"` eso no está permitido. Se resuelve moviendo
esa lectura al cliente — y **el cliente ya sabe hacerlo**:
`hooks/categoria-generaciones.ts` restaura el tipo del snapshot, no de la URL
(está documentado en `CLAUDE.md`). O sea que la lectura del servidor es casi
decorativa.

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
- El propio Capacitor documenta `server.url` como herramienta de **live reload
  en desarrollo**, no como arquitectura de producción.
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

### 3.4 La configuración que hace que B duela poco — 🔍 hay que probarla

Este es el punto de mayor apalancamiento de toda la auditoría, y también el que
menos puedo afirmar sin haberlo corrido.

**El problema.** Con los esquemas por defecto, el origen del WebView es
`https://localhost` (Android) y `capacitor://localhost` (iOS). Eso dispara, de
un saque, cuatro problemas distintos:

| Qué se rompe | Por qué |
|---|---|
| `fetch("/api/home")` | resuelve contra el contenedor, que no tiene `/api` |
| El embed de YouTube | `trailerEmbedUrl` manda `origin=capacitor://localhost`; con `enablejsapi=1` eso es el **error 153** que ya documenta `lib/trailer.ts:38` |
| Compartir una ficha | `components/DetailView.tsx:88` arma la URL con `window.location.origin` → manda `capacitor://localhost/titulo/movie/278` por WhatsApp |
| `localStorage` | queda cazado a un origen que no es el de la web (esperable, pero hay que saberlo) |

**La idea.** Capacitor deja fijar el host con el que se sirve el bundle local
(`server.hostname`, y en iOS además `iosScheme`). Sirviendo la cáscara como
**`https://app.yump.ar`**, los cuatro problemas se caen juntos: el origen es un
https real, YouTube lo acepta, la URL para compartir sale correcta y el
`localStorage` queda en el mismo origen que la web.

**La trampa, y por eso esto es 🔍 y no 🟡.** Si el WebView cree que
`app.yump.ar` es local, un `fetch` a `https://app.yump.ar/api/home` lo atiende
el servidor local y devuelve 404. **La API tiene que estar en OTRO host.** La
salida es barata: agregar `api.yump.ar` como segundo dominio del mismo proyecto
de Vercel — mismo deploy, mismo código, sin infraestructura nueva. Y entonces el
CORS es de un solo origen exacto (`Access-Control-Allow-Origin:
https://app.yump.ar`), no un comodín.

**Si en el spike resulta que no se puede**, el camino de respaldo es: esquemas
por defecto + CORS + parches puntuales (sacar `enablejsapi` en nativo, base URL
explícita para compartir). Funciona, pero son tres parches en vez de una línea
de configuración. **Esto es lo primero que hay que resolver en la Etapa 0.**

### 3.5 El CORS, si hace falta — 🔵 hay una decisión de seguridad escondida

La salida más rápida es `Access-Control-Allow-Origin: *` en `/api/:path*` desde
`next.config.mjs`. Técnicamente es inocua para la autenticación (las dos rutas
con sesión usan `Bearer`, no cookies, así que el comodín no filtra nada).

**Pero abre la API a cualquier sitio web.** Hoy cualquiera puede llamarla desde
un servidor, sí — el comodín agrega poder llamarla desde el navegador de
cualquier página, que es lo que hace fácil el scraping. Y `/api/home` cuesta
hasta 60 s y cientos de comandos de Upstash. 🟡 Preferir el origen exacto de
§3.4, o una allowlist de dos orígenes en un wrapper de ruta. **No** meter un
`middleware.ts` sólo para esto: hoy no hay ninguno y agregarlo pone latencia y
costo en *todos* los requests, incluidos los de la web.

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

🔴 **Compartir hay que arreglarlo.** Dos cosas: `navigator.share` **no existe**
en WKWebView ni en el WebView de Android, así que hoy caería siempre al fallback
de WhatsApp; y la URL se arma con `window.location.origin`, que en el contenedor
no es `app.yump.ar` (salvo que §3.4 funcione). 🟡 `@capacitor/share` da la hoja
nativa real en las dos plataformas, con una base URL explícita. Y de paso es una
integración nativa que suma para 4.2.

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
| **Target API 36** | ❌ | Vence **31/08/2026**, prórroga al **01/11/2026**. Hay que fijarlo explícitamente en `variables.gradle`; 🔍 no dar por hecho el default de la versión de Capacitor que se instale |
| Keystore de subida | ❌ | `keytool`. **Perderlo es un trámite con Google, no un `rm`** |
| Play App Signing | ❌ | Google guarda la clave de firma final |
| `assetlinks.json` en `yump.ar` | ❌ | ⚠️ **el SHA-256 que va acá es el de Play App Signing, no el del keystore de subida.** Es el error clásico y sólo se ve cuando los deep links no abren |
| Cuenta de Play | 🔍 | US$25 una vez. **Si es personal y se creó después del 13/11/2023: 12 testers, 14 días corridos.** Es la decisión 7 de `PLAY-STORE.md` §4.c y mueve el cronograma dos semanas |

### 7.b iOS

| Qué | Estado | Nota |
|---|---|---|
| **Mac** | 🔵 **no sé si el dueño tiene** | **Es un requisito duro.** Xcode no corre en Windows y Transporter tampoco. Alternativas: comprar/prestar un Mac, o CI con runners macOS (GitHub Actions, Codemagic) — pero **el primer setup y la depuración conviene hacerlos en un Mac de verdad** |
| Xcode 16+ | ❌ | y macOS reciente |
| Apple Developer Program | ❌ | **US$99/año**, se renueva. Individual: figura el nombre real como vendedor. Organización: hace falta D-U-N-S |
| Certificados y perfiles | ❌ | Xcode los gestiona solo con "automatically manage signing" |
| AASA en `yump.ar` | ❌ | para Universal Links, con el Team ID |
| `ITSAppUsesNonExemptEncryption = false` | ❌ | 🟡 declararlo en `Info.plist` desde el principio: sólo se usa HTTPS estándar, y sin esto Apple pregunta lo mismo en **cada** subida |
| **Trader status (UE)** | 🔍 | Apple exige declararlo para distribuir en la Unión Europea. Si Yump se publica sólo en Argentina/LatAm, se restringen territorios y no aplica. 🔵 Decisión |

### 7.c Dispositivos físicos

🔴 **Hace falta al menos un Android real y un iPhone real.** Emulador y
simulador no validan justamente lo que más riesgo tiene acá: la purga de
`localStorage` de iOS, las safe areas en un teléfono con notch, el
comportamiento real del teclado, los deep links, el embed de YouTube y el
rendimiento del Home (que hoy tarda ~2,9 s con todo cacheado).

---

## 8. Permisos — el mínimo real, sin preventivos

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

## 10. Plan por etapas

Estimación en **sesiones de trabajo** (media jornada), no en días de calendario.
Cuenta que es el primer proyecto nativo del dueño, así que la curva de Xcode y
de Android Studio está incluida.

### Etapa 0 — Spike: ¿la opción B es viable? (1-2 sesiones)

**Esta etapa existe para poder cancelar barato.** No se escribe código de
producto: se contesta una pregunta.

1. Export estático de la cáscara con `output: "export"` detrás de una variable
   (`CAPACITOR=1`), **sin tocar el build de la web**.
2. Resolver `titulo`/`persona` (§2.b) con dos páginas de query y el helper de
   links.
3. Capacitor en un proyecto Android descartable. **Probar la configuración de
   §3.4** (`server.hostname` = `app.yump.ar` + API en `api.yump.ar`).
4. Que cargue el Home con datos reales en un teléfono físico.

**Criterio de salida:** el Home renderiza con datos en un Android real. **Si
§3.4 no funciona**, documentar el camino de respaldo y volver a estimar antes de
seguir.

### Etapa 1 — Adaptar la capa web (3-5 sesiones)

Todo esto es código de este repo y **no rompe la web** si se hace detrás de
banderas:

- Base URL de la API + CORS (§3.5).
- Helper `hrefTitulo`/`hrefPersona` (10 call sites).
- `abrirExterno()` con `@capacitor/browser` (~6 call sites).
- Compartir con `@capacitor/share` + base URL explícita.
- Gatear `InstallPrompt`, `ServiceWorkerRegister`, `UpdateToast`; revisar
  `StandaloneWelcome`.
- Adaptador de `@capacitor/preferences` para sesión Supabase y `sc:platforms`.
- `searchParams` de `/categoria` al cliente.
- `npx tsc --noEmit` + `npm run build` de la web tienen que seguir limpios.

### Etapa 2 — Android usable (3-4 sesiones)

- Proyecto Android, `applicationId`, `targetSdk 36`, íconos y splash.
- Botón Atrás (§4.f) — **primero, es lo que más se nota**.
- Barra de estado sincronizada con `ThemeContext`.
- Keystore + Play App Signing + `assetlinks.json` (⚠️ el SHA-256 correcto).
- Deep links y el retorno del mail de reset.
- Notificaciones locales de "Recordarme", si entra en alcance.
- Recorrer la checklist de §9 en un teléfono real.

### Etapa 3 — iOS usable (3-5 sesiones)

**Bloqueada por el Mac y por la cuenta de Apple.**

- Proyecto iOS, `Info.plist` (`ITSAppUsesNonExemptEncryption`), splash, íconos.
- AASA + Universal Links.
- Safe areas y teclado en un iPhone con notch.
- 🔍 **Probar a propósito la purga de `localStorage`** y confirmar que
  `@capacitor/preferences` la sobrevive.
- 🔍 El embed de YouTube: es donde §3.4 se paga o se cobra.

### Etapa 4 — Pruebas internas (2-3 sesiones + calendario)

- Internal testing de Play (rápido) y TestFlight interno.
- **Si la cuenta de Play es personal post-13/11/2023: 12 testers × 14 días
  corridos.** Es calendario, no trabajo, y hay que arrancarlo lo antes posible.

### Etapa 5 — Publicación en Google Play (2-3 sesiones)

- Data Safety (matriz de `PLAY-STORE.md` §2), clasificación IARC, público
  objetivo (16 años, ya decidido), capturas reales — **los `public/screenshots/`
  actuales son placeholders del manifest y no sirven**.
- Los ítems abiertos de `PLAY-STORE.md` §7.b.

### Etapa 6 — App Store (2-4 sesiones + revisión)

- Etiquetas de privacidad, capturas por tamaño de pantalla, cuenta de prueba
  para el revisor.
- 🟡 **Notas para el revisor: liderar con la ruleta** y con las notificaciones
  locales (§5.a).
- Presupuestar **al menos un rechazo**. Es lo normal en una primera app, y más
  con este perfil de producto.

**Total: ~14-21 sesiones de trabajo, más 2-4 semanas de calendario** entre
prueba cerrada y revisiones. La ventana de Apple (uno o dos meses después de
Android) es realista **si la Etapa 3 no se bloquea por el Mac**.

---

## 11. Riesgos, bloqueantes y decisiones del dueño

### 11.a Bloqueantes duros (nada avanza sin esto)

| # | Bloqueante | Impacto |
|---|---|---|
| 1 | **No hay Mac** 🔵 | iOS no existe sin esto. Es la primera pregunta a contestar, porque define si la ventana de "uno o dos meses" es alcanzable |
| 2 | **Target API 36 vence el 01/11/2026** | quedan ~2 meses de prórroga |
| 3 | **Tipo de cuenta de Play** 🔵 | personal post-13/11/2023 = +14 días corridos de prueba cerrada |
| 4 | **Identificador definitivo** 🔵 | irreversible después de la primera subida (§6) |

### 11.b Riesgos técnicos, ordenados por probabilidad × daño

| Riesgo | Prob. | Daño | Mitigación |
|---|---|---|---|
| **Rechazo de Apple por 4.2** | media | alto | las 5 integraciones nativas de §5.b + notas liderando con la ruleta |
| **§3.4 no funciona como espero** | 🔍 media | medio | Etapa 0 lo resuelve; hay camino de respaldo documentado |
| **YouTube error 153 en nativo** | media | medio | ya está documentado en el repo; §3.4 lo resuelve de raíz |
| **Purga de `localStorage` en iOS** | media | alto | `@capacitor/preferences` para sesión y plataformas |
| **Desfasaje cáscara/API** | media | alto | regla de compatibilidad escrita + `minVersionApp` (§4.i) |
| **`InstallPrompt` dentro de la app** | **alta** | medio | una condición, pero hay que acordarse (§9) |
| **Back de Android cierra la app** | **alta** | alto | `@capacitor/app`, Etapa 2 |
| **CORS abierto = API scrapeable** | media | medio | origen exacto, no comodín (§3.5) |
| **Se pierde el cache de pósters** | alta | bajo | aceptar y medir |
| **Analytics muertos en la app** | alta | bajo | 🔵 decidir si se reemplaza |

### 11.c Decisiones que necesitan al dueño

| # | Decisión | Por qué bloquea |
|---|---|---|
| 1 | **¿Hay Mac, o se consigue?** | define si iOS entra en la ventana pedida |
| 2 | **Identificador: ¿`ar.yump.app`?** | irreversible |
| 3 | **Cuenta de Play: ¿personal u organización?** | ±14 días de calendario |
| 4 | **Apple: ¿individual u organización?** | organización pide D-U-N-S; individual publica el nombre real |
| 5 | **¿Se distribuye en la UE?** | si sí, hay que declarar trader status |
| 6 | **¿Entran las notificaciones locales en la v1?** | es el mejor argumento contra 4.2, y suma un permiso |
| 7 | **¿`api.yump.ar` como segundo dominio?** | habilita la configuración de §3.4 |
| 8 | **¿Se saca la cookie `sc_platforms`?** | decisión 9 de `PLAY-STORE.md`; acá queda sin ningún uso |
| 9 | **¿Se reemplaza Vercel Analytics en la app?** | si no, no hay métricas de la app instalada |
| 10 | **¿OTA (Capgo/Live Updates)?** | 🟡 no para la v1 |

---

## 12. Lo que esta auditoría NO verificó

Para que nadie lo tome por confirmado:

- **No se corrió Capacitor.** Todo lo de `server.hostname`, esquemas, service
  worker en el WebView de Android y comportamiento del bundle local está marcado
  🔍 y sale de conocimiento general, no de una prueba contra este repo.
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
