# Séptima tanda: cómo reproducir

Banco local con dobles. **Sólo localhost**, sin credenciales productivas y sin tocar Producción.
Resultados guardados en `../resultados-septima-tanda/` y conclusiones en `../informe.md`, séptima tanda.

## Requisitos

- Git Bash, Node 24, `curl` y `netstat`. Para `nav-final.mjs`, Chrome instalado.
- Puertos libres: 3140, 3141, 3150–3155, 4802, 4804, 4805, 4811–4813.
- `comun.sh` fija `RAIZ="D:/DESARROLLO/stream central"`. En otra máquina, cambiar esa línea.
- Los dobles (`scripts/banco/dobles.mjs`) y el entorno del banco (`scripts/banco/entorno.sh`) son
  los del repo. `comun.sh` levanta los dobles desde el worktree `wt-inc-redis`.
- Las salidas se escriben en la carpeta del script (`INC`). Para analizar lo guardado, copiar los
  scripts de análisis a `../resultados-septima-tanda/` o correrlos con esos archivos al lado.

## Worktrees y builds por etiqueta

Cada build se compila con las variables del banco que exporta `run9.sh` / `run11.sh`
(`TMDB_BASE_URL`, `UPSTASH_REDIS_REST_URL` y `NEXT_PUBLIC_SITE_URL` locales,
`SUPABASE_SERVICE_ROLE_KEY=banco-sin-clave-real`, `IDIOMA_TITULOS=es-MX`,
`YUMP_FECHA=2026-11-06`) y con `npm run build`, no `npx next build`.

| Etiqueta | Worktree | Código |
|---|---|---|
| `produccion` | `wt-inc-redis` | `dffd1d7`, lo desplegado al diagnosticar. Para Redis equivale a `035de15` |
| `rama`, `ramaB` | `wt-fichas-exp` (descartable) | `dffd1d7` + `../parches/descartada-barrera-sobre-dffd1d7.patch` + `node exp2.mjs`, sin variables |
| `sinBarrera`, `sinDisp`, `tmTanda`, `tmTodas`, `ambas`, `ambasFicha`, `sbSinDisp`, `sbAmbasFicha` | `wt-fichas-exp` | igual que `rama`, con las variables `EXP_*` de `run1.sh`–`run6.sh` |
| `final`, `finalB` (run5–run7) | `wt-fichas` | variante sin `disp:` por título: `dffd1d7` + `final-lectura-compartida-y-robots.patch` + `opcional-sin-disp-por-titulo.patch` |
| `finalTM`, `finalTMB` (run8–run10) | `wt-fichas` | **código final**: `dffd1d7` + `final-lectura-compartida-y-robots.patch` |
| `finalMain` (run11) | `wt-fichas` | código final sobre `main` `035de15` |

`exp2.mjs` es **sólo para experimentos**: edita `lib/` de la copia descartable y agrega
interruptores `EXP_SIN_BARRERA`, `EXP_SIN_DISP`, `EXP_TM_TANDA` y `EXP_TM_FICHA`. Nunca correrlo
sobre una rama que se vaya a integrar.

## Corridas

| Script | Mide | Resultado |
|---|---|---|
| `run1.sh` | costo y simultáneos por variante | `flujos-*.json`, `simult-*.json`, `run1.log` |
| `run2.sh` | latencia de la barrera, con A/A | `latencia-barrera.json`, `run2.log` |
| `run3.sh` + `disperso.mjs` | costo con TMDB disperso | `disperso-*.json`, `run3.log` |
| `run4.sh` + `escalonado.mjs` | costo con respuestas escalonadas a la fuerza | sin log guardado: los números están en el informe |
| `run5.sh` | costo de `final` y `finalB` | `flujos-final*.json`, `simult-final*.json`, `run5.log` |
| `run6.sh` | latencia de `final`, `sinDisp` y `tmTodas` | `latencia-final-*.json`, `run6.log` |
| `run7.sh` + `nav-final.mjs` | navegador: producción y `final` | `nav-final-*.json`, `run7.log` |
| `run9.sh` (llama a `run8.sh`) | build del código final, navegador, costo, simultáneos, escalonado, `robots.txt` y latencia | `flujos-finalTM*.json`, `simult-finalTM*.json`, `latencia-tm-*.json`, `nav-final-finalTM.json`, `robots-finalTM.txt`, `run9.log` |
| `run10.sh` + `latencia3.mjs` | repetición de persona y «Ver más» en frío con A/A de las dos versiones | `latencia-persona.json`, `run10.log` |
| `run11.sh` | build sobre `035de15` y `/robots.txt` | `robots-final-main.txt`, `build-final-main.log` |

Las capturas de pantalla y las respuestas crudas de API de `nav-final.mjs` y `flujos.mjs` no se
guardaron (se regeneran). `parches.sh` vuelve a generar los tres parches desde
`../parches/snap/`.

## Análisis

- `node latencia-stats.mjs <archivo> <base> <comparadas...>`: mediana, RIC, p10–p90 y diferencia
  pareada con IC 95 % por bootstrap.
- `node comparar.mjs <base> <variantes,coma>`: comandos/TMDB/Supabase y diferencias de hash por caso.
- `node tabla-final.mjs`: producción contra el código final (costos, simultáneos, navegador).
