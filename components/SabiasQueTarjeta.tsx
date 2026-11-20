"use client";
import { useId, useState } from "react";
import { urlFuenteValida, type CuriosidadPublica } from "@/lib/curiosidades-nucleo";

// La tarjeta de «¿Sabías que…?»: la MISMA en la ficha y en la vista previa del
// panel, así lo que se previsualiza es lo que se publica.
//
// Con spoiler, el texto NO se renderiza hasta tocar «Mostrar curiosidad» (no es
// un texto oculto con CSS: un lector de pantalla tampoco lo lee antes). El botón
// es un botón real (teclado: Tab + Enter/Espacio), con `aria-expanded` y
// `aria-controls`; al revelarse, el texto entra en una región con nombre.
//
// El estado revelado vive en ESTE componente: la ficha lo monta con `key` por
// título, así que al pasar a otra película/serie arranca oculto de nuevo.
//
// Texto plano: React lo escapa y `white-space: pre-line` respeta los saltos.
// El enlace a la fuente abre aparte, sin `opener` ni `referrer`.
export default function SabiasQueTarjeta({ c }: { c: CuriosidadPublica }) {
  const [revelada, setRevelada] = useState(!c.spoiler);
  const panel = useId();
  return (
    <article className="sq-card">
      {c.spoiler && (
        <div className="sq-spoiler">
          <span className="sq-aviso">Contiene spoilers</span>
          <button
            type="button" className="sq-mostrar" aria-expanded={revelada} aria-controls={panel}
            onClick={() => setRevelada((r) => !r)}
          >
            {revelada ? "Ocultar curiosidad" : "Mostrar curiosidad"}
          </button>
        </div>
      )}
      <div id={panel} role={c.spoiler ? "region" : undefined} aria-label={c.spoiler ? "Curiosidad" : undefined}>
        {revelada && (
          <>
            <p className="sq-texto">{c.texto}</p>
            <p className="sq-fuente">
              Fuente:{" "}
              {/* El enlace existe SÓLO con una URL http/https válida. La ficha ya
                  recibe datos validados; esto cubre la vista previa del panel,
                  que dibuja lo que se está tipeando (p. ej. `javascript:`). */}
              {urlFuenteValida(c.fuente.url)
                ? <a href={c.fuente.url} target="_blank" rel="noopener noreferrer nofollow">{c.fuente.nombre}</a>
                : <span>{c.fuente.nombre}</span>}
            </p>
          </>
        )}
      </div>
    </article>
  );
}
