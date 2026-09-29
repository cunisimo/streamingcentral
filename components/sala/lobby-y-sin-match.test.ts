// Ajustes de Yumpeá del dueño (28/09): el lobby del organizador, la espera del
// invitado y la pantalla sin match. La decisión del lobby es pura
// (lib/sala/lobby-nucleo.ts); el resto se fija por barrido del JSX y del CSS,
// como el resto de las pruebas de salas (no hay arnés de DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accionEmpezar, avisoDeLlegada, MINIMO, reciénLlegados } from "../../lib/sala/lobby-nucleo.ts";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const jsx = (p: string) => { const s = leer(p); return s.slice(s.indexOf("return (")); };
const LOBBY = leer("components/sala/Lobby.tsx");
const PREPARAR = leer("components/sala/PrepararTanda.tsx");
const PIE = leer("components/sala/ResultadoMatch.tsx");
const SIN = leer("components/sala/ResultadoSinCoincidencias.tsx");
const CERRAR = leer("components/sala/CerrarSala.tsx");
const CSS = leer("app/globals.css");
const regla = (sel: string) => {
  const i = CSS.indexOf(`${sel}{`);
  assert.ok(i >= 0, `falta la regla ${sel}`);
  return CSS.slice(i, CSS.indexOf("}", i) + 1);
};

// --- Lobby del organizador ----------------------------------------------------
test("con UNA persona: estado 'Falta que se sume alguien', sin botón", () => {
  assert.deepEqual(accionEmpezar(1), { tipo: "estado", texto: "Falta que se sume alguien" });
  assert.equal(MINIMO, 2, "la regla mínima no cambió");
});

test("con DOS: aparece el botón real 'Empezar con 2' (y el inicio sigue siendo manual)", () => {
  assert.deepEqual(accionEmpezar(2), { tipo: "boton", rotulo: "Empezar con 2" });
  assert.deepEqual(accionEmpezar(6), { tipo: "boton", rotulo: "Empezar con 6" });
  assert.doesNotMatch(LOBBY, /setTimeout\([^)]*pedir|autoEmpezar|empezarSolo/i, "sin arranque automático");
});

test("el estado es texto de acento, sin caja/fondo/borde, un punto mayor y accesible como estado", () => {
  assert.match(LOBBY, /enEspera=\{accion\.tipo === "estado" \? accion\.texto : undefined\}/);
  // En PrepararTanda: con `enEspera` se dibuja un <p role="status">, NO el botón.
  const vista = jsx("components/sala/PrepararTanda.tsx");
  assert.match(vista, /\{enEspera \? \(/);
  assert.match(vista, /<p className="sala-falta" role="status">\{enEspera\}<\/p>/);
  const r = regla(".sala-falta");
  assert.match(r, /background:none/);
  assert.match(r, /border:0/);
  assert.match(r, /padding:0/);
  assert.match(r, /color:var\(--accent\)/);
  assert.match(r, /font-size:15px/, "un punto más que el texto del botón");
  assert.match(CSS, /\.btn\{[^}]*font-size:14px/, "el botón base sigue en 14 px");
  assert.doesNotMatch(r, /cursor:pointer/, "no parece interactivo");
});

test("el aviso temporal de quién se sumó se conserva", () => {
  assert.equal(avisoDeLlegada(reciénLlegados(["Facu"], ["Facu", "Ana"])), "Se sumó Ana.");
  assert.match(LOBBY, /<strong className="sala-llego"> \{aviso\}<\/strong>/);
  assert.match(LOBBY, /setTimeout\(\(\) => setAviso\(null\), 6000\)/);
});

// --- Espera del invitado --------------------------------------------------------
test("el invitado ve un spinner decorativo a la izquierda del texto, que conserva role=status", () => {
  const i = LOBBY.indexOf('<p className="sala-espera" role="status">');
  assert.ok(i > 0);
  const p = LOBBY.slice(i, LOBBY.indexOf("</p>", i));
  const iSpinner = p.indexOf('<span className="sala-spinner" aria-hidden="true" />');
  const iTexto = p.indexOf("Esperando a que {organizador ?? \"quien organiza\"} empiece…");
  assert.ok(iSpinner > 0 && iTexto > iSpinner, "spinner antes (a la izquierda) del texto");
  assert.match(regla(".sala-espera"), /display:flex;align-items:center/, "alineado con el texto");
});

test("el spinner gira SÓLO sin 'Reducir movimiento'; con reduce queda visible y quieto", () => {
  const base = regla(".sala-spinner");
  assert.doesNotMatch(base, /animation/, "fuera de la media query no hay animación");
  assert.match(base, /border-top-color:var\(--accent\)/, "sin animación igual se ve");
  assert.match(CSS, /@media \(prefers-reduced-motion: no-preference\)\{\.sala-spinner\{animation:sala-giro/);
  assert.match(CSS, /@keyframes sala-giro\{to\{transform:rotate\(360deg\)\}\}/);
  // Sin polling nuevo: la espera sigue viviendo de useSala.
  assert.doesNotMatch(LOBBY, /setInterval|\.rpc\(/);
});

// --- Sin match ---------------------------------------------------------------------
test("sin match, el ORGANIZADOR tiene 'Otra tanda' y 'Cerrar sala' (mismo componente y RPC)", () => {
  const i = PIE.indexOf(") : puede ? (");
  const rama = PIE.slice(i, PIE.indexOf(") : null}", i));
  assert.match(rama, /rotulo="Otra tanda"/);
  assert.match(rama, /\{estado\.soy\.es_host && \(\s*<CerrarSala roomId=\{roomId\}/);
  assert.match(CERRAR, /rpc\("sala_cerrar", \{ p_room: roomId \}\)/, "la misma RPC de siempre");
});

test("'Otra tanda' y 'Cerrar sala' no se pisan: mientras una corre, la otra queda bloqueada", () => {
  assert.match(PIE, /const \[ocupado, setOcupado\] = useState<"tanda" \| "cerrar" \| null>\(null\);/);
  assert.match(PIE, /bloqueado=\{ocupado === "cerrar"\} onOcupado=\{\(o\) => setOcupado\(o \? "tanda" : null\)\}/);
  assert.match(PIE, /bloqueado=\{ocupado === "tanda"\} onOcupado=\{\(o\) => setOcupado\(o \? "cerrar" : null\)\}/);
  for (const src of [PREPARAR, CERRAR]) {
    assert.match(src, /if \(busy \|\| bloqueado\) return;/, "tampoco un doble envío de la misma acción");
    assert.match(src, /disabled=\{busy[^}]*bloqueado\}/);
  }
});

test("el INVITADO, sólo sin coincidencias, ve 'Esperá a ver si <organizador> arma otra tanda.'", () => {
  assert.match(PIE, /\{sinCoincidencias && !estado\.soy\.es_host && !hayGanadora && \(/);
  assert.match(PIE, /Esperá a ver si \{organizador\} arma otra tanda\./);
  assert.match(PIE, /const organizador = estado\.participantes\.find\(\(p\) => p\.es_host\)\?\.nombre \?\? "quien organiza";/);
  // Va DEBAJO de "La sala se cierra en…".
  assert.ok(PIE.indexOf("La sala se cierra en") < PIE.indexOf("Esperá a ver si"));
  // Sólo lo pasa la pantalla sin coincidencias; con ganadora no.
  assert.match(SIN, /<PieResultado [^>]*sinCoincidencias \/>/);
  const conGanadora = leer("components/sala/ResultadoMatch.tsx").split("export function PieResultado")[0];
  assert.doesNotMatch(conGanadora, /sinCoincidencias/, "ResultadoMatch no lo activa");
  assert.doesNotMatch(leer("components/sala/ResultadoEmpate.tsx"), /sinCoincidencias/, "el empate tampoco");
});

test("la regla de negocio no cambió: 'Otra tanda' la decide la base y sólo sin ganadora", () => {
  assert.match(PIE, /const puede = estado\.resultado\?\.puede_otra_tanda === true;/);
  assert.match(PIE, /\{hayGanadora \? \(/, "con ganadora: la rama de siempre, sin Otra tanda");
  assert.match(leer("supabase/migrations/009_salas.sql"), /'puede_otra_tanda', yo\.es_host and s\.estado = 'resultado' and r\.ganador_pos is null/);
});
