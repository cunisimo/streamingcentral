// Dos decisiones del dueño del 23/09, fijadas por barrido textual:
//   1. El invitado NO elige plataformas: las de la sala las pone quien la crea.
//   2. El texto y la forma de "Esta vez no hubo match".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const FORM = leer("components/sala/UnirseForm.tsx");
const SIN = leer("components/sala/ResultadoSinCoincidencias.tsx");
const SQL = leer("supabase/migrations/009_salas.sql");

test("el formulario del invitado pide SÓLO el nombre: ni selector de plataformas ni parámetro", () => {
  assert.doesNotMatch(FORM, /SelectorPlataformasSala/, "el selector se fue");
  assert.doesNotMatch(FORM, /usePlatforms/, "tampoco lee 'mis plataformas' para mandarlas");
  assert.doesNotMatch(FORM, /p_platforms/, "la llamada ya no manda plataformas");
  assert.match(FORM, /rpc\("sala_unirse", \{ p_room: roomId, p_nombre: n, p_credencial: credencial \}\)/);
  assert.match(FORM, /<label htmlFor="sala-nombre">Tu nombre<\/label>/, "el nombre sigue");
});

test("🔴 la regla vive en la BASE, no sólo en la pantalla: sala_unirse ya no recibe plataformas", () => {
  // Con el parámetro vivo, una llamada directa seguiría ampliando la unión de la
  // sala —que es lo que decide qué películas entran—, por más que el selector no
  // se dibuje. Por eso se cambia la firma y se borra la anterior.
  assert.match(SQL, /create or replace function sala_unirse\(p_room uuid, p_nombre text, p_credencial text\)/);
  assert.match(SQL, /drop function if exists sala_unirse\(uuid, text, text\[\], text\);/, "la firma con plataformas se borra");
  assert.match(SQL, /revoke execute on function sala_unirse\(uuid, text, text\) from public, anon, authenticated;/);
  assert.match(SQL, /grant execute on function sala_unirse\(uuid, text, text\) to anon, authenticated;/);
  // El invitado hereda las del organizador (la columna es `not null` con
  // cardinality >= 1, así que un array vacío ni siquiera entraría).
  assert.match(SQL, /select platforms into plats from room_participants where room_id = p_room and es_host;/);
  const unirse = SQL.match(/create or replace function sala_unirse\([\s\S]*?\n\$\$;/)![0];
  assert.doesNotMatch(unirse, /sala_plataformas_validas/, "ya no valida plataformas: no recibe ninguna");
  // Quien SÍ las recibe y valida sigue siendo sala_crear.
  assert.match(SQL, /create or replace function sala_crear\(p_nombre text, p_platforms text\[\], p_credencial text\)/);
  // El down de la migración tiene que poder borrar la firma nueva.
  assert.match(leer("supabase/migrations/009_salas_down.sql"), /drop function if exists sala_unirse\(uuid, text, text\);/);
});

test("\"Esta vez no hubo match\": carita, título y bajada, en ese orden", () => {
  // Se mira el JSX, no el archivo entero: el comentario de cabecera nombra el
  // título para explicar el cambio, y eso no es lo que se renderiza.
  const jsx = SIN.slice(SIN.indexOf("return ("));
  const i = (t: string) => {
    const n = jsx.indexOf(t);
    assert.ok(n >= 0, `falta en el JSX: ${t}`);
    return n;
  };
  const carita = i('<p className="sala-carita" aria-hidden>🙁</p>');
  const titulo = i("Esta vez no hubo match");
  const bajada = i("Ninguna película tuvo coincidencias. Suele pasar.");
  assert.ok(carita < titulo && titulo < bajada, "la carita va arriba de todo");
  // Las cards de la tanda separándose se retiraron con esta pantalla.
  assert.doesNotMatch(jsx, /sala-separa/, "sin las cards que se separaban");
  assert.doesNotMatch(SIN.slice(0, SIN.indexOf("// ")), /titulos/, "ya no recibe los títulos de la ronda");
  assert.doesNotMatch(jsx, /titulos/);
  assert.doesNotMatch(leer("components/sala/SalaView.tsx"), /<ResultadoSinCoincidencias[^>]*titulos=/);
});

test("la línea de Otra tanda es SÓLO del organizador, y quien lo decide es la base", () => {
  assert.match(SIN, /\{estado\.resultado\?\.puede_otra_tanda === true && \(\s*\n\s*<p className="sala-hint sala-sin-bajada">Si elegís Otra tanda pueden ver otras\.<\/p>/);
  // `puede_otra_tanda` = host + estado resultado + sin ganadora (ver PieResultado):
  // al invitado no se le ofrece una acción que no puede ejecutar.
  assert.match(SQL, /'puede_otra_tanda', yo\.es_host and s\.estado = 'resultado' and r\.ganador_pos is null/);
});
