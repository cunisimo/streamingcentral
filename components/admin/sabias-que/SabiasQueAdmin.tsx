"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import SabiasQueTarjeta, { SabiasQueTitulo } from "@/components/SabiasQueTarjeta";
import {
  ETIQUETA_ACCION, ETIQUETA_ESTADO, ETIQUETA_FILTRO, FILTROS_ESTADO, LIMITES,
  accionesDisponibles, fechaCorta, fuenteDe, mismosCampos, normalizarCampos, sinErrores, sinGuardar,
  validarPublicacion,
  type AccionPanel, type CamposCuriosidad, type CuriosidadAdmin, type ErroresCampos,
  type FiltroEstado, type TipoTitulo,
} from "@/lib/curiosidades-nucleo";

// Panel «¿Sabías que…?» (`/admin/sabias-que`).
//
// Qué está guardado y qué está publicado se ve SIEMPRE en el recuadro de estado
// del editor, y la vista previa usa la MISMA tarjeta que la ficha. Guardar un
// borrador nunca cambia la versión publicada (la base guarda las dos por
// separado, migración 025); retirar conserva el contenido.

export interface ResultadoBusqueda {
  id: number;
  tipo: TipoTitulo;
  titulo: string;
  year: number | null;
  poster: string | null;
  tituloOriginal: string | null;
}

export interface AltaApi {
  tipo: TipoTitulo;
  tmdbId: number;
  titulo: string;
  anio: number | null;
  poster: string | null;
  campos: CamposCuriosidad;
  publicar: boolean;
}

export interface ApiSabiasQue {
  listar(q: string, filtro: FiltroEstado): Promise<CuriosidadAdmin[]>;
  deTitulo(tipo: TipoTitulo, id: number): Promise<CuriosidadAdmin | null>;
  crear(alta: AltaApi): Promise<CuriosidadAdmin>;
  guardar(id: string, campos: CamposCuriosidad, publicar: boolean): Promise<CuriosidadAdmin>;
  retirar(id: string): Promise<CuriosidadAdmin>;
  buscar(q: string, signal: AbortSignal): Promise<ResultadoBusqueda[]>;
}

export class ErrorApiSq extends Error {
  readonly status: number;
  readonly errores: ErroresCampos | null;
  readonly existente: CuriosidadAdmin | null;
  constructor(m: string, status: number, errores: ErroresCampos | null, existente: CuriosidadAdmin | null) {
    super(m);
    this.status = status;
    this.errores = errores;
    this.existente = existente;
  }
}

/** Lo que está abierto en el editor: una fila guardada o un título nuevo. */
type Abierto =
  | { tipo: "fila"; fila: CuriosidadAdmin }
  | { tipo: "nuevo"; titulo: ResultadoBusqueda };

const VACIO: CamposCuriosidad = { texto: "", fuenteNombre: "", fuenteUrl: "", spoiler: false };
const tipoLegible = (t: TipoTitulo) => (t === "tv" ? "Serie" : "Película");
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function SabiasQueAdmin({ api }: { api: ApiSabiasQue }) {
  // --- Listado -----------------------------------------------------------------
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("todas");
  const [filas, setFilas] = useState<CuriosidadAdmin[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [nonceLista, setNonceLista] = useState(0);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      api.listar(q, filtro)
        .then((f) => { if (vivo) { setFilas(f); setErrorLista(null); } })
        .catch((e) => { if (vivo) setErrorLista(msg(e)); });
    }, q ? 250 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [api, q, filtro, nonceLista]);

  // --- Editor ------------------------------------------------------------------
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const [form, setForm] = useState<CamposCuriosidad>(VACIO);
  const [pendiente, setPendiente] = useState<Abierto | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [duplicado, setDuplicado] = useState<CuriosidadAdmin | null>(null);

  const fila = abierto?.tipo === "fila" ? abierto.fila : null;
  const formNorm = useMemo(() => normalizarCampos(form), [form]);
  const sucio = abierto ? sinGuardar(fila, formNorm) : false;

  // Salir de la página con cambios sin guardar: el aviso nativo del navegador.
  useEffect(() => {
    if (!sucio) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sucio]);

  const abrirYa = useCallback((a: Abierto) => {
    setAbierto(a);
    setForm(a.tipo === "fila" ? a.fila.borrador : VACIO);
    setPendiente(null);
    setAviso(null);
    setDuplicado(null);
  }, []);

  // Cambiar de título con cambios sin guardar pide confirmación (en la página,
  // sin diálogos del navegador).
  const abrir = (a: Abierto) => { if (sucio) setPendiente(a); else abrirYa(a); };

  /** Al elegir un resultado de TMDB: si ya tiene curiosidad, se ofrece editarla. */
  const [comprobando, setComprobando] = useState(false);
  async function elegirResultado(r: ResultadoBusqueda) {
    setComprobando(true);
    setDuplicado(null);
    try {
      const existente = await api.deTitulo(r.tipo, r.id);
      if (existente) { setDuplicado(existente); return; }
      abrir({ tipo: "nuevo", titulo: r });
    } catch (e) {
      setAviso({ texto: `No se pudo comprobar si el título ya tiene curiosidad: ${msg(e)}`, tipo: "error" });
    } finally {
      setComprobando(false);
    }
  }

  return (
    <div className="admin admin-sq">
      <h1>¿Sabías que…?</h1>
      <p className="section-sub">
        Curiosidades editoriales que se ven en la ficha, debajo de las reseñas. Una por título.
        Sólo se muestra lo publicado.
      </p>

      <div className="sq-adm-grid">
        <div className="sq-adm-col">
          <Buscador api={api} ocupado={comprobando} onElegir={elegirResultado} />
          {duplicado && (
            <div className="sq-adm-nota" role="status">
              <p><b>{duplicado.titulo}</b> ya tiene una curiosidad ({ETIQUETA_ESTADO[duplicado.estado].toLowerCase()}).</p>
              <button type="button" className="btn ghost sq-adm-btn" onClick={() => abrir({ tipo: "fila", fila: duplicado })}>
                Editar la existente
              </button>
            </div>
          )}

          <section className="sq-adm-panel" aria-labelledby="sq-cargadas">
            <h2 id="sq-cargadas" className="sq-adm-h">Curiosidades cargadas</h2>
            <div className="sq-adm-filtros">
              <label className="sq-adm-campo">
                <span>Buscar por título</span>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej.: Volver al futuro" />
              </label>
              <label className="sq-adm-campo">
                <span>Estado</span>
                <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroEstado)}>
                  {FILTROS_ESTADO.map((f) => <option key={f} value={f}>{ETIQUETA_FILTRO[f]}</option>)}
                </select>
              </label>
            </div>
            {errorLista ? (
              <p className="admin-error" role="alert">
                No se pudo cargar el listado: {errorLista}{" "}
                <button type="button" className="sq-adm-link" onClick={() => setNonceLista((n) => n + 1)}>Reintentar</button>
              </p>
            ) : filas === null ? (
              <p className="loading">Cargando…</p>
            ) : filas.length === 0 ? (
              <p className="sq-adm-vacio">{q || filtro !== "todas" ? "Nada coincide con la búsqueda." : "Todavía no hay curiosidades. Buscá un título arriba para cargar la primera."}</p>
            ) : (
              <ul className="sq-adm-lista">
                {filas.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button" className="sq-adm-fila" aria-current={fila?.id === f.id ? "true" : undefined}
                      onClick={() => abrir({ tipo: "fila", fila: f })}
                    >
                      <Poster src={f.poster} chico />
                      <span className="sq-adm-fila-info">
                        <span className="sq-adm-fila-t">{f.titulo}</span>
                        <span className="sq-adm-fila-m">{[f.anio, tipoLegible(f.tipo)].filter(Boolean).join(" · ")}</span>
                      </span>
                      <EstadoChip estado={f.estado} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="sq-adm-col">
          {pendiente && (
            <div className="sq-adm-nota aviso" role="alert">
              <p>Tenés cambios sin guardar en <b>{abierto?.tipo === "fila" ? abierto.fila.titulo : abierto?.titulo.titulo}</b>.</p>
              <div className="sq-adm-botones">
                <button type="button" className="btn ghost sq-adm-btn" onClick={() => setPendiente(null)}>Seguir editando</button>
                <button type="button" className="btn sq-adm-btn" onClick={() => abrirYa(pendiente)}>Descartar cambios y abrir el otro</button>
              </div>
            </div>
          )}
          {abierto ? (
            <Editor
              key={abierto.tipo === "fila" ? `${abierto.fila.tipo}:${abierto.fila.tmdbId}` : `${abierto.titulo.tipo}:${abierto.titulo.id}`}
              api={api} abierto={abierto} form={form} setForm={setForm} sucio={sucio}
              aviso={aviso} setAviso={setAviso}
              onGuardada={(f) => {
                setAbierto({ tipo: "fila", fila: f });
                setForm(f.borrador);
                setNonceLista((n) => n + 1);
              }}
              onDuplicado={(f) => { setDuplicado(f); }}
            />
          ) : (
            <section className="sq-adm-panel sq-adm-placeholder">
              <p>Elegí un título de la búsqueda o una curiosidad cargada para editarla.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================

function Buscador({ api, ocupado, onElegir }: {
  api: ApiSabiasQue; ocupado: boolean; onElegir: (r: ResultadoBusqueda) => void;
}) {
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<ResultadoBusqueda[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const idInput = useId();

  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) { setRes(null); setError(null); setCargando(false); return; }
    const ctrl = new AbortController();
    setCargando(true);
    const h = setTimeout(() => {
      api.buscar(t, ctrl.signal)
        .then((r) => { setRes(r); setError(null); setCargando(false); })
        .catch((e) => { if (!ctrl.signal.aborted) { setError(msg(e)); setCargando(false); } });
    }, 300);
    return () => { clearTimeout(h); ctrl.abort(); };
  }, [api, texto]);

  return (
    <section className="sq-adm-panel" aria-labelledby="sq-nueva">
      <h2 id="sq-nueva" className="sq-adm-h">Nueva curiosidad</h2>
      <label className="sq-adm-campo" htmlFor={idInput}>
        <span>Buscar película o serie en TMDB</span>
      </label>
      <input id={idInput} type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Título…" autoComplete="off" />
      <div aria-live="polite" className="sq-adm-estado-busqueda">
        {cargando ? "Buscando…" : error ? `No se pudo buscar: ${error}` : res && res.length === 0 ? "Sin resultados." : ""}
      </div>
      {res && res.length > 0 && (
        <ul className="sq-adm-resultados">
          {res.map((r) => (
            <li key={`${r.tipo}:${r.id}`} className="sq-adm-res">
              <Poster src={r.poster} />
              <div className="sq-adm-res-info">
                <span className="sq-adm-res-t">{r.titulo}</span>
                <span className="sq-adm-res-m">{[r.year, tipoLegible(r.tipo)].filter(Boolean).join(" · ")}</span>
                {r.tituloOriginal && r.tituloOriginal !== r.titulo && (
                  <span className="sq-adm-res-m">Original: {r.tituloOriginal}</span>
                )}
                <span className="sq-adm-res-m faint">TMDB {r.id}</span>
                <button
                  type="button" className="btn ghost sq-adm-btn" disabled={ocupado} onClick={() => onElegir(r)}
                  aria-label={`Cargar curiosidad de ${r.titulo}${r.year ? ` (${r.year})` : ""}, ${tipoLegible(r.tipo)}`}
                >
                  Cargar curiosidad
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// =============================================================================

function Editor({ api, abierto, form, setForm, sucio, aviso, setAviso, onGuardada, onDuplicado }: {
  api: ApiSabiasQue;
  abierto: Abierto;
  form: CamposCuriosidad;
  setForm: (f: CamposCuriosidad) => void;
  sucio: boolean;
  aviso: { texto: string; tipo: "ok" | "error" } | null;
  setAviso: (a: { texto: string; tipo: "ok" | "error" } | null) => void;
  onGuardada: (f: CuriosidadAdmin) => void;
  onDuplicado: (f: CuriosidadAdmin | null) => void;
}) {
  const fila = abierto.tipo === "fila" ? abierto.fila : null;
  const ident = fila
    ? { tipo: fila.tipo, id: fila.tmdbId, titulo: fila.titulo, anio: fila.anio, poster: fila.poster, original: null as string | null }
    : { tipo: abierto.tipo === "nuevo" ? abierto.titulo.tipo : "movie" as TipoTitulo,
        id: abierto.tipo === "nuevo" ? abierto.titulo.id : 0,
        titulo: abierto.tipo === "nuevo" ? abierto.titulo.titulo : "",
        anio: abierto.tipo === "nuevo" ? abierto.titulo.year : null,
        poster: abierto.tipo === "nuevo" ? abierto.titulo.poster : null,
        original: abierto.tipo === "nuevo" ? abierto.titulo.tituloOriginal : null };

  const norm = useMemo(() => normalizarCampos(form), [form]);
  const faltan = useMemo(() => validarPublicacion(norm), [norm]);
  const puedePublicar = sinErrores(faltan);
  const acciones = accionesDisponibles(fila, norm);
  const [enCurso, setEnCurso] = useState<AccionPanel | null>(null);
  const [erroresServidor, setErroresServidor] = useState<ErroresCampos | null>(null);
  const [mostrarFaltantes, setMostrarFaltantes] = useState(false);
  const [confirmarRetiro, setConfirmarRetiro] = useState(false);
  const avisoRef = useRef<HTMLDivElement>(null);

  const errores: ErroresCampos = { ...(mostrarFaltantes ? faltan : {}), ...(erroresServidor ?? {}) };
  const ids = { texto: useId(), nombre: useId(), url: useId(), spoiler: useId() };

  async function ejecutar(a: AccionPanel) {
    if (a === "retirar" && !confirmarRetiro) { setConfirmarRetiro(true); return; }
    setConfirmarRetiro(false);
    const publicar = a === "publicar" || a === "guardar-publicar";
    if (publicar && !puedePublicar) { setMostrarFaltantes(true); return; }
    setEnCurso(a);
    setAviso(null);
    setErroresServidor(null);
    try {
      let f: CuriosidadAdmin;
      if (a === "retirar" && fila) f = await api.retirar(fila.id);
      else if (fila) f = await api.guardar(fila.id, norm, publicar);
      else {
        f = await api.crear({
          tipo: ident.tipo, tmdbId: ident.id, titulo: ident.titulo, anio: ident.anio,
          poster: ident.poster, campos: norm, publicar,
        });
      }
      onGuardada(f);
      setMostrarFaltantes(false);
      setAviso({
        tipo: "ok",
        texto: a === "retirar" ? "Retirada de publicación. Ya no se ve en la ficha; el contenido se conservó."
          : publicar ? "Publicada. Ya se ve en la ficha."
          : f.publicada ? "Borrador guardado. La versión publicada no cambió: los usuarios siguen viendo la anterior."
          : "Borrador guardado.",
      });
    } catch (e) {
      if (e instanceof ErrorApiSq && e.status === 409) onDuplicado(e.existente);
      if (e instanceof ErrorApiSq && e.errores) setErroresServidor(e.errores);
      setAviso({ tipo: "error", texto: msg(e) });
    } finally {
      setEnCurso(null);
      requestAnimationFrame(() => avisoRef.current?.focus());
    }
  }

  const cambia = (p: Partial<CamposCuriosidad>) => { setErroresServidor(null); setForm({ ...form, ...p }); };
  const pub = fila?.publicadaVersion ?? null;

  return (
    <section className="sq-adm-panel sq-adm-editor" aria-labelledby="sq-editor-t">
      <header className="sq-adm-ident">
        <Poster src={ident.poster} />
        <div>
          <h2 id="sq-editor-t" className="sq-adm-ident-t">{ident.titulo}</h2>
          <p className="sq-adm-res-m">{[ident.anio, tipoLegible(ident.tipo)].filter(Boolean).join(" · ")}</p>
          {ident.original && ident.original !== ident.titulo && <p className="sq-adm-res-m">Original: {ident.original}</p>}
          <p className="sq-adm-res-m faint">TMDB {ident.id}</p>
          {fila && <p className="sq-adm-chip-fila"><EstadoChip estado={fila.estado} /></p>}
        </div>
      </header>

      <dl className="sq-adm-estado" aria-label="Estado de la curiosidad">
        <div>
          <dt>Borrador</dt>
          <dd>{fila ? `Guardado el ${fechaCorta(fila.actualizadaEn)}` : "Todavía no se guardó."}
            {sucio && <b className="sq-adm-sucio"> · Tenés cambios sin guardar.</b>}</dd>
        </div>
        <div>
          <dt>Publicación</dt>
          <dd>
            {!fila || !pub ? "Nunca se publicó: los usuarios no ven nada."
              : fila.publicada ? `Publicada el ${fechaCorta(fila.publicadaEn)}: es lo que ven los usuarios.`
              : "Retirada: los usuarios no la ven. El contenido se conserva para volver a publicarla."}
            {fila?.estado === "cambios" && <b> El borrador guardado tiene cambios que todavía no se publicaron.</b>}
          </dd>
        </div>
      </dl>

      <div className="field">
        <label htmlFor={ids.texto}>Curiosidad</label>
        <textarea
          id={ids.texto} value={form.texto} maxLength={LIMITES.texto + 50} rows={6}
          aria-invalid={!!errores.texto} aria-describedby={`${ids.texto}-ayuda`}
          onChange={(e) => cambia({ texto: e.target.value })}
          placeholder="Texto plano, sin formato. Contalo como si se lo contaras a un amigo."
        />
        <p id={`${ids.texto}-ayuda`} className={`sq-adm-ayuda${norm.texto.length > LIMITES.texto ? " error" : ""}`}>
          {errores.texto ? <span className="sq-adm-error">{errores.texto} </span> : null}
          {norm.texto.length}/{LIMITES.texto}
        </p>
      </div>
      <div className="sq-adm-dos">
        <div className="field">
          <label htmlFor={ids.nombre}>Nombre de la fuente <span className="faint">(opcional)</span></label>
          <input id={ids.nombre} value={form.fuenteNombre} maxLength={LIMITES.fuenteNombre + 20}
            aria-invalid={!!errores.fuenteNombre} aria-describedby={`${ids.nombre}-e`}
            onChange={(e) => cambia({ fuenteNombre: e.target.value })} placeholder="Ej.: Wikipedia" />
          <p id={`${ids.nombre}-e`} className="sq-adm-error">{errores.fuenteNombre ?? ""}</p>
        </div>
        <div className="field">
          <label htmlFor={ids.url}>URL de la fuente <span className="faint">(opcional)</span></label>
          <input id={ids.url} value={form.fuenteUrl} inputMode="url" autoComplete="off" spellCheck={false}
            maxLength={LIMITES.fuenteUrl + 20}
            aria-invalid={!!errores.fuenteUrl} aria-describedby={`${ids.url}-e`}
            onChange={(e) => cambia({ fuenteUrl: e.target.value })} placeholder="https://…" />
          <p id={`${ids.url}-e`} className="sq-adm-error">{errores.fuenteUrl ?? ""}</p>
        </div>
      </div>
      <label className="sq-adm-check" htmlFor={ids.spoiler}>
        <input id={ids.spoiler} type="checkbox" checked={form.spoiler} onChange={(e) => cambia({ spoiler: e.target.checked })} />
        <span>Contiene spoilers <span className="faint">(en la ficha el texto queda oculto hasta tocar «Mostrar curiosidad»)</span></span>
      </label>

      {!puedePublicar && (
        <p className="sq-adm-ayuda">Para publicar hace falta el texto. La fuente es opcional; si ponés una URL, tiene que empezar con http:// o https://. El borrador se puede guardar incompleto.</p>
      )}

      {confirmarRetiro && (
        <div className="sq-adm-nota aviso" role="alert">
          <p>¿Retirar de publicación? Los usuarios dejan de verla en la ficha. El texto y la fuente se conservan para volver a publicarla.</p>
          <div className="sq-adm-botones">
            <button type="button" className="btn ghost sq-adm-btn" onClick={() => setConfirmarRetiro(false)}>Cancelar</button>
            <button type="button" className="btn sq-adm-btn peligro" onClick={() => void ejecutar("retirar")}>Retirar</button>
          </div>
        </div>
      )}

      <div className="sq-adm-botones">
        {acciones.map((a) => {
          const deshabilitado = !!enCurso
            || (a === "guardar" && !!fila && !sucio)
            || ((a === "publicar" || a === "guardar-publicar") && !puedePublicar && mostrarFaltantes);
          return (
            <button
              key={a} type="button" disabled={deshabilitado}
              className={`btn sq-adm-btn${a === "guardar" ? " ghost" : ""}${a === "retirar" ? " ghost peligro" : ""}`}
              onClick={() => void ejecutar(a)}
            >
              {enCurso === a ? "Guardando…" : ETIQUETA_ACCION[a]}
            </button>
          );
        })}
      </div>
      <div ref={avisoRef} tabIndex={-1} aria-live="polite" className={`sq-adm-aviso${aviso ? ` ${aviso.tipo}` : ""}`}>
        {aviso?.texto ?? ""}
      </div>

      <div className="sq-adm-preview">
        <h3 className="sq-adm-h3">Vista previa en la ficha{fila?.publicada && !mismosCampos(norm, pub) ? " (borrador)" : ""}</h3>
        <div className="sq-adm-marco">
          {norm.texto ? (
            <section className="sq">
              <SabiasQueTitulo />
              <SabiasQueTarjeta
                key={`b:${norm.spoiler}`}
                c={{ texto: norm.texto, spoiler: norm.spoiler, fuente: fuenteDe(norm.fuenteNombre, norm.fuenteUrl) }}
              />
            </section>
          ) : <p className="sq-adm-vacio">La vista previa aparece cuando escribas el texto.</p>}
        </div>
        {fila?.publicada && pub && !mismosCampos(norm, pub) && (
          <>
            <h3 className="sq-adm-h3">Lo que ven hoy los usuarios</h3>
            <div className="sq-adm-marco">
              <section className="sq">
                <SabiasQueTitulo />
                <SabiasQueTarjeta key={`p:${pub.spoiler}`} c={{ texto: pub.texto, spoiler: pub.spoiler, fuente: fuenteDe(pub.fuenteNombre, pub.fuenteUrl) }} />
              </section>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Poster({ src, chico = false }: { src: string | null; chico?: boolean }) {
  const cls = `sq-adm-poster${chico ? " chico" : ""}`;
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className={cls} src={src} alt="" loading="lazy" /> : <span className={`${cls} vacio`} aria-hidden="true" />;
}

function EstadoChip({ estado }: { estado: CuriosidadAdmin["estado"] }) {
  return <span className={`sq-adm-chip ${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
}
