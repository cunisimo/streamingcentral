// Fechas de la app. El "día" de Yump es el día argentino, nunca el UTC:
// `new Date().toISOString().slice(0,10)` devuelve la fecha UTC y a partir de las
// 21:00 locales ya cuenta como mañana, que es justo la franja en la que la gente
// abre la app para elegir qué ver.
//
// Vive en su propio módulo y no en `lib/cache.ts` por dos razones: ese archivo
// es `server-only` —así que un test o un componente de cliente no puede
// importarlo— y esto es una función pura sin nada de cache adentro.
export const TZ = "America/Argentina/Buenos_Aires";

// --- Override de fecha, SOLO para medir -------------------------------------
// Casi todo lo que rota en esta app rota por día, así que comparar dos versiones
// del código es imposible si la semilla se mueve entre una corrida y la otra:
// la diferencia que aparece puede ser el cambio o puede ser que cambió el día,
// y esa ambigüedad tapa una rotura real. Con `YUMP_FECHA=2026-08-15` la semilla
// queda fija y lo único que puede diferir es el código (y la deriva del propio
// catálogo de TMDB, que no depende de nosotros).
//
// Dos candados:
//  - No corre en producción. Ni siquiera lee la variable.
//  - Solo aplica cuando NADIE pasó una fecha. `hoyAR(unaFecha)` es formateo de
//    una fecha dada —el `.ics` de "Recordarme", por ejemplo— y ahí el override
//    sería un bug; el único caso que intercepta es la pregunta "¿qué día es hoy?".
function fechaForzada(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const v = process.env.YUMP_FECHA;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// Fecha de hoy en Argentina, en formato YYYY-MM-DD.
// `en-CA` es el atajo estándar para obtener ese formato de toLocaleDateString.
// Necesita ICU completo, que Node trae por defecto desde la 18 (Vercel corre 20+).
export function hoyAR(date?: Date): string {
  if (!date) {
    const forzada = fechaForzada();
    if (forzada) return forzada;
  }
  return (date ?? new Date()).toLocaleDateString("en-CA", { timeZone: TZ });
}

// Semilla determinística del día (hash FNV-1a sobre la fecha argentina).
// La consumen el Home (clave de cache y mezcla de rieles), el recomendador, los
// chips curados y la ruleta: todo lo que rota una vez por día.
export function dailySeed(date?: Date): number {
  const s = hoyAR(date);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
