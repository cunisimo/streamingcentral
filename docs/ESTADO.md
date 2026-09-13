# Estado de Yump

> **Estado canónico. Actualizado el 13 de septiembre de 2026.**
> Leer este bloque antes de los antecedentes históricos. Arquitectura y reglas:
> [`CLAUDE.md`](../CLAUDE.md). Problemas históricos: [`ISSUES.md`](ISSUES.md).
> No duplicar este estado en otros manuales: enlazarlo.

## Evidencia y alcance de esta actualización

- **Recuperación de contraseña (#22) — estado vigente.**
  1. La corrección está **mergeada en `main`** mediante `be5ef1d` (rama
     `fix/recuperacion-password`, commits `fb89b45` → `0831b86` → `0d1b978` →
     `de45b56`).
  2. **Pusheada y desplegada.** `adf7065` está en `origin/main` y es el
     deployment de Producción de Vercel del 11/09 (17:31Z, `success`);
     `app.yump.ar` sirve la página nueva de recuperación — comprobado contra los
     bytes: el HTML de `/cuenta/reset` dice "Cargando…" y los chunks traen
     `PASSWORD_RECOVERY`, el cliente aislado y el reductor. **Sigue pendiente
     la prueba real del dueño por correo** en Producción, que el buzón
     descartable no reemplaza.
  3. La implementación fue **auditada** (cuatro rondas de Codex; la última,
     sobre `de45b56`, sin nuevos bloqueos técnicos y apta para mergear) y
     **verificada**: unitarios escritos antes de cada cambio, navegador sobre
     build de producción con cuentas de prueba borradas, recorrido con correo
     real, `npm test` 1337/1347 (10 omitidos), `tsc` limpio, `npm run build`
     exit 0. Lo que quedó: la única prueba de recuperación es el evento
     `PASSWORD_RECOVERY`; la escritura va atada a esos tokens en un cliente
     aislado; la aceptación es una autorización pendiente → reclamada por una
     sola instancia de la pantalla, sólo si la ruta real es `/cuenta/reset`.
     Informe completo:
     [`medidas/2026-09-10-recuperacion-password.md`](medidas/2026-09-10-recuperacion-password.md).
  4. **#22 permanece abierto exclusivamente porque no se conoce qué consumió el
     enlace original del dueño**: no demostrado ni descartado. El bloqueo es de
     acceso a logs y configuración de Auth (Management API `401`, MCP
     `Unauthorized`). La reproducción A/B es una causa posible compatible con
     los síntomas, no la causa histórica probada.
  5. **Prioridad actual: media.**
  6. **Capacidad, App Links, Capacitor y Play Store son temas separados** y no
     forman parte del #22.
  7. El rechazo de `fb89b45` y los diagnósticos previos al arreglo están al
     final de este bloque como **antecedentes históricos**, no como estado.

- **Etapa PREVIA de capacidad (#21): implementada, mergeada, pusheada y
  DESPLEGADA. #21 resuelto en el alcance aprobado.** Merge `3ad935d` (rama
  `fix/cache-escritura-no-rompe`, auditada por Codex en `f8f42a5`), en
  `origin/main` y en Producción: deployment de Vercel `success` para `548ffb6`,
  y `app.yump.ar` aliasado a ese deployment (`vercel inspect`). Verificado
  desde cero sobre el `main` mergeado: específicos 18/18, suite 1355/1365 (0
  fallos, 10 omitidos), `tsc` limpio, build fresco exit 0. **Comprobado: el
  comportamiento del resolver** (siete escenarios con control y guards que atan
  producción). **Inferido: el HTTP 200**, del handler; no se provocó una caída
  real de Redis. **Esto no agrega capacidad, single-flight, bloqueo ni CDN:**
  únicamente evita perder un payload válido cuando falla su escritura. El #21
  se retiró de `ISSUES.md`; su detalle vive en la Etapa PREVIA del informe
  (`medidas/2026-09-10-capacidad-trafico.md` §9).

- **Etapa 0 de capacidad (#20, "poder medir"): MERGEADA en `main` (`1073c70`,
  rama `feat/etapa0-medir` = `81aa8fe`, auditoría final de Codex sin hallazgos
  pendientes), PUSHEADA (`9a4b7aa`) y DESPLEGADA.** Deployment de Producción
  de Vercel para `9a4b7aa` con estado `success` (22:41:17Z); `vercel inspect
  app.yump.ar` → aliasado a ese deployment (`streamingcentral-9dr90g2be…`, `●
  Ready`); `/api/health` 200 con Redis `ping ok`; la página carga (200) y
  `/api/home` responde 200 con hero y 12 rieles. **Comprobación pasiva de
  logs (una solicitud normal, sin carga ni caídas provocadas):** en `vercel
  logs` del deployment aparecen `[home] pedido <clave>` y la línea terminal con
  las unidades separadas y `| clave …`. Primera lectura real, de UNA
  solicitud: un MISS de `d,m,n` costó 24 TMDB / 10 Supabase / Redis 67
  llamadas = 67 intentos = 67 comandos, 566 claves (537 hit), 4,05 s; un HIT
  con toggles, 1 MGET y 270 ms. Es una foto, no una serie. **La observación
  real sigue INCOMPLETA:** los logs se leyeron en vivo (`vercel logs` en
  streaming); no hay serie histórica ni tasa de aciertos acumulada — eso es la
  Etapa 5 y por eso #20 sigue abierto. Verificado sobre el `main`
  mergeado, desde cero: específicos 20/20 + 6/6 + 18/18 + 18/18, suite
  1399/1409 (0 fallos, 10 omitidos), `tsc` limpio, build fresco exit 0 en 2 min
  54 s (`BUILD_ID sjAjjCkyfoitMaI678TWp`, `.next` borrado antes y sin otro Next
  compartiéndolo), `git diff --check` limpio. **Aporta medición; no agrega
  capacidad, single-flight, bloqueo distribuido, último Home bueno, CDN ni
  límites por ruta.** La
  primera auditoría (sobre `ceeed75`) no encontró bloqueos en la
  instrumentación pero sí en el banco: dos escenarios solapados y una
  coincidencia app ↔ dobles afirmada sin verificar. Corregido en la segunda
  versión (informe §7.5): el corredor ya no empieza un escenario con trabajo
  vivo en Next (reinicia y lo demuestra), atribuye cada línea por clave, valida
  automáticamente las cuatro igualdades por escenario y termina con código 1 si
  algo no cierra; la línea base se repitió entera y es válida. Métricas
  por solicitud en `lib/metricas.ts` con unidades separadas: composiciones del
  Home contadas donde corren (no deducidas del MISS), espera compartida como
  campo propio (durante la Etapa 0 valía 0; desde la Etapa 1 vale 1 en cada
  seguidor del single-flight del Home), TMDB y Supabase por separado, y Redis en llamadas
  lógicas / intentos HTTP / comandos (los reintentos del SDK se cuentan en su
  `backoff`, cotejados con el doble en la recuperación controlada: 1.655
  intentos = 1.655, 921 comandos = 921). Base de TMDB
  configurable sólo con `YUMP_BANCO=1` y nunca en `VERCEL_ENV=production`,
  ejecutado. Banco aislado (`scripts/banco/`) con tres dobles locales y una
  línea base de 23 escenarios totales: 22 completos y 1 incompleto declarado.
  **Primer número real:** un Home frío de `n,d,m` en el banco = 926 TMDB / 4
  Supabase / 993-993-993 Redis. Dos hechos medidos que no son de esta etapa
  arreglar: con Redis cortando el socket de forma sostenida, un Home frío no
  completó en 60 s (en Vercel sería 504: inferido, no medido); con Supabase
  inalcanzable el Home no se marca degradado y se guarda 6 h (bajo las
  condiciones del banco). 44 tests nuevos escritos antes del código; suite
  1399/1409 (0 fallos, 10 omitidos); `tsc` limpio; build fresco exit 0. **#20 sigue abierto**: falta la lectura de la
  tasa de aciertos de Producción sin depender de los logs (Etapa 5). **Nada del
  banco es capacidad de Producción.** Informe:
  [`medidas/2026-09-11-etapa0-medir.md`](medidas/2026-09-11-etapa0-medir.md).
  **#20 no se cierra por el deploy:**
  "instrumentación implementada y desplegada" está hecho; "observación real
  disponible" sólo en vivo y a mano (`vercel logs`), sin serie histórica.

- **Etapa 1 de capacidad (#18 canonización, #17 single-flight acotado al
  Home): MERGEADA en `main` (`e4bf75a`, rama `feat/etapa1-canonizar-single-flight`
  = `af8d7c6`, auditoría final de Codex sin nuevos hallazgos), PUSHEADA
  (`f76d9ca`) y DESPLEGADA.** Deployment de Producción `success` para
  `f76d9ca`; `app.yump.ar` aliasado a él (`vercel inspect`); `/api/health` 200;
  la Home carga; `?providers=N,D,M&t=accion:movie` devuelve el mismo Home que
  `n,d,m` (comprobación pasiva). **#18 resuelto y retirado de `ISSUES.md`** (su
  texto quedó en el informe, §10). **#17 sigue abierto**: resuelta sólo la
  coordinación dentro de una instancia; **la Etapa 2 (turno distribuido y
  último Home bueno) es el siguiente trabajo.** #20 sigue abierto por la
  observabilidad histórica. Verificado sobre el `main` mergeado, desde cero:
  específicos 27/27 + 12/12 + 6/6 + 19/19 + 20/20 + 18/18, suite 1445/1455 (0
  fallos, 10 omitidos), `tsc` limpio, build fresco exit 0 en 3 min 26 s
  (`BUILD_ID 6-g4NRsNXohqO72t7qKkw`, sólo el `.next` de este checkout borrado,
  sin otro Next usándolo), `git diff --check` limpio. `providers` se canoniza en
  `homePayload` (minúsculas → catálogo → deduplicar → ordenar → tope = tamaño
  del catálogo) y la lista canónica va a la clave Y al contenido; `t` sólo
  admite rieles de `TOGGLE_KEYS` y tipos válidos, última ocurrencia gana, y va
  en forma mínima: `t` ausente, `t=accion:movie` y las siete claves en default
  del cliente son la misma clave. `q` se trunca a 120 (el título más largo del
  pool curado mide 91) e `items` de `/api/upcoming` a 100 (el tope que el
  handler ya aplicaba a `limit`; ninguna vista lo manda hoy). El vuelo
  compartido vive sólo en `homePayload` (`lib/home-vuelo.ts`): lectura previa,
  y si no está, `crearSingleFlight` por clave con `cachedLocIf` entero como
  resolución (así está en `main`; en la rama de la Etapa 2 la resolución del
  líder pasa a `servirConTurno`); el líder cuenta la composición, los seguidores `cache =
  "compartida"` y `esperasCompartidas`. **Banco, antes → después:** 100
  solicitudes simultáneas con caché fría pasan de **100 composiciones, 91.106
  TMDB, 97.548 Redis y 162 s** a **1 composición + 99 esperas, 926 TMDB, 1.093
  Redis y 2,7 s**; `N,D,M`, duplicados, códigos inexistentes, `t` por defecto y
  rieles desconocidos son HIT de la clave de `n,d,m` sin tocar TMDB ni Supabase;
  `n` / `n,d` / `d,m` siguen siendo tres Homes; `zzz` no consulta a nadie.
  Corrida VÁLIDA (40 escenarios, 39 completos, 1 incompleto declarado).
  Cifras vigentes (sobre el `main` mergeado, `e4bf75a`): **suite 1455 tests,
  1445 aprobados, 0 fallos, 10 omitidos**; `tsc` limpio; build fresco exit 0.
  (Las cifras de la rama antes de `af8d7c6` —1439/1449, 40 tests nuevos— son
  antecedente y ya no describen el estado.) **Sólo por proceso:** entre
  instancias de Vercel no coordina nada — eso, y el último Home bueno, son la
  Etapa 2. **#18 resuelto; #17 abierto únicamente por la coordinación entre
  instancias y el último Home bueno.** Informe:
  [`medidas/2026-09-11-etapa1-canonizar-single-flight.md`](medidas/2026-09-11-etapa1-canonizar-single-flight.md).
  Etapas 3 a 5: no iniciadas.

- **Etapa 2 de capacidad (#17: turno distribuido entre instancias y último
  Home bueno): IMPLEMENTADA EN LA RAMA `feat/etapa2-turno-ultimo-bueno`
  (worktree `wt-etapa2-impl`, fork `8dfa49b`) y CORREGIDA EN RAMA tras la
  auditoría de Codex sobre `fb3a3f1` (cinco puntos: productor que rechaza
  libera el turno y sirve UB; renovación cancelable y esperada, sin
  temporizadores ni métricas tardías; contexto del vuelo por solicitud en vez
  de un mapa global; UUID completo del propietario; comentarios al día),
  PENDIENTE DE NUEVA AUDITORÍA. Sin merge, sin push, sin deploy.** Serialización
  real verificada por el camino de producción (informe §16.1); banco completo
  repetido con el mismo resultado (§16.2); suite 1.536 (1.526 aprobados, 0
  fallos, 10 omitidos) tras esa primera corrección, y **1.543 (1.533 aprobados,
  0 fallos, 10 omitidos) tras la segunda: UN instante por solicitud** (la
  clave del vuelo, las cinco claves y el día de la generación salen de la misma
  lectura del reloj; informe §17). Módulos puros nuevos (`lib/home-instante.ts`, `lib/turno.ts`,
  `lib/turno-memoria.ts`, `lib/turno-lua.ts`, `lib/home-servir.ts`,
  `lib/senal-solicitud.ts`), `VERSION_HOME` única en `lib/claves.ts`, cableado
  en `lib/cache.ts`/`lib/home.ts`/`lib/tmdb.ts`/`lib/supabase.ts`, banco
  multiproceso (`scripts/banco/correr-etapa2.mjs`). RED → GREEN: +70 tests;
  suite 1.525 (1.515 aprobados, 0 fallos, 10 omitidos) **en la implementación
  anterior a las correcciones** (`fb3a3f1`); `tsc` limpio; build
  fresco exit 0. **Banco (3 procesos, corrida VÁLIDA, 27 escenarios):** HIT
  idéntico a la Etapa 1 (1 comando, 40.505 B, mismo corredor); frío 994 → 997
  comandos; E2 3 → **1 composición entre procesos**; fresca vencida con UB →
  los demás **último bueno en el acto**; propietario asesinado → un rescate;
  turno borrado a mitad → un solo publicado; medianoche → `-1` con UB intacto;
  TMDB caído → 1 degradado + enfriamiento (ráfaga 1/s × 40 s: 3 composiciones
  sin UB, 2 con UB y 40 UB); respuesta perdida → reconciliación; EVAL fallido
  → nada inseguro; Redis caído y vuelve → `sin-redis` no escribe; composición
  > presupuesto → `cancelada` a los 50,4 s y TMDB deja de recibir; control con
  Redis caído → no termina (promesa reducida); rollout v6/v7 → familias
  separadas. Informe §15. Antecedente del mismo día: diseño v3 aprobado por
  Codex y **precondición
  (informe §14):** desde un Preview descartable y protegido (rama temporal
  nunca pusheada, subida con `vercel deploy`, borrada después; las credenciales
  de Redis son *Sensitive* y el CLI no las baja), contra **la misma base de
  Upstash que usa Producción**, con claves `precond-etapa2:<corrida>:*` de TTL
  ≤ 60 s: `SET NX PX` y los cuatro scripts reales (`RENOVAR`, `LIBERAR`,
  `ENFRIAR`, `PUBLICAR`) con el payload real del Home (85.328 B; `PUBLICAR` de
  195 KB de cuerpo), resultados positivos y negativos (propiedad perdida → 0,
  generación de un día posterior → −1 con UB intacto, `enfriando:` bloquea a
  todos), lectura posterior con contenido y TTL, 48/48 pasos correctos, 60
  comandos HTTP (mediana 118 ms), `SCAN` del prefijo 0 antes y 0 después,
  `DBSIZE` 2.923 antes y después. **Desconocido:** cómo factura Upstash un
  `EVAL` (sin acceso al panel) y el límite de tamaño de petición (≥ 195 KB
  pasa). **Hallazgo para la implementación (§14.6):** leer tres copias en el
  HIT triplica los bytes del camino caliente; queda como decisión pendiente
  con recomendación (leer sólo la fresca y pedir UB/degradado en el MISS).
  Correcciones documentales del 13/09: promesa real del deadline antes de la
  desigualdad; "Redis caído puede terminar en timeout" en vez de "no tumba la
  app"; período de adopción del UB (las frescas v6 siguen HIT y no crean UB;
  cada combinación lo obtiene en su primera reconstrucción; ventana aceptada,
  sin escrituras en los HIT); caso RED de cancelación del líder con seguidores.
  **La v3 corrige los cuatro hallazgos sobre la v2:** el camino `sin-redis` sirve y **no guarda** (nada de
  fresca/UB/generación sin fencing; escenario E-sinredis-vuelve); un degradado
  **no libera** el turno sino que lo convierte en enfriamiento (`ENFRIAR`
  atómico, `ENFRIAMIENTO_MS`, degradado compartido en clave aparte que nunca se
  promociona; ráfaga escalonada con y sin UB); el deadline es una
  **cancelación real** por `AbortSignal` (espera, renovación, TMDB y Supabase)
  con **promesa reducida**: vale con Redis respondiendo, y con Redis caído la
  solicitud puede seguir hasta `maxDuration` como en F5a (los reintentos del
  SDK no se cancelan por solicitud; Etapa 3); **una sola `VERSION_HOME`** en
  `lib/claves.ts` para fresca, UB, generación, degradado y turno, con turnos
  separados por versión en un despliegue gradual y tests de invalidación
  conjunta. La v2 resolvía los diez
  hallazgos anteriores: el seguidor sin último bueno reintenta el turno en cada vuelta y
  nunca compone sin turno; deadline integral del request contra `maxDuration`
  fijado por test y con máximos que salen del banco; degradado con último
  bueno devuelve el último bueno; **publicación con fencing atómico**
  (`PUBLICAR` compara propietario y generación por día, cubre la medianoche);
  estados `adquirido/ocupado/indeterminado` con reconciliación de la
  respuesta perdida; `EVAL` es condición obligatoria (sin variante insegura);
  integración explícita con `lib/home-vuelo.ts` y costos recalculados;
  evidencia de "composición iniciada" para E-muere; controles RED; TTL de
  36 h enunciado como lo que garantiza. **Decisión del dueño aprobada:** se
  sirve el Home anterior durante la reconstrucción. Sigue sin verificarse
  `EVAL` contra la base real (credenciales sólo en Vercel): es la condición de
  entrada a la implementación. Informe: [`medidas/2026-09-13-etapa2-diseno-turno-ultimo-bueno.md`](medidas/2026-09-13-etapa2-diseno-turno-ultimo-bueno.md).

- **Revisión independiente de Codex, 10/09:** los riesgos centrales del informe
  de capacidad tienen sustento, pero **el plan requiere correcciones antes de
  implementar**. [Dictamen y evidencia](medidas/2026-09-10-revision-capacidad-codex.md).
  Pruebas locales sin red: 13 filas publicadas → 10 claves; 100 MISS concurrentes
  → 100 productores en el resolver real; una escritura fallida hace rechazar su
  retorno; SDK Redis instalado → seis intentos ante fallo de transporte simulado.
  No son pruebas HTTP ni mediciones de capacidad de Producción. Corregir además
  la equivalencia errónea `N,D,M` → `n`, la comparación de simultaneidad con req/s,
  el contrato del bloqueo y la promesa de deducir cuentas/tráfico real de dobles.
  Las etapas del informe son propuestas pendientes, no un plan aprobado.

- **Comprobado localmente el 09/09:** rama `main`; HEAD y referencia local
  `origin/main` coinciden en el hito `fd2cd23`, merge del contenedor Android y
  CORS. No se hizo fetch ni se comprobó el deployment en Vercel en esta sesión.
- **Informado por el dueño el 09/09:** el 08/09 agregó 20 testers en Google Play
  y generó el enlace; desde el 09/09 están usando la aplicación. No afirmó que
  los 20 hayan aceptado o instalado: esos conteos siguen por verificar.
- **Heredado del chat anterior:** web/PWA en producción; Android firmado en
  prueba cerrada Alpha, versión 1 (1.0.0), Argentina, publicación gestionada
  desactivada, ficha y declaraciones principales completadas. No se abrió Play
  Console en esta sesión. Esto NO acredita publicación pública en Producción.
- **Comprobado en código el 09/09:** `app/layout.tsx` excluye Analytics y Speed
  Insights del build nativo mediante `!ES_NATIVO`. Web/PWA conservan medición;
  Android no registra visitantes/pantallas por esta integración. Sus llamadas a
  las API remotas sí generan actividad de servidor; no equivalen a usuarios.

- **Revisión independiente del 10/09:** la auditoría de capacidad fue revisada
  por Codex sobre el mismo hito
  ([`medidas/2026-09-10-revision-capacidad-codex.md`](medidas/2026-09-10-revision-capacidad-codex.md)).
  Sostuvo los riesgos centrales y encontró **siete correcciones**, dos de ellas en
  criterios de aceptación que, como estaban escritos, habrían roto el producto.
  **Las siete se verificaron por cuenta propia y están incorporadas** al informe y
  a los issues; el detalle de qué cambió está en la §12 del informe.
- **Comprobado el 10/09, auditoría de capacidad y tráfico:** `git fetch`;
  `main` = `origin/main` = `fd2cd23`. Se auditó ese árbol leyendo el código, con
  evidencia por archivo y línea, y se ejecutó el constructor de claves real. **No
  se corrió ninguna prueba de carga**, ni contra Producción ni contra nada, y no
  se cambió una sola línea de código. Informe completo:
  [`medidas/2026-09-10-capacidad-trafico.md`](medidas/2026-09-10-capacidad-trafico.md).
- **Corrección de un informe propio (10/09):** el de la release del 07/09 (§20.e
  de `superpowers/plans/2026-09-05-etapa3-android-publicable.md`) afirma que en
  el contenedor Analytics y Speed Insights dejan "dos pedidos muertos al
  arrancar". **Es incorrecto**: `app/layout.tsx:133` los gatea con `!ES_NATIVO` y
  no se montan. Sigue siendo cierto que las librerías quedan adentro del bundle.

### Antecedentes del #22 — histórico, NO es el estado actual

Lo que se sabía y se decía el 10/09, antes del arreglo. El estado vigente es
el primer punto de este bloque; esto se conserva sólo para no perder el rastro
de cómo se llegó.

- **Auditoría de `fb89b45`, 10/09.** No aprobado para merge entonces.
  [Dictamen](medidas/2026-09-10-auditoria-fb89b45.md). Los 18 tests pasan, pero
  una prueba independiente confirma formulario habilitado con token malformado
  y sesión anterior. Además la identidad se compara después de escribir, sin
  ligar la mutación a la recuperación esperada. El rechazo del enlace recién
  recibido seguía sin explicación ni prueba completa con correo real. (Los
  cuatro puntos se resolvieron en `0831b86`; ver el informe.)

- **Evidencia del 10/09:** captura de redirección con `access_denied` /
  `otp_expired` (“Email link is invalid or has expired”). El dueño aclara que
  copió el enlace recién recibido directamente del correo a incógnito, sin
  abrirlo antes. Supabase rechazó la verificación; la causa de invalidación es
  lo único que sigue abierto. No atribuirlo a reutilización manual ni a
  antigüedad sin evidencia.

- **Captura del incidente:** Nueva contraseña mostraba “El enlace no es
  válido o ya venció”. El código de entonces usaba ese texto ante ausencia de
  usuario después de inicializar; no acreditaba expiración. (Corregido: la
  página nueva muestra el motivo que Supabase pone en la URL.)

- **Ampliación del incidente por el dueño:** la contraseña nueva tampoco
  permite ingresar en la web en incógnito; revisó una tabla común de Supabase,
  no Authentication, y no recuerda el correo del formulario. El síntoma no está
  limitado a Android. Quedaba por comprobar la identidad de la sesión que
  recibió el cambio y el error exacto del ingreso.

- **Reporte original del dueño (10/09), que entonces desplazó al resto del
  trabajo.** Informó que pedir recuperación desde Play envía el correo, el enlace
  abre la web y la contraseña nueva luego no permite ingresar en Android.
  No estaba comprobado que la escritura hubiera fallado. No confundir la falta
  de App Links con fallo de guardado.

## Estado de producto e integración

Android ya está integrado en `main`; no queda pendiente mergear Capacitor ni
agregar su CORS al código principal. Según el traspaso, la release consume
`https://app.yump.ar`, usa paquete web local, firma de carga, guards de release,
íconos propios, navegación/Atrás y compartir nativos, sesión persistente y
recordatorios locales de estreno a las 10:00 locales, probados en teléfono.
La PWA y su service worker se mantienen separados del contenedor.

El traspaso da por integrados Top manual, Próximamente, ruleta rediseñada,
evidencia oficial y últimos cambios de PWA. **El dueño confirma el 09/09 que ya usa el dashboard `/admin/top` para cargar películas y series de las plataformas del Top.** Su implementación y conexión al ranking se comprobaron en código. No volver a listar la carga manual ni la reparación del cron como pendientes del ranking. Esta sesión no inspeccionó la base; no ejecutar migraciones basándose en notas antiguas.

iOS no está implementado según el traspaso: sin proyecto, TestFlight ni pruebas
en iPhone. La decisión de iniciarlo queda para después de evaluar Android.

## Próximo trabajo, en orden

1. **Prueba cerrada:** comprobar adhesiones efectivas y fecha que contabiliza
   Play Console; verificar instalaciones y registrar feedback, dispositivos,
   recorridos probados y correcciones. No calcular una fecha de acceso a
   Producción sólo desde la creación de la lista o el primer uso informado.
   El traspaso cita 12 testers durante 14 días para ciertas cuentas personales:
   comprobar la aplicabilidad y exigencia vigente en la consola antes de actuar.
2. **Operación de Play:** revisar informes previos al lanzamiento, fallos/ANR,
   respuesta de anuncios/ID de publicidad y respaldo seguro de firma. Para un
   nuevo AAB, incrementar `versionCode`. Solicitar acceso a Producción cuando la
   consola lo habilite; lanzamiento público todavía pendiente.
3. **Capacidad antes de difusión masiva — auditado y revisado el 10/09, ver más
   abajo.** Sigue sin existir un máximo medido de usuarios simultáneos, y ahora
   está escrito por qué no se puede deducir **ni siquiera con un banco aislado**.
   Cinco problemas quedaron **comprobados** y registrados como issues **#17 a
   #21**. El plan tiene **siete etapas** y el orden es:

   | Etapa | Qué | Issue | ¿Depende de medir? |
   |---|---|---|---|
   | **PREVIA** ✅ hecha y desplegada el 11/09 | El 500 por escritura fallida en Redis | #21 | **No** |
   | 0 | Poder medir — **mergeada (`1073c70`) y desplegada (`9a4b7aa`); las líneas nuevas se ven en `vercel logs`; sin serie histórica** | #20 | — |
   | 1 | Canonizar entradas + single-flight **acotado al Home** — ✅ **mergeada (`e4bf75a`) y desplegada (`f76d9ca`) el 12/09; #18 resuelto, #17 sigue por la Etapa 2** | #18, #17 | Sí |
   | 2 | Turno distribuido + último Home bueno — **diseño pendiente de auditoría (`diseno/etapa2-turno-ultimo-bueno`); no implementada** | #17 | Sí |
   | 3 | Resistencia frente a TMDB | #19 | Sí |
   | 4 | CDN + límite por ruta | — | Sí |
   | 5 | Observabilidad permanente | #20 | — |

   La Etapa PREVIA va primera porque es la única que **no depende de ninguna
   medición**: es un `catch` que falta y la decisión ya está tomada — *si el
   payload se produjo correctamente y sólo falla la escritura en Redis, se
   entrega al usuario y se registra el error*.

   El single-flight de la Etapa 1 **se aplica sólo a `lib/home.ts`**, no a
   `cached`/`cachedIf`: los contextos de degradación son `AsyncLocalStorage` por
   request, y compartir en profundidad haría que el segundo guardara un payload
   degradado como sano. La integración global no está prohibida, está **sin
   demostrar** (inventario y requisitos en la Etapa 1 del informe).

   `feat/dia-rotacion` está divergida y **su arreglo de `fresh=1` corrige un
   agujero que ella misma abre y que `main` no tiene**: se reusa el diseño, no se
   mergea.
4. **Enlaces Android:** `assetlinks.json`, App Links y retorno desde correos de
   confirmación/recuperación pendientes según el traspaso.
5. **Analíticas Android:** pendientes de decidir e implementar. Analytics y
   Speed Insights **no se montan en el contenedor por decisión**
   (`app/layout.tsx:133`, con la medición del 06/09 escrita al lado), así que el
   uso de los testers nativos no se puede contar ni seguir. Lo único que deja
   rastro son las peticiones a la API, y hoy no se pueden separar por origen.
   Entra dentro del issue #20.
6. **Pendientes históricos:** semántica y actualización de
   Próximamente, fechas UTC restantes, piso de cantidad de votos, rendimiento
   móvil, pruebas reales offline, contraste y avatar. Consultar `ISSUES.md` y
   contrastar con código antes de declarar algo resuelto o proponer arreglos.
7. Con resultados reales de Android, decidir iOS. Vigilar costos y consumo de
   Vercel, Upstash y Supabase y definir alertas operativas.

## Auditoría de capacidad y tráfico — 10/09/2026

Encargo del dueño: diagnóstico comprobado y plan priorizado, sin implementar
cambios, con Android en prueba cerrada y antes de una difusión importante.
Detalle completo en
[`medidas/2026-09-10-capacidad-trafico.md`](medidas/2026-09-10-capacidad-trafico.md).

**Revisada de forma independiente el mismo día** (ver el bloque de evidencia
arriba). Lo que sigue ya incorpora las siete correcciones.

### Lo comprobado — issues #17 a #21 (antecedente del 10/09; #21 resuelto el 11/09, #18 el 12/09)

| # | Hallazgo | Cómo se comprobó |
|---|---|---|
| #17 | *(10/09, antes de la Etapa 1)* Ninguna unión de peticiones en vuelo ni bloqueo distribuido: N visitas al Home frío = N composiciones. Y no hay "último Home bueno": al vencer el TTL de 6 h alguien paga el rearmado completo. **Desde el 12/09 hay unión por proceso (single-flight del Home); sigue faltando la coordinación entre instancias y el último bueno — Etapa 2** | Lectura: `lib/cache.ts:298-304`, `lib/reparar-y-cachear.ts:39-44`. El propio repositorio ya lo dice en `lib/single-flight.ts:9-11` |
| #18 | *(10/09)* `/api/home` no canoniza sus parámetros. **19 filas, 17 entradas distintas, 14 claves distintas**, con el arnés y la salida íntegra publicados. **Resuelto y desplegado el 12/09** | **Ejecutado** con `claveHome` real |
| #19 | Una caída de TMDB se realimenta: el cliente **de TMDB** no reintenta ni lee `Retry-After`, el degradado no se guarda, y cada visita rearma. El techo de peticiones en vuelo es por proceso, o sea 24 × instancias | Lectura: `lib/tmdb.ts:38-40` y `56-67`, `lib/home.ts:706` |
| #20 | *(10/09)* No hay contador de llamadas a TMDB ni a Supabase, ni de composiciones; lo que se llama `requests` mezcla tres unidades; `vercel logs` no devolvió nada el 10/09. **Los contadores existen desde la Etapa 0 (11/09); sigue abierto por la observabilidad histórica** | Lectura + ejecución |
| **#21** | **Si falla la escritura en Redis, un Home BUENO terminaba en 500** — mientras que uno degradado se servía sin problema, porque nunca intenta escribir. **Resuelto y desplegado el 11/09** (Etapa PREVIA) | **Ejecutado** sobre el resolver real; el arreglo, probado con el resolver real y guards |

**#21 era el más chico y el más urgente**: un `catch` que faltaba y no dependía
de medir nada. Por eso fue la **Etapa PREVIA** del plan, anterior a la Etapa 0,
con la decisión aprobada por el dueño: *se entrega el payload y se registra el
error*. **Hecha y desplegada el 11/09.** Las Etapas **PREVIA, 0 y 1** están
desplegadas (ver el estado vigente arriba); lo que sigue es la **Etapa 2**:
turno distribuido y último Home bueno.

### Lo que se revisó y **no** es un problema

- El **orden** de `providers` ya converge: `n,d,m`, `d,m,n` y `n,,d,m` son la
  misma clave. La afirmación contraria del traspaso del 09/09 es incorrecta.
- Un código de plataforma inexistente **no** dispara un `discover` sin filtro:
  los tres caminos de pools cortan. Hipótesis plausible, verificada y descartada.
- Las **lecturas** de Redis sí se unen entre peticiones concurrentes, y además
  **el cliente de Redis sí reintenta** fallos de transporte (6 intentos). La
  primera versión del informe decía lo contrario y era falso.
- La **lectura** de Redis está bien cubierta ante fallos. La escritura, desde el
  11/09, también (#21, Etapa PREVIA).
- `page` está normalizada en las rutas paginadas.
- `Vary: Origin` ya se emite siempre: es la condición previa de cualquier caché
  compartida, y ya está cumplida. **No es autenticación ni sustituye un límite de
  abuso.**

### 🔴 Lo que un banco aislado NO puede responder

**Corregido el 10/09.** La primera versión de este bloque decía que todas las
incógnitas se responden con la Etapa 0 y la prueba de carga. **No es cierto**, y
era la promesa más engañosa del informe: un banco con dobles verifica
**comportamiento**, no revela hechos de Producción.

Son cuatro fuentes distintas y no se sustituyen:

| Fuente | Da |
|---|---|
| Pruebas de comportamiento (banco) | Que el sistema hace lo que debe |
| Capacidad bajo condiciones declaradas (banco) | Un número comparable **contra sí mismo**, útil para el antes/después |
| **Observación pasiva de Producción** | Tasa de aciertos real, tráfico real, fragmentación real, latencia real, escalado real |
| **Consulta de las cuentas** | Los límites verdaderos de TMDB, Upstash, Supabase y Vercel |

**Un máximo de usuarios simultáneos real NO sale del banco.** Sale de observar
Producción, o de una prueba controlada contra Producción que hoy está prohibida.

Sigue sin poder afirmarse: cuántos usuarios simultáneos aguanta; cuánto cuesta
hoy un Home frío; la tasa de aciertos en Producción; cuántas instancias levanta
Vercel; la latencia media real; si los 20 testers generan tráfico; y los límites
reales de las cuatro cuentas.

**Las cifras que circulan —150 ms cacheado, 5-10 s en frío, más de 600 llamadas a
TMDB— son históricas y no se reprodujeron.** No usarlas como estado actual.

⚠️ **Y una advertencia sobre el alcance:** esta auditoría leyó el **repositorio**.
No puede afirmar que no exista un límite de tasa, una regla de firewall o un
monitor configurados en un panel, fuera del código.

### Único dato de infraestructura tomado hoy

`dbsize` de Redis leído por `/api/health`: **1259 claves el 07/09** y **2382 el
10/09**. `dbsize` no desglosa por familia y la mayoría de las claves son `card:`
y `pv3:` por título: **no usar este número como evidencia de fragmentación**.

## Corrección del pendiente del Top — 09/09/2026

El dueño confirma que el problema del Top se resolvió con el dashboard manual.
Comprobado en `app/admin/top/page.tsx`: doce bloques, películas y series para
Netflix, Disney+, Max, Prime Video, Apple TV+ y Crunchyroll; edición de diez
posiciones, fecha de captura, revisión y publicación por bloque. `lib/top.ts`
consume las publicaciones con `source: "manual"` cuando están los doce bloques
iniciales. No se comprobó el contenido actual de la API pública en esta sesión.

El issue #13 se retiró de abiertos y se conservó su
[historia y cierre](traspasos/2026-09-09-cierre-top-automatico.md).
La lista del traspaso que pedía “resolver el cron y agregar observabilidad de
frescura” queda superada como pendiente del ranking por esta confirmación.
El cron sigue programado en `vercel.json` y su evidencia se sigue consultando
para disponibilidad (`lib/enrich.ts`); no se afirma que esté reparado, eliminado
ni que se hayan implementado alertas automáticas de frescura. Su mera presencia
no justifica reabrir el problema del ranking ya resuelto por carga manual.

## Registro de la prueba cerrada

| Fecha | Hecho | Fuente | Falta comprobar |
|---|---|---|---|
| 08/09/2026 | 20 testers agregados y enlace generado | Dueño, conversación del 09/09 | Adhesiones efectivas en consola |
| 09/09/2026 | Comenzaron a usar la app | Dueño, conversación del 09/09 | Cantidad, dispositivos, recorridos y feedback |

Todavía no hay observaciones concretas de testers registradas en esta sesión.
Agregar resultados con fecha y procedencia, sin publicar sus correos personales.

## Evidencia histórica y procedimientos

- [Traspaso completo recibido el 09/09](traspasos/2026-09-09-integral.md): copia
  del relato del chat anterior, con estado de Play, declaraciones, pruebas,
  riesgos, propuestas de capacidad y pendientes. **Es una foto histórica**, no
  reemplaza este estado ni acredita verificaciones actuales. Sus cifras de
  rendimiento y afirmaciones externas no se revalidaron en esta sesión.
- [Implementación Android, etapas 3–5](superpowers/plans/2026-09-05-etapa3-android-publicable.md):
  decisiones, procedimiento, verificaciones y release; leer junto a este estado.
- [Diseño de Capacitor](CAPACITOR.md), [auditoría de Play](PLAY-STORE.md),
  [PWA](PWA.md) y [medición/mantenimiento](MANTENIMIENTO.md).

## Archivos del dueño y alcance de la sesión

Sin seguimiento al comprobar Git: `avatares/`, `prompts/noticias-filtro.md`,
`prompts/noticias-redaccion.md`, `supabase/migrations/004_news.sql`.
Preservarlos; no usar `git add -A`. El estado real de la migración de noticias
no se comprobó en la base. No guardar secretos de firma en Git.

Esta sesión actualiza documentación por pedido explícito del dueño. No modifica
código, ejecuta migraciones, genera AAB, despliega ni cambia paneles. Los cambios
documentales quedan locales hasta que se revisen y se incorporen al repositorio;
no asumir que ya están disponibles en otros clones o IAs remotas.

## Antecedentes anteriores al 09/09/2026 — no usar como estado vigente

Lo que sigue conserva mediciones y decisiones históricas. Las frases “hoy”,
“sin mergear”, “no tiene CORS” o “pendiente de firma” describen el momento en
que se escribieron y quedan reemplazadas, para el estado actual, por el bloque
superior. No ejecutar tareas pendientes de estos antecedentes sin verificarlas.

### Cabecera histórica (agosto de 2026)

> Documento de traspaso. Se actualiza al cerrar una sesión de trabajo larga.
> **Última actualización: 27 de agosto de 2026.**
>
> **ESTE ES EL DOCUMENTO CANÓNICO DEL ESTADO.** Qué está desplegado, qué rama
> está viva y qué queda abierto se escribe **acá y en ningún otro lado**.
> `docs/TRASPASO.md` cuenta el detalle de una tanda y apunta acá para el estado;
> `CLAUDE.md` guarda las decisiones de arquitectura, que no cambian con cada
> deploy. Dos documentos con el mismo SHA es un SHA viejo esperando.

`CLAUDE.md` se carga solo en cada conversación y ya contiene las decisiones de
arquitectura, las limitaciones de TMDB y las reglas de cada feature. **Este
archivo no las repite**: acá va el estado del momento y lo que queda pendiente.

---

## Estado de despliegue

```
origin/main                          ← DESPLEGADO en producción (app.yump.ar)
                                       avatares: merge 89ccb73 · legal: merge 27669c0
feat/avatares-propios                ← MERGEADA el 27/08 con --no-ff. Se puede borrar
feat/legal-play-web                  ← MERGEADA el 28/08 con --no-ff. Se puede borrar
feat/ejes-rieles-genero   1912f56   ← pusheada como respaldo, SIN mergear
feat/dia-rotacion                    ← sin mergear y MUY atrás de main; hay que rebasarla
```

**A propósito NO se escribe acá el SHA de la punta.** Un commit no puede nombrar
su propio hash, así que el commit que actualiza esta tabla la desactualiza; ya
pasó dos veces seguidas. Se mira con `git log -1 origin/main`. Lo que sí se
escribe es el SHA de un hito ya cerrado, como el merge de arriba.

**Lo que hay desplegado hoy:**

- las tres tandas del **idioma** (catálogo en `es-MX` con respaldo a `es-ES`);
- los tres arreglos del **Top 10 de Netflix** — la plataforma garantizada por la
  fuente, la consulta acotada por subtítulo y la ficha usando la misma evidencia;
- los **31 avatares propios** (merge `89ccb73`, 27/08), con DiceBear fuera de la
  app entera;
- la **tanda web/legal** previa al empaquetado Android (merge `27669c0`, 28/08).

### El merge web/legal — 28/08

Entró con `--no-ff` (merge `27669c0`). Lo que agrega:

- la sección **"Sobre Yump"**, con los enlaces a las cuatro páginas de
  `yump.ar`, la atribución de TMDB —logo oficial servido local y texto literal
  de la sección 3 de sus términos—, la autoría de las ilustraciones en tres
  grupos y el aviso de agregador independiente;
- **se consulta SIN sesión**: va en la pestaña Cuenta además de en Perfil,
  porque `/cuenta/perfil` redirige al login cuando no hay usuario;
- los **nombres de plataforma en texto neutro**, en lugar de los wordmarks
  imitados. Fuera también los logos reales de TMDB que servía el onboarding y
  los colores de marca de los puntitos de la barra.

**Los códigos internos, los filtros y el comportamiento no cambiaron**: fue un
cambio visual. Y **el `OnboardingGate` no se tocó**: la baja de cuenta se
inicia por correo a `privacidad@yump.ar`, que no depende de la app.

Las cuatro páginas de `yump.ar` fueron auditadas en vivo el 28/08 y están
completas. El detalle, en `docs/PLAY-STORE.md` §0.b.

### El merge de los avatares — 27/08

Entró con `--no-ff`, así que el merge commit está y se puede revertir de una
pieza. Verificado antes de pushear: 565 tests, `tsc` limpio, `next build`
compila, barrido de DiceBear en cero, guard del SQL OK, `SC_CACHE_VERSION` en
`v7`. Y después, contra producción: los chunks del home traen **cero** rastros de
DiceBear y `/avatars/avatar-pocho.webp` responde 200 `image/webp`.

**Entraron también los tres commits de documentación** que esperaban en `main`
local: la auditoría legal de Google Play (`docs/PLAY-STORE.md`). Decisión
explícita del dueño — no tocan el runtime y hacen falta para la etapa siguiente.

**No se ejecutó SQL, no se tocó Supabase y las columnas de `profiles` no
cambiaron.** El contrato de persistencia está en `docs/AVATARES.md`.

**Lo que queda de esa línea**, en orden:

1. El dueño elige su avatar definitivo con la cuenta principal. Ya no hay
   ninguna precaución que tomar.
2. **Issue #14** —el parpadeo del avatar al cargar— **POSTERGADO** por decisión
   del dueño (29/08). No es una regresión: el código anterior hacía lo mismo, y
   **no bloquea el prototipo ni el empaquetado con Capacitor**. Antes acá decía
   "antes del empaquetado nativo"; ese orden ya no rige.
3. Borrar `feat/avatares-propios` de los dos lados, con borrado seguro
   (`git branch -d`, sin forzar), cuando el dueño lo confirme.

`feat/idioma-tanda-2` y `feat/idioma-tanda-3` ya no existen: se borraron de los
dos lados con borrado seguro una vez verificada la producción. **Las tres tandas
del idioma están cerradas** — el traspaso completo de esa línea de trabajo vive
en `docs/TRASPASO-IDIOMA.md`.

**Este bloque se actualiza en el mismo commit que mueve `main`.** Quedó tres
semanas diciendo `ab4e189` mientras `main` iba por `5fc0c2e`, y un SHA viejo acá
es peor que ninguno: se lee como "esto es lo que hay desplegado".

`feat/ejes-rieles-genero` está en el remoto solo para que no viva en una sola
máquina. **No está mergeada**: espera la prueba a mano del dueño, y tiene un
criterio de aceptación fallado (ver más abajo).

`feat/hero-universo` está mergeada (probada a mano por el dueño) y **todo lo que
estaba pendiente de subir se pusheó el 16/08**: la rotación de ejes de los
carruseles de audiencia, el cacheo de `publishedIds` y el hero ampliado con su
arreglo de ejes.

**Verificar que Vercel haya tomado el push.** Ya pasó tres veces que no lo
detecta; se destraba con un commit vacío, no con Redeploy (ver la nota en la
memoria del proyecto).

---

## El Top 10 de Netflix — **el código, cerrado y desplegado; el cron, abierto**

**Estado al 27/08.** Se cerraron y desplegaron en `1e14f5c` tres arreglos de
código, y queda abierto el problema del cron (**issue #13**).

**Lo cerrado, ya en producción:**

- **La plataforma la garantiza la FUENTE, no TMDB** (`lib/top-plataformas.ts`).
  "Moria" entró **#1 del top oficial pintada en gris**, porque TMDB no tenía
  proveedores para ella en ninguna región. Esos veinte títulos los publicó
  Netflix como lo más visto en Netflix Argentina: eso es un dato, no una
  deducción. Sólo se aplica cuando no sabemos nada.
- **Consulta acotada cuando el título trae subtítulo** (`lib/netflix-resolver.ts`).
  "Operation Safed Sagar: The Highest Air Force Mission" daba cero resultados
  completo y uno solo reducido a la parte anterior a los dos puntos. Exige un
  único resultado, mira primero el proveedor y marca todo con `needs_review`.
- **La ficha usa la misma evidencia**, con `needs_review = false` y mirando toda
  la ventana de 14 días y no la última semana — atada a la semana más nueva, la
  evidencia se evaporaba con el cron siguiente.

**Lo que sigue abierto (issue #13):** el cron **disparó el 25/08 a las 12:58
UTC**, día correcto y dentro de su ventana, así que la afirmación de más abajo de
que "no disparó nunca" quedó desactualizada — pero **no hay explicación de por
qué se salteó el martes 18/08**, y hay que mirar los logs de Vercel. La
fragilidad de fondo tampoco se movió: **la guarda mide antigüedad desde la fecha
de la semana, no desde la ingesta**, así que una corrida perdida vuelve a
degradar el bloque a "Lo más popular ahora".

### Cómo se detectó, en su momento

**Detectado el 2026-08-25 por el dueño**, mirando la pantalla: el bloque de
Netflix mostraba "Lo más popular ahora" donde antes decía "dato oficial".

**El código hizo lo correcto.** `latestWeekRows()` descarta la semana guardada si
tiene más de 14 días, para no sostener datos viejos bajo el sello de oficiales.
La última ingesta es la semana `2026-08-09`, escrita el 12/08: al detectarlo
llevaba **16,4 días**, o sea que cruzó la línea unos dos días antes — que es
exactamente lo que reportó el dueño ("hasta hace 2 días estaba bien").

**La causa raíz es otra y es peor**: las dos escrituras que existían en la tabla
al 25/08 eran de un **domingo** 17:27 UTC y un **miércoles** 18:10 UTC, contra un
cron declarado `0 12 * * 2` (martes al mediodía). Ninguna cae en su horario, así
que las dos ingestas fueron a mano. Lo que cambió no fue el comportamiento, fue
que se agotó el colchón.

> **Corregido el 27/08.** Acá decía "el cron de Vercel no disparó nunca". Ya no
> es cierto: **disparó el 25/08 a las 12:58 UTC**, en su día y su ventana. Lo que
> sigue sin explicación es el martes 18/08. La conclusión que sí se sostiene es
> la otra —dos ingestas a mano y ninguna del cron hasta esa fecha—, y por eso la
> corrección va acá y no borrando el párrafo.

**No tiene ninguna relación con el cambio de idioma.** `latestWeekRows` no toca
claves de caché ni idioma; la coincidencia de fechas es casual.

**Dos acciones, separadas:**

1. ~~**Recuperar la semana que falta**~~ — el cron del 25/08 escribió una semana
   nueva. Si el bloque volviera a degradar, la salida sigue siendo una llamada
   autenticada a `/api/cron/netflix-top10` con el `CRON_SECRET`: un upsert
   idempotente de 20 filas. **Escribe en la base, así que espera el OK del
   dueño.**
2. **Arreglar el cron — PENDIENTE, es el issue #13.** Hay que mirar
   **Vercel → el proyecto → Settings → Cron Jobs**, donde se ven sus últimas
   ejecuciones, y entender por qué se salteó el 18/08 habiendo disparado el
   25/08. Sin esto, el bloque vuelve a degradar cada vez que se pierda una
   corrida.

**Lo que se descartó en la misma revisión**, para no volver a levantarlo: que
Prime Video y Max compartan títulos **no es un bug**. Verificado contra TMDB, hay
películas con flatrate real en las dos plataformas en Argentina, y el mapeo no
infla (los ids `9` y `384` aportan 0 títulos en AR). Los seis bloques del Top
devuelven 10 lugares, `fallos: 0`, `degradado: false`.

**La lección que sobrevive al cron**: una guarda que degrada en silencio esconde
la falla que la disparó. El bloque venía degradando bien desde hacía dos días y
nada avisaba que hacía dos semanas que no entraba un dato.

---

## Qué se hizo en esta sesión

### Rendimiento y cache

| Cambio | Resultado medido |
|---|---|
| **CLS** — reserva de espacio, `font-display: optional`, ancho fijo en el navbar | 0.0857 → **0.0036** |
| **MGET** — las lecturas de Redis se agrupan en lotes | Lecturas de un rearmado: 391 comandos → **19** |
| **Pool cache** — `discover` cacheado por plataforma individual | Segundo usuario con plataformas que se solapan: 26 llamadas → **8** |
| **`publishedIds`** cacheado | 16 viajes a Supabase por rearmado → **1** |

### Variedad del catálogo

- **Tope de 2 por saga en todo el Home.** Sci-fi mostraba 7 Spider-Man; ahora
  ninguno se repite más de dos veces en todo el Home.
- **Rotación de ejes en los carruseles de audiencia.** Cinco ejes (`pop`, `top`,
  `nuevo`, `taquilla`, `hondo`) rotan con la semilla del día. Cobertura semanal:
  **20 títulos fijos → 198 y 166**. Solapamiento día a día: 100% → 0-21%.
  La rotación es **invisible**: los títulos de los rieles no cambian nunca.

### Correcciones

- **`dailySeed()` en hora argentina.** Todo lo que rota por día cambiaba a las
  21:00 locales. Tiene test (`lib/fecha.test.ts`, `npm test`).
- **"Recordarme"** ya no agenda la fecha de cine en películas: usa la digital
  argentina y devuelve 404 si no existe. El `.ics` de series usaba
  `first_air_date` —el estreno original, de años atrás— y ahora usa
  `next_episode_to_air`. El 404 se avisa en la interfaz en vez de descargar el
  JSON del error.
- **"Próximamente"** filtra lo vencido al leer, sin depender de que el sync esté
  fresco.
- **Contexto al volver de una ficha**: el scroll vertical se restauraba a 930 en
  vez de 1800; ahora vuelve entero, y cada riel recupera su scroll horizontal.
  **Corregido el 18/08**: esa frase era falsa para DOS rieles. `useTrackScroll`
  vivía solo dentro de `Shelf`, y "6 para hoy" y "Próximamente" tienen su propio
  `.track` sin pasar por ahí — los dos volvían al principio. Ya están
  conectados, y el hero además recuerda el chip y la tanda: volver de una ficha
  te devuelve al mismo conjunto, no solo a la misma posición sobre otro
  contenido.
- **Deep links**: "Volver" en una ficha compartida ya no saca al usuario de la
  app.

---

## El hero — **cerrado y en producción**

Mergeado el 16/08 tras la prueba a mano del dueño. Código en `tandaAncha`
(`lib/enrich.ts`); la decisión de arquitectura está en `CLAUDE.md`. Todos los
criterios acordados se cumplen:

| | Objetivo | Medido |
|---|---|---|
| Clics limpios de "Otras" antes de repetir | ≥ 12 | **> 40** (5 antes) |
| Cobertura semanal del hero | ≥ 100 | **236** (40 antes) |
| Tiempo de respuesta de "Otras" | no empeora | **mejora** (ver abajo) |
| Payload del Home vs `offset=0` | idénticos | **idénticos** ✔ |
| Chips curados | idénticos a la foto | **`navidad` 18/18** ✔ |
| Ningún chip vacío en 7 días | 0 vacíos de 112 | **0** ✔ |

El último criterio lo agregó el dueño **después** de probar la rama, porque la
primera versión rompía "Contacto extraterrestre" y ninguna de las otras métricas
lo veía: todas miran el hero base o promedian los 16 chips. Ver
`MANTENIMIENTO.md` 8.d, que es la lección general.

Reproducible con:

```bash
node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
     scripts/medir-hero.mjs informe 2026-08-15
```

Corre las mismas métricas con el camino viejo y el nuevo en un solo proceso
(`HERO_ANCHO=0` es el interruptor). Fotos en `docs/medidas/`.

**Sobre el tiempo**: el camino viejo pedía discover a TMDB **sin cachear** en
cada clic (156-168 ms); el nuevo lee pools cacheados (0-1 ms en local). El número
local exagera la mejora porque acá el cache es en memoria y en Vercel es Upstash:
lo sólido es que dejó de haber una llamada a TMDB por clic, no el "0 ms".

**La condición 2 del dueño** (no mergear sin probarlo a mano) se cumplió y fue lo
que encontró el bug: ninguna de las métricas de arriba veía que "Contacto
extraterrestre" no mostrara nada. Eso pasó a ser el sexto criterio.

**Sobre la condición 1** (comparar contra la foto y no contra una corrida nueva):
se cumplió, y de paso quedó claro por qué la foto igual no es reproducible al
100%: TMDB reordena su catálogo todos los días. Corriendo el **código viejo** con
la semilla del 15/08 un día después, la base ya daba 90% del mismo conjunto pero
solo 31% en la misma posición. Eso es la deriva, no una rotura. Por eso el
informe reporta *posición* y *conjunto* por separado, y por eso quedaron tres
chips de control en el camino viejo (`navidad`, `reales`, `supervivencia`): si
alguno se moviera, el cambio estaría tocando lo que no debe. Detalle en
`docs/MANTENIMIENTO.md` 8.c.

### Cómo volver a probarlo a mano

```bash
npm run dev
```

Sin `next build` en paralelo (corrompe `.next`; si pasa, borrar la carpeta).
Después, en el Home:

1. **"6 para hoy"** — tocar "Mostrame otras" diez o doce veces seguidas y ver que
   no se repita nada y que lo que sale siga siendo mirable.
2. **"Mágica navidad"** — es el chip que no se tocó: tiene que traer películas de
   navidad, igual que antes.
3. **"Historias reales" y "Supervivencia extrema"** — tampoco se tocaron.
4. **El resto de los chips** — acá sí cambia el contenido, y es el punto a
   juzgar: el eje rota por día, así que un día "Palomitas" sale por taquilla y
   otro por estrenos. Vale la pena mirarlo más de un día.
5. **"Contacto extraterrestre", "Odisea espacial" y "Fuego cruzado"** — son los
   tres chips angostos que se vaciaban en un día de `hondo`. Los días en que
   caen se ven en la consola del server: `[ejes] ... se cae a "pop"`.
6. **El mensaje de lista vacía** — "Activá alguna" ahora aparece solo si no hay
   ninguna plataforma elegida. Se comprueba vaciando `sc:platforms` en el
   almacenamiento local del navegador y recargando.

Para ver un día distinto sin esperar, `YUMP_FECHA=2026-08-20 npm run dev`.

Si algo se ve mal y hay que descartar que sea esto: `HERO_ANCHO=0 npm run dev`
devuelve el hero al camino viejo sin tocar código.

---

## Rieles de género con rotación de ejes — **cerrado, con una falla ACEPTADA**

Rama `feat/ejes-rieles-genero` (`1912f56`). Cierra el paso 3: era la última
superficie del Home que pedía siempre popularidad páginas 1-3.

| Criterio | Resultado |
|---|---|
| Cobertura semanal ≥ hoy | ✅ 5 de 6 suben; `scifi/tv` plano (22 títulos en total, issue #10) |
| Solapamiento día a día baja | ✅ 13%→2%, 10%→3%, 12%→5%, 9%→2%, 19%→2% |
| Piso de 15 ítems por riel | ✅ mínimo 20/día (19 un día en scifi/series) |
| Ningún riel vacío en 7 días, películas y series | ✅ 0 vacíos en los tres bloques |
| Kill switch | ✅ `EJES_RIELES=0` (se usó para medir todo el "antes") |
| TMDB en frío en día de `hondo`/`nuevo` | ✅ +9 pools, sin diferencia de tiempo |
| **Calidad: no empeorar el % bajo 6.0 por riel** | ❌ **FALLA, aceptada** (ver abajo) |

Cobertura (base): accion 99→**120**, terror 102→**126**, drama 96→**121**,
comedia 98→**120**, documental 72→**110**, scifi 22→22.

### El criterio de calidad FALLÓ y se aceptó igual — no pasó

Promediado sobre los 7 días, estado base:

| riel | <6.0 antes→después | <5.0 antes→después |
|---|---|---|
| comedia | 4% → **12%** | 0% → 1% |
| terror | 24% → **31%** | 1% → 2% |
| accion | 4% → **8%** | 0% → 1% |
| drama | 0% → **1%** | 0% → 1% |
| documental | 5% → 3% | 4% → 2% |
| scifi | 5% → 5% | 0% → 0% |

**NO ESTÁ CUMPLIDO. Se aceptó como falla, no como cumplido.** Si alguien lee
esto en seis meses: este criterio no pasó. Se mergeó de todas formas, y el
motivo está abajo.

**Por qué se aceptó.** El dueño probó a mano los dos peores días (17/08 en
terror con `hondo`, 21/08 en comedia con `taquilla`) y miró los títulos que
entran, no los porcentajes. Son secuelas de terror de los 2000 y comedias de
Eddie Murphy: **cine popular con nota tibia, que cae en la franja de 5 a 6 y que
forma parte de la variedad que el producto busca.** El veredicto fue sobre el
contenido, que es lo que ningún porcentaje contesta.

**Por qué aceptarlo NO sería acomodar la vara.** El umbral de 5.0 se pidió
**antes** de ver estos resultados, porque el dueño no confiaba en el 6.0 como
línea (el puntaje de TMDB está sesgado por popularidad e idioma). La
reinterpretación quedó registrada de antemano, y esa es exactamente la
diferencia con mover el arco después del tiro: el criterio secundario existía
antes del disparo, no se inventó para justificar el resultado. Lo que el 5.0
dice es que lo que entra son títulos de 5 a 6 —el catálogo abriéndose hacia el
medio, que es la variedad buscada— y no cine malo.

**Si de la prueba a mano sale que hay que ajustar algo, se ajusta QUÉ ejes rotan
y con qué frecuencia** —que `nuevo` o `hondo` pesen menos, que no le toquen al
mismo riel dos días seguidos—, **nunca agregando un piso de nota. Ninguna
película se saca del Home por su puntaje.** Está escrito como principio en
`CLAUDE.md`, en el comentario de `discover()` y en el issue #12.

### Cómo volver a mirar el peor caso

Mergeado el 17/08. Los dos días de abajo son los que más títulos de 5 a 6 meten
en cada riel: sirven para volver a juzgar la composición si alguna vez se duda
de la decisión.

```bash
npm run dev
```

Sin `next build` en paralelo (corrompe `.next`; si pasa, borrar la carpeta).

**Los dos peores días, para no probar uno que salga lindo de casualidad.** Son
los que más títulos de 5 a 6 meten en cada riel:

```bash
YUMP_FECHA=2026-08-17 npm run dev
```

Terror, eje `hondo`: **7 de 20 entre 5 y 6** (y 2 bajo 5). Lo que entra:
El Halloween de Hubie (5.9), Mr. Crocket (5.2), Sé lo que hicisteis el último
verano (5.6), El caimán humano (5.6), Cuarentena terminal (5.7), Pesadilla en
Elm Street: El origen (5.5), La clásica historia de terror (5.8).

```bash
YUMP_FECHA=2026-08-21 npm run dev
```

Comedia, eje `taquilla`: **5 de 20 entre 5 y 6** (0 bajo 5). Lo que entra:
Into the Woods (5.8), El profesor chiflado II (5.0), El profesor chiflado (5.6),
Separados (5.9), Abuelos al poder (5.9).

Qué más mirar:

1. **Los seis rieles llenan 20** en los dos días, en Películas y en Series.
2. **El toggle Películas/Series** de cada riel: el lado de series es donde
   `scifi` y `terror` se quedaban en cero antes del guard.
3. **La consola del server**: `[home] EJES` dice qué eje le tocó a cada riel, con
   asterisco (`pop*`) cuando saltó el guard; `[home] VUELTAS` dice cuánto pagó
   cada uno.
4. **`scifi` en Series** va a verse casi igual todos los días: tiene 22 títulos
   en total y no hay rotación posible (issue #10).

Para volver al camino viejo y comparar en la misma pantalla:
`EJES_RIELES=0 npm run dev`.

---

## Lo que queda por hacer

- **`home:v2`** — evaluar si el payload compuesto sigue teniendo sentido, ahora
  sí con los números del hero puestos.
- **Pipeline de escrituras a Upstash** — baja round-trips, no comandos. Poco
  retorno; el rearmado en frío es el caso raro.
- Los quince issues de `docs/ISSUES.md`, empezando por **#13**: el cron semanal
  del Top 10 de Netflix se salteó la corrida del 18/08. Disparó bien el 25/08 y
  el bloque oficial quedó recuperado, pero no hay explicación del salto y la
  guarda mide antigüedad desde la fecha de la semana, así que la próxima corrida
  perdida vuelve a degradarlo.

---

## Issues abiertos (`docs/ISSUES.md`)

| # | Qué |
|---|---|
| #1 | Lighthouse Performance 61 en móvil |
| #2 | `--faint` no cumple contraste AA |
| #3 | Caminos de red sin ejercitar en la PWA |
| #4 | Fechas en UTC: `porEstrenar`, `today()`, el sync |
| #5 | ¿"Próximamente" muestra estreno en cine o llegada a streaming? |
| #6 | "Próximamente" mezcla estrenos con episodios semanales |
| #7 | `upcoming_content`: las filas existentes se quedan viejas |
| #8 | `upcoming_content`: sesgo permanente hacia lo popular |
| #9 | La popularidad es el orden por defecto en toda la app |
| #10 | La rotación de ejes no le llega a los chips angostos (18 de 112 casillas caen a `pop`) |
| #11 | "Últimos lanzamientos" tiene 35% de títulos bajo 6.0 |
| #12 | **El piso de 60 votos de `discover()` excluye cine regional en toda la app** |
| #13 | **El cron del Top 10 se salteó el 18/08** — disparó el 25/08 y el bloque oficial está recuperado; sin explicación del salto, y una corrida perdida vuelve a degradarlo (lo más fresco, ver arriba) |
| #14 | El avatar propio parpadea en cada carga — **no es una regresión de la tanda de avatares**, el código anterior hacía lo mismo. **POSTERGADO (29/08): no bloquea el prototipo ni el empaquetado con Capacitor.** Se arregla en una rama aparte cuando el dueño lo pida |
| #15 | **Selector de avatares.** Los círculos vacíos: causa confirmada (`loading="lazy"`, 21 de 31 nunca se pedían) y **corregidos** — diez aperturas sin uno solo. Queda abierto por una demora aislada de 4-6 s en dos aperturas calientes, **sin causa demostrada**: por decisión del dueño no se sigue investigando y no bloquea el merge |

---

## Cosas que cuestan tiempo si no se saben

**El tope de vueltas está calibrado para el eje más fácil de llenar.** Un día de
`hondo` termina con 21 tarjetas y uno de `pop` con 39, y la conclusión obvia
—que `hondo` es caro— es al revés: gastó 407 enriquecidos contra 434. Le sobró
presupuesto sin usar. Está documentado junto a `MAX_VUELTAS` en `lib/home.ts`.
**Cuando se toquen los rieles de género, ese número se revisa con ese dato.**

**Que dos cosas que deberían diferir den lo mismo es una alarma.** Documentado en
`MANTENIMIENTO.md` 8.b. Así se encontró el kill switch roto del pool cache.

**`upcoming_content` no es la agenda de estrenos**: es lo que estaba en el top 60
de popularidad el día en que se escribió cada fila. `MANTENIMIENTO.md` 5.b.

**El pool de una plataforma no es único**: hay una variante por configuración de
filtros, porque `withoutGenres` depende del conjunto completo de plataformas.
Documentado en `lib/pools.ts`.

**Interruptores de emergencia**: `POOL_CACHE=0` vuelve al camino viejo completo
de discover; `CACHE_BATCH=0` vuelve al GET por clave.

**`next build` con `next dev` corriendo corrompe `.next`.** Matar el dev antes.

---

## Sin trackear, de otra línea de trabajo

`prompts/noticias-filtro.md`, `prompts/noticias-redaccion.md` y
`supabase/migrations/004_news.sql`. Estaban al empezar la sesión y no se
tocaron. Si `004_news.sql` está aplicado en producción, debería versionarse por
el mismo motivo que el resto del pipeline.

## Eliminar cuenta (Apple / Google Play)

`Cuenta → Configuración → Zona de riesgo → Eliminar cuenta`.

**Qué elimina.** Una sola operación —`admin.deleteUser(id, false)`— y todo lo
demás cae por CASCADE. Verificado contra la base real con una cuenta
descartable el 22/08: antes 1 perfil, 3 votos, 3 `user_items` (los tres kinds),
3 en historial, 1 reseña, 1 identidad y 3 sesiones; después, 0 en todas.

| Dato | Tabla | Cómo se borra |
|---|---|---|
| Cuenta, email, hash de contraseña | `auth.users` | `admin.deleteUser` |
| Identidades, sesiones, tokens, MFA, WebAuthn, OAuth | `auth.*` (8 tablas) | CASCADE |
| Nombre, avatar, país, plataformas | `profiles` | CASCADE |
| Votos | `votes` | CASCADE |
| Mi lista, Ya la vi, descartes | `user_items` | CASCADE |
| Reseñas de usuario | `user_reviews` | CASCADE |
| Historial de fichas | `view_history` | CASCADE |

**Storage no participa**: el proyecto tiene 0 buckets y 0 objetos. Los avatares
son **archivos propios de Yump** en `/avatars/`, iguales para todos; el perfil
sólo guarda cuál eligió cada uno. Si algún día se suben archivos por usuario, el
lugar donde agregar su borrado es `lib/eliminar-cuenta.ts`.

**En el dispositivo** se borra el estado personal (`yump:ruleta-mostrados`,
`yump:hero-estado`, `yump:lista-paginada`, `yump:lista-vuelta`,
`yump:track-scroll`, y la sesión `sb-*-auth-token`) y **se conservan** las
preferencias: `sc:platforms` y su cookie, `sc:theme`, `sc:pais`, `sc:visits`,
`yump:shelf-type`. La persona sigue usando Yump como invitada sin reconfigurar
nada. El reparto vive en `lib/limpieza-local.ts`, que es puro y tiene tests.

**En Upstash no queda nada personal**: ninguna clave de cache lleva un id de
usuario. La única derivada es la del riel personalizado, que es un hash de las
señales — no identifica a nadie y expira sola en 6 h.

**Sin `SUPABASE_SERVICE_ROLE_KEY` el endpoint responde 503 `no-disponible` y NO
comprueba ninguna contraseña.** No es un detalle de robustez: validarla antes
convertía la falta de configuración en un oráculo —contraseña incorrecta 401,
correcta 500— que responde "¿esta clave es la buena?" a cualquiera con un token,
que es justo lo que la revalidación viene a impedir. Ese pedido tampoco suma al
límite de intentos, porque no se comprobó ninguna contraseña.

**Seguridad.** La identidad sale SOLO del token (`sesionDeToken`); el cuerpo del
pedido lleva únicamente la contraseña, así que no hay ningún campo del cliente
que pueda cambiar a quién se borra. La contraseña se revalida con un cliente
Supabase aislado por pedido (`persistSession`, `autoRefreshToken` y
`detectSessionInUrl` en false) y su sesión se cierra al terminar. Límite de 5
intentos fallidos por usuario cada 15 minutos. La ruta es `force-dynamic` con
`Cache-Control: no-store` en TODAS las respuestas, y no registra cuerpo, token,
email ni contraseña.

**El orden es el punto delicado**: primero el servidor; recién con un 200 se
cierra la sesión y se limpia el dispositivo. Si falla, la cuenta y la sesión
quedan intactas y se muestra el motivo.

### Pendiente para Google Play

Falta la **página pública `/eliminar-cuenta`**, accesible sin la app, que Google
exige enlazar desde la ficha de Play. El mecanismo del servidor ya está listo
para reutilizarse: depende solo de un token válido, así que esa página solo
tiene que pedir email y contraseña, iniciar sesión y llamar al mismo endpoint.
No hace falta tocar `lib/eliminar-cuenta.ts` ni la ruta.

También falta declarar en Play qué datos se recogen y cuáles se borran; la tabla
de arriba es la fuente para ese formulario.

---

## Tanda 3 del idioma: EN PRODUCCIÓN

**Cerrada el 2026-08-24.** `upcoming_content` quedó en es-MX y el sync escribe en
es-MX de acá en adelante. Falta **solo el merge** de `feat/idioma-tanda-3`.

| Pieza | Estado |
|---|---|
| Migración `006` (RPC del backfill) | aplicada |
| Edge Function `tmdb-sync` | desplegada, **version 7** |
| Secret `IDIOMA_TITULOS` | **`es-MX`** |
| Backfill | aplicado: 13 filas, 16 campos |
| Cron `tmdb-sync-upcoming-daily` | **reactivado**, jobid 2, `active = true` |

Verificaciones del backfill: 13 filas y 16 campos exactos, igualdad `===` contra
`después`, **ninguna** columna fuera de las tres, `upcoming_content_providers`
con el mismo sha256, 0 títulos vacíos o no latinos, y **los 44 títulos de la
agenda coinciden con su ficha** (0 diferencias).

`updated_at` tampoco cambió con el backfill: la tabla no tiene trigger y el
`UPDATE` nombra solo las tres columnas. Sigue marcando cuándo lo refrescó el
*sync*, que es el diagnóstico de frescura que no había que pisar.

### Lo que costó tres iteraciones, y por qué

La política del sync ante un respaldo que no alcanza se equivocó dos veces antes
de quedar bien, y las dos veces lo encontró una corrida real, no la lectura:

1. **Descartar todo lo que el respaldo no mejorara** tiró 79 títulos de 120 —casi
   todos sin sinopsis en ningún idioma— y bajó el descubrimiento a un tercio.
2. **Escribir todo lo que el respaldo no mejorara** habría persistido títulos
   coreanos que es-ES tenía en español.

Las dos preguntaban "¿la fusión cambió algo?". La correcta es **qué sigue roto
después de fusionar**, y la respuesta se decide por campo. La regla final:

```
título final no vacío y en alfabeto latino  ->  se escribe, aunque coincida
                                                con el original
título final vacío o en escritura no latina ->  el candidato queda fuera
```

Y ese corte es un **piso de calidad**, no una protección de idioma: la fusión ya
repara todo lo que es-ES pueda mejorar. Candidatos: 40 → 83 → **113 de 120**.

**`poster_path` cambia con es-MX y es deliberado** (`docs/UPCOMING.md`): los
pósters de TMDB son localizados. El backfill sigue limitado a `title`,
`overview` y `episode_name`.

---

## Histórico: cómo se ensayó la tanda 3

Rama `feat/idioma-tanda-3`, sin mergear. **Producción intacta**: el cron sigue
corriendo, la Edge Function sigue en es-ES, no se tocaron secrets y
`public.upcoming_content` no se escribió ni una vez.

### Qué hay

| Pieza | Estado |
|---|---|
| `supabase/functions/_shared/idioma-nucleo.ts` | núcleo compartido por la app, la Edge Function y el backfill |
| Edge Function con idioma por entorno + fallback | escrita, **no desplegada** |
| `006_backfill_upcoming_idioma.sql` | **aplicada** en la base |
| `scripts/backfill-upcoming-idioma.mjs` | escrito y ensayado |
| Tests | 365 |

### El ensayo integral, cerrado el 2026-08-24

Sobre un espejo `ensayo.upcoming_content` creado con `LIKE ... INCLUDING ALL`,
en un esquema **no expuesto** en PostgREST, con dos títulos REALES de TMDB que no
están en la tabla (`movie:278` y `tv:1399`) para ejercitar el camino de películas
—que producción no puede probar, porque hoy las 43 filas son todas series—.

| Etapa | Resultado |
|---|---|
| Sembrar + dry-run | 45 filas, 40 cambian, 58 campos, 181 llamadas a TMDB |
| Episodio por coordenadas | **verificado**: se pidió `/tv/1399/season/1/episode/1` en los dos idiomas |
| Aplicar desde el snapshot | 40 filas, verificado con `===` contra `después` |
| Restaurar | 40 filas, verificado con `===` contra `antes` |
| `--fallar-en` | abortó con `23502 not-null`, **0 campos cambiados**, tres veces |
| `public.upcoming_content` | `sha256 492993ee122c0bd5` antes y después: **0 campos distintos** |
| Limpieza | esquema 0, tablas 0, funciones `ensayo_*` 0, `backfill_upcoming_idioma` 1 |

**El `23502` es la prueba de que el espejo conservó el `NOT NULL`.** Con
`CREATE TABLE AS SELECT` no habría constraint que violar y el ensayo habría dado
verde sin probar nada.

**Dos bugs los encontró el ensayo, no la revisión de código:**

1. `ensayo_leer()` no devolvía las coordenadas del episodio, así que los títulos
   sintéticos —los únicos que no están en la tabla real— caían en el camino del
   404 y el episodio exacto nunca se ejercitaba.
2. El script salía con **127** en vez de 1: en Windows, `process.exit()` con
   stdout en vuelo tumba a libuv. Un script que avisa "esto falló" no puede
   comunicarlo con un crash.

### Etapa intermedia, ejecutada el 2026-08-24

| Paso | Estado |
|---|---|
| Rama en el remoto | `origin/feat/idioma-tanda-3` = `1aaaff6`, **sin mergear** |
| Foto previa de las dos tablas | `docs/medidas/foto-upcoming-2026-08-24T194456.json` |
| Cron `tmdb-sync-upcoming-daily` | **PAUSADO** — jobid 2, `active = false`, pg_cron 1.6.4 vía `cron.alter_job` |
| Secret `IDIOMA_TITULOS` | creado en **`es-ES`** (inerte: es el default del código nuevo) |
| Edge Function `tmdb-sync` | **desplegada**, version 4, `ezbr_sha256 e6775466…` |

**El cron quedó pausado y hay que acordarse de reactivarlo**:
`select cron.alter_job(job_id := 2, active := true);` — su horario es 06:00 UTC
(03:00 AR), así que cada día que pase sin reactivar es un día sin refrescar la
agenda.

**Cómo se verificó el deploy, y por qué el hash no sirve.** `supabase functions
download` devuelve el código **transpilado**, no el fuente: los tipos están
borrados y los objetos reformateados, así que comparar hashes contra el commit da
11 de 11 distintos sin que eso signifique nada. La verificación es semántica —
nueve marcadores que tienen que estar y cuatro que no:

```
SI  idioma base por entorno            SI  idioma NO hardcodeado
SI  episodeDetails por coordenadas     SI  el respaldo NO relee next_episode_to_air
SI  metricas por invocacion            SI  sin acumulador de metricas en el modulo
SI  el nucleo compartido _shared       SI  sin la condicion de descarte vieja
```

El bundle descargado **incluye `_shared/idioma-nucleo.ts`**, que es la
confirmación en producción de lo que `deno info` ya había mostrado en local.

### El backfill aprobado: los 16 campos, completos

Snapshot `docs/medidas/snapshot-upcoming-2026-08-24T205416-es-MX.json`.
**13 filas, 16 campos.** La lista entera, porque el dry-run imprime solo los
primeros 8 y reportarla como "completa" fue un error de informe:

| Campo | Antes | Después |
|---|---|---|
| `tv:211288.title` | Tracker | Tracker: Buscador de recompensas |
| `tv:287620.title` | Stuart no consigue salvar el universo | Stuart no logra salvar el Universo |
| `tv:45140.title` | Los Jóvenes Titanes en Acción | Los Jóvenes Titanes en acción |
| `tv:95480.title` | Slow Horses | Caballos lentos |
| `tv:30984.episode_name` | Episodio 46 | VIDA PARA DEFENDERTE. |
| `tv:153312.overview` | Justo después de ser liberado… | Después de cumplir 25 años… |
| `tv:207333.overview` | En el atemporal pueblo de Macondo… | En el mítico pueblo de Macondo… |
| `tv:211288.overview` | Colter Shaw recorre el país… | Colter Shaw es un lobo solitario… |
| `tv:259140.overview` | Akane Tendô conoce a su prometido… | Akane Tendo conoce a su prometido… |
| `tv:283428.overview` | A Koyuki le cuesta relacionarse… | A Koyuki le cuesta trabajo conectar… |
| `tv:287620.overview` | Stuart Bloom, dueño de una tienda… | A Stuart Bloom se le encomienda… |
| `tv:31991.overview` | *(vacía)* | En este programa debutan nuevos talentos… |
| `tv:62650.overview` | Chicago Med se describe como… | Muestra el caótico día a día del hospital… |
| `tv:84773.overview` | Un reparto coral de personajes… | Comenzando en un tiempo relativamente pacífico… |
| `tv:91768.overview` | Urano Motuso es una joven amante… | Motosu Urano era una estudiante universitaria… |
| `tv:95480.overview` | Drama de espías con tintes de comedia negra… | Esta ingeniosa serie de espionaje… |

**Cuatro títulos y un nombre de episodio**; los once restantes son sinopsis.
`tv:95480` (*Slow Horses* → *Caballos lentos*) y `tv:45140` (mayúscula en
"acción") estaban entre los que faltaban en el informe.

El único campo omitido que no es "ya está en es-MX" es
`tv:220542.episode_name`, que da 404 por coordenadas y conserva `"Episodio 49"`.

### El orden en que se ejecutó (ya está hecho, queda como referencia)

Se corrió completo el 2026-08-24/25 y **los siete pasos están cerrados**; el
cron quedó reactivado. Se deja escrito porque es la receta para cualquier cambio
futuro sobre `upcoming_content`:

1. Pausar el cron (`cron.alter_job(2, active := false)`).
2. Desplegar la Edge Function **inerte** (su default sigue siendo es-ES).
3. `supabase secrets set IDIOMA_TITULOS=es-MX` y **una** corrida manual del sync.
4. Dry-run sobre la tabla real → snapshot → revisarlo.
5. `--aplicar --desde-plan=<ese snapshot>`.
6. Verificar `/proximamente` contra la ficha del mismo título.
7. Reactivar el cron.

**El orden importa**: si el backfill fuera antes del sync, la próxima corrida en
es-ES pisaría lo reparado. Y entre el paso 3 y el 5 el cron tiene que estar
pausado, o el bloqueo optimista de la RPC va a abortar el backfill — que es lo
que tiene que hacer, pero mejor no llegar ahí.

---

## Tanda 2 del idioma: EN PRODUCCIÓN

**Activada el 2026-08-24.** `main` = `361cf5b` (`Merge feat/idioma-tanda-2`),
desplegado, con `IDIOMA_TITULOS=es-MX` en el scope **Production** únicamente.

Evidencia del cierre, leída de producción y no del banco:

| Qué | Resultado |
|---|---|
| Commit desplegado | `361cf5b`, rama `main` |
| `/api/health` | **200**, `cache: redis`, ping OK |
| Claves del Home | **siete**, todas `home:es-MX+f.r1:v5:…` — una por combinación |
| Precalentamiento | **7/7**, 12 rieles cada una, ninguna degradada, salida 0 |
| Segunda vuelta | las siete desde caché (354-501 ms) |
| Fallos de respaldo | **0** acumulados sobre 16 requests de Home |
| Errores 5xx | **0** |
| Claves en Upstash | 1.593 → **2.378** |

**El arranque en frío fue PARCIAL, y eso es el diseño funcionando**: el primer
`MISS` registró `401 hit / 236 miss` de 637 claves. Las familias que **no**
llevan huella —`pv:`, `videos:`, `genre:covers:`, `blocklist:`— seguían
calientes de la etapa `es-ES` y no se invalidaron. Solo se rearmó lo localizado.

**Rollback**: `IDIOMA_TITULOS=es-ES` + un deployment nuevo del **mismo** `main`.
Nunca revertir el código: el código sin huella con la variable en `es-MX` es la
combinación que envenena las claves de `es-ES`.

### La rama `feat/idioma-tanda-2` quedó viva y ya no es segura

Sigue en el remoto, pero **sus seis variables de aislamiento se borraron** (paso
final del runbook). Con `IDIOMA_TITULOS` solo en Production, un push nuevo a esa
rama arma un Preview que **comparte el Redis de producción** y corre `es-ES` con
huella: escribiría un espacio `es-ES.r1` entero contra la cuota de producción,
para nada. Si no se va a usar más, borrarla.

---

## Cómo llegó acá (histórico de la tanda 2)

**Un solo cambio de código**: los once call sites pasaban `HUELLA_EN_CLAVES` —la
cadena vacía del modo compatible de la tanda 1— y ahora pasan `HUELLA_IDIOMA`.
Con eso la clave depende de la configuración: `card:es-MX+f.r1:movie:278` en vez
de `card:movie:278`. Las once familias juntas, que es lo que provoca **un** solo
arranque frío en vez de once, y evita un Home mitad es-MX y mitad es-ES mientras
durara el escalonamiento.

`HUELLA_EN_CLAVES` se **eliminó** en vez de repuntarse: mientras existiera, un
call site nuevo podía quedarse en modo compatible sin que nada lo notara, y el
síntoma no es un error sino títulos mezclados. En su lugar hay un barrido nuevo
(`lib/claves.test.ts`) que exige `HUELLA_IDIOMA` en **todas** las llamadas a un
constructor y fija el total en 11. Visto en rojo inyectando `""` en `lib/top.ts`.

El idioma base, el fallback, `ayudaOriginal` y la consulta verificada ya estaban
implementados y probados desde la tanda 1: **se encienden con la variable, sin
tocar código.**

### Medición, contra una línea de base NUEVA

Los 612 / 655 del informe de la tanda 1 son **referencia histórica**: la tanda 1
movió esos números. Todo en `docs/medidas/2026-08-23-idioma-tanda2-e2e.json`.

| Home frío `n,d,m` | Base (es-ES) | Tanda 2 (es-MX+f) | Tope | |
|---|---|---|---|---|
| Llamadas a TMDB | 613 · 613 · 613 | 651 · 652 · 651 | ≤ 660 | ✅ |
| Comandos de Upstash | 656 · 656 · 656 | 656 · 658 · 656 | ≤ 670 | ✅ |
| Llamadas de respaldo | 0 | 39 = **37 páginas + 2 detalles** | ~32 páginas | ✅ |
| Payload | 84.413 B | 84.750 B | ≤ 85.000 B | ✅ |
| **Tiempo frío (pared)** | 8,07 · 7,69 · 7,90 s | 8,46 · 8,53 · 7,06 s | — | ✅ |
| **Tiempo frío (composer)** | 5.895 · 5.518 · 5.747 ms | 6.079 · 6.029 · 5.725 ms | — | ✅ |
| Home caliente | 1 comando, 0 TMDB | 1 comando, 0 TMDB | igual | ✅ |
| `degradado` / `fallos` | false / 0 | false / 0 | | ✅ |
| Títulos por riel | 20·40·30·20×6·20·39·39 | **idénticos** | idénticos | ✅ |

**Las dos variantes se midieron alternadas en la misma ventana**, tres corridas
cada una. Es la corrección más importante de esta revisión: la primera comparó
dos ventanas separadas por hora y media y le atribuyó al idioma lo que era
deriva del catálogo de TMDB.

**Corrección importante sobre la primera revisión de esta medición.** Se publicó
que el idioma cambiaba las cantidades por riel (family 40→39, adult-anime 38→39)
y que "casi todos los rieles difieren". **Las dos cosas eran deriva del catálogo,
no del idioma.** Medido en la misma ventana:

| Comparación | Rieles con contenido distinto |
|---|---|
| es-ES contra es-ES (control) | 0 de 12 |
| es-MX contra es-MX (control) | 0 de 12 |
| **es-ES contra es-MX** | **1 de 12** |

El único que se mueve es "Últimos lanzamientos": 19 de 20 títulos en la misma
posición, uno cambiado. Es el riel que ordena por fecha y sin piso de votos, así
que el borde entre entrar y no entrar es de horas. El hero es idéntico.

La causa de fondo sigue siendo real —**TMDB ordena `discover` por idioma**, 18 de
20 en la misma posición en la página 1— pero su efecto sobre el Home es de un
título en 314, no de un riel entero.

### El pico de 27 segundos: era TMDB, no el fallback

La primera medición tuvo una corrida de `es-MX` de 27,2 s en frío y quedó sin
explicar. Cuatro evidencias:

1. **`es-ES` también lo hace**: una corrida de `es-ES` dio 21,2 s de pared y
   17,5 s de composer, con **cero** llamadas de respaldo.
2. En la misma ventana, `es-ES` y `es-MX` dan **5.747 y 5.725 ms**: indistinguibles.
3. Aislado contra su propio control (`FALLBACK_IDIOMA=0`), el fallback cuesta
   **440 ms**, no 18 segundos.
4. **No es el compilado de `next dev`**: `/api/home` compila en 1,3-2,3 s en
   todas las corridas, incluidas las lentas.

**Lo que sí lo explica, demostrado:** se lanzó el script de medición (144
requests a 16 concurrentes) y encima un Home frío. **TMDB empezó a devolver 502**
en `/watch/providers` y el Home salió degradado. TMDB se degrada bajo
concurrencia: primero se pone lento, después falla. Las corridas lentas venían
justo después de ráfagas de medición.

De yapa, esa corrida degradada confirmó dos cosas del diseño **en vivo**: `safe`
degrada riel por riel en vez de tirar el Home entero, y `cachedIf` **no guarda**
un payload degradado.

**Regla: no medir tiempos con otra cosa pegándole a TMDB al mismo tiempo.** Los
conteos (llamadas, comandos, bytes, títulos) aguantan; los tiempos no.

### Ensayo de rollback

`IDIOMA_TITULOS=es-ES` devuelve **exactamente** la línea de base: mismas
llamadas, mismos comandos, mismo payload, los mismos 12 rieles, el mismo hero y
las 7 fichas de control idénticas.

**Lo que el rollback NO devuelve es el cache.** La huella pasa a `es-ES.r1`, que
no es el espacio vacío de la tanda 1: **volver atrás cuesta un segundo arranque
frío**. Es el precio de que el rollback sea inmediato en vez de esperar TTLs de
hasta 30 h.

### Qué mirar a mano (Preview)

1. `[home] MISS home:es-MX+f.r1:v5:…` en el primer request. Si dice `HIT`, la
   huella no llegó.
2. `movie:278` → "Sueño de fuga", y **ahora sí** aparece el respaldo original.
3. `movie:12535` → sigue la ayuda verificada de Disney+, **sin** duplicarla con
   el respaldo genérico.
4. `tv:1399` → "Game of Thrones"; `movie:585` → "Monsters, Inc.";
   `movie:1084242` → "Zootopia 2". El pasaje al inglés **no** se repara.
5. `/top` y `/personas`: las dos superficies de `top:pop:` y `people:popular:`,
   las claves menos obvias.
6. La ruleta: encabezado y cuerpo sin contradicción. Se esperan **cero**
   contradicciones conocidas.

### El Preview: aislado y desplegado

```
https://streamingcentral-git-feat-4b4d31-jfgalindez-gmailcoms-projects.vercel.app
```

**Producción sigue en `es-ES` y sus variables no se tocaron.**

**El plan decía "sacar `KV_*` del scope Preview" y eso no se puede hacer sin
romper producción.** La integración crea **una sola entrada por variable con los
dos targets** (`Production, Preview`), así que borrar "la de Preview" se lleva
puesta la de Production — y producción sin Redis rearma el Home entero en cada
request. Lo que se hizo en cambio: **variables de Preview acotadas a la rama**,
que conviven con la entrada compartida y la pisan solo ahí. Las cinco de Redis
en vacío (`lib/cache.ts` exige URL y token no vacíos) más `IDIOMA_TITULOS=es-MX`.
Procedimiento completo, con la trampa del orden, en `docs/MANTENIMIENTO.md`.

**Verificado, no asumido:** `GET /api/health` en el Preview devuelve **503** con
`cache: "memoria"`, `fuente: null` y las dos credenciales en `false`. Confirmado
también del lado del servidor en los logs de runtime (`environment: preview`,
`branch: feat/idioma-tanda-2`, `503`).

**Los Previews están detrás de Vercel SSO**, así que la verificación visual la
hace el dueño con su sesión; lo automatizable es `vercel logs --json`, que está
autenticado por CLI.

### Verificado EN EL PREVIEW, no solo en el banco

El arranque en frío real, leído de los logs de runtime de Vercel:

```
[home] MISS home:es-MX+f.r1:v5:3439782971:d,m,n,p:accion:movie,…
[idioma] fallback: 47 llamadas | 47 lotes con rotos | 85 títulos reparados | 0 fallos
[home] 7121ms total | cache 0ms | 682 comandos | 0 requests | 661 claves (18 hit / 643 miss)
```

| Qué | Evidencia |
|---|---|
| La huella entra en la clave | `home:es-MX+f.r1:v5:…` en el `MISS` **y** en el `HIT` |
| El payload se guarda y se sirve | `HIT` con **1 comando / 0 requests** |
| El respaldo no falla en Vercel | **`0 fallos`** sobre 47 llamadas y 85 títulos reparados |
| Nada roto en la navegación | 100 eventos, 49 rutas, **0 errores 5xx** |
| El aislamiento, por tercera vía | **682 comandos contados y `0 requests` reales**: se contabiliza el patrón de acceso pero no sale un solo round-trip a Upstash |

**Ese `MISS` es de `d,m,n,p` (cuatro plataformas), no de `n,d,m`**, porque la
forma de forzar un arranque en frío fue agregar Prime Video. Sus 682 comandos y
47 llamadas de respaldo **no se comparan** contra los topes de la tabla de
aceptación, que son de tres plataformas. Lo que sí vale de acá es lo que no
depende del tamaño: la huella en la clave, el `0 fallos` y el `0 requests`.

**Un detalle del log que confirma otra cosa, de paso**:
`[ejes] aud-family/tv: "hondo" trajo 1 (piso 24), se cae a "pop" con 69` — el
guard de ejes que no puede llenar, funcionando en producción real.

### La activación, ya ejecutada (queda como receta)

Los cuatro pasos se corrieron el 2026-08-24 y están cerrados. Se conservan
porque son la receta de cualquier cambio futuro de `IDIOMA_TITULOS`:

1. Borrar las seis variables de rama (comando en `MANTENIMIENTO.md`).
2. `IDIOMA_TITULOS=es-MX` en **Production**.
3. Redeploy de producción (editar la variable **no** toca ningún deployment
   existente).
4. `scripts/precalentar-home.mjs --base=… --aplicar`, con las combinaciones que
   decida el dueño.

### Archivos ajenos, sin registrar y a propósito

Estos **cuatro** son del dueño, son **preexistentes** y **no** pertenecen a
ninguna rama de idioma:

| Archivo | Cómo está protegido |
|---|---|
| `prompts/noticias-filtro.md` | aparece como `??`; hay que no agregarlo a mano |
| `prompts/noticias-redaccion.md` | ídem |
| `supabase/migrations/004_news.sql` | ídem |
| `.claude/settings.local.json` | **`.gitignore` del repo** |

**El cuarto faltaba en esta lista y estaba peor protegido que los otros tres.**
`git status` no lo mostraba, y eso no era porque estuviera a salvo: lo tapaba el
ignore GLOBAL de esta máquina (`~/.config/git/ignore`). En cualquier otro clon,
un `git add -A` lo habría incluido — y es configuración de permisos, no del
proyecto. Ahora está en el `.gitignore` del repo, así que la protección viaja
con él. `.claude/settings.json` y `.claude/launch.json` **sí** se versionan: esa
es la parte compartida.

La tabla `news_items` ya está aplicada en la base, pero su migración sigue sin
versionar — es una decisión pendiente del dueño, no un olvido.

**Al preparar commits, agregar rutas explícitas y nunca `git add -A`**: fue así
como se colaron en un commit de esta rama, y hubo que sacarlos con
`git rm --cached` (que no toca la copia de trabajo).

## Disponibilidad centralizada + selector en "Últimos lanzamientos" (2026-08-30)

Rama `fix/disponibilidad-oficial`. **No mergeada al escribir esto.**

- **Un solo resolvedor** decide "está en X" para toda la app
  (`lib/disponibilidad.ts`). Antes cada superficie decidía sola: por eso el
  arreglo de Moria vivía sólo en la ficha.
- **Evidencia oficial** para títulos cuyo dato regional TMDB no tiene
  (`lib/enlace-oficial.ts`). **Al integrarse cubría sólo Disney+ y sólo series**;
  desde `feat/evidencia-oficial` cubre **seis plataformas en series y cuatro en
  películas**, con procedencia `oficial-probable`. Ver el bloque de más abajo.
- **Registro manual versionado** (`lib/excepciones-disponibilidad.ts`), **vacío**:
  el caso testigo se resuelve por la regla general, no por una excepción.
- **"Últimos lanzamientos · Series"** mezcla la fuente regional con candidatos
  por red oficial (`lib/ultimos.ts`). El catálogo regional se pagina hasta
  `total_pages` de TMDB —**sin ventana fija**, que fue una regresión corregida
  dos veces—; lo acotado es sólo el suplemento por redes. Las páginas no repiten
  ni saltean porque el orden regional es el de TMDB, estabilizado, y un extra
  entra recién cuando el stream pasó su fecha.
- **Guardas de entrada**: sin plataformas válidas no se pide una sola página, y
  `page` se normaliza a un entero ≥ 1. Una página imposible se descarta con una
  consulta, no recorriendo el catálogo.
- **El riel estrenó selector Películas/Series.** Default Películas: el Home
  inicial no cambia. Clave del Home **`v5` → `v6`**.
- **Sin SQL, sin migraciones, sin escrituras en Supabase.**

Verificado sobre el build local: `tv:275224` pasa de `[]` a `["d"]`, aparece
primero por fecha en el riel en Series, no aparece sin Disney+ elegida, y los
títulos con proveedor de TMDB no cambian.

**Estado de verificación al 2026-08-30:** suite **757/757**, `tsc` 0, build OK.

✅ **Prueba manual APROBADA por el dueño**, sobre el build de producción corrido
en local (`next start` en el 3100). Se verificó el recorrido completo: el Home
abre, "Últimos lanzamientos" arranca en Películas, el selector cambia el
contenido de verdad, "Gutiérrez Is mai neim" aparece con Disney+ elegida, su
ficha muestra Disney+ y no dice "No está en streaming", volver atrás conserva la
navegación, "Ver todas" funciona, y volver a Películas actualiza el riel. Sin
regresiones visibles en una película y una serie conocidas.

⚠️ **El Preview se OMITIÓ por decisión del dueño.** El aislamiento del Redis de
Producción exige crear variables `KV_*` vacías acotadas a la rama, y se prefirió
no tocar variables de Vercel. La prueba local cumplió la misma función con
aislamiento verificado: `/api/health` devolvió `503` con `cache: "memoria"`,
`fuente: null` y `credenciales: {url:false, token:false}`, o sea sin Redis de por
medio.

🔴 **Lo que la prueba local NO puede cubrir**, y hay que mirar después del
deploy: el comportamiento con Redis real. Local corre en memoria, así que las
claves nuevas (`home:…v6`, `pv3:`, `ultimos:`, `disp:`, `oficial:`) no se
ejercitaron contra Upstash. El primer Home de producción va a ser un arranque
frío.

**La rama queda LISTA PARA INTEGRAR.**

Los conteos anteriores de este documento (678) eran de una revisión intermedia.
El 771 que figuró un rato acá **era incorrecto**: salió de contar antes de
eliminar `combinarUltimos`, que era código muerto y se llevó sus ~24 tests. Y el
751 que lo reemplazó quedó corto por seis en el mismo commit que lo escribió, al
trasladar la cobertura de esa función al orquestador real.

⚠️ **Un conteo escrito a mano se desactualiza en el commit siguiente.** Vale como
foto fechada de una verificación, no como dato vivo: el número real lo da
`npm test`.

⚠️ **Lo que no se pudo verificar en vivo:** el respaldo del top de Netflix. Es
el issue **#13**: el cron corrió el 25/08 a las 12:58 UTC, pero la guarda mide
14 días desde `week` y el ranking más nuevo de Netflix es del 2026-08-16, así que
volvió a vencer. **Moria NO está resuelta hoy**, ni acá ni en `main`. La regla
está cubierta por 23 tests apuntados al resolvedor.

## Top semanal manual — rama `feat/top-manual` (2026-09-01)

**Sin mergear y SIN EJECUTAR LA MIGRACIÓN al escribir esto.** Falta la prueba
manual del dueño.

`/top` pasa a cargarse a mano: doce bloques (seis plataformas × dos tipos) que
el dueño arma, revisa y publica desde `/admin/top`. Ver el bloque de `CLAUDE.md`
para las reglas; acá va lo que hay que saber para operarlo.

**Pendiente de ejecutar:** `supabase/migrations/007_top_manual.sql`. No se corrió
en ningún entorno.

### 🔴 EL PRÓXIMO GATE ES UNA BASE DE VERDAD, NO MÁS TESTS DE TEXTO

Los tests de `npm test` barren el TEXTO del SQL: comprueban que una protección no
desaparezca del archivo, **no que Postgres se comporte**. Tres auditorías
encontraron cosas que un barrido no podía ver —la más clara, que
`revoke select (columna)` no hace nada si el rol tiene `select` de tabla, porque
los privilegios son aditivos—.

Antes de mergear hay que aplicar la 007 en un **Supabase local o una rama
descartable** y correr `supabase/verificar-007.sql`, que ejecuta consultas
reales: privilegios de columna, la columna derivada, los triggers que desmarcan
la revisión, el índice de un solo borrador y la inmutabilidad de lo publicado.
Termina en "VERIFICACIÓN COMPLETA" o revienta.

Ese archivo **no es una migración** y no se aplica solo. **No correrlo en
Producción**: escribe y borra filas.

Lo que ese script no puede probar —todo lo que necesita una sesión real, porque
`auth.uid()` y `auth.jwt()` son nulos en el SQL editor— está listado al final del
propio archivo y se verifica desde el dashboard: los dos factores TOTP, publicar,
el borrador siguiente precargado, la atomicidad del reemplazo, la publicación
parcial y `creado_por`.

⚠️ En la máquina de desarrollo no hay Docker, `psql` ni Postgres local
(verificado, no supuesto), así que este paso **no se pudo hacer todavía**. Hace
falta Docker Desktop para `supabase start`, o una rama de Supabase.

**Pendiente de configurar (lo hace el dueño):** habilitar TOTP en el panel de
Supabase → Authentication → Multi-Factor Authentication. Sin eso, `/admin/mfa`
no puede inscribir un factor y el dashboard queda inaccesible.

### El cutover, que es lo que hay que entender antes de tocar nada

Mientras falte cualquiera de los doce bloques publicados, **`/top` entero sigue
con la implementación vieja**. El dashboard muestra "Preparación inicial: X de
12 publicados". Con los doce, `/api/top` cambia de fuente sin desplegar nada.

Después del primer cutover los borradores pendientes no afectan: cada bloque
conserva su última versión publicada.

### Lo que NO cambia

- El selector `Películas | Series`, `Tus plataformas`, `En otras plataformas`,
  el carrusel por plataforma, el ranking numérico, `TitleCard`, la apertura de
  la ficha, las acciones rápidas y la restauración de scroll vertical y
  horizontal. **`TopBlock` conserva su forma** (`mine`, `others`, `fallos`,
  `degradado`, `slots` 1–10); lo único que cambia es el valor de `source` y el
  subtítulo.
- El cron semanal de Netflix **sigue corriendo**: alimenta la evidencia de
  disponibilidad, no el ranking. Ver `CLAUDE.md`.
- Las reseñas editoriales siguen en standby y sus policies **no se tocaron**.

## Evidencia oficial general — rama `feat/evidencia-oficial` (2026-08-31)

**Prueba manual local APROBADA por el dueño el 2026-08-31. Lista para
integrar.** Ver el bloque de cierre al final de esta sección.

Generaliza lo que la tanda anterior había dejado atado a **una** plataforma y a
**series**.

- **`tmdb-ar` sigue siendo la evidencia prioritaria.** Si TMDB informa cualquier
  `flatrate` argentino —aunque Yump no mapee ese proveedor— **ningún respaldo se
  consulta ni se aplica**.
- **`oficial-probable`** (antes `enlace-oficial`) cubre **seis plataformas en
  series** y **cuatro en películas**. Series: red + enlace. Películas: dominio y
  ruta oficial específica, **sin `networks`**. Max y Paramount+ **no** se
  infieren para películas: midieron 0 de 30.
- **El criterio es cobertura, no certeza**, por decisión del dueño: mejor mostrar
  ocasionalmente algo que no está, que ocultar mucho que sí está. Medido contra
  verdad de campo: **144 + 22 aciertos, cero falsos positivos**.
- **`pv3:`** guarda un resumen regional compacto —cuántas regiones hay, cuántas
  informan cada plataforma, cuántas ninguna— en vez de ids deduplicados, que
  perdían la frecuencia. Medido: **170 B/título contra 197**, o sea más chico.
- **`oficial:`** reemplaza a `serie:oficial:` y cubre los dos tipos.
- **Moria ya no depende del Top 10** para su disponibilidad: resuelve Netflix por
  enlace oficial, que no vence.

🔴 **El Top 10 NO se tocó, y su issue #13 sigue abierto**: el ranking vuelve a
vencer porque la guarda mide 14 días desde `week`. Que Moria ya no lo necesite
para la ficha no arregla el bloque "Lo más visto esta semana", que sigue cayendo
a "Lo más popular ahora" cuando la evidencia vence.

### Identidad oficial y deduplicación de la búsqueda — APROBADO

**El problema no era la disponibilidad: era que TMDB tiene el mismo programa
cargado dos veces.** `tv:322428` y `movie:1752041` son la misma obra, una como
serie y otra como película, y la búsqueda mostraba dos cards — una en color y
otra en gris.

- **`netflix.com/browse?jbv=<n>` cuenta como ruta de título.** `/browse` pelado
  se sigue rechazando: es una portada. El parámetro exige ruta exacta, un único
  valor y forma numérica. Medido: de 80 series de Netflix con `homepage`, 71
  usan `/title/<n>` y **1** usa `?jbv=`. Es el mismo número en las dos formas.
- **Cada ruta valida Y extrae**: el grupo 1 del regex es el identificador, así
  que la identidad no puede divergir de lo que la regla acepta.
- 🔴 **La deduplicación es por identidad oficial, NUNCA por parecido.** No se
  compara título, fecha, productora, sinopsis ni similitud textual: esas señales
  esconden obras legítimamente distintas. **Lo que no tiene identidad oficial no
  se toca**, y gana el primero, que no es un criterio nuevo — la lista ya venía
  ordenada por relevancia.
- Medido sobre **540 títulos** de las seis plataformas: 366 con identidad y
  **0 colisiones**.

**Lo verificado a mano y aprobado por el dueño:** el duplicado `movie:1752041`
desaparece; **`movie:401445` —otra película llamada "Moria", de 2018— PERMANECE**
porque no comparte identidad, que es exactamente lo que tiene que pasar; Moria
serie figura en Netflix; Gutiérrez (`tv:275224`) conserva Disney+; navegación y
comportamiento general aprobados.

### El idioma visual ya no mueve la disponibilidad — APROBADO

`homepage` es un campo **localizado** de TMDB, y el lector de evidencia lo pedía
con el idioma base. Es decir que `IDIOMA_TITULOS` —una variable que existe para
elegir cómo se escriben títulos y sinopsis— **decidía si un título estaba en
Netflix o quedaba en gris**.

🔴 **No se arregló poniéndole huella de idioma a `oficial:`.** Eso arregla la
caché y deja el bug: seguirían existiendo dos respuestas para el mismo título.
Se arregló la **fuente** (`IDIOMA_EVIDENCIA = "es-ES"`, literal, sin leer el
entorno), y por eso esa clave **puede** seguir sin huella. Hay tests que atan las
dos mitades. Cuesta **cero llamadas nuevas**.

⚠️ **`en-US` daría más cobertura y no se tomó**: 248 identidades contra 217
(gana 32, pierde 1). Se eligió `es-ES` porque es lo que la app resuelve hoy —
fijarlo no mueve ni un título— y porque lo que `en-US` pierde son los casos del
tipo del testigo. **Queda como decisión abierta.** Ver
`docs/medidas/2026-08-31-idioma-evidencia.md`.

### Cierre: qué queda integrado y qué NO

**Preview de Vercel OMITIDA**, por decisión del dueño y como en la tanda
anterior: se probó en local en modo Producción, con caché en memoria y fecha
argentina real.

Lo que este trabajo **NO** arregla, y conviene no darlo por cerrado:

| | Estado |
|---|---|
| **Issue #16** (catálogo regional incompleto) | **MITIGADO, no resuelto.** La regla cubre seis plataformas en vez de una, pero sigue sin poder medirse cuánto falta |
| **Issue #13** (cron del Top 10) | **ABIERTO.** No se tocó |
| **"Próximamente"** | **La causa de descubrimiento quedó corregida** el 2026-09-01 (issue #8). La segunda —el filtro de proveedor AR de `sync-upcoming.ts:224`— **se conserva a propósito**: es la decisión del dueño, no un pendiente |
| **Capacitor** | **ETAPA 2 TERMINADA (CP1-CP11)**: viable en Android. El spike descartable queda archivado en `spike/capacitor-android` (`5d5180f`). ✅ **ETAPA 3 TERMINADA** (4 tandas) y ✅ **ETAPA 4 TERMINADA** (7/09) en `integracion/capacitor-base` (`991e656`), nacida de `main`, **sin pushear y sin mergear**. Etapa 4 cierra con: íconos y pantalla de inicio nativos aprobados en el teléfono; `main` (`8b422fa`) integrado, así que Próximamente y "¿No sabés qué ver?" ya viajan en el contenedor con `apiUrl`, CORS y rutas nativas compuestos; y **recordatorios locales de estreno v1**, probados en el teléfono el 7/09 — permiso contextual, aviso a las 10:00 locales del día del estreno, cancelación con el segundo toque, apertura de la ficha correcta, y el mismo flujo en la tarjeta de Próximamente y en la ficha. Permisos finales: `INTERNET`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, **sin alarma exacta**. Quedan abiertos, y pertenecen a la Etapa 5: keystore y Play App Signing, ficha de Play, prueba cerrada, y **qué API usa el build de Play** (hoy el artefacto apunta a la Preview). Fuera de Capacitor queda el **404 propio**, que se ve pero responde 200. **ETAPA 5 EN CURSO**: el build de Play ya apunta a Producción (`--release --api-base=https://app.yump.ar`), con DOS guards que hacen fallar la release —uno mira la base pedida y otro los bytes que se van a empaquetar— y firma de carga desde `android/keystore.properties`, fuera de Git, **sin respaldo a la clave de depuración**. `versionCode 1`, `versionName 1.0.0`, `debuggable false`. Frenado a propósito en la creación de la clave, que es del dueño. 🔴 **Producción todavía no tiene CORS** (`lib/cors.ts` no existe en `origin/main`): el AAB no va a funcionar en el teléfono hasta que esta rama se mergee y se deploye. Ver `docs/superpowers/plans/2026-09-05-etapa3-android-publicable.md` §17 y §19 |
