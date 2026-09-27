# Android App Links para las salas de Yumpeá

Qué hace que un enlace de invitación recibido por WhatsApp abra **la app** y no
Chrome. Tres piezas; dos están hechas y **una depende de un dato que sólo está
en Play Console**.

## 1. El intent-filter (hecho)

`android/app/src/main/AndroidManifest.xml`, dentro de `MainActivity`:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="app.yump.ar" android:pathPrefix="/sala/" />
</intent-filter>
```

🔴 **Acotado a `/sala/` a propósito.** Con `pathPrefix` la app se ofrece sólo
para los enlaces de sala; el resto de `app.yump.ar` sigue abriendo en el
navegador, que es lo que la gente espera de un link cualquiera del sitio.
Verificar el dominio entero le sacaría a Chrome toda la navegación del sitio sin
que nadie lo haya pedido.

`android:launchMode="singleTask"` ya estaba y es lo que evita que el enlace abra
una instancia nueva encima de la que ya está corriendo.

## 2. El manejo del intent (hecho)

`components/nativo/EnlacesDeSala.tsx`, montado en el layout raíz.

**Hacen falta los dos caminos y ése es el punto:**

| Situación | Cómo llega |
|---|---|
| App **cerrada** | El intent ya está al arrancar → `App.getLaunchUrl()` |
| App **en segundo plano** | Llega como evento → `App.addListener("appUrlOpen")` |

`appUrlOpen` no se dispara nunca en el arranque en frío, porque el listener se
registra después. Atender uno solo deja la mitad de los casos sin abrir la sala,
y es justo la mitad que no se nota probando con la app abierta.

La url pública se traduce a la ruta interna con `lib/sala/enlace-nativo.ts`:
`https://app.yump.ar/sala/<uuid>` → `/s/?id=<uuid>`. Es **lista blanca**, no un
saneador: sólo el host canónico, sólo `https`, sólo esa forma exacta. Un intent
puede traer cualquier cosa.

## 3. `assetlinks.json` — ✅ preparado, ⏳ falta desplegarlo y verificarlo

🔴 **Sin este archivo NO está garantizado que el enlace abra la app.** Conviene
no confundir dos cosas: el enlace **funciona igual** —quien lo recibe llega a la
sala, porque si no abre la app abre `app.yump.ar/sala/<uuid>` en el navegador—,
pero la verificación del dominio **falla**, y de eso depende que Android ofrezca
la app.

⚠️ **En Android 12 o posterior, un filtro de enlaces web que no verificó NO se
ofrece**: el enlace abre el navegador directamente, sin diálogo. No hay
desambiguador. (En Android 11 y anteriores sí aparecía "¿Con qué app abrir?", que
al menos dejaba elegir.) El usuario puede habilitarlo a mano en Ajustes → Apps →
Yump → Abrir enlaces admitidos, pero eso es una excepción manual, no una prueba.

Por eso la apertura desde WhatsApp **no se puede dar por aprobada** hasta
desplegar este archivo con la huella correcta y ver `verified` en un teléfono.

### Qué archivo

Se sirve en `https://app.yump.ar/.well-known/assetlinks.json`, con
`Content-Type: application/json` y **sin redirecciones** (Android no las sigue):

El contenido real está en el repositorio; la forma es ésta, con las tres huellas
de **firma de aplicación** en el array:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ar.yump.app",
    "sha256_cert_fingerprints": ["…clásica actual…", "…poscuántica…", "…clásica anterior…"]
  }
}]
```

**Ya está escrito en `public/.well-known/assetlinks.json`**, con las **tres**
huellas de firma de aplicación que el dueño copió de Play Console el 27/09: la
clásica actual, la poscuántica y la clásica anterior. El array admite varias y
las tres tienen que estar.

🔴 **Ninguna de las tres es la de SUBIDA.** Están una debajo de la otra en la
misma pantalla, y con la de subida la verificación falla en silencio. Hay un test
que compara las tres contra la lista y **rechaza explícitamente** la de subida.

**Comprobado, además de la forma del JSON:** que Next lo sirve de verdad. Un
`public/` con carpeta que empieza con punto no es obvio, así que se levantó el
build de producción y se pidió la url: **HTTP 200,
`application/json; charset=UTF-8`, 0 redirecciones** — que es exactamente lo que
Android necesita, porque no sigue redirecciones.

### 🔴 De dónde salieron las huellas (ya hecho, se documenta para la próxima)

**Play Console → tu app → Test and release → Setup → App integrity → pestaña
"App signing" → "App signing key certificate" → `SHA-256 certificate
fingerprint`.** Se copia tal cual, en mayúsculas y con los dos puntos.

Tres precisiones que hacen la diferencia:

- Es la del **certificado de firma de la app** (App Signing), **no** la del
  *upload key certificate*, que está en la misma pantalla, justo debajo. Es el
  error clásico: con la de subida la verificación falla en silencio.
- **No es una clave privada.** Es una huella pública; se puede pegar en un
  archivo que sirve todo internet. No me mandes el keystore ni su contraseña.
- Si alguna vez se instala un **APK firmado localmente** (no bajado de Play), su
  huella es otra y no verifica. Para probar App Links con un build local hay que
  agregar **también** esa huella al mismo array — el array admite varias.

### Cómo verificar, después de desplegarlo

```bash
curl -sI https://app.yump.ar/.well-known/assetlinks.json
adb shell pm get-app-links ar.yump.app
adb shell am start -a android.intent.action.VIEW -d "https://app.yump.ar/sala/<uuid>"
```

La segunda tiene que decir `app.yump.ar: verified`. Si dice `none` o
`ask`, la verificación no pasó: re-disparala con
`adb shell pm verify-app-links --re-verify ar.yump.app`.

## Lo que NO se hizo, y por qué

- 🔴 **No se desplegó.** El archivo está en el repositorio pero `app.yump.ar`
  todavía lo sirve en 404: hace falta un deploy, que necesita autorización.
  **Mientras tanto la apertura automática desde WhatsApp NO está aprobada**, y no
  lo va a estar hasta ver `app.yump.ar: verified` en un teléfono real.
- **No se tocó `prefer_related_applications`** del manifest web. Es el mecanismo
  por el que Chrome suprime su propio aviso de instalación de PWA a favor de la
  app de Play; lo evaluamos aparte.
- **Nada probado en un teléfono.** Todo lo de arriba está comprobado en código y
  en el manifest fusionado del APK, que es otra cosa.

## Un detalle del entorno de build

`npm run build:capacitor` **falla en esta máquina** antes de compilar:

```
Error: faltan variables públicas: NEXT_PUBLIC_SITE_URL
```

La allowlist del script exige esa variable y `.env.local` no la tiene. Para las
corridas de esta sesión se inyectó desde afuera, sin tocar el archivo. Para que
el comando funcione tal cual, agregar a `.env.local`:

```
NEXT_PUBLIC_SITE_URL=https://app.yump.ar
```

Es la misma que usa el correo de recuperación de contraseña, así que conviene
que coincida con la allowlist de Redirect URLs de Supabase.
