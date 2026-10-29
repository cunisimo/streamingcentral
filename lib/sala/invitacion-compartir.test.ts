// "Compartir invitación" en el lobby (20/10): el mensaje y el cableado del botón
// con la acción compartida. Los CAMINOS de la acción (plugin nativo, Web Share,
// WhatsApp, cancelar) ya los prueba lib/compartir.test.ts; acá se comprueba que
// la invitación los recorre con su propio mensaje y su enlace público.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEXTO_INVITACION, TITULO_INVITACION, enlaceDeInvitacion, mensajeInvitacion } from "./invitacion.ts";
import { enlaceWhatsapp } from "../compartir.ts";
import { compartir } from "../compartir-accion.ts";
import { credencialParaCrear } from "./token-store.ts";

const UUID = "3d749c9c-ef7f-4496-bfc5-49f515bfb6f3";
const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

test("el mensaje: el texto propuesto, aparte de la url", () => {
  const m = mensajeInvitacion(UUID, "Juan");
  assert.equal(TEXTO_INVITACION, "¡Sumate a mi sala de Yumpeá! Elegimos juntos qué ver:");
  assert.equal(m.texto, TEXTO_INVITACION);
  assert.equal(m.titulo, TITULO_INVITACION);
  assert.ok(!m.texto.includes("http"), "la url no va dentro del texto: es un campo aparte");
});

test("la url es EXACTAMENTE la de 'Copiar enlace': dominio público, /sala/<uuid> y ?organizador=", () => {
  for (const nombre of ["Juan", "Juan Pérez", null, undefined, "", "x".repeat(25)]) {
    assert.equal(mensajeInvitacion(UUID, nombre).url, enlaceDeInvitacion(UUID, nombre), String(nombre));
  }
  assert.equal(mensajeInvitacion(UUID, "Juan Pérez").url, `https://app.yump.ar/sala/${UUID}?organizador=Juan%20P%C3%A9rez`);
  assert.equal(mensajeInvitacion(UUID, null).url, `https://app.yump.ar/sala/${UUID}`);
});

test("🔴 sólo la invitación pública: ningún parámetro más que el organizador, y nunca la credencial", () => {
  const store = new Map<string, string>();
  const credencial = credencialParaCrear({
    getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); }, removeItem: (k) => { store.delete(k); },
  });
  const m = mensajeInvitacion(UUID, "Juan");
  const u = new URL(m.url);
  assert.equal(u.origin, "https://app.yump.ar");
  assert.equal(u.pathname, `/sala/${UUID}`);
  assert.deepEqual([...u.searchParams.keys()], ["organizador"]);
  assert.equal(u.hash, "");
  for (const campo of [m.titulo, m.texto, m.url]) assert.ok(!campo.includes(credencial), "la credencial no viaja");
  // Y el lobby no importa el store de credenciales.
  assert.doesNotMatch(leer("components/sala/Lobby.tsx"), /token-store|credencial/i);
});

test("WhatsApp (fallback) recibe el texto y el enlace, en ese orden", async () => {
  const m = mensajeInvitacion(UUID, "Juan");
  let abierta = "";
  await compartir(m, { esNativo: false, share: undefined, abrir: (u) => { abierta = u; } });
  assert.equal(abierta, enlaceWhatsapp(m));
  assert.equal(decodeURIComponent(abierta.split("?text=")[1]), `${TEXTO_INVITACION}\n${m.url}`);
});

test("Web Share y el plugin reciben texto y url en campos separados", async () => {
  const m = mensajeInvitacion(UUID, "Juan");
  const vistos: { title: string; text: string; url: string }[] = [];
  await compartir(m, { esNativo: false, share: async (d) => { vistos.push(d); }, abrir: () => assert.fail("no debía abrir WhatsApp") });
  await compartir(m, { esNativo: true, plugin: async (d) => { vistos.push(d); }, abrir: () => assert.fail("no debía abrir WhatsApp") });
  for (const d of vistos) assert.deepEqual(d, { title: TITULO_INVITACION, text: TEXTO_INVITACION, url: m.url });
});

test("cancelar la hoja termina la acción sin abrir WhatsApp (web y nativo)", async () => {
  const m = mensajeInvitacion(UUID, "Juan");
  const abortar = Object.assign(new Error("cancelado"), { name: "AbortError" });
  let abrio = 0;
  await compartir(m, { esNativo: false, share: async () => { throw abortar; }, abrir: () => { abrio++; } });
  await compartir(m, { esNativo: true, plugin: async () => { throw abortar; }, abrir: () => { abrio++; } });
  assert.equal(abrio, 0);
});

test("cableado: el botón usa la acción compartida con mensajeInvitacion, y 'Copiar enlace' sigue", () => {
  const lobby = leer("components/sala/Lobby.tsx");
  assert.match(lobby, /import \{ compartir \} from "@\/lib\/compartir-accion"/);
  assert.match(lobby, /compartir\(mensajeInvitacion\(roomId, organizador\)\)/);
  assert.match(lobby, />\s*Compartir invitación\s*</);
  assert.match(lobby, /"Copiar enlace"/);
  assert.match(lobby, /navigator\.clipboard\.writeText\(enlace\)/, "copiar sigue copiando el mismo enlace");
  // Sólo el CÓDIGO: los comentarios nombran `location.origin` y el botón para
  // explicar por qué.
  const codigo = lobby.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  // El botón principal va ANTES del enlace copiable.
  assert.ok(codigo.indexOf("Compartir invitación") < codigo.indexOf('className="sala-enlace"'));
  // No rearma la acción ni el enlace por su cuenta.
  for (const prohibido of [/navigator\.share/, /@capacitor\/share/, /wa\.me/, /location\.origin/, /app\.yump\.ar/]) {
    assert.doesNotMatch(codigo, prohibido);
  }
});

test("el comentario del lobby ya no promete la función para la Etapa 5", () => {
  const lobby = leer("components/sala/Lobby.tsx");
  assert.doesNotMatch(lobby, /llegan en la Etapa 5/);
});
