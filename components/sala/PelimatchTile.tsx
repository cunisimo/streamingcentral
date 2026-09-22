"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SALAS_VISIBLES } from "@/lib/sala/entrada";
import { atributosEnlace, contextoDelNavegador } from "@/lib/sala/apertura";
import { ES_NATIVO } from "@/lib/plataforma";

// La entrada a Pelimatch en el hub de la cuenta (`components/UserHub.tsx`),
// junto a "Mis amigos" y "Mis emblemas". Mismo nombre visible y la misma
// apertura en pestaña nueva que la del Home (ver components/sala/CrearSalaEntrada.tsx
// y lib/sala/apertura.ts). La bajada es PROVISORIA.
export default function PelimatchTile() {
  const [attrs, setAttrs] = useState<{ target?: "_blank"; rel?: string }>({});
  useEffect(() => { setAttrs(atributosEnlace(contextoDelNavegador(ES_NATIVO))); }, []);
  if (!SALAS_VISIBLES) return null;
  return (
    <Link href="/sala/nueva" className="hub-tile" {...attrs}>
      <span className="lock" aria-hidden>🍿</span>
      <span>Pelimatch</span>
      <small>Elegir entre varios</small>
    </Link>
  );
}
