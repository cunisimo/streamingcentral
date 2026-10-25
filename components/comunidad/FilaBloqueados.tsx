"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { supabaseBrowser } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-base";
import { crearFrontera, tokenDeCuenta } from "@/lib/comunidad/frontera-cuenta";

// La fila "Usuarios bloqueados" de Configuración (E3b). Aparece sólo si las
// reseñas de la comunidad están activas o si la cuenta ya bloqueó a alguien
// (para poder deshacerlo aunque el módulo se apague). Si la consulta falla,
// no se muestra: la página sigue igual que antes de E3b.
// A1: la decisión es de la cuenta actual. Al cambiar de cuenta se oculta,
// se vuelve a consultar con la sesión de la nueva y la respuesta de la
// anterior se descarta.
export default function FilaBloqueados() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [ver, setVer] = useState<{ uid: string } | null>(null);
  useEffect(() => {
    if (!uid) return;
    const frontera = crearFrontera(uid);
    void (async () => {
      try {
        const { data } = await supabaseBrowser().auth.getSession();
        const t = tokenDeCuenta(data.session, uid);
        if (!t) return;
        const r = await fetch(apiUrl("/api/comunidad/bloqueos"), {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ accion: "listar" }),
        });
        const j = r.ok ? ((await r.json()) as { activo?: boolean; bloqueados?: unknown[] }) : null;
        if (frontera.vigente() && j && (j.activo === true || (j.bloqueados?.length ?? 0) > 0)) setVer({ uid });
      } catch { /* sin fila */ }
    })();
    return () => frontera.cerrar();
  }, [uid]);
  // Sólo vale la decisión tomada para la cuenta que está ahora.
  if (!uid || ver?.uid !== uid) return null;
  return (
    <div className="cfg-row">
      <div className="cfg-info">
        <div className="cfg-lbl">Usuarios bloqueados</div>
        <div className="cfg-sub">Personas cuyas reseñas de la comunidad no ves.</div>
      </div>
      <Link href="/cuenta/bloqueados" className="btn ghost">Ver</Link>
    </div>
  );
}
