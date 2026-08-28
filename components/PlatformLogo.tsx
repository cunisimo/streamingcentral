import { platformByCode } from "@/lib/providers-ar";
import type { PlatformCode } from "@/lib/types";

// El nombre de la plataforma, en TEXTO NEUTRO.
//
// ⚠️ ANTES ESTO ERAN WORDMARKS IMITADOS A MANO: el rojo de Netflix, el swoosh de
// Prime dibujado en SVG, el `Disney+` con su superíndice, cada uno con el color
// de la marca. Eso es exactamente lo que una revisión legal marca — reproducir
// la identidad visual de un tercero sin licencia—, así que se reemplazó por el
// nombre escrito con la tipografía y el color de Yump.
//
// LA REGLA, y no admite excepciones: **sin símbolos, sin colores de marca, sin
// imitar el logotipo**. Sólo el nombre, que es un hecho —el título está en esa
// plataforma— y no una insignia.
//
// EL NOMBRE SALE DE `lib/providers-ar.ts`, que ya lo tenía: no hay una segunda
// lista que pueda discrepar. Los **códigos internos no cambian** (`n`, `d`, `m`…)
// y ninguna lógica de filtrado se toca: el cambio es únicamente visual.
//
// NO se usa `providers.logo_path` de TMDB. Servir el logo real de cada
// plataforma es el mismo problema con otra fuente, y además ata la interfaz a un
// campo que TMDB puede cambiar.
//
// `sp` (Star+) sigue en `PlatformCode` pero ya no está en el mapeo de
// proveedores: se fusionó con Disney+ en 2024. Por eso hay respaldo.
const RESPALDO: Partial<Record<PlatformCode, string>> = { sp: "Star+" };

export default function PlatformLogo({ code }: { code: PlatformCode }) {
  const nombre = platformByCode(code)?.name ?? RESPALDO[code];
  if (!nombre) return null;
  return <span className="lg">{nombre}</span>;
}
