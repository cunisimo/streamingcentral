// Datos client-safe (sin imports de servidor).
export const GENRES: [string, string][] = [
  ["todos", "Todo"], ["accion", "Acción"], ["drama", "Drama"], ["comedia", "Comedia"],
  ["terror", "Terror"], ["scifi", "Sci-fi"], ["suspenso", "Suspenso"], ["crimen", "Crimen"],
  ["animacion", "Animación"], ["aventura", "Aventura"], ["misterio", "Misterio"],
  ["documental", "Documental"], ["romance", "Romance"],
];
export const SHELVES = ["accion", "scifi", "terror", "drama", "comedia", "documental"];
export const GENRE_COLOR: Record<string, string> = {
  accion: "#E8503A", drama: "#3B6FE0", comedia: "#E0A100", terror: "#6B2BD6",
  scifi: "#119A8C", suspenso: "#C1356B", crimen: "#2C3E66", aventura: "#2E9E5B",
  animacion: "#E5731F", misterio: "#5B4AA0", documental: "#4A8DB0", romance: "#E5547A",
};
export const COUNTRIES: Record<string, { flag: string; name: string }> = {
  US: { flag: "🇺🇸", name: "Estados Unidos" }, KR: { flag: "🇰🇷", name: "Corea del Sur" },
  GB: { flag: "🇬🇧", name: "Reino Unido" }, IT: { flag: "🇮🇹", name: "Italia" },
  JP: { flag: "🇯🇵", name: "Japón" }, FR: { flag: "🇫🇷", name: "Francia" },
  ES: { flag: "🇪🇸", name: "España" }, MX: { flag: "🇲🇽", name: "México" },
  DE: { flag: "🇩🇪", name: "Alemania" }, AR: { flag: "🇦🇷", name: "Argentina" },
  BR: { flag: "🇧🇷", name: "Brasil" }, AU: { flag: "🇦🇺", name: "Australia" },
  SE: { flag: "🇸🇪", name: "Suecia" }, IN: { flag: "🇮🇳", name: "India" },
  IS: { flag: "🇮🇸", name: "Islandia" }, CA: { flag: "🇨🇦", name: "Canadá" },
  IE: { flag: "🇮🇪", name: "Irlanda" }, DK: { flag: "🇩🇰", name: "Dinamarca" },
  NO: { flag: "🇳🇴", name: "Noruega" }, FI: { flag: "🇫🇮", name: "Finlandia" },
  NL: { flag: "🇳🇱", name: "Países Bajos" }, BE: { flag: "🇧🇪", name: "Bélgica" },
  PL: { flag: "🇵🇱", name: "Polonia" }, TR: { flag: "🇹🇷", name: "Turquía" },
  CN: { flag: "🇨🇳", name: "China" }, HK: { flag: "🇭🇰", name: "Hong Kong" },
  TW: { flag: "🇹🇼", name: "Taiwán" }, TH: { flag: "🇹🇭", name: "Tailandia" },
  CL: { flag: "🇨🇱", name: "Chile" }, CO: { flag: "🇨🇴", name: "Colombia" },
  RU: { flag: "🇷🇺", name: "Rusia" }, IL: { flag: "🇮🇱", name: "Israel" },
  ZA: { flag: "🇿🇦", name: "Sudáfrica" }, PT: { flag: "🇵🇹", name: "Portugal" },
};
export const genreLabel = (slug: string) => GENRES.find((g) => g[0] === slug)?.[1] ?? slug;
