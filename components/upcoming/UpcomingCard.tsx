"use client";
import Link from "next/link";
import { usePlatforms } from "../PlatformsContext";
import PlatformLogo from "../PlatformLogo";
import QuickAddButton from "../QuickAddButton";
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
      <QuickAddButton id={item.id} tipo={item.type} />
    </div>
  );
}
