import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const raiz = new URL("../", import.meta.url);

test("/robots.txt frena sólo a Reflectionbot y nada más", () => {
  assert.equal(
    readFileSync(new URL("public/robots.txt", raiz), "utf8").replace(/\r\n/g, "\n"),
    "User-agent: Reflectionbot\nDisallow: /\n",
    "cualquier otra línea puede sacar de los buscadores a Yump o a sus App Links",
  );
});

test("ninguna ruta de Next le gana al archivo estático", () => {
  for (const f of ["app/robots.ts", "app/robots.tsx", "app/robots.txt", "app/robots.txt/route.ts"]) {
    assert.equal(existsSync(new URL(f, raiz)), false, f);
  }
});
