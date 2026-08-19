"use client";

// "No es para mí" — el ojo tachado sobre el póster.
//
// Existe SOLO en "Elegidas para vos". No es una regla escrita en ningún lado:
// el botón se dibuja únicamente si a la card le llega `onDescartar`, y ese prop
// lo pasa ese riel y nadie más. Un riel que no lo pase no puede mostrarlo ni por
// error.
//
// Vive fuera del <Link> de la card, como hermano, igual que `QuickAddButton`:
// así el clic no navega a la ficha y no queda un <button> anidado dentro de un
// <a>, que es HTML inválido. El `preventDefault` + `stopPropagation` es el
// cinturón además de los tiradores.
const OJO_TACHADO = [
  "M10.7 5.1A9.9 9.9 0 0 1 12 5c5 0 9 4.5 10 7a15 15 0 0 1-2.4 3.4",
  "M6.6 6.6A14.6 14.6 0 0 0 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 4.9-1.3",
  "M9.9 9.9a3 3 0 0 0 4.2 4.2",
  "M2 2l20 20",
];

export default function DescartarButton({ onDescartar }: { onDescartar: () => void }) {
  return (
    <button
      type="button"
      className="quick-add quick-hide"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDescartar(); }}
      aria-label="No es para mí"
      title="No es para mí"
    >
      <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {OJO_TACHADO.map((d, i) => <path key={i} d={d} />)}
      </svg>
    </button>
  );
}
