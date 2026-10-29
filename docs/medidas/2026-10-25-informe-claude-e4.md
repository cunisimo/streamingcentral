# E4 local: moderación administrativa — 25/10/2026

Claude, en `feat/resenas-reglas` (worktree `wt-resenas-comunidad`), sobre
`ce26526`. Autorizada por el dueño. Sólo Supabase local, el entorno local de
prueba y datos ficticios. Sin E0, Producción, servicios externos, gastos, push,
merge, deploy ni AAB.

Auditoría de cierre de E3b copiada sin cambios del checkout principal:
`docs/medidas/2026-10-25-auditoria-e3b-a1a2-ce26526.md` (SHA-256 `ccb5cce4…`,
igual al original). E3b queda cerrada; ESTADO lo concilia.

## Qué hace

**Acceso.** `/admin/moderacion`, en la navegación del dashboard (Top semanal ·
Moderación · Reseñas editoriales).

**Panel.**
- Resumen:
  - publicación activa o pausada, con el botón para cambiarla;
  - retenidos sin resolver, con la aclaración de que 50 es el tope de admisión
    y la corroboración puede superarlo;
  - casos de denuncias y cuántos son graves;
  - suspensiones vigentes y bajas pendientes;
  - muestreo apagado (pendiente de P6).
- Cuatro secciones, con paginación por cursor ("Cargar más"):
  - **Retenidos**, por prioridad: primero los retenidos tras una denuncia,
    después las revisiones pedidas y después lo retenido al enviar; dentro,
    lo más antiguo primero;
  - **Denuncias**, agrupadas por versión, en el orden de E3b: graves primero,
    después el peso de quienes denunciaron y después lo más antiguo.
    Muestran categorías, comentarios (sólo para el panel) y la situación
    actual de la versión;
  - **Cuentas**: suspensiones vigentes y bajas pendientes;
  - **Registro** de decisiones.
- En cada caso, el texto, la regla y lo mínimo del autor: un código seudónimo
  (P-XXXXXX) y sus conteos (publicadas, retenidas, rechazadas, retiradas,
  denuncias abiertas y suspensiones). Nunca correo ni nombre.

**Acciones.** Todas piden motivo (3–300), muestran el efecto antes de
confirmar y quedan registradas con admin, motivo, versión y estado previo.

| Acción | Qué hace |
|---|---|
| Publicar | Retenida o revisión pedida → publicada |
| Rechazar | Retenida o revisión pedida → rechazada |
| Retirar | Publicada → oculta |
| Restaurar | Oculta → publicada |
| Descartar denuncias | Las abiertas pasan a descartadas |
| Cerrar el caso | Las abiertas pasan a resueltas; sólo si la versión ya no se ve |
| Suspender / levantar la suspensión | Abre o cierra la suspensión del participante |
| Quitar el marcador de baja | Cancela el marcador (B10, B14) |
| Pausar / reanudar la publicación | Cambia el interruptor T4 |

- Las acciones de revisión pedida quedan registradas como falso positivo
  cuando se publica.
- Rechazar y retirar resuelven además las denuncias abiertas de esa versión.

**El autor** ve "Rechazada por moderación" u "Oculta por moderación" en su
reseña, y puede corregirla o borrarla.

## Seguridad y consistencia

**Permisos, el mismo mecanismo que el Top:**
- la ruta usa `adminDeToken` y llama a la base con la sesión del admin
  (`supabaseComoUsuario`), nunca con `service_role`;
- cada función `comunidad_admin_*` y `comunidad_quitar_marcador_baja` es
  ejecutable sólo por `authenticated`;
- cada una comprueba `is_admin_mfa()` en su primera línea, antes de cualquier
  lock, y responde 42501 si falla;
- `service_role` queda denegado porque no tiene `auth.uid()`;
- el admin que decide sale del token: un `admin_id` en el cuerpo no cambia
  nada (probado).

**Protocolo de locks.**
- El paso 1 del admin es `proto_admin`: toma K_CORTE compartido y, sólo al
  quitar un marcador, el K_CUENTA de esa cuenta.
- Después sigue el orden global de entidades, relee y toma la marca.
- Una decisión se ata a una versión. Si dejó de ser la vigente, la reseña se
  borró o la cuenta se dio de baja, no aplica nada: responde conflicto o no
  disponible.
- Nunca publica otra versión, nunca resucita una reseña borrada y nunca toca
  una baja.

**Votos y tramos.**
- Retirar y rechazar cierran los tramos abiertos de la versión.
- Publicar o restaurar reabre el tramo sólo de los votos positivos vigentes
  que ya tenían tramo en esa versión, con su mes original.
- Un retenido que nunca se publicó no tiene votos: no se inventa ninguno.
- El índice único impide duplicar tramos.

**Reintentos.**
- Cada decisión lleva un intento.
- El mismo intento devuelve lo registrado, sin otra fila.
- Con otro objetivo, el mismo intento es conflicto.
- Una respuesta perdida se repite una vez en el servidor; si tampoco se
  confirma, el panel dice "No sabemos si se aplicó" y reintenta con el mismo
  intento.

**Cambio de cuenta.** El panel usa la misma frontera de E3b: se monta por
cuenta, descarta respuestas viejas y manda el token sólo si la sesión sigue
siendo de esa cuenta.

## Pendiente de denuncias recibidas: qué se implementó y qué decide el dueño

**El contrato documentado.**
- La fila de retención dice "Denuncias: hasta cerrar el caso + 30 días".
- El paso 1 de la baja borra las reseñas, y con ellas caían en cascada las
  denuncias que otros hicieron, también las abiertas, sin rastro.
- El borrado propio de una reseña es lógico (`borrada_en`): ahí las denuncias
  no se pierden. El caso queda en la cola como "Borrada por el autor" y se
  archiva con "Cerrar el caso".

**Implementado** (no necesita una decisión nueva, minimiza datos y respeta la
eliminación):
- Antes de borrar, la baja copia cada denuncia recibida a
  `comunidad.denuncias_cerradas` con lo mínimo:
  - quién denunció (seudónimo);
  - la categoría;
  - el estado final (las abiertas quedan `cerrada_por_baja`);
  - las fechas.
- No se guarda el texto de la reseña, ni el comentario de quien denunció, ni
  ningún vínculo con el autor.
- Sirve para tres cosas:
  - la denuncia no desaparece en silencio;
  - el caso queda cerrado con su fecha, así que el plazo pendiente de P3
    (cierre + 30 días) tiene de dónde contarse;
  - el peso de quien denunció (sus descartadas) no cambia porque se borró
    otra cuenta.
- Se borra con la baja de quien denunció.
- El registro de decisiones sobrevive sin vínculo con la cuenta: el
  participante queda como seudónimo huérfano.
- No fija ningún plazo nuevo. La purga es de E8.

**No implementado: conservar el texto denunciado después de la baja.** Sería
una excepción de preservación (diseño §3.6), y eso lo decide el dueño.
Propuesta concreta para decidir con P3:
1. **Opción A (lo implementado):** el texto se borra con la cuenta y el caso se
   cierra como `cerrada_por_baja`. No hay evidencia del contenido si después
   hiciera falta.
2. **Opción B:** para denuncias abiertas de categorías graves
   (`sexual_explotacion`, `datos_personales`, `acoso_amenazas`,
   `phishing_estafa`), conservar una copia del texto en una tabla restringida,
   sin vínculo con la cuenta, por un plazo X. Requiere decidir:
   - las categorías;
   - el plazo;
   - quién la ve y la base legal (validación competente).
   La baja no se bloquea en ningún caso.
3. **Opción C:** como B, pero para toda denuncia abierta.

Lo que el dueño tendría que decidir: si alcanza con A o se agrega B o C, y en
ese caso las categorías, el plazo y la validación.

## Pruebas

**Reales** (funciones de 016 y E3 contra `supabase start`, Auth local con TOTP
reales, PostgREST, sesiones psql y la ruta del servidor local):

| Batería | Resultado |
|---|---|
| `pruebas-admin.mjs` (nueva) | 32/32 |
| `up-down-up-016.mjs` (nueva) | 5/5 |
| Permisos (tablas y RPC nuevas) | 28/28 |
| Invariantes (transiciones y suspensiones) | 85/85 |
| Baja (`limpiar_participante`) | 26/26 |
| Moderación de E3b (`cola_denuncias`) | 46/46 |
| Escritura de E3a (transición nueva) | 43/43 |

Las cinco últimas son baterías anteriores, repetidas porque cambió algo de lo
que dependen (entre paréntesis).

`pruebas-admin.mjs` cubre:
- **Permisos:**
  - catálogo;
  - RPC directo por REST: anon, usuario común, admin AAL1 y service_role reciben
    401 o 403 con 42501 en las 11 funciones, y el admin AAL2 recibe 200;
  - la ruta: 401 sin token, 403 para el usuario común y el admin AAL1, 200
    para el admin AAL2;
  - `private, no-store`;
  - el admin sale del token.
- **Decisiones:**
  - publicar, rechazar (y que el autor corrija), revisión pedida como falso
    positivo, retirar y restaurar con votos (tramos y mes original);
  - versión vieja, reseña borrada y cuenta en baja;
  - decisiones simultáneas, el mismo intento y una respuesta perdida
    después del commit;
  - descartar (el peso baja a la mitad) y cerrar;
  - un ataque de denuncias graves: la reseña sigue visible y sube en la cola;
    "No me sirvió" masivo no cambia nada.
- **Suspensión:**
  - las filas A a D de la matriz;
  - una cuenta en baja;
  - el **caso 5a/5b con las funciones de producto** (gate de E4);
  - una decisión y una edición en paralelo.
- **Baja:**
  - **B10 y B14 con `comunidad_quitar_marcador_baja` real**;
  - levantar una sanción con plazo;
  - las denuncias recibidas en la baja;
  - quitar el marcador mientras la baja confirma.
- **Resto:** pausa, colas y registro paginados sin repetir, y el muestreo.

**Navegador real** (app local, escritorio y 375 px, 12 capturas en
`docs/medidas/2026-10-25-e4-recorrido/`):
- publicar, rechazar con la respuesta perdida y reintento, retirar, descartar,
  quitar el marcador, pausar y el registro;
- el cambio de admin A a B con una respuesta tardía de A descartada;
- el cierre de sesión con un pedido pendiente.

Lo **simulado** en ese recorrido es la respuesta perdida y la demora (un
interceptor en la página). El cambio de cuenta usa el mismo mecanismo que un
inicio de sesión en otra pestaña.

**Preliminares:** 13 unitarias (núcleo, adaptador con base falsa, barridos);
`npm test` 2458 pasan, 0 fallan, 16 omitidas; `tsc` sin errores.

**No repetidas:**
- `pruebas-concurrencia` (E2c): no cambiaron las primitivas de 013, y el caso
  5 ahora está en `pruebas-admin`.
- `up-down-up-015`: `up-down-up-016` comprueba que la bajada restaura las
  definiciones de 015.

**Hallazgos del trabajo, corregidos:**
- `safeupdate` de PostgREST rechazaba el `UPDATE` de la configuración sin
  `WHERE`.
- El botón de rechazar no tenía fondo fuera de los diálogos.
- Faltaban plurales.
- El texto del efecto de descartar tenía un error de concordancia.

**Entorno local.**
- La base de `supabase start` no da `SELECT` de `public.profiles` a
  `authenticated`, así que `adminDeToken` respondía 503. Al panel del Top le
  pasa lo mismo en local.
- La batería y el recorrido lo conceden sólo mientras corren y lo revocan al
  terminar.
- Producción lo tiene (el dashboard funciona), pero eso no está verificado en
  E0.

**Limpieza:**
- Sólo lo creado por mí: cuentas, participantes y sus decisiones.
- Un participante huérfano del recorrido se identificó por su fecha y se
  borró.
- Base al terminar: 6 participantes, 2 versiones y 42 cuentas
  `@comunidad.test`.
- Interruptores (también la publicación) y muestreo apagados.
- Límites como estaban.

## Decisiones a auditar

1. **La suspensión no cierra tramos.** El diseño §2.2.2 lista "suspender" entre
   lo que cierra tramos. Lo implementé como intervalo en `suspensiones`
   porque el cómputo al corte ya excluye los pares con una suspensión que
   rige. Cerrar también los tramos obligaría a reabrirlos al levantarla.
2. **Reabrir tramos al publicar o restaurar**: sólo si ya había tramo en esa
   versión, y con su mes original.
3. **Invariantes ampliadas en 016:**
   - `rechazada → reemplazada`: sin esto, una reseña rechazada no se podía
     corregir;
   - una suspensión con fin futuro se puede acortar, nunca alargar ni llevarse
     al pasado.
4. **Publicar no toca las denuncias abiertas**; rechazar y retirar las
   resuelven. "Cerrar el caso" sólo vale si el contenido ya no se ve.
5. **La pausa no frena una escritura que ya leyó la configuración** antes de
   confirmar.
6. **La suspensión es sin plazo** hasta levantarla; el panel no fija plazos.
7. **El muestreo existe pero queda apagado**, sin interruptor en el panel; se
   cambia por configuración, después de P6.
8. **Bajas pendientes:** el panel muestra el uuid de la cuenta, no el correo.

## No verificado

- Teléfono real, Android y tema claro.
- Lector de pantalla.
- La ficha con TMDB mostrando "Rechazada por moderación": quedó cubierto por
  la lectura real y la etiqueta, no visualmente.
- Una caída real de red.
- Un inicio de sesión con TOTP tecleado en `/admin/mfa`: la sesión AAL2 se
  obtuvo con los mismos factores reales desde el script.
- Producción.

**Rollback:** `016_comunidad_admin_down.sql` (probado con up/down/up) y quitar
la ruta y el panel.

Salidas: `docs/medidas/2026-10-25-e4-salidas.txt`.
