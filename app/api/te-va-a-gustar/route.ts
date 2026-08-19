import { NextRequest, NextResponse } from "next/server";
import { recomendaciones, MAX_ORIGENES, type Senal } from "@/lib/reco";
import { usuarioDeToken } from "@/lib/supabase";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";
// Enriquece hasta 80 candidatos (1 providersOf cada uno). Con todo cacheado es
// medio segundo; en frío puede irse a varios. No bloquea al Home — se pide
// aparte y después.
export const maxDuration = 60;

// POST y no GET por dos razones. La primera es de tamaño: las exclusiones son
// todo lo que el usuario calificó, listó o vio MÁS lo que ya está en el Home
// (unos 274 títulos), y eso no entra cómodo en una URL. La segunda es de
// higiene: son datos personales y no tienen por qué quedar en logs de acceso ni
// en el historial del navegador.
//
// EL SERVIDOR NO SABE QUIÉN PIDE. No hay sesión acá: el cliente manda sus
// señales y sus exclusiones, porque es el único que puede leerlas (RLS
// `auth.uid() = user_id`). Ver el comentario largo en lib/reco.ts.
interface Cuerpo {
  senales?: { tipo?: string; id?: number; peso?: number }[];
  excluir?: string[];
  providers?: string[];
}

const esTipo = (v: unknown): v is MediaType => v === "movie" || v === "tv";

export async function POST(req: NextRequest) {
  // SESIÓN OBLIGATORIA, y no por privacidad: por costo. El endpoint no lee datos
  // de nadie —las señales las manda quien pide— así que sin autenticar no se
  // filtraba nada. Lo que sí pasaba es que CADA pedido puede disparar hasta 80
  // llamadas a TMDB, y eso en un bucle vacía la cuota. Es el mismo agujero que
  // el `fresh=1` del Home.
  //
  // Hasta acá "solo para conectados" lo cumplía la interfaz, que es una
  // convención y no un límite: la URL se puede pedir a mano.
  //
  // El token viaja en el header y NO se loguea. Del usuario solo se usa que
  // exista; su id no se guarda ni entra en la clave de cache.
  const auth = req.headers.get("authorization");
  const token = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;
  if (!(await usuarioDeToken(token))) {
    return NextResponse.json({ items: [], motivo: "sin-sesion" }, { status: 401 });
  }

  let cuerpo: Cuerpo;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ items: [], motivo: "sin-senales" }, { status: 400 });
  }

  // Saneado explícito: esto viene del cliente y entra directo a claves de cache
  // y a URLs de TMDB. Se descarta lo que no tenga la forma esperada en vez de
  // confiar en que el cliente la respete.
  const senales: Senal[] = (cuerpo.senales ?? [])
    .filter((s) => esTipo(s.tipo) && Number.isInteger(s.id) && (s.peso === 1 || s.peso === 2 || s.peso === 3))
    .map((s) => ({ tipo: s.tipo as MediaType, id: s.id as number, peso: s.peso as 1 | 2 | 3 }))
    // Se corta acá también, no solo en `recomendaciones`: sin esto alguien puede
    // mandar mil señales y hacer trabajar al servidor de más.
    .slice(0, MAX_ORIGENES * 4);

  const excluir = (cuerpo.excluir ?? [])
    .filter((k): k is string => typeof k === "string" && /^(movie|tv):\d+$/.test(k))
    .slice(0, 2000);

  const providers = (cuerpo.providers ?? []).filter((p): p is string => typeof p === "string") as PlatformCode[];

  try {
    const res = await recomendaciones({ senales, excluir, providers });
    return NextResponse.json(res);
  } catch (e) {
    // El riel es opcional por diseño: si falla, se oculta y el Home no se
    // entera. Se loguea el error PERO NUNCA las señales ni las exclusiones —
    // son el historial de una persona.
    console.error("[api/te-va-a-gustar] falló —", e);
    return NextResponse.json({ items: [], motivo: "sin-candidatos" }, { status: 500 });
  }
}
