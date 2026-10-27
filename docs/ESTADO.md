# Estado de Yump

> **Estado canónico. Actualizado el 21 de octubre de 2026.**
> Leer este bloque antes de los antecedentes históricos. Arquitectura y reglas:
> [`CLAUDE.md`](../CLAUDE.md). Problemas históricos: [`ISSUES.md`](ISSUES.md).
> No duplicar este estado en otros manuales: enlazarlo.

## Resumen vigente — 21/10/2026 (qué está hecho y qué falta)

**Leer esto primero.** Esta sección reemplaza a las anteriores "Estado de
producto e integración" y "Próximo trabajo, en orden" (09/09), que habían
quedado viejas. El detalle y la evidencia de cada punto están en las entradas
de "Evidencia y alcance" (abajo, de la más nueva a la más vieja); lo que está
debajo de "Antecedentes anteriores al 09/09/2026" es histórico. Categorías de evidencia: **Git** (commit en `main`),
**deploy** (deployment de Vercel *Production – streamingcentral* en la API
pública de deployments de GitHub, estado `success`), **dueño** (informado por
el dueño), **Producción** (comprobado contra `app.yump.ar`).

**Producción web.** Último cambio de CÓDIGO en `main`: `09cc2ee` (Top
exclusivamente manual), desplegado el 20/10 con `main` = `915ef2e` (deploy
7210383316). Los commits posteriores en `main` son sólo de
documentación (su deploy se registra en la entrada de cada uno). Todo el
código de `main` está en Producción. Entregas recientes,
todas con deploy `success`: Yumpeá `2af1a37` (27/09, 6698094206), filmografía
v2 `95bf527` (29/09, 6744925544), 1.2.0 —badge, RESEÑAS, filtro de Mi lista—
`072e227` (05/10, 6871735270), ruleta incremental `3eface7`/`dcc8c6e` (09/10),
acceso al dashboard `7937b4c` (19/10, aprobado por el dueño en Producción).

**Hecho (no volver a listarlo como pendiente):**
- Android/Capacitor integrado en `main` con CORS (`lib/cors.ts`, merge
  `fd2cd23`); release contra `https://app.yump.ar`.
- Yumpeá (salas compartidas) en Producción: `009_salas.sql` aplicada y
  `sala_config.activas` encendida (dueño, 27/09); `assetlinks.json` publicado
  (Producción: 200) y App Links de `/sala/` y `/titulo/` en el manifest.
- Top manual en `/admin/top` (merge `c993d7c`): el dueño lo usa desde el 09/09.
  En Producción `/top` ya sirve los 12 bloques manuales (comprobado el 20/10);
  el código que retira toda fuente alternativa está en rama (pendiente 3b).
- Acceso al dashboard: implementado, integrado (`7937b4c`), desplegado
  (7183850925) y aprobado por el dueño en su prueba de Producción del 19/10.
  Configuración de cuentas hecha por el dueño: se administra con la cuenta
  ADICIONAL; la personal conserva su rol de administrador y sus dos factores
  2FA (comprobado sólo lectura el 19/10).
- Disponibilidad centralizada (`3b075b7`), evidencia oficial (`9c4d595`),
  tandas 2 y 3 del idioma (`es-MX` en Producción), etapas de capacidad PREVIA,
  0, 1, 2, 3.a, 3.b y 3.c.1 (todas en `main` y desplegadas).
- Eliminación de cuenta en la app (`lib/eliminar-cuenta.ts`, merge
  `2d1e959`) y la página pública en `yump.ar/eliminar-cuenta/`
  (`docs/PLAY-STORE.md`).

**Migraciones.** Regla: **no repetir ninguna migración basándose en notas
históricas** (instrucciones como "pendiente de ejecutar" o "va antes del
deploy" en las entradas viejas están supersedidas). Esto NO afirma que todas
estén aplicadas: cada una tiene su evidencia, de distinta fuerza.
- **006:** aplicada (registrada en la tanda 3).
- **007:** **evidencia funcional indirecta**, no comprobación directa: el
  dueño usa `/admin/top` desde el 09/09 y el 19/10 completó en Producción login,
  2FA y carga del panel con la cuenta adicional. El panel trabaja sobre objetos
  que crea la 007 (`top_rankings`, `top_ranking_entries`, `publicar_top`,
  `is_admin_mfa()`), así que su uso exitoso indica que existen. No hay registro de que el archivo se
  haya ejecutado íntegro ni de que se haya corrido `supabase/verificar-007.sql`.
- **008:** comprobada contra Producción el 19/10: `/api/upcoming` responde 200
  y lee `original_language` (sin la columna devolvería 500).
- **009:** aplicada por el dueño el 27/09 y verificada con RPC.
- **010:** aplicada a mano el 08/10.
- **001–003 y 005:** sin registro individual; las funciones que dependen de
  ellas (chips, ruleta, "No es para mí") funcionan en Producción (evidencia
  funcional indirecta).
- **`004_news.sql`:** **SIN VERIFICAR.** No está en el repo (existe sólo como
  archivo sin seguimiento en el checkout principal) y su estado en la base no
  se comprobó. Que esté sin verificar **no autoriza ejecutarla**: es una
  decisión del dueño, aparte.

El proyecto no usa el historial del CLI (`[db.migrations] enabled = false`),
así que no hay una tabla de migraciones aplicadas que consultar.

**Google Play (informado por el dueño):** AAB `2 (1.0.0)` en Alpha (28/09);
AAB `3 (1.1.0)` en Alpha (3/10) y acceso a Producción pedido a Google
(3/10). AAB `4 (1.2.0)` generado el 05/10 desde `072e227` (SHA-256
`39f6ccd0…a03cab`). **El 20/10/2026 el dueño confirmó con una captura de Play
Console que la versión `4 (1.2.0)` está en Producción desde el 07/10/2026**
(Claude vio la confirmación del dueño, no la consola). De ahí se sigue que el
acceso a Producción se concedió; la fecha y el texto de la respuesta de Google
no están registrados. El repo está en `versionCode 4` / `1.2.0`: el próximo
AAB tiene que ser `5` o mayor.

**Pendiente, con lo que falta para cerrarlo:**
1. ~~**AAB 4**~~ — **resuelto (20/10/2026, informado por el dueño con
   captura):** `4 (1.2.0)` en Producción de Play desde el 07/10/2026.
2. ~~**Acceso a Producción de Play**~~ — resuelto por lo anterior (la versión
   está en Producción); la respuesta de Google en sí no quedó registrada.
3. **Segundo proyecto de Vercel `wt-integracion-3c1`** (investigado sólo
   leyendo el 20/10/2026; el panel de Vercel NO se pudo ver: el token local
   de la CLI venció el 21/09 y no se renovó). **Comprobado (GitHub y HTTP
   públicos):** está conectado al mismo repositorio; desde el 19/09/2026 cada
   push a `main` genera además un deploy *Production – wt-integracion-3c1*
   (9 en total, el último `7937b4c` el 19/10, `success`) y las ramas generan
   Previews (3); publica su commit status `Vercel – wt-integracion-3c1` en
   cada commit (`main` no tiene protección de rama que lo exija). Su dominio
   `wt-integracion-3c1.vercel.app` sirve Yump **en público** (200), pero sin
   la configuración de Producción: los chunks no traen la URL de Supabase y
   `/api/providers` devuelve `{"providers":[]}`; las URLs de equipo y de
   cada deployment piden login de Vercel. **Origen probable (inferido):** la
   carpeta `wt-integracion-3c1/.vercel/` se enlazó el 19/09 a las 16:28 UTC,
   minutos después de que la integración de la 3.c.1 consultara su deploy con
   la CLI desde esa worktree, y el primer deploy del proyecto es de las 16:35
   UTC; el mismo accidente (CLI sin `.vercel/` → proyecto nuevo) ya había
   pasado con `wt-spike-waituntil`. **Sin referencias** en código, Android,
   CORS ni documentación operativa. **Sin verificar (requiere el panel):**
   variables de entorno, dominios extra, el cron semanal de `vercel.json`
   (correría también ahí; sin `CRON_SECRET` respondería 401) y consumo.
   Decisión del dueño, aparte; Claude no tocó nada.
   **Actualización 20/10/2026 (informado por el dueño):** desconectó Git del
   proyecto y apagó sus Cron Jobs; **el proyecto NO se eliminó**. Comprobado
   después (HTTP público): `wt-integracion-3c1.vercel.app` sigue respondiendo
   200 con el último deployment. Que un push a `main` ya no genere deploys de
   ese proyecto se podrá comprobar recién con el próximo push (GitHub
   deployments). Queda decidir si se elimina. **Comprobado con el push del
   20/10 (`915ef2e`):** GitHub registra UN solo deployment (entorno
   "Production", contexto "Vercel"), ninguno de `wt-integracion-3c1`: el
   proyecto ya no despliega desde Git.
3b. **Top exclusivamente manual — INTEGRADO Y DESPLEGADO (20/10/2026).**
   Decisión del dueño (20/10): el Top de TODAS las plataformas, Netflix
   incluida, usa sólo sus publicaciones de `/admin/top`; no existe ninguna
   fuente alternativa. Que `netflix_top10` no se actualice **no es una
   avería**. **Git:** `main` avanzó por fast-forward `70757a4` → `915ef2e`
   (código en `09cc2ee`). **Deploy:** 7210383316, `success` 20:32:33 UTC.
   **Prueba local del dueño:** OK (20/10). Deploy re-comprobado el 21/10
   (API pública de GitHub: 7210383316, `915ef2e`, Production, `success`).
   **Falta (del dueño):** (1) en el panel de Vercel, confirmar que
   `streamingcentral` ya no lista el cron; (2) probar el Top en la web de
   Producción y en la app Android 1.2.0 instalada; (3) decidir si se borra
   `CRON_SECRET` de Vercel (sin uso; no se tocó). ⚠️ El commit `06f3c59`
   (rama `feat/compartir-invitacion`) había anotado (1) y (2) como hechas
   ("Pruebas OK", informado por el dueño); la sesión de integración del 21/10
   no tiene esa confirmación explícita, así que quedan PENDIENTES hasta que el
   dueño la dé.
   Detalle en las entradas del Top de "Evidencia y alcance".
3c. **Yumpeá: "Compartir invitación" en el lobby + ícono de "Compartir" del
   resultado — DESARROLLO Y PRUEBA LOCAL TERMINADOS; integración a `main` y
   deploy PENDIENTES DE AUTORIZACIÓN (21/10/2026).** Rama
   `integracion/yumpea-compartir` (worktree `wt-integracion-compartir`, desde
   `origin/main` `915ef2e`), local, sin push: une por merge
   `feat/compartir-invitacion` (`f0fc85c`, `2d260e6`, `06f3c59`, sobre
   `88c5120`) y `fix/icono-compartir-match` (`f49ff65`). **Prueba local
   aprobada por el dueño (21/10)**, sobre el build local con Supabase SIMULADO:
   no hubo salas reales, WhatsApp real, teléfono ni Producción. Auditoría de
   Codex sobre `298555a` sin defectos bloqueantes. **Falta:** merge a `main` y
   deploy con autorización del dueño (con eso llega a la web y la PWA).
   **Android:** NO tiene release propia; estos cambios viajan en el MISMO AAB
   que el futuro sistema de reseñas de usuarios (decisión del dueño, 21/10;
   versión y `versionCode` sin fijar). Opcional, no requisito de cierre: el
   recorrido con una sala real descripto en "Evidencia y alcance".
3d. **Reseñas de usuarios y Top Yumpers — EN DISEÑO (21/10/2026).** Diseño
   de Codex y revisión de Claude en la rama local `docs/resenas-comunidad`
   (sólo documentación). Nada implementado ni autorizado.
   **Decisión del dueño (21/10): sin gastos adicionales.** No hay API paga,
   banco pago, tope de USD 10, servicios nuevos ni upgrades, y tampoco
   transferencia a una API gratuita. La revisión v3 propone moderación por
   reglas propias, sin clasificador externo. Codex auditó la v3.1
   (`e34c53e`); el contrato de baja quedó cerrado en la revisión §2.2.3.
   **Plan preparado** (22/10):
   `docs/superpowers/plans/2026-10-22-resenas-comunidad.md`, entregas
   E0–E9c; corregido tras la auditoría de Codex sobre `9450006`.
   **E1 y su corrección E1.1 (reglas puras y banco sintético)
   implementadas en local**, rama `feat/resenas-reglas`, sin conectar a
   nada.
   - **E1 no cumple su aceptación.** La auditoría de `ffa5061` lo confirmó.
   - **E1.1 tampoco:** el reservado 2, más grande y escrito en su mayor parte
     por un agente que no conocía las reglas, **no cumple C1 ni C2** (12 de
     124 contactos claros sin detectar; 87,2 % de ofuscadas detectadas).
   - **E1.2** corrige huecos mecánicos y familias divulgadas. La auditoría de
     `40288f6` encontró dos huecos (terminaciones largas en enlaces con ruta y
     correo incompleto o indirecto), corregidos en local el 22/10 (ver
     "Corrección de E1.2" abajo). La auditoría de `251f3d0` encontró dos huecos
     en esas mismas familias (inicio de ruta y criterio de alias), corregidos
     en local el 22/10 (ver "Segunda corrección de E1.2" abajo). Codex la
     aprobó en `a8e973a` para medir. **Reservado 3 híbrido (23/10),
     ejecutado una vez: NO CUMPLE C1 (24/116 claros sin detectar) ni C2
     (69/99).** C3 y C4 se cumplen (0/160). Ver "Reservado 3" abajo.
   - **Sí hubo una medición.** Fue **híbrida**: la parte general (340 casos,
     124 reseñas de abuso) la escribió un agente separado, según la autoría
     declarada, y la parte sensible (36 casos) la escribió Claude, no
     independiente. **No fue una validación independiente integral**, y su
     resultado **no aprueba E1**. Codex lo confirmó en
     `docs/medidas/2026-10-23-auditoria-reservado-3-4183d37.md`.
   - **E1 sigue sin aprobarse.** No hay más parches ni otro reservado
     autorizados, y no se avanza a E2.
   - **Propuesta de alcance, v2.1 (23/10, sólo documentación, pendiente de
     Codex y del dueño):**
     - `docs/medidas/2026-10-23-propuesta-alcance-moderacion.md`;
     - catálogo, todavía **borrador**:
       `docs/medidas/2026-10-23-catalogo-moderacion-propuesto.md`.

     **La v2 corrigió la auditoría de `4ef9a51`:**
     - la evidencia es por versión; un solo conjunto independiente, y si
       falla queda fallido, sin aprobado por agotamiento;
     - catálogo con exclusiones cerradas;
     - operación de las dos colas con hipótesis marcadas;
     - el muestreo P6 figura como "no aceptado" (no "rechazado"); el
       contenido de `user_reviews` en Producción, como no verificado.

     **La v2.1 concilia la auditoría de `2bc6c1c`:**
     - CS por familia (H1, H2 reseñas, H2 nombres y H3), sin compensación
       por el agregado;
     - dos rutas de autoría para la parte sensible: independiente, o
       evidencia limitada que exige un dictamen y una aceptación específica;
     - prioridad única y casos mixtos: una exclusión no exime;
     - P-1 corregida: denunciar no oculta de inmediato y pausar no retira lo
       visible;
     - F1 sin separadores, S alineada con el generador, E8 separada de la
       restricción de generación.

     **v3 (23/10, auditoría de `cac5c50`):** el catálogo pasa a ser
     **candidato a aprobación**:
     - referencias fijadas por versión y huella: Unicode 18.0.0, UTS #39
       18.0.0 e IANA `2026102300`, **consultadas y no incorporadas**;
     - listas cerradas, ámbito de 25 palabras y generador (qué enumera y qué
       muestrea);
     - CS medido por el disparo de la familia sobre casos puros;
     - `_` en S;
     - E9 pendiente de aceptación y E8 como cobertura no certificada.

     Hay puntos abiertos con resolución propuesta en el catálogo §12.
     **v3.1 (23/10, auditoría de `77d8bda`):**
     - composición de F3 con espacios y terminaciones largas (F3-4, sin
       depender de IANA);
     - S3 con verbos de remisión al perfil (§6.R);
     - **la condición de uso de la lista de IANA queda pendiente de
       verificación** (no se afirma CC0);
     - las huellas figuran como calculadas por Claude, no verificadas por un
       segundo revisor.

     Las recomendaciones para P-1, E9, P-2 y P-4, todas pendientes de
     aceptación, están en la propuesta §10.
     **Contrato de moderación v1 (24/10):** el dueño aprobó como base de
     implementación el catálogo v3.2, con las dos enmiendas de `5982374` y
     la **variante sin IANA** (F3-2 y F3-6 sólo con T-fuerte: menor
     cobertura, registrada antes de implementar).
     - Exclusiones E1–E8 y E9 aceptadas para esta etapa, sin certificar.
     - La publicación sigue desactivada.
     - Revisión diaria de las colas, sin N acordado.
     - Autoría del conjunto final sin resolver.

     Archivo: `docs/medidas/2026-10-23-catalogo-moderacion-propuesto.md`
     (con el título del contrato v1).
     **Implementación local del contrato v1 (24/10, `7e6e5cd`; reglas
     `2026-10-24.1`, sin conectar):**
     - referencias Unicode 18.0.0 incorporadas (`e42b8de`), con huellas
       calculadas por Claude y todavía no verificadas por Codex;
     - F1–F4, S1–S5 y H1–H3, ámbito, tabla `regla → familia`, generador
       determinista (2091 casos al 100 %) y evaluador del contrato
       (`banco/evaluar-contrato.ts`);
     - `lib/comunidad`: 99 de 99; `tsc` 0 errores; `npm test` 2348 pruebas,
       2330 pasan, 0 fallan y 18 omitidas (exigen builds no hechos);
     - regresiones conocidas, **no independientes**: reservado 3 con C1 0/116,
       C2 99/99 y C3 1/160;
     - el contrato aplicado literalmente produce falsos positivos (importe +
       "número", "4K" + "tele", "M3GAN" + "pidan", diálogos con S2). Hay
       cambios propuestos y **no aplicados**, pendientes de decisión.

     Informe: `docs/medidas/2026-10-24-informe-claude-contrato-v1.md`.
     **Corrección de los cinco hallazgos de `bbb8fc7` (24/10, `3ff1643`;
     reglas `2026-10-24.2`):**
     - el evaluador mide sólo lo independiente y valida largos, contextos y
       formato;
     - la excepción de amenazas quedó acotada al propio fragmento;
     - el generador tiene 2871 casos, con una prueba de inventario contra el
       contrato y Unicode 18.0.0;
     - el salto de línea es fin de oración.

     Resultados: `lib/comunidad` 115 de 115; `tsc` 0 errores; `npm test` 2364
     pruebas, 2346 pasan, 0 fallan y 18 omitidas. Versión candidata y huellas
     en `docs/medidas/2026-10-24-informe-claude-correccion-contrato-v1.md`.
     **Cierre de la revisión local (24/10;
     `docs/medidas/2026-10-24-auditoria-focalizada-3ff1643.md`):** Codex
     verificó cuatro correcciones. El caso pendiente de A3 ("…un tiro la
     rompe esta peli", sin puntuación, se publica) queda como **riesgo
     residual aceptado por el dueño**: lo atienden las denuncias y su revisión
     diaria, y no se vuelve a corregir el filtro por ese ejemplo. **La
     validación independiente sigue pendiente; E1 no está aprobada.** El
     dueño autorizó **E2a local** mientras tanto, sin publicación.
     **E2a local (24/10, `1d045f3`; sólo `supabase start`, sin Producción):**
     - `011_comunidad_esquema.sql` (+ down): esquema privado `comunidad`
       con 11 tablas e invariantes (FK compuestas, autoevaluación, texto
       80–600 NFC, únicos parciales, transiciones y vigencia diferida).
       Revoke explícito a PUBLIC, `anon`, `authenticated` y `service_role`,
       RLS sin policies y fuera de PostgREST. Interruptores apagados;
       límites guardados como hipótesis;
     - `022_cerrar_user_reviews.sql`: quita las dos policies y los permisos
       de `anon`/`authenticated`, sin tocar filas; su down no reabre.
       **Aplicada sólo en local**; en Producción, después de E0 y con
       autorización;
     - `db-local.mjs` aplica 007, 011 y 022; TOTP encendido en
       `supabase/config.toml` (sólo local); `.env.comunidad-local` ignorado
       por Git;
     - resultados: permisos 25/25 (tres barreras por separado, 616 pedidos
       REST sin un 2xx, `is_admin_mfa()` real con dos TOTP: AAL1 `false`,
       AAL2 `true`); invariantes 81/81; up→down→up 11/11 con volcados
       idénticos; salas 37 en verde; `tsc` 0; `npm test` 2346 pasan, 0
       fallan, 18 omitidas;
     - se corrigió en la misma entrega un `alter default privileges … in
       schema` que no cerraba nada (comprobado): cada entrega repite su
       revoke;
     - **no verificado:** privilegios por defecto de Producción (E0 Q5).
       Con 022, `scripts/prueba-eliminar-cuenta.mjs` deja de poblar
       `user_reviews` (no se cambió).

     Informe: `docs/medidas/2026-10-24-informe-claude-e2a.md`; salidas:
     `docs/medidas/2026-10-24-e2a-salidas.txt`.
     Las cifras de arriba son **corridas de Claude**.
     **Auditoría focalizada de E2a (24/10, Codex sobre `74e46af`;
     `docs/medidas/2026-10-24-auditoria-e2a-74e46af.md`, copiada sin cambios,
     SHA-256 `4c22c7bc…26cb91`):** sin defectos bloqueantes en las
     migraciones locales. Las corridas propias de Codex no fueron completas:
     invariantes 80/81 y permisos 22/25. Los fallos coincidieron con falta de
     memoria del proceso (`VirtualAlloc … errno=1455`) y no con rechazos SQL.
     Codex repitió aislados el caso y los controles interrumpidos, y pasaron.
     Codex no declara un 81/81 ni un 25/25 propios y no repitió el ciclo
     destructivo up/down/up. Pidió dos ajustes del arnés para E2b:
     - **A1:** que la prueba heredada de eliminación no convierta un permiso
       denegado en cero filas;
     - **A2:** que el guardián local mire el contexto efectivo de Docker y no
       sólo `DOCKER_HOST`.
     El dueño autorizó **E2b local** con esos dos ajustes.
     **E2b local y ajustes A1/A2 (24/10; `6e0e1d1`, `9cea2ea`, `c6c6ba5`;
     sólo `supabase start` y la app local en el puerto 3100, sin
     Producción):**
     - A2: el guardián de Docker resuelve el contexto efectivo (precedencia
       del CLI, contrastada con `docker context show`) y fija ese endpoint
       en cada `docker`. Pruebas con contextos remotos simulados;
     - A1: `scripts/prueba-eliminar-cuenta.mjs` ya no convierte errores en
       cero, exige cantidades exactas y es sólo local: el dueño de la base
       prepara las fixtures heredadas. Destapó dos fallas que escondía:
       sin permisos de fila locales y `platforms` con el tipo equivocado;
     - `012_comunidad_baja.sql` (+ down), sólo en local:
       - marcador con origen, copia de la sanción y cancelación;
       - `resolver_participante`, con K_CORTE → K_CUENTA y el rechazo
         `CB001`;
       - paso 1 idempotente, que cierra tramos, borra lo propio,
         desvincula y conserva suspensiones;
       - red de seguridad en el borrado de Auth;
       - cuatro funciones de API, sólo para `service_role`;
     - app: el flujo hace contraseña → paso 1 → `deleteUser` →
       reconciliación con `getUserById` (`ok`, `baja-parcial` o
       `baja-sin-verificar`; nunca `ok` sin confirmar). Hay ruta nueva
       `GET /api/cuenta/estado-baja`, y Configuración muestra "Eliminación
       pendiente" con reintento. El runbook está en
       `docs/MANTENIMIENTO.md`;
     - resultados (corridas de Claude, en secuencia):
       - `pruebas-baja` 26/26, con B2, B3, B8, B10 y B14 como
         preliminares;
       - permisos 27/27, invariantes 81/81 y up/down/up 14/14 (mismos
         hashes de E2a sin 012);
       - salas 37 en verde y la prueba heredada con 0 fallas;
       - `tsc` 0 errores; `npm test` 2362 pasan, 0 fallan, 16 omitidas;
       - el recorrido visible quedó registrado con capturas;
     - observado y distinto del plan:
       - dos `deleteUser` simultáneos responden 200 los dos en el GoTrue
         local; el camino "404 → reconciliar" se probó aparte;
       - un ciclo blando de B8 no aborta; el deadlock real (40P01) y el
         `lock_timeout` (55P03) abortan Auth entera, y el reintento
         termina;
     - ⚠️ la ruta de eliminación ahora depende de 011 y 012. Desplegar este
       código sin esas migraciones deja la eliminación en `fallo-borrado`
       sin borrar nada;
     - no verificado: privilegios por defecto y GoTrue de Producción (E0),
       y Android.

     Informe: `docs/medidas/2026-10-24-informe-claude-e2b.md`; salidas:
     `docs/medidas/2026-10-24-e2b-salidas.txt`.
     **Auditoría focalizada de E2b (24/10, Codex sobre `f650725`;
     `docs/medidas/2026-10-24-auditoria-e2b-f650725.md`, copia sin cambios,
     SHA-256 `d768cb80…`):**
     - Codex verificó el flujo de baja: 26/26, prueba heredada con 0
       fallas y 57/57 focalizadas, en corridas propias.
     - Cerró los ajustes A1 y A2 del arnés de E2a.
     - Quedaba un hallazgo de presentación (A1 de E2b): tras
       `baja-sin-verificar`, el aviso afirmaba que la cuenta existía.
     - **Corregido en `8646586`:**
       - el estado propio "Eliminación sin confirmar" es neutral y no
         afirma existencia ni eliminación;
       - el comentario quedó corregido;
       - hay una regresión con la respuesta de Auth perdida y la
         reconciliación fallida, que comprueba el diálogo y el aviso;
       - se quitó la línea vacía final del log.
     - No se repitió la batería de E2b. Control visual: con
       `baja-parcial` el aviso sigue en "pendiente". El estado
       `sin-verificar` no se puede provocar en el servidor real sin un
       gancho de prueba; lo cubre la regresión del núcleo.
     **Conciliación documental de E2b (24/10):**
     - B4: los dos borrados simultáneos de Auth pueden responder éxito. El
       camino 404 → reconciliar sigue probado.
     - Suspensiones: el vínculo de la sanción con la cuenta se borra con la
       baja. Los intervalos históricos seudónimos se conservan para el
       ranking, sin plazo decidido (P3).
     - Denuncias recibidas que caen en cascada con la reseña: discrepancia
       con la tabla de retención, **pendiente de resolver antes de E4, E8 y
       la publicación**. El comportamiento no se cambió.
     - Orden de despliegue: las migraciones van antes del código.
     Todo esto está en la revisión §5 y en el plan.
     **E2c local (24/10, `a306cb8`; sólo `supabase start`, sin
     Producción):**
     - `013_comunidad_protocolo.sql` (+ down) trae las primitivas del
       protocolo de §2.2.4:
       - una por paso: `proto_cuenta` (reusa `resolver_participante` de
         E2b) → participantes → reseña → versiones → votos y tramos →
         suspensiones → contadores → `proto_marca`;
       - `proto_corte_exclusivo` para la consolidación, que sólo corre en
         READ COMMITTED;
       - `corte_de_mes`, `rige_antes_de` y `mes_ar`;
       - el orden se hace cumplir: CB002 si se piden fuera de orden;
       - nada ejecutable por la API;
     - `pruebas-concurrencia.mjs`, con sesiones psql reales:
       - casos 1–5 (voto/retiro, edición/voto, dos ediciones,
         `id_intento`, suspensión/voto), 6, 7a/7b (frente a la
         consolidación) y 11 (igualdad exacta en T(M));
       - deadlock 40P01 al violar el orden;
       - `lock_timeout` 55P03 y error tras escrituras parciales, ambos sin
         cambios a medias;
       - **20/20 en cinco corridas seguidas**, sin restos;
     - **Todo preliminar.** Las operaciones son fixtures sobre las
       primitivas reales, con gate en E3a (1–4), E4 (5) y E7 (6–11). Los
       casos 8–10 quedan para E7 y E8;
     - otras verificaciones:
       - up/down/up 15/15; sin 013 da el mismo volcado que E2b;
       - salas: 37 en verde;
       - `tsc`: 0 errores;
       - `npm test`: 2364 pasan, 0 fallan, 16 omitidas;
     - la primera corrida falló por memoria de Windows (`VirtualAlloc …
       errno=1455`). Se corrigió en el arnés: un observador persistente y
       una sola sesión de control. Además se detuvo el servidor de la app
       del puerto 3100.

     Informe: `docs/medidas/2026-10-24-informe-claude-e2c.md`; salidas:
     `docs/medidas/2026-10-24-e2c-salidas.txt`.
     **Auditoría focalizada de E2c (24/10, Codex sobre `cd62577`;
     `docs/medidas/2026-10-24-auditoria-e2c-cd62577.md`, copia sin cambios,
     SHA-256 `20e341a0…`):**
     - **Cerrada la corrección del aviso de E2b.**
     - **E2c seguía pendiente** por el hallazgo A1 (P1). `proto_cuenta`,
       vía `resolver_participante` (012), bloqueaba la fila del actor antes
       del bloqueo ordenado de `proto_participantes`. Dos actores cruzados
       que seguían el protocolo hacían 40P01; Codex lo reprodujo dos veces.
       Codex también pidió precisar que, en el deadlock deliberado, la
       víctima observada no es una garantía.
     **Corrección de A1 (24/10; regresión `7b33702`, corrección `b4aa75b`;
     sólo local):**
     - 013 redefine `resolver_participante` para que sólo **lea** el
       participante, sin `FOR UPDATE`. `K_CUENTA` ya da la serialización
       por cuenta, la relectura del marcador, la creación única de identidad
       y la exclusión con la baja; la fila se bloquea en el nivel 2, en
       orden. 013_down restaura literalmente la definición de 012;
     - regresión con A y B evaluando la reseña del otro, coordinados
       después del paso de cuenta:
       - **antes, 3/3 fallan**: filas `A=bloqueada, B=bloqueada` y
         `deadlock detected`;
       - **después, 3/3 pasan**: filas libres, los dos confirman y no hay
         CB002;
     - corridas posteriores:
       - concurrencia **21/21 en cinco corridas seguidas**;
       - baja 26/26, con el servidor local sólo para esa corrida;
       - up/down/up 15/15, y sin 013 el volcado sigue idéntico al de E2b;
     - en esas cinco corridas, la víctima del deadlock deliberado fue la
       sesión fuera de orden en 4 y **la sesión en orden en 1**. No hay
       garantía de víctima;
     - las operaciones siguen siendo fixtures: todo es preliminar.

     Informe: `docs/medidas/2026-10-24-informe-claude-e2c-a1.md`; salidas:
     `docs/medidas/2026-10-24-e2c-a1-salidas.txt`.
     **Auditoría focalizada de la corrección A1 (24/10, Codex sobre `f67ff90`;
     `docs/medidas/2026-10-24-auditoria-e2c-a1-f67ff90.md`, copia sin
     cambios, SHA-256 `6547a056…`):** el fallo de actores cruzados quedó
     corregido y **E2c está cerrada en local**, sin hallazgos bloqueantes
     nuevos.
     - Codex repitió la regresión cruzada (1/1, `A=libre, B=libre`).
     - Controló, en una transacción revertida, la identidad, la baja, la
       sanción y la cancelación.
     - Comparó el SQL: la de 013_down es idéntica a 012.
     - No hace falta una entrega previa de inventario automático. El
       inventario de uso del protocolo se cierra en cada entrega que crea
       funciones.
     - Las operaciones de concurrencia de E2c siguen siendo fixtures, con
       gates en E3a, E4 y E7.
     - El dueño autorizó **E3a local**, integrando las reglas candidatas de
       E1 sólo en local y con los interruptores apagados. Eso no aprueba E1
       ni habilita contenido real.
     **E3a local (24/10; `64daf53`, `c2bf84a`, `5ee5133`; sólo `supabase
     start` y la app local; interruptores apagados al terminar):**
     - `014_comunidad_escritura.sql` (+ down):
       - términos versionados (texto **borrador local**, sin aprobar) y la
         tabla `intentos` (idempotencia por id_intento y hash del pedido);
       - publicar, editar, borrar, votar, retirar voto y aceptar términos,
         sólo `service_role`. Cada una usa las primitivas de 013 en orden,
         sin bloquear antes la fila del actor, relee lo bloqueado y no
         escribe nada antes de la marca;
       - matriz A/B (§2.1.2) y tabla §3.4.1 de ediciones; los votos se
         reinician una sola vez;
       - lectura provisional mínima de un título (la reemplaza E5a);
     - app:
       - cinco rutas con Bearer y CORS;
       - normalización y cuenta compartidas entre pantalla, servidor y base;
       - en la ficha, un acordeón cerrado con los términos, el editor (con
         aviso y confirmación de reinicio, borrado con confirmación,
         reintento sin duplicar y "No sabemos si se guardó") y la
         evaluación;
     - resultados (corridas de Claude, en secuencia):
       - escritura 37/37: gates 1–4, B3a/B3b y cruzados con las funciones
         reales, matriz, §3.4.1, idempotencia, límites con carreras, rutas
         y acceso directo;
       - up/down/up 16/16; sin 014, el volcado es el de E2c;
       - permisos 27/27, invariantes 81/81, baja 26/26 y concurrencia
         21/21;
       - `tsc` 0 errores; `npm test` 2387 pasan, 0 fallan, 16 omitidas;
     - recorrido en navegador, en escritorio y con 375 px, con 15
       capturas en `docs/medidas/2026-10-24-e3a-recorrido/`;
     - hallazgos y correcciones dentro de la entrega:
       - los triggers diferidos de 011 corrían al confirmar con el rol de
         la sesión: `set constraints all immediate` en publicar y editar;
       - un emoji con ZWJ pasaba el contador pero el CHECK de 011 lo
         rechaza: ahora el editor lo avisa antes de enviar;
       - el mensaje se perdía al volver a montar el editor;
       - el botón deshabilitado no se veía como tal;
     - ⚠️ la ruta y la interfaz dependen de 011–014: las migraciones van
       antes del código;
     - no verificado:
       - la ficha real con TMDB (en local se usó
         `/revision-local/comunidad`, el mismo componente);
       - Android;
       - lo de E3b (admisión, duplicados, revisión de rechazos).

     Informe: `docs/medidas/2026-10-24-informe-claude-e3a.md`; salidas:
     `docs/medidas/2026-10-24-e3a-salidas.txt`.
   **Falta:**
   - **Auditoría focalizada de E3a (24/10, Codex sobre `faabf5a`;
     `docs/medidas/2026-10-24-auditoria-e3a-faabf5a.md`, copia sin cambios,
     SHA-256 `98c619f9…`):** E3a quedó ampliamente verificada (Codex:
     40/40 tests, `tsc` limpio, batería 37/37 con restos `0|0|0|0|false`,
     catálogo cerrado). **Sigue pendiente de dos correcciones P2:**
     - A1: una respuesta RPC perdida después del commit se informaba como
       "No se pudo guardar". Codex lo reprodujo con una publicación real;
     - A2: una recarga remota descartaba el borrador en edición y adoptaba
       en silencio otra versión esperada. Lo encontró por lectura.
   - **Correcciones A1/A2 de E3a (25/10, local; `98eba43` copia de la
     auditoría, `8bdfe3f` A1, `d66244b` A2): hechas y cerradas por Codex**
     (25/10, sobre `f9be491`; `docs/medidas/2026-10-25-auditoria-e3a-a1a2-f9be491.md`,
     copia sin cambios, SHA-256 `6e8eee47…`). Codex repitió A1 real 6/6
     (restos `0|0|0|0|false`), 37/37 tests de escritura y editor, y `tsc`.
     Sin recorrido propio en navegador: las capturas son evidencia de Claude.
     **E3a local queda cerrada** con sus límites (lectura provisional,
     términos sin aprobar, admisión y defensas de E3b pendientes). No
     aprueba E1 ni habilita publicación, Producción ni E3b.
     - A1: los errores de `supabase.rpc` salen clasificados. Un SQLSTATE o
       PGRST es un rechazo confirmado: "error". Una confirmación perdida
       (fetch caído, 5xx sin código, cuerpo ilegible, conexión perdida)
       se repite una vez con el mismo `id_intento`; si tampoco se confirma
       queda `sin_confirmar` (503, "No sabemos si se guardó"). Lo mismo
       para votar, retirar, borrar y aceptar términos.
       Pruebas reales con la respuesta descartada tras el commit: 6/6
       (0/6 sobre `faabf5a`). §3.4.1 9/9, idempotencia 5/5, gates 1–4
       5/5, rutas 3/3;
     - A2: el editor guarda la versión base y el borrador. Una versión o un
       borrado remoto muestran un aviso con decisión explícita; sin
       decidir, el envío sale contra la base original y vuelve el conflicto.
       El editor se monta por cuenta y título, y una recarga fallida ya no
       desmonta el editor. 8 regresiones puras y un recorrido en navegador
       con el "antes" reproducido sobre `faabf5a`
       (`docs/medidas/2026-10-25-e3a-a1a2-recorrido/`);
     - `tsc` 0; `lib/comunidad` 37/37; `npm test` 2399 pasan, 0 fallan,
       18 omitidas (con el `.next` de `next dev` apartado: con él, dos
       pruebas de bundle de producción fallan por entorno);
     - interruptores apagados y límites 5/10/100 al terminar;
     - no probado: una caída real de conexión a mitad del commit; el cambio
       directo de cuenta A→B con el editor montado (cubierto por la `key`);
       la ficha con TMDB; Android.
     Informe: `docs/medidas/2026-10-25-informe-claude-e3a-a1a2.md`;
     salidas: `docs/medidas/2026-10-25-e3a-a1a2-salidas.txt`.
   - **Pulgares en la evaluación (25/10, pedido visual del dueño en la
     auditoría de A1/A2):** "Me sirvió" / "No me sirvió" pasan a ser
     pulgar arriba y pulgar abajo, con el conteo encima ("285 de 481
     encontraron útil esta opinión"; singular "1 de 4 encontró…"; sin
     evaluaciones "Todavía nadie evaluó esta opinión."). Nombres accesibles,
     `aria-pressed`, foco visible, 44×44 de superficie y el elegido relleno
     en naranja. Misma lógica de voto, cambio y retiro; la propia sólo
     muestra el conteo. Verificado en navegador local en escritorio y a
     375 px con conteos reales; capturas en
     `docs/medidas/2026-10-25-e3a-pulgares/`, informe en
     `docs/medidas/2026-10-25-informe-claude-e3a-pulgares.md`. Se limpiaron
     además los seis espacios finales del log de A1/A2 que señaló la
     auditoría (sólo espacios). **Cerrado por Codex** (25/10, sobre
     `0af5f49`; `docs/medidas/2026-10-25-auditoria-pulgares-0af5f49.md`,
     copia sin cambios en `7698e7a`, SHA-256 `db132d89…`): sin hallazgos
     bloqueantes; Codex repitió 38/38 y `git diff --check` y comparó la
     captura a 375 px con la referencia del dueño (cumple; usa el estilo de
     botones de Yump). Sin recorrido propio de Codex en navegador, teléfono,
     tema claro, TMDB, Android ni lector de pantalla. El dueño confirmó que
     el rótulo "Reseña de la comunidad" pasa a ser el nombre comunitario del
     autor en E6, sin mostrar correos ni datos privados;
   - **E3b local (25/10, autorizada por el dueño; `2e2d00e`; sólo `supabase
     start` y la app local; interruptores apagados y límites restaurados al
     terminar). Auditada por Codex sobre `64d940e`
     (`docs/medidas/2026-10-25-auditoria-e3b-64d940e.md`, copia sin
     cambios): dos P2 de interfaz, A1 y A2, sin defectos en el SQL, la
     concurrencia ni los permisos ejercitados. A1/A2 corregidas por Claude
     (ver abajo). **CERRADA por Codex** sobre `ce26526`
     (`docs/medidas/2026-10-25-auditoria-e3b-a1a2-ce26526.md`, copia sin
     cambios, SHA-256 `ccb5cce4…`): sin hallazgos bloqueantes; no aprueba
     E1, parámetros de lanzamiento ni publicación. Codex corrió 98/98 de
     núcleos y una sonda del diálogo real; no repitió baterías de base,
     navegador, teléfono ni TMDB.**
     - **A1 (aislamiento por cuenta):** `/cuenta/bloqueados`, las reseñas de
       la ficha (aviso de bloqueo, diálogos, mensajes) y la fila de
       Configuración montan su estado por cuenta; una frontera
       (`lib/comunidad/frontera-cuenta.ts`) descarta respuestas de cuentas
       anteriores, de instancias desmontadas y cargas superadas, y los
       pedidos sólo salen si la sesión sigue siendo de la cuenta que los
       inició. Una recarga fallida de la misma cuenta conserva datos y
       borrador (E3a intacta);
     - **A2 (denuncia recibida, bloqueo pendiente):** el diálogo conserva la
       denuncia y ofrece "Reintentar el bloqueo" sólo contra la ruta de
       bloqueos (no reenvía la denuncia ni suma excedente); incierto y error
       confirmado tienen mensajes distintos; un rechazo definitivo deja sólo
       "Cerrar". Hallazgo del recorrido, corregido: con el bloqueo aplicado
       pero la respuesta perdida, la recarga quitaba la reseña y el
       reintento; ahora la recarga espera al cierre del diálogo;
     - 21 regresiones focalizadas (preliminares: núcleos y modelos), 77/77
       vecinas, `npm test` 2445 pasan, 0 fallan, 16 omitidas, `tsc` 0;
       recorrido real en navegador (escritorio y 375 px) con demoras y
       respuestas perdidas simuladas en la página; 12 capturas en
       `docs/medidas/2026-10-25-e3b-a1a2-recorrido/`. Sin baterías de base:
       no cambió SQL ni rutas;
     - se mantiene documentado: **50 es el tope de ADMISIÓN, no una cota
       absoluta de retenidos**; la corroboración por regla puede superarlo
       (comportamiento sin cambios);
     - no verificado: la fila de Configuración en navegador (sólo código y
       barrido), teléfono real, Android, tema claro, TMDB, lector de
       pantalla. Informe: `docs/medidas/2026-10-25-informe-claude-e3b-a1a2.md`;
       salidas: `docs/medidas/2026-10-25-e3b-a1a2-salidas.txt`.
     - `015_comunidad_moderacion_datos.sql` (+ down):
       - límites nuevos en `config`, todos **hipótesis** (P6, ninguno
         aprobado): admisión por autor 2 y global 50, 50 filas de denuncia
         por versión, 100 denuncias por hora;
       - protocolo con dos niveles nuevos antes de la marca (8 hash de
         texto, 9 cola de retenidos o de denuncias; la marca pasa a 10):
         los topes y el conteo entre cuentas se cumplen bajo concurrencia;
       - huellas HMAC de duplicados (texto plegado y shingles de 3
         palabras, sólo hex por CHECK; el secreto es del servidor:
         `COMUNIDAD_HMAC_DUPLICADOS`, en local uno de prueba que se rechaza
         en producción);
       - publicar/editar con duplicados, admisión a la cola (lo limpio se
         publica igual; lo retenible que no entra no se guarda; nada se
         publica por vencimiento) y "Pedir revisión"
         (`revision_solicitada`, pasa por la admisión y el límite);
       - denunciar (fila C; no oculta; la cantidad sólo ordena la cola
         interna para E4), corroboración por regla, bloquear y desbloquear
         (fila D); la lectura provisional oculta al bloqueado sólo para
         quien bloquea;
     - app: rutas `denuncias`, `bloqueos` y `revision`; menú de la reseña
       (denunciar con categorías, confirmación y bloqueo en el mismo paso,
       bloquear, reintento sin duplicar, mensajes honestos con la cola
       llena); "Pedir revisión" en el editor con la confirmación de que la
       publicada deja de verse; `/cuenta/bloqueados` y su fila en
       Configuración;
     - resultados (corridas de Claude, en secuencia): moderación E3b 46/46
       (con compuertas psql que observan la espera de los locks 7303/7304;
       las 5 de concurrencia de topes, 3 veces), up/down/up de 015 5/5,
       permisos 27/27, escritura 43/43, concurrencia 21/21, baja 26/26,
       invariantes 81/81, unitarias 67/67, `npm test` 2424 pasan, 0 fallan,
       16 omitidas, `tsc` 0 errores;
     - recorrido en navegador local en escritorio y a 375 px, con 19
       capturas en `docs/medidas/2026-10-25-e3b-recorrido/`;
     - interpretaciones a auditar (informe, "Decisiones a auditar"):
       duplicado propio = de otra reseña; "3 o más cuentas" literal (la 4.ª
       se retiene); denunciar y bloquear crean la identidad sin términos;
       la corroboración cierra tramos y no pasa por la admisión (Codex: no
       son hallazgos; conservar en E4 que 50 limita la admisión, no el total
       retenido);
     - `pruebas-permisos.mjs` no borraba sus cuentas: se borraron sólo las
       de las tres corridas de Claude del 25/10 y ahora limpia lo suyo (las
       del 24/10 quedan). El up/down/up completo de 011 no se repitió:
       borra el esquema de la base compartida;
     - no verificado: teléfono real y Android, tema claro, ficha con TMDB,
       lectores de pantalla reales, caída real de red a mitad del commit.
     Informe: `docs/medidas/2026-10-25-informe-claude-e3b.md`; salidas:
     `docs/medidas/2026-10-25-e3b-salidas.txt`.
   - **E4 local: moderación administrativa (25/10, autorizada por el dueño;
     sólo `supabase start`, la app local y datos ficticios; interruptores,
     publicación y muestreo apagados al terminar).** Auditada por Codex sobre
     `9340da9` (`docs/medidas/2026-10-25-auditoria-e4-9340da9.md`): dos P2,
     A1 y A2, corregidas por Claude el 25/10 (detalle al final de este
     bloque). **E4 CERRADA COMO ENTREGA LOCAL por Codex el 26/10**
     (`docs/medidas/2026-10-26-auditoria-e4-a1a2-1fb85cb.md`), sin habilitar
     la publicación. ⚠️ **Límite de verificación:** Codex cerró por revisión
     de código, sus pruebas focalizadas (64/64, `tsc` 0) y la evidencia de
     Claude; **no pudo repetir las pruebas de base** porque Docker Desktop
     respondía 500 después del reinicio. Las corridas 38/38, 5/5, 28/28,
     26/26, 85/85 y 46/46 siguen siendo evidencia de Claude. El 26/10 Claude
     volvió a levantar Docker Desktop (sin borrar volúmenes ni recrear
     contenedores) y comprobó la base tal como había quedado: 6
     participantes, 2 versiones, 42 cuentas, 2 suspensiones ajenas, 0
     decisiones, interruptores y muestreo apagados, `SELECT` de `profiles`
     revocado, sin locks. Codex marcó un espacio final en la línea 22 de
     `docs/medidas/2026-10-25-e4-a1a2-salidas.txt` (el fallo histórico): no
     se tocó, para no alterar la salida histórica.
     - `016_comunidad_admin.sql` (+ down generado con copias literales de
       011, 012 y 015):
       - registro de decisiones (admin, acción, versión o participante o
         cuenta, motivo, estado previo; sin texto; idempotente por intento);
       - acciones `comunidad_admin_*` y `comunidad_quitar_marcador_baja`,
         ejecutables SÓLO por `authenticated` con `is_admin_mfa()`
         comprobado adentro antes de cualquier lock (como el Top). Son
         publicar o rechazar retenidos, retirar y restaurar, descartar o
         cerrar denuncias, suspender y levantar, quitar el marcador de baja
         y pausar o reanudar la publicación;
       - lecturas del panel (resumen, colas con cursor, cuentas, registro y
         muestreo apagado);
       - `proto_admin`: K_CORTE compartido y, al quitar un marcador, el
         K_CUENTA de esa cuenta;
       - retirar cierra tramos; publicar y restaurar los reabren sólo para
         votos positivos vigentes que ya tenían tramo, con su mes original;
       - invariantes: `rechazada → reemplazada` (el autor puede corregir) y
         una suspensión con fin futuro se puede acortar (nunca alargar ni
         llevar al pasado).
     - **Denuncias recibidas en la baja (pendiente de E2b):** la baja ahora
       las cierra en `comunidad.denuncias_cerradas` con lo mínimo
       (denunciante seudónimo, categoría, estado final `cerrada_por_baja`,
       fechas), SIN texto, comentario ni autor. Se borran con la baja de
       quien denunció. **El texto denunciado se sigue borrando con la cuenta:
       conservarlo es una excepción de preservación que decide el dueño con
       P3** (propuesta A/B/C en el informe). Ningún plazo nuevo.
     - app: `/admin/moderacion` en la navegación del dashboard; ruta
       `/api/admin/moderacion` con `adminDeToken` y la sesión del admin (sin
       CORS, como `admin/top`); motivo obligatorio, efecto antes de
       confirmar, "No sabemos si se aplicó" con reintento del mismo
       intento, aislamiento por cuenta (frontera de E3b). El autor ve
       "Rechazada por moderación".
     - resultados (corridas de Claude, en secuencia):
       - `pruebas-admin` 32/32 (nueva): permisos por API y por RPC directo
         con TOTP reales; decisiones atadas a versión (vieja, borrada,
         baja); simultáneas; reintentos y respuesta perdida; caso 5 con las
         funciones de producto; B10 y B14 con la función real; pausa;
         paginación; muestreo;
       - up/down/up de 016 5/5;
       - por dependencia modificada: permisos 28/28, invariantes 85/85,
         baja 26/26, moderación E3b 46/46, escritura 43/43;
       - unitarias 13/13, `npm test` 2458 pasan, 0 fallan, 16 omitidas,
         `tsc` 0;
       - concurrencia (E2c) no se repitió: las primitivas no cambiaron y el
         caso 5 está en la batería nueva.
     - recorrido real en navegador local (escritorio y 375 px; respuesta
       perdida y demora simuladas en la página): 12 capturas en
       `docs/medidas/2026-10-25-e4-recorrido/`.
     - ⚠️ entorno local: `supabase start` no da `SELECT` de
       `public.profiles` a `authenticated` (la ruta del admin respondía
       503; al Top le pasa igual en local). Se concede sólo mientras corren
       la batería y el recorrido, y se revoca. No es un cambio de esquema.
     - decisiones a auditar (informe): la suspensión no cierra tramos (el
       cómputo al corte la excluye por intervalo); reapertura de tramos;
       las dos invariantes ampliadas; publicar no toca denuncias abiertas;
       la pausa no frena una escritura que ya leyó la configuración;
       suspensión sin plazo; muestreo sin interruptor en el panel.
     - no verificado: teléfono, Android, tema claro, lector de pantalla,
       ficha con TMDB, una caída real de red, TOTP tecleado en
       `/admin/mfa`, Producción.
     Informe: `docs/medidas/2026-10-25-informe-claude-e4.md`; salidas:
     `docs/medidas/2026-10-25-e4-salidas.txt`.
     - **Corrección A1/A2 (25/10, Claude; cerrada por Codex el 26/10, ver arriba):**
       - A1, restaurar desde el panel:
         - la base suma dos lecturas, sólo para admin con MFA:
           `comunidad_admin_retiradas` (retiradas vigentes de reseñas vivas,
           con cursor) y `comunidad_admin_version` (situación actual);
         - el panel suma la pestaña **Retiradas** y «Ver situación actual»
           en el Registro. Restaurar se ofrece sólo si la versión sigue
           retirada y vigente, con el aviso de los votos que vuelven (los
           que `reabrir_tramos` reabre);
         - restaurar sigue siendo la misma función, que rechaza una versión
           reemplazada, borrada o eliminada;
       - A2, bajas simultáneas:
         - `limpiar_participante` bloquea, al final de sus locks, las
           denuncias hechas y recibidas, por id;
         - la segunda baja espera y relee, así el historial de quien
           denunció ya no reaparece después de su baja;
         - regresión determinista con las funciones reales: falla antes,
           pasa después, en ambos órdenes y con denuncias cruzadas, sin
           deadlock;
         - las denuncias de cuentas activas se conservan;
       - documentación: el diseño §2.2.2 concilia la suspensión (intervalo,
         no cierra tramos, efecto exacto en el cómputo); el plan suma a E7
         el gate con el cómputo real. El ranking no se tocó;
       - resultados reales en secuencia:
         - `pruebas-admin` 38/38 (A1 3, A2 3);
         - up/down/up de 016 5/5;
         - permisos 28/28, baja 26/26, invariantes 85/85, moderación 46/46;
       - unitarias y tipado: `npm test` 2460 pasan, 0 fallan, 16 omitidas;
         `tsc` 0;
       - no repetidas: escritura y concurrencia, porque sus funciones no
         cambiaron;
       - recorrido en navegador local, escritorio y 375 px, sesión AAL2
         real:
         - retirar → recargar → Retiradas → restaurar;
         - decisión tardía sobre una retirada que el autor editó: «No se
           aplicó»;
         - Registro con reemplazada, borrada y eliminada sin botón;
         - la edición concurrente la disparó un script (simulado el
           momento, real la función);
         - 8 capturas;
       - limpieza: base con 6 participantes, 2 versiones y 42 cuentas, 0
         locks, suspensiones ajenas intactas, interruptores y muestreo
         apagados, `SELECT` local de `profiles` revocado;
       - no verificado: teléfono, Android, tema claro, lector de pantalla,
         Producción.
       Informe: `docs/medidas/2026-10-25-informe-claude-e4-a1a2.md`; salidas:
       `docs/medidas/2026-10-25-e4-a1a2-salidas.txt`; capturas:
       `docs/medidas/2026-10-25-e4-a1a2-recorrido/`.
   - **E5a local: lectura protegida y "Recientes" (26/10, autorizada por el
     dueño; sólo `supabase start`, la app local y datos ficticios;
     interruptores, publicación y muestreo apagados al terminar).** Auditada
     por Codex sobre `b7ba962` (`docs/medidas/2026-10-26-auditoria-e5a-b7ba962.md`):
     un P2, A1, corregida por Claude el 26/10 (detalle al final de este
     bloque). **E5a CERRADA COMO ENTREGA LOCAL por Codex el 26/10**
     (`docs/medidas/2026-10-26-auditoria-e5a-a1-367cf25.md`): A1 cerrada, sin
     hallazgos nuevos; sin publicación. **Sigue pendiente de integración la
     comparación de `/api/title` en ejecución** (un barrido de fuente no la
     reemplaza; puede hacerse con fixtures locales de TMDB, sin servicio real
     ni credenciales de Producción).
     - entorno: Docker Desktop estaba detenido tras el reinicio (la distro
       WSL `docker-desktop` parada). Lo inicié; el motor respondió en 25 s y
       los contenedores volvieron solos. No borré volúmenes ni recreé nada;
     - `017_comunidad_lectura.sql` (+ down con la lectura provisional de 015,
       copia literal):
       - `comunidad_resenas` reemplaza a la lectura provisional (que se
         borra). La ejecuta SÓLO `authenticated` y lee al lector de
         `auth.uid()`; no tiene `p_uid`;
       - "Recientes" con cursor por clave (primera publicación desc, id desc),
         de a 5 (tope 20);
       - visibilidad recalculada en cada página: reseña viva, versión vigente
         publicada, no propia, autor no bloqueado por quien lee ni
         suspendido;
       - la primera página trae la propia, el estado de la cuenta y el total;
       - "utiles" → 22023 (E5b);
       - `comunidad_modulo_activo` (sólo `service_role`) para la ruta;
     - ruta `GET /api/comunidad/resenas/lista` (desvío del plan: la envoltura
       CORS admite un método por ruta):
       - Bearer → sesión del lector, nunca `service_role`;
       - sin sesión, 401 `{resultado, activo}` (sólo el interruptor);
       - `private, no-store`;
     - ficha: una sola sección RESEÑAS:
       - la de Yump primero; el módulo editorial no se tocó;
       - sin sesión, invitación a registrarse, también en un título sin
         reseñas y sin número en el encabezado;
       - con sesión, cinco reseñas y "Cargar más" (cursor confirmado, fallo
         con reintento desde el mismo punto, sin duplicados);
       - selector con "Más útiles" deshabilitado;
       - se conservan editor, pulgares, conteos, denuncias, bloqueos y
         revisión;
       - sin nombre del autor hasta E6;
     - suspensión: desde E5a la lectura oculta las reseñas del autor
       suspendido mientras rige (diseño §2.3). Se cambió el texto del
       diálogo de E4, que decía lo contrario;
     - resultados reales en secuencia:
       - `pruebas-lectura` 11/11 (nueva): sin sesión nada por RPC ni ruta;
         214 visibles en 43 páginas, exactas, con un empate de 12; cambios
         entre páginas (retiro, borrado, edición, bloqueo y suspensión, con
         funciones reales): 0 repetidas, 0 salteadas; bloqueo personal;
         suspensión y levantamiento;
       - up/down/up de 017 5/5;
       - por dependencia modificada (usaban la lectura provisional o el
         inventario): permisos 29/29, escritura 43/43,
         moderación 46/46, admin 38/38;
     - unitarias: `npm test` 2471 pasan, 0 fallan, 16 omitidas; `tsc` 0;
     - recorrido real en navegador local, escritorio y 375 px, 12 capturas:
       - invitación con y sin reseñas; cinco + Cargar más;
       - fallo y reintento; voto sin achicar la lista; bloqueo;
       - cambio de cuenta, cierre de sesión y cambio de título con una tanda
         pendiente (la tardía no se pinta);
       - estado vacío; fallo y demora simulados con un interceptor de
         `fetch`;
     - corregido en el recorrido: abrir la sección mientras se resolvía la
       sesión la volvía a cerrar. Ahora el abierto/cerrado vive por título;
     - pendiente: comparar `/api/title` en ejecución (sin TMDB en local; lo
       fija un barrido de fuente), teléfono, Android, tema claro, lector de
       pantalla, Producción.
     Informe: `docs/medidas/2026-10-26-informe-claude-e5a.md`; salidas:
     `docs/medidas/2026-10-26-e5a-salidas.txt`; capturas:
     `docs/medidas/2026-10-26-e5a-recorrido/`.
     - **Corrección A1 (26/10, Claude; cerrada por Codex el 26/10):**
       - el problema: la lista ignoraba los resultados idempotentes del voto
         recuperado (`sin_cambios`, `sin_efecto`). La base quedaba bien, pero
         la pantalla no, y el siguiente toque volvía a votar;
       - la corrección (`lib/comunidad/lista-nucleo.ts`, sólo el núcleo):
         - `votoConfirmado` toma también los idempotentes;
         - `trasVoto` aplica el estado confirmado por diferencia, sin contar
           dos veces y sin recargar la lista;
         - `sin_confirmar` no cambia nada y deja el aviso;
       - regresión unitaria: falla antes (`[null,2,3]` contra
         `["util",3,4]`) y pasa después;
       - regresión real `pruebas-voto-lista`: 3/10 con el núcleo anterior,
         11/11 con la corrección. Cubre positivo, negativo, cambio y retiro;
         la primera respuesta perdida; la pérdida de ambas y el reintento.
         El siguiente toque actúa sobre el voto real y la lista conserva sus
         dos páginas. La pérdida es simulada;
       - focalizadas 78/78; `tsc` 0;
       - navegador local, escritorio y 375 px, 5 capturas: incierto →
         reintento → reflejado, con la lista de dos o tres páginas intacta;
       - sin cambios en la base, la ruta ni el componente. No se repitieron
         baterías generales;
       - quité la línea vacía extra de `components/ResenasSeccion.tsx`;
       - sigue pendiente: `/api/title` en ejecución, teléfono, Android,
         tema claro, lector de pantalla, Producción.
       Informe: `docs/medidas/2026-10-26-informe-claude-e5a-a1.md`; salidas:
       `docs/medidas/2026-10-26-e5a-a1-salidas.txt`; capturas:
       `docs/medidas/2026-10-26-e5a-a1-recorrido/`.
   - **E5b local: orden "Más útiles" (26/10, Claude, autorizada por el
     dueño; sólo `supabase start`, la app local y datos ficticios).
     CERRADA COMO ENTREGA LOCAL por Codex el 26/10**
     (`docs/medidas/2026-10-26-auditoria-e5b-662e247.md`): sin hallazgos
     bloqueantes; no habilita publicación. Pendientes de integración
     conservados: `/api/title` en ejecución, tema claro, teléfono/Android,
     lector de pantalla y Producción; la purga y la cuota siguen para E8.
     - **Qué entró:**
       - `018_comunidad_utilidad.sql` + down;
       - Wilson al 95 % (z = 1,96), con 0 positivos o sin votos = 0, y
         desempate por primera publicación desc → id desc. La copia
         `lib/comunidad/wilson.ts` coincide **bit a bit** con la base en
         1.890 pares;
       - **orden congelado compartido por título** (`ordenes_utiles` y
         `ordenes_utiles_tramos`):
         - filas de 100 ids;
         - un generador por título con lock consultivo y doble búsqueda;
         - reutilización de 10 min y vigencia de 2 h;
         - **sin datos de quien lee**;
       - cada página revalida como máximo 50 posiciones y devuelve hasta 5;
         con muchas ocultas, menos, y el cursor avanza;
       - un orden vencido responde `orden_actualizado`;
       - `comunidad_resenas` pasa a `volatile` con `lock_timeout = 5s`;
       - interfaz:
         - "Más útiles" es el orden por defecto, sin perder "Recientes";
         - cinco iniciales y "Cargar más";
         - "Orden actualizado" con UN solo reinicio, sin duplicar;
         - votar actualiza el conteo y no reordena.
     - **Corregido en el camino:** Wilson de 0/n en SQL daba ~1e-17 en vez
       de 0 y salteaba el desempate por fecha. Lo detectó la batería.
     - **Pruebas reales:**
       - `pruebas-utiles` 14/14: 20 lectores concurrentes → 1 orden;
         recorrido de 237 sin duplicar ni saltear; cambios entre páginas con
         funciones reales; muchas ocultas con ≤ 50 posiciones; vencimiento
         y reinicio con el núcleo real; permisos y privacidad;
       - up/down/up de 018 5/5;
       - **repetidas porque 018 redefine `comunidad_resenas`:** lectura
         11/11 y permisos 29/29 (las dos con la batería actualizada por los
         cambios de contrato intencionales), voto-lista 11/11, escritura
         43/43, moderación 46/46 y admin 38/38;
       - `npm test` 2480 pasan, 0 fallan, 16 omitidas; `tsc` 0.
     - **Mediciones** (100, 1.000 y 10.000 reseñas sintéticas):
       - generar el orden: 92,6 / 274,2 / 2.073,2 ms;
       - página con cursor: ~10–17 ms y 312–635 buffers, que **no crece
         con el total**;
       - primera página: 15,3 / 34,1 / 139,5 ms, porque el contador visible
         crece con N, igual que en "Recientes";
       - TOAST 0 B, 864 B por fila de 100 ids;
       - más de unas 25.000 reseñas por título podrían superar el
         `lock_timeout` al generar (extrapolación, **no medida**);
       - la purga de E8: sin datos reales para decidir; no programé nada.
     - **Simulado:** el paso del tiempo, las reseñas sintéticas, "muchas
       ocultas" por SQL, y la respuesta perdida y el error de red en el
       navegador.
     - **Navegador local, escritorio y 375 px, 13 capturas:**
       - los dos órdenes y "Cargar más";
       - falla de tanda y reintento;
       - voto perdido → `sin_cambios`, sin reordenar;
       - vencimiento → reinicio sin repetir; un segundo vencimiento sin otro
         reinicio.
     - **Limpieza:**
       - 6 participantes, 2 versiones, 42 cuentas y 2 suspensiones ajenas;
       - 0 órdenes y 0 locks;
       - interruptores, publicación y muestreo apagados; `SELECT` de
         `profiles` revocado;
       - borré 2 órdenes que había dejado mi primera corrida de lectura.
     - **Sigue pendiente:**
       - `/api/title` en ejecución (de E5a);
       - teléfono, Android, tema claro, lector de pantalla y Producción.
     Informe: `docs/medidas/2026-10-26-informe-claude-e5b.md`; mediciones:
     `docs/medidas/2026-10-26-e5b-mediciones.md`; salidas:
     `docs/medidas/2026-10-26-e5b-salidas.txt`; capturas:
     `docs/medidas/2026-10-26-e5b-recorrido/`.
   - **E6 local: nombre comunitario y perfil mínimo del autor (27/10,
     Claude, autorizada por el dueño sólo en local; `supabase start`, la app
     local y datos ficticios).** Auditada por Codex sobre `8cbe0cd`
     (`docs/medidas/2026-10-27-auditoria-e6-8cbe0cd.md`): dos P2, A1 y A2.
     Corrección A1/A2 hecha por Claude el 27/10 (detalle al final de este
     bloque). **E6 CERRADA COMO ENTREGA LOCAL por Codex el 27/10**
     (`docs/medidas/2026-10-27-auditoria-e6-a1a2-43117a2.md`): A1 y A2
     cerradas, sin hallazgos nuevos; no habilita publicación. Pendientes de
     integración conservados: `/api/title` en ejecución, TMDB, tema claro,
     teléfono/Android y lector de pantalla.
     - **Qué entró** (`019_comunidad_perfiles.sql` + down):
       - `comunidad_cambiar_nombre`, sólo service_role:
         - reglas de nombre de E1 en la ruta;
         - fila A y límite de 3 por día;
         - escribe sólo `participantes.nombre_comunitario`;
         - `profiles.display_name` no participa;
       - `comunidad_perfil`, sólo authenticated y con el lector de
         `auth.uid()`:
         - nombre, avatar del catálogo, reseñas visibles y "Me sirvió"
           recibidos, de a 5 con cursor;
         - `bloqueado` y `eliminada` sin nombre, avatar ni reseñas;
         - autor suspendido: sin reseñas para los demás;
       - `avatar_publico`: nunca la semilla guardada (mismo mapeo que
         `resolverAvatar`, 337 casos sin diferencias);
       - `item_lectura` suma el autor (id de participante y nombre);
       - rutas `/api/comunidad/nombre` (POST) y `/api/comunidad/perfil` (GET,
         Bearer, `private, no-store`);
       - en la ficha, el nombre del autor con enlace al perfil;
       - página `/u/?id=` (`noindex`, igual en web y contenedor, incluida en
         la exportación nativa; sin AAB ni versión);
       - en Mi perfil, "Nombre en la comunidad", separado de "Nombre para
         mostrar";
       - el comentario de la ruta de lectura ahora ejemplifica los dos
         órdenes.
     - **Decisión a auditar:** un nombre que E1 retendría (odio) **no se
       guarda**: no hay cola de revisión de nombres. Cuenta para el límite y
       se informa "Ese nombre no se puede usar".
     - **Pruebas reales:**
       - `pruebas-perfiles` 19/19 (rutas y base): permisos por ruta, REST y
         RPC; ningún atajo a la validación; `display_name` sin efecto;
         paginación; cambios entre páginas; cuenta y respuestas tardías;
         bloqueo, suspensión y baja reales;
       - up/down/up de 019 5/5;
       - regresiones afectadas: permisos 29/29, lectura 11/11, voto-lista
         11/11, utilidad 14/14 y moderación 46/46;
       - focalizadas 137/137; `npm test` en verde tras corregir el barrido de
         DiceBear sobre la batería nueva; `tsc` 0.
     - **Simulado o fixture:**
       - el límite de reseñas, subido mientras corre;
       - `display_name` y el avatar escritos por SQL (el SELECT local de
         `profiles` está revocado);
       - la pérdida de respuestas y el cambio de cuenta, con el núcleo del
         cliente.
     - **Navegador local, escritorio y 375 px, 11 capturas:**
       - del nombre en la reseña al perfil;
       - "Cargar más" hasta 7 de 7;
       - nombre rechazado (contacto) y aceptado;
       - cambio de cuenta y perfil propio.
     - **Limitaciones:**
       - el perfil no muestra el nombre del título (es dato de TMDB);
       - la lista de bloqueados sigue sin nombres comunitarios;
       - ZWJ prohibido también en nombres (decisión pendiente abajo).
     - **Limpieza:** la base quedó como al empezar, con 019 aplicada:
       - 6 participantes, 2 versiones, 42 cuentas y 2 suspensiones;
       - 0 órdenes, locks y decisiones;
       - límites intactos;
       - interruptores apagados;
       - `SELECT` de `profiles` revocado.
       Docker Desktop estaba detenido: lo inicié sin tocar volúmenes.
     - **Sigue pendiente:**
       - `/api/title` en ejecución;
       - teléfono, Android y Capacitor para `/u/`;
       - tema claro, lector de pantalla y Producción.
     Informe: `docs/medidas/2026-10-27-informe-claude-e6.md`; salidas:
     `docs/medidas/2026-10-27-e6-salidas.txt`; capturas:
     `docs/medidas/2026-10-27-e6-recorrido/`.
     - **Corrección A1/A2 (27/10, Claude; cerrada por Codex el 27/10):**
       - **A1:** el cambio de nombre usa la idempotencia de publicar y editar
         (`comunidad.intentos`, acción `'nombre'`):
         - `id_intento` del cliente y hash del pedido;
         - relectura bajo los locks y registro de todo resultado en la misma
           transacción que su efecto;
         - un reintento devuelve lo resuelto sin escribir ni consumir cupo,
           y no pisa un nombre posterior de otra sesión;
         - el intento no guarda ningún nombre y su hash es un HMAC con el
           secreto del servidor;
         - la firma de la función cambió (019 borra la anterior); el down
           restaura el CHECK de 014;
       - **A2:** reductor puro de la vista del perfil
         (`lib/comunidad/perfil-nucleo.ts`):
         - "Cargar más" aplica `bloqueado`, `eliminada` o el módulo apagado,
           retira lo anterior e invalida los pedidos pendientes;
         - una falla real conserva las páginas;
         - una respuesta superada o de otra cuenta o perfil no toca nada;
       - **regresiones reales:**
         - `pruebas-nombre-intento` 5/5 (antes 0/4 con `8cbe0cd`);
         - `pruebas-perfiles` 25/25 (antes 22/25 con el manejador anterior);
         - up/down/up 5/5, permisos 29/29 y escritura 43/43;
         - **`npm test` completo: 2500 pasan, 0 fallan, 16 omitidas**;
           `tsc` 0;
       - **navegador local con los componentes reales**, escritorio y
         375 px, 11 capturas:
         - bloqueo en otra sesión, baja, módulo apagado, falla de red y
           reintento;
         - respuesta tardía tras un bloqueo desde el menú;
         - nombre con `id_intento`;
       - **simulado:** pérdida de respuestas, red, demora y "otra sesión"
         (script con funciones reales);
       - **limpieza:** la base quedó como al empezar (6/2/42/2, 0 órdenes,
         locks, decisiones e intentos de nombre; límites e interruptores
         intactos).
       Informe: `docs/medidas/2026-10-27-informe-claude-e6-a1a2.md`; salidas:
       `docs/medidas/2026-10-27-e6-a1a2-salidas.txt`; capturas:
       `docs/medidas/2026-10-27-e6-a1a2-recorrido/`.
   - **E7 local: Top Yumpers mensual (27/10, Claude, autorizada por el dueño
     sólo en local; `supabase start`, la app local y datos ficticios).
     E7 CERRADA COMO ENTREGA LOCAL por Codex el 27/10**
     (`docs/medidas/2026-10-27-auditoria-e7-ed6a791.md`, copiada sin cambios
     el 27/10; SHA-256 `188a22f4…`, igual al original): sin hallazgos
     bloqueantes; no habilita publicación. Precisión de la auditoría: las 14
     fronteras del caso 11 son 6 de tramo, 6 de suspensión del autor y 2 de
     suspensión del evaluador. Pendientes de integración conservados:
     `/api/title` en ejecución, TMDB, tema claro, teléfono/Android y lector
     de pantalla.
     - **Qué entró** (`020_comunidad_top.sql` + down):
       - `puntos_al_corte`: el cómputo de §2.2.2 (pares distintos;
         primera positiva del mes; tramo y suspensiones con la misma
         condición al corte; la suspensión es intervalo y no cierra tramos);
       - `consolidar_mes`: comprobación rápida sin lock → exclusivo
         (`proto_corte_exclusivo`) → nueva comprobación → una sentencia;
         posición densa y huérfanos sin id;
       - `comunidad_top_yumpers` (authenticated): último mes cerrado,
         consolida en la primera lectura, proyección con nombre y avatar de
         E6; "Cuenta eliminada" y "Usuario bloqueado" sin identidad;
       - ruta `/api/comunidad/top-yumpers` (Bearer, `private, no-store`);
       - selector en `/top`: "Top semanal plataformas" (el manual de
         siempre, público, con su toggle) y "Top Yumpers" (con sesión, sin
         toggle, sin `sessionStorage` ni caché compartida). Con los
         interruptores apagados, `/top` es el de antes;
       - sin cron ni purga (E8).
     - **Hallazgo propio corregido:** una FK de `top_resultados` a
       `participantes` hacía que la consolidación tomara KEY SHARE sobre los
       autores (lock implícito) y entrara en ciclo con la red de seguridad de
       Auth: abortada 5 de 5 en B8. Sin la FK, 0 de 5.
     - **Pruebas reales:**
       - `pruebas-top` 10/10: fórmula; caso 11 con 14 fronteras exactas;
         suspensión como intervalo; caso 10; reproducibilidad; proyección;
         bloqueo; permisos; ruta;
       - `pruebas-top-concurrencia` 6/6 en **cinco corridas seguidas**:
         casos 6 y 7; 50 lecturas con un solo cálculo y reutilización sin
         exclusivo; B8 real;
       - up/down/up de 020 5/5; permisos 29/29; unitarias 55/55;
       - **`npm test` 2509 pasan, 0 fallan, 16 omitidas**; `tsc` 0.
     - **Fixture declarado:** el reloj de `proto_marca`
       (`scripts/comunidad/solo-local-reloj.sql`), instalado y quitado en
       cada corrida con la definición comparada. En el navegador fueron
       simulados el error de red y el vacío.
     - **Navegador local, escritorio y 375 px, 9 capturas:**
       - selector e invitación sin sesión;
       - ranking real de septiembre con eliminada, bloqueado y posición
         propia;
       - perfil desde el ranking; error y reintento; vacío;
       - vuelta a plataformas con toggle; interruptores apagados.
     - **Limitaciones:** la primera lectura de un mes espera el exclusivo; el
       ranking muestra 50 filas sin paginar; la purga queda para E8.
     - **Limpieza:** la base quedó como al empezar, con 020 aplicada:
       - 6 participantes, 2 versiones, 42 cuentas y 2 suspensiones;
       - 0 tramos y 0 meses consolidados; sin `solo_local`;
       - límites e interruptores intactos.
     Informe: `docs/medidas/2026-10-27-informe-claude-e7.md`; salidas:
     `docs/medidas/2026-10-27-e7-salidas.txt`; capturas:
     `docs/medidas/2026-10-27-e7-recorrido/`.
   - **E8 local: retención y purga (27/10, Claude, autorizada por el dueño
     sólo en local; `supabase start` y datos ficticios; `a730934`).
     PENDIENTE DE AUDITORÍA FOCALIZADA de Codex.**
     - **Plazos (informado por el dueño, 27/10; decisiones de producto, NO
       validadas legalmente: P3 sigue abierto para la validación):** reseñas
       y votos vigentes, sin plazo; órdenes de Más útiles al vencer sus 2 h;
       intentos 7 días; reemplazadas y textos retirados 30 días salvo
       denuncia pendiente; retenidos y denuncias abiertas hasta resolverlos,
       nunca por antigüedad; denuncias resueltas 30 días desde el cierre;
       decisiones 12 meses; rankings 12 meses; historial de puntos después de
       consolidar el mes + 30 días. Sin configurar: huellas antispam (siguen
       cayendo con su versión y con la baja), rechazadas, retenidas, votos
       retirados y el resto sin plazo. **Sigue pendiente** conservar el texto
       denunciado tras borrar una cuenta: identificado
       (`conservar_texto_denunciado_baja`) y bloqueado por un CHECK.
     - **Interpretaciones a confirmar** (informe): "textos retirados" incluye
       el borrado del autor (`plazo_borradas`); "resueltas" = cerradas,
       también `denuncias_cerradas`; 12 meses del ranking desde el corte;
       suspensiones con las dos reglas (12 meses desde el fin y meses del
       corte liberados).
     - **Qué entró** (`021_comunidad_purga.sql` + down):
       - `comunidad.purga_config` (una fila) con `purga_activa` APAGADO y
         los plazos; `comunidad.purga_ejecuciones`, registro mínimo
         (cantidades y SQLSTATE, sin textos ni ids);
       - `comunidad.purgar(alcance, ahora)`: PROCEDIMIENTO que confirma
         cada lote ('hora' = órdenes; 'dia' = el resto), idempotente, una
         corrida por vez, se detiene si se apaga; no espera locks de filas
         (nowait / skip locked);
       - protecciones: vigentes, retenidas, rechazadas, denunciadas, casos
         abiertos, mes sin consolidar; un tramo por par mientras la versión
         pueda volver a votarse o restaurarse (mes de la primera positiva);
         huérfanos sólo sin referencias;
       - ventana del Top Yumpers: un mes fuera de la conservación no se lee
         ni se consolida (no se reconstruye vacío). El down devuelve
         `consolidar_mes` y la lectura exactamente a 020;
       - `supabase/cron-comunidad.sql`: cada hora y diario, `unschedule`
         idempotente, SQL puro en Supabase. **NO ejecutado**: `cron.job`
         sigue con sólo `sala-barrido`.
     - **Hallazgos propios corregidos:** una variable `t` del lote anulaba
       los alias `t` (tramos, rankings y participantes fallaban; unitaria
       nueva); `decisiones` iba antes del contenido y la corrida diaria no
       era idempotente (reordenado).
     - **Pruebas reales:** `pruebas-purga` 27/27 (cada categoría antes, en
       y después; protecciones; lotes; interrupción; `ocupada`; apagado en
       curso; `lock_timeout`; voto, borrado, edición, baja, generador y
       consolidación en vuelo; meses fuera de la conservación; permisos);
       up/down/up de 021 6/6 (sin 021 = volcado de E7); permisos 29/29;
       regresiones `pruebas-top` 10/10 con la ruta, `pruebas-top-concurrencia`
       6/6, `pruebas-utiles` 14/14, `pruebas-baja` 26/26; unitarias 47/47;
       **`npm test` 2518 pasan, 0 fallan, 16 omitidas**; `tsc` 0.
     - **Fixture declarado:** reloj de `proto_marca`; `ahora` de la purga;
       UPDATE de `intentos.creado_en`, `top_meses.consolidado_en` y
       `denuncias_cerradas.cerrada_en` de filas propias; plazo de rankings
       cambiado sólo dentro de algunas pruebas y restaurado.
     - **Limitaciones / decisiones para el dueño:** una reseña borrada con
       una retenida o rechazada adentro no se purga nunca (el admin no la
       puede resolver); purgar versiones baja la cobertura de
       `duplicado_propio` (las huellas caen con su versión); el peso de quien
       denuncia cuenta sólo descartadas de 30 días; un mes que nadie leyó
       conserva su historial hasta salir de la conservación (no hay job de
       consolidación mensual); sin probar pg_cron, backups, escala ni
       Producción.
     - **Limpieza:** la base quedó como al empezar, con 021 aplicada:
       6/2/42/2, todo lo demás en 0, límites e interruptores intactos,
       **purga apagada**, `SELECT` de `profiles` revocado, sin `solo_local`
       ni locks. Docker Desktop estaba detenido: lo inicié sin tocar
       volúmenes.
     Informe: `docs/medidas/2026-10-27-informe-claude-e8.md`; salidas:
     `docs/medidas/2026-10-27-e8-salidas.txt`.
   - decidir si el CHECK de 011 sigue prohibiendo U+200D (ZWJ), que
     bloquea los emojis compuestos. Es una restricción de E2a que no se
     reabrió;
   - denuncias recibidas en la baja: E4 (local, pendiente de auditoría) las
     cierra sin texto en `denuncias_cerradas`; desde A2, ese historial
     también se borra cuando la baja de quien denunció corre a la vez que la
     del autor. Que esté implementado NO equivale a aceptar la opción A.
     Queda para el dueño, con P3 y
     antes de la publicación, si se conserva el TEXTO denunciado
     después de una baja (opciones A/B/C del informe de E4): E8 lo deja
     identificado y desactivado, sin archivo de textos. El plazo de los
     intervalos seudónimos lo fijó el dueño el 27/10 (historial de puntos:
     consolidado + 30 días; ver E8). Huellas, excedentes y corroboraciones
     siguen cayendo en cascada con la versión;
   - la validación independiente de E1 (protocolo, autoría y ejecutor, no
     preparados);
   - la decisión sobre los cambios opcionales del contrato (por ahora no se
     aplican; los falsos positivos cuentan en C3/C4);
   - la autoría del conjunto final y el ejecutor del reservado 4 (no
     preparados);
   - las decisiones de producto P-1 a P-4 (alcance residual, condición para
     publicar, disponibilidad aproximada y autoría de la parte sensible).

     Recién después se autorizan cambios y una estrategia de validación;
   - P5: autorización de sólo lectura para E0 (no está autorizada; las
     consultas están en el plan y no se ejecutaron);
   - preguntas al dueño P3, P4 y P6 (revisión §1.4): plazos de retención,
     prueba de buzón sólo si E0 lo exige, y la carga de revisión que acepta
     (propuesta: colas de retenidos y denuncias más un muestreo de hasta 5
     publicaciones por sesión; **no aceptada**). No bloquean construir con
     fixtures; sí activar lo que depende de ellas (plan §1).
   Viaja en el mismo AAB que 3c.
   **MFA de la reseña editorial:** trabajo separado. Confirmado en código,
   no en la configuración efectiva de Producción.
4. **Issue #24:** el primer cruce mensual de supresiones tenía fecha prevista
   el **20/10/2026** (`proximaRevision: "2026-10-20"` en
   `lib/supresiones-disponibilidad.ts`). **Al 20/10/2026 no hay evidencia de
   que se haya hecho** (ningún commit, registro ni informe del dueño): sigue
   pendiente. Al hacerlo, registrar el resultado y la próxima fecha.
5. **Issue #22:** la prueba real del dueño por correo y la causa de la
   consumición del enlace (requiere los registros de Auth).
6. **Capacidad:** 3.c.2 (circuito), limitador y membresía no implementados;
   Etapas 4 (CDN + límite por ruta) y 5 (observabilidad) sin iniciar (#19,
   #20).
7. **Enlaces Android:** volver desde los correos de confirmación y
   recuperación no tiene filtro de App Links. Probar en teléfono los App Links
   (`app.yump.ar: verified`), el gesto táctil y el filtro de Mi lista con sesión
   en la app.
8. **Analíticas Android:** sin decidir (Analytics y Speed Insights no se
   montan en el contenedor, `app/layout.tsx`).
9. **Issues abiertos de producto:** ver `docs/ISSUES.md` (#1–#7, #9–#12, #14,
   #15, #16, #19, #20, #22, #24).
10. **iOS:** no iniciado; decidir con resultados de Android. Definir alertas de
    costo y consumo (Vercel, Upstash, Supabase).
11. Sin verificar contra los paneles (no se pudo desde acá): la versión de
    Supabase Auth del proyecto y sus registros; el kill switch
    `TMDB_PAUSA_429` (documentado como NO activado al 19/09); el botón web de
    Google Play (`NEXT_PUBLIC_YUMP_PLAY_PUBLICA`).

**Capacidad — tabla de etapas (actualizada al 19/10):**

| Etapa | Qué | Issue | Estado |
|---|---|---|---|
| PREVIA | El 500 por escritura fallida en Redis | #21 | ✅ desplegada el 11/09 |
| 0 | Poder medir | #20 | ✅ mergeada (`1073c70`) y desplegada (`9a4b7aa`) |
| 1 | Canonizar entradas + single-flight acotado al Home | #18 | ✅ mergeada (`e4bf75a`) y desplegada (12/09) |
| 2 | Turno distribuido + último Home bueno | #17 | ✅ mergeada (`cd1f393`) y desplegada (13/09) |
| 3 | Resistencia frente a TMDB | #19 | ✅ 3.a y 3.b desplegadas (15/09); ✅ 3.c.1 —pausa compartida ante 429— mergeada (`367b765`) y desplegada el 19/09; ⏳ 3.c.2, limitador, circuito, cadencias y membresía NO implementados; reintentos apagados |
| 4 | CDN + límite por ruta | — | no iniciada |
| 5 | Observabilidad permanente | #20 | no iniciada |

`feat/dia-rotacion` sigue divergida (cientos de commits detrás de `main`): se
reusa su diseño, no se mergea.

## Evidencia y alcance de esta actualización

- **Reseñas de usuarios y Top Yumpers — diseño de Codex registrado y
  preparación de Claude (2026-10-21). Sólo documentación: SIN código, SQL,
  migraciones, servicios pagos, consultas a Producción, push, merge, deploy
  ni AAB.** Rama local `docs/resenas-comunidad` (worktree
  `wt-resenas-comunidad`), desde `integracion/yumpea-compartir` (`52c7ae7`).
  El diseño de Codex
  (`docs/superpowers/specs/2026-10-21-resenas-comunidad-design.md`) se copió
  sin cambios del checkout principal, donde era un archivo sin seguimiento;
  no se tocó ningún otro archivo de ese checkout. La revisión está en
  `docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md`.

  **Reservado 3 híbrido, ejecutado una vez (23/10): NO CUMPLE C1 NI C2.
  E1 sigue pendiente de cierre.** Informe:
  `docs/medidas/2026-10-23-informe-claude-reservado-3.md`. Resultado del
  ejecutor: `docs/medidas/2026-10-23-e1-reservado-3-resultado.md` y `.json`.
  - **Enmienda** (`scripts/comunidad/banco-reservado-3/ENMIENDA-1.md`,
    aceptada por el dueño antes de escribir, sellar y evaluar): la parte
    sensible (36 casos) la escribió Claude, **no independiente**. La parte
    general (340 casos, 124 reseñas de abuso) es del agente separado. No es
    validación independiente integral.
  - **Sello** `48cb2f7`, antes de ejecutar. Código congelado
    `2026-10-22.5`, sin cambios.
  - **Criterios (agregado = parte general):**
    - C0: 0/376 errores;
    - **C1: 24/116 claros sin detectar;**
    - **C2: 69/99 ofuscadas detectadas;**
    - C3 y C4: 0/160 legítimas rechazadas o retenidas.
  - **Familias sin detectar:** emojis de tecla, dígitos en inglés o de otros
    alfabetos, separadores fuera de la clase, instrucciones de armado,
    enlaces con espacios o "dot/slash", redes fuera de la lista (Discord,
    snap, face, "tt") y correo indirecto sin alias escrito.
  - **Sin umbral, informativo:**
    - odio 3/12 frenados (reseñas y nombres);
    - amenaza 4/8;
    - datos personales 7/8;
    - spam 7/12;
    - perfil 2/4;
    - fuera de capacidad 0/8.
  - **No se ajustó nada:** no se corrigieron reglas, no se repite el conjunto
    como inédito y no se preparó otro. **Dictamen de Codex (`4183d37`): E1
    no cumple.** Siguiente paso: la propuesta de alcance del 23/10 y las
    decisiones del dueño (ver arriba).

  **Antecedente: la detención previa del reservado 3 (23/10).** Informe:
  `docs/medidas/2026-10-23-e1-reservado-3-detenido.md`.
  - **Hecho, en este orden (comprobado en Git):**
    - auditoría de `a8e973a` copiada;
    - congelamiento del código (`2026-10-22.5`, `b6e1f33`, huellas en
      `docs/medidas/2026-10-23-e1-reservado-3-congelamiento.md`);
    - protocolo en `scripts/comunidad/banco-reservado-3/PROTOCOLO.md`, antes
      de cualquier caso;
    - ejecutor `scripts/comunidad/correr-reservado-3.mjs`, probado con datos
      ajenos antes de encargar los casos.
  - **Autoría:**
    - un agente separado escribió `reservado.json` completo: 340 casos,
      forma correcta, sin leer y sin evaluar, guardado con su huella;
    - el agente de `reservado-sensible.json` (odio, amenaza, datos personales
      y fuera de capacidad) fue frenado por un clasificador de seguridad y no
      escribió nada.
  - **No se selló ni se evaluó.** Reglas sin cambios.
  - **Falta:** decisión del dueño, con revisión de Codex, entre:
    - que una persona ajena a las reglas escriba lo sensible;
    - que lo escriba Claude como enmienda declarada, no independiente;
    - o enmendar el protocolo para medir sin esa parte, lo que baja el abuso a
      124, por debajo del mínimo de 150.

    Se fija en Git antes de sellar.

  **Segunda corrección de E1.2 — inicio de ruta y criterio único de alias
  (22/10), en local, pendiente de auditoría. E1 sigue pendiente de cierre.**
  Auditoría de `251f3d0` copiada sin cambios
  (`docs/medidas/2026-10-22-auditoria-e12-correccion-251f3d0.md`). Informe:
  `docs/medidas/2026-10-22-informe-claude-e12-correccion-2.md`.
  - **Correcciones (comprobado en código y pruebas locales):**
    - A1 (`contacto.enlace` v5): la ruta vuelve a admitir al principio los
      caracteres de v3 (`/_demo`, `/-x`, `/?id=1`), con la terminación de
      2–63 letras; v4 había dejado de detectar `ejemplo.xy/_demo`;
    - A2 (`contacto.email_indirecto` v2): un solo criterio de alias para los
      dos recorridos; "soy 88cine" y "soy cine8fan" se retienen. Sigue sin
      rechazar.
    - `VERSION_REGLAS` `2026-10-22.5`.
  - **Pruebas conocidas, no validación independiente:**
    - banco de desarrollo de 506 casos: C0 0/506, C1 0/182, C2 177/177,
      C3 0/211, C4 1/211;
    - regresiones de los reservados 1 y 2 iguales que antes;
    - ninguna regresión observada.
  - **Falsos positivos conocidos:**
    - un título alfanumérico ("Se7en") con correo y pedido cerca se retiene;
    - "Buenísima.Recomendada/obligatoria" se sigue rechazando; Codex no lo
      considera bloqueante.
  - **Pruebas:** `lib/comunidad` 73 de 73; `tsc` 0 errores; `npm test` 2322
    pruebas, 2304 pasan, 0 fallan y 18 omitidas (exigen builds no hechos).
  - **Reservados:** intactos; no se preparó ni ejecutó un reservado 3.
  - **Siguiente paso:** auditoría de Codex. Después, decidir una única
    medición independiente con código y alcance congelados antes de escribir
    los casos. No se avanza a E2.

  **Corrección de E1.2 — enlaces con terminación larga y correo indirecto
  (22/10), en local. Antecedente: auditada en `251f3d0`, ver la segunda
  corrección arriba.**
  Auditoría de `40288f6` copiada sin cambios
  (`docs/medidas/2026-10-22-auditoria-e12-40288f6.md`). Informe:
  `docs/medidas/2026-10-22-informe-claude-e12-correccion.md`.
  - **Correcciones (comprobado en código y pruebas locales):**
    - A1 (`contacto.enlace` v4): la dirección con ruta acepta terminaciones
      alfabéticas de 2 a 63 letras; E1.2 sólo cubría de 2 a 6, aunque su
      informe decía "cualquier terminación". `ejemplo.photography/demo` se
      rechaza;
    - A2 (`contacto.email_indirecto` v1, nueva, **sólo retiene**):
      autoatribución de correo con alias, o pedido de correo con alias con
      forma de usuario. `R2-RA-042` ya no figura como fuera de alcance: se
      **retiene**, aunque su etiqueta dice "rechazar" (no se cambió).
    - `VERSION_REGLAS` `2026-10-22.4`.
  - **Pruebas conocidas, no validación independiente:**
    - banco de desarrollo de 498 casos: C0 0/498, C1 0/180, C2 173/173,
      C3 0/207, C4 1/207 (el retenido conocido `D-RG-17-B`);
    - regresiones del reservado 1 y 2 sin abusos sin detectar.
  - **Falso positivo conocido de A1:** un texto sin espacio después del
    punto y con una barra ("Buenísima.Recomendada/obligatoria") se rechaza.
    No aparece en ninguna legítima de los bancos.
  - **Pruebas:** `lib/comunidad` 71 de 71; `tsc` 0 errores; `npm test` 2320
    pruebas, 2302 pasan, 0 fallan y 18 omitidas (exigen builds no hechos).
  - **Reservados:** intactos; no se preparó ni ejecutó un reservado 3.
  - **Siguiente paso:** auditoría de Codex. No se avanza a E2.

  **E1.2 — huecos mecánicos y familias divulgadas (22/10), en local,
  pendiente de auditoría. E1 NO está cerrada.** Auditoría de `1f475e3`
  copiada sin cambios (`docs/medidas/2026-10-22-auditoria-e11-1f475e3.md`).
  Informe: `docs/medidas/2026-10-22-informe-claude-e12.md`.
  - **Correcciones (comprobado en código y pruebas locales):**
    - A1: las comillas ya no eximen. Un pedido con destinatario se rechaza
      con o sin comillas; entre comillas o atribuido, sin destinatario, se
      retiene;
    - A2: dígitos de cualquier sistema Unicode, separadores por clase de
      signo, números dictados 16–99 y lectura amplia (coma, letras sueltas)
      sólo con señal fuerte;
    - A3: dirección con ruta y TLD de 2 a 6 letras (el informe decía
      "cualquier TLD"; corregido después, ver arriba), más TLD y acortadores;
      "las punto com" ya no es dominio;
    - familias del reservado 2: alias de redes, spam por familias, correo en
      nombres, partido con colgante, amenaza espaciada y DNI con espacios.
    - `VERSION_REGLAS` `2026-10-22.3`.
  - **Pruebas conocidas, no validación independiente:**
    - los 6 ejemplos de la auditoría dan lo esperado;
    - regresión del reservado 1 y del reservado 2 verdes, con
      `R2-RA-042` (correo descripto con paráfrasis) **detenido para
      revisión** (después retenido; ver la corrección arriba);
    - banco de desarrollo de 488 casos;
    - transformaciones de comillas, separadores, 8 formas de dígitos,
      confusables y contacto repartido.
  - **Falsos positivos nuevos:** diálogos legítimos con un pedido de red
    entre comillas pasan a retenerse (`D-RG-17-B`, `R2-RL-105`).
  - **Pruebas:** `lib/comunidad` 69 de 69; `tsc` 0 errores; `npm test` 2318
    pruebas, 2300 pasan, 0 fallan y 18 omitidas (exigen builds no hechos).
  - **Reservados:** no se preparó ni ejecutó un reservado 3. Ambos
    reservados, sus sellos y sus informes siguen intactos. Errata: el
    archivo sensible del reservado 2 tiene 26 reseñas y 4 nombres, no "30 +
    4" como dice su `SELLO.md` (no se modificó).
  - **Siguiente paso:** auditoría de Codex de E1.2; si se acuerda, una
    medición independiente con alcance sellado de antemano. No se avanza a
    E2.

  **E1.1 — corrección de reglas y evaluador (22/10), en local. NO cumplió
  C1 ni C2 (antecedente; ver E1.2 arriba).** Auditoría de Codex sobre `ffa5061`
  copiada sin cambios (`docs/medidas/2026-10-22-auditoria-e1-ffa5061.md`).
  Informe para Codex: `docs/medidas/2026-10-22-informe-claude-e11.md`.
  - **Correcciones (comprobado en código y pruebas locales):**
    - A1: teléfonos con forma de año, importe o fecha cuentan si hay una
      señal fuerte de contacto; letras por dígitos;
    - A2: correo "usuario en/de proveedor" y confusables ampliados (no es
      Unicode completo);
    - A3: `contacto.red` exige evidencia acotada; el diálogo entre comillas
      no dispara;
    - A4: el evaluador declara `no_evaluable` un banco inválido o 0/0, y los
      errores no cuentan como detección;
    - `VERSION_REGLAS` `2026-10-22.2`; odio, amenazas y datos personales sin
      cambios.
  - **Regresiones:** 18 pares benigno/malicioso con los casos divulgados, y
    el reservado 1 como regresión conocida. **El reservado 1, su sello y su
    informe fallido siguen intactos** y no se presentan como medición nueva.
  - **Reservado 2:**
    - especificación commiteada antes (`44bd6bd`) y sello antes de ajustar
      (`a24df81`);
    - 330 casos de un agente separado que no leyó las reglas, más 34
      sensibles (odio, amenazas, datos) escritos por Claude sobre reglas no
      modificadas, informados aparte;
    - corrido **una vez**: evaluable; C0, C3 (1/150) y C4 (0/150) cumplen;
      **C1 12/124 y C2 102/117 (87,2 %) no cumplen**. Resultado por caso en
      `docs/medidas/2026-10-22-e11-banco-reservado-2.md`.
  - **Fallos por familia:**
    - palabras-número compuestas y separadores tipográficos;
    - letras sueltas sin dígitos y dígitos no ASCII;
    - correo descripto sin nombrar el proveedor;
    - acortador con TLD no listado;
    - "tik tok"/"tg" y red descripta en palabras;
    - spam fuera del vocabulario (6 de 12);
    - contacto partido sin números;
    - 1 falso positivo: "las punto com".
  - **Pruebas:** `lib/comunidad` 56 de 56; `tsc` 0 errores; `npm test` 2305
    pruebas, 2287 pasan, 0 fallan y 18 omitidas (exigen builds no hechos);
    sin llamadas externas.
  - **Comparación con E1:** no se puede leer como mejora o empeoramiento. El
    reservado 2 es más grande y más independiente. Los fallos divulgados ya
    se detectan, pero un banco escrito sin conocer las reglas sigue
    encontrando huecos.
  - **Siguiente paso:** auditoría de Codex de E1.1. Otra corrección, si se
    autoriza, necesitaría un reservado 3 nuevo y sellado. No se avanza a
    E2.

  **E1 — reglas propias y banco sintético (22/10), implementada en local;
  no cumple su aceptación (auditoría de `ffa5061`).** Rama `feat/resenas-reglas` desde
  `docs/resenas-comunidad` (`a029259`). Informe para Codex:
  `docs/medidas/2026-10-22-informe-claude-e1.md`.
  - **Comprobado en código y pruebas locales:**
    - `lib/comunidad/reglas/`: plegado en dos pasadas, 19 reglas con `id` y
      versión, y decisión publicar/retener/rechazo/error, donde ningún fallo
      publica;
    - contexto explícito para el contacto partido;
    - **no está conectado** a rutas, pantallas, Supabase ni publicaciones.
  - **Reservado sellado antes de escribir las reglas** (commit `3437578`,
    SHA-256 LF `9975c60c…62c4ec79`) y corrido **una vez** al cierre:
    - C0, C3 y C4 cumplen;
    - **C1 no cumple: 3 de 50 contactos claros publicados.** Letras O dentro
      de un número, correo dicho "juanperez en gmail" y una `м` cirílica en
      el TLD;
    - **C2 no cumple: 40 de 43 ofuscadas frenadas (93 %);**
    - 1 legítima retenida: una dirección ficticia de la trama.
    - No se modificó el conjunto ni se volvió a correr. Resultado por caso
      en `docs/medidas/2026-10-22-e1-banco-reservado.md`.
  - **Banco de desarrollo:** 406 casos; todos los casos dan lo esperado y
    cumple C0–C4.
  - **Pruebas:**
    - `lib/comunidad`: 42 de 42;
    - `npx tsc --noEmit`: 0 errores;
    - `npm test`: 2291 pruebas, 2273 pasan, 0 fallan y 18 omitidas. Las
      omitidas exigen un build web o de Capacitor, que no se hizo por estar
      fuera de E1.
    - Dependencias instaladas en el worktree con `npm ci --prefer-offline`
      desde el mismo lockfile.
  - **Limitaciones:**
    - mide reglas contra casos sintéticos, no seguridad en uso real;
    - el reservado lo escribió el mismo autor de las reglas, así que el
      resultado es probablemente optimista;
    - menores sólo con combinaciones mínimas;
    - duplicados y límites por cuenta quedan para E3b;
    - listas y umbrales son hipótesis.
  - **Siguiente paso:** auditoría de Codex de E1. Ajustar o no las reglas
    por los fallos del reservado, y si hace falta un conjunto nuevo sellado,
    queda a criterio de esa auditoría y del dueño. No se avanza a E2.

  **Plan corregido tras la auditoría de Codex sobre `9450006` (22/10).**
  Informe copiado sin cambios
  (`docs/medidas/2026-10-22-auditoria-plan-resenas-9450006.md`, SHA-256
  `BBF24038…993A3AAC`). Correcciones puntuales, resumen en el plan §0:
  - tareas de interfaz por recorrido;
  - pruebas preliminares separadas de los gates de integración;
  - MFA real en local, sin stub;
  - E0 en bloques independientes con privilegios efectivos (sin ejecutar);
  - E9c sin revisión obligatoria de todo;
  - barreras del esquema privado probadas por separado;
  - casos de baja B12–B14;
  - rollback que conserva el cierre de `user_reviews`.

  **Plan de implementación (22/10) — preparado, pendiente de auditoría y
  autorización.** Sólo documentación; nada ejecutado.
  - Auditoría de Codex sobre `e34c53e`
    (`docs/medidas/2026-10-22-auditoria-resenas-e34c53e.md`, copiada sin
    cambios, SHA-256 `E52E997D…21ADB2DEA4`).
  - **Contrato de baja cerrado** (revisión §2.2.3): marcador persistente
    `bajas_en_curso` mientras Auth tiene la cuenta; lock por cuenta que
    impide recrear participante y rechaza escrituras en vuelo; reintento y
    reconciliación con `getUserById`; el mensaje distingue "se borraron tus
    datos de comunidad" de "se eliminó la cuenta"; sin cancelación del
    usuario y sin restauración; procedimiento técnico para bajas desde el
    panel. **No hay atomicidad entre los dos pasos**; los textos que la
    afirmaban quedaron conciliados.
  - Plan en `docs/superpowers/plans/2026-10-22-resenas-comunidad.md`: E0
    (consultas de sólo lectura escritas, **no ejecutadas**), E1 reglas, E2a
    esquema y permisos, E2b baja (temprana, casos B1–B11), E2c locks, E3a
    escritura, E3b colas y denuncias, E4 moderación, E5a lectura, E5b
    utilidad, E6 perfiles, E7 Top Yumpers, E8 purga, E9a web apagada, E9b
    Android (mismo AAB que salas), E9c activación.
  - Pruebas de permisos, concurrencia y cascadas en Supabase local con roles
    reales y REST/RPC directo, sobre el banco de salas.
  - **Siguiente paso:** auditoría de Codex del plan. Después, autorización
    del dueño entrega por entrega.

  **Versión 3.1 (21/10) — correcciones puntuales tras la auditoría de Codex
  sobre `97cf4d7`** (`docs/medidas/2026-10-21-auditoria-resenas-97cf4d7.md`,
  copiada sin cambios del checkout principal, SHA-256 `099CAB0E…68BBA595`).
  No reescribe la revisión; cambia sólo las secciones afectadas (tabla al
  inicio del documento). Todo sigue **propuesto, no aprobado**:
  - **Autorización por operación (§2.1.2):** publicar/editar/evaluar exigen
    no estar suspendido, publicación encendida, términos y correo. Retirar
    voto, borrar reseña, bloquear y gestionar/eliminar cuenta **no dependen**
    de pausa, suspensión, términos, correo ni filtro. Denunciar no depende de
    suspensión ni pausa, y sí exige correo, como fija el diseño.
  - **Denuncias (§3.3.2):** ninguna oculta por la categoría elegida; retiene
    sólo la corroboración por las reglas vigentes o el admin; lo demás se
    prioriza y quien denuncia puede bloquear al instante. Sin umbral fijo de
    cantidad. "No me sirvió" no afecta moderación.
  - **Saturación (§3.3):** colas separadas de retenidos y denuncias. La
    admisión a retenidos está acotada por autor y en total: lo que iría a la
    cola no se admite cuando está llena. Lo que pasa las reglas se sigue
    publicando. La pausa total es sólo manual. **Se retira** el "sólo
    retener" automático de v3 y la retención por cantidad de rechazos.
  - **Revisión de rechazos (§3.3.3):** el autor puede enviar a revisión el
    texto rechazado por una regla de contenido. Queda retenido con id,
    `version_reglas` y regla; nunca se publica sin el admin. No se guardan
    todos los rechazos.
  - **Ediciones (§3.4.1):** un rechazo, un fallo o un conflicto no tocan la
    versión anterior ni los votos. Los votos se reinician una sola vez, al
    persistir un texto nuevo. Los reintentos son idempotentes con
    `id_intento`.
  - **Concurrencia (§2.2.2–§2.2.4):**
    - orden de locks fijo: `K_CORTE` compartido, luego entidades en orden
      estable, relectura y recién después la marca;
    - consolidación en `READ COMMITTED`, con el cálculo en una sentencia
      posterior al lock exclusivo;
    - mismo lado del corte para tramos y suspensiones;
    - baja en dos pasos desde la ruta (`baja_comunitaria` antes de
      `deleteUser`) y red de seguridad documentada para Auth;
    - 11 casos verificables con sesiones concurrentes.
  - **Carga del dueño (§3.5, P6):** se retira la lectura diaria de todo. Se
    propone muestreo acotado más las colas; no certifica eficacia.
  - **Precisiones:**
    - snapshots en filas de 100 ids, con la cota física distinta de la
      lógica;
    - plegado en dos pasadas, con confusables ambiguos como clases;
    - nombres sin reglas de texto anómalo;
    - hashes de shingles con clave, en vez de fragmentos;
    - el avatar ya no se describe como "sin riesgo";
    - Vercel y Supabase siguen tratando el texto;
    - umbrales como hipótesis.

  **Versión 3 (21/10) — decisión del dueño: SIN gastos adicionales.**
  (Sus puntos sobre autorización común, denuncia grave que retiene,
  "sólo retener" automático, lectura diaria de lo publicado, snapshot en un
  solo `bigint[]` y baja por trigger quedan corregidos por la v3.1.)
  Auditoría de Codex sobre `68bd773`
  (`docs/medidas/2026-10-21-auditoria-resenas-68bd773-presupuesto.md`) y el
  diseño actualizado por Codex con esa decisión, copiados sin cambios del
  checkout principal. Al diseño sólo se le agregó una nota de registro que
  remite a la revisión, sin cambiar sus reglas.
  - **Superado por la decisión del dueño:** proveedor y clasificador externo,
    configuración de modelos, costos de API, tope de USD 10, banco pago y
    retención de proveedores (v2 §3, §4, §5.1; P1, P2). Tampoco se sustituye
    por una API gratuita.
  - **Propuesto en v3, no aprobado:**
    - **Moderación por reglas propias** en la ruta del servidor, para enlaces,
      contactos, ofuscación, duplicados y spam:
      - rechazo de enlaces y contactos claros, con motivo;
      - retención de señales de spam, odio u amenaza explícita y datos
        personales;
      - publicación automática del resto;
      - un fallo nunca aprueba;
      - cola con pausa automática.
      - Las mismas reglas valen para ediciones y nombres comunitarios, con
        las vías de elusión revisadas.
      - No entiende contexto: acoso sin términos de lista, ironía y
        difamación dependen de denuncias y revisión.
      - Pruebas sintéticas locales con suite de falsos positivos.
    - Escritura sólo por funciones ejecutables por `service_role`.
    - Autoevaluación impedida con autor redundante, FK compuesta y `CHECK`
      de la misma fila.
    - Baja de cuenta: participante comunitario con `on delete set null` y
      sin estado "no reconstruible". (Lo de "atómica" quedó superado: desde
      el 22/10 es una baja en dos pasos con marcador persistente, sin
      atomicidad entre los pasos; ver revisión §2.2.3.)
    - Corte mensual para todas las operaciones por bloqueo consultivo
      compartido/exclusivo con marca `clock_timestamp()` posterior al
      bloqueo. **Reemplaza el margen de 15 min de v2.**
    - Snapshots `bigint[]` con un solo generador por título, cota de
      almacenamiento y revalidación de 50 posiciones por página.
  - **Cuotas.** Panel (dueño, 18-19/09): Supabase Free, PostgreSQL 17.6,
    `pg_cron` 1.6.4; Vercel 19K de 1M invocaciones a 30 días. Hay que
    actualizarlas en E0; no se promete costo cero.
  - **Entregas:** E0–E9, sin elección de proveedor ni pruebas pagas.

  **Versión 2 (21/10), corregida tras la auditoría de Codex sobre `f64a659`**
  (sus partes de proveedor, costos, tope y el margen de 15 min quedan
  SUPERADAS por la v3)
  (`docs/medidas/2026-10-21-auditoria-preparacion-resenas.md`, copiada sin
  cambios del checkout principal). Correcciones, detalle en la revisión §0:
  - **Permisos (A1):** la escritura por RPC `security invoker` de `f64a659`
    dejaba escribir directo y saltear límites. Ahora:
    - sin permisos de tabla para `anon`/`authenticated`;
    - funciones `security definer` acotadas;
    - invariantes en la base;
    - matriz de permisos por rol en E2.
  - **Cierre mensual (A2):** la idempotencia sola no reconstruía el corte.
    Ahora:
    - tramos con validez temporal y cómputo a la fecha del corte argentino;
    - seudonimización (no cascada) con la baja de cuenta;
    - purga sólo después de consolidar;
    - margen de 15 min.
  - **Paginación (A3):** el tope de 200 se retira. "Recientes" usa cursor
    por clave. "Más útiles" usa un orden congelado compartido, sin datos del
    lector, y revisa la visibilidad en cada página.
  - **Correo (A4):** la recuperación de contraseña (#22) se separa de la
    confirmación del alta. Con Confirm email apagado, `email_confirmed_at`
    no prueba posesión del buzón. **#22 ya no figura como dependencia.**
  - **Modelos y costos (A5):**
    - razonamiento desactivado ≠ esfuerzo bajo;
    - gpt-5-nano retirado como candidato (Deprecated);
    - costo estimado, medido y tope separados;
    - incluye nombres, ediciones y la cota de reintentos (Haiku 5.5:
      estimado USD 2,21 y cota USD 6,30 para 10.000 análisis; tope
      propuesto USD 10/mes).
  - **Planificador (A6):** **corrige la afirmación anterior** de que el
    único job era `tmdb-sync`. El repo también programa `sala-barrido` por
    `pg_cron` (`009_salas.sql:815`), que es el patrón propuesto. Los jobs
    efectivos de Producción siguen sin verificar.
  - **Otras precisiones:**
    - "ninguna API de toxicidad detecta…" pasa a "las APIs examinadas no
      tienen categoría para…";
    - retención de proveedores con excepciones, y una clasificación de Yump
      no es una marca de abuso del proveedor;
    - el banco compara opciones, no certifica seguridad.
  - **Se retiran:** la espera de 24 h para cuentas nuevas (no aprobada), el
    replanteo de los nombres del selector (ya decididos) y la lista de once
    decisiones del dueño. Quedan P1–P5 (producto, gasto, privacidad). Las
    tablas nuevas frente a adaptar `user_reviews` pasan a ser una elección
    técnica justificada.

  **Comprobado en código (`52c7ae7`); lo efectivo en Producción no se
  comprobó:**
  - `user_reviews`: el SQL deja leer aprobadas a `anon` y conserva el estado
    al editar;
  - la reseña editorial se escribe con `is_admin()`, que no comprueba AAL2
    (sólo el Top usa `is_admin_mfa()`). Es trabajo separado: no se implementa
    acá ni se tocan cuentas, factores o permisos;
  - `profiles` no guarda correo y sólo deja leer la fila propia;
  - `display_name` sin reglas en la base;
  - sin limitador de tasa;
  - la ficha no está en el bundle nativo;
  - CORS sólo admite GET/POST.

  **Siguiente paso:** ver el bloque "Plan de implementación (22/10)" de
  arriba. Mientras no haya autorización no se escribe código ni SQL.

- **Integración de Yumpeá: "Compartir invitación" + ícono del resultado
  (2026-10-21) — desarrollo y prueba local TERMINADOS; rama local
  `integracion/yumpea-compartir`, SIN push, SIN merge a `main`, SIN deploy,
  SIN AAB.** Autorizada por el dueño sólo para integrar en una rama aparte;
  merge y deploy siguen pendientes de su autorización.
  **Cierre (decisiones del dueño, 21/10):** (1) su prueba local queda
  APROBADA y no se repite; (2) la prueba con sala real deja de ser requisito:
  queda sólo como verificación adicional opcional; (3) Android: estos cambios
  se publican en el MISMO AAB que el futuro sistema de reseñas de usuarios —
  no hay release separada y la versión y el `versionCode` NO se fijan ahora.
  **Auditoría de Codex sobre `298555a` (informada por el dueño, 21/10):**
  revisó el código combinado sin defectos bloqueantes identificados; `npm
  test` **2249 / 2249**, sin omitidas; tipos sin errores; diff sin problemas
  de formato. Codex NO repitió las compilaciones ni las pruebas visuales.
  **Estado previo (Git, 21/10):** `origin/main` = `915ef2e` (`git ls-remote`);
  ninguna de las dos ramas existe en el remoto; `feat/compartir-invitacion` =
  `06f3c59` (sobre `88c5120`), `fix/icono-compartir-match` = `f49ff65` (sobre
  `915ef2e`); el `main` local (`06bdfd1`) está viejo y no se usó. No se
  tocaron otros checkouts, sus cambios pendientes ni los stashes.
  **Cómo se integró:** desde `origin/main`, dos merges `--no-ff` (sin
  cherry-pick: ningún commit duplicado): `b0d089f` (lobby, trae también
  `88c5120`, sólo documentación del deploy del Top) y `7b1f2cf` (ícono). Único
  conflicto: este archivo; se conservaron los dos registros y el cierre del
  Top de `88c5120` (deploy re-comprobado: 7210383316, `success`). La
  anotación "Pruebas OK" del Top que traía `06f3c59` volvió a PENDIENTE (ver
  3b del resumen): no hay confirmación explícita del dueño en esta sesión.
  **Diff contra `origin/main` (código):** `components/sala/Lobby.tsx`,
  `lib/sala/invitacion.ts`, `components/sala/CompartirMatch.tsx`,
  `app/globals.css` (`.sala-compartir` y `.sala-compartir-match svg`, 18×18)
  y tres archivos de prueba. `lib/compartir-accion.ts` (la acción común,
  incluida la cancelación sin WhatsApp) **no cambia**. Sin servidor, base ni
  migraciones.
  **Verificación (Claude):** `tsc --noEmit` 0; `npm run build` OK y
  `build-capacitor` no release (`--api-base=https://ejemplo.invalid`) OK,
  los dos con variables FALSAS; los dos bundles traen "Compartir invitación" y
  `sala-compartir-match`. `npm test` **2249 / 2249**, 0 fallos, **0 omitidos**
  (con los dos builds presentes).
  **Navegador — build de Producción local (`next start`, `localhost:3200`)
  contra un Supabase FALSO local (`:3301`, responde `sala_estado`/`sala_unirse`
  para tres salas inventadas; ninguna petición a la base real, el build no
  contiene el host real). NO es un recorrido con una sala real.** Se usaron
  las pantallas reales (`SalaView`: `Lobby`, `ResultadoMatch` y
  `ResultadoEmpate` desempatado). Lobby, con `navigator.share` y
  `window.open` simulados: doble toque con la hoja abierta = 1 llamada;
  payload `{title: "Yump", text: "¡Sumate a mi sala de Yumpeá! Elegimos juntos
  qué ver:", url: https://app.yump.ar/sala/<uuid>?organizador=Juan%20P%C3%A9rez}`;
  cancelar (AbortError) no abre nada y el botón vuelve a funcionar; un error
  que no es cancelación y la falta de Web Share abren `wa.me` con texto +
  salto de línea + enlace; "Copiar enlace" copia la MISMA url y pasa a
  "Copiado". Resultado: "Compartir" comparte "¡Nuestro match!" con la ficha
  `https://app.yump.ar/titulo/movie/<id>`; cancelar no abre nada. **Medidas:**
  a 1280 px y a 375 px (emulación móvil), ícono del lobby **18×18**, ícono del
  match y del empate resuelto **18×18** a la izquierda del texto, sin
  desborde horizontal ni elementos fuera de pantalla; capturas revisadas.
  **No probado:** Supabase real, Realtime, una sala real, la hoja real del
  sistema (Windows, Android, iOS), WhatsApp de verdad, un teléfono y el
  contenedor Android.
  **Backend del build de prueba (comprobado 21/10, sólo nombres de host):** el
  `.env.local` del checkout principal y la web pública `app.yump.ar` usan el
  MISMO proyecto de Supabase (`aibqqebwlladjjkeqllo`; en la web, leído de sus
  chunks públicos). Por eso un build local con ese `.env.local` crea salas
  REALES en la base de Producción y el enlace público
  `app.yump.ar/sala/<uuid>` lleva a la MISMA sala: **el recorrido completo
  (compartir → invitado entra → votan → resultado) se puede probar sin
  desplegar.** Lo que ese recorrido NO comprueba: lo que ve el invitado sale
  del código de Producción (sin estos cambios; para él, el ícono del
  resultado sigue invisible hasta el deploy), y un teléfono no puede abrir
  `localhost` (por la IP de la red local no es contexto seguro: no hay Web
  Share y cae a WhatsApp), así que la hoja nativa del lobby nuevo se prueba
  en la computadora o después del deploy/AAB. La worktree tiene hoy un
  `.env.local` FALSO (ignorado por Git) y su `.next` se compiló con él.
  **Prueba local del dueño: APROBADA (informado por el dueño, 21/10: "todo
  OK").** En el panel del navegador de la app, el mismo build local contra el
  Supabase SIMULADO (lobby, match y empate resuelto de las salas inventadas).
  Alcance exacto: no incluye salas reales, WhatsApp real, teléfono ni
  Producción.
  **Verificación adicional OPCIONAL — no es requisito de cierre (crea datos
  reales en Producción):**
  1. En `D:\DESARROLLO\stream central\wt-integracion-compartir`, reemplazar
     el `.env.local` falso por el real: `copy ..\streamingcentral\.env.local
     .env.local`.
  2. RECOMPILAR (las `NEXT_PUBLIC_*` quedan fijas en el build): `npm run
     build` y después `npx next start -p 3200`.
  3. En Chrome de la computadora, `http://localhost:3200`, entrar con la
     cuenta personal o la adicional (la sesión de `app.yump.ar` no se
     comparte con `localhost`; si el método de ingreso redirige a
     `app.yump.ar`, usar uno que no lo haga).
  4. `/sala/nueva` → crear la sala → lobby "Sala de <nombre>".
  5. "Compartir invitación": aparece la hoja de Windows; elegir WhatsApp (o
     copiar) y comprobar el texto "¡Sumate a mi sala de Yumpeá! Elegimos
     juntos qué ver:" con el enlace `https://app.yump.ar/sala/<uuid>?organizador=…`
     abajo. Si no aparece hoja, abre WhatsApp Web con el mismo mensaje.
  6. Tocar de nuevo y cerrar la hoja sin elegir nada: no se abre WhatsApp.
     Doble clic rápido: una sola hoja.
  7. "Copiar enlace" → pegarlo: es la misma url del mensaje; el botón dice
     "Copiado".
  8. Abrir ese enlace en el celular (o en una ventana privada): es la web de
     Producción. Pide el nombre, entra, y en el lobby de `localhost` aparece en
     "Quiénes están".
  9. Empezar la tanda desde `localhost` y votar las dos partes para llegar a
     "¡Hay match!" (o a un empate y "Desempatar"). En `localhost`, "Compartir"
     muestra el ícono a la izquierda del texto; tocarlo y cancelar no abre
     nada. En el celular (Producción) el ícono sigue invisible: es lo esperado
     hasta el deploy.
  10. Al terminar, "Cerrar sala" (las salas vencen solas). Opcional: borrar el
      `.env.local` real de la worktree.
  **Android — sin release propia (decisión del dueño, 21/10):** el lobby y el
  resultado viajan en el bundle local, así que la 1.2.0 instalada no muestra
  ninguno de los dos hasta un AAB nuevo. Ese AAB es el MISMO que llevará el
  futuro sistema de reseñas de usuarios: salas y reseñas se publican juntas.
  No se prepara un AAB separado para estos arreglos y la versión y el
  `versionCode` se deciden recién con esa release (la regla general sigue: el
  `versionCode` nuevo tiene que ser mayor que el último subido, hoy 4). Al
  armar esa release conviene verificar en el paquete "Compartir invitación" y
  `sala-compartir-match`, y probar en teléfono la hoja nativa del lobby y el
  ícono del resultado. No hace falta ningún plugin nuevo (`@capacitor/share`
  ya viaja). El procedimiento de AAB `5 (1.3.0)` que figuraba en esta entrada
  y en la de "Compartir invitación" queda REEMPLAZADO por esta decisión.
- **Ícono del botón "Compartir" del resultado de Yumpeá (2026-10-21) —
  corregido en `fix/icono-compartir-match`; integrado el 21/10 en la rama
  local `integracion/yumpea-compartir` (entrada de arriba), NO desplegado, sin
  AAB.** **Problema:** `components/sala/CompartirMatch.tsx` (usado por
  `ResultadoMatch.tsx` y `ResultadoEmpate.tsx`) dibuja un `<svg viewBox="0 0
  24 24">` sin width/height y ninguna regla de CSS le daba tamaño; dentro de
  `.sala-acciones.sala-acciones-resultado` medía **0×0**: el botón y su texto
  funcionaban, el ícono no se veía. **Cambio:** el botón suma la clase
  `sala-compartir-match` y `app/globals.css` la regla
  `.sala-compartir-match svg{width:18px;height:18px;flex:none}`, la misma
  medida que `.sala-compartir svg` del lobby (`2d260e6`, en
  `feat/compartir-invitacion`). Sin cambios de lógica, servidor ni base.
  **Verificación (Claude):** `lib/sala/compartir-match-icono.test.ts` (2:
  clase en el botón y regla en el CSS); suite **2223 / 2241** pasan, 0 fallos,
  18 omitidos (los de artefactos: sin `out-capacitor` ni build web en la
  worktree); `tsc --noEmit` 0; `git diff --check` limpio. **Navegador**
  (`next dev` local con variables FALSAS, una página temporal —no
  commiteada— que renderizaba el `CompartirMatch` real dentro de
  `.sala-resultado.sala-match > .sala-acciones.sala-acciones-resultado`): a
  1024 px el ícono mide **18×18**; quitándole la clase en el mismo DOM vuelve a
  **0×0** (reproduce el hallazgo); a 375 px, 18×18, ícono visible a la
  izquierda de "Compartir" y sin desborde horizontal.
  **No probado:** la pantalla real "¡Hay match!" / empate con una sala de
  verdad, un teléfono, Producción y el contenedor Android.
  *(Histórico, superado el 21/10: la prueba del dueño quedó cubierta por su
  prueba local aprobada de la integración —ver la entrada de arriba—; lo de
  abajo ya no es un paso pendiente.)* Prueba del dueño propuesta entonces:
  terminar una sala con match (o empate resuelto) y comprobar que "Compartir"
  muestra el ícono de compartir a la izquierda del texto, en el celular y en
  la computadora.
- **"Compartir invitación" en el lobby de Yumpeá (2026-10-20) —
  implementado en `feat/compartir-invitacion` (`f0fc85c` + `2d260e6`); integrado el
  21/10 en la rama local `integracion/yumpea-compartir` (ver esa entrada), NO
  desplegado, sin AAB.** Base: `88c5120` (= `origin/main` `915ef2e` + el
  registro del deploy del Top, sólo documentación, también sin push).
  **Qué cambia:** en "Invitá a alguien" la acción principal es "Compartir
  invitación" y debajo sigue el enlace con "Copiar enlace" (antes "Copiar").
  El botón usa la acción de siempre (`compartir` de `lib/compartir-accion.ts`:
  plugin nativo en Android, Web Share en la web, WhatsApp si no hay ninguno, y
  cerrar la hoja no abre nada) con el mensaje nuevo `mensajeInvitacion`
  (`lib/sala/invitacion.ts`): título "Yump", texto "¡Sumate a mi sala de
  Yumpeá! Elegimos juntos qué ver:" y, APARTE, la url de
  `enlaceDeInvitacion` —la misma que se copia: `https://app.yump.ar/sala/<uuid>`
  con `?organizador=` para la vista previa—. Se arma sólo con el id y el
  nombre: la credencial de participante no entra. Un doble toque no abre una
  segunda hoja (con Web Share, una segunda llamada rechaza con un error que no
  es cancelación y caería a WhatsApp). Se corrigió el comentario del lobby que
  prometía la función "para la Etapa 5". Sin cambios de servidor, base ni
  migraciones.
  **Verificación (Claude):** `lib/sala/invitacion-compartir.test.ts` (8:
  texto exacto, url idéntica a la copiada para nombres válidos e inválidos,
  sólo el parámetro `organizador` y nunca la credencial, WhatsApp con texto y
  enlace, Web Share y plugin con campos separados, cancelar sin WhatsApp en web
  y nativo, cableado del botón y de "Copiar enlace", comentario corregido); el
  inventario de `lib/plugins-nativos.test.ts` suma el lobby a los
  consumidores de la acción; los caminos de la acción siguen cubiertos por
  `lib/compartir.test.ts`. Tres mutaciones detectadas (url sin organizador,
  lobby sin la acción compartida, cancelar que abre WhatsApp). Suite **2247 /
  2247**, 0 fallos, 0 omitidos (con build web y export nativo presentes);
  `tsc --noEmit` 0; `git diff --check` limpio; `npm run build` y
  `build-capacitor` (no release, `--api-base=https://ejemplo.invalid`) OK; el
  chunk nativo de `/s` trae "Compartir invitación" y el texto nuevo.
  **Navegador (build de Producción local, `localhost:3200`, contra un
  Supabase FALSO local que respondía `sala_unirse` y `sala_estado`; ningún
  dato real):** entrada como invitado con el formulario → lobby "Sala de Juan
  Pérez"; con `navigator.share` simulado recibió `{title: "Yump", text: <el
  texto>, url: https://app.yump.ar/sala/<uuid>?organizador=Juan%20P%C3%A9rez}`;
  cancelar (AbortError) no abrió nada; doble toque con la hoja abierta = 1
  llamada; sin Web Share abrió `wa.me` con texto + salto de línea + enlace;
  "Copiar enlace" copió la misma url y pasó a "Copiado"; ícono 18×18; a 375 px
  de ancho sin desbordes. La metadata de `/sala/<uuid>?organizador=Juan%20Pérez`
  sigue dando "Juan Pérez te invitó a yumpear." y `og:url` sin el nombre.
  **No probado:** la hoja real del sistema (Android, Chrome móvil, iOS),
  WhatsApp de verdad, la vista previa generada por WhatsApp, un organizador
  real con cuenta, Realtime, y el contenedor Android (requiere AAB nuevo).
  ⚠️ **Hallazgo aparte (corregido el 21/10 en `fix/icono-compartir-match`, ver
  arriba):** el ícono del botón "Compartir" del
  resultado (`components/sala/CompartirMatch.tsx`) no tiene tamaño en CSS; al
  reproducir su marcado dentro de `.sala-acciones-resultado` en el navegador
  medía **0×0** (invisible; el botón y su texto funcionan). No se verificó en
  Producción ni en teléfono.
  *(Histórico, superado el 21/10 por la entrada de integración: la prueba
  local del dueño está APROBADA, la prueba con sala real es opcional y el
  procedimiento de AAB `5 (1.3.0)` de más abajo quedó REEMPLAZADO por la
  decisión de publicar salas y reseñas de usuarios en el mismo AAB. Nada de
  este párrafo es una instrucción vigente.)* Prueba manual del dueño
  propuesta el 20/10: con la rama en local o en un Preview. (1) Con su cuenta, crear una sala desde `/sala/nueva`. (2) En el
  lobby tocar "Compartir invitación": en el celular aparece la hoja del
  sistema; elegir WhatsApp y comprobar que el mensaje es el texto nuevo con el
  enlace abajo (en la computadora sin hoja, abre WhatsApp Web). (3) Tocar de
  nuevo y cerrar la hoja sin elegir nada: no tiene que abrirse WhatsApp. (4)
  Abrir el enlace recibido en otro dispositivo o en una ventana privada, sin
  sesión: pide el nombre, entra y aparece en "Quiénes están" de la sala
  correcta (mismo organizador). (5) "Copiar enlace" y pegarlo: es la misma url
  del mensaje. ⚠️ *(Corregido el 21/10: el build local con el `.env.local` real comparte la
  base con Producción, así que el recorrido completo NO exige desplegar; ver
  la entrada de integración.)* Un enlace a `app.yump.ar` abre PRODUCCIÓN: para probar la
  rama de punta a punta, la sala tiene que crearse en Producción, así que la
  prueba completa (WhatsApp → invitado entra) es la que se hace después del
  deploy; en la rama se prueba el botón y el mensaje. **Android:** el lobby va
  dentro del bundle local, así que la 1.2.0 instalada sigue mostrando sólo
  "Copiar" hasta instalar un AAB nuevo. No hace falta ningún plugin nuevo
  (`@capacitor/share` ya viaja desde la ficha). ~~**Procedimiento del AAB, sin
  publicarlo**~~ *(REEMPLAZADO el 21/10: no habrá AAB `5 (1.3.0)` propio; ver
  la entrada de integración)* (el mismo de la 1.2.0, entrada del 05/10): después del merge y
  deploy, desde el commit desplegado; el dueño confirma en Play Console que el
  mayor subido es 4; subir `android/app/build.gradle` a `versionCode 5` /
  `versionName "1.3.0"` (funcionalidad visible nueva → MINOR) y actualizar
  `lib/release-android.test.ts` y el historial de `CLAUDE.md`; `node
  scripts/build-capacitor.mjs --release --api-base=https://app.yump.ar`; `npx
  cap sync android`; `bundleRelease` con JBR 21 y `keystore.properties`
  copiado con autorización del dueño y borrado al terminar; verificar el AAB
  (firma de subida, `versionCode 5`, App Links, el texto "Compartir
  invitación" en el paquete) y copiarlo a `releases/Yump-1.3.0-vc5.aab`.
  Probar en teléfono con la hoja nativa antes de subirlo a un canal.
- **Top exclusivamente manual: integración y deploy (2026-10-20).**
  **Antes de integrar (Claude, sólo lectura):** remoto en `70757a4`, rama en
  `915ef2e`, fast-forward posible. Publicaciones manuales vigentes (la última
  de cada bloque; 66 en total), registradas para comparar: Películas —
  `n` 35de5532, `d` f583da0c, `m` 52e97480, `at` a360f2c5, `p` 7d0a9d5e,
  `cr` 595b5773; Series — `n` cfabb308, `d` ce2b3533, `m` f16b685c, `at`
  6949b7e4, `p` 2461c403, `cr` fc3567b2 (prefijos de id). Captura del
  09/10 y publicación del 19/10, salvo Crunchyroll (captura 02/09, publicada
  el 20/09). `netflix_top10`, revisada por separado, SIN CAMBIOS (última
  semana `2026-10-04`, última escritura 13/10, 0 filas posteriores): la
  conclusión de cachés se mantiene y no se subió ninguna versión.
  **Git:** push sin force `70757a4..915ef2e` a las 20:31 UTC; `git ls-remote`
  lo confirmó. **Deploy:** GitHub registra el deployment **7210383316**
  (Production) en `success` a las 20:32:33 UTC para `915ef2e`.
  **Producción (Claude):** `/api/top` ya responde con el contrato nuevo (trae
  `estado`); en Películas y Series los 6 bloques son `source: "manual"`,
  `estado: "publicado"`, `fallos: 0`, y sus títulos, ids (tipo + tmdb_id),
  orden y fecha de captura son IDÉNTICOS a la foto previa; los ids de las
  publicaciones vigentes no cambiaron. `/api/cron/netflix-top10` → 404;
  `vercel.json` no existe en `915ef2e`. `/`, `/top`, `/proximamente` y
  `/admin/login` 200; `/api/health` `ok: true`. No se provocaron fallos ni se
  tocaron rankings. **No verificado por Claude:** el panel de Vercel (el
  token de la CLI está vencido): que el proyecto ya no declare el cron lo
  tiene que confirmar el dueño; la prueba en la web de Producción y en el
  teléfono.
- **Top exclusivamente manual: auditoría de cachés y compatibilidad con
  Android 1.2.0 (2026-10-20, antes del merge; sin cambios de código).**
  **Cachés — comprobado por código:** la única puerta del ranking automático a
  datos servidos era la evidencia `top-oficial` → `disp:` → títulos
  resueltos. Inventario (las lecturas NO renuevan TTL: `cached*` escribe sólo
  en un MISS con `SET EX`, y el "último bueno" del Home sólo lo escribe
  PUBLICAR con un payload recién compuesto; ENFRIAR guarda el degradado unos
  segundos):
  | Caché | TTL | Se alimenta de | ¿Puede traer evidencia automática después del deploy? |
  |---|---|---|---|
  | `top:oficial:disponibles` (evidencia) | 5 min | `netflix_top10`, filtrado por `week` ≥ hoy − 14 d | No: vacía desde el 18/10 00:00 UTC; tras el deploy nadie la lee |
  | `disp:<tipo>:<id>` | 5 min | resolvedor (lee la evidencia) | No |
  | `card:…d1:<tipo>:<id>` | 24 h | `disponibilidadDe` → `disp:` | No |
  | `search:` | 1 h | `toUITitle` → `disp:` | No |
  | `ultimos:` (dos tramos) | 8 h | `toUITitle` → `disp:` | No |
  | `reco:` "Elegidas para vos" | 6 h | `enrichRaw` → `disp:` | No |
  | Home fresca / último bueno | 6 h / 36 h | composer: `toUITitle` → `disp:`, `cardsByIds` → `card:`, `ultimos:` | No |
  | `top:pop:` | 24 h | popularidad (retirado) | No: nadie la lee |
  | pools, `reco:mismo/perfil/cruce`, actores, `pv3:`, `oficial:` | — | crudos de TMDB | No guardan plataformas resueltas |
  Una relectura NO vuelve a meter evidencia: el filtro es por fecha de la
  semana contra el reloj (`week` + 14 días), no por la fecha de escritura, así
  que todo cálculo posterior al 18/10/2026 00:00 UTC la da vacía. La cadena
  más larga es evidencia (5 min) → `disp:` (5 min) → `card:` (24 h) → último
  bueno (36 h): ningún resultado derivado vive más allá del ~20/10/2026 12:10
  UTC. **Comprobado en Producción (sólo lectura, 20/10 20:15 UTC):**
  `netflix_top10` sigue con última semana `2026-10-04`, última escritura
  13/10 12:05 UTC y 0 filas posteriores. **Conclusión:** no hay vía
  demostrable para servir resultados del camino retirado después del deploy;
  no se suben versiones. La condición es que la tabla no cambie antes del
  merge (pendiente 3b, paso 2). Fuera de las cachés del servidor: las salas
  guardan plataformas de sus candidatas pero viven minutos; las vistas
  guardadas en `sessionStorage` duran la pestaña.
  **Android 1.2.0 — artefacto revisado:** `releases/Yump-1.2.0-vc4.aab`
  (SHA-256 `39f6ccd0…a03cab`, el de Producción de Play según el dueño),
  generado desde `072e227`; se leyó su chunk de `/top` y su `useApi`, y se
  ejecutaron sus assets web en el navegador local (`localhost:3300`, con
  `https://app.yump.ar/api/` redirigido al servidor de la rama; el bundle sin
  modificar). **Comprobado (código del artefacto + navegador):**
  - *Publicados:* los 6 bloques, 10 posiciones cada uno, títulos y orden
    idénticos a la base en Películas y Series; subtítulo "Top semanal"; sin
    botón de información (sólo aparece con `source: "netflix"`). Usa
    `platform`, `source`, `slots[].rank/item/rawTitle`, `mine`, `others`,
    `degradado`; ignora `estado` y `week`.
  - *Fallo parcial de enriquecimiento (simulado):* el bloque se ve con sus 10
    títulos como "Ficha no disponible" y el aviso "No pudimos cargar todo el
    top. Reintentar"; reintentar lo recupera.
  - *503 en la primera carga (simulado):* "No pudimos cargar el top.
    Reintentar", sin bloques; reintentar recupera los 6.
  - ⚠️ *503 después de cambiar de tipo:* 1.2.0 conserva el payload anterior
    (`keepPrevious`) bajo el otro botón — p. ej. series de Netflix con
    "Películas" marcado — con "No pudimos actualizar el top. Reintentar". Es
    el comportamiento de 1.2.0 ante cualquier error HTTP desde antes; la web
    nueva ya no lo hace y el próximo AAB tampoco. No se arregla desde el
    servidor.
  - ⚠️ *Bloque sin publicar (simulado):* 1.2.0 muestra la cabecera de la
    plataforma y "Top semanal" con el carrusel vacío; no conoce "Todavía no
    disponible.". **Hoy no puede ocurrir en Producción:** los 12 bloques
    están publicados y una publicación no se modifica ni se borra (triggers
    `top_rankings_inmutable` y `top_rankings_sin_delete` de la 007; la API del
    panel no tiene acción de despublicar). Sólo aparecería si se agregara un
    bloque nuevo al código.
  - *Películas/Series y reintentos:* misma URL que antes
    (`/api/top?tipo=&providers=`); los cambios de tipo y "Reintentar" piden de
    nuevo y pintan lo que llega.
  **No comprobado:** en un teléfono, el contenedor Android con el deploy real
  (queda para después del deploy, sin reinstalar nada); los casos simulados
  no salieron de datos reales.
- **Top exclusivamente manual (2026-10-20) — implementado en
  `feat/top-solo-manual` (`09cc2ee`), NO integrado, NO desplegado.**
  **Comportamiento:** `/top` y `/api/top` arman cada bloque SÓLO con su última
  versión publicada (mismo criterio de selección: la más reciente por
  `published_at`; sin vencimientos nuevos). Bloque sin publicar →
  "Todavía no disponible." y los demás visibles. Lectura de publicaciones
  fallida → `/api/top` 503 y la vista muestra "No pudimos cargar el top." con
  "Reintentar", sin el payload anterior. TMDB sólo enriquece los títulos
  elegidos; si falla, el bloque se ve con sus títulos y el payload sale
  `degradado`. **Retirado:** cutover atómico, `netflixBlock`, `popularBlock`,
  `lib/netflix-top10.ts`, `lib/netflix-resolver.ts`, `searchTitles`, la ruta
  `/api/cron/netflix-top10`, `vercel.json`, la procedencia `top-oficial`,
  `claveTopPop` (`top:pop:`), `listByCategoryCacheable`, el rótulo "dato
  oficial" y su nota, y `CRON_SECRET` de `.env.local.example`. La evidencia
  `top-manual` pasa a prioridad 2 con sus reglas de siempre.
  **Cachés (evaluado, sin subir versiones):** el camino retirado sólo
  alimentaba (a) la evidencia `top-oficial`, vacía desde el 18/10/2026 00:00
  UTC (la semana más nueva, `2026-10-04`, salió de los 14 días) y cacheada 5
  min; lo más largo que un resultado suyo podía sobrevivir era tarjeta (24 h)
  → Home "último bueno" (36 h), o sea hasta ~20/10/2026 12:05 UTC, ya
  vencido; y (b) los bloques `top:pop:`, que nadie lee después del cambio. Por
  eso no se suben `VERSION_DISPONIBILIDAD` ni `VERSION_HOME` (subirlas
  costaría un arranque frío del Home sin nada que invalidar). `/api/top` no
  se cachea entera; `top:manual:publicaciones` (60 s) no cambió de forma. Un
  snapshot de `/top` en `sessionStorage` con bloques de las fuentes retiradas
  no se restaura.
  **Verificación (Claude):** `lib/top-solo-manual.test.ts` (17 pruebas:
  selección y orden exactos, bloque faltante sin respaldo, error ≠ ausencia
  con reintento, datos automáticos que no intervienen en el Top ni en la
  disponibilidad, sin cron ni ruta), con tres mutaciones del núcleo
  detectadas (1, 2 y 5 fallos); inventarios ajustados; suite **2239 / 2239**,
  0 fallos, 0 omitidos (antes 2262: se borraron las pruebas de la ingesta y
  de la evidencia retirada); `tsc --noEmit` 0; `git diff --check` limpio;
  build de Producción OK. El repo no tiene ESLint configurado (`next lint`
  pide configurarlo), así que no se corrió. **Navegador** (build de
  Producción en `localhost:3200`, leyendo las publicaciones de Producción con
  la clave pública, sin Redis ni clave de servicio, sin escribir nada): los 12
  bloques coinciden EXACTAMENTE con la base en títulos, ids y orden (y con
  `app.yump.ar`); con la respuesta interceptada en el navegador (simulación,
  no datos reales) se vieron "Todavía no disponible." en Netflix con los
  demás visibles, y el error "No pudimos cargar el top." con "Reintentar",
  que al reintentar recuperó los 6 bloques. Sin Supabase configurado, la API
  real respondió 503. **No probado:** el contenedor Android (el AAB 1.2.0 lee
  `source`, que sigue en `"manual"`, y un bloque sin publicar le llega vacío);
  un fallo real de Supabase en Producción; el panel de Vercel después del
  deploy.
- ⚠️ *Las dos entradas siguientes (20/10, sólo lectura) quedan como
  antecedente: sus datos siguen siendo correctos, pero la propuesta de cambios
  y el "hallazgo de diseño" del horario del cron quedaron resueltos por la
  entrada de arriba.*
- **Top de Netflix: carga manual como fuente (2026-10-20, sólo lectura de
  código y datos).** **Decisión del dueño:** el Top de todas las plataformas,
  Netflix incluida, se carga a mano. El dueño apagó Cron Jobs en
  `streamingcentral`. La entrada siguiente, que trataba la falta de ingesta
  como una avería, queda **supersedida** en esa conclusión; sus datos (qué hay
  en `netflix_top10`) siguen siendo correctos.
  **1. `/top` muestra los bloques manuales — comprobado.** Los 12 bloques
  tienen versión publicada (66 publicaciones en total). `hayCutover` es
  verdadero, y `/api/top` en Producción devuelve los 12 con `source:
  "manual"`, `fallos: 0`. Netflix lleva la captura del 09/10/2026 (publicada
  el 19/10), igual que las demás salvo Crunchyroll (captura del 02/09). La
  página muestra la última publicada de cada bloque sin vencimiento.
  **2. Dónde sigue el ranking automático (código):**
  - *Respaldo de `/top`:* si falta un bloque publicado o falla la lectura de
    publicaciones (`publicacionesSiHayCutover` → `null`), TODO `/top` vuelve
    al camino viejo: `netflixBlock` lee `netflix_top10` y, con la semana
    vencida como ahora, cae a popularidad de TMDB. Hoy no se usa.
  - *Evidencia de disponibilidad:* sigue cableada como **prioridad 2**
    (`top-oficial`, `leerTopOficial: disponiblesEnTopOficial` en
    `lib/enrich.ts`), **por delante** de la carga manual (`top-manual`,
    prioridad 3). Hoy no aporta nada porque no hay semanas dentro de los 14
    días, pero se sigue consultando en cada título sin dato de TMDB (cacheado
    5 min). Si el cron volviera a escribir, el ranking automático pasaría a
    ganarle a la carga manual.
  - *Carga manual como evidencia:* ya funciona para las seis plataformas, con
    capturas de hasta 14 días (`DIAS_EVIDENCIA_TOP`). La captura del 09/10
    deja de valer como evidencia después del 23/10 si no se publica otra; la
    de Crunchyroll (02/09) ya no aporta.
  **3. Cambios necesarios (propuestos, no hechos):** ninguno para que `/top`
  muestre la carga manual de Netflix; ya la muestra. Para que sea la ÚNICA
  fuente:
  (a) `lib/top.ts`: decidir qué pasa sin cutover; por ejemplo, popularidad
  para todas o un error visible, sin `netflixBlock`/`latestWeekRows`;
  (b) `lib/disponibilidad.ts` + `lib/enrich.ts`: quitar la prioridad
  `top-oficial` (y ajustar tests y barridos); evaluar subir
  `VERSION_DISPONIBILIDAD`/`VERSION_HOME`;
  (c) `vercel.json`: sacar el cron, para que reactivar Cron Jobs no la
  reanude; la ruta `/api/cron/netflix-top10` puede quedar archivada o
  retirarse;
  (d) `components/TopView.tsx` y `lib/top-plataformas.ts`: el rótulo "dato
  oficial" y `source: "netflix"` quedan como código muerto;
  (e) `CLAUDE.md`: actualizar el bloque "Top automático archivado".
  `netflix_top10` y su historial se conservan por ahora.
- **Top 10 de Netflix: revisión de SÓLO LECTURA de la última ingesta
  (2026-10-20, ~19:20 UTC).** Sin ejecutar el cron ni escribir nada; el plan de
  Vercel no deja ver los logs de esta mañana.
  **Qué fechas prueban qué (código y esquema).** `netflix_top10` tiene dos
  fechas: `week` es la **semana del ranking** (la que trae el TSV de Netflix)
  y `updated_at` es el **momento de la escritura** (`ingestLatestWeek` en
  `lib/netflix-top10.ts` lo pone en cada fila que escribe; la tabla no tiene
  trigger). Que haya datos de una semana NO prueba que el cron corriera hoy.
  Y una corrida que no encuentra nada nuevo **no escribe nada** (sale con
  `inserted: 0`), igual que una que falla: ninguna de las dos deja rastro en
  la tabla. La tabla prueba escrituras, no ejecuciones.
  **Comprobado en Producción** (lectura con la clave pública; la tabla tiene
  policy de lectura pública):
  | Semana (`week`) | Escrita (`updated_at`, UTC) | Filas |
  |---|---|---|
  | `2026-10-04` | 13/10/2026 12:05:09 | 20 (10 + 10), 0 sin `tmdb_id`, 1 `needs_review` |
  | `2026-09-27` | 06/10/2026 12:05:09 | 20, 0 sin `tmdb_id`, 1 `needs_review` |
  | `2026-09-20` | 29/09/2026 12:05:09 | 20, 0 sin `tmdb_id`, 0 `needs_review` |
  Las tres escrituras caen martes a las 12:05 UTC, dentro de la ventana del
  cron (`0 12 * * 2`): son compatibles con el cron, no con una ingesta a mano.
  **Última actualización comprobable: 13/10/2026 12:05 UTC.** Hoy (martes
  20/10) no hay ninguna escritura.
  **Los datos NO están al día.** El TSV público de Netflix (leído hoy, sólo su
  cabecera) ya trae `2026-10-11` y `2026-10-18` para Argentina, con
  `Last-Modified` 20/10/2026 18:59 UTC. El patrón de las tres semanas muestra
  que a las 12:00 UTC del martes Netflix todavía no publicó la semana que
  cerró el domingo anterior, así que la corrida de hoy debía guardar
  `2026-10-11`, que según ese patrón se publicó el martes 13/10 (no se puede
  ver cuándo apareció en el TSV). **Esa semana no está.**
  **Efecto (deducido del código y los datos, no observado en pantalla):**
  `2026-10-04` superó los 14 días de `VENTANA_RECIENTE_MS` el 18/10/2026 a las
  00:00 UTC. Desde entonces `latestWeekRows()` devuelve `null` y la evidencia
  de disponibilidad `top-oficial` (prioridad 2) no tiene ninguna semana dentro
  de su ventana. `/top` responde 200.
  **Hallazgo de diseño (inferido de los datos, no comprobado en logs):** el
  comentario de `SEMANA_VIEJA_MS` supone que el martes del cron ya está
  publicada la semana anterior, con un desfase de ~9 días como máximo. Los
  datos dicen otra cosa: cada corrida guarda una semana de 9 días, que llega a
  ~16 días antes de la corrida siguiente. Aun con el cron funcionando, la
  semana guardada pasa los 14 días cada domingo, y hasta el martes a las
  12:05 UTC el bloque oficial y la evidencia `top-oficial` caen. Corregirlo
  (horario del cron o ventana) es un cambio de código o de configuración:
  queda propuesto, no hecho.
  **Configuración, informada por el dueño con captura (20/10):** en el
  proyecto `streamingcentral`, Cron Jobs está habilitado y
  `/api/cron/netflix-top10` está programado los martes a las 12:00 UTC. Eso
  acredita la **configuración**, no que alguna corrida haya terminado bien.
  **No se puede determinar sin los logs:** si el cron disparó hoy; si disparó
  y falló (TSV, TMDB, Supabase, `CRON_SECRET` o el tope de 60 s); si alguna
  corrida terminó bien sin escribir; y la hora real de cada disparo. Ver los
  logs requiere un plan de Vercel con retención o un registro propio de cada
  ejecución, que hoy no existe.
- **Publicación de la auditoría documental (2026-10-20).** **Git:**
  `origin/main` avanzó por fast-forward `7937b4c` → `db92be9` → **`9019ca5`**
  (push sin force a las 18:37 UTC; remoto consultado antes y después con
  `git ls-remote`); sólo `CLAUDE.md` y `docs/`. **Deploy:** GitHub registra el
  deployment **7208100938** (*Production – streamingcentral*) en **success**
  a las 18:41:39 UTC para `9019ca5` (y el 7208081777 del segundo proyecto,
  ver pendiente 3). **Producción, pasivo:** `/`, `/top`, `/proximamente` y
  `/admin/login` 200, `/api/health` `ok: true`, mismo chunk de layout que
  antes (no cambió código). No se repitieron suite ni build: cambio sólo
  documental (sí los 6 tests que leen documentación: 102 + ruleta, 0 fallos).
  El commit que agrega esta línea también es sólo documental.
- **Acceso al dashboard `/admin`: CERRADO — INTEGRADO, DESPLEGADO Y APROBADO
  (2026-10-19).** No quedan pendientes de merge, deploy ni prueba manual.
  **Comprobado en Git:** `origin/main` avanzó por fast-forward `dcc8c6e` →
  **`7937b4c`** (push sin force, 20:10:18 UTC; el remoto se verificó con
  `git ls-remote` antes y después).
  **Comprobado en el despliegue:** GitHub registra el deployment **7183850925**
  de Vercel, entorno *Production – streamingcentral*, estado **success** a las
  20:11:23 UTC para `7937b4c` (API pública de deployments del repo; el panel de
  Vercel no lo vio Claude). `app.yump.ar` sirvió el código nuevo desde las
  20:11:47 UTC: los chunks del panel traen "Verificando permisos…", el error
  con "Reintentar", el cierre `scope: "local"` y el destino; las rutas
  principales responden 200; `/api/health` con Redis OK y 0 errores 429; sin
  sesión, `/admin/top` → `/admin/login?destino=%2Fadmin%2Ftop`.
  **Informado por el dueño (19/10):** prueba final en Producción OK con la
  cuenta adicional (entrada por `/admin/top`, login y 2FA terminando en
  `/admin/top`) y la sesión personal del celular abierta.
  **Cómo se opera desde ahora:** se administra habitualmente con la cuenta
  ADICIONAL; la cuenta personal del dueño conserva su rol de administrador y
  sus dos factores 2FA (verificado sólo lectura el 19/10), y entrar al panel
  con ella puede volver a cerrar sus otras sesiones (comportamiento de
  Supabase Auth al verificar MFA). En la documentación NO se guardan correos,
  claves ni tokens de ninguna cuenta.
  **Antecedente del trabajo** (lo de abajo es el registro de la rama; donde
  dice "en rama", "sin merge" o "pendiente" quedó supersedido por este
  encabezado):
  **Informado por el dueño:** al abrir `/admin/top` muchas veces terminaba en
  el Yump público (también en incógnito), y al entrar al panel y completar el
  2FA se le cerraba la sesión de la app del celular sin pulsar "Salir".
  **Comprobado en código/tests:** `ready` llegaba antes que el perfil
  (`getSession()` lanzaba `sync` sin esperarla) y el layout trataba "perfil
  pendiente" igual que "no es admin" → `router.replace("/")`; la lectura del
  perfil descartaba el error (lo leía como "sin permisos"); respuestas fuera de
  orden podían pisar a la cuenta actual; login y MFA volvían siempre a
  `/admin`. Corrección mínima: `lib/admin-acceso.ts` (puro) con
  `decidirAccesoAdmin` (espera el perfil, muestra el error con "Reintentar",
  mensaje para cuentas sin permisos, nunca `/`), `destinoSeguro`/`conDestino`
  (`?destino=` sólo para rutas `/admin…`) y `crearSesionPerfil` (estados
  pendiente/listo/error con generaciones). `AuthContext` expone `estadoPerfil`
  y `reintentarPerfil` sin cambiar `ready`; el login navega cuando el contexto
  ya tiene al usuario, al destino; el MFA vuelve al destino. "Salir" (app,
  layout y página del panel) pasa a `signOut({ scope: "local" })`; sin scope,
  auth-js 2.108.2 usa `global`. Los cierres de la eliminación de cuenta y la
  recuperación de contraseña NO se tocaron. Sin cambios en APIs, RLS, MFA,
  Top ni módulo editorial. Tests: `lib/admin-acceso.test.ts` **RED → GREEN**
  (12 de 14 fallaban contra una réplica exacta del comportamiento anterior;
  la entrada directa devolvía `ir /`): perfil lento, error de lectura, cuenta
  sin permisos, cambio de cuenta fuera de orden, cierre con lectura en vuelo,
  refresco de token, entrada directa, login y MFA con destino; tres
  mutaciones detectadas (3, 2 y 1 fallos); `lib/admin-acceso-cableado.test.ts`
  fija el cableado y que la eliminación de cuenta conserva sus cierres. Suite
  2261 / 2261 ok / 0 omitidos, `tsc` 0, `git diff --check` limpio, build de
  Producción exit 0 y export nativo exit 0. **Comprobado en navegador** (build
  de Producción servido en local, sin sesión): `/admin/top` →
  `/admin/login?destino=%2Fadmin%2Ftop`, nunca `/`.
  Lo anterior es lo que **verificó Claude** sobre `80f8fa9` (17/10).
  **Auditoría de Codex** (17/10; registrada en `docs/ESTADO.md` del checkout
  principal, `feat/salas`, como cambio local SIN commitear: acá se concilia,
  allá no se tocó). Antes de la rama, por lectura de código: identificó la
  carrera `ready`/perfil y la redirección a `/`, el login que navega sin
  esperar el perfil, el cliente compartido de `lib/supabase.ts` y los
  `signOut()` sin scope (`global` por defecto). Con la aclaración del dueño de
  que el celular se cae **al verificar el 2FA, sin pulsar "Salir"**, corrigió
  su diagnóstico: el cierre global NO explica ese episodio; el mecanismo
  compatible es que Supabase Auth v2.197.0 invalida, al verificar TOTP, las
  sesiones de nivel inferior de la misma cuenta
  (`InvalidateSessionsWithAALLessThan`), y ni el cierre local ni aislar el
  almacenamiento del navegador lo evitan. Sobre el diff
  `dcc8c6e..80f8fa9` de esta rama: **25 tests específicos de acceso y
  autorización en verde, suite 2261 / 2261 ok / 0 fallos / 0 omitidos,
  `tsc --noEmit --incremental false` exit 0**; sin defectos adicionales
  comprobados en el código. No repitió el build web, el export nativo ni el
  login/MFA autenticados. Hallazgos documentales, corregidos en esta rama el
  17/10: (1) el runbook proponía quitarle `is_admin` a la cuenta personal, lo
  que contradice la decisión del dueño; (2) faltaba completar la bienvenida
  (`onboarding_completed = false` en toda cuenta nueva; `OnboardingGate` no
  exime `/admin` y al terminar vuelve a `/`), también en la alternativa de
  crear la cuenta desde Supabase.
  **Conciliación de las notas de Codex (20/10/2026).** Las tres notas del
  17/10 siguen en el checkout principal como cambio local sin commitear; no se
  copiaron ni se tocaron allá. Su estado frente a lo que pasó después:
  - *Vigente:* la carrera `ready`/perfil como causa de la vuelta al Yump
    público; el mecanismo de Supabase Auth al verificar MFA, que sigue **sin
    verificar** contra la versión del proyecto y sus registros (pendiente 11
    del resumen); la decisión de que la personal conserva rol y factores.
  - *Supersedido — diagnóstico corregido:* que el `signOut()` global explicara
    la caída del celular. El propio Codex lo corrigió tras la aclaración del
    dueño (el celular se cae al verificar el 2FA, sin pulsar "Salir").
  - *Supersedido — hecho:* "reproducir con sesión administrativa en
    Producción" y "verificar el permiso real de la cuenta" (permisos y factores
    comprobados sólo lectura el 19/10; prueba del dueño en Producción el
    19/10); "confirmar con el dueño si pulsa salir" (no lo pulsaba); la
    corrección propuesta (implementada en esta rama e integrada en
    `7937b4c`); "quitar el paso 6 del runbook" y "agregar la bienvenida"
    (corregidos el 17/10; el runbook vigente no quita nada a la personal);
    "falta la prueba manual autenticada y conciliar antes de integrar" (hecho
    el 19/10).
  - *Cubierto sólo por tests, no por prueba manual:* perfil lento y perfil con
    error de lectura (`lib/admin-acceso.test.ts`). El dueño probó a mano
    recargas, login, MFA, "Salir" y dos dispositivos con la rama en local
    (19/10), y en Producción entrada por `/admin/top`, login y 2FA con el
    celular abierto (19/10).
  **Decisión del dueño (17/10):** la cuenta personal **conserva
  permanentemente** el rol de administrador y sus factores 2FA; la cuenta de
  administración es **adicional** y se usa para administrar habitualmente.
  Conservar el rol no cambia el mecanismo de Supabase: entrar al panel con la
  personal puede volver a cerrar las sesiones de su celular.
  **Prueba manual del dueño (19/10), con la rama en local** (`next dev` en
  `localhost:3000` contra el Supabase de Producción). La cuenta adicional
  (su correo lo tiene el dueño; no se registra acá) la creó el dueño, y él
  corrió el `UPDATE` de `is_admin`. **Comprobado por Claude, sólo lectura con la clave de servicio:**
  correo confirmado, `onboarding_completed = true`, `is_admin = true` y DOS
  factores TOTP verificados (19:20 y 19:22 UTC); la cuenta personal conserva
  `is_admin = true` y sus DOS factores (creados el 02/09). ⚠️ El listado de
  usuarios de la API de administración NO trae los factores (`listUsers`
  devolvió 0 para la personal); la cifra válida sale de `getUserById`.
  **Informado por el dueño:** login + 2FA de la cuenta adicional sin que se
  cierre la sesión personal del celular; las recargas de `/admin/top` se
  quedan en el panel; "Salir" en una ventana deja abierta la otra sesión de la
  misma cuenta y el celular.
  **Defecto encontrado en la prueba y corregido:** entrando por `/admin/top`,
  después del 2FA terminaba en `/admin`. Causa: el login leía `?destino=` de la
  barra al DIBUJARSE (inicializador de `useState`), y en una navegación interna
  del App Router la página nueva se dibuja antes de que Next actualice la
  barra: leía `/admin/top` sin `?destino` y el destino caía a `/admin`. El 2FA
  no lo tenía porque lee en un efecto. Corrección: el login lee el destino
  dentro del efecto que navega. Test de cableado RED (2 fallos) → GREEN. El
  dueño repitió la prueba desde una ventana privada nueva: **termina en
  `/admin/top`** (19/10). Sobre el código final: suite 2262 / 2262 ok / 0
  omitidos, `tsc` 0, `git diff --check` limpio, build de Producción limpio y
  export nativo exit 0.
  **Pendiente:** sólo la versión de Supabase Auth del proyecto y sus registros
  (no hacen falta para operar). El merge, el deploy y la prueba final se
  hicieron el 19/10 (ver el encabezado de esta entrada). El
  runbook (`docs/MANTENIMIENTO.md`, "Runbook: cuenta ADICIONAL de
  administración") quedó ejecutado por el dueño hasta el paso 7.
- **Mantenimiento INCREMENTAL de la ruleta (2026-10-06 → 2026-10-09):
  INTEGRADO A `main` Y DESPLEGADO.** Pool de Producción 2401 → 2901 (carga
  manual del dueño, 08/10). Lo de abajo es el registro cronológico; las
  menciones a "en rama / sin push" de las entradas del 06–08/10 son
  históricas.
  **09/10 — integración (autorizada por el dueño):** push de la rama y
  fast-forward de `main` `072e227` → `3eface7`, sin force; Vercel "Deployment
  has completed". Verificado después del deploy (sólo lectura):
  `get_roulette_picks` 40/40/40 en corta/larga/chicos con 0 excluidos;
  `/api/ruleta?escenario=corta` 20 ítems; `/api/health` ok; `sala_candidatos`
  sigue devolviendo anime con Crunchyroll (Yumpeá sin cambios; la huella no se
  pudo leer acá, el conector MCP no autoriza). Migración 010: aplicada a mano
  como 001–009; el proyecto no usa el historial del CLI
  (`[db.migrations] enabled = false`, sin enlazar) y un test falla si se
  reactiva — no hace falta tocar Producción. Archivos operativos ignorados por
  git copiados a `streamingcentral/data/` (hashes iguales al worktree y a
  `backups-yump/ruleta-2026-10-08-pre-sql`); el `colecciones-ruleta.json`
  anterior del checkout quedó en
  `backups-yump/checkout-data-antes-2026-10-08/`.
  **09/10 — reconciliación del estado con la carga real (sin TMDB, sin SQL,
  sin escribir en Supabase):** `ruleta-estado.json` no coincidía con lo
  cargado: tenía 2946 títulos (los 545 traídos, de los que se cargaron 400) y
  `carga_pendiente` con los 545, mientras 100 de los 500 cargados seguían en
  la reserva. Sin corregirlo, la corrida siguiente habría vuelto a emitir SQL
  para los 545 (145 sin texto, sin "pero" o con contexto) y la cola vieja
  habría vuelto a proponer los 500 (su primer elemento es uno de ellos). Se
  agregó `--reconciliar <foto>` (`scripts/ruleta/reconciliar.mjs`), la foto de
  sólo lectura `scripts/ruleta/snapshot-produccion.mjs` (GET) y el filtro
  `colaVigente` en la CLI y el pipeline; procedimiento en `MANTENIMIENTO.md`
  §1.b. Resultado contra la foto del 09/10: pool = 2901 = Producción (86
  excluidos por 010); carga confirmada = exactamente los 500 de la propuesta
  (100 desde reserva), con proveedores idénticos a Producción;
  `carga_pendiente` vacía; 145 vuelven a la reserva (92 sin texto, 39 sin
  "pero", 14 con contexto) → reserva 518; 2345 metadatos de votos siguen
  pendientes de SQL (los trajo el descubrimiento del 07/10 y no iban en la
  carga). Segunda pasada idéntica. Tests `test:ruleta` 93/93. Backups:
  `backups-yump/ruleta-2026-10-09-pre-reconciliacion` y
  `backups-yump/ruleta-2026-10-09-post-carga`. **Plan en seco** (sin TMDB): con
  la cola vieja quedan 3702 candidatos y ~2156 detalles estimados; el
  inventario del 07/10 ya no tiene candidatos anteriores a 1990 (y sólo 15 de
  los 90), así que la próxima ampliación con los mismos cupos por década
  necesita un descubrimiento nuevo o una decisión sobre los cupos — decisión
  del dueño. Siguiente paso: la próxima ampliación (≈ diciembre 2026, §1.c).
  Qué es: `scripts/actualizar-ruleta.mjs` + `scripts/ruleta/*` reemplazan los
  tres scripts que consultaban TMDB (procedimiento en `MANTENIMIENTO.md` §1.b).
  Plan sin red ni escritura; fases descubrir/enriquecer/disponibilidad;
  presupuesto de intentos HTTP; ritmo 4/s; `Retry-After`; diario reanudable;
  SQL incremental sin columnas editoriales; `build-roulette-sql.mjs
  --textos-nuevos` con guardas `razon is null` / `collection_name is null`.
  **Comprobado en código:** 20 tests nuevos con TMDB simulado + 5 del SQL
  (`npm run test:ruleta`), y cuatro mutaciones deliberadas que hacen caer
  tests; suite completa 2237 / 2219 ok / 0 fallos / 18 omitidos.
  **Comprobado en base, sólo lectura (service role, `select`):**
  `roulette_titles` 2401, 2259 con texto, 1782 con "pero", 144
  `requiere_contexto` (138 del clasificador + 6 manuales), disponibilidad AR de
  las 2401 con `checked_at` 2026-08-11; coincide con `data/` salvo 2 `razon`
  corregidas a mano el 23/08. El conector MCP de Supabase respondió
  `Unauthorized` y no se usó.
  **Plan calculado (sin TMDB):** 2401 títulos, 2401 con disponibilidad vencida
  (> 30 días), 525 sagas reutilizables; ~2592 llamadas (191 discover estimadas +
  2401 `watch/providers`) contra ~5497 del proceso anterior; los títulos nuevos
  se conocen recién después de la fase descubrir.
  **Fase `descubrir` corrida contra TMDB real con autorización (06/10, dos
  tandas, presupuestos 260 + 200): 460 intentos HTTP, 460 éxitos, 0 fallos, 0
  reintentos, 0 429.** Quedó INCOMPLETA por presupuesto: faltan 12 páginas
  (cortas 2015-2029, páginas 103-114); el estado no se tocó y las 460 páginas
  están en el diario del worktree (`data/`, ignorado por git). Hallazgo: 4626
  candidatos nuevos que cumplen los filtros (2979 de la familia principal,
  1647 sólo de cortas), porque el proceso anterior veía como máximo 640 títulos
  por ventana; filtro verificado (1 violación de 5072, excluida). Corregidas en
  `c387608` dos fallas vistas en la corrida (fecha UTC en informes, progreso
  vacío al cortar), con tests en rojo antes. NO se ejecutó enriquecimiento,
  disponibilidad, textos, SQL ni Supabase. Decisión pendiente del dueño:
  cuántos incorporar (propuesta 300/500/800 estratificada); antes de enriquecer
  falta un mecanismo de selección, porque hoy `enriquecer` procesaría los 4626.
  **Actualización 07/10: el dueño aprobó 500 + cadencia (MANTENIMIENTO §1.c).**
  `descubrir` COMPLETO con autorización (presupuesto 20): 12 intentos, 12
  éxitos, 0 errores/429 → 472 páginas en total. Inventario definitivo
  `data/ruleta-inventario.json` (7114 candidatos, 4765 nuevos, 1 fuera de
  filtro), versionado. Selección estratificada y determinística
  (`scripts/ruleta/seleccion.mjs`): cortas por duración REAL ≤ 90, cupo por
  década con redistribución, terciles de votos, sólo flatrate de Yump; la cola
  (`data/ruleta-cola.json`, 4761, versionada) se recorre hasta llenar 500 + 15%
  de reserva y `--ejecutar --fases enriquecer` no corre sin cola. Informes con
  fecha y hora argentinas (`-HHMM`): el de la primera tanda de descubrir había
  quedado como `2026-10-07` y lo pisó el de la tercera; sus números están arriba.
  Tests: `npm run test:ruleta` 51/51; mutaciones deliberadas caen. Estimación
  (simulada con tasas SUPUESTAS del pool, no medidas): 1296 detalles (p90) +
  126 colecciones = 1422; ~436 servibles quedarían en reserva para la próxima
  ampliación. NO se ejecutó enriquecimiento, textos, disponibilidad, SQL ni
  Supabase.
  **Enriquecimiento autorizado (07/10, presupuesto 1500, 2 req/s,
  `--detener-en-429 --sin-sql`, `d46794d`): 1500 intentos, 1500 éxitos, 0
  fallos, 0 reintentos, 0 429; INCOMPLETO por presupuesto**, estado intacto y
  1500 detalles en el diario del worktree. Reproducido sin TMDB a la posición
  1500: 551 aceptados de 575 (206 cortas reales ≤ 90 de 230), 508 servibles en
  reserva, 441 descartes (283 sin flatrate de Yump, 103 cortas-familia fuera de
  60–100, 55 sin sinopsis). Las tasas reales de las décadas viejas son mucho
  más bajas que las supuestas (servibles: 34% <1980 probables cortas, 35–46% en
  los 80): sus cupos se redistribuyeron por la regla aprobada (<1980 68,
  1980s 21). Falta, proyectado con tasas OBSERVADAS: ~200–265 detalles más +
  ~90–110 colecciones. Sin textos, disponibilidad general, SQL ni Supabase.
  **Selección CERRADA (07/10, decisión del dueño, `4dd993a`):** último recurso
  determinístico — si el recorrido termina sin el mínimo de cortas, entran
  cortas REALES ya enriquecidas de la reserva aunque su década esté llena,
  priorizando la década menos representada (`--sin-nuevos-detalles`: la cola
  usa sólo el diario y el cliente PROHÍBE `detalle`). Corrida autorizada de
  colecciones (presupuesto 150, 2 req/s, `--detener-en-429 --sin-sql`): **85
  intentos, 85 éxitos, 0 fallos, 0 429, 0 detalles**; completa. Estado guardado
  en el `data/` del worktree (ignorado salvo inventario y cola): pool 2401 →
  **2976**; los **575** nuevos: <1980 68 · 80s 29 · 90s 98 · 00s 124 · 10s 125
  · 20s 131; **230 cortas reales ≤ 90** (24 desde la reserva: 8 de los 80, 5 de
  los 2000, 4 de los 2010, 7 de los 2020); todos con flatrate de Yump y datos
  completos; 137 con saga (84 secuelas), 0 sin resolver; 102 aptos para chicos;
  484 servibles en reserva (46 cortas); 441 descartados. Nada de esto está en
  Supabase: `carga_pendiente` (575 nuevos + 575 disponibilidades) y 2345
  `metadatos_pendientes_sql` esperan la carga que se autorice. Ninguno tiene
  texto todavía. Tests: test:ruleta 59/59, suite 2237/2219/0/18.
  **Textos de los 575 (07/10): DETENIDO antes de generar nada.** Backup
  completo y validado en `D:\DESARROLLO\stream central\backups-yump\ruleta-2026-10-07-pre-textos\`
  (23 archivos, SHA-256 en `MANIFIESTO.json`; restauración de prueba: 23/23
  hashes y plan idéntico). `generate-copy` endurecido (`295ced3` y siguiente):
  hijo sin variables de facturación por API, `--ids`, `--max-lotes`, corte tras
  un reintento, sólo ids del lote. Primer tramo: el lote 1 falló dos veces con
  "OAuth session expired and could not be refreshed" → corrida detenida, 0
  textos generados, los 2401 existentes intactos (huella), uso del plan sin
  cambios (5 h 13%, semanal 12%; uso extra deshabilitado). El sondeo había dado
  `apiKeySource=none` porque el mensaje de inicio sale ANTES de autenticarse:
  ahora exige además una respuesta real exitosa. Pendiente: que el dueño
  renueve el login del CLI `claude` (suscripción) y autorice reanudar.
  **Textos GENERADOS (07/10, tras renovar el login).** Sondeo nuevo OK
  (`apiKeySource=none`, respuesta real, `claude-sonnet-5`; quitada del hijo
  sólo `ANTHROPIC_BASE_URL`). 15/15 lotes de 40 en tramos de 5, 1 reintento
  exitoso (lote 14), 0 fallidos; uso del plan 5 h 14% → 27%, semanal 12% →
  14% (compartido con la sesión de trabajo; uso extra deshabilitado).
  Resultado: **483 de 575 con texto, 92 "no conoce"** (31% entre 50–299 votos,
  0% con 3000+); 2401 textos anteriores intactos; 0 duplicados; vocabulario sin
  casos reales. **No alcanza para 500 ni para 200 cortas (184)**: propuesta de
  reemplazo, sin generar, de 25 cortas de la reserva (todas 2020s; varias son
  especiales, no películas). Decisión pendiente del dueño. `copy-ruleta.json`
  versionado con las 575 filas nuevas; `ruleta-estado.json` todavía tiene
  `con_texto=false` para ellas (se sincroniza en el paso siguiente). Sin
  contexto de secuelas, disponibilidad general, SQL ni Supabase.
  **Regla editorial nueva (07/10): sin anime, stand-up ni especiales no
  narrativos** (MANTENIMIENTO §1.c; tests `exclusiones.test.mjs`; lista
  `data/ruleta-exclusiones.json`). Aplicada al estado sin TMDB: de los 575
  salen 30 (17 anime, 10 stand-up, 3 no narrativos) → 545; de la reserva salen
  10 (9 anime, incl. Baki; 1 making-of) → 474. Quedan **453 con texto válido y
  155 cortas**: faltan 47 y 45. La reserva tiene 44 cortas (≈34 con texto
  esperado) → no alcanza para 200 cortas sin nuevas consultas. **Hallazgo:**
  entre los 2401 ya cargados hay 84 anime y 2 stand-up según el mismo
  criterio; no se tocaron (decisión y SQL aparte). Nada generado ni cargado.
  **Reemplazos y propuesta final (07/10, sin TMDB):** 80 de la reserva (43
  cortas elegibles + 37 largas más votadas; "A la mierda el 2020" excluida como
  recapitulación) en 2/2 lotes, 0 reintentos, sondeo OK; uso 5 h 3% → 5%,
  semanal 15%. 66 con texto (29 cortas). **Propuesta determinística de 500
  (`data/ruleta-propuesta-500.json`): 184 cortas reales**, 453 de la selección
  + 47 de la reserva; **42 sin "pero" no salen en la ruleta** (sí en Yumpeá);
  reserva editorial 19 (todas largas). Corregidos a mano (aprobados): Death
  Race, St Vincent, Voluntad de hierro, El jurado. `con_texto` sincronizado;
  colecciones pendientes = 0 reales; vocabulario sin falsos positivos.
  **Producción (propuesta, NO ejecutada):** migración
  `supabase/migrations/010_ruleta_exclusiones.sql` (columnas `excluido_motivo`
  / `excluido_at` + filtro en `get_roulette_picks`; down incluido) y datos en
  `supabase/propuestas/2026-10-07-exclusiones-ruleta.sql` para los 86 (84
  anime —incluye Studio Ghibli y Your Name— y 2 stand-up de Bo Burnham), con
  reversión por título. Ruleta servible 1454 → 1388 (corta 189 → 172). Yumpeá
  (`sala_candidatos`) no se toca: decisión aparte.
  **08/10 — decisiones del dueño:** la ruleta sigue exigiendo "pero"; todo el
  anime sale de "No sé qué ver" (Ghibli incluido); Yumpeá no cambia. Último
  lote de 40 de la reserva (por votos, sin anime/stand-up/no narrativos): 1/1,
  sondeo OK, 40 con texto, 29 con "pero"; uso 5 h 4% → 7%, semanal 0% → 1%.
  **Propuesta de 500 servibles NO cerrada:** hay 493 servibles (razon +
  advertencia + atencion, Yump, sin exclusiones, saga resuelta) + 13 con saga
  sin resolver sin TMDB + 53 sin "pero" (sólo Yumpeá). Como las secuelas que
  pidan contexto dejan de ser servibles, faltan textos: decisión pendiente
  (otro lote de la reserva). Clasificación de contexto NO ejecutada (estaba
  condicionada al cierre de los 500). `classify-context.mjs` endurecido (hijo
  sin facturación por API, sondeo real, `--ids`, `--entrada`, corte tras un
  reintento, `--sin-sql`). Diff de plataformas: 4 nombres nuevos sin mapear
  (Looke, Lionsgate+, Filmelier Plus, Cindie; todos canales de Amazon y ninguno de Yump).
  Backup `backups-yump/ruleta-2026-10-08-pre-contexto` (32/32 hashes).
  **08/10 — CERRADA la propuesta de 500.** Lote adicional de 40 (1/1, 40 con
  texto); clasificación de contexto de 86 (70 secuelas + 16 sagas sin resolver)
  con `--sin-sql`, 3/3 lotes, sondeo OK: 21 requieren contexto, 65 funcionan
  solas; las 461 clasificaciones previas intactas (547 filas, 159 requieren).
  **500 servibles exactos** (`data/ruleta-propuesta-500.json`): todos con
  razon + advertencia + atencion, flatrate Yump, sin exclusiones ni contexto
  requerido; **159 cortas**; 400 de la selección + 100 de la reserva; reserva
  editorial 17. SQL completo para revisión, NO ejecutado:
  `supabase/propuestas/2026-10-08-carga-ruleta/00…06` (verificaciones previas
  bloqueantes —incluida la definición real de `get_roulette_picks`—, 010,
  500 títulos y disponibilidades, textos/saga guardados, exclusión de los 86,
  verificaciones posteriores y reversión). `sala_candidatos` no se modifica.
  `lib/roulette-providers.ts`: `NOMBRES_EXCLUIDOS` con Looke, Lionsgate+,
  Filmelier Plus y Cindie (test). Backup `ruleta-2026-10-08-pre-sql` (46/46).
  **CARGADO EN PRODUCCIÓN por el dueño (08/10, a mano)**: verificaciones
  previas OK, CSV de respaldo descargados, migración 010 aplicada
  (`get_roulette_picks` = 003 + `rt.excluido_motivo is null`), carga de los
  500, exclusiones; `06-reversion.sql` NO ejecutado. **Auditoría de sólo
  lectura (service role, select + rpc), 08/10:** `roulette_titles` 2901, 2759
  con texto, 2282 con texto y "pero", 144 requieren contexto (sin cambios),
  excluidos anime 84 / stand-up 2; los 500 presentes, 500 servibles, 500 con
  disponibilidad; `title_availability` AR 3000 = 2901 de la ruleta + 99 sólo
  de chips; ningún título de la ruleta sin disponibilidad. **Las 5
  disponibilidades preexistentes** eran títulos del chip curado
  `magica-navidad` (The Holiday, Family Man, Elf, Dos padres por desigual, La
  bella y la bestia 2): `title_availability` es compartida con los chips;
  antes 2505 filas (2401 ruleta + 104 sólo chips), ahora 2901 + 99. El upsert
  les dejó la disponibilidad consultada el 07/10 (más nueva), que también usa
  el chip. `get_roulette_picks` devuelve 40 en corta/larga/chicos y ningún
  excluido. Huella de `sala_candidatos` informada por el dueño:
  `13fd9cf67683920729dbccdeac5fdd01`, sin cambios (no se pudo leer acá: el
  conector MCP de Supabase no conecta). Integrado a `main` el 09/10 (ver
  arriba).

- **ENTREGA `1.2.0` PUBLICADA EN LA WEB (2026-10-05) Y AAB `4 (1.2.0)`
  GENERADO; su subida a Play NO está confirmada.** (Registro recuperado el
  19/10 de un commit local que no se había subido; el deploy lo confirma
  GitHub: deployment **6871735270**, *Production – streamingcentral*,
  **success** 2026-10-05 23:27 UTC, commit `072e227`.) Comprende el badge "★ Yump", la
  sección RESEÑAS en acordeón, el filtro de Mi lista con su corrección de
  carrera y `versionCode 4` / `versionName "1.2.0"` (entradas de abajo).
  **Comprobado en Git:** prueba manual web del dueño aprobada (informado por el
  dueño); antes de integrar, sobre `072e227` (árbol `d6a74e1`): build de
  Producción limpio exit 0 (2 min 16 s, sin `next dev` y con `.next` y
  `out-capacitor` borrados), export nativo exit 0, suite 2237 / 2237 ok / 0
  omitidos, `tsc` 0, `git diff --check` limpio. **Fast-forward** de
  `origin/main` `95bf527` → **`072e227`** (push de `main` sin force, 23:25:58
  UTC). Producción sirvió el código nuevo a las 23:27:52 UTC (detectado por el
  selector de Mi lista en los chunks de `/cuenta/lista`); el estado "Ready" del
  deployment en el panel de Vercel no lo vio Claude.
  **Comprobado en Producción (`app.yump.ar`):** 200 en `/`, `/top`, `/buscar`,
  `/proximamente`, `/cuenta`, `/cuenta/lista`, la ficha de *Freaks*,
  `/persona/137427`, `/sala/nueva`, `/api/health` y
  `/.well-known/assetlinks.json`; `/api/health` con Redis OK y 0 errores 429;
  Home con 12 rieles, `fallos: 0`, `degradado: false`; filmografía v2 con
  secciones. En el navegador, la ficha de *Freaks* muestra "RESEÑAS · 1" y la
  bajada, cerrada; abierta, "RESEÑA YUMP" con la fecha, ventana con
  `overflow-y: auto` y `overscroll-behavior: contain`. Los chunks de la ficha y
  del Home traen el badge "Reseña Yump" y ninguno "Reseña SC"; los de
  `/cuenta/lista`, el selector y los dos mensajes de tipo vacío. El filtro con
  una sesión real no lo comprobó Claude en Producción (no inicia sesión).
  **AAB:** desde `072e227`, el mismo commit desplegado. `bundleRelease` BUILD
  SUCCESSFUL (2 min 47 s) con `verificarBaseDeApi`, `verificarFirmaDeCarga` y
  `verificarPaqueteConSalas` en verde. Copia estable
  `D:\DESARROLLO\stream central\releases\Yump-1.2.0-vc4.aab`,
  **7.541.431 bytes**, SHA-256
  **`39f6ccd0d46b14fe2db8c71e48da54b0ec9d59018098684ce015351896a03cab`**
  (idéntica al de `android/app/build/outputs/bundle/release/`). Firma: `jar
  verified.` (JDK 17), certificado de SUBIDA
  `2D:18:A7:C1:F4:FC:AB:D4:09:79:B3:CB:EA:66:1F:E5:41:D4:92:89:7D:47:B2:C6:7E:CF:AB:9F:93:03:95:AE`.
  Manifest dentro del AAB: `ar.yump.app`, `versionCode 4`, `versionName
  1.2.0`, dos filtros `autoVerify` con `https://app.yump.ar` y `/sala/`,
  `/titulo/movie/`, `/titulo/tv/`, 0 `vercel.app`. Paquete web: 201 entradas,
  199 idénticas al export más `cordova.js` y `cordova_plugins.js`, sin
  `.well-known/assetlinks.json` (excluido por `ignoreAssetsPattern`);
  `https://app.yump.ar` en 6 archivos, 0 `vercel.app`; trae el selector de Mi
  lista, "RESEÑAS", el badge "Reseña Yump" y ningún "Reseña SC".
  **Entorno (no es código):** Gradle 8.14 no compila los scripts de build
  sobre Java 25 (`Unsupported class file major version 69`) y Capacitor 8
  necesita Java 21, así que el AAB se generó con el JBR 21 de
  `~/.jdks/jbr-21.0.11` pasado sólo al comando, y `ANDROID_HOME` también sólo
  al comando. 🔒 `keystore.properties` se copió byte por byte desde el checkout
  principal con autorización del dueño (destino ignorado por Git, contenido no
  abierto ni mostrado) y se **eliminó** al terminar; ningún keystore ni `.jks`
  en el índice ni en el historial de Git. **Subida a Play:** el dueño dijo
  que la subiría; al 19/10 no hay confirmación registrada (pendiente de que
  el dueño la confirme en Play Console). **Pendiente:** el gesto táctil en teléfono y el filtro de Mi lista
  con sesión dentro de la app Android.
- **"Mi lista" con selector Películas | Series y versión `4 (1.2.0)`
  (2026-10-05): INTEGRADO Y DESPLEGADO el 05/10 con `072e227` (ver la entrada
  de arriba); el AAB `4 (1.2.0)` se generó y su subida no está confirmada.**
  *Lo que sigue es el registro de la rama: "en rama / sin push / sin deploy"
  quedó supersedido.*
  Pedido del dueño: en `/cuenta/lista` (sólo la vista completa; los rieles del
  hub siguen con `UserShelf`) el selector de las categorías, mismas clases
  `.tipo-toggle`/`.tt`, sólo Películas y Series. Abre en Películas, o en Series
  si no hay películas; un tipo vacío muestra "Todavía no guardaste películas."
  / "…series." con los dos botones; la lista vacía conserva su mensaje. El
  filtro es local (`lib/mi-lista.ts`, puro; `components/MiListaView.tsx`);
  dentro de cada tipo sigue el orden de `itemRefs("list")` (más reciente
  primero; `/api/cards` lo conserva). Volver de una ficha restaura filtro,
  tarjetas y scroll del snapshot (`cuenta:mi-lista`, firma = usuario) sin
  consultas, reconciliado contra `MyListContext` (que ahora expone `claves`,
  sólo lectura): lo que se sacó en la ficha desaparece sin consultar y si se
  agregó algo se recarga una vez conservando filtro y scroll. Pestañas ARIA
  (`tablist`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`, tabulación
  sólo en la elegida, flechas/Inicio/Fin). Sin SQL ni cambios de Supabase,
  Home o TMDB. Versión: **`versionCode 4`, `versionName "1.2.0"`** y la
  convención de versionado registrada en `CLAUDE.md` ("Versionado de la app
  Android"). **Tests:** `lib/mi-lista.test.ts` (RED → GREEN, 12, con dos
  mutaciones detectadas) y `lib/release-android.test.ts` (RED → GREEN); suite
  2229 / 2229 ok / 0 omitidos; `tsc` 0; build de Producción fresco (sin `next
  dev` corriendo, `.next` borrado antes) exit 0; export nativo release contra
  `https://app.yump.ar` exit 0 con `/cuenta/lista`, el selector y los textos
  en el paquete. **Comprobado en navegador** (`next dev` local, emulación
  375×812, con una página de prueba TEMPORAL no commiteada porque la vista
  real exige sesión y no se inicia sesión contra Supabase de Producción:
  `MiListaView` real, títulos reales vía `/api/cards`): abre en Películas con
  las 15 en el orden dado; clic en Series → 3 series en orden y **0
  peticiones de datos** (sólo los 3 pósters de la CDN de imágenes); teclado
  ←/Fin/Inicio cambian selección y foco; ir a una ficha y volver conserva
  Series sin recargar (1 carga en todo el recorrido). **NO comprobado:** el
  scroll al volver y la vista de escritorio — el panel del navegador quedó
  oculto (`requestAnimationFrame` congelado y `innerWidth` 0), así que esas
  mediciones no son válidas; la página real con sesión; el gesto táctil en un
  teléfono.
  **Carrera corregida (auditoría del 5/10):** la ficha hace `void
  list?.toggle(...)` y el contexto cambiaba las claves de forma optimista antes
  de que Supabase respondiera; volver al toque a Mi lista decidía con esas
  claves, así que un alta recargaba antes de existir en la base (el título
  faltaba) y una baja fallida dejaba el título oculto aunque el contexto
  revirtiera después. Ahora la escritura de Mi lista vive en
  `lib/mi-lista-memoria.ts` (pura; `MyListContext` la usa con la misma API más
  `asentado`), y `abrirMiLista` espera `asentado()` —que resuelve cuando no
  queda ninguna escritura en vuelo, con confirmación o rollback aplicados—
  antes de decidir, también en una entrada nueva. Sin demoras, sondeos ni
  recargas repetidas. `lib/mi-lista-carrera.test.ts`, con escrituras de
  promesa controlada: **RED** contra el código anterior (fallaban alta
  confirmada y baja fallida, salida guardada) y **GREEN** después en alta
  confirmada (1 recarga, el título primero), alta fallida (0 consultas, sin el
  título), baja confirmada (0 consultas, sin el título), baja fallida (0
  consultas, el título sigue), sin cambios (0 consultas), entrada nueva con
  alta pendiente y escrituras encadenadas; un test de REGRESIÓN fija que leer
  las claves sin esperar vuelve a romper los dos casos. Dos mutaciones
  detectadas (5 y 3 fallos). El nuevo `allSettled` quedó clasificado en el
  inventario de `lib/descartes-tmdb-inventario.test.ts`. Suite 2237 / 2237 ok /
  0 omitidos, `tsc` 0, build de Producción limpio (sin `next dev`, `.next` y
  `out-capacitor` borrados antes) exit 0, export nativo exit 0. **No probado
  con sesión real** (no se inician sesiones contra Supabase de Producción):
  volver al toque tras agregar/eliminar, el scroll al volver y la vista de
  escritorio quedan para la prueba del dueño.
- **Sección RESEÑAS de la ficha como acordeón (2026-10-05): INTEGRADA Y
  DESPLEGADA el 05/10 con `072e227`; va en el AAB 4 generado (subida sin
  confirmar).** *Registro de la rama; "en rama / sin deploy" supersedido.* Pedido y decisiones del dueño (5/10): el
  título "Reseña editorial" pasa a **"RESEÑAS · n"** con la bajada "Cuidado,
  puede contener spoilers."; arranca **siempre cerrada** (cerrada no renderiza
  texto) y al volver a la ficha vuelve cerrada; abierta, una ventana de alto
  máximo 55 % de la pantalla con scroll propio. Preparada para las reseñas de
  usuarios que vienen: `lib/resenas.ts` arma la lista (la de Yump siempre
  primera) y `components/ResenasAcordeon.tsx` la pinta; el sistema de reseñas
  de usuarios NO está construido. **Comprobado en navegador** (`next dev` local
  con la reseña real de *Freaks*, Supabase leído con la clave pública): cerrada
  muestra "RESEÑAS · 1" y la bajada; abierta, ventana de 446 px en 375×812
  (55 %) y 494 px en 1280×900; rueda dentro de la ventana mueve la ventana (0 →
  500) y no la página; al final de la ventana (518/518) la página tampoco se
  mueve (`overscroll-behavior: contain`); rueda afuera mueve la página (1166 →
  1566); ir a un relacionado y volver la deja cerrada. Tests nuevos
  `lib/resenas.test.ts` (RED → GREEN); suite 2217 / 2217 ok / 0 omitidos, `tsc`
  0, build de Producción exit 0. No probado: el arrastre táctil en un teléfono
  real (sólo emulación con rueda).
- **Badge de reseña editorial con la marca Yump (2026-10-03): INTEGRADO Y
  DESPLEGADO el 05/10 con `072e227` (rama `fix/badge-resena-yump`, sobre
  `4ef762c`).** *Registro de la rama; "sin push ni deploy" supersedido.* **Informado por el dueño:** el 3/10 publicó la primera
  reseña desde `/admin` y se vio bien; pidió que el badge dijera "Reseña Yump"
  y no "Reseña SC" (marca vieja). **Comprobado en código/tests:** la ficha dice
  "Reseña Yump"; la tarjeta dice **"★ Yump"** con `title="Reseña Yump"`,
  corto por decisión del dueño (opción B) después de medirlo en el navegador
  con la fuente real: el botón de agregar (32 px, arriba a la derecha, en todas
  las tarjetas) tapaba "★ Reseña Yump" (104 px) 29 px en las tarjetas de 124
  px y 13 px en las de 140 px del carrusel en celular —con "Reseña SC" ya se
  pisaba 14 px en las de 124—; "★ Yump" (64 px) entra libre. Test nuevo
  `lib/resena-marca.test.ts` (RED → GREEN); suite 2210 / 2210 ok, `tsc` 0.
  Sólo cambia texto: `components/TitleCard.tsx` y `components/DetailView.tsx`.
  En la app Android llega recién con el próximo AAB (el `versionCode 3` ya
  generado trae "Reseña SC"); la web, con el próximo deploy.
- **ENTREGA INTEGRADA Yumpeá + filmografía: WEB EN PRODUCCIÓN (2026-09-29);
  AAB `3 (1.1.0)` SUBIDO A ALPHA (informado por el dueño, 3/10).** Rama
  `fix/yumpea-filmografia-entrega` (worktree `wt-yumpea-filmografia`), desde
  `origin/main` `2af1a37` (árbol `ac9715d`).
  **Publicación web (29/09), comprobado en Git:** aprobada por la auditoría
  final de Codex sobre `feace52` (árbol `9ae0a70`) sin hallazgos bloqueantes;
  único cambio posterior, un paréntesis de este archivo (`95bf527`). Antes de
  integrar, sobre `95bf527` (árbol `bf4053f`): suite 2208 / 2208 ok / 0 fallos
  / 0 omitidos, `tsc` 0, `git diff --check` limpio y build fresco exit 0 (2 min
  22 s). **Fast-forward** de `origin/main` `2af1a37` → `95bf527` (push de
  `main` solamente, sin force, sin commit de merge: el árbol publicado es el de
  la rama). Producción empezó a servir `filmografia=v2` a las 20:37:14 UTC,
  unos 75 s después del push. El `main` local (worktree `wt-integracion-3c1`,
  `06bdfd1`) ya estaba atrás de `origin/main` y no se tocó.
  **Informado por el dueño:** Vercel muestra el deployment de Producción
  **Ready para `95bf527`**; Play Console muestra como mayor la versión
  **`2 (1.0.0)`**.
  **Comprobado en Producción por Codex (29/09, informado por el dueño):** Home
  con 12 rieles, `fallos: 0`, `degradado: false`; Top funciona, `fallos: 0`,
  `degradado: false`; `/api/health` con Redis OK y 0 errores 429; v1 de
  Villeneuve con Max: *La llegada* y *Blade Runner 2049*, 11 ocultas (igual
  que antes del deploy); v2: *Duna* y *Duna: Parte dos* en Dirección y con
  Max; `filmografia=v2&items=` funciona e `items` sin v2 se rechaza; "Ver más"
  cargó las 24 obras de Dirección; cambiar plataformas reordenó sin perder lo
  cargado ni mostrar una carga nueva; la invitación muestra `Yump` y "Ana te
  invitó a yumpear."; `/.well-known/assetlinks.json` publicado para
  `ar.yump.app`. Claude sólo comprobó, antes del deploy, la foto de Producción
  (Home 12 rieles, `fallos 0`; v1 de Villeneuve 2 títulos / 11 ocultas) y,
  después, que `?filmografia=v2` responde secciones; la comparación posterior
  la bloqueó el sistema de permisos de su sesión.
  **AAB:** `6ca23f4` sube `versionCode` 2 → 3 y, después, por decisión del
  dueño, un commit aparte cambia `versionName` 1.0.0 → **1.1.0** (sólo
  identificación de versión), cada uno con su test; frente a lo desplegado
  (`95bf527`) difieren sólo `android/app/build.gradle`,
  `lib/release-android.test.ts` y documentación: el paquete web es el mismo
  código y no hace falta otro deploy.
  Sobre `6ca23f4` (árbol `ec272e8`): suite 2208 / 2208 ok, `tsc` 0; export
  nativo release contra `https://app.yump.ar` exit 0 (2 min 19 s, 35 rutas en
  38 html, `/t/`, `/s/`, `/sala/nueva/`, `/p/`, `app.yump.ar` en 6 archivos, 0
  con `vercel.app`, la ficha pide `?filmografia=v2` y `&items=`); `cap sync
  android` (sólo cambió fines de línea de dos Gradle generados, restaurados);
  `verificarBaseDeApi` y `verificarPaqueteConSalas` BUILD SUCCESSFUL; manifest
  fusionado de **release**: `package ar.yump.app`, `versionCode 3`,
  `versionName 1.0.0` (antes del cambio a 1.1.0), `autoVerify` en los dos filtros `https` de
  `app.yump.ar` (`/sala/`, `/titulo/movie/`, `/titulo/tv/`), 0 `vercel.app`.
  **AAB firmado (29/09), comprobado:** generado desde **`bdbfb96`** (árbol
  `dca3a2c`): `versionCode 3`, `versionName 1.1.0`; frente a lo desplegado
  (`95bf527`) sólo cambian `android/app/build.gradle`,
  `lib/release-android.test.ts` y documentación. Antes de firmar: tests
  afectados 38/38, suite 2208 / 2208 ok / 0 omitidos, `tsc` 0, export nativo
  release contra `https://app.yump.ar` exit 0 y `cap sync android`.
  `bundleRelease` BUILD SUCCESSFUL (2 min 55 s) con `verificarBaseDeApi`,
  `verificarFirmaDeCarga` y `verificarPaqueteConSalas` en verde.
  - Archivo: `android/app/build/outputs/bundle/release/app-release.aab` del
    worktree `wt-yumpea-filmografia`, **7.536.764 bytes**, SHA-256
    **`8ae1ce4a14f69f8de66162909a71c573a45c258f5697bacca5864f739f64d5ac`**.
  - Firma: `jarsigner -verify` (JDK 17) → `jar verified.`, con los avisos
    esperados de una clave de subida (autofirmada, sin sello de tiempo).
    Certificado `CN=Yump, OU=Desarrollo, O=Yump, C=AR`, SHA256withRSA de 2048
    bits, válido hasta 2056; SHA-256 del certificado
    `2D:18:A7:C1:F4:FC:AB:D4:09:79:B3:CB:EA:66:1F:E5:41:D4:92:89:7D:47:B2:C6:7E:CF:AB:9F:93:03:95:AE`,
    **la huella de SUBIDA esperada** (la que fija `lib/sala/android.test.ts`),
    no la de depuración. El `jarsigner` de JDK 25 agrega además el aviso
    "signed in JarFile but not in JarInputStream", que el de JDK 17 no da.
  - Manifest DENTRO del AAB (`base/manifest/AndroidManifest.xml`, protobuf de
    aapt2 decodificado): `package ar.yump.app`, `versionCode 3`, `versionName
    1.1.0`; dos filtros `autoVerify="true"` con `https://app.yump.ar` y
    `/sala/`, `/titulo/movie/`, `/titulo/tv/`; 0 `vercel.app`. Igual que el
    manifest fusionado de release.
  - Paquete web dentro del AAB: 201 entradas; 199 idénticas byte a byte al
    export, más `cordova.js` y `cordova_plugins.js` (los agrega Capacitor);
    falta sólo `.well-known/assetlinks.json`, que `ignoreAssetsPattern` excluye
    (es de la web, no de la app). `https://app.yump.ar` en 6 archivos, 0 con
    `vercel.app`, la ficha pide `?filmografia=v2` y `&items=`; `/t/`, `/s/`,
    `/sala/nueva/` y `/p/` presentes.
  - Entorno (no es código): el worktree no tiene `local.properties`, así que
    se pasó `ANDROID_HOME` sólo al comando; Capacitor 8 compila con Java 21 y
    el JDK 17 falla (`invalid source release: 21`), así que Gradle corrió con
    el JBR 25 de Android Studio.
  - 🔒 `keystore.properties` se copió byte por byte desde el checkout
    principal con autorización expresa del dueño (destino ignorado por Git,
    contenido no abierto ni mostrado) y **se eliminó del worktree** al
    terminar; el original quedó intacto.
  - Copia estable, idéntica byte por byte (mismo tamaño y SHA-256):
    `D:\DESARROLLO\stream central\releases\Yump-1.1.0-vc3.aab`, fuera de Git
    y de los directorios de build. Rama respaldada en
    `origin/fix/yumpea-filmografia-entrega` (`4ef762c`), sin force.
  **Informado por el dueño (3/10):** subió ese AAB a la prueba cerrada
  **Alpha** como `3 (1.1.0)` y pidió a Google el acceso a **Producción**; está
  a la espera de esa aprobación. Claude no operó Play Console (Claude in Chrome
  no estaba conectado) y no vio el estado de procesamiento de la versión.
  **La checklist manual en teléfonos se omitió por decisión del dueño.**
  **v1 = COMPATIBILIDAD LEGACY EXACTA (opción A, decisión del dueño del
  29/09).** Los bundles Android instalados (piden sin `filmografia=v2`)
  reciben exactamente lo de antes: las mismas obras evaluadas, con los mismos
  filtros, en el mismo orden, los mismos títulos visibles para las mismas
  plataformas y el mismo costo. **No recuperan las dos Dune** (aceptado por el
  dueño). La reparación completa (roles, Dune, secciones, carga progresiva)
  llega con **v2**: la web y el próximo AAB. Historia: la auditoría del 29/09
  encontró que v1 copiaba del viejo sólo la CANTIDAD de obras (`1692a18`);
  `90f15e6` le dio reglas legacy pero con roles reparados, y eso perdía
  títulos (Spielberg con Netflix 7 → 5, Hanks cambiaba uno); se demostró en
  un test que no hay selección que conserve lo visible, sume lo recuperado y
  no evalúe más. El dueño eligió la opción A; implementada en `12abbbc`
  (issue **#25**). Commits, en orden: `e075fb2` y `914faa4`
  (cherry-pick de `706fb7a` y `c9b6119`, árbol idéntico al de `c9b6119`),
  `b169d8c` (filmografía v1/v2 y cambio de plataformas sin peticiones),
  `9c5ea58` (Yumpeá: bajada sólo en escritorio, lobby, espera y sin match),
  `508dbb8` (App Links de fichas y vista previa de invitación), `771301f`
  (presupuesto de v1), `40bbfdd` (escapes de caracteres bidireccionales),
  `1692a18` (documentación), `90f15e6` (v1 con reglas legacy, 29/09), su
  documentación, `12abbbc` (v1 exacta, opción A, 29/09) y el commit de
  documentación de la opción A. Detalle de
  filmografía en el issue **#25**; medición en
  [`medidas/2026-09-27-filmografia.md`](medidas/2026-09-27-filmografia.md).
  **Comprobado en código/Git:**
  - Filmografía: contrato versionado en `/api/person/[id]`. Sin
    `filmografia=v2` responde v1 `{ person, titles, hidden }` (bundles Android
    anteriores): **exactamente la selección del código anterior**
    (`seleccionV1` = la de `2af1a37`, incluido su índice de idioma), sin la
    reparación de roles. Con
    `filmografia=v2` (web y AAB nuevo) responde la filmografía completa, 12
    abiertas y 24 por "Ver más" (`&items=`, sólo en v2). Una versión por
    petición. `PersonView` dejó `useApi`: cambiar plataformas no pide nada.
  - Yumpeá: la bajada del banner y del tile se ve sólo en navegador de
    escritorio (CSS, no en móvil, PWA ni app); en el lobby, "Falta que se sume
    alguien" es un estado y con dos aparece "Empezar con 2"; spinner del
    invitado (quieto con "Reducir movimiento"); sin match, el organizador tiene
    "Otra tanda" y "Cerrar sala", y el invitado "Esperá a ver si <organizador>
    arma otra tanda."; App Link acotado a `/titulo/movie/` y `/titulo/tv/` →
    `/t/?tipo=&id=` (además de `/sala/`); vista previa de invitación "Yump" /
    "<organizador> te invitó a yumpear." con `?organizador=` sólo de
    presentación. Sin SQL ni migraciones. Los votos de salas siguen sólo en
    `room_votes` (test nuevo lo fija).
  - **Home, "6 para hoy", carruseles, «Elegidas para vos», Top, estrenos,
    reseñas, disponibilidad general, cachés y Supabase: sin cambios** (diff por
    archivo contra `origin/main`; `TitleCard` sólo suma un prop opcional que
    nadie más pasa).
  **Comprobado por tests y mediciones:**
  - Suite sobre el código final (`12abbbc`, opción A): **2208 tests / 2208 ok
    / 0 fallos / 0 omitidos**; filmografía 42/42, bloques 6/6, ruta 8/8,
    cliente 10/10. Controles por mutación: v1 con la selección reparada → 11
    fallos; sin el filtro de géneros → 5; una obra más de presupuesto → 9; v2
    con "el último rol gana" → 6. (Antes, sobre `40bbfdd`: 2195 / 2195 ok con el paquete nativo presente; sin él, 10
    omitidos por artefactos opcionales.) Release Android y scripts: 34/34; `npx tsc
    --noEmit` limpio; `git diff --check` limpio salvo el
    `AndroidManifest.xml`, que está guardado con CRLF en todas sus líneas desde
    antes (95 de 95 en `origin/main`): se respetó esa convención.
  - **Opción A (`12abbbc`, árbol `b8eb095`, 29/09):** build web exit 0 en
    2 min 04 s (16:55:54 → 16:57:59); export nativo release contra
    `https://app.yump.ar` exit 0 en 1 min 46 s, 35 rutas en 38 html, `/t/`,
    `/s/`, `/sala/nueva/`, `/p/`, `getLaunchUrl`/`appUrlOpen`, `app.yump.ar`
    en 6 archivos y 0 con `vercel.app`, la ficha pide `?filmografia=v2` y
    `&items=`; `cap copy android`; guardas `verificarBaseDeApi` y
    `verificarPaqueteConSalas` BUILD SUCCESSFUL (1 min 37 s); manifest
    fusionado de debug: `autoVerify` en `app.yump.ar` con `/sala/`,
    `/titulo/movie/` y `/titulo/tv/`, `versionCode 2`, `versionName 1.0.0`.
    Lo que sigue es la corrida anterior, sobre `40bbfdd`:
  - **Build web de Producción** (`npm run build`) sobre `40bbfdd` (árbol
    `1fefb6c`, el código final de la entrega): **terminó, exit 0, 2 min 40 s
    de pared** (21:41:53 → 21:44:33 del 28/09), con `/persona/[id]`, `/sala/[id]`,
    `/s`, `/sala/nueva` y `/t` en la salida. Un build anterior de la misma
    sesión también terminaron: `508dbb8` exit 0 en 5 min 53 s y `771301f`
    exit 0 en 2 min 32 s. **Antes de
    esta integración no había un build completo confirmado por la auditoría
    independiente** (sus dos builds de `c9b6119` se interrumpieron compilando).
  - **Export nativo** (`node scripts/build-capacitor.mjs --release
    --api-base=https://app.yump.ar`, sobre `40bbfdd`): exit 0, 2 min 23 s, 35
    rutas en 38 html. El paquete trae `/t/`, `/s/`, `/sala/nueva` y `/p/`;
    `getLaunchUrl`, `appUrlOpen` y las regex de `/sala/` y `/titulo/`;
    `https://app.yump.ar` en 6 archivos y **0** con `vercel.app`; la ficha de
    persona pide `?filmografia=v2`; la bajada no está en ningún HTML. Guardas
    de Gradle (JDK 17 pasado sólo al comando; el `JAVA_HOME` del sistema apunta
    a `C:\Program Files\Java\jdk-17.0.5\bin`, que no es válido): `verificarBaseDeApi` y
    `verificarPaqueteConSalas` **BUILD SUCCESSFUL**; manifest fusionado de
    debug con los filtros `/sala/`, `/titulo/movie/` y `/titulo/tv/`,
    `versionCode 2`. `cap sync` sólo cambió fines de línea de dos Gradle
    generados y se restauraron. **No se generó ni firmó ningún AAB.**
  - **v1 exacta contra TMDB real (29/09, `12abbbc`, Redis = doble del
    banco, antes y v1 alternados):** títulos visibles de v1 **idénticos y en
    el mismo orden** que los del código anterior en las cuatro personas (0
    ganados, 0 perdidos: Villeneuve 2, Spielberg 7, Hanks 20, Jackson 29),
    mismas obras evaluadas (13, 40, 40, 40) y **mismas peticiones**: 23, 58,
    50 y 43 en frío en los dos; 2 con Redis caliente. v2 en la misma ventana:
    20, 22, 21 y 22 al abrir; "Ver más" 28–35 en frío, 0 en caliente; las
    dos Dune en el bloque inicial de Dirección de Villeneuve con Max.
  - Peticiones reales a TMDB al abrir, en frío (mismo instrumento, TMDB real,
    Redis = doble del banco, variantes alternadas en la misma ventana): antes →
    v1 → v2 (28/09; repetido el 29/09 con v1 legacy: Villeneuve 23 → 20 → 20,
    Spielberg 58 → 55 → 22, Hanks 50 → 50 → 21, Jackson 43 → 43 → 22; el costo
    cumplía, los títulos visibles NO: era la variante reparada, descartada): Villeneuve **23 → 21 → 20**, Spielberg **60 → 55 → 22**, Tom Hanks
    **50 → 50 → 22**, Samuel L. Jackson **44 → 44 → 22**. Con Redis caliente,
    2 en todos. "Ver más" (24 obras): 30–35 en frío, 0 en caliente.
  - Build servido con `next start` (TMDB real, Redis del banco): el HTML de
    `/sala/<uuid>?organizador=Juan%20P%C3%A9rez%20%26%20%3CCo%3E` trae
    `<title>Yump</title>`, `og:title` "Yump", `og:description` y
    `twitter:description` "Juan Pérez &amp; &lt;Co&gt; te invitó a
    yumpear." (escapado por Next), `og:url` canónica SIN el nombre,
    `og:site_name`, `og:image` y `noindex`; sin nombre o con uno de 30
    caracteres, "Te invitaron a yumpear."; el Home conserva su descripción. API:
    sin versión respondía v1 (Villeneuve con `m`: 4 títulos, las dos Dune: era
    la variante reparada, DESCARTADA; con la opción A son los 2 de antes); con
    `filmografia=v2`, secciones y roles; `items` sin v2, versión rara y 25
    ítems → 400. En navegador: ficha de Villeneuve con "Ver más" abierto (28
    obras), agregar Netflix y después sacar Max → **0 peticiones** a `/api`,
    las 28 siguen abiertas y el orden cambia; la bajada se ve en escritorio
    (`display: block`) y no en emulación móvil (`display: none`, puntero
    táctil). La PWA standalone y la app no se pudieron probar acá.
  **Informado por el dueño:** Yumpeá está desplegada en la web desde el 27/09
  (ver la entrada siguiente) y el 28/09 subió el AAB con **`versionCode 2`** a
  Alpha, que **aparece en la app**. Eso NO equivale a una sala completa probada
  en teléfonos.
  **Pendiente de comprobar (nada de esto se probó en un teléfono):** App Links
  de fichas y de salas (`app.yump.ar: verified`, app cerrada y en segundo
  plano), la vista previa real de WhatsApp, los cambios visuales en teléfono,
  PWA y escritorio, la filmografía v2 en el AAB nuevo y el cliente Android
  anterior durante la transición. *(Supersedido: el filtro de fichas ya va en el
  AAB `3 (1.1.0)`, subido a Alpha el 3/10.)* Checklist al final de esta entrada.
  **AAB definitivo:** el dueño confirmó en Play Console que el mayor es
  `2 (1.0.0)`; el nuevo es **`versionCode 3`** con **`versionName "1.1.0"`**
  (decisión del dueño del 29/09; la propuesta `1.0.1` no se aplicó). 🔴 **Orden obligatorio, cumplido: primero
  el deploy web (hecho y verificado), después el AAB.** El AAB nuevo pide
  `filmografia=v2`; contra el servidor actual (sin versiones) recibiría el
  contrato viejo y la ficha de persona no lo entiende. Al revés no hay
  problema: los bundles viejos piden sin versión y reciben v1.
  **Checklist para el dueño (OMITIDA por decisión del dueño al publicar el
  AAB 3; queda como referencia si se quiere hacer):** web de escritorio;
  navegador móvil; PWA instalada; app Android actualizada desde Alpha; con la
  app cerrada y en segundo plano, abrir un enlace `/sala/` y uno `/titulo/`;
  teléfono sin la app: los dos abren la web; vista previa real de WhatsApp
  ("Yump" / "<organizador> te invitó a yumpear."); bajada visible sólo en
  escritorio; lobby con una persona y después con dos; spinner normal y con
  "Reducir movimiento"; sin match como organizador e invitado; filmografía v2 y
  "Ver más"; cambiar plataformas sin perder estado; volver desde una ficha;
  cliente Android anterior durante la transición (sigue viendo "Filmografía en
  tus plataformas", con los mismos títulos que antes y sin Dune).
- **Yumpeá EN PRODUCCIÓN WEB (2026-09-27), comprobado; en Alpha de Play
  (2026-09-28), informado por el dueño.** El dueño aplicó `009_salas.sql` en
  Supabase Producción, verificó que naciera apagada y encendió
  `sala_config.activas` (`activas | true`). `origin/main` se fusionó en
  `feat/salas` (`3a5fe02`) y el merge **`2af1a37`** (padres `06bdfd1` y
  `417f72f`) se pusheó y desplegó; 🔴 su árbol es **`ac9715d`, el mismo objeto
  que compiló el AAB `versionCode 2`** (identidad de árbol, no inspección).
  **Comprobado contra `app.yump.ar` después del deploy (27/09):**
  `POST /api/sala/preparar` → 401; `/sala/nueva` y `/s` → 200; el Home trae
  "Yumpeá"; `/.well-known/assetlinks.json` → 200, `application/json`, 0
  redirecciones, con las tres huellas de firma de aplicación. **Contra Supabase
  Producción con la anon key:** `sala_crear` → `42501` y `sala_unirse` →
  `22023 sala_credencial_invalida` (existen, corren y tienen los permisos
  correctos). **No volver a ejecutar `009_salas.sql`.** El botón web de Google
  Play sigue apagado (`NEXT_PUBLIC_YUMP_PLAY_PUBLICA` sin definir). **Pendiente
  en teléfonos:** una sala completa web–Android, enlaces de WhatsApp y
  `app.yump.ar: verified`. (Registrado primero en el commit local `d95e04d` de
  `feat/salas`, no pusheado; se integró acá a mano con el dato del 28/09.)
- **Salas compartidas (MVP) = Yumpeá: HISTÓRICO, YA INTEGRADO Y EN PRODUCCIÓN.**
  `feat/salas` se integró con el merge `2af1a37` (en `main`) y se desplegó el
  27/09 (GitHub: deployment 6698094206, *Production – streamingcentral*,
  success); `009_salas.sql` aplicada y `sala_config.activas` encendida por el
  dueño, y `assetlinks.json` publicado (ver la entrada "Yumpeá EN PRODUCCIÓN
  WEB"). Lo que sigue es el registro del 19/09: "en rama", "sin merge",
  "assetlinks pendiente", "nada ejecutado" y "no autorizado" quedaron
  supersedidos. El `feat/salas` local tiene además un commit propio
  (`d95e04d`) que NO está en `main`. *Texto original:* EN RAMA `feat/salas`,
  Etapas 0 a 3 hechas y 4 construida; sin merge, push, deploy ni cambios en
  Producción (2026-09-19). Plan aprobado
  por el dueño con tres rondas de correcciones:
  [`superpowers/plans/2026-09-17-salas-compartidas.md`](superpowers/plans/2026-09-17-salas-compartidas.md).
  **Comprobado en panel por el dueño (Tarea 0.1):** Supabase Free, PostgreSQL
  17.6, `realtime.send` y `broadcast_changes` presentes (→ go), acceso
  público de Realtime activo, `pg_cron` 1.6.4 / `pgcrypto` 1.3 / `pg_net`
  0.20.3, `SUPABASE_SERVICE_ROLE_KEY` en Vercel Production y Preview, uso de
  Vercel a 30 días con margen (19K/1M invocaciones, 30 min/4 h CPU).
  **Comprobado en local:** `--solo-datos` del generador del pool con 5 tests y
  control byte a byte contra el script anterior; entorno `supabase start`
  (config.toml sin migraciones del CLI, `db-local.mjs`, fixtures) verificado
  con la anon key vía PostgREST. **Decisión del dueño (18/09):** el "Pero" (`advertencia`) es OPCIONAL en
  las salas; `razon` sigue obligatoria; sin texto de reemplazo; la card no
  muestra la sección cuando falta. Plan, auditoría y fixtures actualizados.
  **Auditoría del pool en Producción, comprobada en panel por el dueño el 18/09:
  GO para la Etapa 1** — `servibles_sala` 1742; `n,d,m` 868 / `n` 272 / `n,d`
  547 / `n,d,m,p` 1097 (umbrales 20/10/20/20); 477 admitidas sin "pero"; 0
  textos vacíos. Confirma capacidad del pool, no frescura de la disponibilidad
  (consulta 2 y Apéndice A sin correr). **Etapa 1 HECHA en la rama y la base
  local (18/09):** `009_salas.sql` (seis tablas cerradas, 24 funciones con
  permisos por inventario, trigger `realtime.send`, cron por minuto) y
  `009_salas_down.sql` (rollback probado dos veces); 12 guards textuales y
  **37 pruebas con la anon key local en verde** (RLS, concurrencia, plazos,
  kill switch, y —tras dos rondas de auditoría— recuperación ante respuesta
  HTTP perdida con **credencial generada por el cliente** y hasheada en la
  base: sin tokens del servidor, sin rotación, orden de respuestas
  irrelevante); suite y `tsc` limpios. Evidencia:
  [`medidas/2026-09-18-salas-etapa1.md`](medidas/2026-09-18-salas-etapa1.md).
  **Etapa 2 HECHA en la rama y APROBADA por el dueño (19/09), con cierre
  auditado:** `lib/sala/*` (tipos, selección pura, orquestación con deps
  inyectadas, handler HTTP puro con 400 sin defaults) y `POST
  /api/sala/preparar` con `service_role`; **25 tests en `lib/sala`** (9 + 10 +
  6); inventario CORS 27 = 24 + 3. La ruta distingue `consultadas` /
  `enriquecidas` / `descartadas` y el `detalle` interno de un 500 queda sólo
  en el log del servidor (acotado), nunca en el body. **Medido en local con
  TMDB real, código final, tres frías INDEPENDIENTES de tamaño 20** (proceso
  reiniciado y caché vacía antes de cada una; caliente y control después):
  **2952 / 2856 / 2046 ms de servidor, máximo 2952 ms** — tres observaciones,
  no un p95 estadístico; 2 llamadas a TMDB por consultada en frío, 0 ok en
  caliente (0,31–0,65 s). Los "descartes por error de TMDB" en local son los
  FIXTURES (ids 9000xxxx, 404): sesgo pesimista, no existen en Producción.
  `npm run build` en verde con la ruta nueva; suite post-build 1745 / 1735 ok /
  0 fallos / 10 omitidos (artefacto Capacitor); `tsc` limpio. Evidencia:
  [`medidas/2026-09-19-salas-etapa2.md`](medidas/2026-09-19-salas-etapa2.md) y
  líneas crudas en `medidas/2026-09-19-salas-preparacion-crudo.txt`.
  **Etapa 3 HECHA en la rama (19/09), pendiente de aprobación del dueño:**
  cliente completo del MVP hasta la votación — credencial generada en el
  cliente y persistida antes de la primera solicitud (`lib/sala/token-store.ts`),
  `useSala` (Broadcast público sólo de escucha, relectura acotada a 1500 ms,
  respaldo cada 5 s, relectura tras cada plazo), `/sala/nueva` y `/sala/[id]`
  (crear, reclamar, unirse, lobby con ConfigTanda y "Empezar" contra
  `/api/sala/preparar`), votación con 10 s por card PERSISTIDOS (recargar no
  reinicia) y `pass` automático; entrada en el Home y en el hub. **Auditoría del
  dueño: tres bloqueantes corregidos** (`7580a1b`: credencial estable en memoria
  con `localStorage` roto y `confirmarSala` que no pierde el origen; compuerta
  monotónica en `useSala` contra respuestas fuera de orden y cambio de sala;
  cerrojo en la votación tras `ronda_cerrada`/`inexistente`) **y cuatro casos de
  integración de la segunda ronda** (`e8a46fd`: match temprano cierra la
  votación; una lectura descartada no toca ni `cargando` ni la relectura;
  intento ≠ credencial confirmada en el token-store; el error visual se limpia
  por intento). **60 tests nuevos**; suite post-build 1805 / 1795 ok / 0 fallos /
  10 omitidos; `tsc`
  limpio; `npm run build` en verde. **Verificado en navegador (local, TMDB
  real)** como invitado sin cuenta con el organizador desde node: lobby en vivo,
  lobby vencido, tanda publicada, pass cada 10 s exactos, recarga a mitad de
  card conserva el contador (9 → 6), `sin_coincidencias` y `match` llegan sin
  recargar. Corregido en la verificación: el contador se llevaba la card
  siguiente tras un pass automático (comienzo atado a su posición). **Resultado
  PROVISORIO** hasta la Etapa 4; `app/sala/[id]` todavía fuera de `APP_FUERA`
  (Tarea 6.1). Pendiente de verificación manual del dueño: la pantalla del
  organizador en el navegador, red cortada, lector de pantalla y una card sin
  "Pero" real. Evidencia:
  [`medidas/2026-09-19-salas-etapa3.md`](medidas/2026-09-19-salas-etapa3.md).
  **Etapa 3 aprobada técnicamente y Etapa 4 CONSTRUIDA (20/09, `cf60bc6`) y
  CORREGIDA tras la auditoría del dueño (21/09, `be5a4e3`: celebración del match
  a pantalla completa —overlay fijo, corazón grande, ~3 s o "Seguir", no se
  monta con reducir movimiento—; `pedirTanda` y `desempatar` releen el estado
  en el acto tras el éxito, con 6 tests; "Ver la ficha" en el empate resuelto).
  VERIFICADA EN LOCAL a 375 px el 21/09 como invitado, con organizador y tercer
  participante desde node: empate → desempate (rueda en el DOM) → elegida;
  ganador con la celebración a pantalla completa; sin coincidencias; "Otra
  tanda" desde `resultado` sin repetir títulos (30/30 distintos en 6 rondas) y
  rechazada con 409 durante el empate; card sin "Pero" real. Pendiente para el
  dueño: reducir movimiento en un teléfono, dos teléfonos reales, pantalla del
  organizador en el navegador, red cortada, lector de pantalla y movimiento
  reducido.
  **SEGUNDA RONDA DEL DUEÑO (22/09, `231c9be`):** el nombre visible pasó a ser
  **Pelimatch** —hoy es **Yumpeá**, ver la ronda del 26/09— en las dos entradas (Home, debajo de Ruleta Yump, y hub de la
  cuenta) —bajada todavía provisoria, rutas técnicas sin cambios—; los botones
  Sí/No/Paso pasaron a una BARRA FIJA sobre la barra inferior, con degradado y
  alto reservado, así que ya no quedan bajo el pliegue (medido a 360×640 y
  320×568 con textos largos, y verificado en la app); y la relectura tras
  Empezar/Desempatar tiene REINTENTOS ACOTADOS (0,8 s + 2 s + 5 s y abandona),
  porque el respaldo de `useSala` sólo corre con el canal desconectado.**
  **TERCERA RONDA (22/09, `38d5b64`):** Pelimatch navega en la MISMA PESTAÑA
  —se revirtió entera la apertura en pestaña nueva, con su módulo—; el reintento
  de la relectura NO funcionaba con el cableado real (`lector.leer()` atrapaba
  el error y no devolvía nada, así que `asegurarRelectura` daba la lectura por
  buena): ahora `leer()` devuelve cómo terminó y `releerDe` rechaza sólo ante un
  fallo, probado de punta a punta con una RPC que devuelve error; y la barra
  compacta conserva el área táctil de 64 px (era 54/62).**
  **CUARTA RONDA (22/09, `22aec59`):** una carrera más en la relectura —la
  lectura de la acción queda pendiente, entra otra por Realtime que falla, y la
  primera vuelve con estado válido pero la compuerta la descarta— dejaba el
  estado sin aplicar y la acción sin reintentar. Reproducida con el lector real
  antes de tocar nada y corregida: el lector distingue `descartada` (otra SÍ
  aplicó, o la sala quedó terminal) de `descartada-sin-estado` (nadie aplicó),
  y `releerDe` rechaza en el segundo caso. La protección contra estados viejos
  no cambió y el caso normal no genera ni una solicitud extra. Suite post-build
  1860 / 1850 ok / 0 fallos / 10 omitidos; sala 263/263.** Lo
  construido: pantallas de match (corazón + confeti +
  elegida + Compartir), empate (cards, "Desempatar" sólo host, rueda que frena
  en `ganador_pos`), sin coincidencias, y "Otra tanda" sólo host desde
  `resultado` (`PrepararTanda`, compartido con "Empezar"). Todo lo decide la
  base (`resultado.*`); un barrido falla si un componente cuenta votos.
  Animaciones detrás de `prefers-reduced-motion: no-preference`. Suite
  `tsc` y build en verde.
  El 20/09 Docker Desktop/WSL no levantó (`vpnkit-bridge handshake failed`,
  luego `CreateVm/E_ABORT`); el 21/09 volvió sin reinicio. La entrada del
  entrada del Home sigue debajo de la ruleta como Link a `/sala/nueva`. Evidencia:
  [`medidas/2026-09-20-salas-etapa4.md`](medidas/2026-09-20-salas-etapa4.md).
  **ETAPA 5 HECHA (22/09, `a01e150` + `81a287c`):** `mensajeMatch` con el texto
  del plan ("¡Nuestro match!" / "Disponible en …" / "Ver ficha en Yump:" + url
  canónica), `lib/compartir-accion.ts` —la acción extraída de DetailView sin
  cambiarle el comportamiento, ahora compartida por la ficha y por Pelimatch— y
  `generateMetadata` + `revalidate = 21600` en la ficha, con `og:image` absoluta
  de TMDB. **Medido** con build de producción: TTFB caliente 32,4 → 38,5 ms de
  mediana (+6,1, rangos superpuestos); la primera visita a un título nuevo paga
  TMDB (270-584 ms) y después vuelve a la banda caliente. Verificado en la app:
  el match comparte el texto exacto y la ficha sigue compartiendo el suyo.
  🔴 **La vista previa real de WhatsApp en iPhone/Android NO se probó** (necesita
  Preview y dispositivos): no está afirmado que el póster se vea. Evidencia:
  [`medidas/2026-09-22-salas-etapa5.md`](medidas/2026-09-22-salas-etapa5.md).
  **RONDA DEL DUEÑO (23/09, `fce03a6` → `45c1666`):** cuatro correcciones sobre
  la Etapa 5 ya cerrada. (a) **Con ganadora la sala se termina**: "Otra tanda"
  desaparece del match, del ganador de grupo y del desempate resuelto —queda
  sólo en "sin match"— y en su lugar el organizador ve **"Cerrar sala"**, que
  hace falta porque no puede tener dos salas activas y la del resultado sigue
  viva 5 minutos. Lo decide la base: `puede_otra_tanda` suma `r.ganador_pos is
  null` (mira el ganador y NO el tipo, porque `sala_desempatar` deja
  `resultado = 'empate'`). (b) **El lobby avisa**: el rótulo del botón pasó a
  "Falta que se sume alguien" / "Empezar con N", con la cuenta pegada al botón y
  un aviso de 6 s cuando alguien entra; la lista ya se actualizaba sola, el
  problema era que está arriba de todo y el botón abajo. **No se automatizó el
  arranque** y está argumentado en el plan. (c) **La animación del match** pasó
  de un solo movimiento de 900 ms a cinco tramos en 870 ms (anticipación, unión
  acelerando que se pasa 4%, asiento, pulso único con overshoot real, destello y
  8 chispas); overlay de 3,3 s a 2,4 s y confeti de la celebración de 90 a 60
  (el default del componente sigue en 70: lo comparte el desempate). (d) **El
  invitado no elige plataformas**: `sala_unirse` perdió `p_platforms` —con el
  parámetro vivo, una llamada directa seguía ampliando la unión— y hereda las
  del organizador; la pantalla sin match pasó a carita 🙁 + "Esta vez no hubo
  match" + "Ninguna película tuvo coincidencias. Suele pasar.", con la línea de
  "Otra tanda" sólo para quien organiza.
  **RONDA DEL DUEÑO (26/09):** 🔴 **el nombre visible es ahora "Yumpeá"** y el
  botón del banner dice **"Hacé match"**; el emoji 🍿 y la bajada no cambian, y
  el hub sigue sin botón porque la tarjeta entera es el enlace. **Sólo cambió el
  rótulo**: rutas (`/sala/nueva`, `/sala/[id]`), tablas, RPC y los nombres de
  archivo (`PelimatchTile.tsx`) siguen igual. Verificado a 375 px.
  **RONDA DEL DUEÑO (27/09): Yumpeá DENTRO de la app Android.** La decisión de
  dejarla sólo en web/PWA se revirtió. 🔴 **Hallazgo:** el artefacto nativo **no
  compilaba** desde que entró `app/sala/` (`Page "/sala/[id]" is missing
  "generateStaticParams()"`), o sea que no había AAB posible. **Comprobado
  automáticamente:** ruta `/s/?id=<uuid>` con el patrón de `/t` y `/p`; del
  paquete se excluye sólo el segmento dinámico, así que `/sala/nueva` sigue
  viajando; el enlace de invitación es siempre `https://app.yump.ar/sala/<id>`
  (antes salía de `location.origin`, que en el contenedor es
  `https://localhost`); la entrada dejó de ocultarse en Android; intent-filter
  con `autoVerify` acotado a `/sala/` y manejo de los dos casos (app cerrada con
  `getLaunchUrl`, en segundo plano con `appUrlOpen`); traducción del enlace por
  lista blanca. Invitación a instalar Yump al final de las tres pantallas de
  resultado final, con Android en blanco hasta que `NEXT_PUBLIC_YUMP_PLAY_PUBLICA=1`
  (la app está en prueba cerrada Alpha) e instrucciones en iPhone; el aviso PWA
  se suprime en todo `/sala/*`. **Comprobado con build real:** export estático en
  verde, `cap sync android` y **`./gradlew assembleDebug` BUILD SUCCESSFUL**, con
  el intent-filter presente en el manifest fusionado del APK. Suite 1914 (1898
  ok, 0 fallos, 16 omitidos), `tsc` limpio, `npm run build` web en verde.
  ⏳ **PENDIENTE y bloqueante para la verificación de dominio:**
  `public/.well-known/assetlinks.json`, que necesita la huella SHA-256 de **Play
  App Signing** del dueño; no se creó ni se desplegó
  ([`ANDROID-APP-LINKS.md`](ANDROID-APP-LINKS.md)). 🔴 **NADA se probó en un
  teléfono**: ni el enlace de WhatsApp, ni la instalación, ni la invitación en
  pantalla. `prefer_related_applications` no se tocó.
  ⚠️ `npm run build:capacitor` **falla en la máquina del dueño** por
  `NEXT_PUBLIC_SITE_URL` ausente en `.env.local`; en esta sesión se inyectó desde
  afuera sin tocar el archivo.
  **RONDA DEL DUEÑO (27/09, 2ª parte): las DOS superficies, y el AAB preparado.**
  Yumpeá va a estar visible y funcionando en el Home web **y** en la app del
  canal de prueba cerrada; la entrada web **no** se oculta. **Comprobado con
  build real:** el paquete web de release se construye y sincroniza, y de los
  tres guards de Gradle pasan los dos que pueden correr —`verificarBaseDeApi` y
  el nuevo `verificarPaqueteConSalas`, que impide que un `sync` olvidado
  produzca un AAB con el paquete web anterior (probado en rojo y en verde)—.
  🔴 **El AAB firmado NO se puede generar todavía:** `bundleRelease` corta en
  `verificarFirmaDeCarga` porque falta `android/keystore.properties`, que es del
  dueño y no sale de su máquina. Se agregó la plantilla vacía
  `android/keystore.properties.example`; `.gitignore` ya cubría el `.jks` y las
  contraseñas, y hay un test que lo verifica. **Faltan DOS datos de Play
  Console**, ninguno secreto: el `versionCode` más alto subido a cualquier canal
  y la huella SHA-256 de **Play App Signing**.
  ⚠️ **Corrección sobre los App Links:** sin `assetlinks.json` el enlace de
  WhatsApp **lleva a la sala igual** (por el navegador), pero **no está
  garantizado que abra la app**: en Android 12+ un filtro que no verificó no se
  ofrece y abre Chrome directamente, sin diálogo. Esa prueba queda **pendiente,
  no aprobada**, hasta desplegar el archivo con la huella correcta y ver
  `verified` en un teléfono.
  ⚠️ **Reversión después de distribuir el AAB:** volver al deployment web
  anterior **no** quita la actualización de los teléfonos. El primer freno es
  `sala_config.activas = false` en Supabase, que es lo único que actúa sobre lo
  que los teléfonos ya instalados escriben directo en la base.
  Orden y autorizaciones en
  [`YUMPEA-PRUEBA-CERRADA.md`](YUMPEA-PRUEBA-CERRADA.md): migración apagada →
  encender → deploy (con `assetlinks.json` si la huella llegó) → sala completa en
  la web → AAB al canal Alpha → sala completa en Android. **Nada ejecutado.**
  **RONDA DEL DUEÑO (27/09, 3ª parte): el AAB firmado YA COMPILA.** El dueño
  recuperó el keystore de subida —su SHA-256 coincide con Play y contiene
  `PrivateKeyEntry`, así que no hay que pedir cambio de clave— y confirmó que el
  `versionCode` más alto en Play es **1**. **Comprobado con build real:**
  `versionCode` subido a **2**, `bundleRelease` BUILD SUCCESSFUL con los tres
  guards en verde, y sobre el AAB resultante: la firma es la clave de subida
  correcta (huella idéntica a la confirmada), `versionCode 2` en el manifest
  fusionado, 6 archivos del paquete web con `https://app.yump.ar` y **0** con
  `vercel.app`, y "Yumpeá", "Hacé match" y la ruta `/s/?id=` presentes. 🔒 El
  `.jks`, el alias y las contraseñas no se leyeron ni se registraron: lo único
  mirado es la huella pública del certificado.
  **`public/.well-known/assetlinks.json` escrito** con las **tres** huellas de
  **firma de aplicación** (clásica actual, poscuántica y clásica anterior), no la
  de subida; hay un test que las fija y rechaza la de subida explícitamente.
  Verificado además que **Next lo sirve**: HTTP 200, `application/json`, 0
  redirecciones —una carpeta que empieza con punto dentro de `public/` no es
  obvio—.
  🔴 **La apertura automática desde WhatsApp sigue SIN aprobar**: el archivo está
  en el repositorio pero `app.yump.ar` todavía lo sirve en 404. No se aprueba
  hasta deployar y ver `app.yump.ar: verified` en un teléfono.
  **Nada ejecutado:** sin migración, sin encendido, sin deploy, sin merge, sin
  push y sin subir el AAB a Play. Lo único que falta ahora son autorizaciones.
  🔴 **LANZAMIENTO AUTORIZADO EL 27/09 Y **NO EJECUTADO**: DETENIDO ANTES DE
  TOCAR PRODUCCIÓN.** El dueño autorizó migración, encendido, merge/push/deploy y
  subida del AAB al canal Alpha, con la condición de verificar antes que el AAB y
  el deploy web correspondan al mismo código. **No corresponden, y por eso se
  frenó.** Evidencia, toda comprobada en este repositorio:
  1. **`origin/main` está 41 commits por delante de `feat/salas`** e incluye
     trabajo mayor que la rama no tiene: la **Etapa 3.c.1** (pausa compartida ante
     429) y el **hotfix de supresiones del #24 ya mergeado y desplegado**
     (`594dd09`, `06bdfd1`). El AAB firmado se compiló del árbol de `feat/salas`,
     así que **no contiene nada de eso**: el teléfono correría un código distinto
     del que serviría `app.yump.ar`.
  2. **El merge no es limpio:** `git merge-tree` marca **3 conflictos** —
     `docs/ESTADO.md`, `docs/ISSUES.md` y `lib/descartes-tmdb-inventario.test.ts`.
  3. **Los cambios sin commitear del #24 ya están en `main`**: `lib/disponibilidad.ts`,
     `lib/enrich.ts` y `lib/claves.ts` del árbol son **idénticos** a los de
     `origin/main`. El árbol quedó desactualizado, no tiene trabajo en riesgo ahí;
     `lib/supresiones-disponibilidad.ts` sí difiere (114 líneas menos que en main).
  **Accesos que además faltan, comprobados:** el MCP de Supabase responde
  **`Unauthorized`** (sin token), así que la migración no se puede aplicar desde
  acá; y no hay ninguna vía para subir un AAB a Play Console. Los pasos 1 y 3 son
  del dueño.
  **Lo que SÍ quedó listo y verificado** (ver [`YUMPEA-PRUEBA-CERRADA.md`](YUMPEA-PRUEBA-CERRADA.md)):
  AAB firmado con `versionCode 2`, firma de subida correcta, API de Producción y
  Yumpeá adentro; `assetlinks.json` con las tres huellas de firma de aplicación,
  servido con 200 y sin redirecciones. **Ese AAB hay que volver a compilarlo**
  desde el árbol fusionado antes de subirlo.
  *(Histórico al 27/09: lo que sigue quedó superado el mismo día —migración,
  encendido, merge y deploy— y el AAB se subió a Alpha el 28/09; ver la entrada
  "Yumpeá EN PRODUCCIÓN WEB" arriba.)*
  **Nada publicado:** sin migración, sin encendido, sin merge, sin push, sin
  deploy y sin subida a Play. **Nada probado en teléfonos.**
  Sigue la Etapa 6, **no autorizada todavía**. **No autorizado tampoco:** migraciones en Producción, deploy,
  encender `sala_config.activas`, refresco productivo del catálogo (Apéndice A
  del plan), merge y push. Evidencia:
  [`medidas/2026-09-18-salas-etapa0.md`](medidas/2026-09-18-salas-etapa0.md).
- **Issue #24 (2026-09-20): Disney+ AR mostraba 20 películas que ya no
  tiene — CORREGIDO, MERGEADO EN `main` Y DESPLEGADO (2026-09-20).** Hotfix
  aislado desde `main` `f443924` (rama `fix/supresiones-disney`, commit único
  `d88ecbb`, auditado por Codex sin hallazgos funcionales); merge `--no-ff`
  **`594dd09`** con árbol idéntico al de la rama; push de `main` solamente;
  deployment automático de Vercel **`dpl_BUgH7twdWVnuXQxkd5eKsVxPP7sq`**
  READY, target production, `githubCommitSha = 594dd09`, asociado a
  `app.yump.ar`. **Comprobado en producción (`app.yump.ar`):** `movie:2118`
  → `['pp','mv']` en ficha, `/api/cards` y búsqueda, `links` sin `d`; Heat
  (`movie:949`) → `['p','mv']`; LOTR (`movie:122`, control no suprimido)
  conserva `['d','mv','m']`; Home con `providers=d`: ninguna de las 20; con
  `d,pp`: 2118 aparece con `['pp','mv']`; con `n,d,m,pp,p`: ninguna suprimida
  con `d`. **Las 20 películas confirmadas ya no aparecen en Disney+.** El
  problema general de TMDB sigue ABIERTO (#24); próximo cruce global
  **mensual, desde octubre de 2026**.
  Reportado por el dueño con `movie:2118`; no era un bug nuestro: TMDB sirve
  el dato viejo en vivo. Medido: 20 falsos positivos en 100 películas de
  Disney+ AR (todos licenciados), 0 en 60 de Netflix; **el dueño verificó las
  20 a mano dentro de Disney+**. **Comprobado en código:** registro de
  supresiones negativas (`lib/supresiones-disponibilidad.ts`, 20 entradas
  activas, sin vencimiento automático, próxima revisión 2026-10-20), aplicado
  en el resolvedor central, el atajo del adaptador, el Top y Próximamente;
  `VERSION_HOME` 7 y `VERSION_DISPONIBILIDAD` 1 para invalidar las cachés
  exteriores al deployar. **Comprobado en local, contra el build del hotfix
  ejecutado con `next start`:** `movie:2118` → `['pp','mv']` en ficha, cards
  y búsqueda, sin `links.d`; Heat → `['p','mv']`; LOTR conserva Disney+.
  Suite del commit aislado 1926 pruebas, 0 fallas (omitidas: 10 en la
  auditoría de Codex, 18 desde cero, según los artefactos opcionales).
  Verificado sobre el `main` fusionado antes del push: suite 1926 (1916 ok,
  0 fallos, 10 omitidos), `tsc` 0, build fresco OK, `diff --check` limpio.
  **Siguiente paso** *(el reintegro en `feat/salas` ya ocurrió: `594dd09` está
  en `2af1a37`)*: reintegrar el hotfix en `feat/salas` (esa rama recupera
  la fila de `lib/sala/preparacion-nucleo.ts` en el barrido). Cruce global
  periódico mensual desde octubre (decisión del dueño); cada tanda nueva sube
  las dos versiones. Ver `docs/ISSUES.md` #24 y
  `docs/medidas/2026-09-20-disney-falsos-positivos.md`.
- **`medicion/sync-upcoming` (`a7a223d`, worktree `wt-sync-medicion`) — DETENIDA
  por el dueño el 2026-09-17, NO desplegada, antecedente aislado.** Es una
  tarea separada (instrumentación de la Edge Function `tmdb-sync`, cron de
  próximos estrenos, idiomas, clasificación de anime) y **no forma parte de
  la Etapa 3.c.1**. Comprobado en Git: la Edge Function de esa rama nunca se
  desplegó (el intento de deploy quedó bloqueado por credenciales inválidas
  de la CLI/MCP de Supabase y no se reintentó); ningún archivo de esa rama
  está en `diseno/etapa3c-proteccion-tmdb` (verificado por ausencia de
  `supabase/functions/tmdb-sync/lib/medicion.ts`, `lib/sync-medicion.test.ts`,
  `lib/sync-recorrido.test.ts`, `types/deno.d.ts`, `tsconfig.functions.json`
  y `docs/medidas/2026-09-05-sync-medicion.md`). Lo que Producción tiene de
  `tmdb-sync` es lo que dice la tabla de despliegue más abajo, no esta rama.
  No retomar sin pedido explícito del dueño.
- **Etapa 3.c.1 de capacidad (#19) — "pausa compartida ante 429": MERGEADA,
  PUSHEADA Y DESPLEGADA (2026-09-19). SUBETAPA CERRADA.** Aprobada por la
  auditoría final de Codex sobre `6fd875e` sin hallazgos bloqueantes
  (`home-servir` 83/83; suite repetida por Codex 1.900: 1.890 ok, 0 fallos,
  10 omitidos; `tsc` y `diff --check` limpios). Merge `--no-ff` **`367b765`**
  en `main` (rama `feat/etapa3c1-pausa-tmdb` en `6fd875e`; **árbol del merge
  idéntico al de la rama**, verificado por hash de árbol); push de `main`
  solamente (`origin/main` `37d4707` → `367b765`); deployment automático de
  Vercel **`dpl_Emrbaqf1Ft1oJydTjMGy4GzNiWXh`** READY, target production,
  `githubCommitSha = 367b765…`, aliasado a `app.yump.ar` (READY 16:27 UTC).
  **Precaución de Git cumplida:** el `main` local estaba tres commits
  adelante (`0c13036`, `8429f5e`, `34e4637`, plan de Salas); se verificó que
  los tres están contenidos en `feat/salas` (`c7e596c`), que ninguna worktree
  tenía `main` checkout, y se devolvió el puntero local de `main` a
  `origin/main` (`git branch -f`, sin tocar `feat/salas` ni los cuatro
  archivos sin seguimiento del worktree principal); la integración se hizo en
  una worktree nueva y exclusiva (`wt-integracion-3c1`). Verificado sobre el
  `main` fusionado antes del push: pruebas de la 3.c.1 (180/180), suite
  **1.900 (1.890 ok, 0 fallos, 10 omitidos)**, `tsc --noEmit`, build fresco
  (`dt5aoP2yHEsj1fgGji4lF`, 116 s, 0 errores), `git diff --check`.
  **Comprobación PASIVA tras el deploy** (sin provocar 429, ni caída de Redis,
  ni carga, ni vencimientos, ni vaciado de cachés; sin tocar variables ni
  infraestructura): `/api/health` 200 (Redis OK, 615 claves; bloque `pausa`
  nuevo: `pausaVigenteMs 0`, cubos de los últimos 60 min todos en 0); Home
  `n,d,m` 200 (85 KB, 1,6 s y 1,2 s); búsqueda 200; ficha 200; `/`,
  `/buscar`, `/titulo/movie/603` 200. Logs del deployment: el primer Home
  salió por el camino UB-primero (`ultimo-bueno-fondo`, fondo programado), el
  `[home-fondo]` compuso y publicó en 19,6 s con **480 llamadas a TMDB (480 ok,
  0 x429)**, 3 renovaciones, `turno adquirido`; el siguiente pedido
  `ultimo-bueno` con `turno ocupado`; sin errores, timeouts, Homes degradados
  publicados ni tareas residuales. 🔴 **No hubo ningún 429 real en Producción:
  el camino de la pausa NO se observó en vivo; su evidencia es la del banco y
  los tests (§53-§57).** **Kill switch `TMDB_PAUSA_429=0`** (apaga los dos
  niveles y `TOMAR` vuelve al `SET NX`): NO está activado; cualquier cambio de
  esa variable exige autorización del dueño y un redeploy para aplicarse.
  **Limitación excepcional heredada, documentada y NO resuelta en esta
  integración (tarea futura):** con Redis caído + TMDB pausado + sin UB, un
  pedido puede tardar 58-75 s (la composición `sin-redis` paga los reintentos
  del cliente principal por cada lectura de caché —promesa reducida de la
  Etapa 2— antes de decidir); no entrega contenido mutilado, pero puede
  terminar en 503 `pausa` o en el corte de Vercel (`maxDuration` 60 s). Historia
  en rama (antes del merge): lo que sigue.
- **Historia en rama de la 3.c.1 (antes del merge):**
  IMPLEMENTADA en `feat/etapa3c1-pausa-tmdb` (worktree `wt-etapa3c1`, desde
  `aac70e7`; informe §53) y CORREGIDA tras la auditoría de Codex sobre
  `6fc63b5` (informe §54, 2026-09-18, `d322282`) y tras la auditoría sobre
  `d322282` (informe §55, 2026-09-18: el tope de lectura con pausa local
  CANCELA el trabajo —lector acotado `leerAcotadasHome` sobre `redisLector`,
  `retries: 0` y señal de 1 s por petición— en vez de la carrera `conTope`,
  que dejaba el MGET del cliente principal reintentando tras el 503; medido
  en el banco con control sobre `d322282`: 18 MGET y 4 tardíos hasta +3,3 s
  contra 3 MGET y 0 tardíos, ventana ≥ 10 s; criterio 8 nuevo en el banco) y
  tras la auditoría sobre `1403ae4` (informe §56, 2026-09-19: la
  READQUISICIÓN tras el sueño de una pausa corta —que §55 no cubría; S4b usa
  `Retry-After: 20` y no readquiere— es ahora UNA operación lógica con plazo
  compartido: `tomarAcotado` = el mismo TOMAR atómico por el cliente acotado
  (`opsTurnoAcotadoHome`, `retries: 0`) bajo una señal de `T_ADQ_MAX` que
  viaja por `conPlazoRedis`; vencida → `indeterminado` → 503, sin LIBERAR
  tardío, y un TOMAR que hubiera aplicado sin reconciliarse vence por TTL
  (`TURNO_MS` 15 s); medido con control sobre `1403ae4`, Retry-After 3 s: Redis
  caído 7 comandos tardíos (TOMAR + 6 GET hasta +6,7 s) contra 0; Redis
  colgado un TOMAR completado a +13 s y un LIBERAR tardío contra 0; escenario
  S4c y criterio 9 en el banco) y tras la auditoría sobre `9fd6d71` (informe
  §57, 2026-09-19: los dos caminos `sin-redis` —adquisición inicial sin Redis
  y readquisición tras la espera breve— servían `producir().valor` sin mirar
  `pausada`, así que un Home MUTILADO por 429 salía como 200 (medido: 11
  elementos, 136 fuentes caídas, 58,6 s); ahora `componerSinRedis` aplica la
  regla 4d' de `componer`: con UB ya leído → UB, sin UB → 503 `pausa` +
  Retry-After, nada escrito; un degradado AJENO a la pausa se sirve como
  siempre; el tiempo NO cambia (58,5 s: promesa reducida de la composición
  con Redis caído); criterio 10 en el banco); luego auditoría final APROBADA
  sobre `6fd875e` y merge `367b765` (ver el cierre arriba).
  Diseño §45-§52 aprobado por el dueño el 18/09.** **Lo que
  corrigió §54 [comprobado en tests y banco]:** (1) con la pausa LOCAL
  vigente ninguna lectura de Redis espera los reintentos del SDK: lectura
  previa, fresca y UB por el LECTOR ACOTADO (`leerAcotadasHome`: cliente
  aparte, sin reintentos, señal de 1 s por petición — §55: cancela de verdad,
  nada queda vivo tras responder), sin TOMAR,
  `pausado` con el restante fresco; medido en el recorrido HTTP completo con
  Redis caído y pausa conocida: **503 en 3,04 s (antes 23,1-23,7 s)**, 0
  composiciones, 0 TMDB; el pedido que entra SIN pausa con Redis caído sigue
  en la promesa reducida de la Etapa 2 (≈ 75 s), límite documentado; (2)
  `tmdb:cubos` es un ring de 120 slots (≤ 960 campos por más que corra la
  app; SALUD un solo HGETALL acotado; 500 minutos probados); (3) PAUSAR lee
  `TIME` una sola vez por evento (con dos lecturas, un cambio de minuto
  separaba `429` de `pausas`: RED reproducido); (4) **el Preview de la
  precondición usó el Redis de Producción** (`KV_*` es una sola entrada con
  ámbito "Production, Preview", como documenta `docs/MANTENIMIENTO.md`):
  operación accidental sobre Producción, acotada a claves prefijadas y
  borradas; `DBSIZE` 802 → 90 **no explicado**, sin atribuir; no se repite
  contra Producción; (5) `home-fondo-orden` y `home-vuelo` deterministas
  (reloj fijo y sincronización inyectada; 3/3 corridas fallaban bajo carga,
  ahora 6/6 pasan); build controlado sin Next activo ni entorno del banco:
  130 s, exit 0, `BUILD_ID` `XX_-UqA5fcZbIJisArQWs`. **Tras §55:** suite
  1881/1891 (10 omitidos preexistentes) ×2, `tsc` 0, build fresco controlado
  116 s exit 0 (`BUILD_ID` `ryOY8nDhnkldv8thUQ-gl`; sobre el commit final
  100 s, `fCRCsm-dcpnrTyMTs3GkT`; tras §56: suite 1887/1897 ×2, build 185 s
  `s9n3d_bG5ESPdWEDIY23i`, identidad 16/16, umbrales dentro, criterios 4-9;
  tras §57: suite 1890/1900 ×2, build 193 s `ecQqzUTF-JUrt-c9SXM-_`, identidad
  16/16, umbrales dentro, criterios 4-10),
  `git diff --check`
  limpio, identidad 16/16, umbrales dentro, criterios 4-8 verdes. Qué hay [comprobado en Git y en el banco]: los cuatro
  scripts Lua (`lib/pausa-lua.ts`: `TOMAR` con la pausa dentro de la
  adquisición, `PAUSAR` v3 idempotente por evento con telemetría en `pcall`,
  `CUBO`, `SALUD`), la pausa del proceso (`lib/tmdb-pausa.ts`: nivel 1 local
  en el acto, PAUSAR serializado, lector no bloqueante sólo por `Δt` con una
  lectura en vuelo y `F_max = 1`), la secuencia (`lib/home-servir.ts`: con
  UB → UB en el acto; sin UB → un solo sueño ≤ 5,25 s, una readquisición y
  `503` + `Retry-After`; plazo absoluto desde el inicio real de la ruta;
  fondo `min(inicioFondo + 50 s, inicioRuta + 55 s)`; tras el plazo cero
  TMDB/Supabase/RENOVAR/ENFRIAR/PUBLICAR y un solo `LIBERAR` estrictamente
  antes de `maxDuration`; una composición con llamadas rechazadas por la
  pausa se cancela, nunca se enfría), `/api/health` con sólo agregados, y el
  kill switch **`TMDB_PAUSA_429=0`** (vuelve al SET NX y apaga los dos
  niveles; se aplica en el deployment siguiente). **Evidencia:** Lua
  verificado contra Upstash real en un Preview descartable (36/36; claves
  prefijadas borradas; deployments, rama y worktree eliminados;
  `docs/medidas/2026-09-18-etapa3c1-precondicion-upstash.json`); identidad
  del Home antes/después **16/16 idéntica** (JSON completo, TMDB 926 = 926
  … 1082 = 1082); umbrales del camino sano dentro (Redis +24-28 ≤ 41,
  duración −1 % mediana y +5,1 % peor repetición ≤ +10 %, publicación +1 EVAL
  porque TOMAR reemplaza al SET NX, UB −34 ms); con 429 total: **77 llamadas
  tras el primer 429 contra 858 sin pausa** (línea base 750-778), nada
  publicado ni enfriado, UB en 284 ms, sin UB `503` en 317 ms o composición
  normal tras dormir lo que resta, propagación entre procesos real (un
  proceso sin 429 propio cortado por el lector; otro pausado por TOMAR y
  compuesto después), Redis lento 10 lecturas/25 s, Redis caído: la pausa
  local rige (`503` sin componer) y 1 lectura. Suite 1868/1868, `tsc` 0,
  build fresco OK, `git diff --check` limpio. **No probado:** TMDB real (0 ×
  429 vistos en Producción: cadencia y `Retry-After` reales desconocidos);
  el corte de Vercel a `maxDuration`. **Observado y no explicado:** `DBSIZE`
  de Upstash 802 → 90 durante la primera corrida de la precondición (la ruta
  sólo borró sus 8 claves prefijadas; sin evidencia de la causa; el Preview
  usaba el Redis de Producción, §54.4). *(Histórico: la auditoría, el merge `367b765` y el deploy del 19/09 ya ocurrieron; los commits de salas citados abajo también están en `main`.)* **Siguiente paso:** auditoría de Codex sobre la rama; merge, push y
  deploy sólo con autorización del dueño; después, observación pasiva de
  `/api/health` (rollback si `pausas > 0` con `429 = 0`, o `pausados503 > 0`
  con `429 = 0`: `TMDB_PAUSA_429=0` + redeploy). 3.c.2 fuera de alcance.
  `main` local tiene además commits de otra sesión (`0c13036`, `34e4637`:
  salas compartidas, sin push) y su worktree cambios ajenos sin commitear: no
  forman parte de esta rama y no se tocaron.
- **Etapa 3.c de capacidad (#19) — diseño (informe §45 a §52, antecedente de
  la implementación §53): 3.c.1 "pausa compartida ante 429" con
  diseño corregido (§43: diez puntos; §44: tres; §45: la señal es el
  presupuesto interno; §46: un solo deadline absoluto; §47: el fondo con dos
  límites; §48: la señal limita el trabajo nuevo; §49: la limpieza
  `LIBERAR` como única excepción tras el plazo; §50: sus falsos verdes;
  §51: las renovaciones las produce el modelo; §52: envío, aplicación en
  Redis y recepción son tres instantes); diseño APROBADO por el dueño el
  18/09 e IMPLEMENTADO (ver el bloque de arriba, §53). 3.c.2 fuera de alcance.**
  **§52 (sobre `105e440`):** el modelo fijaba `venceEn = envío + 15 s`,
  pero el `PEXPIRE` del script corre cuando **Redis atiende** el comando,
  en un punto del RTT que el cliente no ve. RED ejecutado y visto fallar;
  ahora cada operación registra envío, **aplicación** y recepción, un
  `RENOVAR` aplicado vence en `aplicación + 15 s`, el cliente acota
  `[envío + 15 s, recepción + 15 s]` con respuesta recibida y **pierde la
  cota superior** con respuesta perdida (`indeterminado`: aplicada / no
  aplicada distinguidas en Redis, no desde el cliente), la vuelta
  siguiente se programa al terminar la anterior (`respuesta + 5 s`) y
  ningún `RENOVAR` se inicia en el plazo ni después (barrido de RTT
  0/140/1000/4290 ms). **Garantizado:** 15 s desde la última renovación
  **aplicada**; recuperación eventual por TTL si `LIBERAR` no se aplica;
  con respuesta indeterminada el cliente **no conoce** el restante exacto.
  **Estimación para el RTT modelado (140 ms), no cota:** restante
  **[10,60; 10,74] s** con detección a 155,1 s y **[5,60; 5,74] s** a
  160,1 s, según dónde dentro del RTT ejecute Redis; otro RTT da otro
  intervalo. Las cifras "5,6-10,6 s" de §51 quedan superadas (eran el
  extremo inferior presentado como exacto). 6 mutaciones caen. Modelo
  **97/97**, `tsc` 0 errores, `git diff --check` limpio.
  **§51 (sobre `7dc1f44`, que era el HEAD real de la rama — no `c2b72f7`
  como decía el último informe; `7dc1f44` es un commit posterior de otra
  sesión):** de los cuatro puntos de §50, el 1 (guardia real llamada dos
  veces), el 2 (perdida aplicada / no aplicada) y el 4 (borde estricto)
  resisten mutación y quedan; el **3 era un falso verde**: el modelo de
  `7dc1f44` **nunca emitía `RENOVAR`** (la aserción "ningún `RENOVAR` tras
  el plazo" era vacua), el calendario de renovaciones y `venceEn` los
  fijaba el test a mano, e incluía una renovación exactamente en el plazo.
  Ahora el modelo reproduce el bucle 4b real de `home-servir.ts` (el fondo
  pasa por `componer`): primer tick a `+5 s`, luego cada `5 s + RTT`, sólo
  con **`t < plazo`** (estricto, como el corte de `LIBERAR`), cada uno
  extiende el turno 15 s desde esa renovación; los tests **derivan** el TTL
  restante (`15 s − (detección − última renovación)`): 5,6-10,6 s en
  los casos modelados (antes se decía 4,9-14,9 s; §52 las reemplaza por intervalos); RED de borde conservado
  (`t <= plazo` → renovación en el plazo); (4) y (10) exigen `< plazo` para
  toda operación productiva. RED de vacuidad ejecutado y visto fallar sobre
  `7dc1f44`; 8 mutaciones caen (la que reproduce `7dc1f44` rompe 7 tests).
  Modelo 90/90 (§52: 97/97), `tsc --noEmit` 0 errores. Sin código productivo, merge,
  push ni deploy. **§50:** la limpieza es una función expuesta del modelo
  (`limpiarTurno`, la misma que usa `iniciarFondo`): RED sin guardia →
  dos `LIBERAR`; GREEN → uno; la respuesta perdida de `LIBERAR` tiene dos
  resultados — **aplicada** (el turno ya quedó liberado) y **no aplicada**
  (permanece hasta vencer por TTL) —, sin reintento y con fresca, UB y
  generación intactos; el TTL se modela con las renovaciones reales
  (`RENOVAR` cada 5 s extiende 15 s desde esa renovación; la señal corta las
  siguientes): si `LIBERAR` no se envía o no se aplica el turno **no** está
  vencido en el acto y se recupera **eventualmente** — demora máxima
  `TURNO_MS` = 15 s desde la última renovación exitosa; borde de
  `maxDuration` cerrado con comparación **estricta** (`ahora < inicioRuta +
  60 s`; controles a −1 ms, exacto y +1 ms; RED: con `>` salía en el
  límite). Modelo 88/88 (superado por §51/§52: 97/97).
  **§49:** "ninguna operación de Redis nueva tras el plazo" (§48) era
  falso: la composición detecta la señal unos ms después del plazo y ahí
  sale la limpieza (RED con detección a +100 ms). Criterio vigente:
  **ninguna operación productiva o de publicación** (TMDB/Supabase,
  `RENOVAR`, `ENFRIAR`, `PUBLICAR`) después del plazo efectivo; **como
  única excepción, un solo `LIBERAR` best effort**, incluso después del
  plazo, pero sólo dentro del margen externo de cierre (≤ `inicioRuta` +
  60 s); sin margen, Redis caído, fallo, respuesta perdida o corte de
  Vercel → no se insiste, el turno se recupera eventualmente por TTL
  (§50: ≤ 15 s desde la última renovación); nunca publica, enfría, renueva
  ni toca el UB; nunca más de un intento. La tabla de §47 queda rotulada
  como semántica superada ("exactamente", "turno liberado"). **§48:** `plazoEfectivo` es el
  límite para INICIAR trabajo nuevo (llamadas a TMDB/Supabase y el inicio de
  `PUBLICAR`), no una garantía de que ninguna promesa de Redis sobreviva:
  un `RENOVAR`/`PUBLICAR`/`ENFRIAR`/`LIBERAR` ya enviado completa después
  del plazo o pierde su respuesta, conservando atomicidad y fencing (el
  SDK de Redis no obedece la señal, como ya documenta `home-servir.ts`);
  si la composición cruza el plazo se cancelan las llamadas controlables y
  no se inicia `PUBLICAR`; `LIBERAR` es best effort (si falla o Vercel mata
  el proceso, el turno se recupera eventualmente por TTL); `MARGEN_CIERRE_MS = 5 s` y
  `RESERVA_PUBLICACION_MS = 1 s` (antes `PUBLICACION_MAX_MS`) son reservas
  propuestas, no máximos; un `PUBLICAR` aceptado por Redis puede publicar
  un payload completo y sano aunque se pierda la respuesta — nunca una
  escritura parcial o degradada. Modelos: publicación iniciada antes y
  completada después del plazo; respuesta de publicación perdida;
  liberación fallida con UB intacto y turno por TTL; corte duro de Vercel
  (no observable, sin afirmar liberación); tras el plazo, ninguna operación
  productiva o de publicación (§49 corrige "ninguna operación nueva"). **§47 — el fondo con dos límites absolutos:**
  `inicioFondo + 50 s` no siempre queda debajo de `maxDuration` (Vercel
  cuenta 60 s desde la solicitud): un fondo iniciado a los 15 s creería
  tener hasta t = 65 s. Contrato: `plazoInterno = inicioFondo + 50 s`,
  `plazoExterno = inicioRuta + 60 s − margen de cierre (5 s, propuesto)`,
  `plazoEfectivo = min`; al iniciar el fondo, si no quedan ≥ 16 s + 1 s
  (composición + publicación), **no se compone: el UB ya fue servido, el
  turno se libera y la métrica es `fondo: no-iniciado-presupuesto`** (el
  contenido del Home no cambia); la señal del fondo dura `plazoEfectivo −
  ahora` y no se INICIA `PUBLICAR` pasado el plazo (§48: lo ya enviado a
  Redis completa o pierde la respuesta); `inicioRuta` es el `inicio` de
  §46, tomado antes de la lectura previa. Modelo (fondo a 0,4 s: 50 s;
  a 15 s: 40 s por el externo; a 40 s: UB sin fondo; composición que cruza:
  cancelada sin publicar; lectura previa 35 s: externo desde la ruta). El
  modelo vigente de la espera sin UB usa el plazo absoluto; el cálculo con
  reloj local queda sólo como RED rotulado.
  **§46 — dos relojes:** la señal nace en `homePayload`, la lectura previa
  del caché corre después (`crearVueloHome`) y `servirConTurno` recién ahí
  fija `t0`; todo `PRESUPUESTO − (ahora − t0)` ignora lo consumido antes.
  RED: lectura previa de 35 s + pausa de 2 s → el cálculo viejo "cabe" con
  15 s reales (la composición moriría en la señal: "inalcanzable" de §45 era
  falso). Contrato: **un deadline absoluto `plazo` creado junto con la
  señal**, en el contexto hasta `servirConTurno`, y siempre `plazo − ahora`
  para el rescate de la espera compartida, la espera por pausa y el arranque
  de la composición; **el fondo con `plazoEfectivo = min(inicioFondo + 50
  s, inicioRuta + 55 s)`** (§47). Hallazgo colateral: **el rescate de la Etapa 2 hoy en
  Producción (`home-servir.ts:315`) tiene el mismo defecto** (puede empezar
  un rescate que la señal mata → vacío); no publica nada incorrecto; se
  corrige con el mismo contrato en la implementación de 3.c.1. Modelo
  65/65. Correcciones de
  §44/§45: (1) **vencimiento por presupuesto interno**, no abandono del
  cliente: la ruta no usa `req.signal` (y no se agrega: otra decisión, fuera
  de alcance); la única señal es `AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)`;
  `dormirCancelable` RESUELVE al vencer y el `catch` de la ruta convierte una
  excepción en `500` + `console.error`; semántica única: tras `dormir`, si
  venció, se devuelve el centinela 4d `vacio("cancelada")` de hoy (sin
  readquirir, sin componer, sin lanzar, sin `503`, sin error falso),
  probado con el `dormir` real y un modelo fiel del `catch`, con guard
  estructural sobre la ruta real; esa rama NO es inalcanzable (§46: la
  lectura previa consume presupuesto que el reloj local no ve) y queda
  como defensa real; (2) **UB y
  Redis caído** sin caché en memoria: `ub` es una variable por solicitud
  leída una vez en el paso 2; si Redis falla antes, es `null` aunque el UB
  exista; si falla después, se sirve lo leído (matriz completa); (3)
  **sobrepaso** parametrizado y rotulado como estimación (94 / 184 / 528
  por proceso con cadencia 35 / 80 / 252), porque la cadencia no está
  acotada por diseño — sólo `enVuelo = 24`; **línea base medida hoy** (banco,
  modo `sobrepaso`, 3 semillas): tras el primer 429 con respuestas
  inmediatas un proceso emite 750-778 llamadas más en 3,4-4,4 s, pico
  224-252 por segundo. Modelo 58/58.
  Correcciones de §43 sobre §41/§42: sin UB, **un solo sueño y una sola
  readquisición (≤ 2 `EVAL`)**, nunca un segundo sueño; el vencimiento del
  presupuesto interno sale por el centinela 4d de hoy (§44.1/§45; no es un
  `503` ni un error; la cancelación del cliente no está cableada); **la pausa local manda
  sobre Redis caído/indeterminado** (nunca se compone contra TMDB con pausa
  local vigente; sin pausa local, el degradado de hoy); el presupuesto
  previo al sueño incluye `restante + jitter máx. + timeout de la
  readquisición + 16 s`; `Retry-After` con readquisición indeterminada =
  `max(5 s, restante − dormido)`; `K = 24` se alcanza a los 686 ms a 35/s —
  se elige **sólo `Δt`** con números (27 vs 40 lecturas por frío total); la
  fórmula de sobrepaso queda parametrizada (§44.3: 94 / 184 / 528 por
  proceso según la cadencia; estimaciones, no cotas) y **sin cota compartida
  si la lectura falla** (sólo local);
  `F_max = 1` (alineado con el umbral "≤ 1 intento fallido": 2 lecturas por
  minuto con Redis colgado); marca de agua **por proceso** con `PX 24 h`
  propio (sin hash global); el Lua **valida antes de mutar** y escribe la
  pausa antes que el marcador (un fallo intermedio sobre-protege, nunca deja
  sin pausa; telemetría en `pcall`). Modelo 49/49.
  Lo que sigue vigente de §41/§42: Rama `diseno/etapa3c-proteccion-tmdb`; sin código
  productivo, variables, cachés ni Producción; sólo documentación, un test
  de diseño sobre modelo (`lib/tmdb-pausa-diseno.test.ts`, 97/97) y
  herramientas del banco. Lo vigente: (a) la comprobación de pausa va
  **dentro del script atómico de adquisición del turno** — con pausa
  preexistente: 0 llamadas, sin turno, sin fondo; con pausa aparecida
  después: **sobrepaso explícito** `≤ enVuelo + admitidas durante Δt + RTT`
  (fórmula parametrizada, §44.3; las cifras — 94 / 184 / 528 por proceso
  según cadencia 35 / 80 / 252 — son estimaciones, no cotas; sin cota
  compartida si la lectura falla; no se promete cero); (b) relectura **no
  bloqueante**, ≤ 1 en curso por proceso, una por `Δt = 1 s` desde el
  inicio, timeout 1 s, `F_max = 1` → 30 s de enfriamiento (≤ 2
  lecturas/min con Redis colgado, lento o caído; un resultado no entero es
  `indeterminado`); (c) `PAUSAR` idempotente por identidad de evento con
  marcador `PX 120 s` (2 × `maxDuration`; el SDK reintenta ≤ 6 veces dentro
  de la invocación) **y** marca de agua por proceso: un evento viejo nunca
  reabre una pausa, ni a los 130 s (marca de agua por proceso con TTL
  propio); (d) Lua completo de 5 claves con eventos y cubos por minuto
  sellados con `TIME` de Redis en el mismo script (telemetría en `pcall`,
  después de la protección); `/api/health` expone sólo agregados
  de 60 min, sin uuid, rutas ni eventos crudos; (e) Home sin UB durante la
  pausa (§42, **decisión del dueño**, reemplaza al `503` inmediato que NO
  quedó aprobado): **espera breve y acotada** = `min(restante de la pausa,
  ESPERA_MAX 5 s)` + jitter, **un solo sueño y una sola readquisición**
  (2 `EVAL` por solicitud, 0 durante el sueño), con el vencimiento del
  presupuesto interno saliendo por el centinela 4d (§44.1/§45; no hay
  cancelación del cliente cableada), condicionada a que quede presupuesto para el sueño, la
  readquisición y componer (≥ 16 s); si la pausa terminó, compone
  normalmente (una sola composición: `SET NX`); si continúa o la
  readquisición es indeterminada, **`503` + `Retry-After`** (fresco, o el
  fallback conservador de 5 s) con "No pudimos cargar el inicio" +
  Reintentar; nunca 50 s ni `200` vacío. `ESPERA_MAX = 5 s` es **propuesta
  provisional sin datos reales** (derivada de `REINTENTAR_POR_DEFECTO_MS`;
  se revisa con los cubos). Modelo con los ocho casos pedidos; (f) umbrales antes/después fijados y sin tocar (JSON 0
  diferencias, llamadas 0 diferencia, Redis extra ≤ ⌈llamadas/24⌉+2,
  duración ≤ +5 %/+10 %, publicación ≤ +1 op, UB ≤ +50 ms; 1/2/3
  reconstrucciones; Redis normal/lento/caído). **3.c.0** queda como modelo
  de sensibilidad ajustado con las mismas dos muestras de Producción (no
  predictivo; semillas y 3 repeticiones, dispersión ≤ 3 %): reproduce 926
  llamadas, `t_inicio_fondo` 0,30-0,37 s, publicación 0,13-0,15 s, ráfaga
  ~80/s por proceso y `24 × N` de concurrencia; "926 en ~26 s" es
  extrapolación NO validada; no se pide ni se autoriza ningún frío total
  en Producción. Para pasar a implementación: aceptación de §41 por Codex,
  precondición de Preview del `EVAL` (`TIME`, `cjson`, `PTTL`, tupla vía
  SDK), aprobación del dueño de los umbrales, y RED propio para
  el script de adquisición del turno (Etapa 2). Reintentos siguen apagados.
  Antecedentes superados: §38 (observación pasiva), §39 (3.c.0 y diseño),
  §40 (primera corrección) — cifras allí no vigentes.
- **Etapa 3.b de capacidad (#19): MERGEADA, PUSHEADA Y DESPLEGADA
  (2026-09-15).** Aprobada técnicamente por la auditoría final de Codex
  sobre `c5fab20` (más `ae6902f`, dos correcciones documentales: clave del
  Home `v6` y fecha canónica). Merge `--no-ff` **`5604750`** en `main`
  (rama `feat/etapa3b-ub-primero` en `ae6902f`; árbol del merge idéntico al
  de la rama); push a `origin/main`; deployment automático de Vercel
  **`dpl_A9oAnbXKBqbBTGiKC6kMMLdFz3oB`** READY, target production,
  `githubCommitSha = 5604750…`, aliasado a `app.yump.ar`. Verificado sobre
  el `main` fusionado antes del push: pruebas de frontera, fondo, servicio,
  CORS y cableado (125/125), suite **1.707 (1.697 ok, 0 fallos, 10
  omitidos)**, `tsc --noEmit`, build fresco (`6qYrjMyN9TMw0Pw6uYzlN`;
  `@vercel/functions` sólo en el bundle de `/api/home`, nada en el cliente),
  `git diff --check`. Comprobación pasiva tras el deploy (sin vaciar cachés
  ni forzar nada): `/api/health` 200 (Redis OK, 345 claves); búsqueda 200
  (24 títulos, 18 personas, sin `degradacion`); ficha 200 (Matrix, `mv,m`);
  Home 200. **El camino UB-primero apareció naturalmente en el primer Home
  tras el deploy** (la fresca de 6 h había vencido y había UB): línea
  `[home] 643ms total | cache ULTIMO-BUENO | turno adquirido | origen
  ultimo-bueno-fondo | fondo programado | tmdb 0 llamadas`, y recién
  DESPUÉS `[home] compone …`; los dos pedidos siguientes, `turno ocupado →
  ultimo-bueno` (701/735 ms); una única línea **`[home-fondo] 16682ms total
  | 1 composición | origen propia | publicacion publicado | renovaciones 3
  | tmdb 342 llamadas (342 ok)`** con la misma clave y propietario
  (`…:4:1`); el pedido siguiente `cache HIT` en 269 ms sobre la fresca
  publicada por el fondo. Sin `Task timed out`, sin `[tmdb] descarte`, sin
  errores nuevos en los logs. **Identidad del Home preservada** (banco
  16/16 `b7be927` vs rama sobre `33d2ea2`; en Producción 6 hero + 12 rieles
  + 309 títulos, `degradado: false`, `fallos: 0`). Reversión disponible sin
  código: `HOME_UB_PRIMERO=0` + redeployment (requiere autorización; no se
  usó). **#19 sigue abierto** por limitador, circuito, cadencias, pausa
  distribuida y membresía, que siguen diseñados y no aprobados.
- **Historia en rama de la 3.b (antes del merge):** IMPLEMENTADA EN RAMA
  (`feat/etapa3b-ub-primero`, `33d2ea2`) y CORREGIDA tras las auditorías de
  Codex sobre `c84996e` (informe §35) y `3a057fc` (§36). Segunda corrección (§36): abrir la compuerta en el `finally`
  del handler encolaba el fondo ANTES de que el llamador de `GET` recibiera
  la promesa (RED con el llamador real: `respuesta-construida → fondo-inicia
  → caller-recibio-response`); ahora la frontera cede al event loop
  (`setImmediate`, inyectable) y abre después: GREEN `respuesta-construida →
  caller-recibio-response → fondo-inicia`, también con dos llamadores
  concurrentes; un microtask NO alcanza (se invierte con una capa async).
  Tres niveles, cada uno con su evidencia: respuesta construida (log),
  promesa entregada al llamador (test), bytes enviados (sólo Preview:
  aislado, `dpl_BjiwdfGkHQVQ5vnSQuYHVicPRmJG`, borrado; cuerpo en 425 ms con
  3 s síncronos de fondo por delante, 3,3 s con el control de un microtask;
  `waitUntil` público sostuvo el fondo hasta +11 s). Suite 1.707 (1.697 ok,
  0 fallos, 10 omitidos), `tsc`, build fresco, `diff --check`, banco 3.b
  verde (UB presente 71 ms + fondo 5,1 s publicado; `componeAntesDeTerminal`
  0), identidad 16/16. Primera corrección (§35): el fondo esperaba un
  microtick tras registrar en `waitUntil` y `composeHome` arrancaba antes de
  que la ruta construyera su `NextResponse`; ahora espera la **compuerta**
  de la solicitud (`lib/fondo-frontera.ts`), que `conFrontera(conCors(manejar,
  "GET"))` abre con la respuesta construida (cabeceras incluidas) y —desde
  §36— sólo tras ceder al event loop; sin frontera no hay fondo (bloqueante). RED contra `c84996e`
  atravesando una frontera equivalente al handler (traza: la composición
  terminaba antes de la respuesta); GREEN con el orden completo, banco con
  `componeAntesDeTerminal = 0` en la rama (1 en el antes), suite 1.701
  (1.691 ok, 0 fallos, 10 omitidos), `tsc`, build fresco, identidad 16/16.
  **En Producción (`903832e`) el líder con UB todavía compone en línea y no
  hay `waitUntil`; en la rama, no.** (Lo que sigue describe la
  implementación de `c84996e`.) Con UB, el líder
  responde el UB en el acto y compone en fondo con `waitUntil` de
  `@vercel/functions` 3.9.7 (única importación, en `lib/home.ts`; el símbolo
  interno queda prohibido por test); `lib/home-fondo.ts` (puro) registra de
  forma perezosa (kill switch `HOME_UB_PRIMERO=0` y `VERCEL=1` antes de
  iniciar; un registro que lanza deja el camino bloqueante, sin huérfanas ni
  duplicados; la tarea siempre resuelve); el fondo corre con sus propios
  contextos y termina en `[home-fondo]` correlacionada por clave y
  propietario, con `[home]` congelada; sin UB, sin fondo o con el kill
  switch: exactamente el camino de hoy. TDD contra `903832e` (RED
  `cdd4ab8`); suite 1.691 (1.681 ok, 0 fallos, 10 omitidos); `tsc`; build
  fresco; `diff --check`; banco 3.b verde (UB presente: antes 5,6 s en
  línea, rama 111 ms + fondo publicado 5,4 s, fresca idéntica; concurrentes
  23/23 ms; sin UB igual; degradado, 5xx total y cancelado en fondo con UB
  intacto por sha1; kill switch y sin fondo iguales al antes); identidad del
  Home 16/16; bundle: nada del paquete llega al cliente ni `jose`/`execa`
  al servidor; gate del Preview con la API pública (20 y 50 s completos,
  corte a 60 s, dos concurrentes) borrado al terminar. Reintentos siguen
  apagados; limitador, circuito, `waitUntil` fuera del Home y membresía NO
  implementados. Diseño previo: Revisión: la implementación usará
  `waitUntil` de `@vercel/functions` (API pública para Next 14.2; el
  símbolo interno del runtime queda prohibido por test; gate de
  instalación, tipado, build y Preview); interfaz perezosa
  `programarEnFondo(iniciar)` que comprueba kill switch y contexto antes de
  iniciar, con una sola composición y camino bloqueante exacto si el fondo
  no está o el registro lanza; contextos propios del fondo (métricas,
  idioma, ejes, señal) con línea `[home-fondo]` separada y correlacionada
  por clave + propietario, `[home]` congelada al responder; "fondo muerto"
  no es métrica (sólo se comprueba el turno vencido); promesa de fondo que
  siempre resuelve, fencing/ENFRIAR/publicación sana conservados, UB
  intacto ante el corte de Vercel; kill switch `HOME_UB_PRIMERO=0` como
  reversión sin código aplicada con el siguiente deployment. Trece criterios
  RED→GREEN en §33.7, identidad del Home 16/16 incluida.
  Diseño previo (§32): Causa comprobada de los
  15,1 s observados tras el deploy de la 3.a: la clave fresca lleva la
  semilla del día, así que cada combinación empieza cada día sin fresca; y en
  `servirConTurno` de `903832e` **quien adquiere el turno compone en línea
  aunque exista un último bueno** (el UB sólo va a los que no son líderes) —
  comportamiento ANTERIOR a la 3.b, el que está en Producción; el líder corre
  bajo 50 s (`PRESUPUESTO_REQUEST_MS`), no bajo los 16 s de
  `COMPOSICION_MAX_MS`. Ni Redis ni TMDB estaban degradados (250/250 ok). Si
  existía UB en ese instante no es verificable hoy (la línea `[home]` no lo
  imprime; no hace falta para la causa). `waitUntil` **comprobado en un
  Preview aislado** (Fluid, Hobby): tareas de 20 y 50 s completan; a los
  **60 s desde el inicio de la solicitud** el proceso se mata (`Task timed
  out`) aunque la respuesta ya salió; sin `waitUntil`, la tarea muere con la
  respuesta. Recomendación: servir el UB en el acto al líder y componer en
  fondo; sin UB, igual que hoy; kill switch `HOME_UB_PRIMERO=0`; ningún
  limitador/reintento/circuito antes (hoy alargarían la espera sin
  alternativa). Necesita autorización del dueño (§32.12). Sin código, sin
  variables, sin infraestructura; los dos Previews de la sonda se borraron.
- **Etapa 3.a de capacidad (#19): MERGEADA, PUSHEADA Y DESPLEGADA
  (2026-09-15).** Merge `--no-ff` `7b2fc8f` en `main` (rama
  `feat/etapa3a-clasificacion-tmdb` en `858f73e`, aprobada técnicamente por la
  auditoría final de Codex sobre `8177d2a` tras ocho correcciones); push a
  `origin/main`; deployment de Vercel `dpl_2GLbFXDt4271mS5wTo7MegkN6bnn`
  READY, target production, `githubCommitSha = 7b2fc8f…`, aliasado a
  `app.yump.ar`. Comprobación pasiva tras el deploy: `/api/health` 200
  (Redis OK, 744 claves); Home frío 200 en 15,1 s (250 llamadas a TMDB, 250
  ok, 0 fallos, publicado, `degradado: false`, 6 hero + 12 rieles + 309
  títulos) y caliente 200 en 0,8 s (HIT); búsqueda 200 (24 títulos, 18
  personas, sin `degradacion`); ficha 200; sin líneas `[tmdb] descarte` ni
  errores nuevos en los logs. **Identidad del Home preservada según la
  evidencia existente** (banco de cachés aisladas `b7be927` vs rama: 16/16
  válidos e idénticos; búsqueda 15/15) — no se reabrió. **Reintentos siguen
  APAGADOS** (`TMDB_REINTENTOS` ausente en Producción). **Limitador,
  circuito y membresía siguen NO implementados** (subetapas restantes de la
  Etapa 3, diseñadas y no aprobadas); **`waitUntil` no está en Producción**
  (sí en la rama de la 3.b, sólo para el fondo del Home). **#19 sigue abierto por
  esas subetapas, no por la 3.a.** Sin cambios de variables ni de
  infraestructura; sin 429 provocados ni cachés externas vaciadas.
  Verificado sobre el `main` fusionado: árbol idéntico al de la rama;
  inventario 21/21; suite 1.666 (1.656 ok, 0 fallos, 10 omitidos); `tsc`;
  build fresco (`BUILD_ID SDIx8lZebm-0fD5lIV0jY`); `git diff --check`; los
  tres JSON de evidencia con los mismos blobs que en la rama.
  Lo que sigue es la historia de la rama antes del merge.
- **Etapa 3.a de capacidad (#19), historia en rama: IMPLEMENTADA y CORREGIDA
  OCHO VECES (auditorías de Codex sobre `e930a1d`, `09b9dbe`, `708bce0`,
  `03ad4b9`, `6ef35c5`, `c6b299e`, `37f1ca1` y `2886212`); reintentos
  APAGADOS; limitador, circuito, `waitUntil` y membresía NO implementados.**
  **Octava corrección (informe §30, sólo el test):** el detector de acceso
  por miembro exigía la llamada inmediata, así que `const traer =
  api.candidatosDePools; traer(…)` (barrel + namespace) escapaba (RED: siete
  fuentes inyectadas —una es el `barrel.ts` que prepara el escenario— que
  contienen seis casos de acceso por miembro, variable y valor para las tres
  funciones; los seis escapaban con el detector anterior y ahora son
  rechazados). Ahora un `.`
  seguido del nombre exacto se rechaza con o sin `(`; el acceso computado y
  `require()` siguen como limitaciones documentadas; el repo real conserva
  nueve llamadas canónicas y cero alternativas. Verificado: suite 1.666
  (1.656 ok, 0 fallos, 10 omitidos), `tsc`, build fresco, `diff --check`;
  evidencias intactas byte a byte.
  **Séptima corrección (informe §29, sólo el test):** el barrido de call sites
  sólo miraba `lib/*.ts` y `app/api/**/route.ts` con el nombre canónico (una
  llamada en `lib/sub/`, en un archivo servidor de `app/`, o por alias/namespace
  escapaba: demostrado contra `37f1ca1`). Ahora el descubrimiento es una
  función pura probable con fuentes inyectados, recorre recursivamente `lib/`,
  `app/`, `components/`, `hooks/` y `supabase/` (sin tests, `.d.ts`,
  `node_modules`, `.next`, `scripts/`), detecta toda llamada directa canónica y
  RECHAZA alias, namespace, import dinámico, acceso por miembro, renombre y
  referencia sin llamar; no es un parser (un string con el nombre cuenta;
  acceso computado y `require` no se reconocen). Cobertura de los nueve
  recorridos en una sola categoría cada uno, verificada en el test: 2
  identificadas, 4 agregadas, 3 estructurales, 0 inferidas (las rutas
  `/api/recomendaciones` y `/api/audience` quedan inferidas aparte).
  Verificado: suite 1.665 (1.655 ok, 0 fallos, 10 omitidos), `tsc`, build
  fresco, `diff --check`; evidencias del Home y del banco intactas byte a
  byte.
  **Sexta corrección (informe §28, sin código productivo):** los "dos
  recorridos" de la quinta no eran todos: faltaban, al menos, la página extra
  de un riel (rama `opts.ejeFijo`, directa dentro del bloque de ejes), las
  páginas de audiencia y el hero (con esas llamadas cortadas, el inventario de
  `c6b299e` seguía 14/14 verde). Ahora hay un inventario verificable de los
  nueve call sites productivos de `candidatosDePools` / `candidatosConEje` /
  `categoryCandidates` (consumidor, condición, contexto, llegada del
  descarte, cobertura; un call site nuevo sin clasificar hace fallar el
  test), la fila de pools declara nueve recorridos desde `composeHome` con
  controles mutados independientes por tipo de rama, y el banco fuerza la
  página extra y la identifica por sus parámetros (con ejes: 3 rechazadas = 3
  descartes; sin ejes: 3 = 3; degradado y sin publicar; `b7be927` rojo).
  Cobertura (recontada en la séptima corrección): 2 recorridos identificados,
  4 ejecutados sólo en agregado, 3 estructurales, 0 inferidos; las rutas
  `/api/recomendaciones` y `/api/audience` sólo inferidas (registran fuera de
  contexto; envolverlas es un cambio productivo pendiente). Verificado: suite 1.660 (1.650 ok, 0
  fallos, 10 omitidos), `tsc`, build fresco, `diff --check`; identidad del
  Home 16/16.
  **Quinta corrección (informe §27, sin código productivo):** la fila de
  pools exigía un solo recorrido y no representaba el segundo, deliberado:
  con `EJES_RIELES=0` `candidatosDeSuperficie` llama a `candidatosDePools`
  directo (con esa llamada cortada, el inventario de `6ef35c5` seguía 14/14
  verde). Ahora la fila declara los dos recorridos (`con-ejes` por
  `candidatosConEje` dentro del bloque de ejes; `sin-ejes` por la llamada
  directa fuera de ese bloque), los dos arrancan en `composeHome` bajo el
  contexto de `producirHome` y terminan en el mismo sitio; controles mutados
  cortan cada recorrido por separado y el común. El banco de 429 parcial
  corre el escenario de pools con `EJES_RIELES` encendido y en 0 (dos `next
  start` por versión, cachés vaciadas por corrida): `b7be927` rojo en los dos
  (8/7 × 429 tragados y publicados), la rama verde en los dos (degradado,
  descartes contados, sin publicar). `POOL_CACHE=0` no alcanza este sitio y
  queda documentado fuera del recorrido. Verificado: suite 1.659 (1.649 ok, 0
  fallos, 10 omitidos), `tsc`, build fresco, `diff --check`; identidad del
  Home 16/16.
  **Cuarta corrección (informe §26, sólo el test del inventario):** la fila de
  pools declaraba únicamente la función del sitio, así que el wrapper y el
  sitio se verificaban por separado y la cadena real `composeHome →
  candidatosDeSuperficie → candidatosConEje → candidatosDePools` no se
  probaba (demostrado: con cada enlace cortado en el fuente, el inventario
  de `03ad4b9` seguía 13/13 verde). Ahora la cadena tiene que arrancar en la
  operación envuelta y llegar al sitio enlace por enlace, cruzando archivos;
  un control muta el fuente real y exige el mensaje con el enlace perdido; el
  banco queda como evidencia adicional; los números de línea de los controles
  salen de `lineaDelCatch` (base 1). Verificado: suite 1.659 (1.649 ok, 0
  fallos, 10 omitidos), `tsc`, build fresco, `diff --check`; identidad del
  Home 16/16; sin cambios en archivos productivos ni en el contrato JSON.
  **Tercera corrección (informe §25):** (1) quedaba una carrera REAL entre el
  `onChange` (sólo `setQ`) y el `useEffect` que llamaba al controlador: una
  respuesta vieja que llegara en ese render se pintaba sobre el texto nuevo.
  Adaptador puro (`components/busqueda-adaptador.ts`) que modela las dos
  fases de React —`escribir` en el evento, `efecto` en el efecto, sin
  programar B dos veces— cableado en `SearchView` con guard de fuente que
  prohíbe volver al `onChange` limitado a `setQ`; el fetch que ignora la señal
  igual se descarta por generación. (2) El inventario de descartes tenía
  falsos verdes (demostrado: con el wrapper corrido, la card sin contexto y la
  cadena del cron cortada seguía 5/5 verde): ahora cada sitio trae evidencia
  ejecutada (9 sitios corren con su dependencia caída y el consumidor actúa;
  control: fuera de contexto, la línea con su nombre), estructural con
  cadena de llamadas por cuerpo de función y controles mutados (8 sitios
  `server-only`), y de banco (escenario D nuevo: 429 parcial en `/discover`
  → pools; `b7be927` lo tragaba y publicaba, la rama degrada y no publica).
  Verificado: suite 1.658 (1.648 ok, 0 fallos, 10 omitidos), `tsc`, build
  fresco, `diff --check`; identidad del Home 16/16; búsqueda 15/15; 429
  parcial RED/GREEN. **Segunda corrección (informe §24):** (1) la
  carrera del debounce de la búsqueda —la generación subía recién dentro del
  temporizador y una respuesta vieja que llegaba en esa ventana se aceptaba—
  reproducida con un controlador puro probado con reloj y fetch inyectados
  (`components/busqueda-controlador.ts`): la invalidación ocurre al cambiar el
  término, y cubre cambios consecutivos, término corto, desmontaje y cambio de
  plataformas; (2) `registrarDescarteTmdb` era inerte fuera de contexto: ahora
  dice qué hizo (`contado` / `logueado` con una línea estructurada / `ignorado`),
  las cinco rutas independientes (directores, portadas, top, cron de Netflix,
  recordatorio) abren `conDescartesRegistrados` y resumen en una línea, y el
  inventario exige un efecto verificable por sitio. Nuevo comparador
  antes/después de la **búsqueda sana** con cachés aisladas: 15/15 idénticos.
  Verificado: suite 1.637 (1.627 ok, 0 fallos, 10 omitidos), `tsc`, build
  fresco, `diff --check`; identidad del Home 16/16; 429 parcial RED/GREEN. Rama `feat/etapa3a-clasificacion-tmdb` (worktree
  `wt-etapa3a`), creada desde `main` = `origin/main` = `b7be927`; commits
  `dedee6a` (código + tests), `b7a4a6a` (banco y evidencia), `e930a1d` (docs)
  y los de la corrección (código y docs; ver el informe §23). **Corrección
  (informe §23):** cuatro hallazgos reproducidos con pruebas funcionales que
  fallan contra `e930a1d` — (1) `directorCards` registraba fuera de contexto y
  cacheaba la lista parcial 24 h; (2) la búsqueda, tras tolerar un fallo de
  `providersOf`, volvía a pedirlo en la deduplicación y un 429 persistente la
  convertía en 503; (3) `genreCovers` tragaba el fallo y cacheaba el mapa
  incompleto 24 h; (4) `SearchView` conservaba el aviso de TMDB tras un fallo
  de red, una cancelación o un cambio de término — y un **barrido completo**
  (`lib/descartes-tmdb-inventario.test.ts`) de todo `catch`/`allSettled` en
  `lib/` y rutas, clasificado, que encontró tres sitios más para registrar
  (`disponibilidad`, `netflix-resolver`, `recordatorio`) y reemplaza al
  inventario "de once". Verificado: suite 1.621 (1.611 ok, 0 fallos, 10
  omitidos), `tsc`, build fresco, `diff --check`; banco de identidad del Home
  con cachés separadas 16/16 idénticos; banco de 429 parcial con búsqueda
  (`b7be927` → 500; rama → 200 degradado sin guardar, y 503 con `Retry-After`
  ante 429 total). **Sin merge, push ni deploy; sin
  TMDB real ni credenciales productivas.** Qué trae: clasificación de
  respuestas de TMDB por causa (429, 5xx, 4xx, red, timeout, cuerpo inválido,
  cancelación), parser de `Retry-After`, política y bucle de reintentos
  **presentes y apagados** (`TMDB_REINTENTOS` sólo "1" enciende; apagado, un
  intento por llamada y ninguna espera — control fijado por test), causas
  propagadas por los once sitios inventariados, **H2 corregido** (un descarte
  parcial de causa TMDB marca el Home como degradado y no se publica como
  fresca ni como último bueno), `titleCard` no guarda `null` por un fallo de
  TMDB, ficha y búsqueda distinguen dato principal (`503` + `Retry-After`, o
  `404`) de contenido opcional (`degradacion`, aditivo), métricas nuevas. RED
  contra `b7be927`: 18 de 21 casos fallan (los 3 que pasan son controles del
  comportamiento actual). GREEN: suite 1.602 (1.592 ok, 0 fallos, 10
  omitidos), `tsc` limpio, build fresco exit 0, `diff --check` limpio.
  **Banco de identidad del Home con cachés aisladas** (dos juegos de dobles y
  dos `next start`, Redis vaciado por corrida, `compone` + MISS + TMDB iguales
  exigidos en las dos versiones, `VERSION_HOME` 6 en ambas): **16/16
  escenarios válidos e idénticos** —5 combinaciones × 3 toggles, frío y
  caliente, más 3 claves concurrentes—, JSON completo y por riel (ids, orden,
  cantidad, plataformas: 0 diferencias); los cuatro controles de mutación
  hacen fallar al comparador y la corrida con caché compartida es rechazada.
  **Banco de 429 parcial (10 % de `watch/providers`):** `b7be927` publica un
  Home con 93 descartes como sano y, con UB, lo pisa (RED); la rama lo marca
  degradado, no lo publica y sirve el UB correcto (GREEN). Evidencia:
  `medidas/2026-09-14-etapa3a-identidad-home.json`,
  `medidas/2026-09-14-etapa3a-parcial.json`; detalle en el informe §22.
  Corrección a la v2: un 429 en `enNetflixAR` no persistía un "no está" sino
  una fila sin resolver (`needs_review`).

- **Diseño de la Etapa 3 (v4.1) — HISTÓRICO: después se aprobaron, mergearon
  y desplegaron 3.a, 3.b y 3.c.1; lo no implementado está en el resumen
  vigente.** *Texto original:* pendiente de auditoría; sólo 3.a
  aprobada. Restricción del dueño (14/09): la Etapa 3 no puede alterar el
  contenido correcto del Home.** Rama de documentación
  `diseno/etapa3-resistencia-tmdb` (worktree `wt-etapa3`): v1 `a15b650` → v2
  `209bda1` → v3 `ced36de` → v4 `d76f0ce` → v4.1 `0d06826` (cuatro
  correcciones de la auditoría sobre la v4: reconstrucción fría bajo tráfico
  sostenido y condición del futuro limitador; aislamiento total de cachés en
  el comparador; Redis lento sostenido; garantías por cadencia física y total,
  no por clase). El informe vigente es el de la rama de implementación (misma
  v4.1 + §22). Informe único:
  [`medidas/2026-09-14-etapa3-diseno-resistencia-tmdb.md`](medidas/2026-09-14-etapa3-diseno-resistencia-tmdb.md).
  **La restricción, como criterio bloqueante (informe §1):** con TMDB sano,
  cualquier implementación conserva hero, títulos, orden, cantidad, dedup,
  plataformas, badges, enlaces, toggles, contenido por fecha/plataformas/tipos
  y contrato JSON (salvo campos aditivos de diagnóstico); ante una caída se
  prefiere el último Home correcto. **Consecuencias:** la membresía por pool
  (A) **no está aprobada** y la medición pasa a ser un **gate de descarte con
  criterio de diferencia cero** (ids, orden, cantidad, plataformas, badges,
  disponibilidad, por riel y hero); A' sólo si preserva exactamente títulos,
  orden y disponibilidad; si no, ambas se descartan y la capacidad se
  resuelve **sin tocar la lógica del Home**. H16 corregido: el margen del 40 %
  prueba que el código contempla descartes posibles, **no su frecuencia, que
  sigue desconocida**. Banco obligatorio de diferencia cero (§14: mismo
  snapshot, misma fecha AR, mismas plataformas y toggles, frío/caliente,
  individual/concurrente, comparación estructural completa, control que hace
  fallar al comparador con cuatro mutaciones, kill switch sin migraciones,
  `VERSION_HOME` sin subir). **Correcciones a la v3 (auditoría de Codex):** la
  cota de ventana móvil sobre inicios de `fetch` **era falsa con latencias de
  Redis distintas por proceso**; ahora el contrato tiene dos niveles —
  **demostrado sobre reservas** (≤ 28/s, ≤ 4 por 100 ms, exacto en el reloj de
  Redis) y **demostrado sobre `fetch` sólo bajo `RTT ≤ 250 ms` verificado por
  reserva** (ranuras absolutas con vencimiento: se queman las que llegan
  tarde; ≤ 36 por segundo móvil, ≤ 12 por 100 ms) — y se **mide** en
  E-latencia-asimetrica (5/30/150/300 ms, tres instantes por reserva); cinco
  alternativas comparadas (el único límite estricto sería un coordinador
  único, fuera de alcance); tasa declarada **28/s**; **dos cadencias por clase
  (14/s cada una) con préstamo sólo si la ajena está ociosa** → equidad global
  demostrable (ninguna clase por debajo de 14/s, primera ranura ≤ 321 ms,
  inanición imposible), reemplazando el horizonte que podía dejar al Home sin
  ranuras; las tres esperas de una ficha separadas; modelo de **tráfico
  mixto** (`s_m = tasa − min(λ_i, tasa/2)`): con C = 926 sin reducción, un
  Home frío sólo se reconstruye a tiempo en fondo y con poca competencia, y
  bajo carga mixta sostenida **sirve UB hasta que baje la carga**. Orden de
  despliegue: 3.a (reintentos OFF) → 3.b → 3.e (`waitUntil`) → 3.c
  (limitador) → 3.c' (reintentos ON); 3.d sólo si el gate da cero. **Alcance
  del cierre:** la aplicación en Vercel, con Redis respondiendo; no la cuenta
  entera ni Redis caído. **Nada de esto cambia el comportamiento desplegado.**
  No implementar nada hasta una nueva auditoría de Codex.

- **Recuperación de contraseña (#22) — estado vigente.**
  1. La corrección está **mergeada en `main`** mediante `be5ef1d` (rama
     `fix/recuperacion-password`, commits `fb89b45` → `0831b86` → `0d1b978` →
     `de45b56`).
  2. **Pusheada y desplegada.** `adf7065` está en `origin/main` y es el
     deployment de Producción de Vercel del 11/09 (17:31Z, `success`);
     `app.yump.ar` sirve la página nueva de recuperación — comprobado contra los
     bytes: el HTML de `/cuenta/reset` dice "Cargando…" y los chunks traen
     `PASSWORD_RECOVERY`, el cliente aislado y el reductor. **Sigue pendiente
     la prueba real del dueño por correo** en Producción, que el buzón
     descartable no reemplaza.
  3. La implementación fue **auditada** (cuatro rondas de Codex; la última,
     sobre `de45b56`, sin nuevos bloqueos técnicos y apta para mergear) y
     **verificada**: unitarios escritos antes de cada cambio, navegador sobre
     build de producción con cuentas de prueba borradas, recorrido con correo
     real, `npm test` 1337/1347 (10 omitidos), `tsc` limpio, `npm run build`
     exit 0. Lo que quedó: la única prueba de recuperación es el evento
     `PASSWORD_RECOVERY`; la escritura va atada a esos tokens en un cliente
     aislado; la aceptación es una autorización pendiente → reclamada por una
     sola instancia de la pantalla, sólo si la ruta real es `/cuenta/reset`.
     Informe completo:
     [`medidas/2026-09-10-recuperacion-password.md`](medidas/2026-09-10-recuperacion-password.md).
  4. **#22 permanece abierto exclusivamente porque no se conoce qué consumió el
     enlace original del dueño**: no demostrado ni descartado. El bloqueo es de
     acceso a logs y configuración de Auth (Management API `401`, MCP
     `Unauthorized`). La reproducción A/B es una causa posible compatible con
     los síntomas, no la causa histórica probada.
  5. **Prioridad actual: media.**
  6. **Capacidad, App Links, Capacitor y Play Store son temas separados** y no
     forman parte del #22.
  7. El rechazo de `fb89b45` y los diagnósticos previos al arreglo están al
     final de este bloque como **antecedentes históricos**, no como estado.

- **Etapa PREVIA de capacidad (#21): implementada, mergeada, pusheada y
  DESPLEGADA. #21 resuelto en el alcance aprobado.** Merge `3ad935d` (rama
  `fix/cache-escritura-no-rompe`, auditada por Codex en `f8f42a5`), en
  `origin/main` y en Producción: deployment de Vercel `success` para `548ffb6`,
  y `app.yump.ar` aliasado a ese deployment (`vercel inspect`). Verificado
  desde cero sobre el `main` mergeado: específicos 18/18, suite 1355/1365 (0
  fallos, 10 omitidos), `tsc` limpio, build fresco exit 0. **Comprobado: el
  comportamiento del resolver** (siete escenarios con control y guards que atan
  producción). **Inferido: el HTTP 200**, del handler; no se provocó una caída
  real de Redis. **Esto no agrega capacidad, single-flight, bloqueo ni CDN:**
  únicamente evita perder un payload válido cuando falla su escritura. El #21
  se retiró de `ISSUES.md`; su detalle vive en la Etapa PREVIA del informe
  (`medidas/2026-09-10-capacidad-trafico.md` §9).

- **Etapa 0 de capacidad (#20, "poder medir"): MERGEADA en `main` (`1073c70`,
  rama `feat/etapa0-medir` = `81aa8fe`, auditoría final de Codex sin hallazgos
  pendientes), PUSHEADA (`9a4b7aa`) y DESPLEGADA.** Deployment de Producción
  de Vercel para `9a4b7aa` con estado `success` (22:41:17Z); `vercel inspect
  app.yump.ar` → aliasado a ese deployment (`streamingcentral-9dr90g2be…`, `●
  Ready`); `/api/health` 200 con Redis `ping ok`; la página carga (200) y
  `/api/home` responde 200 con hero y 12 rieles. **Comprobación pasiva de
  logs (una solicitud normal, sin carga ni caídas provocadas):** en `vercel
  logs` del deployment aparecen `[home] pedido <clave>` y la línea terminal con
  las unidades separadas y `| clave …`. Primera lectura real, de UNA
  solicitud: un MISS de `d,m,n` costó 24 TMDB / 10 Supabase / Redis 67
  llamadas = 67 intentos = 67 comandos, 566 claves (537 hit), 4,05 s; un HIT
  con toggles, 1 MGET y 270 ms. Es una foto, no una serie. **La observación
  real sigue INCOMPLETA:** los logs se leyeron en vivo (`vercel logs` en
  streaming); no hay serie histórica ni tasa de aciertos acumulada — eso es la
  Etapa 5 y por eso #20 sigue abierto. Verificado sobre el `main`
  mergeado, desde cero: específicos 20/20 + 6/6 + 18/18 + 18/18, suite
  1399/1409 (0 fallos, 10 omitidos), `tsc` limpio, build fresco exit 0 en 2 min
  54 s (`BUILD_ID sjAjjCkyfoitMaI678TWp`, `.next` borrado antes y sin otro Next
  compartiéndolo), `git diff --check` limpio. **Aporta medición; no agrega
  capacidad, single-flight, bloqueo distribuido, último Home bueno, CDN ni
  límites por ruta.** La
  primera auditoría (sobre `ceeed75`) no encontró bloqueos en la
  instrumentación pero sí en el banco: dos escenarios solapados y una
  coincidencia app ↔ dobles afirmada sin verificar. Corregido en la segunda
  versión (informe §7.5): el corredor ya no empieza un escenario con trabajo
  vivo en Next (reinicia y lo demuestra), atribuye cada línea por clave, valida
  automáticamente las cuatro igualdades por escenario y termina con código 1 si
  algo no cierra; la línea base se repitió entera y es válida. Métricas
  por solicitud en `lib/metricas.ts` con unidades separadas: composiciones del
  Home contadas donde corren (no deducidas del MISS), espera compartida como
  campo propio (durante la Etapa 0 valía 0; desde la Etapa 1 vale 1 en cada
  seguidor del single-flight del Home), TMDB y Supabase por separado, y Redis en llamadas
  lógicas / intentos HTTP / comandos (los reintentos del SDK se cuentan en su
  `backoff`, cotejados con el doble en la recuperación controlada: 1.655
  intentos = 1.655, 921 comandos = 921). Base de TMDB
  configurable sólo con `YUMP_BANCO=1` y nunca en `VERCEL_ENV=production`,
  ejecutado. Banco aislado (`scripts/banco/`) con tres dobles locales y una
  línea base de 23 escenarios totales: 22 completos y 1 incompleto declarado.
  **Primer número real:** un Home frío de `n,d,m` en el banco = 926 TMDB / 4
  Supabase / 993-993-993 Redis. Dos hechos medidos que no son de esta etapa
  arreglar: con Redis cortando el socket de forma sostenida, un Home frío no
  completó en 60 s (en Vercel sería 504: inferido, no medido); con Supabase
  inalcanzable el Home no se marca degradado y se guarda 6 h (bajo las
  condiciones del banco). 44 tests nuevos escritos antes del código; suite
  1399/1409 (0 fallos, 10 omitidos); `tsc` limpio; build fresco exit 0. **#20 sigue abierto**: falta la lectura de la
  tasa de aciertos de Producción sin depender de los logs (Etapa 5). **Nada del
  banco es capacidad de Producción.** Informe:
  [`medidas/2026-09-11-etapa0-medir.md`](medidas/2026-09-11-etapa0-medir.md).
  **#20 no se cierra por el deploy:**
  "instrumentación implementada y desplegada" está hecho; "observación real
  disponible" sólo en vivo y a mano (`vercel logs`), sin serie histórica.

- **Etapa 1 de capacidad (#18 canonización, #17 single-flight acotado al
  Home): MERGEADA en `main` (`e4bf75a`, rama `feat/etapa1-canonizar-single-flight`
  = `af8d7c6`, auditoría final de Codex sin nuevos hallazgos), PUSHEADA
  (`f76d9ca`) y DESPLEGADA.** Deployment de Producción `success` para
  `f76d9ca`; `app.yump.ar` aliasado a él (`vercel inspect`); `/api/health` 200;
  la Home carga; `?providers=N,D,M&t=accion:movie` devuelve el mismo Home que
  `n,d,m` (comprobación pasiva). **#18 resuelto y retirado de `ISSUES.md`** (su
  texto quedó en el informe, §10). **#17 quedó abierto en ese momento** por la
  coordinación entre instancias y el último Home bueno, que resolvió la Etapa
  2 el 13/09 (ver arriba). #20 sigue abierto por la
  observabilidad histórica. Verificado sobre el `main` mergeado, desde cero:
  específicos 27/27 + 12/12 + 6/6 + 19/19 + 20/20 + 18/18, suite 1445/1455 (0
  fallos, 10 omitidos), `tsc` limpio, build fresco exit 0 en 3 min 26 s
  (`BUILD_ID 6-g4NRsNXohqO72t7qKkw`, sólo el `.next` de este checkout borrado,
  sin otro Next usándolo), `git diff --check` limpio. `providers` se canoniza en
  `homePayload` (minúsculas → catálogo → deduplicar → ordenar → tope = tamaño
  del catálogo) y la lista canónica va a la clave Y al contenido; `t` sólo
  admite rieles de `TOGGLE_KEYS` y tipos válidos, última ocurrencia gana, y va
  en forma mínima: `t` ausente, `t=accion:movie` y las siete claves en default
  del cliente son la misma clave. `q` se trunca a 120 (el título más largo del
  pool curado mide 91) e `items` de `/api/upcoming` a 100 (el tope que el
  handler ya aplicaba a `limit`; ninguna vista lo manda hoy). El vuelo
  compartido vive sólo en `homePayload` (`lib/home-vuelo.ts`): lectura previa,
  y si no está, `crearSingleFlight` por clave con `cachedLocIf` entero como
  resolución (así está en `main`; en la rama de la Etapa 2 la resolución del
  líder pasa a `servirConTurno`); el líder cuenta la composición, los seguidores `cache =
  "compartida"` y `esperasCompartidas`. **Banco, antes → después:** 100
  solicitudes simultáneas con caché fría pasan de **100 composiciones, 91.106
  TMDB, 97.548 Redis y 162 s** a **1 composición + 99 esperas, 926 TMDB, 1.093
  Redis y 2,7 s**; `N,D,M`, duplicados, códigos inexistentes, `t` por defecto y
  rieles desconocidos son HIT de la clave de `n,d,m` sin tocar TMDB ni Supabase;
  `n` / `n,d` / `d,m` siguen siendo tres Homes; `zzz` no consulta a nadie.
  Corrida VÁLIDA (40 escenarios, 39 completos, 1 incompleto declarado).
  Cifras vigentes (sobre el `main` mergeado, `e4bf75a`): **suite 1455 tests,
  1445 aprobados, 0 fallos, 10 omitidos**; `tsc` limpio; build fresco exit 0.
  (Las cifras de la rama antes de `af8d7c6` —1439/1449, 40 tests nuevos— son
  antecedente y ya no describen el estado.) **Sólo por proceso:** entre
  instancias de Vercel no coordina nada — eso, y el último Home bueno, son la
  Etapa 2. **#18 resuelto el 12/09; #17 resuelto el 13/09 con la Etapa 2.** Informe:
  [`medidas/2026-09-11-etapa1-canonizar-single-flight.md`](medidas/2026-09-11-etapa1-canonizar-single-flight.md).
  Etapa 3 *(histórico; hoy: 3.a, 3.b y 3.c.1 desplegadas, ver el resumen
  vigente)*: 3.a implementada en rama (pendiente de auditoría, reintentos
  apagados); diseño v4.1 pendiente de auditoría para el resto; restricción del
  dueño: no puede alterar el contenido correcto del Home (ver arriba). Etapas
  4 y 5: no iniciadas.

- **Etapa 2 de capacidad (#17: turno distribuido entre instancias y último
  Home bueno): MERGEADA EN `main` (`cd1f393`, `--no-ff` de
  `feat/etapa2-turno-ultimo-bueno` = `87c0c6f`, fork `8dfa49b`), PUSHEADA
  (`c7a3ce1`) y DESPLEGADA el 13/09.** Deployment de Producción `success` para
  `c7a3ce1`; `app.yump.ar` aliasado a `streamingcentral-3s6aqw73w…`;
  `/api/health` 200 con `ping ok`; la Home 200; `/api/home?providers=n,d,m`
  200 (6 hero, 12 rieles, no degradado) y la equivalente `N,D,M&t=accion:movie`
  con el mismo hero (misma clave canónica). En los logs reales: el primer MISS
  tras el deploy con `turno adquirido | origen propia | publicacion publicado`
  y el propietario con el UUID completo; una combinación fría con
  `renovaciones 1`; los HIT en 230 ms con 1 comando; dos instancias distintas
  de Vercel publicando por el camino nuevo. **No se observó** coordinación
  entre instancias reales (`esperada`/`ultimo-bueno`): exige solicitudes
  frías simultáneas o una fresca vencida, que no ocurrieron ni se provocan;
  está comprobada en el banco multiproceso. **#17 resuelto y retirado de
  `ISSUES.md`** (texto en el informe, §18); **#20 sigue abierto** por la
  observabilidad histórica. Auditoría final de Codex sin hallazgos bloqueantes (166
  pruebas específicas, suite 1.543/1.533/0/10, `tsc`, `git diff --check`).
  Verificado sobre el `main` fusionado, desde cero: específicos 7+5+34+20+15+
  8+2+6+26+22+18+24+2+6+27, suite 1.543 (1.533 aprobados, 0 fallos, 10
  omitidos), `tsc` limpio, build fresco exit 0 en 2 min 18 s (`BUILD_ID
  obVjaH4sRLnzjeS90yEQz`, sólo el `.next` de este checkout borrado, ningún
  Next corriendo), `git diff --check b60f985..HEAD` limpio; el árbol
  fusionado es idéntico a `87c0c6f` (los JSON del banco y la evidencia, mismo
  blob). Antes del merge: implementada en la rama (worktree `wt-etapa2-impl`)
  y corregida en dos rondas (auditorías de Codex sobre `fb3a3f1` —productor
  que rechaza libera el turno y sirve UB; renovación cancelable y esperada;
  contexto del vuelo por solicitud; UUID completo; comentarios al día— y sobre
  `82842a5` —un instante por solicitud: día, semilla, cinco claves y clave del
  vuelo de la misma lectura del reloj—). Serialización
  real verificada por el camino de producción (informe §16.1); banco completo
  repetido con el mismo resultado (§16.2); suite 1.536 (1.526 aprobados, 0
  fallos, 10 omitidos) tras esa primera corrección, y **1.543 (1.533 aprobados,
  0 fallos, 10 omitidos) tras la segunda: UN instante por solicitud** (la
  clave del vuelo, las cinco claves y el día de la generación salen de la misma
  lectura del reloj; informe §17). Módulos puros nuevos (`lib/home-instante.ts`, `lib/turno.ts`,
  `lib/turno-memoria.ts`, `lib/turno-lua.ts`, `lib/home-servir.ts`,
  `lib/senal-solicitud.ts`), `VERSION_HOME` única en `lib/claves.ts`, cableado
  en `lib/cache.ts`/`lib/home.ts`/`lib/tmdb.ts`/`lib/supabase.ts`, banco
  multiproceso (`scripts/banco/correr-etapa2.mjs`). RED → GREEN: +70 tests;
  suite 1.525 (1.515 aprobados, 0 fallos, 10 omitidos) **en la implementación
  anterior a las correcciones** (`fb3a3f1`); `tsc` limpio; build
  fresco exit 0. **Banco (3 procesos, corrida VÁLIDA, 27 escenarios):** HIT
  idéntico a la Etapa 1 (1 comando, 40.505 B, mismo corredor); frío 994 → 997
  comandos; E2 3 → **1 composición entre procesos**; fresca vencida con UB →
  los demás **último bueno en el acto**; propietario asesinado → un rescate;
  turno borrado a mitad → un solo publicado; medianoche → `-1` con UB intacto;
  TMDB caído → 1 degradado + enfriamiento (ráfaga 1/s × 40 s: 3 composiciones
  sin UB, 2 con UB y 40 UB); respuesta perdida → reconciliación; EVAL fallido
  → nada inseguro; Redis caído y vuelve → `sin-redis` no escribe; composición
  > presupuesto → `cancelada` a los 50,4 s y TMDB deja de recibir; control con
  Redis caído → no termina (promesa reducida); rollout v6/v7 → familias
  separadas. Informe §15. Antecedente del mismo día: diseño v3 aprobado por
  Codex y **precondición
  (informe §14):** desde un Preview descartable y protegido (rama temporal
  nunca pusheada, subida con `vercel deploy`, borrada después; las credenciales
  de Redis son *Sensitive* y el CLI no las baja), contra **la misma base de
  Upstash que usa Producción**, con claves `precond-etapa2:<corrida>:*` de TTL
  ≤ 60 s: `SET NX PX` y los cuatro scripts reales (`RENOVAR`, `LIBERAR`,
  `ENFRIAR`, `PUBLICAR`) con el payload real del Home (85.328 B; `PUBLICAR` de
  195 KB de cuerpo), resultados positivos y negativos (propiedad perdida → 0,
  generación de un día posterior → −1 con UB intacto, `enfriando:` bloquea a
  todos), lectura posterior con contenido y TTL, 48/48 pasos correctos, 60
  comandos HTTP (mediana 118 ms), `SCAN` del prefijo 0 antes y 0 después,
  `DBSIZE` 2.923 antes y después. **Desconocido:** cómo factura Upstash un
  `EVAL` (sin acceso al panel) y el límite de tamaño de petición (≥ 195 KB
  pasa). **Hallazgo para la implementación (§14.6):** leer tres copias en el
  HIT triplica los bytes del camino caliente; queda como decisión pendiente
  con recomendación (leer sólo la fresca y pedir UB/degradado en el MISS).
  Correcciones documentales del 13/09: promesa real del deadline antes de la
  desigualdad; "Redis caído puede terminar en timeout" en vez de "no tumba la
  app"; período de adopción del UB (las frescas v6 siguen HIT y no crean UB;
  cada combinación lo obtiene en su primera reconstrucción; ventana aceptada,
  sin escrituras en los HIT); caso RED de cancelación del líder con seguidores.
  **La v3 corrige los cuatro hallazgos sobre la v2:** el camino `sin-redis` sirve y **no guarda** (nada de
  fresca/UB/generación sin fencing; escenario E-sinredis-vuelve); un degradado
  **no libera** el turno sino que lo convierte en enfriamiento (`ENFRIAR`
  atómico, `ENFRIAMIENTO_MS`, degradado compartido en clave aparte que nunca se
  promociona; ráfaga escalonada con y sin UB); el deadline es una
  **cancelación real** por `AbortSignal` (espera, renovación, TMDB y Supabase)
  con **promesa reducida**: vale con Redis respondiendo, y con Redis caído la
  solicitud puede seguir hasta `maxDuration` como en F5a (los reintentos del
  SDK no se cancelan por solicitud; Etapa 3); **una sola `VERSION_HOME`** en
  `lib/claves.ts` para fresca, UB, generación, degradado y turno, con turnos
  separados por versión en un despliegue gradual y tests de invalidación
  conjunta. La v2 resolvía los diez
  hallazgos anteriores: el seguidor sin último bueno reintenta el turno en cada vuelta y
  nunca compone sin turno; deadline integral del request contra `maxDuration`
  fijado por test y con máximos que salen del banco; degradado con último
  bueno devuelve el último bueno; **publicación con fencing atómico**
  (`PUBLICAR` compara propietario y generación por día, cubre la medianoche);
  estados `adquirido/ocupado/indeterminado` con reconciliación de la
  respuesta perdida; `EVAL` es condición obligatoria (sin variante insegura);
  integración explícita con `lib/home-vuelo.ts` y costos recalculados;
  evidencia de "composición iniciada" para E-muere; controles RED; TTL de
  36 h enunciado como lo que garantiza. **Decisión del dueño aprobada:** se
  sirve el Home anterior durante la reconstrucción. Sigue sin verificarse
  `EVAL` contra la base real (credenciales sólo en Vercel): es la condición de
  entrada a la implementación. Informe: [`medidas/2026-09-13-etapa2-diseno-turno-ultimo-bueno.md`](medidas/2026-09-13-etapa2-diseno-turno-ultimo-bueno.md).

- **Revisión independiente de Codex, 10/09:** los riesgos centrales del informe
  de capacidad tienen sustento, pero **el plan requiere correcciones antes de
  implementar**. [Dictamen y evidencia](medidas/2026-09-10-revision-capacidad-codex.md).
  Pruebas locales sin red: 13 filas publicadas → 10 claves; 100 MISS concurrentes
  → 100 productores en el resolver real; una escritura fallida hace rechazar su
  retorno; SDK Redis instalado → seis intentos ante fallo de transporte simulado.
  No son pruebas HTTP ni mediciones de capacidad de Producción. Corregir además
  la equivalencia errónea `N,D,M` → `n`, la comparación de simultaneidad con req/s,
  el contrato del bloqueo y la promesa de deducir cuentas/tráfico real de dobles.
  Las etapas del informe son propuestas pendientes, no un plan aprobado.

- **Comprobado localmente el 09/09:** rama `main`; HEAD y referencia local
  `origin/main` coinciden en el hito `fd2cd23`, merge del contenedor Android y
  CORS. No se hizo fetch ni se comprobó el deployment en Vercel en esta sesión.
- **Informado por el dueño el 09/09:** el 08/09 agregó 20 testers en Google Play
  y generó el enlace; desde el 09/09 están usando la aplicación. No afirmó que
  los 20 hayan aceptado o instalado: esos conteos siguen por verificar.
- **Heredado del chat anterior** *(al 09/09; después subieron a Alpha los
  AAB 2 y 3, ver el resumen vigente)*: web/PWA en producción; Android firmado en
  prueba cerrada Alpha, versión 1 (1.0.0), Argentina, publicación gestionada
  desactivada, ficha y declaraciones principales completadas. No se abrió Play
  Console en esta sesión. Esto NO acredita publicación pública en Producción.
- **Comprobado en código el 09/09:** `app/layout.tsx` excluye Analytics y Speed
  Insights del build nativo mediante `!ES_NATIVO`. Web/PWA conservan medición;
  Android no registra visitantes/pantallas por esta integración. Sus llamadas a
  las API remotas sí generan actividad de servidor; no equivalen a usuarios.

- **Revisión independiente del 10/09:** la auditoría de capacidad fue revisada
  por Codex sobre el mismo hito
  ([`medidas/2026-09-10-revision-capacidad-codex.md`](medidas/2026-09-10-revision-capacidad-codex.md)).
  Sostuvo los riesgos centrales y encontró **siete correcciones**, dos de ellas en
  criterios de aceptación que, como estaban escritos, habrían roto el producto.
  **Las siete se verificaron por cuenta propia y están incorporadas** al informe y
  a los issues; el detalle de qué cambió está en la §12 del informe.
- **Comprobado el 10/09, auditoría de capacidad y tráfico:** `git fetch`;
  `main` = `origin/main` = `fd2cd23`. Se auditó ese árbol leyendo el código, con
  evidencia por archivo y línea, y se ejecutó el constructor de claves real. **No
  se corrió ninguna prueba de carga**, ni contra Producción ni contra nada, y no
  se cambió una sola línea de código. Informe completo:
  [`medidas/2026-09-10-capacidad-trafico.md`](medidas/2026-09-10-capacidad-trafico.md).
- **Corrección de un informe propio (10/09):** el de la release del 07/09 (§20.e
  de `superpowers/plans/2026-09-05-etapa3-android-publicable.md`) afirma que en
  el contenedor Analytics y Speed Insights dejan "dos pedidos muertos al
  arrancar". **Es incorrecto**: `app/layout.tsx:133` los gatea con `!ES_NATIVO` y
  no se montan. Sigue siendo cierto que las librerías quedan adentro del bundle.

### Antecedentes del #22 — histórico, NO es el estado actual

Lo que se sabía y se decía el 10/09, antes del arreglo. El estado vigente es
el primer punto de este bloque; esto se conserva sólo para no perder el rastro
de cómo se llegó.

- **Auditoría de `fb89b45`, 10/09.** No aprobado para merge entonces.
  [Dictamen](medidas/2026-09-10-auditoria-fb89b45.md). Los 18 tests pasan, pero
  una prueba independiente confirma formulario habilitado con token malformado
  y sesión anterior. Además la identidad se compara después de escribir, sin
  ligar la mutación a la recuperación esperada. El rechazo del enlace recién
  recibido seguía sin explicación ni prueba completa con correo real. (Los
  cuatro puntos se resolvieron en `0831b86`; ver el informe.)

- **Evidencia del 10/09:** captura de redirección con `access_denied` /
  `otp_expired` (“Email link is invalid or has expired”). El dueño aclara que
  copió el enlace recién recibido directamente del correo a incógnito, sin
  abrirlo antes. Supabase rechazó la verificación; la causa de invalidación es
  lo único que sigue abierto. No atribuirlo a reutilización manual ni a
  antigüedad sin evidencia.

- **Captura del incidente:** Nueva contraseña mostraba “El enlace no es
  válido o ya venció”. El código de entonces usaba ese texto ante ausencia de
  usuario después de inicializar; no acreditaba expiración. (Corregido: la
  página nueva muestra el motivo que Supabase pone en la URL.)

- **Ampliación del incidente por el dueño:** la contraseña nueva tampoco
  permite ingresar en la web en incógnito; revisó una tabla común de Supabase,
  no Authentication, y no recuerda el correo del formulario. El síntoma no está
  limitado a Android. Quedaba por comprobar la identidad de la sesión que
  recibió el cambio y el error exacto del ingreso.

- **Reporte original del dueño (10/09), que entonces desplazó al resto del
  trabajo.** Informó que pedir recuperación desde Play envía el correo, el enlace
  abre la web y la contraseña nueva luego no permite ingresar en Android.
  No estaba comprobado que la escritura hubiera fallado. No confundir la falta
  de App Links con fallo de guardado.

## Auditoría de capacidad y tráfico — 10/09/2026

Encargo del dueño: diagnóstico comprobado y plan priorizado, sin implementar
cambios, con Android en prueba cerrada y antes de una difusión importante.
Detalle completo en
[`medidas/2026-09-10-capacidad-trafico.md`](medidas/2026-09-10-capacidad-trafico.md).

**Revisada de forma independiente el mismo día** (ver el bloque de evidencia
arriba). Lo que sigue ya incorpora las siete correcciones.

### Lo comprobado — issues #17 a #21 (antecedente del 10/09; #21 resuelto el 11/09, #18 el 12/09, #17 el 13/09)

| # | Hallazgo | Cómo se comprobó |
|---|---|---|
| #17 | *(10/09, antes de la Etapa 1)* Ninguna unión de peticiones en vuelo ni bloqueo distribuido: N visitas al Home frío = N composiciones. Y no hay "último Home bueno": al vencer el TTL de 6 h alguien paga el rearmado completo. **Desde el 12/09 hay unión por proceso (single-flight del Home) y desde el 13/09 turno distribuido y último bueno (Etapa 2): resuelto** | Lectura: `lib/cache.ts:298-304`, `lib/reparar-y-cachear.ts:39-44`. El propio repositorio ya lo dice en `lib/single-flight.ts:9-11` |
| #18 | *(10/09)* `/api/home` no canoniza sus parámetros. **19 filas, 17 entradas distintas, 14 claves distintas**, con el arnés y la salida íntegra publicados. **Resuelto y desplegado el 12/09** | **Ejecutado** con `claveHome` real |
| #19 | Una caída de TMDB se realimenta: el cliente **de TMDB** no reintenta ni lee `Retry-After`, el degradado no se guarda, y cada visita rearma. El techo de peticiones en vuelo es por proceso, o sea 24 × instancias | Lectura: `lib/tmdb.ts:38-40` y `56-67`, `lib/home.ts:706` |
| #20 | *(10/09)* No hay contador de llamadas a TMDB ni a Supabase, ni de composiciones; lo que se llama `requests` mezcla tres unidades; `vercel logs` no devolvió nada el 10/09. **Los contadores existen desde la Etapa 0 (11/09); sigue abierto por la observabilidad histórica** | Lectura + ejecución |
| **#21** | **Si falla la escritura en Redis, un Home BUENO terminaba en 500** — mientras que uno degradado se servía sin problema, porque nunca intenta escribir. **Resuelto y desplegado el 11/09** (Etapa PREVIA) | **Ejecutado** sobre el resolver real; el arreglo, probado con el resolver real y guards |

**#21 era el más chico y el más urgente**: un `catch` que faltaba y no dependía
de medir nada. Por eso fue la **Etapa PREVIA** del plan, anterior a la Etapa 0,
con la decisión aprobada por el dueño: *se entrega el payload y se registra el
error*. **Hecha y desplegada el 11/09.** Las Etapas **PREVIA, 0 y 1** están
desplegadas (ver el estado vigente arriba). *(Antecedente: cuando se escribió,
lo que seguía era la Etapa 2; está desplegada desde el 13/09 y la Etapa 3
tiene diseño v4.1 y la sub-etapa 3.a implementada en rama, sin mergear.)*

### Lo que se revisó y **no** es un problema

- El **orden** de `providers` ya converge: `n,d,m`, `d,m,n` y `n,,d,m` son la
  misma clave. La afirmación contraria del traspaso del 09/09 es incorrecta.
- Un código de plataforma inexistente **no** dispara un `discover` sin filtro:
  los tres caminos de pools cortan. Hipótesis plausible, verificada y descartada.
- Las **lecturas** de Redis sí se unen entre peticiones concurrentes, y además
  **el cliente de Redis sí reintenta** fallos de transporte (6 intentos). La
  primera versión del informe decía lo contrario y era falso.
- La **lectura** de Redis está bien cubierta ante fallos. La escritura, desde el
  11/09, también (#21, Etapa PREVIA).
- `page` está normalizada en las rutas paginadas.
- `Vary: Origin` ya se emite siempre: es la condición previa de cualquier caché
  compartida, y ya está cumplida. **No es autenticación ni sustituye un límite de
  abuso.**

### 🔴 Lo que un banco aislado NO puede responder

**Corregido el 10/09.** La primera versión de este bloque decía que todas las
incógnitas se responden con la Etapa 0 y la prueba de carga. **No es cierto**, y
era la promesa más engañosa del informe: un banco con dobles verifica
**comportamiento**, no revela hechos de Producción.

Son cuatro fuentes distintas y no se sustituyen:

| Fuente | Da |
|---|---|
| Pruebas de comportamiento (banco) | Que el sistema hace lo que debe |
| Capacidad bajo condiciones declaradas (banco) | Un número comparable **contra sí mismo**, útil para el antes/después |
| **Observación pasiva de Producción** | Tasa de aciertos real, tráfico real, fragmentación real, latencia real, escalado real |
| **Consulta de las cuentas** | Los límites verdaderos de TMDB, Upstash, Supabase y Vercel |

**Un máximo de usuarios simultáneos real NO sale del banco.** Sale de observar
Producción, o de una prueba controlada contra Producción que hoy está prohibida.

Sigue sin poder afirmarse: cuántos usuarios simultáneos aguanta; cuánto cuesta
hoy un Home frío; la tasa de aciertos en Producción; cuántas instancias levanta
Vercel; la latencia media real; si los 20 testers generan tráfico; y los límites
reales de las cuatro cuentas.

**Las cifras que circulan —150 ms cacheado, 5-10 s en frío, más de 600 llamadas a
TMDB— son históricas y no se reprodujeron.** No usarlas como estado actual.

⚠️ **Y una advertencia sobre el alcance:** esta auditoría leyó el **repositorio**.
No puede afirmar que no exista un límite de tasa, una regla de firewall o un
monitor configurados en un panel, fuera del código.

### Único dato de infraestructura tomado hoy

`dbsize` de Redis leído por `/api/health`: **1259 claves el 07/09** y **2382 el
10/09**. `dbsize` no desglosa por familia y la mayoría de las claves son `card:`
y `pv3:` por título: **no usar este número como evidencia de fragmentación**.

## Corrección del pendiente del Top — 09/09/2026

El dueño confirma que el problema del Top se resolvió con el dashboard manual.
Comprobado en `app/admin/top/page.tsx`: doce bloques, películas y series para
Netflix, Disney+, Max, Prime Video, Apple TV+ y Crunchyroll; edición de diez
posiciones, fecha de captura, revisión y publicación por bloque. `lib/top.ts`
consume las publicaciones con `source: "manual"` cuando están los doce bloques
iniciales. No se comprobó el contenido actual de la API pública en esta sesión.

El issue #13 se retiró de abiertos y se conservó su
[historia y cierre](traspasos/2026-09-09-cierre-top-automatico.md).
La lista del traspaso que pedía “resolver el cron y agregar observabilidad de
frescura” queda superada como pendiente del ranking por esta confirmación.
El cron sigue programado en `vercel.json` y su evidencia se sigue consultando
para disponibilidad (`lib/enrich.ts`); no se afirma que esté reparado, eliminado
ni que se hayan implementado alertas automáticas de frescura. Su mera presencia
no justifica reabrir el problema del ranking ya resuelto por carga manual.

## Registro de la prueba cerrada

| Fecha | Hecho | Fuente | Falta comprobar |
|---|---|---|---|
| 08/09/2026 | 20 testers agregados y enlace generado | Dueño, conversación del 09/09 | Adhesiones efectivas en consola |
| 09/09/2026 | Comenzaron a usar la app | Dueño, conversación del 09/09 | Cantidad, dispositivos, recorridos y feedback |
| 28/09/2026 | AAB `2 (1.0.0)` (Yumpeá) subido a Alpha | Dueño | Prueba de sala completa en teléfonos |
| 03/10/2026 | AAB `3 (1.1.0)` subido a Alpha; acceso a Producción pedido a Google | Dueño | Respuesta de Google |
| 05/10/2026 | AAB `4 (1.2.0)` generado | Git/Claude | Confirmación de la subida a Play |

Todavía no hay observaciones concretas de testers registradas en esta sesión.
Agregar resultados con fecha y procedencia, sin publicar sus correos personales.

## Evidencia histórica y procedimientos

- [Traspaso completo recibido el 09/09](traspasos/2026-09-09-integral.md): copia
  del relato del chat anterior, con estado de Play, declaraciones, pruebas,
  riesgos, propuestas de capacidad y pendientes. **Es una foto histórica**, no
  reemplaza este estado ni acredita verificaciones actuales. Sus cifras de
  rendimiento y afirmaciones externas no se revalidaron en esta sesión.
- [Implementación Android, etapas 3–5](superpowers/plans/2026-09-05-etapa3-android-publicable.md):
  decisiones, procedimiento, verificaciones y release; leer junto a este estado.
- [Diseño de Capacitor](CAPACITOR.md), [auditoría de Play](PLAY-STORE.md),
  [PWA](PWA.md) y [medición/mantenimiento](MANTENIMIENTO.md).

## Archivos del dueño y alcance de la sesión

Sin seguimiento al comprobar Git: `avatares/`, `prompts/noticias-filtro.md`,
`prompts/noticias-redaccion.md`, `supabase/migrations/004_news.sql`.
Preservarlos; no usar `git add -A`. El estado real de la migración de noticias
no se comprobó en la base. No guardar secretos de firma en Git.

*(Histórico, sesión del 09/09: sus cambios documentales ya están en `main`.)*
Esta sesión actualiza documentación por pedido explícito del dueño. No modifica
código, ejecuta migraciones, genera AAB, despliega ni cambia paneles. Los cambios
documentales quedan locales hasta que se revisen y se incorporen al repositorio;
no asumir que ya están disponibles en otros clones o IAs remotas.

## Antecedentes anteriores al 09/09/2026 — no usar como estado vigente

Lo que sigue conserva mediciones y decisiones históricas. Las frases “hoy”,
“sin mergear”, “no tiene CORS” o “pendiente de firma” describen el momento en
que se escribieron y quedan reemplazadas, para el estado actual, por el bloque
superior. No ejecutar tareas pendientes de estos antecedentes sin verificarlas.

### Cabecera histórica (agosto de 2026)

> Documento de traspaso. Se actualiza al cerrar una sesión de trabajo larga.
> **Última actualización: 27 de agosto de 2026.**
>
> **ESTE ES EL DOCUMENTO CANÓNICO DEL ESTADO.** Qué está desplegado, qué rama
> está viva y qué queda abierto se escribe **acá y en ningún otro lado**.
> `docs/TRASPASO.md` cuenta el detalle de una tanda y apunta acá para el estado;
> `CLAUDE.md` guarda las decisiones de arquitectura, que no cambian con cada
> deploy. Dos documentos con el mismo SHA es un SHA viejo esperando.

`CLAUDE.md` se carga solo en cada conversación y ya contiene las decisiones de
arquitectura, las limitaciones de TMDB y las reglas de cada feature. **Este
archivo no las repite**: acá va el estado del momento y lo que queda pendiente.

---

## Estado de despliegue

> ⚠️ **Supersedido (auditoría del 19/10/2026).** La tabla de ramas es del 17/08. `feat/salas` (con `0c13036`, `8429f5e`, `34e4637`) entró a `main` con `2af1a37`; `feat/ejes-rieles-genero` con `1042b8a`; `feat/avatares-propios` y `feat/legal-play-web` ya no existen. Estado vigente: "Resumen vigente" al principio.

```
origin/main                          ← DESPLEGADO en producción (app.yump.ar)
                                       avatares: merge 89ccb73 · legal: merge 27669c0
                                       etapa 3.c.1 (pausa 429): merge 367b765 (19/09)
feat/etapa3c1-pausa-tmdb  6fd875e   ← MERGEADA el 19/09 con --no-ff (367b765). Se puede borrar
feat/salas                c7e596c   ← rama viva del plan de Salas; contiene 0c13036, 8429f5e, 34e4637 (NO están en main)
feat/avatares-propios                ← MERGEADA el 27/08 con --no-ff. Se puede borrar
feat/legal-play-web                  ← MERGEADA el 28/08 con --no-ff. Se puede borrar
feat/ejes-rieles-genero   1912f56   ← pusheada como respaldo, SIN mergear
feat/dia-rotacion                    ← sin mergear y MUY atrás de main; hay que rebasarla
```

**A propósito NO se escribe acá el SHA de la punta.** Un commit no puede nombrar
su propio hash, así que el commit que actualiza esta tabla la desactualiza; ya
pasó dos veces seguidas. Se mira con `git log -1 origin/main`. Lo que sí se
escribe es el SHA de un hito ya cerrado, como el merge de arriba.

**Lo que hay desplegado hoy:**

- la **Etapa 3.c.1 de capacidad** (pausa compartida ante 429; merge `367b765`,
  19/09, `dpl_Emrbaqf1Ft1oJydTjMGy4GzNiWXh`), sobre la 3.a y la 3.b del 15/09;

- las tres tandas del **idioma** (catálogo en `es-MX` con respaldo a `es-ES`);
- los tres arreglos del **Top 10 de Netflix** — la plataforma garantizada por la
  fuente, la consulta acotada por subtítulo y la ficha usando la misma evidencia;
- los **31 avatares propios** (merge `89ccb73`, 27/08), con DiceBear fuera de la
  app entera;
- la **tanda web/legal** previa al empaquetado Android (merge `27669c0`, 28/08).

### El merge web/legal — 28/08

Entró con `--no-ff` (merge `27669c0`). Lo que agrega:

- la sección **"Sobre Yump"**, con los enlaces a las cuatro páginas de
  `yump.ar`, la atribución de TMDB —logo oficial servido local y texto literal
  de la sección 3 de sus términos—, la autoría de las ilustraciones en tres
  grupos y el aviso de agregador independiente;
- **se consulta SIN sesión**: va en la pestaña Cuenta además de en Perfil,
  porque `/cuenta/perfil` redirige al login cuando no hay usuario;
- los **nombres de plataforma en texto neutro**, en lugar de los wordmarks
  imitados. Fuera también los logos reales de TMDB que servía el onboarding y
  los colores de marca de los puntitos de la barra.

**Los códigos internos, los filtros y el comportamiento no cambiaron**: fue un
cambio visual. Y **el `OnboardingGate` no se tocó**: la baja de cuenta se
inicia por correo a `privacidad@yump.ar`, que no depende de la app.

Las cuatro páginas de `yump.ar` fueron auditadas en vivo el 28/08 y están
completas. El detalle, en `docs/PLAY-STORE.md` §0.b.

### El merge de los avatares — 27/08

Entró con `--no-ff`, así que el merge commit está y se puede revertir de una
pieza. Verificado antes de pushear: 565 tests, `tsc` limpio, `next build`
compila, barrido de DiceBear en cero, guard del SQL OK, `SC_CACHE_VERSION` en
`v7`. Y después, contra producción: los chunks del home traen **cero** rastros de
DiceBear y `/avatars/avatar-pocho.webp` responde 200 `image/webp`.

**Entraron también los tres commits de documentación** que esperaban en `main`
local: la auditoría legal de Google Play (`docs/PLAY-STORE.md`). Decisión
explícita del dueño — no tocan el runtime y hacen falta para la etapa siguiente.

**No se ejecutó SQL, no se tocó Supabase y las columnas de `profiles` no
cambiaron.** El contrato de persistencia está en `docs/AVATARES.md`.

**Lo que queda de esa línea**, en orden:

1. El dueño elige su avatar definitivo con la cuenta principal. Ya no hay
   ninguna precaución que tomar.
2. **Issue #14** —el parpadeo del avatar al cargar— **POSTERGADO** por decisión
   del dueño (29/08). No es una regresión: el código anterior hacía lo mismo, y
   **no bloquea el prototipo ni el empaquetado con Capacitor**. Antes acá decía
   "antes del empaquetado nativo"; ese orden ya no rige.
3. Borrar `feat/avatares-propios` de los dos lados, con borrado seguro
   (`git branch -d`, sin forzar), cuando el dueño lo confirme.

`feat/idioma-tanda-2` y `feat/idioma-tanda-3` ya no existen: se borraron de los
dos lados con borrado seguro una vez verificada la producción. **Las tres tandas
del idioma están cerradas** — el traspaso completo de esa línea de trabajo vive
en `docs/TRASPASO-IDIOMA.md`.

**Este bloque se actualiza en el mismo commit que mueve `main`.** Quedó tres
semanas diciendo `ab4e189` mientras `main` iba por `5fc0c2e`, y un SHA viejo acá
es peor que ninguno: se lee como "esto es lo que hay desplegado".

`feat/ejes-rieles-genero` está en el remoto solo para que no viva en una sola
máquina. **No está mergeada**: espera la prueba a mano del dueño, y tiene un
criterio de aceptación fallado (ver más abajo).

`feat/hero-universo` está mergeada (probada a mano por el dueño) y **todo lo que
estaba pendiente de subir se pusheó el 16/08**: la rotación de ejes de los
carruseles de audiencia, el cacheo de `publishedIds` y el hero ampliado con su
arreglo de ejes.

**Verificar que Vercel haya tomado el push.** Ya pasó tres veces que no lo
detecta; se destraba con un commit vacío, no con Redeploy (ver la nota en la
memoria del proyecto).

---

## El Top 10 de Netflix — **el código, cerrado y desplegado; el cron, abierto**

> ⚠️ **Supersedido (auditoría del 19/10/2026).** El issue #13 se retiró de abiertos el 09/09 (el Top se carga a mano en `/admin/top`). Que el cron haya quedado reparado NO está verificado; sigue programado en `vercel.json` y alimenta la evidencia de disponibilidad.

**Estado al 27/08.** Se cerraron y desplegaron en `1e14f5c` tres arreglos de
código, y queda abierto el problema del cron (**issue #13**).

**Lo cerrado, ya en producción:**

- **La plataforma la garantiza la FUENTE, no TMDB** (`lib/top-plataformas.ts`).
  "Moria" entró **#1 del top oficial pintada en gris**, porque TMDB no tenía
  proveedores para ella en ninguna región. Esos veinte títulos los publicó
  Netflix como lo más visto en Netflix Argentina: eso es un dato, no una
  deducción. Sólo se aplica cuando no sabemos nada.
- **Consulta acotada cuando el título trae subtítulo** (`lib/netflix-resolver.ts`).
  "Operation Safed Sagar: The Highest Air Force Mission" daba cero resultados
  completo y uno solo reducido a la parte anterior a los dos puntos. Exige un
  único resultado, mira primero el proveedor y marca todo con `needs_review`.
- **La ficha usa la misma evidencia**, con `needs_review = false` y mirando toda
  la ventana de 14 días y no la última semana — atada a la semana más nueva, la
  evidencia se evaporaba con el cron siguiente.

**Lo que sigue abierto (issue #13):** el cron **disparó el 25/08 a las 12:58
UTC**, día correcto y dentro de su ventana, así que la afirmación de más abajo de
que "no disparó nunca" quedó desactualizada — pero **no hay explicación de por
qué se salteó el martes 18/08**, y hay que mirar los logs de Vercel. La
fragilidad de fondo tampoco se movió: **la guarda mide antigüedad desde la fecha
de la semana, no desde la ingesta**, así que una corrida perdida vuelve a
degradar el bloque a "Lo más popular ahora".

### Cómo se detectó, en su momento

**Detectado el 2026-08-25 por el dueño**, mirando la pantalla: el bloque de
Netflix mostraba "Lo más popular ahora" donde antes decía "dato oficial".

**El código hizo lo correcto.** `latestWeekRows()` descarta la semana guardada si
tiene más de 14 días, para no sostener datos viejos bajo el sello de oficiales.
La última ingesta es la semana `2026-08-09`, escrita el 12/08: al detectarlo
llevaba **16,4 días**, o sea que cruzó la línea unos dos días antes — que es
exactamente lo que reportó el dueño ("hasta hace 2 días estaba bien").

**La causa raíz es otra y es peor**: las dos escrituras que existían en la tabla
al 25/08 eran de un **domingo** 17:27 UTC y un **miércoles** 18:10 UTC, contra un
cron declarado `0 12 * * 2` (martes al mediodía). Ninguna cae en su horario, así
que las dos ingestas fueron a mano. Lo que cambió no fue el comportamiento, fue
que se agotó el colchón.

> **Corregido el 27/08.** Acá decía "el cron de Vercel no disparó nunca". Ya no
> es cierto: **disparó el 25/08 a las 12:58 UTC**, en su día y su ventana. Lo que
> sigue sin explicación es el martes 18/08. La conclusión que sí se sostiene es
> la otra —dos ingestas a mano y ninguna del cron hasta esa fecha—, y por eso la
> corrección va acá y no borrando el párrafo.

**No tiene ninguna relación con el cambio de idioma.** `latestWeekRows` no toca
claves de caché ni idioma; la coincidencia de fechas es casual.

**Dos acciones, separadas:**

1. ~~**Recuperar la semana que falta**~~ — el cron del 25/08 escribió una semana
   nueva. Si el bloque volviera a degradar, la salida sigue siendo una llamada
   autenticada a `/api/cron/netflix-top10` con el `CRON_SECRET`: un upsert
   idempotente de 20 filas. **Escribe en la base, así que espera el OK del
   dueño.**
2. **Arreglar el cron — PENDIENTE, es el issue #13.** Hay que mirar
   **Vercel → el proyecto → Settings → Cron Jobs**, donde se ven sus últimas
   ejecuciones, y entender por qué se salteó el 18/08 habiendo disparado el
   25/08. Sin esto, el bloque vuelve a degradar cada vez que se pierda una
   corrida.

**Lo que se descartó en la misma revisión**, para no volver a levantarlo: que
Prime Video y Max compartan títulos **no es un bug**. Verificado contra TMDB, hay
películas con flatrate real en las dos plataformas en Argentina, y el mapeo no
infla (los ids `9` y `384` aportan 0 títulos en AR). Los seis bloques del Top
devuelven 10 lugares, `fallos: 0`, `degradado: false`.

**La lección que sobrevive al cron**: una guarda que degrada en silencio esconde
la falla que la disparó. El bloque venía degradando bien desde hacía dos días y
nada avisaba que hacía dos semanas que no entraba un dato.

---

## Qué se hizo en esta sesión

### Rendimiento y cache

| Cambio | Resultado medido |
|---|---|
| **CLS** — reserva de espacio, `font-display: optional`, ancho fijo en el navbar | 0.0857 → **0.0036** |
| **MGET** — las lecturas de Redis se agrupan en lotes | Lecturas de un rearmado: 391 comandos → **19** |
| **Pool cache** — `discover` cacheado por plataforma individual | Segundo usuario con plataformas que se solapan: 26 llamadas → **8** |
| **`publishedIds`** cacheado | 16 viajes a Supabase por rearmado → **1** |

### Variedad del catálogo

- **Tope de 2 por saga en todo el Home.** Sci-fi mostraba 7 Spider-Man; ahora
  ninguno se repite más de dos veces en todo el Home.
- **Rotación de ejes en los carruseles de audiencia.** Cinco ejes (`pop`, `top`,
  `nuevo`, `taquilla`, `hondo`) rotan con la semilla del día. Cobertura semanal:
  **20 títulos fijos → 198 y 166**. Solapamiento día a día: 100% → 0-21%.
  La rotación es **invisible**: los títulos de los rieles no cambian nunca.

### Correcciones

- **`dailySeed()` en hora argentina.** Todo lo que rota por día cambiaba a las
  21:00 locales. Tiene test (`lib/fecha.test.ts`, `npm test`).
- **"Recordarme"** ya no agenda la fecha de cine en películas: usa la digital
  argentina y devuelve 404 si no existe. El `.ics` de series usaba
  `first_air_date` —el estreno original, de años atrás— y ahora usa
  `next_episode_to_air`. El 404 se avisa en la interfaz en vez de descargar el
  JSON del error.
- **"Próximamente"** filtra lo vencido al leer, sin depender de que el sync esté
  fresco.
- **Contexto al volver de una ficha**: el scroll vertical se restauraba a 930 en
  vez de 1800; ahora vuelve entero, y cada riel recupera su scroll horizontal.
  **Corregido el 18/08**: esa frase era falsa para DOS rieles. `useTrackScroll`
  vivía solo dentro de `Shelf`, y "6 para hoy" y "Próximamente" tienen su propio
  `.track` sin pasar por ahí — los dos volvían al principio. Ya están
  conectados, y el hero además recuerda el chip y la tanda: volver de una ficha
  te devuelve al mismo conjunto, no solo a la misma posición sobre otro
  contenido.
- **Deep links**: "Volver" en una ficha compartida ya no saca al usuario de la
  app.

---

## El hero — **cerrado y en producción**

Mergeado el 16/08 tras la prueba a mano del dueño. Código en `tandaAncha`
(`lib/enrich.ts`); la decisión de arquitectura está en `CLAUDE.md`. Todos los
criterios acordados se cumplen:

| | Objetivo | Medido |
|---|---|---|
| Clics limpios de "Otras" antes de repetir | ≥ 12 | **> 40** (5 antes) |
| Cobertura semanal del hero | ≥ 100 | **236** (40 antes) |
| Tiempo de respuesta de "Otras" | no empeora | **mejora** (ver abajo) |
| Payload del Home vs `offset=0` | idénticos | **idénticos** ✔ |
| Chips curados | idénticos a la foto | **`navidad` 18/18** ✔ |
| Ningún chip vacío en 7 días | 0 vacíos de 112 | **0** ✔ |

El último criterio lo agregó el dueño **después** de probar la rama, porque la
primera versión rompía "Contacto extraterrestre" y ninguna de las otras métricas
lo veía: todas miran el hero base o promedian los 16 chips. Ver
`MANTENIMIENTO.md` 8.d, que es la lección general.

Reproducible con:

```bash
node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
     scripts/medir-hero.mjs informe 2026-08-15
```

Corre las mismas métricas con el camino viejo y el nuevo en un solo proceso
(`HERO_ANCHO=0` es el interruptor). Fotos en `docs/medidas/`.

**Sobre el tiempo**: el camino viejo pedía discover a TMDB **sin cachear** en
cada clic (156-168 ms); el nuevo lee pools cacheados (0-1 ms en local). El número
local exagera la mejora porque acá el cache es en memoria y en Vercel es Upstash:
lo sólido es que dejó de haber una llamada a TMDB por clic, no el "0 ms".

**La condición 2 del dueño** (no mergear sin probarlo a mano) se cumplió y fue lo
que encontró el bug: ninguna de las métricas de arriba veía que "Contacto
extraterrestre" no mostrara nada. Eso pasó a ser el sexto criterio.

**Sobre la condición 1** (comparar contra la foto y no contra una corrida nueva):
se cumplió, y de paso quedó claro por qué la foto igual no es reproducible al
100%: TMDB reordena su catálogo todos los días. Corriendo el **código viejo** con
la semilla del 15/08 un día después, la base ya daba 90% del mismo conjunto pero
solo 31% en la misma posición. Eso es la deriva, no una rotura. Por eso el
informe reporta *posición* y *conjunto* por separado, y por eso quedaron tres
chips de control en el camino viejo (`navidad`, `reales`, `supervivencia`): si
alguno se moviera, el cambio estaría tocando lo que no debe. Detalle en
`docs/MANTENIMIENTO.md` 8.c.

### Cómo volver a probarlo a mano

```bash
npm run dev
```

Sin `next build` en paralelo (corrompe `.next`; si pasa, borrar la carpeta).
Después, en el Home:

1. **"6 para hoy"** — tocar "Mostrame otras" diez o doce veces seguidas y ver que
   no se repita nada y que lo que sale siga siendo mirable.
2. **"Mágica navidad"** — es el chip que no se tocó: tiene que traer películas de
   navidad, igual que antes.
3. **"Historias reales" y "Supervivencia extrema"** — tampoco se tocaron.
4. **El resto de los chips** — acá sí cambia el contenido, y es el punto a
   juzgar: el eje rota por día, así que un día "Palomitas" sale por taquilla y
   otro por estrenos. Vale la pena mirarlo más de un día.
5. **"Contacto extraterrestre", "Odisea espacial" y "Fuego cruzado"** — son los
   tres chips angostos que se vaciaban en un día de `hondo`. Los días en que
   caen se ven en la consola del server: `[ejes] ... se cae a "pop"`.
6. **El mensaje de lista vacía** — "Activá alguna" ahora aparece solo si no hay
   ninguna plataforma elegida. Se comprueba vaciando `sc:platforms` en el
   almacenamiento local del navegador y recargando.

Para ver un día distinto sin esperar, `YUMP_FECHA=2026-08-20 npm run dev`.

Si algo se ve mal y hay que descartar que sea esto: `HERO_ANCHO=0 npm run dev`
devuelve el hero al camino viejo sin tocar código.

---

## Rieles de género con rotación de ejes — **cerrado, con una falla ACEPTADA**

Rama `feat/ejes-rieles-genero` (`1912f56`). Cierra el paso 3: era la última
superficie del Home que pedía siempre popularidad páginas 1-3.

| Criterio | Resultado |
|---|---|
| Cobertura semanal ≥ hoy | ✅ 5 de 6 suben; `scifi/tv` plano (22 títulos en total, issue #10) |
| Solapamiento día a día baja | ✅ 13%→2%, 10%→3%, 12%→5%, 9%→2%, 19%→2% |
| Piso de 15 ítems por riel | ✅ mínimo 20/día (19 un día en scifi/series) |
| Ningún riel vacío en 7 días, películas y series | ✅ 0 vacíos en los tres bloques |
| Kill switch | ✅ `EJES_RIELES=0` (se usó para medir todo el "antes") |
| TMDB en frío en día de `hondo`/`nuevo` | ✅ +9 pools, sin diferencia de tiempo |
| **Calidad: no empeorar el % bajo 6.0 por riel** | ❌ **FALLA, aceptada** (ver abajo) |

Cobertura (base): accion 99→**120**, terror 102→**126**, drama 96→**121**,
comedia 98→**120**, documental 72→**110**, scifi 22→22.

### El criterio de calidad FALLÓ y se aceptó igual — no pasó

Promediado sobre los 7 días, estado base:

| riel | <6.0 antes→después | <5.0 antes→después |
|---|---|---|
| comedia | 4% → **12%** | 0% → 1% |
| terror | 24% → **31%** | 1% → 2% |
| accion | 4% → **8%** | 0% → 1% |
| drama | 0% → **1%** | 0% → 1% |
| documental | 5% → 3% | 4% → 2% |
| scifi | 5% → 5% | 0% → 0% |

**NO ESTÁ CUMPLIDO. Se aceptó como falla, no como cumplido.** Si alguien lee
esto en seis meses: este criterio no pasó. Se mergeó de todas formas, y el
motivo está abajo.

**Por qué se aceptó.** El dueño probó a mano los dos peores días (17/08 en
terror con `hondo`, 21/08 en comedia con `taquilla`) y miró los títulos que
entran, no los porcentajes. Son secuelas de terror de los 2000 y comedias de
Eddie Murphy: **cine popular con nota tibia, que cae en la franja de 5 a 6 y que
forma parte de la variedad que el producto busca.** El veredicto fue sobre el
contenido, que es lo que ningún porcentaje contesta.

**Por qué aceptarlo NO sería acomodar la vara.** El umbral de 5.0 se pidió
**antes** de ver estos resultados, porque el dueño no confiaba en el 6.0 como
línea (el puntaje de TMDB está sesgado por popularidad e idioma). La
reinterpretación quedó registrada de antemano, y esa es exactamente la
diferencia con mover el arco después del tiro: el criterio secundario existía
antes del disparo, no se inventó para justificar el resultado. Lo que el 5.0
dice es que lo que entra son títulos de 5 a 6 —el catálogo abriéndose hacia el
medio, que es la variedad buscada— y no cine malo.

**Si de la prueba a mano sale que hay que ajustar algo, se ajusta QUÉ ejes rotan
y con qué frecuencia** —que `nuevo` o `hondo` pesen menos, que no le toquen al
mismo riel dos días seguidos—, **nunca agregando un piso de nota. Ninguna
película se saca del Home por su puntaje.** Está escrito como principio en
`CLAUDE.md`, en el comentario de `discover()` y en el issue #12.

### Cómo volver a mirar el peor caso

Mergeado el 17/08. Los dos días de abajo son los que más títulos de 5 a 6 meten
en cada riel: sirven para volver a juzgar la composición si alguna vez se duda
de la decisión.

```bash
npm run dev
```

Sin `next build` en paralelo (corrompe `.next`; si pasa, borrar la carpeta).

**Los dos peores días, para no probar uno que salga lindo de casualidad.** Son
los que más títulos de 5 a 6 meten en cada riel:

```bash
YUMP_FECHA=2026-08-17 npm run dev
```

Terror, eje `hondo`: **7 de 20 entre 5 y 6** (y 2 bajo 5). Lo que entra:
El Halloween de Hubie (5.9), Mr. Crocket (5.2), Sé lo que hicisteis el último
verano (5.6), El caimán humano (5.6), Cuarentena terminal (5.7), Pesadilla en
Elm Street: El origen (5.5), La clásica historia de terror (5.8).

```bash
YUMP_FECHA=2026-08-21 npm run dev
```

Comedia, eje `taquilla`: **5 de 20 entre 5 y 6** (0 bajo 5). Lo que entra:
Into the Woods (5.8), El profesor chiflado II (5.0), El profesor chiflado (5.6),
Separados (5.9), Abuelos al poder (5.9).

Qué más mirar:

1. **Los seis rieles llenan 20** en los dos días, en Películas y en Series.
2. **El toggle Películas/Series** de cada riel: el lado de series es donde
   `scifi` y `terror` se quedaban en cero antes del guard.
3. **La consola del server**: `[home] EJES` dice qué eje le tocó a cada riel, con
   asterisco (`pop*`) cuando saltó el guard; `[home] VUELTAS` dice cuánto pagó
   cada uno.
4. **`scifi` en Series** va a verse casi igual todos los días: tiene 22 títulos
   en total y no hay rotación posible (issue #10).

Para volver al camino viejo y comparar en la misma pantalla:
`EJES_RIELES=0 npm run dev`.

---

## Lo que queda por hacer

> ⚠️ **Supersedido (auditoría del 19/10/2026).** La lista vigente de pendientes está en "Resumen vigente" al principio; #13 ya no existe en `docs/ISSUES.md`.

- **`home:v2`** — evaluar si el payload compuesto sigue teniendo sentido, ahora
  sí con los números del hero puestos.
- **Pipeline de escrituras a Upstash** — baja round-trips, no comandos. Poco
  retorno; el rearmado en frío es el caso raro.
- Los quince issues de `docs/ISSUES.md`, empezando por **#13**: el cron semanal
  del Top 10 de Netflix se salteó la corrida del 18/08. Disparó bien el 25/08 y
  el bloque oficial quedó recuperado, pero no hay explicación del salto y la
  guarda mide antigüedad desde la fecha de la semana, así que la próxima corrida
  perdida vuelve a degradarlo.

---

## Issues abiertos (`docs/ISSUES.md`)

> ⚠️ **Supersedido (auditoría del 19/10/2026).** Esta tabla es vieja: #13 se retiró y #8 está corregido e integrado; faltan #16, #19, #20, #22, #23 y #24. La fuente es `docs/ISSUES.md`.

| # | Qué |
|---|---|
| #1 | Lighthouse Performance 61 en móvil |
| #2 | `--faint` no cumple contraste AA |
| #3 | Caminos de red sin ejercitar en la PWA |
| #4 | Fechas en UTC: `porEstrenar`, `today()`, el sync |
| #5 | ¿"Próximamente" muestra estreno en cine o llegada a streaming? |
| #6 | "Próximamente" mezcla estrenos con episodios semanales |
| #7 | `upcoming_content`: las filas existentes se quedan viejas |
| #8 | `upcoming_content`: sesgo permanente hacia lo popular |
| #9 | La popularidad es el orden por defecto en toda la app |
| #10 | La rotación de ejes no le llega a los chips angostos (18 de 112 casillas caen a `pop`) |
| #11 | "Últimos lanzamientos" tiene 35% de títulos bajo 6.0 |
| #12 | **El piso de 60 votos de `discover()` excluye cine regional en toda la app** |
| #13 | **El cron del Top 10 se salteó el 18/08** — disparó el 25/08 y el bloque oficial está recuperado; sin explicación del salto, y una corrida perdida vuelve a degradarlo (lo más fresco, ver arriba) |
| #14 | El avatar propio parpadea en cada carga — **no es una regresión de la tanda de avatares**, el código anterior hacía lo mismo. **POSTERGADO (29/08): no bloquea el prototipo ni el empaquetado con Capacitor.** Se arregla en una rama aparte cuando el dueño lo pida |
| #15 | **Selector de avatares.** Los círculos vacíos: causa confirmada (`loading="lazy"`, 21 de 31 nunca se pedían) y **corregidos** — diez aperturas sin uno solo. Queda abierto por una demora aislada de 4-6 s en dos aperturas calientes, **sin causa demostrada**: por decisión del dueño no se sigue investigando y no bloquea el merge |

---

## Cosas que cuestan tiempo si no se saben

**El tope de vueltas está calibrado para el eje más fácil de llenar.** Un día de
`hondo` termina con 21 tarjetas y uno de `pop` con 39, y la conclusión obvia
—que `hondo` es caro— es al revés: gastó 407 enriquecidos contra 434. Le sobró
presupuesto sin usar. Está documentado junto a `MAX_VUELTAS` en `lib/home.ts`.
**Cuando se toquen los rieles de género, ese número se revisa con ese dato.**

**Que dos cosas que deberían diferir den lo mismo es una alarma.** Documentado en
`MANTENIMIENTO.md` 8.b. Así se encontró el kill switch roto del pool cache.

**`upcoming_content` no es la agenda de estrenos**: es lo que estaba en el top 60
de popularidad el día en que se escribió cada fila. `MANTENIMIENTO.md` 5.b.

**El pool de una plataforma no es único**: hay una variante por configuración de
filtros, porque `withoutGenres` depende del conjunto completo de plataformas.
Documentado en `lib/pools.ts`.

**Interruptores de emergencia**: `POOL_CACHE=0` vuelve al camino viejo completo
de discover; `CACHE_BATCH=0` vuelve al GET por clave.

**`next build` con `next dev` corriendo corrompe `.next`.** Matar el dev antes.

---

## Sin trackear, de otra línea de trabajo

`prompts/noticias-filtro.md`, `prompts/noticias-redaccion.md` y
`supabase/migrations/004_news.sql`. Estaban al empezar la sesión y no se
tocaron. Si `004_news.sql` está aplicado en producción, debería versionarse por
el mismo motivo que el resto del pipeline.

## Eliminar cuenta (Apple / Google Play)

`Cuenta → Configuración → Zona de riesgo → Eliminar cuenta`.

**Qué elimina.** Una sola operación —`admin.deleteUser(id, false)`— y todo lo
demás cae por CASCADE. Verificado contra la base real con una cuenta
descartable el 22/08: antes 1 perfil, 3 votos, 3 `user_items` (los tres kinds),
3 en historial, 1 reseña, 1 identidad y 3 sesiones; después, 0 en todas.

| Dato | Tabla | Cómo se borra |
|---|---|---|
| Cuenta, email, hash de contraseña | `auth.users` | `admin.deleteUser` |
| Identidades, sesiones, tokens, MFA, WebAuthn, OAuth | `auth.*` (8 tablas) | CASCADE |
| Nombre, avatar, país, plataformas | `profiles` | CASCADE |
| Votos | `votes` | CASCADE |
| Mi lista, Ya la vi, descartes | `user_items` | CASCADE |
| Reseñas de usuario | `user_reviews` | CASCADE |
| Historial de fichas | `view_history` | CASCADE |

**Storage no participa**: el proyecto tiene 0 buckets y 0 objetos. Los avatares
son **archivos propios de Yump** en `/avatars/`, iguales para todos; el perfil
sólo guarda cuál eligió cada uno. Si algún día se suben archivos por usuario, el
lugar donde agregar su borrado es `lib/eliminar-cuenta.ts`.

**En el dispositivo** se borra el estado personal (`yump:ruleta-mostrados`,
`yump:hero-estado`, `yump:lista-paginada`, `yump:lista-vuelta`,
`yump:track-scroll`, y la sesión `sb-*-auth-token`) y **se conservan** las
preferencias: `sc:platforms` y su cookie, `sc:theme`, `sc:pais`, `sc:visits`,
`yump:shelf-type`. La persona sigue usando Yump como invitada sin reconfigurar
nada. El reparto vive en `lib/limpieza-local.ts`, que es puro y tiene tests.

**En Upstash no queda nada personal**: ninguna clave de cache lleva un id de
usuario. La única derivada es la del riel personalizado, que es un hash de las
señales — no identifica a nadie y expira sola en 6 h.

**Sin `SUPABASE_SERVICE_ROLE_KEY` el endpoint responde 503 `no-disponible` y NO
comprueba ninguna contraseña.** No es un detalle de robustez: validarla antes
convertía la falta de configuración en un oráculo —contraseña incorrecta 401,
correcta 500— que responde "¿esta clave es la buena?" a cualquiera con un token,
que es justo lo que la revalidación viene a impedir. Ese pedido tampoco suma al
límite de intentos, porque no se comprobó ninguna contraseña.

**Seguridad.** La identidad sale SOLO del token (`sesionDeToken`); el cuerpo del
pedido lleva únicamente la contraseña, así que no hay ningún campo del cliente
que pueda cambiar a quién se borra. La contraseña se revalida con un cliente
Supabase aislado por pedido (`persistSession`, `autoRefreshToken` y
`detectSessionInUrl` en false) y su sesión se cierra al terminar. Límite de 5
intentos fallidos por usuario cada 15 minutos. La ruta es `force-dynamic` con
`Cache-Control: no-store` en TODAS las respuestas, y no registra cuerpo, token,
email ni contraseña.

**El orden es el punto delicado**: primero el servidor; recién con un 200 se
cierra la sesión y se limpia el dispositivo. Si falla, la cuenta y la sesión
quedan intactas y se muestra el motivo.

### Pendiente para Google Play

*(Supersedido: la página pública existe en `yump.ar/eliminar-cuenta/`, 200 al 19/10; ver `docs/PLAY-STORE.md`.)* Falta la **página pública `/eliminar-cuenta`**, accesible sin la app, que Google
exige enlazar desde la ficha de Play. El mecanismo del servidor ya está listo
para reutilizarse: depende solo de un token válido, así que esa página solo
tiene que pedir email y contraseña, iniciar sesión y llamar al mismo endpoint.
No hace falta tocar `lib/eliminar-cuenta.ts` ni la ruta.

También falta declarar en Play qué datos se recogen y cuáles se borran; la tabla
de arriba es la fuente para ese formulario.

---

## Tanda 3 del idioma: EN PRODUCCIÓN

> ⚠️ **Supersedido (auditoría del 19/10/2026).** `feat/idioma-tanda-3` ya está en `main` (merge `ba4a5aa`): no falta ningún merge.

**Cerrada el 2026-08-24.** `upcoming_content` quedó en es-MX y el sync escribe en
es-MX de acá en adelante. Falta **solo el merge** de `feat/idioma-tanda-3`.

| Pieza | Estado |
|---|---|
| Migración `006` (RPC del backfill) | aplicada |
| Edge Function `tmdb-sync` | desplegada, **version 7** |
| Secret `IDIOMA_TITULOS` | **`es-MX`** |
| Backfill | aplicado: 13 filas, 16 campos |
| Cron `tmdb-sync-upcoming-daily` | **reactivado**, jobid 2, `active = true` |

Verificaciones del backfill: 13 filas y 16 campos exactos, igualdad `===` contra
`después`, **ninguna** columna fuera de las tres, `upcoming_content_providers`
con el mismo sha256, 0 títulos vacíos o no latinos, y **los 44 títulos de la
agenda coinciden con su ficha** (0 diferencias).

`updated_at` tampoco cambió con el backfill: la tabla no tiene trigger y el
`UPDATE` nombra solo las tres columnas. Sigue marcando cuándo lo refrescó el
*sync*, que es el diagnóstico de frescura que no había que pisar.

### Lo que costó tres iteraciones, y por qué

La política del sync ante un respaldo que no alcanza se equivocó dos veces antes
de quedar bien, y las dos veces lo encontró una corrida real, no la lectura:

1. **Descartar todo lo que el respaldo no mejorara** tiró 79 títulos de 120 —casi
   todos sin sinopsis en ningún idioma— y bajó el descubrimiento a un tercio.
2. **Escribir todo lo que el respaldo no mejorara** habría persistido títulos
   coreanos que es-ES tenía en español.

Las dos preguntaban "¿la fusión cambió algo?". La correcta es **qué sigue roto
después de fusionar**, y la respuesta se decide por campo. La regla final:

```
título final no vacío y en alfabeto latino  ->  se escribe, aunque coincida
                                                con el original
título final vacío o en escritura no latina ->  el candidato queda fuera
```

Y ese corte es un **piso de calidad**, no una protección de idioma: la fusión ya
repara todo lo que es-ES pueda mejorar. Candidatos: 40 → 83 → **113 de 120**.

**`poster_path` cambia con es-MX y es deliberado** (`docs/UPCOMING.md`): los
pósters de TMDB son localizados. El backfill sigue limitado a `title`,
`overview` y `episode_name`.

---

## Histórico: cómo se ensayó la tanda 3

Rama `feat/idioma-tanda-3`, sin mergear. **Producción intacta**: el cron sigue
corriendo, la Edge Function sigue en es-ES, no se tocaron secrets y
`public.upcoming_content` no se escribió ni una vez.

### Qué hay

| Pieza | Estado |
|---|---|
| `supabase/functions/_shared/idioma-nucleo.ts` | núcleo compartido por la app, la Edge Function y el backfill |
| Edge Function con idioma por entorno + fallback | escrita, **no desplegada** |
| `006_backfill_upcoming_idioma.sql` | **aplicada** en la base |
| `scripts/backfill-upcoming-idioma.mjs` | escrito y ensayado |
| Tests | 365 |

### El ensayo integral, cerrado el 2026-08-24

Sobre un espejo `ensayo.upcoming_content` creado con `LIKE ... INCLUDING ALL`,
en un esquema **no expuesto** en PostgREST, con dos títulos REALES de TMDB que no
están en la tabla (`movie:278` y `tv:1399`) para ejercitar el camino de películas
—que producción no puede probar, porque hoy las 43 filas son todas series—.

| Etapa | Resultado |
|---|---|
| Sembrar + dry-run | 45 filas, 40 cambian, 58 campos, 181 llamadas a TMDB |
| Episodio por coordenadas | **verificado**: se pidió `/tv/1399/season/1/episode/1` en los dos idiomas |
| Aplicar desde el snapshot | 40 filas, verificado con `===` contra `después` |
| Restaurar | 40 filas, verificado con `===` contra `antes` |
| `--fallar-en` | abortó con `23502 not-null`, **0 campos cambiados**, tres veces |
| `public.upcoming_content` | `sha256 492993ee122c0bd5` antes y después: **0 campos distintos** |
| Limpieza | esquema 0, tablas 0, funciones `ensayo_*` 0, `backfill_upcoming_idioma` 1 |

**El `23502` es la prueba de que el espejo conservó el `NOT NULL`.** Con
`CREATE TABLE AS SELECT` no habría constraint que violar y el ensayo habría dado
verde sin probar nada.

**Dos bugs los encontró el ensayo, no la revisión de código:**

1. `ensayo_leer()` no devolvía las coordenadas del episodio, así que los títulos
   sintéticos —los únicos que no están en la tabla real— caían en el camino del
   404 y el episodio exacto nunca se ejercitaba.
2. El script salía con **127** en vez de 1: en Windows, `process.exit()` con
   stdout en vuelo tumba a libuv. Un script que avisa "esto falló" no puede
   comunicarlo con un crash.

### Etapa intermedia, ejecutada el 2026-08-24

| Paso | Estado |
|---|---|
| Rama en el remoto | `origin/feat/idioma-tanda-3` = `1aaaff6`, **sin mergear** |
| Foto previa de las dos tablas | `docs/medidas/foto-upcoming-2026-08-24T194456.json` |
| Cron `tmdb-sync-upcoming-daily` | **PAUSADO** — jobid 2, `active = false`, pg_cron 1.6.4 vía `cron.alter_job` |
| Secret `IDIOMA_TITULOS` | creado en **`es-ES`** (inerte: es el default del código nuevo) |
| Edge Function `tmdb-sync` | **desplegada**, version 4, `ezbr_sha256 e6775466…` |

**El cron quedó pausado y hay que acordarse de reactivarlo**:
`select cron.alter_job(job_id := 2, active := true);` — su horario es 06:00 UTC
(03:00 AR), así que cada día que pase sin reactivar es un día sin refrescar la
agenda.

**Cómo se verificó el deploy, y por qué el hash no sirve.** `supabase functions
download` devuelve el código **transpilado**, no el fuente: los tipos están
borrados y los objetos reformateados, así que comparar hashes contra el commit da
11 de 11 distintos sin que eso signifique nada. La verificación es semántica —
nueve marcadores que tienen que estar y cuatro que no:

```
SI  idioma base por entorno            SI  idioma NO hardcodeado
SI  episodeDetails por coordenadas     SI  el respaldo NO relee next_episode_to_air
SI  metricas por invocacion            SI  sin acumulador de metricas en el modulo
SI  el nucleo compartido _shared       SI  sin la condicion de descarte vieja
```

El bundle descargado **incluye `_shared/idioma-nucleo.ts`**, que es la
confirmación en producción de lo que `deno info` ya había mostrado en local.

### El backfill aprobado: los 16 campos, completos

Snapshot `docs/medidas/snapshot-upcoming-2026-08-24T205416-es-MX.json`.
**13 filas, 16 campos.** La lista entera, porque el dry-run imprime solo los
primeros 8 y reportarla como "completa" fue un error de informe:

| Campo | Antes | Después |
|---|---|---|
| `tv:211288.title` | Tracker | Tracker: Buscador de recompensas |
| `tv:287620.title` | Stuart no consigue salvar el universo | Stuart no logra salvar el Universo |
| `tv:45140.title` | Los Jóvenes Titanes en Acción | Los Jóvenes Titanes en acción |
| `tv:95480.title` | Slow Horses | Caballos lentos |
| `tv:30984.episode_name` | Episodio 46 | VIDA PARA DEFENDERTE. |
| `tv:153312.overview` | Justo después de ser liberado… | Después de cumplir 25 años… |
| `tv:207333.overview` | En el atemporal pueblo de Macondo… | En el mítico pueblo de Macondo… |
| `tv:211288.overview` | Colter Shaw recorre el país… | Colter Shaw es un lobo solitario… |
| `tv:259140.overview` | Akane Tendô conoce a su prometido… | Akane Tendo conoce a su prometido… |
| `tv:283428.overview` | A Koyuki le cuesta relacionarse… | A Koyuki le cuesta trabajo conectar… |
| `tv:287620.overview` | Stuart Bloom, dueño de una tienda… | A Stuart Bloom se le encomienda… |
| `tv:31991.overview` | *(vacía)* | En este programa debutan nuevos talentos… |
| `tv:62650.overview` | Chicago Med se describe como… | Muestra el caótico día a día del hospital… |
| `tv:84773.overview` | Un reparto coral de personajes… | Comenzando en un tiempo relativamente pacífico… |
| `tv:91768.overview` | Urano Motuso es una joven amante… | Motosu Urano era una estudiante universitaria… |
| `tv:95480.overview` | Drama de espías con tintes de comedia negra… | Esta ingeniosa serie de espionaje… |

**Cuatro títulos y un nombre de episodio**; los once restantes son sinopsis.
`tv:95480` (*Slow Horses* → *Caballos lentos*) y `tv:45140` (mayúscula en
"acción") estaban entre los que faltaban en el informe.

El único campo omitido que no es "ya está en es-MX" es
`tv:220542.episode_name`, que da 404 por coordenadas y conserva `"Episodio 49"`.

### El orden en que se ejecutó (ya está hecho, queda como referencia)

Se corrió completo el 2026-08-24/25 y **los siete pasos están cerrados**; el
cron quedó reactivado. Se deja escrito porque es la receta para cualquier cambio
futuro sobre `upcoming_content`:

1. Pausar el cron (`cron.alter_job(2, active := false)`).
2. Desplegar la Edge Function **inerte** (su default sigue siendo es-ES).
3. `supabase secrets set IDIOMA_TITULOS=es-MX` y **una** corrida manual del sync.
4. Dry-run sobre la tabla real → snapshot → revisarlo.
5. `--aplicar --desde-plan=<ese snapshot>`.
6. Verificar `/proximamente` contra la ficha del mismo título.
7. Reactivar el cron.

**El orden importa**: si el backfill fuera antes del sync, la próxima corrida en
es-ES pisaría lo reparado. Y entre el paso 3 y el 5 el cron tiene que estar
pausado, o el bloqueo optimista de la RPC va a abortar el backfill — que es lo
que tiene que hacer, pero mejor no llegar ahí.

---

## Tanda 2 del idioma: EN PRODUCCIÓN

**Activada el 2026-08-24.** `main` = `361cf5b` (`Merge feat/idioma-tanda-2`),
desplegado, con `IDIOMA_TITULOS=es-MX` en el scope **Production** únicamente.

Evidencia del cierre, leída de producción y no del banco:

| Qué | Resultado |
|---|---|
| Commit desplegado | `361cf5b`, rama `main` |
| `/api/health` | **200**, `cache: redis`, ping OK |
| Claves del Home | **siete**, todas `home:es-MX+f.r1:v5:…` — una por combinación |
| Precalentamiento | **7/7**, 12 rieles cada una, ninguna degradada, salida 0 |
| Segunda vuelta | las siete desde caché (354-501 ms) |
| Fallos de respaldo | **0** acumulados sobre 16 requests de Home |
| Errores 5xx | **0** |
| Claves en Upstash | 1.593 → **2.378** |

**El arranque en frío fue PARCIAL, y eso es el diseño funcionando**: el primer
`MISS` registró `401 hit / 236 miss` de 637 claves. Las familias que **no**
llevan huella —`pv:`, `videos:`, `genre:covers:`, `blocklist:`— seguían
calientes de la etapa `es-ES` y no se invalidaron. Solo se rearmó lo localizado.

**Rollback**: `IDIOMA_TITULOS=es-ES` + un deployment nuevo del **mismo** `main`.
Nunca revertir el código: el código sin huella con la variable en `es-MX` es la
combinación que envenena las claves de `es-ES`.

### La rama `feat/idioma-tanda-2` quedó viva y ya no es segura

Sigue en el remoto, pero **sus seis variables de aislamiento se borraron** (paso
final del runbook). Con `IDIOMA_TITULOS` solo en Production, un push nuevo a esa
rama arma un Preview que **comparte el Redis de producción** y corre `es-ES` con
huella: escribiría un espacio `es-ES.r1` entero contra la cuota de producción,
para nada. Si no se va a usar más, borrarla.

---

## Cómo llegó acá (histórico de la tanda 2)

**Un solo cambio de código**: los once call sites pasaban `HUELLA_EN_CLAVES` —la
cadena vacía del modo compatible de la tanda 1— y ahora pasan `HUELLA_IDIOMA`.
Con eso la clave depende de la configuración: `card:es-MX+f.r1:movie:278` en vez
de `card:movie:278`. Las once familias juntas, que es lo que provoca **un** solo
arranque frío en vez de once, y evita un Home mitad es-MX y mitad es-ES mientras
durara el escalonamiento.

`HUELLA_EN_CLAVES` se **eliminó** en vez de repuntarse: mientras existiera, un
call site nuevo podía quedarse en modo compatible sin que nada lo notara, y el
síntoma no es un error sino títulos mezclados. En su lugar hay un barrido nuevo
(`lib/claves.test.ts`) que exige `HUELLA_IDIOMA` en **todas** las llamadas a un
constructor y fija el total en 11. Visto en rojo inyectando `""` en `lib/top.ts`.

El idioma base, el fallback, `ayudaOriginal` y la consulta verificada ya estaban
implementados y probados desde la tanda 1: **se encienden con la variable, sin
tocar código.**

### Medición, contra una línea de base NUEVA

Los 612 / 655 del informe de la tanda 1 son **referencia histórica**: la tanda 1
movió esos números. Todo en `docs/medidas/2026-08-23-idioma-tanda2-e2e.json`.

| Home frío `n,d,m` | Base (es-ES) | Tanda 2 (es-MX+f) | Tope | |
|---|---|---|---|---|
| Llamadas a TMDB | 613 · 613 · 613 | 651 · 652 · 651 | ≤ 660 | ✅ |
| Comandos de Upstash | 656 · 656 · 656 | 656 · 658 · 656 | ≤ 670 | ✅ |
| Llamadas de respaldo | 0 | 39 = **37 páginas + 2 detalles** | ~32 páginas | ✅ |
| Payload | 84.413 B | 84.750 B | ≤ 85.000 B | ✅ |
| **Tiempo frío (pared)** | 8,07 · 7,69 · 7,90 s | 8,46 · 8,53 · 7,06 s | — | ✅ |
| **Tiempo frío (composer)** | 5.895 · 5.518 · 5.747 ms | 6.079 · 6.029 · 5.725 ms | — | ✅ |
| Home caliente | 1 comando, 0 TMDB | 1 comando, 0 TMDB | igual | ✅ |
| `degradado` / `fallos` | false / 0 | false / 0 | | ✅ |
| Títulos por riel | 20·40·30·20×6·20·39·39 | **idénticos** | idénticos | ✅ |

**Las dos variantes se midieron alternadas en la misma ventana**, tres corridas
cada una. Es la corrección más importante de esta revisión: la primera comparó
dos ventanas separadas por hora y media y le atribuyó al idioma lo que era
deriva del catálogo de TMDB.

**Corrección importante sobre la primera revisión de esta medición.** Se publicó
que el idioma cambiaba las cantidades por riel (family 40→39, adult-anime 38→39)
y que "casi todos los rieles difieren". **Las dos cosas eran deriva del catálogo,
no del idioma.** Medido en la misma ventana:

| Comparación | Rieles con contenido distinto |
|---|---|
| es-ES contra es-ES (control) | 0 de 12 |
| es-MX contra es-MX (control) | 0 de 12 |
| **es-ES contra es-MX** | **1 de 12** |

El único que se mueve es "Últimos lanzamientos": 19 de 20 títulos en la misma
posición, uno cambiado. Es el riel que ordena por fecha y sin piso de votos, así
que el borde entre entrar y no entrar es de horas. El hero es idéntico.

La causa de fondo sigue siendo real —**TMDB ordena `discover` por idioma**, 18 de
20 en la misma posición en la página 1— pero su efecto sobre el Home es de un
título en 314, no de un riel entero.

### El pico de 27 segundos: era TMDB, no el fallback

La primera medición tuvo una corrida de `es-MX` de 27,2 s en frío y quedó sin
explicar. Cuatro evidencias:

1. **`es-ES` también lo hace**: una corrida de `es-ES` dio 21,2 s de pared y
   17,5 s de composer, con **cero** llamadas de respaldo.
2. En la misma ventana, `es-ES` y `es-MX` dan **5.747 y 5.725 ms**: indistinguibles.
3. Aislado contra su propio control (`FALLBACK_IDIOMA=0`), el fallback cuesta
   **440 ms**, no 18 segundos.
4. **No es el compilado de `next dev`**: `/api/home` compila en 1,3-2,3 s en
   todas las corridas, incluidas las lentas.

**Lo que sí lo explica, demostrado:** se lanzó el script de medición (144
requests a 16 concurrentes) y encima un Home frío. **TMDB empezó a devolver 502**
en `/watch/providers` y el Home salió degradado. TMDB se degrada bajo
concurrencia: primero se pone lento, después falla. Las corridas lentas venían
justo después de ráfagas de medición.

De yapa, esa corrida degradada confirmó dos cosas del diseño **en vivo**: `safe`
degrada riel por riel en vez de tirar el Home entero, y `cachedIf` **no guarda**
un payload degradado.

**Regla: no medir tiempos con otra cosa pegándole a TMDB al mismo tiempo.** Los
conteos (llamadas, comandos, bytes, títulos) aguantan; los tiempos no.

### Ensayo de rollback

`IDIOMA_TITULOS=es-ES` devuelve **exactamente** la línea de base: mismas
llamadas, mismos comandos, mismo payload, los mismos 12 rieles, el mismo hero y
las 7 fichas de control idénticas.

**Lo que el rollback NO devuelve es el cache.** La huella pasa a `es-ES.r1`, que
no es el espacio vacío de la tanda 1: **volver atrás cuesta un segundo arranque
frío**. Es el precio de que el rollback sea inmediato en vez de esperar TTLs de
hasta 30 h.

### Qué mirar a mano (Preview)

1. `[home] MISS home:es-MX+f.r1:v5:…` en el primer request. Si dice `HIT`, la
   huella no llegó.
2. `movie:278` → "Sueño de fuga", y **ahora sí** aparece el respaldo original.
3. `movie:12535` → sigue la ayuda verificada de Disney+, **sin** duplicarla con
   el respaldo genérico.
4. `tv:1399` → "Game of Thrones"; `movie:585` → "Monsters, Inc.";
   `movie:1084242` → "Zootopia 2". El pasaje al inglés **no** se repara.
5. `/top` y `/personas`: las dos superficies de `top:pop:` y `people:popular:`,
   las claves menos obvias.
6. La ruleta: encabezado y cuerpo sin contradicción. Se esperan **cero**
   contradicciones conocidas.

### El Preview: aislado y desplegado

```
https://streamingcentral-git-feat-4b4d31-<equipo-vercel>.vercel.app
```

**Producción sigue en `es-ES` y sus variables no se tocaron.**

**El plan decía "sacar `KV_*` del scope Preview" y eso no se puede hacer sin
romper producción.** La integración crea **una sola entrada por variable con los
dos targets** (`Production, Preview`), así que borrar "la de Preview" se lleva
puesta la de Production — y producción sin Redis rearma el Home entero en cada
request. Lo que se hizo en cambio: **variables de Preview acotadas a la rama**,
que conviven con la entrada compartida y la pisan solo ahí. Las cinco de Redis
en vacío (`lib/cache.ts` exige URL y token no vacíos) más `IDIOMA_TITULOS=es-MX`.
Procedimiento completo, con la trampa del orden, en `docs/MANTENIMIENTO.md`.

**Verificado, no asumido:** `GET /api/health` en el Preview devuelve **503** con
`cache: "memoria"`, `fuente: null` y las dos credenciales en `false`. Confirmado
también del lado del servidor en los logs de runtime (`environment: preview`,
`branch: feat/idioma-tanda-2`, `503`).

**Los Previews están detrás de Vercel SSO**, así que la verificación visual la
hace el dueño con su sesión; lo automatizable es `vercel logs --json`, que está
autenticado por CLI.

### Verificado EN EL PREVIEW, no solo en el banco

El arranque en frío real, leído de los logs de runtime de Vercel:

```
[home] MISS home:es-MX+f.r1:v5:3439782971:d,m,n,p:accion:movie,…
[idioma] fallback: 47 llamadas | 47 lotes con rotos | 85 títulos reparados | 0 fallos
[home] 7121ms total | cache 0ms | 682 comandos | 0 requests | 661 claves (18 hit / 643 miss)
```

| Qué | Evidencia |
|---|---|
| La huella entra en la clave | `home:es-MX+f.r1:v5:…` en el `MISS` **y** en el `HIT` |
| El payload se guarda y se sirve | `HIT` con **1 comando / 0 requests** |
| El respaldo no falla en Vercel | **`0 fallos`** sobre 47 llamadas y 85 títulos reparados |
| Nada roto en la navegación | 100 eventos, 49 rutas, **0 errores 5xx** |
| El aislamiento, por tercera vía | **682 comandos contados y `0 requests` reales**: se contabiliza el patrón de acceso pero no sale un solo round-trip a Upstash |

**Ese `MISS` es de `d,m,n,p` (cuatro plataformas), no de `n,d,m`**, porque la
forma de forzar un arranque en frío fue agregar Prime Video. Sus 682 comandos y
47 llamadas de respaldo **no se comparan** contra los topes de la tabla de
aceptación, que son de tres plataformas. Lo que sí vale de acá es lo que no
depende del tamaño: la huella en la clave, el `0 fallos` y el `0 requests`.

**Un detalle del log que confirma otra cosa, de paso**:
`[ejes] aud-family/tv: "hondo" trajo 1 (piso 24), se cae a "pop" con 69` — el
guard de ejes que no puede llenar, funcionando en producción real.

### La activación, ya ejecutada (queda como receta)

Los cuatro pasos se corrieron el 2026-08-24 y están cerrados. Se conservan
porque son la receta de cualquier cambio futuro de `IDIOMA_TITULOS`:

1. Borrar las seis variables de rama (comando en `MANTENIMIENTO.md`).
2. `IDIOMA_TITULOS=es-MX` en **Production**.
3. Redeploy de producción (editar la variable **no** toca ningún deployment
   existente).
4. `scripts/precalentar-home.mjs --base=… --aplicar`, con las combinaciones que
   decida el dueño.

### Archivos ajenos, sin registrar y a propósito

Estos **cuatro** son del dueño, son **preexistentes** y **no** pertenecen a
ninguna rama de idioma:

| Archivo | Cómo está protegido |
|---|---|
| `prompts/noticias-filtro.md` | aparece como `??`; hay que no agregarlo a mano |
| `prompts/noticias-redaccion.md` | ídem |
| `supabase/migrations/004_news.sql` | ídem |
| `.claude/settings.local.json` | **`.gitignore` del repo** |

**El cuarto faltaba en esta lista y estaba peor protegido que los otros tres.**
`git status` no lo mostraba, y eso no era porque estuviera a salvo: lo tapaba el
ignore GLOBAL de esta máquina (`~/.config/git/ignore`). En cualquier otro clon,
un `git add -A` lo habría incluido — y es configuración de permisos, no del
proyecto. Ahora está en el `.gitignore` del repo, así que la protección viaja
con él. `.claude/settings.json` y `.claude/launch.json` **sí** se versionan: esa
es la parte compartida.

La tabla `news_items` ya está aplicada en la base, pero su migración sigue sin
versionar — es una decisión pendiente del dueño, no un olvido.

**Al preparar commits, agregar rutas explícitas y nunca `git add -A`**: fue así
como se colaron en un commit de esta rama, y hubo que sacarlos con
`git rm --cached` (que no toca la copia de trabajo).

## Disponibilidad centralizada + selector en "Últimos lanzamientos" (2026-08-30)

> ⚠️ **Supersedido (auditoría del 19/10/2026).** Mergeada en `main` (`3b075b7`) y desplegada. "No mergeada" y "lista para integrar" son del 30/08.

Rama `fix/disponibilidad-oficial`. **No mergeada al escribir esto.**

- **Un solo resolvedor** decide "está en X" para toda la app
  (`lib/disponibilidad.ts`). Antes cada superficie decidía sola: por eso el
  arreglo de Moria vivía sólo en la ficha.
- **Evidencia oficial** para títulos cuyo dato regional TMDB no tiene
  (`lib/enlace-oficial.ts`). **Al integrarse cubría sólo Disney+ y sólo series**;
  desde `feat/evidencia-oficial` cubre **seis plataformas en series y cuatro en
  películas**, con procedencia `oficial-probable`. Ver el bloque de más abajo.
- **Registro manual versionado** (`lib/excepciones-disponibilidad.ts`), **vacío**:
  el caso testigo se resuelve por la regla general, no por una excepción.
- **"Últimos lanzamientos · Series"** mezcla la fuente regional con candidatos
  por red oficial (`lib/ultimos.ts`). El catálogo regional se pagina hasta
  `total_pages` de TMDB —**sin ventana fija**, que fue una regresión corregida
  dos veces—; lo acotado es sólo el suplemento por redes. Las páginas no repiten
  ni saltean porque el orden regional es el de TMDB, estabilizado, y un extra
  entra recién cuando el stream pasó su fecha.
- **Guardas de entrada**: sin plataformas válidas no se pide una sola página, y
  `page` se normaliza a un entero ≥ 1. Una página imposible se descarta con una
  consulta, no recorriendo el catálogo.
- **El riel estrenó selector Películas/Series.** Default Películas: el Home
  inicial no cambia. Clave del Home **`v5` → `v6`**.
- **Sin SQL, sin migraciones, sin escrituras en Supabase.**

Verificado sobre el build local: `tv:275224` pasa de `[]` a `["d"]`, aparece
primero por fecha en el riel en Series, no aparece sin Disney+ elegida, y los
títulos con proveedor de TMDB no cambian.

**Estado de verificación al 2026-08-30:** suite **757/757**, `tsc` 0, build OK.

✅ **Prueba manual APROBADA por el dueño**, sobre el build de producción corrido
en local (`next start` en el 3100). Se verificó el recorrido completo: el Home
abre, "Últimos lanzamientos" arranca en Películas, el selector cambia el
contenido de verdad, "Gutiérrez Is mai neim" aparece con Disney+ elegida, su
ficha muestra Disney+ y no dice "No está en streaming", volver atrás conserva la
navegación, "Ver todas" funciona, y volver a Películas actualiza el riel. Sin
regresiones visibles en una película y una serie conocidas.

⚠️ **El Preview se OMITIÓ por decisión del dueño.** El aislamiento del Redis de
Producción exige crear variables `KV_*` vacías acotadas a la rama, y se prefirió
no tocar variables de Vercel. La prueba local cumplió la misma función con
aislamiento verificado: `/api/health` devolvió `503` con `cache: "memoria"`,
`fuente: null` y `credenciales: {url:false, token:false}`, o sea sin Redis de por
medio.

🔴 **Lo que la prueba local NO puede cubrir**, y hay que mirar después del
deploy: el comportamiento con Redis real. Local corre en memoria, así que las
claves nuevas (`home:…v6`, `pv3:`, `ultimos:`, `disp:`, `oficial:`) no se
ejercitaron contra Upstash. El primer Home de producción va a ser un arranque
frío.

**La rama queda LISTA PARA INTEGRAR.**

Los conteos anteriores de este documento (678) eran de una revisión intermedia.
El 771 que figuró un rato acá **era incorrecto**: salió de contar antes de
eliminar `combinarUltimos`, que era código muerto y se llevó sus ~24 tests. Y el
751 que lo reemplazó quedó corto por seis en el mismo commit que lo escribió, al
trasladar la cobertura de esa función al orquestador real.

⚠️ **Un conteo escrito a mano se desactualiza en el commit siguiente.** Vale como
foto fechada de una verificación, no como dato vivo: el número real lo da
`npm test`.

⚠️ **Lo que no se pudo verificar en vivo:** el respaldo del top de Netflix. Es
el issue **#13**: el cron corrió el 25/08 a las 12:58 UTC, pero la guarda mide
14 días desde `week` y el ranking más nuevo de Netflix es del 2026-08-16, así que
volvió a vencer. **Moria NO está resuelta hoy**, ni acá ni en `main`. La regla
está cubierta por 23 tests apuntados al resolvedor.

## Top semanal manual — rama `feat/top-manual` (2026-09-01)

> ⚠️ **Supersedido (auditoría del 19/10/2026).** Mergeada (`c993d7c`) y desplegada; el dueño usa `/admin/top` desde el 09/09, evidencia funcional INDIRECTA de la migración 007 (no hay comprobación directa de que el archivo se haya ejecutado íntegro); las dos cuentas administradoras tienen dos factores TOTP (comprobado sólo lectura el 19/10). Que `verificar-007.sql` se haya corrido NO tiene registro.

**Sin mergear y SIN EJECUTAR LA MIGRACIÓN al escribir esto.** Falta la prueba
manual del dueño.

`/top` pasa a cargarse a mano: doce bloques (seis plataformas × dos tipos) que
el dueño arma, revisa y publica desde `/admin/top`. Ver el bloque de `CLAUDE.md`
para las reglas; acá va lo que hay que saber para operarlo.

**Pendiente de ejecutar:** `supabase/migrations/007_top_manual.sql`. No se corrió
en ningún entorno.

### 🔴 EL PRÓXIMO GATE ES UNA BASE DE VERDAD, NO MÁS TESTS DE TEXTO

Los tests de `npm test` barren el TEXTO del SQL: comprueban que una protección no
desaparezca del archivo, **no que Postgres se comporte**. Tres auditorías
encontraron cosas que un barrido no podía ver —la más clara, que
`revoke select (columna)` no hace nada si el rol tiene `select` de tabla, porque
los privilegios son aditivos—.

Antes de mergear hay que aplicar la 007 en un **Supabase local o una rama
descartable** y correr `supabase/verificar-007.sql`, que ejecuta consultas
reales: privilegios de columna, la columna derivada, los triggers que desmarcan
la revisión, el índice de un solo borrador y la inmutabilidad de lo publicado.
Termina en "VERIFICACIÓN COMPLETA" o revienta.

Ese archivo **no es una migración** y no se aplica solo. **No correrlo en
Producción**: escribe y borra filas.

Lo que ese script no puede probar —todo lo que necesita una sesión real, porque
`auth.uid()` y `auth.jwt()` son nulos en el SQL editor— está listado al final del
propio archivo y se verifica desde el dashboard: los dos factores TOTP, publicar,
el borrador siguiente precargado, la atomicidad del reemplazo, la publicación
parcial y `creado_por`.

⚠️ En la máquina de desarrollo no hay Docker, `psql` ni Postgres local
(verificado, no supuesto), así que este paso **no se pudo hacer todavía**. Hace
falta Docker Desktop para `supabase start`, o una rama de Supabase.

**Pendiente de configurar (lo hace el dueño):** habilitar TOTP en el panel de
Supabase → Authentication → Multi-Factor Authentication. Sin eso, `/admin/mfa`
no puede inscribir un factor y el dashboard queda inaccesible.

### El cutover, que es lo que hay que entender antes de tocar nada

Mientras falte cualquiera de los doce bloques publicados, **`/top` entero sigue
con la implementación vieja**. El dashboard muestra "Preparación inicial: X de
12 publicados". Con los doce, `/api/top` cambia de fuente sin desplegar nada.

Después del primer cutover los borradores pendientes no afectan: cada bloque
conserva su última versión publicada.

### Lo que NO cambia

- El selector `Películas | Series`, `Tus plataformas`, `En otras plataformas`,
  el carrusel por plataforma, el ranking numérico, `TitleCard`, la apertura de
  la ficha, las acciones rápidas y la restauración de scroll vertical y
  horizontal. **`TopBlock` conserva su forma** (`mine`, `others`, `fallos`,
  `degradado`, `slots` 1–10); lo único que cambia es el valor de `source` y el
  subtítulo.
- El cron semanal de Netflix **sigue corriendo**: alimenta la evidencia de
  disponibilidad, no el ranking. Ver `CLAUDE.md`.
  *(Supersedido el 20/10/2026: el dueño apagó Cron Jobs; el Top de Netflix se
  carga a mano. Ver "Resumen vigente", pendiente 3b.)*
- Las reseñas editoriales siguen en standby y sus policies **no se tocaron**.

## Evidencia oficial general — rama `feat/evidencia-oficial` (2026-08-31)

> ⚠️ **Supersedido (auditoría del 19/10/2026).** Mergeada (`9c4d595`) y desplegada. Las menciones al issue #13 "abierto" quedaron viejas: se retiró el 09/09.

**Prueba manual local APROBADA por el dueño el 2026-08-31. Lista para
integrar.** Ver el bloque de cierre al final de esta sección.

Generaliza lo que la tanda anterior había dejado atado a **una** plataforma y a
**series**.

- **`tmdb-ar` sigue siendo la evidencia prioritaria.** Si TMDB informa cualquier
  `flatrate` argentino —aunque Yump no mapee ese proveedor— **ningún respaldo se
  consulta ni se aplica**.
- **`oficial-probable`** (antes `enlace-oficial`) cubre **seis plataformas en
  series** y **cuatro en películas**. Series: red + enlace. Películas: dominio y
  ruta oficial específica, **sin `networks`**. Max y Paramount+ **no** se
  infieren para películas: midieron 0 de 30.
- **El criterio es cobertura, no certeza**, por decisión del dueño: mejor mostrar
  ocasionalmente algo que no está, que ocultar mucho que sí está. Medido contra
  verdad de campo: **144 + 22 aciertos, cero falsos positivos**.
- **`pv3:`** guarda un resumen regional compacto —cuántas regiones hay, cuántas
  informan cada plataforma, cuántas ninguna— en vez de ids deduplicados, que
  perdían la frecuencia. Medido: **170 B/título contra 197**, o sea más chico.
- **`oficial:`** reemplaza a `serie:oficial:` y cubre los dos tipos.
- **Moria ya no depende del Top 10** para su disponibilidad: resuelve Netflix por
  enlace oficial, que no vence.

🔴 **El Top 10 NO se tocó, y su issue #13 sigue abierto**: el ranking vuelve a
vencer porque la guarda mide 14 días desde `week`. Que Moria ya no lo necesite
para la ficha no arregla el bloque "Lo más visto esta semana", que sigue cayendo
a "Lo más popular ahora" cuando la evidencia vence.

### Identidad oficial y deduplicación de la búsqueda — APROBADO

**El problema no era la disponibilidad: era que TMDB tiene el mismo programa
cargado dos veces.** `tv:322428` y `movie:1752041` son la misma obra, una como
serie y otra como película, y la búsqueda mostraba dos cards — una en color y
otra en gris.

- **`netflix.com/browse?jbv=<n>` cuenta como ruta de título.** `/browse` pelado
  se sigue rechazando: es una portada. El parámetro exige ruta exacta, un único
  valor y forma numérica. Medido: de 80 series de Netflix con `homepage`, 71
  usan `/title/<n>` y **1** usa `?jbv=`. Es el mismo número en las dos formas.
- **Cada ruta valida Y extrae**: el grupo 1 del regex es el identificador, así
  que la identidad no puede divergir de lo que la regla acepta.
- 🔴 **La deduplicación es por identidad oficial, NUNCA por parecido.** No se
  compara título, fecha, productora, sinopsis ni similitud textual: esas señales
  esconden obras legítimamente distintas. **Lo que no tiene identidad oficial no
  se toca**, y gana el primero, que no es un criterio nuevo — la lista ya venía
  ordenada por relevancia.
- Medido sobre **540 títulos** de las seis plataformas: 366 con identidad y
  **0 colisiones**.

**Lo verificado a mano y aprobado por el dueño:** el duplicado `movie:1752041`
desaparece; **`movie:401445` —otra película llamada "Moria", de 2018— PERMANECE**
porque no comparte identidad, que es exactamente lo que tiene que pasar; Moria
serie figura en Netflix; Gutiérrez (`tv:275224`) conserva Disney+; navegación y
comportamiento general aprobados.

### El idioma visual ya no mueve la disponibilidad — APROBADO

`homepage` es un campo **localizado** de TMDB, y el lector de evidencia lo pedía
con el idioma base. Es decir que `IDIOMA_TITULOS` —una variable que existe para
elegir cómo se escriben títulos y sinopsis— **decidía si un título estaba en
Netflix o quedaba en gris**.

🔴 **No se arregló poniéndole huella de idioma a `oficial:`.** Eso arregla la
caché y deja el bug: seguirían existiendo dos respuestas para el mismo título.
Se arregló la **fuente** (`IDIOMA_EVIDENCIA = "es-ES"`, literal, sin leer el
entorno), y por eso esa clave **puede** seguir sin huella. Hay tests que atan las
dos mitades. Cuesta **cero llamadas nuevas**.

⚠️ **`en-US` daría más cobertura y no se tomó**: 248 identidades contra 217
(gana 32, pierde 1). Se eligió `es-ES` porque es lo que la app resuelve hoy —
fijarlo no mueve ni un título— y porque lo que `en-US` pierde son los casos del
tipo del testigo. **Queda como decisión abierta.** Ver
`docs/medidas/2026-08-31-idioma-evidencia.md`.

### Cierre: qué queda integrado y qué NO

**Preview de Vercel OMITIDA**, por decisión del dueño y como en la tanda
anterior: se probó en local en modo Producción, con caché en memoria y fecha
argentina real.

Lo que este trabajo **NO** arregla, y conviene no darlo por cerrado:

> ⚠️ **Supersedido (auditoría del 19/10/2026).** Filas viejas de esta tabla: **#13** se retiró de abiertos el 09/09; **Capacitor** está integrado en `main` con CORS (`lib/cors.ts`, merge `fd2cd23`), el AAB apunta a Producción y ya hubo AAB 2 y 3 en Alpha; el repo está en `versionCode 4` / `1.2.0`. Ver "Resumen vigente".

| | Estado |
|---|---|
| **Issue #16** (catálogo regional incompleto) | **MITIGADO, no resuelto.** La regla cubre seis plataformas en vez de una, pero sigue sin poder medirse cuánto falta |
| **Issue #13** (cron del Top 10) | **ABIERTO.** No se tocó |
| **"Próximamente"** | **La causa de descubrimiento quedó corregida** el 2026-09-01 (issue #8). La segunda —el filtro de proveedor AR de `sync-upcoming.ts:224`— **se conserva a propósito**: es la decisión del dueño, no un pendiente |
| **Capacitor** | **ETAPA 2 TERMINADA (CP1-CP11)**: viable en Android. El spike descartable queda archivado en `spike/capacitor-android` (`5d5180f`). ✅ **ETAPA 3 TERMINADA** (4 tandas) y ✅ **ETAPA 4 TERMINADA** (7/09) en `integracion/capacitor-base` (`991e656`), nacida de `main`, **sin pushear y sin mergear**. Etapa 4 cierra con: íconos y pantalla de inicio nativos aprobados en el teléfono; `main` (`8b422fa`) integrado, así que Próximamente y "¿No sabés qué ver?" ya viajan en el contenedor con `apiUrl`, CORS y rutas nativas compuestos; y **recordatorios locales de estreno v1**, probados en el teléfono el 7/09 — permiso contextual, aviso a las 10:00 locales del día del estreno, cancelación con el segundo toque, apertura de la ficha correcta, y el mismo flujo en la tarjeta de Próximamente y en la ficha. Permisos finales: `INTERNET`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, **sin alarma exacta**. Quedan abiertos, y pertenecen a la Etapa 5: keystore y Play App Signing, ficha de Play, prueba cerrada, y **qué API usa el build de Play** (hoy el artefacto apunta a la Preview). Fuera de Capacitor queda el **404 propio**, que se ve pero responde 200. **ETAPA 5 EN CURSO**: el build de Play ya apunta a Producción (`--release --api-base=https://app.yump.ar`), con DOS guards que hacen fallar la release —uno mira la base pedida y otro los bytes que se van a empaquetar— y firma de carga desde `android/keystore.properties`, fuera de Git, **sin respaldo a la clave de depuración**. `versionCode 1`, `versionName 1.0.0`, `debuggable false`. Frenado a propósito en la creación de la clave, que es del dueño. 🔴 **Producción todavía no tiene CORS** (`lib/cors.ts` no existe en `origin/main`): el AAB no va a funcionar en el teléfono hasta que esta rama se mergee y se deploye. Ver `docs/superpowers/plans/2026-09-05-etapa3-android-publicable.md` §17 y §19 |
