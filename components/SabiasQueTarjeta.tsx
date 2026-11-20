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
/**
 * El título de la sección, con la bombita a la izquierda. Lo usan la ficha y
 * las vistas previas del panel, así se ven iguales.
 *
 * El ícono es un EMOJI (💡), con el mismo tratamiento que los de los banners
 * del Home (🎲 Ruleta, 🍿 Yumpeá, 🍀 Desempate: `.dsmp-banner-ico`, emoji del
 * sistema con sombra suave). Pedido del dueño del 20/11: reemplazó al ícono
 * delineado. Como todo emoji, el dibujo exacto depende del sistema (Android,
 * Windows, iOS), igual que los de los banners. Es decorativo: `aria-hidden`,
 * así el nombre accesible del título es sólo el texto.
 */
export function SabiasQueTitulo({ id }: { id?: string }) {
  return (
    <h2 className="dsec-h sq-h" id={id}>
      <span className="sq-ico" aria-hidden="true">💡</span>
      ¿Sabías que…?
    </h2>
  );
}

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
