import { notFound } from "next/navigation";
import { bancoTopHabilitado } from "@/lib/top-revision-local";
import BancoTopCliente from "./BancoTopCliente";

// 🔴 BANCO LOCAL DEL EDITOR DEL TOP, no es producto. Monta el MISMO editor que
// `/admin/top` (components/admin/top/TopEditor.tsx) con una base en memoria
// (lib/banco-top.ts) en vez de Supabase: sin login, sin MFA y sin tocar la base
// de Producción. Sirve para probar arrastre, aprobación, búsqueda, fallos de
// guardado y respuestas tardías.
//
// Responde 404 salvo que se cumplan LAS DOS cosas: no es un build de producción
// y `TOP_REVISION_LOCAL=1`. Tampoco viaja en el artefacto Android
// (`revision-local` está en APP_FUERA de scripts/build-capacitor.mjs). Un test
// fija las dos guardas.
export const dynamic = "force-dynamic";

export default function BancoTop() {
  if (!bancoTopHabilitado()) notFound();
  return <BancoTopCliente />;
}
