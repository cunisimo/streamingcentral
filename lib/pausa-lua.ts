// Los cuatro scripts Lua de la PAUSA COMPARTIDA ante 429 (Etapa 3.c.1, #19;
// informe docs/medidas/2026-09-14-etapa3-diseno-resistencia-tmdb.md §40.1,
// §41.4, §43.9, §43.10 y §45-§52). Módulo puro y sin imports, como
// lib/turno-lua.ts: lo cargan lib/cache.ts (producción), la emulación en
// memoria (lib/turno-memoria.ts), el doble de Redis del banco (por texto) y
// los tests. Un cambio acá es un cambio del contrato con Redis y se vuelve a
// verificar contra la base (precondición de Preview, §41.9).
//
//   TOMAR    KEYS=[turno, pausa] · ARGV=[propietario, px]
//            → {'pausado', pttl} | {'adquirido'} | {'ocupado', valor}
//            La comprobación de la pausa va DENTRO de la adquisición: no existe
//            instante entre "leer la pausa" y "SET NX" (§40.5).
//   PAUSAR   KEYS=[pausa, ev:<id>, proc:<uuid>, eventos, cubos]
//            ARGV=[id, ms, contador, familia, retryAfterMs]
//            → {'escrito', ms} | {'ya-mayor', restante} | {'ya-aplicada', pttl}
//            Orden que falla seguro (§43.10): validar → EXISTS ev → GET proc →
//            PTTL → SET pausa (la protección) → SET proc → SET ev (la
//            idempotencia) → pcall(telemetría). Un error a mitad deja la pausa
//            puesta y el reintento re-escribe (sobre-protección acotada);
//            nunca deja el marcador sin pausa.
//   CUBO     KEYS=[cubos] · ARGV=[campo] → minuto de Redis
//            Contadores del CLIENTE (pausaNoLeida, pausadosUB, pausados503)
//            sellados con el reloj de Redis: ninguna clave sale del reloj local.
//   SALUD    KEYS=[pausa, cubos] → {pttl, 429, pausas, ya-mayor, ya-aplicada,
//            pausaNoLeida, pausadosUB, pausados503} de los últimos 60 minutos.
//            Sólo agregados: ningún uuid, id, familia ni evento crudo (§41.4).
export const CLAVES_PAUSA = {
  pausa: "tmdb:pausa",
  eventos: "tmdb:eventos",
  cubos: "tmdb:cubos",
  ev: (id: string) => `tmdb:pausa:ev:${id}`,
  proc: (uuid: string) => `tmdb:pausa:proc:${uuid}`,
} as const;

/** Marcador de idempotencia por evento: 2 × maxDuration (§41.3). */
export const MARCADOR_MS = 120_000;
/** Marca de agua por proceso: vence sola 24 h después del último evento del proceso (§43.9). */
export const PROC_MS = 86_400_000;
export const CUBOS_EXPIRE_S = 172_800;
export const EVENTOS_EXPIRE_S = 604_800;
export const EVENTOS_MAX = 200;
/** Ventana de agregados de /api/health, en minutos. */
export const SALUD_VENTANA_MIN = 60;
export const CAMPOS_SALUD = ["429", "pausas", "ya-mayor", "ya-aplicada", "pausaNoLeida", "pausadosUB", "pausados503"] as const;

export const LUA_PAUSA = {
  TOMAR: `local p = redis.call('PTTL', KEYS[2])
if p > 0 then return {'pausado', p} end
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then return {'adquirido'} end
return {'ocupado', redis.call('GET', KEYS[1]) or ''}`,

  PAUSAR: `local ms = tonumber(ARGV[2])
local contador = tonumber(ARGV[3])
if not ms or ms <= 0 or ms ~= math.floor(ms) or not contador or contador ~= math.floor(contador) then
  return redis.error_reply('ERR PAUSAR: argumentos invalidos')
end
local function cubo(campo)
  local t = redis.call('TIME')
  local minuto = math.floor(tonumber(t[1]) / 60)
  redis.call('HINCRBY', KEYS[5], minuto .. ':' .. campo, 1)
  redis.call('EXPIRE', KEYS[5], ${CUBOS_EXPIRE_S})
  return tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
end
if redis.call('EXISTS', KEYS[2]) == 1 then
  pcall(cubo, 'ya-aplicada')
  return {'ya-aplicada', redis.call('PTTL', KEYS[1])}
end
local marca = tonumber(redis.call('GET', KEYS[3]) or '-1')
if contador <= marca then
  pcall(cubo, 'ya-aplicada')
  return {'ya-aplicada', redis.call('PTTL', KEYS[1])}
end
local restante = redis.call('PTTL', KEYS[1])
local estado
if restante >= ms then
  estado = 'ya-mayor'
else
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ms)
  estado = 'escrito'
  restante = ms
end
redis.call('SET', KEYS[3], ARGV[3], 'PX', ${PROC_MS})
redis.call('SET', KEYS[2], '1', 'PX', ${MARCADOR_MS})
pcall(function()
  cubo('429')
  local ahoraMs = cubo(estado == 'escrito' and 'pausas' or 'ya-mayor')
  redis.call('LPUSH', KEYS[4], cjson.encode({ id = ARGV[1], t = ahoraMs, familia = ARGV[4], retryAfterMs = ARGV[5], estado = estado, restante = restante }))
  redis.call('LTRIM', KEYS[4], 0, ${EVENTOS_MAX - 1})
  redis.call('EXPIRE', KEYS[4], ${EVENTOS_EXPIRE_S})
end)
return {estado, restante}`,

  CUBO: `local t = redis.call('TIME')
local minuto = math.floor(tonumber(t[1]) / 60)
redis.call('HINCRBY', KEYS[1], minuto .. ':' .. ARGV[1], 1)
redis.call('EXPIRE', KEYS[1], ${CUBOS_EXPIRE_S})
return minuto`,

  SALUD: `local t = redis.call('TIME')
local minuto = math.floor(tonumber(t[1]) / 60)
local desde = minuto - ${SALUD_VENTANA_MIN - 1}
local campos = {${CAMPOS_SALUD.map((c) => `'${c}'`).join(", ")}}
local suma = {}
for i = 1, #campos do suma[i] = 0 end
local todo = redis.call('HGETALL', KEYS[2])
for i = 1, #todo, 2 do
  local k = todo[i]
  local sep = string.find(k, ':', 1, true)
  if sep then
    local m = tonumber(string.sub(k, 1, sep - 1))
    local campo = string.sub(k, sep + 1)
    if m and m >= desde and m <= minuto then
      for j = 1, #campos do
        if campos[j] == campo then suma[j] = suma[j] + (tonumber(todo[i + 1]) or 0) end
      end
    end
  end
end
local out = { redis.call('PTTL', KEYS[1]) }
for j = 1, #campos do out[#out + 1] = suma[j] end
return out`,
} as const;
