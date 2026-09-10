// Las reglas de la pantalla de recuperación (issue #22).
//
// ============================================================================
// EL CASO QUE HAY QUE PROBAR PRIMERO, PORQUE ES EL QUE PASÓ
// ============================================================================
// Reproducido el 2026-09-10 en el navegador, contra el Supabase real y con dos
// cuentas de prueba: con una sesión de la cuenta A abierta y un enlace YA
// CONSUMIDO de la cuenta B, la página vieja mostraba el formulario para A,
// decía "Listo, tu contraseña se actualizó" y le cambiaba la contraseña a A.
// B quedaba intacta — `updated_at` sin mover y su contraseña original entrando.
//
// El primer test de este archivo es exactamente esa combinación.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  leerEnlace, decidirPantalla, mensajeDeEnlace, sujetoDelToken, type Enlace,
} from "./recuperacion.ts";

// El fragmento tal cual lo devolvió Supabase en la reproducción.
const HASH_CONSUMIDO =
  "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
// Un access_token de juguete: sólo la parte del medio importa y no está firmado.
const jwtDe = (sub: string) =>
  `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;
const HASH_OK = (sub: string) =>
  `#access_token=${jwtDe(sub)}&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery`;

// ===========================================================================
// EL INCIDENTE
// ===========================================================================

test("🔴 enlace consumido + sesión ajena abierta: NO hay formulario", () => {
  const enlace = leerEnlace(HASH_CONSUMIDO, "");
  assert.equal(enlace.tipo, "error");
  const p = decidirPantalla({
    ready: true, enlace,
    usuarioId: "cuenta-A-que-ya-estaba-abierta",   // la víctima
    sujetoDelEnlace: null,
  });
  assert.equal(p.vista, "error", "con el enlace vencido se seguía ofreciendo el formulario");
  assert.match(p.vista === "error" ? p.mensaje : "", /venció|abrió antes/,
    "el mensaje no explica el motivo real");
});

test("🔴 sin enlace, una sesión abierta NO habilita el formulario", () => {
  // Es la regla de fondo: una sesión prueba que alguien entró en este navegador,
  // no que tenga el mail. La página vieja entraba por `!user` y por eso alcanzaba.
  const p = decidirPantalla({
    ready: true, enlace: leerEnlace("", ""), usuarioId: "cualquiera", sujetoDelEnlace: null,
  });
  assert.equal(p.vista, "sin-enlace");
});

test("🔴 el enlace es de una cuenta y la sesión de otra: no se toca nada", () => {
  const enlace = leerEnlace(HASH_OK("cuenta-B"), "");
  const p = decidirPantalla({
    ready: true, enlace, usuarioId: "cuenta-A", sujetoDelEnlace: sujetoDelToken(
      enlace.tipo === "recuperacion" ? enlace.accessToken : null),
  });
  assert.equal(p.vista, "identidad");
});

// ===========================================================================
// EL CAMINO BUENO
// ===========================================================================

test("enlace válido y sesión de la misma cuenta: formulario", () => {
  const enlace = leerEnlace(HASH_OK("cuenta-B"), "");
  assert.equal(enlace.tipo, "recuperacion");
  const p = decidirPantalla({
    ready: true, enlace, usuarioId: "cuenta-B",
    sujetoDelEnlace: sujetoDelToken(enlace.tipo === "recuperacion" ? enlace.accessToken : null),
  });
  assert.equal(p.vista, "formulario");
});

test("con enlace válido pero Supabase todavía arrancando: Cargando", () => {
  const enlace = leerEnlace(HASH_OK("cuenta-B"), "");
  assert.equal(
    decidirPantalla({ ready: false, enlace, usuarioId: null, sujetoDelEnlace: "cuenta-B" }).vista,
    "cargando",
  );
});

test("enlace válido que no dejó sesión: error, no formulario", () => {
  const enlace = leerEnlace(HASH_OK("cuenta-B"), "");
  assert.equal(
    decidirPantalla({ ready: true, enlace, usuarioId: null, sujetoDelEnlace: "cuenta-B" }).vista,
    "error",
  );
});

// ===========================================================================
// LECTURA DE LA URL
// ===========================================================================

test("el error se lee del fragmento Y de la query", () => {
  for (const [hash, query] of [[HASH_CONSUMIDO, ""], ["", "?error=access_denied&error_code=otp_expired"]]) {
    const e = leerEnlace(hash, query);
    assert.equal(e.tipo, "error");
    assert.equal(e.tipo === "error" ? e.codigo : null, "otp_expired");
  }
});

test("🔴 un enlace de confirmación de mail NO habilita cambiar la contraseña", () => {
  // Deja tokens en el hash igual que el de recovery, pero `type` dice otra cosa.
  const e = leerEnlace(`#access_token=${jwtDe("x")}&type=signup`, "");
  assert.equal(e.tipo, "nada", "un enlace de signup se aceptó como recuperación");
});

test("tokens sin `type` tampoco alcanzan", () => {
  assert.equal(leerEnlace(`#access_token=${jwtDe("x")}`, "").tipo, "nada");
});

test("una URL limpia es 'nada', no un error", () => {
  assert.equal(leerEnlace("", "").tipo, "nada");
  assert.equal(leerEnlace("#", "?").tipo, "nada");
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
  assert.match(otro, /Se rompió algo raro/, "un código desconocido pierde la descripción de Supabase");
  // El texto viejo servía para todo y no dejaba distinguir nada. Que no vuelva.
  for (const m of [vencido, denegado, otro]) {
    assert.notEqual(m, "El enlace no es válido o ya venció. Volvé a pedir la recuperación desde tu cuenta.");
  }
});

test("el mensaje del vencido nombra las dos causas posibles", () => {
  // Al dueño le importó no poder distinguir "se venció" de "lo abrió alguien":
  // en la evidencia del incidente el token se consumió 15 s antes de que él
  // llegara. El texto tiene que decir las dos.
  const m = mensajeDeEnlace("otp_expired", null);
  assert.match(m, /venció/);
  assert.match(m, /abrió antes/);
});

// ===========================================================================
// IDENTIDAD
// ===========================================================================

test("sujetoDelToken saca el sub sin verificar, y aguanta basura", () => {
  assert.equal(sujetoDelToken(jwtDe("abc-123")), "abc-123");
  for (const malo of [null, "", "x", "a.b", "a.@@@.c", "a.eyJ9.c"]) {
    assert.equal(sujetoDelToken(malo), null, `no devolvió null con ${JSON.stringify(malo)}`);
  }
});

test("si el token no trae sub, no se inventa una identidad", () => {
  const sin = `x.${Buffer.from(JSON.stringify({ otro: 1 })).toString("base64url")}.y`;
  assert.equal(sujetoDelToken(sin), null);
  // Y sin sujeto, la comparación no puede bloquear: se sigue con la sesión.
  const enlace: Enlace = { tipo: "recuperacion", accessToken: sin };
  assert.equal(
    decidirPantalla({ ready: true, enlace, usuarioId: "cuenta-B", sujetoDelEnlace: null }).vista,
    "formulario",
  );
});

// ===========================================================================
// QUE LA PÁGINA ENTRE POR ACÁ
// ===========================================================================
// La página es un componente de React y no se puede montar con `node --test`;
// se inspecciona el fuente, mismo recurso que `lib/cache-delega.test.ts`.

const pagina = readFileSync("app/cuenta/reset/page.tsx", "utf8");
// Sin comentarios: el mismo recurso que usan los otros barridos del repo. La
// primera version de estos guards miraba el archivo entero y se disparo con la
// palabra `useEffect` escrita en un COMENTARIO que explicaba por que no hay uno.
const codigo = pagina.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");

test("🔴 la página ya NO decide con `!user`", () => {
  assert.doesNotMatch(codigo, /!\s*user\s*\?/,
    "volvió el `!user ?` que dejaba entrar con cualquier sesión");
  assert.match(codigo, /decidirPantalla\(/, "la página no usa la decisión probada");
  assert.match(codigo, /leerEnlace\(/, "la página no lee el resultado del enlace");
});

test("🔴 la URL se lee en el RENDER, no en un efecto", () => {
  // Supabase borra el fragmento apenas lo procesa, y su arranque está en un
  // efecto del AuthProvider. Leerlo en un `useEffect` acá llegaría tarde.
  assert.match(codigo, /useState\(\(\) =>[\s\S]{0,200}leerEnlace\(/,
    "leerEnlace dejó de correr en el inicializador del useState");
  const iEfecto = codigo.indexOf("useEffect");
  assert.equal(iEfecto, -1, "apareció un useEffect: la URL puede llegar ya consumida");
});

test("🔴 el éxito se confirma contra la cuenta del enlace", () => {
  assert.match(codigo, /const \{ error, usuarioId \} = await updatePassword\(/,
    "la página ignora sobre qué cuenta se guardó");
  assert.match(codigo, /usuarioId !== esperado/, "no compara la identidad devuelta");
  const iOk = codigo.indexOf("setOk(true)");
  const iComparacion = codigo.indexOf("usuarioId !== esperado");
  assert.ok(iComparacion > 0 && iComparacion < iOk,
    "se festeja antes de confirmar la cuenta");
});

test("el contrato de updatePassword devuelve la cuenta actualizada", () => {
  const ctx = readFileSync("components/AuthContext.tsx", "utf8");
  assert.match(ctx, /updatePassword: \(password: string\) => Promise<\{ error\?: string; usuarioId\?: string \| null \}>/,
    "cambió el contrato de updatePassword");
  assert.match(ctx, /return \{ usuarioId: data\.user\?\.id \?\? null \}/,
    "updatePassword dejó de devolver el id que informó Supabase");
});
