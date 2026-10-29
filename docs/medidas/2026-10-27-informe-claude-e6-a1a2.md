# E6 · corrección A1/A2 — 27/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`8cbe0cd`. Corrige **sólo** A1 y A2 de la auditoría de Codex, copiada sin
cambios: `docs/medidas/2026-10-27-auditoria-e6-8cbe0cd.md`, SHA-256
`30cab597…`, igual al original. Sólo local y datos ficticios. Sin E7,
filtro, retenciones, P3, Producción, E0, servicios externos, push, merge,
deploy ni AAB.

## A1 — recuperar un cambio de nombre sin volver a aplicarlo

**Solución.** Reutilicé la idempotencia que ya usan publicar y editar
(`comunidad.intentos`, 014).
- **Envío:** cada envío lleva un `id_intento` del cliente y el hash del
  pedido normalizado. `comunidad_cambiar_nombre` pasa a
  `(uid, nombre, decisión, id_intento, hash)`; la 019 borra la firma anterior
  para que no quede como sobrecarga.
- **Bajo los locks del protocolo de 013:**
  - se relee el intento (`intento_previo`) antes de la marca;
  - todo resultado posterior a la relectura (cambio, sin cambios, rechazos,
    límite, fila A) se registra **en la misma transacción** que su efecto;
  - el cupo se consume sólo en un intento nuevo que cuenta para el límite.
- **Reintento:** con el mismo intento devuelve lo ya resuelto (`repetido`),
  sin escribir ni consumir. Por eso no pisa un nombre guardado después desde
  otra sesión. Mismo id con otro hash: `conflicto`. Sin confirmación:
  `sin_confirmar`, nunca "no se guardó".
- **Privacidad:** el intento **no guarda ningún nombre**, ni el aceptado,
  porque la baja no borra intentos. El hash es un HMAC con el secreto del
  servidor (el de duplicados), no un SHA-256 adivinable de un nombre corto.
- **Ruta y cliente:** la ruta exige `id_intento`. Mi perfil reutiliza el mismo
  intento sólo si la persona reintenta el mismo nombre tras una respuesta
  incierta.
- **Migración:** suma la acción `'nombre'` al CHECK de `intentos`. El down
  borra esos registros de recuperación y restaura el CHECK de 014.

**Regresiones con funciones reales** (`pruebas-nombre-intento.mjs`):
- **Casos:**
  1. respuesta perdida sin intervención;
  2. primer nombre guardado, respuesta perdida, otra sesión confirma un
     segundo nombre y llega el reintento del primero: **queda el segundo**,
     con 2 cupos;
  3. rechazo con la respuesta perdida: **1 cupo**;
  4. reintentos sucesivos del mismo intento: un efecto, un cupo y la misma
     marca;
  5. concurrencia: el mismo intento a la vez da un efecto; dos intentos a la
     vez, dos cupos, sin deadlock ni locks colgados.
- **Antes y después:**
  - **antes** (núcleo y adaptador de `8cbe0cd` contra su 019): **0 de 4**,
    con las fallas que describió Codex (nombre anterior pisado, cupo doble);
  - **después: 5 de 5.**
- **Qué se simula:** la pérdida de respuesta, un `fetch` que descarta la
  respuesta después del commit, y la intercalación de la otra sesión.

## A2 — aplicar los cambios de disponibilidad al cargar más

**Solución.**
- **Reductor puro** en `lib/comunidad/perfil-nucleo.ts`: `alCargarPerfil` y
  `alLlegarMasPerfil` operan sobre una sola vista `{cabecera, apagado, lista}`.
- **Cambio de disponibilidad:** si una página responde `bloqueado`,
  `eliminada` o `activo: false`, el estado se aplica.
  - Se retiran nombre, avatar y reseñas, sin aviso de error.
  - El número de pedido avanza, así ninguna respuesta pendiente puede
    restaurar lo anterior.
  - Una recarga en vuelo también se invalida (frontera).
- **Qué no se aplica:** la respuesta de otra cuenta, de otro perfil o de un
  pedido superado no cambia nada. Una página activa de otro perfil cuenta como
  falla.
- **Falla real** (red, HTTP, forma): conserva cabecera y páginas y deja
  reintentar.
- **Componente:** `PerfilComunitario` usa ese reductor y ya no tiene estados
  separados de cabecera y lista.

**Regresiones:**
- **Unitarias (2 nuevas):** bloqueado, eliminada y apagado; respuestas
  superadas; fallas reales.
- **Batería real (`pruebas-perfiles`):** respuestas reales de la ruta con
  bloqueo desde otra sesión, baja con el flujo de la app, módulo apagado,
  respuesta tardía tras un bloqueo y falla de red.
- **Antes y después:**
  - con `PANTALLA=antes` (transcripción literal del manejador de `8cbe0cd`)
    fallan bloqueo, baja y apagado: 22/25;
  - con el reductor, **25/25**.

**Navegador local, componentes reales y clics reales** (11 capturas en
`docs/medidas/2026-10-27-e6-a1a2-recorrido/`):
- **Escritorio:**
  - "Cargar más" tras un bloqueo en otra sesión → "Usuario bloqueado";
  - falla de red → se conservan las 5 y "Reintentar" completa 6 únicas;
  - **respuesta tardía:** "Cargar más" demorado 30 s, bloqueo desde el menú
    de la reseña y la página vieja que llega después: no restaura nada;
  - módulo apagado → "La comunidad no está disponible.";
  - baja del autor → "Cuenta eliminada".
- **375 px:** bloqueo, red y reintento, módulo apagado y baja, con el mismo
  resultado.
- **A1 en la interfaz:** cambio de nombre a 375 px; el cuerpo lleva
  `id_intento`.

## Verificación final (después de la última corrección)

| Prueba | Resultado |
|---|---|
| up/down/up de 019 | 5/5 (el volcado sin 019 es idéntico al de E6) |
| `pruebas-nombre-intento` (nueva) | 5/5 |
| `pruebas-perfiles` | 25/25 |
| Permisos (firma nueva en el inventario) | 29/29 |
| Escritura (usa `intentos`, cuyo CHECK cambió) | 43/43 |
| **`npm test` completo** | **2500 pasan, 0 fallan, 16 omitidas** (cierra la corrida incompleta de E6) |
| `tsc` | 0 |

No repetí lectura, voto en la lista, utilidad ni moderación: A1/A2 no tocan
sus funciones ni su núcleo.

## Simulaciones y limitaciones

- **Simulado:** la pérdida de respuestas (inyectada en el adaptador), la
  falla de red y la demora (interceptor de `fetch`), y "otra sesión" (un
  script con las funciones reales y el mismo uid).
- **Ajuste posterior al recorrido:** el recorrido del nombre en la interfaz se
  hizo antes de sacar el nombre del registro de intentos y pasar el hash a
  HMAC. Ese ajuste no cambia la interfaz ni el pedido, y las baterías se
  repitieron después de él.
- **Capturas:**
  - el panel a veces devolvió un cuadro anterior; confirmé cada estado por
    DOM y repetí la captura tras forzar un repintado;
  - en escritorio uso zoom CSS 0,6 y, sólo para la captura de la falla de
    red, relleno inferior en `<main>`.
- **Retención:** los intentos de nombre, como los de publicar, quedan hasta
  la purga de E8 (7 días). No llevan nombre y su hash no es adivinable sin el
  secreto. La baja no los borra; no cambié la baja.
- **Pendientes heredados:** `/api/title` en ejecución, integración con TMDB,
  tema claro, teléfono/Android y lector de pantalla.

## Limpieza

- Borré sólo mis cuentas y datos de cada batería y del recorrido.
- La base quedó como al empezar:
  - 6 participantes, 2 versiones, 42 cuentas y 2 suspensiones;
  - 0 órdenes, locks, decisiones e intentos de nombre;
  - límites 5/10/100/10/3/50;
  - módulo, publicación, Top Yumpers y muestreo apagados;
  - `SELECT` de `profiles` revocado;
  - 019 corregida aplicada.
- Sesión borrada del navegador y servidor detenido.
