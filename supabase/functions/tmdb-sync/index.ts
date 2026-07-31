// Edge Function `tmdb-sync`: motor de sincronización TMDB -> Supabase.
// Genérico y extensible: despacha por `job`. Hoy implementa syncUpcoming;
// el resto son scaffolding para futuras tareas programadas.
//
// Se invoca con POST { "job": "syncUpcoming" } (o ?job=). El cron diario
// (pg_cron, ver supabase/cron.sql) le pega con el service-role como Bearer,
// que satisface verify_jwt.
import { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./lib/supabase.ts";
import { syncUpcoming } from "./jobs/sync-upcoming.ts";
import { syncProviders } from "./jobs/sync-providers.ts";
import { syncTrending } from "./jobs/sync-trending.ts";
import { syncPopular } from "./jobs/sync-popular.ts";
import { syncGenres } from "./jobs/sync-genres.ts";

const HANDLERS: Record<string, (sb: SupabaseClient) => Promise<unknown>> = {
  syncUpcoming,
  syncProviders,
  syncTrending,
  syncPopular,
  syncGenres,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const started = Date.now();

  // job: del body JSON o del query string; default syncUpcoming.
  let job = new URL(req.url).searchParams.get("job") ?? "syncUpcoming";
  const body = await req.json().catch(() => null);
  if (body && typeof body.job === "string") job = body.job;

  const handler = HANDLERS[job];
  if (!handler) return json({ error: `unknown job: ${job}` }, 400);

  try {
    const result = await handler(adminClient());
    return json({ job, ...(result as object), durationMs: Date.now() - started });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (msg.startsWith("NOT_IMPLEMENTED")) {
      return json({ job, error: "job no implementado todavía" }, 501);
    }
    return json({ job, error: msg }, 500);
  }
});
