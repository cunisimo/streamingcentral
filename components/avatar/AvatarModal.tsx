"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { ESTILO_YUMP, resolverAvatar } from "@/lib/avatares";
import { SELECTOR_ENFOCABLE, cierraElDialogo, focoInicial, siguienteFoco } from "@/lib/foco-modal";
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
    guardando.current = true;
    setBusy(true); setErr("");
    // `ESTILO_YUMP` es lo que distingue una elección explícita de una semilla
    // heredada: sin eso, el id elegido caería en el mapeo legado.
    const { error } = await updateAvatar(selected, ESTILO_YUMP);
    guardando.current = false;
    setBusy(false);
    if (error) { setErr(error); return; }
    onClose();
  }

  return (
    <div className="avmodal-backdrop" role="dialog" aria-modal="true" aria-label="Elegí tu avatar" onClick={() => cerrar("fondo")}>
      <div className="avmodal" ref={caja} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="avmodal-head">
          <h2>Elegí tu avatar</h2>
          <p>Son dibujos propios de Yump. Tocá el que más te guste.</p>
        </div>
        <div className="avgrid-wrap">
          <AvatarGrid selected={selected} onSelect={setSelected} />
        </div>
        {/* `aria-live`: quien no ve la pantalla se entera del error igual. */}
        <p className="avmodal-err" role="status" aria-live="polite">{err}</p>
        <div className="avmodal-foot">
          <div className="avmodal-foot-r">
            <button type="button" className="btn ghost" onClick={() => cerrar("cancelar")} disabled={busy}>Cancelar</button>
            <button type="button" className="btn" onClick={guardar} disabled={!selected || busy}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
