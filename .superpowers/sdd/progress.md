# Progreso — Área de usuario (subagent-driven)

Rama: feature/area-usuario
Plan: docs/superpowers/plans/2026-07-18-area-usuario.md
Base pre-Task-1: b8eb445

- [x] Task 1: schema (user_items, view_history, avatar_seed) — commit 0a0c8d0, verificado por grep
- [x] Task 2: lib/avatar + DiceBear — commit 529ce99, tsc limpio
- [x] Task 3: AuthContext avatar_seed — commit c5ac882, tsc limpio
- [x] Task 4: TopBar avatar — commit a0cdd83, tsc limpio
- [x] Task 5: lib/userdata — commit 753fef8, tsc limpio, firmas OK
- [x] Task 6: cardsByIds + /api/cards — commit 7e3ddb1, tsc limpio
- [x] Task 7: UserShelf — commit 1a45713, tsc limpio
- [x] Task 8: UserHub + /cuenta — commit d7246bd, tsc limpio
- [x] Task 9: /cuenta/perfil + AvatarPicker — commit 35ec09e, tsc limpio
- [x] Task 10: páginas ver todo — commit 2244564, tsc limpio
- [x] Task 11: ListActions + DetailView — commit 864e2fe, tsc limpio
- [x] Task 12: docs — commit 11e8f35, next build OK

## Cierre
- Votados leftover commiteado (feature Hacete cargo).
- Review final (opus): 0 Critical, 1 Important, 5 Minor.
- Important RESUELTO: IndecisoHero.tsx commiteado (finder-tag→shelf-title/reset-btn).

### Minor
- [x] #2 ListActions busy compartido — ARREGLADO (busy por-kind).
- [x] #4 hub rieles sin cota — ARREGLADO (.slice(0,20) en list/liked del hub).

### Deuda técnica (decisión: dejar por ahora)
- #3 avatar.ts: prefijo data URI `;utf8,` informal (funciona; DiceBear usa `.toDataUri()`).
- #5 /api/cards: 500 en catch vs wording del spec (hub no se rompe; consistente con siblings).
- #6 avatar flicker en signup nuevo (fila profiles aún no creada; patrón preexistente).

### Pendiente del dueño
- Correr supabase/schema.sql en Supabase (avatar_seed, user_items, view_history + trigger).
- lib/categories.ts sigue como WIP tuyo sin commitear (auto-consistente, no roto).
