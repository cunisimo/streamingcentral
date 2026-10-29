# Auditoría de alcance v2 y catálogo — 2bc6c1c

23/10/2026. Codex. Rama `feat/resenas-reglas`, worktree
`D:\DESARROLLO\stream central\wt-resenas-comunidad`.
Commit revisado: `2bc6c1c954621405ef5ed6b888fcc4082685b9b1`.

## Dictamen

La v2 resuelve el principal defecto del procedimiento anterior: cada evaluación
pertenece a una versión congelada, un cambio no hereda el resultado y una prueba
final fallida no permite un aprobado implícito. También mejora la separación de
las dos colas y corrige las atribuciones sobre P6, Producción y Play.

La dirección técnica puede mantenerse. No hace falta otro replanteo general.
**El contrato aún no está listo para aprobarse como especificación de implementación:**
hay contradicciones puntuales en CS, autoría, exclusiones y cobertura del catálogo.
E1 sigue sin aprobarse; no hay autorización de código, casos, evaluación o E2.

## A1 — P1: precisar CS por familia y corregir su justificación numérica

La propuesta, §3, exige al menos 30 casos por familia, pero describe el 95% sobre
«las formas explícitas H1–H3» sin fijar si el umbral se aplica a cada familia o al
agregado. Esto cambia materialmente el criterio: con 30 casos por familia, detectar
30, 30 y 26 da 86/90 = 95,56% agregado, aunque la tercera familia sólo alcance
26/30 = 86,67%.

Recomendación técnica: fijar explícitamente el umbral **por H1, H2 y H3**, con
denominadores y mínimos por separado; publicar también el agregado. La partición
de nombres y reseñas de H2 debe declararse para que los casos fáciles no oculten
un subgrupo sin cubrir. No se aplicará retrospectivamente al reservado 3.

La frase «con ocho casos, un fallo es 12,5%, por lo que el criterio no discrimina»
es incorrecta. Con ocho, un umbral del 95% exige ocho aciertos: sí distingue 8/8
de 7/8. Treinta da una granularidad más fina (permite un fallo), pero no demuestra
por sí solo una eficacia poblacional del 95%. Presentarlo como mínimo práctico de
cobertura/granularidad, no como garantía estadística ni cifra de eficacia real.

## A2 — P1: la ruta de autoría limitada contradice la aceptación independiente obligatoria

§4.1 requiere que el conjunto independiente cumpla CS para aceptar V. §4.2 y P-4
permiten que Claude, que conoce las reglas, escriba la parte sensible como
evidencia limitada. Esa parte puede probarse y ser útil, pero no satisface el
requisito independiente de CS tal como quedó escrito.

Definir dos rutas documentales consistentes antes de pedir la decisión:

- Autoría separada: evaluación independiente de CS, si realmente se mantiene
  esa separación.
- Autoría conocedora de reglas: CS complementario/no independiente, con dictamen
  explícito de evidencia limitada y aceptación específica del dueño si se quisiera
  usar para cerrar esa parte. No rotularlo «CS independiente aprobado» ni dar por
  sentado que cumple §4.1.

La autorización híbrida del reservado 3 fue específica de aquella entrega; no
autoriza automáticamente este nuevo contrato o conjunto.

## A3 — P1: una exclusión no es una exención general para publicar

§2.1 dice que «lo que cita una exclusión [...] pasa». El catálogo, E1/E2 y otras
entradas, dice en cambio que si también hay una señal se retiene. Un texto puede
contener una instrucción excluida y, a la vez, un enlace completo o una amenaza
explícita incluida. La mera presencia de una exclusión no debe anular la detección.

Especificar una prioridad única de resultados y cómo clasificar casos mixtos.
Una exclusión delimita la parte de la evidencia no prometida; no permite sacar
del denominador un dato completo incluido que aparece en el mismo caso. Cuando
coexistan contacto completo y señal sensible, definir además qué salida prevalece
y cómo se computa CS: evitar que los contratos exijan simultáneamente rechazar y
retener exactamente el mismo texto.

P-1 dice «se publique hasta que alguien lo denuncie», pero §5.2 deja visible el
contenido denunciado hasta la decisión administrativa, salvo que una regla lo
retenga. La aceptación del dueño debe describir ese riesgo correctamente:
denunciar **no garantiza retiro ni ocultamiento inmediato**. El bloqueo personal
y la revisión administrativa son operaciones distintas.

## A4 — P2: cerrar inconsistencias del catálogo antes de llamarlo congelable

No pido nuevas familias. Hay que conciliar las promesas y las definiciones que ya
contiene el documento:

- **F1** define grupos de 1 a 4 dígitos. No explicita un teléfono completo sin
  separadores (un grupo de 8–13) ni la relación exacta del máximo con prefijos
  opcionales. Incluir la escritura convencional sin espacios y aclarar cómo se
  cuentan prefijos, antes de implementar o generar casos.
- **Separadores S y generador:** S incluye `Ps`, `Pe` y `Me`, pero no fija cómo
  los recorre el generador; el muestreo agrega `So`, que no está en S. Conciliar
  los conjuntos y las reglas de enumeración/muestreo. No hay que ampliar el
  alcance para arreglar una diferencia entre tablas.
- **Exclusión E8** usa «sin las palabras de la regla actual» como frontera.
  Eso vuelve a definir cobertura por la implementación, en contra de §0.
  Separar una exclusión de generación de material del alcance del producto;
  cualquier frontera por lista debe quedar declarada y versionada, no depender
  de lo que el módulo detecta hoy.
- Las listas cerradas sensibles, la versión de Unicode y los datos de referencia
  están pendientes. El propio informe dice que las listas se fijarían durante la
  implementación. Si definen el alcance y los denominadores, deben fijarse como
  parte del contrato antes de congelar/implementar ese alcance, o el documento
  debe identificarse como borrador pendiente de ese cierre, no catálogo aprobado.

El diff de `2bc6c1c` sólo contiene Markdown: **no se incorporaron copias de IANA
ni UTS #39 en esta entrega**. Son una propuesta de datos futuros, con versión y
procedimiento por fijar. Corregir cualquier redacción o resumen que sugiera que
ya fueron copiados, verificados o integrados. No consulté esos servicios ni
validé sus contenidos en esta auditoría.

## Condiciones operativas

La separación de retenidos y denuncias está mejor especificada. La alerta de
72 horas está marcada como hipótesis, no como compromiso aceptado ni garantía
de respuesta. Mantenerla así; el dueño todavía no indicó disponibilidad.

Pausar publicación nueva no retira el contenido ya visible. Este límite debe
permanecer claro en la decisión P-1 y en el procedimiento de respuesta al atraso.
No introducir ocultamiento por cantidad de denuncias ni publicación automática
de retenidos vencidos. El lanzamiento sigue dependiendo de todas las defensas
implementadas y probadas, no sólo de los documentos del filtro.

## Verificación y siguiente paso

Leídos propuesta v2, catálogo completo, informe, cambios de estado y antecedentes.
El diff contiene sólo documentación. `git diff --check 4ef9a51..2bc6c1c` no señala
errores. No hay cambios en el módulo, evaluador o scripts en esta entrega. No
repetí pruebas, tipado, benchmarks ni reservados: ninguna medición resolvería
estas contradicciones documentales.

Recomiendo una conciliación puntual de A1–A4, manteniendo el procedimiento por
versión y la operación ya corregidos. Después se podrá presentar al dueño un
paquete coherente de alcance residual, disponibilidad y elección de evidencia,
sin pedirle que resuelva porcentajes o contradicciones técnicas. No se aprueba
ninguna de esas decisiones por este informe.

Codex añade sólo esta auditoría, sin modificar código o archivos ajenos. Sin
nuevos casos, ejecución de reservado, E2, datos de Producción, SQL, Supabase,
servicios externos, gastos, push, merge, deploy ni AAB. Salas mantiene su aprobación
y sigue en el mismo futuro AAB que reseñas, sin versión fijada.
