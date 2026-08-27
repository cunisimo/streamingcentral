"use client";
import { memo, useCallback, useState } from "react";
import { type Avatar as AvatarDef } from "@/lib/avatares";
import { atributosBloqueo } from "@/lib/foco-modal";
import { puedeElegirse, trasError, urlDeIntento } from "@/lib/reintento-imagen";

// Una opción del selector. El nombre accesible sale del catálogo, así que un
// lector de pantalla dice "Buitracio" y no "Elegir este avatar" treinta y una
// veces seguidas.
//
// ⚠️ ACÁ NO HAY `loading="lazy"`, Y ES DELIBERADO. Con lazy, 21 de las 31
// imágenes se quedaban en `complete === false` —nunca pedidas, no fallidas— y el
// selector mostraba círculos vacíos distintos en cada apertura. La medición y el
// detalle están en `docs/ISSUES.md` → **#15**. `CastRail.tsx` ya documentaba el
// mismo problema en rieles y modales; ésta fue la segunda vez.
//
// El `<img>` se escribe acá y no se delega en `Avatar` porque esta card necesita
// algo que el componente compartido no tiene por qué saber: reintentar una vez y,
// si tampoco carga, mostrar un respaldo en lugar de un agujero.
function AvatarCardBase({
  avatar, selected, onSelect, bloqueado,
}: {
  avatar: AvatarDef;
  selected: boolean;
  onSelect: (id: string) => void;
  /** `true` mientras se guarda: la opción no se puede cambiar. */
  bloqueado: boolean;
}) {
  // El intento en curso y si se agotó. Se reinicia al remontar —o sea, cada vez
  // que se abre el selector—, así que un fallo pasajero no queda pegado.
  const [intento, setIntento] = useState(0);
  const [agotado, setAgotado] = useState(false);

  const alFallar = useCallback(() => {
    setIntento((actual) => {
      const paso = trasError(actual);
      if (paso.agotado) setAgotado(true);
      return paso.intento;
    });
  }, []);

  const elegible = puedeElegirse(agotado);

  return (
    <button
      type="button"
      className={`avcard ${selected ? "on" : ""}${bloqueado ? " bloqueada" : ""}${agotado ? " sin-imagen" : ""}`}
      // `onSelect` decide con `nuevaSeleccion`, así que un toque durante el
      // guardado llega y no hace nada. El botón NO lleva `disabled`: eso lo
      // sacaría del orden de tabulación y el foco se caería al body.
      onClick={() => { if (elegible) onSelect(avatar.id); }}
      aria-pressed={elegible ? selected : undefined}
      aria-label={elegible ? avatar.nombre : `${avatar.nombre}: no se pudo cargar`}
      title={elegible ? avatar.nombre : `${avatar.nombre}: no se pudo cargar la imagen`}
      {...atributosBloqueo(bloqueado || agotado)}
    >
      {agotado ? (
        // RESPALDO ESTABLE, no un hueco: la inicial del nombre, en un elemento
        // del mismo tamaño que la imagen, así la grilla no se mueve. El nombre
        // accesible ya lo pone el botón, así que esto va oculto para el lector.
        <span className="avcard-fb" aria-hidden="true">{avatar.nombre.slice(0, 1)}</span>
      ) : (
        <img
          // La `key` fuerza un elemento nuevo en el reintento: cambiar sólo el
          // `src` sobre el mismo nodo no siempre vuelve a pedir.
          key={intento}
          src={urlDeIntento(avatar.src, intento)}
          width={64}
          height={64}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable={false}
          onError={alFallar}
        />
      )}
    </button>
  );
}

const AvatarCard = memo(AvatarCardBase);
export default AvatarCard;
