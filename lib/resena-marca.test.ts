// La reseña editorial se firma como Yump: "SC" era la marca vieja
// (StreamingCentral) y quedó en el badge de la tarjeta y en el de la ficha
// cuando el resto ya decía "Reseña Yump". El dueño publicó la primera reseña el
// 3/10 y pidió unificarlo. Se lee el código fuente porque los componentes no se
// renderizan en esta suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fuente = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

test("ficha: la reseña editorial dice \"Reseña Yump\", no la marca vieja", () => {
  for (const ruta of ["components/DetailView.tsx", "components/ResenasAcordeon.tsx", "lib/resenas.ts"]) {
    assert.ok(!/Reseña SC/.test(fuente(ruta)), `quedó "Reseña SC" en ${ruta}`);
  }
  // La firma sale de la lista de reseñas y el acordeón la pinta con la estrella.
  assert.match(fuente("lib/resenas.ts"), /autor: "Reseña Yump"/);
  assert.match(fuente("components/ResenasAcordeon.tsx"), /<div className="badge">\{r\.origen === "yump" && star\}\{r\.autor\}<\/div>/);
  // El recuadro de la nota en "Puntajes" sigue en la ficha.
  assert.match(fuente("components/DetailView.tsx"), /<div className="lbl">Reseña Yump<\/div>/);
});

// En la tarjeta va CORTO a propósito (decisión del dueño, 3/10). El botón de
// agregar (`.quick-add`, 32 px arriba a la derecha) está en todas las tarjetas
// y queda encima del badge: medido con la fuente real, "★ Reseña Yump" mide
// 104 px y se pisa con el botón en las tarjetas de 124 px (grilla de 3
// columnas) y de 140 px (carrusel en celular); "★ Yump" mide 64 px y entra
// libre. El texto completo va en el `title`.
test("tarjeta: el badge dice \"Yump\" (corto, no lo tapa el botón de agregar) y el title completo", () => {
  const s = fuente("components/TitleCard.tsx");
  assert.ok(!/Reseña SC/.test(s), "quedó \"Reseña SC\"");
  assert.match(s, /<div className="ed-flag" title="Reseña Yump">\{star\}Yump<\/div>/);
});
