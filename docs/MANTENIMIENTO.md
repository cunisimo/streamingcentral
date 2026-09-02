# Mantenimiento — chips curados y ruleta

Todo lo que sigue corre **offline, desde la raíz del repo**, y termina
pegando SQL a mano en el editor de Supabase. Nada de esto toca la app.

Requisitos: `.env.local` con `TMDB_READ_TOKEN`, y `claude` logueado con la
suscripción (`claude` → `/status` tiene que mostrar el plan, no una API key).

---

## Cadencias

| Cada cuánto | Qué |
|---|---|
| Mensual | Disponibilidad de la ruleta (§2) |
| Trimestral | Títulos nuevos en la ruleta (§3) |
| Octubre | Chip Mágica navidad, antes de la temporada (§4) |
| Después de cada corrida | Diff del mapa de plataformas (§5) |

---

## 1. Reglas que valen para todo

**Los scripts son reanudables.** Si una corrida se corta —error, se acaba la
cuota, cerrás la terminal— volvés a correr **el mismo comando** y retoma
donde quedó. No repite lo hecho ni lo cobra de nuevo.

**Generar no es cargar.** `generate-copy.mjs` escribe en `data/`, no en
Supabase. La carga es un paso aparte y explícito. Es el error más fácil de
cometer: ver la generación terminar y creer que ya está en la base.

**`--max-turns 4` es necesario.** Con 1 los lotes fallan intermitentemente
con `terminal_reason=max_turns`. Ya está puesto en los scripts; no lo bajes.

**El costo sale de la cuota del plan Max, no de la API.** El
`total_cost_usd` que informan los scripts es sólo una referencia. Medí el
porcentaje de sesión antes y después si vas a hacer una tanda grande, y
acordate de que Claude Code para programar come del mismo pozo.

---

## 2. Refrescar disponibilidad (mensual)

Las plataformas rotan catálogo. Sin esto, la app recomienda películas que ya
no están.

```bash
node --env-file=.env.local scripts/build-roulette-pool.mjs --min-nota 6.0 --pages 8
node scripts/build-roulette-sql.mjs
```

Pegá en Supabase `data/carga-ruleta-1.sql` … `-N.sql`, **en orden**.

El upsert usa `coalesce` en `razon`, `advertencia` y `atencion`: recargar el
pool **no borra** los textos ya escritos.

Verificación:

```sql
select count(*) as total, count(razon) as con_texto,
       count(*) filter (where advertencia is not null) as con_pero
from roulette_titles;
```

---

## 3. Sumar títulos nuevos a la ruleta (trimestral)

Cuatro comandos, en este orden. **Ninguno se puede saltear**: si generás
textos pero no clasificás contexto, las secuelas nuevas entran a la ruleta
con `requiere_contexto = false` y se sirven mal.

```bash
# 1. Traer lo que se estrenó o llegó a alguna plataforma
node --env-file=.env.local scripts/build-roulette-pool.mjs --min-nota 6.0 --pages 8

# 2. Escribir razón, advertencia y atención para los nuevos
node scripts/generate-copy.mjs --todos

# 3. Detectar cuáles son secuelas
node --env-file=.env.local scripts/enrich-roulette-collections.mjs

# 4. Decidir cuáles piden haber visto las anteriores
node scripts/classify-context.mjs

# 5. Armar el SQL
node scripts/build-roulette-sql.mjs
```

El paso 2 es el caro. Si querés medir la cuota, hacelo por tramos con
`--por-decada 160`, `210`, `260`… antes de cerrar con `--todos`.

### Carga en Supabase

1. `data/carga-ruleta-1.sql` … `-N.sql`, en orden
2. `data/carga-contexto.sql` **al final** — marca todo en `false` antes de
   aplicar su lista, así que si va antes, los títulos nuevos quedan sin marcar

### ⚠ El paso que se olvida siempre

`classify-context.mjs` **reescribe** `data/carga-contexto.sql` y se lleva
puestas las excepciones manuales. Antes de pegarlo, agregá esto arriba del
`commit;`:

```sql
-- Excepciones a mano: el clasificador lee la saga Harry Potter como
-- episódica, y usa orden cronológico para Star Wars en vez de estreno.
update roulette_titles set requiere_contexto = true
where title in (
  'Harry Potter y la cámara secreta',
  'Harry Potter y el prisionero de Azkaban',
  'Harry Potter y el cáliz de fuego',
  'Harry Potter y la Orden del Fénix',
  'Harry Potter y el misterio del príncipe',
  'La guerra de las galaxias. Episodio I: La amenaza fantasma'
);
```

Verificación (el número tiene que **subir** respecto de la corrida anterior):

```sql
select count(*) filter (where requiere_contexto) from roulette_titles;
```

Y que los tres escenarios tengan catálogo:

```bash
node scripts/preview-escenarios.mjs --corte 90
```

### Si falta cine corto

El escenario `corta` (≤ 90 min) es el que primero se queda sin catálogo,
porque el piso de votos del pool principal sesga hacia películas largas.

```bash
node --env-file=.env.local scripts/build-shorts-pool.mjs
```

Trae películas de 60 a 100 minutos con piso de 50 votos y las **suma** al
pool (hace backup en `data/pool-ruleta.backup.json`). Después hay que correr
igual los pasos 2 a 5.

---

## 4. Actualizar un chip curado

Hoy sólo está curado `magica-navidad`. Correr en octubre, antes de la
temporada.

```bash
node --env-file=.env.local scripts/extract-pool-navidad.mjs
node scripts/inspect-pool.mjs
node scripts/prefilter.mjs --chip magica-navidad
node scripts/classify.mjs --chip magica-navidad
node --env-file=.env.local scripts/enrich-collections.mjs --chip magica-navidad
node scripts/select.mjs --chip magica-navidad
node --env-file=.env.local scripts/availability.mjs --chip magica-navidad
node scripts/build-sql.mjs --chip magica-navidad
node scripts/build-blocklist-sql.mjs --chip magica-navidad
```

Pegar en Supabase `data/carga-magica-navidad.sql` y después
`data/blocklist-magica-navidad.sql`.

`inspect-pool` chequea 12 títulos canónicos. Si faltan más de dos, las
keywords no cubrieron bien y hay que revisar `chips/magica-navidad.json`
antes de seguir.

El upsert **no pisa** el campo `revisado`: el trabajo de revisión humana
sobrevive a las recargas.

### Para agregar otro chip

Copiar `chips/magica-navidad.json` y `chips/magica-navidad.criterio.md` con
el slug nuevo, cambiar keywords y criterio editorial, y correr los mismos
scripts con `--chip <slug>`. No hace falta tocar código.

La excepción es la extracción: `extract-pool-navidad.mjs` tiene las keywords
hardcodeadas y habría que parametrizarla.

---

## 5. Diff del mapa de plataformas

**Después de cualquier corrida que agrande el pool.** El mapa de la app
(`lib/providers-ar.ts` y el mapa que armó Claude Code) se hizo contra una
lista fija de nombres. Si aparece un proveedor nuevo, queda invisible: la
ruleta anda, muestra menos títulos, y nadie se entera.

```sql
select distinct unnest(providers) as proveedor
from title_availability where region = 'AR' order by 1;
```

Comparar esa lista contra el mapa. El guard en runtime detecta códigos sin
mapear, pero **no** detecta un nombre mal escrito — la app no conoce la
lista de la base. Este diff es manual y no hay forma de automatizarlo del
lado de la app.

Referencia: `MovistarTV` es el proveedor más grande del pool. Si ese nombre
no matchea, se pierde un tercio del catálogo sin ningún error.

---

## 5.b Qué es realmente `upcoming_content`

Antes de tocar esa tabla, o de sacar conclusiones de lo que hay adentro:

> **`upcoming_content` no es "la agenda de estrenos". Es lo que estaba en el top
> 60 de popularidad el día en que se escribió cada fila.**

Eso no se deduce del esquema, y explica cosas que si no parecen bugs sueltos:

- Las filas son **sedimento de días distintos**, no una foto coherente. Dos filas
  vecinas pueden tener `updated_at` con una semana de diferencia.
- Un título puede **desaparecer y volver** sin que nadie lo toque, porque el
  ranking de popularidad de TMDB fluctúa a diario.
- Un título que nunca fue lo bastante popular **no entra nunca**, aunque estrene
  en una plataforma soportada y dentro de la ventana.
- Una fila que dejó de refrescarse no queda solo vencida: queda **equivocada**.
  En series, `next_episode_to_air` se mueve cada semana, así que una fila vieja
  anuncia un episodio que ya pasó y esconde el que viene.

El motivo es `collectSeries`: `discover/tv` ordenado por `popularity.desc` con
`MAX_PAGES = 3`. Medido el 2026-08-15, eran **60 series de 1696 elegibles**.

Las dos consecuencias están separadas a propósito en `docs/ISSUES.md` — #7
(frescura) y #8 (cobertura) — porque el arreglo de la primera no toca la segunda,
y si van juntas se implementa el refresco y se da el tema por cerrado.

La lectura ya no muestra lo vencido (`upcomingList` filtra por fecha del día
argentino), así que el síntoma no se ve en la app; el dato de la tabla sigue
siendo el que es.

## 6. Revisión de calidad (opcional, gratis)

```bash
node scripts/check-vocabulario.mjs
```

Busca vocabulario de España en los textos generados. El pool se extrae con
`language=es-ES`, así que el prompt recibe títulos traducidos en España y el
modelo a veces lo arrastra. En la última corrida fueron 2 de 765: si son
pocos, se editan a mano en `data/copy-ruleta.json`.

```bash
node scripts/review.mjs --chip magica-navidad --solo revisar
```

Lista los títulos del chip con confianza media o baja. Es el trabajo humano
pendiente y lo único que separa esto de un filtro automático.

---

## 7. Dónde se cambia cada cosa

| Qué querés cambiar | Archivo |
|---|---|
| Criterio editorial de un chip | `chips/<slug>.criterio.md` |
| Keywords, géneros excluidos, piso de votos de un chip | `chips/<slug>.json` |
| Voz y reglas de los textos de la ruleta | `prompts/ruleta-copy.md` |
| Corte de duración de los escenarios | función `get_roulette_picks` en Supabase **y** `supabase/migrations/002_roulette.sql` |
| Frases de la etiqueta de atención | `components/ruleta/frases.ts` |

Editar el `.sql` de migración **no cambia nada**: la base tiene su propia
copia. Hay que pegar la función entera (de `create or replace` hasta `$$;`)
en el SQL Editor.

⚠ `frases.ts` usa `fondo` como **nivel de atención**, no como escenario. El
escenario `fondo` se eliminó; el nivel sigue existiendo. Un buscar-y-
reemplazar de esa palabra rompe el banco de frases.

---

## 8. Errores conocidos y qué significan

| Síntoma | Causa | Solución |
|---|---|---|
| `terminal_reason=max_turns` | `--max-turns` muy bajo | Ya está en 4; si vuelve, subilo |
| `claude falló: ?` sin detalle | Sesión OAuth vencida | `claude` → `/login` |
| Lotes fallando en cadena | Se acabó la cuota de sesión | Esperar y correr el mismo comando |
| `column ... does not exist` | Falta un `alter table` que está fuera del `begin;` | Pegar el archivo SQL **entero**, no desde `begin;` |
| El conteo en Supabase no cambió | Se pegó una pestaña vieja de VS Code | Cerrar y reabrir el archivo |
| `requiere_contexto` no subió | Falta pegar `carga-contexto.sql` | §3 |
| Escenario devuelve todo sin filtrar | Se llamó con un escenario inexistente | Sólo valen `corta`, `larga`, `chicos` |

---

## 8.b Que dos cosas den lo mismo es una alarma, no un alivio

Al medir el cache de pools, el rearmado en frio daba **exactamente las mismas 62
llamadas a TMDB** con la optimizacion prendida y apagada. Eso no era una buena
noticia: era el kill switch roto. `POOL_CACHE=0` salteaba el cache pero seguia
pidiendo un pool por plataforma, asi que las dos ramas hacian el mismo trabajo y
el interruptor no servia ni para volver atras ni para medir.

La regla, que vale para cualquier medicion de este proyecto:

> **Si dos configuraciones que deberian diferir dan el mismo numero, lo primero
> que hay que dudar es de la medicion, no de la optimizacion.**

Es el mismo reflejo que salvo otras dos veces acá:

- Un test que pasa con la implementacion vieja y con la nueva no esta probando
  el arreglo (por eso `lib/fecha.test.ts` incluye a proposito la version vieja y
  verifica que FALLE).
- Un contador de comandos en cero no significa "no gasta nada": significa que el
  cache estaba en memoria y no habia Redis que contar.

Antes de festejar un numero, preguntarse que numero se esperaba y por que.

## 8.b.2 Si falla el grupo de control, el roto es el instrumento

Corolario de 8.b, y la señal más barata que hay: **código que no se modificó no
puede haberse roto.** Cuando una medición marca en rojo algo que el cambio ni
tocó, lo primero que falla es la medición.

El caso, del 16/08. Al ampliar el hero quedaron tres chips a propósito en el
camino viejo —`navidad` (curado), `reales` (regla `alt`) y `supervivencia`
(`balanceDocs`)— justamente para que hicieran de control. La corrida del criterio
"ningún chip vacío en 7 días" los dio **vacíos a los tres**.

Ahí terminaba el problema, y no se vio. La primera hipótesis fue 429 de TMDB
acumulados por la propia medición: plausible, y **falsa** — se descartó midiendo
(3021 respuestas, todas 200). Lo real era mucho más tonto:
`recommendations()` había pasado a devolver `{ items, motivo }` en vez de un
array, y el script lee `items.length` sin tipos. `undefined` es falsy, así que
**todas** las casillas se contaron vacías.

> Un control que falla no es un hallazgo peor: es un hallazgo **imposible**, y
> por eso es la señal más confiable de que hay que dejar de mirar el sistema y
> mirar el instrumento. Es gratis y hay que usarla primero, antes que cualquier
> hipótesis sobre el producto — sobre todo antes de una plausible.

### Y la trampa que lo escondió: no pasar un diagnóstico por `tail`

Los tres controles vacíos se habrían visto de entrada si la salida hubiera estado
completa. Estaba pasada por `tail -30`, así que de las **112** casillas vacías se
vieron **30**, y esas 30 empezaban justo en un chip creíble. El recorte convirtió
"todo está vacío" —que grita *arnés roto*— en "algunos chips fallan", que parece
un bug de producto y manda a investigar el lugar equivocado.

`medir-hero.mjs` ahora tira error si las 112 casillas dan vacías y TMDB respondió
200 siempre. Pero el reflejo importa más que el chequeo: **antes de creerle a un
resultado malo, mirar si el control también falló.**

## 8.c Medir algo que rota por día: clavar la fecha, y saber qué no se clava

Casi todo lo que se puede medir en esta app rota con la semilla del día. Sin
fijarla, dos corridas del mismo código en días distintos dan resultados
distintos, y esa diferencia tapa la que importa.

`YUMP_FECHA=2026-08-15` fuerza `hoyAR()` y con eso toda la rotación. **Solo
funciona fuera de producción**, y solo intercepta la pregunta "¿qué día es hoy?":
`hoyAR(unaFecha)` —formatear una fecha dada, como el `.ics` de "Recordarme"—
sigue devolviendo lo suyo. Ver el comentario en `lib/fecha.ts`.

```bash
node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
     scripts/medir-hero.mjs informe 2026-08-15
```

`scripts/cargar-lib.mjs` es lo que permite importar `lib/*.ts` desde un script
suelto (stub de `server-only`, alias `@/`, imports sin extensión). Sirve para
medir cualquier función de `lib/`, no solo el hero.

**Lo que la fecha NO clava, y hay que descontar antes de leer un diff:**

- **El catálogo de TMDB.** `popularity.desc` se reordena todos los días del lado
  de TMDB y los estrenos entran y salen. Una foto de ayer no es reproducible hoy
  ni con la semilla fija.
- **El orden de llegada.** Medido el 16/08 contra la foto del 15/08: el hero
  viejo traía el **90% de los mismos títulos** y sin embargo solo **31% en la
  misma posición**. No se había roto nada — `pickDaily` baraja posiciones, así
  que el mismo conjunto llegando en otro orden sale distinto. De ahí sale la
  regla de ordenar por clave antes de barajar (`tandaAncha` en `lib/enrich.ts`).

Por eso la comparación se lee con **dos** números y no con uno: *posición* (con
orden) y *conjunto* (sin orden). Un chip que cambia de posición pero conserva el
conjunto se reordenó; uno que pierde el conjunto trae otra cosa.

Y por eso conviene dejar **controles** en la medición: al ampliar el hero, los
chips `navidad` (curado), `reales` (regla `alt`) y `supervivencia`
(`balanceDocs`) quedaron a propósito en el camino viejo. Si alguno de esos tres
se hubiera movido, el cambio estaba tocando algo que no debía.

## 8.d Un promedio no ve una casilla vacía

El hero ampliado pasó todos sus criterios —cobertura, clics limpios, tiempos— y
aun así rompió "Contacto extraterrestre", que no mostraba **nada**. Ninguna de
esas métricas podía verlo: todas miran el hero base o promedian los 16 chips, y
un chip angosto que se vacía un día de cada cinco no mueve un promedio.

La medición que sí lo ve no promedia nada: **recorrer las 112 casillas (16 chips
× 7 días) y listar las vacías una por una.** Está en `medir-hero.mjs chips` y es
parte del informe.

> Cuando una feature tiene N superficies de tamaños muy distintos, el criterio
> de aceptación tiene que recorrerlas todas. La superficie más chica es la que
> rompe, y es exactamente la que un promedio esconde.

De ahí salió también la regla de los ejes: los cinco se calibraron contra
superficies grandes, donde siempre hay material. `hondo` arranca en la página 4,
así que necesita más de 60 resultados **por plataforma** —los pools se piden por
plataforma suelta, no por la unión— y `aliens` tiene 19 en Netflix. Ahora
`candidatosConEje` mira la cosecha y cae a `pop` si no llena. No era solo
`hondo`: el guard también salta con `top` en superficies angostas (scifi/tv trae
16 títulos sobre el piso de 300 votos), que no llega a vaciar pero sí deja el
riel corto.

Lo que el guard **no** resuelve —que los chips angostos casi no reciben rotación
porque no tienen material— está anotado como issue #10.

### El arnés no lo ve `tsc`, así que miente en silencio

Los scripts de `scripts/` son `.mjs`: **cuando cambia la firma de algo de `lib/`
hay que actualizarlos a mano o se rompen sin avisar.** Así se contaron las 112
casillas como vacías (el caso completo está en 8.b.2). Dos resguardos en
`medir-hero.mjs`:

- `tanda()` **valida la forma** de lo que devuelve `recommendations()` y explota
  si no es la esperada, en vez de contar ceros.
- Si las 112 casillas dan vacías y TMDB respondió 200 siempre, tira error.

Y un contador de respuestas de TMDB, que avisa y sale con código 2 si alguna no
fue 200. La hipótesis del 429 era razonable y sin el contador no se podía
descartar; si aparece, bajar `TMDB_MAX_CONCURRENT` a 8 y repetir.

> La tolerancia a fallos de la app es enemiga de la medición: `settleAll` y el
> `allSettled` de los pools se tragan los errores **a propósito** para que un
> riel caído no tumbe el Home, y eso mismo hace que en un informe cualquier
> falla llegue disfrazada de "lista vacía".

## 9. Estado actual (11/08/2026)

**Ruleta** — `roulette_titles`: 2401 filas, 2259 con texto, 1782 con
advertencia, 144 con `requiere_contexto`. Piso de 51 votos.
Escenarios: `corta` (≤ 90 min), `larga` (> 90), `chicos`.

**Chip Mágica navidad** — `chip_titles`: 122 curados, 75 disponibles en AR.
`chip_blocklist`: 95 exclusiones. 48 títulos con confianza media o baja sin
revisión humana.

**Pendientes conocidos**

- El pipeline del chip aplica el tope por saga *antes* de conocer la
  disponibilidad. El orden correcto sería calidad → disponibilidad → tope.
  Cuesta entre 5 y 10 títulos.
- La ruleta es sólo películas. Las series serían la mejora natural del
  escenario `corta`, pero necesitan criterio propio (¿la serie entera o la
  primera temporada?).
- `extract-pool-navidad.mjs` no está parametrizado por chip.

---

## Preview NO puede compartir el Redis de producción (idioma es-MX)

**La trampa.** La integración de Vercel con Upstash crea `KV_REST_API_URL` y
`KV_REST_API_TOKEN` y por defecto las asigna a **los tres scopes**: Production,
Preview y Development. `lib/cache.ts` acepta ese juego de nombres además de los
`UPSTASH_*`, así que **un Preview lee y escribe el mismo Redis que producción**.

Con el idioma en `es-ES` eso nunca importó: Preview escribía las mismas claves
compatibles que producción y el contenido era idéntico. **Con la tanda 2 sí
importa**, porque las claves llevan la huella (`es-MX+f.r1`) y un Preview
probando `es-MX` **precalienta exactamente las claves que producción va a usar**.
El "arranque frío" que hay que medir después del deploy llegaría **caliente**, y
la medición de +llamadas y +comandos daría un número falso y optimista.

**Antes de la tanda 2, verificar qué recibe Preview:**

1. Vercel → Settings → Environment Variables → mirar los scopes de `KV_REST_API_URL`.
2. Desplegar un Preview y pedir `GET /api/health`. La respuesta dice `cache`:
   `"redis"` significa que Preview está pegándole a Upstash.

**Aislamiento, sin sumar un servicio pago — dos opciones:**

| | Cómo | Costo | Contra |
|---|---|---|---|
| **A. Preview sin Redis** *(recomendada)* | Neutralizar `KV_*` en Preview. `lib/cache.ts` cae al cache en memoria | 0 | Preview más lento y sin cache entre instancias. Para probar funcionalidad alcanza |
| B. Namespace separado | Un prefijo por entorno en todas las claves | 0 | Código nuevo en el camino crítico, para un problema que dura una tanda |

### "Sacar `KV_*` del scope Preview" NO se puede — hacerlo así

**La primera redacción de esto decía "sacar `KV_*` del scope Preview" y es una
instrucción peligrosa.** La integración crea **una sola entrada por variable con
los dos targets**:

```
KV_REST_API_URL    Sensitive    Production, Preview
KV_REST_API_TOKEN  Sensitive    Production, Preview
```

No hay una entrada de Preview separada que borrar. Un `vercel env rm
KV_REST_API_URL preview` sobre una entrada compartida se lleva puesta también la
de Production, y **producción sin Redis cae al cache en memoria**: cada request
rearma el Home entero, ~650 llamadas a TMDB. Es el peor resultado posible de un
paso cuyo objetivo era no tocar producción.

**Lo que sí funciona: una variable de Preview ACOTADA A LA RAMA.** Convive con la
entrada compartida, la pisa solo para esa rama, y no toca Production:

```bash
export VERCEL_ORG_ID=… VERCEL_PROJECT_ID=…
for v in KV_REST_API_URL KV_REST_API_TOKEN KV_REST_API_READ_ONLY_TOKEN KV_URL REDIS_URL; do
  npx vercel env add "$v" preview <rama> --value "" --yes
done
npx vercel env add IDIOMA_TITULOS preview <rama> --value "es-MX" --yes
```

El valor **vacío** es lo que hace caer a memoria: `lib/cache.ts` exige URL **y**
token no vacíos para instanciar el cliente. Un valor inválido pero no vacío es
peor — construiría el cliente y fallaría en cada comando en vez de degradar
limpio.

**Se neutralizan las cinco, no solo las dos que el código lee.** `KV_URL` y
`REDIS_URL` son connection strings TCP que este cliente no usa, y
`KV_REST_API_READ_ONLY_TOKEN` no se lee nunca; pero el objetivo es que el Preview
no *tenga* credenciales, no que no las use.

**El orden tiene una trampa: la rama tiene que existir en el repo conectado
antes de poder crear una variable acotada a ella.** Vercel responde
`branch_not_found`. Y la variable tiene que existir antes del deployment que la
necesita. Los dos requisitos juntos se resuelven así:

1. Crear la rama remota **apuntando a `main`**:
   `git push origin main:refs/heads/<rama>`. El Preview que dispara es código
   idéntico a producción: aunque alguien lo abra, escribe las mismas claves que
   producción ya usa. Empujar primero la rama con los cambios haría que ese
   primer Preview corriera con la configuración vieja y estrenara un espacio de
   claves nuevo contra el Redis de producción.
2. Crear las variables acotadas a la rama.
3. Recién ahí, `git push origin <rama>` con los commits reales.

**Verificar siempre, nunca asumir que el override ganó**: `GET /api/health` en el
Preview tiene que decir `503` + `"cache":"memoria"` + `credenciales: {url:false,
token:false}`. Si dice `200` + `redis`, el override no se aplicó y hay que frenar.

**Al terminar, deshacer** — estas entradas son de la rama y no tienen por qué
sobrevivirla:

```bash
for v in KV_REST_API_URL KV_REST_API_TOKEN KV_REST_API_READ_ONLY_TOKEN KV_URL REDIS_URL IDIOMA_TITULOS; do
  npx vercel env rm "$v" preview <rama> --yes
done
```

Ese `rm` sí es seguro: apunta a la entrada de la rama, que es una entrada aparte.

**Los Previews están detrás de Vercel SSO**, así que `curl` recibe un 302 al
login y la verificación visual la hace una persona con sesión. Lo que sí se
puede automatizar es el lado del servidor: `vercel logs <url> --json` está
autenticado por CLI y no pasa por el SSO. No hace tail continuo —cada
invocación trae una ventana reciente—, así que para seguir una sesión de pruebas
hay que hacer poll y deduplicar por `id`.

Se elige **A**: no toca código y el aislamiento es total. La confirmación es
`GET /api/health` en el Preview:

```
HTTP 503 + "cache":"memoria"   → Preview aislado, se puede medir
HTTP 200 + "cache":"redis"     → le está pegando a producción, PARAR
```

**El 503 es deliberado y no es un deploy roto**: la ruta responde 503 cuando el
cache no está operativo, justamente para poder monitorearlo sin parsear el
cuerpo. En un Preview sin Redis, ese 503 es el resultado esperado.

**Si la integración no deja quitar `KV_*` solo de Preview** sin afectar
Production, eso es un bloqueo real: no seguir y resolverlo primero. Definir las
dos variables como cadena vacía en el scope Preview tiene el mismo efecto
(`lib/cache.ts` exige URL **y** token no vacíos para instanciar el cliente) y no
toca la entrada de Production.

**Qué NO hace falta limpiar.** Lo que se leyó y escribió durante la tanda 1 usa
las claves compatibles de `es-ES` —las mismas de siempre, con el mismo
contenido—, así que no hay nada que borrar. La prohibición es para las claves
**nuevas** de la tanda 2.

**Y no medir desde local contra el Redis de producción.** Hoy `.env.local` no
tiene credenciales de Upstash y el dev corre en memoria (se confirma con
`GET /api/health` → `"cache": "memoria"`, o con `0 requests` en la línea
`[home]`). Si alguna vez se agregan, vale la misma regla.


---

## El rollback del idioma cuesta un segundo arranque frío

**`IDIOMA_TITULOS=es-ES` + redeploy revierte el contenido de inmediato, pero no
devuelve el cache que había antes.** La huella pasa de `es-MX+f.r1` a `es-ES.r1`,
que **no** es el espacio vacío del modo compatible de la tanda 1: es un tercer
espacio, así que el Home y las diez familias restantes se rearman una vez más.

Es el precio elegido a propósito. La alternativa —claves sin huella— hacía que
un rollback siguiera sirviendo títulos mexicanos desde las mismas claves hasta
que expiraran TTLs de hasta 30 h, o sea que **no revertía nada**.

Medido (`docs/medidas/2026-08-23-idioma-tanda2-e2e.json`, corrida `roll`): el
contenido vuelve **exacto** a la línea de base —614 llamadas, 657 comandos,
84.318 B, los mismos 12 rieles, el mismo hero y las 7 fichas de control
idénticas—; lo único que se paga es el rearmado.

**El interruptor intermedio es `FALLBACK_IDIOMA=0`**: deja el idioma en `es-MX` y
apaga la reparación (huella `es-MX.r1`, 611 llamadas, 0 reparaciones). También
cuesta su propio arranque frío, y sirve para el caso "el fallback salió caro" sin
tener que volver al español de España.

---

## Cómo rehacer la medición de idioma con el mismo instrumento

El banco es un `git worktree` aparte, instrumentado **solo ahí**: el repo nunca
se toca. Dos piezas versionadas:

```bash
git worktree add --detach <ruta-del-banco> <commit>
cd <ruta-del-banco> && npm install && cp <repo>/.env.local .
node <repo>/scripts/banco-idioma-parche.mjs <ruta-del-banco>
bash <repo>/scripts/banco-idioma-correr.sh base1 3971 es-ES 1 fichas
bash <repo>/scripts/banco-idioma-correr.sh mx1   3981 es-MX 1 fichas
```

Tres reglas que el arnés ya aplica y que no hay que aflojar:

- **Un puerto distinto por corrida**, y abortar si está ocupado. Un servidor
  huérfano de la corrida anterior responde igual y se mide la variante
  equivocada — ya pasó, y dio payloads idénticos entre `es-ES` y `es-MX`.
- **Matar el ÁRBOL** (`taskkill /T /F`): `kill` sobre lo que devuelve `npx next
  dev` mata el wrapper, no el servidor.
- **`YUMP_FECHA` fija en todas las corridas.** Sin eso, cruzar la medianoche
  argentina cambia la semilla del día y la comparación mezcla el cambio de
  código con el cambio de día.

Y una regla de lectura: **verificar en la salida qué variante respondió**. El
arnés lo hace solo (la línea `[BANCO]` trae el idioma y el fallback, y aborta si
no coinciden con lo pedido).

**Los dos scripts de medición escriben en una ruta FIJA de `docs/medidas/`**
(`-idioma-fallback.json`, `-idioma-sinopsis.json`), así que volver a correrlos
**pisa el artefacto de la tanda 1**. Las corridas de la tanda 2 se guardaron
aparte (`-fallback-tanda2.json`, `-sinopsis-tanda2.json`) y el original se
recuperó con `git checkout --`. Si se vuelven a correr, hacer lo mismo: la foto
vieja es la mitad "antes" de cualquier comparación futura.

**Y no leer un diff contra una foto vieja sin acordarse de que TMDB deriva
solo.** En la corrida de la tanda 2, `sinopsis_vacia_es_ES` pasó de 2 a 1 sin que
nadie tocara nada: un título ganó su sinopsis en español entre una medición y la
otra.

---

## Runbook: precalentar el Home DESPUÉS de aprobar el Preview

**El problema que resuelve.** La tanda 2 cambia la huella de las familias de
claves (once en su momento, **doce desde 2026-08-30**), así que el primer request después de activar `es-MX` en Production
encuentra el cache vacío y paga ~650 llamadas a TMDB y ~650 comandos de Upstash.
Sin precalentar, esa cuenta la paga **el primer usuario que abra la app**, con la
combinación de plataformas que tenga, y las demás combinaciones siguen frías.

**El orden importa y no es negociable:**

1. Preview **aislado** del Redis de producción (`/api/health` → 503 + `memoria`).
2. Probar la checklist en Preview.
3. **Recién ahí**, `IDIOMA_TITULOS=es-MX` en Production + redeploy.
4. **Recién ahí**, precalentar.

**Precalentar antes del paso 3 no sirve y encima estorba**: llenaría el espacio
de claves de `es-ES` (el viejo), y hacerlo desde un Preview que comparte el Redis
de producción es exactamente la trampa de la sección anterior — arruina la
medición del arranque frío, que es el número que hay que mirar en el deploy.

```bash
node scripts/precalentar-home.mjs --base=https://<produccion>
```

Sin `--aplicar` es un **dry-run**: lista las combinaciones y sale. Con
`--aplicar` las pide **una por vez**, con 3 s entre medio.

**Las tres reglas están en el script, no confiadas a quien lo corre:**

- **Explícito.** Sin `--aplicar` no pide nada.
- **Secuencial.** En paralelo son ~650 llamadas a TMDB por combinación arrancando
  juntas, y eso es justo lo que hace fallar a TMDB (ver abajo).
- **Rechaza lo degradado.** Si el payload viene con `degradado: true` o
  `fallos > 0`, esa combinación **no quedó cacheada** —`cachedIf` no guarda un
  payload degradado, a propósito— así que el script corta ahí y termina con
  código distinto de cero. Un precalentamiento que informa éxito habiendo servido
  rieles caídos es peor que no correrlo: deja creer que el cache está lleno.

Al final hace una **segunda vuelta de verificación**: si alguna combinación no
responde en menos de 1,5 s, no quedó cacheada y el éxito anterior era falso.

Las combinaciones por defecto son `n`, `d`, `m` y sus pares y el trío. **La clave
del Home ordena las plataformas**, así que `n,d` y `d,n` son la misma entrada; y
**no** incluye los toggles Películas/Series, que son claves aparte: cubrirlos
serían cientos de combinaciones. Se cambian con `--combos=n|d|n,d`.

---

## TMDB se degrada bajo concurrencia, y eso arruina cualquier medición de tiempo

**Demostrado, no supuesto.** Corriendo `scripts/medir-fallback-idioma.mjs` (144
requests a 16 en paralelo) y **al mismo tiempo** un Home frío del banco (hasta 24
en vuelo), TMDB empezó a devolver **502 en `/watch/providers`** y el Home salió
degradado.

Antes de fallar, se pone lento: en reposo la latencia por request es **p50 142 ms,
p95 ~200 ms, máximo bajo 600 ms y cero requests por encima de 2 s**. Las corridas
"raras" de 21-27 s que aparecieron en la medición del idioma venían todas justo
después de una ráfaga: para que un composer pase de 6 s a 22 s con las mismas 651
llamadas y el techo de 24 en vuelo, la latencia media tiene que multiplicarse
por cinco.

**Regla: no medir tiempos con otra cosa pegándole a TMDB al mismo tiempo.** Los
conteos —llamadas, comandos, bytes, títulos por riel— aguantan la carga; los
tiempos no. Y si una corrida sale lenta, mirar qué más estaba corriendo antes de
buscarle una explicación en el código.

Efecto secundario útil de ese accidente: confirmó **en vivo** que `safe` degrada
riel por riel en vez de tirar el Home entero, y que `cachedIf` no guarda un
payload degradado. En desarrollo `safe` re-lanza a propósito y por eso se vio
como un 500; en producción habría sido un 200 degradado y sin cachear.

---

## Comparar dos corridas: alternar, nunca contra una foto vieja

**El catálogo de TMDB deriva solo, y la deriva es del mismo orden que el efecto
que se busca medir.** Pasó y costó una conclusión publicada: se comparó una tanda
de `es-ES` contra una de `es-MX` medida hora y media después y se concluyó que el
idioma cambiaba las cantidades por riel. No las cambia — medidas **alternadas en
la misma ventana**, los doce rieles dan las mismas cantidades y once de doce el
mismo contenido.

Dos reglas que salen de ahí:

1. **Alternar las variantes dentro de la misma ventana**, no medir todo A y
   después todo B.
2. **Correr el control**: la misma variante dos veces. Si el composer es
   determinístico tiene que dar 0 diferencias, y si no da 0, lo que se esté
   midiendo no es el cambio.

Es la misma familia que la nota de 8.c sobre el hero, pero más estricta: allá
alcanzaba con reportar *conjunto* y *posición* por separado; acá el efecto es tan
chico (un título en 314) que la deriva lo tapa entero.

---

## Runbook: la ingesta manual del Top 10 después de deployar el resolvedor

Corre UNA vez, después de que el deploy esté en producción. **No hace falta
borrar ni tocar nada de la tabla**: `ingestLatestWeek()` reintenta sola las filas
con `tmdb_id` en `null` (`pendientes` incluye `prev.tmdbId === null`), así que la
única fila que va a resolver es la de Operation.

### Antes de correrla, qué va a pasar exactamente

`rows` se arma **sólo con las pendientes**, así que el `upsert` lleva **una fila**
y las otras 19 de la semana ni viajan en el payload. No es que "probablemente no
cambien": no se tocan.

De paso: el `select` de "conocidos" busca ese `raw_title` en semanas anteriores.
No existe, así que va derecho al resolvedor nuevo.

### 1. Verificar que el deploy es el que tiene el arreglo

En Vercel, que el deployment de producción apunte al commit `d3d5c7e` (o al que
quede al mergear). Si Vercel no tomó el push, es el problema conocido: se
destraba con un commit vacío, no con Redeploy.

### 2. La llamada, una sola vez

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://app.yump.ar/api/cron/netflix-top10
```

`$CRON_SECRET` es el mismo valor que está en las variables de Vercel y en tu
`.env.local`. La ruta compara en tiempo constante y sólo acepta el header
`Authorization`, no un query param.

**Respuesta esperada:**

```json
{ "ok": true, "week": "2026-08-16", "inserted": 1, "resolved": 1, "review": 1 }
```

- `inserted: 1` → tocó **una** fila. Si dice 20, algo cambió los `raw_title` y
  hay que mirar antes de seguir.
- `resolved: 1` → le encontró id.
- `review: 1` → esperado: el subtítulo de TMDB no es el del TSV.

**Si da timeout o una respuesta ambigua, NO la repitas.** Mirá primero la tabla
con el paso 3: el upsert es idempotente por `(week, category, rank)`, pero un
segundo intento a ciegas gasta llamadas a TMDB sin decirte nada nuevo.

**Si da `500`**, el cuerpo trae el error. Los dos probables: `SUPABASE_SERVICE_ROLE_KEY`
sin definir en producción, o TMDB caído (en ese caso el resolvedor devuelve
`null` sin asociar nada, que es el comportamiento correcto — reintentá más tarde).

### 3. Verificar en la base

```sql
select rank, raw_title, tmdb_id, needs_review, updated_at
  from netflix_top10
 where week = '2026-08-16' and category = 'tv'
 order by rank;
```

Qué tiene que dar:

- `rank 7` → `tmdb_id = 284753`, `needs_review = true`.
- Las otras 9 filas de `tv` con **el mismo `tmdb_id` y el mismo `updated_at`**
  que antes de la corrida. Ese `updated_at` sin mover es la prueba de que no se
  reescribieron.
- `movie` no se consulta porque no tenía pendientes; si querés la foto completa,
  sacá el `and category = 'tv'`.

### 4. Verificar en la app

En `/top`, con Netflix entre tus plataformas y el toggle en **Series**:

1. **Puesto 7** — ya no es el hueco gris con "Ficha no disponible": tiene que
   tener póster, título en español y el logo de Netflix.
2. **Puesto 1, Moria** — a color, con el logo de Netflix, **sin** el cartel "No
   está en tus plataformas".
3. **Los otros 8 puestos** — los mismos títulos y en el mismo orden.
4. El rótulo del bloque tiene que seguir diciendo **"Lo más visto esta semana ·
   dato oficial"**. Si dice "Lo más popular ahora", la semana pasó los 14 días y
   el problema es otro (issue #13).

No hace falta invalidar ninguna caché: el bloque de Netflix no se cachea —
`latestWeekRows()` va a Supabase en cada request y las fichas se enriquecen por
título. El service worker tampoco molesta: `/api/*` es Network Only.

### La ficha individual también quedó arreglada

**Esta sección decía que no lo estaba, y era una limitación mal declarada.** La
ficha de Moria (`/titulo/tv/322428`) mostraba "No está en streaming" siendo el
#1 del top oficial de Netflix. Esperar a TMDB no era una salida: su web ya
muestra el canal y el homepage de Netflix, y `/tv/322428/watch/providers` sigue
devolviendo `results: {}` — no es un cache nuestro ni una demora de horas.

Ahora la ficha usa la misma evidencia que la card, con una condición más:
además de `tmdb_id` resuelto exige **`needs_review = false`**. En el top, una
fila dudosa muestra una card de más; en la ficha afirmaría "Disponible en
Netflix", que es otra cosa. Por eso `Operation` (`needs_review = true`) NO
hereda nada — y no lo necesita, porque TMDB ya le informa Netflix.

**La evidencia mira los últimos 14 días, no la última semana.** Si mirara sólo
la semana más nueva, el próximo cron traería otras veinte filas, Moria dejaría
de estar y su ficha volvería sola a "No está en streaming" — una regresión con
fecha de vencimiento puesta. Es una sola consulta con `week >= <hoy - 15 días>`;
el corte sale del reloj y no de una consulta previa, así que el costo es **una
lectura por MISS** y, con el TTL de 5 minutos, **12 por hora** como techo.

Al verificar en `/titulo/tv/322428` tiene que decir **"Disponible en Netflix"**,
y **sin** botón de "Ver en": el `watchLink` sale de TMDB y sigue siendo `null`.
Eso es correcto — no se inventa un link a ningún lado.

## Disponibilidad: cómo diagnosticar "no aparece / dice que no está"

**Antes de tocar nada, medir.** Los dos comandos leen TMDB y no escriben en
ningún lado:

```bash
node scripts/medir-disponibilidad.mjs caso
```

```bash
node scripts/medir-disponibilidad.mjs muestra
```

El primero vuelca un título concreto (redes, homepage, regiones de
`watch/providers`, y si el discover por proveedor y por red lo traen). El
segundo barre la red Disney+ de los últimos 60 días y escribe
`docs/medidas/<fecha>-disponibilidad-disney.json`.

### El árbol de decisión

1. **¿`watch/providers` tiene `AR` con `flatrate`?** Si sí, no hay nada que
   investigar: eso manda y la app lo usa.
2. **¿El título está en el top oficial de Netflix de los últimos 14 días, con
   `tmdb_id` y sin `needs_review`?** Entonces debería resolverse como Netflix.
   Si no lo hace, mirar primero si la ingesta está al día:

   ```sql
   select max(week) from netflix_top10;
   ```

   ⚠️ Si esa fecha tiene más de 14 días, **la evidencia está vencida y ningún
   título la recibe**. Es lo que pasaba el 2026-08-30 (issue #14). No es un bug
   de la resolución.
3. **¿Tiene enlace oficial?** Se aplica la regla de `lib/enlace-oficial.ts`.
   **Series**: red + enlace de la misma plataforma, en las seis soportadas.
   **Películas**: sólo el enlace, en Netflix, Disney+, Prime Video y Apple TV+ —
   Max y Paramount+ no se infieren para películas.

   Lo que más sorprende al depurar: **cualquier locale se acepta** (`/br/`,
   `/es-es/`, `/ja-jp/`), porque identifica la tienda que generó el enlace y no
   dónde está disponible. Lo que se rechaza es la RUTA genérica: `/browse`,
   `/search`, la portada. Y `amazon.com/dp/` queda afuera por ser la tienda.
4. **Si nada aplica**, la salida es el registro manual
   (`lib/excepciones-disponibilidad.ts`), con vencimiento obligatorio. Es la
   última opción, no la primera.

### Cómo ver por qué decidió lo que decidió

El server loguea cada resolución que NO viene de TMDB:

```
[disponibilidad] tv:275224 -> d (oficial-probable)
```

Sin esa línea, la decisión fue `tmdb-ar` o no hubo evidencia.

### Antes de habilitar otra plataforma

**No se agrega a ojo.** Hay que verificar, con datos reales, sus ids de
`networks`, el dominio exacto que sirve sus fichas, la forma de la ruta de un
título, y qué ids de proveedor la representan en otras regiones. Hay un test que
falla si se suma una entrada sin actualizar el conteo, justamente para que la
decisión no pase de costado.
