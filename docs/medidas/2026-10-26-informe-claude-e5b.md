# E5b local: orden "Más útiles" — 26/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`367cf25`. Autorizada por el dueño. Sólo Supabase local, la app local y datos
ficticios. Sin E6, Top Yumpers, filtro, retenciones, Producción, E0, servicios
externos, gastos, push, merge, deploy ni AAB.

**Auditoría de cierre de E5a A1.**
- La copié sin cambios: `docs/medidas/2026-10-26-auditoria-e5a-a1-367cf25.md`,
  SHA-256 `d026cf8b…`, igual al original.
- E5a queda cerrada en local.
- Conservo su pendiente: la comparación de `/api/title` en ejecución. Un barrido
  de código no la reemplaza.

## Qué hace E5b

**Contrato** (diseño §3.3 y revisión §2.3, T10):
- puntaje = límite inferior de Wilson al 95 % (z = 1,96) sobre "Me sirvió" /
  votos vigentes de la versión vigente;
- sin votos, 0;
- desempate por primera publicación desc y después id desc.

**Base (`018_comunidad_utilidad.sql` + down):**
- `comunidad.wilson(positivos, total)`, y su copia `lib/comunidad/wilson.ts`
  para las pruebas. Coinciden **bit a bit** en los 1.890 pares con total ≤ 60.
- **Orden congelado compartido por título:**
  - `ordenes_utiles` (título, creado, vence, total) y `ordenes_utiles_tramos`
    (filas de **100 ids**);
  - **sin datos de quien lee**: las columnas son id, tipo, tmdb_id, creado_en,
    vence_en, total, orden_id, tramo_no e ids;
  - sin grants y con RLS sin policies.
- **`comunidad.orden_utiles`:**
  - reutiliza un orden de menos de **10 minutos**;
  - si no hay, toma un lock consultivo del título, **vuelve a buscar** y recién
    entonces genera;
  - vigencia: **2 horas**;
  - al generar, borra los vencidos del título;
  - no toma locks de filas comunitarias (sólo lee reseñas, versiones y votos).
- **`comunidad_resenas(…, 'utiles', …)`:**
  - cada página recorre **como máximo 50 posiciones** desde el cursor `{o, p}` y
    devuelve hasta 5 reseñas visibles para ese lector;
  - revalida: viva, versión vigente publicada, no propia, sin bloqueo de quien
    lee, autor no suspendido;
  - con menos de 5 en las 50 posiciones, devuelve las que hay y el cursor avanza
    50;
  - si el orden del cursor venció (o ya no existe, o es de otro título),
    responde `orden_actualizado` sin reseñas.
- "Recientes" no cambió. La función pasa a `volatile` porque puede generar el
  orden.

**Interfaz:**
- **"Más útiles" es el orden por defecto**; "Recientes" sigue en el selector.
- Cinco iniciales y "Cargar más". En "Más útiles" una tanda puede traer menos de
  cinco, o ninguna, con más por delante.
- Cambiar de orden vacía la lista y pide la primera página del otro. Las
  respuestas del orden anterior se descartan por la generación de la carga y por
  la clave de la lista, que incluye cuenta, título y orden.
- **"Orden actualizado":**
  - si el orden vence mientras se lee, aparece el aviso y "Volver a empezar"
    **una sola vez**;
  - la primera página del orden nuevo se agrega a lo visible sin repetir
    reseñas;
  - un segundo vencimiento ya no ofrece otro reinicio;
  - si el reinicio falla, lo visible queda y se puede reintentar.
- **Votar** dentro del orden congelado actualiza el conteo y no reordena; el
  orden siguiente lo refleja. Se conserva la corrección de votos recuperados
  (`sin_cambios`, `sin_efecto`).

## Corregido en el camino

**Wilson de 0/n en la base daba ~1e-17, no 0.**
- Pasaba con 0/1 y 0/2 (medido). Sin corregir, "0 de 1" quedaba arriba de "0 de
  3" o de una reseña sin votos más nueva, salteando el desempate por fecha.
- La batería lo detectó al comparar el recorrido con el orden esperado.
- Ahora, con 0 positivos, el puntaje es exactamente 0, y la fórmula usa doble
  precisión en el mismo orden de operaciones que la copia en TypeScript.

## Mediciones (resumen; detalle en `docs/medidas/2026-10-26-e5b-mediciones.md`)

Son medidas con 100, 1.000 y 10.000 reseñas sintéticas, `auto_explain` sobre la
función real y tiempos sin instrumentar.

| | 100 | 1.000 | 10.000 |
|---|---|---|---|
| Generar el orden | 92,6 ms | 274,2 ms | 2.073,2 ms |
| Página con cursor (medio) | 15,6 ms · 312 buffers | 13,5 ms · 615 buffers | 15,6 ms · 635 buffers |
| Primera página (orden ya generado) | 15,3 ms | 34,1 ms | 139,5 ms |
| Bytes del orden | 864 | 8.640 | 86.400 |

- **El costo de una página con cursor no crece con el total.**
  - El recorrido del orden lee 1 fila de ids (3 buffers).
  - Se revalidan 50 posiciones y se cuentan los votos de 5 reseñas.
- **Generar crece casi lineal con N.** Ocurre una vez cada 10 minutos por título
  como mucho, y los demás lectores esperan el lock.
  - ⚠️ A partir de unas 25.000 reseñas por título (extrapolación lineal, no
    medida), la espera podría superar el `lock_timeout` de 5 s.
- **La primera página crece con N por el contador visible** (§2.3), igual que en
  "Recientes". No lo cambié.
- **Tamaños:** TOAST 0 B (cada fila de 100 ids pesa 864 B). Con tres órdenes, el
  heap de `ordenes_utiles_tramos` mide 368 KB, incluido el espacio de lo
  regenerado.
- **Purga (E8):** no hay datos de uso real para saber si hace falta. No programé
  nada ni fijé plazos.

## Verificación

**Reales, contra la base local** (`docs/medidas/2026-10-26-e5b-salidas.txt`):

| Prueba | Resultado |
|---|---|
| `pruebas-utiles` (nueva) | 14/14 (corridas previas 7/13 y 13/14: ver "Corregido en el camino") |
| up/down/up de 018 | 5/5 |
| Lectura (E5a) | 11/11 (primera corrida 8/11 por cambios de contrato intencionales; batería actualizada) |
| Voto en la lista (E5a A1) | 11/11 |
| Permisos | 29/29 (primera corrida 28/29 por el inventario; actualizado) |
| Escritura (E3a) | 43/43 |
| Moderación (E3b) | 46/46 |
| Admin (E4) | 38/38 |

**Qué cubre `pruebas-utiles`:**
- **Wilson y desempates:**
  - Wilson contra 18 valores calculados aparte con Python;
  - igualdad bit a bit con la copia en TypeScript;
  - orden con votos reales de 10 cuentas: 9/10, 1/1, 2/4, tres empates en 1/2
    (fecha y, con la misma fecha, id) y ceros (0/3, 0/0) por fecha.
- **Un orden por título:** 20 lectores concurrentes con sesiones reales generan
  **un solo** orden, el mismo para todos.
- **Reutilización, vigencia y borrado de vencidos**, con el paso del tiempo
  simulado.
- **Recorrido estable:** 237 reseñas, en el orden exacto, sin duplicar ni
  saltear, en filas de 100, 100 y 37.
- **Cambios entre páginas** con funciones reales (retiro, suspensión, bloqueo,
  borrado y edición): lo oculto no reaparece y nada visible se saltea.
- **Muchas ocultas:** las tandas devuelven 5, 0, 0 y 5, y el cursor avanza 5,
  50, 50… Nunca más de 50.
- **Vencimiento a mitad de lectura** con el núcleo real:
  - `orden_actualizado` y un reinicio que llega al final sin repetir;
  - un segundo vencimiento sin otro reinicio;
  - un cursor de otro título también responde `orden_actualizado`.
- **Votos:** cambian el conteo, no el lugar; el orden siguiente los refleja.
- **Permisos y privacidad:** tablas sin grants y sin columnas del lector; las
  funciones internas sin EXECUTE; anon y `service_role` no leen.
- **"Recientes" intacto.**

**Preliminares:**
- unitarias nuevas `lib/comunidad/utiles.test.ts`: 8/8;
- `lectura.test.ts`: 12/12;
- `npm test`: 2480 pasan, 0 fallan, 16 omitidas;
- `tsc`: 0.

**Recorrido en navegador local** (capturas en
`docs/medidas/2026-10-26-e5b-recorrido/`, 13 en total):
- **Escritorio:**
  - "Más útiles" por defecto, en el orden esperado: 6/6, 4/4, 5/6, 2/2, 3/6,
    1/3 y después los ceros por fecha.
  - Falla de tanda y reintento desde el mismo cursor.
  - Voto con la respuesta perdida: aviso de incertidumbre y, al reintentar,
    `sin_cambios`. La cuenta pasa a "1 de 1" y la reseña **no se reordena**.
  - "Recientes", y la vuelta a "Más útiles" reutiliza el mismo orden.
  - Vencimiento: "Orden actualizado" y "Volver a empezar". La primera página
    del orden nuevo ya estaba visible y no se repitió; hasta el final, 13 de 13
    únicas.
- **375 px:**
  - los dos órdenes, falla de tanda y reintento;
  - voto perdido y recuperado (`sin_cambios`, "4 de 7", sin reordenar);
  - vencimiento con reinicio y un **segundo vencimiento sin otro reinicio**.
- **Cómo se capturó:**
  - el panel del navegador recorta la vista, así que las capturas de escritorio
    usan zoom CSS 0,6 sobre la página;
  - las de 375 px muestran la página en un iframe de 375 px de ancho. Las media
    queries ven 375, y el ancho del documento es 375 = 375.

**Simulado:**
- el paso del tiempo (10 minutos y 2 horas, moviendo las fechas del orden);
- las reseñas sintéticas de los conjuntos grandes;
- "muchas ocultas", pasando versiones a `oculta` por SQL;
- en el navegador, la respuesta perdida y el error de red con un interceptor de
  `fetch`.

**Pendiente:**
- `/api/title` en ejecución (pendiente de E5a);
- teléfono, Android, tema claro, lector de pantalla;
- Producción.

**Limpieza:**
- Borré sólo mis cuentas, reseñas, votos y órdenes: los de las baterías, los de
  las mediciones y los 21 del recorrido.
- La primera corrida de lectura, todavía con "utiles" como orden inválido, había
  generado **2 órdenes congeladas**: la del título de la batería y la de id=1
  por la ruta. Las encontré en el control final y las borré: ids 12 y 13,
  creadas durante esa corrida. La batería actualizada ya no las genera.
  Observación: las baterías anteriores no limpian órdenes porque antes de 018
  no existían.
- La base quedó como al empezar:
  - 6 participantes, 2 versiones, 42 cuentas y 2 suspensiones ajenas;
  - 0 evaluaciones, 0 órdenes y 0 locks;
  - interruptores, publicación y muestreo apagados;
  - `SELECT` de `profiles` revocado;
  - 018 aplicada.
- Saqué la sesión del navegador y detuve el servidor.
