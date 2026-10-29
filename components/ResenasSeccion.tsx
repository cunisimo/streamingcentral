"use client";
import { createContext, useContext, useId, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ResenaFicha } from "@/lib/resenas";

// El armazón de la sección "RESEÑAS" de la ficha y la reseña de Yump. Lo usan
// ResenasAcordeon (sin sesión) y comunidad/ResenasComunidad (con sesión).
const star = <svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17l-6 3.6 1.5-6.7L2.4 8.9l6.8-.6z" /></svg>;

// Abierto o cerrado, compartido por TÍTULO (lo provee ResenasAcordeon, que la
// ficha monta con `key` por título). Así, abrir la sección mientras se resuelve
// la sesión, o cambiar de cuenta, no la vuelve a cerrar: cambia el contenido
// (que sí se monta de nuevo por cuenta), no el estado de la sección.
const AbiertoCtx = createContext<[boolean, Dispatch<SetStateAction<boolean>>] | null>(null);
export function AbiertoPorTitulo({ children }: { children: ReactNode }) {
  const estado = useState(false);
  return <AbiertoCtx.Provider value={estado}>{children}</AbiertoCtx.Provider>;
}

export function Acordeon({ titulo, children, etiqueta = "Reseñas" }: { titulo: string; children: ReactNode; etiqueta?: string }) {
  const propio = useState(false);
  const [abierto, setAbierto] = useContext(AbiertoCtx) ?? propio;
  const panel = useId();
  return (
    <section className={`resenas${abierto ? " abierto" : ""}`}>
      <button type="button" className="resenas-cab" aria-expanded={abierto} aria-controls={panel} onClick={() => setAbierto((a) => !a)}>
        <span className="resenas-textos">
          <span className="resenas-t">{titulo}</span>
          <span className="resenas-sub">Cuidado, puede contener spoilers.</span>
        </span>
        <svg className="resenas-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {abierto && (
        <div id={panel} className="resenas-ventana" role="region" aria-label={etiqueta}>
          {children}
        </div>
      )}
    </section>
  );
}

export function ResenasYump({ resenas }: { resenas: ResenaFicha[] }) {
  return (
    <>
      {resenas.map((r) => (
        <article key={r.id} className={`review${r.origen === "yump" ? "" : " usuario"}`}>
          <div className="badge">{r.origen === "yump" && star}{r.autor}</div>
          <p>{r.texto}</p>
          <p className="auth">{r.origen === "yump" ? "— Reseña propia" : `— ${r.autor}`} · {r.fecha}</p>
        </article>
      ))}
    </>
  );
}
