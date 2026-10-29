// Generador determinista del contrato de moderación v1 (catálogo v3.2, §8).
// NO promete cobertura semántica: recorre las transformaciones declaradas.
// v2 (auditoría de bbb8fc7, A4): inventario completo y verificado por
// `generador-inventario.test.ts` contra el contrato y las referencias.
//
// QUÉ ENUMERA (completo):
//   - D2: los 77 tramos de 10 dígitos `Nd` de Unicode 18.0.0;
//   - D3–D6: ancho completo, matemáticos, superíndices, SUBÍNDICES,
//     circulados y emoji de tecla;
//   - D7: cada palabra-número de 0 a 15 dentro de una corrida y cada forma de
//     16 a 99 (incluidas "diez y seis…" y "veinte y …"); D8: cada palabra en
//     inglés de §6.N; y palabras pegadas a dígitos;
//   - D9: cada confusable de dígito de la tabla, contando PUNTOS DE CÓDIGO
//     (incluye los astrales);
//   - S: cada carácter de Zs, Pd, Ps, Pe y Me según Unicode 18.0.0 (no el
//     runtime), más U+FE0F, `/` y `_`;
//   - F2: cada proveedor con "en/de/del", y las formas de arroba y punto;
//   - F3: cada T-fuerte en F3-2, F3-5 y F3-6, cada inicio de ruta de F3-3,
//     cada punto y barra de F3-4 y cada acortador;
//   - F4: cada forma de alias × cada plataforma de §6.M (salvo "x") y cada
//     forma de intención de §6.I;
//   - S1–S5, H1–H3: cada entrada de sus listas de §6;
//   - controles legítimos con la MISMA transformación (años con el mismo
//     separador) y plantillas narrativas redactadas (marcadas `plantilla`).
// QUÉ MUESTREA (semilla fija, mulberry32):
//   - S: 64 caracteres de Po (sin `,;:`), 64 de Sm y 64 de Mn, de Unicode 18.0.0;
//   - F3-4: 50 terminaciones alfabéticas de 7 a 63 letras;
//   - C: 200 confusables de letra de TODA la clase de UTS #39 (letras L*),
//     cada uno dentro de una terminación T-fuerte o de un proveedor que
//     contiene su letra (si ninguno la contiene, en una terminación con ruta).
// COMBINACIONES: cada dimensión completa con las demás en su forma base y,
// por familia, el producto de representantes de cada dimensión (cubre todos
// los pares): F1 forma × separador por categoría × señal; F2 arroba × punto ×
// confusable; F3 punto × terminación × barra; F4 alias × plataforma o
// intención × comillas; H1 pronombre × daño × puntuación o salto. No el
// producto cartesiano completo. Un acierto en una muestra no prueba la clase.

import type { Familia } from "./familias.ts";
import * as L from "./listas.ts";
import { CONFUSABLES_DIGITO, CONFUSABLES_LETRA_UTS39, RANGOS_CATEGORIA, RANGOS_ND } from "./tablas-unicode.ts";
import type { ContextoResena } from "./tipos.ts";

export const VERSION_GENERADOR = "2";
export const SEMILLA = 20261024;

export interface CasoGenerado {
  id: string;
  tipo: "resena" | "nombre";
  /** Familia que el caso prueba; `null` en los controles legítimos. */
  familia: Familia | null;
  esperado: "rechazar" | "retener" | "publicar";
  dimension: string;
  texto: string;
  contexto?: ContextoResena;
  /** Sale de una muestra (no de una enumeración completa). */
  muestreado: boolean;
  /** Control narrativo redactado a mano (no generado por transformación). */
  plantilla: boolean;
}

/** PRNG determinista. */
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function muestra<T>(lista: readonly T[], n: number, azar: () => number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}

const PREFIJO = "La película tiene buenos actores y una historia que mantiene el interés hasta el final. ";
const NUMERO = "1144556677";
const GRUPOS = ["11", "4455", "6677"];

const caracteres = (rangos: readonly (readonly [number, number])[]) => rangos.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)));

/**
 * v2 (auditoría de bbb8fc7, A4): los caracteres de una categoría de S según
 * Unicode 18.0.0 (`RANGOS_CATEGORIA`), sin reclasificar con el runtime. Po sin
 * `,` `;` `:` (que son S2).
 */
export function separadoresDe(categoria: keyof typeof RANGOS_CATEGORIA): string[] {
  return caracteres(RANGOS_CATEGORIA[categoria]).filter((c) => !(categoria === "Po" && /^[,;:]$/.test(c)));
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
/** §6.N: castellano 0–15 (sólo en corridas). */
export const PALABRAS_0_15 = ["cero", "uno", "una", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince"];
const UNIDADES_ES = ["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
/** §6.N: castellano 16–99, cada forma (incluidas "diez y seis…" y "veinte y …"). */
export const PALABRAS_16_99 = [
  "dieciséis", "diecisiete", "dieciocho", "diecinueve", "diez y seis", "diez y siete", "diez y ocho", "diez y nueve",
  "veinte", "veintiuno", "veintiún", "veintiuna", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
  ...UNIDADES_ES.map((u) => `veinte y ${u}`),
  ...["treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"].flatMap((d) => [d, ...UNIDADES_ES.map((u) => `${d} y ${u}`)]),
];
/** C: tamaño de la muestra de confusables de letra (catálogo §8). */
export const MUESTRA_C = 200;
/** Muestras de S por categoría grande (catálogo §8). */
export const MUESTRA_S = 64;

export function generar(semilla = SEMILLA): CasoGenerado[] {
  const azar = mulberry32(semilla);
  const casos: CasoGenerado[] = [];
  let n = 0;
  const agregar = (c: Omit<CasoGenerado, "id" | "muestreado" | "plantilla"> & Partial<Pick<CasoGenerado, "muestreado" | "plantilla">>) =>
    casos.push({ id: `G-${String(++n).padStart(5, "0")}`, muestreado: false, plantilla: false, ...c });
  const resena = (t: string) => PREFIJO + t;

  // ---------------------------------------------------------------- F1
  const telefono = (num: string, dimension: string, muestreado = false) => {
    agregar({ tipo: "resena", familia: "F1", esperado: "rechazar", dimension, texto: resena(`Llamame al ${num} para comentar.`), muestreado });
  };
  // D2: cada rango Nd (bloques de 10 empezando en el cero).
  for (const [a, b] of RANGOS_ND) {
    for (let inicio = a; inicio + 9 <= b; inicio += 10) {
      telefono([...NUMERO].map((d) => String.fromCodePoint(inicio + Number(d))).join(""), `D2:${inicio.toString(16)}`);
    }
  }
  telefono([...NUMERO].map((d) => String.fromCodePoint(0xff10 + Number(d))).join(""), "D3:ancho");
  telefono([...NUMERO].map((d) => String.fromCodePoint(0x1d7ce + Number(d))).join(""), "D3:matematico");
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  telefono([...NUMERO].map((d) => SUP[Number(d)]).join(""), "D4:superindice");
  telefono([...NUMERO].map((d) => SUB[Number(d)]).join(""), "D4:subindice");
  const CIRC = "⓪①②③④⑤⑥⑦⑧⑨";
  telefono([...NUMERO].map((d) => CIRC[Number(d)]).join(" "), "D5:circulado");
  telefono([...NUMERO].map((d) => `${d}️⃣`).join(""), "D6:tecla");
  const ES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  telefono([...NUMERO].map((d) => ES[Number(d)]).join(" "), "D7:castellano");
  telefono([...NUMERO].map((d) => EN[Number(d)]).join(" "), "D8:ingles");
  telefono([...NUMERO].map((d, i) => (i % 2 ? d : ES[Number(d)])).join(""), "D7:pegadas");
  // D7 (§6.N): cada palabra-número de 0 a 15 dentro de una corrida, y cada forma de 16 a 99.
  for (const w of PALABRAS_0_15) telefono(`once ${w} cuatro cuatro cinco cinco seis seis`, `D7:corrida:${w}`);
  for (const w of PALABRAS_16_99) telefono(`once ${w} cuatro cuatro cinco cinco seis seis`, `D7:compuesto:${w}`);
  // D8 (§6.N): cada palabra-número en inglés dentro de una corrida.
  for (const w of Object.keys(L.PALABRAS_NUMERO_EN)) telefono(`one one ${w} four four five five six six`, `D8:corrida:${w}`);
  // D9: cada confusable de dígito (por PUNTO DE CÓDIGO: incluye los astrales), en la segunda posición.
  for (const [c, d] of Object.entries(CONFUSABLES_DIGITO)) {
    if ([...c].length !== 1 || /\s/u.test(c)) continue;
    telefono(`${NUMERO[0]}${c}${NUMERO.slice(2)}`, `D9:${c.codePointAt(0)!.toString(16)}:${d}`);
  }
  // S: categorías de Unicode 18.0.0 (tablas-unicode.ts), no las del runtime.
  // Enumerados: Zs, Pd, Ps, Pe, Me, U+FE0F, "/" y "_". Muestreados: 64 de Po, Sm y Mn.
  const enumerados = [...separadoresDe("Zs"), ...separadoresDe("Pd"), ...separadoresDe("Ps"), ...separadoresDe("Pe"), ...separadoresDe("Me"), "️", "/", "_"];
  const muestreados = [...muestra(separadoresDe("Po"), MUESTRA_S, azar), ...muestra(separadoresDe("Sm"), MUESTRA_S, azar), ...muestra(separadoresDe("Mn"), MUESTRA_S, azar)];
  for (const [sep, mu] of [...enumerados.map((s) => [s, false] as const), ...muestreados.map((s) => [s, true] as const)]) {
    telefono(GRUPOS.join(sep), `S:${sep.codePointAt(0)!.toString(16)}`, mu);
    agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: `S-control:${sep.codePointAt(0)!.toString(16)}`, texto: resena(`La vi en ${["1985", "2026"].join(sep)} y me gustó.`), muestreado: mu });
  }
  // Pares de F1 (catálogo §8): forma de dígito × separador (un representante por
  // categoría de S) × señal, con TODOS los representantes de cada dimensión:
  // el producto de representantes cubre todos los pares.
  const FORMAS_F1: Record<string, (s: string) => string> = {
    ascii: (s) => s,
    ancho: (s) => [...s].map((d) => String.fromCodePoint(0xff10 + Number(d))).join(""),
    arabigo: (s) => [...s].map((d) => String.fromCodePoint(0x660 + Number(d))).join(""),
    tecla: (s) => [...s].map((d) => `${d}️⃣`).join(""),
    confusable: (s) => s.replace(/3/g, "З").replace(/0/g, "О"),
  };
  const REPRESENTANTES_S: Record<string, string> = {
    Zs: " ", Pd: "-", Ps: "(", Pe: ")", Po: "·", Sm: "+", Mn: "́", Me: "⃝", barra: "/", guion_bajo: "_",
  };
  const SENALES_F1: Record<string, (num: string) => string> = {
    sin_senal: (num) => `Dejo esto acá: ${num}, sin más.`,
    intencion: (num) => `Llamame al ${num} para comentar.`,
    medio: (num) => `Mi celu es ${num} por si acaso.`,
  };
  for (const [forma, f] of Object.entries(FORMAS_F1)) {
    for (const [cat, sep] of Object.entries(REPRESENTANTES_S)) {
      for (const [senal, s] of Object.entries(SENALES_F1)) {
        agregar({ tipo: "resena", familia: "F1", esperado: "rechazar", dimension: `par-F1:${forma}:${cat}:${senal}`, texto: resena(s(["11", "4435", "6607"].map(f).join(sep))) });
      }
    }
  }
  // Fecha y año con intención o medio en el ámbito; y sus controles sin I ni M.
  telefono("11/04/1988", "F1:fecha+I");
  agregar({ tipo: "resena", familia: "F1", esperado: "rechazar", dimension: "F1:importe+M", texto: resena("Mi celu es $1.144.556.677 jaja, sin el signo.") });
  agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "F1-control:importe", texto: resena("Recaudó $1.144.556.677 en todo el mundo, un récord.") });
  agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "F1-control:fecha", texto: resena("Se estrenó el 11/04/1988 y sigue vigente.") });
  agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "F1-control:puntajes", texto: resena("Puntajes: 8/10 9/10 7.5/10 para guion, música y fotografía.") });

  // ---------------------------------------------------------------- F2
  for (const prov of L.PROVEEDORES_CORREO) {
    for (const prep of ["en", "de", "del"]) {
      agregar({ tipo: "resena", familia: "F2", esperado: "rechazar", dimension: `F2:${prep}:${prov}`, texto: resena(`Escribile a cine_fan99 ${prep} ${prov} y te contesto.`) });
    }
  }
  for (const [arroba, punto] of [["@", "."], ["arroba", "punto"], ["(at)", "(dot)"], ["[at]", "[punto]"]]) {
    agregar({ tipo: "resena", familia: "F2", esperado: "rechazar", dimension: `F2:${arroba}:${punto}`, texto: resena(`Escribime a ana.demo ${arroba} gmail ${punto} com para charlar.`) });
  }
  agregar({ tipo: "resena", familia: "F2", esperado: "rechazar", dimension: "F2:espaciado", texto: resena("Mail: a n a @ g m a i l . c o m y charlamos.") });
  agregar({ tipo: "resena", familia: "F2", esperado: "rechazar", dimension: "F2:mi-usuario-de", texto: resena("Pedime la lista a nachito.cine, que es mi usuario de Gmail.") });
  agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "F2-control", texto: resena("El mail de su jefe en Gmail desata toda la trama."), plantilla: true });

  // ---------------------------------------------------------------- F3
  for (const t of L.TLD_FUERTES) {
    agregar({ tipo: "resena", familia: "F3", esperado: "rechazar", dimension: `F3-2:${t}`, texto: resena(`Mirala en verpelis.${t} sin cortes.`) });
    agregar({ tipo: "resena", familia: "F3", esperado: "rechazar", dimension: `F3-5:${t}`, texto: resena(`Mirala en verpelis punto ${t} sin cortes.`) });
    agregar({ tipo: "resena", familia: "F3", esperado: "rechazar", dimension: `F3-6:${t}`, texto: resena(`Mirala en verpelis,${t}/ver sin cortes.`) });
  }
  for (const inicio of ["x", "demo", "9", "_d", "-d", ".d", "?id=1", "=x", "&x", "%20", "#x", "/x"]) {
    agregar({ tipo: "resena", familia: "F3", esperado: "rechazar", dimension: `F3-3:${inicio}`, texto: resena(`Mirala en ejemplo.xy/${inicio} sin cortes.`) });
  }
  const letras = "abcdefghijklmnopqrstuvwxyz";
  const terminaciones = Array.from({ length: 50 }, () => {
    const largo = 7 + Math.floor(azar() * 57);
    return Array.from({ length: largo }, () => letras[Math.floor(azar() * 26)]).join("");
  });
  for (const [t, mu] of [...terminaciones.map((x) => [x, true] as const), ...L.TLD_FUERTES.filter((x) => !L.T_PALABRA.includes(x)).map((x) => [x, false] as const)]) {
    agregar({ tipo: "resena", familia: "F3", esperado: "rechazar", dimension: `F3-4:${t.length}`, texto: resena(`Mi análisis en lacinemateca . ${t} / analisis / final.`), muestreado: mu });
  }
  for (const [punto, barra] of [[" . ", " / "], [" punto ", " slash "], [" dot ", " barra "], ["[.]", "/"], ["-[punto]-", "/"]]) {
    agregar({ tipo: "resena", familia: "F3", esperado: "rechazar", dimension: `F3-4:${punto.trim()}:${barra.trim()}`, texto: resena(`Mi análisis en filmotecalibre${punto}argentina${barra}directores.`) });
  }
  for (const h of L.HOSTS_SIN_TLD) {
    agregar({ tipo: "resena", familia: "F3", esperado: "rechazar", dimension: `F3:acortador:${h}`, texto: resena(`Está en ${h}/abc123 completa.`) });
  }
  // C (catálogo §8): 200 confusables de letra de TODA la clase de UTS #39 (no
  // sólo los que imitan "o"). Cada uno reemplaza su letra dentro de una
  // terminación T-fuerte que la contiene (sin ruta: si el mapeo falla, no hay
  // otra regla que lo salve); si ninguna T-fuerte contiene esa letra, dentro
  // de la etiqueta de un correo con proveedor ("ana@gmail" no tiene esa
  // garantía, así que se usa el proveedor: el mapeo tiene que reconstruirlo).
  for (const c of muestra(Object.keys(CONFUSABLES_LETRA_UTS39), MUESTRA_C, azar)) {
    const v = CONFUSABLES_LETRA_UTS39[c];
    const tld = L.TLD_FUERTES.find((t) => t.includes(v));
    const prov = L.PROVEEDORES_CORREO.find((p) => p.includes(v));
    const cp = c.codePointAt(0)!.toString(16);
    if (tld) {
      agregar({ tipo: "resena", familia: "F3", esperado: "rechazar", dimension: `C:${cp}:tld`, texto: resena(`Mirala en verpelis.${tld.replace(v, c)} sin cortes.`), muestreado: true });
    } else if (prov) {
      agregar({ tipo: "resena", familia: "F2", esperado: "rechazar", dimension: `C:${cp}:proveedor`, texto: resena(`Escribime a ana.demo@${prov.replace(v, c)} y charlamos.`), muestreado: true });
    } else {
      agregar({ tipo: "resena", familia: "F3", esperado: "rechazar", dimension: `C:${cp}:sin-ancla`, texto: resena(`Mirala en verpelis.x${c}x/ver sin cortes.`), muestreado: true });
    }
  }
  for (const control of ["Cuenta la burbuja de las punto com con humor.", "Para chicos y/o grandes: un 8.5/10 merecido.", "Drama / comedia, muy bien hecha.", "Fin de la escena. / Sigue otra.", "Linda casa . final / feliz para todos."]) {
    agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "F3-control", texto: resena(control), plantilla: true });
  }

  // ---------------------------------------------------------------- F4
  const ALIAS = ["cine_fan99", "cine.fan", "88cine", "fede.cine#4821", "@ docu_sur", "l.u.n.a.r.o.s.a"];
  for (const a of ALIAS) {
    for (const plat of L.PLATAFORMAS_CONTRATO) {
      agregar({ tipo: "resena", familia: "F4", esperado: "rechazar", dimension: `F4:plat:${plat}`, texto: resena(`Hago videos en ${plat}, el usuario es ${a}, nos vemos.`) });
    }
  }
  for (const i of L.INTENCION.filter((x) => !L.PEDIDO_PRIVADO.includes(x))) {
    agregar({ tipo: "resena", familia: "F4", esperado: "rechazar", dimension: `F4:I:${i}`, texto: resena(`Para charlar del final, ${i}, soy cine_fan99 en todos lados.`) });
  }
  for (const control of ["La protagonista sigue en Instagram a su ex y eso desata todo.", "Busca a su hermana en TikTok durante media película."]) {
    agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "F4-control", texto: resena(control), plantilla: true });
  }

  // ---------------------------------------------------------------- S1–S5
  for (const m of L.PALABRAS_MEDIO) {
    agregar({ tipo: "resena", familia: "S1", esperado: "retener", dimension: `S1:${m}`, texto: resena(`Mi ${m} es el de siempre, escribime y charlamos.`) });
  }
  agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "S1-control", texto: resena("Mi celular se quedó sin batería en la mitad de la película."), plantilla: true });
  for (const frase of L.PEDIDO_PRIVADO) {
    agregar({ tipo: "resena", familia: "S2", esperado: "retener", dimension: `S2:${frase}`, texto: resena(`Si querés sumarte al grupo, pedime ${frase} que acá no se puede.`) });
  }
  agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "S2-control", texto: resena("En la serie, él le pide el dato por privado a la periodista."), plantilla: true });
  for (const v of [...L.REMISION, ...L.REMISION_TILDE]) {
    for (const id of L.IDENTIDAD_PERFIL) {
      agregar({ tipo: "resena", familia: "S3", esperado: "retener", dimension: `S3-b:${v}:${id}`, texto: resena(`Para más recomendaciones, ${v} mi ${id} de acá.`) });
    }
  }
  agregar({ tipo: "resena", familia: "S3", esperado: "retener", dimension: "S3-c", texto: resena("Mi apodo de acá es el mismo en todos lados: búsquenme así.") });
  for (const control of ["Fíjense en el nombre del personaje, es un guiño.", "Miren el perfil del villano: está muy bien escrito."]) {
    agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "S3-control", texto: resena(control), plantilla: true });
  }
  for (const marcador of ["en otra reseña", "lo termino", "empieza con", "arranca con"]) {
    agregar({
      tipo: "resena", familia: "S4", esperado: "retener", dimension: `S4:${marcador}`,
      texto: resena("Segunda parte: mi usuario termina con _ok, ya me pueden seguir."),
      contexto: { textosRecientes: [resena(`Subo videos de la serie, mi usuario ${marcador} lu.reacciona y sigue en otra reseña.`)] },
    });
  }
  for (const v of L.VENTA) {
    agregar({ tipo: "resena", familia: "S5", esperado: "retener", dimension: `S5:${v}`, texto: resena(`${v} combos de pelis, precio de amigo, consultas por acá.`) });
  }

  // ---------------------------------------------------------------- H1
  for (const d of L.H1_DIRECTAS) {
    agregar({ tipo: "resena", familia: "H1", esperado: "retener", dimension: `H1-a:${d}`, texto: resena(`Al que puso cinco estrellas: ${d}.`) });
  }
  for (const d of L.H1_DANO) {
    agregar({ tipo: "resena", familia: "H1", esperado: "retener", dimension: `H1-b:te:${d}`, texto: resena(`Vos, te voy a ${d} si te cruzo.`) });
    agregar({ tipo: "resena", familia: "H1", esperado: "retener", dimension: `H1-b:le:${d}`, texto: resena(`Le voy a ${d} a ese actor si lo veo.`) });
  }
  for (const d of L.H1_DESEO) {
    agregar({ tipo: "resena", familia: "H1", esperado: "retener", dimension: `H1-d:${d}`, texto: resena(`Al que escribió esa reseña: ${d}.`) });
  }
  for (const control of ["El villano le dice que lo va a matar y la tensión no baja.", "Me mató de risa la escena del casamiento.", "La protagonista la rompe en cada escena."]) {
    agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "H1-control", texto: resena(control), plantilla: true });
  }

  // ---------------------------------------------------------------- H2
  const plural = (g: string) => (/o$/.test(g) ? `${g.slice(0, -1)}os` : /a$/.test(g) ? `${g}s` : /[nrlzd]$/.test(g) ? `${g}es` : `${g}s`);
  for (const g of L.H2_GRUPOS) {
    agregar({ tipo: "resena", familia: "H2", esperado: "retener", dimension: `H2-a:${g}`, texto: resena(`Los ${plural(g)} son una plaga en esta película.`) });
  }
  for (const d of L.H2_DESHUMANIZACION) {
    agregar({ tipo: "resena", familia: "H2", esperado: "retener", dimension: `H2-b:${d}`, texto: resena(`Los inmigrantes ${d} y la serie los muestra.`) });
  }
  for (const v of L.H2_VERBOS_EXPULSION) {
    agregar({ tipo: "resena", familia: "H2", esperado: "retener", dimension: `H2-b:hay que ${v}`, texto: resena(`A los bolivianos habría que ${v}, como dice el villano.`) });
  }
  for (const i of L.H2_INSULTOS) {
    agregar({ tipo: "resena", familia: "H2", esperado: "retener", dimension: `H2-c:${i}`, texto: resena(`El director es un ${i} y se nota.`) });
  }
  for (const nombre of ["FueraBolitas", "MuerteALosPutos", "odio judios", "Negros de mierda", "Trolos_basura", "FueraSudacas"]) {
    agregar({ tipo: "nombre", familia: "H2", esperado: "retener", dimension: `H2-N:${nombre}`, texto: nombre });
  }
  agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "H2-control", texto: resena("La película retrata el racismo contra los bolivianos con mucho cuidado."), plantilla: true });

  // ---------------------------------------------------------------- H3
  for (const etiqueta of ["DNI", "D.N.I.", "documento", "doc."]) {
    agregar({ tipo: "resena", familia: "H3", esperado: "retener", dimension: `H3-a:${etiqueta}`, texto: resena(`El acomodador, ${etiqueta} 27.345.118, me echó de la sala.`) });
  }
  agregar({ tipo: "resena", familia: "H3", esperado: "retener", dimension: "H3-a:cuit", texto: resena("Ese crítico tiene CUIT 20-31987654-3, búsquenlo.") });
  // Un CUIT sin etiqueta tiene 11 dígitos: también es F1, y por la prioridad única se rechaza (caso mixto).
  agregar({ tipo: "resena", familia: "H3", esperado: "rechazar", dimension: "H3-a:cuit-sin-etiqueta(mixto F1)", texto: resena("Ese crítico es el 20-31987654-3, búsquenlo.") });
  agregar({ tipo: "resena", familia: "H3", esperado: "retener", dimension: "H3-a:dni-nombre", texto: resena("El que la critica es Tomás Abregú, 31.987.654, por si lo buscan.") });
  for (const via of L.H3_VIAS) {
    agregar({ tipo: "resena", familia: "H3", esperado: "retener", dimension: `H3-b:${via}`, texto: resena(`A Héctor Salvatierra lo encuentran en ${via} Supuesta 515 todas las tardes.`) });
  }
  agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "H3-control", texto: resena("En la película, Freddy Krueger ataca en la calle Elm 1428 de noche."), plantilla: true });
  agregar({ tipo: "resena", familia: null, esperado: "publicar", dimension: "H3-control", texto: resena("Recaudó 12.345.678 dólares, según Box Office Mojo."), plantilla: true });

  // ---------------------------------------------------------------- pares por familia (catálogo §8)
  // Producto de representantes de cada dimensión: cubre todos los pares.
  // F2: forma de arroba × forma de punto × confusable en el proveedor.
  for (const [arroba, an] of [["@", "@"], [" arroba ", "arroba"], [" (at) ", "(at)"], [" [at] ", "[at]"]]) {
    for (const [punto, pn] of [[".", "."], [" punto ", "punto"], [" (dot) ", "(dot)"], ["[punto]", "[punto]"]]) {
      for (const [prov, cn] of [["gmail", "latino"], ["gmаil", "cirilico"]]) {
        agregar({ tipo: "resena", familia: "F2", esperado: "rechazar", dimension: `par-F2:${an}:${pn}:${cn}`, texto: resena(`Escribime a ana.demo${arroba}${prov}${punto}com para charlar.`) });
      }
    }
  }
  // F3: punto (pegado, espaciado, escrito, corchetes, ideográfico) × terminación (T-fuerte, larga) × barra.
  const PUNTOS_F3: Record<string, string> = { pegado: ".", espaciado: " . ", escrito: " punto ", corchetes: "[.]", ideografico: "。" };
  const BARRAS_F3: Record<string, string> = { pegada: "/", espaciada: " / ", escrita: " slash " };
  for (const [pn, punto] of Object.entries(PUNTOS_F3)) {
    for (const [tn, t] of [["fuerte", "net"], ["larga", "photography"]]) {
      for (const [bn, barra] of Object.entries(BARRAS_F3)) {
        // F3-3 exige punto pegado Y barra pegada; con punto pegado y barra espaciada/escrita no hay forma prometida.
        const pegadoNoPrometido = (pn === "pegado" || pn === "ideografico") && bn !== "pegada" && tn === "larga";
        agregar({
          tipo: "resena", familia: pegadoNoPrometido ? null : "F3", esperado: pegadoNoPrometido ? "publicar" : "rechazar",
          dimension: `par-F3:${pn}:${tn}:${bn}`, texto: resena(`Mi análisis en lacinemateca${punto}${t}${barra}analisis completo.`),
        });
      }
    }
  }
  // F4: forma de alias × (plataforma o intención) × comillas.
  const ALIAS_F4: Record<string, string> = { guion_bajo: "cine_fan99", punto: "cine.fan", digitos: "88cine", etiqueta: "fede.cine#4821", arroba_espacio: "@ docu_sur", letras_sueltas: "l.u.n.a.r.o.s.a" };
  const OTRO_F4: Record<string, (a: string) => string> = {
    plataforma: (a) => `en TikTok el usuario es ${a}`,
    intencion: (a) => `escribime, soy ${a}`,
    voseo_tilde: (a) => `mandá un mensaje, soy ${a}`,
  };
  for (const [an, a] of Object.entries(ALIAS_F4)) {
    for (const [on, o] of Object.entries(OTRO_F4)) {
      for (const [cn, [abre, cierra]] of [["sin_comillas", ["", ""]], ["con_comillas", ["«", "»"]]] as const) {
        agregar({ tipo: "resena", familia: "F4", esperado: "rechazar", dimension: `par-F4:${an}:${on}:${cn}`, texto: resena(`Para charlar del final ${abre}${o(a)}${cierra} y listo.`) });
      }
    }
  }
  // H1: pronombre (con destinatario si hace falta) × daño representativo × puntuación o salto de línea antes de otra frase.
  const PRON_H1: Record<string, (d: string) => string> = {
    te: (d) => `Vos, te voy a ${d}`,
    le: (d) => `Le voy a ${d} a ese actor`,
    lo: (d) => `Al que escribió esa reseña lo voy a ${d}`,
    clitico: (d) => `Vos, voy a ${d.split(" ")[0]}te${d.includes(" ") ? d.slice(d.indexOf(" ")) : ""}`,
  };
  for (const [pn, pr] of Object.entries(PRON_H1)) {
    for (const d of ["matar", "pegar un tiro", "prender fuego", "hacer boleta"]) {
      for (const [sn, sep] of [["punto", ". "], ["salto", "\n"], ["coma", ", "]]) {
        agregar({ tipo: "resena", familia: "H1", esperado: "retener", dimension: `par-H1:${pn}:${d}:${sn}`, texto: resena(`${pr(d)}${sep}La rompe esta peli igual.`) });
      }
    }
  }

  return casos;
}
