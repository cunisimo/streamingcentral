# Auditoría de la conciliación v2.1 — cac5c50

23/10/2026. Codex. Rama `feat/resenas-reglas`, worktree
`D:\DESARROLLO\stream central\wt-resenas-comunidad`.
Commit revisado: `cac5c504319f197eddbd67b23473d38a7cba3587`.

## Dictamen

Las contradicciones principales señaladas en la auditoría de `2bc6c1c` están
conciliadas. Se puede mantener la estructura de la propuesta y avanzar al cierre
documental de las listas y versiones del catálogo, incorporando las condiciones
puntuales siguientes. No recomiendo otro replanteo general ni otro reservado ahora.

Esto acepta la conciliación como avance documental, **no aprueba el catálogo
final, los cambios de alcance del producto ni E1**. La propia propuesta identifica
el catálogo como borrador pendiente de §8. Implementación, casos, medición y E2
siguen sin autorizarse.

## Lo resuelto

- CS ya tiene umbral y denominador por H1, H2 reseñas, H2 nombres y H3. El
  agregado no compensa una familia fallida. La justificación de los tamaños
  distingue granularidad de eficacia poblacional.
- Las rutas A y B ya no se confunden: la autoría conocedora de reglas no cumple
  el requisito independiente. La ruta B requiere un dictamen de evidencia
  limitada y aceptación específica del dueño, sin heredar el reservado 3.
- Una exclusión no anula otras formas incluidas. Se define una salida final
  única y se aclara que denunciar no oculta inmediatamente, que el bloqueo es
  personal y que pausar no retira publicaciones ya visibles.
- Se incluyen teléfonos sin separadores y se explica el cómputo de prefijos.
- Las fuentes de referencia se describen como futuras y no verificadas; listas
  y versiones se fijan antes de implementar, no durante el desarrollo.
- El procedimiento de evidencia por versión y la operación de ambas colas
  permanecen conciliados. La disponibilidad del dueño sigue pendiente.

## Cierre del catálogo: condiciones técnicas puntuales

### A1 — P1 antes de aprobar la medición: una familia no debe aprobar por detecciones ajenas

El catálogo §9 cuenta un texto rechazado por contacto como éxito de CS si
también contiene contenido sensible. La prioridad de la **salida final** es
correcta, pero ese dato no demuestra que la familia sensible haya detectado nada.
Si todos los casos H1 incluyeran teléfonos, un detector de teléfonos podría dar
CS-H1 perfecto con el detector de amenazas completamente ausente.

Al cerrar el protocolo, separar «texto no publicado» de «familia detectada»:
los mínimos por familia deben incluir casos que prueben esa familia sin otra
razón de bloqueo. Los casos mixtos pueden medir interacciones, pero no sustituir
esa evidencia. Otra comprobación posible es exigir un disparo de la familia H
correspondiente, aunque el resultado final sea rechazo por F; dejar documentado
qué indicador valida CS y cómo se informa.

No cambia la prioridad de salidas ni exige dos respuestas incompatibles. Es un
resguardo contra un arnés que aparenta medir amenazas cuando mide teléfonos.
Resolverlo dentro del cierre documental del catálogo, antes de crear datos o
implementar el evaluador futuro.

### A2 — P2: conservar el guion bajo entre los separadores prometidos

S enumera categorías que no contienen `_` (U+005F). Es `Pc`; lo comprobé contra
las propiedades Unicode del runtime sin ejecutar reglas ni evaluar reseñas.
La lista `SEP` actual sí incluye `_` (`lib/comunidad/reglas/reglas.ts:59`).

El catálogo promete conservar cobertura mecánica anterior. Incluir explícitamente
el guion bajo en S y en su generación correspondiente, o declarar y justificar
la reducción como decisión nueva. No hace falta añadir toda la clase `Pc` ni
abrir otra familia. No hay una corrección de código en esta auditoría.

### A3 — dejar visibles las exclusiones al presentar la decisión del dueño

E9 (emojis o símbolos `So` entre grupos de dígitos) es una frontera nueva
declarada; no queda aprobada por llamarla límite técnico. Debe aparecer en el
resumen del alcance residual sometido al dueño, junto con las demás exclusiones.
Los emojis de tecla siguen dentro de D6: son una construcción distinta.

E8 ya no usa la implementación como definición, pero afirma que no se puede
medir sin generar material. Presentarlo como una **restricción elegida de esta
evaluación y una cobertura no certificada**, sin afirmar una imposibilidad
universal. No propongo generar material restringido ni cambiar G1. El límite
completo de E8 debe ser explícito al decidir el riesgo del producto; la defensa
existente sin criterio no equivale a una garantía de detección.

## Verificación

Leí los diffs de propuesta y catálogo, informe y estado. Se modificaron sólo
documentos. El módulo sigue sin cambios respecto de la versión previamente
auditada; no se tocaron bancos o resultados en esta entrega.
`git diff --check 2bc6c1c..cac5c50` no señala problemas de formato.

No ejecuté tests de aplicación, reservados, generadores ni nuevas reseñas.
La comprobación de `_` fue una consulta local de categoría Unicode. No se
descargaron datos ni se verificaron contenidos de IANA/UTS #39.

## Próximo paso recomendado

Cerrar §8 del catálogo con las listas, versiones, ámbito y procedimiento de
referencias, incluyendo A1/A2 y la exposición de A3. La siguiente entrega puede
seguir siendo documental; no requiere una nueva propuesta de arquitectura.

Después se podrá presentar el paquete coherente al dueño: alcance residual,
condiciones para publicar, disponibilidad aproximada y ruta de autoría. Hasta
entonces no fijar N ni aceptar por el dueño hipótesis operativas o nuevas
exclusiones. No autorizar implícitamente código o evaluación.

Codex añade sólo esta auditoría. Sin modificaciones de código, nuevos casos,
medición, E2, SQL, Supabase, Producción, APIs externas, gastos, push, merge,
deploy ni AAB. Salas conserva su aprobación y el AAB futuro sigue siendo conjunto
con reseñas, sin versión fijada.
