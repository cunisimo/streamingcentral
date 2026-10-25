"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { supabaseBrowser } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-base";
import { claveEditor, type Persistida, type Titulo } from "@/lib/comunidad/editor-nucleo";
import { crearFrontera, tokenDeCuenta } from "@/lib/comunidad/frontera-cuenta";
import { MOTIVOS_CUENTA } from "@/lib/comunidad/mensajes";
import { BLOQUEO_HECHO, DENUNCIA_RECIBIDA } from "@/lib/comunidad/menu-nucleo";
import type { Voto } from "@/lib/comunidad/evaluacion-nucleo";
import EditorResena, { type RespuestaEditor } from "./EditorResena";
import EvaluacionResena from "./EvaluacionResena";
import MenuResena, { DialogoDenuncia } from "./MenuResena";
import TerminosComunidad from "./TerminosComunidad";

// Reseñas de la comunidad en la ficha (E3a, interfaz LOCAL). Todo se pide
// desde el cliente con Bearer: nada comunitario viaja en el HTML del servidor
// ni en cachés. Sin sesión, o con el módulo apagado (`activo: false`), no se
// dibuja nada.
//
// La lectura es la PROVISIONAL de E3a (/api/comunidad/titulo): la propia y las
// publicadas de otros. E5a la reemplaza (bloqueos, suspensiones, orden,
// paginación). Arranca cerrada, como el acordeón de reseñas: puede haber
// spoilers. Cambiar de cuenta o de título monta todo de nuevo (sin borrador,
// intento, aviso ni diálogo del anterior) y descarta las respuestas que
// lleguen tarde (A1 de E3b, lib/comunidad/frontera-cuenta.ts); los pedidos
// sólo salen con la sesión de la cuenta que los inició. Una recarga que falla
// de la MISMA cuenta conserva lo que ya se veía: si vaciara los
// datos, el editor se desmontaría y se perdería el borrador (A2).
//
// E3b: cada reseña ajena tiene su menú (denunciar, bloquear al autor). Al
// bloquear, la lectura ya no trae las reseñas de ese autor; queda un aviso con
// el enlace a la cuenta y, si no se denunció, la opción de denunciarla igual.
interface Otra { resena_id: number; version_id: number; texto: string; utiles: number; total: number; mi_voto: Voto | null; denunciada?: boolean }
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

/** El token, sólo si la sesión sigue siendo de `uid` (A1). */
async function tokenComo(uid: string): Promise<string | null> {
  const { data } = await supabaseBrowser().auth.getSession();
  return tokenDeCuenta(data.session, uid);
}

/** POST a una ruta comunitaria en nombre de `uid`. Red caída o respuesta ilegible: "sin-confirmar". */
async function postear(uid: string, ruta: string, cuerpo: Record<string, unknown>): Promise<RespuestaEditor> {
  try {
    const t = await tokenComo(uid);
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
  // A1: todo el estado (datos, aviso de bloqueo, diálogos, mensajes) vive
  // dentro de una instancia por cuenta y título; cambiar de cuenta o cerrar
  // sesión la desmonta y no se traslada nada.
  if (!uid) return null;
  return <ResenasDeCuenta key={claveEditor(uid, titulo)} uid={uid} titulo={titulo} />;
}

function ResenasDeCuenta({ uid, titulo }: { uid: string; titulo: Titulo }) {
  const [datos, setDatos] = useState<DatosTitulo | null>(null);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const panel = useId();
  const [bloqueo, setBloqueo] = useState<{ versionId: number; denunciada: boolean } | null>(null);
  const [denunciarTras, setDenunciarTras] = useState<number | null>(null);
  const aviso = useRef<HTMLDivElement>(null);
  useEffect(() => { if (bloqueo) aviso.current?.scrollIntoView({ block: "nearest" }); }, [bloqueo]);

  // Las respuestas de esta instancia valen mientras siga montada; las de una
  // carga, sólo si es la última (A1).
  const frontera = useMemo(() => crearFrontera(uid), [uid]);
  useEffect(() => { frontera.abrir(); return () => frontera.cerrar(); }, [frontera]);
  const enviar = useCallback((ruta: string, cuerpo: Record<string, unknown>) => postear(uid, ruta, cuerpo), [uid]);

  const cargar = useCallback(async () => {
    if (!frontera.vigente()) return;
    const g = frontera.carga();
    try {
      const t = await tokenComo(uid);
      if (!t) return; // la sesión ya es de otra cuenta: esta instancia se va a desmontar
      const r = await fetch(apiUrl(`/api/comunidad/titulo?tipo=${titulo.tipo}&id=${titulo.tmdbId}`), {
        headers: { Authorization: `Bearer ${t}` }, cache: "no-store",
      });
      const j = r.ok ? ((await r.json()) as DatosTitulo) : null;
      if (!frontera.vigente(g)) return;
      setError(!j);
      if (j) setDatos(j);
    } catch {
      if (frontera.vigente(g)) setError(true);
    }
  }, [frontera, uid, titulo.tipo, titulo.tmdbId]);

  useEffect(() => { void cargar(); }, [cargar]);

  if ((!datos && !error) || (datos && !datos.activo)) return null;

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
    const r = await enviar("/api/comunidad/votos", { version_id: versionId, voto });
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
            <TerminosComunidad aceptar={async (version) => { const r = await enviar("/api/comunidad/terminos", { version }); void cargar(); return r; }} />
          )}
          {datos && (datos.terminos?.aceptada || mia) && (
            <EditorResena
              key={claveEditor(uid, titulo)}
              titulo={titulo}
              mia={mia}
              enviar={(cuerpo) => enviar("/api/comunidad/resenas", cuerpo)}
              pedirRevision={(cuerpo) => enviar("/api/comunidad/revision", cuerpo)}
              borrar={(resenaId) => enviar("/api/comunidad/resenas/borrar", { resena_id: resenaId })}
              recargar={() => void cargar()}
            />
          )}
          {mia && datos?.mia && (
            <EvaluacionResena versionId={mia.versionId} utiles={datos.mia.utiles} total={datos.mia.total} miVoto={null} esPropia votar={votar} />
          )}
          {bloqueo && (
            <div ref={aviso} className="cm-msg exito" role="status">
              {bloqueo.denunciada && <>{DENUNCIA_RECIBIDA} </>}{BLOQUEO_HECHO}{" "}
              <Link className="cm-link" href="/cuenta/bloqueados">Gestionar bloqueados</Link>
              {!bloqueo.denunciada && <> · <button className="cm-link" onClick={() => setDenunciarTras(bloqueo.versionId)}>Denunciar la reseña</button></>}
            </div>
          )}
          {denunciarTras !== null && (
            <DialogoDenuncia versionId={denunciarTras} enviar={enviar} ofrecerBloqueo={false} cerrar={() => setDenunciarTras(null)}
              alTerminar={({ denunciada }) => { if (denunciada) setBloqueo((b) => (b ? { ...b, denunciada: true } : b)); }} />
          )}
          {otras.map((o) => (
            <article key={o.version_id} className="review usuario">
              <div className="cm-cab">
                <div className="badge">Reseña de la comunidad</div>
                <MenuResena versionId={o.version_id} denunciada={o.denunciada === true} enviar={enviar}
                  alDenunciar={() => void cargar()}
                  alBloquear={({ denunciada }) => { setBloqueo({ versionId: o.version_id, denunciada }); void cargar(); }} />
              </div>
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
