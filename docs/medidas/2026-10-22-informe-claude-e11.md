# Informe para auditoría — E1.1, corrección de reglas y del evaluador

22/10/2026. Claude Code. Rama `feat/resenas-reglas`, sobre `ffa5061`.

**Alcance:** sólo el módulo puro y el evaluador.
- No está conectado a rutas, pantallas, Supabase ni publicaciones.
- Sin SQL, red, proveedores, Producción, variables, push, merge, deploy ni
  AAB.

**Resultado en una línea:** el reservado 2 es evaluable y **no cumple C1 ni
C2**. E1.1 tampoco cumple los criterios de aceptación. No se rebajó ningún
umbral ni se tocó el conjunto.

## Commits

| Commit | Qué |
|---|---|
| `44bd6bd` | Copia de la auditoría de `ffa5061` y especificación del reservado 2 (tamaños y categorías), **antes** de escribir casos y de ajustar reglas |
| `a24df81` | **Sello del reservado 2**, antes de cualquier ajuste de reglas |
| `29f803e` | A4: evaluador |
| `c2c6741` | A1–A3: reglas, regresiones de desarrollo y regresión conocida del reservado 1 |
| `c30dae9` | Script que corre el reservado 2 |
| (este) | Resultado, este informe y `docs/ESTADO.md` |

## Correcciones por hallazgo

**A1 — Teléfonos** (`contacto.telefono` v2, `contacto.partido` v2,
`contacto.telefono_nombre` v2):
- Las corridas con forma de año, importe con miles o fecha ya no se
  descartan: quedan marcadas con su excepción.
- Una **señal fuerte** de contacto cerca (`CONTACTO_FUERTE`: "llamame",
  "escribime", "wsp", "tel", "cel"…) hace que cuenten como teléfono.
- "número", "mensaje" o "contacto" son señales débiles y no anulan la
  excepción. Así, "el número de entradas vendidas fue 1.200.000" sigue
  publicándose.
- **Letras por dígitos:** `o l i | s z b g` se convierten sólo en piezas que
  ya tienen un dígito ("5O5O", "1l", "5S", "7O"). "Se7en", "M3GAN", "2do" y
  "T3E8" no cambian.

**A2 — Correos y dominios** (`contacto.email` v2, `contacto.enlace` v2):
- **Familia "usuario en/de/del/at/por proveedor".** Exige un usuario de forma
  reconocible (dígito, "_" o ".") o una pista de correo cerca, y excluye
  palabras comunes como usuario ("el correo de gmail", "un mail de hotmail").
- **Confusables:** la tabla suma cirílico (м, н, т, к, в, п, и…), griego,
  versalitas latinas, el "ı" sin punto y algunas armenias. **No es una tabla
  completa de Unicode.**

**A3 — `contacto.red` v2.** Ya no rechaza porque una red y un verbo aparezcan
en cualquier parte del texto. Rechaza con:
- un usuario (`@algo`) a 60 caracteres o menos de una red o un verbo;
- "red: algo";
- un verbo de contacto **fuera de comillas** a 30 caracteres o menos de una
  red.

Un verbo entre comillas es diálogo o cita y, sin usuario, número ni correo,
no dispara.

**A4 — Evaluador** (`banco/evaluar.ts`):
- `validarBanco` revisa esquema, ids únicos, coherencia entre grupo y
  resultado esperado, y grupos exigidos con mínimos configurables.
- Un banco inválido es `no_evaluable` y ningún criterio cumple.
- Un denominador 0 es `no_evaluable`, nunca 0 %.
- Los errores técnicos ya no cuentan como detección: van en C0, y en C1 y C2
  cuentan como no detectados.

**Versiones:** `VERSION_REGLAS` pasa a `2026-10-22.2`. Odio, amenazas y datos
personales **no cambiaron** (compromiso de la Enmienda del reservado 2).

**Regresiones:**
- 18 pares benigno/malicioso en el banco de desarrollo: los fallos del
  reservado 1 y los ejemplos de la auditoría, más variantes de la misma
  familia.
- Una prueba de **regresión conocida** sobre el reservado 1, que **no** se
  presenta como medición. El archivo, su sello y su informe fallido quedan
  intactos; la dirección ficticia (`R-L-045`) sigue como falso positivo
  conocido.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `node --test "lib/comunidad/**/*.test.ts"` | 56 de 56 |
| `npx tsc --noEmit` | 0 errores |
| `npm test` (suite completa) | 2305 pruebas: 2287 pasan, 0 fallan, 18 omitidas |
| `node scripts/comunidad/correr-reservado-2.mjs` | Corrido **una vez**; C1 y C2 **no cumplen** |

- **Omitidas:** las mismas 18 de E1, que exigen un build web o el artefacto
  de Capacitor (`metricas-nativo`, `pwa-nativa`, `recordatorio-nativo`). No
  se hicieron builds.
- **Banco de desarrollo:** 442 casos, todos con el resultado esperado; C0–C4
  cumplen.
- **Red:** ninguna prueba hace llamadas externas (la prueba de aislamiento
  sigue verde).

## Reservado 2

**Cómo se preparó:**
- La especificación se commiteó antes. Un agente separado, que no leyó las
  reglas ni los bancos anteriores, escribió 330 casos.
- No pudo escribir textos de odio, amenazas y datos personales (lo frenó un
  clasificador de seguridad). Esos 30 casos de reseña y 4 de nombre los
  escribí yo, sobre reglas que E1.1 no tocó, y se informan aparte.
- Quien ajustó las reglas no leyó el contenido antes de correrlo: sólo
  verificó forma con conteos.
- Sello `a24df81`; resultado por caso en
  [`2026-10-22-e11-banco-reservado-2.md`](2026-10-22-e11-banco-reservado-2.md).

**Criterios** (360 casos, evaluable):

| Criterio | Valor | Estado |
|---|---|---|
| C0 ningún error | 0/360 | cumple |
| C1 0 contactos o enlaces claros sin detectar | **12/124 (9,7 %)** | **no cumple** |
| C2 ≥ 95 % de ofuscadas detectadas | **102/117 (87,2 %)** | **no cumple** |
| C3 ≤ 2 % de legítimas rechazadas | 1/150 (0,7 %) | cumple |
| C4 ≤ 5 % de legítimas retenidas | 0/150 | cumple |

**Fallos, por familia.** Leídos **después** de la ejecución, sólo para
describirlos:

| Familia | Casos | Por qué pasa |
|---|---|---|
| Números con decenas en palabras y comas ("once, seis, setenta y dos…", "uno uno, cuatro siete…") | RA-008, RA-015 | Sólo se convierten palabras de 0 a 15, y la coma corta la corrida |
| Separadores raros ("·", raya, guion blando intercalado) | RA-016, RA-029 | No están entre los separadores de corrida |
| Letras sueltas por dígitos ("I I 4 9 S 2 6 O 8 7") | RA-017 | Las letras van en piezas sin dígito |
| Dígitos arábigo-índicos (٤٥٦) | RA-025 | NFKC no los convierte y `\d` sólo mira ASCII |
| Correo descripto sin nombrar el proveedor ("en el de Google, el que termina en com") | RA-042 | Fuera de los patrones |
| Nombre "lucas en gmail" sin pista | NA-011 | La familia exige usuario reconocible o pista: es la protección contra falsos positivos de A2 |
| Acortador con TLD no listado (`is.gd`) | RA-070 | "gd" no está entre los TLD |
| Usuario con puntos y espacios tras "Tik tok:"; "app del video corto"; "TG:" | RA-088, RA-096, RA-097 | "tik tok" separado, la red descripta y "tg" no están en la lista |
| Spam sin las palabras de la lista (sorteos con otros verbos, airdrop "gratuito", casino, adelgazantes, encuesta de premio) | RA-100, 104, 105, 106, 108, 109 | El vocabulario de spam es corto: 6 de 12 spam pasan |
| Contacto partido sin números (correo o usuario repartidos) | RA-122, RA-124 | La regla sólo suma dígitos |
| Amenaza con letras espaciadas (sensible) | S-AM-06 | E1.1 no tocó amenazas |
| **Falso positivo:** "la burbuja de las punto com" | RL-113 | "punto com" se resuelve a ".com" y parece dominio |
| DNI con espacios (sensible) | S-DP-05 | Se rechazó como teléfono en lugar de retenerse; se detectó igual |

## Comparación honesta con E1

- **E1 (`ffa5061`)**, reservado 1: 121 reseñas. C1 3/50, C2 40/43 (93 %),
  C3 0/61, C4 1/61. Lo escribió el mismo autor de las reglas.
- **E1.1**, reservado 2: 300 reseñas y 60 nombres. C1 12/124 (9,7 %), C2
  102/117 (87,2 %), C3 1/150, C4 0/150. Lo escribió en su mayor parte un
  agente que no conocía las reglas.
- **Los números no son comparables como mejora o empeoramiento:** el
  reservado 2 es más grande, más variado y más independiente. Encontró
  familias que el 1 no tenía.
- **Lo que sí se puede afirmar:**
  - los fallos divulgados de E1 y de la auditoría ya se detectan (regresiones
    verdes);
  - un banco escrito sin conocer las reglas sigue encontrando huecos;
  - el falso positivo de A3 (diálogo de ficción) ya no aparece en el banco de
    desarrollo, y en el reservado 2 los 15 diálogos de ficción publicaron.
- **Ninguna de las dos mediciones es seguridad en uso real.**

## Limitaciones y criterios pendientes

- **C1 y C2 siguen sin cumplirse.** E1.1 no cumple la aceptación de E1 y no
  debe conectarse a publicaciones.
- **Vocabulario de spam** demasiado corto para la variedad del reservado 2.
- **Números:** faltan palabras-número compuestas, separadores tipográficos,
  letras sueltas sin dígitos y dígitos no ASCII.
- **Contacto partido** sólo cubre números.
- **Redes:** falta "tik tok" separado y "tg"; una red descripta en palabras
  no se detecta.
- **TLD:** la lista es acotada; un acortador con TLD fuera de ella pasa.
- **"punto com"** como expresión ("las punto com") se confunde con un
  dominio.
- **Diálogo sin comillas** con verbo y red cerca ("le grita escribime por
  WhatsApp") se rechaza.
- **Sensibles:** no son independientes, y amenazas o datos con letras
  espaciadas pasan o se clasifican de otra forma.
- **Autoría:** el agente separado es el mismo modelo y recibió una
  especificación que nombraba las familias. Reduce el sesgo; no lo elimina.
- **Siguiente paso, a decisión de la auditoría:** si se autoriza otra
  corrección, los fallos de arriba pasan a ser regresiones divulgadas, y
  medirla requeriría un **reservado 3** nuevo y sellado.
