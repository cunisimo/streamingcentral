# Informe para auditoría: reservado 3 híbrido de E1, ejecutado una vez

23/10/2026. Claude Code. Rama `feat/resenas-reglas`. Resultado completo
generado por el ejecutor:
- `2026-10-23-e1-reservado-3-resultado.md`: informe;
- `2026-10-23-e1-reservado-3-resultado.json`: resultado por caso.

## Dictamen

**No cumple. C1 y C2 fallan.** Lo registro y me detengo: no ajusto reglas, no
repito el conjunto como inédito y no preparo otro.

- **E1 sigue pendiente de cierre.** Queda pendiente del dictamen de Codex y de
  la decisión del dueño sobre el alcance siguiente.
- **Es una medición híbrida (ENMIENDA-1.md).** No es una validación
  independiente integral.
- **No afirma seguridad universal** en ningún sentido.

| Criterio | Agregado | Parte general (independiente) | Parte complementaria (no independiente) | Estado |
|---|---|---|---|---|
| C0 ningún error | 0/376 | 0/340 | 0/36 | cumple |
| C1 0 claros sin detectar | **24/116 (20,7 %)** | 24/116 | sin casos | **no cumple** |
| C2 ≥ 95 % ofuscadas detectadas | **69/99 (69,7 %)** | 69/99 | sin casos | **no cumple** |
| C3 ≤ 2 % legítimas rechazadas | 0/160 (0 %) | 0/160 | sin casos | cumple |
| C4 ≤ 5 % legítimas retenidas | 0/160 (0 %) | 0/160 | sin casos | cumple |
| N1 nombres legítimos frenados (informativo) | 0/30 | 0/30 | sin casos | — |

- **Abuso detectado, todas las categorías:** 112 de 150 en la parte general y
  14 de 36 en la complementaria.
- **Sólo 124 reseñas de abuso son de la parte general independiente.** El
  total combinado es 156.
- **Advertencia de la enmienda:** C0–C4 no exigen un mínimo de detección para
  odio, amenazas ni datos personales. Que C0, C3 y C4 se cumplan **no
  certifica** esas categorías.

## Commits y huellas

| Commit | Qué |
|---|---|
| `1e731d1` | Auditoría de `a8e973a`, congelamiento y protocolo, antes de cualquier caso |
| `3e36c5a` | Ejecutor, probado con datos ajenos antes de encargar los casos |
| `f3ca9a5` | `reservado.json` del agente general, sin leer; detención por la parte sensible |
| `8f6513b` | Auditoría de `f3ca9a5`; `ENMIENDA-1.md`; ejecutor con resultados por parte, probado con datos ajenos **antes** de escribir los complementarios |
| `48cb2f7` | `reservado-sensible.json` y sello (`SELLO.json`, `SELLO.md`), **antes** de ejecutar |
| (este) | Resultado del ejecutor, este informe y `docs/ESTADO.md` |

**Código congelado.**
- `VERSION_REGLAS` `2026-10-22.5`, código `b6e1f33`.
- Árbol de `lib/comunidad/reglas` `66cc48ba…`.
- Huellas por archivo en `2026-10-23-e1-reservado-3-congelamiento.md`.
- El ejecutor las verificó antes de correr, y `git diff b6e1f33 -- lib` sigue
  vacío.

**Conjunto sellado** (SHA-256, UTF-8, LF):

| Archivo | Huella |
|---|---|
| `reservado.json` | `8d9e171440bd2ce20f52ee73037d233138ef114adfe90bffa3e4352b8d0f83c7`, sin cambios desde `f3ca9a5` |
| `reservado-sensible.json` | `31fbb2bf661e71dfc3e69d0e5ce26807a207a0ad903b9042bd324cf5d31db03c` |

**Pruebas del ejecutor, siempre con bancos sintéticos generados fuera del
repositorio:**
- la corrida es evaluable;
- una segunda corrida se rechaza;
- un archivo alterado se rechaza por el sello;
- con un caso de menos, el banco es no evaluable;
- `--prueba` se niega a usar el directorio del reservado;
- con la adaptación de la enmienda, las secciones por parte y la cobertura
  sensible salen correctas, y una parte sin casos dice "sin casos";
- una huella de código alterada, probada en una **copia temporal** de
  `lib/comunidad`, sale con código 2 y sin informe.

## Autoría y separación

- **Parte general (340):** agente separado, con el encargo transcripto en
  `2026-10-23-e1-reservado-3-detenido.md`.
  - Declaró haber leído sólo el protocolo, más el `CLAUDE.md` que se carga
    solo y el nombre de ruta de `evaluar.ts` en un aviso de Node.
  - Yo no leí sus textos antes de ejecutar: sólo conteos de forma.
  - Las lecturas del agente no se pueden verificar de forma independiente.
    Es el mismo modelo, y el protocolo nombra las familias de ofuscación.
- **Parte complementaria (36):** la escribí yo y conozco las reglas, así que
  **no es independiente**.
  - No consulté las listas mientras la escribía ni ajusté los textos para que
    coincidieran. Igual, conocer las reglas puede haber influido en la
    redacción sin que me diera cuenta.
  - No aporta casos a C1, C2, C3 ni C4.
- **Interpretación de `claro` del autor general** (anotada en su
  `descripcion`): el contacto que se reconstruye siguiendo instrucciones
  explícitas del texto, como leer letras como dígitos, juntar dos años o
  sumar dígitos a una fecha.
  - Es más amplio que los conjuntos anteriores, que no tenían
    reconstrucciones por instrucciones.
  - No lo reclasifico: es la etiqueta sellada, y C1 cuenta esos casos.

## Contactos claros sin detectar (C1): 24

| Familia | Casos | Ids |
|---|---|---|
| Teléfono | 10 | `R3-A-009` (letras de otros alfabetos por dígitos), `012` (pares dictados con guiones), `014` (fecha + instrucción), `015` (importe "sin el signo y sin los puntos"), `016` ("11 seguido de esos dos años"), `022` (dígitos en inglés), `023` (palabras y dígitos pegados), `024` (separador `⁃`), `026` (dígitos en emojis de tecla), `028` (dictado agrupado de 3 y 4 cifras) |
| Correo | 1 | `R3-A-047` ("usuario de Gmail" sin "en/de" delante del proveedor) |
| Enlace | 5 | `R3-A-064` (terminación larga con espacios: `. photography / ruta`), `065` (coma en lugar de punto), `066` ("dot" y "slash" en palabras), `069` (punto ideográfico `。`), `071` (`-[punto]-`) |
| Red | 8 | `R3-A-076` (Discord, **directa**), `079` ("tt"), `081` (Telegram entre comillas con usuario), `083` ("tele" + "arroba usuario"), `086` ("face"), `087` (snap, letras separadas por puntos), `088` ("@ usuario" con espacios), `R3-NA-25` (nombre "en tt") |

## Ofuscadas sin detectar (C2): 30

- Las 23 reseñas ofuscadas de la tabla anterior (todas salvo `R3-A-076`, que
  es directa).
- `R3-NA-25`.
- `contacto.indirecto`: 6 de 8 (`R3-A-091`, `092`, `094`, `096`, `097`,
  `098`). Son casillas descriptas sin un alias escrito ("la que empieza con pau
  y termina en un año") o "pedime el número por privado".
- `contacto.partido`: 1 de 6 (`R3-A-104`).

## Otras categorías (sin umbral)

| Categoría | Frenados | Sin detectar |
|---|---|---|
| `spam` (general) | 7/12 | `R3-A-111`, `115`, `117`, `119`, `120`: ventas o sorteos sin dato de contacto ni montos ni las combinaciones de la lista |
| `perfil` (general) | 2/4 | `R3-A-107`, `108` |
| `anomalo` (general) | 4/4 | — |
| `odio`, reseñas (complementaria) | 2/8 | `R3-S-001`, `002`, `003`, `005`, `006`, `007` |
| `odio`, nombres (complementaria) | 1/4 | `R3-S-033`, `034`, `036` |
| `amenaza` (complementaria) | 4/8 | `R3-S-011`, `013`, `014`, `016` |
| `datos_personales` (complementaria) | 7/8 | `R3-S-023` (domicilio sin "vive en" ni "dirección") |
| `fuera_capacidad` (informativo) | 0/8 | los 8 |

Aunque la parte complementaria la escribió quien conoce las reglas, la
detección de odio y amenazas sale baja. Las listas de términos y frases son
cortas y dejan pasar formas comunes, como gentilicios peyorativos, insultos
homofóbicos o "te voy a pegar un tiro". **Es un hallazgo, no un criterio
incumplido**: el protocolo no fija un umbral para esas categorías y no lo
invento ahora.

## Falsos positivos, errores y diferencias con la etiqueta

- **Legítimas frenadas:** 0 de 160 reseñas y 0 de 30 nombres. No aparecieron
  casos de las familias de falso positivo conocidas, como un título
  alfanumérico junto a "mail" o una barra sin espacio.
- **Errores:** 0.
- **Diferencias con la etiqueta:** 60.
  - **Todas son abusos sin detectar**: los 24 claros, las 7 ofuscadas no
    claras (6 indirectas y 1 partida), 7 de spam y perfil, 14 sensibles y
    8 de fuera de capacidad.
  - No hay ningún caso detectado con una salida distinta de la etiquetada.

## Qué muestra y qué no

- **C3 y C4 se cumplen con margen en la parte independiente:** 0 de 160
  legítimas frenadas. Es el resultado más sólido de la medición.
- **C1 y C2 fallan por familias de ofuscación que el autor independiente
  escribió y las reglas no cubren:**
  - otros sistemas de dígitos (emojis de tecla, inglés, otros alfabetos);
  - separadores y signos fuera de la clase;
  - instrucciones aritméticas o de armado;
  - redes y alias fuera de la lista;
  - espacios dentro de un enlace con terminación larga.

  Es el mismo patrón de los reservados 1 y 2: cada conjunto nuevo encuentra
  familias nuevas. Ese patrón, y no este número aislado, es lo relevante para
  decidir el alcance.
- **No medido:** abuso real, frecuencia de cada familia en uso y carga de
  revisión.
- **No corregí nada.** Cualquier corrección haría que este conjunto deje de
  medir de forma independiente, y la decisión es del dueño con revisión de
  Codex.

## Sin cambios

- Reglas, listas, normalización, umbrales y evaluador: `git diff b6e1f33 --
  lib` vacío.
- `reservado.json`: misma huella.
- Reservados 1 y 2, sus sellos e informes: diff vacío desde `1f475e3`.
- No hubo E2, rutas, pantallas, Supabase, SQL, APIs externas, Producción,
  push, merge, deploy ni AAB.
- No repetí la suite ni el tipado: no cambió código del módulo. Sólo se
  agregaron el ejecutor, datos y documentos.
