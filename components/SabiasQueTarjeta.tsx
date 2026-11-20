"use client";
import { useId, useState } from "react";
import { textoDeFuente, urlFuenteValida, type CuriosidadPublica } from "@/lib/curiosidades-nucleo";

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
  const fuente = c.fuente;
  const etiqueta = fuente ? textoDeFuente(fuente) : "";
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
            {/* La fuente es OPCIONAL: sin fuente no se dibuja nada (ni rótulo
                ni hueco). Con nombre solo, texto; con URL, enlace (y si no hay
                nombre, el dominio). El enlace existe SÓLO con una URL http/https
                válida: la ficha ya recibe datos validados; esto cubre además la
                vista previa del panel, que dibuja lo que se está tipeando. */}
            {fuente && etiqueta && (
              <p className="sq-fuente">
                Fuente:{" "}
                {fuente.url && urlFuenteValida(fuente.url)
                  ? <a href={fuente.url} target="_blank" rel="noopener noreferrer nofollow">{etiqueta}</a>
                  : <span>{etiqueta}</span>}
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
