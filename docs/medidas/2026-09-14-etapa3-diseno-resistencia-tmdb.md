# Etapa 3 de capacidad — Resistencia frente a TMDB: auditoría y diseño (v4.1)

> **Estado: DISEÑO v4.1 + ETAPA 3.a IMPLEMENTADA EN RAMA Y CORREGIDA cinco
> veces (auditorías de Codex sobre `e930a1d` §23, `09b9dbe` §24, `708bce0`
> §25, `03ad4b9` §26 y `6ef35c5` §27); corregida en rama, pendiente de
> auditoría FINAL. No está terminada.
> Reintentos apagados (`TMDB_REINTENTOS` ausente).
> Limitador, cadencias, pausa distribuida, AIMD/circuito, `waitUntil`,
> `COMPOSICION_MAX_MS` y membresía: NO implementados.** La auditoría de Codex
> sobre la v4 (`d76f0ce`) consideró aprobable únicamente la sub-etapa segura
> 3.a; la rama es `feat/etapa3a-clasificacion-tmdb` (fork `main` = `b7be927`).
> Sin merge, push ni deploy.
> **Restricción del dueño (14/09): la Etapa 3 no puede alterar el contenido
> correcto del Home.** v1 `a15b650` → v2 `209bda1` → v3 `ced36de` → v4
> `d76f0ce` → v4.1 (este commit: cuatro correcciones de la auditoría sobre la
> v4, §0.4). Sin cambios de código, sin ramas de código, sin merge, push ni
> deploy, **sin llamadas reales a TMDB**. Vive en la rama de documentación
> `diseno/etapa3-resistencia-tmdb` (worktree `wt-etapa3`), fork de
> `main = origin/main = b7be927`.
>
> Issue que ataca: **#19**. Lo que NO toca: CDN y límites por ruta (Etapa 4),
> observabilidad histórica (#20, Etapa 5). Las respuestas a las auditorías de
> la v1 (13 puntos) y de la v2 (8 puntos) están en `209bda1` §0 y `ced36de`
> §0; siguen vigentes salvo donde esta v4 las corrige.

---

## 0. Respuesta punto por punto

### 0.1 A la decisión del dueño

| Exigencia | Cómo la cumple la v4 | Dónde |
|---|---|---|
| Con TMDB sano, el Home conserva hero, títulos, orden, cantidad, dedup, plataformas, badges, enlaces, toggles, contenido por fecha/plataformas/tipos, contrato JSON | **Criterio bloqueante §1**: ninguna sub-etapa toca `composeHome`, los rieles, los pools ni `toUITitle`; el limitador, el circuito y la pausa sólo cambian **cuándo** salen las llamadas, no **qué** devuelven; H2 y la cancelación sólo evitan **publicar** payloads incorrectos. Banco obligatorio de diferencia cero (§14) | §1, §11, §14 |
| Ante una caída, preferir el último Home correcto | Ya es la Etapa 2 (UB); la v4 la extiende: un payload con descartes parciales de causa TMDB **no se publica** (H2), una composición cancelada no publica, y la reconstrucción diferida publica sólo si terminó completa | §1, §11 |
| Ninguna reducción de llamadas aprobada por tiempos | La **membresía por pool (A) queda NO aprobada**; la medición pasa a ser un **gate de descarte con criterio de diferencia cero** (§12); A' sólo si preserva exactamente títulos, orden y disponibilidad; si no, se descartan ambas y la capacidad se resuelve **sin tocar el Home** | §12 |
| Corregir "frecuencia relevante" y "40 % calibrado" | Corregido en H16 y en todas sus menciones: el margen del 40 % **prueba que el código contempla descartes posibles; no dice nada de su frecuencia**, que sigue **desconocida** | §3 |
| Las ~300 llamadas reales siguen prohibidas | No ejecutadas; el gate se diseña primero como comparación aislada y reproducible en el banco (§12.1) y sólo después, con autorización expresa, contra TMDB real | §12 |

### 0.2 A la auditoría de Codex sobre la v3

| # | Objeción | Qué cambia en la v4 | Dónde |
|---|---|---|---|
| 1 | La demostración de la cadencia no contempla latencias de Redis distintas por proceso: una ranura anterior recibida tarde y una posterior recibida rápido se reordenan o se juntan; la gracia sólo cubría el permiso local | **Cierto, y la v3 lo afirmaba mal.** La v4 separa tres instantes por reserva —`tReservaRedis` (del `TIME` del script), `tRecepcion` (local) y `tFetch` (real)— y demuestra sólo lo demostrable: la cota **sobre reservas** es exacta (`tat` global); la cota **sobre inicios de `fetch`** vale únicamente bajo un supuesto **verificable localmente**: `RTT ≤ RTT_TOPE` por reserva (el proceso mide `tRecepcion − tEnvio` y **quema** las ranuras de una reserva que llegó tarde: "ranuras absolutas con vencimiento verificable"). Bajo ese supuesto, emisión ∈ `[ranura, ranura + RTT_TOPE + gracia]` y la cota móvil es `⌊(W + RTT_TOPE + gracia) / T⌋ + 1`. **No se afirma ninguna cota sobre `fetch` fuera de ese supuesto**; E-latencia-asimetrica (5 / 30 / 150 / 300 ms, tres procesos) la mide sobre los inicios reales | §8.3-§8.5, §15 |
| 2 | Comparar limitador conservador, GCRA sin lotes, ranuras absolutas con vencimiento, confirmación final, coordinador único | Tabla con complejidad, costo en `EVAL`, latencia y **garantía real** (§8.2). Recomendación: **contrato práctico y honesto** — tasa conservadora **28/s** (T = 35,7 ms), ranuras absolutas con vencimiento verificable, ráfaga máxima **medida** en el banco sobre `fetch` reales, circuito, pausa compartida y reacción inmediata al 429. Sin suponer relojes sincronizados (sólo duraciones) ni latencia máxima de Redis (se verifica por reserva y se quema lo que no cumple) | §8.2, §8.3 |
| 3 | El horizonte (interactiva 1 s adelante, masiva 250 ms) puede dejar al Home sin ranuras bajo tráfico interactivo sostenido; el W:1 local no arregla la exclusión en Redis | Rediseñado: **dos cadencias en el script, una por clase, cada una con la mitad de la tasa** (`T₂ = 2T`), con **préstamo** de la cadencia ajena sólo cuando está ociosa (`tat_ajeno ≤ ahora`) y acotado al horizonte de préstamo (250 ms). Garantía **global y demostrable**: cada clase obtiene **≥ tasa / 2** cuando lo demanda, sin importar cuántas instancias ni cuánto tráfico haya de la otra; y la espera de la primera ranura tras demandar es **≤ 250 ms + T₂**. Sin inanición posible por construcción | §8.4, §9 |
| 4 | Separar espera detrás de masivas, detrás de otras fichas y total bajo saturación | Tres cotas distintas (§9.2): detrás de masivas ≤ 250 ms + T₂ (préstamo acotado); detrás de otras interactivas: FIFO en su cadencia, ≤ horizonte interactivo (1 s) + lote (porque el horizonte impide empujar `tat_int` más allá); total bajo saturación: suma + permiso local + latencia de Redis. E2 mide las tres por separado | §9.2, §15 |
| 5 | `t(N) ≈ N·C/tasa + L` sólo vale sin tráfico interactivo | Reescrito como modelo de **tráfico mixto** (§5.2): la capacidad masiva es `s_m = tasa − min(λ_i, tasa / 2)` y dentro de ella el Home compite FIFO con el resto de lo masivo (relacionados de fichas, `providersOf` de búsquedas, cards). Escenario E-mixto con Homes + fichas + búsquedas simultáneos y el resultado honesto: bajo carga mixta sostenida el Home frío **no se reconstruye a tiempo**; sirve UB mientras exista, y la v4.1 (§5.5) deja escrito que eso **no es una solución completa** | §5.2, §5.3, §5.5, §15 |
| 6 | Conservar lo válido de la v3 | Conservado y listado en §0.3 | — |

### 0.3 Lo que se conserva de la v3 sin cambios

3.a se despliega con reintentos apagados; nadie retiene permisos durante
pausas ni esperas de tasa; tasa y concurrencia se miden por separado; la tasa
de Vercel no es el límite de la cuenta; se modelan varias composiciones;
siguen como gates Upstash (`TIME` en `EVAL`), `waitUntil`, Vercel (plan,
Fluid, duración) y los tokens; los fallos parciales se marcan como degradación
(H2, once sitios); la ficha distingue dato principal (`503`) de contenido
opcional (`degradacion`).

### 0.4 A la auditoría de Codex sobre la v4 (correcciones de la v4.1)

| # | Objeción | Qué cambia | Dónde |
|---|---|---|---|
| 1 | Con cadencia mínima masiva de 14/s, `926 / 14 = 66,1 s` + latencia supera los ~55 s de `waitUntil`: una reconstrucción fría puede cancelarse **repetidamente con TMDB sano**; "sirve UB hasta que baje la carga" no es solución completa (el UB vence a las 36 h; una combinación nueva no tiene UB) | **§5.5 nuevo**: análisis del vencimiento del UB, de la combinación nueva, del riesgo de Home vacío, y la **condición que deberá cumplir el futuro limitador** (garantizar al menos una reconstrucción completa dentro del presupuesto: `C_max / s_reconstruccion ≤ presupuesto_fondo`, con un mecanismo de prioridad de reconstrucción). §5.3 y §5.4 reescritos sin esa afirmación | §5.3-§5.5 |
| 2 | El comparador puede dar falso "diferencia cero" si las dos versiones comparten Redis con la misma `VERSION_HOME` | **§14 reescrito**: instancias/namespaces de Redis separados, caché vacía independiente por corrida fría, calentamiento independiente, evidencia `[home] compone` y de llamadas TMDB en las dos versiones, separación de turno/fresca/UB/degradado/generación/cards/pools, y **control** que comparte deliberadamente la caché y demuestra que el validador lo rechaza | §14 |
| 3 | Falta "Redis lento sostenido": con tres vencimientos consecutivos en tres procesos, el respaldo local de 14/s por proceso puede emitir 42/s; el escenario rotativo 5/30/150/300 lo esconde | **E-redis-lento-sostenido** en §15 y §8.6 corregido: el respaldo local **no garantiza** el total (14 × instancias); se declara y se mide | §8.6, §15 |
| 4 | Con préstamo, una solicitud masiva emite por las dos cadencias físicas; "por clase ≤ 18" es falso | **§8.3 y §9.1 reescritos**: la garantía de tasa se expresa sobre **cada cadencia física** (≤ 18 por segundo móvil bajo (b)), sobre el **total global** (≤ 36) y como **progreso mínimo reservado por clase cuando ambas tienen demanda** (≥ 14/s). No se afirma que los `fetch` de una clase estén acotados a una cadencia | §8.3, §9.1 |

---

## 1. La restricción del dueño como criterio bloqueante

**Enunciado.** Con TMDB funcionando, cualquier implementación de la Etapa 3
produce, para la misma fecha argentina, las mismas plataformas y los mismos
toggles, un payload de `/api/home` **estructuralmente idéntico** al de
`b7be927` en: (1) ids del hero, (2) ids de cada riel, (3) orden dentro de
cada riel, (4) cantidad de tarjetas, (5) deduplicación global, (6)
`platforms` de cada título, (7) enlaces y datos de disponibilidad, (8)
toggles y combinaciones, (9) contenido por fecha/plataformas/tipos, (10)
contrato JSON — salvo **campos aditivos de diagnóstico** que un cliente viejo
ignora. Ante una caída, se sirve el último Home correcto antes que uno
mutilado.

**Cómo lo garantiza el diseño, por mecanismo:**

| Mecanismo | ¿Toca la selección del Home? | Qué cambia | Cómo se prueba que no cambia el contenido |
|---|---|---|---|
| Clasificación, métricas, `503`/`degradacion` en ficha (3.a) | no | sólo diagnóstico y códigos de error de rutas que no son el Home | comparador §14 = 0 diferencias |
| H2: descartes parciales → degradado → no se publica | no | **evita publicar** un Home incorrecto; el correcto es idéntico | con TMDB sano no hay descartes: 0 diferencias; con 429 parcial: no se publica (E3-parcial) |
| Reintentos (3.c') | no | la misma llamada, más tarde; **misma respuesta** | 0 diferencias |
| Semáforo por clases, AIMD | no | **cuándo** sale cada llamada | `pickDaily` baraja posiciones sobre un conjunto **ordenado por clave antes de barajar** (CLAUDE.md, hero): el orden de llegada no cambia el resultado; el bucle de vueltas depende de **qué** volvió, no de cuándo. 0 diferencias en frío y caliente, individual y concurrente |
| Circuito, pausa, limitador | no | cuándo; o **rechaza** (→ degradado, no se publica) | 0 diferencias con TMDB sano; con caída: UB |
| Cancelación por presupuesto | no | no publica | 0 diferencias |
| Composición diferida (`waitUntil`) | no | quién espera; publica **sólo si terminó completa y sana** | la fresca publicada = comparador 0 diferencias |
| `COMPOSICION_MAX_MS` 28 | no | presupuesto | — |
| **Membresía por pool (A / A')** | **sí** | plataformas por pool en vez de `watch/providers` | **gate de descarte §12: diferencia cero o se descarta** |

**Consecuencia sobre los tiempos:** el Home frío sigue costando **926
llamadas** (Redis vacío) y ~150-500 a medianoche. La capacidad se resuelve
con **tiempo** (tasa conservadora, reconstrucción diferida, UB), no con menos
llamadas. Los números están en §5.

---

## 2. Estado de Git — **COMPROBADO (ejecutado, 14/09)**

| Qué | Valor |
|---|---|
| `main` = `origin/main` (tras `git fetch`) | `b7be927`, árbol limpio |
| Rama | `diseno/etapa3-resistencia-tmdb`, merge-base `b7be927`; `a15b650` → `209bda1` → `ced36de` → v4 |
| Issues | #17, #18, #21 retirados; **#19 y #20 abiertos** |
| Archivos ajenos sin seguimiento | `avatares/`, `prompts/noticias-filtro.md`, `prompts/noticias-redaccion.md`, `supabase/migrations/004_news.sql` — intactos |

---

## 3. Inventario y hallazgos (vigentes de `209bda1` §2-§3, con H16 corregido)

- Trece funciones de `lib/tmdb.ts`; `tmdb-sync` (Deno) y el pipeline offline
  fuera del cliente. Clase **por operación** (§2.2 de la v2). Once sitios que
  convierten errores de TMDB en vacío/`null` (S1-S11, §2.3 de la v2).
- H1-H15 como en la v2.
- **H16, corregido.** `enrichRaw` filtra por `onUserPlatforms`
  (`lib/enrich.ts:1798`) y el bucle del riel pide `⌈faltan × 1,4⌉` candidatos
  (`lib/home.ts:333`) con el comentario "margen del 40 % para absorber lo que
  se caiga por el filtro de plataformas". **Eso prueba que el código contempla
  que un candidato del pool de la plataforma P pueda no tener P en
  `watch/providers`; no prueba que ocurra, ni con qué frecuencia.** La
  frecuencia es **desconocida**. Por eso la membresía por pool no se puede
  aprobar por diseño: sólo un gate de diferencia cero (§12) puede decir si
  cambia o no el Home.

---

## 4. Fuente del límite y presupuestos (vigente de `ced36de` §4)

TMDB "~40 req/s, puede cambiar", sin `Retry-After` documentado, sin decir si es
por IP o por token; Vercel: proyecto en `iad1`, plan/Fluid/`maxDuration`
**desconocidos** (gate); token de `tmdb-sync` **no verificable** (se asume
compartido). Tasa declarada de la app: **28/s** (§8.3), margen de 12/s sobre
los 40 publicados.

---

## 5. Tiempos con tráfico mixto — modelo honesto

### 5.1 Parámetros

- Tasa declarada `r = 28/s`; dos cadencias por clase de `r / 2 = 14/s` con
  préstamo (§8.4).
- `C` = llamadas de una composición: **926** (Redis vacío), ~150-500
  (medianoche), ~24 (MISS intradía). **Sin membresía: no hay reducción.**
- `λ_i` = demanda interactiva agregada (llamadas/s de detalle, búsqueda,
  persona…), `λ_m` = demanda masiva **que no es el Home** (relacionados de
  fichas: 24 por ficha; `providersOf` de búsquedas: hasta 40; cards).

### 5.2 Modelo

```
capacidad masiva      s_m = r − min(λ_i, r/2)          (≥ r/2 siempre que lo demande)
capacidad interactiva s_i = r − min(λ_m + Homes, r/2)  (≥ r/2 siempre)
progreso de N Homes   p_h = s_m · (N · lotes_Home) / (N · lotes_Home + lotes_λm)   (FIFO por lote dentro de la cadencia masiva)
tiempo de N Homes     t(N) ≈ N · C / p_h + L
```

`L` ≈ 1-2 s (latencia no solapada). El modelo de la v3 (`N·C/r + L`) es el
caso `λ_i = λ_m = 0`.

### 5.3 Tabla

| Caso | `λ_i` | `λ_m` | `s_m` | N | C | `t(N)` | ¿Cabe? (16 / 28 / ~55 s) |
|---|---|---|---|---|---|---|---|
| Intradía tranquilo | 0 | 0 | 28 | 1 | 24 | ~1 s | ✓ ✓ ✓ |
| Redis vacío, sin tráfico | 0 | 0 | 28 | 1 | 926 | **33 s** | ✗ ✗ ✓ |
| Redis vacío, 2 claves | 0 | 0 | 28 | 2 | 926 | 66 s | ✗ ✗ ✗ |
| Medianoche, 3 claves, sin tráfico | 0 | 0 | 28 | 3 | 300 | 32 s | ✗ ✗ ✓ |
| Medianoche, 3 claves, tráfico bajo (1 ficha/s) | 3 | 24 | 25 | 3 | 300 | 3·300 / (25·3/(3+24/8·…)) ≈ **~50 s** | ✗ ✗ ~ |
| Intradía, 1 clave, tráfico medio (3 fichas/s + 1 búsqueda/s) | 16 → 14 | 87 | 14 | 1 | 300 | ≫ 55 s | ✗ ✗ ✗ → cancelada, UB |
| Redis vacío + tráfico medio | 14 | 87 | 14 | 1 | 926 | ≫ 55 s | ✗ ✗ ✗ → cancelada, UB |

**Lo que dice, sin adornos:** con la tasa conservadora y sin reducir llamadas
(restricción del dueño), **un Home frío sólo se reconstruye a tiempo con poca
competencia y en fondo**. Bajo tráfico mixto sostenido **no se reconstruye**:
sirve UB mientras el UB exista — y el UB **no es una solución completa**
(§5.5): vence a las 36 h, y una combinación nueva no lo tiene. La medianoche
argentina es, por horario, un momento de tráfico bajo (inferido, no medido:
#20), pero **no se puede afirmar que la carga baje antes de que el UB venza**.

### 5.4 Experiencia

| Situación | Con UB | Sin UB (primera vez de la clave en 36 h) |
|---|---|---|
| Se reconstruye dentro del presupuesto en fondo | UB en tiempo de HIT; la fresca aparece al terminar | el propietario espera hasta `COMPOSICION_MAX_MS` (28 s); si termina, la recibe; si no, recibe **vacío marcado** y la composición **sigue en fondo** (`waitUntil`) hasta ~55 s y publica si termina completa: el siguiente pedido la encuentra |
| Cancelada por presupuesto (~55 s) | UB; se libera el turno; el siguiente pedido vuelve a intentar **con lo que quedó cacheado** (`disc:`, `pv3:`), así que cada intento cuesta menos | vacío marcado; ídem |
| Tráfico mixto sostenido | UB mientras no venza (36 h); después, **vacío marcado** en cada intento cancelado (§5.5) | vacío marcado en cada intento cancelado: **Home vacío** para esa clave mientras dure la saturación (§5.5) |
| Caída de TMDB | UB (circuito, pausa) | degradado compartido / vacío |

**El progreso persiste:** una composición cancelada ya escribió en Redis los
`disc:` y `pv3:` que consiguió (con TMDB sano, esas escrituras son correctas y
son las de siempre). Ese es el mecanismo que hace converger las claves nuevas
bajo competencia, sin cambiar nada del Home.

### 5.5 Reconstrucción fría bajo tráfico interactivo sostenido: el caso que NO se resuelve con UB

**El número:** con la cadencia mínima masiva de `r / 2 = 14/s` (§9.1) y sin
reducción de llamadas, una reconstrucción completamente fría necesita
`926 / 14 = 66,1 s` **más latencia**, por encima de los ~55 s disponibles en
fondo (`waitUntil`, `maxDuration = 60`). Con préstamo (la cadencia interactiva
ociosa a ratos) puede bajar, pero **bajo tráfico interactivo sostenido no hay
préstamo**: la reconstrucción **se cancela, y se vuelve a cancelar en cada
intento**, aun con TMDB sano. El progreso cacheado (`disc:`, `pv3:`) hace que
cada intento cueste menos —un segundo intento arranca con los `discover` y
buena parte de los `pv3:` ya escritos— pero **no está demostrado** que
converja antes de que expire lo cacheado (`pv3:` 8 h) ni cuántos intentos
hacen falta; se mide (E-fria-sostenida).

**Vencimiento del último bueno:** el UB vive 36 h (`TTL.homeUltimoBueno`). Si
la saturación dura más que eso —o si la reconstrucción falla por otras causas
durante ese lapso—, el UB desaparece y la clave pasa al caso siguiente.

**Combinación nueva sin UB:** no hay nada que servir. El propietario espera
`COMPOSICION_MAX_MS`, recibe vacío marcado, y la reconstrucción en fondo se
cancela a ~55 s. **Cada pedido siguiente repite lo mismo** hasta que la
carga baje o el progreso cacheado alcance.

**Riesgo de Home vacío:** real en los dos casos anteriores (`hero: []`,
`rails: []`, `motivo: "cancelada"`). Hoy (`b7be927`) ese riesgo no existe con
TMDB sano porque no hay límite de tasa: el Home frío se compone a ~200/s en
~5 s. **Es un empeoramiento introducido por el limitador**, y la restricción
del dueño exige no perder el resultado correcto: **un limitador que no pueda
garantizar al menos una reconstrucción completa por clave no es aprobable.**

**Condición que deberá cumplir el futuro limitador (3.c), antes de su
diseño de implementación:**

```
C_max / s_reconstruccion + L ≤ presupuesto_fondo
```

con `C_max = 926` (Redis vacío) hoy, `presupuesto_fondo ≈ 55 s` y `L ≈ 2 s`
→ `s_reconstruccion ≥ 17,5/s` **garantizados** a la reconstrucción del Home
mientras dure, además de lo que consuman las demás clases. Formas posibles,
a evaluar en su momento y todas fuera de 3.a: (1) una tercera cadencia
**reservada a la reconstrucción del Home** (por ejemplo `r/2` para
reconstrucción, `r/4` interactiva, `r/4` masiva secundaria, con préstamo);
(2) **prioridad de reconstrucción escalonada**: una clave cancelada `k` veces
reserva ranuras con prioridad creciente hasta terminar; (3) subir la tasa
declarada si la cuenta lo permite (desconocido); (4) reducir `C` **sólo por
el gate de diferencia cero** (§12). Sin una de esas garantías, **3.c no se
implementa**.

---

## 6-7. Política por estado, reintentos, presupuesto (vigentes de `209bda1` §6-§7 y `ced36de` §6-§7)

Sin cambios: tabla por estado, sólo GET, "cabe", `getDeadline`, jitter; nada
se retiene durante esperas.

---

## 8. El limitador: contrato realmente demostrable

### 8.1 Qué se mide en cada reserva (tres instantes)

| Instante | Quién lo registra | Reloj |
|---|---|---|
| `tReservaRedis` (por ranura) | el script (`TIME`); en el banco, el doble de Redis lo escribe en su registro | Redis |
| `tEnvio`, `tRecepcion` | el proceso, alrededor del `EVAL` | local monotónico; `RTT = tRecepcion − tEnvio` es una **duración**, válida sin sincronía |
| `tFetch` (inicio real del `fetch`) | el proceso (y el doble de TMDB como `tLlegada`) | local / doble |

**Lo que se sabe sin suponer relojes:** el script corrió en algún instante
del intervalo `[tEnvio, tRecepcion]` (local). La ranura devuelta como retraso
`d` respecto de ese instante cae, en reloj local, en `[tEnvio + d, tRecepcion
+ d]`. Si el proceso emite en `tRecepcion + d` (lo más tarde posible), la
emisión es **posterior o igual** a la ranura y **a lo sumo `RTT` después**.

### 8.2 Alternativas comparadas

| Alternativa | Complejidad | Costo (`EVAL` por Home frío de 926 / latencia) | Garantía **real** sobre inicios de `fetch` |
|---|---|---|---|
| **Limitador conservador**: tasa media global demostrable sobre reservas, ráfaga explícita medida en el banco, circuito + pausa + reacción al 429 | baja-media | 116 (lotes de 8) / ~118 ms por lote, prefetch | promedio ≤ tasa sobre ventanas ≥ 1 s **demostrado**; ráfaga acotada **sólo bajo `RTT ≤ RTT_TOPE` verificado por reserva**; fuera de eso, medida |
| GCRA sin lotes (1 `EVAL` por llamada) | baja | **926** / 118 ms por llamada (necesita ≥ 4 en vuelo sólo para pagar Redis) | **la misma** incertidumbre por latencia; no mejora nada y duplica Redis |
| **Ranuras absolutas con vencimiento verificable** (adoptada dentro de la primera): el proceso quema la reserva si `RTT > RTT_TOPE` | baja | igual + ranuras quemadas (medidas) | convierte el supuesto de latencia en una **verificación local** por reserva: si Redis anda lento, se pierde capacidad, nunca se excede |
| Confirmación final antes del `fetch` (segundo `EVAL` en la hora de la ranura) | media | ×2 `EVAL`; +118 ms por llamada | la confirmación tiene su propia latencia: **no** fija el instante de emisión; sólo detecta reservas vencidas, que el vencimiento verificable ya detecta gratis |
| Coordinador / proxy único que serializa hacia TMDB | **alta** (infraestructura nueva: un servicio siempre encendido fuera de Vercel, o una cola) | 0 `EVAL`; +1 salto de red por llamada; punto único de fallo | **la única estricta**: un solo emisor, una cadencia real. Fuera de alcance por infraestructura y costo; se registra como el camino si algún día se exige garantía dura |

**Recomendación:** limitador conservador + ranuras absolutas con vencimiento
verificable, y un contrato en dos niveles: **demostrado** (reservas, promedio)
y **medido** (inicios de `fetch`, ráfaga). No se asume ni sincronía de relojes
ni latencia máxima de Redis.

### 8.3 Contrato

Sea `T = 1 / r` con `r = TMDB_TASA_GLOBAL = 28/s` (`T = 35,7 ms`). Dos cadencias
por clase (§8.4) con `T₂ = 2T = 71,4 ms`.

**Sobre qué se expresa la garantía (corrección de la v4.1):** hay **dos
cadencias físicas** (`tatA`, `tatB`; una "propia" de cada clase) y una
solicitud de una clase puede emitir por **las dos** cuando toma un préstamo.
Por eso ninguna cota se enuncia "por clase": se enuncian **por cadencia
física**, sobre el **total global**, y como **progreso mínimo reservado por
clase cuando ambas tienen demanda** (§9.1).

**(a) Demostrado, sobre reservas (reloj de Redis):** para toda ventana
`[t, t + W)`, las ranuras reservadas por **todos** los procesos son
`≤ ⌈W / T₂⌉` **por cadencia física**, o sea `≤ 2 · ⌈W / T₂⌉` en total: **≤ 28
por segundo móvil, ≤ 4 por 100 ms**, sea cual sea la mezcla de clases y de
préstamos. Es exacto porque `tatA` y `tatB` avanzan monotónicamente en el
script atómico.

**(b) Demostrado, sobre inicios de `fetch`, bajo un supuesto verificable
localmente:** si toda reserva usada cumplió `RTT ≤ RTT_TOPE` (las demás se
queman) y el permiso local llegó dentro de `GRACIA_RANURA_MS`, entonces cada
emisión ∈ `[ranura, ranura + RTT_TOPE + gracia]` y, **por cadencia física**,
`|E_cadencia ∩ [t, t + W)| ≤ ⌊(W + RTT_TOPE + gracia) / T₂⌋ + 1`. Con
`RTT_TOPE = 250 ms`, `gracia = 30 ms`:

| Ventana | Por cadencia física | Total (dos cadencias) |
|---|---|---|
| 1 s | ⌊1280 / 71,4⌋ + 1 = 18 | **≤ 36** |
| 100 ms | ⌊380 / 71,4⌋ + 1 = 6 | **≤ 12** |
| Mismo instante | — | ≤ 2 + (reservas cuyo retraso las junta): acotado por la fila de arriba |

`RTT_TOPE = 250 ms` sale de la mediana de 118 ms medida contra Upstash en la
Etapa 2 §14 (p95 **desconocido**); lo que supere el tope se quema y se cuenta
(`ranurasVencidas`). Si Redis está persistentemente por encima, el limitador
cae a cadencia local (§8.6): **sin garantía global**, como con Redis caído.

**(c) Medido, no demostrado:** la ráfaga real sobre `tFetch` con latencia
asimétrica (E-latencia-asimetrica). **El diseño no afirma cotas sobre `fetch`
más allá de (b)** ni fuera de sus supuestos.

**(d) Lo que se presenta como límite:** *total global: promedio ≤ 28/s en
ventanas ≥ 1 s (demostrado sobre reservas) y ráfaga ≤ 36 por segundo móvil /
≤ 12 por 100 ms (demostrada bajo RTT ≤ 250 ms verificado; medida en el
banco); por cadencia física: la mitad de cada número; por clase: ningún
tope de emisión —una clase puede usar las dos cadencias por préstamo— sino
un **progreso mínimo reservado de 14/s cuando la otra también demanda**.*
Los números del total quedan **por debajo de los 40 publicados** incluso en el
peor caso demostrado.

### 8.4 Script `RESERVAR(clase, pedido)` — dos cadencias con préstamo

Hash `tmdb:cadencia:v1` = `{ tatInt, tatMas, pausaHastaMs, pausaMotivo }`,
todo en ms del reloj de Redis (`TIME`):

```
ahora = TIME
si pausaHastaMs > ahora: return {0, [], esperaMs = pausaHastaMs − ahora, "pausa"}
f      = rampa(ahora, pausaHastaMs)                      -- 0,25 → 1 lineal en RAMPA_MS, 1 fuera de rampa
T2e    = T₂ / f
propio = tat[clase]; ajeno = tat[otra clase]
inicio = max(propio, ahora)
-- préstamo: sólo si la cadencia ajena está OCIOSA (no tiene reservas pendientes)
prestamo = (ajeno ≤ ahora) y (inicio − ahora > 0)          -- la propia está ocupada y la ajena libre
si prestamo: inicioP = ahora; nP = min(pedido, LOTE_clase, ⌊HORIZONTE_PRESTAMO_MS / T2e⌋ + 1)
             ranuras = [inicioP, inicioP + T2e, …] (nP); tat[otra] = inicioP + nP·T2e
             return {nP, ranuras − ahora, 0, "prestamo"}
horizonte = HORIZONTE_clase                                  -- interactiva 1000 ms, masiva 1000 ms (ya no 250: la equidad la da la cadencia propia)
si inicio − ahora > horizonte: return {0, [], esperaMs = inicio − ahora − horizonte, "horizonte"}
n = min(pedido, LOTE_clase, ⌊(ahora + horizonte − inicio) / T2e⌋ + 1)
ranuras = [inicio, inicio + T2e, …] (n); tat[clase] = inicio + n·T2e
HSET; PEXPIRE 60000
return {n, ranuras − ahora, 0, "ok"}
```

- **Cada clase tiene su cadencia de `r/2`**: por construcción, ninguna clase
  puede consumir las ranuras de la otra mientras la otra las demanda (el
  préstamo exige `tat_ajeno ≤ ahora`, o sea cadencia ajena **ociosa**), y un
  préstamo avanza `tat_ajeno` a lo sumo `HORIZONTE_PRESTAMO_MS = 250 ms`.
- **Work-conserving:** sin demanda de una clase, la otra usa las dos
  cadencias (préstamos sucesivos, cada uno ≤ 250 ms adelante).
- El **total** de reservas sigue acotado por (a): dos cadencias de `T₂`.
- `LOTE_MASIVA = 8`, `LOTE_INTERACTIVA = 4`; `pedido = min(LOTE, esperando + 1)`.

### 8.5 Orden de adquisición (vigente de `ced36de` §8.4) con el vencimiento verificable

```
1. señal → cancelada.enCola | 2. circuito abierto → rechazada | 3. pausa local → dormir SIN permiso ni ranura
4. RANURA: del lote local; si no hay, RESERVAR; al recibir: RTT = tRecepcion − tEnvio;
   si RTT > RTT_TOPE_MS → ranurasVencidas += n, NO se usan, volver a 4 (con backoff local 50-100 ms; al 3.er vencido seguido → cadencia local 5 s)
   las ranuras se fijan en reloj local como tRecepcion + retraso (lo más tarde posible: nunca antes de la ranura)
5. DORMIR hasta la ranura, SIN permiso
6. PERMISO por clase (§8.1 de la v2); si no llega en GRACIA_RANURA_MS = 30 → ranura perdida, volver a 4
7. fetch (tFetch registrado)  |  8. liberar; clasificar; reintento → dormir SIN nada → 1
```

### 8.6 Redis lento, flapeando o caído

`EVAL` fallido, o tres reservas seguidas vencidas por `RTT_TOPE`, activan la
**cadencia local** por `RESPALDO_LOCAL_MS = 5 s`: `TMDB_TASA_LOCAL = 14/s`
por proceso (= 28 / 2 instancias supuestas; **el número de instancias es
desconocido**, así que esto es una suposición declarada).

🔴 **Redis lento sostenido (corrección de la v4.1):** si Redis responde por
encima de `RTT_TOPE` de forma sostenida, **todos** los procesos caen a la
cadencia local a la vez, y el total pasa a ser `14 × instancias`: con tres
instancias, **42/s, por encima de los 40 publicados**. El escenario rotativo
5/30/150/300 no lo muestra (nunca hay tres vencimientos seguidos); por eso
existe **E-redis-lento-sostenido** (§15), que lo provoca y lo mide. Lo que se
puede declarar: **con Redis lento o caído el total no está acotado
globalmente**; la mitigación honesta es un `TMDB_TASA_LOCAL` más bajo (por
ejemplo 8/s: 24/s con tres instancias, 40 con cinco) a costa de que un Home
frío sin Redis tarde `926 / 8 = 116 s` y se cancele — que ya es el caso
`sin-redis` de la Etapa 2, donde tampoco hay UB. El valor queda **provisional
y con esa cuenta escrita**; sin Redis no hay garantía global ni equidad
global: sólo el semáforo local por clases, el circuito y la pausa local.

---

## 9. Equidad global sin inanición, y las tres esperas

### 9.1 Garantías (demostradas sobre el script de §8.4)

| Garantía | Valor | Por qué |
|---|---|---|
| Progreso mínimo **reservado** de la clase masiva cuando la interactiva también demanda (sostenido y distribuido) | **≥ r / 2 = 14/s** en total, entre todas las instancias | su cadencia física sólo la avanzan reservas masivas o préstamos interactivos **cuando está ociosa**; en cuanto hay demanda masiva, `tat > ahora` y el préstamo se corta. Con la otra clase ociosa, puede emitir por las dos cadencias (hasta 28/s): **es un mínimo, no un tope** |
| Progreso mínimo reservado de la clase interactiva cuando hay Home(s) en frío | **≥ 14/s** | simétrico |
| Tope de emisión de una clase | **no existe** como tal: el tope es por cadencia física (§8.3) y el total global | una clase con préstamo usa las dos cadencias |
| Espera máxima de la primera ranura de una clase que empieza a demandar | **≤ 250 ms + T₂ ≈ 321 ms** | el préstamo que pudo tomar la otra clase avanzó `tat` a lo sumo 250 ms |
| Inanición | **imposible por construcción** | ninguna clase depende de la cola de la otra en Redis; el W:1 local sigue existiendo para los permisos |

### 9.2 Las tres esperas de una ficha, separadas

| Espera | Cota | Cómo se mide |
|---|---|---|
| **Detrás de trabajo masivo** (préstamo masivo sobre la cadencia interactiva) | ≤ 250 ms + T₂ | E2-otro-proceso: ficha sola con Homes fríos en otros procesos; `esperaRanuraMs` de las llamadas interactivas |
| **Detrás de otras fichas** (FIFO en la cadencia interactiva, distribuida) | ≤ `HORIZONTE_INTERACTIVA` (1 s) + `LOTE_INTERACTIVA · T₂` (≈ 0,3 s): el horizonte impide que `tatInt` se aleje más de 1 s de `ahora`, así que una reserva nueva espera a lo sumo eso (más el `EVAL` de reintento) | E2-fichas: sólo fichas, 5/s y 10/s, sin Homes; `esperaRanuraMs` y `esperaHorizonteMs` |
| **Total bajo saturación** (ambas + permiso local + `EVAL`) | ≤ 0,32 + 1,3 + gracia/permisos (semáforo por clase con reserva) + `RTT` ≈ **2 s por tramo interactivo** de la ficha (3 tramos encadenados → hasta ~6 s en saturación total) | E2-saturacion: Homes fríos + 10 fichas/s + 3 búsquedas/s en 3 procesos |

Cuando la demanda interactiva supera `r/2` sostenidamente, las fichas
**hacen cola entre sí**: es el límite de tasa actuando sobre la clase que más
lo consume, y se ve en `esperaHorizonteMs`. Es honesto decir que **a 28/s la
app atiende ~14 llamadas interactivas por segundo con garantía** (≈ 4-5
fichas frías por segundo) y el resto por préstamo.

---

## 10. Circuito y recuperación (vigente de `ced36de` §10), cota de tasa recalculada

Rampa en el script sobre `T₂e = T₂ / f`. Reservas por clase en el primer
segundo tras la pausa: `14 · ∫₀¹ f = 14 · 0,2875 = 4,0` → ≤ 5 por clase, ≤ 10
en total; sobre `fetch` con el corrimiento de (b): reservas en
`[t − 0,28, t + 1)` → `14 · (0,25 · 1,28 + 0,0375 · 1,28²) = 5,3` → ≤ 6 por
clase, **≤ 12 en total**. Concurrencia aparte: `enVuelo ≤ PISO = 4` por
proceso.

---

## 11. Estrategia que preserva exactamente el Home sano

1. **Ningún cambio en `lib/home.ts`, `lib/pools.ts`, `lib/enrich.ts` que
   altere selección, orden, cantidad, dedup, plataformas o enlaces.** Los
   únicos cambios en esos archivos son: cables de clasificación
   (`registrarDescarteTmdb`) y de clase (`conClaseTmdb`) alrededor de
   operaciones existentes, sin tocar sus resultados.
2. **Determinismo respecto del tiempo:** el composer ya es determinístico dado
   el conjunto de respuestas (semilla del día, `pickDaily` sobre conjuntos
   ordenados por clave, vueltas que dependen de cuántos títulos volvieron).
   Reordenar en el tiempo las mismas llamadas produce el mismo payload.
   **Esto se verifica, no se supone**: comparador §14 en frío, caliente,
   individual y concurrente, con y sin limitador.
3. **Nunca publicar lo incorrecto:** degradado (fuente entera, descarte
   parcial de causa TMDB, disponibilidad), cancelado o incompleto → no se
   escribe fresca ni UB. Lo que se publica es idéntico a lo que `b7be927`
   habría publicado con las mismas respuestas.
4. **`VERSION_HOME` no cambia** en la Etapa 3: el contenido no cambia, y subir
   la versión escondería diferencias al comparador (y forzaría un arranque
   frío). Los campos aditivos de diagnóstico (`degradacion`, métricas) **no
   viajan en la fresca**.
5. **Kill switches** por sub-etapa que devuelven el comportamiento actual sin
   migraciones ni cambio de claves (§16).
6. **La membresía por pool no entra** salvo gate de diferencia cero (§12).

---

## 12. Membresía por pool: NO aprobada; gate de descarte

### 12.1 Comparación aislada y reproducible (en el banco, sin TMDB real)

`scripts/banco/comparar-membresia.mjs`, sobre el doble de TMDB con
respuestas determinísticas **y un modo `contradiccion`** configurable (el
doble devuelve, para una fracción `p` determinística de títulos, un
`watch/providers` que no lista la plataforma del pool del que salieron). Para
cada corrida genera, **por riel y para el hero**:

| Campo | Contenido |
|---|---|
| `idsAntes` / `idsDespues` | secuencia completa de `type:id` con `HOME_MEMBRESIA=0` y `=1` |
| `ordenAntes` / `ordenDespues` | posición de cada id |
| `cantidad` | antes / después |
| `plataformasAntes` / `plataformasDespues` | por id, el array `platforms` |
| `añadidos` | ids en después y no en antes |
| `eliminados` | ids en antes y no en después |
| `movidos` | ids presentes en ambos con posición distinta |
| `badgesIncompletos` | ids con `plataformasDespues ⊂ plataformasAntes` estricto |
| `badgesAdicionales` | ids con plataformas en después que antes no tenía |
| `enlaces` | `watchLink`/`links` por id antes / después (el Home no los expone en la card, pero la ficha sí: se registran igual) |

**Criterio de aprobación por defecto: diferencia cero en todos los campos**,
con `p = 0` (control: debe dar cero) y con `p > 0` (donde la membresía plena
A **necesariamente** difiere: los `hoyDescartado` aparecen como `añadidos`).
El resultado esperado es que **A falla el gate en cuanto exista una sola
contradicción**, porque cambia títulos, no sólo badges.

### 12.2 Decisión

- **A (membresía plena): descartada** en cuanto el gate registre una
  diferencia en ids, orden, cantidad, plataformas, badges o disponibilidad.
  No se presenta ninguna diferencia como "mejora aceptable".
- **A' (membresía sólo para decidir qué candidatos enriquecer; `providersOf`
  sigue decidiendo filtro, plataformas y badges):** se evalúa **sólo** si el
  gate da cero en títulos, orden y disponibilidad. Análisis previo: A' cambia
  **qué candidatos se enriquecen** (los que el pool dice que están) pero el
  filtro final sigue siendo `onUserPlatforms` sobre `watch/providers`; si un
  candidato del pool no tiene la plataforma en `watch/providers`, A' lo
  descarta igual que hoy… **pero no lo habría enriquecido si la membresía
  dijera otra plataforma del usuario**: el conjunto que llega al filtro puede
  diferir, y con él el relleno de vueltas y el orden. Es decir, **A' tampoco
  garantiza identidad por diseño**: sólo el gate puede decirlo, y cualquier
  diferencia la descarta.
- Si ambas fallan: **se descartan y la capacidad se resuelve sin cambiar la
  lógica del Home** (§5, §11): tasa conservadora, reconstrucción diferida,
  UB, progreso cacheado.
- La medición contra TMDB real (~300 llamadas) queda **prohibida hasta
  autorización expresa**, y sólo tendría sentido si el gate del banco
  pasara — para saber si en el catálogo real `p` es 0. Con `p` desconocido, la
  regla del dueño manda: **no aprobada**.

---

## 13. Métricas y Redis caído (vigentes de `ced36de` §12-§14) + nuevas

`ranuras.{lotes, reservadas, perdidas, vencidas, prestadas, esperaRanuraMs,
esperaHorizonteMs}`, `rttEvalMs.{p50, max}`, `emisionRetrasoMs` (`tFetch −
ranuraLocal`), `cadenciaLocalActiva`.

---

## 14. Banco obligatorio para preservar el Home

`scripts/banco/comparar-home.mjs` — corre **antes de aprobar cualquier
implementación** de cualquier sub-etapa:

| Requisito | Cómo |
|---|---|
| Mismo snapshot y mismas respuestas del doble | el doble de TMDB responde por hash determinístico de la consulta (ya es así); el snapshot se fija por `BANCO_SNAPSHOT=<id>` y se publica en `docs/medidas/` |
| Misma fecha argentina | `YUMP_FECHA` fija en las dos corridas |
| Mismas plataformas y toggles | lista fija: `n,d,m`, `n`, `n,d`, `d,m`, `n,d,m,at,p,cr` × `t` por defecto y dos combinaciones de toggles |
| **Aislamiento total de cachés entre versiones** | 🔴 Con la misma `VERSION_HOME`, si "antes" y "después" comparten Redis, una versión puede **leer el payload que compuso la otra** y dar un falso "diferencia cero". Exigido: **dos instancias del doble de Redis** (puertos distintos, una por versión; alternativa: un namespace por versión inyectado por `BANCO_REDIS_PREFIJO` **sólo con `YUMP_BANCO=1`**), de modo que turno, fresca, UB, degradado, generación, `card:`, `pv3:`, `disc:` y toda clave vivan separadas |
| Cachés frías y calientes | corrida fría: **cada** instancia de Redis vaciada (`FLUSHALL` del doble) inmediatamente antes de su corrida, con `DBSIZE = 0` registrado; corrida caliente: **cada versión calienta su propia caché** con su propia corrida fría previa; nunca se calienta una con la otra |
| Evidencia de composición real en las dos versiones | en el frío, **las dos** versiones tienen que registrar `[home] compone <clave> <propietario>` y `cache MISS` con `1 composición`, y el doble de TMDB tiene que recibir **las llamadas esperadas** (926 para `n,d,m` frío en el doble actual) **de cada una**; un HIT, `esperada`, `ultimo-bueno` o `compartida` en el frío invalida la corrida (sería caché cruzada o residual) |
| Control del aislamiento | una corrida deliberadamente **compartida** (las dos versiones contra la misma instancia de Redis, sin vaciar entre ellas): el validador **debe rechazarla** por HIT en el frío del "después" y por llamadas a TMDB = 0; si la acepta, el validador está roto (MANTENIMIENTO 8.b.2) |
| Una combinación individual y varias simultáneas | 1 clave; 3 claves en 3 procesos a la vez |
| Comparación estructural completa | hero y **cada** riel: secuencia de `type:id`, cantidad, `platforms` por id, `title`, `year`, `poster`, `hasEditorial`, título del riel, `shelfKey`, orden de rieles, `degradado`, `fallos`; se compara el JSON entero salvo los campos aditivos declarados en una lista blanca |
| Diferencia cero con TMDB sano | criterio de salida 0 del comparador; cualquier diferencia → corrida INVÁLIDA y JSON `*-DIFERENCIAS.json` |
| Control del comparador | cuatro mutaciones artificiales del payload "después" —eliminar un id, agregar uno, mover uno, cambiar una plataforma— y el comparador **debe fallar** en las cuatro; si alguna pasa, el comparador está roto (MANTENIMIENTO 8.b.2) |
| Kill switch | cada sub-etapa apagada = comportamiento actual sin migraciones; el comparador corre también "todo apagado vs `b7be927`" (= 0) |
| Sin subir la versión de la clave | `VERSION_HOME` se compara textualmente entre las dos versiones del código: si difiere, la corrida es inválida |
| No aceptar un verde parcial | el comparador no admite modo "sólo cantidad" ni "sólo ids": la comparación es del JSON completo |

**Dos versiones del código en el mismo banco:** `BANCO_APP_DIR` (ya existe
para el "antes" en `correr-etapa2.mjs`) apunta al build de `b7be927`; la rama
en prueba es el "después". Cada versión arranca con **su** `UPSTASH_REDIS_REST_URL`
apuntando a **su** instancia del doble; el corredor registra los dos puertos,
los dos `DBSIZE` antes de cada frío, y las líneas `compone` de cada una.

---

## 15. Escenarios del banco (vigentes de `ced36de` §17, más los nuevos)

| # | Escenario | GREEN | Control |
|---|---|---|---|
| **E-home-identico** (§14) | comparador, 5 combinaciones × frío/caliente × individual/concurrente × todo apagado/todo encendido | **0 diferencias** en todos | las 4 mutaciones fallan |
| **E-latencia-asimetrica** | 3 procesos; el doble de Redis con latencia **por proceso y variable**: 5, 30, 150 y 300 ms (rotando por reserva); Home frío en cada uno | registro por reserva de `tReservaRedis` (doble), `tRecepcion`, `tFetch`; **(a)** reservas ≤ 28 por segundo móvil y ≤ 4 por 100 ms (exacto); **(b)** con RTT ≤ 250 usadas y las de 300 quemadas: `fetch` ≤ 36 por segundo móvil y ≤ 12 por 100 ms; `ranurasVencidas` = las reservas que vieron 300 ms; `emisionRetrasoMs ≥ 0` en el 100 %; y se **publica la ráfaga máxima real observada** | RTT_TOPE = ∞ (sin vencimiento): la cota (b) **puede** violarse y se muestra |
| **E-equidad** | 3 procesos con fichas continuas (20/s de demanda interactiva) + 1 Home frío | el Home progresa **≥ 14 llamadas/s** medidas en el doble; su primera ranura ≤ 321 ms tras pedirla | horizonte de la v3 (sin cadencia propia): el Home no progresa |
| **E2-fichas / E2-otro-proceso / E2-saturacion** | §9.2 | las tres esperas publicadas por separado contra sus cotas | C0 |
| **E-mixto** | 2 Homes fríos + 3 fichas/s + 1 búsqueda/s, 3 procesos | tiempos contra §5.3; los Homes o terminan en fondo o `cancelada` con UB servido; ninguna ficha `503` por saturación (sólo espera) | — |
| **E-redis-lento-sostenido** | 3 procesos; el doble de Redis con latencia **constante 400 ms** (> `RTT_TOPE`) durante 20 s; Home frío en cada uno | los tres procesos caen a cadencia local tras 3 vencimientos; **se publica el total global observado en el doble de TMDB** (esperado: hasta `3 × TMDB_TASA_LOCAL`, o sea 42/s con 14 y 24/s con 8) y se compara contra 40; `cadenciaLocalActiva` en los tres; al volver la latencia a 30 ms, vuelven a Redis en ≤ 5 s | `TMDB_TASA_LOCAL=8` |
| **E-fria-sostenida** | 3 procesos con fichas continuas (≥ 14/s interactivas sostenidas) + 1 clave de Home **sin UB** y Redis vacío | se registra si la reconstrucción se cancela, cuántos intentos hacen falta hasta publicar (con el progreso cacheado), y si alguno cae en Home vacío; **no hay GREEN posible hasta que 3.c cumpla la condición de §5.5**: el escenario documenta el problema | sin fichas: termina en ~33 s + L |
| **E-compartida (control de §14)** | las dos versiones contra la **misma** instancia de Redis, sin vaciar | el validador **rechaza** la corrida (HIT en el frío del "después", 0 llamadas a TMDB) | — |
| E1-tasa, E1-tasa-3p, E1-tasa-N, E-permisos-pausa, E-gracia, E-propagacion, E-cola-429, E3-parcial, E4-*, E5-E14, E-card-null, E8-diferida | como `ced36de` §17, con las cotas de §8.3 (36 / 12 total; 18 / 6 por cadencia física) y sin E1-membresia como criterio de mejora (queda sólo dentro del gate §12) | | |

---

## 16. Orden de despliegue seguro (vigente de `ced36de` §16, con la restricción)

| Sub-etapa | Kill switches al desplegar | ¿Segura sola? | Gate de la restricción del dueño |
|---|---|---|---|
| 3.a clasificación, métricas, H2, `503`/`degradacion`; reintentos presentes **apagados** | `TMDB_REINTENTOS=0` | sí | E-home-identico = 0 |
| 3.b semáforo por clases, AIMD, circuito | `TMDB_CLASES=1`, `TMDB_AIMD=1`, `TMDB_CIRCUITO=1` | sí | E-home-identico = 0 |
| 3.e reconstrucción diferida + `COMPOSICION_MAX_MS` 28 (gate: Preview `waitUntil`) | `HOME_RECONSTRUCCION_DIFERIDA=1` | sí | E-home-identico = 0 (la fresca diferida es idéntica) |
| 3.c limitador (dos cadencias) + pausa (gate: Preview Upstash `TIME`) | `TMDB_TASA_GLOBAL=28`, `TMDB_TASA_LOCAL` provisional (§8.6) | **no aprobable todavía**: no garantiza una reconstrucción completa bajo tráfico sostenido (§5.5); requiere rediseño con la condición `C_max / s_reconstruccion + L ≤ presupuesto_fondo` | E-home-identico = 0 con limitador encendido; E-fria-sostenida sin Home vacío |
| 3.c' reintentos ON (config) | `TMDB_REINTENTOS=1` | sólo tras 3.b + 3.c observados ≥ 1 día | — |
| 3.d membresía | **no entra** salvo gate §12 = 0 | — | §12 |
| 3.f Deno, 3.R Redis | aparte | — | — |

Orden: `3.a → 3.b → 3.e → 3.c → 3.c'`. 3.d sólo si el gate lo permite.

---

## 17. Alcance honesto del cierre del #19

Con 3.a + 3.b + 3.c (28/s) + 3.c' desplegados y el banco en verde:

- ✅ `Retry-After` respetado; no hay lazo; recuperación gradual; UB ante caída.
- ✅ Concurrencia declarada: ≤ 24 por proceso (× instancias, declarado así).
- ✅ Tasa declarada, **para la aplicación en Vercel, con Redis respondiendo
  con RTT ≤ 250 ms**: **promedio ≤ 28/s demostrado sobre reservas; ráfaga ≤ 36
  por segundo móvil y ≤ 12 por 100 ms demostrada bajo ese supuesto y medida
  sobre `fetch` reales con latencia asimétrica.** Ambos por debajo de los 40
  publicados.
- ✅ Equidad global: ninguna clase por debajo de 14/s cuando lo demanda.
- ❌ **No cubre:** la cuenta entera de TMDB (salvo tokens distintos o
  `tmdb-sync` incorporado — §16.6 de la v3); el límite real de TMDB; Redis
  caído o lento (cadencia local supuesta); scripts manuales; una garantía
  estricta de ventana móvil sin el supuesto de RTT (eso exigiría el
  coordinador único de §8.2).
- Con 3.c apagado: la parte de tasa queda **abierta**.
- **Estado tras la auditoría de la v4:** sólo 3.a es aprobable; 3.c tal como
  está diseñado **no** (§5.5). El #19 sigue abierto en la tasa.

---

## 18. Comprobado / inferido / desconocido

**Comprobado (ejecutado):** Git (§2); documentación de TMDB y Vercel; proyecto
y región por CLI.

**Comprobado por lectura de `b7be927`:** inventario, S1-S11, H1-H15; el
mecanismo de H16 (filtro y margen), **no su frecuencia**; que el composer
ordena por clave antes de barajar (CLAUDE.md y `lib/enrich.ts`, hero) — la
independencia del orden de llegada **se verifica en E-home-identico**, no se
supone.

**Inferido (cálculo sobre el algoritmo propuesto):** contrato (a) y (b) de
§8.3; equidad de §9.1; cotas de §9.2 y §10; modelo y tabla de §5.

**Hipótesis, pendientes del banco:** todo §15; que la ráfaga real con latencia
asimétrica no supere (b); que `RTT_TOPE = 250 ms` no queme demasiadas
reservas (depende del p95 de Upstash, desconocido); `waitUntil`; `TIME` en
`EVAL`; `null` en el SDK; que la medianoche sea de tráfico bajo.

**Desconocido y así queda:** frecuencia de la contradicción pool vs
`watch/providers` (H16); límite real de TMDB; plan, Fluid y `maxDuration`;
token compartido; instancias reales; p95 de latencia de Upstash; facturación
de `EVAL`.

---

## 19. Decisiones que necesitan autorización del dueño

1. Confirmar que **A y A' quedan descartadas salvo gate de diferencia cero**
   (ya decidido en la restricción; se registra).
2. **Tasa declarada 28/s** con las consecuencias de §5 (Home frío en fondo,
   UB bajo carga); o un valor distinto con su cuenta.
3. **`waitUntil`** (dependencia + Preview) — necesaria para que la
   restricción y la tasa convivan.
4. Aceptar **+1 a +2 s por tramo** en la ficha fría bajo carga (§9.2).
5. Los gates de la v3 §16.7: dashboard de Vercel, paneles de secretos, Preview
   Upstash, Preview `waitUntil`.
6. 3.f y 3.R aparte.

---

## 20. Diff documental v3 → v4 (y v4 → v4.1 al final)

| v3 | v4 |
|---|---|
| Cabecera | v4 con la restricción del dueño; §0.1 (dueño), §0.2 (Codex), §0.3 (conservado) |
| — | **§1 nuevo**: la restricción como criterio bloqueante, mecanismo por mecanismo |
| §3 H16 ("frecuencia suficiente", "calibrado") | **corregido**: prueba que se contempla, no la frecuencia; frecuencia desconocida |
| §5 modelo `N·C/tasa + L` | **§5 reescrito**: tráfico mixto (`s_m`, `s_i`, FIFO en la cadencia masiva), tabla con `λ_i`/`λ_m`, experiencia; C = 926 sin reducción |
| §8.3 contrato `≤ ⌈W/T⌉ + 1` (falso con latencia asimétrica) | **§8 reescrito**: tres instantes por reserva; alternativas con complejidad/costo/garantía; contrato en dos niveles (demostrado sobre reservas / demostrado sobre `fetch` bajo RTT verificable / medido); tasa 28; dos cadencias por clase con préstamo; vencimiento verificable |
| §8.6 horizonte 250 ms (inanición posible) | **§9 nuevo**: equidad global ≥ r/2 por clase, espera ≤ 321 ms, inanición imposible; las tres esperas separadas |
| §10 | cota recalculada con dos cadencias (≤ 12) |
| — | **§11 nuevo**: estrategia que preserva el Home sano; **§12 nuevo**: membresía NO aprobada, gate de descarte con los diez campos, decisión A/A'; **§14 nuevo**: banco obligatorio de diferencia cero con control del comparador |
| §17 escenarios | §15 con E-home-identico, E-latencia-asimetrica, E-equidad, E2 desglosado, E-mixto |
| §16 despliegue | §16 con el gate de la restricción por sub-etapa; 3.e antes de 3.c |
| §18 cierre | §17 con el alcance literal y la garantía en dos niveles |
| §19-§20 | §18-§19 |

### Diff v4 → v4.1

| v4 | v4.1 |
|---|---|
| Cabecera | v4.1; estado tras la auditoría (sólo 3.a aprobable; 3.a en rama) |
| — | **§0.4 nuevo**: las cuatro correcciones |
| §5.3 último párrafo, §5.4 fila "tráfico mixto" | sin "sirve UB hasta que baje la carga" como solución |
| — | **§5.5 nuevo**: reconstrucción fría bajo tráfico sostenido (66 s > 55 s), vencimiento del UB, combinación nueva, Home vacío, condición para el futuro limitador |
| §8.3 (a), (b), (d) | garantías por **cadencia física**, total global y progreso mínimo por clase; no "por clase ≤" |
| §8.6 | Redis lento sostenido: `14 × instancias`, sin cota global; `TMDB_TASA_LOCAL` provisional con la cuenta |
| §9.1 | progreso mínimo **reservado**, no tope por clase |
| §14 | aislamiento total de cachés: dos instancias de Redis, vaciado y calentamiento independientes, evidencia `compone` y llamadas TMDB en las dos, control compartido |
| §15 | E-redis-lento-sostenido, E-fria-sostenida, E-compartida |
| §16 | 3.c "no aprobable todavía" con la condición de §5.5 |
| §17 | estado tras la auditoría de la v4 |

---

## 22. Etapa 3.a — implementada en rama, pendiente de auditoría (14/09/2026)

### 22.1 Rama, fork y commits

| Qué | Valor |
|---|---|
| Rama | `feat/etapa3a-clasificacion-tmdb`, creada desde `main` = `origin/main` = `b7be927` (no desde la rama documental) |
| Commits | `dedee6a` código + tests (RED → GREEN); `b7a4a6a` banco (comparador de identidad + 429 parcial) y evidencia; el commit de este documento (docs traídos por rutas controladas desde `diseno/etapa3-resistencia-tmdb` = `0d06826` v4.1) |
| Worktrees | `wt-etapa3a` (rama); `wt-etapa3-antes` (detached en `b7be927`, con build del banco, para el RED de referencia y el "antes" del comparador) |
| Sin | merge, push, deploy, TMDB real, credenciales productivas, cambios de infraestructura o variables |

### 22.2 Qué se implementó (sólo lo autorizado)

| Pieza | Archivo | Qué hace |
|---|---|---|
| Clasificación por causa | `lib/tmdb-error.ts` | `ErrorTmdb` con `estado`, `clase` (`http429`, `http5xx`, `http4xx`, `red`, `timeout`, `cuerpo`, `cancelada`, `rechazada`) y `retryAfterMs`; `clasificarError` separa timeout de red, cancelación y cuerpo inválido; `esErrorTmdb` decide sin mirar mensajes |
| Parser de `Retry-After` | `lib/retry-after.ts` | segundos, fecha HTTP futura, pasada/ausente/inválida → `null` |
| Política y bucle de reintentos, **apagados** | `lib/tmdb-politica.ts` | la tabla de §6 (429/5xx hasta 3 intentos, `Retry-After` tope 30 s, backoff con jitter, red/timeout 1, 4xx/cuerpo/cancelada nunca, regla de "cabe"); `reintentosActivos(process.env.TMDB_REINTENTOS)` sólo es `true` con `"1"`; apagado, `decidir` = `fallar` con espera 0 y `conReintentos` hace exactamente un intento |
| Cliente | `lib/tmdb.ts` | un solo `fetch`, dentro del bucle; timeout y cuerpo inválido dejan de contarse como `red`/`ok`; `intentos`, `reintentos`, `reintentoNoCupo`, `canceladas.{enCola,enEspera,enVuelo}` medidos; lanza `ErrorTmdb`; presupuesto restante = ∞ mientras los reintentos estén apagados (no altera el comportamiento sano) |
| Contexto de descartes (H2) | `lib/fallos-tmdb.ts` | contador anidado por contexto async, mismo patrón que `fallos-disponibilidad`; `registrarDescarteTmdb(e, sitio)` cuenta sólo `ErrorTmdb`; `withFallosDeFuentes` compone disponibilidad + TMDB |
| `settleAll` puro | `lib/settle-all.ts` | mismo comportamiento que el de `enrich.ts`, más el registro de cada rechazo de causa TMDB |
| Los once sitios | S1 `lib/home.ts` `safe`; S2 los cinco `settleAll`; S3 `titleCard` (registra y **no escribe `null`**: `fallo = true`); S4 `directorCards`; S5 `lib/pools.ts`; S6 `lib/top.ts` `safe`; S7 `lib/netflix-top10.ts` `enNetflixAR`; S8 `lib/idioma.ts` (los dos `catch` del respaldo); S9/S10 rutas de ficha y búsqueda; S11 ruleta vía S3 (`lib/reco.ts` no traga: propaga) | causa registrada; las siete superficies cacheadas (card, Home, búsqueda, Top, reco, dos tramos de últimos) abren `withFallosDeFuentes` |
| Home degradado no se publica | `lib/home.ts` `producirHome` | `degradado = fuentes caídas ∨ fallos de disponibilidad ∨ descartes TMDB`; `ENFRIAR` + último bueno (Etapa 2) hacen el resto; métrica `home.descartesTmdb` |
| Ficha: principal vs opcional | `lib/enrich.ts` `detail()`, `lib/tmdb-http.ts`, `app/api/title/[tipo]/[id]/route.ts`, `lib/types.ts` | detalle caído → `503` + `Retry-After` (o `404`); proveedores / trailer / relacionados caídos por TMDB → se sirve el resto con `degradacion: { proveedores?, trailer?, relacionados? }` (campo aditivo: con TMDB sano no viaja); un error propio sigue siendo `500` |
| Búsqueda: principal vs opcional | `lib/enrich.ts` `search()`, `app/api/search/route.ts` | páginas caídas → `503`; `providersOf` de un elegido caído → el título sale sin plataformas, `degradacion.proveedores = n`, y el resultado no se cachea |
| Cliente | `components/api-motivo.ts`, `components/useApi.ts`, `components/DetailView.tsx`, `components/SearchView.tsx` | `useApi` expone `motivo`; la ficha y la búsqueda dicen "la fuente (TMDB) no responde" en vez de "Sin conexión" (H8) |
| Métricas | `lib/metricas.ts` | campos nuevos y la línea `[home]`; **sin reintentos la línea es la de siempre** (control) |

**Corrección a la v2 (H15 / S7):** un 429 en `enNetflixAR` **no** se
persistía como "no está": el resolver termina en `sinMatch` (`tmdb_id` nulo,
`needs_review = true`), o sea "sin resolver esta semana". Lo que se perdía era
la aceptación por proveedor de ese candidato. En 3.a sólo se registra la
causa; el contrato del resolver no cambia.

### 22.3 RED contra `b7be927` y GREEN

Los siete archivos de test nuevos, copiados sobre el worktree en `b7be927` y
ejecutados ahí: **21 casos, 18 fallan, 3 pasan** — los tres que pasan son
controles que describen el comportamiento actual ("no hay limitador…",
"S11 `lib/reco.ts` no traga", "sin reintentos la línea `[home]` es la de
siempre"). Los cinco módulos nuevos no existen (`ERR_MODULE_NOT_FOUND`) y el
cableado estructural falla en los diez puntos. Sobre la rama: **GREEN**, suite
completa **1.602 tests, 1.592 aprobados, 0 fallos, 10 omitidos** (corrida final, desde cero); `tsc`
limpio; build fresco exit 0 (`.next` borrado, `BUILD_ID NACNH_S5PhBC-E7_qhYlj`, con el
entorno del banco); `git diff --check` limpio. Tres tests existentes se ajustaron al
contexto compuesto y al timeout parametrizado (`cache-disponibilidad-
inventario`, `disponibilidad-barrido`, `home-turno-cableado`), sin aflojar lo
que fijaban.

### 22.4 Banco de identidad del Home — `scripts/banco/comparar-home.mjs`

Evidencia: `docs/medidas/2026-09-14-etapa3a-identidad-home.json`.

**Aislamiento de cachés (§14):** dos juegos de dobles (`BANCO_PUERTO_BASE`
4801 para `b7be927`, 4811 para la rama), dos `next start` (3000/3001) cada
uno con `UPSTASH_REDIS_REST_URL`, `TMDB_BASE_URL` y `NEXT_PUBLIC_SUPABASE_URL`
apuntando a los suyos: turno, fresca, UB, degradado, generación, `card:`,
`pv3:` y `disc:` separados. Cada corrida fría vacía **cada** Redis (0 claves
registradas) y exige, en las **dos** versiones, `[home] compone`, `cache MISS`,
`1 composición` y llamadas a TMDB iguales entre lo que dice la app y lo que
recibió su doble; la caliente exige HIT/HIT y 0 llamadas. `YUMP_FECHA =
2026-09-14`, `VERSION_HOME = 6` en los dos fuentes (verificado; si difiere, la
corrida es inválida).

**Resultado exacto:** 16 escenarios, **16 válidos, 16 idénticos** —
`n,d,m` / `n` / `n,d` / `d,m` / `n,d,m,at,p,cr` × `t` por defecto /
`accion:tv` / `ultimos:tv,comedia:movie`, cada uno frío y caliente, más 3
claves concurrentes en las dos versiones (3/3 composiciones, 2.059/2.059
llamadas a TMDB). JSON completo idéntico y, por riel y hero, mismos ids,
mismo orden, misma cantidad, mismas plataformas, 0 añadidos, 0 eliminados, 0
movidos. Llamadas a TMDB en frío idénticas por escenario (926, 989, 852, 894,
946, 988, 925, 967, 1.019, 1.082).

**Controles:** las cuatro mutaciones (eliminar, agregar, mover, cambiar
plataforma) **hacen fallar** al comparador; la corrida **compartida** (la rama
contra el Redis de `b7be927`, sin vaciar) es **rechazada** por el validador
(1.567 claves previas, HIT en el frío, 0 composiciones, 0 llamadas a TMDB,
sin `compone`).

### 22.5 Banco de fallo parcial — `scripts/banco/etapa3a-parcial.mjs`

Evidencia: `docs/medidas/2026-09-14-etapa3a-parcial.json`. Doble de TMDB en
modo `429-parcial` (10 % de los `watch/providers`, determinístico por hash;
`Retry-After: 2`), combinación `n,d,m`:

| | `b7be927` (RED) | Rama 3.a (GREEN) |
|---|---|---|
| Sin UB, Redis vacío | 93 × 429; el Home sale con 130 títulos (el relleno tapa los huecos con **otros** títulos), **`degradado: false`**, `origen propia`, **publicado como fresca y como UB** | 93 × 429; **`degradado: true`**, 93 descartes en la línea, `origen degradado-propio`, **no publicado** (fresca 0, UB 0, degradado compartido 1: ENFRIAR) |
| Con UB correcto (fresca y `pv3:` expiradas) | compone otro Home (**no** el UB), `degradado: false`, **reescribe la fresca** | `origen ultimo-bueno`, **sirve el UB correcto** (mismos ids que el sano), fresca no reescrita, UB intacto |

⚠️ Nota de método: la primera corrida del escenario "con UB" expiraba sólo la
fresca y **no probaba nada** (los `pv3:` de 8 h seguían calientes, no se pedía
ningún `watch/providers` y el 429 no tocaba a nadie: las dos versiones daban
lo mismo). Se corrigió expirando también `pv3:` — MANTENIMIENTO 8.b.

### 22.6 Comprobado / inferido / desconocido (de esta implementación)

- **Comprobado (ejecutado):** todo §22.3-§22.5; que con TMDB sano el Home es
  idéntico en las 16 combinaciones y en concurrencia; que los controles del
  comparador y del aislamiento funcionan; que el 429 parcial ya no se publica
  y que con UB se sirve el UB correcto; que con los reintentos apagados los
  intentos = llamadas (926 = 926 en todos los fríos).
- **Inferido:** que en Producción, con el catálogo real, el comportamiento
  sano es igualmente idéntico (el banco usa dobles determinísticos, no el
  catálogo real); que un `503` con `Retry-After` llega al cliente tal cual a
  través de Vercel (no se provocó).
- **No verificable acá:** el efecto en tráfico real de marcar más Homes como
  degradados (más `ENFRIAR`, más UB servido) cuando TMDB devuelva 429
  parciales de verdad — se observa en `[home]` tras el deploy, sin provocarlo.
- **Desconocido, sin cambios:** todo lo de §18.

### 22.7 Lo que NO está y sigue pendiente de las sub-etapas siguientes

Limitador y cadencias (3.c), pausa distribuida, AIMD y circuito (3.b),
`waitUntil` y `COMPOSICION_MAX_MS` (3.e), membresía (3.d, no aprobada),
presupuesto por `getDeadline` (sin dependencia nueva), cliente Deno (3.f),
retries del SDK de Redis (3.R). **Los reintentos quedan apagados hasta 3.c'.**

---

## 23. Corrección de la 3.a tras la auditoría de Codex sobre `e930a1d` — pendiente de nueva auditoría

Cuatro huecos, reproducidos con pruebas **funcionales** (composición real con
dobles inyectados, no búsqueda de expresiones) que fallan contra `e930a1d` y
pasan en la rama; más un barrido que reemplaza al inventario "de once".

### 23.1 Los hallazgos y su corrección

| # | Hallazgo (Codex) | Reproducción (RED contra `e930a1d`) | Corrección | Archivo |
|---|---|---|---|---|
| 1 | `directorCards()` registraba el descarte **fuera** de todo contexto (no hacía nada) y `cached` incondicional guardaba la lista parcial `TTL.catalog` (24 h) | `lib/lotes-tolerantes.test.ts`: con `resolverConCache` real y un doble que devuelve 429 para un id, en `e930a1d` el módulo no existe; el **control** reproduce el comportamiento viejo (guarda la lista corta y la segunda llamada no reintenta al caído) | `resolverDirectores` (puro): responde con los que llegaron, **no guarda**, la siguiente llamada vuelve a intentar y guarda sólo cuando llegan todos; la causa TMDB se registra en el contexto que la envuelva | `lib/lotes-tolerantes.ts`, `lib/enrich.ts` `directorCards` |
| 2 | En la búsqueda, tras recuperar un fallo de `providersOf` con `tituloSinPlataformas`, `identidadDeBusqueda()` volvía a pedir `providersOf()` sin protección: con 429 persistente, el dato opcional convertía toda la búsqueda en 503 | `lib/busqueda-enriquecido.test.ts`: doble con 429 persistente en un título; el **control** ("identidad para todos, como antes") rechaza con 429; el módulo no existe en `e930a1d` | `enriquecerElegidos` (puro): la identidad **no se pide** a un título cuyo `providersOf` ya falló (queda sin deduplicar, como todo lo que no tiene identidad); `producirBusquedaConFallos` abre el contexto compuesto y devuelve el verdicto de caché (`fallo` si idioma, disponibilidad o descartes). `search()` lo entrega a `cachedLocIf`; el test lo entrega a `resolverConCache` — la misma función y el mismo verdicto (`cachedIf` = `resolverConCache`, fijado por `lib/cache-delega.test.ts`) | `lib/busqueda-enriquecido.ts`, `lib/enrich.ts` `search`/`paginasDeBusqueda`/`partirPorPlataformas` |
| 3 | `genreCovers()` convertía el fallo de un género en `[]` y `cached` guardaba el mapa incompleto 24 h — un doceavo sitio que el inventario de once no tenía | `lib/lotes-tolerantes.test.ts` (portadas): el género caído usa el fallback visual (`null`) y el mapa **no se guarda**; al volver TMDB, la siguiente llamada trae la portada y guarda | `resolverPortadas` (puro) | `lib/lotes-tolerantes.ts`, `lib/enrich.ts` `genreCovers` |
| 3′ | "No sigas afirmando once sitios si el barrido encuentra más" | `lib/descartes-tmdb-inventario.test.ts`: barrido de **todo** `catch`/`.catch(`/`allSettled` en `lib/*.ts` y `app/api/**/route.ts` (sin comentarios; el `\r` de CRLF se quita antes, porque es terminador de línea para `.` y `$` y dejaba pasar comentarios), emparejado en orden con un inventario clasificado (`tmdb-registra` / `tmdb-propaga` / `no-tmdb`); los `tmdb-registra` tienen que registrar la causa en las 14 líneas siguientes. Contra `e930a1d`: sitios sin clasificar | El barrido encontró, además de `genreCovers`, tres sitios que podían recibir un `ErrorTmdb` sin registrarlo: `lib/disponibilidad.ts` (`leerDatosTitulo`, el detalle en `IDIOMA_EVIDENCIA`), `lib/netflix-resolver.ts` (`buscar`, dos veces) y `app/api/recordatorio/route.ts` (`digitalAR`, `datosDe`). Los cuatro registran la causa; **ninguno cambia de comportamiento** (ya no cacheaban o ya respondían `null`/`sinMatch`). Total del barrido: **79 sitios**, todos clasificados — 22 que pueden recibir un `ErrorTmdb` y registran la causa (o la relanzan clasificada), 25 catch de rutas y envoltorios que propagan como estado HTTP, 32 que no pueden ser TMDB (Supabase, Redis, JSON del cliente, URL, navegador) | `lib/disponibilidad.ts`, `lib/netflix-resolver.ts`, `app/api/recordatorio/route.ts` |
| 4 | `SearchView` conservaba `fuenteCaida = true` cuando la búsqueda siguiente fallaba por red, se cancelaba o cambiaba de término | `components/busqueda-estado.test.ts`: reductor puro; 503 → aviso; después red / nuevo término / respuesta no vigente / término corto → sin aviso. El módulo no existe en `e930a1d` | `reducirBusqueda` (puro) + un número de pedido (`pedidoVigente`) en `SearchView`: una respuesta de un pedido superado se descarta entera, aviso incluido | `components/busqueda-estado.ts`, `components/SearchView.tsx` |

### 23.2 Verificación

- **RED contra `e930a1d`** (worktree detached, los cuatro archivos de test
  copiados): `lotes-tolerantes`, `busqueda-enriquecido` y `busqueda-estado`
  fallan por módulo inexistente; `descartes-tmdb-inventario` falla por sitios
  sin clasificar. 4 de 6 casos fallan; los 2 que pasan son comprobaciones del
  propio inventario que en el árbol viejo quedan vacías.
- **GREEN**: suite **1.621 tests, 1.611 aprobados, 0 fallos, 10 omitidos**;
  `tsc` limpio; build fresco exit 0 (`.next` borrado; `BUILD_ID
  YvPdy_raIppKkZ6u_-aBf`); `git diff --check` limpio. Dos barridos existentes
  se ajustaron sin aflojarlos: el inventario de cachés admite que el contexto
  de la búsqueda se abra en `lib/busqueda-enriquecido.ts` (`archivoContexto`),
  y el barrido de familias de claves reconoce `resolverConCache({ clave:
  o.clave ?? "…" })` además de `cached("…")`.
- **Banco de identidad del Home** (cachés totalmente separadas, mismo
  procedimiento de §22.4): **16/16 válidos e idénticos**, controles
  correctos (`docs/medidas/2026-09-14-etapa3a-identidad-home.json`, corrida
  final con el doble actual).
- **Banco de 429 parcial** (`docs/medidas/2026-09-14-etapa3a-parcial.json`),
  ahora con **búsqueda**: el doble de TMDB responde `/search/{movie,tv}` con
  20 títulos que contienen la consulta (antes devolvía vacío y la búsqueda no
  probaba nada — MANTENIMIENTO 8.b). Con páginas sanas y 429 parcial en
  `watch/providers`: `b7be927` → **500**; la rama → **200**, 24 títulos, 1
  sin plataformas, `degradacion { proveedores: 1 }`, **no guardado** (0 claves
  `search:`; la segunda búsqueda vuelve a pedir proveedores). Con 429 total:
  `b7be927` → 500; la rama → **503** con `Retry-After: 3` y motivo. Home sin
  UB y con UB: como en §22.5 (RED en `b7be927`, GREEN en la rama).

### 23.3 Comprobado / inferido / pendiente

- **Comprobado (ejecutado):** los cuatro RED y sus GREEN; el barrido completo
  y su clasificación; que el contenido sano del Home sigue idéntico (16/16);
  la búsqueda con 429 parcial y total en el banco; que el resultado parcial de
  directores y portadas no se guarda y la llamada siguiente reintenta (con el
  resolver real).
- **Inferido:** que en `e930a1d` la búsqueda con 429 parcial persistente daba
  503 en Producción (se reproduce con el control puro; el banco corrió
  `b7be927`, no `e930a1d`, y ahí es 500).
- **Pendiente:** nueva auditoría de Codex; las rutas que no son ficha ni
  búsqueda siguen respondiendo `500` ante un fallo principal de TMDB
  (clasificadas `tmdb-propaga`; traducirlas a `503` no estaba en el mandato);
  `netflix-resolver` sigue tratando "no sé" como `sinMatch` (contrato
  conservado a propósito).

---

## 24. Segunda corrección de la 3.a — auditoría de Codex sobre `09b9dbe`; pendiente de nueva auditoría

### 24.1 Hallazgo 1 — carrera durante el debounce de la búsqueda

**Reproducción (RED contra `09b9dbe`):** `components/busqueda-controlador.test.ts`
prueba el **controlador** —generación, debounce y respuesta— con reloj y
fetch inyectados, no sólo el reductor. La secuencia exacta: empieza el pedido A
(vence su debounce, sale el fetch); el usuario cambia a un término válido B;
**antes** de que venza el debounce de B responde A → A no emite ningún estado
(ni resultados, ni aviso de TMDB, ni "cargando" de B); después vence el
debounce de B, sale B y completa. Cubre además cambios consecutivos (A→B→C:
sólo C sale, una vez), término corto (invalida y aborta el fetch en vuelo),
desmontaje (cancela el timer, aborta, una respuesta tardía no emite nada),
cambio de plataformas con el mismo término (nueva generación), fallo de red
del pedido vigente y de uno superado, y restaurar desde una ficha. El
**control** modela el código de `09b9dbe` con las mismas piezas —el número de
pedido tomado dentro del temporizador— y muestra que "pinta A" aunque el
usuario ya escribió B. Contra `09b9dbe` el módulo no existe: 4 de 7 casos del
lote fallan.

**Corrección:** `components/busqueda-controlador.ts` (puro): `cambiarTermino`,
`restaurar` y `desmontar` **invalidan en el acto** (generación, timer
pendiente, `AbortController` del fetch en vuelo) y una respuesta de una
generación anterior se descarta entera. `SearchView` crea el controlador una
vez (`useRef`), le pasa `setBusqueda` como `emitir`, y el efecto sólo llama a
`cambiarTermino(term, platforms)`; `loading` sale del estado del controlador;
al desmontar, `desmontar()`.

### 24.2 Hallazgo 2 — registros de TMDB sin contexto

**Auditoría de los sitios `tmdb-registra`** (22), por efecto real:

| Efecto | Sitios | Qué garantiza |
|---|---|---|
| **contexto** (el contador lo consume un predicado de caché o el `degradado` del Home) | `titleCard`, directores y portadas (`resolverConCache` no guarda con `fallo`), búsqueda (`producirBusquedaConFallos`), `settleAll`, pools y `safe()` del Home (`producirHome`), los dos respaldos de idioma, `leerDatosTitulo` de disponibilidad | prueba funcional citada en la fila (`lotes-tolerantes`, `busqueda-enriquecido`, `fallos-tmdb`, `fallos-disponibilidad`, banco de 429 parcial) |
| **observable** (además del contexto, la respuesta lo dice) | proveedores y trailer de la ficha (`degradacion.proveedores`, `degradacion.trailer`) | el campo existe y se escribe |
| **ruta** (ruta o tarea independiente que abre `conDescartesRegistrados`) | `safe()` del Top (`/api/top`), `enNetflixAR` y los dos `buscar` del resolver (`/api/cron/netflix-top10`), `digitalAR` y `datosDe` (`/api/recordatorio`) — y también `/api/directores` y `/api/genre-covers` | **una línea de resumen** por solicitud (`[tmdb] <ruta>: N descarte(s)`), sin cambiar la respuesta ni el contrato HTTP |
| **relanza** | los dos `catch` del cliente y el del bucle de reintentos | clasifican y relanzan `ErrorTmdb` |

**Reproducción (RED contra `09b9dbe`):** `lib/fallos-tmdb.test.ts` — fuera de
contexto, `registrarDescarteTmdb` devolvía `undefined` y no dejaba rastro
(inerte). `lib/descartes-tmdb-inventario.test.ts` — las rutas independientes no
abrían ningún contexto.

**Corrección:**
- `registrarDescarteTmdb` **nunca es inerte** y dice qué hizo: `contado`
  (dentro de un contexto: cuenta y calla, sin ruido por título), `logueado`
  (fuera de contexto: **una** línea estructurada `[tmdb] descarte sin contexto
  sitio=… clase=… estado=… path=…`) o `ignorado` (no es de TMDB).
- `conDescartesRegistrados(nombre, fn)`: abre el contexto y resume en una sola
  línea si hubo descartes. Lo abren las cinco rutas independientes
  (`directores`, `genre-covers`, `top`, `cron/netflix-top10`, `recordatorio`).
  Sin duplicar conteos: adentro del contexto el registrador cuenta y no
  loguea; el resumen es una línea por solicitud.
- El inventario ya no acepta "el nombre de la función aparece cerca": cada
  fila `tmdb-registra` declara su **efecto** (`contexto` + prueba funcional
  existente, `ruta` + archivo que abre `conDescartesRegistrados`,
  `observable` + campo escrito, `relanza` + `throw`), y el test lo verifica.
  Dos tests nuevos fijan que las cinco rutas resumen y que el registrador
  fuera de contexto loguea (control: una función que traga un `ErrorTmdb`
  sin registrar no deja rastro).

### 24.3 Comparación antes/después de la búsqueda sana (nueva)

`scripts/banco/comparar-busqueda.mjs` (los helpers comunes a los dos
comparadores viven ahora en `scripts/banco/comparar-comun.mjs`): dos juegos de
dobles, dos `next start`, Redis vaciado por corrida fría, JSON completo de
`/api/search` comparado (títulos: ids, orden, cantidad, plataformas; personas),
5 consultas × 3 listas de plataformas, frío y caliente, llamadas a TMDB iguales
en las dos versiones y 0 en caliente, y cuatro mutaciones que el comparador
detecta. **Resultado: 15/15 válidos e idénticos** (31/31 llamadas en frío, 24
títulos, HIT/HIT), controles correctos
(`docs/medidas/2026-09-14-etapa3a-identidad-busqueda.json`).

### 24.4 Verificación

- RED contra `09b9dbe` (worktree detached, tests copiados): `busqueda-controlador`
  (módulo inexistente), `fallos-tmdb` (sin `conDescartesRegistrados`; el
  registrador devolvía `undefined`), inventario (rutas sin resumen y filas sin
  efecto) — 4 de 7 lotes fallan; los 3 que pasan son casos que en el árbol
  viejo quedan vacíos.
- GREEN: suite **1.637 tests, 1.627 aprobados, 0 fallos, 10 omitidos**; `tsc`
  limpio; build fresco exit 0 (`.next` borrado, `BUILD_ID
  4_DM_66ObNrLGHOn1tenZ`); `git diff --check` limpio.
- **Banco de identidad del Home** con cachés aisladas: **16/16 válidos e
  idénticos**, controles correctos (repetido con el build final).
- **Banco de 429 parcial** (Home y búsqueda): `b7be927` RED (publica el Home
  mutilado; búsqueda 500), rama GREEN (degradado sin publicar, UB correcto;
  búsqueda 200 degradada sin guardar; 503 + `Retry-After` ante 429 total).
- **Banco de identidad de la búsqueda**: 15/15.

### 24.5 Comprobado / inferido / pendiente

- **Comprobado (ejecutado):** todo §24.4; la carrera del debounce reproducida
  con el modelo del código viejo y ausente en el controlador nuevo; que fuera
  de contexto el registrador deja una línea y dentro cuenta sin loguear; que
  las cinco rutas resumen; que el Home sano y la búsqueda sana son idénticos a
  `b7be927`.
- **Inferido:** que el controlador se comporta igual dentro de React que en
  el arnés (el arnés inyecta reloj y fetch; React sólo aporta `setState` y el
  ciclo de vida, y no se ejecuta en `node --test`); que en Producción una
  respuesta tardía real cae dentro de la ventana del debounce con la misma
  frecuencia que en el modelo.
- **Pendiente:** nueva auditoría de Codex; las rutas distintas de ficha y
  búsqueda siguen respondiendo `500` ante un fallo principal (clasificadas
  `tmdb-propaga`); el resumen por ruta es un log, no una métrica persistente
  (#20).

---

## 25. Tercera corrección de la 3.a — auditoría de Codex sobre `708bce0`; pendiente de auditoría final

### 25.1 Hallazgo 1 — la carrera real entre `onChange` y `useEffect`

**El hueco.** El controlador de §24 invalidaba bien, pero `SearchView` lo
llamaba recién desde el `useEffect`; el `onChange` sólo hacía `setQ`. Entre
el evento y el efecto hay un render de React: una respuesta de A que llegaba
en ese intervalo seguía siendo "vigente" y se pintaba (resultados o aviso de
TMDB) sobre el texto B.

**Reproducción (RED contra `708bce0`):**
- `components/busqueda-adaptador.test.ts` modela explícitamente las DOS fases
  de React: `evento(texto)` es exactamente lo que hace el `onChange` real
  (`setQ` + `escribir`) y `render()` exactamente lo que hace el `useEffect`
  (`efecto` con el estado actual); entre uno y otro el test hace llegar la
  respuesta de A. El `pedir` inyectado **ignora la señal de cancelación** a
  propósito: la generación tiene que descartar la respuesta aunque el fetch
  no honre el abort. Casos: A responde entre `onChange(B)` y el efecto (nada
  se emite; el efecto no programa B dos veces); B sale una sola vez aunque el
  efecto corra varias veces; A→B→C con renders desfasados; término corto en
  el evento; cambio de plataformas (llega por el efecto, no por el evento);
  restauración (el efecto con el q restaurado no pide; renders posteriores
  tampoco; escribir después sí pide); desmontaje; vista no lista (el evento
  no pide, el efecto pide una vez); fallo de red de A en el intervalo. El
  **control** cablea el controlador real como en `708bce0` (evento = sólo
  `setQ`; controlador sólo desde el efecto) y muestra que "pinta A".
  Contra `708bce0` el módulo no existe: el archivo entero falla.
- `components/busqueda-cableado.test.ts` es el **guard de fuente**: extrae el
  `onChange={…}` balanceado del input del buscador y exige `setQ(` **y**
  `adaptador.current!.escribir(` en el mismo handler; prohíbe literalmente el
  cableado `onChange={(e) => { setQ(e.target.value); setExplore(null); }}`;
  exige que la vista use `efecto`, `restaurar` y `desmontar` del adaptador y
  que no llame a `cambiarTermino(` ni tenga `qRestaurado`. Contra `708bce0`:
  «el handler sólo hace setQ: la invalidación queda para el efecto».

**Corrección:** `components/busqueda-adaptador.ts` (puro) sobre el
controlador: `escribir(texto, { plataformas, listo })` —el evento— invalida y
programa en el acto; `efecto({ q, plataformas, listo })` —el `useEffect`—
sólo cubre lo que el evento no pudo (plataformas nuevas, la vista recién
lista, el q que llega de un snapshot) y **no repite un pedido ya aceptado**
(clave texto+plataformas del último aceptado); `restaurar(q, res)` deja la
marca del snapshot; `desmontar()`. `SearchView`: el `onChange` llama a
`escribir` en el mismo handler que `setQ`; el efecto sólo llama a `efecto`;
la marca `qRestaurado` se mudó al adaptador.

### 25.2 Hallazgo 2 — inventario con falsos verdes

**El hueco.** `efecto: contexto` verificaba que existiera un archivo de
prueba; `efecto: ruta`, que `conDescartesRegistrados` apareciera en cualquier
lugar del archivo. **Demostrado contra `708bce0`** (worktree separado, fuente
mutado): con el wrapper corrido fuera de `buildTop` en `/api/top`, la card
sin `withFallosDeFuentes` y `resolveTitle` sin llamar a `enNetflixAR`, el
inventario de `708bce0` seguía **5/5 verde**; el nuevo falla nombrando cada
mutación («conDescartesRegistrados no envuelve buildTop(»; «titleCard no
abre withFallosDeFuentes(»; «resolveTitle no llama a enNetflixAR(»).

**Corrección** (`lib/descartes-tmdb-inventario.test.ts`): cada fila
`tmdb-registra` trae la EVIDENCIA de su efecto, de tres tipos:

| Evidencia | Sitios | Qué hace el test |
|---|---|---|
| **ejecución** (9) | directores, portadas, búsqueda, `settleAll`, idioma ×2, disponibilidad, resolver ×2 | corre el sitio con su dependencia caída por `ErrorTmdb` dentro de `withFallosTmdb`: el contexto ve el descarte y el **consumidor** actúa (el parcial no se guarda; `fallo: true`; 'no sé' y no 'no está'); los del cron, además, por `conDescartesRegistrados` → una línea `1 descarte(s)`; **control**: fuera de todo contexto cada uno deja la línea `sin contexto sitio=<nombre>` |
| **estructura** (8) | `titleCard`, `safe()` del Home, pools, `safe()` del Top, `enNetflixAR`, `digitalAR`, `datosDe`, y la cadena del resolver | sobre el fuente sin comentarios (líneas intactas), con paréntesis y llaves balanceados: el wrapper de la ruta envuelve **exactamente** `operacion(` (una envoltura con ella y ninguna llamada fuera); la **cadena** función por función (`buildTop → safe`, `ingestLatestWeek → resolveTitle → enNetflixAR`, `datosDe → digitalAR`) termina con la línea del sitio dentro del cuerpo de la última; la apertura del contexto envuelve la operación y el contenedor **consume** el contador (`if (fallos) fallo = true` + `() => !fallo`; `degradado: true` + `fallosTmdb`) |
| **banco** (3) | `titleCard`, `settleAll`, pools | además del guard, el recorrido real con dobles: se lee la evidencia y se exige `degradado`, descartes > 0 y sin publicar |
| observable (2) / relanza (3) | ficha; cliente y política | el registro y `degradacion.<campo> = true` en el **mismo** `.catch(` de `detail()`, que devuelve `{ degradacion }`; `throw` dentro del bloque `catch` |

**Controles mutados** (sobre el fuente real, en el mismo archivo): wrapper
corrido fuera de la operación, operación llamada también fuera, wrapper
quitado, cadena cortada (`buildTop` sin `safe`, `ingestLatestWeek` sin
`resolveTitle`, `datosDe` sin `digitalAR`); apertura quitada, sitio sacado
del callback, consumo quitado, `composeHome` desenvuelto — todos hacen fallar
el guard.

**Banco nuevo (escenario D, pools):** `scripts/banco/etapa3a-parcial.mjs`
ahora también pide el Home con 429 parcial en `/discover` (el doble elige la
fracción por la URL entera, `parcialPorQuery`, porque en `/discover` el path
es siempre el mismo). `b7be927`: 8 × 429 tragados por los pools, `degradado:
false`, publicado como fresca y UB (**el hueco S5, reproducido**). Rama:
`degradado: true`, 8 descartes, sin publicar.

Se corrigió el nombre del test de `lib/fallos-tmdb.test.ts` ("fuera, no hace
nada" → "fuera, loguea una línea") y ahora afirma `logueado` con una línea.
`registrarDescarteTmdb` no cambió: dentro de contexto cuenta y calla; fuera,
una línea estructurada.

### 25.3 Verificación

- **RED contra `708bce0`** (worktree detached `wt-708b`, tests copiados):
  `busqueda-adaptador.test.ts` (módulo inexistente), `busqueda-cableado.test.ts`
  (2/2 fallan con el mensaje exacto). El inventario nuevo sobre el fuente
  **sin mutar** de `708bce0` pasa 12/13 (el código ya era correcto; falla
  sólo el escenario de banco que aún no existía) — y sobre el fuente
  **mutado** falla donde el viejo seguía verde (§25.2).
- **GREEN**: suite **1.658 tests, 1.648 aprobados, 0 fallos, 10 omitidos**;
  `tsc --noEmit` limpio; build fresco exit 0 (`.next` borrado; `BUILD_ID`
  final `1ywvZTpx9vpG1EbcA9WA0`, tras corregir un byte NUL que la escritura
  del adaptador había dejado en el fuente — el runtime era idéntico —; los
  bancos de 429 parcial y de búsqueda corrieron sobre el build previo
  `kZjClDe8HCDjqlI-LfIEW`, con el mismo código de servidor; el del Home se
  repitió sobre el final); `git diff --check` limpio.
- **Identidad del Home** (cachés aisladas, `b7be927` vs rama, build final):
  **16/16 válidos e idénticos**, controles de mutación y de caché compartida
  correctos.
- **Identidad de la búsqueda sana**: **15/15**, 4 mutaciones detectadas.
- **429 parcial** (`docs/medidas/2026-09-14-etapa3a-parcial.json`):
  `antesRojo`, `despuesVerde`, con el escenario D nuevo.
- Sin TMDB real; sin limitador, cadencias, pausa, circuito, `waitUntil` ni
  membresía; ningún cambio en `lib/home.ts`, `lib/pools.ts`, `lib/enrich.ts`
  ni en el contrato JSON (el diff toca `SearchView`, el adaptador, tests y el
  banco).

### 25.4 Comprobado / inferido / pendiente

- **Comprobado (ejecutado):** todo §25.3; la carrera evento→efecto
  reproducida con el cableado de `708bce0` y ausente con el adaptador; que
  el fetch que ignora la señal igual se descarta por generación; que el
  inventario viejo era verde con tres mutaciones reales y el nuevo las
  nombra; que los nueve sitios importables cuentan en el contexto y su
  consumidor actúa; que pools llega al `degradado` del Home por el
  recorrido real (escenario D) y que `b7be927` no lo hacía.
- **Inferido:** que el arnés del adaptador equivale al orden real de React
  (evento sincrónico, efecto tras el commit) — el arnés no ejecuta React; que
  la verificación estructural (cadena de llamadas por cuerpo de función)
  equivale a la ejecución para los ocho sitios `server-only`/`next/server`
  que no se pueden importar en `node --test`; que el `safe()` del Home
  registra por el mismo camino que los pools (el banco D lo ejercita sólo si
  un `discover` fuera de pools cae, cosa que no se mide por sitio).
- **Pendiente:** auditoría final de Codex; la atribución **por sitio** de
  los descartes del banco (la línea `[home]` cuenta el total, no el sitio);
  las rutas distintas de ficha y búsqueda siguen respondiendo `500` ante un
  fallo principal (`tmdb-propaga`); el resumen por ruta es un log, no una
  métrica persistente (#20). **La etapa no está terminada.**

---

## 26. Cuarta corrección de la 3.a — auditoría de Codex sobre `03ad4b9`; corregida en rama, pendiente de auditoría final

### 26.1 El bloqueante

La fila de `pools` del inventario declaraba `cadena:
["lib/pools.ts#candidatosDePools"]`. `verificarContexto()` confirmaba por
separado que `withFallosDeFuentes(` envolviera `composeHome(` y que el sitio
estuviera dentro de `candidatosDePools`, pero la cadena real —`composeHome`
→ `candidatosDeSuperficie` (enrich) → `candidatosConEje` → `candidatosDePools`
(pools)— no se probaba: un enlace perdido en el medio quedaba verde, y el JSON
del banco no lo reemplaza (es una foto de una corrida, no la relación
estructural del código actual).

### 26.2 RED contra `03ad4b9`

- **Control nuevo sobre la fila/verificador de `03ad4b9`** (aplicado en el
  árbol antes de tocar la fila): cortar `composeHome → candidatosDeSuperficie`
  en el fuente no hace fallar nada → «Missing expected exception» (13/14).
- **Inventario de `03ad4b9` con los tres enlaces reales cortados** (worktree
  detached, `sed` por rango de líneas de la función, un enlace por vez):
  `composeHome→candidatosDeSuperficie` **13/13 verde**;
  `candidatosDeSuperficie→candidatosConEje` **13/13 verde**;
  `candidatosConEje→candidatosDePools` **13/13 verde**. Falso verde
  reproducido.

### 26.3 Corrección (sólo `lib/descartes-tmdb-inventario.test.ts`)

- **Verificador:** con `operacion` declarada, la cadena tiene que **arrancar
  en esa operación** (`cadena[0]` = `composeHome`) y terminar con la línea del
  sitio dentro del cuerpo de la última función; cada enlace se verifica
  cuerpo por cuerpo con los fuentes que correspondan a cada archivo
  (`fuentes[archivo] ?? limpio(archivo)`), así que cruza archivos. Una
  cadena que arranque más abajo falla: «la cadena no arranca en composeHome».
- **Fila de pools:** `cadena: [lib/home.ts#composeHome,
  lib/enrich.ts#candidatosDeSuperficie, lib/pools.ts#candidatosConEje,
  lib/pools.ts#candidatosDePools]`. El banco (`discover`) queda como evidencia
  **adicional**; no sustituye la relación estructural.
- **Control mutado nuevo** sobre **la fila real** (no una cadena escrita a
  mano): corta cada enlace en el fuente real y exige el mensaje con el enlace
  perdido; muda el sitio a otra función («no está dentro de
  lib/pools.ts#candidatosDePools»); y prueba que la cadena de `03ad4b9`
  (`[candidatosDePools]`) ya no pasa.
- **Números de línea:** `lineaDelCatch(fuente, marcador)` devuelve la línea
  **basada en 1** del `catch`/`allSettled` más cercano hacia arriba del
  registro; reemplaza los cinco `findIndex()` de los controles (dos de ellos
  —`enNetflixAR` y `digitalAR`— estaban en base 0, y el de `top.ts` dependía
  de `i > 140`). Los controles de esas cadenas ahora también afirman que el
  fuente sin mutar pasa.

### 26.4 GREEN

- Inventario 14/14. Con cada enlace real cortado (por separado):
  «lib/home.ts#composeHome no llama a candidatosDeSuperficie(»;
  «lib/enrich.ts#candidatosDeSuperficie no llama a candidatosConEje(»;
  «lib/pools.ts#candidatosConEje no llama a candidatosDePools(» — siempre
  sobre `lib/pools.ts:288`.
- Suite **1.659 tests, 1.649 aprobados, 0 fallos, 10 omitidos**; `tsc
  --noEmit` limpio; build fresco exit 0 (`BUILD_ID a3F7MAG8PGs_0Nfa6iQjs`);
  `git diff --check` limpio.
- Identidad del Home (cachés aisladas, `b7be927` vs rama, build final):
  **16/16 válidos e idénticos**, controles correctos.
- **Ningún archivo productivo ni el contrato JSON cambió**: el diff contra
  `03ad4b9` toca sólo el test del inventario, la evidencia JSON del Home
  (regenerada, idéntica en veredicto) y los tres documentos.

### 26.5 Comprobado / inferido / pendiente

- **Comprobado:** todo §26.2 y §26.4.
- **Inferido:** que la cadena declarada es la única por la que el Home llega
  a `candidatosDePools` con eje (también hay una llamada directa de
  `candidatosDeSuperficie` a `candidatosDePools` sin eje; la fila fija el
  camino con eje, que es el que rota); que "el cuerpo de A contiene `B(`"
  equivale a "A llama a B" — un `B(` dentro de un string o de código muerto
  del cuerpo pasaría (el fuente se limpia de comentarios, no de strings).
- **Pendiente:** auditoría final de Codex. Corregida en rama; **la etapa no
  está terminada**.

---

## 27. Quinta corrección de la 3.a — auditoría de Codex sobre `6ef35c5`; corregida en rama, pendiente de auditoría final

### 27.1 El hueco

La fila de pools exigía un único recorrido, `composeHome →
candidatosDeSuperficie → candidatosConEje → candidatosDePools`. Pero hay un
**segundo recorrido soportado y deliberado**: con `EJES_RIELES=0`, `home.ts`
no pasa `superficie`, y `candidatosDeSuperficie` llama a `candidatosDePools`
**directo**, fuera del bloque de ejes. Ese camino no es un error; lo que hay
que garantizar es que **todo recorrido soportado que llegue al descarte de
pools conserve el contexto abierto por `producirHome`** y que el Home
degradado no se publique.

### 27.2 RED contra `6ef35c5` (worktree detached)

- Cortada **sólo la llamada directa** `candidatosDeSuperficie →
  candidatosDePools` (la de `EJES_RIELES=0`): inventario **14/14 verde** — el
  recorrido sin ejes no estaba representado.
- Cortado `candidatosConEje → candidatosDePools`: 12/14 — sólo el camino con
  ejes se distinguía.
- La evidencia del banco tenía un solo escenario de pools (con ejes).

### 27.3 Corrección (test del inventario + banco; sin código productivo)

- **Enlaces calificados:** un enlace de la cadena puede exigir que la llamada
  a la función siguiente esté `dentroDe` un bloque `if (…) {` dado, o
  `fueraDe` todos los bloques dados (llaves balanceadas sobre el fuente). Es
  lo que distingue dos recorridos que pasan por la misma función.
- **Recorridos:** la fila declara `recorridos` con nombre y **todos** tienen
  que arrancar en la operación envuelta y terminar en el sitio:
  - `con-ejes`: `composeHome → candidatosDeSuperficie` (llamada a
    `candidatosConEje` **dentro de** `if (opts.superficie &&
    poolsHabilitados) {`) `→ candidatosConEje → candidatosDePools`;
  - `sin-ejes`: `composeHome → candidatosDeSuperficie` (llamada a
    `candidatosDePools` **fuera de** ese bloque y de `if (!poolsHabilitados)
    {`) `→ candidatosDePools`.
  Quitar `superficie` no se exige como fallo: activa el camino directo válido.
- **Controles mutados sobre la fila real**, cada uno con el mensaje que nombra
  el recorrido y el enlace: el corte común `composeHome →
  candidatosDeSuperficie` invalida **los dos**; `candidatosConEje →
  candidatosDePools` invalida `con-ejes` y deja vivo `sin-ejes`; la llamada
  directa cortada invalida `sin-ejes` y deja vivo `con-ejes`;
  `candidatosDeSuperficie → candidatosConEje` (dentro del bloque) invalida
  `con-ejes`; el sitio mudado a otra función hace fallar los dos; la fila de
  `03ad4b9` no arranca en `composeHome`; y la fila de `6ef35c5` (sólo con
  ejes) **no distingue** la llamada directa cortada (control del hueco).
- **Banco (escenario D, dos recorridos, cachés aisladas):** un segundo
  `next start` por versión con `EJES_RIELES=0` (la variable se lee del
  entorno del proceso), mismos dobles, Redis del banco vaciado antes de cada
  corrida. Resultado: `b7be927` **rojo** en los dos (con ejes: 8 × 429
  tragados; sin ejes: 7 × 429 tragados; `degradado: false`, publicado como
  fresca y UB). Rama **verde** en los dos: 429 provocado (8 / 7), descartes
  contados (8 / 7), `degradado: true`, fresca 0, UB 0. Los conteos distintos
  confirman que los dos procesos recorrieron consultas distintas.
- **`POOL_CACHE=0`:** con los pools apagados `candidatosDeSuperficie` va a
  `discover` directo y un fallo lo atrapa el `safe()` del Home (sitio
  `home:`): el sitio de pools **no se alcanza**. Queda documentado como fuera
  de este recorrido; no se inventó cobertura.
- El test del banco lee **ambos** escenarios (`pools.conEjes`,
  `pools.sinEjes`) como evidencia adicional; la relación estructural la
  verifica la fila.

### 27.4 GREEN

- Inventario 14/14; con cada corte real en el fuente, por separado:
  «recorrido con-ejes: lib/home.ts#composeHome no llama a
  candidatosDeSuperficie(»; «recorrido con-ejes: lib/pools.ts#candidatosConEje
  no llama a candidatosDePools(»; «recorrido sin-ejes:
  lib/enrich.ts#candidatosDeSuperficie no llama a candidatosDePools( fuera
  de `if (opts.superficie && poolsHabilitados) {` y `if (!poolsHabilitados)
  {`»; «recorrido con-ejes: lib/enrich.ts#candidatosDeSuperficie no llama a
  candidatosConEje( dentro de `if (opts.superficie && poolsHabilitados) {`».
- Suite **1.659 tests, 1.649 aprobados, 0 fallos, 10 omitidos**; `tsc
  --noEmit` limpio; build fresco exit 0 (`BUILD_ID fl5EFQfwgaz8KOYqCNaGa`);
  `git diff --check` limpio.
- Identidad del Home (cachés aisladas, `b7be927` vs rama, build final):
  **16/16 válidos e idénticos**.
- **Sin cambios en código productivo**: el diff contra `6ef35c5` toca el
  test del inventario, el script y la evidencia del banco, la evidencia del
  Home y los tres documentos.

### 27.5 Comprobado / inferido / pendiente

- **Comprobado:** todo §27.2 y §27.4; que `EJES_RIELES=0` recorre el camino
  directo y conserva el contexto (banco); que `b7be927` tragaba los 429 de
  pools por los dos caminos.
- **Inferido:** que la equivalencia "la llamada está fuera del bloque" ⇔
  "es la que se ejecuta sin `superficie`" vale mientras la estructura de
  `candidatosDeSuperficie` siga siendo `if (superficie && pools) {…} if
  (!pools) {…} directo` (el guard falla si cambian los encabezados, no si
  cambia la semántica); que con `POOL_CACHE=0` el sitio no se alcanza (leído
  del fuente, no ejecutado).
- **Pendiente:** auditoría final de Codex. Corregida en rama; **la etapa no
  está terminada**.
