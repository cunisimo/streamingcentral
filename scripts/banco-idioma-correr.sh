#!/bin/bash
# Banco de pruebas del idioma: una corrida end-to-end del Home.
#
#   bash scripts/banco-idioma-correr.sh <etiqueta> <puerto> <idioma> <fallback:1|0> [fichas]
#
# Se corre DENTRO del worktree del banco, no en el repo. Ver
# docs/MANTENIMIENTO.md, "Como rehacer la medicion de idioma".
#
# Una corrida = un proceso de Next nuevo en su PROPIO puerto = cache en memoria
# vacio. El .env.local del banco no tiene credenciales de Upstash, asi que el
# Redis de produccion no se toca ni se precalienta.
#
# TRES TRAMPAS, todas cobradas ya:
#
#  1. `kill $PID` mata el WRAPPER de npx, no el servidor de Next. El servidor es
#     un nieto y sobrevive. Por eso se mata POR PUERTO: se busca quien escucha y
#     se le mata el arbol.
#  2. El chequeo de "puerto ocupado" hay que escribirlo mirando la COLUMNA de la
#     direccion local. `grep "LISTENING.*:$PUERTO "` no matchea nunca —en la
#     salida de netstat el puerto viene ANTES de LISTENING— y con eso el guard
#     quedaba apagado en silencio: ocho servidores huerfanos y ningun aviso.
#  3. Aunque el puerto sea distinto por corrida, hay que VERIFICAR que respondio
#     la variante pedida. La linea [BANCO] trae idioma y fallback; si no
#     coinciden, aborta.
set -u
ETIQUETA="$1"; PUERTO="$2"; IDIOMA="$3"; FB="$4"; FICHAS="${5:-no}"
LOG="salida-$ETIQUETA.log"
rm -f "$LOG" "resp-$ETIQUETA.json" "medida-$ETIQUETA.txt"

# Quien escucha en el puerto. Mira la columna de la direccion local.
pids_del_puerto() {
  netstat -ano 2>/dev/null \
    | grep -E "^[[:space:]]+TCP[[:space:]]+[0-9.]+:$PUERTO[[:space:]]" \
    | grep "LISTENING" | awk '{print $NF}' | sort -u
}
ocupado() { [ -n "$(pids_del_puerto)" ]; }

if ocupado; then echo "ABORTA: el puerto $PUERTO ya esta ocupado (pids: $(pids_del_puerto | tr '\n' ' '))"; exit 2; fi

YUMP_FECHA="${YUMP_FECHA:-2026-08-23}" IDIOMA_TITULOS="$IDIOMA" FALLBACK_IDIOMA="$FB" \
  npx next dev -p "$PUERTO" > "$LOG" 2>&1 &
PID=$!

matar() {
  # Primero el arbol de quien ESCUCHA (el servidor real), despues el wrapper.
  for p in $(pids_del_puerto); do taskkill //PID "$p" //T //F >/dev/null 2>&1; done
  taskkill //PID $PID //T //F >/dev/null 2>&1 || kill $PID 2>/dev/null
  wait $PID 2>/dev/null
  for _ in $(seq 1 20); do ocupado || return 0; sleep 1; done
  # Un huerfano vivo contamina la corrida siguiente: es un fallo, no un aviso.
  echo "ABORTA: el puerto $PUERTO sigue ocupado (pids: $(pids_del_puerto | tr '\n' ' '))"
  exit 5
}

listo=0
for _ in $(seq 1 120); do
  grep -q "Ready in" "$LOG" 2>/dev/null && { listo=1; break; }
  grep -q "EADDRINUSE" "$LOG" 2>/dev/null && { echo "ABORTA: EADDRINUSE en $PUERTO"; break; }
  sleep 1
done
[ "$listo" = 1 ] || { echo "ABORTA: el server no arranco"; matar; exit 2; }

URL="http://localhost:$PUERTO/api/home?providers=n,d,m"
{
  curl -s -o "resp-$ETIQUETA.json" -w "frio     http=%{http_code} pared=%{time_total}s bytes=%{size_download}\n" "$URL"
  curl -s -o /dev/null              -w "caliente http=%{http_code} pared=%{time_total}s bytes=%{size_download}\n" "$URL"
} | tee "medida-$ETIQUETA.txt"

if [ "$FICHAS" = "fichas" ]; then
  # Despues de las dos del Home, para no tocar sus contadores.
  for ref in movie/12535 movie/278 movie/1084242 movie/585 tv/1399 tv/4614 movie/557; do
    curl -s -o "f-$ETIQUETA-$(echo $ref | tr / -).json" \
      -w "ficha $ref http=%{http_code} bytes=%{size_download}\n" \
      "http://localhost:$PUERTO/api/title/$ref?providers=n,d,m" | tee -a "medida-$ETIQUETA.txt"
  done
fi

matar

N=$(grep -c "\[BANCO\]" "$LOG")
[ "$N" -ge 2 ] || { echo "ABORTA: solo $N lineas [BANCO] (se esperaban 2)"; exit 3; }

VISTO=$(grep "\[BANCO\]" "$LOG" | head -1 | sed -e 's/.*"idioma":"\([^"]*\)".*/\1/')
VISTO_FB=$(grep "\[BANCO\]" "$LOG" | head -1 | sed -e 's/.*"fallback":\([a-z]*\).*/\1/')
ESPERADO_FB=$([ "$FB" = "0" ] && echo false || echo true)
[ "$VISTO" = "$IDIOMA" ] || { echo "ABORTA: pedi $IDIOMA y respondio $VISTO"; exit 4; }
[ "$VISTO_FB" = "$ESPERADO_FB" ] || { echo "ABORTA: pedi fallback=$ESPERADO_FB y respondio $VISTO_FB"; exit 4; }

{
  echo "--- $ETIQUETA (idioma=$IDIOMA fallback=$FB fecha=${YUMP_FECHA:-2026-08-23} puerto=$PUERTO) ---"
  grep "\[BANCO\]" "$LOG"
  grep "\[home\] MISS\|\[home\] HIT" "$LOG"
  grep "\[idioma\] fallback" "$LOG"
  grep "comandos" "$LOG"
  grep "\[home\] EJES" "$LOG"
} | tee -a "medida-$ETIQUETA.txt"
