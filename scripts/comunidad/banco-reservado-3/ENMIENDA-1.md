# Reservado 3: enmienda 1, evaluación híbrida

Registrada el 23/10/2026, **antes** de escribir los casos complementarios,
de sellar y de evaluar. `PROTOCOLO.md` no se modifica: sigue siendo el
original, y esta enmienda vale sólo para lo que dice abajo. Motivo y
alternativas en `docs/medidas/2026-10-23-e1-reservado-3-detenido.md` y en la
auditoría de Codex `docs/medidas/2026-10-23-auditoria-reservado-3-f3ca9a5.md`
(opción 2).

## Decisión del dueño

El dueño **acepta** que `reservado-sensible.json` lo escriba Claude, que
conoce las reglas. La medición pasa a ser **híbrida**:

| Parte | Archivo | Casos | Autoría |
|---|---|---|---|
| **General** | `reservado.json` | 340 | Agente separado que no leyó las reglas, según la separación declarada. Huella LF `8d9e171440bd2ce20f52ee73037d233138ef114adfe90bffa3e4352b8d0f83c7`, sin cambios |
| **Complementaria** | `reservado-sensible.json` | 36: 32 reseñas y 4 nombres | **Claude, autor que conoce las reglas. No es independiente** |

- **Este conjunto no es una validación independiente integral.**
- **La parte complementaria no es evidencia de generalización.** Sus textos
  se escriben según las categorías del protocolo, con datos ficticios, sin
  consultar las listas de detección y sin ajustarlos para que coincidan.
- **Sólo 124 reseñas de abuso son de la parte general independiente.** El
  total combinado de 156 no equivale a 156 casos independientes, y los
  informes tienen que mostrar esa diferencia.

## Qué no cambia

- Categorías, tamaños, etiquetas y forma de `PROTOCOLO.md` §3–§4. La parte
  complementaria tiene las mismas categorías y conteos que el archivo
  sensible del protocolo.
- Los criterios C0–C4 y N1, sus umbrales y los denominadores de §6: C1 116,
  C2 99, C3 y C4 160. La parte complementaria no aporta casos a C1, C2, C3 ni
  C4, así que su autoría no cambia esos criterios.
- El código congelado (`2026-10-22.5`), `reservado.json` y la ejecución
  única.

## Cómo se informa

- **Criterios agregados**, sobre los dos archivos juntos y con sus
  denominadores, como dice el protocolo.
- **Resultados por parte**, general y complementaria por separado:
  - casos, errores, detección y diferencias con la etiqueta;
  - las cuentas de cada criterio dentro de cada parte;
  - una parte sin casos para un criterio lo informa como "sin casos", no como
    0 %.
- **Cobertura de cada categoría sensible** (`odio`, `amenaza`,
  `datos_personales`): frenados sobre el total, con rechazos y retenciones.
- **`fuera_capacidad`**, informativo y aparte.
- **Advertencia obligatoria en el informe:** C0–C4 **no exigen** un mínimo
  de detección para odio, amenazas ni datos personales, que no son contactos
  claros, ni ofuscados, ni legítimos. Cumplir C0–C4 **no certifica por sí
  solo** su detección. Los casos sin detectar de esas categorías quedan
  visibles en el informe para el dictamen.
- No se inventa ningún umbral para esas categorías después de ver los
  resultados.

## Ejecutor

Para separar los resultados, `scripts/comunidad/correr-reservado-3.mjs` se
adapta **antes** de escribir los casos complementarios. La adaptación se prueba
con datos sintéticos ajenos y se compromete en Git.

- **No cambia:** la verificación de forma, de huellas, del sello ni de la
  ejecución única.
- **Agrega:** las secciones del informe que pide esta enmienda.
