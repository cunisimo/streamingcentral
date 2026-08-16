# Estado de Yump

> Documento de traspaso. Se actualiza al cerrar una sesión de trabajo larga.
> **Última actualización: 15 de agosto de 2026.**

`CLAUDE.md` se carga solo en cada conversación y ya contiene las decisiones de
arquitectura, las limitaciones de TMDB y las reglas de cada feature. **Este
archivo no las repite**: acá va el estado del momento y lo que queda pendiente.

---

## ⚠️ Lo primero: hay trabajo sin desplegar

```
origin/main   bd7c85f
main local    7796db9   ← 5 commits por delante
```

**Producción NO tiene** la rotación de ejes de los carruseles de audiencia ni el
cacheo de `publishedIds`. Está todo mergeado a `main` local, verificado y
medido; solo falta `git push origin main`.

Además hay **una rama sin mergear a propósito**: `feat/hero-universo`
(`9ee6294`), que por ahora solo contiene la foto del "antes" del hero.

---

## Qué se hizo en esta sesión

### Rendimiento y cache

| Cambio | Resultado medido |
|---|---|
| **CLS** — reserva de espacio, `font-display: optional`, ancho fijo en el navbar | 0.0857 → **0.0036** |
| **MGET** — las lecturas de Redis se agrupan en lotes | Lecturas de un rearmado: 391 comandos → **19** |
| **Pool cache** — `discover` cacheado por plataforma individual | Segundo usuario con plataformas que se solapan: 26 llamadas → **8** |
| **`publishedIds`** cacheado | 16 viajes a Supabase por rearmado → **1** |

### Variedad del catálogo

- **Tope de 2 por saga en todo el Home.** Sci-fi mostraba 7 Spider-Man; ahora
  ninguno se repite más de dos veces en todo el Home.
- **Rotación de ejes en los carruseles de audiencia.** Cinco ejes (`pop`, `top`,
  `nuevo`, `taquilla`, `hondo`) rotan con la semilla del día. Cobertura semanal:
  **20 títulos fijos → 198 y 166**. Solapamiento día a día: 100% → 0-21%.
  La rotación es **invisible**: los títulos de los rieles no cambian nunca.

### Correcciones

- **`dailySeed()` en hora argentina.** Todo lo que rota por día cambiaba a las
  21:00 locales. Tiene test (`lib/fecha.test.ts`, `npm test`).
- **"Recordarme"** ya no agenda la fecha de cine en películas: usa la digital
  argentina y devuelve 404 si no existe. El `.ics` de series usaba
  `first_air_date` —el estreno original, de años atrás— y ahora usa
  `next_episode_to_air`. El 404 se avisa en la interfaz en vez de descargar el
  JSON del error.
- **"Próximamente"** filtra lo vencido al leer, sin depender de que el sync esté
  fresco.
- **Contexto al volver de una ficha**: el scroll vertical se restauraba a 930 en
  vez de 1800; ahora vuelve entero, y cada riel recupera su scroll horizontal.
- **Deep links**: "Volver" en una ficha compartida ya no saca al usuario de la
  app.

---

## Lo que queda por hacer

### 1. Pushear `main` (5 minutos)

Nada más que eso. Está todo verificado.

### 2. El hero — **empezado, con la foto del antes ya tomada**

Rama `feat/hero-universo`. **El plan está cerrado y acordado**, falta escribirlo:

- El universo del hero son 40 títulos: enriquece 40 para mostrar 6.
- Se amplía con `candidatosDePools` y receta `hero-<eje>` (crudos), se elige con
  `pickDaily` sobre ese universo grande, y **recién ahí se enriquecen los 6**.
- **Ordenar por `id` antes de barajar**: la permutación tiene que depender del
  conjunto y no del orden de llegada, o el botón "Otras" se desincroniza.
- **El camino de las pastillas queda fuera de alcance.** Los chips curados son
  base propia con revisión humana.

Criterios de aceptación acordados:

| | Hoy | Objetivo |
|---|---|---|
| Clics limpios de "Otras" antes de repetir | 6 | **≥ 12** |
| Tiempo de respuesta de "Otras" | 168-179 ms | no empeora |
| Cobertura semanal del hero | 40 | ≥ 100 |
| Payload del Home vs `offset=0` | — | **idénticos** |
| Chips curados | — | **idénticos a la foto** |

**Dos condiciones del dueño:**

1. La verificación de los chips va contra `docs/medidas/2026-08-15-hero-antes.json`
   y **no** contra una corrida nueva. Ese archivo no es reproducible: la semilla
   del día entra en el orden.
2. **No se mergea hasta que el dueño lo pruebe a mano.** Ninguna medición dice si
   "Mágica navidad" sigue trayendo películas de navidad.

### 3. Después del hero

- **`home:v2`** — evaluar si el payload compuesto sigue teniendo sentido. Se
  decide **con los números del paso 3 puestos**, no con los de ahora.
- **Rieles de género con rotación de ejes** — mismo trabajo que audiencia, pero
  son once y usan el mismo mecanismo de vueltas (ver más abajo).
- **Pipeline de escrituras a Upstash** — baja round-trips, no comandos. Poco
  retorno; el rearmado en frío es el caso raro.

---

## Issues abiertos (`docs/ISSUES.md`)

| # | Qué |
|---|---|
| #1 | Lighthouse Performance 61 en móvil |
| #2 | `--faint` no cumple contraste AA |
| #3 | Caminos de red sin ejercitar en la PWA |
| #4 | Fechas en UTC: `porEstrenar`, `today()`, el sync |
| #5 | ¿"Próximamente" muestra estreno en cine o llegada a streaming? |
| #6 | "Próximamente" mezcla estrenos con episodios semanales |
| #7 | `upcoming_content`: las filas existentes se quedan viejas |
| #8 | `upcoming_content`: sesgo permanente hacia lo popular |
| #9 | La popularidad es el orden por defecto en toda la app |

---

## Cosas que cuestan tiempo si no se saben

**El tope de vueltas está calibrado para el eje más fácil de llenar.** Un día de
`hondo` termina con 21 tarjetas y uno de `pop` con 39, y la conclusión obvia
—que `hondo` es caro— es al revés: gastó 407 enriquecidos contra 434. Le sobró
presupuesto sin usar. Está documentado junto a `MAX_VUELTAS` en `lib/home.ts`.
**Cuando se toquen los rieles de género, ese número se revisa con ese dato.**

**Que dos cosas que deberían diferir den lo mismo es una alarma.** Documentado en
`MANTENIMIENTO.md` 8.b. Así se encontró el kill switch roto del pool cache.

**`upcoming_content` no es la agenda de estrenos**: es lo que estaba en el top 60
de popularidad el día en que se escribió cada fila. `MANTENIMIENTO.md` 5.b.

**El pool de una plataforma no es único**: hay una variante por configuración de
filtros, porque `withoutGenres` depende del conjunto completo de plataformas.
Documentado en `lib/pools.ts`.

**Interruptores de emergencia**: `POOL_CACHE=0` vuelve al camino viejo completo
de discover; `CACHE_BATCH=0` vuelve al GET por clave.

**`next build` con `next dev` corriendo corrompe `.next`.** Matar el dev antes.

---

## Sin trackear, de otra línea de trabajo

`prompts/noticias-filtro.md`, `prompts/noticias-redaccion.md` y
`supabase/migrations/004_news.sql`. Estaban al empezar la sesión y no se
tocaron. Si `004_news.sql` está aplicado en producción, debería versionarse por
el mismo motivo que el resto del pipeline.
