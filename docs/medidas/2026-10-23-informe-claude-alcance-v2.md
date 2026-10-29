# Informe para auditoría: propuesta de alcance v2

23/10/2026. Claude Code. Rama `feat/resenas-reglas`. **Sólo documentación.**
No hay código, casos ni mediciones nuevas. Reglas, evaluador, bancos, sellos
y resultados quedan intactos. **E1 sigue sin aprobarse.**

## Commits

| Commit | Qué |
|---|---|
| (este) | Copia sin cambios de la auditoría de `4ef9a51` (SHA-256 `10b20d4f20c4fa4a…`, igual al original). Propuesta v2, catálogo propuesto, este informe y `docs/ESTADO.md` |

## Correcciones por hallazgo

| Hallazgo | Corrección |
|---|---|
| **A1** procedimiento | La evidencia se acepta **por versión** (propuesta §4.1): catálogo aprobado, versión congelada, generador como requisito técnico necesario pero no suficiente, y **un** conjunto independiente ejecutado una vez sobre esa versión. Un cambio posterior **no hereda** la evaluación. La regla de detención (§4.2) dice que un fallo queda fallido, sin corrección con aprobado implícito ni rondas automáticas. Después, el dueño decide entre mantener cerrada la publicación (opción por defecto) y autorizar un ciclo nuevo de forma explícita. Una "aceptación con evidencia limitada" sólo existiría como decisión explícita y con ese nombre, y **no la recomiendo** para contactos |
| **A2** sensibles | **CS** (§3): 100 % de H1–H3 retenidas en lo generado y ≥ 95 % de las formas explícitas "dentro" del conjunto independiente, con **al menos 30 casos por familia**. La justificación técnica es la misma naturaleza que C2, y con 8 casos un solo fallo es el 12,5 %. Lo contextual (E7) queda separado e informado. La autoría de esa parte es la decisión P-4 |
| **A3** catálogo | Especificación aparte (`2026-10-23-catalogo-moderacion-propuesto.md`) con: clases con límites verificables (categorías Unicode, UTS #39, IANA), familias F1–F4, S1–S5 y H1–H3 con combinaciones, salida y controles, y el generador con lo que **enumera** y lo que **muestrea**, sin prometer cobertura semántica. Incluye cada fallo mecánico conocido, y hay **8 exclusiones cerradas**, cada una justificada. "Fuera" exige citar una exclusión, con la clasificación antes de sellar y revisada por Codex. Las afirmaciones absolutas se cambiaron por límites del módulo o del alcance elegido |
| **A4** señales | Ninguna señal se dispara con un indicio aislado. La intención sólo cuenta en imperativo o con clítico de primera persona: "busca", "pasa" y "sigue" no son intención. Cada señal tiene sus controles narrativos |
| **A4** colas | Retenidos (§5.1) y denuncias (§5.2) por separado: prioridad, atraso, qué sigue visible, pausa manual (T4) y reanudación. No hay ocultamiento por cantidad de denuncias ni pausa automática. Las cifras están marcadas **[H]**, y N depende de la disponibilidad del dueño |
| **A5** atribuciones | El muestreo P6 figura como **no aceptado**, retirado como recomendación. Se distingue el módulo sin conectar del contenido no verificado de `user_reviews` en Producción. Se retiró la atribución a Play. La evidencia posterior al lanzamiento no reemplaza las condiciones previas |

## Decisiones

- **Técnicas, que recomiendo y justifico** (propuesta §6.1, para auditar):
  - el rol del filtro;
  - las clases y los datos Unicode e IANA;
  - el contrato C1a, C1b, C2a, C2b y CS, con C3 y C4 sin cambios;
  - el procedimiento por versión;
  - el generador;
  - las hipótesis operativas.
- **De producto, que necesito del dueño** (propuesta §6.2):
  - **P-1:** el riesgo residual (lo contextual y lo excluido se publica hasta
    que alguien lo denuncie);
  - **P-2:** no publicar hasta tener todas las capas y el filtro aprobado;
  - **P-3:** su disponibilidad aproximada;
  - **P-4:** la autoría de la parte sensible del conjunto final.

## Límites

- **El catálogo y CS son propuestas.** Las listas cerradas que nombran (por
  ejemplo, los términos de H1 y H2) se fijarían en la implementación, con su
  propia revisión.
- **Las cifras [H]** (72 h, ámbito de 25 palabras, muestras de 64, 100 y 200)
  son hipótesis técnicas revisables, no decisiones.
- **No se verificó nada en Producción ni se ejecutó código.**
- **Sin cambios:** E2, SQL, Supabase, APIs externas, gastos, push, merge,
  deploy y AAB siguen sin tocarse.
