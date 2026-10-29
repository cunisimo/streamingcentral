# Reservado 3 (medición independiente final de E1): protocolo

Fijado el 23/10/2026, **antes de que exista ningún caso**, y comprometido en
Git antes de encargarlos. El código medido está congelado en
`docs/medidas/2026-10-23-e1-reservado-3-congelamiento.md`. Este archivo es lo
**único** que recibe quien escribe los casos, junto con el mensaje de encargo
(transcripto en el informe final).

## 1. Qué es el producto (requisitos)

Yump es una app argentina que recomienda películas y series de streaming. Va a
tener **reseñas de usuarios** (texto libre de 80 a 600 caracteres) y un
**nombre comunitario** público (de 2 a 24 caracteres). Antes de publicar, un
moderador automático por reglas propias, sin servicios externos, decide una de
estas salidas para cada texto:

- **rechazar** (el autor debe corregir). Corresponde a datos de contacto o
  enlaces, aunque estén disimulados:
  - enlaces o direcciones web, incluso sin `http` y con el dominio disimulado;
  - correos electrónicos, incluso escritos con palabras o con espacios;
  - teléfonos;
  - usuarios de redes o mensajería presentados para que lo contacten.
- **retener** para revisión humana (no se publica hasta que el dueño decide):
  - spam o promoción: cripto, inversión, ganancias, sorteos, ventas;
  - términos de odio y amenazas explícitas;
  - datos personales de terceros: documento, domicilio;
  - texto anómalo: casi todo en mayúsculas, muy repetitivo, con poquísimas
    palabras distintas;
  - derivar al perfil o al nombre ("mirá mi nombre");
  - señales de contacto incompletas o indirectas;
  - contacto repartido entre varias reseñas del mismo autor.
- **publicar**: todo lo demás.

Se acepta que las reglas **no entienden el significado**: el acoso sin
términos reconocibles, la ironía, las amenazas veladas o las estafas
contadas sin datos concretos quedan para las denuncias.

Lo que importa no publicar nunca es **un contacto o enlace claro**. Lo que
importa no frenar es la **reseña legítima**, que en Argentina tiene lunfardo,
números (años, duraciones, temporadas, precios, puntajes), títulos con
dígitos, nombres de plataformas y redes, tramas duras y diálogos.

## 2. Separación y reglas para quien escribe

- **No leer nada del repositorio** salvo este archivo: ni `lib/`, ni otros
  `scripts/`, ni `docs/`, ni los bancos o informes anteriores. No buscar en
  Git. Si algo de este protocolo es ambiguo, decidir con criterio de producto
  y anotarlo en `descripcion`.
- **No usar internet** ni servicios externos.
- **Todo inventado.** Teléfonos, correos, usuarios, dominios y documentos de
  fantasía; ninguna persona real como víctima de un ataque, ninguna dirección
  real de una persona. Las plataformas y las películas reales sí pueden
  nombrarse.
- **Variedad:** redacción distinta en cada caso. Nada de plantillas con un
  hueco que cambia. Mezclá registros (formal, rioplatense, con errores de
  tipeo, con emojis).
- **Las etiquetas salen de la sección 1**, no de adivinar cómo funcionan las
  reglas. No ajustar casos para que "pasen" o "fallen".
- No dejar en el repositorio scripts auxiliares: sólo los archivos de la
  sección 4.

## 3. Tamaños y categorías (fijos)

### 3.1 Reseñas legítimas: 160, `esperado: "publicar"`

| Categoría | Casos | Qué |
|---|---|---|
| `numeros.anios` | 8 | años, décadas, rangos de años |
| `numeros.duraciones` | 6 | minutos, horas, "2 h 15" |
| `numeros.temporadas` | 6 | temporadas, episodios, formas tipo "T2E5" |
| `numeros.montos` | 6 | precios, presupuestos, recaudaciones |
| `numeros.fechas` | 6 | fechas de estreno, días y meses |
| `numeros.puntajes` | 6 | notas con barras y decimales, rankings |
| `titulos_alfanumericos` | 12 | títulos con dígitos o con letras y dígitos mezclados |
| `puntuacion_barras` | 8 | barras entre palabras, puntos sin espacio, puntos suspensivos, abreviaturas |
| `lunfardo` | 12 | |
| `insulto_personaje` | 10 | insultos o desprecio dirigidos a personajes, no a usuarios |
| `trama` | 14 | crimen, drogas, sexo entre adultos, violencia |
| `plataformas_redes` | 12 | menciones legítimas de plataformas, redes y apps |
| `correo_tecnologia` | 10 | correo, mails, Google, apps o hackers dentro de la trama o como comentario técnico |
| `dialogo_ficcion` | 12 | diálogos o escenas con verbos de contacto, mensajes o redes dentro de la trama, con y sin comillas |
| `inversion_cripto` | 8 | vocabulario financiero en reseñas de películas sobre finanzas o estafas |
| `citas` | 6 | frases célebres de películas |
| `negativa` | 8 | reseñas negativas duras pero sin abuso |
| `general` | 10 | |

### 3.2 Reseñas de abuso: 156

**A. Contactos completos** (`claro: true`, `esperado: "rechazar"`). Una
persona que lea el texto puede contactar al autor o abrir el enlace sin
adivinar nada.

| Categoría | Casos | `directa` | `ofuscada` |
|---|---|---|---|
| `contacto.telefono` | 28 | 6 | 22 |
| `contacto.email` | 22 | 4 | 18 |
| `enlace` | 22 | 4 | 18 |
| `contacto.red` | 18 | 4 | 14 |

Variantes ofuscadas que tienen que aparecer, repartidas y combinadas, y otras
que se te ocurran dentro de la misma idea:
- **teléfono:** separadores de todo tipo, números escritos con palabras,
  letras que imitan dígitos, dígitos de otros sistemas de escritura o de
  ancho completo, número con forma de año, fecha o importe junto a un pedido
  de contacto;
- **correo:** arroba y punto escritos con palabras, espacios entre letras,
  "usuario en/de proveedor", letras parecidas de otros alfabetos;
- **enlace:** dominios con letras de otros alfabetos, separadores o "punto"
  escrito, acortadores, terminaciones poco comunes o largas, rutas;
- **red:** usuarios con o sin "@", alias o abreviaturas de las redes,
  pedidos en plural o a terceros, pedidos dentro de comillas que igualmente
  dan el usuario.

**B. Señales indirectas** (`claro: false`, `variante: "ofuscada"`). El texto
no trae un dato completo, pero intenta que lo contacten.

| Categoría | Casos | Esperado | Qué |
|---|---|---|---|
| `contacto.indirecto` | 8 | `frenar` | correo o usuario dados a medias: el autor se atribuye una casilla o un alias y pide que le escriban, sin dirección completa |
| `contacto.partido` | 6 | `frenar` | el dato repartido entre reseñas: lleva `contexto.textosRecientes` con 1 a 3 textos anteriores del mismo autor |

**C. Otros contenidos** (`claro: false`, `variante: "directa"`,
`esperado: "retener"`).

| Categoría | Casos | Qué |
|---|---|---|
| `perfil` | 4 | derivar al perfil o al nombre comunitario |
| `spam` | 12 | cripto, inversión, sorteos, ventas, casinos |
| `odio` | 8 | términos de odio explícitos contra grupos |
| `amenaza` | 8 | amenazas explícitas a usuarios u otras personas |
| `datos_personales` | 8 | documento o domicilio de un tercero |
| `anomalo` | 4 | mayúsculas, repeticiones, pocas palabras distintas (siempre de 80 a 600 caracteres) |

**D. Fuera de la capacidad declarada** (`claro: false`, `variante:
"directa"`, `esperado: "retener"`, campo extra `"alcance":
"fuera_de_capacidad"`). Abuso que el producto declara que las reglas **no**
entienden (sección 1, último párrafo).

| Categoría | Casos | Qué |
|---|---|---|
| `fuera_capacidad` | 8 | acoso sin insultos reconocibles, amenaza velada, odio irónico o en código, estafa contada sin datos concretos |

### 3.3 Nombres comunitarios

- **Legítimos: 30**, `categoria: "nombre"`, `esperado: "publicar"`. Nombres,
  apodos, nombres con números o con signos, referencias a películas.
- **Abuso: 30**, `esperado: "rechazar"`, `claro: true` salvo `odio`.
  - `contacto.telefono` 8, `contacto.email` 6, `enlace` 6, `contacto.red` 6:
    la mitad `directa` y la mitad `ofuscada`;
  - `odio` 4: `variante: "directa"`, `claro: false`, `esperado: "retener"`.

**Fuera, a propósito:** contenido sexual con menores. No se escribe.

## 4. Forma de los archivos

Dos archivos en `scripts/comunidad/banco-reservado-3/`, cada uno
`{ "descripcion": "...", "casos": [ ... ] }` en JSON UTF-8:

- `reservado.json`: todo, salvo lo de `reservado-sensible.json`;
- `reservado-sensible.json`: `odio` (8 reseñas y 4 nombres), `amenaza` (8),
  `datos_personales` (8) y `fuera_capacidad` (8).

Cada caso:

```json
{
  "id": "R3-…",
  "tipo": "resena" | "nombre",
  "grupo": "legitima" | "abuso",
  "categoria": "…",
  "variante": "directa" | "ofuscada",
  "claro": true | false,
  "esperado": "publicar" | "rechazar" | "retener" | "frenar",
  "texto": "…",
  "contexto": { "textosRecientes": ["…"] },
  "alcance": "fuera_de_capacidad"
}
```

- `variante` y `claro`: **sólo** en abuso (en legítimas, ausentes).
- `contexto`: sólo en `contacto.partido`. `alcance`: sólo en `fuera_capacidad`.
- Ids únicos: `R3-L-001…` (legítimas), `R3-A-001…` (abuso),
  `R3-NL-01…`, `R3-NA-01…` (nombres) y `R3-S-001…` (archivo sensible).
- Largos en puntos de código después de NFC: reseñas de 80 a 600, nombres de
  2 a 24. Los textos de `contexto` también de 80 a 600.

## 5. Procedimiento de una sola ejecución

1. Este protocolo y el congelamiento del código se comprometen en Git
   **antes** de encargar los casos.
2. El ejecutor `scripts/comunidad/correr-reservado-3.mjs` se termina y se
   prueba con datos sintéticos **ajenos** al reservado **antes** de que
   existan los casos. No se modifica después.
3. Agentes separados escriben los dos archivos. Quien ajustó las reglas
   (Claude, sesión principal) **no lee los textos** antes de ejecutar.
4. Validación **sólo de forma**: un script imprime conteos, ids, largos y
   problemas de esquema, sin textos. Si falta algo o una categoría no pudo
   escribirse, se **detiene** y se informa; nadie completa casos a mano.
5. Sello: SHA-256 de cada archivo (UTF-8, saltos de línea LF) en
   `SELLO.json` y `SELLO.md`, en un commit propio.
6. Una sola ejecución contra el código congelado. El ejecutor verifica el
   sello y la huella del código y se niega a correr si el informe existe.
7. Si no cumple, se registra y se detiene: no se ajustan reglas, no se repite
   el conjunto como medición independiente y no se prepara otro reservado.

## 6. Criterios (los vigentes, sin cambios)

Sobre el conjunto entero (los dos archivos juntos):

- **C0:** ningún caso termina en error.
- **C1:** 0 contactos o enlaces claros (`claro: true`) sin detectar.
- **C2:** al menos 95 % de las variantes ofuscadas (`variante: "ofuscada"`)
  rechazadas o retenidas.
- **C3:** como máximo 2 % de reseñas legítimas rechazadas.
- **C4:** como máximo 5 % de reseñas legítimas retenidas.
- **N1:** nombres legítimos frenados, informativo.
- **Evaluabilidad:** un conjunto que no cumpla la forma y los tamaños de
  este protocolo es **no evaluable**, y no aprueba nada.

**Denominadores fijados de antemano:**
- C1 cuenta 90 reseñas (sección A) y 26 nombres.
- C2 cuenta 72 reseñas de A, 14 de B y 13 nombres: 99 en total.
- C3 y C4 cuentan 160 legítimas.
- `fuera_capacidad` no está en C1 ni en C2 porque el producto declara que no
  lo detecta. Su resultado se informa aparte y entero; no se presenta como
  cumplimiento.

Ningún falso positivo conocido se excluye. Ninguna etiqueta se cambia después
de ver resultados. La diferencia entre la etiqueta y la salida (por ejemplo,
"rechazar" contra "retener") se informa caso por caso y no altera C1 ni C2,
que miden detección.
