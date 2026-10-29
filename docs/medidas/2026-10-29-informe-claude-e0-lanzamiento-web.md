# Reseñas: E0 y preparación del lanzamiento web (29/10/2026)

Claude, en `feat/resenas-reglas` (desde `09f2a9b`). Autorizado: E0 (sólo
lectura de Producción y paneles), documentación y scripts de verificación.
**No se ejecutó el lanzamiento:**
- no se aplicó SQL remoto;
- no se cambiaron permisos, variables ni interruptores;
- no hubo push, merge, deploy, cron, gastos, AAB ni cambio de versión.

Evidencia: `2026-10-29-e0-resenas-salidas.txt`. Herramienta nueva:
`scripts/comunidad/e0-produccion.mjs`, con 5 tests. Genera consultas de sólo
lectura y las compara con lo que declaran las migraciones.

## 1. Lo comprobado (E0) y lo pendiente

**Cómo:** con `supabase db query --linked` y la sesión de la CLI guardada en el
llavero. Cada consulta es una transacción `begin transaction read only; …
rollback;`, comprobada (`transaction_read_only = on`). Se registraron sólo
agregados y nombres de objetos.

**Efecto lateral, declarado:** el mecanismo de conexión de la CLI crea o
renueva en Producción su rol de servicio `cli_login_postgres` (sin
superusuario, contraseña que vence en 1 h). No es una escritura de datos ni de
configuración de la app, pero es un objeto de Auth de la base.

**Comprobado en Producción** (Postgres 17.6, proyecto sano):
- **Migraciones, por catálogo y no por documentación:**
  - 001–003 y 006–010: presentes.
  - 005: sin objetos comprobables por catálogo.
  - **011–021: AUSENTES.** No existe el esquema `comunidad` ni ninguna
    `public.comunidad_*`.
  - **022: no aplicada.** `user_reviews` conserva sus dos políticas y `anon` y
    `authenticated` tienen todos los privilegios.
  - `supabase_migrations.schema_migrations` existe, pero con sólo 3 entradas
    sueltas: ESTADO decía que no había tabla; no sirve como registro.
- **`user_reviews`:** 0 filas. Hoy cualquier usuario con sesión puede
  insertar ahí por la API una fila propia con `estado = 'aprobada'`, porque la
  política sólo exige ser el autor. Esa fila queda legible para `anon`. La app
  no la muestra, pero es una vía abierta, y la 022 la cierra.
- **Privilegios por defecto de `public`:** los viejos de Supabase. Toda tabla
  o función nueva nace con todos los permisos para `anon` y `authenticated`.
  - **La base local** (CLI nueva) es estricta: por eso a la local le faltaban
    permisos de API y **la batería local de permisos (29/29) no prueba lo
    mismo que Producción**.
  - **Revisión estática:** las 36 funciones `public` que crean 011–022 revocan
    explícitamente a `public`, `anon` y `authenticated`, y ninguna migración da
    `USAGE` sobre `comunidad`.
  - **Verificación tras aplicar:**
    `e0-produccion.mjs permisos-sql` / `comparar-permisos`. Validada en local
    (✔) y con un test de casos malos.
- **Tablas que usa la web:** `profiles`, `votes`, `user_items`,
  `view_history`, `editorial_reviews` y `providers` tienen SIUD para `anon` y
  `authenticated`, con RLS en todas las tablas de `public`.
- **Cuentas:**
  - 41 en total, todas con correo y contraseña; 2 admins y 4 factores TOTP
    verificados.
  - **Las 41 se confirmaron en menos de 5 s:** el alta no exige confirmar el
    correo. **La condición P4 está activa** y la decisión es tuya.
- **`is_admin_mfa()`:** exige admin, `aal2` y 2 factores TOTP, como el repo.
- **`auth.users`:**
  - un solo trigger, `on_auth_user_created`;
  - FK en cascada desde `profiles`, `votes`, `user_items`, `view_history`,
    `user_reviews` y `rooms`;
  - nada de la comunidad.
- **`cron`:** `tmdb-sync-upcoming-daily` y `sala-barrido` (no se leyeron los
  comandos). El historial `cron.job_run_details` tiene 46.035 filas desde el
  02/08 y ocupa 7 MB.
- **Capacidad:**
  - la base ocupa **27 MB**;
  - `max_connections` es 60;
  - extensiones: `pgcrypto`, `pg_cron`, `pg_net`, `uuid-ossp`, `vault` y
    `pg_stat_statements`.
- **Copias de seguridad:** `backups: null`, **PITR desactivado** (propio del
  plan Free). Nada se puede «restaurar»: revertir es bajar con los `_down`, y
  eso borra lo que la comunidad haya escrito.
- **Web en Producción:** `ca02c4f`, desplegado hoy (`success`, 7419487297), con
  el arreglo de «Elegidas para vos» (`50ebc93`, 7419445647).

**Pendiente, sin acceso:**
- **Vercel:** la sesión de la CLI venció el 21/09 (403) y el panel no tiene
  sesión. No inicié sesión. Falta ver:
  - las variables por entorno: si existe `COMUNIDAD_HMAC_DUPLICADOS` y si las
    Previews apuntan a la base de Producción;
  - la protección de las Previews;
  - el uso y la retención de logs.
- **Supabase:** el plan exacto, el cupo de correos de Auth y el uso mensual no
  salen de la CLI.

## 2. Compatibilidad con Android 1.2.0 (instalado)

La app instalada usa el servidor (`app.yump.ar`) y la misma base. Revisión de
código de la rama frente a `main` desplegado:

| Función | Qué cambia con 011–022 aplicadas y la web nueva | Veredicto |
|---|---|---|
| Inicio de sesión | Nada en `auth`: ni triggers ni FK nuevas sobre `auth.users`; las de la comunidad apuntan DESDE `comunidad.participantes`. | Compatible |
| Ficha (`/api/title`) | Con todo apagado es idéntica byte a byte (8/8 en E9a). Las reseñas de la comunidad **nunca** viajan en `/api/title`: se piden aparte, con sesión. Aun con el módulo encendido, la app 1.2.0 no las ve. | Compatible |
| Votos (pulgares) | `public.votes` no se toca (ninguna migración la referencia). | Compatible |
| Eliminar cuenta | Mismo pedido y misma respuesta de éxito. El servidor nuevo llama primero a `comunidad_baja_comunitaria` (012). Si falla a medias responde 500 con `baja-parcial` o `baja-sin-verificar`, y la 1.2.0 muestra su error genérico, que también es cierto. | Compatible **sólo con 012 aplicada antes del deploy** |
| Servidor viejo + base nueva | Si se revierte la web: `deleteUser` → `ON DELETE SET NULL` → la red de seguridad limpia lo comunitario. Sin participante, no hace nada. | Compatible |

**Regla de orden: la web nueva nunca va antes que 011–022.** Sin el esquema,
la baja de cuenta fallaría y la ficha pediría funciones inexistentes.

## 3. Git frente a `main`

- **Situación:** `origin/main` = `ca02c4f`. La rama sale de `915ef2e` y `main`
  tiene 3 commits nuevos: el arreglo de «Elegidas para vos» y sus docs. La
  rama no toca ninguno de esos archivos de código.
- **Fusión de prueba** (copia temporal, sin commit, ya borrada): **sólo
  `docs/ESTADO.md` en conflicto**; el código entra limpio. Sobre el resultado:
  - `tsc` da 0;
  - `npm test` da 2518 que pasan, 18 omitidas y **2 que fallan**: «barrido
    021». **No es la fusión:** en una copia nueva de Windows,
    `core.autocrlf` deja `021_comunidad_purga.sql` con CRLF y esos dos tests
    comparan texto con `\n`. En la rama (LF) pasan 10/10. Vercel compila en
    Linux. Se puede arreglar normalizando `\r\n` en el test o fijando
    `*.sql eol=lf` en `.gitattributes`; no lo cambié.
- **Para integrar:** fusionar `origin/main` en la rama, quedándome con las dos
  versiones de ESTADO, y repetir `tsc`, `npm test` y `npm run build`. **El
  deploy de Producción sale de `main` fusionado**, nunca de la rama vieja.

## 4. Lanzamiento: orden exacto, verificación y reversión

**Interruptores apagados desde el principio:** la 011 crea `comunidad.config`
con todo apagado, la purga apagada y sin `cron`.

| # | Paso | Cómo se verifica | Cómo se detiene o revierte |
|---|---|---|---|
| 0 | Foto previa: `e0-produccion.mjs sql` → `comparar`, más los conteos de la sección 2 de las salidas | Igual a E0 | — |
| 1 | Aplicar **022** (SQL Editor, un archivo) | `user_reviews`: 0 políticas, sin privilegios de `anon` ni `authenticated`; la app sigue igual | `022_down` restaura las políticas (no hay datos que perder) |
| 2 | Aplicar **011 → 021** en orden, un archivo por vez | Tras cada una, `comparar`: esa migración «presente». Al final, `comparar-permisos` → ✔, `config` 4×false y purga false | Antes de que entren datos reales, `021_down` → `011_down` en orden inverso. **Con datos reales no se baja: se apaga (paso 7)** |
| 3 | Prueba de humo con la web y la app actuales: entrar, ficha, pulgar y una baja de cuenta de prueba | Funcionan como hoy; la baja de una cuenta sin comunidad no deja restos | Mismo que el paso 2 |
| 4 | Crear `COMUNIDAD_HMAC_DUPLICADOS` en Vercel, **mismo valor en Production y Preview** (comparten base: con otro valor no detectan duplicados entre sí). Aleatorio de 32 o más caracteres, sólo servidor, nuevo, sin el prefijo `local-prueba-` | El panel lo muestra en los dos entornos; publicar en el paso 5 no da «error» | Borrar la variable (la escritura se niega, nada se rompe) |
| 5 | **Tu prueba en una Preview** (sección 5) | Tu recorrido | Apagar con el SQL de la sección 5 |
| 6 | Fusionar en `main` y desplegar Producción, con todo apagado | Home, ficha, `/top`, cuenta y baja igual que antes (E9a: 12 pares iguales); app Android: entrar, ficha, pulgar | **Promote** del deploy anterior en Vercel: instantáneo, compatible (sección 2) |
| 7 | Apertura (E9c): sólo con lo de la sección 6 resuelto. `modulo_activo` y `publicacion_activa`, después `top_yumpers_activo` | Ficha con sesión, panel de moderación | **Detener sin perder datos:** `update comunidad.config set modulo_activo = false, publicacion_activa = false, top_yumpers_activo = false where id;` lo oculta todo y rechaza escrituras al instante; los datos quedan. Pausar sólo la publicación: el panel (`comunidad_admin_publicacion`) |

**Sin copias de seguridad:**
- Lo único destructivo son los `_down` de 011–021, que borran el esquema
  `comunidad` con sus filas.
- Apagar es siempre la primera opción.
- Ninguna migración toca filas existentes de `public` ni de `auth`; la única
  que cambia algo existente es la 022, y sólo permisos y políticas de una
  tabla vacía.

## 5. Tu prueba web antes de abrir al público

**Forma propuesta:** base de Producción con el módulo encendido, una
**Preview** con el código nuevo, y Producción web con el código actual.
- **Preview:** sale del push de la rama fusionada, que requiere tu
  autorización.
- **Encender, sólo durante la prueba:**
  `update comunidad.config set modulo_activo = true, publicacion_activa = true where id;`
- **Top Yumpers:** dejarlo apagado. No hay meses cerrados y los votos de
  octubre entrarían en el ranking que se consolida el 1/11.
- **Al terminar:**
  `update comunidad.config set modulo_activo = false, publicacion_activa = false where id;`

**Qué ve el público mientras dura la prueba:**
- **Web pública y app Android:** nada. Ese código no conoce el módulo.
- **La Preview:** cualquiera que tenga la URL, **salvo que la protección de
  Previews de Vercel esté activa**. No pude verlo; hay que comprobarlo y
  activarlo antes.
- **Por la API de la base**, cualquier usuario con sesión podría **leer** lo
  que publiques (`comunidad_resenas`, `comunidad_perfil` y
  `comunidad_top_yumpers` se conceden a `authenticated`). **Escribir no**: sólo
  pasa por el servidor, o sea por la Preview.
- **La Preview no aísla datos:** lo que escribas queda en Producción.
  - Usá tu cuenta y una segunda cuenta tuya para votar, denunciar y bloquear.
  - Al terminar, borrá tus reseñas de prueba desde la UI y da de baja las
    cuentas de prueba **antes del cierre del mes**.
  - Si no, quedan visibles al abrir, y sus votos cuentan en octubre.

**Antes de tu prueba hay que comprobar:**
- que las variables de Preview apunten a la base de Producción y tengan el
  secreto del paso 4;
- que la protección de Previews esté activa.

**Pasos de tu prueba (resumen de la guía de E9a):**
1. Ficha con sesión → RESEÑAS → aceptar los términos (borrador).
2. Publicar, editar y borrar; un texto con teléfono se rechaza; pedir revisión.
3. Con la segunda cuenta: «Me sirvió», ordenar por Más útiles y Recientes,
   denunciar y bloquear.
4. Perfil (`/u?id=…`) y nombre comunitario.
5. Panel `/admin/moderacion`, con tu cuenta adicional de administración y su
   2FA: resolver la revisión y la denuncia.
6. Dar de baja la cuenta de prueba.

## 6. Pendientes reales para abrir al público

- **Términos:**
  - `yump.ar/terminos` dice hoy que Yump «no publica actualmente reseñas
    personales ni perfiles públicos»: hay que cambiarlo;
  - los términos comunitarios en la app son el borrador `borrador-local-1`.
    Aprobar el texto implica una versión nueva en `lib/comunidad/terminos.ts`
    y en `comunidad.config.terminos_version`, a la vez.
- **Privacidad:** `yump.ar/privacidad` no menciona reseñas, nombre comunitario
  ni perfil público, denuncias y bloqueos, moderación (con su retención) ni
  las huellas HMAC de duplicados.
- **Retención (P3):** plazos validados. Sin eso, la purga y su `cron` quedan
  apagados (hoy lo están).
- **Eliminar cuenta:** el diálogo de la app no menciona las reseñas;
  `yump.ar/eliminar-cuenta` dice «si existieran». Es tu decisión de texto.
- **Cuentas autoconfirmadas (P4):** las 41 se confirmaron solas. Hay que
  decidir si publicar exige correo confirmado.
- **Revisión aceptable (P6):** fijar los topes reales de admisión (hoy 2 por
  autor y 50 global) y si se usa el muestreo.
- **Capacidad:**
  - la base (27 MB) y las conexiones (60) sobran para la comunidad;
  - el historial de `cron` crece unas 1.440 filas por día por `sala-barrido`;
    no es urgente;
  - el uso de Vercel no se pudo ver.
- **Android:** las pantallas llegan en el AAB futuro (E9b), con salas; no en
  esta etapa.

## 7. Lo que requiere tu autorización final

1. **Integración:** fusionar `origin/main` en `feat/resenas-reglas` (conflicto
   sólo en ESTADO), con sus gates.
2. **Base:** aplicar en Producción la 022 y después 011–021, en orden (pasos 1
   y 2), y correr las verificaciones.
3. **Vercel:**
   - crear `COMUNIDAD_HMAC_DUPLICADOS` en Production y Preview;
   - comprobar que las Previews usan la base de Producción;
   - activar la protección de Previews. Lo necesito con acceso tuyo o lo hacés
     vos.
4. **Preview:** hacer push de la rama para generarla.
5. **Prueba:** encender y apagar el módulo para tu prueba.
6. **Producción web:** fusionar en `main` y desplegar, con todo apagado.
7. **Más adelante (E9c):**
   - legales;
   - términos aprobados;
   - P3, P4 y P6;
   - texto de baja;
   - `cron` de purga;
   - apertura.

## Entorno local

`limpiar` deshizo la preparación interrumpida del 29/10 (0 cuentas) usando
sólo la base local, sin tocar la red: limpieza verificada, interruptores y
permisos restaurados, registro quitado. Dos `docker exec` se colgaron por la
inestabilidad de Docker Desktop y uno se cortó a mano; todos los pasos son
idempotentes y la verificación final dio sin restos.
- **Línea base:** 0/0/0, 42 cuentas, editorial 0, sin archivo ni registro.
- **Archivo de recuperación:** guardé una copia fuera del repo, en el
  scratchpad de la sesión.
- **Pendiente:** sigue la reserva de puertos de Windows (WinNAT), que no se
  tocó.
