# Informe de Claude para Codex: corrección A1 de E2c (24/10/2026)

Rama `feat/resenas-reglas`, worktree `wt-resenas-comunidad`. Todo corrió sólo
contra `supabase start`, con cuentas ficticias. No hubo Producción, E0,
push, merge, deploy ni AAB. E3a no se empezó.

**Qué pide la auditoría:** sólo esta corrección.

## Commits

| Commit | Qué |
|---|---|
| `7b33702` | Regresión de actores cruzados, que falla contra la 013 de `a306cb8` |
| `b4aa75b` | Corrección en 013 (+ down) y ajuste de up-down-up |
| (este) | Copia de la auditoría (SHA-256 `20e341a0…`), salidas, este informe, `ESTADO.md`, plan y la precisión en el informe de E2c |

## Causa

`resolver_participante` (012) terminaba con:

```sql
select id into v_id from comunidad.participantes where user_id = p_uid for update;
```

`proto_cuenta`, el paso 1, la llama. Así cada operación salía del paso 1
reteniendo **la fila de su propio actor**, y recién en el nivel 2 pedía el
conjunto ordenado. Con A evaluando la reseña de B y B la de A pasa esto:
1. A retiene la fila de A y pide la de B;
2. B retiene la fila de B y pide la de A;
3. Postgres aborta una con 40P01.

El guardián de niveles no lo veía porque el lock estaba escondido dentro del
paso 1.

**Comprobado en la base, antes de corregir.** Un tercero intentó `FOR UPDATE
NOWAIT` sobre los dos participantes con las dos sesiones paradas después del
paso de cuenta, y obtuvo `A=bloqueada, B=bloqueada`. Después vino el
deadlock. Pasó en **3 de 3** corridas (`e2c-a1-salidas.txt`, "ANTES").

## Corrección

013 redefine `resolver_participante` **sin `FOR UPDATE`**: sólo lee el
participante. Hashes: 013 `19266d36…`; down `2313f5ae…`.

**Por qué alcanza sin el lock de fila.** `K_CUENTA` (consultivo, por cuenta)
se toma antes de leer y se retiene hasta confirmar, y cubre todo lo que daba
el lock:
- **Marcador:** se relee con `K_CUENTA` tomado (B2, B3b).
- **Serialización por cuenta y creación de identidad:** dos operaciones de
  la misma cuenta se excluyen, así que no se pueden crear dos participantes
  ni cambiar el vínculo en el medio.
- **Baja:** `aplicar_baja` toma `K_CUENTA` antes de bloquear la fila (B3a,
  B4).
- **Cancelación con sanción (B14):** la lógica no cambió.

**Bloqueos implícitos revisados en el paso 1:**
- el INSERT de un participante nuevo retiene su propia fila, invisible para
  los demás hasta confirmar;
- ese INSERT toma un `KEY SHARE` sobre su fila de `auth.users` (FK);
- con sanción copiada, el INSERT de la suspensión toma `KEY SHARE` sobre ese
  mismo participante nuevo;
- la lectura del marcador no toma locks de fila.

Ninguno toca filas de otro actor. Las FK de votos, tramos y contadores
toman `KEY SHARE` sobre participantes que ya se bloquearon en el nivel 2.

**Qué no cambia.** La excepción documentada de E2b sigue igual: un borrado
de Auth por fuera de la ruta toma la fila antes que `K_CUENTA` (B8b, B8c).

**Por qué en 013 y no en 012.** Así E2b queda como se auditó. 013_down
restaura **literalmente** la definición de 012; está comprobado con un diff
del cuerpo contra 012 y con el volcado.

## Prueba antes y después

La regresión `cruce · …` (`pruebas-concurrencia.mjs`), en este orden:
1. A y B tienen cada uno una reseña;
2. cada sesión hace `proto_cuenta` y se para en una barrera;
3. un tercero comprueba las filas;
4. se sueltan las dos a la vez: votar pide `proto_participantes([actor,
   autor])` y sigue el protocolo hasta la marca.

| | Filas tras el paso de cuenta | Resultado | Corridas |
|---|---|---|---|
| Antes (013 de `a306cb8`) | A=bloqueada, B=bloqueada | `deadlock detected` | 3/3 fallan |
| Después (`b4aa75b`) | A=libre, B=libre | Las dos confirman, sin 40P01 ni CB002; cada una con su voto y su tramo abierto, intervalos sanos | 3/3 pasan |

## Otras corridas, en secuencia

Todas con la corrección aplicada y el observador persistente:

| Corrida | Resultado |
|---|---|
| up/down/up | **15/15**. Con 013: `35aed9fc…`; sin 013: `49e76e46…`, idéntico al de E2b |
| `pruebas-baja.mjs` | **26/26**. Usa `resolver_participante` en B2, B3a/b, B10 y B14. El servidor local estuvo levantado sólo para esta corrida (B13) y después se detuvo |
| `pruebas-concurrencia.mjs` | **21/21 en cinco corridas seguidas**, con la regresión incluida; limpieza `0|0|0|0` en cada una |

En up/down/up, la prueba de 013 se ajustó: su down ahora **vuelve a poner**
la definición de 012, así que lo único que puede agregar son líneas de esa
definición, incluida la del `FOR UPDATE`.

No volví a correr `tsc` ni `npm test`: no cambió nada de TypeScript ni de
la app, sólo SQL y scripts `.mjs`, que no cubren. Tampoco repetí E2a ni
moderación.

## Víctima del deadlock deliberado (precisión pedida)

En las cinco corridas de E2c (`a306cb8`), la víctima de la prueba "una
sesión fuera del protocolo…" fue la sesión fuera de orden. En las cinco de
esta corrección fue la sesión fuera de orden en **4** y la sesión **en
orden** en **1** (corrida 4). **No hay garantía** de qué sesión aborta
Postgres, y la prueba acepta cualquiera de las dos: lo que fija es que
aborta exactamente una y que la abortada no deja nada. El informe de E2c
quedó corregido con esa precisión.

## Límites

- **Todo sigue siendo preliminar.** Las operaciones (votar, retirar,
  editar, suspender, consolidar) son fixtures sobre las primitivas reales y
  no validan `comunidad_votar` (E3a), E4 ni `consolidar_mes` (E7). Gates sin
  cambios.
- **Lo que el guardián no ve:** un `FOR UPDATE` escrito a mano por fuera de
  las primitivas. Este hallazgo fue justamente un lock "a mano" dentro de
  una función compartida. Para E3a en adelante conviene un inventario
  automático de los `for update` del esquema `comunidad` y de su nivel. No
  lo agregué porque no se pidió y sería ampliar el alcance.
- **Base local compartida.** Tiene la 013 corregida. Las cuentas de estas
  corridas se limpiaron. Siguen las 34 cuentas `@comunidad.test` antiguas de
  la batería de permisos de E2a, que no toqué.
- **Servidor de la app:** detenido.
