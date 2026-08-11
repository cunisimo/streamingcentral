"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlatforms } from "../PlatformsContext";
import { useAuth } from "../AuthContext";
import { itemRefs } from "@/lib/userdata";
import { useRouletteSeen } from "@/hooks/useRouletteSeen";
import RuletaCard from "./RuletaCard";
import type { Escenario, RoulettePick } from "@/lib/roulette";

// Tope de `excluir` que se aplica ACÁ, antes de armar la URL — no alcanza con
// el `MAX_EXCLUIR` de lib/roulette.ts, que recién actúa del lado del server:
// `itemRefs("watched")` no tiene límite, así que alguien con ~2000 títulos
// vistos arma un query string de ~16 KB y el request muere con 431 antes de
// llegar al handler. Mismo valor que MAX_EXCLUIR en lib/roulette.ts (ese
// queda como red de contención, no como el límite real).
const MAX_EXCLUIR = 500;

// Tres escenarios, mutuamente excluyentes y definidos por duración. El subtítulo
// dice el corte real en vez de una promesa vaga: el filtro ahora es un dato duro
// de TMDB, así que se puede prometer exactamente lo que se cumple.
const SITUACIONES: { id: Escenario; ico: string; tit: string; sub: string }[] = [
  { id: "corta",  ico: "⏱️", tit: "Tengo poco tiempo",   sub: "1 h 30 o menos" },
  { id: "larga",  ico: "🌙", tit: "Tengo toda la noche", sub: "Más de 1 h 30" },
  { id: "chicos", ico: "🧸", tit: "Con chicos",          sub: "Que la vean todos" },
];

export default function RuletaBanner() {
  const { platforms } = usePlatforms();
  const { user } = useAuth();
  const { seen, add, reset } = useRouletteSeen();
  // Los "ya la vi" del usuario, que también van en p_excluir: la ruleta arranca
  // sabiendo lo que ya vio desde el primer uso. Se piden una vez al abrir el
  // panel, no en cada tanda. Sin sesión queda resuelto en `[]` y no pasa nada.
  //
  // Guardamos la PROMESA en el ref, no el resultado: si `pedirTanda` leyera
  // un array que todavía no se terminó de llenar, un click rápido antes de
  // que resuelva el round-trip a Supabase mandaría el `excluir` sin los
  // vistos, y podría salir un título que el usuario ya marcó. `pedirTanda`
  // hace `await` de esta promesa antes de armar el excluir.
  const vistos = useRef<Promise<number[]>>(Promise.resolve([]));
  const [open, setOpen] = useState(false);
  const [escenario, setEscenario] = useState<Escenario | null>(null);
  const [cola, setCola] = useState<RoulettePick[]>([]);
  const [actual, setActual] = useState<RoulettePick | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  // Guarda contra el primer "cambio" de `platformsKey`: `PlatformsContext`
  // arranca en DEFAULT_PLATFORMS y recién hidrata lo guardado en localStorage
  // en un useEffect propio, después del montaje (ver PlatformsContext.tsx).
  // Sin este guard, esa hidratación se lee como si el usuario hubiera tocado
  // sus plataformas y dispara una query de más apenas se abre la ruleta.
  const primerRenderPlatforms = useRef(true);

  // Una query por tanda. `reintento` evita el bucle infinito: si tras limpiar
  // los mostrados sigue sin venir nada, es que no hay pool y se muestra el
  // estado vacío.
  useEffect(() => {
    if (!open || !user) { vistos.current = Promise.resolve([]); return; }
    // Si falla (red, RLS, lo que sea) degradamos a "sin vistos" en vez de
    // dejar la promesa colgada — `pedirTanda` la espera, y no queremos que un
    // error acá trabe abrir la ruleta.
    vistos.current = itemRefs("watched")
      .then((refs) => refs.map((r) => r.tmdb_id))
      .catch(() => []);
  }, [open, user]);

  const pedirTanda = useCallback(async (e: Escenario, reintento = false): Promise<RoulettePick[]> => {
    // p_excluir = lo que ya vio + lo que la ruleta ya le mostró en ESTE
    // escenario. Lo primero es historial real (user_items); lo segundo, estado
    // de paginación. El reset por agotamiento sólo limpia lo segundo.
    const mostrados = seen(e);
    const vistosIds = await vistos.current;
    // `mostrados` primero: es el estado que hace avanzar la ruleta (sin él,
    // "Otra" repite lo mismo todo el día porque la semilla es estable).
    // `vistosIds` es un filtro de calidad que puede quedar parcial sin romper
    // nada, así que si hay que recortar por el tope, se recorta a costa de
    // los vistos y no de los mostrados.
    const excluir = [...new Set([...mostrados, ...vistosIds])].slice(0, MAX_EXCLUIR);
    const url = `/api/ruleta?escenario=${e}&providers=${platforms.join(",")}`
      + (excluir.length ? `&excluir=${excluir.join(",")}` : "");
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    const picks: RoulettePick[] = data.picks ?? [];
    // `total` es cuántas filas trajo la RPC antes de enriquecer (ver
    // lib/roulette.ts). Sólo reseteamos cuando el pool está GENUINAMENTE
    // agotado (total === 0): si la RPC trajo filas pero se cayeron todas al
    // enriquecer (hiccup de TMDB), `picks` también viene vacío pero no hay
    // que borrarle al usuario el progreso de paginación por un fallo
    // transitorio que nada tiene que ver con el pool.
    const total: number = data.total ?? picks.length;
    if (!total && mostrados.length && !reintento) {
      reset(e);
      return pedirTanda(e, true);
    }
    return picks;
  }, [platforms, seen, reset]);

  const elegir = useCallback(async (e: Escenario) => {
    setEscenario(e); setCargando(true); setError(false);
    try {
      const picks = await pedirTanda(e);
      const [primero, ...resto] = picks;
      if (primero) add(e, [primero.id]);
      setActual(primero ?? null);
      setCola(resto);
    } catch {
      setError(true); setActual(null); setCola([]);
    } finally {
      setCargando(false);
    }
  }, [pedirTanda, add]);

  // `platforms` es un array nuevo en cada render del contexto, así que
  // compararlo directo dispararía el efecto todo el tiempo; el string sí es
  // estable entre renders si el contenido no cambió.
  const platformsKey = platforms.join(",");

  // Si el usuario saca (o pone) una plataforma con el panel abierto y un
  // escenario ya elegido, la `cola` en memoria puede tener picks de una
  // plataforma que ya no tiene: "Otra" seguiría sirviéndolos hasta agotar
  // la tanda vieja. Se descarta la cola y se repite la query con las
  // plataformas nuevas. `elegir` ya limpia y vuelve a pedir, así que alcanza
  // con llamarlo de nuevo para el escenario actual.
  useEffect(() => {
    if (primerRenderPlatforms.current) {
      primerRenderPlatforms.current = false;
      return;
    }
    if (!escenario) return;
    void elegir(escenario);
    // Sólo nos interesa reaccionar a cambios de plataformas, no a que
    // cambien `escenario`/`elegir` (eso ya lo maneja el click de la tarjeta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformsKey]);

  const otra = useCallback(async () => {
    if (!escenario) return;
    // Consume de la tanda que ya está en el cliente; sólo pide otra al agotarse.
    if (cola.length) {
      const [siguiente, ...resto] = cola;
      add(escenario, [siguiente.id]);
      setActual(siguiente); setCola(resto);
      return;
    }
    await elegir(escenario);
  }, [escenario, cola, add, elegir]);

  const volver = () => { setEscenario(null); setActual(null); setCola([]); setError(false); };
  const cerrar = () => { setOpen(false); volver(); };

  return (
    <div className="dsmp">
      <button
        className={`dsmp-banner ${open ? "open" : ""}`}
        onClick={() => (open ? cerrar() : setOpen(true))}
        aria-expanded={open}
      >
        <span className="dsmp-banner-ico" aria-hidden>🎲</span>
        <span className="dsmp-banner-txt">
          <span className="dsmp-banner-title">¿No sabés qué ver?</span>
          <span className="dsmp-banner-sub">Una sola recomendación, sin scrollear.</span>
        </span>
        <span className="dsmp-banner-cta">
          {open ? "Cerrar" : "Probá"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>

      {open && (
        <div className="rlt-panel">
          {!escenario ? (
            <>
              <span className="chip-group-label">¿Cómo la vas a ver?</span>
              <div className="rlt-sit">
                {SITUACIONES.map((s) => (
                  <button key={s.id} type="button" onClick={() => void elegir(s.id)}>
                    <span className="rlt-sit-ico" aria-hidden>{s.ico}</span>
                    <span className="rlt-sit-tit">{s.tit}</span>
                    <span className="rlt-sit-sub">{s.sub}</span>
                  </button>
                ))}
              </div>
            </>
          ) : cargando ? (
            <span className="loading">Buscando algo bueno…</span>
          ) : error ? (
            <p className="empty-note" role="status">
              No pudimos traer una recomendación. <button className="rlt-btn" onClick={() => void elegir(escenario)}>Reintentar</button>
            </p>
          ) : actual ? (
            <RuletaCard pick={actual} onOtra={() => void otra()} onCerrar={volver} />
          ) : (
            <p className="empty-note" role="status">
              No hay nada para esta situación en tus plataformas. <button className="rlt-btn" onClick={volver}>Probar otra</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
