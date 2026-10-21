# Reseñas de usuarios y Top Yumpers — revisión del diseño y preparación

Fecha: 21/10/2026. Autor: Claude Code, para auditoría de Codex. Revisa
[`2026-10-21-resenas-comunidad-design.md`](2026-10-21-resenas-comunidad-design.md)
(borrador de Codex, registrado sin cambios en su versión con la
"Actualización del dueño — presupuesto sin gastos adicionales").

**Versión 3 (21/10/2026).** Reformula la preparación con una **decisión
explícita del dueño: NO agregar gastos por ahora.** Corrige además los cuatro
puntos de la auditoría de Codex sobre `68bd773`
([`docs/medidas/2026-10-21-auditoria-resenas-68bd773-presupuesto.md`](../../medidas/2026-10-21-auditoria-resenas-68bd773-presupuesto.md),
copiada sin cambios). La auditoría anterior (sobre `f64a659`) sigue en
[`docs/medidas/2026-10-21-auditoria-preparacion-resenas.md`](../../medidas/2026-10-21-auditoria-preparacion-resenas.md).
Qué cambió: §0.

**Qué es y qué no es.**
- Revisión y preparación. NO es el plan de implementación ni lo autoriza.
- Sin código, SQL, migraciones, consultas a Producción ni proveedores.
- Sin gastos, push, merge, deploy, cambio de versión ni AAB.
- **Las soluciones técnicas de este documento son PROPUESTAS**, pendientes de
  auditoría de Codex. Ninguna está aprobada por estar escrita acá.
- El diseño original no se reescribe: §7 lista qué se propone cambiarle.

**Base.**
- Rama `docs/resenas-comunidad`, desde `integracion/yumpea-compartir`
  (`52c7ae7`, prueba local de Yumpeá aprobada; Yumpeá viaja en el mismo AAB
  que reseñas, sin versión fijada).
- SHA-256 de las copias, idénticas a las del checkout principal:
  - diseño actualizado por Codex: `8DB24114…577F38D`;
  - informe sobre `68bd773`: `DE0967A5…0196A7`.

**Tipos de evidencia.**
- **código:** leído en `52c7ae7`, con archivo:línea.
- **panel (dueño):** comprobado por el dueño y registrado en `ESTADO.md`, con
  su fecha.
- **doc oficial:** página consultada, con su fecha.
- **[no verificado]:** lo demás.

Nada se comprobó contra Producción en esta tarea.

---

## 0. Qué cambia en v3

**Restricción de presupuesto (decisión del dueño, 21/10/2026).**
- Se descartan el tope de USD 10, las APIs pagas y el banco pago (incluso
  menor a USD 1).
- Sin servicios pagos nuevos, upgrades ni facturación adicional.
- Tampoco se sustituye por una API gratuita: no está autorizada la
  transferencia de reseñas a otro proveedor.
- Sólo infraestructura existente, verificando sus cuotas antes de afirmar
  que alcanza. No se promete costo operativo cero.

**Superado por esa decisión** (se conserva en el historial de Git, commit
`68bd773`; no repetir como vigente):
- §3 de v2: selección de proveedor, Haiku 5.5 como candidato, configuración
  de razonamiento y banco contra proveedores;
- §4 de v2: costos de API y tope de USD 10;
- §5.1 de v2: retención de proveedores;
- las preguntas P1 (proveedor y transferencia), P2 (presupuesto) y la parte
  de gasto de P5.

| Pedido / hallazgo | Dónde se resuelve |
|---|---|
| Moderación sin clasificador externo | §3 |
| Qué se publica, retiene o rechaza; fallos que no aprueban | §3.3 |
| Limitaciones y carga humana; pruebas locales con falsos positivos | §3.5, §3.6 |
| Mismos controles para ediciones y nombres; vías de elusión | §3.4 |
| Auditoría 68bd773 #1: baja de cuenta sin perder la reconstrucción | §2.2.3 |
| #2: corte consistente para TODAS las operaciones, sin depender de 15 min | §2.2.4 |
| #3: invariantes SQL viables (autoevaluación sin CHECK con otra tabla) | §2.1.3 |
| #4: snapshots de utilidad con costo y concurrencia acotados | §2.3 |
| Cuotas de la infraestructura existente | §4 |
| Entregas sin proveedor ni pruebas pagas | §6 |

**Cambio de mecanismo respecto de v2 (propuesto, no aprobado).** Las
funciones de escritura pasan a ser ejecutables sólo por `service_role`. Ver
§2.1.2 y §3.2.

---

## 1. Contraste con el código vigente

### 1.1 Contradicciones

| # | Afirmación | Código | Consecuencia |
|---|---|---|---|
| C1 | §2 del diseño: `user_reviews` "permite lectura pública de aprobadas" | `schema.sql:297-298` sin `to authenticated`: en el SQL, `anon` lee aprobadas. Efectivo en Producción: [no verificado] | Choca con "sólo cuentas con sesión" (§1 del diseño). Se cierra antes de activar el módulo (§2.1.4) |
| C2 | §2: el trigger conserva el estado al editar | Confirmado (`schema.sql:310-327`); además el autor tiene `UPDATE`/`DELETE` directos (`:300-301`) | El modelo de escritura directa no sirve (§2.1) |
| C3 | §2: Admin con comprobaciones en API y base | Sólo el Top (`is_admin_mfa()`, `007_top_manual.sql:344-351`). La editorial usa `is_admin()` sin AAL2 (`schema.sql:212-214`) y escribe desde el navegador (`app/admin/resena/[id]/page.tsx:67-76`). **Confirmado en código, no en la configuración efectiva de Producción** | Moderación copia el modelo del Top. El endurecimiento de la editorial es **trabajo separado**; acá no se implementa ni se tocan cuentas, factores o permisos |
| C4 | §3.1: no abrir `profiles` completos | `profiles` sin correo y lectura sólo propia (`schema.sql:96-99`) | La proyección comunitaria es nueva (§2.1) |
| C5 | CLAUDE.md: la ficha cacheada en `detail()` | `/api/title` `force-dynamic`, sub-partes cacheadas; editorial en vivo (`lib/enrich.ts:1448`) | Lo comunitario va en ruta aparte (T1) |
| C6 | §3.5: proveedores de login | Sólo correo + contraseña (`AuthContext.tsx:194,199`) | §2.4 |
| C7 | §3.6: cuenta eliminada sin nombre | Yumpeá conserva `nombre` con `set null` (`009_salas.sql:80`) | El ranking no copia ese patrón (§2.2.3) |
| C8 | §3.2: controles del nombre | `display_name` sin reglas en la base; update directo (`perfil/page.tsx:28`) | §3.4 |

### 1.2 Dependencias

| # | Dependencia | Evidencia | Implica |
|---|---|---|---|
| D1 | Sin limitador de tasa | Sólo un `Map` en memoria en `/api/cuenta/eliminar` | Límites en la base (§2.1.2) |
| D2 | Hay `pg_cron`; Vercel no programa nada | `sala-barrido` cada minuto (`009_salas.sql:814-815`) y `tmdb-sync-upcoming-daily` (`supabase/cron.sql`). **Panel (dueño, 18-19/09):** `pg_cron` 1.6.4 presente. Jobs efectivos hoy: [no verificado] | §2.5 |
| D3 | La ficha no está en el bundle nativo | `scripts/build-capacitor.mjs:204` | Lectura por API con Bearer; perfil en ruta nativa `/u/?id=` |
| D4 | CORS sólo GET/POST | `lib/cors.ts:37,40` | T8 |
| D5 | `/top` guarda snapshots en `sessionStorage` | `TopView.tsx:106-107,160` | T9 |
| D6 | Toggle Películas/Series global en `/top` | `TopView.tsx:94` | Se oculta en Top Yumpers. Los nombres del selector ya están decididos |
| D7 | Privacidad y términos en `yump.ar`, a cargo del dueño | `lib/legal.ts:22-25` | Trabajo del dueño fuera del código |
| D8 | Backups, logs y cuotas sin verificar | `PLAY-STORE.md` §7.c; §4 | E0 |
| D9 | Baja de cuenta = `deleteUser` con `on delete cascade` | `lib/eliminar-cuenta.ts:93` | §2.2.3 |
| D10 | Sin normalización NFC | `lib/sala/invitacion.ts:36-45` es el patrón | T7, §3.1 |
| D11 | **Ya existe un trigger sobre `auth.users`** | `handle_new_user` (`schema.sql:122-129`) | Precedente para cuidar transacciones de Auth (§2.2.3). Igual se prefiere no agregar otro (ver ahí) |

### 1.3 Quién decide

- **Dueño:** sólo cambios relevantes de producto, gasto o privacidad.
  - Gasto: ya decidido, ninguno.
  - Quedan las preguntas de §1.4.
- **Codex:** audita las propuestas técnicas.
- **Técnicas:** cada una con una solución concreta.

Resuelto o retirado:
- tablas nuevas frente a adaptar `user_reviews`: elección técnica (§2.1.4);
- espera de 24 h para cuentas nuevas: retirada;
- nombres del selector del Top: ya decididos;
- proveedor y presupuesto: superados.

### 1.4 Preguntas al dueño

| # | Pregunta | Por qué es del dueño | Cuándo |
|---|---|---|---|
| P3 | Plazos de retención (§5) | Privacidad, con validación competente | Antes de E9 y de los textos legales |
| P4 | Si E0 muestra cuentas autoconfirmadas: ¿pedirles prueba de buzón para publicar? | Producto y privacidad; usa el envío de correos de Auth existente, con su cupo (§4) | Sólo si E0 lo exige (§2.4) |
| P5 | Autorizar las consultas de sólo lectura de E0 | Acceso a Producción | Antes de E0 |
| P6 | Período supervisado al activar la publicación automática (§3.5): ¿el dueño acepta revisar a posteriori lo publicado cada día durante las primeras semanas? | Carga operativa del dueño | Antes de E10 |

---

## 2. Soluciones técnicas propuestas (pendientes de auditoría)

### 2.1 Permisos y escrituras

**2.1.1 — Sin permisos de tabla para los roles de la API.**
- `revoke all` explícito sobre cada tabla nueva para `anon` y
  `authenticated`.
  - Supabase otorga permisos por defecto en `public`; lo efectivo se
    verifica en E0.
- RLS activada sin policies para esos roles (doble cierre).

**2.1.2 — Funciones `security definer` acotadas, por rol.**
- Cada función: `set search_path = ''`, nombres calificados,
  `revoke execute … from public` y `grant` explícito.

| Función | Ejecutable por | Motivo |
|---|---|---|
| **Escrituras comunitarias** (crear/editar/borrar reseña, votar, denunciar, bloquear, cambiar nombre comunitario) | **Sólo `service_role`**, desde la ruta del servidor | Las reglas de moderación (§3) corren en la ruta. Si la función fuera ejecutable por `authenticated`, un cliente podría llamarla por RPC directo sin pasar por las reglas. **Cambio respecto de v2**, que la concedía a `authenticated` |
| **Lecturas comunitarias** | `authenticated` (nunca `anon`) | No hay decisión que saltear: la función filtra visibilidad, bloqueos y suspensiones |
| **Acciones de moderación** | `authenticated` con `is_admin_mfa()` comprobado adentro | Mismo modelo que el Top |

- La ruta verifica el Bearer (`usuarioDeToken`) y pasa `uid` a la función.
- La función vuelve a comprobar, en la misma transacción:
  1. que la cuenta exista y no esté suspendida;
  2. el interruptor de publicación;
  3. la aceptación de términos;
  4. el correo (§2.4);
  5. los límites por cuenta, con la fila de contador bloqueada
     (`select … for update`);
  6. la transición de estado;
  7. la versión esperada.
- Límites iniciales, **hipótesis** ajustables por configuración y sin
  espera para cuentas nuevas:

  | Acción | Límite por día |
  |---|---|
  | Reseñas nuevas | 5 |
  | Ediciones | 10 |
  | Evaluaciones | 100 |
  | Denuncias | 10 |
  | Cambios de nombre comunitario | 3 |

- **Riesgo que se acepta y se acota:** `service_role` vive sólo en el
  servidor (ya se usa así en `lib/sala/preparar.ts` y
  `lib/eliminar-cuenta.ts`). Las invariantes de §2.1.3 valen aunque la ruta
  tenga un error.

**2.1.3 — Invariantes en la base (corrige el punto 3 de la auditoría).**
- **Autoevaluación.** Un `CHECK` no puede consultar otra tabla. Propuesta:
  - **autor redundante con clave foránea compuesta**: `versiones` tiene
    `unique (id, autor_participante)`, y `evaluaciones` guarda
    `(version_id, autor_participante)` con FK compuesta hacia ese par;
  - así el autor de la evaluación es por construcción el de la versión;
  - con eso, `check (evaluador_participante <> autor_participante)` es un
    `CHECK` de la misma fila;
  - el cliente no puede alterar nada porque no tiene permisos de tabla, y la
    función toma el autor de la versión;
  - igual para denuncias (no denunciarse a sí mismo) y para los tramos de
    puntos (§2.2).
- **Texto:** `check (char_length(texto) between 80 and 600 and texto is NFC
  normalized)`.
  - `IS NFC NORMALIZED` existe desde PostgreSQL 13; Producción tiene 17.6
    según el panel del 18-19/09.
  - Si en E2 su volatilidad impidiera usarlo en un `CHECK`, va a un trigger
    `BEFORE INSERT OR UPDATE`. [Verificar en E2.]
- **Transiciones de estado:** trigger `BEFORE UPDATE` con la tabla de pasos
  permitidos.
  - "Publicada sólo si es la versión vigente" compara con otra tabla, así
    que es trigger, no `CHECK`.
  - Una versión reemplazada nunca vuelve a `publicada`.
- **Unicidad:**
  - una reseña viva por autor y título (índice único parcial);
  - un voto vigente por evaluador y versión;
  - una denuncia por denunciante y versión.
- **Nombre comunitario:** columna aparte de `profiles.display_name`, escrita
  sólo por la función de cambio de nombre (§3.4), con `CHECK` de forma (largo
  2–24, sin controles).

**2.1.4 — Tablas nuevas frente a `user_reviews` (elección técnica).**
- **Modelo:** reseña → versiones (1:N), con votos y decisiones atados a la
  versión.
- **Rollback:** sin tocar objetos existentes.
- **Permisos:** no mezclar el cierre de policies viejas con la
  reestructuración.
- **Filas preexistentes:** se escribieron sin términos ni moderación.
- `user_reviews` se conserva con sus filas. Sus policies anónima y del autor
  se cierran **después del inventario de E0**. Si hubiera filas, se informa
  al dueño sin publicarlas ni migrarlas.
- Adaptarla no es imposible; se descarta por rollback y permisos más
  simples.

**2.1.5 — Prueba obligatoria (E2).**
- Matriz rol × objeto × operación en Postgres real con PostgREST:
  - roles: `anon`, autor, ajeno, suspendido, admin sin MFA, admin con MFA,
    `service_role`;
  - operaciones: SELECT, INSERT, UPDATE y DELETE por REST y EXECUTE de cada
    función.
- Resultados esperados escritos antes.
- Carreras de límite.
- Los tests textuales no cuentan.

### 2.2 Top Yumpers: cierre al corte argentino

**2.2.1 — Identidad comunitaria separada de la cuenta.**
- Tabla `participantes`: `id` (aleatorio) y
  `user_id unique references auth.users on delete set null`.
- Votos, tramos de puntos, suspensiones y resultados consolidados referencian
  `participante_id`, **nunca** `user_id`.

**2.2.2 — Tramos con validez temporal.**
- Cada tramo de positivo elegible guarda:
  - evaluador y autor (participantes);
  - versión, sin FK y con el par autor/versión verificado al insertar;
  - **mes de la primera evaluación positiva** de ese evaluador a esa
    versión;
  - `vigente_desde` y `vigente_hasta`.
- Retirar, pasar a negativo, editar, ocultar, suspender, borrar la reseña o
  dar de baja la cuenta **cierran** tramos; no los borran.
- Las suspensiones también son intervalos.
- Cómputo del mes `M` al corte
  `T(M)` = 00:00 del día 1 siguiente en `America/Argentina/Buenos_Aires`,
  con intervalos semiabiertos. Cuentan los pares (evaluador, autor)
  distintos con un tramo que cumpla:
  - mes de primera evaluación positiva = `M`;
  - `vigente_desde < T(M) ≤ vigente_hasta`, o `vigente_hasta` nulo;
  - ninguno de los dos suspendido en `T(M)`.

**2.2.3 — Baja de cuenta sin perder la reconstrucción (corrige el punto 1
de la auditoría).** v2 permitía borrar aunque fallara la preparación y
marcar el mes "no reconstruible". Se retira. Propuesta:

1. **La reconstrucción no depende de una preparación previa.**
   - La FK `participantes.user_id … on delete set null` se ejecuta **dentro
     de la misma transacción** en que Auth borra la fila de `auth.users`.
   - O se borra la cuenta y el participante queda sin `user_id`, o no pasa
     nada: no existe el estado intermedio "borrado sin preparar".
   - Votos, tramos y resultados ya referenciaban el participante, así que
     nada de eso se pierde ni conserva el `user_id`.
2. **Cierre de los tramos vigentes (el mes en curso se recalcula, como pide
   el diseño).**
   - Lo hace un trigger `AFTER UPDATE OF user_id` sobre `participantes`,
     cuando `user_id` pasa a nulo. Las acciones referenciales disparan los
     triggers de la tabla que referencia.
   - Corre en la misma transacción que el borrado. Si falla, el borrado
     entero se revierte y la ruta responde error: **nunca una baja con
     datos inconsistentes**.
   - El usuario puede reintentar. Se registra el fallo sin datos
     personales.
   - **Riesgo:** un error en ese trigger impediría la baja hasta
     corregirlo. Mitigación: el trigger hace sólo un `UPDATE … SET
     vigente_hasta` sin lógica condicional, y E2 lo prueba con bajas
     concurrentes.
   - No se agrega otro trigger sobre `auth.users`, aunque `handle_new_user`
     es precedente: se evita acoplar más lógica a la tabla de Auth.
3. **Reseñas, versiones, votos propios, denuncias hechas y bloqueos:**
   cascada desde `auth.users` (o desde `participantes`, según la tabla).
   - Un trigger `BEFORE DELETE` sobre `versiones` cierra primero los tramos
     de esa versión. Como la FK de los tramos hacia la versión no es
     cascada, el tramo sobrevive con su versión desvinculada.
4. **Seudónimo, no anónimo.**
   - El participante huérfano sigue siendo un identificador estable que
     vincula registros entre sí. Es **dato seudónimo**: sigue sujeto a
     retención y derechos.
   - No hay nombre, avatar, correo ni `user_id`.
   - Los backups de Supabase pueden conservar el vínculo hasta rotar (D8).
5. **Limpieza.** Se borra el participante huérfano cuando no quedan tramos,
   suspensiones ni resultados no consolidados que lo referencien (§2.5).
   - Los resultados consolidados lo muestran como "Cuenta eliminada".
   - Si se quiere que ni el resultado consolidado conserve el id: al
     consolidar se guarda el **puntaje y la posición sin
     `participante_id`** para participantes huérfanos.
   - Propuesta: guardar sin id. El ranking histórico no necesita
     identificarlos.

**2.2.4 — Corte consistente para TODAS las operaciones (corrige el punto 2
de la auditoría; reemplaza el margen de 15 min de v2).**

Toda operación que abre o cierra tramos o suspensiones ejecuta, como
**primera instrucción**:

1. `pg_advisory_xact_lock_shared(K_CORTE)`;
2. después toma su marca de tiempo con `clock_timestamp()`, no con `now()`.

Las operaciones incluidas son:
- votar, cambiar o retirar un voto;
- editar o borrar una reseña;
- moderar: ocultar, restaurar o rechazar;
- suspender o levantar una suspensión;
- la baja de cuenta, vía el trigger de §2.2.3.

La consolidación de un mes toma `pg_advisory_xact_lock(K_CORTE)` (exclusivo)
y calcula al instante `T(M)`.

**Por qué alcanza, sin depender de un margen.** La consolidación adquiere el
exclusivo en un instante `L ≥ T(M)`. Toda operación cae en uno de dos casos:
- **(a)** tomó el compartido antes de `L`. Entonces la consolidación espera
  a que confirme y la ve. Su marca es la que tomó **después** del bloqueo:
  si es `< T(M)` cuenta para `M`, si es `≥ T(M)` el cómputo al corte la
  excluye.
- **(b)** tomó el compartido después de que la consolidación liberó. Su
  marca es `> L ≥ T(M)` y queda fuera de `M`.

No hay operación con marca `< T(M)` que la consolidación no vea.

**Precondiciones que el plan tiene que cumplir** (si no, el argumento no
vale):
- ninguna otra vía escribe tramos (garantizado por §2.1.1);
- el bloqueo compartido se toma antes de leer o escribir tramos o
  suspensiones y antes de cualquier marca de tiempo, en cada transacción. En
  la baja de cuenta lo toma el trigger, después del borrado en Auth pero
  antes de cerrar tramos;
- la marca se toma después del bloqueo.

**Costo.**
- Los compartidos no se bloquean entre sí.
- El exclusivo dura lo que tarda el cómputo de un mes (agregado sobre los
  tramos del mes) y ocurre una vez por mes.
- Las escrituras usan `lock_timeout` corto. Si vence, la operación falla y
  se reintenta: nunca se aprueba nada por eso.

**Pruebas de E8 con dos o más sesiones reales:**
- operación que toma el compartido antes de `T(M)` y confirma después,
  mientras la consolidación espera;
- operación que llega durante la consolidación;
- baja de cuenta, edición, moderación y suspensión entre el corte y la
  primera consulta;
- purga corriendo antes de consolidar;
- cierre repetido.

En todos los casos el resultado tiene que ser igual al cómputo exacto en
`T(M)`.

**2.2.5 — Consolidación.**
- Función idempotente: `insert … on conflict do nothing` bajo el exclusivo.
- La disparan el primer pedido del ranking después del corte y un job
  `pg_cron` mensual (§2.5); los dos dan el mismo resultado.
- Guarda puntos y posición densa. Sin evaluadores, y sin id para los
  huérfanos.

### 2.3 Paginación (corrige el punto 4 de la auditoría)

**"Recientes":** cursor por clave (primera publicación desc, id desc). Sin
tope y sin snapshot.

**"Más útiles": orden congelado compartido, acotado.**

- **Identificadores compactos.** `bigint` para las reseñas: 8 bytes por
  posición, guardados en un `bigint[]` por snapshot.
  - Tamaño: 1.000 reseñas ≈ 8 KB por snapshot; 10.000 ≈ 80 KB. Estimado,
    no medido: se mide en E6.
- **Un snapshot a la vez por título.**
  - Al pedir la primera página se busca un snapshot del título de menos de
    10 minutos.
  - Si no hay, se toma `pg_advisory_xact_lock(hash(título))`, se vuelve a
    buscar (otro lector pudo haberlo creado mientras se esperaba) y recién
    entonces se crea.
  - Así lectores simultáneos no generan snapshots simultáneos.
- **Cota de almacenamiento.**
  - Vida 2 h; a lo sumo uno nuevo cada 10 min por título, o sea 12 vivos por
    título.
  - Cota global = títulos leídos en 2 h × 12 × tamaño.
  - La purga de vencidos corre en el job diario y, además, al crear uno
    nuevo se borran los vencidos de ese título.
  - Sin datos del lector.
- **Revalidación acotada.**
  - Cada página recorre **como máximo 50 posiciones** del snapshot desde el
    cursor y devuelve hasta 5 reseñas visibles para ese lector: no
    retiradas, vigentes, autor no bloqueado ni suspendido.
  - Si en 50 posiciones encuentra menos de 5, devuelve las que encontró y el
    cursor avanzado.
  - Cada pedido hace una cantidad acotada de trabajo, sin importar cuántas
    reseñas estén ocultas.
  - Nunca devuelve texto de algo retirado: el snapshot guarda ids, y el
    texto se lee recién al revalidar.
- **Vencimiento sin ciclos.**
  - Si el snapshot vence mientras se lee, se responde "orden actualizado" y
    la vista ofrece volver a empezar una vez.
  - El nuevo vive 2 h más.
  - Los ids ya mostrados se deduplican en el cliente.
- **Contador.**
  - Se calcula al abrir la lista, sobre lo visible para ese lector en ese
    momento.
  - Puede cambiar **cualquier cantidad** mientras se lee (moderación,
    bloqueos, ediciones). No hay cota y no se promete. Se retira el "uno o
    dos" de v2.

### 2.4 Confirmación de correo

Sin cambios respecto de v2:
- recuperación (#22), confirmación del alta y autoconfirmación son tres
  cosas distintas;
- #22 no es dependencia;
- leer reseñas exige sesión, no correo;
- publicar, evaluar y denunciar exige `email_confirmed_at`, que sólo prueba
  posesión del buzón si Confirm email estaba encendido al alta;
- E0 lo verifica en sólo lectura; P4 sólo si hace falta.

**Agregado en v3:** si P4 lleva a pedir un código por correo, se usa el envío
de Auth existente, que tiene cupo propio [no verificado: E0]. No se contrata
SMTP.

### 2.5 Planificador

Patrón `sala-barrido` (`pg_cron`, SQL puro, `unschedule` previo
idempotente). Dos jobs nuevos:
- **consolidación mensual:** día 1, 03:15 UTC;
- **purga diaria:** textos según §5, tramos consolidados, participantes
  huérfanos sin referencias, snapshots vencidos y hashes vencidos.

Ninguno toca `sala-barrido` ni `tmdb-sync`, y el cron de Netflix no se
reactiva. Programarlos es un cambio en Producción y se autoriza aparte. E0
inspecciona `cron.job` en sólo lectura.

### 2.6 Detalles técnicos menores (sin cambios)

- **T1:** endpoint aparte; `/api/title` intacto (AAB 1.2.0).
- **T4:** interruptores en una fila de configuración.
- **T7:** NFC, controles y bidi, puntos de código; la misma regla en la
  base.
- **T8:** POST.
- **T9:** Top Yumpers fuera de `sessionStorage`.
- **T10:** Wilson (z = 1,96).
- **T2 cambia:** ya no hay proveedor. La decisión sale de las reglas en la
  ruta (§3.2).

---

## 3. Moderación sin clasificador externo

**Qué es y qué no es.**
- Reglas determinísticas propias, límites por cuenta, denuncias, bloqueos y
  el dashboard.
- **No entiende el significado** ni equivale a un clasificador. Detecta
  patrones conocidos y deja pasar el abuso que no se parece a ninguno.
- Lo que no detecta lo cubren las denuncias y la revisión del dueño (§3.5).
- La política de Play exige moderación **eficaz y continua** con controles
  para usuarios. Hay que evaluarla por cómo funciona y opera, no darla por
  cumplida por tener reglas.
  https://support.google.com/googleplay/android-developer/answer/9876937?hl=es

### 3.1 Normalización para detectar

Se usa una copia "plegada" del texto, sólo para buscar patrones; lo que se
guarda y se muestra es el texto NFC original. El plegado:
- NFKC (desarma letras de ancho completo y variantes);
- minúsculas y sin acentos;
- sin caracteres invisibles (ZWJ, ZWNJ, bidi);
- confusables comunes a ASCII (`0→o`, `1→i/l`, `3→e`, `4→a`, `5→s`, `@→a`
  fuera de direcciones, cirílicas parecidas);
- separadores colapsados: `b i t . l y`, `bit(.)ly`, `bit[punto]ly`;
- palabras a dígitos para teléfonos ("once", "quince", "cero", "uno"…
  "nueve").

### 3.2 Dónde corren las reglas

- En la **ruta del servidor**, en un módulo TypeScript puro y versionado
  (`version_reglas`).
- El cliente usa el mismo módulo para avisar antes de enviar, pero su
  resultado **no decide nada**.
- La función de escritura sólo la puede ejecutar `service_role` (§2.1.2), así
  que un RPC directo desde el cliente no existe.
- La función guarda decisión, `version_reglas` y motivo, y las invariantes
  de la base valen igual.

### 3.3 Qué se publica, qué se retiene y qué se rechaza

Se evalúa en este orden. **Gana el resultado más restrictivo.**

| Resultado | Cuándo | Qué ve el autor |
|---|---|---|
| **Rechazo** (no se guarda como versión publicable) | Enlace o dominio, aunque esté ofuscado (`netflix.com` también: el diseño no permite enlaces) · correo, aunque esté ofuscado ("arroba gmail punto com") · teléfono: ≥ 8 dígitos seguidos después del plegado, o ≥ 6 con una palabra de contacto cerca · usuario de red o mensajería con intención de contacto ("wa", "wsp", "telegram", "ig", "@usuario" + "escribime/hablame/mandame/agregame/dm") · cuenta suspendida · límite agotado · largo fuera de 80–600 · nombre comunitario con las mismas reglas de contacto | Motivo concreto y qué corregir ("Sacá el número de teléfono"). Puede corregir y reenviar, y eso cuenta para el límite de ediciones |
| **Retención** (guardada, invisible para otros, en la cola del dashboard) | Señales de spam o promoción: cripto, inversión, ganancias, "gratis"/"sorteo" + verbo de acción, montos de dinero · duplicado o casi duplicado (§3.3.1) · términos de una lista corta de odio y amenaza explícita, o combinaciones sexuales con menores · patrones de datos personales (DNI/CUIT, "vive en"/"su dirección es" + número) · texto anómalo: más de 50 % mayúsculas, menos de 8 palabras distintas, repeticiones largas · cuenta con 3 o más retenidos o rechazados en 7 días (todo lo nuevo de esa cuenta se retiene hasta revisión) · denuncia de categoría grave (§3.3.2) | "En revisión" y el motivo general, sin revelar la regla exacta. Puede editar (vuelve a evaluarse) o borrar |
| **Publicación automática** | Pasó todas las reglas, la cuenta cumple §2.1.2 y el interruptor está encendido | Publicada |

**Fallos.**
- Si la normalización, una regla o la escritura lanzan, la transacción se
  revierte: **no queda nada guardado ni publicado** y la ruta responde
  "No se pudo guardar, probá de nuevo".
- No existe un "pendiente por fallo técnico", porque las reglas corren en
  el mismo proceso, sin dependencias externas.
- Una regla fallida nunca aprueba: el módulo no tiene camino por defecto
  que devuelva "publicar" ante un error, y hay una prueba que lo fija.
- **Cola excedida:** si los retenidos sin revisar superan un umbral
  configurable (propuesto: 50), el interruptor de publicación pasa solo a
  "sólo retener", así todo lo nuevo se retiene. Se avisa en el dashboard.
  Esto implementa el "si la cola excede capacidad, pausar" del diseño.

**3.3.1 — Duplicados.**
- Se guarda un hash del texto plegado y un juego de shingles (3 palabras)
  por versión, 90 días (§5).
- Se retiene si:
  - el hash coincide con otra versión de la misma cuenta;
  - o la similitud Jaccard es ≥ 0,8 con otra versión de la misma cuenta;
  - o el hash coincide con 3 o más cuentas distintas en 7 días (spam
    coordinado).
- Costo acotado: se compara contra las últimas 50 versiones de la cuenta y
  un índice por hash.

**3.3.2 — Denuncias.**
- Categorías del diseño.
- Una denuncia de categoría **grave** (phishing/estafa, explotación sexual,
  datos personales, amenazas), hecha por una cuenta con correo confirmado
  que no tenga 3 o más denuncias descartadas en 30 días, **retiene
  preventivamente** hasta revisión. Es lo que el diseño admite como alerta
  de riesgo grave.
- Las demás entran a la cola sin ocultar.
- Nunca se retira por cantidad.
- Las denuncias descartadas de una cuenta bajan su peso: dejan de retener
  preventivamente.

**3.3.3 — Bloqueos.** Personales, como en el diseño: ocultan sólo para quien
bloquea y no cambian el estado de la reseña.

### 3.4 Ediciones y nombres: mismas reglas, vías revisadas

| Vía | Cómo podría eludir | Control |
|---|---|---|
| Edición de una publicada | Publicar algo limpio y después agregar el contacto | Cada edición es una versión nueva que pasa por **todo** §3.3. Mientras se evalúa, la anterior deja de verse (diseño §3.2). Si la nueva se retiene, no vuelve la anterior |
| Ediciones sucesivas mínimas para encontrar el borde de la regla | Probar variantes | Límite de 10 ediciones por día; 3 rechazos o retenciones en 7 días retienen todo lo de la cuenta |
| Partir el contacto entre reseñas ("11" en una, el resto en otra) | Cada texto pasa solo | **Limitación aceptada.** Mitigación parcial: la regla de teléfono mira también la concatenación de las últimas 3 versiones de la cuenta en 24 h |
| Contacto en el nombre comunitario + "mirá mi nombre" en la reseña | El nombre se evaluaría aparte | El nombre comunitario pasa por las mismas reglas de contacto y odio, más largo 2–24. "Mirá mi perfil/nombre" retiene la reseña |
| Cambiar `profiles.display_name` por update directo | Saltear la ruta | Lo comunitario muestra sólo la columna de nombre comunitario, que escribe la función de §2.1.2. El `display_name` sigue igual para el saludo y Yumpeá (fuera de alcance) |
| RPC directo a la función de escritura | Saltear las reglas | Ejecutable sólo por `service_role` (§2.1.2) |
| Muchas cuentas | Repartir el spam | Límites por cuenta (no por persona: el diseño ya lo aclara), duplicados entre cuentas (§3.3.1), retención de la cola y las denuncias. No se promete frenar a un atacante con muchas cuentas |
| Avatar | — | Catálogo fijo de 31; sin riesgo de contenido |

### 3.5 Limitaciones y carga humana

**No detecta, o detecta mal:**
- acoso e insultos sin términos de la lista;
- odio en código o con ironía;
- amenazas indirectas;
- difamación de personas reales;
- spoilers malintencionados;
- contenido sexual descripto sin palabras de la lista;
- estafas redactadas sin enlaces, números ni vocabulario conocido;
- patrones nuevos.

Todo eso depende de denuncias y de la revisión.

**Falsos positivos esperables:**
- números en reseñas legítimas: años ("1985"), duraciones ("2 h 30"),
  temporadas y episodios ("T3E8"), títulos ("9-1-1", "2001: odisea del
  espacio", "Se7en", "M3GAN");
- "@" en un chiste;
- nombres de plataformas;
- vocabulario de inversión en reseñas de *The Big Short* o de una película
  sobre cripto;
- insultos dirigidos a un personaje.

Se mitigan con:
- el umbral de 8 dígitos;
- la exigencia de palabra de contacto cerca para 6–7 dígitos;
- la lista de plataformas permitidas como texto (no como dominio);
- y, para el vocabulario de inversión u odio, **retener** en vez de
  rechazar.

**Carga humana.**
- No es medible sin uso real. Es `retenidos + denuncias` por semana.
- Ejemplo ilustrativo, **no medido**: con 1.000 reseñas por mes y 5 % de
  retención, son unas 50 revisiones por mes más las denuncias.
- La tasa real de retención sobre texto legítimo se estima con la prueba
  local (§3.6). La de abuso real, sólo en uso.
- **Período supervisado (P6):** al activar la publicación automática, el
  dueño revisa a posteriori la lista diaria de lo publicado durante las
  primeras semanas. No es aprobación previa de todo.
- Con eso se calibran listas y umbrales y se decide si la publicación
  automática sigue encendida (interruptor T4).

### 3.6 Pruebas sintéticas locales (sin llamadas externas)

- Textos inventados, sin datos de personas reales, versionados en el repo.
  Corren en `npm test`.
- **Suite de reseñas legítimas (falsos positivos), mínimo 150:**
  - reseñas reales en estilo pero inventadas;
  - todos los casos de números y títulos de §3.5;
  - lunfardo, insultos a personajes, tramas de crimen, drogas y sexo;
  - menciones a plataformas;
  - citas.
- **Suite de abuso, mínimo 150:** por cada regla de §3.3,
  - la forma directa;
  - al menos 5 variantes de ofuscación (separadores, palabras-número,
    confusables, invisibles, "punto com");
  - y casos combinados.
- **Suite de vías (§3.4):** edición posterior, contacto partido entre
  reseñas, nombre con contacto, duplicados entre cuentas y RPC directo (con
  la base del banco de E2).
- **Fallos:** excepción inyectada en cada regla → nada publicado.
- **Separación:** un conjunto de desarrollo para ajustar listas y umbrales y
  uno **reservado** que se corre al final y no se usa para ajustar.
- **Informe:** resultado por caso.
- **Criterios propuestos (sobre el reservado):**
  - 0 enlaces o contactos claros publicados;
  - ≥ 95 % de las variantes de ofuscación conocidas rechazadas o retenidas;
  - ≤ 2 % de reseñas legítimas rechazadas;
  - ≤ 5 % retenidas.
- **Qué NO prueba:** eficacia contra abuso real ni contra variantes que la
  suite no contiene. Mide reglas contra casos conocidos.

---

## 4. Cuotas de la infraestructura existente

**No se promete costo operativo cero.** Reseñas consume base, ancho de banda,
invocaciones y CPU de planes ya contratados. Tiene que entrar en sus cuotas
sin upgrade ni facturación adicional, y eso se verifica antes de lanzar.

| Recurso | Dato conocido | Qué agrega reseñas | Qué verificar en E0/E10 |
|---|---|---|---|
| Supabase | **Panel (dueño, 18-19/09): plan Free, PostgreSQL 17.6, `pg_cron` 1.6.4** | Filas de reseñas, versiones, votos, tramos, snapshots, hashes, registro. Estimado no medido: unos pocos KB por reseña con su historia; 10.000 reseñas en el orden de decenas de MB | Tamaño actual de la base y límite del plan; egress y MAU usados; si el plan Free conserva backups y por cuánto [no verificado]; cupo de correos de Auth (§2.4) |
| Vercel | **Panel (dueño, 19/09):** 19K de 1M invocaciones y 30 min de 4 h de CPU a 30 días | Una invocación por lectura de página de reseñas, escritura, voto o denuncia; las reglas son CPU local, de milisegundos [estimado] | Uso actual a 30 días; plan efectivo; retención de logs |
| Upstash | Opcional, con cuota propia (CLAUDE.md, `TTL.home`) | Nada: reseñas no usa Redis (límites en la base, T3) | — |
| Proveedores externos | — | **Ninguno** | — |

**Criterio de lanzamiento propuesto:** en el uso previsto, cada cuota con
holgura documentada a partir de una medición del ensayo (E10). Si una cuota
no alcanzara, se resuelve reduciendo uso (TTL de snapshots, retención de
hashes), no con un upgrade.

---

## 5. Retención interna

Sin proveedor externo, no hay copias de terceros (v2 §5.1 queda superado).
**Ningún plazo está validado legalmente**: son propuestas para P3.

| Dato | Propuesta | Validación |
|---|---|---|
| Texto de la versión vigente | Mientras exista la reseña | No |
| Versiones reemplazadas | Se borran al confirmarse la nueva, salvo denuncia abierta | Sí |
| Texto rechazado | **No se guarda**: el rechazo ocurre antes de escribir. El registro guarda regla y fecha, sin texto | — |
| Texto retenido y no publicado | Hasta resolverse + 30 días si se rechaza en revisión | **Sí** |
| Texto borrado por el autor | Invisible al instante; purga en ≤ 30 días, salvo denuncia abierta | **Sí** |
| Hash y shingles (§3.3.1) | 90 días | **Sí**: dato seudónimo derivado del texto |
| Votos | Mientras exista la versión | Sí |
| Tramos y participantes huérfanos (§2.2) | Hasta consolidar el mes que los necesita | **Sí**: seudónimos, no anónimos |
| Denuncias | Hasta cerrar el caso + 30 días | **Sí** |
| Registro de decisiones | Sin texto; 12 meses; con la baja, sin vínculo a cuenta | **Sí** |
| Sanción activa | Mientras rige; 6 meses después, sólo un contador; con la baja, se borra | **Sí** |
| Resultados consolidados | Puntos y posición; huérfanos sin id | Sí |
| Snapshots de orden | Ids de reseñas, 2 h, sin datos del lector | No |
| Logs | Nunca texto, nombre ni token | Retención del plan de Vercel (E0) |
| Backups | La purga no los alcanza hasta rotar | **Verificar el plan Free (E0)** antes de escribir plazos |

**A validar por alguien competente** (no es asesoramiento legal):
- cada plazo marcado;
- los cambios a `/privacidad`: contenido visible para registrados, perfil y
  ranking, moderación automatizada por reglas con revisión humana, plazos y
  backups;
- términos comunitarios versionados;
- rechazo automatizado con explicación y revisión a pedido;
- IARC y Data Safety con contenido generado por usuarios.

Sin proveedor externo **ya no hay transferencia internacional del texto a un
clasificador**. Supabase y Vercel ya figuran como encargados en
`/privacidad`.

---

## 6. Entregas (sin proveedor ni pruebas pagas)

Cada entrega es una rama con su informe; **ninguna arrastra autorizaciones**.
Todavía no es el plan.

| # | Entrega | Contenido | Criterios de auditoría (Codex) |
|---|---|---|---|
| E0 | Verificación de partida (sólo lectura, P5) | `user_reviews` (filas, dependencias, grants efectivos); privilegios por defecto; `cron.job`; Auth (Confirm email, autoconfirmadas contadas sin listar); cuotas y uso actual de Supabase y Vercel; backups del plan Free; cupo de correos de Auth | Tipo de evidencia por dato; nada que escriba; sin datos personales |
| E1 | **Reglas y pruebas locales** (sin app, sin llamadas externas) | Módulo de normalización y reglas (§3.1–§3.3) con suites de §3.6 | Resultados por caso sobre el reservado; criterios de §3.6; prueba de "fallo nunca aprueba"; ninguna llamada de red |
| E2 | Esquema y permisos | Migración aditiva 011 + rollback no destructivo (§2.1, §2.2.1–§2.2.3); cierre de `user_reviews` según E0 | Matriz §2.1.5; FK compuesta y `CHECK` de autoevaluación; baja de cuenta atómica y concurrente; triggers de cierre de tramos |
| E3 | Escritura con reglas | Ruta POST + funciones `service_role`; rechazo, retención y publicación (§3.3); ediciones y nombres (§3.4) | Cada vía de §3.4 probada; edición de una publicada → invisible y votos cortados en una transacción; ningún camino publica sin reglas |
| E4 | Moderación en el dashboard | `/admin/moderacion`: cola de retenidos, denuncias, decisiones, suspensión, restauración, umbral de cola (§3.3) | `adminDeToken` + `is_admin_mfa()` en API y base; decisiones atadas a versión |
| E5 | Lectura y utilidad | T1, acordeón, paginación (§2.3), votos, bloqueos | Anónimo sin datos comunitarios por ninguna vía; `/api/title` idéntico; más de 200 reseñas sin repetir ni saltear; un solo snapshot con lectores concurrentes; revalidación acotada |
| E6 | Perfiles y nombre comunitario | Proyección y ruta nativa | Sólo campos de la proyección; update directo de `display_name` sin efecto comunitario |
| E7 | Top Yumpers | §2.2.4–§2.2.5 y selector ya decidido | Pruebas de §2.2.4 con sesiones concurrentes; Top de plataformas intacto |
| E8 | Retención y purga (después de P3) | Jobs §2.5 con autorización | Purga nunca toca tramos sin consolidar; reloj controlado |
| E9 | Integración y lanzamiento | Textos legales del dueño, interruptores, cuotas medidas (§4), período supervisado (P6), Android en el mismo AAB que los arreglos de Yumpeá ya aprobados | Prueba en teléfono; rollback por interruptor; nada de migración, deploy, versión ni AAB sin autorización de esa entrega |

**Orden:**
- E0 primero.
- E1 en paralelo con E2.
- E3 después de E1 y E2.
- E8 después de P3.
- E9 después de los textos legales.

Se eliminan como requisitos de esta versión: la elección de proveedor, el
banco pago y el presupuesto de API.

---

## 7. Cambios que esta revisión PROPONE al diseño de Codex (no aprobados)

| Diseño | Dice | Propuesta |
|---|---|---|
| Encabezado (actualización del dueño) | Moderación por reglas propuesta para revisión | §3 la concreta: tabla de rechazo, retención y publicación; fallos sin aprobación; cola con pausa automática |
| §3.3 | Cursor ligado a versión de conjunto, recarga desde el principio | §2.3 |
| §3.4 | Cierre mensual idempotente y reproducible | §2.2: participantes separados de la cuenta, tramos, bloqueo compartido/exclusivo, consolidación sin ids de huérfanos |
| §3.5 | Correo confirmado | §2.4 |
| §3.5 | "Alertas de riesgo grave pueden retener preventivamente" | §3.3.2: concreta quién y cómo (denuncia grave de cuenta confirmada sin historial de descartes) |
| §3.2 / §6 | Autorización efectiva en servidor/base | §2.1: escritura sólo por `service_role` con reglas en la ruta, invariantes viables |
| §5 | Entregas 0–4 | §6 (E0–E9) |

---

## 8. No hecho / no comprobado

- **Producción:** no se consultó. Lo efectivo queda para E0.
- **Cuotas:** las del panel son del 18-19/09; hay que actualizarlas.
- **Ninguna prueba:** las suites de §3.6 están propuestas, no escritas.
- **Validación legal:** ninguna.
- Sin proveedores, gastos ni llamadas externas.

## Fuentes

- PostgreSQL `CREATE FUNCTION`: https://www.postgresql.org/docs/current/sql-createfunction.html
- PostgreSQL bloqueos consultivos: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- PostgreSQL `IS NORMALIZED` / `normalize`: https://www.postgresql.org/docs/current/functions-string.html
- Supabase Auth, configuración: https://supabase.com/docs/guides/auth/general-configuration
- Google Play, contenido generado por usuarios: https://support.google.com/googleplay/android-developer/answer/9876937?hl=es
