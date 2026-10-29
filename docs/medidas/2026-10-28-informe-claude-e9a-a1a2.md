# E9a local — corrección de A1 y A2 (28/10/2026)

Claude, en `feat/resenas-reglas` desde `187be15`, sobre la auditoría
`2026-10-28-auditoria-e9a-187be15.md`. Copiada sin cambios: SHA-256
`eb99009f…`, igual al original. Sólo Supabase local y datos ficticios.
**Ninguna bajada de migraciones se ejecutó.** No se rehízo la integración ni
se repitieron las quince baterías. Sin Producción, E0, E9b/E9c, cron, gastos,
push, merge, deploy, AAB ni cambios de versión. El texto de eliminación de
cuenta no se tocó. Salidas: `2026-10-28-e9a-a1a2-salidas.txt`.

## A1 — la limpieza del recorrido borraba por inferencia

**Antes:** `limpiar` tomaba como propio a todo participante sin cuenta creado
desde `t0` y a todo mes de ranking que no existía al preparar. Además borraba
el archivo de estado aunque informara diferencias.

**Ahora** la propiedad se registra cuando cada objeto nace, nunca se deduce.
- **Registro** (`scripts/comunidad/recorrido-e9a-registro.sql`): `preparar`
  instala el esquema `recorrido_e9a` y tres triggers que sólo insertan ahí, sin
  FK y sin cambiar ni rechazar nada.
  - **Cuenta:** la que nace en `auth.users` con un correo `@recorrido.test`
    mientras el registro está instalado. Incluye las de `preparar` y las que
    el dueño registre en la UI.
  - **Participante:** el que nace vinculado a una cuenta registrada. Sigue
    registrado aunque una baja lo desvincule.
  - **Versión:** la que escribe un participante registrado, también si una baja
    la borra en cascada.
  - **Si antes de preparar ya hay cuentas `@recorrido.test`:** `preparar` se
    niega a correr.
- **Registro de recuperación** (`.recorrido-e9a.local.json`): cada cambio de
  `preparar` se anota antes de hacerse:
  - la configuración previa;
  - los permisos que va a conceder;
  - la marca de la editorial, que lleva el id de la corrida en el texto y se
    borra por esa marca;
  - el reloj instalado o quitado;
  - el registro instalado.

  `limpiar` guarda sus objetivos en el mismo archivo antes de borrar nada.
- **Objetivos** = lo ya guardado ∪ el registro. Se borran sólo esos ids y las
  filas que los referencian, todo con listas explícitas (`= any('{…}')`). Sin
  objetivos no se alcanza ninguna fila: es el caso de la sonda de la
  auditoría, y lo fija un test.
- **Rankings:** sólo se evalúan los meses con tramos o resultados de
  participantes propios. Un mes consolidado se borra sólo si:
  - todos sus tramos tienen evaluador y autor propios;
  - ningún resultado tiene un participante ajeno;
  - no estaba consolidado al preparar.

  Un mes de otra prueba que no toca nada propio, como el agosto de la
  auditoría, ni se mira.
- **Discrepancias:**
  - **Ranking con datos ajenos:** la limpieza se detiene ANTES de borrar.
  - **Resto en la verificación final** (filas propias, una cuenta
    `@recorrido.test` sin registrar, la configuración o los permisos sin
    restaurar, la editorial o el reloj propios todavía presentes): sale con 1.

  En los dos casos conserva el archivo y el registro y no informa éxito.
  Repetir `limpiar` es seguro.
- **Órdenes «Más útiles»:** se borran si todas sus versiones son propias. Las
  que mezclan versiones propias y ajenas son una caché con vencimiento: se
  conservan y se informan.
- **Al terminar sin problemas:** se quitan el registro y el archivo. Los
  conteos globales quedan como dato informativo, porque la actividad ajena los
  mueve.
- **Núcleo puro:** las decisiones viven en
  `scripts/comunidad/recorrido-e9a-nucleo.mjs`.

**Prueba real** (`scripts/comunidad/pruebas-recorrido-e9a.mjs`, base local
compartida, procesos aparte, **13/13**):
- **Preparación cortada tras dos autores:** `limpiar` borra esas 2 cuentas y
  sus 2 participantes y deja todo como antes.
- **Durante un recorrido completo:**
  - una identidad **ajena** (otro dominio) publica y se da de baja, y queda
    como participante sin cuenta con filas residuales;
  - se crea un ranking **ajeno** de agosto de 5 puntos;
  - dos cuentas **propias** se crean por `signUp`, como la UI: una vota y la
    otra publica y se da de baja;
  - septiembre se consolida con los datos propios.
- **Corte tras guardar los objetivos:** sale con error, nada borrado; los
  objetivos son exactamente el registro, con el participante propio
  desvinculado y sin el ajeno.
- **Otra identidad ajena nace entre intentos:**
  - el corte tras la transacción de comunidad no la incluye: los objetivos no
    se ampliaron;
  - septiembre, que es propio, ya se borró.
- **Reintento:** verificado. Se borraron 14 cuentas y 13 participantes propios,
  y septiembre; se quitaron el registro y el archivo.
- **Lo ajeno sobrevive:**
  - la identidad dada de baja, con sus intentos;
  - el ranking de agosto;
  - la cuenta viva.
- **`limpiar` sin archivo:** no borra nada y lo dice.
- **Discrepancia real:** con el reloj de otra batería, un voto ajeno cae en
  septiembre sobre una reseña propia. La limpieza se detiene antes de borrar y
  sale con 1. Quedan el ranking, el tramo ajeno, las 12 cuentas propias, el
  archivo y el registro.
  - **Resuelta la discrepancia:** quité el voto ajeno de prueba y el reintento
    verifica.
- **Al final:** borra sus propias fixtures ajenas por id.

**Corridas anteriores** (detalle en las salidas):
- **Corridas 1 y 2:** fallaron por textos de prueba que la regla de contacto
  rechazó.
- **Corrida 4:** encontró un defecto del script. Ante la discrepancia de
  septiembre borraba el tramo ajeno sobre una reseña propia; ahora se detiene
  antes de borrar.

En todas, la limpieza del recorrido no tocó la identidad ajena. La fixture
ajena que quedó de la corrida 1 la borré por id.

## A2 — frenos de los arneses destructivos

`scripts/comunidad/frenos-arneses.mjs`:
- **Lectura del estado:** cada arnés lee el estado con UNA consulta de sólo
  lectura (`ESTADO_SQL`) ANTES de su primera escritura. La consulta trae:
  - tablas de `comunidad` con su cantidad de filas;
  - funciones y procedimientos de `comunidad` y `public.comunidad_*`;
  - triggers sobre `comunidad`;
  - la fila de `config` y los defaults de sus columnas.
- **Qué admite cada arnés:** sale de los **archivos de migración**: tablas,
  funciones, procedimientos, triggers (también `constraint trigger`) y
  columnas de `config`. Control: con 011–022 admitidas, el estado real no
  tiene nada fuera de las migraciones.
- **`up-down-up.mjs`:**
  - **Admite:** que no haya esquema, u objetos de 011–014 sin filas y con
    `config` en sus defaults.
  - **Rechaza:** 015 sin 016, el estado actual, filas que la bajada de 011
    perdería, `config` cambiada y triggers ajenos (por ejemplo, el registro
    del recorrido).
- **`up-down-up-020.mjs`:**
  - **Admite:** objetos de 011–020, con o sin 020.
  - **Rechaza:** 021, porque reaplicar 020 pisaría sus redefiniciones; los
    meses consolidados que la bajada perdería; y la falta de esquema.
- **Con un rechazo:** el arnés lista los motivos, sale con 2 y dice que nada se
  escribió.

**Pruebas, sin base: 19/19.**
- **Sobre estados armados con los objetos de las migraciones:**
  - **Admitidos:** sin esquema; 011–014; 011–019; 011–020.
  - **Rechazados:**
    - 015 sin 016 (el test comprueba que ahí no existe `decisiones`, lo único
      que miraba el freno anterior);
    - 011–022;
    - 011–014 con 6 participantes;
    - `config` cambiada;
    - trigger ajeno;
    - 021;
    - meses consolidados.
- **Los arneses REALES** se ejecutan con `--import frenos-arneses.gancho.mjs`,
  que les da `frenos-arneses.falso-local.mjs` en lugar de `local.mjs`. Ese
  módulo anota cada llamada y bloquea toda escritura.
  - **En los 6 estados incompatibles:** salen con 2 y las únicas llamadas son
    `contenedor` y la lectura del estado.
  - **En los compatibles:** la primera mutación (aplicar 011, o reaplicar 020)
    llega después de la lectura.
- **Sobre la base compartida real:** sólo se evaluó la consulta de lectura, y
  los dos frenos rechazan con sus motivos.

## Conciliación: comparaciones con todo apagado

El informe de E9a decía «12 de 14 pares»; las salidas enumeran **12 pares**.
Lo confirman los 12 pares de archivos base/rama guardados en la corrida
original:
- Home en 1280 y 375;
- ficha sin sesión en 1280;
- ficha con sesión en 1280 y 375;
- `/top` sin sesión en 1280 y 375, y con sesión en 1280;
- cuenta en 1280 y 375;
- configuración en 1280;
- diálogo de baja en 1280.

Fueron 10 iguales en la primera corrida y 2 que difirieron:
- el Home de la base todavía cargando;
- el banner «Instalá Yump» en la ficha de la base en 375.

Esos 2 dieron iguales en las dos vueltas del control alternado. Fue un error
de conteo mío, corregido en el informe y en ESTADO sin repetir el recorrido.

## Incidente y línea base (sin cambios)

Sigue registrado el incidente de E9a: el arnés de 011–014 borró 6
participantes, 2 versiones y 2 suspensiones ajenas, y no se recuperaron ni se
recrearon. La línea base real es 0 participantes, 0 versiones, 0 suspensiones
y 42 cuentas `@comunidad.test`. Al terminar esta entrega la base está así:
- 0/0/0 y 42 cuentas, 0 `@recorrido.test`, 24 tablas;
- interruptores, muestreo y purga apagados, rankings en `1 year`;
- `cron` sólo con `sala-barrido`;
- sin `recorrido_e9a`, `solo_local`, triggers del recorrido ni editorial
  ficticia;
- `anon`/`authenticated` sólo con REFERENCES, TRIGGER y TRUNCATE sobre esas
  tablas, como antes.

No hay archivo de estado ni servidores corriendo.

## Controles

| Control | Resultado |
|---|---|
| frenos (`frenos-arneses.test.mjs`) | 19/19 |
| núcleo de la limpieza (`recorrido-e9a-nucleo.test.mjs`) | 6/6 |
| aislamiento real (`pruebas-recorrido-e9a.mjs`) | 13/13 |
| `scripts/comunidad/*.test.mjs` | 41/41 (16 anteriores + 25 nuevos) |
| `scripts/sala/*.test.mjs` | 7/7 |
| `tsc --noEmit --incremental false` | 0 |
| `git diff --check` | limpio |

**No corrido, a propósito:**
- **Las quince baterías, `npm test` y `npm run build`:** el cambio sólo toca
  scripts de prueba locales, sin código de la app.
- **Ningún arnés up-down-up contra una base:** ni la compartida ni una
  desechable. La frontera anterior a la primera escritura se probó
  instrumentada, como pidió la auditoría.

## Pendiente

- **Revisión focalizada de Codex** sobre A1/A2.
- **Prueba del dueño:** sigue pendiente. La guía
  (`2026-10-28-e9a-prueba-duenio.md`) ya explica el registro, la limpieza y
  qué hacer ante una discrepancia.
- **Cierre de E9a:** depende de E0 y de los pasos de Producción, fuera de esta
  autorización.
