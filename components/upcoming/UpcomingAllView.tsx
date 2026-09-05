"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import UpcomingCard from "./UpcomingCard";
import OfflineState from "../pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { useListaPaginada } from "@/hooks/useListaPaginada";
import {
  alFallarLaTanda, alLlegarLaTanda, decidirCambioDeFiltro, estadoFiltroInicial,
  estadoTandaInicial, iniciar, paginaAPedir, respuestaVigente, unir,
  type EstadoFiltro, type EstadoTanda,
} from "@/hooks/filtro-paginado-nucleo";
import type { UIUpcoming } from "@/lib/types";

type Filtro = "all" | "movie" | "tv";

const ETIQUETAS: { valor: Filtro; texto: string }[] = [
  { valor: "all", texto: "Todos" },
  { valor: "movie", texto: "Películas" },
  { valor: "tv", texto: "Series" },
];

/**
 * "Ver todas" de Próximamente: grilla paginada de 20 en 20 con filtro
 * Todos/Películas/Series.
 *
 * PAGINADA, no "todo de una". Antes pedía `limit=100` y mostraba lo que viniera,
 * y eso eran 100 series de los primeros cinco días —de 50 con contenido—, el 51%
 * anime. Ahora el servidor selecciona antes de paginar (`lib/proximamente.ts`) y
 * acá se piden tandas de 20.
 *
 * Por eso pasó de `useEstadoSimple` a `useListaPaginada`: al dejar de traer todo
 * de una, el estado que tiene que volver de una ficha ya no es "items + scroll"
 * sino "items + página + scroll", que es exactamente lo que ese hook restaura.
 * No hace falta inventar nada.
 *
 * ⚠️ EL FILTRO VA EN `extra`, NO EN LA FIRMA. La firma es lo que INVALIDA lo
 * guardado, y el filtro es justamente lo que hay que RESTAURAR. Con el filtro en
 * la firma, volver de una ficha con Series elegido no reconocería su propio
 * snapshot. La firma queda vacía porque la agenda no depende de las plataformas
 * del usuario: el motor ya la acota a títulos con proveedor argentino.
 */
export default function UpcomingAllView() {
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [items, setItems] = useState<UIUpcoming[]>([]);
  // 🔴 `tanda.confirmada` es la página que YA LLEGÓ, no la que se pidió. Ver
  // `EstadoTanda`: adelantarla antes de la respuesta salteaba la tanda que fallaba.
  const [tanda, setTanda] = useState<EstadoTanda>(estadoTandaInicial);
  const [hayMas, setHayMas] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const online = useOnline();
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);
  // El filtro que produjo lo que está en pantalla. Ver `filtro-paginado-nucleo`:
  // acá vivía el bug del selector.
  const estadoFiltro = useRef<EstadoFiltro>(estadoFiltroInicial);
  // Se lee dentro de `load` para comparar la respuesta contra el filtro VIGENTE
  // en el momento en que llega, no contra el que había al pedirla.
  const filtroVigente = useRef<Filtro>("all");
  filtroVigente.current = filtro;

  const { fase, inicial, reiniciar } = useListaPaginada<
    UIUpcoming, { filtro: Filtro; total: number | null }
  >({
    clave: "proximamente",
    firma: "",
    items,
    // Se guarda la CONFIRMADA. Guardar una página pedida y no llegada dejaba el
    // hueco escrito en el snapshot: al volver de una ficha, "Cargar más" seguía
    // desde la siguiente y la tanda fallada no se recuperaba nunca.
    pagina: tanda.confirmada,
    hayMas,
    extra: { filtro, total },
    listo: !loading && items.length > 0,
  });

  const load = useCallback(async (f: Filtro, p: number) => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const mt = f === "all" ? "" : `mediaType=${f}&`;
      const res = await fetch(`/api/upcoming?${mt}page=${p}`);
      const j = await res.json();
      // Dos guardas, no una: el número descarta las respuestas fuera de orden y
      // el filtro descarta una respuesta del filtro anterior que llegue con el
      // número vigente. Ver `respuestaVigente`.
      if (!respuestaVigente({
        reqDeLaRespuesta: myReq, reqActual: reqId.current,
        filtroDeLaRespuesta: f, filtroActual: filtroVigente.current,
      })) return;
      if (!res.ok) throw new Error(j?.error ?? "error");
      const got: UIUpcoming[] = j.items ?? [];
      // Al pedir la tanda siguiente NO se borra lo que ya está: se concatena sin
      // repetir. `unir` cubre el reintento que devuelve la misma tanda, y también
      // que la selección se reconstruya entre dos pedidos (el sync corre a las 6am).
      setItems((prev) => (p === 1 ? got : unir(prev, got, (i) => `${i.type}:${i.id}`)));
      setHayMas(!!j.hayMas);
      if (typeof j.total === "number") setTotal(j.total);
      setFailed(false);
      // Recién ACÁ avanza la página: la tanda llegó completa.
      setTanda((t) => alLlegarLaTanda(t, p));
    } catch {
      if (myReq === reqId.current) {
        // La página confirmada no se mueve, así que el reintento pide esta misma.
        setTanda((t) => alFallarLaTanda(t, p));
        // El error a pantalla completa es sólo para la primera carga; una tanda
        // adicional que falla no puede borrar lo que el usuario ya está mirando.
        if (p === 1) setFailed(true);
      }
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  // Arranque: restaurar o pedir la página 1. Corre una sola vez, cuando el hook
  // ya decidió.
  //
  // 🔴 SI RESTAURÓ NO SE PIDE NADA, y ahora eso es verdad por construcción: el
  // ÚNICO efecto que queda es éste, y sale por `return` sin llamar a `load`. Lo
  // que pide es un clic (`cambiarFiltro`) o el "Cargar más" (`more`), y los dos
  // son handlers. Antes había un segundo efecto que podía leer la restauración
  // como un cambio de filtro del usuario — ver el comentario de `cambiarFiltro`.
  //
  // `iniciar` registra el filtro aplicado SIEMPRE, restaure o no, y eso es el
  // arreglo del bug original: antes ese registro pasaba en otro efecto que no
  // corría en este render, así que quedaba en null y se comía el primer clic.
  //
  // ⚠️ Los dos `set*` de acá son seguros en Strict Mode, que en el App Router de
  // Next está ACTIVO en desarrollo cuando `next.config.mjs` no dice lo
  // contrario: React invoca los efectos dos veces al montar, y la segunda pasada
  // sale por `arrancado.current`, que es un ref y sobrevive. Verificado en
  // `hooks/arranque-restauracion.test.ts`.
  const arrancado = useRef(false);
  useEffect(() => {
    if (fase !== "listo" || arrancado.current) return;
    arrancado.current = true;

    const filtroInicial: Filtro = inicial?.extra?.filtro ?? "all";
    const r = iniciar(filtroInicial, !!inicial);
    estadoFiltro.current = r.estado;

    if (inicial) {
      setItems(inicial.items);
      setTanda({ confirmada: inicial.pagina, falloTanda: false });
      setHayMas(inicial.hayMas);
      setTotal(inicial.extra?.total ?? null);
      if (inicial.extra?.filtro) setFiltro(inicial.extra.filtro);
      filtroVigente.current = filtroInicial;
      setLoading(false);
      return;
    }
    // Entrada por link: `decidirRestauracion` ya tiró lo guardado, pero volver
    // arriba es la otra mitad — una navegación SPA puede llegar con el scroll
    // heredado de la pantalla anterior.
    reiniciar();
    setTanda(estadoTandaInicial);
    if (r.accion.tipo === "recargar") load(filtroInicial, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, inicial]);

  /**
   * Cambio de filtro. **Es un handler, no un efecto**, y ésa es la corrección.
   *
   * 🔴 POR QUÉ NO PUEDE SER UN EFECTO. Como efecto, la decisión salía de comparar
   * el `filtro` del cierre contra `estadoFiltro.current`, que el arranque acaba de
   * escribir en la MISMA ronda. Y un efecto ve los valores del render en el que se
   * creó: cuando el arranque restaura un snapshot de Series y hace
   * `setFiltro("tv")`, el efecto de abajo sigue viendo `filtro === "all"` mientras
   * `aplicado` ya dice `"tv"` — o sea `tv → all`, que es indistinguible de un clic
   * del usuario en Todos. Ahí reiniciaba la vista, pedía la página 1 de Todos y en
   * el render siguiente volvía a pedir Series: dos peticiones que no había que
   * hacer y la restauración del scroll pisada.
   *
   * Hoy eso NO se dispara, y conviene decirlo con precisión: el efecto no llega a
   * correr en esa ronda porque sus dependencias —`[filtro, load, reiniciar]`— no
   * cambiaron, ya que `filtro` todavía es el viejo y los dos callbacks son
   * estables. O sea que la corrección dependía de la ESTABILIDAD REFERENCIAL de
   * `useCallback`, que nada verifica: alcanzaba con que alguien le agregara una
   * dependencia a `reiniciar` para que el efecto corriera en cada render y el bug
   * apareciera. Está fijado en `hooks/arranque-restauracion.test.ts`, que lo
   * reproduce con la identidad inestable.
   *
   * Como handler el problema no existe: **restaurar y que el usuario toque un
   * botón son dos cosas distintas por construcción**, no dos estados que haya que
   * distinguir comparando. La restauración escribe estado y nada más; sólo un clic
   * pide. Sin temporizadores y sin depender del orden de las respuestas.
   */
  const cambiarFiltro = useCallback((f: Filtro) => {
    const r = decidirCambioDeFiltro(estadoFiltro.current, f);
    estadoFiltro.current = r.estado;
    setFiltro(f);
    if (r.accion.tipo !== "recargar") return;
    reiniciar();
    setItems([]);
    setHayMas(false);
    setTotal(null);
    setTanda(estadoTandaInicial);
    // Se adelanta al render: `load` corre ahora y `respuestaVigente` compara
    // contra este ref, que todavía tendría el filtro anterior.
    filtroVigente.current = f;
    load(f, 1);
  }, [load, reiniciar]);

  // Avanzar y reintentar son la MISMA acción: pedir `confirmada + 1`. Como la
  // confirmada no se movió cuando falló, esto vuelve a pedir exactamente la
  // página que falló, sin saltearla y sin tener que recordar cuál era.
  const more = () => load(filtro, paginaAPedir(tanda));

  if ((!online || failed) && !items.length) {
    return <div className="wrap"><OfflineState onRetry={() => load(filtro, 1)} /></div>;
  }

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Próximamente en streaming</h1></div>
      <div className="tipo-toggle" role="tablist">
        {ETIQUETAS.map(({ valor, texto }) => (
          <button
            key={valor}
            role="tab"
            aria-selected={filtro === valor}
            className={`tt ${filtro === valor ? "on" : ""}`}
            onClick={() => cambiarFiltro(valor)}
          >
            {texto}
          </button>
        ))}
      </div>
      <div className="grid">
        {items.map((it) => <UpcomingCard key={`${it.type}-${it.id}`} item={it} />)}
        {!loading && !items.length && (
          <p className="empty-note">No hay estrenos próximos para mostrar.</p>
        )}
      </div>
      {loading && <p className="loading">Cargando…</p>}
      {/* Aviso DISCRETO al pie: la tanda falló pero lo que ya está sigue en
          pantalla, así que no corresponde el estado de error a pantalla completa.
          El botón reintenta la misma página. */}
      {tanda.falloTanda && !loading && (
        <p className="empty-note" role="status" style={{ textAlign: "center" }}>
          No se pudo cargar el resto.{" "}
          <button className="up-retry" onClick={more}>Reintentar</button>
        </p>
      )}
      {hayMas && !loading && !tanda.falloTanda && items.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button className="btn ghost" onClick={more}>Cargar más</button>
        </div>
      )}
    </div>
  );
}
