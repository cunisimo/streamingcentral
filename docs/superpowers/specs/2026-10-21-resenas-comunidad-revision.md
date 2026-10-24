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

**Correcciones v3.1 (21/10/2026).** Erratas puntuales tras la auditoría de
Codex sobre `97cf4d7`
([`docs/medidas/2026-10-21-auditoria-resenas-97cf4d7.md`](../../medidas/2026-10-21-auditoria-resenas-97cf4d7.md),
copiada sin cambios, SHA-256 `099CAB0E…68BBA595`). No reescribe el
documento; cambia sólo las secciones de esta tabla. Siguen siendo
**propuestas**.

| Hallazgo | Corrección |
|---|---|
| 1. Autorización por acción | §2.1.2: matriz por operación; protección y borrado no dependen de pausa, suspensión, términos ni filtro |
| 2. Denuncias y saturación | §3.3, §3.3.2: ninguna denuncia oculta por su categoría; colas separadas; admisión acotada en vez de "sólo retener" |
| 3. Revisión de rechazos | §3.3.3 nuevo: el autor puede enviar el texto rechazado a revisión; §5 |
| 4. Ediciones fallidas o rechazadas | §3.4.1 nuevo: qué se conserva y cuándo se reinician votos |
| 5. Concurrencia y cierre | §2.2.2 (mismo lado del corte), §2.2.3 (baja en dos pasos), §2.2.4 (orden de locks, aislamiento, casos) |
| 6. Carga del dueño | §3.5 y P6: muestreo acotado, sin aprobación atribuida |
| Precisiones | §2.3 (almacenamiento físico), §3.1 (plegado), §3.3.1 (hashes de shingles), §3.4 (avatar), §5 (Vercel/Supabase), §3 (umbrales = hipótesis) |

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
| P6 | Carga de revisión (§3.5): ¿el dueño acepta, como propuesta inicial, atender las colas de retenidos y denuncias más un muestreo de hasta 5 publicaciones automáticas al azar por sesión de revisión? Si no, ¿qué capacidad tiene? La respuesta fija los topes de admisión (§3.3). **No está aceptado**; la v3 lo había planteado como lectura diaria de todo, y eso se retira | Carga operativa del dueño | Antes de E9 |

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
| **Escrituras comunitarias** (todas las de la matriz de abajo) | **Sólo `service_role`**, desde la ruta del servidor | Las reglas de moderación (§3) corren en la ruta. Si la función fuera ejecutable por `authenticated`, un cliente podría llamarla por RPC directo sin pasar por las reglas. **Cambio respecto de v2**, que la concedía a `authenticated` |
| **Lecturas comunitarias** | `authenticated` (nunca `anon`) | No hay decisión que saltear: la función filtra visibilidad, bloqueos y suspensiones |
| **Acciones de moderación** | `authenticated` con `is_admin_mfa()` comprobado adentro | Mismo modelo que el Top |

- La ruta verifica el Bearer (`usuarioDeToken`) y pasa `uid` a la función.
- **Matriz de autorización por operación (corrige el hallazgo 1 de
  `97cf4d7`).** v3 aplicaba a todas las escrituras las mismas comprobaciones
  (suspensión, interruptor, términos, correo). Eso impedía borrar, bloquear o
  denunciar durante una pausa o suspensión, contra el diseño ("Suspensión no
  impide denunciar, bloquear, gestionar ni eliminar la cuenta"). Cada función
  comprueba sólo lo pertinente, en la misma transacción y después de los
  locks de §2.2.4:

  | Operación | Sesión y propiedad | Suspensión | Publicación pausada / módulo apagado | Términos vigentes | Correo (§2.4) | Reglas de texto (§3) | Límite propio |
  |---|---|---|---|---|---|---|---|
  | **A. Publicar reseña, editarla, evaluar, cambiar nombre comunitario** | Sí; edita sólo el autor | Impide | Impide | Exige | Exige | Sí (no evaluar) | Sí, por acción |
  | **B. Retirar el propio voto, borrar la propia reseña** | Sí; sólo el evaluador o el autor | **No impide** | **No impide** | No exige | No exige | No | No; idempotente |
  | **C. Denunciar** | Sí; no la propia | **No impide** | Impide sólo si el módulo está apagado (no hay nada visible) | No exige | Exige (decisión del diseño) | No; sin texto público | Sí, independiente |
  | **D. Bloquear, desbloquear** | Sí; no a sí mismo | **No impide** | No impide | No exige | No exige | No | Tope amplio contra abuso de almacenamiento |
  | **E. Gestionar o eliminar la cuenta** | Sí (flujo existente) | **No impide** | **No impide** | No exige | No exige | No | El existente |
  | Leer | Sesión | No impide | Módulo apagado: nada | No exige | No exige | — | — |

  - Ninguna operación de B a E exige tener nombre comunitario aprobado.
  - Con el correo pendiente se puede bloquear y borrar. Denunciar exige
    correo porque así lo fija el diseño ("Correo confirmado para
    publicar/evaluar/denunciar"); no se reabre.
  - Si la denuncia lleva comentario, es sólo para el dashboard, con largo
    acotado, y nunca se publica.
  - **Pruebas en E2/E3:** cada fila × {suspendido, correo pendiente, términos
    nuevos sin aceptar, publicación pausada, módulo apagado, colas llenas}
    con el resultado esperado escrito antes. Se incluye siempre el caso
    "ajeno intenta B/D sobre lo que no es suyo".
- Límites iniciales, **hipótesis** ajustables por configuración y sin
  espera para cuentas nuevas:

  | Acción | Límite por día |
  |---|---|
  | Reseñas nuevas | 5 |
  | Ediciones | 10 |
  | Evaluaciones | 100 |
  | Denuncias | 10 |
  | Cambios de nombre comunitario | 3 |
  | Bloqueos | 50 |

  Los contadores se bloquean con `select … for update`, al final del orden
  de locks de §2.2.4.

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
  con intervalos semiabiertos `[desde, hasta)`.
- **Un solo lado del corte para todo (corrige v3).** El mes se evalúa en el
  estado **inmediatamente anterior a `T(M)`**. Un intervalo `[desde, hasta)`
  rige en ese instante si y sólo si `desde < T(M)` y (`hasta` nulo o
  `T(M) ≤ hasta`). La misma condición vale para tramos **y** suspensiones.
  v3 evaluaba la suspensión "en `T(M)`", así que una sanción iniciada
  exactamente en `T(M)` excluía retroactivamente el mes anterior.
- Cuentan los pares (evaluador, autor) distintos con un tramo que cumpla:
  - primera evaluación positiva en `[T(M-1), T(M))`;
  - el tramo rige antes de `T(M)` según la condición de arriba;
  - ninguna suspensión del evaluador ni del autor rige antes de `T(M)`.
- Consecuencias en la igualdad exacta: un tramo o suspensión que **empieza**
  en `T(M)` es del mes siguiente; uno que **termina** en `T(M)` todavía
  regía. Banco de igualdad exacta en §2.2.4.

**2.2.3 — Baja de cuenta sin perder la reconstrucción (corrige el punto 1
de la auditoría).** v2 permitía borrar aunque fallara la preparación y
marcar el mes "no reconstruible". Se retira. Propuesta:

> **Conciliación (22/10/2026, auditoría de `e34c53e`).** La versión 3
> decía que toda la baja era atómica dentro de la transacción de Auth. Desde
> la v3.1 el camino normal tiene **dos transacciones que no comparten
> atomicidad**: la parte comunitaria y `deleteUser`. Lo único atómico es
> cada paso por separado. Lo que sí sigue valiendo: la **reconstrucción del
> ranking** no depende de que la baja termine, porque tramos y resultados
> referencian al participante y se cierran con su marca. El contrato de abajo
> reemplaza los textos anteriores que hablaban de baja atómica.

1. **Identidad comunitaria separada.** Ninguna tabla comunitaria referencia
   `auth.users` salvo `participantes.user_id … on delete set null`. Reseñas,
   versiones, votos, denuncias, bloqueos y suspensiones referencian al
   participante. Votos, tramos y resultados no pierden nada ni conservan el
   `user_id`.
2. **Contrato de baja con estado persistente (cierra A1 de `e34c53e`).**
   - **Marcador:** tabla `bajas_en_curso(user_id primary key references
     auth.users on delete cascade, iniciada_en, intentos, ultimo_error)`.
     Mientras exista Auth, el marcador existe; cuando Auth borra la fila, el
     marcador cae con ella.
   - **Lock por cuenta:** toda función que resuelve o crea el participante
     de un `uid`, y `baja_comunitaria`, toma `pg_advisory_xact_lock(K_CUENTA,
     hash(uid))` **después de `K_CORTE` y antes de cualquier fila** (§2.2.4).
     Eso serializa la comprobación del marcador con la creación del
     participante.
   - **Paso 1, `baja_comunitaria(uid)`** (una transacción, idempotente):
     inserta el marcador si no existe; cierra tramos con su marca; borra
     reseñas, votos propios, denuncias hechas y bloqueos según §5; pone
     `participantes.user_id = null`. Si no había participante, sólo inserta
     el marcador. Repetirla no cambia nada más.
   - **Efecto del marcador:** con el marcador presente, ninguna función crea
     participante ni acepta publicar, editar, evaluar, denunciar, bloquear o
     cambiar nombre para ese `uid` (se rechaza con "baja en curso"). Incluye
     las escrituras que ya habían verificado el Bearer antes: la comprobación
     ocurre dentro de su transacción, bajo `K_CUENTA`. Una escritura que tomó
     `K_CUENTA` antes que la baja confirma primero, y la baja la procesa
     después.
   - **Paso 2, `deleteUser`.** Siguen funcionando gestionar la cuenta, leer
     lo no comunitario y **reintentar la eliminación**.
   - **Reconciliación** en la ruta (y al reintentar):
     - `deleteUser` ok → "Tu cuenta se eliminó".
     - `deleteUser` con error → se consulta si el usuario existe
       (`getUserById`). Si ya no existe (respuesta perdida o reintento
       concurrente que ganó) → eliminación completa. Si existe → se registra
       `ultimo_error` y se responde **"Borramos tus datos de comunidad, pero
       no pudimos eliminar la cuenta. Probá de nuevo"**. Nunca se dice que la
       cuenta se eliminó si Auth sigue teniéndola.
     - Al volver a iniciar sesión con el marcador presente, la app muestra el
       estado "Eliminación pendiente" con el botón de reintento.
   - **Cancelación:** el usuario no cancela en esta versión. El dueño puede
     quitar el marcador con un procedimiento admin registrado; **no restaura
     nada**: si la persona vuelve a participar, nace un participante nuevo,
     sin reseñas, votos ni historial anteriores.
   - **Limpieza del marcador:** por cascada al borrarse Auth. Un marcador con
     Auth vivo se lista en el dashboard como baja pendiente; no se borra solo.
   - **No hay garantía atómica entre los dos pasos** y no se promete. Lo que
     se garantiza es: paso 1 todo-o-nada, ninguna escritura comunitaria
     posterior, y un mensaje que dice exactamente qué se borró.
3. **Bajas fuera de la ruta (panel de Supabase u otra herramienta de
   Auth).** Red de seguridad: `on delete set null` más un trigger `AFTER
   UPDATE OF user_id` sobre `participantes` que hace lo mismo que el paso 1
   dentro de la transacción de Auth.
   - Ahí el orden de locks está invertido (Auth ya tiene la fila de
     `participantes` cuando el trigger pide `K_CORTE` y `K_CUENTA`). Puede
     haber un deadlock que Postgres resuelve abortando una transacción; si la
     abortada es la de Auth, la baja se revierte entera y no queda nada a
     medias.
   - **Procedimiento técnico seguro** (runbook en el plan, entrega E2b): ante
     un pedido de baja que no pasa por la app, el admin ejecuta primero
     `baja_comunitaria_admin(uid)` (mismo paso 1, ejecutable sólo con
     `service_role`) y recién después borra en Auth; si el borrado de Auth
     falla por deadlock o timeout, se reintenta; verificar con la consulta
     del runbook que no quede participante con ese `user_id`.
   - Se prueba con el borrado real de Auth en la base local aislada, no sólo
     borrando filas con SQL.
   - No se agrega otro trigger sobre `auth.users`, aunque `handle_new_user`
     es precedente: se evita acoplar más lógica a la tabla de Auth.
3. **Reseñas y versiones borradas:** `baja_comunitaria` (o el borrado de la
   reseña) cierra primero los tramos de cada versión y después la borra.
   Los tramos guardan la versión sin FK (§2.2.2), así que sobreviven con la
   versión desvinculada.
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

**Orden fijo en cada transacción que muta (corregido en v3.1).** v3 sólo
ordenaba cada operación frente al cierre. Los compartidos no se excluyen
entre sí, así que dos operaciones sobre la misma reseña o el mismo voto
podían tomar marcas `t1 < t2` y aplicarse en orden inverso, dejando
intervalos desordenados o una decisión sobre una versión obsoleta. Cada
operación de §2.1.2 que muta sigue estos pasos, en este orden:

1. `pg_advisory_xact_lock_shared(K_CORTE)`, sin tener ningún otro lock;
   después `pg_advisory_xact_lock(K_CUENTA, hash(uid))` del que actúa
   (agregado el 22/10 por el contrato de baja, §2.2.3), y relectura del
   marcador de baja;
2. **locks de las entidades afectadas** con `select … for update`, en un
   orden global estable:
   1. participantes, por id ascendente;
   2. reseña;
   3. versiones, por id ascendente;
   4. voto o tramo, por (evaluador, versión);
   5. suspensión;
   6. contadores de límite.

   Cada operación toma sólo los que toca, pero siempre en ese orden;
3. **relectura del estado** ya bloqueado: versión vigente igual a la
   esperada, estado que admite la transición, voto actual, suspensión. Si
   algo cambió: conflicto o no-op, nunca la mutación;
4. **marca** con `clock_timestamp()`, después de todos los locks;
5. mutación y confirmación.

**Por qué ordena una misma entidad.** Si dos operaciones tocan la misma
fila, la segunda obtiene su lock recién cuando la primera confirma. La
primera tomó su marca antes de confirmar y la segunda después de obtener el
lock: `t1 < confirmación₁ ≤ lock₂ < t2`. Las marcas siguen el orden de
aplicación, y la relectura del paso 3 descarta lo que quedó obsoleto.

**Frente al cierre.** La consolidación toma `pg_advisory_xact_lock(K_CORTE)`
(exclusivo) y ningún otro lock. Adquiere el exclusivo en un instante
`L ≥ T(M)`. Toda operación cae en uno de dos casos:
- **(a)** tomó el compartido antes de `L`. La consolidación espera a que
  confirme y la ve. Su marca se tomó después del bloqueo: si es `< T(M)`
  cuenta para `M`, si es `≥ T(M)` el cómputo al corte la excluye.
- **(b)** pidió el compartido después de que la consolidación lo pidió.
  Espera, y su marca es `> L ≥ T(M)`, fuera de `M`.

No hay operación con marca `< T(M)` que la consolidación no vea.

**Aislamiento.**
- Las operaciones corren en `READ COMMITTED`. El `select … for update`
  devuelve la última versión confirmada de la fila, así que la relectura del
  paso 3 ve lo que confirmó quien tenía el lock antes.
- La consolidación también corre en `READ COMMITTED`. Toma el exclusivo en
  una sentencia y calcula en **una sola sentencia posterior**
  (`insert … select`), cuya instantánea se toma después de obtener el lock.
- **No usar `REPEATABLE READ` ni `SERIALIZABLE` en la consolidación**: ahí la
  instantánea se fija en la primera sentencia, que es la que espera el lock,
  y no vería lo confirmado durante la espera.

**Ausencia de ciclos.** Todas las transacciones piden los locks en el orden
`K_CORTE → participantes → reseña → versiones → voto/tramo → suspensión →
contadores`. La consolidación sólo pide `K_CORTE`. Las colas de espera de los
locks consultivos no crean ciclos si nadie tiene otro lock al pedir
`K_CORTE`. La baja de cuenta va por `baja_comunitaria`, que respeta el orden
(§2.2.3). La única excepción es la red de seguridad de Auth, documentada
allí.

**Precondiciones que el plan tiene que cumplir** (si no, el argumento no
vale):
- ninguna otra vía escribe tramos ni suspensiones (§2.1.1);
- el orden de arriba en cada función, verificado por revisión y por las
  pruebas;
- la marca se toma después de todos los locks.

**Costo.**
- Los compartidos no se bloquean entre sí; los locks de fila sólo
  serializan operaciones sobre la misma entidad.
- El exclusivo dura lo que tarda el cómputo de un mes y ocurre una vez por
  mes.
- `lock_timeout` corto: si vence, la operación falla entera y se reintenta.
  Es una protección adicional; **no sustituye el orden**.

**Casos verificables con dos o más sesiones reales (E2 para el orden, E7
para el cierre).** Cada uno con el resultado esperado escrito antes:
1. dos sesiones votan o retiran sobre el mismo (evaluador, versión): una
   espera; marcas monótonas; resultado igual al serial;
2. edición y voto sobre la misma versión: si la edición confirma primero, el
   voto relee, ve la versión reemplazada y se rechaza;
3. dos ediciones con la misma versión esperada: la segunda da conflicto;
4. reintento con el mismo `id_intento` (§3.4.1): una sola versión y un solo
   reinicio de votos;
5. suspensión y voto del suspendido en paralelo: el voto se aplica antes o
   se rechaza después, nunca con marca posterior a la suspensión;
6. operación con el compartido tomado antes de `T(M)` y confirmada después,
   mientras la consolidación espera;
7. operación que llega con la consolidación esperando o calculando;
8. `baja_comunitaria` durante la consolidación y durante votos de otros
   sobre sus reseñas;
9. baja por la red de seguridad de Auth con un voto concurrente: o termina
   o se revierte entera, sin tramos a medio cerrar;
10. edición, moderación, suspensión y baja entre el corte y la primera
    consulta; purga antes de consolidar; cierre repetido;
11. **igualdad exacta en `T(M)`**, con reloj controlado: tramo que empieza,
    tramo que termina, suspensión que empieza, suspensión que termina y
    primera evaluación positiva, cada uno exactamente en `T(M)` y a un
    microsegundo de cada lado.

Los casos 6, 7, 10 y 11 tienen que coincidir con el cómputo exacto en el
estado anterior a `T(M)` (§2.2.2).

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

- **Identificadores compactos, en tramos (corregido en v3.1).** `bigint`
  para las reseñas, 8 bytes por posición.
  - v3 guardaba un `bigint[]` por snapshot. Leer 50 posiciones de un array
    grande no cuesta lo mismo que el tamaño de página: un array de más de
    ~2 KB va a TOAST y el recorte lo lee entero. El costo por página crecía
    con el total.
  - Propuesta: filas `(snapshot_id, tramo_no, ids bigint[])` de **100 ids
    por fila** (~800 B, por debajo del umbral de TOAST). Una página lee una
    o dos filas por clave primaria.
  - Tamaño útil: 1.000 reseñas ≈ 8 KB por snapshot; 10.000 ≈ 80 KB, más la
    sobrecarga por fila y el índice. Estimado, no medido: se miden tabla,
    índice, TOAST y tiempo de generación en E5.
- **Un snapshot a la vez por título.**
  - Al pedir la primera página se busca un snapshot del título de menos de
    10 minutos.
  - Si no hay, se toma `pg_advisory_xact_lock(hash(título))`, se vuelve a
    buscar (otro lector pudo haberlo creado mientras se esperaba) y recién
    entonces se crea.
  - Así lectores simultáneos no generan snapshots simultáneos.
- **Cota de almacenamiento.**
  - Vida lógica 2 h; a lo sumo uno nuevo cada 10 min por título, o sea 12
    **vigentes** por título.
  - **Físicamente pueden persistir más** (corrige v3, que daba la cota
    lógica como total): un vencido sigue en la tabla hasta que se purga.
    - Al crear uno nuevo se borran los vencidos de ese título, así que un
      título leído seguido nunca tiene más de 12 filas lógicas.
    - Un título que deja de leerse conserva hasta 12 vencidos hasta la purga
      diaria.
    - Cota física ≈ títulos leídos en las últimas ~26 h × 12 × tamaño, más
      tuplas muertas hasta que pase autovacuum.
  - Si E5 muestra que eso no entra holgado en la cuota (§4), la purga de
    vencidos pasa a un job horario propio, en vez de la diaria (sin tocar
    `sala-barrido`, §2.5). No cambia el comportamiento visible.
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
  posesión del buzón si Confirm email estaba encendido al alta. Bloquear,
  borrar y eliminar la cuenta no lo exigen (§2.1.2). Un correo confirmado
  **no** da credibilidad a una denuncia (§3.3.2);
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
- **Todas las reglas, listas, umbrales y cifras de esta sección son
  hipótesis para las pruebas de §3.6.** No son eficacia medida ni
  cumplimiento de Play certificado.

### 3.1 Normalización para detectar

Se usan copias "plegadas" del texto, sólo para buscar patrones; lo que se
guarda y se muestra es el texto NFC original. **Dos pasadas, en este orden
(corregido en v3.1):**

1. **Pasada de dígitos, no destructiva para los números.**
   - NFKC (desarma letras de ancho completo y variantes), minúsculas, sin
     acentos y sin caracteres invisibles (ZWJ, ZWNJ, bidi);
   - separadores colapsados: `b i t . l y`, `bit(.)ly`, `bit[punto]ly`;
   - palabras a dígitos ("once", "quince", "cero", "uno"… "nueve").
   - Sobre esta copia corren las reglas de **teléfono** y las de números de
     documento. Los dígitos todavía no se convirtieron en letras.
2. **Pasada de letras, para dominios, correos, usuarios y vocabulario.**
   - Parte de la copia 1.
   - Los confusables **ambiguos no se sustituyen por una sola letra**: `1`
     puede ser `i` o `l`, `0` puede ser `o`. Los patrones usan clases de
     caracteres (`[il1|]`, `[o0]`, `[e3]`, `[a4@]`, `[s5$]`) en vez de un
     reemplazo único.
   - Cirílicas y griegas parecidas se mapean a su letra latina, que no es
     ambigua.

- **Falsos positivos de la pasada 2:** se prueban explícitamente los títulos
  con dígitos ("Se7en", "M3GAN", "9-1-1") y los números de §3.5. Ninguna
  regla de dominio puede dispararse sólo por la sustitución de dígitos sin
  un TLD o palabra de contacto.
- **Nombres comunitarios (2–24):** sólo reglas de contacto, de odio y de
  forma. **No** se les aplican las de texto anómalo pensadas para reseñas de
  80–600 (mayúsculas, palabras distintas, repeticiones).

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
| **Rechazo de formato o de cuenta** (no se guarda; se corrige sin caso) | Largo fuera de 80–600 · cuenta suspendida · límite agotado · publicación pausada o admisión cerrada (abajo) · términos o correo pendientes | Motivo y qué hacer. No hay revisión: no es una decisión sobre el contenido |
| **Rechazo por regla de contenido** (no se guarda salvo pedido de revisión, §3.3.3) | Enlace o dominio, aunque esté ofuscado (`netflix.com` también: el diseño no permite enlaces) · correo, aunque esté ofuscado ("arroba gmail punto com") · teléfono: ≥ 8 dígitos seguidos en la pasada de dígitos, o ≥ 6 con una palabra de contacto cerca · usuario de red o mensajería con intención de contacto ("wa", "wsp", "telegram", "ig", "@usuario" + "escribime/hablame/mandame/agregame/dm") · nombre comunitario con las mismas reglas de contacto | Motivo concreto y qué corregir ("Sacá el número de teléfono"). Puede corregir y reenviar (cuenta para el límite) **o pedir revisión** (§3.3.3) |
| **Retención** (guardada, invisible para otros, en la cola de retenidos) | Señales de spam o promoción: cripto, inversión, ganancias, "gratis"/"sorteo" + verbo de acción, montos de dinero · duplicado o casi duplicado (§3.3.1) · términos de una lista corta de odio y amenaza explícita, o combinaciones sexuales con menores · patrones de datos personales (DNI/CUIT, "vive en"/"su dirección es" + número) · texto anómalo: más de 50 % mayúsculas, menos de 8 palabras distintas, repeticiones largas · contenido marcado por la revalidación de una denuncia (§3.3.2) | "En revisión" y el motivo general, sin revelar la regla exacta. Puede editar (vuelve a evaluarse) o borrar |
| **Publicación automática** | Pasó todas las reglas, la cuenta cumple §2.1.2 y el interruptor está encendido | Publicada |

**Fallos.**
- Si la normalización, una regla o la escritura lanzan, la transacción se
  revierte: **no queda nada guardado ni publicado** y la ruta responde
  "No se pudo guardar, probá de nuevo".
- No existe un "pendiente por fallo técnico", porque las reglas corren en
  el mismo proceso, sin dependencias externas.
- Una regla fallida nunca aprueba: el módulo no tiene camino por defecto
  que devuelva "publicar" ante un error, y hay una prueba que lo fija.

**Colas separadas y admisión acotada (corrige el hallazgo 2 de `97cf4d7`).**
v3 pasaba todo lo nuevo a "sólo retener" con más de 50 retenidos. Eso
agrandaba la cola sin límite y extendía un ataque a las publicaciones
legítimas. Se retira. Propuesta:

- **Dos colas distintas en el dashboard:**
  - **retenidos:** versiones guardadas e invisibles, a decidir;
  - **denuncias:** casos sobre contenido visible, agrupados por versión
    (muchas denuncias sobre la misma versión son un solo caso con su
    cuenta).
- **Admisión a la cola de retenidos, acotada:**
  - **por autor:** con 2 retenidos sin resolver (hipótesis), un envío nuevo
    de esa cuenta que **sería retenido** no se admite: no se guarda y el
    autor ve "Tenés publicaciones en revisión; esperá a que se resuelvan".
    Reemplaza la regla de v3 "3 retenidos o rechazados en 7 días → todo se
    retiene", que alimentaba la cola;
  - **global:** con N retenidos sin resolver (hipótesis: 50, ajustada a la
    capacidad acordada en P6), ningún envío que sería retenido se admite. No
    se guarda; el autor ve "No podemos revisar más publicaciones ahora,
    probá más tarde". Se avisa en el dashboard.
  - Lo que **pasa todas las reglas** se sigue publicando aunque la cola esté
    llena: no necesita revisión previa, y así llenar la cola no frena las
    publicaciones legítimas.
- **Pausa total de la publicación:** sólo manual, por el dueño (interruptor
  T4). No se dispara sola por cantidad de denuncias, porque eso le daría a
  un atacante un botón para frenar todo.
- **Siempre disponibles, con cualquier cola:** denunciar, bloquear, retirar
  votos, borrar reseñas y eliminar la cuenta (§2.1.2).
- **La cola de denuncias no se cierra:** su tamaño está acotado por el límite
  diario por cuenta, una denuncia por denunciante y versión, y la agrupación
  por versión. Se ordena por prioridad (§3.3.2).
- Esto concreta el "si la cola excede capacidad, pausar" del diseño como
  **pausar la admisión** de lo que iría a la cola, no aceptar retenidos
  indefinidamente.

**3.3.1 — Duplicados.**
- Se guarda un hash del texto plegado y **hashes de los shingles** de 3
  palabras por versión, no los fragmentos en claro (corregido en v3.1: los
  shingles en claro conservaban pedazos del texto).
  - Hash con clave del servidor (HMAC con una variable de entorno de Vercel
    ya existente como mecanismo, sin servicio nuevo), para que no se puedan
    revertir por diccionario de frases comunes. Rotar la clave invalida las
    comparaciones viejas; se acepta.
  - Siguen siendo **datos seudónimos derivados del texto**, no anónimos.
  - Se borran con la versión (cascada), con la reseña, con
    `baja_comunitaria` y, como máximo, a los 90 días (§5).
- Se retiene si:
  - el hash coincide con otra versión de la misma cuenta;
  - o la similitud Jaccard es ≥ 0,8 con otra versión de la misma cuenta;
  - o el hash coincide con 3 o más cuentas distintas en 7 días (spam
    coordinado).
- Costo acotado: se compara contra las últimas 50 versiones de la cuenta y
  un índice por hash.

**3.3.2 — Denuncias (corregido en v3.1).**
- Categorías del diseño.
- **Ninguna denuncia oculta contenido por la categoría que elige quien
  denuncia.** v3 retenía con una sola denuncia grave de una cuenta con correo
  confirmado: era censura barata, y con cuentas nuevas se reiniciaba el
  cupo. Se retira. **Tampoco se reemplaza por un umbral fijo de cantidad.**
- **Qué puede retener una versión denunciada:**
  1. **corroboración automática independiente:** al recibir la denuncia se
     vuelven a correr las reglas vigentes sobre esa versión. Si ahora
     rechazarían o retendrían el texto (por ejemplo, una lista actualizada o
     un patrón de datos personales), la versión pasa a retenida **por la
     regla**, con su `version_reglas`, no por la denuncia;
  2. **decisión del admin** desde la cola.
- **Lo demás no se oculta para los demás.** Entra a la cola de denuncias con
  prioridad:
  - primero las categorías graves (phishing/estafa, explotación sexual,
    datos personales, amenazas);
  - después por cantidad de denunciantes distintos. La cantidad **ordena**,
    nunca oculta;
  - las denuncias descartadas de una cuenta bajan la prioridad de las suyas;
    no las bloquean.
- **Protección inmediata para quien denuncia:** el formulario ofrece
  bloquear al autor en el mismo paso, y eso le oculta la reseña al instante
  (§3.3.4).
- "No me sirvió" **no tiene ningún efecto** sobre moderación, colas ni
  prioridad: sólo cuenta para el orden de utilidad.
- **Pruebas (E3/E4):** N cuentas coordinadas denuncian como graves una
  reseña legítima → sigue visible y sube en la cola; ataque de denuncias
  masivas → publicaciones legítimas siguen publicándose; "No me sirvió"
  masivo → ningún cambio de moderación.
- **No se promete protección perfecta contra cuentas falsas.** Límites por
  cuenta, no por persona.

**3.3.3 — Revisión de un rechazo (nuevo en v3.1).**
- Sólo para **rechazos por regla de contenido**. Los de formato o de cuenta
  se corrigen sin caso.
- Al rechazar, la app ofrece "Pedir revisión". Si el autor la pide,
  **envía voluntariamente el mismo texto** y la ruta:
  1. vuelve a correr las reglas vigentes y confirma que el texto sigue
     rechazado por una regla de contenido (si no, se trata como un envío
     normal);
  2. lo guarda como versión **retenida**, con estado `revision_solicitada`,
     id del caso, `version_reglas`, regla disparada y fecha;
  3. aplica la admisión de la cola (por autor y global) y cuenta para el
     límite diario de la acción original.
- **Nunca se publica por esta vía** sin decisión del admin. El dashboard
  muestra la regla disparada. Si el admin la aprueba, se publica esa versión
  y queda registrado como falso positivo para ajustar las reglas.
- No se guardan todos los rechazos: sólo los que el autor envía a revisión.
  Retención en §5.
- No se pide reenviar por correo.

**3.3.4 — Bloqueos.** Personales, como en el diseño: ocultan sólo para quien
bloquea y no cambian el estado de la reseña. Disponibles siempre (§2.1.2).

### 3.4 Ediciones y nombres: mismas reglas, vías revisadas

| Vía | Cómo podría eludir | Control |
|---|---|---|
| Edición de una publicada | Publicar algo limpio y después agregar el contacto | Cada edición pasa por **todo** §3.3 antes de guardarse. Qué se conserva en cada resultado: §3.4.1 |
| Ediciones sucesivas mínimas para encontrar el borde de la regla | Probar variantes | Límite de 10 ediciones por día y admisión por autor a la cola (§3.3). Los rechazos no se guardan, así que probar variantes sólo gasta el límite |
| Pedir revisión de un rechazo para colar el texto | Usar §3.3.3 como atajo | Queda retenido e invisible hasta decisión del admin, con la regla a la vista; cuenta para la admisión y el límite |
| Partir el contacto entre reseñas ("11" en una, el resto en otra) | Cada texto pasa solo | **Limitación aceptada.** Mitigación parcial: la regla de teléfono mira también la concatenación de las últimas 3 versiones de la cuenta en 24 h |
| Contacto en el nombre comunitario + "mirá mi nombre" en la reseña | El nombre se evaluaría aparte | El nombre comunitario pasa por las mismas reglas de contacto y odio, más largo 2–24. "Mirá mi perfil/nombre" retiene la reseña |
| Cambiar `profiles.display_name` por update directo | Saltear la ruta | Lo comunitario muestra sólo la columna de nombre comunitario, que escribe la función de §2.1.2. El `display_name` sigue igual para el saludo y Yumpeá (fuera de alcance) |
| RPC directo a la función de escritura | Saltear las reglas | Ejecutable sólo por `service_role` (§2.1.2) |
| Muchas cuentas | Repartir el spam | Límites por cuenta (no por persona: el diseño ya lo aclara), duplicados entre cuentas (§3.3.1), retención de la cola y las denuncias. No se promete frenar a un atacante con muchas cuentas |
| Avatar | — | Catálogo fijo de 31: evita subidas nuevas de imágenes. Se conservan el catálogo y sus controles existentes |

**3.4.1 — Ediciones: qué se conserva y cuándo se reinician votos (nuevo en
v3.1).** La regla del diseño se mantiene: cambiar el texto **persistido**
reinicia los votos, con el aviso previo "Al editar tu reseña se reinician
los votos de utilidad". Lo que no se persiste no toca nada.

| Caso | Versión anterior | Votos | Qué ve el autor |
|---|---|---|---|
| Texto idéntico tras normalizar | Intacta | Intactos (no-op, diseño §3.2) | "Sin cambios" |
| Rechazo de formato o de cuenta | Intacta, sigue publicada | Intactos | Motivo |
| Rechazo por regla de contenido | Intacta, sigue publicada | Intactos | Motivo; puede corregir o pedir revisión |
| Admisión cerrada (cola llena, §3.3) | Intacta, sigue publicada | Intactos | "Probá más tarde" |
| Fallo técnico, `lock_timeout` o conflicto | Intacta: la transacción se revierte entera | Intactos | "No se pudo guardar, probá de nuevo" |
| Versión esperada distinta de la vigente | Intacta | Intactos | Conflicto: recargar |
| Edición aceptada y publicada | Pasa a reemplazada; se cierran sus tramos | Se reinician **una vez**: la nueva versión empieza en cero | Publicada |
| Edición aceptada y retenida (o revisión pedida, §3.3.3) | Deja de verse, como dice el diseño ("deja de ser visible mientras se analiza"), y no vuelve si el admin rechaza la nueva | Se reinician una vez | "En revisión". Antes de pedir revisión de una edición rechazada, se le avisa que la publicada dejará de verse |

- **Reintentos idempotentes:** cada envío lleva un `id_intento` generado por
  el cliente, con `unique (reseña, id_intento)`. Un reintento del mismo
  intento devuelve el resultado ya confirmado: no crea otra versión ni
  reinicia votos otra vez. Si se perdió la respuesta, el cliente consulta el
  estado (diseño §3.2).
- **Control de versión:** el envío lleva la versión que el autor editó. La
  función la compara después de bloquear la reseña (§2.2.4, paso 3).
- **Una edición no persistida nunca borra ni oculta la anterior**: la
  versión vigente sólo cambia en la misma transacción que guarda la nueva.
- Pruebas en E3: un caso por fila, más el reintento tras un fallo inyectado
  después de confirmar.

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
- **Carga propuesta para el dueño (P6, corregido en v3.1; NO aceptada por
  el dueño).** La v3 proponía leer cada día todo lo publicado durante
  semanas. Era justamente la carga que el dueño quería evitar, y se retira.
  Propuesta:
  - atender las colas de retenidos y de denuncias por prioridad (§3.3.2);
  - más un **muestreo acotado**: hasta 5 publicaciones automáticas elegidas
    al azar por sesión de revisión, sólo para detectar patrones que las
    reglas no ven;
  - tamaño y frecuencia son hipótesis. Los topes de admisión de §3.3 se
    ajustan a la capacidad que el dueño indique, para que la cola no crezca
    más de lo que puede atender.
- **El muestreo no certifica eficacia.** Con 5 al azar, un abuso poco
  frecuente puede no aparecer nunca.
- Si las pruebas o el uso muestran que hace falta más cobertura humana, el
  compromiso de alcance u operación se explicita al dueño **antes** de lanzar
  (por ejemplo: menos alcance, publicación pausada o más revisión). No se le
  traslada en silencio.
- Con el muestreo y las colas se calibran listas y umbrales, y se decide si
  la publicación automática sigue encendida (interruptor T4).

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
  reseñas, nombre con contacto, duplicados entre cuentas, pedido de revisión
  como atajo y RPC directo (con la base del banco de E2).
- **Plegado (§3.1):** dígitos detectados antes de la pasada de letras;
  confusables ambiguos como clases; títulos con dígitos sin falso positivo;
  nombres sin reglas de texto anómalo.
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

| Recurso | Dato conocido | Qué agrega reseñas | Qué verificar en E0/E9 |
|---|---|---|---|
| Supabase | **Panel (dueño, 18-19/09): plan Free, PostgreSQL 17.6, `pg_cron` 1.6.4** | Filas de reseñas, versiones, votos, tramos, snapshots, hashes, registro. Estimado no medido: unos pocos KB por reseña con su historia; 10.000 reseñas en el orden de decenas de MB | Tamaño actual de la base y límite del plan; egress y MAU usados; si el plan Free conserva backups y por cuánto [no verificado]; cupo de correos de Auth (§2.4) |
| Vercel | **Panel (dueño, 19/09):** 19K de 1M invocaciones y 30 min de 4 h de CPU a 30 días | Una invocación por lectura de página de reseñas, escritura, voto o denuncia; las reglas son CPU local, de milisegundos [estimado] | Uso actual a 30 días; plan efectivo; retención de logs |
| Upstash | Opcional, con cuota propia (CLAUDE.md, `TTL.home`) | Nada: reseñas no usa Redis (límites en la base, T3) | — |
| Proveedores externos | — | **Ninguno** | — |

**Criterio de lanzamiento propuesto:** en el uso previsto, cada cuota con
holgura documentada a partir de una medición del ensayo (E9). Si una cuota
no alcanzara, se resuelve reduciendo uso (TTL de snapshots, retención de
hashes), no con un upgrade. La cota física de snapshots (§2.3) entra en esa
medición.

---

## 5. Retención interna

Sin clasificador externo **no se suma un tercero nuevo** (v2 §5.1 queda
superado). Pero el texto sigue pasando por los encargados existentes:
Vercel lo procesa en la ruta (y en sus logs si algo lo registrara, cosa que
se prohíbe abajo) y Supabase lo guarda, con sus backups. **Ningún plazo está
validado legalmente**: son propuestas para P3.

| Dato | Propuesta | Validación |
|---|---|---|
| Texto de la versión vigente | Mientras exista la reseña | No |
| Versiones reemplazadas | Se borran al confirmarse la nueva, salvo denuncia abierta | Sí |
| Texto rechazado | **No se guarda**: el rechazo ocurre antes de escribir. El registro guarda regla, `version_reglas` y fecha, sin texto | — |
| Texto rechazado enviado a revisión por el autor (§3.3.3) | Hasta resolverse; si se confirma el rechazo, + 30 días; si se aprueba, pasa a versión vigente | **Sí** |
| Texto retenido y no publicado | Hasta resolverse + 30 días si se rechaza en revisión | **Sí** |
| Texto borrado por el autor | Invisible al instante; purga en ≤ 30 días, salvo denuncia abierta | **Sí** |
| Hash del texto y hashes de shingles (§3.3.1) | Con la versión; como máximo 90 días; se borran con la reseña y con la baja | **Sí**: dato seudónimo derivado del texto |
| Votos | Mientras exista la versión | Sí |
| Tramos y participantes huérfanos (§2.2) | Hasta consolidar el mes que los necesita | **Sí**: seudónimos, no anónimos |
| Denuncias | Hasta cerrar el caso + 30 días | **Sí** |
| Registro de decisiones | Sin texto; 12 meses; con la baja, sin vínculo a cuenta | **Sí** |
| Sanción activa | Mientras rige; 6 meses después, sólo un contador; con la baja, se borra | **Sí** |
| Resultados consolidados | Puntos y posición; huérfanos sin id | Sí |
| Snapshots de orden | Ids de reseñas; vigencia 2 h, físicamente hasta la purga (§2.3); sin datos del lector | No |
| Logs | Nunca texto, nombre ni token | Retención del plan de Vercel (E0) |
| Backups | La purga no los alcanza hasta rotar | **Verificar el plan Free (E0)** antes de escribir plazos |

> **Conciliación con lo construido en E2b (24/10/2026; auditoría de
> `f650725`). No fija plazos nuevos ni aprueba excepciones: P3 sigue
> pendiente.**
>
> - **"Sanción activa … con la baja, se borra"** se lee como el **vínculo de
>   la sanción con la cuenta**, no como los intervalos de suspensión. La
>   baja (012) borra ese vínculo: el participante queda seudónimo, sin
>   `user_id` ni nombre. Lo que **se conserva** son los **intervalos
>   históricos de suspensión del seudónimo**, porque los necesita la
>   reconstrucción del ranking (§2.2.2: ninguna suspensión del evaluador ni
>   del autor rige antes de `T(M)`), y porque el dueño pidió no quitar
>   suspensiones. Esos intervalos son **datos seudónimos** con la misma
>   regla que los tramos huérfanos ("hasta consolidar el mes que los
>   necesita"). **Su plazo concreto no está decidido ni validado**: se fija
>   con P3, antes de implementar la purga (E8). La copia de la sanción en el
>   marcador (`sancion_hasta`) cae con la cuenta en Auth.
> - **Denuncias recibidas, discrepancia abierta.** La fila "Denuncias: hasta
>   cerrar el caso + 30 días" choca con el paso 1 de la baja (§2.2.3), que
>   borra físicamente las reseñas de la cuenta. Las versiones caen en
>   cascada con la reseña, y con ellas **las denuncias que otros hicieron
>   sobre esos textos, también las abiertas** (comprobado en las cascadas de
>   E2b). **Esa excepción NO está aprobada.** Queda pendiente de resolución
>   **antes del panel de moderación (E4), de la purga (E8) y de habilitar la
>   publicación**. El comportamiento local no se cambia hasta decidirlo.

**A validar por alguien competente** (no es asesoramiento legal):
- cada plazo marcado;
- los cambios a `/privacidad`: contenido visible para registrados, perfil y
  ranking, moderación automatizada por reglas con revisión humana, plazos y
  backups;
- términos comunitarios versionados;
- rechazo automatizado con explicación y revisión a pedido (§3.3.3);
- IARC y Data Safety con contenido generado por usuarios.

Sin proveedor externo **ya no hay transferencia del texto a un
clasificador**. Supabase y Vercel ya figuran como encargados en
`/privacidad`, y siguen tratando el texto (arriba).

---

## 6. Entregas (sin proveedor ni pruebas pagas)

Cada entrega es una rama con su informe; **ninguna arrastra autorizaciones**.
Todavía no es el plan.

| # | Entrega | Contenido | Criterios de auditoría (Codex) |
|---|---|---|---|
| E0 | Verificación de partida (sólo lectura, P5) | `user_reviews` (filas, dependencias, grants efectivos); privilegios por defecto; `cron.job`; Auth (Confirm email, autoconfirmadas contadas sin listar); cuotas y uso actual de Supabase y Vercel; backups del plan Free; cupo de correos de Auth | Tipo de evidencia por dato; nada que escriba; sin datos personales |
| E1 | **Reglas y pruebas locales** (sin app, sin llamadas externas) | Módulo de normalización y reglas (§3.1–§3.3) con suites de §3.6 | Resultados por caso sobre el reservado; criterios de §3.6; prueba de "fallo nunca aprueba"; ninguna llamada de red |
| E2 | Esquema y permisos | Migración aditiva 011 + rollback no destructivo (§2.1, §2.2.1–§2.2.3); cierre de `user_reviews` según E0 | Matriz §2.1.5 y matriz por operación de §2.1.2 con sus estados; FK compuesta y `CHECK` de autoevaluación; `baja_comunitaria` y red de seguridad de Auth; orden de locks con los casos 1–5, 8 y 9 de §2.2.4 |
| E3 | Escritura con reglas | Ruta POST + funciones `service_role`; rechazo, retención y publicación (§3.3); revisión de rechazos (§3.3.3); ediciones y nombres (§3.4, §3.4.1) | Cada vía de §3.4 y cada fila de §3.4.1 probadas; reintento idempotente; admisión acotada por autor y global; protección y borrado disponibles con cola llena y suspensión; ningún camino publica sin reglas |
| E4 | Moderación en el dashboard | `/admin/moderacion`: colas separadas de retenidos y denuncias, revisiones pedidas, decisiones, suspensión, restauración, muestreo (§3.3, §3.5) | `adminDeToken` + `is_admin_mfa()` en API y base; decisiones atadas a versión; ataques de denuncias de §3.3.2 sin ocultamiento |
| E5 | Lectura y utilidad | T1, acordeón, paginación (§2.3), votos, bloqueos | Anónimo sin datos comunitarios por ninguna vía; `/api/title` idéntico; más de 200 reseñas sin repetir ni saltear; un solo snapshot con lectores concurrentes; revalidación acotada; tamaño medido de tabla, índice y TOAST, y costo por página que no crece con el total |
| E6 | Perfiles y nombre comunitario | Proyección y ruta nativa | Sólo campos de la proyección; update directo de `display_name` sin efecto comunitario |
| E7 | Top Yumpers | §2.2.4–§2.2.5 y selector ya decidido | Casos 6, 7, 10 y 11 de §2.2.4 con sesiones concurrentes y reloj controlado; consolidación en `READ COMMITTED`; Top de plataformas intacto |
| E8 | Retención y purga (después de P3) | Jobs §2.5 con autorización | Purga nunca toca tramos sin consolidar; reloj controlado |
| E9 | Integración y lanzamiento | Textos legales del dueño, interruptores, cuotas medidas (§4), carga de revisión acordada con el dueño (P6) y topes de admisión ajustados a ella, Android en el mismo AAB que los arreglos de Yumpeá ya aprobados | Prueba en teléfono; rollback por interruptor; nada de migración, deploy, versión ni AAB sin autorización de esa entrega |

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
| Encabezado (actualización del dueño) | Moderación por reglas propuesta para revisión | §3 la concreta: tabla de rechazo, retención y publicación; fallos sin aprobación; colas separadas con admisión acotada; revisión de rechazos a pedido |
| §3.3 | Cursor ligado a versión de conjunto, recarga desde el principio | §2.3 |
| §3.4 | Cierre mensual idempotente y reproducible | §2.2: participantes separados de la cuenta, tramos, bloqueo compartido/exclusivo, consolidación sin ids de huérfanos |
| §3.5 | Correo confirmado | §2.4 |
| §3.5 | "Alertas de riesgo grave pueden retener preventivamente" | §3.3.2: retiene sólo la corroboración por las reglas vigentes o el admin; la denuncia grave sin corroborar se prioriza y no oculta |
| §3.2 / §6 | Autorización efectiva en servidor/base | §2.1: escritura sólo por `service_role` con reglas en la ruta, matriz por operación, invariantes viables |
| §3.2 | Ediciones concurrentes con control de versión; reintentos idempotentes | §2.2.4 (orden de locks) y §3.4.1 (`id_intento`, qué se conserva) |
| §5 | Entregas 0–4 | §6 (E0–E9) |

---

## 8. No hecho / no comprobado

- **Producción:** no se consultó. Lo efectivo queda para E0.
- **Cuotas:** las del panel son del 18-19/09; hay que actualizarlas.
- **Ninguna prueba:** las suites de §3.6 están propuestas, no escritas.
- **Validación legal:** ninguna.
- **Carga del dueño (P6):** propuesta, no aceptada.
- **Orden de locks y aislamiento (§2.2.4):** argumentados, no probados; los
  casos se ejecutan en E2 y E7.
- Sin proveedores, gastos ni llamadas externas.

## Fuentes

- PostgreSQL `CREATE FUNCTION`: https://www.postgresql.org/docs/current/sql-createfunction.html
- PostgreSQL bloqueos consultivos: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- PostgreSQL `IS NORMALIZED` / `normalize`: https://www.postgresql.org/docs/current/functions-string.html
- Supabase Auth, configuración: https://supabase.com/docs/guides/auth/general-configuration
- Google Play, contenido generado por usuarios: https://support.google.com/googleplay/android-developer/answer/9876937?hl=es
