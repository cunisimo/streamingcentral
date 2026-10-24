// Genera `tablas-unicode.ts` a partir de las referencias Unicode 18.0.0
// incorporadas (contrato de moderación v1, §1 y §2). Puro: recibe el texto de
// los archivos y devuelve el código fuente. Lo usan
// `scripts/comunidad/generar-tablas-unicode.mjs` (escribe el archivo) y la
// prueba de referencias (comprueba que el archivo commiteado es exactamente lo
// que sale de las referencias).

/** Categorías de S (contrato §2): `Po` sin `,` `;` `:` (S2), más `_` y `/`. */
export const CATEGORIAS_SEPARADOR = ["Zs", "Pd", "Ps", "Pe", "Po", "Sm", "Mn", "Me"] as const;
const FUERA_DE_S = new Set([0x2c, 0x3b, 0x3a]); // , ; :
const EXTRA_S = [0x5f, 0x2f]; // _ /

type Rango = [number, number];

/** Categoría general → rangos, desde DerivedGeneralCategory.txt. */
export function rangosPorCategoria(dgc: string): Map<string, Rango[]> {
  const mapa = new Map<string, Rango[]>();
  for (const linea of dgc.split("\n")) {
    const datos = linea.split("#")[0].trim();
    if (!datos) continue;
    const [r, cat] = datos.split(";").map((x) => x.trim());
    const [a, b] = r.split("..").map((h) => parseInt(h, 16));
    const lista = mapa.get(cat) ?? [];
    lista.push([a, b ?? a]);
    mapa.set(cat, lista);
  }
  for (const lista of mapa.values()) lista.sort((x, y) => x[0] - y[0]);
  return mapa;
}

/** Une rangos solapados o contiguos. */
export function unirRangos(rangos: Rango[]): Rango[] {
  const ordenados = [...rangos].sort((x, y) => x[0] - y[0]);
  const salida: Rango[] = [];
  for (const [a, b] of ordenados) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && a <= ultimo[1] + 1) ultimo[1] = Math.max(ultimo[1], b);
    else salida.push([a, b]);
  }
  return salida;
}

/** Quita puntos de código sueltos de una lista de rangos. */
function quitar(rangos: Rango[], fuera: Set<number>): Rango[] {
  const salida: Rango[] = [];
  for (const [a, b] of rangos) {
    let inicio = a;
    for (let cp = a; cp <= b; cp++) {
      if (fuera.has(cp)) {
        if (cp > inicio) salida.push([inicio, cp - 1]);
        inicio = cp + 1;
      }
    }
    if (inicio <= b) salida.push([inicio, b]);
  }
  return salida;
}

/** fuente → prototipo, desde confusables.txt. */
export function mapaConfusables(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const linea of texto.split("\n")) {
    const datos = linea.split("#")[0].trim();
    if (!datos) continue;
    const [fuente, destino] = datos.split(";").map((x) => x.trim());
    const cp = (h: string) => String.fromCodePoint(parseInt(h, 16));
    mapa.set(fuente.split(/\s+/).map(cp).join(""), destino.split(/\s+/).map(cp).join(""));
  }
  return mapa;
}

const esqueleto = (m: Map<string, string>, c: string) => m.get(c) ?? c;

/**
 * D9: caracteres cuyo esqueleto UTS #39 coincide con el de un dígito ASCII
 * (los prototipos de 0 y 1 son `O` y `l`). Se agrega la forma en minúsculas,
 * porque `base` baja las mayúsculas antes de la pasada de dígitos; si las
 * minúsculas chocan con otro dígito, se descartan.
 */
export function confusablesDeDigito(m: Map<string, string>): Map<string, string> {
  const porEsqueleto = new Map<string, string>();
  for (const d of "0123456789") porEsqueleto.set(esqueleto(m, d), d);
  const salida = new Map<string, string>();
  for (const [fuente] of m) {
    if ([...fuente].length !== 1 || /[0-9]/.test(fuente)) continue;
    const d = porEsqueleto.get(esqueleto(m, fuente));
    if (d === undefined) continue;
    salida.set(fuente, d);
  }
  for (const [fuente, d] of [...salida]) {
    const minus = fuente.normalize("NFKC").toLowerCase();
    if ([...minus].length !== 1 || minus === fuente) continue;
    if (salida.has(minus) && salida.get(minus) !== d) continue;
    if (!salida.has(minus)) salida.set(minus, d);
  }
  return salida;
}

/**
 * C: letras que NO son ASCII → su esqueleto, sólo cuando el esqueleto es una
 * o más letras ASCII (contrato §2-C). Los ASCII no se transforman: UTS #39
 * incluye `m` → `rn`, que rompería coincidencias normales. Las claves van en
 * minúsculas, porque se aplican sobre `base`.
 */
export function confusablesDeLetra(m: Map<string, string>): Map<string, string> {
  const salida = new Map<string, string>();
  for (const [fuente, destino] of m) {
    if ([...fuente].length !== 1 || fuente.charCodeAt(0) < 0x80) continue;
    if (!/^[A-Za-z]+$/.test(destino)) continue;
    const valor = destino.toLowerCase();
    for (const clave of new Set([fuente, fuente.normalize("NFKC").toLowerCase()])) {
      if ([...clave].length !== 1 || clave.charCodeAt(0) < 0x80) continue;
      if (!salida.has(clave)) salida.set(clave, valor);
    }
  }
  return salida;
}

const rangosTs = (rs: Rango[]) => `[${rs.map(([a, b]) => `[0x${a.toString(16)},0x${b.toString(16)}]`).join(",")}]`;
const mapaTs = (m: Map<string, string>) =>
  `{${[...m].sort(([a], [b]) => a.codePointAt(0)! - b.codePointAt(0)!)
    .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(",")}}`;

export interface Huellas { dgc: string; confusables: string }

/** El código fuente de `tablas-unicode.ts`. Determinista. */
export function generarTablas(dgc: string, confusables: string, huellas: Huellas): string {
  const cats = rangosPorCategoria(dgc);
  const nd = unirRangos(cats.get("Nd") ?? []);
  const sep = unirRangos([
    ...quitar(CATEGORIAS_SEPARADOR.flatMap((c) => cats.get(c) ?? []), FUERA_DE_S),
    ...EXTRA_S.map((cp): Rango => [cp, cp]),
  ]);
  const me = unirRangos(cats.get("Me") ?? []);
  const m = mapaConfusables(confusables);
  const dig = confusablesDeDigito(m);
  const letra = confusablesDeLetra(m);
  return [
    "// GENERADO por scripts/comunidad/generar-tablas-unicode.mjs desde",
    "// lib/comunidad/reglas/referencias/unicode-18.0.0/. NO EDITAR A MANO: una",
    "// prueba comprueba que este archivo es exactamente lo que sale de las",
    "// referencias (contrato de moderación v1, §1).",
    "",
    `export const VERSION_UNICODE = "18.0.0";`,
    `export const HUELLA_DGC = "${huellas.dgc}";`,
    `export const HUELLA_CONFUSABLES = "${huellas.confusables}";`,
    "",
    "/** Rangos de `Nd` (dígitos decimales) de Unicode 18.0.0. */",
    `export const RANGOS_ND: readonly (readonly [number, number])[] = ${rangosTs(nd)};`,
    "",
    "/** S: Zs, Pd, Ps, Pe, Po sin `,;:`, Sm, Mn, Me, más `_` y `/`. */",
    `export const RANGOS_SEPARADOR: readonly (readonly [number, number])[] = ${rangosTs(sep)};`,
    "",
    "/** Me (marcas que encierran, como U+20E3 del emoji de tecla). */",
    `export const RANGOS_ME: readonly (readonly [number, number])[] = ${rangosTs(me)};`,
    "",
    "/** D9: confusables de dígito de UTS #39 18.0.0 → dígito ASCII. */",
    `export const CONFUSABLES_DIGITO: Readonly<Record<string, string>> = ${mapaTs(dig)};`,
    "",
    "/** C: letras no ASCII → esqueleto ASCII en minúsculas (UTS #39 18.0.0). */",
    `export const CONFUSABLES_LETRA_UTS39: Readonly<Record<string, string>> = ${mapaTs(letra)};`,
    "",
  ].join("\n");
}
