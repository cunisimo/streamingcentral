"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Shelf from "./Shelf";
import ShelfSkeleton from "./ShelfSkeleton";
import { useAuth } from "./AuthContext";
import { usePlatforms } from "./PlatformsContext";
import { supabaseBrowser } from "@/lib/supabase";
import { allItems, allVotes, dismissedRefs, olvidarDescarte, setItem } from "@/lib/userdata";
import { armarSenales, clavesExcluidas } from "./reco-entrada";
import {
  clave, encolar, esUltimaAccion, registrarAccion, resolverAviso, seMuestra, visibles,
  type EstadoAviso,
} from "./reco-descartes";
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
  // El aviso lleva un id de ACCIÓN, no solo la clave del título. Es lo que
  // permite que una respuesta que llega tarde sepa si todavía le corresponde
  // tocar la pantalla — ver `resolverAviso`.
  const [aviso, setAviso] = useState<EstadoAviso | null>(null);
  const proximaAccion = useRef(0);
  const [errorDescarte, setErrorDescarte] = useState<string | null>(null);

  useEffect(() => {
    // Sin sesión no hay riel, y tampoco se lee ningún historial.
    if (!ready || !listoPlataformas || !user || !enHome.length) return;
    let vivo = true;

    (async () => {
      try {
        const sb = supabaseBrowser();
        // SEÑALES Y EXCLUSIONES SON DOS COSAS DISTINTAS, y las tres listas se
        // leen ENTERAS. Los recortes —40 votos, 200 marcados— existen igual,
        // pero se aplican después y en memoria, y solo a las señales (ver
        // `armarSenales`). Recortar la lectura acotaba las dos cosas por igual,
        // y con eso un título calificado hace mucho se caía de `excluir` y
        // volvía a aparecer RECOMENDADO — justo a quien más usa la app.
        //
        // LOS DESCARTES VAN EN SU PROPIA QUERY, y tampoco es cosmético: si
        // compartieran presupuesto con los marcados, cada descarte nuevo
        // empujaría al fondo un registro de Mi lista o Ya la vi.
        //
        // Las cuatro van en el mismo `Promise.all`, así que son viajes en
        // paralelo y no suman latencia. Cada una pagina sola y solo para quien
        // pase los 500 registros.
        const [votos, marcados, descartes, sesion] = await Promise.all([
          allVotes(),
          allItems(),
          dismissedRefs(),
          sb.auth.getSession(),
        ]);
        const v = votos;
        const it = marcados;
        const token = sesion.data.session?.access_token;
        if (!token) { if (vivo) setItems([]); return; }

        const senales = armarSenales(v, it);
        if (!senales.length) { if (vivo) setItems([]); return; }

        const excluir = clavesExcluidas(v, it, enHome);

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
    const id = ++proximaAccion.current;
    registrarAccion(k, id);
    // Optimista: la tarjeta se va ya. No se re-pide el riel ni se rellena el
    // hueco, así que esto no dispara NINGUNA llamada a TMDB, a Upstash ni al
    // recomendador — solo el INSERT de abajo, que va a Supabase.
    setDescartados((prev) => new Set(prev).add(k));
    setAviso({ id, k, titulo: t.title });
    setErrorDescarte(null);

    void encolar(k, () => setItem(user.id, "dismissed", { tmdb_id: t.id, tipo: t.type }, true))
      .then(({ error }) => {
        if (!error) return;
        // La tarjeta vuelve —que reaparezca es la señal honesta de que no se
        // guardó— PERO solo si este sigue siendo el último descarte de ESE
        // título. Si mientras tanto se deshizo y se volvió a descartar, el que
        // manda es el nuevo y este fallo llegó tarde: restaurar acá haría
        // reaparecer una tarjeta que la persona acaba de descartar de nuevo.
        if (!esUltimaAccion(k, id)) return;
        setDescartados((prev) => { const n = new Set(prev); n.delete(k); return n; });
        // El aviso, en cambio, solo si esta respuesta todavía manda. Si mientras
        // tanto se descartó otra tarjeta —o se deshizo esta—, la respuesta ya
        // quedó vieja y pisaría el "Deshacer" de otra acción con un error de una
        // tarjeta que ya no está.
        setAviso((actual) => {
          const { aviso: siguiente, mostrarError } = resolverAviso(actual, id, true);
          if (mostrarError) setErrorDescarte("No pudimos guardarlo. Probá de nuevo.");
          return siguiente;
        });
      });
  }, [user]);

  const deshacer = useCallback(() => {
    if (!user || !aviso) return;
    const [tipo, id] = aviso.k.split(":");
    // Deshacer también es una acción sobre ese título: reclama la clave para que
    // un fallo tardío del descarte no la dé por suya.
    registrarAccion(aviso.k, ++proximaAccion.current);
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
