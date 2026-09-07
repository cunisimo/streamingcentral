"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import { useMyList } from "../MyListContext";
import { usePlatforms } from "../PlatformsContext";
import PlatformLogo from "../PlatformLogo";
import { genreLabel } from "../data";
import { hasItem, setItem } from "@/lib/userdata";
import { registrarIntencion } from "@/hooks/intencion-vuelta";
import { fraseAtencion } from "./frases";
import type { RoulettePick } from "@/lib/roulette";

// La tarjeta de "¿No sabés qué ver?".
//
// ============================================================================
// LAS ACCIONES VAN ARRIBA, Y NO ES UN CAPRICHO DE MAQUETA
// ============================================================================
// Antes vivían al final, después de "Por qué esta" y del bloque "Pero". Esos dos
// son los textos más largos de la tarjeta, así que en un teléfono las acciones
// quedaban fuera de pantalla: para pedir otra recomendación había que scrollear
// un párrafo de razón que justamente se lee DESPUÉS de decidir si te interesa.
// Ahora van entre la frase y la razón, que es donde se decide.
//
// ============================================================================
// SE REUSA `.actions` / `.act` DE LA FICHA, NO UN ESTILO NUEVO
// ============================================================================
// Es la misma fila de acciones que ya tiene `DetailView`: ícono arriba, etiqueta
// abajo, repartidas a lo ancho. Los íconos del ojo y del más/tilde salen tal cual
// de `ListActions`, y el de recargar de `IndecisoHero`. Sólo se dibujaron dos
// que no existían —el documento de "Más info" y la flecha de "Atrás"—, con el
// mismo trazo de 1,8 y el mismo viewBox que el resto.

/** Recargar: el mismo de "Otras" en el hero del Home. */
const icoOtra = (
  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
  </svg>
);
/** Ojo y tilde: los mismos de `ListActions`. */
const icoOjo = (
  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const icoTilde = (
  <svg className="chk" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const icoMas = (
  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
/** NUEVO: la ficha. Una hoja con renglones, en el mismo trazo que el resto. */
const icoFicha = (
  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M15 3v4h4M9 12h6M9 16h4" />
  </svg>
);
/** NUEVO: flecha a la izquierda. El repo sólo tenía el chevron, que es otro glifo. */
const icoAtras = (
  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export default function RuletaCard({
  pick, onOtra, onAtras, puedeVolver, onCerrar,
}: {
  pick: RoulettePick;
  onOtra: () => void;
  onAtras: () => void;
  /** En la primera recomendación no hay a dónde volver, y el botón NO se dibuja. */
  puedeVolver: boolean;
  onCerrar: () => void;
}) {
  const { user } = useAuth();
  const { platforms } = usePlatforms();
  const router = useRouter();
  const lista = useMyList();
  const [visto, setVisto] = useState(false);
  const [busy, setBusy] = useState(false);
  const frase = fraseAtencion(pick.atencion, pick.id);
  const ficha = `/titulo/${pick.type}/${pick.id}`;

  // Los TRES accesos a la ficha anotan de dónde salió el usuario. Es lo que
  // permite que el "Volver" de la ficha devuelva la sesión cuando el back del
  // navegador no está disponible —una ficha recargada, por ejemplo— sin que una
  // ficha abierta desde WhatsApp resucite una sesión vieja. Ver
  // `hooks/intencion-vuelta.ts`.
  const anotarVuelta = () =>
    registrarIntencion({ origen: "ruleta", tipo: pick.type, id: pick.id, ruta: "/" });

  // 🔴 "Mi lista" SALE DEL CONTEXTO COMPARTIDO, igual que en la ficha
  // (`components/ListActions.tsx`). No es sólo reuso: es lo que hace que al
  // volver de la ficha el estado esté al día sin pedir nada. Si la tarjeta
  // tuviera su propio `useState`, guardaría el valor de antes de entrar y
  // mostraría información vieja justo en el caso que este cambio arregla.
  const enLista = lista?.has(pick.id, pick.type) ?? false;

  // `pick.platforms` son TODAS las plataformas del título en AR, en el orden
  // que las da TMDB — no filtradas por las del usuario. La RPC garantiza que
  // el título está en alguna de las suyas, pero no necesariamente la primera
  // de esa lista, así que mostrar `[0]` a secas puede pintar una plataforma
  // que el usuario no tiene (ej: sólo MovistarTV, título en Netflix + Movistar
  // → mostraba NETFLIX). Elegimos la primera que sí tenga, y sólo si ninguna
  // matchea (no debería pasar, pero por las dudas) caemos a `[0]`.
  const plataforma = pick.platforms.find((p) => platforms.includes(p)) ?? pick.platforms[0];

  // Hidrata "ya la vi" al montar, igual que components/ListActions.tsx: el
  // criterio de aceptación pide reflejo en los dos sentidos (ficha↔tarjeta),
  // no sólo tarjeta→ficha. A diferencia de ListActions, NO llamamos
  // recordView acá: pasar por la ruleta no es "visitar la ficha".
  //
  // Se re-consulta cuando cambia el pick, así que al restaurar una sesión el
  // estado sale de la base y no del snapshot: si la ficha lo marcó mientras
  // tanto, la tarjeta vuelve al día sola.
  useEffect(() => {
    if (!user) { setVisto(false); return; }
    let alive = true;
    hasItem("watched", { tmdb_id: pick.id, tipo: pick.type }).then((w) => { if (alive) setVisto(w); });
    return () => { alive = false; };
  }, [user, pick.id, pick.type]);

  // Copia exacta de toggleWatched de components/ListActions.tsx:30 — mismo dato,
  // misma acción. Es un TOGGLE de ida y vuelta: un mistap se deshace tocando de
  // nuevo, sin tener que ir a buscar la ficha. Y por eso la tarjeta NO avanza
  // sola al marcar: si avanzara, deshacer sería imposible acá.
  async function toggleVisto() {
    if (!user) { router.push("/cuenta"); return; }
    if (busy) return;
    setBusy(true);
    const next = !visto;
    setVisto(next); // optimista
    const { error } = await setItem(user.id, "watched", { tmdb_id: pick.id, tipo: pick.type }, next);
    if (error) setVisto(!next); // rollback
    setBusy(false);
  }

  // Mismo contrato que `ListActions.toggleList`: sin sesión va al ingreso, y el
  // optimismo y el rollback los pone el contexto. No se inventa otra clave ni
  // otro modelo de persistencia.
  function toggleLista() {
    if (!user) { router.push("/cuenta"); return; }
    void lista?.toggle(pick.id, pick.type);
  }

  // `pick.genres` son slugs (`accion`, `misterio-intrincado`), no texto para
  // mostrar: hay que pasarlos por `genreLabel` como hace toda la app (ver
  // components/DetailView.tsx) antes de unirlos.
  const meta = [
    pick.year, pick.runtime,
    pick.genres.length ? pick.genres.map(genreLabel).join(" / ") : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="rlt-card">
      <button className="rlt-close" onClick={onCerrar} aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>

      {/* Póster al costado del bloque de identidad, no arriba de todo: la
          tarjeta es mayormente texto (razón + advertencia) y sin una imagen
          que la ancle se lee como un paredón. */}
      <div className="rlt-head">
        {pick.poster && (
          <Link className="rlt-poster" href={ficha} onClick={anotarVuelta}>
            <img src={pick.poster} alt="" loading="lazy" />
          </Link>
        )}
        <div className="rlt-ident">
          <span className="chip-group-label">Te recomendamos</span>
          <h3 className="rlt-title">
            <Link href={ficha} onClick={anotarVuelta}>{pick.title}</Link>
          </h3>
          {meta && <p className="rlt-meta">{meta}</p>}

          {/* Sólo la plataforma. La frase se fue de acá: mezclada entre chips se
              leía como una etiqueta más, cuando es lo que más define el tono. */}
          {plataforma && (
            <div className="rlt-tags">
              <span className="rlt-tag rlt-tag-plat"><PlatformLogo code={plataforma} /></span>
            </div>
          )}
        </div>
      </div>

      {/* La frase, sola y a lo ancho. Entre comillas porque es una cita del tono
          de la película, no un dato. */}
      {frase && <p className="rlt-frase">“{frase}”</p>}

      <div className="actions rlt-actions">
        <button className="act" onClick={onOtra}>
          {icoOtra}<span className="lab">Otra</span>
        </button>

        <button className={`act ${visto ? "on" : ""}`} onClick={toggleVisto} disabled={busy}
          aria-pressed={visto} aria-label={visto ? "Quitar de ya la vi" : "Marcar como ya la vi"}>
          {visto ? icoTilde : icoOjo}<span className="lab">Ya la vi</span>
        </button>

        {/* Va a la ficha DENTRO de la app, nunca afuera. Antes decía "Verla" e
            intentaba primero el `watchLink` de TMDB, que es su página agregadora
            y no la plataforma: mandaba al usuario fuera para nada. */}
        <Link className="act" href={ficha} onClick={anotarVuelta}>
          {icoFicha}<span className="lab">Más info</span>
        </Link>

        <button className={`act ${enLista ? "on" : ""}`} onClick={toggleLista}
          aria-pressed={enLista} aria-label={enLista ? "Quitar de mi lista" : "Agregar a mi lista"}>
          {enLista ? icoTilde : icoMas}<span className="lab">Mi lista</span>
        </button>

        {/* No se dibuja en la primera recomendación: un "Atrás" deshabilitado
            en el primer uso es un control que no explica nada. */}
        {puedeVolver && (
          <button className="act" onClick={onAtras} aria-label="Ver la recomendación anterior">
            {icoAtras}<span className="lab">Atrás</span>
          </button>
        )}
      </div>

      <span className="chip-group-label">Por qué esta</span>
      <p className="rlt-razon">{pick.razon}</p>

      {/* El bloque PERO sólo existe si hay advertencia: viene NULL en ~27% de
          los casos por diseño, y preferimos que falte a inventarla. */}
      {pick.advertencia && (
        <div className="rlt-pero">
          <span className="rlt-pero-lab">⚠ Pero</span>
          <p>{pick.advertencia}</p>
        </div>
      )}
    </div>
  );
}
