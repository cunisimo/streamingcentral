"use client";
import { memo } from "react";
import { getAvatarUrl } from "@/lib/avatar";

// Único componente que muestra un avatar. Resuelve la URL de DiceBear vía el
// helper y renderiza un <img> plano (no next/image: la URL es externa y no
// necesita optimización). Memoizado: sólo re-renderiza si cambian seed/style/size.
//
// Sin loading="lazy": los avatares son SVG chicos y hay muy pocos en pantalla
// (nav, hub, y las 24 opciones del modal). El lazy no aporta y, dentro del
// contenedor con scroll del modal / bajo el backdrop fijo, deja imágenes sin
// cargar (el IntersectionObserver no siempre las detecta).
function AvatarBase({
  seed, style, size = 40, className, alt = "",
}: {
  seed?: string | null;
  style?: string | null;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const src = getAvatarUrl({ avatar_seed: seed, avatar_style: style });
  return <img src={src} width={size} height={size} alt={alt} className={className} />;
}

const Avatar = memo(AvatarBase);
export default Avatar;
