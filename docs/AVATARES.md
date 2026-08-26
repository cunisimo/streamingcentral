# Los avatares de Yump

**Son 31 archivos WebP propios, servidos desde `/avatars/`. No hay ninguna
dependencia externa, ninguna conexión saliente y ningún servicio de terceros
involucrado.**

## Autoría

- **Los personajes de Pajaritos son creaciones originales de Juan Facundo
  Galíndez**, adaptadas en 3D para Yump.
- Instagram oficial de la tira: <https://www.instagram.com/pajaritos.web/>
- El resto de las ilustraciones también se aportó expresamente para Yump.
- **© Juan Facundo Galíndez. Todos los derechos reservados.**

**Ya no corresponde atribución a DiceBear ni a ningún tercero**, porque ya no se
usa ninguno. Tampoco hay transferencia de datos: antes, cada render de un avatar
mandaba a `api.dicebear.com` la semilla del perfil —un identificador seudónimo
vinculado a la cuenta— junto con la IP del dispositivo. Eso desapareció.

### Texto preparado para `/acerca-de`

`/acerca-de` es de la **tanda siguiente**; el texto queda listo acá para
copiarse tal cual:

> Los avatares de Pajaritos están basados en personajes originales creados por
> Juan Facundo Galíndez y adaptados en 3D para Yump. Conocé la tira en
> @pajaritos.web.
>
> © Juan Facundo Galíndez. Todos los derechos reservados.

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
`avatar_seed`. No hubo migración ni escritura masiva.

| Estado del perfil | Qué se muestra |
|---|---|
| `avatar_style = "yump"` + un id del catálogo | ese avatar. Es una elección explícita |
| Cualquier otra cosa **con** semilla (DiceBear, estilo desconocido, id inválido) | mapeo **determinístico** sobre `LEGADO_V1` |
| Sin semilla utilizable (null, vacío, basura) | `AVATAR_POR_DEFECTO` |

El mapeo legado es `hashCadena(semilla) % LEGADO_V1.length`. Es **puro**, así que
la misma persona ve el mismo dibujo en todos sus dispositivos **sin que se
escriba nada en la base**.

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

El trigger `handle_new_user` de Supabase **no se tocó**: sigue escribiendo un
`gen_random_uuid()` en `avatar_seed`, y `avatar_style` toma su default. Da igual:
esa combinación cae en el mapeo legado y **muestra un avatar local desde el
primer render**.

**Migración opcional, NO aplicada y sin autorización para aplicarse**: se podría
cambiar el trigger para que escriba `avatar_style = 'yump'` y un id del catálogo.
No hace falta para que funcione — sólo evitaría que las cuentas nuevas nazcan con
una semilla que no significa nada. **No ejecutar sin pedirlo.**

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
