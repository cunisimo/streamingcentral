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
