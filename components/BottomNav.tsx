"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Inicio", match: (p: string) => p === "/", icon: <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /> },
  { href: "/peliculas", label: "Películas", match: (p: string) => p.startsWith("/peliculas"), icon: <><path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 8l2.5-4h3L6 8M9.5 8L12 4h3l-2.5 4M15.5 8L18 4h3" /></> },
  { href: "/series", label: "Series", match: (p: string) => p.startsWith("/series"), icon: <><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M9 21h6" /></> },
  { href: "/buscar", label: "Buscar", match: (p: string) => p.startsWith("/buscar"), icon: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></> },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottomnav">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={`navitem ${it.match(path) ? "on" : ""}`}>
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
