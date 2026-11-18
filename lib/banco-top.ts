// Banco local del editor del Top: una base EN MEMORIA que imita a
// `/api/admin/top` + la migración 007, para probar el dashboard sin Supabase ni
// la base de Producción. Lo monta `app/revision-local/top` (sólo fuera de
// producción y con TOP_REVISION_LOCAL=1).
//
// Imita lo que importa para el editor:
//  - un borrador por bloque, y publicar crea el siguiente ya cargado;
//  - `unique (ranking, posicion)` y `unique (ranking, tipo, tmdb_id)`;
//  - cualquier cambio de contenido o de fecha desmarca la revisión (trigger);
//  - `ordenar` sólo acepta una permutación (la MISMA regla que usa el servidor,
//    `validarNuevoOrden`), `agregar` es un insert y `reemplazar` es condicional;
//  - `publicar_top` exige revisado y las diez posiciones.
// Y agrega lo que la base real no da a pedido: demora, fallos y "otra pestaña".
//
// No es la base: no prueba RLS, MFA, triggers reales ni PostgREST. Eso se
// verifica en una Preview con la sesión del admin.
import type { MediaType, PlatformCode } from "./types";
import type { EntradaTop } from "./top-manual-nucleo";
import { BLOQUES, claveBloque } from "./top-manual-nucleo.ts";
import {
  claveTitulo, entradasDeOrden, validarNuevoOrden, type OpTop, type RankingFila,
} from "./top-editor-nucleo.ts";
import {
  ErrorTop, type CandidatoTop, type RespuestaTop, type ResultadoPublicacion, type TransporteTop,
} from "./top-transporte.ts";

interface FilaBanco extends RankingFila { published_at: string | null }

export interface DatosBanco { filas: FilaBanco[]; secuencia: number }

export interface ControlesBanco {
  /** Demora de cada escritura, en ms. */
  demoraMs: number;
  /** Las próximas N escrituras fallan con un error de red. */
  fallarProximas: number;
  /** Todas las escrituras fallan hasta desactivarlo. */
  fallarTodas: boolean;
}

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// --- Catálogo ficticio de búsqueda -------------------------------------------
// Pósters SVG generados (sin red): título, año y un color por obra. Incluye
// homónimos a propósito (tres "Drácula", dos "It") para probar que se
// distinguen por póster, año y título original.
interface Obra { id: number; tipo: MediaType; titulo: string; year: number; original: string; color: string; resumen: string; plataformas: PlatformCode[] }

const OBRAS: Obra[] = [
  { id: 138, tipo: "movie", titulo: "Drácula", year: 1931, original: "Dracula", color: "#3b3b52", resumen: "El conde viaja de Transilvania a Londres. La versión clásica de Universal con Bela Lugosi.", plataformas: ["m"] },
  { id: 11868, tipo: "movie", titulo: "Drácula", year: 1958, original: "Dracula", color: "#7a1f1f", resumen: "La versión de Hammer Films con Christopher Lee y Peter Cushing.", plataformas: [] },
  { id: 6114, tipo: "movie", titulo: "Drácula de Bram Stoker", year: 1992, original: "Bram Stoker's Dracula", color: "#5c0f2e", resumen: "Francis Ford Coppola adapta la novela con Gary Oldman.", plataformas: ["n"] },
  { id: 346364, tipo: "movie", titulo: "It (Eso)", year: 2017, original: "It", color: "#a3201c", resumen: "Un grupo de chicos de Derry enfrenta a un payaso que reaparece cada 27 años.", plataformas: ["m"] },
  { id: 474350, tipo: "movie", titulo: "IT: Capítulo 2", year: 2019, original: "It Chapter Two", color: "#8a5a12", resumen: "Veintisiete años después, el Club de los Perdedores vuelve a Derry.", plataformas: ["m"] },
  { id: 872585, tipo: "movie", titulo: "Oppenheimer", year: 2023, original: "Oppenheimer", color: "#c2601a", resumen: "La historia del físico que dirigió el Proyecto Manhattan.", plataformas: ["n", "p"] },
  { id: 346698, tipo: "movie", titulo: "Barbie", year: 2023, original: "Barbie", color: "#d6457f", resumen: "Barbie deja Barbieland y descubre el mundo real.", plataformas: ["m"] },
  { id: 438631, tipo: "movie", titulo: "Duna", year: 2021, original: "Dune", color: "#b0813a", resumen: "Paul Atreides llega a Arrakis, el planeta más peligroso del universo.", plataformas: ["n", "m"] },
  { id: 693134, tipo: "movie", titulo: "Duna: Parte dos", year: 2024, original: "Dune: Part Two", color: "#9a5b22", resumen: "Paul se une a los Fremen mientras busca venganza.", plataformas: ["m"] },
  { id: 1233413, tipo: "movie", titulo: "Pecadores", year: 2025, original: "Sinners", color: "#26422f", resumen: "Dos hermanos vuelven a su pueblo y encuentran un mal antiguo.", plataformas: ["m"] },
  { id: 138843, tipo: "movie", titulo: "El conjuro", year: 2013, original: "The Conjuring", color: "#2b3440", resumen: "Los Warren investigan una casa aterrada en Rhode Island.", plataformas: ["n", "m"] },
  { id: 940721, tipo: "movie", titulo: "Godzilla Minus One", year: 2023, original: "ゴジラ-1.0", color: "#1f2a3a", resumen: "Japón de posguerra enfrenta a Godzilla.", plataformas: ["n"] },
  { id: 1062722, tipo: "movie", titulo: "Frankenstein", year: 2025, original: "Frankenstein", color: "#334a4a", resumen: "Guillermo del Toro adapta la novela de Mary Shelley.", plataformas: ["n"] },
  { id: 933260, tipo: "movie", titulo: "La sustancia", year: 2024, original: "The Substance", color: "#c9b21b", resumen: "Una estrella en decadencia prueba una droga que crea una versión mejor de sí misma.", plataformas: ["p"] },
  { id: 1064213, tipo: "movie", titulo: "Anora", year: 2024, original: "Anora", color: "#6d3a8c", resumen: "Una joven de Brooklyn se casa con el hijo de un oligarca.", plataformas: ["m"] },
  { id: 76600, tipo: "movie", titulo: "Avatar: El camino del agua", year: 2022, original: "Avatar: The Way of Water", color: "#1f6f8b", resumen: "Jake Sully y su familia buscan refugio con el clan del mar.", plataformas: ["d"] },
  { id: 119051, tipo: "tv", titulo: "Merlina", year: 2022, original: "Wednesday", color: "#222", resumen: "Merlina Addams investiga una ola de asesinatos en Nevermore.", plataformas: ["n"] },
  { id: 95396, tipo: "tv", titulo: "Severance", year: 2022, original: "Severance", color: "#2f5d7c", resumen: "Empleados con la memoria dividida entre trabajo y vida personal.", plataformas: ["at"] },
  { id: 136315, tipo: "tv", titulo: "The Bear", year: 2022, original: "The Bear", color: "#5b3a1e", resumen: "Un chef joven vuelve a Chicago a hacerse cargo del local familiar.", plataformas: ["d"] },
  { id: 86006, tipo: "tv", titulo: "Drácula", year: 2020, original: "Dracula", color: "#4a0d0d", resumen: "Miniserie de Mark Gatiss y Steven Moffat.", plataformas: ["n"] },
  { id: 1813355, tipo: "tv", titulo: "It: Bienvenidos a Derry", year: 2025, original: "IT: Welcome to Derry", color: "#7a2a2a", resumen: "Precuela de It ambientada en los años sesenta.", plataformas: ["m"] },
];

/** Póster SVG del banco (data URI): reconocible sin red. */
export function posterBanco(o: { titulo: string; year: number; color: string }): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">`
    + `<rect width="500" height="750" fill="${o.color}"/>`
    + `<rect x="24" y="24" width="452" height="702" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="4"/>`
    + `<text x="250" y="330" fill="#fff" font-family="Georgia,serif" font-size="54" text-anchor="middle">${esc(o.titulo.length > 16 ? o.titulo.slice(0, 15) + "…" : o.titulo)}</text>`
    + `<text x="250" y="420" fill="rgba(255,255,255,.85)" font-family="Arial,sans-serif" font-size="64" font-weight="700" text-anchor="middle">${o.year}</text>`
    + `<text x="250" y="690" fill="rgba(255,255,255,.6)" font-family="Arial,sans-serif" font-size="24" text-anchor="middle">BANCO LOCAL</text>`
    + `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** El estado inicial: Netflix·Películas completo y publicado, Netflix·Series a medias. */
export function datosIniciales(): DatosBanco {
  let secuencia = 0;
  const nuevaFila = (plataforma: PlatformCode, tipo: MediaType, entradas: EntradaTop[], estado: "borrador" | "publicado" = "borrador"): FilaBanco => ({
    id: `banco-${++secuencia}`, plataforma, tipo, estado, captured_at: hoy(),
    revisado: false, entradas, published_at: estado === "publicado" ? new Date().toISOString() : null,
  });
  const pelis = OBRAS.filter((o) => o.tipo === "movie").slice(0, 10)
    .map((o, i): EntradaTop => ({ posicion: i + 1, tipo: "movie", tmdb_id: o.id, titulo: o.titulo }));
  const series = OBRAS.filter((o) => o.tipo === "tv").slice(0, 3)
    .map((o, i): EntradaTop => ({ posicion: i + 1, tipo: "tv", tmdb_id: o.id, titulo: o.titulo }));
  const filas: FilaBanco[] = [nuevaFila("n", "movie", copia(pelis), "publicado")];
  for (const b of BLOQUES) {
    const ent = b.plataforma === "n" && b.tipo === "movie" ? copia(pelis)
      : b.plataforma === "n" && b.tipo === "tv" ? series : [];
    filas.push(nuevaFila(b.plataforma, b.tipo, ent));
  }
  return { filas, secuencia };
}

export class BancoTop implements TransporteTop {
  controles: ControlesBanco = { demoraMs: 600, fallarProximas: 0, fallarTodas: false };
  /** Registro de lo que llegó al "servidor", para mostrarlo en la página. */
  registro: string[] = [];

  datos: DatosBanco;
  private guardar: (d: DatosBanco) => void;
  private avisar: () => void;
  // Campos explícitos, sin "parameter properties": Node corre este archivo en
  // los tests quitando sólo los tipos, y esa sintaxis necesita transformarse.
  constructor(datos: DatosBanco, guardar: (d: DatosBanco) => void = () => {}, avisar: () => void = () => {}) {
    this.datos = datos; this.guardar = guardar; this.avisar = avisar;
  }

  private borradores(): RankingFila[] {
    return this.datos.filas.filter((f) => f.estado === "borrador")
      .map(({ published_at: _p, ...f }) => copia({ ...f, entradas: [...f.entradas].sort((a, b) => a.posicion - b.posicion) }));
  }

  private respuesta(): RespuestaTop {
    const publicados = [...new Set(this.datos.filas.filter((f) => f.estado === "publicado").map((f) => claveBloque(f.plataforma, f.tipo)))];
    return { borradores: this.borradores(), publicados };
  }

  private log(t: string) {
    this.registro = [`${new Date().toLocaleTimeString("es-AR")} · ${t}`, ...this.registro].slice(0, 40);
    this.avisar();
  }

  private borrador(id: string): FilaBanco {
    const f = this.datos.filas.find((x) => x.id === id);
    if (!f) throw new ErrorTop("ranking inexistente");
    if (f.estado !== "borrador") throw new ErrorTop("sólo se editan borradores");
    return f;
  }

  async leer(): Promise<RespuestaTop> {
    await esperar(Math.min(this.controles.demoraMs, 400));
    return this.respuesta();
  }

  async escribir(op: OpTop): Promise<RespuestaTop> {
    const n = ++this.datos.secuencia;
    this.log(`#${n} ${op.k} recibido`);
    await esperar(this.controles.demoraMs);
    if (this.controles.fallarTodas || this.controles.fallarProximas > 0) {
      if (this.controles.fallarProximas > 0) this.controles.fallarProximas--;
      this.log(`#${n} ${op.k} FALLÓ (simulado)`);
      throw new ErrorTop("No se pudo conectar con el servidor (falla simulada del banco)");
    }
    const f = this.borrador(op.id);
    const contenido = () => { f.revisado = false; };
    switch (op.k) {
      case "ordenar": {
        const motivo = validarNuevoOrden(f.entradas, op.entradas);
        if (motivo) { this.log(`#${n} ordenar RECHAZADO: ${motivo}`); throw new ErrorTop(motivo, true); }
        f.entradas = entradasDeOrden(f.entradas, op.entradas); contenido(); break;
      }
      case "agregar": {
        if (f.entradas.some((e) => e.posicion === op.entrada.posicion) || f.entradas.some((e) => claveTitulo(e) === claveTitulo(op.entrada))) {
          this.log(`#${n} agregar RECHAZADO (unique)`);
          throw new ErrorTop("ese puesto ya está ocupado o el título ya está en el bloque", true);
        }
        f.entradas = [...f.entradas, op.entrada]; contenido(); break;
      }
      case "reemplazar": {
        const i = f.entradas.findIndex((e) => e.posicion === op.entrada.posicion && claveTitulo(e) === claveTitulo(op.reemplaza));
        if (i < 0) { this.log(`#${n} reemplazar RECHAZADO (el puesto cambió)`); throw new ErrorTop("ese puesto cambió desde que se cargó la pantalla", true); }
        if (f.entradas.some((e, j) => j !== i && claveTitulo(e) === claveTitulo(op.entrada))) throw new ErrorTop("ese título ya está en el bloque", true);
        f.entradas = f.entradas.map((e, j) => (j === i ? op.entrada : e)); contenido(); break;
      }
      case "revisar": f.revisado = op.revisado; break;
      case "fecha": f.captured_at = op.fecha; contenido(); break;
      case "restaurar":
      case "corregir": {
        const pub = this.datos.filas.filter((x) => x.estado === "publicado" && x.plataforma === f.plataforma && x.tipo === f.tipo)
          .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))[0];
        if (!pub && op.k === "corregir") throw new ErrorTop("ese bloque todavía no tiene publicación");
        f.entradas = pub ? copia(pub.entradas) : []; contenido(); break;
      }
    }
    this.guardar(this.datos);
    this.log(`#${n} ${op.k} guardado`);
    return this.respuesta();
  }

  async publicar(ids: string[]) {
    await esperar(this.controles.demoraMs);
    const resultados: ResultadoPublicacion[] = [];
    for (const id of ids) {
      const f = this.datos.filas.find((x) => x.id === id);
      if (!f) { resultados.push({ ranking_id: id, plataforma: null, tipo: null, publicado: false, motivo: "no existe" }); continue; }
      const base = { ranking_id: id, plataforma: f.plataforma, tipo: f.tipo };
      if (f.estado !== "borrador") { resultados.push({ ...base, publicado: false, motivo: "no es un borrador" }); continue; }
      if (!f.revisado) { resultados.push({ ...base, publicado: false, motivo: "sin revisar" }); continue; }
      const pos = new Set(f.entradas.map((e) => e.posicion));
      if (f.entradas.length !== 10 || [...Array(10)].some((_, i) => !pos.has(i + 1))) {
        resultados.push({ ...base, publicado: false, motivo: `tiene ${f.entradas.length} posiciones` }); continue;
      }
      f.estado = "publicado"; f.published_at = new Date().toISOString();
      this.datos.filas.push({
        id: `banco-${++this.datos.secuencia}`, plataforma: f.plataforma, tipo: f.tipo, estado: "borrador",
        captured_at: hoy(), revisado: false, entradas: copia(f.entradas), published_at: null,
      });
      resultados.push({ ...base, publicado: true, motivo: null });
    }
    this.guardar(this.datos);
    this.log(`publicar: ${resultados.filter((r) => r.publicado).length} de ${ids.length}`);
    return { resultados, ...this.respuesta() };
  }

  async buscar(q: string, tipo: MediaType, plataforma: PlatformCode): Promise<CandidatoTop[]> {
    await esperar(250);
    const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const t = n(q.trim());
    return OBRAS.filter((o) => o.tipo === tipo && (n(o.titulo).includes(t) || n(o.original).includes(t)))
      .slice(0, 8)
      .map((o) => ({
        id: o.id, tipo: o.tipo, titulo: o.titulo, year: o.year, poster: posterBanco(o),
        plataformas: o.plataformas, confirmadoEnPlataforma: o.plataformas.includes(plataforma),
        tituloOriginal: o.original, resumen: o.resumen,
      }));
  }

  /** "Otra pestaña": agrega un título directo a la base, sin pasar por el panel. */
  cambioExterno(id: string): string | null {
    const f = this.datos.filas.find((x) => x.id === id && x.estado === "borrador");
    if (!f) return null;
    const usados = new Set(f.entradas.map(claveTitulo));
    const libre = [...Array(10)].map((_, i) => i + 1).find((p) => !f.entradas.some((e) => e.posicion === p));
    const obra = OBRAS.find((o) => o.tipo === f.tipo && !usados.has(`${o.tipo}:${o.id}`));
    if (!obra) return null;
    if (libre) {
      f.entradas.push({ posicion: libre, tipo: obra.tipo, tmdb_id: obra.id, titulo: obra.titulo });
    } else {
      // Bloque lleno: cambia el último puesto por otro título.
      f.entradas = f.entradas.map((e) => (e.posicion === 10 ? { posicion: 10, tipo: obra.tipo, tmdb_id: obra.id, titulo: obra.titulo } : e));
    }
    f.revisado = false;
    this.guardar(this.datos);
    this.log(`otra pestaña cambió ${f.plataforma}/${f.tipo}: «${obra.titulo}»`);
    return obra.titulo;
  }
}
