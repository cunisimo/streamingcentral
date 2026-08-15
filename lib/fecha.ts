// Fechas de la app. El "día" de Yump es el día argentino, nunca el UTC:
// `new Date().toISOString().slice(0,10)` devuelve la fecha UTC y a partir de las
// 21:00 locales ya cuenta como mañana, que es justo la franja en la que la gente
// abre la app para elegir qué ver.
//
// Vive en su propio módulo y no en `lib/cache.ts` por dos razones: ese archivo
// es `server-only` —así que un test o un componente de cliente no puede
// importarlo— y esto es una función pura sin nada de cache adentro.
export const TZ = "America/Argentina/Buenos_Aires";

// Fecha de hoy en Argentina, en formato YYYY-MM-DD.
// `en-CA` es el atajo estándar para obtener ese formato de toLocaleDateString.
// Necesita ICU completo, que Node trae por defecto desde la 18 (Vercel corre 20+).
export function hoyAR(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

// Semilla determinística del día (hash FNV-1a sobre la fecha argentina).
// La consumen el Home (clave de cache y mezcla de rieles), el recomendador, los
// chips curados y la ruleta: todo lo que rota una vez por día.
export function dailySeed(date = new Date()): number {
  const s = hoyAR(date);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
