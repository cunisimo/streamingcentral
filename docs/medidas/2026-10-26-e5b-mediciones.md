# E5b: mediciones de "Más útiles" — 26/10/2026

**Todo lo de esta página es MEDIDO, no estimado**, salvo donde se aclara.

## Cómo se midió

- **Base:** Supabase local (`supabase start`) en Docker Desktop (Windows), con
  018 aplicada.
- **Script:** `scripts/comunidad/medicion-utiles.mjs`.
- **Salida cruda:** `docs/medidas/2026-10-26-e5b-salidas.txt` (sección
  "mediciones"), con el JSON y los planes completos.
- **Datos sintéticos:**
  - N = 100, 1.000 y 10.000 reseñas publicadas en tres títulos;
  - autores sin cuenta y 300 votantes sintéticos;
  - entre 0 y 12 votos por reseña;
  - total de votos: 514, 5.896 y 59.906;
  - se insertaron por SQL y se borraron al terminar (restos `0|0|0|false`).
- **Lector:** un uid aleatorio con `role authenticated` y los claims de su JWT.
  La función medida es `public.comunidad_resenas`, la misma que llama la ruta.
- **Planes:** `auto_explain` (ANALYZE, BUFFERS, TIMING, `log_nested_statements`)
  sobre la llamada a la función real, no sobre una copia de sus consultas.
  - Supabase no deja cargar `auto_explain` con `postgres`, así que esas corridas
    van como `supabase_admin`, el superusuario del contenedor local, y desde ahí
    `set local role authenticated`.
- **Tiempos "sin instrumentar":** 20 llamadas seguidas por medición, cronometradas
  con `clock_timestamp()` dentro de la base, sin `auto_explain`; se informa la
  mediana. Los tiempos "con auto_explain" incluyen el costo de instrumentar y
  sólo sirven para comparar entre sí.
- **Generar el orden:** 5 corridas por N; antes de cada una se borra el orden del
  título.
- **Máquina:** el equipo local del dueño. Los tiempos absolutos no anticipan
  Producción; lo que importa es cómo crecen con N.

## Resultados

| | N = 100 | N = 1.000 | N = 10.000 |
|---|---|---|---|
| **Generar el orden** (mediana de 5, sin instrumentar) | 92,6 ms | 274,2 ms | 2.073,2 ms |
| Generar: corridas | 80,5 · 158,7 · 81,3 · 118 · 92,6 | 315,3 · 274,2 · 275 · 245,5 · 187,1 | 2.845,9 · 2.007,1 · 2.073,2 · 1.848,7 · 2.502,9 |
| Generar: buffers (sentencia que arma las filas) | 500 | 3.358 | 31.022 |
| **Página con cursor, principio** (sin instrumentar) | 16,7 ms · 312 buffers | 13,0 ms · 615 buffers | 17,2 ms · 638 buffers |
| **Página con cursor, medio** | 15,6 ms · 312 buffers | 13,5 ms · 615 buffers | 15,6 ms · 635 buffers |
| **Página con cursor, final** (las 5 últimas) | 16,3 ms · 303 buffers | 10,6 ms · 341 buffers | 15,0 ms · 350 buffers |
| **Primera página** (orden ya generado, sin instrumentar) | 15,3 ms | 34,1 ms | 139,5 ms |
| Primera página: buffers de la cabecera (propia + contador visible) | 10 | 60 | 561 |
| Filas de ids del orden | 1 | 10 | 100 |
| Bytes del orden (filas completas) | 864 | 8.640 | 86.400 |
| Bytes de cada arreglo de 100 ids | 824 | 824 | 824 |

**Lectura de la tabla.**
- **Página con cursor: no crece con el total.** Entre 1.000 y 10.000 reseñas los
  buffers casi no cambian (615 → 635) y el tiempo queda entre 10 y 17 ms. Con
  N = 100 lee menos (≈ 310). La medición no aísla por qué; puede influir que la
  tabla de votos era más chica, pero eso no está medido. El orden se recorre
  igual en los tres tamaños.
  - Plan de la página (N = 10.000, posición 5.000):
    - recorrer el orden lee **una** fila de ids por clave primaria (`Index Scan
      using ordenes_utiles_tramos_pkey … rows=1`, **3 buffers**);
    - revalida las **50** posiciones con 50 búsquedas de reseña y 50 de versión
      (150 + 150 buffers);
    - el resto son los conteos de votos de las 5 reseñas devueltas.
  - Las páginas del final leen menos: la ventana tiene menos de 50 posiciones.
- **Generar el orden crece con N**, casi lineal: 0,27 s con 1.000 y 2,1 s con
  10.000.
  - El costo es contar los votos vigentes de cada reseña (una búsqueda por índice
    por reseña, 31.022 buffers con 10.000).
  - Ocurre como mucho una vez cada 10 minutos por título, bajo el lock del título.
  - Mientras se genera, los otros primeros lectores de ese título esperan y
    después reutilizan el orden. Con 20 lectores concurrentes se generó uno solo
    (`pruebas-utiles`).
  - ⚠️ La espera cuenta para el `lock_timeout` de 5 s de la función: a partir de
    unas 25.000 reseñas por título (extrapolación lineal **no medida**), un
    lector que espera podría recibir error y tendría que reintentar.
- **La primera página crece con N por el CONTADOR visible**, no por el orden.
  - El contador recorre las reseñas del título para contar las que ve ese lector
    (§2.3: "se calcula al abrir"); con 10.000 son 561 buffers y unos 140 ms.
  - "Recientes" (E5a) tiene el mismo contador.
  - No lo cambié: el contrato vigente pide calcularlo al abrir y sobre lo visible
    para ese lector. Si hiciera falta acotarlo, es una decisión de diseño aparte.

## Tamaño en disco

Con los tres órdenes de la corrida (uno por N: 111 filas, 11.100 ids), después de
15 generaciones (5 por título):

| Tabla | Heap | Índices | TOAST | Índice de TOAST | Total |
|---|---|---|---|---|---|
| `comunidad.ordenes_utiles` | 8.192 B | 32.768 B | 0 B | 8.192 B | 81.920 B |
| `comunidad.ordenes_utiles_tramos` | 376.832 B | 65.536 B | **0 B** | 8.192 B | 483.328 B |

- **TOAST: 0 bytes.** Ninguna fila supera 2.000 bytes: cada arreglo de 100 ids
  ocupa 824 B y cada fila 864 B, debajo del umbral, como preveía el diseño.
- **Lo vivo** son 111 filas × 864 B ≈ 96 KB. El heap de 368 KB incluye el
  espacio de los órdenes regenerados:
  - antes del `VACUUM`, 7 tuplas muertas y 114 vivas;
  - el `VACUUM` normal no achica el archivo, deja el espacio para reutilizar.
- **Por orden:** unos 8,6 KB cada 1.000 reseñas (86 KB con 10.000). El diseño
  estimaba "≈ 8 KB / ≈ 80 KB más sobrecarga": medido, 8.640 / 86.400 B.

## Cota y purga (sin decidir)

- Un título leído sin pausa tiene como mucho **12 órdenes vigentes** (uno cada
  10 minutos, 2 horas de vida). Al generar uno nuevo se borran los vencidos de
  ese título (probado en `pruebas-utiles`).
- Con 10.000 reseñas serían como mucho unos 1,04 MB por título, más el espacio de
  lo regenerado hasta que pase autovacuum (12 × 86,4 KB; cálculo a partir de lo
  medido, no medición).
- **Un título que deja de leerse conserva hasta 12 vencidos** hasta que algo los
  purgue. Hoy no hay ninguna purga: la diaria y la horaria son de E8 y no se
  programaron.
- **Qué hace falta para decidir la purga:** cuántos títulos se leen por día y
  cuántas reseñas tienen. Esos números no existen todavía (el módulo está
  apagado), así que esta medición no puede decir si entra holgado en la cuota de
  §4. No habilité ninguna tarea programada ni fijé plazos. Queda para E8 con
  estos tamaños por orden como insumo.
