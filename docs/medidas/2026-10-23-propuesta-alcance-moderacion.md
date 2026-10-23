# Moderación de reseñas: diagnóstico del reservado 3 y propuesta de alcance

23/10/2026. Claude Code. Rama `feat/resenas-reglas`.

**Qué es este documento.** Análisis y propuesta, **pendientes de la
aprobación del dueño y de la auditoría de Codex**.
- No modifica código, reglas, criterios ni bancos.
- No autoriza parches, otro reservado ni E2.
- **E1 sigue sin aprobarse.**

**Fuentes.**
- Resultados guardados del reservado 3:
  `2026-10-23-e1-reservado-3-resultado.json`.
- Código congelado `2026-10-22.5`, leído para explicar cada fallo.
- No se volvió a ejecutar el reservado ni se calcularon porcentajes nuevos.
  Ninguna cifra de este documento estima la eficacia en uso real.

## 0. Qué está implementado y qué no

| Pieza | Estado |
|---|---|
| Módulo de reglas puro (`lib/comunidad/reglas/`), `2026-10-22.5` | **Implementado, sin conectar a nada.** No modera ninguna publicación real |
| Reservados 1, 2 y 3 | Ejecutados. Ninguno cumplió C1 y C2 |
| Límites por cuenta, admisión acotada a la cola de retenidos, denuncias, bloqueos, suspensiones, panel administrativo, interruptor de pausa (T4) | **Sólo diseñados** (revisión §3.3–§3.4, entregas E2 en adelante). **No existen.** No protegen nada hoy |
| Reseñas de usuarios publicadas | **No existen.** La publicación sigue cerrada |

## 1. Diagnóstico de cobertura

Las 60 diferencias con la etiqueta son 60 abusos sin detectar: 38 de la
parte general y 22 de la complementaria. No hubo falsos positivos ni errores.
Los clasifico en cuatro grupos.
- `R3-A-014` y `R3-A-016` aparecen en dos grupos, porque tienen una parte
  mecánica o una señal, y otra parte que exige instrucciones.
- Cuenta de la parte general:
  - 22 casos mecánicos (§1.1);
  - 13 casos de señales indirectas (§1.2): 7 de contacto, 2 de perfil, 3
    de spam, y `R3-A-016`, que también cuenta en §1.3;
  - `R3-A-015` (§1.3);
  - 2 de spam (§1.4). Dentro de cada
uno distingo **variante** (una familia que el filtro ya pretendía cubrir) de
**familia nueva** (una forma que ninguna versión prometió).

### 1.1 Formas mecánicas que el filtro pretendía cubrir: 22 casos

Son fallos **dentro** del alcance declarado. Ninguno exige interpretar.

| Caso | Forma | Por qué falló | Tipo |
|---|---|---|---|
| `R3-A-024` | Teléfono con separador `⁃` (U+2043) | `SEP` es una **lista finita** de signos, no una clase Unicode. E1.2 informó "separadores por clase de signo", y eso **no era exacto** | Variante |
| `R3-A-026` | Dígitos en emoji de tecla (`1️⃣`) | Queda la marca combinante U+20E3 entre dígitos: ni se quita ni se trata como separador | Variante (dígitos Unicode) |
| `R3-A-009` | Letras por dígitos con una `З` cirílica | La pasada de dígitos sólo convierte las letras latinas `o l i s z b g`; los confusables cirílicos pasan a letras en la otra pasada | Variante |
| `R3-A-023` | Palabras-número pegadas a dígitos (`ocho2cuatro5`) | Las palabras se reconocen sólo como palabras completas | Variante (dictado) |
| `R3-A-012`, `028` | Dictado en grupos con guiones o comas, con "escriban" o "mi número es" | La lectura con comas exige una señal **fuerte**. "escriban" y "número" no lo son | Variante (dictado + umbral de señal) |
| `R3-A-014` | Fecha `11/04/1988` cerca de "Llamame" y "Wsp" | `/` no es separador, así que la "fecha con señal fuerte" que E1.1 prometía no se vio. El número completo exige además una instrucción (ver 1.3) | Variante |
| `R3-A-022` | Dígitos dictados en inglés | Las palabras-número son sólo en castellano | **Familia nueva** (otro idioma) |
| `R3-A-064` | `dominio . photography / ruta`, con espacios | Con ruta no se aceptan espacios; sin ruta, la terminación larga no está en la lista | Variante |
| `R3-A-065` | Coma en lugar de punto (`,com/…`) | La coma no es separador de dominio | **Familia nueva** |
| `R3-A-066` | "dot … slash …" en palabras | "slash" no se convierte y la terminación "argentina" no está en la lista | Variante ("punto" escrito) |
| `R3-A-069` | Punto ideográfico `。` | NFKC no lo convierte en `.` | Variante (confusables) |
| `R3-A-071` | `-[punto]-` | El punto entre corchetes se resuelve, pero los guiones que lo rodean cortan el dominio | Variante |
| `R3-A-076` | **Discord** + "entren", "mándenme", "los agrego" + `usuario#1234` | **Discord ya está en la lista.** Falló porque ningún verbo de la lista está a 30 caracteres o menos y el formato `#1234` no es un usuario con `@`. Con "agregame" se rechaza (lo reprodujo Codex) | Variante (verbos en lista finita) |
| `R3-A-081`, `086`, `087` | Telegram, face y snap (**las tres en la lista**) con "búsquenme", "pásense", "mandan" o "mandá" | Mismo motivo: conjugaciones y verbos fuera de la lista. En `087`, además, el usuario va con letras separadas por puntos | Variante (verbos) |
| `R3-A-088` | `@ docu . sur . oficial` con espacios + "Sigan" (en lista) + "instagram" | El `@` separado no forma un usuario, y "Sigan" está a más de 30 caracteres de la red | Variante (ventana + separadores) |
| `R3-A-079`, `083`, `R3-NA-25` | "tt", "tele" y "sgme" | Alias y abreviaturas fuera de la lista. En `083`, además, "arroba usuario" no se convierte en `@usuario` | Variante (alias en lista finita) |
| `R3-A-047` | `nachito.cine`, "mi usuario de Gmail", "Pedime" | "usuario de gmail": el token anterior al proveedor es "usuario", no el alias. "Pedime" no es pista de correo | Variante (correo "en/de proveedor") |

**Causa común.** Casi todo el grupo falla por **listas cerradas de
instancias** donde hacía falta una **categoría**:
- signos enumerados en vez de clases Unicode;
- conjugaciones enumeradas en vez de raíces con sus terminaciones;
- alias enumerados;
- ventanas fijas de 30 a 40 caracteres.

Cada ronda agregó las instancias del conjunto anterior, y el conjunto
siguiente trajo otras de la misma familia. Ese es el ciclo que hay que
cortar (§3.3).

### 1.2 Señales indirectas que podrían justificar retener sin reconstruir el dato: 13 casos

El texto **no** trae el dato completo, pero se atribuye un medio de contacto y
pide que lo usen.

| Casos | Señal presente |
|---|---|
| `R3-A-016` | "mi cel es" + pedido ("Escribime"), y el número no está escrito |
| `R3-A-091`, `092`, `096`, `097` | "mi casilla / usuario de <proveedor o red>" o "un gmail con el mismo nombre que uso acá" + pedido. Sin alias escrito |
| `R3-A-094` | "tengo un canal en Telegram" + "búsquenlo y escriban" |
| `R3-A-098` | "pedime el número por privado" + mención de "grupo de wsp" |
| `R3-A-104` | Contacto partido: la reseña anterior dice "mi usuario empieza con lu.reacciona y lo termino en otra reseña" y la actual "termina con _ok" |
| `R3-A-107`, `108` | Derivación al perfil: "fíjense en mi nombre comunitario", "búsquenme con el nombre que ven en esta reseña" |
| `R3-A-111`, `120` | Venta en primera persona ("vendo …", "consultame por privado") |
| `R3-A-117` | "Sorteamos" + "seguí", "etiquetá": promoción y acción, pero a más de 60 caracteres |

Hoy la regla de correo indirecto exige un **alias escrito**, y la de perfil,
frases exactas. Una señal generalizada sería: **autoatribución de un medio
de contacto** (mi correo, casilla, usuario, cel, número, canal o grupo,
seguido de un proveedor o red) **más una intención de contacto en
cualquier conjugación**. Eso retendría casi todo este grupo sin reconstruir
nada.

### 1.3 Abuso que exige interpretar instrucciones o contexto: 3 casos + 8 de fuera de capacidad

- **Instrucciones aritméticas o de armado:** `R3-A-014` (fecha "y le sumás 52
  al final"), `R3-A-015` (un importe "sin el signo ni los puntos", con "wsp" a
  unos 70 caracteres) y `R3-A-016` (11 seguido de dos años mencionados antes).
  - Ninguna regla determinística puede **armar** el número.
  - Lo que sí puede ver es una señal de 1.1 o de 1.2: la fecha con "Llamame",
    o "mi cel es" con un pedido. Con eso se retiene sin reconstruir.
  - `014` y `016` cuentan también arriba; los tres quedan bajo la etiqueta
    sellada `claro`, y no los reclasifico.
- **`fuera_capacidad`, 0 de 8** (parte complementaria, informativo):
  - acoso sin insultos;
  - amenaza velada ("sé a qué hora sacás al perro");
  - odio irónico;
  - estafas contadas sin datos;
  - **"me pidieron los datos de la tarjeta"**, que es phishing.

  El producto declara que esto depende de las denuncias, y el resultado lo
  confirma. Con reglas no se cubre.

### 1.4 Cobertura insuficiente de amenazas, odio, spam y datos personales

Las tres primeras categorías de la tabla son de la parte complementaria, no
independiente. Aun así, el diagnóstico se apoya en el código y no en el
número.

| Categoría | Frenados | Cómo funciona hoy | Qué faltó |
|---|---|---|---|
| Odio | 3/12 | Sólo tres formas: "<grupo> de mierda", "hay que <echar/matar…> a los <grupo>" en ese orden exacto, o un insulto de una lista de 10 | Grupo + deshumanización ("son una plaga", "una enfermedad", "no son personas"), expulsión en otro orden ("habría que sacarlos"), argot ("bolitas", "paraguas") y misoginia (ningún grupo de género en la lista). Los nombres pegados ("FueraBolitas") no se separan |
| Amenaza | 4/8 | Frases fijas en segunda persona ("te voy a matar") | Otros pronombres ("lo voy a…", "le voy a…") y otros actos violentos ("pegar un tiro", "prender fuego", "degollar"). "Merecen que los maten" no está |
| Datos personales | 7/8 | DNI o CUIT con la palabra delante; domicilio con "vive en" o "su dirección es" | Domicilio sin esas frases ("lo encuentran en <calle> 515") |
| Spam | 7/12 (general) | Promoción + acción a 60 caracteres o menos, cripto y frases fijas | Venta directa en primera persona ("vendo"; `R3-A-115`, y `111` y `120` en §1.2), "token" en singular (`R3-A-119`) y promoción y acción lejos entre sí (`117`, en §1.2) |

**Lo que no se puede prometer acá:** distinguir el odio o la amenaza de una
reseña que **describe** una trama racista o violenta exige interpretar. Las
reglas pueden ampliar la señal (grupo + deshumanización, pronombre + verbo
violento) y **retener**, con el costo de retener tramas legítimas. No pueden
decidir el sentido.

## 2. Recomendación principal (pendiente de aprobación)

### 2.1 Qué es el filtro

**Una barrera mecánica y un detector de señales, no un moderador.**

- **Rechaza** lo que es un contacto o enlace **sin interpretar nada**, en un
  catálogo cerrado y declarado de formas (§3.1).
- **Retiene** cuando hay **señales combinadas de intención**, aunque no
  encuentre el dato (§1.2).
- **Publica** el resto. **Deja pasar** lo de §1.3 y todo lo que no deja
  señal; eso queda para las denuncias.

**Qué puede aportar razonablemente:**
- frena el contacto o enlace escrito "de manera normal" y las ofuscaciones
  mecánicas comunes;
- encarece el intento: quien quiera colar un contacto tiene que redactar
  instrucciones o paráfrasis, y la mayoría de esas deja alguna señal
  retenible;
- no exige leer todo: sólo lo retenido y lo denunciado.

No es una cifra de eficacia: no hay uso real medido.

**Qué deja pasar y por qué:**
- instrucciones sin señal ("sumale 52 a la fecha que dije");
- paráfrasis nuevas;
- amenazas veladas, ironía, acoso sin términos, estafas narradas, phishing
  sin datos;
- todo dato repartido entre más de tres reseñas o en más de 24 horas.

El motivo es el mismo en todos los casos: **entenderlos exige interpretar**,
y el producto descartó pagar un clasificador.

### 2.2 Cambios de enfoque que propondría en una entrega futura (no autorizados)

Para cortar el ciclo de instancias:
1. **Categorías en vez de listas.**
   - Separadores: cualquier `\p{P}`, `\p{S}`, `\p{Z}` o marca combinante
     entre dígitos (incluye emojis de tecla).
   - Dígitos: los de cualquier script, más palabras-número en castellano e
     inglés (un conjunto cerrado de 0 a 9 por idioma, no ejemplos).
   - Confusables de dígito: los mismos de la pasada de letras.
   - Punto de dominio: cualquier signo con forma de punto (`。 ．` y la coma
     sólo seguida de un TLD y ruta), además de "dot" y "slash".
2. **Morfología en vez de conjugaciones sueltas.** Raíces de contacto
   (`escrib`, `mand`, `agreg`, `busc`, `segu`, `contact`, `habl`, `pas`,
   `entr`, `sum`) con clíticos y desinencias de imperativo
   (`-me`, `-nos`, `-en`, `-enme`, `-ate`).
   - **Riesgo:** "busca", "pasa" y "sigue" son narración frecuente. Por eso
     esta señal, sola, sólo **retiene**, nunca rechaza.
3. **Señal indirecta general (§1.2):** autoatribución de un medio de contacto
   más intención, para retener.
4. **Odio y amenazas por señales:**
   - grupo + vocabulario de deshumanización o expulsión en cualquier orden;
   - pronombre + "voy a" + verbo violento;
   - en todos los casos **retención**, nunca rechazo.
5. **Ventanas medidas en palabras dentro de la misma oración,** no en
   caracteres fijos.

**Costo esperado:** más retenciones de reseñas legítimas (tramas, narración,
diálogos). Se mide contra las legítimas conocidas como **regresión**, no como
validación. Si superan el C4 vigente (≤ 5 %), el cambio no entra. No se sube
el umbral.

### 2.3 Combinación con las defensas diseñadas (todas sin implementar)

| Capa (revisión) | Qué cubre que el filtro no |
|---|---|
| Límites por cuenta (§3.4) | Probar variantes de a muchas; acotar el volumen de un atacante |
| Admisión acotada a la cola de retenidos: 2 por autor y N global (§3.3) | Que el filtro, al retener más, no genere una cola infinita |
| Denuncias con prioridad por gravedad (§3.3.2) | Todo §1.3: amenazas veladas, acoso, phishing narrado |
| Bloqueos personales (§3.3.4) | Protección inmediata de quien denuncia, sin esperar al admin |
| Suspensiones y panel administrativo (diseño §3.5) | Cortar una cuenta abusiva después de una decisión humana |
| Interruptor de pausa manual T4 | Ataque masivo: el dueño pausa la publicación |
| Contacto partido: concatenación de las últimas 3 versiones en 24 h (§3.4) | Parcial; ya está en el módulo |

**Condición propuesta, pendiente de aprobación:** la publicación de reseñas
no se habilita hasta que existan, como mínimo, denuncias, bloqueos, la cola de
retenidos con admisión acotada, el panel y el interruptor T4. El filtro solo
no alcanza para publicar. Coincide con el orden de entregas del plan, pero
conviene dejarlo explícito como condición de salida.

### 2.4 Trabajo humano y capacidad

- **Lo único que se lee:** las colas de **retenidos** y de **denuncias**. **No**
  se propone leer lo publicado ni hacer muestreos: la propuesta de muestreo
  (P6) ya fue rechazada por el dueño y no se reintroduce.
- **Cuánto trabajo:** desconocido sin uso real. Lo determinan la tasa de
  retención sobre texto legítimo (hoy, en los conjuntos sintéticos, 1/207 en
  desarrollo y 0/160 en el reservado 3, sin las señales nuevas) y el volumen
  de abuso.
- **Si la cola supera la capacidad, se aplica lo diseñado en §3.3:**
  - un envío que **sería retenido** no se admite: no se guarda y el autor ve
    "probá más tarde";
  - lo que **pasa todas las reglas se sigue publicando**;
  - denunciar, bloquear y borrar siguen disponibles.

  El costo es que, durante un ataque, una reseña legítima que dispare una
  retención tampoco entra. **El tope global N depende de cuánto quiera revisar
  el dueño**, y eso no lo fijo yo (decisión D4).

## 3. Criterios y estrategia de validación (para Codex)

El reservado 3 **queda como fallido**: no se excluyen casos ni se bajan
umbrales. Lo que sigue es una propuesta para la **próxima** aceptación.

### 3.1 Cambio propuesto en la aceptación

| | Vigente | Propuesto |
|---|---|---|
| **C1** | 0 contactos o enlaces "claros" sin detectar. "Claro" incluye lo que se reconstruye siguiendo instrucciones del texto | **C1a:** 0 sin detectar entre las formas del **catálogo declarado** (formas mecánicas, §2.2.1). **C1b:** los contactos que exigen instrucciones o referencias, medidos e informados **sin umbral** de rechazo, pero con la meta de que se frenen por señal (retención) |
| **C2** | ≥ 95 % de las ofuscadas (cualquier ofuscación que el autor escriba) | **C2a:** ≥ 95 % sobre el catálogo, medido con un **generador sistemático**, además del conjunto independiente. **C2b:** la detección total del conjunto independiente se informa sin umbral |
| **C3 / C4** | ≤ 2 % rechazadas / ≤ 5 % retenidas | **Sin cambios** |
| Sensibles | Sin umbral (informativo) | Sin umbral. Se agrega la obligación de listar cada caso sin detectar en el dictamen. Fijar un umbral es decisión del dueño (D6), no mía |

**Justificación.** Con la definición vigente, "claro" abarca contactos que
sólo se arman siguiendo instrucciones en lenguaje natural. Ese espacio no
tiene fin, y ningún conjunto de reglas determinísticas llega a cero en él:
cada reservado nuevo trae otra redacción. El criterio vigente mezcla lo que el
filtro **puede** prometer (formas mecánicas) con lo que **no** puede
(interpretar).

**Qué protección o evidencia se pierde:**
- deja de exigirse que el filtro frene los contactos "por instrucciones".
  Pasan a depender de la señal de retención y de las denuncias;
- un aprobado futuro **no** dirá "ningún contacto claro pasa": dirá "ninguna
  forma del catálogo pasa";
- el catálogo lo escribe quien diseña el filtro, así que puede quedar corto.
  Por eso el conjunto independiente sigue existiendo y su detección total se
  informa;
- cualquier uso de "cumple" sobre el catálogo sin mostrar C1b y C2b sería
  engañoso. Los informes tienen que llevar los dos.

**Cómo se comprobaría:**
1. **Catálogo** de formas mecánicas, escrito y aprobado **antes** de tocar
   código: familia, transformaciones, controles legítimos parecidos.
2. **Generador sistemático**, determinista y versionado: cada familia del
   catálogo × cada separador de la clase × cada forma de dígito × confusables
   × con y sin ruta o espacios, y los controles legítimos de cada
   transformación. **No son ejemplos redactados**: es una cobertura
   combinatoria de lo prometido. Un fallo ahí es un bug del mecanismo, no
   "otra familia".
3. **Un conjunto independiente final**, con el mismo procedimiento del
   reservado 3. Su autor recibe el catálogo y etiqueta cada caso como
   **dentro** o **fuera** del catálogo **antes** de sellar. C1a y C2a se miden
   sobre los de adentro; C1b y C2b, sobre todo.

### 3.2 Por qué esto corta el ciclo

El ciclo actual es "un conjunto nuevo encuentra instancias nuevas → se
agregan esas instancias → otro conjunto". Se corta así:
- **Prohibido** agregar instancias tomadas de casos divulgados. Sólo se
  cambian **mecanismos de familia** (§2.2), y cada cambio tiene que cubrir la
  familia entera en el generador.
- **Regla de detención fijada de antemano** (D5):
  - hay **una** ronda de corrección por mecanismo y **un** conjunto
    independiente final;
  - si ese conjunto falla **dentro del catálogo**, se corrige ese mecanismo
    una vez y se verifica sólo con el generador y la regresión, sin otro
    reservado;
  - si falla **fuera del catálogo**, se informa y no se corrige.

  Después, el dueño decide entre lanzar con las brechas documentadas y las
  capas de §2.3, o reducir el alcance. No hay un reservado 5 automático.
- **La evidencia de operación sustituye a la sintética después del
  lanzamiento.** Los retenidos y las denuncias muestran qué pasa en uso real,
  sin leer todo. Es lo que exige la política de Play: moderación evaluada por
  cómo funciona.

## 4. Decisiones que necesito del dueño

| # | Decisión | Opciones |
|---|---|---|
| **D1** | El rol del filtro: barrera mecánica y señales, y **no** moderador semántico (§2.1) | Aprobar / rechazar |
| **D2** | El cambio de aceptación de §3.1 (C1a/b, C2a/b), para que lo audite Codex | Aprobar para auditoría / mantener el criterio vigente. Mantenerlo implica nuevas rondas sin cierre previsible |
| **D3** | Más retención de reseñas legítimas a cambio de señales más amplias, siempre dentro de C4 ≤ 5 % | Aceptar / no aceptar |
| **D4** | Capacidad de revisión: cuántos retenidos y denuncias por semana estás dispuesto a mirar, para fijar el tope global N. **No te propongo una cifra** | Una cifra, o "decidir con uso real", con un N bajo inicial que vos elijas |
| **D5** | La regla de detención de §3.2 | Aprobar / otra |
| **D6** | Odio, amenazas y datos personales: informativos (como hoy) o con un umbral que fijes **antes** de la próxima medición | Informativo / umbral |
| **D7** | No habilitar la publicación hasta que existan denuncias, bloqueos, la cola con admisión acotada, el panel y T4 (§2.3) | Aprobar / rechazar |

**No se proponen** ni requieren decisión, porque contradicen restricciones
vigentes:
- servicios pagos o APIs gratuitas como reemplazo;
- leer cada reseña o muestrear publicaciones;
- reemplazar las reseñas escritas por valoraciones o respuestas
  predeterminadas.

Si el dueño quisiera reducir el alcance por esa vía, sería una decisión nueva
y explícita suya, no parte de esta propuesta.
