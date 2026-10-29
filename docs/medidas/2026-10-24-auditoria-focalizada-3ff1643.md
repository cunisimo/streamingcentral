# Auditoría focalizada de las cinco correcciones — 3ff1643

24/10/2026. Codex. Código revisado: `3ff164302c0bd3f94c6327c927ae6c5593e2f149`,
reglas `2026-10-24.2`; HEAD documental `73c8fab`, rama `feat/resenas-reglas`,
worktree `D:\DESARROLLO\stream central\wt-resenas-comunidad`.

## Dictamen

**A1, A2, A4 y A5 quedan resueltos en esta revisión focalizada.** A3 mejora, pero
queda un bypass de la misma excepción ya señalada: omitir la puntuación vuelve
a permitir publicar la amenaza. Es el único bloqueo que dejo de esta revisión.

No se requiere otra ronda general de diseño ni cambios de producto. Corregir
esa condición concreta antes de congelar la siguiente candidata. E1 sigue
pendiente de validación independiente; no se autoriza E2 ni publicación.

## Verificación propia

- Reglas: **115/115**, sin omitidas.
- Generador: **2871 casos**, salida esperada y disparo propio aprobados en
  las pruebas; inventario incorporado y probado.
- Tipado: `tsc --noEmit --incremental false`, exitoso sin errores.
- Suite completa: **2364 pruebas, 2346 aprobadas, 0 fallidas y 18 omitidas**.
  Las omitidas requieren los builds no generados para esta entrega.
- `git diff --check bbb8fc7..73c8fab`, excluyendo referencias oficiales:
  sin errores. No se tocaron sus bytes, los reservados, sellos, resultados
  históricos ni el evaluador histórico.

No ejecuté un reservado 4 ni creé un conjunto independiente. Las comprobaciones
propias siguientes son controles sintéticos del arnés y regresiones divulgadas.

## Hallazgos cerrados

### A1 — autoría

El evaluador filtra por independencia en mínimos y métricas, con complementarios
aparte. Reproduje un banco sintético positivo con los mínimos actuales: aprueba.
Al cambiar sólo a complementaria la autoría de contactos y legítimas, pasa a
`evaluable: false`, `aprobado: false`. La suite también cubre que los casos
complementarios fáciles no diluyan una tasa independiente fallida.

Los mínimos finales por defecto ahora son explícitos y no pueden reducirse
pasando requisitos menores. Esto no convierte las plantillas de la prueba en
evidencia independiente: son sólo un control de funcionamiento del evaluador.

### A2 — formato

En el mismo control positivo, sustituir el texto F1 por `x` devuelve banco no
evaluable y no aprobado, con el motivo de largo normalizado inválido. Se valida
el esquema, largos y contextos antes de medir. Un rechazo de formato ya no es
detección y C0 lo trata como fallo. Las pruebas negativas de espacios, nombres
y contextos pasan.

### A4 — generador

Verifiqué 200 muestras C, los 353 casos D9 y presencia de subíndices. El
generador usa ahora las categorías de la referencia Unicode fijada. Leí las
pruebas de inventario de clases, palabras, listas y pares; pasan junto con la
prueba de salida y disparo propio. No amplié la revisión a familias nuevas.

Se mantiene declarada la limitación de 18 muestras C «sin ancla»: verifican F3
con ruta, pero no demuestran por sí mismas el mapeo de ese carácter. No ocultar
esa diferencia en el informe ni convertir el 100% de salidas en una promesa de
cobertura semántica o de mapeo directo de las 200 muestras. No la convierto en
otra ronda de rediseño ni en un bloqueo adicional de esta revisión.

### A5 — fronteras de oración

Reproduje el control legítimo de inmigrantes y una plaga de cultivo en dos
oraciones separadas por salto de línea: ahora publica, igual que con punto.
El ámbito reconoce el salto y las pruebas de señales contiguas y teléfonos
partidos siguen pasando. El desvío anterior quedó corregido.

## A3 — P1, único pendiente: la excepción sigue siendo genérica cuando no hay puntuación

`reglas.ts`, `dentroDeExcluida`, sigue aceptando **cualquier** expresión de la
lista de exclusiones que continúe al match sólo con espacios. La ausencia de
puntuación no demuestra que esa frase vuelva idiomática la amenaza.

Resultados propios, con el prefijo válido usado por el proyecto:

| Texto añadido | Salida |
|---|---|
| `Te voy a pegar un tiro.` | retener |
| `Te voy a pegar un tiro. La rompe esta peli.` | retener |
| `Te voy a pegar un tiro, la rompe esta peli.` | retener |
| La misma amenaza y frase separadas por salto de línea | retener |
| `Te voy a pegar un tiro la rompe esta peli.` | **publicar, sin disparos** |
| `Lo voy a matar de risa con este chiste a mi hermano.` | publicar, control legítimo |

**Corrección acotada solicitada:** vincular la excepción a una unidad idiomática
compatible con el propio verbo/expresión de daño. No basta que la frase esté
pegada. Por ejemplo, «matar de risa» o «matar el tiempo» pueden explicar esos
usos; «la rompe» después de «pegar un tiro» no explica el match y no debe eximirlo.
Conservar los controles legítimos sin inventar una interpretación abierta del
lenguaje ni eliminar la cobertura de amenazas explícitas.

Agregar el par con y sin puntuación y sus controles de uso idiomático. Es una
continuación del hallazgo A3, no una familia nueva ni un cambio del catálogo.

## Siguiente paso para avanzar

Una corrección pequeña de A3, versionada y comprobada con sus pares y las
verificaciones locales pertinentes. No pedir otra propuesta documental ni
decisiones sobre los cuatro cambios opcionales de falsos positivos para resolverla.

El siguiente encargo puede combinar esa corrección con la **preparación** del
protocolo/ejecutor de validación, si el dueño lo autoriza expresamente: congelar
la versión corregida después de sus checks y mantener separada la creación y
evaluación del conjunto. La ruta de autoría sensible sigue necesitando definición;
no asumir independencia ni autorización híbrida. No ejecutar otro reservado por
inercia, ni transferir una evaluación a código que cambió después.

Mi próxima comprobación de esta corrección debe ser concreta: verificar la
condición y los pares descritos, sin reiniciar el diseño o exigir cobertura de
nuevas familias. Un eventual bloqueo real se informará como tal; no se promete
aprobar una versión que todavía publica esta amenaza.

Codex añadió sólo este informe, sin cambios de código. Sin SQL, Supabase,
Producción, gastos, APIs de moderación, E2, push, merge, deploy ni AAB. La revisión
diaria del dueño está registrada; N=20 sigue siendo hipótesis. Salas conserva
su aprobación y el AAB futuro sigue siendo conjunto con reseñas.

## Decisión posterior del dueño — 24/10/2026

El dueño indicó expresamente que acepta que una frase de este tipo pueda pasar
el filtro y ser denunciada por otro usuario, para revisarla él. No quiere seguir
iterando sobre ese caso. Mantiene la disponibilidad de revisión diaria ya registrada.

**Esta decisión supera el carácter bloqueante de A3 y la exigencia de corregirlo
antes de avanzar expresadas arriba.** Se conserva el hallazgo como limitación
conocida y riesgo residual aceptado por el dueño, no como detección implementada.
No pedir otra corrección ni otra ronda general de diseño por este caso.

La revisión focalizada de correcciones locales queda cerrada con esa limitación
aceptada. Las cuatro correcciones verificadas siguen cerradas y la implementación
candidata no cambia por esta decisión. No se alteran resultados, etiquetas,
sellos o métricas históricas, ni se elimina el caso de una futura medición para
obtener un aprobado. No se hereda una aceptación general de cualquier otro fallo.

El circuito de denuncia y revisión es una defensa prevista, todavía pendiente
de implementación y pruebas. La decisión no habilita publicación sin esas
defensas ni demuestra una eficacia del filtro que no se haya medido. La
validación independiente sigue sin realizarse; no declararla aprobada por esta
aceptación puntual. Tampoco autoriza SQL, Producción, despliegues o AAB.
