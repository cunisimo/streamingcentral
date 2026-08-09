"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthContext";
import Avatar from "./avatar/Avatar";

const ITEMS = [
  { href: "/", label: "Inicio", match: (p: string) => p === "/", icon: <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /> },
  { href: "/top", label: "Top", match: (p: string) => p.startsWith("/top"), icon: <><path d="M6 20V10" /><path d="M12 20V4" /><path d="M18 20v-7" /></> },
  { href: "/buscar", label: "Buscador", match: (p: string) => p.startsWith("/buscar"), icon: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></> },
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
        Mi cuenta
      </Link>
    </nav>
  );
}
