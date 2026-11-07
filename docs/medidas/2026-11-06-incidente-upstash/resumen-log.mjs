// Resume lo que el navegador real pidió a la app desde el último reset.
const reset = process.argv[2] === "reset" ? "?reset" : "";
const log = await (await fetch(`http://127.0.0.1:3141/__t${reset}`)).json();
const r = await (await fetch(`http://127.0.0.1:4804/__t${reset}`)).json();
const t = await (await fetch(`http://127.0.0.1:4805/__t${reset}`)).json();
const ruta = (p) => p.replace(/\/\d+/g, "/{id}").replace(/\/(movie|tv)\//, "/{tipo}/");
const c = {};
for (const e of log) { const k = `${ruta(e.p)}${e.prefetch ? " [prefetch]" : e.rsc ? " [rsc]" : ""}`; c[k] = (c[k] ?? 0) + 1; }
console.log(JSON.stringify({ pedidos: log.length, porRuta: c, redis: { comandos: r.comandos, porComando: r.porComando, set: r.setPorPrefijo }, tmdb: t.total }, null, 1));
