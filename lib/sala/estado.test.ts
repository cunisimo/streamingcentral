// La forma del JSON de `sala_estado` y las dos lecturas que la interfaz hace
// sobre él (plan de salas, Tarea 3.1): qué estados son terminales y cuánto
// falta para el plazo que rige en cada estado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { esTerminal, venceEnSeg, desfaseReloj, plazoVigente, type EstadoSala } from "./estado.ts";

const T0 = Date.parse("2026-09-19T20:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const base = (over: Partial<EstadoSala> = {}): EstadoSala => ({
  estado: "lobby", version: 3, ahora: iso(T0), expires_at: iso(T0 + 20 * 60_000), lobby_expires_at: iso(T0 + 15 * 60_000),
  soy: { id: "P1", nombre: "Ana", platforms: ["n"], es_host: true },
  participantes: [{ nombre: "Ana", es_host: true, soy: true }],
  union: ["n"], n: 1, config_default: { size: 10, duracion: "cualquiera" },
  ...over,
});

test("terminales: vencida e inexistente; los demás no", () => {
  assert.equal(esTerminal(base({ estado: "vencida" })), true);
  assert.equal(esTerminal({ estado: "inexistente" }), true);
  for (const estado of ["lobby", "preparando", "votando", "empate", "resultado"] as const) {
    assert.equal(esTerminal(base({ estado })), false, estado);
  }
});

test("el plazo vigente depende del estado: lobby → lobby_expires_at; votando → deadline de la ronda; empate/resultado → expires_at", () => {
  const e = base();
  assert.equal(plazoVigente(e), e.lobby_expires_at);
  const ronda = {
    id: "R", numero: 1, size: 10 as const, duracion: "cualquiera" as const, limite_seg: 180, estado: "votando" as const,
    started_at: iso(T0), deadline_at: iso(T0 + 180_000), terminaron: 0, mi_siguiente_pos: 0, mis_votos: {}, titulos: [],
  };
  assert.equal(plazoVigente(base({ estado: "votando", ronda })), ronda.deadline_at);
  assert.equal(plazoVigente(base({ estado: "empate" })), e.expires_at);
  assert.equal(plazoVigente(base({ estado: "resultado" })), e.expires_at);
  // Preparando y terminales no tienen plazo que mostrar.
  assert.equal(plazoVigente(base({ estado: "preparando" })), null);
  assert.equal(plazoVigente(base({ estado: "vencida" })), null);
  assert.equal(plazoVigente({ estado: "inexistente" }), null);
});

test("venceEnSeg redondea hacia arriba y nunca es negativo", () => {
  const e = base(); // lobby vence a los 15 min
  assert.equal(venceEnSeg(e, T0), 900);
  assert.equal(venceEnSeg(e, T0 + 899_100), 1);
  assert.equal(venceEnSeg(e, T0 + 900_000), 0);
  assert.equal(venceEnSeg(e, T0 + 999_000), 0);
  assert.equal(venceEnSeg(base({ estado: "preparando" }), T0), null);
});

test("el desfase del reloj sale de `ahora` del servidor contra el momento en que llegó, y venceEnSeg lo aplica", () => {
  // El teléfono está 30 s adelantado: el servidor dice T0 y el cliente T0+30 s.
  const e = base();
  const d = desfaseReloj(e, T0 + 30_000);
  assert.equal(d, -30_000);
  // Sin corregir, el teléfono cree que faltan 870 s; corregido, 900.
  assert.equal(venceEnSeg(e, T0 + 30_000), 870);
  assert.equal(venceEnSeg(e, T0 + 30_000, d), 900);
  assert.equal(desfaseReloj({ estado: "inexistente" }, T0), 0);
});
