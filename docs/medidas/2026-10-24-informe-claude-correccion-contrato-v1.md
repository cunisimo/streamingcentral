# Informe para auditoría: corrección de los cinco hallazgos de `bbb8fc7`

24/10/2026. Claude Code. Rama `feat/resenas-reglas`.
- Reglas `2026-10-24.2`, evaluador del contrato v2 y generador v2.
- Es el módulo local, sin conectar.
- **E1 sigue pendiente de validación independiente**: las pruebas locales no
  la reemplazan. No se preparó el reservado 4.

## Commits

| Commit | Qué |
|---|---|
| `3ff1643` | Copia sin cambios de la auditoría de `bbb8fc7` (SHA-256 `24d21c44ef48e33b…`, igual al original) y las correcciones de A1 a A5, con sus pruebas |
| (este) | Este informe y `docs/ESTADO.md` |

## Hallazgos, corrección y prueba que lo demuestra

| # | Corrección | Prueba |
|---|---|---|
| **A1** | En el evaluador (`banco/evaluar-contrato.ts` v2), **todos** los criterios y mínimos (contactos, señales, legítimas y sensibles) se calculan sólo con casos **independientes**. Lo complementario se informa aparte con las mismas cuentas y nunca cumple. Los mínimos por defecto dejan de ser 1: 150 reseñas legítimas, 30 nombres legítimos, 150 reseñas de abuso, 90 contactos F, 72 ofuscadas y CS 30/30/10/30. El protocolo del reservado 4 podrá subirlos, nunca bajarlos | `evaluar-contrato.test.ts`: **reproducción de Codex** (contactos y legítimas complementarios: no evaluable, no aprueba); 500 complementarios fáciles **no** salvan un C1a independiente que falla; control positivo que aprueba |
| **A2** | Validación previa del esquema completo: largos normalizados por tipo como en la aplicación (reseñas de 80 a 600, nombres de 2 a 24 sin saltos ni tabulaciones), contexto (1 a 3 textos de 80 a 600, sólo en reseñas), coherencia de familias, alcance y exclusión. `detectado` es sólo retención o rechazo de **contenido**: un rechazo de formato no cuenta como detección y falla C0 | **Reproducción de Codex** (F1 con texto "x": no evaluable); textos con sólo espacios, de 601 caracteres o recortados; nombres de 1 o 43 caracteres o con salto; contextos vacíos, de 4, cortos o en un nombre; un texto con U+202E da `rechazo_formato`, no detectado, y C0 y C1a no cumplen |
| **A3** | En `amenaza.directa` v4, una expresión de §6.H1-e exime **sólo** si se superpone con la amenaza o la continúa sin puntuación ("lo voy a matar de risa") | `contrato.test.ts`: "Te voy a pegar un tiro. La rompe esta peli." se retiene, en ambos órdenes, con punto, coma y salto de línea (7 casos). Los usos idiomáticos publican (4 casos). Además, el generador tiene 48 pares de H1 (pronombre × daño × punto, coma o salto, seguidos de "La rompe esta peli") |
| **A4** | Generador v2, con **2871 casos** (antes 2091). Las cinco faltas: (1) C toma 200 confusables de **toda** la clase de UTS #39, cada uno dentro de una terminación T-fuerte que contiene su letra; (2) D9 cuenta **puntos de código**, así que entran los 353 confusables, incluidos más de 100 astrales; (3) las categorías vienen de `RANGOS_CATEGORIA` (Unicode 18.0.0, generado de la referencia), no del runtime; (4) subíndices, cada palabra-número de 0–15, 16–99 e inglés; (5) pares por familia: F1 5×10×3, F2 4×4×2, F3 5×2×3, F4 6×3×2 y H1 4×4×3 | `generador-inventario.test.ts` (nuevo, 9 pruebas) compara lo generado **contra el contrato y las referencias**: 77 tramos `Nd`, cada confusable D9, cada carácter de Zs/Pd/Ps/Pe/Me de Unicode 18.0.0 (incluidos U+2E62 y U+2E63), 64 muestras por categoría tomadas de su clase, 200 de C con más de 10 destinos distintos, todas las listas de §6 y los conteos de pares. `generador.test.ts` sigue exigiendo el 100 % de salida y de disparo de la propia familia |
| **A5** | El plegado conserva el salto de línea, y en el ámbito es fin de oración. H2 no une oraciones separadas por un salto, y las señales con oración contigua siguen funcionando. Los teléfonos escritos en dos líneas se siguen detectando, porque el salto es separador de corrida, como lo era antes | `contrato.test.ts`: el ejemplo de Codex publica con salto y con punto; "inmigrantes\nuna plaga de langostas" publica y en la misma oración retiene; S1 y S3 cruzan un salto pero no dos oraciones; "11 4455\n6677" se rechaza |

**Defectos de mecanismo que apareció al completar el inventario (A4)**,
corregidos dentro del contrato:
1. **`|` (Sm, separador) también imita al 1 (D9).** "1985|2026" se leía como
   un teléfono de 9 dígitos. Ahora, entre dos dígitos manda el separador.
2. **Un separador que NFKC expande** (`⨌` → `∫∫∫∫`) superaba el tope de 3
   por hueco. Ahora cuenta como uno, como en el original.
3. **Los confusables de letra se aplicaban después de pasar a minúsculas.**
   La mayúscula griega Η es "H" en UTS #39, pero su minúscula η es "n". Ahora
   se aplican antes (`premapeo`).
4. **La tabla C incluía dígitos `Nd`** (Warang Citi) **y signos** (`¡` → "i").
   Ahora sólo letras de las categorías L* de Unicode 18.0.0. Hubo que
   regenerar `tablas-unicode.ts`; las referencias no cambiaron.

## Resultados totales

| Prueba | Resultado |
|---|---|
| `node --test "lib/comunidad/**/*.test.ts"` | **115 de 115**, sin omitidas |
| Generador (dentro de lo anterior) | **2871 casos, 100 %** de salida y de disparo de la propia familia. Inventario: 9 de 9 |
| `npx tsc --noEmit --incremental false` | 0 errores |
| `npm test` (suite completa) | **2364 pruebas: 2346 pasan, 0 fallan, 18 omitidas.** Las omitidas necesitan un build web o el artefacto de Capacitor, que no se hicieron |
| `git diff --check` (sin las referencias oficiales) | Sin problemas |

**Bancos conocidos como regresión** (no es una medición independiente):

| Banco | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| Desarrollo | 0/182 | 177/177 | 2/211 | 3/211 |
| Reservado 1 | 0/50 | 43/43 | 1/61 | 1/61 |
| Reservado 2 | 0/124 | 117/117 | 1/150 | 3/150 |
| Reservado 3 | 0/116 | 99/99 | 1/160 | 0/160 |

Son los mismos valores que en `bbb8fc7`. Los falsos positivos del contrato
literal siguen listados y cuentan en C3 y C4.

**Intactos:**
- reservados, sellos y resultados históricos;
- `banco/evaluar.ts`;
- los bytes de las referencias Unicode, con sus huellas verificadas por la
  prueba y antes por Codex. No se recortaron espacios.

## Versión candidata para la próxima medición

- **Commit:** `3ff164302c0bd3f94c6327c927ae6c5593e2f149`.
- **Árbol de `lib/comunidad/reglas`:** `4abc6e4950328ab3928b67b6dfd69538421d9597`.
- **Versiones:** `VERSION_REGLAS` `2026-10-24.2`, evaluador del contrato `2`,
  generador `2`, tabla de familias `1`.
- **Huellas SHA-256** (contenido en Git, con saltos LF):

| Archivo | SHA-256 |
|---|---|
| `ambito.ts` | `4337a7c2331efb5f089d321afc112d1e9a330e55a6272492bc2ad9ee376538fc` |
| `decision.ts` | `bf4373093afef7a5f659cb1cb8dc9779540af00d129d5f8fd23eb33ceea622f7` |
| `familias.ts` | `5ec3178c966b5310b561b34f4dbc47fa8c6c567fa985d30d2a93ceba7ac95e82` |
| `listas.ts` | `3f3399bdd5f1e1f102df85210247c3d541ba2f8b7c44995d2b312c0541c2c560` |
| `plegado.ts` | `7ce16ef164aabf9ee0b85081332ba0d88b4662d8cc198b47a2cb8bde83228773` |
| `reglas.ts` | `ee6cec9c129682efb2daf33326e070541d21155446c752ef50d0017bd4f893cc` |
| `tablas-unicode.ts` | `104237511310034369bbf26319f3c795ef58e4f511c3f31b2dc380d2812664c0` |
| `tipos.ts` | `faf896443a7e6c964a21c5b8d08b1a83e4bc9cb2840fe85260762a7d070bb317` |
| `version.ts` | `83fa0ed5cddd6d6f95ba665ce0be406973bc1c1625b6f5bf19d40149dd402eb4` |
| `banco/evaluar-contrato.ts` | `4ed05e5dff4ec52ca662a1245d14cafec1e12ddc40c2ebb56ac76cb34354f7b9` |
| `generador.ts` | `e67aedb132edf0d9d252645b3c5e1b511c57d5c86c84bc131e70d6c44d50880d` |
| `referencias/generar-tablas.ts` | `8dcaedeb1d01af1a6cc3034b15ccd8d49adc6d8582005a58a628c483e2d37bb0` |
| `referencias/huellas.ts` | `deb2b935ce1a1b4209d0ac5bc05d6dd928de8ec2589b21b5f58ac5814c01c2e3` |

Las referencias Unicode mantienen sus huellas de `e42b8de`.

## Limitaciones que siguen

- **Falsos positivos del contrato literal**, sin cambios y contando en C3 y
  C4: importes con "número" o "celular", alias como "4K" o "M3GAN" con
  "tele" o con una intención, diálogos con S2 y "fíjense en mi nombre
  favorito". Los cuatro cambios opcionales **no se aplicaron**.
- **H2 sólo mira la misma oración.** Por eso dos ideas no relacionadas en una
  oración retienen ("Llegan inmigrantes al pueblo y una plaga de
  langostas…"), y el odio repartido en dos oraciones no se detecta.
- **Una amenaza directa vigente con una expresión idiomática pegada** ("te
  mato de risa") se retiene: la lista vigente de `AMENAZAS` no aplica las
  excepciones. Es conservador.
- **"Nombre propio" en H3** es una heurística por mayúsculas.
- **C:** de las 200 muestras, 182 se prueban en una terminación T-fuerte que
  contiene su letra, así que dependen del mapeo. Las otras **18** no tienen
  T-fuerte ni proveedor con su letra y se prueban con una terminación con
  ruta, que no depende del mapeo. El generador las marca como `sin-ancla`.
- **El generador cubre transformaciones, no significado.** Un acierto en una
  muestra no prueba la clase entera.
- **Pendiente antes de medir:** la auditoría de Codex de esta corrección, la
  autoría del conjunto final y el ejecutor del reservado 4 (no preparado).
  IANA sigue diferida. N = 20 sigue siendo una hipótesis.
