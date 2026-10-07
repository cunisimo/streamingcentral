// Ejecución de una corrida de mantenimiento de la ruleta.
//
// Tres fases, en este orden, cada una saltable:
//   descubrir      → páginas de discover (todas las de cada ventana, un orden)
//   enriquecer     → detalle SOLO de títulos nuevos o con datos faltantes, y
//                    colección SOLO de sagas que no se conocían
//   disponibilidad → `/watch/providers` SOLO de títulos con disponibilidad
//                    vencida (más vieja que el TTL)
//
// Cada operación terminada se anota en el diario antes de pasar a la otra. Si
// algo corta la corrida (presupuesto, Ctrl+C, un fallo), NO se toca el estado:
// se devuelve `completo: false` y la próxima corrida retoma desde el diario.
// Sólo una corrida sin pendientes ni fallos produce el estado nuevo.

import { PresupuestoAgotado, FalloTmdb } from "./cliente-tmdb.mjs";
import {
  FAMILIAS, IDIOMA, paramsDescubrir, claveDescubrir, claveDetalle, claveDisp, claveColeccion,
  construirTitulo, proveedoresDe, esSecuelaInferida, sagaDeColeccion, dispVencida, faltanDatos,
  descarteVigente, progresoDesdeDiario,
} from "./nucleo.mjs";

export class Interrumpido extends Error {
  constructor() { super("interrumpido"); this.name = "Interrumpido"; }
}

/**
 * @param {object} p
 * @param {object} p.estado       estado actual (no se modifica)
 * @param {object} p.diario       diario de operaciones (persistente o en memoria)
 * @param {object} p.cliente      cliente de TMDB (cliente-tmdb.mjs)
 * @param {object} p.cfg          { fases, ttlDispDias, ttlDescartesDias, maxDisponibilidad, ahoraMs }
 * @param {() => boolean} [p.detener]  true si hay que cortar (Ctrl+C)
 */
export async function ejecutar({ estado, diario, cliente, cfg, detener = () => false, log = () => {} }) {
  const ahoraIso = new Date(cfg.ahoraMs).toISOString();
  const fallos = [];
  let corte = null;
  const progreso = {};

  // Una operación: si ya está en el diario no se pide. Devuelve el resultado
  // anotado, o `undefined` si falló (queda pendiente para la próxima corrida).
  async function operacion(clave, hacer) {
    if (diario.tiene(clave)) return diario.leer(clave);
    if (detener()) throw new Interrumpido();
    try {
      const r = await hacer();
      diario.anotar(clave, r);
      return r;
    } catch (e) {
      if (e instanceof PresupuestoAgotado || e instanceof Interrumpido) throw e;
      if (e instanceof FalloTmdb) { fallos.push({ clave, error: e.message }); return undefined; }
      throw e;
    }
  }

  const titulos = estado.titulos;
  // id → { familia, fams, wp, wc, vc, va, pop }. `familia` es la primera que lo
  // encontró (principal se recorre antes y no tiene filtro de duración); `fams`
  // y las ventanas (wp = principal, wc = cortas) son lo que usa la selección.
  const candidatos = new Map();
  let sagasNuevas = {};

  try {
    // ── 1. Descubrir ──────────────────────────────────────────────────────
    if (cfg.fases.descubrir) {
      let hechas = 0;
      for (const [fam, f] of Object.entries(FAMILIAS)) {
        for (const v of f.ventanas) {
          let total = 1;
          for (let pagina = 1; pagina <= total; pagina++) {
            const r = await operacion(claveDescubrir(fam, v, pagina), async () => {
              const data = await cliente.pedir("descubrir", "/discover/movie", paramsDescubrir(fam, v, pagina));
              return {
                total_pages: Math.min(data?.total_pages ?? 1, 500),
                items: (data?.results ?? []).map((x) => ({ id: x.id, vc: x.vote_count, va: x.vote_average, pop: x.popularity })),
              };
            });
            if (!r) break; // falló esta página: el resto de la ventana queda pendiente
            hechas++;
            total = r.total_pages;
            const ventana = `${v[0].slice(0, 4)}-${v[1].slice(0, 4)}`;
            for (const it of r.items) acumularCandidato(candidatos, fam, ventana, it);
          }
        }
      }
      progreso.descubrir = { paginas: hechas, candidatos: candidatos.size };
      log(`descubrir: ${hechas} páginas, ${candidatos.size} candidatos`);
    } else if (estado.descubrimiento?.candidatos) {
      // Descubrimiento de una corrida anterior: se reutiliza sin pedir nada.
      for (const [id, c] of Object.entries(estado.descubrimiento.candidatos)) {
        candidatos.set(Number(id), { ...c, id: Number(id), familia: c.fams[0], reutilizado: true });
      }
      progreso.descubrir = { reutilizado: estado.descubrimiento.at, candidatos: candidatos.size };
    }

    // ── 2. Enriquecer ─────────────────────────────────────────────────────
    const nuevos = [];
    const descartados = {};
    let descartesReusados = 0;
    if (cfg.fases.enriquecer) {
      const objetivo = [];
      for (const [id, c] of candidatos) {
        if (titulos[id]) continue;
        if (descarteVigente(estado.descartados[id], cfg.ahoraMs, cfg.ttlDescartesDias)) { descartesReusados++; continue; }
        objetivo.push({ id, familia: c.familia });
      }
      const faltantes = Object.values(titulos).filter(faltanDatos).map((t) => ({ id: t.tmdb_id, familia: t.familia ?? "principal", existente: true }));

      for (const o of [...objetivo, ...faltantes]) {
        const r = await operacion(claveDetalle(o.id), async () => {
          const d = await cliente.pedir("detalle", `/movie/${o.id}`, {
            language: IDIOMA, append_to_response: "release_dates,watch/providers",
          });
          return construirTitulo(d, o.familia, ahoraIso);
        });
        if (!r) continue;
        if (r.descartado) descartados[o.id] = { motivo: r.descartado, at: ahoraIso };
        else nuevos.push({ ...r.titulo, _existente: !!o.existente });
      }

      // Sagas de los nuevos: primero lo que ya se sabe; colección sólo si no alcanza.
      for (const t of nuevos) {
        if (!t.coleccion) continue;
        const cid = t.coleccion.id;
        let saga = sagasNuevas[cid] ?? estado.sagas[cid];
        let sec = esSecuelaInferida(saga, t);
        if (sec === null) {
          const col = await operacion(claveColeccion(cid), async () =>
            sagaDeColeccion(await cliente.pedir("coleccion", `/collection/${cid}`, { language: IDIOMA }), ahoraIso));
          if (!col) continue;
          saga = sagasNuevas[cid] = { ...(estado.sagas[cid] ?? {}), ...col };
          sec = esSecuelaInferida(saga, t) ?? false;
        }
        t.es_secuela = sec;
        t.coleccion_at = ahoraIso;
      }
      progreso.enriquecer = {
        objetivo: objetivo.length, faltantes: faltantes.length, incorporados: nuevos.filter((t) => !t._existente).length,
        descartados: Object.keys(descartados).length, descartesReusados, sagasConsultadas: Object.keys(sagasNuevas).length,
      };
      log(`enriquecer: ${progreso.enriquecer.incorporados} nuevos, ${progreso.enriquecer.descartados} descartados`);
    }

    // ── 3. Disponibilidad ─────────────────────────────────────────────────
    const disp = {};
    if (cfg.fases.disponibilidad) {
      const vencidas = Object.values(titulos)
        .filter((t) => dispVencida(t, cfg.ahoraMs, cfg.ttlDispDias))
        // Lo más viejo primero: si el presupuesto corta, cortó en lo más fresco.
        .sort((a, b) => (a.disp_at ?? "").localeCompare(b.disp_at ?? "") || a.tmdb_id - b.tmdb_id)
        .slice(0, cfg.maxDisponibilidad ?? Infinity);
      for (const t of vencidas) {
        const r = await operacion(claveDisp(t.tmdb_id), async () => {
          const wp = await cliente.pedir("disponibilidad", `/movie/${t.tmdb_id}/watch/providers`);
          return { providers: wp ? proveedoresDe(wp) : [], at: ahoraIso, existe: !!wp };
        });
        if (r) disp[t.tmdb_id] = r;
      }
      progreso.disponibilidad = { objetivo: vencidas.length, hechas: Object.keys(disp).length };
      log(`disponibilidad: ${Object.keys(disp).length}/${vencidas.length}`);
    }

    if (fallos.length) return { completo: false, motivo: "fallos", fallos, progreso: progresoDesdeDiario(diario.entradas(), estado, cfg) };
    return {
      completo: true, fallos, progreso,
      ...fusionar(estado, { candidatos, nuevos, descartados, disp, sagasNuevas, ahoraIso, cfg }),
    };
  } catch (e) {
    if (e instanceof PresupuestoAgotado) corte = "presupuesto";
    else if (e instanceof Interrumpido) corte = "interrumpido";
    else throw e;
    // El progreso en memoria se arma al final de cada fase, así que una fase
    // cortada a la mitad no lo tiene: se reconstruye del diario, que es lo real.
    return { completo: false, motivo: corte, fallos, progreso: progresoDesdeDiario(diario.entradas(), estado, cfg) };
  }
}

/**
 * Estado nuevo + diferencias. Pura: no toca `estado`.
 * Los textos editoriales no viven en el estado (están en copy-ruleta.json y en
 * la base): ninguna fusión puede tocarlos. `con_texto` se conserva tal cual.
 */
/** Suma un ítem de discover al inventario de candidatos de la corrida. */
export function acumularCandidato(candidatos, fam, ventana, it) {
  const c = candidatos.get(it.id) ?? { id: it.id, familia: fam, fams: [], wp: null, wc: null, vc: it.vc, va: it.va, pop: it.pop };
  if (!c.fams.includes(fam)) c.fams.push(fam);
  if (fam === "principal") c.wp = ventana; else c.wc = ventana;
  candidatos.set(it.id, c);
}

export function fusionar(estado, { candidatos, nuevos, descartados, disp, sagasNuevas, ahoraIso, cfg }) {
  const sig = structuredClone(estado);
  const pendientes = new Set(sig.metadatos_pendientes_sql ?? []);
  const dif = { incorporados: [], datosCompletados: [], metadatosDesdeDescubrir: 0, disponibilidad: { cambiadas: [], sinPlataforma: [], sinCambios: 0 }, descartados: Object.keys(descartados).length, noReaparecen: 0 };

  // Metadatos gratis: lo que discover ya trajo de los títulos existentes.
  for (const [id, c] of candidatos) {
    const t = sig.titulos[id];
    if (!t || c.reutilizado) continue;
    if (t.vote_count !== c.vc || t.vote_average !== c.va) {
      t.vote_count = c.vc; t.vote_average = c.va; t.popularity = c.pop;
      dif.metadatosDesdeDescubrir++;
      // Todavía no fueron a ningún SQL: quedan anotados hasta la próxima carga.
      pendientes.add(Number(id));
    }
  }
  const descubiertoAhora = [...candidatos.values()].some((c) => !c.reutilizado);
  if (descubiertoAhora) dif.noReaparecen = Object.keys(sig.titulos).filter((id) => !candidatos.has(Number(id))).length;

  for (const n of nuevos) {
    const { _existente, ...t } = n;
    if (_existente) {
      const prev = sig.titulos[t.tmdb_id];
      sig.titulos[t.tmdb_id] = { ...t, con_texto: prev.con_texto, coleccion: prev.coleccion ?? t.coleccion, es_secuela: prev.es_secuela ?? t.es_secuela, coleccion_at: prev.coleccion_at ?? t.coleccion_at, familia: prev.familia ?? t.familia };
      dif.datosCompletados.push(t.tmdb_id);
    } else {
      sig.titulos[t.tmdb_id] = t;
      dif.incorporados.push({ tmdb_id: t.tmdb_id, title: t.title, year: t.year, familia: t.familia, providers: t.providers, es_secuela: t.es_secuela });
    }
  }
  for (const [id, d] of Object.entries(descartados)) sig.descartados[id] = d;
  for (const [cid, s] of Object.entries(sagasNuevas)) sig.sagas[cid] = s;

  for (const [id, r] of Object.entries(disp)) {
    const t = sig.titulos[id];
    const antes = [...(t.providers ?? [])].sort();
    const despues = [...r.providers].sort();
    if (JSON.stringify(antes) !== JSON.stringify(despues)) {
      dif.disponibilidad.cambiadas.push({
        tmdb_id: Number(id), title: t.title,
        suman: despues.filter((p) => !antes.includes(p)), pierden: antes.filter((p) => !despues.includes(p)),
      });
      if (!despues.length) dif.disponibilidad.sinPlataforma.push(Number(id));
    } else dif.disponibilidad.sinCambios++;
    t.providers = r.providers;
    t.disp_at = r.at;
  }

  sig.metadatos_pendientes_sql = [...pendientes].sort((a, b) => a - b);
  sig.ultima_corrida = { at: ahoraIso, ttl_disp_dias: cfg.ttlDispDias };
  if (descubiertoAhora) {
    sig.descubrimiento = {
      at: ahoraIso,
      candidatos: Object.fromEntries([...candidatos].map(([id, c]) => [id, { fams: c.fams, wp: c.wp, wc: c.wc, vc: c.vc, va: c.va, pop: c.pop }])),
    };
  }
  return { estado: sig, diferencias: dif, dispActualizada: disp };
}
