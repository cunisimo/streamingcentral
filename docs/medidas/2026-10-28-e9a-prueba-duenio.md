# E9a — Prueba local del dueño (reseñas de la comunidad)

Entorno **sólo local**: Supabase de `supabase start` (Docker) y la app en
`localhost:3100`, con cuentas y textos ficticios. Nada de esto toca
Producción. **Esta prueba la hace el dueño; Claude no la da por realizada.**

## Iniciar

En una terminal, desde `D:\DESARROLLO\stream central\wt-resenas-comunidad`:

1. Docker Desktop abierto (los contenedores `supabase_*_streamingcentral`
   arrancan solos).
2. Preparar los datos ficticios (enciende módulo, publicación y Top Yumpers):

   ```bash
   node --env-file=.env.comunidad-local scripts/comunidad/recorrido-e9a.mjs preparar
   ```

3. Levantar la app (deja esa terminal abierta):

   ```bash
   node --env-file-if-exists=../streamingcentral/.env.sala-local --env-file=.env.comunidad-local node_modules/next/dist/bin/next dev -p 3100
   ```

   El primer archivo sólo aporta el token de lectura de TMDB, para que se vea
   la ficha real; la base sigue siendo la local. Si no existe, la app arranca
   igual pero sin fichas.

4. Abrir `http://localhost:3100`. La primera carga de cada página tarda
   (compila).

Las contraseñas de las cuentas ficticias quedan en
`.recorrido-e9a.local.json` (no se versiona). Para el panel, el código TOTP
del admin se pide con:

```bash
node --env-file=.env.comunidad-local scripts/comunidad/recorrido-e9a.mjs codigo
```

## Pasos (unos 20 minutos)

1. **Sin sesión**, en `/titulo/movie/550`: abrir RESEÑAS. Se ve la editorial
   ficticia y la invitación a registrarse, sin número de reseñas.
2. **Registrarse** con un correo que termine en `@recorrido.test` (así lo
   borra la limpieza). En la bienvenida elegí "No tengo ninguna por ahora":
   en local la lista de plataformas viene vacía (ver abajo).
3. Volver a la ficha 550 → RESEÑAS: aceptar los **términos**, ver las cinco
   reseñas, "Cargar más" y cambiar entre **Más útiles** y **Recientes**.
4. **Votar** "Me sirvió" en una ajena y comprobar que la lista no se reordena.
   Los **pulgares** de la ficha (malaso / ta buena / petacular) siguen igual.
5. **Publicar** una reseña propia (80–600 caracteres); **editarla**; probar un
   texto que se **rechace** (por ejemplo, con un teléfono o un correo) y pedir
   **revisión**; **borrar** la propia.
6. Desde el menú ⋯ de una ajena: **denunciar** y **bloquear**. La bloqueada
   desaparece; en `/cuenta/configuracion` → "Usuarios bloqueados",
   **desbloquear**.
7. Tocar el nombre de un autor → **perfil** (`/u/?id=…`) con sus reseñas.
8. En `/cuenta/perfil`: cambiar el **nombre en la comunidad**.
9. En `/top`: selector **Top Yumpers** → ranking de septiembre de 2026.
   "Top semanal plataformas" sigue como siempre.
10. **Panel**: cerrar sesión, entrar a `/admin/login` con la cuenta admin del
    archivo y el código de `codigo` → `/admin/moderacion`. Resolver la
    denuncia y la revisión pedida en el paso 5.
11. **Cambio de cuenta**: salir y entrar con la "cuenta B" del archivo. En la
    ficha 550 no tiene que aparecer nada de la cuenta anterior (ni su reseña
    como propia, ni sus votos o bloqueos).
12. **Baja**: con la cuenta registrada en el paso 2, `/cuenta/configuracion` →
    "Eliminar cuenta". Después, sus reseñas ya no se ven con su nombre.
13. **Todo apagado** (opcional): `limpiar` y recargar. Home, ficha (sin
    invitación ni reseñas de la comunidad), `/top` (sin selector) y cuenta
    funcionan como antes.

Probar también con el navegador angosto (ancho de teléfono, DevTools →
modo dispositivo).

## Detener y limpiar

1. `Ctrl+C` en la terminal de la app.
2. Limpiar (borra las cuentas `@recorrido.test`, sus datos y la editorial
   ficticia; apaga los interruptores y revoca los permisos temporales):

   ```bash
   node --env-file=.env.comunidad-local scripts/comunidad/recorrido-e9a.mjs limpiar
   ```

   Tiene que decir "conteos de la comunidad iguales a los de antes: sí" y
   "permisos restaurados: sí".

## Lo que este entorno NO muestra

- La bienvenida no lista plataformas: la tabla `providers` local está vacía
  (en Producción la llena la sincronización con TMDB).
- El Top semanal de plataformas dice "Todavía no disponible": en local no hay
  publicaciones del Top manual.
- La agenda de Próximamente y su riel fallan en local (a la base local le
  falta la columna de la migración 008); pasa igual en la rama base.
- Los permisos de API de `public` que la base local no trae se conceden sólo
  mientras dura la prueba; los de Producción se verifican en E0.
- Ni teléfono real ni Android (E9b), ni Producción (E0, deploy).
