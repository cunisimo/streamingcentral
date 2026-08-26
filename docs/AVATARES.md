# Los avatares de Yump

**Son 31 archivos WebP propios, servidos desde el propio origen de Yump
(`/avatars/`). No hay librería de terceros ni petición saliente para generar o
servir un avatar.** La semilla que elige cuál mostrar **sí se guarda en
Supabase**, que actúa como proveedor de servicio — ver más abajo.

## Autoría

Tres grupos, y conviene no mezclarlos:

| Grupo | Cuántos | Qué es |
|---|---|---|
| **Pajaritos** | **9** | Personajes de la tira **Pajaritos**, creaciones originales de **Juan Facundo Galíndez**, adaptados en 3D para Yump. Buitracio, Buitracia, Coco, Fini, Jipi, Juan Palomo, Lola, Pocho y Rico |
| **Don Tito** | **1** | **Mascota y personaje original de Yump**, creado específicamente para la app. **NO es de Pajaritos** |
| Otras ilustraciones | 21 | Criaturas y objetos, también propios de la app |

- Instagram oficial de la tira: <https://www.instagram.com/pajaritos.web/> —
  **ese enlace acompaña únicamente a Pajaritos, no a Don Tito.**
- **© Juan Facundo Galíndez. Todos los derechos reservados.**

> **Nota técnica.** El id de Don Tito sigue siendo `dontito`, con su archivo, su
> posición en la grilla y su lugar en `LEGADO_V1` — ese id vive en la base de
> datos de cada persona que lo eligió. Lo que cambió es el **nombre visible**
> (`Don Tito`, con espacio) y la **categoría** (`yump`, no `pajaritos`).

**Ya no corresponde atribución a DiceBear**, porque ya no se usa.

**Qué pasa con los datos, dicho con precisión y sin absolutos:**

- **La semilla se recopila y se guarda en Supabase.** `avatar_seed` es un dato
  que sale del dispositivo y queda almacenado.
- **Supabase actúa como proveedor de servicio.**
- **Para Data Safety: recopilado, NO compartido.**
- **Ya no se envía a DiceBear ni a terceros para generar o servir el avatar.**
  Antes, cada render mandaba a `api.dicebear.com` la semilla del perfil junto con
  la IP del dispositivo. Eso desapareció.
- **Los WebP salen del propio origen de Yump.**

Lo que se eliminó es el envío a un tercero para producir la imagen, **no** el
almacenamiento del dato.

### Texto preparado para `/acerca-de`

`/acerca-de` es de la **tanda siguiente**; el texto queda listo acá para
copiarse tal cual:

> Los avatares de Pajaritos están basados en personajes originales creados por
> Juan Facundo Galíndez y adaptados en 3D para Yump. Conocé la tira en
> @pajaritos.web.
>
> Don Tito es la mascota de Yump, un personaje original creado para la app.
>
> El resto de las ilustraciones también son propias de Yump.
>
> © Juan Facundo Galíndez. Todos los derechos reservados.

**Ojo con el orden de los párrafos**: el enlace a @pajaritos.web tiene que quedar
**dentro del párrafo de Pajaritos**. Don Tito va en su propio párrafo justamente
para que no se lea como si fuera de la tira.

**El enlace a Instagram va textual y externo**, sin widget, sin embed y sin
script de Instagram. Un embed traería justamente lo que esta tanda sacó: una
conexión a un tercero en cada carga.

## Cómo está armado

| Pieza | Qué hace |
|---|---|
| `public/avatars/avatar-<id>.webp` | los 31 archivos, 512×512 con transparencia |
| `lib/avatares.ts` | **la fuente única de verdad**: catálogo tipado y resolución |
| `lib/avatares.test.ts` | descubre los archivos del disco y los compara contra el catálogo |
| `components/avatar/` | `Avatar`, `AvatarCard`, `AvatarGrid`, `AvatarModal`, `AvatarPicker` |
| `scripts/barrido-dicebear.mjs` | barrido de fuente, públicos, SW y bundles |

### El catálogo

Cada entrada tiene `id` (estable, es lo que se guarda), `src` (ruta local),
`nombre` (para `aria-label`) y `categoria`. El **orden del array ES el orden de
la grilla**: personajes, criaturas, objetos.

**El test descubre los archivos del disco**, no repite una lista a mano. Un
`.webp` nuevo o borrado en `public/avatars/` rompe el test en vez de aparecer o
desaparecer en silencio.

## Compatibilidad con los perfiles que ya existen

Las columnas de `profiles` **no cambiaron**: siguen siendo `avatar_style` y
`avatar_seed`. **No hubo migración, no se ejecutó SQL y no se tocó Producción.**

### ⚠️ Producción y `supabase/schema.sql` NO dicen lo mismo, y es a propósito

| | **Producción, HOY** | **`supabase/schema.sql`, estado deseado** |
|---|---|---|
| Default de `avatar_style` | **`'adventurer-neutral'`** — sigue ahí | sin default (`drop default`) |
| Perfiles existentes | conservan `avatar_style = 'adventurer-neutral'` | — |
| Cuentas nuevas | nacen con `avatar_style = 'adventurer-neutral'` y una semilla aleatoria | nacerían con `avatar_style` en NULL |

**El archivo describe a dónde queremos llegar; la base todavía no llegó.** El
`drop default` **no está autorizado y no se aplicó**.

**Y no hace falta que se aplique para que todo funcione.** Cualquier estilo
distinto de `yump` —incluido `'adventurer-neutral'`, incluido NULL— se resuelve
**localmente** por `LEGADO_V1`. El nombre del estilo viejo quedó en la base como
una etiqueta sin consecuencias: **no dispara ninguna conexión a DiceBear**, ni
hoy ni después. Lo único que cambiaría al aplicar el `drop default` es que las
cuentas nuevas dejarían de nacer con el nombre de un servicio que ya no se usa.

| Estado del perfil | Qué se muestra |
|---|---|
| `avatar_style = "yump"` + un id del catálogo | ese avatar. Es una elección explícita |
| Cualquier otra cosa **con** semilla (DiceBear, estilo desconocido, id inválido) | mapeo **determinístico** sobre `LEGADO_V1` |
| Sin semilla utilizable (null, vacío, basura) | `AVATAR_POR_DEFECTO` |

El mapeo legado es `hashCadena(semilla) % LEGADO_V1.length`. Es **puro** y corre
**en el dispositivo**, así que la misma persona ve el mismo dibujo en todos sus
dispositivos **sin que se escriba nada en la base**. La semilla que entra a ese
hash ya estaba guardada en Supabase; lo que no ocurre es que salga hacia un
tercero.

### `LEGADO_V1` está congelada, y es la decisión importante

Si el mapeo usara `AVATARES`, agregar un avatar 32 cambiaría el módulo del hash y
**todos los perfiles viejos verían otro dibujo de un día para el otro**. Por eso
el conjunto del mapeo está congelado y versionado aparte:

- **`AVATARES` puede crecer** libremente.
- **`LEGADO_V1` no se toca nunca más.** Si alguna vez hiciera falta, se agrega
  `LEGADO_V2` y se decide explícitamente a quién se le aplica.

Hay un test que fija los 31 ids en orden y falla si alguien la edita.

### Sin escrituras silenciosas

Cargar un perfil **no escribe nada**. `resolverAvatar` es una función pura. La
base se actualiza sólo cuando la persona elige un avatar y toca Guardar, y ahí se
graba `avatar_style = "yump"` + el id.

**El cambio visual de una sola vez para los perfiles viejos está aceptado.**
Después de elegir, la elección persiste como cualquier otra.

### Alta de una cuenta nueva

El trigger `handle_new_user` **no se tocó**: escribe un `gen_random_uuid()` en
`avatar_seed` y no menciona `avatar_style`, que toma el default de la columna.

**En Producción ese default sigue siendo `'adventurer-neutral'`**, así que **una
cuenta creada hoy nace con ese valor**, no con NULL. Da exactamente igual: cae en
el mapeo legado y **muestra un avatar propio desde el primer render**. El nombre
del estilo viejo es una etiqueta inerte.

**Dos migraciones OPCIONALES, ninguna aplicada y ninguna autorizada:**

1. `alter table profiles alter column avatar_style drop default;` — lo que ya
   dice `supabase/schema.sql`. Sólo cambia de qué valor nacen las cuentas nuevas.
2. Cambiar el trigger para que escriba `avatar_style = 'yump'` y un id del
   catálogo.

**Ninguna de las dos hace falta para que el sistema funcione.** No ejecutar sin
pedirlo.

## Seguridad de rutas

**Ningún texto de la base se interpola en una ruta.** La semilla sólo se usa para
buscar en un índice o para calcular un número; el `src` sale siempre del catálogo
congelado. Por eso `../../etc/passwd`, `https://otro.com/x.png`, `//evil.com` o
un `<script>` no pueden producir una ruta: salen convertidos en uno de los 31.
Hay un test con esos casos exactos.

## Service worker

- `/avatars/` se cachea con **Cache First** como asset propio, que es lo que hace
  que el avatar **se siga viendo sin conexión**.
- `api.dicebear.com` salió de `IMAGE_HOSTS`.
- `SC_CACHE_VERSION` subió a **v7**, y **ese bump ES el mecanismo de limpieza**:
  los nombres de cache llevan la versión adentro y `activate` borra todo lo que
  no esté en `VALID_CACHES`, así que `sc-images-v6` —donde estaban guardados los
  SVG de DiceBear— desaparece al activar. No toca `localStorage`, `sessionStorage`
  ni IndexedDB: ahí viven las plataformas elegidas y la sesión.

## Política de caché

Los avatares se cachean con **Cache First permanente**, sin expiración. Eso vale
la pena porque las URLs son estables, pero define reglas que hay que respetar.

### La regla base: un id y su archivo son INMUTABLES

**Un `id` está atado a una ilustración para siempre.** Ese par —`id` y el archivo
que le corresponde— no cambia de contenido. No es una preferencia estética: el id
vive en `profiles.avatar_seed` de cada persona que ya eligió, y la URL vive en la
caché de cada navegador y de cada PWA instalada.

### Agregar un avatar: no invalida nada

**Un avatar nuevo con un id nuevo y una URL nueva NO necesita subir
`SC_CACHE_VERSION`.** Su URL no existía, así que no hay nada cacheado que
contradecir; el navegador la pide la primera vez que la ve. Los 31 anteriores
siguen sirviéndose de la caché sin volver a descargarse.

Agregar es, entonces, el camino barato: se suma la entrada al final de su grupo
en `AVATARES`, se copia el `.webp` a `public/avatars/` y listo. **`LEGADO_V1` no
se toca** (ver arriba).

### Reemplazar el contenido de un archivo: SÍ hay que invalidar

Si alguna vez hay que cambiar el dibujo **conservando la misma URL** —un arreglo
en la ilustración, un cambio de paleta— quien ya la tenga cacheada seguiría
viendo la vieja para siempre, porque Cache First no revalida. Hay **dos salidas y
alguna hay que tomar**:

| Salida | Cuándo conviene |
|---|---|
| **Subir `SC_CACHE_VERSION`** en `public/sw.js` | si se reemplazan varios archivos a la vez. Invalida *toda* la caché estática, así que se vuelve a descargar más de lo necesario |
| **Versionar la URL** (`avatar-pocho.webp?v=2`, o un nombre nuevo) | si es uno solo. Es una URL nueva, así que aplica la regla de arriba: no invalida nada más |

🟡 Preferí **versionar la URL**: el costo es proporcional al cambio.

### Retirar un avatar del selector: HOY NO SE PUEDE, y hay que decirlo

⚠️ **Corrección.** Una versión anterior de este documento explicaba cómo retirar
un avatar "conservándolo resoluble". **Con la arquitectura actual eso no existe**,
y conviene ser honesto sobre por qué en vez de escribir una receta que no
funciona.

El motivo es que **`AVATARES` cumple dos papeles a la vez**:

1. **Alimenta el selector** — `AvatarGrid` recorre el array entero.
2. **Alimenta `POR_ID`**, que es el índice que usa `resolverAvatar`.

Sacar una entrada de `AVATARES` la saca de los dos lugares al mismo tiempo. Y
además hay un test —*"todo id de `LEGADO_V1` existe en el catálogo"*— que se pone
rojo, con razón: dejaría ids del mapeo legado apuntando a la nada.

**Qué habría que construir antes de poder retirar uno**, cuando haga falta:

| Lista | Para qué | Quién la usa |
|---|---|---|
| **catálogo completo y estable** | resolver cualquier id que exista en la base | `resolverAvatar` / `POR_ID` |
| **subconjunto seleccionable** | qué se ofrece hoy en el selector | `AvatarGrid` |

Con esa separación, retirar uno es sacarlo del subconjunto y dejarlo en el
catálogo: quien ya lo tenía elegido lo sigue viendo, y nadie nuevo puede elegirlo.

**HASTA ENTONCES, la regla es simple y no admite excepción: ningún avatar
existente se saca de `AVATARES`, ni de `LEGADO_V1`, ni de `public/avatars/`.**
Agregar sí; quitar no.

## Accesibilidad del selector: qué está probado y qué NO

⚠️ **Los tests de `lib/foco-modal.test.ts` prueban la ARITMÉTICA del ciclo de
foco, no el cableado al DOM.** `AvatarModal` usa `useAuth` y este proyecto **no
tiene un arnés de DOM** (ni jsdom ni testing-library), así que el componente no
se monta en ningún test. Lo que está cubierto automáticamente es que, dada una
cantidad de controles y una posición, la función devuelve el índice correcto —y
eso es real y útil— **pero no demuestra que el `querySelectorAll`, los
`focus()` y los listeners estén bien conectados**.

Presentar esos tests como prueba integral sería exagerar lo que cubren.

### Verificación manual OBLIGATORIA en Preview

Con una cuenta real, antes de dar por buena cualquier tanda que toque el selector:

| # | Qué probar | Qué tiene que pasar |
|---|---|---|
| 1 | Abrir "Cambiar avatar" | el foco arranca en **el avatar que ya tenías**, no en el contenedor ni en el primero |
| 2 | Tab repetido hasta pasar Guardar | vuelve al **primer** control del diálogo, **nunca** a la página de atrás |
| 3 | Shift+Tab desde el primer control | va al **último** del diálogo |
| 4 | Escape | cierra |
| 5 | Clic en el fondo oscuro | cierra |
| 6 | Cancelar | cierra |
| 7 | Después de cerrar de cualquiera de las tres formas | el foco vuelve al botón **"Cambiar avatar"** |
| 8 | Tocar Guardar y, mientras dice "Guardando…", tocar otra card | **no cambia la selección** |
| 9 | Durante "Guardando…", probar Escape, el fondo y Cancelar | **no cierra** |
| 10 | Forzar un error de guardado (modo avión, por ejemplo) | aparece el mensaje, las 31 opciones y los dos botones **se reactivan**, y se puede reintentar |
| 11 | Con un lector de pantalla, durante el guardado | el diálogo se anuncia **ocupado** (`aria-busy`) |

**Los puntos 8, 9 y 10 son los que ningún test automático de este proyecto
cubre de punta a punta**, porque dependen de una petición real a Supabase.

## Cómo verificar que DiceBear no volvió

```bash
node scripts/barrido-dicebear.mjs
```

Barre `lib`, `components`, `app`, `hooks`, `scripts`, `supabase` y `public`, y
—si hay un build— también `.next/static` y `.next/server`. `lib/sin-dicebear.test.ts`
importa **el mismo escáner**, así que no hay dos implementaciones que puedan
divergir.

Excluye las líneas que **empiezan** con marca de comentario, porque un comentario
no abre una conexión, pero **nunca corta a mitad de línea**: `https://api.dicebear.com`
contiene `//` y recortar ahí sería un falso negativo. Verificado con un canario
—un archivo con la URL en código y la misma URL en un comentario— que detecta
exactamente uno.

**La documentación histórica (`docs/`) está exenta a propósito**: explica por qué
existe el mapeo legado, y borrarla sería perder la única razón escrita.
