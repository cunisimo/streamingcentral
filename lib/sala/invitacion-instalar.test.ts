// La invitación a instalar Yump al terminar una sala (decisión del dueño,
// 27/09): dónde se muestra, dónde NO, y que no compita con el aviso PWA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formaDeInvitacion, sistema, URL_PLAY, PLAY_PUBLICA } from "./invitacion-instalar.ts";
import { enRecorridoDeSala } from "./aviso-pwa.ts";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

const ANDROID = "Mozilla/5.0 (Linux; Android 14; moto g84) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
const ESCRITORIO = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";

const base = { nativo: false, instalada: false, playPublicada: false };

test("sistema: iPhone, Android y el iPad que se hace pasar por Mac", () => {
  assert.equal(sistema({ ua: IPHONE }), "ios");
  assert.equal(sistema({ ua: ANDROID }), "android");
  assert.equal(sistema({ ua: ESCRITORIO }), "otro");
  // iPadOS 13+ manda UA de Mac: se distingue por los puntos táctiles.
  assert.equal(sistema({ ua: ESCRITORIO, plataforma: "MacIntel", puntosTactiles: 5 }), "ios");
  assert.equal(sistema({ ua: ESCRITORIO, plataforma: "MacIntel", puntosTactiles: 0 }), "otro");
});

test("🔴 en Android NO se muestra NADA hasta que la versión con Yumpeá esté publicada", () => {
  // Ni un botón de instalación ni un enlace de prueba: la app está hoy en
  // prueba cerrada Alpha y la ficha pública no sirve.
  assert.equal(formaDeInvitacion({ ...base, ua: ANDROID, playPublicada: false }), "nada");
  assert.equal(formaDeInvitacion({ ...base, ua: ANDROID, playPublicada: true }), "play");
  // Y nace apagada: encenderla es una variable de entorno, no un cambio de código.
  assert.equal(PLAY_PUBLICA, false, "la bandera no puede nacer encendida en el repo");
  assert.match(leer("lib/sala/invitacion-instalar.ts"), /NEXT_PUBLIC_YUMP_PLAY_PUBLICA === "1"/);
});

test("en iPhone web van las instrucciones, y nunca un enlace a Google Play", () => {
  assert.equal(formaDeInvitacion({ ...base, ua: IPHONE, playPublicada: true }), "ios");
  const vista = leer("components/sala/InvitacionInstalar.tsx");
  const iosBloque = vista.slice(vista.indexOf('forma === "play" ? ('));
  assert.match(iosBloque, /Agregá Yump a tu pantalla de inicio/);
  assert.match(iosBloque, /Agregar a inicio/);
  // El enlace de Play aparece UNA sola vez en el JSX, y en la rama "play":
  // la otra mención del archivo es el import.
  const jsx = vista.slice(vista.indexOf("return ("));
  assert.equal((jsx.match(/URL_PLAY/g) ?? []).length, 1);
  assert.doesNotMatch(iosBloque.slice(iosBloque.indexOf(") : (")), /URL_PLAY|play\.google/);
  assert.equal(URL_PLAY, "https://play.google.com/store/apps/details?id=ar.yump.app");
});

test("no se muestra dentro de la app Android, ni con Yump ya instalada como PWA", () => {
  for (const ua of [ANDROID, IPHONE, ESCRITORIO]) {
    assert.equal(formaDeInvitacion({ ...base, ua, nativo: true, playPublicada: true }), "nada", `nativo: ${ua}`);
    assert.equal(formaDeInvitacion({ ...base, ua, instalada: true, playPublicada: true }), "nada", `instalada: ${ua}`);
  }
  // En escritorio tampoco: no hay nada que instalar que valga la pena ofrecer ahí.
  assert.equal(formaDeInvitacion({ ...base, ua: ESCRITORIO, playPublicada: true }), "nada");
});

test("🔴 sólo tras un resultado FINAL: vive en PieResultado y en ningún otro lado", () => {
  const match = leer("components/sala/ResultadoMatch.tsx");
  // Es el último elemento del pie: debajo de "Cerrar sala" cuando hay ganadora
  // y debajo de "Otra tanda" cuando no la hay.
  const pie = match.slice(match.indexOf("export function PieResultado"));
  assert.match(pie, /<InvitacionInstalar \/>\s*\n\s*<\/div>/, "no está al final del pie");
  // El pie lo usan las TRES pantallas de resultado final...
  for (const f of ["ResultadoEmpate.tsx", "ResultadoSinCoincidencias.tsx"]) {
    assert.match(leer(`components/sala/${f}`), /<PieResultado /, f);
  }
  // ...y NINGUNA de las de antes del resultado. El empate sin resolver es el
  // caso fino: `ResultadoEmpate` monta el pie sólo en su fase 2 (desempatado),
  // y la fase 1 arma su propio bloque.
  const empate = leer("components/sala/ResultadoEmpate.tsx");
  const fase1 = empate.slice(empate.indexOf("// Fase 1: empate sin resolver."));
  assert.doesNotMatch(fase1, /PieResultado|InvitacionInstalar/, "apareció en el empate pendiente");
  for (const f of ["Lobby.tsx", "Votacion.tsx", "CrearSala.tsx", "UnirseForm.tsx"]) {
    assert.doesNotMatch(leer(`components/sala/${f}`), /InvitacionInstalar/, f);
  }
});

test("no promete que instalar recupere la sala recién jugada", () => {
  const vista = leer("components/sala/InvitacionInstalar.tsx");
  const jsx = vista.slice(vista.indexOf("return ("));
  assert.doesNotMatch(jsx, /volvé a la sala|recuperá la sala|seguí la sala|volver a esta sala/i);
  assert.match(jsx, /la próxima vez/, "el texto habla de la próxima vez, no de ésta");
});

test("es un bloque del flujo, no una ventana flotante", () => {
  const vista = leer("components/sala/InvitacionInstalar.tsx");
  assert.match(vista, /<section className="sala-instalar">/);
  assert.doesNotMatch(vista, /role="dialog"|aria-modal/);
  const css = leer("app/globals.css");
  const regla = css.match(/\.sala-instalar\{[^}]*\}/)![0];
  assert.doesNotMatch(regla, /position:\s*fixed|position:\s*sticky/);
});

test("🔴 el aviso PWA se suprime en TODO el recorrido de la sala", () => {
  for (const r of ["/sala", "/sala/nueva", "/sala/3d749c9c-ef7f-4496-bfc5-49f515bfb6f3", "/s", "/s/"]) {
    assert.equal(enRecorridoDeSala(r), true, r);
  }
  for (const r of ["/", "/top", "/buscar", "/salas-viejas", "/salado", "/sitio", null, undefined, ""]) {
    assert.equal(enRecorridoDeSala(r), false, String(r));
  }
  const prompt = leer("components/pwa/InstallPrompt.tsx");
  assert.match(prompt, /if \(enRecorridoDeSala\(pathname\)\) return null;/);
  // El guard va DESPUÉS de los hooks: los dos efectos del banner ya corrieron y
  // su orden no puede cambiar entre renders.
  assert.ok(prompt.indexOf("useEffect") < prompt.indexOf("enRecorridoDeSala(pathname)"));
});

test("prefer_related_applications NO se tocó: se evalúa aparte", () => {
  const manifest = leer("app/manifest.ts");
  assert.doesNotMatch(manifest, /prefer_related_applications|related_applications/);
});
