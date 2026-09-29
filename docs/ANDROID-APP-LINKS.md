# Android App Links: salas de Yumpeá y fichas compartidas

Qué hace que un enlace recibido por WhatsApp abra **la app** y no Chrome. Son
dos enlaces públicos, los dos HTTPS y canónicos —nunca un esquema privado como
`yump://`—, porque quien los recibe puede no tener la app:

| Enlace público | Con Yump instalada y el dominio verificado | Sin la app |
|---|---|---|
| `https://app.yump.ar/sala/<uuid>` (invitación) | abre la sala en la app: `/s/?id=<uuid>` | abre la sala web |
| `https://app.yump.ar/titulo/movie/<id>` y `/titulo/tv/<id>` (el enlace de un match, desde el 28/09) | abre la ficha en la app: `/t/?tipo=…&id=…` | abre la ficha web |

Tres piezas: el intent-filter, el manejo del intent y `assetlinks.json`.

## 1. Los intent-filters

`android/app/src/main/AndroidManifest.xml`, dentro de `MainActivity`, **dos**
filtros con `autoVerify`:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="app.yump.ar" android:pathPrefix="/sala/" />
</intent-filter>
<intent-filter android:autoVerify="true">
    <!-- mismas action y category -->
    <data android:scheme="https" android:host="app.yump.ar" android:pathPrefix="/titulo/movie/" />
    <data android:scheme="https" android:host="app.yump.ar" android:pathPrefix="/titulo/tv/" />
</intent-filter>
```

🔴 **Acotados a propósito.** Con `pathPrefix` la app se ofrece sólo para esos
tres prefijos; el resto de `app.yump.ar` sigue abriendo en el navegador, que es
lo que la gente espera de un link cualquiera del sitio. Para las fichas van dos
prefijos exactos (`/titulo/movie/`, `/titulo/tv/`) y no `/titulo/` a secas. Un
test fija que sean exactamente esos tres y que no haya esquema privado.

`android:launchMode="singleTask"` ya estaba y es lo que evita que el enlace abra
una instancia nueva encima de la que ya está corriendo.

## 2. El manejo del intent

`components/nativo/EnlacesEntrantes.tsx` (se llamaba `EnlacesDeSala`), montado en
el layout raíz, con la lógica en `atenderEnlaces` de `lib/enlaces-app.ts`
(se llamaba `lib/sala/enlace-nativo.ts`).

**Hacen falta los dos caminos y ése es el punto:**

| Situación | Cómo llega |
|---|---|
| App **cerrada** | El intent ya está al arrancar → `App.getLaunchUrl()` |
| App **en segundo plano** | Llega como evento → `App.addListener("appUrlOpen")` |

`appUrlOpen` no se dispara nunca en el arranque en frío, porque el listener se
registra después. Atender uno solo deja la mitad de los casos sin abrir el
enlace, y es justo la mitad que no se nota probando con la app abierta. Los dos
caminos están probados con un plugin simulado (`lib/sala/android.test.ts`).
Se navega con `router.replace`, no `push`: el enlace es el destino, no un paso
adelante.

La url pública se traduce a la ruta interna con `rutaDeEnlace`. Es **lista
blanca**, no un saneador: sólo `https`, sólo el host canónico exacto (sin
subdominios, credenciales ni puerto), sólo el path exacto
(`/sala/<uuid>`, `/titulo/movie|tv/<id>` con id de 1 a 10 dígitos sin ceros a la
izquierda, barra final opcional). La query y el fragmento se ignoran: WhatsApp
agrega parámetros y la invitación trae `?organizador=` (sólo presentación, ver
`lib/sala/invitacion.ts`). Un intent puede traer cualquier cosa.

## 3. `assetlinks.json`

🔴 **Sin este archivo NO está garantizado que el enlace abra la app.** El enlace
**funciona igual** —quien lo recibe llega a la sala o a la ficha, porque si no
abre la app abre la web—, pero la verificación del dominio **falla**, y de eso
depende que Android ofrezca la app.

⚠️ **En Android 12 o posterior, un filtro de enlaces web que no verificó NO se
ofrece**: el enlace abre el navegador directamente, sin diálogo. El usuario puede
habilitarlo a mano en Ajustes → Apps → Yump → Abrir enlaces admitidos, pero eso
es una excepción manual, no una prueba.

**Estado:** `public/.well-known/assetlinks.json` tiene las **tres** huellas de
**firma de aplicación** que el dueño copió de Play Console el 27/09 (clásica
actual, poscuántica y clásica anterior), y el deploy del 27/09 lo sirve:
comprobado contra `app.yump.ar` → **200, `application/json`, 0 redirecciones**
(ver `docs/ESTADO.md`). El archivo verifica el **dominio**, no una ruta: el
filtro nuevo de `/titulo/` no necesita cambiarlo, y **no se cambió**.

🔴 **Ninguna de las tres es la de SUBIDA.** Están una debajo de la otra en la
misma pantalla de Play Console, y con la de subida la verificación falla en
silencio. Hay un test que compara las tres contra la lista y **rechaza
explícitamente** la de subida.

⏳ **Lo que sigue pendiente, y no se afirma hasta verlo:** `app.yump.ar:
verified` en un teléfono con la app instalada desde Play. Y el filtro de fichas
llega recién con el próximo AAB: la versión que está en Alpha (`versionCode 2`)
sólo declara `/sala/`.

### De dónde salieron las huellas (ya hecho, se documenta para la próxima)

**Play Console → tu app → Test and release → Setup → App integrity → pestaña
"App signing" → "App signing key certificate" → `SHA-256 certificate
fingerprint`.** Se copia tal cual, en mayúsculas y con los dos puntos.

- Es la del **certificado de firma de la app** (App Signing), **no** la del
  *upload key certificate*, que está justo debajo.
- **No es una clave privada.** Es una huella pública.
- Si alguna vez se instala un **APK firmado localmente** (no bajado de Play), su
  huella es otra y no verifica. Para probar App Links con un build local hay que
  agregar **también** esa huella al mismo array.

### Cómo verificar en un teléfono

```bash
curl -sI https://app.yump.ar/.well-known/assetlinks.json
adb shell pm get-app-links ar.yump.app
adb shell am start -a android.intent.action.VIEW -d "https://app.yump.ar/sala/<uuid>"
adb shell am start -a android.intent.action.VIEW -d "https://app.yump.ar/titulo/movie/438631"
```

La segunda tiene que decir `app.yump.ar: verified`. Si dice `none` o `ask`, la
verificación no pasó: re-disparala con
`adb shell pm verify-app-links --re-verify ar.yump.app`. Puede tardar unos
minutos después de instalar; un `none` inmediato no es concluyente.

## Lo que NO se hizo, y por qué

- **No se capturó el dominio entero** ni se agregó un esquema privado.
- **No se tocó `prefer_related_applications`** del manifest web.
- **Nada probado en un teléfono.** Todo lo de arriba está comprobado en código,
  en tests y en el manifest del paquete, que es otra cosa.

## Un detalle del entorno de build

`npm run build:capacitor` exige `NEXT_PUBLIC_SITE_URL` en `.env.local` (la
allowlist del script). Es pública —la misma que está en Vercel y en el Site URL
de Supabase—:

```
NEXT_PUBLIC_SITE_URL=https://app.yump.ar
```
