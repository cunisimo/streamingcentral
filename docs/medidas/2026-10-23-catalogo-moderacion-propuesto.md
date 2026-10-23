# Catálogo de cobertura propuesto para la moderación de reseñas

23/10/2026. Claude Code. **Propuesta técnica pendiente de auditoría de Codex
y de aprobación del dueño.**
- No está implementada.
- No se aplica al reservado 3, que sigue fallido.
- Acompaña a `2026-10-23-propuesta-alcance-moderacion.md` (v2).

## 0. Reglas del catálogo

- **El catálogo dice qué se promete, no qué se detecta hoy.** Incluye todo
  lo mecánico que E1–E1.2 ya prometían y que falló en los reservados. Cada
  exclusión está en la lista cerrada de §7, con su justificación.
- **Un caso queda "fuera" del catálogo sólo si cita una exclusión de §7.**
  - La clasificación la hace el autor del conjunto antes de sellar.
  - Codex la revisa antes de ejecutar, sin conocer los resultados.
  - Un caso que no encaja en ninguna exclusión cuenta como **dentro**.
  - Ningún caso se mueve de categoría después de medir.
- **Ámbito de "cerca".** Salvo que se diga otra cosa, las señales combinadas
  se buscan **dentro de la misma oración o de la oración contigua**, y como
  máximo a 25 palabras. Las ventanas en caracteres actuales (30, 40, 60) se
  reemplazan. Los límites son hipótesis técnicas y se pueden revisar antes de
  congelar.
- **Salidas:**
  - **rechazar:** contacto o enlace completo;
  - **retener:** señal o contenido sensible explícito;
  - **publicar:** controles legítimos.
- **Datos de referencia Unicode.** Las clases de §1 se definen con categorías
  Unicode y con datos públicos del estándar, copiados al repositorio con su
  versión: categorías generales y tabla de confusables de UTS #39. No se usa
  ningún servicio ni API. Elegir la versión es una decisión técnica.

## 1. Clases de transformación (compartidas)

| Clase | Definición verificable | Límite |
|---|---|---|
| **D. Formas de dígito** | D1 ASCII · D2 todo `\p{Nd}` (todos los scripts) · D3 ancho completo y matemáticos (por NFKC) · D4 superíndices y subíndices `⁰–⁹ ₀–₉` · D5 circulados `⓪ ①–⑨` · D6 secuencia de tecla (dígito + U+FE0F opcional + U+20E3) · D7 palabras-número en castellano 0–99 · D8 palabras-número en inglés 0–9 y "oh" por cero · D9 letras que imitan dígitos, sólo dentro de una corrida que ya tiene dígitos: los confusables de dígito de UTS #39 (incluye `З`, `О`, `l`, `I`, `O`) | D7 y D8 son conjuntos cerrados. D9 no aplica a palabras sin dígitos |
| **S. Separadores entre grupos de dígitos** | Hasta 3 caracteres por hueco de: `\p{Zs}`, `\p{Pd}`, `\p{Po}` (salvo `,` `;` `:`, que están en S2), `\p{Ps}`, `\p{Pe}`, `\p{Sm}`, `\p{Mn}`, `\p{Me}`, U+FE0F, `/` | S2: `,` `;` `:` cuentan **sólo** con una señal de contacto (§2) |
| **P. Formas del punto de dominio** | `.` · `。` `．` `｡` · "punto", "dot" (también `[ ]` y `( )`) · hasta 1 espacio a cada lado · guiones pegados alrededor de una forma con corchetes (`-[punto]-`) · `,` **sólo** seguida de un TLD de la lista IANA y de una ruta | La coma sin TLD ni ruta nunca es punto |
| **B. Formas de la barra** | `/` · "slash", "barra" · hasta 1 espacio a cada lado | |
| **T. Terminaciones** | **Lista IANA de TLD**, copiada con su versión, en lugar de la lista corta actual. Los TLD que son palabras comunes del castellano (`la`, `es`, `me`, `de`, `casa`, `hoy`…, en una lista cerrada) cuentan **sólo** pegados y con ruta | Un TLD que no está en IANA cuenta sólo con ruta, como hoy |
| **C. Confusables de letra** | Tabla UTS #39 para mapear a latín (no sólo cirílico y griego); los dígitos ambiguos siguen como clases | |
| **I. Intención de contacto** | Lista **morfológica cerrada**: raíces `escrib-`, `mand-`, `agreg-`, `busc-`, `segu-`/`sig-`, `contact-`, `habl-`, `llam-`, `sum-`, `pas-`, `entr-`, `agend-`, `ped-`/`pid-`. **Sólo** con desinencias de imperativo o clítico de primera persona: `-me`, `-nos`, `-enme`, `-anme`, `-ate`, `-ense`, imperativo plural (`-en`, `-an`) y voseo con tilde (`-á`, `-é`, `-í`). Además, "por privado", "al privado", "por dm", "md" | **No** son intención: la tercera persona ni el infinitivo ("busca", "pasa", "sigue", "entra", "escribe", "buscar"), ni el presente de indicativo |
| **M. Medios de contacto** | Plataformas (lista cerrada con alias: instagram, insta, ig, tiktok, tik tok, tt, telegram, tg, tele, whatsapp, wsp, wpp, wa, guasap, discord, dc, snapchat, snap, facebook, face, fb, twitter, x (sólo junto a "usuario" o "@"), twitch, kick, threads, signal, onlyfans) · proveedores de correo (gmail, hotmail, outlook, yahoo, live, icloud, proton) · palabras de medio (cel, celu, celular, número, teléfono, wsp, correo, mail, casilla, usuario, cuenta, canal, grupo, perfil, nick, apodo) | Una lista cerrada, revisable por versión |
| **A. Alias con forma de usuario** | La definición actual (`esAliasFuerte`): letras y al menos un dígito, `_` o `.` · además `alias#dddd` · `@` seguido de hasta 1 espacio · letras sueltas separadas por un mismo signo (`l.u.n.a`) | |

## 2. Familias de contacto y enlace: se **rechazan**

| Familia | Forma | Combinaciones incluidas | Controles legítimos (publicar) |
|---|---|---|---|
| **F1 Teléfono** | 8 a 13 dígitos en grupos de 1 a 4, con `+54`/`9` opcionales | D1–D9 × S en cualquier hueco. S2 con I o M. Número con forma de año, fecha o importe (incluso con `/`, `$` o separador de miles) con I o M en el ámbito | Años sueltos y en pares, duraciones, temporadas y episodios ("T3E8"), puntajes con barra, rankings, importes de recaudación, fechas, ISBN o códigos de catálogo sin I ni M, títulos con dígitos, emojis de tecla usados como puntaje ("5️⃣ estrellas") |
| **F2 Correo** | `usuario@dominio`, `usuario@proveedor` | "arroba", "at" y `(at)` × P × letras espaciadas × C. "usuario en/de/del <proveedor>". "<alias A>, mi usuario/mail/casilla de <proveedor>" en el ámbito | "el mail de su jefe en gmail", "le escribe un correo", proveedores mencionados en una escena |
| **F3 Enlace** | Esquema; `etiqueta(.etiqueta)*` + P + T, con o sin B + ruta; acortadores (lista cerrada) | P × B × C × T. Etiquetas con guiones | "las punto com", "y/o", "8.5/10", "2.0/beta", "drama/comedia", puntos sin espacio entre palabras sin TLD de IANA |
| **F4 Usuario de red** | (A o "usuario/user/nick/soy/como/el usuario es" + alias) **y** (M plataforma o I), en el ámbito | Comillas y atribución: **rechaza si hay alias** (destinatario), como hoy. Sin alias, va a S1 | "la sigue en Instagram", "busca a su hermana en TikTok", "su cuenta de Twitter es tema de la trama" (sin alias) |

## 3. Señales indirectas: se **retienen** (nunca rechazan)

**Ninguna se dispara con un solo indicio.** Un verbo, una plataforma, un
proveedor o una palabra de medio, solos, publican.

| Señal | Condición combinada (en el ámbito) | Controles narrativos (publicar) |
|---|---|---|
| **S1 Autoatribución + intención** | "mi/nuestro" + M (medio) **y** I | "mi celular se quedó sin batería en la peli", "mi Instagram está lleno de spoilers" (sin I), "su número" (tercera persona) |
| **S2 Medio sin dato + pedido** | I + "por privado/dm" o I + M sin alias ("pedime el número por privado") | "le pide el número por privado" (tercera persona, no es I) |
| **S3 Derivación al perfil** | I + "mi nombre/apodo/perfil/usuario" + ("de acá", "que ven", "comunitario", "en todas las redes", "mismo") | "el nombre del personaje es…", "su apodo en la serie" |
| **S4 Contacto partido** | Las últimas 3 versiones o reseñas de la cuenta en 24 h (límite elegido del diseño). Hay un dato incompleto en una y su continuación en otra: corridas de dígitos que suman una forma F1, o un colgante de F2 o F4 con marcador ("en otra reseña", "lo termino", "empieza con", "termina con") | Reseñas sucesivas con años, temporadas o episodios |
| **S5 Venta o promoción** | "vendo/vendemos/liquido/sorteamos/sorteo" + (precio, envío, stock, cuotas, "consultas", I) en el ámbito | "el protagonista vende…", "el sorteo del pueblo en la trama" |

## 4. Contenido sensible explícito: se **retiene**

Sólo **formas explícitas**: lo velado, irónico o contextual está en §7.

| Familia | Condición | Controles narrativos (publicar) |
|---|---|---|
| **H1 Amenaza explícita** | Primera persona + futuro, perífrasis o deseo (`voy a`, `vamos a`, `te/lo/la/le/los/les + voy a`, `ojalá`, `merecés/merecen`) + verbo o expresión de daño de una lista cerrada (matar, reventar, romper la cara, cagar a palos, pegar un tiro, prender fuego, degollar, apuñalar, violar, lastimar, "que te maten") **y** un destinatario en segunda persona o alguien identificable de la plataforma (vos, "el de la reseña", "al que…", "a ese actor"). También: "sé dónde vivís/trabajás", "te voy a buscar/encontrar" | "el villano le dice que lo va a matar", "en la peli amenaza con prender fuego la casa" (tercera persona narrativa), "me mató de risa" |
| **H2 Odio explícito** | Un término de grupo de una lista cerrada (nacionalidad, etnia, religión, orientación, identidad de género, discapacidad, sexo; con argot y plurales) **y**, en el ámbito, deshumanización o exclusión de una lista cerrada (plaga, basura, enfermedad, lacra, no son personas, que se vayan/vuelvan, sacarlos/echarlos/exterminarlos en cualquier orden, "de mierda"). También insultos de odio que retienen solos (lista cerrada). Los nombres comunitarios se separan antes por mayúsculas internas ("FueraBolitas") | "la película retrata el racismo contra los bolivianos", "un personaje dice que los inmigrantes son una plaga, y la peli lo desarma" (**se espera retenerlo**: es una cita explícita, y el costo cuenta en C4) |
| **H3 Datos personales** | DNI o CUIT con o sin etiqueta (7–8 dígitos con forma `dd.ddd.ddd` cerca de un nombre propio, o con "dni/documento/cuit"); domicilio = tipo de vía (calle, av., pasaje, diagonal, ruta…) + nombre + número, **y** una persona identificable (nombre propio o "mi vecina", "el acomodador") en el ámbito | Direcciones de la ficción ("vive en la calle Elm 1428"), números de expediente en tramas |

## 5. Qué enumera y qué muestrea el generador

El generador es determinista, versionado y con semilla fija. **No promete
cobertura semántica**: cubre las transformaciones declaradas y nada más.

- **Enumeración completa, porque las clases son chicas y finitas:**
  - D2 por bloque: un dígito de cada bloque `\p{Nd}` de la versión de Unicode
    elegida, más los 10 dígitos del bloque en una corrida completa;
  - D4–D8 y la tabla D9 completas;
  - S: todo `\p{Zs}` y `\p{Pd}` más los signos nombrados;
  - P y B: todas las formas;
  - I: todas las combinaciones de raíz y desinencia;
  - M y alias: todas las entradas;
  - las listas de H1–H3.
- **Muestreo, porque las clases son grandes:**
  - `\p{Po}`, `\p{Sm}`, `\p{So}` y `\p{Mn}` como separadores: 64 por clase,
    con semilla fija;
  - TLD de IANA: todos los de 2–3 letras y 100 más largos, con semilla;
  - confusables de letra de UTS #39: 200, con semilla.

  Un acierto en la muestra **no** prueba la clase entera, y el informe lo
  dice.
- **Combinaciones:**
  - cada dimensión de una familia se recorre **completa** con las demás en su
    forma base;
  - después, **todos los pares** de dimensiones (pairwise) con
    representantes;
  - el producto cartesiano completo **no** se genera: es demasiado grande y
    no agrega clases nuevas.
- **Controles:** cada transformación lleva al menos un control legítimo
  generado con la **misma** transformación (por ejemplo, el mismo separador
  entre años). Los controles narrativos de §3 y §4 son **plantillas
  redactadas**, y el informe las marca así.
- **Requisito:** 100 % de la salida esperada en lo generado, porque lo
  generado **es** la promesa. Un fallo es un defecto del mecanismo, no
  "otra familia".

## 6. Cómo se usó cada fallo conocido para armar el catálogo

| Fallo (reservado 3) | Queda en |
|---|---|
| `⁃`, emoji de tecla, `З` como dígito, palabras pegadas a dígitos, inglés | F1 con S, D6, D9, D7 y D8 |
| Dictado en grupos con "escriban" o "mi número es" | F1 con S2 + I/M (I incluye "escriban") |
| Fecha `11/04/1988` cerca de "Llamame" | F1 (la fecha con I) |
| Espacios alrededor del punto con terminación larga, coma por punto, "dot"/"slash", `。`, `-[punto]-` | F3 con P, B y T |
| Discord + "mándenme" + `alias#4821`; "búsquenme"; "pásense"; "mandá"; `@ ` con espacio; "tt", "tele", "sgme" | F4 con I, A y M. "sgme" es abreviatura **fuera** (§7, E6), salvo que lleve otro indicador |
| "nachito.cine, mi usuario de Gmail" | F2 |
| "mi casilla de Hotmail es la de siempre…", "pedime el número por privado", "mi usuario de TikTok es el mismo apodo…", "canal en Telegram… búsquenlo" | S1 y S2 |
| "fíjense en mi nombre comunitario" | S3 |
| Usuario partido con "empieza con" / "termina con" | S4 |
| "Vendo cuentas…", "Sorteamos… seguí, etiquetá" | S5 |
| "te voy a pegar un tiro", "lo voy a ir a buscar…", "le voy a reventar…" | H1 |
| Grupo + "plaga", "enfermedad", "habría que sacarlos"; argot de nacionalidad; nombres pegados | H2 |
| Domicilio sin "vive en" | H3 |

## 7. Exclusiones (lista cerrada; cada caso "fuera" cita una)

| # | Exclusión | Por qué (límite elegido, no imposibilidad) |
|---|---|---|
| **E1** | Instrucciones aritméticas o de armado ("sumale 52", "11 seguido de esos dos años") | Se podría implementar una gramática acotada de instrucciones, pero cada forma nueva de redactarlas vuelve a abrir el ciclo. Si el texto trae una señal S1 o S2, se retiene igual |
| **E2** | Referencias a datos fuera del texto y del historial S4 ("el mismo que uso en el colegio") | No hay de dónde sacar el dato. Si hay S1 o S3, se retiene |
| **E3** | Medios, dominios o redes descriptos sólo en palabras ("la app del pajarito", "el sitio de la luna") | Exige interpretar descripciones abiertas |
| **E4** | Palabras-número en idiomas distintos del castellano y del inglés | Límite elegido; ampliable por versión |
| **E5** | Dato repartido en más de 3 textos o en más de 24 h | Es un **límite del historial elegido** (S4), no de interpretación. Ampliarlo cuesta lecturas de la base por envío |
| **E6** | Abreviaturas libres de verbos o redes fuera de las listas I y M ("sgme") | Las listas son cerradas por versión |
| **E7** | Amenazas veladas, condicionales sin daño explícito, acoso sin términos, ironía, odio en código o indirecto, difamación, estafas narradas sin datos y phishing narrado | Exige interpretar intención y contexto. Queda para las denuncias |
| **E8** | Contenido sexual con menores sin las palabras de la regla actual | Fuera de los conjuntos por protocolo; queda para las denuncias |
