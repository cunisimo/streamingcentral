# Ficha de título mejorada — diseño

Fecha: 2026-07-26
Estado: aprobado (brainstorming), pendiente de plan de implementación.
Grupo B de la tanda de retoques (A ya mergeado: hero/banner/lupa).

## Objetivo

Tres mejoras en la ficha de título (`components/DetailView.tsx`), con un cambio
acotado en la capa de datos:

1. Reemplazar el desglose de votos (malaso/ta buena/petacular) por un **rating
   único con estrella**: promedio /10 de los votos + cantidad de votos.
2. **Reparto con foto** del actor, tipo TMDB (hoy son solo nombres en texto).
3. **Series**: informar temporadas + episodios (ya presente; verificar/pulir).

## Restricción clave: el modelo de votos NO cambia

Este cambio es **solo de display en la ficha**. NO se toca:

- La tabla `votes` ni cómo se guardan (rating 1/2/3 = malaso/ta buena/petacular).
- `components/LikeButton.tsx` (el voto sigue igual).
- La RPC `top_voted` ni los shelves del home **"Lo más votados"** (2-3) y
  **"Hacete cargo"** (1). Siguen contando votos por polaridad como hoy.

Consistencia por construcción: un título con muchos "malaso" da promedio bajo
(~2) en su ficha **y** aparece en "Hacete cargo"; uno lleno de "petacular" da
promedio alto **y** cae en "Lo más votados". El único desglose 1/2/3 visible en
la UI es el `<VoteCounts>` de la ficha, que se elimina; durante la
implementación se verifica que ningún otro componente muestre ese desglose.

Sin cambios de schema: el promedio se calcula en el cliente a partir de la RPC
`vote_counts(p_tmdb_id, p_tipo)` que ya existe y devuelve `(rating, votos)`.

## 1. Rating único con estrella

### Mapeo voto → escala 1-10 (decisión del dueño)

| Voto        | rating (DB) | valor /10 |
|-------------|-------------|-----------|
| Malaso      | 1           | 2         |
| Ta buena    | 2           | 7         |
| Petacular   | 3           | 10        |

Promedio = media ponderada: `Σ(valor(r) · votos(r)) / Σ votos(r)`, redondeado a
1 decimal (ej. `7.1`). `VALUE = {1: 2, 2: 7, 3: 10}`.

### Componente

`components/VoteCounts.tsx` se reescribe (o se reemplaza por `ScScore.tsx`):
sigue llamando a la RPC `vote_counts`, pero en vez de mostrar 3 contadores
calcula el promedio y renderiza el stat con estrella.

- Con ≥1 voto: **⭐ + `X.X/10`** grande + **`N votos`** debajo en fuente chica.
- Con 0 votos: **no se muestra** el stat (nada de "0.0/10"). El botón de votar
  (`LikeButton`) sigue disponible; los demás puntajes se muestran igual.

### Ubicación / layout ([DetailView.tsx:72,82-95](../../..))

- Se elimina el `<VoteCounts>` de la línea 72.
- La sección "Puntajes" (bloque `.rating-bar`) arranca con el stat de estrella
  (cuando hay votos) y a continuación los chips existentes, sin cambios de datos:
  **IMDb · Metacritic · TMDB · Reseña SC** (editorial). El stat de estrella es
  visualmente el contador principal; el resto queda al lado.
- Si no hay ni votos ni IMDb/Metacritic/TMDB/editorial, la sección no aparece
  (como hoy).

## 2. Reparto con foto (tipo TMDB)

### Datos ([enrich.ts:234](../../..), [types.ts:35](../../..))

TMDB ya trae `d.credits.cast` (con `profile_path`, `character`, `id`, `name`);
hoy se descarta todo menos `name`. Cambios:

- `lib/types.ts`: nuevo tipo `UICastMember = { id: number; name: string;
  character: string | null; profile: string | null }`. `UITitleDetail.cast`
  pasa de `string[]` a `UICastMember[]`.
- `lib/enrich.ts`: `cast` mapea los primeros ~12 miembros a `UICastMember`
  usando `img(c.profile_path, "w185")` para la foto (mismo helper que ya se usa
  para personas). Se mantiene el orden de TMDB (por relevancia/billing).

Consumidor de `t.cast`: solo `DetailView` (línea 75). El cambio de tipo queda
contenido.

### UI (`DetailView.tsx` + `app/globals.css`)

Reemplazar la línea de texto `Reparto: nombre, nombre…` por un **riel
horizontal** bajo un encabezado "Reparto":

- Cada ítem: foto (poster/redonda), **nombre** y **personaje** debajo.
- Cada ítem linkea a `/persona/[id]` (ruta existente).
- Sin foto (actor sin `profile_path`): placeholder neutro (inicial o ícono),
  no romper el riel.
- Se reutiliza el patrón visual de cards de personas ya existente
  (`PersonCard`/`PersonRail`) si encaja; si no, una card de cast compacta
  propia con clases nuevas en `globals.css` (siguiendo las existentes).

"Dirección" y "Música" siguen como líneas de texto (sin cambio).

## 3. Series: temporadas + episodios

Ya poblado en `enrich.ts` (`seasons`, `episodes` desde `number_of_seasons` /
`number_of_episodes`) y renderizado en `DetailView` (línea 46 "{episodes} ep."
en la meta y línea 78-79 "Temporadas: X · Y episodios"). Acción: **verificar
que renderiza** con datos reales y dejarlo claro/prominente. Cambio mínimo o
nulo; no inventar campos nuevos.

## Archivos afectados

- `components/DetailView.tsx` — quitar VoteCounts, riel de reparto, sección de puntajes con estrella.
- `components/VoteCounts.tsx` → reescrito como stat de estrella (o nuevo `ScScore.tsx` y borrar VoteCounts).
- `lib/enrich.ts` — cast enriquecido (id/name/character/profile).
- `lib/types.ts` — `UICastMember`, `UITitleDetail.cast: UICastMember[]`.
- `app/globals.css` — estilos del stat de estrella y del riel de reparto.

Fuera de alcance: tabla `votes`, `LikeButton`, `top_voted`, shelves del home,
schema de Supabase.

## Verificación

- `npx tsc --noEmit` sin errores.
- Ficha de una película con votos: aparece ⭐ + promedio /10 + N votos, y al lado
  IMDb/Metacritic/TMDB. Ficha sin votos: no aparece la estrella, sí el resto.
- Reparto: riel con fotos, nombre y personaje; links a persona funcionan;
  actor sin foto muestra placeholder.
- Serie: se ven temporadas y episodios.
- Home: los shelves "Lo más votados" y "Hacete cargo" siguen funcionando igual
  (no se tocaron).
