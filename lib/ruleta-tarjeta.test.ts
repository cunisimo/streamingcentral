// La tarjeta de la ruleta: dónde van las acciones, en qué orden, y de dónde
// sale cada estado.
//
// Es un guard de ESTRUCTURA, no de pintado. Lo visual se mira en pantalla; lo
// que se puede fijar acá es la distribución aprobada y los contratos que la
// tarjeta reusa, que es lo que se rompe sin que nadie se entere.
//
// ⚠️ Todo se lee SIN COMENTARIOS. El componente explica por qué las acciones se
// fueron de abajo y por qué "Verla" ya no existe, y un guard que busque esas
// palabras se dispara con su propia explicación. Ya pasó cinco veces en este
// repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const CARD = "components/ruleta/RuletaCard.tsx";
const BANNER = "components/ruleta/RuletaBanner.tsx";

// ------------------------------------------- 9. orden y lugar de los cinco

test("🔴 los cinco controles están en el orden aprobado", () => {
  const src = sinComentarios(CARD);
  const orden = ["Otra", "Ya la vi", "Más info", "Mi lista", "Atrás"];
  const posiciones = orden.map((t) => {
    const i = src.indexOf(`>${t}</span>`);
    assert.ok(i >= 0, `falta el control "${t}"`);
    return i;
  });
  for (let i = 1; i < posiciones.length; i++) {
    assert.ok(posiciones[i] > posiciones[i - 1],
      `"${orden[i]}" quedó antes que "${orden[i - 1]}"`);
  }
});

test("🔴 las acciones van ENTRE la frase y 'Por qué esta'", () => {
  // Era el punto del rediseño: antes vivían al final, después de los dos textos
  // más largos de la tarjeta, así que en un teléfono quedaban fuera de pantalla.
  const src = sinComentarios(CARD);
  const frase = src.indexOf("rlt-frase");
  const acciones = src.indexOf("rlt-actions");
  const razon = src.indexOf("Por qué esta");
  const pero = src.indexOf("rlt-pero");
  assert.ok(frase >= 0 && acciones >= 0 && razon >= 0, "falta alguna de las tres piezas");
  assert.ok(frase < acciones, "las acciones quedaron ANTES de la frase");
  assert.ok(acciones < razon, "las acciones quedaron después de 'Por qué esta'");
  assert.ok(razon < pero, "el bloque Pero tiene que seguir al final");
});

test("no quedó la fila de acciones de abajo", () => {
  assert.doesNotMatch(sinComentarios(CARD), /rlt-acciones/,
    "sigue existiendo la fila vieja: habría dos juegos de acciones");
});

test("se reusa la fila de la ficha, no un estilo nuevo", () => {
  const src = sinComentarios(CARD);
  assert.match(src, /className="actions rlt-actions"/, "no reusa `.actions` de la ficha");
  assert.equal((src.match(/className=\{?[`"]act[ `"]/g) ?? []).length >= 3, true,
    "los controles no usan la clase `.act` de la ficha");
});

// ------------------------------------------------- "Verla" -> "Más info"

test("🔴 'Más info' abre la ficha interna, no TMDB ni la plataforma", () => {
  const src = sinComentarios(CARD);
  assert.doesNotMatch(src, /Verla/, "quedó el texto viejo");
  assert.doesNotMatch(src, /watchLink/, "volvió a mandar al agregador de TMDB");
  assert.match(src, /const ficha = `\/titulo\/\$\{pick\.type\}\/\$\{pick\.id\}`/,
    "la ficha no se arma con la ruta interna");
  // El póster y el título también van a la misma ficha: son los otros dos
  // accesos que el usuario usa, y tienen que conservar el estado igual.
  assert.equal((src.match(/href=\{ficha\}/g) ?? []).length, 3,
    "los tres accesos (póster, título y Más info) tienen que ir a la misma ruta");
});

// -------------------------------------------- 8. de dónde sale cada estado

test("🔴 'Mi lista' sale del contexto compartido, como en la ficha", () => {
  const src = sinComentarios(CARD);
  assert.match(src, /useMyList\(\)/, "no usa el contexto de Mi lista");
  assert.match(src, /lista\?\.has\(pick\.id, pick\.type\)/, "no lee el estado del contexto");
  assert.match(src, /lista\?\.toggle\(pick\.id, pick\.type\)/, "no usa el toggle del contexto");
  // Si tuviera su propio estado, al volver de la ficha mostraría el valor de
  // antes de entrar: justo el caso que este cambio arregla.
  assert.doesNotMatch(src, /useState\(false\)[\s\S]{0,40}enLista|setEnLista/,
    "se inventó un estado propio para Mi lista");
});

test("'Ya la vi' conserva login, optimista y rollback", () => {
  const src = sinComentarios(CARD);
  assert.match(src, /if \(!user\) \{ router\.push\("\/cuenta"\); return; \}/, "perdió el desvío al ingreso");
  assert.match(src, /setVisto\(next\)/, "perdió la actualización optimista");
  assert.match(src, /if \(error\) setVisto\(!next\)/, "perdió el rollback");
  assert.match(src, /hasItem\("watched"/, "ya no hidrata contra la base");
});

test("las dos acciones sin sesión derivan al ingreso", () => {
  const src = sinComentarios(CARD);
  assert.equal((src.match(/router\.push\("\/cuenta"\)/g) ?? []).length, 2,
    "alguna de las dos no manda al ingreso cuando no hay sesión");
});

test("los controles tienen etiqueta accesible", () => {
  const src = sinComentarios(CARD);
  for (const a of ["aria-pressed", "aria-label"]) {
    assert.match(src, new RegExp(a), `falta ${a}`);
  }
});

// ------------------------------------------ Atrás: sólo cuando hay a dónde

test("🔴 'Atrás' no se dibuja en la primera recomendación", () => {
  const src = sinComentarios(CARD);
  assert.match(src, /\{puedeVolver && \(/, "Atrás se dibuja siempre");
  const i = src.indexOf("{puedeVolver && (");
  const j = src.indexOf(">Atrás</span>");
  assert.ok(i >= 0 && j > i, "Atrás quedó fuera del condicional");
});

// ---------------------------------------- el banner: costo y restauración

test("🔴 moverse por el historial no sale a la red", () => {
  const src = sinComentarios(BANNER);
  // `otra` sólo pide cuando el modelo devuelve "agotada".
  assert.match(src, /if \(r\.tipo === "historial"\) \{ setSesion\(r\.sesion\); return; \}/,
    "avanzar por el historial dejó de ser un camino sin fetch");
  assert.match(src, /if \(r\.tipo === "cola"\)/, "consumir de la cola dejó de ser local");
  // Y retroceder es puro estado.
  assert.doesNotMatch(src, /const irAtras[\s\S]{0,200}fetch/, "Atrás salió a pedir algo");
});

test("🔴 se decide la restauración ANTES de poder pedir nada, y con las plataformas ya hidratadas", () => {
  const src = sinComentarios(BANNER);
  assert.match(src, /if \(!platformsListas \|\| decidido\) return;/,
    "decide antes de que PlatformsContext hidrate: la firma no sería la del usuario y el snapshot se borraría");
  assert.match(src, /decidirRestauracionVista<EstadoRuleta, ExtraRuleta>/, "no usa el mecanismo compartido");
  // Y al restaurar bien consume la intención de vuelta: el Atrás del navegador
  // no pasa por el botón de la ficha, que es el otro lugar que la consume.
  const iRestaura = src.indexOf("if (e && esEstadoValido(e.datos)) {");
  const iCierra = src.indexOf("keyAlDecidir.current = platformsKey;", iRestaura);
  const iOlvida = src.indexOf("olvidarIntencion();", iRestaura);
  assert.ok(iOlvida > iRestaura && iOlvida < iCierra,
    "la intención tiene que consumirse DENTRO de la restauración exitosa, no antes ni afuera");
  assert.match(src, /volvio: consumirVuelta\(/, "no consume la marca de vuelta");
});

test("no se crea un segundo listener global", () => {
  const src = sinComentarios(BANNER);
  assert.doesNotMatch(src, /addEventListener\("popstate"/,
    "se registró otro popstate: el único vive en lista-paginada-store y lo adelanta NavHistorial");
});

test("🔴 el listener adelantado de NavHistorial sigue en pie", () => {
  // Viene del trabajo de Próximamente (commit b2d31f6) y es lo que hace que la
  // marca de vuelta exista ANTES de que la vista pregunte por ella. Sin esto, la
  // restauración de la ruleta tampoco funcionaría.
  const src = sinComentarios("components/NavHistorial.tsx");
  assert.match(src, /^registrarVueltaAtras\(\);$/m,
    "el registro dejó de estar en el scope del módulo");
});

test("🔴 al volver se restaura LA SECCION, no un desplazamiento del documento", () => {
  // Lo que ata el componente al modelo de `lib/ruleta-restauracion.test.ts`. La
  // ruleta es un bloque en el medio del Home, con el hero y los rieles arriba:
  // un `scrollY` absoluto describe el documento y no la sección.
  const src = sinComentarios(BANNER);
  assert.match(src, /<div className="dsmp" ref=\{raiz\}>/, "la sección no tiene su nodo");
  assert.match(src, /window\.scrollTo\(0, objetivoDeScroll\(pos, dondeEsta\(\)\)\)/,
    "volvió a restaurar un número de scroll en vez de la posición de la sección");
  assert.match(src, /ancla: pend \? pend\.ancla :/, "el snapshot dejó de guardar el ancla");
});

test("🔴 no volvió el bucle que sostenía el scroll", () => {
  // Se retiró: nunca se lo vio funcionar (rAF no corre en el navegador de
  // prueba) y no hay ninguna medición que lo justifique. Un solo intento.
  const src = sinComentarios(BANNER);
  assert.doesNotMatch(src, /VENTANA_REACOMODO_MS/, "volvió la ventana de reacomodo");
  assert.doesNotMatch(src, /Date\.now\(\) < hasta/, "volvió el bucle");
  assert.equal((src.match(/requestAnimationFrame/g) ?? []).length, 3,
    "los rAF esperados son los dos del acomodo y el del guardado al scrollear");
});

test("🔴 el snapshot guarda la posición PENDIENTE, no la del documento a medio restaurar", () => {
  const src = sinComentarios(BANNER);
  assert.match(src, /scrollY: pend \? pend\.y : window\.scrollY/,
    "volvió a guardar la posición del documento mientras hay una restauración en vuelo");
  // Y la pendiente sigue puesta hasta que la sección LLEGÓ: si se limpia al
  // agendar, el guardado de ese mismo commit vuelve a ver 0.
  assert.doesNotMatch(src, /scrollPendiente\.current = null;\s*\n?\s*requestAnimationFrame/,
    "se limpia la pendiente antes de aplicarla");
});

// ------------------------------------- de dónde salió el usuario a la ficha

test("🔴 los TRES accesos a la ficha anotan la intención de volver", () => {
  // Sin esto, una ficha recargada vuelve al Home con la ruleta cerrada Y con el
  // snapshot borrado. Medido en el navegador el 2026-09-06.
  const src = sinComentarios(CARD);
  assert.match(src, /registrarIntencion\(\{ origen: "ruleta", tipo: pick\.type, id: pick\.id, ruta: "\/" \}\)/,
    "la tarjeta no registra de dónde salió el usuario");
  assert.equal((src.match(/onClick=\{anotarVuelta\}/g) ?? []).length, 3,
    "los tres accesos (póster, título y Más info) tienen que anotar la vuelta");
});

test("🔴 la ficha sólo marca la vuelta si la intención es de ESA ficha", () => {
  // Marcarla siempre que el fallback corre sería peor que el bug: una ficha
  // abierta desde WhatsApp resucitaría una sesión vieja de la ruleta.
  const src = sinComentarios("components/DetailView.tsx");
  assert.match(src, /decidirVuelta\(hayHistorialInterno\(\), consumirIntencion\(tipo, id\)\)/,
    "la decisión dejó de mirar la intención de esta ficha");
  assert.match(src, /if \(d\.marcarVuelta\) marcarVuelta\(d\.ruta\);/, "no marca la vuelta en el fallback");
  assert.doesNotMatch(src, /marcarVuelta\("\/"\)/, "marca la vuelta incondicionalmente");
});
