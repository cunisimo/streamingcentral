// Placeholder de card de riel. Usa las MISMAS clases que la card real
// (.card/.poster/.meta/.t/.info/.logos) a propósito: así el alto lo calcula el
// mismo CSS y no un número copiado a mano, que se desincroniza al primer
// retoque de estilos. Reservar de menos empuja todo hacia abajo cuando llegan
// los datos; reservar de más lo tira hacia arriba. Las dos cosas son CLS.
//
// Las dos variantes existen porque las cards no tienen las mismas filas:
// TitleCard lleva año/duración y puntaje, UpcomingCard lleva fecha de estreno.
export default function CardSkeleton({ variant = "title" }: { variant?: "title" | "upcoming" }) {
  return (
    <div className="card sk-card" aria-hidden="true">
      <div className="card-link">
        <div className="poster sk" />
        <div className="meta">
          <div className="t"><i className="sk sk-l" /><i className="sk sk-l sk-l-short" /></div>
          {/* El espacio duro no es decorativo: `.info` y `.up-date` son bloques
              comunes, así que los márgenes de una barra suelta se colapsan
              hacia afuera y la fila terminaba midiendo 10px contra los 18 de la
              card real. Con un carácter adentro, la fila mide exactamente el
              line-height del texto que reemplaza, sea cual sea, y la barra va
              encima en absolute sin aportar alto. */}
          {variant === "upcoming" ? (
            <div className="up-date sk-row">&nbsp;<i className="sk sk-l" /></div>
          ) : (
            <div className="info sk-row">&nbsp;<i className="sk sk-l" /></div>
          )}
          <div className="logos"><i className="sk sk-l" /></div>
          {variant === "title" && <div className="ratings"><i className="sk sk-l" /></div>}
        </div>
      </div>
    </div>
  );
}
