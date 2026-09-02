// La puerta del dashboard: admin CON segundo factor.
//
// ============================================================================
// QUÉ PROTEGE Y POR QUÉ NO ALCANZA CON EL GUARD DE `/admin`
// ============================================================================
// La sesión de esta app vive en `localStorage`, no en cookies, así que el
// servidor no sabe quién pide una página: el guard de `/admin/layout.tsx` es
// **sólo experiencia de usuario**. Un `curl` contra la API nunca lo ve.
//
// La seguridad real son dos capas, y las dos comprueban lo MISMO:
//
//   1. estas funciones, en cada API administrativa;
//   2. `is_admin_mfa()` en las policies de RLS (migración 007).
//
// 🔴 LA SEGUNDA NO ES REDUNDANTE. Sin ella, un token de admin sin MFA escribe
// directo contra PostgREST con la anon key y la API no se entera nunca.
//
// `aal2` es el nivel de garantía que Supabase pone en el token cuando la sesión
// pasó por el TOTP. `aal1` es sólo email y contraseña.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aalDelToken } from "./admin-auth-nucleo.ts";

/** Un JWT de mentira: sólo importa el payload, que es lo que se lee. */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.firma-que-no-se-valida-aca`;
}

test("lee el nivel de garantía del token", () => {
  assert.equal(aalDelToken(jwt({ sub: "u1", aal: "aal2" })), "aal2");
  assert.equal(aalDelToken(jwt({ sub: "u1", aal: "aal1" })), "aal1");
});

test("un token sin `aal` no se interpreta como verificado", () => {
  // Es el caso que importa: ante la duda, NO es aal2. Si esto devolviera algo
  // que el llamador tratara como válido, una sesión sin MFA entraría.
  assert.equal(aalDelToken(jwt({ sub: "u1" })), null);
});

test("un token roto devuelve null, no revienta", () => {
  for (const t of ["", "no-es-un-jwt", "a.b", "a.@@@.c", "....", null]) {
    assert.equal(aalDelToken(t as string), null, String(t));
  }
});

test("🔴 esta función NO valida la firma, y eso es deliberado", async () => {
  // El JWT de arriba tiene una firma inventada y se lee igual. Es correcto
  // SÓLO porque el llamador ya verificó el token contra Supabase con
  // `getUser()` antes de leer el `aal`. Si alguien invirtiera ese orden, un
  // token fabricado a mano pasaría.
  //
  // El test mira el código para que ese orden no se pueda invertir en silencio.
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("./admin-auth.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const cuerpo = /export async function adminDeToken[\s\S]*?\n}/.exec(src);
  assert.ok(cuerpo, "no se encontró adminDeToken");
  const iGetUser = cuerpo![0].indexOf("getUser");
  const iAal = cuerpo![0].indexOf("aalDelToken");
  assert.ok(iGetUser > -1, "dejó de verificar el token contra Supabase");
  assert.ok(iAal > -1, "dejó de mirar el segundo factor");
  assert.ok(iGetUser < iAal, "lee el `aal` ANTES de verificar la firma");
});

test("el service role no se usa para las operaciones del dashboard", async () => {
  // Decisión del dueño: el dashboard escribe con la sesión del admin, bajo RLS.
  // Usar `service_role` acá bypassaría las policies y volvería decorativa la
  // comprobación de MFA en la base.
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("./admin-auth.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /supabaseAdmin|SERVICE_ROLE/, "el dashboard usa service role");
});
