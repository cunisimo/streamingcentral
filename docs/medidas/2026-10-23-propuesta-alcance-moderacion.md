# Moderación de reseñas: diagnóstico del reservado 3 y propuesta de alcance (v2.1)

23/10/2026. Claude Code. Rama `feat/resenas-reglas`. **Versión 2.1.**
- La v2 corrigió la auditoría de `4ef9a51`.
- La v2.1 concilia la auditoría de `2bc6c1c`
  (`2026-10-23-auditoria-alcance-v2-2bc6c1c.md`): CS por familia, dos rutas
  de autoría, prioridad y casos mixtos, P-1 y el catálogo.
- Se conservan el procedimiento por versión y la operación de las colas.
- Las versiones anteriores quedan en Git.

**Qué es este documento.**
- Sólo análisis y propuesta, pendientes de la auditoría de Codex y de las
  decisiones del dueño (§6.2).
- No modifica código, reglas, criterios vigentes ni bancos. No autoriza
  parches, casos, mediciones ni E2.
- **E1 sigue sin aprobarse. El reservado 3 sigue fallido.** Nada de esto se
  le aplica retroactivamente.

El catálogo técnico está en `2026-10-23-catalogo-moderacion-propuesto.md`.
Es un **borrador**: no se puede aprobar hasta fijar sus listas y versiones
(catálogo §8). Las copias de Unicode, UTS #39 e IANA **no están incorporadas
ni verificadas**.

## 0. Estado: implementado, diseñado y no verificado

| Pieza | Estado |
|---|---|
| Módulo de reglas puro `lib/comunidad/reglas/`, versión `2026-10-22.5` | **Implementado en la rama, sin conectar** a rutas, pantallas ni base. No modera nada |
| Reservados 1, 2 y 3 | Ejecutados. Ninguno cumplió C1 y C2 |
| Límites por cuenta, admisión acotada de retenidos, denuncias, bloqueos, suspensiones, panel, pausa manual T4 | **Sólo diseñados** (revisión §3.3–§3.4; entregas E2 en adelante). **No existen** |
| Tabla heredada `user_reviews` (`supabase/schema.sql:285-300`, política de lectura de `aprobada`) | Existe en el esquema. **Su contenido en Producción no está verificado**: E0 no está autorizada y esta entrega no la consulta |

## 1. Diagnóstico de los fallos del reservado 3

Las 60 diferencias con la etiqueta son 60 abusos sin detectar: 38 de la
parte general y 22 de la complementaria. No hubo falsos positivos ni
errores.

- **Cuenta de la parte general:** 22 mecánicos, 13 señales indirectas,
  `R3-A-015` por instrucciones y 2 de spam.
- **Superposiciones:** `R3-A-014` y `R3-A-016` tienen también una parte que
  depende de instrucciones, pero se cuentan una sola vez.

### 1.1 Formas mecánicas que el filtro ya prometía cubrir: 22 casos

**Causa común:** listas cerradas de **instancias** donde hacía falta una
**clase**.
- Los separadores son una lista finita. E1.2 informó "por clase de signo",
  y **no era exacto**.
- Los verbos y conjugaciones están enumerados.
- Los alias están enumerados.
- Las ventanas son fijas, de 30 a 40 caracteres.

**Variantes de familias existentes (20):**
- **Teléfono:** `⁃`, dígitos en emoji de tecla, `З` cirílica como dígito,
  palabras pegadas a dígitos, dictado en grupos con "escriban" o "mi número
  es", y una fecha con `/` cerca de "Llamame".
- **Enlace:** espacios alrededor del punto con terminación larga,
  "dot"/"slash", `。` y `-[punto]-`.
- **Redes:** Discord, Telegram, face y snap, **que ya estaban en la lista**.
  Fallaron por verbos fuera de la lista ("mándenme", "búsquenme", "pásense",
  "mandá"), por el formato `alias#1234` o por `@` seguido de un espacio.
  También "tt", "tele" y "sgme".
- **Correo:** "nachito.cine, mi usuario de Gmail".

**Familias nuevas (2):** dígitos dictados en inglés y una coma en lugar del
punto.

El detalle caso por caso es el de la v1. Su ubicación en el catálogo
propuesto está en la §6 del catálogo.

### 1.2 Señales indirectas: 13 casos

Ninguno tiene el dato completo escrito, pero todos cumplen alguna de estas
formas:
- **autoatribución de un medio + pedido:** "mi casilla de Hotmail es la de
  siempre… mandame un mail", "mi usuario de TikTok es el mismo apodo…";
- **pedido por privado:** "pedime el número por privado";
- **derivación al perfil:** "fíjense en mi nombre comunitario";
- **usuario partido** con "empieza con / termina con";
- **venta en primera persona:** "vendo…".

### 1.3 Abuso que el alcance elegido no interpreta

- **`R3-A-014`, `015` y `016`** (fecha + "sumale 52", importe "sin los
  puntos", "11 seguido de esos dos años").
  - **El módulo actual no interpreta instrucciones.** Implementar una
    gramática acotada de instrucciones es posible, pero **propongo
    excluirla** (catálogo §7, E1), porque cada redacción nueva reabre el
    ciclo.
  - Con el catálogo, `014` se rechazaría por F1 (la fecha cerca de "Llamame"
    y "Wsp") y `016` se retendría por S1 ("mi cel es" + "Escribime").
  - `015` no tiene intención en imperativo ("si querés comentarla"), así que
    quedaría **fuera** (E1) y dependería de las denuncias.
- **`fuera_capacidad`, 0 de 8:** amenaza velada, acoso sin términos, ironía,
  estafa narrada y phishing narrado. Exigen interpretar intención. El alcance
  elegido los deja a las denuncias (catálogo §7, E7).
- **Lo que ya no digo como en la v1:**
  - No digo que "ninguna regla determinística puede" hacerlo: es un límite
    del módulo y del alcance que propongo.
  - No digo que el dato repartido en más de 3 textos "exija interpretar": es
    el límite de historial que eligió el diseño (catálogo §7, E5).

### 1.4 Formas sensibles explícitas que se publicaron

La parte complementaria no es independiente. El diagnóstico se apoya en la
estructura de las reglas, no en los porcentajes.

| Categoría | Frenados | Qué faltó (explícito, no contextual) |
|---|---|---|
| Amenaza | 4 de 8 | Otros pronombres ("lo/le voy a…"), otros actos de daño ("pegar un tiro", "prender fuego"), "merecen que los maten" |
| Odio | 3 de 12 | Grupo + deshumanización ("plaga", "enfermedad"), expulsión en otro orden, argot, misoginia y nombres pegados |
| Datos personales | 7 de 8 | Domicilio sin "vive en" |
| Spam (parte general) | 7 de 12 | Venta en primera persona, "token" en singular, promoción y acción lejos entre sí |

Son **formas explícitas** que el filtro puede comprometerse a retener. Se
separan del abuso contextual de §1.3.

## 2. Recomendación principal

### 2.1 Qué es el filtro y qué aporta

**Una barrera mecánica y un detector de señales, no un moderador.**

- **Rechaza** los contactos y enlaces completos del catálogo (F1–F4), en
  todas las formas mecánicas declaradas.
- **Retiene** las señales combinadas (S1–S5) y las formas sensibles
  explícitas (H1–H3).
  - Ninguna señal se dispara con **un solo indicio**: "busca", "pasa",
    "sigue", una plataforma o "correo", solos, publican.
  - La intención sólo cuenta en imperativo o con clítico de primera persona.
    La tercera persona narrativa no cuenta.
- **Publica** el texto sólo si no contiene ninguna forma incluida.
  - **Una exclusión no es una exención:** marca la evidencia que no se
    promete detectar. Si el mismo texto trae una forma incluida, esa forma
    decide la salida.
  - Gana la salida más restrictiva (catálogo §9).

**Qué aporta razonablemente:**
- frena las formas habituales y las ofuscaciones mecánicas declaradas;
- obliga a quien quiera colar un contacto a escribir instrucciones o
  paráfrasis, y muchas dejan una señal retenible;
- concentra el trabajo humano en lo retenido y lo denunciado.

**No es una cifra de eficacia en uso real.** No hay uso real.

**Qué deja pasar:**
- instrucciones, referencias y descripciones en palabras sin otra señal;
- datos repartidos fuera del historial elegido;
- abreviaturas fuera de las listas;
- todo lo contextual de E7.

### 2.2 Combinación con las defensas diseñadas (ninguna implementada)

| Capa diseñada | Qué cubre que el filtro no |
|---|---|
| Límites por cuenta | Probar variantes de a muchas; el volumen de un atacante |
| Admisión acotada de retenidos (2 por autor, N global) | Que la retención del filtro no genere una cola sin tope |
| Denuncias con prioridad por gravedad | El abuso contextual de E7 y lo que el filtro no vio |
| Bloqueos personales | Protección inmediata de quien denuncia |
| Suspensiones y panel | Cortar una cuenta después de una decisión humana |
| Pausa manual T4 | Que el dueño frene la publicación nueva ante un ataque |

**Condición previa para publicar (recomendada):** las reseñas de usuarios no
se publican hasta que estén implementadas y probadas **todas** las capas de
la tabla, **y** el filtro haya aprobado su evaluación (§4).
- **La evidencia posterior al lanzamiento no reemplaza estas condiciones:**
  sirve para calibrar después, no para habilitar antes.
- **Esta propuesta no evalúa cumplimiento normativo** (por ejemplo, de Play):
  eso necesita su propia revisión con documentación oficial.

### 2.3 Trabajo humano

- **Lo único que se lee:** las colas de retenidos y de denuncias.
- **No se propone leer lo publicado, ni antes ni después.** El muestreo que
  planteaba la revisión §3.5 (P6) **no está aceptado** y **no lo recomiendo
  ahora**. No lo reintroduzco como obligación.
- **El volumen no se puede estimar sin uso real.** El esquema operativo de §5
  usa hipótesis marcadas y la disponibilidad que el dueño indique.

## 3. Contrato de aceptación propuesto

**Pendiente de aprobación.** No se aplica al reservado 3.

| | Vigente | Propuesto | Justificación | Qué se pierde |
|---|---|---|---|---|
| **C0** | Ningún error | Igual | — | — |
| **C1** | 0 "claros" sin detectar. Incluye contactos que se arman siguiendo instrucciones | **C1a:** 0 casos **dentro** del catálogo (F1–F4) sin detectar, en el generador y en el conjunto independiente. **C1b:** los contactos "fuera" se informan uno por uno, con la exclusión que citan | El criterio vigente promete frenar cualquier redacción con instrucciones, y eso no tiene un borde implementable con el alcance elegido. C1a es verificable | Ya no se promete frenar contactos por instrucciones o referencias. Dependen de S1–S3 y de las denuncias. Un aprobado dirá "ninguna forma del catálogo pasa", **no** "ningún contacto pasa" |
| **C2** | ≥ 95 % de las ofuscadas detectadas | **C2a:** **100 %** en lo generado (es la promesa) y **≥ 95 %** de lo "dentro" del conjunto independiente detectado. **C2b:** la detección total, informada | El 95 % del independiente deja margen para ambigüedades de clasificación. El 100 % del generador obliga a que el mecanismo cubra su clase | La detección de lo "fuera" deja de tener umbral. Se informa siempre y no puede omitirse en el resumen |
| **C3** | ≤ 2 % de legítimas rechazadas | **Igual**, sobre las legítimas del independiente y sobre los controles generados | — | — |
| **C4** | ≤ 5 % de legítimas retenidas | **Igual.** Además, la retención de los controles narrativos de S y H se informa aparte | Las señales y H retienen más: el tope no se sube | — |
| **CS** (nuevo) | No existe: las sensibles son informativas | **Por familia; cada una tiene que cumplir por separado** (tabla siguiente). 100 % en lo generado y ≥ 95 % de lo "dentro" del conjunto. El agregado se informa, pero **no compensa** a una familia que falle | Son formas explícitas de listas cerradas, de la misma naturaleza mecánica que C2, y llevan el mismo umbral | Lo contextual (E7) no queda cubierto por CS. Se informa aparte, sin umbral |

**CS por familia** (conjunto independiente; "frenado" quiere decir retenido o
rechazado):

| Familia | Mínimo de casos | Denominador | Cumple si |
|---|---|---|---|
| **H1** amenaza explícita | 30 reseñas | Casos H1 "dentro" | frenados ≥ 95 %: 29 de 30, o lo equivalente con más casos |
| **H2-R** odio explícito, reseñas | 30 reseñas | Casos H2 "dentro" de tipo reseña | ≥ 95 % |
| **H2-N** odio explícito, nombres | 10 nombres | Casos H2 "dentro" de tipo nombre | ≥ 95 %: con 10, exige 10 de 10 |
| **H3** datos personales | 30 reseñas | Casos H3 "dentro" | ≥ 95 % |

- H2 se informa y se evalúa **por separado** para reseñas y nombres, para que
  los nombres no oculten un subgrupo de reseñas, ni al revés.
- Un caso mixto cuenta en cada familia incluida que contiene (catálogo §9).
- **Qué significan los tamaños:**
  - **El mínimo es de granularidad y cobertura, no una garantía
    estadística.** Con 8 casos, el 95 % exige 8 de 8: el criterio sí
    distingue 8 de 7, pero no tolera ningún fallo.
  - Con 30 se tolera 1 fallo y el resultado tiene más resolución. Aun así,
    30 casos **no demuestran** una eficacia real del 95 %: miden el conjunto,
    no la población.

**Regla del catálogo contra el cambio de denominador:**
- un caso es "fuera" sólo si cita una exclusión de la lista cerrada (catálogo
  §7), clasificado antes de sellar y revisado por Codex antes de ejecutar;
- lo que no encaja en ninguna exclusión cuenta como "dentro";
- el resultado de lo "fuera" se informa caso por caso.

**Cómo se comprueba:** con el generador del catálogo (§5 del catálogo: qué
enumera, qué muestrea y que no promete cobertura semántica) y con **un**
conjunto independiente, según §4.

## 4. Procedimiento de validación y regla de detención

### 4.1 Evidencia que acepta una versión

Una versión V del módulo se acepta sólo si se cumple todo esto, **en este
orden**:

1. El catálogo y el contrato de §3 están aprobados (Codex y el dueño) y
   comprometidos en Git **antes** de implementar.
2. V está **congelada** con huellas **antes** de crear los casos del conjunto
   independiente.
3. **Requisito técnico, necesario pero no suficiente:** sobre V pasan el
   generador del catálogo (C1a, C2a, CS por familia al 100 %, controles
   dentro de C3 y C4), la suite y las regresiones conocidas.
4. **Requisito de validación:** un conjunto independiente, sellado, se ejecuta
   **una vez** sobre V y cumple C0, C1a, C2a, C3, C4 y CS por familia.
   - CS sólo cuenta como independiente con la ruta A (§4.3).
   - Lo "fuera" (C1b, C2b) y lo contextual se informan.

**Si el código cambia después del paso 4, la evaluación no se traslada.** El
resultado queda como evidencia de V, y la versión nueva necesita su propio
paso 4. El generador y las regresiones **nunca** convierten en aprobada a otra
versión. Una "aceptación con evidencia limitada" sólo existiría como decisión
explícita del dueño, con ese nombre y nunca como "cumple el criterio
independiente". **No la recomiendo para los contactos.**

### 4.2 Regla de detención

- **Durante la implementación**, se itera **sólo** contra el generador y las
  regresiones. No se usan conjuntos sellados para ajustar.
  - Se prohíbe agregar instancias tomadas de casos divulgados: cada cambio es
    de mecanismo y tiene que pasar su clase entera en el generador.
- **Un solo conjunto independiente** (el reservado 4) para la versión
  congelada. Si **no** cumple:
  - el resultado queda **fallido**, como el reservado 3;
  - E1 sigue sin aprobarse;
  - no hay corrección con aprobado implícito, ni otra ronda, ni otro
    conjunto automáticos.
- **Después de un fallo, decide el dueño, con el informe completo:**
  - **mantener cerrada la publicación de reseñas**, que es la consecuencia por
    defecto y no requiere acción;
  - **o autorizar explícitamente un ciclo nuevo**: versión nueva, revisión del
    catálogo si corresponde y otro conjunto independiente con su propio
    paso 4.

  Lo que no puede pasar es un aprobado por agotamiento de rondas.

### 4.3 Autoría de la parte sensible: dos rutas que no se confunden

En el reservado 3, el agente separado no pudo redactar odio, amenazas ni
datos personales.

| | **Ruta A: autoría independiente** | **Ruta B: autor que conoce las reglas** |
|---|---|---|
| Quién escribe H1–H3 | Una persona o un autor que no conoce las reglas ni sus listas, con la misma separación que la parte general | Claude u otro autor que conoce las reglas |
| Qué evidencia da | **CS independiente** | **CS complementario, no independiente.** Sirve como prueba y regresión |
| ¿Satisface el paso 4 de §4.1? | **Sí**, si cumple CS por familia | **No.** No se puede rotular "CS independiente aprobado" |
| Qué haría falta para cerrar H1–H3 | Nada más | Un **dictamen de Codex** que califique explícitamente la evidencia como limitada, **y** una **aceptación específica del dueño** para este contrato y este conjunto, con el nombre "aceptación con evidencia limitada para H1–H3". La parte de contactos sigue exigiendo un conjunto independiente |

- **La autorización híbrida del reservado 3 fue específica de aquella
  entrega:** no se hereda ni vale para este contrato.
- **Sin la ruta A ni una aceptación específica de la ruta B,** H1–H3 quedan
  sin cerrar, y con ellas la versión: no se publica.
- **La ruta A puede no estar disponible:** el bloqueo del reservado 3 indica
  que un agente separado probablemente no pueda escribir esa parte.

## 5. Operación: sobrecarga de cada cola

**Hipótesis, no acordadas.** Ninguna cifra está decidida: las marcadas
**[H]** son propuestas técnicas y la disponibilidad del dueño está
pendiente. Se respetan las decisiones previas: ninguna denuncia oculta por
cantidad y no hay pausa global automática.

### 5.1 Cola de retenidos (contenido invisible)

- **Prioridad:**
  1. H1 amenaza y H3 datos personales;
  2. S1–S4 contacto;
  3. H2 odio;
  4. S5 y spam;
  5. texto anómalo.

  Dentro de cada nivel, el más viejo primero.
- **Atraso:**
  - lo retenido **sigue invisible** hasta que alguien decida; **nunca** se
    publica por vencimiento;
  - el autor ve "en revisión" y puede editar (vuelve a evaluarse) o borrar;
  - el panel muestra el tamaño de la cola y la edad del más viejo por nivel.
- **Sobrecarga** (como ya está diseñado):
  - con **2** retenidos sin resolver, un envío nuevo de ese autor que sería
    retenido no se admite;
  - con **N** en total, no se admite ninguno que sería retenido. No se guarda
    y el autor ve "probá más tarde";
  - **lo que pasa todas las reglas se sigue publicando.**
- **N [H]:** la cantidad que el dueño indique que puede resolver en su
  período de revisión habitual. Mientras no lo indique, **no se habilita la
  publicación**.
- **Reanudación:** automática **sólo de la admisión**, cuando la cola baja de
  N. No es una pausa global.

### 5.2 Cola de denuncias (contenido visible)

- **Prioridad:** igual que en el diseño. Primero las categorías graves
  (phishing o estafa, explotación, datos personales, amenazas); después, la
  cantidad de denunciantes distintos, que **ordena y nunca oculta**.
- **Atraso:**
  - el contenido denunciado **sigue visible** hasta la decisión;
  - al recibir la denuncia se vuelven a correr las reglas: si ahora retienen,
    el contenido queda retenido **por la regla**;
  - quien denuncia puede bloquear al autor en el mismo paso y deja de verlo
    al instante.
- **Sobrecarga:** la cola no se cierra. Su crecimiento lo acotan los límites
  diarios de denuncias por cuenta, una denuncia por denunciante y versión, y
  la agrupación por versión.
  - **Alerta [H]:** si la denuncia grave más vieja supera **72 h** sin
    revisar, el panel lo destaca. No hay correo ni servicio nuevo.
  - **Decisión de pausa:** **manual**, del dueño, con T4. Se pausa la
    **publicación nueva**. Lo visible sigue visible, y denunciar, bloquear,
    borrar y eliminar la cuenta siguen disponibles.
  - **Reanudación:** manual, cuando el dueño considere atendido el atraso
    grave. **Criterio sugerido [H]:** ninguna denuncia grave de más de 72 h.
- **Qué no se promete:** que la cola de denuncias quede bajo control sin
  conocer el volumen y la frecuencia de revisión. Si el atraso grave se
  vuelve habitual, la salida es una decisión de alcance del dueño, por ejemplo
  mantener la pausa. No es una regla automática.

## 6. Decisiones

### 6.1 Decisiones técnicas que recomiendo, con justificación (las audita Codex; no son del dueño)

1. **El filtro como barrera y señales (§2.1)**, con el catálogo cerrado y
   versionado.
2. **Clases Unicode, listas cerradas por versión y datos públicos de UTS #39 y
   de IANA**, sin servicios externos.
   - Esos datos se **incorporarían** al repositorio con su versión y su
     huella. **Hoy no están incorporados ni verificados**, y esta entrega no
     los descarga.
   - Las listas y versiones del catálogo §8 se fijan **antes** de implementar.
3. **El contrato de §3:**
   - C1a, C1b, C2a y C2b;
   - CS por familia (H1, H2 reseñas, H2 nombres y H3), cada una por
     separado, sin compensación por el agregado;
   - C3 y C4 sin cambios;
   - prioridad y casos mixtos según el catálogo §9.
4. **El procedimiento de §4:** la evidencia es por versión, hay un solo
   conjunto independiente, y un fallo queda fallido sin aprobado por
   agotamiento.
5. **El generador con su enumeración y su muestreo declarados**, que no
   promete cobertura semántica.
6. **Las prioridades y alertas de §5**, como hipótesis revisables.

### 6.2 Decisiones de producto que necesito del dueño

| # | Decisión | Por qué es tuya |
|---|---|---|
| **P-1** | **Alcance:** aceptar que el filtro no frene lo contextual ni lo que sólo cita una exclusión (catálogo §7), y que eso **se publique**. **Denunciar no lo oculta de inmediato:** sigue visible para todos hasta la decisión administrativa, salvo que al revalidarlo una regla lo retenga. **El bloqueo personal** sólo lo oculta para quien bloquea. **Pausar** frena la publicación nueva, pero no retira lo que ya está visible | Es el riesgo residual del producto |
| **P-2** | **Condición para publicar (§2.2):** ninguna reseña de usuario se publica hasta tener todas las capas implementadas y probadas y el filtro aprobado | Afecta cuándo existen las reseñas |
| **P-3** | **Tu disponibilidad aproximada** para revisar las colas, por ejemplo con qué frecuencia y cuánto tiempo. Fija N y la alerta. No te propongo una cifra | Sólo vos la sabés |
| **P-4** | **Autoría de la parte sensible** (§4.3). **Ruta A:** autor independiente, que requiere a una persona disponible. **Ruta B:** autor que conoce las reglas, con evidencia **limitada**, que sólo cierra H1–H3 con un dictamen de Codex y tu aceptación específica | Requiere a una persona o aceptar menos evidencia |

**Lo que no te pido ni propongo:**
- gastos, servicios o APIs;
- leer las publicaciones o muestrear;
- reemplazar las reseñas escritas.

El cambio de criterios (§3) y el procedimiento (§4) son propuestas técnicas
para que las audite Codex. Una vez auditadas, se te presentan juntas para
aprobarlas o rechazarlas, no como siete preguntas separadas.

## 7. Correcciones respecto de la v1

- **A1 (procedimiento):** se retiró "corregir después del conjunto final y
  verificar sólo con el generador". La evidencia es por versión (§4.1), y un
  fallo queda fallido (§4.2).
- **A2 (sensibles):** se agregó CS, con su justificación y tamaño mínimo.
  Lo contextual queda separado.
- **A3 (catálogo):** hay una especificación revisable, en un documento
  aparte, con clases, límites, combinaciones, salidas, controles, generador y
  exclusiones. Se cambiaron las afirmaciones absolutas por límites del módulo
  y del alcance.
- **A4 (señales y operación):** ningún indicio aislado retiene y la tercera
  persona no es intención. Las dos colas tienen su prioridad, atraso, pausa y
  reanudación.
- **A5 (atribuciones):**
  - el muestreo P6 estaba **sin aceptar**, no rechazado;
  - que el módulo esté sin conectar no prueba que no haya contenido heredado
    en Producción;
  - se retiró la atribución a Play;
  - la evidencia posterior al lanzamiento no reemplaza las condiciones
    previas.

## 8. Conciliación v2.1 (auditoría de `2bc6c1c`)

- **A1:**
  - CS por familia (H1, H2 reseñas, H2 nombres y H3), con mínimo,
    denominador y umbral propios, y sin compensación por el agregado;
  - se corrigió la justificación numérica: 8 casos sí distinguen; 30
    mejoran la granularidad, pero no prueban una eficacia real.
- **A2:** las rutas A y B (§4.3). La B no satisface el paso 4 sin un
  dictamen y una aceptación específica, y no hereda la autorización del
  reservado 3.
- **A3:**
  - prioridad única y casos mixtos (catálogo §9);
  - una exclusión no exime;
  - P-1 describe que denunciar no oculta de inmediato y que pausar no retira
    lo visible.
- **A4:**
  - F1 incluye la corrida sin separadores, con los prefijos contados;
  - S quedó alineada con el generador (Ps, Pe y Me enumerados; So fuera, con
    la exclusión E9);
  - E8 se separó de la restricción de generación G1;
  - las listas y versiones pendientes figuran en el catálogo §8;
  - los datos de Unicode, UTS #39 e IANA figuran como no incorporados.
