# Informe de Claude para Codex: E3a local (24/10/2026)

Rama `feat/resenas-reglas`, worktree `wt-resenas-comunidad`. Todo corrió sólo
contra `supabase start` y la app local (`localhost:3100`,
`.env.comunidad-local`), con cuentas ficticias.

Los interruptores del módulo se encendieron sólo durante las corridas y el
recorrido. **Quedaron apagados.** Las reglas de E1 se integraron como
candidatas: no hay aprobación de E1 ni contenido real.

No hubo Producción, E0, push, merge, deploy ni AAB.

**Qué pide la auditoría:** E3a. No hace falta repetir E2a, E2b ni E2c.

## Commits

| Commit | Qué |
|---|---|
| `2794683` | Copia de la auditoría de `f67ff90` (SHA-256 `6547a056…`) y estado: E2c cerrada |
| `64daf53` | Migración 014 (+ down); 014 en db-local y up/down/up; inventarios de permisos |
| `c2bf84a` | Rutas, núcleos, interfaz, CSS, página de revisión local, exclusión del build Android |
| `5ee5133` | `scripts/comunidad/pruebas-escritura.mjs` |
| (este) | Salidas, 15 capturas, este informe, ESTADO y plan |

## Qué se construyó

### Base: `014_comunidad_escritura.sql`

Hashes: 014 `b65a52e6…`; su down `855be793…`.

**Términos.** `config.terminos_version` y la versión aceptada por cada
participante. Aceptar es lo único que crea la identidad comunitaria. El
texto es un **borrador local sin aprobar** (`lib/comunidad/terminos.ts`).

**Idempotencia.**
- La tabla `comunidad.intentos` tiene clave (participante, acción,
  id_intento) y guarda el hash del pedido normalizado y el resultado.
- Mismo id con el mismo hash: devuelve el resultado guardado, con
  `repetido`.
- Mismo id con otro hash: `{resultado: "conflicto", motivo: "intento"}`.

**Funciones de API, sólo `service_role`.**
- `comunidad_publicar`, `comunidad_editar` y `comunidad_borrar`;
- `comunidad_votar` y `comunidad_retirar_voto`;
- `comunidad_aceptar_terminos` y `comunidad_textos_recientes` (el
  contexto de las reglas);
- `comunidad_leer_titulo`: lectura **provisional mínima** (la propia en
  cualquier estado, y las publicadas de otros), que reemplaza E5a.

**Protocolo.** Cada escritura sigue este orden:
1. `proto_cuenta`, sin bloquear la fila del actor;
2. participantes;
3. reseña;
4. versiones;
5. votos y tramos;
6. suspensiones;
7. contadores;
8. relectura de todo lo bloqueado;
9. `proto_marca`;
10. mutación.

Nada se escribe antes de la marca. **Bloqueos implícitos revisados:**
- las FK de las inserciones toman `KEY SHARE` sobre filas que ya se
  bloquearon antes (participantes, versiones);
- `intentos` sobre el participante propio;
- ninguna toca filas de otro actor fuera de orden.

**Matriz (§2.1.2).**
- Fila A (publicar, editar, votar) exige:
  - módulo activo y publicación no pausada;
  - ninguna suspensión vigente;
  - correo confirmado;
  - términos vigentes;
  - cupo diario.
- Fila B (borrar la propia, retirar el voto propio) sólo exige propiedad.
- La baja en curso rechaza todo con CB001, desde E2b.

**Hallazgo y corrección: triggers diferidos.** Los triggers de vigencia de
011 (`resenas_vigencia`, `versiones_vigencia`) son diferidos y corren al
**confirmar**, ya fuera de la función `security definer`, con el rol de la
sesión. Por REST, `service_role` recibía `permission denied for schema
comunidad`.
- Corrección: publicar y editar terminan con `set constraints all
  immediate`, así las comprobaciones corren dentro de la función, con el
  dueño, y siguen siendo obligatorias.
- No se le dio a la API ningún permiso nuevo.
- La primera corrida de la batería falló por esto (6/37). Su resumen está en
  `e3a-salidas.txt`.

### Servidor

- `lib/comunidad/texto.ts` define la **misma** forma en pantalla, servidor y
  base:
  - la normalización de E1 (copiada y fijada por test contra
    `normalizarOriginal`);
  - el largo en puntos de código, igual que `char_length`;
  - los caracteres que el CHECK de 011 rechaza. La regla de formato de E1
    deja pasar la tabulación y algunos invisibles; sin este control, esos
    textos fallarían recién en la base.
- `escritura-nucleo.ts` es puro y fija el orden: forma, texto, contexto,
  reglas de E1, hash, función. `error` de las reglas significa "No se pudo
  guardar"; un fallo nunca publica. El rechazo de formato no toca la base ni
  consume cupo. El rechazo de contenido sí llega a la base, consume cupo y
  queda como intento, pero el texto no se guarda.
- `escritura-deps.ts` tiene los adaptadores reales. La batería corre este
  mismo código.
- Rutas, todas con Bearer, CORS y respuestas sin caché:
  - `POST /api/comunidad/resenas` (crear y editar);
  - `POST /api/comunidad/resenas/borrar`;
  - `POST /api/comunidad/votos`;
  - `POST /api/comunidad/terminos`;
  - `GET /api/comunidad/titulo`.

  El uid sale del token.

### Interfaz

- `ResenasComunidad` va en la ficha como un acordeón cerrado (puede haber
  spoilers). Se pide desde el cliente con Bearer; sin sesión o con el módulo
  apagado no dibuja nada.
- `TerminosComunidad`.
- `EditorResena`:
  - contador igual al del servidor, que avisa **antes** de enviar los
    caracteres que la base rechaza;
  - aviso "Al editar tu reseña se reinician los votos de utilidad",
    también en el diálogo de confirmación;
  - borrar con confirmación;
  - reintento con el mismo id_intento;
  - "No sabemos si se guardó…" ante una respuesta perdida.
- `EvaluacionResena`: "Me sirvió" / "No me sirvió"; tocar el botón elegido
  retira el voto; conteo "A n de m les sirvió"; la propia no se evalúa.
- Las decisiones están en núcleos puros con tests: `editor-nucleo.ts` y
  `evaluacion-nucleo.ts`.

**Página de revisión local** (`/revision-local/comunidad?id=603`). La ficha
real necesita TMDB, y el entorno local de reseñas no tiene ese token (no se
usa `.env.local`). La página monta **el mismo componente**. Responde 404
salvo con `next dev` y `COMUNIDAD_REVISION_LOCAL=1`, que sólo está en
`.env.comunidad-local`. Está excluida del build de Capacitor, y un test fija
las dos cosas.

## Pruebas ejecutadas por Claude, en secuencia

| Prueba | Resultado |
|---|---|
| `pruebas-escritura.mjs` | **37/37** (la primera corrida, 6/37, falló por los triggers diferidos) |
| `up-down-up.mjs` | 16/16 |
| `pruebas-permisos.mjs` | 27/27 |
| `pruebas-invariantes.mjs` | 81/81 |
| `pruebas-baja.mjs` | 26/26 |
| `pruebas-concurrencia.mjs` | 21/21 |
| `tsc` | 0 errores |
| `npm test` | 2403 pruebas: 2387 pasan, 0 fallan, 16 omitidas por builds ausentes |

Detalle de las filas que lo necesitan:
- **up/down/up:** 014 up → down → up reproduce `840a7c4d…`; sin 014 da
  `35aed9fc…`, igual a E2c corregida.
- **Permisos:** inventario de 12 tablas y 12 funciones `public.comunidad_*`;
  cada JWT y `anon` reciben 401/403 en todas.
- **Invariantes:** la fixture compartida suma una fila de `intentos`.
- **Baja:** sigue verde con 014.
- **Concurrencia:** las fixtures de E2c siguen verdes, como pide el
  criterio de cierre.

**Con funciones reales, gates cerrados (plan §5.0):**

| Gate | Resultado |
|---|---|
| Caso 1 · votar ‖ retirar, mismo evaluador | El segundo espera `K_CUENTA`, relee y retira; tramo `hasta > desde` |
| Caso 2a · la edición primero | El voto a la versión vieja espera la fila del autor y se rechaza (`version_no_disponible`); no escribe nada |
| Caso 2b · el voto primero | La edición espera y lo reinicia (`votos_reiniciados = 1`) |
| Caso 3 · dos ediciones con la misma esperada | La segunda da `conflicto`/`version`; una sola versión nueva |
| Caso 4 · mismo `id_intento` en dos sesiones | Una versión y un reinicio; la segunda devuelve el mismo resultado con `repetido` |
| B3a | Voto real en vuelo: la baja espera, lo borra y cierra su tramo |
| B3b | Baja en vuelo: el voto real espera, relee el marcador y da CB001; nada escrito |
| Cruzados | A evalúa la de B y B la de A: los dos confirman, sin deadlock |
| Cruzados (carga) | 10 pares simultáneos sin coordinar: 20/20 votos, 0 errores |

El caso 5 (suspensión frente a voto) sigue **preliminar** de E2c, con gate
en E4: la suspensión de producto es de E4.

**Tabla de la revisión §3.4.1, resultado obtenido por fila:**

| Caso | Versión anterior | Votos | Resultado |
|---|---|---|---|
| Texto idéntico tras normalizar | Intacta | Intactos | `sin_cambios`; no consume cupo ✔ |
| Rechazo de formato | Intacta | Intactos | `rechazo_formato` sin tocar la base ni el cupo ✔ |
| Rechazo de contenido (teléfono) | Intacta | Intactos | `rechazo_contenido` con el motivo; cuenta una edición; el texto no se guarda ✔ |
| Admisión cerrada | — | — | **No aplica en E3a** (la admisión es de E3b) |
| Fallo técnico (CHECK, llamado directo a la base) | Intacta | Intactos | Error; el cupo también se revirtió ✔ |
| `lock_timeout` (reseña retenida 8 s) | Intacta | Intactos | Error a los ~5 s ✔ |
| Versión esperada distinta | Intacta | Intactos | `conflicto` con la versión vigente ✔ |
| Edición aceptada y publicada | Reemplazada; tramos cerrados | Reiniciados **una** vez (3 → 0) | Nueva publicada ✔ |
| Edición aceptada y retenida | Reemplazada; deja de verse para otros | Reiniciados una vez | Nueva retenida; el autor la ve "En revisión" ✔ |
| Reintento tras confirmar (respuesta perdida) | — | Un solo reinicio | Mismo resultado con `repetido`; una versión; una edición contada ✔ |
| Mismo `id_intento` con otro texto | Intacta | Intactos | `conflicto`/`intento`, sin datos del primero ✔ |

**Otras pruebas de la batería:**
- **Matriz:** A × {suspendido, correo pendiente, términos nuevos,
  publicación pausada, módulo apagado} se rechaza con el motivo, sin
  escribir. B (borrar, retirar) se permite en todos esos casos. Con baja en
  curso, A y B dan CB001.
- **Sin términos:** no se crea identidad.
- **Términos desactualizados:** no se acepta nada.
- **Propiedad:** no se edita ni borra lo ajeno; no se evalúa la propia; una
  reseña viva por título; borrar es idempotente.
- **Límites con carreras:** con un límite de 2, cinco publicaciones
  simultáneas dejan entrar exactamente 2. Con un límite de 1 para
  evaluaciones, cuatro votos simultáneos dejan entrar 1.
- **Rutas HTTP:** 401 sin sesión en las cinco; 400 con cuerpo inválido;
  flujo de punta a punta con JWT. Un `uid` en el cuerpo se ignora: el autor
  es el del token. Con el módulo apagado, la lectura devuelve
  `{activo:false}`.
- **Acceso directo:** un JWT no lee las tablas (con y sin perfil) ni ejecuta
  las funciones por RPC.

## Recorrido visual

Capturas en `docs/medidas/2026-10-24-e3a-recorrido/`, en escritorio y con
375 px. Las 15 capturas, en orden:

1. Términos.
2. Hallazgo: el emoji de familia lleva ZWJ, y "Publicar" quedaba habilitado
   aunque la ruta lo rechazaba.
3. Corregido: el aviso aparece antes de enviar, con el botón deshabilitado.
4. Publicada, con el contador en 120. La base guardó `char_length` = 120.
5. "Me sirvió": "A 1 de 1 le sirvió". Tocarlo otra vez retira el voto.
6. Aviso de reinicio al editar.
7. Diálogo de confirmación.
8. Editada; el voto de la otra cuenta quedó reiniciado.
9. Rechazo por teléfono con su motivo; la versión publicada sigue intacta.
10. "En revisión" con el texto de spam.
11. Respuesta perdida, simulada con un envoltorio de `fetch` que descarta
    la respuesta: "No sabemos si se guardó…".
12. El reintento manda el **mismo** id_intento: "publicada", sin una
    versión de más.
13. Editor con 375 px, sin desbordamiento horizontal.
14. Confirmar el borrado con 375 px.
15. Borrada.

**Correcciones de interfaz encontradas en el recorrido:**
- el aviso de caracteres antes de enviar;
- el mensaje que se perdía al volver a montar el editor;
- el estilo del botón deshabilitado.

**Para revisarlo el dueño:**
1. `supabase start`.
2. `node scripts/sala/db-local.mjs`.
3. Encender los interruptores a mano.
4. Levantar `next dev` con `.env.comunidad-local`.
5. Abrir `/revision-local/comunidad?id=603`.
6. Apagar los interruptores al terminar.

## Límites y diferencias con el plan

- **Hallazgo: ZWJ.** El CHECK de 011 prohíbe U+200D (ZWJ), así que **no se
  pueden guardar emojis compuestos** (familias, profesiones, algunas
  banderas de género). No reabrí E2a. Ahora pantalla, servidor y base
  coinciden, pero la decisión de producto queda abierta.
- **Dependencias mínimas de otras entregas:**
  - términos con texto borrador;
  - lectura provisional. No filtra bloqueos ni suspensiones del autor y no
    pagina: es de E5a;
  - página de revisión local.
- **No construido:** admisión y colas, duplicados y "Pedir revisión" son
  de E3b; nombres, de E6. Sin admisión, con la publicación encendida,
  podrían acumularse retenidos sin tope. Por eso la publicación sigue
  apagada.
- **Riesgo aceptado:** la decisión de reglas viaja de la ruta a la
  función. La función valida su forma y sólo `service_role` la ejecuta,
  pero no vuelve a correr las reglas.
- **Contador del día:** el día argentino se toma antes de los locks. Una
  operación que cruce la medianoche podría contarse en el día anterior.
- **Cancelación de la baja con datos de E3a:** con baja en curso, B también
  da CB001, porque el paso 1 ya borró lo comunitario. Las filas de
  `intentos` de un participante dado de baja quedan con el seudónimo hasta
  la purga (E8, 7 días).
- **No verificado:**
  - la ficha real con TMDB (sólo el mismo componente en la página local);
  - Android;
  - Producción y E0;
  - la carga real de la cola.
- **Orden de despliegue:** 011 → 014 antes de este código. Sin ellas, la
  escritura responde "error" y no guarda nada.

## Limpieza

Cada batería borra sus cuentas, participantes, sesiones y locks: restos
`0|0|0|0`, y la configuración restaurada con los interruptores apagados. El
recorrido también: 0 cuentas, 0 participantes, interruptores en `false`.

**Datos de otras corridas en la base compartida.** Siguen las cuentas
`@comunidad.test` antiguas de la batería de permisos de E2a, de Claude y de
Codex. Dos de ellas tienen reseñas de fixture publicadas en el título 603 y
aparecen en el recorrido; no las toqué.

**Una limpieza demasiado amplia.** En un diagnóstico intermedio usé un
borrado de "participantes huérfanos de los últimos 5 minutos". En ese
momento sólo podía alcanzar al participante del propio diagnóstico, pero la
condición era más amplia de lo debido. No volví a usarla: la batería
registra los ids que crea.

**Al terminar:** el servidor de la app quedó **detenido**, y Docker Desktop
quedó encendido. Lo inicié yo, porque la máquina se había reiniciado.
