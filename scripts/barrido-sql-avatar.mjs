// Barrido del SQL EJECUTABLE que toca `profiles.avatar_style`.
//
// POR QUÉ EXISTE. La versión anterior de estos chequeos buscaba cadenas exactas
// de una sola línea, así que se le escapaba cualquier reformateo:
//
//     alter table public.profiles
//       alter column avatar_style
//       drop default;
//
// Eso es la MISMA operación y no la detectaba. Un test que sólo reconoce la
// forma en que hoy está escrito el archivo no protege nada: protege contra un
// copy-paste idéntico, que es justo lo que nadie va a hacer.
//
// La estrategia es otra: se quitan los comentarios, se normalizan los espacios y
// los saltos de línea a un único espacio, y recién ahí se buscan las
// operaciones. Con el SQL aplanado, multilínea y una línea son lo mismo.
import fs from "node:fs";

/**
 * Deja sólo SQL ejecutable, en una sola línea y con los espacios colapsados.
 *
 * Quita comentarios de línea (`--`) y de bloque, que es lo que permite que el
 * archivo EXPLIQUE en prosa por qué una operación no está sin que el barrido la
 * confunda con la operación misma.
 */
export function sqlEjecutable(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // comentarios de bloque
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))  // comentarios de línea
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

// `profiles` o `public.profiles`, con el espacio ya normalizado.
const TABLA = "(?:public\\.)?profiles";

/**
 * Las operaciones prohibidas sobre `avatar_style`, cada una con por qué.
 *
 * Todas se escriben contra el SQL ya aplanado, así que `\s+` cubre cualquier
 * combinación de espacios y saltos de línea que haya en el original.
 */
export const OPERACIONES = [
  {
    nombre: "DROP DEFAULT sobre avatar_style",
    porque: "quitar el default de Producción es una migración destructiva sin autorizar",
    re: new RegExp(`alter\\s+table\\s+${TABLA}\\s+alter\\s+column\\s+avatar_style\\s+drop\\s+default`),
  },
  {
    nombre: "SET DEFAULT sobre avatar_style",
    porque: "el archivo es rerunnable: un default acá se reimpone en cada corrida",
    re: new RegExp(`alter\\s+table\\s+${TABLA}\\s+alter\\s+column\\s+avatar_style\\s+set\\s+default`),
  },
  {
    nombre: "escritura directa sobre avatar_style",
    porque: "un UPDATE sobre esa columna sobrescribe la elección de perfiles existentes",
    re: new RegExp(`update\\s+${TABLA}\\s+set\\s+[^;]*avatar_style\\s*=`),
  },
  {
    nombre: "avatar_style creada CON default",
    porque: "una columna nueva no puede nacer con el nombre de un servicio que ya no se usa",
    re: new RegExp(`add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?avatar_style\\s+text\\s+default`),
  },
];

/**
 * Qué operaciones prohibidas aparecen en este SQL. Vacío = limpio.
 * Devuelve `{ nombre, porque }` por cada una encontrada.
 */
export function operacionesProhibidas(sql) {
  const plano = sqlEjecutable(sql);
  return OPERACIONES.filter((o) => o.re.test(plano)).map(({ nombre, porque }) => ({ nombre, porque }));
}

/** Lo mismo, leyendo de disco. */
export function barrerArchivo(ruta) {
  return operacionesProhibidas(fs.readFileSync(ruta, "utf8"));
}
