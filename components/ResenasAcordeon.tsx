"use client";
import { useId, useState } from "react";
import { tituloResenas, type ResenaFicha } from "@/lib/resenas";

const star = <svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17l-6 3.6 1.5-6.7L2.4 8.9l6.8-.6z" /></svg>;

// Sección "RESEÑAS" de la ficha. Arranca SIEMPRE cerrada y, cerrada, no
// renderiza ni una línea de texto: puede haber spoilers (decisión del dueño,
// 5/10). Abierta, las reseñas van en una ventana con alto máximo y scroll
// propio (`.resenas-ventana`): con el puntero adentro se mueven las reseñas,
// afuera la página, y `overscroll-behavior: contain` evita que al llegar al
// final de la ventana el scroll siga en la página.
//
// La ficha la monta con `key` por título: ir de una ficha a otra (relacionados)
// la vuelve a montar cerrada.
export default function ResenasAcordeon({ resenas }: { resenas: ResenaFicha[] }) {
  const [abierto, setAbierto] = useState(false);
  const panel = useId();
  return (
    <section className={`resenas${abierto ? " abierto" : ""}`}>
      <button type="button" className="resenas-cab" aria-expanded={abierto} aria-controls={panel} onClick={() => setAbierto((a) => !a)}>
        <span className="resenas-textos">
          <span className="resenas-t">{tituloResenas(resenas.length)}</span>
          <span className="resenas-sub">Cuidado, puede contener spoilers.</span>
        </span>
        <svg className="resenas-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {abierto && (
        <div id={panel} className="resenas-ventana" role="region" aria-label="Reseñas">
          {resenas.map((r) => (
            <article key={r.id} className={`review${r.origen === "yump" ? "" : " usuario"}`}>
              <div className="badge">{r.origen === "yump" && star}{r.autor}</div>
              <p>{r.texto}</p>
              <p className="auth">{r.origen === "yump" ? "— Reseña propia" : `— ${r.autor}`} · {r.fecha}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
