// Las reglas de la pantalla de recuperación (issue #22).
//
// ============================================================================
// QUÉ PRUEBA ESTE ARCHIVO, Y QUÉ NO
// ============================================================================
// Prueba las DECISIONES —qué se muestra, qué se escribe y con qué credenciales—
// con dependencias inyectadas. No monta React, no habla con Supabase. Lo que
// pasa en el navegador de verdad está en
// `docs/medidas/2026-09-10-recuperacion-password.md`, ejecutado sobre un build
// de producción.
//
// ============================================================================
// LOS DOS AGUJEROS QUE LA AUDITORÍA DE `fb89b45` ENCONTRÓ, Y QUE ACÁ FALLAN
// PRIMERO
// ============================================================================
// 1. `#type=recovery&access_token=basura` con una sesión abierta habilitaba el
//    formulario: un `type=recovery` escrito en la URL y un JWT decodificado sin
//    verificar NO son prueba de nada. La prueba es el evento `PASSWORD_RECOVERY`
//    de Supabase, que sólo se emite DESPUÉS de que el servidor validó el token.
// 2. La identidad se comprobaba DESPUÉS de escribir. La escritura tiene que ir
//    atada a la recuperación aceptada, en un cliente que nadie más pueda mover.
//
// Estos tests se escribieron ANTES del cambio y fallaron contra `fb89b45`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  leerEnlace, decidirPantalla, mensajeDeEnlace, hayTokensDeRecuperacion,
  cambiarPassword, type RecuperacionAceptada, type DepsEscritura,
} from "./recuperacion.ts";

// El fragmento tal cual lo devolvió Supabase en la reproducción del 10/09.
const HASH_CONSUMIDO =
  "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
const HASH_CON_TOKENS =
  "#access_token=lo-que-sea&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery";

const ACEPTADA_B: RecuperacionAceptada = {
  userId: "cuenta-B", email: "b@ejemplo", accessToken: "token-de-B", refreshToken: "refresh-de-B",
};

// ===========================================================================
// P1 — LA URL NO ES PRUEBA. LA SESIÓN TAMPOCO. SÓLO LO QUE SUPABASE ACEPTÓ.
// ===========================================================================

test("🔴 P1: type=recovery con token basura y sesión abierta: NO hay formulario", () => {
  // El caso exacto de la auditoría. Antes: `formulario`.
  for (const hash of [
    "#type=recovery&access_token=basura",
    "#type=recovery&access_token=a.b.c",
    "#type=recovery&access_token=",
    HASH_CON_TOKENS,   // tokens con la forma correcta, pero que Supabase NUNCA aceptó
  ]) {
    const p = decidirPantalla({ ready: true, enlace: leerEnlace(hash, ""), aceptada: null, pendiente: false });
    assert.notEqual(p.vista, "formulario", `habilitó el formulario con ${hash}`);
  }
});

test("🔴 P1: el formulario sólo aparece con una recuperación ACEPTADA por Supabase", () => {
  // La aceptación viene del evento PASSWORD_RECOVERY, que el AuthProvider recibe
  // sólo después de que Supabase validó el token contra /user. La URL sirve para
  // saber si hay que esperar; no decide nada.
  const conAceptacion = decidirPantalla({
    ready: true, enlace: leerEnlace(HASH_CON_TOKENS, ""), aceptada: ACEPTADA_B, pendiente: false,
  });
  assert.equal(conAceptacion.vista, "formulario");
  assert.equal(conAceptacion.vista === "formulario" ? conAceptacion.aceptada.userId : null, "cuenta-B");
});

test("🔴 enlace consumido: error con motivo, aunque haya recuperación previa colgada", () => {
  const p = decidirPantalla({ ready: true, enlace: leerEnlace(HASH_CONSUMIDO, ""), aceptada: null, pendiente: false });
  assert.equal(p.vista, "error");
  assert.match(p.vista === "error" ? p.mensaje : "", /venció|abrió antes/);
});

test("sin nada en la URL y sin aceptación: sin-enlace, aunque haya sesión", () => {
  // No hay parámetro de sesión: la sesión ya no participa de esta decisión.
  assert.equal(decidirPantalla({ ready: true, enlace: leerEnlace("", ""), aceptada: null, pendiente: false }).vista, "sin-enlace");
});

test("tokens en la URL y Supabase todavía decidiendo: cargando, no error", () => {
  assert.equal(
    decidirPantalla({ ready: false, enlace: leerEnlace(HASH_CON_TOKENS, ""), aceptada: null, pendiente: false }).vista,
    "cargando",
  );
});

test("tokens en la URL, Supabase terminó y NO aceptó: error, no formulario", () => {
  const p = decidirPantalla({ ready: true, enlace: leerEnlace(HASH_CON_TOKENS, ""), aceptada: null, pendiente: false });
  assert.equal(p.vista, "error");
});

test("una aceptación RECLAMADA manda aunque la URL esté limpia (montaje tardío)", () => {
  // `aceptada` acá es la copia que ESTA pantalla reclamó, no la pendiente global.
  // Después de que Supabase procesa el hash lo BORRA de la barra: el chunk que
  // llega tarde ve una URL limpia y aun así tiene que mostrar el formulario.
  // Lo que impide REUTILIZAR una aceptación vieja no es esta función sino
  // `reclamar`, que la consume — ver lib/recuperacion-ciclo.test.ts.
  assert.equal(
    decidirPantalla({ ready: true, enlace: leerEnlace("", ""), aceptada: ACEPTADA_B, pendiente: false }).vista,
    "formulario",
  );
});

// ===========================================================================
// P1 — LA ESCRITURA VA ATADA A LA RECUPERACIÓN ACEPTADA, NO A LA SESIÓN DEL
// MOMENTO. CERO ESCRITURAS SOBRE OTRA CUENTA.
// ===========================================================================

/** Un doble de las dependencias que anota TODO lo que se le pide. */
function deps(opts: { escribeComo?: string | null; falla?: string } = {}) {
  const registro = { escrituras: [] as { conToken: string; password: string }[], singletonLeido: 0 };
  const d: DepsEscritura = {
    escribirCon: async (r, password) => {
      registro.escrituras.push({ conToken: r.accessToken, password });
      if (opts.falla) return { userId: null, error: opts.falla };
      return { userId: opts.escribeComo === undefined ? r.userId : opts.escribeComo };
    },
  };
  return { d, registro };
}

test("🔴 P1: sin recuperación aceptada NO se escribe, aunque haya sesión", async () => {
  const { d, registro } = deps();
  const r = await cambiarPassword(d, null, "nueva-clave");
  assert.equal(r.ok, false);
  assert.equal(r.ok ? "" : r.motivo, "sin-recuperacion");
  assert.equal(registro.escrituras.length, 0, "🔴 escribió sin recuperación aceptada");
});

test("🔴 P1: la escritura usa EL TOKEN DE LA RECUPERACIÓN, no la sesión que haya", async () => {
  // Modela el escenario de la auditoría: entre abrir el formulario y pulsar
  // Guardar, otra pestaña entró como la cuenta A. El singleton de Supabase ahora
  // tiene la sesión de A. La escritura tiene que ir con el token de B igual.
  const { d, registro } = deps();
  const r = await cambiarPassword(d, ACEPTADA_B, "nueva-clave");
  assert.equal(r.ok, true);
  assert.equal(registro.escrituras.length, 1);
  assert.equal(registro.escrituras[0].conToken, "token-de-B",
    "🔴 la escritura no fue con el token de la recuperación aceptada");
});

test("🔴 P1: si lo escrito no es la cuenta aceptada, se informa fallo — y fue una sola escritura", async () => {
  // Con el cliente atado esto no puede pasar; se verifica igual porque el costo
  // de equivocarse es cambiarle la contraseña a otra persona.
  const { d, registro } = deps({ escribeComo: "cuenta-A" });
  const r = await cambiarPassword(d, ACEPTADA_B, "nueva-clave");
  assert.equal(r.ok, false);
  assert.equal(r.ok ? "" : r.motivo, "identidad");
  assert.equal(registro.escrituras.length, 1);
});

test("un fallo de Supabase al escribir se informa como fallo, no como éxito", async () => {
  const { d } = deps({ falla: "New password should be different from the old password." });
  const r = await cambiarPassword(d, ACEPTADA_B, "nueva-clave");
  assert.equal(r.ok, false);
  assert.equal(r.ok ? "" : r.motivo, "fallo");
  assert.match(r.ok ? "" : r.detalle ?? "", /different/);
});

test("la contraseña no se valida acá: eso es de la pantalla", async () => {
  // El flujo escribe lo que le dan. Longitud y coincidencia las decide el
  // formulario antes de llamar; mezclarlas acá escondería un camino sin escritura.
  const { d, registro } = deps();
  await cambiarPassword(d, ACEPTADA_B, "x");
  assert.equal(registro.escrituras.length, 1);
});

// ===========================================================================
// LECTURA DE LA URL — sólo clasifica. Nunca decide.
// ===========================================================================

test("el error se lee del fragmento Y de la query", () => {
  for (const [hash, query] of [[HASH_CONSUMIDO, ""], ["", "?error=access_denied&error_code=otp_expired"]]) {
    const e = leerEnlace(hash, query);
    assert.equal(e.tipo, "error");
    assert.equal(e.tipo === "error" ? e.codigo : null, "otp_expired");
  }
});

test("hayTokensDeRecuperacion: lo que hace que valga la pena ESPERAR a Supabase", () => {
  assert.equal(hayTokensDeRecuperacion(HASH_CON_TOKENS), true);
  assert.equal(hayTokensDeRecuperacion("#type=recovery&access_token=basura"), true, "basura también se espera: Supabase la rechaza, no nosotros");
  assert.equal(hayTokensDeRecuperacion("#access_token=x&type=signup"), false, "un enlace de signup no es una recuperación");
  assert.equal(hayTokensDeRecuperacion("#access_token=x"), false);
  assert.equal(hayTokensDeRecuperacion(HASH_CONSUMIDO), false);
  assert.equal(hayTokensDeRecuperacion(""), false);
});

test("un enlace de confirmación de mail se clasifica como 'nada'", () => {
  assert.equal(leerEnlace("#access_token=x&type=signup", "").tipo, "nada");
});

// ===========================================================================
// MENSAJES
// ===========================================================================

test("cada causa tiene su mensaje, y ninguno es el genérico de antes", () => {
  const vencido = mensajeDeEnlace("otp_expired", "Email link is invalid or has expired");
  const denegado = mensajeDeEnlace("access_denied", null);
  const otro = mensajeDeEnlace("algo_nuevo", "Se rompió algo raro");
  assert.notEqual(vencido, denegado);
  assert.notEqual(vencido, otro);
  assert.match(otro, /Se rompió algo raro/);
  for (const m of [vencido, denegado, otro]) {
    assert.notEqual(m, "El enlace no es válido o ya venció. Volvé a pedir la recuperación desde tu cuenta.");
  }
});

test("el mensaje del vencido nombra las dos causas posibles", () => {
  const m = mensajeDeEnlace("otp_expired", null);
  assert.match(m, /venció/);
  assert.match(m, /abrió antes/);
});

// ===========================================================================
// QUE PRODUCCIÓN ENTRE POR ACÁ
// ===========================================================================
// Componentes de React: no se montan con `node --test`. Se inspecciona el fuente
// sin comentarios, mismo recurso que `lib/cache-delega.test.ts`.

const sinComentarios = (rel: string) => readFileSync(rel, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const pagina = sinComentarios("app/cuenta/reset/page.tsx");
const ctx = sinComentarios("components/AuthContext.tsx");

test("🔴 la aceptación sale del evento PASSWORD_RECOVERY, en el AuthProvider", () => {
  assert.match(ctx, /"PASSWORD_RECOVERY"/, "el AuthProvider no escucha PASSWORD_RECOVERY");
  assert.match(ctx, /tipo:\s*"aceptada",[\s\S]{0,80}r:\s*\{[\s\S]{0,200}userId:\s*session\.user\.id/,
    "la aceptación no se construye con la sesión del evento");
});

test("🔴 la página NO usa `user`, `sujetoDelToken` ni la URL para habilitar el formulario", () => {
  assert.doesNotMatch(pagina, /sujetoDelToken/, "volvió el JWT decodificado sin verificar");
  assert.doesNotMatch(pagina, /!\s*user\s*\?/, "volvió el `!user ?`");
  assert.match(pagina, /aceptada:\s*reclamada/, "la decisión no recibe la recuperación RECLAMADA por esta pantalla");
});

test("🔴 la escritura va por cambiarPasswordDeRecuperacion, no por updatePassword", () => {
  assert.doesNotMatch(pagina, /updatePassword\(/, "la página sigue escribiendo con la sesión del momento");
  assert.match(pagina, /cambiarPasswordDeRecuperacion\(/);
});

test("🔴 la escritura real usa un cliente AISLADO atado a los tokens aceptados", () => {
  // Mismo patrón que lib/eliminar-cuenta.ts: un cliente que nace con los tokens
  // de la recuperación y que ninguna otra pestaña puede mover.
  const inicio = ctx.indexOf("const cambiarPasswordDeRecuperacion = useCallback");
  assert.notEqual(inicio, -1, "no existe cambiarPasswordDeRecuperacion en el AuthProvider");
  const bloque = ctx.slice(inicio, ctx.indexOf("}, []);", inicio));
  assert.match(bloque, /persistSession:\s*false/, "el cliente de escritura persiste sesión");
  assert.match(bloque, /autoRefreshToken:\s*false/);
  assert.match(bloque, /detectSessionInUrl:\s*false/);
  assert.match(bloque, /setSession\(\{[\s\S]{0,120}access_token:\s*rec\.accessToken/,
    "el cliente aislado no se ata a los tokens de la recuperación aceptada");
  assert.doesNotMatch(bloque, /supabaseBrowser\(\)/,
    "🔴 toca el singleton: la sesión del momento podría decidir la cuenta");
});

test("🔴 la URL se lee en el RENDER, no en un efecto", () => {
  assert.match(pagina, /useState\(\(\) =>[\s\S]{0,200}leerEnlace\(/);
  // Hay un useEffect en la página (el que RECLAMA), y está bien: lo que no puede
  // haber es un `leerEnlace` adentro de un efecto, porque ahí la URL ya puede
  // estar borrada por auth-js.
  for (const m of pagina.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[/g)) {
    assert.doesNotMatch(m[1], /leerEnlace\(|window\.location/, "la URL se lee dentro de un efecto: puede llegar ya consumida");
  }
});

test("🔴 `ready` espera a la decisión de Supabase cuando la URL trae tokens", () => {
  // Si `ready` se pusiera con getSession(), llegaría un tick ANTES que el evento
  // PASSWORD_RECOVERY (que Supabase emite con setTimeout 0) y la página mostraría
  // un error un instante antes de mostrar el formulario.
  assert.match(ctx, /hayTokensDeRecuperacion\(/, "el AuthProvider no mira si hay que esperar");
  assert.match(ctx, /"INITIAL_SESSION"[\s\S]{0,300}setTimeout\(/,
    "no espera un tick después de INITIAL_SESSION para dar por perdida la recuperación");
});
