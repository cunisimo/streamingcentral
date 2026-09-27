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
| **Guard de paquete con salas** (nuevo) | ✅ pasa, y falla en rojo | `verificarPaqueteConSalas` → "el paquete trae /s y /sala/nueva"; sacando esa carpeta a mano, corta con el motivo escrito |
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

**Todo lo demás ya está preparado.** El paquete web de release está construido y
sincronizado en `android/app/src/main/assets/public`, y los dos guards que sí
pueden correr pasan. La última corrida llegó exactamente hasta la firma: el
siguiente `bundleRelease`, con el archivo puesto, debería producir el AAB.

Hay una plantilla vacía en **`android/keystore.properties.example`**. El `.jks` y
las contraseñas se quedan en tu máquina: `android/.gitignore` ya ignora
`keystore.properties`, `*.jks` y `*.keystore`, y hay un test que lo verifica.

⚠️ **Falta además subir el `versionCode`**, que depende del dato de Play (§5).

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
migración está diseñada justo para eso: `sala_config` nace apagada, así que
aplicarla no habilita nada.

**Las dos superficies comparten backend**, y eso es lo que permite verificar
antes de tocar Play: el Home web y la app usan el MISMO Supabase, la MISMA ruta
de servidor y las MISMAS RPC. Lo único propio de Android es el contenedor y los
App Links.

**Por eso la verificación va ANTES de subir el AAB:** con el backend vivo se
completa una sala real desde el navegador —escritorio y teléfono— y recién si
eso anda se justifica un artefacto para Play.

⚠️ **Y desde el 27/09 esa verificación no es un ensayo privado.** El dueño
decidió que la entrada NO se oculte en la web, así que el mismo deploy que
habilita la prueba deja Yumpeá viva para cualquiera que entre a `app.yump.ar`.

## 4. Los pasos que requieren tu autorización

🔴 **Decisión del dueño (27/09): la entrada de Yumpeá NO se oculta en la web.**
Una vez encendida, aparece y funciona en el Home web y en la app de la prueba
cerrada. La web no está restringida técnicamente a testers y eso se acepta. El
paso que deployaba con `NEXT_PUBLIC_SALAS_ACTIVAS=0` **se quitó**, y con él la
única variable que había que tocar en Vercel: ahora **no hay que cambiar ninguna**.

⚠️ **Encender es lanzar en la web.** No es un ensayo privado: desde el segundo en
que estén las dos cosas —el código deployado y `activas` en `true`— cualquiera
que entre a `app.yump.ar` ve el banner y puede armar una sala. El interruptor de
Supabase se conserva justamente para poder apagarlo si aparece un problema.

### El ORDEN cambió, y no es un detalle

Encender va **antes** del deploy, no después. Con el orden anterior había una
ventana en la que el banner ya estaba en el Home y tocarlo daba "Las salas están
desactivadas por ahora. Probá más tarde." — un botón visible que falla. Antes
del deploy, en cambio, encender no se nota: ningún código desplegado usa esas
tablas todavía.

| # | Paso | Se nota en la web |
|---|---|---|
| 1 | Migración en Supabase (nace apagada) | no |
| 2 | Encender las salas | no |
| 3 | Deploy del código, **con `assetlinks.json` si la huella ya está** | **sí: Yumpeá queda viva para todos** |
| 4 | Verificar en la web | — |
| 5 | Keystore, versionCode, AAB y subida al canal Alpha | no |
| 6 | Verificar en Android | — |

### Paso 1 — Migración en Supabase Producción (nace apagada)

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

**Riesgo: ninguno para los usuarios.** Ningún código desplegado referencia esas
tablas todavía.

### Paso 2 — Encender las salas, ANTES del deploy

```sql
update sala_config set valor = 'true' where clave = 'activas';
```

**Cómo se comprueba:** `select sala_activas();` devuelve `true`.

**Por qué acá y no después:** evita la ventana del botón que falla. Lo único que
habilita en este momento es que las RPC respondan a quien las conozca; como
`/api/sala/preparar` todavía no existe, ninguna sala puede pasar del lobby y el
barrido las borra solas.

**Cómo se revierte:** la misma consulta con `false`. Inmediato, sin deploy:
`sala_crear` y `sala_unirse` rechazan en el acto y las salas en curso terminan
solas.

### Paso 3 — Deploy del código a Producción

Es lo que pone `/api/sala/preparar` en `app.yump.ar` y lo que hace aparecer el
banner. Implica **merge y push de `feat/salas`**, que no están autorizados.

**Variables de Vercel: ninguna.** `SALAS_ACTIVAS` y `NEXT_PUBLIC_SALAS_ACTIVAS`
se dejan **sin definir**, que es lo que las deja encendidas. Siguen existiendo
como segundo interruptor por si hace falta (ver "Cómo se apaga", abajo).

**Si la huella de Play App Signing ya llegó, `public/.well-known/assetlinks.json`
viaja en este mismo deploy.** Si todavía no llegó, el deploy sale igual y el
archivo va en uno posterior: no bloquea nada de la web, sólo deja pendiente que
el enlace de WhatsApp abra la app (paso 6). **No se despliega una plantilla con
una huella inventada**: Android cachea el resultado de la verificación, así que
un archivo equivocado es peor que ninguno.

⚠️ **Lo que este deploy trae además de las salas:** todo lo de la rama. Conviene
que lo mire tu auditoría antes, que es el paso 6.3 del plan.

**Cómo se revierte:** en Vercel, promover el deployment anterior. Es inmediato,
no depende de git y hace desaparecer el banner por completo.

### Paso 4 — Verificar en la web (antes de tocar Play)

Es la verificación que pediste antes de subir nada, y ahora cubre además la
superficie que acaba de quedar viva para todos.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.yump.ar/api/sala/preparar
# 400 o 401 = la ruta existe.  404 = el deploy no llegó.  503 = SALAS_ACTIVAS=0
```

En el **escritorio** y en el **navegador del teléfono**, con dos participantes:

1. El banner **🍿 Yumpeá · Hacé match** aparece en el Home, debajo del bloque de
   la ruleta.
2. Crear sala, copiar el enlace y comprobar que empieza con
   `https://app.yump.ar/sala/` — nunca `localhost`.
3. El invitado entra **sin cuenta** desde el enlace, y no se le piden
   plataformas.
4. Empezar una tanda de 5, votar en los dos y llegar a un resultado.
5. En la pantalla de resultado, la **invitación a instalar**: en iPhone las
   instrucciones; en Android, **nada** todavía.
6. `select count(*) from rooms;` en Supabase para ver que quedó registrada, y
   que el barrido la borra unos minutos después del cierre.

Es el mismo Supabase, la misma API y las mismas RPC que va a usar la app. Lo
único que **no** cubre es el contenedor y los App Links.

### Paso 5 — Subir el AAB al canal cerrado que ya existe

Sólo después del paso 4.

1. Crear `android/keystore.properties` (fuera de Git) con `storeFile`,
   `storePassword`, `keyAlias` y `keyPassword` del keystore de carga.
2. Subir el `versionCode` al número que diga Play, más uno.
3. `node scripts/build-capacitor.mjs --release --api-base=https://app.yump.ar`
4. `node node_modules/@capacitor/cli/bin/capacitor sync android`
5. `./gradlew bundleRelease`, que deja el AAB en
   `android/app/build/outputs/bundle/release/app-release.aab`
6. Play Console, **Testing → Closed testing → el canal Alpha que ya existe**,
   Create new release, subir el AAB.

**Mismo canal, misma lista de testers.** No hace falta prueba interna ni reducir
la lista: la app instalada se actualiza sola porque Play App Signing vuelve a
firmar con la misma clave, así que la firma no cambia y no hay que desinstalar.

### Paso 6 — Verificar en Android, en el teléfono

Con la app ya actualizada desde la prueba cerrada:

1. El banner de Yumpeá aparece en el Home **de la app**.
2. Crear una sala desde la app y completar la tanda con un segundo
   participante (otro teléfono, o el navegador del escritorio).
3. El enlace que comparte la app empieza con `https://app.yump.ar/sala/`.
4. **Los enlaces de WhatsApp** (ver la advertencia de abajo): abrir el enlace
   con la app **cerrada** y con la app **en segundo plano**.
5. En la pantalla de resultado **no** aparece la invitación a instalar.
6. Botón Atrás en lobby, votación y resultado; y perder conexión a mitad de
   ronda.

#### 🔴 Sin `assetlinks.json`, el punto 4 NO se puede dar por aprobado

Conviene separar dos cosas que se confunden:

- **El enlace funciona igual.** Quien lo recibe llega a la sala: si no abre la
  app, abre `app.yump.ar/sala/<uuid>` en el navegador y la sala anda ahí. Nadie
  se queda sin poder entrar.
- **Lo que NO está garantizado es que abra la app instalada.** El intent-filter
  declara `autoVerify="true"`, pero la verificación la hace Android descargando
  `https://app.yump.ar/.well-known/assetlinks.json` y comparando la huella con la
  firma del paquete. Sin ese archivo, la verificación **falla**.

⚠️ **Y en Android 12 o posterior el resultado de esa falla es peor de lo que
parece.** Desde Android 12, un filtro de enlaces web que no verificó **no se
ofrece**: el enlace abre directamente el navegador, sin preguntar. No hay
desambiguador. (En Android 11 y anteriores sí aparecía el diálogo "¿con qué app
abrir?", que al menos dejaba elegir la app.) El usuario puede habilitarlo a mano
en Ajustes → Apps → Yump → Abrir enlaces admitidos, pero eso no es una prueba de
que funcione: es una excepción manual.

**Por lo tanto:** hasta desplegar el archivo con la huella correcta y comprobar
la verificación en un teléfono, el punto 4 queda **PENDIENTE**, no aprobado. Que
el enlace "abra la sala en el navegador" no es la prueba que buscamos.

#### Preparación de `assetlinks.json`

No se inventó la huella ni se dejó un archivo de plantilla en `public/`: un
`assetlinks.json` con una huella equivocada es **peor** que no tenerlo, porque
Android cachea el resultado de la verificación.

1. El dueño copia el `SHA-256 certificate fingerprint` de **Play App Signing**
   (Play Console → Test and release → Setup → App integrity → pestaña **App
   signing** → *App signing key certificate*). **No** es el *upload key
   certificate*, que está justo debajo. Es una huella **pública**: no es una
   clave privada y no expone el keystore.
2. Con ese dato se crea `public/.well-known/assetlinks.json` (el contenido exacto
   está en [`ANDROID-APP-LINKS.md`](ANDROID-APP-LINKS.md)).
3. Se despliega **con el mismo deploy del paso 3**, o con uno posterior. Tiene
   que responder 200, `Content-Type: application/json` y **sin redirecciones**:
   Android no las sigue.
4. Recién ahí se comprueba en el teléfono:

```bash
curl -sI https://app.yump.ar/.well-known/assetlinks.json
adb shell pm get-app-links ar.yump.app     # tiene que decir  app.yump.ar: verified
adb shell pm verify-app-links --re-verify ar.yump.app   # si dice none o ask
```

⚠️ Si el teléfono tiene un **APK firmado localmente** en vez del de Play, su
firma es otra y no verifica aunque el archivo esté bien. Para ese caso se agrega
también esa huella al mismo array, que admite varias.

⚠️ La verificación de Android puede tardar unos minutos después de instalar, y
se vuelve a intentar sola. Un `none` inmediato no es concluyente.

### Cómo se apaga, si algo sale mal

🔴 **Después de distribuir el AAB, volver al deployment web anterior NO deshace
nada en los teléfonos.** La actualización ya está instalada y Google Play no la
"desinstala": lo más que se puede hacer es detener la distribución (*halt
rollout*) para que no le llegue a quien todavía no la bajó, y publicar una
versión nueva con un `versionCode` mayor. Los teléfonos que ya actualizaron
siguen con Yumpeá adentro, apuntando al mismo backend.

**Por eso el primer freno es Supabase**, no Vercel ni Play: es lo único que actúa
sobre lo que los teléfonos ya instalados escriben directo en la base.

| # | Herramienta | Efecto | Alcance | Cuándo se aplica |
|---|---|---|---|---|
| **1** | `sala_config.activas` en `false` | Nadie crea ni entra; las salas en curso terminan solas. El banner sigue visible y avisa "Las salas están desactivadas por ahora. Probá más tarde." | **Web y app, incluidos los teléfonos ya actualizados** | **Inmediato**, sin deploy |
| 2 | Promover el deployment anterior en Vercel | El banner desaparece de la web y `/api/sala/preparar` vuelve a no existir. En la app, el banner **sigue ahí** y ninguna tanda puede prepararse | Web completa; app a medias | Inmediato |
| 3 | `NEXT_PUBLIC_SALAS_ACTIVAS=0` / `SALAS_ACTIVAS=0` | Oculta el banner web / 503 en la API | La app **no se entera** del primero: no viaja en el paquete | ⚠️ Sólo en el deployment siguiente |
| 4 | Play Console → *halt rollout* del canal cerrado | Frena la distribución a quien no actualizó | No revierte a quien ya actualizó | Minutos |
| 5 | `009_salas_down.sql` | Retira tablas, funciones y cron | Todo | Cuando se decida abandonar |

El orden ante un problema es **1**, y después mirar. El 2 arregla la web pero
deja la app con un botón que falla, así que no sustituye al 1.

## 5. Los dos datos que necesito de Play Console

Son los únicos que me faltan, y ninguno es secreto.

| Dato | Dónde está | Para qué |
|---|---|---|
| **El `versionCode` más alto** subido a cualquier canal | Play Console → Test and release → **App bundle explorer** (o el canal Alpha → la release activa) | El nuevo tiene que ser estrictamente mayor. Hoy el repo dice `1` |
| **La huella SHA-256 de Play App Signing** | Play Console → Test and release → Setup → **App integrity** → pestaña *App signing* → **App signing key certificate** | `assetlinks.json`, para que el enlace de WhatsApp abra la app |

⚠️ La segunda **no** es la del *upload key certificate*, que aparece justo debajo
en la misma pantalla. Con ésa la verificación falla en silencio.

🔴 **Lo que NO necesito y no hay que mandarme nunca:** el archivo `.jks`, su
contraseña, la del alias o el alias mismo. Eso se queda en tu máquina, en
`android/keystore.properties`, que ya está en `.gitignore` junto con `*.jks` y
`*.keystore`. No lo pido por chat, no lo escribo en un log y no entra a Git. Hay
una plantilla vacía en `android/keystore.properties.example`.

## 6. Lo que tenés que hacer o autorizar

| # | Acción | Por qué no puedo yo |
|---|---|---|
| 1 | Pasarme los **dos datos** de la tabla de arriba | No tengo acceso a tu consola |
| 2 | Crear `android/keystore.properties` desde la plantilla | Contraseñas tuyas; no salen de tu máquina |
| 3 | Autorizar el **paso 1** (migración en Producción, apagada) | Cambia Producción |
| 4 | Autorizar el **paso 2** (encender las salas) | Cambia Producción |
| 5 | Autorizar el **paso 3** (merge, push y deploy). **Ninguna variable de Vercel que tocar** | Cambia Producción, y deja Yumpeá viva en la web para todos |
| 6 | Autorizar el **paso 5** (subir el AAB al canal Alpha) | Publica, aunque sea a testers |

## 7. Lo que queda apagado

- **El botón de Google Play** del resultado: `NEXT_PUBLIC_YUMP_PLAY_PUBLICA` no
  se define, así que en Android web no se muestra nada. 🔴 Se enciende recién
  cuando Yump con Yumpeá sea **pública**. Terminar la prueba cerrada NO alcanza:
  la ficha de Play no le sirve a quien no está en la lista de testers, y ése es
  justamente el enlace inutilizable que no queremos mostrar.
- **`assetlinks.json`**: no se creó ni se desplegó, y no se inventó la huella.
  Sin él el enlace de WhatsApp **lleva a la sala igual** —abre `app.yump.ar` en
  el navegador— pero **no está garantizado que abra la app instalada**: en
  Android 12+ abre el navegador directamente, sin preguntar. Ver el paso 6.
- **`prefer_related_applications`**: sin tocar.

## 8. Un arreglo local que ya está hecho

`npm run build:capacitor` fallaba con `faltan variables públicas:
NEXT_PUBLIC_SITE_URL`. Se agregó a `.env.local`, que está en `.gitignore`:

```
NEXT_PUBLIC_SITE_URL=https://app.yump.ar
```

**No es un secreto** —es la misma url pública que ya está en Vercel y en el Site
URL de Supabase— y no entra al repositorio. `.env.local.example` ya la
documentaba con el valor vacío; eso no cambió.
