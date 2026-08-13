# Estado de Yump

> Documento de traspaso. Se actualiza al cerrar una sesión de trabajo larga.
> **Última actualización: 13 de agosto de 2026** — HEAD `4c66459`.

`CLAUDE.md` se carga solo en cada conversación y ya contiene las decisiones de
arquitectura, las limitaciones de TMDB y las reglas de cada feature. **Este
archivo no las repite**: acá va el estado del momento y lo que queda pendiente.

---

## Qué está construido y en producción

| Feature | Qué es |
|---|---|
| **Top Yump** | Top 10 de seis plataformas en AR. Netflix con consumo real (TSV oficial, cron semanal); las otras cinco por popularidad de TMDB, etiquetadas distinto **a propósito** |
| **Ruleta** | Una recomendación por vez desde el Home. Tres escenarios por duración: `corta` (≤90 min), `larga` (>90), `chicos` |
| **Recordarme** | En Próximamente. Google Calendar desde la card; Google + `.ics` desde la ficha |
| **Filtro por década** | En el buscador, desplegable junto al de país |
| **Cache del Home** | Visita caliente de 2,9 s a 0,8 s. TTL 6 h |
| **Observabilidad** | Vercel Analytics, Speed Insights y log `HIT`/`MISS` del cache del Home |
| **PWA** | Instalable. Banner desde la primera visita |

**OMDB se sacó**: IMDb y Metacritic ya no existen en la ficha. Sus términos
prohíben construir algo con esos datos *"whether or not for profit"* y la app se
publica abierta. No hay reemplazo gratis. Quedan el puntaje Yump, el de TMDB y
el editorial.

---

## Infraestructura

- Las tres variables de Vercel están puestas y verificadas.
- El cron de Netflix **corrió de punta a punta**: `week 2026-08-09, inserted 20,
  resolved 20, review 0`.
- Cache Redis activo; con TTL de 6 h entra cómodo en el plan gratuito de Upstash.
- Vercel Hobby alcanza mientras no haya facturación.
- Manifest y service worker verificados en producción: cumple los requisitos de
  instalabilidad.

**El número a vigilar durante la prueba con usuarios** son los comandos por día
en el panel de Upstash. Es el único límite que puede cortar el servicio.

---

## Auditoría de seguridad (12/8/2026)

Cuatro frentes: rutas API, RLS y permisos, autenticación y admin, cliente y
secretos. **Una vulnerabilidad real**, corregida:

`user_reviews.estado` se podía auto-aprobar — la policy ataba la fila a
`auth.uid() = user_id` pero no decía nada sobre las columnas, y no había
trigger. Cerrado con `protect_review_estado`.

**No la encontró ninguno de los cuatro agentes leyendo el código.** Apareció al
consultar `pg_policies` contra la base viva. Auditar el repo no es auditar el
sistema.

Endurecimiento aplicado: `server-only` en `lib/tmdb.ts` y `lib/cache.ts`;
`timingSafeEqual` para el `CRON_SECRET`; `search_path` fijado en
`protect_is_admin`.

**Corpus de la ruleta cerrado**: `roulette_titles` ya no se lee con la anon key
(401). La RPC es la única vía. Limitación honesta: un scraper con estado todavía
puede caminarlo de a 40 vía la función. Es inherente a servir el dato sin login.

---

## Pipeline versionado (resuelto el 13/8/2026)

`chips/`, `prompts/`, los `scripts/*.mjs`, las tres migraciones de
`supabase/migrations/` y `docs/MANTENIMIENTO.md` están trackeados y en
`origin/main`. `001_chip_titles.sql` crea `title_availability`, así que ya no hay
objetos en producción que ningún archivo describa: **un clon limpio reproduce el
entorno.**

`data/` va **parcialmente versionado a propósito** (`.gitignore`: `data/*` con
tres excepciones). Sólo entran los tres archivos con trabajo de LLM o revisión
humana adentro:

- `data/copy-ruleta.json`
- `data/contexto-ruleta.json`
- `data/clasificado-magica-navidad.json`

El resto son intermedios y volcados SQL que cualquier corrida del pipeline
regenera. No agregarlos.

---

## Lo que falta

### 1. Verificar que el cron corre solo

El miércoles siguiente a cada martes, la semana del Top tiene que haber avanzado.

### 2. Probar en dispositivos reales

- Banner de instalación en Android, en pestaña de incógnito.
- El recordatorio, **sobre todo si suena el aviso de la víspera**: Google
  Calendar puede ignorar la alarma de un evento importado. Si eso pasa, la
  salida es poner el evento el día anterior con el texto "Mañana estrena…".
- "Ya la vi" de la ruleta logueado: son los dos criterios del spec que nunca se
  verificaron.

### 3. Idioma de los títulos

Salen en español de España (*Jungla de cristal* en vez de *Duro de matar*). La
variante que sirve es **`es-MX`**; `es-AR` y `es-419` caen al de España — está
medido. Pospuesto por decisión del dueño. Requiere versionar la clave de cache
`card:`, o conviven títulos mezclados 24 h.

### 4. Decisión menor

Si se deja el campo `motivo` en el diagnóstico del cron. Recomendación: dejarlo,
no filtra nada y ahorra tiempo de diagnóstico.

---

## Trampas que cuestan tiempo

- **`next build` con `next dev` corriendo corrompe `.next`.** Da "Cargando…"
  eterno o "Cannot find module", y no parece un problema de build. Matar el dev
  antes; después, recarga dura en el navegador.
- **Vercel a veces no detecta el push.** Se destraba con un commit vacío, no con
  Redeploy.
- **Las variables de entorno no se aplican a deployments existentes.** Hay que
  redeployar, sin build cache.

---

## Dos cosas del producto

**Sistema de votos**: malaso vale 2, ta buena 7, petacular 10; el puntaje es el
promedio. La separación es deliberada — un malaso pesa más que un petacular.
Pero **los rieles del Home ordenan por cantidad de votos, no por puntaje**.

**En iPhone no hay botón de instalar y no lo va a haber.** Safari no expone la
API. Lo máximo son instrucciones ("Compartir → Agregar a inicio"), y conviene
mandarlas por mensaje junto con el link. Además, instalar en iOS estrena el
storage: se pierden plataformas y sesión, y hay que elegirlas de nuevo.
