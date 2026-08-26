// Qué SQL EJECUTABLE de `supabase/schema.sql` puede tocar `profiles.avatar_style`.
//
// ⚠️ ALCANCE: **este módulo mira UN archivo, `supabase/schema.sql`.** No recorre
// las migraciones de `supabase/migrations/` ni ningún otro `.sql` del
// repositorio. Decir "barre el SQL del proyecto" sería mentir.
//
// POR QUÉ ES UNA ALLOWLIST Y NO UNA LISTA DE PROHIBICIONES.
//
// La versión anterior buscaba las operaciones peligrosas una por una con
// expresiones regulares. Detectaba las variantes que se le habían ocurrido a
// quien la escribió, y **aceptaba sintaxis de PostgreSQL perfectamente válida que
// viola exactamente la misma regla**:
//
//     create table profiles (avatar_style text default null);
//     alter table profiles alter avatar_style drop default;   -- COLUMN es opcional
//     update profiles p set avatar_style = null;               -- alias
//     update only profiles set avatar_style = null;            -- ONLY
//
// Perseguir cada forma con otra regex es una carrera que se pierde: el que
// escribe SQL nuevo siempre tiene más formas disponibles que las que el barrido
// enumeró. Así que se da vuelta la pregunta.
//
// **No se enumera lo prohibido: se enumera lo permitido.** Hoy hay exactamente
// UNA sentencia autorizada que mencione `avatar_style`. Cualquier otra —un DDL
// que no se nos ocurrió, una escritura nueva, un `create table` con default
// adentro— es un hallazgo por el solo hecho de no estar en la lista.
import fs from "node:fs";
import path from "node:path";

/** El único archivo que este módulo mira. */
export const ARCHIVO = path.join("supabase", "schema.sql");

/**
 * La ÚNICA sentencia autorizada que puede mencionar `avatar_style`, ya
 * normalizada.
 *
 * Crea la columna sin default: sobre una base nueva nace sin default, y sobre
 * Producción no hace nada porque la columna ya existe — que es exactamente el
 * comportamiento que se quiere.
 *
 * **Agregar algo acá es una decisión de producto, no un arreglo de test.** Si
 * alguna vez se autoriza una migración sobre esta columna, se suma su forma
 * normalizada a esta lista y queda registrado en el diff quién lo decidió.
 */
export const SENTENCIAS_AUTORIZADAS = Object.freeze([
  "alter table profiles add column if not exists avatar_style text;",
]);

/**
 * Corta el SQL en sentencias, salteando comentarios, cadenas y bloques
 * `$tag$...$tag$`.
 *
 * No alcanza con `split(";")`: el schema define funciones con el cuerpo entre
 * `$$`, y ahí adentro hay puntos y comas que no terminan ninguna sentencia. Sin
 * respetarlos, una función quedaría partida en pedazos y el barrido leería
 * fragmentos sin sentido.
 */
export function trocear(sql) {
  const fuera = [];
  let buf = "";
  let i = 0;
  while (i < sql.length) {
    const dos = sql.slice(i, i + 2);

    // Comentario de línea: hasta el salto.
    if (dos === "--") { while (i < sql.length && sql[i] !== "\n") i++; continue; }

    // Comentario de bloque.
    if (dos === "/*") {
      i += 2;
      while (i < sql.length && sql.slice(i, i + 2) !== "*/") i++;
      i += 2;
      continue;
    }

    // Cadena literal. Se copia entera para no confundir un `;` de adentro.
    if (sql[i] === "'") {
      buf += sql[i++];
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { buf += "''"; i += 2; continue; }
        if (sql[i] === "'") { buf += sql[i++]; break; }
        buf += sql[i++];
      }
      continue;
    }

    // Bloque `$$ ... $$` o `$tag$ ... $tag$`.
    const dolar = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
    if (dolar) {
      const tag = dolar[0];
      const cierre = sql.indexOf(tag, i + tag.length);
      const hasta = cierre === -1 ? sql.length : cierre + tag.length;
      buf += sql.slice(i, hasta);
      i = hasta;
      continue;
    }

    if (sql[i] === ";") { fuera.push(buf); buf = ""; i++; continue; }
    buf += sql[i++];
  }
  if (buf.trim()) fuera.push(buf);
  return fuera;
}

/** Una sentencia en su forma canónica: minúsculas, un espacio, con `;`. */
export function normalizar(sentencia) {
  const s = sentencia.replace(/\s+/g, " ").trim().toLowerCase();
  return s ? `${s};` : "";
}

/** Todas las sentencias ejecutables, normalizadas. Los comentarios ya no están. */
export function sentencias(sql) {
  return trocear(sql).map(normalizar).filter(Boolean);
}

/**
 * Las sentencias ejecutables que mencionan `avatar_style` y **no** están
 * autorizadas.
 *
 * Vacío = limpio. Que una sentencia aparezca acá no dice qué hace: dice que
 * toca esa columna y que nadie la autorizó, que es todo lo que hace falta saber.
 */
export function sentenciasProhibidas(sql) {
  return sentencias(sql)
    .filter((s) => s.includes("avatar_style"))
    .filter((s) => !SENTENCIAS_AUTORIZADAS.includes(s));
}

/** Lo mismo, sobre `supabase/schema.sql`. */
export function barrerSchema(raiz = process.cwd()) {
  return sentenciasProhibidas(fs.readFileSync(path.join(raiz, ARCHIVO), "utf8"));
}
