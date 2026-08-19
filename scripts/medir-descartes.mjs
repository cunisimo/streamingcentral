#!/usr/bin/env node
// ¿Un descarte de "No es para mí" invalida el cache del recomendador?
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-descartes.mjs
//
// La pregunta no es retórica: la clave de cache del riel es un hash de
// (señales, excluir, providers) —ver `reco.ts`—, así que TODO lo que se meta en
// `excluir` invalida el riel entero. El diseño elegido deja los descartes fuera
// y los filtra en el cliente; este arnés mide las dos alternativas contra el
// mismo pool para que la diferencia sea un número y no una opinión.
//
// PRIVACIDAD: las señales son títulos del catálogo pasados a mano acá abajo. No
// lee `votes` ni `user_items` de nadie y no imprime nada que identifique a una
// persona.
import { recomendaciones } from "../lib/reco.ts";
import { withCacheMetrics } from "../lib/cache.ts";

const PROVIDERS = ["n", "d", "m"];

// Señales de muestra: títulos del catálogo, no de un usuario real.
const SENALES = [
  { tipo: "movie", id: 496243, peso: 3 },  // Parásitos
  { tipo: "tv", id: 100088, peso: 3 },     // The Last of Us
  { tipo: "movie", id: 27205, peso: 2 },   // El origen
  { tipo: "tv", id: 1396, peso: 2 },       // Breaking Bad
];

// Lo que el cliente manda hoy en `excluir`: votos + Mi lista + Ya la vi + lo que
// ya está en el Home.
const EXCLUIR_BASE = [
  ...SENALES.map((s) => `${s.tipo}:${s.id}`),
  "movie:238", "movie:155", "tv:1399", "movie:680", "tv:66732",
];

async function medir(etiqueta, excluir) {
  const { res, metricas } = await withCacheMetrics(() =>
    recomendaciones({ senales: SENALES, excluir, providers: PROVIDERS }));
  const total = metricas.hits + metricas.misses;
  console.log(
    `${etiqueta.padEnd(34)} ${String(res.items.length).padStart(2)} títulos · ` +
    `${String(metricas.comandos).padStart(4)} comandos · ` +
    `${String(metricas.requests).padStart(3)} viajes · ` +
    `${metricas.hits}/${total} hits`,
  );
  return metricas;
}

console.log("\nCada línea es una llamada al riel. Lo que importa es la 2ª contra la 3ª.\n");

// 1. Primera carga: llena el cache del riel.
await medir("1. carga inicial (llena)", EXCLUIR_BASE);

// 2. Recarga sin tocar nada: el HIT de referencia. Este es el piso.
const control = await medir("2. recarga sin descartar", EXCLUIR_BASE);

// 3. Recarga DESPUÉS de descartar, con el diseño elegido: el descarte no viaja,
//    así que el pedido es idéntico al de la línea 2 y tiene que dar lo mismo.
const elegido = await medir("3. recarga tras descartar (hoy)", EXCLUIR_BASE);

// 4. Lo que habría costado el diseño que descartamos: el descarte dentro de
//    `excluir`, o sea clave nueva y rearmado completo.
const alternativa = await medir("4. ídem, si viajara en excluir", [...EXCLUIR_BASE, "movie:9999999"]);

console.log("");
const igual = elegido.comandos === control.comandos && elegido.requests === control.requests;
console.log(igual
  ? "✔ Descartar NO cambia el costo de la carga siguiente: idéntico al control."
  : `✘ Descartar cambió el costo: ${control.comandos} → ${elegido.comandos} comandos.`);
console.log(`  El diseño descartado habría costado ${alternativa.comandos} comandos ` +
            `(${(alternativa.comandos / Math.max(control.comandos, 1)).toFixed(0)}× el control) por cada descarte.`);
// El número de la línea 4 es el MEJOR caso de esa alternativa, no el típico: la
// línea 1 acaba de dejar calientes los caches POR TÍTULO, así que ahí solo falla
// la clave del riel. Cuando esos caches ya expiraron —TTL propio, y en local no
// hay Upstash: `viajes 0` significa cache en memoria, que además se borra con el
// proceso— el rearmado se parece más a la línea 1. O sea que la alternativa
// costaba entre 6 y 108 comandos por descarte, contra 1 del diseño elegido.
console.log("");
