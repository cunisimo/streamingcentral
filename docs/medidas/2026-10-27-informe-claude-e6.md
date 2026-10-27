# E6 local: nombre comunitario y perfil mínimo del autor — 27/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`662e247`. Autorizada por el dueño, sólo en local. Sólo Supabase local, la app
local y datos ficticios. Sin E7, filtro, reservados, retenciones, P3,
Producción, servicios externos, gastos, push, merge, deploy ni AAB.

**Cierre de E5b.**
- Copié sin cambios la auditoría de Codex:
  `docs/medidas/2026-10-26-auditoria-e5b-662e247.md`, SHA-256 `899dd3ad…`,
  igual al original.
- E5b queda cerrada en local.
- Conservo sus pendientes de integración: `/api/title` en ejecución, tema
  claro, teléfono/Android, lector de pantalla y Producción.

## Cambios

**Base: `019_comunidad_perfiles.sql` + down.**
- **`comunidad_cambiar_nombre(uid, nombre, decisión)`, sólo `service_role`.**
  - La ruta corre las reglas de nombre de E1 y le pasa la decisión, igual que
    al publicar.
  - Aplica la fila A de la matriz: módulo, publicación, suspensión, correo y
    términos.
  - Consume el límite del día `limite_nombres` (3).
  - Escribe sólo `participantes.nombre_comunitario`, que tiene el CHECK de
    forma de 011.
  - Repetir el mismo nombre devuelve `sin_cambios` y no consume límite.
- **`comunidad_perfil(participante | null, cursor, límite)`, sólo
  `authenticated`.** Quien mira sale de `auth.uid()`.
  - Proyección: nombre comunitario, avatar del catálogo, reseñas visibles y
    "Me sirvió" recibidos, y las reseñas visibles para quien mira, de a 5 con
    cursor `(primera publicación, id)`.
  - Estados `bloqueado` y `eliminada`: sólo el estado y el id.
  - Autor suspendido: los demás no ven sus reseñas (como en la ficha) y no se
    informa la suspensión.
  - `null` pide el perfil propio.
- **`comunidad.avatar_publico`:** devuelve un id del catálogo y nunca la
  semilla guardada.
  - Las semillas heredadas (uuid) pasan por el mismo FNV-1a sobre `LEGADO_V1`
    que `resolverAvatar`.
  - Comparé las dos implementaciones en 337 casos: 0 diferencias.
- **`item_lectura` suma `autor: {id, nombre}`.** El id es el del
  participante, nunca el de la cuenta. El down restaura literalmente el de
  017.

**Servidor.**
- `POST /api/comunidad/nombre`, con `nombre-nucleo.ts` (puro) y
  `nombre.ts` (forma y mensajes, apto para el cliente). El actor sale del
  token, nunca del cuerpo.
- `GET /api/comunidad/perfil?id=|yo=1`, con `perfil.ts`. Usa la sesión de
  quien mira. Respuestas `private, no-store`; sin sesión, 401 con
  `{resultado}` y nada más.

**Interfaz.**
- **Ficha:** "Reseña de la comunidad" pasa a ser el nombre comunitario del
  autor, con enlace a `/u/?id=<participante>`.
  - Sin nombre elegido: "Yumper sin nombre". Nunca se muestra el nombre
    privado.
  - Indicación de edición, pulgares, conteos y menú, sin cambios.
- **`/u/?id=`:** página estática con `noindex`, igual en la web y en el
  contenedor (`hrefPerfil`).
  - Fuera de `APP_FUERA`, así que viaja en la exportación nativa. No generé
    AAB ni cambié versiones.
  - `PerfilComunitario` usa el núcleo de la lista de la ficha (cursor
    confirmado, respuestas de otra clave descartadas), con `key` por cuenta y
    perfil y frontera.
- **Mi perfil:** sección "Nombre en la comunidad", separada de "Nombre para
  mostrar".
  - No precarga ni copia el nombre privado.
  - Hace un aviso previo de forma y muestra el motivo de cada rechazo.
- `peticiones.ts`: extraje `tokenComo` y `postear` de la ficha para
  compartirlos (mismo token por cuenta).
- Concilié el comentario de `resenas/lista/route.ts`, que ahora ejemplifica
  los dos órdenes. El comportamiento no cambió.

**Decisión técnica que conviene auditar.** E1 puede **retener** un nombre
(odio) con el texto "Tu nombre quedó en revisión", pero no existe una cola de
revisión de nombres.
- En E6 un nombre que se retendría **no se guarda**: cuenta para el límite y
  el usuario ve "Ese nombre no se puede usar en la comunidad. Elegí otro."
- Es lo más restrictivo y no reabre E1. Si se quiere revisión humana de
  nombres, hace falta una entrega aparte.

## Pruebas ejecutadas (reales)

| Prueba | Resultado |
|---|---|
| `pruebas-perfiles` (nueva, base y rutas reales) | 19/19 (corridas previas 11/19 y 17/19: ver abajo) |
| up/down/up de 019 | 5/5 |
| Permisos (inventario con las dos funciones nuevas) | 29/29 |
| Lectura (E5a) | 11/11 |
| Voto en la lista (E5a A1) | 11/11 |
| Utilidad (E5b) | 14/14 |
| Moderación (E3b) | 46/46 |
| Unitarias focalizadas (`perfiles.test.ts` 18 y relacionadas) | 137/137 |
| `npm test` | 2496 pasan, 2 fallan, 16 omitidas; las 2 eran el barrido de DiceBear sobre la batería nueva, corregido y repetido (65/65) |
| `tsc` | 0 |

**Qué cubre `pruebas-perfiles`:**
- **Nombre:**
  - se guarda normalizado; repetirlo no consume;
  - contacto ofuscado → rechazo con motivo; odio → no admitido; formato → no
    toca la base;
  - límite de 3 por día;
  - pausa, términos y suspensión (real, de E4) rechazan.
- **Validación sin atajos:**
  - `authenticated` no ejecuta la función;
  - un PATCH directo al esquema falla con anon y con JWT;
  - con `service_role`, una forma inválida da 23514 (el contador vuelve
    atrás) y una decisión inválida da 22023;
  - un `uid` en el cuerpo de la ruta se ignora.
- **`display_name`:** cambiarlo directo en la base no altera el nombre
  comunitario ni aparece en la ficha o el perfil.
- **Perfil, acceso:**
  - anon y `service_role` reciben 401/403 (42501); la ruta sin sesión da 401
    sólo con `{resultado}`;
  - id inválido → 400; inexistente → `no_existe`;
  - `private, no-store`.
- **Proyección:** sólo las claves permitidas, en la cabecera y en cada ítem.
  - Ni correo, ni `user_id`, ni nombre privado, ni la etiqueta de estilo.
  - El avatar elegido sale como id; la semilla heredada sale mapeada, nunca
    cruda.
- **Paginación:** 5 + 2 por la ruta con el núcleo del cliente, sin repetir ni
  saltear. Las reseñas retiradas (E4) y borradas no aparecen, y los agregados
  coinciden con lo visible.
- **Cambios entre páginas:** un retiro real y un borrado real no reaparecen.
- **Cuenta y respuestas tardías:** una tanda de otra cuenta o de otro perfil
  se descarta.
- **Perfil propio:** `?yo=1`; sin identidad comunitaria, `sin_participante`.
- **Bloqueo:** quien bloqueó ve `bloqueado` sin nombre ni reseñas; otro
  lector lo ve normal; al desbloquear vuelve.
- **Suspensión:** los demás ven 0 reseñas sin mención de la suspensión; el
  suspendido ve las suyas.
- **Cuenta eliminada** con el flujo real de la app: `eliminada`, y el
  participante queda sin nombre ni `user_id`.
- **Ficha por la ruta real:** cada ítem trae `autor` sólo con `{id, nombre}`.
- **Módulo apagado:** `{activo:false}` y `modulo_apagado`.

**Recorrido en navegador local** (11 capturas en
`docs/medidas/2026-10-27-e6-recorrido/`):
- **Escritorio:**
  - nombre del autor en la ficha;
  - clic real en el nombre → perfil;
  - "Cargar más" hasta 7 de 7;
  - en Mi perfil, rechazo de "juan arroba gmail" y aceptación de "Lectora del
    Sur".
- **375 px:**
  - lo mismo, más un cambio de cuenta en la pestaña;
  - rechazo de "wsp 11 5555 4444" y aceptación de "Cinéfila del Sur";
  - el perfil propio, sin pulgares ni menú.
- **Cómo se capturó:** zoom CSS 0,6 en escritorio, y un iframe de 375 px
  (documento de 375 de ancho) a 375 px, igual que en E5b.

## Simulaciones y fixtures

- La preparación sube `limite_resenas` a 20 mientras corre (el autor publica
  9) y lo restaura.
- `display_name` y el avatar se escriben por SQL, con los valores de
  `eleccionAvatar`. Motivo: en esta base local el SELECT de `profiles` está
  revocado (estado de base que se conserva) y PostgREST no puede filtrar la
  fila propia.
- Las respuestas tardías y el cambio de cuenta se prueban con el núcleo del
  cliente y respuestas reales de la ruta. No monté React: el proyecto no tiene
  arnés de DOM.

## Limitaciones

- El perfil muestra "Película" o "Serie" con el enlace a la ficha, **sin el
  nombre del título**: ese dato es de TMDB y no se pidió un servicio externo.
  Se puede sumar en integración.
- La lista de bloqueados de la cuenta sigue sin el nombre comunitario del
  bloqueado: E6 no cambió `comunidad_bloqueados`.
- **ZWJ en nombres:** el CHECK de 011 prohíbe U+200D, así que un emoji
  compuesto no entra en un nombre, igual que en las reseñas. Es la decisión
  pendiente que ya está anotada.
- Avatares fuera del plano básico: la base cuenta puntos de código y el
  navegador unidades UTF-16. Las semillas reales son uuid o ids del catálogo
  (ASCII), así que no aplica.
- Pendientes heredados:
  - `/api/title` en ejecución;
  - teléfono, Android y el servidor interno de Capacitor para `/u/`;
  - tema claro, lector de pantalla y Producción.

## Limpieza

- Borré sólo mis cuentas y datos:
  - 8 cuentas de la batería por corrida;
  - las de las regresiones (cada batería limpia las suyas);
  - 3 del recorrido.
  También las decisiones del admin de prueba, sus factores TOTP (caen con la
  cuenta) y las sesiones del scratchpad.
- La base quedó como al empezar:
  - 6 participantes, 2 versiones, 42 cuentas y 2 suspensiones ajenas;
  - 0 evaluaciones, 0 órdenes, 0 locks y 0 decisiones;
  - límites 5/10/100/10/3/50;
  - módulo, publicación, Top Yumpers y muestreo apagados;
  - `SELECT` de `profiles` revocado;
  - 019 aplicada.
- Detuve el servidor y saqué la sesión del navegador. Docker Desktop estaba
  detenido al empezar: lo inicié sin tocar volúmenes ni contenedores.
