// Perfiles de prueba del harness. Son títulos del CATÁLOGO, no datos de nadie.
// `rango` sale del orden de la lista (el primero es el más reciente).
// `q` se resuelve con la búsqueda de TMDB al capturar: así no se adivinan ids.
const T = (tipo, q, peso, anio) => ({ tipo, q, peso, anio });

const SIMPSONS = T("tv", "The Simpsons", 2, 1989);
const CRIMEN = [
  T("tv", "Breaking Bad", 2, 2008), T("tv", "Narcos", 2, 2015), T("movie", "The Godfather", 2, 1972),
  T("movie", "Goodfellas", 2, 1990), T("tv", "Ozark", 2, 2017), T("tv", "Peaky Blinders", 2, 2013),
];
const VARIADOS = [
  T("movie", "Parasite", 2, 2019), T("tv", "Stranger Things", 2, 2016), T("tv", "Dark", 2, 2017),
  T("movie", "Interstellar", 2, 2014), T("tv", "The Office", 2, 2005),
];

export const PERFILES = [
  { id: "P1", nombre: "1 gusto: Los Simpson", senales: [SIMPSONS] },
  { id: "P2", nombre: "1 gusto: Breaking Bad", senales: [T("tv", "Breaking Bad", 2, 2008)] },
  { id: "P3", nombre: "2 de animación adulta", senales: [SIMPSONS, T("tv", "Family Guy", 2, 1999)] },
  {
    id: "P4", nombre: "6 variados, Los Simpson Petacular",
    senales: [{ ...SIMPSONS, peso: 3 }, CRIMEN[0], VARIADOS[0], CRIMEN[2], VARIADOS[1], VARIADOS[2]],
  },
  {
    id: "P5", nombre: "6 del mismo tema (crimen)",
    senales: [{ ...CRIMEN[0], peso: 3 }, CRIMEN[1], { ...CRIMEN[2], peso: 3 }, CRIMEN[3], CRIMEN[4], CRIMEN[5]],
  },
  {
    id: "P6", nombre: "12 señales: 6 de crimen + 6 variadas",
    senales: [...CRIMEN, SIMPSONS, ...VARIADOS],
  },
  {
    id: "P6b", nombre: "P6 + un voto nuevo de crimen (Petacular)",
    senales: [T("tv", "Better Call Saul", 3, 2015), ...CRIMEN, SIMPSONS, ...VARIADOS],
  },
  {
    id: "P7", nombre: "familiar",
    senales: [T("tv", "Bluey", 3, 2018), T("movie", "Toy Story", 2, 1995), T("movie", "Moana", 2, 2016)],
  },
  {
    id: "P8", nombre: "1 familiar + 5 adultos",
    senales: [T("tv", "Bluey", 2, 2018), CRIMEN[0], VARIADOS[0], VARIADOS[2], T("tv", "The Crown", 2, 2016), T("tv", "Succession", 2, 2018)],
  },
  {
    id: "P9", nombre: "anime",
    senales: [T("tv", "Attack on Titan", 3, 2013), T("movie", "Your Name.", 2, 2016), T("movie", "Spirited Away", 2, 2001)],
  },
];

export const PLATAFORMAS = [["n", "d", "m"], ["n"]];
