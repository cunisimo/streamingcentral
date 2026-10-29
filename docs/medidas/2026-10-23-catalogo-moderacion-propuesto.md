# Contrato de moderación de reseñas v1 (catálogo v3.2)

24/10/2026. Claude Code. **Contrato de moderación v1 = catálogo v3.2.**
- **Es la base aprobada por el dueño para implementar** el 24/10/2026, con
  las dos enmiendas de la auditoría `5982374` y la variante **sin IANA**
  (§0.1).
- **No certifica cobertura ni autoriza publicar.** E1 sigue pendiente de la
  implementación y de su validación.

**Historial:** la v3.1 resolvió la auditoría de `77d8bda`. La v3 concilió la
auditoría de `cac5c50`. La v3.1 corrige los tres hallazgos de la auditoría
de `77d8bda`:
- A1, la composición de F3 con espacios y terminaciones largas (§3.1);
- A2, la derivación al perfil (S3 y §6.R);
- A3, la condición de uso de la lista de IANA y el estado de las huellas
  (§1).
- **Estado:** pendiente de la auditoría de Codex y de la aprobación del
  dueño.
- **No implementado:** no hay reglas, generador ni evaluador nuevos.
- **No se aplica al reservado 3,** que sigue fallido. **E1 sigue sin
  aprobarse.**
- Acompaña a `2026-10-23-propuesta-alcance-moderacion.md`.

**Qué cambió respecto del borrador v2.1:**
- se fijaron las referencias y versiones (§1) y las listas cerradas (§6);
- el ámbito (§7) y el generador (§8);
- la detección propia de H1, H2 y H3 (§5.1);
- `_` se agregó a S (§2);
- E9 queda como exclusión pendiente de aceptación (§10);
- E8 se reformuló (§10).

Lo que sigue abierto está en §12.

## 0.1 Decisiones del dueño (24/10/2026) incorporadas a este contrato

- **Base de implementación:** este catálogo, con las enmiendas 1 (rutas de
  F3-3) y 2 (control de S3) de la auditoría `5982374`.
- **Variante sin IANA.** No se incorpora la lista de TLD de IANA.
  - F3-2 y F3-6 usan **sólo T-fuerte** (§6.T1). **Es menor cobertura que la
    variante completa de la v3.1**, y se registra antes de implementar y
    evaluar. No se cambia después de ver resultados.
  - Las formas genéricas que no dependen de IANA quedan intactas: F3-1, F3-3,
    F3-4, F3-5, los acortadores y la terminación alfabética con ruta.
  - Ampliarlo con IANA queda **diferido** hasta que se acredite su condición
    de uso.
- **Exclusiones E1–E8, y E9 por separado:** aceptadas **para esta etapa**,
  con sus límites. Esto no certifica esa cobertura ni autoriza publicar.
- **Publicación:** desactivada hasta que todas las defensas previstas estén
  implementadas y probadas y se apruebe el filtro.
- **Disponibilidad:** el dueño revisa las colas de retenidos y denuncias
  **diariamente**.
  - No se acordaron minutos, ni una cantidad diaria de casos, ni N.
  - El equipo propone un límite inicial **provisional y conservador**, que se
    contrasta con el trabajo observado.
  - No hay que leer todas las publicaciones.
- **Autoría del futuro conjunto final:** sin resolver en esta etapa. **No se
  hereda** la autorización híbrida del reservado 3.

## 0. Reglas del catálogo

- **El catálogo dice qué se promete, no qué detecta el módulo hoy.** Incluye
  la cobertura mecánica que E1–E1.2 ya prometían. Cada exclusión está en §10
  y queda pendiente de aceptación.
- **Un caso es "fuera" sólo si no contiene ninguna forma incluida y cita una
  exclusión.**
  - La clasificación la hace el autor antes de sellar, y Codex la revisa
    antes de ejecutar.
  - Lo que no encaja en ninguna exclusión cuenta como "dentro".
  - Ningún caso se mueve de categoría después de medir.
- **Salidas:**
  - **rechazar:** contacto o enlace completo (F);
  - **retener:** señal (S) o contenido sensible explícito (H);
  - **publicar:** el texto no contiene ninguna forma incluida.

  La prioridad y los casos mixtos están en §11.
- **Comparación de listas:** sobre el texto **plegado**: NFKC, minúsculas, sin
  acentos ni invisibles, con los confusables de letra de §2-C. Las formas que
  exigen tilde (voseo, §6.I) se buscan en el **original** en minúsculas.
- **Versión:** cualquier cambio de una lista de §6 o de una referencia de §1
  es una versión nueva del catálogo y, para la evaluación, una versión nueva
  del módulo (propuesta §4.1).

## 1. Referencias fijadas (consultadas, **todavía NO incorporadas**)

Se consultaron el 23/10/2026, sólo en lectura y sin costo, en las fuentes
oficiales. Las huellas son del archivo tal como se descargó a la carpeta
temporal de la sesión, **fuera del repositorio**.
- **Las huellas las calculé yo (Claude) sobre esas descargas.** Codex
  comprobó por lectura las cabeceras, versiones, fechas y la cantidad de TLD,
  pero **no pudo recalcular las huellas**, porque su acceso a los bytes falló.
  Por eso son **huellas declaradas, no verificadas independientemente**, y lo
  mismo vale para los tamaños de categorías y confusables. No están
  declaradas incorrectas.
- **Ningún archivo se incorporó al repositorio.** Al incorporarlo, se vuelve
  a descargar la versión fijada, se recalcula la huella y la verifica un
  segundo revisor. La lista de IANA cambia con el tiempo: la cabecera de hoy
  no reemplaza una copia conservada.
- Incorporarlos es un paso futuro: se copian con esta huella, y si la huella
  no coincide no se incorporan.

| Referencia | Versión fijada | Origen | Fecha del archivo | SHA-256 | Condiciones de uso |
|---|---|---|---|---|---|
| Unicode, categorías generales | **Unicode 18.0.0** | `https://www.unicode.org/Public/18.0.0/ucd/extracted/DerivedGeneralCategory.txt` | 2026-06-29 | `d6b151d2d40ee9b1876d26f417980f45ffae47b6055ccf7203cb31f07a030f94` | Unicode License v3 (`https://www.unicode.org/license.txt`), con aviso de copyright |
| UTS #39, confusables | **18.0.0** | `https://www.unicode.org/Public/18.0.0/security/confusables.txt` (idéntico a `security/latest` el 23/10) | 2026-08-06 | `6ed3ee967c9dfdf6677d563c9985182fbc50a2efb7d6059cd57b2e2ce18f5b92` | Unicode License v3 |
| IANA, TLD (**no se incorpora**: variante sin IANA, §0.1) | **Versión `2026102300`** ("Last Updated Fri Oct 23 07:07:01 2026 UTC") | `https://data.iana.org/TLD/tlds-alpha-by-domain.txt` | 2026-10-23 | `274be608419b2c4ae93966cd8e98f6783628312e371c406c0b3a88ca945daa89` | **Pendiente de verificación** (ver abajo). **No se afirma CC0**, y tampoco que esté prohibido |

**Condición de uso de la lista de TLD de IANA: pendiente.**
- La declaración IANA–IETF del 10/11/2021
  (`https://www.iana.org/help/licensing-terms`) dedica a CC0 los "Protocol
  Registries", y los define como los datos de registro **enlazados
  directamente** desde `https://www.iana.org/protocols` o
  `https://www.ietf.org/assignments/`.
- El 23/10 comprobé, sólo en lectura, que `iana.org/protocols` enlaza la
  página "Root Zone Registry" (`/domains/root`), pero **no** el archivo
  `tlds-alpha-by-domain.txt`. El archivo está publicado en
  `data.iana.org/TLD/` y se enlaza desde `/domains/root/files`, sin un aviso
  de licencia propio.
- Esa fuente **no alcanza** para acreditar CC0 para este archivo concreto, y
  no encontré otro fundamento publicado.
- **Condición:** antes de incorporarlo, hay que verificar su condición de uso,
  por ejemplo con una consulta escrita a IANA o con una fuente oficial que
  lo cubra.
- **Si no se verifica**, rige la alternativa de §3.1: F3 deja de depender de
  IANA, y se informa como reducción respecto de esta versión.

**Tamaños medidos sobre esas copias** (declarados por Claude, no verificados
independientemente), para dimensionar el generador:
- Unicode 18.0.0:
  - `Zs` 17, `Pd` 27, `Ps` 80, `Pe` 78, `Me` 13;
  - `Po` 643, `Sm` 1005, `Mn` 2090;
  - `Nd` 770 caracteres, en 77 tramos de 10;
  - `Pc` 10 y `So` 7561.
- UTS #39: 302 caracteres cuyo esqueleto coincide con el de un dígito ASCII.
  Entre ellos están `I` y `|`, y 97 son `Nd`.
- IANA: 1437 TLD, de los cuales 151 son IDN (`xn--`).

## 2. Clases de transformación

| Clase | Definición | Límite |
|---|---|---|
| **D. Formas de dígito** | **D1** ASCII. **D2** todo `Nd` de Unicode 18.0.0. **D3** ancho completo y matemáticos (por NFKC). **D4** superíndices y subíndices `⁰–⁹ ₀–₉`. **D5** circulados `⓪ ①–⑨`. **D6** emoji de tecla: dígito + U+FE0F opcional + U+20E3. **D7** palabras-número en castellano (§6.N). **D8** palabras-número en inglés (§6.N). **D9** letras y signos que imitan dígitos (§6.L) | D7 y D8, sólo según §6.N. D9, **sólo** dentro de una corrida que ya tiene al menos un dígito |
| **S. Separadores entre grupos de dígitos** | Hasta 3 caracteres por hueco, de este conjunto **cerrado**: `Zs`, `Pd`, `Ps`, `Pe`, `Po` (salvo `,` `;` `:`), `Sm`, `Mn`, `Me`, U+FE0F, `/` y **`_` (U+005F)** | **S2:** `,` `;` `:` cuentan **sólo** con una señal de intención (I) o un medio (M) en el ámbito. **No** son separadores `So` (pendiente, E9) ni el resto de `Pc`; `_` sí lo es, para conservar la cobertura de `SEP` |
| **P. Punto de dominio** | **Pegado:** `.` `。` `．` `｡`. **Espaciado:** esos signos con al menos un espacio **a cada lado**. **Escrito:** "punto" o "dot", sueltos o entre `[ ]` o `( )`, con guiones pegados opcionales (`-[punto]-`). **Coma pegada:** sólo en F3-6 | Cómo se combina con T y la ruta: §3.1 |
| **B. Barra** | `/` · "slash" · "barra" · hasta 1 espacio a cada lado | |
| **T. Terminaciones** | **T-fuerte** (§6.T1). **T-IANA:** el resto de la lista de §1 (**no se usa** en la variante sin IANA, §0.1). **T-palabra** (§6.T2). **Alfabética:** cualquier terminación de 2 a 63 letras | **Qué terminación vale con cada punto y con o sin ruta: sólo según la tabla de §3.1** |
| **C. Confusables de letra** | Esqueleto de UTS #39 18.0.0 hacia el latín, **sólo para caracteres que no son ASCII**. Los ASCII no se transforman: UTS #39 incluye mapeos ASCII→ASCII, como `m`→`rn`, que romperían coincidencias normales. Textos, patrones y listas se pliegan con la misma función. Los dígitos siguen como clases ambiguas (`[o0]`, `[il1|]`) | |
| **I. Intención de contacto** | Formas cerradas de §6.I | La tercera persona, el infinitivo, el presente de indicativo y el pretérito **no** son intención |
| **M. Medios de contacto** | §6.M | |
| **A. Alias con forma de usuario** | Letras y dígitos con al menos una letra y al menos un dígito, `_` o `.`, en cualquier posición. Además: `alias#dddd` (2 a 6 dígitos), `@` seguido de hasta 1 espacio y alias, y letras sueltas separadas por un mismo signo (`l.u.n.a`, al menos 4 letras). La puntuación final de la oración no cuenta | Las palabras de §6.A nunca son alias |

## 3. Familias de contacto y enlace (**rechazar**; cuentan en C1a y C2a)

| Familia | Forma | Combinaciones | Controles legítimos (publicar) |
|---|---|---|---|
| **F1 Teléfono** | **8 o más dígitos en total, prefijos incluidos** (`+54`, `0`, `9` y `15` suman). (a) Corrida continua sin separadores. (b) Grupos de 1 a 4 dígitos separados por S | D1–D9 × S. S2 con I o M. Número con forma de año, fecha (`dd/mm/aaaa`, con `/` `-` `.`) o importe (`$`, separador de miles) **con I o M en el ámbito** | Años sueltos y en pares, rangos de años, duraciones, temporadas y episodios (`T3E8`), puntajes con barra, rankings, recaudaciones y presupuestos **sin** I ni M, fechas de estreno, títulos con dígitos, emoji de tecla usado como puntaje (`5️⃣ estrellas`, con menos de 8 dígitos) |
| **F2 Correo** | `usuario@dominio` o `usuario@proveedor` | `@` y "arroba", "at", `(at)`, `[at]` × P × letras espaciadas × C. "usuario en/de/del <proveedor>". Alias (A) + "mi usuario/mail/correo/casilla de <proveedor>" en el ámbito | "el mail de su jefe en Gmail", "le escribe un correo", proveedores nombrados en una escena |
| **F3 Enlace** | Las formas F3-1 a F3-6 de §3.1. Acortador de §6.H sin TLD | P × B × C × T, según §3.1. Etiquetas con guiones | "las punto com", "y/o", "8.5/10", "2.0/beta", "drama/comedia", palabras unidas por un punto sin espacio cuya terminación es T-palabra y sin ruta ("buenísima.Final") |
| **F4 Usuario de red** | (A, o "usuario/user/nick/soy/como/el usuario es/mi usuario es" + alias) **y** (plataforma de §6.M o I), en el ámbito | Con comillas o atribución narrativa: **rechaza si hay alias** | "la sigue en Instagram", "busca a su hermana en TikTok", la cuenta de Twitter de un personaje sin alias |

### 3.1 Composición de F3 (A1 de `77d8bda`)

**Definiciones:**
- **Punto pegado:** `.` `。` `．` `｡` sin espacios a los lados.
- **Punto espaciado:** uno de esos signos con **al menos un espacio a cada
  lado**. "Palabra. Palabra", con espacio sólo después, es fin de oración y no
  cuenta.
- **Punto escrito:** "punto" o "dot", sueltos o entre `[ ]` o `( )`, con
  guiones pegados opcionales (`-[punto]-`).
- **Barra:** `/` con 0 o 1 espacio a cada lado, o "slash" o "barra".
- **Ruta (depende de la forma; enmienda 1 de `5982374`):**
  - **En F3-3**, la ruta conserva la clase de caracteres de la versión
    2026-10-22.5: al menos un carácter de letras, dígitos, `_`, `-`, `.`,
    `/`, `?`, `=`, `&`, `%` o `#`, **también al inicio**. No exige un
    segmento de dos caracteres alfanuméricos.
  - **En F3-4 y F3-6**, la ruta exige al menos un segmento de 2 o más letras
    o dígitos, y los segmentos siguientes se unen con más barras.
  - Las restricciones nuevas contra falsas alarmas de las formas nuevas, como
    F3-4, **no se aplican retroactivamente a F3-3**.

| Forma | Punto | Terminación | Ruta | Datos de IANA |
|---|---|---|---|---|
| **F3-1** | Esquema `http(s)://` o `www.` | Cualquiera | Opcional | No |
| **F3-2** | Pegado | **Sólo T-fuerte** (§6.T1) en la variante sin IANA (§0.1). En la variante completa, diferida: también IANA salvo T-palabra | Sin ruta | **No** en esta variante |
| **F3-3** | Pegado | **Cualquier terminación alfabética de 2 a 63 letras**, incluidas las T-palabra | **Obligatoria** | No (es la cobertura vigente) |
| **F3-4** | **Espaciado o escrito** | **Cualquier terminación alfabética de 2 a 63 letras, salvo T-palabra** | **Obligatoria** (barra con o sin espacios, o escrita) | **No** |
| **F3-5** | Espaciado o escrito | Sólo T-fuerte | Sin ruta | No (es la cobertura vigente) |
| **F3-6** | Coma pegada en lugar del punto | **Sólo T-fuerte** en la variante sin IANA (§0.1) | **Obligatoria** (segmento de 2 o más) | **No** en esta variante |

- **El caso `R3-A-064`** (`lacinematecadelsur . photography / analisis /
  ultima`) es **F3-4**: punto espaciado, terminación alfabética que no es
  T-palabra y ruta. `R3-A-066` ("dot argentina slash directores") también es
  F3-4, aunque "argentina" no es un TLD. No se agregó ninguna terminación a
  ninguna lista.
- **Restricciones contra falsas alarmas:**
  - **Sin ruta:** sólo el punto pegado admite terminaciones de IANA. Con
    espacios o escrito, sólo T-fuerte (F3-5, como hoy). T-palabra nunca
    cuenta sin ruta.
  - **Con ruta:** el punto espaciado exige espacios a **los dos** lados, así
    que el fin de oración no cuenta. T-palabra cuenta sólo con punto pegado
    (F3-3), nunca espaciada (F3-4). La ruta exige un segmento de 2 o más
    caracteres.
  - "y/o", "8.5/10", "2.0/beta" y "drama / comedia" no tienen una etiqueta
    seguida de un punto y una terminación alfabética.
- **Costo a medir con C3 y C4:** un texto como "palabra . palabra / palabra",
  con espacios a los dos lados del punto, se rechaza.
- **Dependencia de IANA:** sólo F3-2 y F3-6, más allá de T-fuerte. Si la
  condición de uso de §1 no se verifica, F3-2 y F3-6 quedan con T-fuerte
  solo. Eso **no** reduce la cobertura vigente, pero sí la de esta versión, y
  se informa así. F3-4 no depende de IANA.

## 4. Señales indirectas (**retener**, nunca rechazar)

**Ninguna se dispara con un solo indicio:** un verbo, una plataforma, un
proveedor o una palabra de medio, solos, publican.

| Señal | Condición (en el ámbito) | Criterio | Controles (publicar) |
|---|---|---|---|
| **S1 Autoatribución + intención** | "mi/nuestro/nuestra" + medio de §6.M **y** I | C2a | "mi celular se quedó sin batería", "mi Instagram está lleno de spoilers" (sin I) |
| **S2 Medio sin dato + pedido** | I + "por privado / al privado / por dm / por md", o I + medio sin alias | C2a | "le pide el número por privado" (no es I) |
| **S3 Derivación al perfil** | **S3-a:** las expresiones de la regla vigente `perfil.derivacion`, que retienen solas porque ya combinan posesivo e identidad: "mi perfil", "mi bio", "mi nombre de usuario", "mi nombre de perfil". **S3-b:** un verbo de remisión de §6.R + "en/a/por" opcional + "mi" + (nombre, apodo, nick, usuario, perfil, cuenta). **S3-c:** I + "mi" + esa misma palabra + un marcador de §6.P. Todo en el ámbito | C2a | "fíjense en el nombre del personaje", "miren el perfil del villano", "el apodo del protagonista es…". **Falso positivo conocido (enmienda 2 de `5982374`):** "fíjense en mi nombre favorito de la saga" es una reseña legítima que S3-b **puede retener** por ambigüedad. **No es un control publicable**: cuenta como falso positivo en C4, sin una excepción particular y sin etiquetarla como abuso |
| **S4 Contacto partido** | Las últimas 3 versiones o reseñas de la cuenta en 24 h. Hay un dato incompleto en una y su continuación en otra: corridas de dígitos que suman 8 o más, o un colgante de F2 o F4, con un marcador de §6.K | C2a | Reseñas sucesivas con años, temporadas o episodios |
| **S5 Venta o promoción** | Un término de venta o sorteo de §6.V + un acompañante de §6.V en el ámbito, o la regla de spam vigente | Informativo, sin umbral (como el spam hasta hoy) | "el protagonista vende…", "el sorteo del pueblo en la trama" |

## 5. Contenido sensible explícito (**retener**; cuenta en CS)

Sólo **formas explícitas**. Lo velado, irónico o contextual va a E7.

| Familia | Condición (listas de §6) | Controles narrativos (publicar) |
|---|---|---|
| **H1 Amenaza explícita** | (a) Una forma directa de §6.H1-a; o (b) pronombre (`te`, `lo`, `la`, `le`, `los`, `las`, `les`) + (`voy`, `vamos`, `van`) `a` + daño de §6.H1-b. Con `lo`, `la`, `le`, `los`, `las` o `les`, hace falta además un **destinatario** de §6.H1-c en el ámbito; con `van a`, sólo vale `te`. (c) Deseo o merecimiento de §6.H1-d. Nunca dispara una expresión de §6.H1-e | "el villano le dice que lo va a matar" (tercera persona), "me mató de risa", "la rompe", "la vamos a pasar bomba" |
| **H2 Odio explícito** | (a) Un término de grupo de §6.H2-a **y** un término de deshumanización o exclusión de §6.H2-b, en la misma oración y en cualquier orden. (b) Un insulto de §6.H2-c, que retiene solo. (c) En nombres: primero se separan las mayúsculas internas, los dígitos y los signos, y después se aplican (a) y (b) | "la película retrata el racismo contra los bolivianos", "un documental sobre inmigrantes". Una **cita explícita** ("un personaje dice que los inmigrantes son una plaga") **se retiene**, y el costo cuenta en C4 |
| **H3 Datos personales** | (a) Documento: "dni / d.n.i. / documento / doc." + 7 u 8 dígitos (con puntos o espacios). CUIT o CUIL con la forma `dd-dddddddd-d`, con o sin etiqueta. 7 u 8 dígitos con la forma `d.ddd.ddd` o `dd.ddd.ddd` y un **nombre propio** en el ámbito, sin unidad monetaria ni de cantidad a 3 palabras o menos. (b) Domicilio: tipo de vía de §6.H3-a + 1 a 4 palabras + un número de 1 a 5 dígitos, **y** un nombre propio o relación personal de §6.H3-b, **y** un localizador de §6.H3-c, todo en el ámbito | "vive en la calle Elm 1428" de una ficción (sin localizador de persona real, o sin nombre propio), números de expediente, recaudaciones |

**Nombre propio:** dos o más palabras seguidas que empiezan con mayúscula en
el original, y no al comienzo de una oración salvo que sigan dos. Es una
heurística: en un texto todo en minúsculas no hay nombre propio, y eso
**limita** H3 (§12).

### 5.1 Detección propia de cada familia H

- **Indicador de CS:** que se dispare la **regla de la familia**, registrada
  en las reglas disparadas de la decisión. Que el texto no se haya publicado
  **no** alcanza.
  - Un caso H1 con un teléfono rechazado por F1 sólo cuenta para CS-H1 si
    además se disparó una regla de H1.
  - La salida final sigue la prioridad única (§11). Los indicadores se leen
    de los disparos, no de la salida.
- **Mínimos con casos puros:**

  | Familia | Mínimo de casos puros | Denominador | Cumple si |
  |---|---|---|---|
  | H1 | 30 reseñas | Casos puros H1 "dentro" | Regla H1 disparada en ≥ 95 % |
  | H2-R | 30 reseñas | Casos puros H2 "dentro" de tipo reseña | ≥ 95 % |
  | H2-N | 10 nombres | Casos puros H2 "dentro" de tipo nombre | ≥ 95 %, es decir 10 de 10 |
  | H3 | 30 reseñas | Casos puros H3 "dentro" | ≥ 95 % |

  - **Puro** quiere decir que no contiene ninguna forma de F, S ni de otra
    familia H.
  - Lo marca el autor y Codex lo revisa antes de ejecutar.
- **Casos mixtos:** son adicionales y **no** cuentan para los mínimos. Se
  informan aparte con dos columnas:
  - la salida final correcta según §11;
  - si se disparó la familia H correspondiente.
- **Para F y S**, C1a y C2a siguen midiendo que el texto **no se publicó**:
  para los contactos, lo que importa es que no se publiquen. Igual, el
  generador (§8) exige el disparo de la regla propia de cada familia.
- **Mapeo de reglas a familias:** se fija en la implementación con la tabla
  `regla → familia`, y cualquier cambio a esa tabla es una versión nueva.
  Hoy, H1 es `amenaza.*`, H2 es `odio.*` y H3 es `datos.*`.
- **Cambio pendiente en el evaluador** (no se hace en esta entrega): agregar
  a cada caso las marcas de pureza y de familias, y calcular CS por disparo.
  Hoy el evaluador calcula detección por salida.

## 6. Listas cerradas (catálogo v3)

Formas plegadas: sin tilde salvo donde se indica, y en singular y plural
cuando se indica. Ninguna se amplía durante la implementación.

**§6.N Palabras-número**
- **Castellano 0–15:** cero, uno, una, un, dos, tres, cuatro, cinco, seis,
  siete, ocho, nueve, diez, once, doce, trece, catorce, quince. Cuentan
  **sólo** en corridas de 3 o más piezas numéricas, como hoy.
- **Castellano 16–99**, siempre:
  - dieciséis a diecinueve, también como "diez y seis" a "diez y nueve";
  - veinte; veintiuno, veintiún, veintiuna, veintidós a veintinueve, también
    como "veinte y …";
  - treinta, cuarenta, cincuenta, sesenta, setenta, ochenta y noventa, más
    "y" + unidad.
- **Inglés:** zero, oh (sólo dentro de una corrida), one, two, three, four,
  five, six, seven, eight, nine. Cuentan **sólo** en corridas de 3 o más
  piezas.
- **Fuera**, con la exclusión E1: centenas, miles, y "doble/double" o
  "triple".

**§6.L Letras que imitan dígitos (D9)**, sólo dentro de una corrida con
dígitos:
- `o`→0, `l` `i` `|`→1, `s`→5, `z`→2, `b`→8 y `g`→9: la tabla vigente, que
  se conserva.
- **Además**, los 302 caracteres de UTS #39 18.0.0 cuyo esqueleto coincide
  con el de un dígito ASCII, incluidos `З`, `О` cirílica y `I`.

**§6.I Intención** (lista cerrada de formas)
- **Voseo con clítico:** escribime, escribinos, mandame, mandanos, agregame,
  agreganos, buscame, buscanos, seguime, seguinos, contactame, contactanos,
  hablame, hablanos, llamame, llamanos, sumame, sumate, pasame, pedime,
  pedinos, encontrame, avisame, consultame, agendame, agendate.
- **Voseo sin clítico, sólo de verbos en -ar, con tilde en el original:**
  mandá, agregá, buscá, contactá, hablá, llamá, sumá, pasá, entrá, agendá,
  consultá, avisá.
  - **No** valen las de -er e -ir (escribí, seguí, pedí): coinciden con el
    pretérito de primera persona.
  - Sin tilde, "manda" es tercera persona: tampoco vale.
- **Tú:** escríbeme, mándame, agrégame, búscame, sígueme, contáctame,
  háblame, llámame, encuéntrame, avísame, pídeme.
- **Usted:** escríbame, mándeme, agrégueme, búsqueme, sígame, contácteme,
  hábleme, llámeme, encuéntreme, avíseme, pídame.
- **Plural, con o sin clítico:** escriban, escríbanme, escríbannos, manden,
  mándenme, agreguen, agréguenme, busquen, búsquenme, sigan, síganme,
  contacten, contáctenme, hablen, háblenme, llamen, llámenme, súmense,
  pásense, entren, agenden, agéndenme, pidan, pídanme, encuéntrenme,
  avísenme, consulten.
- **Frases:** "por privado", "al privado", "por dm", "al dm", "por md",
  "al md", "dm", "md", "te paso", "les paso", "les dejo mi", "te dejo mi".
- **Nunca son intención:**
  - tercera persona: busca, pasa, sigue, entra, escribe, manda, llama;
  - infinitivos;
  - pretéritos: escribí, pasé, busqué, seguí;
  - presente de indicativo: escribo, mando, sigo.

**§6.M Medios**
- **Plataformas y alias:**
  - instagram, insta, ig;
  - tiktok, tik tok, tt;
  - telegram, telegran, tg, tele;
  - whatsapp, whatsap, watsap, guasap, wsp, wpp, wa, whats;
  - discord, dc;
  - snapchat, snap;
  - facebook, face, fb;
  - twitter;
  - x, **sólo** junto a "usuario", "@" o un alias;
  - twitch, kick, threads, signal, kik, onlyfans.
- **Proveedores:** gmail, hotmail, outlook, yahoo, live, icloud, proton,
  protonmail.
- **Palabras de medio:** cel, celu, celular, número, numero, nro, teléfono,
  telefono, tel, correo, mail, email, casilla, usuario, user, cuenta, canal,
  grupo, perfil, nick, apodo.

**§6.A Palabras que nunca son alias:** la lista `NO_ALIAS_CORREO` de la
versión 2026-10-22.5, sin cambios (50 palabras: artículos, pronombres,
adjetivos comunes).

**§6.H Acortadores sin TLD:** bitly, linktr, tinyurl, cuttly, rebrandly,
shorturl, adfly, wa.me, t.me, is.gd, v.gd, ow.ly, t.ly, s.id, mega.nz.
- Es la lista vigente, sin agregados.
- Con TLD, un acortador ya es F3 por T.

**§6.T1 T-fuerte:** la lista `TLD_FUERTES` de 2026-10-22.5, sin cambios (62
terminaciones).

**§6.T2 T-palabra**: TLD de IANA que son palabras comunes en reseñas
argentinas, o marcas de plataformas. Cuentan sólo pegados **y** con ruta.
- **De la lista vigente:** me, es, la, de, co, tv, to, in, it, us, be, fm, am,
  so.
- **Agregados de 2 letras:** al, as, do, no, se, si, va, ve, re. ("su" ya está en T1: ver §12.)
- **Agregados de 3 o más letras** (los que no están en T1): actor, arte, auto,
  autos, baby, band, bar, bet, bio, blue, book, box, buy, cafe, cam, car,
  cars, casa, case, cash, casino, cat, chat, city, coach, cool, data, date,
  day, deal, dog, eco, email, fan, fans, film, final, fit, food, free,
  futbol, game, games, gay, gift, gold, golf, gratis, green, hair, help,
  here, hot, house, ice, juegos, kids, land, latino, law, like, love, lol,
  luxe, mango, map, market, meme, men, menu, moda, money, monster, moto,
  music, new, next, ninja, now, one, open, party, pet, phone, photo, pics,
  pink, pizza, play, plus, poker, porn, press, promo, radio, red, rent,
  rest, rio, rocks, room, run, sale, salon, sex, sexy, show, ski, sky,
  smart, smile, soccer, social, solar, song, soy, spa, sport, star, studio,
  style, surf, taxi, team, tienda, tips, tours, toys, travel, uno, vegas,
  viajes, vision, viva, vivo, vote, voto, web, win, wine, work, wow, wtf,
  yoga, you, zero.
- **Marcas:** amazon, apple, google, hbo, netflix, prime, youtube.

**§6.R Verbos de remisión al perfil (S3-b; A2 de `77d8bda`):**
- **Fijarse:** fijate, fíjate, fíjense, fíjese.
- **Mirar:** mirá (con tilde en el original), miren, mire.
- **Otros:** chequeá, chequeen, vean, revisá, revisen; "pasá por" y "entrá a"
  (con tilde); "pasen por", "entren a"; buscá (con tilde), busquen.

Solos no retienen nada: hace falta "mi" + una palabra de identidad (S3-b).
"Fíjense que la peli…" o "miren el final" publican.

**§6.P Marcadores de perfil (S3):** "de acá", "que ven", "comunitario", "en
todas las redes", "el mismo", "mismo nombre", "mismo apodo".

**§6.K Marcadores de continuación (S4):**
- la lista `PISTAS_CONTINUACION` vigente;
- más: "en otra reseña", "en la otra reseña", "en mi próxima reseña", "lo
  termino", "la termino", "empieza con", "arranca con", "termina con",
  "termina en", "la segunda parte".

**§6.V Venta y promoción (S5)**
- **Venta o sorteo:** vendo, vendemos, revendo, liquido, liquidamos, alquilo,
  sorteo, sorteamos, sorteando, regalamos, giveaway.
- **Acompañantes:**
  - precio, precios, `$` + número, envío, envíos, stock, cuotas, consultas,
    interesados, oferta, descuento, mayorista;
  - "dale like", "dale me gusta";
  - las formas de §6.I y del voseo de spam vigente (seguí, etiquetá,
    compartí, comentá, participá, con tilde).

**§6.H1 Amenazas**
- **a. Formas directas:**
  - te mato, te reviento, te rompo la cara, te cago a palos, te cago a
    trompadas, te parto la cara, te quemo;
  - sé dónde vivís, sé dónde vive, sé dónde trabajás, sé dónde trabaja, sé
    dónde laburás, sé dónde estudiás;
  - te voy a buscar, te voy a encontrar, te vamos a buscar, te vamos a
    encontrar.
- **b. Daño:**
  - matar, asesinar, reventar, romper la cara, romper las piernas, cagar a
    palos, cagar a trompadas, cagar a piñas, cagar a tiros, pegar un tiro,
    pegar un balazo, pegar una paliza, dar una paliza, meter un tiro,
    apuñalar, acuchillar, degollar, quemar, prender fuego, violar, lastimar,
    golpear, ahorcar, envenenar, hacer boleta, hacer mierda, hacer
    desaparecer;
  - también con el clítico pegado: matarte, reventarlo.
- **c. Destinatario:** vos, "al de la reseña", "el de la reseña", "al que
  puso", "al que escribió", "al que comentó", "a ese", "a esa", "a este", "a
  esta", "al director", "al actor", "a la actriz", "moderador", `@` + alias.
- **d. Deseo o merecimiento:**
  - ojalá te mueras, ojalá se muera, ojalá te maten, ojalá lo maten;
  - merecés morir, merecen morir, merecen que los maten, merecés que te
    maten.
- **e. Nunca disparan:** de risa, la rompe, la rompió, romperla, matar el
  tiempo, quemar la cabeza, la vamos a pasar, me mató, me reventó de risa.

**§6.H2 Odio**
- **a. Grupos**, con flexión de género y número:
  - **nacionalidad y etnia:** boliviano, bolita, paraguayo, paragua (sólo
    con 2-b: "paraguas" es también un objeto), peruano, perucho, chileno,
    chino, ponja, coreano, judío, negro, villero, sudaca, gitano,
    inmigrante, extranjero, indio, coya, mapuche, turco, árabe, moro,
    musulmán;
  - **orientación e identidad:** gay, puto, trolo, maricón, lesbiana, trava,
    travesti, trans, homosexual;
  - **discapacidad:** mogólico, discapacitado, retrasado, autista, down;
  - **sexo y género:** mujer, mina, hembra, feminista, feminazi.
- **b. Deshumanización y exclusión:**
  - plaga, basura, lacra, escoria, parásito, enfermedad, enfermos,
    cucaracha, rata, animales, bestias, inferiores, infrahumanos;
  - "no son personas", "no son humanos", "no deberían existir", "no
    tendrían que haber nacido", "no tendrían que tener derechos";
  - "hay que" o "habría que" + (echarlos, sacarlos, matarlos,
    exterminarlos, quemarlos, deportarlos);
  - "que se vuelvan", "que se vayan", "fuera", "muerte a", "odio a", "odio"
    (en nombres), "de mierda", exterminio.
- **c. Insultos que retienen solos:** maricón, maricones, trolo, trolos,
  trola, sudaca, sudacas, mogólico, mogólicos, mogólica, feminazi, feminazis.
  Es la lista vigente más feminazi.

**§6.H3 Datos personales**
- **a. Tipos de vía:** calle, av., avenida, pasaje, pje., diagonal, diag.,
  boulevard, bulevar, bv., ruta, camino, manzana, mz.
- **b. Relación personal:** mi vecino, mi vecina, mi ex, mi jefe, mi jefa,
  el acomodador, la acomodadora, el profe, la profe, el dueño, la dueña.
- **c. Localizadores:** vive, vivía, lo encuentran, la encuentran,
  ubíquenlo, ubíquenla, vayan a, visítenlo, su casa, su departamento, su
  dirección, su domicilio, queda en, timbre, escrachenlo, escráchenla.

## 7. Ámbito y oración

- **Palabra:** una corrida máxima de letras, dígitos y `_` en el texto
  plegado.
- **Oración:** un tramo que termina en `.` `!` `?` `…` (o en una
  combinación de ellos) seguido de un espacio, un salto de línea o el final
  del texto, o que termina en un salto de línea.
  - **No** cortan: un punto entre dos caracteres alfanuméricos sin espacio
    (dominios, `8.5`, `11.345.678`), ni un punto dentro de comillas que
    sigue en minúscula.
- **Ámbito:** la misma oración o la contigua, y como máximo **25 palabras**
  entre el primer indicio y el último de la condición.
  - Reemplaza las ventanas en caracteres vigentes (30, 40 y 60).
  - En H2-a, el ámbito es **sólo la misma oración**.
- **Nombres comunitarios:** todo el nombre es una oración.

## 8. Generador (futuro; no implementado)

Es determinista, versionado, con semilla fija y basado en las referencias de
§1 y las listas de §6. **No promete cobertura semántica:** cubre las
transformaciones declaradas, y nada más.

| Dimensión | Qué hace |
|---|---|
| D2 | **Enumera** los 77 tramos `Nd`: un dígito por tramo en una corrida, y la corrida completa con los 10 dígitos del tramo |
| D3–D8, §6.L completa (302 + la tabla vigente) | **Enumera** |
| S: `Zs` (17), `Pd` (27), `Ps` (80), `Pe` (78), `Me` (13), U+FE0F, `/`, `_` y S2 | **Enumera** |
| S: `Po` (643), `Sm` (1005), `Mn` (2090) | **Muestrea** 64 por clase, con semilla fija |
| P, B, §6.I, §6.M, §6.H, §6.T1, §6.T2, §6.H1–H3 | **Enumera** |
| T-IANA | **No aplica** en la variante sin IANA (§0.1) |
| F3 (§3.1) | **Enumera** cada forma, de F3-1 a F3-6 × cada punto pegado, espaciado o escrito × la barra con o sin espacios o escrita. En F3-4, **muestrea** 50 terminaciones alfabéticas de 7 a 63 letras con semilla, más las de T-fuerte. Controles: fin de oración seguido de una barra, T-palabra espaciada con ruta, "drama / comedia" |
| C (UTS #39 hacia el latín) | **Muestrea** 200 |
| Combinaciones | Cada dimensión se recorre completa con las demás en su forma base. Después, **todos los pares** de dimensiones con representantes. No se genera el producto completo |
| Controles | Cada transformación lleva un control legítimo con la **misma** transformación (por ejemplo, el mismo separador entre años). Los controles narrativos de §4 y §5 son **plantillas redactadas**, marcadas como tales |
| Requisito | **100 %** de la salida esperada **y** del disparo de la regla de la propia familia en lo generado. Un fallo en una muestra **no** prueba la clase entera, y el informe lo dice |

## 9. Fallos conocidos y su lugar en el catálogo

| Fallo (reservado 3) | Queda en |
|---|---|
| `⁃`, emoji de tecla, `З` como dígito, palabras pegadas a dígitos, inglés | F1 por S, D6, D9 (§6.L), D7 y D8 |
| Dictado en grupos con "escriban" o "mi número es" | F1 por S2 + I o M |
| Fecha `11/04/1988` cerca de "Llamame" | F1 (fecha + I) |
| Espacios alrededor del punto con terminación larga (`. photography /`), "dot … slash" | **F3-4** (§3.1) |
| Coma por punto (`,com/…`) | F3-6 |
| `。` y `-[punto]-` con ruta | F3-3 y F3-4 |
| Discord + "mándenme" + `alias#4821`; "búsquenme"; "pásense"; "mandá"; `@ ` con espacio; "tt", "tele" | F4 por I, A y M |
| "sgme" | E6, salvo que lleve otro indicador |
| "nachito.cine, mi usuario de Gmail" | F2 |
| "mi casilla de Hotmail es la de siempre…", "pedime el número por privado", "mi usuario de TikTok es el mismo apodo…", "canal en Telegram… búsquenlo" | S1 y S2 |
| "fíjense en mi nombre comunitario" | S3-b ("fíjense" + "mi nombre"); el marcador "comunitario" no hace falta |
| "búsquenme con el nombre que ven… mi apodo de acá es el mismo" | S3-c |
| Usuario partido con "empieza con" / "termina con" | S4 |
| "Vendo cuentas…", "Sorteamos… seguí, etiquetá" | S5 |
| "te voy a pegar un tiro", "lo voy a ir a buscar…", "le voy a reventar…" | H1 |
| Grupo + "plaga", "enfermedad", "habría que sacarlos"; argot de nacionalidad; nombres pegados | H2 |
| Domicilio sin "vive en" | H3 |

## 10. Exclusiones (todas **pendientes de aceptación del dueño**; ninguna exime)

**Ninguna exclusión hace que se ignore otra forma incluida presente en el
mismo texto** (§11). Una exclusión sólo dice que esa evidencia **no está
prometida**.

| # | Exclusión | Por qué (límite elegido, no imposibilidad) |
|---|---|---|
| **E1** | Instrucciones aritméticas o de armado ("sumale 52", "11 seguido de esos dos años"), centenas y miles dictados, "doble" o "triple" | Se podría implementar una gramática acotada, pero cada redacción nueva reabre el ciclo. Si hay S1 o S2, se retiene |
| **E2** | Referencias a datos que no están en el texto ni en el historial de S4 | No hay de dónde tomar el dato. Si hay S1 o S3, se retiene |
| **E3** | Medios, dominios o redes descriptos sólo en palabras | Exige interpretar descripciones abiertas |
| **E4** | Palabras-número en idiomas distintos del castellano y el inglés | Límite elegido |
| **E5** | Dato repartido en más de 3 textos o en más de 24 h | Límite del historial del diseño |
| **E6** | Abreviaturas y formas fuera de §6.I y §6.M ("sgme") | Las listas son cerradas por versión |
| **E7** | Amenazas veladas, condicionales sin daño explícito, acoso sin términos, ironía, odio en código o indirecto, difamación, estafas y phishing narrados sin datos | Exige interpretar intención y contexto. Queda para las denuncias |
| **E8** | **Contenido sexual que involucra a menores: cobertura no certificada.** | Es una **restricción elegida de esta evaluación**, no una imposibilidad: no se genera ni se redacta ese material (G1), así que esta evaluación no lo mide ni lo certifica. La regla vigente `menores.sexual` se conserva como **defensa adicional sin criterio**, y **no garantiza la detección**. La denuncia tiene categoría grave. Cualquier evaluación de esa cobertura necesitaría otro procedimiento, que esta propuesta no plantea |
| **E9** | **Teléfono partido con símbolos o emojis sueltos** (`So`) entre los grupos de dígitos. **Pendiente de aceptación del dueño.** | **Aceptada por el dueño para esta etapa** (§0.1). **Hipótesis, no evidencia:** incluir `So` (7561 caracteres) agregaría muchos separadores posibles y el riesgo de leer como teléfonos los puntajes escritos con emojis. No hay datos de uso real sobre su frecuencia, ni en reseñas legítimas ni como evasión. **Alternativa** si el dueño no la acepta: incluir `So` en S, que es una ampliación del alcance que hay que diseñar y auditar. El emoji de tecla (D6) **no** está excluido |

**Restricciones de generación** (no son alcance del producto):
- **G1:** no se genera ni se redacta contenido sexual con menores.
- **G2:** todos los datos son ficticios, y ninguna persona real es blanco.

## 11. Prioridad de salidas y casos mixtos

- **Una sola salida por texto, la más restrictiva:** rechazo de formato,
  rechazo de contenido, retención y publicación.
- **Una exclusión no exime:** si el texto trae una forma incluida, esa forma
  decide.
- **Clasificación:** un caso se marca con **todas** las familias incluidas
  que contiene, y es "fuera" sólo si no contiene ninguna y cita una
  exclusión.
- **C1a y C2a:** el éxito es la detección (que no se publique).
- **CS:** el éxito es el **disparo de la familia** (§5.1), contado sólo sobre
  casos puros. Los mixtos se informan aparte.
- **Contacto + sensible:** la salida esperada es **rechazar**.
  - Para CS, el caso es mixto y no cuenta en el mínimo.
  - Se informa si la familia H también se disparó.
  - Un texto rechazado no se guarda, y el contenido sensible se vuelve a
    evaluar cuando el autor lo reenvía.

## 12. Puntos técnicos abiertos (con la resolución que propongo)

| Punto | Por qué sigue abierto | Resolución propuesta |
|---|---|---|
| **T-palabra (§6.T2)** | Es una lista de criterio, no derivada de un diccionario | Que Codex la revise antes de aprobar. Agregar o quitar entradas cambia el alcance y es una versión nueva |
| **Nombre propio (H3)** | Es una heurística por mayúsculas; falla en un texto todo en minúsculas | Aceptarla como límite declarado de H3, o pedir que el domicilio o el DNI sin etiqueta se retengan con el localizador solo. Eso amplía el alcance y retiene más reseñas legítimas. **Recomiendo la primera opción** |
| **Evaluador** | Hoy mide detección por salida; CS exige leer los disparos y marcar los casos puros | Es un cambio del evaluador, que se implementa y prueba con datos ajenos **antes** de cualquier conjunto (como en el reservado 3). No se hace ahora |
| **Mapeo regla → familia** | Depende de cómo se nombren las reglas nuevas | Se fija y versiona junto con la implementación. Un cambio es una versión nueva |
| **Incorporación de referencias** | No están en el repositorio. Las huellas son declaradas, no verificadas por un segundo revisor | En la entrega de implementación: volver a descargar la versión fijada, recalcular la huella y que la verifique un segundo revisor. Unicode, con su aviso de licencia v3 |
| **Condición de uso de la lista de IANA** | La declaración CC0 citada cubre los "Protocol Registries" enlazados desde `/protocols`, y el archivo de TLD no está enlazado ahí (§1) | **Verificarla antes de incorporarla.** Si no se puede, F3-2 y F3-6 quedan con T-fuerte solo (§3.1), informado como reducción respecto de esta versión |
| **"su" en T1** | La lista T-fuerte vigente incluye `su`, que también es un posesivo del castellano. Cuenta incluso con espacios alrededor del punto | Mantenerla en T1 para no reducir la cobertura vigente, y medir el costo con los controles. Moverla a T2 reduce el alcance y requiere una decisión explícita |
