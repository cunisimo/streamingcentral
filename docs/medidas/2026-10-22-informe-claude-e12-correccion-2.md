# Informe para auditoría: segunda corrección de E1.2 (inicio de ruta y alias)

22/10/2026. Claude Code. Rama `feat/resenas-reglas`, sobre `251f3d0`.

**Alcance:** sólo A1 y A2 de la auditoría de `251f3d0`, en el módulo puro.
- No hubo rutas, pantallas, Supabase, SQL, red, APIs externas, Producción,
  push, merge, deploy ni AAB.
- **No se preparó ni ejecutó un reservado 3.**

**E1 sigue pendiente de cierre.** Todo lo que sigue son pruebas conocidas y
regresiones sobre conjuntos ya divulgados; **no es validación independiente**.
No se cambió ningún umbral ni la interpretación de C1 y C2.

## Commits

| Commit | Qué |
|---|---|
| `28a69d1` | Copia sin cambios de la auditoría de `251f3d0` (SHA-256 `a615b344…cd5f1533`, igual al original) |
| `b6e1f33` | Reglas, banco de desarrollo y pruebas |
| (este) | Este informe y `docs/ESTADO.md` |

## A1: inicio de ruta (`contacto.enlace` v5)

- **Causa:** v4 amplió la terminación a 2–63 letras y, además, exigió que la
  ruta empezara con letra o dígito. Ese segundo cambio no hacía falta y perdió
  rutas que v3 detectaba (`ejemplo.xy/_demo`).
- **Corrección:** la ruta vuelve a la clase de caracteres de v3 completa,
  también en el primer carácter: letras, dígitos, `_ - . / ? = & % #`. La
  terminación sigue en 2–63 letras. No hay ninguna excepción por dominio.
- **Sin regresión respecto de v3 ni de v4:** v5 es v3 con la terminación más
  larga, así que todo lo que detectaban v3 o v4 lo detecta v5.
- **Pruebas** (`transformaciones.test.ts`): rutas que empiezan con `demo`,
  `9demo`, `_demo`, `-demo`, `.demo`, `?id=1`, `=x`, `&x`, `%20x`, `#x` y
  `/x`. Cada una se prueba con terminaciones de 2, 3, 6, 7, 11, 18 y 40 letras,
  con y sin subdominio: 154 combinaciones, todas rechazadas.
- **Controles de puntuación y barras que se publican:** "frase./ Sigue",
  "así.../ y", "7/10, la música/el sonido" y "Drama/comedia/suspenso". Siguen
  también los controles de la corrección anterior ("8.5/10", "y/o",
  "2.0/beta", "bueno/a").

## A2: un solo criterio de alias (`contacto.email_indirecto` v2)

- **Causa:** la autoatribución ("mi correo es …") usaba `esAliasFuerte`
  (cualquier mezcla de letras y dígitos), pero la búsqueda libre usaba otra
  expresión que no veía dígitos al principio ni en medio. Por eso "soy
  cine.fan88" se retenía y "soy 88cine" o "soy cine8fan" se publicaban.
- **Corrección:** hay **una sola** definición, `esAliasFuerte`, usada por los
  dos recorridos. Un alias:
  - es un tramo de letras y dígitos, separable por `.`, `_` o `-`;
  - tiene al menos una letra;
  - tiene al menos un dígito, `_` o `.` en cualquier posición;
  - no cuenta la puntuación final de la oración.

  "007", "2024", "2.0" y "8.5" no son alias porque no tienen letras;
  "ciencia-ficcion" tampoco, porque no tiene dígito, `_` ni `.`.
- **Las condiciones de cada recorrido no cambiaron.** La búsqueda libre sigue
  exigiendo una palabra de correo y una intención de contacto a 80 caracteres o
  menos. **La salida sigue siendo retener**, nunca rechazar.
- **Pruebas:**
  - los alias `88cine`, `cine8fan`, `cinefan88`, `cine.fan`, `cine_fan`,
    `cine.fan88`, `8cine_fan` y `c1n3fan` se prueban por los dos recorridos:
    16 casos, todos retenidos;
  - controles publicados: "soy 2024" con mail y pedido, "agente 007", "Blade
    Runner 2049 y Se7en", "versión 2.0 del informe", "Android 14" y "mi correo
    es un desastre desde que vi M3GAN".

**Banco de desarrollo:** 4 pares nuevos con sus controles, 2 de inicio de ruta
y 2 de alias.

## Resultados (pruebas conocidas)

| Caso de la auditoría | `251f3d0` | Ahora |
|---|---|---|
| `Mirala en ejemplo.photography/demo sin cortes.` | rechazo | rechazo |
| `Mirala en ejemplo.photography/_demo sin cortes.` | **publicar** | rechazo (`contacto.enlace@5`) |
| `Mirala en ejemplo.xy/_demo sin cortes.` | **publicar** | rechazo (`contacto.enlace@5`) |
| `Mandame un mail, soy cine.fan88, y te paso la lista.` | retener | retener |
| `Mandame un mail, soy 88cine, y te paso la lista.` | **publicar** | retener (`contacto.email_indirecto@2`) |
| `Mandame un mail, soy cine8fan, y te paso la lista.` | **publicar** | retener (`contacto.email_indirecto@2`) |

- **Banco de desarrollo, 506 casos:**
  - C0 0/506, C1 0/182, C2 177/177, C3 0/211, C4 1/211 y N1 0/24;
  - la única que no coincide es el retenido conocido `D-RG-17-B`.
- **Reservado 1, como regresión:** igual que antes. Todo abuso se detecta y
  `R-L-045` sigue retenido por `datos.domicilio`, el falso positivo ya
  aceptado.
- **Reservado 2, como regresión:** igual que antes.
  - Todo abuso se detecta.
  - No coinciden con su etiqueta `R2-RL-105` (legítima retenida) y
    `R2-RA-042` (retenido; su etiqueta dice "rechazar").
- **Legítimas de los tres bancos que disparan las reglas cambiadas:**
  ninguna.
- **Regresiones observadas:** ninguna.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `node --test "lib/comunidad/**/*.test.ts"` | 73 de 73, sin omitidas |
| `npx tsc --noEmit --incremental false` | 0 errores |
| `npm test` (suite completa) | 2322 pruebas: 2304 pasan, 0 fallan, **18 omitidas** |
| `git diff --check` | sin errores |
| `git diff 1f475e3 -- scripts/comunidad` | vacío: reservados, sellos e informes intactos |

Las 18 omitidas son las de siempre: necesitan un build web o el artefacto de
Capacitor, que no se hicieron. No se presentan como verificadas.

## Falsos positivos y limitaciones

- **Título alfanumérico con correo y pedido cerca:** se **retiene**, por
  ejemplo "Escribime qué opinan de Se7en, el mail del asesino me voló la
  cabeza". Para retener hacen falta las tres señales a 80 caracteres o menos:
  un token con forma de alias, la palabra de correo y la intención de
  contacto. Es carga de revisión, no rechazo.
  - Evitarlo pediría distinguir títulos de alias, y eso no se puede hacer sin
    una lista de títulos. No se agregó ninguna excepción.
- **"Buenísima.Recomendada/obligatoria"** se sigue rechazando, sin excepción
  particular. Codex lo considera no bloqueante y queda documentado. No hay
  datos de frecuencia en uso real.
- **Paráfrasis sin alias reconocible** (por ejemplo, "buscame en el de Google
  como charly") siguen sin detectarse. Es un límite documentado.
- **Evidencia débil:** los casos y controles nuevos los escribió quien ajusta
  las reglas, después de conocer los fallos. Que pasen dice que la corrección
  cubre lo pensado, no que generalice.
- **Validación independiente pendiente:** la decide la auditoría, con el
  código y el alcance congelados antes de escribir los casos.
