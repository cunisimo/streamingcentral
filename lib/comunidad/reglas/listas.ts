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

/**
 * Señales FUERTES de contacto: pedidos en primera persona y medios de contacto.
 * Sólo éstas hacen que un número con forma de año, fecha o importe cuente como
 * teléfono (E1.1, A1). "número", "mensaje" o "contacto" son débiles: "el número
 * de entradas vendidas fue 1.200.000" es legítimo.
 */
export const CONTACTO_FUERTE = [
  "llamame", "escribime", "escribile", "mandame", "mensajeame", "hablame",
  "contactame", "agendate", "agendame", "wsp", "wpp", "whatsapp", "whats",
  "wa", "telegram", "tel", "telefono", "cel", "celu", "celular",
];

/** Redes y mensajería. Solas no dicen nada ("lo vi en Twitter"). */
export const PLATAFORMAS_RED = [
  "instagram", "insta", "ig", "telegram", "whatsapp", "wsp", "wpp", "wa",
  "tiktok", "discord", "snapchat", "snap", "facebook", "fb", "twitter",
  "threads", "kik", "signal", "onlyfans",
  // E1.2: alias de escritura habituales. Una red descripta en palabras ("la
  // app del video corto") queda fuera: no se resuelve con una lista.
  "tik tok", "tg", "telegran", "whatsap", "watsap", "guasap", "twitch", "face",
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
  // E1.2: exhortaciones en plural o a un tercero ("Sigan a @…").
  "sigan", "siganme", "seguinos", "escriban", "escribanme", "agreguen", "agreguenme",
];

/**
 * Verbos de narración que, justo antes del pedido, indican que lo dice un
 * personaje ("le dice 'escribime por WhatsApp'"). Bajan la señal a retención;
 * nunca la convierten en publicación (E1.2, A1).
 */
export const VERBOS_ATRIBUCION = [
  "dice", "dijo", "decia", "grita", "grito", "gritaba", "responde", "respondio",
  "pregunta", "pregunto", "contesta", "contesto", "susurra", "susurro",
  "pide", "pidio", "repite", "repitio", "escribe", "escribio", "manda", "mando",
];

/** Pistas, en el texto actual, de que continúa un dato empezado en otra reseña. */
export const PISTAS_CONTINUACION = [
  "terminacion", "termina", "resto", "final", "sigue", "seguimos", "continua",
  "principio", "sumalo", "agregale", "completo", "completa", "mail", "correo",
  "usuario", "user", "nick", "numero",
];

/**
 * Una red y un verbo de contacto cuentan como pedido sólo si están a esta
 * distancia, en caracteres (E1.1, A3).
 */
export const VENTANA_RED = 30;
/** Usuario y red, o usuario y verbo, a esta distancia. */
export const VENTANA_HANDLE = 60;

/** Proveedores de correo: "algo@gmail" ya es un correo aunque falte el ".com". */
export const PROVEEDORES_CORREO = ["gmail", "hotmail", "yahoo", "outlook", "live", "icloud", "proton", "protonmail"];

/**
 * "usuario en gmail" / "usuario de hotmail" (E1.1, A2). El usuario NO puede
 * ser una de estas palabras: "el correo de gmail de su jefe", "un mail de
 * hotmail con la promo".
 */
export const NO_USUARIO_CORREO = [
  "mail", "mails", "email", "emails", "correo", "correos", "cuenta", "cuentas",
  "casilla", "mensaje", "mensajes", "notificacion", "notificaciones", "promo",
  "promos", "app", "aplicacion", "bandeja", "buscador", "servicio", "usuarios",
];
/** Pista de correo cerca para aceptar un usuario sin dígitos, "_" ni ".". */
export const PISTAS_CORREO = ["correo", "mail", "email", "escribime", "escribile", "mandame", "manda", "contacto", "contactame"];
export const VENTANA_CORREO = 40;

/**
 * Correo indirecto (A2 de 40288f6): palabras que nombran una casilla, en
 * "mi correo es …" o cerca de un pedido. Solas no disparan nada. "e-mail"
 * no hace falta: "mail" ya se reconoce después del guion.
 */
export const PALABRAS_CORREO = ["correo electronico", "direccion de correo", "correo", "mail", "email", "casilla"];
/** Intención de contacto por correo, además de VERBOS_CONTACTO. */
export const INTENCION_CORREO = ["te paso", "les paso", "pasame", "pedime", "pidanme", "escribanme"];
/** No son un alias: "mi correo es un desastre", "mi mail es lo de menos". */
export const NO_ALIAS_CORREO = [
  "un", "una", "uno", "el", "la", "lo", "los", "las", "mi", "tu", "su", "muy", "re", "mas", "otro", "otra",
  "este", "esta", "ese", "esa", "privado", "privada", "secreto", "secreta", "personal", "viejo", "nuevo",
  "falso", "trucho", "publico", "igual", "distinto", "importante", "simple", "facil", "largo", "corto",
  "raro", "que", "como", "donde", "cual", "nada", "algo", "todo", "puro", "pura", "solo", "de", "del",
];
/** Distancia máxima entre alias, palabra de correo e intención de contacto. */
export const VENTANA_CORREO_INDIRECTO = 80;

/**
 * TLD que cuentan siempre. Ninguno es una palabra común del castellano, así
 * que "algo.com" o "algo . com" son un dominio aunque haya espacios.
 */
export const TLD_FUERTES = [
  "com", "net", "org", "info", "biz", "xyz", "ly", "io", "gg", "link", "site",
  "online", "app", "live", "club", "shop", "store", "top", "ru", "tk", "ml",
  "ga", "cf", "nz", "ar", "cc", "ws", "blog", "page", "lat", "uy", "cl", "mx",
  // E1.2: TLD de acortadores y genéricos frecuentes. Con ruta ("algo.zz/x")
  // cualquier terminación ya cuenta; esta lista es para direcciones SIN ruta.
  "gd", "gl", "sh", "st", "su", "cx", "pw", "icu", "vip", "fun", "art", "best",
  "click", "life", "news", "pro", "tech", "today", "world", "zone", "space",
  "website", "digital", "stream", "movie", "watch", "media", "video", "tube",
];

/**
 * TLD que también son palabras ("me", "es", "la", "de"…): "Buenísima.Me
 * encantó" es puntuación mal tipeada. Sólo cuentan pegados y seguidos de una
 * ruta ("t.me/algo").
 */
export const TLD_DEBILES = ["me", "es", "la", "de", "co", "tv", "to", "in", "it", "us", "be", "fm", "am", "so"];

/** Acortadores y hosts que delatan un enlace aunque falte el TLD. */
export const HOSTS_SIN_TLD = [
  "bitly", "linktr", "wa.me", "t.me", "mega.nz",
  // E1.2: acortadores conocidos escritos sin TLD o con TLD débil.
  "tinyurl", "cuttly", "cutt.ly", "is.gd", "v.gd", "ow.ly", "t.ly", "s.id", "rebrandly", "shorturl", "adfly",
];

// ---------------------------------------------------------------- spam

export const SPAM_CRIPTO = ["bitcoin", "btc", "cripto", "criptomoneda", "criptomonedas", "usdt", "binance", "ethereum", "forex", "trading", "airdrop"];
/** Raíces (se buscan como comienzo de palabra). */
export const SPAM_INVERSION = ["invert", "invirt", "inversion", "ganancia", "rentabilidad", "garantizad"];
/**
 * Frases de familias de spam conocidas. Cada frase distinta suma una señal
 * (hasta 2). E1.2 sumó familias divulgadas: premio por encuesta, casino,
 * productos milagro y venta con envío. Es una lista finita: una paráfrasis
 * nueva pasa (y depende de denuncias).
 */
export const SPAM_FRASES = [
  "ingresos extra", "ganar plata", "gana plata", "gana dinero", "ganar dinero",
  "plata facil", "dinero facil", "desde tu casa", "sin salir de tu casa", "trabajo desde casa",
  "fuiste seleccionado", "fuiste seleccionada", "fuiste elegido", "fuiste elegida",
  "breve encuesta", "completar una encuesta", "reclamar tu premio", "reclama tu premio",
  "casino online", "bono de bienvenida", "giros gratis", "retiros al instante",
  "envio gratis", "pago contra entrega", "precio promocional", "conecta tu billetera",
  "baja de peso", "bajar de peso",
];
/** Hasta cuántas señales aportan las frases. */
export const MAX_SENALES_FRASES = 2;
export const SPAM_PROMO = [
  "gratis", "sorteo", "sorteando", "sorteamos", "regalo", "regalamos", "promo",
  "descuento", "cupon", "oferta", "premio", "premios", "ganadores", "bono", "tokens",
];
/** Acciones sin ambigüedad: se buscan en `base`. */
export const SPAM_ACCION = [
  "registrate", "clic", "click", "clickea", "seguinos", "compartiendo",
  "deja tu like", "consultame", "escribime", "suscribite", "probalo", "sumate",
];
/**
 * Imperativos de voseo que sin tilde coinciden con la tercera persona
 * ("participá" / "participa"): se buscan CON tilde en el original en
 * minúsculas (E1.2). "El protagonista participa de un sorteo" no suma.
 */
export const SPAM_ACCION_VOSEO = [
  "entrá", "ingresá", "participá", "participás", "reclamá", "descargá", "seguí",
  "compartí", "aprovechá", "comentá", "completá", "conectá", "comprá", "etiquetá", "dejá",
];
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

/** También se buscan sin espacios dentro de letras sueltas unidas ("t e v o y a b u s c a r", E1.2). */
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

// ================================================================
// Contrato de moderación v1 (catálogo v3.2), §6. Listas CERRADAS: cada cambio
// es una versión nueva del contrato. Formas plegadas (sin tilde) salvo las
// que dicen "con tilde", que se buscan en la copia acentuada.
// ================================================================

/** §7: ámbito máximo, en palabras, entre el primer y el último indicio. */
export const AMBITO_PALABRAS = 25;

/** §6.N: palabras-número en inglés, sólo dentro de corridas (como 0–15). */
export const PALABRAS_NUMERO_EN: Readonly<Record<string, string>> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
};

/** §6.I: intención de contacto, formas cerradas (plegadas). */
export const INTENCION = [
  // voseo con clítico
  "escribime", "escribinos", "mandame", "mandanos", "agregame", "agreganos", "buscame", "buscanos",
  "seguime", "seguinos", "contactame", "contactanos", "hablame", "hablanos", "llamame", "llamanos",
  "sumame", "sumate", "pasame", "pedime", "pedinos", "encontrame", "avisame", "consultame", "agendame", "agendate",
  // tú (las que coinciden con el voseo ya están arriba)
  "escribeme", "sigueme", "encuentrame", "pideme",
  // usted
  "escribame", "mandeme", "agregueme", "busqueme", "sigame", "contacteme", "hableme", "llameme", "encuentreme", "aviseme", "pidame",
  // plural
  "escriban", "escribanme", "escribannos", "manden", "mandenme", "agreguen", "agreguenme", "busquen", "busquenme",
  "sigan", "siganme", "contacten", "contactenme", "hablen", "hablenme", "llamen", "llamenme", "sumense", "pasense",
  "entren", "agenden", "agendenme", "pidan", "pidanme", "encuentrenme", "avisenme", "consulten",
  // frases
  "por privado", "al privado", "por dm", "al dm", "por md", "al md", "dm", "md", "te paso", "les paso", "les dejo mi", "te dejo mi",
];
/** §6.I: voseo sin clítico, sólo verbos en -ar, CON TILDE (en la copia acentuada). */
export const INTENCION_VOSEO_AR = ["mandá", "agregá", "buscá", "contactá", "hablá", "llamá", "sumá", "pasá", "entrá", "agendá", "consultá", "avisá"];
/** §6.I: frases de pedido por privado (S2). */
export const PEDIDO_PRIVADO = ["por privado", "al privado", "por dm", "al dm", "por md", "al md"];

/** §6.M: plataformas y alias. "x" sólo junto a "usuario", "@" o un alias (reglas.ts). */
export const PLATAFORMAS_CONTRATO = [
  "instagram", "insta", "ig", "tiktok", "tik tok", "tt", "telegram", "telegran", "tg", "tele",
  "whatsapp", "whatsap", "watsap", "guasap", "wsp", "wpp", "wa", "whats", "discord", "dc",
  "snapchat", "snap", "facebook", "face", "fb", "twitter", "twitch", "kick", "threads", "signal", "kik", "onlyfans",
];
/** §6.M: palabras de medio. */
export const PALABRAS_MEDIO = [
  "cel", "celu", "celular", "numero", "nro", "telefono", "tel", "correo", "mail", "email", "casilla",
  "usuario", "user", "cuenta", "canal", "grupo", "perfil", "nick", "apodo",
];

/** §6.R: verbos de remisión al perfil (S3-b). Plegados y, aparte, con tilde. */
export const REMISION = ["fijate", "fijense", "fijese", "miren", "mire", "chequeen", "vean", "revisen", "pasen por", "entren a", "busquen"];
export const REMISION_TILDE = ["mirá", "chequeá", "revisá", "pasá por", "entrá a", "buscá"];
/** S3: palabras de identidad. */
export const IDENTIDAD_PERFIL = ["nombre", "apodo", "nick", "usuario", "perfil", "cuenta"];
/** §6.P: marcadores de perfil (S3-c). */
export const MARCADORES_PERFIL = ["de aca", "que ven", "comunitario", "en todas las redes", "el mismo", "mismo nombre", "mismo apodo"];

/** §6.K: marcadores de continuación agregados (S4). */
export const CONTINUACION_EXTRA = [
  "en otra resena", "en la otra resena", "en mi proxima resena", "lo termino", "la termino",
  "empieza con", "arranca con", "termina con", "termina en", "la segunda parte",
];

/** §6.V: venta o sorteo, y acompañantes (S5). */
export const VENTA = ["vendo", "vendemos", "revendo", "liquido", "liquidamos", "alquilo", "sorteo", "sorteamos", "sorteando", "regalamos", "giveaway"];
export const ACOMPANANTES_VENTA = [
  "precio", "precios", "envio", "envios", "stock", "cuotas", "consultas", "interesados", "oferta",
  "descuento", "mayorista", "dale like", "dale me gusta",
];

/** §6.T2: terminaciones que son palabras comunes o marcas (cuentan sólo pegadas y con ruta). */
export const T_PALABRA = [
  "me", "es", "la", "de", "co", "tv", "to", "in", "it", "us", "be", "fm", "am", "so",
  "al", "as", "do", "no", "se", "si", "va", "ve", "re",
  "actor", "arte", "auto", "autos", "baby", "band", "bar", "bet", "bio", "blue", "book", "box", "buy", "cafe",
  "cam", "car", "cars", "casa", "case", "cash", "casino", "cat", "chat", "city", "coach", "cool", "data", "date",
  "day", "deal", "dog", "eco", "email", "fan", "fans", "film", "final", "fit", "food", "free", "futbol", "game",
  "games", "gay", "gift", "gold", "golf", "gratis", "green", "hair", "help", "here", "hot", "house", "ice",
  "juegos", "kids", "land", "latino", "law", "like", "love", "lol", "luxe", "mango", "map", "market", "meme",
  "men", "menu", "moda", "money", "monster", "moto", "music", "new", "next", "ninja", "now", "one", "open",
  "party", "pet", "phone", "photo", "pics", "pink", "pizza", "play", "plus", "poker", "porn", "press", "promo",
  "radio", "red", "rent", "rest", "rio", "rocks", "room", "run", "sale", "salon", "sex", "sexy", "show", "ski",
  "sky", "smart", "smile", "soccer", "social", "solar", "song", "soy", "spa", "sport", "star", "studio", "style",
  "surf", "taxi", "team", "tienda", "tips", "tours", "toys", "travel", "uno", "vegas", "viajes", "vision", "viva",
  "vivo", "vote", "voto", "web", "win", "wine", "work", "wow", "wtf", "yoga", "you", "zero",
  "amazon", "apple", "google", "hbo", "netflix", "prime", "youtube",
];

/** §6.H1-a: amenazas directas (plegadas). */
export const H1_DIRECTAS = [
  "te mato", "te reviento", "te rompo la cara", "te cago a palos", "te cago a trompadas", "te parto la cara", "te quemo",
  "se donde vivis", "se donde vive", "se donde trabajas", "se donde trabaja", "se donde laburas", "se donde estudias",
  "te voy a buscar", "te voy a encontrar", "te vamos a buscar", "te vamos a encontrar",
];
/** §6.H1-b: daño (infinitivo o expresión; reglas.ts acepta el clítico pegado). */
export const H1_DANO = [
  "matar", "asesinar", "reventar", "romper la cara", "romper las piernas", "cagar a palos", "cagar a trompadas",
  "cagar a pinas", "cagar a tiros", "pegar un tiro", "pegar un balazo", "pegar una paliza", "dar una paliza",
  "meter un tiro", "apunalar", "acuchillar", "degollar", "quemar", "prender fuego", "violar", "lastimar",
  "golpear", "ahorcar", "envenenar", "hacer boleta", "hacer mierda", "hacer desaparecer",
];
/** §6.H1-c: destinatario (necesario con lo/la/le/los/las/les). */
export const H1_DESTINATARIO = [
  "vos", "al de la resena", "el de la resena", "al que puso", "al que escribio", "al que comento",
  "a ese", "a esa", "a este", "a esta", "al director", "al actor", "a la actriz", "moderador",
];
/** §6.H1-d: deseo o merecimiento. */
export const H1_DESEO = [
  "ojala te mueras", "ojala se muera", "ojala te maten", "ojala lo maten",
  "mereces morir", "merecen morir", "merecen que los maten", "mereces que te maten",
];
/** §6.H1-e: nunca disparan (si el indicio cae dentro de una de estas). */
export const H1_EXCLUIDAS = [
  "de risa", "la rompe", "la rompio", "romperla", "matar el tiempo", "quemar la cabeza", "la vamos a pasar", "me mato", "me revento de risa",
];

/** §6.H2-a: grupos (forma base; reglas.ts agrega género y número). */
export const H2_GRUPOS = [
  "boliviano", "bolita", "paraguayo", "paragua", "peruano", "perucho", "chileno", "chino", "ponja", "coreano",
  "judio", "negro", "villero", "sudaca", "gitano", "inmigrante", "extranjero", "indio", "coya", "mapuche",
  "turco", "arabe", "moro", "musulman", "gay", "puto", "trolo", "maricon", "lesbiana", "trava", "travesti",
  "trans", "homosexual", "mogolico", "discapacitado", "retrasado", "autista", "down", "mujer", "mina",
  "hembra", "feminista", "feminazi",
];
/** §6.H2-b: deshumanización y exclusión. */
export const H2_DESHUMANIZACION = [
  "plaga", "basura", "lacra", "escoria", "parasito", "parasitos", "enfermedad", "enfermos", "cucaracha", "cucarachas",
  "rata", "ratas", "animales", "bestias", "inferiores", "infrahumanos", "no son personas", "no son humanos",
  "no deberian existir", "no tendrian que haber nacido", "no tendrian que tener derechos", "que se vuelvan",
  "que se vayan", "fuera", "muerte a", "odio a", "de mierda", "exterminio",
];
/** §6.H2-b: "hay que" / "habría que" + estos verbos. */
export const H2_VERBOS_EXPULSION = ["echarlos", "sacarlos", "matarlos", "exterminarlos", "quemarlos", "deportarlos"];
/** §6.H2-c: insultos que retienen solos. */
export const H2_INSULTOS = ["maricon", "maricones", "trolo", "trolos", "trola", "sudaca", "sudacas", "mogolico", "mogolicos", "mogolica", "feminazi", "feminazis"];

/** §6.H3-a: tipos de vía. */
export const H3_VIAS = ["calle", "av.", "avenida", "pasaje", "pje.", "diagonal", "diag.", "boulevard", "bulevar", "bv.", "ruta", "camino", "manzana", "mz"];
/** §6.H3-b: relación personal. */
export const H3_RELACION = ["mi vecino", "mi vecina", "mi ex", "mi jefe", "mi jefa", "el acomodador", "la acomodadora", "el profe", "la profe", "el dueno", "la duena"];
/** §6.H3-c: localizadores. */
export const H3_LOCALIZADORES = [
  "vive", "vivia", "lo encuentran", "la encuentran", "ubiquenlo", "ubiquenla", "vayan a", "visitenlo",
  "su casa", "su departamento", "su direccion", "su domicilio", "queda en", "timbre", "escrachenlo", "escrachenla",
];
