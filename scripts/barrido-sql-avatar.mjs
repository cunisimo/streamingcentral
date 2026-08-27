// Guard TEXTUAL sobre la columna de estilo del avatar en `supabase/schema.sql`.
//
// ⚠️ QUÉ ES Y QUÉ NO ES, porque la diferencia importa:
//
//   ES     un guard contra una REGRESIÓN ACCIDENTAL. Cuenta apariciones de un
//          identificador en un archivo y exige que haya exactamente una, en una
//          línea que tiene que ser textualmente la sentencia autorizada.
//
//   NO ES  un parser de SQL, ni una barrera contra SQL deliberadamente
//          ofuscado. No interpreta comentarios, ni cadenas, ni identificadores
//          entre comillas, ni bloques `$tag$`. **No lo intenta.**
//
// POR QUÉ SE ABANDONÓ EL PARSER. Las dos versiones anteriores intentaron
// entender el SQL, y las dos tuvieron falsos negativos demostrados. La segunda
// troceaba respetando comentarios y cadenas, y aun así dejaba pasar esto:
//
//     update profiles
//     set display_name = E'x\'-- texto', avatar_style = null;
//
//     update profiles as "--"
//     set avatar_style = null;
//
// En los dos casos tomaba por comentario un `--` que pertenecía a una cadena con
// escape o a un identificador entre comillas dobles. La respuesta correcta no es
// otro estado en el parser: **para proteger UNA línea no hace falta el lexer de
// PostgreSQL.** Contar texto no tiene esos agujeros porque no interpreta nada.
//
// El precio, dicho de frente: una aparición del identificador en un comentario
// del schema hace fallar el guard aunque sea inofensiva. Es deliberado — falla
// del lado conservador — y por eso los comentarios de `supabase/schema.sql`
// dicen "la columna de estilo" y no el nombre literal.
import fs from "node:fs";
import path from "node:path";

/** El único archivo que este guard mira. */
export const ARCHIVO = path.join("supabase", "schema.sql");

/**
 * El identificador que se cuenta, siempre escrito en minúsculas.
 *
 * **La comparación NO distingue mayúsculas**, y no es una comodidad de estilo:
 * PostgreSQL pliega los identificadores no citados a minúsculas, así que
 * `AVATAR_STYLE`, `Avatar_Style` y `avatar_style` son **la misma columna**.
 * Contar sólo la forma en minúsculas dejaba pasar entero un
 * `update profiles set AVATAR_STYLE = null;` y, de paso, hacía fallar la
 * sentencia autorizada si alguien la escribía en mayúsculas.
 */
export const COLUMNA = "avatar_style";

/**
 * La única línea autorizada a contenerlo, ya normalizada.
 *
 * Crea la columna sin default: sobre una base nueva nace sin default, y sobre
 * Producción no hace nada porque la columna ya existe.
 *
 * **Cambiar esto es una decisión de producto, no un arreglo de test.**
 */
export const LINEA_AUTORIZADA = "alter table profiles add column if not exists avatar_style text;";

/** Minúsculas y un solo espacio. Un reformateo inocente no rompe el build. */
export const normalizar = (linea) => linea.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Revisa el contenido de un schema. Devuelve los problemas encontrados, o `[]`.
 *
 * Tres reglas, en orden:
 *
 *  1. Tiene que haber **exactamente una** aparición del identificador,
 *     **sin distinguir mayúsculas** (ver `COLUMNA`).
 *  2. La línea que la contiene, normalizada, tiene que ser la autorizada.
 *  3. Cero apariciones también falla: significa que alguien borró o comentó la
 *     sentencia que crea la columna.
 */
export function revisar(sql) {
  // Se SELECCIONA y se CUENTA sobre una copia plegada a minúsculas; la línea
  // original se conserva sólo para el diagnóstico, que en minúsculas no se
  // parecería a lo que hay escrito en el archivo.
  const lineas = sql.split(/\r?\n/).map((original, i) => ({
    original,
    plegada: original.toLowerCase(),
    n: i + 1,
  }));
  const conLaColumna = lineas.filter(({ plegada }) => plegada.includes(COLUMNA));

  // Una línea podría traerlo dos veces.
  const apariciones = lineas.reduce((a, l) => a + l.plegada.split(COLUMNA).length - 1, 0);

  if (apariciones === 0) {
    return [`no aparece \`${COLUMNA}\` en ninguna línea: ¿se borró o se comentó la sentencia que crea la columna?`];
  }
  if (apariciones > 1) {
    return conLaColumna.map(({ original, n }) =>
      `línea ${n}: aparición no autorizada de \`${COLUMNA}\` — ${original.trim()}`);
  }

  const { original, n } = conLaColumna[0];
  const norm = normalizar(original);
  if (norm !== LINEA_AUTORIZADA) {
    return [`línea ${n}: la única aparición no es la sentencia autorizada.\n  esperado: ${LINEA_AUTORIZADA}\n  hallado : ${norm}`];
  }
  return [];
}

/** Lo mismo, leyendo `supabase/schema.sql`. */
export function revisarSchema(raiz = process.cwd()) {
  return revisar(fs.readFileSync(path.join(raiz, ARCHIVO), "utf8"));
}
