"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { consumirVuelta, decidirRestauracionVista, guardarVista } from "@/hooks/lista-paginada-store";
import { contextoDe, snapshotVigente } from "@/hooks/restauracion-vigente";
import { apiUrl } from "@/lib/api-base";
import {
  BLOQUE, claveDe, crearCargador, ordenVisible, siguienteBloque, type Seccion,
} from "@/lib/filmografia-bloques";
import type { DisponibilidadObras, FilmografiaPersona, ObraPersona, PlatformCode, UITitle } from "@/lib/types";

// Carga PROGRESIVA (issue #25, lib/filmografia-bloques.ts): la ruta trae la
// filmografía entera como datos básicos y la disponibilidad sólo del bloque
// inicial; cada "Ver más" pide la disponibilidad del bloque siguiente de esa
// sección (`?items=`, máx. 24) y recién entonces lo muestra.

type Visibles = Record<Seccion, number>;
interface Vista {
  base: FilmografiaPersona;
  disp: Record<string, PlatformCode[]>;
  /** Consultas fallidas: "sin datos", nunca "no está". */
  sinDatos: string[];
}

const ROTULO: Record<Seccion, string> = { direccion: "Dirección", actuacion: "Actuación" };
// Los trabajos de equipo más comunes, en castellano; el resto va tal cual.
const OFICIO: Record<string, string> = {
  Director: "Dirección", Screenplay: "Guion", Writer: "Guion", Story: "Historia", Novel: "Novela",
  Producer: "Producción", "Executive Producer": "Producción ejecutiva", "Co-Producer": "Coproducción",
  Editor: "Montaje", "Director of Photography": "Fotografía", "Original Music Composer": "Música",
};
const personaje = (r: string) => r.replace(/\(voice\)/gi, "(voz)").replace(/\(uncredited\)/gi, "(sin acreditar)");
function rotuloRoles(s: Seccion, roles: string[]): string {
  const vistos = s === "direccion" ? roles.map((r) => OFICIO[r] ?? r) : roles.map(personaje);
  return [...new Set(vistos)].join(" · ");
}

// UNA entrada para todas las personas (la firma lleva el id): con una por
// persona, el snapshot —que se reescribe entero en cada guardado— crecería con
// cada ficha visitada en la sesión.
const CLAVE = "persona";
const SIN_VISIBLES: Visibles = { direccion: 0, actuacion: 0 };

export default function PersonView({ id }: { id: string }) {
  const { platforms } = usePlatforms();
  const firma = `${id}|${platforms.join(",")}`;

  // --- Volver de una ficha devuelve la vista (patrón de ListaView) ---------
  const [restaurado, setRestaurado] = useState<Vista | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [visibles, setVisibles] = useState<Visibles>(SIN_VISIBLES);
  const [decidido, setDecidido] = useState(false);
  const pendiente = useRef<number | null>(null);
  // De quién es la vista armada: una respuesta nueva de la MISMA persona se
  // fusiona; la de otra persona reemplaza.
  const personaEnVista = useRef<number | null>(null);
  const [ctxRestaurado, setCtxRestaurado] = useState<string | null>(null);
  const ctxActual = contextoDe([firma]);

  // Cada persona es una GENERACIÓN: un "Ver más" de la anterior que vuelve
  // tarde se descarta (y se cancela). El id va por ref: el cargador se crea una
  // sola vez y no puede quedarse con el del primer render.
  const idActual = useRef(id);
  idActual.current = id;
  const cargador = useRef(crearCargador<DisponibilidadObras>(async (claves, senal) => {
    const r = await fetch(apiUrl(`/api/person/${idActual.current}?items=${claves.join(",")}`), { signal: senal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as DisponibilidadObras;
  }));
  const [cargando, setCargando] = useState<Seccion | null>(null);

  useEffect(() => {
    cargador.current.reiniciar();
    setCargando(null);
    const e = decidirRestauracionVista<Vista, Visibles>({ clave: CLAVE, firma, volvio: consumirVuelta(window.location.pathname) });
    // Next reutiliza el componente al pasar de una persona a otra.
    setRestaurado(null); setCtxRestaurado(null); setVista(null); setVisibles(SIN_VISIBLES);
    personaEnVista.current = e ? e.datos.base.person.id : null;
    if (e) {
      setRestaurado(e.datos); setVista(e.datos);
      if (e.extra) setVisibles(e.extra);
      pendiente.current = e.scrollY;
      setCtxRestaurado(ctxActual);
    }
    setDecidido(true);
    return () => cargador.current.reiniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Si cambian las plataformas con algo restaurado, se suelta y se pide de nuevo.
  useEffect(() => {
    if (snapshotVigente(ctxRestaurado, ctxActual)) return;
    setRestaurado(null); setCtxRestaurado(null);
    pendiente.current = null;
  }, [ctxRestaurado, ctxActual]);

  const { data, loading, offline, error, retry } = useApi<FilmografiaPersona>(
    () => (!decidido || restaurado ? "" : `/api/person/${id}?providers=${platforms.join(",")}`),
    [id, decidido, !!restaurado],
  );
  // Llegó la filmografía: el bloque inicial ya viene con su disponibilidad.
  // Si es la MISMA persona (useApi re-pide al cambiar las plataformas, que sólo
  // cambian el orden), se conserva lo ya abierto y resuelto: no se colapsa la
  // vista ni se pierde lo consultado con "Ver más".
  useEffect(() => {
    if (!data || restaurado) return;
    if (personaEnVista.current === data.person.id) {
      setVista((v) => v && { ...v, base: data, disp: { ...data.disponibilidad, ...v.disp } });
      return;
    }
    personaEnVista.current = data.person.id;
    setVista({ base: data, disp: data.disponibilidad ?? {}, sinDatos: data.sinDisponibilidad ?? [] });
    setVisibles(data.inicial ?? SIN_VISIBLES);
  }, [data, restaurado]);

  useEffect(() => {
    if (!vista || pendiente.current === null) return;
    const y = pendiente.current;
    pendiente.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [vista]);

  // Se guarda al cambiar la vista y al terminar de scrollear (no por cuadro).
  useEffect(() => {
    if (!decidido || !vista) return;
    const guardar = () => guardarVista<Vista, Visibles>(CLAVE, { firma, datos: vista, scrollY: window.scrollY, extra: visibles });
    guardar();
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => { if (t) clearTimeout(t); t = setTimeout(guardar, 150); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { if (t) clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, [firma, vista, visibles, decidido]);

  const clavesDe = useMemo(() => ({
    direccion: (vista?.base.direccion ?? []).map(claveDe),
    actuacion: (vista?.base.actuacion ?? []).map(claveDe),
  }), [vista?.base]);

  // Pide la disponibilidad de `pedir` y abre la sección hasta `hasta`. Un fallo
  // abre igual: las obras se ven con sus datos básicos y "sin datos".
  const consultar = useCallback(async (s: Seccion, pedir: string[], hasta: number) => {
    setCargando(s);
    let r: DisponibilidadObras | null;
    try {
      r = pedir.length ? await cargador.current.cargar(pedir) : { disponibilidad: {}, sinDisponibilidad: [] };
      if (r === null) return; // llegó tarde: es de otra persona
    } catch {
      r = { disponibilidad: {}, sinDisponibilidad: pedir };
    }
    const res = r;
    setVista((v) => v && {
      ...v,
      disp: { ...v.disp, ...res.disponibilidad },
      sinDatos: [...v.sinDatos.filter((k) => !(k in res.disponibilidad)), ...res.sinDisponibilidad.filter((k) => !v.sinDatos.includes(k))],
    });
    setVisibles((v) => ({ ...v, [s]: Math.max(v[s], hasta) }));
    setCargando(null);
  }, []);

  const verMas = (s: Seccion) => {
    if (!vista || cargando) return;
    const resuelta = (k: string) => k in vista.disp || vista.sinDatos.includes(k);
    const { hasta, pedir } = siguienteBloque(clavesDe[s], visibles[s], resuelta);
    void consultar(s, pedir, hasta);
  };
  const reintentar = (s: Seccion) => {
    if (!vista || cargando) return;
    const fallidas = clavesDe[s].slice(0, visibles[s]).filter((k) => vista.sinDatos.includes(k)).slice(0, BLOQUE);
    void consultar(s, fallidas, visibles[s]);
  };

  if ((offline || error) && !vista) return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  const base = vista?.base;
  return (
    <div className="wrap">
      <Link className="back" href="/buscar"><svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" /></svg>Volver a Buscar</Link>
      <h2 className="section-title">{base?.person?.name ?? "Cargando…"}</h2>
      {base && (
        <>
          <p className="section-sub">
            {base.secciones.length ? "Filmografía completa, de lo más reciente a lo más antiguo. En cada tanda, primero lo que está en tus plataformas." : ""}
          </p>
          {base.secciones.map((s) => (
            <SeccionFilmografia
              key={s} seccion={s} obras={base[s]} claves={clavesDe[s]} inicial={base.inicial[s]}
              visibles={visibles[s]} vista={vista} platforms={platforms} cargando={cargando === s}
              ocupado={cargando !== null} onMas={() => verMas(s)} onReintentar={() => reintentar(s)}
            />
          ))}
          {!base.secciones.length && <p className="empty-note">No encontramos películas ni series de esta persona.</p>}
        </>
      )}
      {!base && (loading || !decidido) && <p className="section-sub">Cargando…</p>}
    </div>
  );
}

function SeccionFilmografia({ seccion, obras, claves, inicial, visibles, vista, platforms, cargando, ocupado, onMas, onReintentar }: {
  seccion: Seccion; obras: ObraPersona[]; claves: string[]; inicial: number; visibles: number; vista: Vista;
  platforms: PlatformCode[]; cargando: boolean; ocupado: boolean; onMas: () => void; onReintentar: () => void;
}) {
  const porClave = useMemo(() => new Map(obras.map((o) => [claveDe(o), o])), [obras]);
  const orden = ordenVisible(claves, inicial, visibles, (k) => vista.disp[k], platforms);
  const sinDatos = orden.filter((k) => vista.sinDatos.includes(k)).length;
  const resto = obras.length - visibles;
  return (
    <section className="filmo-sec">
      <h3 className="filmo-sec-t">{ROTULO[seccion]} <span>· {obras.length}</span></h3>
      <div className="grid">
        {orden.map((k) => {
          const o = porClave.get(k);
          if (!o) return null;
          const { fecha: _f, votos: _v, roles, ...datos } = o;
          const t: UITitle = { ...datos, runtime: null, platforms: vista.disp[k] ?? [] };
          return (
            <div key={k} className="filmo-obra">
              <TitleCard t={t} sinDatos={vista.sinDatos.includes(k)} />
              {roles.length > 0 && <p className="filmo-roles">{rotuloRoles(seccion, roles)}</p>}
            </div>
          );
        })}
      </div>
      {sinDatos > 0 && (
        <p className="filmo-aviso">
          No pudimos consultar la disponibilidad de {sinDatos === 1 ? "una obra" : `${sinDatos} obras`}.{" "}
          <button className="filmo-reintentar" onClick={onReintentar} disabled={ocupado}>Reintentar</button>
        </p>
      )}
      {resto > 0 && (
        <div className="filmo-mas">
          <button className="btn ghost" onClick={onMas} disabled={ocupado}>
            {cargando ? "Cargando…" : `Ver más (${resto})`}
          </button>
        </div>
      )}
    </section>
  );
}
