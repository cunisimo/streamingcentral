# Auditoría de implementación local del contrato v1 — bbb8fc7

24/10/2026. Codex. Rama `feat/resenas-reglas`, checkout revisado
`D:\DESARROLLO\stream central\wt-resenas-comunidad`.
HEAD `bbb8fc7`, código principal `7e6e5cd`, reglas `2026-10-24.1`.

## Dictamen

Verifiqué las pruebas y las huellas locales comunicadas. Hay una implementación
real del nuevo contrato, pero **no está lista para congelar ni medir de forma
independiente**. Encontré defectos reproducibles del evaluador, cobertura del
generador inferior a la prometida y una exención que permite publicar una amenaza
explícita. E1 sigue sin aprobarse. No preparar el reservado 4 ni avanzar a E2.

Los hallazgos siguientes son correcciones de implementación y medición del
contrato ya autorizado. No requieren otra ronda general de diseño.

## A1 — P1: los contactos y las legítimas complementarios pueden aprobar como validación independiente

`lib/comunidad/reglas/banco/evaluar-contrato.ts:129–133` exige autoría independiente
sólo para los mínimos CS. Los mínimos generales, C1a/C2a y C3/C4 no la filtran
(líneas 194–196 y criterios posteriores).

Construí un control **sintético del arnés**, no un reservado, con los casos
positivos ya generados: 30 H1, 30 H2-R, 10 H2-N y 30 H3, más una legítima y un
contacto ofuscado. Los identificadores eran únicos; se usaron los mínimos por
defecto del evaluador. Las etiquetas de autoría son datos de esta prueba unitaria,
no una afirmación de independencia real de estos textos.

- Control positivo: `evaluable: true`, `aprobado: true`.
- Cambiando **sólo** a complementaria la autoría del contacto y de la legítima:
  `evaluable: true`, `aprobado: true`.

Así se obtiene un aprobado sin un solo contacto independiente. El contrato sí
exige independencia para esa parte, aunque el dueño elija evidencia limitada
para H. Separar mínimos y métricas independientes de resultados complementarios
en todas las familias/legítimas correspondientes, no sólo CS. Probar el control
negativo y que agregar casos complementarios fáciles no diluya las tasas
independientes. El protocolo final debe fijar sus tamaños expresamente: los
mínimos generales de 1 no son un protocolo final suficiente por sí mismos.

## A2 — P1: un banco con una reseña de un carácter puede aprobar por rechazo de formato

La validación sólo comprueba que `texto` sea string (`evaluar-contrato.ts:107`),
sin validar el largo normalizado de cada tipo. `detectado` considera cualquier
salida diferente de publicar como detección, incluyendo `rechazo_formato`.

En el mismo control positivo, sustituí el texto del caso F1 por `x`, conservando
su metadata. Resultado:

- `evaluable: true`, `aprobado: true`;
- salida del caso: `rechazo_formato`;
- familias disparadas: `[]`;
- C1a: `cumple`, `0/1` sin detectar.

El banco inválido aprobó sin detectar el contenido. Validar antes de evaluar el
esquema completo, largos según la misma normalización de la aplicación,
contextos y límites, marcas y coherencia de tipos. Un fallo de admisión/formato
no debe disfrazarse de detección de contacto en el banco de contenido. Agregar
pruebas con textos cortos, largos, sólo espacios y contextos inválidos; conservar
los controles positivos. No resolverlo excluyendo silenciosamente esos casos
de los denominadores o rebajando requisitos.

## A3 — P1: una frase legítima cercana anula una amenaza en otra oración

`reglas.ts:804–808`, `dentroDeExcluida`, acepta una expresión exceptuada hasta
12 caracteres después del final del match de amenaza, sin exigir que sea la
expresión amenazante ni la misma oración.

Reproducción sintética propia, con el prefijo legítimo usado en las pruebas del
proyecto y longitud válida:

- `Te voy a pegar un tiro.` → `retener`, `amenaza.directa`.
- `Te voy a pegar un tiro. La rompe esta peli.` → `publicar`, sin disparos.

«La rompe» es una expresión exceptuada, pero no modifica ni vuelve figurada la
amenaza precedente. Acotar la excepción al uso idiomático que realmente explica
el match, no a otra frase por proximidad. Probar controles legítimos y pares en
ambos órdenes, con puntuación y saltos de línea. Una exclusión no debe eximir
otra forma incluida, conforme al contrato. No es un problema de interpretación
abierta: es un bypass concreto de H1 recién implementado.

## A4 — P2, requisito antes de congelar: el 100% generado no cubre el generador prometido

Los 2091 casos sí pasan sus pruebas. Sin embargo, el inventario está incompleto:

1. **C:** el catálogo pide 200 confusables de letra. `generador.ts:181` toma sólo
   20, y además sólo los cuyo destino sea `o`. No es una muestra de toda la
   clase prometida. La diferencia se informa parcialmente como 20 en el reporte,
   pero no está autorizada como reducción del contrato.
2. **D9:** la tabla tiene 353 caracteres; el generador produce 164 casos D9.
   `generador.ts:117` descarta `c.length !== 1`, que elimina los 189 caracteres
   astrales porque su longitud UTF-16 es dos. No significa que tengan más de
   un punto de código. Corregir la enumeración para incluirlos.
3. **Categorías Unicode:** `separadoresDe`, línea 80, vuelve a clasificar los
   caracteres con las propiedades Unicode del runtime (17.0), aunque el contrato
   fija 18.0. Con los archivos incorporados comparé las categorías: el runtime
   omite un `Ps` (U+2E62), un `Pe` (U+2E63), dos `Po`, 45 `Sm` y 31 `Mn` de
   la referencia. Por tanto, ni siquiera Ps/Pe están enumeradas por completo.
   Usar la referencia fijada para las categorías del generador, no el runtime.
4. **D4/D7/D8 y combinaciones:** hay un ejemplo de superíndices, ninguno de
   subíndices y unas pocas frases de dictado que no enumeran las palabras
   prometidas. Los pares implementados son básicamente forma de dígito por
   separador, no el recorrido de pares por familia que declara el contrato.

Agregar comprobaciones de **inventario y cobertura**, derivadas de las listas
y referencias, además de comprobar que lo generado pasa. Un requisito de
«más de 1000 casos» y un 100% sobre el propio resultado no detectan que falten
dimensiones. No bajar el inventario para conservar el verde. Si al completarlo
aparecen fallos, corregir el mecanismo correspondiente dentro del alcance y
conservar los controles legítimos; no etiquetar las omisiones como otra familia.

## A5 — P2: se pierde el salto de línea que delimita las oraciones del contrato

`ambito.ts` declara el desvío, pero no lo corrige: `base`/`acentuada` colapsan
`\n` en espacios y H2 termina cruzando oraciones que el contrato separa.

Control propio, con prefijo válido:

- `El documental muestra inmigrantes. La plaga del cultivo explica el conflicto.`
  → `publicar`.
- El mismo texto con salto de línea en lugar de `. ` entre ambas oraciones
  → `retener`, por `odio.lista`.

El contrato define también el salto de línea como fin de oración y H2 exige la
misma oración. Este falso positivo no es consecuencia de aplicar literalmente
el contrato: es una diferencia de implementación. Conservar las fronteras o un
mapa de posiciones equivalente al plegar. No ampliar silenciosamente el ámbito
ni pedir al dueño que lo acepte como si fuera el contrato ya aprobado.

## Verificación propia y referencias Unicode

- Reglas: **99/99**, sin omitidas.
- Tipado: `tsc --noEmit --incremental false`, exitoso sin errores.
- Suite: **2348 pruebas, 2330 aprobadas, 0 fallidas y 18 omitidas**.
  Las omitidas requieren artefactos web/Android no generados aquí.
- Generador: inventario de **2091** casos confirmado; sus pruebas de salida y
  familia pasan. Esto no prueba la cobertura omitida descrita en A4.
- Recalculé SHA-256 directamente sobre los bytes locales de las referencias:

| Archivo | SHA-256 verificado por Codex |
|---|---|
| DerivedGeneralCategory.txt | `d6b151d2d40ee9b1876d26f417980f45ffae47b6055ccf7203cb31f07a030f94` |
| confusables.txt | `6ed3ee967c9dfdf6677d563c9985182fbc50a2efb7d6059cd57b2e2ce18f5b92` |
| license.txt | `e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96` |

Coinciden con las huellas fijadas. La prueba de regeneración de tablas pasó
dentro de la suite. Esta verificación es de los bytes incorporados frente a
las huellas fijadas; no una nueva descarga independiente del servidor oficial.

Reservados originales y `banco/evaluar.ts` histórico: sin cambios en el diff.
Las regresiones explícitas pueden informar los falsos positivos sin ocultarlos
en C3/C4; no equivalen a evaluación independiente. No ejecuté ningún script de
reservado 4 ni preparé un conjunto inédito.

`git diff --check` global señala espacios del archivo oficial confusables y
líneas finales de referencias. **No recortar esos archivos para limpiar el
diff:** se conservaron como bytes fijados. El check excluyendo el directorio
de referencias oficiales no señala errores.

## Sobre las cuatro propuestas de cambio y la cola

No recomiendo convertir las cuatro propuestas de Claude en decisiones urgentes
del dueño antes de corregir A1–A5. Primero hace falta evidencia local fiable.

Los importes con «número» y los tokens «4K»/«M3GAN» son falsos positivos reales,
confirmados y ya admitidos por las listas del contrato. Si luego se propone
ajustarlos, justificar el disparador de contacto débil frente al fuerte y
medir los pares; no introducir una lista de títulos ni eximir en bloque todos
los alias alfanuméricos. La excepción por comillas merece especial cuidado:
ya hubo un bypass por comillas en E1.1. No aprobar un permiso general por
envolver una solicitud en una cita. Las retenciones legítimas permitidas por
C4 deben seguir contando, sin relabeling ni limpieza del banco.

N=20 está correctamente presentado como hipótesis, no como decisión del dueño.
La revisión diaria está confirmada, pero no acredita por sí sola una capacidad
de veinte casos. Mantener N provisional y sin activar publicación hasta que se
acepte la operación y existan las defensas. No hace falta fijar un tiempo diario
para corregir el módulo local.

## Siguiente alcance recomendado

Corregir A1–A5 con pruebas negativas del arnés, inventario verificable del
generador y pares de seguridad/legitimidad. Repetir verificaciones locales y
detener para auditoría. Mantener el contrato salvo las correcciones técnicas
necesarias para implementarlo; cualquier cambio de producto sigue separado.
No preparar el reservado 4 ni cerrar E1 con estos tests.

Codex no cambió código; añadió sólo este informe en el checkout principal.
Sin E2, SQL, Supabase, Producción, APIs de moderación, gastos, push, merge,
deploy ni AAB. Salas conserva su aprobación y la actualización Android sigue
siendo conjunta con reseñas, sin versión fijada.
