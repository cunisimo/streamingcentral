// CORS para las rutas de API que consume el contenedor.
//
// QUÉ ES ESTO Y QUÉ NO. CORS decide qué respuestas puede **leer un navegador**
// desde otro origen. NO es autenticación —eso lo sigue haciendo el
// `Authorization: Bearer` de cada ruta— y no impide que nadie llame a la API
// desde un servidor, donde CORS ni existe. Acá sólo se controla la lectura
// desde el navegador, y nada más.
//
// POR QUÉ HACE FALTA. La cáscara del contenedor se sirve desde un origen local
// (`https://localhost` en Android, `capacitor://localhost` en iOS), así que
// TODA llamada a `app.yump.ar/api` es cross-origin. En la web nada cambia: las
// peticiones son same-origin y muchas veces ni mandan `Origin`.
//
// LO QUE ESTÁ PROHIBIDO, Y POR QUÉ:
//
//   `*`                → dejaría leer la API desde cualquier página del mundo.
//   reflejar el Origin → es funcionalmente idéntico a `*`, pero parece seguro,
//                        que es peor.
//   `startsWith`       → `https://localhost.evil.com` empieza con
//                        `https://localhost`.
//   regex permisiva    → misma familia de agujeros, más difícil de auditar.
//
// Por eso la comparación es de CADENA COMPLETA contra una lista de dos.
//
// ⚠️ Este módulo NO importa `next/server`, a propósito y por el mismo motivo que
// `lib/recordatorio-texto.ts`: `node --test` no puede cargarlo, y entonces el
// contrato de CORS no se podría probar sin arrancar Next. Se usa el `Response`
// estándar, que existe igual en Node y en el runtime de Next.

/** Los dos únicos orígenes que pueden leer estas respuestas. */
export const ORIGENES_PERMITIDOS: readonly string[] = Object.freeze([
  "https://localhost",       // Android
  "capacitor://localhost",   // iOS, declarado desde ya
]);

/** Los métodos que una ruta puede tener. NO se declaran los que no existen. */
export type MetodoRuta = "GET" | "POST";

/** Los únicos encabezados que la app manda. */
const HEADERS_PERMITIDOS = "Authorization, Content-Type";

/**
 * 600 s (10 min). Chromium capa el preflight a 2 h; 600 cubre una sesión de uso
 * sin volver a preguntar y deja que un cambio de política se propague en
 * minutos, no en horas. Conservador a propósito.
 */
const MAX_AGE = "600";

/**
 * Devuelve el origen si está permitido, o `null`.
 *
 * ⚠️ Comparación EXACTA, sin normalizar nada. No se recorta, no se baja a
 * minúsculas y no se saca la barra final: cualquiera de esas "ayudas" ensancha
 * la allowlist sin que se note. `https://localhost/` y `HTTPS://LOCALHOST` NO
 * son la misma cadena y por lo tanto no pasan.
 */
export function origenPermitido(origin: string | null | undefined): string | null {
  if (!origin) return null;
  return ORIGENES_PERMITIDOS.includes(origin) ? origin : null;
}

/**
 * Agrega `Origin` a `Vary` conservando lo que ya hubiera y sin duplicar.
 *
 * `Vary: Origin` va SIEMPRE, incluso cuando el origen se rechaza: sin él, una
 * caché intermedia puede guardar la respuesta preparada para un origen y
 * servírsela a otro, y ahí la allowlist deja de existir en la práctica.
 */
export function anexarVary(actual: string | null | undefined, valor = "Origin"): string {
  const partes = (actual ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (partes.some((p) => p.toLowerCase() === valor.toLowerCase())) return partes.join(", ");
  return [...partes, valor].join(", ");
}

/**
 * Los encabezados CORS que corresponden a un `Origin`.
 *
 * - Origen permitido → `Access-Control-Allow-Origin` con ESE origen, uno solo.
 * - Origen rechazado, o sin `Origin` → sin `Allow-Origin`, pero CON `Vary`.
 * - Nunca `*`. Nunca `Allow-Credentials`: la sesión va por `Bearer`, no por
 *   cookies, así que habilitarlo no aportaría nada y prohibiría el comodín por
 *   si alguna vez hiciera falta.
 */
export function cabecerasCors(
  origin: string | null | undefined,
  varyPrevio?: string | null,
): Record<string, string> {
  const permitido = origenPermitido(origin);
  const h: Record<string, string> = { Vary: anexarVary(varyPrevio) };
  if (permitido) h["Access-Control-Allow-Origin"] = permitido;
  return h;
}

/**
 * El handler de `OPTIONS` de una ruta: responde el preflight con `204`.
 *
 * ⚠️ NO RECIBE EL HANDLER REAL, y es deliberado: así es **imposible** que el
 * preflight ejecute la lógica de la ruta. No es que "no suele pasar" — es que
 * no hay forma de llamarla desde acá. Importa porque `/api/home` puede tardar
 * hasta 60 s y gastar cientos de comandos de Upstash: un preflight que cayera
 * en el handler real duplicaría ese costo en cada llamada.
 */
export function opcionesCors(metodos: MetodoRuta): (req: Request) => Response {
  return (req: Request) => {
    const origin = req.headers.get("origin");
    const h: Record<string, string> = { ...cabecerasCors(origin) };
    if (origenPermitido(origin)) {
      h["Access-Control-Allow-Methods"] = `${metodos}, OPTIONS`;
      h["Access-Control-Allow-Headers"] = HEADERS_PERMITIDOS;
      h["Access-Control-Max-Age"] = MAX_AGE;
    }
    return new Response(null, { status: 204, headers: h });
  };
}

/**
 * Envuelve el handler de una ruta y le agrega CORS a **lo que sea que
 * devuelva**.
 *
 * Que envuelva la Response FINAL es el punto: el cuerpo de la ruta se conserva
 * sin tocar y no queda ningún camino de salida sin encabezados — éxito,
 * validación fallida, 401, 404, 500 o el fallback de un `catch`. Hay un solo
 * punto de salida.
 *
 * Y el `try/catch`: si el handler lanza, Next devolvería su propio 500 SIN
 * CORS, y el navegador mostraría un error de red genérico en vez del status
 * real. Acá esa excepción se convierte en un 500 con encabezados. El mensaje de
 * la excepción NO viaja: puede traer detalles internos.
 *
 * No cambia payload, status, caché, autenticación ni nada de la ruta.
 *
 * ⚠️ Los argumentos EXTRA se pasan tal cual. Las rutas dinámicas
 * —`/api/person/[id]` y `/api/title/[tipo]/[id]`— reciben un segundo parámetro
 * `{ params }` de Next, y una firma de un solo argumento las rompía en
 * compilación. Se descubrió al tipar las 22 rutas.
 */
export function conCors<R extends Request, A extends unknown[]>(
  handler: (req: R, ...extra: A) => Promise<Response>,
  metodos: MetodoRuta,
): (req: R, ...extra: A) => Promise<Response> {
  return async (req: R, ...extra: A) => {
    const origin = req.headers.get("origin");
    let res: Response;
    try {
      res = await handler(req, ...extra);
    } catch {
      res = Response.json({ error: "error interno" }, { status: 500 });
    }
    // Se copian los encabezados de la ruta y se AGREGAN los de CORS. `Vary` se
    // anexa al que la ruta ya hubiera puesto, no lo pisa.
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cabecerasCors(origin, headers.get("Vary")))) {
      headers.set(k, v);
    }
    // `metodos` no se usa en la respuesta normal —sólo el preflight los
    // declara— pero se pide en la firma para que cada ruta declare el suyo en
    // un único lugar y no puedan divergir el GET y su OPTIONS.
    void metodos;
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
