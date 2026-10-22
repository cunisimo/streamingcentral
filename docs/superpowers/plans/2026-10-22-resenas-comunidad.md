# Plan de implementación — Reseñas de usuarios y Top Yumpers

Fecha: 22/10/2026. Autor: Claude Code, para auditoría de Codex.
**Estado: plan preparado, pendiente de auditoría y autorización.**

**Qué es y qué no es.**
- Plan por entregas. La autorización del dueño cubre **sólo redactarlo**.
- Ninguna entrega está autorizada por figurar acá. Cada una necesita su
  propia autorización y deja su informe para Codex antes de la siguiente.
- No contiene código: nombra archivos, objetos de base, interfaces y
  pruebas. Las firmas son contratos, no implementación.
- Nada de esto se ejecutó: ni SQL, ni consultas a Producción, ni pruebas.

**Fuentes (rama `docs/resenas-comunidad`, sobre `e34c53e`).**
- Diseño de Codex:
  [`2026-10-21-resenas-comunidad-design.md`](../specs/2026-10-21-resenas-comunidad-design.md).
- Revisión v3.1 con el contrato de baja conciliado el 22/10:
  [`2026-10-21-resenas-comunidad-revision.md`](../specs/2026-10-21-resenas-comunidad-revision.md)
  (citada como "rev. §…").
- Auditorías de Codex: `f64a659`, `68bd773`, `97cf4d7` y
  [`e34c53e`](../../medidas/2026-10-22-auditoria-resenas-e34c53e.md)
  (copiada sin cambios, SHA-256 `E52E997D…21ADB2DEA4`).

**Restricciones que valen para todas las entregas.**
- Sin gastos, proveedores externos, APIs gratuitas nuevas ni pruebas pagas.
  El banco de reglas usa sólo textos sintéticos locales.
- AAB 1.2.0 compatible: `/api/title` no cambia y los bundles viejos no
  dependen de nada nuevo.
- El Top de plataformas sigue siendo **exclusivamente manual**. Top Yumpers
  es otro ranking, con su propio selector ya decidido ("Top semanal
  plataformas" / "Top Yumpers"), y no alimenta bloques ni disponibilidad.
- Salas conserva su prueba local aprobada. Sus arreglos viajan en el **mismo
  AAB** que reseñas, sin versión fijada.
- MFA de la reseña editorial: trabajo separado, fuera de este plan.
- No se asume aceptado el muestreo de P6 ni se impone leer cada reseña.
- Permisos, concurrencia y cascadas se prueban en **Postgres real aislado**
  (Supabase local), con roles reales y acceso REST/RPC directo. Los tests que
  sólo leen el texto del SQL no cuentan como prueba de eso.

---

## 1. Condiciones antes de activar

Pendientes que **no bloquean redactar ni construir con fixtures**, pero sí
activar lo que depende de ellas. Ninguna se da por resuelta.

| Condición | Quién | Bloquea |
|---|---|---|
| **P5**: autorizar las consultas de sólo lectura de E0 | Dueño | E0; y por lo tanto todo lo que necesita configuración real (§2) |
| **P3**: plazos de retención, con validación competente | Dueño | Activar la purga (E8) y activar la publicación (E9c); textos legales |
| **P4**: qué hacer con cuentas autoconfirmadas | Dueño, sólo si E0 muestra que existen | Exigir correo para publicar en Producción (E9c) |
| **P6**: carga de revisión que el dueño acepta | Dueño | Fijar topes de admisión reales y encender la publicación automática (E9c) |
| Textos legales (`/privacidad`, términos comunitarios) en `yump.ar` | Dueño | E9c |
| Secreto HMAC dedicado (rev. §3.3.1) | Creación autorizada en E9a | Duplicados en Producción |
| Migraciones en Producción, jobs `pg_cron`, deploy, versión y AAB | Dueño, cada uno aparte | Lo que corresponda |

---

## 2. Qué avanza con fixtures y qué necesita configuración real

| Puede avanzar en local, con fixtures | Necesita comprobar configuración real (E0) |
|---|---|
| E1 completa (reglas y banco sintético) | Filas, grants y policies efectivos de `user_reviews` |
| E2a–E2c en la base local de `supabase start` | Privilegios por defecto del esquema `public` en Producción |
| E3–E7: rutas, funciones y UI contra la base local | `cron.job` real (sin leer comandos) |
| E8: purga con reloj controlado en local | Confirm email y cuántas cuentas pudieron autoconfirmarse |
| E9a–E9b: build web y bundle Android de prueba | Tamaño de la base, uso y límites del plan Free; backups |
| | Uso de Vercel; retención de logs; cupo de correos de Auth |
| | Que `is_admin_mfa()` y las FK de `auth.users` coincidan con el repo |

Lo de la derecha queda marcado **[no verificado]** en cada entrega hasta E0.
Si E0 contradice algo del local, se corrige la entrega antes de activar.

---

## 3. Mapa de entregas

| # | Entrega | Depende de | Sólo local |
|---|---|---|---|
| E0 | Verificación de partida (sólo lectura) | P5 | No: Producción, lectura |
| E1 | Reglas propias y banco sintético | — | Sí |
| E2a | Esquema, participantes y permisos | — | Sí |
| E2b | Contrato de baja de cuenta | E2a | Sí |
| E2c | Orden de locks y concurrencia base | E2a, E2b | Sí |
| E3a | Escritura: reseñas, ediciones, votos, idempotencia | E1, E2c | Sí |
| E3b | Admisión, colas, denuncias, bloqueos, revisión de rechazos | E3a | Sí |
| E4 | Moderación administrativa | E3b | Sí |
| E5a | Lectura protegida y "Recientes" | E3a | Sí |
| E5b | Utilidad y "Más útiles" | E5a | Sí |
| E6 | Perfiles y nombre comunitario | E3a, E1 | Sí |
| E7 | Top Yumpers | E2c, E3a | Sí |
| E8 | Retención y purga | E3b, E7; activar: P3 | Sí; los jobs reales se autorizan aparte |
| E9a | Integración web con interruptores apagados | E4–E8; E0 | Deploy autorizado aparte |
| E9b | Android en el mismo AAB que salas | E9a | AAB autorizado aparte |
| E9c | Activación gradual | E9a, E9b, §1 completo | Producción, autorizada aparte |

**Orden propuesto:** E1 y E2a en paralelo → **E2b temprano** (es el riesgo
alto abierto) → E2c → E3a → E3b → E4, E5a, E6, E7 en el orden que convenga →
E5b → E8 → E9a → E9b → E9c. E0 en cuanto el dueño autorice P5; no frena E1–E8.

---

## 4. Infraestructura de pruebas común

Se reutiliza lo que ya probó salas, sin tocar su comportamiento.

- **Base local:** `supabase start` + `scripts/sala/db-local.mjs`, que elige
  el contenedor por `project_id` y aplica archivos en orden con
  `ON_ERROR_STOP`. Se agregan las migraciones `011`–`021` a su lista, una
  por entrega (numeración tentativa).
  **La batería de salas (`scripts/sala/pruebas-rls.mjs`) tiene que seguir
  pasando igual** después de cada entrega.
- **Baterías nuevas** en `scripts/comunidad/`, mismo estilo que
  `pruebas-rls.mjs`: se niegan a correr si la URL no es local, usan la anon
  key con JWT de usuarios creados por `admin.createUser`, y `service_role`
  sólo para lo que en Producción hace el servidor.
  - `pruebas-permisos.mjs`: matriz rol × objeto × operación por REST y RPC.
  - `pruebas-baja.mjs`: contrato de baja (E2b).
  - `pruebas-concurrencia.mjs`: casos con dos o más sesiones.
- **Sesiones concurrentes:** dos o más procesos `psql` dentro del contenedor
  (`docker exec`), coordinados con locks consultivos de prueba como
  barreras. No se agrega una dependencia nueva salvo que E2c la justifique
  por escrito.
- **Ayudas sólo locales:** `scripts/comunidad/solo-local.sql` (funciones para
  forzar marcas exactas, consolidar a un instante dado y mantener una
  transacción abierta). **Nunca va en una migración.** Una prueba falla si
  algún archivo de `supabase/migrations/` contiene esos nombres.
- **Variables locales:** `.env.comunidad-local` (claves locales de
  `supabase start` y un secreto HMAC **de prueba**), ignorado por Git. Una
  prueba verifica que esté en `.gitignore`.
- **Verificación local común a todas las entregas:** `npx tsc --noEmit`,
  `npm test`, la batería de salas y las baterías de la entrega. Lo que no se
  pudo correr se informa como no corrido.

---

## 5. Entregas

Formato de cada una: objetivo · dependencias · archivos y objetos ·
interfaces · pruebas y resultado esperado · verificación local · riesgos ·
rollback · criterio de cierre · evidencia para Codex.

**Rollback general.** Antes de activar no hay datos reales: cada migración
`0NN_*.sql` tiene su `0NN_*_down.sql`, que borra **sólo** objetos nuevos y
nunca toca tablas existentes. Después de activar, el rollback es apagar
interruptores (T4), no correr el down.

### E0 — Verificación de partida (sólo lectura)

- **Objetivo:** reemplazar los [no verificado] de §2 por evidencia, sin
  escribir nada.
- **Depende de:** P5. **No se ejecuta sin esa autorización.**
- **Archivos:** informe `docs/medidas/AAAA-MM-DD-e0-resenas.md`. Ningún
  cambio de código.
- **Cómo se corre:** el dueño (o quien autorice) en el SQL Editor, dentro de
  `begin read only; … rollback;`. Se registran resultados agregados, nunca
  correos ni ids de personas.

**Consultas propuestas, para revisar antes de ejecutar:**

```sql
begin read only;

-- Q1. Versión y extensiones
select version();
select extname, extversion from pg_extension order by 1;

-- Q2. user_reviews: filas por estado (sólo conteos)
select estado, count(*) from public.user_reviews group by estado;

-- Q3. user_reviews: grants y policies efectivos
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'user_reviews'
 order by 1, 2;
select policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'user_reviews';

-- Q4. Quién depende de user_reviews (vistas y funciones)
select view_schema, view_name
  from information_schema.view_table_usage
 where table_name = 'user_reviews';
select n.nspname, p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.prosrc ilike '%user_reviews%';

-- Q5. Privilegios por defecto (lo que recibiría una tabla nueva)
select pg_get_userbyid(defaclrole) as rol,
       defaclnamespace::regnamespace as esquema,
       defaclobjtype, defaclacl
  from pg_default_acl;

-- Q6. Jobs programados, SIN la columna command (puede llevar secretos)
select jobid, jobname, schedule, active from cron.job order by jobid;

-- Q7. Cuentas: confirmadas y posibles autoconfirmadas (sólo conteos).
-- Heurística, no prueba: confirmation_sent_at nulo con email confirmado
-- sugiere autoconfirmación.
select count(*) as total,
       count(*) filter (where email_confirmed_at is null) as sin_confirmar,
       count(*) filter (where email_confirmed_at is not null
                          and confirmation_sent_at is null) as posibles_autoconfirmadas
  from auth.users;

-- Q8. Funciones de admin y FK hacia auth.users
select proname from pg_proc where proname in ('is_admin', 'is_admin_mfa');
select conrelid::regclass as tabla, confdeltype
  from pg_constraint
 where confrelid = 'auth.users'::regclass and contype = 'f'
 order by 1;
select tgname from pg_trigger
 where tgrelid = 'auth.users'::regclass and not tgisinternal;

-- Q9. Tamaño
select pg_size_pretty(pg_database_size(current_database()));
select relname, pg_size_pretty(pg_total_relation_size(c.oid))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by pg_total_relation_size(c.oid) desc limit 10;

-- Q10. Aislamiento por defecto y volatilidad de is_normalized
show default_transaction_isolation;
select proname, provolatile from pg_proc where proname = 'is_normalized';

rollback;
```

**Verificaciones de panel (sin SQL):**
- Supabase: plan, uso de base, egress y MAU; backups y su retención;
  Confirm email (Authentication → Providers → Email); límites de envío de
  correos de Auth.
- Vercel: invocaciones y CPU a 30 días, plan y retención de logs.

- **Resultados esperados:** ninguno se presupone. El informe marca cada dato
  como "panel (fecha)" o "SQL de sólo lectura (fecha)".
- **Riesgos:** leer datos personales por error. Mitigación: sólo conteos y
  Q6 sin `command`.
- **Rollback:** no aplica; todo es lectura dentro de `rollback`.
- **Criterio de cierre:** las diez consultas y las verificaciones de panel
  con resultado, o con el motivo por el que no se pudo.
- **Evidencia para Codex:** el informe, con las consultas exactas que se
  corrieron y sus resultados agregados.
- **Efecto sobre el resto:** si Q3 muestra filas en `user_reviews` o grants
  abiertos, E2a agrega su cierre (rev. §2.1.4) antes de E9c. Si Q7 muestra
  autoconfirmadas, se pregunta P4.

### E1 — Reglas propias y banco sintético

- **Objetivo:** el módulo de normalización y reglas de rev. §3.1–§3.3, sin
  base ni red, con sus suites.
- **Depende de:** nada.
- **Archivos:**
  - `lib/comunidad/reglas/plegado.ts`: las dos pasadas de rev. §3.1;
  - `lib/comunidad/reglas/reglas.ts`: reglas por categoría, con `id_regla`;
  - `lib/comunidad/reglas/decision.ts`: combina resultados; gana el más
    restrictivo;
  - `lib/comunidad/reglas/version.ts`: `VERSION_REGLAS`;
  - `lib/comunidad/reglas/*.test.ts`;
  - `lib/comunidad/reglas/banco/desarrollo.json`;
  - `scripts/comunidad/banco-reservado/` (fuera del glob de `npm test`) con
    el conjunto reservado y su corredor.
- **Interfaces:**
  - `evaluarResena(texto, contexto)` y `evaluarNombre(nombre, contexto)`
    devuelven `{ resultado: "publicar" | "retener" | "rechazo_contenido" |
    "rechazo_formato", reglas: id_regla[], motivoUsuario, versionReglas }`.
  - `contexto` trae lo que necesitan las reglas que miran más de un texto
    (las últimas 3 versiones de la cuenta en 24 h para el contacto partido).
    Lo arma quien llama; el módulo es puro.
  - Los duplicados no van acá: necesitan la base (E3b).
- **Pruebas y resultado esperado:**
  - suite legítima ≥ 150 y de abuso ≥ 150 (rev. §3.6), por categoría y con
    al menos 5 ofuscaciones por regla;
  - pasada de dígitos antes de la de letras; confusables ambiguos como
    clases; "Se7en", "M3GAN", "9-1-1", años, duraciones y temporadas sin
    rechazo; nombres sin reglas de texto anómalo;
  - "fallo nunca aprueba": excepción inyectada en cada regla → error, nunca
    `publicar`;
  - sin red: `fetch` reemplazado por uno que lanza; ninguna prueba lo llama;
  - **reservado:** su SHA-256 se registra al crearlo; se corre una sola vez
    al final; criterios de rev. §3.6 (0 contactos claros publicados, ≥ 95 %
    de variantes conocidas frenadas, ≤ 2 % de legítimas rechazadas, ≤ 5 %
    retenidas).
- **Verificación local:** `npm test` y el corredor del reservado.
- **Riesgos:** sobreajuste al banco de desarrollo (mitigado por el
  reservado); listas que crecen sin control (cada término con su caso).
- **Rollback:** borrar el módulo; nada lo usa todavía.
- **Criterio de cierre:** suites verdes; reservado corrido una vez con
  resultado por caso; si un criterio no se cumple, se informa así, sin
  ajustar contra el reservado.
- **Evidencia para Codex:** diff, salida de `npm test`, informe por caso del
  reservado con su SHA-256, lista de reglas con `VERSION_REGLAS`.

### E2a — Esquema, participantes y permisos

- **Objetivo:** objetos de base de rev. §2.1 y §2.2.1–§2.2.2, cerrados para
  `anon` y `authenticated`, sin lógica de escritura todavía.
- **Depende de:** nada (local).
- **Archivos:** `supabase/migrations/011_comunidad_esquema.sql` y
  `011_comunidad_esquema_down.sql`; `scripts/sala/db-local.mjs` (lista);
  `scripts/comunidad/pruebas-permisos.mjs`.
- **Objetos de base:**
  - esquema `comunidad`, **no expuesto a PostgREST** (segunda barrera además
    de los grants);
  - tablas: `participantes`, `resenas`, `versiones`, `evaluaciones`,
    `tramos`, `suspensiones`, `denuncias`, `bloqueos`, `contadores`,
    `config` (interruptores T4, todo apagado por defecto), `bajas_en_curso`;
  - invariantes de rev. §2.1.3: FK compuesta `(version_id,
    autor_participante)`, `CHECK (evaluador <> autor)` de la misma fila,
    largo y NFC (o trigger si E2a muestra que `IS NFC NORMALIZED` no sirve en
    un `CHECK`), únicos parciales, trigger de transiciones de estado;
  - `revoke all` sobre todo lo nuevo para `anon` y `authenticated`; RLS
    activada sin policies.
- **Interfaces:** ninguna pública todavía.
- **Pruebas y resultado esperado** (Postgres real, por REST y RPC):
  - `anon`, autor, ajeno, suspendido, admin sin MFA, admin con MFA:
    SELECT, INSERT, UPDATE y DELETE sobre cada tabla → **denegado**;
  - `service_role` → permitido sólo por las funciones (E3a en adelante);
  - autoevaluación por inserción directa con `service_role` → la FK o el
    `CHECK` la rechazan;
  - transición prohibida (por ejemplo, reemplazada → publicada) → el
    trigger la rechaza;
  - `up` → `down` → `up` limpio; las tablas existentes quedan iguales
    (comparación de `pg_dump --schema-only` antes y después).
- **Riesgos:** privilegios por defecto distintos en Producción [no
  verificado: E0 Q5]. Por eso el `revoke` es explícito.
- **Criterio de cierre:** matriz completa con resultado esperado escrito
  antes y obtenido.
- **Evidencia para Codex:** migraciones, salida de `pruebas-permisos.mjs`,
  volcado de grants y policies de la base local, log de up/down/up.

### E2b — Contrato de baja de cuenta (temprano)

- **Objetivo:** implementar y probar el contrato de rev. §2.2.3 antes de
  cualquier escritura comunitaria, porque es el riesgo alto abierto.
- **Depende de:** E2a.
- **Archivos:**
  - `supabase/migrations/012_comunidad_baja.sql` + down: `baja_comunitaria`,
    `baja_comunitaria_admin`, `resolver_participante`, trigger de red de
    seguridad sobre `participantes`;
  - `lib/eliminar-cuenta-flujo.ts`: pasos nuevos y resultado `baja-parcial`;
  - `lib/eliminar-cuenta.ts`: cableado de la función y de `getUserById`;
  - `app/api/cuenta/eliminar/route.ts`: mensajes por resultado;
  - `app/cuenta/configuracion/page.tsx`: estado "Eliminación pendiente" con
    reintento;
  - `scripts/comunidad/pruebas-baja.mjs`;
  - runbook en `docs/MANTENIMIENTO.md` (baja pedida fuera de la app).
- **Interfaces:**
  - `resolver_participante(uid, crear boolean)`: toma `K_CUENTA`, lee el
    marcador; con marcador lanza `baja_en_curso`; si no existe y `crear`, lo
    crea. Todas las funciones de escritura posteriores la usan.
  - `baja_comunitaria(uid)` / `baja_comunitaria_admin(uid)`: sólo
    `service_role`; idempotentes; devuelven qué hicieron (marcador nuevo o
    existente, cuántas filas cerradas o borradas).
  - Flujo de la ruta, en este orden: configuración admin → contraseña →
    `baja_comunitaria` → `deleteUser` → si falla, `getUserById` →
    resultado.
  - Resultados: `{ ok: true }` (Auth ya no tiene la cuenta);
    `{ ok: false, motivo: "baja-parcial" }` (comunidad borrada, cuenta
    viva); los motivos existentes sin cambios.
  - `cuentaComoIntento` sigue contando sólo `password-invalida`.
- **Pruebas y resultado esperado:**

  | # | Caso | Esperado |
  |---|---|---|
  | B1 | Paso 1 confirma y `deleteUser` falla | Marcador presente; datos comunitarios borrados y tramos cerrados; cuenta viva; respuesta `baja-parcial` con el texto "Borramos tus datos de comunidad, pero no pudimos eliminar la cuenta" |
  | B2 | Durante la ventana, otra sesión publica, vota, denuncia, bloquea o cambia nombre | Rechazo `baja_en_curso`; **no se crea participante** |
  | B3a | Voto en vuelo que tomó `K_CUENTA` antes que la baja | El voto confirma; la baja espera y después lo borra y cierra su tramo |
  | B3b | Voto que verificó el Bearer antes de la baja pero entra a la base después | Rechazo `baja_en_curso` |
  | B4 | Dos pedidos de baja simultáneos | `baja_comunitaria` se serializa y la segunda no cambia nada; un `deleteUser` gana, el otro falla y reconcilia con `getUserById` → ambos responden eliminación completa |
  | B5 | Auth borró pero la respuesta se perdió (fallo inyectado después del éxito) | Reconcilia → eliminación completa; no queda marcador (cascada) |
  | B6 | Cuenta sin participante previo | Sólo marcador; después `deleteUser` → completa |
  | B7 | Reingreso con marcador y reintento | Se ve "Eliminación pendiente"; el reintento completa |
  | B8 | Borrado real por la API admin de Auth local **sin** paso 1, con un voto concurrente y una consolidación esperando | O termina con tramos cerrados y participante sin `user_id`, o se revierte entero (deadlock o timeout); el reintento termina. Nunca tramos a medio cerrar |
  | B9 | Runbook: `baja_comunitaria_admin` y después borrado en Auth | Completa; la consulta de verificación del runbook no encuentra participante con ese `user_id` |
  | B10 | El admin quita un marcador (cancelación) | Nada se restaura; una escritura posterior crea un participante nuevo, sin historial |
  | B11 | Cuenta suspendida pide la baja | Se permite (rev. §2.1.2, fila E); el marcador impide recrear identidad para esquivar la suspensión |

  - Además, las pruebas unitarias de `eliminar-cuenta-flujo` con
    dependencias inyectadas cubren el orden y cada resultado, incluido que
    nunca devuelve `ok: true` si `getUserById` encuentra la cuenta.
- **Riesgos:** el camino del panel invierte el orden de locks (rev. §2.2.3,
  punto 3). Mitigación: runbook y B8/B9; no se promete prohibir el panel.
- **Rollback:** la migración `down` y volver el flujo de la ruta a su
  versión anterior (un solo paso `deleteUser`).
- **Criterio de cierre:** B1–B11 verdes en la base local con Auth real de
  `supabase start`; los tests del flujo verdes; el runbook escrito.
- **Evidencia para Codex:** salida de `pruebas-baja.mjs` caso por caso,
  diff del flujo y su test, runbook.

### E2c — Orden de locks y concurrencia base

- **Objetivo:** fijar el protocolo de rev. §2.2.4 en funciones reales antes
  de construir encima.
- **Depende de:** E2a, E2b.
- **Archivos:** `supabase/migrations/013_comunidad_protocolo.sql` + down
  (funciones internas de toma de locks y marca, usadas por todas las
  escrituras); `scripts/comunidad/pruebas-concurrencia.mjs`;
  `scripts/comunidad/solo-local.sql`.
- **Interfaces:** una función interna por paso del protocolo: compartido de
  `K_CORTE`, `K_CUENTA` del actor más marcador, locks de entidades en el
  orden estable, y marca. Ninguna es ejecutable por `anon` ni
  `authenticated`.
- **Pruebas y resultado esperado:** casos 1–5 de rev. §2.2.4 (mismo voto en
  dos sesiones, edición contra voto, dos ediciones con la misma versión,
  reintento con `id_intento`, suspensión contra voto) con marcas monótonas y
  resultado igual al serial. Más una prueba de inventario: cada función de
  escritura llama al protocolo antes de tocar tablas (revisión del SQL en el
  informe **y** una sesión que demuestra que espera el lock).
- **Riesgos:** deadlocks por un orden mal aplicado. Se miden con
  `log_lock_waits` en la base local.
- **Rollback:** down.
- **Criterio de cierre:** casos 1–5 verdes cinco corridas seguidas.
- **Evidencia para Codex:** salida de las corridas, logs de espera de locks.

### E3a — Escritura: reseñas, ediciones, votos e idempotencia

- **Objetivo:** crear, editar y borrar reseñas y votar, con reglas y
  matriz de autorización.
- **Depende de:** E1, E2c.
- **Archivos:**
  - `supabase/migrations/014_comunidad_escritura.sql` + down;
  - `lib/comunidad/escritura-nucleo.ts` (puro: orden de pasos con
    dependencias inyectadas, como `eliminar-cuenta-flujo`) y su test;
  - `lib/comunidad/escritura.ts` (cableado `server-only`);
  - `app/api/comunidad/resenas/route.ts` (POST crear/editar),
    `app/api/comunidad/resenas/borrar/route.ts`,
    `app/api/comunidad/votos/route.ts`;
  - `lib/cors.ts` y `lib/cors-inventario.test.ts` (sólo GET/POST, como hoy).
- **Interfaces:**
  - Ruta: Bearer → `usuarioDeToken` → reglas (E1) → función.
  - Funciones `comunidad_publicar`, `comunidad_editar`, `comunidad_borrar`,
    `comunidad_votar`, `comunidad_retirar_voto`, sólo `service_role`. Reciben
    `uid`, datos, la decisión de reglas (`resultado`, `version_reglas`,
    `reglas`), `version_esperada` (edición) e `id_intento` con
    `hash_peticion`.
  - **Idempotencia** (auditoría `e34c53e`): tabla `comunidad.intentos`,
    clave `(uid, accion, id_intento)`, guarda `hash_peticion` (SHA-256 del
    cuerpo normalizado) y el resultado. El mismo id con el mismo hash
    devuelve el resultado guardado; el mismo id con otro hash devuelve un
    conflicto genérico, sin revelar el resultado anterior. La clave no
    necesita id de reseña, así que cubre la creación. Sólo la cuenta dueña
    puede recuperar su resultado. Retención: 7 días (E8).
  - Matriz de rev. §2.1.2 aplicada en cada función, después del protocolo.
- **Pruebas y resultado esperado:**
  - cada fila de rev. §3.4.1 (texto idéntico, rechazos, fallo técnico,
    conflicto, publicada, retenida): versión anterior y votos según la tabla;
  - reintento tras fallo inyectado después de confirmar: un solo resultado y
    un solo reinicio de votos;
  - mismo `id_intento` con otro texto: conflicto, sin datos del primero;
  - matriz de autorización filas A y B × {suspendido, correo pendiente,
    términos nuevos, publicación pausada, módulo apagado, baja en curso};
  - RPC directo con JWT de usuario a cada función: denegado;
  - límites por día con carreras: nunca se supera el límite.
- **Riesgos:** la decisión de reglas viaja de la ruta a la función; la
  función confía en ella porque sólo `service_role` la ejecuta (rev. §2.1.2).
- **Rollback:** down y quitar rutas (nadie las llama todavía).
- **Criterio de cierre:** pruebas verdes; casos 1–5 de E2c siguen verdes.
- **Evidencia para Codex:** salidas, diff, tabla de rev. §3.4.1 con el
  resultado obtenido por fila.

### E3b — Admisión, colas, denuncias, bloqueos y revisión de rechazos

- **Objetivo:** rev. §3.3–§3.3.4.
- **Depende de:** E3a.
- **Archivos:** `supabase/migrations/015_comunidad_moderacion_datos.sql` +
  down; `app/api/comunidad/denuncias/route.ts`,
  `app/api/comunidad/bloqueos/route.ts`,
  `app/api/comunidad/revision/route.ts`; `lib/comunidad/duplicados.ts`.
- **Interfaces:**
  - duplicados: hash del texto plegado y hashes de shingles con HMAC (rev.
    §3.3.1); el secreto viene de una variable de servidor dedicada, que en
    local es la de prueba;
  - admisión: topes por autor y global, configurables en `comunidad.config`
    (hipótesis: 2 y 50);
  - denuncias: una por denunciante y versión, agrupadas por versión.
    **Cota global** (auditoría `e34c53e`): como mucho N filas de denunciante
    por versión (hipótesis: 50; después sólo un contador) y un tope global de
    ingreso por hora (hipótesis). Al superarlo se responde "No podemos
    recibir más denuncias ahora; podés bloquear". Nunca se dice que la
    denuncia fue atendida, y el tope nunca oculta contenido;
  - revisión de rechazos: la ruta reevalúa y guarda `revision_solicitada`.
- **Pruebas y resultado esperado:**
  - ataque de N cuentas con denuncias graves sobre una reseña legítima →
    sigue visible y sube de prioridad;
  - ataque que llena la cola de retenidos → lo limpio se sigue publicando;
    lo que sería retenido recibe "probá más tarde";
  - "No me sirvió" masivo → sin efecto en moderación;
  - matriz filas C y D con suspensión, pausa, correo pendiente y baja en
    curso;
  - revisión de un rechazo: queda retenida e invisible; un texto que ya no
    se rechaza se trata como envío normal;
  - duplicados entre cuentas en 7 días → retenido; los hashes no contienen
    fragmentos en claro (inspección de la tabla).
- **Riesgos:** las cifras de los topes son hipótesis hasta P6.
- **Rollback:** down.
- **Criterio de cierre:** pruebas verdes y volumen máximo por tabla
  calculado con los topes.
- **Evidencia para Codex:** salidas, cálculo de cotas, diff.

### E4 — Moderación administrativa

- **Objetivo:** `/admin/moderacion` con colas separadas, revisiones pedidas,
  muestreo opcional y decisiones registradas.
- **Depende de:** E3b.
- **Archivos:** `supabase/migrations/016_comunidad_admin.sql` + down;
  `app/admin/moderacion/page.tsx`; `app/api/admin/moderacion/*/route.ts`;
  `lib/admin-auth.ts` (sin cambio de contrato).
- **Interfaces:**
  - igual que el Top: `adminDeToken` en la API y funciones ejecutables por
    `authenticated` con `is_admin_mfa()` comprobado adentro, llamadas con
    `supabaseComoUsuario` (no con `service_role`);
  - acciones: publicar, rechazar o retirar, descartar denuncia, restaurar,
    suspender, levantar suspensión, quitar marcador de baja (B10), pausar la
    publicación (T4). Cada una registra motivo, admin y versión;
  - muestreo: hasta 5 publicaciones al azar por sesión, **apagado por
    defecto** hasta P6.
- **Pruebas y resultado esperado:** admin sin MFA y no admin → denegado por
  API y por RPC directo; una decisión tardía sobre una versión vieja no
  publica otra ni resucita una borrada; suspensión y levantamiento con el
  protocolo de E2c.
- **Riesgos:** el endurecimiento de la editorial no entra acá (trabajo
  separado).
- **Rollback:** down y quitar la ruta del panel.
- **Criterio de cierre:** pruebas verdes; el panel se usa en local con datos
  sintéticos.
- **Evidencia para Codex:** salidas, capturas locales, diff.

### E5a — Lectura protegida y "Recientes"

- **Objetivo:** leer reseñas con sesión, sin exponer nada a `anon` ni tocar
  `/api/title`.
- **Depende de:** E3a.
- **Archivos:** `supabase/migrations/017_comunidad_lectura.sql` + down;
  `app/api/comunidad/resenas/route.ts` (GET); `lib/comunidad/lectura.ts`;
  `lib/resenas.ts` (une la de Yump, siempre primera, con las de la
  comunidad); `components/ResenasAcordeon.tsx`.
- **Interfaces:** GET `/api/comunidad/resenas?tipo&id&orden=recientes&cursor`
  con Bearer; cursor por clave (primera publicación desc, id desc); la
  función filtra visibilidad, bloqueos y suspensiones y es ejecutable por
  `authenticated`.
- **Pruebas y resultado esperado:**
  - sin sesión: 401 y ningún dato comunitario por REST, RPC ni la ruta;
  - `/api/title` byte a byte igual con el módulo encendido o apagado (test
    con fixtures);
  - más de 200 reseñas sin repetir ni saltear;
  - bloqueo durante la paginación: el bloqueado deja de aparecer;
  - el acordeón sigue cerrado por defecto y con la reseña Yump primero.
- **Riesgos:** cachés: la ruta es `force-dynamic` y la respuesta lleva
  `Cache-Control: private, no-store`; el service worker ya no cachea
  `/api/*`.
- **Rollback:** interruptor de lectura apagado; down antes de activar.
- **Criterio de cierre:** pruebas verdes.
- **Evidencia para Codex:** salidas, comparación de `/api/title`, diff.

### E5b — Utilidad y "Más útiles"

- **Objetivo:** votos de utilidad con Wilson (T10) y snapshots acotados
  (rev. §2.3).
- **Depende de:** E5a.
- **Archivos:** `supabase/migrations/018_comunidad_utilidad.sql` + down;
  `lib/comunidad/wilson.ts` y su test; ruta GET con `orden=utiles`.
- **Interfaces:** snapshot en filas de 100 ids; un generador por título con
  lock consultivo y búsqueda doble; reutilización de 10 min; vigencia de
  2 h; revalidación de 50 posiciones por página; respuesta "orden
  actualizado" al vencer.
- **Pruebas y resultado esperado:**
  - 20 lectores concurrentes del mismo título → un solo snapshot;
  - con 10.000 reseñas sintéticas: costo por página medido y que **no crece
    con el total**; tamaño de tabla, índice y TOAST medido;
  - página con muchas ocultas → devuelve menos y avanza el cursor, sin
    recorrer más de 50.
- **Riesgos:** la cota física supera la estimada; entonces se agrega una
  purga horaria (rev. §2.3) en E8.
- **Rollback:** down.
- **Criterio de cierre:** mediciones registradas y pruebas verdes.
- **Evidencia para Codex:** mediciones, `EXPLAIN (ANALYZE, BUFFERS)` de la
  página, diff.

### E6 — Perfiles y nombre comunitario

- **Objetivo:** proyección pública mínima de perfil y nombre comunitario
  con las reglas de E1.
- **Depende de:** E1, E3a.
- **Archivos:** migración `019_comunidad_perfiles.sql` + down;
  `app/api/comunidad/perfil/route.ts`, `app/api/comunidad/nombre/route.ts`;
  `app/u/page.tsx` (ruta nativa `/u/?id=`); `scripts/build-capacitor.mjs`
  (incluir `/u`).
- **Interfaces:** la proyección devuelve sólo nombre comunitario, avatar del
  catálogo y conteos permitidos; nunca `profiles` completo ni correo. El
  nombre se cambia sólo por función.
- **Pruebas y resultado esperado:** campos fuera de la proyección ausentes;
  un update directo de `profiles.display_name` no cambia nada en lo
  comunitario; nombre con contacto ofuscado → rechazo; cuenta eliminada →
  "Cuenta eliminada", sin nombre ni avatar.
- **Rollback:** down y quitar la ruta.
- **Criterio de cierre:** pruebas verdes.
- **Evidencia para Codex:** salidas, diff.

### E7 — Top Yumpers

- **Objetivo:** cómputo y consolidación mensual (rev. §2.2.2, §2.2.4,
  §2.2.5) y el selector ya decidido en `/top`.
- **Depende de:** E2c, E3a.
- **Archivos:** migración `020_comunidad_top.sql` + down;
  `app/api/comunidad/top-yumpers/route.ts`; `components/TopView.tsx`
  (selector; el toggle Películas/Series se oculta en Top Yumpers y el Top
  Yumpers no usa `sessionStorage`).
- **Interfaces:**
  - `consolidar_mes(M)`: **comprobación rápida** sin lock de si el mes ya
    está consolidado; si lo está, devuelve; si no, toma el exclusivo,
    **vuelve a comprobar** y calcula en una sola sentencia en `READ
    COMMITTED` (auditoría `e34c53e`). Así una lectura cualquiera no toma el
    exclusivo global;
  - la disparan la primera lectura del ranking después del corte y, cuando
    se autorice, un job `pg_cron` (E8);
  - los huérfanos se guardan sin id.
- **Pruebas y resultado esperado:** casos 6–11 de rev. §2.2.4, incluida la
  igualdad exacta en `T(M)` con marcas forzadas por `solo-local.sql`; 50
  lecturas concurrentes después del corte → un solo cálculo y el resto sin
  esperar el exclusivo una vez consolidado; `lib/top-solo-manual.test.ts`
  sigue verde.
- **Riesgos:** confundir Top Yumpers con el Top manual. Pruebas de que no
  comparten fuente ni caché.
- **Rollback:** down y ocultar el selector.
- **Criterio de cierre:** pruebas verdes, cinco corridas seguidas de los
  casos concurrentes.
- **Evidencia para Codex:** salidas, diff de `TopView`, resultado de los
  casos de igualdad.

### E8 — Retención y purga

- **Objetivo:** purga de rev. §5 y jobs de rev. §2.5.
- **Depende de:** E3b, E7. **Activar** depende de P3.
- **Archivos:** migración `021_comunidad_purga.sql` + down (funciones de
  purga, **sin** `cron.schedule`); `supabase/cron-comunidad.sql` aparte, con
  `unschedule` previo idempotente, para correr sólo con autorización.
- **Interfaces:** `purgar_comunidad(ahora)`: textos según plazos, intentos
  de más de 7 días, hashes vencidos, snapshots vencidos, participantes
  huérfanos sin referencias y tramos ya consolidados. Los plazos son
  configurables y **arrancan vacíos (sin purga) hasta P3**.
- **Pruebas y resultado esperado:** con reloj controlado, la purga nunca
  borra tramos de un mes sin consolidar; los hashes caen con la versión y
  con la baja; idempotente; no toca `sala-barrido` ni `tmdb-sync`.
- **Riesgos:** borrar de más. Mitigación: cada categoría con prueba de "no
  borra lo que no debe".
- **Rollback:** desprogramar los jobs; down antes de activar.
- **Criterio de cierre:** pruebas verdes; los plazos de P3 cargados recién
  cuando estén validados.
- **Evidencia para Codex:** salidas, `cron-comunidad.sql` revisado.

### E9a — Integración web con interruptores apagados

- **Objetivo:** dejar todo integrado y apagado para poder desplegarlo sin
  efecto visible.
- **Depende de:** E4–E8 y E0.
- **Archivos:** sin archivos nuevos de lógica; revisión del conjunto;
  informe de cuotas con mediciones locales escaladas.
- **Pasos que requieren autorización aparte:** aplicar `011`–`021` en
  Producción, crear el secreto HMAC dedicado (aleatorio, sólo servidor, sin
  reutilizar claves de Supabase u otras), deploy.
- **Pruebas y resultado esperado:** con todo apagado, la web se comporta
  igual que antes (Home, ficha, `/top`, cuenta, eliminar cuenta); la
  batería de salas verde; `npx next build` verde.
- **Rollback:** revertir el deploy; las tablas nuevas quedan vacías.
- **Criterio de cierre:** evidencia de "sin cambios visibles" con todo
  apagado.
- **Evidencia para Codex:** salidas, checklist de autorizaciones obtenidas.

### E9b — Android en el mismo AAB que salas

- **Objetivo:** bundle con reseñas y perfil nativo, junto a los arreglos de
  Yumpeá ya aprobados.
- **Depende de:** E9a.
- **Archivos:** `scripts/build-capacitor.mjs`; `android/app/build.gradle`
  (versión: la decide el dueño al autorizar el AAB, según la convención de
  CLAUDE.md).
- **Pruebas y resultado esperado:** en teléfono, con interruptores apagados,
  igual que 1.2.0; con lectura encendida en un entorno de prueba, el
  acordeón y `/u/?id=` funcionan; los App Links no cambian; un bundle 1.2.0
  contra el servidor nuevo sigue funcionando.
- **Rollback:** no publicar el AAB.
- **Criterio de cierre:** prueba en teléfono registrada.
- **Evidencia para Codex:** informe de la prueba en dispositivo.

### E9c — Activación gradual

- **Objetivo:** encender en este orden: lectura → publicación con retención
  total revisada por el dueño → publicación automática.
- **Depende de:** E9a, E9b y **todas** las condiciones de §1.
- **Pasos:** cada interruptor con autorización del dueño; jobs `pg_cron` con
  autorización; mediciones de cuotas a los 7 días.
- **Riesgos:** carga humana mayor que la acordada. Si pasa, se explicita al
  dueño y se apaga la publicación automática; no se traslada en silencio.
- **Rollback:** interruptores (T4).
- **Criterio de cierre:** una semana con colas dentro de la capacidad de P6
  y cuotas con holgura.
- **Evidencia para Codex:** conteos agregados de colas y cuotas, sin texto
  de usuarios.

---

## 6. Trazabilidad contra el diseño y las auditorías

| Origen | Punto | Dónde |
|---|---|---|
| Diseño §3.2 | Reinicio de votos al cambiar el texto, aviso previo, reintentos idempotentes | E3a |
| Diseño §3.5 | Suspensión no impide denunciar, bloquear, gestionar ni eliminar | E2b (B11), E3a, E3b |
| Diseño §3.6 | Cuenta eliminada sin nombre en rankings | E6, E7 |
| `f64a659` A1 | Escrituras fuera de la función | E2a, E3a (RPC directo) |
| `f64a659` A2 / `68bd773` #2 | Cierre consistente | E2c, E7 |
| `f64a659` A3 / `68bd773` #4 | Paginación sin tope y snapshots acotados | E5a, E5b |
| `f64a659` A4 | Correo frente a recuperación | E0 (Q7), P4 |
| `f64a659` A6 | Planificador existente | E0 (Q6), E8 |
| `68bd773` #1 / `e34c53e` A1 | Baja de cuenta | E2b |
| `68bd773` #3 | Invariantes viables | E2a |
| `97cf4d7` 1 | Autorización por acción | E3a, E3b |
| `97cf4d7` 2 | Denuncias y saturación | E3b |
| `97cf4d7` 3 | Revisión de rechazos y ediciones | E3a, E3b |
| `97cf4d7` 4 | Carga del dueño | E4 (muestreo apagado), P6 |
| `97cf4d7` 5 | Orden de locks y corte exacto | E2c, E7 |
| `e34c53e` | Panel con procedimiento y prueba real | E2b (B8, B9) |
| `e34c53e` | Comprobación rápida antes del exclusivo | E7 |
| `e34c53e` | `id_intento` ligado a cuenta, acción y hash | E3a |
| `e34c53e` | Cota global de denuncias | E3b |
| `e34c53e` | Secreto HMAC dedicado | E3b (local), E9a (Producción) |

## 7. Lo que este plan no hace

- No ejecuta nada ni autoriza ninguna entrega.
- No fija versión de la app ni `versionCode`.
- No resuelve P3, P4, P5 ni P6: las deja como condiciones.
- No incluye el endurecimiento de MFA de la reseña editorial.
- Las cifras (límites, topes, muestreo, 100 ids por fila, cota de
  denuncias) son hipótesis hasta medir o hasta P6.
