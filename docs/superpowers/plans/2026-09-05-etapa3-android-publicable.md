# Etapa 3 — Android publicable (plan, revisión 1)

> Escrito el **5 de septiembre de 2026**, después de cerrar la Etapa 2. Reemplaza
> operativamente la lista de "Etapa 3" de `docs/CAPACITOR.md`, que se escribió
> **antes** del prototipo y quedó desactualizada. Ese texto se conserva ahí como
> historia de lo que se planeaba, no como cola de trabajo.

Rama: **`integracion/capacitor-base`**, nacida de `main` en `5297e25`. **No sale
del spike descartable** — el spike (`spike/capacitor-android`, `5d5180f`) queda
íntegro como archivo de evidencia y no se toca.

## 0. Diagnóstico: qué de la Etapa 3 histórica ya no aplica

La sección "Etapa 3" de `docs/CAPACITOR.md` listaba nueve ítems. **Siete están
resueltos y dos resultaron innecesarios**, y eso lo demostró el prototipo, no una
opinión:

| Ítem histórico | Estado real | Evidencia |
|---|---|---|
| Base URL de la API + CORS | ✅ **hecho y extraído** | `lib/api-base.ts`, `lib/cors.ts`, 26 rutas clasificadas |
| Helper `hrefTitulo`/`hrefPersona` | ✅ **hecho y extraído** | `lib/rutas.ts`; en el teléfono, 304 cards nacieron como `/t/?…` |
| `abrirExterno()` con `@capacitor/browser` | ❌ **INNECESARIO** | CP8 #2: un enlace externo abrió la app de Google Calendar y la WebView **no se secuestró**, quedó en `https://localhost/` |
| `@capacitor/share` | ✅ **hecho y extraído** | CP9: `ChooserActivity` nativo con `https://app.yump.ar/titulo/...` |
| Embed de YouTube | ✅ **funciona sin cambios** | CP10: `videoplayback` 200 y el reloj avanza 8,5 s en dos títulos |
| Gatear `InstallPrompt`, `ServiceWorkerRegister`, `UpdateToast` | ✅ **hecho y extraído** | CP6; en el artefacto `getRegistrations()` → `[]` |
| Adaptador de `@capacitor/preferences` | ❌ **INNECESARIO** | CP8 #14 y #15: la sesión y `sc:platforms` sobreviven a `am force-stop` con `localStorage` |
| `searchParams` de `/categoria` al cliente | ✅ **hecho y extraído** | `CategoriaEntrada` + `CategoriaSkeleton` |
| `tsc`, suite y build limpios | ✅ | 1021/1021, `tsc` 0, build 43/43 en la rama limpia |

🔴 **No se reinstala ni se reimplementa nada de eso.** Dos plugins que el plan
viejo daba por necesarios —`@capacitor/browser` y `@capacitor/preferences`— **no
se instalan**, porque el prototipo demostró que no hacen falta.

### Afirmación operativa corregida

`docs/ESTADO.md` decía *"Capacitor: PAUSADO después de CP6, el spike sigue en
`e4d4a6f`, CP7 sin empezar"*. Era cierto cuando se escribió y dejó de serlo:
la Etapa 2 se completó hasta CP11. Se corrige, porque es una línea de **estado
vigente**, no un registro fechado.

## 1. Trabajo ya resuelto y extraído

Los 84 archivos que trajo la extracción de CP11, en cinco commits
(`29e0176`…`ab48f76`): la bandera `ES_NATIVO`, `apiUrl()`, `lib/rutas.ts`, el
staging del export, CORS con inventario cerrado, la neutralización de la PWA, el
`?tipo=` fuera del Server Component, las rutas `/t` y `/p`, y los tres plugins
con sus adaptadores.

**`lib/compartir.ts` sigue sin tocarse**, y hay un test que lo vigila.

## 2. Primera tanda — aprobada el 5/09

Decisiones que el dueño aprobó y que esta tanda ejecuta:

1. **`/t` y `/p` con `noindex`**, no canonical.
2. **`appId: ar.yump.app`**, nombre visible **Yump**.
3. Los **seis** paquetes de Capacitor pasan a formar parte de la app.

Alcance:

- `noindex` en `/t` y `/p`, RED → GREEN, verificado en el **HTML generado** y no
  sólo por grep. Las rutas normales conservan su metadata.
- `capacitor.config.ts` limpio, **generado**, no copiado del spike.
- `android/` **generado desde cero** con el identificador definitivo.
- Confirmar las seis dependencias en su sección.

⚠️ **`android:enableOnBackInvokedCallback="false"` NO se copia.** En CP9 se
agregó al spike sobre una hipótesis que resultó falsa —la causa del botón Atrás
era `canGoBack`, que no ve las navegaciones `pushState`— y el atributo se
conservó allá por precaución. Acá se arranca **sin él**; si una prueba sobre el
proyecto limpio demuestra que hace falta, se agrega con esa evidencia escrita.

**Esta tanda NO instala el APK en el teléfono.** Termina con el proyecto generado
y compilado.

## 3. Decisiones pendientes — ninguna se toma en esta tanda

| Decisión | Por qué importa | Cuándo |
|---|---|---|
| **Tipo de cuenta de Google Play** | personal u organización cambia requisitos de verificación y tiempos | antes de crear la ficha |
| **Keystore y Play App Signing** | perder la clave de subida es un trámite con Google | antes del primer AAB |
| **Íconos y splash definitivos** | hoy son los de la plantilla de Capacitor | antes de publicar |
| **Notificaciones locales en v1** | define si entra un plugin más | antes de cerrar el alcance de v1 |
| **Reemplazo de Vercel Analytics en Android** | en el contenedor postea a `/_vercel/insights` del origen local y da 404 | medir costo antes de recomendar |
| **Destino de la cookie `sc_platforms`** | en el contenedor es lo único que sostiene las plataformas hasta que el usuario elige | próxima tanda |
| **Subrutas directas y 404 del servidor local** | `/lista/ultimos/` sirve el `index.html` raíz; una ruta inexistente da 200 | próxima tanda |
| **`.ics`** | no llegó a probarse en CP8 | próxima tanda |
| **iOS** | Mac remota y guideline 4.2 | Etapa 8 |

## 4. Tareas de etapas posteriores

- Íconos, splash y ficha de Play.
- Keystore, Play App Signing y `assetlinks.json` con el SHA-256 correcto.
- Pruebas internas y publicación (Etapas 5 y 6).
- Evaluación del resultado de Android (Etapa 7).
- iOS (Etapas 8 y 9).

## 5. Criterios de cierre de esta tanda

Cierra cuando, **en la rama limpia**:

- `/t` y `/p` emiten `noindex` en el HTML del build web, y siguen presentes y
  funcionales en el export nativo;
- existe `capacitor.config.ts` con `ar.yump.app` / `Yump` / `out-capacitor`, sin
  `server.url` y sin iOS;
- existe `android/` generado con ese identificador, `compileSdk` y `targetSdk`
  36, un solo permiso de sistema (`INTERNET`) y los tres plugins registrados;
- **no queda ni un rastro de `ar.yump.app.dev`** ni rutas absolutas de esta
  máquina versionadas;
- la suite, `tsc`, el build web, el export nativo, `cap sync` y el build Android
  debug pasan;
- la PWA web sigue intacta y el artefacto nativo sigue sin PWA.

## 6. Puntos de parada

🔴 **Se frena y se pide decisión antes de:** crear un keystore o cualquier firma
de publicación, tocar Google Play, instalar el APK en el teléfono, pushear la
rama, mergear a `main`, o empezar la tanda siguiente.

Nada de esta etapa toca Producción, Vercel, Supabase ni sus variables.
