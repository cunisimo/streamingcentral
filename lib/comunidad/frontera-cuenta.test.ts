// A1 de la auditoría de E3b: aislamiento por cuenta de las pantallas
// comunitarias. Prueba la frontera (pura) y un MODELO del montaje por cuenta
// (`key={uid}`) con respuestas diferidas; no monta React ni el componente
// real. El recorrido real en navegador está en el informe de A1/A2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearFrontera, tokenDeCuenta } from "./frontera-cuenta.ts";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

test("tokenDeCuenta: sólo con la sesión de la misma cuenta", () => {
  assert.equal(tokenDeCuenta({ access_token: "tA", user: { id: A } }, A), "tA");
  assert.equal(tokenDeCuenta({ access_token: "tB", user: { id: B } }, A), null, "la sesión ya es de B");
  assert.equal(tokenDeCuenta(null, A), null, "sesión cerrada");
  assert.equal(tokenDeCuenta({ access_token: "", user: { id: A } }, A), null);
  assert.equal(tokenDeCuenta({ access_token: "tA", user: null }, A), null);
  assert.equal(tokenDeCuenta({ access_token: "tA", user: { id: A } }, null), null);
});

test("frontera: sólo vale la última carga; cerrada no vale nada; reabrir (Strict Mode) no revive cargas viejas", () => {
  const f = crearFrontera(A);
  const g1 = f.carga();
  const g2 = f.carga();
  assert.equal(f.vigente(g1), false, "carga superada");
  assert.equal(f.vigente(g2), true);
  assert.equal(f.vigente(), true);
  f.cerrar();
  assert.equal(f.vigente(g2), false, "desmontada");
  assert.equal(f.vigente(), false, "ni las operaciones");
  f.abrir();
  assert.equal(f.vigente(g1), false);
  const g3 = f.carga();
  assert.ok(g3 > g2 && f.vigente(g3));
});

// ---------------------------------------------------------------------------
// Modelo del montaje por cuenta: una "pantalla" con la lógica de la página de
// bloqueados (cargar con generación, desbloquear, recarga fallida de la misma
// cuenta) y un servidor con respuestas que el test resuelve a mano.
// ---------------------------------------------------------------------------
type Resp = { bloqueados: number[] } | "fallo";
function diferido<T>() {
  let resolver!: (v: T) => void;
  const p = new Promise<T>((r) => { resolver = r; });
  return { p, resolver };
}
function servidor() {
  const pendientes: { uid: string; accion: string; d: ReturnType<typeof diferido<Resp | { resultado: string }>> }[] = [];
  return {
    pendientes,
    pedir(uid: string, accion: string) {
      const d = diferido<Resp | { resultado: string }>();
      pendientes.push({ uid, accion, d });
      return d.p;
    },
  };
}
function sesionActual() {
  let uid: string | null = null;
  return { set: (u: string | null) => { uid = u; }, get: () => uid };
}
/** La instancia montada para una cuenta; `vista` es lo que se dibujaría. */
function montar(uid: string, srv: ReturnType<typeof servidor>, ses: ReturnType<typeof sesionActual>) {
  const f = crearFrontera(uid);
  const vista: { uid: string; lista: number[] | null; error: boolean; msg: string | null } = { uid, lista: null, error: false, msg: null };
  const enviar = (accion: string) =>
    tokenDeCuenta(ses.get() ? { access_token: "t", user: { id: ses.get() } } : null, uid) ? srv.pedir(uid, accion) : Promise.resolve({ resultado: "sin_sesion" });
  async function cargar() {
    if (!f.vigente()) return;
    const g = f.carga();
    vista.error = false;
    const r = await enviar("listar");
    if (!f.vigente(g)) return;
    if (typeof r === "string" || !("bloqueados" in r)) { vista.error = true; return; }
    vista.lista = r.bloqueados;
  }
  async function desbloquear() {
    const r = await enviar("desbloquear");
    if (!f.vigente()) return;
    vista.msg = typeof r === "object" && "resultado" in r ? r.resultado : null;
    void cargar();
  }
  return { vista, cargar, desbloquear, desmontar: () => f.cerrar() };
}
/** El componente con `key={uid}`: cambiar de cuenta desmonta y monta otro. */
function pantalla(srv: ReturnType<typeof servidor>, ses: ReturnType<typeof sesionActual>) {
  let actual: ReturnType<typeof montar> | null = null;
  return {
    cuenta(uid: string | null) {
      ses.set(uid);
      actual?.desmontar();
      actual = uid ? montar(uid, srv, ses) : null;
      if (actual) void actual.cargar();
      return actual;
    },
    get vista() { return actual?.vista ?? null; },
    get actual() { return actual; },
  };
}
const tick = () => new Promise((r) => setImmediate(r));

test("A→B mientras A carga: B no ve nada de A, ni con la respuesta de A llegando después", async () => {
  const srv = servidor(); const ses = sesionActual(); const p = pantalla(srv, ses);
  p.cuenta(A);
  p.cuenta(B);
  assert.equal(p.vista?.lista, null, "B arranca vacío");
  srv.pendientes.find((x) => x.uid === B)!.d.resolver({ bloqueados: [2] });
  await tick();
  srv.pendientes.find((x) => x.uid === A)!.d.resolver({ bloqueados: [777] }); // tardía
  await tick();
  assert.deepEqual(p.vista, { uid: B, lista: [2], error: false, msg: null });
});

test("A cargada, cambio a B y la lectura de B falla: no queda la lista de A (caso de la auditoría)", async () => {
  const srv = servidor(); const ses = sesionActual(); const p = pantalla(srv, ses);
  p.cuenta(A);
  srv.pendientes[0].d.resolver({ bloqueados: [777] });
  await tick();
  assert.deepEqual(p.vista?.lista, [777]);
  p.cuenta(B);
  srv.pendientes[1].d.resolver("fallo");
  await tick();
  assert.deepEqual(p.vista, { uid: B, lista: null, error: true, msg: null });
});

test("recarga fallida de la MISMA cuenta: conserva la lista y muestra el error", async () => {
  const srv = servidor(); const ses = sesionActual(); const p = pantalla(srv, ses);
  p.cuenta(A);
  srv.pendientes[0].d.resolver({ bloqueados: [1, 2] });
  await tick();
  void p.actual!.cargar();
  srv.pendientes[1].d.resolver("fallo");
  await tick();
  assert.deepEqual(p.vista, { uid: A, lista: [1, 2], error: true, msg: null });
});

test("misma cuenta, cargas fuera de orden: la vieja no pisa a la nueva", async () => {
  const srv = servidor(); const ses = sesionActual(); const p = pantalla(srv, ses);
  p.cuenta(A);
  void p.actual!.cargar();
  srv.pendientes[1].d.resolver({ bloqueados: [] }); // la nueva: ya desbloqueó
  await tick();
  srv.pendientes[0].d.resolver({ bloqueados: [5] }); // la vieja llega tarde
  await tick();
  assert.deepEqual(p.vista?.lista, []);
});

test("cierre de sesión con lectura pendiente: no hay vista y la respuesta se descarta", async () => {
  const srv = servidor(); const ses = sesionActual(); const p = pantalla(srv, ses);
  const a = p.cuenta(A)!;
  p.cuenta(null);
  srv.pendientes[0].d.resolver({ bloqueados: [777] });
  await tick();
  assert.equal(p.vista, null);
  assert.equal(a.vista.lista, null, "ni la instancia desmontada la toma");
});

test("cambio a B durante un desbloqueo de A: el mensaje y la recarga de A no aparecen en B", async () => {
  const srv = servidor(); const ses = sesionActual(); const p = pantalla(srv, ses);
  p.cuenta(A);
  srv.pendientes[0].d.resolver({ bloqueados: [777] });
  await tick();
  void p.actual!.desbloquear();
  p.cuenta(B);
  srv.pendientes.find((x) => x.accion === "desbloquear")!.d.resolver({ resultado: "desbloqueado" });
  srv.pendientes.find((x) => x.uid === B)!.d.resolver({ bloqueados: [] });
  await tick();
  assert.deepEqual(p.vista, { uid: B, lista: [], error: false, msg: null });
  assert.equal(srv.pendientes.filter((x) => x.uid === A && x.accion === "listar").length, 1, "A no recargó después del cambio");
});

test("una operación que empieza con la sesión ya cambiada no sale en nombre de nadie", async () => {
  const srv = servidor(); const ses = sesionActual(); const p = pantalla(srv, ses);
  const a = p.cuenta(A)!;
  ses.set(B); // la sesión cambió y la pantalla todavía no se enteró
  await a.desbloquear();
  assert.equal(srv.pendientes.filter((x) => x.accion === "desbloquear").length, 0);
});

// ---------------------------------------------------------------------------
// Barrido de fuente: las tres superficies de A1 usan la frontera y el token
// atado a la cuenta, y montan por cuenta.
// ---------------------------------------------------------------------------
test("barrido: bloqueados, la ficha y la fila de configuración usan tokenDeCuenta y frontera", () => {
  const leer = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
  const pagina = leer("app/cuenta/bloqueados/page.tsx");
  const ficha = leer("components/comunidad/ResenasComunidad.tsx");
  const fila = leer("components/comunidad/FilaBloqueados.tsx");
  for (const [n, s] of [["página", pagina], ["ficha", ficha], ["fila", fila]] as const) {
    assert.match(s, /tokenDeCuenta\(/, n);
    assert.match(s, /crearFrontera\(/, n);
    assert.doesNotMatch(s, /session\?\.access_token/, `${n}: el token sale sin comprobar la cuenta`);
  }
  assert.match(pagina, /<BloqueadosDeCuenta key=\{user\.id\}/);
  assert.match(ficha, /<ResenasDeCuenta key=\{claveEditor\(uid, titulo\)\}/);
  assert.match(fila, /ver\?\.uid !== uid/);
});
