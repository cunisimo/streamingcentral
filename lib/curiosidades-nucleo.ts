// «¿Sabías que…?»: reglas PURAS (sin red, sin Supabase), compartidas por el
// panel (cliente), las APIs (servidor) y los tests. Apto para el cliente.
//
// Las mismas reglas viven también en la base (CHECK de la migración 025): acá
// están para responder un error que se entiende antes de llegar a Postgres, y
// para que el panel deshabilite «Publicar» mientras falte algo. La base es la
// última palabra, no esto.

export type TipoTitulo = "movie" | "tv";

/** Lo que el panel edita. El borrador puede estar incompleto. */
export interface CamposCuriosidad {
  texto: string;
  fuenteNombre: string;
  fuenteUrl: string;
  spoiler: boolean;
}

/** Estado derivado (columna `estado` de la tabla). */
export type EstadoCuriosidad = "borrador" | "publicada" | "cambios" | "retirada";

/** Una fila tal como la ve el panel. */
export interface CuriosidadAdmin {
  id: string;
  tipo: TipoTitulo;
  tmdbId: number;
  titulo: string;
  anio: number | null;
  poster: string | null;
  borrador: CamposCuriosidad;
  /** La versión que ven (o vieron, si está retirada) los usuarios. */
  publicadaVersion: CamposCuriosidad | null;
  publicada: boolean;
  publicadaEn: string | null;
  estado: EstadoCuriosidad;
  actualizadaEn: string;
}

/** Lo único que viaja a la ficha pública. */
export interface CuriosidadPublica {
  texto: string;
  spoiler: boolean;
  fuente: { nombre: string; url: string };
}

export const LIMITES = { texto: 700, fuenteNombre: 120, fuenteUrl: 500, titulo: 300 } as const;

export const ETIQUETA_ESTADO: Record<EstadoCuriosidad, string> = {
  borrador: "Borrador",
  publicada: "Publicada",
  cambios: "Publicada · con cambios sin publicar",
  retirada: "Retirada",
};

/** Filtros del listado del panel. `todas` no filtra. */
export const FILTROS_ESTADO = ["todas", "publicada", "cambios", "borrador", "retirada"] as const;
export type FiltroEstado = (typeof FILTROS_ESTADO)[number];
export const ETIQUETA_FILTRO: Record<FiltroEstado, string> = {
  todas: "Todas",
  publicada: "Publicadas",
  cambios: "Con cambios sin publicar",
  borrador: "Borradores",
  retirada: "Retiradas",
};
export const esFiltroEstado = (v: unknown): v is FiltroEstado =>
  typeof v === "string" && (FILTROS_ESTADO as readonly string[]).includes(v);

export const esTipo = (v: unknown): v is TipoTitulo => v === "movie" || v === "tv";

// ============================================================================
// Normalización: texto plano
// ============================================================================

// Controles que no son salto de línea ni tabulación. La base rechaza los mismos
// en lo publicado (CHECK `pub_texto !~ …`).
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Texto plano: saltos de línea unificados, sin caracteres de control, sin más
 * de una línea en blanco seguida y sin espacios al borde. NO interpreta HTML ni
 * Markdown: React lo escapa al dibujarlo y la tarjeta respeta los saltos con CSS.
 */
export function normalizarTexto(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(CONTROLES, "")
    .replace(/[  ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Una sola línea: el nombre de la fuente y la URL. */
export function normalizarLinea(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(/[\r\n\t]+/g, " ").replace(CONTROLES, "").replace(/\s{2,}/g, " ").trim();
}

export function normalizarCampos(c: Partial<Record<keyof CamposCuriosidad, unknown>>): CamposCuriosidad {
  return {
    texto: normalizarTexto(c.texto),
    fuenteNombre: normalizarLinea(c.fuenteNombre),
    fuenteUrl: normalizarLinea(c.fuenteUrl),
    spoiler: c.spoiler === true,
  };
}

// ============================================================================
// URL de la fuente
// ============================================================================

// La misma regla que el CHECK de la migración 025 (allá con clases POSIX):
// host con punto, sin credenciales, puerto opcional y sin espacios ni controles.
// La batería local (`scripts/sabias-que/pruebas-local.mjs`) pasa la misma lista
// de URLs por las dos y exige el mismo veredicto.
export const PATRON_URL_FUENTE =
  "^https?://[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?([/?#][^\\s\\x00-\\x1F\\x7F]*)?$";
const RE_URL = new RegExp(PATRON_URL_FUENTE);

/**
 * ¿Es una URL de fuente aceptable? Sólo `http:` y `https:`, con host público
 * (con punto), sin usuario ni contraseña. `javascript:`, `data:`, `ftp:`,
 * `https://usuario@host` y `http://localhost` no pasan.
 */
export function urlFuenteValida(u: string): boolean {
  if (!u || u.length > LIMITES.fuenteUrl || !RE_URL.test(u)) return false;
  try {
    const p = new URL(u);
    return (p.protocol === "https:" || p.protocol === "http:") && !p.username && !p.password;
  } catch {
    return false;
  }
}

// ============================================================================
// Validación
// ============================================================================

export interface ErroresCampos {
  texto?: string;
  fuenteNombre?: string;
  fuenteUrl?: string;
}

/** Lo mínimo para GUARDAR un borrador: sólo los topes de largo. */
export function validarBorrador(c: CamposCuriosidad): ErroresCampos {
  const e: ErroresCampos = {};
  if (c.texto.length > LIMITES.texto) e.texto = `Máximo ${LIMITES.texto} caracteres.`;
  if (c.fuenteNombre.length > LIMITES.fuenteNombre) e.fuenteNombre = `Máximo ${LIMITES.fuenteNombre} caracteres.`;
  if (c.fuenteUrl.length > LIMITES.fuenteUrl) e.fuenteUrl = `Máximo ${LIMITES.fuenteUrl} caracteres.`;
  return e;
}

/** Lo que exige PUBLICAR: texto, nombre de la fuente y URL http/https válida. */
export function validarPublicacion(c: CamposCuriosidad): ErroresCampos {
  const e = validarBorrador(c);
  if (!e.texto && !c.texto) e.texto = "Escribí la curiosidad.";
  if (!e.fuenteNombre && !c.fuenteNombre) e.fuenteNombre = "Indicá el nombre de la fuente.";
  if (!e.fuenteUrl) {
    if (!c.fuenteUrl) e.fuenteUrl = "Indicá la URL de la fuente.";
    else if (!urlFuenteValida(c.fuenteUrl)) e.fuenteUrl = "La URL tiene que empezar con http:// o https:// y apuntar a un sitio público.";
  }
  return e;
}

export const sinErrores = (e: ErroresCampos) => !e.texto && !e.fuenteNombre && !e.fuenteUrl;

export function mismosCampos(a: CamposCuriosidad | null, b: CamposCuriosidad | null): boolean {
  if (!a || !b) return a === b;
  return a.texto === b.texto && a.fuenteNombre === b.fuenteNombre
    && a.fuenteUrl === b.fuenteUrl && a.spoiler === b.spoiler;
}

// ============================================================================
// Botones del panel según el estado
// ============================================================================

export type AccionPanel = "guardar" | "publicar" | "guardar-publicar" | "retirar";

export const ETIQUETA_ACCION: Record<AccionPanel, string> = {
  guardar: "Guardar borrador",
  publicar: "Publicar",
  "guardar-publicar": "Guardar y publicar cambios",
  retirar: "Retirar de publicación",
};

/**
 * Qué botones corresponden. `fila` es lo guardado (null = todavía no existe);
 * `form` es lo que está en pantalla.
 *
 * - Nueva, borrador o retirada → «Guardar borrador» y «Publicar».
 * - Publicada sin diferencias → «Guardar borrador» (deshabilitado si no hay
 *   nada que guardar, lo decide la vista) y «Retirar de publicación».
 * - Publicada con diferencias (en pantalla o ya guardadas) → además
 *   «Guardar y publicar cambios».
 */
export function accionesDisponibles(fila: CuriosidadAdmin | null, form: CamposCuriosidad): AccionPanel[] {
  if (!fila || !fila.publicada) return ["guardar", "publicar"];
  const difiere = !mismosCampos(form, fila.publicadaVersion);
  return difiere ? ["guardar", "guardar-publicar", "retirar"] : ["guardar", "retirar"];
}

/** ¿Hay cambios en pantalla que todavía no se guardaron? */
export const sinGuardar = (fila: CuriosidadAdmin | null, form: CamposCuriosidad) =>
  fila ? !mismosCampos(form, fila.borrador) : !!(form.texto || form.fuenteNombre || form.fuenteUrl || form.spoiler);

// ============================================================================
// Mapeo de filas (Supabase → panel / ficha)
// ============================================================================

export interface FilaCuriosidad {
  id: string;
  tipo: string;
  tmdb_id: number;
  titulo: string;
  anio: number | null;
  poster: string | null;
  texto: string;
  fuente_nombre: string;
  fuente_url: string;
  spoiler: boolean;
  pub_texto: string | null;
  pub_fuente_nombre: string | null;
  pub_fuente_url: string | null;
  pub_spoiler: boolean | null;
  publicada: boolean;
  publicada_en: string | null;
  estado: string;
  updated_at: string;
}

export const COLUMNAS_ADMIN =
  "id, tipo, tmdb_id, titulo, anio, poster, texto, fuente_nombre, fuente_url, spoiler, "
  + "pub_texto, pub_fuente_nombre, pub_fuente_url, pub_spoiler, publicada, publicada_en, estado, updated_at";

export function filaAAdmin(f: FilaCuriosidad): CuriosidadAdmin {
  const estado: EstadoCuriosidad = (["borrador", "publicada", "cambios", "retirada"] as const)
    .find((e) => e === f.estado) ?? "borrador";
  return {
    id: f.id,
    tipo: f.tipo === "tv" ? "tv" : "movie",
    tmdbId: f.tmdb_id,
    titulo: f.titulo,
    anio: f.anio,
    poster: f.poster,
    borrador: { texto: f.texto, fuenteNombre: f.fuente_nombre, fuenteUrl: f.fuente_url, spoiler: f.spoiler },
    publicadaVersion: f.pub_texto == null ? null : {
      texto: f.pub_texto, fuenteNombre: f.pub_fuente_nombre ?? "",
      fuenteUrl: f.pub_fuente_url ?? "", spoiler: !!f.pub_spoiler,
    },
    publicada: f.publicada,
    publicadaEn: f.publicada_en,
    estado,
    actualizadaEn: f.updated_at,
  };
}

/**
 * Filas de `curiosidad_publicada` → lo que viaja a la ficha. Vuelve a validar:
 * una fila que no cumpla (no debería existir, la base lo impide) se descarta en
 * vez de llegar a un `href`.
 */
export function publicasDeFilas(filas: unknown): CuriosidadPublica[] {
  if (!Array.isArray(filas)) return [];
  const out: CuriosidadPublica[] = [];
  for (const f of filas as Array<Record<string, unknown>>) {
    const texto = normalizarTexto(f?.texto);
    const nombre = normalizarLinea(f?.fuente_nombre);
    const url = normalizarLinea(f?.fuente_url);
    if (!texto || !nombre || !urlFuenteValida(url)) continue;
    out.push({ texto, spoiler: f.spoiler === true, fuente: { nombre, url } });
  }
  return out;
}

/** Póster de TMDB aceptado para guardar (el mismo patrón que la base). */
export function posterValido(p: unknown): string | null {
  return typeof p === "string" && p.length <= 300
    && /^https:\/\/image\.tmdb\.org\/t\/p\/[A-Za-z0-9_]+\/[A-Za-z0-9_.-]+$/.test(p) ? p : null;
}

/** Texto de búsqueda del panel → patrón seguro para `ilike` (sin comodines del usuario). */
export function patronBusqueda(q: unknown): string | null {
  const t = normalizarLinea(q).slice(0, 80).replace(/[%_\\,()*]/g, " ").replace(/\s+/g, " ").trim();
  return t ? `%${t}%` : null;
}

/** Fecha corta en hora argentina, para "Publicada el …" del panel. */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Respuesta de `/api/curiosidad/…` → tarjetas, del lado del CLIENTE. Vuelve a
 * validar la forma y la URL: una respuesta rara (o de una versión futura de la
 * API) no puede poner un `href` peligroso ni romper la ficha; en el peor caso
 * la sección no aparece.
 */
export function publicasDeRespuesta(body: unknown): CuriosidadPublica[] {
  const lista = (body as { curiosidades?: unknown } | null)?.curiosidades;
  if (!Array.isArray(lista)) return [];
  return publicasDeFilas(lista.map((c: { texto?: unknown; spoiler?: unknown; fuente?: { nombre?: unknown; url?: unknown } }) => ({
    texto: c?.texto, spoiler: c?.spoiler, fuente_nombre: c?.fuente?.nombre, fuente_url: c?.fuente?.url,
  })));
}
