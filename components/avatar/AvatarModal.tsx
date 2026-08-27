"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { eleccionAvatar, resolverAvatar } from "@/lib/avatares";
import { mensajeDeGuardado } from "@/lib/mensaje-guardado";
import {
  SELECTOR_ENFOCABLE, atributosBloqueo, cierraElDialogo, focoInicial, nuevaSeleccion,
  siguienteFoco,
} from "@/lib/foco-modal";
import AvatarGrid from "./AvatarGrid";

// El selector. Ya no genera nada: muestra los 31 avatares propios y guarda el id
// del elegido.
//
// Desapareció "Generar más", y con él la idea de tandas: antes las opciones eran
// semillas aleatorias de un generador infinito, así que había que poder pedir
// otras. Acá el catálogo es finito y está entero en pantalla.
//
// La aritmética del ciclo de foco vive en `lib/foco-modal.ts` para poder
// probarla: acá queda sólo el cableado al DOM.
export default function AvatarModal({ onClose }: { onClose: () => void }) {
  const { profile, updateAvatar } = useAuth();
  // Arranca con el avatar actual seleccionado, para que se vea cuál es el suyo.
  const [selected, setSelected] = useState<string | null>(() => resolverAvatar(profile).id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const previo = useRef<HTMLElement | null>(null);
  // En una ref y no en el estado: los listeners se registran una sola vez y
  // leerían un `busy` viejo por captura de clausura.
  const guardando = useRef(false);

  const enfocables = useCallback(
    () => [...(caja.current?.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE) ?? [])],
    [],
  );

  const cerrar = useCallback((gesto: "escape" | "fondo" | "cancelar") => {
    if (!cierraElDialogo(gesto, guardando.current)) return;
    onClose();
  }, [onClose]);

  // El toque de una card pasa SIEMPRE por acá. Durante el guardado devuelve la
  // selección actual, así que el toque no hace nada: antes las 31 cards seguían
  // activas y se podía marcar B con la petición ya guardando A.
  const elegir = useCallback((id: string) => {
    setSelected((actual) => nuevaSeleccion(actual, id, guardando.current));
  }, []);

  useEffect(() => {
    // Devolver el foco al botón que abrió el modal cuando se cierra: sin esto,
    // al cerrar con Escape el foco se va al `<body>` y con teclado hay que
    // recorrer la página entera de nuevo.
    previo.current = document.activeElement as HTMLElement | null;

    // Foco inicial en un control útil: la opción ya seleccionada.
    const lista = enfocables();
    const i = focoInicial(lista.length, lista.findIndex((e) => e.getAttribute("aria-pressed") === "true"));
    (i !== null ? lista[i] : caja.current)?.focus();

    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { cerrar("escape"); return; }
      if (e.key !== "Tab") return;
      // Foco ATRAPADO. Sin esto, Tab en el último control se va a la página de
      // atrás, que sigue ahí abajo del backdrop.
      const items = enfocables();
      const salto = siguienteFoco(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
      if (salto === null) return;   // el navegador se encarga
      e.preventDefault();
      items[salto]?.focus();
    };
    document.addEventListener("keydown", h);
    return () => {
      document.removeEventListener("keydown", h);
      previo.current?.focus?.();
    };
  }, [cerrar, enfocables]);

  async function guardar() {
    if (!selected || guardando.current) return;
    // Los dos valores que se persisten salen de `eleccionAvatar` y de ningún
    // otro lado: el componente no sabe —ni tiene por qué saber— qué se escribe
    // en la columna de estilo. Devuelve `null` si el id no está en el catálogo,
    // y entonces no se escribe nada.
    const eleccion = eleccionAvatar(selected);
    if (!eleccion) return;
    guardando.current = true;
    setBusy(true); setErr("");
    const { error } = await updateAvatar(eleccion);
    guardando.current = false;
    setBusy(false);
    if (error) {
      // Falló: `guardando` ya volvió a false, así que las 31 opciones, Cancelar
      // y Guardar se reactivan solas y se puede reintentar.
      //
      // En pantalla va un mensaje en castellano, NUNCA el error crudo: sin esto
      // se leía "TypeError: Failed to fetch", que no le dice a nadie que lo
      // único que hay que hacer es reintentar. El detalle técnico queda en la
      // consola, que es donde sirve.
      console.error("[avatar] falló el guardado:", error);
      setErr(mensajeDeGuardado(error));
      return;
    }
    onClose();
  }

  return (
    // `aria-busy` va ACÁ, en el elemento que tiene `role="dialog"`, y no en el
    // contenedor de adentro: lo que se anuncia ocupado tiene que ser el diálogo
    // de verdad, que es el que un lector de pantalla trata como una unidad.
    <div
      className="avmodal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Elegí tu avatar"
      aria-busy={busy || undefined}
      onClick={() => cerrar("fondo")}
    >
      <div className="avmodal" ref={caja} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="avmodal-head">
          <h2>Elegí tu avatar</h2>
          <p>Son dibujos propios de Yump. Tocá el que más te guste.</p>
        </div>
        <div className="avgrid-wrap">
          <AvatarGrid selected={selected} onSelect={elegir} bloqueado={busy} />
        </div>
        {/* `aria-live`: quien no ve la pantalla se entera del error igual. */}
        <p className="avmodal-err" role="status" aria-live="polite">{err}</p>
        <div className="avmodal-foot">
          <div className="avmodal-foot-r">
            {/* `aria-disabled` en vez de `disabled` en los dos: `disabled` los
                saca del orden de tabulación, y el foco está justo encima de
                Guardar cuando se lo acaba de tocar. El bloqueo real lo hacen
                `cierraElDialogo` y la guarda de `guardar()`. */}
            <button
              type="button" className="btn ghost"
              onClick={() => cerrar("cancelar")}
              {...atributosBloqueo(busy)}
            >Cancelar</button>
            <button
              type="button" className="btn"
              onClick={guardar}
              disabled={!selected}
              {...atributosBloqueo(busy)}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
