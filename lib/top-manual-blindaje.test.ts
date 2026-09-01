// Las cinco cosas que la segunda auditoría encontró abiertas.
//
// Tres viven en SQL y se comprueban leyendo la migración: no hay una base en
// `npm test`, y el proyecto ya usa este tipo de barrido (ver
// `lib/disponibilidad-barrido.test.ts`). No prueban que Postgres se comporte —
// prueban que la protección **no desaparezca del archivo**, que es la forma en
// que estas cosas se pierden: alguien reescribe un bloque y se lleva un trigger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estadoDeMfa } from "./admin-auth-nucleo.ts";

const sql = readFileSync(
  new URL("../supabase/migrations/007_top_manual.sql", import.meta.url), "utf8",
);
/** El SQL sin comentarios: la prosa explica las reglas, no las cumple. */
const codigo = sql.replace(/^\s*--.*$/gm, "");

// ============================================================================
// 1. Una publicación tampoco se puede BORRAR
// ============================================================================
// El blindaje cubría INSERT y UPDATE y dejaba DELETE abierto: la policy es
// `for all`, así que un admin con MFA podía borrar una publicación entera y con
// ella su historial. "No se sobrescribe" no vale de nada si se puede borrar.

test("hay un trigger BEFORE DELETE en las dos tablas", () => {
  assert.match(codigo, /before delete on top_rankings/i,
    "se puede borrar un ranking publicado");
  assert.match(codigo, /before delete on top_ranking_entries/i,
    "se pueden borrar las entradas de un ranking publicado");
});

test("el borrado se rechaza sólo para lo publicado", () => {
  // Un borrador SÍ se tiene que poder limpiar: es lo que hace `reemplazar`.
  const fn = /function top_rankings_no_borrar[\s\S]*?\$\$[\s\S]*?\$\$/i.exec(codigo);
  assert.ok(fn, "no existe la función que rechaza el borrado");
  assert.match(fn![0], /estado = 'publicado'/,
    "rechaza cualquier borrado, incluidos los borradores");
});

test("el trigger de UPDATE protege también la autoría", () => {
  // `creado_por` y `revisado_por` son el rastro de quién firmó la publicación.
  // Quedaban fuera del chequeo, así que se podían reescribir después.
  const fn = /function top_ranking_publicado_inmutable[\s\S]*?\$\$[\s\S]*?\$\$/i.exec(codigo);
  assert.ok(fn, "no existe el trigger de inmutabilidad");
  for (const col of ["estado", "plataforma", "tipo", "captured_at", "published_at",
    "copiado_de", "creado_por", "revisado_por"]) {
    assert.match(fn![0], new RegExp(`new\\.${col} is distinct from old\\.${col}`),
      `\`${col}\` se puede cambiar después de publicar`);
  }
});

// ============================================================================
// 2. Después de publicar, el borrador siguiente sale precargado
// ============================================================================
// Publicar convierte el borrador en publicación, así que el bloque se quedaba
// SIN borrador y `obtenerBorradores` creaba uno vacío. La semana siguiente
// arrancaba de cero en vez de arrancar de lo que ya estaba al aire.

test("publicar_top deja el borrador siguiente ya cargado", () => {
  const fn = /function publicar_top[\s\S]*?\$\$ language/i.exec(codigo);
  assert.ok(fn, "no existe publicar_top");
  assert.match(fn![0], /insert into top_rankings/i,
    "no crea el borrador siguiente: el bloque queda vacío tras publicar");
  assert.match(fn![0], /insert into top_ranking_entries[\s\S]*?select/i,
    "crea el borrador pero sin copiarle las diez posiciones");
  assert.match(fn![0], /copiado_de/,
    "el borrador nuevo no apunta a la publicación de la que salió");
});

test("la fecha de captura del borrador nuevo es la de hoy, no la vieja", () => {
  // Si heredara `captured_at` de la publicación, el bloque nuevo nacería con la
  // fecha de la semana pasada y habría que acordarse de corregirla siempre.
  const fn = /function publicar_top[\s\S]*?\$\$ language/i.exec(codigo);
  assert.match(fn![0], /America\/Argentina\/Buenos_Aires/,
    "la fecha del borrador nuevo no se calcula en hora argentina");
});

// ============================================================================
// 5. Reemplazar las diez posiciones es una sola transacción
// ============================================================================
// Era DELETE y después INSERT en dos requests distintos a PostgREST. Si el
// segundo fallaba —red, 500, token vencido— el borrador quedaba VACÍO y lo
// cargado se perdía. Reordenar pasaba por ese camino.

test("existe una función que reemplaza las entradas de una sola vez", () => {
  assert.match(codigo, /function reemplazar_entradas/i,
    "el reemplazo sigue siendo delete + insert en dos requests");
  const fn = /function reemplazar_entradas[\s\S]*?\$\$ language/i.exec(codigo);
  assert.match(fn![0], /delete from top_ranking_entries/i);
  assert.match(fn![0], /insert into top_ranking_entries/i);
  // Sin esto, cualquiera podría vaciar un borrador ajeno llamando a la función.
  assert.match(fn![0], /is_admin_mfa\(\)/, "la función no comprueba admin + MFA");
});

test("las funciones del dashboard NO son security definer", () => {
  // Mismo criterio que la 006: el que llama es el admin con su sesión, y las
  // policies ya le dan permiso. `definer` sería privilegio regalado.
  for (const nombre of ["publicar_top", "reemplazar_entradas"]) {
    const fn = new RegExp(`function ${nombre}[\\s\\S]*?\\$\\$ language [a-z]+ (security \\w+)`, "i")
      .exec(codigo);
    assert.ok(fn, `no se encontró el modo de seguridad de ${nombre}`);
    assert.equal(fn![1], "security invoker", `${nombre} corre como su dueño`);
  }
});

// ============================================================================
// 4. El segundo factor de respaldo se exige de verdad
// ============================================================================
// La pantalla decía que hacen falta dos y el layout dejaba entrar con uno,
// porque miraba sólo el `aal`. Con un factor y la sesión elevada, `aal2` ya da
// "listo" — así que el aviso quedaba como una sugerencia que nadie cumple.

test("con un solo factor no se entra al dashboard, aunque haya aal2", () => {
  assert.equal(estadoDeMfa({ factores: 1, aal: "aal2" }), "falta-respaldo");
});

test("los otros estados no cambian", () => {
  assert.equal(estadoDeMfa({ factores: 0, aal: "aal1" }), "sin-factor");
  assert.equal(estadoDeMfa({ factores: 0, aal: "aal2" }), "sin-factor");
  assert.equal(estadoDeMfa({ factores: 1, aal: "aal1" }), "falta-verificar");
  assert.equal(estadoDeMfa({ factores: 2, aal: "aal1" }), "falta-verificar");
  assert.equal(estadoDeMfa({ factores: 2, aal: "aal2" }), "listo");
  assert.equal(estadoDeMfa({ factores: 3, aal: "aal2" }), "listo");
});

test("sin sesión no hay estado listo", () => {
  assert.equal(estadoDeMfa({ factores: 2, aal: null }), "falta-verificar");
});

// ============================================================================
// 3. El editor de reseñas volvió a funcionar
// ============================================================================
// Proteger `/api/admin-search` lo rompió dos veces: se quedó sin `Authorization`
// (401) y perdió la búsqueda combinada, porque la ruta pasó a exigir un `tipo`.

test("el editor de reseñas manda el token", () => {
  const src = readFileSync(
    new URL("../app/admin/resena/[id]/page.tsx", import.meta.url), "utf8");
  // Se busca el `fetch(`, no la primera aparición del texto "admin-search":
  // los comentarios la nombran antes y el test pasaba mirando prosa.
  const llamada = /fetch\(`\/api\/admin-search[\s\S]{0,300}/.exec(src);
  assert.ok(llamada, "el editor ya no llama a admin-search");
  assert.match(llamada![0], /Authorization/,
    "llama sin Authorization: la ruta protegida le devuelve 401");
  assert.doesNotMatch(llamada![0], /[?&]tipo=/,
    "manda un tipo: perdería la búsqueda combinada que esta pantalla necesita");
});

test("sin `tipo`, la búsqueda administrativa vuelve a combinar movie y tv", () => {
  const src = readFileSync(new URL("../app/api/admin-search/route.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(src, /searchMulti/,
    "perdió la búsqueda combinada que usaba el editor de reseñas");
  // Y el `tipo` tiene que ser opcional, no defaultear a `movie` en silencio:
  // eso le devolvía películas a quien buscaba una serie.
  assert.doesNotMatch(src, /:\s*MediaType\s*=\s*tipoRaw === "movie" \|\| tipoRaw === "tv" \? tipoRaw : "movie"/,
    "sigue cayendo a `movie` cuando no le mandan tipo");
});

// ============================================================================
// SEGUNDA AUDITORÍA
// ============================================================================

// --- 6. la revisión la invalida la BASE, no el código ------------------------
// `guardarPosicion` cambiaba la entrada y desmarcaba en DOS requests. Si el
// segundo fallaba —o si alguien llamaba a PostgREST directo— el bloque quedaba
// modificado y marcado como revisado: se publicaba contenido que nadie revisó.

test("tocar una entrada desmarca la revisión desde un trigger", () => {
  assert.match(codigo, /after insert or update or delete on top_ranking_entries/i,
    "la revisión sigue dependiendo de que el código se acuerde de desmarcarla");
  const fn = /function top_entry_invalida_revision[\s\S]*?\$\$[\s\S]*?\$\$/i.exec(codigo);
  assert.ok(fn, "no existe la función que invalida la revisión");
  assert.match(fn![0], /revisado_por = null/,
    "el trigger no desmarca");
  // En un DELETE en cascada la fila padre ya no está: actualizarla explotaría.
  assert.match(fn![0], /tg_op = 'DELETE'/i,
    "no distingue el DELETE, donde el padre puede no existir");
});

test("cambiar la fecha de captura también desmarca", () => {
  const fn = /function top_ranking_publicado_inmutable[\s\S]*?\$\$[\s\S]*?\$\$/i.exec(codigo);
  assert.match(fn![0], /captured_at is distinct from old\.captured_at[\s\S]{0,200}revisado_por := null/i,
    "cambiar la fecha deja la revisión puesta");
});

// --- 7. el respaldo MFA se exige donde importa -------------------------------
// El cliente pedía dos factores y la API y RLS aceptaban `aal2`, que se alcanza
// con uno. O sea que "obligatorio" lo sostenía sólo el layout, que es la capa
// que un `curl` no ve.

test("la base cuenta los factores verificados, no sólo el aal", () => {
  // Hasta el `;` final: `security definer` va DESPUÉS del `$$` de cierre, así
  // que un regex que corte en el `$$` no lo ve y el test pasa sin mirarlo.
  const fn = /function factores_totp_verificados[\s\S]*?\$\$[\s\S]*?\$\$[^;]*;/i.exec(codigo);
  assert.ok(fn, "no existe la función que cuenta factores");
  assert.match(fn![0], /auth\.mfa_factors/, "no mira los factores reales");
  assert.match(fn![0], /verified/, "cuenta factores sin verificar");
  assert.match(fn![0], /security definer/i, "no puede leer el esquema auth");
});

test("is_admin_mfa exige DOS factores, no sólo aal2", () => {
  const fn = /function is_admin_mfa[\s\S]*?\$\$[\s\S]*?\$\$/i.exec(codigo);
  assert.ok(fn);
  assert.match(fn![0], /aal2/, "dejó de exigir la sesión elevada");
  assert.match(fn![0], /factores_totp_verificados\(\) >= 2/,
    "acepta un solo factor: el respaldo era obligatorio sólo en el layout");
});

// --- 8. ninguna columna de autoría para `anon` -------------------------------
// RLS filtra FILAS, no columnas: `anon` podía leer los uuid de quién creó y
// quién revisó cada publicación.

test("la migración se comprueba a sí misma los privilegios de columna", () => {
  // ⚠️ UN `revoke select (columna)` NO ALCANZA: los privilegios de PostgreSQL
  // son ADITIVOS, y el `grant select` de TABLA que Supabase le da a `anon` y
  // `authenticated` sobrevive al revoke de columna. Hay que sacar el permiso
  // de tabla y conceder las columnas públicas una por una.
  assert.match(codigo, /revoke select on top_rankings from anon, authenticated/i,
    "revoca por columna: el grant de tabla lo sigue permitiendo");
  assert.match(codigo, /grant select \([\s\S]{0,200}\) on top_rankings to anon, authenticated/i,
    "no concede las columnas públicas: la app se queda sin leer nada");

  // 🔴 Y ÉSTA ES LA COMPROBACIÓN QUE IMPORTA, porque no es un barrido de
  // texto: corre DENTRO de la migración. Si algún día alguien vuelve a
  // conceder la tabla entera, la migración falla al aplicarse en vez de
  // dejar la fuga andando.
  assert.match(codigo, /has_column_privilege/,
    "la migración no verifica los privilegios al aplicarse");
});

test("queda un booleano para lo único que el dashboard necesita saber", () => {
  // El dashboard no necesita QUIÉN revisó, sólo SI está revisado. Con un
  // booleano generado, revocar los uuid no rompe nada.
  assert.match(codigo, /revisado\s+boolean\s+generated always as \(revisado_por is not null\) stored/i,
    "sin columna derivada, revocar los uuid rompe el dashboard y publicar_top");
});

test("publicar_top no lee las columnas revocadas", () => {
  const fn = /function publicar_top[\s\S]*?\$\$ language/i.exec(codigo);
  assert.doesNotMatch(fn![0], /select \* into r/i,
    "hace `select *`: leería columnas revocadas y fallaría al publicar");
  assert.match(fn![0], /r\.revisado\b/, "no usa el booleano derivado");
});
