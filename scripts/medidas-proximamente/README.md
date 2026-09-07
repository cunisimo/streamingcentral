# Medidas de Próximamente (2026-09-04)

Los scripts que produjeron `docs/medidas/2026-09-04-proximamente-diagnostico.md`.
Se corren **desde la raíz del repo**, que es donde leen `.env.local` y
`lib/providers-ar.ts`:

```bash
node scripts/medidas-proximamente/01-distribucion.mjs
```

| Script | Qué mide |
|---|---|
| `lib-datos.mjs` | helper compartido: lee la agenda vigente con sus proveedores |
| `01-distribucion.mjs` | distribución por tipo, plataforma y fecha; qué devuelve hoy `limit=100` |
| `02-composicion.mjs` | películas, premieres, episodios; animación vs Crunchyroll |
| `03-anime.mjs` | los cinco clasificadores de anime, con sus aciertos y errores |
| `04-tmdb-pelis.mjs` | preguntas 1–3 sobre películas de TMDB en AR |
| `05-anuncio.mjs` | pregunta 4: señal de streaming sin proveedor en TMDB |
| `06-repeticion.mjs` | repetición por serie y distribución de popularidad |
| `07-simulacion.mjs` | el criterio nuevo, con variantes de `K` y el detalle de entran/salen |
| `08-aislar.mjs` | aporte de cada mecanismo por separado |
| `09-tiempos.mjs` | tiempos de Supabase con y sin el join de proveedores |
| `10-prod.mjs` | tiempos de Producción, frío vs caliente (**sólo lectura**) |
| `11-bug-selector.mjs` | reproduce el bug del selector simulando el orden de efectos |

`10-prod.mjs` pega contra Producción. Son GET de lectura y nada más.
