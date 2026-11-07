# Incidente de Upstash del 6/11/2026: diagnóstico

Claude, 6/11/2026, sobre `origin/main` `dffd1d7`. Producción sólo en lectura: sin
cambios de plan, variables, purgas, push, merge ni deploy. Sin implementación.

Evidencia: **panel** e **informado** los aporta el dueño; **Git/GitHub**,
**Producción** y **banco** los comprobó Claude. El banco usa Redis y TMDB
simulados (`proxies.mjs`, `medir.mjs`, `medir2.mjs`, `resultados.json`).

## Cronología

| Fecha (zona) | Hecho | Fuente |
|---|---|---|
| 29/10, 17:26–21:13 UTC | Deploys `50ebc93`, `ca02c4f`, `3a58eb6`, `e8929e5` | GitHub |
| 30/10 | Reseñas encendidas (lectura de `comunidad.config`) y AAB 5 enviado | Producción / informado |
| 01/11, 00:29 y 00:32 UTC (31/10 21:29 AR) | Últimos deploys de Production: `392128e`, `dffd1d7` | GitHub |
| 01/11 | Comienzo probable del mes de cuota; **la documentación no aclara cuándo reinicia** | inferencia |
| 02–05/11, días UTC | 100.000–145.000 comandos diarios | panel |
| hasta 05/11, fecha exacta desconocida | AAB 5 publicado | informado |
| 05/11, 20:26 y 20:32 UTC | Previews `0715471` y `17e13a1` | GitHub |
| 05–06/11 | Cruce de 500.000: 400.000–580.000 sólo en 02–05/11 | panel, cuenta |
| 06/11, zona de los logs sin confirmar | `ERR max requests limit exceeded` en MGET y SET | logs |
| 06/11 | `/api/health`: `Usage: 500000` | Producción |
| 06/11, ventana de ~12 h sin horario exacto | ~15.000 invocaciones, 0 % de errores | panel |
| 06/11, hora sin registrar | Upstash Fixed 250 MB activado desde Vercel para `yumpapp`: sin regiones de lectura adicionales, Prod Pack y Auto Upgrade desactivados, comandos ilimitados en el panel | informado |
| 06/11, después del cambio | Prueba en celular: el Home volvió a cargar bien al salir de una ficha | informado |

La prueba en celular muestra que el síntoma inmediato se resolvió al recuperar Redis. **No
demuestra** que el cliente conserve el Home ni que haya dejado de llamar a `/api/home` al
volver: una nueva llamada respondida con Redis sano se vería igual. Ese recorrido se mide por
separado, en la séptima tanda. Este cambio deja sin efecto la decisión pendiente sobre Pay as
You Go y las capacidades calculadas con 500.000 comandos de la sexta tanda, que quedan como antecedente.

Sin datos de Redis para 30/10–01/11 ni para octubre.

## Medición por ruta (comandos de Redis)

| Ruta | Repetida | Fría, con plataforma AR | Fría, sin plataforma AR |
|---|---|---|---|
| Prefetch `/titulo` y `/persona` | 0 | 0 | 0 |
| `/persona` HTML y navegación | 0 | 0 | 0 |
| `/titulo` HTML o navegación | 2 | 5–7 | 12 |
| `/api/title` | 6 | 26–27 | 132 |
| `/api/title` sin AR, vencido `disp:` (5 min) | | | 35 |
| `/api/person` v2 | 2–4 | 15 | 74 |
| `/api/person` v1 | 3 | 42 | sin medir |

Controles: `/top` 0 comandos; `next build` 0 comandos y 0 TMDB.

`/api/title` fría sin AR: 67 MGET (86 claves), 64 SET, 44 TMDB. Con cuota agotada:
27 rechazos en una `/api/title` y 23 llamadas a TMDB contra 2, HTTP 200.

Sin verificar: cómo factura Upstash MGET, pipelines y scripts (la documentación
leída no lo dice). Por eso se conservan comandos y claves por separado.

⚠️ `/api/home` en frío dio 7.336 comandos con los rieles VACÍOS en el doble: **el
número no sirve** (8.b); no calibra contra los 400–700 documentados. Sí sirven el
acierto (1 comando) y que con cuota agotada responde 200 recomponiendo.

## Navegador real, banco

Con la página dibujada (en el panel oculto los prefetch no se disparan):
- ficha: 1 `/titulo`, 1 `/api/title`, 6 prefetch de `/persona`, 3 de `/titulo`;
- persona: 1 `/persona`, 1 `/api/person`, 12 prefetch de `/titulo`.

Modelo con 642 fichas y 609 personas: `/titulo` ≈ 9.876 (panel 8.900) y `/persona`
≈ 4.461 (panel 5.100). Depende del ancho de pantalla y supone clientes web.

## Cuenta, ventana de ~12 h

| Candidato | Eventos | Comandos | Total |
|---|---|---|---|
| `/api/title` | 642 | 6 / 27 / 132 | 3.900 / 17.300 / 84.700 |
| `/api/person` | 609 | 2 / 15 / 74 | 1.200 / 9.100 / 45.100 |
| `/titulo` documentos (modelo) | ~642 | 2 / 6 / 12 | 1.300 / 3.900 / 7.700 |
| `/titulo` prefetch | ~8.260 | 0 | 0 |
| `/persona` | 5.100 | 0 | 0 |
| `/api/home` | 4 | hasta ~700 | hasta 2.800 |

Suma: 6.400 repetidas, 33.100 frías con AR, 140.300 frías sin AR. Referencia del
panel, de otros días: 50.000–72.500 por 12 h. Si los 8.900 de `/titulo` fueran
documentos, sumarían 17.800–106.800: por eso hay que medir cuántos llevan `_rsc`.

## Pendiente

Usuario-agente y `_rsc` en los logs de Vercel: distingue tráfico automatizado de
personas y confirma el prefetch. El detalle de Upstash anterior al 2/11 fecha el
salto. Tráfico hacia Meta, sin relación.

## Segunda tanda (6/11): `/api/te-va-a-gustar` e historial

Banco corregido: cada caso frío corre sobre un Redis vacío y dos pasadas con ids
distintos coinciden (`medir4.mjs`, `resultados4.json`). Reemplaza los costos en frío
de arriba cuando difieren. La primera versión (`medir3`) se descartó porque sus ids
se pisaban y las dos pasadas no coincidían (8.b).

### Costo por solicitud, banco (comandos de Redis)

| Ruta | Caliente | Fría, con AR | Fría, sin AR |
|---|---|---|---|
| `/api/te-va-a-gustar` (6 orígenes, 80 candidatos) | 1 | 116 | 343–356 |
| `/api/title` | 6 | 28 | 134 |
| `/api/person` v2 | 3 | 16 | 88 |

Reco parcialmente caliente: voto nuevo 24; otras plataformas 54; otro Home (cambian
las exclusiones, que entran en la huella) 8; vencido el riel a las 6 h 8; vencidos
además `pv3`/`disp`/`oficial` a las 8 h 92. Con cuota agotada: 139 rechazos y 134
TMDB. Controles: sin sesión 0; perfil sin señales 0.

`RECO_DIVERSIDAD=0` y `RECO_CRUCE_SIN_FAMILIA=0`: 119 en frío con AR y 356 sin AR, o
sea sin aumento atribuible a la diversidad. No es idéntico al código anterior al
01/11; la clave del riel sí cambió de `v2` a `v3`.

Depende del tamaño de perfil, relacionados y filmografía simulados: es costo por
solicitud, no volumen.

### Historial disponible

| Fuente | Cubre | Resultado |
|---|---|---|
| GitHub, deployments | hasta hoy | Último Production 01/11 00:32 UTC |
| Producción, agregados de `view_history` (AR) | 09/10–06/11 | Máximo 27 fichas el 21/10; 02–05/11: 4, 6, 4, 1 con 1–3 cuentas |
| Producción, votos y listas (AR) | 12/10–06/11 | Sin salto en noviembre; 28 cuentas con señales, 50 en total |
| ESTADO | septiembre | Vercel 19K/1M invocaciones y 30 min/4 h de CPU a 30 días (18–19/09) |
| Vercel y Upstash | sin acceso | CLI sin sesión; panel sin sesión; sin credenciales de Upstash, a propósito |

`view_history` guarda sólo la última vista por título: es un piso, no un conteo.

No hay una misma ventana con datos de Vercel y de Upstash: 02–05/11 son de Upstash y
la captura de ~12 h de Vercel es del 06/11, con la cuota ya agotada o agotándose.

### Firma de precarga

Observado en el navegador real del banco: `Next-Router-Prefetch: 1`, `Next-Url`
presente, `Sec-Fetch-Dest: empty`, `_rsc` en la URL y cuerpo mínimo. La navegación
real también lleva `_rsc`, así que esa marca sola no distingue. Tamaños sin comprimir,
banco: `/titulo` 201 B contra 14.628 B; `/persona` 166 B contra 13.369 B. Producción,
`/persona/287`: 164 B contra 13.397 B. En `/titulo`, además, la precarga no hace
ninguna salida a Redis ni a TMDB.

Sin acceso al panel, no sé si Vercel expone `Next-Router-Prefetch` en sus logs. Sin
ese encabezado, la señal disponible es el tamaño de la respuesta y, en `/titulo`, la
ausencia de salidas externas.

### Causa sin demostrar

Qué tráfico sostuvo 100.000–145.000 comandos diarios del 2 al 5/11, y desde cuándo.
Único dato que permite avanzar: las invocaciones diarias de Vercel del 20/10 al 6/11.

## Tercera tanda (6/11): qué cambió alrededor del 29/10

Evidencia del dueño: Vercel, invocaciones diarias leídas de barras (zona del panel
sin confirmar): 1.000–2.000 antes del 29/10; 3.500 el 29/10; 7.000; 12.000; 18.000;
25.000 el 02/11; 30.000–33.000 del 03 al 05/11. Google Play: base instalada estable
(144, 144, 144, 138, 134, 142 del 29/10 al 03/11).

### Deploys comprobados (GitHub y Git)

| Anterior → SHA | Código de ejecución que cambia |
|---|---|
| `915ef2e` → `50ebc93` | Descartes de reco: ruta, lectura en servidor, cliente de comentarios |
| `50ebc93` → `ca02c4f` | Sólo documentación |
| `ca02c4f` → `3a58eb6` | Reseñas: rutas `/api/comunidad/*`, acordeón de la ficha, `/u` |
| `3a58eb6` → `e8929e5` | Sólo documentación |
| `e8929e5` → `392128e` | Diversidad de reco (01/11) |

Sin cambios en `app/titulo`, `app/persona`, `lib/cache.ts`, `lib/enrich.ts`,
`lib/tmdb.ts`, `next.config.mjs`, `CastRail`, `TitleCard`, `PersonCard`, `PersonView`,
ni en dependencias.

### Comparación local, mismos datos y navegación (`comparar.sh`, `medir6.mjs`, `nav.mjs`)

SHA: `915ef2e`, `ca02c4f`, `e8929e5`, `dffd1d7`. Chrome sin ventana, 412 y 1.280 px.
- Por pedido: `/titulo`, `/persona`, `/api/title` y `/api/person` dan los mismos
  comandos en los cuatro. `Cache-Control` idéntico (`private, no-store`) y modo dinámico.
- Navegación de 6 pasos: 77–78 comandos y 61 TMDB en los cuatro. Ejecuciones: 40–44
  antes; 41–45 después: la única diferencia es 1 `/api/comunidad/resenas/lista` por carga.
- Reco: fría 119 → 116; sin AR 355 → 352; caliente 1 → 1; otro Home 6 → 8.
- Reseñas encendidas: mismos conteos. Control: la ruta responde `activo:false` y
  `activo:true`, así que el interruptor sí actuó.
- `Next-Router-Prefetch`: 26–30 de 41–45 ejecuciones son precargas, con 0 comandos.
- UA de Googlebot: 0 precargas, 10 ejecuciones y los mismos 77 comandos.

Precargas: ficha 3 de `/titulo` y 4–6 de `/persona`; persona 12 de `/titulo`.

### Conclusión

No hay regresión reproducible del código. El salto corresponde a más solicitudes
(inferido: el código y su caché no cambian, y la subida sigue días sin deploy). Falta
el tráfico total del CDN para demostrarlo. Android no ejecuta `/titulo` ni `/persona`.
AAB 4 ya llamaba a `/api/te-va-a-gustar`; AAB 5 sólo cambió comentarios ahí.

Abierto: quién genera el tráfico. `yump.ar` no enlaza fichas (home y sitemap, lectura
por agente). Se descartan como origen de las precargas los bots que Next reconoce.

## Cuarta tanda (6/11, ~15:40 AR): la huella JA4 y Reflectionbot

Firewall (dueño): una JA4 con ~45.400 solicitudes del 5/11 15:15 al 6/11 15:15 AR, las
cinco IP principales en `16.216.88.`, red Google LLC, 400–600 por 15 min de madrugada y
después casi cero. Firewall Hobby no cruza JA4 con rutas.

**Comprobado (fuentes públicas):**
- No está en ninguna lista de Google (`goog`, `cloud`, `googlebot`, especiales, de usuario).
- RDAP: `16.216.88.0/23`, ReflectionAI Inc, registrado 2026-08-28. RIPEstat: anunciado por
  AS396982, Google Cloud. Por eso el panel muestra Google.
- DNS directo e inverso confirmado en 16.216.88.{1,10,50,100,200} y 16.216.89.1:
  `reflectionbot-*.reflection.ai`.
- `reflection.ai/bot/ips.json` publica `16.216.88.0/23`.
- Reflection dice que honra `robots.txt`, con cambios en cerca de un día. `app.yump.ar`
  no tiene (`404`).

**Banco:** con su usuario-agente, las precargas siguen (Next no lo reconoce como bot).

**No demostrado:** que las IP de la captura sean exactamente las verificadas (sólo se
conoce el prefijo), que esa JA4 sea sólo de Reflectionbot, que ejecute JavaScript, qué
rutas pidió y que la caída coincida con `/api/title` y `/api/person`. No hay vínculo
demostrado con Redis.

## Quinta tanda (6/11): costo de fichas y personas

Rama local `fix/costo-fichas-y-robots` (`wt-fichas`, desde `dffd1d7`, sin commit). Banco con
dobles; antes y después alternados, sin latencia y con latencia simulada.

Desglose de `/api/title` fría sin AR (134): 67 MGET (21 `pv3`, 42 `disp`, 21 `oficial`, 1
`videos`, 1 `ed`) y 66 SET (21 `pv3`, 22 `disp`, 21 `oficial`, 1 `videos`, 1 `ed`), más 1 PTTL.

Cambio: `lib/lote-proveedores.ts`, una barrera por tanda en `detail()` y en la filmografía.

| Caso, frío | Comandos | MGET | Claves | SET | TMDB |
|---|---|---|---|---|---|
| `/api/title` sin AR | 134 → 77 | 67 → 10 | 86 → 67 | 66 → 66 | 44 → 44 |
| `/api/title` con AR | 28 → 28 | 4 → 4 | 23 → 23 | 23 → 23 | 23 → 23 |
| `/api/person` v2 sin AR | 88 → 66 | 38 → 16 | 49 → 38 | 49 → 49 | 26 → 26 |
| `/api/person` v2 con AR | 16 → 16 | 2 → 2 | 13 → 13 | 13 → 13 | 14 → 14 |
| `/api/person` v1 sin AR | 284 → 206 | 122 → 44 | 161 → 122 | 161 → 161 | 82 → 82 |
| `/api/person` items sin AR | 170 → 124 | 73 → 27 | 96 → 73 | 96 → 96 | 48 → 48 |

Caliente, sin cambios: 5–8 y 3–4. A los 5 min, 34 → 34. Reduce sólo MGET: si Upstash cobra
un MGET por clave, el ahorro baja de 57 a 19 en `/api/title` sin AR (sin verificar).

Respuestas (`verificar.mjs`, JSON canónico): 26 de 26 iguales, incluidos 429 parcial y cuota
agotada. El 500 de `/api/person` con 429 parcial ya existía. `npm test` y `tsc`: ver la entrega.

`robots.txt`: `public/robots.txt`; local 200, `text/plain`, `User-agent: Reflectionbot` y
`Disallow: /`.

Firewall: regla preparada y SIN publicar. Con el volumen observado no se dispararía.

## Sexta tanda (6/11): Redis por etapa, ahorro posible y capacidad

Sólo banco local con dobles, sin credenciales productivas (`etapas.sh`, `etapas2.sh`, `exp.mjs`,
`lento.mjs`, `cuota.mjs`; datos en `etapas-*.json`, `etapas2-*.json`, `lento-*.json`). Producción
y plan sin tocar. Las variantes son banderas de una copia descartable, ya borrada: `exp.mjs` la
reconstruye. **Nada de esto está aplicado en la rama.** Corrige lo anotado en la quinta tanda: el
ahorro de MGET es real, porque Upstash lo factura como un comando.

**Facturación (documentación de Upstash):** 1 comando = 1 solicitud facturable; MGET cuenta como 1
con cualquier cantidad de claves; dentro de un pipeline o transacción cada comando se cobra aparte,
y MULTI y EXEC también; Lua 1 + 1 por `redis.call`; en Global, cada escritura se cobra además por
región de lectura. Sin verificar: regiones de la base (panel). Agrupar SET no ahorra cuota, y MSET
no sirve porque no lleva TTL.

Medida: documento + API, 20 relacionados (el código acepta hasta 24), latencia simulada TMDB 40/120
y Redis 10/30 ms. `con AR` y `sin AR` llevan TODOS sus relacionados en la misma condición: son los
extremos. Las celdas son `claves leídas únicas/repetidas · SET únicos/repetidos · TMDB`.

### Ficha: todo corre al abrir, no tiene «Ver más»

| Etapa | Sin AR, 1.ª | Sin AR, 2.ª | Sin AR, 5 simultáneas | Con AR, 1.ª | Con AR, 2.ª | Con AR, 5 simultáneas |
|---|---|---|---|---|---|---|
| `titleDetails` (sin Redis) | TMDB 2 | TMDB 1 | TMDB 10 | TMDB 2 | TMDB 1 | TMDB 10 |
| Proveedores `pv3:` principal | 1/1 · 1/0 · 1 | 1/0 · 0 · 0 | 1/9 · 1/3 · 4 | 1/1 · 1/0 · 1 | 1/0 · 0 · 0 | 1/9 · 1/4 · 5 |
| Proveedores `pv3:` relacionados | 20/0 · 20/0 · 20 | 20/0 · 0 · 0 | 20/80 · 20/29 · 49 | 20/0 · 20/0 · 20 | 20/0 · 0 · 0 | 20/80 · 20/60 · 80 |
| `disp:` principal | 1/1 · 1/0 · 0 | 1/0 · 0 · 0 | 1/9 · 1/4 · 0 | no corre | no corre | no corre |
| `disp:` relacionados | 20/0 · 20/0 · 0 | 20/0 · 0 · 0 | 20/80 · 20/79 · 0 | no corre | no corre | no corre |
| `disp:top-manual` | 1/1 · 1/0 · 0 | no se lee | 1/9 · 1/2 · 0 | no corre | no corre | no corre |
| `oficial:` principal | 1/0 · 1/0 · 1 | no se lee | 1/4 · 1/3 · 4 | no corre | no corre | no corre |
| `oficial:` relacionados | 20/0 · 20/0 · 20 | no se lee | 20/79 · 20/47 · 67 | no corre | no corre | no corre |
| Tráiler `videos:` | 1/0 · 1/0 · 1 | 1/0 · 0 · 0 | 1/4 · 1/1 · 2 | 1/0 · 1/0 · 1 | 1/0 · 0 · 0 | 1/4 · 1/3 · 4 |
| `card:` (documento) | 1/0 · 1/0 · 0 | 1/0 · 0 · 0 | 1/4 · 1/4 · 0 | 1/0 · 1/0 · 0 | 1/0 · 0 · 0 | 1/4 · 1/4 · 0 |
| `ed:` | 1/1 · 1/0 · 0 | 1/1 · 0 · 0 | 1/9 · 1/4 · 0 | 1/1 · 1/0 · 0 | 1/1 · 0 · 0 | 1/9 · 1/3 · 0 |
| **Comandos, rama** | **83** | **9** | **339–393** (mediana 341) | **32** | **7** | **129–153** (mediana 138) |
| Comandos, producción | 140 | 9 | 334–593 (mediana 446) | 32 | 7 | 134–154 (mediana 147) |

Tres procesos, caché fría (rama): sin AR 199, con AR 46. El detalle de 5 simultáneas es de una corrida;
los rangos, de 5.

### Persona: 12 al abrir, 24 por «Ver más»

| Etapa | Sin AR, abrir 1.ª | Sin AR, abrir 2.ª | Sin AR, 5 simultáneas | Con AR, abrir 1.ª | Con AR, abrir 2.ª | Con AR, 5 simultáneas | «Ver más» sin AR | «Ver más» con AR |
|---|---|---|---|---|---|---|---|---|
| Filmografía (sin Redis) | TMDB 2 | TMDB 2 | TMDB 10 | TMDB 2 | TMDB 2 | TMDB 10 | no corre | no corre |
| `pv3:` | 12/0 · 12/0 · 12 | 12/0 · 0 · 0 | 12/48 · 12/24 · 36 | 12/0 · 12/0 · 12 | 12/0 · 0 · 0 | 12/48 · 12/48 · 60 | 24/0 · 20/0 · 20 | 24/0 · 20/0 · 20 |
| `disp:` | 12/0 · 12/0 · 0 | 12/0 · 0 · 0 | 12/48 · 12/48 · 0 | no corre | no corre | no corre | 24/0 · 20/0 · 0 | no corre |
| `disp:top-manual` | 1/0 · **1/11** · 0 | no se lee | 1/4 · **1/47** · 0 | no corre | no corre | no corre | 1/0 · 0 · 0 | no corre |
| `oficial:` | 12/0 · 12/0 · 12 | no se lee | 12/48 · 12/47 · 59 | no corre | no corre | no corre | 20/0 · 20/0 · 20 | no corre |
| `ed:` | 1/0 · 1/0 · 0 | 1/0 · 0 · 0 | 1/4 · 1/4 · 0 | 1/0 · 1/0 · 0 | 1/0 · 0 · 0 | 1/4 · 1/3 · 0 | no corre | no corre |
| **Comandos, rama** | **66** | **4** | **212–325** (mediana 267) | **16** | **3** | 75 (1 corrida) | **64** | **21** |
| Comandos, producción | 79–87 | 4 | 372–411 (mediana 387) | 16 | 3 | 76 (1 corrida) | 122 | 21 |

Tres procesos, caché fría (rama): sin AR 190, con AR 47. En el bloque medido de «Ver más», 4 de 24 obras ya
estaban en caché; con 24 frías se estiman ~76 comandos sin AR y ~25 con AR (no medido). «Ver más»
repetido: 2 comandos, 0 TMDB.

### Las 66 escrituras de `/api/title` y `disp:top-manual`

En una visita sola no hay ninguna clave repetida. 66 = 21 `pv3` + 21 `oficial` + 21 `disp` por título
+ 1 `disp:top-manual` + 1 `videos` + 1 `ed` (67 con `card:`, del documento).

| Escrituras | Clase | Por qué |
|---|---|---|
| 21 `pv3`, 21 `oficial` | Necesarias | Guardan respuestas de TMDB durante 8 h y las comparten otras superficies |
| 1 `videos`, 1 `ed`, 1 `card`, 1 `top-manual` | Necesarias | Una clave por dato |
| 21 `disp` | Evitables | Copia derivada de las otras tres; 0 TMDB. Sólo ahorra lecturas durante 5 min |
| 11 `top-manual` en persona fría | Duplicadas | Sin lectura en vuelo compartida. La ficha no lo sufre: el principal la calienta antes |
| Repetidas con simultáneas | Duplicadas | Carrera en frío; hasta 202 de 269 SET en ficha sin AR |

`disp:top-manual` repetida además dispersa las lecturas de `oficial:`: en la apertura de persona la barrera
no las agrupa (12 MGET en vez de 1). Título sin tráiler: `null` se trata como ausente, y cada visita
reescribe `videos:` (+1 SET, +1 TMDB).

### Variantes: mismos JSON canónicos en todos los casos

| Caso | Producción | Rama | Sin `disp:` por título | Lectura compartida de `top-manual` | Las dos |
|---|---|---|---|---|---|
| Ficha sin AR, fría | 140 | 83 | 60 | 82–83 | 60–61 |
| Ficha sin AR, 5 min vencidos | 36 | 36 | 13 | 36 | 13 |
| Ficha sin AR, caliente | 9 | 9 | 11 | 9 | 11 |
| Persona sin AR, fría | 79–87 | 66 | 53 | 44 | 31 |
| Persona sin AR, 5 min vencidos | 42 | 42 | 29 | 20 | 7 |
| Persona sin AR, caliente | 4 | 4 | 5 | 4 | 5 |
| «Ver más» sin AR, fresco | 122 | 64 | 43 | 64 | 43 (`todas`) |
| «Ver más» sin AR, 5 min vencidos | 150 | 116 | 91 | 70 | 45 |
| Ficha sin AR, 5 simultáneas (mediana) | 446 | 341 | 224 | 332 | 236 |
| Persona sin AR, 5 simultáneas (mediana) | 387 | 267 | 203 | 204 | 127 |

Con AR no cambia en ninguna variante. Otras medidas: centinela de `videos:` sin tráiler 8 → 7 y 10 → 9
(el formato nuevo necesita versión de clave: si no, un rollback lee `-` como tráiler). Lectura en vuelo en `cached()`, una
corrida: 5 simultáneas en un proceso, sin AR 314 → 184 y con AR 134 → 40; con 3 procesos no ahorra (199
→ 224, dentro del ruido). Sin medir: efecto de sacar `disp:` en el armado del Home, búsqueda y listas.

### Barrera con un proveedor lento (mediana de 3, `/api`, frío)

| Caso | Producción | Rama | Diferencia |
|---|---|---|---|
| Ficha sin AR, sin lentos | 982 ms | 1082 ms | +100 |
| Ficha sin AR, 1 proveedor +3 s | 3782 ms | 3983 ms | +201 |
| Ficha con AR, 1 proveedor +3 s | 3466 ms | 3454 ms | −12 |
| Persona sin AR, sin lentos | 703 ms | 488 ms | −215 |
| Persona sin AR, 1 proveedor +3 s | 3411 ms | 3549 ms | +138 |
| Ficha sin AR, proveedor colgado | 8594 ms | 8988 ms | +394 |
| Persona sin AR, proveedor colgado | 8155 ms | 8517 ms | +362 |

La respuesta es un solo JSON y ya esperaba al más lento. La barrera demora el resto de la tanda dentro del
servidor, y al final agrega entre 140 y 400 ms; con esta muestra el ruido llega a ±200 ms. Colgado: corte a los 8 s,
un solo pedido, mismo resultado parcial en ambas (`relacionados: 1` o 1 obra sin disponibilidad).

### Capacidad del plan, estimación

Visitas por día = presupuesto / (c × fría + (1 − c) × tibia). Presupuesto: 16.667 comandos por día
menos una reserva supuesta del 30 % (11.667). `tibia` = caché de 8 h viva y 5 min vencidos. Fichas con
la reserva del 30 %; con 50 %, multiplicar por 0,71.

| Caché fría | Con AR (todas las variantes) | Sin AR: producción / rama / sin `disp:` | Mezcla 70/30: producción / rama / sin `disp:` |
|---|---|---|---|
| 100 % | 365 | 83 / 141 / 194 | 181 / 247 / 289 |
| 50 % | 583 | 133 / 196 / 320 | 289 / 366 / 468 |
| 20 % | 911 | 205 / 257 / 521 | 449 / 517 / 744 |
| 10 % | 1.122 | 251 / 287 / 659 | 550 / 599 / 927 |
| 5 % | 1.268 | 283 / 304 / 760 | 621 / 650 / 1.056 |

Supuestos sin medir: mezcla 70/30, reserva, una sola región, 20 relacionados, todos del mismo tipo que el principal, frío
total, y sólo fichas. La reserva cubre unas 2–3 combinaciones de Home (4 rearmados diarios de 400–700). Android no pide
el documento y gasta algo menos. No extrapola el historial: el panel marcó 100.000–145.000 diarios,
6–9 veces el presupuesto total.

### Prioridad

1. Sacar la copia `disp:` por título (`disponibilidadDe`, `lib/enrich.ts:180`): `-23` en ficha sin AR fría y
   tibia. Antes de aplicarla, medir Home, búsqueda y listas.
2. Lectura compartida de `disp:top-manual` (`lib/top-manual.ts`): `-22` en persona sin AR fría y tibia, nada en ficha.
3. Centinela de `videos:`: `-1` SET y `-1` TMDB por visita sin tráiler; requiere versión de clave.

No conviene: agrupar SET, lectura en vuelo en `cached()` como defensa entre instancias, reducir relacionados.

## Séptima tanda (6–7/11): cada cambio por separado y código final

Claude, banco local con dobles. TMDB 40/120 ms, Supabase 20/60 y Redis 10/30 (mediana/P95),
`YUMP_FECHA=2026-11-06` e `IDIOMA_TITULOS=es-MX`. Sin credenciales productivas y sin tocar
Producción. **Producción** = build de `dffd1d7`. `main` (`035de15`) no toca rutas de API,
`lib/enrich.ts` ni `lib/claves.ts`, así que para Redis equivale a lo desplegado. **Final** = rama
`fix/costo-fichas-y-robots`, sin commit. Scripts en `scripts-septima-tanda/`, resultados en
`resultados-septima-tanda/` y parches en `parches/`.

**Esta tanda reemplaza lo dicho sobre la barrera y sobre quitar `disp:` en las tandas quinta y
sexta.** La barrera quedó fuera del árbol, igual que la eliminación de `disp:` por título. La
capacidad calculada con 500.000 comandos ya era antecedente (plan Fixed).

**Regla para hablar de demora consistente**, fijada antes de ver los datos: diferencia pareada de
medianas con IC 95 % por bootstrap que excluya 0, que no aparezca en el control A/A (la misma
versión en otro puerto) y que sea relevante (≥ 50 ms y ≥ 5 %).

### Qué quedó en el árbol

| Cambio | Decisión | Motivo |
|---|---|---|
| Lectura compartida de `disp:top-manual`, por tanda (persona, «Ver más» y relacionados de la ficha) | **Aplicada** | Baja Redis y Supabase sin demora consistente, mismo contenido |
| Barrera de proveedores | **Fuera**: `parches/descartada-barrera-sobre-dffd1d7.patch` | +230 a +440 ms consistentes con un proveedor lento o colgado |
| Quitar `disp:` por título (conserva `disp:top-manual`) | **Fuera, a decisión del dueño**: `parches/opcional-sin-disp-por-titulo.patch` | +30 a +100 ms consistentes con caché caliente |
| `public/robots.txt` | **Aplicado** | 200, `text/plain; charset=UTF-8`, bytes `User-agent: Reflectionbot\nDisallow: /\n` |

La lectura compartida se aplicó también a los relacionados de la ficha. Se pidió para persona y
«Ver más»; se midió aparte y se dejó porque cumple las mismas condiciones.

### Costo por flujo: producción → final

Formato: comandos (MGET / SET / claves / lote máx. / TMDB / Supabase). Se muestran los casos que
cambian. Cambian 38 de 104; los 66 restantes dan el mismo número de comandos.

| Flujo | Producción | Final |
|---|---|---|
| Ficha sin AR, fría | 140 (71/67/90/20/45/3) | 113 (45/67/71/20/45/3) |
| Ficha sin AR ni tráiler, fría | 140 (71/67/90/20/45/3) | 107 (38/67/71/20/45/3) |
| Ficha serie sin AR, fría | 139 | 110 |
| Ficha mezclada, fría / vencida | 90 / 40 (Supabase 10 / 12) | 65 / 22 (Supabase 3 / 3) |
| Ficha con AR, cualquier estado | 32 / 7 / 8 | igual |
| Fichas en caliente | 7–10 | igual |
| Persona sin AR, fría / vencida | 86 / 42 (Supabase 12 / 14) | 57 / 20 (Supabase 3 / 3) |
| «Ver más» sin AR, fresco (1.º / 2.º) | 146 / 146 | 101 / 111 |
| «Ver más» sin AR, 5 min vencidos | 167 (Supabase 21) | 102 (Supabase 1) |
| «Ver más» mezclado, fresco / vencido | 120 / 122 | 77 / 77 |
| Persona v1 sin AR, fría / vencida | 279 / 125 | 168 / 47 |
| Persona con AR | 16 / 3 / 4 | igual |
| Búsqueda, listas, categoría, audiencia, Mi lista | 43–178 en frío | igual o −1/−2 |
| Home fría / caliente / vencida | 1924 / 1 / 452 | 1925 / 1 / 452 |
| Fallo de proveedores en relacionados | 127 | 95 |
| Fallo de proveedores en persona | 68 | 47 |
| 429 parcial en ficha | 94 | 60 |
| Base del Top caída, ficha sin AR fría | 140 (Supabase 86) | 102 (Supabase 10) |

TMDB: 4087 llamadas en las dos versiones, caso por caso. El ahorro de Redis no se traslada a TMDB
ni a otra pantalla. Lo que baja son los MGET y los SET duplicados de la misma clave, además de las
lecturas a Supabase de `top_rankings`.

### Contenido

- **API:** 104 casos con JSON canónico, incluidos el fallo parcial de TMDB, el 429 parcial, la caída
  de la base del Top y su publicación. 0 diferencias contra producción en las dos instancias de la
  versión final.
- **Navegador** (Chrome sin interfaz, 412×900, `nav-final.mjs`): 35 pasos, mismo hash en todos y
  0 excepciones. Cubre Home → ficha → volver ×2, fichas con y sin AR, mezclada, serie y sin
  tráiler en fría, caliente y vencida, fallo parcial y recuperación, persona con y sin AR con dos
  «Ver más» (12 → 36 → 60 obras), últimos, miniseries, categoría y búsqueda. Tráiler presente
  salvo en «sin tráiler».
- **Enlaces de plataforma:** la disponibilidad de la ficha no es un enlace a propósito
  (`components/DetailView.tsx`). Se compararon `watchLink` y `links` en las respuestas de API.
- **Pendiente en Android:** todo lo anterior en un dispositivo real. El bundle es local y llama a
  las mismas API.

### Recorrido Home → ficha → volver (resultado aparte)

En las dos versiones, cada vuelta al Home hace **1 llamada a `/api/home`**: 1 comando de Redis en
caliente, 0 de TMDB, scroll restaurado a 1400 y 130 tarjetas. El cliente **no conserva** el Home:
lo vuelve a pedir. La prueba del dueño en el celular es compatible con esto, porque con Redis sano
esa llamada cuesta un GET. No se cambió nada en este punto.

### Latencia (mediana pareada, ms; IC 95 %)

Producción contra final, con dos instancias del final (A y B) y control A/A:

| Flujo | Producción | Final A / B | Diferencia A / B | ¿Consistente? |
|---|---|---|---|---|
| Ficha sin AR fría (n=40) | 1079 | 1064 / 1042 | −11 (−77…43) / −53 (−87…−18) | No (más rápida o igual) |
| Ficha sin AR caliente (n=40) | 310 | 315 / 320 | −11 / −2 | No |
| Ficha mezclada fría / caliente / vencida (n=25) | 754 / 276 / 501 | 785 / 300 / 503 | +6 / 0 / +2 | No |
| Persona sin AR fría, repetición (n=80) | 500 | 510 / 518 | +23 (0…66) / +34 (15…51) | No: ≈ 5 % y < 50 ms. A/A de producción +15 (−4…33) |
| Persona sin AR fría, TMDB lento (n=60) | 671 | 722 / 685 | +10 / +9 | No |
| «Ver más» sin AR fría (n=80) | 416 | 418 / 401 | −1 / −9 | No |
| Búsqueda, listas, categoría, Mi lista | — | — | entre −88 y +48, sin repetirse en A y B | No |
| Home fría / vencida (n=5) | 11068 / 6715 | 11150 / 6519 | +82 / −138 | No (IC amplio) |
| Proveedor +3 s, ficha / persona sin AR (n=20) | 3971 / 3402 | 3934 / 3385 | −45 / −34 | No |
| Proveedor colgado, ficha / persona (n=12) | 8661 / 8144 | 8653 / 8154 | +17 / +18 | No |
| Base del Top caída, ficha sin AR (n=8) | 15245 | 15049 / 15037 | −175 / −224 | Más rápida |

La primera corrida de persona en frío dio +34/+15 con carga normal y +63/+82 con TMDB lento. Por
eso se repitió con controles A/A de las dos versiones. Queda un posible costo de 20–35 ms en
persona en frío, sin causa identificada y por debajo del umbral. En Producción conviene mirarlo con
la latencia real de `/api/person`.

### Simultáneos al mismo título, caché fría (5 repeticiones; comandos, rango y ms)

| Caso | Modo | Producción | Final |
|---|---|---|---|
| Ficha sin AR | 5 en un proceso | 524 (511–607), 1305 ms | 386 (362–451), 1211 ms |
| Ficha sin AR | 6 en 3 instancias | 535 (401–620), 1174 ms | 431 (408–522), 1118 ms |
| Ficha mezclada | 5 / 6 | 388 / 399 | 271 / 310 |
| Persona sin AR | 5 / 6 | 376 / 452 | 248 / 260 |
| Ficha y persona con AR | 5 / 6 | 129 / 145 y 76 / 86 | 122 / 150 y 76 / 88 |

Mismo hash en todas las respuestas. La estampida sigue: no hay lectura en vuelo entre
solicitudes, y las 3 «instancias» son procesos reales en la misma máquina, no Vercel.
**Escalonado** (24 obras de «Ver más», cada proveedor vuelve en otro momento entre 60 y 1440 ms):
148 → 124 comandos, 1739 → 1729 ms.

### Barrera de proveedores: por qué quedó fuera

Mismo banco, con la barrera sobre la base de la rama y sin ella. Diferencia contra producción;
entre paréntesis, el IC y cuántas rondas salieron más lentas. A/A máximo de 18–46 ms, cruzando 0.

| Caso | Producción | Con barrera | Diferencia |
|---|---|---|---|
| Ficha sin AR fría, normal (n=40) | 2057 (RIC 1700–2262) | 1678 | −379 (−658…−144), más rápida |
| Ficha sin AR, proveedor +3 s (n=20) | 3936 | 4206 (RIC 4090–4320) | +234 (146…316), 19/20; control +272 |
| Persona sin AR, proveedor +3 s (n=20) | 3483 | 3685 | +267 (207…306), 20/20; control +249 |
| Ficha sin AR, colgado (n=12) | 8648 | 9098 | +406 (291…539), 12/12; control +442 |
| Persona sin AR, colgado (n=12) | 8159 | 8552 | +403 (365…442); control +442 |
| Con AR o mezclada, lento | — | — | sin diferencia |

La etapa posterior a los proveedores de todos los títulos espera al más lento. Empeora de forma
consistente justo en el caso que preocupaba, y su ahorro propio es chico una vez aplicada la
lectura compartida: hasta ~22 comandos por 24 títulos, sólo en `pv3:` frío y con TMDB realmente
disperso. Se deja como parche. Una versión con plazo acotado sería otra propuesta.

### Quitar `disp:` por título: por qué quedó fuera

Agrega 2 MGET secuenciales en caliente (8 → 10 MGET, 9 → 11 comandos por ficha sin AR). Contra
producción, en caliente: ficha sin AR +100 (71…124, 23/25; control +88), categoría +66, persona
+35 / +41 y «Ver más» +32 / +33. Búsqueda +4–6. Falla la regla.

Lo que se resigna:

| Flujo | Sin `disp:` frente a producción |
|---|---|
| Ficha sin AR fría | −112 a −168 ms; comandos 140 → 61 |
| Ficha sin AR con 5 min vencidos | −136 a −152 ms; 36 → 13 |
| Home fría / vencida | ≈ −1,4 s / ≈ −2,1 a −2,3 s; 1930 → 1573 comandos |
| «Ver más» con 5 min vencidos | 286 → 170 ms |

También evita que un fallo de Supabase quede congelado 5 min en `disp:`. Conviene o no según la
proporción real de visitas en caliente y el RTT real de Redis en Producción: +2 comandos y
~+100 ms por visita caliente, contra −23 comandos y ~−150 ms por ventana vencida. El banco no
puede decidirlo. **Decisión del dueño.**

### Firewall: propuesta, sin publicar

Una sola regla de rate limit de Vercel, en **modo Log**, limitada a las dos API de fichas:

| Campo | Valor |
|---|---|
| Nombre | `Rate limit APIs de fichas` |
| Si | `Request Path` empieza con `/api/title/` **OR** `Request Path` empieza con `/api/person/` |
| Acción | Rate Limit, Fixed Window |
| Ventana | 60 s |
| Límite | 30 solicitudes |
| Clave | IP |
| Entonces | **Log** |

Con el volumen observado (picos de 400–600 por 15 min repartidos entre 5 IP, unas 8 por minuto y
por IP) no se dispararía. Sirve para ver quién supera ese ritmo antes de decidir un 429. Sin
confirmar en la documentación: el operador «empieza con» y si el contador se comparte entre los dos
prefijos (se dimensionó suponiendo uno solo por IP). No se publicó ni se activó el 429.

### Medido localmente y pendiente en Producción

- **Local:** costos, contenido, navegador, simultáneos en un proceso y en 3 procesos, latencias
  con dobles y `robots.txt`.
- **Sólo en Producción:** latencia real de Redis (decide el costo en caliente de quitar `disp:`),
  dispersión real de TMDB, proporción de visitas en caliente, instancias reales de Vercel, límites
  de Fixed que no sean comandos (no los verificó Claude), si Reflectionbot respeta `robots.txt`
  (dice que en ~1 día) y la regla Log con tráfico real.
- **Android, pendiente en dispositivo real:** Home → ficha → Atrás (vuelve al Home con su
  posición; hoy pide 1 vez `/api/home`) y Persona → «Ver más» (12 → 36 → 60 obras, disponibilidad
  y orden). Procedimiento abajo.

### Prueba en Android

El cambio es **sólo de servidor**: el bundle Android no cambia. Hay dos caminos.

**A. Antes del deploy, contra una Preview de esta rama.**
1. Push de la rama (decisión del dueño): Vercel crea una Preview. Producción no cambia.
2. En el panel de Vercel, comprobar que la Preview tiene las variables de entorno del entorno
   Preview (TMDB, Supabase y Upstash). Si comparte el Redis de Producción, escribe en las mismas
   claves con el mismo formato: es inocuo, pero suma comandos.
3. Comprobar que la Preview responde **sin login de Vercel**. Abrir en el navegador del teléfono,
   sin sesión, `https://<preview>/robots.txt` y `https://<preview>/api/title/movie/550`. Si pide
   login, la app recibe 401 y no sirve para la prueba. Desactivar la protección de esa Preview es
   decisión del dueño.
4. Compilar la cáscara apuntando a la Preview, **sin** `--release`, que sólo acepta
   `app.yump.ar`:
   `node scripts/build-capacitor.mjs --api-base=https://<preview>.vercel.app`, después
   `npx cap sync android` y `cd android && ./gradlew assembleDebug` (JBR de Android Studio).
5. Instalar `android/app/build/outputs/apk/debug/app-debug.apk` con `adb install -r`. El build
   de depuración usa el mismo `applicationId` (`ar.yump.app`) con otra firma: **hay que
   desinstalar la versión de Play** y se pierden las plataformas y la sesión del teléfono. Al
   terminar, desinstalar el APK y reinstalar desde Play.
6. No mezclar ese paquete con una release: `verificarBaseDeApi` rechaza `vercel.app`, y la
   cáscara se reconstruye con `--release --api-base=https://app.yump.ar` antes de cualquier AAB.

**B. Después del deploy, con el AAB 5 de Play.** Sin compilar nada: la app ya llama a
`app.yump.ar`.

**Recorridos** (con plataformas elegidas, conexión normal; repetir una vez con datos móviles):
1. **Home → ficha → Atrás**: abrir el Home y bajar hasta un riel del medio. Tocar una tarjeta,
   esperar la ficha (tráiler, disponibilidad y relacionados) y volver con el botón o el gesto
   Atrás. Esperado: el Home vuelve **con la misma posición**, sin pantalla en blanco ni salto
   arriba. Repetir dos veces seguidas y una con una ficha **sin plataforma argentina**.
2. **Persona → «Ver más»**: desde una ficha, abrir una persona con muchas obras (un actor
   conocido). Esperado: 12 obras al abrir, 36 con el primer «Ver más» y 60 con el segundo, sin
   duplicados ni huecos. Las obras disponibles en tus plataformas aparecen en color, en el mismo
   orden que en la web. Tocar una obra y volver: la persona conserva lo cargado y la posición.
3. Anotar cualquier diferencia contra la web en la misma Preview o en Producción, con hora, título
   y captura.

### Antes de integrar

La versión final ya está sobre `main` `035de15` (AAB 5, PR #1, `17e13a1`): la rama
`fix/costo-fichas-y-robots` avanzó por fast-forward y tiene dos commits locales, sin push: el
código (`37e3d06`) y esta documentación. Los bloques en
conflicto de `docs/ESTADO.md` se resolvieron conservando todo lo de `main`. Controles sobre el diff
final: ver `docs/ESTADO.md`. `public/robots.txt` queda con LF; con `git apply` en Windows puede
quedar con CRLF en la copia de trabajo.
