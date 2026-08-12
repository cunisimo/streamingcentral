import { NextRequest, NextResponse } from "next/server";
import { getRoulettePicks, esEscenario, ESCENARIO_DEFAULT } from "@/lib/roulette";
import type { PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  // El gate importa: la función de la base NO valida el escenario. Un valor
  // viejo o inventado cae en su `else true` y devuelve el pool sin filtrar,
  // sin error — o sea, una recomendación que no respeta lo que el usuario pidió.
  const escenarioRaw = q.get("escenario") ?? ESCENARIO_DEFAULT;
  const escenario = esEscenario(escenarioRaw) ? escenarioRaw : ESCENARIO_DEFAULT;
  const providers = (q.get("providers") || "")
    .split(",").map((s) => s.trim()).filter(Boolean) as PlatformCode[];
  // `.filter(Boolean)` antes de `Number(...)`: sin él, `?excluir=` (vacío)
  // produce `[""]` → `[0]`, un id que no es de nadie pero igual viaja a la
  // RPC. Y `Number.isInteger` en vez de `Number.isFinite`: `p_excluir` es
  // `integer[]` en Postgres, así que un decimal como `?excluir=1.5` pasaba el
  // filtro viejo y la RPC volaba con 500. El cliente nunca manda ninguno de
  // los dos, pero la ruta es pública.
  const excluir = (q.get("excluir") || "")
    .split(",").map((s) => s.trim()).filter(Boolean)
    .map(Number).filter(Number.isInteger);

  try {
    const { picks, total } = await getRoulettePicks({ escenario, providers, excluir });
    return NextResponse.json({ picks, total });
  } catch (e) {
    return NextResponse.json({ error: String(e), picks: [], total: 0 }, { status: 500 });
  }
}
