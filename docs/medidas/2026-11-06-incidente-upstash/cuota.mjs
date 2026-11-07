// Visitas por día = presupuesto / (c·fría + (1-c)·tibia). Costos medidos: documento + API, 20 relacionados.
const P = 16667;
const costo = {
  "producción": { con: [32, 8], sin: [140, 36], pc: [16, 4], ps: [84, 42] },
  "rama":       { con: [32, 8], sin: [83, 36],  pc: [16, 4], ps: [66, 42] },
  "rama + sin disp:": { con: [32, 8], sin: [60, 13], pc: [16, 4], ps: [53, 29] },
  "rama + sin disp: + top-manual": { con: [32, 8], sin: [60, 13], pc: [16, 4], ps: [31, 7] },
};
const mezcla = (v, a, A, B) => [0, 1].map((i) => a * v[A][i] + (1 - a) * v[B][i]);
for (const reserva of [0.3, 0.5]) {
  const b = P * (1 - reserva);
  console.log(`\nreserva ${reserva * 100}% -> ${Math.round(b)} cmd/día`);
  for (const [n, v] of Object.entries(costo)) {
    for (const [et, par] of [["ficha con AR", v.con], ["ficha sin AR", v.sin], ["ficha 70/30", mezcla(v, 0.7, "con", "sin")], ["persona 70/30", mezcla(v, 0.7, "pc", "ps")]]) {
      const f = [1, 0.5, 0.2, 0.1, 0.05].map((c) => Math.round(b / (c * par[0] + (1 - c) * par[1])));
      console.log(n.padEnd(32), et.padEnd(14), `[${par.map((x) => x.toFixed(1))}]`.padEnd(14), f.join("  "));
    }
  }
}
