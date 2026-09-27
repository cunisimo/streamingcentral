# Salas compartidas — Etapa 5: compartir

Plan: [`superpowers/plans/2026-09-17-salas-compartidas.md`](../superpowers/plans/2026-09-17-salas-compartidas.md), Tareas 5.1 y 5.2.
Rama `feat/salas`, commits `a01e150` (5.1) y `81a287c` (5.2). **Nada en
Producción; sin deploy, merge ni push.**

## Tarea 5.1 — mensaje de match y acción compartida

- **`lib/compartir.ts` → `mensajeMatch(titulo, plataformas)`**. El texto es el
  del plan, literal, y hay un test que lo compara carácter por carácter:

  ```
  ¡Nuestro match!
  Disponible en Netflix, Max
  Ver ficha en Yump:
  ```

  más la url canónica (`https://app.yump.ar/titulo/<tipo>/<id>`). **Sin
  plataformas la línea del medio se omite** en vez de quedar un "Disponible en"
  colgado — pasa con un título que TMDB todavía no ubica en AR.
- **`lib/compartir-accion.ts` (nuevo)**: la ACCIÓN, extraída de
  `components/DetailView.tsx` **sin cambiarle el comportamiento**. Los tres
  caminos y el motivo de cada uno se mudaron con el código, incluido el
  historial de los tres bugs que ya arregló (payload sin `text`, `?.` que
  cortaba la cadena en escritorio, url armada con el origen del navegador):
  1. contenedor nativo → plugin de Capacitor (import dinámico);
  2. web con `navigator.share` → hoja del sistema;
  3. el resto → WhatsApp con el mensaje ya armado.
  Cerrar la hoja (`AbortError`) **no** abre WhatsApp. Las dependencias se
  inyectan, así que los cuatro caminos se prueban sin navegador ni contenedor.
- **`CompartirMatch`** usa el mensaje de match y la acción. Las plataformas se
  ordenan poniendo primero las de la sala (si la película está en cuatro y la
  sala tiene una, esa es la que importa) y se nombran con `providers-ar.ts`.
- **`DetailView`** delega en la acción; su mensaje no cambió.
- **Guards al día**: el import dinámico de `@capacitor/share` se busca ahora en
  la acción, y los chequeos de "nada de urls escritas a mano ni
  `location.origin`" se extendieron a los **dos** consumidores; los dos `catch`
  nuevos quedaron clasificados en el inventario de descartes.

### Verificación en la app (local, `next dev` + base local)

| Qué | Resultado |
|---|---|
| Compartir un match (sala de 2, match temprano) | ✅ `navigator.share` recibió `text` = `"¡Nuestro match!\nDisponible en Max, Universal+\nVer ficha en Yump:"`, `url` = `https://app.yump.ar/titulo/movie/298618`, `title` = "Flash" |
| Compartir desde la ficha (comportamiento sin cambios) | ✅ `"¡Mirá lo que encontré! \"Cadena perpetua\" (1994) — en Netflix. La ficha en Yump:"` + la misma url canónica |

## Tarea 5.2 — `generateMetadata` de la ficha

`app/titulo/[tipo]/[id]/page.tsx` exporta `generateMetadata` y
`revalidate = 21600` (6 h, la escala de `TTL.home`: el póster y las plataformas
no cambian más rápido, y la metadata la pide un bot una vez por enlace).

- `og:image` **absoluta**: `card.poster` ya viene como url completa de
  `image.tmdb.org` (w500), no se arma nada acá. La canónica sale de
  `lib/compartir.ts`, su única fuente.
- Un id que no es número, un título que TMDB no devuelve o un fallo de TMDB caen
  en la **metadata base** (canónica) y la ficha se sigue renderizando.

**Comprobado en el HTML servido** por `next start`:

```
<title>Cadena perpetua (1994) · Yump</title>
<meta property="og:title" content="Cadena perpetua (1994) · Yump"/>
<meta property="og:url" content="https://app.yump.ar/titulo/movie/278"/>
<meta property="og:image" content="https://image.tmdb.org/t/p/w500/uRRTV7p6l2ivtODWJVVAMRrwTn2.jpg"/>
```

### Medición de TTFB (Step 2 del plan)

Build de producción y `npx next start -p 3311` en las dos variantes, mismo
título (`/titulo/movie/278`), 3 tomas de calentamiento descartadas y 5 medidas
calientes con `curl -o /dev/null -s -w "%{time_starttransfer}"`.

| | mediana | rango |
|---|---|---|
| **Antes** (sin `generateMetadata`) | **32,4 ms** | 26,4 – 60,8 |
| **Después** | **38,5 ms** | 33,9 – 57,3 |

**+6,1 ms de mediana**, con los rangos superpuestos: en caliente el costo no se
distingue del ruido de la máquina. Lo que sí cuesta es la **primera visita a un
título nuevo**, que paga la llamada a TMDB: 270, 280 y 584 ms medidos en tres
títulos distintos (`movie/13`, `movie/27205`, `movie/550`). Después de esa
primera, la revalidación de 6 h lo devuelve a la banda caliente.

⚠️ **Trampa que casi arruina la medición**: la primera corrida del "después" dio
los mismos números que el "antes" porque `next start` había fallado con
`EADDRINUSE` —el servidor de la variante anterior seguía en el puerto— y se
estaba midiendo el build viejo. Se detectó porque el HTML no traía las etiquetas
`og:`. Se mató el proceso por puerto y se repitió.

## Qué falta comprobar

- 🔴 **La vista previa REAL en WhatsApp (iPhone y Android)**: es el Step 3 del
  plan y necesita **Preview de Vercel y dispositivos**. **No se probó y no se
  afirma que el póster se vea.** Si no se viera, el plan ya dice por dónde ir
  (tamaño de la imagen y `og:image` absoluta — las dos ya cumplen) y que una
  imagen propia queda fuera del MVP.
- Los pendientes manuales de la Etapa 4 siguen igual: dos teléfonos reales,
  organizador en el navegador, red cortada, lector de pantalla y movimiento
  reducido.

## Verificación automática

- `lib/compartir.test.ts` **22/22** (9 nuevos: mensaje de match, los cuatro
  caminos de la acción, el cableado de los dos consumidores y la metadata).
- Sala + guards: **286/286**. `npx tsc --noEmit` limpio. `npm run build` en
  verde. Suite completa **1871 tests, 1861 ok, 0 fallos, 10 omitidos**.
- Además se corrigió el comentario de `hooks/sala-lector.ts` que decía que sólo
  `fallo` justifica reintentar: también `descartada-sin-estado`.
