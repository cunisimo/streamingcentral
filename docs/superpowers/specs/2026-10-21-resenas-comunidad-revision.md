# Reseñas de usuarios y Top Yumpers — revisión del diseño y preparación

Fecha: 21/10/2026. Autor: Claude Code, para auditoría de Codex. Revisa
[`2026-10-21-resenas-comunidad-design.md`](2026-10-21-resenas-comunidad-design.md)
(borrador de Codex, registrado sin cambios).

**Versión 2 (21/10/2026).** Corrige la versión auditada en `f64a659` según
[`docs/medidas/2026-10-21-auditoria-preparacion-resenas.md`](../../medidas/2026-10-21-auditoria-preparacion-resenas.md)
(informe de Codex, copiado sin cambios). Qué cambió y dónde: §0.

**Qué es y qué no es.**
- Revisión y preparación. NO es el plan de implementación ni lo autoriza.
- No se escribió código, SQL ni migraciones.
- No se contrató, configuró ni probó ningún proveedor.
- No se consultó Producción.
- No hubo push, merge, deploy, cambio de versión ni AAB.
- El estado operativo sigue en `docs/ESTADO.md`.

**El diseño de Codex no se reescribe.** Donde esta revisión propone cambiar
una regla del diseño, lo dice expresamente en §7. Ninguna propuesta de este
documento está aprobada por el hecho de estar escrita acá.

**Base.**
- Rama `docs/resenas-comunidad`, desde `integracion/yumpea-compartir`
  (`52c7ae7`, prueba local de Yumpeá aprobada).
- El diseño y el informe de auditoría se copiaron del checkout principal sin
  tocar sus otros archivos. SHA-256 idénticos: diseño `7CF0F134…D6C3CD`,
  informe `28F20B21…410C21`.

**Tipos de evidencia.**
- **código:** leído en `52c7ae7`, con archivo:línea.
- **doc oficial:** página del proveedor consultada el 21/10/2026.
- **[no verificado]:** no confirmado en fuente oficial o en Producción.

Nada se comprobó contra la base ni los paneles de Producción. `schema.sql`
y las migraciones dicen qué *debería* haber; policies, grants, filas, jobs y
configuración de Auth **efectivos** quedan para E0 (§6).

---

## 0. Correcciones respecto de `f64a659`

| Hallazgo de Codex | Qué estaba mal | Corrección |
|---|---|---|
| A1 (alto) — permisos y escrituras | T2 proponía RPC `security invoker`: el llamador necesita permiso de escritura sobre las tablas, así que podía escribir directo y saltear límites, normalización y transiciones | §2.1: sin permisos de tabla para `anon`/`authenticated`; escrituras sólo por funciones `security definer` acotadas; invariantes en la base que valen para todo camino; inventario de grants y pruebas por rol |
| A2 (alto) — cierre mensual | T6 sólo garantizaba no duplicar el cierre, no reconstruir el estado al corte | §2.2: puntos con validez temporal, cómputo "al instante del corte", seudonimización en vez de borrado en cascada y purga sólo después de consolidar |
| A3 (medio) — paginación | T5 dejaba inaccesibles las reseñas posteriores a 200 | §2.3: "Recientes" con cursor por clave; "Más útiles" con un orden congelado compartido, sin tope, sin datos del lector, y visibilidad revisada en cada página |
| A4 (medio) — correo | D7/F3 mezclaban la confirmación del alta con la recuperación de contraseña (#22) y daban `email_confirmed_at` como prueba de posesión del buzón | §2.4: tres situaciones distintas; #22 deja de ser dependencia |
| A5 (medio) — modelos y costos | Equiparaba esfuerzo bajo con razonamiento desactivado; recomendaba gpt-5-nano, marcado Deprecated; mezclaba costo estimado, medido y presupuesto; no incluía nombres | §3 y §4 |
| A6 (medio) — planificador | D2 decía que el único job era `tmdb-sync`; omitía `sala-barrido` (`009_salas.sql:815`, `pg_cron` cada minuto) | §1.2 D2 y §2.5 |
| Precisiones del informe | "Ninguna API detecta…" sin matices; retención de proveedores simplificada; banco presentado como si certificara; espera de 24 h presentada como condición; once "decisiones" del dueño, varias técnicas; F8 reabría nombres ya decididos; tablas nuevas presentadas como decisión del dueño | §1.3, §3, §4, §5; espera de 24 h retirada; F8 retirada; tablas nuevas justificadas como elección técnica (§2.1.4) |
| MFA editorial | — | Confirmado **en el código**, no en la configuración efectiva de Producción. Trabajo separado (§1.1 C3): no se implementa ni se tocan cuentas, factores o permisos |

---

## 1. Contraste con el código vigente

### 1.1 Contradicciones

| # | Afirmación | Lo que hay en el código | Consecuencia |
|---|---|---|---|
| C1 | §2 del diseño: la policy de `user_reviews` "permite lectura pública de aprobadas" | `schema.sql:297-298`: `for select using (estado = 'aprobada')` **sin `to authenticated`**: en el SQL, `anon` lee aprobadas por PostgREST. Policies, grants y filas **efectivos** en Producción: [no verificado] | Choca con §1 del diseño ("sólo cuentas con sesión"). Tiene que cambiar antes de activar el módulo (§2.1.4) |
| C2 | §2: el trigger "conserva el estado anterior al editar" | Confirmado (`schema.sql:310-327`). Además el autor puede `UPDATE texto` y `DELETE` directo (`:300-301`, policy `for all`) | Una aprobada editada seguiría publicada sin moderar. El modelo de escritura directa no sirve (§2.1) |
| C3 | §2: "Admin tiene comprobaciones en API y base" | Sólo el Top (`adminDeToken` + `is_admin_mfa()`, `007_top_manual.sql:344-351`). La editorial se escribe desde el navegador (`app/admin/resena/[id]/page.tsx:67-76`) con `is_admin()`, que no comprueba AAL2 (`schema.sql:212-214`). **Confirmado en código; la configuración efectiva de Producción no se comprobó.** No demuestra acceso de un usuario no admin ni explotación real | Moderación copia el modelo del Top. El endurecimiento de la editorial es **trabajo separado**: sin implementarlo acá y sin quitar admin ni MFA a ninguna cuenta |
| C4 | §3.1: "NO abrir SELECT de `profiles` completos" | `profiles` no guarda correo y sólo deja leer la fila propia (`schema.sql:96-99`) | El riesgo real es otro: no existe forma de leer nombre/avatar ajeno. La proyección comunitaria es una función nueva (§2.1) |
| C5 | CLAUDE.md: la ficha "se arma… cacheada en Redis (`detail()`)" | `/api/title` es `force-dynamic` y cachea sub-partes; la editorial se lee en vivo (`lib/enrich.ts:1448`, `lib/reviews.ts:6-21`) | No hay payload cacheado que filtre reseñas. Lo comunitario va en una ruta aparte (T1) |
| C6 | §3.5: "verificar compatibilidad con proveedores de login" | Un solo proveedor: correo + contraseña (`AuthContext.tsx:194,199`) | Compatibilidad trivial; lo pendiente es la configuración de confirmación (§2.4) |
| C7 | §3.6: "Cuenta eliminada nunca conserva nombre/avatar" | Precedente distinto en Yumpeá: `room_participants.user_id` `on delete set null` conserva `nombre` (`009_salas.sql:80`) | No es un defecto de Yumpeá (salas efímeras); el cierre mensual no debe copiar ese patrón (§2.2) |
| C8 | §3.2: el nombre del autor "requiere controles" | `profiles.display_name` sin reglas en la base; el cliente sólo exige `trim().length >= 2` al registrarse (`app/cuenta/page.tsx:77`); se edita con update directo (`perfil/page.tsx:28`); `handle_new_user` lo toma de `raw_user_meta_data` | El control no puede vivir sólo en la API (§2.1.3) |

### 1.2 Dependencias que el diseño no nombra

| # | Dependencia | Evidencia | Qué implica |
|---|---|---|---|
| D1 | No existe limitador de tasa | Único caso: un `Map` en memoria en `/api/cuenta/eliminar` (`route.ts:26`); `ESTADO.md` lista "limitador" sin implementar (#19) | Los límites se construyen en la base, dentro de las funciones de escritura (§2.1). Upstash no sirve: es opcional y cae a memoria por instancia |
| D2 | **Planificador: hay `pg_cron`, Vercel no** | Corrección de `f64a659`. El repo programa **dos** jobs: `sala-barrido` cada minuto (`009_salas.sql:814-815`, SQL puro) y `tmdb-sync-upcoming-daily` (`supabase/cron.sql`, vía Edge Function). `vercel.json` no existe desde el 20/10. **Jobs efectivos en Producción: [no verificado]** | Antecedente directo para el cierre y la purga (§2.5). No tocar `sala-barrido` ni reactivar el cron de Netflix retirado |
| D3 | La ficha no está en el bundle nativo | `scripts/build-capacitor.mjs:204` excluye `titulo`; Android usa `/t/?tipo=&id=` | Lectura comunitaria por API con Bearer desde el cliente; perfil comunitario por ruta nativa tipo `/u/?id=`, sin App Link |
| D4 | CORS sólo GET/POST | `lib/cors.ts:37,40` | T8: todo por POST |
| D5 | `/top` guarda snapshots en `sessionStorage` | `TopView.tsx:106-107,160` | T9: Top Yumpers fuera de ese store |
| D6 | El toggle Películas/Series de `/top` es global | `TopView.tsx:94` | No aplica a un ranking de autores: se oculta en la pestaña Top Yumpers. Los nombres del selector ya los decidió el dueño ("Top semanal plataformas" / "Top Yumpers"); `f64a659` los reabría y se retira |
| D7 | Privacidad y términos viven en `yump.ar`, a cargo del dueño | `lib/legal.ts:22-25`; `PLAY-STORE.md:153`; edad mínima 16 | Las condiciones de §4 del diseño son trabajo del dueño fuera del código |
| D8 | Backups de Supabase, logs de Vercel y región sin verificar | `PLAY-STORE.md` §7.c filas 1, 2 y 5 | No prometer plazos de borrado sin saber cuánto viven los backups (§5) |
| D9 | Baja de cuenta = `deleteUser` con service role y `on delete cascade` | `lib/eliminar-cuenta.ts:93` | Cada tabla nueva declara a propósito qué pasa con la baja. Los datos del cierre mensual NO caen en cascada: se seudonimizan (§2.2) |
| D10 | No hay normalización NFC; sí el patrón de limpieza de controles y conteo por puntos de código | `lib/sala/invitacion.ts:36-45` ↔ `sala_nombre_valido` | T7 |

**Retirado de `f64a659`:** la dependencia "D7: issue #22". El #22 es
recuperación de contraseña desde Android (`docs/ISSUES.md:337`), no una
avería demostrada del alta ni de la confirmación. §2.4 lo trata como
recorrido distinto y no lo convierte en bloqueo.

### 1.3 Qué decide quién

- **Dueño:** sólo producto relevante, gasto y privacidad (§1.4).
- **Codex:** audita las propuestas técnicas.
- **Técnicas:** van con una solución concreta y justificada, sin preguntar
  (§2 y T1–T10).

Retirados de la lista de `f64a659` por ser técnicos o ya decididos:

| Era | Ahora |
|---|---|
| F4: qué hacer con `user_reviews` | Elección técnica justificada (§2.1.4) |
| F6: control del nombre | Propuesta técnica (§2.1.3) |
| F7: contador de anónimos | Propuesta, consecuencia directa de §3.1 del diseño: el anónimo ve la editorial y la invitación, y el contador cuenta sólo lo que ve |
| F8: nombres del selector | Ya decidido por el dueño |
| F9: evasión por baja de cuenta | Por defecto no se retiene nada para impedir re-registro. Sólo vuelve al dueño si alguien propone retener un dato para eso |
| F10: aviso de pendientes graves | Contador en el dashboard; ningún mensaje externo |
| F11: cifras de límites | Hipótesis iniciales ajustables por configuración (§2.1.2). **La espera de 24 h para cuentas nuevas se retira**: era una propuesta nueva, no aprobada, y no se justificó su efecto sobre la conversión |
| F12: una revisión por decisión | Ya estaba en el diseño |

### 1.4 Preguntas al dueño (producto, gasto, privacidad)

| # | Pregunta | Por qué es del dueño | Cuándo |
|---|---|---|---|
| P1 | Proveedor del clasificador y transferencia internacional del texto | Privacidad (nuevo encargado, fuera de Argentina) y gasto | Después del banco E1, con resultados |
| P2 | Presupuesto mensual máximo del clasificador | Gasto. Propuesta: USD 10/mes, que cubre la cota de 10.000 análisis (§4) | Junto con P1 |
| P3 | Plazos de retención (§5) | Privacidad, con validación de alguien competente | Antes de E9 y de publicar textos legales |
| P4 | Si E0 muestra cuentas autoconfirmadas: ¿pedirles prueba de buzón para publicar? | Producto y privacidad: implica enviar correos y puede frenar a usuarios existentes | Sólo si E0 lo hace necesario (§2.4) |
| P5 | Autorizar el gasto del banco E1 (menos de USD 1) y las consultas de sólo lectura de E0 | Gasto y acceso a Producción | Antes de E0/E1 |

---

## 2. Soluciones técnicas propuestas

### 2.1 Permisos y escrituras (corrige A1)

**Problema.** Con `security invoker`, la función corre con los permisos de
quien llama. Para que funcione, `authenticated` necesitaría INSERT/UPDATE
sobre las tablas. Con esos permisos, cualquier sesión puede escribir directo
por PostgREST y saltear los contadores, la normalización y las transiciones
de estado. La RLS de propiedad (`auth.uid() = user_id`) no lo impide: sólo
dice de quién es la fila, no por dónde entró.
Fuente: https://www.postgresql.org/docs/current/sql-createfunction.html

**Propuesta.**

**2.1.1 — Sin permisos de tabla para los roles de la API.**
- En Supabase, las tablas nuevas de `public` reciben permisos para `anon` y
  `authenticated` por los privilegios por defecto del proyecto [comportamiento
  documentado de Supabase; el efectivo se verifica en E0].
- Por eso la migración hace `revoke all` explícito sobre cada tabla nueva
  para `anon` y `authenticated`, y además activa RLS sin ninguna policy para
  esos roles (doble cierre: si alguien vuelve a otorgar un permiso por error,
  la RLS sigue negando).
- Lecturas y escrituras van sólo por funciones.

**2.1.2 — Funciones `security definer` acotadas.**
- Cada función:
  - `set search_path = ''` y nombres totalmente calificados (evita el
    secuestro por `search_path`);
  - `revoke execute … from public` y `grant execute` sólo al rol que
    corresponde.
- Asignación de roles:

  | Rol | Puede ejecutar |
  |---|---|
  | `authenticated` | Escritura y lectura comunitarias |
  | `service_role` | Aplicación de la decisión del filtro (T2) |
  | `authenticated` + comprobación de `is_admin_mfa()` adentro | Acciones de moderación |

- Lo que cada función de escritura comprueba, en la misma transacción:
  1. sesión (`auth.uid()` no nulo);
  2. interruptor de publicación (T4);
  3. aceptación vigente de términos;
  4. suspensión;
  5. correo según §2.4;
  6. límite por cuenta, con la fila de contador bloqueada
     (`select … for update`), así dos pedidos simultáneos no pasan los dos;
  7. normalización (T7);
  8. transición de estado permitida;
  9. versión esperada (control de concurrencia).
- Cifras iniciales de límites, **hipótesis** ajustables en la fila de
  configuración, sin espera para cuentas nuevas:
  - 5 reseñas nuevas por día;
  - 10 ediciones por día;
  - 100 evaluaciones por día;
  - 10 denuncias por día.

**2.1.3 — Invariantes en la base, que valen para TODO camino** (también
para `service_role` y para un error futuro dentro de una función):
- `check` de largo sobre el texto ya normalizado (80–600 puntos de código) y
  de forma (texto = su propia normalización NFC).
- Unicidad: una reseña viva por autor y título; un voto vigente por evaluador
  y versión; una denuncia por denunciante y versión.
- Trigger de transiciones: sólo los pasos de estado permitidos.
  - `publicada` sólo puede venir de la función de decisión, con la versión
    vigente.
  - Una versión reemplazada nunca vuelve a `publicada`.
- Autoevaluación imposible (`check` evaluador ≠ autor, vía la versión).
- Nombre visible: hoy `profiles.display_name` se edita directo. Propuesta:
  - un trigger de forma sobre `profiles` (controles, largo, sin URL ni
    contacto evidente), que también corta el update directo;
  - y que el nombre que se muestra en lo comunitario salga de una columna
    aprobada aparte, que sólo escribe la función de decisión.
  - Así, cambiar el nombre no publica nada sin control, y el resto de la app
    (saludo, Yumpeá) no cambia.

**2.1.4 — Tablas nuevas en vez de adaptar `user_reviews` (elección técnica).**
- **Modelo.** El diseño necesita reseña → versiones (1:N), con votos y
  decisiones atados a la versión. `user_reviews` es una fila por reseña, con
  el estado en la misma fila. Adaptarla exige partirla igual: es una tabla
  nueva con el nombre viejo.
- **Rollback.** Con tablas nuevas, desactivar el módulo es revocar o apagar
  el interruptor sin tocar nada preexistente. Adaptar cambia en el lugar la
  semántica, las policies y el trigger de una tabla existente, y el rollback
  tiene que restaurarlos.
- **Permisos.** La tabla vieja trae una policy `for all` del autor y lectura
  anónima. Cerrarlas y además reestructurar en la misma migración mezcla dos
  riesgos.
- **Filas preexistentes.** Si las hubiera (E0), se escribieron sin términos
  comunitarios ni filtro: no pueden publicarse bajo las reglas nuevas en
  ningún caso.
- **Qué se hace con `user_reviews`:**
  - se conserva con sus filas, sin borrar historial;
  - se reemplaza su policy de lectura anónima y la `for all` del autor por
    cierres, **después del inventario de E0** (filas, dependencias, grants
    efectivos);
  - si E0 encontrara filas, se informa al dueño qué hay, sin publicarlas ni
    migrarlas.
- **Por qué no es imposible reutilizarla:** sus defectos se podrían migrar.
  Las tablas nuevas se eligen por rollback y permisos más simples, no porque
  la otra opción sea inviable.

**2.1.5 — Prueba obligatoria (E2).**
- Banco en Postgres real aislado con PostgREST.
- Una matriz rol × objeto × operación:
  - roles: `anon`, `authenticated` autor, `authenticated` ajeno, suspendido,
    admin sin MFA, admin con MFA, `service_role`;
  - operaciones: SELECT, INSERT, UPDATE y DELETE por REST sobre cada tabla,
    y EXECUTE de cada función.
- Resultado esperado escrito de antemano.
- Además, carreras de límite (dos pedidos simultáneos con el contador al
  límite: pasa uno).
- Tests textuales del SQL no cuentan como prueba de permisos.

### 2.2 Cierre mensual consistente al corte argentino (corrige A2)

**Problema.** "Calcular el mes la primera vez que alguien lo pide" con el
estado vigente cuenta lo que hay *en ese momento*, no lo que había al corte.
Si un positivo válido al 31/10 se retira el 1/11 antes de la primera
consulta, octubre pierde un punto. Si en el medio hubo una baja de cuenta con
`on delete cascade`, o una purga, el dato puede ya no existir. La
idempotencia sólo evita duplicar; no recupera.

**Propuesta: puntos con validez temporal y cómputo "a la fecha del corte".**

1. **Tabla de puntos.**
   - Cada fila es un tramo de positivo elegible, con: evaluador, autor,
     versión, **mes de la primera evaluación positiva** de ese evaluador a
     esa versión (no cambia al alternar), `vigente_desde` y `vigente_hasta`
     (nulo = vigente).
   - Retirar el voto, pasarlo a negativo, editar, ocultar por moderación o
     suspender **cierran el tramo** (`vigente_hasta = now()`); no borran.
   - Reponer abre un tramo nuevo con el mismo mes de primera evaluación.
   - Las suspensiones son, a su vez, intervalos en su propia tabla.
2. **Corte.**
   - `T(M)` = medianoche del día 1 del mes siguiente en
     `America/Argentina/Buenos_Aires`, convertida a `timestamptz`.
   - Intervalos semiabiertos `[inicio, fin)`.
3. **Cómputo al corte.** Los puntos del mes `M` son los pares distintos
   (evaluador, autor) con al menos un tramo que cumple las tres condiciones:
   - el mes de primera evaluación positiva es `M`;
   - el tramo cubre `T(M) − ε`, o sea que estaba vigente al terminar el mes;
   - ni evaluador ni autor estaban suspendidos en ese instante.

   Como se calcula sobre intervalos, el resultado es el mismo lo corran el 1
   o el 20 de noviembre.
4. **Bajas de cuenta: seudonimizar, no borrar.**
   - Las filas de puntos NO llevan `on delete cascade`.
   - Antes del `deleteUser`, una función de la base reemplaza ese usuario,
     en todas las filas de puntos y suspensiones, por un **seudónimo
     aleatorio único de esa baja**, el mismo en todas sus filas. Así los
     DISTINCT siguen dando lo mismo.
   - Cierra sus tramos vigentes y no guarda nombre, avatar, correo ni
     relación con el id original.
   - En el ranking aparece como "Cuenta eliminada".
   - Hook: la ruta `/api/cuenta/eliminar` llama esa función antes de borrar.
     Un trigger en `auth.users` también sirve, pero se evita porque Supabase
     no recomienda depender de triggers sobre esa tabla [no verificado: lo
     confirma el plan].
   - Si la función falla, la baja **no se bloquea**: se borra igual y ese
     mes queda marcado "no reconstruible" en el registro técnico. El diseño
     prohíbe bloquear la baja.
5. **Purga sólo después de consolidar.**
   - Un tramo cerrado se puede purgar cuando todos los meses que lo
     necesitan están consolidados y además se cumplió su plazo de §5.
   - Los meses que lo necesitan son su mes de primera evaluación y,
     mientras siga vigente, el actual.
   - Nunca antes, aunque la purga corra.
6. **Consolidación.** Una función idempotente guarda el resultado del mes
   (`insert … on conflict do nothing`): puntos por autor o seudónimo,
   posición densa y nada de evaluadores. La disparan dos cosas, con el mismo
   resultado por el punto 3:
   - el primer pedido del ranking después del corte;
   - un job `pg_cron` mensual (§2.5).
7. **Operaciones en vuelo en el borde.**
   - `now()` en Postgres es el inicio de la transacción. Un voto cuya
     transacción empezó antes de `T(M)` y confirma después llevaría una
     marca anterior al corte.
   - La consolidación no corre antes de `T(M) + 15 min`.
   - Las funciones de voto tienen `statement_timeout` de pocos segundos,
     así ninguna transacción de voto puede cruzar esa ventana.
8. **Pruebas que exige (E8):**
   - cambios de voto, retiros, ediciones, ocultamientos, suspensiones, bajas
     de cuenta y corridas de purga **entre el corte y la primera consulta**;
   - una transacción de voto que cruza el corte;
   - cierre repetido;
   - verificar en todos los casos que el resultado consolidado es el mismo
     que si se hubiera consolidado exactamente en `T(M)`.
   - El caso de baja con falla de seudonimización queda marcado, no
     silencioso.

**Qué conserva y cuánto:**
- Tramos con identidad: sólo hasta consolidar el mes que los necesita (unas
  semanas).
- Seudónimos: sólo en tramos todavía no purgados.
- Resultado consolidado: puntos por autor (o "Cuenta eliminada"), sin
  evaluadores.

### 2.3 Paginación (corrige A3)

**"Recientes"**
- Orden estable por (primera publicación desc, id desc).
- Cursor por clave: la última pareja vista.
- Sin tope y sin snapshot: llega a todas.
- Lo publicado después de abrir la lista aparece al recargar.

**"Más útiles"**
- El orden cambia con cada voto, así que se pagina sobre un **orden
  congelado compartido**:
  - una fila por título y momento con la lista completa de ids visibles en
    orden Wilson, **sin tope**;
  - se reutiliza mientras tenga menos de 10 minutos;
  - no guarda nada del lector: ni id ni bloqueos.
- El cursor es (id del orden congelado, posición). "Cargar más" avanza la
  posición, así que llega a la última reseña sin importar cuántas haya.
- **Visibilidad en cada página.** La función devuelve sólo ids que *en ese
  momento* siguen visibles para ese lector: no retirados, no reemplazados
  por edición, no ocultos, autor no bloqueado por el lector.
  - Una página puede traer menos de cinco; la siguiente sigue desde la
    posición.
  - Nunca se devuelve texto de algo retirado aunque esté en el orden
    congelado: el orden guarda ids, no textos.
- **Sin ciclos de recarga.** El orden congelado vive 2 h desde su creación.
  - Si vence en medio de la lectura, la función crea uno nuevo, responde
    "orden actualizado" y la vista ofrece "Volver a empezar" una sola vez.
  - El nuevo vive otras 2 h, así que no puede repetirse en seguida.
  - Los ids ya mostrados se deduplican en el cliente.
- **Costo.** Una lectura ordenada por título cada 10 minutos como máximo
  (compartida entre lectores) y una consulta por página. Se mide en E6.
- **Contador visible.** Se calcula sobre lo visible para ese lector en el
  momento: puede diferir en uno o dos del total mientras se lee. Es
  aceptable y se documenta.

### 2.4 Confirmación de correo (corrige A4)

Hay tres cosas distintas que `f64a659` mezclaba:

1. **Recuperación de contraseña** (issue #22, `docs/ISSUES.md:337`):
   - es otro recorrido: Android, enlace de recuperación consumido;
   - no se demostró que afecte el alta ni la confirmación;
   - **no es dependencia** de este proyecto;
   - sólo se volvería relevante si una prueba del recorrido de confirmación
     reprodujera el mismo síntoma.
2. **Confirmación al alta (Confirm email de Supabase Auth):**
   - con la opción encendida, el alta envía el correo y `email_confirmed_at`
     se completa al usar el enlace;
   - **con la opción apagada, Supabase confirma implícitamente** y
     `email_confirmed_at` se completa sin que nadie haya demostrado
     controlar el buzón.
   - Fuente: https://supabase.com/docs/guides/auth/general-configuration
   - Cómo está Producción hoy, y desde cuándo: [no verificado].
3. **Prueba de posesión del buzón:** sólo la da un correo efectivamente
   usado (enlace o código).

**Propuesta.**
- **E0 (sólo lectura, con autorización):**
  - leer la configuración de Auth del panel;
  - contar, sin listar correos, cuántas cuentas tienen `email_confirmed_at`
    igual o muy cercano a `created_at` (indicio de autoconfirmación).
  - No se resetea ninguna cuenta ni se envía ningún correo.
- **Leer reseñas:** exige sesión, no correo. La lectura actual y el control
  nuevo de publicación son decisiones separadas.
- **Publicar, evaluar y denunciar:**
  - con Confirm email encendido desde el inicio: alcanza
    `email_confirmed_at`;
  - si E0 muestra autoconfirmación (total o de un período), las cuentas de
    ese período no tienen prueba de buzón y va la pregunta P4 al dueño.
    Alternativa técnica para esa pregunta: pedir un código de un solo uso al
    correo la primera vez que publican. Requiere enviar correos: no se hace
    sin autorización.
- Que el correo esté verificado no demuestra que sea una persona única
  (diseño §3.5): se mantiene.

### 2.5 Planificador (corrige A6)

- **Antecedente en el repo:** `sala-barrido`, job `pg_cron` de SQL puro cada
  minuto que llama a `public.sala_barrido()` (`009_salas.sql:808-815`), con
  `unschedule` previo idempotente. Sin Edge Function ni clave.
  `tmdb-sync-upcoming-daily` (`supabase/cron.sql`) es el otro patrón, vía
  Edge Function con clave.
- **Propuesta:** el mismo patrón que `sala-barrido`, con dos jobs nuevos
  independientes, en SQL puro y sin red:
  - **consolidación mensual:** día 1, 03:15 UTC = 00:15 en Argentina,
    después del margen de §2.2.7;
  - **purga diaria.**
  - Ninguno toca `sala-barrido` ni `tmdb-sync`, y el cron de Netflix no se
    reactiva.
- **Antes de programar nada (E0, sólo lectura):** inspeccionar `cron.job`
  en Producción y que `pg_cron` esté habilitado. Programar los jobs es un
  cambio en Producción: se autoriza aparte.
- **Si `pg_cron` no estuviera disponible**, la consolidación igual funciona
  por el disparo perezoso (§2.2.6). La purga no tiene sustituto
  equivalente: se detendría el lanzamiento hasta resolverla.

### 2.6 Otros detalles técnicos (sin cambios de fondo respecto de `f64a659`)

- **T1:** endpoint aparte con Bearer; `/api/title` no cambia, así que el
  AAB `4 (1.2.0)` no ve ni rompe nada.
- **T2:** el filtro se llama desde la ruta del servidor. La decisión se
  aplica con una función ejecutable sólo por `service_role`, que exige que
  la versión siga siendo la vigente. Patrón de `lib/sala/preparar.ts`.
- **T4:** interruptores en una fila de configuración, como
  `sala_config.activas`, no en variables de Vercel (que esperan al deploy
  siguiente).
- **T7:** normalización NFC, saltos de línea, controles y bidi como
  `invitacion.ts:36`, y bordes. El largo se cuenta en puntos de código. La
  misma regla en la base (`normalize(…, NFC)`, `char_length`), con banco
  compartido.
- **T8:** todo por POST, para no ampliar CORS.
- **T9:** Top Yumpers fuera del store de `sessionStorage`.
- **T10:** "Más útiles" por límite inferior de Wilson (z = 1,96), como
  propone Codex.

---

## 3. Filtro automático: opciones para español argentino

**Lo que se puede afirmar** (corrige la formulación absoluta de `f64a659`):
las APIs de moderación examinadas (OpenAI Moderation, Azure AI Content
Safety, Google `moderateText`, Amazon Comprehend, Perspective) **no tienen
categoría ni finalidad declarada** para estafa, phishing, spam o contactos
disimulados.
- Eso no prueba que nunca marquen uno de esos casos (un mensaje de estafa
  también puede ser acosador).
- Tampoco garantiza que un LLM con rúbrica los detecte.
- Por eso la cobertura se mide con el banco (§3.2) y se sostiene con reglas
  propias y revisión humana.

| Opción | Categorías declaradas | Estafa / spam / contactos | Español | Precio | Ciclo de vida | Veredicto |
|---|---|---|---|---|---|---|
| **Reglas propias** | URLs, acortadores, dominios ofuscados, emails, teléfonos AR, `wa`/`wsp`/`tg`/`ig`, `@usuario`, cripto/inversión/sorteo | Lo explícito; se evaden | Lo que se escriba | 0 | Propio | **Obligatoria**. Rechazo sólo para enlace o contacto claro; el resto, señal |
| OpenAI Moderation (`omni-moderation-latest`) | harassment, hate, sexual, sexual/minors, violence, self-harm, illicit | Sin categoría | Sin nota de idioma [no verificado] | Gratis | Vigente | Opcional; segundo encargado de tratamiento |
| Azure AI Content Safety | Hate, Sexual, Violence, Self-harm; Prompt Shields | Sin categoría nativa | Entrenado y probado en español | USD 0,375 / 1.000 registros; F0 5.000/mes | Vigente | Alternativa a la anterior |
| Google NL `moderateText` | 16 temas | Sin categoría ("Finance" es un tema) | Sí | Unidad de 100 caracteres; 50.000 gratis/mes | Vigente | Temas de cine disparan; no recomendada |
| Perspective API | Toxicidad | — | — | — | **Fin después del 31/12/2026** | Descartada |
| Amazon Comprehend | Toxicidad | — | **Sólo inglés** | — | — | Descartada |
| **Claude Haiku 5.5** | Lo que diga la rúbrica | Por contexto, sin garantía | Sin métrica publicada para rioplatense | §4 | Vigente (doc oficial, 21/10) | **Candidato principal** |
| gpt-5-nano | Rúbrica | Por contexto | — | §4 | **Marcado Deprecated en su página oficial** (fecha de apagado no corroborada) | **Retirado como candidato** para un lanzamiento nuevo |
| Otro modelo chico vigente de OpenAI o Google (Gemini Flash-Lite **pago**) | Rúbrica | Por contexto | — | A medir | **A verificar en E1** | Candidato de comparación si está vigente. El free tier de Gemini queda excluido: usa los datos para mejorar productos |
| Llama Guard / ShieldGemma | Taxonomías genéricas | Pobre en estafas locales [no verificado en detalle] | — | GPU | — | No entran en Vercel; descartados |

### 3.1 Configuración del candidato principal (corrige A5)

- **Esfuerzo y razonamiento son dos controles distintos.** En Haiku 5.5 el
  razonamiento adaptativo viene encendido y el esfuerzo por defecto es
  `medium`.
  - Bajar el esfuerzo a `low` **no** apaga el razonamiento; lo reduce.
  - Apagarlo exige `thinking: {type: "disabled"}` explícito, que sólo se
    acepta con esfuerzo `high` o menor.
  - Propuesta: `thinking: {type: "disabled"}` con esfuerzo `low`.
  - Verificar en el banco que la salida no trae tokens de razonamiento.
  - Fuente: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5
- **Para un candidato de OpenAI de la familia GPT-5 no se traslada esa
  configuración.** Sus niveles de razonamiento son
  `minimal`/`low`/`medium`/`high`, y no se asume un modo sin razonamiento.
  Sus tokens de razonamiento entran en el presupuesto como salida.
  Fuente: https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5
- **Salida estructurada** con esquema estricto, validada otra vez en el
  servidor: `{decision: publicar|retener|rechazar, categorias[],
  motivo_corto}`.
  - **Se quita `confianza`:** el número que el modelo declara no es una
    probabilidad calibrada.
  - Si hace falta un umbral, sale de las categorías y del banco, no del
    número autodeclarado.
- **El texto es un dato:**
  - va delimitado en el mensaje de usuario, nunca en el prompt de sistema;
  - sin herramientas;
  - nunca con id, correo ni historial.
- **Fallos:** timeout, salida inválida, refusal o presupuesto agotado dejan
  la reseña en `pendiente`. Nunca en `publicada`.

### 3.2 Banco de comparación (corrige la presentación de `f64a659`)

- **Para qué sirve:** compara opciones con los mismos casos. **No certifica
  seguridad** ni da una tasa de error de Producción.
- **Composición.** Textos inventados, sin datos de personas reales:
  - negativos difíciles **por categoría**, o sea textos benignos que se
    parecen a cada infracción:
    - trama criminal frente a estafa;
    - insulto a un personaje frente a acoso;
    - sinopsis sexual frente a contenido prohibido;
    - mención de plataforma o red frente a contacto;
    - cita violenta frente a amenaza;
  - positivos por categoría, con variantes de evasión;
  - inyecciones;
  - casos límite.
- **Separación:**
  - un conjunto de **desarrollo** para ajustar la rúbrica;
  - un conjunto **reservado**, que no se mira mientras se ajusta y se corre
    una sola vez al final. Los criterios se miden sobre el reservado.
- **Informe:**
  - resultado **por caso**, no sólo totales;
  - costo real tomado de `usage`, con razonamiento incluido si lo hubo;
  - latencia;
  - modelo y versión exactos.
- **Criterio de comparación propuesto (sobre el reservado):**
  - 0 maliciosos con enlace o contacto publicados;
  - ≥ 90 % de maliciosos retenidos o rechazados;
  - ≤ 10 % de benignos retenidos;
  - ninguna inyección cumplida.
- **Autorización.** Ninguna llamada externa se hizo ni se autorizó: correr
  el banco contra proveedores reales necesita P5.

---

## 4. Costos (corrige A5)

Tres números distintos que `f64a659` mezclaba:

- **Estimado:** cuentas con supuestos.
- **Medido:** todavía ninguno, sale de E1.
- **Presupuesto máximo:** tope que se configura y frena el gasto (P2).

**Supuestos del estimado.**
- **Análisis de reseña:** cada publicación y **cada edición** es un análisis.
  Los 100 / 1.000 / 10.000 del pedido ya incluyen las ediciones.
  - Por llamada: 1.200 tokens de rúbrica + ~200 de texto de entrada, ~80 de
    salida.
- **Análisis de nombre visible:** supuesto de 0,2 por análisis de reseña
  (nombres nuevos o cambiados de quien publica).
  - Por llamada: 1.200 de rúbrica + ~15 de nombre, ~60 de salida.
- **Reintentos:** promedio supuesto de 5 % de llamadas extra (supuesto, no
  dato).
  - **Cota:** como máximo 3 intentos por análisis (1 + 2 reintentos). Se
    toma el peor caso de que todos se facturen enteros.
- Sin razonamiento: §3.1. Si quedara activo, el costo sube sin cota
  conocida; por eso se mide.
- No incluye: impuestos sobre servicios digitales del exterior, revisión
  humana, Supabase, Vercel ni otros servicios.

**Claude Haiku 5.5** (USD 0,10 entrada / 0,50 salida por millón, prompts ≤
100K tokens; doc oficial 21/10):
- Reseña: 1.400×0,10/1M + 80×0,50/1M = **USD 0,00018** por llamada.
- Nombre: 1.215×0,10/1M + 60×0,50/1M = **USD 0,00015** por llamada.

| Análisis de reseña (incluye ediciones) | Estimado (×1,05 reintentos; + nombres) | Cota (3 intentos por análisis) |
|---|---|---|
| 100 | 105×0,00018 + 21×0,00015 = **USD 0,02** | 300×0,00018 + 60×0,00015 = **USD 0,06** |
| 1.000 | 1.050×0,00018 + 210×0,00015 = **USD 0,22** | 3.000×0,00018 + 600×0,00015 = **USD 0,63** |
| 10.000 | 10.500×0,00018 + 2.100×0,00015 = **USD 2,21** | 30.000×0,00018 + 6.000×0,00015 = **USD 6,30** |

- El caché de la rúbrica (mínimo 512 tokens en Haiku 5.5) puede bajar el
  estimado. Con pocas llamadas por hora el TTL de 5 minutos vence casi
  siempre, así que no se cuenta.
- **Presupuesto máximo propuesto (P2): USD 10 por mes**, en una fila de
  configuración con contador en la base. Cubre la cota de 10.000 análisis.
  Al agotarse, todo queda `pendiente` y el dashboard lo muestra.
- **Comparación con otros proveedores:** no se recalcula acá un candidato
  de OpenAI hasta elegir uno vigente (gpt-5-nano está marcado Deprecated).
  Su costo incluye tokens de razonamiento no acotados de antemano y sale
  del banco.

---

## 5. Retención

### 5.1 Del proveedor (corrige la simplificación de `f64a659`)

Una **clasificación de Yump** (rechazar o retener un texto) **no es** una
marca de abuso del proveedor. El proveedor aplica sus propias políticas y
sistemas, y Yump no sabe ni controla qué marca. La política de privacidad
tiene que describir los plazos del proveedor como posibles, no deducirlos de
las decisiones de Yump.

| Proveedor | Almacenamiento de respuestas / estado | Controles de abuso | Excepciones | Fuente |
|---|---|---|---|---|
| Anthropic (API) | Uso previsto: Messages sin archivos ni otros objetos guardados [que no exista otro almacenamiento: no verificado en esta sesión] | Entradas y salidas: borrado estándar dentro de 30 días | Si **los sistemas del proveedor** marcan el contenido por sus políticas de uso: entradas y salidas hasta 2 años, y los puntajes de clasificación con un plazo distinto (ver fuente). También obligaciones legales y acuerdos (ZDR por acuerdo) | https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data |
| OpenAI (API) | Objetos de la Responses API almacenados por defecto: usar `store: false` | Abuse monitoring: hasta 30 días por defecto. "Hasta 30 días" no es una garantía universal | Obligaciones legales; ZDR o abuse monitoring modificado con aprobación; el endpoint de moderación tiene su propio régimen | https://developers.openai.com/api/docs/guides/your-data |
| Gemini API | Pago: no se usa para mejorar productos. Free tier: sí, con posible revisión humana (**excluido**) | Pago: logs "por un período limitado" sin plazo publicado | ZDR no encontrado [no verificado] | https://ai.google.dev/gemini-api/terms |
| Azure AI Content Safety | No almacena el texto analizado | — | — | https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/content-safety/data-privacy |

### 5.2 Interna (revisa §3.6 del diseño)

La propuesta de Codex es razonable y **ningún plazo está validado
legalmente**. Desglose por dato. Los plazos son propuestas para P3.

| Dato | Propuesta | Validación de privacidad |
|---|---|---|
| Texto de la versión vigente | Mientras exista la reseña | No |
| Texto de versiones reemplazadas por edición | Se borra al confirmarse la versión nueva, salvo denuncia abierta | Sí |
| Texto rechazado o retirado | 30 días para pedir revisión; si hay revisión abierta, 30 días después de cerrarla | **Sí** |
| Texto borrado por su autor | Invisible al instante; purga en ≤ 30 días, salvo denuncia abierta | **Sí** |
| Votos de utilidad | Mientras exista la versión | Sí |
| Tramos de puntos (§2.2) | Hasta consolidar el mes que los necesita + plazo; seudonimizados con la baja | **Sí**: justificar la finalidad y el plazo corto |
| Denuncias | Hasta cerrar el caso + 30 días; el denunciado nunca ve quién denunció | **Sí** |
| Registro de decisiones | Sin texto; versión, decisión, categoría, versión de reglas y modelo; 12 meses; con la baja, sin `user_id` | **Sí** |
| Sanción activa | Id + motivo mínimo mientras rige; 6 meses después, sólo un contador; con la baja, se borra | **Sí** |
| Cierres consolidados | Puntos por autor o "Cuenta eliminada"; sin evaluadores | Sí |
| Hash de texto normalizado (reincidencia de spam) | Opcional, 90 días | **Sí**: dato seudónimo |
| Orden congelado de "Más útiles" (§2.3) | Sólo ids de reseñas, 2 h; sin datos del lector | No |
| Logs de aplicación | Nunca texto, nombre ni token | Verificar retención del plan de Vercel (D8) |
| Backups de Supabase | La purga no los alcanza hasta que roten | **Verificar plan y PITR (D8)** antes de escribir plazos |
| Copia en el proveedor | §5.1 | **Sí**: declarar y decidir si se pide ZDR |

**Qué tiene que validar alguien competente** (no es asesoramiento legal):
1. Transferencia internacional al proveedor (Ley 25.326, art. 12, y la
   normativa de la AAIP).
2. Cada plazo marcado, con su finalidad.
3. Los cambios a `/privacidad`:
   - nuevo encargado de tratamiento;
   - contenido visible para usuarios registrados;
   - perfil y ranking;
   - moderación automatizada con revisión humana;
   - plazos, backups y plazos del proveedor como posibles.
4. Términos comunitarios con aceptación versionada.
5. Rechazo automatizado con explicación, corrección y revisión humana.
6. Clasificación IARC y Data Safety con contenido generado por usuarios
   (`PLAY-STORE.md:340-342`).

---

## 6. Entregas pequeñas, con criterios de auditoría

Cada entrega es una rama con su informe. **Ninguna arrastra la autorización
de la anterior.** Todavía no es el plan.

| # | Entrega | Contenido | Criterios de auditoría (Codex) |
|---|---|---|---|
| E0 | Verificación de partida (sólo lectura, P5) | `user_reviews`: filas, dependencias, policies y grants efectivos. Privilegios por defecto de `public`. `cron.job` y `pg_cron`. Configuración de Auth (Confirm email) y conteo de autoconfirmadas sin listar correos (§2.4). Plan, backups/PITR y región de Supabase. Retención de logs de Vercel | Cada dato con su tipo de evidencia; nada que escriba; ningún correo ni dato personal en el informe |
| E1 | Banco del filtro (P5) | §3.2: desarrollo + reservado; adaptador con proveedor simulado; corrida real sólo con autorización y tope | Resultados por caso sobre el reservado; costo medido con `usage`; configuración de razonamiento verificada; ciclo de vida del modelo comprobado ese día; presentado como comparación, no certificación |
| E2 | Esquema y permisos | Migración aditiva 011 + rollback no destructivo (§2.1, §2.2: tablas, funciones, invariantes, intervalos); cierre de la lectura anónima de `user_reviews` según E0 | Matriz rol × objeto × operación (§2.1.5) en Postgres real con PostgREST, incluido REST directo; carreras de límite; privilegios por defecto revocados; `search_path` fijado en cada función definer |
| E3 | Escritura sin filtro externo | Funciones de crear, editar y borrar; normalización (T7); ruta POST; filtro = reglas + "sin mecanismo → pendiente" | Una publicada editada queda invisible y sus votos se cortan en una transacción; escritura idéntica = no-op; carreras crear×2 y editar×borrar; nada se autopublica |
| E4 | Filtro conectado (después de P1/P2) | Adaptador, reintentos con cota de 3, presupuesto, decisión por `service_role` con versión vigente | Respuesta atrasada no publica otra versión ni resucita; timeout, inválido, refusal y presupuesto agotado → `pendiente`; sin texto en logs; sólo el texto viaja |
| E5 | Moderación | `/admin/moderacion` | `adminDeToken` + `is_admin_mfa()` en API **y** base; decisiones atadas a versión |
| E6 | Lectura y utilidad | T1, acordeón, paginación (§2.3), votos, bloqueo | Anónimo sin datos comunitarios por ninguna vía; `/api/title` idéntico; recorrer más de 200 reseñas sin repetir ni saltear; retirado entre páginas nunca devuelto; vencimiento del orden sin ciclo |
| E7 | Perfiles y nombre | Proyección, ruta nativa, nombre aprobado (§2.1.3) | Sólo campos de la proyección; update directo del nombre no publica nada sin control |
| E8 | Top Yumpers | §2.2 y selector ya decidido | Pruebas de §2.2.8; Top de plataformas público intacto |
| E9 | Retención y purga (después de P3) | Jobs §2.5 con autorización; purga por dato | La purga nunca toca tramos sin consolidar; reloj controlado; registro sin texto |
| E10 | Integración y lanzamiento | Textos legales del dueño, interruptores, Android: bundle nuevo con los arreglos de Yumpeá ya aprobados, en el mismo AAB | Prueba en teléfono; rollback por interruptor; nada de migración, deploy, versión ni AAB sin autorización de esa entrega |

**Orden:**
- E0 primero.
- E1 en paralelo con E2 y E3.
- E4 después de E1 y de P1/P2.
- E9 después de P3.
- E10 después de los textos legales.

---

## 7. Cambios que esta revisión PROPONE al diseño de Codex

No están aprobados. El diseño original queda como está hasta que Codex y el
dueño los acepten.

| Diseño | Dice | Propuesta |
|---|---|---|
| §3.3 | "Cursor ligado a título, orden y versión de conjunto… detectar revisión obsoleta y ofrecer recarga desde el principio" | Reemplazar por §2.3: cursor por clave en "Recientes" y orden congelado compartido en "Más útiles". La recarga queda sólo al vencer el orden, una vez |
| §3.4 | "Cierre mensual idempotente y reproducible… definir corte consistente" | Concretarlo con §2.2: tramos con validez temporal, cómputo al corte, seudonimización con la baja, purga sólo después de consolidar, margen de 15 min |
| §3.5 | Correo confirmado para publicar/evaluar/denunciar | Mantener, precisando §2.4: `email_confirmed_at` sólo prueba el buzón si la confirmación estaba encendida al alta |
| §3.5 | Proveedor no elegido | Haiku 5.5 como candidato principal con razonamiento desactivado (§3.1); gpt-5-nano retirado por Deprecated; banco como comparación |
| §3.2 / §6 | Autorización efectiva en servidor/base (sin mecanismo concreto) | §2.1: sin grants de tabla, funciones definer acotadas, invariantes en la base, matriz de permisos |
| §5 | Entregas 0–4 | Entregas E0–E10 (§6) |

---

## 8. Lo que no se hizo o no se pudo comprobar

- **Producción:** no se consultó. Todo lo "efectivo" queda para E0.
- **Proveedores:** no se probó ninguno; no se crearon cuentas ni claves.
- **Fuentes:** precios y términos de las páginas oficiales del 21/10/2026.
  Lo marcado [no verificado] no se confirmó.
- **Validación legal:** ninguna.
- **gpt-5-nano:** su fecha de apagado no está corroborada; sólo consta la
  marca Deprecated en la página del modelo:
  https://developers.openai.com/api/docs/models/gpt-5-nano

## Fuentes (consultadas el 21/10/2026)

- PostgreSQL `CREATE FUNCTION` (security definer/invoker): https://www.postgresql.org/docs/current/sql-createfunction.html
- Supabase, configuración de Auth: https://supabase.com/docs/guides/auth/general-configuration
- Anthropic, Haiku 5.5: https://platform.claude.com/docs/en/models/haiku-5-5/overview y https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5
- Anthropic, precios: https://claude.com/pricing
- Anthropic, structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Anthropic, retención: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- OpenAI, Moderation: https://developers.openai.com/api/docs/guides/moderation
- OpenAI, datos y retención: https://developers.openai.com/api/docs/guides/your-data
- OpenAI, GPT-5 y razonamiento: https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5
- OpenAI, gpt-5-nano: https://developers.openai.com/api/docs/models/gpt-5-nano
- OpenAI, precios: https://developers.openai.com/api/docs/pricing
- Perspective (aviso de baja): https://perspectiveapi.com/
- Azure Content Safety: https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/content-safety/data-privacy, https://learn.microsoft.com/en-us/azure/ai-services/content-safety/region-availability, https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/harm-categories
- Google `moderateText`: https://docs.cloud.google.com/natural-language/docs/moderating-text y https://cloud.google.com/natural-language/pricing
- AWS toxicidad: https://docs.aws.amazon.com/comprehend/latest/dg/trust-safety.html
- Gemini: https://ai.google.dev/gemini-api/docs/pricing y https://ai.google.dev/gemini-api/terms
- Google Play, contenido generado por usuarios: https://support.google.com/googleplay/android-developer/answer/9876937?hl=es
