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
- Auditoría del plan sobre `9450006`:
  [`2026-10-22-auditoria-plan-resenas-9450006.md`](../../medidas/2026-10-22-auditoria-plan-resenas-9450006.md)
  (copiada sin cambios, SHA-256 `BBF24038…993A3AAC`). Sus correcciones
  (A1–A5 y condiciones de E2b) están aplicadas en este documento; resumen en
  §0.

## 0. Correcciones tras la auditoría de `9450006`

| Hallazgo | Corrección | Dónde |
|---|---|---|
| A1: faltaban tareas de interfaz | Componentes, núcleos puros y criterios de cierre en navegador por recorrido visible | §4 (UI), E2b, E3a, E3b, E5a, E5b, E6, E9a |
| A2: pruebas antes de que existan sus funciones | Pruebas **preliminares** (primitivas y fixtures) separadas de los **gates de integración** sobre funciones reales; tabla de gates | §5.0, E2b, E2c |
| A2: MFA real en local | `007_top_manual.sql` en la base local y factor TOTP real en Auth local; sin stub | §4, E2a, E4 |
| A3: E0 incompleta | Bloques independientes, privilegios efectivos, RLS, dueño, `is_admin_mfa()` acotada, dependencias por catálogo | E0 |
| A4: E9c con revisión de todo | Retirada; pruebas con cuentas de prueba y activación con colas y muestreo de P6; beta opcional acotada | E9c |
| A5: esquema privado | Tres barreras probadas por separado (SQL con `SET ROLE`, REST, RPC); rol de fixture para constraints | E2a |
| E2b | Reconciliación indeterminada (B12), lectura del marcador tras login (B13), cancelación con sanción activa (B14) | E2b |
| Rollback | El cierre de `user_reviews` y los cambios a código existente tienen su propio rollback | Rollback general, E2a, E2b, E5a |

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
| **P6**: carga de revisión que el dueño acepta (colas y, si lo acepta, muestreo). **No es condición revisar todas las publicaciones** | Dueño | Fijar topes de admisión reales y encender la publicación automática (E9c) |
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
- **Admin con MFA real en local (auditoría `9450006`, A2).** Hoy
  `db-local.mjs` aplica `schema.sql`, `001`–`003` y `009`, **sin `007`**, que
  define `is_admin_mfa()` (`007_top_manual.sql:344`: admin en `profiles`,
  `aal2` en el JWT y al menos dos factores TOTP verificados). E2a agrega
  `007_top_manual.sql` a la lista local y verifica que aplique limpio.
  - Fixtures de admin: `profiles.is_admin` puesto por el rol propietario de
    la base local; **dos factores TOTP enrolados y verificados de verdad**
    contra el Auth local (`mfa.enroll` / `challenge` / `verify`), con el
    código calculado en la prueba a partir del secreto (RFC 6238 con
    `node:crypto`, sin dependencias).
  - Sesiones de prueba: admin AAL1 (sin verificar en la sesión), admin AAL2,
    usuario común.
  - **Prohibido un stub permisivo de `is_admin_mfa()`.** Si el Auth local no
    permite el enrolamiento, E4 queda abierta e informada; no se cierra con
    un reemplazo.
- **Interfaz (auditoría `9450006`, A1).** No hay arnés de DOM en el proyecto
  (CLAUDE.md). Mismo criterio que salas y Próximamente:
  - la lógica de cada componente vive en un **núcleo puro** (`*-nucleo.ts`)
    con `node --test`: estados, transiciones, contador, reintentos,
    paginación, descarte de respuestas de otra cuenta;
  - el **recorrido visible** se verifica en navegador local contra la base
    local con fixtures, con una lista de pasos y capturas por entrega. **Un
    recorrido no se da por implementado porque su endpoint exista;**
  - accesibilidad en cada componente: etiquetas, foco tras cada acción,
    contador anunciado con `aria-live`, botones con texto o `aria-label`;
  - **nada comunitario en HTML del servidor, metadata ni cachés:** se pide en
    el cliente con Bearer; prueba que el HTML y la metadata de la ficha no
    contienen texto de fixtures;
  - **cerrar sesión o cambiar de cuenta limpia el estado comunitario**
    (patrón de generaciones de `AuthContext`): prueba de núcleo en la que una
    respuesta de la cuenta anterior se descarta;
  - Android: recorrido en teléfono en E9b.
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

**Rollback general (corregido tras `9450006`).**
- **Objetos nuevos:** cada migración `0NN_*.sql` tiene su `0NN_*_down.sql`,
  que borra sólo lo que esa migración creó. Antes de activar no hay datos
  reales.
- **Excepción: el cierre de `user_reviews`** (rev. §2.1.4) modifica un
  objeto existente. Va en su **propia** migración (`022_cerrar_user_reviews`,
  aplicada sólo después de E0) y su down **no reabre** la lectura anónima ni
  la escritura directa del autor: el cierre se conserva en cualquier
  rollback. Reabrir exige una decisión explícita del dueño. Una prueba
  verifica que, tras correr todos los down, `anon` sigue sin poder leer
  `user_reviews`.
- **Código existente modificado** (flujo de baja en E2b, `lib/resenas.ts` y
  acordeón en E5a, `TopView` en E7, `build-capacitor.mjs` en E6): el rollback
  es revertir ese commit. La baja vuelve a un solo paso; si ya hay
  marcadores, se informa antes de revertir.
- **Después de activar:** apagar interruptores (T4), no correr down.

### 5.0 Pruebas preliminares y gates de integración

Corrige A2 de `9450006`: una entrega no se cierra con pruebas de funciones
que todavía no existen.
- **Pruebas preliminares:** prueban las primitivas que la entrega sí
  construye, usando filas de fixture y ayudas de `solo-local.sql`. Son
  evidencia de la primitiva, **no** de que la ruta de producción la use bien.
- **Gates de integración:** el mismo caso sobre las funciones reales, en la
  primera entrega donde todas existen. Se repiten todos en E9a antes de
  lanzar.

| Caso | Preliminar en | Gate de integración en |
|---|---|---|
| Lock por cuenta y marcador frente a escritura en vuelo (B3a, B3b) | E2b, con `resolver_participante` y una sesión que retiene `K_CUENTA` | E3a, con `comunidad_votar` real |
| Baja por Auth real sin paso 1, con voto concurrente y consolidación esperando (B8) | E2b, con tramos de fixture y una sesión que pide el exclusivo | E7, con votos y `consolidar_mes` reales |
| Casos 1–4 de rev. §2.2.4 (voto, edición, versión, `id_intento`) | E2c, con las primitivas del protocolo | E3a |
| Caso 5 (suspensión frente a voto) | E2c | E4 |
| Casos 6–11 (corte) | E2c, con tramos de fixture | E7 |
| Cada función de escritura usa el protocolo | — | La entrega que crea la función (E3a, E3b, E4, E6, E7) |
| Todos los anteriores | — | E9a, otra vez, antes de lanzar |

### E0 — Verificación de partida (sólo lectura)

- **Objetivo:** reemplazar los [no verificado] de §2 por evidencia, sin
  escribir nada.
- **Depende de:** P5. **No se ejecuta sin esa autorización.**
- **Archivos:** informe `docs/medidas/AAAA-MM-DD-e0-resenas.md`. Ningún
  cambio de código.
- **Cómo se corre:** el dueño (o quien autorice) en el SQL Editor. **Cada
  bloque va en su propia transacción** `begin read only; … rollback;`: si un
  objeto no existe, la sentencia aborta sólo ese bloque y los demás corren.
  Sin `DO`, funciones temporales ni ninguna escritura. Se registran
  resultados agregados, nunca correos ni ids de personas.
- **Orden:** primero el bloque Q0. Un bloque cuyo objeto Q0 dio nulo **no se
  corre**, y se registra "no existe".
- **Esto no reemplaza P5:** sin autorización no se corre ningún bloque.

**Consultas propuestas, para revisar antes de ejecutar** (corregidas tras
`9450006`, A3):

```sql
-- Q0. Existencia (decide qué bloques correr)
begin read only;
select to_regclass('public.user_reviews')      as user_reviews,
       to_regclass('cron.job')                 as cron_job,
       to_regprocedure('public.is_admin()')    as is_admin,
       to_regprocedure('public.is_admin_mfa()') as is_admin_mfa,
       to_regnamespace('comunidad')            as esquema_comunidad;
rollback;

-- Q1. Versión, extensiones y aislamiento por defecto
begin read only;
select version();
select extname, extversion from pg_extension order by 1;
show default_transaction_isolation;
select proname, provolatile from pg_proc where proname = 'is_normalized';
rollback;

-- Q2. user_reviews: filas por estado (sólo conteos)
begin read only;
select estado, count(*) from public.user_reviews group by estado;
rollback;

-- Q3. user_reviews: dueño, RLS, ACL (incluye PUBLIC) y privilegios efectivos.
-- role_table_grants omite lo concedido a PUBLIC; por eso se lee relacl y se
-- calcula con has_*_privilege para cada rol.
begin read only;
select pg_get_userbyid(c.relowner) as dueno,
       c.relrowsecurity, c.relforcerowsecurity, c.relacl
  from pg_class c where c.oid = 'public.user_reviews'::regclass;
select r.rol,
       has_table_privilege(r.rol, 'public.user_reviews', 'SELECT') as sel,
       has_table_privilege(r.rol, 'public.user_reviews', 'INSERT') as ins,
       has_table_privilege(r.rol, 'public.user_reviews', 'UPDATE') as upd,
       has_table_privilege(r.rol, 'public.user_reviews', 'DELETE') as del,
       has_any_column_privilege(r.rol, 'public.user_reviews', 'SELECT') as sel_col,
       has_schema_privilege(r.rol, 'public', 'USAGE')  as uso_esquema,
       has_schema_privilege(r.rol, 'public', 'CREATE') as crear_en_esquema
  from (values ('anon'), ('authenticated'), ('service_role')) as r(rol);
select policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'user_reviews';
rollback;

-- Q4. Dependencias de user_reviews por catálogo (vistas, FK, triggers).
-- La búsqueda en prosrc es HEURÍSTICA: no ve SQL dinámico armado en tiempo
-- de ejecución ni cuerpos no SQL. Se informa como tal.
begin read only;
select distinct v.oid::regclass as vista
  from pg_depend d
  join pg_rewrite rw on rw.oid = d.objid
  join pg_class v on v.oid = rw.ev_class
 where d.refobjid = 'public.user_reviews'::regclass
   and v.oid <> d.refobjid;
select conname, conrelid::regclass as tabla
  from pg_constraint
 where confrelid = 'public.user_reviews'::regclass;
select tgname from pg_trigger
 where tgrelid = 'public.user_reviews'::regclass and not tgisinternal;
select n.nspname, p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname not in ('pg_catalog', 'information_schema')
   and p.prosrc ilike '%user_reviews%';
rollback;

-- Q5. Privilegios por defecto (lo que recibiría una tabla o función nueva)
begin read only;
select pg_get_userbyid(defaclrole) as rol,
       defaclnamespace::regnamespace as esquema,
       defaclobjtype, defaclacl
  from pg_default_acl;
rollback;

-- Q6. Jobs programados, SIN la columna command (puede llevar secretos).
-- Sólo si Q0 dio cron_job no nulo.
begin read only;
select jobid, jobname, schedule, active from cron.job order by jobid;
rollback;

-- Q7. Cuentas (sólo conteos). HEURÍSTICA: email confirmado sin
-- confirmation_sent_at SUGIERE autoconfirmación; no prueba que la persona
-- controle o no controle el buzón.
begin read only;
select count(*) as total,
       count(*) filter (where email_confirmed_at is null) as sin_confirmar,
       count(*) filter (where email_confirmed_at is not null
                          and confirmation_sent_at is null) as posibles_autoconfirmadas
  from auth.users;
rollback;

-- Q8. Helpers de admin: sólo los dos propios, con atributos y una huella
-- del cuerpo para comparar con el repo (sin volcar funciones ajenas).
begin read only;
select p.oid::regprocedure as funcion,
       pg_get_userbyid(p.proowner) as dueno,
       p.prosecdef as security_definer,
       p.proconfig as configuracion,
       p.provolatile,
       p.proacl,
       md5(p.prosrc) as huella_cuerpo,
       has_function_privilege('anon', p.oid, 'EXECUTE') as exec_anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as exec_auth
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('is_admin', 'is_admin_mfa', 'factores_totp_verificados');
rollback;

-- Q9. FK y triggers sobre auth.users
begin read only;
select conrelid::regclass as tabla, confdeltype
  from pg_constraint
 where confrelid = 'auth.users'::regclass and contype = 'f'
 order by 1;
select tgname from pg_trigger
 where tgrelid = 'auth.users'::regclass and not tgisinternal;
rollback;

-- Q10. Tamaño
begin read only;
select pg_size_pretty(pg_database_size(current_database()));
select c.relname, pg_size_pretty(pg_total_relation_size(c.oid))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by pg_total_relation_size(c.oid) desc limit 10;
rollback;
```

- **Huella del cuerpo (Q8):** se compara con `md5` del mismo cuerpo en la
  base local con `007` aplicado. Si difiere, se registra "distinto del repo",
  sin volcar el cuerpo.

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
- **Criterio de cierre:** Q0–Q10 y las verificaciones de panel con
  resultado, o con el motivo por el que no se pudo (incluido "no existe").
- **Evidencia para Codex:** el informe, con las consultas exactas que se
  corrieron y sus resultados agregados.
- **Efecto sobre el resto:** si **Q2** muestra filas o **Q3** muestra
  permisos abiertos, se aplica la migración de cierre de `user_reviews`
  (rollback general) antes de E9c, y las filas se informan al dueño sin
  publicarlas ni migrarlas. Si Q7 muestra **posibles** autoconfirmadas, se
  pregunta P4 con ese mismo grado de evidencia: no se presenta como
  demostración de quién controla un buzón.

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
- **Estado al 24/10/2026** (`docs/ESTADO.md` es la fuente vigente):
  - versión candidata de reglas `2026-10-24.2` (`3ff1643`);
  - la revisión local de correcciones quedó cerrada (auditoría
    `2026-10-24-auditoria-focalizada-3ff1643.md`);
  - **el dueño aceptó como riesgo residual** el caso pendiente de A3 ("Te
    voy a pegar un tiro la rompe esta peli", sin puntuación, se publica): lo
    atienden las denuncias y su revisión diaria. No se vuelve a corregir el
    filtro por ese ejemplo;
  - **la validación independiente sigue pendiente**, y E1 no está aprobada;
  - el dueño autorizó avanzar con E2a **local** mientras tanto, sin
    publicación.

### E2a — Esquema, participantes y permisos

- **Objetivo:** objetos de base de rev. §2.1 y §2.2.1–§2.2.2, cerrados para
  `anon` y `authenticated`, sin lógica de escritura todavía.
- **Depende de:** nada (local).
- **Archivos:** `supabase/migrations/011_comunidad_esquema.sql` y
  `011_comunidad_esquema_down.sql`; `scripts/sala/db-local.mjs` (lista:
  agrega `007_top_manual.sql` y las migraciones nuevas, y su test
  `db-local.test.mjs`); `scripts/comunidad/pruebas-permisos.mjs`;
  `scripts/comunidad/pruebas-invariantes.mjs` (rol dueño, aparte);
  `022_cerrar_user_reviews.sql` y su down conservador **redactados** acá,
  aplicados en local, y en Producción sólo después de E0 y con
  autorización.
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
  - `revoke all` sobre el esquema y sobre todo lo nuevo para `anon`,
    `authenticated` **y `service_role`**; RLS activada sin policies. El único
    con acceso a las tablas es el dueño de la migración, que es el dueño de
    las funciones `security definer`.
  - **Dónde quedan las funciones:** en el esquema `public` (expuesto), con
    prefijo `comunidad_`, `security definer` y `set search_path = ''`.
    `EXECUTE` sólo para el rol que corresponde a cada una (rev. §2.1.2). Así
    la API y el RPC pueden usarlas sin exponer las tablas.
- **Interfaces:** ninguna pública todavía.
- **Pruebas y resultado esperado.** Tres barreras, probadas **por separado**
  (auditoría `9450006`, A5); un 404 de REST no prueba grants ni RLS:
  1. **SQL con `SET ROLE`**, en la base local, por objeto: para `anon`,
     `authenticated` y `service_role`, `has_table_privilege` falso en las
     cuatro operaciones e intento real de SELECT, INSERT, UPDATE y DELETE →
     error 42501. `relrowsecurity` verdadero en cada tabla. Uso del esquema
     `comunidad` denegado.
  2. **REST público** con anon key y con JWT de autor, ajeno, suspendido,
     admin AAL1 y admin AAL2: ninguna tabla nueva es alcanzable. Prueba que
     no está expuesta; no se cuenta como prueba de grants.
  3. **RPC expuestas:** `has_function_privilege` por rol y llamada real por
     rol a cada función `public.comunidad_*` que exista en la entrega; sólo
     el rol previsto ejecuta (las funciones llegan desde E2b).
  - **Constraints e invariantes** (FK compuesta, `CHECK` de autoevaluación,
    largo, NFC, trigger de transiciones): los prueba el **rol dueño de la
    base local** insertando directo, en una suite aparte. No se mezclan con
    la matriz de permisos ni se dan permisos de tabla a `service_role` para
    probarlos.
  - `007_top_manual.sql` aplicado en local; `is_admin_mfa()` real responde
    falso con admin AAL1 y verdadero con admin AAL2 y dos factores.
  - `up` → `down` → `up` limpio; las tablas existentes quedan iguales
    (comparación de `pg_dump --schema-only` antes y después).
- **Riesgos:** privilegios por defecto distintos en Producción [no
  verificado: E0 Q5]. Por eso el `revoke` es explícito.
- **Criterio de cierre:** matriz completa con resultado esperado escrito
  antes y obtenido.
- **Evidencia para Codex:** migraciones, salida de `pruebas-permisos.mjs`,
  volcado de grants y policies de la base local, log de up/down/up.
- **Estado al 24/10/2026** (`docs/ESTADO.md` es la fuente vigente):
  implementada **en local** en `1d045f3`; pendiente de auditoría
  focalizada. `IS NFC NORMALIZED` sirvió en el `CHECK`. 022 sólo en local.
  Informe: `docs/medidas/2026-10-24-informe-claude-e2a.md`.

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
    reintento, y `lib/cuenta/estado-baja-nucleo.ts` (puro) con su test;
  - `app/api/cuenta/estado-baja/route.ts` (GET con Bearer) y la función
    `comunidad_estado_baja(uid)`, sólo `service_role`: la única vía para que
    la cuenta lea su propio marcador, porque las tablas están cerradas;
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
  - Resultados: `{ ok: true }` **sólo** si `getUserById` confirma la
    ausencia (o `deleteUser` respondió ok); `{ ok: false, motivo:
    "baja-parcial" }` (comunidad borrada, cuenta confirmada viva);
    `{ ok: false, motivo: "baja-sin-verificar" }` (comunidad borrada y
    `getUserById` falló por red, 5xx o configuración: "No pudimos verificar
    si tu cuenta se eliminó. Probá de nuevo"); los motivos existentes sin
    cambios.
  - **Cancelación administrativa con sanción activa:** `baja_comunitaria`
    copia al marcador el fin de la suspensión vigente (`sancion_hasta`). Si
    el admin quita el marcador (`comunidad_quitar_marcador_baja`, E4) y la
    sanción sigue vigente, el participante nuevo nace suspendido hasta esa
    fecha. Si la cuenta se elimina de verdad, la copia cae con el marcador
    (rev. §5).
  - `cuentaComoIntento` sigue contando sólo `password-invalida`.
- **Pruebas y resultado esperado:**

  | # | Caso | Esperado |
  |---|---|---|
  | B1 | Paso 1 confirma y `deleteUser` falla | Marcador presente; datos comunitarios borrados y tramos cerrados; cuenta viva; respuesta `baja-parcial` con el texto "Borramos tus datos de comunidad, pero no pudimos eliminar la cuenta" |
  | B2 | Durante la ventana, otra sesión publica, vota, denuncia, bloquea o cambia nombre | Rechazo `baja_en_curso`; **no se crea participante** |
  | B3a | Voto en vuelo que tomó `K_CUENTA` antes que la baja | El voto confirma; la baja espera y después lo borra y cierra su tramo |
  | B3b | Voto que verificó el Bearer antes de la baja pero entra a la base después | Rechazo `baja_en_curso` |
  | B4 | Dos pedidos de baja simultáneos | `baja_comunitaria` se serializa y la segunda no cambia nada; ambos responden eliminación completa. Con dos `deleteUser` realmente simultáneos, **los dos pueden responder éxito** (observado en el GoTrue local, E2b); si el segundo llega cuando la cuenta ya no está, falla con 404 y reconcilia con `getUserById` (probado forzando el orden). Lo que fija el contrato es la respuesta de los flujos, no cuál `deleteUser` falla |
  | B5 | Auth borró pero la respuesta se perdió (fallo inyectado después del éxito) | Reconcilia → eliminación completa; no queda marcador (cascada) |
  | B6 | Cuenta sin participante previo | Sólo marcador; después `deleteUser` → completa |
  | B7 | Reingreso con marcador y reintento | Se ve "Eliminación pendiente"; el reintento completa |
  | B8 | Borrado real por la API admin de Auth local **sin** paso 1, con un voto concurrente y una consolidación esperando | O termina con tramos cerrados y participante sin `user_id`, o se revierte entero (deadlock o timeout); el reintento termina. Nunca tramos a medio cerrar |
  | B9 | Runbook: `baja_comunitaria_admin` y después borrado en Auth | Completa; la consulta de verificación del runbook no encuentra participante con ese `user_id` |
  | B10 | El admin quita un marcador (cancelación) | Nada se restaura; una escritura posterior crea un participante nuevo, sin historial |
  | B11 | Cuenta suspendida pide la baja | Se permite (rev. §2.1.2, fila E); el marcador impide recrear identidad para esquivar la suspensión |
  | B12 | `deleteUser` falla y `getUserById` también falla (red, 5xx, sin configuración) | `baja-sin-verificar`; nunca `ok: true`; el marcador sigue; el reintento vuelve a reconciliar |
  | B13 | Login nuevo con marcador presente | `GET /api/cuenta/estado-baja` devuelve pendiente y la pantalla muestra "Eliminación pendiente"; otra cuenta no lo ve; sin sesión → 401 |
  | B14 | Cuenta suspendida → paso 1 → el admin quita el marcador con la sanción vigente | El participante nuevo nace suspendido hasta `sancion_hasta`; no publica ni vota; sí bloquea, borra y elimina la cuenta |

  - **Preliminar y gate** (§5.0): B3a, B3b y B8 se corren acá con
    primitivas y fixtures, y como gate en E3a (B3) y E7 (B8). B10 y B14 usan
    la función de quitar marcador, que llega en E4: acá se prueban con el rol
    dueño de la base local y se repiten como gate en E4.
  - Además, las pruebas unitarias de `eliminar-cuenta-flujo` con
    dependencias inyectadas cubren el orden y cada resultado, incluido que
    nunca devuelve `ok: true` si `getUserById` encuentra la cuenta **o
    falla**.
  - **Recorrido visible** (navegador local): pedir la baja con fallo
    inyectado → mensaje parcial; reingresar → "Eliminación pendiente";
    reintentar → eliminada.
- **Riesgos:** el camino del panel invierte el orden de locks (rev. §2.2.3,
  punto 3). Mitigación: runbook y B8/B9; no se promete prohibir el panel.
- **Rollback:** la migración `down` y volver el flujo de la ruta a su
  versión anterior (un solo paso `deleteUser`).
- **Criterio de cierre:** B1–B14 verdes en la base local con Auth real de
  `supabase start` (con la marca de "preliminar" donde corresponda, §5.0);
  los tests del flujo verdes; el recorrido visible registrado; el runbook
  escrito.
- **Evidencia para Codex:** salida de `pruebas-baja.mjs` caso por caso,
  diff del flujo y su test, runbook.
- **Estado al 24/10/2026** (`docs/ESTADO.md` es la fuente vigente):
  implementada **en local** en `c6c6ba5`, junto con los ajustes A1/A2 de la
  auditoría de E2a (`6e0e1d1`, `9cea2ea`). Pendiente de auditoría focalizada.
  - B1–B14: 26/26.
  - Distinto de lo esperado en B4: dos `deleteUser` simultáneos responden
    200 los dos, y "uno falla y reconcilia" se probó forzando el orden.
  - Distinto de lo esperado en B8: un ciclo blando no aborta, y se agregaron
    las variantes con deadlock real y con `lock_timeout`.
  - Informe: `docs/medidas/2026-10-24-informe-claude-e2b.md`.

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
- **Pruebas preliminares y resultado esperado** (§5.0; sobre las primitivas,
  con filas de fixture, porque las funciones de escritura todavía no
  existen): casos 1–5 de rev. §2.2.4 modelados con dos o más sesiones que
  llaman a las primitivas en el orden del protocolo; marcas monótonas y
  resultado igual al serial; una sesión que viola el orden produce el
  deadlock esperado (prueba de que el orden importa); casos 6, 7 y 11 con
  tramos de fixture y una consolidación de fixture.
- **Gates posteriores** (no cierran E2c): casos 1–4 en E3a, caso 5 en E4,
  casos 6–11 en E7, todos otra vez en E9a. El inventario "cada función usa
  el protocolo" se cierra en la entrega que crea cada función.
- **Riesgos:** deadlocks por un orden mal aplicado. Se miden con
  `log_lock_waits` en la base local.
- **Rollback:** down.
- **Criterio de cierre:** pruebas preliminares verdes cinco corridas
  seguidas, informadas como preliminares.
- **Evidencia para Codex:** salida de las corridas, logs de espera de locks.
- **Estado al 24/10/2026** (`docs/ESTADO.md` es la fuente vigente):
  implementada **en local** en `a306cb8`. La auditoría de `cd62577` encontró
  un deadlock entre dos actores cruzados que seguían el protocolo (el paso 1
  bloqueaba la fila del actor). Se corrigió en `b4aa75b`, con su regresión en
  `7b33702`. Pendiente de la auditoría focalizada de esa corrección.
  - 013 trae una primitiva por paso. El orden **se hace cumplir** (CB002 si
    se pide fuera de orden).
  - Casos 1–5, 6, 7 y 11, preliminares: 20/20 en **cinco corridas
    seguidas**.
  - Las operaciones de prueba son fixtures sobre las primitivas reales.
    Gates en E3a (casos 1–4), E4 (caso 5) y E7 (casos 6–11).
  - El caso 11 se probó con las primitivas del corte y un cómputo de
    fixture. Los casos 8–10 no son de esta entrega: dependen de la
    consolidación (E7) y de la purga (E8).
  - Informe: `docs/medidas/2026-10-24-informe-claude-e2c.md`.
- **Orden de despliegue** (vale para todas las entregas): cada migración se
  aplica **antes** del código que depende de ella. Esa dependencia empezó en
  E2b, con 011 → 012 antes de la ruta de eliminación; sin ellas, la
  eliminación falla cerrada (`fallo-borrado`, sin borrar nada). 013 no tiene
  código de la app que dependa de ella todavía. Ninguna se aplica fuera del
  entorno local sin E0 y autorización.

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
  - `lib/cors.ts` y `lib/cors-inventario.test.ts` (sólo GET/POST, como hoy);
  - **interfaz:**
    - `components/comunidad/EditorResena.tsx` +
      `lib/comunidad/editor-nucleo.ts`: escribir, editar y eliminar con
      confirmación; contador 80–600 en puntos de código (la misma cuenta que
      el servidor); aviso "Al editar tu reseña se reinician los votos de
      utilidad" antes de confirmar; estados publicada, retenida ("En
      revisión" con motivo general) y rechazada (motivo concreto); reintento
      con el mismo `id_intento`; reconciliación por estado si se perdió la
      respuesta;
    - `components/comunidad/TerminosComunidad.tsx` +
      `app/api/comunidad/terminos/route.ts` + función
      `comunidad_aceptar_terminos`: aceptación versionada antes de crear
      contenido; con términos nuevos, se pide aceptar otra vez para publicar,
      no para borrar, bloquear o eliminar la cuenta;
    - `components/comunidad/EvaluacionResena.tsx` +
      `lib/comunidad/evaluacion-nucleo.ts`: Me sirvió / No me sirvió /
      retirar, sin evaluar la propia, y conteo explícito ("a n de m les
      sirvió").
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
  - límites por día con carreras: nunca se supera el límite;
  - **gates de integración** (§5.0): casos 1–4 de rev. §2.2.4 y B3a/B3b con
    las funciones reales;
  - **núcleos de interfaz:** contador igual al del servidor con emojis y
    combinaciones; aviso de reinicio sólo al editar texto persistido;
    reintento sin duplicar; respuesta de la cuenta anterior descartada;
  - **recorrido visible** en navegador local: aceptar términos → escribir →
    publicada; editar con aviso; texto con teléfono → rechazo con motivo;
    texto retenido → "En revisión"; eliminar con confirmación; evaluar y
    retirar; fallo de red → aviso y reintento sin duplicar.
- **Riesgos:** la decisión de reglas viaja de la ruta a la función; la
  función confía en ella porque sólo `service_role` la ejecuta (rev. §2.1.2).
- **Rollback:** down y quitar rutas (nadie las llama todavía).
- **Criterio de cierre:** pruebas verdes; casos 1–5 de E2c siguen verdes.
- **Evidencia para Codex:** salidas, diff, tabla de rev. §3.4.1 con el
  resultado obtenido por fila.
- **Estado al 24/10/2026** (`docs/ESTADO.md` es la fuente vigente):
  implementada **en local** en `64daf53`, `c2bf84a` y `5ee5133`. La
  auditoría focalizada (Codex, sobre `faabf5a`) pidió dos correcciones P2:
  - A1: una confirmación perdida con Supabase no se informa como "no se
    guardó";
  - A2: el editor conserva el borrador y la versión base.
  Las dos se corrigieron el 25/10 en `8bdfe3f` y `d66244b`
  (`docs/medidas/2026-10-25-informe-claude-e3a-a1a2.md`), y quedan
  cerradas por Codex el 25/10
  (`docs/medidas/2026-10-25-auditoria-e3a-a1a2-f9be491.md`): **E3a local
  cerrada**, con sus límites. El mismo día se cambiaron los botones de
  evaluación por pulgares, a pedido del dueño
  (`docs/medidas/2026-10-25-informe-claude-e3a-pulgares.md`).
  - Gates de §5.0 cerrados con las funciones reales: casos 1–4 de §2.2.4,
    B3a/B3b y actores cruzados. El caso 5 (suspensión frente a voto) sigue
    con gate en E4.
  - Dependencias mínimas agregadas:
    - términos con texto de **borrador local**;
    - una lectura provisional de un título, que reemplaza E5a;
    - una página `/revision-local/comunidad`, porque la ficha necesita
      TMDB y en local no hay token.
  - No se construyó: admisión, duplicados ni "Pedir revisión" (E3b).
  - Informe: `docs/medidas/2026-10-24-informe-claude-e3a.md`.

### E3b — Admisión, colas, denuncias, bloqueos y revisión de rechazos

- **Objetivo:** rev. §3.3–§3.3.4.
- **Depende de:** E3a.
- **Archivos:** `supabase/migrations/015_comunidad_moderacion_datos.sql` +
  down; `app/api/comunidad/denuncias/route.ts`,
  `app/api/comunidad/bloqueos/route.ts`,
  `app/api/comunidad/revision/route.ts`; `lib/comunidad/duplicados.ts`.
  **Interfaz:**
  - `components/comunidad/MenuResena.tsx` +
    `lib/comunidad/menu-nucleo.ts`: denunciar (categorías del diseño,
    confirmación, ofrecer bloquear en el mismo paso), bloquear y desbloquear
    con confirmación, fallos con reintento, mensaje honesto si la cola de
    denuncias está llena;
  - `app/cuenta/bloqueados/page.tsx`: lista de bloqueados y desbloqueo;
  - en `EditorResena`: botón "Pedir revisión" sólo para rechazos por regla
    de contenido, y el aviso de que una edición enviada a revisión deja de
    mostrar la publicada.
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
    fragmentos en claro (inspección de la tabla);
  - **recorrido visible:** denunciar con confirmación; bloquear y ver
    desaparecer la reseña; desbloquear desde la cuenta; pedir revisión de un
    rechazo y verla "En revisión"; fallo de red en cada acción → reintento.
- **Riesgos:** las cifras de los topes son hipótesis hasta P6.
- **Rollback:** down.
- **Criterio de cierre:** pruebas verdes y volumen máximo por tabla
  calculado con los topes.
- **Evidencia para Codex:** salidas, cálculo de cotas, diff.
- **Estado al 25/10/2026** (`docs/ESTADO.md` es la fuente vigente):
  implementada **en local** en `2e2d00e`. Informe con el cálculo de cotas y
  las interpretaciones a auditar: `docs/medidas/2026-10-25-informe-claude-e3b.md`;
  salidas: `docs/medidas/2026-10-25-e3b-salidas.txt`. Auditada por Codex
  sobre `64d940e` con dos P2 de interfaz (A1 aislamiento por cuenta, A2
  bloqueo pendiente tras la denuncia), corregidas en local
  (`docs/medidas/2026-10-25-informe-claude-e3b-a1a2.md`) y **cerradas por
  Codex sobre `ce26526`**: E3b local cerrada.
  Al construir E4: 50 es el tope de admisión, no una cota del total retenido
  (la corroboración puede superarlo).
  - Además de los archivos de arriba: `lib/comunidad/menu-nucleo.ts` y
    `moderacion-nucleo.ts`, `components/comunidad/FilaBloqueados.tsx`, la
    batería `scripts/comunidad/pruebas-moderacion.mjs` y
    `up-down-up-015.mjs` (sólo 015: el up/down/up de 011 borra el esquema
    de la base compartida).
  - Protocolo: dos niveles nuevos antes de la marca (8 hash, 9 cola).
  - Los topes siguen siendo hipótesis (P6).
  - No resuelve el pendiente de las denuncias recibidas que caen al borrar
    una cuenta, ni fija plazos de retención.

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
- **Pruebas y resultado esperado:** admin AAL1 y no admin → denegado por
  API y por RPC directo, con el `is_admin_mfa()` real y factores TOTP reales
  (§4); una decisión tardía sobre una versión vieja no publica otra ni
  resucita una borrada; suspensión y levantamiento con el protocolo de E2c;
  **gates:** caso 5 de rev. §2.2.4, B10 y B14 con
  `comunidad_quitar_marcador_baja` real; recorrido visible del panel con
  datos sintéticos.
- **Riesgos:** el endurecimiento de la editorial no entra acá (trabajo
  separado).
- **Rollback:** down y quitar la ruta del panel.
- **Criterio de cierre:** pruebas verdes; el panel se usa en local con datos
  sintéticos.
- **Evidencia para Codex:** salidas, capturas locales, diff.
- **Estado al 25/10/2026** (`docs/ESTADO.md` es la fuente vigente):
  implementada **en local** (`016_comunidad_admin.sql`, `/admin/moderacion`,
  `/api/admin/moderacion`), **pendiente de auditoría focalizada**. Una sola
  ruta con `accion` (como el Top) en vez de una por acción. Gates: caso 5,
  B10 y B14 con las funciones reales en `scripts/comunidad/pruebas-admin.mjs`.
  El muestreo existe y queda apagado. Las denuncias recibidas en una baja se
  cierran sin texto; conservar el texto queda para el dueño (P3). Informe:
  `docs/medidas/2026-10-25-informe-claude-e4.md`.
  **Corrección A1/A2** (auditoría `docs/medidas/2026-10-25-auditoria-e4-9340da9.md`),
  pestaña Retiradas y "Ver situación actual" en el Registro para restaurar
  (A1); la baja bloquea las denuncias hechas y recibidas antes de copiar el
  historial, así dos bajas simultáneas no lo recrean (A2). Informe:
  `docs/medidas/2026-10-25-informe-claude-e4-a1a2.md`. **Cerrada como entrega
  local el 26/10** (`docs/medidas/2026-10-26-auditoria-e4-a1a2-1fb85cb.md`),
  sin publicación; Codex no pudo repetir las pruebas de base (Docker).

### E5a — Lectura protegida y "Recientes"

- **Objetivo:** leer reseñas con sesión, sin exponer nada a `anon` ni tocar
  `/api/title`.
- **Depende de:** E3a.
- **Archivos:** `supabase/migrations/017_comunidad_lectura.sql` + down;
  `app/api/comunidad/resenas/route.ts` (GET); `lib/comunidad/lectura.ts`;
  `lib/resenas.ts` (une la de Yump, siempre primera, con las de la
  comunidad); `components/ResenasAcordeon.tsx`.
  **Interfaz:**
  - `components/comunidad/ListaResenas.tsx` +
    `lib/comunidad/lista-nucleo.ts`: **cinco reseñas iniciales**, selector
    Más útiles / Recientes (Más útiles se habilita en E5b) y **Cargar más**
    con la página confirmada que avanza sólo cuando llega la tanda (el
    patrón de `EstadoTanda` en `hooks/filtro-paginado-nucleo.ts`), fallo de
    tanda con aviso al pie y deduplicación por id;
  - `components/comunidad/InvitacionRegistro.tsx`: sin sesión, invitación a
    registrarse en lugar de la lista, **también en una ficha sin ninguna
    reseña** (no revela si hay o no);
  - estado vacío con sesión: "Todavía no hay reseñas" y acceso al editor.
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
  - el acordeón sigue cerrado por defecto y con la reseña Yump primero;
  - el HTML y la metadata de la ficha no contienen texto de fixtures;
  - cerrar sesión con la lista abierta → la lista desaparece y una respuesta
    tardía no la vuelve a pintar;
  - **recorrido visible:** sin sesión (con y sin reseñas) → invitación;
    con sesión → cinco, Cargar más, fallo de tanda y reintento, sin repetir.
- **Rollback (código existente):** revertir el commit de `lib/resenas.ts` y
  del acordeón; con el interruptor apagado no se muestra nada nuevo.
- **Riesgos:** cachés: la ruta es `force-dynamic` y la respuesta lleva
  `Cache-Control: private, no-store`; el service worker ya no cachea
  `/api/*`.
- **Rollback:** interruptor de lectura apagado; down antes de activar.
- **Criterio de cierre:** pruebas verdes.
- **Evidencia para Codex:** salidas, comparación de `/api/title`, diff.
- **Estado al 26/10/2026** (`docs/ESTADO.md` es la fuente vigente):
  implementada **en local** (`017_comunidad_lectura.sql`,
  `/api/comunidad/resenas/lista`, una sola sección RESEÑAS en la ficha),
  **pendiente de auditoría focalizada**. Desvío: la lectura es
  `GET /api/comunidad/resenas/lista` y no un GET de `/api/comunidad/resenas`,
  porque la envoltura CORS admite un método por ruta. La comparación de
  `/api/title` en ejecución queda pendiente (sin TMDB en local); la fija un
  barrido de fuente. Informe: `docs/medidas/2026-10-26-informe-claude-e5a.md`.
  **Corrección A1** (auditoría `docs/medidas/2026-10-26-auditoria-e5a-b7ba962.md`):
  la lista refleja también el voto confirmado por la reconciliación
  (`sin_cambios`, `sin_efecto`). Informe:
  `docs/medidas/2026-10-26-informe-claude-e5a-a1.md`. **Cerrada como entrega
  local el 26/10** (`docs/medidas/2026-10-26-auditoria-e5a-a1-367cf25.md`);
  sigue pendiente la comparación de `/api/title` en ejecución.

### E5b — Utilidad y "Más útiles"

- **Objetivo:** votos de utilidad con Wilson (T10) y snapshots acotados
  (rev. §2.3).
- **Depende de:** E5a.
- **Archivos:** `supabase/migrations/018_comunidad_utilidad.sql` + down;
  `lib/comunidad/wilson.ts` y su test; ruta GET con `orden=utiles`;
  `ListaResenas` habilita Más útiles como orden por defecto, con el aviso
  "Orden actualizado" y volver a empezar una vez al vencer el snapshot.
- **Interfaces:** snapshot en filas de 100 ids; un generador por título con
  lock consultivo y búsqueda doble; reutilización de 10 min; vigencia de
  2 h; revalidación de 50 posiciones por página; respuesta "orden
  actualizado" al vencer.
- **Pruebas y resultado esperado:**
  - 20 lectores concurrentes del mismo título → un solo snapshot;
  - con 10.000 reseñas sintéticas: costo por página medido y que **no crece
    con el total**; tamaño de tabla, índice y TOAST medido;
  - página con muchas ocultas → devuelve menos y avanza el cursor, sin
    recorrer más de 50;
  - **recorrido visible:** cambiar entre Más útiles y Recientes; evaluar y
    ver el conteo; vencimiento del orden → aviso y reinicio sin duplicados.
- **Riesgos:** la cota física supera la estimada; entonces se agrega una
  purga horaria (rev. §2.3) en E8.
- **Rollback:** down.
- **Criterio de cierre:** mediciones registradas y pruebas verdes.
- **Evidencia para Codex:** mediciones, `EXPLAIN (ANALYZE, BUFFERS)` de la
  página, diff.
- **Estado (26/10):** implementada en local por Claude; **cerrada como
  entrega local por Codex el 26/10**
  (`docs/medidas/2026-10-26-auditoria-e5b-662e247.md`):
  - `pruebas-utiles` 14/14 y up/down/up 5/5; baterías anteriores verdes;
  - página con cursor constante en N (10.000 medidas);
  - generar el orden: 2,07 s con 10.000;
  - la purga de E8 no se decidió.

  Informe: `docs/medidas/2026-10-26-informe-claude-e5b.md`; mediciones:
  `docs/medidas/2026-10-26-e5b-mediciones.md`.

### E6 — Perfiles y nombre comunitario

- **Objetivo:** proyección pública mínima de perfil y nombre comunitario
  con las reglas de E1.
- **Depende de:** E1, E3a.
- **Archivos:** migración `019_comunidad_perfiles.sql` + down;
  `app/api/comunidad/perfil/route.ts`, `app/api/comunidad/nombre/route.ts`;
  `app/u/page.tsx` (ruta nativa `/u/?id=`); `scripts/build-capacitor.mjs`
  (incluir `/u`); `components/comunidad/PerfilComunitario.tsx` +
  `lib/comunidad/perfil-nucleo.ts`: cabecera con nombre y avatar, agregados
  permitidos y **la lista de reseñas del perfil** con Cargar más;
  `app/cuenta/perfil/page.tsx`: campo de nombre comunitario con su motivo
  de rechazo.
- **Interfaces:** la proyección devuelve sólo nombre comunitario, avatar del
  catálogo, agregados permitidos y reseñas visibles para quien mira; nunca
  `profiles` completo ni correo. El nombre se cambia sólo por función.
- **Pruebas y resultado esperado:** campos fuera de la proyección ausentes;
  un update directo de `profiles.display_name` no cambia nada en lo
  comunitario; nombre con contacto ofuscado → rechazo; cuenta eliminada →
  "Cuenta eliminada", sin nombre ni avatar; un perfil bloqueado se ve como
  "Usuario bloqueado", sin reseñas; **recorrido visible:** ir al perfil
  desde una reseña, Cargar más, cambiar el nombre con y sin rechazo.
- **Rollback:** down y quitar la ruta.
- **Criterio de cierre:** pruebas verdes.
- **Evidencia para Codex:** salidas, diff.
- **Estado (27/10):** implementada en local por Claude; auditada sobre
  `8cbe0cd` (A1, A2) y, con la corrección, **cerrada como entrega local por
  Codex el 27/10** (`docs/medidas/2026-10-27-auditoria-e6-a1a2-43117a2.md`):
  - un nombre que E1 retendría no se guarda: no hay cola de revisión de
    nombres;
  - el cambio de nombre es idempotente por intento (A1);
  - el perfil aplica los cambios de disponibilidad al cargar más (A2).

  Informes: `docs/medidas/2026-10-27-informe-claude-e6.md` y
  `docs/medidas/2026-10-27-informe-claude-e6-a1a2.md`.

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
  sigue verde; **gates:** casos 6–11 y B8 con votos y `consolidar_mes`
  reales; **suspensión como intervalo** (conciliación de rev. §2.2.2 del
  25/10/2026: suspender NO cierra tramos) con suspensiones y votos reales de
  E4: rige antes de `T(M)` → el par no cuenta; levantada antes de `T(M)` →
  cuenta; igualdad exacta en `desde = T(M)` y `hasta = T(M)`; **recorrido visible:** selector Top semanal plataformas / Top
  Yumpers, sin toggle Películas/Series en Top Yumpers, "Cuenta eliminada"
  sin nombre.
- **Riesgos:** confundir Top Yumpers con el Top manual. Pruebas de que no
  comparten fuente ni caché.
- **Rollback:** down y ocultar el selector.
- **Criterio de cierre:** pruebas verdes, cinco corridas seguidas de los
  casos concurrentes.
- **Evidencia para Codex:** salidas, diff de `TopView`, resultado de los
  casos de igualdad.
- **Estado (27/10):** implementada en local por Claude y **cerrada como
  entrega local por Codex el 27/10**
  (`docs/medidas/2026-10-27-auditoria-e7-ed6a791.md`), sin hallazgos
  bloqueantes:
  - casos 6–11 y B8 con funciones reales;
  - cinco corridas seguidas de los concurrentes;
  - `top_resultados.participante_id` sin FK, para que la consolidación no
    tome locks implícitos de filas de participantes.

  Informe: `docs/medidas/2026-10-27-informe-claude-e7.md`.

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
- **Estado (27/10):** implementada en local por Claude, **pendiente de
  auditoría focalizada**. Cambio respecto de este plan, por decisión del
  dueño del 27/10: los plazos NO arrancan vacíos. El dueño fijó plazos como
  decisiones de producto (no validados legalmente; P3 sigue abierto para la
  validación) y quedan cargados en `comunidad.purga_config` con el
  interruptor `purga_activa` APAGADO, así que nada se purga hasta
  encenderlo. Los no definidos (huellas, rechazadas, retenidas, votos
  retirados y otros) quedan sin configurar; la excepción del texto
  denunciado tras una baja sigue pendiente y bloqueada por un CHECK. La
  interfaz es el procedimiento `comunidad.purgar(alcance, ahora)` ('hora' |
  'dia' | una categoría), que confirma cada lote, en vez de una función
  `purgar_comunidad(ahora)` en una sola transacción.

  Informe: `docs/medidas/2026-10-27-informe-claude-e8.md`.
  Auditoría sobre `95c09b2`: pendiente de A1 (un mes purgado se podía
  reconstruir al ampliar el plazo). Corrección del 28/10 (`d37563a`, marca
  permanente `comunidad.meses_sin_historial`):
  `docs/medidas/2026-10-28-informe-claude-e8-a1.md`. **Cerrada en local**
  por Codex el 28/10: `docs/medidas/2026-10-28-auditoria-e8-a1-c9ba130.md`.

### E9a — Integración web con interruptores apagados

- **Objetivo:** dejar todo integrado y apagado para poder desplegarlo sin
  efecto visible.
- **Depende de:** E4–E8 y E0.
- **Archivos:** sin lógica nueva de servidor; ajustes de integración de los
  componentes de E3a–E7 en la ficha, la cuenta y `/top`; informe de cuotas
  con mediciones locales escaladas.
- **Gates de integración:** todos los de §5.0 otra vez, sobre el conjunto
  integrado.
- **Recorrido visible completo** en navegador local, de punta a punta:
  registro e invitación, términos, escribir, editar, rechazos y revisión,
  evaluar, ordenar, Cargar más, denunciar, bloquear y desbloquear, perfil,
  Top Yumpers, baja de cuenta y cambio de cuenta sin restos de la anterior.
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

  **Parte local hecha por Claude el 28/10, pendiente de auditoría; E9a NO
  cerrada:** falta E0 y los pasos de Producción de arriba.
  - Gates de §5.0 repetidos sobre el conjunto integrado.
  - Recorrido visible completo.
  - Todo apagado igual a `52c7ae7`.
  - `/api/title` idéntico.
  - Build verde.
  - Durante la corrida, el arnés de 011–014 borró datos ajenos de la base
    local; ahora queda frenado.

  Informe: `docs/medidas/2026-10-28-informe-claude-e9a.md`. Prueba del dueño:
  `docs/medidas/2026-10-28-e9a-prueba-duenio.md`.

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

- **Objetivo (corregido tras `9450006`, A4):** encender lectura y
  publicación automática con las colas y, si el dueño lo acepta, el
  muestreo de P6. **No hay un paso obligatorio de retener y revisar todo el
  contenido real**: eso no fue acordado.
- **Depende de:** E9a, E9b y **todas** las condiciones de §1.
- **Pasos:**
  1. ensayo con **cuentas de prueba y textos sintéticos** en el entorno
     aislado (local o preview), con los interruptores tal como irán en
     Producción;
  2. encender lectura;
  3. encender publicación automática con los topes de admisión de P6;
  4. jobs `pg_cron` con autorización; mediciones de cuotas a los 7 días.
- **Opcional, sólo si el dueño lo pide:** una beta limitada a voluntarios
  con publicación retenida, con alcance y duración explícitos (por ejemplo,
  N cuentas y M días). No es condición general ni aumenta la carga sin su
  consentimiento.
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
| `9450006` A1 | Tareas de interfaz por recorrido | §4, E2b, E3a, E3b, E5a, E5b, E6, E7, E9a |
| `9450006` A2 | Preliminares frente a gates; MFA real en local | §5.0, §4, E2a, E4 |
| `9450006` A3 | Consultas de E0 completas | E0 |
| `9450006` A4 | Sin revisión obligatoria de todo | E9c, §1 |
| `9450006` A5 | Barreras del esquema privado por separado | E2a |
| `9450006` E2b | B12–B14; rollback de `user_reviews` | E2b, rollback general |

## 7. Lo que este plan no hace

- No ejecuta nada ni autoriza ninguna entrega.
- No fija versión de la app ni `versionCode`.
- No resuelve P3, P4, P5 ni P6: las deja como condiciones.
- No incluye el endurecimiento de MFA de la reseña editorial.
- Las cifras (límites, topes, muestreo, 100 ids por fila, cota de
  denuncias) son hipótesis hasta medir o hasta P6.
