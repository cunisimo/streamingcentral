"use client";
import { puedeReiniciar, type EstadoLista } from "@/lib/comunidad/lista-nucleo";
import type { Orden } from "@/lib/comunidad/lectura";
import type { Voto } from "@/lib/comunidad/evaluacion-nucleo";
import EvaluacionResena from "./EvaluacionResena";
import MenuResena from "./MenuResena";
import type { RespuestaEditor } from "./EditorResena";

// La lista de la comunidad (E5a): selector de orden, las reseñas visibles para
// quien lee y "Cargar más". El estado vive en lib/comunidad/lista-nucleo.ts
// (puro). Un fallo de tanda deja lo visible y avisa al pie; "Reintentar" pide
// desde el mismo cursor confirmado.
//
// E5b: el selector tiene los dos órdenes; "Más útiles" es el de por defecto.
// En "Más útiles" una tanda puede traer menos de cinco (la base revisa como
// máximo 50 posiciones por página) y, si el orden vence, la lista avisa "Orden
// actualizado" y ofrece volver a empezar UNA vez.
//
// Sin nombre del autor: el nombre comunitario llega en E6. Hasta entonces no se
// muestra ningún dato de la cuenta (ni correo ni nombre del perfil).
const ORDENES: { id: Orden; titulo: string }[] = [{ id: "utiles", titulo: "Más útiles" }, { id: "recientes", titulo: "Recientes" }];

export default function ListaResenas({
  lista, orden, cambiarOrden, reiniciar, enviar, votar, cargarMas, alDenunciar, alBloquear,
}: {
  lista: EstadoLista;
  orden: Orden;
  cambiarOrden: (o: Orden) => void;
  reiniciar: () => void;
  enviar: (ruta: string, cuerpo: Record<string, unknown>) => Promise<RespuestaEditor>;
  votar: (versionId: number, voto: Voto | "retirar") => Promise<{ resultado?: unknown; motivo?: unknown } | "sin-confirmar">;
  cargarMas: () => void;
  alDenunciar: (versionId: number) => void;
  alBloquear: (versionId: number, denunciada: boolean) => void;
}) {
  return (
    <div className="cm-lista">
      <div className="cm-orden" role="radiogroup" aria-label="Orden de las reseñas">
        {ORDENES.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={orden === o.id} className={`cm-orden-op${orden === o.id ? " on" : ""}`}
            onClick={() => cambiarOrden(o.id)}>{o.titulo}</button>
        ))}
      </div>
      {lista.pedido === 0 && lista.items.length === 0 && <p className="cm-sub" role="status">Cargando…</p>}
      {lista.items.map((o) => (
        <article key={o.resena_id} className="review usuario">
          <div className="cm-cab">
            <div className="badge">Reseña de la comunidad{o.editada ? " · editada" : ""}</div>
            <MenuResena versionId={o.version_id} denunciada={o.denunciada} enviar={enviar}
              alDenunciar={() => alDenunciar(o.version_id)}
              alBloquear={({ denunciada }) => alBloquear(o.version_id, denunciada)} />
          </div>
          <p>{o.texto}</p>
          <EvaluacionResena versionId={o.version_id} utiles={o.utiles} total={o.total} miVoto={o.mi_voto} esPropia={false} votar={votar} />
        </article>
      ))}
      {lista.errorMas && (
        <p className="cm-msg error" role="alert">
          No pudimos cargar más reseñas. Las que ves siguen acá.{" "}
          <button className="cm-link" onClick={lista.vencido ? reiniciar : cargarMas}>Reintentar</button>
        </p>
      )}
      {lista.vencido && !lista.errorMas && (
        <p className="cm-msg info" role="status">
          Orden actualizado: el orden por utilidad se recalculó mientras leías.{" "}
          {puedeReiniciar(lista)
            ? <button className="cm-link" onClick={reiniciar}>Volver a empezar</button>
            : lista.reiniciado
              ? "Ya volviste a empezar una vez: para verlo desde el principio, elegí «Recientes» y volvé a «Más útiles»."
              : null}
        </p>
      )}
      {lista.hayMas && !lista.errorMas && (
        <button type="button" className="btn ghost cm-mas" aria-disabled={lista.cargandoMas} onClick={() => { if (!lista.cargandoMas) cargarMas(); }}>
          {lista.cargandoMas ? "Cargando…" : "Cargar más"}
        </button>
      )}
    </div>
  );
}
