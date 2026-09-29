// La vista previa del enlace de invitación (lib/sala/invitacion.ts): el nombre
// del organizador como parámetro de PRESENTACIÓN, validado al leerlo, y la
// metadata social de `/sala/[id]`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DESCRIPCION_GENERICA, MAX_NOMBRE, descripcionInvitacion, enlaceDeInvitacion, metadataInvitacion, nombreParaInvitacion,
} from "./invitacion.ts";
import { rutaDeEnlace } from "../enlaces-app.ts";

const UUID = "3d749c9c-ef7f-4496-bfc5-49f515bfb6f3";
const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

test("descripción: '<organizador> te invitó a yumpear.'; sin nombre, 'Te invitaron a yumpear.'", () => {
  assert.equal(descripcionInvitacion("Juan"), "Juan te invitó a yumpear.");
  assert.equal(descripcionInvitacion(null), "Te invitaron a yumpear.");
  assert.equal(DESCRIPCION_GENERICA, "Te invitaron a yumpear.");
});

test("el nombre se valida con la regla de la base: espacios colapsados, sin controles, 1 a 24 caracteres", () => {
  assert.equal(nombreParaInvitacion("  Juan   Pérez  "), "Juan Pérez");
  // Igual que sala_nombre_valido: los controles (tab incluido) se quitan ANTES
  // de colapsar espacios, así que la base también da "AnaMaría".
  assert.equal(nombreParaInvitacion("Ana\tMaría\n"), "AnaMaría");
  assert.equal(nombreParaInvitacion("Ana   María"), "Ana María", "el espacio duro se colapsa");
  assert.equal(nombreParaInvitacion("Jua\u0000n\u0007"), "Juan", "controles C0 afuera");
  assert.equal(nombreParaInvitacion("\u202EnauJ"), "nauJ", "sin override bidireccional");
  for (const malo of [undefined, null, "", "   ", "\u0000\u0001"]) assert.equal(nombreParaInvitacion(malo), null, JSON.stringify(malo));
  // Largo: 24 entra, 25 no (en CARACTERES, como char_length: un emoji es uno).
  assert.equal(MAX_NOMBRE, 24);
  assert.equal(nombreParaInvitacion("a".repeat(24)), "a".repeat(24));
  assert.equal(nombreParaInvitacion("a".repeat(25)), null);
  assert.equal(nombreParaInvitacion("🍿".repeat(24)), "🍿".repeat(24));
  // Un parámetro repetido (?organizador=a&organizador=b): el primero.
  assert.equal(nombreParaInvitacion(["Juan", "Otro"]), "Juan");
});

test("caracteres especiales: se conservan como texto (el escape lo hace Next)", () => {
  for (const n of ["O'Brien", 'Ana "la" Rubia', "<b>Pepe</b>", "Zoë & Ñandú", "José 🍿"]) {
    assert.equal(nombreParaInvitacion(n), n);
    assert.equal(descripcionInvitacion(nombreParaInvitacion(n)), `${n} te invitó a yumpear.`);
  }
});

test("URL resultante: el enlace público de la sala + ?organizador= codificado", () => {
  assert.equal(enlaceDeInvitacion(UUID, "Juan"), `https://app.yump.ar/sala/${UUID}?organizador=Juan`);
  assert.equal(enlaceDeInvitacion(UUID, "Juan Pérez"), `https://app.yump.ar/sala/${UUID}?organizador=Juan%20P%C3%A9rez`);
  assert.equal(enlaceDeInvitacion(UUID, "A&B=C?#/"), `https://app.yump.ar/sala/${UUID}?organizador=A%26B%3DC%3F%23%2F`);
  // Sin nombre válido, el enlace de siempre (nada de "?organizador=").
  assert.equal(enlaceDeInvitacion(UUID, undefined), `https://app.yump.ar/sala/${UUID}`);
  assert.equal(enlaceDeInvitacion(UUID, "a".repeat(30)), `https://app.yump.ar/sala/${UUID}`);
  // Ida y vuelta: lo que se lee del enlace es el nombre que se puso.
  const u = new URL(enlaceDeInvitacion(UUID, "Zoë & Ñandú"));
  assert.equal(nombreParaInvitacion(u.searchParams.get("organizador")), "Zoë & Ñandú");
});

test("🔴 el UUID sigue siendo la única identidad: el App Link ignora el parámetro", () => {
  assert.equal(rutaDeEnlace(enlaceDeInvitacion(UUID, "Juan Pérez")), `/s/?id=${UUID}`);
});

test("metadata: título Yump, la descripción de la invitación y Open Graph/Twitter completos", () => {
  const m = metadataInvitacion(UUID, "Juan");
  assert.equal(m.title, "Yump");
  assert.equal(m.description, "Juan te invitó a yumpear.");
  const og = m.openGraph as Record<string, unknown>;
  assert.equal(og.title, "Yump");
  assert.equal(og.description, "Juan te invitó a yumpear.");
  assert.equal(og.url, `https://app.yump.ar/sala/${UUID}`, "canónica SIN el nombre");
  assert.equal(og.siteName, "Yump");
  assert.equal(og.type, "website");
  assert.deepEqual((og.images as { url: string }[]).map((i) => i.url), ["https://app.yump.ar/icons/icon-512.png"]);
  const tw = m.twitter as Record<string, unknown>;
  assert.equal(tw.description, "Juan te invitó a yumpear.");
  assert.deepEqual(m.robots, { index: false, follow: false }, "una sala no se indexa");
});

test("metadata: sin nombre o con uno inválido → genérica; NUNCA la descripción general del sitio", () => {
  const sitio = "Qué ver en tus plataformas de streaming, sin perder 45 minutos buscando.";
  for (const crudo of [undefined, "", "a".repeat(40), ["", "Juan"]]) {
    const m = metadataInvitacion(UUID, crudo);
    assert.equal(m.description, "Te invitaron a yumpear.", JSON.stringify(crudo));
    assert.equal((m.openGraph as { description: string }).description, "Te invitaron a yumpear.");
    assert.notEqual(m.description, sitio);
  }
  // Un id inválido no rompe: sin url canónica, pero la descripción de invitación igual.
  assert.equal((metadataInvitacion(null, "Juan").openGraph as { url?: string }).url, undefined);
});

test("la página /sala/[id] exporta generateMetadata con metadataInvitacion y no consulta la base", () => {
  const pagina = leer("app/sala/[id]/page.tsx");
  assert.match(pagina, /export function generateMetadata\(/);
  assert.match(pagina, /metadataInvitacion\(id, searchParams\?\.\[PARAM_ORGANIZADOR\]\)/);
  assert.doesNotMatch(pagina, /supabase|service_role|\.rpc\(/i, "el nombre no sale de la base");
  assert.doesNotMatch(pagina, /dangerouslySetInnerHTML/, "sin HTML manual");
  const lobby = leer("components/sala/Lobby.tsx");
  assert.match(lobby, /enlaceDeInvitacion\(roomId, organizador\)/, "el enlace copiado lleva el nombre");
});
