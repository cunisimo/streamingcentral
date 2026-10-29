# Auditoría focalizada de E5a — 26/10/2026

Codex revisó `f5565ed`, `7fc7725` y `b7ba962` en `feat/resenas-reglas`, worktree `wt-resenas-comunidad`, contra `1fb85cb`.

## Dictamen

E5a local queda pendiente de **un P2**, A1: los votos recuperados tras una respuesta perdida quedan sin reflejar en la lista. No se encontró un nuevo bloqueo en la lectura protegida o en la clave de paginación revisadas. No implica cierre global de permisos o pruebas de volumen más allá de lo ejercitado abajo.

## A1 [P2] — La lista ignora el resultado idempotente del voto recuperado

Ubicaciones: `lib/comunidad/lista-nucleo.ts:118–123` y `components/comunidad/ResenasComunidad.tsx:145–148`.

E5a dejó de recargar la lista después de votar y actualiza el elemento mediante `trasVoto`. Esa función sólo trata `voto_registrado` y `voto_retirado`. El adaptador compartido reconcilia una respuesta perdida repitiendo el pedido real: si el primer voto ya se guardó, la base confirma `sin_cambios`; si el primer retiro ya se aplicó, devuelve `sin_efecto`. Ambos se ignoran en la lista. La recuperación de E3a sigue funcionando en la base, pero el nuevo cliente queda desincronizado.

**Reproducción propia real**, con Auth y PostgREST locales, adaptadores reales de E3a y estado real de la lista E5a:

1. Leer una primera página con el lector sin voto en una reseña (conteos cero).
2. Llamar a `operacionesComunidad(...).votar(..., true)` con un fetch que hace el pedido real y descarta su primera respuesta exitosa después del commit.
3. El adaptador repite una vez y devuelve `sin_cambios`.
4. Aplicar el resultado a `trasVoto`, exactamente como hace el componente.
5. Consultar nuevamente con el JWT del lector y comparar con la lista. El siguiente toque usa `accionVoto` y vuelve a enviar `util`, en lugar de retirar.

Salida:

```json
{"paginas":[5,2],"sinDuplicados":7,"respuestaRecuperada":"sin_cambios","estadoEnBase":{"mi_voto":"util","utiles":1,"total":1},"estadoEnPantalla":{"mi_voto":null,"utiles":0,"total":0},"siguienteToqueEnvia":"util","respuestaSegundoToque":"sin_cambios"}
```

La composición usa la función de estado real, no un DOM propio de navegador. El voto y la lectura son reales; la pérdida de respuesta es inyectada tras el commit, no una caída física de red. No hay duplicación en la base: el defecto es el estado visible y el siguiente comportamiento del botón.

Corrección: reconciliar también los resultados idempotentes y recuperar el estado confirmado del voto sin reiniciar la lista a cinco ni duplicar cambios de conteo. Puede aplicarse el estado confirmado de la acción o releerse lo necesario; no se prescribe una nueva arquitectura. Conservar páginas, cursor, orden y borrador. Probar voto positivo, negativo, cambio y retiro con pérdida de una respuesta, pérdida de ambas y reintento posterior, incluidos `sin_cambios` y `sin_efecto`; el siguiente toque debe operar sobre el voto real. No basta cambiar el mensaje ni fingir éxito de un `sin_confirmar`.

## Verificación nueva de Codex

- Tests de lectura, estado del editor, frontera de cuenta, moderación y CORS: **68/68**, sin omitidas. No incluyen la regresión de A1, que muestra una brecha del banco actual.
- Tipado `tsc --noEmit --incremental false`, exit 0.
- Prueba adicional con ocho cuentas ficticias propias y siete publicaciones por funciones reales: primera tanda de cinco y segunda de dos, siete ids únicos; lector con JWT autorizado. Anon y service_role reciben 42501 al intentar la RPC de lectura.
- La misma prueba confirma A1 y limpia sus cuentas y participantes: `LIMPIEZA|0|0|false` (usuarios propios, participantes propios, interruptores encendidos).
- La primera sonda adicional no llegó a la lectura: el sufijo aleatorio usado como texto ficticio activó la regla de teléfono. Se limpió por completo (`0|0|false`) y se corrigió sólo el texto de la sonda, usando ordinales. Es un dato de prueba inadecuado, no un hallazgo del filtro ni una falla de E5a. No se modificó código del repositorio para ninguna sonda.
- Se inspeccionaron capturas 09 y 12 de Claude: lista y registro en móvil. Son evidencia visual de Claude, no recorrido propio.
- `git diff 1fb85cb..HEAD --check` señala una línea vacía adicional al final de `components/ResenasSeccion.tsx:54`. Limpieza menor, no bloqueante.

No se repitieron las once pruebas completas de lectura ni la preparación de 219 autores/214 visibles, up/down/up, baterías históricas, suite completa, HTTP, navegador, Android o compilaciones. La prueba propia de paginación es de siete reseñas, no de más de 200. Se revisaron el script, criterios y evidencia de Claude para los 214 elementos, empates y cambios entre páginas. Docker y los contenedores locales existentes estaban disponibles: no hizo falta iniciarlos, resetear ni aplicar migraciones. No se levantó servidor de la app.

## Arquitectura y pendientes

- La RPC toma al lector de `auth.uid()`, sin parámetro de identidad, y sólo la ejecuta `authenticated`. La provisional y su ruta desaparecieron. La ruta usa la sesión verificada del lector, respuestas privadas y sin caché. La consulta por primera publicación e id permanece estable al editar y vuelve a filtrar versiones, bloqueos y suspensiones por página.
- La ruta de lectura separada por CORS es coherente con la convención del proyecto; no es un hallazgo.
- Las reseñas comunitarias se obtienen desde el cliente; sin sesión sólo se consulta el interruptor. La invitación no lleva número de reseñas y también se presenta en títulos vacíos. Más útiles permanece deshabilitado hasta E5b; nombres comunitarios quedan para E6.
- `/api/title`, `lib/enrich.ts` y `lib/reviews.ts` no tienen diferencias en este rango. Se revisaron los imports y las comprobaciones de separación, pero no se comparó el endpoint byte a byte en ejecución. El informe de Claude lo declara correctamente como pendiente. Puede verificarse después con fixtures locales de TMDB sin exigir un servicio real ni credenciales de Producción; no se inventa una fuga por la falta de esa prueba.
- Suspensión, conservación del texto tras una baja, P3 y demás decisiones pendientes no se reabren ni aprueban aquí. E1 continúa con su límite registrado. Publicación y muestreo no se habilitan.

Siguiente paso: corregir A1 de forma focalizada, conservar los controles de lectura y aportar regresión y recorrido visible. Sin E5b, E6, cambios de código por Codex, E0, Producción, servicios externos, gastos, push, merge, deploy ni AAB.
