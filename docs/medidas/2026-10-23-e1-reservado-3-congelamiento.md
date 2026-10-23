# E1: congelamiento del código para el reservado 3

23/10/2026. Claude Code. Rama `feat/resenas-reglas`.

## Versión medida

- `VERSION_REGLAS`: `2026-10-22.5`.
- Auditada por Codex en
  `docs/medidas/2026-10-22-auditoria-e12-correccion-2-a8e973a.md`.
- Commit auditado: `a8e973a682f79c452deb089998d138c656436fee`.
- Último cambio de código de reglas:
  `b6e1f33b93a905cf9383445cfb74545efb78727f`.
- Árbol Git de `lib/comunidad/reglas`: `66cc48baa41064c8f31cc3d6dfe3323c65158e2f`.
  Es el mismo en `b6e1f33` y en `a8e973a`.

## Huellas

SHA-256 del contenido en Git, UTF-8 con saltos de línea LF:

| Archivo | SHA-256 |
|---|---|
| `lib/comunidad/reglas/decision.ts` | `bf4373093afef7a5f659cb1cb8dc9779540af00d129d5f8fd23eb33ceea622f7` |
| `lib/comunidad/reglas/listas.ts` | `0748767affb4918ea713bcf8fe8b281d98715520586978f7e41eba048a53a276` |
| `lib/comunidad/reglas/plegado.ts` | `cc018cb412469f95ba529ca5119da18d027b6937a6c8d04fab408808b8afc47c` |
| `lib/comunidad/reglas/reglas.ts` | `096af5898c9c19b410a6db82fd66ef6c7791d38629038986b69910bf1c409018` |
| `lib/comunidad/reglas/tipos.ts` | `27c1fe8fcd99d61d95ee2e43a6133102a9a736829ccc476825b1aeedc6c91ce8` |
| `lib/comunidad/reglas/version.ts` | `a5e8bc56423e6975a93f634bcd8b325f4a611125d597dbd1442de9a6295acb33` |
| `lib/comunidad/reglas/banco/evaluar.ts` | `b8fa96977231c47a999b0d24f79a9e3c96c9ec4c0e5c23b69113cf015e70c01d` |
| `lib/comunidad/reglas/banco/desarrollo.ts` | `25b2a7381b03b1247fa2892353ae8a2c3f258165a54c6ed18f8c57ba6b89b720` |

## Compromisos durante esta entrega

- **No cambian** reglas, listas, umbrales, normalización ni el evaluador. El
  ejecutor `scripts/comunidad/correr-reservado-3.mjs` comprueba las seis
  huellas de las reglas y la de `evaluar.ts` antes de correr, y se niega si
  alguna cambió.
- El protocolo está en `scripts/comunidad/banco-reservado-3/PROTOCOLO.md`. Se
  comprometió en Git antes de encargar los casos.
