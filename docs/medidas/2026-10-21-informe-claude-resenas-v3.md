# Informe para auditoría — revisión v3 de reseñas (sin gastos)

21/10/2026. Claude Code. Rama `docs/resenas-comunidad`, sobre `68bd773`.
Sólo documentación:
- sin código, SQL, migraciones ni consultas a Producción;
- sin proveedores ni gastos;
- sin push, merge, deploy ni AAB.

**Qué pedir revisar.**
[`docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md`](../superpowers/specs/2026-10-21-resenas-comunidad-revision.md)
v3. Las soluciones son **propuestas**; ninguna está aprobada.

**Archivos copiados sin cambios del checkout principal:**
- tu informe sobre `68bd773` (SHA-256 `DE0967A5…0196A7`);
- el diseño con tu actualización de presupuesto (`8DB24114…577F38D`).
  Después de copiarlo le agregué sólo una nota de registro que remite a la
  revisión.

**Respuesta a tus cuatro puntos**

| # | Problema | Propuesta (revisión) |
|---|---|---|
| 1 | Baja de cuenta: estado "no reconstruible" e ids originales | §2.2.3: tabla `participantes` con `user_id … on delete set null`. Votos, tramos y resultados referencian al participante, nunca al usuario. Los tramos se cierran con un trigger `AFTER UPDATE OF user_id` en la misma transacción del borrado: o todo o nada, y se retira el estado degradado. Se aclara que es dato seudónimo, no anónimo. Los consolidados guardan a los huérfanos sin id |
| 2 | Corte consistente, no sólo para votos | §2.2.4: toda operación que toca tramos o suspensiones toma `pg_advisory_xact_lock_shared` y, después, `clock_timestamp()`; la consolidación toma el exclusivo y calcula en `T(M)`. Incluye el argumento de corrección y sus precondiciones, y pruebas con sesiones concurrentes. El margen de 15 min se retira |
| 3 | `CHECK` de autoevaluación con otra tabla | §2.1.3: autor redundante, `unique (id, autor_participante)` en `versiones`, FK compuesta y `CHECK (evaluador <> autor)` de la misma fila. Transiciones y "versión vigente" van por trigger, no `CHECK`. `IS NFC NORMALIZED` se verifica en E2 |
| 4 | Snapshots sin tope | §2.3: `bigint[]`, generación con un solo generador por título (bloqueo consultivo y búsqueda doble), cota 12 por título en 2 h, purga de vencidos, revalidación de 50 posiciones por pedido y contador sin cota prometida. Tamaños estimados, no medidos |

**Puntos nuevos para mirar con atención**
- **Cambio respecto de v2 (§2.1.2):** las escrituras comunitarias pasan a
  ser ejecutables sólo por `service_role`, porque las reglas corren en la
  ruta. Si fueran ejecutables por `authenticated`, un RPC directo las
  saltearía. Riesgo aceptado: depender de la ruta para las reglas. Las
  invariantes de la base siguen valiendo.
- **Rechazos, retenciones y publicación (§3.3).**
  - Un rechazo no se guarda.
  - Un fallo revierte la transacción: no hay "pendiente por fallo".
  - La cola tiene una pausa automática por umbral.
  - Revisar si los umbrales y las listas son defendibles.
- **Vías de elusión (§3.4):** el contacto partido entre reseñas queda como
  limitación, con una mitigación parcial.
- **Cuotas (§4):** los datos son del panel de septiembre. No se afirma que
  alcancen.
- **Pregunta nueva al dueño, P6:** período supervisado a posteriori. Es
  carga operativa del dueño, no un cambio de producto.
