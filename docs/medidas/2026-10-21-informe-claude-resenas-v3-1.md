# Informe para auditoría — revisión v3.1 de reseñas

21/10/2026. Claude Code. Rama `docs/resenas-comunidad`, sobre `97cf4d7`.
Sólo documentación:
- sin código, SQL, migraciones ni consultas a Producción;
- sin proveedores ni gastos;
- sin push, merge, deploy ni AAB.

Corrige los hallazgos de
[`2026-10-21-auditoria-resenas-97cf4d7.md`](2026-10-21-auditoria-resenas-97cf4d7.md)
(copiada sin cambios, SHA-256 `099CAB0E…68BBA595`). No reescribe la
revisión: cambia las secciones afectadas de
[`2026-10-21-resenas-comunidad-revision.md`](../superpowers/specs/2026-10-21-resenas-comunidad-revision.md).
Todo sigue siendo **propuesta**; nada está aprobado.

| # | Hallazgo | Corrección | Sección |
|---|---|---|---|
| 1 | Guard común para todas las escrituras | Matriz por operación. Protección y borrado (retirar voto, borrar reseña, bloquear, gestionar/eliminar cuenta) no dependen de pausa, suspensión, términos, correo, filtro ni nombre comunitario. Denunciar exige correo por decisión del diseño. Pruebas por estado | §2.1.2 |
| 2 | Ocultar por una denuncia; "sólo retener" con cola llena | Ninguna denuncia oculta por categoría ni por cantidad. Retiene sólo la corroboración por las reglas vigentes o el admin; lo demás se prioriza. Colas separadas; admisión a retenidos acotada por autor y en total; lo limpio sigue publicándose; pausa total sólo manual | §3.3, §3.3.2 |
| 3 | Rechazo sin texto no se puede revisar | Rechazo de formato frente a rechazo de contenido. El autor puede enviar el texto como retenido `revision_solicitada`, con id, `version_reglas` y regla; nunca se publica sin admin | §3.3.3, §5 |
| 3b | Ediciones rechazadas o fallidas | Tabla por caso: sólo un texto persistido cambia la vigente y reinicia votos, una vez. `id_intento` para reintentos | §3.4.1 |
| 4 | P6 como lectura de todo | Colas más un muestreo de hasta 5 por sesión. Propuesta no aceptada; no certifica eficacia; un compromiso mayor se explicita antes de lanzar | §3.5, P6 |
| 5 | Compartido no ordena una misma entidad | Orden: `K_CORTE` compartido → entidades en orden estable → relectura → marca → mutación. `READ COMMITTED` y una sentencia posterior al exclusivo en la consolidación. Mismo lado del corte para tramos y suspensiones. 11 casos concurrentes | §2.2.2, §2.2.4 |
| — | Precisiones | Snapshots en filas de 100 ids, por TOAST y cota física; plegado en dos pasadas con clases para confusables; nombres sin reglas de anomalía; hashes de shingles con clave; avatar; Vercel y Supabase siguen tratando el texto; umbrales como hipótesis | §2.3, §3, §3.1, §3.3.1, §3.4, §5 |

**Para mirar con atención**
- **Baja de cuenta (§2.2.3):** para respetar el orden de locks, el camino
  normal pasa a ser `baja_comunitaria(uid)` en la ruta y después
  `deleteUser`. Si el primer paso falla, no se borra la cuenta.
  - El trigger sobre `participantes` queda como red de seguridad para bajas
    hechas fuera de la ruta. Ese camino invierte el orden y puede terminar en
    un deadlock que Postgres aborta.
  - Es una excepción documentada.
  - Revisar si es aceptable o si conviene prohibir la baja fuera de la ruta.
- **Aislamiento de la consolidación:** con `REPEATABLE READ` la instantánea
  se fija al esperar el lock y no vería lo confirmado durante la espera.
  Por eso se propone `READ COMMITTED` con el cálculo en una sentencia
  separada.
- **Admisión con la cola llena:** lo que pasa las reglas se sigue publicando.
  Es la decisión que evita que un ataque frene las publicaciones legítimas.
  Revisar si es aceptable para la capacidad que fije P6.
- **Hash con clave:** requiere un secreto de servidor nuevo, en el mecanismo
  de variables de entorno ya existente. No es un servicio nuevo.

**Pendiente**
- P3, P4, P5 y P6 del dueño. P5 (lectura de Producción) no está autorizada.
- Las pruebas de E1–E7: ninguna está escrita ni ejecutada.
- Las cifras (límites, topes de cola, muestreo, 100 ids por fila) son
  hipótesis.
- MFA editorial: trabajo separado, sin implementar.
- Salas conserva su prueba local aprobada y viaja en el mismo AAB que
  reseñas, sin versión fijada.
