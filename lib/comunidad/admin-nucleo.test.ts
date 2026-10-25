// E4: núcleo del panel de moderación, adaptador de la ruta con una base FALSA
// y barridos de fuente. Las funciones reales (permisos, MFA, concurrencia,
// baja) están en scripts/comunidad/pruebas-admin.mjs, contra `supabase start`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MOD_SIN_CONFIRMAR, accionesDenuncia, accionesRetenido, codigoParticipante, efectoDecision, estadoHttpModeracion,
  fechaAR, mensajeModeracion, normalizarMotivo, pedidoModeracion, reintentable,
} from "./admin-nucleo.ts";
import { moderar } from "./admin-moderacion.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = "00000000-0000-4000-8000-00000000abcd";
const OTRO = "00000000-0000-4000-8000-00000000beef";

test("motivo: NFC, sin controles ni bordes, 3–300 puntos de código", () => {
  assert.deepEqual(normalizarMotivo("  Spam\u0007 evidente  "), { ok: true, valor: "Spam evidente" });
  assert.deepEqual(normalizarMotivo("Café promocional"), { ok: true, valor: "Café promocional" });
  assert.equal(normalizarMotivo("ab").ok, false);
  assert.equal(normalizarMotivo("x".repeat(301)).ok, false);
  assert.equal(normalizarMotivo("😀".repeat(300)).ok, true, "cuenta puntos de código, no unidades UTF-16");
  assert.equal(normalizarMotivo(null).ok, false);
});

test("pedido: lecturas con cursor; acciones con intento uuid, motivo válido y objetivo del tipo correcto", () => {
  assert.deepEqual(pedidoModeracion({ accion: "leer", vista: "retenidos" }), { tipo: "leer", vista: "retenidos", despues: null, antes: null });
  assert.deepEqual(pedidoModeracion({ accion: "leer", vista: "registro", antes: 40 }), { tipo: "leer", vista: "registro", despues: null, antes: 40 });
  assert.ok("invalido" in pedidoModeracion({ accion: "leer", vista: "todo" }));
  assert.ok("invalido" in pedidoModeracion({ accion: "leer", vista: "registro", antes: -1 }));
  const base = { motivo: "Spam evidente", intento: UUID };
  assert.deepEqual(pedidoModeracion({ accion: "decidir", decision: "retirar", version: 7, ...base }),
    { tipo: "decidir", accion: "retirar", version: 7, motivo: "Spam evidente", intento: UUID });
  assert.ok("invalido" in pedidoModeracion({ accion: "decidir", decision: "borrar", version: 7, ...base }));
  assert.ok("invalido" in pedidoModeracion({ accion: "decidir", decision: "retirar", version: "7", ...base }));
  assert.ok("invalido" in pedidoModeracion({ accion: "decidir", decision: "retirar", version: 7, motivo: "Spam", intento: "1" }));
  assert.ok("invalido" in pedidoModeracion({ accion: "decidir", decision: "retirar", version: 7, motivo: "", intento: UUID }));
  assert.deepEqual(pedidoModeracion({ accion: "suspender", participante: OTRO, ...base }),
    { tipo: "suspender", participante: OTRO, motivo: "Spam evidente", intento: UUID });
  assert.ok("invalido" in pedidoModeracion({ accion: "quitar_marcador", cuenta: "x", ...base }));
  assert.ok("invalido" in pedidoModeracion({ accion: "publicacion", activa: "no", ...base }));
});

test("pedido: la identidad del admin NUNCA sale del cuerpo", () => {
  const p = pedidoModeracion({ accion: "decidir", decision: "publicar", version: 3, motivo: "ok ok", intento: UUID, admin_id: OTRO, uid: OTRO });
  assert.ok(!("invalido" in p));
  assert.ok(!JSON.stringify(p).includes(OTRO));
});

test("mensajes: honestos; una respuesta perdida dice que no se sabe y ofrece reintentar", () => {
  assert.deepEqual(mensajeModeracion("publicar", "sin-confirmar"), { tono: "sin_confirmar", texto: MOD_SIN_CONFIRMAR });
  assert.equal(reintentable(mensajeModeracion("publicar", "sin-confirmar").tono), true);
  assert.equal(mensajeModeracion("publicar", { resultado: "aplicada" }).texto, "Publicada.");
  assert.match(mensajeModeracion("publicar", { resultado: "aplicada", repetido: true }).texto, /ya estaba aplicada/);
  const c = mensajeModeracion("publicar", { resultado: "conflicto", situacion: "reemplazada" });
  assert.equal(c.tono, "rechazo");
  assert.match(c.texto, /reemplazada por una edición/);
  assert.equal(reintentable(c.tono), false, "un conflicto no se reintenta: se recarga");
  assert.match(mensajeModeracion("cerrar", { resultado: "conflicto", motivo: "visible" }).texto, /sigue visible/);
  assert.match(mensajeModeracion("quitar_marcador", { resultado: "aplicada" }).texto, /No se restauró nada/);
  assert.match(mensajeModeracion("suspender", { resultado: "no_disponible", situacion: "cuenta_eliminada" }).texto, /se eliminó/);
  assert.equal(mensajeModeracion("x", { resultado: "error" }).tono, "error");
});

test("efecto antes de confirmar: restaurar dice qué votos vuelve a contar y que los meses cerrados no cambian", () => {
  assert.match(efectoDecision("restaurar", { votos: 3 }), /Recupera 3 votos.*meses ya cerrados no cambian/);
  assert.match(efectoDecision("publicar", { votos: 0 }), /no tiene votos/);
  assert.match(efectoDecision("publicar", { votos: 0, revision: true }), /falso positivo/);
  assert.match(efectoDecision("retirar", { denuncias: 2 }), /Deja de verse.*2 denuncias abiertas quedan resueltas/);
  assert.match(efectoDecision("descartar", { denuncias: 1 }), /sigue como está\. La denuncia se marca como descartada/);
  assert.match(efectoDecision("descartar", { denuncias: 3 }), /3 denuncias se marcan como descartadas/);
});

test("acciones por situación: retenidos publicar/rechazar; denuncia visible retirar/descartar; no visible sólo cerrar", () => {
  assert.deepEqual(accionesRetenido("retenida"), ["publicar", "rechazar"]);
  assert.deepEqual(accionesRetenido("publicada"), []);
  assert.deepEqual(accionesDenuncia("visible"), ["retirar", "descartar"]);
  assert.deepEqual(accionesDenuncia("retenida"), ["descartar", "cerrar"]);
  for (const s of ["borrada", "reemplazada", "oculta", "rechazada"]) assert.deepEqual(accionesDenuncia(s), ["cerrar"]);
});

test("HTTP, código seudónimo y fecha argentina", () => {
  assert.deepEqual([{ resultado: "invalido" }, { resultado: "no_autorizado" }, { resultado: "error" }, { resultado: "sin_confirmar" }, { resultado: "aplicada" }]
    .map(estadoHttpModeracion), [400, 403, 500, 503, 200]);
  assert.equal(codigoParticipante(UUID), "P-000000");
  assert.equal(codigoParticipante("no"), "P-?");
  // 25/10/2026 02:30 UTC = 24/10/2026 23:30 en Buenos Aires (la franja de los bugs de fecha).
  assert.equal(fechaAR("2026-10-25T02:30:00Z"), "24/10/2026 23:30");
  assert.equal(fechaAR(null), "—");
});

// ---------------------------------------------------------------------------
// Adaptador de la ruta con una base FALSA.
// ---------------------------------------------------------------------------
function baseFalsa(respuestas: Array<{ data?: unknown; error?: { code?: string; message?: string } } | "lanza">) {
  const llamadas: { f: string; args: Record<string, unknown> }[] = [];
  const sb = {
    rpc: async (f: string, args: Record<string, unknown>) => {
      llamadas.push({ f, args });
      const r = respuestas.shift();
      if (r === "lanza" || r === undefined) throw new TypeError("fetch failed");
      return { data: r.data ?? null, error: r.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { sb, llamadas };
}
const pedir = (b: unknown) => {
  const p = pedidoModeracion(b);
  if ("invalido" in p) throw new Error(p.invalido);
  return p;
};
const DECIDIR = { accion: "decidir", decision: "publicar", version: 9, motivo: "Spam evidente", intento: UUID };

test("adaptador: cada acción llama a SU función con el intento; la respuesta perdida se repite UNA vez con los mismos argumentos", async () => {
  const { sb, llamadas } = baseFalsa(["lanza", { data: { resultado: "aplicada", repetido: true } }]);
  assert.deepEqual(await moderar(sb, pedir(DECIDIR)), { resultado: "aplicada", repetido: true });
  assert.equal(llamadas.length, 2);
  assert.deepEqual(llamadas[0], llamadas[1]);
  assert.deepEqual(llamadas[0], { f: "comunidad_admin_decidir", args: { p_accion: "publicar", p_version: 9, p_motivo: "Spam evidente", p_id_intento: UUID } });
});

test("adaptador: si tampoco se confirma, `sin_confirmar`; un rechazo confirmado no se repite", async () => {
  const a = baseFalsa(["lanza", "lanza"]);
  assert.deepEqual(await moderar(a.sb, pedir(DECIDIR)), { resultado: "sin_confirmar" });
  const b = baseFalsa([{ error: { code: "42501", message: "no_autorizado" } }]);
  assert.deepEqual(await moderar(b.sb, pedir(DECIDIR)), { resultado: "no_autorizado" });
  assert.equal(b.llamadas.length, 1);
  const c = baseFalsa([{ error: { code: "22023", message: "motivo_invalido" } }]);
  assert.deepEqual(await moderar(c.sb, pedir(DECIDIR)), { resultado: "invalido" });
  // Un error sin código (proxy 502) no prueba nada: se repite y, si no, sin_confirmar.
  const d = baseFalsa([{ error: { message: "Bad Gateway" } }, { error: { message: "Bad Gateway" } }]);
  assert.deepEqual(await moderar(d.sb, pedir(DECIDIR)), { resultado: "sin_confirmar" });
});

test("adaptador: las lecturas no se repiten ni inventan datos; 42501 es no_autorizado", async () => {
  const a = baseFalsa(["lanza"]);
  assert.deepEqual(await moderar(a.sb, pedir({ accion: "leer", vista: "retenidos", despues: { p: 1 } })), { resultado: "error" });
  assert.deepEqual(a.llamadas, [{ f: "comunidad_admin_retenidos", args: { p_limite: 20, p_despues: { p: 1 } } }]);
  const b = baseFalsa([{ error: { code: "42501" } }]);
  assert.deepEqual(await moderar(b.sb, pedir({ accion: "leer", vista: "resumen" })), { resultado: "no_autorizado" });
  const c = baseFalsa([{ data: { retenidos: 3 } }]);
  assert.deepEqual(await moderar(c.sb, pedir({ accion: "leer", vista: "resumen" })), { retenidos: 3 });
});

// ---------------------------------------------------------------------------
// Barridos de fuente.
// ---------------------------------------------------------------------------
const leer = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("barrido: la ruta pasa por adminDeToken y usa la sesión del admin; nunca service_role ni la identidad del cuerpo", () => {
  const r = leer("app/api/admin/moderacion/route.ts");
  assert.match(r, /adminDeToken\(tokenDeHeader\(/);
  assert.match(r, /supabaseComoUsuario\(a\.token\)/);
  assert.doesNotMatch(r, /supabaseAdmin|SERVICE_ROLE|service_role\b.*createClient/);
  assert.match(r, /"Cache-Control": "private, no-store"/);
  const m = leer("lib/comunidad/admin-moderacion.ts");
  assert.doesNotMatch(m, /SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin/);
});

test("barrido: la base comprueba is_admin_mfa() ANTES de cualquier lock en cada función del admin, y sólo authenticated las ejecuta", () => {
  const s = leer("supabase/migrations/016_comunidad_admin.sql");
  const funciones = [...s.matchAll(/create or replace function public\.(comunidad_[a-z_]+)\(/g)].map((m) => m[1]);
  assert.equal(funciones.length, 11);
  for (const f of funciones) {
    const cuerpo = s.slice(s.indexOf(`function public.${f}(`), s.indexOf("$$;", s.indexOf(`function public.${f}(`)));
    const primera = cuerpo.indexOf("comunidad.exigir_admin()");
    assert.ok(primera > 0, `${f} no exige admin`);
    for (const lock of ["proto_admin", "proto_participantes", "for update", "proto_marca"]) {
      const i = cuerpo.indexOf(lock);
      assert.ok(i < 0 || i > primera, `${f}: ${lock} antes de exigir admin`);
    }
    assert.match(s, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\)\\s+to authenticated;`));
    assert.doesNotMatch(s, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\)\\s+to (anon|service_role)`));
  }
});

test("barrido: el panel monta por cuenta, usa la frontera y el token atado a la cuenta; el admin está en la navegación", () => {
  const p = leer("app/admin/moderacion/page.tsx");
  assert.match(p, /<ModeracionDeCuenta key=\{user\.id\} uid=\{user\.id\} \/>/);
  assert.match(p, /crearFrontera\(uid\)/);
  assert.match(p, /tokenDeCuenta\(data\.session, uid\)/);
  assert.doesNotMatch(p, /session\?\.access_token/);
  // El reintento usa el MISMO intento: se crea una vez por diálogo.
  assert.match(p, /const \[intento\] = useState\(\(\) => crypto\.randomUUID\(\)\)/);
  assert.match(leer("app/admin/layout.tsx"), /href="\/admin\/moderacion"/);
});
