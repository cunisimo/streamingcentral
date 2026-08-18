"use client";
import { useEffect, useState } from "react";
import Shelf from "./Shelf";
import { useAuth } from "./AuthContext";
import { usePlatforms } from "./PlatformsContext";
import { supabaseBrowser } from "@/lib/supabase";
import type { UITitle } from "@/lib/types";

// "Te va a gustar" — el único riel personalizado, y solo para usuarios con
// sesión. Se pide APARTE y DESPUÉS del Home: si tarda o falla, no aparece y el
// Home no se entera. Por eso no está dentro del payload del composer.
//
// Las señales las lee el CLIENTE y no el servidor. No es una vuelta larga: es
// la única forma. `votes` y `user_items` tienen RLS `auth.uid() = user_id`, así
// que el servidor con la anon key lee cero filas — y sin error, en silencio.
// Además mantiene el historial de cada uno fuera de los logs del server.

interface Reco extends UITitle {
  porque: { id: number; tipo: string; titulo: string };
  camino: "mismo" | "cruce";
  apoyos: number;
}

export default function TeVaAGustar({ enHome }: { enHome: string[] }) {
  const { user, ready } = useAuth();
  const { platforms, ready: listoPlataformas } = usePlatforms();
  const [items, setItems] = useState<Reco[] | null>(null);

  useEffect(() => {
    // Sin sesión no hay riel, y tampoco se lee ningún historial.
    if (!ready || !listoPlataformas || !user || !enHome.length) return;
    let vivo = true;

    (async () => {
      try {
        const sb = supabaseBrowser();
        // Solo lo reciente: acota el costo y hace que el riel se mueva cuando la
        // persona se mueve, en vez de quedar anclado a lo que votó hace meses.
        const [votos, items_] = await Promise.all([
          sb.from("votes").select("tmdb_id, tipo, rating")
            .order("created_at", { ascending: false }).limit(40),
          sb.from("user_items").select("tmdb_id, tipo, kind")
            .order("created_at", { ascending: false }).limit(200),
        ]);
        const v = votos.data ?? [];
        const it = items_.data ?? [];

        // Jerarquía: Petacular (3) > Ta buena (2) > Mi lista (1).
        // `Malaso` NO es fuente — un título que no te gustó no origina nada.
        const senales = [
          ...v.filter((x) => x.rating === 3).map((x) => ({ tipo: x.tipo, id: x.tmdb_id, peso: 3 })),
          ...v.filter((x) => x.rating === 2).map((x) => ({ tipo: x.tipo, id: x.tmdb_id, peso: 2 })),
          ...it.filter((x) => x.kind === "list").map((x) => ({ tipo: x.tipo, id: x.tmdb_id, peso: 1 })),
        ];
        if (!senales.length) { if (vivo) setItems([]); return; }

        // Todo lo que el usuario tocó no puede aparecer recomendado: cualquier
        // voto (incluido Malaso), Mi lista y Ya la vi. Más lo que ya se está
        // mostrando en el Home, para no repetir.
        const excluir = [
          ...v.map((x) => `${x.tipo}:${x.tmdb_id}`),
          ...it.map((x) => `${x.tipo}:${x.tmdb_id}`),
          ...enHome,
        ];

        const r = await fetch("/api/te-va-a-gustar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senales, excluir, providers: platforms }),
        });
        if (!r.ok) { if (vivo) setItems([]); return; }
        const j = await r.json();
        if (vivo) setItems(j.items ?? []);
      } catch {
        // Silencio a propósito: el riel es opcional. Cualquier fallo lo oculta y
        // el resto del Home sigue igual.
        if (vivo) setItems([]);
      }
    })();

    return () => { vivo = false; };
  }, [ready, listoPlataformas, user, platforms, enHome]);

  // Mientras no hay nada, no se reserva espacio ni se pinta un esqueleto: el
  // riel llega después del Home y aparecer de golpe abajo no mueve lo que el
  // usuario está mirando arriba. Un esqueleto acá sí lo movería.
  if (!items || items.length < 10) return null;

  return (
    <Shelf
      title="Te va a gustar"
      items={items}
      // El motivo de cada tarjeta ("Porque te gustó X") viaja en `porque`, que
      // Shelf todavía no muestra. Se agrega cuando el riel esté aprobado.
      minItems={10}
    />
  );
}
