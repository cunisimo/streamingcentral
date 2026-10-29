# E8 local: retención y purga — 27/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`ed6a791`. Autorizada por el dueño, sólo en local: Supabase local y datos
ficticios. Sin E9, E0, Producción, instalación de cron, servicios externos,
gastos, push, merge, deploy, AAB ni versiones de Android.

**Cierre de E7.** Copié sin cambios la auditoría de Codex
`docs/medidas/2026-10-27-auditoria-e7-ed6a791.md`. Su SHA-256 es
`188a22f4…`, igual al original. E7 queda cerrada en local y conservo sus
pendientes de integración: `/api/title` en ejecución, TMDB, tema claro,
teléfono/Android y lector de pantalla.

**Commits:**

| Commit | Contenido |
|---|---|
| `004690e` | Copia de la auditoría de E7; E7 cerrada en ESTADO y en el plan. |
| `a730934` | 021 + down, `cron-comunidad.sql`, baterías y unitarias. |
| El siguiente | Este informe, las salidas, ESTADO y el plan. |

## Plazos: qué se cargó y cómo lo interpreté

Los plazos son decisiones de producto del dueño del 27/10. **No están
validados legalmente**: P3 sigue abierto para eso.

Están en `comunidad.purga_config` y se pueden cambiar sin migración. El
interruptor `purga_activa` arranca en **false**. Apagado, `purgar` vuelve sin
hacer nada.

| Decisión del dueño | Dónde | Cómo se cuenta |
|---|---|---|
| Reseñas publicadas y votos: mientras sigan vigentes | Sin plazo | Nunca se borran por antigüedad |
| Órdenes de Más útiles: al vencer sus 2 horas | `vence_en` | `vence_en ≤ ahora` (el mismo criterio que el generador de 018) |
| Intentos: 7 días | `plazo_intentos` | Desde `creado_en` |
| Versiones reemplazadas: 30 días, salvo denuncia pendiente | `plazo_reemplazadas` | Desde `decidida_en` (cuando se reemplazó) |
| Textos retirados: 30 días, salvo denuncia pendiente | `plazo_retiradas` | Retiro de moderación (`oculta`), desde `decidida_en` |
| Textos retirados (**interpretación**) | `plazo_borradas` | Borrado del autor, desde `borrada_en` |
| Retenidos y denuncias abiertas: hasta resolverlos | Sin columna | No se pueden purgar |
| Denuncias resueltas: 30 días después del cierre | `plazo_denuncias_cerradas` | Desde `cerrada_en` |
| Historial de moderación: 12 meses | `plazo_decisiones` | Desde `creada_en` |
| Rankings consolidados: 12 meses | `plazo_rankings` | Desde el corte `T(M)` |
| Historial para reconstruir puntos | `margen_historial_puntos` = 30 días | Desde `top_meses.consolidado_en` |

Los meses y los días se suman en hora argentina (`comunidad.mas_plazo`).
Algo vence **en** el instante exacto del plazo: 1 µs antes se conserva.

**Interpretaciones que pido confirmar:**

1. **"Textos retirados" incluye los que borró el autor.** La revisión §5
   proponía 30 días para el borrado del autor. Si el dueño se refería sólo al
   retiro de moderación, alcanza con poner `plazo_borradas = null`.
2. **"Denuncias resueltas" son las cerradas.** Eso incluye `descartada`,
   `resuelta` y el historial mínimo de `denuncias_cerradas`, también
   `cerrada_por_baja`.
3. **Los 12 meses del ranking se cuentan desde el corte del mes.** Así, el
   ranking de octubre de 2026 se ve hasta el 1/11/2027 a las 00:00.
4. **Intervalos de suspensión.** Son a la vez historial de moderación y
   historial de puntos. Se borran recién cuando se cumplen las dos reglas:
   - pasaron 12 meses desde su fin;
   - todos los meses cuyo corte cae dentro del intervalo están liberados
     (consolidados hace más que el margen, o fuera de la conservación).
   Las abiertas nunca se borran.

**Sin configurar**, porque el dueño no definió un plazo:

- **Huellas antispam:** `plazo_huellas` es null. Siguen cayendo con su
  versión (FK en cascada) y con la baja, como dice §5 ("con la versión") y
  como ya pasaba.
- **Sin columna ni purga:**
  - versiones rechazadas, retenidas y con revisión pedida;
  - votos retirados;
  - contadores, bloqueos, excedentes y corroboraciones;
  - marcadores de baja;
  - el propio registro de ejecuciones.

**Texto denunciado tras una baja:** sigue pendiente. La columna
`conservar_texto_denunciado_baja` lo identifica y un CHECK la mantiene en
false, así que activarla exige una migración. La baja sigue borrando ese texto
(016). No hay ningún archivo adicional de textos.

## Qué hace 021

**`comunidad.purgar(alcance, ahora)`.** Es un PROCEDIMIENTO, no una función,
para poder confirmar cada lote. Por eso no tiene cláusula `SET`: todo va
calificado.

- **Alcances:**
  - `'hora'`: sólo las órdenes vencidas;
  - `'dia'`: todo lo demás;
  - el nombre de una categoría, para las pruebas.
- **Orden diario:** denuncias → reemplazadas → retiradas → borradas →
  decisiones → huellas → intentos → rankings → tramos → suspensiones →
  participantes. Lo que libera va antes de lo que protege, así que una
  segunda corrida con el mismo `ahora` no borra nada más (probado).
- **Una corrida por vez:** toma el lock consultivo de sesión 7320. Si otra
  corrida ya lo tiene, la nueva queda registrada como `ocupada`.
- **Interruptor:** se relee antes de cada lote. Apagarlo durante una corrida
  la deja en `apagada_en_curso`.
- **`ahora`:** no puede ser futuro (`ahora_futuro`).

**`comunidad.purga_lote(categoría, ahora, lote)`.** Hace un lote en la
transacción del llamador y devuelve `{borrados, omitidos, seguir}`.

**Registro (`purga_ejecuciones`).** Guarda alcance, `ahora`, inicio, fin,
estado y, por categoría, `{borrados, omitidos, lotes, error}`. El error es
**sólo el SQLSTATE**: un mensaje podría llevar datos. No guarda textos,
nombres, correos, tokens ni ids de filas.

**Ventana del Top Yumpers.** `comunidad_top_yumpers` y `consolidar_mes`
rechazan con `mes_invalido` (22023) un mes cuyo ranking venció. La ruta de E7
ya traduce ese código a 400, así que no cambió.

- `consolidar_mes` lo comprueba antes y después del exclusivo. La purga de
  rankings toma K_CORTE compartido, así que una consolidación que esperaba no
  recrea vacío un mes que se acaba de borrar.
- El down devuelve las dos funciones **exactamente** a 020: el volcado sin
  021 es idéntico al del cierre de E7.

**`supabase/cron-comunidad.sql`** (no ejecutado):

- `comunidad-purga-hora` (`17 * * * *`) y `comunidad-purga-dia`
  (`40 6 * * *`, 03:40 en Argentina);
- `unschedule` previo idempotente;
- SQL puro en Supabase, sin Vercel ni pg_net;
- no enciende la purga;
- trae las instrucciones para desprogramar y para apagar.

## Protecciones

- **Versiones y reseñas.** Nunca se borra:
  - la vigente visible;
  - una retenida o con revisión pedida;
  - una rechazada (sin plazo);
  - una versión con una denuncia abierta;
  - una versión con una denuncia cerrada todavía no vencida, porque la
    cascada la borraría antes de su plazo.

  Una reseña borrada por el autor que contiene una retenida o una rechazada
  **no se purga**. Ver limitaciones.
- **Denuncias.** Una cerrada no se borra si su versión tiene otra abierta: el
  caso sigue abierto.
- **Decisiones.** Se conservan:
  - las de un caso abierto: versión retenida, con revisión pedida, retirada,
    o con una denuncia abierta. El panel sigue mostrando el motivo del
    retiro (probado);
  - la `suspender` de una suspensión que todavía rige;
  - la última pausa o reanudación de la publicación.
- **Tramos.** Sólo se borran los cerrados, y sólo de un mes liberado.
  - Mientras el par pueda volver a producir tramos, se conserva **uno**:
    versión publicada, retenida, con revisión pedida u oculta, reseña viva y
    evaluador con cuenta.
  - Motivo: votar (014) y restaurar o publicar (`reabrir_tramos`, 016) toman
    el mes de la primera positiva de los tramos anteriores del par. Todos los
    tramos de un par llevan el mismo mes.
  - Sin ese tramo, un voto nuevo después de la purga daría puntos en otro
    mes.
- **Mes sin consolidar.** No se libera, salvo que su ranking ya esté fuera de
  la conservación: entonces nadie puede leerlo ni consolidarlo.
- **Participantes.** Sólo los desvinculados por una baja, y sin ninguna fila
  que los referencie: intentos, bloqueos de otros, tramos conservados o
  suspensiones.
- **Permisos.** Ningún objeto nuevo es ejecutable ni legible por
  `anon`, `authenticated`, `service_role` ni PUBLIC. Las tablas tienen RLS
  sin policies y el esquema sigue fuera de PostgREST.

## Locks

La purga **no espera locks de filas**:

- **Reseñas y versiones:** `for update nowait` sobre todo lo que la cascada
  va a borrar, una reseña o versión por subtransacción. Si algo está tomado,
  se saltea y se cuenta en `omitidos`.
- **El resto:** `for update skip locked`.

Como nunca espera, no puede quedar en un ciclo de espera con una operación
real. Lo que saltea queda para la corrida siguiente.

**Únicas esperas, con `lock_timeout = 5s`:**

- **K_CORTE compartido**, en rankings. Si vence, el lote se revierte, se
  registra `55P03` y la corrida sigue (probado).
- **El lock del generador de órdenes (7311)**, en modo `try`: un título que
  se está regenerando se saltea.

Los tramos cerrados, las suspensiones cerradas y las denuncias cerradas no
los modifica nadie, así que borrarlos no compite con votos, retiros ni
ediciones.

## Hallazgos propios, corregidos antes de cerrar

1. **Variable con nombre de alias.** La variable `t record` del lote (para
   órdenes) se comía las referencias `t.x` de las consultas. Tramos, rankings
   y participantes fallaban con `record "t" is not assigned yet`.
   - La batería lo atrapó: la corrida quedaba `con_errores` y no borraba.
   - La renombré y agregué una unitaria que lo impide.
   - Comprobé la unitaria contra la versión con el error: lo detecta.
   - El helper de la batería ahora exige `completa`, salvo que la prueba
     espere otro estado.
2. **Idempotencia del orden diario.** Con `decisiones` antes del contenido,
   una decisión protegida por su versión oculta quedaba libre en la misma
   corrida al purgarse esa versión. La corrida siguiente la borraba, así que
   no era idempotente. Moví `decisiones` después del contenido.

## Pruebas

Salidas en `docs/medidas/2026-10-27-e8-salidas.txt`.

| Prueba | Resultado |
|---|---|
| `pruebas-purga.mjs` (nueva) | **27/27**, tres corridas verdes seguidas tras la última corrección |
| `up-down-up-021.mjs` (nueva) | 6/6: el volcado sin 021 es `3e41cc8f…`, el mismo del cierre de E7 |
| `pruebas-permisos` (con las dos tablas nuevas) | 29/29 |
| `pruebas-top` (ruta real en `localhost:3100`) | 10/10 |
| `pruebas-top-concurrencia` | 6/6 |
| `pruebas-utiles` | 14/14 |
| `pruebas-baja` | 26/26 |
| Unitarias de E8 (barridos de 021 y del cron) y relacionadas | 47/47 |
| Pruebas de `scripts/` | 23/23 |
| `npm test` completo | 2518 pasan, 0 fallan, 16 omitidas |
| `tsc` | 0 |

**Qué cubre `pruebas-purga`.** Todo con funciones reales, el reloj forzado y
datos propios.

- **Cada categoría, justo antes (1 µs), en y después de su vencimiento:**
  intentos, órdenes, denuncias, `denuncias_cerradas`, decisiones,
  reemplazadas, retiradas, borradas, rankings, tramos (margen) y
  suspensiones (dentro de un mes y cruzando un corte).
- **Casos que conserva:**
  - la orden vigente del generador real;
  - una denuncia abierta de hace más de un año;
  - una cerrada con otra abierta en la versión;
  - decisiones de casos abiertos, la suspensión vigente y el último estado
    de la publicación;
  - una reemplazada con denuncia abierta, y otra con una cerrada sin vencer;
    cuando la denuncia vence y se purga, la versión cae (la cadena);
  - una retirada con una versión anterior denunciada;
  - borradas con una retenida, una rechazada o una denuncia abierta;
  - una suspensión abierta;
  - los huérfanos con referencias.
- **Mes sin consolidar y margen posterior:**
  - febrero: 1 µs antes del margen no borra nada; en el margen borra sólo lo
    que corresponde;
  - abril, sin consolidar, no se toca ni con el reloj de hoy;
  - lo consolidado de febrero no cambia y se sigue leyendo igual por la
    función real.
- **Futuras operaciones después de la purga:**
  - votar otra vez abre un tramo con el **mes original**; retirar lo cierra;
  - restaurar reabre con el mes original;
  - editar sigue andando;
  - un reintento con un intento purgado no duplica (`resena_existente`);
  - el autor puede volver a publicar sobre un título purgado.
- **Meses fuera de la conservación:**
  - un ranking vencido se borra con sus resultados;
  - su historial se libera;
  - **no se reconstruye vacío**: `consolidar_mes` rechaza y `top_meses`
    sigue sin la fila;
  - por la lectura con JWT real: 400 y sin consolidar. Para probarlo con un
    mes de 2026, el plazo de rankings se acortó a 8 meses **sólo durante esa
    prueba**;
  - un mes dentro de la ventana da 200.
- **Lotes, reintentos e interrupciones:**
  - con `lote = 2`, cinco intentos salen en 3 lotes confirmados, y el
    registro lleva sólo números;
  - una corrida cancelada mientras espera en rankings deja confirmados sólo
    los lotes anteriores, visibles desde otra sesión con su progreso;
  - el lote cancelado no deja nada: el mes sigue;
  - el reintento completa y la siguiente corrida no borra nada más;
  - la segunda corrida simultánea queda `ocupada`;
  - apagar en curso termina el lote actual y no empieza otro;
  - un `lock_timeout` deja `55P03` registrado y el reintento completa.
- **Concurrencia con operaciones reales en vuelo** (sesiones psql reales,
  esperas observadas en `pg_stat_activity`). Ninguna hace esperar a la
  purga:
  - un voto: la purga de tramos termina, y el voto confirma con el mes
    original;
  - un borrado del autor: la retirada se saltea con NOWAIT y, al confirmar,
    deja de ser candidata;
  - una edición: la purga borra la reemplazada vieja de esa misma reseña y la
    edición confirma;
  - una baja: la corrida diaria completa termina en menos de 4 s, saltea lo
    tomado, y la baja confirma igual;
  - el generador de órdenes: se saltea su título;
  - una consolidación con K_CORTE exclusivo: la purga espera y termina al
    soltarlo.
- **Permisos:**
  - `SET ROLE` anon, authenticated y service_role → `permission denied`;
  - por REST, `rpc/purgar` y `rpc/purga_lote` → 404, o 406 con el perfil;
  - `purga_config` → 406;
  - `cron.job` sigue con sólo `sala-barrido`.
- **Datos ajenos:** una huella de participantes, reseñas, versiones,
  suspensiones, votos, tramos, cuentas y del `SELECT` de profiles, igual
  antes y después.

## Simulaciones y fixtures

- **El reloj de las marcas:** `solo-local-reloj.sql`, como en E7. Se instala
  y se quita en cada corrida, y la definición de `proto_marca` queda igual
  (md5 comparado).
- **`ahora` de la purga:** el parámetro, nunca futuro.
- **Columnas con el reloj REAL de la base,** movidas con UPDATE sobre filas
  de la corrida:
  - `intentos.creado_en`;
  - `top_meses.consolidado_en`;
  - `denuncias_cerradas.cerrada_en`.
- **Órdenes vencidas:** filas propias con la forma que deja el generador. La
  vigente la crea el generador real.
- **Plazo de rankings:** cambiado sólo dentro de algunas pruebas, para
  consolidar meses de 2025 o para probar la ventana con meses de 2026, y
  restaurado en un `finally`.
- **Límites de reseñas, ediciones y denuncias:** subidos durante la corrida y
  restaurados.

## Limitaciones y decisiones que quedan para el dueño

- **Reseñas borradas con una retenida o una rechazada adentro.** No se
  purgan nunca: el dueño dijo "retenidos: hasta resolverlos" y las
  rechazadas no tienen plazo. Pero el admin no puede resolver una retenida de
  una reseña borrada (situación `borrada`), así que hoy quedan para siempre.
  Hace falta una decisión.
- **Menos cobertura de duplicados propios.** Las huellas caen con su versión,
  así que purgar una reemplazada o una retirada quita esa huella de
  `duplicado_propio`, que compara el hash con todas las huellas del autor sin
  ventana. Es lo que dice §5 ("con la versión"), pero es una consecuencia que
  conviene tener a la vista.
- **Peso de quien denuncia.** `cola_denuncias` cuenta sus descartadas. Al
  purgar las cerradas a los 30 días, sólo cuentan las de los últimos 30 días.
- **Meses que nadie leyó.** Si ninguna lectura consolida un mes, su historial
  queda hasta que el mes sale de la conservación (12 meses). La revisión
  §2.5 menciona un job de consolidación mensual. No lo agregué porque el
  pedido fue "cada hora: órdenes; una vez al día: el resto". Se puede sumar
  al job diario si se autoriza.
- **Corridas interrumpidas:**
  - quedan en el registro como `en_curso`, sin `terminada_en`;
  - el lock de corrida se libera al cerrar la sesión: pg_cron abre una
    conexión por corrida, pero una sesión manual larga lo retiene hasta
    cerrarse.
- **Ids sueltos.** Un participante purgado deja su id en `top_resultados`,
  `decisiones` y `denuncias_cerradas`, que no tienen FK. Se lee como "Cuenta
  eliminada", igual que antes de la purga.
- **Órdenes en el borde de las 2 horas.** Un lector que validó su orden un
  instante antes del vencimiento puede encontrarla borrada en la sentencia
  siguiente: recibe una página vacía. Es el mismo margen que ya tenía el
  generador de 018, que borra con el mismo criterio.
- **Sin probar:**
  - la ejecución desde pg_cron: no se instaló nada, y el CALL se probó desde
    psql;
  - backups: la purga no los alcanza (§5, E0);
  - volumen real y tiempos a escala;
  - Producción.

## Limpieza

- Borré sólo lo de esta corrida:
  - cuentas, participantes, reseñas, votos, tramos, denuncias, decisiones y
    suspensiones;
  - órdenes de mis títulos;
  - los meses de prueba, verificados libres al empezar;
  - las ejecuciones de purga: el registro estaba vacío al empezar.
- Quité el reloj y el esquema `solo_local`. Restauré la configuración de la
  comunidad y la de la purga.
- La base quedó como al empezar, con 021 aplicada:
  - 6 participantes, 2 versiones, 42 cuentas y 2 suspensiones;
  - 0 tramos, votos, órdenes, decisiones, meses, intentos, denuncias,
    huellas y ejecuciones;
  - límites 5/10/100/10/3/50;
  - módulo, publicación, Top Yumpers y muestreo apagados;
  - **purga apagada**;
  - `SELECT` de `profiles` revocado;
  - `cron.job` con sólo `sala-barrido`;
  - sin locks consultivos.
- Docker Desktop estaba detenido: lo inicié sin tocar volúmenes. Detuve el
  servidor local de la app que usó `pruebas-top`.
