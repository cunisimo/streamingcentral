// Listas y umbrales de las reglas. TODO ES HIPÓTESIS para las pruebas
// (revisión §3): no es eficacia medida. Cada término nuevo entra con su caso
// en el banco de desarrollo; cualquier cambio sube VERSION_REGLAS.
//
// Las palabras van ya plegadas (minúsculas, sin acentos), porque se comparan
// contra `base` o `letras`.

// ---------------------------------------------------------------- contacto

/** Dígitos a partir de los cuales una corrida es un teléfono, sin más contexto. */
export const DIGITOS_TELEFONO = 8;
/** Con una palabra de contacto cerca, alcanza con esto. */
export const DIGITOS_TELEFONO_CON_CONTEXTO = 6;
/**
 * En un nombre (2–24) no hay motivo para una corrida larga de dígitos: con
 * esto ya se rechaza, haya o no palabra de contacto ("uno uno cuatro cuatro
 * 55"). Los años sueltos ("Vale1988") no cuentan.
 */
export const DIGITOS_TELEFONO_NOMBRE = 6;
/** "Cerca" de una palabra de contacto, en caracteres. */
export const VENTANA_CONTACTO = 40;

export const PALABRAS_CONTACTO = [
  "llamame", "llama", "llamar", "llamada", "escribime", "escribi", "escribile",
  "mandame", "mensaje", "mensajeame", "hablame", "contactame", "contacto",
  "agendate", "agendame", "agenda", "wsp", "wpp", "whatsapp", "whats", "wa",
  "telegram", "tel", "telefono", "cel", "celu", "celular", "numero", "nro",
  "dm", "md", "privado",
];

/** Redes y mensajería. Solas no dicen nada ("lo vi en Twitter"). */
export const PLATAFORMAS_RED = [
  "instagram", "insta", "ig", "telegram", "whatsapp", "wsp", "wpp", "wa",
  "tiktok", "discord", "snapchat", "snap", "facebook", "fb", "twitter",
  "threads", "kik", "signal", "onlyfans",
];

/**
 * Verbos que convierten una mención de red en un pedido de contacto. No están
 * "seguí" ni "encontrás": "Seguí viendo en Twitter las reacciones" o
 * "Encontrás el tráiler en TikTok" son legítimas. Las frases "me encuentran" y
 * "me encontrás" se suman en reglas.ts.
 */
export const VERBOS_CONTACTO = [
  "escribime", "escribi", "escribile", "hablame", "mandame", "agregame",
  "seguime", "buscame", "encontrame", "contactame", "sumame", "dm", "md", "privado",
];

/** Proveedores de correo: "algo@gmail" ya es un correo aunque falte el ".com". */
export const PROVEEDORES_CORREO = ["gmail", "hotmail", "yahoo", "outlook", "live", "icloud", "proton", "protonmail"];

/**
 * TLD que cuentan siempre. Ninguno es una palabra común del castellano, así
 * que "algo.com" o "algo . com" son un dominio aunque haya espacios.
 */
export const TLD_FUERTES = [
  "com", "net", "org", "info", "biz", "xyz", "ly", "io", "gg", "link", "site",
  "online", "app", "live", "club", "shop", "store", "top", "ru", "tk", "ml",
  "ga", "cf", "nz", "ar", "cc", "ws", "blog", "page", "lat", "uy", "cl", "mx",
];

/**
 * TLD que también son palabras ("me", "es", "la", "de"…): "Buenísima.Me
 * encantó" es puntuación mal tipeada. Sólo cuentan pegados y seguidos de una
 * ruta ("t.me/algo").
 */
export const TLD_DEBILES = ["me", "es", "la", "de", "co", "tv", "to", "in", "it", "us", "be", "fm", "am", "so"];

/** Acortadores y hosts que delatan un enlace aunque falte el TLD. */
export const HOSTS_SIN_TLD = ["bitly", "linktr", "wa.me", "t.me", "mega.nz"];

// ---------------------------------------------------------------- spam

export const SPAM_CRIPTO = ["bitcoin", "btc", "cripto", "criptomoneda", "criptomonedas", "usdt", "binance", "ethereum", "forex", "trading", "airdrop"];
/** Raíces (se buscan como comienzo de palabra). */
export const SPAM_INVERSION = ["invert", "invirt", "inversion", "ganancia", "rentabilidad", "garantizad"];
export const SPAM_FRASES = ["ingresos extra", "ganar plata", "gana plata", "gana dinero", "ganar dinero", "plata facil", "dinero facil", "desde tu casa", "sin salir de tu casa", "trabajo desde casa"];
export const SPAM_PROMO = ["gratis", "sorteo", "sorteando", "sorteamos", "regalo", "regalamos", "promo", "descuento", "cupon", "oferta", "exclusiva"];
export const SPAM_ACCION = ["entra", "ingresa", "registrate", "participa", "reclama", "descarga", "clic", "click", "clickea", "segui", "seguinos", "comparti", "compartiendo", "deja tu like", "aprovecha", "consultame", "escribime", "suscribite"];
/** Señales necesarias para retener. Promoción + acción ya suma 2. */
export const UMBRAL_SPAM = 2;

// ---------------------------------------------------------------- odio y amenazas

/** Grupos que, seguidos de "de mierda" o de un llamado a echarlos, retienen. */
export const GRUPOS = [
  "negro", "negra", "judio", "judia", "boliviano", "boliviana", "paraguayo",
  "paraguaya", "peruano", "peruana", "chino", "china", "gay", "trolo", "puto",
  "trava", "travesti", "villero", "villera", "sudaca", "mogolico", "mogolica",
  "inmigrante", "gitano", "gitana",
];
/** Insultos que retienen solos. "puto" no está: es un insulto genérico muy común. */
export const INSULTOS_ODIO = ["maricon", "maricones", "trolo", "trolos", "trola", "sudaca", "sudacas", "mogolico", "mogolicos", "mogolica"];
export const VERBOS_EXPULSION = ["matar", "matarlos", "exterminar", "sacar", "sacarlos", "echar", "echarlos", "quemar"];

export const AMENAZAS = [
  "te voy a matar", "te voy a buscar", "te voy a encontrar", "te voy a romper",
  "te voy a cagar", "te voy a reventar", "te voy a lastimar", "te voy a violar",
  "te mato", "te reviento", "te rompo la cara", "te cago a palos",
  "se donde vivis", "se donde vive", "se donde trabajas", "ojala te mueras",
  "ojala se muera", "ojala te muera",
];

// ---------------------------------------------------------------- datos y menores

export const DOMICILIO = ["vive en", "su direccion es", "su domicilio es", "su casa queda en", "su casa es en", "domicilio"];
export const VENTANA_DOMICILIO = 40;

export const SEXUAL = ["sexo", "sexual", "sexuales", "porno", "desnuda", "desnudo", "desnudas", "desnudos", "coger", "cogerse", "garchar", "intimas", "pack", "nudes"];
export const MENORES = ["menor de edad", "menores de edad", "nena", "nenas", "nene", "nenes", "nina", "ninas", "nino", "ninos", "chiquita", "chiquito", "pendeja", "pendejo"];
export const VENTANA_MENORES = 60;

// ---------------------------------------------------------------- texto anómalo (sólo reseñas)

export const MAX_PROPORCION_MAYUSCULAS = 0.5;
export const MIN_LETRAS_MAYUSCULAS = 20;
export const MIN_PALABRAS_DISTINTAS = 8;
export const MAX_REPETICION_CARACTER = 8;
/** "jajajajajaja": una unidad de 1–3 letras repetida al menos tantas veces. */
export const MAX_REPETICION_UNIDAD = 6;

// ---------------------------------------------------------------- formato

export const LARGO_RESENA = { min: 80, max: 600 } as const;
export const LARGO_NOMBRE = { min: 2, max: 24 } as const;
export const MAX_TEXTOS_RECIENTES = 3;
