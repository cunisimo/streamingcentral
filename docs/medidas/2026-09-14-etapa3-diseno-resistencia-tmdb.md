# Etapa 3 de capacidad — Resistencia frente a TMDB: auditoría y diseño (v4.1)

> **Estado: DISEÑO v4.1 + ETAPA 3.a MERGEADA, PUSHEADA Y DESPLEGADA
> (2026-09-15; §31) + ETAPA 3.b MERGEADA, PUSHEADA Y DESPLEGADA
> (2026-09-15; merge `5604750`, deployment
> `dpl_A9oAnbXKBqbBTGiKC6kMMLdFz3oB`; §37). Subetapa 3.b, "último bueno
> primero y reconstrucción en fondo": decisión de producto APROBADA; diseño
> §33; implementada (§34), corregida dos veces (§35, §36), aprobada por la
> auditoría final sobre `c5fab20` y desplegada; **camino UB-primero
> observado naturalmente en Producción** (§37). **Observación pasiva
> posterior y diseño revisado de la 3.c (§38, 16/09): sin serie posible en
> los logs (retención), sin señales negativas en lo observado; la 3.c se
> propone SIN limitador de tasa fija —medir (3.c.0), pausa compartida ante
> 429 (3.c.1), circuito del fondo (3.c.2)—; pendiente de aprobación y de
> auditoría; no implementada. **§39 (16/09, auditoría sobre `f7282a8`):
> diseño corregido en los ocho puntos y 3.c.0 EJECUTADA: el banco, una vez
> calibrado (pesimista 15-28 % frente a Producción), compone el frío total
> de 926 en 26 s de los 50 del fondo; con modelos más lentos, 40 s o
> cancelación. Una reconstrucción sola emite ráfagas de 80/s y dos
> simultáneas promedian 64/s. 3.c.1/3.c.2 NO aprobadas; pendiente de nueva
> auditoría. §40 (16/09, auditoría sobre `1ad1025`): siete correcciones —
> `PAUSAR` idempotente por identidad de evento (RED→GREEN sobre modelo),
> 3.c.0 reclasificada como sensibilidad ajustada (semillas, 3 repeticiones,
> dispersión ≤ 3 %; "926 ≈ 26 s" es extrapolación NO validada),
> `t_inicio_fondo` 0,30-0,37 s, umbrales antes/después fijados a priori,
> carrera cerrada dentro del script de adquisición del turno, observabilidad
> por evento y deltas, retirada la idea de provocar un frío total en
> Producción. 3.c.1 lista para auditoría de DISEÑO, no de implementación;
> 3.c.2 no aprobada. **Antecedentes superados (rotulados en cada sección):
> §41 (contrato con sobrepaso, lector, marcador), §42 (decisión del dueño:
> espera breve sin UB — la decisión sigue vigente, su bucle no), §43 (diez
> correcciones), §44 (tres correcciones). ESTADO VIGENTE de la 3.c: §45 +
> §46 + §47 + §48 + §49 + §50** — la señal del Home es el presupuesto interno (`AbortSignal.timeout`,
> sin `req.signal`) y el vencimiento sale por el centinela 4d; **un solo
> deadline absoluto `plazo` creado con la señal, `plazo − ahora` en lectura
> previa, espera, readquisición y composición** (§46, que además detecta el
> mismo defecto en el rescate de la Etapa 2 hoy en Producción); **el fondo
> con DOS límites absolutos — `min(inicioFondo + 50 s, inicioRuta + 60 s −
> margen de cierre)` — y, si no queda lugar para componer y publicar, UB
> servido sin fondo, turno liberado y `fondo: no-iniciado-presupuesto`**
> (§47); un solo sueño y una readquisición (≤ 2
> `EVAL`), `F_max = 1`, sólo `Δt`, marca de agua por proceso con TTL, Lua que
> falla seguro, sobrepaso parametrizado (estimaciones, no cotas) con línea
> base medida, matriz UB × Redis sin caché, `ESPERA_MAX = 5 s` provisional;
> modelo 88/88; ESTADO VIGENTE: §45 a §50 (la señal limita el trabajo
> nuevo; Redis ya enviado completa o pierde la respuesta, atómico y con
> fencing; tras el plazo sólo un `LIBERAR` de limpieza, una vez,
> estrictamente antes del corte externo, con recuperación EVENTUAL por
> TTL — ≤ 15 s desde la última renovación —; respuesta perdida aplicada o
> no aplicada, sin reintento; reservas, no máximos);
> 3.c.1 NO aprobada, NO implementada, pendiente de nueva auditoría; 3.c.2
> fuera de alcance.**** Ocho correcciones en rama (auditorías de Codex sobre
> `e930a1d` §23, `09b9dbe` §24, `708bce0` §25, `03ad4b9` §26, `6ef35c5` §27,
> `c6b299e` §28, `37f1ca1` §29 y `2886212` §30), aprobada por la auditoría
> final sobre `8177d2a`. Reintentos APAGADOS; limitador, circuito y
> membresía NO implementados: las subetapas restantes de la Etapa 3 siguen
> diseñadas y no aprobadas, y por ellas #19 sigue abierto. **`waitUntil` SÍ
> está implementado y desplegado con la 3.b** (sólo para la composición de
> fondo del Home; §34-§37). Corregida dos veces tras las
> auditorías sobre `c84996e` (§35) y `3a057fc` (§36: la compuerta se abre
> tras ceder al event loop con `setImmediate`; Preview aislado en §36.5).
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
> **Estado vigente de la 3.c (2026-09-18, §53 + §54 + §55): la 3.c.1 "pausa
> compartida ante 429" —diseño §45-§52 aprobado por el dueño— está IMPLEMENTADA
> en la rama `feat/etapa3c1-pausa-tmdb` y CORREGIDA dos veces: tras la
> auditoría de Codex sobre `6fc63b5` (§54: lecturas acotadas con pausa local,
> ring de cubos, un TIME por evento, tests deterministas; el Preview de la
> precondición usó el Redis de Producción con claves prefijadas y borradas,
> `DBSIZE` 802 → 90 no explicado) y tras la auditoría sobre `d322282` (§55: el
> tope de lectura con pausa local CANCELA el trabajo —lector acotado
> `leerAcotadasHome` sobre `redisLector`, sin reintentos y con señal por
> petición— en vez de una carrera que dejaba el MGET reintentando después del
> 503; medido: 18 MGET y 4 tardíos con `d322282` contra 3 y 0). Identidad del
> Home 16/16, umbrales dentro, criterios 4-8 verdes en el banco. NO mergeada,
> NO pusheada, NO desplegada, pendiente de auditoría FINAL. Kill switch
> `TMDB_PAUSA_429=0`. 3.c.2 fuera de alcance.**
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

> ⚠️ Lo que sigue quedó **incompleto**: los "dos recorridos" de esta sección
> no eran todos los que llegan al descarte de pools desde `composeHome`. §28
> los inventaría (nueve) y dice cuáles están ejecutados y cuáles no.

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

---

## 28. Sexta corrección de la 3.a — auditoría de Codex sobre `c6b299e`; corregida en rama, pendiente de auditoría final

### 28.1 El hueco

Los dos recorridos de §27 (`con-ejes`, `sin-ejes`) no eran todos los que
alcanzan `candidatosDePools` desde `composeHome`. Faltaba, al menos, la
**página extra** de un riel: `composeHome → genreRail | miniseriesRail →
categoryCandidates → candidatosDeSuperficie` (rama `opts.ejeFijo`) `→
candidatosDePools`, que llama directo dentro del bloque de ejes sin pasar por
`candidatosConEje`. Y el banco de 429 parcial en `/discover` agrega todas las
llamadas, así que no decía qué rama llegó al descarte.

**RED contra `c6b299e`** (worktree detached, un corte por vez en el fuente
real): cortada sólo la llamada de la rama `opts.ejeFijo` (`enrich.ts:1737`)
→ inventario **14/14 verde**; cortada la llamada directa de `audienceTitles`
(`enrich.ts:916`) → **14/14 verde**; cortado `candidatosConEje` de
`audienceTitles` (`enrich.ts:888`) → **14/14 verde**.

### 28.2 Inventario de call sites (verificable: un call site nuevo sin clasificar hace fallar el test)

Todas las llamadas productivas a `candidatosDePools(`, `candidatosConEje(` y
`categoryCandidates(` en `lib/` y `app/api/**` (barrido automático en
`lib/descartes-tmdb-inventario.test.ts`, tabla `CALL_SITES`; líneas al
`c6b299e`, el código productivo no cambió). ⚠️ El alcance del barrido de esta
sección era `lib/*.ts` y `app/api/**/route.ts` y sólo llamadas con el nombre
canónico: §29 lo corrige.

| # | Call site | Consumidor | ¿Desde `composeHome`? | Condición | Contexto | Llegada del descarte | Recorridos | Cobertura |
|---|---|---|---|---|---|---|---|---|
| 1 | `lib/pools.ts:485` `candidatosConEje` → `candidatosDePools` (`traer`) | toda adquisición con eje: ventana del eje del día y suelo `pop` | sí | ejes activos (`superficie`), `POOL_CACHE≠0` | `producirHome` (`withFallosDeFuentes`); desde `/api/recomendaciones` y `/api/audience`: ninguno | contador → `degradado: true` → no se publica | con-ejes, hero, audiencia-inicial | **ejecutada** (banco D conEjes, agregado) |
| 2 | `lib/enrich.ts:1737` `candidatosDeSuperficie` rama `opts.ejeFijo` → `candidatosDePools` | página extra de `genreRail` / `miniseriesRail` | sí | ejes activos + el riel no llenó su ventana | `producirHome` | contador → `degradado: true` | extra-genero-ejeFijo, extra-miniseries-ejeFijo | **ejecutada** (banco E conEjes: consulta identificada; género) / miniseries **estructural** |
| 3 | `lib/enrich.ts:1762` `candidatosDeSuperficie` directa (fuera del bloque de ejes) → `candidatosDePools` | rieles y páginas extra sin `superficie` | sí | `EJES_RIELES=0`, `POOL_CACHE≠0` | `producirHome` | contador → `degradado: true` | sin-ejes, extra-genero-sin-ejes, extra-miniseries-sin-ejes | **ejecutada** (banco D sinEjes; banco E sinEjes: consulta identificada) |
| 4 | `lib/enrich.ts:916` `audienceTitles` páginas siguientes → `candidatosDePools` | carruseles de audiencia | sí | `POOL_CACHE≠0` y la primera tanda no llenó | `producirHome`; desde `/api/audience`: ninguno | contador → `degradado: true` | audiencia-paginas | **estructural** (ningún banco identifica esta consulta) |
| 5 | `lib/enrich.ts:1742` `candidatosDeSuperficie` → `candidatosConEje` | rieles con `superficie` y hero | sí | ejes activos sin `ejeFijo` | `producirHome`; desde `/api/recomendaciones`: ninguno | contador → `degradado: true` | con-ejes, hero | **ejecutada** (banco D conEjes, agregado: no distingue riel de hero) |
| 6 | `lib/enrich.ts:888` `audienceTitles` → `candidatosConEje` | adquisición de audiencia | sí | `POOL_CACHE≠0` | `producirHome`; desde `/api/audience`: ninguno | contador → `degradado: true` | audiencia-inicial | **estructural** |
| 7 | `lib/enrich.ts:736` `tandaAncha` → `categoryCandidates` | hero (`recommendations`, `HERO_ANCHO≠0`) | sí | `superficie: "hero"` siempre → `candidatosConEje` | `producirHome`; desde `/api/recomendaciones`: **ninguno** (el registro queda fuera de contexto: línea `[tmdb] descarte sin contexto sitio=pool`) | Home: contador; ruta: sólo el log, la respuesta sale con lo que hay | hero | **estructural** / ruta **inferida** |
| 8 | `lib/home.ts:365` `genreRail` → `categoryCandidates` | página extra de un riel de género | sí | el riel no llenó; con ejes `ejeFijo`, sin ejes directo | `producirHome` | contador → `degradado: true` | extra-genero-ejeFijo, extra-genero-sin-ejes | **ejecutada** (banco E, `with_genres=28`) |
| 9 | `lib/home.ts:407` `miniseriesRail` → `categoryCandidates` | página extra de miniseries | sí | ídem | `producirHome` | contador → `degradado: true` | extra-miniseries-ejeFijo, extra-miniseries-sin-ejes | **estructural** (el banco E eligió una receta de `/discover/movie`) |

Rutas API que alcanzan estos sitios **sin** contexto: `/api/recomendaciones`
(#5, #7 vía `recommendations`) y `/api/audience` (#1, #4, #6 vía
`audienceTitles`). Ahí `registrarDescarteTmdb` **no es inerte** (deja la
línea estructurada, §24) pero nadie consume el contador: envolverlas con
`conDescartesRegistrados` es un cambio productivo y queda **fuera** de esta
corrección (pendiente). `POOL_CACHE=0` no alcanza ningún call site de pools
(`candidatosDeSuperficie` y `audienceTitles` van a `discover` directo; un fallo
lo atrapa el `safe()` del Home).

Resumen de cobertura (corregido en §29: una sola categoría por recorrido, la
suma da nueve): **identificada individualmente 2** (extra-genero-ejeFijo,
extra-genero-sin-ejes), **ejecutada sólo en agregado 4** (con-ejes,
sin-ejes, hero, audiencia-inicial), **estructural 3** (extra-miniseries
×2, audiencia-paginas), **inferida 0**. Las dos rutas API (`/api/recomendaciones`,
`/api/audience`) no son recorridos de `composeHome`: quedan inferidas aparte.

### 28.3 Corrección (test del inventario + banco; sin código productivo)

- **Fila de pools:** nueve `recorridos` con nombre, todos desde `composeHome`
  bajo `producirHome`, con enlaces calificados (`dentroDe` `if
  (opts.ejeFijo) {` para la extra con eje; `fueraDe` para las directas;
  `dentroDe`/`fueraDe` `if (poolsHabilitados) {` en `audienceTitles`).
- **Inventario de call sites** (`CALL_SITES`): barrido automático de las tres
  llamadas; cada hit tiene que corresponder a una fila (por archivo, función
  contenedora y ancla) y cada fila a un hit; cada call site desde
  `composeHome` tiene que estar en los recorridos que declara **en el bloque
  que el recorrido exige**; todo recorrido tiene al menos un call site.
  Probado: un call site nuevo (`candidatosDePools(` en `lib/reco.ts`) hace
  fallar el test («call sites sin clasificar»).
- **Controles mutados independientes** sobre la fila real, uno por tipo de
  rama: vía `candidatosConEje` (caen con-ejes, hero, audiencia-inicial);
  directa sin ejes (sin-ejes + extras sin ejes); directa con `ejeFijo`
  (extras con eje); directa de `audienceTitles` (audiencia-paginas);
  `audienceTitles → candidatosConEje`; `candidatosDeSuperficie →
  candidatosConEje`; `categoryCandidates` en `genreRail`, `miniseriesRail` y
  `tandaAncha`; `composeHome →` `recommendations` / `audienceTitles` /
  `genreRail` / `candidatosDeSuperficie`; sitio mudado (caen los nueve). En
  cada corte se exige que caigan **exactamente** los recorridos esperados con
  su mensaje y que **los demás sigan vivos**. Controles de las filas
  anteriores: la de `03ad4b9`, la de `6ef35c5` y la de `c6b299e` no
  distinguen (respectivamente) el arranque, la directa sin ejes, y la rama
  `ejeFijo` ni las páginas de audiencia.
- **Banco E (página extra, con y sin ejes, cachés vaciadas por corrida):** el
  doble devuelve 2 resultados por página (`discoverPorPagina`), así ningún
  riel llena su ventana de 3 páginas y pide la extra; una corrida sana
  registra cada `discover` (`cuenta.discovers`); se elige una receta
  (`with_genres` + `sort_by`) de `/discover/movie` que pidió la página 4 y
  **no** la 5 (la 4 fue su extra, no una ventana `hondo` 4-6); nuevo modo del
  doble `429-consulta` que rechaza **sólo** las consultas cuyo path y
  parámetros coinciden (`page=4`, `with_genres`, `sort_by`: las tres
  plataformas) y las registra (`cuenta.consultas429`). Resultado en la rama:
  con ejes (`with_genres=28`, `sort_by=primary_release_date.desc` = eje
  `nuevo`, ventana 1-3, extra 4 con `ejeFijo`): **3 consultas rechazadas = 3
  descartes**, `degradado: true`, fresca 0, UB 0; sin ejes (`popularity.desc`,
  llamada directa): **3 = 3**, degradado, sin publicar. `b7be927`: rojo en los
  dos (3 rechazadas, 0 descartes, publicado). Se conservan los escenarios D
  con `EJES_RIELES` encendido y en 0.

### 28.4 GREEN

- Inventario 15/15; con cada corte real en el fuente, por separado, falla
  nombrando el recorrido (p. ej. «recorrido extra-genero-ejeFijo:
  lib/enrich.ts#candidatosDeSuperficie no llama a candidatosDePools( dentro de
  `if (opts.ejeFijo) {`», «recorrido audiencia-paginas: … fuera de `if
  (poolsHabilitados) {`», «recorrido hero: lib/enrich.ts#tandaAncha no llama a
  categoryCandidates(»).
- Suite **1.660 tests, 1.650 aprobados, 0 fallos, 10 omitidos**; `tsc
  --noEmit` limpio; build fresco exit 0 (`BUILD_ID 4JaZjaHBmbS0bAahLL-0z`);
  `git diff --check` limpio.
- Identidad del Home (cachés aisladas, `b7be927` vs rama, build final):
  **16/16 válidos e idénticos**.
- **Sin cambios en código productivo**: el diff contra `c6b299e` toca el test
  del inventario, el doble y el script del banco, las dos evidencias JSON y
  los tres documentos.

### 28.5 Comprobado / inferido / pendiente

- **Comprobado:** §28.1 (RED) y §28.4; los nueve recorridos verificados
  cuerpo por cuerpo; el barrido detecta un call site nuevo; la página extra
  ejecutada e identificada (con y sin ejes) produce exactamente los descartes
  rechazados y no se publica; `b7be927` la tragaba.
- **Inferido:** la ejecución de los recorridos marcados *estructural*
  (extra-miniseries ×2, audiencia-inicial, audiencia-paginas: ningún banco
  identifica sus consultas; el banco D los incluye sin distinguirlos); que
  hero y audiencia-inicial pasan por `traer` en el banco D (todas las ventanas
  con eje lo hacen, pero el conteo es agregado); que "la llamada está dentro
  del bloque" equivale a "es la que se ejecuta con esa condición" mientras la
  forma de `candidatosDeSuperficie` y `audienceTitles` se mantenga.
- **Pendiente:** auditoría final de Codex; envolver `/api/recomendaciones` y
  `/api/audience` con `conDescartesRegistrados` (cambio productivo); un banco
  que identifique las consultas de miniseries y de audiencia. Corregida en
  rama; **la etapa no está terminada**.

---

## 29. Séptima corrección de la 3.a — auditoría de Codex sobre `37f1ca1`; corregida en rama, pendiente de auditoría final

### 29.1 El bloqueante

`archivos()` sólo miraba `lib/*.ts` (sin subcarpetas) y `app/api/**/route.ts`,
y el patrón sólo reconocía llamadas directas con el nombre canónico. La
afirmación «un call site productivo nuevo sin clasificar hace fallar el
inventario» era más amplia que el barrido.

**RED contra `37f1ca1`** (worktree detached): con `lib/sub/nuevo.ts`
(llamada directa a `candidatosDePools`), `app/servidor.ts` (llamada directa a
`candidatosConEje`, archivo servidor que no es `route.ts`), y en `lib/reco.ts`
un `import { categoryCandidates as cc }` usado como `cc(` más un `import * as
pools` usado como `pools.candidatosDePools(` → inventario **15/15 verde**: los
cuatro escapan.

### 29.2 Corrección (sólo el test; sin código productivo)

- **Descubrimiento extraído** a `descubrirCallSites(fuentes)`, función pura
  sobre un mapa `ruta → fuente` (probable con fuentes inyectados), alimentada
  en el repo por `archivosProductivos(raíz)`: recorre **recursivamente**
  `lib/`, `app/`, `components/`, `hooks/` y `supabase/` (`.ts .tsx .mts .js
  .mjs`), excluye `*.test.*`, `*.d.ts`, `node_modules`, `.next`; `scripts/`
  (banco) y `docs/` quedan fuera por no ser productivos.
- **Lo que garantiza** (sobre el fuente sin comentarios): detecta toda llamada
  directa canónica `candidatosDePools(` / `candidatosConEje(` /
  `categoryCandidates(`; y **rechaza** —hace fallar el inventario, no las
  clasifica— las formas por las que una llamada podría escapar al nombre
  canónico: import/export con alias (`{ x as y }`), import de namespace o
  dinámico de `pools`/`enrich`, acceso por miembro (`p.candidatosDePools`,
  con o sin llamada inmediata — corregido en §30), desestructuración con
  renombre, y cualquier referencia sin llamar (pasar la función como valor).
- **Lo que no es:** un parser de TypeScript. Limitaciones aceptadas: una
  aparición en un string o template literal cuenta como llamada/referencia
  (falso positivo que obliga a clasificar o reescribir); el acceso computado
  (`mod["candidatosDePools"]`) y `require()` no se reconocen (no se usan en el
  repo: módulos ES con imports estáticos); un re-export con alias sí se
  rechaza, así que una cadena "otro nombre en otro archivo" no puede armarse
  sin fallar.
- **Controles** (fuentes inyectados y disco temporal): el recorrido recursivo
  ve `lib/sub/hondo/mas.tsx`, `app/servidor.ts`, `app/(grupo)/page.tsx`,
  `components/`, `hooks/`, `supabase/functions/` y no ve tests, `.d.ts`,
  `node_modules`, `.next`, `scripts/`, `docs/`; un call site en subcarpeta de
  `lib/` y en un archivo servidor de `app/` se detecta; alias, namespace,
  import dinámico, miembro, renombre y referencia sin llamar se rechazan con su
  línea; la importación canónica, la definición y los comentarios no cuentan;
  el string cuenta (limitación fijada). Sobre el repo real: nueve llamadas y
  cero alternativas.
- **GREEN físico** (los mismos cuatro escapes del RED, sobre la rama):
  «formas alternativas de llegar a las funciones de pools: lib/reco.ts:490
  alias de categoryCandidates; :492 namespace; :493 acceso por miembro» y
  «call sites sin clasificar: app/servidor.ts:2 candidatosConEje(;
  lib/sub/nuevo.ts:2 candidatosDePools(».
- **Cobertura, una sola categoría por recorrido** (`COBERTURA_RECORRIDOS`,
  verificada en el test: las claves son exactamente los nueve recorridos, la
  cuenta es `{ identificada: 2, agregada: 4, estructural: 3, inferida: 0 }`,
  y la cobertura de cada call site es la mejor entre sus recorridos):

  | Categoría | Recorridos | Significado |
  |---|---|---|
  | **identificada** (2) | extra-genero-ejeFijo, extra-genero-sin-ejes | banco E: la consulta de ese recorrido rechazada y sus descartes contados individualmente |
  | **agregada** (4) | con-ejes, sin-ejes, hero, audiencia-inicial | corren en la corrida del banco D; el descarte total se cuenta sin atribución por recorrido — no se sabe si un 429 cayó en SU consulta |
  | **estructural** (3) | extra-miniseries-ejeFijo, extra-miniseries-sin-ejes, audiencia-paginas | sólo la cadena verificada sobre el fuente |
  | **inferida** (0) | — | (las rutas `/api/recomendaciones` y `/api/audience` quedan inferidas, pero no son recorridos de `composeHome`) |

  El resumen anterior («5 ejecutados / 4 estructurales») contaba hero y
  audiencia-inicial dos veces; queda corregido en §28.2.
- El barrido de sitios que **atrapan errores** (§23, `catch`/`allSettled`)
  conserva su alcance declarado —`lib/*.ts` y `app/api/**/route.ts`— y no
  cambia acá; su afirmación se lee con ese alcance.

### 29.3 Verificación

- Inventario **20/20**; suite **1.665 tests, 1.655 aprobados, 0 fallos, 10
  omitidos**; `tsc --noEmit` limpio; build fresco exit 0 (`BUILD_ID
  WSl7G2ZSVAYelQCXHVQeT`); `git diff --check` limpio.
- Diff desde `37f1ca1`: sólo el test del inventario y los tres documentos.
  Las evidencias del Home y del banco **no se regeneraron** y están byte a
  byte intactas (sha1 de los tres JSON idénticos antes y después); los
  nueve recorridos aprobados no se tocaron.
- Sin merge, push, deploy, TMDB real, cachés externas, variables ni
  infraestructura.

### 29.4 Comprobado / inferido / pendiente

- **Comprobado:** §29.1 (RED), los controles de descubrimiento y el GREEN
  físico; la cuenta 2+4+3+0 = 9 verificada en el test.
- **Inferido:** que las cinco raíces cubren todo el código productivo que
  puede importar `lib/pools` o `lib/enrich` (el repo no tiene otras raíces con
  código servidor; `scripts/` sólo tiene el banco y herramientas).
- **Pendiente:** auditoría final de Codex. Corregida en rama; **la etapa no
  está terminada**.

---

## 30. Octava corrección de la 3.a — auditoría final sobre `2886212`; corregida en rama, pendiente de auditoría final

### 30.1 El falso verde (acotado)

El detector de acceso por miembro exigía la llamada inmediata
(`\.NOMBRE\s*\(`). Esta cadena escapaba:

```ts
// barrel.ts
export { candidatosDePools } from "./pools";
// consumidor.ts
import * as api from "./barrel";
const traer = api.candidatosDePools;
traer(…);
```

**RED contra `2886212`** (control escrito antes de tocar el detector): siete
fuentes inyectadas —una es `barrel.ts`, necesario para preparar el
escenario— que contienen **seis casos de acceso por miembro**: el caso
exacto, y los equivalentes para `candidatosConEje` y `categoryCandidates`
asignados a una variable y pasados como valor (argumento, propiedad de
objeto, elemento de array). El detector devolvía `alternativas: []` (y
`llamadas: []`): los seis escapaban con el detector anterior y ahora son
rechazados.

### 30.2 Corrección mínima (sólo el test)

El patrón pasa a `\.(NOMBRE)(?![\w$])`: un `.` seguido del nombre exacto se
rechaza, con o sin `(`. No se amplía el alcance ni se agregan patrones; el
acceso computado (`mod["candidatosDePools"]`) y `require()` siguen como
limitaciones aceptadas y documentadas. GREEN: el control nuevo pasa (seis
rechazos con su línea — la del barrel no menciona el nombre por miembro);
sobre la rama, el caso exacto en disco falla con «lib/consumidor.ts:2 acceso
por miembro .candidatosDePools». El repo real sigue con **nueve llamadas
canónicas y cero formas alternativas** (test existente).

### 30.3 Verificación

- Inventario **21/21**; suite **1.666 tests, 1.656 aprobados, 0 fallos, 10
  omitidos**; `tsc --noEmit` limpio; build fresco exit 0 (`BUILD_ID
  FIUf1c_5hu6iPZw_5uAgY`); `git diff --check` limpio.
- Delta desde `2886212`: sólo el test del inventario y los tres documentos;
  los tres JSON de evidencia byte a byte iguales (sha1 antes y después); sin
  código productivo, sin bancos, sin identidad del Home.

### 30.4 Comprobado / pendiente

- **Comprobado:** todo lo anterior, ejecutado.
- **Pendiente:** auditoría final de Codex. Corregida en rama; **la etapa no
  está terminada**.

---

## 31. Etapa 3.a mergeada, pusheada y desplegada (2026-09-15)

- **Corrección documental previa** (`858f73e`): el RED de §30 son siete
  fuentes inyectadas —una es `barrel.ts`— con seis casos de acceso por
  miembro; los seis escapaban y ahora se rechazan. `ISSUES.md` no tenía el
  recuento incorrecto.
- **Merge** `--no-ff` `7b2fc8f` de `feat/etapa3a-clasificacion-tmdb`
  (`858f73e`) en `main` (desde `b7be927`), sin squash ni rebase. Árbol
  fusionado idéntico al de la rama (`git diff` vacío, código productivo
  incluido); los tres JSON de evidencia con los mismos blobs.
- **Verificación sobre el `main` fusionado:** inventario 21/21; suite 1.666
  (1.656 ok, 0 fallos, 10 omitidos); `tsc --noEmit` limpio; build fresco
  exit 0 (`BUILD_ID SDIx8lZebm-0fD5lIV0jY`); `git diff --check` limpio.
- **Push** `b7be927..7b2fc8f main -> main`.
- **Deployment automático de Vercel:** `dpl_2GLbFXDt4271mS5wTo7MegkN6bnn`,
  READY, target production, `githubCommitSha 7b2fc8f8810f…`, 44 s de build,
  aliases `app.yump.ar`, `streamingcentral.vercel.app`, …
- **Comprobación pasiva** (sin 429 provocados, sin vaciar cachés, sin carga,
  sin TMDB real para bancos, sin variables ni infraestructura):
  `/api/health` 200 (`cache: redis`, ping OK, 744 claves); Home frío 200 en
  15,1 s — `[home] MISS`, 1 composición, turno adquirido, origen propia,
  publicación publicado, 250 llamadas a TMDB (250 ok), 0 fallos, 6 hero + 12
  rieles + 309 títulos, `degradado: false` — y caliente 200 en 0,8 s (`[home]
  HIT`, 167 ms); búsqueda `matrix` 200 (24 títulos, 18 personas, sin
  `degradacion`); ficha `movie/603` 200 (plataformas `mv, m`, sin
  `degradacion`); logs sin líneas `[tmdb] descarte` ni errores nuevos.
- **Identidad del Home preservada según la evidencia existente** (§22-§29:
  cachés aisladas `b7be927` vs rama, 16/16 válidos e idénticos; búsqueda
  15/15). No se reabrió ni se regeneró.
- **Lo que NO cambia:** reintentos APAGADOS (`TMDB_REINTENTOS` ausente en
  Producción); limitador, cadencias, pausa, circuito, `waitUntil` y
  membresía NO implementados. **#19 sigue abierto por esas subetapas
  restantes, no por la 3.a.**

---

## 32. Diseño revisado de las subetapas restantes tras la 3.a en Producción — **pendiente de aprobación; no implementado** (2026-09-15)

### 32.0 Estado de Git y alcance — COMPROBADO

`main = origin/main = 903832e`, árbol trackeado limpio; los cuatro archivos
ajenos (`avatares/`, `prompts/noticias-filtro.md`,
`prompts/noticias-redaccion.md`, `supabase/migrations/004_news.sql`) siguen
sin seguimiento e intactos. Esta sección vive en la rama documental
`diseno/etapa3b-ub-primero`; no hay cambios de código, variables,
infraestructura, cachés externas ni datos. La única ejecución fue la sonda
de `waitUntil` en un Preview aislado (§32.6), borrada al terminar.

### 32.1 La observación de Producción (una sola; no es promedio, máximo ni regresión)

Tras el deploy de la 3.a (`7b2fc8f`, 14:08 AR), una lectura de
`/api/home?providers=n,d,m` a las 14:12 AR:

```
[home] pedido home:es-MX+f.r1:v6:2412787034:d,m,n:
[home] compone home:es-MX+f.r1:v6:2412787034:d,m,n: d33abdd7-…:4:1
[home] MISS home:es-MX+f.r1:v6:2412787034:d,m,n:
[home] 15091ms total | cache MISS | 1 composición | 0 esperas compartidas |
       turno adquirido | origen propia | publicacion publicado | renovaciones 2 |
       tmdb 250 llamadas (250 ok) 131839ms | supabase 6 consultas (6 ok) 3625ms |
       redis 279 llamadas / 281 intentos http / 279 comandos | 551 claves (309 hit / 242 miss) | 38505ms
```

y una segunda lectura a las 14:12:57: `[home] HIT`, 167 ms en el servidor,
0,8 s en el cliente. Resultado: 6 hero + 12 rieles + 309 títulos,
`degradado: false`, `fallos: 0`. **Es una observación**, con la latencia de
TMDB y de Upstash de ese minuto.

### 32.2 Por qué esa solicitud no recibió el último bueno — causa comprobada y límite de lo verificable

> ⚠️ Esta sección describe el código **anterior a la 3.b** (`903832e`, lo
> que está en Producción). En la rama `feat/etapa3b-ub-primero` el líder con
> UB ya **no** compone en línea: responde el UB y compone en fondo (§34-§35).

**Comprobado en el código de `903832e`** (`lib/home-servir.ts`, `servirConTurno`):

1. Se lee la fresca: ausente (`MISS`). La clave fresca lleva la **semilla del
   día** (`clavesDelHome`: `claveHome(instante.semilla, …)`), así que **cada
   combinación empieza cada día argentino sin fresca**, además de vencer a
   las 6 h (`TTL.home`).
2. Se leen UB y degradado. Se **toma el turno**. Y el orden de decisión es:
   ```
   if (r.estado === "adquirido") return componer();   // ← el líder compone SIEMPRE
   if (ub != null) return servirUb(ub);               // sólo quien NO tomó el turno
   ```
   **Quien adquiere el turno compone en línea aunque exista un UB válido.** El
   UB sólo se sirve al líder si el productor rechaza, si la solicitud se
   aborta o si el resultado sale degradado. Los demás pedidos de esa
   combinación durante la composición sí reciben el UB en tiempo de HIT.
3. La composición del líder corre bajo `AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)`
   = **50 s** (`lib/home.ts`), no bajo `COMPOSICION_MAX_MS` (16 s): esa
   constante sólo la usa el que esperó y luego tomó el turno (`restante <
   COMPOSICION_MAX_MS → vacío`). Es decir, el primer pedido de una
   combinación puede esperar hasta 50 s en línea.

**Comprobado en el log:** la solicitud fue `MISS` de fresca, `turno
adquirido`, `1 composición`, `origen propia`, `publicacion publicado`
(fresca + UB + generación escritos), TMDB 250/250 ok, Supabase 6/6 ok, Redis
279 llamadas con 281 intentos HTTP (dos reintentos del SDK), `fallos 0`.
**Ni Redis ni TMDB estaban degradados.**

**Límite de lo verificable:** si en ese instante **existía** un UB de `d,m,n`
(escrito ≤ 36 h antes) no se puede determinar hoy: la línea `[home]` no
imprime la presencia del UB, los logs de Vercel del 14/09 no se retienen, y
`publicar` sobreescribe el UB (no queda rastro del anterior). **No hace falta
para la causa:** con o sin UB, el camino del líder compone en línea. Si había
UB, la espera de 15,1 s fue **evitable** con el diseño de §32.7; si no lo
había (combinación nueva en 36 h), hoy no hay nada que servir y aplica §32.8.

### 32.3 Los cuatro casos, diferenciados (código anterior a la 3.b, `903832e`)

| Caso | Qué encuentra `servirConTurno` | Quién espera y cuánto | Contenido servido |
|---|---|---|---|
| **Home caliente** | fresca presente | nadie: HIT (167 ms en el servidor; 0,8 s en el cliente, observado) | la fresca de hoy |
| **Fresca vencida (o día nuevo) con UB** | fresca ausente, UB presente | **el líder espera la composición entera** (15,1 s observados; tope 50 s); los demás pedidos concurrentes reciben el UB en tiempo de HIT | líder: la fresca de hoy al terminar; los demás: el UB (el último Home correcto de esa combinación) |
| **Combinación nueva sin UB** | fresca y UB ausentes | el líder espera la composición (hasta 50 s); los demás esperan en bucle hasta `TOPE_ESPERA_MS` 20 s y, si aparece la fresca, la reciben; si no, **vacío marcado** | fresca al terminar; vacío marcado si se agota |
| **Redis o TMDB degradados** | `sin-redis` → compone sin turno ni publicación; TMDB con fallos → `degradado` → ENFRIAR, UB si existe, si no `degradado-propio` | como el líder; con caída total, 503 en las rutas de ficha/búsqueda | UB, degradado compartido o vacío |

**Conclusión sobre la Etapa 2:** garantiza respuesta rápida con UB **sólo a
quien no es el líder**. Existe un camino real —el más común, porque el
primer pedido del día de cada combinación es siempre el líder— que teniendo
UB válido **igual espera la reconstrucción**. Es una decisión de diseño de
la Etapa 2 (el líder "paga" la fresca) y es lo que hay que revisar.

### 32.4 Presupuestos recalculados con la observación (sin presentarla como promedio)

De la única muestra: 250 llamadas en 15,1 s de pared con 131,8 s
acumulados de TMDB → **latencia media por llamada 527 ms** y **concurrencia
efectiva ≈ 8,7** (la composición está limitada por sus lotes en paralelo,
no por una tasa: **16,6 llamadas/s efectivas**, muy por debajo de los ~40/s
de TMDB). Redis: 279 llamadas, 38,5 s acumulados, **138 ms por comando**.

| Presupuesto | Valor vigente | Qué dice la observación | Consecuencia |
|---|---|---|---|
| `COMPOSICION_MAX_MS` 16 s (banco L1 8 s × 2) | una composición típica "cabe" | 15,1 s con 250 llamadas: **al borde** | el que esperó y toma el turno con menos de 16 s restantes va a vacío: correcto pero justo; no se cambia sin banco con latencia realista |
| `PRESUPUESTO_REQUEST_MS` 50 s (líder) | cubre una composición | a 16,6/s efectivas, **926 llamadas (Redis vacío) ≈ 56 s**: por encima de 50 s | **una reconstrucción totalmente fría puede cancelarse con TMDB sano ya hoy** (inferido de una muestra; a medir en banco con latencia inyectada) |
| `TURNO_MS` 15 s / `RENOVACION_MS` 5 s | ≈ 3,5 × un MISS de 4,05 s | el MISS observado fue 3,7× el de referencia; hubo 2 renovaciones y no se perdió el turno | válido; la renovación cumplió su función |
| `TOPE_ESPERA_MS` 20 s (sin UB) | los que esperan detrás del líder | un líder de 15,1 s deja 4,9 s de margen; uno de 20 s manda a todos a vacío | justo; **§32.8** |
| Presupuesto en fondo (`waitUntil`) | "~55 s" asumido en v4.1 | **medido en Preview (§32.6): el fondo muere a los 60 s desde el inicio de la solicitud**, no desde la respuesta | presupuesto de fondo = **60 s − lo que tardó en responder**; con UB (≈ 0,3 s) son ≈ 59,7 s, coherentes con `PRESUPUESTO_REQUEST_MS` 50 s + margen |
| Tasa declarada 28/s (§8.3) | cota superior de la app | una composición sola usa ≈ 17/s por su propia concurrencia; N composiciones simultáneas (medianoche, N combinaciones) usan ≈ 17·N/s | el limitador **no frena una composición sola**; frena a partir de 2 simultáneas (§32.5) |

Lo que **no** cambia: `C` sigue siendo 926 (Redis vacío) / ~250 (como la
observación: `pv3:` y pools parcialmente calientes) / ~24 (MISS intradía);
la restricción del dueño mantiene esos números.

### 32.5 Limitador, reintentos, circuito y pausa: efecto sobre el Home frío

Con la concurrencia efectiva observada (≈ 17/s), **ninguno de los cuatro
mecanismos puede hoy acortar los 15 s**: todos los alargan o los dejan igual.

| Mecanismo | Efecto sobre una composición sola (250 llamadas) | Efecto con N simultáneas | Aprobable como subetapa siguiente |
|---|---|---|---|
| Limitador 28/s (dos cadencias de 14 + préstamo) | ninguno mientras haya préstamo (17 < 28); bajo tráfico interactivo sostenido la cadencia masiva de 14/s la lleva a ≈ 18 s | 2 → 18 s; 3 → 27 s; 926 llamadas → 66 s (cancelada) | **no**, mientras el líder espere en línea: convierte 15 s en 18-27 s **sin respuesta alternativa**. Sólo después de §32.7, y con la condición de §5.5 diseñada |
| Reintentos (`TMDB_REINTENTOS`, hoy apagados) | +espera por llamada reintentada (jitter + `Retry-After`); con 429 total, +segundos | ídem por composición | **no** para el líder en línea; en fondo (§32.7) sí tiene sentido: se sigue **apagado** hasta entonces |
| Circuito abierto / pausa distribuida | la composición se **rechaza** → degradado → UB o vacío | protege a TMDB, no al usuario | sólo con §32.7: el usuario ya tiene el UB y la pausa afecta al fondo |
| AIMD / cadencias | como el limitador | ídem | ídem |

**Regla que se propone fijar:** ningún mecanismo de protección de TMDB se
implementa antes de que el líder deje de esperar en línea cuando hay UB.

### 32.6 `waitUntil` — comprobado en un Preview aislado (no leído de la documentación)

**Hechos del proyecto (API de Vercel, sólo lectura):** plan **Hobby**;
**Fluid compute activo**; Node 24; región `iad1`; `/api/home` con
`maxDuration = 60`; `@vercel/functions` **no instalado**; protección SSO en
los Previews con un secreto de bypass ya existente (no se creó nada). El cron
existente es semanal; en Hobby los crons corren **como mucho una vez por día**.

**La sonda** (rama local `spike/waituntil-preview`, `fd56f76` → `707e3d0`;
ruta `/api/spike-waituntil`, no se mergea ni se pushea): responde en el acto
y deja una tarea de fondo que loguea un tick por segundo durante `s`
segundos; toma `waitUntil` del contexto del runtime
(`globalThis[Symbol.for("@vercel/request-context")].get().waitUntil`, que es
lo que usa `@vercel/functions`); `modo=suelto` deja la promesa sin
`waitUntil` como control. Desplegada con `vercel deploy` (Preview del
proyecto `streamingcentral`), ejecutada, y **los dos Previews borrados**.

| Caso | Respuesta | Fondo | Resultado |
|---|---|---|---|
| `waitUntil`, 20 s | 200 en 1,4 s (arranque frío), `respondidaMs 0`, `hayWaitUntil: true`, Fluid, `iad1` | ticks 1…20 | **`DONE +20009ms`** |
| `waitUntil`, 50 s | 200 en 0,6 s | ticks 1…50 | **`DONE +50029ms`** |
| `waitUntil`, 120 s | 200 en 0,5 s | ticks 1…**59** (`+59020ms`), ningún tick 60, sin `DONE` | **`Vercel Runtime Timeout Error: Task timed out after 60 seconds`**: el proceso se mata a `maxDuration` contado desde el **inicio de la solicitud**, aunque la respuesta ya haya salido |
| control: promesa suelta sin `waitUntil`, 20 s | 200 en 0,4 s | **ningún tick** | la tarea de fondo **muere con la respuesta**: sin `waitUntil` no hay fondo |

**Conclusiones:** `waitUntil` funciona en este runtime con Fluid; su
duración efectiva es `maxDuration − tiempo hasta responder`; si Vercel mata
el proceso, la tarea desaparece sin `finally` observable en los logs
(**hay que diseñar para eso**: turno con vencimiento, nada publicado a
medias — ya es así: `publicar` es atómico en Lua). El accidente de la sonda
queda anotado por honestidad: el primer `vercel deploy` sin `.vercel/`
enlazado **creó un proyecto nuevo** (`wt-spike-waituntil`) que se borró en
el acto (HTTP 204) y se redeployó enlazado al proyecto real.

### 32.7 Combinación con UB (fresca vencida o día nuevo): alternativas

| Alternativa | Qué ve la persona | Contenido para esa combinación | Costo | Riesgo |
|---|---|---|---|---|
| **A. Bloqueante (hoy)** | espera 15 s (hasta 50) | la fresca de hoy, correcta | 0 | UX; y §32.4: una fría de 926 puede cancelarse |
| **B. UB primero + reconstrucción en fondo (`waitUntil`)** | **el UB en ≈ 0,3 s** (el último Home correcto de ESA combinación, el de ayer o el de hace ≤ 6 h); la fresca de hoy la ve el siguiente pedido (≈ 15 s después) | UB: correcto y de esa combinación, sin rotación del día; fresca publicada **sólo si terminó completa y sana** = idéntica a la de hoy | `servirConTurno`: `enFondo`; adaptador `waitUntil` en la ruta; tests; banco | el primer visitante del día no ve la rotación diaria hasta su siguiente visita; el fondo muere a los 60 s (turno vence solo; nada a medias); fuera de Vercel (`next start`, banco) no hay `waitUntil` → cae al modo bloqueante |
| **C. Preparación anticipada (cron después de la medianoche AR)** | nadie espera si su combinación fue preparada | la fresca de hoy | registro de combinaciones frecuentes (escritura nueva en Redis), cron diario (Hobby: una vez por día, hora imprecisa), ≤ 3-4 combinaciones por invocación de 60 s | no cubre combinaciones nuevas ni el vencimiento de 6 h durante el día; hora imprecisa en Hobby; **complementa a B, no la reemplaza** |
| **D. Respuesta temporal con contenido correcto de OTRA combinación** | rápido | **no es el contenido esperado para esa combinación** | — | **descartada**: viola la restricción del dueño salvo como estado "preparando" explícito (§32.8) |

**Recomendación: B**, con C como complemento opcional posterior.

### 32.8 Combinación nueva sin UB

| Alternativa | Qué ve la persona | Contenido | Comentario |
|---|---|---|---|
| **A. Bloqueante (hoy)** | 15 s (hasta 50); los que llegan detrás, hasta 20 s y luego vacío | correcto al terminar | se mantiene en 3.b: **no empeora** |
| **E. "Preparando" + fondo + sondeo del cliente** | respuesta inmediata `{ hero: [], rails: [], degradado: true, motivo: "preparando" }` (campo aditivo); el cliente muestra "preparando tu Home" y vuelve a pedir cada 2-3 s; la fresca aparece cuando el fondo publica (≈ 15 s) | correcto al terminar; nada temporal de otra combinación | mismo tiempo total, pero la composición **sobrevive** a que la persona cierre la pestaña (beneficia al siguiente) y no bloquea conexiones; cambia el cliente y agrega un `motivo` |
| **C.** preparación anticipada | no aplica (combinación nueva por definición) | — | — |

**Recomendación:** dejar A en 3.b y diseñar E como 3.b' aparte, porque toca
el cliente y el contrato (aditivo) y necesita banco propio.

### 32.9 Condición bloqueante (sin cambios)

Con TMDB sano, el Home final —la fresca publicada— conserva hero, títulos,
orden, cantidad, deduplicación, plataformas, badges, enlaces, toggles y
contrato JSON (§1). B no toca `composeHome` ni `producirHome`: sólo cambia
**quién espera** la misma composición. El UB que se sirve ya lo sirve hoy la
Etapa 2 a los no líderes. La **membresía por pool sigue NO aprobada** (§12):
sólo con un banco de identidad completa y diferencia cero.

### 32.10 Subetapa mínima siguiente — 3.b "último bueno primero, reconstrucción en fondo"

**Lo necesario para mejorar la espera (3.b):**

1. `servirConTurno`: nueva dependencia `enFondo?: (tarea: Promise<unknown>) => boolean`
   (devuelve `false` si no hay fondo disponible). Cuando el líder adquiere
   el turno **y** `ub != null` **y** `enFondo` acepta la tarea: responde
   `servirUb(ub)` con `origen: "ultimo-bueno-fondo"` y deja `componer()`
   corriendo (renovación del turno incluida; `publicar` sólo si terminó
   completa, sana y publicable; degradado → ENFRIAR como hoy; cancelada →
   libera el turno). Sin UB: **igual que hoy** (bloqueante). Sin `enFondo`
   (local, banco `next start`, `HOME_UB_PRIMERO=0`): igual que hoy.
2. Adaptador en `app/api/home/route.ts` / `lib/home.ts`: `enFondo` =
   `waitUntil` del contexto del runtime si existe; la señal de la
   composición en fondo sigue siendo `AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)`
   (50 s < 60 s − respuesta).
3. Métricas y línea `[home]`: `origen ultimo-bueno-fondo`, `fondo
   publicado|cancelada|degradado|muerto` (la última se infiere por ausencia:
   el siguiente pedido encuentra el turno vencido).
4. **Kill switch:** `HOME_UB_PRIMERO=0` → comportamiento actual, sin
   redeploy de código.
5. **Sin cambios** en `composeHome`, pools, `toUITitle`, claves, TTLs,
   `VERSION_HOME`, contrato JSON (el UB ya es un payload válido).

**Lo necesario para proteger TMDB (3.c, después):** el limitador con la
condición de §5.5 diseñada (garantizar ≥ 17,5/s a la reconstrucción); los
reintentos (siguen apagados) y el circuito sólo cuando el usuario ya no
espera en línea. **No se fijan** tasas, concurrencias ni tiempos sin
medición; **no se enciende** `TMDB_REINTENTOS`.

**Lo que puede esperar:** C (cron de preparación; necesita registro de
combinaciones y depende de la precisión del cron en Hobby); E (preparando +
sondeo); la reducción de `C` (sólo por el gate de diferencia cero);
`COMPOSICION_MAX_MS`/`PRESUPUESTO_REQUEST_MS` (medir antes en banco con
latencia inyectada, §32.4).

**Criterios RED → GREEN (todo en banco aislado, dobles, sin TMDB real):**

| Escenario | RED (código actual) | GREEN (3.b) |
|---|---|---|
| E-ub-lider: UB presente, fresca ausente, un pedido | responde tras la composición (≥ tiempo de composición, con latencia inyectada en el doble ≥ 5 s) con la fresca | responde el UB en < 1 s con `origen ultimo-bueno-fondo`; el fondo publica la fresca; el pedido siguiente es `HIT` con la fresca **idéntica** a la que produce el código actual (comparador de identidad, 0 diferencias) |
| E-ub-concurrentes: UB presente, N pedidos simultáneos | uno espera la composición, N−1 reciben UB | los N reciben UB en < 1 s; una sola composición (`[home] compone` una vez); la fresca publicada una vez |
| E-sin-ub: sin UB | bloqueante | **idéntico al RED** (sin cambios) |
| E-fondo-muerto: el fondo se corta (doble con latencia que supera el presupuesto) | — | no se publica nada; el turno vence; el pedido siguiente vuelve a intentar; el UB sigue sirviéndose |
| E-degradado-en-fondo: 429 parcial en `/discover` durante el fondo | — | ENFRIAR + degradado compartido como hoy; la fresca **no** se publica; el UB sigue |
| E-kill-switch: `HOME_UB_PRIMERO=0` | — | idéntico al RED |
| Identidad del Home (§14) | 16/16 | **16/16** (el contenido publicado no cambia) |

**Condición de reversión:** cualquier diferencia en el comparador de
identidad; cualquier fresca publicada incompleta; o un aumento de vacíos
marcados en Producción (métrica `origen vacio-*`) tras el deploy →
`HOME_UB_PRIMERO=0` y revert del merge.

### 32.11 Explicación sencilla de la recomendación

Hoy, la primera persona que abre el Home cada día (por cada combinación de
plataformas) espera a que se arme entero —15 segundos esta vez— aunque ya
tengamos guardado el Home correcto de ayer para esa misma combinación. La
propuesta es darle ese Home guardado en el acto y armar el de hoy "atrás",
para que quien entre después lo vea listo. No se cambia qué títulos salen ni
en qué orden: se cambia quién espera. Cuando no hay nada guardado
(combinación nueva), se sigue esperando como hoy — eso se resuelve en un
paso aparte. Y ninguna protección de TMDB (frenos, reintentos, pausas) se
prende antes, porque hoy todas alargarían esa espera sin dar nada a cambio.

### 32.12 Decisiones que necesitan autorización del dueño

1. **Producto:** que el primer visitante del día (y el primero tras vencer
   la fresca) reciba el último Home correcto de su combinación —sin la
   rotación de ese día— y que la fresca aparezca en su siguiente visita, en
   vez de esperar ~15 s. Sin esto, 3.b no tiene sentido.
2. Implementar 3.b en rama con el banco de §32.10 y auditoría de Codex antes
   de merge.
3. Si se quiere también E (preparando + sondeo) para combinaciones nuevas:
   diseño aparte (toca cliente y contrato aditivo).
4. Cron de preparación (C): decidir después de 3.b, con datos de qué
   combinaciones existen (#20).
5. **3.c (limitador) sigue sin aprobarse** hasta cumplir la condición de
   §5.5 y hasta que 3.b esté en Producción.

### 32.13 Comprobado / inferido / desconocido

- **Comprobado:** §32.2 (código y log), §32.6 (Preview), los hechos del
  proyecto en Vercel (plan, Fluid, `maxDuration`, cron).
- **Inferido de una sola observación:** los 527 ms/llamada, la concurrencia
  ≈ 8,7 y la extrapolación "926 llamadas ≈ 56 s"; que el limitador no frena
  una composición sola. Se miden en banco con latencia inyectada antes de
  tocar presupuestos.
- **Desconocido:** si existía UB de `d,m,n` a las 14:12; cuántas
  combinaciones distintas hay por día y a qué hora llega la primera (#20);
  la precisión horaria de los crons en Hobby; el comportamiento de
  `waitUntil` bajo N solicitudes concurrentes en la misma instancia Fluid
  (la sonda corrió una tarea por vez).

---

## 33. Etapa 3.b — diseño revisado tras la revisión del dueño sobre `8790db5` — **diseño revisado, pendiente de aprobación; no implementado**

**Decisión de producto aprobada:** cuando exista un último Home correcto
(UB) para esa misma combinación, el líder lo sirve inmediatamente y
reconstruye el Home nuevo en segundo plano; el contenido final del Home no
cambia; sin UB, se conserva el comportamiento actual.

Lo que sigue corrige cinco puntos de §32.10 y fija los criterios de
aceptación. §32 queda como registro de la causa, la sonda y las
alternativas; donde contradiga a §33, **vale §33**.

### 33.1 API pública de Vercel: `waitUntil` de `@vercel/functions`

- La implementación usa **`import { waitUntil } from "@vercel/functions"`**,
  la API pública que Vercel recomienda para Next.js anterior a 15.1 (el
  proyecto está en 14.2). **En Producción no se accede a
  `globalThis[Symbol.for("@vercel/request-context")]`**: la sonda de §32.6
  lo hizo para no agregar una dependencia a una rama descartable y **sigue
  valiendo como evidencia de duración** (fondo hasta `maxDuration` desde el
  inicio de la solicitud; sin fondo, la tarea muere con la respuesta), pero
  **no define la API de implementación**.
- `waitUntil` de `@vercel/functions` hace por dentro esa misma lectura del
  contexto y, cuando no hay contexto (local, `next start`, banco), **no
  registra nada y no lanza**: por eso la disponibilidad se comprueba antes
  con una función propia (§33.2) y no se infiere de que "no explotó".
- **Gate de la dependencia** (antes de escribir `servirConTurno`):
  1. `npm install @vercel/functions` en la rama de implementación (versión
     fijada en `package.json`/`package-lock.json`; sin otras dependencias
     transitivas nuevas de peso — se revisa el diff del lock);
  2. **tipado**: `tsc --noEmit` limpio con el import real;
  3. **build**: `npm run build` fresco limpio (el paquete no puede llegar al
     bundle del navegador: se verifica que sólo lo importe código servidor);
  4. **Preview** del proyecto con la rama de implementación y una
     verificación equivalente a la sonda **pero usando la API pública**:
     respuesta inmediata + fondo de 20 s y de 50 s completos + corte a
     60 s; sin esa evidencia, 3.b no se mergea. El Preview se borra al
     terminar.
- **Uso estructural fijado por test** (RED→GREEN, §33.7): en `lib/` y
  `app/` no aparece `Symbol.for("@vercel/request-context")` ni
  `@vercel/request-context`; `waitUntil` sólo se importa desde
  `@vercel/functions` y sólo en el adaptador de la ruta del Home.

### 33.2 Inicio realmente diferido: `programarEnFondo(iniciar)`

`enFondo(tarea: Promise)` de §32.10 tenía el defecto señalado: la promesa
ya habría empezado antes de saber si el fondo existe, y un rechazo del
registro dejaría una composición huérfana o duplicada. Interfaz corregida:

```ts
// lib/home-servir.ts — dependencia nueva, opcional
programarEnFondo?: (iniciar: () => Promise<void>) => boolean;
```

Contrato:

1. **Perezosa:** `iniciar` no se invoca hasta que el adaptador decidió que
   el fondo está disponible. El adaptador (`lib/home.ts`), en este orden:

   ```ts
   function programarEnFondo(iniciar: () => Promise<void>): boolean {
     if (process.env.HOME_UB_PRIMERO === "0") return false;   // kill switch
     if (process.env.VERCEL !== "1") return false;            // fuera de Vercel no hay fondo (local, next start, banco)
     let registrado = false;
     // La tarea NO inicia en este tick: espera un microtick y sólo entonces,
     // si el registro quedó hecho, invoca a `iniciar`.
     const tarea = (async () => { await Promise.resolve(); if (registrado) await iniciar(); })();
     try { waitUntil(tarea); registrado = true; return true; }
     catch (e) { console.error("[home] waitUntil rechazó el registro; se compone en línea", e); return false; }
   }
   ```

   `VERCEL=1` es una variable pública del runtime de Vercel (no un símbolo
   interno). Si cualquiera de las comprobaciones falla, devuelve **`false`
   sin haber iniciado** la composición.
2. **Una sola composición:** `servirConTurno` llama a `programarEnFondo`
   **una vez**, en el punto en que el líder adquirió el turno y `ub != null`.
   Si devuelve `true`: responde el UB (`origen ultimo-bueno-fondo`) y no
   compone en línea. Si devuelve `false`: ejecuta **exactamente el camino
   bloqueante actual** (`componer()` en línea, el mismo código que hoy),
   con **cero** tareas huérfanas y **cero** segundas composiciones. No hay
   un tercer estado.
3. **Excepción sincrónica del registro** (`waitUntil` lanza): como `waitUntil`
   es sincrónico y la tarea sólo mira `registrado` en el microtick
   siguiente, un `throw` deja `registrado = false`, la tarea despierta, no
   invoca a `iniciar` y resuelve; `programarEnFondo` devuelve `false` y el
   líder compone en línea: **una** composición, la bloqueante, y ninguna
   promesa rechazada (la tarea resolvió). El test lo fija con un `waitUntil`
   inyectado que lanza y un contador de invocaciones de `iniciar` en 0.
4. Sin UB: `programarEnFondo` **no se llama**; el camino es el actual.
5. Los no líderes: sin cambios (UB en tiempo de HIT; espera si no hay UB).

### 33.3 Contextos y métricas separados: `[home]` y `[home-fondo]`

Hoy `homePayload` abre cuatro contextos por solicitud —métricas
(`withMetricas`), idioma (`withMetricasIdioma`), ejes (`conRegistroDeEjes`)
y señal (`conSenal`)— y al devolver el payload imprime la línea terminal
`[home]`. Una composición de fondo termina **después** de esa línea: no
puede anotar en las métricas ya publicadas de la solicitud.

Diseño:

- **La solicitud** (contextos de hoy) registra sólo: `cache
  "ultimo-bueno"`, `origen "ultimo-bueno-fondo"`, `fondo "programado"`, el
  turno adquirido y el propietario. Su línea `[home]` se imprime al
  responder, como siempre, y **queda congelada**: el fondo no la toca.
- **El fondo** corre dentro de `iniciar` con **sus propios cuatro
  contextos**, abiertos por el adaptador: `withMetricasIdioma(() =>
  withMetricas(() => conRegistroDeEjes(() => conSenal(senalFondo, () =>
  componer()))))`, donde `senalFondo = AbortSignal.timeout(PRESUPUESTO_FONDO_MS)`
  con `PRESUPUESTO_FONDO_MS = PRESUPUESTO_REQUEST_MS` (50 s; el corte duro
  de Vercel es a 60 s desde el inicio de la solicitud, §32.6). Dentro de
  `componer()` corre `producirHome` con `withFallosDeFuentes`, como hoy.
  Como los cuatro contextos son `AsyncLocalStorage`, **dos solicitudes
  concurrentes no comparten nada**: cada fondo tiene su propio almacén y
  cada solicitud el suyo.
- **Línea terminal separada** al terminar el fondo: `[home-fondo] <clave>
  <propietario> | <ms> total | composición 1 | publicacion
  publicado|publicada-solo-fresca|rechazado|indeterminado|no |
  degradado sí|no | cancelada sí|no | error <nombre>|no | tmdb N llamadas (M
  ok) | supabase … | redis … | descartes tmdb K` — la misma `lineaHome` con
  prefijo `[home-fondo]` y las mismas piezas (`[idioma]`, `EJES`, `VUELTAS`)
  con ese prefijo. **Correlación:** clave + propietario (`<instancia>:<pid>:
  <contador>`) son los mismos en la línea `[home]` de la solicitud y en la
  `[home-fondo]`, y el banco los cruza.
- **Estado no observable directamente:** si Vercel mata el proceso (corte a
  60 s), el fondo **no escribe ninguna línea**: no hay evento "fondo
  muerto" y **no se lo llama métrica**. Lo único comprobable es indirecto:
  el pedido siguiente encuentra el turno vencido (`TURNO_MS` sin
  renovación) y lo retoma; su línea `[home]` lleva `turno adquirido` sin
  `[home-fondo]` previa para ese propietario. El banco lo verifica por
  ausencia de la línea y por el turno retomado, y se documenta así.
- Ninguna de estas líneas ni contadores cambia el payload ni el contrato
  JSON.

### 33.4 Errores del trabajo de fondo

- **Ninguna promesa rechazada sin manejar:** `iniciar` devuelve una promesa
  que **siempre resuelve**: envuelve `componer()` en `try/catch/finally`;
  un rechazo se anota (`error <nombre>`) y se registra en la línea
  `[home-fondo]`; el `finally` corta la renovación y, si el turno sigue
  siendo nuestro y no se publicó, lo libera.
- **Se conservan** tal cual: renovación del turno cada `RENOVACION_MS`
  mientras compone; **fencing** por propietario en `renovar`, `publicar`,
  `enfriar` y `liberar` (un turno perdido no publica); **ENFRIAR** con
  degradado compartido si la composición salió degradada (y el UB **no se
  toca**); **publicación sólo de payload sano y publicable** (`publicar`
  atómico en Lua: fresca + UB + generación, o nada). Con la señal abortada
  (presupuesto de fondo), `componer()` libera el turno y no publica.
- **Corte de Vercel a 60 s:** el fondo desaparece sin `finally`. El UB
  **permanece intacto** (sólo `publicar` lo escribe y es atómico); el turno
  **vence solo** (`TURNO_MS` 15 s sin renovación) y el pedido siguiente lo
  retoma; el progreso cacheado (`disc:`, `pv3:`) queda y abarata el intento
  siguiente. No hay estado a medias posible.
- **Un fallo del log o de las métricas no convierte un Home correcto en
  error:** la línea `[home-fondo]` se arma en un `try` propio (como la
  `[home]` de hoy) y un error al formatearla o al `console.log` se traga
  con un `console.error` de una línea; `publicar` ya ocurrió antes de
  loguear. Lo mismo en la solicitud: la anotación `fondo "programado"` no
  está en el camino que devuelve el UB.

### 33.5 Kill switch

`HOME_UB_PRIMERO=0` desactiva 3.b y deja **exactamente** el camino actual.
Es una **reversión sin modificar código**, pero **cambiar una variable de
entorno en Vercel se aplica en el siguiente deployment** (las funciones ya
desplegadas conservan su entorno): no se promete activación instantánea. La
secuencia de reversión es: poner la variable → **redeploy** (del mismo
commit) → verificar `[home]` sin `ultimo-bueno-fondo`. La reversión total
sigue siendo el revert del merge.

### 33.6 Diff conceptual respecto de §32.10

| §32.10 | §33 |
|---|---|
| `enFondo(tarea: Promise)` | `programarEnFondo(iniciar: () => Promise<void>): boolean`, perezosa; comprueba kill switch y contexto antes de invocar; `false` sin haber iniciado |
| adaptador con el símbolo del runtime | `waitUntil` de `@vercel/functions`; símbolo prohibido por test; gate de instalación, tipado, build y Preview |
| el fondo anota en las métricas de la solicitud | contextos propios del fondo; `[home]` congelada al responder; `[home-fondo]` separada y correlacionada por clave + propietario |
| "fondo muerto" como métrica | estado no observable; se comprueba por ausencia de línea y por el turno vencido/retomado |
| errores implícitos | promesa que siempre resuelve; excepción sincrónica del registro → bloqueante; corte de Vercel → UB intacto, turno vence |
| kill switch "sin redeploy" | reversión sin código, aplicada con el siguiente deployment |

### 33.7 Criterios de aceptación RED → GREEN (banco aislado con dobles; sin TMDB real)

| # | Escenario | RED (código actual, `903832e`) | GREEN (3.b) |
|---|---|---|---|
| 1 | UB presente, fresca ausente, un pedido | responde tras la composición completa (con latencia inyectada ≥ 5 s en el doble) con la fresca | responde el UB en < 1 s, `origen ultimo-bueno-fondo`, `fondo programado`; **una** línea `[home] compone`; **una** `[home-fondo]` con `publicacion publicado`; el pedido siguiente es `HIT` con una fresca **idéntica** a la del RED (comparador, 0 diferencias) |
| 2 | Mecanismo de fondo ausente (`programarEnFondo` devuelve `false`: sin contexto) | bloqueante | **idéntico al RED**: una composición en línea, cero `[home-fondo]`, cero tareas huérfanas (el doble cuenta exactamente las llamadas de una composición) |
| 3 | Registro de fondo rechazado (`waitUntil` inyectado que lanza) | — | `programarEnFondo` devuelve `false`, `iniciar` **no** corrió (contador 0), el líder compone en línea: **una** composición, cero duplicados, cero rechazos sin manejar (`process.on("unhandledRejection")` armado en el test) |
| 4 | Métricas de la respuesta congeladas | — | la línea `[home]` se imprime antes de que termine el fondo y **no cambia** después; el objeto de métricas de la solicitud es igual antes y después de que el fondo termine (snapshot comparado) |
| 5 | Métricas del fondo separadas y correlacionadas | — | `[home-fondo]` lleva la misma clave y el mismo propietario que su `[home]`; sus contadores (tmdb, redis, supabase, descartes, idioma, ejes) son los de la composición y **no** aparecen en la `[home]` de la solicitud |
| 6 | Dos solicitudes concurrentes con UB | una espera la composición, la otra recibe UB | las dos reciben UB en < 1 s; **una** `[home] compone`; **una** `[home-fondo]`; los propietarios de las dos `[home]` son distintos y ninguna suma llamadas de la otra (los contadores de la que no lideró son 0 en tmdb) |
| 7 | Fondo sano | — | publica fresca + UB + generación; pedido siguiente `HIT` idéntico |
| 8 | Fondo degradado (429 parcial en `/discover` durante el fondo) | — | `[home-fondo] … degradado sí publicacion no`; ENFRIAR + degradado compartido; **el UB no cambia** (mismo blob antes y después); el pedido siguiente sirve el UB |
| 9.1 | TMDB 5xx **total** en el banco productivo durante el fondo (doble en modo 500) | — | **no es un rechazo del productor**: `composeHome` lo atrapa con `safe()` en Producción y produce un payload **degradado** → `[home-fondo] … degradado sí publicacion no`, ENFRIAR + degradado compartido, fresca no publicada, **UB byte a byte intacto** |
| 9.2 | Productor que **realmente lanza** — sólo reproducible con una dependencia `producir` inyectada en la prueba pura de `servirConTurno` | — | error anotado (`ERROR PRODUCTOR`), renovación detenida, liberación segura del turno, UB intacto y **ninguna promesa rechazada** (la tarea de fondo resuelve) |
| 10 | Fondo cancelado (latencia del doble que supera el presupuesto de fondo) | — | `[home-fondo] … cancelada sí publicacion no`; turno liberado; UB intacto. Y el corte duro de Vercel (no reproducible en banco): documentado como no observable; se comprueba en el Preview del gate §33.1 (tarea de 120 s: sin `[home-fondo]`, turno vencido y retomado por el pedido siguiente) |
| 11 | Kill switch `HOME_UB_PRIMERO=0` | — | idéntico al RED (una composición en línea, cero `[home-fondo]`) |
| 12 | Identidad completa del Home | 16/16 | **16/16** con cachés aisladas (`b7be927` vs rama), controles de mutación y de caché compartida |
| 13 | Uso estructural de `@vercel/functions` | — | test de fuente: `waitUntil` importado sólo de `@vercel/functions` y sólo en el adaptador; `Symbol.for("@vercel/request-context")` y `@vercel/request-context` ausentes en `lib/`, `app/`, `components/`, `hooks/`; `package.json` lo declara con versión fijada |

Cada escenario se corre sobre `903832e` (RED) y sobre la rama (GREEN) en
worktrees separados con dobles y Redis del banco propios, como en §14.

### 33.8 Riesgos restantes

- **Rotación diaria diferida para el primer visitante** (aprobado como
  producto): ve el Home correcto de ayer; el de hoy, en su próxima visita.
- **Presupuesto de fondo:** con la concurrencia efectiva observada (§32.4),
  una reconstrucción de 926 llamadas puede no caber en 50 s; el fondo se
  cancela, el UB sigue sirviéndose y el intento siguiente arranca con el
  progreso cacheado. No está demostrado que converja: se mide en banco con
  latencia inyectada (E-fria-sostenida, §15) antes de tocar presupuestos.
- **Vencimiento del UB (36 h):** si durante 36 h ningún fondo termina para
  una combinación, esa combinación vuelve al caso "sin UB" (bloqueante).
- **`waitUntil` bajo concurrencia en una instancia Fluid:** la sonda corrió
  una tarea por vez; el gate del Preview (§33.1) agrega dos solicitudes
  concurrentes con fondo.
- **Costo:** ninguna llamada nueva a TMDB ni a Redis: la misma composición,
  en otro momento. Una línea de log más por composición de fondo.
- **Sin UB no cambia nada:** la espera de hoy se mantiene; "preparando +
  sondeo" (§32.8 E) sigue siendo un diseño aparte.

### 33.9 Estado

Diseño revisado, **pendiente de aprobación; no implementado**. Sin cambios
de código, dependencias, variables ni infraestructura. La rama
`spike/waituntil-preview` (sonda) queda local y no se mergea.

---

## 34. Etapa 3.b implementada en rama — pendiente de auditoría; no mergeada ni desplegada (2026-09-15)

### 34.1 Git

Rama `feat/etapa3b-ub-primero` (worktree `wt-etapa3b-impl`), creada desde el
diseño `diseno/etapa3b-ub-primero` (`4501f01`, sobre `main = 903832e`).
`spike/waituntil-preview` (`707e3d0`) es sólo antecedente y no se fusiona.
Commits: `670ad17` (criterio 9 separado), `cdd4ab8` (RED), `3f4babe`
(implementación), `c402174` (banco + evidencia) y el documental de esta
sección. Sin merge, push ni deploy de Producción.

### 34.2 Corrección previa del criterio 9

Un 5xx **total** de TMDB dentro de `composeHome` lo atrapa `safe()` en
Producción y produce un payload **degradado**: no es un rechazo del productor.
Quedan dos escenarios (§33.7, filas 9.1 y 9.2): el 5xx total en el banco
(degradado, ENFRIAR, fresca no publicada, UB intacto) y el productor que
**realmente lanza**, sólo reproducible con `producir` inyectado en la prueba
pura de `servirConTurno`.

### 34.3 Arquitectura final

| Pieza | Qué hace |
|---|---|
| `lib/home-fondo.ts` (**puro**) | `crearProgramadorDeFondo({ registrar, disponible, apagado })` → `programarEnFondo(iniciar, senal)`. **Perezoso**: si `apagado` (`HOME_UB_PRIMERO=0`) o no `disponible` (`VERCEL !== "1"`, salvo `YUMP_BANCO_FONDO=1` en el banco) devuelve `false` sin iniciar. La tarea espera **un microtick** y sólo compone si `registrado` quedó en `true` tras `registrar(tarea)`; un `throw` del registro deja `registrado = false`, la tarea resuelve sin componer y se devuelve `false`. La tarea **siempre resuelve**: un rechazo de `iniciar` se loguea y se contiene; un fallo del propio log también. `estadoDelFondo(env)` decide disponibilidad y kill switch. |
| `lib/home-servir.ts` | `DepsServir.programarEnFondo?`. Cuando el líder **adquiere el turno y `ub != null`**, llama a `programarEnFondo` **una vez** con `iniciar(senalFondo)` = anotar propietario + `componer(senalFondo)`; si registró: `cache ultimo-bueno`, `origen ultimo-bueno-fondo`, `fondo programado`, y responde el UB en el acto. Si devuelve `false` (o lanza): `componer()` en línea, **exactamente el camino de siempre**. Sin UB: no se llama. `componer(senalActiva)` usa la señal que le den (la de la solicitud en línea; la del fondo en fondo) para cancelar y para la renovación. Renovación, fencing por propietario, ENFRIAR, publicación atómica y liberación segura **sin cambios**; en el fondo, un error posterior a `componer` se anota (`ERROR PRODUCTOR`), libera el turno (con `try`) y se relanza al programador, que lo contiene. |
| `lib/home.ts` (adaptador) | `import { waitUntil } from "@vercel/functions"` — **única** importación del paquete, sólo en este archivo; el símbolo interno queda prohibido por test. `programarComposicionEnFondo(clave, iniciar)` abre para el fondo **sus propios cuatro contextos** (`withMetricasIdioma` → `withMetricas` → `conRegistroDeEjes` → `conSenal(AbortSignal.timeout(PRESUPUESTO_REQUEST_MS = 50 s))`) y al terminar imprime **`[home-fondo] <ms>ms total | … | propietario <p> | … | clave <k>`** (la misma `lineaHome`, prefijo distinto) más `[home-fondo] [idioma] …` y `[home-fondo] EJES …`, dentro de un `try` cuyo fallo sólo se loguea. `producir` anota fuentes caídas y `degradado` al producir, para que la línea del fondo muestre `DEGRADADO (N fuente(s), K descarte(s) tmdb)` aunque el fondo haya servido el UB. |
| `lib/metricas.ts` | `origen: "ultimo-bueno-fondo"`, campo `fondo: "programado" \| null`, segmento ` fondo programado \|` en la línea. |
| `CLAUDE.md` | la decisión, el kill switch y que aplicarlo en Vercel requiere un nuevo deployment. |

**Lo que no cambia:** `composeHome`, pools, selección, orden, cantidad,
plataformas, badges, enlaces, toggles, claves, TTLs, `VERSION_HOME`, contrato
JSON (el UB ya es un payload válido). Sin limitador, circuito, pausa,
reintentos (`TMDB_REINTENTOS` sigue apagado), membresía, cron ni "preparando
+ sondeo". Limitación conocida: `[home] VUELTAS` lo imprime `composeHome`
(no se toca) también cuando corre en fondo; la línea terminal del fondo es
`[home-fondo]` y es la que correlaciona por clave y propietario.

### 34.4 Dependencia añadida

`@vercel/functions` **3.9.7** (exacta, `--save-exact`). `package.json`: una
línea. `package-lock.json`: +220/−7, **18 paquetes** nuevos
(`@vercel/functions`, `@vercel/oidc`, `@vercel/cli-config`,
`@vercel/cli-exec`, `execa`, `get-stream`, `human-signals`, `is-stream`,
`jose`, `merge-stream`, `mimic-fn`, `npm-run-path`, `onetime`, `os-paths`,
`strip-final-newline`, `xdg-app-paths`, `xdg-portable`, `zod`): son las
dependencias del subpath `@vercel/functions/oidc`, que la app **no importa**.
`index.js` del paquete sólo requiere `headers`, `get-env`, `deadline`,
`wait-until`, `metric`, `middleware`, `cache`, `db-connections`, `purge`,
`addcachetag`, `websocket`; `wait-until` es `getContext().waitUntil?.(p)`
(sin contexto **no lanza y no hace nada**: por eso la disponibilidad se
decide antes por `VERCEL=1`).

**Inspección del bundle** (`npm run build` fresco): `.next/static` (cliente)
no contiene `@vercel/functions`, `waitUntil`, `HOME_UB_PRIMERO`, `home-fondo`
ni `request-context` (0 archivos). `.next/server/app/api/home/route.js`
(37,8 KB) inlina `wait-until`/`get-context` del paquete (el string
`waitUntil can only be called with a Promise` aparece 1 vez; el símbolo
`@vercel/request-context` aparece 1 vez **dentro del código inlinado del
paquete**, no en el nuestro) y **no** contiene `jose`, `execa` ni `oidc`; el
`route.js.nft.json` no rastrea ningún archivo de `@vercel/functions`,
`@vercel/oidc`, `jose` ni `execa`.

### 34.5 RED → GREEN (TDD, contra `903832e`)

RED (`cdd4ab8`, antes de implementar): `lib/home-fondo.test.ts` no encuentra
el módulo (8 tests); en `lib/home-servir.test.ts` 8 de los 9 tests de 3.b
fallan —los que esperan la respuesta en el acto vencen su `timeout` de 4 s
porque el líder compone en línea sobre el reloj virtual; "fondo no
disponible" y "sin UB" fallan en `fondo`/`cuantasLlamadas`—; en
`lib/etapa3b-cableado.test.ts` 6 de 7 fallan (sin paquete, sin import, sin
adaptador, sin `[home-fondo]`, sin `lib/home-fondo.ts`, sin doc del kill
switch). GREEN: los tres archivos pasan (8 + 44 + 7); suite completa
**1.691 tests, 1.681 aprobados, 0 fallos, 10 omitidos**; `tsc --noEmit`
limpio; build fresco exit 0; `git diff --check` limpio.

Cobertura de los 13 criterios de §33.7 (con 9.1/9.2):

| # | Criterio | Dónde | Resultado |
|---|---|---|---|
| 1 | UB presente: rápido, una composición en fondo, fresca idéntica | test puro + banco | banco: antes 5.563 ms en línea (`origen propia`); rama **111 ms**, `origen ultimo-bueno-fondo`, `fondo programado`, es el UB, 1 `[home] compone`, `[home-fondo]` 5.445 ms `publicado` (833 llamadas a TMDB) con la misma clave y propietario, fresca escrita, siguiente `HIT` en 17 ms; **fresca idéntica** a la del antes y a la sana |
| 2 | Fondo ausente: una bloqueante, cero huérfanas | test puro (`registra: false`) + banco (proceso sin `YUMP_BANCO_FONDO`: 5.426 ms, `propia`, 0 `[home-fondo]`) | ✓ |
| 3 | Registro rechazado: cero duplicados | `home-fondo.test.ts` (`iniciar` 0 veces, `false`, sin `unhandledRejection`) + `home-servir.test.ts` (programador que lanza → una composición en línea) | ✓ |
| 4 | Métricas de la respuesta congeladas | `home-servir.test.ts`: `JSON.stringify(r.m)` igual antes y después del fondo; renovaciones 0 en la solicitud y 1 en el fondo | ✓ |
| 5 | Métricas del fondo separadas y correlacionadas | test puro (`mf.home.propietario === "A"`, `publicacion` sólo en el fondo) + banco (`mismaClave`, `mismoPropietario`) | ✓ |
| 6 | Dos concurrentes: una composición, sin cruce | test puro (líder + `ocupado`) + banco (23/23 ms; en un proceso el segundo es `COMPARTIDA` del single-flight local y el primero `ULTIMO-BUENO`; 1 compone; 1 fondo; propietarios distintos) | ✓ |
| 7 | Fondo sano | banco (publica; siguiente HIT) | ✓ |
| 8 | Fondo degradado (429 parcial en `/discover`) | test puro + banco (8 descartes, `DEGRADADO`, ENFRIAR, fresca 0, degradado compartido 1, **UB intacto por sha1 del valor entero**) | ✓ |
| 9.1 | TMDB 5xx total en fondo | banco (doble en modo 500: `DEGRADADO`, `ENFRIADO`, sin `ERROR PRODUCTOR`, publicación no, fresca 0, UB intacto; el turno queda en enfriamiento 15 s, como hoy) | ✓ |
| 9.2 | Productor que lanza | `home-servir.test.ts` con `producir` inyectado que rechaza a los 5,5 s: `ERROR PRODUCTOR` en el fondo, renovación detenida, turno liberado, UB intacto, la tarea resuelve, sin `unhandledRejection` | ✓ |
| 10 | Fondo cancelado | test puro (señal abortada: LIBERAR, sin PUBLICAR ni ENFRIAR, `CANCELADA`) + banco (latencia 1,5 s: `CANCELADA` a los 50.421 ms, fresca 0, turno 0, UB intacto). El corte duro de Vercel: gate del Preview (§34.6) | ✓ |
| 11 | Kill switch | test puro (`apagado`) + banco (proceso con `HOME_UB_PRIMERO=0`: 5.282 ms, `propia`, sin fondo) | ✓ |
| 12 | Identidad del Home | comparador de cachés aisladas `b7be927` vs rama: **16/16** válidos e idénticos, controles ok | ✓ |
| 13 | Uso estructural de `@vercel/functions` | `etapa3b-cableado.test.ts`: importado sólo en `lib/home.ts`; símbolo interno ausente en `lib/`, `app/`, `components/`, `hooks/`; versión exacta en `package.json` y lock | ✓ |

Evidencia: `docs/medidas/2026-09-15-etapa3b-ub-primero.json` (verde) y
`docs/medidas/2026-09-14-etapa3a-identidad-home.json` (16/16, regenerada).

### 34.6 Gate del Preview con la API pública

Rama descartable `spike/etapa3b-preview-gate` (desde la rama de
implementación) con `app/api/spike-waituntil-publico/route.ts`, que usa
**`waitUntil` de `@vercel/functions`** con el mismo registro perezoso;
desplegada con `vercel deploy` como Preview del proyecto `streamingcentral`
(protección SSO, bypass existente), ejecutada y **borrada** (deployment,
worktree y rama; producción sin tocar: health 200).

| Caso | Respuesta | Fondo |
|---|---|---|
| 20 s | 200 en 0,8 s, `registrado: true`, `VERCEL=1`, `iad1` | 20 ticks, **`DONE +20019ms`** |
| 50 s | 200 en 0,5 s | 50 ticks, **`DONE +50017ms`** |
| 120 s | 200 en 0,5 s | 59 ticks (`+59021ms`), sin `DONE`, **`Task timed out after 60 seconds`** |
| 2 concurrentes de 30 s | 200 en 0,5 s las dos | las dos: 30 ticks, **`DONE +30018ms` / `+30019ms`** |

### 34.7 Verificación final en la rama

Tests específicos 8 + 44 + 7 + inventario 21; suite 1.691 / 1.681 ok / 0
fallos / 10 omitidos; `tsc --noEmit`; build fresco (`BUILD_ID
AOWvJvDr8YVOqYjJXuA8r`); `git diff --check`; banco 3.b verde; identidad 16/16;
bundle inspeccionado (§34.4); árbol limpio; los cuatro archivos ajenos
intactos y sin seguimiento.

### 34.8 Limitaciones y comprobado / inferido

- **Comprobado:** todo §34.5 y §34.6; que el fondo en Vercel corre y muere a
  `maxDuration` con la API pública; que fuera de Vercel (banco) el mismo
  código, con `YUMP_BANCO_FONDO=1`, publica la fresca idéntica.
- **Inferido:** que en Producción, con la latencia real de TMDB
  (~527 ms/llamada observados, §32.4), una composición de fondo de ~250
  llamadas termina en ~15 s dentro del presupuesto de 50 s — no se midió
  en Producción (no se despliega); que una fría de 926 puede cancelarse y
  converger por el progreso cacheado (no demostrado; E-fria-sostenida).
- **Limitaciones:** el fondo sólo existe en Vercel (o con
  `YUMP_BANCO_FONDO=1`); si Vercel mata el proceso no hay línea
  `[home-fondo]` (estado no observable: el turno vence y se retoma); el
  primer visitante del día ve el UB sin la rotación de ese día (decisión
  aprobada); el kill switch se aplica con el siguiente deployment; el `[home]
  VUELTAS` del fondo sale con prefijo `[home]` (lo imprime `composeHome`).

---

## 35. Corrección de la 3.b tras la auditoría de Codex sobre `c84996e` — pendiente de nueva auditoría; no mergeada ni desplegada

### 35.1 Causa exacta

`lib/home-fondo.ts` hacía `await Promise.resolve()` antes de `iniciar`. Eso
sólo garantiza que `waitUntil` ya había **registrado** la tarea; no que la
ruta hubiera **construido su respuesta**. El orden real era: `servirConTurno`
devuelve el UB → la tarea despierta en el microtick siguiente y `composeHome`
**arranca** → `homePayload` sigue (lecturas, línea `[home]`) → la ruta recién
construye el `NextResponse`. La composición se metía en el camino crítico de
la respuesta rápida.

### 35.2 RED contra `c84996e`

`lib/home-fondo-orden.test.ts` (`792d717`) atraviesa una frontera
equivalente al handler real: el handler corre dentro de `conFrontera`, llama
al `servirConTurno` real (turno en memoria, UB presente), sigue trabajando
como `homePayload` (ticks, 30 ms, la línea `[home] terminal`), construye la
respuesta —equivalente a `NextResponse.json(payload)`— y devuelve. Contra el
programador de `c84996e` la traza fue:

```
["[home] compone", "iniciar", "servir-devolvio:ultimo-bueno-fondo", "[home-fondo] publicado", "[home] terminal", "respuesta-construida"]
```

es decir, **la composición entera terminó antes de que existiera la
respuesta**. El test falla con «iniciar comenzó antes de construir la
respuesta». También fallaban "sin frontera declarada → no hay fondo" y "dos
handlers concurrentes: cada fondo detrás de SU respuesta". El control que
modela el microtick reproduce el agujero.

### 35.3 Solución

- **`lib/fondo-frontera.ts`** (puro, `AsyncLocalStorage`): `conFrontera(handler)`
  corre el handler con una frontera propia y **abre la compuerta cuando el
  handler devolvió** (o lanzó: `finally`, para que ninguna tarea registrada
  quede colgada de `waitUntil`) — **corregido en §36: abrir en el `finally`
  encola el fondo antes de que el llamador reciba la promesa; ahora se cede
  al event loop (`setImmediate`) y se abre después**; `compuertaDeFondo()` devuelve la promesa de
  esa compuerta, o `null` si no hay frontera.
- **`lib/home-fondo.ts`**: nueva dependencia `compuerta`; sin compuerta (el
  handler no declaró la frontera) `programarEnFondo` devuelve `false` sin
  iniciar → bloqueante. La tarea hace `await compuerta` (ni microticks ni
  milisegundos) y sólo compone si el registro quedó hecho.
- **`app/api/home/route.ts`**: `export const GET = conFrontera(conCors(manejar,
  "GET"))` — la compuerta se abre cuando el handler **entero** devolvió la
  respuesta, **cabeceras de CORS incluidas**. La frontera envuelve por fuera a
  propósito: si envolviera sólo a `manejar`, las continuaciones del fondo se
  encolarían antes de que `conCors` fijara sus cabeceras.
- **`lib/home.ts`**: el programador recibe `compuertaDeFondo`.
- Fallbacks conservados y probados: `waitUntil` no disponible, kill switch,
  registro que lanza, sin UB, sin frontera → exactamente una composición
  bloqueante, cero huérfanas, cero rechazos sin manejar.
- `lib/cors-inventario.test.ts` acepta la forma envuelta y comprueba que la
  frontera no esconde una divergencia de método.

### 35.4 GREEN — evidencia del orden completo

- `home-fondo-orden.test.ts`: traza con la frontera:
  `servir-devolvio:ultimo-bueno-fondo → [home] terminal → respuesta-construida
  → [home] compone → iniciar → [home-fondo] publicado`; una sola composición;
  la fresca publicada por el fondo; turno liberado; métricas de la solicitud
  sin `publicacion`; sin `unhandledRejection`. Sin frontera → `false`, cero
  inicios. Handler que lanza → la compuerta se abre en `finally` y la tarea
  corre. Dos handlers concurrentes → cada fondo arranca después de **su**
  respuesta y el de B no espera la de A.
- `home-fondo.test.ts`: compuerta cerrada → ni veinte ticks arrancan
  `iniciar`; se abre → corre una vez. Sin compuerta → `false`.
- `etapa3b-cableado.test.ts`: `GET = conFrontera(conCors(manejar, "GET"))`,
  el adaptador pasa `compuertaDeFondo`, y `lib/home-fondo.ts` no contiene
  `await Promise.resolve()`.
- Repetidos: aislamiento de métricas/señal/ALS, publicación segura,
  renovación, fencing, ENFRIAR, liberación y UB intacto ante degradación,
  error y cancelación (`home-servir.test.ts`, 44/44).
- **Banco 3.b** (dobles con latencia, antes `903832e` vs rama; verde): nueva
  medida `componeAntesDeTerminal` por posición en el log — **0 en la rama**
  (ningún `[home] compone` precede a la línea terminal de la solicitud; en
  el log: `[home] 55ms total … ultimo-bueno-fondo` y recién después
  `[home] compone …`) y **1 en el antes** (compone en línea). UB presente:
  80 ms con el UB, fondo 5.336 ms publicado, siguiente HIT 17 ms, fresca
  idéntica; concurrentes 43/43 ms; sin UB 5,7 s; degradado en fondo (8
  descartes, UB intacto); 5xx total (degradado vía `safe()`); cancelado a
  50,5 s; kill switch y sin fondo como el antes.
- Suite **1.701 tests, 1.691 aprobados, 0 fallos, 10 omitidos**; `tsc
  --noEmit` limpio; build fresco (`BUILD_ID gyBDPIpEGVqCAHimXFrDK`); `git
  diff --check` limpio; cliente sin rastro del paquete ni de la frontera;
  identidad del Home **16/16**.

### 35.5 Contradicciones documentales corregidas

- El encabezado del informe, `ESTADO.md` e `ISSUES.md` decían que `waitUntil`
  **no** estaba implementado: ahora distinguen **Producción (`903832e`, sin
  `waitUntil`)** de la **rama de la 3.b (con `waitUntil`, sólo para el fondo
  del Home)**.
- §32.2/§32.3 describían en presente que el líder con UB compone en línea:
  quedan marcados como **comportamiento anterior a la 3.b**; el
  implementado en la rama es §34-§35.

### 35.6 Comprobado / inferido / desconocido

- **Comprobado:** §35.2 (RED), §35.4 (GREEN, banco, identidad, build, suite).
- **Inferido:** que en Vercel la compuerta se abre en el mismo punto que en
  el arnés (cuando el handler devuelve su `Response`): la frontera es ALS y
  no depende del runtime; no se verificó en Preview esta corrección (la
  sonda del gate §34.6 validó `waitUntil`, no la frontera). Que "respuesta
  construida" en Vercel implica "respuesta enviada" sigue en manos de Next:
  la serialización ocurre al devolver el handler.
- **Desconocido:** el coste de iniciar el fondo unos microtasks más tarde
  (nulo en el banco: 80 ms de respuesta y 5,3 s de fondo).

Estado: superado por §36 (la auditoría sobre `3a057fc` mostró que "handler
devolvió" no es "llamador recibió").

## 36. Corrección de la 3.b tras la auditoría de Codex sobre `3a057fc` — pendiente de nueva auditoría; no mergeada ni desplegada

### 36.1 Causa exacta

La compuerta de `3a057fc` se abría en el `finally` de `conFronteraDeFondo`,
es decir, **en el mismo microtask en que el handler devolvía**. Abrirla
resuelve la promesa de la compuerta, y la continuación de la tarea de fondo
(`await compuerta` en `lib/home-fondo.ts`) queda encolada como microtask
**antes** de que la promesa que `GET` devuelve se resuelva para su llamador:
ese llamador (`const r = await GET(req)`, o el runtime de Next) recibe el
`Response` en un microtask posterior. Orden real: `respuesta-construida →
fondo-inicia → caller-recibio-response`. Lo que §35 llamó "compuerta abierta
con la respuesta construida" era cierto, pero **"construida" no es
"entregada"**: el primer tramo síncrono de `composeHome` seguía dentro del
camino crítico de la entrega.

### 36.2 RED contra `3a057fc`

`lib/home-fondo-orden.test.ts` (`e89e99a`) atraviesa la **frontera externa
real**: el test es el llamador de `GET`:

```ts
const promesa = GET({});
const response = await promesa;
eventos.push("caller-recibio-response");
```

con el programador real (`crearProgramadorDeFondo` + `compuertaDeFondo`), el
`servirConTurno` real con UB presente y un `programarEnFondo` cuyo arranque
es observable de forma síncrona (`eventos.push("fondo-inicia")` antes de
`withMetricas(iniciar)`). Exige estrictamente
`["respuesta-construida", "caller-recibio-response", "fondo-inicia"]`.
Contra `3a057fc` falló con exactamente
`["respuesta-construida", "fondo-inicia", "caller-recibio-response"]`, y
también en la variante con **dos llamadores concurrentes** (A 60 ms, B 5 ms):
en cada uno el fondo precedía a su `caller-recibio`. El control que modela la
apertura en el `finally` reproduce el agujero.

### 36.3 Solución: ceder al event loop antes de abrir (`lib/fondo-frontera.ts`, `33d2ea2`)

`conFronteraDeFondo` ya no abre la compuerta en el `finally`: en el `finally`
**cede** (`ceder`, por defecto `setImmediate`) y abre en la continuación de
esa cesión (`void ceder().then(() => abrir(f), () => abrir(f))`). El valor —o
el error— del handler se entrega al llamador sin esperar la cesión.

Por qué `setImmediate` garantiza que la promesa del handler llega primero al
llamador en Node (y en el runtime Node de Vercel): la cola de microtasks
(continuaciones de promesas y `process.nextTick`) se vacía **por completo**
antes de la fase `check` del event loop, que es donde corre `setImmediate`.
Cada `await` intermedio entre el handler y su llamador —`conCors`, la capa
del runtime— es un microtask más de esa misma cola, así que para cuando la
compuerta se abre, todos ya corrieron. Es una frontera de **fase**, no una
cantidad de microticks. Medido con el arnés (`node`): una cesión de **un
microtask** (`Promise.resolve()`) da el orden correcto sólo con **0 capas**
async entre el handler y el llamador y **se invierte con 1..4 capas**
(`conCors` ya es una); `setImmediate` da el orden correcto con 0..4. No se
usó `setTimeout(0)` (fase de timers, granularidad de 1 ms, orden relativo a
`setImmediate` no determinista fuera de I/O) ni `scheduler.yield` (no
disponible como frontera de fase en Node 24 estable). `ceder` es inyectable
(`OpcionesFrontera`) sólo para probarlo; si rechaza, la compuerta se abre
igual.

Garantías de la compuerta conservadas: `NextResponse` con cabeceras de CORS
construido (la frontera sigue envolviendo por fuera a `conCors`); sin
frontera no hay fondo (`false`, bloqueante); un handler que lanza deja la
compuerta abierta tras la cesión y ninguna tarea colgada; frontera por
solicitud (`AsyncLocalStorage`).

### 36.4 GREEN — traza con `caller-recibio-response`

- Orden externo simple (arnés real, UB presente), eventos filtrados:
  `respuesta-construida → caller-recibio-response → fondo-inicia`; una sola
  composición; fresca publicada por el fondo. Traza completa:
  `servir-devolvio:ultimo-bueno-fondo → [home] terminal →
  respuesta-construida → caller-recibio-response → fondo-inicia → [home]
  compone → iniciar → [home-fondo] publicado`.
- Dos llamadores concurrentes: para cada uno
  `respuesta-construida:X < caller-recibio:X < fondo-inicia:X`, y
  `fondo-inicia:B < respuesta-construida:A` (B no espera a A).
- Cesión instrumentada: `respuesta-construida → caller-recibio-response →
  cedido → fondo-inicia`.
- Control por profundidad (0..4 capas): `setImmediate` correcto en todas;
  un microtask correcto sólo con 0 y mal con 1..4.
- `ceder` que rechaza: la tarea corre igual; sin `unhandledRejection`.
- Conservados: sin frontera → `false`; handler que lanza → tarea corre;
  fallbacks (`waitUntil` ausente, kill switch, registro que lanza, sin UB)
  → exactamente una composición bloqueante; aislamiento ALS/métricas/señal;
  renovación, fencing, ENFRIAR, liberación y UB intacto
  (`home-servir.test.ts` 44/44; `home-fondo.test.ts`; `etapa3b-cableado`
  fija `setImmediate(r)`, la apertura tras `ceder` y prohíbe `finally {
  abrir(f)`). Archivos de la etapa: **125/125**.
- Suite **1.707 tests, 1.697 aprobados, 0 fallos, 10 omitidos**; `tsc
  --noEmit` limpio; build fresco (`BUILD_ID jhA53XB4nl_MXIibePibx`);
  `@vercel/functions` sólo en el bundle de `/api/home`, nada en el cliente;
  `git diff --check` limpio.
- **Banco 3.b** (antes `903832e` vs rama, verde): UB presente antes 5.721
  ms en línea, rama **71 ms** `ultimo-bueno-fondo` + fondo 5.148 ms
  publicado (833 llamadas a TMDB de dobles), siguiente HIT 25 ms, fresca
  idéntica; `componeAntesDeTerminal` 0 en la rama; concurrentes 55/54 ms;
  sin UB 5.402 ms como el antes; degradado en fondo (8 descartes, UB
  intacto), 5xx total degradado, cancelado a 50,5 s; kill switch 5.257 ms
  y sin fondo 5.370 ms como el antes.
- **Identidad del Home 16/16** (`b7be927` vs rama), control de mutaciones
  y control compartido rechazado.

### 36.5 Preview aislado: los tres niveles

El mecanismo cambió respecto del Preview de §34.6, así que se hizo un Preview
aislado de la rama (`33d2ea2` + sonda `064b131`, `dpl_BjiwdfGkHQVQ5vnSQuYHVicPRmJG`,
target `preview`, `iad1`, **borrado al terminar; Producción no se tocó**;
evidencia en `docs/medidas/2026-09-15-etapa3b-preview-frontera.json`). La
sonda usa la MISMA maquinaria que `/api/home` —`conFrontera`,
`crearProgramadorDeFondo` con `compuertaDeFondo` y el `waitUntil` **público**
de `@vercel/functions`— y su fondo arranca con **3.000 ms síncronos**: si
corriera antes de que salgan los bytes, el cliente lo vería.

| Nivel | Qué es | Quién lo observa | Resultado |
|---|---|---|---|
| 1. Respuesta construida en el handler | `NextResponse` listo, CORS incluido | log `[home]` / test | +0/1 ms en los cinco pedidos |
| 2. Promesa del handler entregada al llamador | `await GET(req)` volvió | **sólo el test** (`caller-recibio-response`); los logs del runtime no lo distinguen: `fondo-inicia` sale +1..18 ms en los dos modos | orden probado en §36.4 |
| 3. Bytes enviados al usuario | el cliente tiene el cuerpo | **sólo el Preview** | con `setImmediate`: cuerpo en **424-425 ms** (807 ms el primero, frío) pese a los 3 s síncronos del fondo; control de un microtask: **3.306-3.472 ms** = el fondo corrió ANTES de que salieran los bytes |

En los cinco pedidos el fondo llegó a `DONE` a +11 s: `waitUntil` mantuvo
viva la función después de la respuesta. **En el runtime real de Vercel un
microtask no es frontera; `setImmediate` sí.**

### 36.6 Contradicciones documentales corregidas

- §35.3/§35.6 hablaban de "compuerta abierta cuando el handler devolvió" y
  daban por inferido que eso equivalía a "respuesta enviada": quedan
  superados por §36 (ver nota en §35.3).
- `CLAUDE.md`, `ESTADO.md`, `ISSUES.md` y los comentarios de `lib/home.ts`,
  `lib/home-fondo.ts` y `lib/home-servir.ts` decían "después de responder":
  ahora dicen lo que se prueba en cada nivel — la composición arranca
  cuando la promesa del handler ya fue **entregada a su llamador** (test), y
  que los bytes ya salieron sólo lo observa un Preview (§36.5).

### 36.7 Comprobado / inferido / desconocido

- **Comprobado:** §36.2 (RED), §36.4 (GREEN, banco, identidad, build,
  suite), §36.5 (Preview: bytes antes del fondo con `setImmediate`, después
  con un microtask).
- **Inferido:** que el runtime de Next 14.2 en Vercel no introduce ninguna
  macrotask entre recibir el `Response` y escribir los bytes que pudiera
  quedar detrás de `setImmediate`; la medida de §36.5 (424 ms vs 3.3 s) lo
  respalda para el caso medido, no lo demuestra en general.
- **Desconocido:** el coste de la cesión en Producción (en el Preview y en
  el banco es de milisegundos: `fondo-inicia` +2 ms).

Estado: aprobada por la auditoría final sobre `c5fab20`; mergeada y
desplegada en §37.

## 37. Etapa 3.b mergeada, pusheada y desplegada (2026-09-15)

- **Aprobación:** auditoría final de Codex sobre `c5fab20`: orden
  `respuesta-construida → caller-recibio-response → fondo-inicia` cumplido;
  Preview distingue el mecanismo nuevo (~425 ms) del microtask (~3,3 s);
  sin regresiones de contenido, sin composiciones duplicadas, sin problemas
  de aislamiento. Dos correcciones documentales previas al merge
  (`ae6902f`): clave del Home `v6` en `CLAUDE.md` (`VERSION_HOME = 6`; v6 =
  toggle de "Últimos lanzamientos") y fecha canónica de `ESTADO.md`.
- **Precondiciones verificadas:** rama en `ae6902f` (padre `c5fab20`);
  `main = origin/main = 903832e`; árbol trackeado limpio; los cuatro
  archivos ajenos intactos y sin seguimiento.
- **Merge:** `git merge --no-ff` → **`5604750`** (sin squash ni rebase);
  árbol del merge idéntico al de la rama (`rev-parse ^{tree}` iguales).
- **Verificación sobre el `main` fusionado:** `npm ci`
  (`@vercel/functions` 3.9.7); frontera/fondo/servicio/CORS/cableado
  **125/125**; suite **1.707 tests, 1.697 ok, 0 fallos, 10 omitidos**;
  `tsc --noEmit` limpio; build fresco `6qYrjMyN9TMw0Pw6uYzlN` (`waitUntil`
  sólo en `.next/server/app/api/home/route.js`, nada en `.next/static`);
  `git diff --check` limpio.
- **Push y deployment:** `903832e..5604750 main -> main`; deployment
  automático **`dpl_A9oAnbXKBqbBTGiKC6kMMLdFz3oB`** READY, target
  production, `githubCommitSha = 5604750c71078185b6a553841b693213c27895f9`,
  ref `main`, alias `app.yump.ar` (y `streamingcentral.vercel.app`).
- **Comprobación pasiva** (sin vaciar cachés, sin forzar expiraciones, 429,
  caídas ni carga): `/api/health` 200 en 1,3 s (Redis OK, 345 claves);
  `/api/search?q=matrix` 200 (24 títulos, 18 personas, sin `degradacion`);
  `/api/title/movie/603` 200 (Matrix, plataformas `mv,m`); Home 200 (6
  hero, 12 rieles, 309 títulos, `degradado: false`, `fallos: 0`).
- **Camino 3.b observado naturalmente en Producción**, en el primer Home
  tras el deploy (la fresca de 6 h había vencido; existía UB):
  1. `[home] 643ms total | cache ULTIMO-BUENO | 0 composiciones | turno
     adquirido | origen ultimo-bueno-fondo | publicacion no | propietario
     …:4:1 | fondo programado | tmdb 0 llamadas` — y recién **después** en
     el log, `[home] compone home:es-MX+f.r1:v6:…:d,m,n: …:4:1` y sus
     `VUELTAS`/`EJES`.
  2. Dos pedidos siguientes (`…:4:2`, `…:4:3`): `turno ocupado | origen
     ultimo-bueno`, 735 y 701 ms, 0 composiciones.
  3. Una única **`[home-fondo] 16682ms total | cache MISS | 1 composición |
     turno adquirido | origen propia | publicacion publicado | renovaciones
     3 | propietario …:4:1 | tmdb 342 llamadas (342 ok) | supabase 11 (11
     ok)`**, misma clave y propietario que la `[home]` de 643 ms.
  4. Pedido siguiente: `[home] 269ms total | cache HIT` sobre la fresca
     publicada por el fondo (861 ms medidos desde el cliente).
  Sin `Task timed out` (el fondo terminó a ~17 s de los 60), sin `[tmdb]
  descarte`, sin `unhandled`/`TypeError`/`ERR_` en la ventana. Nada de esto
  se provocó: fueron los pedidos de verificación del propio deploy.
- **Identidad del Home preservada:** banco 16/16 (`b7be927` vs `33d2ea2`,
  `docs/medidas/2026-09-14-etapa3a-identidad-home.json`); el contenido del
  Home en Producción coincide en forma (hero 6, 12 rieles, 309 títulos) con
  el observado tras la 3.a.
- **Reversión:** `HOME_UB_PRIMERO=0` + redeployment; requiere autorización
  del dueño; no se usó ni se tocó ninguna variable.
- **#19 sigue abierto** por limitador, cadencias, pausa distribuida,
  AIMD/circuito y membresía: diseñados (§9-§13), no aprobados, no
  implementados. `COMPOSICION_MAX_MS` sigue como está.

Estado: **Etapa 3.b MERGEADA (`5604750`), PUSHEADA y DESPLEGADA
(`dpl_A9oAnbXKBqbBTGiKC6kMMLdFz3oB`).**

## 38. Producción tras la 3.b y revisión del diseño de la 3.c — **observación pasiva + diseño revisado, pendiente de aprobación; no implementado** (2026-09-16)

Rama documental `diseno/etapa3c-proteccion-tmdb` (worktree `wt-etapa3c`),
fork de `main = origin/main = 37d4707`. Sin código, sin dependencias, sin
variables, sin infraestructura, sin tocar cachés ni Producción. Convención
de cifras: **[medido]** ejecutado u observado; **[derivado]** cálculo sobre
cifras medidas o sobre el código; **[propuesto]** valor a confirmar en el
banco; **[desconocido]** sin dato.

### 38.0 Git — COMPROBADO

`main = origin/main = 37d4707`; árbol trackeado limpio; los cuatro archivos
ajenos (`avatares/`, `prompts/noticias-filtro.md`,
`prompts/noticias-redaccion.md`, `supabase/migrations/004_news.sql`) intactos
y sin seguimiento.

### 38.1 Qué se pudo observar de Producción, y qué no

**La retención de logs no permite una serie desde el despliegue.** Con el
CLI 59.19.1 (`vercel logs --environment production --since … --json`) y
también con el 59.11.7 usado el 15/09:

| Ventana consultada (UTC) | Filas devueltas | Lo que se sabe de esa ventana |
|---|---|---|
| 2026-09-15 18:00 → 20:00 | **0** | contiene, con certeza, ≥ 6 solicitudes a `/api/home` y las líneas `[home]`/`[home-fondo]` transcriptas en §37 (se leyeron en vivo el 15/09) — **existieron y ya no se devuelven** |
| 2026-09-15 20:00 → 2026-09-16 12:00 | 0 | [desconocido]: puede ser tráfico cero o retención vencida; **no se cuenta como cero** |
| 2026-09-16 12:00 → 19:15 | **1** (`GET /` estático, `cache HIT`, 15:26:50Z) | ídem para el resto de la ventana |
| `--since 1h/3h/12h/30h` | 1, 1, 1, 1 | la misma fila |
| Ventana en vivo (`--follow`), 19:12:22Z, hasta 19:32:36Z | **0** (cuatro tramos de 5 min, el tope por consulta del `--follow`: 19:12-19:17, 19:17-19:22, 19:22-19:27, 19:27-19:32; ninguna solicitud de ningún tipo) | única serie observada de forma continua; ver 38.2 |

Retención efectiva: **[desconocido]** con exactitud; **[medido]** que una
fila de 3,7 h de antigüedad se devuelve y que ninguna de 24 h se devuelve.
La API de la plataforma (`api.vercel.com`) respondió 403 con el token del
CLI, así que no hubo un segundo canal. Consecuencia honesta: **la única
evidencia del camino 3.b en Producción sigue siendo la del 15/09 (§37)**,
capturada en vivo durante la verificación del despliegue.

### 38.2 Conteos — sólo los que la evidencia permite

Todos [medido] sobre las líneas leídas en vivo el 15/09 (§37), una sola
clave (`home:es-MX+f.r1:v6:2412787034:d,m,n:`), una sola generación
(propietario `…:4:1`), más lo que haya entrado en la ventana en vivo de hoy
(38.1). **No son tasas ni promedios: son los eventos vistos.**

| Evento | Visto | Nota |
|---|---|---|
| HIT de fresca | 1 | 269 ms, la fresca publicada por el fondo |
| `ultimo-bueno-fondo` (líder con UB) | 1 | 643 ms; `fondo programado`; `tmdb 0 llamadas` |
| seguidores `ultimo-bueno` (`turno ocupado`) | 2 | 701 y 735 ms |
| composición en línea sin UB (`origen propia` en `[home]`) | 0 vistas | no hubo combinación sin UB en la ventana; **no significa que no ocurra** |
| fondos publicados | 1 | `[home-fondo] 16682ms … publicacion publicado` |
| fondos degradados / cancelados / con error | 0 vistos | ídem: ventana de una sola generación |
| duración de la respuesta (`[home] … total`) | 643 / 701 / 735 / 269 ms | UB, UB, UB, HIT |
| duración del fondo | 16.682 ms | 1 composición; terminó a ~17 s de los 50 del presupuesto (`PRESUPUESTO_REQUEST_MS`) |
| llamadas a TMDB / errores | 342 / 0 (`342 ok`) | Redis parcialmente caliente: no es el frío de 926 |
| renovaciones del turno | 3 | por el fondo, correctas (la composición duró > un TTL de turno) |
| publicaciones rechazadas (fencing) | 0 vistas | `publicacion publicado` |
| timeouts (`Task timed out`, `AbortError`) | 0 vistos | |
| `[tmdb] descarte` / `unhandled` / `TypeError` | 0 vistos | |

Cadencia efectiva de esa reconstrucción: `342 / 16,7 s ≈ 20,5 llamadas/s`
[derivado]; la del 15/09 tras la 3.a (§32.1): `250 / 15,1 s ≈ 16,6/s`
[derivado]. Con `MAX_EN_VUELO = 24` por proceso [medido en `lib/tmdb.ts`]
y un promedio de `119.175 ms / 342 ≈ 348 ms` por llamada [derivado de la
línea], la concurrencia permitiría ~69/s: **la cadencia real la fija la forma
del pipeline** (fases `discover` → `providersOf` por título, "vueltas" por
riel, 383 ida-y-vuelta a Upstash en serie con ellas), no el semáforo ni TMDB.
Es una cifra de dos observaciones, no una distribución.

### 38.3 Señales negativas buscadas — ninguna encontrada en lo observado

| Señal | Evidencia | Resultado |
|---|---|---|
| más de un fondo por clave y generación | una única `[home-fondo]` para `…:4:1`; los seguidores no programaron fondo (`turno ocupado`, sin `fondo programado`); por código, sólo el que adquiere el turno programa | no vista; el fencing por generación queda cubierto por `home-servir.test.ts` |
| Home incompleto publicado | el fondo publicó con `342/342 ok`, `degradado: false`; por código (`cachedIf`, `producir` anota `degradado`), lo degradado no se publica | no vista |
| UB sobrescrito por un resultado degradado | mismo mecanismo; el banco 3.b lo fija por sha1 (`degradadoEnFondo`, `cincoXXTotalEnFondo`, `canceladoEnFondo`) | no vista |
| aumento de errores o respuestas lentas | 0 errores; respuestas 269-735 ms; búsqueda 4,1 s y ficha 2,8 s fríos [medido 15/09]; el informe no tiene una cifra previa comparable, así que no se afirma igualdad | no vista |
| cambio de contenido o contrato del Home | claves del JSON `hero, rails, fallos, degradado`; 6 hero + 12 rieles + 309 títulos, igual que tras la 3.a; identidad 16/16 en el banco | no vista |

**Lo que esto NO prueba:** nada sobre el comportamiento con tráfico real
sostenido, con varias instancias, con una combinación sin UB, ni con TMDB
degradado. La ventana es una generación de una clave. Y **el tráfico orgánico
observable es prácticamente nulo** (una fila estática en 7 h): el camino
UB-primero se va a ver naturalmente **muy pocas veces**, y la retención lo
borra antes del día. Para tener serie hace falta observabilidad propia (#20,
Etapa 5), no más ventanas de `vercel logs`.

### 38.4 Revisión del diseño vigente de la 3.c (§5.5, §8, §9, §10, §32.5)

El diseño vigente propone un limitador global de **28/s** [propuesto en §8.3,
nunca medido contra la cuenta] repartido en **dos cadencias físicas de 14/s**
(interactiva y masiva) con préstamo, ranuras absolutas en Redis con
vencimiento verificable, circuito y pausa distribuida. Lo que se sostiene y
lo que no, con las cifras de hoy:

1. **La condición bloqueante de §5.5 está peor de lo que decía.** §5.5 usó
   `presupuesto_fondo ≈ 55 s`. El implementado es **50 s desde el inicio de
   la solicitud** (`PRESUPUESTO_REQUEST_MS = 60.000 − 10.000`, señal del
   fondo `AbortSignal.timeout(50_000)` en `lib/home.ts`) [medido en código],
   menos la respuesta del UB (≈ 0,6 s) → **≈ 49 s útiles** [derivado]. Con
   `C_max = 926` [medido en el doble del banco, Redis vacío] y `L ≈ 2 s`
   [propuesto]: `s_reconstrucción ≥ 926 / 47 ≈ 19,7/s` [derivado]. La
   cadencia masiva de 14/s la condena (`926 / 14 = 66 s`), y **la cadencia
   observada hoy sin ningún limitador (16,6-20,5/s) ya está en el borde**:
   una reconstrucción de 926 a 20/s son ~46 s + L. O sea que la reconstrucción
   totalmente fría **está cerca de no caber en el presupuesto aun sin
   limitador** [derivado de dos observaciones parciales; falta medirla en
   frío total]. Cualquier tasa fija por debajo de ~20/s para la clase del
   Home la deja fuera con certeza.
2. **Un limitador de tasa fija no resuelve nada que hoy esté roto.** No hay
   ni un 429 observado en Producción (250/250 y 342/342 ok) [medido]; el
   único problema comprobado —el líder esperando en línea— lo resolvió la
   3.b. Lo que la 3.c protege es un riesgo real pero **no observado**: varias
   reconstrucciones frías simultáneas (claves distintas, instancias
   distintas) o el `tmdb-sync` en la misma ventana, superando el límite de
   TMDB.
3. **La garantía "demostrada" de §8.3 sigue siendo válida como cota**, pero
   su precio (116 `EVAL` por Home frío, `RTT_TOPE`, ranuras quemadas,
   cadencia local con Redis lento) se paga **siempre**, incluso en el 100 %
   del tiempo en que TMDB está sano. Con tráfico casi nulo, es un mecanismo
   activo permanentemente para un evento que no se ha visto.
4. **Una cifra del diseño no se sostiene en Producción.** §5.5 dice que hoy
   "el Home frío se compone a ~200/s en ~5 s". Eso sale del banco (dobles
   locales con 60 ms de latencia), no de Producción: en Producción las dos
   composiciones observadas corrieron a **16,6 y 20,5/s** [derivado de
   §32.1 y §37], diez veces menos. Por eso la tabla de §5.3 ("Redis vacío,
   sin tráfico: 926 → 33 s a 28/s") describe un limitador que **frenaría
   menos que la latencia real**: el cuello hoy no es la tasa, es la forma
   del pipeline más Upstash. La condición de §5.5 hay que reescribirla sobre
   cifras de Producción, y **medir el frío total de 926 en un doble con
   latencia realista** antes de decidir cualquier tasa (3.c.0).
5. **Distinciones que el diseño debe mantener separadas** (§38.5).

### 38.5 Las seis cosas que no son lo mismo

| Magnitud | Qué es | Hoy |
|---|---|---|
| **Concurrencia** | llamadas en vuelo a la vez, por proceso | `MAX_EN_VUELO = 24` (`TMDB_MAX_CONCURRENT`) [medido en código]; observada ≤ 24 |
| **Tasa de solicitudes** | llamadas iniciadas por segundo, por proceso o globales | sin límite; efectiva 16,6-20,5/s en una reconstrucción [derivado]; con `N` reconstrucciones simultáneas ≈ `N × 20` [derivado] |
| **Llamadas lógicas** | lo que el código pidió (`tmdb.llamadas` en la línea) | 342 y 250 [medido]; 926 en frío total [medido en el doble] |
| **Intentos reales** | `fetch` que salieron al cable (`tmdb.intentos`, `reintentos`) | = llamadas lógicas mientras `TMDB_REINTENTOS` esté apagado [medido: ausente en Producción]; con reintentos, `intentos ≥ llamadas` |
| **Instancias de Vercel** | procesos que comparten el token de TMDB | [desconocido]; Fluid compute reutiliza instancias, pero el número en un pico no se observa; el semáforo es por proceso, así que la concurrencia total es `24 × instancias` |
| **Límite de la app vs. límite de la cuenta** | lo que esta app emite vs. lo que TMDB cuenta contra el token (app + `tmdb-sync` + scripts manuales) | TMDB publica "~40-50 req/s, puede cambiar" [documentación, no medido]; nuestra parte máxima observada: una reconstrucción; la del `tmdb-sync` [desconocido, se asume el mismo token] |

Un limitador **de la app** acota la segunda fila por proceso o globalmente;
**no** acota la sexta, salvo que el `tmdb-sync` y los scripts pasen por el
mismo mecanismo (fuera del alcance de la 3.c).

### 38.6 Alternativas para la tensión, sin tocar el Home

Criterio común: con TMDB sano, **ninguna** alternativa puede cambiar títulos,
orden, cantidad, plataformas, badges, hero, rieles, toggles ni JSON (§1,
§11), y la reconstrucción fría de 926 tiene que caber en los ~47 s útiles.

| Alternativa | Cómo | Cumple la condición bloqueante | Costo con TMDB sano | Juicio |
|---|---|---|---|---|
| **A. Prioridad temporal para la reconstrucción fría** | mientras hay una reconstrucción de Home en curso, ella toma las dos cadencias (28/s) y lo interactivo usa lo que sobra con un mínimo reservado | sí si `28 − mínimo_interactivo ≥ 19,7/s` → mínimo interactivo ≤ 8/s [derivado] | el limitador sigue activo siempre; complejidad de §8 más una prioridad | mejor que el diseño vigente; sigue pagando el precio permanente |
| **B. Reserva de capacidad para el Home** | tercera cadencia reservada ≥ 20/s a la reconstrucción (§5.5 forma 1) | sí, por construcción; deja 8/s al resto [derivado] | tres cadencias, tres `tat`, préstamo en tres direcciones: la parte más compleja del script | funciona, pero es la variante más pesada del mismo precio |
| **C. Limitar sólo al detectar 429** (reactivo) | sin tasa fija; cada 429 con `Retry-After` (ya parseado desde la 3.a) escribe una **pausa compartida** en Redis; mientras dure, nadie inicia llamadas nuevas; al vencer, rampa breve | **sí, trivialmente**: con TMDB sano no hay ningún límite, la reconstrucción va a su cadencia natural | ~0: una lectura de Redis por composición (no por llamada) y una escritura por 429 | **recomendada como núcleo** |
| **D. Circuito + pausa compartida sin tasa fija** | C más un circuito: con pausa vigente el fondo **no se inicia** (el líder sirve el UB y el turno queda libre) y lo interactivo responde degradado/`503` con `Retry-After`; recuperación gradual con `enVuelo` reducido y creciente (AIMD sobre la **concurrencia**, no sobre una tasa) | sí: sólo actúa tras un 429 real | ~0 | **recomendada junto con C** |
| **E. Techo de concurrencia global** (`24 × instancias` → tope compartido) | contador en Redis de llamadas en vuelo | sí si el tope ≥ 24 (una reconstrucción usa ≤ 24) | una operación de Redis por llamada (`INCR`/`DECR`): 926 × 2 por Home frío | caro para lo que aporta; descartada mientras no se mida que las instancias simultáneas son el problema |
| **F. Reducir `C`** (membresía por pool, §12) | menos llamadas | sí | riesgo directo sobre el contenido | **no** (§12): sólo con gate de diferencia cero, y no es de la 3.c |

**Recomendación: C + D como Etapa 3.c**, y dejar el limitador de tasa fija
(§8) como 3.c'' **condicionado a una medición que hoy no existe**: que dos
reconstrucciones frías simultáneas más `tmdb-sync` superen el límite real
de la cuenta en el banco multiproceso, con la tasa real de TMDB medida y no
leída. Si esa medición muestra que hace falta un techo, la forma sería **A**
(prioridad a la reconstrucción) y no las dos cadencias iguales de §8.4.

### 38.7 Etapa 3.c mínima y reversible — propuesta

Dividida en tres, cada una con su kill switch y desplegable por separado.
**Ninguna cifra queda fijada acá**: las marcadas [propuesto] se confirman en
el banco antes de codificar.

**3.c.0 — Medir antes de proteger (sin código productivo).**
- Banco multiproceso aislado (dos instancias del doble de Redis, doble de
  TMDB con latencia realista: p50 ≈ 350 ms [derivado del 15/09], p95
  [propuesto: 800 ms]) con **un Home frío total (926)**: publica cadencia
  efectiva, duración y si cabe en 47 s; después **dos y tres claves frías a
  la vez en tres procesos** (tasa global resultante). Y el mismo escenario
  con `tmdb-sync` simulado en paralelo (una tasa constante [propuesto: 10/s]).
- Salida: `cadencia_reconstrucción` [medido en el doble] y
  `tasa_global_max` [medido en el doble]. **Condición de paso a 3.c.1:**
  una reconstrucción fría sola cabe en el presupuesto en el banco; si no
  cabe, la 3.c no arregla eso y hay que abrir otro frente (forma del
  pipeline o presupuesto), **antes** de cualquier limitador.

**3.c.1 — Pausa compartida ante 429 (`lib/tmdb-pausa.ts`, puro).**
- Al recibir un 429 (clase `http429` de la 3.a, `lib/tmdb-error.ts`, con `retryAfterMs` ya parseado) con o sin `Retry-After`: `SET
  tmdb:pausa <hasta> PX <ms> NX` (el `Retry-After` parseado; sin cabecera,
  un backoff exponencial acotado [propuesto: 1 s → 8 s]). Un solo escritor
  gana; los demás leen.
- `conPausa()`: **una lectura por composición/consulta**, no por llamada:
  el `[home]` frío, la ficha, la búsqueda leen la pausa al empezar; si está
  vigente, no inician llamadas a TMDB. Las llamadas ya en vuelo terminan.
- Con Redis caído o lento: sin pausa (comportamiento actual), contado
  (`pausaNoLeida`). **No se introduce ninguna cadencia local.**
- Kill switch `TMDB_PAUSA_429=0` → todo como hoy. Sin cambio de claves,
  sin migración.
- Métricas nuevas en la línea: `pausa vigente|no`, `pausas escritas`,
  `pausaNoLeida`.

**3.c.2 — Circuito para el fondo y recuperación gradual.**
- Con pausa vigente, el líder con UB **no programa el fondo** (`programarEnFondo`
  devuelve `false` por "pausa") y sirve el UB; el turno se libera, así que
  el primer pedido tras la pausa vuelve a intentar. Sin UB: composición en
  línea rechazada → degradado marcado (no se publica), como hoy ante caída.
- Tras la pausa: `MAX_EN_VUELO` efectivo empieza en un piso [propuesto: 4]
  y sube [propuesto: ×2 por segundo sin 429] hasta 24. Es AIMD sobre la
  **concurrencia** por proceso, que es la única magnitud que este código
  controla hoy; no introduce tasa.
- Kill switch `TMDB_CIRCUITO=0`.
- Los reintentos (`TMDB_REINTENTOS`) **siguen apagados** en 3.c: encenderlos
  es 3.c' y sólo después de que la pausa exista (v4: sin pausa multiplican
  la caída ×3).

**3.c'' — Techo de tasa (§8) — NO se propone ahora.** Queda condicionado a
que 3.c.0 mida una `tasa_global_max` por encima del límite real de la
cuenta; si se propone, con prioridad a la reconstrucción (forma A) y con
la condición de §5.5 recalculada sobre 47 s.

### 38.8 Criterios RED → GREEN (banco aislado, dobles, sin TMDB real, sin credenciales de Producción)

| # | Escenario | RED (contra `37d4707`) | GREEN |
|---|---|---|---|
| 1 | **429 parcial**: el doble devuelve 429 con `Retry-After: 2` al 10 % de las llamadas de una composición | cada 429 es un descarte; ningún proceso se entera del de otro; el Home queda degradado y no se publica | tras el **primer** 429 nadie inicia llamadas nuevas hasta `hasta`; llamadas iniciadas después de la pausa: 0 [medido en el doble]; la composición se cancela limpia (`AbortError`, degradado, no publicada); UB intacto (sha1) |
| 2 | **429 total** durante 5 s en 3 procesos con 3 claves | 3 × ~N llamadas que fallan; tres degradados | una sola pausa escrita (`NX`), tres lecturas; ≤ `3 × 24` llamadas después del primer 429 (las ya en vuelo) y **cero nuevas**; tres UB servidos |
| 3 | **Recuperación**: el doble vuelve a 200 al vencer la pausa | — | primer pedido tras la pausa reconstruye; `enVuelo` arranca en el piso y llega a 24 sin 429; fresca publicada **idéntica** a la del frío sano (comparador) |
| 4 | **Redis lento** (doble con 400 ms) | — | la lectura de la pausa cuesta una ida y vuelta por composición, no por llamada; el frío de 926 cuesta ≤ 2 lecturas más que hoy; sin cadencia local |
| 5 | **Redis caído** durante la pausa | — | `pausaNoLeida` > 0; comportamiento actual (sin pausa); al volver Redis, se lee |
| 6 | **Tráfico mixto**: 2 Homes fríos + 3 fichas/s + 1 búsqueda/s, 3 procesos, doble sano | — | tiempos iguales a `37d4707` ± ruido (con TMDB sano el mecanismo no actúa); identidad 16/16 |
| 7 | **Identidad completa del Home** (§14) con 3.c encendida y apagada vs `b7be927` y vs `37d4707` | — | 0 diferencias en las 16 combinaciones; controles de mutación fallan; control compartido rechazado |
| 8 | **Kill switches** | — | `TMDB_PAUSA_429=0` y `TMDB_CIRCUITO=0` reproducen `37d4707` byte a byte en la línea `[home]` salvo los campos nuevos |
| 9 | **Fondo con pausa vigente** | el fondo se programa y muere en 429 | `programarEnFondo` devuelve `false` con motivo `pausa`; UB servido; turno liberado; el pedido siguiente tras la pausa reconstruye |
| 10 | **3.c.0** (medición) | — | cifras publicadas en `docs/medidas/` con marca [medido en el doble]; condición de paso evaluada |

**Condición explícita de rollback en Producción:** cualquiera de: (i) una
línea `[home]` o `[home-fondo]` con `pausa vigente` **sin** un 429 en la
misma ventana; (ii) `pausaNoLeida` > 0 sostenido con Redis sano; (iii) una
fresca publicada distinta de la esperada para la misma semilla y respuestas
(comparador sobre un Preview aislado); (iv) aumento de `503` interactivos sin
429 de TMDB. Rollback: `TMDB_PAUSA_429=0` (y `TMDB_CIRCUITO=0`) + redeploy;
requiere autorización del dueño; no se cambia automáticamente.

### 38.9 Comprobado / inferido / desconocido

- **Comprobado:** 38.0; 38.1 (las consultas ejecutadas y sus filas); 38.2 y
  38.3 sobre lo leído en vivo el 15/09 y la ventana en vivo de hoy; las
  constantes de 38.4/38.5 leídas del código.
- **Inferido:** la cadencia efectiva (dos observaciones); que la
  reconstrucción totalmente fría está cerca del presupuesto; que las
  instancias simultáneas son el único camino plausible a un 429.
- **Desconocido:** retención exacta de logs; tráfico real entre ventanas;
  instancias simultáneas; límite real de la cuenta; tasa del `tmdb-sync`;
  si 926 cabe en 47 s (se mide en 3.c.0).

### 38.10 Conclusión sencilla

- **Qué muestra Producción tras la 3.b:** una sola generación observada,
  correcta de punta a punta (UB en 643 ms, fondo de 16,7 s publicado sin
  errores, HIT después). Tráfico orgánico casi nulo y logs que no duran un
  día: no hay serie.
- **Qué no sabemos:** cuántas veces corre el camino; si una reconstrucción
  totalmente fría (926) cabe en los ~47 s reales; cuántas instancias
  coinciden; el límite real de la cuenta.
- **Siguiente modificación mínima recomendada:** 3.c.0 (medir en el banco,
  sin código) → 3.c.1 pausa compartida ante 429 → 3.c.2 circuito del fondo
  + recuperación por concurrencia. Sin limitador de tasa fija.
- **Condición antes de implementarla:** que 3.c.0 muestre que el Home frío
  total cabe en el presupuesto del fondo en el banco; si no cabe, primero
  eso.
- **¿Esperar más datos o auditar?** Esperar más `vercel logs` no va a dar
  datos (retención + tráfico). **El diseño de 3.c.0 + 3.c.1 + 3.c.2 está
  listo para auditoría de Codex**; la implementación sigue bloqueada por
  3.c.0 y por la autorización del dueño (§19.2 queda sin efecto: no se
  propone tasa declarada en esta etapa).

> **§38 queda corregido por §39** (auditoría de Codex sobre `f7282a8`): el
> presupuesto del fondo, la calibración del banco, la propagación del 429, la
> escritura de la pausa, el estado "pausado", la recuperación multiproceso,
> el rollback y el alcance se reescriben ahí; la medición 3.c.0 está
> ejecutada en §39.2-39.4.

## 39. Etapa 3.c — diseño corregido tras la auditoría sobre `f7282a8` y medición 3.c.0 ejecutada — **3.c.0 aprobada y ejecutada; 3.c.1/3.c.2 NO aprobadas, no implementadas; pendiente de nueva auditoría** (2026-09-16)

> **ANTECEDENTE SUPERADO por §40 y §41.** Lo que sigue conserva cifras que ya
> no son vigentes: "banco calibrado" (es un modelo de sensibilidad ajustado,
> §40.2), `t_inicio_fondo` 0,6-0,7 s (es 0,30-0,37 s, §40.3), "926 en 26 s /
> margen 24 s" (extrapolación no validada, §40.2), y la propuesta de observar
> un frío total real en Producción con autorización (retirada, §40.7). El
> estado vigente de la 3.c es **§41**.

Rama `diseno/etapa3c-proteccion-tmdb`, sobre `f7282a8`. Sin código productivo,
sin merge, push ni deploy. Lo único ejecutado es el banco de medición 3.c.0
(`scripts/banco/etapa3c0-medir.mjs`, más dos capacidades nuevas del doble:
latencia log-normal y marcas por petición), contra dobles locales, sin
credenciales ni servicios de Producción. Marcas: [medido] / [derivado] /
[propuesto] / [desconocido] / **[hipótesis]** para lo simulado.

### 39.1 Diff conceptual respecto de §38 (los ocho puntos de la auditoría)

| # | §38 decía | §39 corrige |
|---|---|---|
| 1 | presupuesto del fondo "50 s desde el inicio de la solicitud → ≈ 47 s útiles" | la señal se crea **cuando el fondo ya empezó** (`AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)` en `iniciar`, `lib/home.ts`), y Vercel mata a `maxDuration` **desde el inicio de la solicitud**: `composición + publicación + cierre ≤ min(50 s, 60 s − t_inicio_fondo)`. Los tres sumandos y `t_inicio_fondo` se miden por separado (39.3); **no se fija 47 s** |
| 2 | doble de TMDB "con latencia realista (p50 ≈ 350 ms)" | calibración obligatoria contra las dos observaciones (250/15,1 s y 342/16,7 s) con latencias por llamada leídas de las líneas de Producción (TMDB 527 y 348 ms; Redis 138 ms; Supabase 604 y 355 ms), corrida de control de ~340 llamadas y criterio explícito de "reproduce razonablemente" (39.2) antes de usar el modelo para 926 |
| 3 | "una lectura de pausa por composición; tras el primer 429 nadie inicia llamadas nuevas" | **no puede cumplirse**: dos niveles — reacción local inmediata (por proceso) y propagación compartida periódica/por lotes — con cota honesta de sobrepaso: `sobrepaso ≤ en_vuelo + admitidas_durante_el_intervalo_de_propagación`, medida en el banco con tres procesos y colas grandes (39.5) |
| 4 | `SET tmdb:pausa … NX` | operación atómica que **conserva el vencimiento máximo** (extiende, nunca acorta), con duraciones y reloj de Redis, tolerante a respuesta perdida, con resultado `escrito` / `ya-mayor` / `indeterminado` (39.6); Lua sólo en diseño, con precondición de Preview |
| 5 | "con pausa, `programarEnFondo` devuelve `false`, sirve UB y libera el turno" | **falso con el contrato actual**: `false` = "no disponible" = `componer()` en línea. Estados explícitos `programado` / `no-disponible` / `pausado` con semántica fijada por caso y criterios RED que prueban que `pausado` nunca cae en `componer()` (39.7) |
| 6 | recuperación "gradual" `4 → 24` por proceso | no es global: con `N` instancias desconocidas la concurrencia total tras la pausa es `N × piso` y sube a `N × 24`; se rediseña con una cota compartida y se agregan los seis escenarios pedidos (39.8) |
| 7 | rollback por "línea con `pausa vigente` sin 429" o "`pausaNoLeida` sostenido" | esas señales no se pueden buscar después: Vercel no conserva los logs. Se separan verificación en vivo, observación histórica (bloqueada por #20) y señales realmente medibles (39.9) |
| 8 | "protección de la cuenta" implícita | la pausa protege **sólo a la app en Vercel**; `tmdb-sync` y los scripts usan el mismo token fuera del mecanismo (39.10) |

### 39.2 Calibración del banco (3.c.0, ejecutada)

**Instrumento** (`scripts/banco/etapa3c0-medir.mjs` + `dobles.mjs`): los
tres dobles en un juego (4801-4803) y **tres** `next start` de la rama
(3001-3003) compartiendo el mismo Redis del banco; el doble de TMDB sortea
la latencia de una log-normal (mediana, p95) y guarda una **marca por
petición** (llegada, fin, familia; en Redis, comando y clave del `/pipeline`
de uno que manda el SDK de Upstash). De las marcas salen cadencia, ráfaga
por segundo móvil y por 100 ms, concurrencia real y fases. Lo que la app
dice (`tmdb N llamadas`) se comprobó igual a lo que el doble recibió en
todos los escenarios (926 = 926, 338 = 338, 259 = 259).

**Targets** [medido en Producción, líneas de §32.1 y §37]: (a) 3.a, en
línea: **250 llamadas / 15.091 ms**, TMDB 527 ms/llamada de promedio, Redis
279 ops / 138 ms de promedio, Supabase 6 / 604 ms; (b) 3.b, en fondo: **342
/ 16.682 ms**, TMDB 348 ms, Supabase 11 / 355 ms; (c) histórico "todo
cacheado" ≈ 2,9 s (CLAUDE.md, antes del payload cacheado). La parcialidad de
Redis se reproduce venciendo un subconjunto de `pv3:<tipo>:<id>` por el
último dígito del id (0-3 → 338 llamadas; 0-2 → 259).

**Tres pasadas, dos falsas y una válida** (MANTENIMIENTO 8.b.2: el
instrumento primero):

| Pasada | Modelo | ~340 llamadas (target 16,7 s) | ~260 (target 15,1 s) | todo cacheado (≈ 2,9 s) | Veredicto |
|---|---|---|---|---|---|
| 1 (`…-pasada1.json`) | mediana = promedio (TMDB 348, Redis 138), p95 2,3× | 833 llamadas (venció **todo** `pv3:`): no comparable | ídem | 9,1 s | **instrumento roto**: el vencimiento no reproducía la parcialidad; además el promedio de la log-normal es 1,137 × mediana |
| 2 (`…-pasada2.json`) | mediana = promedio / 1,137, p95 2,3×, Redis 138 | 338 → **32,5 s** (+95 %) | 259 → **32,1 s** (+113 %) | 9,8 s (+240 %) | **no reproduce**: la cadena secuencial de Redis (65 ops con todo cacheado) domina; el promedio de 138 ms lo infla la fase paralela de `pv3:`, no vale para la cadena |
| Barrido de Redis (`…-calibracion-redis.json`), p95 2,3× | Redis 20 / 40 / 60 / 90 | 21,8 / 22,5 / 27,4 / 30,0 s | 21,9 / 23,6 / 25,2 / 28,3 s | 2,9 / 4,0 / 4,5 / 6,9 s | ni a 20 ms alcanza (+30 %): el segundo parámetro libre es la **cola** de TMDB |
| Sensibilidad de cola (`…-calibracion-p95-1.5.json`) | Redis 40, **p95 1,5×** | 338 → **19,7 s (+18 %)** | 259 → **17,8 s (+18 %)** | **3,7 s (+28 %)** | **reproduce razonablemente**, del lado pesimista |
| 3, matriz (`…-medicion.json`) | **calibrado**: TMDB promedio 348 (mediana 338), Redis 40 (39), Supabase 355, p95 1,5× | 338 → 19,2 s (+15 %) | 259 → 19,3 s (+28 %) | 3,5 s | el modelo usado para todo lo que sigue |

Con el promedio de la 3.a (527 ms) **ningún** modelo reproduce sus 15,1 s
(a Redis 40 y p95 1,5×: 24,7 s, +64 %): se infiere que ese promedio lo
inflaba una cola larga en pocas llamadas, no la mediana [inferido]. El
modelo calibrado es **pesimista en 15-28 %** frente a Producción en los
tamaños observados: lo que cabe en el banco, cabe en Producción con más
margen; lo que no cabe en el banco queda **indeterminado**, no condenado.
Parámetros que siguen sin medir: distribución real de Redis por tipo de
operación y cola real de TMDB [desconocido].

### 39.3 Presupuesto del fondo, por componentes (3.c.0)

Modelo (auditoría): `composición + publicación + cierre ≤ min(50 s, 60 s −
t_inicio_fondo)`. Componentes del **frío total (926) en fondo** con el
modelo calibrado (`…-fases.json`, dos repeticiones) [medido en el doble]:

| Componente | Cómo se mide | Medida | Nota |
|---|---|---|---|
| `t_inicio_fondo` | respuesta del UB al cliente + hasta la primera llamada a TMDB | 0,23-0,30 s + 0,30-0,37 s ≈ **0,6-0,7 s** | en Producción la respuesta del UB fue 0,64 s [medido §37]; la frontera cede con `setImmediate` (§36) |
| composición | primera → última llamada a TMDB (llegada) + latencia de la última | **25,4-25,6 s + 0,35-0,42 s** | 926 llamadas, 1.003 ops de Redis, cadencia 36,6/s |
| publicación | fin de la última llamada → script Lua de publicación respondido | **0,13-0,15 s** | una operación atómica (fresca + UB + generación + DEL turno) |
| cierre | publicación → última operación de Redis | **0 s** | la liberación va dentro del script |
| **total** `[home-fondo]` | línea | **25,9-26,2 s** | |

Presupuesto disponible: `min(50 s, 60 − 0,7 s) = 50 s` (el mínimo lo pone
`PRESUPUESTO_REQUEST_MS`, no `maxDuration`). **Margen con el modelo
calibrado: ≈ 24 s** [derivado]. Con los modelos pesimistas descartados por
la calibración, para acotar el riesgo: p95 2,3× y Redis 121 → 40,1 s en
fondo (margen ≈ 10 s); TMDB 527 ms con p95 2,3× y Redis 121 → **51,3 s,
CANCELADA** (`ULTIMO-BUENO`, `publicacion no`, UB intacto); Redis a 300 ms
con el modelo calibrado → 49,3 s (publicada por 0,7 s); Redis a 300 ms con
p95 2,3× → 54,1 s, cancelada.

**Respuesta a "¿926 llamadas caben realmente?":** **sí con el modelo que
reproduce Producción (26 s de 50), y también con un modelo un 50 % más
lento (40 s); no caben si la latencia por llamada se acerca a los 527 ms
de promedio con cola larga, ni con Redis a 300 ms.** El banco no puede
decir cuál de esas condiciones rige en Producción una madrugada cualquiera:
la cola de TMDB y la distribución de Upstash son [desconocido]. Lo que sí
queda fijado: **cualquier tasa fija por debajo de la cadencia natural de
36/s alarga la composición proporcionalmente** — a 28/s serían ≈ 33 s
[derivado], todavía dentro; a 14/s (la cadencia masiva del diseño §8.4),
≈ 66 s, fuera.

### 39.4 Efecto de 1, 2 y 3 reconstrucciones simultáneas, Redis frío/caliente/lento, `tmdb-sync` simulado

Modelo calibrado, Redis vacío, procesos distintos compartiendo Redis
(`…-medicion.json`) [medido en el doble]:

| Escenario | Por proceso (llamadas / total / cadencia) | Global: cadencia media | ráfaga máx. 1 s | ráfaga máx. 100 ms | concurrencia máx. | Resultado |
|---|---|---|---|---|---|---|
| 1 clave fría, en línea (S1) | 926 / 27,1 s / 34,1/s | 35,5/s | **79** | 24 | 24 | publicada |
| 1 clave fría, en fondo (S3) | 926 / 25,3 s / 36,6/s | 37,4/s | **80** | 24 | 24 | publicada; UB servido en 0,27 s |
| 2 claves (`n,d,m` + `n,d`), 2 procesos (S4) | 818 / 24,2 s / 33,8 · 724 / 24,7 s / 29,3 | **64,4/s** | **156** | 48 | 48 | las dos publicadas |
| 3 claves (+ `d,m`), 3 procesos (S5) | 782 / 23,9 · 657 / 24,3 · 661 / 24,1 s | **89,7/s** | **222** | 72 | 72 | las tres publicadas |
| Redis 30 ms (S6) | 926 / 25,3 s / 36,5 | 37,8/s | 78 | 24 | 24 | publicada |
| Redis 300 ms (S6) | 926 / 49,3 s / 18,8 | 19,9/s | 78 | 24 | 24 | publicada al límite |
| `tmdb-sync` simulado 10/s **[hipótesis]** (S8) | 926 / 26,7 s / 34,6 | 43,7/s (= Home + 10) | 87 | 26 | 30 | publicada; el doble no limita, sólo suma |
| MISS intradía, todo cacheado (S7) | 1 / 3,5 s | — | 1 | 1 | 1 | 64 ops secuenciales de Redis: **el piso del pipeline** |

Lecturas: (1) el doble **no limita**, así que "publicada" con 2-3 claves
sólo dice que el tiempo no crece (cada proceso tiene su semáforo de 24);
lo que crece es la **tasa global**: 64/s con dos y 90/s con tres, con
ráfagas de 156 y 222 en un segundo — **por encima de los ~40-50/s que TMDB
publica** [documentación, no medido] ya con dos reconstrucciones, y una sola
reconstrucción llega a 80 en un segundo (24 en vuelo / 0,3 s). Que
Producción no haya visto un 429 con esas ráfagas (342/342 y 250/250 ok)
dice que el límite efectivo de TMDB no se aplica como un tope por segundo
estricto, o es mayor: **[desconocido]**. (2) La concurrencia total es `24 ×
procesos` sin ninguna cota compartida: 72 con tres. (3) El pipeline tiene
un piso de ~3,5 s (calibrado) a ~9,8 s (Redis 121) que es **secuencial**
(64-65 idas y vueltas a Redis una detrás de otra): ningún limitador de TMDB
lo toca; sí lo toca la latencia de Upstash. (4) El `tmdb-sync` sólo suma su
tasa; con 10/s hipotéticos una reconstrucción sola ya promedia 44/s.

### 39.5 Propagación del 429 en dos niveles (diseño, no implementado)

**Nivel 1 — reacción local inmediata, por proceso.** El primer 429 que ve un
proceso (clase `http429`, `lib/tmdb-error.ts`) fija en memoria
`pausaLocalHasta = ahora + retryAfter` (o el backoff acotado si no hay
cabecera). A partir de ese instante, en **ese proceso**: (a) las llamadas que
esperan el semáforo `MAX_EN_VUELO` **no se inician** — salen con `AbortError`
de clase `pausa`, contadas como `canceladas.enCola` (contador que ya existe);
(b) las llamadas en vuelo terminan solas (no se abortan: ya cuentan para
TMDB). La composición afectada queda cancelada/degradada como hoy ante una
caída: **no se publica**, UB intacto. Cota local: `sobrepaso_proceso ≤
enVuelo ≤ 24` [derivado del semáforo]. Sin Redis en este nivel.

**Nivel 2 — propagación entre instancias.** El mismo primer 429 escribe la
pausa compartida (39.6). Los demás procesos **no** leen Redis por llamada:
leen la pausa (a) al empezar una composición/consulta, y (b) **por lote**:
cada `K` permisos del semáforo concedidos, o cada `Δt` ms, lo que ocurra
antes, releen `tmdb:pausa` (una operación `GET`, ~138 ms en Producción
[medido]). Con `K` y `Δt` [propuesto: `K = 24`, `Δt = 1.000 ms`; se fijan en
el banco]. Cota honesta:

```
sobrepaso_global ≤ Σ_procesos ( enVuelo_p + admitidas_p(Δt_propagación) )
Δt_propagación = escritura de la pausa + Δt (o K permisos) + lectura
```

Con `N = 3`, `enVuelo = 24`, cadencia por proceso ≈ 20/s [medido en 39.4] y
`Δt = 1 s`: `sobrepaso ≤ 3 × (24 + ~20 + 138 ms × 20/s ≈ 3) ≈ 141` llamadas
[derivado]; **no es cero y no se promete cero**. El banco lo mide con tres
procesos, colas grandes (tres Homes fríos a la vez) y un 429 total inyectado
en el doble: `llamadas recibidas por el doble después del primer 429`, por
proceso y global, contra la cota.

Con Redis lento (> `Δt`): la propagación se degrada a la reacción local de
cada proceso (cada uno se pausa cuando ve **su** primer 429); con Redis
caído: ídem, contado (`pausaNoLeida`). No se introduce cadencia local.

### 39.6 Escritura segura de la pausa (diseño, no implementado)

Requisitos: conservar el **vencimiento máximo**; sin relojes locales entre
instancias; tolerar respuesta perdida y reintento; resultado en tres
valores. Diseño:

- La clave `tmdb:pausa` guarda **sólo un marcador** (`"1"`) y lleva su
  vencimiento en el **TTL de Redis**: la duración viaja como `PX <ms>`, y "qué
  hora es" lo decide Redis. Ninguna instancia compara instantes propios con
  ajenos.
- Operación atómica `PAUSAR(ms)` en Lua (única forma de leer el TTL y
  escribir sin carrera):

  ```lua
  local restante = redis.call('PTTL', KEYS[1])   -- -2 sin clave, -1 sin TTL
  if restante >= tonumber(ARGV[1]) then return {'ya-mayor', restante} end
  redis.call('SET', KEYS[1], '1', 'PX', ARGV[1])
  return {'escrito', tonumber(ARGV[1])}
  ```

  Extiende (1 → 8) y nunca acorta (8 → 1 devuelve `ya-mayor`, 8.000). Dos
  escritores concurrentes: el script es atómico; el resultado final es el
  máximo de ambos. Idempotente ante reintento: repetir `PAUSAR(8000)` con 7.900
  restantes devuelve `ya-mayor`, no alarga.
- Respuesta perdida (el SDK de Upstash reintenta; el doble del banco ya
  simula `perderRespuesta`): el reintento es seguro por idempotencia; si la
  segunda también se pierde, el llamador informa **`indeterminado`** y actúa
  como si la pausa estuviera escrita (nivel 1 ya rige localmente).
- Lectura: `PTTL tmdb:pausa` → `> 0` pausa vigente por esos ms; `-2` sin
  pausa; error/timeout → `indeterminado` (`pausaNoLeida`), comportamiento
  actual.
- **Precondición de Preview antes de implementar:** el mismo gate que el
  `EVAL` del turno (Etapa 2): probar `PAUSAR` contra un Preview aislado con
  Upstash real —`EVAL` + `PTTL` + `SET PX`— y comprobar que el SDK devuelve
  la tupla, no `null`. Hasta entonces, Lua sólo en diseño.
- Pruebas (puras, `lib/tmdb-pausa.test.ts`, contra el doble de Redis del
  banco): 1 → 8 extiende; 8 → 1 devuelve `ya-mayor` con el restante; 50
  llamadas concurrentes con duraciones distintas terminan con el máximo;
  respuesta perdida en la primera y reintento → una sola pausa, sin alargar;
  `PTTL` tras vencer → `-2`.

### 39.7 Estado "pausado" del Home (diseño, no implementado)

Contrato actual [medido en código]: `programarEnFondo(iniciar) → boolean`, y
en `servirConTurno` `false` ⇒ `componer()` en línea. Nuevo contrato:

```ts
type ResultadoFondo = "programado" | "no-disponible" | "pausado";
```

y la comprobación de pausa **antes de adquirir el turno** (una lectura, en
`servirConTurno`, inyectada como `deps.pausaVigente(): Promise<boolean |
"indeterminado">`), con semántica fijada:

| Caso | Turno | Respuesta | Composición | Publicación | Métrica |
|---|---|---|---|---|---|
| sin pausa, fondo `programado` | adquirido | UB (`ultimo-bueno-fondo`) | en fondo | si sana | como hoy |
| sin pausa, `no-disponible` | adquirido | resultado de `componer()` en línea | en línea | si sana | como hoy |
| **pausado, con UB** | **no se adquiere** (o se libera en el acto si ya se tenía) | UB, `origen ultimo-bueno-pausa` | **ninguna** | ninguna | `pausa vigente` |
| **pausado, sin UB** | no se adquiere | `503` + `Retry-After: <PTTL/1000>` con cuerpo `{ motivo: "pausa" }` (vacío marcado, como el cancelado de hoy) | ninguna | ninguna | `pausa vigente`, `cache VACIO` |
| pausa **indeterminada** (Redis) | como sin pausa | como sin pausa | como sin pausa | como sin pausa | `pausaNoLeida` |

Criterios RED (contra `37d4707`, con un doble de `pausaVigente` que devuelve
`true`): (1) "pausado con UB: `componer` se llama 0 veces, el turno no queda
adquirido, la respuesta es el UB"; (2) "pausado sin UB: `componer` 0 veces,
`503` con `Retry-After`, nada publicado (sha1 de fresca y UB iguales)"; (3)
"`programarEnFondo` devuelve `"pausado"` ⇒ `componer` 0 veces" (hoy `false`
⇒ 1 vez: el RED falla justo ahí); (4) "indeterminado ⇒ exactamente el
comportamiento de hoy y `pausaNoLeida = 1`"; (5) cableado: el `switch` sobre
`ResultadoFondo` es exhaustivo (`never` en `default`), así que un estado
nuevo sin caso no compila.

### 39.8 Recuperación multiproceso acotada (diseño, no implementado)

Lo que §38 llamaba "gradual" (`4 → 8 → 16 → 24` por proceso) da `N × 4 → N ×
24` con `N` desconocido: con tres instancias, 12 → 72 concurrentes, **más**
que antes de la pausa. Rediseño:

- **Cota compartida de concurrencia post-pausa** [propuesto]: al vencer la
  pausa, la clave `tmdb:recuperacion` (Lua atómico, `PX` = ventana de
  recuperación [propuesto: 10 s]) reparte **permisos totales** `P(t)` que
  crecen con el tiempo desde el vencimiento (`P(t) = min(24 × N_max,
  P0 × 2^(t/1 s))` con `P0` y `N_max` [propuesto: 8 y 3]); cada proceso pide
  permisos de a lotes (`INCRBY` acotado por Lua) y los devuelve al terminar.
  Sin Redis: cada proceso arranca en `piso = 4` y crece a 24 — la
  degradación es la misma que hoy, contada.
- **Sin estampida al vencer**: los procesos releen la pausa con `Δt` [39.5]
  y un jitter [propuesto: 0-500 ms]; el primero que ve `-2` arranca la
  recuperación; los demás entran con los permisos que queden.
- **Nuevo 429 durante la recuperación**: `PAUSAR` de nuevo (extiende: 39.6),
  `P(t)` vuelve a `P0`.
- **Ningún fondo duplicado por clave**: no cambia — lo garantiza el turno
  (SET NX + fencing por generación), que la pausa no toca.
- **Sin inanición permanente**: la ventana de recuperación vence sola
  (`PX`); pasado ese tiempo sin 429, el techo vuelve a `24 × N` (= hoy).

Escenarios del banco (3.c.2, cuando se apruebe): tres procesos retomando a
la vez tras una pausa de 2 s → concurrencia global máxima observada en el
doble ≤ `P(t)` en cada segundo; ausencia de estampida (ráfaga en el primer
100 ms tras el vencimiento ≤ `P0`); nuevo 429 a los 500 ms de la
recuperación → pausa extendida y `P(t)` reiniciado, sin ráfaga; extensión
inmediata (`Retry-After: 8` tras una pausa de 1 s → `PTTL ≥ 7.900`); tres
claves distintas en tres procesos → una `[home-fondo]` por clave;
inanición: ninguna composición espera más que la ventana.

### 39.9 Observabilidad y rollback — lo que de verdad se puede medir

| Nivel | Qué | Cómo | Estado |
|---|---|---|---|
| **Verificación en vivo durante el deployment** | health, Home, búsqueda, ficha; `[home]` con `pausa no` en la ventana; un Preview aislado con el doble de TMDB **no es posible** (Producción usa TMDB real), así que el 429 sólo se prueba en el banco | `vercel logs --follow` (tope 5 min por consulta [medido]) durante y justo después del deploy | **posible** |
| **Observación histórica** | frecuencia de pausas, `pausaNoLeida` sostenido, pausas sin 429 | requiere un canal persistente (contadores en Redis con TTL largo o un sink externo): **#20, Etapa 5** | **bloqueada** |
| **Señales realmente medibles hoy** | (a) contadores acumulados en Redis: `tmdb:cont:pausas`, `tmdb:cont:429`, `tmdb:cont:pausaNoLeida` (INCR, TTL 7 d; una operación por evento, no por llamada) leídos por `/api/health`; (b) la línea `[home]`/`[home-fondo]` leída en vivo | `/api/health` ya existe; agregar los tres contadores es parte de 3.c.1 | **propuesta** (vale como rollback si se implementa con 3.c.1) |

**Condición de rollback, reescrita:** sobre las señales medibles: (i)
`/api/health` muestra `pausas > 0` con `429 = 0` (pausa sin causa); (ii)
`pausaNoLeida` creciendo con Redis sano en `/api/health`; (iii) `503`
interactivos con `429 = 0`; (iv) en la verificación en vivo, cualquier
`[home]` con `pausa vigente` sin un `[tmdb] descarte http429` previo.
Acción: `TMDB_PAUSA_429=0` (+ `TMDB_CIRCUITO=0`) y redeploy, **con
autorización del dueño**. Lo que no se promete: detección sostenida de nada
que no esté en (a).

### 39.10 Alcance

La pausa, el circuito y la recuperación protegen **únicamente a la
aplicación en Vercel**. `tmdb-sync` (Edge Function de Supabase) y los
scripts manuales usan el mismo token **fuera** del mecanismo: el límite
total de la cuenta **no** queda protegido. Que compartan token es
[desconocido] (se asume). Incorporarlos exigiría que leyeran `tmdb:pausa` en
Upstash, fuera del alcance de la 3.c.

### 39.11 Cifras: medidas, derivadas, propuestas, desconocidas

| Cifra | Valor | Marca |
|---|---|---|
| Llamadas de un Home frío total (`n,d,m`) | 926 | medido en el doble (y en las tres pasadas) |
| Llamadas de las dos observaciones de Producción | 250 y 342 | medido (Producción) |
| TMDB ms/llamada (promedio) en Producción | 527 (3.a), 348 (3.b) | medido |
| Redis ms/op (promedio) en Producción | 138 | medido; **no vale para la cadena secuencial** (calibración) |
| Redis efectivo para la cadena secuencial | ≈ 40 ms | **derivado por calibración** (reproduce 3,5-3,7 s vs 2,9 s histórico) |
| Cola de TMDB (p95/mediana) | 1,5× | **propuesto por calibración**; real [desconocido] |
| Cadencia de un Home frío total, calibrado | 34-37/s | medido en el doble |
| Duración del frío total en fondo, calibrado | 25,9-26,2 s | medido en el doble |
| Idem, modelos pesimistas | 40,1 s / 51,3 s (cancelada) | medido en el doble; qué modelo rige en Producción [desconocido] |
| `t_inicio_fondo` | 0,6-0,7 s | medido en el doble; 0,64 s de respuesta del UB en Producción |
| Publicación / cierre | 0,13-0,15 s / 0 | medido en el doble |
| Presupuesto del fondo | `min(50, 60 − t_inicio) = 50 s` | derivado del código |
| Margen del frío total | ≈ 24 s (calibrado); ≈ 10 s (pesimista); < 0 (527 ms + cola larga) | derivado |
| Ráfaga máxima de un proceso | 79-80 llamadas en 1 s; 24 en 100 ms | medido en el doble |
| Tasa global con 2 / 3 reconstrucciones | 64 / 90 por s de promedio; 156 / 222 en un segundo | medido en el doble |
| Concurrencia total | 24 × procesos (48, 72) | medido en el doble; `N` en Producción [desconocido] |
| Límite real de TMDB | "~40-50/s" | documentación; nunca medido; ningún 429 visto en Producción |
| Tasa del `tmdb-sync` | 10/s | **hipótesis** |
| Piso secuencial del pipeline (todo cacheado) | 3,5 s (calibrado); 2,9 s (histórico) | medido en el doble / medido histórico |
| `K`, `Δt`, `P0`, `N_max`, backoff sin `Retry-After` | 24, 1.000 ms, 8, 3, 1→8 s | propuesto (39.5, 39.8) |
| Sobrepaso tras un 429 con 3 procesos | ≤ 3 × (24 + ~35 + ~1) ≈ 180 llamadas con la cadencia calibrada | derivado; se mide cuando exista la pausa |

### 39.12 Recomendación revisada para 3.c.1 / 3.c.2

1. **La condición bloqueante de §5.5 no se puede dar por cumplida ni por
   incumplida con el banco solo.** Con el modelo que reproduce Producción,
   926 caben con 24 s de margen; con una cola larga o Redis lento, no. Lo
   que hace falta antes de cualquier limitador es **una observación real
   de un frío total en Producción**: la primera solicitud de una
   combinación tras > 8 h sin `pv3:` y > 30 h sin pools (Redis vacío de
   esa combinación), leída en vivo (`vercel logs --follow`) — una sola
   solicitud, sin vaciar nada, con autorización del dueño. Hasta entonces,
   la 3.c **no introduce ninguna tasa fija**.
2. **3.c.1 (pausa compartida ante 429) sigue siendo la primera protección
   recomendada**, con el diseño corregido de 39.5-39.7: es la única que no
   cambia nada con TMDB sano y por lo tanto no puede empeorar el margen
   anterior. Su valor no es teórico: una sola reconstrucción ya emite
   ráfagas de 80/s y dos simultáneas promedian 64/s, por encima del límite
   publicado; si TMDB empieza a responder 429, hoy cada 429 es un descarte
   sin memoria y sin propagación. **No aprobada todavía**: exige la
   precondición de Preview de 39.6 (Lua `PAUSAR`) y los estados de 39.7.
3. **3.c.2 (circuito + recuperación) sólo con la cota compartida de 39.8.**
   Sin ella, "gradual" era falso. Y la parte de "recuperación por
   concurrencia" tiene una razón medida: la concurrencia total sin cota es
   `24 × N`, con ráfagas de 222/s a `N = 3`.
4. **Un techo de tasa (§8), si alguna vez se propone, tiene que ser ≥ la
   cadencia natural (≈ 36/s) para no alargar el frío**, y acotar
   **ráfagas** (24 por 100 ms por proceso), no promedios: el promedio ya es
   bajo; el riesgo son los picos de la fase `providersOf`. Eso invalida
   las dos cadencias de 14/s de §8.4 como diseño de la 3.c'': quedan
   fuera hasta tener el límite real de TMDB medido (un 429 real con su
   `Retry-After`, que hoy no existe).
5. **Fuera de la 3.c, un hallazgo del banco que vale por sí mismo:** el
   piso secuencial del pipeline (64 idas y vueltas a Redis, 3,5-9,8 s
   según latencia) es lo que hace que un MISS intradía con todo cacheado
   cueste segundos; no es de esta etapa (no toca la protección de TMDB) y
   se anota para el #19/#20 como candidato a medición propia.

### 39.13 Estado

3.c.0 ejecutada y publicada (`docs/medidas/2026-09-16-etapa3c0-medicion.json`).
3.c.1 y 3.c.2: **diseño corregido, NO aprobadas, NO implementadas.** Sin
código productivo; los cambios de esta tanda son documentación, el script
del banco y el doble. Rama pendiente de nueva auditoría de Codex; sin merge,
push ni deploy.

> **§39 queda corregido por §40** (auditoría de Codex sobre `1ad1025`, siete
> puntos): `PAUSAR` con identidad por evento (RED→GREEN), 3.c.0 reclasificada
> como sensibilidad ajustada (con semillas y repeticiones), `t_inicio_fondo`
> 0,30-0,37 s, criterio antes/después con umbrales previos, carrera cerrada
> en el script de adquisición, observabilidad por evento y retiro del
> "frío total provocado".

## 40. Etapa 3.c — auditoría y corrección de §39 sobre `1ad1025` — **3.c.1 y 3.c.2 NO aprobadas; sin código productivo; pendiente de nueva auditoría** (2026-09-16)

> **ANTECEDENTE SUPERADO por §41** en: §40.4/§40.5 (contrato con sobrepaso
> explícito; se elimina `K`), §40.1 (marcador 60 s → 120 s + marca de agua
> por proceso), §40.6 (Lua completo y `/api/health` sólo agregados). Lo no
> corregido por §41 sigue vigente. El estado vigente de la 3.c es **§41**.

Rama `diseno/etapa3c-proteccion-tmdb`, sobre `1ad1025`. Cambios: documentación,
un test de diseño (`lib/tmdb-pausa-diseno.test.ts`, sobre un modelo de Redis,
no sobre código productivo), y dos herramientas del banco (semilla
determinista en el doble; modo `repeticiones`). Sin merge, push, deploy,
Producción, variables ni cachés. Marcas: [medido en Producción] / [reproducido
por el banco] / [parámetro ajustado] / [sensibilidad] / [extrapolación no
validada] / [propuesto] / [desconocido].

### 40.1 Punto 1 — `PAUSAR` no era idempotente: RED → GREEN

**RED (exacto, ejecutado y visto fallar):** sobre un modelo de Redis con reloj
virtual, la versión de §39.6 ejecuta `PAUSAR(8000)`, el cliente pierde la
respuesta, reintenta 100 ms después: `PTTL = 7900 < 8000` ⇒ vuelve a escribir
8000. Aserción "el PTTL sigue en 7900" → `AssertionError: extendió: PTTL=8000
resultado=escrito`. Queda como **control** en el archivo (la versión ingenua
tiene que seguir fallando ahí, MANTENIMIENTO 8.b).

**Rediseño: identidad estable por evento.** Cada 429 genera **un** id de
evento `<uuid del proceso>:<contador>` (identidad, no instante: ninguna
instancia compara relojes) que viaja igual en todos los reintentos. El script
escribe, en la **misma operación atómica**, un marcador por evento y la pausa:

```lua
-- KEYS[1] = tmdb:pausa   KEYS[2] = tmdb:pausa:ev:<id>   ARGV[1] = id   ARGV[2] = ms
if redis.call('EXISTS', KEYS[2]) == 1 then return {'ya-aplicada', redis.call('PTTL', KEYS[1])} end
redis.call('SET', KEYS[2], '1', 'PX', math.max(tonumber(ARGV[2]), 60000))
local restante = redis.call('PTTL', KEYS[1])
if restante >= tonumber(ARGV[2]) then return {'ya-mayor', restante} end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return {'escrito', tonumber(ARGV[2])}
```

Vencimiento estable: la pausa lleva su vencimiento en el **TTL de Redis**
(`PX`), y un evento sólo puede escribirla **una vez** (marcador con TTL ≥ 60 s,
que cubre cualquier ventana de reintento del SDK). Lo que sí extiende es un
evento **nuevo** (otro 429, en la misma u otra instancia) cuyo `Retry-After`
termina más tarde: es la semántica de `Retry-After` ("desde este 429"), no
una extensión espuria. Cota: `fin de la pausa = max sobre los 429 reales de
(instante del 429 + Retry-After)`; los reintentos aportan **0**.

**GREEN (15/15, `lib/tmdb-pausa-diseno.test.ts`):** la secuencia del RED →
`ya-aplicada`, PTTL 7900; reintentos múltiples (tres respuestas perdidas y
una vista) → una escritura, PTTL `8000 − 450`; el reintento de un evento
viejo no pisa a un evento nuevo de otra instancia; 1 → 8 extiende; 8 → 1
`ya-mayor` con el restante y su reintento `ya-aplicada`; 50 eventos
concurrentes en tres órdenes pseudoaleatorios deterministas → máximo;
expiración (`PTTL = -2`, evento nuevo escribe de cero); reintento tardío
después de vencida la pausa → `ya-aplicada`, **no la reabre**; lectura por
`PTTL`. Lo que el modelo NO prueba: el SDK de Upstash devolviendo la tupla
del `EVAL` (precondición de Preview, como el turno de la Etapa 2) y el
`EXISTS`/`PTTL` reales — se prueban contra el doble de Redis del banco
cuando exista `lib/tmdb-pausa.ts`.

### 40.2 Punto 2 — 3.c.0 reclasificada: sensibilidad ajustada, no calibración predictiva

Lo que §39.2 llamó "calibrado" es un **modelo de sensibilidad ajustado con
las mismas dos muestras** que después "reproduce": no predice Producción.
El vencimiento por último dígito de `pv3:` iguala el **total** de llamadas
(338 ≈ 342, 259 ≈ 250) pero no demuestra que reproduzca **qué** claves
faltaban ni su **dependencia temporal** (en Producción las 242 ausentes de
la 3.a eran las que vencieron juntas por TTL; acá son un tercio uniforme de
cada riel). Y el doble sorteaba con `Math.random` sin semilla: dos corridas
no eran comparables. Corrección: semilla determinista por doble
(`mulberry32`, `semilla` en `/__banco/config`; la secuencia de sorteos es
fija, el orden de llegada sigue siendo del sistema) y tres repeticiones
por escenario (`…-repeticiones.json`).

**Resultados con semillas 11 / 22 / 33** (modelo `prod-3b`, Redis 40, p95 1,5×) — mediana [rango]:

| Escenario | llamadas | total, mediana [rango] | cadencia | ráfaga máx. 1 s | `t_inicio` | composición | publicación |
|---|---|---|---|---|---|---|---|
| S1 frío total, en línea | 926 (×3) | **27,3 s** [26,8-27,5] | 33,9/s [33,6-34,5] | 76 [74-79] | 0,45 s [0,40-1,76] | 26,4 s [25,8-26,7] | 0,12 s [0,11-0,20] |
| S3 frío total, en fondo | 926 (×3) | **27,7 s** [27,0-28,5] | 33,4/s [32,5-34,3] | 80 [76-82] | **0,36 s [0,32-0,38]** | 27,0 s [26,3-27,8] | 0,14 s [0,11-0,16] |
| CAL-342 (target 16,7 s) | 338 (×3) | **19,5 s** [19,3-19,7] (+17 %) | 17,4/s | 59 | 0,39 s | 18,6 s | 0,15 s |
| CAL-250 (target 15,1 s) | 259 (×3) | **19,0 s** [18,9-19,8] (+26 %) | 13,7/s | 45 | 0,34 s | 18,1 s | 0,13 s |
| S7 MISS intradía (todo cacheado) | 1 (×3) | **4,1 s** [3,9-4,2] | — | 1 | 0,36 s | 0 | (n/a: con una sola llamada la "publicación" medida abarca la cadena secuencial entera, 3,5 s) |
| S5 tres claves, tres procesos | 742/731/711 · 734/670/729 · 753/664/707 | A **25,1 s** [24,2-26,0] · B 25,2 [25,2-25,4] · C 24,5 [24,4-24,5]; ninguna cancelada | global **87/s** [86-88] | **230** [218-241]; 100 ms: 64-72; concurrencia 72 | | | |

La dispersión entre semillas es ≤ 3 % en los totales (el 1,76 s de
`t_inicio` en una semilla de S1 es el primer pedido tras reiniciar el
proceso, no la cesión). Las cifras de §39.2-39.4 (una sola corrida) caen
dentro de estos rangos.

**Clasificación honesta de cada cifra de 3.c.0:**

| Categoría | Qué entra |
|---|---|
| **Medido en Producción** | 250 llamadas / 15,1 s (en línea, 3.a); 342 / 16,7 s (fondo, 3.b); promedios por llamada de esas dos líneas (TMDB 527 y 348 ms; Redis 138 ms; Supabase 604 y 355 ms); respuesta del UB 0,64 s; 0 × 429 |
| **Reproducido por el banco** | que el mismo pipeline, con los mismos totales de llamadas, tarda **+15-28 %** respecto de las dos observaciones bajo el modelo ajustado; 926 llamadas con Redis vacío; la ráfaga de un proceso (≤ 24 en 100 ms, ~80 en 1 s); la concurrencia `24 × procesos`; el piso secuencial de ~64 operaciones de Redis |
| **Parámetro ajustado** (con esas mismas muestras) | Redis efectivo 40 ms; cola de TMDB p95 = 1,5 × mediana; mediana de TMDB = promedio / 1,031 |
| **Sensibilidad** | duración del frío total según Redis (30 / 40 / 121 / 300 ms) y según cola (1,5× / 2,3×): 25-54 s; con 527 ms de promedio: 37-52 s |
| **Extrapolación no validada** | **que 926 llamadas tarden ~26 s en Producción**; el margen de ~24 s; que dos reconstrucciones simultáneas promedien 64/s en Producción; el `tmdb-sync` a 10/s. **Se retira la frase "lo que cabe en el banco, cabe en Producción".** |

Lo que el banco sí permite afirmar sin extrapolar: **una tasa fija menor que
la cadencia natural alarga la reconstrucción en proporción** (a 14/s, ≥ 66 s
para 926: fuera del presupuesto en cualquier modelo), y **la ráfaga de un
solo proceso ya supera los 40-50/s publicados** (80 en un segundo), con
Producción mostrando 0 × 429 a esa ráfaga.

### 40.3 Punto 3 — `t_inicio_fondo` corregido

`hastaPrimeraLlamadaMs = primeraMarca − t0` se mide desde el **envío de la
solicitud** al cliente, así que ya contiene la respuesta del UB y la cesión:
§39.3 lo sumaba dos veces. Con la evidencia (`…-fases.json`: 365 y 297 ms;
matriz: 354 ms; repeticiones: 0,32-0,38 s en fondo): **`t_inicio_fondo ≈ 0,30-0,37 s`**
[reproducido por el banco]; en Producción, la respuesta del UB fue 0,64 s y
la primera llamada del fondo no se mide (no hay marca) [medido parcial].

| Componente | Medida (banco, frío total en fondo) | Categoría |
|---|---|---|
| `t_inicio_fondo` (solicitud → primera llamada a TMDB del fondo) | **0,30-0,37 s** | reproducido |
| composición (primera → última llamada, + latencia de la última) | 25,4-25,6 s + 0,35-0,42 s | extrapolación no validada en Producción |
| publicación (fin de la última llamada → script Lua respondido) | 0,13-0,15 s | reproducido (una operación) |
| cierre | 0 | reproducido (el `DEL` va dentro del script) |
| total `[home-fondo]` | 25,9-26,2 s | extrapolación no validada |

Presupuesto: `min(50 s, 60 s − 0,37 s) = 50 s`: **el mínimo sigue siendo el
interno** (`PRESUPUESTO_REQUEST_MS`), con 9,6 s de holgura respecto de
`maxDuration`. El margen de "≈ 24 s" pasa a la categoría de extrapolación.

### 40.4 Punto 4 — 3.c.1 SÍ cambia cosas con TMDB sano: criterio antes/después, umbrales fijados ANTES de medir

La relectura compartida cada `K` permisos o `Δt` agrega operaciones de Redis
y, si estuviera en el camino crítico, latencia. **Decisión de diseño que
sale de este punto:** la relectura es **asíncrona y no bloqueante** — el
semáforo no espera el `PTTL`; el resultado, cuando llega, fija la bandera
local. Con Redis lento o caído, la relectura tarda o falla **sin frenar la
composición**; a lo sumo la propagación se degrada al nivel local (39.5).
La única lectura bloqueante es la que va **dentro del script de
adquisición del turno** (40.5), que ya existe hoy como operación.

Criterio obligatorio (banco §14, dos instancias de dobles, semillas fijas,
tres repeticiones por celda), **con TMDB sano** y 3.c.1 encendida vs
`37d4707`, umbrales definidos ahora:

| Medida | Umbral de regresión (falla si se supera) | Por qué ese número |
|---|---|---|
| JSON completo del Home (comparador §14, 16 combinaciones, frío/caliente, individual/concurrente) | **0 diferencias** | restricción del dueño (§1) |
| llamadas a TMDB por composición | **0 de diferencia** (926 = 926; 338 = 338; MISS intradía 1 = 1) | la pausa no toca qué se pide |
| operaciones de Redis adicionales por composición | **≤ ⌈llamadas / K⌉ + 2** (K = 24: 926 → ≤ 41; 338 → ≤ 17; MISS intradía → ≤ 3) — y en Redis caído, **≤ 1** intento fallido (después no se reintenta en esa composición) | una relectura por lote más la de adquisición y la de cierre |
| duración de la composición (mediana de 3 semillas) | **≤ +5 %**, y ninguna repetición **> +10 %** | ruido medido entre semillas (40.2) < 5 %; la relectura no bloquea |
| publicación | **≤ +1 operación** de Redis (≤ +200 ms con Redis a 138 ms) | el script de publicación no cambia |
| 1, 2 y 3 reconstrucciones simultáneas (3 procesos) | los mismos umbrales por proceso; tasa global **igual ± 5 %** | la pausa no actúa sin 429 |
| Redis normal (40 ms) / lento (300 ms) / caído | los mismos umbrales de duración en los tres; en caído, `pausaNoLeida = 1` por composición y **0 s** de espera añadida | la relectura no bloquea |
| respuesta del UB con fondo (`respuestaMs`) | **≤ +50 ms** | la adquisición del turno ya era una operación |

Si cualquier celda supera su umbral, 3.c.1 **no se aprueba** aunque el
resto pase; el umbral no se mueve después de ver el número.

### 40.5 Punto 5 — la carrera "leer pausa → componer", cerrada por construcción

Tres ventanas y qué las cierra:

| Ventana | Cierre | Turno |
|---|---|---|
| **Antes del turno** (la pausa aparece después de una lectura previa y antes de adquirir) | la comprobación va **dentro del script Lua de adquisición** (`PTTL tmdb:pausa > 0 ⇒ return 'pausado'` antes del `SET NX`): no existe instante entre "leer" y "adquirir" | **no se adquiere** |
| **Tras adquirir** (la pausa aparece después del script, antes de la primera llamada) | equivale a "durante la cola": la bandera local del nivel 1 y la relectura por lote la ven; la primera relectura ocurre en el **primer lote** de permisos (antes de la llamada 1 si `K` se cuenta desde 0) | se libera en el acto (`liberar` en el `finally` que ya existe) |
| **Durante la cola / composición** | nivel 1 (429 propio) o nivel 2 (relectura): las llamadas en cola no se inician (`AbortError`, clase `pausa`), las en vuelo terminan; la composición queda **cancelada, no publicada** (`cachedIf` ya no publica lo cancelado); UB intacto | se libera en el acto |

Semántica fijada (sustituye a §39.7): `programarEnFondo` → `"programado" |
"no-disponible" | "pausado"`; pero la decisión primaria **no la toma el
programador**: la toma el script de adquisición. Cuadro:

| Adquisición dice | UB | Respuesta | Composición | Publicación |
|---|---|---|---|---|
| `adquirido` + fondo programado | sí | UB (`ultimo-bueno-fondo`) | fondo | si sana |
| `adquirido` + fondo no disponible | — | `componer()` en línea (hoy) | línea | si sana |
| **`pausado`** | sí | UB, `origen ultimo-bueno-pausa` | **ninguna** | ninguna |
| **`pausado`** | no | **`503` + `Retry-After: ⌈PTTL/1000⌉`**, cuerpo `{ motivo: "pausa" }`, `cache VACIO` | ninguna | ninguna |
| `indeterminado` (Redis) | — | como hoy (sin Redis: composición sin turno, no publicada) | línea | no (ya es así sin Redis) |

**RED para la implementación** (en `home-servir.test.ts`/`home-fondo.test.ts`
con dobles inyectados; hoy fallan por construcción porque el contrato es
booleano): (1) adquisición `pausado` con UB ⇒ `componer` 0, `programar` 0,
turno nunca adquirido, respuesta UB; (2) `pausado` sin UB ⇒ `componer` 0,
`503` con `Retry-After`, sha1 de fresca y UB iguales; (3) pausa que aparece
en la cola ⇒ `AbortError` clase `pausa`, `publicacion no`, `liberar` llamado
exactamente una vez, ≤ `enVuelo` llamadas iniciadas después de la pausa;
(4) `indeterminado` ⇒ igual a `37d4707` y `pausaNoLeida = 1`; (5) el
`switch` sobre el resultado del programador es exhaustivo (`never`); (6)
**`pausado` nunca llega a `componer()` ni a `iniciar()`**: el test cuenta
ambas con un espía en las tres ventanas. El **modelo** de estas seis
propiedades está en `lib/tmdb-pausa-diseno.test.ts` (cuatro tests + control
del contrato booleano), explícitamente como modelo.

### 40.6 Punto 6 — observabilidad correlacionada por evento, y atómica

Contadores acumulados (`pausas`, `429`, `pausaNoLeida`) no atribuyen
causas: tras el primer 429 no distinguen una pausa espuria posterior.
Rediseño:

- **Registro por evento, en el mismo script** que crea/extiende la pausa
  (atomicidad entre "registrar el 429" y "pausar"): `PAUSAR` hace además
  `LPUSH tmdb:eventos <json>` + `LTRIM tmdb:eventos 0 199` + `EXPIRE
  tmdb:eventos 604800`. El evento: `{ id, tRedis (TIME dentro del script),
  ruta, retryAfterMs, resultado: escrito|ya-mayor|ya-aplicada, ptllTras }`.
  `TIME` en Lua es sólo para **sellar** el evento con el reloj de Redis (no
  se compara con ningún reloj local).
- **Deltas por intervalo:** cubos por minuto `tmdb:min:<yyyymmddhhmm>` (hash
  con `429`, `pausas`, `pausaNoLeida`, `pausadosUB`, `pausados503`; `EXPIRE`
  24 h). `/api/health` devuelve los últimos 20 eventos y los últimos 60 cubos:
  una pausa **espuria** es un cubo o intervalo con `pausas > 0` y `429 = 0`,
  o un evento `pausa` sin id de 429 — imposible por construcción, así que su
  aparición delata un bug.
- **Lo que es efímero y se declara así:** las líneas `[home]`/`[home-fondo]`
  con `pausa vigente` sólo valen leídas **en vivo**; no son observación
  histórica. La histórica sale de `tmdb:eventos` y los cubos, que viven en
  Redis 7 días / 24 h, hasta que exista #20.
- Rollback (sustituye a §39.9): (i) `/api/health` con `pausas > 0` y `429 =
  0` en el mismo minuto; (ii) `pausaNoLeida` creciendo con `/api/health`
  reportando Redis OK; (iii) `pausados503 > 0` con `429 = 0`; (iv) cualquier
  celda de 40.4 fuera de umbral en el banco antes del deploy. Acción:
  `TMDB_PAUSA_429=0` + redeploy, con autorización.

### 40.7 Punto 7 — retirada la propuesta de "provocar un frío total" en Producción

Esperar 8 h (`pv3:`) o 30 h (pools) no demuestra que las cachés internas
estén frías ni garantiza 926 llamadas (el resto de las familias, la caché en
memoria del proceso y las combinaciones vecinas comparten claves). Queda
**sólo como observación pasiva**: si alguna vez una línea de Producción,
leída en vivo, muestra `cache MISS` con `tmdb ≈ 926 llamadas`, esa línea es
la medida — no se pide, no se programa y no queda como autorización
pendiente del dueño.

### 40.8 3.c.2 — sigue NO aprobada; lo que su diseño debe resolver antes de proponerse

Permisos en lotes (quién los pide, cuántos, cuándo); respuesta perdida al
pedir (¿se descuentan?); devolución duplicada (idempotencia por lote, igual
que 40.1); muerte del proceso con permisos tomados (vencimiento por `PX`
del lote, no del total); vencimiento de la ventana con llamadas aún activas
(las en vuelo terminan; las en cola no reciben permiso); Redis caído (piso
local, contado); todo con pruebas multiproceso en el banco (3 procesos,
semillas fijas). Nada de eso está diseñado con ese detalle: **no se propone
para implementación.**

### 40.9 Qué quedó medido, ajustado, inferido o desconocido

| | |
|---|---|
| **Medido en Producción** | 250/15,1 s; 342/16,7 s; promedios por llamada; UB en 0,64 s; 0 × 429 |
| **Reproducido por el banco** (con semillas, 3 rep.) | 926 llamadas; ráfaga ≤ 24/100 ms y ~80/s por proceso; `24 × N`; `t_inicio_fondo` 0,30-0,37 s; publicación 0,13-0,15 s; piso secuencial de 64 ops; +15-28 % sobre las dos observaciones bajo el modelo ajustado; el RED/GREEN de `PAUSAR` (modelo) |
| **Parámetro ajustado** | Redis 40 ms; p95 1,5×; K = 24, Δt = 1 s; marcador ≥ 60 s |
| **Sensibilidad** | 25-54 s de frío total según Redis y cola |
| **Inferido** | que el promedio de 527 ms de la 3.a lo inflaba una cola; que el límite efectivo de TMDB no es un tope estricto por segundo |
| **Extrapolación no validada** | 926 ≈ 26 s en Producción; margen 24 s; 64/s con dos reconstrucciones |
| **Desconocido** | distribución real de Upstash por operación; cola real de TMDB; `N` instancias; límite real de TMDB; tasa del `tmdb-sync`; si el SDK devuelve la tupla del `EVAL` de `PAUSAR` |

### 40.10 Conclusión: ¿3.c.1 queda lista para auditoría de implementación?

**No todavía.** Queda lista para **auditoría de diseño** (este §40): los
siete puntos tienen corrección escrita, y cinco tienen prueba ejecutable
sobre modelo (`PAUSAR`, estados). Para pasar a auditoría de
**implementación** faltan, en este orden: (1) que Codex acepte §40; (2) la
precondición de Preview del script (`EVAL` con `PTTL`/`EXISTS`/`SET PX`/
`LPUSH` y la tupla de retorno a través del SDK), sin tocar Producción; (3)
que el cambio al **script de adquisición del turno** (Etapa 2, `lib/turno-lua.ts`)
se diseñe con su propio RED, porque toca fencing y generación; (4) que los
umbrales de 40.4 queden aceptados por el dueño **antes** de medir. 3.c.2:
no aprobada (40.8). Ninguna prueba en Producción se pide.

> **§40 queda corregido por §41** (auditoría de Codex sobre `21cbf18`):
> contrato con sobrepaso explícito (no "0 llamadas" tras adquirir), lector
> no bloqueante sin tormenta (Δt desde el inicio, ≤ 1 en curso, F_max = 3 +
> enfriamiento), marcador 120 s + marca de agua por proceso, Lua completo con
> observabilidad y `/api/health` sólo agregados, `503` explícito para el
> dueño, estado canónico limpio.

## 41. Etapa 3.c — auditoría y corrección de §40 sobre `21cbf18` — **3.c.1: diseño cerrado (NO aprobada, NO implementada); 3.c.2 fuera de alcance** (2026-09-16)

> **CORREGIDO por §42 y §43** en: 41.5 (`503` inmediato → espera breve, §42),
> 41.1 (cota 61/183 → 94/282 con `T_lectura`, y sin cota si la lectura
> falla, §43.7), 41.2 ("`Δt` domina" → elección explícita de sólo `Δt` con
> números, §43.6; `F_max` 3 → 1, §43.8), 41.3/41.4 (hash global de marcas →
> clave por proceso, §43.9; orden del Lua que falla seguro y telemetría en
> `pcall`, §43.10). El estado vigente de la 3.c es **§43**.

Rama `diseno/etapa3c-proteccion-tmdb`, sobre `21cbf18`. Cambios: documentación
y `lib/tmdb-pausa-diseno.test.ts` (modelo; 13 propiedades nuevas, **28/28**).
Sin código productivo, merge, push, deploy, Producción, variables ni
infraestructura. **Este §41 es el único estado vigente de la 3.c; §38, §39 y
§40 quedan como antecedentes superados en lo que §41 corrige.** Los umbrales
de rendimiento de §40.4 **no se tocan**.

### 41.1 Punto 1 — la contradicción §40.4/§40.5: contrato con sobrepaso explícito

§40.5 afirmaba "la primera relectura ocurre antes de la llamada 1" y §40.4
hacía la relectura no bloqueante: incompatible. Contrato corregido:

| Cuándo existe la pausa | Garantía | Llamadas iniciadas después |
|---|---|---|
| **Antes de adquirir el turno** | la comprobación va dentro del script atómico de adquisición: **no se adquiere, no se compone, no se programa el fondo** | **0** (demostrable: no hay instante entre comprobar y adquirir) |
| **Después de adquirir** (en cola o en composición) | la ve el nivel 1 (429 propio) o el nivel 2 (relectura no bloqueante, una por `Δt`); la composición se cancela y no se publica; el turno se libera en el acto | **sobrepaso explícito y medible**: `≤ enVuelo + admitidas durante (Δt + RTT_lectura)` = `24 + ⌈35 × 1,04⌉ = 61` por proceso [derivado con la cadencia del banco]; `≤ 183` con tres procesos. **No se promete cero.** |

No se agrega una lectura bloqueante tras adquirir: costaría una operación
de Redis en el camino crítico de **toda** composición sana (40-138 ms) y no
cerraría ninguna ventana — entre esa lectura y la primera llamada seguiría
habiendo un instante. El banco de 3.c.1 mide el sobrepaso real (llamadas
recibidas por el doble después del primer 429, por proceso y global) contra
esa cota.

### 41.2 Punto 2 — el lector no bloqueante, sin tormenta de Redis (RED→GREEN sobre modelo)

Diseño (`lib/tmdb-pausa.ts`, futuro; un lector por **proceso**):

- **Una sola lectura en curso por proceso.** Los permisos del semáforo que
  llegan mientras hay una en vuelo **no inician otra**: comparten la que
  está (su resultado fija la bandera local para todos).
- **Intervalo desde el inicio**: la siguiente lectura sale en el primer
  permiso posterior a `Δt = 1.000 ms` **contados desde el inicio** de la
  anterior, no desde su respuesta. El `K` de §39.5/§40 **se elimina**: con
  `Δt` contado así, `K = 24` permisos nunca llegan antes que `Δt` a ninguna
  cadencia por proceso (habría que superar 24 permisos/s sostenidos… y aun
  así `Δt` es el tope). Queda sólo `Δt`.
- **Timeout propio** `T_lectura = 1.000 ms` (`AbortSignal.timeout` del
  lector, independiente de la señal de la solicitud). Ojo con el SDK de
  Upstash: con una señal **abortada** devuelve un `200` sintético con
  `{ result: "Aborted" }` (`nodejs.js`, rama `requestOptions.signal?.aborted`):
  cualquier resultado que **no sea un entero** se trata como
  `indeterminado`, nunca como "sin pausa".
- **Máximo exacto de fallos**: `F_max = 3` fallos **seguidos** (timeout,
  error de red, resultado no entero) → `enfriamiento = 30 s` sin leer (el
  nivel 1 sigue vivo); después, una lectura más; una respuesta válida
  reinicia la cuenta. Con Redis colgado, lento (> `T_lectura`) o caído: **6
  lecturas por minuto como máximo**, no una por permiso.

**RED (control, ejecutado):** un lector ingenuo (una lectura cada 24
permisos, sin guardia de vuelo ni timeout propio) con Redis colgado, a 35
permisos/s: **50 lecturas iniciadas en 30 s y las 50 colgadas a la vez**
— tormenta. **GREEN**
(`crearLector`): Redis normal (40 ms) → `maxEnCurso = 1`, 30 lecturas en 30
s (una por `Δt`), 0 fallidas; Redis lento (RTT 3 s) → `maxEnCurso = 1`,
exactamente 6 iniciadas y 6 fallidas en 60 s; Redis colgado → 6 y 6; Redis
caído (error inmediato) → 6, `maxEnCurso = 1`; recuperación: tras el
enfriamiento vuelve a leer y con respuesta el contador se reinicia (3
fallidas en total, ≥ 9 resultados en los 10 s siguientes).

Consecuencia sobre el umbral de operaciones de Redis de §40.4: el esperado
pasa a `≤ ⌈duración / Δt⌉ + 2` (frío total ≈ 27 s → ≤ 29), **por debajo**
del umbral fijado (`≤ ⌈llamadas / 24⌉ + 2 = 41`), que **se mantiene como
está** hasta medir.

### 41.3 Punto 3 — horizonte real del reintento y marcador conservador; un evento viejo nunca reabre

Horizonte [medido en el código del SDK `@upstash/redis` 1.38.0, `nodejs.js`
y `lib/metricas.ts`]: `attempts = 5` ⇒ hasta **6 intentos**, con
`backoff(i) = e^i × 50 ms` ⇒ esperas `Σ_{i=0..4} = 4,29 s`; cada intento es
un `fetch` **sin timeout propio**, así que el horizonte no lo fija el SDK
sino la **invocación**: en Vercel muere a `maxDuration = 60 s` desde el
inicio de la solicitud, y un evento se crea dentro de ella ⇒ **ningún
reintento del mismo evento ocurre más de 60 s después de crearlo**.
Marcador: **`PX 120.000`** (2 × `maxDuration`), conservador, no "60 s por
suficiente".

Y para que un evento viejo **nunca** reabra una pausa, ni siquiera si el
marcador venciera: **marca de agua por proceso** —`tmdb:pausa:proc`, hash
`uuid → último contador aplicado`, `EXPIRE 86400`— dentro del mismo script;
un evento con `contador ≤ marca` es `ya-aplicada`. Para que la marca sea
exacta, cada proceso **serializa** sus `PAUSAR`: uno en vuelo por vez; un
429 que llega mientras hay uno en vuelo no crea un evento nuevo sino que se
funde con el siguiente (se toma el `Retry-After` mayor).

**GREEN:** reintento a los **61 s** → `ya-aplicada` (marcador vivo), la
pausa de 8 s ya venció y no se reabre; reintento a los **130 s** (marcador
vencido) → `ya-aplicada` por la marca de agua, `PTTL = -2`; el evento
siguiente del mismo proceso escribe; un evento anterior demorado
(`contador 6` después del `8`) no alarga; un proceso nuevo (otro uuid)
arranca su serie.

### 41.4 Punto 4 — el Lua completo, con observabilidad, en orden

```lua
-- KEYS[1] tmdb:pausa          (string: id del evento vigente, PX = duración)
-- KEYS[2] tmdb:pausa:ev:<id>  (marcador de idempotencia, PX 120000)
-- KEYS[3] tmdb:pausa:proc     (hash uuid → último contador aplicado, EXPIRE 86400)
-- KEYS[4] tmdb:eventos        (lista, 200 últimos, EXPIRE 604800; sólo para diagnóstico con credenciales)
-- KEYS[5] tmdb:cubos          (hash "<minuto de Redis>:<campo>" → n, EXPIRE 172800)
-- ARGV[1] id  ARGV[2] ms  ARGV[3] uuid  ARGV[4] contador  ARGV[5] familia  ARGV[6] retryAfterMs
local t = redis.call('TIME'); local minuto = math.floor(tonumber(t[1]) / 60); local ahoraMs = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local function cubo(campo) redis.call('HINCRBY', KEYS[5], minuto .. ':' .. campo, 1); redis.call('EXPIRE', KEYS[5], 172800) end
if redis.call('EXISTS', KEYS[2]) == 1 then cubo('ya-aplicada'); return {'ya-aplicada', redis.call('PTTL', KEYS[1])} end
local marca = tonumber(redis.call('HGET', KEYS[3], ARGV[3]) or '-1')
if tonumber(ARGV[4]) <= marca then cubo('ya-aplicada'); return {'ya-aplicada', redis.call('PTTL', KEYS[1])} end
redis.call('SET', KEYS[2], '1', 'PX', 120000)
redis.call('HSET', KEYS[3], ARGV[3], ARGV[4]); redis.call('EXPIRE', KEYS[3], 86400)
cubo('429')
local restante = redis.call('PTTL', KEYS[1]); local estado
if restante >= tonumber(ARGV[2]) then estado = 'ya-mayor'; cubo('ya-mayor')
else redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2]); estado = 'escrito'; restante = tonumber(ARGV[2]); cubo('pausas') end
redis.call('LPUSH', KEYS[4], cjson.encode({ id = ARGV[1], t = ahoraMs, familia = ARGV[5], retryAfterMs = ARGV[6], estado = estado, restante = restante }))
redis.call('LTRIM', KEYS[4], 0, 199); redis.call('EXPIRE', KEYS[4], 604800)
return { estado, restante }
```

- **Orden exacto** (probado sobre el modelo): `EXISTS ev → HGET proc → SET ev
  → HSET proc → HINCRBY 429 → PTTL → (SET pausa | nada) → HINCRBY pausas |
  ya-mayor → LPUSH → LTRIM`. En **`ya-aplicada`** sólo se incrementa
  `ya-aplicada`: no toca pausa, marcador, marca de agua ni eventos.
  `escrito` y `ya-mayor` registran **un** evento y **un** 429 cada uno;
  los reintentos no duplican nada.
- **Reloj**: `TIME` de Redis dentro del script sella el evento y elige el
  cubo (`minuto`): dos instancias con relojes distintos caen en el mismo
  cubo (probado). Los clientes que suman `pausaNoLeida`, `pausadosUB` y
  `pausados503` lo hacen con `HINCRBY tmdb:cubos <minuto>:<campo>` donde el
  minuto también sale de Redis: un `EVAL` mínimo `TIME + HINCRBY`, o —más
  barato— el mismo script con un ARGV de modo. **Ninguna clave se deriva
  del reloj local.**
- **Compatibilidad `EVAL`**: cinco claves declaradas (nada de claves
  construidas dentro del script, salvo campos de hash); `TIME` y `cjson`
  dentro de scripts son estándar desde Redis 3.2, pero **en Upstash quedan
  como precondición de Preview** (junto con la tupla de retorno vía SDK).
- **`/api/health`** (probado sobre el modelo): **sólo agregados** —
  `pausaVigenteMs` y, para los últimos 60 cubos, las sumas de `429`,
  `pausas`, `ya-mayor`, `ya-aplicada`, `pausaNoLeida`, `pausadosUB`,
  `pausados503`. **Ningún uuid, id de evento, ruta ni evento crudo**
  (aserción sobre el JSON). `tmdb:eventos` guarda la **familia** de la ruta
  (`/watch/providers`, `/discover/movie`), nunca la URL con parámetros, y
  sólo se lee con credenciales de Redis (o un endpoint de admin con MFA,
  fuera de esta etapa). Una pausa espuria (`pausas > 0` con `429 = 0` en la
  ventana) es imposible por construcción; verla en `/api/health` delata un
  bug.

### 41.5 Punto 5 — Home sin UB durante la pausa: `503`, `Retry-After`, y el cliente real

> **REEMPLAZADO por §42 (decisión del dueño):** el `503` inmediato sin UB
> **no quedó aprobado**. Sin UB se espera un período breve y acotado a que
> la pausa termine; el `503` sólo si continúa. Lo que sigue de 41.5 vale
> como contrato del `503` cuando ocurre y como modelo del cliente.

Contrato de la ruta (reutiliza el que la 3.a ya definió en
`lib/tmdb-http.ts`): **`503`**, `Retry-After: ⌈PTTL / 1000⌉`, cuerpo `{
error: "tmdb-no-disponible", motivo: "pausa", reintentarEnMs: PTTL }`. Lo
que hoy hace el cliente con eso [medido en el código]: `useApi` toma
`!r.ok` ⇒ `error = true`, `data = null`, `motivo = "tmdb-no-disponible"`
(`motivoDeRespuesta`, ya probado en `lib/tmdb-http.test.ts`); `CatalogView`
con `hayContenido = false`, `cargando = false` y en línea renderiza **"No
pudimos cargar el inicio."** con el botón **Reintentar** (`up-retry`). El
modelo del recorrido está en el test (`motivoDeRespuesta` real). Lo que
**no** ocurre: un Home vacío con `200` que la vista leería como "Nada en tus
plataformas" — por eso es `503` y no el `200` vacío de hoy para
`cancelada`.

**Cambio de experiencia, explícito para aprobación del dueño:**

| | Hoy (`37d4707`) sin UB y TMDB caído | Con 3.c.1, sin UB y pausa vigente |
|---|---|---|
| Status | `200` con `hero: [], rails: [], degradado: true, motivo: "cancelada"` tras esperar hasta 50 s | **`503`** inmediato con `Retry-After` |
| Mensaje | "No pudimos cargar el inicio." + Reintentar | **el mismo** |
| Espera del usuario | hasta 50 s (la composición que se cancela) | **< 1 s** |
| Reintento | manual | manual (opcional, no en 3.c.1: reintento automático a los `reintentarEnMs`) |
| Contenido | ninguno | ninguno |

La prueba **con la ruta y el cliente reales** (Preview del banco: `next
start` + navegador contra los dobles con 429 total) es parte de la
implementación de 3.c.1; hoy sólo hay modelo.

### 41.6 Punto 6 — estado canónico limpio

`docs/ESTADO.md` pasa a **16/09/2026** y su bloque de la 3.c es sólo el de
§41; los antecedentes (§38-§40) se citan como superados sin repetir sus
cifras. Textos retirados del estado vigente: "`t_inicio` 0,6-0,7 s" (→
0,30-0,37 s), "banco calibrado" (→ modelo de sensibilidad ajustado), "26 s
en Producción" (→ extrapolación no validada), "provocar/autorizar un frío
total en Producción" (→ sólo observación pasiva si ocurre). En el informe,
§39 y §40 llevan un rótulo de superados al inicio.

### 41.7 Umbrales (sin cambios respecto de §40.4)

JSON completo **0 diferencias**; llamadas a TMDB **0 de diferencia**;
operaciones de Redis adicionales **≤ ⌈llamadas / 24⌉ + 2** (Redis caído: ≤
1 intento fallido — con el lector de 41.2 serán ≤ 3 por ventana de 30 s:
si eso supera el umbral, el umbral **no se mueve**, se discute con el
número medido); duración **≤ +5 % mediana / +10 % máx.**; publicación **≤
+1 operación**; 1/2/3 reconstrucciones; Redis normal/lento/caído; UB **≤
+50 ms**. Se miden con semillas fijas y tres repeticiones (banco de 40.2).

### 41.8 RED → GREEN de esta tanda (todo sobre modelo, `node --test lib/tmdb-pausa-diseno.test.ts`, 28/28)

| Propiedad | RED (control) | GREEN |
|---|---|---|
| Idempotencia de `PAUSAR` (§40.1) | ingenuo: `PTTL = 8000` tras reintento | 6 tests |
| Estados del Home (§40.5) | contrato booleano ⇒ `componer = 1` | 4 tests |
| Horizonte y marcador 120 s; evento viejo nunca reabre (41.3) | — | reintento a 61 s y a 130 s; contador viejo; proceso nuevo |
| Orden del script y escrituras por resultado (41.4) | — | secuencia exacta; `ya-aplicada` sólo suma su cubo |
| Cubo por reloj de Redis (41.4) | — | dos "instancias" en el mismo minuto |
| `/api/health` sólo agregados (41.4) | — | sin uuid/ruta/evento en el JSON |
| Lector sin tormenta (41.2) | ingenuo colgado: 50 iniciadas, 50 en vuelo | normal 30/30 s; lento 6/60 s; colgado 6/60 s; caído 6/60 s; recuperación |
| Sobrepaso explícito (41.1) | — | 61 por proceso, 183 con tres |
| `503` + cliente (41.5) | — | `motivoDeRespuesta` real → error, data null; nunca `200` vacío |

### 41.9 Conclusión: ¿queda listo para pasar a implementación?

**El diseño de 3.c.1 queda cerrado y listo para auditoría de
implementación.** No está aprobada: pasar a código exige (1) que Codex
acepte §41; (2) la precondición de Preview del `EVAL` (`TIME`, `cjson`,
`PTTL`, tupla de retorno vía SDK) contra un Preview aislado, sin tocar
Producción; (3) la aprobación del dueño de los umbrales de 41.7 (el `503`
inmediato de 41.5 quedó reemplazado por la espera breve de §42, decidida
por el dueño); (4) que la implementación empiece por el
RED del script de adquisición del turno (Etapa 2, `lib/turno-lua.ts`),
porque toca fencing y generación. **3.c.2 sigue fuera de alcance** (§40.8).
Ninguna prueba en Producción se pide.

## 42. Etapa 3.c.1 — decisión del dueño: sin UB, ESPERA BREVE Y ACOTADA antes del `503` (reemplaza a §41.5) — **diseño + modelo 40/40; NO aprobada, NO implementada** (2026-09-16)

> **CORREGIDO por §43** en: el bucle de espera (ahora un solo sueño y una
> sola readquisición, ≤ 2 `EVAL`), la cancelación (se propaga, no es un
> `503`), la precedencia con Redis caído, el presupuesto (incluye jitter y
> timeout de la readquisición) y el `Retry-After` con readquisición
> indeterminada. La decisión del dueño (42.1) y la comparación de
> `ESPERA_MAX` (42.3, propuesta sin datos reales) siguen vigentes.

Rama `diseno/etapa3c-proteccion-tmdb`, sobre `2246b2e`. Sin código productivo,
merge, push ni deploy. **Este §42 reemplaza §41.5 y cualquier texto que diga
que el dueño aprobó el `503` inmediato**: no lo aprobó.

### 42.1 Comportamiento decidido por el dueño

| Situación | Respuesta |
|---|---|
| Pausa vigente, **con** último Home bueno | el UB, en el acto (`origen ultimo-bueno-pausa`), sin componer |
| Pausa vigente, **sin** UB | **esperar un período breve y acotado** a que la pausa termine |
| La pausa termina dentro del período | intentar adquirir el turno y componer normalmente, respetando el presupuesto restante |
| La pausa continúa | **`503` + `Retry-After`**, el cliente muestra "No pudimos cargar el inicio" + Reintentar |
| Siempre | **nunca** esperar hasta 50 s; **nunca** un Home vacío con `200` |

### 42.2 La regla (verificable, cancelable, sin sondeo)

La espera **no sondea Redis**: el script atómico de adquisición del turno
(§41.1) ya devuelve `pausado` **con el PTTL restante**. Con eso:

```
esperado = 0
r = ADQUIRIR()                                   -- 1 EVAL
mientras r = pausado(restante):
  si esperado + restante > ESPERA_MAX            → 503, Retry-After = ⌈restante / 1000⌉   (pausa-continua)
  si presupuesto_restante − restante < COMPOSICION_MAX_MS
                                                  → 503, Retry-After = ⌈restante / 1000⌉   (presupuesto-insuficiente)
  dormir(restante + jitter, señal)                -- cancelable: el abort del cliente corta el sueño en el acto
  esperado += lo dormido
  r = ADQUIRIR()                                  -- re-comprueba la pausa EN EL MISMO SCRIPT; si se extendió, trae el PTTL fresco
adquirido → componer (con el chequeo de presupuesto de hoy) · ocupado → espera compartida de hoy · sin-redis → camino de hoy
```

- **Cuánto se espera:** exactamente lo que la pausa dice que falta
  (`restante`), más un jitter de 0-250 ms para que varias solicitudes no
  despierten en el mismo milisegundo; **sólo** si cabe en `ESPERA_MAX` y en
  el presupuesto. Una pausa más larga que `ESPERA_MAX` no se espera: `503`
  en el acto con su `Retry-After` real.
- **Redis:** 1 `EVAL` por intento de adquisición; **cero** operaciones
  durante el sueño; una pausa extendida cuesta a lo sumo un `EVAL` más, y
  la extensión que ya no cabe corta el bucle. Cota: `≤ 1 + ⌈ESPERA_MAX /
  restante_mínimo⌉` — en la práctica **2** `EVAL` por solicitud.
- **`Retry-After` correcto:** sale del PTTL **fresco** que devolvió la
  readquisición, así que descuenta lo ya esperado por construcción; con
  Redis indeterminado en ese punto se usa `restante_inicial − esperado`
  (duraciones locales, no instantes), piso 1 s.
- **Cancelación:** `dormir(ms, señal)` es el `dormir` que `servirConTurno`
  ya usa en la espera compartida (rechaza al abortar la señal de la
  solicitud); la solicitud cancelada termina sin componer y sin `200`.
- **Presupuesto:** `presupuesto_restante = PRESUPUESTO_REQUEST_MS − (ahora −
  t0)`; se exige que después de esperar quede `≥ COMPOSICION_MAX_MS` (16 s),
  el mismo umbral que hoy protege al rescate tardío ("un rescate que va a
  morir en 504 no se empieza").
- **Sin composición duplicada:** la readquisición es el `SET NX` + fencing
  de siempre; las solicitudes que despiertan y encuentran el turno ocupado
  caen en la **espera compartida existente** y reciben la fresca (o el UB)
  cuando el ganador publica.

### 42.3 `ESPERA_MAX`: alternativas comparadas, no un número arbitrario

No hay duraciones reales de pausa: Producción no vio un solo 429 (§38-§40),
así que **no existe distribución de `Retry-After` medida**. Lo que sí hay:
(a) el único `Retry-After` que la app **fabrica** cuando TMDB no lo manda:
`REINTENTAR_POR_DEFECTO_MS = 5.000` (`lib/tmdb-http.ts`, 3.a); (b) el
backoff sin cabecera propuesto para la pausa (§39.5): 1 → 8 s; (c) el doble
del banco: `retryAfter = 2` por defecto; (d) el presupuesto: 50 s − espera −
16 s de composición; (e) lo que el usuario ya tolera hoy: un Home frío de
15-17 s [medido].

| `ESPERA_MAX` | Pausas que cubre (por defecto 5 s / doble 2 s / backoff 1-8 s) | Latencia máxima añadida | Presupuesto tras esperar | `EVAL` | Juicio |
|---|---|---|---|---|---|
| 1 s | sólo las que ya casi vencen; ninguna pausa por defecto entera | 1,25 s | 49 − 16 = 33 s | ≤ 2 | casi siempre `503`: la espera no sirve |
| 2 s | las del doble; las por defecto sólo en su último tercio | 2,25 s | 32 s | ≤ 2 | cubre el banco, no la app |
| 3 s | ídem, más de la mitad de una por defecto | 3,25 s | 31 s | ≤ 2 | intermedio sin ancla |
| **5 s** | **toda pausa por defecto (5 s) y todo `Retry-After ≤ 5`**; del backoff 1-8, los escalones 1, 2, 4 | **5,25 s** (< el Home frío de 15 s) | **29 s ≥ 16** | ≤ 2 | **elegida**: es la única constante de pausa que la app ya genera, y cabe con margen |
| > 5 s | los `Retry-After` explícitos largos (8 s) | ≥ 8 s | ≤ 26 s | ≤ 2 | acerca la espera a lo que hoy es una composición; sin dato que lo justifique |

**`ESPERA_MAX = 5 s`** [propuesto, derivado de `REINTENTAR_POR_DEFECTO_MS`;
sin distribución real]. Como la espera real es `min(restante, ESPERA_MAX)`,
la constante sólo decide el corte para pausas **más largas** que ella; una
pausa de 1,2 s se espera 1,2 s. Cuando existan cubos de pausas (§41.4), la
duración real de las pausas vistas revisa este valor con datos.

### 42.4 Modelo RED→GREEN (`lib/tmdb-pausa-diseno.test.ts`, sección §42, **40/40** en total)

| # | Caso pedido | Resultado del modelo |
|---|---|---|
| 1 | pausa que termina durante la espera (2,3 s) | duerme 2,4 s (restante + jitter), readquiere, compone; **2 `EVAL`**, 0 lecturas durante el sueño |
| 2 | pausa que continúa (8 s > 5) | `503` en el acto, `Retry-After: 8`, 1 `EVAL`, 0 composiciones |
| 2b | pausa **extendida** durante la espera (2 s → +4 s) | tras dormir 2,1 s la readquisición ve 4 s: `2,1 + 4 > 5` → `503`, `Retry-After: 4` (el nuevo) |
| 3 | cliente abandona a 1,5 s de una espera de 4 s | el sueño se corta a los 1,5 s, 0 composiciones, sin `200` |
| 4a | Redis caído | `sin-redis` → camino de hoy (compone sin turno, no publica); no espera |
| 4b | Redis lento (3 s por `EVAL`) | la espera cuenta contra el presupuesto; sigue siendo 2 `EVAL`; compone |
| 4c | indeterminado (`"Aborted"`, `null`) | se interpreta como `sin-redis`, nunca como "sin pausa" |
| 5 | cuatro solicitudes sin UB esperando a la vez (jitter 0/50/100/150) | una `compuesta`, tres `compartida`; **una** composición |
| 6 | presupuesto insuficiente (ya gastó 33 s; 50 − 33 − 2 < 16) | `503` en el acto, `Retry-After: 2`, sin esperar |
| 7 | `Retry-After` tras esperar 4 s con pausa nueva de 6 s | `Retry-After: 6` (el PTTL fresco), no 4 ni 10 |
| 8 | dos solicitudes al terminar la pausa | A compone, B `compartida`; **una** composición (`SET NX`) |
| — | cota global | con restantes 0,5 / 2 / 4,999 / 5 / 5,001 / 8 / 30 s: espera `≤ 5,25 s` siempre; todo lo que no compone es `503` |

### 42.5 Cambio de experiencia, explícito para el dueño (reemplaza la tabla de §41.5)

| | Hoy (`37d4707`), sin UB y TMDB caído | Con 3.c.1 (§42), sin UB y pausa vigente |
|---|---|---|
| Espera del usuario | hasta 50 s (la composición que se cancela) | **≤ `restante` de la pausa, tope 5,25 s**; si la pausa termina antes, la composición normal (15-17 s hoy) |
| Status | `200` vacío con `motivo: "cancelada"` | `200` con el Home si la pausa terminó; **`503` + `Retry-After`** si continúa |
| Mensaje | "No pudimos cargar el inicio." + Reintentar | el mismo, sólo en el `503` |
| Contenido | ninguno | el Home completo cuando la pausa terminó |

### 42.6 Criterios RED para la implementación (además de los de §40.5/§41)

En `home-servir.test.ts` con reloj virtual y deps inyectadas (`adquirir`
devolviendo `pausado(restante)`, `dormir` con señal): (1) `pausado(2300)` →
`dormir` llamado una vez con `2300 + jitter` y `adquirir` dos veces; `leer`
**0** veces durante el sueño; (2) `pausado(8000)` → `503` sin `dormir`; (3)
abort durante el sueño → `dormir` rechaza, `componer` 0, `liberar` 0 (no
había turno), respuesta `503 cancelada`; (4) `adquirir` que lanza →
`sin-redis` como hoy; resultado no entero → `sin-redis`; (5) N `servirConTurno`
concurrentes sobre el turno en memoria → `componer` 1; (6) `ahora()` avanzado
33 s antes → `503` sin `dormir`; (7) `Retry-After` = ⌈PTTL de la segunda
adquisición⌉; (8) fencing: el ganador publica; el segundo `adquirir` de otro
propietario tras la publicación → `HIT`/`esperada`, no `compone`. Y en la
ruta: el `503` lleva `Retry-After` y el cuerpo `{ error: "tmdb-no-disponible",
motivo: "pausa", reintentarEnMs }`; el cliente real (Preview del banco con
navegador) muestra el mensaje y el botón.

### 42.7 Estado

3.c.1: diseño cerrado con la decisión del dueño incorporada; **NO aprobada,
NO implementada**; lista para auditoría de implementación bajo las mismas
condiciones de §41.9 (aceptación de §41+§42, precondición de Preview del
`EVAL`, umbrales, RED del script del turno) — ya **sin** el punto "aprobación
del `503` inmediato", que queda sin efecto. 3.c.2 fuera de alcance.

## 43. Etapa 3.c.1 — corrección de §41 y §42 sobre `5405cbd` (diez puntos) — **NO aprobada, NO implementada** (2026-09-16)

> **CORREGIDO por §44** en: 43.2 (la cancelación no "propaga un
> `AbortError`": `dormirCancelable` resuelve y la ruta convertiría la
> excepción en `500`; semántica única = centinela 4d), 43.3 (no hay UB "en
> memoria": matriz por instante del fallo de Redis) y 43.7 (94/282 no es
> cota: fórmula parametrizada; línea base medida con 429 rápidas: 750-778
> llamadas tras el primer 429, pico 224-252/s). El estado vigente es **§44**.

Rama `diseno/etapa3c-proteccion-tmdb`. Sin código productivo, merge, push ni
deploy. Modelo: `lib/tmdb-pausa-diseno.test.ts`, **49/49**. Este §43
corrige §41 y §42 en lo que sigue; lo no corregido de ellos sigue vigente.
`ESPERA_MAX = 5 s` sigue siendo **propuesta provisional sin datos reales**
(0 × 429 en Producción).

### 43.1 Punto 1 — sin bucle: un solo sueño, una sola readquisición, ≤ 2 `EVAL`

```
r1 = ADQUIRIR()                                            -- EVAL 1 (atómico: pausa + SET NX)
r1 ≠ pausado → como hoy (adquirido / ocupado / sin-redis)
restante = r1.restante
si restante > ESPERA_MAX                                   → 503, Retry-After = ⌈restante⌉
si presupuesto_restante − (restante + JITTER_MAX + T_ADQ_MAX) < COMPOSICION_MAX_MS
                                                           → 503, Retry-After = ⌈restante⌉
dormir(restante + jitter, señal)                           -- UNA vez, ≤ ESPERA_MAX + JITTER_MAX
r2 = ADQUIRIR()                                            -- EVAL 2, el último de la solicitud
r2 = pausado   → 503, Retry-After = ⌈r2.restante⌉  (nunca se vuelve a dormir)
r2 = indeterminado → 503 con el fallback de 43.5
r2 ≠ pausado   → como hoy
```

Cota **obligatoria y probada**: ≤ 2 `EVAL` de adquisición y ≤ `ESPERA_MAX +
JITTER_MAX` = 5,25 s de sueño por solicitud, para cualquier `restante`. El
control del bucle superado: una extensión corta que "cabría" (1 s + 1 s) hoy
da `503` con el `Retry-After` nuevo y **no** un segundo sueño.

### 43.2 Punto 2 — la cancelación se propaga, no es un `503`

Si la señal de la solicitud aborta durante el sueño, `dormir` rechaza con
`AbortError`: la solicitud **no readquiere, no compone, no toma turno** y el
`AbortError` **se propaga** al handler, que cierra la respuesta como hace hoy
con cualquier solicitud abandonada (la línea `[home]` anota `CANCELADA`, no
un error; nada se cuenta como fallo de TMDB ni de Redis). Modelo: `{
cancelada: true }`, 1 `EVAL`, turno libre.

### 43.3 Punto 3 — precedencia entre la pausa local y Redis

| Pausa local (nivel 1) | Redis | Sin UB | Con UB |
|---|---|---|---|
| **vigente** | caído / indeterminado | **no se compone contra TMDB**: se aplica la misma regla de 43.1 con el `restante` **local** (duración medida por el propio proceso); si al despertar sigue vigente → `503`; si venció y Redis sigue caído → degradado de hoy | el UB en el acto (el que haya en memoria/Redis), **sin componer** |
| **vigente** | ok | igual que sin pausa local: manda el script (que también la ve) | UB en el acto, sin componer |
| ausente | caído / indeterminado | comportamiento degradado **de hoy** (compone sin turno, no publica) | ídem hoy |

Regla que no admite excepción: **con pausa local vigente nunca se compone
contra TMDB**, con o sin Redis. Probado en los cuatro cuadrantes.

### 43.4 Punto 4 — presupuesto previo al sueño, completo

`presupuesto_restante − (restante + JITTER_MAX + T_ADQ_MAX) ≥ COMPOSICION_MAX_MS`,
con `JITTER_MAX = 250 ms`, `T_ADQ_MAX = 2.000 ms` [propuesto: timeout propio
de la readquisición, `AbortSignal.timeout`], `COMPOSICION_MAX_MS = 16 s`.
Probado: con 30 s gastados y 2 s de pausa, `50 − 30 − 2,25 − 2 = 15,75 < 16`
→ `503` sin dormir; con 29 s gastados cabe y compone.

### 43.5 Punto 5 — `Retry-After` con readquisición indeterminada

`Retry-After = max(5 s, ⌈(restante_inicial − dormido) / 1000⌉)`: el fallback
es el `REINTENTAR_POR_DEFECTO_MS` de la app (5 s), **explícito y
conservador**, porque la pausa pudo extenderse mientras dormíamos y no
tenemos el PTTL fresco. Probado: pausa de 3 s, readquisición indeterminada →
`Retry-After: 5` (no 0 ni 1).

### 43.6 Punto 6 — `K` o `Δt` frente a sólo `Δt`, con números

A 35 permisos/s, `K = 24` se alcanza a los **686 ms**, antes que `Δt = 1 s`;
no es cierto que `Δt` "siempre domine". Comparación:

| Regla | Lecturas/s a cadencia plena | Lecturas por frío total (~27 s) | Latencia de propagación máx. | Frente al umbral fijado (≤ 41 ops extra para 926) |
|---|---|---|---|---|
| `K` o `Δt` | ~1,46 | ~40 | 686 ms + RTT | roza el umbral |
| **sólo `Δt`** | 1 | ~27 | 1 s + RTT | deja margen (≤ 29) |

**Elegida: sólo `Δt`** — tasa de lecturas predecible e independiente de la
cadencia, 314 ms más de propagación en el peor caso a cambio de un tercio
menos de operaciones. Queda escrito como decisión, no como "domina".

### 43.7 Punto 7 — la cota de sobrepaso con el timeout de lectura

La cota 61/183 de §41.1 sólo valía con Redis a 40 ms. Con `T_lectura = 1 s`:
`sobrepaso ≤ enVuelo + cadencia × (Δt + T_lectura) = 24 + 35 × 2 = 94` por
proceso, **282 con tres** [derivado, cadencia del banco]. Si la lectura
**falla** (timeout, error, no entero): **no hay cota compartida** — sólo la
protección local, que acota el sobrepaso de cada proceso a "hasta su propio
primer 429" más `enVuelo`. Declarado así, sin número.

### 43.8 Punto 8 — `F_max` alineado con el umbral

El umbral de §40.4 exige "Redis caído: ≤ 1 intento fallido por composición";
`F_max = 3` lo incumplía por construcción. **Elegido `F_max = 1`**: un fallo
(timeout, error, no entero) → 30 s de enfriamiento sin leer (nivel 1 sigue) →
una lectura más. Probado: Redis lento/colgado/caído → **2 lecturas en 60 s**
y **exactamente 1 fallida en una composición de 27 s**. El precio: un timeout
transitorio deja 30 s sin propagación compartida; con `F_max = 3` el umbral
tendría que cambiar a ≤ 3, y **no se cambia**.

### 43.9 Punto 9 — marca de agua por proceso con TTL propio

Se reemplaza el hash global `tmdb:pausa:proc` por **una clave por proceso**
`tmdb:pausa:proc:<uuid>` (`SET … PX 86400000`, valor = último contador):
cada una vence sola 24 h después del último evento de ese proceso; no hay
estructura que crezca bajo actividad continua ni limpieza que demostrar.
`KEYS[3]` del script pasa a ser esa clave (declarada por llamada). Probado:
la clave vence sola; no existe hash global.

### 43.10 Punto 10 — Lua no revierte: validar antes de mutar y fallar seguro

Lua garantiza que nada se **intercala**, pero un error a mitad del script
**deja escritas** las llamadas anteriores. Orden de v3:

```
validar ARGV (ms entero > 0, contador entero)         -- sin mutar nada
EXISTS marcador → ya-aplicada                          -- lecturas
GET proc → contador ≤ marca → ya-aplicada
PTTL pausa → decidir escrito | ya-mayor
SET pausa PX ms            ← la PROTECCIÓN primero
SET proc:<uuid> PX 86400000
SET marcador PX 120000     ← la idempotencia después
pcall(telemetría: TIME, HINCRBY cubos, LPUSH/LTRIM/EXPIRE eventos)   ← al final, nunca bloquea la protección
```

Por qué ese orden y no otro (probado con controles): si el script falla
**después** de `SET pausa` y antes del marcador, la pausa quedó puesta y el
reintento del mismo evento vuelve a escribirla (`escrito`): sobre-protección
acotada a la brecha del reintento (100 ms en el modelo), **nunca** una pausa
ausente. Con el orden inverso (marcador antes que pausa) un error entre
medio hace que el reintento diga `ya-aplicada` y **la pausa nunca se
escriba** — control que lo demuestra. La telemetría va en `pcall`: si
`TIME`/`cjson`/`HINCRBY` fallan (Upstash: precondición de Preview), la pausa,
la marca y el marcador ya están escritos y el resultado se devuelve igual;
sólo se pierde telemetría. El "orden exacto" de §41.4 queda superado por el
de arriba.

### 43.11 RED → GREEN de esta tanda (modelo, 49/49)

| Punto | RED (control) | GREEN |
|---|---|---|
| 1 sin bucle | §42: bucle que podía encadenar sueños | 1 sueño, 2 `EVAL`, extensión corta → `503`; cota dura para 8 restantes |
| 2 cancelación | §42: `503 cancelada` | `{ cancelada }`, 1 `EVAL`, sin turno, sin composición |
| 3 precedencia | — | 4 cuadrantes (local × Redis × UB) |
| 4 presupuesto | sólo `restante` | `restante + jitter + T_adq + composición`; 30 s → `503`, 29 s → compone |
| 5 fallback | `restanteInicial − esperado` → 0 | `max(5 s, …)` → 5 |
| 6 `K` vs `Δt` | "Δt siempre domina" | 686 ms medidos; elección explícita de sólo `Δt` |
| 7 cota | 61/183 (RTT 40 ms) | 94/282 con `T_lectura`; sin cota si falla |
| 8 `F_max` | 3 (incumplía el umbral) | 1: 2 lecturas/60 s, 1 fallida por composición |
| 9 marca de agua | hash global | clave por proceso con `PX` propio; vence sola |
| 10 orden del Lua | marcador antes que pausa → pausa nunca escrita | validar → leer → pausa → proc → marcador → `pcall(telemetría)` |

### 43.12 Estado

3.c.1: diseño con los diez puntos corregidos; **NO aprobada, NO
implementada**; pendiente de **nueva auditoría de Codex** antes de cualquier
código. Condiciones para implementar: las de §41.9 con §42 y §43 aceptados,
precondición de Preview del `EVAL` (`TIME`, `cjson`, tupla vía SDK; ahora en
`pcall`, así que su falta degrada la telemetría, no la protección), umbrales
de §40.4 aceptados (sin tocar), RED del script de adquisición del turno.
**3.c.2 sigue fuera de alcance.**

## 44. Etapa 3.c.1 — corrección de §43 sobre `122f1a6` (tres puntos) — **NO aprobada, NO implementada** (2026-09-16)

> **ANTECEDENTE, corregido por §45 (la señal es el presupuesto interno, no el
> cliente) y §46 (un solo deadline absoluto; "inalcanzable" era falso).**
> Siguen vigentes de aquí la matriz UB × Redis (44.2) y la línea base de
> sobrepaso (44.3). El estado vigente es **§45 + §46**.

Rama `diseno/etapa3c-proteccion-tmdb`. Sin código productivo, merge, push ni
deploy. Modelo `lib/tmdb-pausa-diseno.test.ts` **57/57**; nueva medida de
línea base `docs/medidas/2026-09-16-etapa3c0-sobrepaso-hoy.json` (modo
`sobrepaso` del banco; el doble registra ahora el status de cada respuesta).
Se conserva de §43: un solo sueño, ≤ 2 adquisiciones, `F_max = 1`, marca de
agua por proceso con TTL, orden seguro del Lua, sólo `Δt`, `ESPERA_MAX = 5 s`
provisional sin datos reales.

### 44.1 Vencimiento por presupuesto interno — una sola semántica, con las primitivas reales (reescrito en §45)

**Qué señal existe hoy [medido en código, con guard estructural]:**
`app/api/home/route.ts` **no usa `req.signal`**; `homePayload` (`lib/home.ts`)
crea `AbortSignal.timeout(CONSTANTES.PRESUPUESTO_REQUEST_MS)` para la
solicitud y otra para el fondo. Por lo tanto "la señal abortó" significa
**"venció el presupuesto interno de 50 s"** y **nunca** "el cliente
abandonó". La cancelación real del cliente **no está cableada**;
incorporarla (`req.signal`) sería otra decisión y **queda fuera de
alcance**. Además: `dormirCancelable` (`lib/home-servir.ts`) **resuelve** al
vencer la señal (no rechaza), y el `catch` de la ruta convierte cualquier
excepción en `500` + `console.error("[api/home] composeHome rechazó …")`.
§43.2 ("el `AbortError` se propaga") era falso en las dos puntas y, además,
hablaba de un abandono que la ruta no puede ver.

**RED (tres controles, ejecutados; `modeloDelCatchDeLaRuta` es un MODELO FIEL
del `catch`, no el handler importado):** (a) `dormirCancelable(10 s, señal)` +
`abort()` → "resolvió"; (b) la versión de §43, que esperaba un rechazo, con el
`dormir` real **readquiere y compone después del vencimiento** (2
adquisiciones, 1 composición); (c) lanzar un `AbortError` hasta el `catch` →
`500` y **un `console.error` falso**.

**Semántica única (GREEN):** después de `dormir`, mirar `senal.aborted`; si
venció el presupuesto interno, **devolver el centinela `vacio("cancelada")`
que `servirConTurno` ya usa en 4d** (línea `[home] … CANCELADA`, `origen
vacio-cancelada`): **no readquiere, no compone, no lanza, no `503`, no error
registrado**. Probado con el `dormirCancelable` real y el modelo fiel del
`catch`: `status 200`, `adquisiciones 1`, `composiciones 0`, sueño cortado en
< 1 s, registro vacío. ~~Por 43.4 esa rama es inalcanzable dentro del sueño~~
— **falso (§46):** el cálculo de 43.4 usaba el reloj local de
`servirConTurno`, que no ve la lectura previa; con el deadline absoluto de
§46 la rama sigue siendo necesaria como defensa real. **Guard estructural** (en el test): la ruta
no contiene `req.signal`, `lib/home.ts` crea exactamente dos
`AbortSignal.timeout(CONSTANTES.PRESUPUESTO_REQUEST_MS)`, el `catch` responde
`500` y registra, y `servirVacio("cancelada")`/`dormirCancelable` existen. La
implementación de 3.c.1 **deberá agregar una prueba de cableado contra la
ruta verdadera** (que el centinela de la espera llegue a la respuesta por el
camino de 4d y nunca como excepción) — no alcanza con el modelo.

### 44.2 Último bueno y Redis caído — sin caché en memoria

No existe copia persistente del UB en el proceso: `servirConTurno` lee la
fresca (paso 1) y, en el MISS, `[ub, degradado]` (paso 2) **una vez por
solicitud**; `ub` es una variable de esa solicitud. Matriz corregida
(sustituye a §43.3):

| Cuándo falla Redis | `ub` en esta solicitud | Pausa local vigente | Resultado |
|---|---|---|---|
| **antes del paso 2** (el MGET falla) | `null`, aunque el UB exista en Redis | sí | espera con el `restante` **local**; si sigue → `503`; **nunca compone** |
| antes del paso 2 | `null` | no | degradado de hoy (compone sin turno, no publica) |
| **después del paso 2** (adquisición o composición) | lo leído | sí | **el UB leído, sin componer** (como 4c ya sirve `ub` ante un productor que rechaza) |
| después del paso 2 | lo leído | no | como hoy: `sin-redis` → compone sin turno; si el productor falla, `ub` |
| nunca | lo leído | — | el script decide (pausado → UB si hay; si no, espera breve) |

No se agrega ninguna caché en memoria ni entra en el alcance.

### 44.3 Sobrepaso — fórmula parametrizada, estimaciones rotuladas, y la línea base medida

`sobrepaso_proceso ≤ enVuelo + cadencia × (Δt + T_lectura)`; **lo único
fijado por diseño es `enVuelo = 24`**; la cadencia no está acotada por
ningún mecanismo actual, así que **ningún número es cota dura**:

| Cadencia usada | Origen | Estimación por proceso (Δt 1 s, T 1 s) | ×3 |
|---|---|---|---|
| 35/s | media del frío total en el banco | 94 | 282 |
| 80/s | pico por segundo de un proceso (banco) | 184 | 552 |
| **252/s** | **429 rápidas, medido hoy** (abajo) | 528 | 1.584 |

**Control nuevo (sin pausa, es decir HOY):** frío total; a los 5 s el doble
pasa a `429` total con respuesta **inmediata**. Tras el primer 429, el
proceso emitió **750 / 776 / 778 llamadas más en 3,4-4,4 s**, con **pico
224-252 por segundo** y 28-56 por 100 ms (semillas 11/22/33) [medido en el
doble]: con 429 rápidas el semáforo de 24 rota casi sin latencia y la cola
drena entera. Eso es lo que 3.c.1 tiene que cortar, y es la **línea base**
contra la que su banco medirá el sobrepaso real (mismo escenario, con
pausa; criterio: llamadas tras el primer 429 por proceso ≈ `enVuelo +
admitidas hasta ver el primer 429`, que con 429 rápidas es del orden de
24-50 [estimación], y global ≈ Σ por proceso). Lo que el nivel 2 aporta es
para 429 **parciales**, donde un proceso puede tardar en ver el suyo.

### 44.4 RED → GREEN de esta tanda

| Punto | RED (control) | GREEN |
|---|---|---|
| 1 vencimiento interno | `dormir` real resuelve; §43 readquiere y compone tras el vencimiento; `AbortError` → `500` + error falso | centinela 4d con el `dormir` real y el modelo fiel del `catch`: 1 adquisición, 0 composiciones, 200 de hoy, registro vacío; sin vencimiento, 2 adquisiciones y 1 composición; guard estructural sobre la ruta (sin `req.signal`) |
| 2 UB × Redis | §43.3 asumía UB "en memoria" | matriz por instante del fallo; sin caché |
| 3 sobrepaso | 94/282 como cota | fórmula parametrizada (35/80/252 → 94/184/528); línea base medida 750-778 tras el 429 |

### 44.5 Comprobado / inferido / desconocido

- **Comprobado:** la ruta no usa `req.signal` y la señal es
  `AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)` (guard estructural);
  `dormirCancelable` resuelve al vencer; el `catch` de la ruta registra y
  devuelve `500` (modelo fiel, no el handler importado); `ub` es una
  variable por solicitud (`lib/home-servir.ts`); la línea base de 44.3
  (tres semillas).
- **Inferido:** que con el nivel 1 el sobrepaso por proceso baje a `enVuelo
  + admitidas hasta el primer 429` — se mide cuando exista la pausa.
- **Desconocido:** la cadencia real de Producción durante un 429 (nunca
  visto), `N` instancias, la distribución real de `Retry-After`.

### 44.6 Estado

3.c.1: **NO aprobada, NO implementada**; pendiente de **nueva auditoría de
Codex**. Condiciones para implementar: §41-§45 aceptados; precondición de
Preview del `EVAL`; umbrales de §40.4 sin tocar y aceptados; RED del script
de adquisición del turno; prueba de cableado del centinela contra la ruta
verdadera. **3.c.2 fuera de alcance.**

## 45. Corrección de §44 sobre `82ee412` — la señal es el presupuesto interno, no el cliente; estado canónico limpio (2026-09-16)

Sólo documentación y tests; sin código productivo, merge, push ni deploy.
(1) §44.1 reescrito: "abandono del cliente" → **"vencimiento/cancelación
por presupuesto interno"**, porque la ruta no usa `req.signal` y la única
señal es `AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)`; `req.signal` **no se
agrega** (otra decisión, fuera de alcance); `handlerReal` pasa a llamarse
`modeloDelCatchDeLaRuta` y se declara modelo fiel, no el handler importado;
se agrega un **guard estructural** sobre la ruta real (58/58) y se exige una
prueba de cableado para la implementación. (2) `ESTADO.md` e `ISSUES.md`
quedan con **un único estado vigente, §44**: fórmula de sobrepaso
parametrizada con cifras rotuladas como estimaciones (nada de 94/282 como
vigente), y el vencimiento interno devuelve el centinela 4d sin readquirir,
componer, lanzar ni registrar un falso error. Se conservan la matriz UB ×
Redis (44.2) y la línea base de sobrepaso (44.3); los bancos no se
regeneran (su lógica no cambió).

## 46. Corrección de §45 sobre `7b410ee` — un solo deadline absoluto: la lectura previa también consume el presupuesto — **ESTADO VIGENTE de la 3.c (con §45 y §47); NO aprobada, NO implementada; pendiente de nueva auditoría** (2026-09-16)

> **§47 corrige de aquí el plazo del fondo:** `plazoFondo = inicioFondo + 50 s`
> no basta (Vercel cuenta 60 s desde la solicitud); el fondo pasa a
> `min(inicioFondo + 50 s, inicioRuta + 60 s − margen)`. El plazo absoluto del
> camino en línea (46.3) queda aprobado y vigente.

Sólo documentación y tests (`lib/tmdb-pausa-diseno.test.ts`, **65/65**). Sin
código productivo, merge, push ni deploy.

### 46.1 El defecto: dos relojes

[Comprobado en código] `homePayload` crea la señal
(`AbortSignal.timeout(CONSTANTES.PRESUPUESTO_REQUEST_MS)`, `lib/home.ts:840`);
después `crearVueloHome.servir` hace la **lectura previa** del caché
(`await deps.leer(clave)`, `lib/home-vuelo.ts:70`); y recién `servirConTurno`
fija `t0 = ahora()` (`lib/home-servir.ts:143`). Todo cálculo de la forma
`PRESUPUESTO_REQUEST_MS − (ahora() − t0)` **ignora lo consumido antes de
`t0`**: una lectura previa lenta (Redis lento, los 6 reintentos del SDK con
4,29 s de backoff, un `fetch` colgado) no cuenta. Consecuencias: (a) el
cálculo de §43.4 permitía dormir y componer con presupuesto que ya no
existía, y la afirmación de §45 "el vencimiento durante el sueño es
inalcanzable" **era falsa**; (b) **el rescate de la espera compartida que
está hoy en Producción** (`home-servir.ts:315`, Etapa 2) tiene el mismo
defecto: puede empezar un rescate que la señal mata a los 50 s (→ `vacío`
cancelado), justo lo que su comentario dice evitar. (b) no es un riesgo de
contenido (nada incorrecto se publica) pero sí de un Home vacío evitable;
se corrige con el mismo contrato, dentro de la implementación de 3.c.1.

### 46.2 RED (dos controles, ejecutados)

1. Señal en `t = 0`; lectura previa de **35 s**; `servirConTurno` arranca su
   reloj a los 35 s; aparece `pausado(2000)`. Cálculo viejo: `50 − 0 − 4,25 ≥
   16` → **"cabe"**. Real: `plazo − ahora = 15 s` → **no cabe**. Con el viejo,
   sueño 2,1 s + readquisición + composición de 16 s terminan **después del
   plazo**: la señal corta la composición.
2. El rescate de hoy: lectura previa 30 s + espera compartida 5 s →
   `PRESUPUESTO − (ahora − t0) = 45 s` "restantes"; reales: **10 s**.

### 46.3 Contrato: un deadline absoluto, creado junto con la señal

```
homePayload:            inicio = ahora(); plazo = inicio + PRESUPUESTO_REQUEST_MS
                        senal  = AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)      -- mismo instante, misma duración
                        servirHome(clave, producir, { ...claves, plazo })
crearVueloHome.servir:  lectura previa; pasa el contexto (con `plazo`) a `resolver` SIN tocarlo
servirConTurno:         restante() = plazo − ahora()      -- sin t0 propio para el presupuesto
                          · rescate de la espera compartida:  restante() ≥ COMPOSICION_MAX_MS
                          · espera por pausa (43.1/43.4):     restante() − (pausa + JITTER_MAX + T_ADQ_MAX) ≥ COMPOSICION_MAX_MS
                          · antes de componer:                restante() ≥ COMPOSICION_MAX_MS
fondo (programarComposicionEnFondo):
                        inicioFondo = ahora(); plazoFondo = inicioFondo + PRESUPUESTO_REQUEST_MS
                        senalFondo  = AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)  -- ya es así (lib/home.ts:743)
                        componer(senalFondo, plazoFondo)                            -- el fondo NO hereda el plazo de la solicitud
```

`t0` de `servirConTurno` puede quedar para las métricas (`msTotal` de la
espera), **nunca** para decidir presupuesto. `ahora` sigue inyectable
(reloj virtual en tests). El techo externo (`maxDuration` 60 s desde la
solicitud) sigue por encima de los dos plazos: `plazoFondo ≈ solicitud + 50,4
s < 60 s`.

### 46.4 GREEN (modelo)

Con el plazo único: lectura previa 35 s + pausa 2 s → `503
presupuesto-insuficiente` **sin dormir**; lectura previa 0,3 s + pausa 2 s →
sueño, readquisición, composición **dentro del plazo** (aserción: nunca se
compone después del plazo); rescate con lectura previa 30 s + espera 5 s →
`503 espera-agotada`; el fondo tiene su plazo propio (50 s desde su inicio,
no desde la solicitud; no hereda los 15 s que le quedarían a la solicitud);
recorrido del plazo entre los cuatro módulos sin ningún `t0 = ahora()` para
presupuesto.

### 46.5 RED para la implementación (además de los anteriores)

En `home-servir.test.ts` con reloj virtual: (1) `deps.plazo` inyectado;
`ahora()` avanzado 35 s **antes** de llamar a `servirConTurno` (la lectura
previa) → con `pausado(2000)`, `dormir` **no** se llama y sale `503`; (2) el
mismo avance → la espera compartida rescata sólo si `plazo − ahora ≥ 16 s`;
(3) cableado (`etapa3c-cableado.test.ts`): `lib/home.ts` crea `plazo` en la
misma línea que la señal y lo pasa en el contexto; `home-servir.ts` no
contiene `PRESUPUESTO_REQUEST_MS − (` ni `ahora() - t0` en decisiones de
presupuesto; el fondo crea `plazoFondo` junto a `senalFondo`.

### 46.6 Comprobado / inferido / pendiente

- **Comprobado:** los tres puntos del recorrido (señal → lectura previa →
  `t0` local) en el código; el defecto del rescate actual (línea 315); los
  dos RED sobre modelo.
- **Inferido:** que una lectura previa pueda tardar decenas de segundos en
  Producción (el SDK reintenta 6 veces sin timeout propio: 4,29 s de
  backoff más los `fetch`; nunca observado — 0 líneas con `intentos http`
  ≫ llamadas). El contrato no depende de que ocurra.
- **Pendiente:** la implementación (3.c.1, no aprobada) y sus RED de 46.5;
  la corrección del rescate de Producción viaja con ella.

### 46.7 Limpieza documental

Encabezado del informe: sólo **§45 y §46** figuran como estado vigente;
§41, §43 y §44 pasan a antecedentes superados. `lib/tmdb-pausa-diseno.test.ts`:
el comentario "la cancelación se propaga" queda reemplazado por "el
vencimiento del presupuesto interno sale por el centinela 4d". `ESTADO.md`
e `ISSUES.md` apuntan a §46.

## 47. Corrección de §46 sobre `c5a2619` — el fondo con DOS límites absolutos — **ESTADO VIGENTE de la 3.c (con §45, §46 y §48); NO aprobada, NO implementada; pendiente de nueva auditoría** (2026-09-17)

> **§48 corrige de aquí la fuerza de la cancelación:** `plazoEfectivo` limita
> el trabajo NUEVO; una operación de Redis ya enviada completa después o
> pierde su respuesta (atómica, con fencing); `LIBERAR` es best effort
> (TTL); `MARGEN_CIERRE_MS` y `RESERVA_PUBLICACION_MS` (antes
> `PUBLICACION_MAX_MS`) son reservas propuestas, no máximos. Los dos
> deadlines quedan aprobados y vigentes.

Sólo documentación y tests (`lib/tmdb-pausa-diseno.test.ts`, **72/72**). Sin
código productivo, merge, push ni deploy. Se conserva el resto de §46 (plazo
absoluto del camino en línea, aprobado por la auditoría).

### 47.1 El límite pendiente

`plazoFondo = inicioFondo + 50 s` (§46.3) **no siempre queda debajo de
`maxDuration`**: Vercel cuenta los 60 s **desde el inicio de la solicitud**,
y el fondo puede empezar tarde (lectura previa lenta, adquisición lenta,
cesión). El test de §46 sólo cubría `inicioFondo = solicitud + 0,4 s`.
**RED (control):** fondo iniciado a los 15 s → `inicioFondo + 50 s = 65 s
desde la ruta` > 60 s: Vercel lo mataría antes de su plazo interno.

### 47.2 Contrato: dos límites absolutos y el efectivo

```
inicioRuta     = ahora() al COMIENZO REAL de la ruta (antes de la lectura previa) — el mismo `inicio` de §46
plazoInterno   = inicioFondo + PRESUPUESTO_REQUEST_MS               (50 s desde que el fondo empieza)
plazoExterno   = inicioRuta  + MAX_DURATION_MS − MARGEN_CIERRE_MS   (60 s − 5 s [propuesto] = 55 s desde la ruta)
plazoEfectivo  = min(plazoInterno, plazoExterno)
al iniciar el fondo:
  restante = plazoEfectivo − ahora()
  si restante < COMPOSICION_MAX_MS + PUBLICACION_MAX_MS (16 s + 1 s):
      NO se compone; el UB ya fue servido; LIBERAR el turno (mismo camino que la cancelación);
      métrica `fondo: "no-iniciado-presupuesto"` (la línea [home] de la solicitud no cambia:
      `origen ultimo-bueno-fondo | fondo programado`; la línea [home-fondo] sale con
      `fondo no-iniciado-presupuesto | publicacion no`, 0 llamadas)
  si no:
      senalFondo = AbortSignal.timeout(restante)        (no 50 s fijos; corta TMDB/Supabase, NO Redis: §48)
      componer(senalFondo, plazoEfectivo)
      INICIAR publicar sólo si ahora() + RESERVA_PUBLICACION_MS ≤ plazoEfectivo; si no, liberar (best effort) sin publicar
```

`MARGEN_CIERRE_MS = 5 s` [propuesto]: cubre la publicación medida (0,13-0,15
s), la línea de log y el asentamiento de `waitUntil`, con holgura sobre la
precisión del corte de Vercel (desconocida). Se fija antes de medir y se
revisa con el banco de 3.c.1. **El contenido del Home no cambia** en ningún
caso: sólo cuándo se compone y qué métrica lo cuenta.

### 47.3 RED → GREEN (modelo)

> **Tabla con SEMÁNTICA SUPERADA por §48/§49** en lo que dice "exactamente"
> y "turno liberado": la señal limita el trabajo nuevo (no detiene lo ya
> enviado a Redis) y la liberación es best effort, un solo intento, dentro
> del margen externo, con recuperación por TTL. Los plazos y los casos
> siguen vigentes.

| # | Caso | Resultado |
|---|---|---|
| RED | `inicioFondo + 50 s` a secas, fondo a los 15 s | 65 s desde la ruta > `maxDuration` |
| 1 | fondo a 0,4 s | limitado por el interno: **50 s** (efectivo 50,4 s < 55 s); publica (el `DEL` del turno va dentro del `PUBLICAR`) |
| 2 | fondo a 15 s | limitado por el **externo**: **40 s**, no 50; publica dentro del margen |
| 3 | fondo a 40 s (quedan 15 s < 17) | **UB ya servido, cero composición, `LIBERAR` best effort, `fondo: no-iniciado-presupuesto`** |
| 4 | composición que cruza el plazo efectivo (fondo a 20 s, 40 s de composición) | ~~cancelada exactamente en el plazo; turno liberado~~ → al detectar la señal (unos ms después del plazo) no se inicia nada productivo ni `PUBLICAR`; un `LIBERAR` best effort si queda margen (§49). Variante: termina 0,5 s antes → sin reserva para `PUBLICAR` → no publica |
| 5 | lectura previa 35 s + fondo a 35,4 s | externo desde la **ruta**: quedan 19,6 s (arranca, limitado por el externo); control: con el inicio tomado después de la lectura previa serían 50 s ficticios que mueren a los 60 |
| — | un solo `inicio` | alimenta el plazo de la solicitud (50 s), el plazo externo del fondo (55 s) y la señal |

Y en el modelo vigente de la espera sin UB (§43) el presupuesto pasa a
`plazo − ahora` (§46); el cálculo con reloj local **sólo sobrevive como
RED/antecedente rotulado en la sección §46 del test**; la frase
"inalcanzable" desaparece del modelo: el vencimiento durante el sueño es una
defensa real.

### 47.4 RED para la implementación

(1) `programarComposicionEnFondo` recibe `inicioRuta` (el `inicio` de §46)
y calcula `plazoEfectivo` al iniciar; con `ahora()` avanzado 40 s antes de
iniciar → `componer` 0 veces, `liberar` 1 vez, métrica
`fondo = "no-iniciado-presupuesto"`, `[home-fondo]` con `publicacion no`;
(2) con `ahora()` avanzado 15 s → la señal del fondo dura 40 s (no 50);
(3) publicación saltada si `ahora() + PUBLICACION_MAX_MS > plazoEfectivo`;
(4) cableado: `lib/home.ts` construye `senalFondo` con `AbortSignal.timeout(plazoEfectivo − ahora())`
y ya no con `PRESUPUESTO_REQUEST_MS` fijo; `MAX_DURATION_MS` del contrato
igual al `maxDuration` exportado por la ruta (guard estructural).

### 47.5 Comprobado / inferido / pendiente

- **Comprobado:** `maxDuration = 60` en la ruta y que Vercel lo cuenta
  desde la solicitud (§32.6, sonda: "Task timed out" a los 60 s desde el
  inicio de la solicitud aunque la respuesta ya salió); los seis casos del
  modelo.
- **Inferido/propuesto:** `MARGEN_CIERRE_MS = 5 s`; que el fondo pueda
  empezar > 10 s después de la ruta (nunca observado: 0,3-0,64 s medidos).
- **Pendiente:** implementación (3.c.1, no aprobada) con los RED de 47.4.

## 48. Corrección de §47 sobre `4724111` — la señal limita el trabajo NUEVO; las operaciones de Redis ya enviadas no se cancelan — **ESTADO VIGENTE de la 3.c (con §45-§47 y §49); NO aprobada, NO implementada; pendiente de nueva auditoría** (2026-09-17)

> **§49 corrige de aquí el criterio universal** "ninguna operación de Redis
> nueva después del plazo efectivo" (falso: la limpieza `LIBERAR` sale al
> detectar la señal, unos ms después). Criterio vigente: ninguna operación
> productiva o de publicación tras el plazo; sólo un `LIBERAR` best effort,
> una vez, dentro del margen externo de cierre.

Sólo documentación y tests (`lib/tmdb-pausa-diseno.test.ts`, **77/77**). Sin
código productivo, merge, push ni deploy. Se conservan los dos deadlines
(§47), la experiencia del usuario y el contenido del Home.

### 48.1 Lo que §47 prometía de más

"La señal del fondo dura exactamente `plazoEfectivo − ahora`; la composición
no puede seguir después" y "se detuvo exactamente en el plazo efectivo"
[modelo de §47] afirmaban una cancelación que el cliente de Redis actual no
da. [Comprobado en código] `lib/home-servir.ts` (4b) ya lo documenta: la
señal de la solicitud llega a TMDB y Supabase (`lib/senal-solicitud.ts`),
pero **los reintentos del SDK de Redis no se cancelan por solicitud**
("promesa reducida", §3.8) y un `RENOVAR` ya enviado se espera hasta que el
SDK responda; `lib/home.ts:839`: "lo que no corta son los reintentos del SDK
de Redis".

### 48.2 Contrato corregido (sustituye a 47.2 en lo que difiere)

1. **`plazoEfectivo` es el límite para INICIAR trabajo nuevo** — llamadas a
   TMDB y Supabase (las corta la señal) y el inicio de `PUBLICAR` (se decide
   antes de enviarlo). **No es** una garantía de que ninguna promesa de
   Redis sobreviva al plazo.
2. **Si la composición cruza el plazo:** la señal cancela lo controlable (no
   se inician más llamadas; las en vuelo terminan o fallan por su propio
   abort), **no se inicia `PUBLICAR`**, y se envía `LIBERAR` (best effort).
   Resultado: `cancelada`, nada publicado, UB intacto.
3. **Una operación de Redis ya en curso** (`RENOVAR`, `PUBLICAR`, `ENFRIAR`,
   `LIBERAR`) **puede completar después del plazo o perder su respuesta**.
   Conserva su atomicidad (Lua) y su fencing (propietario + generación): la
   ejecuta Redis entera o no la ejecuta. No se afirma "se detuvo
   exactamente".
4. **`LIBERAR` es best effort:** si responde, el turno queda liberado; si
   falla o Vercel mata el proceso, **el turno vence por su TTL** (15 s sin
   renovar) y el siguiente pedido lo adquiere. El UB no se toca.
5. **`MARGEN_CIERRE_MS = 5 s` y `RESERVA_PUBLICACION_MS = 1 s` son
   RESERVAS propuestas**, no máximos garantizados: `PUBLICACION_MAX_MS` pasa
   a llamarse **`RESERVA_PUBLICACION_MS`** (lo que se exige que quede antes
   de *iniciar* `PUBLICAR`, no una cota de cuánto tarda). En el código de
   hoy la constante se llama `PUBLICACION_MAX_MS` (`home-servir.ts:80`); el
   renombre es parte de la implementación.
6. **Un `PUBLICAR` ya aceptado por Redis puede terminar publicando un
   payload completo y sano aunque la respuesta se pierda.** Es correcto: el
   script escribe fresca + UB + generación + `DEL` del turno **todo o nada**;
   nunca existe una escritura parcial o degradada (lo degradado no llega a
   `PUBLICAR`: `cachedIf`/`producir` lo descartan antes).

### 48.3 Modelos RED → GREEN (los nuevos, además de 1-5 de §47 reescritos sin "exactamente")

| # | Caso | Resultado |
|---|---|---|
| 6 | `PUBLICAR` iniciado antes del plazo (con la reserva) y completado después (RTT 1,5 s) | la señal no lo cancela; Redis lo ejecuta entero: fresca y UB = payload completo y sano, generación +1 |
| 7 | respuesta de `PUBLICAR` perdida | Redis la aplicó entera (o no la aplicó): nunca parcial; el proceso informa `publicacion indeterminada`; variante "no aplicada" (el proceso muere al enviar): UB intacto, turno por TTL |
| 8 | `LIBERAR` falla (Redis caído al liberar) | UB intacto, nada publicado, el turno sigue del proceso hasta que **vence por TTL**; otro lo adquiere |
| 9 | corte duro de Vercel a los 60 s con trabajo en vuelo | resultado **no observable**; no se afirma liberación; el turno vence por TTL; un `PUBLICAR` ya aceptado puede haberse aplicado entero |
| 10 | los cinco caminos (0,4 s; 15 s; 40 s; cruce; publicación tardía) | ~~ninguna operación de Redis nueva se envía después del plazo efectivo~~ — **superado por §49:** ninguna productiva o de publicación; sólo un `LIBERAR` de limpieza dentro del margen externo |

Los casos 1-5 de §47 se mantienen: 0,4 s → 50 s; 15 s → 40 s por el
externo; 40 s → UB sin fondo, `LIBERAR` enviado, `fondo:
no-iniciado-presupuesto`; cruce → `cancelada` sin `PUBLICAR`; lectura previa
35 s → externo desde la ruta.

### 48.4 RED para la implementación (se suman a 47.4)

(1) `componer` en fondo con reloj virtual: al vencer la señal, `producir`
no inicia llamadas nuevas y `publicar` **no se llama**; `liberar` se llama
una vez; (2) `liberar` que rechaza → la línea `[home-fondo]` sale igual,
sin excepción, con `turno liberado: no`; (3) `publicar` cuya promesa
rechaza por red → métrica `publicacion indeterminada` (no `no`), UB
intacto; (4) un `RENOVAR` en vuelo al vencer la señal no se aborta
(`cortarRenovacion` lo espera, como hoy); (5) renombre
`PUBLICACION_MAX_MS → RESERVA_PUBLICACION_MS` con guard estructural.

### 48.5 Comprobado / inferido / desconocido

- **Comprobado:** que la señal no corta los reintentos del SDK de Redis ni
  una operación ya enviada (`home-servir.ts` 4b, `home.ts:839`); que
  `PUBLICAR` es un script atómico con fencing (Etapa 2); los diez modelos.
- **Inferido:** que "no iniciar `PUBLICAR` después del plazo" más la
  reserva de 1 s deja el corte de Vercel fuera del camino de publicación
  en la práctica (publicación medida 0,13-0,15 s; RTT p95 de Upstash
  desconocido).
- **Desconocido:** precisión del corte de Vercel a `maxDuration`; RTT p95
  real de Upstash desde `iad1`; cuánto sobreviven a un corte duro las
  peticiones ya en vuelo.

## 49. Corrección de §48 sobre `ee9da01` — la limpieza `LIBERAR` como única excepción después del plazo efectivo — **ESTADO VIGENTE de la 3.c (con §45-§48 y §50); NO aprobada, NO implementada; pendiente de nueva auditoría** (2026-09-17)

> **§50 corrige de aquí:** el test (14) no probaba una segunda llamada; la
> respuesta perdida tiene dos resultados (aplicada / no aplicada); el TTL
> se modela con las renovaciones reales (recuperación EVENTUAL, ≤ 15 s
> desde la última renovación); y el borde de `maxDuration` se cierra con
> comparación estricta (`ahora < límite`).

Sólo documentación y tests (`lib/tmdb-pausa-diseno.test.ts`, **83/83**). Sin
código productivo, merge, push ni deploy.

### 49.1 La contradicción

§48 afirmaba "ninguna operación de Redis nueva después del plazo efectivo",
pero su propio camino cancelado enviaba `LIBERAR` como limpieza. El modelo
lo escondía asignando `ahora = plazoEfectivo` y aceptando `enviadaEn ≤
plazo`; en ejecución real la composición **devuelve o detecta la señal
algunos milisegundos después** del plazo. **RED (ejecutado y visto
fallar):** composición que termina en `plazoEfectivo + 100 ms` → `LIBERAR
enviado a plazo + 100 ms` — el criterio universal de §48 es falso. Queda como
control en el archivo.

### 49.2 Contrato corregido

1. **Después del plazo efectivo no se inicia trabajo productivo nuevo:**
   llamadas a TMDB/Supabase, `RENOVAR`, `ENFRIAR` ni `PUBLICAR`.
2. **Única excepción de cierre: un solo `LIBERAR` best effort**, permitido
   incluso después del plazo efectivo, pero **sólo dentro del margen externo
   de cierre**: hasta `inicioRuta + MAX_DURATION_MS` (los 5 s de
   `MARGEN_CIERRE_MS`).
3. Si ya no queda margen, Redis está caído, la operación falla, la respuesta
   se pierde o Vercel corta el proceso: **no se insiste**; el turno se
   recupera por su TTL.
4. Esa excepción **nunca** publica, enfría, renueva ni altera el UB (es un
   compare-and-delete del turno propio).
5. **Un solo intento** de `LIBERAR` por composición (guardia por intentos:
   un segundo `finally` no envía nada).

Criterio que reemplaza al de §48: **"ninguna operación productiva o de
publicación después del plazo efectivo; sólo puede intentarse la limpieza
`LIBERAR`, una vez, dentro del margen externo"**.

### 49.3 GREEN (modelo)

| # | Control | Resultado |
|---|---|---|
| 10 | los cinco caminos (0,4 s; 15 s; 40 s; cruce con detección +100 ms; publicación tardía) | 0 `PUBLICAR`/`ENFRIAR`/`RENOVAR`/TMDB/Supabase tras el plazo; ≤ 1 `LIBERAR`, y sólo ≤ `inicioRuta + 60 s` |
| 11 | queda margen (detección +100 ms) | **exactamente un** `LIBERAR`; turno liberado; nada publicado ni enfriado; UB intacto; generación sin cambio |
| 12 | sin margen (detección +5,1 s = `inicioRuta + 60,1 s`) | **cero** `LIBERAR`; `omitido-sin-margen→TTL`; ~~el turno ya venció por TTL~~ → se recupera EVENTUALMENTE al vencer el TTL restante (§50.3) |
| 13 | `LIBERAR` falla / respuesta perdida | UB intacto, nada publicado, **un solo intento**; ~~recuperación por TTL~~ → §50.2: perdida **aplicada** = ya liberado; **no aplicada** o fallo = TTL eventual |
| 14 | segundo pedido de limpieza | ~~omitido por la guardia~~ → §50.1: probado con la función real `limpiarTurno` llamada dos veces (RED sin guardia: dos envíos) |
| 15 | `PUBLICAR` aceptado antes del plazo | semántica atómica de §48 intacta (fresca + UB + generación + `DEL`, entero o nada); tras un `PUBLICAR` no hay `LIBERAR` aparte |

Los casos 1-9 de §47/§48 siguen en verde con el criterio nuevo (el 4 ya no
afirma "turno liberado": afirma "sin `PUBLICAR`; `LIBERAR` best effort").

### 49.4 Tabla de §47 — semántica superada

La tabla de §47.3 decía "cancelada por la señal exactamente en el plazo" y
garantizaba "turno liberado": queda rotulada como **semántica superada** por
§48/§49 (la señal limita el trabajo nuevo; la liberación es best effort y
por TTL).

### 49.5 RED para la implementación (se suman a 47.4/48.4)

(1) `componer` en fondo con reloj virtual y `producir` que devuelve 100 ms
después de vencer la señal: `liberar` se llama **una** vez, `publicar`,
`enfriar` y `renovar` **cero**; (2) el mismo caso con `ahora()` ya más allá
de `inicioRuta + MAX_DURATION_MS` al devolver: `liberar` **cero** veces,
métrica `turno liberado: no (sin margen)`; (3) `liberar` que rechaza o cuya
promesa nunca resuelve dentro del margen: un solo intento, la línea
`[home-fondo]` sale igual; (4) guard estructural: el `finally` de `componer`
en fondo pasa por una única función de limpieza con guardia por intentos.

### 49.6 Comprobado / inferido

- **Comprobado:** el RED (con detección +100 ms el `LIBERAR` sale después
  del plazo); los seis controles nuevos y los nueve anteriores; que
  `LIBERAR` es un compare-and-delete del turno propio que no toca fresca,
  UB ni generación (Etapa 2, `lib/turno-lua.ts`).
- **Inferido:** que la detección de la señal en el código real cae dentro de
  los 5 s de margen (una vuelta de event loop más la última llamada en
  vuelo, abortada por su propia señal) — no medido; si no cayera, el
  contrato ya lo cubre: cero `LIBERAR` y recuperación por TTL.

## 50. Corrección de §49 sobre `c2b72f7` — los últimos falsos verdes de la limpieza `LIBERAR` — **ESTADO VIGENTE de la 3.c (con §45-§49 y §51); NO aprobada, NO implementada; pendiente de nueva auditoría** (2026-09-17)

> **§51 corrige de aquí el punto 3:** el modelo de `7dc1f44` **nunca
> emitía `RENOVAR`**, así que "después del plazo no se inicia ningún
> `RENOVAR`" (16) era una aserción vacua, el calendario de renovaciones y
> `venceEn` los fijaba el test a mano, y ese calendario incluía una
> renovación **exactamente en el plazo** (`t <= plazo`, 155 s) mientras el
> comentario decía que no salía. Los puntos 1, 2 y 4 resistieron mutación
> y quedan como están. Las cifras "14,9 s" / "4,9-14,9 s" de 50.3 quedan
> superadas por las derivadas en §51.

Sólo documentación y tests (`lib/tmdb-pausa-diseno.test.ts`, **88/88**). Sin
código productivo, merge, push ni deploy. El contrato de §49 se conserva;
lo que cambia es que ahora está **probado de verdad** y con el borde
cerrado.

### 50.1 Punto 1 — el test (14) no probaba una segunda llamada

Evaluaba a mano `liberarIntentos >= 1` y agregaba el evento esperado.
Ahora la limpieza es **una función expuesta del modelo, `limpiarTurno`, la
misma que usa `iniciarFondo`**. **RED (ejecutado):** dos llamadas con
`sinGuardia` → **dos** `LIBERAR` enviados. **GREEN:** `iniciarFondo` (primer
pedido) + `limpiarTurno` (segundo `finally`) → **un** envío, el segundo
`omitido-ya-intentado`.

### 50.2 Punto 2 — la respuesta perdida tiene DOS resultados

`liberarPerdida: "aplicada" | "no-aplicada"`. (13b) **aplicada**: Redis
ejecutó el `DEL` → el turno ya quedó liberado aunque el proceso no lo sepa;
(13c) **no aplicada** (la petición no llegó): el turno permanece hasta
vencer por su TTL. En ambos: **sin reintento**; fresca, UB y generación
intactos. **No** se afirma que toda respuesta perdida termine en TTL: sólo
la variante no aplicada.

### 50.3 Punto 3 — el TTL con las renovaciones reales

`RENOVAR` corre cada `RENOVACION_MS = 5 s` mientras se compone y extiende
el turno `TURNO_MS = 15 s` **desde esa renovación**; la señal corta las
siguientes (ninguna se inicia después del plazo). Si `LIBERAR` no se envía,
falla o no se aplica, **el turno no tiene por qué estar vencido en el
acto**: con la última renovación exitosa poco antes del plazo (150-155 s),
al detectar la señal (155,1 s) el turno sigue del proceso y **se recupera
eventualmente** al vencer el TTL restante (4,9-14,9 s después, según el
caso modelado). **Demora máxima esperable desde la última renovación
exitosa: `TURNO_MS` = 15 s** [derivado de las constantes]; desde la
detección, ≤ 15 s − (detección − última renovación). Probado en (12),
(13a), (13c) y (16); (12) ya no afirma "ya venció".

### 50.4 Punto 4 — el borde de `maxDuration`, cerrado con comparación estricta

`LIBERAR` sólo se inicia si **`ahora < inicioRuta + MAX_DURATION_MS`**
(antes `>` para omitir, que dejaba pasar el instante exacto). **RED
(ejecutado):** con `>` el `LIBERAR` sale exactamente en `maxDuration`.
**GREEN (17):** a límite − 1 ms se envía; exactamente en el límite y a
+1 ms **no** (`omitido-sin-margen→TTL`).

### 50.5 Contrato (sin cambios respecto de §49, ahora probado)

- Después del plazo efectivo no empieza TMDB, Supabase, `RENOVAR`, `ENFRIAR`
  ni `PUBLICAR`.
- Sólo puede intentarse **una vez** `LIBERAR`, **estrictamente antes** del
  corte externo duro.
- Si no puede ejecutarse (sin margen, Redis caído, fallo, no aplicada, corte
  de Vercel), el turno se recupera **eventualmente** por TTL: a lo sumo
  15 s desde la última renovación exitosa.
- Nunca se altera el contenido del Home ni el UB (fresca, UB y generación
  intactos en todos los casos modelados).

### 50.6 RED para la implementación (se suman a 49.5)

(1) la limpieza del fondo es una única función con guardia por intentos,
llamada desde el `finally`; un test la invoca dos veces y cuenta un `DEL`;
(2) `liberar` con promesa que rechaza vs. promesa perdida: dos tests, uno
por resultado indeterminado, sin reintento; (3) reloj virtual con
renovaciones cada 5 s hasta el plazo y detección +100 ms: `RENOVAR` cero
veces después del plazo y el turno del doble de Redis vence a `última
renovación + 15 s`; (4) borde: `ahora()` = límite − 1 / límite / límite + 1.

### 50.7 Comprobado / inferido

- **Comprobado:** los dos RED (doble envío sin guardia; `>` en el borde) y
  los diecisiete controles del modelo; las constantes `TURNO_MS = 15 s` y
  `RENOVACION_MS = 5 s` (`lib/home-servir.ts`).
- **Inferido:** que la última renovación real cae ≤ 5 s antes del plazo
  (el bucle de renovación es periódico y la señal lo corta), de donde sale
  la demora máxima de 15 s desde ella.

## 51. Corrección de §50 sobre `7dc1f44` — las renovaciones las produce el MODELO, no el test — **ESTADO VIGENTE de la 3.c (con §45-§50 y §52); NO aprobada, NO implementada; pendiente de nueva auditoría** (2026-09-17)

> **§52 corrige de aquí la precisión:** el modelo fijaba `venceEn = envío +
> 15 s`, pero el `PEXPIRE` del script corre cuando **Redis atiende** el
> comando, en algún punto del RTT que el cliente no observa. Las cifras
> "5,6-10,6 s" de 51.3/51.5 no estaban demostradas: pasan a ser
> **intervalos para el RTT modelado**, rotulados como estimaciones. Lo
> garantizado sigue: 15 s desde la última renovación **aplicada**.

Sólo documentación y tests (`lib/tmdb-pausa-diseno.test.ts`, **90/90**). Sin
código productivo, merge, push ni deploy. El contrato de §49/§50 no cambia;
cambia que el punto 3 (TTL restante tras una renovación reciente) pasa a
estar **derivado por el modelo** y con el mismo borde estricto que el punto 4.

### 51.1 Estado verificado antes de tocar nada

- Worktree `wt-etapa3c`, rama `diseno/etapa3c-proteccion-tmdb`, HEAD
  `7dc1f44` (§50), **no** `c2b72f7` como decía el último informe: `c2b72f7`
  es su ancestro directo; `7dc1f44` es un commit posterior de otra sesión
  (2026-09-17 19:17 −03:00), sólo docs y este test.
- Fork point `37d4707` = `main` = `origin/main` (fetch hecho; 0/0). 13
  commits sobre `main`, todos `docs(etapa 3.c)`. Árbol limpio.
- **Ningún archivo de `medicion/sync-upcoming` en esta rama**: ausentes
  `supabase/functions/tmdb-sync/lib/medicion.ts`, `lib/sync-medicion.test.ts`,
  `lib/sync-recorrido.test.ts`, `types/deno.d.ts`, `tsconfig.functions.json`
  y `docs/medidas/2026-09-05-sync-medicion.md`. Esa rama queda en
  `a7a223d` en su worktree, **no desplegada** (ver `docs/ESTADO.md`).

### 51.2 Auditoría de §50, punto por punto (mutaciones ejecutadas)

| Punto | Mutación sobre el modelo de `7dc1f44` | Resultado |
|---|---|---|
| 1 guardia real | guardia por intentos desactivada | cae (14): 87/88 |
| 2 perdida aplicada / no aplicada | "no aplicada" tratada como aplicada | cae (13c): 87/88 |
| 4 borde `maxDuration` | `>` en lugar de `!(ahora < límite)` | cae (17): 87/88 |
| 3 TTL tras renovación | `venceEn` fijo (ignora la última renovación) | cae (12): 87/88 — **pero sólo porque el test lo fijaba a mano** |

**RED del punto 3 (ejecutado y visto fallar sobre `7dc1f44`):** "una
composición de 30 s desde 120 s (plazo 155 s) tiene que `RENOVAR` al menos
una vez" → **falla**: el modelo no tenía ningún `enviar(f, "RENOVAR", …)`;
la única aparición de `"RENOVAR"` era el tipo y la aserción de (16). O sea
que (16) afirmaba "ningún `RENOVAR` después del plazo" sobre un fondo que
no renovaba ni antes ni después; el calendario `[125 … 155]` lo armaba el
test con `t <= plazo` (una renovación **en** el plazo, contradiciendo su
propio comentario "la de 155 no sale" y el criterio estricto de §50.4), y
`venceEn = 170 s` salía de esa renovación inexistente.

### 51.3 GREEN: el bucle 4b real, en el modelo

`renovarMientrasCompone` reproduce `lib/home-servir.ts` 4b, que es el
mismo bucle que corre el fondo (el camino UB-primero llama a
`componer(senalFondo)`):

```
while (!fin) { await dormir(RENOVACION_MS); if (fin || abortada(señal)) return; await renovar(px: TURNO_MS) }
```

- Primer tick a `inicioFondo + 5 s`; los siguientes cada `5 s + RTT`
  (el sueño arranca cuando la renovación anterior completó).
- Un tick sólo envía con **`t < plazoEfectivo`** (estricto: la señal vence
  en el plazo; a esa altura `abortada(señal)` ya es verdadera). Un tick que
  despierta con la señal vencida no envía y deja el evento
  `RENOVAR:no-enviado@…:señal-vencida`.
- Cada `RENOVAR` aplicado extiende el turno a **`t + TURNO_MS`** desde esa
  renovación (`PX` del script), sólo si el propietario sigue siendo el
  proceso.
- El bucle termina con la composición o con el corte duro. El vencimiento
  inicial del turno es `tomar + 15 s` (el turno se toma instantes antes de
  que el fondo arranque detrás de la compuerta).

Los tests **derivan** el TTL restante del modelo (`ttlRestante`): `venceEn
= últimaRenovación + TURNO_MS` y `restante = TURNO_MS − (detección −
últimaRenovación)`, y recién después fijan la cifra.

| # | Caso (fondo a 120 s, plazo efectivo 155 s) | Renovaciones enviadas | `venceEn` | TTL restante |
|---|---|---|---|---|
| 16 | RTT 0, detección 155,1 s | 125, 130, 135, 140, 145, 150 s; **155 s no sale** | 165 s | 9,9 s |
| 16 | RTT 140 ms, detección 155,1 s | 125,00 / 130,14 / 135,28 / 140,42 / 145,56 / 150,70 s | 165,7 s | 10,6 s |
| 12 | RTT 140 ms, detección 160,1 s (sin margen: cero `LIBERAR`) | ídem | 165,7 s | 5,6 s |
| 13a / 13c | `LIBERAR` falla / perdida no aplicada, detección 155,1 s | ídem | 165,7 s | 10,6 s |
| 16b | sin composición, o composición < 5 s | ninguna | `tomar + 15 s` | — |
| 15 | RTT 1,5 s, publica a 153,9 s | 125 / 131,5 / 138 / 144,5 / 151 s, todas antes del `PUBLICAR` | — | — |

**RED de borde (control, conservado):** con `renovarEnElPlazo` (`t <=
plazo`) y RTT 0 salen **siete** renovaciones y la última es exactamente en
155 s = plazo → viola "ningún `RENOVAR` después del plazo". GREEN: seis.

(4) y (10) pasan a exigir **`enviadaEn < plazo`** para toda operación
productiva (antes `<=`), coherente con §50.4, y (4) exige además que las
renovaciones anteriores al plazo **existan**: la aserción ya no puede ser
vacua.

### 51.4 Mutaciones sobre el modelo nuevo (todas caen)

| Mutación | Cae |
|---|---|
| M1 guardia por intentos desactivada | (14) |
| M2 borde `LIBERAR` con `>` | (17) |
| M3 perdida no aplicada tratada como aplicada | (13c) |
| M5 el bucle renueva también con `t == plazo` | (16) |
| **M6 el bucle no renueva nunca (= modelo de `7dc1f44`)** | (4), (12), (13a), (13c), (15), (16) y el RED de borde: **7** |
| M7 `RENOVAR` no extiende el turno (`PX` ignorado) | (12), (13a), (13c), (16) |
| M8 la renovación ignora la señal | (4), (10), (12), (13a), (13c), (16) |
| M9 primer tick en `t0`, sin dormir | 7 tests |

### 51.5 Contrato (sin cambios de fondo; cifras corregidas)

- Después del plazo efectivo no se inicia TMDB, Supabase, `RENOVAR`,
  `ENFRIAR` ni `PUBLICAR`; **"después" incluye el instante del plazo**
  (estricto, igual que el corte externo para `LIBERAR`).
- Si `LIBERAR` no se envía, falla o no se aplica, el turno se recupera
  **eventualmente**: a lo sumo `TURNO_MS` = 15 s desde la última renovación
  exitosa, que cae a lo sumo `RENOVACION_MS + RTT` antes del plazo; desde
  la detección, `15 s − (detección − última renovación)`. En los casos
  modelados: **5,6 s a 10,6 s** (antes se decía 4,9-14,9 s, con una
  renovación en el plazo que no existe).

### 51.6 RED para la implementación (reemplaza 50.6 (3))

(3) reloj virtual con el `componer` real y un doble de `renovar` que
registra `(t, px)`: renovaciones a `t0 + 5 s`, luego cada `5 s + RTT`,
**ninguna con `t ≥ plazo`**; el doble de Redis vence a `última + 15 s`; la
detección a plazo + 100 ms deja un TTL restante igual a `15 s − (detección
− última)`; y un caso con RTT 0 cuyo tick cae exactamente en el plazo, que
debe **no** enviarse.

### 51.7 Comprobado / inferido / pendiente

- **Comprobado:** el RED de vacuidad sobre `7dc1f44` (ejecutado, falló);
  los 90 controles; las 8 mutaciones; que el fondo pasa por `componer` y
  por lo tanto por el bucle 4b (`home-servir.ts`, camino `adquirido` con
  UB); que 4b duerme antes de renovar y no envía con la señal vencida;
  `tsc --noEmit` 0 errores.
- **Inferido:** que en el runtime, con un tick y el vencimiento de la señal
  en el mismo milisegundo, `abortada(señal)` ya es verdadera cuando el
  sueño despierta (el `AbortSignal.timeout` se registró antes que ese
  sueño). El modelo lo toma como estricto; si no fuera así, saldría una
  renovación más y la cota de 15 s desde ella sigue valiendo.
- **No modelado:** `perdido` / `indeterminado` del script de `RENOVAR`.
- **Pendiente:** nueva auditoría de 3.c.1 sobre este estado. Sin
  implementación.

## 52. Corrección de §51 sobre `105e440` — envío, aplicación en Redis y recepción son TRES instantes — **diseño APROBADO por el dueño el 2026-09-18 (§45-§52); IMPLEMENTADO en `feat/etapa3c1-pausa-tmdb` (§53); pendiente de auditoría de Codex** (2026-09-17)

Sólo documentación y tests (`lib/tmdb-pausa-diseno.test.ts`, **97/97**). Sin
código productivo, merge, push ni deploy. El contrato no cambia; cambia qué
cifras se afirman y con qué rótulo.

### 52.1 El problema

§51 fijaba `venceEn = enviadaEn + TURNO_MS`. El script real
(`lib/turno-lua.ts`, `RENOVAR`: `GET == propietario → PEXPIRE`) ejecuta el
`PEXPIRE` **cuando Redis atiende el comando**, en algún punto entre el
envío y la respuesta; el cliente sólo ve el envío y la recepción. Al mismo
tiempo el modelo usaba el RTT para programar la vuelta siguiente. Con eso,
"5,6-10,6 s" eran cifras exactas de un instante que el modelo no
representaba.

**RED (ejecutado sobre `105e440`, visto fallar):** "la operación registra
cuándo Redis la aplicó, y con Redis aplicando al final del RTT el turno
vence más tarde que aplicando al comienzo" → falla: `OpRedis` no tenía
`aplicadaEn` y `venceEn` era el mismo en los dos casos. Queda como control
en el archivo.

### 52.2 El modelo

`OpRedis` lleva `enviadaEn`, **`aplicadaEn`** (null si no se aplicó) y
`completaEn` (respuesta recibida, o el cliente se rindió). Entradas nuevas
de `FondoMundo`:

- `aplicacionRedisMs` — dónde dentro del RTT ejecuta Redis (0 = al recibir
  el comando; `= rtt` = justo antes de responder). **Desconocido en la
  realidad**: los tests barren los extremos y el medio.
- `renovacionesPerdidas` — ticks cuya respuesta se pierde (`indeterminado`
  en `lib/turno.ts`), con la verdad de Redis: `aplicada` / `no-aplicada`.
- `demoraFalloMs` — cuánto tarda el cliente en rendirse (el SDK reintenta;
  su backoff exacto no se modela).
- `cliente: { venceEnMin, venceEnMax | null }` — lo que el **proceso**
  puede afirmar con lo que recibió.

Reglas: un `RENOVAR` aplicado extiende el turno a **`aplicadaEn + 15 s`**;
con respuesta recibida el cliente acota `[enviadaEn + 15 s, completaEn +
15 s]`; con respuesta perdida conserva el mínimo anterior y **pierde la
cota superior** (`null`); la vuelta siguiente se programa en **`completaEn
+ 5 s`** (el bucle real duerme después de que `renovar` resolvió, con
respuesta o con excepción); ningún envío con `t ≥ plazoEfectivo`.

### 52.3 Casos (fondo a 120 s, plazo efectivo 155 s, detección 155,1 s salvo (12))

| # | Caso | Resultado |
|---|---|---|
| RED | `venceEn = envío + 15 s` | refutado: con aplicación al final del RTT vence 140 ms más tarde |
| 18a | Redis aplica al comienzo del RTT | `venceEn = envío + 15 s`; cliente `[165,7; 165,84]` s; la verdad en el extremo inferior |
| 18b | Redis aplica justo antes de responder | `venceEn = recepción + 15 s`; mismo intervalo del cliente; la verdad en el extremo superior; **el calendario de envíos no cambia** (depende de cuándo vuelve la respuesta) |
| 18c | respuesta exitosa, aplicación en 7 puntos del RTT | la verdad siempre en `[envío + 15 s, recepción + 15 s]`; ancho = RTT de esa renovación; con RTT 1 s el intervalo es otro (el RTT modelado no es cota) |
| 18d | respuesta perdida, `aplicada` / `no-aplicada` × aplicación al comienzo / al final | cliente: `venceEnMax = null`, `venceEnMin` = el de la última respuesta recibida (5.º RENOVAR); Redis: aplicada → 15 s desde ESA aplicación (que el cliente no conoce); no aplicada → 15 s desde la aplicación anterior; en ambos, turno del proceso y recuperación eventual |
| 18e | vuelta siguiente al terminar la anterior | respuesta perdida con 1 s de rendición → los ticks siguientes se corren +860 ms; RTT 1,5 s → cinco renovaciones a 6,5 s de intervalo |
| 18f | ningún `RENOVAR` en el plazo ni después | RTT 0 / 140 / 1 000 / 4 290 ms × aplicación al comienzo / al final × con y sin pérdida: todos los envíos `< plazo` |
| 12, 13a, 13c, 16 | cifras | reescritas como intervalos (abajo) |

### 52.4 Cifras: qué se garantiza y qué es estimación

**Garantizado (independiente del RTT):**

- Si una renovación fue **aplicada**, el turno vence **15 s después de esa
  aplicación** (`venceEn = aplicadaEn + TURNO_MS`, probado en todos los
  casos).
- Si `LIBERAR` no se aplica (sin margen, fallo, perdida no aplicada, corte
  de Vercel), la recuperación es **eventual por TTL**.
- Con respuesta recibida, la verdad cae en `[envío + 15 s, recepción + 15
  s]`; con respuesta **indeterminada, el cliente no conoce el restante
  exacto** (sin cota superior).

**Estimación para el RTT modelado (140 ms, constante), según dónde dentro
del RTT ejecute Redis — no una cota, y otro RTT da otro intervalo:**

| Caso | Restante desde la detección |
|---|---|
| detección 155,1 s (13a, 13c, 16) | **[10,60; 10,74] s** |
| detección 160,1 s (12) | **[5,60; 5,74] s** |
| RTT 0 (16, control aritmético) | 9,9 s exacto, sólo porque envío y aplicación coinciden |

Las cifras "5,6-10,6 s" de §51 quedan superadas: eran el extremo inferior
presentado como valor exacto.

### 52.5 RED para la implementación (reemplaza 51.6 (3))

(3) reloj virtual con el `componer` real y un doble de Redis que registra
**tres** instantes por comando (recepción del comando, ejecución del
script, envío de la respuesta), con la ejecución colocable en cualquier
punto: renovaciones a `t0 + 5 s` y luego `respuesta anterior + 5 s`,
ninguna con `t ≥ plazo`; el doble vence a `última ejecución + 15 s`; una
respuesta perdida deja al cliente sin cota superior y la implementación
**no** la usa para decidir nada (§48: un `indeterminado` nunca habilita una
operación insegura); un caso con RTT 0 cuyo tick cae en el plazo, que debe
no enviarse.

### 52.6 Mutaciones (todas caen)

| Mutación | Cae |
|---|---|
| MA aplicación = envío (ignora dónde ejecuta Redis) | RED, (12), (13a), (13c), (16), (18b), (18c) |
| MB `venceEn` desde el envío | ídem + (18d) |
| MC respuesta perdida conserva la cota superior | (18d) |
| MD vuelta siguiente desde el envío, no desde el fin de la anterior | (18e) |
| ME perdida no aplicada tratada como aplicada | (18d) |
| MF renueva también con `t == plazo` | (16), (18f) |

### 52.7 Comprobado / inferido / no modelado

- **Comprobado:** el RED sobre `105e440`; los 97 controles; las 6
  mutaciones; `tsc --noEmit` 0 errores; `git diff --check` limpio; que
  `RENOVAR` es `GET == propietario → PEXPIRE` en `lib/turno-lua.ts` y que
  `lib/turno.ts` devuelve `indeterminado` ante excepción y `perdido` sólo
  ante el 0 del script; que el bucle 4b duerme después de que `renovar`
  resolvió.
- **Inferido:** que en Upstash el instante de ejecución cae dentro del RTT
  medido por el cliente (no hay cola que lo retrase más allá de la
  respuesta): es lo que hace que `[envío, recepción]` sea el intervalo
  correcto para una respuesta recibida.
- **No modelado:** `perdido` del script (turno ajeno); el backoff real del
  SDK (se reemplaza por `demoraFalloMs`); variación del RTT entre
  renovaciones (constante por escenario).
- **Estado:** 3.c.1 **no implementada, pendiente de aprobación final**.

## 53. Implementación de la 3.c.1 sobre `aac70e7` (diseño §45-§52 aprobado por el dueño el 2026-09-18) — **IMPLEMENTADA en `feat/etapa3c1-pausa-tmdb`; corregida por §54 tras la auditoría de Codex sobre `6fc63b5`; NO mergeada, NO pusheada, NO desplegada; pendiente de nueva auditoría** (2026-09-18)

> **§54 corrige de aquí:** (1) con pausa local vigente el pedido esperaba los
> reintentos del SDK de Redis (23 s → 3 s); (2) `tmdb:cubos` crecía sin tope;
> (3) dos `TIME` por evento podían separar `429` de `pausas`; (4) **el
> Preview de 53.3 usó el Redis de Producción** (las frases "aislado" y "sin
> Producción" de 53.3/53.5 son falsas en ese punto; `DBSIZE` 802 → 90 no
> explicado); (5) tres tests dependían de la carga y el reloj de pared.

Rama `feat/etapa3c1-pausa-tmdb`, worktree `wt-etapa3c1`, creada desde
`aac70e7` (el diseño y sus RED, sobre `main` = `37d4707`). Alcance
**exclusivo**: la 3.c.1 de §45-§52. Fuera: 3.c.2, limitador de tasa fija,
cadencias, membresía por pool, reintentos de TMDB (siguen apagados), cambios
en `tmdb-sync`, selección del Home.

### 53.1 Estado verificado antes de empezar

`diseno/etapa3c-proteccion-tmdb` en `aac70e7`, árbol limpio, fork point
`37d4707` = `origin/main`. `main` local tenía un commit posterior de otra
sesión (`0c13036`, sólo un plan de salas compartidas, sin push): no se tocó
y no forma parte de esta rama. `medicion/sync-upcoming` sigue en `a7a223d`,
árbol limpio, **nunca pusheada** (0 ramas remotas), sin desplegar; ninguno
de sus archivos está en esta rama (comprobado por ausencia al crear el
worktree).

### 53.2 Qué se implementó (TDD: cada módulo con su test escrito antes y visto fallar)

| Pieza | Archivo | Test (RED visto fallar) |
|---|---|---|
| Los cuatro scripts Lua de la pausa: `TOMAR` (pausa dentro de la adquisición, §40.5), `PAUSAR` v3 (validar → EXISTS ev → GET proc → PTTL → SET pausa → SET proc → SET ev → `pcall` telemetría con `TIME`/`cjson`, §43.10), `CUBO`, `SALUD` | `lib/pausa-lua.ts` | `lib/pausa-memoria.test.ts` (12) |
| La misma semántica emulada en memoria (producción sin Redis, tests, doble del banco) | `lib/turno-memoria.ts` | ídem |
| `crearTurno(ops, { pausa })` → `pausado(restanteMs)`; respuesta del script VALIDADA (formas raras = fallo de transporte, nunca adquirido ni pausado); sin `pausa` = SET NX de la Etapa 2 | `lib/turno.ts` | `lib/turno.test.ts` (+7) |
| La pausa del proceso: nivel 1 local en el acto; PAUSAR serializado (uno en vuelo, los 429 que llegan mientras tanto se funden con el `Retry-After` mayor, §41.3), id `<uuid>:<contador>`; lector no bloqueante sólo por `Δt = 1 s` desde el inicio de la anterior, una en vuelo, `F_max = 1` → 30 s de enfriamiento, `pausaNoLeida`; kill switch `TMDB_PAUSA_429=0` | `lib/tmdb-pausa.ts` | `lib/tmdb-pausa.test.ts` (14; 7 mutaciones caen) |
| La secuencia: `pausado` con UB → UB en el acto; sin UB → un solo sueño `min(restante, 5 s)` + jitter si cabe en `plazo − ahora − (jitter + T_ADQ)` (§43.4), UNA readquisición con timeout 2 s (carrera; si adquiere tarde, se libera), `503` por vacío `pausa` / `pausa-indeterminada` (`max(5 s, restante − dormido)`, §43.5) / `presupuesto-insuficiente`; vencimiento durante el sueño → centinela 4d; precedencia local sobre Redis caído (§43.3); plazo absoluto (§46) también en el rescate de la espera compartida; fondo con `plazosDelFondo` = min(interno, externo) y `fondo no-iniciado-presupuesto` (§47); RENOVAR nunca en el plazo ni después; PUBLICAR sólo con la reserva; 4d también por plazo (sin señal); 4d' pausa al volver **o llamadas rechazadas durante la composición** → LIBERAR, nunca ENFRIAR; `crearLimpieza`: un solo LIBERAR, `ahora < inicioRuta + maxDuration` estricto, best effort (§49-§50) | `lib/home-servir.ts` | `lib/home-servir.test.ts` (+23; 15 mutaciones caen) |
| Métricas: turno `pausado`, origen `ultimo-bueno-pausa`/`vacio-pausa`, `pausaMs`, `pausaEsperaMs`, `liberacion`, `renovacionUltima { envioMs, respuestaMs }` (§52: el PEXPIRE corre entre ambos; ningún restante exacto), `fondo no-iniciado-presupuesto`; `PUBLICACION_MAX_MS` → `RESERVA_PUBLICACION_MS` | `lib/metricas.ts` | (línea `[home]` cubierta por los tests existentes) |
| 503 + `Retry-After` para los finales de la pausa (cuerpo `{ error: tmdb-no-disponible, motivo, reintentarEnMs }`, el que el cliente ya reconoce, §41.5); los vacíos de la Etapa 2 siguen 200 | `lib/home-http.ts` | `lib/home-http.test.ts` (4) |
| `/api/health`: sólo agregados (`pausaVigenteMs`, 60 min de `429`/`pausas`/`yaMayor`/`yaAplicada`/`pausaNoLeida`/`pausadosUB`/`pausados503`), forma validada, `null` si no se pudo leer (nunca ceros) | `lib/pausa-salud.ts`, `app/api/health/route.ts` | `lib/pausa-salud.test.ts` (3) |
| Cableado: `lib/cache.ts` (TOMAR y las cuatro primitivas; **cliente aparte para el lector** con `signal: () => AbortSignal.timeout(1 s)` y `retries: 0`; `pausaTmdb` por proceso), `lib/tmdb.ts` (429 → `registrar429`; con pausa local vigente la llamada no sale del semáforo: `ErrorTmdb` clase `rechazada`, métrica `rechazadas`; `permiso()` tras cada permiso concedido), `lib/home.ts` (plazo creado con la señal ANTES de la lectura previa; `plazosDelFondo` y señal del fondo de `plazoEfectivo − inicioFondo`; `pausa`, `plazo`, `inicioRuta` y `pausada` en las deps; `vacio` con `reintentarEnMs`), `app/api/home/route.ts` | — | `lib/etapa3c1-cableado.test.ts` (11, guard estructural) |
| Doble de Redis del banco: los cuatro scripts por texto, delegando en la emulación | `scripts/banco/dobles.mjs` | ídem |

Desvíos respecto del texto del diseño, decididos al implementar y para la
auditoría: (a) las llamadas que la pausa no deja salir se cuentan en
**`rechazadas`** (la métrica que `lib/metricas.ts` ya declaraba para "circuito
abierto o pausa") y no en `canceladas.enCola` como decía §39.5; (b) tope
**`PAUSA_MAX_MS = 60 s`** [propuesto] a un `Retry-After` desmedido; (c) el
timeout de la readquisición es una **carrera** local (`T_ADQ_MAX_MS`), no una
señal del SDK (que sólo acepta una señal por cliente); si la adquisición
responde después y adquirió, se libera; (d) **`pausada`**: hallazgo del banco
(53.5, S3-B) — una composición con llamadas rechazadas por la pausa se
cancela aunque la pausa haya vencido al devolver, con `Retry-After` mínimo de
1 s; (e) la familia del evento es el path sin ids (`/movie/:id`), nunca la
URL con parámetros; (f) la línea `[home-fondo]` agrega `plazo interno|externo
+Nms desde la ruta`.

### 53.3 Precondición del Lua real en Upstash (Preview descartable, ejecutada)

Rama descartable `tmp/etapa3c1-precondicion-upstash` (desde esta rama) con una
sola ruta temporal, subida con `vercel deploy` (Preview protegido por Vercel
Authentication + secreto propio comparado en tiempo constante contra
`CRON_SECRET`; sin encabezado → 401, equivocado → 401; anónimo → 302 al
login), corrida por `vercel curl` con `MSYS_NO_PATHCONV=1`. **36 pasos, 36
correctos** —
[`2026-09-18-etapa3c1-precondicion-upstash.json`](2026-09-18-etapa3c1-precondicion-upstash.json),
código exacto en
[`…precondicion-upstash.route.ts.txt`](2026-09-18-etapa3c1-precondicion-upstash.route.ts.txt):
`TIME`, `cjson.encode`, `pcall` con función local y `PTTL` dentro de scripts;
TOMAR `['adquirido']` / `['ocupado','A']` / `['pausado', n]` sin adquirir;
PAUSAR `['escrito', 3000]`, marcador PX 119.762, proc PX 24 h, reintento del
mismo id `['ya-aplicada', n]` sin extender, más corto `['ya-mayor', n]`, más
largo `['escrito', 8000]`, contador viejo `['ya-aplicada']`, `ms` inválido →
`ERR PAUSAR: argumentos invalidos` sin mutar; 3 eventos y los cubos exactos;
CUBO y SALUD `[7068, 3, 2, 1, 2, 0, 1, 0]`; EVALSHA (NOSCRIPT → EVAL →
EVALSHA); y **las primitivas de producción** (`opsTurnoHome.evalTomar`,
`crearTurno(opsTurnoHome, { pausa }).tomar`, `opsPausaHome.pttl` por el
cliente lector aparte, `opsPausaHome.evalSalud`). Latencia por comando:
mediana 119 ms (114-351, n = 33). Claves `precond-etapa3c1:<corrida>:*`
(TTL ≤ 60 s) borradas: `SCAN` 0 antes y después. **Dos hechos del SDK que
la implementación ya contempla:** deserializa solo el JSON (el `cjson` y el
`LINDEX` vuelven como objetos) y `PTTL` viaja como número. **Observado y NO
explicado (§54.4):** durante la primera corrida `DBSIZE` pasó de 802 a 90 y
quedó estable en 90 en las dos siguientes; la ruta sólo hace `DEL` de sus
claves prefijadas (devolvió 8 = las existentes). ~~La causa inferida es el
vencimiento de un lote~~ — sin evidencia; no se atribuye a nada. **Y el
Preview NO estaba aislado del Redis de Producción:** `KV_*` es una sola
entrada con ámbito "Production, Preview" (§54.4); esta corrida fue una
operación accidental sobre el Redis de Producción, acotada a claves
prefijadas y borradas. Limpieza
ejecutada: los dos deployments borrados (`vercel remove`; `inspect` del
segundo: "Can't find the deployment"), `app.yump.ar` siguió en
`dpl_8BzaaFazZuKeppma2RqQ9ZSRFgM5` (Producción) antes y después, worktree,
rama y archivo de variables borrados.

### 53.4 Identidad del Home y umbrales del camino sano (criterios 1-3)

`comparar-home` entre `37d4707` (worktree `wt-etapa3c1-antes`, build con el
entorno del banco) y esta rama, cachés aisladas —
[`2026-09-18-etapa3c1-identidad-home.json`](2026-09-18-etapa3c1-identidad-home.json):
**16/16 escenarios válidos e idénticos** (JSON completo: hero, rieles, ids,
orden, cantidades, plataformas, enlaces, toggles), llamadas a TMDB iguales en
los 15 fríos (926 … 1082) y en el concurrente (2059 = 2059), control de
mutaciones 4/4 detectadas, control compartido rechazado. Umbrales
(`etapa3c1-umbrales.mjs`, 3 semillas, modelo `prod-3b`) —
[`2026-09-18-etapa3c1-umbrales.json`](2026-09-18-etapa3c1-umbrales.json):

| Medida | Umbral | Medido | |
|---|---|---|---|
| llamadas a TMDB | 0 de diferencia | frío 926 = 926 ×3; fondo 1 = 1 ×3 | ✔ |
| operaciones de Redis adicionales | ≤ ⌈926/24⌉ + 2 = 41; fondo ≤ 3 | frío +28 / +24 / +26 (el lector: ~1/s); fondo +1 | ✔ |
| duración | mediana ≤ +5 %, ninguna > +10 % | frío 31.544 → 31.201 ms (−1,1 %); fondo 3.847 → 3.844; peor repetición +5,1 % (fondo, semilla 22) | ✔ |
| publicación | ≤ +1 operación | +1 EVAL: `TOMAR` reemplaza al `SET NX` (mismo número de operaciones de adquisición); PUBLICAR sin cambios | ✔ |
| respuesta del UB con fondo | ≤ +50 ms | 275 → 241 ms (mediana) | ✔ |

### 53.5 Escenarios con 429 (criterios 4-7), tres procesos + control con el kill switch

`etapa3c1-pausa.mjs` —
[`2026-09-18-etapa3c1-banco.json`](2026-09-18-etapa3c1-banco.json). Modelo
`prod-3b`, semilla 11; A/B/C con la pausa, D con `TMDB_PAUSA_429=0`.

| Escenario | Resultado |
|---|---|
| S0 sano, frío | 200, MISS, publicado, 0 rechazadas, 0 PAUSAR, cubos vacíos |
| S1 429 total a los 4 s de un frío sin UB | **503 `pausa`**, Retry-After 1, 0 contenido, 8,0 s de pared; 37 x429 propios, 775 rechazadas; **77 llamadas tras el primer 429** (control D sin pausa: **858**; línea base §44.3: 750-778); fresca, UB y degradado NO escritos; turno liberado |
| S1b pedido durante la pausa, sin UB, TMDB sano | TOMAR `pausado` 354 ms → duerme 466 ms → compone → **200 con contenido** (28,3 s de pared = la composición) |
| S1c pausa larga (Retry-After 12 s), sin UB | **503 en 317 ms**, Retry-After 9, `PAUSA 8047ms`, 0 composiciones, sin dormir |
| S2 429 total con UB (fondo largo) | **UB en 284 ms**, byte a byte igual; el fondo: `ultimo-bueno-pausa`, CANCELADA, publicación no, 77-92 llamadas tras el 429; fresca y degradado NO escritos |
| S2b pedido durante la pausa, con UB | TOMAR `pausado` → **UB en 317 ms**, 0 composiciones, 0 llamadas |
| S3 propagación real (429 sólo en `/discover/tv` de Crunchyroll: A `cr`; B `n,d` componiendo; C `d,m` frío) | A: 11 x429 → escribe la pausa → 503; **B: 0 x429 propios, 608 rechazadas por el lector** → 503 `pausa` (antes del hallazgo 53.2(d): 200 `degradado-propio` con 548 descartes — corregido); **C: `pausado` 940 ms → duerme 1.018 ms → compone → 200** con 0 x429 |
| S4a Redis lento (300 ms) + 429 | 503 `pausa`; lector: 10 lecturas en 25 s (≤ 1/s); sobrepaso 166 en 19,7 s (pico 24/s = `enVuelo`) |
| S4b Redis caído + 429 (Retry-After 20) | primer pedido: `sin-redis`, compone sin turno como hoy, 190 llamadas (4 x429, resto rechazadas), 200 degradado en **74,9 s** — la promesa reducida de la Etapa 2 (cada lectura del caché reintenta 6× con 4,3 s), no la 3.c.1; **segundo pedido a los 5 s, otra clave: `pausado` por la pausa LOCAL 15,2 s → 503 en 23,1 s sin componer** (§43.3; los 23 s son los reintentos del SDK en TOMAR/GET); en la ventana: **1 PTTL** (lector), 42 EVALSHA (reintentos del SDK de TOMAR/PAUSAR/CUBO), MGET/SET del caché de siempre |
| S5 tres procesos fríos + 429 total | 503/503/503; **231 llamadas globales tras el primer 429** (≈ 77 por proceso); nada escrito; `/api/health`: 429 34, pausas 30, yaMayor 4, pausados503 3 |
| S6 CONTROL kill switch (D) | 200 `degradado-propio` con 845 descartes, ENFRIAR escrito, **858 llamadas tras el 429**, pico 224/s: el comportamiento de hoy |
| `/api/health` | sólo agregados; sin uuid, familia, eventos ni ids |

Criterios evaluados con lo medido (`criterios` del JSON): **4** ✔ (nada
publicado ni enfriado tras un 429 en S1, S2, S5), **5** ✔ (UB en 284 y 317
ms), **6** ✔ (503 con Retry-After y 0 contenido en S1/S1c; 200 con
contenido en S1b; ninguna espera de 50 s), **7** ✔ (lecturas 10 y 1; 503 sin
componer con Redis caído), **propagación** ✔. **8** ✔: ninguna prueba usa
credenciales ni cachés de Producción (dobles, `entorno.sh`, `YUMP_BANCO=1`;
el único contacto con Upstash fue la precondición de 53.3, que —corregido en
§54.4— corrió sobre el Redis de Producción con claves prefijadas y borradas).

### 53.6 Verificación final

Suite completa **1868/1868** (`npm test`), `tsc --noEmit` 0 errores, build
fresco (`.next` borrado, sin el entorno del banco) exit 0, `git diff
--check` limpio. Commits de la rama: `46b3c40` (Lua + emulación + TOMAR),
`25a4be8` (`tmdb-pausa.ts`), `747a4b8` (`servirConTurno`), `8927cab`
(cableado), `f2f4edf` (precondición), `e6bd630` (banco + hallazgo `pausada`).

### 53.7 Comprobado / inferido / desconocido

- **Comprobado:** todo lo de 53.2-53.6; que el Lua corre en Upstash con la
  forma esperada vía SDK; que el banco reproduce el corte (77 vs 858).
- **Inferido:** que `MARGEN_CIERRE_MS = 5 s`, `ESPERA_PAUSA_MAX_MS = 5 s`,
  `T_ADQ_MAX_MS = 2 s` y `PAUSA_MAX_MS = 60 s` son valores razonables
  (propuestos, sin datos de Producción: 0 × 429 vistos). ~~Que el `DBSIZE`
  802 → 90 fue vencimiento de un lote~~ — retirado (§54.4: sin evidencia).
- **Desconocido:** la cadencia y el `Retry-After` reales de TMDB en un 429
  de Producción; el RTT p95 de Upstash desde `iad1`; la precisión del corte
  de Vercel a `maxDuration`.
- **Pendiente:** auditoría de Codex sobre `feat/etapa3c1-pausa-tmdb`; merge,
  push y deploy sólo con autorización del dueño; tras el deploy, la
  observación pasiva de `/api/health` (condición de rollback: pausas > 0 con
  429 = 0, o pausados503 > 0 con 429 = 0 → `TMDB_PAUSA_429=0` + redeploy, que
  se aplica en el deployment siguiente).

## 54. Corrección de §53 tras la auditoría de Codex sobre `6fc63b5` (cinco puntos) — **IMPLEMENTADA en `feat/etapa3c1-pausa-tmdb` @ `cb0c3d1`+docs (`d322282`); el punto 1 fue CORREGIDO otra vez por §55 (`conTope` no cancelaba); NO mergeada, NO pusheada, NO desplegada** (2026-09-18)

> **§55 corrige de aquí:** el tope de §54.1 era una carrera (`conTope`) que
> respondía a tiempo pero dejaba el MGET del cliente principal reintentando
> después del 503. Lo que sigue queda como antecedente; el mecanismo vigente
> es el lector acotado de §55.2.

Estado verificado antes de tocar: rama `feat/etapa3c1-pausa-tmdb` @ `6fc63b5`,
árbol limpio, fork `37d4707` = `origin/main`, 0 ramas remotas; `main` local
avanzó por otra sesión (`34e4637`, salas compartidas, sin push) y su worktree
tiene cambios ajenos: no se tocaron. Ninguna prueba usó Producción.

### 54.1 Punto 1 — pausa local con Redis lento o caído (RED → GREEN)

**El defecto:** con la pausa LOCAL vigente el pedido igual pagaba los 6
reintentos del SDK (4,3 s de backoff) en la lectura previa del vuelo, en la
fresca, en el UB y en TOMAR (banco anterior: 23,1 s hasta el 503). **RED
(visto fallar):** pausa local 8 s + lecturas y TOMAR que nunca responden →
la secuencia esperaba a Redis; Redis lento 20 s → ídem; la pausa que nace
ENTRE la primera lectura y la segunda → la segunda esperaba. **GREEN:**
`lib/lectura-acotada.ts` (`conTope`: lo que no llega en `ms` es `null`, un
rechazo también, la respuesta tardía se ignora; `dormir` inyectable);
`servirConTurno` lee fresca y `[UB, degradado]` con tope
`T_LECTURA_PAUSA_MS = 1 s` cuando la pausa local rige **al momento de cada
lectura**, no toma el turno (nada que componer) y responde `pausado` con el
restante FRESCO; sin UB, la espera breve y la ÚNICA readquisición con su
timeout de siempre; `lib/home.ts` acota igual la lectura previa del vuelo
(sólo con pausa local vigente: el camino sano no pasa por ahí). **Límite
explícito del recorrido:** con UB, 3 lecturas acotadas ≈ 3 s; sin UB, 3 s +
`min(restante, 5 s)` + jitter + `T_ADQ_MAX` 2 s ≈ 10,25 s. Tests:
`home-servir.test.ts` (+5), `lectura-acotada.test.ts` (3), guard de cableado.
**Medido en el banco (recorrido HTTP completo, S4b):** Redis caído + 429 con
`Retry-After` 20 s; el segundo pedido sale recién cuando el proceso vio su
primer 429 (`pausaConocidaAlPedir: true`): **503 `pausa` en 3.036 ms** (antes
23.100-23.700 ms), 2 lecturas acotadas, 0 composiciones, 0 TMDB, `PAUSA
18950ms`. Lo que NO cambia: el primer pedido, que entra sin pausa con Redis
caído, sigue en la promesa reducida de la Etapa 2 (74,9-75,5 s: `sin-redis`,
compone sin turno, 190 llamadas, 4 x429) — no es la 3.c.1 y queda como límite
documentado. Redis sano con pausa local: fresca → HIT, UB → UB sin componer;
camino sin pausa intacto (control).

### 54.2 Punto 2 — telemetría acotada (RED → GREEN)

`tmdb:cubos` era un hash con un campo por minuto sin poda. **RED (visto
fallar):** 500 minutos con eventos → 1.500 campos. **GREEN:** un **ring** de
`RING_CUBOS = 120` slots (`minuto % 120`) dentro de la MISMA clave declarada:
`<slot>:m` guarda el minuto y `<slot>:<campo>` los contadores; al escribir en
un slot de otro minuto se lo limpia (`HDEL`) en el mismo script; SALUD hace UN
`HGETALL` acotado (≤ 8 × 120 = 960 campos) y suma sólo los slots cuyo minuto
cae en la ventana. Probado: 500 minutos → ≤ 960 campos; la ventana de 60
minutos suma exactamente (59 con eventos + el actual vacío) y 30 minutos
después, 29; ninguna clave se construye dentro de un script; SALUD sin uuid,
ids, rutas ni eventos. Mutación (slot reciclado sin limpiar) cae.

### 54.3 Punto 3 — un solo reloj de Redis por evento (RED → GREEN)

**RED (visto fallar):** con un reloj que avanza 1 ms por lectura, un PAUSAR
que arranca 4 ms antes del cambio de minuto dejaba `429` en el minuto 100 y
`pausas` en el 101 — la condición de rollback, producida por el instrumento.
**GREEN:** PAUSAR lee `TIME` una sola vez (en `pcall`) y ese minuto e instante
sellan `429`, `pausas`/`ya-mayor`, `ya-aplicada` y el evento; barrido de
arranques a 1..16 ms del borde: siempre juntos, y el evento en el mismo
minuto. La emulación en memoria hace lo mismo (`tiempoRedis()` una vez).

### 54.4 Punto 4 — aislamiento del Preview: corrección de §53.3

**Comprobado:** `vercel env ls` muestra `KV_REST_API_URL` y
`KV_REST_API_TOKEN` como UNA entrada (`Secret`) con ámbito **"Production,
Preview"** (más las entradas acotadas a `spike/capacitor-android`), y
`docs/MANTENIMIENTO.md` ("Preview NO puede compartir el Redis de producción")
documenta exactamente eso. Por lo tanto **el Preview de la precondición usó
el Redis de Producción**. Las afirmaciones de §53.3/§53.5 ("aislado", "sin
Producción", "el único contacto con Upstash") eran falsas en ese punto y
quedan corregidas: fue una **operación accidental sobre el Redis de
Producción**, acotada a claves con prefijo `precond-etapa3c1:<corrida>:` con
TTL ≤ 60 s, borradas al final (`SCAN` del prefijo 0 antes y después), sin
tocar claves normales del Home — como la precondición de la Etapa 2 (§14.1
de su informe, que sí lo declaraba). **`DBSIZE` 802 → 90 durante la primera
corrida: NO explicado.** No hay evidencia para atribuirlo a vencimientos ni
a nada; la ruta sólo ejecutó `DEL` sobre 10 claves propias nombradas
(devolvió 8). La prueba **no se repite** contra Producción; si hace falta
repetirla, se hará contra una base Upstash aislada y autorizada por el
dueño, con las variables `KV_*` acotadas a la rama (procedimiento de
`docs/MANTENIMIENTO.md`).

### 54.5 Punto 5 — suite determinista y build controlado

**Reproducido antes del cambio:** con cuatro suites en paralelo, 3 de 3
corridas fallaban `home-fondo-orden` ("ORDEN COMPLETO": el turno de 200 ms
vencía sin renovar y PUBLICAR salía `rechazado`; "FRONTERA EXTERNA, dos
llamadores" y "dos handlers concurrentes": el `setImmediate` de B llegaba
después del timer de 60/40 ms de A) y `home-vuelo` ("dos claves DIFERENTES":
`< 80 ms` de pared). **Corrección sin ampliar umbrales:** reloj FIJO para el
turno en memoria (los tests prueban orden, no duraciones); sincronización
inyectada (A no responde hasta que el test vio arrancar el fondo/la
composición de B; si B dependiera de A, el tope de 500 vueltas lo delata);
`producciones === 2` retenidas con una puerta. **Después:** 27/27 en 6
corridas bajo la misma carga; suite completa 3 × 1879/1889 y 2 × 1880/1890
tras el último cambio (10 omitidos preexistentes). Controles conservados: el
fondo que no espera la compuerta rompe 6 tests; el vuelo que serializa
claves rompe 2. **Build controlado:** ningún Next activo (0 puertos
3000-3004/4801-4813 en escucha), sin variables del banco, `.next` borrado:
`npm run build` **130 s, exit 0, "Compiled successfully", 0 errores,
`BUILD_ID` `XX_-UqA5fcZbIJisArQWs`**.

### 54.6 Verificación final tras las correcciones

Específicas 143/143; suite 1880/1890 (10 omitidos) ×2; `tsc --noEmit` 0;
build fresco 130 s exit 0; `git diff --check` limpio; identidad del Home
**16/16 idéntica** (TMDB 926 = 926 … 1082 = 1082; controles verdes);
umbrales (3 semillas): TMDB 0 diferencia, Redis +29/+27/+26 (≤ 41) y +1 en
fondo (≤ 3), duración mediana +0,7 % frío / −0,7 % fondo, peor repetición
+1,5 %, publicación +1 EVAL (TOMAR reemplaza al SET NX), UB −79 ms; banco
429: criterios 4-7 y propagación verdes, sobrepaso 77 (S1) / 92 (S2) / 223
globales (S5) contra 872 sin pausa. Commits de esta tanda: `69f182f`
(TIME único + ring), `7449b5e` (lecturas acotadas), `0ce9704` y `bfe8366`
(tests deterministas), `cb0c3d1` (tope por lectura + banco S4b).

### 54.7 Comprobado / inferido / desconocido

- **Comprobado:** todo lo anterior; el ámbito de `KV_*` en Vercel.
- **Inferido:** ninguno nuevo; `T_LECTURA_PAUSA_MS = 1 s` es propuesto
  (igual que el timeout del lector).
- **Desconocido:** la causa del `DBSIZE` 802 → 90; la cadencia y el
  `Retry-After` reales de TMDB (0 × 429 vistos en Producción).
- **Pendiente:** nueva auditoría de Codex; merge, push y deploy sólo con
  autorización del dueño.

## 55. Corrección de §54 tras la auditoría sobre `d322282` — el tope de lectura con pausa local CANCELA el trabajo, no sólo ignora el resultado — **IMPLEMENTADA en `feat/etapa3c1-pausa-tmdb`; NO mergeada, NO pusheada, NO desplegada; pendiente de auditoría final** (2026-09-18)

Estado verificado antes de tocar: rama `feat/etapa3c1-pausa-tmdb` @ `d322282`,
árbol limpio, fork `37d4707` = `origin/main`. Ninguna prueba usó Producción ni
sus credenciales: unit tests con reloj virtual y el banco aislado (dobles).

### 55.1 El defecto (con `d322282`)

§54.1 acotaba las lecturas con pausa local con `conTope` (`lib/lectura-acotada.ts`):
una carrera entre la lectura del cliente principal y un `setTimeout`. Eso
respondía en el tope (503 en ~3 s) pero **no cancelaba nada**: el MGET del
cliente principal seguía con sus 6 intentos y 4,3 s de backoff por lectura
después de que el Home ya había respondido, sobre un Redis caído, y podía
anotar métricas de una solicitud ya cerrada.

**RED (visto fallar, `lib/home-servir.test.ts`):** pausa local conocida al entrar
+ Redis caído modelado como cliente con 5 reintentos y backoff exponencial
(50·eⁱ ms, como el SDK) → después de responder, `intentos de Redis DESPUÉS de
la respuesta: [2559, 4289, 5289]` ms. Se fijaron cuatro cosas en el mismo test:
ninguna lectura viva atribuible a la solicitud (`enVuelo() === 0`) a los 10 s,
ningún intento de Redis con `t > tRespuesta`, el JSON de métricas de la
solicitud idéntico a los 10 s, y ningún `unhandledRejection`. Segundo RED:
Redis COLGADO (nunca responde): la señal por petición corta la lectura al
segundo y la lectura no sigue viva ni anota después. Control: SIN pausa local
el camino usa `leer` de siempre y nunca `leerAcotada`.

### 55.2 GREEN: un lector de caché específico para el recorrido pausado

- **`leerAcotadasHome<T>(claves)` en `lib/cache.ts`**: UN `MGET` real por
  **`redisLector`**, el cliente que ya existía para el PTTL del nivel 2
  (`retry: { retries: 0 }`, `signal: () => AbortSignal.timeout(TIMEOUT_LECTURA_MS)`
  → una señal NUEVA por petición; comprobado en `@upstash/redis` 1.38.0: si esa
  señal aborta, `request()` LANZA sin reintentar; con `retries: 0` hay un solo
  `fetch`). **No se crea ningún cliente por lectura**: sigue habiendo
  exactamente dos instancias por proceso (test estructural lo cuenta). Timeout,
  Redis caído o forma inesperada → `null` para todas las claves, `fallos.lectura`
  +1, sin reintento. Sin Redis, el mismo `Map` de memoria que `batchGet`.
  Misma implementación en memoria; el doble de Redis del banco ya atendía MGET.
- **`DepsServir<T>.leerAcotada`** (obligatoria): `servirConTurno` la usa **sólo
  cuando `pausaLocal() > 0` en el momento de cada lectura**; un rechazo del
  lector se trata como "no llegó" (`.catch(() => null)`), nunca como error del
  Home. Sin pausa, `deps.leer` de siempre: el camino sano conserva el cliente
  principal y su política de reintentos, sin cambios.
- **`lib/home.ts`**: la lectura previa del vuelo con pausa local vigente va por
  `leerAcotadasHome([clave])`; `servirConTurno` recibe `leerAcotada`.
- **Borrados** `lib/lectura-acotada.ts` y su test. Un test estructural falla si
  vuelve `conTope`, `lectura-acotada` o un `Promise.race([deps.leer…`.
- **`T_LECTURA_PAUSA_MS` = `CONSTANTES_PAUSA.TIMEOUT_LECTURA_MS`** (1 s), atado
  por test: el tope que la secuencia documenta es el que aplica la señal del
  lector. Se mantuvo el nombre para no tocar métricas ni logs.
- Sin cambios en `composeHome`, selección, hero, rieles, claves, TTL,
  `VERSION_HOME` ni contrato JSON (identidad 16/16, abajo).

GREEN: `lib/home-servir.test.ts` 75/75 (los 6 del punto 1 y los 3 nuevos);
`etapa3c1-cableado` (2 tests reescritos + 1 nuevo), `home-vuelo`,
`home-turno-cableado`, `home-fondo-orden`, `home-instante` actualizados por la
dependencia nueva; `descartes-tmdb-inventario` con las dos filas nuevas (el
`catch` del lector y el `.catch(() => null)` de la secuencia).

### 55.3 Medido en el banco: trabajo residual, con control sobre `d322282`

Escenario S4b (Redis CAÍDO —el doble corta el socket— + TMDB 429 total con
`Retry-After` 20 s; el segundo pedido, `n,d`, sale recién cuando el proceso vio
su 429: **pausa local conocida al entrar**, sin UB). Se leen las marcas del
doble de Redis **≥ 10 s después de la respuesta** del pedido pausado y se cuentan
los comandos cuya clave es de ESE pedido (`:d,n:`) en tres grupos
(`scripts/banco/etapa3c1-residual.mjs`, un proceso; el mismo conteo entra en
S4b de `etapa3c1-pausa.mjs` como criterio 8). Builds con el entorno del banco:
control `d322282` en `wt-etapa3c1-control` (`BUILD_ID 6E832gGzuvT5WBuT7dpd8`)
y la rama (`tt4pH5Bb-t04aVe0tSpQm`).

| | control `d322282` | esta corrección |
|---|---|---|
| Tiempo hasta la respuesta (503 `pausa`) | **3.052 ms** | **38 ms** (S4b del banco completo: 149 ms) |
| Operaciones de Redis realmente iniciadas (claves del pedido) | **18** MGET | **3** MGET |
| … iniciadas antes de responder y completadas antes | 14 | 3 |
| … iniciadas antes y completadas después de responder | 0 | 0 |
| … iniciadas DESPUÉS de responder (tardías) | **4** (a +595, +1.320, +2.310, +3.340 ms) | **0** |
| Operaciones canceladas | 0 (la carrera no cancela) | 0 (con Redis caído el `fetch` falla en el acto y no hay qué cancelar) |
| Ventana observada tras la respuesta | 12.231 ms | 12.093 ms (banco completo: 54.609 ms) |
| Composiciones / llamadas a TMDB | 0 / 0 | 0 / 0 |

Lectura: con `d322282`, 3 lecturas × 6 intentos = 18 MGET, y los últimos 4
llegan al doble hasta 3,3 s después del 503 (con un Redis lento en vez de
caído serían más y más tarde: el backoff acumulado es 4,3 s por lectura). Con la
corrección, 3 lecturas = 3 MGET, todos antes de responder. El 503 baja de
3,05 s a 38 ms porque un socket cortado hace fallar el único intento en el
acto: **los 3 s de antes eran el tope de la carrera, no el tiempo de Redis**.
Con Redis COLGADO (no responde) el tope es el que aborta: 1 s por lectura, ≈ 3 s
sin UB, medido en el test con reloj virtual (exactamente `2 × T_LECTURA_PAUSA_MS`
hasta decidir). Las "operaciones canceladas" en el banco son 0 en las dos
columnas porque el doble caído no deja nada en vuelo que cancelar; la
cancelación real (señal que aborta el `fetch` a 1 s) sólo se observa con Redis
colgado, y ahí la prueba es la unitaria.
Archivos: `docs/medidas/2026-09-18-etapa3c1-residual-control-d322282.json`,
`…-residual-despues.json`, `…-etapa3c1-banco.json`.

### 55.4 Controles conservados (banco completo, `etapa3c1-pausa.mjs`)

Redis sano con fresca → HIT (S1b tras la pausa: 200, publicado); Redis sano con
UB durante la pausa → UB en 251 ms (S2b, `ultimo-bueno-pausa`, `ubIgual`);
429 con UB → UB en 346 ms (S2); pausa larga sin UB → 503 en 174 ms (S1c); sin
pausa (kill switch, S6) → comportamiento de siempre (872 llamadas tras el 429,
control); pausa corta sin UB → un sueño + una readquisición (tests del punto 1
con reloj virtual); propagación entre procesos verde; sobrepaso 74 (S1) / 94
(S2) / 227 global (S5) contra 872 sin pausa. Criterios 4-8 verdes.
**Identidad del Home 16/16 idéntica** contra `37d4707` (TMDB 926 = 926 …
1082 = 1082; concurrente 2059 = 2059; controles de mutación verdes).
**Umbrales** (3 semillas): TMDB 0 diferencia; Redis +26/+25/+26 (≤ 41) y +1 en
fondo (≤ 3); duración mediana −1,0 % frío / +1,8 % fondo, peor repetición
+6,1 % (≤ +10 %); publicación +1 EVAL; UB −47 ms.

### 55.5 Verificación final

Específicas: `home-servir` 75/75, `etapa3c1-cableado`, `home-vuelo`,
`home-turno-cableado`, `home-fondo-orden`, `home-instante`,
`descartes-tmdb-inventario` verdes. Suite completa **1881/1891 (10 omitidos
preexistentes) × 2**. `tsc --noEmit` 0. Build fresco controlado (0 puertos del
banco en escucha, sin variables del banco, `.next` borrado): **116 s, exit 0,
"Compiled successfully", 0 errores, `BUILD_ID` `ryOY8nDhnkldv8thUQ-gl`**.
`git diff --check` limpio.

### 55.6 Comprobado / inferido / desconocido

- **Comprobado:** RED → GREEN de los tres tests; el comportamiento del SDK
  1.38.0 ante `signal` como función y `retries: 0` (leído en el código del
  paquete instalado); el trabajo residual del control y su ausencia en la
  corrección (banco, marcas del doble); identidad, umbrales y criterios.
- **Inferido:** con Redis LENTO (responde tarde, no caído) el control dejaría
  más comandos tardíos que los 4 medidos —el backoff acumulado es 4,3 s por
  lectura—; no se midió esa variante en el banco.
- **Desconocido:** sin cambios respecto de §54.7 (`DBSIZE` 802 → 90; cadencia y
  `Retry-After` reales de TMDB).
- **Pendiente:** auditoría final; merge, push y deploy sólo con autorización
  del dueño.
