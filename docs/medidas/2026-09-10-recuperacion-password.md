# Incidente #22 — Recuperación de contraseña: causa reproducida, arreglo y pruebas

**Fecha:** 2026-09-10 (segunda versión, después de la auditoría de `fb89b45`)
**Rama:** `fix/recuperacion-password`, nacida de `main` = `ef2f83e`
**Método:** reproducción ejecutada contra el proyecto Supabase real con cuentas de
prueba creadas y borradas para esto; verificación en el navegador sobre un
**build de producción**; y un recorrido por **correo real** con un buzón
descartable. Sin pruebas manuales del dueño.
**No se registran contraseñas, tokens ni enlaces completos.**

> **Versión anterior y su auditoría.** `fb89b45` fue auditado
> ([`2026-09-10-auditoria-fb89b45.md`](2026-09-10-auditoria-fb89b45.md)) y
> devuelto con dos P1 y dos P2. Los cuatro están resueltos acá; la §7 dice cómo.

---

## 1. Resumen

**Lo comprobado:** la pantalla `/cuenta/reset` aceptaba **cualquier sesión
abierta** como prueba de recuperación. Con un enlace vencido de la cuenta B y
una sesión de la cuenta A en el navegador, cambiaba la contraseña **de A** y
avisaba éxito. Reproducido, medido contra Auth, y corregido.

**Lo que NO está comprobado:** que eso sea exactamente lo que le pasó al dueño.
Es **una causa posible, compatible con los síntomas** ("la web dijo que salió
bien y la contraseña nueva no entra"). No se pudo correlacionar su cuenta ni su
token con los eventos del incidente, y **no se sabe qué consumió su enlace
original**. Eso sigue abierto (§8).

**Lo que sí funciona, y se verificó con correo real:** el envío, la plantilla,
el `redirect_to`, la verificación y el cambio de contraseña del lado de Supabase.

---

## 2. Lo que se descartó, midiendo

| Hipótesis del issue | Resultado | Cómo |
|---|---|---|
| Web y Android usan proyectos Supabase distintos | ❌ Descartada | Los dos usan `aibqqebwlladjjkeqllo`: bundle de Producción y AAB firmado |
| `NEXT_PUBLIC_SITE_URL` apunta al dominio viejo | ❌ Descartada | Inlineado en Producción: `https://app.yump.ar` |
| `/cuenta/reset` no está en la allowlist | ❌ Descartada | Un `redirect_to` ajeno cae al Site URL; `/cuenta/reset` se respeta |
| La plantilla del correo manda a otro lado | ❌ Descartada | **Correo real recibido** (§6): un solo enlace `/auth/v1/verify`, `type=recovery`, `redirect_to=https://app.yump.ar/cuenta/reset` |
| Supabase no aplica el cambio | ❌ Descartada | `PUT /user` 200; la nueva entra, la vieja da 400 |
| La página acepta una sesión previa | ✅ **Confirmada** | §4 |

### Dos trampas de medición que casi producen conclusiones falsas

1. **`redirect_to` dentro de `options`.** La primera corrida del arnés mostró a
   Supabase ignorando el destino y cayendo al Site URL. Era el arnés: en
   `POST /admin/generate_link` el campo va en el nivel superior. Con el campo
   en su lugar, el destino se respeta.
2. **Cambiar sólo el fragmento no recarga la página.** Al pasar de
   `/cuenta/reset#error=…` a `/cuenta/reset#type=recovery&…` con `navigate`, el
   navegador hizo una navegación de hash y la página **conservó el estado del
   escenario anterior**. La primera lectura del escenario 4 mostraba el mensaje
   del escenario 3. Se repitió pasando por `/` y con una query distinta.

Las dos son `MANTENIMIENTO.md` §8.b: antes de creerle a un resultado, dudar del
instrumento.

---

## 3. El incidente original: lo que la evidencia sostiene y lo que no

Los logs de Auth aportados por el dueño (90 segundos):

```
18:25:18  POST /recover   200
18:25:53  GET  /verify    303   evento Login
18:26:08  GET  /verify    403   "One-time token not found"
18:26:39  POST /token     400   "Invalid login credentials"
```

Reproducido con el arnés y con **correo real**: la primera apertura entrega la
sesión; la segunda apertura del mismo enlace devuelve exactamente
`error=access_denied&error_code=otp_expired&error_description=Email link is
invalid or has expired`, byte por byte la captura del dueño.

**Sostiene:** que cuando llegó su navegador el token ya estaba consumido, y que
su cuenta recibió un `login` a las 18:25:53.

**No sostiene:** quién o qué lo consumió (el `User-Agent` nulo es compatible con
un escáner y con un cliente que no lo manda — **no se afirma escáner**), ni que
después se haya cambiado la contraseña de otra cuenta. No hay `PUT /user` en el
tramo visible, y no se pudo leer más: la Management API respondió
`Unauthorized` con el `SUPABASE_ACCESS_TOKEN` del entorno y el MCP de Supabase
no tiene credenciales.

---

## 4. La causa reproducida

`app/cuenta/reset/page.tsx` (`main`) decidía con **`ready && !user`**. Cualquier
sesión alcanzaba, y el error del enlace no se leía.

Con una sesión de **A** en el navegador y un enlace **consumido de B**:

```
Nueva contraseña
Elegí una contraseña nueva para qa-victima-…@yump.ar.     ← A, no B
```

Se guardó una contraseña y la app dijo "Listo". Contra Auth:

| Cuenta | Su contraseña original | La tipeada en el formulario |
|---|---|---|
| **A** (tenía sesión) | **400 — dejó de servir** | **200 — entra** |
| **B** (la del enlace) | 200 — sigue sirviendo | 400 — rechazada |

⚠️ `updated_at` no sirve como evidencia: se mueve también al iniciar sesión.

---

## 5. El diseño, y por qué no puede escribir sobre otra cuenta

### 5.1 Lo que estaba mal en `fb89b45`

Decidía con `type=recovery` en la URL y con el `sub` de un JWT **decodificado sin
verificar**. La auditoría lo desarmó: `#type=recovery&access_token=basura` con
una sesión abierta habilitaba el formulario. Reproducido antes de tocar nada:

```
#type=recovery&access_token=basura    sesion=cuenta-A  sujeto=null  -> formulario
#type=recovery&access_token=a.b.c     sesion=cuenta-A  sujeto=null  -> formulario
```

Y comprobaba la identidad **después** de `updateUser`: con un cambio de sesión
entre abrir el formulario y guardar, escribía en otra cuenta y recién después
avisaba.

### 5.2 La única prueba: la aceptación de Supabase

Leído en `@supabase/auth-js` **2.108.2**, `_initialize` → `_getSessionFromURL`:

1. Si la URL trae `error` → lanza; **la sesión existente no se toca**.
2. Exige `access_token`, `expires_in`, `refresh_token`, `token_type` → si falta
   alguno, lanza ("No session defined in URL").
3. **Llama a `_getUser(access_token)` — un viaje al servidor.** Un token basura,
   vencido o consumido falla acá → lanza → nada cambia.
4. Sólo entonces `_saveSession(session)` y, con `setTimeout(0)`,
   **`PASSWORD_RECOVERY`** con esa sesión, cuyo `user` vino del servidor.

**Ese evento es la aceptación.** No la URL, no un JWT decodificado, no la sesión
que haya. El `AuthProvider` lo captura y guarda `{ userId, email, accessToken,
refreshToken }` de esa sesión como `recuperacion`. Sin ese evento, `recuperacion`
es `null` y la pantalla no ofrece el formulario, tenga la sesión que tenga.

### 5.3 La escritura va atada a esa aceptación

`cambiarPasswordDeRecuperacion` **no usa el singleton**. Crea un cliente
aislado —mismo patrón y mismas tres opciones que `lib/eliminar-cuenta.ts`:
`persistSession: false`, `autoRefreshToken: false`,
`detectSessionInUrl: false`—, le hace `setSession` con **los tokens de la
recuperación aceptada** y escribe con él.

Si otra pestaña entró como A entre abrir el formulario y pulsar Guardar, el
singleton apunta a A; el cliente aislado sigue apuntando a B, porque la cuenta la
fija **el token**, no el momento. **Cero escrituras sobre otra cuenta, por
construcción** — y además se compara lo que Supabase devolvió, por si acaso.
Sin recuperación aceptada el flujo devuelve `sin-recuperacion` **antes** de
llamar a nada.

### 5.4 El orden de inicialización, resuelto y no supuesto

`ready` se ponía con `getSession()`, que resuelve cuando termina `_initialize`.
Pero `PASSWORD_RECOVERY` se emite con `setTimeout(0)` **después** de eso: `ready`
llegaría un tick antes que la aceptación y la página mostraría "enlace inválido"
un instante antes del formulario.

Ahora, si la URL trae tokens de recuperación —leído **antes** de crear el
cliente, porque auth-js borra el fragmento al aceptarlo—, `ready` no se pone con
`getSession()`. Se pone con `PASSWORD_RECOVERY` (aceptación), o con un
`setTimeout(0)` programado al recibir `INITIAL_SESSION` (rechazo). Los timers de
igual demora corren en orden FIFO: el de auth-js se programó antes y llega
primero. Si no llega, el nuestro es lo que deja decir que el enlace no sirvió.

La página lee la URL en el **inicializador de un `useState`** (render), no en un
efecto: los efectos de los hijos corren antes que los del padre, y todos después
del render. Un `useEffect` en la página llegaría tarde.

**Robustez al orden de carga.** Si el chunk de la página llega DESPUÉS de que el
`AuthProvider` ya procesó el hash (auth-js lo borró), la página lee una URL
limpia — y aun así `decidirPantalla` devuelve `formulario`, porque **la
aceptación manda con o sin URL**. Si el token era malo, auth-js no borra el hash
y la página lo ve, espera a `ready` y muestra el error. Hay tests para las dos
ramas; el caso "chunk lento" en navegador **no se pudo forzar** (no hay control
de red en el panel) y queda como razonamiento sobre la tabla de decisión, no
como medición.

### 5.5 Archivos

| Archivo | Qué cambia |
|---|---|
| `lib/recuperacion.ts` | reescrito: `leerEnlace` sólo clasifica; `hayTokensDeRecuperacion`; `decidirPantalla` ya no recibe sesión ni `sub`; `cambiarPassword` con deps inyectadas. **`sujetoDelToken` eliminada** |
| `components/AuthContext.tsx` | `recuperacion` desde `PASSWORD_RECOVERY`; `ready` espera la decisión; `cambiarPasswordDeRecuperacion` con cliente aislado; `updatePassword` vuelve a ser sólo para sesión abierta |
| `app/cuenta/reset/page.tsx` | cablea la decisión; muestra el email de la aceptación, no del singleton |
| `lib/recuperacion.test.ts` | reescrito: 23 tests, escritos ANTES del cambio y fallando contra `fb89b45` |

---

## 6. Pruebas

### 6.1 Unitarias — 23, escritas antes del cambio

Contra `fb89b45` fallaban (la API cambió y el caso P1 devolvía `formulario`).
Ahora **23/23**. Cubren: token basura/malformado/ausente con sesión abierta → no
formulario; sólo la aceptación habilita; aceptación sin URL sigue valiendo;
enlace consumido → error con motivo; sin recuperación aceptada → **cero
escrituras**; la escritura va con el token de la recuperación aunque el singleton
tenga otra cuenta; identidad devuelta ≠ aceptada → fallo; y guards de que la
página y el provider entran por ahí (evento, cliente aislado, lectura en render,
`ready` esperando).

### 6.2 Funcionales — navegador, **build de producción**, Supabase real

| # | Escenario | Resultado |
|---|---|---|
| 1 | Enlace válido, **sin sesión previa** | ✅ formulario para B; auth-js borró el hash; singleton = B |
| 2 | Enlace válido de B, **con sesión previa de A** | ✅ formulario **para B**; singleton pasó a B |
| 3 | Enlace **vencido / consumido** | ✅ "Este enlace ya no sirve: o venció, o alguien lo abrió antes…", sin formulario, sesión previa intacta |
| 4 | **Token ausente / malformado** (`access_token=basura`, con y sin `refresh_token`), con sesión de A | ✅ "El enlace de recuperación no se pudo verificar…", sin formulario, sesión de A intacta |
| 5 | **Doble apertura** del mismo enlace | ✅ segunda vez → escenario 3 |
| 6 | **Cambio de sesión antes de Guardar**: formulario de B abierto, se instala la sesión de A y se dispara el evento `storage` (lo que auth-js escucha entre pestañas); el singleton pasa a A; se pulsa Guardar | ✅ **escribió en B, no en A** (abajo) |
| 7 | Hidratación en build de producción | ✅ los escenarios 1, 2, 3, 4 y 6 corrieron sobre `next build` + `next start` |
| 8 | Nunca escribir sin aceptación | ✅ sin formulario no hay botón; y el flujo devuelve `sin-recuperacion` antes de tocar nada (unitario) |

**Escenario 6, contra Auth:**

```
B (recuperación aceptada): nueva -> 200 | original -> 400
A (sesión del singleton) : nueva -> 400 | original -> 200
```

### 6.3 Suite completa

`npm test` → **1304/1304**, 0 fallos (con `.next` de producción; con uno de
desarrollo un test del `.ics` mira donde no debe — §2). `tsc --noEmit` → limpio.

---

## 7. El recorrido por CORREO REAL

Lo que `generate_link` no cubre. Buzón descartable con API (mail.tm, sin
escáner), cuenta de prueba con ese email, y **`POST /auth/v1/recover?redirect_to=`
con la anon key — exactamente lo que hace `resetPasswordForEmail`**.

```
POST /recover                       200  (4,9 s)
mail recibido                            (9,4 s)
   de: no-reply@send.yump.ar   asunto: "Reset your password"
   enlaces: 9; con /auth/v1/verify: 1
   type=recovery  redirect_to=https://app.yump.ar/cuenta/reset   coincide=true
PRIMERA apertura   303 -> /cuenta/reset#access_token,…,type=recovery  (sesión)
SEGUNDA apertura   303 -> error=access_denied code=otp_expired
usuario de prueba borrado           200
```

**Comprobado:** SMTP propio (`send.yump.ar`), plantilla con el enlace correcto,
`redirect_to` respetado, verificación en la primera apertura, consumo en la
segunda.

**No comprobado, y por qué:**
- **Qué consume el enlace en el buzón del dueño.** Un buzón descartable no tiene
  escáner ni vista previa. No se puede reproducir su cliente de correo sin su
  cuenta, y no se le va a pedir que pruebe.
- **El vencimiento configurado** (`mailer_otp_exp`). Sin Management API no se
  puede leer, y esperar a que venza no es una medición práctica. Lo que se sabe:
  la sesión entregada dura `expires_in=3600`.
- **La plantilla en el panel.** Se vio su *resultado* (el mail), no su
  configuración.

Nota de UX, no del incidente: el asunto está en inglés ("Reset your password").

---

## 8. Lo que sigue ABIERTO

1. **Qué consumió el enlace original del dueño.** Ni demostrado ni descartado.
   El arreglo no lo impide: lo que hace es decir el motivo y no tocar otra
   cuenta.
2. **Lectura de logs y configuración de Auth.** Bloqueo concreto: la Management
   API (`GET /v1/projects/{ref}/config/auth`) devuelve `401 Unauthorized` con el
   `SUPABASE_ACCESS_TOKEN` del entorno; el MCP de Supabase responde
   `Unauthorized` en `query_logs` y `execute_sql`. Hace falta un token de acceso
   vigente para: leer `mailer_otp_exp`, la plantilla, y los logs de Auth con
   identidad y User-Agent por evento.
3. **Navegación in-app hacia una URL con hash de recuperación.** auth-js sólo
   detecta el hash al crear el cliente; una navegación interna no lo procesa y
   la página muestra "no se pudo verificar". **No es alcanzable desde el mail**
   (siempre es una navegación completa desde otro origen) y falla cerrado, pero
   queda dicho. No se ejecutó.
4. **App Links / retorno nativo.** Otro problema, no tocado.

**#22 sigue abierto.** Sólo puede cerrarse cuando el punto 1 quede demostrado o
descartado con evidencia.

---

## 9. Cómo respondió esta versión a la auditoría de `fb89b45`

| Hallazgo | Estado |
|---|---|
| **P1** — `#type=recovery&access_token=basura` con sesión habilitaba el formulario; el test lo consolidaba | Reproducido antes de tocar nada (§5.1). La URL ya no decide; sólo el evento `PASSWORD_RECOVERY`. `sujetoDelToken` **eliminada**. El test que exigía `formulario` con `sujeto null` **eliminado** y reemplazado por el que exige lo contrario. Verificado en navegador (escenario 4) |
| **P1** — identidad comprobada después de escribir | Cliente aislado atado a los tokens aceptados; sin aceptación no se escribe. Verificado con cambio de sesión real antes de Guardar (escenario 6): cero escrituras sobre A |
| **P2** — causa afirmada con más certeza que la evidencia | Reescrito como "causa posible compatible con los síntomas" en informe, issue y comentarios de código. Sin "incidente cerrado" |
| **P2** — faltaba el correo real | Hecho con buzón descartable (§7). Lo que ese buzón no puede ver queda explícito |
| Guard textual del `useState` "prueba ubicación, no orden" | Aceptado: el orden se verificó en build de producción (§6.2) y el razonamiento de robustez está en §5.4, marcado como razonamiento donde no se pudo medir |

---

## 10. Higiene

- Cuentas de prueba creadas y **borradas**: dos para el navegador, una para el
  correo. Verificado: ninguna `qa-`/`yump-qa-` en Auth; 19 usuarios, los del dueño.
- Los enlaces con token se pasaron al navegador por un servidor local efímero.
- Sin cambios en Producción, variables ni configuración de Supabase. La cuenta
  del dueño no se tocó.
- Los cambios documentales que hay sin commitear en el checkout de `main`
  (`ESTADO.md`, `ISSUES.md`, la auditoría) **no se mezclaron** con la rama: el
  issue #22 se actualiza allí, donde vive.
