"use client";
import { memo } from "react";
import { rutaAvatar } from "@/lib/avatares";

// Único componente que muestra un avatar. Resuelve la ruta LOCAL vía el catálogo
// y renderiza un `<img>` plano.
//
// No usa `next/image` a propósito: los archivos ya vienen en el tamaño y el
// formato que queremos (WebP 512×512 con transparencia) y se muestran chicos.
// Pasarlos por el optimizador sumaría una función de imagen por cada uno sin
// mejorar nada.
//
// ANTES esto armaba una URL a la API de DiceBear con la semilla del perfil, o
// sea que en cada render salía del dispositivo un identificador seudónimo
// vinculado a la cuenta. Ahora no hay ninguna conexión externa.
//
// `alt=""` por defecto y `aria-hidden`: en la nav y en el hub el avatar es
// decorativo, el nombre de la persona ya está al lado. Donde SÍ importa —cada
// opción del selector— el nombre accesible lo pone el botón que lo envuelve.
function AvatarBase({
  perfil, size = 40, className, alt = "", lazy = false,
}: {
  perfil?: { avatar_seed?: string | null; avatar_style?: string | null } | null;
  size?: number;
  className?: string;
  alt?: string;
  /** `true` en las opciones del selector, que están fuera del área visible. */
  lazy?: boolean;
}) {
  return (
    <img
      src={rutaAvatar(perfil)}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={className}
      loading={lazy ? "lazy" : "eager"}
      decoding="async"
      draggable={false}
    />
  );
}

const Avatar = memo(AvatarBase);
export default Avatar;
