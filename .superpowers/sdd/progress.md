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

## Review final del branch (opus, con mediciones reales) — 2 rondas de fixes
Ronda 1 (commit 1f27f34, perf): el dedup cumplía el spec pero el Home había pasado de ~0.65s al primer
contenido (11 requests paralelos) a 6-10s (1 request con ~11 etapas secuenciales).
- C1: /api/home podía pasar el timeout de Vercel (10.1s medidos en cache fría, default 10s) → maxDuration=60.
- C2: sin try/catch; ~316 llamadas TMDB por request, un 429 tumbaba TODO el Home → safe()/settleAll por riel.
- I1: las fuentes no leen `used`, solo el take() → paralelizadas. 6.04s → 2.93s (10 plat), salida byte-equivalente
  (verificado con firma canónica: mismo orden de rieles, mismos títulos, 0 duplicados).
- I3: "nunca reducir tarjetas" NO se cumplía en votos. La justificación registrada antes era INCORRECTA:
  votedCards pide 60 filas y corta a 20 ANTES de que el composer vea nada → limit con default 20.
- I4: genreRail tiraba candidatos ya pagados y compraba una página extra → arrastra el pool entre vueltas.

Ronda 2 (commit 14de36d): el fix de la ronda 1 introdujo 2 Important propios.
- H1: con safe() en todo, composeHome ya no podía rechazar → el catch de la ruta y el estado `error` quedaron
  MUERTOS. Una caída total de TMDB se pintaba como "Nada en tus plataformas" (mentira) sin reintento.
  → HomePayload expone `degradado`/`fallos`; CatalogView distingue 3 casos (sin plataformas / ok / degradado).
  Probado con TMDB forzado a fallar: 200 con degradado:true fallos:16 y el aviso + Reintentar en el DOM.
- H2: la paralelización triplicó el pico de concurrencia (~350-400 requests simultáneos a TMDB, throttle ~50/s;
  y otras tantas a Upstash en prod) → semáforo global en tmdb() con techo 24, liberando en finally.
  Probado con 200 fallos forzados + timeouts reales: nada se cuelga, el request siguiente pasa completo.
  Techo 24 no se paga en caliente (2.42-2.52s); cuesta ~0.8s en cache fría.
- H3 tope de vueltas en genreRail (4). H4 safe() loguea stack completo y re-lanza fuera de producción.

VERIFICADO POR EL CONTROLADOR: 230 únicos / 0 duplicados; /api/home 2.45-2.62s con 10 plataformas;
/, /categoria/accion, /buscar, /titulo/movie/550, /persona/287, /api/mas-votados, /api/hacete-cargo,
/api/discover → 200. tsc 0. next build OK, / en 174 kB (venía de 190 kB antes del fix del bundle).

Minor diferidos (no bloquean): "Ver todas" de votos puede mostrar menos que el riel si crece el volumen de
votos; take() descarta enriquecidos sobrantes del margen 40%; CLAUDE.md dice lista/[slug] (real: lista/[key])
y no lista UltimosView/DirectoresView.
PENDIENTE DE DECISIÓN DEL DUEÑO: los chips y "Mostrame otras" del hero NO deduplican (van a
/api/recomendaciones), así que ahí sí puede haber repetidos con los rieles de abajo.

---

# Feature: Top Yump — top 10 por plataforma (feat/top-yump)
Base del branch: bef5ec8. Plan: docs/superpowers/plans/2026-08-09-top-yump.md
Spec: docs/superpowers/specs/2026-08-09-top-yump-design.md

Proyecto SIN framework de tests (por diseño). Verificación = `npx tsc --noEmit`
+ `npx next build` + curls/SQL manuales con salida esperada en cada task.

Constraints: UI en español rioplatense; sin CSS-in-JS (todo en globals.css);
rutas API finas sobre lib/; región AR + flatrate; NO agregar limitador de
concurrencia (ya está en lib/tmdb.ts, MAX_EN_VUELO=24); en el Top no corren
los filtros de lib/audience.ts ni el dedup del Home; toggle global (uno solo);
copy exacto: Netflix "Lo más visto esta semana · dato oficial", resto "Lo más
popular ahora"; nav dice "Top", la página dice "Top Yump".

Pasos manuales del dueño: aplicar la tabla en Supabase (Task 2) y definir
CRON_SECRET en Vercel (Task 4).

- [x] Task 1: sacar Apple TV id 2 + Star+ — commit b011c4c (base bef5ec8), tsc 0, review limpio (0 hallazgos).
- [x] Task 2: tabla netflix_top10 en schema.sql — commit d62624d (base b011c4c), review limpio. Migración APLICADA en Supabase por el controlador vía MCP (apply_migration), 0 filas.
- [x] Task 3: lib/netflix-top10.ts + searchTitles — commits 2c234f6 + 5fae8b7 + b2cf85a (base d62624d), tsc 0, re-review APROBADO.
  - El implementador cazó que supabaseServer() usa la anon key y el upsert moría contra RLS → nuevo supabaseAdmin() (service role) para escritura; la lectura sigue anon. Requiere SUPABASE_SERVICE_ROLE_KEY en el entorno de Next (paso manual del dueño, no existía).
  - Review halló 1 Critical + 2 Important + 2 Minor, TODOS arreglados en b2cf85a:
    C1 las selects no chequeaban `error` → un fallo de query reescribía las 20 filas y PISABA correcciones manuales de tmdb_id.
    I1 una fila con tmdb_id null nunca se reintentaba (raw_title sin cambios) → ahora cuenta como pendiente.
    I2 sin guard contra inversión del orden del TSV → throw si la semana parseada tiene más de 30 días.
    M1 resolución secuencial (riesgo de timeout en el cron) → Promise.all, sin limitador propio (ya está el semáforo de tmdb.ts).
    M2 documentada la decisión del fallback needs_review.
- [x] Task 4: cron + vercel.json + CRON_SECRET — commit 618fe2b (base b2cf85a), tsc 0, review aprobado (0 Critical/Important).
  - Verificado: 401 sin header, 401 con secreto incorrecto, y 500 con el secreto correcto cuyo error nombra SUPABASE_SERVICE_ROLE_KEY (prueba que la auth pasa y llega a la ingesta).
  - BLOQUEADO PARA EL DUEÑO: la ingesta real no se pudo correr porque SUPABASE_SERVICE_ROLE_KEY no está en el entorno de Next. Falta cargarla en .env.local y en Vercel.
  - Minor diferidos: (1) la comparación del secreto no es constant-time (riesgo teórico, secreto de 256 bits); (2) confirmar el plan de Vercel al activar el cron (Hobby permite semanal, no es bloqueante).
  - Tabla SEMBRADA POR EL CONTROLADOR vía MCP con la semana real 2026-08-02 (20 filas, 20 resueltas, "Fear" con needs_review=true) para poder verificar las tareas 5 y 7 con datos de verdad. Cuando el dueño cargue la clave, el cron debe dar inserted:0 sobre esta misma semana.
- [x] Task 5: lib/top.ts + /api/top — commits 6572a83 + a73adad (base 618fe2b), tsc 0, re-review APROBADO.
  - Review halló 1 Important: Promise.all sin aislar → una plataforma caída devolvía 500 y se perdían TODOS los bloques, incluido Netflix. Arreglado con el mismo patrón safe() de lib/home.ts.
  - Verificado: 6 bloques con providers=n,d,m (Netflix source:netflix), providers vacío, tipo=tv, fallback de Netflix a popularidad (forzado sin borrar datos) y degradación con una plataforma caída (200 con 5 bloques).
  - PENDIENTE PARA TASK 7 (Minor del re-review): /api/top no expone degradado/fallos, así que el cliente no puede distinguir "esa plataforma no tiene top" de "TMDB falló". /api/home ya resolvió esto mismo. Se resuelve en la Task 7.
- [x] Task 6: prop rank en TitleCard + .rank-num — commits 44b6cb4 + 973437a (base a73adad), tsc 0.
  - Review halló 1 regresión real (heredada del plan): rank-shift se aplicaba SIEMPRE que no había póster, corriendo el título 38px en TODA la app (Home, categorías, relacionados, listas) aunque nadie pasara rank. Arreglado: la clase ahora es condicional. Fix de una línea verificado directo por el controlador (diff + tsc), sin re-review.
- [x] Task 7: TopView + /top + 5to ítem del nav + degradado/fallos — commits 2586bd3 + 47da746 (base 973437a), tsc 0, next build OK (/top 1.73 kB, 167 kB First Load).
  - Desviación correcta del implementador: app/top/page.tsx usa el wrapper TopBar/BottomNav como directores y proximamente, porque layout.tsx no renderiza el nav globalmente. El snippet del plan dejaba /top sin nav.
  - Review halló 1 Critical + 1 Important + 2 Minor, todos arreglados en 47da746:
    C1 TopView ignoraba `error` de useApi → con un 500 la pantalla quedaba EN BLANCO, sin aviso ni reintento (y safe() re-lanza en dev, así que pasaba seguido). Ahora sigue el patrón de CatalogView.
    I1 .top-toggle era sticky top:0 igual que .topbar (z-index 30 vs 20): el único control de la página quedaba tapado al scrollear. Se le sacó el sticky (el alto del TopBar no es constante, no hay offset confiable).
    M1 regla muerta .rank-slot{flex}. M2 aria-controls en el botón ⓘ.
  - VERIFICADO POR EL CONTROLADOR en el navegador: 6 bloques con la agrupación correcta, copys exactos, ranking 1-10 con los 3 primeros en coral, Netflix con source netflix desde la tabla; a 320px los 5 ítems del nav miden 75px sin cortarse y no hay scroll horizontal; .top-toggle quedó static; /api/top 6/6 y 8/8 en 200 bajo ráfaga concurrente con caché fría.
- [x] Task 8: CLAUDE.md — commits 8bc8457 + ajuste del controlador (maxDuration ya no es exclusivo de /api/home, toggle global, supabaseAdmin/SUPABASE_SERVICE_ROLE_KEY, alineación del bloque de estructura).

## Review final del branch (opus) — Listo para mergear: SÍ CON ARREGLOS → ARREGLADO
0 Critical, 4 Important, todos arreglados en 1b34b36 + 18be0fb.
- I1 datos viejos anunciados como "de esta semana": latestWeekRows devolvía max(week) sin importar la antigüedad
  y netflixBlock solo caía a popularidad con la tabla VACÍA. Si el cron se rompía en silencio, el bloque seguía
  afirmando "dato oficial de esta semana" con datos de meses atrás. → guard de 14 días, cae a popularidad.
- I2 cached() guarda [] como hit válido 24h: un hipo de TMDB hacía desaparecer una plataforma entera por un día,
  con degradado=false (ni bloque ni aviso). → el fetcher tira si viene vacío.
- I3 resolveTitle tenía una QUINTA regla que el spec no pide (candidatos sin título exacto y sin Netflix AR →
  primer candidato). Podía mostrar un título equivocado bajo el sello "dato oficial". → alineado al spec: null.
- I4 el piso vote_count.gte=60 era un default heredado de discover, no una decisión. → minVotes explícito.
- Minors arreglados: comentario de TOP_PLATFORMS, supabaseAdmin movido a lib/supabase-admin.ts con
  import "server-only" (antes vivía en un módulo que llega al bundle del navegador), comentario obsoleto en
  /api/providers, y CLAUDE.md (app/top/, TopView.tsx, keepPrevious, maxDuration, ubicación de supabaseAdmin).
- Confirmado por el reviewer: la service role key NO se filtra al bundle (Next solo inlinea NEXT_PUBLIC_*);
  el cron falla cerrado sin CRON_SECRET; RLS solo con policy de select; Star+ nunca estuvo en la tabla providers;
  el TSV real de hoy calza con parseArWeek (header exacto, AR primero, 20 filas, LF).
- Minors NO arreglados (deliberado): "sp" sigue en PlatformCode para no romper el localStorage de quien haya
  elegido Star+ antes de esta rama; el 500 de /api/top devuelve String(e) (consistente con /api/providers);
  la caché tibia de pv:/card: puede tapar el fix de Apple TV+ unas horas post-deploy.

VERIFICADO POR EL CONTROLADOR al cierre: tsc 0 errores; next build compila, / sigue en 174 kB (sin regresión de
bundle) y /top en 1.73 kB; /api/top con tipo=movie y tipo=tv devuelve los 6 bloques con 10 slots llenos cada uno,
Netflix con source:netflix desde la tabla, degradado=false.

PENDIENTE DEL DUEÑO (bloquea la ingesta real, no la sección):
1. Cargar SUPABASE_SERVICE_ROLE_KEY en .env.local y en Vercel. Sin eso el cron no escribe (la sección funciona
   igual: Netflix cae a popularidad).
2. Cargar CRON_SECRET en Vercel.
3. Prueba de humo del cron: la tabla está sembrada a mano, así que la primera corrida va a dar inserted:0 SIN
   ejercitar fetch/parse/resolve/upsert. Para probarlo de verdad: borrar una fila
   (delete from netflix_top10 where week='2026-08-02' and category='movie' and rank=10) y recién ahí correr el
   cron. Ese es el único camino del código que no tiene evidencia de ejecución.

ESTADO AL CIERRE: rama feat/top-yump NO mergeada. El dueño la revisa antes de produccion.
16 commits sobre bef5ec8, HEAD 18be0fb. Arbol limpio salvo los sin-trackear preexistentes.

---

# Feature: ruleta "no sé qué ver" (feat/ruleta)
Base del branch: ec3eead (plan) sobre a33754e (spec del dueño).
Plan: docs/superpowers/plans/2026-08-09-ruleta.md
Spec: docs/superpowers/specs/2026-08-09-ruleta-design.md (lo escribió el dueño)

ALCANCE — el riesgo principal. NO se tocan: los 16 chips, lib/categories.ts,
chip_titles, chip_blocklist, scripts/, prompts/. title_availability es SOLO
LECTURA. roulette_titles y get_roulette_picks ya existen y no se modifican.
Ninguna tarea escribe en la base.

Constraints: UI en español rioplatense; sin CSS-in-JS; rutas API finas; una sola
recomendación por vez (nunca una lista); una query por tanda de 20, "Otra"
consume del cliente; `atencion` NUNCA crudo (banco de frases en código);
advertencia NULL => sin bloque PERO; para mostrar se usa TMDB, no el title
snapshot; no agregar limitador de concurrencia (ya está en lib/tmdb.ts).

Proyecto SIN framework de tests. Verificación = tsc + next build + curls/SQL.

- [x] T1: lib/roulette-providers.ts — commits 7f3e25f + 3e0c454 (base 15a300e), tsc 0, review PASS sin Critical/Important.
  - El implementador cazó que yo había contado mal: son 39 nombres distintos en title_availability (19 mapeados + 20 excluidos), no 40. Corregido en el código y en el plan.
  - Reviewer verificó contra la base de forma independiente: los 39 calzan carácter por carácter y cantidad por cantidad; los 19 mapeados alcanzan 696 de los 765 con texto (coincide con el comentario).
  - MovistarTV 148 títulos sin tope, "VIX " (con espacio) 2. Ninguno en 0.
  - OnDemandKorea devuelve 0 en los 4 escenarios: su único título (tmdb_id 455714) tiene razon NULL. Es legítimo, no un typo del mapa.
  - Minor no accionado: el guard corre en cualquier NODE_ENV != production, no solo en dev; el comentario dice "en desarrollo".
- [x] T2: components/ruleta/frases.ts — commit 1b812fa (base 3e0c454), tsc 0. Auto-verificado por el controlador (diff completo de 16 líneas, función pura idéntica al plan); no se despachó reviewer.
- [x] T3: lib/roulette.ts + /api/ruleta + watchLinkFor — commits 5870754 + 815a7dc (base 1b812fa), tsc 0.
  - Review halló 2 Important + 1 Minor + 1 observación, todos arreglados en 815a7dc (fix verificado leyendo el diff):
    I1 el mapa de enriquecidos se indexaba solo por id: los ids de TMDB son namespaces separados por media_type, así que movie:550 y tv:550 en la misma tanda se pisaban y una pick mostraba título/póster ajenos. Ahora la clave es `type:id`.
    I2 Promise.all sobre watchLinkFor tumbaba las 20 picks si una sola fallaba (hiccup de Redis o TTL vencido). El link ahora es opcional: se loguea y la pick sobrevive.
    M1 `excluir` sin dedup ni tope → Set + slice(0, 500).
    OBS runtime SIEMPRE venía null: cardsByIds usa titleCard, que hardcodea runtime:null (solo el shape de detalle lo calcula). El spec pide la duración en la tarjeta. Ahora sale de la RPC (minutos, no cambian por locale) con el mismo formato que la ficha. Pasó de 0/20 a 20/20.
  - Verificado: los 4 escenarios con 20/20 picks, 20/20 runtime, 20/20 watchLink; providers vacío devuelve []; excluir funciona.
  - Minor no accionado: el formato de runtime da "0h 45m" en títulos de menos de una hora. Es idéntico al de la ficha (enrich.ts:550), así que se deja por consistencia.
- [x] T4: hooks/useRouletteSeen.ts — commit 8800052 (base 815a7dc), tsc 0. Auto-verificado (55 líneas idénticas al plan, import type de Escenario para no arrastrar el módulo server-only, tope 300 por escenario); no se despachó reviewer.
- [x] T5: components/ruleta/RuletaCard.tsx + CSS — commit 9d4e14a (base 8800052), tsc 0. Se revisa junto con T6, que es la primera tarea que la renderiza.
- [x] T5 + T6: RuletaCard, RuletaBanner y montaje en el Home — commits 9d4e14a + 6de1a4e + ba97c6b (base 8800052), tsc 0, next build OK. Review conjunto (T5 no era observable sin T6): 0 Critical, 0 Important.
  - Verificado por el implementador y confirmado por el reviewer: 20 toques de "Otra" con UN solo request; el request 2 recién sale con la cola vacía, llevando los 20 ids en excluir. CatalogView tocado en exactamente 2 líneas.
  - 2 Minor arreglados en ba97c6b: (1) la cola no se descartaba al cambiar de plataformas con el panel abierto, así que "Otra" seguía sirviendo picks de una plataforma recién sacada; (2) los estados vacío/error sin role="status".
  - PENDIENTE DE DECISIÓN DEL DUEÑO (hallazgo visual del controlador, no de código): los banners de Ruleta y Desempatá quedan a 26 px, con el MISMO degradado y preguntas casi sinónimas ("¿No sabés qué ver?" / "¿No te decidís?"). Reusar .dsmp-banner lo pidió el dueño; la duplicación visual no estaba prevista.
- [x] T7: aceptación + CLAUDE.md — commit 4b22d44 (base ba97c6b), tsc 0, next build OK (/ en 176 kB). 6/8 criterios verificados. Los criterios 4 y 5/5b (que un visto no vuelva a salir, y el reflejo tarjeta<->ficha con su deshacer) NO se pudieron verificar: necesitan sesión logueada real y no hay credenciales en el entorno. Quedan para el dueño.

## Review final del branch (opus) — Listo para mergear: SÍ CON ARREGLOS → ARREGLADO
0 Critical, 4 Important + 11 Minor. Arreglados en c2b534b (I1-I4, M1, M2, M3, M5, M6, M8, M10, M11 y la consistencia del panel).
AISLAMIENTO CONFIRMADO MECÁNICAMENTE: la rama entera tiene 0 líneas borradas en 12 archivos. Nada existente se modificó.
lib/enrich.ts solo suma watchLinkFor; CatalogView solo 2 líneas; globals.css solo selectores nuevos con prefijo .rlt-.
- I1 la tarjeta mostraba los SLUGS de género crudos ("accion / scifi") en vez de las etiquetas. Visible en cada tarjeta.
- I2 el logo era pick.platforms[0], o sea la primera que devuelve TMDB, sin filtrar por las del usuario: alguien solo con
  MovistarTV veía el logo de NETFLIX. Y "dónde está" es una de las 3 cosas que el spec le pide a la tarjeta.
- I3 carrera: itemRefs("watched") no se esperaba antes del primer pedido, así que un click rápido mandaba p_excluir SIN
  los vistos y podía salir un título ya marcado (criterio 4 del spec). Ahora se guarda la promesa y se awaitea.
- I4 el tope de excluir se aplicaba en el server, después de armar la URL (431 con ~2000 vistos), y recortaba los
  MOSTRADOS antes que los vistos, borrando el estado de paginación. Ahora se topea en el cliente priorizando mostrados.
- M1 la tarjeta no hidrataba `visto` con hasItem, así que el criterio 5 andaba en una sola dirección.
- M2 un hiccup de TMDB se confundía con "pool agotado" y borraba el progreso del escenario.
VERIFICADO POR EL CONTROLADOR en vivo tras el fix: tarjeta de "La sustancia" con "2024 · 2h 21m · Terror / Sci-fi /
Suspenso", chip de plataforma entre las elegidas, frase "Pide cabeza" (nunca `alta`), bloque PERO presente,
aria-expanded correcto. tsc 0, next build OK, / en 176 kB.

PENDIENTE DEL DUEÑO:
1. Criterios 4 y 5 del spec: necesitan sesión logueada, no hay credenciales en el entorno. Probar que un título marcado
   no vuelve a salir, y que el "ya la vi" se refleja tarjeta<->ficha en los dos sentidos y se puede deshacer.
2. Decisión de diseño: los banners de Ruleta y Desempatá quedan a 26 px con el mismo degradado y preguntas casi
   sinónimas. Reusar .dsmp-banner lo pidió el dueño; la duplicación visual no estaba prevista.
3. supabase/migrations/002_roulette.sql y data/*.sql están SIN VERSIONAR: la rama depende de objetos de base que no
   están en el repo. Un clon limpio no reproduce el entorno. Es la misma decisión pendiente de chips/, data/ y scripts/.
4. La policy de roulette_titles es `select using (true)` con anon key: el texto editorial curado (el diferencial del
   producto) es scrapeable con un select *. Viene de la migración del pipeline, no de esta rama; el spec la da por
   buena. Si importa, se arregla con security definer, no con un cambio de app.

ESTADO: rama feat/ruleta NO mergeada, 14 commits sobre a33754e, HEAD c2b534b.

MERGEADA a main: 756b93e (merge commit), pusheada a origin (4774489..756b93e).
Antes del merge se sumó 00ffc41: póster en la tarjeta (al costado, 124px escritorio / 92px mobile)
y corrección de CLAUDE.md, que decía que el link de watch/providers era "tipo JustWatch" cuando en
realidad TMDB hoy devuelve themoviedb.org/movie/<id>/watch?locale=AR. El botón "Verla" ya iba a TMDB.
