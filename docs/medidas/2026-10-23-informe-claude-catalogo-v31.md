# Informe para auditoría final: catálogo v3.1

23/10/2026. Claude Code. Rama `feat/resenas-reglas`. **Sólo documentación.**
- No hay datos incorporados, dependencias, código, casos, pruebas ni
  mediciones.
- Reglas, evaluador, bancos, sellos y resultados quedan intactos.
- **E1 sigue sin aprobarse.**

## Commits

| Commit | Qué |
|---|---|
| (este) | Copia sin cambios de la auditoría de `77d8bda` (SHA-256 `1016047865f0092a…`, igual al original). Catálogo v3.1, propuesta v3.1 (§10), este informe y `docs/ESTADO.md` |

## Hallazgos resueltos

| Hallazgo | Resolución (catálogo) |
|---|---|
| **A1** | §3.1, composición de F3 en seis formas. **F3-4:** punto espaciado (espacios a los dos lados) o escrito + terminación alfabética de 2 a 63 letras salvo T-palabra + ruta obligatoria. Cubre `R3-A-064` y `R3-A-066` sin listas nuevas ni datos de IANA. Las restricciones con y sin ruta están explicadas; el costo se mide con C3 y C4 |
| **A2** | S3 tiene tres partes: S3-a (las expresiones vigentes), S3-b (un verbo de remisión de la lista cerrada §6.R + "mi" + una palabra de identidad) y S3-c (I + identidad + marcador). Con controles narrativos. `R3-A-107` queda en S3-b y `R3-A-108` en S3-c |
| **A3** | La declaración CC0 cubre los "Protocol Registries" enlazados desde `/protocols`. Lo comprobé en lectura: `/protocols` enlaza la página "Root Zone Registry", no el archivo de TLD. No encontré otro fundamento, así que la condición queda **pendiente de verificación** antes de incorporarlo, sin afirmar CC0 ni una prohibición. Si no se verifica, F3-2 y F3-6 quedan con T-fuerte solo. **Huellas:** las calculé yo y Codex no pudo recalcularlas; son declaradas, no verificadas independientemente |

**Se agregó además, por la precaución de la auditoría:** C (UTS #39) se
aplica sólo a caracteres que no son ASCII, con la misma función de plegado
para textos y listas.

## Para decidir

Ver la propuesta §10.
- **Contrato:** sin contradicciones que impidan aprobarlo.
- **Condiciones pendientes para pasos posteriores:**
  - condición de uso de IANA;
  - verificación de las huellas;
  - cambio del evaluador antes de cualquier conjunto;
  - autoría sensible y disponibilidad.
- **Recomendaciones, todas pendientes de aceptación del dueño:**
  - **P-1:** aceptar E1–E8;
  - **E9:** aceptarla;
  - **P-2:** aceptar;
  - **P-4:** ruta A con una persona; ruta B sólo con una aceptación
    específica, sin heredar el reservado 3.
- **Único dato personal pedido:** la disponibilidad aproximada para las
  colas. N no está fijado.

**Sin cambios:** E2, SQL, Supabase, Producción, servicios de moderación,
gastos, push, merge, deploy y AAB siguen sin tocarse.
