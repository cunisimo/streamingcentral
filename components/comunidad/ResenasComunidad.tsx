"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { supabaseBrowser } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-base";
import { claveEditor, respuestaVigente, type Persistida, type Titulo } from "@/lib/comunidad/editor-nucleo";
import { MOTIVOS_CUENTA } from "@/lib/comunidad/mensajes";
import type { Voto } from "@/lib/comunidad/evaluacion-nucleo";
import EditorResena, { type RespuestaEditor } from "./EditorResena";
import EvaluacionResena from "./EvaluacionResena";
import TerminosComunidad from "./TerminosComunidad";

// Reseñas de la comunidad en la ficha (E3a, interfaz LOCAL). Todo se pide
// desde el cliente con Bearer: nada comunitario viaja en el HTML del servidor
// ni en cachés. Sin sesión, o con el módulo apagado (`activo: false`), no se
// dibuja nada.
//
// La lectura es la PROVISIONAL de E3a (/api/comunidad/titulo): la propia y las
// publicadas de otros. E5a la reemplaza (bloqueos, suspensiones, orden,
// paginación). Arranca cerrada, como el acordeón de reseñas: puede haber
// spoilers. Cambiar de cuenta descarta las respuestas de la anterior, y el
// editor se monta de nuevo por cuenta y título (sin borrador ni intento del
// anterior). Una recarga que falla conserva lo que ya se veía: si vaciara los
// datos, el editor se desmontaría y se perdería el borrador (A2).
interface Otra { resena_id: number; version_id: number; texto: string; utiles: number; total: number; mi_voto: Voto | null }
interface DatosTitulo {
  activo: boolean;
  publicacion_activa?: boolean;
  terminos?: { vigente: string; aceptada: boolean };
  correo_confirmado?: boolean;
  baja_en_curso?: boolean;
  suspendida?: boolean;
  mia?: { resena_id: number; version_id: number; texto: string; estado: string; utiles: number; total: number } | null;
  otras?: Otra[];
}

async function token(): Promise<string | null> {
  const { data } = await supabaseBrowser().auth.getSession();
  return data.session?.access_token ?? null;
}

/** POST a una ruta comunitaria. Red caída o respuesta ilegible: "sin-confirmar". */
async function postear(ruta: string, cuerpo: Record<string, unknown>): Promise<RespuestaEditor> {
  try {
    const t = await token();
    if (!t) return { resultado: "sin_sesion" };
    const r = await fetch(apiUrl(ruta), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => null);
    return j && typeof j === "object" && typeof (j as { resultado?: unknown }).resultado === "string" ? (j as Record<string, unknown>) : "sin-confirmar";
  } catch {
    return "sin-confirmar";
  }
}

export default function ResenasComunidad({ titulo }: { titulo: Titulo }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [datos, setDatos] = useState<DatosTitulo | null>(null);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const gen = useRef(0);
  const panel = useId();

  const cargar = useCallback(async () => {
    const mia = { gen: ++gen.current, uid };
    if (!uid) { setDatos(null); return; }
    try {
      const t = await token();
      const r = await fetch(apiUrl(`/api/comunidad/titulo?tipo=${titulo.tipo}&id=${titulo.tmdbId}`), {
        headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: "no-store",
      });
      const j = r.ok ? ((await r.json()) as DatosTitulo) : null;
      if (!respuestaVigente({ gen: gen.current, uid }, mia)) return;
      setError(!j);
      if (j) setDatos(j);
    } catch {
      if (respuestaVigente({ gen: gen.current, uid }, mia)) setError(true);
    }
  }, [uid, titulo.tipo, titulo.tmdbId]);

  useEffect(() => { setDatos(null); void cargar(); }, [cargar]);

  if (!uid || (!datos && !error) || (datos && !datos.activo)) return null;

  const mia: Persistida | null = datos?.mia
    ? { resenaId: datos.mia.resena_id, versionId: datos.mia.version_id, texto: datos.mia.texto, estado: datos.mia.estado }
    : null;
  const otras = datos?.otras ?? [];
  const avisos = [
    datos?.baja_en_curso && MOTIVOS_CUENTA.baja_en_curso,
    datos?.suspendida && MOTIVOS_CUENTA.suspendida,
    datos && datos.publicacion_activa === false && MOTIVOS_CUENTA.publicacion_pausada,
    datos && datos.correo_confirmado === false && MOTIVOS_CUENTA.correo_pendiente,
  ].filter(Boolean) as string[];

  const votar = async (versionId: number, voto: Voto | "retirar") => {
    const r = await postear("/api/comunidad/votos", { version_id: versionId, voto });
    void cargar();
    return r;
  };

  return (
    <section className={`resenas cm${abierto ? " abierto" : ""}`}>
      <button type="button" className="resenas-cab" aria-expanded={abierto} aria-controls={panel} onClick={() => setAbierto((a) => !a)}>
        <span className="resenas-textos">
          <span className="resenas-t">RESEÑAS DE LA COMUNIDAD · {otras.length + (mia ? 1 : 0)}</span>
          <span className="resenas-sub">Cuidado, puede contener spoilers.</span>
        </span>
        <svg className="resenas-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {abierto && (
        <div id={panel} className="resenas-ventana" role="region" aria-label="Reseñas de la comunidad">
          {error && (
            <p className="cm-msg error" role="alert">
              No pudimos cargar las reseñas. <button className="cm-link" onClick={() => void cargar()}>Reintentar</button>
            </p>
          )}
          {avisos.map((a) => <p key={a} className="cm-msg info" role="status">{a}</p>)}
          {datos && !datos.terminos?.aceptada && !datos.baja_en_curso && (
            <TerminosComunidad aceptar={async (version) => { const r = await postear("/api/comunidad/terminos", { version }); void cargar(); return r; }} />
          )}
          {datos && (datos.terminos?.aceptada || mia) && (
            <EditorResena
              key={claveEditor(uid, titulo)}
              titulo={titulo}
              mia={mia}
              enviar={(cuerpo) => postear("/api/comunidad/resenas", cuerpo)}
              borrar={(resenaId) => postear("/api/comunidad/resenas/borrar", { resena_id: resenaId })}
              recargar={() => void cargar()}
            />
          )}
          {mia && datos?.mia && (
            <EvaluacionResena versionId={mia.versionId} utiles={datos.mia.utiles} total={datos.mia.total} miVoto={null} esPropia votar={votar} />
          )}
          {otras.map((o) => (
            <article key={o.version_id} className="review usuario">
              <div className="badge">Reseña de la comunidad</div>
              <p>{o.texto}</p>
              <EvaluacionResena versionId={o.version_id} utiles={o.utiles} total={o.total} miVoto={o.mi_voto} esPropia={false} votar={votar} />
            </article>
          ))}
          {datos && otras.length === 0 && !mia && <p className="cm-sub">Todavía no hay reseñas de la comunidad para este título.</p>}
        </div>
      )}
    </section>
  );
}
