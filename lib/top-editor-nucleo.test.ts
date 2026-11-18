// El editor del Top: reglas del ranking, el sincronizador de guardado y el
// cableado del servidor. Ver lib/top-editor-nucleo.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PUESTOS, SincronizadorTop, aplicarOp, claveTitulo, cuerpoDe, entradasDeOrden, moverEnCasilleros,
  originalDistinto, posterTam, primerLibre, puestoDe, validarNuevoOrden, type OpTop, type RankingFila,
} from "./top-editor-nucleo.ts";
import { posicionesDeReordenar, validarBloque, type EntradaTop } from "./top-manual-nucleo.ts";
import { BancoTop, datosIniciales } from "./banco-top.ts";
import { bancoTopHabilitado } from "./top-revision-local.ts";
import { excluidaDeApp } from "../scripts/build-capacitor.mjs";

const e = (posicion: number, id: number, titulo = `T${id}`): EntradaTop => ({ posicion, tipo: "movie", tmdb_id: id, titulo });
const diez = (): EntradaTop[] => Array.from({ length: 10 }, (_, i) => e(i + 1, 100 + i, `P${i + 1}`));
const ids = (xs: EntradaTop[]) => [...xs].sort((a, b) => a.posicion - b.posicion).map((x) => x.tmdb_id);
const bloque = (entradas: EntradaTop[], extra: Partial<RankingFila> = {}): RankingFila => ({
  id: "b1", plataforma: "n", tipo: "movie", estado: "borrador", captured_at: "2026-11-18", revisado: false, entradas, ...extra,
});

// --- Reglas del ranking ---------------------------------------------------------

test("mover del puesto 8 al 2: los intermedios se corren y se renumera 1..10", () => {
  const r = moverEnCasilleros(diez(), 8, 2);
  assert.deepEqual(ids(r), [100, 107, 101, 102, 103, 104, 105, 106, 108, 109]);
  assert.deepEqual(r.map((x) => x.posicion), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(validarBloque(r).length, 0, "sigue siendo un bloque válido");
});

test("con el bloque completo es exactamente el reordenamiento de siempre (los 100 pares)", () => {
  for (let d = 1; d <= 10; d++) for (let h = 1; h <= 10; h++) {
    assert.deepEqual(moverEnCasilleros(diez(), d, h), posicionesDeReordenar(diez(), d, h), `${d}→${h}`);
  }
});

test("con el bloque incompleto no compacta ni mueve títulos fuera del tramo", () => {
  const base = [e(1, 1), e(2, 2), e(5, 5), e(7, 7)];
  // 7 → 2: el 2 y el 5 se corren un lugar; el 1 no se toca; los libres se corren igual.
  const r = moverEnCasilleros(base, 7, 2);
  assert.deepEqual(r.map((x) => [x.posicion, x.tmdb_id]), [[1, 1], [2, 7], [3, 2], [6, 5]]);
  // 1 → 9 sobre libres: pasa al 9 y el resto sube uno.
  assert.deepEqual(moverEnCasilleros(base, 1, 9).map((x) => [x.posicion, x.tmdb_id]), [[1, 2], [4, 5], [6, 7], [9, 1]]);
});

test("gestos fallidos devuelven las posiciones intactas", () => {
  const base = [e(1, 1), e(3, 3)];
  for (const [d, h] of [[2, 1], [1, 1], [0, 3], [1, 11], [1.5, 2]]) {
    assert.deepEqual(moverEnCasilleros(base, d, h), base, `${d}→${h}`);
  }
});

test("primer puesto libre y puesto de un título", () => {
  assert.equal(primerLibre([e(1, 1), e(2, 2), e(4, 4)]), 3);
  assert.equal(primerLibre([]), 1);
  assert.equal(primerLibre(diez()), null);
  assert.equal(puestoDe(diez(), "movie", 107), 8);
  assert.equal(puestoDe(diez(), "tv", 107), null, "la clave es tipo:id, no el id solo");
});

test("el servidor sólo acepta una PERMUTACIÓN de lo que hay en la base", () => {
  const actuales = diez();
  assert.equal(validarNuevoOrden(actuales, moverEnCasilleros(actuales, 8, 2)), null);
  // Falta un título (cliente viejo): se rechaza en vez de borrarlo.
  assert.match(validarNuevoOrden(actuales, actuales.slice(0, 9))!, /cambió/);
  // Uno de más o distinto.
  assert.match(validarNuevoOrden(actuales.slice(0, 9), actuales)!, /cambió/);
  assert.match(validarNuevoOrden(actuales, [...actuales.slice(0, 9), e(10, 999)])!, /cambió/);
  // Repetidos y fuera de rango.
  assert.match(validarNuevoOrden(actuales, [...actuales.slice(0, 9), e(10, 100)])!, /repetido/);
  assert.match(validarNuevoOrden(actuales, actuales.map((x) => (x.posicion === 10 ? { ...x, posicion: 1 } : x)))!, /mismo puesto/);
  assert.match(validarNuevoOrden(actuales, actuales.map((x) => (x.posicion === 10 ? { ...x, posicion: 11 } : x)))!, /fuera/);
});

test("reordenar escribe los títulos de la BASE, no los del pedido", () => {
  const actuales = [e(1, 1, "Real uno"), e(2, 2, "Real dos")];
  const r = entradasDeOrden(actuales, [{ ...e(1, 2), titulo: "trucho" }, { ...e(2, 1), titulo: "" }]);
  assert.deepEqual(r.map((x) => [x.posicion, x.titulo]), [[1, "Real dos"], [2, "Real uno"]]);
  assert.ok(!("titulo" in (cuerpoDe({ k: "ordenar", id: "b", entradas: actuales }).entradas as object[])[0]),
    "el cuerpo del orden no manda títulos");
});

test("cualquier cambio de contenido o fecha quita la aprobación; aprobar no toca el contenido", () => {
  const b = [bloque(diez(), { revisado: true })];
  const ops: OpTop[] = [
    { k: "ordenar", id: "b1", entradas: moverEnCasilleros(diez(), 3, 1) },
    { k: "reemplazar", id: "b1", entrada: e(10, 500), reemplaza: { tipo: "movie", tmdb_id: 109 } },
    { k: "fecha", id: "b1", fecha: "2026-11-20" },
    { k: "restaurar", id: "b1" },
  ];
  for (const op of ops) assert.equal(aplicarOp(b, op)[0].revisado, false, op.k);
  const ap = aplicarOp([bloque(diez())], { k: "revisar", id: "b1", revisado: true })[0];
  assert.equal(ap.revisado, true);
  assert.deepEqual(ap.entradas, diez());
});

test("título original: sólo cuando difiere de verdad", () => {
  assert.equal(originalDistinto("Drácula", "Dracula"), false, "acentos y mayúsculas no cuentan");
  assert.equal(originalDistinto("Drácula de Bram Stoker", "Bram Stoker's Dracula"), true);
  assert.equal(originalDistinto("It", null), false);
  assert.equal(posterTam("https://image.tmdb.org/t/p/w500/x.jpg", "w185"), "https://image.tmdb.org/t/p/w185/x.jpg");
});

// --- El sincronizador -----------------------------------------------------------

/** Un servidor manual: cada envío queda pendiente hasta resolverlo a mano. */
function servidorManual() {
  const cola: { op: OpTop; ok: (b: RankingFila[]) => void; mal: (e: Error) => void }[] = [];
  const enviar = (op: OpTop) => new Promise<RankingFila[]>((ok, mal) => { cola.push({ op, ok, mal }); });
  return { cola, enviar };
}
const tick = () => new Promise((r) => setImmediate(r));

test("movimientos rápidos: una escritura en vuelo y los órdenes siguientes se funden", async () => {
  const srv = servidorManual();
  const s = new SincronizadorTop(srv.enviar, () => {}, [bloque(diez())]);
  let b = s.vista()[0];
  for (const [d, h] of [[8, 2], [2, 5], [5, 1], [1, 10]]) {
    s.encolar({ k: "ordenar", id: "b1", entradas: moverEnCasilleros(b.entradas, d, h) });
    b = s.vista()[0];
  }
  assert.equal(srv.cola.length, 1, "sólo la primera salió");
  assert.equal(s.estado.pendientes.length, 2, "las otras tres se fundieron en una");
  const intencion = ids(s.vista()[0].entradas);

  // El servidor confirma la PRIMERA: lo que se ve sigue siendo la intención final.
  const primera = srv.cola[0].op as Extract<OpTop, { k: "ordenar" }>;
  srv.cola[0].ok([bloque(primera.entradas)]);
  await tick();
  assert.deepEqual(ids(s.vista()[0].entradas), intencion, "una respuesta vieja no pisa el último movimiento");
  assert.equal(srv.cola.length, 2, "salió el orden fundido");

  const segunda = srv.cola[1].op as Extract<OpTop, { k: "ordenar" }>;
  assert.deepEqual(ids(segunda.entradas), intencion, "viaja el último orden, absoluto");
  srv.cola[1].ok([bloque(segunda.entradas)]);
  await tick();
  assert.equal(s.ocupado(), false);
  assert.deepEqual(ids(s.estado.confirmado[0].entradas), intencion);
});

test("un fallo conserva lo pendiente; reintentar lo reenvía y descartar vuelve a lo confirmado", async () => {
  const srv = servidorManual();
  const s = new SincronizadorTop(srv.enviar, () => {}, [bloque(diez())]);
  s.encolar({ k: "ordenar", id: "b1", entradas: moverEnCasilleros(diez(), 8, 2) });
  s.encolar({ k: "revisar", id: "b1", revisado: true });
  const local = ids(s.vista()[0].entradas);
  srv.cola[0].mal(new Error("sin red"));
  await tick();
  assert.equal(s.estado.fallo?.mensaje, "sin red");
  assert.equal(s.estado.fallo?.conflicto, false);
  assert.equal(s.estado.pendientes.length, 2, "nada se perdió");
  assert.deepEqual(ids(s.vista()[0].entradas), local, "la pantalla conserva el cambio");
  assert.equal(srv.cola.length, 1, "la cola se detuvo: la aprobación no salió sola");

  s.reintentar();
  assert.equal(srv.cola.length, 2);
  assert.equal(srv.cola[1].op.k, "ordenar", "se reenvía desde la fallida");

  srv.cola[1].mal(new Error("sin red otra vez"));
  await tick();
  assert.equal(s.descartar(), true);
  assert.deepEqual(ids(s.vista()[0].entradas), ids(diez()), "vuelve al último confirmado");
  assert.equal(s.ocupado(), false);
});

test("no se descarta ni se recarga con una escritura en vuelo", async () => {
  const srv = servidorManual();
  const s = new SincronizadorTop(srv.enviar, () => {}, [bloque(diez())]);
  s.encolar({ k: "revisar", id: "b1", revisado: true });
  assert.equal(s.descartar(), false);
  assert.equal(s.cargar([bloque([])]), false, "una lectura no pisa lo pendiente");
  srv.cola[0].ok([bloque(diez(), { revisado: true })]);
  await tick();
  assert.equal(s.cargar([bloque([])]), true);
});

// --- Contra el banco (las mismas reglas que el servidor) ---------------------

function bancoCon(entradas: EntradaTop[]) {
  const d = datosIniciales();
  const nm = d.filas.find((f) => f.estado === "borrador" && f.plataforma === "n" && f.tipo === "movie")!;
  nm.entradas = entradas;
  const banco = new BancoTop(d);
  banco.controles.demoraMs = 0;
  return { banco, id: nm.id };
}
const drenar = async (s: SincronizadorTop) => { for (let i = 0; i < 200 && (s.estado.enVuelo || (s.estado.pendientes.length && !s.estado.fallo)); i++) await new Promise((r) => setTimeout(r, 1)); };

test("al azar: movimientos, altas y fallos con reintento nunca duplican ni pierden títulos", async () => {
  let semilla = 12345;
  const azar = (n: number) => { semilla = (semilla * 1103515245 + 12345) % 2 ** 31; return semilla % n; };
  for (let ronda = 0; ronda < 12; ronda++) {
    const { banco, id } = bancoCon([e(1, 1), e(2, 2), e(3, 3), e(4, 4), e(5, 5), e(6, 6)]);
    const s = new SincronizadorTop(async (op) => (await banco.escribir(op)).borradores, () => {}, (await banco.leer()).borradores);
    let proximoId = 50;
    for (let paso = 0; paso < 30; paso++) {
      const b = s.vista().find((x) => x.id === id)!;
      if (azar(4) === 0) banco.controles.fallarProximas = 1;
      if (azar(3) === 0 && primerLibre(b.entradas)) {
        s.encolar({ k: "agregar", id, entrada: e(primerLibre(b.entradas)!, proximoId++) });
      } else {
        s.encolar({ k: "ordenar", id, entradas: moverEnCasilleros(b.entradas, 1 + azar(PUESTOS), 1 + azar(PUESTOS)) });
      }
      if (azar(2) === 0) await drenar(s);
      if (s.estado.fallo) { banco.controles.fallarProximas = 0; s.reintentar(); }
    }
    for (let i = 0; i < 20 && s.ocupado(); i++) { await drenar(s); if (s.estado.fallo) s.reintentar(); }
    assert.equal(s.ocupado(), false, `ronda ${ronda}: quedó algo sin guardar`);

    const enBase = (await banco.leer()).borradores.find((x) => x.id === id)!.entradas;
    const enPantalla = s.vista().find((x) => x.id === id)!.entradas;
    assert.deepEqual(enPantalla, enBase, `ronda ${ronda}: lo que se ve es lo guardado`);
    const claves = enBase.map(claveTitulo);
    assert.equal(new Set(claves).size, claves.length, "sin títulos duplicados");
    assert.equal(new Set(enBase.map((x) => x.posicion)).size, enBase.length, "sin puestos duplicados");
    for (const k of ["movie:1", "movie:2", "movie:3", "movie:4", "movie:5", "movie:6"]) assert.ok(claves.includes(k), `${k} no se perdió`);
  }
});

test("conflicto: si otra pestaña cambió el bloque, el orden se rechaza y no se pierde nada", async () => {
  const { banco, id } = bancoCon(diez().slice(0, 5));
  const s = new SincronizadorTop(async (op) => (await banco.escribir(op)).borradores, () => {}, (await banco.leer()).borradores);
  banco.cambioExterno(id); // agrega un sexto título que la pantalla no conoce
  const b = s.vista().find((x) => x.id === id)!;
  s.encolar({ k: "ordenar", id, entradas: moverEnCasilleros(b.entradas, 5, 1) });
  await drenar(s);
  assert.equal(s.estado.fallo?.conflicto, true);
  assert.equal((await banco.leer()).borradores.find((x) => x.id === id)!.entradas.length, 6, "el título de la otra pestaña sigue");
});

test("agregar no pisa un puesto ocupado y reemplazar exige el título esperado", async () => {
  const { banco, id } = bancoCon(diez());
  await assert.rejects(banco.escribir({ k: "agregar", id, entrada: e(3, 900) }), (x: { conflicto?: boolean }) => x.conflicto === true);
  await assert.rejects(banco.escribir({ k: "reemplazar", id, entrada: e(3, 900), reemplaza: { tipo: "movie", tmdb_id: 999 } }),
    (x: { conflicto?: boolean }) => x.conflicto === true);
  const r = await banco.escribir({ k: "reemplazar", id, entrada: e(3, 900), reemplaza: { tipo: "movie", tmdb_id: 102 } });
  const b = r.borradores.find((x) => x.id === id)!;
  assert.equal(puestoDe(b.entradas, "movie", 900), 3);
  assert.equal(puestoDe(b.entradas, "movie", 102), null);
  assert.equal(b.entradas.length, 10);
});

// --- Cableado ---------------------------------------------------------------------

const sinComentarios = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("la ruta valida y aplica las tres acciones nuevas, con conflicto como 409", () => {
  const r = sinComentarios("../app/api/admin/top/route.ts");
  assert.match(r, /case "ordenar":[\s\S]*?await ordenarEntradas\(p\.sb, id, propuestas\)/);
  assert.match(r, /case "agregar":[\s\S]*?await agregarEnPosicion\(p\.sb, id, e\)/);
  assert.match(r, /case "reemplazar":[\s\S]*?await reemplazarEnPosicion\(p\.sb, id, e, /);
  assert.match(r, /e instanceof ConflictoTop[\s\S]*?status: 409/);
  // La puerta (admin + MFA) sigue siendo la única entrada.
  assert.match(r, /export async function POST[\s\S]*?const p = await puerta\(req\);/);
});

test("el servidor ordena con la regla de permutación y escribe en UNA transacción", () => {
  const m = sinComentarios("./top-manual.ts");
  const f = /export async function ordenarEntradas[\s\S]*?\n}\n/.exec(m)![0];
  assert.match(f, /validarNuevoOrden\(actuales, propuestas\)/);
  assert.match(f, /throw new ConflictoTop/);
  assert.match(f, /reemplazarEntradas\(sb, borradorId, entradasDeOrden\(actuales, propuestas\)\)/);
  const ag = /export async function agregarEnPosicion[\s\S]*?\n}\n/.exec(m)![0];
  assert.match(ag, /\.insert\(/, "agregar es un insert: el unique rechaza un puesto ocupado");
  assert.doesNotMatch(ag, /upsert/);
  const re = /export async function reemplazarEnPosicion[\s\S]*?\n}\n/.exec(m)![0];
  assert.match(re, /\.eq\("tmdb_id", reemplaza\.tmdb_id\)/, "reemplazar está condicionado al título esperado");
});

test("el editor no habla con la red: todo pasa por el transporte", () => {
  const ed = sinComentarios("../components/admin/top/TopEditor.tsx");
  assert.doesNotMatch(ed, /fetch\(/);
  assert.match(ed, /preparacion\(/, "el contador sale de las publicaciones, no de /api/top");
});

test("el banco local sólo existe fuera de producción, con su variable, y no viaja en Android", () => {
  assert.equal(bancoTopHabilitado({ NODE_ENV: "development", TOP_REVISION_LOCAL: "1" }), true);
  assert.equal(bancoTopHabilitado({ NODE_ENV: "production", TOP_REVISION_LOCAL: "1" }), false);
  assert.equal(bancoTopHabilitado({ NODE_ENV: "development" }), false);
  assert.match(readFileSync(new URL("../app/revision-local/top/page.tsx", import.meta.url), "utf8"), /if \(!bancoTopHabilitado\(\)\) notFound\(\);/);
  assert.ok(!readFileSync(new URL("../.env.local.example", import.meta.url), "utf8").includes("TOP_REVISION_LOCAL"));
  assert.equal(excluidaDeApp("revision-local/top/page.tsx"), true);
});
