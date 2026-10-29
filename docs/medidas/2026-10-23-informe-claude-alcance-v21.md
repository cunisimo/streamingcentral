# Informe para auditoría: conciliación v2.1 de la propuesta de alcance

23/10/2026. Claude Code. Rama `feat/resenas-reglas`. **Sólo documentación.**
- No hay código, casos, mediciones ni pruebas: esta entrega no modifica
  código.
- Reglas, evaluador, bancos, sellos y resultados quedan intactos.
- **E1 sigue sin aprobarse.**

## Commits

| Commit | Qué |
|---|---|
| (este) | Copia sin cambios de la auditoría de `2bc6c1c` (SHA-256 `bff71e1ce9e33df4…`, igual al original). Propuesta v2.1, catálogo conciliado, este informe y `docs/ESTADO.md` |

## Correcciones

| Hallazgo | Corrección |
|---|---|
| **A1** CS | CS **por familia** (propuesta §3), con mínimo, denominador y umbral propios y sin compensación por el agregado: **H1** 30 reseñas, **H2-R** 30 reseñas, **H2-N** 10 nombres (10 de 10) y **H3** 30 reseñas; ≥ 95 % y 100 % en lo generado. H2 se informa y evalúa por separado en reseñas y nombres. **La justificación numérica está corregida:** con 8 casos el umbral sí distingue (exige 8 de 8); 30 mejora la granularidad (tolera 1 fallo), pero no demuestra una eficacia real del 95 % |
| **A2** autoría | **Ruta A** (independiente): satisface el paso 4. **Ruta B** (autor que conoce las reglas): CS complementario, que **no** satisface el paso 4. Para cerrar H1–H3 haría falta un dictamen de Codex de evidencia limitada **y** una aceptación específica del dueño para este contrato y este conjunto. **No hereda** la autorización híbrida del reservado 3 |
| **A3** prioridad | Prioridad única de salidas y reglas para casos mixtos (catálogo §9): una exclusión no exime; un caso es "fuera" sólo si no contiene ninguna forma incluida; cuenta en cada familia incluida; el éxito se mide por detección. Un contacto con contenido sensible espera **rechazar** y cuenta como detectado en CS, sin exigir dos salidas a la vez. **P-1 corregida:** denunciar no oculta de inmediato (salvo que una regla retenga al revalidar), el bloqueo personal oculta sólo para quien bloquea y pausar no retira lo visible |
| **A4** catálogo | **F1:** incluye la corrida sin separadores, con los prefijos contados en el total (8 o más; el generador hace de 8 a 13). **S:** conjunto cerrado y alineado con el generador (Zs, Pd, Ps, Pe y Me enumerados; Po, Sm y Mn muestreados); `So` queda fuera de S, declarado como **E9** (frontera de la clase, no una familia nueva). **E8:** se separó del alcance; la regla actual queda como defensa sin criterio, y la restricción de generación pasa a ser **G1**. **§8:** las listas y versiones pendientes, que se fijan **antes** de implementar. Los datos de Unicode, UTS #39 e IANA figuran como **no incorporados ni verificados** |

## Recomendación principal (para que Codex dictamine)

Mantener:
- la dirección de la v2: barrera mecánica y señales, evidencia por versión,
  un solo conjunto independiente, operación separada de las colas;
- el contrato conciliado: C1a/b, C2a/b, CS por familia, C3 y C4 sin
  cambios.

**Pasos siguientes:**
1. **Cerrar el catálogo §8.** Fijar las listas, la versión de Unicode, el
   procedimiento de incorporación y verificación de los datos de referencia y
   el ámbito. Es otra entrega documental, que no autoriza código.
2. **Presentarle al dueño, en un solo paquete,** las decisiones de producto
   P-1 a P-4 con el riesgo descripto correctamente.

**Lo que sigue sin autorizar:** implementar, crear casos y medir.

## Pendiente

- El catálogo es un **borrador**: no se puede congelar ni aprobar sin §8.
- La ruta A para H1–H3 puede no estar disponible con agentes. Si se elige la
  ruta B, hace falta una aceptación específica.
- Las hipótesis operativas (72 h, N) siguen marcadas como hipótesis, y la
  disponibilidad del dueño está pendiente.
- **Sin cambios:** E2, SQL, Supabase, Producción, APIs externas, gastos,
  push, merge, deploy y AAB siguen sin tocarse.
