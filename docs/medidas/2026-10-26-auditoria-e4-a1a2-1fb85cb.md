# Cierre focalizado de E4 A1/A2 — 26/10/2026

Codex revisó `12e2d74`, `97e70af` y `1fb85cb` en `feat/resenas-reglas`, worktree `wt-resenas-comunidad`, contra `9340da9`.

## Dictamen y alcance

A1 y A2 quedan cerradas por revisión de código, pruebas focalizadas propias y evidencia local de Claude inspeccionada. No se encontraron nuevos defectos bloqueantes en estas correcciones. E4 queda cerrada como entrega local, sin habilitar publicación. **La repetición propia de las pruebas de base no pudo realizarse por un fallo del entorno Docker**, detallado abajo; el cierre no presenta las corridas de Claude como propias ni certifica el estado de la base después del reinicio.

### A1 — Restauración accesible

El panel incorpora Retiradas, con paginación, y “Ver situación actual” desde Registro. Ambas lecturas pasan por las funciones administrativas con `exigir_admin()` y permisos sólo para `authenticated`. Los auxiliares internos quedan sin permiso de ejecución para los roles de API y los drops se incluyeron en el down.

Las lecturas devuelven la situación actual; sólo una retirada vigente de una reseña viva ofrece Restaurar. Las eliminadas no devuelven texto y las borradas por el autor lo omiten. El aviso usa `votos_recuperables`: positivos vigentes que ya tenían tramo y que no tienen uno abierto. La mutación sigue revalidando las condiciones anteriores. El caso confirmado sale de las listas sin esperar la recarga.

Se inspeccionaron las capturas 06 y 07 de Claude a 375 px: lista Retiradas y confirmación con los votos recuperables. Evidencia visual de Claude, no recorrido propio de navegador. Los tests reales de recorrido lógico, paginación y situaciones no restaurables se revisaron en el script y sus salidas.

### A2 — Coordinación de las bajas

`limpiar_participante` bloquea las denuncias hechas y recibidas por `id` antes de copiarlas o borrarlas, después de los bloqueos que ya tomaba. Esto evita la lectura sin lock que produjo la copia tardía del historial: una segunda baja espera y las sentencias posteriores releen el resultado confirmado. No agrega una purga ni un FK a participantes huérfanos.

Se inspeccionaron las regresiones deterministas con las funciones reales: orden denunciante→autor, orden inverso y denuncias cruzadas. Coordinan transacciones mediante barreras y observan espera de fila. Verifican que no quede historial de cuentas dadas de baja y sí el de una cuenta activa. Las salidas de Claude muestran el fallo contra la versión anterior (una fila indebida) y el pase con el bloqueo nuevo; la tercera prueba cruzada se agregó después de la corrida inicial. No se interpretan esas salidas como una reproducción propia actual.

## Verificación propia y limitación del entorno

- Tests de administración, frontera de cuenta, moderación y CORS: **64/64**, sin omitidas.
- Tipado `tsc --noEmit --incremental false`, exit 0.
- Diff `9340da9..HEAD --check`: un espacio final en `docs/medidas/2026-10-25-e4-a1a2-salidas.txt:22`, en la línea del fallo histórico. Limpieza documental menor, no bloqueante; no cambiar el resultado histórico.
- Código, cableado, permisos explícitos, reversión, regresiones y salidas inspeccionados; dos capturas móviles inspeccionadas.
- Docker estaba apagado tras el reinicio. Codex inició Docker Desktop en segundo plano para intentar repetir las pruebas. La consulta al contexto local pasó de tubería inexistente a **500 Internal Server Error** del motor; una segunda consulta no devolvió inventario útil. No se hizo reset, reconstrucción ni recreación de contenedores, no se ejecutó ninguna migración ni batería contra la base y no se crearon cuentas o datos. No se afirma haber comprobado interruptores o limpieza después del reinicio. Docker Desktop fue iniciado y no se lo detuvo.
- No se levantó servidor de la app ni se ejecutó navegador propio. No se repitieron suite completa, up/down/up, HTTP, MFA, base, Android, tema claro, lector de pantalla o Producción. Las corridas 38/38, 5/5, 28/28, 26/26, 85/85 y 46/46 siguen siendo evidencia de Claude.

## Continuidad

La documentación de suspensión se concilió con los intervalos y el gate de E7. La conservación o eliminación del texto denunciado tras la baja sigue pendiente de decisión del dueño (P3); no se aprueba la opción A ni se implementan B/C por este cierre. Tampoco se aprueban límites de lanzamiento, E1 o retenciones.

El siguiente paso del plan es E5a local, lectura protegida y Recientes, previa autorización del dueño. No se exige una nueva ronda de moderación por esta revisión. Antes de ejecutar más pruebas de base, comprobar que el motor local vuelve a estar disponible; el fallo ambiental no es un hallazgo de producto.

Sin cambios de código por Codex, E5 ejecutada, E0, Producción, servicios externos, gastos, push, merge, deploy ni AAB.
