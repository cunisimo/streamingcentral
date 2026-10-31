# "Elegidas para vos" — plan cerrado de diversidad (2026-10-31, rev. 2)

**Estado: PLAN. Nada implementado ni desplegado.** La rev. 2 corrige las
cuatro contradicciones que el dueño y Codex encontraron en `0d107c4`: la
prioridad entre cupos y cantidad, la fórmula de recencia, el alcance del filtro
infantil y el alcance de la medición. Cada afirmación lleva su tipo de
evidencia:

- **[código]**: leído en `main` (`ca02c4f`);
- **[pool]**: medición del pool de candidatos con TMDB real;
- **[sintética]**: prueba del prototipo, sin red;
- **[dueño]**: informado por el dueño;
- **[propuesta]**: todavía sin comprobar.

Objetivo del dueño: poder decir que me gusta algo sin que eso monopolice el
riel. Restricciones: sin servicios pagos nuevos y sin relleno genérico.

Puntos ya cerrados que esta revisión no reabre:

- rechazo temático retirado;
- descartes históricos sin procedencia;
- procedencia futura opcional;
- versionado de cachés.

---

## 0. Lo comprobado

### 0.1 Cómo funciona hoy [código]

- **Historial disponible**: el cliente lee todos los votos y todo `user_items`.
- **Señales** (`components/reco-entrada.ts`): de los 40 votos más recientes,
  Petacular (peso 3) y Ta buena (peso 2); de los 200 marcados más recientes,
  Mi lista (peso 1). El cliente las manda como `{tipo, id, peso}`, **sin
  fecha**. Se conserva el orden por recencia dentro de cada nivel, pero no
  entre niveles.
- **Orígenes** (`elegirOrigenes`): por peso y después por orden de llegada.
  Salen los 6 Petacular más recientes; si faltan, los Ta buena, y después Mi
  lista.
- **Cruce** (`cruzadosDe` → `discover`): `with_genres` se arma con `|`, o sea
  **O**, no **Y** (`lib/tmdb.ts`). El cruce de Los Simpson pide "animación **o**
  comedia".
- **Filtros temáticos**: sólo el guard de anime. ⚠️ `CLAUDE.md` dice que el
  recomendador excluye animación: es falso. Se corrige junto con este trabajo.
- **Descartes**: exclusión exacta en el servidor desde `50ebc93`, sin
  procedencia.

### 0.2 Qué demuestra cada medición, y qué no

**Riel final actual [código + TMDB real]**: `recomendaciones()` con las
señales de prueba, n,d,m. Con Los Simpson como única señal salen 16 de 20 en
animación, 20 de 20 del mismo origen y 11 películas animadas familiares. Con
Los Simpson Petacular más 5 Ta buena salen 6 de 20 en animación, 3 de ellas
entre las primeras 4.

**Pool [pool]** (`docs/medidas/2026-10-31-reco-pool-por-perfil.txt`): son los
candidatos de `/recommendations` más el cruce, con su disponibilidad en
plataforma. **No** pasa por el guard de anime, ni por las exclusiones del
usuario, ni por la ventana de 80, ni por cupos ni por la mezcla. Lo que
**sí** respalda:

- el exceso infantil de Los Simpson viene del cruce (18 de 25 disponibles con
  n,d,m);
- cortarlo **en el pedido** deja 23 disponibles; filtrar **después** deja 7.

Lo que **no** demuestra: cuántas tarjetas tendrá el riel final ni si algún
perfil queda oculto. Sus cifras son **cotas superiores**. ⚠️ La rev. 1 decía
que ningún perfil medido quedaba oculto: **queda retirado**. Está pendiente de
la validación final (§7).

**Pruebas sintéticas [sintética]** (§6): demuestran las reglas del selector y
de la elección de orígenes sobre datos inventados. No dicen nada sobre la
calidad de las recomendaciones.

### 0.3 Qué distinguen los datos gratuitos de TMDB [pool]

- **Kids (10762)**: existe sólo en series y en la muestra es limpio (Bluey,
  Peppa, Looney Tunes Show, Coop y Cami).
- **Family (10751)**: es ruidoso. Lo tienen sitcoms como *A Different World* y
  El rey de la colina, y películas como Shrek o Los Simpson: la película.
- Las 11 películas infantiles que trajo Los Simpson tienen todas 16 + 10751.
- La serie Los Simpson tiene 16 + 35, sin 10751.
- La calificación por edad cuesta 1 llamada extra por candidato. Queda
  descartada.

---

## 1. Tres categorías que no se mezclan [propuesta]

| Categoría | Definición (sólo datos gratuitos) | Tratamiento |
|---|---|---|
| **Infantil** | serie con 10762, o película con 16 **y** 10751 | **regla dura** si ningún origen es infantil (§4); **cupo blando** si alguno lo es |
| **Familiar** | 10751 que no cumple lo de arriba (sitcom familiar, película familiar sin animación) | **sin regla ni cupo**: compite como cualquier título |
| **Animación** | 16 | **cupo blando**, sólo con n ≥ 3 |

Errores aceptados de la definición infantil: Shrek y Los Simpson: la película
cuentan como infantiles.

## 2. Selección de orígenes [propuesta, parámetros a calibrar]

### 2.1 Qué estaba mal en la rev. 1

Con `valor = peso + recencia`, con la recencia entre 0 y 1, un Petacular queda
siempre entre 3 y 4 y un Ta buena entre 2 y 3. La recencia sólo empataba en los
extremos y nunca invertía el orden. **Retirada.**

### 2.2 Fórmula revisada

`valor = peso − rango / K`, donde:

- `rango` es la posición por recencia entre **todas** las señales positivas
  (0 = la más nueva);
- `K` = cuántos puestos de recencia equivalen a un punto de peso. Con `K = 6`,
  un Ta buena nuevo empata con un Petacular 6 puestos más viejo y le gana a uno
  7 puestos más viejo. Comprobado en la prueba sintética.
- Desempates, en este orden: más reciente, y después `tipo:id`.

**`K` es un parámetro, no un resultado.** Se calibra en §7 con los valores 4,
6 y 10.

Sobre las 12 señales de mayor `valor` se aplica **MMR**: cada elección
maximiza `valor − λ · similitud máxima con las ya elegidas`, donde la similitud
es el Jaccard de géneros + 1 si las dos son animación. `λ` también se calibra.

### 2.3 Qué desplaza un voto nuevo — observado, no garantizado [sintética]

Partida: 3 orígenes de crimen, Los Simpson, comedia y sci-fi, todos Ta buena.

- **Voto nuevo de crimen (Petacular)**: sale **crimen3**. Quedan los otros dos
  de crimen, Los Simpson, comedia y sci-fi.
- **Voto nuevo de romance (Ta buena)**: también sale **crimen3**, el más
  redundante, y no sci-fi, que es el más viejo.

Es lo que el diseño busca, pero **es el resultado de dos casos sintéticos, no
una garantía**. Con otros géneros o pesos, MMR puede sacar otro origen. La
validación final (§7) mide el desplazamiento real con perfiles de 12 señales.

### 2.4 De dónde salen las fechas, y compatibilidad con Android

**Problema**: el cliente manda las señales sin fecha. Cambiar el cliente no
alcanza: la 1.2.0 en Producción y el **AAB 5, ya enviado a revisión**, tienen
el bundle local actual y van a seguir mandando lo de hoy.

**Propuesta: el servidor lee las señales él mismo**, con el token del usuario,
igual que ya hace con los descartes desde `50ebc93`. Son dos consultas en
paralelo:

- `votes`: los 40 más recientes, con `rating` y `created_at`;
- `user_items`: los 200 más recientes con `kind = 'list'`, con `created_at`.

Con eso calcula `rango` sin depender del cliente:

- **Compatibilidad**: funciona igual con la 1.2.0, con el AAB 5 y con la web.
  No hace falta AAB nuevo.
- **Si la lectura falla**: usa las señales que manda el cliente y vuelve a la
  regla de hoy (por peso, sin recencia entre niveles). Se loguea.
- **Exclusiones**: se siguen tomando del cliente (`excluir`) como hoy, más los
  descartes que lee el servidor.
- **Caché**: la huella del riel final pasa a calcularse sobre **los 6 orígenes
  elegidos con su peso**, las exclusiones y las plataformas, no sobre todas las
  señales. Un voto nuevo que no cambia la elección ya no rearma el riel; uno que
  la cambia sí, igual que hoy.
- **Costo**: +2 consultas a Supabase por pedido del riel, en paralelo con la
  validación del token. 0 llamadas a TMDB. Las lecturas de Upstash para 12
  perfiles están en §8.

## 3. Cantidad, disponibilidad y diversidad: qué gana cuando chocan [propuesta]

### 3.1 La regla de prioridad

1. **Reglas duras**, que nunca se relajan:
   - plataformas;
   - exclusiones del usuario;
   - descartes;
   - guard de anime;
   - guard infantil, cuando ningún origen es infantil.
2. **Cantidad**: `T = min(20, elegibles)`. El riel **se muestra si elegibles ≥
   10**. El piso se mide sobre los elegibles, **no sobre lo que dejan los
   cupos**.
3. **Diversidad**: los cupos deciden **qué entra primero y en qué posición**,
   pero **nunca dejan el riel por debajo de T**.

### 3.2 El procedimiento, en dos pasadas

- **Pasada 1, con cupos**: se recorre por puntaje alternando película y serie,
  y se toma lo que cumple todos los cupos. Los cupos son estos:

  | Cupo | Valor | Cuándo |
  |---|---|---|
  | Por origen | `ceil(T / min(n, 4))` | siempre |
  | Animación | `min(ceil(T · max(a/n, 0.1)), ceil(T · 0.5))` | con n ≥ 3 |
  | Infantil (blando) | la misma fórmula con los orígenes infantiles | con n ≥ 3 |
  | Primeras 6 | ≤ 2 del mismo origen y ≤ 2 de animación | con n ≥ 3 |

- **Pasada 2, sin cupos**: si la pasada 1 no llegó a T, completa **hasta T**,
  no hasta 10, con lo que sobró, por puntaje, alternando tipos. Lo que entra
  acá **va después** de lo de la pasada 1: las primeras posiciones quedan para
  la oferta diversa.

### 3.3 Qué cambia respecto de la rev. 1

- Ya no hay una cadena de relajaciones que se corta en 10. Todos los cupos
  blandos, incluido el infantil, se relajan juntos en la pasada 2.
- El caso de Codex (3 orígenes animados y 12 elegibles, todos animados) muestra
  **12 tarjetas**: la diversidad no existe en la oferta, y no se inventa.
- La regla "primeras 6" sólo rige con n ≥ 3. Con 1 o 2 orígenes no se puede
  cumplir: lo encontró la prueba sintética.

**Consecuencia que hay que aceptar** (decisión D1, §9): cuando toda la oferta
válida es de un solo tema, el riel es de ese tema.

## 4. Alcance del filtro infantil [propuesta]

### 4.1 La contradicción de la rev. 1

El pedido del cruce excluía 10751 para cualquier origen no infantil. Como
`with_genres` es **O** (§0.1), eso también sacaba sitcoms y películas
familiares sin animación, que son "familiar" y no "infantil" según §1.

### 4.2 Reglas alineadas

1. **Guard infantil (regla dura)**: si ningún origen es infantil, se descarta
   todo candidato infantil según §1, venga de `/recommendations` o del cruce. Se
   aplica sobre los géneros crudos, que ya están en el candidato: 0 llamadas.
2. **Cruce hacia series** (origen película): se pide con `without_genres=10762`.
   Coincide **exactamente** con la definición infantil en series.
3. **Cruce hacia películas** (origen serie): TMDB no permite excluir "16 **y**
   10751" en una sola consulta. Hay dos opciones; es la decisión **D2**:
   - **(a) Excluir 10751 en el pedido, sólo si el origen es animado y no
     infantil.**
     - A favor: según el pool, a Los Simpson le quedan 23 disponibles en vez
       de 7.
     - En contra: ese cruce también pierde películas **familiares sin
       animación**, que no son infantiles. El alcance se acota a un origen
       animado. Lo familiar sigue pudiendo llegar por `/recommendations` y por
       los otros orígenes.
     - Cuánto se pierde de verdad: no está medido. Se mide en §7.
   - **(b) No excluir en el pedido, y pedir una segunda página del cruce**
     cuando el guard deja ese cruce con menos de 10 disponibles.
     - A favor: respeta la definición exacta.
     - En contra: +1 `discover` por origen animado (en caché 24 h, compartido),
       y no está medido si la segunda página trae suficientes no infantiles.

### 4.3 Un gusto familiar no domina

Con al menos un origen infantil el guard se apaga y rige el cupo infantil
blando de §3. Un solo gusto infantil entre 6 da hasta `ceil(20 · 1/6)` = 4
infantiles **si hay otra oferta**. Si no la hay, gana la cantidad (§3.1).

## 5. Descartes — sin cambios respecto de la rev. 1

- Exclusión exacta.
- Sin rechazo temático.
- Los descartes históricos no se atribuyen a ningún origen.
- Procedencia futura opcional: 2 columnas en `user_items`. Las versiones de
  Android ya instaladas no la escriben.

La investigación del título exacto que reaparece **sigue pendiente**. El dato
mínimo es:

- el mail de la cuenta;
- el título o el enlace a su ficha;
- en qué riel lo vio;
- si fue en la web o en Android;
- cuándo lo descartó y cuándo reapareció, aproximado.

Además hace falta tu permiso explícito para leer Producción.

## 6. Pruebas sintéticas del prototipo [sintética]

`scripts/prototipo-reco/seleccion.mjs`: prototipo **no conectado a la app**.
Pruebas en `seleccion.test.mjs`; se corren con
`node --test scripts/prototipo-reco/seleccion.test.mjs`. Sin red. **12 de 12
pasan.**

| Caso | Resultado |
|---|---|
| 3 orígenes animados, 12 elegibles todos animados | visible, **12** tarjetas (la pasada 2 completa) |
| 9 elegibles | oculto |
| 1 origen, 23 elegibles | 20, todas de ese origen, sin pasada 2 |
| 2 orígenes, uno con 3 candidatos | 20: 3 de uno y 17 del otro |
| 6 orígenes, 1 animado con oferta grande y puntaje alto | 20; animación = 4 (cupo); ≤ 2 animadas entre las primeras 6 |
| 14 diversos + 10 animados | **20**, no 10; los que entran sin cupo quedan al final |
| 1 origen infantil entre 6, con oferta adulta suficiente | infantiles ≤ cupo |
| Primeras 6 con un origen dominante | ≤ 2 de ese origen |
| Recencia K = 6: Ta buena nuevo contra Petacular 7 puestos más viejo | gana el Ta buena |
| Recencia K = 6: contra Petacular 5 puestos más viejo | gana el Petacular |
| MMR, voto nuevo de crimen | desplaza a crimen3 (observado) |
| MMR, voto nuevo de romance | desplaza a crimen3 (observado) |

Bug que la prueba encontró en el prototipo y ya está corregido: la regla de
las primeras 6 aplicada con 1 origen forzaba la pasada 2.

## 7. Validación final — pendiente, sin cambios de método

- **Candidatos fijos en JSON**: el pipeline completo (guard de anime,
  exclusiones, ventana de 80, enriquecido, cupos y mezcla) corre viejo contra
  nuevo sobre los mismos datos.
- **Perfiles** con n,d,m y con Netflix sola:
  - 1 gusto;
  - 2 de animación adulta;
  - 6 variados con Los Simpson;
  - 6 del mismo tema;
  - 12 señales más un voto nuevo;
  - familiar, y familiar + adultos;
  - fan del anime;
  - descartes inyectados.
- **Métricas**:
  - cantidad contra `min(20, elegibles)`;
  - máximo por origen;
  - animación e infantil, en total y en las primeras 6;
  - orígenes y temas distintos en las primeras 6;
  - descartados presentes;
  - desplazamiento al sumar un voto;
  - con la opción (a) de D2: películas familiares sin animación que se pierden.
- **Pertinencia**: dejar uno afuera, y la revisión a ciegas del dueño (A/B sin
  rótulo).
- **Calibración**: `K` en {4, 6, 10} y `λ` en {0,5; 1; 2}.
- **Criterios de aceptación** (alineados con §3.1):
  - 0 descartados;
  - 0 infantiles sin origen infantil;
  - **el riel se muestra si y sólo si hay ≥ 10 elegibles**;
  - cantidad = `min(20, elegibles)`;
  - los cupos se cumplen salvo cuando la oferta no alcanza, y entonces la
    pasada 2 queda registrada;
  - "dejar uno afuera" no peor que hoy;
  - en la revisión a ciegas el nuevo gana o empata en la mayoría.

## 8. Claves de caché y costos

| Clave | Acción |
|---|---|
| `reco:cruce:` | subir a `v2` (cambia el pedido) |
| `reco:perfil:…v2` | subir a `v3` (marcas infantil y animación) |
| `reco:mismo:` | no se toca |
| riel final | subir de versión; la huella pasa a calcularse sobre los orígenes elegidos (§2.4) |
| `pv3:`, `card:` | no se tocan |

**Costos**, que son cuentas sobre el código y se miden con el contador del
harness antes de mergear:

- **Supabase**: +2 consultas por pedido del riel (§2.4).
- **Upstash**: +6 lecturas de `reco:perfil` por armado, sólo con más de 6
  señales.
- **TMDB**:
  - por cada perfil que no está en caché, 2 llamadas, una vez cada 24 h por
    título;
  - después del deploy, 1 `discover` de cruce por origen y plataformas;
  - con la opción (b) de D2, +1 `discover` por origen animado.
- **Enriquecido**: sin cambios, sigue con ventana de 80.

## 9. Decisiones que necesitan tu elección

- **D1 — Cantidad o diversidad, cuando la oferta válida es de un solo tema.**
  - **Recomendada: cantidad.** El riel se muestra con lo que hay, porque es
    contenido válido para tu gusto.
  - Alternativa: ocultar el riel si los cupos no se cumplen con al menos 10.
    Vuelve a ocultarlo con contenido válido, que es lo que objetaste.
- **D2 — El cruce hacia películas desde un origen animado.**
  - **Recomendada: (a)**, excluir Family en el pedido, aceptando que se pierden
    películas familiares sin animación en ese cruce. Se mide cuántas en §7 y,
    si son muchas, se pasa a (b).
  - Alternativa: **(b)**, segunda página, sin pérdida y con +1 llamada.
- **D3 — Etapa 4, la procedencia de los descartes.** Sí o no. No bloquea nada
  de lo demás.

Los valores de `K`, `λ` y los porcentajes de los cupos **no son decisiones
tuyas todavía**: son parámetros que se calibran en §7, y se te muestran con los
resultados.

## 10. Etapas

1. Harness de §7: candidatos fijos y métricas, con el algoritmo actual como
   base.
2. Guard infantil + cruce según D2 + `cruce:v2`, `perfil:v3` y la versión del
   riel final.
3. Selector en dos pasadas (§3).
4. Lectura de señales en el servidor + recencia + MMR (§2).
5. Opcional: procedencia de descartes (D3).

Cada etapa se mide contra la anterior con el harness antes de pasar a la
siguiente.

## 11. Límites que quedan

- El género de TMDB es una aproximación del gusto.
- Con 1 o 2 gustos el riel es, por construcción, más de lo mismo.
- La definición infantil equivoca títulos como Shrek.
- Los resultados de MMR son observados en casos sintéticos, no garantizados.
- No hay aprendizaje entre usuarios.
