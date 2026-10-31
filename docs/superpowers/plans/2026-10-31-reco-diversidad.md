# "Elegidas para vos" — plan cerrado de diversidad (2026-10-31)

**Estado: PLAN. Nada implementado ni desplegado.** Responde a la revisión del
dueño con Codex (31/10) sobre la propuesta del 30/10. Cada afirmación lleva su
tipo de evidencia: **[código]** leído en `main` (`ca02c4f`), **[medido]** con
TMDB real y el pipeline del repo, **[dueño]** informado, **[propuesta]**
todavía sin comprobar.

Objetivo del dueño: poder decir que me gusta algo sin que eso monopolice el
riel. Restricciones: sin servicios pagos nuevos y sin relleno genérico.

---

## 0. Lo comprobado hasta hoy

### 0.1 Cómo funciona hoy [código]

- **Historial disponible** (lo que lee el cliente, entero): todos los votos y
  todo `user_items`. **Señales** (`components/reco-entrada.ts`): de los 40
  votos más recientes, Petacular (peso 3) y Ta buena (peso 2); de los 200
  marcados más recientes, Mi lista (peso 1). Malaso, Ya la vi y descartes sólo
  excluyen.
- **Orígenes** (`elegirOrigenes`, `lib/reco-mezcla.ts`): deduplica y ordena
  por peso, con orden estable por fecha. O sea: los 6 Petacular más recientes;
  si faltan, los Ta buena más recientes, y después Mi lista. Un Petacular de
  hace 8 meses (dentro de los últimos 40 votos) le gana a un Ta buena de hoy.
- **Candidatos por origen**: `/recommendations` de TMDB (20, "mismo") + un
  `discover` del otro tipo con los géneros y keywords del origen (20, "cruce").
  Medido: 40 por origen.
- **Orden**: `ordenarTurnosPonderados` (Petacular 3 turnos por vuelta, Ta
  buena 2, Mi lista 1), ventana de 80, `enrichRaw` (plataformas), reorden y
  `mezclarTipos` (10 películas / 10 series alternadas). Piso de 10.
- **Filtros temáticos**: SÓLO el guard de anime (animación + idioma `ja`). No
  hay filtro de familia ni de animación. ⚠️ La tabla de `CLAUDE.md` dice que el
  recomendador "excluye animación": es falso y se corrige con este trabajo.
- **Descartes**: desde `50ebc93` el servidor los lee con el token y los
  excluye exactos. `user_items` guarda `tmdb_id`, `tipo`, `kind` y fecha: **no
  guarda de qué origen salió la tarjeta descartada**.

### 0.2 Mediciones [medido]

Riel real (`recomendaciones` de `lib/reco.ts`), n,d,m:

| Perfil | Animación | Del mismo origen | Primeras 4 |
|---|---|---|---|
| Solo Simpsons (Ta buena) | 16/20 | 20/20 | 4 dibujos |
| Simpsons Ta buena + 5 Mi lista | 6/20 | 7/20 | 2 dibujos |
| Simpsons Petacular + 5 Ta buena | 6/20 | 6/20 | 3 dibujos |

Pool completo antes de la ventana (`docs/medidas/2026-10-31-reco-pool-por-perfil.txt`,
`scripts/medir-reco-pool.mjs`):

| Perfil | Plat. | En plataforma | Infantil (cruce actual) | Queda si se filtra después | Queda si el cruce excluye familia al pedir |
|---|---|---|---|---|---|
| Simpsons | n,d,m | 25 | 18 | **7** (riel oculto) | **23** (2 infantiles) |
| Simpsons | n | 21 | 3 | 18 | 21 |
| Simpsons + Padre de familia | n,d,m | 50 | 20 | 30 | 40 |
| Bluey (infantil) | n,d,m | 29 | 24 | — | — (no aplica: el origen es infantil) |
| Breaking Bad | n,d,m | 32 | 0 | 32 | 32 |
| 3 de crimen | n,d,m | 74 | 0 | 74 | 74 |
| 3 de crimen | n | 67 | 0 | 67 | 67 |

Conclusión medida: **el exceso infantil sale del cruce**, y hay que cortarlo
**en el pedido**, no filtrando después; si no, a quien tiene un solo gusto
animado se le oculta el riel.

### 0.3 Qué distinguen los datos de TMDB [medido]

| Título | Géneros TMDB | Lectura |
|---|---|---|
| Los Simpson (serie) | 16, 35 | adulta según géneros; keywords `adult animation` **y** `kids` |
| Padre de familia, Rick y Morty, BoJack | 16 + 35 (+18/10765) | sin 10751 |
| Bluey, Peppa, Looney Tunes Show, Coop y Cami | incluyen **10762 (Kids)** | infantil |
| El rey de la colina, *A Different World*, Cuphead, Bob Esponja | incluyen **10751** sin 10762 | 10751 en series es ruidoso |
| Frozen, Toy Story 4, Zootrópolis y 8 más | 16 + **10751** | película animada familiar |
| Los Simpson: la película, Shrek | 16 + 10751 | caen como familiares (error conocido) |
| Sausage Party, Spider-Verse | 16 sin 10751 | animación adulta / no infantil |

- **10762 (Kids) existe sólo en series** y en la muestra es limpio.
- **10751 (Family) es ruidoso**: en series marca sitcoms; en películas, toda
  animación de estudio grande, también la que ven adultos.
- La **calificación por edad** (TV-14, ATP…) existe pero cuesta 1 llamada
  extra por candidato (`content_ratings`/`release_dates`): +80 por armado.
  **Se descarta.**
- Las **keywords** de los orígenes ya se piden (`perfilDe`) pero son
  contradictorias (Los Simpson tiene `adult animation` y `kids`). No sirven
  como regla.

---

## 1. Definiciones que usa todo el plan [propuesta]

- **Infantil (candidato)**: serie con 10762, o película con 16 **y** 10751.
  No usa 10751 solo en series (ruido medido). Errores aceptados: Los Simpson:
  la película y Shrek cuentan como infantiles.
- **Origen infantil**: el mismo criterio aplicado al origen.
- **Animación**: género 16.
- **Temas de una tarjeta**: los slugs de `genreIdsToSlugs(genre_ids)` más las
  marcas `animacion` e `infantil`. **Una tarjeta con varios géneros cuenta en
  cada tema que tiene** (criterio conservador: si no, una tarjeta "animación +
  comedia" se escaparía del cupo de animación).
- **Origen de una tarjeta**: su `porque` (mejor respaldo). Cuenta para **un
  solo** origen aunque tenga varios apoyos: los apoyos ordenan, no multiplican.
- **T** = cantidad objetivo = `min(20, elegibles)`. **Elegible** = en
  plataforma, no excluido, no descartado, y que pasa el guard infantil.
- **n** = orígenes productivos = orígenes con al menos 1 elegible.
- **Redondeo**: los cupos usan `ceil`. Un cupo nunca es menor que 1.

## 2. Selección de orígenes (punto 2 de la revisión) [propuesta]

**Problema [código]:** se eligen por peso y fecha. Seis gustos parecidos
ocupan los seis lugares, y diversificar después no los recupera. Un voto nuevo
de peso alto desplaza siempre al más viejo de su nivel, aunque sea de otro
tema.

**Propuesta: selección con relevancia marginal (MMR, Carbonell & Goldstein
1998), sobre un historial más ancho.**

1. **Historial considerado**: las 12 señales positivas de mayor
   `valor = peso + recencia`, donde la recencia baja linealmente de 1 (la más
   nueva) a 0 (la número 12). Con eso un Petacular viejo y un Ta buena nuevo
   compiten, en vez de ganar siempre el Petacular.
2. **Elección greedy de 6**: primero la de mayor valor; cada siguiente
   maximiza `valor − λ · similitud_máxima` contra las ya elegidas.
   `similitud` = Jaccard de géneros, + 1 si comparten la marca animación o
   infantil. λ arranca en 1 y se calibra (§7).
3. **Efecto de un voto nuevo**: entra a competir, pero si se parece a un
   origen ya elegido, desplaza a **ese** (el parecido) y no a un gusto de otro
   tema. Su peso en el riel queda acotado por el cupo por origen (§3).

**Costo:** para conocer los géneros de 12 señales hay que leer 12 perfiles en
vez de 6: **+6 lecturas de Upstash por armado** (`reco:perfil`, compartido
entre usuarios, TTL 24 h) y, si el perfil no está en caché, **+2 llamadas a
TMDB por título** (detalle + keywords), una vez cada 24 h por título. El armado
sólo ocurre cuando cambian las señales, los descartes o vence el TTL de 6 h.
Con 6 señales o menos no hay costo extra. Alternativa sin lecturas: guardar los
géneros al votar (migración + AAB nuevo para Android). Se deja para después.

## 3. Cupos (puntos 1 y 3) [propuesta, todos los números son hipótesis]

Se aplican **sobre las tarjetas finales**: después de plataformas y en el mismo
recorrido que la mezcla de películas y series. Concretamente, el
`mezclarTipos` actual se reemplaza por una **selección greedy única**: recorre
los elegibles en orden de puntaje y toma el siguiente del tipo que toca (como
hoy) **si no rompe ningún cupo**; si lo rompe, sigue con el siguiente.

**Cupo por origen**: `ceil(T / min(n, 4))`.

| n | Cupo por origen (T = 20) | Qué pasa |
|---|---|---|
| 1 | 20 | todo el riel sale de ese gusto (no hay otro: sin relleno) |
| 2 | 10 | mitad y mitad; si uno no llega, el otro completa (relajación) |
| 3 | 7 | |
| 4 o más | 5 (25%) | |

**Cupo de animación**: se aplica sólo con n ≥ 3.
`ceil(T · max(orígenes animados / n, 0.1))`, con techo `ceil(T · 0.5)`.
Ejemplo: 1 de 6 orígenes animado → `ceil(20 · 1/6)` = **4**.

**Cupo infantil**: la misma fórmula con orígenes infantiles. Un único gusto
familiar entre 6 → como mucho 4 infantiles. Con n ≤ 2 rige sólo el guard (§4).

**Por qué sólo animación e infantil**: es el problema medido. Un fan del
crimen con tres orígenes de crimen tiene que recibir crimen. Poner cupos a
todos los géneros sería otra hipótesis sin medición.

**Primeras 6 tarjetas**: como mucho 2 del mismo origen y como mucho 2 de
animación (si n ≥ 3). Es lo que se ve en el celular sin scrollear.

**Incompatibilidad o faltante**: si con los cupos no se llega a `min(T, 10)`,
se relajan **en este orden**, uno por vez, recalculando:
1. el cupo de las primeras 6;
2. el cupo de animación (al techo de 50%);
3. el cupo por origen (+1 por vuelta).

**Nunca se relajan**: el guard infantil, las exclusiones y los descartes. Si
aun así quedan menos de 10, el riel se oculta (motivo `filtrado`, como hoy) y
se loguea cuál cupo no se pudo cumplir. Según §0.2, ninguno de los perfiles
medidos llega a ese caso (el menor es Simpsons con Netflix sola: 21).

**Piso**: se mantiene en 10. **Decisión explícita**: con 1 o 2 gustos el riel
se muestra si hay ≥ 10 elegibles, y es inevitablemente "más de lo mismo".
Cambiar el título por "Porque te gustó X" para ese caso exige un AAB nuevo (el
título está en el cliente); queda como opción tuya, no incluida.

## 4. Animación adulta y contenido infantil (punto 4) [propuesta]

1. **En el pedido del cruce**: si el origen **no** es infantil, el `discover`
   del cruce se pide con `withoutGenres: [10751, 10762]` (el parámetro existe
   en `lib/tmdb.ts`). Medido: Simpsons pasa de 18 infantiles a 2 en su pool, y
   el disponible queda en 23.
2. **Guard sobre lo que viene por `/recommendations`**: un candidato infantil
   (§1) sólo entra si algún origen es infantil. Es el mismo patrón que el
   guard de anime.
3. **Cupo infantil** (§3): un único gusto familiar no domina el riel.

**Lo que esto NO distingue, con los datos gratuitos**: no se sabe la edad
apropiada. Una película animada "familiar" que ven adultos (Shrek, Los Simpson:
la película) se trata como infantil. Un adulto al que le gusta Toy Story la
habilita, porque Toy Story es infantil según la definición. Saber más exigiría
la calificación por edad (+80 llamadas por armado), descartada.

## 5. Descartes (punto 5) [propuesta revisada]

- **Se retira el rechazo temático** de la propuesta anterior. Tres descartes
  no demuestran que alguien rechace un género.
- **Los descartes históricos no se atribuyen a ningún origen**: hoy no hay
  procedencia guardada [código].
- **Propuesta opcional (fase 4), sólo si la querés**: guardar la procedencia
  hacia adelante.
  - **Qué**: dos columnas nulas en `user_items`, `origen_tipo` y `origen_id`,
    escritas sólo en `kind = 'dismissed'`.
  - **Para qué**: si en los últimos 30 días hay ≥ 2 descartes de tarjetas que
    salieron del mismo origen, el cupo de ese origen baja 1 por cada 2
    descartes, nunca por debajo de 1. Es una señal sobre **ese origen**, no
    sobre un género. Votar el origen de nuevo la neutraliza.
  - **Costo**: una migración; unos 12 bytes por descarte; 0 llamadas a TMDB y
    a Upstash; ninguna lectura nueva (viaja en la query de descartes que ya
    existe). El cliente ya tiene `porque` en la tarjeta. **Android 1.2.0 no
    escribe la procedencia hasta un AAB nuevo**: esos descartes siguen
    excluyendo exacto y no ajustan cupos.
  - **Hipótesis**: el umbral 2 y el paso de 1 se validan en §7.

## 6. Título descartado que reaparece (punto 6) — PENDIENTE

No está explicado. No encontré en el código un camino que vuelva a mostrar en
"Elegidas para vos" un título exacto descartado (el cliente lo filtra y, desde
`50ebc93`, el servidor lo excluye). Hipótesis a comprobar, sin dar ninguna por
buena:

- la misma obra cargada dos veces en TMDB (serie y película, o dos ids);
- el título visto en otro riel del Home (el descarte sólo aplica a este riel);
- el descarte no se guardó (fallo del INSERT);
- el título se vio antes del deploy de `50ebc93`, en un riel ya cacheado.

**Dato mínimo que necesito**: el **mail de la cuenta**, el **título** (o el
enlace de su ficha), **en qué riel** lo vio, **web o Android**, y **cuándo** lo
descartó y cuándo reapareció (aproximado). Con eso: buscar la fila del
descarte (tipo, id, fecha) con permiso tuyo para leer Producción, compararla
con la tarjeta mostrada, y revisar en los logs de Vercel si apareció
`[reco] no se pudieron leer los descartes`.

## 7. Validación sin medición circular (punto 7) [propuesta]

1. **Conjunto de candidatos fijo**: un script captura una sola vez, por
   perfil, el pool completo con géneros crudos, respaldo y disponibilidad por
   plataforma, a JSON. El orden actual y el nuevo corren **sobre el mismo
   JSON**: la diferencia es sólo del algoritmo. El cambio de fuente (cruce sin
   familia) se mide aparte, con dos capturas (pool actual vs pool nuevo).
2. **Perfiles**, cada uno con n,d,m y con Netflix sola:
   - 1 gusto: Los Simpson; 1 gusto: Breaking Bad.
   - 2 gustos de animación adulta (Los Simpson + Padre de familia).
   - 6 variados con Los Simpson Petacular.
   - 6 del mismo tema (crimen).
   - 12 señales (6 de crimen + 6 variadas) y después un voto nuevo de crimen:
     prueba de desplazamiento.
   - Familiar (Bluey + Toy Story + Moana) y familiar + 5 adultos.
   - Fan del anime (Attack on Titan + 2).
   - Con 5 descartes inyectados que están en el pool.
3. **Métricas, por perfil**:
   - cantidad final (contra `min(20, elegibles)`, no contra 10);
   - máximo de tarjetas de un mismo origen;
   - animación e infantil sobre el total y en las primeras 6;
   - orígenes y temas distintos en las primeras 6;
   - descartados presentes (tiene que ser 0);
   - desplazamiento: tarjetas que cambian al sumar un voto.
4. **Pertinencia, con dos medidas que el algoritmo no optimiza**:
   - **Dejar uno afuera**: se oculta una señal positiva y se mira si ese
     título aparece en el riel armado con las demás. Se compara la tasa de
     acierto vieja contra la nueva.
   - **Revisión a ciegas tuya**: por perfil, dos rieles sin rótulo (A/B al
     azar). Elegís el mejor o "iguales". Es la única medida directa de
     pertinencia con los datos que tenemos.
5. **Criterios de aceptación**:
   - 0 descartados;
   - 0 infantiles sin origen infantil;
   - cupos cumplidos o relajación logueada;
   - la cantidad final no cae más de 2 contra el actual cuando hay elegibles;
   - acierto de "dejar uno afuera" no peor que el actual;
   - revisión a ciegas: el nuevo gana o empata en la mayoría de los perfiles.

## 8. Claves de caché

| Clave | Cambia su contenido | Acción |
|---|---|---|
| `reco:cruce:` (cruce por origen y plataformas) | sí: `withoutGenres` | subir a `reco:cruce:v2:` |
| `reco:perfil:…v2` | sí, si suma las marcas infantil/animación | subir a `v3` |
| `reco:mismo:` | no (respuesta cruda de TMDB) | no se toca |
| `reco:…v2.<dv>:<huella>` (riel final) | sí | subir a `v3` |
| `pv3:`, `card:` | no | no se tocan |

**Costo de una sola vez tras el deploy** (compartido entre usuarios, por
título y por combinación de plataformas, durante 24 h): por origen, 1
`discover` del cruce (+1 de respaldo de idioma si hace falta) y 2 llamadas de
perfil. **Costo recurrente**: +6 lecturas de Upstash por armado sólo para
quien tiene más de 6 señales (§2); el enriquecido sigue acotado a la ventana de
80 (mismas `providersOf`). La selección con cupos es CPU. **Estos números son
cuentas sobre el código, no una medición**: se miden con el contador de
llamadas del script de §7 antes de mergear.

## 9. Etapas propuestas

1. Guard infantil + cruce sin familia + claves `cruce:v2` y `reco:v3` (§4,
   §8). Resuelve el caso Simpsons. Sin migración.
2. Selección greedy con cupos sobre las tarjetas finales (§3).
3. Selección de orígenes por MMR (§2).
4. Opcional: procedencia de descartes (§5), con migración y AAB.

En paralelo y aparte: investigación del §6, en cuanto llegue el dato.
Antes de la etapa 1: el harness de §7, para medir cada etapa contra el actual.

## 10. Límites que quedan

- El género de TMDB es una aproximación del gusto: dos thrillers pueden no
  tener nada que ver.
- Con 1 o 2 gustos el riel es, por construcción, más de lo mismo.
- 10751 es ruidoso. La regla infantil equivoca títulos como Shrek o Los
  Simpson: la película.
- No hay aprendizaje entre usuarios: no hay volumen medido que lo justifique.
- Todos los porcentajes son hipótesis hasta la validación de §7.
