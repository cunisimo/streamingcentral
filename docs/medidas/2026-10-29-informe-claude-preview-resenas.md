# Reseñas: correcciones de la auditoría E0 y checklist de la Preview (29/10/2026)

Claude, en `feat/resenas-reglas` desde `35235d4`, sobre
`2026-10-29-auditoria-e0-lanzamiento-35235d4.md`.

**Este es el informe vigente del lanzamiento web**; el de E0 queda como
antecedente, corregido. Nada remoto se escribió: ni SQL de escritura, ni
permisos, ni variables, ni push, merge, deploy o activación.

## 1. Corregido

- **A1, reversión de la 022.** `022_down` **no reabre nada**: sólo comprueba
  que `user_reviews` y su trigger sigan existiendo. El cierre se conserva
  aunque se revierta la web; reabrir sería otra decisión y otra migración. No
  cambié ese SQL. Corregí también:
  - **Respaldo:** no hay copias automáticas, pero un respaldo manual
    (`supabase db dump`) sigue siendo posible antes de una bajada.
  - **Vuelta atrás de la web:** «instantáneo» pasa a «Instant Rollback o
    Promote, el mecanismo disponible se confirma en el panel».
  - **Capacidad:** 27 MB y 60 conexiones no alcanzan para afirmar holgura.
  - **Autoconfirmación:** las 41 cuentas confirmadas al instante la
    *sugieren*; la configuración de Auth no se consultó.
  - **Decisiones ya tomadas:** colas revisadas a diario; plazos de E8, con
    las excepciones pendientes de validación.
- **A2, saltos de línea.** `lib/comunidad/purga.test.ts` normaliza sólo
  `\r\n` → `\n` al leer. No cambian la purga ni las comprobaciones. Nuevo
  `scripts/crlf-sql.mjs`, un preload de prueba que sirve todos los `.sql` con
  CRLF en memoria, sin tocar archivos.
  - **Los 21 archivos de test que leen `.sql`:**
    - LF: 319/319;
    - CRLF simulado, antes de la corrección: 317/319 (los 2 de la auditoría);
    - CRLF simulado, después: **319/319**.
  - **Con archivos CRLF reales** (una copia con `sed 's/$/\r/'`):
    - test anterior: 8/10;
    - test corregido: **10/10**.
- **A3, `user_reviews`.** Consulta de catálogo en sólo lectura sobre
  Producción (`begin transaction read only; … rollback;`):
  - el trigger `user_reviews_protect_estado` (`BEFORE INSERT OR UPDATE`)
    existe y está habilitado (`O`);
  - su función `protect_review_estado()` es igual a la de `schema.sql`:
    con rol `authenticated`, fuerza `pendiente` al insertar y conserva el
    estado al actualizar;
  - default `'pendiente'` y CHECK de estados.

  **No hay autopublicación: retiré esa afirmación.** La 022 se mantiene,
  porque la escritura directa del autor y la lectura anónima no son el
  contrato del módulo nuevo.

## 2. Vercel: sin acceso

La sesión de la CLI venció el 21/09 (403) y el panel no tiene sesión abierta.
No inicié sesión. **Una sola acción para habilitarlo:** iniciá sesión en
`vercel.com` en el panel de navegador de esta app y avisame. Con eso leo,
sin cambiar nada:
- los nombres y entornos de las variables;
- la protección de las Previews;
- el uso;
- el mecanismo de vuelta atrás.

Hasta entonces esos puntos siguen **sin verificar**. No se enciende el módulo
antes de verificarlos.

## 3. Checklist remoto, listo para autorizar

En orden. Cada paso con su verificación. **Detener** siempre significa apagar
los interruptores: no borra datos.

**A. Integración local** (autorizar: fusionar `origin/main` = `ca02c4f` en la
rama, sin push)
1. `git merge origin/main`. Conflicto sólo en `docs/ESTADO.md`: dos entradas
   nuevas en «Evidencia y alcance». Se conservan las dos, primero la de `main`
   (29/10, «Elegidas para vos») y después la de la rama. El código entra
   limpio (fusión de prueba ya hecha y descartada).
2. Una sola vez, sobre la integración:
   - `npx tsc --noEmit --incremental false`
   - `npm test`
   - `npm run build`
   - `node --test scripts/comunidad/*.test.mjs scripts/sala/*.test.mjs`
   - los 21 tests de `.sql` con `--import ./scripts/crlf-sql.mjs`

   Todo en verde. Esto conserva el arreglo de «Elegidas para vos»: la
   Preview sale de la rama ya fusionada.

**B. Vercel, lectura** (requiere la sesión de la sección 2)
1. Las variables de **Preview** apuntan a la base de Producción y tienen
   `SUPABASE_SERVICE_ROLE_KEY` y `TMDB_READ_TOKEN`.
2. **Deployment Protection** activa para las Previews (Vercel
   Authentication).
3. El uso está dentro de los límites del plan.
4. El mecanismo de vuelta atrás disponible.

**C. Secreto** (lo hacés vos; el valor nunca pasa por el chat ni por archivos)
1. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   en tu terminal.
2. Vercel → Settings → Environment Variables: `COMUNIDAD_HMAC_DUPLICADOS`,
   **Sensitive**, entornos **Production y Preview** con el **mismo valor**
   (comparten la base).
3. Vale para los deploys nuevos: la Preview del paso E ya lo toma.

**D. Base de Producción** (autorizar SQL remoto; lo corro yo con
`supabase db query --linked -f`)
1. **Opcional:** respaldo manual del esquema,
   `supabase db dump --linked -f respaldo-esquema.sql`. Va fuera del repo.
2. Aplicar `022_cerrar_user_reviews.sql`.
3. Aplicar `011` … `021`, **en orden y de a uno**. Cada archivo trae su
   transacción.
4. **Verificar después de cada uno:** `e0-produccion.mjs sql` → consulta de
   sólo lectura → `comparar`. Esa migración tiene que dar «presente».
5. **Al final:** `e0-produccion.mjs permisos-sql` → `comparar-permisos`
   → ✔. Y en lectura, `select modulo_activo, publicacion_activa,
   top_yumpers_activo, muestreo_activo from comunidad.config;` → todo `false`.
6. **Humo con la web y la app actuales** (vos): entrar, ficha y pulgar
   funcionan igual.
7. **Detener:** no hace falta; con todo apagado no hay efecto visible. Bajar
   con `021_down` … `011_down` sólo sin datos reales.

**E. Preview** (autorizar el push de la rama; no es `main` ni deploy de
Producción)
1. `git push origin feat/resenas-reglas`: Vercel arma la Preview.
2. **Verificar:**
   - deploy `success`;
   - la URL pide el login de Vercel (protección);
   - con todo apagado, la ficha muestra sólo la reseña de Yump.

**F. Encender para tu prueba** (autorizar)
1. `update comunidad.config set modulo_activo = true, publicacion_activa = true where id;`
   El **Top Yumpers queda apagado**.
2. **Mientras dure, qué ve el público:**
   - **web pública y Android 1.2.0:** nada, porque su código no tiene el
     módulo;
   - **la Preview:** sólo quien pase la protección de Vercel;
   - **por la API de Supabase**, cualquier usuario con sesión **puede leer**
     lo que publiques (`comunidad_resenas`, `comunidad_perfil`,
     `comunidad_top_yumpers`). **No puede escribir.** La protección de la
     Preview no cubre esto.
   - **Los datos:** la Preview no los aísla; se escriben en Producción.

**G. Tu prueba** (unos 15 minutos, con dos cuentas ficticias nuevas y textos
ficticios; no se usa el arnés local)
1. En la Preview, crear la cuenta A → ficha → RESEÑAS → aceptar los términos
   (borrador) → publicar, editar y borrar. Un texto con teléfono se rechaza;
   pedir revisión.
2. Con la cuenta B: «Me sirvió», órdenes, denunciar, bloquear y desbloquear.
3. Perfil (`/u?id=…`) y nombre comunitario.
4. `/admin/moderacion` con tu cuenta adicional de administración: resolver la
   revisión y la denuncia.
5. «Elegidas para vos» en el Home sigue reponiéndose al descartar.

**H. Apagar y limpiar** (antes del 31/10 a las 23:59 de Argentina)
1. `update comunidad.config set modulo_activo = false, publicacion_activa = false where id;`
2. Dar de baja las cuentas A y B desde la Preview (Cuenta → Eliminar). La baja
   nueva borra o desvincula lo comunitario.
3. **Verificar en lectura:** 0 reseñas vivas y 0 participantes vinculados.

**Después, con autorización aparte:**
- fusión en `main` y deploy de Producción (con todo apagado);
- apertura E9c: legales, términos aprobados y texto de baja.

## 4. Resultados de esta entrega

| Control | Resultado |
|---|---|
| Tests que leen `.sql` (21 archivos), LF | 319/319 |
| Ídem, CRLF simulado (antes → después) | 317 → **319/319** |
| `purga.test.ts` con archivos CRLF reales (antes → después) | 8 → **10/10** |
| Consulta A3 en Producción | sólo lectura, con `rollback` |
| Vercel | sin sesión (sección 2) |

No corrí la suite completa, el tipado ni el build: van una vez, sobre la
integración del paso A.
