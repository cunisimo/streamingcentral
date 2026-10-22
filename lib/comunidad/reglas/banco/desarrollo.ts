// Banco de DESARROLLO (revisión §3.6): el único que se usa para ajustar
// listas y umbrales. Textos sintéticos, inventados, sin datos de personas
// reales; los números, correos y dominios son de fantasía.
//
// Tiene una parte escrita a mano y otra generada por plantillas (cada carga
// de abuso insertada en reseñas legítimas), determinística: el mismo código da
// siempre los mismos casos. El conjunto RESERVADO vive aparte
// (scripts/comunidad/banco-reservado/) y no se importa desde acá.

import type { CasoBanco } from "./evaluar.ts";

// ---------------------------------------------------------------- legítimas, a mano

const LEGITIMAS_A_MANO: readonly [categoria: string, texto: string][] = [
  ["lunfardo", "Una pavada atómica, pero me reí como un boludo. Ideal para apagar el cerebro un viernes después de laburar toda la semana."],
  ["lunfardo", "La rompe Guillermo Francella en este papel. Cada vez que aparece en pantalla la película levanta y cuando se va se cae."],
  ["lunfardo", "Medio pelo. Arranca bien, se enreda en la mitad y el final es un manotazo de ahogado. Zafa para un domingo de lluvia."],
  ["lunfardo", "Qué garrón el final, loco. Te tienen dos temporadas en vilo y lo resuelven en cinco minutos con un sueño. No va."],
  ["lunfardo", "Posta que es de lo mejor que vi en años. La fui a ver sin expectativas y salí del cine con la piel de gallina."],
  ["lunfardo", "El guion es un quilombo, saltan de una época a otra sin aviso y en un momento ya no sabés quién es quién."],
  ["lunfardo", "Una masa. Los efectos son de primera y la pelea final en el puerto está filmada con una claridad que no se ve seguido."],
  ["lunfardo", "Se nota que el director la tiene clara con el género. No inventa nada pero todo lo que hace lo hace bien, sin chamuyo."],
  ["insulto_personaje", "El padre es un hijo de puta de manual y el actor lo interpreta tan bien que te dan ganas de meterte en la pantalla."],
  ["insulto_personaje", "La protagonista es una forra insoportable durante toda la primera mitad, y justo por eso su cambio final emociona tanto."],
  ["insulto_personaje", "Qué tipo más pelotudo el detective, comete error tras error y aun así resuelve el caso de pura suerte. Igual divierte."],
  ["insulto_personaje", "El villano es un enfermo y un sádico, de esos que no te olvidás. Cada escena con él es una tensión insoportable."],
  ["crimen_drogas", "Breaking Bad sigue siendo la mejor serie sobre un profesor que se vuelve narco. La química entre los dos actores es increíble."],
  ["crimen_drogas", "Una película sobre la mafia de los años 70, con tiroteos, traiciones y un juicio que te tiene al borde del asiento."],
  ["crimen_drogas", "Muestra el consumo de cocaína sin glamour, con todo lo destructivo que tiene. Es dura pero muy necesaria de ver."],
  ["crimen_drogas", "El asesino deja pistas en cada escena y el detective tarda una eternidad en verlas. Predecible pero entretenida."],
  ["crimen_drogas", "Un policial negro con una ciudad lluviosa, un caso de secuestro y un comisario corrupto. Todo muy clásico y bien hecho."],
  ["sexo_trama", "Hay bastante desnudo y escenas de sexo, nada gratuito. Es un drama sobre una pareja que se desarma y está muy bien actuado."],
  ["sexo_trama", "Una comedia picante sobre una despedida de soltero que se va de las manos. Muchos chistes de sexo, algunos muy buenos."],
  ["sexo_trama", "La serie aborda la sexualidad adolescente con mucho respeto y sin morbo. Los personajes se sienten reales y cercanos."],
  ["violencia_trama", "La escena de la masacre en la iglesia es tremenda, cuesta mirarla. No es violencia por la violencia, tiene un peso enorme."],
  ["violencia_trama", "Una de guerra durísima. Las batallas están filmadas desde el barro y sentís el miedo de los soldados en cada plano."],
  ["violencia_trama", "El protagonista grita que lo va a matar y la tensión sube hasta el último segundo. Thriller de los que ya no se hacen."],
  ["inversion", "Wall Street muestra cómo un corredor de bolsa sin escrúpulos manipula el mercado. Michael Douglas está brillante en su papel."],
  ["inversion", "Un documental sobre la estafa de una empresa de criptomonedas que se llevó millones. Muy bien investigado y explicado."],
  ["inversion", "El lobo de Wall Street es excesiva en todo: drogas, fiestas, dinero y estafas. Tres horas que se pasan volando igual."],
  ["inversion", "Una serie sobre un fondo de inversión y las peleas de poder entre sus dueños. Billions engancha desde el primer capítulo."],
  ["inversion", "Cuenta la historia de una startup que promete ganancias imposibles a sus inversores. Inspirada en un caso real muy famoso."],
  ["plataformas", "La agregaron a Netflix hace poco y es una de las mejores películas del catálogo. No se dejen engañar por el póster horrible."],
  ["plataformas", "En Max está la versión del director, que dura media hora más y cambia bastante el final. Recomiendo esa sin dudas."],
  ["plataformas", "Prime Video tiene la serie completa con subtítulos en castellano, aunque el doblaje latino también está bastante bien."],
  ["plataformas", "La vi en Paramount+ y después busqué el libro. La serie se toma libertades pero respeta el espíritu de la novela."],
  ["plataformas", "Crunchyroll la tiene con subtítulos el mismo día que sale en Japón. Para los que siguen el anime semana a semana es ideal."],
  ["plataformas", "En Apple TV+ hay pocas series pero esta vale la suscripción sola. Ted Lasso es la comedia más amable de los últimos años."],
  ["plataformas", "Vi el tráiler en YouTube y pensé que iba a ser mala. Me equivoqué feo: es una de las sorpresas del año sin dudas."],
  ["plataformas", "La gente en TikTok habla mucho de esta serie y por una vez el entusiasmo está justificado. Atrapante de principio a fin."],
  ["plataformas", "Encontrás el tráiler en Instagram de la productora, pero no lo vean: cuenta media película. Mejor ir sin saber nada."],
  ["citas", "Como dice el personaje en el final: 'no importa cuánto corras, el pasado siempre te alcanza'. Esa frase resume todo."],
  ["citas", "'Houston, tenemos un problema' es una frase que todos conocemos, pero la película entera es mucho mejor que esa línea."],
  ["citas", "La frase 'yo soy tu padre' ya es parte de la cultura, pero ver la escena en contexto, en pantalla grande, es otra cosa."],
  ["general", "Una historia de amistad entre dos jubilados que viajan por la Patagonia. Paisajes hermosos y un humor muy tierno."],
  ["general", "No es para todos los gustos. Es lenta, contemplativa y casi sin diálogos, pero si entrás en su ritmo te hipnotiza."],
  ["general", "Los actores infantiles son el punto fuerte. Tienen una naturalidad que muchos adultos del elenco no logran nunca."],
  ["general", "Un musical que no sabía que necesitaba. Las canciones se te pegan y las coreografías son de una precisión impresionante."],
  ["general", "La fotografía en blanco y negro le da un aire de cine clásico que le queda perfecto. Muy recomendable para cinéfilos."],
  ["general", "Ideal para ver con los chicos un domingo. Tiene chistes para los grandes y una moraleja simple que no resulta pesada."],
  ["general", "La primera temporada es una joya, la segunda se estira de más y la tercera recupera el nivel. En total, muy recomendable."],
  ["general", "Un documental sobre el rock argentino de los ochenta con entrevistas inéditas. Para los fanáticos es imprescindible."],
  ["general", "Un drama familiar contado en tres tiempos que se cruzan al final. Hay que prestar atención, pero la recompensa vale."],
  ["general", "La terminé en un fin de semana. Cada capítulo termina en un gancho que te obliga a ver el siguiente sin parar."],
  ["negativa", "Aburridísima. Dos horas y media de gente hablando en habitaciones oscuras sin que pase absolutamente nada importante."],
  ["negativa", "Un desastre de principio a fin. Actuaciones forzadas, diálogos de manual y un final que parece escrito a las apuradas."],
  ["negativa", "Me dejó con gusto a poco. Tenía todo para ser una gran película y se conformó con ser una más del montón."],
  ["negativa", "La peor de la saga, lejos. Se nota que la hicieron para cumplir un contrato y nadie tenía ganas de estar ahí."],
  ["emojis", "Me hizo llorar como nunca 😭😭 La relación entre la abuela y el nieto es lo más lindo que vi en mucho tiempo ❤️"],
  ["emojis", "Terror del bueno 👻 Nada de sustos baratos, todo es atmósfera y una sensación de que algo anda mal todo el tiempo."],
  ["arroba", "Ojo, que la escena post créditos @ todos los que se van antes del final del cine les arruina la conexión con la secuela."],
  ["contacto_trama", "La trama gira alrededor de un número de teléfono que aparece en una servilleta. Un misterio chiquito muy bien llevado."],
  ["contacto_trama", "El protagonista recibe mensajes de un desconocido que le escribe por WhatsApp a la madrugada. Inquietante y original."],
  ["contacto_trama", "Una comedia sobre una influencer que pierde todos sus seguidores de Instagram en un día. Liviana y bastante divertida."],
  ["puntuacion", "Buenísima.Me encantó la parte del viaje y el final, aunque la mitad se hace un poco larga. Igual la recomiendo mucho."],
  ["puntuacion", "Excelente. Es de esas películas que te dejan pensando un buen rato.La recomiendo para ver con tiempo y sin apuro."],
  ["direccion_trama", "La historia transcurre en una casona de San Telmo y el barrio es casi un personaje más. Muy porteña y nostálgica."],
  // Negativos difíciles: números juntos que no son un contacto.
  ["numeros_dificiles", "Las tres películas son de 1984 1989 y 1990, y la última es la mejor. Hay que verlas en orden para entender todo."],
  ["numeros_dificiles", "Vi los episodios 1, 2, 3, 4, 5 y 6 en una sola noche. Los capítulos 7 y 8 los dejé para el otro día, por suerte."],
  ["numeros_dificiles", "Empieza a las 21:30 por la tele abierta y termina pasada la medianoche. Conviene grabarla y verla con calma."],
  ["numeros_dificiles", "El presupuesto fue de USD 150 millones y recaudó cinco veces más. Un éxito comercial que no esperaba nadie."],
  ["numeros_dificiles", "Le pongo un 8 de 10, con un 10 para la banda sonora y un 6 para el guion, que tiene algunos agujeros grandes."],
  ["numeros_dificiles", "Es de 2001, se filmó en 1999 y se estrenó recién en 2003 en Argentina. Llegó tarde, pero envejeció muy bien."],
  ["numeros_dificiles", "Uno, dos, tres: así cuenta el nene antes de cada truco de magia, y esa escena es la más tierna de toda la serie."],
];

// ---------------------------------------------------------------- legítimas, por plantilla (números)

const CIERRES = [
  "La recomiendo para un fin de semana tranquilo.",
  "Muy buena, de lo mejor que vi en el año.",
  "No es perfecta, pero se disfruta mucho.",
  "Los actores están muy bien y la música acompaña.",
  "Vale la pena aunque el final no convence del todo.",
  "Para ver con tiempo y sin el celular en la mano.",
  "Un clásico que envejeció muy bien.",
  "Ideal para ver en familia o con amigos.",
];

const PLANTILLAS_NUMEROS: readonly ((i: number) => [string, string])[] = [
  (i) => ["anios", `La vi en ${1985 + i} y la volví a ver en ${2010 + (i % 15)}. Me sigue pareciendo igual de buena que la primera vez.`],
  (i) => ["anios", `Ambientada entre ${1950 + i} y ${1970 + i}, retrata muy bien la época. El vestuario y los autos son impecables.`],
  (i) => ["duracion", `Dura ${1 + (i % 3)} h ${10 + i} min y no se hace larga. El ritmo está muy bien medido desde la primera escena.`],
  (i) => ["temporadas", `La temporada ${1 + (i % 5)} tiene ${6 + (i % 6)} episodios y el T${1 + (i % 5)}E${1 + (i % 6)} es el mejor de todos. Muy bien escrito.`],
  (i) => ["montos", `Costó ${100 + i * 10}.000.000 de dólares y se nota en cada efecto especial, aunque el guion no está a la altura.`],
  (i) => ["montos", `Recaudó más de ${i + 1}.${200 + i}.000.000 de dólares en todo el mundo. Un fenómeno que se entiende al verla.`],
  (i) => ["fechas", `Estrenó el ${10 + i}/0${1 + (i % 9)}/20${20 + (i % 6)} en cines y ahora está en streaming. La recomiendo sin dudas.`],
  (i) => ["fechas", `Se estrenó el ${10 + i}-0${1 + (i % 9)}-20${18 + (i % 7)} y ya es de culto. Hay escenas que se citan en todos lados.`],
  (i) => ["minutos", `En el minuto ${20 + i * 3} hay un giro que cambia todo lo que veníamos viendo. Prestá atención a los detalles del principio.`],
  (i) => ["episodios", `Del episodio ${1 + i} al ${8 + i} la serie no afloja nunca. Después tiene un bajón, pero el cierre es muy bueno.`],
  (i) => ["titulos", `${["Se7en", "M3GAN", "9-1-1", "Apollo 13", "1917", "300", "Blade Runner 2049", "Ocean's 13", "Toy Story 4", "District 9"][i % 10]} es una de esas que hay que ver al menos una vez. La puesta en escena es impecable.`],
  (i) => ["titulos", `${["28 días después", "12 hombres en pugna", "21 gramos", "127 horas", "8 Mile", "2012", "Rec 2", "Misión imposible 7", "Argentina, 1985", "Nueve reinas"][i % 10]} me sorprendió mucho. No esperaba nada y terminó siendo de lo mejor del mes.`],
  (i) => ["porcentajes", `El ${60 + i}% de la película es pura acción y el resto es relleno. Igual la disfruté bastante, es entretenida.`],
  (i) => ["edades", `Apta para chicos de ${5 + (i % 6)} a ${10 + (i % 6)} años. Los dibujos son lindos y la historia es simple pero emotiva.`],
  (i) => ["ranking", `La puse ${1 + i} de 10 en mi lista del año. Tiene momentos brillantes y otros bastante flojos, pero suma.`],
];

function legitimasPorPlantilla(): CasoBanco[] {
  const salida: CasoBanco[] = [];
  PLANTILLAS_NUMEROS.forEach((plantilla, p) => {
    for (let i = 0; i < 6; i++) {
      const [categoria, cuerpo] = plantilla(i);
      salida.push({
        id: `D-LG-${String(p + 1).padStart(2, "0")}-${i + 1}`, tipo: "resena", grupo: "legitima",
        categoria: `numeros.${categoria}`, esperado: "publicar", texto: `${cuerpo} ${CIERRES[(p + i) % CIERRES.length]}`,
      });
    }
  });
  return salida;
}

// ---------------------------------------------------------------- abuso, por plantilla

// Reseñas legítimas que "cargan" el abuso: inicio y final.
const PORTADORES: readonly [string, string][] = [
  ["Muy buena película, la vi el sábado con amigos.", "La recomiendo para un fin de semana tranquilo."],
  ["Una serie atrapante desde el primer capítulo.", "No se la pierdan, vale cada minuto."],
  ["El final me dejó pensando un buen rato.", "Los actores están todos muy bien."],
  ["Terror del bueno, sin sustos baratos.", "Ideal para ver de noche con la luz apagada."],
  ["Una comedia liviana que se disfruta mucho.", "Perfecta para desenchufarse un rato."],
  ["Documental muy bien investigado y filmado.", "Aprendí un montón de cosas que no sabía."],
];

interface Carga {
  categoria: string;
  variante: "directa" | "ofuscada";
  claro: boolean;
  esperado: "rechazar" | "retener";
  texto: string;
}

const c = (categoria: string, variante: Carga["variante"], esperado: Carga["esperado"], texto: string, claro = esperado === "rechazar"): Carga =>
  ({ categoria, variante, claro, esperado, texto });

const CARGAS: readonly Carga[] = [
  // teléfono
  c("contacto.telefono", "directa", "rechazar", "Si querés charlarla llamame al 1144556677."),
  c("contacto.telefono", "directa", "rechazar", "Mi número es +54 9 11 2233-4455, escribime."),
  c("contacto.telefono", "directa", "rechazar", "Consultas al 011 4455-6677 de lunes a viernes."),
  c("contacto.telefono", "ofuscada", "rechazar", "Pasame un mensaje al 11 44 55 66 77."),
  c("contacto.telefono", "ofuscada", "rechazar", "Contacto 1 1 4 4 5 5 6 6 7 7 por cualquier cosa."),
  c("contacto.telefono", "ofuscada", "rechazar", "Mi cel es uno uno cuatro cuatro cinco cinco seis seis siete siete."),
  c("contacto.telefono", "ofuscada", "rechazar", "Agendate 11-cuatro cuatro-55-66-77 y hablamos."),
  c("contacto.telefono", "ofuscada", "rechazar", "Llamame al １１４４５５６６７７ cuando quieras."),
  c("contacto.telefono", "ofuscada", "rechazar", "Mi número: 11​44​55​66​77, mandame algo."),
  c("contacto.telefono", "ofuscada", "rechazar", "Te dejo el 11.44.55.66.77 para comentarla."),
  c("contacto.telefono", "ofuscada", "rechazar", "Escribime al (11) 4455 6677 y te paso más."),
  c("contacto.telefono", "ofuscada", "rechazar", "Cel 4455667 si querés sumarte al grupo."),
  c("contacto.telefono", "ofuscada", "rechazar", "Wsp quince cuatro cuatro cinco cinco seis seis siete siete."),
  c("contacto.telefono", "ofuscada", "rechazar", "Mi tel es 44 55 66 7, llamá a la tarde."),
  // correo
  c("contacto.email", "directa", "rechazar", "Escribime a ana.lopez@hotmail.com para hablar."),
  c("contacto.email", "ofuscada", "rechazar", "Mandame un correo a ana arroba hotmail punto com."),
  c("contacto.email", "ofuscada", "rechazar", "Contacto: ana (at) gmail (dot) com, respondo todo."),
  c("contacto.email", "ofuscada", "rechazar", "Escribile a ana[arroba]outlook[punto]com y te cuenta."),
  c("contacto.email", "ofuscada", "rechazar", "Mi correo es a n a @ g m a i l . c o m, escribime."),
  c("contacto.email", "ofuscada", "rechazar", "Mandá mail a ana@gmail, sin el punto com."),
  c("contacto.email", "ofuscada", "rechazar", "Consultas a ana＠yahoo．com, respondo rápido."),
  c("contacto.email", "ofuscada", "rechazar", "Escribime a ana {arroba} live {punto} com."),
  // enlace
  c("enlace", "directa", "rechazar", "La tenés gratis en www.verpelis.org en HD."),
  c("enlace", "directa", "rechazar", "Mirala en https://cuevana.xyz/peli sin anuncios."),
  c("enlace", "ofuscada", "rechazar", "Está entera en verpelis punto com, buscala."),
  c("enlace", "ofuscada", "rechazar", "Entrá a bit(.)ly/abc123 y la ves completa."),
  c("enlace", "ofuscada", "rechazar", "La subí a verpelis . net, pasen y vean."),
  c("enlace", "ofuscada", "rechazar", "Descargala de verpelis[.]com en buena calidad."),
  c("enlace", "ofuscada", "rechazar", "Busquen t.me/canalpelis que suben todo."),
  c("enlace", "ofuscada", "rechazar", "La tenés en verpelis.c0m sin registrarte."),
  c("enlace", "ofuscada", "rechazar", "Está en w w w . v e r p e l i s . c o m gratis."),
  c("enlace", "ofuscada", "rechazar", "Pedila por wa.me/5491144556677 y te la paso."),
  c("enlace", "ofuscada", "rechazar", "Todos mis links en linktr.ee/verpelis, pasen."),
  c("enlace", "ofuscada", "rechazar", "La tengo en verpelis(punto)ar para descargar."),
  // redes
  c("contacto.red", "directa", "rechazar", "Seguime en Instagram @ana_cine para más."),
  c("contacto.red", "directa", "rechazar", "Escribime por Telegram y te paso la colección."),
  c("contacto.red", "ofuscada", "rechazar", "Mi insta: ana.cine, mandame dm."),
  c("contacto.red", "ofuscada", "rechazar", "Agregame al wsp y te paso más pelis así."),
  c("contacto.red", "ofuscada", "rechazar", "Hablame al tiktok anacine y te recomiendo más."),
  c("contacto.red", "ofuscada", "rechazar", "Dm en instagram que tengo la lista completa."),
  c("contacto.red", "ofuscada", "rechazar", "Buscame en discord como anacine, armamos grupo."),
  c("contacto.red", "ofuscada", "rechazar", "T3l3gram: anacine, ahí subo todo."),
  c("contacto.red", "ofuscada", "rechazar", "Me encuentran en 1nstagram como ana.cine, escribime."),
  // spam
  c("spam", "directa", "retener", "Ganá dinero desde tu casa invirtiendo en bitcoin, ganancias garantizadas."),
  c("spam", "directa", "retener", "Estoy sorteando 5 cuentas gratis, participá compartiendo esta reseña."),
  c("spam", "directa", "retener", "Invertí en trading con 100 dólares y retirá ganancias todos los días."),
  c("spam", "directa", "retener", "Ingresos extra sin salir de tu casa con cripto, consultame por privado."),
  c("spam", "directa", "retener", "Promo del día: descuento del 50% en suscripciones, reclamá tu cupón ya."),
  c("spam", "ofuscada", "retener", "Gané 300 USDT en una semana con una app de inversión, es plata fácil."),
  // odio
  c("odio", "directa", "retener", "La hicieron esos negros de mierda de la productora."),
  c("odio", "directa", "retener", "Una película para maricones, no pierdan el tiempo."),
  c("odio", "directa", "retener", "Los paraguayos de mierda del elenco no saben actuar."),
  c("odio", "directa", "retener", "Hay que echar a todos los bolivianos de la industria."),
  c("odio", "ofuscada", "retener", "Película de m4ric0nes para tr0los, no la vean."),
  c("odio", "ofuscada", "retener", "Otra más hecha por sud4cas que no saben filmar."),
  // amenazas
  c("amenaza", "directa", "retener", "Al que la criticó: sé dónde vivís, cuidate."),
  c("amenaza", "directa", "retener", "Director, te voy a romper la cara si te veo."),
  c("amenaza", "directa", "retener", "Ojalá te mueras, vos que dijiste que era mala."),
  c("amenaza", "directa", "retener", "Te voy a buscar y vas a ver lo que es bueno."),
  // datos personales
  c("datos_personales", "directa", "retener", "La reseña de abajo es de Ana López, DNI 28.456.789."),
  c("datos_personales", "directa", "retener", "El autor vive en Belgrano 2345, vayan a decirle algo."),
  c("datos_personales", "directa", "retener", "Su dirección es Sarmiento 876, tóquenle el timbre."),
  c("datos_personales", "directa", "retener", "El crítico tiene CUIL 27-28456789-3, búsquenlo."),
  // derivación al perfil
  c("perfil", "directa", "retener", "Si querés el link mirá mi perfil, ahí está."),
  c("perfil", "directa", "retener", "Mi contacto está en mi nombre de usuario, escribime."),
  c("perfil", "directa", "retener", "Fijate en mi nombre que ahí te dejé todo."),
];

function abusoPorPlantilla(): CasoBanco[] {
  const salida: CasoBanco[] = [];
  CARGAS.forEach((carga, k) => {
    // Cada carga en tres portadores distintos.
    for (let r = 0; r < 3; r++) {
      const [inicio, fin] = PORTADORES[(k + r * 2) % PORTADORES.length];
      salida.push({
        id: `D-AB-${String(k + 1).padStart(3, "0")}-${r + 1}`, tipo: "resena", grupo: "abuso",
        categoria: carga.categoria, variante: carga.variante, claro: carga.claro, esperado: carga.esperado,
        texto: `${inicio} ${carga.texto} ${fin}`,
      });
    }
  });
  return salida;
}

// ---------------------------------------------------------------- abuso, a mano

const ABUSO_A_MANO: readonly CasoBanco[] = [
  {
    id: "D-AM-001", tipo: "resena", grupo: "abuso", categoria: "anomalo", variante: "directa", esperado: "retener",
    texto: "LA MEJOR SERIE DE LA HISTORIA, NO PUEDO CREER QUE NO LA HAYAN VISTO TODAVÍA, VÉANLA AHORA MISMO SIN DUDARLO.",
  },
  {
    id: "D-AM-002", tipo: "resena", grupo: "abuso", categoria: "anomalo", variante: "directa", esperado: "retener",
    texto: "jajajajajajajajajajajajajaja buenísima jajajajajajajajajajajajajaja buenísima jajajajajajajajajajajajajajaja",
  },
  {
    id: "D-AM-003", tipo: "resena", grupo: "abuso", categoria: "anomalo", variante: "directa", esperado: "retener",
    texto: "buena buena buena buena buena buena buena buena buena buena buena buena buena buena buena buena buena buena",
  },
  {
    id: "D-AM-004", tipo: "resena", grupo: "abuso", categoria: "contacto.partido", variante: "ofuscada", claro: false, esperado: "frenar",
    contexto: { textosRecientes: ["Muy buena película. Si quieren hablar de cine, mi número arranca con 11 44 y lo sigo en otra reseña."] },
    texto: "Como les decía en la otra reseña, el resto del número es 55 66 77, escribime y armamos un grupo para comentar estrenos.",
  },
  {
    id: "D-AM-005", tipo: "resena", grupo: "abuso", categoria: "contacto.partido", variante: "ofuscada", claro: false, esperado: "frenar",
    contexto: { textosRecientes: ["Primera parte del contacto para los que quieren la lista: 15 22", "Segunda parte: 33 44"] },
    texto: "Y la última parte es 55 66, mandame un mensaje al número completo y te paso la lista de películas de terror que tengo.",
  },
];

const LEGITIMAS_CON_CONTEXTO: readonly CasoBanco[] = [
  {
    id: "D-LC-001", tipo: "resena", grupo: "legitima", categoria: "contexto", esperado: "publicar",
    contexto: { textosRecientes: ["La temporada 1 tiene 10 episodios y la 2 tiene 8, todas muy buenas.", "La vi en 2019 y en 2023."] },
    texto: "La temporada 3 tiene 12 episodios y el número musical del capítulo 7 es lo mejor de toda la serie. Una joya total.",
  },
  {
    id: "D-LC-002", tipo: "resena", grupo: "legitima", categoria: "contexto", esperado: "publicar",
    contexto: { textosRecientes: ["Recaudó 1.000.000.000 de dólares y se nota.", "Dura 2 h 30 min."] },
    texto: "La secuela recaudó todavía más, unos 1.500.000.000 de dólares, y es bastante peor. El número de efectos especiales no alcanza.",
  },
];

// ---------------------------------------------------------------- regresiones E1.1

// Casos ya DIVULGADOS (fallos del reservado 1 y ejemplos de la auditoría de
// ffa5061), en pares: la variante maliciosa y una benigna parecida. No son
// medición independiente: son regresiones para que no vuelvan.
const PREFIJO_AUDITORIA = "La película tiene buenos actores y una historia que mantiene el interés hasta el final. ";

const REGRESIONES: readonly [familia: string, malicioso: string, benigno: string][] = [
  // A1: excepciones numéricas con intención de contacto; letras por dígitos.
  ["telefono.miles", "Escribime al 1.155.512.345 para charlar.", "Recaudó 1.155.512.345 dólares en todo el mundo."],
  ["telefono.anios", "Escribime al 1985 2026 para charlar.", "Las fechas clave de la saga son 1985 2026 y 2030."],
  ["telefono.letras", "Escribime al 11 5O5O 1234 para charlar.", "El robot modelo 5O5O aparece recién en el capítulo 12."],
  ["telefono.letras", "Teléfono 11 5O5O 1234, preguntá por la colección.", "El episodio 5O es el mejor de la temporada, sin dudas."],
  ["telefono.fecha", "Llamame al 15-03-2024, es mi número de siempre.", "Estrenó el 15-03-2024 en salas de todo el país."],
  ["telefono.letras", "Mandame un mensaje al 1l 44 5S 66 77 y te cuento.", "El droide R2 y el modelo 5S aparecen juntos al final."],
  ["telefono.letras", "Mi cel: 11 44 55 66 7O, escribime cuando quieras.", "Los años 7O y 8O están muy bien recreados en la serie."],
  // A2: correo "usuario en/de proveedor".
  ["correo.proveedor", "Mi correo es cuenta_demo en gmail para charlar.", "El hacker entra al correo de gmail de su jefe y descubre todo."],
  ["correo.proveedor", "Escribime a anita1990 de hotmail y te paso la lista.", "Me llegó un mail de hotmail con la promo del estreno."],
  ["correo.proveedor", "Mandá un mensaje a demo.cine en outlook y te contesto.", "En la serie todos usan Outlook en la oficina y es parte del chiste."],
  ["correo.proveedor", "Para más, ana.cine en yahoo, escribime cuando quieras.", "Yahoo era el buscador de moda en la época de la serie."],
  // A2: dominios con confusables en la terminación.
  ["dominio.confusable", "Visita ejemplo.coм para encontrar novedades.", "Левиафан es una película rusa durísima y muy recomendable."],
  ["dominio.confusable", "Está entera en verpelis.nеt sin cortes.", "La versión en ruso se llama Сталкер y es una joya."],
  ["dominio.confusable", "La tenés en verpelis.οrg gratis.", "El título griego es Ωμέγα y la traducción es muy libre."],
  ["dominio.confusable", "Mirala en cinemania.сοм y comentá.", "Me hizo acordar a una película polaca de los 80."],
  // A3: contacto.red en diálogos de ficción frente a pedidos reales.
  ["red.dialogo", "Agregame al wsp y charlamos de la peli.", "El padre le dice \"escribime\" a su hija; luego ella mira Instagram, y esa escena me emocionó."],
  ["red.dialogo", "Escribime por insta, soy cinefila_demo.", "En una escena él le dice 'mandame un mensaje por WhatsApp cuando llegues' y nunca llega."],
  ["red.dialogo", "Seguime en tiktok que subo más reseñas.", "Agregame a la lista de fans: la vi tres veces. Después busqué el tráiler en TikTok."],
];

function regresiones(): CasoBanco[] {
  return REGRESIONES.flatMap(([familia, malicioso, benigno], i): CasoBanco[] => {
    const n = String(i + 1).padStart(2, "0");
    const categoria = familia.startsWith("telefono") ? "contacto.telefono"
      : familia.startsWith("correo") ? "contacto.email"
      : familia.startsWith("dominio") ? "enlace" : "contacto.red";
    return [
      { id: `D-RG-${n}-M`, tipo: "resena", grupo: "abuso", categoria, variante: "ofuscada", claro: true, esperado: "rechazar", texto: PREFIJO_AUDITORIA + malicioso },
      { id: `D-RG-${n}-B`, tipo: "resena", grupo: "legitima", categoria: `regresion.${familia}`, esperado: "publicar", texto: PREFIJO_AUDITORIA + benigno },
    ];
  });
}

// ---------------------------------------------------------------- nombres

const NOMBRES_LEGITIMOS = [
  "Ana", "Juli_92", "El Tano", "Cinéfilo de Flores", "Vale1988", "Mati", "Lola ☀️", "Paz",
  "Guille R.", "Caro_88", "Tomi 2000", "Negro Rodríguez", "La China", "Sol.M", "Fran Cine",
  "Rocío del Sur", "Lucho 7", "Mel", "Gabi_C", "Pato Bustos", "Agus 1999", "Flor", "Ramiro",
];

const NOMBRES_ABUSO: readonly [categoria: string, variante: "directa" | "ofuscada", esperado: "rechazar" | "retener", texto: string][] = [
  ["contacto.telefono", "directa", "rechazar", "Ana 1144556677"],
  ["contacto.telefono", "ofuscada", "rechazar", "11 44 55 66 77 Ana"],
  ["contacto.telefono", "ofuscada", "rechazar", "uno uno cuatro cuatro 55"],
  ["contacto.telefono", "ofuscada", "rechazar", "cel 4455667"],
  ["contacto.email", "directa", "rechazar", "ana@hotmail.com"],
  ["contacto.email", "ofuscada", "rechazar", "ana arroba gmail"],
  ["enlace", "directa", "rechazar", "verpelis.org"],
  ["enlace", "ofuscada", "rechazar", "verpelis punto com"],
  ["enlace", "ofuscada", "rechazar", "bit(.)ly/abc"],
  ["contacto.red", "directa", "rechazar", "@ana_cine"],
  ["contacto.red", "directa", "rechazar", "ig ana.cine"],
  ["contacto.red", "ofuscada", "rechazar", "1nstagram ana"],
  ["contacto.red", "ofuscada", "rechazar", "wsp ana"],
  ["contacto.red", "ofuscada", "rechazar", "Escribime Ana"],
  ["odio", "directa", "retener", "paraguayo de mierda"],
  ["odio", "directa", "retener", "maricon"],
  ["odio", "ofuscada", "retener", "tr0lo"],
  ["odio", "ofuscada", "retener", "sud4ca"],
];

function nombres(): CasoBanco[] {
  return [
    ...NOMBRES_LEGITIMOS.map((texto, i): CasoBanco => ({
      id: `D-NL-${String(i + 1).padStart(2, "0")}`, tipo: "nombre", grupo: "legitima", categoria: "nombre", esperado: "publicar", texto,
    })),
    ...NOMBRES_ABUSO.map(([categoria, variante, esperado, texto], i): CasoBanco => ({
      id: `D-NA-${String(i + 1).padStart(2, "0")}`, tipo: "nombre", grupo: "abuso", categoria, variante,
      claro: esperado === "rechazar", esperado, texto,
    })),
  ];
}

export const CASOS_DESARROLLO: readonly CasoBanco[] = [
  ...LEGITIMAS_A_MANO.map(([categoria, texto], i): CasoBanco => ({
    id: `D-LM-${String(i + 1).padStart(3, "0")}`, tipo: "resena", grupo: "legitima", categoria, esperado: "publicar", texto,
  })),
  ...legitimasPorPlantilla(),
  ...LEGITIMAS_CON_CONTEXTO,
  ...abusoPorPlantilla(),
  ...ABUSO_A_MANO,
  ...regresiones(),
  ...nombres(),
];
