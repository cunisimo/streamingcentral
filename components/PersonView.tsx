"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { consumirVuelta, decidirRestauracionVista, guardarVista } from "@/hooks/lista-paginada-store";
import { apiUrl } from "@/lib/api-base";
import { claveDe, ordenVisible, type Seccion } from "@/lib/filmografia-bloques";
import {
  crearControladorFilmografia, ErrorDeRed, type EstadoFilmografia, type Transporte, type Vista,
} from "@/lib/filmografia-cliente";
import type { ObraPersona, PlatformCode, UITitle } from "@/lib/types";

// Carga PROGRESIVA con el contrato v2 (issue #25). Qué se pide y cuándo lo
// decide lib/filmografia-cliente.ts: la ruta trae la filmografía entera como
// datos básicos y la disponibilidad sólo del bloque inicial, y cada "Ver más"
// pide la del bloque siguiente de esa sección (máx. 24).
//
// 🔴 Las plataformas elegidas NO disparan peticiones: la vista no usa `useApi`
// (que re-pide al cambiarlas) y el pedido depende sólo del id. Cambiar
// plataformas reordena localmente lo ya cargado, sin colapsar nada.

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

// UNA entrada para todas las personas: con una por persona, el snapshot —que se
// reescribe entero en cada guardado— crecería con cada ficha visitada. La firma
// es el id y NO lleva las plataformas: lo guardado no depende de ellas.
const CLAVE = "persona";

// El transporte real: `fetch` con la base de la API (web o contenedor).
const transporte: Transporte = {
  async pedir<T>(ruta: string, senal: AbortSignal): Promise<T> {
    let r: Response;
    try {
      r = await fetch(apiUrl(ruta), { signal: senal });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      throw new ErrorDeRed(String(e));
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  },
};

export default function PersonView({ id }: { id: string }) {
  const { platforms } = usePlatforms();
  const [estado, setEstado] = useState<EstadoFilmografia>({ personId: null, fase: "vacia", vista: null, cargando: null });
  const ctrl = useRef<ReturnType<typeof crearControladorFilmografia> | null>(null);
  if (!ctrl.current) ctrl.current = crearControladorFilmografia(transporte, setEstado);
  const pendiente = useRef<number | null>(null);

  // Abrir la persona: restaurar si se volvió desde una ficha, o pedirla. Depende
  // SÓLO del id: ni las plataformas ni nada más la vuelven a pedir.
  useEffect(() => {
    const c = ctrl.current!;
    const e = decidirRestauracionVista<Vista>({ clave: CLAVE, firma: id, volvio: consumirVuelta(window.location.pathname) });
    if (e) { pendiente.current = e.scrollY; c.restaurar(id, e.datos); } else { void c.abrir(id); }
    return () => c.cerrar();
  }, [id]);

  const vista = estado.personId === id ? estado.vista : null;

  useEffect(() => {
    if (!vista || pendiente.current === null) return;
    const y = pendiente.current;
    pendiente.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [vista]);

  // Se guarda al cambiar la vista y al terminar de scrollear (no por cuadro).
  useEffect(() => {
    if (!vista) return;
    const guardar = () => guardarVista<Vista>(CLAVE, { firma: id, datos: vista, scrollY: window.scrollY });
    guardar();
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => { if (t) clearTimeout(t); t = setTimeout(guardar, 150); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { if (t) clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, [id, vista]);

  const clavesDe = useMemo(() => ({
    direccion: (vista?.base.direccion ?? []).map(claveDe),
    actuacion: (vista?.base.actuacion ?? []).map(claveDe),
  }), [vista?.base]);

  if (!vista && (estado.fase === "offline" || estado.fase === "error") && estado.personId === id) {
    return <div className="wrap"><OfflineState onRetry={() => void ctrl.current!.abrir(id)} /></div>;
  }
  const base = vista?.base;
  return (
    <div className="wrap">
      <Link className="back" href="/buscar"><svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" /></svg>Volver a Buscar</Link>
      <h2 className="section-title">{base?.person?.name ?? "Cargando…"}</h2>
      {base && vista && (
        <>
          <p className="section-sub">
            {base.secciones.length ? "Filmografía completa, de lo más reciente a lo más antiguo. En cada tanda, primero lo que está en tus plataformas." : ""}
          </p>
          {base.secciones.map((s) => (
            <SeccionFilmografia
              key={s} seccion={s} obras={base[s]} claves={clavesDe[s]} inicial={base.inicial[s]}
              vista={vista} platforms={platforms} cargando={estado.cargando === s}
              ocupado={estado.cargando !== null}
              onMas={() => void ctrl.current!.verMas(s)} onReintentar={() => void ctrl.current!.reintentar(s)}
            />
          ))}
          {!base.secciones.length && <p className="empty-note">No encontramos películas ni series de esta persona.</p>}
        </>
      )}
      {!base && <p className="section-sub">Cargando…</p>}
    </div>
  );
}

function SeccionFilmografia({ seccion, obras, claves, inicial, vista, platforms, cargando, ocupado, onMas, onReintentar }: {
  seccion: Seccion; obras: ObraPersona[]; claves: string[]; inicial: number; vista: Vista;
  platforms: PlatformCode[]; cargando: boolean; ocupado: boolean; onMas: () => void; onReintentar: () => void;
}) {
  const visibles = vista.visibles[seccion];
  const porClave = useMemo(() => new Map(obras.map((o) => [claveDe(o), o])), [obras]);
  // El orden por plataformas se calcula ACÁ, al dibujar: cambiarlas reordena lo
  // ya cargado sin ninguna petición y sin tocar cuántas se ven.
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
