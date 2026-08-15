import CardSkeleton from "./CardSkeleton";

// Placeholder de un riel entero. Mismo criterio que CardSkeleton: usa las
// clases reales (.shelf/.track) para que el alto lo calcule el mismo CSS.
//
// Existe por dos motivos, no uno. El de CLS es obvio. El otro es la
// restauración de scroll: al volver de una ficha, el navegador pone el scroll
// guardado UNA vez, y si en ese instante el documento todavía no creció lo
// recorta al máximo disponible y no lo vuelve a calcular. Con un "Cargando…"
// de 24px en lugar de los 11 rieles, el documento medía 1688px cuando tenía
// que medir 6275, y volver al Home te dejaba a mitad de camino.
//
// El encabezado es la excepción a "usar las clases reales": lleva alto fijo
// (`.sk-head`) porque el real mide 33px o 66px según si el título entra en un
// renglón al lado del toggle, y un placeholder no puede saber de antemano cuál
// de los dos le toca. Se reserva el caso común, que son 8 de los 11 rieles.
export default function ShelfSkeleton({ conToggle = true, cards = 7 }: { conToggle?: boolean; cards?: number }) {
  return (
    <div className="shelf" aria-hidden="true">
      <div className="shelf-head sk-head">
        <i className="sk sk-head-t" />
        {conToggle && <i className="sk sk-head-tg" />}
      </div>
      <div className="track">
        {Array.from({ length: cards }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    </div>
  );
}
