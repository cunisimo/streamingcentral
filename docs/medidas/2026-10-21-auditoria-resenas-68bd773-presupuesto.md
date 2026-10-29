# Revisión documental 68bd773 y restricción de presupuesto

Codex, 21/10/2026. Lectura del diff `f64a659..68bd773` y de secciones de la
revisión v2 en `wt-resenas-comunidad`. No prueba de implementación ni de
Producción. Diff limitado a Markdown; `git diff --check` pasó, checkout limpio,
informe anterior copiado con SHA-256 idéntico.

## Presupuesto: decisión nueva que prevalece

El dueño no acepta gastos adicionales. Los USD 10 eran un tope sugerido para
consumo variable de API, no una cuota fija, servicio contratado ni gasto medido.
No autorizar banco pago, API paga, nuevo servicio pago ni upgrade. Reformular
la moderación; proveedor y gasto dejan de ser decisiones pendientes para esta
versión. El borrador original incorpora esta actualización al comienzo.

Propuesta de Codex para revisión, NO código: reglas propias para enlaces,
contactos, ofuscación, duplicados y spam, límites en base, retención de casos
sospechosos y denuncias/bloqueos/moderación continuada. Definir qué se publica,
retiene o rechaza después de las reglas. No afirmar comprensión semántica ni
equivalencia con un LLM. No exigir lectura manual de todo ni publicar por defecto
cuando un control falla. Pruebas sintéticas locales sin terceros. Verificar cuotas
existentes antes del lanzamiento, sin prometer que aumentar uso de Vercel o
Supabase es gratis por no contratar un proveedor nuevo.

Política Play consultada: exige moderación eficaz continua y controles de
usuarios/contenido, no contratar IA ni un proveedor pago. La propuesta debe
evaluarse por eficacia y operación, no dar cumplimiento por contar con reglas.
https://support.google.com/googleplay/android-developer/answer/9876937?hl=es

## Avances verificados en v2

- Permisos: sustituyó invoker por funciones definer acotadas, revocación de
  permisos directos y matriz de pruebas. Dirección coherente; aún no implementada.
- Paginación: retiró el tope de 200, agrega cursor por clave y snapshot de orden
  para utilidad. Sigue pendiente medir almacenamiento y generación concurrente.
- Separó confirmación, autoconfirmación y recuperación; ya no impone #22.
- Reconoce `sala-barrido` del repositorio y que jobs efectivos no se inspeccionaron.
- Corrige distinción esfuerzo/pensamiento, límites de evidencia y estimaciones.
  Su selección paga queda superada por el presupuesto nuevo, sin necesidad de
  seguir eligiendo entre modelos pagos para esta etapa.

## Problemas que siguen pendientes antes del plan

1. **Baja de cuenta y cierre:** §2.2.4 permite borrar aunque falle la preparación
   y marcar el mes “no reconstruible”. No satisface el cierre histórico acordado;
   tampoco define limpieza de identificadores si quedan tramos con id original.
   Proponer atomicidad/estado persistente idempotente y reintento compatible con
   la baja, sin convertir una falla en pérdida aceptada silenciosamente. No
   atribuir aprobación del dueño a ese nuevo estado degradado. Evitar confundir
   seudonimización con anonimización o ausencia de obligaciones de retención.
2. **Quince minutos no son una prueba de consistencia:** §2.2.7 sólo acota votos,
   pero ediciones, moderación, suspensión y baja también cambian intervalos.
   Definir el orden/corte para TODAS las operaciones y probar bloqueos/carreras.
   No declarar resuelto por un margen fijo y un statement_timeout propuesto.
3. **Invariantes SQL:** §2.1.3 sugiere CHECK de autoevaluación “vía la versión”.
   Un CHECK con referencia a otra tabla no basta como formulación: decidir si
   se conserva autor redundante con FK compuesta, trigger o función, sin
   subconsulta directa no admitida en CHECK y sin permitir alterarlo al cliente.
4. **Snapshots de utilidad:** lista completa sin tope por título necesita
   medición de tamaño/TTL y evitar que varios lectores creen snapshots a la vez.
   Retiradas y bloqueos requieren revalidación sin consultas ilimitadas. El
   contador puede cambiar más de “uno o dos”; ése no es un límite garantizado.

Son observaciones de diseño: no se reporta vulnerabilidad ejecutada ni test
fallido de código nuevo. No repetir suite de app por un cambio documental.

## Siguiente entrega a Claude

Revisión v3 documental sin proveedor pago ni banco externo; incorporar presupuesto
en estado canónico y diseño de su rama, marcando antecedentes superados. Explicar
límites de reglas y operación de excepciones; resolver los cuatro puntos anteriores
con propuestas técnicas. Mantener aprobación local de salas y AAB conjunto.
No código, SQL, servicios, migraciones, merge, deploy o publicación.
