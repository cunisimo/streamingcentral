# Auditoría final de definición del catálogo — 5982374

23/10/2026. Codex. Rama `feat/resenas-reglas`, worktree
`D:\DESARROLLO\stream central\wt-resenas-comunidad`.
Commit revisado: `59823745c719120a0fed31e408265b13696321d5`.

## Dictamen y cierre de esta revisión

Los tres hallazgos de `77d8bda` están resueltos en la definición: composición
genérica para el enlace espaciado con ruta, verbos de remisión para S3 y estado
pendiente de la condición de uso de IANA. No hace falta otro replanteo general.

**La definición es presentable al dueño con las dos enmiendas literales siguientes.**
Son correcciones de coherencia y conservación de cobertura, no nuevas familias.
Deben incorporarse antes de congelar el contrato o escribir la implementación.
No recomiendo otra entrega extensa de diseño para resolverlas: su incorporación
puede ser el primer commit documental de la próxima entrega que el dueño autorice,
y comprobarse junto con ella. Si se cambia su sentido, sí requiere nueva revisión.

Esto cierra la revisión general del enfoque, **no aprueba E1, no acepta por el
dueño el riesgo residual y no autoriza código ni E2**. E1 necesita todavía la
implementación y la evidencia exigidas por el contrato que finalmente se acepte.

## Enmienda 1 — conservar las rutas de la cobertura vigente

En F3 se añadió una definición global de ruta que exige un segmento de al menos
dos letras o dígitos. Esto vuelve a reducir cobertura ya verificada: el patrón
vigente admite un único carácter y signos al inicio de ruta. Una dirección de
terminación no fuerte como `ejemplo.xy/x` dependía justamente de ese patrón.
F3-3 afirma conservar la cobertura vigente, por lo que no puede heredar esa
restricción nueva.

**Texto propuesto para incorporar:**

> En F3-3, la ruta conserva la clase de caracteres de la versión 2026-10-22.5:
> al menos un carácter de letras, dígitos, `_`, `-`, `.`, `/`, `?`, `=`, `&`,
> `%` o `#`, también al inicio. No exige un segmento de dos caracteres
> alfanuméricos. Las restricciones adicionales contra falsas alarmas de las
> formas nuevas, como F3-4, no se aplican retroactivamente a F3-3.

Actualizar la definición global de ruta para que remita a cada forma y no
contradiga esta excepción de conservación. Los controles de la implementación
deben preservar las rutas cortas y las iniciadas con signos ya auditadas. No
ejecuté ninguna prueba nueva de reseñas en esta revisión documental.

## Enmienda 2 — el control de S3 contiene la condición que dice no contener

La tabla S3 coloca «fíjense en mi nombre favorito de la saga» entre los textos
que publican y explica que no tiene «mi» más una palabra de identidad. Sí tiene
literalmente «mi nombre», precedido de un verbo de §6.R. Por tanto cumple S3-b.
Prometer a la vez esa regla y la publicación de ese control es incompatible.

**Resolución técnica recomendada, sin una exención particular:**

> «Fíjense en mi nombre favorito de la saga» es un texto legítimo que S3-b
> puede retener por ambigüedad. Se registra como falso positivo conocido y
> cuenta en C4 cuando se evalúen legítimas. No es un control prometido como
> publicable. Se mantienen como controles publicables «fíjense en el nombre
> del personaje» y «miren el perfil del villano».

No etiquetar el texto legítimo como abuso para hacer pasar las cuentas ni crear
una exención global por «favorito». El máximo vigente de C4 no aumenta. Si la
implementación no cumple el máximo, la existencia de este ejemplo documentado
no permite aprobarla por excepción.

## Recomendaciones para decidir sin seguir ampliando el diseño

- **IANA:** recomiendo elegir explícitamente la variante ya documentada sin
  incorporar su lista mientras no se acredite su condición de uso. F3-2 y F3-6
  usarían T-fuerte; las otras formas, incluido el enlace espaciado largo, no
  dependen de IANA. Es menor cobertura que la variante completa propuesta y
  debe aceptarse como tal. Fijar esa variante antes de implementar/evaluar;
  no alternarla después de ver resultados. La ampliación IANA puede quedar
  diferida, sin frenar el resto ni enviar consultas a terceros automáticamente.
- **Referencias Unicode:** verificar los archivos locales y sus huellas antes
  de usarlos, conservar sus avisos y probar el plegado. No afirmo verificados
  sus bytes por esta revisión. Son condiciones de implementación, no otra
  discusión de producto.
- **E9:** puede proponerse como límite de alcance explícito. No hay datos de
  uso real que demuestren que los emojis entre números sean frecuentes en
  reseñas o raros como evasión. Presentar esa justificación como hipótesis,
  no como evidencia. Su aceptación sigue siendo del dueño.
- **P-1 y E8:** las exclusiones requieren aceptación explícita. E8 es cobertura
  no certificada, no una garantía de filtrado ni una afirmación de cumplimiento.
  Mantener visibles también los límites de H3 por nombres/minúsculas.
- **P-2:** recomiendo mantener publicación desactivada hasta que estén
  implementadas y probadas todas las defensas y se cierre la aceptación
  correspondiente del filtro. El trabajo local puede avanzar sin habilitarlas.
- **P-4:** la ruta A da mejor evidencia si existe un autor independiente
  disponible. La B puede encargarse como evidencia complementaria, sin afirmar
  independencia; el dictamen de cierre con evidencia limitada dependerá de sus
  resultados y de la aceptación específica del dueño, no de esta auditoría.
- **P-3:** la disponibilidad del dueño sigue pendiente. No inventar N ni un
  compromiso de respuesta; este dato condiciona la activación operativa y no
  obliga a leer todas las publicaciones.

La frase de la propuesta §10.3 según la cual las instrucciones «no tienen un
borde implementable sin pagar un clasificador» es una generalización no
demostrada. Sustituirla por el límite elegido: «no se implementa interpretación
abierta en este alcance». Tampoco un proveedor pago garantizaría resolver todo
texto. No se necesita investigar otro servicio para corregir esa redacción.

## Verificación propia

Leídos diff de catálogo y propuesta, informe v3.1, estado y referencias a las
reglas vigentes. El diff es sólo documental; el módulo sigue intacto respecto
de la versión previamente auditada. `git diff --check 77d8bda..5982374` no señala
errores. No ejecuté reglas, generadores, benchmarks, suite ni nuevos casos.

La atribución incorrecta de CC0 ya fue retirada y está identificada como
pendiente. La distinción entre huellas declaradas por Claude y cabeceras que
Codex pudo contrastar está expresada correctamente. No volví a consultar fuentes
externas en esta entrega ni amplié la conclusión sobre condiciones de uso.

## Próximo paso

Presentar al dueño la recomendación de alcance con estas enmiendas y las
condiciones pendientes. Una vez aceptado el paquete y autorizado un alcance
local concreto, continuar con la implementación de E1 correspondiente, con el
contrato incorporado antes del código. No saltar a E2 ni crear otro reservado
automáticamente. Conservar los resultados fallidos y la evidencia histórica.

Codex añadió sólo esta auditoría. Sin modificaciones de código, consultas de
Producción, SQL, Supabase, servicios externos, gastos, push, merge, deploy ni
AAB. Salas mantiene su aprobación y sigue en el mismo AAB futuro que reseñas,
sin versión fijada.

## Actualización del dueño — 24/10/2026

El dueño confirmó que puede revisar las colas **diariamente**. Estima que al
principio requerirá poco tiempo porque hay pocos usuarios. Esto último es una
estimación informada por el dueño, no una medición de volumen, abuso o capacidad.

P-3 queda respondida en cuanto a frecuencia. No es necesario pedir ahora una
cantidad fija de minutos para continuar el trabajo local. No se acordó un número
máximo de casos por día ni el tope global N: el equipo debe proponer un límite
inicial conservador de admisión, claramente provisional, y contrastarlo con el
trabajo observado antes de la activación y durante el uso. La revisión diaria no
se transforma en lectura de todas las reseñas ni en disponibilidad permanente.

El cierre del análisis se mantiene: dirección técnica definida con las dos
enmiendas literales de esta auditoría, que pueden incorporarse al inicio de la
próxima entrega autorizada sin otra ronda general de diseño. E1 sigue pendiente
de implementación y validación. Esta confirmación de disponibilidad no acepta
por sí sola las exclusiones, la ruta de evidencia limitada ni autoriza código,
Producción, E2 o publicación.
