# Auditoría de revisión v3 — 97cf4d7

Codex, 21/10/2026. Revisión documental `68bd773..97cf4d7` y lectura de v3.
Sólo Markdown en el diff; checkout de Claude limpio y `git diff --check` sin
errores. No hubo ejecución de app, SQL, proveedor, migración ni Producción por
esta auditoría. No modificar código todavía. Estado operativo en ESTADO.md de
la rama vigente; este informe nuevo local no afirma implementación ni aprobación.

## Conclusión

La dirección sin proveedores ni gastos adicionales está respetada. Las propuestas
de permisos, FK compuesta y paginación avanzaron; no requieren volver a discutir
el alcance de producto. Faltan correcciones puntuales antes del plan. No pedir una
nueva revisión de cientos de líneas: aplicar erratas concretas y trasladar las
pruebas técnicas al plan y a la base aislada.

## 1. Alto — Matriz de autorización por acción, no un guard común

Revisión §2.1.2 (líneas 155–170) agrupa crear/editar/borrar, evaluar, denunciar,
bloquear y cambiar nombre como escrituras y enumera para todas: no suspensión,
interruptor de publicación, términos y correo. Eso puede impedir retirar una
reseña al autor, bloquear a un acosador o denunciar durante una pausa/suspensión.
Contradice reglas previas: la suspensión impide publicar y evaluar, no gestionar
o eliminar cuenta; el diseño propone explícitamente mantener denuncia y bloqueo.

Separar matriz por operación: publicar/editar/evaluar; retirar voto/borrar reseña;
denunciar; bloquear/desbloquear; gestionar/eliminar cuenta. Las medidas de
protección y borrado no deben depender del interruptor de publicación, aceptar
nuevos términos para publicar, pasar el filtro textual ni tener nombre comunitario
aprobado. Aplicar sólo controles pertinentes y límites independientes a denuncias.
Mantener control de propiedad y sesión en todas las operaciones. Comprobarlo con
casos de suspensión, correo pendiente, cambio de términos y módulo apagado.

## 2. Alto — Ocultar por una denuncia y saturación permite censura barata

§3.3.2 (líneas 536–545): basta una cuenta con correo confirmado y menos de tres
denuncias descartadas para retener cualquier contenido eligiendo categoría grave.
Un atacante dispone de varias ocultaciones antes de revisión, y con cuentas
nuevas reinicia el cupo. Confirmar email no aporta por sí solo credibilidad al
reporte. Además, §3.3 convierte una cola de más de 50 en “sólo retener” para todo
lo nuevo, alimentando más la cola y extendiendo el ataque a publicaciones legítimas.

No ocultar sólo por la categoría declarada: definir corroboración automática
independiente, riesgo comprobable o decisión admin; casos sin corroboración entran
priorizados a revisión y bloqueo personal inmediato disponible. No crear un nuevo
umbral fijo de reportes como reemplazo. Separar cola de denuncias de publicaciones
retenidas y limitar crecimiento/admisión por autor y globalmente. Pausar admisión
de nuevas publicaciones al exceder capacidad, en vez de aceptar una cola ilimitada;
conservar denuncias y borrado. Probar ataques coordinados y ausencia de efecto de
“No me sirvió” sobre moderación. No prometer protección perfecta contra cuentas falsas.

## 3. Medio — Rechazo sin texto ni versión no permite revisar una decisión

§3.3/§5 rechazan sin conservar texto; §5 a la vez promete revisión a pedido. Un
registro con regla y fecha no alcanza para revisar un falso positivo concreto.
Definir rechazo básico de formato (corregir sin caso) frente a decisión moderable.
Opción mínima: al rechazar por regla de contenido, permitir que el autor solicite
revisión y envíe esa copia como retenida, con id, versión de reglas y plazo de
retención. No guardar todos los rechazos indefinidamente ni obligarlo a reenviar
por correo. No convertir el envío a revisión en publicación ni en vía de elusión.

Relacionado: aclarar §3.4 para edición rechazada/fallida. ¿No se guarda texto nuevo
y se conserva versión anterior, o se retira la anterior y se reinician votos?
Normalización inválida, fallo técnico, reintento del mismo intento y edición
aceptada son operaciones distintas. Una edición no persistida no debe borrar por
accidente la reseña anterior ni reiniciar varias veces los votos. Mantener aviso
al autor y las decisiones aprobadas de reinicio al cambiar texto persistido.

## 4. Medio — P6 propone releer todo; no fue aceptado por el dueño

P6 y §3.5: revisar lo publicado cada día por semanas puede significar leer cada
reseña, la carga que el dueño dijo que quería evitar. No asumir aceptación ni
convertirla en requisito duro de lanzamiento. Proponer muestreo acotado, por
ejemplo hasta 5 publicaciones seleccionadas al azar por revisión, junto con
pendientes/denuncias priorizados; tamaño/frecuencia son propuestas, no aprobados.
No afirmar que ese muestreo certifica eficacia. Si se requiere cobertura humana
mayor por los resultados, explicitar el compromiso de alcance y operación antes
de lanzar; no trasladar esa carga silenciosamente.

## 5. Medio — El bloqueo compartido no ordena mutaciones de una misma entidad

§2.2.4: tomar compartido K_CORTE y luego clock_timestamp ordena frente al cierre,
pero los compartidos NO se excluyen entre sí. Dos operaciones de la misma
reseña/voto pueden tomar tiempos t1<t2, aplicar t2 primero y luego t1 si no hay
serialización por entidad antes del timestamp, generando intervalos fuera de orden
o un rechazo/versión obsoleta que el argumento no contempla.

Fijar orden de locks y validación de versión/estado: K_CORTE compartido, locks de
entidades afectadas en orden estable, releer estado, después marca y mutación.
No dar por concluida la prueba por el lock global. Incluir también el borrado
Auth que ya adquiere locks antes del trigger, para evitar ciclos de deadlock;
timeouts y rollback seguro no sustituyen un orden explícito. Consultas del cierre
deben usar snapshot posterior a obtener el exclusivo, con aislamiento documentado.

En §2.2.2, la condición de puntos representa el instante anterior a T, pero
suspensión “en T” puede excluir retroactivamente por una sanción iniciada
exactamente en T. Usar el mismo lado del corte para TODOS los intervalos. Banco
de igualdad exacta en T y dos sesiones sobre la misma entidad, además de las
carreras ya propuestas.
Fuente de semántica de locks:
https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS

## Precisiones para el plan, sin nueva decisión del dueño

- Cuotas: snapshots con vida lógica de 2 h pero purga diaria pueden persistir
  físicamente más tiempo; 12 por título sólo acota snapshots vigentes, no todo
  el almacenamiento. Medir índices/TOAST y generación; leer 50 posiciones de un
  array no demuestra costo físico constante respecto del tamaño total.
- Plegado: variantes 1→i/l son alternativas, no una sustitución única. Especificar
  detección de dígitos antes del plegado destructivo y prueba de falsos positivos.
  No aplicar anomalías de 80–600 caracteres/8 palabras a nombres de 2–24.
- Shingles de tres palabras durante 90 días conservan fragmentos del texto,
  no sólo una señal opaca. Preferir hashes de shingles y enlazar purga con
  borrado de reseña/cuenta; tampoco presentar esos hashes como anónimos.
- Avatar de catálogo evita nuevas subidas de imágenes; decir “sin riesgo de
  contenido” es absoluto innecesario. Conservar catálogo y controles existentes.
- Sin clasificador externo no hay un nuevo tercero, pero siguen Vercel y Supabase:
  sustituir “no hay copias de terceros” de §5 por esa precisión.
- Las reglas y umbrales son hipótesis para pruebas, no eficacia medida ni
  cumplimiento de Play ya certificado. Fuente consultada:
  https://support.google.com/googleplay/android-developer/answer/9876937?hl=es

## Entrega siguiente

Claude aplica correcciones puntuales a v3 y al estado de su rama, sin reescribir
todo el documento ni implementar. Informa qué decidió técnicamente y qué sigue
pendiente de validación. Mantener presupuesto sin gasto y AAB conjunto con salas.
El acceso de sólo lectura a Producción no está autorizado por este informe;
aprovechar avances independientes mientras no se obtenga ese acceso.
