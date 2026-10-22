# Informe para auditoría — E1.2, huecos mecánicos y familias divulgadas

22/10/2026. Claude Code. Rama `feat/resenas-reglas`, sobre `1f475e3`.

**Alcance:** módulo puro, sin conectar.
- Sin rutas, pantallas, Supabase, SQL, red, proveedores, Producción,
  variables, push, merge, deploy ni AAB.
- **No se preparó ni ejecutó un reservado 3.**

**E1 NO está cerrada.** Lo que pasa en este informe son **pruebas conocidas**:
- casos escritos o divulgados antes de corregir;
- regresiones sobre los dos reservados ya vistos.

Ninguna es una validación independiente; esa sigue pendiente y es decisión
de la auditoría. C1 y C2 no se reinterpretaron ni se cambió ningún umbral.

## Commits

| Commit | Qué |
|---|---|
| `eaf2461` | Copia sin cambios de la auditoría de `1f475e3` |
| `4250ea5` | Reglas, plegado, banco de desarrollo y pruebas de E1.2 |
| (este) | Este informe y `docs/ESTADO.md` |

Los dos reservados, sus sellos y sus informes no cambiaron: `git diff
1f475e3` sobre esos archivos está vacío.

## Corrección de cada hallazgo

**A1 — Las comillas ya no son una exención** (`contacto.red` v3):
- **Se rechaza:**
  - un usuario (`@…`) cerca de una red o de un verbo;
  - "red: algo";
  - un verbo de contacto con una red a 30 caracteres o menos y un
    **destinatario** de forma reconocible cerca ("a cine_amigo", "soy
    demo_88"), **con o sin comillas**;
  - un verbo con una red, sin comillas ni atribución narrativa.
- **Se retiene (señal débil, nunca publica):** un verbo con una red entre
  comillas o atribuido a un personaje ("le dice", "le grita"…), sin
  destinatario.
- **Se publica:** una red mencionada sin un verbo de contacto cerca.
- **Efecto sobre legítimas conocidas:** dos diálogos legítimos con un pedido
  de red entre comillas pasan de publicarse a **retenerse**: `D-RG-17-B` (banco
  de desarrollo) y `R2-RL-105` (reservado 2). Es la consecuencia buscada por
  A1, no un rechazo. Quedan listados como retenidos conocidos y las pruebas
  exigen que sigan retenidos, ni publicados ni rechazados.

**A2 — Teléfonos** (`contacto.telefono` v3; plegado):
- **Dígitos de cualquier sistema a ASCII:** arábigo-índico, persa,
  devanagari, bengalí y los demás bloques decimales de Unicode, por valor y
  no por literal. NFKC ya cubría ancho completo y matemáticos.
- **Separadores por clase de signo:** punto medio, viñeta, rayas y guiones
  Unicode, tilde y barra vertical, además de los anteriores. El guion blando
  ya se quitaba como invisible.
- **Números dictados de 16 a 99** ("setenta y dos", "veintitrés", "noventa")
  pasan a dígitos en todo el texto: el resultado sigue siendo un número de
  dos cifras y no fabrica contactos. Del 0 al 15 sigue la regla de corridas.
- **Lectura amplia:** la coma y el punto y coma separan, y las letras sueltas
  `o l i s z b g` valen como dígitos cuando están entre dígitos. **Sólo
  cuenta** con una señal fuerte de contacto cerca y con 8 dígitos o más.
  "entre 1985 o 1986" y "puntajes 8, 9, 7" no son teléfonos.

**A3 — Direcciones** (`contacto.enlace` v3; plegado):
- Una **dirección con ruta** cuenta con cualquier terminación de 2 a 6
  letras ("is.gd/demo", "algo.zz/x"): una ruta pegada no aparece en
  puntuación natural.
- Más TLD (incluye `gd`, `gl`, `watch`, `stream`…) y acortadores conocidos
  (`is.gd`, `cutt.ly`, `tinyurl`…), para direcciones **sin** ruta.
- **"punto" suelto** sólo une si la palabra anterior puede ser parte de una
  dirección: la lista cerrada de artículos, preposiciones y nexos no une.
  "la burbuja de las punto com" y "a punto de" ya no son dominios;
  "pelisplus punto com" y las formas entre corchetes sí.

**Familias divulgadas del reservado 2** (punto 4), en la tabla de abajo.

**Versiones:**
- `VERSION_REGLAS` `2026-10-22.3`.
- Nuevas versiones de regla:
  - `contacto.telefono` v3 y `contacto.telefono_nombre` v3;
  - `contacto.email` v2, sin cambio de lógica (lo afecta el plegado);
  - `contacto.email_nombre` v1, nueva;
  - `contacto.enlace` v3 y `contacto.red` v3;
  - `contacto.red_nombre` v2 y `contacto.partido` v3;
  - `spam.promocion` v2, `amenaza.directa` v2 y `datos.documento` v2.

## Cobertura conocida por familia

| Familia | Patrón determinístico cubierto | Señal débil que se retiene | Fuera del alcance (depende de denuncias) |
|---|---|---|---|
| Teléfono, dígitos Unicode | Todo dígito decimal Unicode | — | Dígitos dibujados con símbolos que no son dígitos |
| Teléfono, separadores | Clase de signos tipográficos, hasta 3 entre dígitos | — | Separadores con letras o palabras ("once y luego cinco") |
| Teléfono, dictado | 0–15 en corridas de 3 o más piezas; 16–99 siempre; comas con señal fuerte | — | Centenas y miles dictados; instrucciones ("el doble de…") |
| Teléfono, letras por dígitos | En piezas con dígitos; sueltas entre dígitos con señal fuerte | — | Letras sueltas sin señal fuerte |
| Teléfono con forma de año, importe o fecha | Con señal fuerte de contacto cerca | — | Sin señal fuerte |
| Correo "usuario en/de proveedor" | Usuario con dígito, "_" o ".", o pista de correo cerca; en nombres, cualquier proveedor | — | Paráfrasis sin nombrar el proveedor (`R2-RA-042`, **detenido para revisión**) |
| Dominios y acortadores | Con ruta y cualquier TLD; sin ruta, con TLD o acortador de lista; confusables de la tabla | — | Dominio sin ruta con TLD fuera de lista; confusables fuera de la tabla |
| "punto com" en una frase | No une después de artículos, preposiciones y nexos | — | Una etiqueta que es palabra común no gramatical ("vi punto com…") puede unirse |
| Redes, alias | Alias escritos ("tik tok", "tg", "telegran"…); exhortaciones ("sigan a @…") | Pedido entre comillas o atribuido, sin destinatario | Red descripta en palabras ("la app del video corto") |
| Comillas y diálogos | Destinatario cerca: se rechaza con o sin comillas | Sí, sin destinatario | Distinguir una cita real de un pedido real |
| Spam | Familias: sorteo o premio con imperativo de voseo **con tilde**, casino, premio por encuesta, productos y venta con envío, cripto | Todo spam se retiene, no se rechaza | Paráfrasis nuevas; imperativos escritos sin tilde ("participa") |
| Contacto partido | Números (suma de corridas) y correo o usuario "colgante" en un reciente, con pista de continuación en el actual | Siempre se retiene | Armar el dato desde instrucciones ("sumalo al principio que ya te dije") sin colgante ni pista |
| Amenaza con letras sueltas | Frases de la lista dentro de palabras formadas al unir letras sueltas | Se retiene | Amenazas fuera de la lista |
| DNI con espacios | Con la palabra "DNI" o "documento" delante | Se retiene (ya no pasa como teléfono) | Sin la palabra |

**Familia detenida:** el correo descripto con paráfrasis (`R2-RA-042`) **no
se declara resuelto ni se reclasifica**. Cubrirlo exigiría interpretar "el de
Google, el que termina en com", que no es un patrón determinístico
razonable. Queda para revisión de la auditoría; una prueba fija que sigue
sin detectarse, para que un cambio futuro obligue a revisar la declaración.

## Resultados

**Ejemplos de la auditoría de `1f475e3`**, con su prefijo:

| Sufijo | Antes (E1.1) | Ahora (E1.2) |
|---|---|---|
| Escribime por Instagram a cine_amigo. | rechazo | rechazo (`contacto.red@3`) |
| «Escribime por Instagram a cine_amigo». | **publicar** | rechazo (`contacto.red@3`) |
| Escribime al ١١٥٥٦٦٧٧٨٨ para comentar. | **publicar** | rechazo (`contacto.telefono@3`) |
| Escribime al 11·55·66·77·88 para comentar. | **publicar** | rechazo (`contacto.telefono@3`) |
| Más información en is.gd/demo. | **publicar** | rechazo (`contacto.enlace@3`) |
| Cuenta la burbuja de las punto com… | **rechazo** | publicar |

**Regresiones conocidas:**
- **Reservado 1:** todo abuso detectado; legítimas publicadas salvo
  `R-L-045` (dirección ficticia, falso positivo aceptado por la auditoría
  de `ffa5061`).
- **Reservado 2:**
  - todo abuso detectado salvo `R2-RA-042` (fuera de alcance, detenido);
  - legítimas publicadas salvo `R2-RL-105`, ahora **retenida** por A1;
  - el falso positivo `R2-RL-113` ("las punto com") ya publica;
  - los sensibles `S-AM-06` (amenaza espaciada) y `S-DP-05` (DNI con
    espacios) ahora se retienen.
- **Banco de desarrollo:** 488 casos, todos con el resultado esperado salvo
  el retenido conocido `D-RG-17-B`.
  - C0 0/488; C1 0/178; C2 168/168; C3 0/202; C4 1/202.
  - Incluye 22 pares nuevos de E1.2: variantes de cada familia, no los
    literales del reservado.
- **Transformaciones del mismo caso**
  (`lib/comunidad/reglas/transformaciones.test.ts`):
  - 5 tipos de comillas sobre 4 pedidos y 5 legítimos;
  - 11 separadores;
  - 8 formas de dígitos (ASCII, ancho completo, arábigo-índico, persa,
    devanagari, bengalí, matemático, letras);
  - 6 combinaciones de confusables cirílicos en dominio y correo;
  - contacto repartido de número, correo y usuario, con controles.
  - Ningún pedido transformado se publica y ningún legítimo transformado se
    rechaza.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `node --test "lib/comunidad/**/*.test.ts"` | 69 de 69 |
| `npx tsc --noEmit` | 0 errores |
| `npm test` (suite completa) | 2318 pruebas: 2300 pasan, 0 fallan, **18 omitidas** |

- Las 18 omitidas son las de siempre: necesitan un build web o el artefacto
  de Capacitor, que no se hicieron.
- Sin red, base ni builds.

## Falsos positivos y limitaciones pendientes

- **Retenidos nuevos por A1:** diálogos legítimos que citan un pedido de red
  entre comillas. Es carga de revisión, no rechazo.
- **Diálogo sin comillas ni verbo de atribución** con verbo y red cerca:
  se rechaza. Antes de A1 también.
- **"vi punto com"** u otra etiqueta que sea palabra común no gramatical
  sigue pudiendo unirse.
- **Imperativos de voseo sin tilde** no cuentan para spam: es la
  contrapartida de no retener "el protagonista participa de un sorteo".
- **Listas finitas:** alias de redes, TLD, acortadores, frases de spam y
  verbos. Toda paráfrasis nueva pasa y depende de denuncias. No se
  intentó cubrirla con una lista ilimitada.
- **Evidencia débil:** los pares de E1.2 y las transformaciones los escribió
  quien ajusta las reglas, después de conocer los fallos. Que pasen dice que
  la corrección cubre lo que se pensó, no que generalice.
- **Errata del reservado 2:** `SELLO.md` dice "30 reseñas + 4 nombres" para el
  archivo sensible; son **26 reseñas y 4 nombres**, 30 casos en total, como
  señaló la auditoría. Los porcentajes informados no cambian. El archivo no se
  modificó: sellos y conjuntos quedan intactos.
- **Validación independiente pendiente:** la decide la auditoría. Si se
  acuerda, sería un conjunto nuevo con alcance y tamaño sellados de antemano.
  Esta entrega no la reemplaza ni la presupone.
