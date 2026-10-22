# Auditoría documental v3.1 — e34c53e

22/10/2026, Codex. Diff `97cf4d7..e34c53e`, lectura de secciones modificadas y
contraste con `lib/eliminar-cuenta.ts` del checkout `wt-resenas-comunidad`.
Commit sólo Markdown, checkout limpio; `git diff --check` pasó. No se ejecutó
suite de aplicación, SQL, proveedor ni Producción: no hay implementación nueva.

## Resultado y alcance

Los puntos de permisos por acción, denuncias sin ocultamiento arbitrario,
colas separadas, revisión voluntaria de rechazos y ediciones fallidas quedan
resueltos a nivel de propuesta. Muestreo de hasta cinco sigue explícitamente
sin aceptar por el dueño; no exigir leer cada reseña. Snapshots por segmentos,
invariantes y protocolo de corte tienen criterios suficientes para llevarlos
al plan y probarlos en base aislada, no para declararlos ya correctos en ejecución.

No hace falta otra revisión completa del producto. Hay una laguna importante
en la baja a resolver antes de implementarla; puede incorporarse al plan con
un contrato explícito y pruebas, sin otra reescritura extensa.

## A1 — Alto: cuenta activa entre desvinculación comunitaria y deleteUser

§2.2.3 describe dos transacciones: `baja_comunitaria(uid)` confirma y rompe el
vínculo del participante; luego Auth `deleteUser`. Si Auth falla, la cuenta
sigue pudiendo iniciar sesión, pero el participante ya quedó huérfano. No hay
en la propuesta un marcador persistente por cuenta de baja en curso ni una
prohibición de recrear participante. “Reintentar completa la baja” no cierra
esa ventana: otro cliente/sesión puede publicar entre ambos pasos o antes del
reintento, y la próxima búsqueda por uid no encuentra el participante original.
Puede reiniciar límites/identidad comunitaria y complicar la aplicación de
sanciones o el resultado del borrado pedido. No se afirma un exploit de código
implementado: es un caso no definido en el protocolo documental.

Corrección técnica a incluir en el plan:
- intención/estado de baja persistente ligado a la cuenta mientras existe Auth;
- marcarlo y cerrar/desvincular lo comunitario con idempotencia;
- impedir recreación de participante y nuevas mutaciones de publicación/votos
  mientras la baja esté en curso; mantener gestión y reintento de la baja;
- integrar el marcador en cada ingreso de escritura pertinente, incluso carreras
  que ya habían verificado el Bearer antes de marcarlo;
- reconciliar Auth eliminado/respuesta perdida/fallo temporal, sin decir que la
  cuenta se eliminó cuando sólo se borró su comunidad;
- definir limpieza del marcador y tratamiento de cualquier cancelación explícita,
  sin introducir restauración automática de datos o evaluaciones borrados.

Banco mínimo: paso 1 confirmado + deleteUser fallido; intento de publicar desde
otra sesión durante la ventana; voto ya en vuelo; reintentos simultáneos de baja;
Auth eliminado pero respuesta perdida; participante inexistente previamente.
No inventar una garantía atómica entre dos llamadas que no comparten transacción.

## Precisiones para el plan, sin reabrir decisiones de producto

- La red de seguridad de borrado desde panel admite aborto/deadlock y rollback;
  definir reintento seguro y procedimiento admin. No pedir al dueño elegir una
  estrategia de locks ni prometer “prohibir” una operación del panel sin mecanismo.
  Probar el camino real de Auth aislado, no sólo borrar participante con SQL.
- En §2.2.3 hay texto de la v3 que dice que la reconstrucción “no depende de
  preparación previa” junto al nuevo protocolo que sí tiene preparación. Conciliar
  el estado documentado sin afirmar atomicidad de toda la baja en dos pasos.
- El cierre sólo “ocurre una vez al mes” para el resultado, no para cada llamada
  concurrente al endpoint: hacer comprobación rápida del cierre existente y
  revalidar bajo lock para no adquirir el exclusivo global en cada lectura.
- `id_intento` debe ligarse a cuenta/acción y hash de petición; un id reutilizado
  con otro texto no puede recuperar éxito de otra petición ni servir de oráculo.
  Prever idempotencia también para creación cuando aún no existe id de reseña.
- Cola de denuncias: límite por cuenta y agrupación reducen volumen pero no dan
  una cota global bajo número ilimitado de cuentas. Medir/limitar recursos sin
  anunciar que toda denuncia está atendida ni censurar automáticamente contenido.
- Secreto de HMAC: clave nueva aleatoria dedicada, server-only y sin reutilizar
  claves de Supabase/Auth u otros secretos; crear/configurar sólo en la etapa
  autorizada. No implica un proveedor ni cuota nuevos.

## Próximo paso

Preparar el plan por entregas con A1 resuelto en el contrato de baja y pruebas
tempranas de permisos, concurrencia y fallo parcial. Confirmar decisiones de
retención/carga humana antes de activar publicaciones, no bloquear toda la
planificación esperando esas decisiones. E0 de Producción sigue sin autorización:
preparar consultas de sólo lectura revisables y continuar tareas independientes
con fixtures locales. No ejecutar producción, código, migraciones, pagos, merge,
deploy ni AAB por este informe. Salas conserva prueba local aprobada y AAB conjunto.
