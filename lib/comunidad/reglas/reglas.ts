// Reglas de moderación por patrones (revisión §3.3). Cada una tiene un `id`
// estable y una `version`, y devuelve `null` si no se dispara.
//
// QUÉ NO HACEN: entender el significado. Detectan patrones conocidos; el acoso
// sin palabras de la lista, la ironía, la difamación o un patrón nuevo pasan
// (revisión §3.5). Duplicados y límites por cuenta necesitan la base y llegan
// en E3; acá no hay ninguna consulta.

import { ambito } from "./ambito.ts";
import * as L from "./listas.ts";
import { base, CLASE_SEPARADOR, clase, mapearConfusables, pasadaDigitos } from "./plegado.ts";
import type { ContextoResena, Disparo, Plegado, Regla } from "./tipos.ts";

// ---------------------------------------------------------------- utilidades

const BORDE_ANTES = "(?<![\\p{L}\\p{N}])";
const BORDE_DESPUES = "(?![\\p{L}\\p{N}])";
const esc = (s: string) => s.replace(/[\\^$.*+?()[\]{}|\-]/g, "\\$&");

/** Alguna de las palabras o frases, como palabra completa. */
function palabras(lista: readonly string[], conClases = false): RegExp {
  const alternativas = lista.map((p) => (conClases && p.length >= 4 ? clase(p) : esc(p)).replace(/ /g, "\\s+"));
  return new RegExp(`${BORDE_ANTES}(?:${alternativas.join("|")})${BORDE_DESPUES}`, "gu");
}

/** Raíces: la palabra empieza así. */
function raices(lista: readonly string[]): RegExp {
  return new RegExp(`${BORDE_ANTES}(?:${lista.map(esc).join("|")})\\p{L}*`, "gu");
}

const hay = (re: RegExp, t: string) => { re.lastIndex = 0; return re.test(t); };

function posiciones(re: RegExp, t: string): number[] {
  re.lastIndex = 0;
  return [...t.matchAll(re)].map((m) => m.index!);
}

const disparo = (resultado: Disparo["resultado"], motivo: string): Disparo => ({ resultado, motivo });

// ---------------------------------------------------------------- contrato v1: indicios compartidos

/** §6.I: intención, formas plegadas (en `base`/`digitos`). */
const RE_INTENCION_C = palabras(L.INTENCION);
/** §6.I: voseo de -ar con tilde (en `acentuada`). */
const RE_VOSEO_AR = new RegExp(`(?<![\\p{L}\\p{N}])(?:${L.INTENCION_VOSEO_AR.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "gu");
/** §6.M: medios (plataformas, proveedores y palabras de medio). "x" aparte. */
const RE_PLATAFORMA_C = palabras(L.PLATAFORMAS_CONTRATO);
const RE_MEDIO = palabras([...L.PLATAFORMAS_CONTRATO, ...L.PROVEEDORES_CORREO, ...L.PALABRAS_MEDIO]);

/** Posiciones de intención en `base` (las formas con tilde vienen de `acentuada`). */
function posicionesIntencion(p: Plegado): number[] {
  return [...posiciones(RE_INTENCION_C, p.base), ...posiciones(RE_VOSEO_AR, p.acentuada)];
}

/** ¿Algún par (x de xs, y de ys) está en el ámbito de `t`? */
function enAmbito(t: string, xs: number[], ys: number[], mismaOracion = false): boolean {
  if (xs.length === 0 || ys.length === 0) return false;
  const a = ambito(t);
  return xs.some((x) => ys.some((y) => a.cerca(x, y, mismaOracion)));
}

// ---------------------------------------------------------------- números

export interface Corrida {
  texto: string;
  desde: number;
  hasta: number;
  digitos: number;
  /**
   * Por qué parece legítima (año, importe con miles, fecha, CUIT), o `null`.
   * Una excepción NO la descarta: sólo exige una señal fuerte de contacto
   * para contarla como teléfono (E1.1, A1).
   */
  excepcion: "anio" | "miles" | "fecha" | "puntaje" | "cuit" | "documento" | null;
}

// Separadores dentro de un número: espacio, puntuación de enlace y símbolos
// tipográficos (punto medio, viñeta, rayas y guiones Unicode, tilde, barra
// vertical). E1.2 (A2) generalizó la lista de E1 por CLASE de signo, no por
// literal. Ni "/" ni "," separan: "15/03/2024" y "1985, 1999" son números
// distintos (la coma tiene una lectura aparte, sólo con señal fuerte).
// v4 (contrato v1, S): la lista finita de E1.2 se reemplazó por la clase S de
// Unicode 18.0.0 (`CLASE_SEPARADOR`, que incluye `_` y `/`). Como `/` ahora
// separa, las fechas `dd/mm/aaaa` y los puntajes `8/10` son excepciones.
// El salto de línea (que el plegado conserva desde A5 de bbb8fc7) sigue
// partiendo números como antes, cuando se convertía en espacio: no se reduce
// la cobertura vigente de teléfonos escritos en dos líneas.
const SEP = `(?:${CLASE_SEPARADOR}|\\n)`;
const CORRIDA = new RegExp(`\\+?\\d(?:${SEP}{0,3}\\d)*`, "gu");
// Lectura amplia (S2): además `,` `;` `:` ("once, seis, 72, 81…").
const CORRIDA_AMPLIA = new RegExp(`\\+?\\d(?:(?:${SEP}|[,;:]){0,3}\\d)*`, "gu");
const MILES = /^\d{1,3}(?:\.\d{3})+$/;
const FECHA = /^\d{1,2}[.\-/]\d{1,2}[.\-/](?:\d{2}|\d{4})$/;
const ANIO = /^(?:19|20)\d{2}$/;
// Puntajes con barra, uno o varios ("8/10", "7.5/10 9/10", "4/5").
const PUNTAJE = /^(?:\d{1,2}(?:\.\d)?\/(?:5|10|100)\D{0,3})+$/;

/** Todas las corridas de dígitos, con su excepción si parecen legítimas. */
export function corridasNumericas(digitos: string, patron: RegExp = CORRIDA): Corrida[] {
  const salida: Corrida[] = [];
  patron.lastIndex = 0;
  for (const m of digitos.matchAll(patron)) {
    const texto = m[0].trim();
    const grupos = texto.split(/\D+/).filter(Boolean);
    const antes = digitos.slice(Math.max(0, m.index! - 14), m.index!);
    let excepcion: Corrida["excepcion"] = null;
    if (MILES.test(texto)) excepcion = "miles";
    else if (FECHA.test(texto)) excepcion = "fecha";
    else if (PUNTAJE.test(texto)) excepcion = "puntaje";
    else if (grupos.length > 0 && grupos.every((g) => ANIO.test(g))) excepcion = "anio";
    // CUIT/CUIL o DNI con su palabra delante: es dato personal (otra regla, que retiene).
    else if (/\bcui[lt]\b/.test(antes) && /^\d{2}-?\d{8}-?\d$/.test(texto)) excepcion = "cuit";
    else if (/\b(?:dni|d\.n\.i\.?|documento)\b[^\d]*$/.test(antes) && /^\d{1,2}[ .]?\d{3}[ .]?\d{3}$/.test(texto)) excepcion = "documento";
    salida.push({ texto, desde: m.index!, hasta: m.index! + m[0].length, digitos: texto.replace(/\D/g, "").length, excepcion });
  }
  return salida;
}

// Letras sueltas de la familia de LETRA_DIGITO dentro de una secuencia de
// dígitos espaciados ("I I 4 9 S 2 6 O 8 7"). Sólo se usa en la lectura
// amplia: "entre 1985 o 1986" daría un falso teléfono si se hiciera siempre.
const LETRA_SUELTA: Readonly<Record<string, string>> = { o: "0", l: "1", i: "1", s: "5", z: "2", b: "8", g: "9" };
const RE_LETRA_SUELTA = new RegExp(`(?<![\\p{L}\\p{N}])([olisbzg])(?![\\p{L}\\p{N}])`, "gu");

/**
 * Lectura amplia de los números: la coma separa y las letras sueltas de la
 * familia valen como dígitos. Sólo cuenta con una señal FUERTE de contacto
 * cerca y con el largo completo de un teléfono (E1.2, A2): "puntajes 8, 9, 7,
 * 10 y 6" no es un teléfono.
 */
export function corridasAmplias(digitos: string): Corrida[] {
  const conLetras = digitos.replace(RE_LETRA_SUELTA, (l: string, letra: string, i: number) => {
    const alrededor = digitos.slice(Math.max(0, i - 4), i + 5);
    return /\d/.test(alrededor) ? LETRA_SUELTA[letra] : l;
  });
  return corridasNumericas(conLetras, CORRIDA_AMPLIA);
}

/** Corridas sin excepción: las que podrían ser un contacto por sí solas. */
export const corridasSinExcepcion = (digitos: string) => corridasNumericas(digitos).filter((c) => c.excepcion === null);

const RE_CONTACTO = palabras(L.PALABRAS_CONTACTO);
const RE_CONTACTO_FUERTE = palabras(L.CONTACTO_FUERTE);

function cerca(re: RegExp, t: string, desde: number, hasta: number): boolean {
  return hay(re, t.slice(Math.max(0, desde - L.VENTANA_CONTACTO), hasta + L.VENTANA_CONTACTO));
}

/**
 * Señal de contacto para una corrida (contrato v1, F1): la señal fuerte
 * vigente a ≤ VENTANA_CONTACTO caracteres (se conserva), o una intención (I) o
 * un medio (M) en el ámbito. Se busca en la copia de dígitos.
 */
function senalDeContacto(digitos: string, desde: number, hasta: number): boolean {
  if (cerca(RE_CONTACTO_FUERTE, digitos, desde, hasta)) return true;
  const indicios = [...posiciones(RE_INTENCION_C, digitos), ...posiciones(RE_MEDIO, digitos)];
  return enAmbito(digitos, [desde, Math.max(desde, hasta - 1)], indicios);
}

// ---------------------------------------------------------------- contacto

/**
 * v2 (E1.1, A1): un año, un importe con miles o una fecha ya no se descartan
 * si hay una señal FUERTE de contacto cerca ("Escribime al 1.155.512.345");
 * sin ella siguen siendo legítimos. Las letras por dígitos ("5O5O") llegan
 * resueltas desde el plegado.
 * v3 (E1.2, A2): dígitos de cualquier sistema (plegado), separadores por
 * clase de signo, números dictados de 16 a 99 (plegado) y la lectura amplia
 * (coma y letras sueltas) con señal fuerte y largo completo.
 */
export const reglaTelefono: Regla<unknown> = {
  id: "contacto.telefono",
  // v4 (contrato v1, F1): separadores S de Unicode 18.0.0 (incluye `/` y
  // `_`), D2 por tabla, emoji de tecla (D6), inglés y palabras pegadas (D7/D8),
  // confusables de dígito de UTS #39 (D9). Las formas con excepción (año,
  // fecha, importe, puntaje) y la lectura amplia (S2) cuentan con la señal
  // fuerte vigente O con I o M en el ámbito.
  version: 4,
  evaluar: (p) => {
    const MOTIVO = "Sacá el número de teléfono: no se pueden compartir datos de contacto.";
    for (const c of corridasNumericas(p.digitos)) {
      const telefono = c.excepcion === null
        ? c.digitos >= L.DIGITOS_TELEFONO ||
          (c.digitos >= L.DIGITOS_TELEFONO_CON_CONTEXTO && cerca(RE_CONTACTO, p.digitos, c.desde, c.hasta))
        : c.excepcion !== "cuit" && c.excepcion !== "documento" && c.digitos >= L.DIGITOS_TELEFONO_CON_CONTEXTO &&
          senalDeContacto(p.digitos, c.desde, c.hasta);
      if (telefono) return disparo("rechazo_contenido", MOTIVO);
    }
    for (const c of corridasAmplias(p.digitos)) {
      if (c.excepcion === null && c.digitos >= L.DIGITOS_TELEFONO && senalDeContacto(p.digitos, c.desde, c.hasta)) {
        return disparo("rechazo_contenido", MOTIVO);
      }
    }
    return null;
  },
};

export const reglaTelefonoNombre: Regla<unknown> = {
  id: "contacto.telefono_nombre",
  // v3: hereda los cambios del plegado y de los separadores (E1.2).
  // v4: hereda el plegado y la clase S del contrato v1.
  version: 4,
  evaluar: (p) =>
    corridasSinExcepcion(p.digitos).some((c) => c.digitos >= L.DIGITOS_TELEFONO_NOMBRE)
      ? disparo("rechazo_contenido", "Sacá el número: los nombres no pueden tener datos de contacto.")
      : null,
};

const RE_CORREO = /[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}\-]+(?:\.[\p{L}\p{N}\-]+)+/u;
const PROVEEDORES = L.PROVEEDORES_CORREO.map(clase).join("|");
const RE_CORREO_PROVEEDOR = new RegExp(`[\\p{L}\\p{N}._\\-]{2,}@(?:${PROVEEDORES})${BORDE_DESPUES}`, "u");
// "usuario en gmail", "usuario de hotmail", "usuario del outlook", "usuario at yahoo".
const RE_USUARIO_EN_PROVEEDOR = new RegExp(
  `${BORDE_ANTES}([\\p{L}\\p{N}][\\p{L}\\p{N}._\\-]{2,})\\s+(?:en|de|del|at|por)\\s+(?:${PROVEEDORES})${BORDE_DESPUES}`,
  "gu",
);
const NO_USUARIO = new Set(L.NO_USUARIO_CORREO);
const DETERMINANTES = new Set(["su", "sus", "tu", "tus", "el", "la", "los", "las", "un", "una", "del", "al", "este", "esta", "ese", "esa"]);
const RE_PISTA_CORREO = palabras(L.PISTAS_CORREO);

/** "cuenta_demo en gmail" o, con una pista de correo cerca, "juanperez en gmail". */
function usuarioEnProveedor(t: string): boolean {
  RE_USUARIO_EN_PROVEEDOR.lastIndex = 0;
  for (const m of t.matchAll(RE_USUARIO_EN_PROVEEDOR)) {
    const usuario = m[1];
    if (NO_USUARIO.has(usuario)) continue;
    // v3 (contrato v1, control de F2): un sustantivo común con determinante o
    // posesivo delante ("el mail de su jefe en Gmail") no es un usuario, salvo
    // que tenga forma de usuario.
    const previa = t.slice(Math.max(0, m.index! - 8), m.index!).trim().split(/\s+/).pop() ?? "";
    if (DETERMINANTES.has(previa) && !/[\d_.]/.test(usuario)) continue;
    const pareceUsuario = /[\d_.]/.test(usuario.slice(1, -1)) || /\d/.test(usuario);
    const ventana = t.slice(Math.max(0, m.index! - L.VENTANA_CORREO), m.index! + m[0].length + L.VENTANA_CORREO);
    if (pareceUsuario || hay(RE_PISTA_CORREO, ventana)) return true;
  }
  return false;
}

// F2 (contrato v1): "<alias>, mi usuario/mail/correo/casilla de <proveedor>".
const RE_MI_CASILLA_PROVEEDOR = new RegExp(
  `${BORDE_ANTES}mi\\s+(?:usuario|mail|email|correo|casilla|cuenta)\\s+(?:de|del|en)\\s+(?:${PROVEEDORES})${BORDE_DESPUES}`,
  "gu",
);

/** Alias con forma de usuario (A) en `t`, con su posición. */
function posicionesAlias(t: string): number[] {
  RE_TOKEN_ALIAS_G.lastIndex = 0;
  return [...t.matchAll(RE_TOKEN_ALIAS_G)].filter((m) => esAliasFuerte(m[0])).map((m) => m.index!);
}

/**
 * v2 (E1.1, A2): suma la familia "usuario en/de proveedor".
 * v3 (contrato v1, F2): un alias (A) y "mi usuario/mail/correo/casilla de
 * <proveedor>" en el ámbito ("nachito.cine, que es mi usuario de Gmail").
 */
export const reglaCorreo: Regla<unknown> = {
  id: "contacto.email",
  version: 3,
  evaluar: (p) =>
    RE_CORREO.test(p.letras) || RE_CORREO_PROVEEDOR.test(p.letras) || usuarioEnProveedor(p.letras) ||
    enAmbito(p.base, posiciones(RE_MI_CASILLA_PROVEEDOR, p.base), posicionesAlias(p.base))
      ? disparo("rechazo_contenido", "Sacá la dirección de correo: no se pueden compartir datos de contacto.")
      : null,
};

/**
 * En un nombre no hay motivo para nombrar un proveedor de correo: "lucas en
 * gmail" ya es un pedido de contacto aunque falte la pista que se exige en una
 * reseña (E1.2; en reseñas, "el correo de gmail de su jefe" es legítimo).
 */
const RE_PROVEEDOR_SOLO = new RegExp(`${BORDE_ANTES}(?:${PROVEEDORES})${BORDE_DESPUES}`, "u");

export const reglaCorreoNombre: Regla<unknown> = {
  id: "contacto.email_nombre",
  version: 1,
  evaluar: (p) =>
    RE_PROVEEDOR_SOLO.test(p.letras)
      ? disparo("rechazo_contenido", "Sacá el correo: los nombres no pueden tener datos de contacto.")
      : null,
};

// ---- correo incompleto o indirecto (A2 de 40288f6)
// No reconstruye la dirección: junta señales que, solas, no alcanzan.

// "mi correo es <alias>", "mi mail: <alias>", "mi gmail es <alias>".
const RE_AUTO_CORREO = new RegExp(
  `${BORDE_ANTES}mi\\s+(?:${[...L.PALABRAS_CORREO].map(esc).join("|")}|${PROVEEDORES})\\s*(?:es|:|=|->)\\s*([\\p{L}\\p{N}][\\p{L}\\p{N}._\\-]*)`,
  "gu",
);
const RE_PALABRA_CORREO = palabras(L.PALABRAS_CORREO);
const RE_INTENCION = palabras([...L.VERBOS_CONTACTO, ...L.INTENCION_CORREO]);
const NO_ALIAS = new Set(L.NO_ALIAS_CORREO);
// Candidatos a alias: tramos de letras, dígitos, ".", "_" y "-". UNA sola
// definición de "alias con forma de usuario" para los dos recorridos (A2 de
// 251f3d0: antes la búsqueda libre no veía "88cine" ni "cine8fan").
const RE_TOKEN_ALIAS_G = /(?<![\p{L}\p{N}@._\-])[\p{L}\p{N}][\p{L}\p{N}._\-]*/gu;
const RE_FORMA_ALIAS = /^[\p{L}\p{N}]+(?:[._\-][\p{L}\p{N}]+)*$/u;
/**
 * Alias con forma de usuario: letras y dígitos con al menos una letra y al
 * menos un dígito, "_" o "." en cualquier posición ("charly_movies",
 * "ana.demo", "tito88", "88cine", "cine8fan"). Sin letras no ("007", "2.0",
 * "8.5"); sólo letras y guiones tampoco ("ciencia-ficcion"). La puntuación
 * final de la oración no cuenta.
 */
export function esAliasFuerte(token: string): boolean {
  const a = token.replace(/[._\-]+$/, "");
  return RE_FORMA_ALIAS.test(a) && /\p{L}/u.test(a) && /[_.\d]/.test(a);
}

/** Señales combinadas de un correo dado sin la dirección completa. */
export function correoIndirecto(b: string): boolean {
  const intenciones = posiciones(RE_INTENCION, b);
  const cerca = (i: number) => intenciones.some((x) => Math.abs(x - i) <= L.VENTANA_CORREO_INDIRECTO);
  // 1. Autoatribución con alias: "mi correo es charly_movies" (forma de
  //    usuario), o "mi correo es charly" con intención de contacto cerca.
  RE_AUTO_CORREO.lastIndex = 0;
  for (const m of b.matchAll(RE_AUTO_CORREO)) {
    const alias = m[1];
    if (NO_ALIAS.has(alias) || alias.length < 3) continue;
    if (esAliasFuerte(alias) || cerca(m.index!)) return true;
  }
  // 2. Sin autoatribución: palabra de correo + intención de contacto + alias
  //    con forma de usuario, los tres cerca ("mandame un mail, soy
  //    charly_movies"). Un verbo, "correo" o un proveedor solos no alcanzan.
  const correos = posiciones(RE_PALABRA_CORREO, b);
  if (correos.length === 0 || intenciones.length === 0) return false;
  RE_TOKEN_ALIAS_G.lastIndex = 0;
  for (const m of b.matchAll(RE_TOKEN_ALIAS_G)) {
    if (!esAliasFuerte(m[0])) continue;
    const i = m.index!;
    if (correos.some((c) => Math.abs(c - i) <= L.VENTANA_CORREO_INDIRECTO) && cerca(i)) return true;
  }
  return false;
}

/**
 * v1 (A2 de 40288f6). RETIENE, nunca rechaza: no encontró una dirección,
 * encontró un intento. Cubre la autoatribución de correo con alias ("mi
 * correo es charly_movies en el de Google") y el pedido de correo con un
 * alias con forma de usuario cerca. No dispara con Google, "correo" o un
 * verbo aislados, ni con "mi correo es un desastre".
 * v2 (A2 de 251f3d0): un solo criterio de alias (`esAliasFuerte`) en los dos
 * recorridos; la búsqueda libre ya reconoce dígitos al principio y en medio.
 */
export const reglaCorreoIndirecto: Regla<unknown> = {
  id: "contacto.email_indirecto",
  version: 2,
  evaluar: (p) =>
    correoIndirecto(p.base)
      ? disparo("retener", "Posible correo de contacto dado de forma incompleta o indirecta.")
      : null,
};

const ETIQUETA = "[\\p{L}\\p{N}][\\p{L}\\p{N}_\\-]*";
const RE_DOMINIO_FUERTE = new RegExp(`${BORDE_ANTES}${ETIQUETA}\\.(?:${L.TLD_FUERTES.map(clase).join("|")})${BORDE_DESPUES}`, "u");
const RE_DOMINIO_DEBIL = new RegExp(`${BORDE_ANTES}${ETIQUETA}\\.(?:${L.TLD_DEBILES.map(esc).join("|")})/`, "u");
/**
 * Dirección con ruta y CUALQUIER terminación alfabética ("is.gd/demo",
 * "algo.xyz/abc", "ejemplo.photography/demo"): una ruta pegada a
 * "etiqueta.letras" no aparece en puntuación natural, así que no hace falta
 * conocer el TLD. El tope es el largo de una etiqueta DNS (63), no una lista:
 * E1.2 lo limitaba a 6 letras y dejaba pasar las terminaciones largas (A1 de
 * 40288f6). La ruta admite los mismos caracteres que en E1.2, también al
 * principio ("/_demo", "/-x", "/?id=1"): v4 exigía letra o dígito inicial y
 * eso dejó pasar rutas que v3 detectaba (A1 de 251f3d0). "y/o", "8.5/10" y
 * "2.0/beta" no llegan acá: les falta "etiqueta.letras/". Sin ruta, manda la
 * lista de TLD.
 */
const RE_DOMINIO_CON_RUTA = new RegExp(`${BORDE_ANTES}${ETIQUETA}(?:\\.${ETIQUETA})*\\.\\p{L}{2,63}/[\\p{L}\\p{N}_\\-./?=&%#]+`, "u");
const RE_ESQUEMA = /(?:https?:\/\/|www\.)/u;
const RE_HOSTS = palabras(L.HOSTS_SIN_TLD);

// ---- F3-4 y F3-6 (contrato v1, §3.1). Variante sin IANA: F3-6 sólo T-fuerte.
const T_PALABRA = new Set(L.T_PALABRA);
// Punto espaciado (espacios a los DOS lados) o escrito (con guiones pegados opcionales a la forma entre corchetes).
const PUNTO_ESP = "(?:\\s+[.。．｡]\\s+|\\s+(?:punto|dot)\\s+|\\s*-?[\\[(]\\s*(?:[.。]|punto|dot)\\s*[\\])]-?\\s*)";
const BARRA = "(?:\\s?/\\s?|\\s+(?:slash|barra)\\s+)";
/** F3-4: etiqueta(s) + punto espaciado o escrito + terminación alfabética (no T-palabra) + barra + segmento de 2+. */
const RE_F3_4 = new RegExp(
  `${BORDE_ANTES}(${ETIQUETA})((?:(?:${PUNTO_ESP}|\\.)${ETIQUETA})*?)${PUNTO_ESP}(\\p{L}{2,63})${BARRA}[\\p{L}\\p{N}]{2,}`,
  "gu",
);
/** F3-6: coma pegada en lugar del punto + T-fuerte + ruta con un segmento de 2+. */
const RE_F3_6 = new RegExp(`${BORDE_ANTES}${ETIQUETA},(?:${L.TLD_FUERTES.map(esc).join("|")})/[\\p{L}\\p{N}]{2,}`, "u");
// Palabras gramaticales que no pueden ir antes de "punto" escrito (como en el plegado).
const NO_ETIQUETA_F3 = new Set(["el", "la", "los", "las", "lo", "un", "una", "de", "del", "al", "en", "a", "y", "o", "que", "su", "sus", "mi", "tu", "es", "muy"]);

function enlaceEspaciado(t: string): boolean {
  RE_F3_4.lastIndex = 0;
  for (const m of t.matchAll(RE_F3_4)) {
    const terminacion = m[3];
    if (T_PALABRA.has(terminacion)) continue;
    const escrito = /punto|dot/.test(m[0]);
    const ultima = (m[2].split(/\s+(?:punto|dot)\s+|\s*[.。．｡]\s*/).pop() || m[1]).trim();
    if (escrito && NO_ETIQUETA_F3.has(ultima)) continue;
    return true;
  }
  return false;
}

/**
 * v2 (E1.1, A2): mismos patrones; el plegado mapea más confusables ("сом" con м cirílica).
 * v3 (E1.2, A3): dirección con ruta y terminación de 2 a 6 letras, más TLD y
 * acortadores conocidos; "las punto com" ya no llega como dominio (plegado).
 * v4 (A1 de 40288f6): la dirección con ruta acepta terminaciones alfabéticas
 * de cualquier largo (hasta 63), no sólo de 2 a 6.
 * v5 (A1 de 251f3d0): la ruta vuelve a admitir cualquier carácter de ruta al
 * principio, como en v3; v4 había perdido "/_demo".
 */
export const reglaEnlace: Regla<unknown> = {
  id: "contacto.enlace",
  // v6 (contrato v1, §3.1): F3-4 (punto espaciado o escrito + terminación
  // alfabética que no es T-palabra + barra + segmento) y F3-6 (coma por punto
  // + T-fuerte + ruta), sobre `base` con confusables de letra. F3-1, F3-2,
  // F3-3 y F3-5 son los patrones vigentes, sin cambios (F3-3 conserva la ruta
  // de 2026-10-22.5; enmienda 1 de 5982374). Variante sin IANA.
  version: 6,
  evaluar: (p) => {
    const conConfusables = mapearConfusables(p.base);
    return RE_ESQUEMA.test(p.letras) || RE_DOMINIO_FUERTE.test(p.letras) || RE_DOMINIO_DEBIL.test(p.letras) ||
      RE_DOMINIO_CON_RUTA.test(p.letras) || hay(RE_HOSTS, p.letras) ||
      enlaceEspaciado(conConfusables) || RE_F3_6.test(conConfusables) || RE_F3_6.test(p.letras)
      ? disparo("rechazo_contenido", "Sacá el enlace o la dirección web: no se pueden compartir enlaces.")
      : null;
  },
};

const RE_HANDLE = /(?<![\p{L}\p{N}._%+\-])@[\p{L}\p{N}_.]{3,}/u;
const RE_PLATAFORMA = palabras(L.PLATAFORMAS_RED, true);
const RE_PLATAFORMA_DOS_PUNTOS = new RegExp(`${RE_PLATAFORMA.source}\\s*(?::|->|=)\\s*[\\p{L}\\p{N}@]`, "u");
const RE_VERBO = palabras([...L.VERBOS_CONTACTO, "me encuentran", "me encontras"]);

const MOTIVO_RED = "Sacá el usuario o la red social: no se pueden compartir datos de contacto.";
const RE_HANDLE_G = new RegExp(RE_HANDLE.source, "gu");

// Tramos entre comillas. Son una señal CONTEXTUAL (posible diálogo o cita),
// no una prueba de inocuidad (E1.2, A1).
const RE_COMILLAS = /"[^"]*"|“[^”]*”|«[^»]*»|‹[^›]*›|(?<![\p{L}\p{N}])'[^']*'(?![\p{L}\p{N}])|‘[^’]*’/gu;

function entreComillas(t: string): (i: number) => boolean {
  const tramos = [...t.matchAll(RE_COMILLAS)].map((m) => [m.index!, m.index! + m[0].length] as const);
  return (i) => tramos.some(([d, h]) => i > d && i < h);
}

// Atribución narrativa justo antes del verbo: "le dice", "le grita", "responde".
const RE_ATRIBUCION = palabras(L.VERBOS_ATRIBUCION);
// Destinatario de forma reconocible cerca: "a cine_amigo", "soy cinefila_demo", "como juan.cine".
const RE_DESTINATARIO = /(?<![\p{L}\p{N}])(?:a|al|como|soy|usuario|user|nick)\s+[\p{L}\p{N}]*[_.\d][\p{L}\p{N}_.]*/u;

type Fuerza = "rechazo" | "retencion" | null;

/** Pedidos "verbo de contacto + red" en una copia del texto, con su fuerza. */
function pedidosDeRed(t: string): Fuerza {
  const plataformas = posiciones(RE_PLATAFORMA, t);
  if (plataformas.length === 0) return null;
  const comillas = entreComillas(t);
  let fuerza: Fuerza = null;
  for (const v of posiciones(RE_VERBO, t)) {
    if (!plataformas.some((x) => Math.abs(x - v) <= L.VENTANA_RED)) continue;
    const ventana = t.slice(Math.max(0, v - 10), v + L.VENTANA_RED + 30);
    if (RE_DESTINATARIO.test(ventana)) return "rechazo";
    const atribuido = hay(RE_ATRIBUCION, t.slice(Math.max(0, v - 25), v));
    if (comillas(v) || atribuido) fuerza = "retencion";
    else return "rechazo";
  }
  return fuerza;
}

/**
 * v2 (E1.1, A3). Ya no alcanza con que una red y un verbo aparezcan en
 * cualquier parte del texto.
 * v3 (E1.2, A1). Las comillas dejaron de ser una exención: «Escribime por
 * Instagram a cine_amigo» se rechaza igual que sin comillas.
 *   Rechaza:
 *   - un usuario (@algo) cerca de una red o de un verbo de contacto;
 *   - "red: algo";
 *   - verbo de contacto + red a ≤ VENTANA_RED, con un destinatario de forma
 *     reconocible cerca, con o sin comillas;
 *   - verbo de contacto + red sin comillas ni atribución narrativa.
 *   Retiene (señal débil, revisión humana):
 *   - verbo + red entre comillas o atribuido a un personaje ("le dice
 *     'escribime por WhatsApp'") sin destinatario. No se publica solo.
 *   No dispara: una red mencionada sin verbo de contacto cerca.
 */
// ---- F4 (contrato v1, §3): (A, o presentación + alias) y (plataforma o I) en el ámbito.
// `alias#dddd` (Discord) y "@ alias" con un espacio también son A.
const RE_ALIAS_ETIQUETA = /(?<![\p{L}\p{N}._])[\p{L}\p{N}._]{2,}#\d{2,6}(?!\d)/gu;
const RE_ARROBA_ALIAS = /(?<![\p{L}\p{N}._%+\-])@ ?[\p{L}\p{N}_.]{2,}/gu;
const RE_PRESENTACION = /(?<![\p{L}\p{N}])(el usuario es|mi usuario es|usuario|user|nick|soy|como)\s*:?\s+([\p{L}\p{N}][\p{L}\p{N}._\-]*)/gu;
// "x" (Twitter) sólo cuenta junto a "usuario", "@" o un alias.
const RE_X_RED = /(?<![\p{L}\p{N}])x(?![\p{L}\p{N}])(?=[^.!?]{0,20}(?:usuario|@))|(?<=(?:usuario|@)[^.!?]{0,20})(?<![\p{L}\p{N}])x(?![\p{L}\p{N}])/gu;

/** Posiciones de un alias de F4 en `base`. */
function aliasF4(b: string): number[] {
  const salida = [...posicionesAlias(b), ...posiciones(RE_ALIAS_ETIQUETA, b), ...posiciones(RE_ARROBA_ALIAS, b)];
  RE_PRESENTACION.lastIndex = 0;
  for (const m of b.matchAll(RE_PRESENTACION)) {
    const intro = m[1];
    const alias = m[2].replace(/[._\-]+$/, "");
    if (alias.length < 3 || NO_ALIAS.has(alias)) continue;
    // "soy"/"como" sólo con un alias con forma de usuario: "soy fan" no es un usuario.
    if ((intro === "soy" || intro === "como") && !esAliasFuerte(alias)) continue;
    salida.push(m.index!);
  }
  return salida;
}

/** F4: alias y (plataforma o intención) en el ámbito, con o sin comillas. */
export function usuarioDeRed(p: Plegado): boolean {
  const alias = aliasF4(p.base);
  if (alias.length === 0) return false;
  const otros = [...posiciones(RE_PLATAFORMA_C, p.base), ...posiciones(RE_X_RED, p.base), ...posicionesIntencion(p)];
  return enAmbito(p.base, alias, otros);
}

export const reglaRed: Regla<unknown> = {
  id: "contacto.red",
  // v4 (contrato v1, F4): además, un alias (A, `alias#dddd`, "@ alias" o
  // "usuario/soy/como … alias") con una plataforma de §6.M o una intención de
  // §6.I en el ámbito, con o sin comillas. Lo vigente se conserva.
  version: 4,
  evaluar: (p) => {
    // `base` y `letras` tienen distintas posiciones; cada señal se compara
    // dentro de su propia copia.
    const handles = posiciones(RE_HANDLE_G, p.base);
    const cercaDeHandle = [...posiciones(RE_PLATAFORMA, p.base), ...posiciones(RE_VERBO, p.base)];
    if (algunaCerca(handles, cercaDeHandle, L.VENTANA_HANDLE) || RE_PLATAFORMA_DOS_PUNTOS.test(p.letras) || usuarioDeRed(p)) {
      return disparo("rechazo_contenido", MOTIVO_RED);
    }
    const fuerzas = [pedidosDeRed(p.base), pedidosDeRed(p.letras)];
    if (fuerzas.includes("rechazo")) return disparo("rechazo_contenido", MOTIVO_RED);
    if (fuerzas.includes("retencion")) return disparo("retener", "Pedido de contacto por red entre comillas o en un diálogo.");
    return null;
  },
};

const algunaCerca = (xs: number[], ys: number[], ventana: number) =>
  xs.some((x) => ys.some((y) => Math.abs(x - y) <= ventana));

/** En un nombre, un usuario o una red sola ya es un pedido de contacto. */
export const reglaRedNombre: Regla<unknown> = {
  id: "contacto.red_nombre",
  // v2 (E1.2): más alias de redes ("tik tok", "tg") desde listas.ts.
  // v3 (contrato v1, F4): también alias + plataforma de §6.M o I ("sgme en tt
  // lucho.series"); los alias nuevos y ambiguos (tt, tele, dc, x) no rechazan solos.
  version: 3,
  evaluar: (p) =>
    RE_HANDLE.test(p.base) || hay(RE_PLATAFORMA, p.letras) || hay(RE_VERBO, p.base) || usuarioDeRed(p)
      ? disparo("rechazo_contenido", MOTIVO_RED)
      : null,
};

/**
 * Contacto partido entre reseñas (revisión §3.4): mitigación PARCIAL. Suma
 * los dígitos de las corridas de 2 o más (sin años, montos ni fechas) del
 * texto y de los recientes de la cuenta; si llegan a un teléfono y hay una
 * palabra de contacto en alguno, retiene. Retiene y no rechaza porque la
 * evidencia es más débil que un número entero en un solo texto.
 */
// Un texto reciente que termina "colgando" un correo o usuario ("vale.series
// arroba", "hotmail punto com punto", "… como @tito").
// El punto final NO cuenta: casi todo texto termina así.
const RE_COLGANTE = /(?:@|\barroba|\bpunto|\bdot|[_:])\s*$|(?<![\p{L}\p{N}._%+\-])@[\p{L}\p{N}_.]{2,}\s*[.!]?\s*$/u;
const RE_PISTA_CONTINUACION = palabras([...L.PISTAS_CONTINUACION, ...L.CONTINUACION_EXTRA]);
// v4 (contrato v1, S4): un reciente que anuncia que el dato sigue en otra
// reseña ("empieza con lu.reacciona y lo termino en otra reseña").
const RE_MARCADOR_RECIENTE = palabras(L.CONTINUACION_EXTRA);

/**
 * Contacto partido entre reseñas (revisión §3.4): mitigación PARCIAL, siempre
 * RETIENE (la evidencia es más débil que un dato completo en un texto).
 * - Números: suma los dígitos de las corridas de 2 o más (sin años, montos
 *   ni fechas) del texto y de los recientes; con una palabra de contacto en
 *   alguno, si llegan a un teléfono.
 * - v3 (E1.2): correo o usuario repartido. Un reciente termina colgando un
 *   correo o usuario y el texto actual tiene una pista de continuación
 *   ("terminación", "el resto", "sumalo", "mail", "usuario").
 * Armar un dato a partir de instrucciones en lenguaje natural ("sumalo al
 * principio que ya te dije") queda fuera: depende de denuncias.
 */
export const reglaContactoPartido: Regla<ContextoResena> = {
  id: "contacto.partido",
  // v2: los recientes se pliegan igual que el texto. v3: colgantes de correo o usuario.
  // v4 (contrato v1, S4): marcadores de §6.K en un reciente, con un alias o un
  // colgante, y una pista de continuación en el actual.
  version: 4,
  evaluar: (p, contexto) => {
    if (contexto.textosRecientes.length === 0) return null;
    const MOTIVO = "Posible dato de contacto repartido entre reseñas.";
    const recientesBase = contexto.textosRecientes.map((t) => base(t));
    const anuncia = (t: string) => RE_COLGANTE.test(t) || (hay(RE_MARCADOR_RECIENTE, t) && posicionesAlias(t).length > 0);
    if (recientesBase.some(anuncia) && hay(RE_PISTA_CONTINUACION, p.base)) {
      return disparo("retener", MOTIVO);
    }
    const fragmentos = (d: string) => corridasSinExcepcion(d).filter((c) => c.digitos >= 2);
    const propios = fragmentos(p.digitos);
    if (propios.length === 0) return null;
    const recientes = recientesBase.map(pasadaDigitos);
    const total = [...propios, ...recientes.flatMap(fragmentos)].reduce((s, c) => s + c.digitos, 0);
    const contacto = [p.digitos, ...recientes].some((t) => hay(RE_CONTACTO, t));
    return total >= L.DIGITOS_TELEFONO && contacto ? disparo("retener", MOTIVO) : null;
  },
};

// ---------------------------------------------------------------- señales S1 y S2 (contrato v1, §4)

// S1: "mi/nuestro/nuestra" (+ a lo sumo una palabra) + medio de §6.M.
const RE_AUTOATRIBUCION = new RegExp(
  `${BORDE_ANTES}(?:mi|mis|nuestro|nuestra|nuestros|nuestras)\\s+(?:[\\p{L}]+\\s+)?(?:${[...L.PLATAFORMAS_CONTRATO, ...L.PROVEEDORES_CORREO, ...L.PALABRAS_MEDIO].map(esc).join("|").replace(/ /g, "\\s+")})${BORDE_DESPUES}`,
  "gu",
);
const RE_PEDIDO_PRIVADO = palabras(L.PEDIDO_PRIVADO);

/** S1: autoatribución de un medio + intención en el ámbito. Nunca con un indicio solo. */
export const reglaSenalAutoatribucion: Regla<unknown> = {
  id: "senal.autoatribucion",
  version: 1,
  evaluar: (p) =>
    enAmbito(p.base, posiciones(RE_AUTOATRIBUCION, p.base), posicionesIntencion(p))
      ? disparo("retener", "Posible pedido de contacto: el texto se atribuye un medio y pide que lo usen.")
      : null,
};

/**
 * S2: intención + "por privado/dm", o intención + un medio sin alias, en el
 * ámbito. La frase "por privado" sola no alcanza: hace falta otra intención.
 */
export const reglaSenalPrivado: Regla<unknown> = {
  id: "senal.privado",
  version: 1,
  evaluar: (p) => {
    const privado = posiciones(RE_PEDIDO_PRIVADO, p.base);
    const intencion = posicionesIntencion(p).filter((i) => !privado.some((x) => Math.abs(x - i) <= 3));
    const medio = posiciones(RE_MEDIO, p.base);
    return enAmbito(p.base, intencion, [...privado, ...medio])
      ? disparo("retener", "Posible pedido de contacto fuera de la reseña.")
      : null;
  },
};

// ---------------------------------------------------------------- spam

const RE_CRIPTO = palabras(L.SPAM_CRIPTO);
const RE_INVERSION = raices(L.SPAM_INVERSION);
const RE_FRASES = palabras(L.SPAM_FRASES);
const RE_PROMO = palabras(L.SPAM_PROMO);
const RE_ACCION = palabras(L.SPAM_ACCION);
// Los imperativos de voseo se buscan con tilde, en el original en minúsculas.
const RE_ACCION_VOSEO = new RegExp(`${BORDE_ANTES}(?:${L.SPAM_ACCION_VOSEO.map(esc).join("|")})\\p{L}*`, "gu");
const RE_MONTO = /(?:\$|usd|u\$s|usdt|dolares|pesos)\s?\d|\d+\s?(?:usd|usdt|dolares|pesos|%)/u;
const VENTANA_PROMO = 60;

/**
 * Cuántas señales de spam tiene el texto (para pruebas e informes).
 * `acentuado`: el original en minúsculas, para los imperativos de voseo.
 * Las posiciones de `b` y `acentuado` son aproximadamente las mismas (NFC y
 * sin acentos conserva el largo salvo casos raros); la ventana lo tolera.
 */
export function puntajeSpam(b: string, acentuado = b): number {
  let puntos = 0;
  if (hay(RE_CRIPTO, b)) puntos++;
  if (hay(RE_INVERSION, b)) puntos++;
  RE_FRASES.lastIndex = 0;
  puntos += Math.min(L.MAX_SENALES_FRASES, new Set([...b.matchAll(RE_FRASES)].map((m) => m[0])).size);
  if (RE_MONTO.test(b)) puntos++;
  const promos = posiciones(RE_PROMO, b);
  const acciones = [...posiciones(RE_ACCION, b), ...posiciones(RE_ACCION_VOSEO, acentuado)];
  if (promos.some((x) => acciones.some((y) => Math.abs(x - y) <= VENTANA_PROMO))) puntos += 2;
  return puntos;
}

/**
 * v2 (E1.2): familias divulgadas (premio por encuesta, casino, productos
 * milagro, sorteos con otros verbos); cada frase distinta suma (hasta 2); los
 * imperativos ambiguos se exigen con tilde.
 */
const RE_VENTA = palabras(L.VENTA);
const RE_ACOMPANANTE_VENTA = palabras(L.ACOMPANANTES_VENTA);
const RE_MONTO_PESOS = /\$\s?\d/gu;

/** S5 (contrato v1): venta o sorteo + un acompañante de §6.V (o una intención) en el ámbito. */
function ventaOSorteo(p: Plegado): boolean {
  const venta = posiciones(RE_VENTA, p.base);
  if (venta.length === 0) return false;
  const acompanantes = [
    ...posiciones(RE_ACOMPANANTE_VENTA, p.base),
    ...posiciones(RE_MONTO_PESOS, p.base),
    ...posicionesIntencion(p),
    ...posiciones(RE_ACCION_VOSEO, p.acentuada),
  ];
  return enAmbito(p.base, venta, acompanantes);
}

export const reglaSpam: Regla<unknown> = {
  id: "spam.promocion",
  // v3 (contrato v1, S5): además, venta o sorteo + acompañante en el ámbito.
  version: 3,
  evaluar: (p) =>
    puntajeSpam(p.base, p.original.normalize("NFKC").toLowerCase()) >= L.UMBRAL_SPAM || ventaOSorteo(p)
      ? disparo("retener", "Señales de spam o promoción.")
      : null,
};

// ---------------------------------------------------------------- odio y amenazas

const grupoPlural = (g: string) => `${clase(g)}(?:e?s)?`;
const GRUPOS_RE = L.GRUPOS.map(grupoPlural).join("|");
const RE_GRUPO_DE_MIERDA = new RegExp(`${BORDE_ANTES}(?:${GRUPOS_RE})\\s+de\\s+m[i1]erda${BORDE_DESPUES}`, "u");
const RE_EXPULSION = new RegExp(
  `${BORDE_ANTES}hay\\s+que\\s+(?:${L.VERBOS_EXPULSION.join("|")})\\s+(?:a\\s+)?(?:todos\\s+)?(?:a\\s+)?(?:los|las)?\\s*(?:${GRUPOS_RE})${BORDE_DESPUES}`,
  "u",
);
const RE_INSULTO = palabras(L.INSULTOS_ODIO, true);

// ---- H2 (contrato v1, §5 y §6.H2): grupo + deshumanización en la MISMA oración, en cualquier orden.
/** Flexión de género y número de una forma base ("boliviano" → bolivian[oa]s?). */
function flexion(g: string): string {
  if (/o$/.test(g)) return `${esc(g.slice(0, -1))}(?:o|a|os|as)`;
  if (/a$/.test(g)) return `${esc(g)}s?`;
  if (/[aeiou]n$/.test(g)) return `${esc(g)}(?:es)?`; // musulman → musulmanes
  if (/r$|l$|n$|z$|d$/.test(g)) return `${esc(g)}(?:es)?`;
  return `${esc(g)}s?`;
}
const RE_GRUPO_H2 = new RegExp(`${BORDE_ANTES}(?:${L.H2_GRUPOS.map(flexion).join("|")}|mujeres|maricones|musulmanes)${BORDE_DESPUES}`, "gu");
const RE_DESHUMANIZACION = new RegExp(
  `${BORDE_ANTES}(?:${L.H2_DESHUMANIZACION.map((x) => esc(x).replace(/ /g, "\\s+")).join("|")}|(?:hay|habria)\\s+que\\s+(?:${L.H2_VERBOS_EXPULSION.join("|")}))${BORDE_DESPUES}`,
  "gu",
);
const RE_INSULTO_H2 = palabras(L.H2_INSULTOS, true);
// En nombres, "odio" solo también es exclusión (§6.H2-b: "odio" en nombres).
const RE_ODIO_NOMBRE = /(?<![\p{L}\p{N}])odio(?![\p{L}\p{N}])/gu;

/** H2 sobre un texto plegado: grupo + deshumanización (misma oración) o insulto. */
function odioExplicito(t: string, esNombre: boolean): boolean {
  if (hay(RE_INSULTO_H2, t)) return true;
  const grupos = posiciones(RE_GRUPO_H2, t);
  const deshum = [...posiciones(RE_DESHUMANIZACION, t), ...(esNombre ? posiciones(RE_ODIO_NOMBRE, t) : [])];
  return enAmbito(t, grupos, deshum, true);
}

/** Separa mayúsculas internas, dígitos y signos de un nombre ("FueraBolitas" → "Fuera Bolitas"). */
export function separarNombre(nombre: string): string {
  return nombre
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})|(\p{N})(\p{L})/gu, (_m, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .replace(/[_.\-·]+/g, " ");
}

export const reglaOdio: Regla<unknown> = {
  id: "odio.lista",
  // v2 (contrato v1, H2): grupo de §6.H2-a + deshumanización o exclusión de
  // §6.H2-b en la misma oración y en cualquier orden, o un insulto de §6.H2-c.
  // En nombres, primero se separan mayúsculas internas, dígitos y signos.
  // Lo vigente se conserva.
  version: 2,
  evaluar: (p) =>
    RE_GRUPO_DE_MIERDA.test(p.letras) || RE_EXPULSION.test(p.letras) || hay(RE_INSULTO, p.letras) ||
    odioExplicito(mapearConfusables(p.base), false)
      ? disparo("retener", "Términos de odio.")
      : null,
};

/**
 * H2 en nombres (contrato v1, §5 H2-c): lo mismo que en reseñas, más el
 * nombre separado por mayúsculas internas, dígitos y signos, donde "odio" solo
 * también cuenta ("FueraBolitas", "MuerteALosPutos", "odio judios").
 */
export const reglaOdioNombre: Regla<unknown> = {
  id: "odio.nombre",
  version: 1,
  evaluar: (p) => {
    const separado = mapearConfusables(base(separarNombre(p.original)));
    return reglaOdio.evaluar(p, undefined) !== null || odioExplicito(separado, true)
      ? disparo("retener", "Términos de odio.")
      : null;
  },
};

const RE_AMENAZA = palabras(L.AMENAZAS);
const AMENAZAS_PEGADAS = L.AMENAZAS.map((a) => a.replace(/ /g, ""));

/**
 * v2 (E1.2): además busca las frases sin espacios dentro de las palabras que
 * se formaron al unir letras sueltas ("t e v o y a b u s c a r"). Sólo en
 * esas: buscar sin espacios en todo el texto encontraría "temato" en "el tema
 * todo".
 */
// ---- H1 (contrato v1, §5 y §6.H1).
const frase = (x: string) => esc(x).replace(/ /g, "\\s+");
const RE_H1_DIRECTA = palabras(L.H1_DIRECTAS);
const RE_H1_DESEO = palabras(L.H1_DESEO);
// Daño con el clítico pegado opcional ("matarte", "reventarlo").
const DANO = L.H1_DANO.map((d) => {
  const [verbo, ...resto] = d.split(" ");
  return `${esc(verbo)}(?:te|lo|la|le|los|las|les)?${resto.length ? `\\s+${resto.map(esc).join("\\s+")}` : ""}`;
}).join("|");
const RE_H1_PRONOMBRE = new RegExp(`${BORDE_ANTES}(te|lo|la|le|los|las|les)\\s+(voy|vamos|van)\\s+a\\s+(?:${DANO})${BORDE_DESPUES}`, "gu");
// Sin pronombre delante: el clítico pegado hace de pronombre ("voy a matarte").
const RE_H1_CLITICO = new RegExp(
  `${BORDE_ANTES}(voy|vamos|van)\\s+a\\s+(?:${L.H1_DANO.map((d) => esc(d.split(" ")[0])).join("|")})(te|lo|la|le|los|las|les)${BORDE_DESPUES}`,
  "gu",
);
const RE_H1_DESTINATARIO = new RegExp(`${BORDE_ANTES}(?:${L.H1_DESTINATARIO.map(frase).join("|")})${BORDE_DESPUES}|@[\\p{L}\\p{N}_.]{2,}`, "gu");
const RE_H1_EXCLUIDA = palabras(L.H1_EXCLUIDAS);

/**
 * v2 (auditoría de bbb8fc7, A3): una expresión de §6.H1-e exime SÓLO si
 * explica el propio fragmento: si se superpone con la amenaza ("la vamos a
 * pasar…", "me mató…") o la continúa inmediatamente, sin puntuación ni otra
 * palabra en el medio ("lo voy a matar de risa", "voy a matar el tiempo").
 * Una frase cercana en otra oración o separada por puntuación no exime:
 * "Te voy a pegar un tiro. La rompe esta peli." sigue siendo amenaza.
 */
function dentroDeExcluida(t: string, i: number, largo: number): boolean {
  const fin = i + largo;
  RE_H1_EXCLUIDA.lastIndex = 0;
  for (const m of t.matchAll(RE_H1_EXCLUIDA)) {
    const a = m.index!, b = a + m[0].length;
    const superpuesta = a < fin && b > i;
    const continua = a >= fin && /^[ \t]*$/.test(t.slice(fin, a));
    if (superpuesta || continua) return true;
  }
  return false;
}

/** H1: amenaza explícita según las formas de §6.H1 (sin interpretar intención). */
export function amenazaExplicita(t: string): boolean {
  for (const re of [RE_H1_DIRECTA, RE_H1_DESEO]) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) if (!dentroDeExcluida(t, m.index!, m[0].length)) return true;
  }
  const destinatarios = posiciones(RE_H1_DESTINATARIO, t);
  for (const re of [RE_H1_PRONOMBRE, RE_H1_CLITICO]) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      if (dentroDeExcluida(t, m.index!, m[0].length)) continue;
      const pronombre = re === RE_H1_PRONOMBRE ? m[1] : m[2];
      const persona = re === RE_H1_PRONOMBRE ? m[2] : m[1];
      if (persona === "van" && pronombre !== "te") continue;
      if (pronombre === "te") return true;
      if (enAmbito(t, [m.index!], destinatarios)) return true;
    }
  }
  return false;
}

export const reglaAmenaza: Regla<unknown> = {
  id: "amenaza.directa",
  // v3 (contrato v1, H1): formas directas, pronombre + "voy/vamos/van a" +
  // daño (con lo/la/le/los/las/les hace falta un destinatario; con "van a",
  // sólo "te"), deseo o merecimiento, y las expresiones de §6.H1-e nunca
  // disparan. Lo vigente (incluidas las letras sueltas unidas) se conserva.
  // v4 (auditoría de bbb8fc7, A3): la expresión excluida sólo exime si se
  // superpone con la amenaza o la continúa sin puntuación en el medio.
  version: 4,
  evaluar: (p) => {
    if (hay(RE_AMENAZA, p.base) || amenazaExplicita(p.base)) return disparo("retener", "Amenaza.");
    const deBase = new Set(p.base.match(/[\p{L}\p{N}]+/gu) ?? []);
    const unidas = (p.letras.match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !deBase.has(w) && w.length >= 6);
    return unidas.some((w) => AMENAZAS_PEGADAS.some((a) => w.includes(a))) ? disparo("retener", "Amenaza.") : null;
  },
};

// ---------------------------------------------------------------- datos personales y menores

const RE_DNI = /(?<![\p{L}])(?:dni|d\.n\.i\.?|documento)(?![\p{L}])[^\d]{0,12}\d{1,2}[.\s]?\d{3}[.\s]?\d{3}(?!\d)/u;
const RE_CUIT = /(?<![\p{L}])cui[lt](?![\p{L}])[^\d]{0,6}\d{2}-?\d{8}-?\d(?!\d)/u;
const RE_DOMICILIO = palabras(L.DOMICILIO);

// ---- H3 (contrato v1, §5 y §6.H3). El nombre propio se busca en el ORIGINAL (mayúsculas).
const RE_DNI_V3 = /(?<![\p{L}])(?:dni|d\.n\.i\.?|documento|doc\.)(?![\p{L}])[^\d]{0,12}\d{1,2}[.\s]?\d{3}[.\s]?\d{3}(?!\d)/u;
const RE_CUIT_SIN_ETIQUETA = /(?<![\d-])\d{2}-\d{8}-\d(?![\d-])/u;
const RE_DNI_SIN_ETIQUETA = /(?<![\d.])\d{1,2}\.\d{3}\.\d{3}(?![\d.])/gu;
const RE_UNIDAD = /(?:\$|usd|u\$s|d[oó]lares|pesos|euros|millones|entradas|espectadores|personas|votos|visitas|copias)/u;
// Dos o más palabras con mayúscula inicial seguidas (en el original).
const RE_NOMBRE_PROPIO = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)+/gu;
const RE_VIA = new RegExp(`${BORDE_ANTES}(?:${L.H3_VIAS.map(esc).join("|")})(?:\\s+[\\p{L}\\p{N}.]+){1,4}?\\s+\\d{1,5}(?!\\d)`, "gu");
const RE_RELACION = palabras(L.H3_RELACION);
const RE_LOCALIZADOR = palabras(L.H3_LOCALIZADORES);

/** Nombres propios del original, sin los que empiezan una oración (salvo que sigan dos más). */
function posicionesNombrePropio(original: string): number[] {
  const salida: number[] = [];
  RE_NOMBRE_PROPIO.lastIndex = 0;
  for (const m of original.matchAll(RE_NOMBRE_PROPIO)) {
    const antes = original.slice(0, m.index!).trimEnd();
    const inicioOracion = antes === "" || /[.!?…:]$/.test(antes);
    const palabrasN = m[0].split(/\s+/).length;
    if (inicioOracion && palabrasN < 3) continue;
    salida.push(m.index!);
  }
  return salida;
}

/**
 * v2 (E1.2): el DNI también con espacios entre grupos ("29 876 543").
 * v3 (contrato v1, H3-a): "doc." como etiqueta, CUIT/CUIL sin etiqueta y
 * DNI `dd.ddd.ddd` sin etiqueta con un nombre propio en el ámbito (sin unidad
 * monetaria o de cantidad cerca).
 */
export const reglaDocumento: Regla<unknown> = {
  id: "datos.documento",
  version: 3,
  evaluar: (p) => {
    if (RE_DNI.test(p.base) || RE_CUIT.test(p.base)) return disparo("retener", "Posibles datos personales.");
    const t = p.original.toLowerCase();
    if (RE_DNI_V3.test(t) || RE_CUIT_SIN_ETIQUETA.test(t)) return disparo("retener", "Posibles datos personales.");
    const nombres = posicionesNombrePropio(p.original);
    RE_DNI_SIN_ETIQUETA.lastIndex = 0;
    for (const m of t.matchAll(RE_DNI_SIN_ETIQUETA)) {
      const alrededor = t.slice(Math.max(0, m.index! - 25), m.index! + m[0].length + 25);
      if (!RE_UNIDAD.test(alrededor) && enAmbito(t, [m.index!], nombres)) return disparo("retener", "Posibles datos personales.");
    }
    return null;
  },
};

/**
 * v2 (contrato v1, H3-b): tipo de vía + 1 a 4 palabras + número, con un
 * nombre propio o una relación personal Y un localizador en el ámbito. Lo
 * vigente ("vive en" + número) se conserva.
 */
export const reglaDomicilio: Regla<unknown> = {
  id: "datos.domicilio",
  version: 2,
  evaluar: (p) => {
    for (const x of posiciones(RE_DOMICILIO, p.base)) {
      if (/\d{2,5}/.test(p.base.slice(x, x + L.VENTANA_DOMICILIO))) return disparo("retener", "Posibles datos personales.");
    }
    const t = p.original.toLowerCase();
    const vias = posiciones(RE_VIA, t);
    if (vias.length === 0) return null;
    const personas = [...posicionesNombrePropio(p.original), ...posiciones(RE_RELACION, t)];
    const localizadores = posiciones(RE_LOCALIZADOR, t);
    return vias.some((v) => enAmbito(t, [v], personas) && enAmbito(t, [v], localizadores))
      ? disparo("retener", "Posibles datos personales.")
      : null;
  },
};

const RE_SEXUAL = palabras(L.SEXUAL);
const RE_MENOR = palabras(L.MENORES);
const RE_EDAD = /(?<![\p{N}])(\d{1,2})\s+anos(?![\p{L}])/gu;

function posicionesMenor(b: string): number[] {
  const edades = [...b.matchAll(RE_EDAD)].filter((m) => Number(m[1]) < 18).map((m) => m.index!);
  return [...posiciones(RE_MENOR, b), ...edades];
}

export const reglaMenores: Regla<unknown> = {
  id: "menores.sexual",
  version: 1,
  evaluar: (p) => {
    const sexuales = posiciones(RE_SEXUAL, p.base);
    if (sexuales.length === 0) return null;
    const menores = posicionesMenor(p.base);
    return sexuales.some((x) => menores.some((y) => Math.abs(x - y) <= L.VENTANA_MENORES))
      ? disparo("retener", "Contenido sexual cerca de una mención de menores.")
      : null;
  },
};

// ---------------------------------------------------------------- texto anómalo (sólo reseñas)

export const reglaMayusculas: Regla<unknown> = {
  id: "anomalo.mayusculas",
  version: 1,
  evaluar: (p) => {
    const letras = [...p.original].filter((c) => /\p{L}/u.test(c));
    if (letras.length < L.MIN_LETRAS_MAYUSCULAS) return null;
    const mayus = letras.filter((c) => c !== c.toLowerCase()).length;
    return mayus / letras.length > L.MAX_PROPORCION_MAYUSCULAS ? disparo("retener", "Texto casi todo en mayúsculas.") : null;
  },
};

export const reglaVocabulario: Regla<unknown> = {
  id: "anomalo.vocabulario",
  version: 1,
  evaluar: (p) => {
    const distintas = new Set(p.base.match(/\p{L}+/gu) ?? []);
    return distintas.size < L.MIN_PALABRAS_DISTINTAS ? disparo("retener", "Muy pocas palabras distintas.") : null;
  },
};

const RE_REPETICION_CARACTER = new RegExp(`(\\p{L})\\1{${L.MAX_REPETICION_CARACTER - 1},}`, "u");
const RE_REPETICION_UNIDAD = new RegExp(`(\\p{L}{2,3})\\1{${L.MAX_REPETICION_UNIDAD - 1},}`, "u");

export const reglaRepeticion: Regla<unknown> = {
  id: "anomalo.repeticion",
  version: 1,
  evaluar: (p) =>
    RE_REPETICION_CARACTER.test(p.base) || RE_REPETICION_UNIDAD.test(p.base)
      ? disparo("retener", "Repeticiones largas.")
      : null,
};

// ---------------------------------------------------------------- derivación al perfil

const RE_PERFIL = /(?<![\p{L}])mi\s+(?:perfil|bio|nombre\s+de\s+(?:usuario|perfil))(?![\p{L}])|(?<![\p{L}])(?:mira|fijate|busca|entra|pasa\s+por)\s+(?:en\s+)?mi\s+nombre(?![\p{L}])/u;

// S3-b: verbo de remisión (§6.R) + "en/a/por" opcional + "mi" + identidad.
const IDENTIDAD = L.IDENTIDAD_PERFIL.join("|");
const RE_S3B = new RegExp(
  `${BORDE_ANTES}(?:${L.REMISION.map(frase).join("|")})\\s+(?:(?:en|a|por)\\s+)?mi\\s+(?:${IDENTIDAD})${BORDE_DESPUES}`,
  "u",
);
const RE_S3B_TILDE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${L.REMISION_TILDE.map(frase).join("|")})\\s+(?:(?:en|a|por)\\s+)?mi\\s+(?:${IDENTIDAD})(?![\\p{L}\\p{N}])`,
  "u",
);
// S3-c: "mi" + identidad, con una intención y un marcador de §6.P en el ámbito.
const RE_MI_IDENTIDAD = new RegExp(`${BORDE_ANTES}mi\\s+(?:${IDENTIDAD})${BORDE_DESPUES}`, "gu");
const RE_MARCADOR_PERFIL = palabras(L.MARCADORES_PERFIL);

export const reglaPerfil: Regla<unknown> = {
  id: "perfil.derivacion",
  // v2 (contrato v1, S3): S3-a es la expresión vigente; S3-b, un verbo de
  // remisión + "mi" + identidad; S3-c, "mi" + identidad con intención y
  // marcador en el ámbito. Falso positivo conocido (enmienda 2 de 5982374):
  // "fíjense en mi nombre favorito de la saga" se retiene.
  version: 2,
  evaluar: (p) => {
    if (RE_PERFIL.test(p.base) || RE_S3B.test(p.base) || RE_S3B_TILDE.test(p.acentuada)) return disparo("retener", "Deriva al perfil.");
    const identidad = posiciones(RE_MI_IDENTIDAD, p.base);
    return enAmbito(p.base, identidad, posicionesIntencion(p)) && enAmbito(p.base, identidad, posiciones(RE_MARCADOR_PERFIL, p.base))
      ? disparo("retener", "Deriva al perfil.")
      : null;
  },
};

// ---------------------------------------------------------------- formato

const BIDI_O_CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/u;
const largo = (t: string) => [...t].length;

export const reglaFormatoResena: Regla<unknown> = {
  id: "formato.resena",
  version: 1,
  evaluar: (p) => {
    if (BIDI_O_CONTROL.test(p.original)) return disparo("rechazo_formato", "Sacá los caracteres de control o de dirección del texto.");
    const n = largo(p.original);
    return n < L.LARGO_RESENA.min || n > L.LARGO_RESENA.max
      ? disparo("rechazo_formato", `La reseña tiene que tener entre ${L.LARGO_RESENA.min} y ${L.LARGO_RESENA.max} caracteres; ahora tiene ${n}.`)
      : null;
  },
};

export const reglaFormatoNombre: Regla<unknown> = {
  id: "formato.nombre",
  version: 1,
  evaluar: (p) => {
    if (BIDI_O_CONTROL.test(p.original) || /[\n\t]/.test(p.original)) {
      return disparo("rechazo_formato", "El nombre no puede tener saltos de línea ni caracteres de control.");
    }
    const n = largo(p.original.replace(/\s+/g, " "));
    return n < L.LARGO_NOMBRE.min || n > L.LARGO_NOMBRE.max
      ? disparo("rechazo_formato", `El nombre tiene que tener entre ${L.LARGO_NOMBRE.min} y ${L.LARGO_NOMBRE.max} caracteres.`)
      : null;
  },
};

// ---------------------------------------------------------------- conjuntos

/** Reseñas: todas las de contenido, más las de texto anómalo y el contexto. */
export const REGLAS_RESENA: readonly Regla<ContextoResena>[] = [
  reglaFormatoResena, reglaTelefono, reglaCorreo, reglaCorreoIndirecto, reglaEnlace, reglaRed,
  reglaContactoPartido, reglaSenalAutoatribucion, reglaSenalPrivado, reglaSpam, reglaOdio, reglaAmenaza,
  reglaDocumento, reglaDomicilio, reglaMenores, reglaMayusculas, reglaVocabulario,
  reglaRepeticion, reglaPerfil,
];

/**
 * Nombres (2–24): formato, contacto y odio. Sin las de texto anómalo, que
 * están pensadas para reseñas de 80–600 (revisión §3.1).
 */
export const REGLAS_NOMBRE: readonly Regla<unknown>[] = [
  reglaFormatoNombre, reglaTelefonoNombre, reglaCorreo, reglaCorreoNombre, reglaEnlace, reglaRedNombre, reglaOdioNombre,
];
