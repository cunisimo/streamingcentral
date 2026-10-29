# Informe para auditoría: implementación local del contrato de moderación v1

24/10/2026. Claude Code. Rama `feat/resenas-reglas`.

**Alcance:** implementación local del módulo puro, sin conectar.
- No hay rutas, pantallas, Supabase, SQL, Producción, publicación, APIs de
  moderación, gastos, push, merge, deploy ni AAB.
- **No se preparó ni ejecutó el reservado 4.**
- **E1 sigue sin aprobarse**: esto es implementación más evidencia local
  (generador y regresiones conocidas), **no una validación independiente**.

## Commits

| Commit | Qué |
|---|---|
| `7ffac91` | **Contrato antes del código:** copia de la auditoría `5982374` (SHA-256 `cbb824f5e40a7375…`, igual al original), catálogo v3.2 = contrato v1. Incluye las enmiendas 1 y 2, la variante sin IANA, las decisiones del dueño y la eliminación de dos afirmaciones no demostradas |
| `e42b8de` | Referencias Unicode 18.0.0 incorporadas, tablas generadas y su prueba |
| `7e6e5cd` | Reglas `2026-10-24.1`, ámbito, tabla `regla → familia`, generador, evaluador del contrato y pruebas |
| (este) | Este informe y `docs/ESTADO.md` |

## Referencias incorporadas

En `lib/comunidad/reglas/referencias/unicode-18.0.0/`, con un README de
origen y licencia:

| Archivo | SHA-256 |
|---|---|
| `DerivedGeneralCategory.txt` (18.0.0) | `d6b151d2d40ee9b1876d26f417980f45ffae47b6055ccf7203cb31f07a030f94` |
| `confusables.txt` (UTS #39 18.0.0) | `6ed3ee967c9dfdf6677d563c9985182fbc50a2efb7d6059cd57b2e2ce18f5b92` |
| `license.txt` (Unicode License v3) | `e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96` |

- **Huellas calculadas por Claude.** Coinciden con las declaradas el 23/10 y
  con las de los blobs commiteados (`git cat-file blob … | sha256sum`).
- **Codex todavía no las verificó.** Los archivos están en el repositorio
  para que las recalcule.
- `.gitattributes` marca los `.txt` como `-text`, para que Git conserve los
  bytes.
- `tablas-unicode.ts` se genera con `scripts/comunidad/generar-tablas-unicode.mjs`.
  Una prueba comprueba las huellas, las cabeceras de versión y que la tabla
  commiteada coincide exactamente con la generada.
- **No se incorporó IANA ni se contactó a terceros.**

## Contrato implementado (catálogo v3.2)

| Parte | Implementación |
|---|---|
| D2 | Rangos `Nd` de Unicode 18.0.0 (tabla generada, no el runtime) |
| D6 | Las marcas `Mn`, `Me` y U+FE0F pegadas a un dígito **hacen de separador**: "1️⃣1️⃣" pasa a "1 1", y "1985⃣2026" sigue siendo dos años |
| D7 y D8 | "diez y seis…", inglés de 0 a 9 en corridas, palabras pegadas a dígitos ("ocho2cuatro5") |
| D9 | Tabla vigente más los 353 confusables de dígito de UTS #39 (con minúsculas) |
| S | Clase de Unicode 18.0.0: `Zs`, `Pd`, `Ps`, `Pe`, `Po` sin `,;:`, `Sm`, `Mn`, `Me`, `_` y `/`. S2 (`,;:`) cuenta con señal |
| C | Tabla vigente más el esqueleto de UTS #39 de las letras **no ASCII**. Las ASCII no cambian: `m` no pasa a `rn` |
| F1 | `contacto.telefono` v4. Excepciones nuevas: fecha con `/` y puntaje (`8/10`). La señal es la fuerte vigente **o** I/M en el ámbito |
| F2 | `contacto.email` v3: alias + "mi usuario/mail… de <proveedor>". Además, el control "el mail de su jefe en Gmail" publica (un determinante o posesivo delante no es usuario) |
| F3 | `contacto.enlace` v6: F3-4 (punto espaciado o escrito + terminación alfabética que no es T-palabra + barra + segmento) y F3-6 (coma + T-fuerte + ruta). **F3-3 conserva la ruta vigente** (enmienda 1). **Variante sin IANA:** F3-2 y F3-6 sólo con T-fuerte |
| F4 | `contacto.red` v4 y `contacto.red_nombre` v3: alias (A, `alias#dddd`, "@ alias", "usuario/soy/como … alias") + plataforma de §6.M o I en el ámbito, con o sin comillas. "x" sólo junto a "usuario" o "@" |
| S1 a S5 | `senal.autoatribucion` v1, `senal.privado` v1, `perfil.derivacion` v2 (S3-a/b/c; enmienda 2), `contacto.partido` v4 (marcadores de §6.K) y `spam.promocion` v3 (venta o sorteo + acompañante) |
| H1 | `amenaza.directa` v3: formas directas; pronombre + "voy/vamos/van a" + daño, con destinatario si es lo/le, y "van a" sólo con "te"; deseo; exclusiones de §6.H1-e |
| H2 | `odio.lista` v2: grupo + deshumanización en la **misma oración**, en cualquier orden, o un insulto. `odio.nombre` v1 separa mayúsculas internas, dígitos y signos |
| H3 | `datos.documento` v3 ("doc.", CUIT sin etiqueta, DNI con puntos + nombre propio sin unidad cerca) y `datos.domicilio` v2 (vía + persona + localizador) |
| Ámbito | `ambito.ts`: la misma oración o la contigua, con 25 palabras como máximo; en H2, la misma oración |
| Prioridad | Sin cambios: gana la salida más restrictiva y un error nunca publica |

**Desvíos de implementación (declarados):**
1. **Se conservan las reglas vigentes como unión.** El ámbito reemplaza las
   ventanas en caracteres sólo en las condiciones nuevas, para no reducir la
   cobertura anterior.
2. **Saltos de línea:** las copias plegadas los convierten en espacios, así
   que una oración que termina sólo con un salto se une a la siguiente. El
   ámbito se agranda, no se achica.
3. **Marcas pegadas a un dígito:** la detección usa `\p{Mn}` del runtime de
   Node para las marcas no espaciadas. Los separadores y el resto de las
   tablas salen de Unicode 18.0.0.
4. **Nombre propio (H3):** heurística por mayúsculas en el original. No
   funciona en un texto escrito todo en minúsculas (límite declarado).
5. **Tabla `regla → familia`** (`familias.ts`, versión 1): el correo
   indirecto (`contacto.email_indirecto`) se asigna a S1.

## Evidencia local

| Prueba | Resultado |
|---|---|
| Generador determinista (`generador.ts`, semilla 20261024) | **2091 casos, 100 %** de salida esperada y de disparo de la propia familia. Detalle abajo |
| `node --test "lib/comunidad/**/*.test.ts"` | **99 de 99** |
| `npx tsc --noEmit --incremental false` | 0 errores |
| `npm test` (suite completa) | **2348 pruebas: 2330 pasan, 0 fallan, 18 omitidas.** Las omitidas necesitan un build web o el artefacto de Capacitor, como siempre; no se presentan como verificadas |

**Casos del generador:**

| Familia | Casos |
|---|---|
| F1 | 485 enumerados y 192 muestreados |
| F2 | 30 |
| F3 | 281 enumerados y 70 muestreados |
| F4 | 266 |
| S1 / S2 / S3 / S4 / S5 | 19 / 6 / 103 / 4 / 11 |
| H1 / H2 / H3 | 79 / 95 / 21 |
| Controles legítimos | 219 enumerados, 192 muestreados y 18 plantillas narrativas |

- **El generador enumera** los 72 rangos `Nd`, `Zs`, `Pd`, `Ps`, `Pe` y `Me`,
  todos los confusables de dígito y todas las listas de §6.
- **El generador muestrea** 64 caracteres de `Po`, `Sm` y `Mn`, 50
  terminaciones largas y 20 confusables de letra.
- **No promete cobertura semántica.**

**Bancos conocidos como regresión** (no son una medición independiente; C0–C4
con el evaluador histórico):

| Banco | C1 | C2 | C3 (rechazadas) | C4 (retenidas) |
|---|---|---|---|---|
| Desarrollo (506) | 0/182 | 177/177 | 2/211 (0,9 %) | 3/211 (1,4 %) |
| Reservado 1 (151) | 0/50 | 43/43 | 1/61 (1,6 %) | 1/61 (1,6 %) |
| Reservado 2 (360) | 0/124 | 117/117 | 1/150 (0,7 %) | 3/150 (2,0 %) |
| Reservado 3 (376) | **0/116** | **99/99** | 1/160 (0,6 %) | 0/160 |

**Reservado 3 por familia** (como regresión):

| Familia | Frenados ahora | Frenados con 2026-10-22.5 |
|---|---|---|
| Odio | 8/12 | 3 |
| Amenaza | 7/8 | 4 |
| Datos personales | 8/8 | 7 |
| Spam | 12/12 | 7 |
| Perfil | 4/4 | 2 |
| Contacto indirecto | 8/8 | 2 |
| Contacto partido | 6/6 | 5 |
| Fuera de capacidad | 0/8 | 0 |

**Lo que sigue sin detectarse** (fijado en la prueba de regresión):
- `R3-S-002`, `003` y `005`: el grupo y la deshumanización están en
  oraciones distintas, y H2 exige la misma.
- `R3-S-006`: no tiene ningún término de §6.H2-b.
- `R3-S-011`: "lo voy a…" sin destinatario de §6.H1-c ("el director" no
  está; "al director" sí).

**Corrección de la v3.1:** su §9 decía que "lo voy a ir a buscar…" quedaba en
H1, y no es así con las listas aprobadas. Lo dejo dicho; no amplío las listas.

## Falsos positivos del contrato aplicado literalmente

No son excepciones: siguen siendo legítimos, cuentan en C3 y C4 y las pruebas
fijan su salida exacta.

| Mecanismo del contrato | Ejemplos conocidos | Salida |
|---|---|---|
| **F1:** importe o fecha + un medio (M) en el ámbito, y "número" o "celular" son M | `D-LG-05-2`, `D-LC-002`, "El número de entradas vendidas fue 1.200.000" | Rechazo |
| **F4:** un alias (A) incluye formas como "4K", "M3GAN" o "2do", y "tele" es un alias de §6.M | `R-L-035` y `R2-RL-087` ("4K" + "tele"), `R3-L-049` ("M3GAN" + "pidan") | Rechazo |
| **S2:** intención + medio sin alias, también dentro de un diálogo | `D-RG-16-B`, `D-RG-18-B`, `R2-RL-101`, `R2-RL-108`; "Escribime qué opinan… el mail del villano" | Retención |
| **S3-b** (enmienda 2) | "fíjense en mi nombre favorito de la saga" | Retención |

**Riesgo para una medición independiente.** En los bancos conocidos, C3 y C4
siguen dentro del umbral. Pero los tres primeros mecanismos son ambigüedades
de **listas aprobadas**: "número", "tele", y A sin distinguir resoluciones,
ordinales ni títulos. Pueden hacer fallar C3 en un conjunto nuevo.

**Cambios posibles del contrato, NO aplicados y pendientes de decisión:**
1. En las excepciones de F1, limitar M a medios de contacto (cel, celu,
   celular, tel, teléfono, wsp, plataformas y proveedores), sin "número",
   "cuenta", "grupo", "canal", "perfil" ni "usuario".
2. Sacar "tele" de §6.M, o exigirle un alias adyacente.
3. En F4, que A no incluya formas de resolución, ordinal o episodio
   (`\d+[a-z]{1,2}`, `[a-z]\d[a-z]\d`) ni títulos con dígitos sin `_` ni `.`.
4. En S2, no contar la intención dentro de comillas o atribuida a un
   personaje cuando no hay alias.

Cada uno reduce la cobertura en algún caso, y por eso **no lo decido yo**. Si
no se cambian, la medición independiente dirá su costo real.

## Cambios del evaluador y evidencia de sus controles

`banco/evaluar-contrato.ts` es un módulo nuevo. `evaluar.ts` queda intacto,
porque los ejecutores históricos verifican su huella.
- **Por caso distingue:**
  - salida final;
  - familias disparadas, según la tabla;
  - caso puro o mixto;
  - dentro o fuera del catálogo (fuera exige citar una exclusión de E1 a E9);
  - autoría independiente o complementaria.
- **Criterios:** C0, C1a, C2a, C3 y C4, y CS-H1, CS-H2-R, CS-H2-N y CS-H3
  **por disparo de la propia familia**.
  - CS sólo cuenta casos puros, dentro y de autoría independiente, con
    mínimos de 30, 30, 10 y 30.
  - El agregado se informa y no compensa a una familia que falle.
  - Lo complementario se informa y nunca cumple el requisito independiente.

**Pruebas con datos sintéticos ajenos** (`evaluar-contrato.test.ts`):
- **Control positivo:** un banco completo y correcto aprueba.
- **Bloquear un teléfono no aprueba una amenaza:**
  - con 30 casos rotulados H1 que sólo tienen un teléfono, el texto no se
    publica pero CS-H1 da **no_cumple**;
  - si son mixtos (H1 + F1), no cuentan para el mínimo y el banco es **no
    evaluable**.
- **Sin compensación:** con H3 fallando, aunque el resto sea perfecto, **no
  aprueba**.
- **Autoría:** con la parte sensible complementaria, el banco es **no
  evaluable**.
- **Nunca aprueba** un banco incompleto, sin legítimas, vacío, con un caso
  inválido ("fuera" sin exclusión, legítima con familia, familia
  desconocida) o con mínimos en 0.
- **Fuera del catálogo:** se informa aparte y no entra en C1a ni en C2a.

## Operación (hipótesis del equipo, pendiente de aceptación)

El dueño revisa las colas a diario y no hay N acordado. **Propuesta
provisional y conservadora:**
- 2 retenidos sin resolver por autor (como en el diseño);
- **N = 20 retenidos sin resolver en total**, como límite inicial de admisión.

Se revisa con el trabajo observado antes de activar y durante el uso. No
implica leer todas las publicaciones. **Es una hipótesis, no una cifra
acordada.**

## Pendiente antes de una medición independiente

1. **Auditoría de Codex** de esta implementación, incluida la verificación
   independiente de las huellas Unicode.
2. **Decisión sobre los cambios 1 a 4** de "Falsos positivos": mantener el
   contrato literal y medir, o enmendarlo **antes** de congelar. Nunca
   después de ver resultados.
3. **Autoría del conjunto final** (rutas A o B), sin heredar el reservado 3.
4. **Ejecutor del reservado 4** con el evaluador del contrato: no se preparó.
5. **IANA:** diferida (variante sin IANA registrada).
6. **El resto de las defensas** (E2 en adelante): no existen. La publicación
   sigue desactivada.
