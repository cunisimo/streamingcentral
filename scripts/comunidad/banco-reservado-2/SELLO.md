# Sello del reservado 2 (E1.1)

Sellado el 22/10/2026 en un commit propio, **antes de cualquier ajuste de
reglas de E1.1**. El historial de Git es la prueba del orden.

| Archivo | Autor | Casos | SHA-256 (UTF-8, saltos de línea LF) |
|---|---|---|---|
| `reservado.json` | agente separado, que no leyó las reglas ni los bancos anteriores | 330 | `eb26ad248ac99681ae6956defd2ad8e3135435f2953252f35f534f89bbbe9128` |
| `reservado-sensible.json` | Claude, sobre reglas que E1.1 no modifica (ver Enmienda en `ESPECIFICACION.md`) | 30 reseñas + 4 nombres | `7af65177cb827cb1aab5544c5a9cb6cbad78a262f4b1b960f20cadf8889cecfa` |

- **Verificación previa, sólo de forma:** un script que imprime conteos sin
  mostrar textos. Encontró 360 casos con los conteos exactos de la
  especificación, 0 problemas de esquema con el validador de E1.1 y 0 largos
  fuera de rango.
- **Separación:** quien ajusta las reglas no leyó el contenido de
  `reservado.json`.
  - El agente armó los casos con un script propio fuera del repositorio. El
    script no se incorporó y quien ajusta no lo leyó.
  - El agente informó que, al leer la especificación, no vio la Enmienda.
    Recibió el cambio de alcance por mensaje y lo dejó anotado en el campo
    `descripcion`.
- **Uso:** se corre una vez, al cierre de E1.1, con
  `scripts/comunidad/correr-reservado-2.mjs`, que verifica estos dos hashes.
  Si un criterio falla, se informa así; no se modifican los archivos ni se
  rebajan umbrales.
