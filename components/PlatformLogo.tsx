import type { PlatformCode } from "@/lib/types";

// Wordmarks provisionales. En producción, podés reemplazar por los logos
// oficiales que entrega TMDB (provider.logo_path) usando <img>.
const LOGOS: Record<PlatformCode, JSX.Element> = {
  n: <span className="lg lg-n">NETFLIX</span>,
  d: <span className="lg lg-d">Disney<sup>+</sup></span>,
  m: <span className="lg lg-m">max</span>,
  p: <span className="lg lg-p"><svg viewBox="0 0 22 10"><path d="M1 7c6 4 14 4 20 0" fill="none" stroke="#00A8E1" strokeWidth="2" strokeLinecap="round" /></svg>prime video</span>,
  pp: <span className="lg lg-pp">Paramount<sup>+</sup></span>,
  at: <span className="lg lg-at"><b>Apple</b>&nbsp;TV+</span>,
  mb: <span className="lg lg-mb">MUBI</span>,
  cr: <span className="lg lg-cr">crunchyroll</span>,
  sp: <span className="lg lg-sp">Star+</span>,
};

export default function PlatformLogo({ code }: { code: PlatformCode }) {
  return LOGOS[code] ?? null;
}
