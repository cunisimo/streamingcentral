# Auditoría de la segunda corrección de E1.2 — a8e973a

22/10/2026. Auditor: Codex. Rama `feat/resenas-reglas`, checkout revisado
`D:\DESARROLLO\stream central\wt-resenas-comunidad`.
HEAD: `a8e973a682f79c452deb089998d138c656436fee`.
Código modificado en `b6e1f33`; versión de reglas `2026-10-22.5`.

## Dictamen

Los dos hallazgos de la auditoría de `251f3d0` están corregidos. No encontré
nuevos defectos bloqueantes en esas dos correcciones dentro del alcance revisado.
Se puede pasar a preparar la medición independiente, con autorización del dueño.
Esto no cierra E1: su aceptación sigue pendiente de esa medición y no autoriza E2.

## A1 — inicio de ruta: corregido

La expresión de dominio con ruta conserva ahora la clase completa de caracteres
del patrón de E1.2, manteniendo el largo ampliado de la terminación. Se eliminó
la restricción adicional sobre el primer carácter de la ruta. El código coincide
con la explicación del cambio; no se agregó una excepción para los ejemplos.

Reproduje por separado 132 combinaciones: seis largos de terminación (incluido
63), once comienzos de ruta y dos formas de host, con y sin subdominio.
Todas se rechazaron. Incluyen `ejemplo.photography/_demo`, guion, punto,
parámetros, fragmento, porcentaje, barra, letras y números al inicio de ruta.

## A2 — criterio compartido de alias: corregido

Los recorridos de autoatribución y búsqueda libre llaman ahora a
`esAliasFuerte`, en lugar de mantener dos criterios diferentes de forma de alias.
Los alias con dígitos al principio o en el medio ya no quedan excluidos de la
búsqueda libre por la posición de esos dígitos.

Reproduje ocho formas de alias por ambos recorridos, 16 resultados de retención:
`88cine`, `cine8fan`, `cinefan88`, `cine.fan`, `cine_fan`, `cine.fan88`,
`8cine_fan` y `c1n3fan`. La regla indirecta sigue reteniendo, sin rechazar.

Cinco controles legítimos adicionales sobre puntuación, barras, «Android 14»,
«agente 007» y «mi correo es un desastre desde que vi M3GAN» se publican.
Son comprobaciones de cobertura conocida, no datos nuevos de eficacia.

## Falsos positivos y límites

Reproduje los dos comportamientos declarados:

- «Escribime qué opinan de Se7en, el mail del asesino me voló la cabeza»
  queda retenido. Es un falso positivo legítimo, no un contacto real.
- «Buenísima.Recomendada/obligatoria» queda rechazado por forma de enlace.

No los considero bloqueantes para congelar esta corrección y medirla. Deben
seguir documentados y, si aparecen casos legítimos de esas familias en la nueva
evaluación, contar en las métricas de falsas retenciones/rechazos. No excluirlos
ni cambiar su etiqueta para que la evaluación pase. No hay una medición de su
frecuencia en usuarios reales. La cola de revisión y las denuncias todavía no
están implementadas: esta revisión del módulo aislado no habilita publicación.

No doy por demostrada la afirmación de que evitar el falso positivo de un título
requiera necesariamente una lista de títulos. Para esta entrega basta reconocer
la ambigüedad y medirla; no recomiendo seguir ampliando reglas antes de la prueba.
Persisten los límites declarados de paráfrasis y listas finitas. La auditoría no
certifica detección universal ni seguridad en producción.

## Evidencia propia

- Pruebas de reglas: **73/73**, sin omitidas.
- Suite completa: **2322 pruebas, 2304 aprobadas, 0 fallidas y 18 omitidas**.
  Las omitidas dependen de artefactos web/Android que no se generaron.
- Tipado: `tsc --noEmit --incremental false`, exitoso sin errores.
- `git diff --check 251f3d0..HEAD`: sin errores de formato.
- `git diff 1f475e3..HEAD -- scripts/comunidad`: vacío. Los conjuntos reservados
  y sus sellos siguen intactos.
- Leídos diff de implementación y transformaciones, informe de Claude, estado,
  criterios vigentes de §3.6 de la revisión y advertencias de medición de
  `docs/MANTENIMIENTO.md` §8.b y §8.b.2.

No ejecuté scripts oficiales de reservado ni preparé un reservado nuevo. La suite
sí ejecuta los conjuntos ya divulgados como regresiones conocidas. No repetí
builds ni navegador; no corresponden a estas dos correcciones del módulo puro.

## Siguiente paso recomendado

Congelar el código de reglas auditado para una única medición independiente.
Antes de escribir casos nuevos, fijar y registrar tamaño, categorías, controles,
etiquetado, independencia de autoría y protocolo de una sola ejecución. Quien
prepare el conjunto debe conocer los requisitos de producto, sin consultar la
implementación ni usar los ejemplos divulgados como fuente del conjunto nuevo.
Declarar cualquier falta de independencia; no afirmar que otro agente o modelo
por sí solo garantiza independencia.

Conservar los criterios vigentes: cero contactos/enlaces claros publicados,
al menos 95% de ofuscadas frenadas, como máximo 2% de legítimas rechazadas y 5%
retenidas, además de controles de errores/evaluabilidad y nombres existentes.
No ajustar reglas tras conocer el conjunto y volver a presentarlo como inédito.
Si no cumple, informar el resultado completo para decidir el alcance siguiente;
no encadenar automáticamente otro reservado ni bajar umbrales.

Esta recomendación no ejecuta ni autoriza por sí sola la siguiente entrega.
Sin E2, red de servicios, gastos, Supabase, SQL, Producción, push, merge, deploy
ni AAB. Codex añadió únicamente este informe, sin modificar código ni cambios
ajenos. Salas mantiene su aprobación y el AAB futuro sigue siendo conjunto con
reseñas, sin versión fijada.
