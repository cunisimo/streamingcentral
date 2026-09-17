# Issues abiertos

## #22 — Recuperación desde Android: la contraseña nueva no permite ingresar

**Estado (11/09): la corrección está MERGEADA en `main` (`be5ef1d`),
PUSHEADA (`adf7065` en `origin/main`) y DESPLEGADA en Producción**
(deployment de Vercel `success`; `app.yump.ar` sirve la página nueva de
`/cuenta/reset`, comprobado contra los bytes del build). **Pendiente: la prueba
real del dueño por correo.** El issue sigue ABIERTO exclusivamente por la causa
desconocida del consumo del enlace original (ver "Lo que sigue ABIERTO"). Codex auditó
`de45b56` sin nuevos bloqueos técnicos y la consideró apta para mergear.

**Antecedente — revisión de la primera propuesta `fb89b45` (10/09), superada:
no cerrado ni aprobado para merge entonces.** Ver [auditoría independiente](medidas/2026-09-10-auditoria-fb89b45.md).
18 tests verdes, pero el token sin sujeto habilita formulario con sesión previa;
la identidad de escritura se comprueba sólo después de mutar. La reproducción
A/B de Claude prueba un defecto posible, no la causa histórica del intento del
dueño. Sigue pendiente el recorrido con correo real y el rechazo del enlace nuevo.

**Detalle del evento exitoso aportado posteriormente:** GET `/verify`, 303,
`auth_event.action=login`, timestamp explícito `2026-09-10T21:25:53Z`
(18:25:53 Argentina), referencia a `/cuenta/reset`. Incluye identidad de cuenta
e IP, omitidas aquí deliberadamente. `headers_user_agent` es null y no aparece
el tipo de verificación. Acredita un login registrado para una cuenta, no una
actualización de contraseña ni la recepción de sesión por el navegador del dueño.
No prueba scanner, tipo recovery ni correlación con el 403 posterior. Próximo
control: confirmar que la identidad del evento es la cuenta que se recuperaba;
buscar el evento PUT `/user` del intento que mostró éxito, con resultado y hora.

**Captura de Logs Auth aportada por el dueño (horas tal como aparecen en el
panel, sin asumir zona horaria):** 10/09 18:25:18 POST `/recover` 200;
18:25:53 GET `/verify` 303 con “Login: request completed” y evento Login;
18:26:08 GET `/verify` 403 “One-time token not found” y redirección 303;
18:26:39 y 18:26:46 POST `/token` 400 “Invalid login credentials”.
La secuencia es compatible con consumo previo del token, pero el listado no
permite correlacionar identidad/token entre eventos ni atribuir la primera
solicitud a un usuario, cliente de correo o scanner. No contradice la aclaración
del dueño de que no abrió antes el enlace. En el tramo visible no aparece una
actualización de contraseña (`PUT /user`); eso no demuestra que no haya ocurrido
en otro tramo o bajo un filtro. Próxima evidencia: detalles sanitizados de las
dos verificaciones (User-Agent, tipo recovery, identificadores de correlación)
y evento de actualización del intento que mostró éxito. No guardar tokens.

**Estado (11/09, cuarta versión): ABIERTO sólo por la causa. Una causa posible
reproducida y corregida en `fix/recuperacion-password`, mergeada en `main`
(`be5ef1d`) y desplegada; el consumo del enlace original sigue sin
explicación.** Informe con toda la evidencia:
`medidas/2026-09-10-recuperacion-password.md` (en esa rama). Auditoría de la
primera versión: `medidas/2026-09-10-auditoria-fb89b45.md`.

### Una causa posible, reproducida — no LA causa del incidente

`app/cuenta/reset/page.tsx` decidía con `ready && !user`: **cualquier sesión
abierta alcanzaba como prueba de recuperación**, y el error del enlace no se leía.
Con una sesión de la cuenta **A** en el navegador y un enlace **ya consumido de
B**, la página ofreció el formulario **para A** y le cambió la contraseña a A.
Verificado contra Auth: la original de A dejó de servir, la tipeada abre A, y B
quedó intacta.

⚠️ **Eso es compatible con los síntomas del dueño** ("la web dijo que salió bien
y la nueva no entra"), **pero no está demostrado que su cuenta haya pasado por esa
secuencia.** No hay `PUT /user` en el tramo visible de los logs y no se pudo
correlacionar cuenta ni token entre eventos.

### Lo que NO era, comprobado ejecutando

Mismo proyecto Supabase en web y Android; `NEXT_PUBLIC_SITE_URL` correcto;
`/cuenta/reset` en la allowlist; el cambio por API funciona; y **la plantilla del
correo es correcta, verificado con un correo real** (buzón descartable): un solo
enlace `/auth/v1/verify`, `type=recovery`, `redirect_to=https://app.yump.ar/cuenta/reset`,
SMTP propio `send.yump.ar`. Primera apertura entrega sesión; segunda devuelve
`otp_expired`, byte por byte la captura del dueño.

### El arreglo (segunda versión, tras la auditoría)

La primera versión (`fb89b45`) decidía con `type=recovery` en la URL y un JWT
decodificado sin verificar; la auditoría lo desarmó con
`#type=recovery&access_token=basura`, y comprobaba la identidad después de
escribir. Ahora:

- **La única prueba es el evento `PASSWORD_RECOVERY` de Supabase**, que auth-js
  2.108.2 emite sólo después de validar el token contra el servidor (`_getUser`).
  Ni la URL ni la sesión deciden.
- **La escritura va atada a esos tokens en un cliente aislado** (mismo patrón que
  `lib/eliminar-cuenta.ts`). Si otra pestaña cambia de cuenta antes de Guardar,
  el singleton apunta a otra persona y el cliente aislado no. Sin aceptación, no
  se escribe.

Verificado en navegador sobre **build de producción**: enlace válido sin sesión;
enlace válido de B con sesión de A; vencido/consumido; token basura con sesión;
doble apertura; y **cambio de sesión a A antes de Guardar → escribió en B, A
intacta**.

**Tercera ronda (10/09), tras la confirmación de Codex y un nuevo P1 de ciclo de
vida:** la aceptación quedaba en el provider global y se reutilizaba al volver a
`/cuenta/reset` sin enlace (tras salir, cerrar sesión o entrar como A). Ahora es
una autorización **reclamable por una sola instancia de la pantalla**: una
PENDIENTE global que muere al reclamarse, al salir de la ruta, ante cualquier
sesión de otra cuenta o `SIGNED_OUT`, y ante una URL en error; y una RECLAMADA
local a la pantalla, inmune al singleton (lo que conserva el escenario de la
otra pestaña). 18 tests nuevos escritos antes del cambio; escenarios 1, 3 y 6
verificados en navegador con navegación in-app real. `npm test` **1322/1322**;
`tsc` limpio; **build de producción exit 0 en 113 s** (el de Codex se había
interrumpido).

**Cuarta ronda (11/09), tras un nuevo P1 de Codex:** `PASSWORD_RECOVERY` creaba
la pendiente sin mirar la ruta — con la app en `/` (que es donde cae el hash en
el fallback histórico al Site URL) quedaba una pendiente que la navegación
posterior a `/cuenta/reset` conservaba y una pantalla sin enlace reclamaba.
Ahora la ruta viaja **en el evento de aceptación**, leída de
`window.location.pathname` en el instante de emitirlo (no de un cierre viejo),
y fuera de `/cuenta/reset` el reductor no deja nada. También se corrigió el
parpadeo previo a la reclamación (la pantalla sigue "cargando" mientras haya
una pendiente sin reclamar) y, al buscarlo, un parpadeo de hidratación medido:
el HTML servido decía "sin enlace" y un hard load con hash daba React #425/#418/#423;
ahora la decisión es "cargando" hasta `ready`. 13 tests antes del cambio;
verificado en navegador con el hash cayendo en `/` y en `/cuenta` (sin
formulario) y el control legítimo con cambio real (B nueva 200 / anteriores
400, A intacta). `npm test` **1337/1347** (10 omitidos); `tsc` limpio;
**build exit 0**, `BUILD_ID bQZrKvRAcxSMCBW8b9vKi`. Informe: §5.7 y §6.5.

### 🔴 Lo que sigue ABIERTO — y por qué no se cierra

1. **Qué consumió el enlace original del dueño.** No demostrado ni descartado. Un
   buzón descartable no tiene escáner ni vista previa; no se le pide al dueño que
   pruebe. **No se afirma escáner** por un `User-Agent` nulo.
2. **Bloqueo concreto de acceso:** la Management API (`/v1/projects/{ref}/config/auth`)
   devuelve `401` con el `SUPABASE_ACCESS_TOKEN` del entorno, y el MCP de Supabase
   responde `Unauthorized` en `query_logs` y `execute_sql`. Sin un token vigente no
   se puede leer `mailer_otp_exp`, la plantilla ni los logs de Auth con identidad
   y User-Agent por evento.
3. **El retorno nativo y los App Links** siguen siendo un problema aparte.

**Criterio de cierre:** el punto 1 demostrado o descartado con evidencia. Lo
demás ya está verificado y mergeado (nueva entra, vieja se rechaza, enlace
inválido y sesión previa manejados, cero escrituras sobre otra cuenta). El
punto 3 no forma parte de este issue.

**Prioridad: media. Estado: corrección mergeada y desplegada, a la espera de
la prueba real del dueño por correo; abierto por la causa del consumo del
enlace original.** Necesita un token vigente de Supabase
para leer logs y configuración de Auth.

### Antecedente — diagnóstico original del 10/09, previo al arreglo (histórico)

Recorrido informado: Olvidé mi contraseña en la app de Play → llega el correo
→ el enlace abre la web → intenta cambiar la contraseña → Android no la acepta.
La afirmación de que no impacta en la base es la interpretación del síntoma,
no una escritura fallida verificada por esta auditoría.

**Ampliación del dueño:** la web mostró que el cambio fue correcto, pero la
contraseña no permite ingresar en Android. Revisó Supabase y no vio un pedido
en la tabla del usuario; falta identificar si consultó Authentication/Users o
Table Editor. Este flujo no crea una fila de pedido en `profiles`. Pendientes:
ingreso nuevo en web en incógnito, mismo correo en ambos clientes y correo
mostrado por el formulario. No se solicitaron contraseñas ni enlaces con tokens.

**Segunda confirmación del dueño:** la contraseña nueva tampoco funciona al
ingresar desde la web en incógnito. La consulta de Supabase fue a una tabla común,
no Authentication. No recuerda qué correo mostraba el formulario. Esto descarta
que el síntoma esté limitado al ingreso Android; no demuestra aún un fallo de
escritura en Auth. Falta identificar la cuenta/sesión realmente actualizada y
el mensaje exacto del rechazo al ingresar. No afirmar una causa por falta de
una fila en la tabla común.

**Comprobado en código:**

**Corrección explícita del dueño y evidencia de URL:** copió el enlace directamente
del correo recién solicitado y lo abrió en incógnito, SIN abrirlo previamente en
una ventana normal. Descartar la explicación anterior de trasladar una URL ya
consumida. La captura final muestra `/cuenta/reset#error=access_denied` con
`error_code=otp_expired` y `error_description=Email link is invalid or has expired`.
Esto acredita rechazo de verificación de Supabase antes de establecer sesión,
no acredita expiración por tiempo ni consumo por el usuario. Investigar plantilla
del correo, configuración Auth, registros de verificación y eventual inspección
automática del enlace. Ninguna de esas causas está confirmada. Este intento no
llega a actualizar contraseña y debe distinguirse del primer intento con éxito
informado. No registrar tokens ni enlaces completos.

**Captura posterior del dueño:** la pantalla Nueva contraseña muestra “El enlace
no es válido o ya venció”. En el código esa rama sólo comprueba `ready && !user`;
no distingue expiración, token consumido, redirección incorrecta ni otros fallos
de inicialización. La captura acredita el mensaje, no su causa. Falta confirmar
si era un correo nuevo abierto por primera vez directamente en incógnito o un
enlace ya abierto antes. La hipótesis de sesión previa del intento original
sigue sin confirmarse.

- `components/AuthContext.tsx:115-119` construye el retorno con
  `NEXT_PUBLIC_SITE_URL` y `/cuenta/reset` (origin como fallback).
- El manifest Android sólo declara MAIN/LAUNCHER, sin filtro VIEW para esos
  enlaces. La apertura web concuerda con los App Links pendientes.
- `app/cuenta/reset/page.tsx:23-33` espera `updatePassword`, muestra el error si
  lo recibe y sólo muestra éxito si no hay error.
- `AuthContext.tsx:123-125` llama `auth.updateUser({ password })`: el cambio
  corresponde a Supabase Auth, no a una columna de `profiles`.
- El formulario habilita el cambio con cualquier `user` de Auth; no verifica
  un evento PASSWORD_RECOVERY ni muestra los errores del enlace explícitamente.
  Una sesión previa es una hipótesis a verificar, no la causa confirmada.
- `lib/supabase.ts:3-9` configura Auth con variables públicas del build. Que
  Android use la API de producción no demuestra por sí solo que sus variables
  de Supabase coincidan con las del deployment web.

**Evidencia faltante:** mensaje después de guardar y si el correo mostrado era
el esperado; ruta final sin tokens; estado/código de la respuesta de actualización
y del ingreso, identidad del proyecto Auth web/Android y validez de la sesión.
No registrar contraseñas, tokens ni enlaces de recuperación completos.

**Cierre propuesto entonces (superado por el "Criterio de cierre" de arriba):**
reproducir con cuenta de prueba autorizada, documentar la causa, verificar que
una recuperación nueva permite ingresar con la nueva contraseña en Android y web
y rechaza la anterior, además de manejar enlace inválido/vencido y sesión previa.
Todo eso ya está hecho y mergeado; queda sólo la causa. El retorno nativo se
evalúa por separado; no dar por arreglado el guardado sólo por implementar App
Links.

> **Revisión del 10/09 de los issues #17–#20** (#17 y #18 ya resueltos; el texto
> del #17 quedó en el informe de la Etapa 2, §18): conservar los riesgos abiertos,
> pero leer [la revisión independiente](medidas/2026-09-10-revision-capacidad-codex.md)
> antes de usar sus cifras o criterios de cierre. Corrige el conteo de claves,
> las unidades de concurrencia y el alcance de las pruebas; amplía la caída de
> Redis a fallos de escritura y documenta reintentos internos del SDK.

Pendientes con dueño, causa identificada y criterio de cierre. Si algo se
resuelve, se borra de acá (no se marca "hecho" y se deja).

---

## #1 — Lighthouse Performance 61 en móvil (objetivo: >90)

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-07-21

### Medición

Lighthouse 13.4.1, form-factor mobile, throttling simulate, contra
`next start` en local:

| Categoría | Score |
|---|---|
| Performance | **61** |
| Accessibility | 96 |
| Best Practices | 100 |
| SEO | 100 |

`FCP 1.6s · LCP 5.9s · TBT 600ms · CLS 0.054`

> Contexto: venía de 47. Subió a 61 al eliminar una recarga automática en
> `controllerchange` del Service Worker (ver `docs/PWA.md` §4). Ese era el único
> culpable atribuible al trabajo de PWA; lo que queda es preexistente.

### Culpables identificados

1. **`next/image` no se usa en ningún lado.** Es el principal. Hoy hay:
   - 10 lugares con `backgroundImage` en CSS: `TitleCard.tsx:13`,
     `DetailView.tsx:27`, `PersonCard.tsx:9`, `SearchView.tsx:70` y los 5 de
     `components/desempate/`.
   - 4 `<img>` crudos: `AvatarPicker.tsx:27`, `PlatformLogo.tsx`,
     `TopBar.tsx:36`, `UserHub.tsx:16`.

   Consecuencias: sin AVIF/WebP, sin `srcset` por densidad, sin `width`/`height`
   explícitos, sin lazy nativo, sin `priority` en el LCP. El
   `remotePatterns` de `next.config.mjs` está configurado pero no lo usa nadie.

2. **Cadena larga hasta el LCP.** Las páginas son shells estáticos que hidratan,
   recién ahí piden `/api/*`, y esas rutas a su vez pegan a TMDB. El póster que
   define el LCP no puede empezar a bajar hasta que se completa esa cadena. Por
   eso LCP 5.9s con FCP 1.6s: el contenido pinta rápido, la imagen grande no.

3. **Trabajo de main thread alto.** ~2s de ejecución de JS. La Home hidrata 21
   rieles más el resto de client components.

### Posibles líneas de trabajo (sin decidir)

- Migrar `TitleCard` a `next/image` con `sizes` correcto y `priority` en las
  primeras cards. Es el cambio de mayor impacto por unidad de esfuerzo.
- Dar `width`/`height` a todo lo que hoy es `backgroundImage` para reservar
  espacio (también ayuda a CLS).
- Evaluar server-side de la primera pantalla (RSC + streaming) para acortar la
  cadena del LCP. Es el cambio más grande y toca arquitectura.
- Reducir el número de rieles montados de entrada en la Home.

### Criterio de cierre

Performance > 90 en Lighthouse mobile contra un build de producción, sin haber
roto las estrategias de caché del SW (`/api/*` sigue Network Only).

### No confundir con

Esto **no** es un problema de PWA. Las estrategias del Service Worker no afectan
estas métricas: Lighthouse corre con perfil limpio, sin SW previo.

---

## #2 — `--faint` no cumple contraste WCAG AA

**Estado:** abierto · **Prioridad:** baja · **Abierto:** 2026-07-21

`--faint: #9A9EA6` sobre `--bg: #F5F5F2` da **2.46:1**. WCAG AA exige 4.5:1 para
texto normal. Es el **único** ítem que Lighthouse marca en accesibilidad
(`color-contrast`), y por eso el score queda en 96 y no en 100.

Se usa en textos secundarios y contadores (`globals.css`, buscar `var(--faint)`).

**Criterio de cierre:** el audit `color-contrast` pasa y Accessibility llega a
100, sin que el token pierda su rol visual de "texto atenuado".

---

## #3 — Caminos de red sin ejercitar en la verificación de la PWA

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-07-21

Toda la verificación offline se hizo **apagando el servidor**, nunca la red. Eso
deja dos zonas sin ejercitar:

### 3.a — `navigator.onLine` y el listener `online`

Con el servidor caído, `navigator.onLine` sigue en `true`. Nunca se ejecutaron:

- La rama `!online` de `CatalogView` (el estado offline por modo avión). Lo que sí
  se probó es la otra señal, `fetchFailed`, que es la que disparó en las pruebas.
- El listener `online` de `hooks/useOnline.ts`.
- El reintento automático de `OfflineState` en la transición offline→online
  (`prevOnline.current` false → true).

**Cómo cerrarlo:** dispositivo real en modo avión, o DevTools → Network →
Offline (que sí fuerza `navigator.onLine = false`, a diferencia de matar el
servidor).

### 3.b — Lie-fi más allá del timeout

`networkFirst` tiene una carrera contra 4s verificada con una ruta que cuelga 30s
(sirvió `offline.html` a los 4019ms). Lo que **no** está cubierto:

- Conexión que entrega bytes muy lentamente en vez de colgarse del todo: el
  `fetch` resuelve headers rápido y el body gotea. El timeout actual corre contra
  la resolución de la promesa de `fetch`, no contra la descarga del body.
- `cacheFirst` (assets de Next, imágenes TMDB) **no tiene timeout**. En lie-fi, un
  asset no cacheado puede colgar indefinidamente. No rompe la navegación (el
  documento sí tiene timeout) pero puede dejar la página a medio pintar.
- Elegir 4000ms fue un criterio, no una medición. Sin datos de red real no se
  sabe si es agresivo o permisivo para el usuario típico en Argentina.

**Criterio de cierre:** decidir si `cacheFirst` necesita timeout, y validar el
valor de `NETWORK_TIMEOUT_MS` contra una traza de red real (DevTools → Slow 3G o
mejor, un dispositivo en condiciones malas).

---

## #4 — Fechas calculadas en UTC: la app se adelanta 3 horas

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-08-15

`dailySeed()` ya se pasó a `America/Argentina/Buenos_Aires` (commit `4289677`),
pero quedaron otros cálculos de fecha en UTC. Todos comparten el mismo defecto:
entre las **21:00 y la medianoche** de Argentina, la app cree que ya es mañana.

Esa franja es justo cuando la gente elige qué ver, así que el bug cae en el peor
horario posible.

### Lugares y efecto de cada uno

| Dónde | Qué hace | Efecto entre las 21 y las 24 |
|---|---|---|
| [`DetailView.tsx:52`](../components/DetailView.tsx) | `porEstrenar` compara `releaseDate > hoy(UTC)` | **El más visible.** Un estreno de mañana pasa a contar como de hoy, así que "Recordarme" desaparece de la ficha tres horas antes de tiempo — justo la noche anterior, que es cuando más sentido tiene agendarlo |
| [`enrich.ts:34`](../lib/enrich.ts) | `today()`, usado para acotar listados por fecha | Un título que estrena mañana puede entrar o salir del listado antes de tiempo. Impacto menor: cambia el borde de un listado, no un dato que el usuario se lleve |
| [`sync-upcoming.ts:11`](../supabase/functions/tmdb-sync/jobs/sync-upcoming.ts) | `iso()` para la ventana de estrenos que se ingesta | Corre en la edge function de Supabase, **otro runtime**: hay que verificar qué zona horaria tiene antes de asumir que se arregla igual que el resto |

### Lo que se revisó y NO es un problema

`lib/calendar-links.ts` y `lib/ics.ts` **no tienen el bug**, y conviene dejarlo
escrito para no volver a investigarlo:

- La fecha del evento (`e.fecha`) es un `YYYY-MM-DD` que viene tal cual de TMDB
  (`release_date` / `first_air_date`). Es un día de calendario, no un instante,
  y `/api/recordatorio` lo pasa sin tocarlo: no hay ningún `new Date()` en el
  camino que decida el día del evento.
- `diaSiguiente()` hace aritmética en UTC (`T00:00:00Z` + 1 día), pero sobre un
  valor que ya es solo-fecha y en un huso sin horario de verano: sumar un día da
  el día siguiente exacto, sin corrimiento posible.
- Los dos generadores emiten eventos de **día completo** (`DTSTART;VALUE=DATE` en
  el .ics, `dates=AAAAMMDD/AAAAMMDD` en Google). Un valor de tipo DATE no lleva
  huso: el calendario lo muestra en ese día calendario, sea cual sea la zona del
  usuario y la hora a la que lo haya agregado.
- El único valor en UTC es `DTSTAMP`, que el RFC 5545 **exige** en UTC.

O sea: agregar un recordatorio a las 23:00 guarda el evento en el día correcto.
No hay dato erróneo escapando a un calendario ajeno.

**Criterio de cierre:** que `porEstrenar` y `today()` calculen con la fecha
argentina (el helper de `dailySeed()` en `lib/cache.ts` ya la resuelve, pero es
`server-only` y `DetailView` es cliente: hace falta un helper compartido), y que
se verifique la zona horaria del runtime de la edge function antes de tocar
`sync-upcoming`.

---

## #5 — ¿"Próximamente" muestra el estreno en cine o la llegada a streaming?

**Estado:** abierto · **Prioridad:** alta · **Abierto:** 2026-08-15
**Tipo:** decisión de producto, no bug de implementación

### La pregunta

Yump es una app de streaming: no muestra cine ni TV abierta. Entonces la agenda
debería contestar *"¿cuándo puedo verla?"*, no *"¿cuándo se estrena en el
mundo?"*. Si la respuesta es la primera —y todo indica que sí—, hoy la agenda
está contestando la pregunta equivocada, y eso arrastra dos consecuencias que
hay que decidir explícitamente:

1. **Una película no debería aparecer en la agenda hasta su fecha digital.**
   *The Fantastic 4* tiene estreno en cine el 2025-07-23 y llegada a digital en
   AR el 2025-11-05. Con el criterio actual entra a la agenda en julio y el
   recordatorio apunta a julio: **tres meses y medio antes** de que se pueda ver.
2. **Cambia qué se ingesta.** El sync descubre películas con
   `primary_release_date`, así que la ventana de la agenda es de estrenos de
   cine. Cambiar el criterio cambia el contenido de `upcoming_content`.

### De dónde sale la fecha hoy

| Camino | Campo | Qué es |
|---|---|---|
| Agenda (principal) | `upcoming_content.release_date`, que el sync llena con `discover(primary_release_date.*)` **sin `region`** | La fecha más temprana del mundo: normalmente premiere o estreno en cine |
| Ficha (fallback) | `titleDetails().release_date` **sin `region`** | Lo mismo |
| Series | `next_episode_to_air.air_date` | El episodio real. En originales de plataforma el estreno es simultáneo mundial, así que suele coincidir |

Comprobado contra TMDB:

| Título | Lo que usa la app | AR cine | AR digital |
|---|---|---|---|
| Superman | 2025-07-09 | 2025-07-10 | — |
| The Fantastic 4 | 2025-07-23 | 2025-07-24 | 2025-11-05 |

### El problema que hay que resolver, no solo el que hay que arreglar

**La fecha digital de TMDB falta seguido** — mirá que Superman ni siquiera la
tiene. Así que no alcanza con "usar el tipo 4": hay que decidir qué pasa cuando
ese dato no existe. Tres caminos, y ninguno es obviamente mejor:

- **Mostrar la de cine igual**, aclarando en la UI que es el estreno en cine y
  no la llegada a streaming. Mantiene el catálogo lleno; el costo es que la
  agenda mezcla dos cosas distintas y el usuario tiene que leer la letra chica.
- **No mostrar fecha**, solo el título como "próximamente, sin fecha". Honesto,
  pero un ítem de agenda sin fecha no se puede agendar y sirve poco.
- **Excluir el título** hasta que TMDB publique la digital. Es lo más fiel a
  "app de streaming", y el costo es una agenda bastante más chica — con qué
  frecuencia, hay que medirlo antes de decidir.

Medir cuántos títulos de la ventana actual tienen fecha digital AR es el primer
paso: sin ese número, elegir entre las tres opciones es a ciegas.

### Mitigación ya aplicada (no cierra el issue)

Para que el problema no llegue a producción mientras se decide:

- **Ficha**: en películas, "Recordarme" solo aparece si TMDB da la fecha digital
  argentina (`digitalAR` en `UITitleDetail`, tipo 4 de `release_dates`). No
  cuesta requests extra: `titleDetails` ya traía `release_dates` para la
  certificación por edad.
- **Agenda**: en películas no se ofrece "Recordarme" y punto, porque el payload
  de `upcoming_content` no tiene con qué validar la fecha. Es deliberadamente
  conservador. Hoy no oculta nada: la agenda son 41 series y ninguna película.

- **Lo que se agenda**: cuando el botón sí aparece, tanto el link de Google como
  el `.ics` usan la fecha digital argentina. La ruta `/api/recordatorio` la
  resuelve por su cuenta —no confía en `upcoming_content`, que guarda la del
  sync— y devuelve 404 si no existe. Verificado: *The Fantastic 4* agenda
  `20251105` y no `20250723`; *Superman*, sin fecha digital, da 404; las series
  no cambian.

**Ojo con lo que la mitigación NO hace**: no toca el sync ni la semántica de la
agenda. `upcoming_content` se sigue llenando con fechas de cine, así que una
película puede aparecer en "Próximamente" meses antes de que se pueda ver —
simplemente ya no se puede agendar con la fecha equivocada. Eso es lo que
resuelve este issue.

**Criterio de cierre:** decidir qué fecha representa "Próximamente", medir la
cobertura real de la fecha digital AR en la ventana de ingesta, y aplicar la
decisión en el sync, en la agenda y en el `.ics` a la vez.

---

## #6 — "Próximamente" mezcla estrenos con episodios semanales

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-08-15
**Tipo:** decisión de producto · **Familia:** issue #5

### La pregunta

*Star Trek: Strange New Worlds* y *La Patrulla Canina* no son estrenos: son
series al aire con un episodio nuevo. Hoy conviven en el mismo riel con
películas que sí se estrenan. **¿"Próximamente" significa "esto es nuevo" o
"esto tiene episodio esta semana"?**

Son dos listas distintas con dos usos distintos:

- *"Esto es nuevo"* responde **qué empieza**: estrenos de película y de
  temporada. Es una agenda de descubrimiento; se mira una vez por semana.
- *"Esto tiene episodio"* responde **qué sale hoy** de lo que ya sigo. Es
  seguimiento, no descubrimiento; se mira a diario, y sin saber qué mira el
  usuario es ruido.

Mezcladas, la sección no contesta bien ninguna de las dos: un episodio 148 de
*Gran hermano* ocupa el mismo lugar visual que el estreno de una película.

### Datos para decidir

El sync ya distingue `is_season_premiere`, así que separar estreno de temporada
de episodio suelto **no requiere datos nuevos**: la columna está. Medido el
2026-08-15, de 41 filas de `upcoming_content` **41 eran series** y ninguna
película, así que hoy el riel es 100% seguimiento y 0% descubrimiento — que es
exactamente lo contrario de lo que promete el título de la sección.

Ojo con la interacción con el issue #5: si la agenda pasa a mostrar películas
por fecha digital, la mezcla se corrige sola en parte. Conviene decidir los dos
juntos.

### Opciones

- **Dos rieles**: "Estrenos" (películas + estrenos de temporada, vía
  `is_season_premiere`) y "Episodios de esta semana". El costo es más superficie
  en el Home.
- **Un riel, solo estrenos**: los episodios sueltos salen. Lo más simple; el
  costo es que hoy dejaría la sección casi vacía hasta que entren películas.
- **Un riel, con el episodio como dato secundario**: se muestra igual pero la
  card distingue visualmente estreno de episodio.

**Criterio de cierre:** decidir qué pregunta contesta la sección, y si los
episodios semanales merecen su propio lugar o dependen de que el usuario siga la
serie (lo que los ata al módulo de listas del usuario).

---

## #7 — `upcoming_content`: las filas que ya están se quedan viejas

**Estado:** abierto · **Prioridad:** alta · **Abierto:** 2026-08-15

Una fila deja de refrescarse y queda con datos **equivocados**, no solo vencidos.
Medido el 2026-08-15: la tabla decía que *Star Trek: Strange New Worlds* daba
T4 E4 el 13, cuando TMDB ya daba T4 E5 el 20. `updated_at` era del 8, con el
sync habiendo corrido ese mismo día a las 06:00.

Pasa porque el sync solo escribe lo que **descubre**, y el descubrimiento no
garantiza volver a pasar por un título que ya está en la tabla (ver #8).

**Arreglo propuesto:** una pasada de refresco aparte del descubrimiento, que para
cada fila existente vuelva a pedir su `next_episode_to_air` y actualice fecha,
temporada y episodio. Son ~41 llamadas con el volumen actual.

**Lo que este arreglo NO resuelve:** traer títulos que nunca entraron. Eso es #8,
y por eso están separados: si se hacen juntos, se implementa el refresco y se da
el problema por cerrado.

**Criterio de cierre:** ninguna fila de `upcoming_content` con `updated_at`
anterior a la última corrida del sync.

---

## #8 — `upcoming_content`: sesgo permanente hacia lo popular

**Estado: CORREGIDO e INTEGRADO** el 2026-09-01 desde
`fix/proximamente-sin-popularidad` · **Abierto:** 2026-08-15

Corregido **en lo que este issue describe**: el descubrimiento ya no ordena ni
corta por popularidad. Lo que el issue pedía definir —qué DEBERÍA contener la
agenda— quedó decidido por el dueño: **todos los estrenos de la ventana de 90
días que TMDB confirme con `flatrate` argentino**, unos 255.

### El arreglo

El descubrimiento **ya no ordena ni corta por popularidad**. Se recorre la
ventana entera hasta `total_pages`, ordenando por fecha, y el filtro de
proveedor argentino se aplica dentro del propio `discover`.

🔴 **Lo que NO cambió, y es la decisión del dueño:** la exigencia de un
`flatrate` confirmado para Argentina se conserva intacta. No se usa
`oficial-probable` para títulos futuros, no se infiere disponibilidad por
`network + homepage`, y no entra nada que TMDB todavía no asocie a un proveedor
argentino. Esto corrige **qué se mira**, no qué califica.

**Por qué el filtro va en el `discover` y no después.** Recorrer la ventana sin
filtrar costaría 95 páginas + 1900 `tvDetails` + 1900 `watch/providers`. Con el
filtro adentro son 13 páginas y 259 títulos. Sólo vale si no pierde nada, así
que se midió contra el camino viejo: de las 36 series que conservaba pierde
**0**, y de un muestreo de la COLA que el código viejo no miraba nunca —páginas
20, 40, 60, 80 y 95— pierde **0** de las 20 con proveedor AR.

⚠️ La lista de proveedores se le pide a TMDB en cada corrida (58 ids de AR), no
se toma de `lib/providers-ar.ts`: el filtro final acepta CUALQUIER `flatrate`
argentino, y usar los 20 ids que Yump mapea dejaría afuera 7 series y 1 película.

### Costo medido (2026-08-31, ventana de 90 días)

| | Antes | Primera versión | **Optimizado** |
|---|---|---|---|
| Páginas de discover | 6 (3 + 3) | 14 (1 + 13) | **14** |
| Llamadas a TMDB | ~186 | 530 | **277** |
| Títulos crudos | 120 | 261 | 261 |
| Únicos tras dedup | 120 | 255 | 255 |
| **Filas escritas** | **36** | 255 | **255** |
| Duración | sin medir | 26,7 s | **17,1 s** |

Siete veces más agenda por 1,5 veces más llamadas que el camino viejo.

**De dónde salió la mitad de las llamadas.** El sync pedía DOS cosas por serie:
`/tv/{id}` para el `next_episode_to_air` y `/tv/{id}/watch/providers` para el
filtro argentino. Con `append_to_response=watch/providers` vienen juntas, y con
259 series eso son 259 pedidos en vez de 518.

Se midió antes de tomarlo, sobre 20 series reales del propio discover del sync:
**proveedores AR idénticos en 20 de 20**, y los campos que el sync usa
—`air_date`, `season_number`, `episode_number` y `name` del próximo episodio,
más `status`— idénticos en 20 de 20. Los bytes son los mismos (35.085 B sumando
las dos respuestas contra 35.094 B en una): se transfiere lo mismo en un pedido
en vez de dos.

⚠️ **Una serie parecía diferir y NO era `append_to_response`.** `tv:615` daba
`vote_average` 6 contra 5,5 y `vote_count` 1 contra 2 **del próximo episodio**,
entre dos llamadas con segundos de diferencia. Es un dato vivo y el sync no lo
usa; el control —dos llamadas separadas seguidas— dio idéntico. Conviene tenerlo
presente antes de leer un diff contra una respuesta guardada.

El filtro final acepta **255 de 255**: no rechaza nada porque el `discover` ya
filtró, pero no es redundante — es de donde salen los proveedores de cada fila
para el join, y ahora 253 de esos 255 ya vienen resueltos del detalle.

### Qué escribe una corrida, y por qué NO se agregó un diff

El cron corre **una vez por día** (`0 6 * * *`, pg_cron). Cada corrida:

| Tabla | Operación | Filas |
|---|---|---|
| `providers` | upsert por `id` | ≤ 58 |
| `upcoming_content` | upsert por `tmdb_id,media_type` | **255** |
| `upcoming_content_providers` | delete de los links + insert | ~255 borrados + ~300 insertados |
| `upcoming_content` | delete de lo que perdió sus proveedores (`aBorrar`) | variable |
| `upcoming_content` | delete de lo vencido (`release_date < hoy − 2`) | variable |

**Las filas NO se acumulan indefinidamente**: el conjunto está acotado por la
ventana de 90 días y por el borrado de vencidos. Hoy la agenda tiene **44 filas**
(medidas por la API pública, sin tocar la base); después del cambio quedaría en
torno a **255**.

**Se reescriben casi todas, todos los días.** Medido: de una ventana a la del día
siguiente, **256 de 259 series son las mismas (98,8%)**; salen 3 y entran 2. Y
como el payload lleva `updated_at`, cada fila es un UPDATE real aunque el
contenido no haya cambiado.

🔴 **Aun así no se agregó detección de cambios, a propósito.** El ahorro serían
~250 UPDATE por día (~7.500 al mes), que es insignificante para Postgres, y
`updated_at` es **el criterio de cierre del issue #7** ("ninguna fila con
`updated_at` anterior a la última corrida"). Un diff lo volvería inútil. La
complejidad no se paga.

⚠️ Lo que **no** se pudo medir: cuántas de esas 255 tienen además el episodio
cambiado. Requiere leer la tabla, y esta tanda no ejecuta SQL.

### Presupuesto

| | Antes | Optimizado | Margen |
|---|---|---|---|
| **TMDB** | ~186/día · ~5.580/mes | **277/día · ~8.310/mes** | el límite publicado es de ~50 req/s, no diario; **no pude verificar una cuota diaria** |
| **Supabase Edge** — invocaciones | 1/día · 30/mes | **igual** | 30 sobre 500.000/mes del plan gratuito |
| **Supabase Edge** — duración | sin medir | **17,1 s** | no pude verificar el tope de wall-clock del plan desde el repo |
| **Supabase DB** — filas | 44 | **~255** | ~255 KB; acotado por la ventana, no crece sin fin |
| **Supabase DB** — escrituras | ~36 upsert/día | **~255 upsert + ~555 de links por día** | ~24.000 operaciones al mes |
| **Vercel** | — | **sin invocaciones nuevas** | `/api/upcoming` devuelve ~6× más filas: sube el payload, no la cantidad de pedidos |
| **Upstash** | — | **cero** | `/api/upcoming` es `force-dynamic` y no cachea |

**No es costo cero**: suben las llamadas a TMDB (1,5×), la duración y las
escrituras. Lo que sí se puede afirmar es que nada de eso se acerca a un límite
conocido; los dos límites que **no** pude verificar están marcados arriba.

### La decisión del dueño (2026-09-01), después de medir 255 contra 120

Se evaluó acotar a los 120 estrenos más próximos y **se descartó con datos**. Ver
`docs/medidas/2026-08-31-proximamente-255-vs-120.md`; lo esencial:

- **El read-path ya está capado en 100** (`Math.min(limit, 100)` en la ruta,
  `limit ?? 100` en `upcomingList`). Con 255 filas o con 120, el cliente recibe
  exactamente lo mismo: **15 en el Home y 100 en `/proximamente`**. La
  comparación de payload entre las dos alternativas es nula por construcción.
- **Acotar a 120 no ahorra llamadas** si se respeta el criterio de fecha: hay que
  evaluar los 259 para saber cuáles son los 120 más próximos.
- La única variante que sí ahorra —cortar el recorrido en la página 7— **elige
  por antigüedad de la serie**, no por fecha de estreno: `discover/tv` ordena por
  `first_air_date` (el estreno ORIGINAL) y TMDB no tiene `sort_by` por
  `next_episode_to_air`. Mediana 2020 contra 2024, sin películas, y sólo **56 de
  sus 120** son de los realmente más próximos.

**Queda decidido:** ventana de 90 días, sin corte por popularidad, sin corte
anticipado del recorrido, sólo títulos con `flatrate` argentino confirmado,
límites de lectura **15 / 100 sin tocar** y **sin paginación ni "Cargar más" en
la interfaz en esta tanda**. Costo aceptado: ~277 llamadas diarias, 10–17 s y
~255 filas. **Vercel y Upstash no cambian**: el endpoint es `force-dynamic`, no
cachea, y el tope de 100 hace que el payload servido sea el mismo de antes.

### Cómo salió en Producción (2026-09-01, función v8)

Primera sincronización controlada, ventana `2026-09-01` → `2026-11-30`:

| | |
|---|---|
| Candidatos evaluados / conservados | 251 / **251** |
| Filas escritas (`upserted`) | 251 |
| Proveedores distintos | 23 |
| Borrados (`dropped` / `deleted`) | 0 / 0 |
| Duración real | **23,3 s** |
| Fallos de idioma | 0 |

⚠️ **Duró 23,3 s, no 10–17.** Lo medido en local desde Argentina fue 10–17 s; la
función corre en `us-west-2` y paga otra latencia contra TMDB. Sigue holgado,
pero el número que hay que usar de referencia es el de Producción.

⚠️ **251 escritas, 244 visibles.** `upcomingList` filtra por las 14 plataformas
que la app mapea, y el sync acepta CUALQUIER `flatrate` argentino: 7 filas tienen
sólo proveedores que Yump no muestra. Es la diferencia esperada entre los 58 ids
de AR y los 20 soportados, y no es un error — son filas correctas sin logo que
mostrar.

⚠️ **`?limit=100` devuelve 97, no 100.** El tope se aplica en la consulta y el
filtro de plataformas soportadas después, así que unas pocas de las 100 traídas
se caen. Es comportamiento previo, no de esta tanda.

⚠️ Con el tope de 100, las filas 101–255 **hoy no las lee nadie**: las dos rutas
que podrían leerlas (`?items=` de la watchlist y `?month=`) existen pero no están
cableadas en ningún cliente. No cuestan casi nada y quedan listas; mientras
tanto, son inventario sin lector.

### Limitación residual de la fuente

- **TMDB rechaza `page` por encima de 500.** Es límite de la fuente, no una
  decisión nuestra. Con la ventana actual sobra (13 páginas), pero **ampliar
  `SYNC_WINDOW_DAYS` escala esto de forma lineal**: si alguna vez la ventana
  llegara al tope habría que particionar por fechas, no subir un número.
- **El filtro temprano depende del índice de proveedores del `discover`.** Si
  TMDB atrasa ese índice respecto de `watch/providers`, se perderían títulos. Se
  midieron 56 casos con proveedor AR (36 + 20) y **0 pérdidas**, pero no hay
  forma de descartarlo del todo.
- **Las películas siguen casi vacías, y NO es culpa de la paginación**: de 120
  muestreadas a lo largo de las 130 páginas de la ventana, **0** tenían proveedor
  argentino. La ventana entera tiene 2. Es el catálogo de TMDB, y es el mismo
  agujero del issue #16.
- ⚠️ **Los tipos de la Edge Function no pasan por ningún typechecker LOCAL.**
  `tsconfig.json` excluye `supabase/functions`, no hay CI, y Deno no está
  instalado en la máquina de desarrollo. **Sí existe un
  `supabase/functions/tmdb-sync/deno.json`**, pero es sólo el mapa de
  importaciones (`@supabase/supabase-js` desde esm.sh); no configura un chequeo.
  Lo que SÍ se verifica en local: los módulos sin dependencias de Deno
  (`descubrir.ts`, `reconciliar.ts`, `reparar.ts`) se importan y **se ejecutan de
  verdad** en `npm test`, y un barrido falla si la función usa `require`,
  `node:`, `process.env`, `__dirname` o `Buffer`. Lo que NO: los tipos de
  `sync-upcoming.ts`. La red de seguridad real es el despliegue, que compila la
  función en Supabase y falla si algo no cierra.

### `tv:310290` sigue AFUERA, y está bien

"Mis muertos tristes" **no se resolvió** y no hay que presentarla como
resuelta. Su popularidad (1.761) ya no la deja afuera —ese corte no existe más—
pero **TMDB no le informa `flatrate` en ninguna región**, así que el filtro que
el dueño decidió conservar la descarta. El día que TMDB publique su proveedor
argentino entra sola, sin tocar una línea. Hay un test que usa sus datos como
fixture para fijar las dos mitades; **no hay ningún id hardcodeado** en el
código productivo.

`collectSeries` descubre con `discover/tv` ordenado por **popularidad** y
`MAX_PAGES = 3`. Medido el 2026-08-15 con la consulta exacta del sync:

```
1696 series elegibles en 85 páginas · el sync mira 3 (= 60)
Star Trek: Strange New Worlds → fuera del top 60
Doctor Who                    → fuera del top 60
```

**Una serie que nunca estuvo en el top 60 no entra nunca**, y la pasada de
refresco de #7 no la va a traer, porque solo refresca lo que ya está.

La consecuencia de fondo es sobre qué ES la tabla: no es "la agenda de
estrenos", es **lo que estaba en el top 60 el día en que se escribió cada fila**.
Las filas son sedimento de días distintos, no una foto coherente, y como el
ranking de popularidad fluctúa a diario, los títulos entran y salen sin patrón.

Es justo lo contrario de lo que se busca en el pipeline de curado, donde el
criterio es la calidad y la cobertura, no la popularidad.

**Lo que NO es el arreglo:** subir `MAX_PAGES` a 85. Serían 1696 llamadas de
detalle por corrida, porque cada serie descubierta necesita su propio
`tvDetails` para el `next_episode_to_air`.

### La SEGUNDA causa, medida el 2026-08-31 — son dos, no una

Arreglar el descubrimiento **no alcanza**, y esto se confirmó siguiendo un caso
concreto (`tv:310290`, "Mis muertos tristes") que no aparecía en la agenda:

1. **Descubrimiento** — lo de arriba. Su popularidad es **1.761** contra un corte
   de **69.99** en la página 3. No entra ni pidiendo la página 50 de 95.
2. **Filtrado** — `sync-upcoming.ts:224`: `if (!provs[j].length) continue`. Un
   título **sin proveedor `AR` en `watch/providers` se descarta**, y éste no
   tiene `flatrate` en ninguna región.

🔴 **La segunda causa es la misma que el issue #16**, y por eso importa: el
catálogo regional de TMDB llega tarde en los estrenos, que es exactamente cuando
la agenda de "Próximamente" tiene que mostrarlos. La resolución de
disponibilidad ya sabe recuperar estos casos con evidencia oficial; **el sync no
la usa**, porque corre en una Edge Function aparte.

**Sigue abierto y no se tocó** — la corrección de disponibilidad del 2026-08-31
no lo alcanza.

**Criterio de cierre:** definir qué debería contener la agenda —¿todo lo que
estrena en las plataformas soportadas? ¿un recorte con criterio?— y que la
pertenencia no dependa del ranking de popularidad del día.

---

## #9 — La popularidad es el orden por defecto en toda la app, sin haberlo decidido

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-08-15

`discover()` tiene `sort_by: popularity.desc` como default
([`lib/tmdb.ts:122`](../lib/tmdb.ts)). Cada superficie que no eligió un orden
explícito quedó siendo, sin decidirlo, un listado de lo más popular — y como
además casi todas piden **una sola página**, terminan mostrando el top 20 de un
catálogo de cientos.

Es el mismo patrón que causó los superhéroes en Sci-fi (#ver historial) y el
sesgo de `upcoming_content` (#8). Auditado el 2026-08-15:

| Superficie | Orden | Páginas | Universo real |
|---|---|---|---|
| Carruseles de audiencia (`audienceTitles`) | popularidad (default) | **1** | top 20 por tipo, sin mezcla ni paginado |
| Hero / recomendador (`recommendations`) | popularidad (default) | **1** | 40 enriquecidos → se muestran 6 |
| Chips curados, tramo de relleno | popularidad (default) | **1** | top 20 |
| Rieles de género del Home | popularidad (default) | 3 + mezcla del día | 60 de ~406 |
| Sync de series (`collectSeries`) | popularidad explícita | 3 | 60 de 1696 |
| `/categoria/[slug]` | popularidad (default) | paginado por el usuario | cobertura completa |
| `top:pop:` | popularidad **explícita** | 1 | correcto: la sección ES un ranking |
| `latestReleases` | fecha explícita | 1-2 | correcto |
| Sync de películas (`collectMovies`) | fecha explícita | 3 | correcto para una agenda |

Los dos últimos bloques muestran que el problema no es la popularidad en sí:
donde se eligió un orden a propósito, está bien. El problema es el **default
silencioso**: nadie decidió que "Para toda la familia" fuera un ranking de
popularidad, quedó así porque nadie eligió otra cosa.

### Prioridad: los carruseles de audiencia primero

Por encima de los rieles de género, aunque el bug de los superhéroes se haya
visto ahí antes. La diferencia es que **"Para toda la familia" no cambia nunca**:
es el top 20 de la página 1, sin mezcla diaria y sin paginado, así que muestra lo
mismo hoy que mañana y lo mismo a todos los usuarios con las mismas plataformas.
Los rieles de género, con sus tres páginas y la mezcla del día, al menos barajan
60 títulos y rotan.

Un carrusel que no rota es peor que uno mal ordenado: el usuario que vuelve ve
exactamente la misma pantalla, que es el problema que la app dice resolver.

### Regla de decisión sobre la calidad, escrita ANTES de medir

Rotar el eje de extracción baja el promedio de nota, y eso **no significa que el
Home haya empeorado**: lo de antes eran los 20 más populares, una lista angosta
y por definición bien puntuada. Comparar contra ese promedio castiga cualquier
apertura del catálogo.

Queda fijada así, para no discutirla con el número a la vista:

> **El promedio de nota es orientativo. El guardarraíl es cuánto queda bajo 6.0.**
> Se acepta una caída del promedio mayor al 5 % mientras lo que está bajo 6.0 no
> supere el **8 %** de las tarjetas. Si lo supera, se revisan los ejes — no se
> ajusta el umbral.

**Criterio de cierre:** que `sort_by` deje de tener valor por defecto en
`discover()` y pase a ser un parámetro **obligatorio**. Una convención de "que
cada superficie declare su orden" se olvida en el próximo agregado; un parámetro
requerido no se puede saltear — el compilador obliga a decidir. Y que las
superficies de descubrimiento (audiencia, hero, chips) muestreen de un pool más
profundo en vez del top 20 de la página 1.

---

## #10 — La rotación de ejes no le llega a los chips angostos

**Estado:** abierto · **Prioridad:** baja · **Abierto:** 2026-08-16

El guard de `candidatosConEje` ([`lib/pools.ts`](../lib/pools.ts)) evita que un
eje que no puede llenar deje una superficie vacía, cayendo a `pop` páginas 1-3.
Eso arregla el bug, pero deja una limitación que conviene tener escrita antes de
que alguien lea "cobertura semanal 236" y crea que vale para todo.

### La medición

En la corrida de 16 chips × 7 días (112 casillas), el guard **saltó 18 veces**:
uno de cada seis días de chip termina en `pop`. Y no está repartido parejo — se
concentra siempre en los mismos:

| Superficie | Por qué cae |
|---|---|
| `aliens`, `espacio`, `guerra` | 15-72 títulos por plataforma: `hondo` (página 4) vuelve vacío |
| `scifi/tv`, `fantasia/tv`, `terror/tv` | 4-22 títulos: caen por `hondo` y por `top` |
| `espacio/tv`, `aliens/tv` | 9 y 13 sobre el piso de 300 votos: caen por `top` |

O sea que los chips que **más** necesitarían variedad —porque su catálogo es
chico y se agota rápido— son justamente los que menos rotación reciben. Los días
que caen a `pop` muestran lo mismo que mostrarían sin el mecanismo de ejes.

> **"Cobertura semanal: 236 títulos distintos" vale para el hero base y las
> superficies grandes, no para los chips angostos.** No hay una medición de
> cobertura por chip; si alguien la necesita, hay que hacerla.

### Por qué está bien así por ahora

Un chip que muestra siempre lo mismo es un problema mucho menor que uno que no
muestra nada, y `pop` sobre un catálogo de 19 títulos igual baraja con la semilla
del día. El costo de no hacer nada es bajo.

### Los rieles de género tienen el mismo techo

Al sumar los ejes a los rieles (2026-08-16) apareció el mismo caso, y conviene
tenerlo escrito para que nadie lea una mejora de cobertura y suponga que aplica
a todo el Home:

| riel/tipo | candidatos con el mejor eje |
|---|---|
| `scifi/tv` | **24** (22 con `pop`, 16 con `top`, 0 con `hondo`) |
| `terror/tv` | 53 (0 con `hondo`) |

**`scifi/tv` no puede mejorar su cobertura semanal**: su catálogo entero en
n,d,m son ~22 títulos, y el riel muestra 20. Rote lo que rote, va a mostrar casi
lo mismo todos los días. El guard evita que quede vacío, que es lo único que se
puede hacer sin material.

### Si algún día se ataca

La idea **no** es bajar el piso ni hacer que `hondo` pagine distinto: el material
no existe y ningún ajuste lo va a inventar. La idea es que el respaldo **conserve
algo de rotación** en vez de caer siempre al mismo lado.

Los cinco ejes de hoy se distinguen por dos cosas: **profundidad** (`hondo`
arranca en la página 4) y **selectividad** (`top` pide 300 votos). Las dos
fallan por lo mismo en un catálogo chico. Lo que sí sobrevive ahí son los ejes
que solo cambian el **orden** sobre el mismo conjunto: `taquilla`
(`revenue.desc` / `vote_count.desc`) y `nuevo` (por fecha) andan con 19 títulos
igual que con 5000, porque reordenan en vez de recortar.

Entonces el respaldo no debería ser `pop` fijo sino **el eje del día entre los
que no dependen de profundidad**, y solo caer a `pop` si tampoco eso llena. Con
eso un chip angosto seguiría rotando entre tres criterios en vez de quedarse
clavado en uno.

**Criterio de cierre:** que las 18 casillas degradadas de la semana bajen, y que
ninguna quede vacía (o sea, sin perder lo que arregló el guard). La medición ya
está: `medir-hero.mjs chips`, contando los `[ejes] ... se cae a` del log.


---

## #11 — "Últimos lanzamientos" tiene 35% de títulos bajo 6.0

**Estado:** abierto · **Prioridad:** baja · **Abierto:** 2026-08-16

Medido al fotografiar el Home antes de rotar los ejes de los rieles
(`docs/medidas/2026-08-16-rieles-antes.json`): de los 20 títulos del riel,
**el 35% tiene nota TMDB menor a 6.0** — con diferencia el peor del Home. El
segundo es Terror con 20%, y el resto está entre 0% y 15%.

No es un bug ni una regresión: es consecuencia directa de una decisión tomada a
propósito. `latestReleases` pide `minVotes: 0` **explícito** (ver el comentario
en `lib/enrich.ts`) porque exigir votos dejaba fuera los estrenos hasta que
juntaran unos cuantos, o sea días. El criterio pasó a ser "ficha completa"
(póster + sinopsis). El costo es este: un estreno con 12 votos y nota 4,8 entra.

**Lo que NO hay que hacer:** ponerle un piso de nota. Ver el principio en
`CLAUDE.md` — el puntaje de TMDB no se usa como filtro de exclusión en esta app,
y menos en el riel de estrenos, donde la nota temprana es ruido estadístico
(veinte votos no dicen nada) y además llegaría sesgada al cine local.

Direcciones posibles, ninguna evaluada todavía:

- Ordenar dentro del riel para que lo malo no encabece, sin sacarlo.
- Un piso de votos bajo (5-10) en vez de 0, que saca lo que literalmente nadie
  vio sin esperar a que junte 60.
- Aceptarlo: es el riel de novedades, y las novedades son irregulares.

**Criterio de cierre:** que se decida cuál de las tres, con el número medido
antes y después. Hoy el número existe (35%) y la decisión no.


---

## #12 — El piso de 60 votos de `discover()` excluye cine regional en toda la app

**Estado:** abierto · **Prioridad:** alta · **Abierto:** 2026-08-17
**No tocar todavía:** el dueño quiere decidirlo viendo qué aparece si se saca.

`discover()` tiene `"vote_count.gte": String(o.minVotes ?? 60)`
([`lib/tmdb.ts`](../lib/tmdb.ts)). **Toda superficie que no pise `minVotes`
hereda ese 60**, y nadie lo decidió por superficie: es un default silencioso,
igual que el `sort_by: popularity.desc` del **issue #9**. Los dos salieron de la
misma línea de código y del mismo descuido.

Es el único piso de la app que va **en contra** de lo que el producto busca. La
app es un agregador argentino y esto saca, sin avisar, buena parte del cine
argentino y latinoamericano: una película local con 40 votos en TMDB no existe
para ninguna de las superficies de abajo, aunque esté en Netflix AR.

### Quiénes lo heredan (sin decidirlo)

| Superficie | Vía |
|---|---|
| `/categoria/[slug]` y los modos de navegación del buscador | `/api/discover` → `listByCategory` sin `minVotes` |
| Recomendador, ruta angosta (`reales`, `supervivencia`) | `listByCategory` sin `minVotes` |
| Relleno de los chips curados cuando no llegan al piso | `listByCategory` sin `minVotes` |

### Quiénes NO lo heredan (lo declaran)

| Superficie | Piso | Por qué |
|---|---|---|
| `latestReleases` | **0** explícito | un estreno no juntó votos todavía |
| eje `nuevo` | 10 | mismo motivo, más laxo |
| ejes `pop`, `taquilla`, `hondo` | 60 explícito | mismo valor, pero elegido |
| eje `top` | 300 | medido: con 60 el ranking se llena de nicho |
| `genreCovers()` | 300 | elegir UN póster representativo |
| `lib/top.ts` | 60 explícito | medido contra Netflix AR |

`supabase/functions/tmdb-sync` tiene su propia implementación de `discover` (es
una edge function de Deno, aparte) y no comparte este default. Hay que revisarla
por separado.

### Lo que NO es la solución

Bajar el piso a un número más chico elegido a ojo. Y **jamás** reemplazarlo por
un piso de nota: ver el principio en `CLAUDE.md` — el puntaje de TMDB no se usa
nunca para excluir títulos en esta app, solo para medir.

### Cómo decidirlo

Medir qué APARECE con el piso en 0, no razonar sobre qué debería aparecer. Las
preguntas: cuántos títulos nuevos entran por superficie, qué proporción son cine
regional, y cuánto ruido real (títulos sin traducir, sin sinopsis, sin póster)
se cuela. `latestReleases` ya resolvió ese ruido sin votos, con
`soloCompletos` (póster + sinopsis), y ese es el camino a evaluar primero.

**Criterio de cierre:** que `minVotes` sea una decisión explícita por superficie
—idealmente un parámetro obligatorio, como propone #9 para `sort_by`— y que el
número de cada una salga de una medición y no del default.

---

## #14 — El avatar propio parpadea en cada carga

**Estado:** abierto, **POSTERGADO** · **Prioridad:** baja · **Abierto:** 2026-08-27

> **Postergado el 29/08/2026, por decisión del dueño.** Antes figuraba como
> "se arregla antes del empaquetado nativo". **Ya no**: no bloquea el prototipo
> Android, ni la adaptación de la capa web, ni la publicación en Play. Se retoma
> cuando el dueño lo pida. Ver `docs/CAPACITOR.md` §0.a, decisión 8.

**NO es una regresión de la tanda de avatares**, y eso decide cuándo se arregla:
el código anterior tenía exactamente el mismo parpadeo, con otro dibujo.

### Qué se ve

Al cargar cualquier pantalla con el avatar propio —la barra de abajo, el hub de
`/cuenta`, `/cuenta/perfil`— se ve **un avatar que no es el tuyo durante un
instante**, y después aparece el correcto. Reportado por el dueño en la
verificación manual del 27/08, recargando después de guardar.

### Causa

`profile` viaja en `null` hasta que la sesión resuelve, y los tres componentes
pintan igual:

```tsx
<Avatar perfil={profile} … />
```

Con `null`, `resolverAvatar` devuelve `AVATAR_POR_DEFECTO` — que es lo correcto
para esa función, porque siempre tiene que devolver un avatar del catálogo. El
problema no es la resolución: es **pedirle una respuesta antes de tener el
dato**.

**El código anterior hacía lo mismo**: `getAvatarUrl(undefined)` caía al estilo
y la semilla por defecto y pintaba un DiceBear fijo. Cambió el dibujo del
parpadeo, no el parpadeo.

### Por qué no se arregló en `feat/avatares-propios`

Decisión del dueño, 27/08: **se resuelve en una rama aparte**, después de
desplegar los avatares. *(El "y antes del empaquetado nativo" que decía acá se
levantó el 29/08: ver el encabezado de este issue.)* Meter un cambio en la
nav y en el hub adentro de una rama que ya estaba verificada a mano habría
obligado a repetir la verificación entera por algo que ya estaba pasando en
producción.

### Criterio de cierre

`AuthContext` ya expone `ready`. Mientras sea `false`, los tres puntos que
muestran el avatar propio no tienen que resolver ninguno: va un hueco neutro del
mismo tamaño —para no mover el layout, que sería cambiar un parpadeo por un
salto— y recién con `ready` en `true` se pinta el avatar.

**Cerrado cuando**: recargando `/cuenta`, `/cuenta/perfil` y cualquier pantalla
con la barra de abajo, **no aparece ningún avatar que no sea el del perfil**, y
el CLS no empeora.

**Ojo con el alcance**: son tres llamadores (`AvatarPicker`, `BottomNav`,
`UserHub`). El componente `Avatar` y `resolverAvatar` **no se tocan** — su
contrato de devolver siempre uno del catálogo es correcto y hay tests que lo
fijan.


---

## #15 — Selector de avatares: círculos vacíos (corregido) y una demora aislada (aceptada)

**Estado:** el bug, **corregido**. La demora, **limitación aceptada** por decisión
del dueño · **Abierto:** 2026-08-27 · Reportado sobre Producción

### El bug: círculos vacíos — CORREGIDO

Al abrir "Elegí tu avatar" aparecían uno o varios círculos **vacíos**, y al
cerrar y volver a abrir eran **otros**.

**Causa: no eran archivos que faltaran ni peticiones que fallaran. Eran imágenes
que nunca se pedían.** Los tres estados de un `<img>` lo separan:

| Estado | `complete` | `naturalWidth` |
|---|---|---|
| carga diferida no iniciada | `false` | 0 |
| petición fallida | `true` | 0 |
| petición correcta | `true` | >0 |

Medido en un banco que replica el DOM y el CSS del modal, con los WebP reales de
Producción:

```
lazy   (como estaba):   10/31 OK · 21 SIN INICIAR (complete=false) · 0 fallos
eager  (la corrección): 31/31 OK · 31 peticiones                   · 0 fallos
```

Las 21 vacías eran **exactamente** las 21 con `loading="lazy"`
(`ANSIOSAS = 10`), en cinco aperturas seguidas. `avatar-moon.webp` responde
`200 image/webp`, así que el archivo nunca fue el problema.
`CastRail.tsx` ya documentaba lo mismo en rieles y modales: fue la segunda vez.

**La corrección:** las 31 se piden al montar el modal —no antes: entra por
`next/dynamic`—, y la prop `lazy` de `Avatar` se eliminó entera para que no
vuelva por descuido. Como defensa se agregó **un** reintento acotado con marca
fija en la URL y, si tampoco carga, un respaldo visible en lugar del hueco
(`lib/reintento-imagen.ts`, con tests).

**Verificado por el dueño en el Preview: diez aperturas, cero círculos vacíos.**

### La demora aislada — LIMITACIÓN ACEPTADA, no se sigue investigando

En esas mismas diez aperturas, **dos** mostraron una demora: en una, tres
avatares tardaron ~6 s en aparecer; en otra, uno tardó ~4 s. **Sin throttling y
con caché caliente.**

**No hay causa demostrada, y no se afirma ninguna.** Se descartó explícitamente
la explicación fácil: con los recursos ya pedidos, el peso de la primera descarga
**no** explica una demora que aparece en la sexta apertura. Una medición previa
que decía *"segunda apertura: 0 ms"* se tomó en un banco con la pestaña oculta y
**no describe el comportamiento real** — queda retirada.

Quedaron cinco hipótesis sin separar: red o CDN, lectura del service worker,
decodificación por exceso de resolución, planificación del navegador, y fallo de
transporte.

**Decisión del dueño, 27/08: no se sigue investigando ahora, y esto no bloquea el
merge.** El bug reportado —círculos permanentemente vacíos— está corregido y
verificado; lo que queda es una demora ocasional que no deja la interfaz rota.

**Si se retoma**, lo que haría falta es una traza por imagen de una apertura
lenta: instante de creación del `<img>`, `load`/`error`, `complete`,
`naturalWidth`, duración del recurso, los tres tamaños, `workerStart` y el tiempo
de `decode()` — con las **duraciones** separadas de los instantes, porque el
tiempo humano hasta el clic contamina cualquier instante medido desde el inicio.
Y el candidato más barato de probar sería servir en la grilla una variante de
160 px en vez de los 512 px actuales, conservando los 512 para los usos
individuales.

### Lo que NO se tocó, a propósito

- **`cacheFirst` del service worker.** Su falta de timeout es un problema real y
  **general** —afecta chunks, íconos y todo lo demás— y sigue en el **issue #3**,
  apartado b, que es donde corresponde decidirlo con una traza de red real.
- **`next/image`.** No corresponde: los archivos ya vienen en el tamaño y el
  formato correctos.
- **Variantes reducidas.** No se generaron: sin saber la capa responsable habrían
  sido una apuesta.

### Ojo: NO confundir con el issue #14

| | #14 | #15 |
|---|---|---|
| Qué se ve | **un** avatar equivocado, un instante, al cargar la página | círculos vacíos dentro del selector |
| Dónde | nav, hub, perfil | sólo el selector |
| Causa | `profile` en `null` mientras resuelve la sesión | `loading="lazy"` |
| ¿Regresión de la tanda de avatares? | **no**, el código anterior hacía lo mismo | **sí**, la introdujo `ANSIOSAS` |

### Criterio de cierre

El del bug **ya se cumplió**: 31 botones, 31 imágenes con `complete === true` y
`naturalWidth > 0`, sin errores en consola ni peticiones a terceros, en diez
aperturas.

Este issue queda abierto **sólo** por la demora, y se cierra el día que se
midan diez aperturas calientes seguidas sin que ninguna imagen pase de un
segundo — o el día que se decida que no vale la pena y se borre.

## #16 — TMDB no publica el catálogo regional completo, y no hay forma de saber cuánto falta

**Estado: MITIGADO, NO RESUELTO.** Integrado desde
`fix/disponibilidad-oficial` (prueba manual aprobada por el dueño el
2026-08-30). Ver `docs/medidas/2026-08-30-disponibilidad-informe.md`.

⚠️ **Mitigado no es cerrado, y la diferencia importa acá.** De los 11 títulos sin
proveedor `AR` de la muestra, la resolución recupera **4**. Los otros 7 siguen
sin aparecer como disponibles, y ninguna medición dice cuántos títulos más
faltan fuera de la red que se midió. Este issue **queda abierto**.

**Actualización 2026-08-31 (`feat/evidencia-oficial`, prueba manual aprobada).**
La regla se generalizó a **seis plataformas en series y cuatro en películas**,
con criterio de **cobertura sobre certeza** por decisión del dueño. Medido contra
verdad de campo: **144 + 22 aciertos, cero falsos positivos**. El punto 1 de "lo
que sigue abierto" quedó resuelto; **los puntos 2 y 3 no**, y el issue **sigue
abierto** por el 2: no hay forma de medir el agujero completo.

Medido el 2026-08-30 sobre la red Disney+, 60 días de estrenos: **11 de 15
series no tenían proveedor `AR`** en `watch/providers`, incluida una que
JustWatch mostraba como #1 del país (`tv:275224`). La resolución centralizada
recupera **4 de esas 11** con evidencia oficial estricta; las otras 7 no tienen
enlace oficial, o lo tienen de otra región o de otro dominio, y **no se
fuerzan**.

**Lo que sigue abierto:**

1. ~~**Sólo Disney+ está habilitada** para la regla de enlace oficial.~~
   **RESUELTO el 2026-08-31**: seis plataformas en series (Netflix, Disney+,
   Prime Video, Max, Paramount+, Apple TV+) y cuatro en películas. Cada
   combinación de red, dominio, ruta e ids globales se midió antes de entrar, y
   un test falla si se agrega una sin actualizar el número.
2. **No se puede medir el agujero completo.** Sabemos cuántas series de una red
   conocida no tienen dato regional; no sabemos cuántos títulos faltan de redes
   que ni siquiera consultamos.
3. **El suplemento por redes tiene ventana fija.** El catálogo regional sí
   pagina indefinidamente, pero los candidatos que llegan por red salen de una
   ventana acotada: un título de red más viejo que esa ventana no aparece.

**Lo que NO es una salida:** usar `networks` sola, o el `homepage` solo. Las dos
producen afirmaciones falsas y hay tests que las rechazan.


---

## #19 — Una caída de TMDB se realimenta: cada visita rearma contra el servicio caído

**Detectado el 2026-09-10**, auditoría de capacidad (§3 y §4). **Comprobado
leyendo el código.**

> **Estado (14/09): Etapa 3.a IMPLEMENTADA EN RAMA
> (`feat/etapa3a-clasificacion-tmdb`, desde `b7be927`) y CORREGIDA tras la
> auditoría de Codex sobre `e930a1d` (cuatro huecos: `directorCards` y
> `genreCovers` cacheaban resultados parciales; la búsqueda repetía
> `providersOf` en la deduplicación y un 429 persistente la volvía 503; el
> aviso de TMDB de la búsqueda sobrevivía a fallos de red, cancelaciones y
> cambios de término — informe §23), más un barrido completo de sitios que
> atrapan errores, y CORREGIDA de nuevo tras la auditoría sobre `09b9dbe`
> (carrera del debounce de la búsqueda; registrador inerte fuera de contexto;
> comparador antes/después de la búsqueda sana 15/15 — informe §24), y
> CORREGIDA por tercera vez tras la auditoría sobre `708bce0` (carrera real
> entre `onChange` y `useEffect`, resuelta con un adaptador que invalida en el
> evento; inventario de descartes con evidencia ejecutada/estructural/de banco
> en vez de referencias documentales, con controles mutados; escenario D del
> banco: pools con 429 en `/discover` — informe §25), y por cuarta vez tras la
> auditoría sobre `03ad4b9` (la fila de pools del inventario verifica ahora la
> cadena completa `composeHome → candidatosDeSuperficie → candidatosConEje →
> candidatosDePools` con controles mutados por enlace — informe §26), y por
> quinta vez tras la auditoría sobre `6ef35c5` (la fila de pools representa
> los recorridos con ejes y `EJES_RIELES=0`, y el banco de 429 parcial los
> ejecuta a ambos — informe §27; esos dos NO eran todos), y por sexta vez tras
> la auditoría sobre `c6b299e` (inventario verificable de los nueve call sites
> que llegan al descarte de pools, nueve recorridos desde `composeHome` con
> controles mutados por tipo de rama, banco de página extra identificada por
> sus parámetros con y sin ejes; rutas `/api/recomendaciones` y
> `/api/audience` inferidas — informe §28), y por séptima vez tras la auditoría
> sobre `37f1ca1` (descubrimiento de call sites recursivo sobre todo el código
> productivo, con rechazo de alias/namespace/miembro/referencia sin llamar, y
> cobertura recontada en una categoría por recorrido: 2 identificados, 4
> agregados, 3 estructurales, 0 inferidos — informe §29), y por octava vez tras
> la auditoría final sobre `2886212` (el acceso por miembro sin llamada
> inmediata —`const traer = api.candidatosDePools`— también se rechaza —
> informe §30); aprobada por la auditoría final sobre `8177d2a`; **MERGEADA
> (`7b2fc8f`, `--no-ff`), PUSHEADA Y DESPLEGADA el 2026-09-15**
> (`dpl_2GLbFXDt4271mS5wTo7MegkN6bnn`, `app.yump.ar`; comprobación pasiva:
> health, Home frío y caliente, búsqueda y ficha en 200, sin descartes ni
> errores nuevos; identidad del Home preservada según la evidencia existente);
> reintentos APAGADOS (`TMDB_REINTENTOS` ausente); limitador, circuito y
> membresía NO implementados — **#19 sigue abierto por esas subetapas
> restantes, no por la 3.a ni la 3.b.** **Subetapa 3.c (protección frente
> a TMDB) — estado vigente en el informe §45 a §48 (17/09): 3.c.1 "pausa
> compartida ante 429" con diseño corregido: adquisición atómica del turno
> con la pausa adentro; sobrepaso por fórmula parametrizada (`enVuelo +
> cadencia × (Δt + T_lectura)`; 94 / 184 / 528 por proceso según cadencia
> 35 / 80 / 252 son ESTIMACIONES, no cotas; sin cota compartida si la
> lectura falla) con línea base medida hoy (750-778 llamadas tras el primer
> 429 rápido, pico 224-252/s); lector no bloqueante (sólo `Δt`, `F_max = 1`);
> `PAUSAR` idempotente por identidad de evento, marcador 120 s, marca de
> agua por proceso con TTL propio, Lua que valida antes de mutar y falla
> seguro, telemetría en `pcall`; `/api/health` sólo agregados; sin UB,
> espera breve y acotada `min(restante, 5 s)` con UN solo sueño y UNA
> readquisición (≤ 2 `EVAL`) y `503` + `Retry-After` sólo si la pausa
> continúa (§42, decisión del dueño; `ESPERA_MAX = 5 s` provisional sin
> datos reales); el vencimiento del presupuesto interno (la única señal: la
> ruta no usa `req.signal`) sale por el centinela 4d sin readquirir,
> componer, lanzar ni registrar un falso error; pausa local por encima de
> Redis caído/indeterminado; UB sin caché en memoria (matriz por instante
> del fallo); umbrales antes/después fijados y sin tocar; **un solo deadline
> absoluto `plazo` creado con la señal y `plazo − ahora` en lectura previa,
> espera, readquisición y composición** (§46: la lectura previa no entraba
> en el reloj local de `servirConTurno`; el mismo defecto está en el rescate
> de la Etapa 2 hoy en Producción, `home-servir.ts:315`, y viaja con la
> implementación); **el fondo con dos límites absolutos, `min(inicioFondo +
> 50 s, inicioRuta + 60 s − 5 s)`, y sin composiciones condenadas: si no
> quedan 16 s + 1 s de reserva, UB servido, `LIBERAR` best effort y `fondo:
> no-iniciado-presupuesto`** (§47); **la señal limita el trabajo NUEVO: una
> operación de Redis ya enviada completa después del plazo o pierde su
> respuesta (atómica, con fencing), no se inicia `PUBLICAR` tras el plazo,
> el turno vence por TTL si `LIBERAR` falla o Vercel corta, y un `PUBLICAR`
> aceptado publica un payload completo o nada** (§48). Modelo 77/77 con
> guard estructural sobre la ruta. NO APROBADA, NO IMPLEMENTADA, PENDIENTE
> DE NUEVA AUDITORÍA;
> 3.c.2 fuera de alcance. 3.c.0: modelo de sensibilidad ajustado, no
> predictivo; ningún frío total se pide en Producción. Antecedentes §38-§40
> superados (§41-§43: corregidos por §44/§45).** **Subetapa 3.b ("último bueno
> primero, reconstrucción en fondo"): MERGEADA, PUSHEADA Y DESPLEGADA el
> 2026-09-15** — aprobada por la auditoría final de Codex sobre `c5fab20`;
> merge `--no-ff` `5604750` (rama en `ae6902f`), deployment
> `dpl_A9oAnbXKBqbBTGiKC6kMMLdFz3oB` READY con `githubCommitSha = 5604750`,
> alias `app.yump.ar`; health, Home, búsqueda y ficha en 200; **camino
> UB-primero observado naturalmente en Producción** en el primer Home tras
> el deploy (`643 ms | ultimo-bueno-fondo | fondo programado` antes de
> `[home] compone`; una única `[home-fondo] 16682ms | publicado | 342/342
> TMDB ok`; siguiente pedido HIT 269 ms); sin errores nuevos; identidad del
> Home preservada (16/16). Reversión sin código: `HOME_UB_PRIMERO=0` +
> redeployment, con autorización. Historia previa: IMPLEMENTADA EN RAMA
> `feat/etapa3b-ub-primero` (`33d2ea2`) y CORREGIDA tras las auditorías
> sobre `c84996e` (§35: la composición de fondo espera la compuerta de la
> solicitud) y `3a057fc` (§36: la compuerta se abre recién tras ceder al
> event loop con `setImmediate`, probado con el llamador real de `GET`:
> `respuesta-construida → caller-recibio-response → fondo-inicia`; Preview
> aislado borrado: bytes en 425 ms con 3 s síncronos de fondo por delante);
> (informe §34-§37; diseño §33). En Producción hasta `903832e` el líder
> componía en línea aunque hubiera UB (15,1 s observados); desde `5604750`
> responde el UB y compone en fondo con `waitUntil` de
> `@vercel/functions` (comprobado en Preview: fondo hasta 60 s desde el
> inicio de la solicitud);
> implementación con `@vercel/functions`, `programarEnFondo` perezoso,
> `[home-fondo]` separada, kill switch `HOME_UB_PRIMERO=0` aplicado con el
> siguiente deployment.** Clasificación por causa, `Retry-After` parseado, H2 corregido (un
> descarte parcial de causa TMDB marca el Home degradado y no se publica),
> `titleCard` sin `null` por TMDB, ficha/búsqueda con `503`/`degradacion`.
> Banco de identidad del Home con cachés aisladas: 16/16 idénticos y válidos;
> 429 parcial: `b7be927` publica el Home mutilado (RED), la rama no (GREEN).
> Informe §22. **El diseño del resto (v4.1) sigue pendiente de auditoría.
> Restricción del dueño: la Etapa 3 no puede alterar el contenido correcto
> del Home.** v1 (`a15b650`) → v2 (`209bda1`) → v3 (`ced36de`) → v4
> (`d76f0ce`) → v4.1 (`0d06826`). La v4 convierte la restricción en criterio bloqueante
> (informe §1): con TMDB sano, hero, títulos, orden, cantidad, dedup,
> plataformas, badges, enlaces, toggles y contrato JSON idénticos, verificados
> por un banco de **diferencia cero** con control del comparador (§14); la
> membresía por pool queda **no aprobada** (gate de descarte, §12) y la
> capacidad se resuelve sin tocar el Home. Corrige la v3: la cota de ventana
> móvil sobre `fetch` no valía con latencias de Redis asimétricas; el contrato
> pasa a dos niveles (demostrado sobre reservas ≤ 28/s; demostrado sobre
> `fetch` sólo bajo RTT ≤ 250 ms verificado por reserva: ≤ 36/s móvil, ≤ 12
> por 100 ms; medido con latencia 5/30/150/300 ms), dos cadencias por clase
> con préstamo (equidad global ≥ 14/s por clase, sin inanición), tres esperas
> de la ficha separadas y modelo de tráfico mixto (bajo carga sostenida el
> Home frío sirve UB hasta que baje la carga). **Alcance del cierre:** la
> aplicación en Vercel con Redis respondiendo; no la cuenta entera de TMDB ni
> Redis caído. No implementar nada hasta una nueva auditoría. Informe:
> [`medidas/2026-09-14-etapa3-diseno-resistencia-tmdb.md`](medidas/2026-09-14-etapa3-diseno-resistencia-tmdb.md).
>
> **Antecedente:** lo que sigue describe el código del 10/09. Desde la Etapa
> 2 (13/09) la pieza 4 está **mitigada para el Home, por clave**: un
> degradado ejecuta `ENFRIAR` y nadie recompone esa clave durante
> `ENFRIAMIENTO_MS` (15 s); se sirve el último bueno o el degradado
> compartido. La pieza 1 (cliente sin reintentos ni `Retry-After` ni
> circuito) sigue **sin cambios**, y el lazo sigue intacto en ficha,
> búsqueda y las demás rutas, que no tienen enfriamiento ni último bueno.
> Además, una composición degradada sigue pagando ~277 llamadas contra el
> servicio caído (banco F2), o sea ~18 llamadas/s por clave de Home bajo
> enfriamiento. Y el 14/09 se encontró por lectura que la degradación
> **parcial** (429 en algunos `watch/providers`) se descarta título por
> título sin marcar el payload, que se publica corto como fresca y como
> último bueno (informe §2.2, H2). El estado vigente es el del informe.

Cuatro piezas correctas por separado que juntas forman un lazo:

1. `lib/tmdb.ts:56-67` — el cliente **no reintenta, no lee `Retry-After`, no
   tiene circuito de protección**: `if (!res.ok) throw`. Un 429 es una excepción
   inmediata.

   ⚠️ **[R2] Esto vale para TMDB y sólo para TMDB.** La primera versión de este
   issue decía "no hay reintentos en ningún lado", Redis incluido, y **es falso**.
   `@upstash/redis` **1.38.0** hace **6 intentos** por defecto
   (`node_modules/@upstash/redis/nodejs.js:152`, bucle en :191) y `lib/cache.ts:27`
   lo instancia sin desactivarlos. El matiz que importa: **ese bucle envuelve sólo
   el `fetch`**, o sea fallos de **transporte**; una respuesta HTTP de error sale
   del bucle y no se reintenta. Backoff `Math.exp(i)*50` ms → hasta **~4,3 s** de
   espera dentro del request antes de rendirse, latencia que hoy nadie ve.
2. `lib/home.ts:123-135` — `safe()` degrada esa excepción a riel vacío.
3. `lib/home.ts:706` + `lib/reparar-y-cachear.ts:43` — un payload degradado se
   devuelve pero **no se guarda**.
4. Por lo tanto la próxima visita rearma y vuelve a golpear a TMDB.

**La decisión 3 es correcta** y está bien argumentada: congelar una caída 6 h para
todos es peor. Lo que falta es la otra mitad — que mientras dure la caída no
rearme *cada* visita. La carga contra el servicio que ya falla crece linealmente
con el tráfico.

Lo mismo, peor, con Redis caído (`lib/cache.ts:189-195` y `247-253`): todo es
MISS y cada petición rearma el Home entero.

### Y el techo de concurrencia no es el que dice ser

`MAX_EN_VUELO = 24` es **estado de módulo** (`lib/tmdb.ts:38-40`), o sea por
proceso, y es un default configurable (`TMDB_MAX_CONCURRENT`). En Vercel el techo
de peticiones **en vuelo** es **24 × instancias activas**, y la cantidad de
instancias la decide la carga: el techo crece justo cuando habría que contenerlo.

⚠️ **[R4] Cuidado con las unidades, que la primera versión mezcló.** Decía: *"el
comentario dice que TMDB throttlea cerca de 50 req/s; con tres instancias el techo
ya está en 72"*. **Esa comparación no vale.** 24 son peticiones **en vuelo**
(concurrencia); 50 req/s es una **tasa**. No se convierte una en otra sin la
latencia media (`tasa ≈ concurrencia / latencia`): con respuestas de 200 ms, 24 en
vuelo son ~120 req/s por instancia; con 2 s, ~12. **72 en vuelo no demuestra 72
req/s ni que se pase de 50.**

Lo que sí queda en pie: **el techo es por proceso y no hay ningún límite global**,
ni de concurrencia ni de tasa. **Cuántas instancias levanta Vercel, cuál es la
latencia media real y cuál es el límite verdadero de la cuenta de TMDB son tres
mediciones distintas, y ninguna está hecha.**

### Criterio de cierre

Con un doble de TMDB devolviendo 429 con `Retry-After`: se respeta la espera, no
se supera **ni el techo de concurrencia ni el de tasa declarados —los dos,
medidos por separado—**, el sistema no entra en lazo y se recupera solo cuando el
doble vuelve. Y con el último bueno del #17 presente, se sirve contenido anterior
en vez de rearmar.

*(14/09, v4: los criterios del banco —informe §15— distinguen lo demostrado
sobre reservas (≤ 28/s, ≤ 4 por 100 ms, exacto) de lo demostrado sobre
`fetch` bajo RTT ≤ 250 ms verificado (≤ 36/s móvil, ≤ 12 por 100 ms) y lo
medido con latencia de Redis asimétrica (E-latencia-asimetrica, tres
instantes por reserva); la concurrencia se mide aparte; se suman
E-home-identico (diferencia cero del Home, con control del comparador),
E-equidad (el Home progresa ≥ 14/s bajo fichas continuas), E2 desglosado en
tres esperas y E-mixto. Ninguno se corrió todavía.)*

⚠️ Eso verifica que el sistema **respeta el límite que se le declara**. **No**
verifica cuál es el límite real de TMDB: eso hay que consultarlo en la cuenta, no
medirlo con un doble.

---

## #20 — No se puede medir cuánto cuesta una petición hacia afuera

**Detectado el 2026-09-10**, auditoría de capacidad (§7). **Comprobado.**

> **Antecedente:** los puntos 1, 2, 2b y 2c describen el código del 10/09,
> ANTES de la Etapa 0. Los contadores existen y están desplegados desde el
> 11/09, el single-flight del Home desde el 12/09 y el turno distribuido con
> último bueno (Etapa 2, con `turno`, `origen`, `publicacion`, `renovaciones`
> y `propietario` en la línea `[home]`) desde el 13/09; el estado actual está
> en "Estado (11/09)", más abajo. Lo que sigue abierto es la observabilidad
> histórica: `vercel logs` sólo entrega lo reciente y no hay serie temporal.

Esto bloqueaba a los tres issues anteriores: sin esto se arreglaban a ciegas.

1. **No hay contador de llamadas a TMDB.** `CacheMetrics`
   (`lib/cache.ts:123-131`) tiene `comandos`, `requests`, `claves`, `hits`,
   `misses`, `lotes`, `msCache` — **todos de Redis**. Hoy no se puede responder
   "cuántas llamadas a TMDB costó este Home". Las cifras que circulan (más de 600
   llamadas, 5-10 s) son **históricas y no verificables con lo que hay**.
2. **No hay contador de consultas a Supabase.**
2b. **[R2] Lo que hoy se llama `requests` son tres cosas distintas.** `getSuelto`
   y `flush` anotan `m.requests += 1` por **llamada lógica**
   (`lib/cache.ts:184-188`, `242-245`), sin importar cuántos intentos HTTP hizo el
   SDK por debajo — y el SDK reintenta hasta 6 veces. Hay que separar **llamadas
   lógicas**, **intentos HTTP** y **comandos facturados**. Sin eso, la resistencia
   del #19 se mide contra un número que miente.
2c. **No hay contador de composiciones ejecutadas**, que es lo que arbitra el
   criterio central del #17. Hoy sólo hay HIT/MISS, y **HIT/MISS no alcanza** en
   cuanto entre el single-flight: un lector que espera una composición ajena va a
   parecer un HIT.
3. **Analytics mide visitas, no solicitudes** (`app/layout.tsx:135-136`). Un
   usuario que toca cuatro toggles es una visita y cuatro reconstrucciones.
4. **El tráfico de Android no genera ninguna medición del lado del cliente, y
   es una decisión tomada.** `app/layout.tsx:133` monta Analytics y Speed Insights
   sólo si `!ES_NATIVO`, con la medición que lo motivó escrita al lado (06/09: en
   el contenedor los scripts recibían 404 y no medían nada). No es un defecto a
   corregir: es una limitación que hay que rodear, justo para el tráfico que está
   creciendo con la prueba cerrada de Play. Lo único que deja rastro son las
   peticiones a la API, y hoy no se pueden separar por origen.
5. **Los logs no fueron recuperables.** `vercel logs` sobre el deployment de
   Producción devolvió `No logs found` el 10/09. El `[home] HIT/MISS`
   (`lib/home.ts:711`) —el único instrumento de tasa de aciertos que tiene la
   app— no se pudo leer a posteriori. **No hay serie histórica.**
6. **`/api/health` cuesta 3 comandos de Redis por llamada** (`SET`+`GET`+`DBSIZE`,
   `lib/cache.ts:62-65`). Un monitor externo cada minuto son ~130.000 comandos al
   mes: contra el plan gratuito que cita `lib/cache.ts:83-85`, ~26% de la cuota
   mensual gastada en monitorear. **No se verificó si hay un monitor
   configurado.**

### La trampa de medición que hay que resolver acá, no después

Las métricas de Redis se le anotan **a quien programa el flush**, no a quien pidió
la clave — está escrito en `lib/cache.ts:143-146` y es deliberado ("para
diagnóstico está bien; no lo uses para facturar"). En cuanto entre el
single-flight del #17, **HIT de caché, espera compartida y composición propia se
vuelven indistinguibles**. Hay que separar los tres estados antes de tocar nada,
o el criterio "una sola composición" queda incomprobable justo cuando hace falta.

### Estado (11/09): la Etapa 0 está MERGEADA en `main` (`1073c70`) — el issue sigue ABIERTO

Auditoría final de Codex sobre `81aa8fe` sin hallazgos pendientes; merge
`--no-ff`, verificado desde cero sobre el `main` mergeado (suite 1399/1409, 0
fallos; `tsc` limpio; build fresco exit 0). **Dos cosas distintas que este
issue separa:** la *instrumentación* está implementada, mergeada y
**desplegada** (`9a4b7aa`, deployment `success`, `app.yump.ar` aliasado a él);
la *observación real* de Producción está sólo **parcialmente** disponible: con
`vercel logs` en vivo se vieron `[home] pedido <clave>` y la línea terminal con
unidades separadas en una solicitud normal (un MISS de `d,m,n`: 24 TMDB / 10
Supabase / Redis 67-67-67, 566 claves con 537 hit, 4,05 s; un HIT: 1 MGET, 270
ms). No hay serie histórica ni tasa de aciertos acumulada: eso es la Etapa 5, y
la lectura a posteriori que el 10/09 devolvió `No logs found` sigue sin
resolverse. La línea base aislada tiene **23 escenarios totales: 22
completos y 1 incompleto declarado**. Esto aporta medición; no agrega
capacidad, single-flight, bloqueo distribuido, último Home bueno, CDN ni
límites por ruta. Informe completo:
[`medidas/2026-09-11-etapa0-medir.md`](medidas/2026-09-11-etapa0-medir.md).

- **Puntos 1, 2, 2b y 2c: cumplidos y ejecutados en el banco aislado.**
  `lib/metricas.ts` cuenta por solicitud, con `AsyncLocalStorage` y sus límites
  auditados: TMDB (llamadas, ok, 429/5xx/4xx/red, tiempo), Supabase (consultas,
  ok, http/red, tiempo), Redis en **llamadas lógicas / intentos HTTP / comandos
  confirmados** —la palabra `requests` ya no existe—, y el Home en `cache`
  (hit/miss), **`composiciones`** (contadas donde corre `composeHome`) y
  `esperasCompartidas` (campo propio: 0 en la Etapa 0; desde la Etapa 1, 1 en
  cada seguidor del single-flight del Home). Los
  intentos HTTP de Redis salen del `backoff` del SDK (`@upstash/redis` 1.38.0
  lo llama una vez por reintento; no acepta un `fetch` propio) y se cotejaron
  con el doble en la recuperación controlada del banco: 1.655 intentos =
  1.655, 921 comandos = 921. La línea `[home]` muestra cada unidad con su
  nombre y termina con la clave; cada solicitud deja además `[home] pedido
  <clave>` al entrar. Un Home frío de `n,d,m` en el banco: **926 TMDB / 4 Supabase /
  993-993-993 Redis**; 5 solicitudes iguales sobre caché fría: **5
  composiciones**.
- **La trampa del batcher, resuelta:** hits/misses/claves se le anotan a quien
  pidió cada clave (captura al encolar), no a quien programó el flush; sólo el
  viaje del MGET queda a nombre de éste.
- **Segunda mitad del criterio, NO cumplida:** la tasa de aciertos de
  Producción legible sin depender de los logs es serie histórica (Etapa 5).
- **Puntos 3 a 6: sin cambios** (no eran de la Etapa 0).
- **Comprobado ejecutando:** todo lo anterior en el banco, con la
  coincidencia app ↔ dobles **verificada automáticamente por escenario**
  (`lib/banco-validacion.ts`; una diferencia invalida la corrida), repetibilidad
  y variantes que se distinguen. La primera corrida publicada (`ceeed75`)
  había solapado dos escenarios y afirmado la coincidencia sin verificarla; la
  auditoría de Codex lo detectó y la línea base se repitió entera (informe
  §7.5). **Inferido:** que en Vercel un Redis caído de forma sostenida termina
  en 504 (en el banco la solicitud no completó en 60 s, contra `maxDuration =
  60`). **No verificable desde el cliente:** comandos facturados vs
  confirmados.

### Criterio de cierre

Una petición al Home frío informa, **por separado**: llamadas a TMDB, consultas a
Supabase, llamadas lógicas / intentos HTTP / comandos de Redis, y composiciones
ejecutadas (distinguidas de HIT y de espera compartida). ✅ *(cumplido el 11/09
en la rama, ver arriba)*. Y la tasa de aciertos del caché en Producción se puede
leer sin depender de que los logs sigan ahí. ❌ *(pendiente: Etapa 5)*.

⚠️ **Lo que este issue NO resuelve.** Instrumentar da los números **propios**. Los
límites reales de TMDB, Upstash, Supabase y Vercel hay que **consultarlos en las
cuentas**, y el tráfico real hay que **observarlo en Producción**. Ninguna de esas
dos cosas la da un banco aislado — ver §10.0, §10.5 y §10.6 del informe.

---
