# E7 local: Top Yumpers mensual — 27/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`43117a2`. Autorizada por el dueño, sólo en local. Sólo Supabase local, la app
local y datos ficticios. Sin cron ni purga (E8), retenciones, P3, filtro,
reservados, Producción, E0, servicios externos, gastos, push, merge, deploy,
AAB ni versiones de Android.

**Cierre de E6.** Copié sin cambios la auditoría de Codex
`docs/medidas/2026-10-27-auditoria-e6-a1a2-43117a2.md` (SHA-256 `be35c709…`,
igual al original). E6 queda cerrada en local y conservo sus pendientes de
integración: `/api/title` en ejecución, TMDB, tema claro, teléfono/Android y
lector de pantalla.

## Qué hace E7

**`020_comunidad_top.sql` + down.**
- **`comunidad.puntos_al_corte(mes, corte)`:** el cómputo de §2.2.2 en una
  sola consulta. Cuenta los pares (evaluador, autor) **distintos** que cumplen
  tres condiciones:
  - el tramo es de la primera positiva del mes;
  - el tramo rige antes del corte;
  - **ninguna suspensión** del evaluador ni del autor rige antes del corte
    (misma condición `desde < T` y `T ≤ hasta`).

  Publicar no da puntos y un negativo no resta. Ediciones, retiros,
  restauraciones y bajas llegan por los intervalos de los tramos. La
  suspensión es un intervalo y no cierra tramos (conciliación del 25/10).
- **`comunidad.consolidar_mes(mes)`:** sigue el protocolo pedido.
  1. Si el mes no cerró, `mes_abierto`.
  2. Comprobación rápida **sin lock**: un mes consolidado no toma el
     exclusivo.
  3. `proto_corte_exclusivo()` real (READ COMMITTED, ningún otro lock).
  4. Nueva comprobación.
  5. Mes y resultados en **una** sentencia, con instantánea posterior al
     lock.

  Guarda posición densa y puntos. Un autor huérfano se guarda **sin id**. Un
  mes consolidado no se recalcula.
- **`comunidad_top_yumpers(mes)`:** sólo `authenticated`, con el lector de
  `auth.uid()`. Usa el último mes cerrado y consolida en la primera lectura.
  - Proyección: posición, puntos y, para cuentas activas, id de participante,
    nombre comunitario y avatar del catálogo (E6), más "propio" y la posición
    propia.
  - "Cuenta eliminada" y "Usuario bloqueado" (para quien lo bloqueó) van sin
    id, nombre ni avatar.
  - Meses válidos: cerrados y desde enero de 2026.
- **`comunidad_top_yumpers_activo()`:** sólo `service_role`; la ruta lo usa
  sin sesión para mostrar o no el selector.

**Ruta e interfaz.**
- **Ruta:** `GET /api/comunidad/top-yumpers[?mes=YYYY-MM]`, con Bearer y
  `private, no-store`. Sin sesión responde 401 con sólo `{resultado, activo}`.
- **Selector en `/top`:**
  - "Top semanal plataformas" es el componente de siempre: público, manual,
    con su toggle Películas/Series y su snapshot.
  - "Top Yumpers" es otra vista (`components/comunidad/TopYumpers.tsx`), sin
    toggle, sin `sessionStorage` y sin `useApi` ni `/api/top`.
  - El selector aparece sólo con el módulo y el Top Yumpers encendidos.
    Apagados, `/top` es exactamente el de antes.
- **Estados:** carga, error con reintento, apagado, vacío e invitación sin
  sesión.
- **Protección:** `key` por cuenta y frontera de E3b. Los nombres enlazan al
  perfil de E6.

## Hallazgo propio, corregido: un lock implícito en la consolidación

Con una FK de `top_resultados.participante_id` a `participantes`, el INSERT de
la consolidación tomaba **KEY SHARE** sobre la fila de cada autor. En B8 se
cerraba este ciclo:
- la red de seguridad de Auth tiene la fila del participante y pide el K_CORTE
  compartido;
- la consolidación tiene el exclusivo y pedía esa fila.

Postgres abortó la consolidación **5 de 5 veces**. Las invariantes de B8
igual se cumplían: el reintento de la lectura consolidaba. Pero el contrato
dice que la consolidación toma K_CORTE y **ningún otro lock**.

Saqué la FK. Los huérfanos ya se guardaban sin id, y un id que deje de existir
(purga de E8) se lee como cuenta eliminada. Después del cambio: **0 deadlocks
en 5 de 5 corridas**, y B8 termina con la consolidación primero y Auth
después. Una prueba unitaria fija que la tabla no tenga esa FK.

## Pruebas

**Reales** (`docs/medidas/2026-10-27-e7-salidas.txt`):

| Prueba | Resultado |
|---|---|
| `pruebas-top` (nueva) | 10/10 |
| `pruebas-top-concurrencia` (nueva), **cinco corridas seguidas** | 6/6 en cada una (antes del cambio de la FK, también 6/6 ×5, con la consolidación abortada en B8) |
| up/down/up de 020 | 5/5 (el volcado sin 020 es idéntico al del cierre de E6) |
| Permisos (inventario con las dos funciones y las dos tablas) | 29/29 |
| Unitarias nuevas (`top-yumpers.test.ts`) y relacionadas (Top manual, CORS, db-local, guardas locales) | 55/55 |
| `npm test` completo, tras la última corrección | 2509 pasan, 0 fallan, 16 omitidas |
| `tsc` | 0 |

**Qué cubren:**
- **Fórmula:**
  - dos positivos de la misma persona al mismo autor suman 1;
  - publicar no suma; un negativo no resta;
  - retirar o pasar a negativo dentro del mes deja 0;
  - otro mes no cuenta;
  - con empate, la posición es densa.
- **Caso 11, igualdad exacta, 14 fronteras** con su par propio. Cada una
  coincide en lo consolidado y en el cómputo exacto:
  - tramo que empieza y que termina, en `T(M)` y a 1 µs de cada lado;
  - suspensión del **autor** que empieza y que termina;
  - suspensión del **evaluador** vigente al corte y levantada antes.
- **Suspensión como intervalo:** la vigente al corte excluye el par y la
  levantada antes lo cuenta. Los tramos siguen **abiertos**: suspender no los
  cierra.
- **Caso 10:** entre el corte y la primera consulta ocurren una edición, un
  retiro por moderación, una suspensión y bajas de autor y evaluador.
  - El mes no cambia.
  - Restaurar antes del corte cuenta; restaurar después, no.
  - La baja se guarda sin id y se lee como "Cuenta eliminada".
  - Un cierre repetido no recalcula ni cambia la marca.
- **Reproducible:** un voto con marca del mes que llega después de consolidar
  no cambia lo guardado, aunque el cómputo de hoy sí lo vería.
- **Casos 6 y 7, con sesiones reales y esperas observadas:**
  - un voto con el compartido tomado antes del corte que confirma mientras la
    consolidación espera cuenta;
  - con la consolidación calculando, un voto posterior al corte espera el
    compartido y no entra;
  - con la consolidación esperando, un voto nuevo queda en cola detrás de
    ella.
- **50 lecturas concurrentes después del corte:**
  - un solo cálculo y la misma respuesta;
  - 50 más con un K_CORTE compartido retenido se resuelven **sin pedir el
    exclusivo** (≈110–220 ms);
  - un mes sin consolidar, en cambio, sí lo espera.
- **B8 real:** voto de otra cuenta en vuelo, `consolidar_mes` esperando y
  borrado de Auth sin paso 1.
  - Los tramos quedan cerrados con **una** marca y el participante sin
    `user_id`.
  - La consolidación termina y coincide con el cómputo exacto.
- **Permisos y proyección:**
  - anon y `service_role` no leen;
  - funciones internas y tablas sin grants;
  - el interruptor es sólo de `service_role`;
  - mes abierto, futuro o anterior a 2026: 400;
  - la proyección no lleva `user_id`, correo, nombre privado ni semilla.
- **Bloqueo:** quien bloqueó ve "Usuario bloqueado" con posición y puntos;
  otro lector ve al autor normal.
- **Ruta:** sin sesión 401 mínimo; con sesión 200 privado; mes inválido 400;
  cada interruptor apagado da `{activo:false}`.
- **Top manual intacto:** `lib/top-solo-manual.test.ts` en verde. Una prueba
  fija que no comparten fuente, caché ni `sessionStorage`.

**Navegador local** (9 capturas en `docs/medidas/2026-10-27-e7-recorrido/`):
- **Sin sesión:** el selector y la invitación.
- **Con sesión**, sobre el último mes cerrado real (septiembre):
  - el ranking con "Cuenta eliminada", "Usuario bloqueado" y la posición
    propia;
  - del nombre al perfil (clic real);
  - el error con reintento;
  - el vacío (simulado).
- **375 px:** las mismas vistas y la vuelta a plataformas con su toggle.
- **Interruptores apagados:** `/top` como antes.

## Simulaciones y fixtures

- **Reloj de las marcas:** `scripts/comunidad/solo-local-reloj.sql` reemplaza
  `proto_marca()` (la definición vigente, de 015) por una que devuelve el
  instante fijado.
  - Así votos, retiros, ediciones, moderación, suspensiones y levantamientos
    **reales** caen en meses pasados y exactamente en `T(M)` o a 1 µs. Es lo
    que prevé el plan ("marcas forzadas por solo-local.sql").
  - Se instala y se quita en cada corrida. La definición de `proto_marca`
    queda **idéntica** (md5 comparado) y no es una migración: la guarda local
    lo impide.
  - La baja usa su `clock_timestamp()` real.
- **En el navegador:** el error de red (interceptor de `fetch`) y el vacío
  (respuesta reescrita en el cliente).
- **Mes del recorrido:** septiembre de 2026 es real. Sus votos se marcaron en
  septiembre con el reloj, quitado antes de navegar.

## Limitaciones

- **Con la consolidación esperando:** la consolidación no deja de ser
  serializante. Una lectura que llega mientras el primer cálculo espera el
  exclusivo también espera (`lock_timeout` de 10 s). Es lo que fija el
  contrato para el primer pedido del mes.
- **Ranking de 50:** la lectura devuelve las primeras 50 filas más la
  posición propia. No pagina.
- **Sin nombre del título** en el perfil: viene de E6, porque es un dato de
  TMDB.
- **Ya consolidados:** quedan guardados hasta la purga de E8, que no se
  programó.
- **Sin probar:** consolidar meses de 2026 anteriores al despliegue (darían
  rankings vacíos), Android, tema claro, lector de pantalla y Producción.

## Limpieza

- Borré sólo mis cuentas, participantes, reseñas, votos, tramos, decisiones y
  los meses consolidados de prueba (verificados libres al empezar).
- Quité el reloj y el esquema `solo_local`.
- La base quedó como al empezar:
  - 6 participantes, 2 versiones, 42 cuentas y 2 suspensiones;
  - 0 tramos, evaluaciones, órdenes, locks, decisiones y meses consolidados;
  - límites 5/10/100/10/3/50;
  - módulo, publicación, Top Yumpers y muestreo apagados;
  - `SELECT` de `profiles` revocado;
  - 020 aplicada.
- Detuve el servidor y borré la sesión del navegador. Un intento fallido de
  preparación del recorrido (correo con tilde) dejó una cuenta y los
  interruptores encendidos: los borré antes de repetir.
