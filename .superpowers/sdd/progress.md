# Progreso — Onboarding inicial (subagent-driven)

Rama: feat/onboarding
Plan: docs/superpowers/plans/2026-08-02-onboarding.md
Base pre-Task-1: 1957cd5

Verificación del proyecto: no hay test runner. Cada task Node se valida con
`npx tsc --noEmit` + chequeo funcional/visual. Los reviewers NO deben marcar
"faltan tests" como defecto (proyecto sin framework de tests por diseño). El
código Deno (supabase/functions) está excluido del tsc; se valida al desplegar.

Constraints: sin CSS-in-JS (todo en globals.css), sin deps npm nuevas, reusar
AvatarPicker + AuthContext, UI español rioplatense, no cambiar identidad visual.
syncProviders es paso manual del dueño (redeploy Edge Function + correr job).

Decisiones: puente a fase 1 (selección sincroniza sc:platforms para los 9
códigos mapeables); plataformas desde tabla providers filtrada; catálogo sigue AR.

- [x] Task 1: DB (columnas profiles) + job syncProviders — commit 8594b31 (base 1957cd5), tsc 0 errores, review limpio
- [x] Task 2: ruta /api/providers — commit 9a4b001 (base 8594b31), tsc 0 + curl OK, review limpio
- [x] Task 3: AuthContext + PlatformsContext (set) — commit f5b8667 (base 9a4b001), tsc 0 errores, review limpio
- [x] Task 4: hook useOnboarding — commit 8db6a0e (base f5b8667), tsc 0 errores, review aprobado
  - Minor (review final): togglePlatform hace side effects (updatePlatforms/bridge) dentro del updater de setSelected → en StrictMode dev se llama 2× (idempotente, sin bug; ya es el patrón de PlatformsContext.toggle). Eventual refactor a useEffect si molesta.
- [x] Task 5: UI (bloques + View + CSS) — commit b4b2c50 (base 8db6a0e), tsc 0 errores, review aprobado
  - Minor (review final): el botón "Comenzar" en OnboardingView.tsx:24 no tiene type="button" (inofensivo hoy, sin form; fix trivial de consistencia).
- [x] Task 6: integración (gate + ruta + layout) — commit 6b246a8 (base b4b2c50), tsc 0 errores, /onboarding renderiza, review limpio (sin loop de redirección)

TODAS LAS TASKS COMPLETAS.

## Review final del branch (opus) — Con arreglos: 0 Critical, 2 Important (arreglados)
- Núcleo sólido: migración/backfill idempotente + trigger (nuevos=false), dispatcher ya wireado,
  región AR garantizada, gate sin loop, invariante "nunca vacío", AvatarPicker reusado.
- Important #1 (puente incoherente al deseleccionar) y #2 (callejón silencioso si falla Comenzar)
  → ARREGLADOS en commit posterior. tsc 0 errores.
- Minor diferidos: resume no re-sincroniza sc:platforms (cross-device); logo w92 object-fit cover;
  fallback onboarding_completed:true sin fila de perfil (bajo riesgo, intencional).

Branch listo para validación del dueño. NO mergeado (pedido explícito: esperar validación).
Pendiente del dueño: (1) aplicar sección nueva de schema.sql; (2) deploy Edge Function + correr
syncProviders (completa providers con MUBI); (3) probar el flujo con un usuario logueado
onboarding_completed=false (gating/persistencia/resume no se pudo probar sin login).

---

# Feature: toggle Películas/Series por riel (feat/shelf-type-toggle)
Base del branch: 23cd85c. Plan: docs/superpowers/plans/2026-08-03-shelf-type-toggle.md

- [x] Task 1: hook useShelfType — commit enmendado (base 23cd85c), tsc 0 errores, review OK (trailer agregado tras review)
- [x] Task 2: ShelfTypeToggle + CSS — commit 7d2e2ea (base 06ac391), tsc 0 errores, review aprobado limpio
- [x] Task 3: Shelf con toggle (refetch/filter) + empty-state — commit 1f7e156 (base 7d2e2ea), tsc 0 errores, review aprobado (mecanismo trazado contra useApi)
- [x] Task 4: cablear 8 rieles en CatalogView — commit e102958 (base 1f7e156), tsc 0 errores, review aprobado (shelfKeys únicos, alternancia intacta)

## Review final del branch (opus) — Ready to merge: YES. 0 Critical, 0 Important.
- Refetch (género), filter (votos sin refetch), empty-state que no desmonta, persistencia hidratación-safe con keys únicas, backward-compat: todo correcto. tsc limpio.
- Minor (diferidos, no bloquean):
  1. "Ver todas" de votos ignora el toggle (linkea a lista mixta) — intencional, no hay página por-tipo de las listas curadas.
  2. Prop `showType` de Shelf quedó muerta (ningún caller la pasa tras migrar los rieles de género). Limpieza futura.
  3. Sin plataformas seleccionadas, los 8 rieles con toggle muestran "No hay…" en vez de colapsar (consecuencia directa —y buscada— del fix de empty-state).
  4. Rieles de exactamente 1 ítem muestran "No hay…" por el umbral <2 (convención ≥2 del app, consistente).

---

# Feature: recomendador "¿Qué te inspira hoy?" (feat/recomendador-inspira)
Base del branch: $(git rev-parse --short HEAD). Plan: docs/superpowers/plans/2026-08-03-recomendador-inspira.md

Base real: 86f37af
- [x] Task 1: 10 categorías nuevas — commit f8dc8d2 (base 86f37af), tsc 0 errores, review aprobado.
  - Minor (por diseño/limitación TMDB): reales=género 99 (== documental, biopics excluidos por AND género+keyword); fantasia tv=10765 (== scifi tv, género combinado Sci-Fi&Fantasy de TMDB; en movie difieren 14 vs 878).
- [x] Task 2: IndecisoHero reescrito + CSS — commit 5f9e4bf (base f8dc8d2), tsc 0 errores, review aprobado limpio (+ sacó @media huérfano del buscador).

## Review final del branch (sonnet) — Ready to merge: WITH FIXES → ARREGLADO
- Important: CATEGORIES es compartido (CategoryView cross-shelves + genreCovers lo iteran). Las 10 nuevas
  filtraban rieles ruidosos a las páginas /categoria/* y pósters extra. Contradecía el spec (recommender-only).
  → FIX commit 585bf72: 10 nuevas movidas a RECOMMENDER_CATEGORIES; BY_SLUG une ambos arrays.
  Verificado live: recomendador resuelve los slugs (6 items c/u), /categoria/terror sin crosses nuevos,
  /categoria/navidad → 404. tsc 0 errores.
TODAS LAS TASKS COMPLETAS + fix final.

---

# Feature: nav + buscador unificado (feat/nav-buscador-unificado)
Base del branch: 19026b8. Plan: docs/superpowers/plans/2026-08-03-nav-buscador-unificado.md
- [x] Task 1: BottomNav (Inicio/Buscador/Mi lista/Mi cuenta) — commit 5404ad5 (base 19026b8), tsc 0, review aprobado limpio.
- [x] Task 2: TopBar banderita AR — commit 439b89a (base 5404ad5), tsc 0, auto-verificado (diff trivial 2 líneas).
- [x] Task 3: genreCovers dedupe + cache v2 — commit e8080fd (base 439b89a), tsc 0, review aprobado limpio.
- [x] Task 4: SearchView unificado — commit 51052f9 (base e8080fd), tsc 0, review aprobado limpio (12 slugs resuelven, sin dead code).
- [x] Task 5: eliminar /peliculas /series + CatalogView solo Home + borrar FilterGrid/CountryGrid — commit 4d5f404 (base 51052f9), tsc 0, review aprobado (barrió .temp/.mcp por git add -A → .temp limpiado aparte).

---

# Feature: clasificación de audiencia (feat/audience-classifier)
Base del branch: 82a0bed. Plan: docs/superpowers/plans/2026-08-04-audience-classifier.md
- [x] Task 1: lib/audience.ts + without_genres en discover — commit 83d7643 (base 82a0bed), tsc 0, review aprobado limpio.
- [x] Task 2: exclusión family en listByCategory — commit 3b3dd7d (base 83d7643), tsc 0, curls OK (comedia sin kids, animacion exenta), review aprobado.
- [x] Task 3: audienceTitles + /api/audience — commit b3996fc (base 3b3dd7d), tsc 0, endpoints OK (family 38, adult-anime 37), review aprobado.
- [x] Task 4: Home +2 carruseles audiencia, -Directores — commit 665cf8d (base b3996fc), tsc 0, pendiente verif visual.

## Review final (sonnet) — Ready to merge: YES. 0 Critical, 0 Important.
- Single-source confirmado (toda la lógica en lib/audience). Exclusión en 1 punto (listByCategory) cubre todo el browsing; sin-género no afectado. Carruseles reusan Shelf. Directores sin referencias colgadas.
- Minor: PersonRail.tsx dead → BORRADO (commit posterior). tsc 0.
TODAS LAS TASKS + fix. Verificado visual (Home orden intacto, +2 carruseles, -Directores).

---

# Feature: Home Composer — dedup entre carruseles (feat/home-composer)
Base del branch: e3423e1. Plan: docs/superpowers/plans/2026-08-06-home-composer.md

Proyecto SIN framework de tests (por diseño). Verificación = `npx tsc --noEmit`
+ scripts Node contra la API local. Los reviewers NO deben marcar "faltan tests"
como defecto.

Constraints: dedup SOLO en el Home; no tocar audiencia, /categoria, buscador,
fichas ni APIs existentes; Próximamente y Desempatá fuera del algoritmo; hero
reserva solo su estado base; clave type:id nunca por nombre; toggle reconstruye
todo el Home.

- [x] Task 1: categoryCandidates + enrichRaw en enrich.ts — commit 5498930 (base c969408), tsc 0, review limpio (0 Critical/Important).
- [x] Task 2: lib/home.ts (HomeComposer) — commits 5a8aa2c + fix ea77cb4 (base 5498930), tsc 0, re-review PASA.
  - Review 1 halló 2 Important (defectos del plan, no del implementador), ambos arreglados:
    (1) fallback de genreRail re-pedía páginas 1..3 → categoryCandidates ganó `startPage`, ahora pide solo la extra;
    (2) "Últimos lanzamientos" sin relleno → helper fillByPage (tope 2 vueltas).
  - Decisión: votos (mas-votados/hacete-cargo) NO se rellenan; su tope lo pone la cantidad de votos en la DB.
  - Minor diferido: fillByPage no distingue "corto por dedup" de "fuente agotada" (1 request de más como mucho).
- [x] Task 3: /api/home + scripts/verify-home.mjs — commits 1c30e33 + fix dded2fb (base ea77cb4), tsc 0.
  - Review halló 1 Important (falso OK si rails vacío → aserción de 11 rieles + hero) y 1 Minor grave:
    los códigos de plataforma usados en TODA la verificación previa (st,pv,ap) NO EXISTEN.
    Reales (lib/providers-ar.ts): n,d,m,p,pp,at,mb,cr,sp,vx. El script ahora usa los 10 y avisa si hay inválidos.
  - Verificado por el controlador con las 10 plataformas: 200 únicos, 0 duplicados, 6 géneros × 20.
  - PENDIENTE (resolver en Task 6): "Para toda la familia" y "Animación para adultos" pasaron de 40 a 20
    tarjetas por el corte a VISIBLE_CARDS. Roza la regla "nunca reducir la cantidad de tarjetas visibles".
- [x] Task 4: Shelf modo controlado — commit 82811a5 (base dded2fb), tsc 0, /categoria/* 200.
- [x] Task 5: CatalogView + useHomeTypes + IndecisoHero — commit 1af1fd3 (base 82811a5).
- [x] Fix wave 4-5 (opus review) — commit 1028b90. 2 Critical + 5 Important + 4 Minor + ajuste de producto.
  - C1 CRITICAL: hooks/useHomeTypes importaba VALORES de lib/home.ts → arrastraba lib/cache.ts (Redis.fromEnv)
    al bundle CLIENTE. 70 KB de Upstash en la Home. Fix: HOME_GENRES/defaultTypeFor viven en components/data.ts
    (client-safe, absorbió SHELVES). / pasó de 190 kB a 174 kB First Load JS. Lo cazó `next build`, NO tsc.
  - C2 CRITICAL: 500 de /api/home dejaba el Home en blanco (useApi no miraba res.ok). Fix: campo `error`
    separado de `offline` + retry.
  - I1 el Home hacía 2 fetches (hero disparaba /api/recomendaciones antes del payload) → heroPendiente.
  - I2 rieles de votos (typeToggle=filter) refetcheaban todo el Home al pedo → onTypeChange solo en "refetch".
  - I3/I4 feedback durante refetch + no borrar el Home ante fallo de red. I5 una sola fuente de verdad del toggle.
  - Producto: family/anime volvieron de 20 a ~40 tarjetas (AUDIENCE_CARDS=40).
- [x] Fix regresiones de useApi — commit 8d9b7bf. El fix wave había roto 2 casos en el hook COMPARTIDO:
  (1) data no se limpiaba al cambiar de recurso → la ficha de la peli A se mostraba en la URL de la B
      (y en PersonView/IndecisoHero). Fix: `keepPrevious` opt-in, solo CatalogView lo usa.
  (2) 200 con body no-JSON (captive portal) → skeleton eterno. Fix: body no parseable = error.
  Verificado: /, /categoria/accion, /titulo/movie/550, /persona/287 → 200. build OK, / en 174 kB.
- [x] Task 6: verificación final + CLAUDE.md — commit 8fab2ff. 13 rutas 200, sin animación en géneros,
      duplicados 0, tsc 0, next build OK con / en 174 kB.
TODAS LAS TASKS COMPLETAS. Pendiente: review final del branch.
- [x] Review final del branch — fixes C1/C2/I1/I3/I4/M1/M2/M4/M6. Reporte completo en
      `.superpowers/sdd/final-fixes-report.md`.
  - C1 maxDuration=60 en /api/home (el default de Vercel son 10 s y con cache fría se medían ~10.1 s → 504).
  - C2 tolerancia a fallos en 2 capas: settleAll() por título en enrich.ts (un 429 en el título 200 de 316
    ya no rechaza el Promise.all) + safe() por riel en home.ts (riel caído = [], el Home sobrevive).
    Todo logueado en server. Probado con inyección de 429 al 5%: antes 3/3 requests en 500, después 3/3 en 200
    con los 11 rieles llenos.
  - I1 fetch de fuentes en paralelo, take() secuencial en orden de prioridad. Salida IDÉNTICA (diff de firma
    canónica limpio con 3 y 10 plataformas). Warm: 3 plat. 5.76→2.05 s, 10 plat. 5.91→2.51 s. Fría: 12.6→5.2 s.
  - I3 CORRIGE la decisión registrada en Task 2: era FALSO que los votos no se pudieran rellenar. votedCards
    pide 60 filas y corta a 20 ANTES de que el composer vea nada. Ahora mostVoted/mostPanned toman `limit`
    (default 20, /api/mas-votados y /api/hacete-cargo sin cambios) y el composer pide el conjunto amplio.
    Los carruseles de audiencia sí están topeados de verdad (audienceTitles no pagina): anotado en el código.
  - I4 resuelve el Minor diferido en Task 2 y su equivalente en genreRail: los candidatos no usados se
    arrastran entre vueltas y se consumen antes de comprar una página nueva.
  - M1 0 plataformas ya no dice "No pudimos cargar el inicio" (payload trae `sinPlataformas`).
  - M2 `import "server-only"` en lib/home.ts y lib/enrich.ts: convierte en error de BUILD la regresión de los
    70 KB de Upstash que cazó C1 del fix wave 4-5 y que tsc no ve. Guard verificado (build falla al importar
    un valor desde un "use client"). / sigue en 174 kB.
  - M4 prop muerta showType fuera de Shelf.tsx (onOffline NO, la usa CategoryView).
  - M6 CLAUDE.md al día: sin peliculas//series//FilterGrid/CountryGrid/PersonRail/riel Directores;
    + /api/audience, /api/upcoming, /api/providers en la tabla de rutas.
