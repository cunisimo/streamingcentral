"use client";
import Link from "next/link";
import { SALAS_VISIBLES } from "@/lib/sala/entrada";

// La entrada a Pelimatch en el hub de la cuenta (`components/UserHub.tsx`),
// junto a "Mis amigos" y "Mis emblemas". Mismo nombre visible que la del Home
// (components/sala/CrearSalaEntrada.tsx) y la misma navegación: MISMA PESTAÑA,
// como el "Ver todas" de los rieles. La bajada es PROVISORIA.
export default function PelimatchTile() {
  if (!SALAS_VISIBLES) return null;
  return (
    <Link href="/sala/nueva" className="hub-tile">
      <span className="lock" aria-hidden>🍿</span>
      <span>Pelimatch</span>
      <small>Elegir entre varios</small>
    </Link>
  );
}
