"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthContext";
import Avatar from "./avatar/Avatar";

const ITEMS = [
  { href: "/", label: "Inicio", match: (p: string) => p === "/", icon: <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /> },
  { href: "/series", label: "Series", match: (p: string) => p.startsWith("/series"), icon: <><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M9 21h6" /></> },
  { href: "/peliculas", label: "Películas", match: (p: string) => p.startsWith("/peliculas"), icon: <><path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 8l2.5-4h3L6 8M9.5 8L12 4h3l-2.5 4M15.5 8L18 4h3" /></> },
  { href: "/cuenta/lista", label: "Mi lista", match: (p: string) => p.startsWith("/cuenta/lista"), icon: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /> },
];

export default function BottomNav() {
  const path = usePathname();
  const { user, profile } = useAuth();
  // "Mi lista" es /cuenta/lista, así que Cuenta sólo se marca activo en /cuenta
  // y sus subrutas que no sean /cuenta/lista (perfil, configuracion, gustaron…).
  const cuentaOn = path.startsWith("/cuenta") && !path.startsWith("/cuenta/lista");

  return (
    <nav className="bottomnav">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={`navitem ${it.match(path) ? "on" : ""}`}>
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
          {it.label}
        </Link>
      ))}
      <Link href="/cuenta" className={`navitem ${cuentaOn ? "on" : ""}`}>
        {user ? (
          <Avatar seed={profile?.avatar_seed || user.id} style={profile?.avatar_style} size={25} className="navav" />
        ) : (
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
        )}
        Cuenta
      </Link>
    </nav>
  );
}
