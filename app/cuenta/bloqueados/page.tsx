"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/components/AuthContext";
import { supabaseBrowser } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-base";
import { crearFrontera, tokenDeCuenta } from "@/lib/comunidad/frontera-cuenta";
import { etiquetaBloqueo, mensajeBloqueo, ofreceReintento, type Tono } from "@/lib/comunidad/menu-nucleo";

// Usuarios bloqueados en las reseñas de la comunidad (E3b, fila D). Lista los
// bloqueos propios y permite desbloquear con confirmación. Funciona aunque el
// módulo esté apagado: deshacer un bloqueo nunca se impide. Hasta E6 no hay
// nombres comunitarios, así que cada bloqueo se reconoce por el título desde
// el que se hizo (si TMDB no responde, "una película" / "una serie") y la
// fecha. Nada de esto muestra correos ni datos privados.
//
// A1 (auditoría de E3b): la lista, los títulos, los mensajes y la
// confirmación viven en una instancia por cuenta (`key={uid}`). Cambiar de
// cuenta o cerrar sesión la desmonta; una lectura o un desbloqueo que vuelve
// tarde se descarta (`frontera`), y una carga vieja no pisa a una nueva. Una
// recarga fallida de la MISMA cuenta conserva la lista que ya se veía.
interface Bloqueo { bloqueo_id: number; creado_en: string; origen_tipo: "movie" | "tv" | null; origen_tmdb_id: number | null }

async function pedir(uid: string, cuerpo: Record<string, unknown>): Promise<Record<string, unknown> | "sin-confirmar"> {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    const t = tokenDeCuenta(data.session, uid);
    if (!t) return { resultado: "sin_sesion" };
    const r = await fetch(apiUrl("/api/comunidad/bloqueos"), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => null);
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : "sin-confirmar";
  } catch {
    return "sin-confirmar";
  }
}

export default function BloqueadosPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);

  if (!ready || !user) {
    return (<><TopBar /><main><div className="admin"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  }
  return <BloqueadosDeCuenta key={user.id} uid={user.id} />;
}

function BloqueadosDeCuenta({ uid }: { uid: string }) {
  const [lista, setLista] = useState<Bloqueo[] | null>(null);
  const [error, setError] = useState(false);
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState<Bloqueo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tono: Tono; texto: string } | null>(null);

  const frontera = useMemo(() => crearFrontera(uid), [uid]);
  useEffect(() => { frontera.abrir(); return () => frontera.cerrar(); }, [frontera]);

  const cargar = useCallback(async () => {
    if (!frontera.vigente()) return;
    const g = frontera.carga();
    setError(false);
    const r = await pedir(uid, { accion: "listar" });
    if (!frontera.vigente(g)) return;
    if (r === "sin-confirmar" || !Array.isArray(r.bloqueados)) { setError(true); return; }
    const l = r.bloqueados as Bloqueo[];
    setLista(l);
    const items = [...new Set(l.filter((b) => b.origen_tipo && b.origen_tmdb_id).map((b) => `${b.origen_tipo}:${b.origen_tmdb_id}`))];
    if (!items.length) return;
    try {
      const c = await fetch(apiUrl(`/api/cards?items=${items.join(",")}`));
      const j = c.ok ? ((await c.json()) as { items?: { type?: string; id?: number; title?: string }[] }) : null;
      if (!frontera.vigente(g)) return;
      setTitulos(Object.fromEntries((j?.items ?? []).filter((x) => x.title).map((x) => [`${x.type}:${x.id}`, x.title as string])));
    } catch { /* sin títulos: se muestra "una película" / "una serie" */ }
  }, [frontera, uid]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function desbloquear(b: Bloqueo) {
    if (enviando) return;
    setEnviando(true);
    setMsg(null);
    const r = await pedir(uid, { accion: "desbloquear", bloqueo_id: b.bloqueo_id });
    if (!frontera.vigente()) return;
    setEnviando(false);
    const m = mensajeBloqueo(r === "sin-confirmar" ? r : (r as { resultado?: unknown }));
    setMsg(m);
    if (!ofreceReintento(m.tono)) { setConfirmar(null); void cargar(); }
  }

  return (
    <>
      <TopBar />
      <main>
        <div className="admin" style={{ maxWidth: 480 }}>
          <Link href="/cuenta/configuracion" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
          <h1>Usuarios bloqueados</h1>
          <p className="cm-sub">No ves las reseñas de la comunidad de estas personas. No se les avisa. Si desbloqueás a alguien, vas a volver a ver sus reseñas.</p>
          {msg && !confirmar && <p className={`cm-msg ${msg.tono}`} role="status">{msg.texto}</p>}
          {error && (
            <p className="cm-msg error" role="alert">
              No pudimos cargar la lista. <button className="cm-link" onClick={() => void cargar()}>Reintentar</button>
            </p>
          )}
          {!lista && !error && <p className="loading">Cargando…</p>}
          {lista && lista.length === 0 && <p className="cm-sub">No bloqueaste a nadie.</p>}
          {lista && lista.length > 0 && (
            <ul className="cm-bloqueados">
              {lista.map((b) => (
                <li key={b.bloqueo_id} className="cfg-row">
                  <div className="cfg-info">
                    <div className="cfg-lbl">{etiquetaBloqueo(b, titulos[`${b.origen_tipo}:${b.origen_tmdb_id}`])}</div>
                  </div>
                  <button className="btn ghost" onClick={() => { setMsg(null); setConfirmar(b); }}>Desbloquear</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomNav />

      {confirmar && (
        <div className="dlg-backdrop" onClick={() => setConfirmar(null)} role="presentation">
          <div className="dlg" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cm-dbq-t"
            onKeyDown={(ev) => { if (ev.key === "Escape") setConfirmar(null); }}>
            <h2 id="cm-dbq-t">Desbloquear</h2>
            <p className="dlg-sub">Vas a volver a ver las reseñas de esta persona.</p>
            {msg && <p className={`cm-msg ${msg.tono}`} role="alert">{msg.texto}</p>}
            <div className="dlg-acciones">
              <button className="btn ghost" autoFocus onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn" disabled={enviando} onClick={() => void desbloquear(confirmar)}>
                {enviando ? "Desbloqueando…" : msg && ofreceReintento(msg.tono) ? "Reintentar" : "Desbloquear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
