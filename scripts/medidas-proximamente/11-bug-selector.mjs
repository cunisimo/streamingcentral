// Reproduccion del bug del selector: simula el orden de efectos de React sobre
// la maquina de estados EXACTA de UpcomingAllView.tsx (lineas 59-84).
//
// Reglas de React que se respetan:
//  - los efectos corren en orden de declaracion
//  - un efecto solo re-corre si cambio alguna de sus dependencias
//  - los refs no disparan renders

function correr(escenario, { snapshotFiltro }) {
  const log = [];
  const S = {
    filtro: "all",
    fase: "decidiendo",
    inicial: null,
    restaurado: false,          // useRef(false)
    filtroPrevio: null,         // useRef<Filtro|null>(null)
    itemsDe: null,              // que filtro produjo los items en pantalla
    cargas: [],
  };
  const load = (f) => { S.itemsDe = f; S.cargas.push(f); log.push(`      load(${f}) -> la grilla pasa a mostrar "${f}"`); };

  // deps anteriores de cada efecto
  let depsE1 = null;  // [fase, inicial]
  let depsE2 = null;  // [filtro, load]  (load es estable: useCallback([]))

  const render = (etiqueta) => {
    log.push(`  --- render: ${etiqueta} (filtro=${S.filtro}, fase=${S.fase}) ---`);
    // EFECTO 1: restauracion  (linea 60)
    const d1 = `${S.fase}|${S.inicial ? "snap" : "null"}`;
    if (d1 !== depsE1) {
      depsE1 = d1;
      log.push(`    E1 corre`);
      if (S.fase !== "listo" || S.restaurado) { log.push(`      E1 sale: fase=${S.fase} restaurado=${S.restaurado}`); }
      else {
        S.restaurado = true;
        if (S.inicial) {
          log.push(`      E1 restaura items y setFiltro("${S.inicial.filtro}")`);
          S.itemsDe = S.inicial.filtro; S.filtro = S.inicial.filtro;
        } else { load(S.filtro); }
      }
    } else log.push(`    E1 NO corre (deps iguales)`);

    // EFECTO 2: cambio de filtro  (linea 76)
    const d2 = `${S.filtro}`;
    if (d2 !== depsE2) {
      depsE2 = d2;
      log.push(`    E2 corre`);
      if (!S.restaurado) log.push(`      E2 sale: restaurado=false  ==> filtroPrevio SIGUE en null`);
      else if (S.filtroPrevio === null) {
        S.filtroPrevio = S.filtro;
        log.push(`      🔴 E2 ve filtroPrevio=null -> lo pone en "${S.filtro}" y SALE SIN CARGAR`);
      } else if (S.filtroPrevio === S.filtro) log.push(`      E2 sale: mismo filtro`);
      else { S.filtroPrevio = S.filtro; load(S.filtro); }
    } else log.push(`    E2 NO corre (deps iguales)`);
  };

  log.push(`\n=========== ${escenario} ===========`);
  render("montaje");
  // useEstadoSimple decide en su propio efecto de montaje
  S.fase = "listo";
  if (snapshotFiltro) S.inicial = { filtro: snapshotFiltro };
  render("fase pasa a listo");
  if (S.filtro !== "all") render("re-render por el setFiltro de la restauracion");

  log.push(`\n  >>> el usuario TOCA "Peliculas"`);
  S.filtro = "movie";
  render("click en Peliculas");
  const bien = S.itemsDe === "movie";
  log.push(`\n  RESULTADO: boton activo = "movie" | la grilla muestra = "${S.itemsDe}"  ${bien ? "✅ correcto" : "❌ BUG: sigue mostrando " + S.itemsDe}`);
  if (!bien) {
    log.push(`  >>> el usuario TOCA "Series" y despues "Peliculas" otra vez`);
    S.filtro = "tv"; render("click en Series");
    S.filtro = "movie"; render("click en Peliculas (2da vez)");
    log.push(`  RESULTADO tras el rodeo: la grilla muestra = "${S.itemsDe}"  ${S.itemsDe === "movie" ? "✅ ahora si" : "❌"}`);
  }
  return { log, bien };
}

const a = correr("A. entrada directa, SIN snapshot", { snapshotFiltro: null });
console.log(a.log.join("\n"));
const b = correr('B. vuelta de una ficha, snapshot con filtro "all"', { snapshotFiltro: "all" });
console.log(b.log.join("\n"));
const c = correr('C. vuelta de una ficha, snapshot con filtro "tv"', { snapshotFiltro: "tv" });
console.log(c.log.join("\n"));

console.log("\n\n================ VEREDICTO ================");
console.log(`A. entrada directa (sin snapshot):        ${a.bien ? "ok" : "🔴 BUG"}`);
console.log(`B. vuelta con snapshot filtro="all":     ${b.bien ? "ok" : "🔴 BUG"}`);
console.log(`C. vuelta con snapshot filtro="tv":      ${c.bien ? "ok" : "🔴 BUG"}`);
