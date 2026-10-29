# Informe para auditoría: cierre documental del catálogo (v3)

23/10/2026. Claude Code. Rama `feat/resenas-reglas`. **Sólo documentación.**
- No hay reglas, generador, evaluador, casos, mediciones ni pruebas de
  aplicación.
- Reglas, evaluador, bancos, sellos y resultados quedan intactos.
- **E1 sigue sin aprobarse.** El catálogo queda pendiente de esta auditoría y
  de la aprobación del dueño.

## Commits

| Commit | Qué |
|---|---|
| (este) | Copia sin cambios de la auditoría de `cac5c50` (SHA-256 `cc6cf0be63238c05…`, igual al original). Catálogo v3 candidato, propuesta v3 (§9: resumen y paquete de decisiones), este informe y `docs/ESTADO.md` |

## Referencias consultadas (no incorporadas)

Se descargaron sólo en lectura, sin costo y **fuera del repositorio**, para
fijar la versión y la huella (catálogo §1):

| Referencia | Versión | Huella |
|---|---|---|
| Unicode, `DerivedGeneralCategory` | 18.0.0 | `d6b151d2…a030f94` |
| UTS #39, `confusables.txt` | 18.0.0, idéntico a `latest` | `6ed3ee96…e18f5b92` |
| IANA, `tlds-alpha-by-domain.txt` | `2026102300` | `274be608…945daa89`, con 1437 TLD |

Condiciones de uso registradas: Unicode License v3; IANA, CC0 1.0 por la
declaración IANA–IETF. **No se agregó ningún archivo, dependencia ni código.**

## Cumplimiento del encargo

| Punto | Dónde |
|---|---|
| Versiones de Unicode, UTS #39 e IANA | Catálogo §1 |
| Transformaciones, palabras-número, raíces y formas | §2, §6.N, §6.L y §6.I. La intención es una lista cerrada de formas; el voseo sin clítico sólo vale para -ar y con tilde |
| Plataformas, alias, proveedores, acortadores y contacto | §6.M, §6.A, §6.H, §6.T1 y §6.T2 |
| Continuación y promoción | §6.K y §6.V |
| Amenazas, odio y datos personales | §5 y §6.H1–H3, con condiciones y controles |
| Ámbito y oración | §7: la misma oración o la contigua, con 25 palabras como máximo (H2-a, sólo la misma oración) |
| Generador | §8: qué se enumera y qué se muestrea, con tamaños medidos sobre las referencias |
| **A1:** detección propia de H | §5.1: el indicador es el disparo de la familia, con mínimos de casos **puros**. Los mixtos son adicionales y se informan con dos columnas; "no publicado" se separa de "detectado". La salida final sigue siendo única |
| **A2:** `_` | En S y en la enumeración del generador. El resto de `Pc` queda fuera de S |
| **A3:** E9 y E8 | E9 queda **pendiente de aceptación**, con su alternativa. Los emojis de tecla siguen en D6. E8 es una restricción elegida y una cobertura no certificada, **sin afirmar imposibilidad**; G1 se mantiene. Todas las exclusiones están pendientes de aceptación y **ninguna exime** de otra forma incluida |

## Puntos técnicos abiertos (catálogo §12)

| Punto | Resolución que propongo |
|---|---|
| T-palabra es una lista de criterio | Que Codex la revise |
| "Nombre propio" en H3 es una heurística | Aceptarla como límite declarado |
| "su" está en T1 | Mantenerlo y medir su costo |
| El evaluador no sabe medir CS por disparo y pureza | Cambiarlo y probarlo con datos ajenos antes de cualquier conjunto |
| Mapeo regla → familia | Fijarlo con la implementación |
| Referencias | Incorporarlas con huella en la entrega de implementación |

**Ninguno de estos puntos está resuelto todavía.**

## Paquete para el dueño (propuesta §9.2, después de esta auditoría)

- **P-1:** el alcance residual, con E1–E8, y **E9 por separado**.
- **P-2:** la condición para publicar.
- **P-3:** la disponibilidad aproximada. No se inventó: N sigue sin fijar.
- **P-4:** la ruta de autoría sensible. **No hereda** la autorización del
  reservado 3.

**Sin cambios:** E2, SQL, Supabase, Producción, servicios de moderación,
gastos, push, merge, deploy y AAB siguen sin tocarse.
