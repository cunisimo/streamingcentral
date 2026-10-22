// Reglas de moderación por patrones (revisión §3.3). Cada una tiene un `id`
// estable y una `version`, y devuelve `null` si no se dispara.
//
// QUÉ NO HACEN: entender el significado. Detectan patrones conocidos; el acoso
// sin palabras de la lista, la ironía, la difamación o un patrón nuevo pasan
// (revisión §3.5). Duplicados y límites por cuenta necesitan la base y llegan
// en E3; acá no hay ninguna consulta.

import * as L from "./listas.ts";
import { base, clase, letrasADigitos, palabrasADigitos } from "./plegado.ts";
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
  excepcion: "anio" | "miles" | "fecha" | "cuit" | null;
}

// Dígitos con hasta 3 separadores entre ellos ("11 4433-2211", "1 1 . 5 5").
// Ni "/" ni "," separan: "15/03/2024" y "1985, 1999" son tres y dos números.
const CORRIDA = /\+?\d(?:[ .\-_()*+]{0,3}\d)*/g;
const MILES = /^\d{1,3}(?:\.\d{3})+$/;
const FECHA = /^\d{1,2}[.\-]\d{1,2}[.\-](?:\d{2}|\d{4})$/;
const ANIO = /^(?:19|20)\d{2}$/;

/** Todas las corridas de dígitos, con su excepción si parecen legítimas. */
export function corridasNumericas(digitos: string): Corrida[] {
  const salida: Corrida[] = [];
  for (const m of digitos.matchAll(CORRIDA)) {
    const texto = m[0].trim();
    const grupos = texto.split(/\D+/).filter(Boolean);
    const antes = digitos.slice(Math.max(0, m.index! - 12), m.index!);
    let excepcion: Corrida["excepcion"] = null;
    if (MILES.test(texto)) excepcion = "miles";
    else if (FECHA.test(texto)) excepcion = "fecha";
    else if (grupos.length > 0 && grupos.every((g) => ANIO.test(g))) excepcion = "anio";
    // CUIT/CUIL con su palabra delante: es dato personal (otra regla).
    else if (/\bcui[lt]\b/.test(antes) && /^\d{2}-?\d{8}-?\d$/.test(texto)) excepcion = "cuit";
    salida.push({ texto, desde: m.index!, hasta: m.index! + m[0].length, digitos: texto.replace(/\D/g, "").length, excepcion });
  }
  return salida;
}

/** Corridas sin excepción: las que podrían ser un contacto por sí solas. */
export const corridasSinExcepcion = (digitos: string) => corridasNumericas(digitos).filter((c) => c.excepcion === null);

const RE_CONTACTO = palabras(L.PALABRAS_CONTACTO);
const RE_CONTACTO_FUERTE = palabras(L.CONTACTO_FUERTE);

function cerca(re: RegExp, t: string, desde: number, hasta: number): boolean {
  return hay(re, t.slice(Math.max(0, desde - L.VENTANA_CONTACTO), hasta + L.VENTANA_CONTACTO));
}

// ---------------------------------------------------------------- contacto

/**
 * v2 (E1.1, A1): un año, un importe con miles o una fecha ya no se descartan
 * si hay una señal FUERTE de contacto cerca ("Escribime al 1.155.512.345");
 * sin ella siguen siendo legítimos. Las letras por dígitos ("5O5O") llegan
 * resueltas desde el plegado.
 */
export const reglaTelefono: Regla<unknown> = {
  id: "contacto.telefono",
  version: 2,
  evaluar: (p) => {
    for (const c of corridasNumericas(p.digitos)) {
      const fuerte = () => cerca(RE_CONTACTO_FUERTE, p.digitos, c.desde, c.hasta);
      const telefono = c.excepcion === null
        ? c.digitos >= L.DIGITOS_TELEFONO ||
          (c.digitos >= L.DIGITOS_TELEFONO_CON_CONTEXTO && cerca(RE_CONTACTO, p.digitos, c.desde, c.hasta))
        : c.excepcion !== "cuit" && c.digitos >= L.DIGITOS_TELEFONO_CON_CONTEXTO && fuerte();
      if (telefono) return disparo("rechazo_contenido", "Sacá el número de teléfono: no se pueden compartir datos de contacto.");
    }
    return null;
  },
};

export const reglaTelefonoNombre: Regla<unknown> = {
  id: "contacto.telefono_nombre",
  version: 2,
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
const RE_PISTA_CORREO = palabras(L.PISTAS_CORREO);

/** "cuenta_demo en gmail" o, con una pista de correo cerca, "juanperez en gmail". */
function usuarioEnProveedor(t: string): boolean {
  RE_USUARIO_EN_PROVEEDOR.lastIndex = 0;
  for (const m of t.matchAll(RE_USUARIO_EN_PROVEEDOR)) {
    const usuario = m[1];
    if (NO_USUARIO.has(usuario)) continue;
    const pareceUsuario = /[\d_.]/.test(usuario.slice(1, -1)) || /\d/.test(usuario);
    const ventana = t.slice(Math.max(0, m.index! - L.VENTANA_CORREO), m.index! + m[0].length + L.VENTANA_CORREO);
    if (pareceUsuario || hay(RE_PISTA_CORREO, ventana)) return true;
  }
  return false;
}

/** v2 (E1.1, A2): suma la familia "usuario en/de proveedor". */
export const reglaCorreo: Regla<unknown> = {
  id: "contacto.email",
  version: 2,
  evaluar: (p) =>
    RE_CORREO.test(p.letras) || RE_CORREO_PROVEEDOR.test(p.letras) || usuarioEnProveedor(p.letras)
      ? disparo("rechazo_contenido", "Sacá la dirección de correo: no se pueden compartir datos de contacto.")
      : null,
};

const ETIQUETA = "[\\p{L}\\p{N}][\\p{L}\\p{N}_\\-]*";
const RE_DOMINIO_FUERTE = new RegExp(`${BORDE_ANTES}${ETIQUETA}\\.(?:${L.TLD_FUERTES.map(clase).join("|")})${BORDE_DESPUES}`, "u");
const RE_DOMINIO_DEBIL = new RegExp(`${BORDE_ANTES}${ETIQUETA}\\.(?:${L.TLD_DEBILES.map(esc).join("|")})/`, "u");
const RE_ESQUEMA = /(?:https?:\/\/|www\.)/u;
const RE_HOSTS = palabras(L.HOSTS_SIN_TLD);

/** v2 (E1.1, A2): mismos patrones; el plegado mapea más confusables ("сом" con м cirílica). */
export const reglaEnlace: Regla<unknown> = {
  id: "contacto.enlace",
  version: 2,
  evaluar: (p) =>
    RE_ESQUEMA.test(p.letras) || RE_DOMINIO_FUERTE.test(p.letras) || RE_DOMINIO_DEBIL.test(p.letras) || hay(RE_HOSTS, p.letras)
      ? disparo("rechazo_contenido", "Sacá el enlace o la dirección web: no se pueden compartir enlaces.")
      : null,
};

const RE_HANDLE = /(?<![\p{L}\p{N}._%+\-])@[\p{L}\p{N}_.]{3,}/u;
const RE_PLATAFORMA = palabras(L.PLATAFORMAS_RED, true);
const RE_PLATAFORMA_DOS_PUNTOS = new RegExp(`${RE_PLATAFORMA.source}\\s*(?::|->|=)\\s*[\\p{L}\\p{N}@]`, "u");
const RE_VERBO = palabras([...L.VERBOS_CONTACTO, "me encuentran", "me encontras"]);

const MOTIVO_RED = "Sacá el usuario o la red social: no se pueden compartir datos de contacto.";
const RE_HANDLE_G = new RegExp(RE_HANDLE.source, "gu");

// Tramos entre comillas: diálogo o cita, no un pedido de quien escribe.
const RE_COMILLAS = /"[^"]*"|“[^”]*”|«[^»]*»|(?<![\p{L}\p{N}])'[^']*'(?![\p{L}\p{N}])/gu;

function entreComillas(t: string): (i: number) => boolean {
  const tramos = [...t.matchAll(RE_COMILLAS)].map((m) => [m.index!, m.index! + m[0].length] as const);
  return (i) => tramos.some(([d, h]) => i > d && i < h);
}

const algunaCerca = (xs: number[], ys: number[], ventana: number) =>
  xs.some((x) => ys.some((y) => Math.abs(x - y) <= ventana));

/**
 * v2 (E1.1, A3). Ya no alcanza con que una red y un verbo aparezcan en
 * cualquier parte del texto. Rechaza sólo con evidencia acotada:
 *   - un usuario (@algo) cerca de una red o de un verbo de contacto;
 *   - "red: algo";
 *   - un verbo de contacto FUERA de comillas, a ≤ VENTANA_RED de una red.
 * Un verbo entre comillas es diálogo o cita ("le dice 'escribime'"): sin un
 * usuario, número o correo (que miran otras reglas) no dispara.
 */
export const reglaRed: Regla<unknown> = {
  id: "contacto.red",
  version: 2,
  evaluar: (p) => {
    // `base` y `letras` tienen distintas posiciones; cada señal se compara
    // dentro de su propia copia.
    const handles = posiciones(RE_HANDLE_G, p.base);
    const plataformasBase = posiciones(RE_PLATAFORMA, p.base);
    const verbos = posiciones(RE_VERBO, p.base);
    const comillas = entreComillas(p.base);
    const verbosPropios = verbos.filter((i) => !comillas(i));
    const plataformasLetras = posiciones(RE_PLATAFORMA, p.letras);
    const verbosLetras = posiciones(RE_VERBO, p.letras);
    const comillasLetras = entreComillas(p.letras);
    if (
      algunaCerca(handles, [...plataformasBase, ...verbos], L.VENTANA_HANDLE) ||
      RE_PLATAFORMA_DOS_PUNTOS.test(p.letras) ||
      algunaCerca(verbosPropios, plataformasBase, L.VENTANA_RED) ||
      algunaCerca(verbosLetras.filter((i) => !comillasLetras(i)), plataformasLetras, L.VENTANA_RED)
    ) {
      return disparo("rechazo_contenido", MOTIVO_RED);
    }
    return null;
  },
};

/** En un nombre, un usuario o una red sola ya es un pedido de contacto. */
export const reglaRedNombre: Regla<unknown> = {
  id: "contacto.red_nombre",
  version: 1,
  evaluar: (p) =>
    RE_HANDLE.test(p.base) || hay(RE_PLATAFORMA, p.letras) || hay(RE_VERBO, p.base)
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
export const reglaContactoPartido: Regla<ContextoResena> = {
  id: "contacto.partido",
  // v2: los recientes se pliegan igual que el texto (letras por dígitos).
  version: 2,
  evaluar: (p, contexto) => {
    const fragmentos = (d: string) => corridasSinExcepcion(d).filter((c) => c.digitos >= 2);
    const propios = fragmentos(p.digitos);
    if (propios.length === 0 || contexto.textosRecientes.length === 0) return null;
    const recientes = contexto.textosRecientes.map((t) => palabrasADigitos(letrasADigitos(base(t))));
    const total = [...propios, ...recientes.flatMap(fragmentos)].reduce((s, c) => s + c.digitos, 0);
    const contacto = [p.digitos, ...recientes].some((t) => hay(RE_CONTACTO, t));
    return total >= L.DIGITOS_TELEFONO && contacto
      ? disparo("retener", "Posible dato de contacto repartido entre reseñas.")
      : null;
  },
};

// ---------------------------------------------------------------- spam

const RE_CRIPTO = palabras(L.SPAM_CRIPTO);
const RE_INVERSION = raices(L.SPAM_INVERSION);
const RE_FRASES = palabras(L.SPAM_FRASES);
const RE_PROMO = palabras(L.SPAM_PROMO);
const RE_ACCION = palabras(L.SPAM_ACCION);
const RE_MONTO = /(?:\$|usd|u\$s|usdt|dolares|pesos)\s?\d|\d+\s?(?:usd|usdt|dolares|pesos|%)/u;
const VENTANA_PROMO = 60;

/** Cuántas señales de spam tiene el texto (para pruebas e informes). */
export function puntajeSpam(b: string): number {
  let puntos = 0;
  if (hay(RE_CRIPTO, b)) puntos++;
  if (hay(RE_INVERSION, b)) puntos++;
  if (hay(RE_FRASES, b)) puntos++;
  if (RE_MONTO.test(b)) puntos++;
  const promos = posiciones(RE_PROMO, b);
  const acciones = posiciones(RE_ACCION, b);
  if (promos.some((x) => acciones.some((y) => Math.abs(x - y) <= VENTANA_PROMO))) puntos += 2;
  return puntos;
}

export const reglaSpam: Regla<unknown> = {
  id: "spam.promocion",
  version: 1,
  evaluar: (p) => (puntajeSpam(p.base) >= L.UMBRAL_SPAM ? disparo("retener", "Señales de spam o promoción.") : null),
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

export const reglaOdio: Regla<unknown> = {
  id: "odio.lista",
  version: 1,
  evaluar: (p) =>
    RE_GRUPO_DE_MIERDA.test(p.letras) || RE_EXPULSION.test(p.letras) || hay(RE_INSULTO, p.letras)
      ? disparo("retener", "Términos de odio.")
      : null,
};

const RE_AMENAZA = palabras(L.AMENAZAS);

export const reglaAmenaza: Regla<unknown> = {
  id: "amenaza.directa",
  version: 1,
  evaluar: (p) => (hay(RE_AMENAZA, p.base) ? disparo("retener", "Amenaza.") : null),
};

// ---------------------------------------------------------------- datos personales y menores

const RE_DNI = /(?<![\p{L}])(?:dni|d\.n\.i\.?|documento)(?![\p{L}])[^\d]{0,12}\d{1,2}\.?\d{3}\.?\d{3}(?!\d)/u;
const RE_CUIT = /(?<![\p{L}])cui[lt](?![\p{L}])[^\d]{0,6}\d{2}-?\d{8}-?\d(?!\d)/u;
const RE_DOMICILIO = palabras(L.DOMICILIO);

export const reglaDocumento: Regla<unknown> = {
  id: "datos.documento",
  version: 1,
  evaluar: (p) => (RE_DNI.test(p.base) || RE_CUIT.test(p.base) ? disparo("retener", "Posibles datos personales.") : null),
};

export const reglaDomicilio: Regla<unknown> = {
  id: "datos.domicilio",
  version: 1,
  evaluar: (p) => {
    for (const x of posiciones(RE_DOMICILIO, p.base)) {
      if (/\d{2,5}/.test(p.base.slice(x, x + L.VENTANA_DOMICILIO))) return disparo("retener", "Posibles datos personales.");
    }
    return null;
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

export const reglaPerfil: Regla<unknown> = {
  id: "perfil.derivacion",
  version: 1,
  evaluar: (p) => (RE_PERFIL.test(p.base) ? disparo("retener", "Deriva al perfil.") : null),
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
  reglaFormatoResena, reglaTelefono, reglaCorreo, reglaEnlace, reglaRed,
  reglaContactoPartido, reglaSpam, reglaOdio, reglaAmenaza, reglaDocumento,
  reglaDomicilio, reglaMenores, reglaMayusculas, reglaVocabulario,
  reglaRepeticion, reglaPerfil,
];

/**
 * Nombres (2–24): formato, contacto y odio. Sin las de texto anómalo, que
 * están pensadas para reseñas de 80–600 (revisión §3.1).
 */
export const REGLAS_NOMBRE: readonly Regla<unknown>[] = [
  reglaFormatoNombre, reglaTelefonoNombre, reglaCorreo, reglaEnlace, reglaRedNombre, reglaOdio,
];
