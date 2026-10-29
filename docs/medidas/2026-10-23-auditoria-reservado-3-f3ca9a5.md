# Auditoría del reservado 3 detenido — f3ca9a5

23/10/2026. Codex. Rama `feat/resenas-reglas`, worktree
`D:\DESARROLLO\stream central\wt-resenas-comunidad`, HEAD `f3ca9a5`.

## Dictamen

Claude se detuvo conforme al encargo y al protocolo. No corresponde ejecutar
el reservado incompleto ni declarar cerrada E1. No encontré un defecto bloqueante
en el congelamiento o en el mecanismo de rechazo por huella revisado.

Se puede conservar la parte general para la decisión siguiente: no fue evaluada
en esta auditoría y no leí sus textos. La imposibilidad de redactar la parte
sensible es informada por Claude; el motivo del clasificador no se verificó de
forma independiente. No propongo eludir ese bloqueo ni insistir con reformulaciones
destinadas a sortearlo.

## Evidencia propia

- Historial: `1e731d1` fija protocolo y congelamiento; `3e36c5a` añade el ejecutor;
  `f3ca9a5` añade conjunto general e informe de detención. La secuencia en Git
  coincide con lo informado; no demuestra por sí sola las lecturas de los agentes.
- Las siete huellas que verifica el ejecutor coinciden con los archivos actuales.
  `git diff a8e973a..HEAD -- lib/comunidad/reglas` está vacío.
- SHA-256 del archivo general, con LF:
  `8d9e171440bd2ce20f52ee73037d233138ef114adfe90bffa3e4352b8d0f83c7`.
  Lo calculé como bytes/texto, sin mostrar ni examinar los casos.
- No existen `reservado-sensible.json`, `SELLO.json` ni el informe oficial de
  resultados. Esto es consistente con una detención previa al sellado/evaluación;
  no constituye prueba absoluta de que nunca se ejecutó nada fuera del registro.
- Ejecuté sólo `--solo-forma`: 340 casos presentes. Reporta el archivo sensible
  ausente y sus cinco combinaciones faltantes, con 32 reseñas y cuatro nombres.
  No devuelve textos ni decisiones de moderación.
- Probé el control de código alterado **en una copia temporal**, manteniendo
  intactos todos los archivos de reglas del worktree. Con las copias originales,
  el ejecutor supera las huellas y se detiene por falta de sello. Tras agregar un
  comentario a una copia, se detiene por huella diferente, con salida 2 y sin
  generar informe. Por tanto, era posible comprobar este control sin modificar
  las reglas reales. No hace falta reabrir esa prueba ni tocar el módulo.
- `git diff --check a8e973a..HEAD`: sin errores.

No repetí la suite completa ni el tipado: no cambió el módulo previamente
verificado. Esta auditoría revisa el protocolo, la detención y controles del
ejecutor; no certifica todos los caminos del ejecutor ni aporta resultados del
reservado.

## Qué significan las alternativas

1. **Autor ajeno a las reglas para la parte faltante.** Es la opción que conserva
   la separación de autoría prevista para todo el conjunto. El autor debe trabajar
   sólo con el protocolo y datos ficticios, sin conocer listas o resultados.
   No requiere que el dueño escriba personalmente los 36 casos, pero sí disponer
   de ese autor. No se debe buscar otro agente para eludir un bloqueo de seguridad.
2. **Claude completa la parte faltante.** Es una evaluación híbrida: los 340 casos
   generales conservan la separación declarada; los 36 nuevos casos sensibles
   serían complementarios y no independientes. Puede ser una salida práctica sin
   servicios adicionales, siempre que el dueño acepte explícitamente esa enmienda
   antes de escribirlos, sellar o evaluar. No llamarla validación independiente
   integral. El total de 156 reseñas abusivas no equivale a 156 casos abusivos
   independientes: sólo 124 reseñas de abuso pertenecen al archivo general.
3. **Evaluar sólo el general.** No la recomiendo como cierre de E1 bajo el protocolo
   vigente. Quedarían categorías sin medir y se incumpliría el mínimo de 150
   reseñas abusivas, aunque no cambien los denominadores de C1/C2. El ejecutor
   actual debe rechazar ese conjunto; no quitar el control para obtener un aprobado.

## Recomendación

La opción 2 es viable si la prioridad es continuar sin encargar al dueño una
redacción manual ni agregar un servicio. Requiere aceptar una reducción concreta
de independencia, no una reducción de los umbrales. Antes de continuar, dejar
esa decisión en una enmienda del protocolo y del estado, sin borrar el original.

Mantener intactos el código congelado, el archivo general y su huella. Informar
por separado resultados generales y complementarios, además del agregado.
C1 sigue teniendo 116 casos; C2, 99; las legítimas de C3/C4, 160. La parte sensible
no aporta casos a C1/C2, por lo que su autoría no debe presentarse como evidencia
independiente sobre contactos/enlaces.

Importante: los criterios agregados C0–C4 **no exigen un porcentaje mínimo de
detección para las categorías sensibles directas**: no son contactos claros ni
ofuscadas y no son legítimas. Por eso un aprobado de esos criterios no certifica
por sí solo odio, amenazas o datos personales. Sus casos sin detectar deben
quedar visibles por categoría y revisarse al dictaminar el cierre. No inventar
un umbral después de ver resultados ni ocultar esa cobertura detrás del total.

Una evaluación híbrida sólo podría cerrar E1 si el dueño acepta antes esa
limitación de autoría y Codex revisa luego resultados y cobertura. Esta auditoría
no otorga esa aceptación, no modifica el protocolo y no autoriza la ejecución.
Si se conserva la exigencia de independencia integral, corresponde la opción 1.

## Alcance

Codex añadió sólo este informe; no modificó código ni cambios ajenos. Sin lectura
de textos reservados, evaluación oficial, nuevos casos, servicios externos,
gastos, SQL, Supabase, Producción, E2, push, merge, deploy ni AAB. Salas mantiene
su aprobación y la actualización Android sigue siendo conjunta con reseñas,
sin versión fijada.
