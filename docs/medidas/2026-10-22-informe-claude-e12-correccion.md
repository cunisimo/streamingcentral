# Informe para auditoría: corrección de E1.2 (enlaces largos y correo indirecto)

22/10/2026. Claude Code. Rama `feat/resenas-reglas`, sobre `40288f6`.

**Alcance:** sólo las dos correcciones pedidas tras la auditoría de `40288f6`,
en el módulo puro.
- No hubo rutas, pantallas, Supabase, SQL, red, APIs externas, Producción,
  push, merge, deploy ni AAB.
- **No se preparó ni ejecutó un reservado 3.**

**E1 sigue pendiente de cierre.** Todo lo que pasa abajo son **pruebas
conocidas**: casos escritos después de conocer los fallos y regresiones sobre
reservados ya vistos. Ninguna es una validación independiente. No se cambió
ningún umbral ni se reinterpretaron C1 o C2.

## Commits

| Commit | Qué |
|---|---|
| `80181ff` | Copia sin cambios de la auditoría de `40288f6` (SHA-256 `3f101a16…7d1d4d12`, igual al original) |
| `08419e4` | Reglas, banco de desarrollo y pruebas |
| (este) | Este informe, errata en el informe de E1.2 y `docs/ESTADO.md` |

Los reservados 1 y 2, sus sellos y sus informes no cambiaron: `git diff
1f475e3` sobre `scripts/comunidad/` está vacío.

## A1: dirección con ruta y terminación larga (`contacto.enlace` v4)

- **Antes:** la terminación tenía que tener de 2 a 6 letras, aunque el informe
  de E1.2 decía "cualquier terminación". `ejemplo.photography/demo` se
  publicaba.
- **Ahora:** `etiqueta(.etiqueta)*.letras/ruta` con **2 a 63 letras** de
  terminación, que es el largo máximo de una etiqueta DNS. No hay una lista de
  terminaciones ni se agregó `photography`. La ruta tiene que empezar con
  letra o dígito.
- **Sin ruta no cambia nada:** una dirección sin ruta sigue dependiendo de la
  lista de TLD y de acortadores.
- **Pruebas** (`transformaciones.test.ts`):
  - terminaciones de 2, 3, 5, 6, 7, 9, 11, 14, 18, 24, 40 y 63 letras, cada
    una con y sin subdominio y query: todas se rechazan;
  - controles de puntuación que se publican: "8.5/10", "Actuación/guion/
    fotografía", "2.0/beta", "y/o", "Muy bueno/a" y "3.5/5 … 4/5".
- **Falsos positivos medidos:**
  - En los bancos, la generalización **no afectó a ninguna legítima**: ni las
    del banco de desarrollo, ni las del reservado 1, ni las del reservado 2
    disparan `contacto.enlace`.
  - **Falso positivo conocido, no corregido:** una palabra sin espacio después
    del punto seguida de una barra, como "Buenísima.Recomendada/obligatoria",
    se **rechaza**. Con el tope de 6 letras pasaba sólo si la palabra después
    del punto tenía 6 letras o menos.
  - Distinguirlo exigiría mirar mayúsculas o tildes en el original, y eso un
    atacante lo esquiva fácil. Requiere dos errores de tipeo a la vez. Queda
    para que decida la auditoría.

## A2: correo incompleto o indirecto (`contacto.email_indirecto` v1, nueva)

**Siempre retiene, nunca rechaza:** detecta un intento de contacto, no una
dirección. Se dispara en dos casos:

1. **Autoatribución de correo con alias.** "mi correo / mail / email /
   casilla / gmail / hotmail… es (o `:`) <alias>". Retiene en cualquiera de
   estos casos:
   - el alias tiene forma de usuario (letras con un `_`, un `.` o un dígito,
     como `charly_movies`);
   - el alias es una palabra simple y hay una intención de contacto a 80
     caracteres o menos (verbos de contacto, "te paso", "pasame", "pedime").

   No cuentan como alias "un", "lo", "muy", "privado", "secreto" y otras
   palabras de una lista cerrada.
2. **Sin autoatribución.** Hacen falta tres señales a 80 caracteres o menos
   entre sí: una palabra de correo, una intención de contacto y un alias con
   forma de usuario ("Mandame un mail, soy cine.fan88").

**Qué no dispara** (todo probado):
- Google, Gmail o un proveedor solos;
- "correo" o "mail" solos;
- un verbo solo;
- "mi correo es un desastre";
- "el hacker le pide el mail a su víctima";
- "el agente 007 le manda un mail" (sin letras no hay alias);
- "la app de correo de Google aparece en cada plano";
- proveedores nombrados en una escena;
- un diálogo citado con un alias simple y un verbo de atribución («Mi correo
  es charly», le dice al detective).

**Qué se retiene en diálogos:** un diálogo entre comillas con un alias con
forma de usuario y un pedido. Es la misma política que A1 de E1.2: las
comillas no eximen.

**`R2-RA-042`:**
- **Antes:** sin detectar, declarado "fuera de alcance".
- **Ahora:** se **retiene**.
- **Su etiqueta en el reservado sigue siendo "rechazar"** y no se cambió.
  Cuenta como **detectado** (C1 mide detección), pero con una salida más débil
  que la etiquetada.
- `reservado-2-regresion.test.ts` ya no tiene la lista `FUERA_DE_ALCANCE` ni
  la prueba que exigía no detectarlo. Exige ahora que **ningún** abuso quede
  sin detectar, y lista `R2-RA-042` en `DETECTADOS_MAS_DEBILES`, que comprueba
  que siga retenido. No se excluye de ninguna métrica.
- **Rechazarlo en vez de retenerlo** exigiría tratar como dato completo una
  dirección incompleta. Si eso se quiere, es una decisión de la auditoría o
  del dueño, no de esta corrección.

**Pruebas:**
- `transformaciones.test.ts`: 7 intentos retenidos, entre ellos los dos
  literales de la auditoría, una cita con un alias con forma de usuario y "mi
  gmail es…". También 9 controles legítimos publicados: tramas, menciones
  técnicas, diálogo y citas.
- El banco de desarrollo suma 5 pares nuevos, cada uno con su control
  parecido:
  - 2 de enlaces con terminación larga;
  - 3 de correo indirecto, con esperado "retener" y sin marcarlos como
    contacto "claro" en C1.

## Resultados (pruebas conocidas)

| Caso de la auditoría | E1.2 | Ahora |
|---|---|---|
| `Mirala en is.gd/demo sin cortes.` | rechazo | rechazo |
| `Mirala en ejemplo.photography/demo sin cortes.` | **publicar** | rechazo (`contacto.enlace@4`) |
| `Mi correo es charly_movies en el de Google, el que termina en com. Escribime.` | **publicar** | retener (`contacto.email_indirecto@1`) |
| `Mi correo es charly_movies. Escribime por correo y te paso las pelis.` | **publicar** | retener (`contacto.email_indirecto@1`) |

- **Banco de desarrollo, 498 casos:**
  - C0 0/498, C1 0/180, C2 173/173, C3 0/207, C4 1/207 y N1 0/24;
  - la única que no coincide es el retenido conocido `D-RG-17-B`.
- **Reservado 1, como regresión:** todo abuso detectado. `R-L-045` se sigue
  reteniendo por `datos.domicilio`; es el falso positivo ya aceptado y no
  cambió.
- **Reservado 2, como regresión:**
  - todo abuso detectado;
  - no coinciden con su etiqueta `R2-RL-105` (legítima retenida, de E1.2) y
    `R2-RA-042` (abuso retenido; su etiqueta dice "rechazar").
- **Legítimas que disparan las reglas cambiadas:** ninguna en los tres
  bancos.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `node --test "lib/comunidad/**/*.test.ts"` | 71 de 71, sin omitidas |
| `npx tsc --noEmit --incremental false` | 0 errores |
| `npm test` (suite completa) | 2320 pruebas: 2302 pasan, 0 fallan, **18 omitidas** |

- Las 18 omitidas son las de siempre: necesitan un build web o el artefacto de
  Capacitor, que no se hicieron. No se presentan como verificadas.
- Sin red, base ni builds.

## Falsos positivos y limitaciones

- **"Buenísima.Recomendada/obligatoria"** se rechaza (ver A1).
- **El correo indirecto se basa en señales finitas:**
  - no detecta paráfrasis sin autoatribución ni alias con forma de usuario,
    como "buscame en el de Google como charly" (alias simple sin "mi correo
    es");
  - tampoco detecta un alias dicho en otra reseña. Eso depende de las
    denuncias y de `contacto.partido`.
- **Diálogos con un alias con forma de usuario y un pedido** se retienen
  aunque sean ficción. Es carga de revisión, no rechazo.
- **Errata anterior:** el informe de E1.2 decía "cualquier terminación". Se
  le agregó una nota al principio; el resto del informe no se tocó.
- **Evidencia débil:** los casos y controles nuevos los escribió quien ajusta
  las reglas, conociendo los fallos. Que pasen dice que la corrección cubre lo
  pensado, no que generalice.
- **Validación independiente pendiente:** la decide la auditoría. Si se
  acuerda, sería **una** medición con alcance fijado antes de crear los
  casos.
