"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlatforms } from "../PlatformsContext";
import { useAuth } from "../AuthContext";
import { itemRefs } from "@/lib/userdata";
import { useRouletteSeen } from "@/hooks/useRouletteSeen";
import { consumirVuelta, decidirRestauracionVista, guardarVista, olvidarLista } from "@/hooks/lista-paginada-store";
import { contextoDe, snapshotVigente } from "@/hooks/restauracion-vigente";
import { objetivoDeScroll, type PosicionRuleta } from "@/lib/ruleta-scroll";
import {
  iniciar, actual as actualDe, puedeVolver, atras, otra as otraDe, sumarTanda,
  valeGuardar, esEstadoValido,
  type SesionRuleta, type EstadoRuleta,
} from "@/lib/ruleta-historial";
import RuletaCard from "./RuletaCard";
import type { Escenario, RoulettePick } from "@/lib/roulette";

// Tope de `excluir` que se aplica ACÁ, antes de armar la URL — no alcanza con
// el `MAX_EXCLUIR` de lib/roulette.ts, que recién actúa del lado del server:
// `itemRefs("watched")` no tiene límite, así que alguien con ~2000 títulos
// vistos arma un query string de ~16 KB y el request muere con 431 antes de
// llegar al handler. Mismo valor que MAX_EXCLUIR en lib/roulette.ts (ese
// queda como red de contención, no como el límite real).
const MAX_EXCLUIR = 500;

// La clave del snapshot. La ruleta vive en el Home, así que la marca de vuelta
// que consume es la de "/".
const CLAVE = "ruleta";
const RUTA = "/";

/** Lo que se restaura ademas del estado: donde estaba la seccion en la pantalla. */
interface ExtraRuleta { ancla: number | null }

// Tres escenarios, mutuamente excluyentes y definidos por duración. El subtítulo
// dice el corte real en vez de una promesa vaga: el filtro ahora es un dato duro
// de TMDB, así que se puede prometer exactamente lo que se cumple.
const SITUACIONES: { id: Escenario; ico: string; tit: string; sub: string }[] = [
  { id: "corta",  ico: "⏱️", tit: "Tengo poco tiempo",   sub: "1 h 30 o menos" },
  { id: "larga",  ico: "🌙", tit: "Tengo toda la noche", sub: "Más de 1 h 30" },
  { id: "chicos", ico: "🧸", tit: "Con chicos",          sub: "Que la vean todos" },
];

export default function RuletaBanner() {
  const { platforms, ready: platformsListas } = usePlatforms();
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
  const [sesion, setSesion] = useState<SesionRuleta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  const platformsKey = platforms.join(",");
  const escenario = sesion?.escenario ?? null;
  const actual = sesion ? actualDe(sesion) : null;

  // ==========================================================================
  // RESTAURACIÓN AL VOLVER DE UNA FICHA
  // ==========================================================================
  // 🔴 SE DECIDE ANTES DE QUE SE PUEDA PEDIR NADA, igual que en `ListaView`. Si
  // la decisión llegara después, el usuario vería un instante la ruleta cerrada
  // —o peor, la primera recomendación de una tanda nueva— antes de que apareciera
  // la suya.
  //
  // 🔴 Y SE ESPERA A `platformsListas`. `PlatformsContext` arranca en
  // DEFAULT_PLATFORMS y recién hidrata lo guardado en un efecto propio. Decidir
  // antes de eso compara el snapshot contra una firma que todavía no es la del
  // usuario: no coincidiría, y `decidirRestauracionVista` BORRA lo que no
  // coincide. O sea que decidir temprano no sólo falla: destruye el snapshot.
  const [decidido, setDecidido] = useState(false);
  // El nodo de la seccion. Es lo que se restaura: no un desplazamiento del
  // documento, sino ESTE bloque puesto donde estaba en la pantalla. Ver
  // `lib/ruleta-scroll.ts`.
  const raiz = useRef<HTMLDivElement>(null);
  // La posicion que hay que restaurar, MIENTRAS NO SE HAYA APLICADO. Y sigue
  // puesta hasta que la seccion llego a su lugar, no hasta que se agenda el
  // primer intento: en el medio corre el efecto que guarda el snapshot. Ver el
  // comentario del guardado.
  const scrollPendiente = useRef<PosicionRuleta | null>(null);

  /** Donde esta la seccion ahora, para el calculo del objetivo. */
  const dondeEsta = () => {
    const el = raiz.current;
    return el ? { top: el.getBoundingClientRect().top, scrollY: window.scrollY } : null;
  };
  const [ctxRestaurado, setCtxRestaurado] = useState<string | null>(null);
  const ctxActual = contextoDe([platformsKey]);
  // La firma de plataformas con la que se decidió. Es lo que distingue "el
  // usuario cambió de plataformas" de "el contexto recién terminó de hidratar".
  const keyAlDecidir = useRef<string | null>(null);

  useEffect(() => {
    if (!platformsListas || decidido) return;
    const e = decidirRestauracionVista<EstadoRuleta, ExtraRuleta>({
      clave: CLAVE,
      firma: platformsKey,
      // La marca sólo la pone un `popstate`, así que entrar al Home por un link
      // o escribiendo la URL NO restaura: una sesión vieja no revive sola.
      volvio: consumirVuelta(window.location.pathname || RUTA),
    });
    if (e && esEstadoValido(e.datos)) {
      setOpen(e.datos.abierto);
      setSesion(e.datos.sesion);
      scrollPendiente.current = { y: e.scrollY, ancla: e.extra?.ancla ?? null };
      setCtxRestaurado(ctxActual);
    }
    keyAlDecidir.current = platformsKey;
    setDecidido(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformsListas, decidido]);

  // ==========================================================================
  // PONER LA SECCION DONDE ESTABA
  // ==========================================================================
  // El objetivo se calcula contra la posicion REAL de la seccion y no repitiendo
  // un desplazamiento: la ruleta es un bloque en el medio del Home, con el hero
  // y los rieles arriba, asi que un `scrollY` absoluto describe el documento y
  // no la seccion. Ver lib/ruleta-scroll.ts.
  //
  // Un solo intento, con el rAF doble de siempre: la tarjeta ya esta montada y
  // el documento termina de medirse en el frame siguiente. Hubo una version que
  // sostenia la posicion durante 1,2 s corrigiendo en cada frame; se retiro
  // porque nunca se la vio funcionar —`requestAnimationFrame` no corre en el
  // navegador de prueba— y no hay ninguna medicion que la justifique.
  //
  // La pendiente se limpia DENTRO del rAF y no al agendar: en el medio corre el
  // efecto que guarda el snapshot, que necesita saber que la vista todavia no
  // llego a su lugar.
  useEffect(() => {
    const pos = scrollPendiente.current;
    if (!pos || !actual) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (scrollPendiente.current !== pos) return;
      scrollPendiente.current = null;
      window.scrollTo(0, objetivoDeScroll(pos, dondeEsta()));
    }));
  }, [actual]);

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

  /** Arranca (o reinicia) una sesión: una consulta, y el historial empieza de cero. */
  const elegir = useCallback(async (e: Escenario) => {
    setCargando(true); setError(false);
    try {
      const picks = await pedirTanda(e);
      const s = iniciar(e, picks);
      if (s) add(e, [s.historial[0].id]);
      setSesion(s ?? { escenario: e, historial: [], pos: 0, cola: [] });
    } catch {
      setError(true); setSesion(null);
    } finally {
      setCargando(false);
    }
  }, [pedirTanda, add]);

  // Si el usuario saca (o pone) una plataforma con el panel abierto, la cola en
  // memoria puede tener picks de una plataforma que ya no tiene, y el historial
  // deja de corresponder al universo actual: se reinician los dos.
  //
  // ⚠️ Se compara contra la firma CON LA QUE SE DECIDIÓ, no contra un "primer
  // render". Con un guard de primer render, la hidratación de
  // `PlatformsContext` se leía como un cambio del usuario y disparaba una
  // consulta de más apenas se abría la ruleta.
  useEffect(() => {
    if (!decidido || keyAlDecidir.current === null) return;
    if (keyAlDecidir.current === platformsKey) return;
    keyAlDecidir.current = platformsKey;
    if (escenario) void elegir(escenario);
    // Sólo nos interesa reaccionar a cambios de plataformas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformsKey, decidido]);

  // Si cambiaron las plataformas después de restaurar, lo restaurado ya no vale.
  useEffect(() => {
    if (snapshotVigente(ctxRestaurado, ctxActual)) return;
    setCtxRestaurado(null);
    scrollPendiente.current = null;
  }, [ctxRestaurado, ctxActual]);

  // ==========================================================================
  // El snapshot
  // ==========================================================================
  // Se guarda con cada cambio y también al scrollear, con el mismo rAF que usan
  // las listas: la posición que hay que restaurar es la del momento de irse, y
  // nadie avisa cuándo es eso.
  useEffect(() => {
    if (!decidido) return;
    const estado: EstadoRuleta = { abierto: open, sesion };
    if (!valeGuardar(estado)) { olvidarLista(CLAVE); return; }
    let pend = false;
    // MIENTRAS HAY UNA POSICION PENDIENTE, LA POSICION DE LA VISTA ES ESA Y NO
    // LA DEL DOCUMENTO. Este efecto corre en el MISMO commit en el que se
    // restauro y la seccion recien se acomoda dos frames despues: guardando lo
    // que dice el documento, el snapshot recien leido quedaba pisado con un 0 y
    // la vuelta SIGUIENTE devolvia la tarjeta correcta con la pagina arriba de
    // todo. Medido en el navegador el 2026-09-06.
    //
    // El `ancla` es lo que se restaura de verdad: donde estaba la seccion dentro
    // de la pantalla. Ver lib/ruleta-scroll.ts.
    const guardar = () => {
      const pend = scrollPendiente.current;
      const el = raiz.current;
      guardarVista<EstadoRuleta, ExtraRuleta>(CLAVE, {
        firma: platformsKey, datos: estado,
        scrollY: pend ? pend.y : window.scrollY,
        extra: { ancla: pend ? pend.ancla : el ? Math.round(el.getBoundingClientRect().top) : null },
      });
    };
    guardar();
    const onScroll = () => {
      if (pend) return;
      pend = true;
      requestAnimationFrame(() => { pend = false; guardar(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [decidido, open, sesion, platformsKey]);

  // ==========================================================================
  // Navegación por el historial
  // ==========================================================================
  // 🔴 NINGUNO DE LOS DOS PIDE NADA MIENTRAS HAYA POR DÓNDE MOVERSE. "Otra"
  // avanza por lo ya visto si el usuario había retrocedido, y sólo cuando llega
  // al final consume de la cola. La consulta aparece únicamente cuando la cola
  // se agota de verdad — igual que antes de este cambio.
  const otra = useCallback(async () => {
    if (!sesion) return;
    const r = otraDe(sesion);
    if (r.tipo === "historial") { setSesion(r.sesion); return; }
    if (r.tipo === "cola") {
      add(sesion.escenario, [r.nuevo.id]);
      setSesion(r.sesion);
      return;
    }
    // Agotada: una consulta, y la tanda nueva se apila SIN perder el historial.
    setCargando(true); setError(false);
    try {
      const picks = await pedirTanda(sesion.escenario);
      const s = sumarTanda(sesion, picks);
      if (s.tipo === "cola") {
        add(sesion.escenario, [s.nuevo.id]);
        setSesion(s.sesion);
      }
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [sesion, add, pedirTanda]);

  // Retroceder NO toca `yump:ruleta-mostrados`: esos títulos ya fueron
  // mostrados, y desmarcarlos los devolvería a la ruleta como si fueran nuevos.
  const irAtras = useCallback(() => {
    setSesion((s) => (s ? atras(s) : s));
  }, []);

  const volver = () => { setSesion(null); setError(false); };
  const cerrar = () => { setOpen(false); volver(); olvidarLista(CLAVE); };

  return (
    <div className="dsmp" ref={raiz}>
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
          ) : actual && sesion ? (
            <RuletaCard
              pick={actual}
              onOtra={() => void otra()}
              onAtras={irAtras}
              puedeVolver={puedeVolver(sesion)}
              onCerrar={volver}
            />
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
