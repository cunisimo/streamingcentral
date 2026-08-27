# Traspaso: dónde está todo, hoy

**26 de agosto de 2026.** Para retomar en otra sesión sin perder nada. Reemplaza
a `docs/TRASPASO-IDIOMA.md`, que cubría sólo la línea del idioma y queda como
histórico.

---

## En tres líneas

1. **Producción (`main` → `1e14f5c`, `app.yump.ar`)** está estable: catálogo en
   es-MX, Top 10 de Netflix arreglado, ficha de Moria arreglada.
2. **`feat/avatares-propios` está en Preview esperando tu prueba manual.** Es la
   única rama viva. **No mergeada.** El contrato de persistencia se corrigió el
   27/08 para que un rollback no rompa nada — ver abajo.
3. Lo que sigue después es la **tanda legal de Google Play**, ya auditada y
   diseñada en `docs/PLAY-STORE.md`, bloqueada por decisiones tuyas.

---

## Estado de despliegue

```
origin/main               1e14f5c   ← DESPLEGADO en producción (app.yump.ar)
main (local)              321d318   ← tres commits de documentación SIN pushear
origin/feat/avatares-propios  fc1ba6d   ← en Preview, sin mergear
```

⚠️ **`main` local está TRES commits por delante de `origin/main`** y son sólo
documentación (`88ef0f6`, `f622bb8`, `321d318`: issue #13, traspaso del idioma y
la primera versión de la auditoría de Play). No se pushearon porque no hacía
falta tocar producción por documentación. **Al mergear la rama de avatares, ojo
con no arrastrarlos sin querer** — o pushealos aparte y de forma consciente.

| Pieza | Estado |
|---|---|
| Producción `app.yump.ar` | `1e14f5c`, READY |
| Preview de avatares | `dpl_Cx94gvUgHTXeEfUMgXvfwjFthDCa`, READY, commit `fc1ba6d` |
| URL del Preview | `streamingcentral-git-feat-4e07d7-jfgalindez-gmailcoms-projects.vercel.app` |
| `IDIOMA_TITULOS` | `es-MX` en Vercel Production y en Supabase Edge Functions |
| Cron `tmdb-sync-upcoming-daily` (pg_cron) | activo, jobid 2 |
| Cron `netflix-top10` (Vercel) | ⚠️ ver issue #13 |

---

## 1. La rama viva: `feat/avatares-propios`

**Qué hace:** reemplaza DiceBear por 31 avatares WebP propios servidos desde
`/avatars/`. Dieciséis commits. Documentación completa en `docs/AVATARES.md`.

**Verificado:** 541 tests, `tsc` limpio, `next build` compila, barrido de DiceBear
en cero sobre fuente, SQL, públicos, service worker y bundles.

### Con qué cuenta se prueba — CORREGIDO el 27/08

**Preview y Producción comparten la base de Supabase pero corren versiones
distintas.** Eso no cambió. Lo que cambió es la consecuencia.

⚠️ **Lo que decía acá era esto, y ya no vale:** el Preview guardaba
`avatar_style = "yump"`, Producción interpolaba ese valor en una URL de DiceBear
(`/10.x/yump/svg` → HTTP 404) y la cuenta se quedaba **sin avatar** hasta el
deploy.

**Se corrigió el contrato de persistencia**, no el texto. Ahora una elección
guarda `avatar_style = "adventurer-neutral"` — una etiqueta de compatibilidad que
el código nuevo ni siquiera lee, porque resuelve por la semilla. Verificado, una
vez y a mano:

```
/10.x/adventurer-neutral/svg?seed=pocho  → HTTP 200   ← lo que se guarda hoy
/10.x/yump/svg?seed=pocho                → HTTP 404   ← lo que se guardaba antes
```

| Qué código corre | Qué muestra un perfil con `seed = "pocho"` |
|---|---|
| El nuevo | el WebP local de Pocho |
| El viejo (rollback / Producción hoy) | otro dibujo, generado desde la semilla. **Válido, no roto** |
| El nuevo otra vez | Pocho, automáticamente. Sin migración |

🟡 **La cuenta descartable se sigue recomendando**, pero por otro motivo: guardar
desde el Preview te cambia el avatar **visible** en Producción hasta que se
despliegue. No hay nada que se rompa ni que haya que arreglar después.

### Lo que falta: tu prueba manual

La lista completa está en `docs/AVATARES.md` → "Verificación manual OBLIGATORIA
en Preview" (once puntos). Los que **ningún test automático cubre**:

- bloqueo de las 31 cards, Escape, fondo y Cancelar durante "Guardando…";
- recuperación y reintento después de un fallo de red;
- guardado, recarga, cierre y reinicio de sesión;
- `aria-busy` con lector de pantalla;
- offline y móvil.

**Por qué a mano y no automatizado**: el proyecto **no tiene arnés de DOM**, así
que `AvatarModal` no se monta en ningún test. Lo que sí está probado es la
aritmética del ciclo de foco (`lib/foco-modal.ts`). No confundir una cosa con la
otra — está escrito en el propio módulo.

### Decisiones de esta rama que no hay que volver a discutir

- **`LEGADO_V1` está congelada.** El mapeo de los perfiles viejos usa esa lista y
  no `AVATARES`, así que agregar un avatar 32 no le cambia el dibujo a nadie. Hay
  ocho semillas con su hash exacto y su id exacto clavados en el test.
- **Ninguna ruta se arma con texto de la base.** El `src` sale del catálogo
  congelado; `../`, URLs absolutas y `data:` no pueden producir una ruta.
- **No hay migración de SQL, y `supabase/schema.sql` ya no trae ninguna
  operación sobre el default de la columna de estilo.** Producción conserva su
  default `'adventurer-neutral'`, que es inerte: **la columna de estilo no se
  mira al resolver**, todo se decide por la semilla.
- **La elección se guarda con el estilo compatible, no con `yump`.** Los valores
  los arma un solo lugar (`eleccionAvatar` en `lib/avatares.ts`); ningún
  componente los escribe a mano. Es lo que hace inofensivo un rollback.
- **Retirar un avatar hoy NO se puede** — `AVATARES` alimenta el selector y el
  índice de resolución a la vez. Antes habría que separar catálogo de subconjunto
  seleccionable. Mientras tanto: **ninguno se saca de `AVATARES`, `LEGADO_V1` ni
  `public/avatars/`.**
- **Autoría en tres grupos**: nueve personajes de Pajaritos (creados por Juan
  Facundo Galíndez, adaptados en 3D), **Don Tito como mascota original de Yump**
  —no es de Pajaritos— y 21 ilustraciones más. El enlace a @pajaritos.web
  acompaña **sólo** al primer grupo.

### Después del merge

1. Verificar que Vercel despliegue el merge a Producción.
2. Recién ahí, elegir el avatar definitivo con la cuenta principal.
3. El service worker sube a **v7**, y ese bump es el mecanismo que borra el cache
   viejo con los SVG de DiceBear.

---

## 2. Lo que ya está cerrado

### Idioma (tres tandas, en producción)

Catálogo, Home y Próximamente en **es-MX** con respaldo a `es-ES`, y la
configuración adentro de las claves de cache (`HUELLA_IDIOMA`) para que un
rollback revierta de verdad. Detalle e historia en `docs/TRASPASO-IDIOMA.md`.

**Lo más transferible de esa línea**: cuando un respaldo no alcanza, la pregunta
no es "¿la fusión cambió algo?" sino **"¿qué sigue roto DESPUÉS de fusionar?"**,
y se decide por campo. Costó tres iteraciones y las dos versiones equivocadas las
encontró una corrida real, no la revisión de código.

### Top 10 de Netflix (dos arreglos, en producción)

- **La plataforma la garantiza la FUENTE, no TMDB** (`lib/top-plataformas.ts`).
  "Moria" entró #1 del top oficial pintada en gris porque TMDB no tenía
  proveedores en ninguna región. Sólo se aplica cuando no sabemos nada.
- **Segunda consulta acotada cuando el título trae subtítulo**
  (`lib/netflix-resolver.ts`). "Operation Safed Sagar: …" daba cero resultados
  completo y uno solo reducido. Exige un único resultado, mira primero el
  proveedor, y marca todo con `needs_review`.
- **La ficha usa la misma evidencia**, con la condición extra de
  `needs_review = false`, mirando **toda la ventana de 14 días** y no la última
  semana — atada a la semana más nueva, la evidencia se evaporaba con el cron
  siguiente.

---

## 3. Pendiente

### 3.a Lo inmediato

| # | Qué | Quién |
|---|---|---|
| 1 | **Probar el Preview de avatares con una cuenta descartable** | vos |
| 2 | Mergear `feat/avatares-propios` y verificar el deploy | después de 1 |
| 3 | Decidir qué hacer con los tres commits de documentación en `main` local | vos |

### 3.b El cron del Top 10 — issue #13, sigue abierto

Disparó el 25/08 a las 12:58 UTC, día correcto y dentro de su ventana. **Lo que
sigue sin explicación es por qué se salteó el martes 18/08** — hay que mirar los
logs de Vercel. Y la fragilidad de fondo no se movió: **la guarda mide antigüedad
desde la fecha de la semana, no desde la ingesta**, así que una corrida perdida
vuelve a degradar el bloque a "Lo más popular ahora".

### 3.c La tanda legal de Google Play

**Auditada y diseñada**; no se escribió una línea de código. Todo en
`docs/PLAY-STORE.md`, que distingue explícitamente ✅ confirmado, 🔵 decisión
tuya, 🔍 verificar en un panel y 🟡 recomendación conservadora.

**Bloqueantes:**

1. **Target API 36 venció el 31/08/2026** — prórroga solicitable hasta el
   01/11/2026. Y **no existe ningún artefacto Android**: sin `assetlinks.json`,
   sin `twa-manifest.json`, sin Bubblewrap.
2. **La app no atribuye a TMDB en ningún lado**, y ya está publicada.
3. **Los wordmarks de plataforma son imitaciones a mano** — el rojo Netflix, el
   swoosh de Prime dibujado en SVG.
4. **Faltan `/privacidad`, `/terminos`, `/acerca-de` y `/eliminar-cuenta`.**
5. **`OnboardingGate` secuestraría esas cuatro rutas**: está en el layout, sólo
   exime `/cuenta/reset` y patea a `/onboarding` a quien tenga sesión sin
   completar. Es justo la persona que quiere borrar su cuenta.

**Las decisiones que bloquean la primera tanda:** nombre del responsable, email
de soporte y de privacidad, jurisdicción, si habrá monetización, edad mínima,
tipo de cuenta de Play, dominio definitivo, y si se aprueban los nombres neutros
de plataforma.

**Los commits 1 y 2 de esa tanda no dependen de ninguna decisión** —atribución de
TMDB y exención del gate— y cierran cosas que ya están mal en producción.

### 3.d Otros issues

`docs/ISSUES.md` tiene 13. Los que importan para lo que viene: **#7**
(`upcoming_content` no se refresca, y es también el problema de retención de
TMDB), **#4** (fechas en UTC), **#9** y **#12** (pisos de votos que excluyen cine
regional).

### 3.e Ramas viejas sin mergear

`feat/ejes-rieles-genero` y `feat/dia-rotacion`, las dos **muy** atrás de `main`.
Hay que rebasarlas antes de tocarlas.

---

## 4. Cosas que cuestan tiempo si no se saben

**Un `exit 0` vacío se lee igual que uno limpio.** El barrido de DiceBear tuvo
una guarda de CLI que nunca disparaba: el comando salía con 0 **sin ejecutar
nada**, y lo reporté como evidencia de estar limpio. Lo mismo pasó con la API de
Vercel devolviendo listas vacías cuando el token dejó de estar autorizado, y con
un `exit=0` que parecía "Vercel no tomó el push" cuando el deployment estaba
hecho. **Antes de concluir que algo no pasó, descartar que la herramienta esté
ciega.**

**Perseguir variantes de sintaxis es una carrera perdida.** El guard del SQL pasó
por regex → parser con troceo → **guard textual con allowlist**, y las dos
primeras tuvieron falsos negativos demostrados. Para proteger una línea no hace
falta el lexer de PostgreSQL.

**`next dev` pisa `.next`.** Levantar el dev después de un build deja
`next start` sin build de producción. Matar el dev antes.

**El panel de navegador de este entorno no compone frames ni registra service
workers**, así que no hay capturas ni prueba de SW por ahí. La geometría del DOM
sirve como evidencia de layout; el SW se prueba cargando su código real en un
contexto de `vm`.

**Los cuatro elementos sin registrar** — `avatares/`, `prompts/noticias-*.md` y
`supabase/migrations/004_news.sql` — no pertenecen a ninguna rama de trabajo.
**Nunca `git add -A`**: commits con rutas explícitas.

---

## 5. Dónde está cada cosa

```
docs/AVATARES.md          el sistema de avatares, la prueba manual y el riesgo transitorio
docs/PLAY-STORE.md        la auditoría legal completa de Google Play
docs/ISSUES.md            13 issues, #13 es el cron del Top 10
docs/ESTADO.md            estado de despliegue e histórico de las tandas de idioma
docs/TRASPASO-IDIOMA.md   la línea del idioma, cerrada
docs/MANTENIMIENTO.md     recetas: Preview/Redis, precalentado, ingesta manual del Top 10
docs/PWA.md               service worker y estrategias de cache
docs/UPCOMING.md          el sync de Próximamente
CLAUDE.md                 las decisiones de arquitectura que se cargan solas
```
