# "Elegidas para vos" — implementación y validación local de la diversidad (2026-10-31)

**Estado:** implementado y validado **en local**, en la rama
`feat/reco-diversidad` (sobre `diseno/reco-diversidad`). **Sin push, sin
merge, sin deploy, sin migraciones y sin AAB nuevo**, como pidió el dueño.

Plan: `docs/superpowers/plans/2026-10-31-reco-diversidad.md` (rev. 2).
Decisiones del dueño del 31/10:

- **D1, cantidad:** primero la oferta diversa, después se completa hasta T con
  contenido válido.
- **D2(a), a validar:** excluir Family sólo en el cruce hacia películas desde
  un origen animado no infantil.
- **D3, pospuesta:** no se guarda la procedencia de los descartes.

Tipos de evidencia de este documento:

- **[harness]**: las funciones reales de `lib/` sobre candidatos congelados
  (`scripts/reco-harness/fixture.json`, capturado el 31/10 19:20 AR), sin red.
- **[real]**: `recomendaciones()` con TMDB real y caché en memoria.
- **[tests]**: `npm test`.
- **[local]**: servidor de desarrollo.
- **Pendiente**: lo que no se pudo verificar todavía.

## 1. Qué se implementó

| Pieza | Archivo |
|---|---|
| Categorías infantil / familiar / animación, exclusiones del cruce, MMR y selector en dos pasadas (puro) | `lib/reco-seleccion.ts` |
| El armado entre la red y la red, compartido por la ruta y el harness (puro) | `lib/reco-armado.ts` |
| Orquestación: elección de orígenes, cruce con exclusiones, clave del riel e interruptores | `lib/reco.ts` |
| Señales leídas por el servidor, con fecha (parte pura y parte con red) | `lib/reco-senales.ts`, `lib/reco-senales-servidor.ts` |
| La ruta: lee señales y descartes con el token y suma todo a las exclusiones | `app/api/te-va-a-gustar/route.ts` |
| Claves `reco:v3` y `reco:cruce:v2.<excluidos>` | `lib/claves.ts` |
| Harness: captura, evaluación por etapas, costos y A/B | `scripts/reco-harness/` |

**Interruptores**, que no requieren cambiar código. En Vercel rigen recién
desde el deploy siguiente.

- `RECO_DIVERSIDAD=0`: vuelve entero al algoritmo anterior, con su propia
  clave de caché.
- `RECO_CRUCE_SIN_FAMILIA=0`: apaga sólo D2(a).

**Compatibilidad con Android**: no hubo ningún cambio de cliente. La 1.2.0, el
AAB 5 y la web mandan lo mismo de siempre. El servidor lee las señales y los
descartes con el token. Si esa lectura falla, usa las señales del cliente sin
rango y elige los orígenes como antes. Lo leído por el servidor **también** se
excluye (resguardo 1), y se conservan las exclusiones que manda el cliente.

### Desvíos respecto del plan rev. 2, encontrados al implementar

1. **La clave del riel se arma sobre las 12 candidatas, no sobre los 6
   orígenes elegidos.** Las candidatas y su orden salen sólo de peso y rango, y
   el MMR es determinístico sobre ellas. Así un HIT del riel no lee ningún
   perfil ni corre el MMR. Era el riesgo del resguardo 2, y está medido en §7.
2. **`reco:perfil` no subió de versión.** Las marcas infantil y animación se
   derivan de `generosPropios`, que la `v2` ya guarda.
3. **Las primeras 6 respetan la proporción del riel entero**, redondeada hacia
   abajo y con mínimo 1, en lugar del tope fijo de 2. Con el tope fijo, un
   único gusto infantil entre 6 ponía 2 infantiles arriba (P8).
4. **La regla de las primeras 6 no corta la pasada 1.** Si nadie la cumple, se
   toma el mejor que respeta los cupos de cantidad. Antes la pasada 2 completaba
   16 de 20 en P9.
5. **La pasada 2 completa primero desde el origen menos representado.** Por
   puntaje puro concentraba más que el algoritmo actual (P9: 13 de un origen
   contra 11). Con el cambio baja a 7.
6. **K = 10** en lugar de 6 (§8).

## 2. Antes / después por perfil [harness]

Mismos candidatos para las dos columnas, con 3 descartes inyectados por perfil
(los 3 primeros que mostraría el algoritmo actual). "actual" es el algoritmo
de Producción; "final" es el nuevo completo, con D2(a). Tabla completa por
etapa, con las primeras 6 tarjetas de cada lado:
`scripts/reco-harness/resultados.md`.

| perfil | plat. | tarjetas (elegibles) actual → final | máx. por origen | animación | infantil | primeras 6: anim / orígenes |
|---|---|---|---|---|---|---|
| P1 1 gusto: Los Simpson | n,d,m | 20 (22) → 20 (22) | 20 → 20 | 16 → 4 | 14 → **0** | 6/1 → 3/1 |
| P1 1 gusto: Los Simpson | n | 17 (17) → 19 (19) | 17 → 19 | 2 → 1 | 1 → 0 | 0/1 → 0/1 |
| P2 1 gusto: Breaking Bad | n,d,m | 20 (29) → 20 (29) | 20 → 20 | 0 → 0 | 0 → 0 | 0/1 → 0/1 |
| P2 1 gusto: Breaking Bad | n | 20 (23) → 20 (23) | 20 → 20 | 0 → 0 | 0 → 0 | 0/1 → 0/1 |
| P3 2 de animación adulta | n,d,m | 20 (47) → 20 (38) | 10 → 10 | 17 → 8 | 9 → **0** | 4/2 → 3/2 |
| P3 2 de animación adulta | n | 20 (27) → 20 (28) | 12 → 10 | 5 → 4 | 1 → 0 | 3/2 → 3/2 |
| P4 6 variados, Simpsons Petacular | n,d,m | 20 (49) → 20 (51) | 6 → 5 | 5 → 3 | 4 → **0** | 3/4 → **0/4** |
| P4 6 variados, Simpsons Petacular | n | 20 (39) → 20 (44) | 5 → 5 | 2 → 1 | 1 → 0 | 2/3 → 1/5 |
| P5 6 de crimen | n,d,m | 20 (52) → 20 (52) | 6 → 5 | 0 → 0 | 0 → 0 | 0/3 → 0/3 |
| P5 6 de crimen | n | 20 (45) → 20 (45) | 5 → 5 | 0 → 0 | 0 → 0 | 0/4 → 0/3 |
| P6 12 señales (6 crimen + 6 variadas) | n,d,m | 20 (48) → 20 (48) | 5 → 5 | 0 → 3 | 0 → 0 | 0/3 → 0/5 |
| P6 12 señales | n | 20 (41) → 20 (43) | 4 → 5 | 0 → 0 | 0 → 0 | 0/4 → 0/3 |
| P6b P6 + voto nuevo de crimen | n,d,m | 20 (53) → 20 (49) | 6 → 5 | 0 → 2 | 0 → 0 | 0/4 → 0/4 |
| P6b | n | 20 (40) → 20 (41) | 6 → 5 | 0 → 1 | 0 → 0 | 0/4 → 0/4 |
| P7 familiar (Bluey, Toy Story, Moana) | n,d,m | 20 (57) → 20 (57) | 10 → 7 | 19 → 13 | 16 → 11 | 5/2 → 3/3 |
| P7 familiar | n | 20 (29) → 20 (29) | 7 → 7 | 11 → 11 | 10 → 10 | 5/3 → 3/3 |
| P8 1 familiar + 5 adultos | n,d,m | 20 (51) → 20 (51) | 4 → 5 | 3 → 4 | 3 → 4 | 0/4 → 1/5 |
| P8 1 familiar + 5 adultos | n | 20 (42) → 20 (42) | 4 → 5 | 2 → 2 | 2 → 2 | 1/4 → 0/4 |
| P9 anime (AoT, Your Name, Chihiro) | n,d,m | 20 (48) → 20 (48) | 11 → 7 | 16 → 16 | 4 → 4 | 4/2 → 4/3 |
| P9 anime | n | 20 (42) → 20 (42) | 10 → 7 | 14 → 16 | 5 → 5 | 3/1 → 4/3 |

Lectura:

- **El caso del informe (P1, Los Simpson con n,d,m)**: de 16 animados y 14
  infantiles se pasa a 4 animados y 0 infantiles. El riel sigue en 20. Con un
  solo gusto, los cupos temáticos no aplican, por definición (§3 del plan): el
  riel sigue saliendo de Los Simpson, pero sin Frozen, Toy Story y similares.
- **P4, 6 variados con Los Simpson Petacular**: las primeras 6 pasan de 3
  animadas (todas infantiles) a 0. El máximo por origen pasa de 6 a 5.
- **P6, 12 señales**: hoy los 6 orígenes son de crimen y los otros gustos no
  aparecen. Con el nuevo, los orígenes cubren crimen, animación y otros temas, y
  hay 5 orígenes distintos entre las primeras 6.
- **No mejoró, o empeoró en algo**:
  - **P8 (1 familiar entre 6)**: la cantidad de infantiles sube de 3 a 4. Está
    dentro del cupo (4), con 1 en las primeras 6.
  - **P9 (anime)**: la animación queda en 16 de 20, contra 14 hoy con Netflix
    sola. Los tres gustos son animados, y lo que la pasada 2 completa es
    animación.
  - **P3 (2 gustos de animación)**: hay 8 animadas, pero con 2 gustos no hay
    cupo temático.

## 3. Comprobaciones [harness]

- **Descartados presentes: 0** en 120 corridas (10 perfiles × 2 combinaciones
  de plataformas × 6 variantes).
- **Infantiles sin origen infantil, con el guard activo: 0.**

## 4. Casos en que la pasada 2 completó por encima de los cupos [harness]

Solo con el algoritmo final:

| perfil | plat. | elegibles | completadas sin cupo | cupos (origen/anim/inf) | por qué |
|---|---|---|---|---|---|
| P7 familiar | n,d,m | 57 | 3 | 7/10/10 | los 3 orígenes son infantiles y animados: la oferta no animada no alcanza para que la animación quede en 10 |
| P7 familiar | n | 29 | 1 | 7/10/10 | lo mismo |
| P9 anime | n,d,m | 48 | 6 | 7/10/7 | los 3 orígenes son animados y uno (El viaje de Chihiro) es infantil; la oferta no animada no alcanza |
| P9 anime | n | 42 | 6 | 7/10/7 | lo mismo |

Las tarjetas completadas siempre van **después** de las que cumplen los cupos.
Esto aplica la decisión D1.

## 5. D2(a): qué pierde y qué gana [harness + captura real del cruce]

Comparado contra el cruce con la exclusión exacta (sin Kids hacia series y
nada hacia películas):

| origen | plat. | disponibles no infantiles: sin D2(a) → con D2(a) | películas familiares SIN animación perdidas |
|---|---|---|---|
| Los Simpson | n,d,m | 4 → 20 | 0 |
| Padre de familia | n,d,m | 17 → 20 | 0 |
| Ataque a los Titanes | n,d,m | 17 → 19 | 0 |
| Los Simpson | n | 17 → 20 | 0 |
| Padre de familia | n | 18 → 20 | 0 |
| Ataque a los Titanes | n | 20 → 20 | 0 |

- **Pérdida observada: 0 películas familiares sin animación**, en los 3
  orígenes animados de la muestra.
- **Sin D2(a), el caso del informe queda oculto**: P1 con n,d,m tiene 6
  elegibles, menos que el piso de 10 (variante `e2exacta` en `resultados.md`).
  Con D2(a) tiene 22.
- Límite: son 3 orígenes. Cuando aparezca en el riel una comedia familiar sin
  animación (*Paddington*, por ejemplo), esto se vuelve a medir.

## 6. Etapa por etapa [harness]

El detalle está en `scripts/reco-harness/resultados.md`, con una columna por
etapa:

| Columna | Qué cambia |
|---|---|
| `actual` | el algoritmo de Producción |
| `e2exacta` | + guard infantil, cruce exacto |
| `e2` | + D2(a) |
| `e3` | + selector en dos pasadas |
| `final` | + orígenes por recencia y MMR |
| `finalPoolActual` | el algoritmo nuevo sobre el pool del actual: aísla el ordenamiento del cambio de consulta |

Resumen:

- **El guard infantil** saca todos los infantiles de los perfiles sin gusto
  infantil.
- **El selector** baja el máximo por origen y la animación en las primeras 6.
- **El MMR** sólo cambia algo con más de 6 señales: P6 y P6b.

## 7. Costos medidos [real]

Un proceso por algoritmo, con caché en memoria y TMDB real. Las "operaciones
de caché" son los GET/MGET/SET que pidió el código: es lo que Upstash cobra por
comando. Tabla completa: `scripts/reco-harness/costos.md`.

| caso | actual: TMDB / operaciones de caché | nuevo: TMDB / operaciones de caché |
|---|---|---|
| P6, todo en frío | 115 / 186 | 127 / 181 |
| **P6, riel en caché** | **0 / 1** | **0 / 1** |
| P6 + 1 descarte (riel nuevo, fuentes calientes) | 0 / 8 | 0 / 9 |
| P6b, voto nuevo | 20 / 30 | 25 / 42 |
| P4 (riel nuevo, fuentes en parte calientes) | 90 / 159 | 29 / 63 ⚠️ |

- **Riel en caché (resguardo 2): igual que hoy**, 1 operación y 0 llamadas. La
  clave nueva no lee perfiles ni corre el MMR antes de encontrar el resultado.
- **En frío**: +12 llamadas a TMDB (+10%), porque se leen los perfiles de 12
  candidatas a origen en vez de 6. Las operaciones de caché quedan iguales,
  porque las lecturas van en lote.
- **Voto nuevo**: +5 llamadas y +12 operaciones de caché.
- ⚠️ **La fila de P4 no compara algoritmos.** Cada algoritmo arrastra el caché
  de sus pedidos anteriores, y el nuevo ya había calentado las fuentes de P4.
  Esa fila no se usa como evidencia.
- **Supabase (no medido, sale del código)**: +2 consultas por pedido del riel
  (`votes` y `user_items`), en paralelo con la validación del token y la lectura
  de descartes. Para medirlas hace falta una sesión real.

## 8. Parámetros elegidos

| Parámetro | Valor | De dónde sale |
|---|---|---|
| Cupo por origen | `ceil(T / min(n, 4))` | plan §3 |
| Cupo de animación e infantil | `min(ceil(T·max(orígenes del tema/n, 0.1)), ceil(T·0.5))`, con n ≥ 3 | plan §3 |
| Primeras 6 | ≤ 2 del mismo origen; animación e infantil ≤ `max(1, floor(6·cupo/T))`; con n ≥ 3 | desvío 3 |
| K (recencia) | 10 | calibración (§7 de `resultados.md`) |
| λ (MMR) | 1 | calibración |

**Calibración**: K ∈ {4, 6, 10} × λ ∈ {0,5; 1; 2} sobre P6 y P6b. Con
**K = 10 y λ = 1** los 6 orígenes cubren crimen, animación y otros temas, y el
voto nuevo de crimen desplaza a otro origen de crimen (El padrino).

Con K = 6 y λ = 1 desplazaba a Parásitos, un gusto de otro tema. Las pruebas
sintéticas de la rev. 2 decían lo contrario: **eso muestra que el
desplazamiento depende del caso**. Es **un solo perfil** con más de 6 señales.
La evidencia es débil y se revisa con datos reales.

Los porcentajes de los cupos **no se calibraron**: son los del plan, y su
efecto está en §2.

## 9. Pertinencia [harness]

- **Dejar uno afuera**: se oculta una señal y se mira si vuelve en el riel
  armado con las demás. Recupera 3 de 72 con el actual y 7 de 72 con el nuevo.
  Las dos cifras son bajas: es una medida gruesa, y TMDB rara vez recomienda un
  título que el usuario ya calificó. No prueba pertinencia; sólo indica que el
  nuevo no la empeora en esta medida.
- **A/B a ciegas**: 6 perfiles con n,d,m en `scripts/reco-harness/ab.md`.
  La llave está en `ab-llave.md`; abrila después de evaluar. La asignación A/B
  es aleatoria y balanceada (3 y 3).
- **Desplazamiento P6 → P6b**: el actual mantiene 12 de 20 tarjetas y saca
  Peaky Blinders. El nuevo mantiene 13 de 20 y saca El padrino.

## 10. Qué se verificó y qué queda pendiente

**Verificado:**

- `npx tsc --noEmit`: 0 errores.
- `npm test`: 2540 tests, 0 fallos. Incluye 14 tests nuevos del selector y del
  MMR, 3 de las señales del servidor, los guardianes de cableado y del
  inventario de `catch`, y las claves.
- Harness completo (§2 a §9) y costos reales (§7).
- **[local]** Servidor de desarrollo en el puerto 3130:
  - `/api/te-va-a-gustar` sin token responde 401;
  - con token inválido responde 401 `sin-sesion`;
  - el Home responde 200;
  - sin errores en los logs.

**Pendiente:**

- **El camino con sesión real no se probó.** La lectura de señales y descartes
  con el token, la RLS y la respuesta del riel en el navegador necesitan tu
  cuenta.
- Las consultas a Supabase no se midieron (§7).
- **El A/B a ciegas espera tu evaluación.**
- El título exacto descartado que reaparece **sigue siendo una investigación
  aparte**. Esta mejora no lo resuelve ni lo explica.
- `CLAUDE.md` y `ESTADO.md` se actualizaron en la rama. Se integran con el
  merge, que no está autorizado.

## 11. Cómo probarlo localmente

1. En `D:\DESARROLLO\stream central\wt-reco-diversidad`: el `.env.local` ya
   está copiado (no se versiona) y `node_modules` es un enlace al checkout
   principal.
2. Levantá el servidor. Desde el panel de vista previa de Claude es la
   configuración `reco-diversidad`, en el puerto 3130. Desde una terminal:
   `node --env-file=.env.local node_modules/next/dist/bin/next dev -p 3130`.
3. Abrí `http://localhost:3130`, entrá con tu cuenta y mirá "Elegidas para vos".
   Con `RECO_LOG=1` en el entorno, el servidor loguea la ventana y la línea
   `[reco:seleccion]`, con elegibles, cupos y completadas.
4. Para comparar con el algoritmo actual, levantalo con `RECO_DIVERSIDAD=0`.
   Para comparar sin D2(a), con `RECO_CRUCE_SIN_FAMILIA=0`.
5. Para regenerar la evaluación sin red:
   `node --import ./scripts/cargar-lib.mjs scripts/reco-harness/evaluar.mjs`.
   Para recapturar (usa TMDB):
   `node --env-file=.env.local --import ./scripts/cargar-lib.mjs scripts/reco-harness/capturar.mjs`.

⚠️ El servidor local usa la **base de Producción** (es la misma `.env.local`):
votar o descartar ahí escribe en tu cuenta real.
