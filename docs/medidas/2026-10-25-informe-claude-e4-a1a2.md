# E4 local: corrección A1/A2 de la auditoría — 25/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`9340da9`. Corrige únicamente A1 y A2 de
`docs/medidas/2026-10-25-auditoria-e4-9340da9.md` (copiada sin cambios del
checkout principal; SHA-256 `9f7c9170…`, igual al original). Sólo Supabase
local, la app local y cuentas ficticias. Sin E5, filtro, Producción, E0,
servicios externos, gastos, push, merge, deploy ni AAB.

## A1 — Restaurar desde el panel

**Qué faltaba.** Retirar resuelve las denuncias y la versión sale de las dos
colas. El Registro no abría nada, así que no había forma visible de corregir un
retiro equivocado.

**Qué se agregó.**
- Base (016, dos lecturas nuevas, sólo `authenticated`, `exigir_admin()` en la
  primera línea, sin locks):
  - `comunidad_admin_retiradas(p_limite, p_despues)`: versiones `oculta` que
    siguen siendo la vigente de una reseña viva, de la más reciente a la más
    vieja, con cursor `{t, v}`;
  - `comunidad_admin_version(p_version)`: la situación ACTUAL de una versión
    (`eliminada` si ya no existe); sin texto si la reseña está borrada.
  - Auxiliares internas: `votos_recuperables` (exactamente los votos que
    `reabrir_tramos` reabriría: positivos, vigentes, con tramo previo en esa
    versión y ninguno abierto) y `ficha_version`.
- Panel:
  - pestaña **Retiradas** entre Denuncias y Cuentas, con texto, motivo y fecha
    del retiro, votos que vuelven a contar, autor y «Restaurar»;
  - en el **Registro**, «Ver situación actual» en cada decisión sobre una
    versión. Muestra la situación de hoy y ofrece Restaurar sólo si sigue
    retirada; si no, dice por qué no vuelve (la editó, la borró, se dio de
    baja, ya está visible). Se descarta al recargar el registro;
  - aviso previo de restaurar: «Vuelven a contar N votos de utilidad que ya
    tenía, en su mes original; no se suma ninguno nuevo y los meses ya
    cerrados no cambian», con N de la base;
  - una decisión confirmada saca el caso de las listas en el acto. En el
    recorrido, la recarga del servidor de desarrollo tardaba unos segundos y la
    versión restaurada seguía con su botón activo. No era un riesgo (la base
    habría devuelto conflicto), pero confundía.
- Restaurar sigue siendo `comunidad_admin_decidir('restaurar', …)`, sin
  cambios: relee con todo bloqueado y rechaza reemplazada, borrada o eliminada.

## A2 — Historial de denuncias y bajas simultáneas

**Causa.** `limpiar_participante` copiaba las denuncias RECIBIDAS con la foto
de su sentencia, sin bloquearlas, mientras la baja de quien denunció las
borraba sin confirmar. Al confirmar las dos, quedaba la copia.

**Corrección.** Un solo paso nuevo en los locks de la baja, al final
(después de votos y tramos, antes de la marca):

```sql
perform 1 from comunidad.denuncias
 where denunciante_participante = p_part or autor_participante = p_part
 order by id for update;
```

- Si llega segunda la baja del autor: espera a la del denunciante y relee. La
  denuncia ya no existe y no se copia.
- Si llega segunda la del denunciante: espera a la del autor y borra su
  historial en una sentencia posterior, con otra foto, que ya ve la copia
  recién confirmada.
- Las dos bajas toman el mismo conjunto en el mismo orden (por id). Nadie toma
  esas filas antes de votos y tramos: las decisiones del admin y la denuncia
  nueva las tocan después de la marca, con la versión ya bloqueada. No se usó
  purga ni FK.
- Ninguna función nueva ni permiso cambiado: `limpiar_participante` sigue sin
  `EXECUTE` para nadie.

**Regresión determinista** (`pruebas-admin.mjs`, funciones reales, dos
sesiones psql, barreras y esperas observadas en `pg_stat_activity`):
1. La secuencia de la auditoría (confirma primero quien denunció).
   - **Antes de la corrección falla:** historial de b = 1.
   - **Después pasa:** 0.
2. El orden inverso (confirma primero el autor): pasa antes y después.
3. Denuncias cruzadas (cada uno denunció al otro): sin deadlock, ningún
   historial de los dos queda.

En 1 y 2, la denuncia de una cuenta **activa** queda como `cerrada_por_baja`.

## Suspensión: documentación conciliada

El diseño §2.2.2 decía que suspender cierra tramos. Agregué una nota de
conciliación con el efecto exacto de la implementación:
- la suspensión es el intervalo `[desde, hasta)`;
- el par no cuenta en un mes si una suspensión de cualquiera de los dos rige
  antes del corte de ese mes;
- levantarla antes del corte no excluye ese mes;
- no se reabre nada.

En el plan, E7 suma un gate con el cómputo real que cubre ese efecto y la
igualdad exacta en el corte. El ranking no se tocó.

**La decisión del texto denunciado sigue pendiente (P3).**
- No se acepta la opción A, no se implementan B ni C y no se fija ningún plazo.

## Verificación

**Reales, contra la base local** (`docs/medidas/2026-10-25-e4-a1a2-salidas.txt`):

| Prueba | Resultado |
|---|---|
| A2 antes de corregir | 1 falla (la de la auditoría) |
| A2 después | 3/3 |
| `pruebas-admin` completa, con la ruta en el servidor local | 38/38 |
| up/down/up de 016 | 5/5 |
| Permisos | 28/28 |
| Baja | 26/26 |
| Invariantes | 85/85 |
| Moderación (E3b) | 46/46 |

- `pruebas-admin` suma 6 pruebas: 3 de A1 y 3 de A2. Los tres casos de A1:
  - retirar → sale de las colas → Retiradas y Registro la encuentran →
    restaurar: mismos votos, mes original, sin duplicar;
  - paginación sin repetir, con `no_autorizado` para AAL1 y usuario común;
  - reemplazada, borrada y baja: no figuran y no resucitan.
- Permisos de las funciones nuevas:
  - el catálogo exige `security definer`, `search_path` vacío y `EXECUTE`
    sólo para `authenticated`;
  - por RPC directo: anon, usuario común, admin AAL1 y `service_role`
    reciben 42501 en las 13 funciones; admin AAL2 recibe 200.
- No repetí escritura (E3a) ni concurrencia (E2c): no cambió ninguna función
  de la que dependen.

**Unitarias y tipado (preliminares):**
- `npm test`: 2460 pasan, 0 fallan, 16 omitidas;
- unitarias focalizadas, después del último cambio del panel: 82/82;
- `tsc`: 0 errores.

**Recorrido real en navegador local** (sesión AAL2 real con TOTP enrolado
por script; `docs/medidas/2026-10-25-e4-a1a2-recorrido/`, 8 capturas):
- escritorio:
  - Denuncias → Retirar → recargar → Retiradas la muestra con «2 votos de
    utilidad vuelven a contar» → Restaurar, con ese aviso;
  - con el diálogo abierto, el autor editó la retirada: «No se aplicó: la
    versión cambió (ahora: reemplazada por una edición)»;
  - Registro → «Ver situación actual» en reemplazada, borrada y eliminada
    por baja: sin botón y con el motivo; en la retirada vigente, Restaurar;
- 375 px: Denuncias → Retirar → recargar → Retiradas → Restaurar, sin
  desplazamiento horizontal;
- en la base: la versión restaurada dos veces tiene 2 tramos abiertos y 4
  cerrados, todos del mes original, y 4 decisiones. Las reemplazadas y la
  borrada no cambiaron.

**Simulado:** la edición concurrente del autor la disparó un script durante
el diálogo. Fue una edición real con la función de producto, pero el momento
lo eligió el script.

**Pendiente:** teléfono real, Android, tema claro, lector de pantalla y
Producción.

**Limpieza:**
- Borré sólo mis cuentas, participantes, decisiones e historial.
- La base quedó con 6 participantes, 2 versiones, 42 cuentas, 0 locks y las
  dos suspensiones ajenas intactas.
- Interruptores, publicación y muestreo apagados; límites como estaban.
- El `SELECT` local de `profiles` se concedió sólo durante las corridas y
  quedó revocado.
- Servidor detenido.

## Archivos

- `supabase/migrations/016_comunidad_admin.sql` y su down (dos drops más);
- `lib/comunidad/admin-nucleo.ts` (vistas `retiradas` y `version`, aviso de
  restaurar, `accionesRetirada`, `motivoNoRestaurable`) y
  `admin-moderacion.ts`;
- `app/admin/moderacion/page.tsx` y `app/globals.css`;
- pruebas: `admin-nucleo.test.ts`, `pruebas-admin.mjs`, `pruebas-permisos.mjs`
  y `up-down-up-016.mjs`;
- documentos: diseño §2.2.2, plan (E4 y E7), `MANTENIMIENTO.md` y `ESTADO.md`.
