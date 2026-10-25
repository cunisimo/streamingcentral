# Correcciones A1/A2 de la auditoría de E3b — 25/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`64d940e`. Auditoría de origen: `docs/medidas/2026-10-25-auditoria-e3b-64d940e.md`,
copiada sin cambios del checkout principal (mismo SHA-256, `ea14052a…`).
Sólo Supabase local, datos ficticios y pruebas en secuencia. Sin E4, Producción,
E0, servicios externos, push, merge, deploy ni AAB.

## A1 — Aislamiento al cambiar de cuenta

**Causa:** el estado de las pantallas no tenía frontera por cuenta. Las
respuestas de A se aplicaban sin mirar la cuenta, y cada pedido tomaba el token
de la sesión *del momento*, no el de la cuenta que lo inició.

**Corrección:**
- `/cuenta/bloqueados`, las reseñas de la ficha (`ResenasComunidad`) y la fila
  de Configuración (`FilaBloqueados`) montan su estado por cuenta.
  - En la página y en la ficha el estado se monta con `key={uid}`; en la
    ficha, la clave es la de cuenta y título.
  - Ese estado incluye lista, títulos, mensajes, confirmación, aviso de
    bloqueo y diálogos.
  - Al cambiar de cuenta o cerrar sesión, todo ese estado se desmonta.
- `lib/comunidad/frontera-cuenta.ts` (puro):
  - `crearFrontera(uid)` descarta las respuestas de instancias desmontadas y
    las de cargas superadas de la misma cuenta. Así cubre las respuestas
    fuera de orden. Se reabre con Strict Mode.
  - `tokenDeCuenta(sesión, uid)` sólo entrega el token si la sesión sigue
    siendo de la cuenta que inició el pedido. Si cambió en el medio, el pedido
    no sale.
- La fila de Configuración sólo muestra la decisión tomada para la cuenta
  actual.
- **Lo que no cambia:** una recarga fallida de la misma cuenta conserva los
  datos y el borrador (la corrección A2 de E3a). En la página de bloqueados se
  agregó "Cargando…" mientras no hay lista.

Lo que A ya envió y llegó al servidor se aplica a A, como corresponde. B no ve
ni el resultado ni el mensaje.

## A2 — Denuncia recibida y bloqueo pendiente

**Corrección:**
- `trasDenuncia` y `trasReintentoBloqueo`, en `menu-nucleo.ts` (puros), separan
  los dos resultados.
- Cuando la denuncia tiene resultado definitivo, el formulario se cierra y
  queda el mensaje de la denuncia. Es definitivo si fue recibida, o si fue
  rechazada habiendo pedido bloquear.
- Si el bloqueo quedó pendiente, se ofrece **"Reintentar el bloqueo"**:
  - pide `POST /api/comunidad/bloqueos {accion: "bloquear"}`, que es
    idempotente;
  - no reenvía la denuncia ni suma excedente;
  - si el bloqueo es incierto, dice "No sabemos si se guardó el bloqueo…";
  - si hubo error confirmado, dice "No se pudo bloquear, probá de nuevo.".
- Un rechazo definitivo deja sólo "Cerrar". Son rechazos el límite diario, el
  bloqueo propio y la eliminación pendiente.
- Si lo incierto es la denuncia, se mantiene el "Reintentar" del pedido
  completo, como antes. La denuncia repetida vuelve como `repetido`.

**Hallazgo del recorrido, corregido en esta entrega:**
- Antes, con el bloqueo aplicado en la base y la respuesta perdida, la recarga
  posterior a la denuncia quitaba la reseña.
- La lectura ya no la traía, así que desaparecían también el diálogo y el
  reintento.
- Ahora la recarga por la denuncia espera a que se cierre el diálogo. Un
  barrido lo fija.

## Pruebas

**Preliminares:** núcleos puros y modelos; no montan React ni usan red.
- 21 focalizadas:
  - 10 de A1: A→B cargando o fallando, respuesta tardía de A, cargas fuera de
    orden, cierre de sesión pendiente, cambio durante el desbloqueo, sesión
    cambiada antes de enviar, recarga fallida de la misma cuenta y barrido;
  - 11 de A2: las cuatro combinaciones pedidas, los rechazos definitivos, la
    denuncia incierta, el reintento sucesivo, un modelo con servidor que
    cuenta (1 denuncia, 1 bloqueo, excedente 0) y barridos.
- Vecinas: moderación, editor, escritura y CORS, 77/77.
- `npm test`: 2445 pasan, 0 fallan, 16 omitidas.
- `tsc`: 0 errores.

**Reales:** navegador con la app local, Auth local y Supabase local, en
escritorio y a 375 px, con datos ficticios.
- Lo **simulado** dentro del recorrido:
  - el cambio de cuenta reproduce lo que hace un inicio de sesión en otra
    pestaña: guarda la sesión de B y avisa por el canal de Auth;
  - las demoras, fallas y respuestas perdidas son un interceptor de `fetch` en
    la página. El pedido llega a la base; se retiene, se hace fallar o se
    reescribe la respuesta.
- A1, todo correcto:
  - en bloqueados, B cargando y B fallando no muestran la fila de A;
  - la respuesta tardía de A no reemplaza la lista de B;
  - un desbloqueo de A en vuelo no deja mensaje ni recarga en B;
  - el cierre de sesión con una lectura pendiente redirige;
  - en la ficha, una denuncia con bloqueo de A en vuelo no deja aviso ni
    diálogo en B, y el cierre de sesión con una lectura pendiente no deja
    nada;
  - el borrador de B no pasa a A, y la recarga fallida de la misma cuenta
    conserva borrador y reseñas.
- A2, combinaciones:

  | Combinación | Origen | Resultado |
  |---|---|---|
  | éxito / éxito | real | correcto |
  | éxito / incierto | respuesta reescrita; la base sí bloqueó | 1 pedido a `/bloqueos`, ninguno a `/denuncias` |
  | éxito / error confirmado, a 375 px | sin `bloquear` en el pedido y `error` en la respuesta | el reintento crea el bloqueo |
  | denuncia rechazada (cola llena) / bloqueo hecho | real | correcto |
  | éxito / rechazo definitivo (límite 0) | real | sólo "Cerrar" |

- La base al final del recorrido tenía una denuncia y un bloqueo por autor, con
  el excedente en 0.
- Capturas: `docs/medidas/2026-10-25-e3b-a1a2-recorrido/` (12).
- Salidas: `docs/medidas/2026-10-25-e3b-a1a2-salidas.txt`.

No se repitieron las baterías de base porque no cambió SQL ni rutas.

**Limpieza:**
- Sólo mis 9 cuentas ficticias y sus filas.
- Base al terminar: 6 participantes, 2 versiones y 42 cuentas
  `@comunidad.test`.
- Locks 0 e interruptores apagados.
- Límites 5/10/100, denuncias 10, bloqueos 50, admisión 2/50, filas 50 y
  denuncias por hora 100. Siguen siendo hipótesis.
- Servidor detenido, claves de prueba quitadas del navegador y sesión cerrada.

## Sin cambios, a propósito

- **50 es el tope de admisión, no una cota absoluta de retenidos.** La
  corroboración por regla puede superar ese total; E4 debe conservarlo.
- Sin cambios en E4, el filtro, la retención ni el pendiente de denuncias al
  borrar una cuenta.

## No verificado

- La fila de Configuración en navegador: sólo código y barrido. Con el módulo
  activo aparece para cualquier cuenta, así que no hay diferencia visible.
- Teléfono real y Android, tema claro, la ficha con TMDB y lectores de
  pantalla.
- Una caída real de red: las fallas fueron simuladas en la página.
- Un cambio A→B con inicio de sesión real en una segunda pestaña: se
  reprodujo con el mismo mecanismo que usa Auth.
