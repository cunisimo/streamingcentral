"use client";
import Link from "next/link";
import { usePlatforms } from "../PlatformsContext";
import PlatformLogo from "../PlatformLogo";
import QuickAddButton from "../QuickAddButton";
import RecordarButton from "../RecordarButton";
import { formatReleaseDate } from "./format";
import type { UIUpcoming } from "@/lib/types";

export default function UpcomingCard({ item }: { item: UIUpcoming }) {
  const { platforms } = usePlatforms();
  // Plataforma "principal": si el usuario tiene alguna de las del título, esa;
  // si no, la primera disponible. Puede no haber (provider sin logo interno).
  const mine = item.platforms.filter((p) => platforms.includes(p));
  const main = mine[0] ?? item.platforms[0] ?? null;
  const kind = item.type === "movie" ? "Película" : "Serie";
  const date = formatReleaseDate(item.releaseDate);
  const bg = item.poster ? { backgroundImage: `url(${item.poster})` } : { background: "#3A3A42" };

  return (
    <div className="card">
      <Link
        className="card-link"
        href={`/titulo/${item.type}/${item.id}`}
        aria-label={`${item.title} — ${kind}${date ? `, estreno ${date}` : ""}`}
      >
        <div className="poster" style={bg}>
          <span className="up-badge">{kind}</span>
          {!item.poster && <div className="ptitle">{item.title}</div>}
        </div>
        <div className="meta">
          <div className="t">{item.title}</div>
          {date && <div className="up-date">{date}</div>}
          <div className="logos">
            {main ? <PlatformLogo code={main} /> : <span className="more">—</span>}
          </div>
        </div>
      </Link>
      {/* "Mi lista" sólo si el título va a estar en una plataforma que tenés:
          agendarse algo que no vas a poder ver es la promesa equivocada. El
          recordatorio, en cambio, va siempre — si NO la tenés, es justamente el
          aviso que te da tiempo a suscribirte. Cuando es el único botón sube al
          lugar del "+", así no queda un hueco arriba. */}
      {mine.length > 0 && <QuickAddButton id={item.id} tipo={item.type} />}
      {/* Misma protección que la ficha, pero acá NO hay con qué chequear: el
          payload de la agenda sale de `upcoming_content`, que guarda la fecha
          que trajo el sync y no la digital argentina. Sin poder validarla, en
          películas no se ofrece agendar. Es deliberadamente conservador y es
          temporal: lo levanta el issue #5, que decide qué fecha muestra
          "Próximamente". Hoy no oculta nada — la agenda son 41 series. */}
      {item.type !== "movie" && <RecordarButton
        id={item.id}
        tipo={item.type}
        titulo={item.title}
        fecha={item.releaseDate}
        plataforma={main}
        variant="icono"
        solo={mine.length === 0}
      />}
    </div>
  );
}
