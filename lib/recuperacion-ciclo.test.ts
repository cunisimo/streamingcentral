// El CICLO DE VIDA de una recuperación aceptada (issue #22, tercer P1).
//
// ============================================================================
// EL AGUJERO QUE ESTE ARCHIVO REPRODUCE
// ============================================================================
// En la segunda versión, `recuperacion` vivía en el `AuthProvider` global y sólo
// se limpiaba después de un éxito o de un fallo de identidad. El provider raíz
// sigue montado al navegar, así que:
//
//   1. Supabase acepta una recuperación de B;
//   2. se abandona /cuenta/reset sin guardar;
//   3. se cierra sesión, o se entra como A;
//   4. se vuelve a /cuenta/reset SIN hash ni query;
//   5. `decidirPantalla({ enlace: nada, aceptada: B })` → formulario.
//
// El test "aceptación sin nada en la URL también vale" exigía justamente eso, y
// no distinguía el montaje tardío legítimo de una reutilización posterior.
//
// ============================================================================
// EL DISEÑO: UNA AUTORIZACIÓN RECLAMABLE POR UNA SOLA PANTALLA
// ============================================================================
// Dos estados distintos, y la diferencia es la seguridad:
//
//   PENDIENTE — global, en el provider. Nace con `PASSWORD_RECOVERY`. Sobrevive
//     sólo mientras la ruta sea /cuenta/reset y hasta que una pantalla la
//     reclame. Cualquier cambio de sesión a OTRA cuenta, o un cierre de sesión,
//     la descarta. Una pantalla que llega con un error en la URL la descarta.
//
//   RECLAMADA — local a UNA instancia de la pantalla. Se toma de la pendiente
//     una sola vez (la pendiente queda en null). Muere con la instancia. Y es
//     INMUNE a los cambios de sesión del singleton: por eso el escenario 6
//     —otra pestaña entra como A con el formulario de B abierto— sigue
//     escribiendo sobre B.
//
// Estos tests se escribieron ANTES del cambio y fallaron contra `0831b86`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  leerEnlace, decidirPantalla, siguientePendiente, reclamar, cambiarPassword,
  type RecuperacionAceptada, type Pendiente,
} from "./recuperacion.ts";

const B: RecuperacionAceptada = { userId: "cuenta-B", email: "b@x", accessToken: "tok-B", refreshToken: "ref-B" };
const RESET = "/cuenta/reset";

// Un modelo mínimo del runtime: el provider tiene una pendiente; cada instancia
// de la pantalla tiene su reclamada. Los eventos son los que de verdad llegan.
function provider() {
  let pendiente: Pendiente = null;
  return {
    get pendiente() { return pendiente; },
    evento(e: Parameters<typeof siguientePendiente>[1]) { pendiente = siguientePendiente(pendiente, e); },
    // Lo que hace la pantalla al montar: intenta reclamar. Devuelve su copia LOCAL.
    montarPantalla(hash: string, query = "") {
      const enlace = leerEnlace(hash, query);
      const r = reclamar(pendiente, enlace);
      pendiente = r.pendiente;
      return { enlace, reclamada: r.reclamada };
    },
  };
}

// ===========================================================================
// LOS SEIS ESCENARIOS
// ===========================================================================

test("🔴 1. aceptación de B → salir de /cuenta/reset → volver sin enlace: NO hay formulario", () => {
  const p = provider();
  p.evento({ tipo: "aceptada", r: B, pathname: RESET });
  const primera = p.montarPantalla("");                 // la pantalla estaba montada cuando llegó
  assert.equal(primera.reclamada?.userId, "cuenta-B", "la primera pantalla tenía que reclamarla");
  assert.equal(p.pendiente, null, "🔴 la pendiente siguió disponible después de reclamada");
  p.evento({ tipo: "ruta", pathname: "/" });            // se va sin guardar
  p.evento({ tipo: "ruta", pathname: RESET });          // vuelve
  const segunda = p.montarPantalla("");
  assert.equal(segunda.reclamada, null, "🔴 una visita posterior sin enlace reclamó la recuperación vieja");
  assert.equal(
    decidirPantalla({ ready: true, enlace: segunda.enlace, aceptada: segunda.reclamada, pendiente: false }).vista,
    "sin-enlace",
  );
});

test("🔴 2. aceptación de B → signOut → volver: NO hay formulario", () => {
  const p = provider();
  p.evento({ tipo: "aceptada", r: B, pathname: RESET });                 // y supongamos que NADIE la reclamó todavía
  p.evento({ tipo: "auth", evento: "SIGNED_OUT", userId: null });
  assert.equal(p.pendiente, null, "🔴 cerrar sesión dejó tokens de recuperación reutilizables");
  const v = p.montarPantalla("");
  assert.equal(v.reclamada, null);
});

test("🔴 3. aceptación de B → iniciar sesión como A → volver: NO hay formulario", () => {
  const p = provider();
  p.evento({ tipo: "aceptada", r: B, pathname: RESET });
  p.evento({ tipo: "auth", evento: "SIGNED_IN", userId: "cuenta-A" });
  assert.equal(p.pendiente, null, "🔴 entrar como otra cuenta dejó la recuperación de B viva");
  assert.equal(p.montarPantalla("").reclamada, null);
});

test("🔴 4. aceptación anterior + token malformado nuevo: NO se combinan", () => {
  const p = provider();
  p.evento({ tipo: "aceptada", r: B, pathname: RESET });
  // Llega una pantalla con una URL que Supabase RECHAZÓ (viene con error).
  const v = p.montarPantalla("#error=access_denied&error_code=otp_expired");
  assert.equal(v.reclamada, null, "🔴 una URL rechazada reclamó una aceptación anterior");
  assert.equal(p.pendiente, null, "🔴 la pendiente sobrevivió a una URL con error");
  assert.equal(decidirPantalla({ ready: true, enlace: v.enlace, aceptada: v.reclamada, pendiente: false }).vista, "error");
});

test("5. montaje TARDÍO legítimo, después de que auth-js borró el hash: SÍ hay formulario", () => {
  // El chunk de la página llegó después de que el provider procesó el hash.
  // La URL ya está limpia, pero la aceptación es de ESTE documento, sigue en
  // /cuenta/reset y nadie la reclamó: le corresponde a esta instancia.
  const p = provider();
  p.evento({ tipo: "aceptada", r: B, pathname: RESET });
  p.evento({ tipo: "ruta", pathname: RESET });          // seguimos en la ruta
  const v = p.montarPantalla("");                       // URL limpia
  assert.equal(v.reclamada?.userId, "cuenta-B", "el montaje tardío legítimo no pudo reclamar");
  assert.equal(decidirPantalla({ ready: true, enlace: v.enlace, aceptada: v.reclamada, pendiente: false }).vista, "formulario");
  assert.equal(p.pendiente, null, "reclamada una vez, no puede quedar disponible");
});

test("6. formulario legítimo de B abierto + el singleton cambia a A: se escribe SOLO sobre B", async () => {
  const p = provider();
  p.evento({ tipo: "aceptada", r: B, pathname: RESET });
  const pantalla = p.montarPantalla("");                // reclamó: copia LOCAL
  // Otra pestaña entra como A. El provider descarta su pendiente (ya era null)
  // y NO puede tocar la copia local de la pantalla.
  p.evento({ tipo: "auth", evento: "SIGNED_IN", userId: "cuenta-A" });
  assert.equal(pantalla.reclamada?.userId, "cuenta-B", "🔴 el cambio de sesión le borró la recuperación a la pantalla abierta");
  const escrituras: string[] = [];
  const r = await cambiarPassword(
    { escribirCon: async (rec) => { escrituras.push(rec.accessToken); return { userId: rec.userId }; } },
    pantalla.reclamada, "nueva",
  );
  assert.equal(r.ok, true);
  assert.deepEqual(escrituras, ["tok-B"], "escribió con otro token que el de B");
});

// ===========================================================================
// LAS REGLAS DE LA PENDIENTE, UNA POR UNA
// ===========================================================================

test("una aceptación NUEVA reemplaza a una pendiente vieja", () => {
  const C = { ...B, userId: "cuenta-C", accessToken: "tok-C" };
  assert.equal(siguientePendiente(B, { tipo: "aceptada", r: C, pathname: RESET })?.userId, "cuenta-C");
});

test("un evento de sesión de la MISMA cuenta no descarta la pendiente", () => {
  // auth-js puede emitir TOKEN_REFRESHED o SIGNED_IN para la propia sesión de
  // recuperación. Eso no es un cambio de cuenta.
  for (const evento of ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"] as const) {
    assert.equal(siguientePendiente(B, { tipo: "auth", evento, userId: "cuenta-B" })?.userId, "cuenta-B", evento);
  }
});

test("un evento de sesión de OTRA cuenta, o sin cuenta, la descarta", () => {
  for (const evento of ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"] as const) {
    assert.equal(siguientePendiente(B, { tipo: "auth", evento, userId: "cuenta-A" }), null, evento);
    assert.equal(siguientePendiente(B, { tipo: "auth", evento, userId: null }), null, evento + " sin usuario");
  }
  assert.equal(siguientePendiente(B, { tipo: "auth", evento: "SIGNED_OUT", userId: null }), null);
});

test("salir de /cuenta/reset la descarta; quedarse la conserva", () => {
  assert.equal(siguientePendiente(B, { tipo: "ruta", pathname: "/" }), null);
  assert.equal(siguientePendiente(B, { tipo: "ruta", pathname: "/cuenta" }), null);
  assert.equal(siguientePendiente(B, { tipo: "ruta", pathname: RESET })?.userId, "cuenta-B");
  assert.equal(siguientePendiente(B, { tipo: "ruta", pathname: RESET + "/" })?.userId, "cuenta-B");
});

test("INITIAL_SESSION y PASSWORD_RECOVERY no descartan nada", () => {
  // INITIAL_SESSION llega ANTES que PASSWORD_RECOVERY (microtask vs setTimeout),
  // y puede traer la sesión previa de otra cuenta. No es un cambio de cuenta:
  // es el arranque. Y PASSWORD_RECOVERY se maneja como "aceptada", no acá.
  assert.equal(siguientePendiente(B, { tipo: "auth", evento: "INITIAL_SESSION", userId: "cuenta-A" })?.userId, "cuenta-B");
  assert.equal(siguientePendiente(B, { tipo: "auth", evento: "PASSWORD_RECOVERY", userId: "cuenta-B" })?.userId, "cuenta-B");
});

test("reclamar consume: la segunda instancia no recibe nada", () => {
  const primera = reclamar(B, leerEnlace("", ""));
  assert.equal(primera.reclamada?.userId, "cuenta-B");
  assert.equal(primera.pendiente, null);
  const segunda = reclamar(primera.pendiente, leerEnlace("", ""));
  assert.equal(segunda.reclamada, null);
});

test("reclamar con URL en error: no reclama Y descarta", () => {
  const r = reclamar(B, leerEnlace("#error=access_denied&error_code=otp_expired", ""));
  assert.equal(r.reclamada, null);
  assert.equal(r.pendiente, null);
});

test("reclamar con URL que trae tokens, o limpia, sí reclama", () => {
  // `posible-recuperacion`: la aceptación pudo llegar antes de que auth-js
  // borrara el hash (INITIAL_SESSION + tick) o después. Las dos son válidas.
  for (const hash of ["", "#type=recovery&access_token=x&refresh_token=y&expires_in=1&token_type=bearer"]) {
    assert.equal(reclamar(B, leerEnlace(hash, "")).reclamada?.userId, "cuenta-B", hash || "(vacía)");
  }
});

// ===========================================================================
// CUARTO P1: LA RUTA EN EL MOMENTO DE LA ACEPTACIÓN
// ===========================================================================
// Reproducido por Codex con el reductor real: `case "aceptada"` devolvía
// siempre `e.r`, sin mirar dónde estaba la app. Con la ruta en "/" (el
// efecto de ruta ya corrió y no vuelve a correr porque el pathname no cambia),
// una aceptación creaba una pendiente que la transición posterior a
// /cuenta/reset CONSERVABA, y una pantalla sin enlace la reclamaba.
//
// Criterio: fuera de /cuenta/reset una aceptación NUNCA genera una pendiente
// reclamable. Adentro, el montaje tardío sigue funcionando. La ruta viaja EN
// el evento, leída de una fuente actual en el momento de emitirlo — no de un
// cierre viejo de un efecto.

test("🔴 aceptación estando en `/`: no queda pendiente, y una visita posterior a Reset no reclama nada", () => {
  const p = provider();
  p.evento({ tipo: "ruta", pathname: "/" });
  p.evento({ tipo: "aceptada", r: B, pathname: "/" });
  assert.equal(p.pendiente, null, "🔴 una aceptación fuera de /cuenta/reset creó una pendiente");
  p.evento({ tipo: "ruta", pathname: RESET });          // la transición de ruta la conservaría
  const v = p.montarPantalla("");
  assert.equal(v.reclamada, null, "🔴 la reproducción de Codex: reclamó B sin enlace");
  assert.equal(decidirPantalla({ ready: true, enlace: v.enlace, aceptada: v.reclamada, pendiente: false }).vista, "sin-enlace");
});

test("🔴 aceptación estando en `/cuenta`: tampoco", () => {
  const p = provider();
  p.evento({ tipo: "ruta", pathname: "/cuenta" });
  p.evento({ tipo: "aceptada", r: B, pathname: "/cuenta" });
  assert.equal(p.pendiente, null);
  p.evento({ tipo: "ruta", pathname: RESET });
  assert.equal(p.montarPantalla("").reclamada, null);
});

test("aceptación estando en `/cuenta/reset`: SÍ queda pendiente y la pantalla la reclama (control)", () => {
  const p = provider();
  p.evento({ tipo: "ruta", pathname: RESET });
  p.evento({ tipo: "aceptada", r: B, pathname: RESET });
  assert.equal(p.pendiente?.userId, "cuenta-B");
  assert.equal(p.montarPantalla("").reclamada?.userId, "cuenta-B");
  // Con barra final también (el export de Capacitor usa trailingSlash).
  assert.equal(siguientePendiente(null, { tipo: "aceptada", r: B, pathname: RESET + "/" })?.userId, "cuenta-B");
});

test("🔴 fallback histórico al Site URL con hash válido: la aceptación cae en `/` y no habilita nada", () => {
  // Cuando `redirect_to` no estaba en la allowlist, Supabase mandaba el hash a
  // la Site URL: `https://app.yump.ar/#access_token=…&type=recovery`. auth-js
  // lo procesa igual y emite PASSWORD_RECOVERY — en el Home. Eso NO puede
  // dejar una pendiente que alguien reclame después navegando a Reset.
  const hash = "#access_token=x&refresh_token=y&expires_in=3600&token_type=bearer&type=recovery";
  assert.equal(leerEnlace(hash, "").tipo, "posible-recuperacion", "el hash sí tiene forma de recuperación");
  const p = provider();
  p.evento({ tipo: "ruta", pathname: "/" });
  p.evento({ tipo: "aceptada", r: B, pathname: "/" });  // Supabase la acepta, pero en el Home
  assert.equal(p.pendiente, null, "🔴 la aceptación en la Site URL quedó pendiente");
  p.evento({ tipo: "ruta", pathname: RESET });          // el usuario va a Reset desde el menú
  const v = p.montarPantalla("");
  assert.equal(v.reclamada, null, "🔴 Reset reclamó una aceptación que cayó en el Home");
});

test("aceptación en Reset y montaje tardío legítimo: sigue funcionando", () => {
  const p = provider();
  p.evento({ tipo: "ruta", pathname: RESET });
  p.evento({ tipo: "aceptada", r: B, pathname: RESET }); // el chunk de la página todavía no llegó
  const v = p.montarPantalla("");                       // llega, con la URL ya limpia
  assert.equal(v.reclamada?.userId, "cuenta-B", "el montaje tardío dejó de funcionar");
  assert.equal(decidirPantalla({ ready: true, enlace: v.enlace, aceptada: v.reclamada, pendiente: false }).vista, "formulario");
});

test("🔴 cambio de ruta concurrente con la aceptación: gana la ruta REAL del momento", () => {
  // (a) La navegación se comprometió antes de que auth-js emitiera el evento:
  //     la fuente actual ya dice "/", aunque el último efecto de ruta haya
  //     visto /cuenta/reset. Un pathname capturado por un cierre viejo diría
  //     Reset y aceptaría; la ruta real dice que no.
  const a = provider();
  a.evento({ tipo: "ruta", pathname: RESET });
  a.evento({ tipo: "aceptada", r: B, pathname: "/" });
  assert.equal(a.pendiente, null, "🔴 aceptó con una ruta vieja");
  // (b) La aceptación llegó en Reset y la navegación se comprometió justo
  //     después: el evento de ruta la descarta.
  const b = provider();
  b.evento({ tipo: "aceptada", r: B, pathname: RESET });
  b.evento({ tipo: "ruta", pathname: "/" });
  assert.equal(b.pendiente, null);
  b.evento({ tipo: "ruta", pathname: RESET });
  assert.equal(b.montarPantalla("").reclamada, null);
});

test("🔴 una aceptación fuera de Reset tampoco conserva una pendiente anterior", () => {
  // No hay forma legítima de que exista una pendiente y llegue una aceptación
  // en otra ruta; si pasa, lo seguro es no dejar nada.
  assert.equal(siguientePendiente(B, { tipo: "aceptada", r: { ...B, userId: "cuenta-C" }, pathname: "/" }), null);
});

// ===========================================================================
// EL PARPADEO ANTES DE RECLAMAR
// ===========================================================================
// Entre el render en que `hayRecuperacionPendiente` pasa a true y el efecto
// que reclama hay un render con la copia local en null. Ahí la pantalla NO
// puede decir "sin enlace" ni "enlace inválido": tiene que seguir cargando
// hasta reclamar o descartar.

test("🔴 pendiente sin reclamar todavía, URL limpia: cargando, no 'sin enlace'", () => {
  const v = decidirPantalla({ ready: true, enlace: leerEnlace("", ""), aceptada: null, pendiente: true });
  assert.equal(v.vista, "cargando", "🔴 mostró 'sin enlace' un render antes de reclamar");
});

test("🔴 pendiente sin reclamar todavía, URL con tokens y ready: cargando, no 'enlace inválido'", () => {
  const hash = "#access_token=x&refresh_token=y&expires_in=3600&token_type=bearer&type=recovery";
  const v = decidirPantalla({ ready: true, enlace: leerEnlace(hash, ""), aceptada: null, pendiente: true });
  assert.equal(v.vista, "cargando", "🔴 mostró 'enlace inválido' un render antes de reclamar");
});

test("pendiente + URL en error: el error manda (reclamar la va a descartar)", () => {
  const v = decidirPantalla({ ready: true, enlace: leerEnlace("#error=access_denied&error_code=otp_expired", ""), aceptada: null, pendiente: true });
  assert.equal(v.vista, "error");
});

test("sin pendiente ni reclamada, la decisión es la de siempre", () => {
  assert.equal(decidirPantalla({ ready: true, enlace: leerEnlace("", ""), aceptada: null, pendiente: false }).vista, "sin-enlace");
  assert.equal(decidirPantalla({ ready: false, enlace: leerEnlace("#type=recovery&access_token=x", ""), aceptada: null, pendiente: false }).vista, "cargando");
  assert.equal(decidirPantalla({ ready: true, enlace: leerEnlace("#type=recovery&access_token=x", ""), aceptada: null, pendiente: false }).vista, "error");
});

test("🔴 antes de `ready` la respuesta es SIEMPRE cargando: es lo que el servidor pinta y lo que el cliente hidrata", () => {
  // En SSR no hay `window`: la página renderiza con enlace "nada" y ready
  // false. Si eso dijera "sin enlace", el HTML servido mostraría ese texto en
  // TODO enlace de recuperación hasta hidratar, y el primer render del cliente
  // (que sí lee el hash) no coincidiría: medido en build de producción, un
  // hard load con hash daba React #425 ×6, #418 y #423 y re-render de la raíz.
  const casos = [
    leerEnlace("", ""),
    leerEnlace("#error=access_denied&error_code=otp_expired", ""),
    leerEnlace("#access_token=x&refresh_token=y&expires_in=3600&token_type=bearer&type=recovery", ""),
  ];
  for (const enlace of casos) {
    assert.equal(decidirPantalla({ ready: false, enlace, aceptada: null, pendiente: false }).vista, "cargando",
      "🔴 antes de ready contestó otra cosa que cargando: " + enlace.tipo);
  }
});

test("🔴 'sin enlace' recién cuando Supabase terminó de arrancar", () => {
  // Entre que auth-js borra el hash y emite PASSWORD_RECOVERY (setTimeout 0)
  // hay una ventana con URL limpia, sin pendiente y sin ready. Un chunk que
  // monte ahí no puede decir "sin enlace".
  assert.equal(decidirPantalla({ ready: false, enlace: leerEnlace("", ""), aceptada: null, pendiente: false }).vista, "cargando");
  assert.equal(decidirPantalla({ ready: true, enlace: leerEnlace("", ""), aceptada: null, pendiente: false }).vista, "sin-enlace");
});

// ===========================================================================
// QUE PRODUCCIÓN ENTRE POR ACÁ
// ===========================================================================

const sinComentarios = (rel: string) => readFileSync(rel, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const ctx = sinComentarios("components/AuthContext.tsx");
const pagina = sinComentarios("app/cuenta/reset/page.tsx");

test("🔴 el provider usa el reductor para la pendiente, y mira la ruta", () => {
  assert.match(ctx, /siguientePendiente\(/, "el provider no pasa por el reductor probado");
  assert.match(ctx, /usePathname\(\)/, "el provider no mira la ruta: la pendiente sobreviviría a la navegación");
  assert.match(ctx, /tipo:\s*"ruta"/);
  assert.match(ctx, /tipo:\s*"auth"/);
  assert.match(ctx, /tipo:\s*"aceptada"/);
});

test("🔴 la aceptación viaja con la ruta REAL del momento, no con un cierre viejo", () => {
  const i = ctx.indexOf('tipo: "aceptada"');
  assert.ok(i > 0);
  const bloque = ctx.slice(i, ctx.indexOf("} });", i));
  assert.match(bloque, /pathname:\s*window\.location\.pathname/,
    "🔴 la aceptación no lleva la ruta actual: fuera de /cuenta/reset crearía una pendiente reclamable");
});

test("🔴 la pantalla sigue cargando mientras haya pendiente sin reclamar", () => {
  assert.match(pagina, /decidirPantalla\(\{[^}]*pendiente:\s*hayRecuperacionPendiente/,
    "🔴 la decisión no sabe que hay una pendiente: parpadea 'sin enlace' antes de reclamar");
});

test("🔴 la pantalla RECLAMA y guarda su copia local; no lee la pendiente para decidir", () => {
  assert.match(pagina, /reclamarRecuperacion\(/, "la pantalla no reclama");
  assert.match(pagina, /useState<RecuperacionAceptada \| null>\(null\)/, "la copia reclamada no es estado local de la pantalla");
  assert.match(pagina, /aceptada:\s*reclamada/, "la decisión no usa la copia reclamada");
  assert.doesNotMatch(pagina, /aceptada:\s*(recuperacion|pendiente)\b/, "🔴 la decisión usa la pendiente global");
});

test("🔴 la escritura recibe la copia reclamada, no una global", () => {
  assert.match(pagina, /cambiarPasswordDeRecuperacion\(reclamada, pass\)/,
    "la escritura no recibe la recuperación reclamada por esta pantalla");
  const bloque = ctx.slice(ctx.indexOf("const cambiarPasswordDeRecuperacion = useCallback"), ctx.indexOf("}, []);", ctx.indexOf("const cambiarPasswordDeRecuperacion = useCallback")));
  assert.match(bloque, /async \(r: RecuperacionAceptada \| null, password: string\)/,
    "cambiarPasswordDeRecuperacion dejó de recibir la recuperación como argumento");
  assert.doesNotMatch(bloque, /pendiente|recuperacion\b/, "🔴 la escritura lee estado global del provider");
});

test("el contrato del provider ya no expone `recuperacion` global", () => {
  assert.doesNotMatch(ctx, /^\s*recuperacion:\s*RecuperacionAceptada \| null;/m,
    "sigue expuesta la recuperación global: cualquier pantalla podría usarla");
  assert.match(ctx, /reclamarRecuperacion:\s*\(enlace: Enlace\) => RecuperacionAceptada \| null;/);
});
