"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeContext";

const ITEMS = [
  { href: "/", label: "Inicio", match: (p: string) => p === "/", icon: <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /> },
  { href: "/peliculas", label: "Películas", match: (p: string) => p.startsWith("/peliculas"), icon: <><path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 8l2.5-4h3L6 8M9.5 8L12 4h3l-2.5 4M15.5 8L18 4h3" /></> },
  { href: "/series", label: "Series", match: (p: string) => p.startsWith("/series"), icon: <><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M9 21h6" /></> },
  { href: "/buscar", label: "Buscar", match: (p: string) => p.startsWith("/buscar"), icon: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></> },
];

const SUN = (
  <>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </>
);
const MOON = <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />;

export default function BottomNav() {
  const path = usePathname();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <nav className="bottomnav">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={`navitem ${it.match(path) ? "on" : ""}`}>
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
          {it.label}
        </Link>
      ))}
      <button type="button" onClick={toggle} className={`navitem ${dark ? "on" : ""}`}>
        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">{dark ? MOON : SUN}</svg>
        {dark ? "Oscuro" : "Claro"}
      </button>
    </nav>
  );
}
