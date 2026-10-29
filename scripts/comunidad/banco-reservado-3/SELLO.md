# Sello del reservado 3 (híbrido, ENMIENDA-1.md)

Sellado el 23/10/2026 en un commit propio, **antes de la ejecución única**.
El historial de Git prueba el orden: el protocolo (`1e731d1`), el ejecutor
(`3e36c5a`) y la enmienda con el ejecutor adaptado (`8f6513b`) son anteriores.

| Archivo | Parte | Autor | Casos | SHA-256 (UTF-8, LF) |
|---|---|---|---|---|
| `reservado.json` | general | agente separado, que no leyó las reglas | 340 | `8d9e171440bd2ce20f52ee73037d233138ef114adfe90bffa3e4352b8d0f83c7` |
| `reservado-sensible.json` | complementaria | Claude, que conoce las reglas: **no independiente** | 32 reseñas y 4 nombres | `31fbb2bf661e71dfc3e69d0e5ce26807a207a0ad903b9042bd324cf5d31db03c` |

- **Verificación previa, sólo de forma:** `correr-reservado-3.mjs
  --solo-forma` encontró 376 casos, con todos los conteos del protocolo y 0
  problemas. Esa verificación no imprime textos ni evalúa reglas.
- **Separación:** quien ajustó las reglas no leyó los textos de
  `reservado.json`.
- **Uso:** se corre una vez con `scripts/comunidad/correr-reservado-3.mjs`,
  que verifica este sello (`SELLO.json`) y las huellas del código congelado.
