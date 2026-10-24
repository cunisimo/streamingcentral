# Informe para auditoría: E2a de reseñas (esquema, participantes y permisos)

24/10/2026. Claude Code. Rama `feat/resenas-reglas`.
- **Sólo base local** de `supabase start`. No se consultó ni modificó
  Producción (E0 sigue sin autorizarse).
- Sin publicación, sin APIs, pantallas ni panel. No se avanzó a E2b.
- La moderación no se tocó: reglas `2026-10-24.2` (`3ff1643`), generador,
  evaluador, bancos, sellos y resultados históricos siguen intactos. **E1
  sigue pendiente de validación independiente.**

## Commits y migraciones

| Commit | Qué |
|---|---|
| `1d045f3` | Migraciones, baterías, `db-local.mjs`, TOTP local, `.gitignore`, salidas |
| (este) | Este informe, `docs/ESTADO.md` y el plan |

| Archivo | SHA-256 (contenido en Git) | Aplicada |
|---|---|---|
| `supabase/migrations/011_comunidad_esquema.sql` | `d29b7bec1b0a2038fac84d1a122da97446c519435c98a08e5e6150e85830333b` | Local |
| `supabase/migrations/011_comunidad_esquema_down.sql` | `dd3b34c78849ff2ac7980bcd7f337173eadc0b2c11d1c288505425c00cb00824` | Local (rollback probado) |
| `supabase/migrations/022_cerrar_user_reviews.sql` | `59001a0dd5e8b115deaa4403964a060ca2038e3d67e045b1d536b1c2d045dd7c` | Local; en Producción sólo después de E0 y con autorización |
| `supabase/migrations/022_cerrar_user_reviews_down.sql` | `aa01593b2e07db458da2e64d7146ad474f9dc48c415b85264ed43c8006959ffb` | Local (conservador: no reabre) |

Las dos migraciones son **repetibles**, como las demás del repo:
`db-local.mjs` las vuelve a aplicar en cada corrida. Repetirlas no cambia el
volcado. 022 va después de `schema.sql`, porque este vuelve a crear las
policies viejas de `user_reviews`.

**Otros cambios:**
- `scripts/sala/db-local.mjs` ahora aplica `007_top_manual.sql`, 011 y 022.
  Su test fija el orden y que ningún `_down` entre en la lista.
- `supabase/config.toml`: TOTP encendido (`enroll_enabled` y
  `verify_enabled`). Sólo configura `supabase start`.
- `.env.comunidad-local`: claves locales sacadas de `supabase status -o
  env`. Está ignorado por Git, y una prueba lo verifica. No se copió ni
  leyó `.env.local`.

## Objetos creados

**Esquema `comunidad`, con 11 tablas:**
- `participantes`;
- `resenas`;
- `versiones`;
- `evaluaciones`;
- `tramos`;
- `suspensiones`;
- `denuncias`;
- `bloqueos`;
- `contadores`;
- `config`;
- `bajas_en_curso`.

Hay **7 funciones de trigger** dentro del esquema. No son API ni
`security definer`. No se creó ninguna `public.comunidad_*`: llegan desde
E2b.

| Invariante (rev. §2.1.3, §2.2) | Cómo |
|---|---|
| El autor de un voto o de una denuncia es el de la versión | FK compuesta `(version_id, autor_participante)` → `versiones (id, autor_participante)` |
| No evaluarse, denunciarse ni bloquearse a sí mismo | `CHECK` de la misma fila |
| La versión es del autor de su reseña | FK compuesta `(resena_id, autor_participante)` → `resenas` |
| Texto | `CHECK`: entre 80 y 600 `char_length` (puntos de código), `is nfc normalized`, sin Cc salvo el salto de línea y sin U+200B–200F, U+202A–202E, U+2060–2069 ni U+FEFF. **`IS NFC NORMALIZED` funciona en un `CHECK`** en PostgreSQL 17.6 local, así que no hizo falta trigger |
| Nombre comunitario | Columna aparte de `profiles.display_name`. `CHECK`: de 2 a 24, NFC, sin espacios en los bordes, sin Cc ni controles de formato |
| Unicidad | Una reseña viva por autor y título (parcial, `borrada_en is null`); un voto vigente por evaluador y versión (parcial, `retirada_en is null`); una denuncia por denunciante y versión; un tramo abierto por evaluador y versión; una suspensión abierta por participante; `(resena_id, id_intento)` para reintentos (§3.4.1) |
| Transiciones | Trigger `BEFORE`. Una versión nace `publicada`, `retenida` o `revision_solicitada`. Los pasos permitidos son publicada → retenida, oculta o reemplazada; retenida y revision_solicitada → publicada, rechazada o reemplazada; oculta → publicada o reemplazada. `rechazada` y `reemplazada` son finales. El texto, el autor, la reseña, las reglas y el intento son inmutables |
| Vigencia | Trigger de constraint **diferido**: toda reseña tiene vigente, sólo la vigente puede estar publicada y la vigente nunca está reemplazada. La FK `(version_vigente_id, id)` → `versiones (id, resena_id)` es diferida |
| Tramos (§2.2.2) | La versión va **sin FK**. El par autor/versión se verifica al insertar. Un tramo nace abierto, se cierra una sola vez y `hasta > desde`. El mes es el día 1 |
| Suspensiones | Son intervalos y se cierran una sola vez |
| Identidad (§2.2.1, §2.2.3) | Sólo dos tablas referencian `auth.users`: `participantes.user_id` (`on delete set null`) y `bajas_en_curso.user_id` (`on delete cascade`). Un participante con reseñas no se puede borrar |
| `config` | Es una sola fila, con los tres interruptores (`modulo_activo`, `publicacion_activa` y `top_yumpers_activo`) en `false`. Guarda los límites de §2.1.2 como **hipótesis**, no como valores aprobados |

**Decisiones de diseño tomadas en E2a** (rutinarias, para auditar):
- **Borrar reseña y retirar voto son marcas, no `DELETE`.** Se usan
  `borrada_en` y `retirada_en` porque la retención de §5 conserva lo
  borrado con denuncia abierta. La purga es de E8.
- **Estados de versión:** `oculta` es lo que hace el admin desde la cola de
  denuncias (E4). Desde ahí puede volver a `publicada` como restauración.
- **El comentario de una denuncia** acepta hasta 300 caracteres. Es una
  elección mía: §3.3.2 dice "largo acotado" sin número.

## Permisos efectivos (base local, después de todas las corridas)

| Objeto | ACL |
|---|---|
| esquema `comunidad` | `{postgres=UC/postgres}` |
| cada tabla | `{postgres=arwdDxtm/postgres}`; RLS activada; 0 policies |
| cada secuencia | `{postgres=rwU/postgres}` |
| cada función del esquema | `{postgres=X/postgres}` |
| `public.user_reviews` | `{postgres=arwdDxtm/postgres,service_role=Dxtm/postgres}`; RLS activada; 0 policies; 0 filas en local |

Volcado completo en `docs/medidas/2026-10-24-e2a-salidas.txt`.

## Pruebas y resultados

Resultados esperados escritos **antes**, en cada script.

| Batería | Resultado |
|---|---|
| `scripts/comunidad/pruebas-permisos.mjs` | **25 de 25** |
| `scripts/comunidad/pruebas-invariantes.mjs` (rol dueño, aparte) | **81 de 81**. Con `DETALLE=1` se ve el constraint o trigger que rechaza cada caso |
| `scripts/comunidad/up-down-up.mjs` | **11 de 11** |
| `scripts/comunidad/local.test.mjs` + `scripts/sala/db-local.test.mjs` | **11 de 11** |
| Batería de salas `scripts/sala/pruebas-rls.mjs` (con `.env.comunidad-local`) | **Todo verde (37 pruebas)** |
| `npx tsc --noEmit --incremental false` | 0 errores |
| `npm test` | **2364 pruebas: 2346 pasan, 0 fallan, 18 omitidas** (exigen builds que no se hicieron; igual que antes) |

**Las tres barreras, por separado** (`pruebas-permisos.mjs`):
1. **SQL con `SET ROLE`.** Se probaron `anon`, `authenticated` y
   `service_role`, sobre 11 tablas y con SELECT, INSERT, UPDATE, DELETE y
   TRUNCATE.
   - **1a, tal cual:** 165 intentos dan 42501. Lo frena el esquema.
   - **1b, con USAGE del esquema concedido y revertido:** 165 intentos dan
     42501. Lo frenan los grants de tabla.
   - **1c, con USAGE y grants concedidos y revertidos, y con fixtures.**
     Con `anon` y `authenticated`, SELECT, UPDATE y DELETE ven o tocan 0
     filas. INSERT da 42501, salvo en `tramos`, que da 23503 porque su
     trigger corre antes que RLS y no ve la versión. Esto estaba escrito
     así antes de correr.
   - **`service_role` tiene BYPASSRLS.** Con grants vería todo, así que
     para él RLS **no** es barrera: su cierre son 1a y 1b. La prueba lo
     deja escrito.
   - **Catálogo:** `has_table_privilege`, `has_column_privilege`,
     `has_schema_privilege`, `has_sequence_privilege` y
     `has_function_privilege` dan falso para PUBLIC y los tres roles. RLS
     está activada en las 11 tablas y no hay policies.
   - **Controles positivos:** el dueño lee las 11 tablas, y `SET ROLE`
     cambia de verdad el `current_user`.
2. **REST.** Se probaron 7 credenciales: anon, autor, ajeno, suspendido,
   admin AAL1, admin AAL2 y la service key. Cada una contra 11 tablas, con
   GET, POST, PATCH y DELETE, por `public` y con el perfil `comunidad`.
   - Son **616 pedidos**: todos dan 404 PGRST205 o 406 PGRST106, ningún 2xx.
   - El OpenAPI no menciona ninguna tabla.
   - **GraphQL no aplica en local:** `pg_graphql` no está habilitada y el
     endpoint lo informa. En Producción no está verificado [E0].
3. **RPC.**
   - No existe ninguna `public.comunidad_*`.
   - Ninguna función del esquema es ejecutable por los roles de la API.
   - Llamarlas por `/rpc` da 404, o 406 con el perfil.

**`is_admin_mfa()` real** (007 aplicada en local; sin stub). Los dos
factores TOTP se enrolaron y verificaron contra el Auth local, con RFC 6238
calculado con `node:crypto`.

| Caso | Resultado |
|---|---|
| Admin AAL1 | `false` |
| Admin AAL2 con un factor | `false` |
| Admin AAL2 con dos factores | **`true`** |
| El mismo admin, sesión nueva AAL1 | `false` |
| Usuario común | `false` |

**Auth:**
- Al borrar `auth.users`, tanto por SQL como con
  `admin.auth.admin.deleteUser` real, `participantes.user_id` queda nulo y
  el participante y su reseña siguen.
- `bajas_en_curso` cae con la fila de Auth.

## Rollback verificado (`up-down-up.mjs`, comparación de `pg_dump --schema-only`)

- **Sin 011 contra con 011 excluyendo `comunidad`:** son **idénticos**
  (sha256 `6aa727421a1a8b08…`). La migración no toca nada fuera de su
  esquema.
- **Down → up → down → up:** los volcados se repiten byte a byte. Con 011
  da `2121d0f00b453587…` y sin 011 da `6aa727421a1a8b08…`. Repetir el up o
  el down no cambia nada.
- **022 contra el estado anterior:** lo único quitado son las dos policies
  y sus comentarios; no se agregó nada.
- **022_down no cambia el volcado.** `anon` y `authenticated` siguen sin
  leer ni escribir, y por REST `anon` recibe 401 con 42501.
- Las filas de `user_reviews` no cambian.
- **Normalización:** sólo se quitan las líneas `\restrict` y
  `\unrestrict`, que pg_dump 17.6 genera con una clave aleatoria.

## Hallazgo corregido durante la entrega

- **La primera versión de 011 tenía
  `alter default privileges in schema comunidad revoke … from public, anon,
  authenticated, service_role`.** Su comentario decía que cerraba lo que se
  creara después en el esquema.
- **Comprobado en local, no hacía nada:**
  - no dejó ninguna entrada en `pg_default_acl`;
  - una función creada después en `comunidad` seguía ejecutable por PUBLIC,
    que es el default de PostgreSQL;
  - un default por esquema sólo puede **agregar** a los globales.
- **Corrección:**
  - se sacaron esas líneas y el comentario dice la regla real: cada entrega
    repite su `revoke`;
  - una prueba de control lo demuestra: la función nueva queda ejecutable
    por PUBLIC y sólo la frena el USAGE del esquema;
  - la batería revisa todo lo que haya en el esquema, no una lista fija.

## Limitaciones y dependencias

- **Privilegios por defecto de Producción: no verificados (E0 Q5).**
  - Por eso los `revoke` son explícitos.
  - En la base local, el default de `postgres` en `public` concede `Dxtm`
    (TRUNCATE, REFERENCES, TRIGGER y MAINTAIN) a `anon`, `authenticated` y
    `service_role`. Antes de 022, `anon` tenía así TRUNCATE sobre
    `user_reviews` en local.
  - En Producción no se sabe [E0].
- **022 no se aplica en Producción** hasta el inventario de E0 y la
  autorización del dueño.
- **Efecto conocido de 022:** `scripts/prueba-eliminar-cuenta.mjs` inserta
  una fila en `user_reviews` con la sesión del usuario. Con 022 ese insert
  falla, el script no revisa el error y el conteo da 0. No se cambió.
- **RLS no protege de `service_role`** (BYPASSRLS). Su cierre son los
  grants y el esquema no expuesto. Las funciones de E2b+ que ejecute
  `service_role` necesitan sus propias comprobaciones (rev. §2.1.2).
- **`supabase start` de este proyecto es compartido** con el checkout
  principal: mismo `project_id` y los mismos contenedores.
  - Se reinició para encender TOTP.
  - La base local quedó con 007, 011 y 022 aplicadas, y con usuarios y
    filas de prueba de las baterías (`@comunidad.test`).
  - La batería de salas sigue verde.
- **Sin pruebas de concurrencia ni de la matriz por operación de §2.1.2.**
  No hay funciones todavía: son E2b, E2c y E3.
- **Los límites de `config` son las hipótesis de §2.1.2.** No hay plazos de
  retención: E2a no define ninguno.
- **N = 20 no está aprobado.** La disponibilidad del dueño es la revisión
  diaria de las colas, sin obligación de leer todas las publicaciones.
- **Siguiente paso:** auditoría focalizada de E2a y de esta evidencia. No se
  avanza a E2b sin autorización.
