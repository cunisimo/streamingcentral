// Los cuatro scripts Lua del turno del Home, TAL CUAL se verificaron contra la
// base real de Upstash el 13/09 (informe de la Etapa 2, §4.3 y §14; el texto
// exacto que corrió está en docs/medidas/2026-09-13-etapa2-precondicion-upstash.route.ts.txt
// y lib/turno-lua.test.ts comprueba que estos son los mismos bytes).
//
// Módulo puro y sin imports: lo cargan lib/cache.ts (producción), el doble de
// Redis del banco (que los ejecuta por texto) y los tests. Un cambio acá es un
// cambio del contrato con Redis y tiene que volver a verificarse contra la base.
//
//   RENOVAR   KEYS[1]=turno · ARGV[1]=propietario · ARGV[2]=ms            → 1 | 0
//   LIBERAR   KEYS[1]=turno · ARGV[1]=propietario                         → 1 | 0
//   ENFRIAR   KEYS=[turno, degradado] · ARGV=[propietario, json, ms]     → 1 | 0
//   PUBLICAR  KEYS=[turno, fresca, ub, gen]
//             ARGV=[propietario, fresca_json, ttl_fresca_s, ub_json, ttl_ub_s, dia]
//             → 1 publicado | 0 rechazado (turno ajeno) | -1 sólo la fresca (gen de un día posterior)
export const LUA = {
  RENOVAR: `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end`,
  LIBERAR: `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`,
  ENFRIAR: `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], 'enfriando:' .. ARGV[1], 'PX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
return 1`,
  PUBLICAR: `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local gen = redis.call('GET', KEYS[4])
local diaGuardado = gen and string.sub(gen, 1, 10) or ''
if diaGuardado > ARGV[6] then
  redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
  redis.call('DEL', KEYS[1])
  return -1
end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('SET', KEYS[3], ARGV[4], 'EX', ARGV[5])
redis.call('SET', KEYS[4], ARGV[6] .. ':' .. ARGV[1], 'EX', ARGV[5])
redis.call('DEL', KEYS[1])
return 1`,
} as const;
