#!/usr/bin/env bash
# Genera y valida los parches de las variantes fuera del árbol. Sólo toca el worktree descartable wt-fichas-exp.
set -e
RAIZ="D:/DESARROLLO/stream central"
INC="$(cd "$(dirname "$0")" && pwd)"; SNAP="$INC/../parches/snap"
E="$RAIZ/wt-fichas-exp"; F="$RAIZ/wt-fichas"
OUT="$RAIZ/wt-inc-redis/docs/medidas/2026-11-06-incidente-upstash/parches"; mkdir -p "$OUT"
cd "$E"
[ "$(git rev-parse --show-toplevel | tr -d '\r')" = "$E" ] || { echo "no es el worktree esperado"; exit 1; }
base() { git reset -q --hard dffd1d7; git clean -qfd; }
final() { cp "$F/lib/enrich.ts" lib/enrich.ts; cp "$F/lib/lectura-compartida.ts" "$F/lib/lectura-compartida.test.ts" "$F/lib/robots-txt.test.ts" lib/; cp "$F/public/robots.txt" public/; git add -A; }
# 1. El árbol final, como parche propio (para la prueba sobre main).
base; final; git diff --cached --binary > "$OUT/final-lectura-compartida-y-robots.patch"
# 2. Sin `disp:` por título, sobre el árbol final.
git apply --exclude=lib/enrich.ts "$SNAP/arbol-sin-disp-y-tm.patch"
cp "$SNAP/enrich.final-sin-disp.ts.txt" lib/enrich.ts
git diff --binary > "$OUT/opcional-sin-disp-por-titulo.patch"
git diff --stat | tail -n 7
# 3. Barrera, sobre la base de la rama (se midió ahí).
base
# lote-proveedores.ts y sus pruebas viven sólo dentro de parches/descartada-barrera-sobre-dffd1d7.patch.
cp "$SNAP/enrich.01-barrera.ts.txt" lib/enrich.ts; cp "$SNAP/lote-proveedores.ts" "$SNAP/lote-proveedores.test.ts" "$SNAP/descartes-tmdb-inventario.test.ts" lib/
git add -A; git diff --cached --binary > "$OUT/descartada-barrera-sobre-dffd1d7.patch"; git diff --cached --stat | tail -n 5
# Validación: cada parche aplica donde dice.
base; git apply --check "$OUT/final-lectura-compartida-y-robots.patch" && echo "ok final sobre dffd1d7"
git apply "$OUT/final-lectura-compartida-y-robots.patch"; git add -A; git apply --check "$OUT/opcional-sin-disp-por-titulo.patch" && echo "ok sin-disp sobre final"
base; git apply --check "$OUT/descartada-barrera-sobre-dffd1d7.patch" && echo "ok barrera sobre dffd1d7"
git apply --check "$OUT/final-lectura-compartida-y-robots.patch"
base
ls -la "$OUT"
