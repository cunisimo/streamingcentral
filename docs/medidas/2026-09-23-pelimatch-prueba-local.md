# Pelimatch — prueba local del dueño, y los dos caminos que faltan

Rama `feat/salas`. **Nada de esto toca Producción, ni servicios ni
configuraciones remotas.** El entorno corre contra la base **local** de
`supabase start` (`.env.sala-local` → `http://127.0.0.1:54321`), no contra la de
Producción (`.env.local`, que este servidor no lee).

## 1. La prueba local, corta, desde el navegador

### Cómo está levantado

- Servidor de desarrollo: `npm run dev` con `--env-file=.env.sala-local` en el
  puerto **3111** (entrada `sala-local` de `.claude/launch.json`).
- Base local de Supabase arriba (Docker), con la migración `009_salas.sql` y
  `sala_config.activas = "true"`.
- Cuenta de prueba **sólo local**: `prueba@pelimatch.local`, perfil "Facu". **No
  existe en Producción** y no se puede usar allá.

### El truco de los dos participantes en una sola PC

Las dos pestañas tienen que ser **orígenes distintos**, porque la credencial de
participante y la sesión viven en `localStorage`, que es por origen. Mismo
servidor, dos direcciones:

| Rol | Dirección |
|---|---|
| **Organizador** (ya con sesión iniciada) | `http://localhost:3111` |
| **Invitado** (sin cuenta, entra por el link) | `http://127.0.0.1:3111` |

Si se abren las dos en `localhost`, la segunda pestaña **es el mismo
organizador**: encuentra su credencial guardada y no muestra el formulario de
entrar. No es un bug, es el diseño.

### Pasos

1. En `http://localhost:3111` (organizador), tocar **🍿 Pelimatch → Matcheá**.
2. En `/sala/nueva`: las plataformas vienen preseleccionadas (Netflix, Disney+,
   Max). Escribir el nombre y **Crear sala**.
3. En el lobby, **Copiar** el enlace de invitación.
4. Pegar ese enlace en la otra pestaña **cambiando `localhost` por
   `127.0.0.1`** (el invitado tiene que estar en el otro origen). Poner un
   nombre, elegir al menos una plataforma y **Entrar a la sala**.
5. En la pestaña del organizador, elegir **5 películas** y **Empezar**.
6. Votar **Sí** en las dos pestañas sobre la misma película.

### Qué se tiene que ver

- El contador de gente sube a **2 de 6** en las **dos** pestañas sin recargar
  (eso es Realtime).
- Después de "Empezar", unos segundos de "Un momento…" y las dos pestañas
  muestran **la misma película, en el mismo orden**, con "Película 1 de 5",
  el reloj de la ronda y un contador de **10 segundos** por tarjeta. Si no se
  vota, pasa sola a la siguiente.
- Al coincidir en un Sí: **"¡Hay match!"** a pantalla completa en las dos, con
  "Los dos dijeron que sí.", la ficha de la película, **Compartir** y **Ver la
  ficha**; y en la del organizador, "¿Otra tanda?".
- Sólo el organizador ve **Empezar**, **Otra tanda** y **Desempatar**; el
  invitado ve "Esperando a que Facu empiece…".

### Ensayo hecho antes de entregarlo (23/09)

Se corrió el recorrido completo con esas dos pestañas: sala creada, invitada
entrando sin cuenta, tanda de 5, y match en **las dos** pantallas sobre la misma
película ("Criaturas luminosas", Netflix). La sala del ensayo se dejó vencida a
propósito, porque **un organizador no puede tener dos salas activas** y una
abierta bloquearía la creación de la suya.

⚠️ **Lo que esta prueba NO cubre** (sigue pendiente, sin cambios): dos teléfonos
reales, red cortada, lector de pantalla, "Reducir movimiento" y la vista previa
real de WhatsApp.

## 2. Probar con dos teléfonos: camino viable y qué falta

**Sí se puede, en la red local, y los teléfonos SÍ pueden llegar a la base
local** — verificado: el Kong de Supabase publica el puerto en `0.0.0.0:54321`,
no sólo en `127.0.0.1`, así que acepta conexiones de la LAN.

Lo que hoy lo impide es que **la dirección de Supabase viaja compilada en el
bundle del navegador**: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`. Un
teléfono que abra `http://192.168.1.71:3111` carga la app, pero su navegador
busca Supabase en **sí mismo** y todo falla.

Para habilitarlo hacen falta tres cosas, todas locales:

1. En `.env.sala-local`, `NEXT_PUBLIC_SUPABASE_URL=http://192.168.1.71:54321`
   (la IP de esta PC en la Wi-Fi, hoy `192.168.1.71`) y **reiniciar** el
   servidor. Es una variable `NEXT_PUBLIC_*`: no alcanza con recargar.
2. **Dos reglas de entrada en el Firewall de Windows**, para los puertos
   **3111** y **54321**. Están los tres perfiles activos y no hay reglas para
   esos puertos, así que hoy la conexión desde el teléfono se rechaza.
3. Los teléfonos en la **misma Wi-Fi** (no en datos móviles), abriendo
   `http://192.168.1.71:3111`.

Con eso, el organizador puede ser la PC y los dos teléfonos entrar como
invitados por el link — **los invitados no necesitan cuenta**. Si el organizador
fuera un teléfono, tiene que iniciar sesión con la cuenta de prueba local, que
funciona con email y contraseña sin configuración extra.

⚠️ **Dos consecuencias de que la LAN sea HTTP y no HTTPS**, para no leerlas como
bugs:

- **`navigator.share` no existe fuera de contexto seguro**, así que en los
  teléfonos el botón **Compartir** va a caer directo a WhatsApp en vez de abrir
  la hoja del sistema. El camino de la hoja del sistema sólo se prueba en HTTPS
  (Preview o Producción).
- El **Service Worker no se registra** por HTTP en una IP, así que esa prueba no
  vale para la PWA.
- Lo demás del flujo sí funciona: la credencial se genera con
  `crypto.getRandomValues`, que **no** exige contexto seguro, y no se usa
  `crypto.subtle` en ningún lado.

**No hace falta tocar nada remoto** para esta prueba. Queda a decisión suya
abrir los dos puertos del firewall.

## 3. Vista previa real de WhatsApp: hoy no se puede verificar, y por qué

Tres hechos comprobados, en este orden:

1. **El enlace que se comparte es siempre `https://app.yump.ar/titulo/...`**.
   `SITIO_PUBLICO` es una constante del código, no una variable de entorno, y
   hay tres tests que la fijan. O sea que WhatsApp, comparta uno desde donde
   comparta, va a leer **Producción**.
2. **Producción todavía no tiene los metadatos.** Verificado con una descarga
   directa: `https://app.yump.ar/titulo/movie/278` responde 200 con
   `<title>Yump</title>` y **cero** etiquetas `og:`. Es lo esperado —
   `generateMetadata` está en `feat/salas`, sin deployar—, pero significa que
   **hoy la vista previa muestra el genérico del sitio, sin póster**, y eso no
   prueba ni refuta el cambio.
3. **La Preview de Vercel no sirve por defecto.** Los deployments de Preview
   salen protegidos con Vercel Authentication: el robot de WhatsApp no tiene
   sesión, recibe la pantalla de autenticación y lee los metadatos de ESA
   página. Se confirma en un segundo con
   `curl -I https://<preview>.vercel.app/titulo/movie/278`: un **401** es la
   protección activa. **No lo di por hecho ni lo cambié.**

### Los tres caminos posibles, con su costo

| Camino | Qué habilita | Qué exige |
|---|---|---|
| **A. Deployar a Producción** | La prueba definitiva, la misma que van a ver los usuarios | Merge y deploy. **Fuera de lo autorizado hoy**; es el paso natural cuando se apruebe la rama |
| **B. Preview de Vercel** | Probar el HTML real de la rama antes de Producción | Dos cambios remotos suyos: **apagar la protección** de ese deployment y **apuntar el enlace** a la URL de Preview |
| **C. Túnel público sobre este build local** (cloudflared / ngrok) | Probar los metadatos sin tocar Vercel | Instalar el túnel. **Pegando en WhatsApp la URL de la ficha del túnel a mano**, no usando el botón Compartir |

**El camino C es el más barato y es el que recomiendo**, porque lo único que
falta comprobar es una propiedad del HTML de la ficha: si WhatsApp arma la
tarjeta con el póster. El texto del mensaje y cuál enlace se comparte ya están
fijados por tests; lo que no está probado es lo que hace el robot con ese HTML.

⚠️ **Una reserva honesta sobre C**: la página serviría
`og:url = https://app.yump.ar/...` aunque se abra desde el túnel. WhatsApp
normalmente arma la tarjeta con lo que descargó y no vuelve a pedir la `og:url`,
pero si lo hiciera, la prueba daría el resultado de Producción y habría que
sacar la conclusión al revés. Para eliminar esa ambigüedad hay que apuntar
`SITIO_PUBLICO` al origen de la prueba mientras dura — un parche temporal, sin
commitear, que además rompe tres tests a propósito.

En **ninguno** de los tres casos hace falta que el póster sea nuestro:
`og:image` apunta a `image.tmdb.org`, que es público y no pide sesión.

**No cambié nada remoto.** Falta su decisión sobre cuál de los tres caminos
tomar.
