"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent as RPointerEvent, KeyboardEvent as RKeyboardEvent, ReactNode } from "react";
import { PLATFORMS } from "@/lib/providers-ar";
import { BLOQUES, TOP_PLATAFORMAS, claveBloque, preparacion, validarBloque } from "@/lib/top-manual-nucleo";
import {
  PUESTOS, SincronizadorTop, casilleros, moverEnCasilleros, originalDistinto, posterTam,
  primerLibre, puestoDe, type OpTop, type RankingFila,
} from "@/lib/top-editor-nucleo";
import type { CandidatoTop, TransporteTop } from "@/lib/top-transporte";
import type { MediaType, PlatformCode } from "@/lib/types";

// El editor del Top semanal. Lo monta `/admin/top` con el transporte real y
// `/revision-local/top` con el banco en memoria.
//
// ============================================================================
// LO QUE ORDENA ESTA PANTALLA
// ============================================================================
// Doce bloques (seis plataformas × dos tipos) de diez puestos. Cada bloque se
// edita, se APRUEBA (en la base: "revisado") y se publica con «Publicar
// revisados»; los demás conservan su última versión publicada.
//
// 🔴 APROBAR NO PUBLICA. Marca el bloque como listo; la app pública sigue
// mostrando la última versión publicada hasta tocar «Publicar revisados».
//
// 🔴 CUALQUIER CAMBIO QUITA LA APROBACIÓN. Lo hace la base (trigger y
// `reemplazar_entradas`), no esta pantalla; acá sólo se refleja enseguida.
//
// 🔴 TODO GUARDADO PASA POR EL SINCRONIZADOR (lib/top-editor-nucleo.ts): una
// escritura por vez, órdenes absolutos, lo pendiente reaplicado sobre cada
// respuesta y un fallo que conserva lo pendiente. No se publica ni se recarga
// con algo sin confirmar.

const nombre = (c: PlatformCode) => PLATFORMS.find((p) => p.code === c)?.name ?? c;
const etiquetaTipo = (t: MediaType) => (t === "movie" ? "Películas" : "Series");
const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).replace(/.$/, "");

interface Arrastre {
  desde: number;
  objetivo: number;
  dy: number;
}

export default function TopEditor({ transporte, aviso }: { transporte: TransporteTop; aviso?: ReactNode }) {
  const transporteRef = useRef(transporte);
  transporteRef.current = transporte;

  const [publicados, setPublicados] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const syncRef = useRef<SincronizadorTop | null>(null);
  if (!syncRef.current) {
    syncRef.current = new SincronizadorTop(
      async (op) => {
        const r = await transporteRef.current.escribir(op);
        setPublicados(r.publicados);
        return r.borradores;
      },
      () => setTick((t) => t + 1),
    );
  }
  const sync = syncRef.current;

  const [plataforma, setPlataforma] = useState<PlatformCode>("n");
  const [tipo, setTipo] = useState<MediaType>("movie");
  const [reemplazo, setReemplazo] = useState<CandidatoTop | null>(null);
  const [resaltado, setResaltado] = useState<{ pos: number; n: number } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [msgPublicar, setMsgPublicar] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const r = await transporteRef.current.leer();
      setPublicados(r.publicados);
      syncRef.current!.cargar(r.borradores);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  // Avisar antes de cerrar la pestaña con cambios sin guardar.
  const ocupado = sync.ocupado();
  useEffect(() => {
    if (!ocupado) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [ocupado]);

  const vista = sync.vista();
  const actual = vista.find((b) => b.plataforma === plataforma && b.tipo === tipo) ?? null;
  const avance = useMemo(() => preparacion(publicados), [publicados]);
  const revisados = vista.filter((b) => b.revisado && !validarBloque(b.entradas).length);

  // Cambiar de bloque cancela un reemplazo a medio elegir.
  useEffect(() => { setReemplazo(null); }, [plataforma, tipo]);

  const resaltar = useCallback((pos: number) => setResaltado({ pos, n: Date.now() }), []);
  useEffect(() => {
    if (!resaltado) return;
    const t = setTimeout(() => setResaltado(null), 1800);
    return () => clearTimeout(t);
  }, [resaltado]);

  const encolar = useCallback((op: OpTop) => { syncRef.current!.encolar(op); }, []);

  const mover = useCallback((b: RankingFila, desde: number, hasta: number) => {
    if (desde === hasta) return;
    const entradas = moverEnCasilleros(b.entradas, desde, hasta);
    const movido = casilleros(b.entradas)[desde - 1];
    if (!movido) return;
    encolar({ k: "ordenar", id: b.id, entradas });
    setAnuncio(`«${movido.titulo}» pasó al puesto ${hasta}.`);
    resaltar(hasta);
  }, [encolar, resaltar]);

  const agregar = useCallback((c: CandidatoTop) => {
    if (!actual) return;
    const ya = puestoDe(actual.entradas, c.tipo, c.id);
    if (ya) { resaltar(ya); setAnuncio(`«${c.titulo}» ya está en el puesto ${ya}.`); return; }
    const libre = primerLibre(actual.entradas);
    if (libre === null) {
      setReemplazo(c);
      setAnuncio(`Los diez puestos están ocupados. Elegí qué título reemplaza «${c.titulo}».`);
      return;
    }
    encolar({ k: "agregar", id: actual.id, entrada: { posicion: libre, tipo: c.tipo, tmdb_id: c.id, titulo: c.titulo } });
    setAnuncio(`«${c.titulo}» se agregó en el puesto ${libre}.`);
    resaltar(libre);
  }, [actual, encolar, resaltar]);

  const reemplazar = useCallback((pos: number) => {
    if (!actual || !reemplazo) return;
    const viejo = casilleros(actual.entradas)[pos - 1];
    if (!viejo) return;
    encolar({
      k: "reemplazar", id: actual.id,
      entrada: { posicion: pos, tipo: reemplazo.tipo, tmdb_id: reemplazo.id, titulo: reemplazo.titulo },
      reemplaza: { tipo: viejo.tipo, tmdb_id: viejo.tmdb_id },
    });
    setAnuncio(`«${reemplazo.titulo}» reemplazó a «${viejo.titulo}» en el puesto ${pos}.`);
    setReemplazo(null);
    resaltar(pos);
  }, [actual, reemplazo, encolar, resaltar]);

  async function publicarRevisados() {
    if (sync.ocupado() || publicando || !revisados.length) return;
    setPublicando(true); setMsgPublicar(null);
    try {
      const r = await transporteRef.current.publicar(revisados.map((b) => b.id));
      setPublicados(r.publicados);
      sync.cargar(r.borradores);
      const ok = r.resultados.filter((x) => x.publicado).length;
      const fallidos = r.resultados.filter((x) => !x.publicado);
      setMsgPublicar(
        `Se publicaron ${ok} de ${r.resultados.length}.`
        + (fallidos.length ? ` No se publicaron: ${fallidos.map((f) => `${f.plataforma}/${f.tipo} (${f.motivo})`).join(", ")}.` : "")
        + (ok ? " En la app se ven en hasta un minuto." : ""),
      );
    } catch (e) {
      setMsgPublicar(`No se pudo publicar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublicando(false);
    }
  }

  async function descartarYRecargar() {
    if (!sync.descartar()) return;
    setReemplazo(null);
    await recargar();
  }

  if (cargando) return <div className="admin admin-top"><p className="loading">Cargando bloques…</p></div>;
  if (errorCarga && !vista.length) {
    return (
      <div className="admin admin-top">
        <p className="admin-error" role="alert">No se pudieron cargar los bloques: {errorCarga}</p>
        <button type="button" className="btn ghost" onClick={() => { setCargando(true); void recargar(); }}>Reintentar</button>
      </div>
    );
  }

  const st = sync.estado;
  const pendientesN = st.pendientes.length;

  return (
    <div className="admin admin-top">
      {aviso}
      <h1>Top semanal</h1>
      <p className="admin-nota">
        Bloques publicados: <strong>{avance.hechos} de {avance.total} publicados</strong>. {avance.mensaje}
      </p>

      <div className="admin-filtros">
        <div>
          <label htmlFor="plat">Plataforma</label>
          <select id="plat" value={plataforma} onChange={(e) => setPlataforma(e.target.value as PlatformCode)}>
            {TOP_PLATAFORMAS.map((c) => <option key={c} value={c}>{nombre(c)}</option>)}
          </select>
        </div>
        <div role="group" aria-label="Tipo">
          {(["movie", "tv"] as MediaType[]).map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>{etiquetaTipo(t)}</button>
          ))}
        </div>
        <EstadoGuardado enVuelo={st.enVuelo} fallo={!!st.fallo} pendientes={pendientesN} ultimoOk={st.ultimoOk} />
      </div>

      {st.fallo && (
        <div className="tde-fallo" role="alert">
          <p>
            <strong>No se pudo guardar.</strong> {capitalizar(st.fallo.mensaje)}.{" "}
            {st.fallo.conflicto
              ? "El bloque cambió en el servidor: recargá para ver el estado actual."
              : `${pendientesN === 1 ? "El cambio pendiente se conserva" : `Los ${pendientesN} cambios pendientes se conservan`} en esta pantalla.`}
          </p>
          <div className="tde-fallo-acciones">
            {!st.fallo.conflicto && <button type="button" className="btn" onClick={() => sync.reintentar()}>Reintentar</button>}
            <button type="button" className="btn ghost" onClick={() => void descartarYRecargar()}>
              {st.fallo.conflicto ? "Recargar el estado guardado" : "Descartar cambios y volver a lo guardado"}
            </button>
          </div>
        </div>
      )}

      <p className="tde-anuncio" aria-live="polite">{anuncio}</p>

      {actual && (
        <div className="tde-grilla">
          <Buscador
            transporte={transporteRef} bloque={actual}
            onAgregar={agregar} onVerPuesto={(p) => resaltar(p)} reemplazando={reemplazo}
            onElegirReemplazo={(c) => { setReemplazo(c); setAnuncio(`Elegí qué título reemplaza «${c.titulo}».`); }}
          />
          <section className="tde-ranking" aria-labelledby="tde-titulo-bloque">
            <header className="tde-ranking-cab">
              <div>
                <h2 id="tde-titulo-bloque">{nombre(actual.plataforma)} · {etiquetaTipo(actual.tipo)}</h2>
                <p className="admin-nota">{actual.entradas.length} de {PUESTOS} puestos cargados</p>
              </div>
              <label className="tde-fecha">
                Fecha de captura
                {/* Editable: nace con el día en que se creó el borrador y hay que
                    poder ajustarla a la semana que corresponde. Cambiarla quita
                    la aprobación (la fecha es parte de lo revisado). */}
                <input type="date" value={actual.captured_at}
                  onChange={(e) => e.target.value && encolar({ k: "fecha", id: actual.id, fecha: e.target.value })} />
              </label>
            </header>

            {reemplazo && (
              <div className="tde-reemplazo" role="status">
                <span>{primerLibre(actual.entradas) === null ? "Los diez puestos están ocupados. " : ""}Elegí qué título reemplaza a <strong>«{reemplazo.titulo}»</strong>{reemplazo.year ? ` (${reemplazo.year})` : ""}.</span>
                <button type="button" className="btn ghost" onClick={() => setReemplazo(null)}>Cancelar</button>
              </div>
            )}

            <ListaRanking
              bloque={actual} reemplazando={!!reemplazo} resaltado={resaltado?.pos ?? null}
              onMover={(d, h) => mover(actual, d, h)} onReemplazar={reemplazar}
            />

            <Aprobacion bloque={actual} sync={sync} onAprobar={(v) => encolar({ k: "revisar", id: actual.id, revisado: v })} />

            <RestaurarPublicado
              tienePublicacion={publicados.includes(claveBloque(actual.plataforma, actual.tipo))}
              deshabilitado={st.enVuelo}
              onRestaurar={() => {
                setReemplazo(null);
                encolar({ k: "restaurar", id: actual.id });
                setAnuncio("Se restauró el último Top publicado en el borrador.");
              }}
            />
          </section>
        </div>
      )}

      <section className="admin-publicar">
        <h2>Publicación</h2>
        <p>
          Aprobados y completos: <strong>{revisados.length}</strong> · Pendientes:{" "}
          <strong>{BLOQUES.length - revisados.length}</strong>
        </p>
        <button type="button" className="btn" onClick={publicarRevisados}
          // Publicar lee de la base: con algo sin confirmar se publicaría lo que
          // en pantalla ya no está.
          disabled={!revisados.length || ocupado || publicando}>
          {publicando ? "Publicando…" : `Publicar revisados (${revisados.length})`}
        </button>
        {ocupado && <p className="admin-nota">Esperá a que se guarden los cambios para publicar.</p>}
        {msgPublicar && <p className="admin-nota" role="status">{msgPublicar}</p>}
      </section>
    </div>
  );
}

// --- Estado del guardado ------------------------------------------------------

function EstadoGuardado({ enVuelo, fallo, pendientes, ultimoOk }: { enVuelo: boolean; fallo: boolean; pendientes: number; ultimoOk: number | null }) {
  const texto = fallo ? "No se pudo guardar"
    : enVuelo || pendientes ? (pendientes > 1 ? `Guardando… (${pendientes} cambios)` : "Guardando…")
    : ultimoOk ? "Todo guardado" : "";
  const clase = fallo ? "error" : enVuelo || pendientes ? "guardando" : ultimoOk ? "guardado" : "limpio";
  return <span className={`admin-guardado admin-guardado-${clase}`} role="status">{texto}</span>;
}

// --- Aprobación ---------------------------------------------------------------

function Aprobacion({ bloque, sync, onAprobar }: { bloque: RankingFila; sync: SincronizadorTop; onAprobar: (v: boolean) => void }) {
  const motivos = validarBloque(bloque.entradas);
  const st = sync.estado;
  const pendiente = st.pendientes.some((o) => o.id === bloque.id && o.k === "revisar");
  const fallo = st.fallo?.op.id === bloque.id && st.fallo.op.k === "revisar";
  const estado = fallo ? "No se pudo guardar la aprobación"
    : pendiente ? "Guardando…" : null;

  return (
    <div className={`tde-aprobacion${bloque.revisado ? " aprobada" : ""}`}>
      {bloque.revisado ? (
        <>
          <span className="tde-aprobada"><Check /> Aprobada</span>
          <button type="button" className="btn ghost" onClick={() => onAprobar(false)}>Deshacer aprobación</button>
        </>
      ) : (
        <button type="button" className="btn" disabled={!!motivos.length} onClick={() => onAprobar(true)}>Aprobar</button>
      )}
      <span className="tde-aprobacion-estado" role="status">{estado}</span>
      <p className="admin-nota">
        {motivos.length
          ? `Para aprobar falta: ${motivos.join("; ")}.`
          : bloque.revisado
            ? "Lista para publicar. La app la muestra cuando tocás «Publicar revisados»; cualquier cambio quita la aprobación."
            : "Aprobar no publica: marca el bloque como listo para «Publicar revisados». Cualquier cambio posterior quita la aprobación."}
      </p>
    </div>
  );
}

// --- Restaurar el último Top publicado ------------------------------------------

/**
 * Reemplaza el borrador por la última publicación del bloque (acción
 * `restaurar` → `copiarPublicado`). No toca la publicación: la que ven los
 * usuarios sigue igual. Pide confirmación porque descarta el borrador.
 */
function RestaurarPublicado({ tienePublicacion, deshabilitado, onRestaurar }: {
  tienePublicacion: boolean; deshabilitado: boolean; onRestaurar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <div className="admin-acciones">
      <button type="button" className="btn ghost" disabled={!tienePublicacion || deshabilitado}
        aria-describedby={tienePublicacion ? undefined : "tde-sin-publicacion"}
        onClick={() => ref.current?.showModal()}>
        Restaurar el último Top publicado
      </button>
      {!tienePublicacion && (
        <p id="tde-sin-publicacion" className="admin-nota">Este bloque todavía no tiene un Top publicado para restaurar</p>
      )}
      <dialog ref={ref} className="tde-detalle tde-confirmar" aria-labelledby="tde-confirmar-texto"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="tde-confirmar-cuerpo">
          <p id="tde-confirmar-texto">
            Se perderán los cambios de este borrador y se recuperará el último Top publicado. La publicación que ven los usuarios seguirá igual.
          </p>
          <div className="tde-detalle-acciones">
            <button type="button" className="btn ghost" autoFocus onClick={() => ref.current?.close()}>Cancelar</button>
            <button type="button" className="btn" onClick={() => { ref.current?.close(); onRestaurar(); }}>Restaurar borrador</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

// --- La lista ordenable ---------------------------------------------------------

function ListaRanking({ bloque, reemplazando, resaltado, onMover, onReemplazar }: {
  bloque: RankingFila; reemplazando: boolean; resaltado: number | null;
  onMover: (desde: number, hasta: number) => void; onReemplazar: (pos: number) => void;
}) {
  const slots = casilleros(bloque.entradas);
  const olRef = useRef<HTMLOListElement>(null);
  const [arr, setArrEstado] = useState<Arrastre | null>(null);
  // Espejo del arrastre para leerlo al soltar SIN efectos dentro de un updater
  // (en Strict Mode React corre los updaters dos veces: movería dos veces).
  const arrRef = useRef<Arrastre | null>(null);
  const setArr = useCallback((a: Arrastre | null) => { arrRef.current = a; setArrEstado(a); }, []);
  const geo = useRef<{ startY: number; startScroll: number; paso: number; lastY: number; raf: number | null; pointer: number } | null>(null);
  const [foco, setFoco] = useState<number | null>(null);
  // Al soltar, el orden nuevo y el fin del desplazamiento llegan en el MISMO
  // render: sin apagar la transición un cuadro, cada fila "volaría" desde donde
  // la dejó el arrastre hasta su lugar nuevo.
  const [soltando, setSoltando] = useState(false);
  useEffect(() => {
    if (!soltando) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setSoltando(false)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [soltando]);

  // Después de mover con teclado, el foco sigue al título en su puesto nuevo.
  useLayoutEffect(() => {
    if (foco === null) return;
    olRef.current?.querySelector<HTMLButtonElement>(`[data-tirador="${foco}"]`)?.focus();
    setFoco(null);
  }, [foco, bloque]);

  useEffect(() => {
    if (resaltado === null) return;
    olRef.current?.querySelector(`[data-pos="${resaltado}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [resaltado]);

  const calcular = useCallback((clientY: number) => {
    const g = geo.current;
    if (!g) return;
    const a = arrRef.current;
    if (!a) return;
    const dy = clientY - g.startY + (window.scrollY - g.startScroll);
    const objetivo = Math.min(PUESTOS, Math.max(1, a.desde + Math.round(dy / g.paso)));
    setArr({ ...a, dy, objetivo });
  }, [setArr]);

  const autoScroll = useCallback(() => {
    const g = geo.current;
    if (!g) return;
    const borde = 72;
    const v = g.lastY < borde ? -10 : g.lastY > window.innerHeight - borde ? 10 : 0;
    if (v) {
      window.scrollBy(0, v);
      calcular(g.lastY);
    }
    g.raf = requestAnimationFrame(autoScroll);
  }, [calcular]);

  const terminar = useCallback((aplicar: boolean) => {
    const g = geo.current;
    if (g?.raf) cancelAnimationFrame(g.raf);
    geo.current = null;
    document.body.classList.remove("tde-arrastrando");
    const a = arrRef.current;
    if (a) setSoltando(true);
    setArr(null);
    if (a && aplicar && a.objetivo !== a.desde) onMover(a.desde, a.objetivo);
  }, [onMover, setArr]);

  function alPresionar(e: RPointerEvent<HTMLButtonElement>, pos: number) {
    if (reemplazando || e.button !== 0) return;
    const items = olRef.current?.querySelectorAll<HTMLLIElement>("li[data-pos]");
    if (!items || items.length < 2) return;
    const paso = items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top;
    // Captura el puntero para seguir recibiendo el movimiento aunque salga del
    // tirador. Si el navegador no puede (puntero ya liberado), se sigue igual.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    geo.current = { startY: e.clientY, startScroll: window.scrollY, paso, lastY: e.clientY, raf: null, pointer: e.pointerId };
    document.body.classList.add("tde-arrastrando");
    setArr({ desde: pos, objetivo: pos, dy: 0 });
    geo.current.raf = requestAnimationFrame(autoScroll);
  }

  function alMover(e: RPointerEvent<HTMLButtonElement>) {
    const g = geo.current;
    if (!g || e.pointerId !== g.pointer) return;
    g.lastY = e.clientY;
    calcular(e.clientY);
  }

  function alTeclear(e: RKeyboardEvent<HTMLButtonElement>, pos: number) {
    if (arr) {
      if (e.key === "Escape") { e.preventDefault(); terminar(false); }
      return;
    }
    const destino = e.key === "ArrowUp" ? pos - 1 : e.key === "ArrowDown" ? pos + 1
      : e.key === "Home" ? 1 : e.key === "End" ? PUESTOS : null;
    if (destino === null) return;
    e.preventDefault();
    if (destino < 1 || destino > PUESTOS || destino === pos) return;
    onMover(pos, destino);
    setFoco(destino);
  }

  // Desplazamiento visual mientras se arrastra: el título sigue al dedo y los
  // intermedios se corren un lugar, así se ve el orden que va a quedar.
  const desplazamiento = (pos: number): number => {
    if (!arr || !geo.current) return 0;
    if (pos === arr.desde) return arr.dy;
    const p = geo.current.paso;
    if (arr.desde < arr.objetivo && pos > arr.desde && pos <= arr.objetivo) return -p;
    if (arr.objetivo < arr.desde && pos >= arr.objetivo && pos < arr.desde) return p;
    return 0;
  };

  return (
    <ol ref={olRef} className={`tde-lista${arr ? " arrastrando" : ""}${soltando ? " soltando" : ""}`} aria-label="Ranking del bloque">
      {arr && geo.current && (
        <li className="tde-destino" aria-hidden="true"
          style={{ transform: `translateY(${(arr.objetivo - 1) * geo.current.paso}px)` }} />
      )}
      {slots.map((e, i) => {
        const pos = i + 1;
        const dy = desplazamiento(pos);
        const esArrastrado = arr?.desde === pos;
        return (
          <li key={e ? `${e.tipo}:${e.tmdb_id}` : `vacio-${pos}`} data-pos={pos}
            className={["tde-fila", !e && "vacia", esArrastrado && "levantada", resaltado === pos && !arr && "resaltada"].filter(Boolean).join(" ")}
            style={dy ? { transform: `translateY(${dy}px)` } : undefined}>
            <button type="button" className="tde-tirador" data-tirador={pos}
              disabled={!e || reemplazando}
              aria-label={e ? `Mover «${e.titulo}», puesto ${pos}. Arrastrá, o usá flecha arriba o abajo.` : `Puesto ${pos} libre`}
              onPointerDown={(ev) => alPresionar(ev, pos)} onPointerMove={alMover}
              onPointerUp={() => terminar(true)} onPointerCancel={() => terminar(false)}
              onLostPointerCapture={() => geo.current && terminar(true)}
              onKeyDown={(ev) => alTeclear(ev, pos)}>
              <Tirador />
            </button>
            {/* Mientras se arrastra, cada fila muestra el número que va a tener. */}
            <span className="tde-num">{esArrastrado && arr ? arr.objetivo : dy < 0 ? pos - 1 : dy > 0 ? pos + 1 : pos}</span>
            {e ? (
              <span className="tde-titulo">
                <span className="tde-titulo-texto">{e.titulo}</span>
                <code>{e.tipo}:{e.tmdb_id}</code>
              </span>
            ) : <span className="tde-titulo tde-libre">Puesto libre</span>}
            {esArrastrado && arr && arr.objetivo !== arr.desde && <span className="tde-chip-destino">→ puesto {arr.objetivo}</span>}
            {e && reemplazando && (
              <button type="button" className="btn tde-btn-chico" onClick={() => onReemplazar(pos)}>Reemplazar</button>
            )}
            {e && !reemplazando && (
              <select className="tde-mover" aria-label={`Mover «${e.titulo}» al puesto`} value=""
                onChange={(ev) => { const h = Number(ev.target.value); if (h) onMover(pos, h); }}>
                <option value="" disabled>Mover al puesto…</option>
                {Array.from({ length: PUESTOS }, (_, j) => j + 1).map((n) => (
                  <option key={n} value={n} disabled={n === pos}>{n === pos ? `${n} (actual)` : `Puesto ${n}`}</option>
                ))}
              </select>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// --- Búsqueda -------------------------------------------------------------------

function Buscador({ transporte, bloque, onAgregar, onVerPuesto, reemplazando, onElegirReemplazo }: {
  transporte: MutableRefObject<TransporteTop>;
  bloque: RankingFila;
  onAgregar: (c: CandidatoTop) => void;
  onVerPuesto: (pos: number) => void;
  reemplazando: CandidatoTop | null;
  /** Reemplazar un puesto ocupado aunque haya lugares libres (lo que hacía «Cambiar»). */
  onElegirReemplazo: (c: CandidatoTop) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CandidatoTop[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<CandidatoTop | null>(null);
  const req = useRef(0);
  const { tipo, plataforma } = bloque;
  const lleno = primerLibre(bloque.entradas) === null;

  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); setError(null); return; }
    const mio = ++req.current;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBuscando(true); setError(null);
      try {
        const r = await transporte.current.buscar(q.trim(), tipo, plataforma, ctrl.signal);
        if (mio === req.current) setItems(r);
      } catch (e) {
        // Un fallo de TMDB no toca el ranking: sólo vacía los candidatos.
        if (mio === req.current && !ctrl.signal.aborted) { setItems([]); setError(e instanceof Error ? e.message : String(e)); }
      } finally {
        if (mio === req.current) setBuscando(false);
      }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, tipo, plataforma, transporte]);

  return (
    <section className="tde-buscador" aria-labelledby="tde-buscar-titulo">
      <h2 id="tde-buscar-titulo">Buscar y agregar</h2>
      <label htmlFor="tde-buscar" className="tde-sr">Buscar {tipo === "movie" ? "películas" : "series"} en TMDB</label>
      <input id="tde-buscar" type="search" value={q} placeholder={`Buscar ${tipo === "movie" ? "películas" : "series"} en TMDB…`}
        autoComplete="off" onChange={(e) => setQ(e.target.value)} />
      {buscando && <p className="loading">Buscando…</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {!buscando && !error && q.trim().length >= 2 && !items.length && <p className="admin-nota">Sin resultados.</p>}
      <ul className="tde-resultados">
        {items.map((c) => {
          const ya = puestoDe(bloque.entradas, c.tipo, c.id);
          return (
            <li key={`${c.tipo}:${c.id}`} className="tde-res">
              <button type="button" className="tde-res-poster" onClick={() => setDetalle(c)} aria-label={`Ampliar póster y detalle de «${c.titulo}»`}>
                {c.poster
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={posterTam(c.poster, "w185") ?? ""} alt="" width={92} height={138} loading="lazy" />
                  : <span className="tde-sin-poster">Sin póster</span>}
              </button>
              <div className="tde-res-info">
                <button type="button" className="tde-res-titulo" onClick={() => setDetalle(c)}>{c.titulo}</button>
                <span className="tde-res-meta">{c.year ?? "Sin año"} · {c.tipo === "movie" ? "Película" : "Serie"}</span>
                {originalDistinto(c.titulo, c.tituloOriginal) && <span className="tde-res-original">Original: {c.tituloOriginal}</span>}
                {!c.confirmadoEnPlataforma && (
                  <em className="admin-aviso">TMDB todavía no lo confirma en {nombre(plataforma)} para Argentina</em>
                )}
                <div className="tde-res-accion">
                  {ya ? (
                    <button type="button" className="tde-ya" onClick={() => onVerPuesto(ya)}>Ya está en el puesto {ya}</button>
                  ) : (
                    <>
                      <button type="button" className="btn tde-btn-chico" disabled={!!reemplazando && reemplazando.id !== c.id}
                        onClick={() => onAgregar(c)}>
                        {lleno ? "Agregar (reemplaza a…)" : "Agregar"}
                      </button>
                      {!lleno && bloque.entradas.length > 0 && (
                        <button type="button" className="tde-link" disabled={!!reemplazando}
                          onClick={() => onElegirReemplazo(c)}>
                          Reemplazar…
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {detalle && (
        <DetalleCandidato c={detalle} plataforma={plataforma} ya={puestoDe(bloque.entradas, detalle.tipo, detalle.id)} lleno={lleno}
          onCerrar={() => setDetalle(null)} onAgregar={() => { onAgregar(detalle); setDetalle(null); }} />
      )}
    </section>
  );
}

function DetalleCandidato({ c, plataforma, ya, lleno, onCerrar, onAgregar }: {
  c: CandidatoTop; plataforma: PlatformCode; ya: number | null; lleno: boolean;
  onCerrar: () => void; onAgregar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="tde-detalle" aria-labelledby="tde-detalle-titulo" onClose={onCerrar}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="tde-detalle-cuerpo">
        {c.poster
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={posterTam(c.poster, "w500") ?? ""} alt={`Póster de ${c.titulo}`} className="tde-detalle-poster" />
          : <div className="tde-sin-poster tde-detalle-poster">Sin póster</div>}
        <div className="tde-detalle-info">
          <h3 id="tde-detalle-titulo">{c.titulo}</h3>
          <p className="tde-res-meta">{c.year ?? "Sin año"} · {c.tipo === "movie" ? "Película" : "Serie"} · <code>{c.tipo}:{c.id}</code></p>
          {originalDistinto(c.titulo, c.tituloOriginal) && <p className="tde-res-original">Título original: {c.tituloOriginal}</p>}
          {c.resumen && <p className="tde-detalle-resumen">{c.resumen}</p>}
          <p className="admin-nota">
            {c.plataformas.length ? `TMDB lo ubica en: ${c.plataformas.map(nombre).join(", ")}.` : "TMDB no lo ubica en ninguna plataforma para Argentina."}
            {!c.confirmadoEnPlataforma && ` Cargarlo en ${nombre(plataforma)} lo confirma manualmente.`}
          </p>
          <div className="tde-detalle-acciones">
            {ya ? <span className="tde-ya">Ya está en el puesto {ya}</span>
              : <button type="button" className="btn" onClick={onAgregar}>{lleno ? "Agregar (elegir a quién reemplaza)" : "Agregar"}</button>}
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Cerrar</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

// --- Íconos -----------------------------------------------------------------------

function Tirador() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true" focusable="false">
      {[3, 10, 17].map((y) => [4, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill="currentColor" />))}
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
