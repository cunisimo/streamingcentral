# Sello del conjunto reservado (E1)

- **Archivo:** `reservado.json`.
- **SHA-256** (contenido UTF-8 con saltos de línea normalizados a LF):
  `9975c60c3c0109790cb3e019d13fb85e1852ef31d3996211cfeb2d2c62c4ec79`.
- **Sellado:** 22/10/2026, en un commit propio, **antes de escribir el
  módulo de reglas**. El historial de Git es la prueba del orden.
- **Contenido:** 61 reseñas legítimas, 60 reseñas de abuso, 15 nombres
  legítimos y 15 nombres de abuso. Textos sintéticos, sin datos de personas
  reales (los números, correos y dominios son inventados).
- **Fuera del conjunto, a propósito:** contenido sexual con menores. No se
  escriben textos realistas de esa categoría; la regla se prueba con
  combinaciones mínimas en las pruebas unitarias.

**Reglas de uso.**
- No se usa para ajustar listas, umbrales ni patrones. Las reglas se
  ajustan sólo con el banco de desarrollo (`lib/comunidad/reglas/banco/`).
- Se corre **una vez**, al cierre de E1, con `scripts/comunidad/correr-reservado.mjs`,
  que verifica este hash antes de evaluar y se niega a correr si no coincide.
- Si un criterio falla, se informa así. **No se modifica este archivo** para
  hacerlo pasar. Un conjunto nuevo requiere un sello nuevo y un informe que
  explique por qué.
- La validación previa al sello fue sólo de forma (ids únicos y largos
  80–600 para reseñas, 2–24 para nombres), no de resultados.
