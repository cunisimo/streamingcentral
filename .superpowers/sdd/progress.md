# Progreso — Trailer en el Hero (subagent-driven)

Rama: feat/hero-trailer
Plan: docs/superpowers/plans/2026-07-30-hero-trailer.md
Base pre-Task-1: 8aa3dc8

Verificación del proyecto: no hay test runner. Cada task se valida con
`npx tsc --noEmit` + chequeo funcional/visual. Los reviewers NO deben marcar
"faltan tests" como defecto (proyecto sin framework de tests por diseño).

Constraints: sin CSS-in-JS (todo en app/globals.css), sin deps npm nuevas
(solo APIs del navegador), no tocar el SW (no bump de CACHE_VERSION), UI en
español rioplatense, UITitleDetail es el contrato estable.

Feature: reproducir trailer de YouTube dentro del Hero de la ficha, cross-fade,
sin modal/navegación/CLS. Arranca muteado, controles propios ✕/🔇🔊/⛶.

- [x] Task 1: capa de datos — commit b4913f9 (base 8aa3dc8), tsc 0 errores, curl OK (Inception/Shawshank devuelven trailerKey), review limpio
- [x] Task 2: TrailerPlayer — commit d5b81ab (base b4913f9), tsc 0 errores, review aprobado
  - Minor (para review final): (a) foco no se mueve a los botones del estado error (a11y polish); (b) postMessage sin handshake de "ready" — un mute/unmute inmediato tras onLoad podría perderse (riesgo inherente al approach sin iframe_api, ya documentado en el plan); (c) `iframe:fullscreen` sin prefijo `-webkit-` para Safari viejo (cosmético).
- [x] Task 3: TrailerButton + HeroTrailer + integración en DetailView — commit 045b724 (base d5b81ab), tsc 0 errores, review aprobado
  - Minor (trivial): dos useEffect keyed en [playing] podrían unirse; no vale el churn (calca el brief).

TODAS LAS TASKS COMPLETAS.

## Review final del branch (opus) — Ready to merge: YES (con pulidos opcionales)
- 0 Critical, 0 Important. Verificó fugas de listeners/observers/timeouts (todas limpias),
  foco, sin audio en background al cerrar/navegar (unmount destruye el iframe), stacking
  .dhero/.dback(z3)/player(z1)/controles(z2) correcto, pickTrailer robusto a videos ausente,
  todos los constraints (sin deps, sin CSS-in-JS, SW intacto, contrato UITitleDetail).
- 5 Minor. Aplicados en commit fbe0055: (1) Esc no cierra si hay fullscreen abierto;
  (2) foco re-ejecuta en cambio de estado → aterriza en "Cerrar" del error; (3) comentario
  de limitación embed-deshabilitado en onLoad; (4) prefijo -webkit-full-screen. tsc 0 errores.
  Diferidos (no bloquean): #5 unir dos useEffect (estilístico); detección onError 101/150 (fuera de v1).
- Riesgo aceptado y documentado: postMessage sin handshake ready (approach sin iframe_api).

## Fixes post-QA (reportados por el dueño en el móvil)
- Commit 98bee09:
  - **Trailer doblado (es-ES)**: pickTrailer ahora prioriza idioma original > inglés > otro;
    titleVideos pide videos con include_video_language del idioma original (excluye "es").
    Verificado real: Inception→trailer oficial EN, Parásitos→trailer oficial KO. tsc 0 errores.
  - **Error 153 en móvil**: trailerEmbedUrl recibe origin (window.location.origin); enablejsapi
    sin origin rompe en móvil. Pendiente de re-test del dueño en el celular.

- Commit eb6fbd8: subtítulos en castellano por defecto (cc_load_policy=1 + cc_lang_pref=es), best-effort.

QA del dueño: OK (probado en responsive/dev tools; móvil real no, pero se ve bien).
Branch eb6fbd8 listo para integrar. Falta: finishing-a-development-branch (merge --no-ff a main → deploy Vercel).
