// Barrido: que no quede NADA de DiceBear en código ejecutable ni en lo que se
// sirve al navegador.
//
// Se usa desde dos lados y por eso el escáner vive acá y no adentro del test:
//
//   node scripts/barrido-dicebear.mjs        → barrido completo, incluye .next
//   lib/sin-dicebear.test.ts                 → importa `barrer` y corre en `npm test`
//
// La diferencia es el bundle: `.next` sólo existe después de `npm run build`, y
// un test que dependa de eso falla en un checkout limpio. El test cubre fuente y
// archivos públicos; el script agrega los bundles generados.
//
// DOS CONJUNTOS DE PATRONES, no uno. Sobre la FUENTE se aplican los tres
// (`PROHIBIDO`); sobre los BUNDLES, sólo los dos que marcan una dependencia real
// (`PROHIBIDO_DEPENDENCIA`). El motivo está escrito abajo, en esa constante: el
// nombre del estilo viaja al navegador a propósito, porque es el valor que se
// guarda en la base.
//
// QUE SE EXCLUYE, Y POR QUE CADA COSA. Son TRES exclusiones y ninguna mira el
// contenido de una linea:
//
//   docs/                    la historia. Explica por que existe el mapeo legado;
//                            borrarla seria perder la unica razon escrita.
//   *.test.ts                los tests del mapeo legado NECESITAN las cadenas
//                            para probar que un perfil viejo resuelve bien. No se
//                            despachan al navegador.
//   este mismo archivo       define los patrones.
//
// NO se excluyen las lineas de comentario. Se intento dos veces y las dos
// tuvieron falsos negativos demostrados; el motivo esta escrito abajo, donde
// antes vivia esa funcion.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Lo que no puede aparecer EN LA FUENTE. */
export const PROHIBIDO = [/api\.dicebear\.com/i, /adventurer-neutral/i, /@dicebear\//i];

/**
 * Lo que no puede aparecer EN LOS BUNDLES, que es un subconjunto — y conviene
 * ser explícito sobre por qué son distintos.
 *
 * El contrato de persistencia hace que la cadena `adventurer-neutral` **viaje al
 * navegador**: es el valor que el selector escribe en la base, así que queda
 * inlineada en los chunks de `.next`. Medido en un build real: tres chunks la
 * traen y ninguno de los tres contiene `dicebear`.
 *
 * La allowlist de arriba no puede cubrir eso: es por archivo y línea exactos, y
 * un bundle minificado es una sola línea, en un archivo con nombre hasheado que
 * cambia en cada build.
 *
 * La salida NO es dejar de mirar los bundles —ahí es donde se comprueba qué se
 * despacha de verdad— sino mirar **lo que no puede estar ahí bajo ninguna
 * lectura**: la URL del generador y el paquete. Un nombre de estilo en un chunk
 * es un valor; `api.dicebear.com` en un chunk es una conexión saliente.
 *
 * **Sobre la fuente se siguen aplicando los tres.** Hay un test que lo fija, para
 * que este subconjunto no se filtre a donde no corresponde.
 */
export const PROHIBIDO_DEPENDENCIA = [/api\.dicebear\.com/i, /@dicebear\//i];

/**
 * LA ÚNICA EXCEPCIÓN, y es una allowlist textual de UNA línea.
 *
 * El contrato de persistencia guarda `avatar_style = "adventurer-neutral"` para
 * que un rollback muestre un avatar válido en vez de una imagen rota — el detalle
 * está en `lib/avatares.ts` (`ESTILO_PERSISTIDO`) y en `docs/AVATARES.md`. Esa
 * cadena es uno de los patrones de arriba, así que la línea que la declara tiene
 * que estar exceptuada explícitamente.
 *
 * DOS COSAS QUE **NO** SE HICIERON, porque las dos rompen el barrido:
 *
 *   · sacar `/adventurer-neutral/i` de PROHIBIDO — dejaría de detectar cualquier
 *     regreso del estilo viejo en cualquier lado;
 *   · armar la cadena por pedazos para que el barrido no la vea — eso es
 *     ofuscación: pasa el barrido sin que nadie se entere, que es exactamente lo
 *     contrario de lo que hace un guard.
 *
 * La forma es la misma que la del guard del SQL, y por el mismo motivo: **la
 * excepción es una línea exacta en un archivo exacto**. La misma línea en otro
 * archivo se reporta, y otra línea con la cadena en el archivo autorizado
 * también.
 *
 * `revisarAutorizadas` completa el guard: exige que la línea aparezca **una sola
 * vez**. Sin esa cuenta, duplicarla pasaría entera —las dos apariciones son
 * textualmente la autorizada— y habría dos fuentes de verdad del mismo valor.
 *
 * Los patrones que sí marcan una dependencia real (`api.dicebear.com`,
 * `@dicebear/`) NO tienen ninguna excepción y no la van a tener.
 */
export const AUTORIZADO = [
  {
    archivo: path.join("lib", "avatares.ts"),
    linea: 'export const ESTILO_PERSISTIDO = "adventurer-neutral";',
  },
];

/** Un solo espacio y sin bordes. NO baja a minúsculas: esto es JS, no SQL. */
export const normalizarLinea = (l) => l.replace(/\s+/g, " ").trim();

/** ¿Es esta línea, en este archivo, la excepción autorizada? */
const estaAutorizada = (relativo, linea) =>
  AUTORIZADO.some((a) => a.archivo === relativo && normalizarLinea(linea) === a.linea);

// `.sql` NO estaba, y ése fue un agujero real: el barrido decía revisar
// `supabase/` pero se saltaba todos los `.sql`, así que no vio que
// `supabase/schema.sql` seguía teniendo sentencias ACTIVAS que ponían
// `avatar_style = 'adventurer-neutral'`. Un barrido que no mira la extensión del
// archivo donde vive el problema no barre nada.
export const EXTENSIONES = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".html", ".sql",
]);

// Carpetas que nunca se miran: dependencias, git y la documentación histórica.
const SALTAR = new Set(["node_modules", ".git", "docs", "avatares"]);

// Los tests y el propio escáner quedan fuera; ver el encabezado.
const exento = (p) => /\.test\.(ts|tsx|mjs|js)$/.test(p) || p.endsWith("barrido-dicebear.mjs");

/**
 * NO HAY FUNCION QUE DECIDA SI UNA LINEA ES UN COMENTARIO. **Se inspecciona
 * todo el texto de los archivos incluidos**, y es una decision, no un descuido.
 *
 * POR QUE SE ABANDONO. Hubo dos criterios y los dos tuvieron falsos negativos
 * demostrados. El primero eximia toda linea que empezara con `//`, `*`, `/*` o
 * `--`, y se comia el selector universal de CSS y las propiedades
 * personalizadas. El segundo acoto la exencion por lenguaje, y aun asi dejaba
 * pasar dos casos reales:
 *
 *     * generator() { return "…/svg"; }        un metodo generador
 *
 *     const plantilla = `
 *     [una linea que arranca con la apertura de bloque]
 *     `;                                       contenido de una plantilla
 *
 * Decidir si una linea es comentario mirandola sola, sin analizar el archivo,
 * **no se puede**: la misma secuencia de caracteres es comentario o codigo segun
 * el contexto de arriba. Es la misma conclusion a la que llego el guard del SQL
 * despues de dos parsers, y por el mismo motivo.
 *
 * EL PRECIO, dicho de frente: un comentario legitimo que mencione una de las
 * cadenas rompe el barrido. Se paga reformulandolo — habia cinco en el codigo y
 * en el SQL, y se reescribieron. Queda una sola aparicion autorizada en todo el
 * codigo ejecutable, la de `AUTORIZADO`. Un comentario nuevo que la mencione es
 * un test en rojo, no un falso verde.
 */

function* archivos(dir) {
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    if (SALTAR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* archivos(p);
    else if (EXTENSIONES.has(path.extname(e.name)) && !exento(p)) yield p;
  }
}

/**
 * Recorre las raíces y devuelve los hallazgos: `{ archivo, linea, texto }`.
 * Vacío = limpio.
 *
 * `patrones` es explícito para poder barrer los bundles con el subconjunto de
 * dependencia (ver `PROHIBIDO_DEPENDENCIA`). El default es el conjunto completo,
 * así que un llamador que no sepa de esto revisa de más, nunca de menos.
 */
export function barrer(raices, base = process.cwd(), patrones = PROHIBIDO) {
  const hallazgos = [];
  for (const raiz of raices) {
    const abs = path.isAbsolute(raiz) ? raiz : path.join(base, raiz);
    // Una raíz puede ser un archivo suelto (public/sw.js).
    const lista = fs.existsSync(abs) && fs.statSync(abs).isFile()
      ? (exento(abs) ? [] : [abs])
      : [...archivos(abs)];
    for (const f of lista) {
      const relativo = path.relative(base, f);
      const lineas = fs.readFileSync(f, "utf8").split(/\r?\n/);
      lineas.forEach((linea, i) => {
        if (estaAutorizada(relativo, linea)) return;
        if (patrones.some((re) => re.test(linea))) {
          hallazgos.push({ archivo: relativo, linea: i + 1, texto: linea.trim().slice(0, 120) });
        }
      });
    }
  }
  return hallazgos;
}

/**
 * La otra mitad del guard de la allowlist: cada línea autorizada tiene que
 * aparecer **exactamente una vez** en su archivo.
 *
 * `barrer` no puede hacer esta cuenta: salta las apariciones autorizadas una por
 * una, así que dos copias idénticas le parecen las dos legítimas. Devuelve los
 * problemas, o `[]`.
 */
export function revisarAutorizadas(base = process.cwd()) {
  const problemas = [];
  for (const { archivo, linea } of AUTORIZADO) {
    let contenido;
    try { contenido = fs.readFileSync(path.join(base, archivo), "utf8"); } catch { contenido = ""; }
    const n = contenido
      .split(/\r?\n/)
      .filter((l) => normalizarLinea(l) === linea).length;
    if (n === 1) continue;
    problemas.push(n === 0
      ? `${archivo}: no aparece la línea autorizada — ${linea}`
      : `${archivo}: la línea autorizada aparece ${n} veces, tiene que aparecer una — ${linea}`);
  }
  return problemas;
}

/**
 * MANIFIESTOS Y LOCKS de dependencias, nombrados por ARCHIVO y nunca por
 * directorio.
 *
 * Un `@dicebear/core` agregado a `package.json` es la forma más directa de que
 * DiceBear vuelva, y el barrido no lo veía: `.json` estaba en `EXTENSIONES`,
 * pero ninguna raíz llegaba a la raíz del repositorio.
 *
 * **No se recorre la raíz entera**, y no es una cuestión de eficiencia: ahí viven
 * los cuatro archivos ajenos a esta rama (`avatares/`, los dos `prompts/` y una
 * migración sin registrar). Se nombran los archivos, uno por uno.
 *
 * Los locks alternativos se listan aunque hoy no existan —`barrer` ignora lo que
 * no está—: si mañana el proyecto cambia de gestor de paquetes, el agujero no se
 * reabre solo.
 */
export const MANIFIESTOS = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

/** Fuente, archivos públicos y manifiestos. Existen siempre, así que el test los usa. */
export const RAICES_FUENTE = [
  "lib", "components", "app", "hooks", "scripts", "supabase", "public",
  ...MANIFIESTOS,
];

/**
 * Los bundles generados. Sólo existen después de `npm run build`, y se barren
 * con `PROHIBIDO_DEPENDENCIA`, no con el conjunto completo.
 */
export const RAICES_BUNDLE = [".next/static", ".next/server"];

// --- CLI ---------------------------------------------------------------------
// Detectar "me ejecutaron directamente" vs "me importaron desde el test".
//
// La versión anterior comparaba `import.meta.url` contra el nombre de archivo de
// `process.argv[1]` a mano, y NUNCA daba true: el CLI no corría, así que el
// comando salía con 0 sin haber barrido nada. Un `exit=0` que no ejecuta nada se
// lee igual que un `exit=0` limpio, y ésa es la peor forma de fallar.
//
// `pathToFileURL` es la comparación correcta: resuelve el path a la MISMA forma
// de URL que trae `import.meta.url`, con el mismo escapado.
const esCli = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esCli) {
  const hayBuild = fs.existsSync(path.join(process.cwd(), ".next"));
  console.log(
    `Barriendo ${RAICES_FUENTE.length} raíces de fuente`
    + (hayBuild
      ? ` + ${RAICES_BUNDLE.length} de bundles de .next (ahí sólo los patrones de dependencia)…`
      : " (sin .next: no hay build)…"),
  );
  const hallazgos = [
    ...barrer(RAICES_FUENTE),
    ...(hayBuild ? barrer(RAICES_BUNDLE, process.cwd(), PROHIBIDO_DEPENDENCIA) : []),
  ];
  // La cuenta de la allowlist va SIEMPRE, aunque el barrido venga limpio: es
  // justamente lo que el barrido no puede ver.
  const duplicadas = revisarAutorizadas();
  if (!hallazgos.length && !duplicadas.length) {
    console.log("LIMPIO: cero rastros de DiceBear en código ejecutable ni en archivos servidos.");
  } else {
    if (hallazgos.length) console.error(`ENCONTRADOS ${hallazgos.length} rastros:`);
    for (const h of hallazgos) console.error(`  ${h.archivo}:${h.linea}  ${h.texto}`);
    if (duplicadas.length) console.error("La excepción autorizada no está bien:");
    for (const d of duplicadas) console.error(`  ${d}`);
    // `exitCode` y no `exit()`: en Windows, salir con stdout en vuelo tumba a
    // libuv y el proceso muere con 127 en vez de comunicar el fallo.
    process.exitCode = 1;
  }
}
