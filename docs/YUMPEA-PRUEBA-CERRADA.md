# Yumpeá en la prueba cerrada de Google Play

Cómo llevar Yumpeá al canal de **prueba cerrada que ya existe** (Alpha, con los
testers inscritos), actualizando la app instalada **sin desinstalarla**.

🔴 **Nada de este documento se ejecutó.** Todo lo que toca Play, Vercel o
Supabase Producción espera autorización explícita del dueño.

## 1. Qué se pudo compilar de verdad

| Artefacto | Estado | Evidencia |
|---|---|---|
| **APK de depuración** | ✅ compila | `./gradlew assembleDebug` → BUILD SUCCESSFUL, `app-debug.apk` (10,5 MB), con el intent-filter en el manifest fusionado |
| **Paquete web de release** | ✅ compila | `node scripts/build-capacitor.mjs --release --api-base=https://app.yump.ar` → 35 rutas en 38 html |
| **Guard de base de API** | ✅ pasa | `./gradlew verificarBaseDeApi` → "el paquete web apunta a https://app.yump.ar" |
| **AAB firmado** | ❌ **NO se puede hoy** | `./gradlew bundleRelease` → falla en `verificarFirmaDeCarga` |

El error exacto del AAB:

```
Execution failed for task ':app:verificarFirmaDeCarga'.
> falta …\android\keystore.properties (o esta incompleto). Una release necesita
  la clave de carga y NO se firma con la clave de depuracion.
```

**Falta una sola cosa: `android/keystore.properties`**, que está fuera de Git a
propósito y apunta al keystore del dueño. El build no cae a la clave de
depuración ni produce un artefacto sin firmar: corta antes, que es lo correcto.

⚠️ **Un APK de depuración NO sirve para probar sin desinstalar.** Tiene otra
firma que el instalado desde Play, y Android rechaza la instalación con "App not
installed" cuando el `applicationId` coincide y la firma no. Para actualizar la
app de la prueba cerrada **el único camino es subir un AAB a Play**.

## 2. `versionCode`: hay que comprobarlo antes de tocarlo

| Fuente | Dice |
|---|---|
| `android/app/build.gradle` | `versionCode 1`, `versionName "1.0.0"` |
| `docs/ESTADO.md` (heredado) | prueba cerrada Alpha, "versión 1 (1.0.0)" |

**Ninguna de las dos es autoritativa.** El número que manda es el más alto
subido a **cualquier** canal de esa app. Se lee en:

> Play Console → tu app → **Test and release → App bundle explorer** (o
> Testing → Closed testing → el canal Alpha → la release activa).

El `versionCode` nuevo tiene que ser **estrictamente mayor** que ése. Si Play
dice 1, va `versionCode 2`; si dice otra cosa, va ese número más uno. **No lo
cambié**: es una línea y depende de un dato que sólo está en tu consola.

## 3. El bloqueo real: el AAB apunta a Producción y las salas no están ahí

El artefacto de Play sólo puede apuntar a `https://app.yump.ar` — lo fuerzan dos
guards, y aflojarlos tiene una consecuencia concreta: una Preview de Vercel
responde **302 al SSO** y la app lo muestra como "sin conexión", en el teléfono
de un tester y no antes. Por eso **no los toqué**.

Desde el teléfono se usan **dos** backends, y los dos tienen que estar listos:

| Qué | Dónde | Estado hoy |
|---|---|---|
| `POST /api/sala/preparar` (la única ruta de servidor) | Vercel, `app.yump.ar` | ❌ no existe en `origin/main` |
| Crear, entrar, estado, votar, desempatar, cerrar y Realtime | **Supabase Producción, directo desde el teléfono** | ❌ sin tablas ni funciones |

O sea que no alcanza con subir el AAB: sin backend, en el teléfono se ve la
entrada de Yumpeá y nada más.

### La forma más segura, sin un segundo proyecto de Supabase

Usar el proyecto que ya existe, **con las salas naciendo apagadas**. La
migración está diseñada justo para eso: `sala_config` nace con
`activas = 'false'`, así que aplicarla no habilita nada.

**Y la verificación va ANTES de tocar Play:** una vez que el backend está vivo,
se completa una sala real **desde el navegador del teléfono** en
`app.yump.ar/sala/nueva`. Es el mismo Supabase, la misma API y las mismas RPC
que va a usar la app; lo único que no cubre es el contenedor y los App Links.
Recién si eso anda se justifica subir un AAB.

## 4. Los cuatro pasos que requieren tu autorización

### Paso 1 — Migración en Supabase Producción (salas APAGADAS)

**Qué cambia:** se crean **6 tablas** (`rooms`, `room_participants`,
`room_rounds`, `room_titles`, `room_votes`, `sala_config`), **24 funciones** y
**un cron** (`sala-barrido`, cada minuto, borra salas vencidas). RLS activo y
**sin policies**: nada es accesible salvo por las funciones.

**Qué NO cambia:** nada existente. La migración no menciona `roulette_titles`,
`title_availability`, `get_roulette_picks`, `profiles` ni `votes`; hay un test
que lo verifica sobre el archivo de reversión.

**Cómo se comprueba:**

```sql
select valor from sala_config where clave = 'activas';   -- tiene que decir false
select sala_activas();                                    -- false
select jobname, schedule from cron.job where jobname = 'sala-barrido';
```

**Cómo se revierte:** `supabase/migrations/009_salas_down.sql` — desagenda el
cron, borra las 24 funciones y las 6 tablas en orden inverso. No toca nada más.

**Riesgo con las salas apagadas: ninguno para los usuarios.** Ningún código
desplegado referencia esas tablas todavía.

### Paso 2 — Deploy del código a Producción

Es lo que pone `/api/sala/preparar` en `app.yump.ar`. Implica **merge y push de
`feat/salas`**, que no están autorizados.

**Con la entrada oculta en la web.** En Vercel Producción:

```
NEXT_PUBLIC_SALAS_ACTIVAS = 0      → la entrada de Yumpeá NO se dibuja en la web
SALAS_ACTIVAS             = (sin definir)  → la API sí responde: la app la necesita
```

🔴 **La app de Play NO se entera de `NEXT_PUBLIC_SALAS_ACTIVAS=0`, y está
verificado.** El build nativo arma su entorno desde cero, sin heredar
`process.env`, y sólo pasa tres variables públicas por allowlist; esa no está.
Llega `undefined` al bundle, y `undefined !== "0"`. Hay un test que fija las dos
allowlists justamente para que esto no se rompa sin avisar.

⚠️ **Las variables de Vercel se aplican en el deployment SIGUIENTE**, así que hay
que definirlas antes de deployar, no después.

**Cómo se comprueba:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.yump.ar/api/sala/preparar
# 400 o 401 = la ruta existe.  404 = el deploy no llegó.  503 = SALAS_ACTIVAS=0
```

Y en la web, que el banner de Yumpeá **no** aparezca en el Home.

**Cómo se revierte:** en Vercel, promover el deployment anterior. Es inmediato y
no depende de git.

⚠️ **Lo que este deploy trae además de las salas:** todo lo de la rama. Conviene
que lo mire tu auditoría antes, que es el paso 6.3 del plan.

### Paso 3 — Encender las salas

```sql
update sala_config set valor = 'true' where clave = 'activas';
```

**Se revierte con la misma consulta y `'false'`**, sin deploy y sin esperar
nada: `sala_crear` y `sala_unirse` empiezan a rechazar en el acto y las salas en
curso terminan solas.

🔴 **Mientras esté encendido, cualquiera que conozca las rutas puede crear una
sala desde la web**, aunque el banner no se dibuje. La entrada oculta es una
decisión de interfaz, no un control de acceso: los controles son estos dos
interruptores. Por eso conviene encenderlo para la ventana de prueba y apagarlo
después.

### Paso 4 — Subir el AAB al canal cerrado que ya existe

Sólo después de completar una sala real desde el navegador del teléfono.

1. Crear `android/keystore.properties` (fuera de Git) con `storeFile`,
   `storePassword`, `keyAlias` y `keyPassword` del keystore de carga.
2. Subir el `versionCode` al número que diga Play, más uno.
3. `node scripts/build-capacitor.mjs --release --api-base=https://app.yump.ar`
4. `node node_modules/@capacitor/cli/bin/capacitor sync android`
5. `./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`
6. Play Console → **Testing → Closed testing → el canal Alpha que ya existe** →
   Create new release → subir el AAB.

**Mismo canal, misma lista de testers.** No hace falta prueba interna ni reducir
la lista: la app instalada se actualiza sola porque Play App Signing vuelve a
firmar con la misma clave, así que la firma no cambia y no hay que desinstalar.

## 5. Lo que tenés que hacer vos

| # | Acción | Por qué no puedo yo |
|---|---|---|
| 1 | Leer el `versionCode` vigente en Play Console | No tengo acceso a tu consola |
| 2 | Crear `android/keystore.properties` con tu keystore de carga | Contraseñas tuyas; no van al repo ni a un chat |
| 3 | Autorizar el **paso 1** (migración en Producción) | Cambia Producción |
| 4 | Autorizar el **paso 2** (merge, push y deploy + dos variables en Vercel) | Cambia Producción |
| 5 | Autorizar el **paso 3** (encender las salas) | Cambia Producción |
| 6 | Copiar la huella SHA-256 de **Play App Signing** | Sólo está en tu consola (ver `ANDROID-APP-LINKS.md`) |
| 7 | Autorizar el **paso 4** (subir el AAB) | Publica, aunque sea a testers |

## 6. Lo que queda apagado

- **El botón de Google Play** del resultado: `NEXT_PUBLIC_YUMP_PLAY_PUBLICA` no
  se define, así que en Android web no se muestra nada. Se enciende recién
  cuando Yump con Yumpeá sea **pública**, no con la prueba cerrada.
- **`assetlinks.json`**: no se creó ni se desplegó. Sin él los enlaces de
  WhatsApp abren la app igual, pero Android puede mostrar el desambiguador.
- **`prefer_related_applications`**: sin tocar.

## 7. Un arreglo local que ya está hecho

`npm run build:capacitor` fallaba con `faltan variables públicas:
NEXT_PUBLIC_SITE_URL`. Se agregó a `.env.local`, que está en `.gitignore`:

```
NEXT_PUBLIC_SITE_URL=https://app.yump.ar
```

**No es un secreto** —es la misma url pública que ya está en Vercel y en el Site
URL de Supabase— y no entra al repositorio. `.env.local.example` ya la
documentaba con el valor vacío; eso no cambió.
