// Placeholder de la ficha mientras carga. Reemplaza el "Cargando ficha…" por un
// esqueleto con la forma real del contenido (hero + título + meta + CTA +
// acciones + sinopsis), para que la transición no dé un salto.
export default function DetailSkeleton() {
  return (
    <div className="detail-inner" aria-busy="true" aria-label="Cargando ficha">
      <div className="sk sk-hero" />
      <div className="dpad">
        <div className="sk sk-title" />
        <div className="sk sk-meta" />
        <div className="sk sk-primary" />
        <div className="sk-actions">
          <div className="sk sk-act" />
          <div className="sk sk-act" />
          <div className="sk sk-act" />
        </div>
        <div className="sk sk-line" />
        <div className="sk sk-line" />
        <div className="sk sk-line short" />
      </div>
    </div>
  );
}
