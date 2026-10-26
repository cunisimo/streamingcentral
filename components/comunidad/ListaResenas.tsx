"use client";
import type { EstadoLista } from "@/lib/comunidad/lista-nucleo";
import type { Voto } from "@/lib/comunidad/evaluacion-nucleo";
import EvaluacionResena from "./EvaluacionResena";
import MenuResena from "./MenuResena";
import type { RespuestaEditor } from "./EditorResena";

// La lista de la comunidad (E5a): selector de orden, las reseñas visibles para
// quien lee y "Cargar más". El estado vive en lib/comunidad/lista-nucleo.ts
// (puro). Un fallo de tanda deja lo visible y avisa al pie; "Reintentar" pide
// desde el mismo cursor confirmado.
//
// El selector ya tiene los dos órdenes del diseño, pero "Más útiles" llega en
// E5b: hoy está deshabilitado y "Recientes" es el único.
//
// Sin nombre del autor: el nombre comunitario llega en E6. Hasta entonces no se
// muestra ningún dato de la cuenta (ni correo ni nombre del perfil).
export default function ListaResenas({
  lista, enviar, votar, cargarMas, alDenunciar, alBloquear,
}: {
  lista: EstadoLista;
  enviar: (ruta: string, cuerpo: Record<string, unknown>) => Promise<RespuestaEditor>;
  votar: (versionId: number, voto: Voto | "retirar") => Promise<{ resultado?: unknown; motivo?: unknown } | "sin-confirmar">;
  cargarMas: () => void;
  alDenunciar: (versionId: number) => void;
  alBloquear: (versionId: number, denunciada: boolean) => void;
}) {
  return (
    <div className="cm-lista">
      <div className="cm-orden" role="radiogroup" aria-label="Orden de las reseñas">
        <button type="button" role="radio" aria-checked={false} aria-disabled title="Muy pronto" className="cm-orden-op" onClick={(e) => e.preventDefault()}>
          Más útiles <span className="cm-orden-pronto">pronto</span>
        </button>
        <button type="button" role="radio" aria-checked className="cm-orden-op on">Recientes</button>
      </div>
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
          <button className="cm-link" onClick={cargarMas}>Reintentar</button>
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
