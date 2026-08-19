"use client";
import { useCallback, useEffect, useState } from "react";
import Shelf from "./Shelf";
import ShelfSkeleton from "./ShelfSkeleton";
import { useAuth } from "./AuthContext";
import { usePlatforms } from "./PlatformsContext";
import { supabaseBrowser } from "@/lib/supabase";
import { dismissedRefs, olvidarDescarte, setItem } from "@/lib/userdata";
import { clave, encolar, seMuestra, visibles } from "./reco-descartes";
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
  // Los descartados se guardan como Set de claves y la lista visible se DERIVA.
  // Eso hace que Deshacer sea exacto sin llevar ningún índice: sacar la clave
  // del Set devuelve la tarjeta a su lugar original, porque el orden lo sigue
  // poniendo el payload del servidor.
  const [descartados, setDescartados] = useState<ReadonlySet<string>>(new Set());
  const [aviso, setAviso] = useState<{ k: string; titulo: string } | null>(null);
  const [errorDescarte, setErrorDescarte] = useState<string | null>(null);

  useEffect(() => {
    // Sin sesión no hay riel, y tampoco se lee ningún historial.
    if (!ready || !listoPlataformas || !user || !enHome.length) return;
    let vivo = true;

    (async () => {
      try {
        const sb = supabaseBrowser();
        // Solo lo reciente: acota el costo y hace que el riel se mueva cuando la
        // persona se mueve, en vez de quedar anclado a lo que votó hace meses.
        //
        // LOS DESCARTES VAN EN SU PROPIA QUERY, y no es cosmético. La de arriba
        // tiene tope 200: si los descartes compartieran ese presupuesto, cada
        // descarte nuevo empujaría al fondo un registro de Mi lista o Ya la vi,
        // que dejaría de excluirse Y de ser señal. Con presupuestos separados no
        // se pueden desplazar. Van en el mismo `Promise.all`, así que es un
        // viaje más en paralelo y no suma latencia.
        const [votos, marcados, descartes, sesion] = await Promise.all([
          sb.from("votes").select("tmdb_id, tipo, rating")
            .order("created_at", { ascending: false }).limit(40),
          sb.from("user_items").select("tmdb_id, tipo, kind")
            .in("kind", ["list", "watched"])
            .order("created_at", { ascending: false }).limit(200),
          dismissedRefs(),
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
        //
        // LOS DESCARTES NO ENTRAN ACÁ, a propósito. `excluir` forma parte de la
        // clave de cache del recomendador (ver `reco.ts`), así que mandarlos
        // significaría un cache MISS garantizado —un rearmado completo del riel—
        // por cada descarte. Se filtran abajo, en el cliente, sobre el mismo
        // payload cacheado. Como además quedamos en NO rellenar el hueco, el
        // resultado en pantalla es idéntico y el costo es cero.
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
        if (vivo) {
          setDescartados(new Set(descartes.map((d) => clave(d.tipo, d.tmdb_id))));
          setItems(j.items ?? []);
        }
      } catch {
        // Silencio a propósito: el riel es opcional. Cualquier fallo lo oculta y
        // el resto del Home sigue igual.
        if (vivo) setItems([]);
      }
    })();

    return () => { vivo = false; };
  }, [ready, listoPlataformas, user, platforms, enHome]);

  // El aviso se va solo. 7 segundos es tiempo de sobra para tocar "Deshacer" y
  // poco para que quede tapando el Home. Al irse NO se cancela nada: el descarte
  // ya se guardó, lo único que caduca es el atajo para revertirlo.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  const descartar = useCallback((t: UITitle) => {
    if (!user) return;
    const k = clave(t.type, t.id);
    // Optimista: la tarjeta se va ya. No se re-pide el riel ni se rellena el
    // hueco, así que esto no dispara NINGUNA llamada a TMDB, a Upstash ni al
    // recomendador — solo el INSERT de abajo, que va a Supabase.
    setDescartados((prev) => new Set(prev).add(k));
    setAviso({ k, titulo: t.title });
    setErrorDescarte(null);

    void encolar(k, () => setItem(user.id, "dismissed", { tmdb_id: t.id, tipo: t.type }, true))
      .then(({ error }) => {
        if (!error) return;
        // No se pudo guardar: la tarjeta vuelve y se dice por qué. Dejarla
        // escondida sería mentir — en la próxima carga reaparece igual.
        setDescartados((prev) => { const n = new Set(prev); n.delete(k); return n; });
        setAviso(null);
        setErrorDescarte("No pudimos guardarlo. Probá de nuevo.");
      });
  }, [user]);

  const deshacer = useCallback(() => {
    if (!user || !aviso) return;
    const [tipo, id] = aviso.k.split(":");
    setDescartados((prev) => { const n = new Set(prev); n.delete(aviso.k); return n; });
    setAviso(null);
    // Encolado por clave: si el INSERT del descarte sigue en vuelo, este DELETE
    // espera. Sin eso el DELETE puede correr primero, el INSERT aterriza después
    // y el título queda descartado para siempre con la tarjeta visible.
    void encolar(aviso.k, () =>
      olvidarDescarte(user.id, { tmdb_id: Number(id), tipo: tipo as UITitle["type"] }));
  }, [user, aviso]);

  // Sin sesión el riel no existe y no reserva nada: el Home de un visitante
  // anónimo queda exactamente igual que antes.
  if (!ready || !user) return null;
  // En vuelo: se reserva el alto para que al llegar no empuje el Home.
  if (items === null) return <ShelfSkeleton conToggle={false} />;

  const enPantalla = visibles(items, descartados);
  // Dos piso distintos: el de 10 lo decide lo que trajo el SERVIDOR y define si
  // el riel aparece; una vez que apareció, descartar no lo puede esconder salvo
  // que no quede ninguna. Ver `seMuestra` en ./reco-descartes.
  if (!seMuestra(items.length, enPantalla.length)) return null;

  return (
    <>
    <Shelf
      title="Elegidas para vos"
      items={enPantalla}
      onDescartar={descartar}
      // "Porque te gustó X" está EN STANDBY por decisión del dueño (17/08). El
      // riel está aprobado y mostrado; lo que no se muestra es el motivo.
      //
      // OJO: `porque` NO es código muerto y no se borra. Sigue viajando en el
      // payload porque es el ÚNICO registro de dónde salió cada recomendación, y
      // es lo que hace auditable el riel: sin él, una recomendación buena y una
      // mala se ven exactamente igual. Lo consume `scripts/medir-reco.mjs` y se
      // lee en la respuesta del POST cuando hay que revisar por qué el riel
      // trajo lo que trajo.
      // El piso de Shelf tiene que ser 1, no 10: acá ya se decidió arriba si el
      // riel se muestra. Dejarlo en 10 haría que descartar la tercera de once
      // vaciara el riel entero, que es justo lo contrario de lo que se pidió.
      minItems={1}
    />
    {aviso && (
      <div className="reco-toast" role="status">
        {/* "La sacamos de Elegidas para vos" y NO "no volveremos a mostrarte
            este título": el descarte saca el título de ESTE riel, pero el Home
            general es universal y compartido, así que puede seguir apareciendo
            ahí. Prometer lo otro sería mentir. */}
        <span>La sacamos de Elegidas para vos</span>
        <button type="button" className="reco-toast-btn" onClick={deshacer}>Deshacer</button>
      </div>
    )}
    {errorDescarte && (
      <div className="reco-toast" role="alert">
        <span>{errorDescarte}</span>
        <button type="button" className="reco-toast-btn" onClick={() => setErrorDescarte(null)}>Cerrar</button>
      </div>
    )}
    </>
  );
}
