# Auditoría de la propuesta de alcance — 4ef9a51

23/10/2026. Codex. Rama `feat/resenas-reglas`, worktree
`D:\DESARROLLO\stream central\wt-resenas-comunidad`.
Commit revisado: `4ef9a5168d4fb972510ecaac20ec6e4cce48dda0`.

## Dictamen

La dirección de separar barrera mecánica, señales y moderación humana es razonable.
El diagnóstico mejora la explicación de los fallos y mantiene el resultado del
reservado 3 como no aprobado. La condición de no publicar antes de implementar
las defensas operativas también es correcta como parte de los gates ya previstos.

**No recomiendo aprobar todavía el paquete D1–D7 ni los nuevos criterios tal
como están escritos.** Faltan definiciones técnicas y hay contradicciones que
resolver en documentación antes de pedir decisiones al dueño. E1 sigue sin
aprobarse. No se autorizan reglas, nuevo reservado, E2 ni publicación.

## A1 — P1: el procedimiento permite cambiar el código después de la prueba final sin cerrar su evidencia

Propuesta §3.2, líneas 293–302: si la evaluación final falla dentro del catálogo,
se permite otra corrección y se verifica sólo con generador/regresiones. Esa
versión ya no es la que recibió la evaluación independiente. El generador aporta
evidencia técnica útil, pero no transforma resultados de otra versión en una
validación independiente de la versión corregida.

Cerrar el ciclo no debe convertir una prueba final fallida en aceptación por
agotamiento de rondas. La propuesta debe definir de antemano qué evidencia permite
cerrar cada versión y qué pasa si falla la última evaluación. Una opción coherente
es congelar antes de la prueba final y, si falla, conservar el resultado como
fallido sin una corrección posterior con aprobado implícito. Si se propone otra
forma de aceptación con evidencia limitada, debe identificarse como tal, pendiente
del dueño; no llamarla cumplimiento del criterio independiente.

También hay una diferencia entre el resumen «una ronda y un único conjunto» y
la corrección adicional prevista después del conjunto. Debe explicitarse sin
autorizar nuevos ciclos automáticamente.

## A2 — P1: no queda definido un mínimo para señales sensibles que el producto sí pretende frenar

§3.1 deja amenazas, odio y datos personales como informativos y traslada al dueño
inventar un umbral técnico en D6. Los datos anteriores muestran amenazas explícitas
publicadas: no es solamente ironía o amenaza velada fuera de la capacidad.

No recomiendo aceptar como suficiente un aprobado del catálogo de contactos
si no existe una condición explícita para las formas sensibles incluidas en el
alcance. Proponer antes de implementar/evaluar qué señales se promete retener,
sus controles narrativos legítimos y su criterio de cierre. Las amenazas veladas
y otros fenómenos contextuales pueden seguir separados como límites declarados.

No impongo retrospectivamente un porcentaje al reservado 3. Pido un contrato
futuro revisable que el equipo técnico justifique. El dueño decide el riesgo y
la carga operativa que acepta; no debería tener que inventar la métrica de odio
o amenazas sin una recomendación técnica y sus consecuencias.

## A3 — P2: el catálogo aún no permite aprobar C1a/C2a y hay afirmaciones de imposibilidad excesivas

La descripción de §2.2 es una orientación, no el catálogo cerrado y auditable
que requieren los criterios nuevos. Faltan los límites exactos de cada
transformación, las combinaciones incluidas, la decisión esperada y los controles
legítimos. Esto puede quedar como propuesta pendiente; no presentarlo al dueño
como un criterio ya especificado y listo para aceptar.

El catálogo debe incluir la cobertura mecánica prometida que falló, o justificar
de forma visible cada exclusión. No definir «dentro» como «lo que implementamos».
Mantener los resultados de fuera del catálogo visibles, con motivos revisables
de clasificación, sin mover casos entre categorías después de medir. La reducción
de alcance no debe ocurrir sólo por cambiar el denominador.

§1.3 afirma «Ninguna regla determinística puede armar el número». Es incorrecto
como afirmación general: instrucciones con una gramática concreta pueden
implementarse determinísticamente. Otra cosa es decidir no implementar su
interpretación o no poder cubrir lenguaje natural arbitrario. También es excesivo
decir que todo dato repartido en más de tres textos exige interpretar: a veces
sólo falta la ventana de historial. Distinguir incapacidad del módulo actual,
límite elegido del producto e imposibilidad universal.

«Cualquier signo Unicode», «todas las terminaciones» y el producto cartesiano
del generador necesitan límites verificables. No prometer exhaustividad si se
usan representantes de clases. El generador debe documentar qué enumera y qué
muestrea, sin equivaler cobertura combinatoria a cobertura semántica universal.

## A4 — P2: ambigüedad sobre retener por verbos sueltos y ausencia de respuesta para sobrecarga humana de denuncias

§2.2.2 indica que una raíz verbal «sola» retiene, pero el contrato de señales
combinadas exige varios indicios. Palabras como «busca», «pasa» o «sigue» son
habituales en reseñas. Aclarar que no se dispara por ese indicio aislado, o
proponer explícitamente el cambio con controles. El tope C4 no demuestra por sí
solo que una nueva regla conserve esas palabras: hay que probar los controles.

§2.4 describe bien la admisión de **retenidos** al llenarse la cola. Sin embargo,
la cola de **denuncias** no se cierra en el diseño y las publicaciones limpias
siguen entrando. Un tope de almacenamiento o un N de retenidos no garantiza
que el dueño pueda procesar denuncias a la velocidad de llegada.

La propuesta debe describir qué se hace cuando se supera la capacidad humana en
cada cola: prioridad, atraso, contenido que sigue visible, decisión de pausa y
reanudación. No introducir ocultamiento automático por cantidad de denuncias
ni pausa automática global (decisiones anteriores rechazaron esos atajos).
Tampoco prometer que la cola quedará bajo control sin conocer frecuencia de
revisión y volumen. Pedir al dueño disponibilidad aproximada es apropiado; las
hipótesis operativas y topes técnicos debe proponerlos el equipo, sin atribuirlos
a decisiones ya tomadas.

## A5 — P2: atribuciones y estado que no están sustentados

- §2.4, líneas 225–226, dice que el dueño rechazó el muestreo P6. El antecedente
  vigente de la revisión §1.4 dice **«No está aceptado»**, y `ESTADO.md` mantiene
  ese estado. No equivalen. La propuesta puede eliminar el muestreo sin
  reintroducirlo ni pedirlo, pero debe presentarlo como recomendación actual,
  no como decisión del dueño que no consta.
- §0 afirma que no existen reseñas de usuarios publicadas. Está comprobado
  que el **módulo nuevo** no está conectado; no se comprobó el contenido de
  Producción. El esquema conserva la tabla heredada `user_reviews` y una
  política de lectura de aprobadas (`supabase/schema.sql:285–300`). Redactar el
  estado sin afirmar inexistencia de filas o de contenido legado no consultado.
  E0 sigue sin autorizarse; este hallazgo no autoriza consultas para verificarlo.
- §3.2 atribuye a Play una conclusión normativa sin fuente o verificación en
  esta entrega. Retirar esa atribución o sustentarla con documentación oficial
  en una revisión adecuada; no usarla como prueba de cumplimiento. Esta
  auditoría no evalúa cumplimiento de Play ni aporta una conclusión legal.

## Qué sí queda verificado y bien encaminado

- Los cambios de `4ef9a51` son sólo documentación. El módulo, bancos, sellos y
  resultados JSON no aparecen en el diff.
- La cuenta de 38 fallos generales está desglosada en 22 mecánicos, 13 señales,
  un caso de instrucciones adicional y dos de spam; las tres instrucciones
  citadas no deben sumarse otra vez porque dos ya están contadas arriba.
- La corrección de «clase de signos» a lista finita es consistente con el código.
  Discord y otras redes ya estaban listadas: atribuir sus fallos a formas de
  pedido y ventanas es más preciso que llamarlas simplemente redes nuevas.
- La explicación de lo perdido por C1a/C2a es explícita y conserva el resultado
  anterior como fallido. Esa transparencia debe mantenerse al concretar el catálogo.
- El estado canónico ya distingue la medición híbrida realizada de la falta
  de independencia integral. El espacio final del informe anterior se corrigió.
- `git diff --check 4183d37..4ef9a51` no señala errores.

No ejecuté reglas ni reservados ni repetí suite/tipado: no cambió código. La
revisión es documental, contrastada con implementación y antecedentes.

## Siguiente entrega recomendada

Una corrección documental de estos puntos y una recomendación técnica concreta
de criterios, sin pedir siete aprobaciones técnicas al dueño. Separar con claridad
las decisiones de producto de las decisiones de implementación y medición.

La dirección de D1 y la condición de D7 son razonables. D3 no cambia el máximo
vigente de C4 ni obliga a aceptar un aumento medido que todavía no existe. D4
requiere disponibilidad del dueño; D2, D5 y D6 necesitan una especificación
corregida antes de pedir aprobación informada. Ninguna queda aprobada por este
informe. Conservar presupuesto sin gastos adicionales y revisión humana selectiva.

Codex sólo añade este informe. Sin cambios de código, nuevos casos, evaluación,
E2, SQL, Supabase, Producción, APIs externas, gastos, push, merge, deploy ni AAB.
Salas mantiene su aprobación y el AAB futuro sigue siendo conjunto con reseñas,
sin versión fijada.
