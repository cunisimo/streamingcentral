# Google Play: auditoría y diseño legal

**Etapa de auditoría y diseño. No se tocó código, no se creó ninguna página, no
se desplegó nada y no se escribió en Supabase.**

**Última corrección: 25 de agosto de 2026.** Esta versión corrige errores de la
primera, marcados con ⚠️ **CORREGIDO** donde corresponde.

---

## Cómo leer este documento

Todo lo de acá cae en una de cuatro cajas, y **no se mezclan**:

| Marca | Qué significa |
|---|---|
| ✅ **CONFIRMADO** | Verificado en el código de este repo o citado de documentación oficial vigente, con enlace |
| 🔵 **DECISIÓN** | Depende de vos. No la tomo yo |
| 🔍 **VERIFICAR** | No se puede saber desde el repo: hay que mirar un panel (Vercel, Supabase, Play Console) |
| 🟡 **RECOMENDACIÓN CONSERVADORA** | Mi criterio para minimizar riesgo de rechazo. **No es asesoramiento legal.** Nada de lo que sigue lo es |

---

## 0. Hallazgos confirmados

> **Actualización del 2026-08-25 — el hallazgo 2 (atribución CC BY 4.0 de
> DiceBear) y la decisión 17 (§2.f) están RESUELTOS.** DiceBear salió del
> proyecto: los avatares son ahora 31 archivos propios en `/avatars/`, sin
> dependencia ni conexión externa. Eso elimina la fila de "sharing" de §2.f,
> saca `api.dicebear.com` de la matriz de terceros de §2.g y deja sin objeto la
> atribución. Ver `docs/AVATARES.md`. El resto de esta auditoría sigue vigente.

1. ✅ **Falta la atribución visible de TMDB.** Cero menciones en la interfaz. La
   app ya está publicada, así que es un incumplimiento vigente.
2. ✅ **Falta la atribución CC BY 4.0 de DiceBear** (`adventurer-neutral`, de
   Lisa Wischofsky).
3. ✅ **Los wordmarks dibujados de plataformas no son adecuados para Play.**
4. ✅ **Faltan las cuatro rutas públicas**: `/privacidad`, `/terminos`,
   `/acerca-de`, `/eliminar-cuenta`.
5. ✅ **Falta el paquete Android por completo** — no hay `assetlinks.json`, ni
   `twa-manifest.json`, ni proyecto Bubblewrap — y **debe apuntar directamente a
   API 36**.
6. ✅ **Hay que preparar**: Data Safety, clasificación de contenido, acceso para
   revisión, recursos de tienda, firma, `assetlinks.json`, pruebas y revisión del
   AAB final.
7. ⚠️ **CORREGIDO — `OnboardingGate` secuestra las cuatro rutas nuevas.** Ver §6.
8. ⚠️ **CORREGIDO — las plataformas elegidas se transmiten al backend en casi
   toda la app, también para invitados.** Ver §1.

**Sobre el plazo de API 36**: el requisito vence el **31/08/2026**, con prórroga
solicitable hasta el 01/11/2026
([Target API level requirements](https://developer.android.com/google/play/requirements/target-sdk)).
🔍 **VERIFICAR** en Play Console si el formulario de prórroga ya está disponible
para tu cuenta.

---

## 1. Inventario de datos, en cuatro niveles

⚠️ **CORREGIDO.** La versión anterior decía que lo local "nunca se envía a
nuestro servidor, con una excepción". **Era falso.** El propio `CLAUDE.md` lo
documenta: *"Todo fetch a `/api/*` lleva `?providers=n,d,m` y el server filtra
con eso"*. La preferencia de plataformas viaja en casi todas las peticiones, y
**también cuando la persona es invitada y no tiene cuenta**.

### Nivel A — Exclusivamente local: nunca sale del dispositivo

✅ Verificado: ninguna de estas claves aparece en una URL, un body ni una cookie.

| Clave | Qué | Se borra con la cuenta |
|---|---|---|
| `sc:theme` | tema claro/oscuro | no (preferencia del dispositivo) |
| `sc:pais` | país preferido, elegido en `/cuenta/configuracion` | no |
| `sc:visits` | contador de visitas (banner de instalación) | no |
| `yump:shelf-type` | último toggle Películas/Series | no |
| `sc:pwa:counted`, `sc:pwa:dismissed`, `sc:pwa:shown`, `sc:pwa:welcomed` | estado del banner de instalación | no |
| `yump:ruleta-mostrados` | tmdb_id ya mostrados por la ruleta | **sí** |
| `yump:hero-estado`, `yump:lista-paginada`, `yump:lista-vuelta`, `yump:track-scroll` | estado de navegación y scroll | **sí** |
| `sb-<ref>-auth-token` | la sesión de Supabase | **sí** |

**Hallazgo menor**: `sc:pais` se escribe en `/cuenta/configuracion` y **no lo lee
nadie más** en toda la app. Es una preferencia guardada que hoy no hace nada.

### Nivel B — Transmitido al backend, SIN cuenta

**Esto es lo que corrige la versión anterior.** Ocurre para cualquier visitante,
tenga o no cuenta.

| Dato | Cómo viaja | A dónde | Qué se hace con él |
|---|---|---|---|
| **Plataformas elegidas** (`sc:platforms`) | `?providers=n,d,m` en la query, y en el body JSON de `/api/te-va-a-gustar` | **16 rutas**: `home`, `top`, `search`, `discover`, `title/[tipo]/[id]`, `person/[id]`, `latest`, `miniseries`, `audience`, `recomendaciones`, `mas-votados`, `hacete-cargo`, `ruleta`, `recordatorio`, `providers`, `te-va-a-gustar` | filtrar el catálogo; **entra en la clave de cache de Upstash** (`home:<huella>:v5:<semilla>:<plataformas ordenadas>:<tipos>`) |
| **Cookie `sc_platforms`** | cookie, `SameSite=Lax`, sin `HttpOnly`, 1 año | se manda sola en **toda** petición al dominio | ✅ **nada la lee del lado del servidor**: no hay una sola llamada a `cookies()` en `app/` |
| **`country=`** | query param en `/api/discover` | `discover` | ⚠️ **precisión importante**: es el **país de ORIGEN de las películas** que se están explorando (los chips "Cine argentino", "Cine coreano"), **no** la ubicación del usuario. Revela un interés, no una ubicación |
| **`tipo`, `genre`, `page`, `offset`, `q` (búsqueda)** | query params | varias | armar la respuesta |

**Consecuencias que hay que escribir en la política de privacidad:**

- La preferencia de plataformas **es un dato que sale del dispositivo**, aunque
  no haya cuenta. No es identificable por sí solo, pero se transmite.
- **El término de búsqueda viaja en la URL** (`/api/search?q=…`), y por lo tanto
  puede aparecer en logs de acceso como *search param*.
- Las plataformas forman parte de **claves de cache compartidas entre usuarios**:
  dos personas con la misma combinación comparten la misma entrada. Eso es bueno
  para la privacidad (no hay cache por persona) y conviene decirlo.
- 🟡 **RECOMENDACIÓN**: sacar la cookie `sc_platforms`. Se transmite en cada
  petición y no la usa nadie. Es minimización gratis.

### Nivel C — Datos asociados a una cuenta

Proyecto Supabase `aibqqebwlladjjkeqllo`. ✅ Todas las tablas tienen RLS
`auth.uid() = user_id` y **todas cuelgan de `auth.users` con `on delete cascade`**.

| Dato | Dónde | Para qué | Cómo se elimina |
|---|---|---|---|
| **Email** | `auth.users` | login, recuperación | `deleteUser` |
| **Contraseña** | `auth.users`, hash (nunca en claro) | autenticación | ídem |
| **Sesión / refresh token** | `auth.sessions` + `localStorage` | mantener sesión | `signOut()` + limpieza local |
| **`user_id` (uuid)** | PK de `profiles`, FK de todo | vincular | cascade |
| **Nombre visible** | `profiles.display_name` | saludo, firma | cascade |
| **Avatar** (`avatar_style`, `avatar_seed`) | `profiles` | dibujar el avatar | cascade — pero **la semilla sale hacia DiceBear**, ver §1.E |
| **País** | `profiles.country_code` (default `AR`) | preferencia | cascade — ✅ verificado: **no se envía como parámetro a ninguna ruta** |
| **Plataformas** | `profiles.platforms integer[]` | preferencia sincronizada | cascade |
| **Votos** | `votes` (1-3 + `tmdb_id` + fecha) | rieles de votos y personalización | cascade |
| **Mi lista / Ya la vi / Descartes** | `user_items.kind` | listas del usuario | cascade |
| **Historial de fichas** | `view_history` | riel "Vistos recientemente" | cascade |

**Dos cosas que la política tiene que decir con todas las letras:**

- **Los votos alimentan un agregado público.** `top_voted()` y `vote_counts()`
  devuelven conteos, no identidades — pero el voto individual contribuye a algo
  que se publica.
- **`user_reviews` existe y está vacía a propósito** (módulo en standby). No se
  declara mientras no se active. Si se activa, es contenido generado por el
  usuario con moderación y **cambia la clasificación de contenido de Play**.

**El servidor no sabe quién pide en la personalización.** ✅ `/api/te-va-a-gustar`
recibe las señales *del cliente* porque es el único que puede leerlas (RLS); del
usuario solo se comprueba que exista sesión, y su id no se guarda ni entra en la
clave de cache. Para Data Safety eso es **procesamiento efímero** — ⚠️ lo que
**no** quiere decir que no se declare: ver §2.c.

### Nivel D — Datos que pueden quedar temporalmente en logs operativos

⚠️ **CORREGIDO.** La versión anterior afirmaba "retención en Hobby: 1 hora". **No
verifiqué el plan.** Lo retiro.

| Qué | Dónde | Retención |
|---|---|---|
| ruta, método, status, user-agent, host, región, **search params** (incluye `?q=` y `?providers=`) | Vercel Runtime Logs | 🔍 **VERIFICAR**: depende del plan. La tabla oficial va de 1 h (Hobby) a 30 días (Observability Plus) — [Runtime Logs → Limits](https://vercel.com/docs/runtime-logs) |
| IP + user-agent | Vercel, procesamiento | el filtro "logs from your browser" "works by matching your IP address and User Agent". No figura como campo del detalle |
| `console.log` / `console.error` de las funciones | ídem | ídem |
| Copias de seguridad de la base | Supabase | 🔍 **VERIFICAR**: depende del plan y de si hay PITR. **Es lo que determina cuánto sobrevive un dato después del borrado**, y no lo puedo saber desde el repo |

**Higiene ya presente**, ✅ verificada en el código y que conviene dejar escrita:

- `/api/te-va-a-gustar` es **POST** justamente para que las señales personales no
  queden en logs de acceso ni en el historial del navegador.
- `/api/cuenta/eliminar` no registra cuerpo, contraseña, token ni email.
- Ninguna clave de Upstash lleva `user_id` ni email (auditadas las familias
  `card:`, `pv:`, `videos:`, `home:`, `genre:covers:`, `blocklist:`, `people:`,
  `ed:`, `health:`, `node:`).

### Nivel E — Terceros que el NAVEGADOR contacta directamente

Ven la IP porque el navegador les habla sin pasar por nosotros.

| Tercero | Qué recibe | Fuente |
|---|---|---|
| **Vercel** (hosting) | la petición entera | — |
| **Vercel Web Analytics** | timestamp, URL, ruta dinámica, referrer, query params filtrados, **geolocalización a nivel ciudad**, SO, navegador, dispositivo. Sin cookies; identificación por "a hash created from the incoming request", descartado a las 24 h | [Analytics — Privacy](https://vercel.com/docs/analytics/privacy-policy) |
| **Vercel Speed Insights** | ruta, URL, velocidad de red, navegador, dispositivo, SO, **país**, Web Vitals | [Speed Insights — Privacy](https://vercel.com/docs/speed-insights/privacy-policy) |
| **`image.tmdb.org`** | IP, user-agent y qué póster se mira | pósters servidos directo |
| **`youtube-nocookie.com`** | IP, user-agent, al reproducir. El modo privacidad **no elimina el rastreo, evita la personalización**; los anuncios siguen pudiendo aparecer, no personalizados | [Privacy Enhanced Mode](https://support.google.com/youtube/answer/171780) |
| **`api.dicebear.com`** | IP + **la semilla del avatar**. Registra "IP addresses or domain names of the computers utilized by the Users"; responsable Florian Körner (Alemania), hosting Hetzner + BunnyWay | [DiceBear — Privacy](https://www.iubenda.com/privacy-policy/57216581/full-legal) |
| **`calendar.google.com`** | solo al tocar "Agendar": título y fecha en la URL. **Navegación iniciada por el usuario** | `lib/calendar-links.ts` |

✅ **Hallazgo a corregir antes de publicar la política**: en
`components/AuthContext.tsx:53` (y 133, 142) hay un camino de respaldo donde
`avatar_seed` toma el valor de `user.id`. Cuando corre, **el UUID de la cuenta
viaja en la URL a DiceBear** y queda en sus logs. El camino normal usa el
`gen_random_uuid()` del trigger `handle_new_user`, sin vínculo con nada.

---

## 2. Matriz de Data Safety

Definiciones citadas de
[Data safety — Play Console Help](https://support.google.com/googleplay/android-developer/answer/10787469):

- **Collection**: *"Transmitting data from your app off a user's device"*,
  incluidas librerías de terceros, SDKs y webviews bajo control del desarrollador.
- **Sharing**: *"Transferring user data collected from your app to a third party"*.
- **Approximate location**: *"User or device physical location to an area greater
  than or equal to 3 square kilometers, such as the city a user is in"*.
- **User IDs**: *"Identifiers that relate to an identifiable person."*
- **App interactions**: *"Information about how a user interacts with the app."*
- **Other actions**: *"Any other user activity or actions in-app not listed here
  such as gameplay, likes, and dialog options."*
- **Other user-generated content**: *"Any other user-generated content not listed
  here… For example, user bios, notes, or open-ended responses."*
- **Diagnostics**: *"Information about the performance of your app."*

**Excepciones que permiten NO declarar** (las seis oficiales): transferencia a
**service provider**; fines legales; transferencia iniciada por el usuario con
divulgación previa; **datos totalmente anonimizados**; **procesamiento efímero**;
cifrado de extremo a extremo.

### 2.a La matriz

⚠️ **CORREGIDO.** La versión anterior ponía "No compartido" en todo sin decir por
qué. Acá va la excepción concreta en cada fila.

| Dato | Tipo exacto de Play | ¿Recogido? | ¿Compartido? | Excepción que aplica | Obligatorio | Finalidad |
|---|---|---|---|---|---|---|
| Email | Personal info → **Email address** | Sí | No | **Service provider** (Supabase) | Opcional (solo con cuenta) | Account management |
| `user_id` (uuid) | Personal info → **User IDs** | Sí | No | Service provider (Supabase) | Opcional | Account management, App functionality |
| Contraseña | *(sin tipo en la lista)* | 🔵 **DECISIÓN** — ver 2.c | — | — | — | — |
| Nombre visible | Personal info → **Name** | Sí | No | Service provider | Opcional | App functionality, Personalization |
| **Plataformas — sin cuenta** | App activity → **Other actions** | **Sí** | No | Service provider (Vercel, Upstash) | **Obligatorio**: sin esto la app no filtra | App functionality |
| **Plataformas — con cuenta** | App activity → **Other actions** | Sí | No | Service provider (Supabase) | Opcional | App functionality, Personalization |
| País del perfil | App activity → **Other actions** | Sí | No | Service provider | Opcional | Personalization |
| **Búsquedas** (`?q=`) | App activity → **In-app search history** | **Sí** (viaja en la URL y puede quedar en logs) | No | Service provider (Vercel) | Obligatorio | App functionality |
| Votos | App activity → **Other actions** ⚠️ ver 2.d | Sí | No | Service provider | Opcional | App functionality, Personalization |
| Mi lista / Ya la vi / Descartes | App activity → **App interactions** | Sí | No | Service provider | Opcional | App functionality, Personalization |
| Historial de fichas | App activity → **App interactions** | Sí | No | Service provider | Opcional | App functionality, Personalization |
| Señales de personalización | App activity → **App interactions** | **Sí, y se marca EFÍMERO** ⚠️ | No | Service provider (Vercel). Efímero **se responde igual**, ver 2.c | Opcional | App functionality, Personalization |
| **Contraseña** (solo en la baja) | Personal info → **Other info** 🔵 | **Sí, y se marca EFÍMERO** | No | Service provider (Supabase) | Opcional | Account management |
| Speed Insights | App info and performance → **Diagnostics** | 🟡 **Sí** | No | Service provider (Vercel) | Obligatorio | Analytics |
| Web Analytics | App activity → **App interactions** | 🟡 **Sí** | No | Service provider (Vercel) | Obligatorio | Analytics |
| **Geolocalización de Analytics** | Location → **Approximate location** | 🔵 **DECISIÓN** — ver 2.b | No | Service provider | Obligatorio | Analytics |
| **Avatar** (semilla persistida en `profiles`) | Personal info → **User IDs** ⚠️ ver 2.f | Sí | **Sí, a DiceBear** | **Ninguna excepción aplicable** mientras el navegador contacte a DiceBear | Opcional | App functionality |
| **Pósters de TMDB** (`image.tmdb.org`) | ⚠️ ver 2.g | ⚠️ ver 2.g | ⚠️ ver 2.g | 🔍 **VERIFICACIÓN PENDIENTE** | Obligatorio | App functionality |
| **Tráilers de YouTube** (`youtube-nocookie.com`) | ⚠️ ver 2.g | ⚠️ ver 2.g | ⚠️ ver 2.g | 🔍 **VERIFICACIÓN PENDIENTE** | Opcional (solo al reproducir) | App functionality |
| Google Calendar | Calendar → **Calendar events** | **No** | **No** | **User-initiated transfer**: lo abre la persona, con divulgación previa | — | — |
| Advertising ID | Device or other IDs | **No** — no se usa | No | — | — | — |

### 2.b 🔵 DECISIÓN — Vercel Analytics y Speed Insights

⚠️ **CORREGIDO.** La versión anterior recomendaba **no** declarar "Approximate
location" sin demostrarlo. No corresponde. La demostración, en orden:

**El hecho.** Los datos de Vercel Web Analytics incluyen `Geolocation` con el
ejemplo *"US, California, San Francisco"* — nivel ciudad. Speed Insights guarda
`Country`.

**La definición de Google.** *"Approximate location: User or device physical
location to an area greater than or equal to 3 square kilometers, **such as the
city a user is in**"*. **Ciudad es exactamente el ejemplo de la definición.**

**La definición de "collection".** *"Transmitting data from your app off a user's
device"*, incluidos SDKs de terceros. El SDK de Analytics **está en nuestro
`app/layout.tsx`** y transmite en cada carga. Que la ciudad la derive Vercel de
la IP del lado del servidor no cambia que la transmisión la origina nuestra app.

**La única excepción que podría aplicar** es *"Fully anonymized data that cannot
be associated with individuals"*. Vercel dice que *"no personal identifiers that
track and cross-check end users' data across different applications or websites
are collected"* y que por defecto solo se usan datos agregados. **Pero el
almacenamiento por evento incluye ciudad + SO + navegador + referrer**, y si eso
alcanza el estándar de "fully anonymized" de Google es un juicio que Google no
resuelve por escrito.

**Las dos opciones, comparadas:**

| | **A. Mantener Analytics y declarar** | **B. Retirar o limitar Analytics** |
|---|---|---|
| Declaración | `Approximate location`, `Diagnostics`, `App interactions` — todas "recogidas", finalidad Analytics, no compartidas (service provider) | nada que declarar por este concepto |
| Superficie de datos | **mayor**: se sigue transmitiendo geolocalización a nivel ciudad, y la ficha lo muestra | **menor**: deja de transmitirse |
| Qué se pierde | nada | la medición de uso real y de Web Vitals |
| Trabajo | rellenar tres filas más | sacar dos componentes de `layout.tsx` |
| Opción intermedia | `beforeSend` para redactar rutas sensibles ([redacting sensitive data](https://vercel.com/docs/analytics/redacting-sensitive-data)) — **no** elimina la geolocalización | — |

⚠️ **CORREGIDO.** La versión anterior decía "declarar de más nunca hizo rechazar
una app" y "riesgo de rechazo nulo". **Se retiran las dos.** Nadie puede
garantizar el resultado de una revisión, y lo que Google sí escribe es la
obligación: *"You alone are responsible for making complete and accurate
declarations in your app's store listing on Google Play"*, y ante una
discrepancia entre el comportamiento real y lo declarado *"we may take
appropriate action, including enforcement action"*.

Las dos opciones son, entonces, **mayor o menor superficie de datos**, no "más
riesgoso o menos riesgoso de aprobar":

- **A** mantiene la funcionalidad y obliga a declarar tres categorías más, una de
  ellas visible en la ficha.
- **B** reduce lo que se transmite, y con eso lo que hay que declarar y lo que
  hay que sostener como exacto.

🟡 **RECOMENDACIÓN CONSERVADORA**: si Analytics se mantiene, declarar las tres
**incluida `Approximate location`**, porque el criterio que sí es verificable es
la exactitud del formulario, y la definición de Google usa "ciudad" como ejemplo
literal. La opción intermedia no sirve acá: `beforeSend` toca la URL, no la
geolocalización.

🔵 **La decisión es tuya**, y es una decisión de producto antes que de trámite:
¿vale la medición de uso lo que cuesta declarar ubicación aproximada en la ficha?

### 2.c ⚠️ CORREGIDO — La contraseña: el recorrido real

La versión anterior decía que la contraseña "se guarda con hash, nunca en claro".
**Eso es cierto para el almacenamiento y falso como descripción del recorrido.**
Hay un tramo donde la contraseña en claro pasa por NUESTRO servidor.

**El recorrido completo, ✅ verificado en el código:**

| Momento | Quién la recibe | Qué pasa con ella |
|---|---|---|
| **Registro** | el navegador → **Supabase Auth** directo (`supabaseBrowser().auth.signUp`) | Supabase la guarda con hash. **No pasa por nuestro servidor** |
| **Login** | el navegador → **Supabase Auth** directo (`signInWithPassword`) | ídem |
| **Cambio / recuperación** | el navegador → **Supabase Auth** directo | ídem |
| **Baja de cuenta** | el navegador → **`/api/cuenta/eliminar`**, o sea **nuestro servidor en Vercel** | 👈 **acá está la diferencia** |

En la baja, `route.ts` lee `cuerpo.password` y se lo pasa a `eliminarCuenta()`,
que crea un cliente aislado de Supabase y llama a `signInWithPassword(email,
password)` para reautenticar. O sea: **la contraseña viaja en claro dentro del
HTTPS hasta nuestra función, se usa en memoria y se descarta.**

✅ **Lo que sí es cierto y está verificado**: no se persiste y no se registra —
el comentario del archivo lo dice y el código lo cumple (*"NADA de esta función
registra el cuerpo, la contraseña, el token ni el email"*), y los errores se
devuelven como códigos propios y no como el mensaje de Supabase, que puede
incluir el email.

**Clasificación**: **procesamiento efímero**. Se accede en memoria y se retiene
sólo lo necesario para atender la petición.

⚠️ **Y acá va la corrección más importante de esta versión**, que afecta también
a las señales de personalización: **procesamiento efímero NO significa "no se
declara"**. Google es explícito:

> *"User data transmitted off device that is processed ephemerally **needs to be
> included in your form response**, but if it meets the standard below, it will
> not be disclosed in your app's Data safety section on Google Play."*

Es decir: **se responde en el formulario y se marca como efímero**; lo que no
ocurre es que aparezca en la ficha pública. La versión anterior lo trataba como
una exención de declarar. Era un error.

**Cómo responder en Data Safety:**

1. Declarar el dato, con el tipo que corresponda.
2. Responder **"sí"** a *"Is this data processed ephemerally?"*.
3. Finalidad: `Account management`.
4. No compartido: el destino es **Supabase, service provider**.

🔵 **Lo que sigue siendo decisión tuya**: **con qué tipo**. La lista de Play no
tiene "password"; lo más cercano es `Personal info → Other info`. No encontré
fuente oficial que resuelva si una credencial de autenticación debe declararse
como tipo propio, y no voy a inventar una. 🟡 Declararla como `Other info` con la
marca de efímero es la lectura prudente, y no aparece en la ficha pública.

### 2.d ⚠️ Votos: cambié la clasificación

En la versión anterior los puse como `Other user-generated content`. **Con la
definición oficial a la vista, no encaja**: ese tipo habla de *"user bios, notes,
or open-ended responses"*. Un voto de 1 a 3 es una acción, no contenido — y la
definición de `Other actions` menciona **literalmente "likes"**.

🟡 Declararlos como `App activity → Other actions`. 🔵 Si preferís la lectura
prudente (porque alimentan un agregado público), `Other user-generated content`
también es defendible.

### 2.e 🔵 DECISIÓN — "Contains ads"

El player de YouTube **puede** mostrar publicidad. La declaración cubre *"ads
delivered through third-party ad SDKs, display ads, native ads, and/or banner
ads"* ([Ads — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9857753)).
No hay SDK de anuncios ni monetizamos con eso, pero la persona puede ver un
anuncio dentro de la app.

🟡 Declarar **sí**: *"If you misrepresent the presence of ads in your app(s),
it's considered a violation … and may result in your app(s) being suspended"*.
El costo de declararlo es una etiqueta "Contiene anuncios" en la ficha.

### 2.f ⚠️ CORREGIDO — El avatar, y por qué cambiar la semilla NO alcanza

La versión anterior decía que bastaba con que la semilla dejara de ser el
`user.id`, y que eso era "una línea de código". **Las dos cosas están mal.**

**Por qué no alcanza.** La semilla se **persiste en `profiles.avatar_seed`** y se
reutiliza en **todas** las peticiones de esa persona, en todos sus dispositivos y
sesiones. Sea `user.id` o un `gen_random_uuid()`, es **un valor estable, único y
vinculado internamente a una cuenta**: DiceBear recibe siempre el mismo string
junto con la IP, y puede correlacionar peticiones a lo largo del tiempo. Que
nosotros no le contemos a qué cuenta corresponde no lo vuelve anónimo — lo vuelve
**seudónimo**.

Y la definición de Google no habla de nombres, habla de vínculo:

> **User IDs**: *"Identifiers that relate to an identifiable person. For example,
> an **account ID**, account number, or account name."*

`avatar_seed` es literalmente un id de cuenta: vive en la fila de la cuenta, es
uno por cuenta y muere con ella. **Un identificador seudónimo se declara.**

**La otra parte que estaba mal**: aunque la semilla fuera aleatoria por
dispositivo, **la transferencia a DiceBear seguiría existiendo** — IP,
user-agent y el recurso pedido. Cambiar la semilla no elimina la transferencia,
sólo la hace menos correlacionable.

**Las cuatro soluciones, comparadas:**

| | **A. Generación local con la librería** | **B. Set propio de avatares** | **C. Proxy + almacenamiento en Yump** | **D. Seguir como está y declararlo** |
|---|---|---|---|---|
| ¿El navegador contacta a DiceBear? | **No** | **No** | **No** | **Sí** |
| ¿Hay que declarar transferencia a un tercero? | No | No | No | **Sí** |
| Cómo | `@dicebear/core` + `@dicebear/styles`, render del SVG en servidor o cliente. ✅ *"avatars are generated entirely on your infrastructure. No personal data ever leaves your systems"* | ilustrar o comprar N avatares y que la persona elija uno | pedirlos una vez desde nuestro servidor, guardarlos y servirlos desde nuestro dominio | nada |
| Atribución CC BY 4.0 | **se conserva**: la licencia es del estilo, no del transporte | depende de la fuente de los assets | **se conserva** | se conserva |
| Trabajo | dos dependencias, un helper y ajustar el `<img>` a un SVG inline o a una ruta propia | diseño de N avatares | una ruta, almacenamiento y política de caché | ninguno |
| Efecto secundario | el SVG viaja en el HTML o se sirve local; **el service worker deja de cachear un dominio externo** | se pierde la variedad infinita | sumamos almacenamiento de imágenes, que hoy no tenemos | queda una fila de "sharing" en la matriz |
| Riesgo | bajo | bajo | medio: hay que decidir dónde se guardan y cuánto viven | — |

🟡 **RECOMENDACIÓN: opción A — generación local con `@dicebear/core` +
`@dicebear/styles`.** Es la única que **elimina de verdad la transferencia** sin
resignar la variedad ni rediseñar la funcionalidad, y la documentación oficial lo
afirma explícitamente. La opción C también la elimina, pero nos deja
almacenamiento de imágenes que hoy el proyecto no tiene y una política de purga
que mantener.

**La atribución CC BY 4.0 se conserva igual.** La licencia recae sobre el
**estilo** (`adventurer-neutral`, de Lisa Wischofsky), no sobre cómo se
transporta. Generarlo localmente no cambia nada: el crédito va en `/acerca-de`.

🔍 **VERIFICAR antes de implementar**: la licencia de la **librería** en sí
(`@dicebear/core`) no está declarada en la página de la documentación que
consulté; hay que leerla en el paquete publicado. Y hay que confirmar el nombre
exacto del paquete de estilos, porque la documentación menciona
`@dicebear/styles` mientras que versiones anteriores usaban `@dicebear/collection`.

🔵 **DECISIÓN tuya**: A, B, C o D. **Mientras no se decida, la fila del avatar
queda en la matriz como transferencia a un tercero sin excepción aplicable**, y
hay que declararla.

### 2.g ⚠️ CORREGIDO — Los tres dominios que contacta el navegador

La versión anterior despachaba TMDB y YouTube con "no transmitimos datos de
usuario". **Es una respuesta incompleta**: el navegador les abre una conexión y
eso transmite datos, los pongamos nosotros o no.

**Qué se transmite, en los tres casos:**

| | `image.tmdb.org` | `youtube-nocookie.com` | `api.dicebear.com` |
|---|---|---|---|
| IP del dispositivo | sí | sí | sí |
| User-agent | sí | sí | sí |
| Recurso pedido | **qué póster** = qué título estás mirando | **qué tráiler** reproducís | **la semilla** del avatar |
| Referrer | según la política del documento | sí (el player lo usa) | según la política |
| Cookies del tercero | no las pone TMDB | el modo privacidad **no** las elimina, evita la personalización | no |
| Correlación entre sesiones | por IP | por IP y por lo que Google ya tenga de esa persona | **por la semilla**: es estable |
| ¿Iniciado por la persona? | **no**: se carga con la pantalla | **sí**: hay que tocar reproducir | **no**: se carga con la pantalla |
| ¿Es proveedor de servicio nuestro? | **no**: es una CDN pública, no procesa por cuenta nuestra ni bajo nuestras instrucciones | **no** | **no** |

**Cómo encaja —o no— en un tipo del formulario:**

- **El patrón de navegación implícito** (qué pósters se piden) no tiene un tipo
  obvio. `Web browsing history` se refiere a historial de navegación web, no a
  qué recursos carga una app. **No hay un tipo que calce**, y ése es justamente
  el problema.
- **La IP no es un tipo declarable** por sí sola en la lista de Play.
- **La semilla del avatar sí calza**: `User IDs`. Es la única de las tres con un
  tipo claro, y por eso es la única que puse en la matriz con su fila.

**Qué excepción podría aplicar:**

- **YouTube**: *"User-initiated transfers"*, porque la conexión sólo ocurre si la
  persona toca reproducir — pero la excepción exige *"prominent disclosure and
  user consent"*, y **hoy la app no muestra ninguna divulgación antes de cargar
  el player**. 🟡 Si se quiere apoyar en esa excepción, hay que agregar el aviso.
- **TMDB**: no encuentro excepción aplicable. No es proveedor de servicio, no es
  iniciado por el usuario y no está anonimizado.
- **DiceBear**: ninguna, ver 2.f.

🔍 **VERIFICACIÓN PENDIENTE, y la dejo abierta a propósito.** No encontré
documentación oficial de Google que resuelva si **cargar un recurso estático
desde un dominio de terceros** cuenta como "collection" o "sharing" a los efectos
del formulario. La definición de *collection* —*"Transmitting data from your app
off a user's device"*— **es lo bastante amplia como para incluirlo**, y la de
*sharing* —*"Transferring user data collected from your app to a third party"*—
depende de si la IP y el recurso pedido cuentan como "user data collected from
your app". Google no lo aclara para este caso.

**No lo resuelvo por mi cuenta.** 🟡 Lo que sí recomiendo, porque reduce el
problema en vez de discutirlo:

1. **DiceBear**: eliminar la transferencia (§2.f, opción A). Es la única de las
   tres que podemos sacar sin perder nada.
2. **YouTube**: agregar una divulgación previa al player, que además es lo que
   pide la excepción de transferencia iniciada por el usuario.
3. **TMDB**: no es eliminable sin proxear todas las imágenes, que es un costo de
   infraestructura real. **Declararlo en `/privacidad`** con todas las letras y
   dejar la fila del formulario como pendiente hasta consultarlo.

---

## 3. Eliminación de cuenta

### 3.a El flujo actual, ✅ verificado en el código

```
POST /api/cuenta/eliminar   (Authorization: Bearer <token>)
  ├─ sesionDeToken(token)                       → 401 sin-sesion
  ├─ bloqueado(...)                             → 429 tras 5 fallos / 15 min
  ├─ body: { password }                         (ni id ni email: salen del token)
  └─ eliminarCuenta()
       ├─ hayAdmin()                            → 503 antes de tocar la contraseña
       ├─ contrasenaValida(email, pass)         cliente aislado, signOut() después
       └─ admin.auth.admin.deleteUser(id, false)  ← shouldSoftDelete FALSE, explícito
```

Lo que ya está bien y no hay que tocar: `shouldSoftDelete: false` escrito a mano
(un soft delete no dispara los CASCADE); no hay oráculo de contraseña (se
pregunta por la credencial administrativa *antes* de validar); nada se registra.

### 3.b ¿Solicitud o borrado inmediato?

**Nuestro borrado inmediato supera el requisito.** Google pide *"a web link
resource where users can request app account deletion"* y acepta explícitamente
flujos de solicitud. Ejecutarlo en el momento es el extremo cumplidor.

**Exige las DOS cosas**: *"an in-app path to delete their app accounts and
associated data; **and** a web link resource"*
([Data deletion](https://support.google.com/googleplay/android-developer/answer/13327111)).
El in-app existe; falta el web.

### 3.c Qué significa exactamente "público"

⚠️ **Aclaración pedida y necesaria.** "Público" quiere decir:

- ✅ **La URL responde 200 sin sesión previa y sin la app instalada.** Nada de
  redirigir a login, nada de 401, nada de gate.
- ✅ **Puede montar una interfaz de cliente** que pida iniciar sesión y confirmar.
  Google no exige que el borrado ocurra sin autenticarse — sería absurdo.
  Exige que **el camino** sea alcanzable y esté "prominently featured and easily
  discoverable on the page".
- ✅ El contenido informativo (qué se borra, qué se conserva, quién es Yump,
  contacto) **debe leerse sin iniciar sesión**.

### 3.d ✅ CONFIRMADO — `OnboardingGate` bloquea las cuatro rutas

`components/onboarding/OnboardingGate.tsx` está montado en `app/layout.tsx`, o
sea en **todas** las rutas:

```tsx
if (pathname === "/cuenta/reset") return;               // única exención
if (!profile.onboarding_completed && pathname !== "/onboarding") {
  router.replace("/onboarding");
}
```

**Consecuencia concreta**: alguien con sesión que nunca terminó el onboarding
entra a `/eliminar-cuenta`, se autentica… y **el gate lo patea a `/onboarding`**.
Es exactamente la persona con más motivos para querer borrar la cuenta. Lo mismo
con `/privacidad`, `/terminos` y `/acerca-de`.

**El arreglo**: una lista de rutas exentas en vez de la comparación suelta con
`/cuenta/reset`. Las cuatro nuevas más `/cuenta/reset`. Va en la primera tanda y
**necesita un test**, porque es una regresión invisible: no falla, redirige.

### 3.e Diseño de `/eliminar-cuenta`

```
┌─ Encabezado (legible SIN sesión) ────────────────────────┐
│ Logo Yump + el nombre EXACTO de la ficha de Play         │
├─ Qué hace esta página ───────────────────────────────────┤
│ Borra tu cuenta de Yump y lo asociado, ya y sin vuelta.   │
├─ Paso 1: iniciar sesión (interfaz cliente) ──────────────┤
│ email + contraseña → el mismo signInWithPassword de la app│
│ UN SOLO mensaje de error para todos los casos             │
├─ Paso 2: confirmar ──────────────────────────────────────┤
│ reusa <EliminarCuenta/> → POST a la ruta existente        │
├─ Qué se elimina (legible sin sesión) ────────────────────┤
│ cuenta y email · nombre y avatar · país y plataformas del │
│ perfil · votos · Mi lista · Ya la vi · descartes ·        │
│ historial · sesiones abiertas                             │
├─ Qué NO se elimina, y por qué ───────────────────────────┤
│ · preferencias del dispositivo, para seguir como invitada │
│ · logs técnicos de Vercel  🔍 plazo por verificar         │
│ · copias de seguridad de la base  🔍 plazo por verificar  │
├─ Contacto + enlace a /privacidad ────────────────────────┤
└──────────────────────────────────────────────────────────┘
```

**No revelar si un email existe**: ✅ `signInWithPassword` de Supabase ya devuelve
el mismo error para email inexistente y contraseña incorrecta. **La enumeración
se escaparía por la interfaz**: un solo texto ("Email o contraseña incorrectos")
y **cuidado con "¿olvidaste tu contraseña?"** si diera feedback distinto.

**No duplica lógica sensible**: la página es una cáscara. Login con el cliente
que ya existe, `POST` al endpoint que ya existe. Cero reglas de borrado nuevas,
cero service role en el cliente.

---

## 4. Privacidad, términos y contacto

### 4.a Estructura de `/privacidad`

1. Responsable y contacto 🔵
2. **Qué se recoge, en los cuatro niveles de §1** — es la parte que la versión
   anterior tenía mal y ahora es el esqueleto del documento
3. Qué se queda solo en el dispositivo (Nivel A)
4. **Qué se transmite aunque no tengas cuenta** (Nivel B) — plataformas,
   búsquedas, filtros
5. Qué se guarda si creás una cuenta (Nivel C)
6. Logs operativos (Nivel D) 🔍
7. Terceros: **proveedores de servicio** (Vercel, Supabase, Upstash) vs
   **terceros que contacta tu navegador** (TMDB, YouTube, DiceBear)
8. Retención 🔍
9. Cómo borrar la cuenta → `/eliminar-cuenta`
10. Derechos 🔵 (depende de jurisdicción)
11. Menores 🔵
12. Cookies: qué hay y por qué no hay banner
13. Cambios y fecha

### 4.b Estructura de `/terminos`

1. Qué es Yump y qué **no** es: agregador de información, **no** un servicio de
   streaming; no reproduce contenido ni vende suscripciones
2. Elegibilidad y edad mínima 🔵
3. Cuenta y baja
4. Uso aceptable
5. Contenido de terceros: catálogo TMDB, tráilers YouTube
6. **Marcas de terceros y no afiliación** — §6
7. Sin garantías sobre disponibilidad ni exactitud (los datos son de TMDB)
8. Limitación de responsabilidad
9. Cambios en el servicio
10. Ley aplicable y jurisdicción 🔵
11. Contacto

### 4.c 🔵 DECISIONES que necesito

| # | Decisión | Por qué bloquea |
|---|---|---|
| 1 | Nombre del responsable (persona, nombre público o sociedad) | Va en las cuatro páginas, en la ficha y en el aviso de no afiliación |
| 2 | Email de soporte y de privacidad (puede ser el mismo) | Play exige email de soporte; la política necesita contacto |
| 3 | Domicilio o jurisdicción | Ley aplicable. ¿Argentina? |
| 4 | ¿Habrá monetización, publicidad o suscripciones? | Decide si hace falta acuerdo comercial con TMDB (§5) |
| 5 | Períodos de retención | Depende de las verificaciones 🔍 de §7.c |
| 6 | Edad mínima y público objetivo | Define Target Audience y si aplica Families Policy |
| 7 | Tipo de cuenta de Play y fecha de creación | Decide si aplica la prueba cerrada |
| 8 | Dominio definitivo de la ficha | Hoy `app.yump.ar`. Los enlaces tienen que ser estables |
| 9 | ¿Se saca la cookie `sc_platforms`? | Minimización gratis |
| 10 | ¿TWA o nativo? | Define el trabajo de la segunda tanda |

---

## 5. TMDB

⚠️ **CORREGIDO.** La versión anterior daba a entender que mostrar pósters "está
cubierto por los términos de TMDB". **Eso es más de lo que los términos dicen**, y
más de lo que TMDB puede conceder. Van separados.

### 5.a Atribución y condiciones de uso de la API — ✅ CONFIRMADO

De los [API Terms of Use](https://www.themoviedb.org/api-terms-of-use):

- **Texto obligatorio, verbatim**: *"This [website, program, service,
  application, product] uses TMDB and the TMDB APIs but is not endorsed,
  certified, or otherwise approved by TMDB."*
- **Prominencia**: el logo de TMDB debe ser *"less prominent than the logos or
  marks that primarily describe or identify Your Application"*.
- **Colocación**: *"prominently in or on Your Application"*.
- **Uso comercial**: requiere acuerdo escrito aparte.
- **Cache**: prohibido *"Cache, for longer than 6 months, any information
  obtained through or from TMDB or the TMDB APIs"*. ⚠️ **Ver §5.f: los 30 h de
  Redis NO alcanzan para afirmar que el proyecto cumple.**

**Corrección al texto que me pasaste**: citaste la forma corta ("This product
uses the TMDB API but is not endorsed or certified by TMDB"). La vigente en los
términos es **la larga**. 🟡 Usar la larga: cumple las dos lecturas.

Assets oficiales en SVG y colores de marca (`#0d253f`, `#01b4e4`, `#90cea1`) en
[Logos & Attribution](https://www.themoviedb.org/about/logos-attribution).
🟡 Descargar y servir local, para no depender de un host externo en el CSP.

### 5.b Derechos sobre las imágenes — ⚠️ CORREGIDO

**Que la API entregue una imagen no demuestra que TMDB tenga —ni pueda
sublicenciar— todos los derechos sobre ella.** Los pósters, backdrops y fotos son
material promocional cuyos derechos son de los estudios, distribuidoras y
fotógrafos. TMDB es un catálogo colaborativo alimentado por su comunidad.

Lo que se puede afirmar:
- ✅ Los términos regulan el uso de **la API** y del contenido que entrega.
- ✅ TMDB exige atribución y limita el uso comercial.
- ❌ **No se puede afirmar que TMDB otorgue una licencia sobre las imágenes de
  terceros.** No lo dice, y no está en posición de decirlo.

🟡 Mostrar pósters **dentro de la app**, en el contexto de identificar un título,
es el uso habitual de un agregador y el riesgo práctico es bajo. Pero es un
riesgo asumido, no una autorización. 🔍 Si querés certeza, es una consulta legal,
no algo que resuelva este documento.

### 5.c Riesgo adicional: pósters en las capturas de Play — ⚠️ NUEVO

**Las capturas de la ficha son material de marketing**, no uso interno de la app.
Ahí la exposición es mayor: se están usando imágenes de terceros para promocionar
un producto propio en una tienda.

🟡 **Recomendación:**
- Capturas donde los pósters aparezcan **como parte de la interfaz**, a tamaño de
  card, nunca un póster a pantalla completa ni como arte de fondo.
- **Ícono y gráfico destacado 100% Yump**, sin una sola imagen ni marca ajena.
- 🔵 Evaluar capturas con placeholders propios en lugar de pósters reales. Se
  pierde realismo; se elimina el riesgo.

### 5.d Antes de monetizar

Cualquier ingreso —publicidad, suscripción, afiliados— **exige acuerdo comercial
escrito con TMDB antes de activarlo**. Si la decisión #4 es "sí", ese contacto va
primero en el orden de trabajo.

### 5.f ⚠️ NUEVO — Auditoría de persistencia: dónde más vive contenido de TMDB

La versión anterior cerraba el tema del límite de 6 meses con *"nuestro TTL más
largo es `pool: 30 h`"*. **Eso sólo habla de Redis.** El proyecto guarda
contenido de TMDB en al menos tres lugares más, y uno de ellos no tiene ningún
mecanismo que impida superar los seis meses.

**No se borró nada.** Esto es un inventario.

#### Familia 1 — Cache de Upstash Redis ✅ CUMPLE

| Claves | TTL máximo |
|---|---|
| `card:`, `pv:`, `videos:`, `home:`, `genre:covers:`, `people:`, `blocklist:` | `pool: 30 h`, y es el más largo de toda la tabla `TTL` |

Nada puede sobrevivir más de 30 horas. ✅ Cumple con enorme margen.

#### Familia 2 — Tablas de Supabase ⚠️ REQUIEREN POLÍTICA

| Tabla | Campos de TMDB | ¿Se refresca? | ¿Se borra? | Estado |
|---|---|---|---|---|
| **`upcoming_content`** (42 filas) | `title`, `original_title`, `overview`, `poster_path`, `backdrop_path`, `release_date`, `episode_name`, `genre_ids`, `popularity`, `vote_average`, `status`, `tv_status` | **sólo si el sync la redescubre** | sólo si pierde todos sus providers AR (`aBorrar`) | ⚠️ **RIESGO REAL** |
| **`providers`** (58 filas) | `name`, `logo_path`, `display_priority` | upsert del sync | nunca | ⚠️ **queda indefinidamente** |
| **`roulette_titles`** (2401 filas) | `title`, `year`, `runtime`, `genres`, `edad`, `vote_count`, `vote_average` | **no**: pool curado offline, escrito una vez | nunca | ⚠️ **queda indefinidamente** |
| **`title_availability`** | `providers[]`, `rent_only`, `checked_at` | sólo al re-correr el pipeline | nunca | ⚠️ **queda indefinidamente** |
| **`chip_titles`** | `title`, `year` | no | nunca | ⚠️ **queda indefinidamente** |
| **`netflix_top10`** (60 filas) | `tmdb_id` — sólo el id, más `raw_title` **que viene del TSV de Netflix, no de TMDB** | semanal | nunca | 🟡 un id no es "información obtenida de TMDB" en el sentido del texto, pero conviene decidirlo |

**El caso más claro es `upcoming_content`**, y **ya está documentado como bug
independiente**: el **issue #7** dice que *"una fila deja de refrescarse y queda
con datos equivocados, no solo vencidos"*, porque *"el sync solo escribe lo que
descubre, y el descubrimiento no garantiza volver a pasar por un título que ya
está en la tabla"*.

✅ **Medido hoy contra la base**: la fila menos refrescada tiene `created_at`
**2026-07-31** y `updated_at` **2026-08-08** — 17 días sin tocarse. Y ✅
verificado: **no hay ninguna consulta que borre filas por antigüedad ni por fecha
de estreno pasada**. Una fila que el sync no vuelva a descubrir **no tiene hoy
ningún camino que la elimine ni que la refresque**.

La tabla tiene menos de dos meses de vida, así que **hoy nada supera los seis
meses**. Pero **no existe el mecanismo que lo impida**, y eso es lo que hay que
registrar antes de afirmar cumplimiento.

#### Familia 3 — Archivos versionados en git ⚠️ PERMANENTES POR DEFINICIÓN

Un archivo commiteado no "expira": vive en el historial para siempre, incluso si
se borra del árbol de trabajo.

| Archivo | Contenido de TMDB | Desde |
|---|---|---|
| `data/clasificado-magica-navidad.json` | `title`, `original_title`, `year`, **`overview`** de 260 títulos | 2026-08-08 |
| `data/contexto-ruleta.json` | `title`, `year`, saga, de 461 títulos | 2026-08-11 |
| `data/copy-ruleta.json` | 2401 filas del pool | 2026-08-11 |
| `docs/medidas/2026-08-23-idioma-ruleta.json` | 550 campos `title`/`name`/`overview`, 331 KB | 2026-08-23 |
| `docs/medidas/snapshot-upcoming-*.json` (4) | 224-236 campos cada uno, con `title`, `overview` y `episode_name` | 2026-08-24 |
| `docs/medidas/foto-upcoming-*.json` (5) | 88-90 campos cada uno, fotos completas de la tabla | 2026-08-24 |
| resto de `docs/medidas/` | 36 archivos, 1,5 MB en total | desde 2026-08-15 |

**El más viejo es del 2026-08-08**, o sea que **el primero cumpliría seis meses
alrededor del 8 de febrero de 2027**. Hay tiempo, pero la fecha existe.

#### Qué hay que decidir 🔵

| # | Familia | Opciones |
|---|---|---|
| 1 | `upcoming_content` | (a) arreglar el issue #7 con una pasada de refresco —que resuelve el bug **y** el cumplimiento de una vez—; (b) purgar filas con `updated_at` más viejo que N; (c) las dos |
| 2 | `roulette_titles`, `chip_titles`, `title_availability` | ¿se re-corre el pipeline periódicamente, o se acepta que el snapshot de TMDB envejezca? Ojo: **el texto editorial de la ruleta es propio y no es de TMDB**; lo que cae bajo la regla son `title`, `year`, `genres`, `vote_*` |
| 3 | `providers` | refrescar en cada corrida del sync, que ya lo hace por upsert — 🔍 verificar que el upsert corra siempre y no sólo al descubrir |
| 4 | Archivos versionados | (a) política de purga con calendario; (b) reducir los snapshots a lo mínimo (ids y hashes en vez de textos); (c) evaluar si un archivo de auditoría interno cae bajo "cache" |

🟡 **RECOMENDACIÓN**: arrancar por la #1, porque el issue #7 ya está abierto por
otro motivo y **un solo arreglo cierra las dos cosas**. Y para la #4, la salida
más limpia hacia adelante es que los snapshots nuevos guarden **ids y hashes**
en lugar de títulos y sinopsis: sirven igual para comparar corridas y dejan de
acumular contenido ajeno.

🔍 **VERIFICACIÓN PENDIENTE**: si un archivo de medición interno, no distribuido
y usado para auditar el propio sistema, cuenta como "cache" a los efectos de esa
cláusula. **No lo resuelve el texto de los términos**, y no lo voy a decidir yo.

**Conclusión de esta sección**: ⚠️ **retiro la afirmación de cumplimiento.** Lo
correcto hoy es: *Redis cumple con margen; el resto del proyecto no tiene un
mecanismo que garantice el límite, aunque nada lo haya superado todavía.*

### 5.e Dónde mencionar TMDB

- `/acerca-de`: sí — logo + texto + enlace. Es el lugar principal.
- `/privacidad`: sí, por otro motivo: `image.tmdb.org` recibe la IP.
- `/terminos`: sí, en contenido de terceros.
- Ficha de Play: no es obligatorio; 🟡 una línea ayuda a que el revisor entienda
  de dónde sale el contenido y refuerza que no somos un servicio de streaming.

---

## 6. Nombres de plataformas y propiedad intelectual

### 6.a Dónde aparecen hoy — ✅ CONFIRMADO

`PlatformLogo.tsx` (15 wordmarks) + `.lg-*` en `globals.css`; usados en cards,
ficha, header, selector, onboarding y como **título de cada bloque en `/top`**.
Además `providers.logo_path` guardado en la base para Próximamente.

### 6.b El problema, con la evidencia

Lo que hay **no** son los logos oficiales, y **tampoco** nombres neutros: son
reproducciones a mano de la identidad visual.

```css
.lg-n{color:#E50914;font-weight:800;letter-spacing:-.04em}   /* el rojo Netflix */
.lg-m{color:#0E2FD6;font-weight:800;letter-spacing:-.06em}   /* el azul Max */
.lg-cr{color:#F47521;font-weight:800}                        /* el naranja Crunchyroll */
```
```jsx
p: <span className="lg lg-p"><svg…><path d="M1 7c6 4 14 4 20 0" stroke="#00A8E1"/></svg>prime video</span>
```

Ese `path` es el swoosh de Prime Video dibujado a mano. El propio comentario del
archivo dice *"Wordmarks provisionales"*.

### 6.c Las alternativas — ⚠️ CORREGIDO en su formulación

| | **A. Nombres neutros en texto** | **B. Logos oficiales sin modificar** | **C. Lo actual** |
|---|---|---|---|
| Qué es | el nombre, en la tipografía y el color de texto de Yump | el asset oficial de cada marca | imitación del color, la tipografía y el símbolo |
| Necesita permiso | **no necesariamente, pero no está garantizado que nunca haga falta** | sí: guías de marca o licencia de cada una | sí, y es el caso más expuesto |
| `logo_path` de TMDB | — | **no alcanza**: TMDB entrega el archivo, no puede licenciar marcas ajenas | — |
| Riesgo de confusión | **el más bajo** | medio | **el más alto** |
| Riesgo en revisión de Play | bajo | medio (suplantación) | medio-alto |
| Trabajo | borrar 15 reglas CSS | conseguir y mantener 15 assets | — |

⚠️ **La corrección que pediste, y es importante**: en la versión anterior escribí
que los nombres neutros se apoyan en "uso nominativo" como si eso cerrara el
tema. **No lo cierra.** Usar el nombre de una marca para referirse al servicio
que designa es la práctica común de los agregadores y **reduce mucho** el riesgo
de confusión, pero:

- **No es una autorización.** Que el riesgo sea bajo no significa que sea cero.
- **El disclaimer no reemplaza una licencia.** Un aviso de no afiliación ayuda a
  descartar la confusión; no concede ningún derecho.
- El alcance del uso nominativo **varía por jurisdicción** y no lo resuelve un
  documento técnico.

### 6.d 🟡 RECOMENDACIÓN CONSERVADORA

1. **Sacar la imitación.** Nombres en la tipografía de Yump y en el color de
   texto de la app, conservando el nombre y su capitalización exactos ("Netflix",
   "Disney+", "Max", "Prime Video", "Apple TV+", "Crunchyroll").
2. **Conservar una señal visual PROPIA** —una pastilla o un punto de la paleta de
   Yump, no de la marca— para no perder el reconocimiento en las cards.
3. **Aviso de no afiliación** en `/acerca-de`, `/terminos` y una línea en la
   descripción de Play:

   > Yump es un agregador independiente. Netflix, Disney+, Max, Prime Video,
   > Apple TV+, Crunchyroll y las demás plataformas mencionadas son marcas de sus
   > respectivos titulares. Yump no está afiliado, asociado, autorizado ni
   > patrocinado por ninguna de ellas, y no ofrece ni reproduce sus contenidos.

4. Revisar si `/proximamente` renderiza `logo_path` y alinearlo.

**Qué puede pedir Google**: si detecta marcas de terceros en ícono, título,
gráfico destacado o capturas, puede pedir documentación de autorización. Con la
alternativa A y el aviso, esa pregunta es mucho menos probable — 🟡 no imposible.

---

## 7. Requisitos, decisiones y verificaciones

### 7.a ✅ Requisitos confirmados de Play

| # | Ítem | Estado | Fuente |
|---|---|---|---|
| 1 | **Target API 36**, nuevas apps y updates, **31/08/2026** (prórroga hasta 01/11) | ❌ no hay build | [Target API](https://developer.android.com/google/play/requirements/target-sdk) |
| 2 | AAB firmado + Play App Signing | ❌ | — |
| 3 | `assetlinks.json` en `/.well-known/` | ❌ imprescindible para TWA | — |
| 4 | Política de privacidad con URL pública | ❌ | — |
| 5 | Data Safety | ⚠️ matriz en §2 | [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) |
| 6 | Borrado: in-app **y** enlace web | ⚠️ in-app ✅, web ❌ | [Data deletion](https://support.google.com/googleplay/android-developer/answer/13327111) |
| 7 | Acceso del revisor + cuenta de prueba | ⚠️ el login es email+contraseña sin 2FA: alcanza con crear una | — |
| 8 | Clasificación de contenido (IARC) | ⚠️ pendiente | — |
| 9 | Target audience & content | ⚠️ depende de la decisión 6 | [Target audience](https://support.google.com/googleplay/android-developer/answer/9867159) |
| 10 | Declaración de anuncios | ⚠️ §2.e | [Ads](https://support.google.com/googleplay/android-developer/answer/9857753) |
| 11 | Email y sitio de soporte | ❌ falta el email | — |
| 12 | Materiales de ficha (ícono 512², destacado 1024×500, ≥2 capturas, título ≤30, corta ≤80, larga ≤4000) | ⚠️ los `public/screenshots/` son placeholders del manifest, **no** sirven para Play | — |
| 13 | Prueba cerrada 12 testers / 14 días consecutivos | ⚠️ ver 7.c | [App testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) |
| 14 | Cuenta de desarrollador verificada | ⚠️ | — |
| 15 | Advertising ID | ✅ no se usa — declarar "no" | — |

### 7.b 🔵 Decisiones del dueño

Las diez de §4.c, más:

11. §2.b — ¿Analytics se mantiene y se declara (incluida `Approximate location`),
    o se retira?
12. §2.c — ¿La contraseña se declara?
13. §2.d — ¿Votos como `Other actions` o como `Other user-generated content`?
14. §2.e — ¿"Contains ads" por YouTube?
15. §5.c — ¿Capturas con pósters reales o con placeholders propios?
16. §6.d — ¿Se aprueba el reemplazo por nombres neutros?
17. §2.f — **¿Qué solución de avatares?** A (generación local), B (set propio),
    C (proxy) o D (dejar como está y declarar la transferencia). **Bloquea el
    commit 3 de la primera tanda.**
18. §2.c — ¿Con qué tipo de Play se declara la contraseña efímera?
19. §2.g — ¿Se agrega una divulgación previa al player de YouTube, para poder
    apoyarse en la excepción de transferencia iniciada por el usuario?
20. §5.f — ¿Qué se hace con cada familia de contenido de TMDB persistido?
    (refresco de `upcoming_content`, pipeline de la ruleta, archivos versionados)

### 7.c 🔍 Verificaciones pendientes en paneles

| # | Qué | Dónde | Para qué |
|---|---|---|---|
| 1 | **Plan de Vercel** y retención real de Runtime Logs | Vercel → Settings | Escribir la retención en `/privacidad` sin inventarla |
| 2 | **Plan de Supabase y política de backups / PITR** | Supabase → Settings → Database | Es lo que determina cuánto sobrevive un dato tras el borrado |
| 3 | **Tipo de cuenta de Play y fecha de creación** | Play Console | Si aplica la prueba cerrada de 12/14. La documentación habla de *"personal developer accounts created after November 13, 2023"* y **no menciona** las cuentas de organización: no voy a afirmar que estén exentas |
| 4 | **Formulario de prórroga de API 36** | Play Console | Si no se llega al 31/08 |
| 5 | **Región de alojamiento de Supabase** | Supabase → Settings | Transferencias internacionales en la política |

---

## 8. Primera tanda: web y legal, independiente de Android

**Alcance exacto.** No toca el paquete Android, no crea el proyecto TWA, no
depende de Play Console. Se puede hacer, revisar y desplegar sola — y **cierra
hoy dos incumplimientos que ya existen en producción**.

| # | Commit | Contenido | Depende de |
|---|---|---|---|
| 1 | `fix(legal): atribución de TMDB y DiceBear` | `/acerca-de` con logo TMDB local, el texto largo verbatim, enlace, crédito CC BY 4.0 a Lisa Wischofsky y aviso de no afiliación | nada — **es el que cierra el incumplimiento vigente** |
| 2 | `fix(onboarding): las rutas legales quedan exentas del gate` | lista de exentas + **test** de que `/privacidad`, `/terminos`, `/acerca-de` y `/eliminar-cuenta` no redirigen con `onboarding_completed = false` | nada |
| 3 | `fix(privacidad): los avatares dejan de salir hacia DiceBear` | ⚠️ **depende de la decisión arquitectónica de §2.f**, no es cambiar la semilla. Si es la opción A: agregar `@dicebear/core` + `@dicebear/styles`, generar el SVG sin red y **borrar el helper que arma la URL de `api.dicebear.com`** | **decisión 17 — bloqueante** |
| 4 | `refactor(marcas): nombres neutros en lugar de wordmarks imitados` | `PlatformLogo.tsx` + borrar las 15 reglas `.lg-*` | decisión 16 |
| 5 | `feat(legal): /privacidad y /terminos` | las estructuras de §4 | decisiones 1-6 |
| 6 | `feat(cuenta): /eliminar-cuenta pública` | §3.e; reusa `<EliminarCuenta/>` | decisiones 1-2 |
| 7 | `feat(legal): enlaces visibles al pie` | pie con las cuatro rutas, en todas las páginas | 1, 5, 6 |
| 8 | `chore(privacidad): decisión sobre la cookie sc_platforms` | sacarla o darle uso | decisión 9 |

**Verificación de la tanda:**

- `npm test`, `npx tsc --noEmit`, `npm run build` con el servidor de desarrollo
  detenido.
- **Sesión limpia** (ventana privada, sin `localStorage`): las cuatro rutas
  cargan con 200 y se leen enteras sin iniciar sesión.
- **Sesión con `onboarding_completed = false`**: las cuatro rutas **no**
  redirigen a `/onboarding` — es la regresión del §3.d, y el test del commit 2
  es lo que la fija.
- `/eliminar-cuenta` permite iniciar sesión y borrar, con un solo mensaje de
  error genérico.
- Ninguna marca de plataforma conserva su color ni su tipografía.
- ⚠️ **Si se elige eliminar la transferencia a DiceBear, hay que DEMOSTRARLO, no
  suponerlo.** Dos comprobaciones, y las dos son necesarias:
  1. **Test automático**: que ningún módulo del bundle contenga la cadena
     `api.dicebear.com`. Es el equivalente del test de importaciones que ya usa
     el proyecto para que `lib/claves.ts` no llegue al navegador.
  2. **Verificación en el navegador**: cargar `/cuenta/perfil` con una cuenta
     real y comprobar en las peticiones de red que **no hay ni una sola** a
     `api.dicebear.com` — ni de la página ni del service worker. El registro de
     red es la prueba; el código leído no alcanza, porque el SW puede tener la
     URL vieja cacheada.

**Criterio de aceptación de la tanda**: las cuatro rutas responden 200 en
producción sin sesión, `/acerca-de` muestra la atribución de TMDB y de DiceBear
(CC BY 4.0, incluso si se generan localmente), el enlace de borrado es pegable en
Play Console, y —si se eligió A, B o C en §2.f— el registro de red no muestra
ninguna petición a `api.dicebear.com`.

---

## 9. Lo que NO pude verificar con una fuente oficial

Se declara explícitamente para que nadie lo tome como confirmado:

1. **Si Google exige declarar una contraseña** en Data Safety. No hay tipo
   "password" en la lista y no encontré guía que lo resuelva (§2.c).
2. **Si la geolocalización a nivel ciudad de Vercel Analytics califica como
   "fully anonymized"** bajo el estándar de Google. Los dos textos existen; el
   cruce lo tiene que hacer alguien, y Google no lo publica (§2.b).
3. **Si la prueba cerrada de 12/14 aplica a cuentas de organización.** La
   documentación solo habla de cuentas personales creadas después del 13/11/2023
   y no menciona las de organización (§7.c).
4. **El alcance exacto de los derechos que TMDB puede conceder sobre imágenes de
   terceros.** Sus términos no lo dicen (§5.b).
5. **Si el uso nominativo de nombres de plataformas está garantizado sin
   autorización** en la jurisdicción que corresponda. Es una cuestión legal, no
   técnica (§6.c).
6. **Retención real de logs de Vercel y de backups de Supabase** en los planes
   contratados. Requiere mirar los paneles (§7.c).
7. **Si `providers.logo_path` se renderiza hoy en `/proximamente`.** Está guardado
   en la base; no verifiqué si algún componente lo pinta.
8. **Si cargar un recurso estático desde un dominio de terceros** (`image.tmdb.org`,
   `youtube-nocookie.com`) cuenta como *collection* o *sharing* en el formulario.
   Las definiciones son lo bastante amplias como para incluirlo y Google no lo
   aclara para este caso (§2.g).
9. **Si un archivo de medición interno, versionado y no distribuido**, cuenta
   como "cache" a los efectos del límite de 6 meses de TMDB (§5.f).
10. **La licencia de la librería `@dicebear/core`** y el nombre exacto del paquete
    de estilos (`@dicebear/styles` vs `@dicebear/collection`). Hay que leerlo en
    el paquete publicado (§2.f).

---

## 10. Estado de esta etapa

- [x] Inventario en cuatro niveles, con la corrección de que las plataformas se
      transmiten al backend también para invitados
- [x] Matriz de Data Safety con tipos y finalidades oficiales, y la **excepción
      concreta** en cada fila en vez de un "no compartido" genérico
- [x] Analytics y Speed Insights resueltos con la definición de Google a la
      vista, con las dos opciones comparadas y marcado como decisión tuya
- [x] Derechos de API, de imágenes y riesgo en capturas, separados
- [x] Nombres de plataformas reformulados: recomendados, **no** declarados
      exentos de autorización
- [x] `/eliminar-cuenta` con la aclaración de "público" y el bloqueo del
      `OnboardingGate` confirmado en el código
- [x] Requisitos, decisiones, verificaciones y recomendaciones, separados
- [x] Primera tanda web/legal, independiente de Android
- [x] Lista explícita de lo no verificado
- [x] **Tercera pasada**: avatares con cuatro soluciones comparadas y una
      recomendación que elimina la transferencia; recorrido real de la
      contraseña y su clasificación como efímero **que sí se declara**;
      afirmaciones absolutas sobre el resultado de la revisión, retiradas;
      filas de TMDB, YouTube y DiceBear con qué se transmite y qué excepción
      aplicaría; auditoría de persistencia de contenido de TMDB en las tres
      familias
- [ ] **Tu aprobación antes de escribir una línea de código**
