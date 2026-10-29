"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { useAdminSesion } from "@/components/admin/useAdminSesion";
import { supabaseBrowser } from "@/lib/supabase";
import { crearFrontera, tokenDeCuenta } from "@/lib/comunidad/frontera-cuenta";
import {
  ETIQUETA_ACCION, MOTIVO_MAX, SITUACION, accionesDenuncia, accionesRetenido, accionesRetirada, codigoParticipante,
  efectoDecision, etiquetaCategoria, fechaAR, mensajeModeracion, motivoNoRestaurable, normalizarMotivo, reintentable,
  type AccionVersion, type Tono, type Vista,
} from "@/lib/comunidad/admin-nucleo";

// Moderación de las reseñas de la comunidad (E4), dentro del dashboard.
//
// Lo que ordena esta pantalla:
//   - DOS colas separadas: retenidos (guardados e invisibles, a decidir) y
//     denuncias (casos sobre contenido, agrupados por versión). Más Cuentas
//     (suspensiones vigentes y bajas pendientes) y el Registro.
//   - Retirar resuelve las denuncias y la versión sale de las dos colas: la
//     pestaña Retiradas y "Ver situación actual" del Registro la vuelven a
//     encontrar para restaurarla (A1 de la auditoría de E4). La base relee
//     con todo bloqueado: una versión reemplazada, borrada o de una cuenta
//     dada de baja no vuelve.
//   - Cada decisión pide motivo y muestra su efecto antes de confirmar. Va
//     atada a UNA versión: si cambió, la base no aplica nada y lo dice.
//   - Una respuesta perdida dice "No sabemos si se aplicó" y ofrece reintentar
//     con el MISMO intento: la base no duplica la decisión ni el registro.
//   - Todo vive en una instancia por cuenta (`key={uid}`) con la frontera de
//     E3b: al cambiar de cuenta o cerrar sesión no queda nada de la anterior y
//     sus respuestas tardías se descartan; los pedidos sólo salen con la
//     sesión de la cuenta que los inició.
// 🔴 Este guard es experiencia de usuario: quien rechaza de verdad es la API
// (`adminDeToken`) y la base (`is_admin_mfa()` en cada función).

type Pestana = "retenidos" | "denuncias" | "retiradas" | "cuentas" | "registro";
type J = Record<string, unknown>;
type Lista = { items: J[]; despues: J | null; antes: number | null; hayMas: boolean; cargando: boolean; error: boolean; total?: number };
type Msg = { tono: Tono; texto: string } | null;
type Dialogo =
  | { tipo: "decidir"; accion: AccionVersion; item: J }
  | { tipo: "suspender"; participante: string }
  | { tipo: "levantar"; participante: string }
  | { tipo: "quitar_marcador"; cuenta: string }
  | { tipo: "publicacion"; activa: boolean };

const LISTA_VACIA: Lista = { items: [], despues: null, antes: null, hayMas: false, cargando: false, error: false };
const PESTANAS: { id: Pestana; titulo: string }[] = [
  { id: "retenidos", titulo: "Retenidos" }, { id: "denuncias", titulo: "Denuncias" }, { id: "retiradas", titulo: "Retiradas" },
  { id: "cuentas", titulo: "Cuentas" }, { id: "registro", titulo: "Registro" },
];

async function pedir(uid: string, cuerpo: J): Promise<J | "sin-confirmar"> {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    const t = tokenDeCuenta(data.session, uid);
    if (!t) return { resultado: "sin_sesion" };
    const r = await fetch("/api/admin/moderacion", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => null);
    if (r.status === 401 || r.status === 403) return { resultado: "no_autorizado" };
    return j && typeof j === "object" && !Array.isArray(j) ? (j as J) : "sin-confirmar";
  } catch {
    return "sin-confirmar";
  }
}

const n = (x: unknown) => (typeof x === "number" ? x : Number(x ?? 0));
/** "1 denuncia abierta" / "2 denuncias abiertas". */
const cant = (x: unknown, uno: string, varios: string) => `${n(x)} ${n(x) === 1 ? uno : varios}`;
const tituloObra = (it: J) => `${it.tipo === "tv" ? "Serie" : "Película"} · TMDB ${String(it.tmdb_id ?? "?")}`;

export default function ModeracionPage() {
  const { user } = useAuth();
  const { estado } = useAdminSesion();
  if (!user || estado !== "listo") return <div className="admin"><p className="loading">Verificando sesión…</p></div>;
  return <ModeracionDeCuenta key={user.id} uid={user.id} />;
}

function ModeracionDeCuenta({ uid }: { uid: string }) {
  const [resumen, setResumen] = useState<J | null>(null);
  const [errResumen, setErrResumen] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("retenidos");
  const [listas, setListas] = useState<Record<Pestana, Lista>>({
    retenidos: LISTA_VACIA, denuncias: LISTA_VACIA, retiradas: LISTA_VACIA, cuentas: LISTA_VACIA, registro: LISTA_VACIA,
  });
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [aviso, setAviso] = useState<Msg>(null);
  const idTabs = useId();

  const frontera = useMemo(() => crearFrontera(uid), [uid]);
  useEffect(() => { frontera.abrir(); return () => frontera.cerrar(); }, [frontera]);
  // Una generación por lista: recargar una no invalida la carga de otra.
  const gen = useMemo(() => {
    const g: Record<string, number> = {};
    return { nueva: (k: string) => (g[k] = (g[k] ?? 0) + 1), vale: (k: string, x: number) => frontera.vigente() && g[k] === x };
  }, [frontera]);
  // El cursor de "Cargar más" se lee de lo último confirmado, no de un render viejo.
  const listasRef = useRef(listas);
  listasRef.current = listas;

  const cargarResumen = useCallback(async () => {
    if (!frontera.vigente()) return;
    const g = gen.nueva("resumen");
    const r = await pedir(uid, { accion: "leer", vista: "resumen" });
    if (!gen.vale("resumen", g)) return;
    if (r === "sin-confirmar" || typeof r.resultado === "string") { setErrResumen(true); return; }
    setErrResumen(false);
    setResumen(r);
  }, [frontera, gen, uid]);

  const cargar = useCallback(async (p: Pestana, mas: boolean) => {
    if (!frontera.vigente()) return;
    const g = gen.nueva(p);
    const base = listasRef.current[p];
    setListas((l) => ({ ...l, [p]: { ...l[p], cargando: true, error: false } }));
    const vista: Vista = p;
    const cuerpo: J = { accion: "leer", vista };
    if (mas && (p === "retenidos" || p === "denuncias" || p === "retiradas")) cuerpo.despues = base.despues;
    if (mas && p === "registro") cuerpo.antes = base.antes;
    const r = await pedir(uid, cuerpo);
    if (!gen.vale(p, g)) return;
    if (r === "sin-confirmar" || typeof r.resultado === "string") {
      // Una recarga fallida conserva lo que ya se veía.
      setListas((l) => ({ ...l, [p]: { ...l[p], cargando: false, error: true } }));
      return;
    }
    setListas((l) => {
      if (p === "cuentas") return { ...l, cuentas: { ...LISTA_VACIA, items: [r] } };
      const nuevos = Array.isArray(r.items) ? (r.items as J[]) : [];
      const clave = (x: J) => String(x.version_id ?? x.id);
      const previos = mas ? l[p].items : [];
      const vistos = new Set(previos.map(clave));
      const items = [...previos, ...nuevos.filter((x) => !vistos.has(clave(x)))];
      const ultimo = nuevos[nuevos.length - 1];
      return { ...l, [p]: {
        items, hayMas: r.hay_mas === true, cargando: false, error: false,
        despues: ultimo && typeof ultimo.cursor === "object" ? (ultimo.cursor as J) : l[p].despues,
        antes: ultimo && typeof ultimo.id === "number" ? ultimo.id : l[p].antes,
        total: typeof r.total === "number" ? r.total : undefined,
      } };
    });
  }, [frontera, gen, uid]);

  useEffect(() => { void cargarResumen(); }, [cargarResumen]);
  useEffect(() => { void cargar(pestana, false); }, [pestana, cargar]);

  const refrescar = useCallback(() => { void cargarResumen(); void cargar(pestana, false); }, [cargarResumen, cargar, pestana]);

  // La situación ACTUAL de una versión (Registro). null: no se pudo leer o la
  // instancia ya no es de esta cuenta (la respuesta tardía se descarta).
  const consultarVersion = useCallback(async (version: number): Promise<J | null> => {
    if (!frontera.vigente()) return null;
    const r = await pedir(uid, { accion: "leer", vista: "version", version });
    if (!frontera.vigente() || r === "sin-confirmar" || typeof r.resultado === "string") return null;
    return r;
  }, [frontera, uid]);

  const enviar = useCallback(async (d: Dialogo, motivo: string, intento: string) => {
    const cuerpo: J =
      d.tipo === "decidir" ? { accion: "decidir", decision: d.accion, version: d.item.version_id, motivo, intento }
      : d.tipo === "suspender" || d.tipo === "levantar" ? { accion: d.tipo, participante: d.participante, motivo, intento }
      : d.tipo === "quitar_marcador" ? { accion: "quitar_marcador", cuenta: d.cuenta, motivo, intento }
      : { accion: "publicacion", activa: d.activa, motivo, intento };
    const r = await pedir(uid, cuerpo);
    if (!frontera.vigente()) return null;
    const accion = d.tipo === "decidir" ? d.accion : d.tipo === "publicacion" ? (d.activa ? "reanudar_publicacion" : "pausar_publicacion") : d.tipo;
    return mensajeModeracion(accion, r === "sin-confirmar" ? r : (r as { resultado?: unknown }));
  }, [frontera, uid]);

  const lista = listas[pestana];
  const r = resumen;

  return (
    <div className="admin mod">
      <h1>Moderación</h1>
      <p className="admin-nota">Reseñas de la comunidad. Revisás las colas; no hace falta leer todo lo publicado. Denunciar no oculta nada: lo decide una persona.</p>
      {errResumen && <p className="cm-msg error" role="alert">No pudimos cargar el resumen. <button className="cm-link" onClick={() => void cargarResumen()}>Reintentar</button></p>}
      {r && (
        <section className="mod-resumen" aria-label="Estado del módulo">
          <div className="mod-dato"><span>Publicación</span><strong className={r.publicacion_activa ? "mod-ok" : "mod-pausa"}>{r.publicacion_activa ? "Activa" : "Pausada"}</strong>
            <button className="btn ghost mod-btn" onClick={() => setDialogo({ tipo: "publicacion", activa: !r.publicacion_activa })}>
              {r.publicacion_activa ? "Pausar" : "Reanudar"}
            </button>
          </div>
          <div className="mod-dato"><span>Retenidos sin resolver</span><strong>{n(r.retenidos)}</strong>
            <small>Tope de admisión: {n(r.admision_global)}. {r.admision_cerrada ? "Lleno: lo que se retendría no se admite (lo limpio se sigue publicando)." : "Por corroboración puede superarse."}</small>
          </div>
          <div className="mod-dato"><span>Casos de denuncias</span><strong>{n(r.denuncias_casos)}</strong><small>{n(r.denuncias_graves)} con categoría grave</small></div>
          <div className="mod-dato"><span>Cuentas</span><strong>{cant(r.suspensiones_vigentes, "suspendida", "suspendidas")}</strong><small>{cant(r.bajas_pendientes, "baja pendiente", "bajas pendientes")}</small></div>
          {!r.modulo_activo && <p className="admin-aviso">El módulo está apagado: nadie ve reseñas de la comunidad.</p>}
          <p className="admin-nota mod-muestreo">Muestreo al azar: {r.muestreo_activo ? "encendido" : "apagado (pendiente de P6)"}.</p>
        </section>
      )}
      {aviso && <p className={`cm-msg ${aviso.tono}`} role="status">{aviso.texto}</p>}

      <div className="mod-tabs" role="tablist" aria-label="Secciones de moderación">
        {PESTANAS.map((p) => (
          <button key={p.id} role="tab" id={`${idTabs}-${p.id}`} aria-selected={pestana === p.id} aria-controls={`${idTabs}-panel`}
            onClick={() => { setAviso(null); setPestana(p.id); }}>
            {p.titulo}{p.id === "retenidos" && r ? ` · ${n(r.retenidos)}` : p.id === "denuncias" && r ? ` · ${n(r.denuncias_casos)}` : ""}
          </button>
        ))}
      </div>

      <div id={`${idTabs}-panel`} role="tabpanel" aria-labelledby={`${idTabs}-${pestana}`}>
        {lista.error && (
          <p className="cm-msg error" role="alert">No pudimos cargar esta sección. <button className="cm-link" onClick={() => void cargar(pestana, false)}>Reintentar</button></p>
        )}
        {lista.cargando && !lista.items.length && <p className="loading">Cargando…</p>}
        {pestana === "retenidos" && <Retenidos items={lista.items} abrir={setDialogo} />}
        {pestana === "denuncias" && <Denuncias items={lista.items} abrir={setDialogo} />}
        {pestana === "cuentas" && <Cuentas datos={lista.items[0] ?? null} abrir={setDialogo} />}
        {pestana === "retiradas" && <Retiradas items={lista.items} abrir={setDialogo} />}
        {pestana === "registro" && <Registro items={lista.items} consultar={consultarVersion} abrir={setDialogo} />}
        {!lista.cargando && !lista.error && !lista.items.length && pestana !== "cuentas" && (
          <p className="cm-sub">{pestana === "retenidos" ? "No hay retenidos sin resolver." : pestana === "denuncias" ? "No hay denuncias abiertas."
            : pestana === "retiradas" ? "No hay reseñas retiradas para restaurar." : "Todavía no hay decisiones."}</p>
        )}
        {lista.hayMas && (
          <button className="btn ghost mod-mas" disabled={lista.cargando} onClick={() => void cargar(pestana, true)}>
            {lista.cargando ? "Cargando…" : "Cargar más"}
          </button>
        )}
      </div>

      {dialogo && (
        <DialogoAccion d={dialogo} enviar={enviar}
          cerrar={(huboCambio) => { setDialogo(null); if (huboCambio) refrescar(); }}
          alAplicar={(m) => {
            setAviso(m);
            // Aplicada y confirmada: el caso sale de las colas en el acto, sin
            // esperar la recarga (que puede tardar) con su botón todavía activo.
            if (dialogo.tipo === "decidir") {
              const v = dialogo.item.version_id;
              setListas((l) => ({
                ...l,
                retenidos: { ...l.retenidos, items: l.retenidos.items.filter((x) => x.version_id !== v) },
                denuncias: { ...l.denuncias, items: l.denuncias.items.filter((x) => x.version_id !== v) },
                retiradas: { ...l.retiradas, items: l.retiradas.items.filter((x) => x.version_id !== v) },
              }));
            }
            setDialogo(null);
            refrescar();
          }} />
      )}
    </div>
  );
}

function Autor({ a, abrir }: { a: J; abrir: (d: Dialogo) => void }) {
  const id = String(a.participante ?? "");
  return (
    <div className="mod-autor">
      <span className="mod-cod" title="Identificador seudónimo del autor">{codigoParticipante(id)}</span>
      {a.cuenta_eliminada ? <span className="badge-draft">Cuenta eliminada</span> : a.suspendida ? <span className="mod-chip mod-chip-grave">Suspendida</span> : null}
      <span className="mod-ante">
        {cant(a.publicadas, "publicada", "publicadas")} · {cant(a.retenidas, "retenida", "retenidas")} · {cant(a.rechazadas, "rechazada", "rechazadas")} · {cant(a.retiradas, "retirada", "retiradas")} · {cant(a.denuncias_abiertas, "denuncia abierta", "denuncias abiertas")} · {cant(a.suspensiones, "suspensión", "suspensiones")}
      </span>
      {!a.cuenta_eliminada && (
        <button className="cm-link" onClick={() => abrir({ tipo: a.suspendida ? "levantar" : "suspender", participante: id })}>
          {a.suspendida ? "Levantar la suspensión" : "Suspender al autor"}
        </button>
      )}
    </div>
  );
}

function Retenidos({ items, abrir }: { items: J[]; abrir: (d: Dialogo) => void }) {
  return (
    <ul className="mod-lista">
      {items.map((it) => {
        const corr = it.corroboracion as J | null;
        return (
          <li key={String(it.version_id)} className="mod-caso">
            <div className="mod-cab">
              <span className="mod-chip">{corr ? "Retenida tras una denuncia" : it.estado === "revision_solicitada" ? "Revisión pedida" : "Retenida al enviar"}</span>
              <span className="mod-meta">{tituloObra(it)} · versión {String(it.version_id)}{it.es_edicion ? " · edición" : ""} · en cola desde {fechaAR(it.en_cola_desde)}</span>
            </div>
            <p className="mod-regla">Regla: <code>{String(corr ? corr.reglas : it.regla ?? "—")}</code> · reglas {String(corr ? corr.version_reglas : it.version_reglas)}</p>
            <blockquote className="mod-texto">{String(it.texto ?? "")}</blockquote>
            <p className="mod-meta">{cant(it.votos_vigentes, "voto vigente", "votos vigentes")} · {cant(it.denuncias_abiertas, "denuncia abierta", "denuncias abiertas")}</p>
            <Autor a={(it.autor as J) ?? {}} abrir={abrir} />
            <div className="mod-acciones">
              {accionesRetenido(String(it.estado)).map((a) => (
                <button key={a} className={a === "rechazar" ? "cfg-danger-btn" : "btn"} onClick={() => abrir({ tipo: "decidir", accion: a, item: it })}>{ETIQUETA_ACCION[a]}</button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Denuncias({ items, abrir }: { items: J[]; abrir: (d: Dialogo) => void }) {
  return (
    <ul className="mod-lista">
      {items.map((it) => {
        const cats = (it.categorias as Record<string, number>) ?? {};
        const coms = Array.isArray(it.comentarios) ? (it.comentarios as J[]) : [];
        const sit = String(it.situacion);
        return (
          <li key={String(it.version_id)} className="mod-caso">
            <div className="mod-cab">
              {it.grave ? <span className="mod-chip mod-chip-grave">Grave</span> : <span className="mod-chip">Denuncia</span>}
              <span className="mod-chip">{SITUACION[sit] ?? sit}</span>
              <span className="mod-meta">{tituloObra(it)} · versión {String(it.version_id)} · {n(it.denunciantes)} denunciante{n(it.denunciantes) === 1 ? "" : "s"}{n(it.excedente) ? ` (+${n(it.excedente)} agrupadas)` : ""} · desde {fechaAR(it.primera)}</span>
            </div>
            <p className="mod-regla">{Object.entries(cats).map(([c, k]) => `${etiquetaCategoria(c)}: ${k}`).join(" · ")}</p>
            {coms.length > 0 && (
              <ul className="mod-coms" aria-label="Comentarios de quienes denunciaron (sólo para moderación)">
                {coms.map((c, i) => <li key={i}><strong>{etiquetaCategoria(String(c.categoria))}:</strong> {String(c.comentario)}</li>)}
              </ul>
            )}
            <blockquote className="mod-texto">{String(it.texto ?? "")}</blockquote>
            <p className="mod-meta">{cant(it.votos_vigentes, "voto vigente", "votos vigentes")} · prioridad {String(it.peso)}</p>
            <Autor a={(it.autor as J) ?? {}} abrir={abrir} />
            <div className="mod-acciones">
              {accionesDenuncia(sit).map((a) => (
                <button key={a} className={a === "retirar" ? "cfg-danger-btn" : a === "descartar" ? "btn ghost" : "btn"}
                  onClick={() => abrir({ tipo: "decidir", accion: a, item: { ...it, denuncias_abiertas: n(it.denunciantes) } })}>{ETIQUETA_ACCION[a]}</button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Cuentas({ datos, abrir }: { datos: J | null; abrir: (d: Dialogo) => void }) {
  if (!datos) return null;
  const susp = Array.isArray(datos.suspensiones) ? (datos.suspensiones as J[]) : [];
  const bajas = Array.isArray(datos.bajas) ? (datos.bajas as J[]) : [];
  return (
    <>
      <h2 className="mod-h2">Suspensiones vigentes</h2>
      {!susp.length && <p className="cm-sub">No hay cuentas suspendidas.</p>}
      <ul className="mod-lista">
        {susp.map((s) => (
          <li key={String(s.participante)} className="mod-caso">
            <div className="mod-cab"><span className="mod-cod">{codigoParticipante(s.participante)}</span>
              <span className="mod-meta">desde {fechaAR(s.desde)}{s.hasta ? ` hasta ${fechaAR(s.hasta)}` : " · sin plazo"}{s.cuenta_eliminada ? " · cuenta eliminada" : ""}</span></div>
            {typeof s.motivo === "string" && <p className="mod-meta">Motivo: {s.motivo}</p>}
            <div className="mod-acciones">
              <button className="btn ghost" onClick={() => abrir({ tipo: "levantar", participante: String(s.participante) })}>Levantar la suspensión</button>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="mod-h2">Bajas pendientes</h2>
      <p className="admin-nota">Cuentas que pidieron eliminarse y siguen en Auth. Quitar el marcador NO restaura nada: si la persona vuelve, empieza de cero (y si tenía una sanción vigente, sigue).</p>
      {!bajas.length && <p className="cm-sub">No hay bajas pendientes.</p>}
      <ul className="mod-lista">
        {bajas.map((b) => (
          <li key={String(b.cuenta)} className="mod-caso">
            <div className="mod-cab"><code className="mod-uuid">{String(b.cuenta)}</code></div>
            <p className="mod-meta">Iniciada {fechaAR(b.iniciada_en)} · {cant(b.intentos, "intento fallido", "intentos fallidos")} · origen {String(b.origen)}{b.sancion_hasta ? ` · sanción copiada hasta ${b.sancion_hasta === "infinity" ? "sin plazo" : fechaAR(b.sancion_hasta)}` : ""}</p>
            {typeof b.ultimo_error === "string" && <p className="mod-meta">Último error: {b.ultimo_error}</p>}
            <div className="mod-acciones">
              <button className="btn ghost" onClick={() => abrir({ tipo: "quitar_marcador", cuenta: String(b.cuenta) })}>Quitar el marcador</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Una versión retirada (o su situación actual), con Restaurar sólo si sigue retirada y vigente. */
function FichaVersion({ it, abrir }: { it: J; abrir: (d: Dialogo) => void }) {
  const sit = String(it.situacion);
  const retiro = (it.retiro as J | null) ?? null;
  const no = motivoNoRestaurable(sit);
  return (
    <>
      <div className="mod-cab">
        <span className={sit === "oculta" ? "mod-chip mod-chip-grave" : "mod-chip"}>{SITUACION[sit] ?? sit}</span>
        <span className="mod-meta">{it.tmdb_id ? `${tituloObra(it)} · ` : ""}versión {String(it.version_id)}{sit === "oculta" && it.decidida_en ? ` · retirada ${fechaAR(it.decidida_en)}` : ""}</span>
      </div>
      {retiro && <p className="mod-meta">Motivo del retiro: {String(retiro.motivo)}{retiro.admin_propio ? " (vos)" : ""}</p>}
      {typeof it.texto === "string" && <blockquote className="mod-texto">{it.texto}</blockquote>}
      {sit !== "eliminada" && (
        <p className="mod-meta">{cant(it.votos_vigentes, "voto vigente", "votos vigentes")} · {sit === "oculta" ? `${cant(it.votos_recuperables, "voto de utilidad vuelve", "votos de utilidad vuelven")} a contar al restaurar` : cant(it.denuncias_abiertas, "denuncia abierta", "denuncias abiertas")}</p>
      )}
      {it.autor ? <Autor a={it.autor as J} abrir={abrir} /> : null}
      <div className="mod-acciones">
        {accionesRetirada(sit).map((a) => (
          <button key={a} className="btn" onClick={() => abrir({ tipo: "decidir", accion: a, item: it })}>{ETIQUETA_ACCION[a]}</button>
        ))}
        {no && <p className="mod-meta" role="note">{no}</p>}
      </div>
    </>
  );
}

function Retiradas({ items, abrir }: { items: J[]; abrir: (d: Dialogo) => void }) {
  return (
    <>
      <p className="admin-nota">Reseñas retiradas que siguen siendo la versión vigente. Restaurar las vuelve a mostrar; si el autor la editó, la borró o se dio de baja, ya no aparecen acá.</p>
      <ul className="mod-lista">
        {items.map((it) => <li key={String(it.version_id)} className="mod-caso"><FichaVersion it={it} abrir={abrir} /></li>)}
      </ul>
    </>
  );
}

type Consulta = { cargando: boolean; dato: J | null; error: boolean };
function Registro({ items, consultar, abrir }: { items: J[]; consultar: (v: number) => Promise<J | null>; abrir: (d: Dialogo) => void }) {
  const [fichas, setFichas] = useState<Record<string, Consulta>>({});
  // Lo consultado vale para ESTA carga del registro: una recarga (por ejemplo,
  // después de restaurar) lo descarta en vez de mostrar una situación vieja.
  useEffect(() => { setFichas({}); }, [items]);
  async function ver(d: J) {
    const k = String(d.id);
    setFichas((f) => ({ ...f, [k]: { cargando: true, dato: null, error: false } }));
    const r = await consultar(Number(d.version_id));
    setFichas((f) => (k in f ? { ...f, [k]: { cargando: false, dato: r, error: !r } } : f));
  }
  return (
    <ul className="mod-lista">
      {items.map((d) => {
        const f = fichas[String(d.id)];
        return (
          <li key={String(d.id)} className="mod-caso mod-reg">
            <div className="mod-cab">
              <span className="mod-chip">{ETIQUETA_ACCION[String(d.accion)] ?? String(d.accion)}</span>
              {d.falso_positivo ? <span className="mod-chip">Falso positivo</span> : null}
              <span className="mod-meta">{fechaAR(d.creada_en)}{d.version_id ? ` · versión ${String(d.version_id)}` : ""}{d.participante ? ` · ${codigoParticipante(d.participante)}` : ""}{d.cuenta ? " · cuenta" : ""}{d.estado_previo ? ` · antes: ${SITUACION[String(d.estado_previo)] ?? String(d.estado_previo)}` : ""}{d.admin_propio ? " · vos" : ""}</span>
            </div>
            <p className="mod-meta">Motivo: {String(d.motivo)}</p>
            {typeof d.version_id === "number" && !f?.dato && !f?.error && (
              <button className="cm-link mod-ver" disabled={f?.cargando} onClick={() => void ver(d)}>
                {f?.cargando ? "Consultando…" : "Ver situación actual"}
              </button>
            )}
            {f?.error && <p className="cm-msg error" role="alert">No pudimos consultar la versión. <button className="cm-link" onClick={() => void ver(d)}>Reintentar</button></p>}
            {f?.dato && <div className="mod-ficha" aria-label={`Situación actual de la versión ${String(d.version_id)}`}><FichaVersion it={f.dato} abrir={abrir} /></div>}
          </li>
        );
      })}
    </ul>
  );
}

function tituloDialogo(d: Dialogo) {
  if (d.tipo === "decidir") return `${ETIQUETA_ACCION[d.accion]} · versión ${String(d.item.version_id)}`;
  if (d.tipo === "publicacion") return d.activa ? "Reanudar la publicación" : "Pausar la publicación";
  return ETIQUETA_ACCION[d.tipo];
}
function efectoDialogo(d: Dialogo) {
  if (d.tipo === "decidir") {
    // Restaurar recupera sólo los votos que ya contaban (votos_recuperables, de la base).
    return efectoDecision(d.accion, {
      votos: d.accion === "restaurar" ? n(d.item.votos_recuperables) : n(d.item.votos_vigentes), denuncias: n(d.item.denuncias_abiertas), revision: d.item.estado === "revision_solicitada",
    });
  }
  if (d.tipo === "suspender") return `${codigoParticipante(d.participante)} no podrá publicar, editar ni evaluar hasta que se levante. Puede seguir borrando, denunciando, bloqueando y eliminar su cuenta. Mientras dure, sus reseñas no se muestran a nadie (vuelven a verse al levantarla).`;
  if (d.tipo === "levantar") return `${codigoParticipante(d.participante)} vuelve a poder publicar y evaluar. Los meses ya cerrados no cambian.`;
  if (d.tipo === "quitar_marcador") return "La cuenta vuelve a poder participar, pero no se restaura nada de lo que la baja borró. Si tenía una sanción vigente, la nueva identidad nace suspendida hasta entonces.";
  return d.activa ? "Las reseñas que pasan las reglas vuelven a publicarse." : "Nadie puede publicar ni editar. Leer, borrar, denunciar y bloquear siguen funcionando.";
}

function DialogoAccion({ d, enviar, cerrar, alAplicar }: {
  d: Dialogo;
  enviar: (d: Dialogo, motivo: string, intento: string) => Promise<{ tono: Tono; texto: string } | null>;
  cerrar: (huboCambio: boolean) => void;
  alAplicar: (m: { tono: Tono; texto: string }) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [intento] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [definitivo, setDefinitivo] = useState(false);
  const id = useId();
  const m = normalizarMotivo(motivo);
  // Mientras no se sabe si se aplicó, el motivo queda fijo: el reintento es el MISMO pedido.
  const incierto = !!msg && reintentable(msg.tono);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && !enviando) cerrar(definitivo); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [cerrar, enviando, definitivo]);

  async function confirmar() {
    if (!m.ok || enviando) return;
    setEnviando(true);
    setMsg(null);
    const r = await enviar(d, m.valor, intento);
    if (!r) return; // la instancia ya no es de esta cuenta
    setEnviando(false);
    if (r.tono === "exito") { alAplicar(r); return; }
    setMsg(r);
    if (!reintentable(r.tono)) setDefinitivo(true);
  }

  const peligro = d.tipo === "decidir" ? d.accion === "rechazar" || d.accion === "retirar" : d.tipo === "suspender" || (d.tipo === "publicacion" && !d.activa);
  return (
    <div className="dlg-backdrop" onClick={() => { if (!enviando) cerrar(definitivo); }} role="presentation">
      <div className="dlg mod-dlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`}>{tituloDialogo(d)}</h2>
        <p className="dlg-sub">{efectoDialogo(d)}</p>
        {!definitivo && (
          <>
            <label className="dlg-lbl" htmlFor={`${id}-m`}>Motivo (queda en el registro; no lo ve el autor)</label>
            <textarea id={`${id}-m`} className="cm-textarea mod-motivo" rows={3} value={motivo} autoFocus
              maxLength={MOTIVO_MAX * 2} disabled={enviando || incierto} onChange={(e) => setMotivo(e.target.value)} />
            {motivo && !m.ok && <p className="dlg-error" role="alert">{m.aviso}</p>}
          </>
        )}
        {msg && <p className={`cm-msg ${msg.tono}`} role={msg.tono === "info" ? "status" : "alert"}>{msg.texto}</p>}
        <div className="dlg-acciones">
          <button className="btn ghost" disabled={enviando} onClick={() => cerrar(definitivo || incierto)}>{definitivo ? "Cerrar" : "Cancelar"}</button>
          {!definitivo && (
            <button className={peligro ? "cfg-danger-btn" : "btn"} disabled={!m.ok || enviando} onClick={() => void confirmar()}>
              {enviando ? "Aplicando…" : incierto ? "Reintentar" : "Confirmar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
