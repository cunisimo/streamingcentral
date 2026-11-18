// El editor del Top semanal (dashboard `/admin/top`): reglas del ranking y el
// sincronizador que guarda los cambios. PURO y apto para el cliente: no importa
// Supabase ni React, así que se prueba con `node --test`.
//
// ============================================================================
// POR QUÉ HAY UN SINCRONIZADOR Y NO UN `await` POR BOTÓN
// ============================================================================
// Antes cada flecha mandaba un movimiento RELATIVO (`desde`, `hasta`) y el
// servidor lo aplicaba sobre lo que hubiera en la base en ese momento. Con
// arrastres rápidos eso se rompe: dos pedidos en vuelo pueden partir de bases
// distintas, y una respuesta vieja que llega tarde pisa en pantalla el último
// movimiento.
//
// Ahora:
//  1. **El cliente manda el orden ABSOLUTO** (las posiciones completas). Aplicar
//     dos veces lo mismo da lo mismo, y el servidor sólo lo acepta si es una
//     permutación exacta de lo que hay en la base (`validarNuevoOrden`): no se
//     puede perder ni duplicar un título.
//  2. **Una sola operación en vuelo por vez**, en orden. Los reordenamientos
//     seguidos del mismo bloque que todavía no salieron se FUNDEN en uno: sólo
//     viaja el último orden.
//  3. **Lo que se ve = lo confirmado + lo pendiente reaplicado** (`vista()`).
//     Cuando llega una respuesta, el estado confirmado se reemplaza y las
//     operaciones que siguen en la cola se vuelven a aplicar encima: una
//     respuesta no puede deshacer un movimiento posterior.
//  4. **Un fallo detiene la cola y conserva lo pendiente.** El admin elige
//     reintentar (se reenvía desde la operación fallida) o descartar (vuelve al
//     último estado confirmado).
import type { MediaType, PlatformCode } from "./types";
import type { EntradaTop } from "./top-manual-nucleo";

/** Los puestos de un bloque. */
export const PUESTOS = 10;

export interface RankingFila {
  id: string;
  plataforma: PlatformCode;
  tipo: MediaType;
  estado: "borrador" | "publicado";
  captured_at: string;
  /** Columna derivada de la base (`revisado_por is not null`). */
  revisado: boolean;
  entradas: EntradaTop[];
}

export const claveTitulo = (e: { tipo: string; tmdb_id: number }) => `${e.tipo}:${e.tmdb_id}`;

// ============================================================================
// Reglas del ranking
// ============================================================================

/** Las diez posiciones como casilleros: `null` = puesto libre. */
export function casilleros(entradas: readonly EntradaTop[]): (EntradaTop | null)[] {
  const s: (EntradaTop | null)[] = Array.from({ length: PUESTOS }, () => null);
  for (const e of entradas) {
    if (Number.isInteger(e.posicion) && e.posicion >= 1 && e.posicion <= PUESTOS) s[e.posicion - 1] = e;
  }
  return s;
}

/** El primer puesto libre, o `null` si están los diez. */
export function primerLibre(entradas: readonly EntradaTop[]): number | null {
  const i = casilleros(entradas).findIndex((e) => e === null);
  return i === -1 ? null : i + 1;
}

/** En qué puesto está un título dentro del bloque, o `null`. */
export function puestoDe(entradas: readonly EntradaTop[], tipo: string, tmdbId: number): number | null {
  return entradas.find((e) => e.tipo === tipo && e.tmdb_id === tmdbId)?.posicion ?? null;
}

/**
 * Mover un título de un puesto a otro: los intermedios se corren y la numeración
 * se recalcula.
 *
 * Trabaja sobre los DIEZ CASILLEROS, no sobre la lista compacta. Con el bloque
 * completo es exactamente `posicionesDeReordenar` (mover el 8 al 2 corre el 2…7
 * un lugar hacia abajo). Con el bloque incompleto, los puestos libres se
 * mueven igual que un título: nunca se compacta el bloque ni se mueve un título
 * que nadie tocó fuera del tramo entre `desde` y `hasta`. Es la regla que
 * faltaba para poder ordenar mientras se carga la semana —antes las flechas se
 * apagaban hasta tener los diez—.
 *
 * Mover un puesto vacío, un destino fuera de rango o `desde === hasta` devuelve
 * las posiciones intactas: en un arrastre eso es un gesto fallido, no un error.
 */
export function moverEnCasilleros(entradas: readonly EntradaTop[], desde: number, hasta: number): EntradaTop[] {
  const ok = (x: number) => Number.isInteger(x) && x >= 1 && x <= PUESTOS;
  const orden = [...entradas].sort((a, b) => a.posicion - b.posicion);
  const s = casilleros(entradas);
  if (!ok(desde) || !ok(hasta) || desde === hasta || !s[desde - 1]) return orden;
  const [movido] = s.splice(desde - 1, 1);
  s.splice(hasta - 1, 0, movido);
  const out: EntradaTop[] = [];
  s.forEach((e, i) => { if (e) out.push({ ...e, posicion: i + 1 }); });
  return out;
}

/**
 * ¿Es `propuestas` un orden válido de `actuales`? Devuelve el motivo del rechazo
 * o `null`. Lo usa el SERVIDOR antes de reemplazar las entradas.
 *
 * Exige los MISMOS títulos —ni uno más, ni uno menos, ni repetidos— en puestos
 * enteros del 1 al 10 sin repetir. Es lo que impide que un cliente con un estado
 * viejo (otra pestaña, una respuesta perdida) borre un título que ya no conoce o
 * duplique uno: un orden sólo puede MOVER lo que hay.
 */
export function validarNuevoOrden(actuales: readonly EntradaTop[], propuestas: readonly EntradaTop[]): string | null {
  if (!Array.isArray(propuestas)) return "orden inválido";
  const posiciones = new Set<number>();
  for (const p of propuestas) {
    if (!p || !Number.isInteger(p.posicion) || p.posicion < 1 || p.posicion > PUESTOS) return "hay posiciones fuera de 1..10";
    if (posiciones.has(p.posicion)) return "hay dos títulos en el mismo puesto";
    posiciones.add(p.posicion);
  }
  const a = new Set(actuales.map(claveTitulo));
  const b = propuestas.map(claveTitulo);
  if (new Set(b).size !== b.length) return "hay un título repetido";
  if (a.size !== b.length || b.some((k) => !a.has(k))) {
    return "el bloque cambió desde que se cargó la pantalla (¿otra pestaña?)";
  }
  return null;
}

/**
 * Las entradas a escribir para un orden ya validado. El título sale de la BASE,
 * no del pedido: reordenar no puede, de paso, cambiarle el nombre a nadie.
 */
export function entradasDeOrden(actuales: readonly EntradaTop[], propuestas: readonly EntradaTop[]): EntradaTop[] {
  const porClave = new Map(actuales.map((e) => [claveTitulo(e), e]));
  return propuestas
    .map((p) => ({ ...porClave.get(claveTitulo(p))!, posicion: p.posicion }))
    .sort((x, y) => x.posicion - y.posicion);
}

// ============================================================================
// Operaciones y su efecto local (optimista)
// ============================================================================

export type OpTop =
  | { k: "ordenar"; id: string; entradas: EntradaTop[] }
  | { k: "agregar"; id: string; entrada: EntradaTop }
  | { k: "reemplazar"; id: string; entrada: EntradaTop; reemplaza: { tipo: MediaType; tmdb_id: number } }
  | { k: "revisar"; id: string; revisado: boolean }
  | { k: "fecha"; id: string; fecha: string }
  // Sin efecto local previsible: el resultado lo dice la respuesta.
  | { k: "restaurar"; id: string }
  | { k: "corregir"; id: string };

/** El cuerpo que espera `POST /api/admin/top` para cada operación. */
export function cuerpoDe(op: OpTop): Record<string, unknown> {
  switch (op.k) {
    case "ordenar": return { accion: "ordenar", id: op.id, entradas: op.entradas.map(({ posicion, tipo, tmdb_id }) => ({ posicion, tipo, tmdb_id })) };
    case "agregar": return { accion: "agregar", id: op.id, entrada: op.entrada };
    case "reemplazar": return { accion: "reemplazar", id: op.id, entrada: op.entrada, reemplaza: op.reemplaza };
    case "revisar": return { accion: "revisar", id: op.id, revisado: op.revisado };
    case "fecha": return { accion: "fecha", id: op.id, fecha: op.fecha };
    case "restaurar": return { accion: "restaurar", id: op.id };
    case "corregir": return { accion: "corregir", id: op.id };
  }
}

/** ¿La operación cambia el contenido del bloque? Si sí, desmarca la aprobación. */
const cambiaContenido = (op: OpTop) => op.k !== "revisar";

/**
 * El efecto local de una operación. Imita lo que hará la base, incluido el
 * trigger que desmarca la revisión ante cualquier cambio de contenido o de
 * fecha: si el panel mostrara "Aprobada" hasta que llegue la respuesta, por un
 * momento diría algo que la base ya no cumple.
 */
export function aplicarOp(borradores: readonly RankingFila[], op: OpTop): RankingFila[] {
  return borradores.map((b) => {
    if (b.id !== op.id) return b;
    const revisado = cambiaContenido(op) ? false : b.revisado;
    switch (op.k) {
      case "ordenar":
        return { ...b, revisado, entradas: [...op.entradas].sort((x, y) => x.posicion - y.posicion) };
      case "agregar":
        return { ...b, revisado, entradas: [...b.entradas.filter((e) => e.posicion !== op.entrada.posicion), op.entrada].sort((x, y) => x.posicion - y.posicion) };
      case "reemplazar":
        return { ...b, revisado, entradas: b.entradas.map((e) => (e.posicion === op.entrada.posicion ? op.entrada : e)) };
      case "revisar":
        return { ...b, revisado: op.revisado };
      case "fecha":
        return { ...b, revisado, captured_at: op.fecha };
      default:
        return { ...b, revisado };
    }
  });
}

// ============================================================================
// El sincronizador
// ============================================================================

export interface FalloGuardado {
  op: OpTop;
  mensaje: string;
  /** El servidor rechazó por conflicto (409): reintentar no sirve, hay que recargar. */
  conflicto: boolean;
}

export interface EstadoSync {
  confirmado: RankingFila[];
  /** La primera puede estar en vuelo. */
  pendientes: OpTop[];
  enVuelo: boolean;
  fallo: FalloGuardado | null;
  /** Cuándo terminó bien la última escritura (ms), para "Guardado". */
  ultimoOk: number | null;
}

/**
 * Cola de escrituras con una sola en vuelo. Ver el encabezado del archivo.
 *
 * `enviar` recibe una operación y devuelve los borradores tal como quedaron en
 * la base (la ruta siempre responde el estado completo). `avisar` se llama
 * después de cada cambio de estado, para que la interfaz se redibuje.
 */
export class SincronizadorTop {
  private s: EstadoSync;
  private enviar: (op: OpTop) => Promise<RankingFila[]>;
  private avisar: () => void;
  // Campos explícitos, sin "parameter properties": node --test sólo quita
  // tipos y esa sintaxis necesita transformarse.
  constructor(
    enviar: (op: OpTop) => Promise<RankingFila[]>,
    avisar: () => void = () => {},
    inicial: RankingFila[] = [],
  ) {
    this.enviar = enviar;
    this.avisar = avisar;
    this.s = { confirmado: inicial, pendientes: [], enVuelo: false, fallo: null, ultimoOk: null };
  }

  get estado(): Readonly<EstadoSync> { return this.s; }

  /** Lo que se dibuja: lo confirmado con lo pendiente reaplicado encima. */
  vista(): RankingFila[] {
    return this.s.pendientes.reduce(aplicarOp, this.s.confirmado);
  }

  /** ¿Hay algo sin confirmar o fallido? Publicar y recargar esperan a que no. */
  ocupado(): boolean {
    return this.s.pendientes.length > 0 || !!this.s.fallo;
  }

  /** Reemplaza lo confirmado con una lectura completa. Sólo con la cola vacía. */
  cargar(borradores: RankingFila[]): boolean {
    if (this.ocupado() || this.s.enVuelo) return false;
    this.s = { ...this.s, confirmado: borradores };
    this.avisar();
    return true;
  }

  encolar(op: OpTop): void {
    const p = [...this.s.pendientes];
    const ultima = p[p.length - 1];
    // Fundir: un orden nuevo del MISMO bloque reemplaza al anterior que todavía
    // no salió (la cabeza en vuelo no se toca). Viaja sólo el último orden.
    const enVueloEsUltima = this.s.enVuelo && p.length === 1;
    if (op.k === "ordenar" && ultima?.k === "ordenar" && ultima.id === op.id && !enVueloEsUltima) {
      p[p.length - 1] = op;
    } else {
      p.push(op);
    }
    this.s = { ...this.s, pendientes: p };
    this.avisar();
    this.siguiente();
  }

  /** Reenvía desde la operación fallida, con lo que haya detrás. */
  reintentar(): void {
    if (!this.s.fallo) return;
    this.s = { ...this.s, fallo: null };
    this.avisar();
    this.siguiente();
  }

  /**
   * Descarta lo pendiente y vuelve al último estado confirmado. No hace nada
   * con una escritura en vuelo: su resultado todavía no se conoce.
   */
  descartar(): boolean {
    if (this.s.enVuelo) return false;
    this.s = { ...this.s, pendientes: [], fallo: null };
    this.avisar();
    return true;
  }

  private siguiente(): void {
    if (this.s.enVuelo || this.s.fallo || !this.s.pendientes.length) return;
    const op = this.s.pendientes[0];
    this.s = { ...this.s, enVuelo: true };
    this.avisar();
    this.enviar(op).then(
      (borradores) => {
        // La cabeza es `op`: nada la saca de ahí mientras está en vuelo (fundir
        // no la toca y descartar espera). El resto se reaplica en `vista()`.
        this.s = {
          ...this.s, confirmado: borradores, pendientes: this.s.pendientes.slice(1),
          enVuelo: false, ultimoOk: Date.now(),
        };
        this.avisar();
        this.siguiente();
      },
      (e: unknown) => {
        this.s = {
          ...this.s, enVuelo: false,
          fallo: { op, mensaje: mensajeDeError(e), conflicto: (e as { conflicto?: unknown } | null)?.conflicto === true },
        };
        this.avisar();
      },
    );
  }
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ============================================================================
// Búsqueda
// ============================================================================

/** ¿Vale la pena mostrar el título original? Sólo si difiere del visible. */
export function originalDistinto(titulo: string, original: string | null | undefined): boolean {
  if (!original) return false;
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return n(titulo) !== n(original);
}

/** Cambia el tamaño de una URL de póster de TMDB (`/w500/` → `/w185/`). */
export function posterTam(url: string | null, tam: "w185" | "w342" | "w500" | "w780"): string | null {
  return url ? url.replace(/\/(w\d+|original)\//, `/${tam}/`) : null;
}
