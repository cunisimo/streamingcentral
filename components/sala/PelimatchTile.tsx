"use client";
import Link from "next/link";
import { SALAS_VISIBLES } from "@/lib/sala/entrada";

// La entrada a Pelimatch en el hub de la cuenta (`components/UserHub.tsx`),
// junto a "Mis amigos" y "Mis emblemas". Mismo TEXTO VISIBLE que la del Home
// —emoji 🍿, "Pelimatch" y la bajada definida por el dueño el 22/09; ya no dice
// la provisoria "Elegir entre varios"— y la misma navegación: MISMA PESTAÑA,
// como el "Ver todas" de los rieles.
export default function PelimatchTile() {
  if (!SALAS_VISIBLES) return null;
  return (
    <Link href="/sala/nueva" className="hub-tile">
      <span className="lock" aria-hidden>🍿</span>
      <span>Pelimatch</span>
      <small>Cada uno vota en su teléfono. Sale una sola película.</small>
    </Link>
  );
}
