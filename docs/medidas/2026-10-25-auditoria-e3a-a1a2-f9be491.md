# Auditoría focalizada E3a A1/A2 — 25/10/2026

Codex revisó `98eba43`, `8bdfe3f`, `d66244b` y `f9be491` de `feat/resenas-reglas`, en `wt-resenas-comunidad`. Alcance: las dos correcciones de la auditoría de `faabf5a`, sin reabrir etapas anteriores.

## Dictamen

A1 y A2 quedan cerradas en el alcance local revisado. No se encontraron nuevos defectos bloqueantes en esas correcciones. E3a local queda cerrada con los límites ya registrados: lectura provisional, términos sin aprobar, admisión a colas y demás defensas pendientes. Esto no aprueba E1 ni habilita publicación, Producción o E3b.

### A1 — Confirmación perdida

La clasificación distingue errores confirmados de resultados inciertos; una pérdida de confirmación permite un solo reintento con los mismos argumentos. Si no se recupera, responde `sin_confirmar`. Publicar/editar mantienen el mismo intento y hash. Las mutaciones sin texto usan la reconciliación compartida.

Verificación nueva de Codex: batería real filtrada `SOLO='A1 ·'`, 6/6, contra Supabase local. Publicación sin duplicación ni doble consumo; edición con un único reinicio de votos; pérdida de ambas respuestas por red y 502; votar/retirar/borrar; rechazo SQL confirmado sin reintento. Se leyeron las aserciones y la limpieza: retiró las 15 cuentas propias y terminó en `0|0|0|0|false` (cuentas, participantes, sesiones, locks e interruptores encendidos). No se levantó servidor de la app ni se consultó Producción.

### A2 — Borrador y versión base

El estado conserva la base original; el envío usa esa base, no la última prop. Una versión remota o baja conserva el borrador y ofrece decisiones explícitas. Un guardado propio confirmado se adopta. Las claves por cuenta/título reinician el editor y una lectura fallida conserva los datos en pantalla.

Verificación nueva: `node --test lib/comunidad/escritura.test.ts lib/comunidad/editor-estado.test.ts`, 37/37 sin omitidas, incluyendo ocho regresiones del estado del editor. Lectura del cableado real de los componentes. Se inspeccionaron las capturas 02 y 06 de Claude sobre versión remota y borrado; son evidencia visual de Claude, no un recorrido propio de Codex. No se ejecutó navegador en esta auditoría ni cambio directo de cuenta con el editor montado.

## Otros controles y límites

- Tipado nuevo: `tsc --noEmit --incremental false`, exit 0.
- `git diff faabf5a..HEAD --check` señala seis espacios finales en las líneas históricas de fallos de `docs/medidas/2026-10-25-e3a-a1a2-salidas.txt` (11, 13, 15, 17, 19, 21). Limpieza documental menor; no bloquea el cierre funcional.
- No se repitieron suite completa, compilaciones, baterías generales, migraciones, Android ni ficha TMDB. Los números del informe de Claude para ellas no se presentan como verificación propia.
- Codex no modificó código, SQL, ramas ni datos ajenos. Sin gastos, E0, push, merge, deploy ni AAB.

## Decisión visual nueva del dueño

El dueño pide reemplazar los botones visibles “Me sirvió” y “No me sirvió” por pulgar arriba y pulgar abajo, como la captura aportada. Encima debe decir, con valores reales, “285 de 481 encontraron útil esta opinión”. Mantener nombres accesibles para los botones, estado elegido distinguible y la lógica de voto/cambio/retiro y prohibición de autoevaluación. Es una solicitud de interfaz para Claude; todavía no está implementada ni verificada. No implica autorización para E3b.
