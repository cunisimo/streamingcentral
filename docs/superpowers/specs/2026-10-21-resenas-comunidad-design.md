# Reseñas de usuarios y Top Yumpers — diseño para revisión

Fecha: 21/10/2026. Borrador de Codex; NO autoriza implementación, migraciones,
servicios pagos, merge, deploy ni publicación. Codex audita; Claude implementa.
El estado operativo sigue en `docs/ESTADO.md`; este documento define el producto
futuro y no afirma que esté construido. El checkout principal tiene cambios ajenos
y documentación anterior: no usarlo como base de implementación por este archivo.

## 1. Intención y alcance acordado con el dueño

Ayudar a elegir qué ver mediante opiniones breves de usuarios, reconocer a los
autores útiles y controlar phishing, spam y otros abusos sin leer manualmente
cada publicación. No sumar otra nota numérica para películas o series.

- Sólo cuentas con sesión leen reseñas de usuarios, perfiles comunitarios y
  Top Yumpers; autorización efectiva en servidor/base, no sólo pantalla.
- Una reseña por usuario y título (`tipo` + id TMDB); escribir, editar y eliminar.
- Texto entre 80 y 600 caracteres, con contador.
- Evaluaciones: “Me sirvió” / “No me sirvió”; una por usuario y reseña, sin
  autoevaluaciones. Mostrar “20 de 29 personas encontraron útil esta opinión”.
  Ausencia de evaluación no indica utilidad ni inutilidad.
- Cinco reseñas de usuarios iniciales; órdenes “Más útiles” y “Recientes”;
  “Cargar más”. Editorial de Yump siempre primera cuando exista.
- Top conserva acceso público a plataformas y agrega selector entre
  “Top semanal plataformas” y “Top Yumpers”. Este último requiere sesión y
  muestra ranking mensual. El Top de plataformas sigue exclusivamente manual.
- Perfil comunitario para cuentas con sesión: nombre elegido, avatar, reseñas
  y evaluaciones de utilidad recibidas. Sin correo, listas, plataformas,
  historial de fichas o de visionado. No inferir identidad real.
- Sin premios, respuestas, comentarios, seguidores, mensajes privados ni
  adjuntos. No promover nuevas reseñas editoriales ni cambiar sus reglas.
- Moderación en el dashboard actual, aprovechando admin + MFA: bandejas de
  pendientes y denuncias, motivos, antecedentes, decisiones registradas.
- Bloqueo personal: oculta reseñas del bloqueado sólo para quien bloquea;
  no sanciona al autor ni cambia el ranking global.
- Suspensión administrativa: impide publicar y evaluar; conserva acceso a
  cuenta y eliminación. Denunciar no suspende ni bloquea automáticamente.
- Filtro antes de publicar y en cada edición; casos dudosos retenidos,
  infracciones claras rechazadas; errores del filtro dejan pendiente con
  reintentos, sin publicación automática ni revisión manual obligatoria de todo.
- Eliminar oculta inmediatamente y recalcula el mes en curso. Sólo conservar
  evidencia interna necesaria de moderación, con plazo definido.
- Cambiar texto reinicia evaluaciones con aviso previo y vuelve a moderar.
  Evaluaciones de versiones anteriores dejan de sumar al mes en curso.
- Top Yumpers: un punto por evaluador distinto y autor dentro del mes; varios
  positivos del mismo evaluador al mismo autor no agregan más puntos. No
  otorgar puntos por publicar. Negativos no restan puntos al autor.
- Retirar evaluaciones, eliminar cuenta o reseña, editarla u ocultarla por
  moderación recalcula el mes actual; meses cerrados conservan sus resultados.
  Empates comparten posición. Mes calendario en fecha argentina.
- Arreglos de compartir salas e ícono del match: desarrollo y prueba local
  aprobados, auditados en `298555a`; cierre documental verificado en `52c7ae7`.
  Viajan en el MISMO AAB que reseñas, sin release separada ni versión fijada.
  No exigir repetir aquella prueba como requisito de este proyecto.

## 2. Evidencia de partida: código leído, no inspección de Producción

Lectura del checkout `wt-integracion-compartir`, punta `52c7ae7`:

- `lib/resenas.ts`: interfaz común y editorial primero; `DetailView` sólo pasa
  editorial y esconde la sección si no hay ninguna. El acceso de usuarios nuevos
  debe mostrar entrada para reseñar/registrarse aunque todavía haya cero reseñas.
- `ResenasAcordeon`: cerrado inicialmente, advertencia de spoilers, scroll propio.
  Conservar ese comportamiento; spoilers no son una categoría de abuso por sí solos.
- `CLAUDE.md` actualizado registra una reseña propia publicada por el dueño el
  03/10. La afirmación anterior de Codex de standby total era desactualizada.
- `user_reviews` existe en `schema.sql`, con texto, estado y unicidad por título.
  Su policy actual permite lectura pública de aprobadas; el trigger conserva
  el estado anterior al editar. NO sirve sin cambios para este diseño: una
  edición de una aprobada podría saltar la nueva moderación. Existencia en SQL
  no acredita estado ni filas reales en Producción.
- Admin tiene comprobaciones en API y base además del guard visual. Extender
  ese modelo a Moderación, sin debilitar MFA ni cambiar las cuentas del dueño.
- Sesión pública en cliente; no asumir autenticación del servidor por cookies.
  Revisar y reutilizar el transporte de tokens y CORS vigente para Android.
- La baja de cuenta existente contempla cascadas: ampliar pruebas a nuevos datos,
  evidencias retenidas y resultados mensuales sin romper ese procedimiento.

## 3. Propuestas de diseño de Codex, todavía revisables

Estas elecciones completan las reglas aprobadas; no atribuirlas al dueño.

### 3.1 Lectura e identidad

Mantener la reseña editorial existente con su acceso actual; el requisito de
sesión se aplica al nuevo contenido comunitario. Cinco usuarios por página más
la editorial fijada, que no consume uno de esos cinco lugares ni recibe votos
comunitarios. Primera vista sin sesión: invitación a registrarse/iniciar sesión,
sin texto, autores, fragmentos ni votos comunitarios en HTML, metadata o API.

Perfil comunitario por identificador no sensible: proyección específica con
campos permitidos; NO abrir SELECT de `profiles` completos. Bloqueo oculta
también el contenido del autor en su perfil; Top mantiene puntuación global y
puede mostrar posición no interactiva “Usuario bloqueado” a quien lo bloqueó.
Desbloqueo disponible. Cuenta eliminada nunca conserva nombre/avatar en rankings.

### 3.2 Texto, estados y concurrencia

Texto plano escapado, sin HTML/Markdown activo; no permitir enlaces ni datos de
contacto. Controlar enlaces/contactos disimulados con reglas y clasificación
contextual; no prometer detección perfecta. Hablar sobre delitos o sexualidad
en una obra no es automáticamente una infracción. Nombre del autor también
requiere controles de abuso/enlaces; cambios de perfil no pueden eludirlos.

Normalizar saltos de línea, Unicode NFC y bordes; contar puntos de código igual
en cliente y servidor. Una escritura idéntica normalizada es no-op: no reinicia
votos. Cualquier otro cambio incrementa versión y reinicia evaluaciones. Antes
de confirmar: “Al editar tu reseña se reinician los votos de utilidad”.

El texto nuevo sustituye al anterior y deja de ser visible mientras se analiza;
el autor ve estado y motivo, puede corregir o eliminar. No restaurar votos al
volver a copiar un texto anterior. Borrar impide lectura inmediatamente;
recrear no recupera votos ni evade suspensión o límites.

Cada decisión del filtro/admin y cada voto identifica la versión exacta.
Respuesta tardía de moderación de una versión vieja nunca publica otra versión
ni resucita una reseña borrada. Ediciones concurrentes usan control de versión;
reintentos de red son idempotentes y no duplican votos, reportes o cargos.
Confirmación de guardado perdido se reconcilia consultando estado.

### 3.3 Orden “Más útiles” y páginas

Propuesta: límite inferior de Wilson con confianza 95% sobre positivos/total,
no porcentaje puro; desempate por fecha descendente y después id estable. Sin
votos: puntuación cero. “Recientes”: fecha de primera publicación descendente
e id estable; editar no permite subir artificialmente por fecha.
Referencia del método (no validación de una población representativa: aquí los
votos son voluntarios): https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm

Cursor ligado a título, orden y versión de conjunto. Si votos/bloqueos/moderación
cambian el conjunto entre páginas, detectar revisión obsoleta y ofrecer recarga
desde el principio, sin mezclar páginas ni repetir/saltar silenciosamente.
Elegir implementación acotada del cursor en el plan, medir costo y evitar
invalidarlo por cambios en otros títulos. Contadores muestran sólo reseñas
visibles para ese lector; votos de revisiones retiradas no se muestran.

### 3.4 Top mensual: contrato de cómputo

Un autor suma una unidad por cada evaluador con al menos un positivo elegible
recibido durante ese mes en una versión actualmente válida y publicada. Es
DISTINCT evaluador/autor/mes, nunca suma de positivos por reseña.

- Un positivo emitido en octubre no vuelve a sumar en noviembre por seguir activo.
- Un positivo nuevo de noviembre sobre una reseña de octubre sí puede sumar.
- Alternar negativo/positivo o retirar/reponer el mismo voto de una versión no
  cambia el mes de su primera evaluación positiva: evita mover votos viejos.
- Si se invalida una reseña, el punto permanece si ese mismo evaluador tiene
  otro positivo elegible al autor en el mismo mes; si no, desaparece.
- Una nueva versión permite una nueva evaluación explícita; sus votos no se
  heredan. Meses: intervalos semiabiertos calculados con zona
  `America/Argentina/Buenos_Aires`, timestamp de base, nunca reloj del cliente.
- No listar autores con cero puntos. Posiciones compartidas con ranking denso.
- Suspensión por abuso: propone excluir al autor de Top mientras esté vigente y
  excluir sus evaluaciones de todas las métricas activas (utilidad visible,
  orden y mes actual). Levantar suspensión recalcula esas métricas sin cambiar
  meses cerrados. Restaurar requiere acción auditada.
- Restaurar una reseña retirada sin editar recupera los votos de esa versión
  para utilidad visible. No los traslada a otro mes ni reabre un cierre: si la
  retirada afectó el cierre anterior, el resultado cerrado se conserva. Mostrar
  ese efecto al admin antes de confirmar. Los votos de versiones editadas nunca
  se recuperan por una restauración.
- Cierre mensual idempotente y reproducible: conservar puntuaciones agregadas,
  no retener nombres de cuentas eliminadas ni identidades de evaluadores para
  sostener un historial. Definir corte consistente frente a operaciones en vuelo;
  registrar un resultado por mes, sin recalcular meses cerrados por operaciones
  ordinarias. Retiros por abuso legal pueden ocultar identidad sin reescribir
  puntuación histórica. No asignar este cierre al cron de Netflix retirado.

### 3.5 Moderación y protección de abuso

Reglas baratas en servidor + clasificador contextual externo mediante adaptador,
no filtro por lista de malas palabras. Texto a analizar es dato no confiable:
ignorar instrucciones contenidas en él, salida estructurada validada, sin
herramientas, navegación, ejecución de enlaces o acceso a datos de cuenta.
Enviar sólo texto necesario; nunca email, tokens o historial personal.

Proveedor/modelo, precio y tratamiento de datos NO elegidos todavía. Claude
debe proponerlos con documentación vigente, un pequeño banco de textos sintéticos
en español argentino y presupuesto para 100/1.000/10.000 operaciones (incluidas
ediciones y reintentos acotados). No contratar ni configurar servicio externo
sin cerrar esa decisión. No afirmar que una API genérica de toxicidad detecta
phishing: demostrar cobertura con ejemplos benignos y maliciosos.

Bloquear enlaces/contactos claros con explicación para corregir; retener casos
dudosos; publicar tras control superado. Sin mecanismo real configurado, mostrar
“pendiente”, no simular aprobación. Caída del servicio o límite de presupuesto:
reintentos limitados, sin bucle y sin publicar por defecto. Guardar proveedor,
versión de reglas, decisión y motivo acotado para auditoría.

Correo confirmado para publicar/evaluar/denunciar; verificar compatibilidad
con proveedores de login existentes. Límites server-side compartidos para
creación, edición, votos y reportes; definir cifras iniciales justificadas en el
plan y permitir ajustes. Controlar duplicados y patrones coordinados. Correo
verificado no demuestra una persona única; no prometer eliminar cuentas falsas.
No rastrear dispositivos ni tratar IP como identidad única.

Denuncias con categorías phishing/estafa, spam, acoso/amenazas, odio,
datos personales, contenido sexual prohibido/explotación y otro; motivo breve.
Una por denunciante y versión/usuario; posibilidad de denunciar tras bloquear.
No aceptar reportes masivos repetidos ni retirar por simple cantidad fija.
Alertas de riesgo grave pueden retener preventivamente con motivo y revisión.
“No me sirvió” jamás equivale a denuncia.

Admin: pendientes de análisis/revisión separados; denuncias; antecedentes
privados mínimos; publicar, rechazar/retirar, descartar denuncia, restaurar,
suspender y levantar suspensión. Motivo y registro de cada acción. Decisiones
atadas a versión y permisos efectivos admin+MFA. Rechazo/retirada notifica al
autor dentro de la app; revisión solicitada una vez por decisión, sin chat.
Suspensiones administrativas no automáticas por salida de IA o número de reportes.
Suspensión no impide denunciar, bloquear, gestionar ni eliminar la cuenta.

### 3.6 Borrado, privacidad y retención

Propuesta inicial, NO plazo legal validado: borrar el texto eliminado y su copia
operativa de moderación en un máximo de 30 días; conservar en ese intervalo sólo
si es necesario para tramitar abuso/revisión. No guardar copias de todo texto
indefinidamente ni texto en logs generales. Registro técnico sin texto ni datos
identificadores al purgar; política explícita de backups y eliminación de cuenta.
Excepción de preservación por obligación concreta debe estar documentada y
restringida, no convertirse en retención por defecto. Confirmar plazo y proveedor
con política de privacidad antes de publicar; no afirmar cumplimiento legal por
este documento.

Separar la purga del texto/evidencias del registro mínimo de sanciones activas:
conservar identificador de cuenta y motivo mínimo mientras sea necesario aplicar
la suspensión; no conservar por eso las reseñas borradas. Política específica
para sanciones finalizadas y baja de cuenta, sin mantener correo, nombre o
identidad pública en snapshots históricos. La eliminación de cuenta no debe
quedar bloqueada por una sanción ni conservarse íntegra por antecedentes.

No mezclar reseñas autenticadas ni perfil del lector con caché pública de
`/api/title`, Home, prerender o metadata. Autorización en cada lectura y escritura;
sin service-role en cliente. Probar acceso directo REST/RPC, no sólo la API propia.

## 4. Condiciones antes del lanzamiento

- Aceptación versionada de términos comunitarios antes de crear contenido;
  prohibiciones claras, reglas de sanción y procedimiento de revisión.
- Política de privacidad: publicación a otros registrados, proveedor de filtro,
  datos enviados/transferencias, conservación, derechos y eliminación.
- Revisar formularios de Google Play (CGU, clasificación y Data Safety) según
  conducta real; no presumir que activar CGU cambia automáticamente una edad.
- Registro obligatorio no exime de moderación: Play incluye contenido accesible
  a un subconjunto de usuarios. Reportes y bloqueos funcionales en la app;
  denuncias atendidas, no sólo un botón. Fuente consultada el 21/10/2026:
  https://support.google.com/googleplay/android-developer/answer/9876937?hl=es
- Operación: el dueño atiende excepciones, no todas las reseñas. Antes de activar
  definir cómo se entera de pendientes graves sin enviar mensajes externos no
  autorizados. Si la cola excede capacidad, pausar nuevas publicaciones, sin
  dejar pasar contenido sin control. Kill switch de publicación y de módulo.

## 5. Entregas y auditoría

Después de aprobar este diseño, Claude prepara un plan por etapas con archivos,
migraciones, rollback, evidencia y criterios de cierre. No implementar todo en
un salto. Propuesta de divisiones (el plan puede ajustar dependencias):

0. Verificar base vigente y objetos/permisos reales con acceso de sólo lectura;
   elegir y presupuestar filtro, resolver la política de retención y preparar
   entorno aislado. No repetir migraciones históricas ni tocar Producción.
1. Datos, versiones, RLS/RPC, proyección de perfiles, bloqueos y suspensión;
   migración aditiva y rollback no destructivo; banco real de Postgres.
2. Escritura/edición/baja + moderación automática + dashboard y denuncias.
3. Lectura protegida, acordeón, perfiles y paginación; utilidades y Top Yumpers.
4. Integración web/Android, textos legales, presupuesto y prueba manual del
   dueño; un AAB con reseñas y los arreglos de salas ya aprobados.

Codex revisa cada entrega contra este contrato, ejecuta verificaciones relevantes
y distingue evidencia propia de informes de Claude. No trasladar automáticamente
autorizaciones de una etapa a otra. No merge/deploy/migración real/publicación
sin autorización correspondiente.

## 6. Criterios de aceptación que no pueden faltar en el plan

- Anónimo no lee reseñas, perfiles, votos ni ranking por UI, API, REST/RPC,
  metadata, export nativo o cachés; Top manual público sigue funcionando.
- Aprobada editada deja de ser visible y pierde votos en una transacción;
  respuesta de filtro atrasada no resucita ni aprueba otra versión.
- Acceso a correo u otros campos de perfil por terceros imposible; admin sin
  MFA no modera; autor no se autopublica ni vota su texto.
- Carrera crear dos reseñas, votar dos veces, publicar vs borrar, moderar vs
  editar, bloquear durante paginación y borrado de cuenta verificadas con base
  real aislada. Tests textuales de SQL no prueban permisos efectivos.
- “Me sirvió” puede cambiar a negativo o retirarse; un solo voto vigente por
  evaluador/versión. Negativos y lecturas no crean puntos mensuales.
- Banco temporal: fin/inicio de mes argentino, votos de obras/reseñas viejas,
  cambios de voto, dos reseñas mismo par, edición, eliminación, restauración,
  suspensión, cuenta borrada y cierre repetido. Agregados cuadran con eventos.
- Filtro probado con phishing disimulado, citas cinematográficas benignas,
  instrucciones maliciosas, timeout, salida inválida, retry y presupuesto agotado.
- Perfil sin reseñas, primera reseña, ceros, empates, texto largo, nombre/avatar
  retirado, errores/reintentos y lector de pantalla con estados accesibles.
- Costos medidos por operación, índices y lecturas acotadas, no consultas por
  autor/reseña en cascada. No confundir fixtures con evidencia de Producción.
- Compatibilidad del AAB 1.2.0 con API desplegada; bundle nuevo probado en
  teléfono antes de publicar, sin forzar revalidación manual de salas como tarea
  independiente. Rollback apaga función conservando datos y lectura segura.

## 7. Estado del documento

Decisiones de producto de §1 acordadas en esta conversación. §3 son propuestas
de Codex para revisión del dueño, no reglas ya implementadas ni aprobadas una a
una. Segunda revisión de implementabilidad realizada por un subagente de Codex:
sin bloqueos del alcance principal; aclaraciones incorporadas sobre suspensión,
restauración después del cierre y separación de sanciones y purga de evidencias.
Faltan elección del filtro y confirmación del diseño completo antes del plan.
No se modificó código de app,
SQL ni configuración; no hubo consulta a datos reales ni pruebas de Producción.
