"use client";
import { useMemo } from "react";
import { useAdminSesion } from "@/components/admin/useAdminSesion";
import TopEditor from "@/components/admin/top/TopEditor";
import { cuerpoDe } from "@/lib/top-editor-nucleo";
import { ErrorTop, type TransporteTop } from "@/lib/top-transporte";

// El dashboard del Top semanal. La pantalla vive en
// `components/admin/top/TopEditor.tsx`; acá sólo está el TRANSPORTE real: las
// llamadas a `/api/admin/top` y `/api/admin-search` con el token del admin.
//
// El contador de preparación ("X de 12 publicados") sale de `preparacion()`
// sobre lo que devuelve cada respuesta de `/api/admin/top`: no se vuelve a leer
// la ruta pública del Top (ver lib/top-manual-blindaje.test.ts).
//
// Va separado para que el MISMO editor se pueda montar con el banco en memoria
// (`app/revision-local/top`) y probarse sin tocar la base de Producción.

async function json(res: Response) {
  let j: Record<string, unknown> = {};
  try { j = await res.json(); } catch { /* cuerpo vacío o no JSON */ }
  if (!res.ok) {
    throw new ErrorTop(String(j.error ?? `error ${res.status}`), res.status === 409);
  }
  return j;
}

export default function AdminTopPage() {
  const { token, estado } = useAdminSesion();

  const transporte = useMemo<TransporteTop | null>(() => {
    if (!token) return null;
    const auth = { Authorization: `Bearer ${token}` };
    const post = async (body: unknown) => json(await fetch("/api/admin/top", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    return {
      async leer() {
        const j = await json(await fetch("/api/admin/top", { headers: auth }));
        return { borradores: (j.borradores ?? []) as never, publicados: (j.publicados ?? []) as string[] };
      },
      async escribir(op) {
        const j = await post(cuerpoDe(op));
        return { borradores: (j.borradores ?? []) as never, publicados: (j.publicados ?? []) as string[] };
      },
      async publicar(ids) {
        const j = await post({ accion: "publicar", ids });
        return {
          resultados: (j.resultados ?? []) as never,
          borradores: (j.borradores ?? []) as never,
          publicados: (j.publicados ?? []) as string[],
        };
      },
      async buscar(q, tipo, plataforma, signal) {
        const url = `/api/admin-search?q=${encodeURIComponent(q)}&tipo=${tipo}&plataforma=${plataforma}`;
        const j = await json(await fetch(url, { headers: auth, signal }));
        return (j.items ?? []) as never;
      },
    };
  }, [token]);

  if (estado !== "listo" || !transporte) {
    return <div className="admin"><p className="loading">Verificando el segundo factor…</p></div>;
  }
  return <TopEditor transporte={transporte} />;
}
