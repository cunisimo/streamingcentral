"use client";
import { useMemo } from "react";
import { useAdminSesion } from "@/components/admin/useAdminSesion";
import SabiasQueAdmin, { ErrorApiSq, type ApiSabiasQue } from "@/components/admin/sabias-que/SabiasQueAdmin";
import type { CuriosidadAdmin } from "@/lib/curiosidades-nucleo";

// Panel «¿Sabías que…?». La pantalla vive en
// `components/admin/sabias-que/SabiasQueAdmin.tsx`; acá sólo está el
// transporte: `/api/admin/curiosidades` y `/api/admin-search` con el token del
// admin. Las dos rutas exigen admin + segundo factor (`adminDeToken`) y escriben
// bajo RLS (`is_admin_mfa()`): este guard de cliente es sólo experiencia.

async function json(res: Response) {
  let j: Record<string, unknown> = {};
  try { j = await res.json(); } catch { /* cuerpo vacío o no JSON */ }
  if (!res.ok) {
    throw new ErrorApiSq(String(j.error ?? `error ${res.status}`), res.status,
      (j.errores ?? null) as never, (j.existente ?? null) as CuriosidadAdmin | null);
  }
  return j;
}

export default function AdminSabiasQuePage() {
  const { token, estado } = useAdminSesion();

  const api = useMemo<ApiSabiasQue | null>(() => {
    if (!token) return null;
    const auth = { Authorization: `Bearer ${token}` };
    const post = async (body: unknown) => {
      const j = await json(await fetch("/api/admin/curiosidades", {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
      return j.curiosidad as CuriosidadAdmin;
    };
    return {
      async listar(q, filtro) {
        const u = `/api/admin/curiosidades?estado=${filtro}&q=${encodeURIComponent(q)}`;
        return ((await json(await fetch(u, { headers: auth }))).curiosidades ?? []) as CuriosidadAdmin[];
      },
      async deTitulo(tipo, id) {
        const u = `/api/admin/curiosidades?tipo=${tipo}&id=${id}`;
        return ((await json(await fetch(u, { headers: auth }))).curiosidad ?? null) as CuriosidadAdmin | null;
      },
      crear: (alta) => post({ accion: "crear", ...alta }),
      guardar: (id, campos, publicar) => post({ accion: "guardar", id, campos, publicar }),
      retirar: (id) => post({ accion: "retirar", id }),
      async buscar(q, signal) {
        const j = await json(await fetch(`/api/admin-search?q=${encodeURIComponent(q)}`, { headers: auth, signal }));
        return (j.items ?? []) as never;
      },
    };
  }, [token]);

  if (estado !== "listo" || !api) {
    return <div className="admin"><p className="loading">Verificando el segundo factor…</p></div>;
  }
  return <SabiasQueAdmin api={api} />;
}
