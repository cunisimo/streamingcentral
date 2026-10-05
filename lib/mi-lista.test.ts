// "Mi lista" completa (/cuenta/lista) con selector Películas | Series (pedido
// del dueño, 5/10). El filtro es LOCAL sobre lo ya cargado; volver de una ficha
// conserva filtro y scroll. Los rieles del hub de Mi cuenta no cambian.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { abrirMiLista, deTipo, tipoInicial, MENSAJE_VACIO_TIPO, type SnapshotMiLista } from "./mi-lista.ts";
import type { UITitle } from "./types.ts";

const fuente = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
const t = (type: "movie" | "tv", id: number): UITitle => ({
  id, type, title: `${type} ${id}`, year: null, runtime: null, poster: null, country: null,
  genres: [], platforms: [], tmdb: null, hasEditorial: false,
} as unknown as UITitle);
const claves = (xs: UITitle[]) => xs.map((x) => `${x.type}:${x.id}`);

// Como las devuelve /api/cards: en el orden de `itemRefs("list")`, lo más
// reciente primero, películas y series mezcladas.
const MEZCLA = [t("tv", 1), t("movie", 2), t("movie", 3), t("tv", 4), t("movie", 5)];

function contador(items: UITitle[]) {
  const llamadas = { n: 0 };
  return { llamadas, cargar: async () => { llamadas.n++; return items; } };
}

test("con películas y series: abre en Películas y cada tipo conserva el orden por recencia", async () => {
  const { llamadas, cargar } = contador(MEZCLA);
  const v = await abrirMiLista({ snapshot: null, enLista: null, cargar });
  assert.equal(v.tipo, "movie");
  assert.equal(llamadas.n, 1);
  assert.deepEqual(claves(deTipo(v.items, "movie")), ["movie:2", "movie:3", "movie:5"]);
  assert.deepEqual(claves(deTipo(v.items, "tv")), ["tv:1", "tv:4"]);
});

test("sólo películas: abre en Películas y Series está vacía con su mensaje", async () => {
  const v = await abrirMiLista({ snapshot: null, enLista: null, cargar: async () => [t("movie", 2)] });
  assert.equal(v.tipo, "movie");
  assert.deepEqual(deTipo(v.items, "tv"), []);
  assert.equal(MENSAJE_VACIO_TIPO.tv, "Todavía no guardaste series.");
});

test("sólo series: abre AUTOMÁTICAMENTE en Series", async () => {
  const v = await abrirMiLista({ snapshot: null, enLista: null, cargar: async () => [t("tv", 1), t("tv", 4)] });
  assert.equal(v.tipo, "tv");
  assert.equal(MENSAJE_VACIO_TIPO.movie, "Todavía no guardaste películas.");
});

test("lista completamente vacía: sin ítems (la vista muestra el mensaje general de siempre)", async () => {
  const v = await abrirMiLista({ snapshot: null, enLista: null, cargar: async () => [] });
  assert.deepEqual(v.items, []);
  assert.equal(tipoInicial([]), "movie");
  assert.match(fuente("components/MiListaView.tsx"), /Todavía no guardaste nada — tocá "Mi lista" en cualquier ficha\./);
});

test("cambiar de filtro es LOCAL: no consulta nada (ni Supabase, ni /api/cards, ni TMDB)", async () => {
  const { llamadas, cargar } = contador(MEZCLA);
  const v = await abrirMiLista({ snapshot: null, enLista: null, cargar });
  // Filtrar ida y vuelta muchas veces es sólo derivar de lo cargado.
  for (let i = 0; i < 10; i++) { deTipo(v.items, "tv"); deTipo(v.items, "movie"); }
  assert.equal(llamadas.n, 1, "una sola carga, al abrir");
  // Y en el componente: el cambio de filtro sólo cambia estado; la carga no
  // depende del tipo.
  const s = fuente("components/MiListaView.tsx");
  assert.match(s, /const elegir = \(nuevo: TipoLista\) => setTipo\(nuevo\);/);
  assert.ok(!/\[[^\]]*\btipo\b[^\]]*\]\);\s*$/m.test(s.split("const elegir")[0]), "la carga no puede depender del tipo");
});

test("volver de una ficha: filtro, tarjetas y scroll del snapshot, SIN consultas", async () => {
  const { llamadas, cargar } = contador(MEZCLA);
  const snapshot = { datos: { tipo: "tv", items: MEZCLA } as SnapshotMiLista, scrollY: 640 };
  const v = await abrirMiLista({ snapshot, enLista: new Set(claves(MEZCLA)), cargar });
  assert.equal(v.tipo, "tv", "conserva el filtro elegido aunque haya películas");
  assert.equal(v.scrollY, 640);
  assert.deepEqual(claves(v.items), claves(MEZCLA));
  assert.equal(llamadas.n, 0);
});

test("volver después de SACAR un título en la ficha: desaparece, sin consultas", async () => {
  const { llamadas, cargar } = contador(MEZCLA);
  const snapshot = { datos: { tipo: "movie", items: MEZCLA } as SnapshotMiLista, scrollY: 300 };
  const enLista = new Set(claves(MEZCLA).filter((k) => k !== "movie:3"));
  const v = await abrirMiLista({ snapshot, enLista, cargar });
  assert.deepEqual(claves(deTipo(v.items, "movie")), ["movie:2", "movie:5"]);
  assert.equal(llamadas.n, 0);
});

test("volver después de AGREGAR un título en la ficha: recarga una vez y conserva filtro y scroll", async () => {
  const nueva = [t("movie", 9), ...MEZCLA];
  const { llamadas, cargar } = contador(nueva);
  const snapshot = { datos: { tipo: "tv", items: MEZCLA } as SnapshotMiLista, scrollY: 300 };
  const v = await abrirMiLista({ snapshot, enLista: new Set(claves(nueva)), cargar });
  assert.equal(llamadas.n, 1);
  assert.equal(v.tipo, "tv");
  assert.equal(v.scrollY, 300);
  assert.deepEqual(claves(deTipo(v.items, "movie")), ["movie:9", "movie:2", "movie:3", "movie:5"]);
});

test("volver sin saber qué hay en la lista (contexto no cargado): recarga, conserva filtro y scroll", async () => {
  const { llamadas, cargar } = contador(MEZCLA);
  const snapshot = { datos: { tipo: "tv", items: MEZCLA } as SnapshotMiLista, scrollY: 120 };
  const v = await abrirMiLista({ snapshot, enLista: null, cargar });
  assert.equal(llamadas.n, 1);
  assert.equal(v.tipo, "tv");
  assert.equal(v.scrollY, 120);
});

test("selector: SÓLO Películas | Series, el mismo diseño de categorías, accesible", () => {
  const s = fuente("components/MiListaView.tsx");
  // Mismas clases que CategoryView/UltimosView: sin variante visual nueva.
  assert.match(s, /className="tipo-toggle" role="tablist"/);
  assert.match(s, /className=\{`tt \$\{/);
  assert.ok(!/\bTodo\b|Todas/.test(s), "no hay opción Todo");
  assert.ok(!/tipo-toggle[\w-]+|\.tt-/.test(fuente("app/globals.css").split("\n").filter((l) => /mi-lista/.test(l)).join("\n")), "sin clases nuevas para el selector");
  // ARIA de pestañas: estado, panel asociado y teclado (flechas, Inicio, Fin).
  assert.match(s, /role="tab"/);
  assert.match(s, /aria-selected=\{/);
  assert.match(s, /aria-controls=\{PANEL\}/);
  assert.match(s, /role="tabpanel"/);
  assert.match(s, /aria-labelledby=\{/);
  assert.match(s, /tabIndex=\{/);
  for (const k of ["ArrowRight", "ArrowLeft", "Home", "End"]) assert.match(s, new RegExp(`"${k}"`));
  // Las dos opciones siempre visibles, también con el tipo elegido vacío.
  assert.match(s, /MENSAJE_VACIO_TIPO\[tipo\]/);
});

test("alcance: sólo la vista completa; los rieles del hub siguen con UserShelf", () => {
  assert.match(fuente("app/cuenta/lista/page.tsx"), /<MiListaView userId=\{user\.id\} \/>/);
  assert.ok(!/UserShelf/.test(fuente("app/cuenta/lista/page.tsx")));
  const hub = fuente("components/UserHub.tsx");
  assert.match(hub, /UserShelf/);
  assert.ok(!/MiListaView|tipo-toggle/.test(hub));
});

test("restauración: snapshot por usuario y con la marca de vuelta compartida (un solo popstate)", () => {
  const s = fuente("components/MiListaView.tsx");
  assert.match(s, /consumirVuelta\(/);
  assert.match(s, /decidirRestauracionVista</);
  assert.match(s, /firma: userId/);
  assert.match(s, /guardarVista</);
});
