// Avatares generados con DiceBear vía su API HTTP. No se guarda ni se descarga
// la imagen: el avatar es una URL dinámica que la resuelve el navegador (y el
// Service Worker la cachea como una imagen más). Solo se persisten en el perfil
// el estilo y la semilla.
export const DEFAULT_AVATAR_STYLE = "adventurer-neutral";

type AvatarInput =
  | { avatar_style?: string | null; avatar_seed?: string | null }
  | null
  | undefined;

// Único lugar con la lógica de la URL del avatar. Toda la UI usa este helper.
export function getAvatarUrl(p: AvatarInput): string {
  const style = p?.avatar_style || DEFAULT_AVATAR_STYLE;
  const seed = p?.avatar_seed || "streamingcentral";
  return `https://api.dicebear.com/10.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}
