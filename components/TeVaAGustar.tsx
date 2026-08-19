"use client";
import { useEffect, useState } from "react";
import Shelf from "./Shelf";
import ShelfSkeleton from "./ShelfSkeleton";
import { useAuth } from "./AuthContext";
import { usePlatforms } from "./PlatformsContext";
import { supabaseBrowser } from "@/lib/supabase";
import type { UITitle } from "@/lib/types";

// "Elegidas para vos" — el único riel personalizado, y solo para usuarios con
// sesión. Se pide APARTE y DESPUÉS del Home: si tarda o falla, no aparece y el
// Home no se entera.
//
// Las señales las lee el CLIENTE y no el servidor. No es una vuelta larga: es la
// única forma. `votes` y `user_items` tienen RLS `auth.uid() = user_id`, así que
// el servidor con la anon key lee cero filas — y sin error, en silencio. Además
// mantiene el historial de cada uno fuera de los logs del server.
//
// EL ESPACIO SE RESERVA MIENTRAS CARGA, y no es un detalle de estética. El riel
// va arriba, debajo de "6 para hoy", así que aparecer de golpe empujaría todo el
// Home hacia abajo: eso es CLS y además rompe la restauración de scroll al
// volver de una ficha (el navegador aplica el scroll guardado UNA vez, y si el
// documento todavía no creció lo recorta). Por eso mientras el riel está en
// vuelo se pinta un `ShelfSkeleton` del mismo alto.
//
// Lo que NO se puede evitar es el colapso final para quien no llega al piso de
// 10: ahí el hueco se cierra y el Home sube. Pasa una vez, solo con sesión, y la
// alternativa —dejar un hueco vacío permanente— es peor.

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
        const [votos, marcados, sesion] = await Promise.all([
          sb.from("votes").select("tmdb_id, tipo, rating")
            .order("created_at", { ascending: false }).limit(40),
          sb.from("user_items").select("tmdb_id, tipo, kind")
            .order("created_at", { ascending: false }).limit(200),
          sb.auth.getSession(),
        ]);
        const v = votos.data ?? [];
        const it = marcados.data ?? [];
        const token = sesion.data.session?.access_token;
        if (!token) { if (vivo) setItems([]); return; }

        // Jerarquía: Petacular (3) > Ta buena (2) > Mi lista (1).
        // `Malaso` NO es fuente — un título que no te gustó no origina nada.
        // Un mismo título puede aparecer en dos de estas listas (votado Y en Mi
        // lista); de eso se encarga `recomendaciones`, que deduplica por
        // `tipo:id` y conserva la señal más fuerte.
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
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  // Sin sesión el riel no existe y no reserva nada: el Home de un visitante
  // anónimo queda exactamente igual que antes.
  if (!ready || !user) return null;
  // En vuelo: se reserva el alto para que al llegar no empuje el Home.
  if (items === null) return <ShelfSkeleton conToggle={false} />;
  if (items.length < 10) return null;

  return (
    <Shelf
      title="Elegidas para vos"
      items={items}
      // El motivo de cada tarjeta ("Porque te gustó X") viaja en `porque`, que
      // Shelf todavía no muestra. Se agrega cuando el riel esté aprobado.
      minItems={10}
    />
  );
}
