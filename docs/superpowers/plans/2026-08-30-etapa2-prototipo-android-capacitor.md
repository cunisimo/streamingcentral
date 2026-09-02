# Etapa 2 — Prototipo Android con Capacitor (plan, revisión 7)

> **CP1 a CP6 están HECHOS** en `spike/capacitor-android`. **CP7 no empezó**, y
> con él sigue sin haber Capacitor instalado, sin `android/`, sin
> `capacitor.config.*` y sin `cap init`. El banner original de esta revisión
> decía "CP1 está HECHO, el resto no": se actualiza el estado, no se reescribe
> ninguna medición.

## ✅ CP1 — completado el 30/08/2026

**Aprobado, con una prueba diferida a CP2.** Commit `d53883b`.

### Lo que se implementó
`next.config.mjs` condicional · `scripts/build-capacitor.mjs` (mínimo, sólo
diagnóstico) · `scripts/config.test.mjs` · script `build:capacitor` · las tres
entradas de `.gitignore`. **Cero dependencias agregadas** — `serve` no entró
porque CP1 no sirve nada.

### 🔴 Hallazgo 1: `pageExtensions: ["tsx"]` ROMPE el build

Con ese valor el build muere con **`pageExtensions.map is not a function`** sobre
`next/dist/client/components/not-found-error` y sobre **cada** página. El motivo:
**los componentes internos de Next son `.js`**, y sacarlos de la lista hace que
no los pueda resolver.

**Valor corregido y confirmado por el dueño: `["tsx", "jsx", "js"]`** — el
**default de Next 14 menos `"ts"`**. Es el cambio quirúrgico: conserva los
internos JavaScript y excluye `route.ts` y `app/manifest.ts`. Con eso el build
llega a `✓ Compiled successfully`.

El resto del documento ya usa el valor corregido. Las dos menciones a
`["tsx"]` que quedan son éstas, que describen el error.

### 🔴 Hallazgo 2: el guard de "ejecutado directamente" falla en Windows

`import.meta.url` es `file:///D:/…` con **tres** barras, así que compararlo
contra un `file://${process.argv[1]}` armado a mano **nunca coincide**: el script
se importaba, no ejecutaba nada y **salía con 0 como si el build hubiera
andado**. Corregido con `pathToFileURL(process.argv[1]).href`.

### Errores dinámicos realmente observados

| Predicho | Observado |
|---|---|
| `persona/[id]` | ✅ visto |
| `admin/resena/[id]` | ✅ visto |
| `lista/[key]` | ✅ visto |
| `titulo/[tipo]/[id]` | ⏳ no alcanzado |
| `categoria/[slug]` | ⏳ no alcanzado |
| `searchParams` en Server Component | ⏳ no alcanzado |

⚠️ **Next informa UNA ruta dinámica por corrida** (`Promise.all` rechaza en la
primera), así que las cinco no salen juntas. Las tres vistas son el mismo caso.

### 🔴 Lo que CP1 NO pudo probar, y por qué

**No se pudo demostrar que `pageExtensions` excluye los 25 route handlers.**
Next valida las páginas dinámicas **antes** de mirar los route handlers, así que
el build nunca llega a esa etapa y el directorio de salida ni se escribe. El
**experimento de control** (correr sin `pageExtensions`) **tampoco distingue**,
por el mismo motivo: falla igual en una página dinámica.

La única evidencia disponible es indirecta: el compile de webpack pasa.

**Traslado formal: la prueba definitiva pasa a CP2** (§CP2.7), aprobado por el
dueño. **CP1 queda aprobado con esa prueba diferida.**

---

## ✅ CP2 — completado el 30/08/2026

El export completa: 34 rutas, con `/t/`, `/p/`, 12 categorías y 6 listas, y sin
`api`, `admin`, `titulo`, `persona`, `sw.js`, `sw/` ni `manifest.webmanifest`.

### 🔴 BLOQUEA EL MERGE A PRODUCCIÓN: `/t` y `/p` existen también en el build web

`app/t/page.tsx` y `app/p/page.tsx` son rutas normales de Next, así que **el
build web las emite igual que el nativo** — verificado: aparecen en el listado de
`npm run build`. En la web no se usan (los helpers devuelven `/titulo/…` y
`/persona/…`), pero **son alcanzables e indexables**.

El problema es de SEO, no funcional: `/t/?tipo=movie&id=278` y
`/titulo/movie/278` mostrarían **el mismo contenido en dos URLs distintas**, que
es contenido duplicado.

**Antes de mergear a Producción hay que hacer una de las dos:**

- [ ] Excluirlas de indexación (`robots` / `noindex` en esas dos rutas), **o**
- [ ] Declarar un `canonical` de `/t` hacia `/titulo/[tipo]/[id]` y de `/p`
      hacia `/persona/[id]`.

⚠️ **Esto NO bloquea CP3** — el spike no se publica. **Sí bloquea el merge
final a `main`.** 🔵 La elección entre las dos opciones es del dueño.

### Dos comprobaciones que cerraron después

1. **Los helpers emiten `/t/?…` y `/p/?…`, con barra antes de la query.**

   ⚠️ *Corrección: la primera redacción decía que esa forma "funciona en un
   conjunto de servidores estrictamente mayor" y que "no depende de nada". **Las
   dos afirmaciones eran falsas**, y la propia medición las contradecía: contra
   el servidor estricto **las DOS formas dieron 404**, así que esa prueba no
   distingue entre ellas.*

   Lo demostrado, y nada más:

   - `trailingSlash: true` genera `t/index.html` y `p/index.html`.
   - `/t/?…` y `/p/?…` son las formas **canónicas elegidas porque coinciden con
     esa estructura**.
   - Funcionaron **sin redirección** en el servidor local que resuelve índices de
     directorio.
   - 🔍 **La compatibilidad real con el servidor interno de Capacitor sigue
     PENDIENTE: se verifica en CP8.**
   - La prueba automática fija el **contrato de formato**; no demuestra
     comportamiento de servidores.

   Interesa sobre todo para `RuletaCard`, que usa un `<a>` —navegación completa,
   resuelta por el servidor— y no un `<Link>`.
2. **El `fallback` del `<Suspense>` no podía ser `null`.** `useSearchParams`
   hace que Next marque el subárbol como renderizado en cliente, así que el HTML
   estático lleva el fallback: medido, `/categoria/terror` salía con un `<main>`
   de **84 bytes**, literalmente en blanco hasta hidratar. Con
   `CategoriaSkeleton` pasa a **5871 bytes**, con el encabezado, el título y el
   toggle ya presentes. Mismo arreglo en `/p`.

---

## ✅ CP3 — completado y auditado el 30/08/2026

**Auditado y cerrado.** Vive en `spike/capacitor-android`, **sin mergear y sin
pushear**: eso es estado de la rama, no una tarea pendiente.

`lib/api-base.ts` convierte rutas internas `/api/…` en absolutas cuando el build
es nativo. Todo lo demás se devuelve intacto: URLs externas, rutas internas que
no son de API, y la cadena vacía que `useApi` usa como "no pidas nada".

### Las decisiones aplicadas

| Decisión | Estado |
|---|---|
| Variable propia `NEXT_PUBLIC_YUMP_API_BASE` | ✅ |
| **NO** reutilizar `NEXT_PUBLIC_SITE_URL` | ✅ con test que prueba que la ignora |
| **SIN** fallback de ejecución | ✅ no hay default a `app.yump.ar` |
| Falla el build si falta o es inválida (con `NEXT_PUBLIC_YUMP_NATIVO=1`) | ✅ verificado de punta a punta |
| **HTTPS obligatorio** | ✅ `http://` se rechaza: el contenedor se sirve desde `https://localhost` y una API `http` sería contenido mixto |
| CP3 usa `https://api-base.invalid` | ✅ sólo en el entorno local del spike |
| La web sigue con `/api/…` relativo | ✅ y no necesita la variable |
| `lib/compartir.ts` sin cambios | ✅ con guard |

### Inventario real

| Categoría | Cantidad | Detalle |
|---|---|---|
| Central | **1** | `components/useApi.ts:64`, cubre sus 8 consumidores |
| Directas | **18** | en 13 archivos |
| Fuera de un `fetch` | **1** | `components/RecordarButton.tsx` |
| **Excepciones del guard** | **1** | `app/admin/resena/[id]/page.tsx` |

⚠️ **Sobre `RecordarButton`, para no atribuir mal la adaptación:** `icsUrl()` se
origina en `lib/calendar-links.ts`, **pero ese archivo NO se modificó**. La
aplicación de `apiUrl()` ocurre **una sola vez, en
`components/RecordarButton.tsx`**, al armar `ics`; esa URL alimenta después el
`fetch` de validación y las dos navegaciones. Es un **caso especial
correctamente adaptado**, **no una excepción del guard**.

### El guard

Recorre `app/`, `components/` y `hooks/` y falla si aparece un `fetch` cuyo
primer argumento sea la ruta literal `/api/…` sin pasar por `apiUrl`.

- **No analiza línea por línea.** Normaliza los espacios del archivo entero,
  porque `fetch(` y la ruta pueden quedar en renglones distintos y un barrido
  por línea daría un falso negativo justo con el caso que más importa.
- **Cinco canarios** prueban que detecta lo malo (una línea, multilínea,
  template literal multilínea) y que no marca lo bueno (`fetch(apiUrl(…))`,
  `fetch(variableYaAdaptada)`).
- **La única excepción es `app/admin`**, porque no viaja en el artefacto. Y la
  prueba de excepciones **no se conforma con que el archivo exista**: verifica
  que la llamada que justifica la exención **siga estando**. Si desaparece o
  pasa por `apiUrl`, la exención queda huérfana y el test falla.

---

## ✅ CP4 — completado el 30/08/2026, bajo criterio revisado y aprobado

**Lo local está hecho y la ventana de Preview se ejecutó y se cerró.** El
checkpoint cierra con **una prueba trasladada, no eliminada**: el `POST`
autenticado con éxito se ejecuta en **CP8 #14**, en el entorno nativo real.
Ver §"Resultado real de la ventana de Preview".

### Clasificación final: 25 = 23 + 2

| Grupo | Cuántas | Cuáles |
|---|---|---|
| **Integran CORS** | **23** | 21 `GET` + 2 `POST` |
| **Excluidas** | **2** | `cron/netflix-top10` · `admin-search` |

⚠️ **El motivo de las exclusiones NO es "ningún navegador las llama"**:
`admin-search` sí se llama desde un navegador, en la web. Lo que ninguna de las
dos necesita es **lectura cross-origin desde el contenedor**, que es lo único
que CORS habilita.

- `cron/netflix-top10` — server-to-server: la ejecuta Vercel Cron con el
  `CRON_SECRET`.
- `admin-search` — sólo la consume `app/admin`, que **no viaja en el artefacto
  nativo**: habilitarla sería innecesario.

**`recordatorio` SÍ integra CORS**, y la evidencia lo decide sin margen:
`RecordarButton` arma `apiUrl(icsUrl(...))` y ejecuta **primero** un
`await fetch(ics)` de validación —para poder avisar "todavía no hay fecha
confirmada" en vez de bajar un archivo roto—. En el contenedor ese `fetch` es
cross-origin: sin CORS el botón "Recordarme" falla antes de descargar nada. La
navegación posterior no necesita CORS, pero la validación sí. Sus cabeceras
(`text/calendar`, `Content-Disposition`, `Cache-Control: private, max-age=300`)
salen intactas: `conCors` copia las de la ruta y sólo agrega las suyas.

### El patrón, y por qué el método se declara tres veces

```ts
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
```

El cuerpo de cada ruta se renombra a `manejar` **sin tocarlo**. `conCors`
envuelve la Response FINAL, así que ningún camino de salida queda sin
encabezados. `opcionesCors` **no recibe el handler**: hace imposible que el
preflight ejecute la lógica de la ruta.

⚠️ El método se escribe en **tres** lugares: el nombre del export, el argumento
de `conCors` y el de `opcionesCors`. **No hay "un único lugar"** —eso decía un
comentario anterior y era falso—. Lo que impide que diverjan es el guard de
`lib/cors-inventario.test.ts`, que extrae los tres y exige que coincidan, con
canarios que prueban que detecta cada forma de divergencia.

### Observabilidad

`conCors` captura para devolver un 500 **con** CORS, pero **no se traga el
error**: registra con `console.error` el método y el pathname más el objeto de
error, que es lo que conserva el stack. **No** registra query, `Authorization`,
cookies, headers ni entorno, y el mensaje de la excepción **no viaja en la
respuesta**. Sin esto, los fallos no controlados de 23 rutas se habrían vuelto
invisibles.

### Resultado real de la ventana de Preview

**URL exacta utilizada** — la inmutable del deployment, no la de rama:

```
https://streamingcentral-l5p2agc8e-jfgalindez-gmailcoms-projects.vercel.app
```

🔴 **Ninguna prueba se ejecutó contra Producción.** Producción no se tocó
en ningún momento de CP4: ni la app, ni las variables de Vercel, ni Supabase.

| Grupo | Cuántas | Estado |
|---|:--:|---|
| `curl` obligatorios de §CP4 ejecutados | **6** | ✅ aprobados |
| Rechazo sin sesión (`POST` sin JWT) | **1** | ✅ `401` **conservando CORS** |
| Comprobaciones adicionales | **3** | ✅ aprobadas |
| `POST` autenticado **con éxito** | **1** | ➡️ **trasladado a CP8 #14** |

Los seis obligatorios son los `curl` **1, 2, 4, 5, 6 y 7** de §CP4. El **3**
es el que se trasladó.

**Al terminar, la protección se restauró y se verificó** sin seguir la
redirección: la URL de arriba devuelve `302` a `vercel.com/sso-api`, con
`X-Robots-Tag: noindex`. Reverificado al abrir esta sesión documental.

### ➡️ El `POST` autenticado se trasladó a CP8 #14 — aprobado por el dueño

**No se elimina ni se relaja: cambia de momento.** Motivo aprobado:

- No existe una cuenta descartable ni un Bearer de prueba.
- **No corresponde** usar la cuenta personal del dueño, extraer tokens del
  navegador, ni crear credenciales sólo para un `curl`.
- La respuesta autenticada exitosa se comprueba en el **entorno nativo real**,
  que es donde la afirmación importa.

**Lo que CP4 sí dejó demostrado del camino autenticado**, y por eso el traslado
no deja un hueco:

1. El **preflight con `Authorization`** funciona: el header viaja en
   `Access-Control-Allow-Headers` y el navegador lo aceptaría.
2. El **rechazo por falta de sesión conserva CORS**: `401` con el
   `Access-Control-Allow-Origin` correcto — o sea que el camino autenticado
   **está envuelto** por el helper, no sólo el camino feliz.
3. `conCors` envuelve la **Response final** (§4.3), así que no hay salida sin
   encabezados.
4. El **contrato está fijado por pruebas unitarias**, no por el `curl`.

🔴 **Lo que queda sin demostrar hasta CP8 #14, dicho sin adornos:** que una
respuesta **`2xx` autenticada** lleve los encabezados correctos. Es una sola
afirmación, y **CP8 no puede cerrarse sin ella**.

### ⚠️ El `Access-Control-Allow-Origin: *` del HTML estático es de Vercel

Durante la ventana se observó un `Access-Control-Allow-Origin: *` en respuestas
de **HTML estático**. **Lo agrega Vercel en su capa de CDN, no `lib/cors.ts`**,
y **no apareció en ninguna ruta `/api`** — que es el único alcance del helper
(§4.1).

**No es un fallo del helper y no debe registrarse como tal.** Queda documentado
para que una lectura futura de esos encabezados no lo diagnostique al revés.

### 🔴 Limitación de evidencia — la salida cruda no quedó persistida

La salida de los `curl` **no se guardó en el repositorio**: vive en el registro
de la sesión de CP4 y en el traspaso, no en un archivo. Los conteos de la tabla
son los reportados por esa sesión.

**No se puede reproducir sin volver a abrir la Preview**, y eso está prohibido
fuera de una ventana aprobada. **Corrección aplicada hacia adelante:** CP8 #14
exige dejar la evidencia **escrita en el repositorio**, con el token redactado.

---

> El resto del documento describe lo que falta.

**Base:** `main = origin/main = 397842c` · **Next.js instalado: 14.2.35**
**Rama de trabajo:** `spike/capacitor-android`, pusheada al remoto, **sin mergear a `main`**

---

## 0. Qué se corrigió en esta revisión

| # | Problema de la rev. 3 | Corrección |
|---|---|---|
| 1 | La PWA se apagaba **después** del primer `cap run` | **CP6 nuevo, antes de Android.** El contenedor nunca se abre por primera vez con la PWA activa. Más un procedimiento de recuperación por si igual pasa |
| 2 | `esNativo()` sin contrato; riesgo de hydration mismatch | **Bandera de build** `NEXT_PUBLIC_YUMP_NATIVO`, no detección runtime. CP2 **no importa `@capacitor/core`** |
| 3 | Staging sin especificar; conflicto de `distDir`; `mklink` no es ejecutable de PowerShell | Contrato completo, ubicación canónica única, junction por **API de Node** |
| 4 | "Instrumentar de la forma más simple que funcione" | Interfaces concretas + tabla de las 23 rutas |
| 5 | La ventana de Preview quedaba abierta 5–7,5 sesiones | **Ventanas por sesión**, con apertura y cierre verificados |
| 6 | `npm i -D` para los tres paquetes | Confirmado contra la doc: `core` y `android` van en **dependencies** |
| 7 | "idéntico a `e9f8eaf`", "necesitará Producción", `preferences` como solución automática | Reformulados |

### Y en la revisión 5

| # | Problema de la rev. 4 | Corrección |
|---|---|---|
| 8 | El staging no lleva las variables públicas que el cliente necesita | **Allowlist explícita** leída del `.env.local` de la raíz con `util.parseEnv` (§3.4) |
| 9 | El staging copia los tests pero no sus dependencias | **`tsconfig` derivado** dentro del staging que excluye tests (§3.5) |
| 10 | La comprobación anti-hydration no demuestra nada | Reemplazada por **dos niveles**: módulos en procesos aislados + DOM real en CP7 (§2.1) |
| 11 | Faltaba `InstallRow` en el inventario de PWA | Agregado, más **auditoría completa** de `components/pwa/*` (§CP6) |
| 12 | CP1 podía dejar un `out/` ambiguo en la raíz | **Directorio de diagnóstico explícito y aislado** (§CP1) |

**Hallazgos propios de la rev. 5:**

- 🔴 **Next 14 NO documenta `typescript.tsconfigPath`.** La única opción bajo
  `typescript` es `ignoreBuildErrors`, que **no se usa**. Pero no hace falta:
  como el build corre desde una copia, **el staging tiene su propio
  `tsconfig.json`** y el del repo no se toca (§3.5).
- 🔴 **Son DOS tests, no uno,** los que importan fuera de las carpetas copiadas:
  `lib/sin-dicebear.test.ts` → `../scripts/`, y **`lib/sync-reparar.test.ts` →
  `../supabase/functions/…`**. El segundo no estaba reportado.
- ⚠️ **`OfflineState` NO es una entrada de PWA**: lo importan 8 vistas y es el
  estado sin conexión de la app. **Se conserva en el artefacto nativo.**

**Hallazgo propio de la rev. 4:** al buscar qué rutas leen `Authorization`,
el grep sensible a mayúsculas fallaba: **las rutas leen `"authorization"` en
minúscula** (`req.headers.get("authorization")`). Verificado en
`te-va-a-gustar:41` y `cuenta/eliminar:37`. Sólo esas dos leen el header desde
el navegador, y **son las únicas que provocan preflight**.

---

## 1. Global

| Regla | Valor |
|---|---|
| Nombre / `applicationId` | `Yump Dev` / `ar.yump.app.dev` |
| Firma | debug |
| Capacitor | **8** (target SDK 36; verificar en `variables.gradle`) |
| Node | 22+ — la máquina tiene **v24.18.0** ✅ |
| `server.url` | prohibido |
| Producción | **no se toca en ningún checkpoint** |
| PWA web | **no se afecta** |

### El criterio de no-regresión de la web — reformulado

🔴 **La rev. 3 decía "idéntico a `e9f8eaf`". Es falso**: al integrar helpers y
rutas cambian hashes y artefactos. El criterio correcto, y el que se verifica en
cada checkpoint:

- [ ] `npm run build` **completa** sin errores.
- [ ] `npm test` y `npx tsc --noEmit` verdes.
- [ ] **Contratos públicos iguales**: `/titulo/movie/278` y `/persona/:id` siguen
      existiendo y respondiendo; `SITIO_PUBLICO` sigue siendo `https://app.yump.ar`.
- [ ] **PWA web funcional**: `headers()` presente, `/sw.js` servido,
      `manifest.webmanifest` emitido.
- [ ] **Ninguna URL ni bandera de Preview/nativo en el bundle web** — se verifica
      grepeando `.next/static`.
- [ ] **Ningún comportamiento nativo activo** en la web.

---

## 2. Contrato de plataforma — `lib/plataforma.ts`

### El problema que resuelve

Una detección puramente runtime (`Capacitor.isNativePlatform()`) daría **`false`
durante el prerender** y **`true` después de hidratar**. Con `output: "export"`
las páginas se prerenderizan en build, así que los 9 enlaces internos nacerían
como `/titulo/movie/278` en el HTML estático y recién cambiarían a `/t?…` tras
hidratar: **hydration mismatch**, y links rotos en el primer frame.

### La solución: bandera de build, no detección runtime

```ts
// lib/plataforma.ts — NO importa @capacitor/core (que recién se instala en CP7)
/**
 * true cuando el bundle se construyó para el contenedor nativo.
 * Sale de una bandera de BUILD, no de detección en runtime: así el prerender
 * estático y el cliente producen el MISMO valor desde el primer render.
 * En el build web es siempre false.
 */
export const ES_NATIVO: boolean = process.env.NEXT_PUBLIC_YUMP_NATIVO === "1";

/** Igual que ES_NATIVO, en forma de función, para poder inyectar en tests. */
export function esNativo(override?: boolean): boolean {
  return override ?? ES_NATIVO;
}
```

**Por qué una constante y no una función que mire `window`:**

| Requisito | Cómo se cumple |
|---|---|
| build web: siempre web | la variable no se define → `false` |
| export Capacitor: nativo en prerender **y** cliente | `build-capacitor` la inyecta en el proceso; Next la **inlinea** en el bundle, así que servidor y cliente ven lo mismo |
| tests Node: configurable sin `window` | `esNativo(true/false)` |
| nada persiste en el entorno | vive en el `env` del `spawnSync`, no en `.env.local` |
| ninguna URL de Preview en el build web | se verifica por grep (§1) |
| CP2 no importa un paquete de CP7 | **no hay import de Capacitor** |

**`Capacitor.isNativePlatform()` NO se usa para generar URLs.** Si más adelante
hace falta (por ejemplo para elegir plugin vs fallback en CP9), se usa **sólo en
efectos de cliente**, nunca en render, y **`ES_NATIVO` tiene precedencia** para
todo lo que afecte el HTML.

**Pruebas (compilan contra esa firma):**
```ts
test("por defecto, sin la bandera, es web", () => assert.equal(esNativo(), false));
test("el override explícito manda, sin tocar window", () => {
  assert.equal(esNativo(true), true);
  assert.equal(esNativo(false), false);
});
test("no depende de window", () => {
  assert.equal(typeof globalThis.window, "undefined");   // Node
  assert.equal(esNativo(), false);                       // no lanza
});
```

### 2.1 Comprobación anti-hydration — en dos niveles

🔴 **La rev. 4 proponía grepear el HTML exportado buscando `/t?tipo=` y
descartando `/titulo/`. Eso no demuestra nada**, por dos motivos:

1. **El Home prerenderizado no tiene cards.** Los datos llegan después por la
   API, así que puede no haber **ningún** `/t?tipo=` en el HTML aunque el helper
   sea perfecto. La ausencia no probaría un fallo.
2. **`/titulo/` puede aparecer por motivos que no son un enlace mal generado**:
   chunks, metadata, manifests de build, comentarios compilados.

**Nivel 1 — automático, antes de Android (CP2).** Cargar los módulos en
**procesos aislados**, que es lo único que prueba que la bandera se inlinea
igual en los dos caminos:

```js
// lib/plataforma.test.ts — mismo patrón que scripts/config.test.mjs
function enProceso(nativo) {
  const code =
    "import {ES_NATIVO} from './lib/plataforma.ts';" +
    "import {hrefTitulo, hrefPersona} from './lib/rutas.ts';" +
    "console.log(JSON.stringify({ES_NATIVO,t:hrefTitulo('movie',278),p:hrefPersona(123)}));";
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    encoding: "utf8", shell: false,
    env: nativo ? { ...process.env, NEXT_PUBLIC_YUMP_NATIVO: "1" }
                : { ...process.env, NEXT_PUBLIC_YUMP_NATIVO: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("web: ES_NATIVO false y rutas públicas", () => {
  const w = enProceso(false);
  assert.equal(w.ES_NATIVO, false);
  assert.equal(w.t, "/titulo/movie/278");
  assert.equal(w.p, "/persona/123");
});
test("nativo: ES_NATIVO true y rutas de query", () => {
  const n = enProceso(true);
  assert.equal(n.ES_NATIVO, true);
  assert.equal(n.t, "/t?tipo=movie&id=278");
  assert.equal(n.p, "/p?id=123");
});
test("una ejecución no contamina a la otra", () => {
  assert.equal(enProceso(true).ES_NATIVO, true);
  assert.equal(enProceso(false).ES_NATIVO, false);   // el orden no importa
  assert.equal(enProceso(true).ES_NATIVO, true);
});
test("no depende de window", () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(esNativo(), false);
});
```

**Nivel 2 — integral, en CP7, con datos reales de Preview.** Recién ahí hay
cards que inspeccionar:

- [ ] En `chrome://inspect`, inspeccionar el DOM de una card del Home.
- [ ] Su `href` **ya es `/t?tipo=…&id=…`**.
- [ ] **No cambia después de hidratar** (comparar antes y después de que la
      página termine de cargar).
- [ ] Abrirla → monta la ficha.
- [ ] **Atrás** → vuelve al Home.
- [ ] **Recargar** en la ficha → vuelve a montar.
- [ ] **Consola sin warning de hydration.**

🔴 **La presencia o ausencia de cadenas en `index.html` NO es criterio de
aprobación.**

---

## 3. Contrato de staging — completo

### Ubicación canónica (resuelve el conflicto de `distDir`)

🔴 **El conflicto de la rev. 3:** el build corre dentro de `.capacitor-build`,
así que `distDir: "out-capacitor"` produce `.capacitor-build/out-capacitor`,
pero `capacitor.config.ts` apunta al `out-capacitor` de la raíz.

**Resolución — una sola ubicación canónica en todos los checkpoints:**

```
<raíz>/.capacitor-build/          ← workspace de staging (ignorado por git)
<raíz>/.capacitor-build/out/      ← distDir: "out"  (salida del export)
<raíz>/out-capacitor/             ← CANÓNICO. Lo copia el script al terminar.
                                     Es el webDir de capacitor.config.ts
                                     y es lo que se sirve en CP2.
```

- `distDir` sale de `CAPACITOR_DIST`, con **`"out"`** por defecto, relativo al
  cwd del build. El diagnóstico de CP1 lo apunta a `.capacitor-diagnostico`.
- El script **copia** `.capacitor-build/out/` → `<raíz>/out-capacitor/`.
- `capacitor.config.ts` usa `webDir: "out-capacitor"`.
- **CP2 sirve `<raíz>/out-capacitor/`**, el mismo directorio que consumirá
  Capacitor. Nunca se sirve el de adentro del staging.

### Qué se copia — lista exacta

| Origen | ¿Va? | Nota |
|---|:--:|---|
| `app/` | ✅ **menos** las exclusiones de abajo | |
| `components/` `lib/` `hooks/` `public/` `assets/` | ✅ | |
| `next.config.mjs` `tsconfig.json` `postcss.config.mjs` `tailwind.config.ts` | ✅ | necesarios para construir |
| `next-env.d.ts` | ✅ | tipos de Next |
| `package.json` `package-lock.json` | ✅ | Next lee `package.json` |
| `node_modules` | ✅ **por junction**, no copia | ver §3.3 |
| `.gitignore` `.claude/` `.mcp.json` `AGENTS.md` `CLAUDE.md` `README.md` | ❌ | no intervienen en el build |
| `docs/` `scripts/` `supabase/` `data/` `chips/` `prompts/` | ❌ | no intervienen |
| `vercel.json` | ❌ | es config de despliegue, no de build local |
| `.env.local` | ❌ | 🔴 **nunca se copia**: evita que un secreto entre al staging |

### Exclusiones dentro de `app/`

| Ruta | Por qué se excluye | Qué la reemplaza |
|---|---|---|
| `app/api/` | 25 route handlers incompatibles | — (los sirve Vercel) |
| `app/admin/` | 4 archivos; el dashboard no viaja en la app pública | — |
| `app/titulo/` | universo infinito, sin `generateStaticParams` | **`app/t/`** |
| `app/persona/` | idem | **`app/p/`** |

🔴 **`app/t/` y `app/p/` SÍ se copian** — son parte de `app/` y no están en la
lista de exclusiones. Se crean en CP2 en el árbol original (funcionan también en
la web, inertes) y viajan al staging como cualquier otra ruta.

**Además, y sólo para el artefacto nativo (§6):** `public/sw.js` y `public/sw/`
**no se copian**. Sin archivo no hay nada que registrar, aunque un guard falle.

### 3.4 Variables públicas — allowlist explícita

🔴 **El problema que la rev. 4 no vio.** El build corre con
`cwd = .capacitor-build`, y el contrato excluye `.env.local` (bien: evita que un
secreto entre al staging). **Pero entonces Next no carga ningún `.env.local`**, y
el script sólo inyectaba `CAPACITOR`, `NEXT_PUBLIC_YUMP_NATIVO` y
`NEXT_PUBLIC_YUMP_API_BASE`. Faltan tres variables públicas que el cliente necesita.

**Consecuencias si faltan:**

| Falta | Qué pasa |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` | `createClient` recibe `""` (ver `lib/supabase.ts:3-4`): el cliente puede fallar en build, prerender o runtime. **Sin login, sin listas, sin votos** |
| `NEXT_PUBLIC_SITE_URL` | `AuthContext:117` cae a `window.location.origin`, que **en el contenedor es `https://localhost`** → el mail de recuperación apuntaría a `https://localhost/cuenta/reset`, una URL que no existe para nadie |

**El mecanismo, en seis reglas:**

1. El script **lee** el `.env.local` de la **raíz original** — sólo como fuente.
2. **No lo copia** al staging.
3. **No pasa todos sus valores** al proceso hijo.
4. Extrae por **allowlist** exactamente tres:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_SITE_URL`.
5. Suma `NEXT_PUBLIC_YUMP_API_BASE` (del argumento), `NEXT_PUBLIC_YUMP_NATIVO=1` y
   `CAPACITOR=1`.
6. 🔴 **Nunca transmite** `TMDB_READ_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`,
   `CRON_SECRET`, los tokens de Upstash ni ninguna otra variable server-only.

**Se usa la API estándar de Node, no un parser improvisado.** Verificado:
`node v24.18.0` expone `util.parseEnv` y `process.loadEnvFile`. Se usa
`util.parseEnv` porque **devuelve un objeto sin tocar `process.env`**.

### Dos allowlists SEPARADAS, y no se mezclan

🔴 **Corrección de la rev. 5:** ahí `PATH` aparecía suelto junto a las variables
públicas. Son cosas distintas y se evalúan por separado.

```js
import { parseEnv } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Variables de APLICACIÓN. Las tres se leen del .env.local. */
const APP_DESDE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
];
/** Variables de APLICACIÓN que arma el propio script. */
const APP_DEL_SCRIPT = ["CAPACITOR", "NEXT_PUBLIC_YUMP_NATIVO", "NEXT_PUBLIC_YUMP_API_BASE"];

/**
 * Variables OPERATIVAS del sistema. Sin ellas Next no arranca en Windows.
 * Se copian preservando el NOMBRE Y EL CASING REAL de process.env: en Windows
 * la variable puede llamarse "Path" o "PATH" según cómo se haya iniciado el
 * proceso, y buscar sólo "PATH" la perdería.
 */
const OPERATIVAS = [
  "PATH", "SystemRoot", "ComSpec", "PATHEXT",
  "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
];

function operativasDelSistema(fuente = process.env) {
  const out = {};
  for (const querida of OPERATIVAS) {
    const real = Object.keys(fuente).find((k) => k.toLowerCase() === querida.toLowerCase());
    if (real) out[real] = fuente[real];        // conserva el casing real
  }
  return out;
}

/**
 * Arma el entorno del proceso hijo. `fuente` es inyectable para las pruebas:
 * puede ser un texto, una ruta, o una función lectora.
 * NUNCA se hace {...process.env}: eso filtraría los secretos server-only.
 */
function entornoDelBuild(apiBase, opts = {}) {
  const { fuente = resolve(".env.local"), sistema = process.env } = opts;

  let texto;
  if (typeof fuente === "function") texto = fuente();
  else if (typeof fuente === "string" && fuente.includes("=")) texto = fuente;   // contenido
  else {
    if (!existsSync(fuente)) throw new Error(`no existe el archivo de entorno: ${fuente}`);
    texto = readFileSync(fuente, "utf8");
  }
  const leido = parseEnv(texto);              // NO toca process.env

  const env = {
    ...operativasDelSistema(sistema),
    CAPACITOR: "1",
    NEXT_PUBLIC_YUMP_NATIVO: "1",
    NEXT_PUBLIC_YUMP_API_BASE: apiBase,
  };
  const faltan = [];
  for (const k of APP_DESDE_ENV) {
    if (!leido[k]) { faltan.push(k); continue; }   // sólo el NOMBRE
    env[k] = leido[k];
  }
  if (faltan.length) throw new Error(`faltan variables públicas: ${faltan.join(", ")}`);
  return env;
}
```

### Cómo se lanza Next — sin `npx` ni `shell: true`

🔴 **Corrección de la rev. 5.** `npx` puede intentar descargar, y `shell: true`
mete un intérprete en el medio con reglas de escapado propias. Se resuelve el
CLI de forma absoluta y se ejecuta con el mismo Node:

```js
const cliNext = resolve("node_modules", "next", "dist", "bin", "next");   // verificado que existe
const r = spawnSync(process.execPath, [cliNext, "build"], {
  cwd: dirDeTrabajo,
  stdio: "inherit",
  shell: false,                       // sin intérprete de por medio
  env: entornoDelBuild(apiBase),      // construido desde cero
});
```

🔵 **Si Next o una herramienta demuestra necesitar otra variable operativa**, se
agrega **por nombre y con la justificación escrita** en `OPERATIVAS`. **Nunca se
hereda todo el entorno como atajo.**

**Mensajes de error sin valores:** se nombra la variable que falta, **nunca su
contenido**, ni siquiera truncado.

**Por qué estas tres pueden quedar dentro del APK:** las tres son
`NEXT_PUBLIC_*`, o sea que **ya viajan al navegador en la web de hoy**. La anon
key de Supabase está diseñada para ser pública y está protegida por RLS. No se
agrega ninguna exposición nueva.

**Pruebas:**

🔴 **Los tests NUNCA tocan el `.env.local` real.** Usan un archivo dentro de un
directorio temporal propio, que se borra al terminar. El camino real sí lee el
de la raíz — por eso `fuente` es inyectable.

```js
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURE = [
  "NEXT_PUBLIC_SUPABASE_URL=https://ejemplo.supabase.co",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=clave-de-prueba-no-real",
  "NEXT_PUBLIC_SITE_URL=https://app.yump.ar",
  "TMDB_READ_TOKEN=secreto-de-prueba",
  "SUPABASE_SERVICE_ROLE_KEY=secreto-de-prueba",
  "CRON_SECRET=secreto-de-prueba",
  "UPSTASH_REDIS_REST_TOKEN=secreto-de-prueba",
  "SECRETO_FICTICIO_DE_PRUEBA=no-debe-viajar",
].join("\n");

function conFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "yump-env-"));
  const ruta = join(dir, ".env.local");
  writeFileSync(ruta, FIXTURE, "utf8");
  try { return fn(ruta); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const SISTEMA_FALSO = { Path: "C:\\fake", SystemRoot: "C:\\Windows", ComSpec: "C:\\cmd.exe",
  PATHEXT: ".EXE", TEMP: "C:\\T", TMP: "C:\\T", USERPROFILE: "C:\\U",
  APPDATA: "C:\\A", LOCALAPPDATA: "C:\\L", TMDB_READ_TOKEN: "no-debe-viajar" };

// ---------- 1. Variables de APLICACIÓN permitidas: exactamente seis ----------
test("llegan las SEIS variables de aplicación, ni una más ni una menos", () => {
  const env = conFixture((f) =>
    entornoDelBuild("https://x.vercel.app", { fuente: f, sistema: SISTEMA_FALSO }));
  const app = Object.keys(env).filter((k) => k === "CAPACITOR" || k.startsWith("NEXT_PUBLIC_"));
  assert.deepEqual(app.sort(), [
    "CAPACITOR",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_YUMP_API_BASE",
    "NEXT_PUBLIC_YUMP_NATIVO",
  ]);
});

// ---------- 2. Variables OPERATIVAS: se evalúan APARTE ----------
test("Next recibe las operativas que necesita, con su casing real", () => {
  const env = conFixture((f) =>
    entornoDelBuild("https://x.vercel.app", { fuente: f, sistema: SISTEMA_FALSO }));
  assert.equal(env.Path, "C:\\fake");        // conserva "Path", no lo renombra a "PATH"
  for (const k of ["SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP",
                   "USERPROFILE", "APPDATA", "LOCALAPPDATA"]) {
    assert.ok(env[k], `falta la operativa ${k}`);
  }
});

// ---------- 3. Variables PROHIBIDAS ----------
test("PRUEBA NEGATIVA: ningún secreto llega, ni del .env.local ni del sistema", () => {
  const env = conFixture((f) =>
    entornoDelBuild("https://x.vercel.app", { fuente: f, sistema: SISTEMA_FALSO }));
  for (const k of ["TMDB_READ_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET",
                   "UPSTASH_REDIS_REST_TOKEN", "SECRETO_FICTICIO_DE_PRUEBA"]) {
    assert.equal(env[k], undefined, `se coló ${k}`);
  }
  // Y nada fuera de las dos allowlists.
  const permitidas = new Set([...APP_DESDE_ENV, ...APP_DEL_SCRIPT,
                              ...Object.keys(operativasDelSistema(SISTEMA_FALSO))]);
  for (const k of Object.keys(env)) assert.ok(permitidas.has(k), `se coló ${k}`);
});

test("faltar una pública falla con el NOMBRE, sin el valor", () => {
  const parcial = "NEXT_PUBLIC_SUPABASE_URL=https://ejemplo.supabase.co\nCRON_SECRET=secreto";
  assert.throws(
    () => entornoDelBuild("", { fuente: parcial, sistema: SISTEMA_FALSO }),
    (e) => {
      assert.match(e.message, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
      assert.doesNotMatch(e.message, /secreto|ejemplo\.supabase/);   // ningún valor
      return true;
    });
});

// ---------- 4. NEXT_PUBLIC_SITE_URL, comprobada DIRECTAMENTE ----------
test("SITE_URL llega como https://app.yump.ar", () => {
  const env = conFixture((f) =>
    entornoDelBuild("https://x.vercel.app", { fuente: f, sistema: SISTEMA_FALSO }));
  assert.equal(env.NEXT_PUBLIC_SITE_URL, "https://app.yump.ar");
});
```

**Comprobaciones manuales del checkpoint:**

- [ ] `npm run build` normal **sigue leyendo su entorno habitual** (Next carga
      `.env.local` desde la raíz como siempre) — se verifica arrancando
      `npm run dev` y comprobando que el login funciona.
- [ ] 🔴 **`NEXT_PUBLIC_SITE_URL` se comprueba en el ENTORNO, no por grep.** La
      rev. 5 proponía buscar `https://app.yump.ar` en el bundle — **no prueba
      nada**, porque esa misma URL ya está en `SITIO_PUBLICO` (`lib/compartir.ts`)
      y aparecería igual aunque la variable no se hubiera inyectado. La
      comprobación válida es la aserción directa
      `env.NEXT_PUBLIC_SITE_URL === "https://app.yump.ar"` (test 4 de arriba).
- [ ] **Validación integral, en CP7:** disparar el flujo de recuperación de
      contraseña desde la app y confirmar que el destino **no** es
      `https://localhost/cuenta/reset`.
- [ ] Ningún secreto en `out-capacitor/`: grepear los **nombres**
      `TMDB_READ_TOKEN`, `SERVICE_ROLE`, `CRON_SECRET` → **cero coincidencias**.

🔴 **En este documento no van valores ni credenciales reales.**

### 3.5 TypeScript en el staging — `tsconfig` derivado

🔴 **El problema que la rev. 4 no vio.** El staging copia `lib/`, `components/`
y `hooks/` **con sus tests**, pero excluye `scripts/` y `supabase/`. Y
`tsconfig.json` incluye `**/*.ts`, así que **`next build` typechequea los
tests**. Auditados **todos** los archivos de prueba, hay **dos** que importan
fuera de lo copiado:

| Test | Importa |
|---|---|
| `lib/sin-dicebear.test.ts` | `../scripts/barrido-dicebear.mjs`, `../scripts/barrido-sql-avatar.mjs` |
| **`lib/sync-reparar.test.ts`** | `../supabase/functions/tmdb-sync/lib/reconciliar.ts`, `.../reparar.ts` |

*(El segundo no estaba reportado.)* **El repo tiene hoy 34 archivos `*.test.ts`
y ninguno `*.test.tsx`** — verificado con `git ls-files`. Los otros 32 sólo
importan de su propia carpeta y no dan problema. El `exclude` cubre las dos
extensiones igual, para que un `.test.tsx` futuro no reabra el agujero.

**Estrategia elegida: `tsconfig` derivado dentro del staging.**

🔴 **Next 14 NO documenta `typescript.tsconfigPath`** — la única opción bajo
`typescript` es `ignoreBuildErrors`. **Pero no hace falta ninguna opción:** como
el build corre desde una copia, el staging **tiene su propio `tsconfig.json`**,
y Next lee el del cwd. El del repo **no se toca**.

🔴 **La rev. 5 tenía un placeholder** (*"…todo el contenido del tsconfig.json…"*).
Acá está el procedimiento ejecutable, con `typescript`, que **ya es dependencia
directa del proyecto** (`devDependencies.typescript: ^5.6.3`, verificado):

```js
import ts from "typescript";
import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

/** Deriva el tsconfig del staging a partir del de la raíz. NO toca el original. */
function escribirTsconfigDerivado(dirStaging) {
  const origen = resolve("tsconfig.json");
  const { config, error } = ts.readConfigFile(origen, ts.sys.readFile);   // lee JSONC
  if (error) {
    throw new Error(
      `no se pudo parsear tsconfig.json: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`,
    );
  }
  // `config` conserva compilerOptions, include y todo lo demás tal cual.
  const derivado = {
    ...config,
    exclude: [
      "node_modules",
      "supabase/functions",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
  };
  const destino = join(dirStaging, "tsconfig.json");
  writeFileSync(destino, JSON.stringify(derivado, null, 2) + "\n", "utf8");  // JSON válido
  return destino;
}
```

- Se escribe **únicamente** en `.capacitor-build/tsconfig.json`.
- El `tsconfig.json` de la raíz **no se modifica**.
- **No se usa `ignoreBuildErrors`.**
- Un error de parseo del original **aborta con mensaje**, no sigue en silencio.

**Lo que NO se hace, y es deliberado:**

- ❌ **No se usa `ignoreBuildErrors`.**
- ❌ **No se desactiva el typecheck globalmente.**
- ❌ **No se silencia ningún error de código de aplicación.**
- ❌ No se copian `scripts/` ni `supabase/` sólo para satisfacer a los tests: el
  staging construye el artefacto, **no es un entorno de pruebas**.

**Dónde corren los tests:** `npm test` se ejecuta **antes** del build, **desde la
raíz**, con el repo completo. Ahí `scripts/` y `supabase/` están, y los **34**
archivos de prueba pasan como siempre.

**Verificación de que el typecheck sigue vivo — el test canario.**

🔴 **El procedimiento de la rev. 5 se auto-invalidaba:** decía "correr el build",
y `build-capacitor` **regenera el staging**, así que borraría el error antes de
probarlo. El build habría pasado y el canario habría "aprobado" sin probar nada.
Procedimiento correcto, en seis pasos:

- [ ] **1.** Generar el staging **conservándolo**:
      `npm run build:capacitor -- --api-base=... --keep-staging`
- [ ] **2.** Introducir el error **sólo en la copia del staging**, nunca en la
      fuente: editar `.capacitor-build/lib/rutas.ts` y agregar
      `const canario: number = "texto";`
- [ ] **3.** Ejecutar Next **directamente**, sin volver a generar staging:
      ```
      node node_modules/next/dist/bin/next build
      ```
      con `cwd = .capacitor-build`.
- [ ] **4.** **Tiene que FALLAR** con un error de TypeScript que nombre
      `canario`. Si pasa, el `tsconfig` derivado excluye de más → **el
      checkpoint falla**.
- [ ] **5.** Borrar `.capacitor-build/` (con la verificación de ruta absoluta) o
      regenerarlo.
- [ ] **6.** `git status --short` → **`lib/rutas.ts` sin modificar**. Confirma
      que el canario vivió y murió dentro del staging.

### 3.1 Procedimiento

```
1. Si existe .capacitor-build/  → borrarlo entero (recursivo).
   Nunca se borra nada fuera de ese directorio.
2. mkdir .capacitor-build
3. Copiar la lista de arriba, respetando las exclusiones.
4. Enlazar node_modules por junction (§3.3).
4b. Escribir .capacitor-build/tsconfig.json derivado (§3.5).
5. Ejecutar `next build` con cwd = .capacitor-build
   y env = entornoDelBuild(--api-base)  (§3.4: allowlist, construido desde cero)
6. Verificar que existe .capacitor-build/out/index.html
7. Borrar <raíz>/out-capacitor/ si existía; copiar .capacitor-build/out/ ahí.
8. Borrar .capacitor-build/  (salvo --keep-staging para depurar).
```

### 3.2 Interrupción y garantías

| Situación | Qué queda | Recuperación |
|---|---|---|
| Interrupción en pasos 1-4 | `.capacitor-build/` a medias | borrarlo; **el árbol original no se tocó** |
| Interrupción en 5-6 | idem | idem |
| Interrupción en 7 | `out-capacitor/` a medias | volver a correr el build |

🔴 **El script NUNCA escribe, mueve ni borra fuera de `.capacitor-build/` y
`out-capacitor/`.** Verificación al final de CP2:
```
- [ ] git status --short  →  sólo archivos nuevos esperados, ningún " D " ni " M "
      en app/, components/, lib/, hooks/, public/
```

### 3.3 La junction, por API de Node

🔴 **`mklink` es un comando interno de `cmd.exe`, no un ejecutable.** No se
puede invocar como programa desde PowerShell ni desde `spawnSync` sin envolverlo
en `cmd /c`. Se usa la API del filesystem:

```js
import { symlinkSync, existsSync, lstatSync, readlinkSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const destino = resolve("node_modules");            // absoluto, obligatorio
const enlace  = resolve(".capacitor-build/node_modules");

function enlazarNodeModules() {
  if (existsSync(enlace)) {
    const st = lstatSync(enlace);
    if (!st.isSymbolicLink()) throw new Error("existe y NO es junction: revisar a mano");
    if (resolve(readlinkSync(enlace)) !== destino) unlinkSync(enlace);   // apunta mal
    else return "ya existía y apunta bien";
  }
  symlinkSync(destino, enlace, "junction");   // 'junction' NO requiere elevación
  return "creada";
}
```

| Caso | Comportamiento |
|---|---|
| No existe | se crea con tipo `junction` |
| Existe y apunta bien | se reutiliza |
| Existe y apunta mal | `unlinkSync` **borra el enlace, no el destino** |
| Existe y NO es enlace | **error ruidoso**, se revisa a mano. Nunca se borra un directorio real |
| `symlinkSync` falla | ver fallback |

**Borrado seguro:** `unlinkSync` sobre una junction borra **el enlace**, no su
contenido. 🔴 **El borrado de `.capacitor-build/` tiene que quitar la junction
ANTES del borrado recursivo**, para que ningún `rm -r` la siga hacia
`node_modules`.

**Fallback si la junction falla** — 🔍 cuantificado antes de elegirlo:
`node_modules` de este proyecto ronda los **cientos de MB**; copiarlo en cada
build sería lento y ocuparía el doble. **No se copia por defecto.** Si la
junction falla, el script **aborta con un mensaje claro** y se decide a mano
entre (a) correr una vez con `--copy-node-modules` asumiendo el costo, o (b)
construir en la raíz con las exclusiones aplicadas de otra forma. 🔵 Decisión
sólo si pasa.

---

## 4. Contrato CORS — concreto

🔴 **La rev. 3 decía "de la forma más simple que funcione" en el mismo
checkpoint que modifica 23 archivos.** Eso es un placeholder. Acá está la forma.

### 4.1 Separación de alcance

- **En el spike:** una implementación concreta y limitada — un helper y una
  envoltura por ruta.
- **En Etapa 3:** la decisión sobre refactor global (wrapper, middleware u otra
  capa), **con la medición del spike en la mano**. `middleware.ts` sigue
  descartado preventivamente.

### 4.2 Interfaces

```ts
// lib/cors.ts
const PERMITIDOS = ["https://localhost", "capacitor://localhost"] as const;

/** Agrega "Origin" a Vary conservando lo existente, sin duplicar. */
export function anexarVary(actual: string | null, valor?: string): string;

/**
 * Aplica CORS a una Response YA construida y la devuelve.
 * - Conserva todos los encabezados que la respuesta ya traía.
 * - Anexa Vary: Origin SIEMPRE (permitido, rechazado o sin Origin).
 * - Sólo agrega Allow-Origin si el Origin coincide EXACTO con la allowlist.
 * - Nunca agrega Allow-Credentials. Nunca usa "*".
 * Sirve para éxito, 4xx, 5xx, validaciones, auth fallida y fallbacks:
 * como envuelve la Response final, no hay camino de salida sin CORS.
 */
export function conCors(res: Response, req: Request): Response;

/**
 * Respuesta 204 de preflight. NO ejecuta el handler real.
 * `metodos` se declara por ruta: "GET, OPTIONS" o "POST, OPTIONS".
 */
export function preflight(req: Request, metodos: string): Response;
```

### 4.3 Cómo se envuelve una ruta — patrón único

```ts
// Al final de cada ruta GET:
export async function OPTIONS(req: Request) { return preflight(req, "GET, OPTIONS"); }
export async function GET(req: NextRequest) {
  return conCors(await manejar(req), req);      // `manejar` es el cuerpo de hoy, sin tocar
}
```

**Por qué esto cubre todos los caminos de salida:** el cuerpo actual de cada ruta
se renombra a `manejar()` **sin modificarlo**, y `conCors` envuelve **lo que sea
que devuelva** — éxito, validación fallida, 401, 404, 500, o el fallback del
`catch`. No queda ningún `return` sin CORS, porque hay un solo punto de salida.

**Excepciones no capturadas:** si `manejar()` lanza, Next devuelve un 500 propio
**sin** CORS. Se agrega un `try/catch` en la envoltura que convierte la excepción
en un 500 con CORS — así el navegador ve el status real en vez de un error de red.

### 4.4 Las 23 rutas — conteo corregido

**25 rutas totales − `cron/netflix-top10` (server-to-server) − `admin-search`
(sale con `app/admin`) = 23.** De esas 23: **21 `GET` + 2 `POST`.**

| # | Ruta | Método | ¿`Authorization`? | ¿Preflight? | Prueba que la valida |
|---|---|---|:--:|:--:|---|
| 1 | `/api/home` | GET | no | no | CP7 arranque · CP8 #9/#12/#13 |
| 2 | `/api/providers` | GET | no | no | CP4 curl 1 · CP8 #15 |
| 3 | `/api/title/[tipo]/[id]` | GET | no | no | CP4 curl 7 · **CP10 YouTube** |
| 4 | `/api/discover` | GET | no | no | CP8 navegación por género |
| 5 | `/api/search` | GET | no | no | CP8 #4 teclado |
| 6 | `/api/upcoming` | GET | no | no | CP8 #2 |
| 7 | `/api/recordatorio` | GET | no | no | CP8 #2 (`fetch` de validación) |
| 8 | `/api/ruleta` | GET | no | no | CP8 recorrido |
| 9 | `/api/top` | GET | no | no | CP8 recorrido |
| 10 | `/api/person/[id]` | GET | no | no | CP8 recorrido |
| 11 | `/api/recomendaciones` | GET | no | no | CP8 recorrido |
| 12 | `/api/cards` | GET | no | no | CP8 #14 (listas del usuario) |
| 13 | `/api/latest` | GET | no | no | CP8 recorrido |
| 14 | `/api/miniseries` | GET | no | no | CP8 recorrido |
| 15 | `/api/personas` | GET | no | no | CP8 recorrido |
| 16 | `/api/directores` | GET | no | no | CP8 recorrido |
| 17 | `/api/genre-covers` | GET | no | no | CP8 recorrido |
| 18 | `/api/audience` | GET | no | no | CP8 recorrido |
| 19 | `/api/mas-votados` | GET | no | no | CP8 recorrido |
| 20 | `/api/hacete-cargo` | GET | no | no | CP8 recorrido |
| 21 | `/api/health` | GET | no | no | CP4 curl 6 (sin `Origin`) |
| 22 | `/api/te-va-a-gustar` | **POST** | **sí** (`:41`) | **sí** | CP4 curl 2 + `401` sin JWT · **CP8 #14** (`POST` autenticado) |
| 23 | `/api/cuenta/eliminar` | **POST** | **sí** (`:37`) | **sí** | CP4 curl 4 — 🔴 **sólo el preflight** |

**Fuera, por inventario:**

| Ruta | Motivo |
|---|---|
| `/api/cron/netflix-top10` | server-to-server (Vercel Cron) |
| `/api/admin-search` | sale del artefacto junto con `app/admin` (§3) |

🔴 **Sólo las filas 22 y 23 provocan preflight**, porque son las únicas que
mandan `Authorization` y `Content-Type: application/json`. Las 21 `GET` son
requests simples. Verificado: leen `req.headers.get("authorization")`, en
minúscula.

---

## 5. Ventanas de Preview — una por sesión

🔴 **La rev. 3 pedía autorización antes de CP7 pero `curl`eaba en CP4**, y dejaba
la protección abierta durante las 5–7,5 sesiones de Gate B mientras afirmaba que
la ventana era corta. Corregido: **la protección se abre y se cierra por
sesión.**

### Secuencia

```
 1. CP4 completo y verificado LOCALMENTE (tests unitarios de lib/cors.ts).
 2. Commit en spike/capacitor-android.
 3. Push de la rama.
 4. Esperar el deploy de Preview.
 5. Confirmar la URL estable de rama EN EL PANEL del deploy
    (patrón <proyecto>-git-<rama>-<scope>.vercel.app; se confirma, no se deduce).
 6. 🔵 APROBACIÓN DEL DUEÑO → abrir Deployment Protection.
 7. Ventana abierta: ejecutar los 6 curl obligatorios de CP4 + el 401 sin JWT.
    (El POST autenticado con éxito NO va acá: es CP8 #14.)
 8. CERRAR la protección. Verificar que un curl sin credenciales ya no pasa.
 9. Gate A (CP5) — no necesita la Preview abierta.
10. Gate B: 🔵 APROBACIÓN por cada sesión que necesite el teléfono →
    abrir al empezar, cerrar al terminar.
11. Verificar el cierre al final de CADA sesión.
```

⚠️ **Alcance real:** el toggle es **del proyecto, no de una URL**. Abrirlo expone
**todos los deployments de Preview**, no sólo el de esta rama. Por eso las
ventanas son por sesión y se verifica el cierre.

**Qué deja de funcionar al cerrar:** todo lo que consuma la API desde el
teléfono — o sea CP7 a CP10 completos. **La app instalada queda sin datos.** No
es una falla: es el estado esperado fuera de sesión.

**Cómo se reanuda:** abrir la protección, y si la URL de Preview cambió porque
hubo push nuevo, **reconstruir con `--api-base`** y volver a sincronizar. El
binario lleva la URL adentro; no se actualiza sola.

🔴 **La autorización no es permanente.** Cada apertura la aprueba el dueño, o el
dueño autoriza explícitamente **todas** las aperturas de esta etapa por
adelantado. No se asume.

🔴 **Nunca un bypass secret en el APK.**

---

## CP1 — Diagnóstico del export y de la configuración

**Precondiciones:** ninguna. Sin Android Studio, sin teléfono.

**Archivos:** modificar `next.config.mjs` · crear `scripts/build-capacitor.mjs`
y `scripts/config.test.mjs` · **modificar** `package.json` (script) y
`.gitignore` (**los tres**: `.capacitor-diagnostico/`, `.capacitor-build/`,
`out-capacitor/`) · declarar `serve` como devDependency.

🔴 **CP1 no puede dejar un `out/` ambiguo en la raíz.** La rev. 4 corría el
diagnóstico desde la raíz con `distDir: "out"`, y un fallo a mitad dejaría un
`<raíz>/out/` que **no está en el contrato de directorios protegidos**.
Corregido: `distDir` sale de una variable, y el diagnóstico usa un directorio
**explícito, aislado y propio**.

| Modo | cwd | `distDir` | Resultado |
|---|---|---|---|
| **Diagnóstico (CP1)** | raíz | `.capacitor-diagnostico` | `<raíz>/.capacitor-diagnostico/` |
| **Build real (CP2+)** | `.capacitor-build` | `out` | `.capacitor-build/out/` → copiado a `<raíz>/out-capacitor/` |

Los **tres** directorios (`.capacitor-diagnostico/`, `.capacitor-build/`,
`out-capacitor/`) van al `.gitignore` en este checkpoint.

🔴 **Antes de borrar cualquiera de los tres**, el script verifica que la ruta
**absoluta resuelta** esté dentro del workspace y que su nombre sea exactamente
uno de los tres. Nunca hay un borrado recursivo contra un nombre genérico como
`out/`.

```js
// next.config.mjs
const esCapacitor = process.env.CAPACITOR === "1";
const nextConfig = esCapacitor
  ? {
      output: "export",
      distDir: process.env.CAPACITOR_DIST ?? "out",   // diagnóstico vs staging
      pageExtensions: ["tsx", "jsx", "js"],   // el default menos "ts" (ver CP1)
      trailingSlash: true,            // §9
      images: { unoptimized: true },  // §10
    }
  : {
      images: { remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }] },
      async headers() { /* … el bloque actual, intacto … */ },
    };
export default nextConfig;
```

**El lanzador, sin `npx` ni `shell: true`** (mismo criterio de §3.4):

```js
// scripts/build-capacitor.mjs — versión MÍNIMA de CP1. El staging llega en CP2.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const diagnostico = process.argv.includes("--diagnostico");
const cliNext = resolve("node_modules", "next", "dist", "bin", "next");

const r = spawnSync(process.execPath, [cliNext, "build"], {
  stdio: "inherit",
  shell: false,                       // sin intérprete de por medio
  env: {
    ...operativasDelSistema(),        // §3.4, allowlist de sistema con casing real
    CAPACITOR: "1",
    ...(diagnostico ? { CAPACITOR_DIST: ".capacitor-diagnostico" } : {}),
  },
});
process.exit(r.status ?? 1);
```

⚠️ **En CP1 todavía NO se inyectan las variables de aplicación**: el diagnóstico
sólo busca la lista de errores del export, y las públicas llegan en CP2 junto
con el staging (§3.4). Lo que sí vale desde CP1 es que la variable vive **sólo
en ese proceso**: no va a `.env.local`, así que un `npm run build` posterior no
puede heredarla.

**Test RED de verdad — dos procesos aislados** (un solo proceso no sirve: el
`import` cachea el módulo):

```js
// scripts/config.test.mjs
function cargarConfig(capacitor) {
  const code = "import c from './next.config.mjs';" +
    "console.log(JSON.stringify({output:c.output,tieneHeaders:typeof c.headers==='function'," +
    "distDir:c.distDir,pageExtensions:c.pageExtensions,trailingSlash:c.trailingSlash," +
    "unoptimized:c.images?.unoptimized,remotePatterns:!!c.images?.remotePatterns}));";
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    encoding: "utf8", shell: false,
    env: capacitor ? { ...process.env, CAPACITOR: "1" } : { ...process.env, CAPACITOR: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
test("build WEB: sin output, con headers, con optimización actual", () => {
  const c = cargarConfig(false);
  assert.equal(c.output, undefined);
  assert.equal(c.tieneHeaders, true);
  assert.equal(c.remotePatterns, true);
});
test("build CAPACITOR: export, sin headers, sin optimizador", () => {
  const c = cargarConfig(true);
  assert.equal(c.output, "export");
  assert.equal(c.distDir, "out");
  assert.deepEqual(c.pageExtensions, ["tsx", "jsx", "js"]);
  assert.ok(!c.pageExtensions.includes("ts"), "debe excluir .ts para dejar afuera route.ts");
  assert.equal(c.trailingSlash, true);
  assert.equal(c.unoptimized, true);
  assert.equal(c.tieneHeaders, false);
});
```

- [ ] Escribir el test → **FALLA el segundo** (hoy `output` es `undefined`).
- [ ] Aplicar el config y el script.
- [ ] `node --test scripts/config.test.mjs` → los dos pasan.
- [ ] `npm test` + `npx tsc --noEmit` verdes.
- [ ] `npm run build` → criterio de no-regresión de §1; `out-capacitor` no existe.
- [ ] `npm run build:capacitor -- --diagnostico` → se espera que **FALLE**.
      Anotar los errores contra la predicción:

| Predicho | ¿Apareció? |
|---|---|
| `titulo/[tipo]/[id]` sin `generateStaticParams` | |
| `persona/[id]` sin `generateStaticParams` | |
| `categoria/[slug]` sin `generateStaticParams` | |
| `lista/[key]` sin `generateStaticParams` | |
| `admin/resena/[id]` sin `generateStaticParams` | |
| `categoria/[slug]` usa `searchParams` en Server Component | |
| **Ningún error por las 25 rutas de API** ← valida `pageExtensions` | |

- [ ] 🔍 Probar la junction por API de Node (§3.3): ¿se crea sin elevación?
- [ ] **Limpieza recuperable tras el fallo esperado:** borrar
      `.capacitor-diagnostico/` (con la verificación de ruta absoluta de arriba).
- [ ] `git status --short` → **sólo los cuatro archivos ajenos de siempre**,
      ningún residuo.
- [ ] `dir` en la raíz → **no existe `out/`** ni ningún artefacto parcial fuera
      de los tres directorios autorizados.
- [ ] Commit.

**Aprobación:** los errores son **exactamente** los predichos, **ninguno viene
de las 25 rutas de API**, y **no quedó ningún artefacto fuera de los
directorios autorizados**.
**Cancelación:** aparece un error estructural distinto irresoluble en ≤1 sesión.
**Artefactos:** candidatos a integración posterior.
**Estimación: 1–1,5 sesiones.**

---

## CP2 — Staging, rutas exportables, indicador nativo y export completo

**Precondiciones:** CP1 aprobado.

**Archivos:** `lib/plataforma.ts` (+test) · `lib/rutas.ts` (+test) ·
`app/t/page.tsx` · `app/p/page.tsx` · `generateStaticParams` en
`app/lista/[key]/page.tsx` y `app/categoria/[slug]/page.tsx` ·
`searchParams` de categoría al cliente · los 9 enlaces internos ·
`scripts/build-capacitor.mjs` (staging completo de §3).

**Contrato de rutas — una sola firma pública:**
```ts
/**
 * href interno a una ficha. Web: /titulo/movie/278. Nativo: /t?tipo=movie&id=278.
 * `opts.nativo` existe SÓLO para pruebas; en producción se omite y resuelve
 * con ES_NATIVO (bandera de build, §2).
 * NO confundir con lib/compartir.ts, que arma el enlace PÚBLICO absoluto.
 */
export function hrefTitulo(tipo: MediaType, id: number|string, opts?: {nativo?: boolean}): string;
export function hrefPersona(id: number|string, opts?: {nativo?: boolean}): string;
export function parseParamsTitulo(sp: URLSearchParams): {tipo: MediaType; id: string} | null;
export function parseParamsPersona(sp: URLSearchParams): {id: string} | null;
```

**`/t` y `/p`: params inválidos SIN `notFound()`.** Verificado: `notFound()` no
está documentado para Client Components en Next 14 — el ejemplo oficial es un
Server Component `async`.

```tsx
// app/t/page.tsx
"use client";
function TDetalle() {
  const p = parseParamsTitulo(useSearchParams());
  if (!p) return <ParametrosInvalidos volverA="/" />;   // estado propio
  return <DetailView tipo={p.tipo} id={p.id} />;
}
export default function Page() {
  // useSearchParams EXIGE Suspense bajo output:'export'.
  // Verificado: éste es el primer <Suspense> del repo.
  return <Suspense fallback={<DetailSkeleton />}><TDetalle /></Suspense>;
}
```

**Los 9 enlaces internos:** `TitleCard.tsx:31` · `ruleta/RuletaCard.tsx:77, :84,
:112` *(el 112 es `<a>`, no `Link`)* · `upcoming/UpcomingCard.tsx:24` ·
`desempate/DesempateResult.tsx:38` · `CastRail.tsx:15` · `PersonCard.tsx:8` ·
los relacionados de `DetailView` (cubiertos por `TitleCard`).

**Aprobación:**
- [ ] `npm run build:capacitor` **completa**.
- [ ] `out-capacitor/index.html` existe.
- [ ] **Anti-mismatch:** el HTML exportado contiene `/t?tipo=` y **no** `/titulo/`.
- [ ] Servir `<raíz>/out-capacitor/` y abrir `/t/?tipo=movie&id=278` **por URL
      directa** — no hace falta tocar una card.
- [ ] `git status --short` limpio en `app/`, `components/`, `lib/`, `hooks/`,
      `public/` (§3.2).
- [ ] Criterio de no-regresión web (§1).

### CP2.7 — Canario de `pageExtensions` (prueba diferida de CP1)

🔴 **Un export exitoso NO prueba nada por sí solo**, y es la trampa que hay que
evitar: el staging **excluye físicamente `app/api`**, así que el build
completaría aunque `pageExtensions` no estuviera haciendo nada. Hace falta un
canario que sólo pueda sobrevivir si el matcher de rutas ignora `.ts`.

**Procedimiento, después de que el export normal de CP2 complete:**

- [ ] **1.** Preparar el staging normal (con las páginas dinámicas ya resueltas
      o excluidas) conservándolo: `--keep-staging`.
- [ ] **2.** Crear **únicamente dentro del staging**
      `.capacitor-build/app/__pageextensions_canary__/route.ts`:

```ts
// Canario de pageExtensions. Si Next lo detectara como ruta, el build fallaría:
// output:"export" no admite POST ni rutas que dependan del Request.
// Que el build COMPLETE es la prueba de que `.ts` está excluido.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const cuerpo: unknown = await req.json();
  return Response.json({ ok: true, cuerpo });
}
```

🔴 **Tiene que ser TypeScript VÁLIDO** —sin imports inexistentes, sin errores de
tipo— para que el typecheck no falle **antes** de llegar a medir el matcher de
rutas. Si falla por tipos, el canario no midió nada.

- [ ] **3.** Ejecutar Next **directamente**, con `cwd = .capacitor-build`, **sin
      regenerar el staging** (regenerarlo borraría el canario):
      `node node_modules/next/dist/bin/next build`
- [ ] **4.** **Resultado esperado: el build COMPLETA.**
      🔴 **Si falla mencionando el canario, `pageExtensions` NO está excluyendo
      `route.ts` y CP2 NO se aprueba.**
- [ ] **5.** Verificar que el canario **no aparece en el artefacto**: no existe
      `__pageextensions_canary__` en la salida.
- [ ] **6.** Verificar que `app/api` **no existe en la copia** normal del
      staging (la exclusión física, que es lo otro).
- [ ] **7.** Verificar que **`manifest.ts` no produjo `manifest.webmanifest`**
      en el export — la otra mitad de lo que `pageExtensions` excluye.
- [ ] **8.** Limpiar o regenerar el staging.

**Esto cierra formalmente el criterio diferido de CP1.**
⚠️ **No se vuelve a cambiar `pageExtensions` sin evidencia nueva.**

**Estimación: 2,5–3 sesiones** (absorbe el staging completo y el canario).

---

## CP3 — Base remota de la API

**Precondiciones:** CP2 aprobado.

```ts
export const API_BASE: string;                                  // "" en web
export function apiUrl(path: string, base?: string): string;    // idempotente sobre absolutas
```

**Las 20 ediciones:** `components/useApi.ts:64` (cubre a los 8 consumidores de
`useApi`) + 18 fetches directos + `lib/calendar-links.ts:37` (`icsUrl`).

Los 18: `DirectoresView:44` · `MiniseriesView:49` · **`RecordarButton:70`** ·
`SearchView:87, :115, :262, :370, :454, :501` · `TeVaAGustar:96` · `TopBar:29` ·
`UltimosView:41` · `UserShelf:35` · `cuenta/EliminarCuenta:43` ·
`desempate/DesempateManualSearch:35` · `onboarding/PlatformPicker:15` ·
`ruleta/RuletaBanner:81` · `upcoming/UpcomingAllView:43`.

**`/api/recordatorio` tiene DOS operaciones** (verificado en `RecordarButton`):

| Línea | Operación | ¿CORS? | ¿URL absoluta? |
|---|---|:--:|:--:|
| `:70` `await fetch(ics)` | validación | **sí** | sí |
| `:77` `window.location.href = ics` | navegación del `.ics` | no | **sí** |
| `:104` `<a href={ics}>` | idem | no | **sí** |

**Cómo entra la URL de Preview sin persistir:**
`npm run build:capacitor -- --api-base=https://<deploy>.vercel.app`
La inyecta el `spawnSync`; no va a `.env.local`.

**Aprobación:** suite verde · `npm run dev` sin variables → web idéntica ·
**grep de `.next/static` tras un `npm run build`: la URL de Preview NO aparece**.

**Estimación: 1 sesión.**

---

## CP4 — CORS en 23 rutas + ventana de Preview

**Precondiciones:** CP3 aprobado.

**Archivos:** `lib/cors.ts` (+test) y las **23 rutas** de §4.4, con el patrón de
§4.3.

**Pruebas unitarias (RED):** allowlist exacta · `Vary` siempre (incluso
rechazado) · `http://localhost` **no** permitido · no refleja parecidos · nunca
`Allow-Credentials` ni `*` · `anexarVary` no pisa ni duplica · preflight con
`GET, POST, OPTIONS`, `Authorization, Content-Type` y `Max-Age: 600` ·
**una respuesta 500 también lleva CORS**.

**Luego, la secuencia de §5** (commit → push → esperar Preview → confirmar URL →
🔵 aprobación → abrir → curl → **cerrar**).

**Los `curl`** (`curl` viene con Git for Windows) — **6 obligatorios acá + 1
trasladado**:
1. `GET /api/providers` con `Origin: https://localhost` → `Allow-Origin` + `Vary`.
2. `OPTIONS /api/te-va-a-gustar` → `204`, métodos, headers, **la ruta no se ejecuta**.
3. ➡️ **TRASLADADO A CP8 #14.** `POST /api/te-va-a-gustar` con Bearer de una
   cuenta de prueba. **No se elimina ni se relaja**: se ejecuta desde la app
   Android con un usuario conectado, porque no existe cuenta descartable y no
   corresponde crear credenciales para un `curl`. **En CP4 se ejecutó en su
   lugar** el mismo `POST` **sin** JWT, que debe dar `401` **conservando CORS**
   — y dio.
4. `OPTIONS /api/cuenta/eliminar` → **sólo preflight**. 🔴 el POST real no se prueba.
5. `GET` con `Origin: https://malicioso.com` → **sin** `Allow-Origin`, **con** `Vary`.
6. `GET /api/health` sin `Origin` → normal.
7. `GET /api/title/movie/278` con `Origin: https://localhost` → **habilita CP10**.

**Aprobación:** pasan **los seis obligatorios (1, 2, 4, 5, 6, 7)** y el `401`
con CORS del punto 3, **y la protección queda cerrada** al terminar. 🔴 El
`POST` autenticado **con éxito** no es opcional: es **requisito de cierre de
CP8**, no de CP4.
**Artefactos:** `lib/cors.ts` es **candidato a integración posterior**, sujeto a
aprobación después del veredicto. *(La rev. 3 decía "necesitará Producción"
antes de tener veredicto.)*

**Estimación: 2–2,5 sesiones** (23 rutas + la ventana).

---

## ✅ CP5 — 🚦 GATE A — auditada el 30/08/2026

**Veredicto técnico: las 13 comprobaciones pasaron.** El detalle está en
§"Evidencia de Gate A", abajo.

✅ **GATE A APROBADA POR EL DUEÑO el 30/08/2026, y Gate B autorizada.**
El primer checkpoint de Gate B es **CP6**.

🔴 **La autorización llega hasta CP6 y no más.** NO está autorizado todavía:
instalar Capacitor ni ningún paquete `@capacitor/*`, instalar Android Studio,
crear `android/`, `ios/` o `capacitor.config.*`, ni ejecutar `cap init`,
`cap add`, `cap sync` o `cap run`. **CP7 requiere una autorización nueva.**

**No se escribe código.** Gate A valida **export, navegación, helpers y contrato
de CORS** por tests y `curl`. 🔴 **NO afirma consumo real desde el WebView**: el
export de escritorio se sirve desde `http://localhost`, que **no está en la
allowlist y no se agrega**. La primera prueba integral es CP7.

**Decisión 🔵:** ¿se pasa a Gate B? Si no, se cancela habiendo gastado ~6–7,5
sesiones **sin instalar Android Studio**.
**Estimación: 0,25 sesión.**

### Evidencia de Gate A — ejecutada el 30/08/2026 sobre `2649d07`

Auditoría de consolidación de CP1–CP4. **No se escribió ni se corrigió código.**

| # | Comprobación | Resultado | Cómo se verificó |
|:--:|---|:--:|---|
| 1 | Export nativo completo | ✅ | **34** rutas con `index.html` |
| 2 | `app/api` excluida | ✅ | `api`, `admin`, `titulo`, `persona`, `sw.js`, `manifest.webmanifest`: **ninguno** en el artefacto |
| 3 | Rutas `/t/` y `/p/` | ✅ | presentes y con HTML propio |
| 4 | Helpers y barra canónica | ✅ | el artefacto emite `"/t/?tipo="` y `/p/?` — barra **antes** de la query |
| 5 | Fallback de Suspense visible | ✅ | `/t/` body 13.934 B, `/p/` 16.908 B, con texto real. **No en blanco** |
| 6 | Base remota HTTPS | ✅ | `ES_NATIVO` inlineado como `!0` y la base como **literal** en el bundle |
| 7 | La web conserva `/api/` relativo | ✅ | `.next/static` sin base absoluta ni URL de Preview |
| 8 | CORS exacto en 23 rutas | ✅ | `cors.test.ts` **31/31** · `cors-inventario.test.ts` **16/16** |
| 9 | Dos exclusiones justificadas | ✅ | el recuento cierra: **25 = 23 + 2**, sin huérfanas |
| 10 | Preview protegida | ✅ | `302` → `vercel.com/sso-api`, sin seguir la redirección |
| 11 | Suite · TS · build web · export | ✅ | **694/694** · `tsc` **0** · build web completo · export **38/38** |
| 12 | Sin secretos en el artefacto | ✅ | ver la nota de abajo |
| 13 | Sin residuos de staging | ✅ | `.capacitor-build` y `.capacitor-diagnostico` ausentes; `git status` limpio |

**Criterio de no-regresión de la web (§1), punto por punto:** build completo ·
suite y `tsc` verdes · `/titulo/[tipo]/[id]` y `/persona/[id]` siguen existiendo ·
`SITIO_PUBLICO` sigue siendo `https://app.yump.ar` · `headers()` presente y
**sólo** en la rama web del config · `/sw.js` y `manifest.webmanifest` emitidos ·
ningún valor de Preview ni bandera nativa en `.next/static`.

⚠️ **Los nombres `NEXT_PUBLIC_YUMP_NATIVO` y `NEXT_PUBLIC_YUMP_API_BASE` SÍ
aparecen en el bundle web, y está bien.** Son la constante `VARIABLE` y el texto
del mensaje de error, no valores. En la web `ES_NATIVO` resuelve `false` porque
la variable no existe y el shim de `process.env` del navegador es `{}`. Se
verificó que **el valor** no viaja: es lo que importa, y una lectura futura del
grep no debe confundir el nombre con el valor.

⚠️ **El único JWT del artefacto es la clave `anon` de Supabase, y no es una
filtración.** Decodificado: `role: anon`. Es pública por diseño, la necesita el
cliente, y **ya viaja igual en el bundle web** (5 archivos de `.next/static`), o
sea que no la introduce el camino nativo. `TMDB_READ_TOKEN`,
`SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET`: **cero** apariciones — las dos
allowlists separadas de `build-capacitor.mjs` hacen su trabajo.

**El export se construyó con `--api-base=https://ejemplo.invalid`**, a propósito:
Gate A sólo necesita que el export complete y que la base quede inlineada. Usar
la URL de Preview habría horneado una URL real en un artefacto de auditoría sin
ninguna necesidad.

### 🔴 Lo que Gate A NO afirma

- **No afirma consumo real desde el WebView.** Nada se ejecutó en un teléfono ni
  en un contenedor. La primera prueba integral es **CP7**.
- **No afirma compatibilidad con el servidor interno de Capacitor.** `trailingSlash`
  es la mitigación elegida, **no una medición**: se verifica en **CP8 #16** (§9).
  Capacitor no está instalado.
- **No afirma que el `POST` autenticado funcione.** Eso es **CP8 #14**.
- **No revierte la decisión abierta #1**: `/t` y `/p` siguen existiendo e
  indexables en el build web. **Bloquea el merge a `main`, no Gate A.**

---

## ✅ CP6 — completado el 30/08/2026 — PWA neutralizada en el artefacto

**Precondiciones:** Gate A aprobado ✅. **Ningún `cap run` ejecutado todavía** ✅
— Capacitor sigue sin instalar y no existen `android/`, `ios/` ni
`capacitor.config.*`.

**Resultado medido en §"Cierre de CP6", al final de esta sección.**

🔴 **Por qué va acá y no después.** En el primer `cap run android` el bundle ya
es `production`, y `ServiceWorkerRegister.tsx:9` sólo sale con
`NODE_ENV !== "production"` — así que **registraría `/sw.js` dentro de la app**.
Apagarlo en el build siguiente **no deshace**: el SW ya registrado, el controller
existente, el Cache Storage ni lo cacheado. **El contenedor nunca debe abrirse
por primera vez con la PWA activa.**

### Defensa en dos capas

| Capa | Qué hace | Dónde |
|---|---|---|
| **Build** (§3) | `public/sw.js` y `public/sw/` **no se copian al staging**. Sin archivo, `register("/sw.js")` falla aunque un guard falle | `scripts/build-capacitor.mjs` |
| **Guard de componente** | no se intenta registrar ni mostrar nada | los 4 componentes de abajo |

### Inventario COMPLETO de `components/pwa/` — los 8 archivos

🔴 **La rev. 4 sólo cubría el árbol de `PwaClient` y se perdía `InstallRow`**,
que se monta desde **otro lado**: `app/cuenta/configuracion/page.tsx:9`.

| Archivo | Dónde se monta | En el artefacto nativo | Web |
|---|---|---|---|
| `ServiceWorkerRegister.tsx` | `PwaClient` ← `layout.tsx:11` | **no registrar** si `ES_NATIVO` | **intacta** |
| `UpdateToast.tsx` | `PwaClient` | **no mostrar** | intacta |
| `InstallPrompt.tsx` | `PwaClient` | **no mostrar** *(en iOS diría "Compartir → Agregar a inicio" adentro de la app)* | intacta |
| `StandaloneWelcome.tsx` | `PwaClient` | revisar el texto | intacta |
| **`InstallRow.tsx`** | **`app/cuenta/configuracion/page.tsx:9`** | 🔴 **OCULTAR la fila entera** | intacta |
| `AppleSplashLinks.tsx` | `layout.tsx:10` | **no montar** (18 `<link>` inertes) | intacta |
| `OfflineState.tsx` | 8 vistas (`CatalogView`, `CategoryView`, `DetailView`, `ListaView`, `MiniseriesView`, `PersonView`, `TopView`, `UltimosView`) | ⚠️ **SE CONSERVA** | intacta |
| `PwaClient.tsx` | `layout.tsx:11` | se conserva como contenedor; sus hijos se apagan solos | intacta |

⚠️ **`OfflineState` no es una entrada de PWA.** Es el estado "sin conexión" de
la app y lo consumen 8 vistas. **Tocarlo rompería CP8 #13**, que es una de las
tres pruebas obligatorias.

**Por qué `InstallRow` no se puede dejar como está.** Su primera rama es
`if (installed) return …` con el texto *"Ya la estás usando como app instalada.
🎉"* y la etiqueta *"Instalada"*. Dentro de Capacitor `isStandalone()` matchea
`display-mode: standalone`, así que **`installed` da `true`** y el usuario de un
APK vería un mensaje sobre una instalación de PWA que nunca hizo. Las otras
ramas son peores: ofrecerían **instalar** una app que ya está instalada.

🟡 **Para el spike: ocultar la fila entera** con la misma bandera de build. Es la
opción mínima. Reemplazarla por información útil de la app instalada (versión,
build) es producto, no spike — 🔵 y sólo si el dueño lo pide.

**`hooks/useInstallPrompt.ts`** lo consumen únicamente `InstallPrompt` e
`InstallRow`. Con las dos apagadas, el hook queda sin llamadores en el
artefacto: **no hace falta tocarlo**.

**Auditoría de cierre — ninguna UI puede invitar a instalar dentro del APK:**

- [ ] Recorrer `/cuenta/configuracion` en el teléfono: **no aparece** la fila de
      instalación en ninguna de sus tres formas.
- [ ] Recorrer el Home y esperar: **no aparece** el banner de instalación.
- [ ] No aparece el aviso de actualización de la PWA.
- [ ] El HTML exportado no trae `<link rel="manifest">` ni
      `apple-touch-startup-image`.
- [ ] **En la web, las tres entradas siguen existiendo**: banner, fila de
      configuración y aviso de actualización.

### Metadata de PWA en el artefacto nativo

`app/layout.tsx` declara `manifest: "/manifest.webmanifest"` (línea 49),
`appleWebApp` (52-56) y monta `<AppleSplashLinks />` (65).

| Elemento | En el artefacto nativo | Cómo |
|---|---|---|
| `<link rel="manifest">` | **omitir** — `pageExtensions` sin `"ts"` ya excluye `app/manifest.ts`, así que el archivo **no existe** y el link apuntaría a un 404 | condicionar `manifest:` con `ES_NATIVO` |
| `appleWebApp` | **omitir**: es metadata de "agregar a inicio" en Safari, sin sentido en un APK | idem |
| `<AppleSplashLinks />` | **no montar**: 18 `<link>` a splash de iOS, inertes y peso muerto | guard con `ES_NATIVO` |
| `themeColor`, `viewportFit`, `interactiveWidget`, safe areas | **se conservan** | son de layout, no de PWA |

**Aprobación (antes de cualquier `cap run`):**
- [ ] `out-capacitor/` **no contiene** `sw.js` ni `sw/`.
- [ ] `out-capacitor/` **no contiene** `manifest.webmanifest`.
- [ ] El HTML exportado **no** tiene `<link rel="manifest">` ni `apple-touch-startup-image`.
- [ ] Criterio de no-regresión web (§1): `/sw.js` y `manifest.webmanifest` **siguen
      sirviéndose** en el build web.

### Recuperación de una instalación contaminada

🔴 **Camino de emergencia, no el normal.** Si por un error igual se abrió con la
PWA activa:

```
1. chrome://inspect → Inspect sobre el WebView de Yump Dev
2. Consola:
     const rs = await navigator.serviceWorker.getRegistrations();
     await Promise.all(rs.map(r => r.unregister()));
     const ks = await caches.keys();
     await Promise.all(ks.map(k => caches.delete(k)));
3. Android: Ajustes → Apps → Yump Dev → Almacenamiento → Borrar datos
   (o desinstalar y reinstalar la build debug)
4. Verificar, otra vez en consola:
     (await navigator.serviceWorker.getRegistrations()).length   → 0
     (await caches.keys()).length                                → 0
```

**Estimación: 0,75 sesión.**

---

### Cierre de CP6 — medido el 30/08/2026

**La decisión vive en un módulo propio: `lib/pwa-nativa.ts`** (`pwaActiva()` y
`metadataPwa()`). No se repitió `ES_NATIVO` en cada componente, y el motivo es
que así la decisión **se puede probar en un solo proceso**: la constante se
resuelve al evaluar el módulo, y con la bandera cruda hacen falta dos procesos
para ver los dos caminos. **Una sola bandera de build, sin `@capacitor/core` ni
detección en runtime**, fijado por test.

| Pieza | Qué se hizo | Dónde |
|---|---|---|
| `ServiceWorkerRegister` | `if (!pwaActiva()) return;` **antes** del guard de `NODE_ENV` | el propio componente |
| `UpdateToast` | `return null` | el propio componente |
| `InstallPrompt` | `return null`, **después** de los hooks | el propio componente |
| `InstallRow` | `return null`, **después** de los hooks | el propio componente |
| `AppleSplashLinks` | no se monta | `layout.tsx` — el archivo es **generado**, no se toca |
| `PwaClient` | se conserva; en nativo monta **sólo** `StandaloneWelcome` | el propio componente |
| `StandaloneWelcome` | **intacto** — ver la auditoría de abajo | — |
| `OfflineState` | **intacto** | — |
| `metadata` | `manifest` y `appleWebApp` salen por spread de `metadataPwa()` | `layout.tsx` |

⚠️ **Los guards de `UpdateToast`, `InstallPrompt` e `InstallRow` son
redundantes con el de `PwaClient`, a propósito.** Cada pieza queda apagada la
monte quien la monte — y `InstallRow` no cuelga de `PwaClient`: la monta
`app/cuenta/configuracion/page.tsx`, que es exactamente el caso que la rev. 4 se
había perdido.

⚠️ **En `InstallPrompt` e `InstallRow` el guard va DESPUÉS de los hooks.**
`pwaActiva()` es una constante de build y nunca cambia entre renders, así que un
return anticipado sería seguro — pero igual contradice las reglas de hooks de
React. Colocarlo después no cuesta nada. ⚠️ **Este repo no tiene ESLint
configurado** (`next lint` ofrece crearlo), así que la regla no la hace cumplir
ninguna herramienta: se respeta a mano y por revisión.

#### ✅ `StandaloneWelcome` — auditado por separado, y se CONSERVA

No se apagó automáticamente. Su contenido visible completo es:

> ¡Bienvenido a la app! · *Para empezar, elegí tus plataformas de streaming desde
> el botón **Plataformas** arriba. Si ya tenías cuenta, ingresá de nuevo para ver
> tus listas.* · **Empezar**

**No dice una palabra sobre instalar, ni sobre PWA, ni sobre Safari.** Describe
exactamente la situación del primer arranque del APK: **almacenamiento nuevo y
vacío**, sin plataformas elegidas y sin sesión. Y su condición de disparo ya
encaja sola — `isStandalone()` matchea `display-mode: standalone` dentro del
contenedor, y sólo se muestra si además no hay plataformas elegidas.

**Se conserva. No se reescribió ni se retocó**: no había ninguna decisión de
producto que tomar acá.

#### Verificación — los dos caminos, no sólo el nativo

| Camino | Comprobación | Resultado |
|---|---|---|
| **Nativo** | `sw.js`, `sw/`, `manifest.webmanifest` en `out-capacitor/` | **ausentes** |
| Nativo | `rel="manifest"` en los **36** HTML del artefacto | **0** |
| Nativo | `apple-touch-startup-image` en los 36 HTML | **0** |
| Nativo | `apple-mobile-web-app-capable` en los 36 HTML | **0** |
| Nativo | `themeColor`, `viewport-fit=cover`, `interactive-widget`, `<title>` | **conservados** |
| Nativo | 34 rutas, `/t/` y `/p/`, base HTTPS inlineada | **sin cambios vs Gate A** |
| Nativo | secretos en el artefacto | **0** |
| **Web** | `<link rel="manifest">` | **presente** |
| Web | `apple-touch-startup-image` | **36 apariciones** (los 18 splash) |
| Web | `apple-mobile-web-app-capable` | **presente** |
| Web | `manifest.webmanifest` como ruta emitida | **presente** |
| Web | `public/sw.js`, `public/sw/`, `app/manifest.ts` | **sin un solo byte de diferencia** |
| Web | `SC_CACHE_VERSION` | **`v7`, sin subir** — el SW web no se tocó |
| Ambos | suite · `tsc` · build web · export | **724/724** · **0** · **41/41** · **38/38** |
| Ambos | `git diff --check` · residuos de staging | limpio · ninguno |

🔴 **El bloque WEB de la tabla no es decorativo.** Sin él, todo lo demás se
cumpliría igual si el guard hubiera apagado la PWA en **los dos** builds. Es la
mitad que demuestra que la web no cambió.

#### 🔴 Lo que un grep NO puede probar acá

Las cadenas de la UI de instalación ("Instalar aplicación", "Hay una versión
nueva de Yump") **siguen estando en el `.js` del artefacto nativo**, y eso **no
es un fallo**. El guard es una constante importada de otro módulo, así que el
minificador no puede eliminar la rama muerta. **Buscar esos textos y no
encontrarlos sería suerte, no evidencia.** Por eso lo que se verifica es el
comportamiento (`pwaActiva()` en los dos sentidos, en proceso y en procesos
hijos) y el **HTML emitido**, que es donde la ausencia sí significa algo.

#### 🟡 Dos hallazgos de peso muerto — reportados, NO corregidos

Están **fuera del alcance aprobado de CP6** y no afectan ninguna comprobación.
Se dejan anotados para que el dueño decida:

1. **`out-capacitor/splash/` — 1,8 MB y cero referencias.** Después de CP6 nada
   en el artefacto apunta a un `splash-*.png`: los 18 `<link>` desaparecieron.
   Sacarlos del staging es una línea en `PUBLIC_FUERA`, pero es tocar el
   contrato de copia y **eso no estaba autorizado acá**.
2. **`out-capacitor/offline.html` viaja y nadie lo sirve.** Es el fallback que
   servía el service worker; sin SW, es inalcanzable. ⚠️ **No confundirlo con
   `OfflineState`**, que es el componente React de 9 vistas y **sí** lo necesita
   CP8 #13. Son dos cosas distintas con nombres parecidos.

⚠️ **`out-capacitor/icons/` (116 KB) SÍ se queda y no es peso muerto:**
`StandaloneWelcome` usa `/icons/icon-192.png`, y esa pieza se conserva.

#### Corrección al inventario del plan

El inventario de arriba decía que `OfflineState` lo consumen **8** vistas. Son
**9**: faltaba `components/upcoming/UpcomingAllView.tsx`. El test las verifica
a las nueve.

#### Pruebas nuevas — `lib/pwa-nativa.test.ts`, 30 casos

Cuatro niveles, porque ninguno alcanza solo: la **decisión** pura en los dos
sentidos · la **bandera real** en procesos hijos con y sin
`NEXT_PUBLIC_YUMP_NATIVO`, incluida la no-contaminación en los dos órdenes · la
**estructura**, con cinco canarios que prueban que el análisis detecta de
verdad · el **artefacto y el HTML web**, que son los únicos que prueban el
resultado y se saltan solos en un checkout sin builds.

El inventario de los 8 archivos de `components/pwa/` **cierra por igualdad de
conjuntos**: cuatro apagados, tres con exclusión y motivo registrado, y
`PwaClient`. Un archivo nuevo sin clasificar rompe el test.

**CP6 TERMINADO.** 🔴 CP7 **no se empezó** y requiere autorización nueva.

---

## 🔄 Sincronización con `main` — 2 de septiembre de 2026

**Fin del paréntesis.** Entre CP6 y CP7 el trabajo se fue a producto: se
integraron disponibilidad oficial probable, deduplicación por identidad oficial,
Próximamente sin corte por popularidad, el Top manual con MFA, la corrección PWA
de `theme-color` y dos ajustes visuales. Nada de eso pasó por el spike, y la
rama había quedado 41 commits atrás.

**`main` se incorporó al spike con un merge commit.** Hash sincronizado:
**`5297e25`**. La dirección es `main` → spike, nunca al revés; los 14 commits de
CP1–CP6 quedaron intactos y no se reescribió ninguno.

### Qué pasa a formar parte de la base del spike

| Lo que llegó | Qué le importa al contenedor |
|---|---|
| Disponibilidad oficial probable, dedup por identidad | nada: es servidor, viaja por la API |
| Próximamente sin corte por popularidad | nada, misma razón |
| Top manual + MFA | **sí**: sumó `app/admin/top` y `app/api/admin/top` |
| Corrección PWA de `theme-color` | **sí**: cambió `app/layout.tsx` |
| Top a 26 px, ficha con plataformas múltiples | nada: es CSS y un componente |

**Ninguna pieza del contrato nativo cambió en `main`.** `next.config.mjs`,
`scripts/build-capacitor.mjs`, `lib/pwa-nativa.ts`, `lib/api-base.ts`,
`lib/plataforma.ts` y `public/sw.js` no fueron tocados por los 41 commits.

### Los tres ajustes que exigió la integración

Ninguno es un criterio nuevo: son inventarios y un testigo que el delta dejó
viejos, y en los tres casos **el guard existente fue el que los encontró**.

1. **`app/admin/top/page.tsx`** llama a `/api/admin/top` con URL relativa. Entra
   en las excepciones de `api-base.test.ts` por el **mismo motivo** que la que ya
   estaba: `app/admin` no viaja en el artefacto.
2. **`app/api/admin/top/route.ts`** quedó sin clasificar en el inventario de
   CORS. Se clasifica como **excluida**, mismo motivo que `admin-search`. El
   recuento pasa de **25 = 23 + 2** a **26 = 23 + 3**. **Las 23 integradas de CP4
   no se movieron.**
3. **`pwa-nativa.test.ts`** verificaba que la cirugía nativa no borra metadata
   ajena usando `themeColor:` del viewport como testigo. `main` lo sacó a
   propósito. El contrato no cambió; el testigo pasa a ser `THEME_INIT_SCRIPT`,
   que es donde vive el color ahora.

### 🔴 La colisión real: `?tipo=` contra el export estático

`main` agregó `?tipo=` a `/lista/ultimos`, leído en el **servidor**. Con
`output: export` eso aborta el export entero:

```
Route /lista/ultimos/ with `dynamic = "error"` couldn't be rendered
statically because it used `searchParams.tipo`
```

Es exactamente el bloqueante **§2.c** de `docs/CAPACITOR.md`, que la auditoría
había previsto y que apareció recién ahora porque la ruta no existía.

**Resuelto sin tocar la web:** la lectura queda detrás de `ES_NATIVO`, que es
constante de build. En web se sigue leyendo en el servidor, sin
`useSearchParams` ni el `<Suspense>` que eso obligaría; en el artefacto nativo la
rama no se ejecuta y el export completo de CP2 se conserva.

⚠️ **El costo, declarado y no resuelto acá:** dentro del contenedor un enlace con
`?tipo=tv` abre en Películas. Hoy no hay navegación nativa —eso es CP7—, así que
queda anotado como **pendiente de CP7**, no como algo ya resuelto.

### Estado tras la sincronización

- **CP1–CP6 continúan válidos.** No se repitieron sus mediciones históricas y
  este documento no las reescribe: se verificó que **siguen pasando** después
  del merge (los siete tests del contrato nativo, la suite completa, TypeScript,
  los dos builds y el export).
- **CP7 sigue sin empezar.**
- **No se instaló Capacitor.** Sigue sin `@capacitor/*`, sin `android/`, sin
  `capacitor.config.*` y sin ningún `cap init`/`add`/`sync`/`run`.

### Pendiente ajeno que sigue abierto

El **Top público por bloque**: el cutover del Top manual es atómico y todavía
faltan los doce bloques publicados, así que `/top` sigue sirviéndose con la
implementación vieja. No afecta al contenedor —`/top` se consume por API— pero
conviene saberlo al leer la sección del Top.

## CP7 — Proyecto Android y primera prueba integral limpia

**Precondiciones:** CP6 aprobado y **verificado**. 🔵 Ventana de Preview abierta
para esta sesión (§5).

**Dependencias — corregido contra la doc oficial de Capacitor:**

```
npm install @capacitor/core@8 @capacitor/android@8
npm install --save-dev @capacitor/cli@8
```

🔴 **La rev. 3 ponía los tres con `-D`. Está mal:** `@capacitor/core` y
`@capacitor/android` son **runtime del proyecto nativo** y van en
`dependencies`; sólo `@capacitor/cli` es de desarrollo. **El mismo criterio vale
para los plugins de CP9:** son runtime → `dependencies`.

- [ ] Android Studio + JDK + SDK 36 + Platform Tools; `adb devices` lista el teléfono.
- [ ] Instalar con los comandos de arriba.
- [ ] **Verificar las versiones efectivamente resueltas** antes de crear Android:
      `npm ls @capacitor/core @capacitor/cli @capacitor/android` → las tres en 8.x.
- [ ] `npx cap init "Yump Dev" ar.yump.app.dev --web-dir out-capacitor`
- [ ] `npx cap add android`
- [ ] **Verificar** `android/variables.gradle`: `compileSdkVersion = 36`,
      `targetSdkVersion = 36`. No se personalizan.
- [ ] **Verificar** que el `AndroidManifest.xml` generado **ya trae**
      `android.permission.INTERNET`. 🔴 **No agregarlo a mano**: si está, es del
      template; si no está, recién ahí se evalúa. Y **sacar cualquier permiso que
      sobre**.
- [ ] `.gitignore`: **sólo** `out-capacitor/` y `.capacitor-build/`.
      🔴 **`android/` SÍ se versiona** — lleva configuración, plugins y evidencia.
- [ ] `npm run build` normal antes y después: criterio de §1.
- [ ] `npm run build:capacitor -- --api-base=<URL de Preview>` → `npx cap sync
      android` → `npx cap run android`.
- [ ] **Primera comprobación al abrir**, en `chrome://inspect`:
      `getRegistrations()` → `[]` y `caches.keys()` → `[]`. **Limpio de entrada.**

**Aprobación:** el Home carga **con datos reales de Preview en el teléfono**, y
la app abrió **sin** service worker ni caches.
**Cierre de sesión:** volver a proteger la Preview y verificarlo (§5).
**Estimación: 1,5–2 sesiones.**

---

## CP8 — Matriz móvil, sin instalar un solo plugin

**Precondiciones:** CP7 aprobado. 🔵 Ventana de Preview de esta sesión.

| # | Qué | Criterio |
|---|---|---|
| 1 | Botón Atrás físico | ¿navega o cierra? |
| 2 | Enlaces externos (legales, alta, Calendar, `.ics`) | ¿abren fuera, adentro, o nada? |
| 3 | **Compartir** | lleva `https://app.yump.ar/titulo/...` — no Preview ni `localhost` |
| 4 | Teclado en `/buscar` | ¿tapa el input? |
| 5 | Barra de estado | legible en claro y oscuro |
| 6 | Safe areas | nada bajo el gesture bar |
| 7 | Orientación | rotar no rompe |
| 8 | Suspensión 5 min | vuelve donde estaba |
| 9 | Arranque frío | anotar tiempo |
| 10 | Arranque caliente | idem |
| 11 | Cierre forzado | reabre sin estado corrupto |
| 12 | Red lenta | esqueletos, sin pantalla muerta |
| 13 | **Modo avión** | la cáscara **abre** y muestra `OfflineState` |
| 14 | **Sesión + `POST` autenticado** | login → cerrar → reabrir → **sigue logueado**, **y** el `POST` real con Bearer responde con CORS exacto — ver abajo |
| 15 | Plataformas | persisten entre reinicios |
| 16 | **Navegación del export** | §9 |

### 🔴 CP8 #14 — requisito explícito de cierre, trasladado desde CP4

Esta es la prueba que CP4 **no pudo** hacer por falta de una cuenta de prueba, y
que el dueño aprobó mover acá **sin eliminarla ni relajarla**. **CP8 NO puede
cerrarse sin ella.**

Se ejecuta `POST /api/te-va-a-gustar` **desde la aplicación Android**, con un
usuario realmente conectado, y **todo** lo siguiente tiene que darse:

- [ ] **Usuario conectado en Android** — sesión real en la app, no un `curl`
      desde la máquina de desarrollo.
- [ ] **Request real con Bearer** — el JWT de esa sesión, emitido por Supabase.
- [ ] **Respuesta normal** — un `2xx` con el cuerpo esperado de la ruta. 🔴 Un
      `401` **no** cierra este punto: eso ya se demostró en CP4.
- [ ] `Access-Control-Allow-Origin: https://localhost` — **el origen exacto**,
      no otro.
- [ ] `Vary: Origin` presente.
- [ ] **Sin comodín**: `Access-Control-Allow-Origin: *` **no** debe aparecer.
- [ ] **Sin** `Access-Control-Allow-Credentials` — en ningún valor.
- [ ] **El token no se imprime ni se conserva**: no va a la consola, ni al log,
      ni a un archivo, ni al repositorio. La evidencia se guarda **con el token
      redactado**.

**Cómo se observa** — la app es la que hace el request, así que los encabezados
se leen desde `chrome://inspect` (pestaña Network del WebView), no reconstruyendo
la llamada con `curl`. Reconstruirla probaría otra cosa.

⚠️ **La evidencia se deja escrita en el repositorio**, con el token redactado.
Corrige la limitación real de CP4, donde la salida cruda de los `curl` no quedó
persistida y hoy no es reproducible sin reabrir la Preview.

**Aprobación:** 3, 13 y 14 obligatorios — **y #14 exige las ocho casillas de
arriba, la del `2xx` incluida**. El resto se documenta aunque falle.
**Estimación: 1 sesión.**

---

## CP9 — Plugins, sólo los que CP8 demostró

**Todos van en `dependencies`** (son runtime), no en devDependencies.

| Plugin | Problema | Prueba previa | Permiso | Criterio |
|---|---|---|---|---|
| `@capacitor/app` | el back cierra la app | CP8 #1 | ninguno | si #1 falla |
| `@capacitor/browser` | sitios ajenos adentro del WebView | CP8 #2 | ninguno | si #2 falla |
| `@capacitor/share` | `navigator.share` no existe en WebView | CP8 #3 | ninguno | si #3 falla |
| `@capacitor/status-bar` | barra ilegible | CP8 #5 | ninguno | si #5 falla |
| `@capacitor/preferences` | sesión perdida | CP8 #14 | ninguno | **ver abajo** |
| `@capacitor/splash-screen` | pantalla en blanco | CP8 #9 | ninguno | cosmético; **no** en el spike |

🔴 **`@capacitor/preferences` NO es una solución automática.** Instalarlo **no
arregla nada por sí solo**: haría falta escribir un **adaptador de
almacenamiento** y pasárselo a `createClient` como `auth.storage`, más decidir
qué pasa con la sesión ya guardada en `localStorage` (migrar o perder) y
verificar que sobreviva. **Si CP8 #14 falla, eso es un mini-proyecto**, no una
instalación — y se estima aparte.

**Estimación: 0,5–1,5 sesiones.**

---

## CP10 — YouTube

**Precondiciones:** CP7 aprobado **y `/api/title/[tipo]/[id]` con CORS** (CP4).
Sin ficha no hay tráiler. 🔵 Ventana de Preview de esta sesión.

🔴 **Con `ar.yump.app.dev` y firma debug.**

| # | Experimento | Observable |
|---|---|---|
| 1 | Abrir un tráiler sin tocar nada | el error exacto en consola remota |
| 2 | **Medir si el `Referer` viaja** | Network de `chrome://inspect` |
| 3 | Fijar `Referer: https://ar.yump.app.dev` | ¿desaparece el 153? |
| 4 | URL base del contenido local | idem |
| 5 | WebView Media Integrity | idem |
| 6 | `origin=SITIO_PUBLICO` | 🔍 hipótesis adicional; **no** es la solución del `Referer` |

🔵 Si funciona el 5, **no implica adelantar identificador ni keystore**: se
**eleva la pregunta** al dueño. El prototipo sigue con `.dev` y debug.
🔴 Si ninguno funciona, **no se apagan los tráileres en silencio**: se documenta.

**Estimación: 0,5–2 sesiones.**

---

## CP11 — Veredicto y cierre

- [ ] Escribir el resultado en `docs/CAPACITOR.md`.
- [ ] **Extraer y verificar** lo reutilizable en una rama limpia; recién después
      proponer qué se descarta.
- [ ] 🔴 **Nada se borra sin aprobación.**
- [ ] **Verificar que la Preview quedó protegida.**
- [ ] Confirmar que ningún secreto quedó en el repo ni en el APK.
- [ ] Criterio de no-regresión web (§1).

**Estimación: 0,5 sesión.**

---

## 9. Navegación del export dentro de Capacitor — verificar en CP8 #16

`trailingSlash: true` (doc de Next 14): con `output: "export"`, `/about` se emite
como **`/about/index.html`** en vez de `/about.html`. Se elige a propósito: un
servidor de archivos resuelve un directorio con `index.html` de forma natural,
mientras que `/about.html` exige que el servidor pruebe `$uri.html` —
comportamiento **no garantizado** en el servidor interno de Capacitor.

🔴 **No se asume que `serve` en escritorio se comporte igual.** Por eso la
comprobación es **en el teléfono**:

| Qué | Esperado |
|---|---|
| Arranque en `/` | `index.html` |
| `Link` a `/buscar` | client-side, sin recarga |
| **Carga directa** de `/t/?tipo=movie&id=278` | monta la ficha |
| **Recarga** en `/buscar` | vuelve a montar, no 404 |
| **Query strings** tras recarga | `?tipo=movie&id=278` sigue |
| Atrás desde `/t` | vuelve a la pantalla anterior |
| Ruta inexistente | `404.html`, no pantalla en blanco |

---

## 10. `next/image` — no bloquea, pero se blinda

**Verificado: el proyecto NO usa `next/image`.** El único hit en todo el árbol es
un comentario en `components/avatar/Avatar.tsx:8` explicando que no se usa a
propósito. Igual se declara `images: { unoptimized: true }` en el config de
Capacitor: cuesta una línea y evita que el día que alguien agregue un `<Image>`
el build nativo se rompa sin explicación. La web conserva `remotePatterns`, con
test de regresión en CP1.

---

## 11. Secuencia y estimación

```
GATE A (sin teléfono)
  CP1 diagnóstico → CP2 staging + rutas + plataforma + export completo
  → CP3 base API → CP4 CORS 23 rutas + ventana Preview → CP5 Gate A

ANTES DE ANDROID
  CP6 🔴 PWA neutralizada en el artefacto

GATE B (teléfono, ventana de Preview por sesión)
  CP7 Android + 1ª prueba integral limpia → CP8 matriz → CP9 plugins
  → CP10 YouTube → CP11 cierre
```

| Gate | CP | Sesiones | Cambio vs rev. 3 |
|---|---|---|---|
| **A** | CP1 diagnóstico | 1–1,5 | = |
| A | CP2 staging + rutas + plataforma | **2,5–3** | +0,5 más: allowlist de entorno y `tsconfig` derivado |
| A | CP3 base API | 1 | = |
| A | CP4 CORS + ventana | **2–2,5** | +0,5: contrato concreto y secuencia de Preview |
| A | CP5 Gate A | 0,25 | = |
| | **Subtotal A** | **6,75–8,25** | |
| — | **CP6 PWA** | **1** | +0,25: `InstallRow` y la auditoría de las 8 piezas |
| **B** | CP7 Android | 1,5–2 | = |
| B | CP8 matriz | 1 | = |
| B | CP9 plugins | 0,5–1,5 | = |
| B | CP10 YouTube | 0,5–2 | = |
| B | CP11 cierre | 0,5 | = |
| | **Subtotal B** | **4–7** | |

**Total: 11,75–16,25 sesiones** (rev. 4: 11–15,5; rev. 3: 10,25–14,25).

⚠️ **Fuera de esa cuenta:** si CP8 #14 falla, el adaptador de almacenamiento de
§CP9 es un mini-proyecto que se estima aparte.

---

## 12. Matriz de artefactos

| Artefacto | Sólo prototipo | Reutilizable web | Candidato a integración | Android | Reutilizable iOS |
|---|:--:|:--:|:--:|:--:|:--:|
| `next.config.mjs` condicional | | ✅ | ✅ | | ✅ |
| `scripts/build-capacitor.mjs` (staging) | | ✅ | ✅ | | ✅ |
| `scripts/config.test.mjs` | | ✅ | ✅ | | ✅ |
| `generateStaticParams` (lista, categoría) | | ✅ | ✅ | | ✅ |
| `lib/plataforma.ts` (bandera de build) | | ✅ | ✅ | | ✅ |
| `lib/rutas.ts` + `/t` + `/p` + Suspense | | ✅ | ✅ | | ✅ |
| `lib/api-base.ts` + 20 ediciones | | ✅ | ✅ | | ✅ |
| `lib/cors.ts` (23 rutas) | | | ✅ **sujeto a aprobación** | | ✅ |
| Neutralización PWA (build + guards) | | ✅ | ✅ | | ✅ |
| `@capacitor/app` · `browser` · `share` | | | ✅ | ✅ | ✅ (share/browser) |
| Fix de YouTube | | | ✅ | ✅ | ⚠️ hay que rehacerlo |
| `capacitor.config.ts` (`.dev`) | ✅ | | | ✅ | |
| `android/` (**se versiona, no se borra**) | ✅ | | | ✅ | |
| **`lib/compartir.ts`** | — | **NO SE TOCA** | — | — | — |

---

## 13. Riesgos

| Riesgo | Prob. | Daño | Mitigación |
|---|---|---|---|
| `pageExtensions` no excluye las rutas | media | alto | CP1 lo dice en 1 sesión |
| YouTube no se resuelve (CP10) | 🔍 alta | alto | 6 experimentos; decide el dueño |
| Hydration mismatch por el indicador nativo | **baja** | alto | bandera de build + comprobación sobre el HTML exportado (§2) |
| **Primer arranque con la PWA activa** | **baja** | **alto** | CP6 antes de Android + doble capa + recuperación |
| Suspense + export en CP2 | media | medio | primer `<Suspense>` del repo |
| La junction falla | baja | bajo | aborta con mensaje; se decide a mano |
| Ventana de Preview olvidada abierta | media | medio | cierre verificado al final de cada sesión |
| El servidor de Capacitor no resuelve como `serve` | media | medio | CP8 #16, en el teléfono |
| Sesión perdida en CP8 #14 | baja | alto | el adaptador es un mini-proyecto, se estima aparte |
| **El `POST` autenticado falla recién en CP8** (trasladado de CP4) | baja | medio | CP4 ya demostró preflight, `401` con CORS y el envoltorio de la Response final; queda una sola afirmación por verificar |

---

## 14. Decisiones que requieren aprobación

| # | Decisión | Cuándo | Estado |
|---|---|---|---|
| 1 | **Abrir Deployment Protection** — afecta **todos** los Preview del proyecto | **antes de CP4**, y **una vez por sesión** en Gate B | 🔵 **no es permanente** |
| 2 | Seguir a Gate B | CP5 | ✅ **APROBADA el 30/08/2026** — autorizado hasta **CP6 inclusive**; CP7 pide autorización nueva |
| 3 | Integrar `lib/cors.ts` a Producción | Etapa 3, **después del veredicto** | 🔵 |
| 4 | Si `app/admin` no se puede excluir y viaja en el APK | CP2 | 🔵 |
| 5 | Si CP10 termina en Media Integrity: ¿se eleva a identificador definitivo? | CP10 | 🔵 no automático |
| 6 | Si CP8 #14 falla: ¿se hace el adaptador de almacenamiento? | CP9 | 🔵 mini-proyecto aparte |
| 7 | Qué se descarta al cerrar | CP11 | 🔵 **nada se borra sin esto** |
| 8 | **Trasladar el `POST` autenticado de CP4 a CP8 #14** | 30/08/2026 | ✅ **APROBADA** — ver abajo |

**Decisión 8 — aprobada formalmente por el dueño el 30/08/2026.** Cambia
**únicamente el momento** de la prueba. **No la elimina ni la relaja:** el
`POST /api/te-va-a-gustar` con un JWT válido pasa a ser **requisito de cierre de
CP8 #14**, ejecutado desde la app Android con un usuario conectado. Motivo: no
existe cuenta descartable ni Bearer de prueba, y no corresponde usar la cuenta
personal del dueño, extraer tokens del navegador ni crear credenciales sólo para
un `curl`. **CP8 no puede cerrarse sin esa comprobación exitosa.**

**Producción no se toca en ningún checkpoint.**
