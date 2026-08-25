# Google Play: auditoría y diseño legal

**Etapa de auditoría y diseño. No se tocó código, no se creó ninguna página, no
se desplegó nada y no se escribió en Supabase.** Todo lo de acá sale de leer el
repo real y de documentación oficial vigente, enlazada donde corresponde.

**Fecha: 25 de agosto de 2026.** Hay un plazo de Google que vence en seis días —
ver el bloqueante #1.

---

## 0. Los cinco bloqueantes, arriba de todo

| # | Bloqueante | Por qué |
|---|---|---|
| 1 | **Target API 36 vence el 31/08/2026** | Y **no existe ningún build Android**: no hay `public/.well-known/assetlinks.json`, ni `twa-manifest.json`, ni proyecto de Bubblewrap. Son seis días. |
| 2 | **La app no atribuye a TMDB en ningún lado** | Auditado: cero menciones de TMDB en la interfaz. Los términos lo exigen y la app **ya está publicada** en `app.yump.ar`. Es un incumplimiento vigente, no futuro. |
| 3 | **Los "logos" de plataforma son imitaciones hechas a mano** | `PlatformLogo.tsx` + `.lg-*` en `globals.css`: la palabra NETFLIX en `#E50914` con `letter-spacing:-.04em`, `max` en `#0E2FD6`, el swoosh de Prime Video dibujado en SVG. No son los assets oficiales ni son texto neutro: son *trade dress* imitado. Es el riesgo de propiedad intelectual más alto del proyecto. |
| 4 | **No existe ninguna de las cuatro páginas** | `/privacidad`, `/terminos`, `/acerca-de` y `/eliminar-cuenta` no están en `app/`. Play exige política de privacidad y enlace de borrado. |
| 5 | **Falta la atribución CC BY 4.0 de DiceBear** | El estilo `adventurer-neutral` es de Lisa Wischofsky bajo [CC BY 4.0](https://www.dicebear.com/styles/adventurer-neutral/), que **exige crédito**. |

---

## 1. Inventario de datos

### 1.a Lo que guarda Supabase (Postgres + Auth)

Proyecto `aibqqebwlladjjkeqllo.supabase.co`. Todas las tablas de usuario tienen
RLS con `auth.uid() = user_id`, y **todas cuelgan de `auth.users` con
`on delete cascade`** — eso es lo que hace que el borrado sea real.

| Dato | Dónde | Para qué | Retención | Cómo se elimina | Quién accede |
|---|---|---|---|---|---|
| **Email** | `auth.users` (Supabase Auth) | identificar la cuenta, login, recuperar contraseña | mientras exista la cuenta | `deleteUser` | la persona; el service role del servidor |
| **Contraseña** | `auth.users`, **hash** (Supabase nunca guarda el texto) | autenticación | ídem | ídem | nadie la ve en claro |
| **Sesión / refresh token** | `auth.sessions` + `localStorage` del navegador (`sb-<ref>-auth-token`) | mantener la sesión | hasta cerrar sesión o borrar la cuenta | `signOut()` + `esSesionSupabase()` en `limpieza-local.ts` | la persona |
| **`user_id` (uuid)** | PK de `profiles` y FK de todo lo demás | vincular los datos a la cuenta | ídem | cascade | ídem |
| **Nombre visible** | `profiles.display_name` | saludar y firmar | ídem | cascade | ídem |
| **Avatar** (`avatar_style`, `avatar_seed`) | `profiles` | dibujar el avatar | ídem | cascade | ídem — **la semilla sale del dispositivo hacia DiceBear**, ver 1.d |
| **País** | `profiles.country_code` (default `AR`) | preferencia | ídem | cascade | ídem |
| **Plataformas** | `profiles.platforms integer[]` | filtrar el catálogo | ídem | cascade | ídem |
| **Votos** | `votes` (`rating` 1-3 + `tmdb_id` + `created_at`) | rieles "Lo más votados" / "No gustaron" y personalización | ídem | cascade | la persona ve el suyo; **los agregados son públicos** vía `top_voted()` y `vote_counts()` |
| **Mi lista / Ya la vi / Descartes** | `user_items.kind in ('list','watched','dismissed')` | las listas del área de usuario | ídem | cascade | solo la persona |
| **Historial de fichas** | `view_history` (`viewed_at`) | riel "Vistos recientemente" | ídem | cascade | solo la persona |
| **`onboarding_completed`, `is_admin`** | `profiles` | flujo de alta; permisos del dashboard | ídem | cascade | ídem |

**Dos cosas que hay que decir con todas las letras:**

- **Los votos alimentan un agregado público.** `top_voted()` devuelve conteos por
  título, no identidades — pero el dato del individuo contribuye a algo que se
  publica. En la política de privacidad va como "uso" explícito.
- **`user_reviews` existe en el esquema y está vacía a propósito** (módulo en
  standby). No se declara como dato recogido mientras no se active; si se
  activa, es contenido generado por el usuario con moderación, y eso cambia la
  clasificación de contenido de Play.

### 1.b Lo que se queda en el dispositivo

Auditado sobre `localStorage`/`sessionStorage` y cookies. **Nada de esto viaja a
nuestro servidor, con una excepción marcada.**

| Clave | Qué | Se va con la cuenta |
|---|---|---|
| `sc:platforms` | plataformas elegidas (invitado) | **no**, se conserva a propósito |
| `sc:theme`, `sc:pais`, `sc:visits`, `yump:shelf-type` | preferencias del dispositivo | **no**, se conservan |
| `yump:ruleta-mostrados`, `yump:hero-estado`, `yump:lista-paginada`, `yump:lista-vuelta`, `yump:track-scroll` | estado de navegación y paginación | **sí** (`CLAVES_PERSONALES`) |
| `sc:pwa:*` | si se mostró/descartó el banner de instalación | no |
| `sb-<ref>-auth-token` | la sesión | **sí** |

**La excepción: la cookie `sc_platforms`.** Es un espejo de `sc:platforms`, sin
`HttpOnly`, `SameSite=Lax`, un año de vida. **Las cookies se mandan solas en
cada request**, así que ese dato SÍ se transmite. Y hay un hallazgo:
**ningún código del servidor la lee hoy** — no hay una sola llamada a `cookies()`
en `app/`. O se le da uso, o conviene sacarla: es el único dato de preferencia
que sale del dispositivo y no le sirve a nadie.

**No hay cookies de analítica, ni de publicidad, ni de terceros propias.**

### 1.c Terceros que reciben datos del NAVEGADOR

Estos ven la IP del usuario porque el navegador les habla directo. No podemos
evitarlo sin proxear.

| Tercero | Qué recibe | Verificado en |
|---|---|---|
| **Vercel** (hosting) | la request entera: IP, user-agent, ruta, cabeceras | — |
| **Vercel Web Analytics** | timestamp, URL, ruta dinámica, referrer, query params filtrados, **geolocalización a nivel ciudad**, SO, navegador, tipo de dispositivo. **Sin cookies**; el visitante se identifica con "a hash created from the incoming request" y "the lifespan of a visitor session is not stored permanently, it is automatically discarded after 24 hours" | [Vercel Analytics — Privacy and Compliance](https://vercel.com/docs/analytics/privacy-policy) |
| **Vercel Speed Insights** | ruta, URL, velocidad de red, navegador, dispositivo, SO, **país (ISO 3166-1)**, Web Vitals. "not being tied to, or associated with, any individual visitor or IP address" | [Speed Insights — Privacy & Compliance](https://vercel.com/docs/speed-insights/privacy-policy) |
| **`image.tmdb.org`** | IP + user-agent, y qué póster se está mirando | pósters y backdrops se sirven directo desde TMDB |
| **`youtube-nocookie.com`** | IP + user-agent al reproducir un tráiler. El modo privacidad **no elimina el rastreo, evita la personalización**: "the view … will not be used to personalize the YouTube browsing experience" y "If ads are served … those ads will likewise be non-personalized" | [YouTube — Privacy Enhanced Mode](https://support.google.com/youtube/answer/171780) |
| **`api.dicebear.com`** | IP + **la semilla del avatar**. DiceBear registra "IP addresses or domain names of the computers utilized by the Users"; responsable Florian Körner (Alemania), hosting Hetzner + BunnyWay | [DiceBear — Privacy Policy](https://www.iubenda.com/privacy-policy/57216581/full-legal) |
| **`calendar.google.com`** | solo si la persona toca "Agendar": título del estreno y fecha, en la URL. **Es navegación iniciada por el usuario**, no un envío nuestro | `lib/calendar-links.ts` |

**Hallazgo a revisar antes de escribir la política**: en
`components/AuthContext.tsx:53` hay un camino de respaldo donde `avatar_seed`
toma el valor de `user.id`. Cuando ese camino corre, **el UUID de la cuenta
viaja a DiceBear como parte de la URL** y queda en sus logs. El camino normal usa
`gen_random_uuid()` del trigger `handle_new_user`, que no está vinculado a nada.
Es una línea, y conviene arreglarla antes de declarar "no compartimos
identificadores con terceros".

### 1.d Terceros que reciben datos del SERVIDOR (sin datos personales)

| Tercero | Qué recibe | Datos personales |
|---|---|---|
| **TMDB API** | consultas de catálogo con el bearer token del proyecto | **no**: nunca viaja quién pregunta |
| **Upstash Redis** | catálogo cacheado. Auditadas las familias de claves (`card:`, `pv:`, `videos:`, `home:`, `genre:covers:`, `blocklist:`, `people:`, `ed:`, `health:`, `node:`): **ninguna lleva `user_id` ni email** | **no** |
| **Netflix (TSV público)** | una descarga semanal desde el cron | **no** |
| **Supabase** | ver 1.a | sí |

### 1.e Logs de Vercel

Contienen ruta, método, status, user-agent, host, región, **search params** y
`console.log`/`console.error` de las funciones. La IP se procesa —el filtro
"logs from your browser" "works by matching your IP address and User Agent"— pero
no figura como campo del detalle.

**Retención en Hobby: 1 hora** ([Runtime Logs — Limits](https://vercel.com/docs/runtime-logs)).
Pro: 1 día. Es un dato bueno para la política.

**Higiene ya presente y vale la pena mantenerla escrita:** `/api/te-va-a-gustar`
es POST *justamente* para que las señales personales no queden en logs de acceso
("son datos personales y no tienen por qué quedar en logs de acceso ni en el
historial del navegador"), y `/api/cuenta/eliminar` no registra cuerpo,
contraseña, token ni email.

### 1.f El caso especial: la personalización

**El servidor no sabe quién pide.** `/api/te-va-a-gustar` recibe las señales y
exclusiones **del cliente**, porque es el único que puede leerlas (RLS). Del
usuario solo se comprueba que exista una sesión, y su id no se guarda ni entra en
la clave de cache. Para Data Safety esto es **procesamiento efímero**: el dato
llega, se usa en la respuesta y no se persiste.

---

## 2. Matriz preliminar de Data Safety

Categorías y finalidades tomadas del formulario oficial
([Data safety — Play Console Help](https://support.google.com/googleplay/android-developer/answer/10787469)).

**Definiciones que aplican y conviene tener a mano:**
- *Ephemeral processing*: "Accessing and using [data] while the data is only
  stored in memory and retained for no longer than necessary to service the
  specific request in real-time".
- *Service provider*: "An entity that processes user data on behalf of the
  developer and based on the developer's instructions". **Mandarle datos a un
  proveedor de servicios no cuenta como "compartir"** — es la excepción que
  cubre a Vercel, Supabase y Upstash.

| Dato (tipo exacto de Play) | ¿Recogido? | ¿Compartido? | ¿Obligatorio? | Finalidad | ¿Efímero? |
|---|---|---|---|---|---|
| Personal info → **Email address** | Sí | No (Supabase = proveedor de servicio) | Opcional — solo si crea cuenta | Account management | No |
| Personal info → **User IDs** | Sí | No | Opcional | Account management, App functionality | No |
| Personal info → **Name** (nombre visible) | Sí | No | Opcional | App functionality, Personalization | No |
| App activity → **App interactions** (Mi lista, vistos, descartes, historial) | Sí | No | Opcional | App functionality, Personalization | No |
| App activity → **Other user-generated content** (votos) | Sí | No | Opcional | App functionality, Personalization | No |
| App activity → **Other actions** (plataformas, país, tema) | Sí, si hay cuenta | No | Opcional | App functionality, Personalization | No |
| App info and performance → **Diagnostics** (Speed Insights) | ⚠️ decisión — ver abajo | No | Obligatorio | Analytics | No |
| App activity → **App interactions** (Web Analytics) | ⚠️ decisión | No | Obligatorio | Analytics | No |
| **Device or other IDs** | **No** | No | — | — | — |
| Location → Approximate location | ⚠️ decisión | No | Obligatorio | Analytics | — |

**Prácticas de seguridad:**

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Todo cifrado en tránsito? | **Sí** | Vercel fuerza HTTPS; Supabase, Upstash, TMDB, DiceBear y YouTube son todos HTTPS |
| ¿Se puede pedir el borrado? | **Sí, y se ejecuta al instante** | ver §3 |

### Los cuatro puntos que necesitan tu decisión

1. **¿Vercel Analytics y Speed Insights se declaran como recogidos?**
   Vercel afirma que el dato es anónimo y agregado, sin cookies y sin poder
   reconstruir una sesión. El argumento para **no** declararlo es que nunca se
   asocia a una persona. El argumento para **sí** es que la geolocalización a
   nivel ciudad más el user-agent es lo que Google mira con lupa, y una
   declaración de más nunca hizo rechazar una app.
   **Recomiendo declarar** `Diagnostics` + `App interactions` con finalidad
   `Analytics`, y **no** declarar `Approximate location`: la geolocalización la
   deriva Vercel de la IP del lado del servidor, no la pide la app.

2. **¿La contraseña se declara?** La lista de tipos de Play **no tiene** un tipo
   "password"; lo más cercano sería `Personal info → Other info`. La práctica
   habitual es no declarar una credencial de autenticación como dato recogido.
   **No tengo una fuente oficial que lo resuelva de forma inequívoca**, así que
   lo dejo como decisión tuya. Mi recomendación: no declararla, y explicarla
   igual en la política de privacidad.

3. **¿"Contains ads"?** El player de YouTube **puede** mostrar publicidad, y las
   propias notas de Google confirman que en modo privacidad los anuncios siguen
   apareciendo, solo que no personalizados. La declaración cubre "ads delivered
   through third-party ad SDKs, display ads, native ads, and/or banner ads"
   ([Ads — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9857753)).
   No hay un SDK de anuncios ni monetizamos con eso, pero el usuario puede ver un
   anuncio dentro de la app.
   **Recomiendo declarar "sí"**: si Google lo verifica y no coincide, "it's
   considered a violation … and may result in your app(s) being suspended".

4. **¿Los votos son "Other user-generated content" o "App interactions"?**
   Un voto de 1 a 3 no es contenido en el sentido de un texto. Lo declaré como
   UGC por prudencia porque **alimenta un agregado público**. Decidilo vos.

---

## 3. Eliminación de cuenta

### 3.a El flujo actual, verificado

```
POST /api/cuenta/eliminar   (Authorization: Bearer <token>)
  └─ sesionDeToken(token)                 → 401 sin-sesion
  └─ bloqueado(...)                       → 429 tras 5 intentos fallidos / 15 min
  └─ body: { password }                   (ni id ni email: salen del token)
  └─ eliminarCuenta()
       ├─ hayAdmin()                      → 503 no-disponible (antes de tocar la contraseña)
       ├─ contrasenaValida(email, pass)   cliente aislado, persistSession:false, signOut() después
       └─ admin.auth.admin.deleteUser(userId, false)   ← shouldSoftDelete FALSE, explícito
```

**Lo que ya está bien resuelto y no hay que tocar:**

- **`shouldSoftDelete: false` está escrito a mano** aunque sea el default,
  porque un soft delete dejaría la fila con `deleted_at` y **no dispararía los
  CASCADE**: votos, historial y perfil seguirían existiendo mientras la pantalla
  dice "eliminada para siempre".
- **No hay oráculo de contraseña.** Se pregunta por la credencial administrativa
  *antes* de validar nada: si no, el par 401/500 distinguía una contraseña
  correcta de una incorrecta.
- **Nada se registra**: ni cuerpo, ni contraseña, ni token, ni email.
- El borrado local (`limpieza-local.ts`) distingue lo personal de las
  preferencias del dispositivo, que se conservan a propósito.

### 3.b ¿Google exige una solicitud o nuestro borrado inmediato alcanza?

**Nuestro borrado inmediato supera el requisito.** La política pide "a web link
resource where users can **request** app account deletion" y acepta explícitamente
un flujo de solicitud ("an additional link that initiates account deletion, a
customer service email or a form"). Ejecutar el borrado en el momento es el
extremo cumplidor de ese rango.

**Pero ojo con esto: Google exige LAS DOS cosas**, no una u otra —
"an in-app path to delete their app accounts and associated data; **and** a web
link resource". El camino in-app ya existe (`/cuenta/configuracion`); falta el
web ([Provide information for Google Play's Data safety section — data deletion](https://support.google.com/googleplay/android-developer/answer/13327111)).

### 3.c Diseño de `/eliminar-cuenta`

Requisitos de Google que la página tiene que cumplir: "Functional", "Relevant in
scope (… prominently featured and easily discoverable)" y referenciar "the app or
developer name (that is, as it appears on your store listing)".

```
┌─ Encabezado ─────────────────────────────────────────────┐
│ Logo Yump + "Yump — Qué ver en tus plataformas"          │
│ (el nombre EXACTO del manifest y de la ficha de Play)     │
├─ Qué hace esta página ───────────────────────────────────┤
│ Una frase: borra tu cuenta de Yump y todo lo asociado,    │
│ en el momento y sin vuelta atrás.                         │
├─ Paso 1: iniciar sesión ─────────────────────────────────┤
│ email + contraseña → el MISMO signInWithPassword del      │
│ cliente de Supabase que usa la app                        │
│ error único y genérico para todos los casos               │
├─ Paso 2: confirmar ──────────────────────────────────────┤
│ reusa <EliminarCuenta/> tal cual → POST a la ruta actual  │
├─ Qué se elimina (lista literal) ─────────────────────────┤
│ cuenta y email · nombre y avatar · país y plataformas     │
│ del perfil · votos · Mi lista · Ya la vi · descartes ·    │
│ historial de fichas · sesiones abiertas                   │
├─ Qué NO se elimina, y por qué ───────────────────────────┤
│ · preferencias del dispositivo (plataformas, tema, país)  │
│   se conservan para poder seguir como invitada            │
│ · logs técnicos de Vercel, hasta 1 h, sin tu email        │
│ · el conteo agregado de votos, que no te identifica  ⚠️   │
│ · copias de seguridad de la base, hasta N días        ⚠️  │
├─ Contacto ───────────────────────────────────────────────┤
│ email de soporte + enlace a /privacidad                   │
└──────────────────────────────────────────────────────────┘
```

**Decisiones de diseño que se desprenden de tus requisitos:**

- **No duplica lógica sensible.** La página es una cáscara: login con el cliente
  de Supabase que ya existe y `POST` al endpoint que ya existe. Cero reglas de
  borrado nuevas, cero service role del lado del cliente.
- **No revela si un email existe.** `signInWithPassword` de Supabase devuelve
  `Invalid login credentials` para email inexistente y para contraseña
  incorrecta, así que el comportamiento por defecto ya no enumera —
  **siempre que la interfaz no traduzca el error a dos mensajes distintos**.
  Un solo texto: "Email o contraseña incorrectos". **Y no poner "¿olvidaste tu
  contraseña?" con feedback distinto según el caso**, que es por donde se escapa
  la enumeración.
- **Sin sesión previa y sin app instalada.** Página pública, sin gate de
  onboarding, sin depender de `localStorage`.
- **Compatible con el enlace de Play**: URL estable `https://<dominio>/eliminar-cuenta`,
  200 sin redirecciones, sin JS bloqueante para leer el texto.

⚠️ **Los dos puntos que no puedo cerrar solo:** el conteo agregado de votos
(¿se borran los votos del agregado histórico? el CASCADE dice que sí, pero
conviene decirlo explícito) y **cuánto retienen las copias de seguridad de
Supabase en el plan que tenés**. Eso hay que mirarlo en el panel; no lo doy por
sabido.

---

## 4. Privacidad, términos y contacto

### 4.a Estructura propuesta de `/privacidad`

1. Quién es el responsable y cómo contactarlo *(falta el dato)*
2. Qué datos se recogen — las tres tablas de §1, en lenguaje llano
3. Qué se queda en tu dispositivo y nunca se envía
4. Para qué se usa cada cosa
5. Con quién se comparte: **proveedores de servicio** (Vercel, Supabase,
   Upstash) vs **terceros que el navegador contacta** (TMDB, YouTube, DiceBear)
6. Cuánto se conserva
7. Cómo borrar la cuenta → enlace a `/eliminar-cuenta`
8. Derechos de acceso, rectificación y portabilidad *(depende de la jurisdicción)*
9. Menores de edad
10. Cookies: qué hay y por qué **no** hay banner de consentimiento
11. Cambios en la política y fecha de última actualización

### 4.b Estructura propuesta de `/terminos`

1. Qué es Yump y qué **no** es: un agregador de información, **no** un servicio
   de streaming; no reproduce contenido ni vende suscripciones
2. Elegibilidad y edad mínima *(falta el dato)*
3. Cuenta: responsabilidad sobre la contraseña, baja
4. Uso aceptable
5. Contenido de terceros: catálogo de TMDB, tráilers de YouTube
6. **Marcas de terceros y no afiliación** — ver §6
7. Sin garantías sobre disponibilidad ni exactitud del catálogo (los datos son
   de TMDB y pueden estar desactualizados o equivocados)
8. Limitación de responsabilidad
9. Cambios en el servicio
10. Ley aplicable y jurisdicción *(falta el dato)*
11. Contacto

### 4.c Lo que necesito que decidas

| # | Decisión | Por qué bloquea |
|---|---|---|
| 1 | **Nombre del responsable**: ¿persona física, nombre público, o una sociedad? | Va en las dos páginas, en la ficha de Play y en el aviso de no afiliación |
| 2 | **Email de soporte** y **email de privacidad** (pueden ser el mismo) | Play exige email de soporte en la ficha; la política necesita un contacto |
| 3 | **Domicilio o jurisdicción** | Play no lo exige para cuentas personales; una política de privacidad sí necesita ley aplicable. ¿Argentina? |
| 4 | **¿Va a haber monetización, publicidad o suscripciones?** | Decide si hace falta un acuerdo comercial con TMDB (§5) y cambia Data Safety y los términos |
| 5 | **Períodos de retención** | Propuesta: cuenta = hasta que la borres; logs = lo que dure el plan de Vercel (1 h en Hobby); analítica = agregada, sin plazo por persona. Falta el de copias de seguridad de Supabase |
| 6 | **Edad mínima y público objetivo** | Define el cuestionario de Target Audience y si aplica Families Policy. Con contenido para adultos en el catálogo, **13+ o 16+** parece lo razonable; **no** declarar público infantil |
| 7 | **Tipo de cuenta de Play y fecha de creación** | Decide si aplica la prueba cerrada de 12 personas — ver §7 |
| 8 | **Dominio definitivo de la ficha** | Hoy `app.yump.ar`. Los enlaces de política y borrado tienen que ser estables |

---

## 5. TMDB

### 5.a Lo que exigen los términos, verificado

De los [API Terms of Use](https://www.themoviedb.org/api-terms-of-use):

- **Texto obligatorio**, verbatim: *"This [website, program, service,
  application, product] uses TMDB and the TMDB APIs but is not endorsed,
  certified, or otherwise approved by TMDB."*
- **Prominencia**: el logo de TMDB debe ser *"less prominent than the logos or
  marks that primarily describe or identify Your Application"*. Es decir:
  **más chico y menos visible que la marca Yump**. Se cumple solo con ponerlo en
  el pie de `/acerca-de`.
- **Colocación**: el descargo va *"prominently in or on Your Application"*.
- **Uso comercial**: requiere un acuerdo escrito aparte. Prohíbe
  *"Selling, leasing, or sublicensing the TMDB APIs, access to the TMDB APIs, or
  TMDB Content … for commercial or monetary gain"* sin permiso explícito.
- **Cache**: prohibido cachear información de TMDB **más de 6 meses**.

**Nota sobre el texto que me pasaste.** Vos citaste *"This product uses the TMDB
API but is not endorsed or certified by TMDB."* — es la forma corta que circula
en la documentación de la API. **La que figura hoy en los términos vigentes es la
larga**, con "TMDB and the TMDB APIs" y "endorsed, certified, or otherwise
approved". Recomiendo usar **la larga**: cumple las dos lecturas.

### 5.b Cómo estamos

| Requisito | Estado |
|---|---|
| Texto obligatorio | ❌ **no está en ningún lado** |
| Logo de TMDB | ❌ no está |
| Enlace a TMDB | ❌ no está |
| Prominencia menor que Yump | — (trivial de cumplir en `/acerca-de`) |
| Uso no comercial | ✅ hoy sí |
| Cache ≤ 6 meses | ✅ **con muchísimo margen**: el TTL más largo del proyecto es `pool: 30 h` |

**Assets**: los cinco logos oficiales están en
[TMDB — Logos & Attribution](https://www.themoviedb.org/about/logos-attribution)
en SVG (primary full/short/long, alt long/short). Colores de marca `#0d253f`,
`#01b4e4`, `#90cea1`. Hay que **descargar el SVG y servirlo local**: el CSP de la
app y el service worker no deberían depender de un host externo para esto.

### 5.c Antes de monetizar

Cualquier ingreso —publicidad, suscripción, afiliados— **exige un acuerdo
comercial escrito con TMDB antes de activarlo**. No es un trámite que se pueda
hacer después. Si la respuesta a la decisión #4 es "sí", ese contacto va primero
en el orden de trabajo.

### 5.d ¿Mencionar TMDB en privacidad, términos y la ficha de Play?

- **`/acerca-de`**: sí, es el lugar principal — logo + texto + enlace.
- **`/privacidad`**: sí, pero por otro motivo: `image.tmdb.org` recibe la IP del
  usuario. Va en la lista de terceros.
- **`/terminos`**: sí, en la cláusula de contenido de terceros.
- **Ficha de Play**: **no es obligatorio**, pero una línea en la descripción
  ("Datos de catálogo por TMDB") ayuda a que el revisor entienda de dónde sale el
  contenido y de paso refuerza que no somos un servicio de streaming.

---

## 6. Plataformas y propiedad intelectual

### 6.a Dónde aparecen marcas ajenas hoy

| Superficie | Qué aparece |
|---|---|
| `components/PlatformLogo.tsx` | wordmarks imitados de 15 plataformas |
| Cards del catálogo (`TitleCard`) | wordmark de cada plataforma disponible |
| Ficha (`DetailView`) | "Disponible en" + wordmark |
| Header / selector de plataformas / onboarding | los 15 |
| `/top` | el wordmark como **título** de cada bloque |
| Toda la app | **pósters y backdrops** de TMDB (copyright de los estudios) |
| `/proximamente` | `providers.logo_path` guardado en la base |

### 6.b El problema real, y no es el que parece

**Lo que hay hoy no es ni una cosa ni la otra.** No son los logos oficiales, y
tampoco son nombres neutros en texto: son **reproducciones a mano de la identidad
visual** de cada marca. La evidencia:

```css
.lg-n{color:#E50914;font-weight:800;letter-spacing:-.04em}   /* el rojo Netflix */
.lg-m{color:#0E2FD6;font-weight:800;letter-spacing:-.06em}   /* el azul Max */
.lg-cr{color:#F47521;font-weight:800}                        /* el naranja Crunchyroll */
```
```jsx
p: <span className="lg lg-p"><svg …><path d="M1 7c6 4 14 4 20 0" stroke="#00A8E1"/></svg>prime video</span>
```

Ese `path` es el swoosh de Prime Video dibujado a mano. Reproducir el color, la
tipografía y el símbolo de una marca es **imitación de imagen comercial**, que es
más expuesto que usar el logo oficial *y* más expuesto que escribir el nombre.
El propio comentario del archivo lo admite: *"Wordmarks provisionales"*.

### 6.c Las dos alternativas, comparadas

| | **A. Nombres neutros en texto** | **B. Logos oficiales sin modificar** |
|---|---|---|
| Base legal | **uso nominativo**: nombrar un servicio para describirlo | licencia de marca, o las guías de marca de cada plataforma |
| Qué hace falta | nada | permiso de **cada una** de las 15 |
| `provider.logo_path` de TMDB | — | **no alcanza**. TMDB entrega el archivo; no puede licenciar marcas ajenas. Sus términos cubren las marcas *de TMDB* |
| Riesgo en la revisión de Play | bajo | medio: los logos ajenos en ícono/capturas disparan revisión por suplantación |
| Trabajo | reemplazar `PlatformLogo.tsx` y borrar 15 reglas CSS | descargar, versionar y mantener 15 assets con reglas distintas cada uno |
| Cómo se ve | más sobrio, más consistente con Yump | más reconocible de un vistazo |

### 6.d Recomendación

**Alternativa A, con matices**, y en este orden:

1. **Sacar la imitación**: los nombres van en la tipografía de Yump y en el color
   de texto de la app. Se conserva el nombre exacto y su capitalización
   ("Netflix", "Disney+", "Max", "Prime Video", "Apple TV+", "Crunchyroll"),
   porque nombrar bien es parte del uso nominativo.
2. **Conservar UNA señal visual propia** —una pastilla o un punto de color de la
   paleta de Yump, no de la marca— para no perder el reconocimiento de un
   vistazo en las cards.
3. **Aviso de no afiliación** en `/acerca-de`, en `/terminos` y —una línea— en la
   descripción de Play:

   > Yump es un agregador independiente. Netflix, Disney+, Max, Prime Video,
   > Apple TV+, Crunchyroll y las demás plataformas mencionadas son marcas de sus
   > respectivos titulares. Yump no está afiliado, asociado, autorizado ni
   > patrocinado por ninguna de ellas, y no ofrece ni reproduce sus contenidos.

4. **`/proximamente` sigue usando `logo_path`**: revisar si se renderiza y
   alinearlo con la decisión.

**Qué va a aparecer en las capturas de Play**: el Home y `/top` con los wordmarks
de plataforma, y **pósters de películas y series**. Los pósters son de los
estudios y llegan por TMDB. Mostrarlos dentro de la app está cubierto por los
términos de TMDB; usarlos como **material de marketing de la ficha** es otra cosa.
Lo prudente: capturas donde los pósters se vean como parte de la interfaz —
nunca un póster a pantalla completa como arte de la ficha— y **el ícono y el
gráfico destacado, 100% Yump**, sin una sola marca ajena.

**Qué puede pedir Google**: si detecta marcas de terceros en ícono, título,
gráfico destacado o capturas, puede pedir documentación de autorización. Con la
alternativa A y el aviso de no afiliación, esa pregunta casi no se dispara.

---

## 7. Checklist de Google Play

| # | Ítem | Estado | Fuente |
|---|---|---|---|
| 1 | **Target API 36** (nuevas apps y updates) | ❌ **vence 31/08/2026**; no hay build Android. Prórroga posible hasta 01/11/2026 | [Target API level requirements](https://developer.android.com/google/play/requirements/target-sdk) |
| 2 | **AAB firmado + Play App Signing** | ❌ no existe | — |
| 3 | **Digital Asset Links** (`/.well-known/assetlinks.json`) | ❌ no existe. **Imprescindible para TWA**: sin esto la barra de URL no desaparece | — |
| 4 | **Política de privacidad** (URL pública) | ❌ | — |
| 5 | **Data Safety** | ⚠️ matriz en §2, con 4 decisiones abiertas | [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) |
| 6 | **Borrado de cuenta**: in-app **y** enlace web | ⚠️ in-app ✅, web ❌ | [Data deletion](https://support.google.com/googleplay/android-developer/answer/13327111) |
| 7 | **Acceso del revisor** | ⚠️ hace falta una cuenta de prueba con email y contraseña, más instrucciones. El login es email+contraseña sin 2FA, así que alcanza con crear una | — |
| 8 | **Clasificación de contenido** (cuestionario IARC) | ⚠️ pendiente. Ojo: el catálogo incluye títulos para adultos y hay tráilers de YouTube |
| 9 | **Target audience & content** | ⚠️ pendiente — depende de la decisión #6 | [Manage target audience](https://support.google.com/googleplay/android-developer/answer/9867159) |
| 10 | **Declaración de anuncios** | ⚠️ decisión; recomiendo **sí** por YouTube | [Ads](https://support.google.com/googleplay/android-developer/answer/9857753) |
| 11 | **Email y sitio de soporte** | ❌ falta decidir el email | — |
| 12 | **Materiales de la ficha**: ícono 512², gráfico destacado 1024×500, ≥2 capturas de teléfono, título ≤30, descripción corta ≤80, larga ≤4000 | ⚠️ los `public/screenshots/` actuales son placeholders branded, sirven para el manifest pero **no** para Play | — |
| 13 | **Prueba cerrada, 12 testers / 14 días consecutivos** | ⚠️ **solo si la cuenta es personal y se creó después del 13/11/2023**. Después hay que "apply for production access" | [App testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) |
| 14 | **Cuenta de desarrollador verificada** | ⚠️ depende de #7 de las decisiones | — |
| 15 | **Advertising ID** | ✅ **no se usa** — declarar "no" | — |

**Sobre #13**: la documentación oficial dice textualmente "personal developer
accounts created after November 13, 2023" y **no menciona** las cuentas de
organización. No voy a afirmar que las de organización estén exentas: hay que
mirarlo en el panel de tu cuenta, que es donde Google lo muestra.

---

## 8. Entrega

### 8.a Bloqueantes confirmados

1. **Target API 36 el 31/08/2026** y no hay ningún artefacto Android. Seis días.
2. **Atribución de TMDB ausente** — incumplimiento vigente en producción.
3. **Wordmarks imitados** de 15 marcas.
4. **Las cuatro páginas no existen.**
5. **Atribución CC BY 4.0 de DiceBear ausente.**

### 8.b Decisiones que necesito de vos

Las ocho de §4.c, más las cuatro de Data Safety en §2, más:

- ¿**TWA** (envolver la PWA, que es el camino barato) o algo nativo?
- ¿El aviso de no afiliación va con la lista de plataformas nombradas o genérico?
- ¿Se saca la cookie `sc_platforms`, que hoy no lee nadie?
- ¿Se arregla el respaldo `avatar_seed = user.id` antes de escribir la política?

### 8.c Arquitectura de las cuatro páginas

Todas estáticas, sin `localStorage`, sin gate de onboarding, enlazadas desde
`/cuenta/configuracion` y desde un pie nuevo.

```
app/privacidad/page.tsx      11 secciones de §4.a
app/terminos/page.tsx        11 secciones de §4.b
app/acerca-de/page.tsx       qué es Yump · atribución TMDB (logo + texto + link)
                             · atribución DiceBear (CC BY 4.0) · no afiliación
                             · contacto · versión
app/eliminar-cuenta/page.tsx el layout de §3.c; reusa <EliminarCuenta/>
components/legal/            <SeccionLegal>, <UltimaActualizacion>, <PieLegal>
```

### 8.d Recomendación sobre logos, en una línea

**Nombres en texto, en la tipografía de Yump, sin los colores de marca, más un
aviso de no afiliación.** Es la opción con menos riesgo, menos mantenimiento y
—esto es lo que no se ve a primera vista— **menos trabajo que lo que hay hoy**,
porque se borran quince reglas CSS en vez de agregar quince assets.

### 8.e Orden de implementación, por commits

| # | Commit | Depende de |
|---|---|---|
| 1 | `feat(legal): atribución de TMDB y DiceBear en /acerca-de` | nada — **es el que cierra un incumplimiento vigente, va primero** |
| 2 | `refactor(marcas): nombres neutros en lugar de wordmarks imitados` | decisión de logos |
| 3 | `feat(legal): /privacidad y /terminos` | decisiones 1-6 |
| 4 | `feat(cuenta): /eliminar-cuenta pública` | decisión 1-2 |
| 5 | `chore(privacidad): sacar la cookie sc_platforms y el avatar_seed = user.id` | decisión |
| 6 | `feat(pwa): assetlinks.json y build TWA` | huella de firma |
| 7 | `chore(play): capturas y materiales de la ficha` | commit 2 |
| 8 | `docs(play): Data Safety definitivo y guion para el revisor` | todas |

Los commits 1 y 2 **son independientes del alta en Play** y conviene hacerlos ya:
el 1 porque la app está publicada incumpliendo, el 2 porque manda las capturas.

### 8.f Criterio de aceptación de esta etapa

- [x] Inventario con las 15 categorías de datos que pediste, cada una con
      destino, uso, retención, borrado y tercero
- [x] Cada afirmación sobre un tercero **verificada contra su documentación
      oficial vigente y enlazada** — nada supuesto
- [x] Matriz de Data Safety con las categorías y finalidades exactas del
      formulario
- [x] Los puntos que dependen de una decisión tuya, marcados con ⚠️ y no
      resueltos por mi cuenta
- [x] Flujo de borrado verificado contra el código, con la respuesta a
      "¿solicitud o borrado inmediato?"
- [x] Requisitos de TMDB citados textualmente, incluida la corrección del texto
      obligatorio respecto del que me pasaste
- [x] Auditoría de marcas con la evidencia en CSS de que lo actual es imitación
- [x] Checklist de Play con estado y fuentes
- [ ] **Tu aprobación de esta auditoría antes de escribir una línea de código**
