# Reseñas en la web de Producción, apagadas (29/10/2026)

Claude, con la autorización del dueño del 29/10: integrar, aplicar 022 y
011–021, configurar el secreto de Production y desplegar con todo apagado.
**La Preview se descartó:** la prueba se hace en Producción. Salidas:
`2026-10-29-lanzamiento-web-resenas-salidas.txt`.

## Hecho

- **Integración:** `origin/main` (`ca02c4f`, con «Elegidas para vos»)
  fusionado en `feat/resenas-reglas` (`724c05c`). El único conflicto fue
  ESTADO; se conservan las dos entradas y están las 36 líneas que agregó
  `main`.
- **Controles, una vez:**
  - `tsc` 0;
  - `npm test` 2528 pasan / 0 fallan / 10 omitidas;
  - scripts 55/55;
  - tests de SQL con CRLF 319/319;
  - `npm run build` OK.
- **Respaldo previo, fuera del repo:**
  `D:\DESARROLLO\stream central\respaldos-produccion\2026-10-29-esquema-public-antes-de-resenas.json`.
  - `pg_dump` (por Docker) no llegó a conectar en 300 s, así que el respaldo
    es una lectura del catálogo: 47 funciones con ACL y definición, 23
    tablas, 22 políticas y 13 triggers. Sin secretos.
  - Cubre lo único existente que cambia: los permisos y políticas de
    `user_reviews` que cierra la 022.
- **Migraciones en Producción:** reconfirmé por catálogo que faltaban.
  Apliqué con `supabase db query --linked -f`, en orden: **022, 011, 012, 013,
  014, 015, 016, 017, 018, 019, 020, 021**. Las doce sin errores, y cada una
  dio «presente» antes de seguir. Después de aplicar:
  - **permisos efectivos:** iguales a los de las migraciones (✔);
  - **`user_reviews`:** 0 políticas y sin acceso para `anon` ni
    `authenticated`;
  - **interruptores:** módulo, publicación, Top Yumpers y muestreo, todos
    **apagados**; la purga también;
  - **`cron`:** sin cambios (`sala-barrido`, `tmdb-sync-upcoming-daily`);
  - **datos existentes:** iguales (41 cuentas, 209 votos, 2 editoriales).
- **Deploy:**
  - **Push de la rama:** Vercel armó sola una Preview, que no se usa.
  - **`main`:** `3a58eb6`, merge sin fast-forward. Su árbol es idéntico a la
    rama verificada y los archivos de «Elegidas para vos» no cambiaron.
  - **Deploy de Production:** 7424014089, **success**.
- **Humo en `https://app.yump.ar`, sin sesión:**
  - corre el código nuevo: las rutas de la comunidad responden
    `401 {activo:false}` y no 404;
  - Home, ficha, `/top` y `/cuenta` dan 200;
  - `/api/title` no trae datos de la comunidad;
  - CORS para la app Android (`https://localhost`) responde 204 en
    `/api/title` y `/api/cuenta/eliminar`;
  - «Lo más votados» devuelve 20 títulos;
  - la baja sin sesión da 401.

## Pendiente antes de encender

1. **Secreto** (acción tuya; yo no cargo secretos en formularios y Vercel no
   tiene sesión):
   1. Generalo en tu terminal:
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   2. Cargalo en Vercel → proyecto **streamingcentral** → Settings →
      Environment Variables → Add:
      - Key `COMUNIDAD_HMAC_DUPLICADOS`;
      - el valor generado;
      - Environment: **sólo Production**;
      - **Sensitive** activado.
   3. Guardá y hacé **Deployments → el último de Production (`3a58eb6`) → ⋯
      → Redeploy**: las variables valen sólo para deploys nuevos.

   Sin el secreto, publicar responde «error» y no se guarda nada.
2. **Vercel en lectura:** si iniciás sesión en `vercel.com` en el panel de
   navegador de esta app, leo el uso y confirmo que la variable existe, sin
   ver su valor.
3. **Cuentas:** Producción tiene **41** cuentas en Auth (vos mencionaste unas
   140; quizás contás otra cosa). No cambia nada del plan.

## Encendido (listo; NO ejecutado)

Cuando me avises que estás para probar, corro:

```sql
update comunidad.config set modulo_activo = true, publicacion_activa = true where id;
```

y verifico en lectura que Top Yumpers, muestreo y purga sigan apagados. Para
apagar, al terminar o ante cualquier problema (no borra datos):

```sql
update comunidad.config set modulo_activo = false, publicacion_activa = false where id;
```

Mientras esté encendido, cualquier usuario con sesión en la web puede ver
las reseñas de prueba: lo aceptaste. La app Android 1.2.0 no muestra nada
de la comunidad.

## Tu prueba (unos 20 minutos; no la doy por realizada)

Usá **dos cuentas ficticias nuevas** (A y B) con textos ficticios, no tus
cuentas personales. Por ejemplo, alias `+resenasA` y `+resenasB` de un correo
tuyo. Para moderar, tu cuenta adicional de administración.

0. **Antes de encender:** con la cuenta A en `https://app.yump.ar`
   - Ingresar → crear cuenta → entrar;
   - en `https://app.yump.ar/titulo/movie/550`, dar un pulgar;
   - en la app Android instalada: entrar con tu cuenta, abrir una ficha y dar
     un pulgar. Debería verse igual que siempre.
1. **Avisame y enciendo.**
2. **Cuenta A**, en `https://app.yump.ar/titulo/movie/550` → RESEÑAS:
   - aceptar los términos;
   - **escribir** una reseña ficticia (80–600 caracteres) y **editarla**;
   - probar un texto con un número de teléfono: se rechaza; pedir revisión.
3. **Cuenta B**, en otra ventana o en incógnito, en la misma ficha:
   - **«Me sirvió»** en la reseña de A, y alternar Más útiles / Recientes;
   - menú ⋯ → **denunciar**;
   - menú ⋯ → **bloquear** (A desaparece);
   - `https://app.yump.ar/cuenta/configuracion` → Usuarios bloqueados →
     desbloquear.
4. **Perfil:**
   - tocar el nombre de A → su perfil (`/u?id=…`);
   - en `https://app.yump.ar/cuenta/perfil`, cambiar el nombre en la
     comunidad.
5. **Moderación:** `https://app.yump.ar/admin/login` con la cuenta de
   administración y su 2FA → `https://app.yump.ar/admin/moderacion`. Resolver
   la revisión pedida y la denuncia.
6. **Avisame y apago.**
7. **Baja:** con A y con B, `https://app.yump.ar/cuenta/configuracion` →
   **Eliminar cuenta**. Es también la prueba de la eliminación de una cuenta
   ficticia. Yo verifico en lectura que no quedan reseñas visibles ni
   participantes vinculados, y que la ficha 550 sólo muestra lo de siempre.

Top Yumpers sigue apagado durante esta etapa.

## Commits

En `feat/resenas-reglas`:
- `fc45d55`, `6c98e2a`: correcciones de la auditoría;
- `724c05c`: integración de `main`.

En `main`:
- `3a58eb6`: merge;
- más el commit de este informe y ESTADO.
