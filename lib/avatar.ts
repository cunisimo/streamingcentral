// Avatares generados con DiceBear (style fun-emoji). Solo se persiste la
// semilla en profiles.avatar_seed; el SVG se arma acá, en el cliente, sin
// llamadas de red ni assets bundleados. Cambiar de style es una línea.
import { createAvatar } from "@dicebear/core";
import { funEmoji } from "@dicebear/collection";

export function avatarSvg(seed: string): string {
  const svg = createAvatar(funEmoji, { seed: seed || "streamingcentral" }).toString();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
