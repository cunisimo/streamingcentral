# Incidente #22 — Recuperación de contraseña: causa, arreglo y pruebas

**Fecha:** 2026-09-10
**Rama:** `fix/recuperacion-password`, nacida de `main` = `ef2f83e`
**Método:** reproducción ejecutada contra el proyecto Supabase real con **dos
cuentas de prueba creadas y borradas para esto**. Sin pruebas manuales del dueño.
**No se registran contraseñas, tokens ni enlaces completos.**

---

## 1. Resumen en tres líneas

La recuperación **no estaba rota del lado de Supabase**: el enlace, la allowlist
y el cambio de contraseña funcionan. Lo que fallaba era la pantalla
`/cuenta/reset`, que **aceptaba cualquier sesión abierta como prueba de
recuperación**: con un enlace vencido y otra sesión en el navegador, le cambiaba
la contraseña **a la cuenta equivocada** y avisaba que todo había salido bien.

Eso explica el síntoma exacto que reportó el dueño: *"la web dijo que el cambio
fue correcto y la contraseña nueva no me deja entrar"*. La contraseña sí cambió;
cambió en otra cuenta.

---

## 2. Lo que se descartó, midiendo

Antes de tocar código se comprobó cada eslabón. **Ninguna de estas era la causa.**

| Hipótesis del issue | Resultado | Cómo se comprobó |
|---|---|---|
| Web y Android usan proyectos Supabase distintos | ❌ **Descartada** | Los dos usan `aibqqebwlladjjkeqllo`: extraído del bundle de Producción y del AAB firmado |
| `NEXT_PUBLIC_SITE_URL` apunta al dominio viejo | ❌ **Descartada** | En el bundle de Producción está inlineado `https://app.yump.ar` |
| `/cuenta/reset` no está en la allowlist de Redirect URLs | ❌ **Descartada** | Un `redirect_to` a `/cuenta/reset` se respeta; uno a un dominio ajeno cae al Site URL, o sea que la allowlist funciona |
| La plantilla del correo manda a otro lado | ❌ **Descartada** | La captura del propio dueño muestra el aterrizaje en `/cuenta/reset#error=…` |
| Supabase no aplica el cambio de contraseña | ❌ **Descartada** | `PUT /user` → 200; la nueva entra, la vieja da 400 |
| El formulario acepta una sesión anterior | ✅ **CONFIRMADA** | Ver §4 |

### 🔴 Una trampa de medición que casi lleva a la conclusión equivocada

La primera corrida del arnés mostró que Supabase **ignoraba** el
`redirect_to: /cuenta/reset` y mandaba al Site URL — justo el fallo que el
comentario de `AuthContext.tsx` advierte. Parecía la causa.

**Era un error del arnés, no de la configuración.** En `POST /admin/generate_link`
el campo `redirect_to` va en el **nivel superior** del cuerpo; se había mandado
dentro de `options`, la API lo descartó y cayó al Site URL. Con el campo en su
lugar, el destino se respeta.

Es literalmente el reflejo de `docs/MANTENIMIENTO.md` §8.b: *antes de creerle a
un resultado malo, dudar del instrumento*. La conclusión publicada habría sido
"hay que arreglar la allowlist", que no tenía nada de malo.

---

## 3. Lo que sí pasó, según la evidencia del propio incidente

Los logs de Auth que aportó el dueño muestran, en 90 segundos:

```
18:25:18  POST /recover   200
18:25:53  GET  /verify    303   evento Login          ← alguien verificó el enlace
18:26:08  GET  /verify    403   "One-time token not found"  ← el dueño llegó acá
18:26:39  POST /token     400   "Invalid login credentials"
```

Reproducido con el arnés: **el primer GET al enlace entrega la sesión y el
segundo GET al mismo enlace devuelve exactamente**
`error=access_denied&error_code=otp_expired&error_description=Email link is
invalid or has expired` — byte por byte la captura del dueño.

O sea: **el token ya estaba consumido cuando llegó su navegador.**

⚠️ **Quién lo consumió NO está demostrado y este informe no lo afirma.** El
`headers_user_agent` nulo del primer evento es compatible con un escáner de
correo, y también con un cliente que no lo manda. No se pudo correlacionar
identidad ni token entre eventos: la Management API respondió `Unauthorized` con
el token disponible y el MCP de Supabase no tiene credenciales, así que **no se
pudieron leer los logs de Auth desde acá**. Queda abierto, y es un problema
distinto del que se arregla en esta rama.

---

## 4. La causa del síntoma reportado — REPRODUCIDA

`app/cuenta/reset/page.tsx` decidía qué mostrar con **`ready && !user`**. Una
sesión —cualquiera— alcanzaba para habilitar el formulario. Y el error del
enlace no se leía en ningún lado.

### El experimento

Dos cuentas de prueba: **A** ("víctima", con sesión abierta en el navegador) y
**B** ("objetivo", la que se recupera).

1. Se instaló en el navegador una sesión de **A**.
2. Se navegó a `/cuenta/reset` con el fragmento de un enlace **consumido de B**
   (el mismo `error=access_denied&error_code=otp_expired` de la captura).
3. La página mostró:

```
Nueva contraseña
Elegí una contraseña nueva para qa-victima-…@yump.ar.
[Nueva contraseña] [Repetir contraseña] [Guardar contraseña]
```

**Ofreció el formulario, para A, con el enlace de B vencido.** Se guardó una
contraseña y la app dijo "Listo, tu contraseña se actualizó" y llevó a `/cuenta`.

### El resultado, verificado contra Auth

| Cuenta | Su contraseña original | La contraseña tipeada en el formulario |
|---|---|---|
| **A** (la que tenía sesión) | **400 — dejó de servir** | **200 — 🔴 entra** |
| **B** (la del enlace) | 200 — sigue sirviendo | 400 — rechazada |

**La contraseña se cambió en A. B quedó intacta.** Quien intenta entrar como B
con la contraseña nueva recibe "Invalid login credentials" — el `POST /token`
400 de las 18:26:39.

⚠️ **`updated_at` no sirve como evidencia de esto.** También se mueve al iniciar
sesión, así que un login de verificación lo toca. Las dos columnas de arriba —qué
credencial abre qué cuenta— son la prueba; el timestamp, no.

---

## 5. El arreglo

Tres reglas, en `lib/recuperacion.ts` (módulo **puro**, con tests, por la misma
razón que `lib/reparar-y-cachear.ts`):

1. **El enlace manda, no la sesión.** Sin `type=recovery` en la URL no hay
   formulario, aunque haya sesión abierta.
2. **Un error del enlace se muestra, con su motivo.** Ya no hay un único texto
   para todas las causas.
3. **La identidad se compara.** La sesión activa tiene que ser la del token del
   enlace, y el éxito sólo se muestra si Supabase confirma que actualizó **esa**
   cuenta.

### Archivos

| Archivo | Qué cambia |
|---|---|
| `lib/recuperacion.ts` | **nuevo** — `leerEnlace`, `mensajeDeEnlace`, `decidirPantalla`, `sujetoDelToken` |
| `app/cuenta/reset/page.tsx` | usa la decisión; lee la URL **en el render**; confirma la cuenta antes de festejar |
| `components/AuthContext.tsx` | `updatePassword` devuelve `usuarioId`: la cuenta que Supabase dice haber actualizado |
| `lib/recuperacion.test.ts` | **nuevo** — 18 tests |

### Dos detalles que no son cosméticos

**La URL se lee en el render, no en un efecto.** `detectSessionInUrl` borra el
fragmento apenas lo procesa, y ese arranque vive en un efecto del `AuthProvider`.
Como los efectos de los hijos corren antes que los del padre y el inicializador
de `useState` corre durante el render, leer ahí es lo único que garantiza ver la
URL entera. Un `useEffect` en la página llegaría tarde. Hay un test que lo fija.

**`sujetoDelToken` no verifica la firma, y está documentado.** Sólo compara dos
identidades que ya llegaron por caminos confiables. No autoriza nada.

---

## 6. Verificación funcional — ejecutada en el navegador

Servidor de desarrollo corriendo **esta rama**, contra el Supabase real.

| # | Escenario | Antes | Ahora |
|---|---|---|---|
| 1 | Enlace consumido + sesión de otra cuenta | 🔴 formulario para la cuenta equivocada, y se lo cambiaba | ✅ *"Este enlace ya no sirve: o venció, o alguien lo abrió antes que vos…"*, **sin formulario** |
| 2 | Sin enlace, con sesión abierta | 🔴 formulario | ✅ *"Para elegir una contraseña nueva entrá desde el enlace…"* |
| 3 | Enlace fresco y válido de B, con sesión de A abierta | — | ✅ formulario **para B**, la cuenta correcta |
| 4 | Guardar en el escenario 3 | — | ✅ "Listo, tu contraseña se actualizó" |

### El resultado del escenario 4, contra Auth

```
OBJETIVO (B) — la cuenta del enlace
  clave NUEVA        -> 200   entra
  clave ORIGINAL     -> 400   rechazada
VICTIMA (A) — la sesión que estaba abierta
  clave NUEVA de B   -> 400   no se tocó
  su propia clave    -> 200   intacta
```

**La contraseña nueva permite ingresar, la anterior se rechaza, y la cuenta
ajena no se tocó.** Es el criterio de cierre del issue.

### Suite completa

`npm test` → **1299/1299, 0 fallos**. `tsc --noEmit` → **limpio**.

⚠️ Una vuelta antes, la suite dio 1 fallo en *"el bundle de la web SIGUE
ofreciendo el `.ics`"*. **No era el cambio.** Ese test se saltea si no existe
`.next/static`, y en el worktree existía uno de **desarrollo**, donde los chunks
no tienen la forma que el test busca. Con un `next build` de producción pasa. El
control fue correrlo sobre `main`, donde ya pasaba.

---

## 7. Limitaciones — lo que este arreglo NO resuelve

1. **No impide que el token se consuma antes de que llegue el usuario.** Si algo
   abre el enlace primero, la recuperación sigue fallando. Lo que cambia es que
   ahora **se dice por qué** y no se cambia la contraseña de otra cuenta. Quién
   lo consumió sigue sin estar demostrado (§3).
2. **No se pudieron leer los logs de Auth.** La Management API devolvió
   `Unauthorized` con el `SUPABASE_ACCESS_TOKEN` del entorno y el MCP de Supabase
   no tiene credenciales. Sin eso no se puede correlacionar identidad ni token
   entre los eventos del incidente.
3. **No se verificó la plantilla del correo ni la expiración configurada**, por
   lo mismo. La evidencia de que el enlace apunta bien es indirecta: la captura
   del dueño y el `action_link` de `generate_link`.
4. **No se probó recibiendo un correo real.** Todo se hizo con
   `admin/generate_link`, que devuelve el mismo enlace sin mandar mail. Eso deja
   fuera, a propósito, el comportamiento del cliente de correo — que es
   justamente donde puede estar el consumo previo.
5. **La rama de "identidad" del arreglo** (enlace de una cuenta, sesión de otra
   que Supabase no llegó a reemplazar) está cubierta **sólo por test unitario**:
   no se pudo producir naturalmente en el navegador.
6. **Android no se probó.** El arreglo es de la web, que es donde abre el enlace.
   El retorno nativo y los App Links son otro problema y **no se tocan acá**.

---

## 8. Higiene

- Dos cuentas de prueba creadas (`qa-victima-…`, `qa-objetivo-…`) y **borradas al
  terminar**; verificado que no queda ninguna `qa-` en Auth.
- El enlace de recuperación se pasó al navegador por un servidor local efímero
  para que el token no atravesara la conversación; el archivo se borró.
- No se tocó la cuenta del dueño, ni variables, ni configuración de Supabase, ni
  Producción.
- Se corrió `npm install` en el checkout principal: `package.json` ya declaraba
  los paquetes de Capacitor y no estaban instalados. `package.json` y
  `package-lock.json` quedaron **sin modificar**, y de paso `tsc` sobre `main`
  pasó de 10 errores a 0 — los 10 eran esos paquetes faltantes, no código.
