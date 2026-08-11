# Spec — Integrar la ruleta "no sé qué ver"

## Alcance: qué NO se toca

Antes que nada, porque es el riesgo principal de esta tarea.

Esta feature es **nueva y aislada**. No modifica el comportamiento de nada
que ya exista.

- **No se tocan los 16 chips del home** ni sus definiciones en
  `lib/categories.ts`. Ni los que ya andan bien, ni `navidad`, ni los rieles
  del home.
- **No se toca `chip_titles` ni `chip_blocklist`.**
- **`title_availability` es de sólo lectura** desde la app. La comparte con
  el chip de navidad, y la escribe únicamente el pipeline offline.
- **No se toca nada en `scripts/` ni en `prompts/`.**

Si para implementar esto hiciera falta modificar algo del home o de los
chips, **pará y avisá antes de hacerlo**. Casi seguro hay otro camino.

## Qué es

Un botón que devuelve **una** recomendación de película: por qué verla, una
advertencia honesta cuando la hay, y dónde está disponible.

Resuelve la parálisis de elección, así que **una sola opción a la vez**. Si
se muestra una lista, se reconstruye el problema que la feature viene a
resolver.

## Flujo

1. La persona toca el botón de la ruleta.
2. Se le muestran **tres situaciones**, una sola pregunta:
   - Tengo poco tiempo → `corta` (menos de 110 min, sin infantil)
   - Tengo toda la noche → `larga` (110 min o más, sin infantil)
   - Con chicos → `chicos` (`apto_chicos`)

   Son mutuamente excluyentes por construcción, y los tres se definen por
   **duración**, que es un dato de TMDB y no una inferencia. Los cuatro
   anteriores (`solo` / `pareja` / `chicos` / `fondo`) se descartaron: "ver
   solo" y "ver en pareja" no son atributos que existan en los datos, así que
   los dos filtraban por lo mismo; y `fondo` mezclaba películas simples con
   películas flojas bajo la misma promesa.
3. Elige una y aparece **una tarjeta**.
4. Tres acciones: **Verla** (primaria), **Otra**, **Ya la vi**.

El diseño de la tarjeta viene en capturas aparte.

## Lo que ya existe en Supabase

Tabla `roulette_titles`: 1811 títulos, de los cuales **765 tienen texto
editorial**. Los otros tienen `razon` NULL y la función los ignora — se
completan en pasadas futuras del pipeline offline.

Función de servido:

```sql
get_roulette_picks(
  p_providers text[],
  p_escenario text default 'larga',     -- corta | larga | chicos
  p_excluir   integer[] default '{}',   -- tmdb_id ya vistos
  p_region    text default 'AR',
  p_seed      text default '',
  p_limit     integer default 20
)
returns (tmdb_id, media_type, title, year, runtime, genres,
         edad, razon, advertencia, atencion, vote_average, providers)
```

Ya resuelve del lado de la base: sólo títulos con texto, sólo disponibles en
las plataformas pasadas, filtro por escenario, exclusión de los ya vistos, y
exclusión de películas que requieren haber visto otras antes
(`requiere_contexto`), **en los tres escenarios**.

Además, **sólo devuelve títulos que tengan `advertencia`**. El bloque "PERO" es
el diferencial de la tarjeta: una tarjeta sin él se parece a cualquier otra app.

**La función NO valida `p_escenario`.** Un valor que no es ninguno de los tres
cae en su `else true` y devuelve el pool sin filtrar por nada, sin tirar error.
Por eso la app gatea la entrada con `esEscenario` antes de llamarla.

RLS permite `select` público: alcanza la anon key.

## Requisitos

### 1. Traer 20, consumir de a uno

La función devuelve 20 candidatos. **"Otra" consume de esa lista en el
cliente, sin volver a consultar la base.** Una query por sesión, no una por
toque. Cuando se agota la lista, se pide otra tanda.

### 2. Mapeo de nombres de plataforma — CRÍTICO

`providers` guarda nombres tal como los devuelve TMDB / JustWatch:
`Netflix`, `Disney Plus`, `MovistarTV`, `Amazon Prime Video`, `HBO Max`,
`Paramount Plus`, `Claro video`, `Apple TV`, `Plex`, `Mercado Play`,
`Pluto TV`, `MUBI`, `Universal+ Amazon Channel`.

Revisar cómo `lib/providers-ar.ts` identifica las plataformas del usuario y
**construir un mapa explícito** hacia esos nombres.

Es el mismo requisito que en el spec del chip curado, y por la misma razón:
durante el análisis, pasar `"movistar"` en vez de `"MovistarTV"` hizo
desaparecer 15 títulos sin ningún error visible. `MovistarTV` es el
proveedor más grande del pool con 594 títulos — un tercio del catálogo
depende de que ese nombre matchee.

Si un nombre no tiene correspondencia, que falle ruidosamente en
desarrollo, no en silencio.

### 3. "Ya la vi" comparte dato con la ficha

El botón de la tarjeta escribe **en el mismo lugar** donde ya se guarda el
"ya la vi" de las fichas de películas y series. No crear un almacenamiento
paralelo.

Y esos `tmdb_id` se pasan en `p_excluir`, así que la ruleta arranca sabiendo
lo que la persona ya vio desde el primer uso.

`p_excluir` se pasa desde la app en vez de resolverse en SQL, a propósito:
así la función no queda acoplada al esquema de usuarios.

### 4. Semilla

Usar **la misma semilla por día que ya usa el resto de la app**. No inventar
una nueva ni cambiarla a por-usuario: la semilla compartida es lo que
permite que el cache sirva a varios usuarios a la vez.

### 5. Las etiquetas son frases, no rótulos

El campo `atencion` (`alta` / `media` / `fondo`) **ya no filtra nada**: quedó
sólo como etiqueta de la tarjeta. Ojo que sus valores son independientes de los
escenarios — el `fondo` de acá es un nivel de atención, no el escenario viejo
que se eliminó. **No se muestra crudo.** Se muestra una frase de un banco
escrito a mano, rotando entre variantes:

| `atencion` | Frases |
|---|---|
| `alta` | "Pide cabeza" · "Si te das vuelta un segundo, ya no entendés nada" |
| `media` | "Se sigue sola" · "Ni liviana ni pesada" |
| `fondo` | "Se mira fácil" · "Aguanta que cocines" |

El banco vive en el código, no en la base. Voz única y consistente.

### 6. La advertencia es opcional (guard, no caso real)

**En la práctica ya no viene NULL**: la función filtra y sólo devuelve títulos
que la tengan. El guard se mantiene por las dudas — **cuando es NULL, el bloque
"PERO" simplemente no se renderiza**, sin texto de relleno ni placeholder— pero
no se va a disparar.

### 7. Enriquecimiento y presentación

`roulette_titles.title` es un snapshot de auditoría. **Para mostrar, usar
TMDB**, con la misma función cacheada en Redis que ya usan los rieles del
home — respeta idioma y región, y no duplica cache.

De ahí salen también póster, duración y géneros para la tarjeta.

### 8. Deep link a la plataforma

El botón "Verla" debería llevar a la ficha en la plataforma, no a su home.
TMDB devuelve el link del proveedor en el mismo endpoint de
`watch/providers`. Si complica, dejarlo para después: no bloquea.

## Investigar antes de escribir código

1. Cómo `lib/providers-ar.ts` nombra las plataformas y de dónde salen las
   del usuario
2. Dónde y cómo se guarda hoy el "ya la vi" de las fichas
3. Cuál es la semilla por día que usa el resto de la app y dónde se calcula
4. Qué función de enriquecimiento con cache en Redis conviene reutilizar

Si algo de este spec choca con lo que encontrás en el código, decilo antes
de improvisar.

## Criterios de aceptación

- [ ] Los 16 chips del home se comportan exactamente igual que antes
- [ ] Los tres escenarios devuelven resultados con texto
- [ ] Un escenario viejo o inventado NO devuelve el pool sin filtrar: la app
      lo gatea y cae al default (`larga`)
- [ ] "Otra" no dispara una query nueva hasta agotar la tanda de 20
- [ ] Un título marcado como visto no vuelve a salir
- [ ] "Ya la vi" desde la tarjeta se refleja en la ficha de esa película, y
      viceversa
- [ ] Cuando `advertencia` es NULL, el bloque "PERO" no aparece
- [ ] Ningún nombre de plataforma se pierde en el mapeo — verificar
      explícitamente que MovistarTV matchea
- [ ] Nunca se muestra el valor crudo de `atencion`

## Pendientes conocidos (no son parte de esta tarea)

- 1046 títulos del pool no tienen texto todavía. Se completan offline; no
  requiere cambios en la app.
- Tamaño del pool con Netflix + Disney Plus, al 2026-08-10: **110 títulos en
  `corta`, 216 en `larga`, 104 en `chicos`**. Con las cuatro plataformas
  grandes, bastante más. Si alguno se siente repetitivo, se amplía desde el
  pipeline.
