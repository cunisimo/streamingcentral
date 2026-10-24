# Referencias Unicode 18.0.0 (contrato de moderación v1, §1)

Copias exactas, sin modificar, de archivos oficiales de Unicode, Inc. Las
incorporó Claude el 24/10/2026 con autorización del dueño. Sirven para
generar `lib/comunidad/reglas/tablas-unicode.ts`, con
`scripts/comunidad/generar-tablas-unicode.mjs`.

**Los bytes se conservan exactos:** `.gitattributes` marca esta carpeta como
`-text`, así que Git no convierte los saltos de línea.

| Archivo | Origen | Fecha del archivo | SHA-256 |
|---|---|---|---|
| `DerivedGeneralCategory.txt` | `https://www.unicode.org/Public/18.0.0/ucd/extracted/DerivedGeneralCategory.txt` | 2026-06-29 | `d6b151d2d40ee9b1876d26f417980f45ffae47b6055ccf7203cb31f07a030f94` |
| `confusables.txt` (UTS #39) | `https://www.unicode.org/Public/18.0.0/security/confusables.txt` | 2026-08-06 | `6ed3ee967c9dfdf6677d563c9985182fbc50a2efb7d6059cd57b2e2ce18f5b92` |
| `license.txt` | `https://www.unicode.org/license.txt` | Descargado el 24/10/2026 | `e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96` |

**Estado de las huellas:**
- Las **calculé yo (Claude)**. Coinciden con las que declaré el 23/10 sobre
  otra descarga.
- **No las verificó todavía un segundo revisor.** En su auditoría del
  23/10, Codex no pudo recalcularlas porque falló su acceso a los bytes.
  Ahora los archivos están en el repositorio para que pueda examinarlos y
  recalcularlas localmente.
- La prueba `lib/comunidad/reglas/referencias/referencias.test.ts` comprueba
  estas huellas y que las tablas generadas coinciden con las referencias.

**Licencia:** Unicode License v3 (`license.txt`). Pide conservar el aviso de
copyright y de permiso en las copias o en la documentación asociada. El aviso
está en `license.txt` y en la cabecera de cada archivo.

**No se incorporó la lista de TLD de IANA** (variante sin IANA, contrato
§0.1).
