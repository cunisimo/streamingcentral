# AGENTS.md — Yump / StreamingCentral

Agregador de streaming para Argentina. Resuelve "no sé qué ver": agrega el
catálogo de las plataformas que el usuario elige, sin cine ni TV abierta.

---

## ⚠️ Este archivo NO describe el proyecto. Apunta a dónde está descripto.

**La fuente de verdad es [`CLAUDE.md`](CLAUDE.md).** Este archivo existe solo
porque Codex busca un `AGENTS.md` en la raíz.

**Regla dura: no copiar acá nada que viva en `CLAUDE.md`.** Ni un resumen, ni
"lo más importante", ni una versión corta. Si algo falta, se agrega en
`CLAUDE.md` y este archivo no se toca.

El motivo no es estética. Este archivo **era** una copia byte a byte de
`CLAUDE.md` (548 líneas idénticas) y por eso se reescribió. Dos manuales del
mismo sistema se desincronizan siempre, y el costo lo paga justo quien menos
puede detectarlo: en este proyecto ya pasó que `CLAUDE.md` dijera `home:v1`
cuando la clave real era `v2`. **Un auditor que lee el manual desactualizado
audita contra un sistema que no existe** — y sus hallazgos parecen ciertos.

Si al leer esto encontrás una afirmación técnica concreta (un nombre de clave,
un número, un umbral), es un bug de este archivo: sacala y dejá el puntero.

---

## Qué leer, según lo que vayas a hacer

| Necesitás | Archivo |
|---|---|
| Arquitectura, decisiones y por qué de cada una; limitaciones de TMDB; convenciones | [`CLAUDE.md`](CLAUDE.md) |
| Estado del momento, qué se hizo, qué está sin desplegar, qué se está probando | [`docs/ESTADO.md`](docs/ESTADO.md) |
| Problemas conocidos, abiertos, con criterio de cierre | [`docs/ISSUES.md`](docs/ISSUES.md) |
| Cómo medir sin engañarse; trampas de medición ya pisadas | [`docs/MANTENIMIENTO.md`](docs/MANTENIMIENTO.md) |
| Service worker, offline, instalación | [`docs/PWA.md`](docs/PWA.md) |

`CLAUDE.md` se carga solo en cada conversación de Claude Code; Codex tiene que
abrirlo a mano.

---

## El rol de Codex acá: auditoría, no escritura

Codex trabaja sobre esta carpeta **como auditor**: lee, revisa y reporta. **No
modifica código.** Los cambios los hace el dueño o Claude Code, y pasan por las
mismas reglas de siempre: rama aparte, medición antes y después, y prueba a mano
del dueño antes de mergear.

Lo más útil que puede hacer una auditoría en este proyecto, por orden:

1. **Contradicciones entre la documentación y el código.** Es el fallo que más
   veces apareció acá, y el que menos se ve desde adentro. Un número en un
   comentario que ya no es el número real vale como bug.
2. **Números que no se sostienen.** Casi toda decisión de este repo está
   justificada con una medición escrita al lado. Si la cuenta no cierra o la
   medición no distingue lo que dice distinguir, decilo.
3. **Mediciones que se engañan solas.** Antes de reportar que algo está roto,
   leé `docs/MANTENIMIENTO.md` 8.b y 8.b.2: acá ya se reportó como bug de
   producto lo que era un arnés de medición roto, más de una vez.

Dos cosas que **no** son hallazgos válidos, porque son decisiones tomadas y
documentadas con su motivo en `CLAUDE.md`: proponer reactivar el módulo de
reseñas editoriales, y proponer filtrar títulos por su puntaje de TMDB.
