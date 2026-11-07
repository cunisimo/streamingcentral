// Restaura la copia `disp:` por título en lib/enrich.ts y conserva la lectura compartida. Falla si algún reemplazo no aplica.
import { readFileSync, writeFileSync } from "node:fs";
const f = "D:/DESARROLLO/stream central/wt-fichas/lib/enrich.ts";
const orig = readFileSync(f, "utf8");
const crlf = orig.includes("\r\n");
let s = orig.replace(/\r\n/g, "\n");
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error("no aplica: " + a.slice(0, 60)); s = s.replace(a, () => b); };
rep(`import { cached, cachedLoc, cachedLocIf, TTL, dailySeed, pickDaily } from "./cache";`,
    `import { cached, cachedIf, cachedLoc, cachedLocIf, TTL, dailySeed, pickDaily } from "./cache";`);
rep(` * Un \`fallo\` no queda guardado acá porque acá no se guarda nada: se avisa a las
 * cachés de afuera y el pedido siguiente vuelve a resolver.
`, ` * Un \`fallo\` NO se cachea: \`cachedIf\` deja pasar el valor y no lo guarda, así
 * que una caída de Supabase no congela un "no está en ningún lado".
`);
const ini = s.indexOf("  // Sin copia por título (`disp:<tipo>:<id>`)");
const finTxt = "  return r.plataformas;\n}\n";
const fin = s.indexOf(finTxt, ini);
if (ini < 0 || fin < 0) throw new Error("no encontré el bloque");
s = s.slice(0, ini) + `  let fallo = false;
  const res = await cachedIf(\`disp:\${type}:\${id}\`, TTL.editorial, async () => {
    const r = await resolverDisponibilidad({
      tipo: type, id, deTmdb: prov.codes, hayFlatrateAR: prov.hayFlatrateAR, hoy: hoyAR(),
      // El Top semanal cargado a mano. Va por el resolvedor central y no
      // por un camino propio de /top: si viviera sólo allá, la misma
      // película saldría en color en el Top y en gris en la ficha, la
      // búsqueda y el Home — el bug que este resolvedor existe para impedir.
      leerTopManual,
      leerDatosTitulo: () => datosTituloDe(type, id, prov.reg ?? { rt: 0, rp: {}, ru: 0 }),
    });
    fallo = r.fallo;
    // La señal sale de esta función y llega a las cachés de AFUERA. Sin esto,
    // \`disp:\` no se guardaba pero la card, el Home y la lista sí — con el
    // título en gris adentro, por 24 h, 6 h y 8 h respectivamente.
    if (r.fallo) registrarFalloDisponibilidad();
    if (r.procedencia && r.procedencia !== "tmdb-ar") {
      console.log(\`[disponibilidad] \${type}:\${id} -> \${r.plataformas.join(",")} (\${r.procedencia})\`);
    }
    return r.plataformas;
  }, () => !fallo);
  return res;
}
` + s.slice(fin + finTxt.length);
writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("ok, crlf:", crlf);
