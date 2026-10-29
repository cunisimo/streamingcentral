# Auditoría focalizada E6 — 27/10/2026

Codex revisó `47024d9`, `ce0e118` y `8cbe0cd` de `feat/resenas-reglas`, en `wt-resenas-comunidad`, contra `662e247`.

## Dictamen

**E6 pendiente de dos correcciones P2: A1 y A2.** No hace falta reabrir el diseño, E1 ni las entregas cerradas. Después corresponde revisar esas correcciones de forma focalizada; E7 no se ejecutó ni se autoriza mediante esta auditoría.

## A1 — El reintento del nombre puede sobrescribir un cambio posterior y consumir cupo dos veces

**Ubicación:** `lib/comunidad/nombre-nucleo.ts:64–71`, `supabase/migrations/019_comunidad_perfiles.sql:130–148`.

El núcleo vuelve a ejecutar la mutación después de una respuesta incierta. La única deduplicación de la base compara el nombre solicitado con el nombre actual. Eso no identifica un intento: si otra sesión cambia el nombre entre la confirmación perdida y el reintento, la comparación deja de coincidir y se vuelve a escribir el nombre viejo. Los rechazos tampoco tienen deduplicación y vuelven a consumir cupo.

**Reproducción propia contra Supabase local, con el núcleo y los adaptadores reales:**

1. Se guarda `Nombre anterior`; se descarta su respuesta después del commit.
2. Antes del reintento, se guarda `Nombre posterior`, confirmado por otra llamada.
3. Se deja continuar el reintento automático de la primera operación.
4. Resultado: las tres llamadas responden `nombre_cambiado`; la base termina con **`Nombre anterior|3`** (nombre y cupo). Una recuperación de respuesta deshace la elección más reciente y consume un tercer cambio.
5. Con el contador propio reiniciado para otro escenario, se rechaza `juan arroba gmail`, se descarta la primera respuesta y se reintenta: `rechazo_contenido`, dos llamadas, **cupo 2 para un envío**.

La pérdida de respuesta y la intercalación se inyectaron en el adaptador; las escrituras y transacciones fueron reales. No se simuló una caída física de red.

**Corrección requerida:** dar una identidad estable al intento o un mecanismo equivalente de recuperación que no vuelva a aplicar una mutación vieja sobre una nueva. Conservar un único consumo de cupo por intento, incluidos los resultados rechazados que cuentan para el límite. Si no se puede confirmar una operación, informar incertidumbre sin volver a escribir de forma insegura. No guardar texto rechazado en claro para resolverlo.

**Regresiones:** respuesta perdida sin intervención, respuesta perdida con un cambio posterior intercalado, rechazo con respuesta perdida y reintentos sucesivos. El nombre posterior debe conservarse; no se duplican escrituras ni cupos. La prueba actual de `sin_cambios` inyectado no distingue este fallo.

## A2 — Cargar más ignora un bloqueo o una baja confirmados por el servidor

**Ubicación:** `components/comunidad/PerfilComunitario.tsx:84–93`.

La primera carga interpreta `cabeceraValida`, pero Cargar más sólo intenta convertir la respuesta en una tanda. Las respuestas válidas `bloqueado` y `eliminada` no tienen `items` ni `orden`; `tandaValida` devuelve null y `alLlegarMas` las trata como errores de red. Se conserva la cabecera activa y toda la lista anterior. Reintentar repite el mismo error mientras siga ese estado.

**Reproducción propia:** dos cuentas ficticias y seis reseñas propias de fixture publicadas mediante la función real. Lectura con JWT y `leerPerfil` real:

| Cambio después de cargar las primeras cinco | Respuesta real a la siguiente página | Resultado del núcleo usado por la pantalla |
|---|---|---|
| El lector bloquea al autor por la función real | `estado: bloqueado`, sin items | conserva 5 reseñas, `errorMas: true` |
| Se desbloquea y después se elimina la cuenta del autor mediante Auth y su limpieza comunitaria | `estado: eliminada`, sin items | conserva 5 reseñas, `errorMas: true` |

No hubo montaje propio de React. La respuesta procede de la base real, se aplica al núcleo real exactamente como lo hace el manejador revisado, y el componente mantiene `cab` sin actualizar en ese camino. El nombre y avatar permanecen en su cabecera porque sigue siendo `activo`. **La base no entrega reseñas nuevas ni datos de identidad en estas respuestas**; el defecto está en aplicar el estado confirmado a la pantalla.

**Corrección requerida:** en una respuesta vigente de paginación, distinguir una tanda de un cambio válido de disponibilidad del perfil. Bloqueo, eliminación y módulo apagado deben retirar lo que corresponda y mostrar su estado, descartando pedidos anteriores. Mantener la conservación de páginas ante fallas reales de red; no tratar un estado válido como una falla. Respetar cuenta, perfil y número de pedido al aplicarlo.

**Regresiones:** cargar más después de bloqueo en otra pestaña y después de baja del autor; sin nombre, avatar ni reseñas anteriores en el estado terminal. Una respuesta tardía de otra cuenta/perfil o de un pedido superado no debe borrar el perfil actual. Una falla real de red sigue conservando la lista.

## Resto revisado

- Nombre comunitario separado de `profiles.display_name`, sin precargar datos privados; validación y reglas en servidor, CHECK de forma en base y función de escritura sólo para servidor.
- Perfil con sesión, proyección específica y permisos explícitos; ruta sin caché compartida. En la consulta real propia se comprobó que no aparecía el uid de cuenta ni correo.
- Avatar público convertido a id del catálogo; la semilla no forma parte de la proyección. Las 337 equivalencias de avatar son evidencia de Claude, no una corrida nueva de Codex.
- Nombre y enlace del autor en la ficha, ruta `/u/?id=`, metadata noindex y entrada en la exportación por permanecer fuera de `APP_FUERA`. No se ejecutó build nativo.
- No guardar un nombre que el filtro retendría evita publicarlo sin una cola existente y el mensaje no promete una revisión inexistente. No se exige construir una cola de nombres en esta corrección.
- Capturas móviles 06 y 07 de Claude inspeccionadas; muestran el autor enlazado, el perfil y los controles. Son evidencia visual de Claude, no recorrido propio.

## Verificación propia y limpieza

- **28/28 pruebas focalizadas**, sin fallos ni omitidas: perfiles, frontera de cuenta y archivos solicitados al ejecutor de pruebas. No equivalen a pruebas de React montado.
- **Tipado:** `npx tsc --noEmit --incremental false`, salida 0.
- Diff `662e247..8cbe0cd` sin problemas de espacios; checkout de Claude sin cambios pendientes al inicio.
- Dos sondas locales descritas en A1 y A2, tres cuentas ficticias en total, y comprobación de la proyección con sesión real. No se levantó servidor de Next ni se ejecutó la batería HTTP de Claude.
- La limpieza de la segunda sonda se detuvo inicialmente por una referencia de `intentos` al participante. Se identificaron los dos UUID propios, se eliminaron sólo sus intentos y participantes y se confirmó el estado final: **6 participantes, 2 versiones, 42 cuentas antiguas de prueba, 2 suspensiones, 0 órdenes, 0 locks consultivos, interruptores apagados y `limite_resenas=5` restaurado**. No quedaron cuentas ni reseñas propias ni se modificaron datos ajenos.

No se repitieron suite completa, baterías generales, up/down/up, mediciones, navegador propio, builds ni Android. La suite completa informada por Claude tuvo dos fallas de barrido y sólo se repitió ese grupo tras corregirlas: no se registra como una suite completa posterior aprobada. No es un hallazgo adicional; conviene completar la corrida al verificar la corrección final.

Se conservan pendientes `/api/title` en ejecución, integración con TMDB, tema claro, teléfono/Android y lector de pantalla. E1, P3 y los límites de lanzamiento no cambian. Salas sigue en el mismo futuro AAB que reseñas, sin versión fijada.

Codex no cambió código ni SQL; sólo escribió esta auditoría y su continuidad en ESTADO. Sin E7, E0, Producción, servicios externos, gastos, push, merge, deploy ni AAB.
