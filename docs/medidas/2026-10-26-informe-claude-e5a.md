# E5a local: lectura protegida y "Recientes" — 26/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`1fb85cb`. Autorizada por el dueño. Sólo Supabase local, la app local y cuentas
ficticias. Sin E5b, E6, Producción, E0, servicios externos, gastos, push, merge,
deploy ni AAB.

## Cierre de E4 y entorno

**Auditoría de cierre de E4.** La copié sin cambios desde el checkout principal:
`docs/medidas/2026-10-26-auditoria-e4-a1a2-1fb85cb.md` (SHA-256 `292a633c…`,
igual al original). ESTADO y el plan registran E4 como cerrada en local, con el
límite que dejó Codex: no pudo repetir las pruebas de base por el error de
Docker. Las corridas de E4 siguen siendo evidencia mía.

**Docker.** Antes de probar diagnostiqué el entorno.
- Docker Desktop no estaba corriendo: la distribución WSL `docker-desktop`
  figuraba detenida y no existía el canal del motor.
- Lo inicié. El motor respondió a los 25 s y los contenedores de Supabase local
  volvieron solos.
- No borré volúmenes, no reseteé la base y no recreé contenedores.
- Comprobé la base tal como la había dejado E4:
  - 6 participantes, 2 versiones y 42 cuentas;
  - 2 suspensiones ajenas;
  - 0 decisiones y 0 historial;
  - interruptores y muestreo apagados;
  - `SELECT` de `profiles` revocado;
  - sin locks.
- Usé sólo la base local (`127.0.0.1:54321`, `.env.comunidad-local`).

## Qué hace E5a

**Base (`017_comunidad_lectura.sql` + down):**
- `public.comunidad_resenas(tipo, tmdb_id, orden, cursor, limite)`:
  - reemplaza la lectura provisional `comunidad_leer_titulo`, que se borra;
  - la ejecuta **sólo `authenticated`** y toma al lector de `auth.uid()`: no
    recibe uid, así que nadie lee "como" otro. `anon` y `service_role` no tienen
    EXECUTE.
- Cada página filtra de nuevo, sobre el estado confirmado:
  - reseña viva y versión vigente publicada;
  - que no sea la propia;
  - autor no bloqueado **por quien lee**: el bloqueo sólo oculta para quien
    bloquea;
  - autor no suspendido ahora.
- "Recientes": cursor por clave (primera publicación desc, id desc), de a 5 y
  con tope de 20.
  - Editar no cambia la clave: la reseña no se repite ni se saltea.
  - Una reseña retirada, borrada, bloqueada o de un autor suspendido entre
    páginas no reaparece por el cursor.
- Sólo la primera página trae la propia (en cualquier estado, para el editor),
  el estado de la cuenta y el total visible para ese lector.
- `orden = 'utiles'` responde 22023: "Más útiles" es de E5b.
- Con el módulo apagado, `{activo: false}` y nada más.
- `public.comunidad_modulo_activo()`: sólo el interruptor, para la ruta. Es de
  `service_role`.
- Un índice parcial para la clave de "Recientes".

**Ruta `GET /api/comunidad/resenas/lista`:**
- Con sesión: Bearer → `comunidad_resenas` con la **sesión del lector**
  (`supabaseComoUsuario`), nunca con `service_role`.
- Sin sesión: 401 `{resultado: "sin_sesion", activo}`. Sólo dice si el módulo
  está encendido; no recibe título.
- Las respuestas son privadas y sin caché (`private, no-store`, `Vary:
  Authorization`). La ruta es `force-dynamic`.
- El cursor viaja opaco.

**Ficha:**
- Una sola sección **RESEÑAS**: primero la de Yump, si existe, y después las de
  la comunidad. La reseña de Yump conserva su prioridad. El módulo editorial no
  se tocó.
- Sigue cerrada por defecto y, cerrada, no muestra texto.
- Sin sesión y con el módulo encendido:
  - en vez de la lista, una **invitación a registrarse** ("Crear cuenta o
    ingresar" → `/cuenta`);
  - aparece igual en un título sin ninguna reseña;
  - el encabezado no lleva número, para no revelar si hay.
- Con sesión:
  - se conservan los avisos de cuenta, los términos, el editor, la revisión de
    rechazos, la propia con su conteo, el menú de denuncia y bloqueo, y los
    pulgares;
  - la lista trae **cinco** reseñas y **"Cargar más"** de a cinco;
  - el selector tiene **"Más útiles" deshabilitado** ("pronto") y "Recientes";
  - el estado vacío dice "Todavía no hay reseñas. Podés escribir la primera."
    con el editor arriba.
- Sin nombre del autor (llega en E6): cada reseña dice "Reseña de la comunidad"
  y "editada" si corresponde. No se muestra ni correo ni nombre de perfil.
- Con el módulo apagado: sólo la de Yump, como antes.

**Paginación en el cliente** (`lib/comunidad/lista-nucleo.ts`, puro):
- el cursor confirmado avanza sólo con una tanda válida;
- si una tanda falla, lo visible queda y el reintento sale desde el mismo
  cursor;
- se descarta la respuesta de otro pedido, de otra cuenta, de otro título o de
  otro orden, y la de un "Cargar más" que quedó en vuelo durante una recarga;
- deduplica por reseña;
- un voto confirmado se aplica sobre la reseña visible, sin recargar (recargar
  llevaría la lista otra vez a cinco);
- bloquear recarga la primera página sin ese autor.

**Aislamiento:**
- Todo lo comunitario se monta por cuenta y título, con la frontera de E3b.
- Una recarga fallida de la misma cuenta conserva lo visible y el borrador.
- Abierto o cerrado vive por título, así que cambiar de cuenta o terminar de
  resolver la sesión no vuelve a cerrar la sección. Este error apareció en el
  recorrido y quedó corregido.

## Desvíos del plan y decisiones a auditar

1. **La ruta es `/api/comunidad/resenas/lista`**, no un GET de
   `/api/comunidad/resenas`. La envoltura CORS (`lib/cors.ts` y su inventario)
   admite un método por archivo de ruta; no la cambié.
2. **Los autores suspendidos no se muestran a nadie** mientras rige la
   suspensión. Así lo fijan el diseño §2.3 ("autor no bloqueado ni
   suspendido") y el plan ("filtra visibilidad, bloqueos y suspensiones").
   - Cambié el texto del diálogo de suspensión del panel de E4. Decía "Sus
     reseñas no se ocultan por esto" y ahora dice que no se muestran mientras
     dure y vuelven a verse al levantarla.
   - Levantar la suspensión las vuelve a mostrar (probado).
3. **Sin sesión, la ruta informa el interruptor global.**
   - Es necesario para no mostrar la invitación con el módulo apagado.
   - Se pregunta una vez por carga de la app (no por ficha) y un fallo vale
     como apagado.
   - El encabezado puede pasar de "RESEÑAS · 1" a "RESEÑAS" cuando llega la
     respuesta.
4. **El número del encabezado con sesión** cuenta la de Yump, las visibles para
   ese lector y la propia, aunque la propia no sea pública.
5. **Un voto se aplica localmente** al confirmarse: los votos de otros
   llegados mientras tanto se ven al recargar.
6. **El total visible** se calcula en cada primera página: una consulta más,
   sin snapshot ("Recientes" no lo lleva, §2.3).
7. **Las baterías anteriores leen con la función real.** Usaban la lectura
   provisional de `service_role`. Ahora leen con `comunidad_resenas` como cada
   cuenta, por psql con `role authenticated` y los claims de su JWT, igual que
   las sesiones del admin en E4.

## Verificación

**Reales, contra la base local** (`docs/medidas/2026-10-26-e5a-salidas.txt`):

| Prueba | Resultado |
|---|---|
| `pruebas-lectura` (nueva) | 11/11 |
| up/down/up de 017 | 5/5 |
| Permisos | 29/29 |
| Escritura (E3a) | 43/43 |
| Moderación (E3b) | 46/46 |
| Admin (E4) | 38/38 |

- La primera corrida de `pruebas-lectura` dio 10/11: una edición con texto
  aleatorio la retuvieron las reglas reales. Corregí el fixture (edición con la
  función y la decisión "publicar", como las publicaciones) y la final dio 11/11.
- La primera corrida de escritura dio 40/43: tres pruebas HTTP llamaban a la
  ruta provisional borrada. Las apunté a la ruta nueva y dio 43/43. Al
  revisarlo vi que, con el módulo apagado, el adaptador agregaba `cursor: null`
  a `{activo: false}`; ahora devuelve exactamente `{activo: false}` (unitaria y
  HTTP).

`pruebas-lectura` cubre:
- **sin sesión:** el RPC directo con anon o `service_role` da 401/403 sin
  datos; un `p_uid` ajeno no existe en la firma; la ruta responde 401 con sólo
  `{resultado, activo}`, también con un token inválido o con la anon key;
- **más de 200 reseñas:** 214 visibles en 43 páginas de 5, en el orden exacto,
  sin repetir ni saltear, con un **empate de 12** que cruza páginas;
  - lo mismo por el adaptador de la ruta (cursor opaco), por la ruta HTTP y con
    tandas de 20;
- **visibilidad:** el bloqueo sólo oculta para quien bloquea; el suspendido no
  se muestra a nadie y vuelve al levantarse;
- **cambios entre páginas, con funciones reales:** retiro con el admin de dos
  TOTP, borrado, dos ediciones (una ya vista, otra por venir), bloqueo y
  suspensión. Resultado: 210 reseñas, 0 repetidas, 0 salteadas, nada oculto
  reapareció;
- **contrato:** "utiles", cursor mal formado y título inválido dan 22023; el
  límite se acota a 1–20; un título vacío da total 0; con el módulo apagado,
  `{activo:false}`;
- **catálogo:** security definer, `search_path` vacío, EXECUTE sólo
  `authenticated`; la lectura provisional ya no existe.

**Preliminares** (unitarias, sin base):
- `npm test`: 2471 pasan, 0 fallan, 16 omitidas;
- `tsc`: 0 errores;
- `lib/comunidad/lectura.test.ts`: núcleo de la lista, pedido y adaptador con
  base falsa, encabezado y barridos;
- se adaptaron cinco barridos anteriores a la estructura nueva.

**Recorrido real en navegador local** (escritorio y 375 px, 12 capturas en
`docs/medidas/2026-10-26-e5a-recorrido/`, sesiones reales del Auth local):
- sin sesión: invitación en un título con reseñas (Yump primero) y en uno vacío,
  sin número en el encabezado; un solo pedido 401 sin parámetros de título;
- con sesión: "RESEÑAS · 14", editor, selector, cinco reseñas y "Cargar más";
  un fallo de tanda, el reintento desde el mismo cursor y 13 sin repetir;
- pulgar: "1 de 1" sin achicar la lista;
- bloqueo: aviso y primera página sin ese autor; al cargar todo, 12;
- cambio de cuenta con un "Cargar más" demorado: la tanda tardía de A no se
  pintó y la sección siguió abierta con la primera página de B;
- cierre de sesión con un pedido pendiente: la lista desapareció, apareció la
  invitación y no quedó texto comunitario;
- cambio de título A→B con un pedido pendiente: B montó cerrada y sin nada de A;
- estado vacío con sesión;
- 375 px: sin desplazamiento horizontal, con fallo y reintento.

**Simulado:** el fallo de red y la demora de la tanda los provocó un interceptor
de `fetch` en la página. Los cambios de cuenta y el cierre de sesión se
dispararon escribiendo la sesión y avisando por el `BroadcastChannel` de
Supabase, como hace otra pestaña. Las sesiones eran reales.

**Pendiente:**
- `/api/title` **no se comparó byte a byte en ejecución**: la ficha real
  necesita TMDB y el entorno local no lo tiene (servicio externo). Lo fija un
  barrido de fuente: ni la ruta ni `enrich.ts` ni `reviews.ts` tocan nada
  comunitario, y la sección es de cliente con Bearer y `no-store`;
- teléfono, Android, tema claro, lector de pantalla y Producción.

**Limpieza:**
- Borré sólo mis cuentas y datos: 222 y 222 de las corridas de lectura, 15 del
  recorrido, más los de las baterías.
- La base quedó como al empezar: 6 participantes, 2 versiones, 42 cuentas, 2
  suspensiones ajenas, 0 decisiones, 0 bloqueos, 0 locks, `SELECT` de
  `profiles` revocado y 017 aplicada.
- Publicación y muestreo apagados; el servidor quedó detenido.
