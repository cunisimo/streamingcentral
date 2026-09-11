// La base de TMDB: oficial salvo que el BANCO la apunte a un doble, y nunca en
// Producción. Función pura; lib/tmdb.ts sólo la llama con las variables.
//
// Tres variables, y hacen falta las tres a favor para salir de la oficial:
//
//   TMDB_BASE_URL   la URL del doble (http o https).
//   YUMP_BANCO=1    la marca EXPLÍCITA de que este proceso es el banco aislado.
//                   Sin ella, `TMDB_BASE_URL` se ignora: una variable copiada por
//                   accidente a un entorno real no puede desviar tráfico.
//   VERCEL_ENV      si es "production", se ignora TODO lo anterior. Es la última
//                   red: aunque alguien ponga las dos variables en Producción,
//                   la app sigue hablando con la API oficial.
//
// La decisión devuelve el motivo cuando ignora una configuración, para que
// lib/tmdb.ts lo registre UNA vez al arrancar y nadie se pregunte por qué el
// banco no está midiendo lo que cree.

export const TMDB_OFICIAL = "https://api.themoviedb.org/3";

export interface DecisionBase {
  base: string;
  /** Presente sólo cuando se ignoró una configuración. */
  motivo?: string;
}

export function baseTmdb(env: { base?: string; banco?: string; vercelEnv?: string }): DecisionBase {
  const pedida = (env.base ?? "").trim();
  if (!pedida) return { base: TMDB_OFICIAL };
  if (env.vercelEnv === "production") {
    return { base: TMDB_OFICIAL, motivo: `TMDB_BASE_URL ignorada: VERCEL_ENV=production nunca usa un doble` };
  }
  if (env.banco !== "1") {
    return { base: TMDB_OFICIAL, motivo: `TMDB_BASE_URL ignorada: falta YUMP_BANCO=1 (la marca explícita del banco)` };
  }
  if (!/^https?:\/\/[^\s/]+/.test(pedida)) {
    return { base: TMDB_OFICIAL, motivo: `TMDB_BASE_URL ignorada: no es una URL http(s) válida` };
  }
  return { base: pedida.replace(/\/+$/, "") };
}
