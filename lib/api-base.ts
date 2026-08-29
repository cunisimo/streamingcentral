// A dónde van las llamadas a la API.
//
// EN LA WEB NO PASA NADA. `API_BASE` es `""` y `apiUrl` devuelve la ruta tal
// cual, así que `/api/home` sigue siendo `/api/home` y sigue siendo same-origin.
// La web NO necesita ninguna variable de entorno para funcionar.
//
// EN EL CONTENEDOR la cáscara se sirve desde un origen local, así que una ruta
// relativa apuntaría al bundle, que no tiene `/api`. Ahí las rutas internas de
// API pasan a ser absolutas contra una base configurada explícitamente.
//
// ⚠️ VARIABLE PROPIA, NO `NEXT_PUBLIC_SITE_URL`. Son dos cosas distintas y
// juntarlas sería un error caro: `NEXT_PUBLIC_SITE_URL` es el destino del mail
// de recuperación de contraseña y depende de la allowlist de Redirect URLs de
// Supabase. Se mueven por motivos distintos, y uno de ellos puede dejar a
// alguien sin poder recuperar la cuenta.
//
// ⚠️ Y NO HAY FALLBACK DE EJECUCIÓN. No se pone `https://app.yump.ar` "por las
// dudas": un default silencioso convierte un error de configuración en un
// binario que apunta a producción sin que nadie lo haya decidido. Si el build
// es nativo y la base falta o no sirve, el build FALLA acá mismo, en tiempo de
// build, con el nombre de la variable en el mensaje.
import { ES_NATIVO } from "./plataforma.ts";

const VARIABLE = "NEXT_PUBLIC_YUMP_API_BASE";

/**
 * Valida la base. Tiene que ser una URL absoluta http(s) con host, y nada más:
 * sin path, sin query, sin fragmento. Un path acá se duplicaría con el `/api/…`
 * de cada llamada y el error saldría recién en el teléfono.
 */
function baseValida(valor: string): boolean {
  let u: URL;
  try {
    u = new URL(valor);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (!u.hostname) return false;
  if (u.search || u.hash) return false;
  return u.pathname === "/" || u.pathname === "";
}

function resolverBase(): string {
  if (!ES_NATIVO) return "";                 // la web no necesita la variable
  // ⚠️ ACCESO LITERAL, NO `process.env[VARIABLE]`. Next reemplaza en el bundle
  // del cliente las apariciones TEXTUALES de `process.env.NEXT_PUBLIC_ALGO`; un
  // índice computado no lo reconoce y lo deja como está. Con la forma dinámica
  // el valor entraba durante el prerender (donde `process.env` es el de Node)
  // pero NO quedaba inlineado, así que en el navegador `process.env` es `{}`,
  // la base salía vacía y este módulo lanzaba al evaluarse: la app se caía al
  // arrancar dentro del contenedor. Se detectó grepeando el artefacto: la base
  // no aparecía en ningún archivo del bundle.
  const valor = (process.env.NEXT_PUBLIC_YUMP_API_BASE ?? "").trim();
  if (!valor) {
    throw new Error(
      `${VARIABLE} es obligatoria en el build nativo (NEXT_PUBLIC_YUMP_NATIVO=1) y no está definida. ` +
      `Pasala al build, por ejemplo: npm run build:capacitor -- --api-base=https://…`,
    );
  }
  if (!baseValida(valor)) {
    // El mensaje NO incluye el valor: puede venir de un entorno y no se imprime.
    throw new Error(
      `${VARIABLE} no es una base válida. Tiene que ser una URL absoluta http(s) ` +
      `con host y sin path, query ni fragmento (por ejemplo https://api.ejemplo.com).`,
    );
  }
  return valor.replace(/\/+$/, "");          // sin barra final: la pone la ruta
}

/**
 * La base de la API. `""` en la web (relativo, same-origin); una URL absoluta
 * en el build nativo.
 *
 * Se resuelve al EVALUAR EL MÓDULO, así que un build nativo mal configurado
 * falla durante el build y no en el teléfono.
 */
export const API_BASE: string = resolverBase();

/**
 * Convierte una ruta interna de API en la URL a la que hay que pedir.
 *
 * Su responsabilidad es UNA: rutas internas que empiezan con `/api/`. Todo lo
 * demás se devuelve intacto —URLs externas, rutas internas que no son de API,
 * y la cadena vacía, que `useApi` usa para decir "no pidas nada"—.
 */
export function apiUrl(ruta: string, base: string = API_BASE): string {
  if (!base) return ruta;
  if (!ruta.startsWith("/api/")) return ruta;
  return base.replace(/\/+$/, "") + ruta;
}
