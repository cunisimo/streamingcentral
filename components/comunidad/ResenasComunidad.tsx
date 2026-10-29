"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/api-base";
import { claveEditor, type Persistida, type Titulo } from "@/lib/comunidad/editor-nucleo";
import { crearFrontera } from "@/lib/comunidad/frontera-cuenta";
import { postear, tokenComo } from "./peticiones";
import { MOTIVOS_CUENTA } from "@/lib/comunidad/mensajes";
import { BLOQUEO_HECHO, DENUNCIA_RECIBIDA } from "@/lib/comunidad/menu-nucleo";
import { ORDEN_INICIAL, type Orden } from "@/lib/comunidad/lectura";
import {
  alLlegarMas, alLlegarReinicio, claveLista, conPrimeraPagina, listaVacia, pedirMas, pedirReinicio, tandaValida, trasDenuncia, trasVoto,
  type EstadoLista,
} from "@/lib/comunidad/lista-nucleo";
import { encabezadoResenas, type ResenaFicha } from "@/lib/resenas";
import type { Voto } from "@/lib/comunidad/evaluacion-nucleo";
import { Acordeon, ResenasYump } from "../ResenasSeccion";
import EditorResena, { type RespuestaEditor } from "./EditorResena";
import EvaluacionResena from "./EvaluacionResena";
import ListaResenas from "./ListaResenas";
import { DialogoDenuncia } from "./MenuResena";
import TerminosComunidad from "./TerminosComunidad";

// Reseñas de la comunidad en la ficha, CON SESIÓN (E5a). La monta
// ResenasAcordeon con `key` por cuenta y título, dentro de la misma sección
// que la reseña de Yump (que va primera).
//
// Todo se pide desde el cliente con Bearer a /api/comunidad/resenas/lista
// (`comunidad_resenas`, con la sesión del lector): nada comunitario viaja en
// el HTML del servidor, en /api/title ni en cachés. La primera página trae
// cinco reseñas, la propia y el estado de la cuenta; "Cargar más" pide de a
// cinco desde el cursor confirmado (lib/comunidad/lista-nucleo.ts).
//
// Cambiar de cuenta o de título monta todo de nuevo (sin borrador, intento,
// aviso, diálogo ni lista del anterior) y descarta las respuestas que lleguen
// tarde (frontera de E3b, lib/comunidad/frontera-cuenta.ts); los pedidos sólo
// salen con la sesión de la cuenta que los inició. Una recarga que falla de la
// MISMA cuenta conserva lo que ya se veía: si vaciara los datos, el editor se
// desmontaría y se perdería el borrador.
//
// Cada reseña ajena tiene su menú (denunciar, bloquear al autor). Al bloquear,
// la lista vuelve a la primera página sin ese autor; queda un aviso con el
// enlace a la cuenta y, si no se denunció, la opción de denunciarla igual.
// Un voto confirmado se aplica sobre la reseña que ya se ve (sin recargar: la
// lista volvería a cinco).
//
// E5b: dos órdenes, "Más útiles" (por defecto, el orden congelado del título)
// y "Recientes". Cambiar de orden vacía la lista y pide la primera página del
// otro; las respuestas del orden anterior se descartan (generación de la carga
// y clave de la lista, que incluye el orden). Si el orden congelado vence
// mientras se lee, la lista avisa "Orden actualizado" y permite volver a
// empezar UNA vez, sin repetir lo que ya se ve.

interface Cabecera {
  activo: boolean;
  publicacion_activa?: boolean;
  terminos?: { vigente: string; aceptada: boolean };
  correo_confirmado?: boolean;
  baja_en_curso?: boolean;
  suspendida?: boolean;
  mia?: { resena_id: number; version_id: number; texto: string; estado: string; utiles: number; total: number } | null;
  total?: number;
}

/** Una página de la lista. null: sin sesión de esta cuenta, red caída o respuesta ilegible. */
async function pedirPagina(uid: string, titulo: Titulo, orden: Orden, cursor: string | null): Promise<{ status: number; j: unknown } | null> {
  try {
    const t = await tokenComo(uid);
    if (!t) return null;
    const q = `tipo=${titulo.tipo}&id=${titulo.tmdbId}&orden=${orden}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await fetch(apiUrl(`/api/comunidad/resenas/lista?${q}`), { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
    return { status: r.status, j: await r.json().catch(() => null) };
  } catch {
    return null;
  }
}

export default function ResenasComunidad({ uid, titulo, yump }: { uid: string; titulo: Titulo; yump: ResenaFicha[] }) {
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  const clave = claveLista(uid, titulo.tipo, titulo.tmdbId, orden);
  const [cab, setCab] = useState<Cabecera | null>(null);
  const [lista, setLista] = useState<EstadoLista>(() => listaVacia(clave));
  const listaRef = useRef(lista);
  listaRef.current = lista;
  const [error, setError] = useState(false);
  const [bloqueo, setBloqueo] = useState<{ versionId: number; denunciada: boolean } | null>(null);
  const [denunciarTras, setDenunciarTras] = useState<number | null>(null);
  const aviso = useRef<HTMLDivElement>(null);
  useEffect(() => { if (bloqueo) aviso.current?.scrollIntoView({ block: "nearest" }); }, [bloqueo]);

  // Las respuestas de esta instancia valen mientras siga montada; las de una
  // carga completa, sólo si es la última.
  const frontera = useMemo(() => crearFrontera(uid), [uid]);
  useEffect(() => { frontera.abrir(); return () => frontera.cerrar(); }, [frontera]);
  const enviar = useCallback((ruta: string, cuerpo: Record<string, unknown>) => postear(uid, ruta, cuerpo), [uid]);

  /** La primera página: cabecera, propia y las cinco primeras. Un fallo conserva lo visible. */
  const cargar = useCallback(async () => {
    if (!frontera.vigente()) return;
    const g = frontera.carga();
    const r = await pedirPagina(uid, titulo, orden, null);
    if (!frontera.vigente(g)) return;
    const j = r?.j as Cabecera | null | undefined;
    if (r?.status === 200 && j && j.activo === false) { setError(false); setCab({ activo: false }); return; }
    const t = r?.status === 200 ? tandaValida(r.j, orden) : null;
    if (!t || !j) { setError(true); return; }
    setError(false);
    setCab({
      activo: true, publicacion_activa: j.publicacion_activa, terminos: j.terminos, correo_confirmado: j.correo_confirmado,
      baja_en_curso: j.baja_en_curso, suspendida: j.suspendida, mia: j.mia ?? null, total: typeof j.total === "number" ? j.total : 0,
    });
    setLista((l) => conPrimeraPagina(l.clave === clave ? l : listaVacia(clave), t));
  }, [frontera, uid, titulo, orden, clave]);

  useEffect(() => { void cargar(); }, [cargar]);

  /** "Cargar más" o su reintento: desde el cursor confirmado; sólo cuenta la respuesta del pedido en curso. */
  const cargarMas = useCallback(async () => {
    if (!frontera.vigente()) return;
    const p = pedirMas(listaRef.current);
    if (!p) return;
    listaRef.current = p.estado;
    setLista(p.estado);
    const r = await pedirPagina(uid, titulo, orden, p.pedido.cursor);
    if (!frontera.vigente()) return;
    const t = r?.status === 200 ? tandaValida(r.j, orden) : null;
    setLista((l) => alLlegarMas(l, p.pedido.n, p.pedido.clave, t));
  }, [frontera, uid, titulo, orden]);

  /** "Volver a empezar" tras "Orden actualizado": una sola vez, sin repetir lo visible. */
  const reiniciar = useCallback(async () => {
    if (!frontera.vigente()) return;
    const p = pedirReinicio(listaRef.current);
    if (!p) return;
    listaRef.current = p.estado;
    setLista(p.estado);
    const r = await pedirPagina(uid, titulo, orden, null);
    if (!frontera.vigente()) return;
    const t = r?.status === 200 ? tandaValida(r.j, orden) : null;
    setLista((l) => alLlegarReinicio(l, p.pedido.n, p.pedido.clave, t));
  }, [frontera, uid, titulo, orden]);

  /** Otro orden: la lista se vacía y se pide su primera página (la carga anterior queda sin valor). */
  const cambiarOrden = useCallback((o: Orden) => {
    if (o === orden) return;
    const nueva = listaVacia(claveLista(uid, titulo.tipo, titulo.tmdbId, o));
    listaRef.current = nueva;
    setLista(nueva);
    setOrden(o);
  }, [orden, uid, titulo]);

  const votar = useCallback(async (versionId: number, voto: Voto | "retirar") => {
    const r = await enviar("/api/comunidad/votos", { version_id: versionId, voto });
    if (frontera.vigente() && r !== "sin-confirmar") setLista((l) => trasVoto(l, versionId, r.resultado, voto));
    return r;
  }, [enviar, frontera]);

  // Con el módulo apagado, la sección es sólo la de Yump (como antes de E5a).
  if (cab && !cab.activo) {
    return yump.length ? <Acordeon titulo={encabezadoResenas(yump.length, null, true)}><ResenasYump resenas={yump} /></Acordeon> : null;
  }
  // Primera carga en curso o fallida sin nada que mostrar: el encabezado sin número.
  const mia: Persistida | null = cab?.mia
    ? { resenaId: cab.mia.resena_id, versionId: cab.mia.version_id, texto: cab.mia.texto, estado: cab.mia.estado }
    : null;
  const comunidad = cab ? (cab.total ?? 0) + (mia ? 1 : 0) : null;
  const avisos = [
    cab?.baja_en_curso && MOTIVOS_CUENTA.baja_en_curso,
    cab?.suspendida && MOTIVOS_CUENTA.suspendida,
    cab && cab.publicacion_activa === false && MOTIVOS_CUENTA.publicacion_pausada,
    cab && cab.correo_confirmado === false && MOTIVOS_CUENTA.correo_pendiente,
  ].filter(Boolean) as string[];

  return (
    <Acordeon titulo={encabezadoResenas(yump.length, comunidad, false)}>
      <ResenasYump resenas={yump} />
      {error && (
        <p className="cm-msg error" role="alert">
          No pudimos cargar las reseñas de la comunidad. <button className="cm-link" onClick={() => void cargar()}>Reintentar</button>
        </p>
      )}
      {!cab && !error && <p className="cm-sub" role="status">Cargando reseñas de la comunidad…</p>}
      {avisos.map((a) => <p key={a} className="cm-msg info" role="status">{a}</p>)}
      {cab && !cab.terminos?.aceptada && !cab.baja_en_curso && (
        <TerminosComunidad aceptar={async (version) => { const r = await enviar("/api/comunidad/terminos", { version }); void cargar(); return r; }} />
      )}
      {cab && (cab.terminos?.aceptada || mia) && (
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
      {mia && cab?.mia && (
        <EvaluacionResena versionId={mia.versionId} utiles={cab.mia.utiles} total={cab.mia.total} miVoto={null} esPropia votar={votar} />
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
      {cab && (
        <ListaResenas lista={lista} orden={orden} cambiarOrden={cambiarOrden} reiniciar={() => void reiniciar()}
          enviar={enviar} votar={votar} cargarMas={() => void cargarMas()}
          alDenunciar={(v) => setLista((l) => trasDenuncia(l, v))}
          alBloquear={(v, denunciada) => { setBloqueo({ versionId: v, denunciada }); void cargar(); }} />
      )}
      {cab && lista.pedido > 0 && !lista.hayMas && !lista.vencido && lista.items.length === 0 && !mia && yump.length === 0 && (
        <p className="cm-sub">Todavía no hay reseñas. {cab.terminos?.aceptada ? "Podés escribir la primera." : ""}</p>
      )}
      {cab && lista.pedido > 0 && !lista.hayMas && !lista.vencido && lista.items.length === 0 && !mia && yump.length > 0 && (
        <p className="cm-sub">Todavía no hay reseñas de la comunidad.</p>
      )}
    </Acordeon>
  );
}
