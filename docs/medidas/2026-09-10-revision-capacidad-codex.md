# Revisión independiente de la auditoría de capacidad

Fecha: 10/09/2026. Código local: `fd2cd23253fd13c0a0cf9cdccab4ba348ffcb87c`.
Objeto: `2026-09-10-capacidad-trafico.md`, informe de Claude.

## Dictamen

Los riesgos centrales de falta de coordinación del Home, fragmentación de claves,
degradación sin caché y falta de contadores completos tienen sustento. **El informe
y sus criterios de aceptación requieren correcciones antes de usarse como plan
de implementación.** No se auditó Producción ni se ejecutó carga contra servicios.

## Correcciones necesarias

1. **P1 — El criterio de canonización eliminaría plataformas legítimas.**
   En §9, etapa 1, dice que `N,D,M` debe converger a `n`. Debe converger a
   `d,m,n`, preservando Disney+ y Max. `n,n` y `n,zzz` sí pueden converger a `n`
   si se decide descartar códigos desconocidos. Probar también que conjuntos
   válidos DIFERENTES no converjan y conserven su contenido. La normalización
   debe contemplar los toggles por defecto omitidos frente a los explícitos.

2. **P2 — Redis sí reintenta errores de transporte.**
   §4.2 afirma que no hay reintentos en Redis. `lib/cache.ts:27` instancia el SDK
   sin desactivarlos. El SDK instalado `@upstash/redis` 1.38.0 configura cinco
   reintentos por defecto (`node_modules/@upstash/redis/nodejs.js:149` y bucle
   en torno a :191). Ejecución con `fetch` sustituido por una función que falla:
   **seis intentos**, cero red. No implica reintentar todo error HTTP: ese caso
   se procesa fuera del bucle. Distinguir llamadas lógicas, intentos HTTP y
   comandos ejecutados; las métricas de `cache.ts` no cuentan esos intentos.
   La ausencia de reintentos explícitos en `lib/tmdb.ts:56-67` sí está confirmada.

3. **P2 — Falta cubrir la escritura fallida en Redis.**
   §3.3 sólo sigue el camino de lectura. `guardar` (`lib/cache.ts:260` en adelante)
   tiene `try/finally`, sin absorber el rechazo de `redis.set`.
   `resolverConCache` (`lib/reparar-y-cachear.ts:43`) espera la escritura antes
   de devolver. Si el payload es bueno y falla guardarlo, el rechazo llega al
   catch del handler del Home y puede terminar en 500. Ejecutado sobre el resolver
   real con backend simulado: producir un valor correcto y fallar al escribir
   hace rechazar la promesa. No se ejecutó el handler HTTP completo.
   Incluir en el plan lectura caída, escritura caída, Redis totalmente caído y
   recuperación; acordar qué servir cuando Redis también guarda el último bueno
   y el bloqueo. Esa copia no protege por sí sola ante una caída de Redis.

4. **P2 — Concurrencia no es solicitudes por segundo.**
   §4.1 compara 72 solicitudes simultáneas con una referencia de 50 req/s.
   Son unidades distintas: 24 es el valor por defecto de solicitudes en vuelo,
   configurable por entorno, por instancia del módulo. La tasa depende además
   de la duración de los requests. El límite no es global, pero esa comparación
   no demuestra que tres instancias excedan una tasa determinada. Medir ambos
   indicadores y verificar el límite de la cuenta por separado.

5. **P2 — El banco aislado no responde las seis incógnitas de Producción.**
   El cierre de §11 afirma que todas salen de etapa 0 + §10. Un doble de TMDB y
   bases separadas verifican comportamiento bajo condiciones controladas; no
   revelan cuotas de cuentas reales, participación de testers, hit rate real ni
   escalado real del deployment de Producción. Separar: pruebas de comportamiento,
   capacidad bajo condiciones declaradas, observación pasiva de Producción y
   consulta de límites/configuración de las cuentas. No extrapolar una capacidad
   máxima real a partir de dobles.

6. **P2 — La exclusión distribuida necesita un contrato más completo.**
   SET NX con vencimiento no garantiza por sí solo una composición única si ésta
   supera el vencimiento. Etapa 2 debe definir duración/renovación, propietario,
   liberación segura, muerte del constructor, espera sin último bueno y qué hacer
   si Redis no está disponible. Agregar pruebas de expiración durante el trabajo
   y de caída del propietario. El criterio de una composición debe explicitar
   esas condiciones, no prometer exclusión indefinida a partir del turno temporal.

7. **P3 — La salida publicada no sostiene “14 pedidos → 11 claves”.**
   §2.1 contiene **13 filas y 10 claves distintas**. Se reprodujeron esas filas
   con `claveHome` real y las expresiones de parseo/ordenado publicadas, fecha
   fija 20260910. Esto confirma la fragmentación, no los totales escritos.
   Puede faltar una fila del ensayo original; adjuntar el arnés y salida íntegra
   o corregir la cifra. Esta ejecución no monta Next ni llama `/api/home`.

## Confirmaciones y límites

- `homePayload` llama `cachedLocIf` y éste delega en `resolverConCache`, sin
  single-flight del Home. Ejecución del resolver real con 100 lectores que reciben
  MISS: **100 productores**. Prueba del resolver, no carga HTTP ni de Vercel.
- `homeKey` ordena pero no deduplica plataformas. `parseTypes` acepta nombres
  arbitrarios con valores `movie`/`tv`; la falta de validación está comprobada.
- `topVotedRows` hace RPC sin caché si Supabase está configurado; `votedCards`
  permite códigos desconocidos por comprobar sólo longitud. Los dos RPC son
  parte del costo, no un inventario completo: con filas también llama
  `publishedIds` y enriquece títulos, que pueden consultar otras dependencias.
- La cola TMDB es local y no lee `Retry-After`. Un resultado degradado del Home
  no se guarda. No hay último Home bueno implementado en ese camino.
- Las métricas Redis existentes atribuyen lotes compartidos al contexto que
  programa el flush (`lib/cache.ts:143-145`). Agregar single-flight global sin
  adaptar la medición confundiría HIT, espera compartida y composición propia;
  también deben probarse los contextos de degradación de cada consumidor.
- No se reprodujeron las consultas de Claude a paneles, `dbsize`, logs ni hashes
  de archivos ajenos. No se confirma por lectura que faltan límites configurados
  fuera del código (por ejemplo, en un panel).
- El soporte de `Vary` en Vercel está documentado; no se reporta como inexistente.
  Referencia consultada: https://vercel.com/docs/caching/cdn-cache . El criterio
  CDN exige verificar HIT y encabezados con orígenes alternados; `Vary` no es
  autenticación ni sustituye límites de abuso.

## Próximo paso

Corregir el informe y los criterios anteriores, instrumentar distinguiendo
intentos reales y trabajo compartido, y medir un control antes de implementar
las mitigaciones. Mantener separados los diagnósticos confirmados de los números
no medidos. No aprobar todavía el plan textual como contrato de implementación.

Esta revisión sólo agrega documentación. No modifica código ni implementa las
soluciones; los archivos del dueño se preservan. El estado canónico se mantiene
en `../ESTADO.md`.
