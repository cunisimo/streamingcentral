// Consultas de búsqueda VERIFICADAS, por título y por plataforma.
//
// NO es una tabla de "títulos publicados". Es una tabla de qué hay que escribir
// en el buscador de esa plataforma para que el título aparezca. La distinción no
// es teórica: en Disney+ Argentina, `movie:12535` se publica como "Las
// ansiedades del Dr. Mel Brooks" y **ese mismo nombre devuelve cero resultados
// en su propio buscador**. Lo único que la encuentra es "High Anxiety".
//
// Una tabla de nombres publicados habría guardado justo la cadena que no sirve.
//
// POR QUÉ UN MAPA ESTÁTICO Y NO UNA TABLA. Con una excepción, una tabla en
// Supabase más un cache en Upstash es infraestructura para un problema que
// todavía no existe: costaría 1 comando de Upstash por ficha (un HIT también
// cuenta) y unos milisegundos en el camino crítico, contra 0 y 0 de un mapa en
// el bundle del servidor. Y una corrección es un commit, que además deja la
// verificación auditada en el historial — que es exactamente lo que se quiere
// de un dato verificado a mano.
//
// CUÁNDO MIGRAR: pasadas ~50 filas, o la primera vez que haga falta corregir una
// sin deployar. `ayudasDeBusqueda` YA es `async` para que ese día no cambie
// ninguna firma ni haya que tocar el componente.
// Sin `server-only`, misma razón que `lib/busqueda-orden.ts`: es lógica pura
// sin credenciales y hay que poder probarla con `node --test`. Que no llegue
// al bundle del navegador lo garantiza un test de importaciones
// (lib/consultas-verificadas.test.ts), que es más preciso que el guard: lo
// que hay que impedir es que un componente cliente lo importe, no que exista.
import type { AyudaBusqueda, MediaType, PlatformCode } from "./types";

// Kill switch. Apaga SOLO el mapa por plataforma: el respaldo al título original
// (`ayudaOriginal`) sigue funcionando, porque son dos ayudas distintas y una no
// depende de la otra. Ver el orden del cálculo en `ayudasDeBusqueda`.
//
// Se evalúa en el servidor y se PASA como argumento, igual que el idioma. La
// primera versión lo leía adentro de la función y eso la volvía imposible de
// probar en sus cuatro combinaciones: había que duplicar la lógica en el test,
// que es justo lo que después se desincroniza.
export const MAPA_VERIFICADO_ACTIVO = process.env.CONSULTA_VERIFICADA !== "0";

interface Excepcion {
  tipo: MediaType;
  tmdbId: number;
  plataforma: PlatformCode;
  pais: string;
  /** Lo que hay que ESCRIBIR. Verificado a mano en el buscador de la plataforma. */
  consulta: string;
  /** Auditoría. NUNCA se usa para buscar: ver el encabezado. */
  nombrePublicado?: string;
  fuente: string;
  verificadoEn: string;
}

// Crece con lo que reporten los usuarios y se verifique a mano, no de forma
// preventiva. Cada fila tiene que decir quién la comprobó y cuándo.
const EXCEPCIONES: Excepcion[] = [
  {
    tipo: "movie", tmdbId: 12535, plataforma: "d", pais: "AR",
    consulta: "High Anxiety",
    nombrePublicado: "Las ansiedades del Dr. Mel Brooks",
    fuente: "verificado por el dueño en su sesión de Disney+ AR",
    verificadoEn: "2026-08-23",
  },
];

// Índice por clave completa. Se arma una vez, al importar.
const POR_CLAVE = new Map(
  EXCEPCIONES.map((e) => [`${e.tipo}:${e.tmdbId}:${e.plataforma}:${e.pais}`, e]),
);

// Comparación laxa SOLO para decidir si una ayuda es redundante: si la consulta
// es el mismo texto que la ficha ya muestra, mostrarla sería decir lo obvio. En
// 13 de los 17 casos medidos la consulta verificada ES el título es-MX.
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();

export async function ayudasDeBusqueda(opts: {
  tipo: MediaType;
  tmdbId: number;
  tituloVisible: string;
  originalTitle?: string | null;
  /** SOLO las plataformas donde el título está realmente disponible. */
  plataformas: PlatformCode[];
  pais?: string;
  /** Configuración, resuelta por el llamador (servidor). Explícita para que la
   *  función sea pura y las cuatro combinaciones se puedan probar de verdad. */
  idiomaBase: string;
  mapaActivo?: boolean;
}): Promise<{ ayudas?: AyudaBusqueda[]; ayudaOriginal?: string }> {
  const pais = opts.pais ?? "AR";
  const mapaActivo = opts.mapaActivo ?? MAPA_VERIFICADO_ACTIVO;
  const visible = norm(opts.tituloVisible);

  // --- 1. El mapa por plataforma, solo si su switch está encendido ----------
  // Si está apagado, `ayudas` queda vacío y el cálculo SIGUE: el respaldo al
  // original no depende de este switch.
  const ayudas: AyudaBusqueda[] = [];
  if (mapaActivo) {
    for (const plataforma of opts.plataformas) {
      const e = POR_CLAVE.get(`${opts.tipo}:${opts.tmdbId}:${plataforma}:${pais}`);
      if (!e) continue;
      // Redundante: la consulta es lo que la ficha ya muestra.
      if (norm(e.consulta) === visible) continue;
      ayudas.push({ plataforma, consulta: e.consulta });
    }
  }

  // --- 2. El respaldo genérico, calculado APARTE ----------------------------
  // Solo con es-MX. Medido: la unión es-MX + original encuentra 29/29, pero
  // es-ES + original solo 28/29 — falla movie:278, donde ni "Cadena perpetua"
  // ni "The Shawshank Redemption" dan nada en Netflix y lo único que funciona
  // es el es-MX "Sueño de fuga". Ofrecer el original junto a un título que
  // tampoco sirve manda al usuario a fallar dos veces.
  let ayudaOriginal: string | undefined;
  const original = (opts.originalTitle ?? "").trim();
  if (opts.idiomaBase === "es-MX" && original && norm(original) !== visible) {
    ayudaOriginal = original;
  }

  // --- 3. Deduplicación, al final y mirando las ayudas EMITIDAS -------------
  // Si mirara el mapa en vez de lo emitido, con CONSULTA_VERIFICADA=0 el
  // original quedaría suprimido por una ayuda que nunca se mostró, y Mel Brooks
  // se quedaría sin nada.
  if (ayudaOriginal && ayudas.some((a) => norm(a.consulta) === norm(ayudaOriginal!))) {
    ayudaOriginal = undefined;
  }

  // Ausentes, no vacíos: así el componente no tiene que distinguir los dos casos.
  return {
    ...(ayudas.length ? { ayudas } : {}),
    ...(ayudaOriginal ? { ayudaOriginal } : {}),
  };
}
