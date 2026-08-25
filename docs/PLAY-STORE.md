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
clave de cache. Para Data Safety eso es **procesamiento efímero**.

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
| Señales de personalización | — | **No**: procesamiento **efímero** | No | **Ephemeral processing** | — | — |
| Speed Insights | App info and performance → **Diagnostics** | 🟡 **Sí** | No | Service provider (Vercel) | Obligatorio | Analytics |
| Web Analytics | App activity → **App interactions** | 🟡 **Sí** | No | Service provider (Vercel) | Obligatorio | Analytics |
| **Geolocalización de Analytics** | Location → **Approximate location** | 🔵 **DECISIÓN** — ver 2.b | No | Service provider | Obligatorio | Analytics |
| Avatar (estilo + semilla) | *(sin tipo claro)* — hoy la semilla puede ser el `user_id` | 🟡 Sí, como **User IDs**, mientras no se arregle | **Sí, a DiceBear** ⚠️ | **Ninguna excepción clara**: DiceBear no es proveedor nuestro | Opcional | App functionality |
| Pósters (TMDB) | — | La IP la ve TMDB, pero **no transmitimos datos de usuario** | No | — | — | — |
| Tráilers (YouTube) | — | ídem | 🔵 **DECISIÓN** — ver 2.e | — | — | — |
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
| Riesgo de rechazo | bajo: declarar de más nunca hizo rechazar una app | nulo |
| Riesgo de discrepancia | nulo | nulo |
| Qué se pierde | nada | la medición de uso real y de Web Vitals |
| Trabajo | rellenar tres filas más | sacar dos componentes de `layout.tsx` |
| Opción intermedia | `beforeSend` para redactar rutas sensibles ([redacting sensitive data](https://vercel.com/docs/analytics/redacting-sensitive-data)) — **no** elimina la geolocalización | — |

🟡 **RECOMENDACIÓN CONSERVADORA: opción A**, declarando las tres categorías
**incluida `Approximate location`**. Declarar de más cuesta tres casillas;
declarar de menos, si Google verifica, es una discrepancia en el formulario. La
opción intermedia no sirve para esto: `beforeSend` toca la URL, no la
geolocalización.

🔵 **Queda como decisión tuya**, porque implica aceptar que la ficha diga que la
app recoge ubicación aproximada, y eso se ve en la tienda.

### 2.c 🔵 DECISIÓN — La contraseña

La lista de tipos de Play **no incluye** "password". Lo más cercano sería
`Personal info → Other info`. **No encontré una fuente oficial que resuelva si
una credencial de autenticación debe declararse**, y no voy a inventar una.

🟡 No declararla como tipo separado, y explicarla igual en `/privacidad`
(se guarda con hash, nunca en claro, nadie la ve).

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

### 2.f ⚠️ El avatar es el único "sharing" real

Todo lo demás cae bajo **service provider**. DiceBear **no** procesa datos por
cuenta nuestra siguiendo nuestras instrucciones: es un servicio público al que el
navegador le pide una imagen. Si la semilla es el `user_id`, eso es transferir un
identificador a un tercero.

🟡 **Arreglarlo antes de completar el formulario** (garantizar que la semilla
nunca sea el `user_id`) y así la fila desaparece de la matriz. Es una línea de
código y evita tener que declarar "compartimos identificadores".

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
- **Cache**: prohibido más de **6 meses**. ✅ Nuestro TTL más largo es `pool: 30 h`.

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
17. §2.f — ¿Se arregla el `avatar_seed = user.id` antes de completar el formulario?

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
| 3 | `fix(privacidad): el avatar deja de exponer el user_id` | la semilla nunca es `user.id` | nada |
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

**Criterio de aceptación de la tanda**: las cuatro rutas responden 200 en
producción sin sesión, `/acerca-de` muestra la atribución de TMDB y DiceBear, y
el enlace de borrado es pegable en Play Console.

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
- [ ] **Tu aprobación antes de escribir una línea de código**
