# La franja superior en Android: qué se probó y qué falta

Fecha: 2026-09-02 · Rama `fix/pwa-franja-superior` · Commit auditado: `bc43a15`

## Resumen

La auditoría rechazó `bc43a15` con razón. Su causa declarada no explica la
captura del dueño, y midiendo se encontró algo peor: **`bc43a15` crea una meta
`theme-color` casi blanca que antes no existía**. No se debe mergear como está.

Lo que sí quedó establecido es dónde NO está el blanco, y eso deja un solo
candidato en pie.

## 1. Por qué la causa declarada no alcanzaba

`bc43a15` unificó los colores de barra con `--bg`. La diferencia que corrige es
`#16171B` contra `#0F0E13`: dos oscuros vecinos. Eso no produce una barra
blanca. La unificación sigue siendo correcta como prevención, pero no es la
explicación de la captura.

## 2. Lo que hay en el DOM de Producción (`main` sin el arreglo)

Servidor local del `main` previo, app en oscuro y sistema en claro — el
escenario de la captura:

```
metas = 2
[0] (prefers-color-scheme: light) = #16171B
[1] (prefers-color-scheme: dark)  = #16171B
```

Medido también a los 0 ms (antes de hidratar), 1,5 s y 5 s: **siempre los dos en
`#16171B`**. En ningún instante hay un valor claro.

🔴 **De acá sale la conclusión que importa.** En la build que corre en
Producción, con la app en oscuro, todo el DOM dice oscuro — y la barra real
salió casi blanca. **Entonces la barra no estaba siguiendo a las metas.**

## 3. El defecto que introduce `bc43a15`

El script de arranque que agrega `bc43a15` muta el `content` de las metas antes
de hidratar. React administra esas metas como *hoistable resources*: al hidratar
encuentra un `content` distinto al que renderizó y, en vez de adoptar el nodo,
**inserta una copia nueva con el valor ORIGINAL**.

Predicción hecha y confirmada — la duplicada es siempre la meta que el script
tocó:

| App | Sistema | Metas resultantes |
|---|---|---|
| oscura | claro | `[light]`, `[dark]`, **`[light]` de más** |
| clara | claro | `[light]`, `[dark]`, **`[dark]` de más** |
| clara | oscuro | `[light]`, `[dark]`, **`[dark]` de más** |

En el `main` previo son **2**; con `bc43a15` son **3**. El HTML servido trae 2 en
las dos builds, así que la tercera nace en el navegador.

`applyTheme` normalmente corrige las tres, porque el efecto de montaje corre
después de hidratar. Pero corre **una sola vez** (`[]` de dependencias) y nadie
vuelve a mirar. En una captura quedó registrado el caso perdedor:

```
[0] (prefers-color-scheme: light) = #0F0E13
[1] (prefers-color-scheme: dark)  = #0F0E13
[2] (prefers-color-scheme: light) = #FAFAFD   <-- viva, casi blanca, app oscura
```

Es una carrera, y el lado que pierde deja justo el color de la queja.

## 4. El único casi-blanco que queda

Barrido de todo el circuito PWA:

| Fuente | Valor | ¿La toca `bc43a15`? |
|---|---|---|
| `manifest.theme_color` | `#FAFAFD` | no (salida idéntica byte a byte) |
| `manifest.background_color` | `#FAFAFD` | no |
| meta clara | `#FAFAFD` → `--bg` | sí |
| meta oscura | `#0F0E13` | sí |
| `offline.html` claro | `#FAFAFD` | no (sólo aplica sin red) |

Con el punto 2 —en Producción las metas están en oscuro y la barra salió
blanca— el **manifest** es el único candidato en pie. Es un valor claro fijo, sin
variante oscura, y es lo que Android usa para la barra de la app instalada
cuando no aplica una meta.

**Esto es una hipótesis, no un hecho.** Falta la mitad que sólo da un teléfono.

## 5. Lo que no se puede probar desde esta máquina

Los pasos 1 a 5 del mandato piden un aparato real: versión de Android y WebView,
si la barra cambia en vivo al togglear, y el arranque en frío. Acá no hay una
PWA instalada. Emular un inset de safe-area pinta un `div` HTML y **no** dice de
qué color pinta Android su barra de estado; no se presenta como equivalente.

## 6. El despliegue de prueba (paso 7)

`app/diag-pwa/page.tsx`, sin enlazar desde ningún lado, para abrir **dentro de
la PWA instalada**. Informa user agent, `display-mode`, tema del sistema y de la
app, `sc:theme`, `--bg`, **todas** las metas con su `media` y su valor, y el
`theme_color`/`background_color` del manifest.

🔴 **El botón rojo es el experimento que decide.** Pinta todas las metas de
`#E5484D`:

- **si la barra real se pone roja**, Android lee las metas y el camino de las
  metas sirve;
- **si no cambia**, manda el `theme_color` del manifest y hay que arreglarlo
  ahí — y el manifest no admite variante oscura, así que sería otra solución,
  no un ajuste de `bc43a15`.

## 7. Estado

- `bc43a15` **no se mergea**. Además de no explicar la captura, introduce la
  meta duplicada del punto 3.
- La ruta de diagnóstico es temporal y hay que borrarla al terminar.
- No se tocó el Top, Supabase ni Capacitor. Sin push, merge ni despliegue.
