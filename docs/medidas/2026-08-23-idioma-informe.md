# Idioma de los títulos: informe definitivo

**2026-08-23 · revisión 5 · rama `audit/idioma-titulos`**
**Plan de implementación: [`2026-08-23-idioma-plan.md`](2026-08-23-idioma-plan.md).**
**No se tocó código de producción.**

Disparador: `movie:12535` (*High Anxiety*, 1977). Yump muestra "Máxima
ansiedad"; Disney+ Argentina publica "Las ansiedades del Dr. Mel Brooks"; y
—el hallazgo que define el diseño— **ese nombre publicado devuelve cero en el
buscador del propio Disney+**. Lo único que la encuentra es `High Anxiety`.

Datos: `-muestra.json`, `-crudo.json`, `-sinopsis.json`, `-verificado.json`,
`-fallback.json`, `-pasajes.json`, `-home-e2e.json`, `-ficha-payload.json`.
Instrumentos: `scripts/medir-idioma-titulos.mjs`, `scripts/medir-fallback-idioma.mjs`.

---

## 1. Encontrabilidad — 29 casos verificados

| Variante | directo | relacionados | no | **encuentra** |
|---|---|---|---|---|
| `es-ES` (hoy) | 16 | 2 | **11** | **18/29** |
| `es-MX` | 25 | 3 | 1 | **28/29** |
| original | 27 | 1 | 1 | **28/29** |
| alternativo AR | 2 | 0 | 3 | 2/5 |
| **`es-MX` ∪ original** | 27 | 2 | **0** | **29/29** |

Dos muestras, medidas por separado:

| | n | `es-ES` | `es-MX` | original |
|---|---|---|---|---|
| Encontrabilidad general | 17 | 12/17 | 16/17 | 16/17 |
| Pasaje al inglés | 12 | **6/12** | **12/12** | **12/12** |

Por plataforma, sobre las tres que exigen sesión:

| Plataforma | n | `es-ES` encuentra |
|---|---|---|
| **Disney+** | 9 | **1/9** |
| Max | 5 | 3/5 |
| Netflix | 7 | 6/7 |
| Prime Video | 8 | 8/8 |

**Disney+ es el caso crítico: `es-ES` falla en 8 de 9.** Prime Video no falla
nunca, porque su buscador indexa títulos alternativos.

Fuera de los conteos: `movie:1311031` (Crunchyroll, instrumento degradado — su
buscador devuelve cero para su propio nombre publicado) y los dos de
**Paramount+, declarados fuera de alcance por falta de acceso; no bloquean la
implementación**.

### Las tres conclusiones firmes

1. **`es-MX` encuentra 28 de 29; `es-ES`, 18 de 29.** Los 11 fallos de `es-ES`
   son todos de Netflix, Disney+ y Max.
2. **Ninguna variante sola llega a 29/29. La unión `es-MX` + original, sí.** Por
   eso el título original va en el payload de la ficha.
3. **Conservar el original inglés nunca es peor.** 12 de 12 en la submuestra
   dirigida, y en 6 de esos 12 es lo único que funciona ("Monsters, Inc.",
   "Moana 2", "WandaVision", "Black Widow", "Lost", "True Blood"). La regla de
   **no** reparar el pasaje válido al inglés queda **aprobada** y se fija con
   tests.

---

## 2. Lo que TMDB devuelve

- **`es-AR` tuvo 0% de cobertura en esta muestra de 60 títulos.** No difirió de
  `es-ES` en ninguno y `/translations` devolvió solo `ES` y `MX`. Instrumento
  verificado con `en-US`/`de-DE`. No se afirma que no exista en ninguna parte
  del catálogo de TMDB: se afirma que en esta muestra no apareció.
- **Cuando no hay traducción MX, TMDB cae al título ORIGINAL, no a `es-ES`.**
  Verificado en `tv:33238`. Es la causa de las dos regresiones que el fallback
  repara: títulos en alfabeto no latino y fichas sin sinopsis (3,3% → 6,7%).
- El alternativo argentino existe en 13,3% del catálogo y encuentra en 2 de 5.
  **Queda fuera de la v1.**

---

## 3. `consulta_verificada`

**No es una tabla de títulos publicados. Es una tabla de consultas de búsqueda
verificadas.**

```
tipo + tmdb_id + plataforma + país  →  consulta_verificada
movie + 12535  + Disney+    + AR    →  "High Anxiety"
```

`nombre_publicado` se conserva **solo como auditoría** y nunca se usa para
buscar: Mel Brooks es la prueba.

**La entrada de Mel Brooks se mantiene aunque el original ya funcione como
respaldo genérico.** El respaldo genérico dice "si no aparece, probá con el
título original"; la entrada verificada dice "buscá esto", que es una afirmación
más fuerte y ya comprobada. No es redundante: es la diferencia entre una
sugerencia y un dato.

La resolución es **por plataforma**. Nada garantiza que lo que funciona en
Disney+ funcione en Netflix, y los datos ya muestran motores de búsqueda que se
comportan distinto.

### Diseño de la ficha

1. **Título principal en `es-MX`.**
2. **`originalTitle` en el payload de `/api/title`.**
3. **Si hay consulta verificada para esa plataforma:**
   `Para encontrarla en Disney+, buscá: "High Anxiety"` + botón de copiar.
4. **Si no hay, y el original difiere del `es-MX`:**
   `Si no aparece, probá con el título original: "…"` + botón de copiar.
5. **Varias plataformas → una resolución por cada una.** Nunca se reusa la
   consulta de una plataforma en otra.

El bloque **no se muestra** cuando la consulta coincide con el título que la
ficha ya exhibe.

### Coste de `originalTitle` — corregido

Cero llamadas a TMDB y cero bytes adicionales **desde** TMDB: el campo
`original_title` / `original_name` ya viaja en la respuesta de `titleDetails`.
Pero **sí agrega bytes al payload de `/api/title`**, y eso no es cero. Medido
sobre respuestas reales:

| Ficha | Payload | Delta | % |
|---|---|---|---|
| movie:12535 | 2.737 B | +31 B | 1,13% |
| movie:278 | 3.810 B | +43 B | 1,13% |
| tv:1399 | 6.247 B | +34 B | 0,54% |
| movie:557 | 6.387 B | +29 B | 0,45% |
| tv:4614 | 1.546 B | +23 B | 1,49% |
| movie:1084242 | 5.441 B | +29 B | 0,53% |
| **Promedio** | **4.361 B** | **+32 B** | **+0,72%** |

**Coste despreciable, no nulo.** En 42 de 60 títulos (70%) el original difiere
del `es-MX`, así que el campo se usa en la mayoría de las fichas.

---

## 4. El fallback

### 4.1 Detección — tres señales, ninguna cuesta una llamada

Se evalúan sobre el objeto que `discover` **ya devolvió**:

| Señal | Detecta | Incidencia (1021 títulos) |
|---|---|---|
| Título fuera del alfabeto latino | `런닝맨`, `마녀 2` | 3 |
| `overview` vacío | ficha sin sinopsis | 54 |
| `title === original_title` **y** `original_language ∉ {es, en}` | cayó al original | 9 |

Total, con solapamiento: **57 (5,6%)**, en **32 páginas de discover**.

**`en` está excluido a propósito y ahora está verificado con 12 casos.** Los 38
títulos (3,7%) donde `es-MX` devuelve el original inglés son "Monsters, Inc.",
"Moana 2", "WandaVision", "Black Widow", "Game of Thrones". Repararlos rompería
lo único que funciona en Disney+.

### 4.2 Inercia explícita — corregido

**El fallback queda inerte por configuración, no por ausencia de títulos rotos.**

```
si IDIOMA_BASE === IDIOMA_FALLBACK  →  devolver tal cual, sin diagnosticar
```

Ese `return` va **antes** de evaluar las señales. No se depende de que "con
`es-ES` no hay rotos": eso es una propiedad de los datos, no del código, y podría
dejar de cumplirse. Con la comprobación explícita, la tanda 1 del plan entra
con **cero llamadas de fallback garantizadas por construcción**.

### 4.3 Reparación — tres opciones medidas

| Opción | Llamadas extra (modelo de 72 páginas) |
|---|---|
| A — pedir siempre los dos idiomas | +72 |
| B — reparar título por título | +57 |
| **C — pedir `es-ES` solo si la página tiene algún roto** | **+21** |

Gana C: **un `discover` repara hasta 20 títulos de una vez** y solo el 29% de
las páginas lo necesita.

### 4.4 Dónde vive

**Capa 1 — `lib/pools.ts`, dentro del `cached()`.** La reparación se guarda bajo
**la misma clave**: se paga una vez por día y por pool, compartida entre todos
los usuarios. Sin claves nuevas ni comandos nuevos. Igual en
`candidatosCombinados()`.

La fusión es **por campo, no por objeto**: un título al que solo le falta la
sinopsis conserva su título `es-MX`.

**Capa 2 — la ficha.** Un solo título; segunda llamada condicional en `es-ES`
solo si hay señal: **+0,056 llamadas promedio**, contra +34 KB en el 100% de las
fichas que costaría `append_to_response=translations`.

**Capa 3 — `upcoming_content`.** El fallback corre en la Edge Function **antes
de escribir**.

---

## 5. Medición end-to-end del Home

Composer real (`GET /api/home?providers=n,d,m`) en un `git worktree` aislado,
**sin credenciales de Upstash** —cache vacío en cada proceso, producción
intacta—. `lib/cache.ts` cuenta los comandos igual en modo memoria, porque
dependen del patrón de acceso y no del backend. Tres corridas por variante.

| | `es-ES` (hoy) | `es-MX` + fallback | Delta |
|---|---|---|---|
| **Llamadas a TMDB** | 612 · 612 · 612 | 643 · 641 · 643 | **+31 (+5,1%)** |
| **Páginas de fallback** | 0 | **32** | — |
| **Comandos de Upstash** | 659 · 655 · 655 | 654 · 650 · 654 | **sin cambio** |
| **Payload del Home** | 84.063 B | 84.516 B | +453 B (+0,54%) |
| **ms del composer** | 5462 · 5822 · 9548 | 5734 · 6270 · 6413 | **rangos superpuestos** |
| **Títulos por riel** | 20×6 · 40 · 30 · 20 · 40 · 38 | idénticos | sin cambio |
| **`degradado` / `fallos`** | false / 0 | false / 0 | sin cambio |
| **Caliente** | 1 comando, 0 TMDB, 2 ms | idéntico | sin cambio |

Desglose de la línea base: 107 discover, 423 `watch/providers`, 82 detalles.

**Sobre el tiempo no se afirma nada**: los rangos se superponen y la corrida más
lenta es de la línea base. En este banco domina la varianza de TMDB y `next dev`.

> Fallo del arnés, declarado: la primera versión reusaba el puerto y una corrida
> midió el servidor anterior — `es-ES` y `es-MX` dieron payloads idénticos byte a
> byte. Se corrigió con un puerto por corrida y un guard que aborta si faltan las
> líneas de instrumentación.

---

## 6. Plan de implementación

Vive aparte, en [`2026-08-23-idioma-plan.md`](2026-08-23-idioma-plan.md):
tres tandas de despliegue, claves con huella de idioma, prueba de rollback y la
auditoría de `roulette_titles`.

## 7. Respuestas finales

1. **¿Conviene `es-MX`?** Sí. 28/29 contra 18/29. Cuesta +5,1% de llamadas en
   frío, cero en caliente, +0,54% de payload, cero comandos de Upstash.
2. **¿Qué resuelve?** `es-ES` deja al usuario sin nada en 11 de 29 (38%);
   `es-MX`, en 1 de 29 (3%). En Disney+, de 8 de 9 a 1 de 9.
3. **¿Qué queda?** Un caso con `es-MX` (Mel Brooks) y **cero con la unión
   `es-MX` + original** (29/29). Con `es-ES` + original la unión da 28/29: falla
   `movie:278`, donde solo funciona el `es-MX`. Por eso el respaldo genérico al
   original **no se despliega antes que `es-MX`**. Tres en `relacionados`, uno de ellos techo del
   instrumento.
4. **¿"Buscala en…"?** Sí. Es lo único que cubre Mel Brooks, donde fallan las
   cuatro fuentes de TMDB **y el propio nombre publicado**.
5. **¿Tabla propia?** Sí, desde v1, como consultas verificadas. Mapa estático
   con una fila, detrás de una función que no acopla la UI al almacenamiento.
6. **Orden:** tres tandas — preparación inerte, cambio de idioma, upcoming. La
   preparación antes del cambio no es negociable, y la invalidación fría ocurre
   una sola vez.
7. **Aceptación:** los criterios de cada rama, arriba.

---

## Reproducir

```bash
node --env-file=.env.local scripts/medir-idioma-titulos.mjs instrumento
```

Después `muestra`, `medir`, `sinopsis`, `informe`, `estrategias`; el fallback con
`scripts/medir-fallback-idioma.mjs n,d,m`. La medición end-to-end se rehace
levantando el composer en un worktree aparte sin credenciales de Upstash; el
procedimiento y los contadores están en `-home-e2e.json`.
