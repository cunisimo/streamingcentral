# Informe para auditoría: propuesta de alcance de moderación

23/10/2026. Claude Code. Rama `feat/resenas-reglas`.

**Qué se entrega.** Sólo análisis y documentación.
- No hay código ni reglas nuevas, ni mediciones o casos nuevos.
- No se volvió a ejecutar el reservado 3 ni se usó el evaluador. El
  diagnóstico se hizo leyendo los resultados guardados y el código congelado.
- **E1 sigue sin aprobarse.**

## Commits

| Commit | Qué |
|---|---|
| (este) | Copia sin cambios de la auditoría de `4183d37`. Propuesta de alcance e informe. `ESTADO.md` corregido. Espacio final quitado en `2026-10-23-informe-claude-reservado-3.md` |

La auditoría se copió sin cambios: SHA-256 `ae3ac693920d9218…`, igual al
original.

## Contenido de la propuesta

Está en `2026-10-23-propuesta-alcance-moderacion.md`.

1. **Diagnóstico** de los 60 fallos en cuatro grupos, con variante y familia
   nueva separadas.
   - **22 formas mecánicas.** 20 son variantes de familias que el filtro ya
     prometía cubrir y 2 son familias nuevas: dígitos en inglés y coma en
     lugar de punto.
   - **Discord, face, snap y Telegram** ya estaban en la lista. Fallaron por
     **verbos y conjugaciones fuera de la lista**, ventanas fijas o el formato
     del usuario.
   - **13 señales indirectas** que podrían retenerse sin reconstruir el dato.
   - **3 casos que exigen instrucciones**, más los 8 de fuera de capacidad.
   - **Cobertura de odio, amenazas, datos personales y spam**, explicada por
     la estructura de cada regla.
2. **Corrección de una afirmación anterior mía.** E1.2 informó "separadores
   por clase de signo". En realidad, `SEP` es una lista finita, y por eso
   pasó `⁃`.
3. **Recomendación principal.**
   - El filtro como barrera mecánica más retención por señales, no como
     moderador.
   - Categorías Unicode y morfología en vez de listas de instancias.
   - Una tabla de las capas diseñadas (ninguna implementada) y qué cubre cada
     una.
   - El trabajo humano limitado a las colas de retenidos y denuncias.
   - Si la cola se llena, se cierra la admisión de lo que sería retenido,
     como ya está diseñado.
4. **Cambio de aceptación propuesto**, para auditar. Muestra el criterio
   vigente, el propuesto, la justificación, lo que se pierde y cómo se
   comprobaría:
   - C1 se divide en C1a (catálogo de formas, sigue en 0) y C1b (por
     instrucciones, informativo);
   - C2 se divide en C2a (≥ 95 % sobre el catálogo, con generador
     sistemático y conjunto independiente) y C2b (detección total,
     informativa);
   - C3 y C4 no cambian.
5. **Regla de detención** contra el ciclo de "corregir ejemplos y crear otro
   reservado":
   - prohibido agregar instancias divulgadas;
   - una ronda por mecanismo y un conjunto final;
   - sin reservados automáticos;
   - después decide el dueño.

## Decisiones pedidas al dueño (D1–D7)

- **D1:** el rol del filtro.
- **D2:** el cambio de aceptación.
- **D3:** más retención legítima, dentro de C4 ≤ 5 %.
- **D4:** capacidad de revisión. No se propone una cifra.
- **D5:** la regla de detención.
- **D6:** si las categorías sensibles siguen siendo informativas o llevan un
  umbral fijado de antemano.
- **D7:** no publicar hasta que existan denuncias, bloqueos, la cola
  acotada, el panel y T4.

## Límites de este análisis

- **Las causas de cada fallo salen de leer el código congelado**, no de
  ejecutarlo. Codex reprodujo tres por su cuenta (`⁃`, Discord y "te voy a
  pegar un tiro").
- **El costo en retenciones legítimas de §2.2 es una hipótesis.** No se midió
  y no se presenta como cifra.
- **La parte complementaria no es independiente.** Su diagnóstico vale por la
  estructura de las reglas, no por el porcentaje.

## Sin cambios

- Reglas, evaluador, bancos, sellos, resultados y reservados.
- No hubo SQL, Supabase, Producción, APIs externas, gastos, E2, push, merge,
  deploy ni AAB.
