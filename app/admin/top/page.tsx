"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminSesion } from "@/components/admin/useAdminSesion";
import { PLATFORMS } from "@/lib/providers-ar";
import {
  BLOQUES, TOP_PLATAFORMAS, claveBloque, validarBloque,
  type EntradaTop,
} from "@/lib/top-manual-nucleo";
import type { MediaType, PlatformCode } from "@/lib/types";

// El dashboard del Top semanal.
//
// ============================================================================
// LO QUE ORDENA ESTA PANTALLA
// ============================================================================
// Doce bloques (seis plataformas × dos tipos) de diez posiciones. Se editan por
// separado, se marcan como revisados uno por uno y se publican los que estén
// listos: los demás conservan su última versión publicada y no se tocan.
//
// 🔴 CUALQUIER CAMBIO DESMARCA "REVISADO". La marca vale para el contenido que
// había cuando se puso; si guardar o reordenar no la limpiara, se podría
// publicar un bloque distinto del que se revisó. Lo hace el servidor
// (`reemplazarEntradas` y `guardarPosicion` en lib/top-manual.ts), no esta
// pantalla: si dependiera del cliente, una llamada directa a la API lo saltearía.
//
// 🔴 NO SE PUBLICA CON GUARDADOS PENDIENTES O FALLIDOS. Publicar lee de la base;
// si algo no llegó, se publicaría una versión que en pantalla ya no existe.

interface RankingFila {
  id: string;
  plataforma: PlatformCode;
  tipo: MediaType;
  estado: "borrador" | "publicado";
  captured_at: string;
  revisado_por: string | null;
  entradas: EntradaTop[];
}

type Guardado = "limpio" | "guardando" | "guardado" | "error";

interface Candidato {
  id: number; tipo: MediaType; titulo: string; year: number | null;
  poster: string | null; plataformas: PlatformCode[]; confirmadoEnPlataforma: boolean;
}

const nombre = (c: PlatformCode) => PLATFORMS.find((p) => p.code === c)?.name ?? c;

export default function AdminTopPage() {
  const { token, estado } = useAdminSesion();
  const [borradores, setBorradores] = useState<RankingFila[]>([]);
  const [plataforma, setPlataforma] = useState<PlatformCode>("n");
  const [tipo, setTipo] = useState<MediaType>("movie");
  const [guardado, setGuardado] = useState<Guardado>("limpio");
  const [error, setError] = useState<string | null>(null);
  const [publicados, setPublicados] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);

  const pedir = useCallback(async (body?: unknown): Promise<RankingFila[] | null> => {
    if (!token) return null;
    const res = await fetch("/api/admin/top", {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error ?? `error ${res.status}`);
    return (j.borradores ?? null) as RankingFila[] | null;
  }, [token]);

  useEffect(() => {
    if (estado !== "listo" || !token) return;
    let vivo = true;
    (async () => {
      try {
        const b = await pedir();
        if (vivo && b) setBorradores(b);
      } catch (e) { if (vivo) setError(String((e as Error).message ?? e)); }
      finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [estado, token, pedir]);

  // Qué bloques ya tienen publicación. Sale del propio payload público, que es
  // la misma fuente que decide el cutover: así el contador no puede decir 12/12
  // mientras `/api/top` sigue sirviendo la fuente vieja.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/top?tipo=movie&providers=");
        const j = await r.json();
        const conMarca = new Set<string>();
        for (const b of [...(j.mine ?? []), ...(j.others ?? [])]) {
          if (b.source === "manual") conMarca.add(claveBloque(b.platform, "movie"));
        }
        const r2 = await fetch("/api/top?tipo=tv&providers=");
        const j2 = await r2.json();
        for (const b of [...(j2.mine ?? []), ...(j2.others ?? [])]) {
          if (b.source === "manual") conMarca.add(claveBloque(b.platform, "tv"));
        }
        if (vivo) setPublicados(conMarca);
      } catch { /* el contador es informativo; su fallo no bloquea la edición */ }
    })();
    return () => { vivo = false; };
  }, [borradores]);

  const actual = useMemo(
    () => borradores.find((b) => b.plataforma === plataforma && b.tipo === tipo) ?? null,
    [borradores, plataforma, tipo],
  );

  const accion = useCallback(async (body: Record<string, unknown>) => {
    setGuardado("guardando"); setError(null);
    try {
      const b = await pedir(body);
      if (b) setBorradores(b);
      setGuardado("guardado");
    } catch (e) {
      setGuardado("error");
      setError(String((e as Error).message ?? e));
    }
  }, [pedir]);

  const revisados = borradores.filter((b) => b.revisado_por && !validarBloque(b.entradas).length);
  const pendientes = BLOQUES.length - revisados.length;

  async function publicarRevisados() {
    if (guardado === "guardando" || guardado === "error") return;
    setGuardado("guardando"); setError(null);
    try {
      const res = await fetch("/api/admin/top", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "publicar", ids: revisados.map((b) => b.id) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `error ${res.status}`);
      const fallidos = (j.resultados ?? []).filter((r: { publicado: boolean }) => !r.publicado);
      if (fallidos.length) {
        setError(`No se publicaron ${fallidos.length}: ` +
          fallidos.map((f: { plataforma: string; tipo: string; motivo: string }) =>
            `${f.plataforma}/${f.tipo} (${f.motivo})`).join(", "));
      }
      const b = await pedir();
      if (b) setBorradores(b);
      setGuardado("guardado");
    } catch (e) {
      setGuardado("error"); setError(String((e as Error).message ?? e));
    }
  }

  if (estado !== "listo") return <div className="admin"><p className="loading">Verificando el segundo factor…</p></div>;
  if (cargando) return <div className="admin"><p className="loading">Cargando bloques…</p></div>;

  return (
    <div className="admin admin-top">
      <h1>Top semanal</h1>

      {/* Preparación inicial: hasta que estén los doce, `/top` sigue con la
          fuente vieja. El cutover es atómico y esto es lo que lo hace visible. */}
      <p className="admin-nota">
        Preparación inicial: <strong>{publicados.size} de 12 publicados</strong>.{" "}
        {publicados.size === 12
          ? "El Top público ya usa la carga manual."
          : "Hasta que estén los doce, el Top público sigue con la fuente anterior."}
      </p>

      <div className="admin-filtros">
        <label htmlFor="plat">Plataforma</label>
        <select id="plat" value={plataforma} onChange={(e) => setPlataforma(e.target.value as PlatformCode)}>
          {TOP_PLATAFORMAS.map((c) => <option key={c} value={c}>{nombre(c)}</option>)}
        </select>

        <div role="group" aria-label="Tipo">
          {(["movie", "tv"] as MediaType[]).map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
              {t === "movie" ? "Películas" : "Series"}
            </button>
          ))}
        </div>

        <span className={`admin-guardado admin-guardado-${guardado}`} role="status">
          {guardado === "guardando" ? "Guardando…"
            : guardado === "guardado" ? "Guardado"
            : guardado === "error" ? "No se pudo guardar" : ""}
        </span>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {actual && (
        <BloqueEditor
          key={actual.id}
          fila={actual}
          token={token}
          onAccion={accion}
        />
      )}

      <section className="admin-publicar">
        <h2>Publicación</h2>
        <p>
          Revisados y completos: <strong>{revisados.length}</strong> · Pendientes:{" "}
          <strong>{pendientes}</strong>
        </p>
        <button
          type="button"
          onClick={publicarRevisados}
          // No se publica con guardados en vuelo o fallidos: publicar lee de la
          // base, y si algo no llegó se publicaría lo que en pantalla ya no está.
          disabled={!revisados.length || guardado === "guardando" || guardado === "error"}
        >
          Publicar revisados ({revisados.length})
        </button>
        {guardado === "error" && (
          <p className="admin-nota">Hay un guardado fallido: resolvelo antes de publicar.</p>
        )}
      </section>
    </div>
  );
}

// --- el editor de un bloque --------------------------------------------------

function BloqueEditor({ fila, token, onAccion }: {
  fila: RankingFila;
  token: string | null;
  onAccion: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [buscandoPos, setBuscandoPos] = useState<number | null>(null);
  const motivos = validarBloque(fila.entradas);

  const porPos = new Map(fila.entradas.map((e) => [e.posicion, e]));
  const filas = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <section className="admin-bloque">
      <header>
        <h2>{nombre(fila.plataforma)} · {fila.tipo === "movie" ? "Películas" : "Series"}</h2>
        <label>
          Fecha de captura
          <input type="date" defaultValue={fila.captured_at} readOnly />
        </label>
      </header>

      <ol className="admin-posiciones">
        {filas.map((pos) => {
          const e = porPos.get(pos);
          return (
            <li key={pos}>
              <span className="admin-rank">{pos}</span>
              {e ? (
                <>
                  <span className="admin-titulo">{e.titulo}</span>
                  <code>{e.tipo}:{e.tmdb_id}</code>
                </>
              ) : <span className="admin-vacio">— sin título —</span>}

              <button type="button" onClick={() => setBuscandoPos(pos)}>Cambiar</button>
              <button type="button" disabled={pos === 1}
                onClick={() => onAccion({ accion: "reordenar", id: fila.id, desde: pos, hasta: pos - 1 })}
                aria-label={`Subir la posición ${pos}`}>↑</button>
              <button type="button" disabled={pos === 10}
                onClick={() => onAccion({ accion: "reordenar", id: fila.id, desde: pos, hasta: pos + 1 })}
                aria-label={`Bajar la posición ${pos}`}>↓</button>
            </li>
          );
        })}
      </ol>

      {buscandoPos !== null && (
        <Buscador
          token={token} tipo={fila.tipo} plataforma={fila.plataforma}
          onCerrar={() => setBuscandoPos(null)}
          onElegir={async (c) => {
            await onAccion({
              accion: "guardar", id: fila.id,
              entrada: { posicion: buscandoPos, tipo: c.tipo, tmdb_id: c.id, titulo: c.titulo },
            });
            setBuscandoPos(null);
          }}
        />
      )}

      <div className="admin-acciones">
        <label>
          <input
            type="checkbox" checked={!!fila.revisado_por} disabled={!!motivos.length}
            onChange={(ev) => onAccion({ accion: "revisar", id: fila.id, revisado: ev.target.checked })}
          />
          Bloque revisado
        </label>
        <button type="button" onClick={() => onAccion({ accion: "restaurar", id: fila.id })}>
          Deshacer cambios del bloque
        </button>
        <button type="button" onClick={() => onAccion({ accion: "corregir", id: fila.id })}>
          Corregir la publicación vigente
        </button>
      </div>

      {!!motivos.length && (
        <p className="admin-nota">Falta para poder publicar: {motivos.join("; ")}.</p>
      )}
    </section>
  );
}

// --- buscador de títulos -----------------------------------------------------

function Buscador({ token, tipo, plataforma, onElegir, onCerrar }: {
  token: string | null; tipo: MediaType; plataforma: PlatformCode;
  onElegir: (c: Candidato) => void; onCerrar: () => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Candidato[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return; }
    const mio = ++req.current;
    const t = setTimeout(async () => {
      setBuscando(true); setError(null);
      try {
        const url = `/api/admin-search?q=${encodeURIComponent(q)}&tipo=${tipo}&plataforma=${plataforma}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json();
        if (mio !== req.current) return; // respuesta obsoleta
        if (!r.ok) throw new Error(j?.error ?? `error ${r.status}`);
        setItems(j.items ?? []);
      } catch (e) {
        // 🔴 UN FALLO DE TMDB NO PIERDE EL BORRADOR: sólo se vacía la lista de
        // candidatos. Lo cargado sigue en la base.
        if (mio === req.current) { setItems([]); setError(String((e as Error).message ?? e)); }
      } finally { if (mio === req.current) setBuscando(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, tipo, plataforma, token]);

  return (
    <div className="admin-buscador">
      <label htmlFor="buscar">Buscar en TMDB</label>
      <input id="buscar" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
      <button type="button" onClick={onCerrar}>Cancelar</button>
      {buscando && <p className="loading">Buscando…</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      <ul>
        {items.map((c) => (
          <li key={`${c.tipo}:${c.id}`}>
            {c.poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.poster} alt="" width={40} height={60} />
            )}
            <span>{c.titulo}</span>
            <span>{c.year ?? "—"}</span>
            <code>{c.tipo}:{c.id}</code>
            {/* La advertencia NO bloquea: confirmar igual es justamente lo que
                convierte esta elección en evidencia manual de disponibilidad, y
                es lo que evita que el título salga en gris por un atraso de
                TMDB. Ver la procedencia `top-manual` en lib/disponibilidad.ts. */}
            {!c.confirmadoEnPlataforma && (
              <em className="admin-aviso">
                TMDB todavía no lo confirma en {nombre(plataforma)} para Argentina
              </em>
            )}
            <button type="button" onClick={() => onElegir(c)}>Elegir</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
