# Auditoría del resultado híbrido del reservado 3 — 4183d37

23/10/2026. Codex. Rama `feat/resenas-reglas`, checkout revisado
`D:\DESARROLLO\stream central\wt-resenas-comunidad`, HEAD `4183d37`.

## Dictamen

**E1 no cumple su aceptación.** C1 y C2 fallan según el protocolo y la enmienda
aceptada. No cerrar E1, no habilitar publicación ni avanzar a E2 por este resultado.
El informe de Claude comunica correctamente el incumplimiento y la limitación de
autoría. No corresponde convertirlo en aprobado excluyendo casos o bajando umbrales.

No recomiendo encadenar automáticamente otra corrección general y otro reservado.
Primero hace falta decidir el alcance siguiente a partir de la cobertura observada
y de la carga de revisión que el dueño acepte, manteniendo sus restricciones de
presupuesto y de no leer cada publicación.

## Verificación propia sin repetir la medición

Leí protocolo/enmienda, informe, resultados guardados, diff del ejecutor y casos
seleccionados ya divulgados. Recalculé las cuentas uniendo los casos sellados con
las decisiones guardadas, **sin invocar el evaluador sobre el conjunto completo**.
Comprobé 376 resultados con identificadores únicos, presencia de cada caso,
archivo de origen, etiquetas y coherencia de los indicadores de error/detección
con la decisión registrada.

| Cuenta | Verificado |
|---|---|
| C0, errores | 0/376 |
| C1, claros sin detectar | 24/116, no cumple |
| C2, ofuscadas detectadas | 69/99, no cumple |
| C3, reseñas legítimas rechazadas | 0/160 |
| C4, reseñas legítimas retenidas | 0/160 |
| N1, nombres legítimos frenados | 0/30 |
| Diferencias con etiqueta registradas | 60 |

Recalculé también la cobertura: odio 3/12, amenazas 4/8, datos personales 7/8,
spam 7/12, derivación al perfil 2/4 y fuera de capacidad 0/8. Las categorías
sensibles son complementarias, no independientes. C0 abarca las dos partes;
C1–C4 proceden de la general. No hay que llamar independiente a todo el total.

Las siete huellas de código coinciden con el congelamiento y el diff del módulo
respecto de `a8e973a` está vacío. Verifiqué las dos huellas del sello, incluida la
general original `8d9e1714…8d0f83c7`. Los reservados anteriores, el protocolo
original y el archivo general no cambiaron en esta entrega.

Git registra primero la enmienda/ejecutor (`8f6513b`), luego complementarios y
sello (`48cb2f7`), y finalmente resultados (`4183d37`). Es evidencia consistente
con el procedimiento informado, no prueba absoluta de las lecturas de los agentes
ni de que nunca existió una ejecución externa al registro.

## Los fallos no se explican sólo por instrucciones complejas

Casos como formar el teléfono con años o con una fecha requieren interpretar
instrucciones. Es correcto conservar sus etiquetas selladas; el protocolo ya
definía como claro un contacto reconstruible sin adivinar y el autor declaró su
interpretación antes de medir. No los reclasifico para aprobar.

También hay huecos mecánicos y solicitudes directas. Para descartar que todo
fuera una falla del ejecutor, hice comprobaciones sintéticas locales de familias
ya divulgadas, con prefijo legítimo y longitud válida. **No son otra medición
independiente ni una repetición del reservado:**

- Un teléfono separado por `⁃`, con pedido de contacto, se publica.
- Una invitación «entren a mi Discord, mi usuario es cine.fan#4821, mándenme
  solicitud…» se publica.
- La amenaza explícita «te voy a pegar un tiro» se publica.
- Como controles, una reseña normal se publica y un enlace ASCII convencional
  se rechaza. Otra redacción de contacto por Discord con «agregame» se rechaza.

Por tanto, **Discord ya existe en la lista** y no corresponde atribuir su caso
fallido sólo a una red desconocida: la combinación de verbos y forma del pedido
también importa. Del mismo modo, no todo fallo constituye una familia nueva;
hay variantes de familias que ya estaban dentro del alcance.

Los hallazgos sensibles son relevantes para el producto aunque no tengan umbral
formal en C0–C4. Cumplir esos criterios en una futura medición no bastará por sí
solo para dictaminar buena cobertura de amenazas o discriminación.

## Límites de lo que se puede concluir

- El 69,7% corresponde a este conjunto sintético: no estima la eficacia real ni
  demuestra un empeoramiento respecto del 87,2% de otro conjunto distinto.
- Cero falsas alarmas aquí no elimina los falsos positivos documentados antes:
  este conjunto no incluyó sus mismas combinaciones. No afirmar que el filtro
  ya no tiene falsos positivos.
- Corregir los 60 fallos conocidos puede ser útil como regresión, pero no prueba
  por sí mismo generalización a textos nuevos. Los reservados divulgados dejan
  de servir como validación inédita de cambios posteriores.
- Las tres evaluaciones no prueban que toda moderación por reglas sea imposible.
  Sí muestran que esta implementación todavía no sostiene su aceptación y que
  una lista creciente de excepciones no debe convertirse en un ciclo sin cierre.

## Próximo paso recomendado: decisión de alcance, sin nueva implementación automática

Antes de otro lote de reglas, separar expresamente:

1. Qué formas mecánicas promete cubrir el filtro y cuáles son fallos de esa
   cobertura, con ejemplos y controles legítimos.
2. Qué señales indirectas pueden justificar retención sin reconstruir un dato.
3. Qué abuso necesita contexto y dependería de las denuncias y de la moderación.

Las defensas adicionales (límites por cuenta, denuncias, bloqueos, suspensión,
revisión administrativa) ya forman parte del diseño; todavía no están implementadas
y no deben invocarse como protección existente. Su futura presencia tampoco
convierte en aprobado el resultado de E1.

El siguiente encargo debería ser una propuesta acotada y revisable que confronte
esas capas, el alcance real del filtro y la capacidad de revisión del dueño.
Debe conservar presupuesto sin gasto adicional y no imponer lectura diaria de
todo lo publicado. Si propone cambiar la aceptación, mostrar exactamente qué
cambia y por qué, sin reescribir el resultado fallido como éxito. No prescribir
una API paga ni presentar una API gratuita como solución autorizada.

Sólo después de esa decisión corresponde autorizar cambios y una estrategia de
validación. Este informe no autoriza un reservado 4 ni un ciclo automático de
ajustes y reevaluaciones.

## Observaciones documentales menores

El resumen vigente de `docs/ESTADO.md` todavía afirma «sin validación independiente»
y pide decidir una medición futura inmediatamente después de registrar el reservado
3. Debe distinguir «medición híbrida realizada, con parte general de autoría
separada declarada, resultado no aprobado» de «sin validación independiente
integral». El siguiente paso vigente debe reflejar el resultado actual.

`git diff --check f3ca9a5..HEAD` señala un espacio al final de la línea 158 de
`docs/medidas/2026-10-23-informe-claude-reservado-3.md`. Es formato menor, no la
causa del dictamen.

No repetí suite, tipado, builds ni navegador: no cambió el módulo y esas pruebas
no resuelven sus fallos de detección. Codex sólo añadió este informe, sin tocar
código ni cambios ajenos. Sin nueva evaluación oficial, E2, gastos, servicios
externos, SQL, Supabase, Producción, push, merge, deploy o AAB. Salas mantiene
su aprobación y el AAB futuro sigue siendo conjunto con reseñas, sin versión fijada.
