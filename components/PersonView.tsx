"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { consumirVuelta, decidirRestauracionVista, guardarVista } from "@/hooks/lista-paginada-store";
import { contextoDe, snapshotVigente } from "@/hooks/restauracion-vigente";
import type { PlatformCode, UITitle, UIPerson } from "@/lib/types";

type Seccion = "direccion" | "actuacion";
interface Filmografia {
  person: UIPerson;
  /** Qué secciones mostrar y en qué orden (las vacías no vienen). */
  secciones?: Seccion[];
  direccion?: UITitle[];
  actuacion?: UITitle[];
  /** Forma vieja (sólo lo disponible). La usa esta vista si el servidor todavía no trae secciones. */
  titles: UITitle[];
  hidden: number;
}
type Visibles = Record<Seccion, number>;

const ROTULO: Record<Seccion, string> = { direccion: "Dirección", actuacion: "Actuación" };
// Cuántas cards se pintan por sección antes de "Ver más". La filmografía llega
// COMPLETA en una llamada (una carrera larga son cientos de obras): esto sólo
// decide cuántos pósters se descargan de entrada.
const PAGINA = 24;
const INICIALES: Visibles = { direccion: PAGINA, actuacion: PAGINA };
// UNA entrada para todas las personas (la firma lleva el id): con una por
// persona, el snapshot —que se reescribe entero en cada guardado— crecería con
// cada ficha visitada en la sesión.
const CLAVE = "persona";

export default function PersonView({ id }: { id: string }) {
  const { platforms } = usePlatforms();
  const firma = `${id}|${platforms.join(",")}`;

  // Volver de una ficha devuelve la vista: datos, cuántas se veían por sección
  // y el scroll. Mismo mecanismo que ListaView: la decisión va ANTES del fetch,
  // así al volver no se pide nada.
  const [restaurado, setRestaurado] = useState<Filmografia | null>(null);
  const [visibles, setVisibles] = useState<Visibles>(INICIALES);
  const [decidido, setDecidido] = useState(false);
  const pendiente = useRef<number | null>(null);
  const [ctxRestaurado, setCtxRestaurado] = useState<string | null>(null);
  const ctxActual = contextoDe([firma]);
  useEffect(() => {
    const e = decidirRestauracionVista<Filmografia, Visibles>({ clave: CLAVE, firma, volvio: consumirVuelta(window.location.pathname) });
    // Next reutiliza el componente al pasar de una persona a otra: lo de la
    // anterior no se arrastra.
    setRestaurado(null);
    setCtxRestaurado(null);
    setVisibles(INICIALES);
    if (e) {
      setRestaurado(e.datos);
      if (e.extra) setVisibles({ ...INICIALES, ...e.extra });
      pendiente.current = e.scrollY;
      setCtxRestaurado(ctxActual);
    }
    setDecidido(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Si cambian las plataformas con algo restaurado, se suelta y se pide de nuevo.
  useEffect(() => {
    if (snapshotVigente(ctxRestaurado, ctxActual)) return;
    setRestaurado(null);
    setCtxRestaurado(null);
    setVisibles(INICIALES);
    pendiente.current = null;
  }, [ctxRestaurado, ctxActual]);

  const { data: pedido, loading, offline, error, retry } = useApi<Filmografia>(
    () => (!decidido || restaurado ? "" : `/api/person/${id}?providers=${platforms.join(",")}`),
    [id, decidido, !!restaurado],
  );
  const data = restaurado ?? pedido;

  useEffect(() => {
    if (!data || pendiente.current === null) return;
    const y = pendiente.current;
    pendiente.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [data]);

  // Se guarda al llegar los datos, al abrir más y al terminar de scrollear (no
  // en cada cuadro: el snapshot de una carrera larga pesa decenas de KB).
  useEffect(() => {
    if (!decidido || !data) return;
    const guardar = () => guardarVista<Filmografia, Visibles>(CLAVE, { firma, datos: data, scrollY: window.scrollY, extra: visibles });
    guardar();
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => { if (t) clearTimeout(t); t = setTimeout(guardar, 150); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { if (t) clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, [firma, data, visibles, decidido]);

  if ((offline || error) && !data) return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  const cargando = !data && (loading || !decidido);
  return (
    <div className="wrap">
      <Link className="back" href="/buscar"><svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" /></svg>Volver a Buscar</Link>
      <h2 className="section-title">{data?.person?.name ?? "Cargando…"}</h2>
      {data && !data.secciones && <Legado data={data} />}
      {data?.secciones && (
        <>
          <p className="section-sub">
            {/* Filmografía completa: tus plataformas ORDENAN, no filtran. Lo que
                no está en ellas sigue apareciendo, en gris y rotulado. */}
            {data.secciones.length ? "Filmografía completa. Primero, lo que está en tus plataformas." : ""}
          </p>
          {data.secciones.map((s) => (
            <SeccionFilmografia
              key={s} rotulo={ROTULO[s]} titles={data[s] ?? []} platforms={platforms}
              visibles={visibles[s]} onMas={() => setVisibles((v) => ({ ...v, [s]: v[s] + PAGINA }))}
            />
          ))}
          {!data.secciones.length && <p className="empty-note">No encontramos películas ni series de esta persona.</p>}
        </>
      )}
      {cargando && <p className="section-sub">Cargando…</p>}
    </div>
  );
}

function SeccionFilmografia({ rotulo, titles, platforms, visibles, onMas }: {
  rotulo: string; titles: UITitle[]; platforms: PlatformCode[]; visibles: number; onMas: () => void;
}) {
  const enTuyas = titles.filter((t) => t.platforms.some((p) => platforms.includes(p))).length;
  const resto = titles.length - visibles;
  return (
    <section className="filmo-sec">
      <h3 className="filmo-sec-t">{rotulo} <span>· {titles.length}</span></h3>
      <p className="filmo-sec-sub">
        {enTuyas ? `${enTuyas} en tus plataformas` : "Ninguna en tus plataformas ahora"}
      </p>
      <div className="grid">
        {titles.slice(0, visibles).map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
      </div>
      {resto > 0 && (
        <div className="filmo-mas">
          <button className="btn ghost" onClick={onMas}>Ver más ({resto})</button>
        </div>
      )}
    </section>
  );
}

// Respuesta sin secciones (un servidor anterior a este cambio): se muestra como
// antes, sólo lo disponible.
function Legado({ data }: { data: Filmografia }) {
  return (
    <>
      <p className="section-sub">Filmografía en tus plataformas</p>
      <div className="grid">
        {data.titles.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {data.titles.length === 0 && <p className="empty-note">Nada en tus plataformas ahora.</p>}
      </div>
    </>
  );
}
