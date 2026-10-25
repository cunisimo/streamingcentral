# Auditoría focalizada de la corrección A1 de E2c — 24/10/2026

Codex. Rama `feat/resenas-reglas`, checkout
`D:/DESARROLLO/stream central/wt-resenas-comunidad`, HEAD `f67ff90`.
Revisados `7b33702`, `b4aa75b` y `f67ff90`, contra `cd62577`.
Sin cambios de código por Codex.

## Dictamen

**A1 queda cerrado. La auditoría de E2c local queda cerrada, sin nuevos
hallazgos bloqueantes en la corrección revisada.**

La definición aplicada de `resolver_participante` ya no bloquea primero la
fila del actor; el conjunto se bloquea en el paso ordenado. No cambió la
lógica de marcador, creación de identidad ni copia de sanción. La revisión
de E2b y su aviso se mantienen cerradas.

El siguiente trabajo es E3a local cuando el dueño lo autorice. No se requiere
otra ronda de diseño de moderación ni una entrega adicional para un
inventario automático antes de avanzar. El inventario de cómo las funciones
de producto usan el protocolo sigue correspondiendo a las entregas que las
creen; no es motivo para mantener abierta esta corrección.

## Evidencia nueva de Codex

- **Regresión cruzada: 1/1**, exit 0, mediante
  `SOLO=cruce node --env-file=.env.comunidad-local scripts/comunidad/pruebas-concurrencia.mjs`.
  Dos cuentas reales del Auth local con reseñas de fixture; ambas sesiones
  detenidas después de `proto_cuenta`; un tercero encontró **A=libre,
  B=libre**. Ambas evaluaciones confirmaron, sin 40P01 ni CB002, con un voto
  y tramo abierto válido por actor.
- Limpieza de esa corrida: **2 cuentas y 2 participantes**, restos
  `0|0|0|0` para cuentas, participantes, sesiones y advisory locks.
  El log resumido de la corrida informó 0 deadlocks y 0 lock timeouts.
- **Controles adicionales en una única transacción local revertida** con
  fixtures ficticias: resolver identidad existente; rechazar con CB001 una
  baja pendiente; aplicar baja y desvincular; copiar sanción sin plazo;
  cancelar el marcador; crear una identidad distinta sin duplicarla;
  mantener la sanción nueva y el intervalo histórico; reactivar la baja y
  volver a desvincular. Todas las aserciones pasaron y se aplicaron los
  constraints inmediatos antes del rollback.
- Catálogo real: `resolver_participante` sigue sin EXECUTE para PUBLIC,
  `anon`, `authenticated` y `service_role`.
- Comparación programática de los SQL:
  - la definición de `resolver_participante` en 013_down es **idéntica** a
    la de 012;
  - la redefinición de 013 difiere de 012 únicamente en quitar el
    `FOR UPDATE` del SELECT de identidad y agregar su comentario;
  - `tomar_cuenta` y el rechazo del marcador permanecen presentes.
- Auditoría anterior copiada sin cambios: SHA-256 igual en checkout
  principal y rama (`20e341a01f26b037eacf44843ef3340c0807eef92359af6ee1329d28e05bccfd`).
- `git diff cd62577..HEAD --check`: exit 0.

Se verificó el motor local mediante el guardián existente: contexto
`desktop-linux`, tubería `npipe:////./pipe/dockerDesktopLinuxEngine`,
contenedor `supabase_db_streamingcentral`, API `127.0.0.1:54321`.
No se imprimieron claves ni se utilizó `.env.local`.

## Alcance de la corrección

La exclusión por cuenta sigue tomándose antes de leer el participante y el
marcador. Se quitó el bloqueo de fila prematuro; el protocolo explícito por
cuenta se conserva. Para una identidad nueva siguen existiendo los bloqueos
implícitos de sus propias inserciones y FK, documentados en 013; no se
expone antes de confirmar para que otro actor la tome como identidad visible.

No se modificó la excepción ya documentada de bajas directas de Auth ni se
promete eliminar los deadlocks de caminos que violen el orden o no pasen por
el protocolo.

La precisión sobre la víctima del deadlock deliberado fue incorporada: el
resultado observado no garantiza cuál sesión abortará. La prueba conserva
la aceptación de cualquiera de las dos víctimas y verifica la reversión.

## Evidencia de Claude y límites

Leídos el informe `2026-10-24-informe-claude-e2c-a1.md`, su log, la regresión,
la modificación del ejecutor de reversión, up/down, estado y plan.

El log registra tres fallos anteriores y tres éxitos posteriores de la
regresión, up/down/up 15/15, baja 26/26 y concurrencia 21/21 en cinco corridas.
**No se repitieron esas baterías completas ni los ciclos destructivos** en
esta auditoría focalizada. Son evidencia de Claude, además de la corrida y
los controles nuevos de Codex indicados arriba. El fallo anterior también
había sido reproducido dos veces por Codex en la auditoría de `cd62577`.

No hubo cambios de TypeScript ni de la app en esta corrección, y no se
repitieron tipado, suite general, salas, navegador ni builds. Las operaciones
de concurrencia siguen siendo **fixtures preliminares**: se mantienen los
gates de E3a/E4/E7 con las futuras funciones de producto. No se aprueban por
adelantado esas funciones.

Sin reiniciar la base compartida, limpiar cuentas ajenas, consultas a
Producción, E0, servicios externos, gastos, push, merge, deploy o AAB.
E1, retención, N y publicación mantienen sus pendientes; esta conclusión
no equivale a autorización de publicación.
