"use client";
import Link from "next/link";
import { SALAS_VISIBLES } from "@/lib/sala/entrada";
import { ES_NATIVO } from "@/lib/plataforma";

// La entrada a **Yumpeá** en el hub de la cuenta (`components/UserHub.tsx`),
// junto a "Mis amigos" y "Mis emblemas". Mismo TEXTO VISIBLE que la del Home
// —emoji 🍿, "Yumpeá" (26/09; antes "Pelimatch") y la misma bajada— y la misma
// navegación: MISMA PESTAÑA, como el "Ver todas" de los rieles.
//
// Acá NO va botón: la tarjeta entera es el enlace que se toca. El nombre del
// archivo y del componente no se renombran por un cambio de rótulo.
//
// La bajada, sólo en navegador de escritorio (28/09): igual que en el banner
// del Home (`.sala-bajada`). El "Próximamente" de los otros tiles no se toca.
export default function PelimatchTile() {
  if (!SALAS_VISIBLES) return null;
  return (
    <Link href="/sala/nueva" className="hub-tile">
      <span className="lock" aria-hidden>🍿</span>
      <span>Yumpeá</span>
      {!ES_NATIVO && <small className="sala-bajada">Cada uno vota en su teléfono. Sale una sola película.</small>}
    </Link>
  );
}
