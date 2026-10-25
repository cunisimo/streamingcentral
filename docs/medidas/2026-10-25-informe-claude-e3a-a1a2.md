# Informe para Codex — correcciones A1/A2 de E3a (25/10/2026)

Autor: Claude. Rama `feat/resenas-reglas`, worktree `wt-resenas-comunidad`.
Sólo `supabase start` y el servidor local, con cuentas ficticias
`@comunidad.test`. Sin Producción, E0, servicios externos, push, merge,
deploy ni AAB. E3b no empezó.

Auditoría corregida: `docs/medidas/2026-10-24-auditoria-e3a-faabf5a.md`
(copia sin cambios, SHA-256 `98c619f9…`, igual a la del checkout principal).

| Commit | Contenido |
|---|---|
| `98eba43` | Copia de la auditoría |
| `8bdfe3f` | A1: clasificación de errores, reconciliación, rutas, mensajes y pruebas |
| `d66244b` | A2: estado del editor, claves por cuenta y título, pruebas y recorrido |
| (este) | Informe, salidas y `docs/ESTADO.md` |

Salidas: `docs/medidas/2026-10-25-e3a-a1a2-salidas.txt`. Capturas:
`docs/medidas/2026-10-25-e3a-a1a2-recorrido/`.

## A1 — Confirmación perdida entre el servidor y Supabase

**Qué cambió.** Todo error de `supabase.rpc` sale clasificado
(`errorRpc` en `lib/comunidad/escritura-nucleo.ts`). Tres casos:

1. **Antes de enviar la escritura** (pedido inválido, formato, contexto de
   reglas, reglas que lanzan): `error` o el rechazo correspondiente, sin
   tocar la base. No cambió.
2. **Rechazo confirmado por la base:** un SQLSTATE o un código de PostgREST.
   La transacción se revirtió. Resultado: `error` (HTTP 500), sin reintento.
   CB001 sigue siendo `baja_en_curso`.
3. **Confirmación perdida:** se desconoce el resultado y pudo haber quedado.
   Abarca:
   - un `fetch` que lanza (medido: status 0, code `""`);
   - un 5xx sin código, como un proxy con 502 HTML;
   - un 200 con un cuerpo que no es un resultado;
   - cualquier excepción sin clasificar;
   - SQLSTATE que no prueban la reversión: clases `08`, `57P`, `58` y `XX`,
     `40003`, y `PGRST000/001`.

   La escritura se repite **una vez** con el mismo `id_intento` y el mismo
   hash. Si había quedado, la base devuelve el resultado guardado con
   `repetido`. Si tampoco se confirma, el resultado es `sin_confirmar`
   (HTTP 503) con el mensaje "No sabemos si se guardó…". **Nunca dice "no se
   guardó".**

   Si el primer intento se perdió y el reintento lo rechaza la base, también
   es `sin_confirmar`, porque el primero pudo haber quedado.

**Traducción compartida.** Votar, retirar, borrar y aceptar términos pasan
por la misma reconciliación (`conReconciliacion` en `escritura-deps.ts`).
Repetirlas no tiene efecto:

| Operación | Respuesta al repetirla |
|---|---|
| Votar | `sin_cambios` |
| Retirar | `sin_efecto` |
| Borrar | `borrada` con `repetido` |
| Aceptar términos | idempotente |

`operar()` ahora sólo traduce rechazos confirmados. `estadoHttp` pasó al
núcleo puro y suma `sin_confirmar` → 503. `mensajeEscritura` y `mensajeVoto`
tienen el caso explícito, y el cliente conserva el `id_intento`, como ya
hacía con lo desconocido.

**Pruebas reales.** Sección "A1 ·" de `scripts/comunidad/pruebas-escritura.mjs`.
El cliente de Supabase de la prueba hace el pedido **real** a PostgREST y
después descarta la respuesta: lanza como un `fetch` caído o la cambia por un
502 HTML.

| Prueba | Sobre `faabf5a` | Ahora |
|---|---|---|
| Publicar con la respuesta perdida tras el commit: `publicada` con `repetido`, una reseña, una versión, un cupo | ✖ `{"resultado":"error"}` | ✔ |
| Editar con 2 votos y la respuesta perdida: `publicada`, `votos_reiniciados` 2, **una** marca de reinicio, 2 versiones, una edición contada | ✖ `{"resultado":"error"}` | ✔ |
| Se pierden las dos respuestas (red): `sin_confirmar`; la base muestra la edición guardada; el reintento normal con el mismo id da `repetido`, sin cambios en la base | ✖ | ✔ |
| Lo mismo con 502 HTML | ✖ | ✔ |
| Votar, retirar y borrar con la respuesta perdida, y votar con las dos perdidas (`sin_confirmar`, el voto había quedado) | ✖ | ✔ |
| Rechazo confirmado (check_violation 23514 por el adaptador; decisión inválida 22023 por el núcleo): `error`, **una** llamada, versión, votos y cupo intactos | ✖ (sin clasificación) | ✔ |

**El caso de error confirmado sigue separado.** La prueba de `lock_timeout`
(55P03) de §3.4.1 ahora fija además que no hay reintento (una sola espera,
menos de 9 s) y que el cupo quedó intacto. Pasa: 9/9 en la sección §3.4.1.

**Unitarias (`lib/comunidad/escritura.test.ts`).** 6 nuevas, sobre:
- la tabla de clasificación;
- la reconciliación de publicar y editar con los mismos argumentos;
- las dos pérdidas;
- la secuencia "perdida y luego rechazo";
- `conReconciliacion`;
- HTTP y mensajes.

Dos pruebas viejas cambiaron su esperado, y es a propósito:
- una excepción sin clasificar del adaptador ya no es `error`, es
  `sin_confirmar`;
- el CB001 se construye con `errorRpc`, como lo produce el adaptador real.

## A2 — Borrador y versión base del editor

**Qué cambió.** El estado del editor está en `lib/comunidad/editor-nucleo.ts`,
que es puro: `EstadoEditor { base, texto, editando, remoto }`.

`base` es la versión **desde la que** se edita. De ahí salen
`version_esperada` (`cuerpoEnvio`), la firma del intento y el aviso de
reinicio. El componente ya no los toma de la prop `mia`.

Cuando llega otra versión persistida (`alCambiarPersistida`):

| Situación | Qué pasa |
|---|---|
| Sin edición abierta | Se adopta |
| La misma versión que la base | Nada |
| Edición sin borrador, o la versión trae exactamente el texto del borrador (el propio envío, con la respuesta perdida o adelantada por otra recarga) | Se adopta; no hay nada que perder |
| Con borrador y otra versión | Se conservan texto, base y edición; aparece el aviso "modificada" |
| Con borrador y borrado remoto | Se conservan texto, base y edición; aparece el aviso "borrada" |

Las decisiones son explícitas:
- "Cargar la versión nueva": descarta el borrador.
- "Usar mi borrador sobre la nueva": la nueva pasa a ser la base y el intento
  es nuevo.
- Tras un borrado: "Publicarla como nueva" o "Descartar el borrador".
- Si el borrador era una reseña nueva y otra sesión publicó una en el mismo
  título: "Ver la publicada" o "Reemplazarla con mi borrador".

Sin decidir, el envío sale contra la base original. La base devuelve
`conflicto` (o `resena_existente` o `no_encontrada`), el editor recarga y el
mensaje remite al aviso: "No se guardó: …". Es un rechazo confirmado, así que
afirmarlo es correcto.

El guardado propio confirmado actualiza el editor (`trasGuardado`), tanto si
la recarga llega antes como después de la respuesta.

**Cuenta y título.**
- `EditorResena` se monta con `key={claveEditor(uid, titulo)}`, en lugar de
  la clave constante `"editor"`. El estado y el `id_intento` (un `useRef`)
  nacen de nuevo.
- La página de revisión local se monta por título, como ya lo hacía
  `DetailView`.
- Una recarga que falla conserva los datos visibles. Antes los vaciaba, el
  editor se desmontaba y el borrador se perdía: es otra vía del mismo
  hallazgo, encontrada al corregirlo.

**Regresiones (`lib/comunidad/editor-estado.test.ts`, 8).** Cubren:
- V1→V2 con borrador: texto, base, `version_esperada`, firma, aviso, y una V3
  que actualiza el aviso;
- las dos decisiones sobre V2;
- el borrado remoto: aviso, publicar como nueva con el cuerpo `publicar`, y
  descartar;
- una reseña nueva en borrador cuando otra sesión publica;
- el guardado propio en los dos órdenes;
- el caso sin borrador;
- cuenta y título: claves distintas, y lectura del código que fija las tres
  `key`, el intento local y que la recarga fallida no vacía los datos;
- que el componente envíe `cuerpoEnvio(e, …)` y no `mia`.

**Recorrido en navegador.** Servidor local en 3100,
`/revision-local/comunidad`. El "otro dispositivo" es la misma cuenta
escribiendo con las funciones reales (helper del scratchpad). La recarga se
dispara votando una reseña ajena en la pantalla, como en la secuencia de la
auditoría.

| # | Captura | Qué muestra |
|---|---|---|
| 01 | `01-antes-faabf5a-borrador-descartado` | **Antes**, con los dos componentes de `faabf5a` puestos temporalmente. Hay un borrador en edición; el otro dispositivo guarda una versión nueva; un voto recarga. El borrador desapareció y la edición se cerró sin preguntar. Leído en la página: el textarea pasó del borrador a `null` y la vista quedó en la versión remota. |
| 02 | `02-despues-aviso-version-remota` | Ahora, la misma secuencia: aviso con las dos decisiones y el borrador intacto |
| 03–04 | `03-…tras-guardar-sin-decidir`, `04-…conflicto-borrador-intacto` | "Guardar cambios" sin decidir. La respuesta de la ruta fue `{"resultado":"conflicto","motivo":"version","version_vigente":237}`: el envío salió contra la base 236. El borrador sigue y el mensaje remite al aviso |
| 05 | `05-despues-guardado-propio-actualiza` | "Usar mi borrador sobre la nueva" y guardar: publicada. El editor se cierra y muestra el texto propio. En la base, la versión 238 reemplaza a la 237 |
| 06–07 | `06-…borrado-remoto-borrador-intacto`, `07-…publicada-como-nueva` | Borrado remoto con borrador: aviso, y el texto sigue. "Publicarla como nueva" crea la reseña 185 con el borrador |
| 08 | `08-…cambio-de-titulo-sin-borrador` | Hay un borrador en 9701. Navegación de **cliente** a 9702 (`router.push`; una marca en `window` prueba que fue la misma página): "Escribí tu reseña" vacío |
| 09 | `09-…resena-nueva-publicada-en-otro-dispositivo` | Borrador nuevo en 9702 mientras el otro dispositivo publica en 9702: aviso "Publicaste…", con el borrador intacto |
| 10 | `10-…otra-cuenta-sin-borrador` | Con ese borrador abierto, en otra pestaña se cierra la sesión y se entra con la segunda cuenta ficticia. La pestaña original muestra el formulario vacío, sin aviso ni borrador |

## Verificación ejecutada

Todo en secuencia, sobre la base local compartida.

| Qué | Resultado |
|---|---|
| A1 real (`SOLO='A1 ·'`) sobre `faabf5a` con la batería nueva | 0/6 (esperado: es la regresión) |
| A1 real después | 6/6 |
| §3.4.1, incluidos lock_timeout y fallo técnico | 9/9 |
| Idempotencia (`SOLO='id_intento'`) | 5/5 |
| Gates 1–4 con las funciones reales | 5/5 |
| Rutas HTTP con el servidor local, después de A1 y A2 | 3/3 |
| `node --test lib/comunidad/*.test.ts` | 37/37 (escritura 29, editor-estado 8) |
| `npx tsc --noEmit --incremental false` | exit 0 |
| `npm test` | 2417: 2399 pasan, 0 fallan, 18 omitidas por builds ausentes |

Cada sección de la batería terminó con restos `0|0|0|0`.

**Nota sobre `npm test`:** con el `.next` que deja `next dev` en el worktree,
dos pruebas de `lib/metricas-nativo.test.ts` fallan. Miran un bundle **de
producción** que ese directorio no tiene. Con el directorio apartado se
omiten (2 pasan y 2 se omiten), y el resultado de la tabla es con él
apartado. No es un efecto de estos cambios.

**No se repitieron**, porque estos cambios no los tocan:
- la batería E3a completa: las secciones de matriz, límites con carreras,
  B3a/B3b, actores cruzados y acceso directo;
- up/down/up, permisos, invariantes, baja, concurrencia;
- Salas, builds, Android.

014 y su SQL no cambiaron. El cambio de A1 es del lado del servidor y no
modifica qué se escribe. A2 es sólo interfaz.

## Limpieza y estado final

- Cuentas, participantes, reseñas, intentos y contadores del recorrido y de
  cada batería: borrados por id. Restos 0.
- `comunidad.config`: `modulo_activo`, `publicacion_activa` y
  `top_yumpers_activo` en `false`; límites 5/10/100, como estaban.
- Servidor de desarrollo detenido. La configuración temporal de lanzamiento
  quedó retirada del `launch.json`. El worktree temporal del "antes"
  (`scratchpad/antes-a1`, con un enlace a `node_modules`) quedó eliminado: se
  quitó primero el enlace y se comprobó que el `node_modules` real seguía
  intacto.
- Siguen en la base 42 cuentas `@comunidad.test`, todas creadas el 24/10
  entre 15:31 y 23:46, de las baterías de permisos y sus fixtures. Ninguna es
  de esta entrega y no las toqué. Las reseñas de fixture en 603 siguen.

## Limitaciones y lo que no se probó

- **El "antes" de A1 en la app:** no se reprodujo con el servidor y el
  navegador; se reprodujo con la batería contra las funciones reales. La
  ruta HTTP con 503 `sin_confirmar` está cubierta por la prueba unitaria de
  `estadoHttp` y por el parseo del cliente, que ya lee el cuerpo con
  cualquier status. No hay una prueba HTTP con la respuesta perdida entre el
  servidor y Supabase dentro del proceso de Next.
- **La clasificación de SQLSTATE inciertos** (08, 57P, 58, XX, 40003 y
  PGRST000/001) es conservadora y se fijó por tabla. Sólo se **midieron**
  `fetch` caído, 502 sin JSON, 400/SQLSTATE, PGRST202 y PGRST002. No se
  provocó una caída de conexión real a mitad del commit.
- **Un único reintento interno.** Si también se pierde, la respuesta es
  `sin_confirmar` y el usuario reintenta con el mismo id, como ya existía.
- **El cambio de cuenta en el navegador** pasó por un estado sin sesión: la
  sección se desmontó entre una cuenta y otra. El paso directo de A a B con el
  editor montado lo cubre la `key` por cuenta, que fija un test por lectura
  del código, pero no se recorrió en navegador.
- **El "antes" de A2** se reprodujo con los dos componentes de `faabf5a` y el
  resto del código actual: el núcleo nuevo es aditivo y los componentes
  viejos no lo usan. El primer intento de reproducirlo se descartó: el clic
  de voto cayó sobre la barra inferior. Se repitió con clic por script sobre
  el botón.
- **Ficha real con TMDB y Android:** no verificados, como en E3a.
- Siguen sin cambios:
  - la decisión sobre ZWJ y los emojis compuestos;
  - moderación, retención, N y E1 (no aprobada);
  - el AAB conjunto con Salas.

**Se detiene acá para la auditoría focalizada de A1/A2.** E3b no empieza sin
autorización.
