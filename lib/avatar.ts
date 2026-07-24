// Avatares de personajes (SVG originales). Sólo se persiste el id en
// profiles.avatar_seed; el SVG se resuelve acá, sin red ni assets bundleados.
// Un id desconocido (incluye seeds DiceBear viejas) cae al avatar por defecto.
import { byId, DEFAULT_AVATAR_ID } from "./avatars";

export function avatarSvg(id: string): string {
  const svg = byId.get(id) ?? byId.get(DEFAULT_AVATAR_ID)!;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
