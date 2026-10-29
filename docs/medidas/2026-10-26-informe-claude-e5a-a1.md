# E5a local: corrección A1 de la auditoría — 26/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`b7ba962`. Corrige sólo A1 de `docs/medidas/2026-10-26-auditoria-e5a-b7ba962.md`
(copiada sin cambios del checkout principal; SHA-256 `7ca736ed…`, igual al
original). Sólo Supabase local, la app local y cuentas ficticias. Sin E5b, E6,
filtro, retención, Producción, E0, servicios externos, gastos, push, merge,
deploy ni AAB.

## El problema

E5a aplica el voto sobre la lista sin recargarla (`trasVoto`). Sólo trataba
`voto_registrado` y `voto_retirado`.

Cuando la primera respuesta se pierde después del commit, la reconciliación
repite el pedido y la base contesta con un resultado idempotente:
- `sin_cambios` si el voto vigente ya es el pedido;
- `sin_efecto` si, al retirar, ya no hay voto vigente.

Ninguno de los dos se reflejaba. La base quedaba bien, pero la pantalla no: el
pulgar y el conteo seguían viejos, y el siguiente toque volvía a votar en vez de
retirar.

## La corrección

En `lib/comunidad/lista-nucleo.ts`:
- **`votoConfirmado(resultado, enviado)`** devuelve el voto que la base confirmó
  para lo enviado:
  - votar: `voto_registrado` o `sin_cambios` → lo enviado;
  - retirar: `voto_retirado` o `sin_efecto` → sin voto;
  - cualquier otra cosa (`sin_confirmar`, error, rechazo, o un resultado que no
    corresponde a lo enviado) → nada cambia, y se mantiene el aviso de
    incertidumbre.
- **`trasVoto`** aplica ese estado confirmado a la reseña visible:
  - mueve los conteos por la diferencia entre lo que se veía y lo confirmado, así
    que aplicar dos veces la misma confirmación no suma ni resta de nuevo;
  - sólo toca la reseña de esa versión: si la reseña se editó, no cambia nada;
  - devuelve el mismo estado cuando no hay cambio;
  - no recarga ni reinicia la lista: quedan las páginas, el cursor, el orden y
    el borrador;
  - el descarte por cuenta y título sigue en la frontera del componente.

No cambié el componente, la ruta ni la base. También quité la línea vacía extra
al final de `components/ResenasSeccion.tsx`.

## Verificación

**Regresión unitaria** (`lib/comunidad/lectura.test.ts`, nueva).
- Antes de la corrección **falla**: muestra `[null, 2, 3]` cuando esperaba
  `["util", 3, 4]`.
- Después pasa: 12/12.
- Cubre `sin_cambios` (útil, no útil y cambio), `sin_efecto`, que repetir no
  vuelve a contar, que lo no confirmado no cambia nada y que otra versión no se
  toca.

**Regresión real** (`scripts/comunidad/pruebas-voto-lista.mjs`, nueva).
- Qué es real:
  - la lista se arma con la lectura real como el lector, con dos páginas (5 + 2);
  - cada toque hace lo mismo que el componente (`accionVoto` → adaptador real de
    la ruta de votos con su reconciliación → `trasVoto`);
  - el resultado se compara con la base leída como el lector.
- Qué es simulado: la pérdida de respuesta. El pedido llega a la base y se
  confirma; la respuesta se descarta.
- Contra el núcleo anterior (`b7ba962`): **3 de 10**. Fallan todos los casos con
  respuesta perdida.
- Con la corrección: **11 de 11**. Agregué el caso del negativo sin pérdida.
  Casos:
  - positivo y negativo sin pérdida;
  - positivo, negativo, cambio de voto y retiro con la primera respuesta perdida
    (`sin_cambios` y `sin_efecto`);
  - pérdida de ambas respuestas: `sin_confirmar`, sin cambio visible y con el
    aviso; el reintento posterior confirma y la pantalla queda igual a la base;
  - en cada caso, el siguiente toque actúa sobre el voto real y la lista conserva
    las dos páginas, sin duplicados;
  - al final, toda la lista coincide con la base reseña por reseña.
- 8 respuestas perdidas simuladas; 0 restos.

**Focalizadas** (lectura, estado del editor, frontera de cuenta, moderación,
reseñas, marca y CORS): **78/78**. `tsc`: 0 errores. `git diff --check`: sin
errores.

**No repetí** baterías generales ni `npm test` completo: la corrección toca sólo
el núcleo puro de la lista; la base, la ruta y el componente no cambiaron.

**Navegador local** (escritorio y 375 px, sesión real del Auth local, 5 capturas
en `docs/medidas/2026-10-26-e5a-a1-recorrido/`):
- con dos páginas cargadas, "Me sirvió" con la respuesta perdida: la ruta había
  devuelto `voto_registrado`, la pantalla quedó igual y apareció "No sabemos si
  se guardó…";
- el reintento devolvió `sin_cambios`: pulgar marcado, "1 de 1", siguen las 10 y
  "Cargar más";
- retiro con la respuesta perdida y reintento (`sin_efecto`): sin voto;
- cambio a "No me sirvió" con la respuesta perdida y reintento (`sin_cambios`):
  "0 de 1", igual a la base leída como el lector;
- a 375 px: el mismo caso y, después, la tercera página con las 13 sin repetir y
  sin desplazamiento horizontal.

La pérdida de respuesta la simuló un interceptor de `fetch` en la página: el
pedido real llega y la respuesta se descarta.

**Pendientes declarados:**
- la comparación de `/api/title` en ejecución sigue pendiente; ningún barrido de
  código la reemplaza;
- teléfono, Android, tema claro, lector de pantalla y Producción.

**Limpieza:** borré sólo mis cuentas y datos (9 de la batería y 15 del
recorrido). La base quedó como al empezar:
- 6 participantes, 2 versiones y 42 cuentas;
- 2 suspensiones ajenas;
- 0 locks;
- interruptores, publicación y muestreo apagados;
- `SELECT` de `profiles` revocado.

El servidor quedó detenido.
