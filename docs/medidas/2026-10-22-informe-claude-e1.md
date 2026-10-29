# Informe para auditoría — E1, reglas propias y banco sintético

22/10/2026. Claude Code. Rama `feat/resenas-reglas`, desde
`docs/resenas-comunidad` (`a029259`, plan corregido), que a su vez parte de
`integracion/yumpea-compartir` (`52c7ae7`, arreglos de salas aprobados en
local).

**Alcance autorizado:** sólo E1, en local. Reglas puras y banco sintético.
- No están conectadas a rutas, pantallas, Supabase ni publicaciones.
- Sin base, SQL, red, proveedores, Producción, variables, push, merge,
  deploy ni AAB.

## Commits

| Commit | Qué |
|---|---|
| `3437578` | **Sello del reservado, antes de escribir las reglas** (`scripts/comunidad/banco-reservado/`) |
| `fd3a2ad` | Módulo de reglas, banco de desarrollo, pruebas y corredor del reservado |
| (este) | Resultado del reservado, este informe y `docs/ESTADO.md` |

El orden se puede verificar en Git: el reservado (SHA-256 LF
`9975c60c…62c4ec79`) es anterior a cualquier archivo de `lib/comunidad/`.

## Qué se implementó (`lib/comunidad/reglas/`)

- `plegado.ts`: dos pasadas (rev. §3.1).
  - Pasada de dígitos: las palabras-número se convierten sólo dentro de
    corridas de 3 o más piezas.
  - Pasada de letras: confusables ambiguos como clases; cirílicas y griegas
    no ambiguas mapeadas.
  - Se resuelven los "punto", "arroba" y `(.)` ofuscados, y se unen letras
    sueltas.
- `reglas.ts` y `listas.ts`: 19 reglas distintas, cada una con `id` y
  `version`.
  - **Reseñas:** 16 reglas. Formato, teléfono, correo, enlace, redes,
    contacto partido, spam, odio, amenazas, documento, domicilio, menores,
    tres de texto anómalo y derivación al perfil.
  - **Nombres:** 6 reglas. Formato, teléfono con umbral propio de 6 dígitos,
    correo, enlace, redes (en un nombre, una red sola ya cuenta) y odio. Sin
    reglas de texto anómalo.
- `decision.ts`: `evaluarResena(texto, contexto)` y `evaluarNombre(nombre)`.
  - Resultados: `publicar`, `retener`, `rechazo_formato`,
    `rechazo_contenido` o `error`. Gana el más restrictivo.
  - Cada decisión lleva `versionReglas`, las reglas disparadas con su
    versión y el motivo para el usuario.
  - Una retención no revela la regla.
  - **Ningún fallo devuelve `publicar`:** excepción, disparo inválido, regla
    que no corrió, plegado roto, contexto inválido o texto que no es string
    dan `error`.
- **Contexto explícito:** `{ textosRecientes }`, hasta 3, lo arma quien
  llama. El módulo no consulta nada.
- **Duplicados y límites por cuenta:** no están; necesitan la base (E3b).

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `node --test "lib/comunidad/**/*.test.ts"` | 42 de 42 |
| `npx tsc --noEmit` | 0 errores |
| `npm test` (suite completa) | 2291 pruebas: 2273 pasan, 0 fallan, **18 omitidas** |
| `node scripts/comunidad/correr-reservado.mjs` | Corrido **una vez**; C1 y C2 **no cumplen** |

- **Omitidas:** las 18 son pruebas de artefactos de build
  (`lib/metricas-nativo.test.ts`, `lib/pwa-nativa.test.ts`,
  `lib/recordatorio-nativo.test.ts`). Se saltean sin `npm run build` o
  `build:capacitor`, que no se corrieron por estar fuera de E1.
- **Dependencias:** para correr `tsc` y la suite se instalaron con
  `npm ci --prefer-offline`, desde el lockfile (idéntico al del checkout
  principal). Quedan en `node_modules`, ignorado por Git.
- **Pruebas cubiertas:**
  - plegado;
  - cada regla, con sus falsos positivos más probables;
  - excepción inyectada en **cada** regla de reseña y de nombre;
  - disparos inválidos y contexto inválido;
  - aislamiento: sólo imports locales, sin `fetch`, `process.env` ni
    módulos de red, y una evaluación del banco con `fetch` bloqueado que
    hace 0 llamadas.
- **Banco de desarrollo** (406 casos: 162 reseñas legítimas, 203 de abuso,
  23 nombres legítimos y 18 de abuso): todos los casos dan lo esperado y
  cumple C0–C4.

## Resultado del reservado

Informe por caso y por categoría:
[`2026-10-22-e1-banco-reservado.md`](2026-10-22-e1-banco-reservado.md).

| Criterio | Valor | Cumple |
|---|---|---|
| C0 ningún error | 0 | sí |
| C1 0 enlaces o contactos claros publicados | **3/50** | **no** |
| C2 ≥ 95 % de ofuscadas frenadas | **40/43 (93,0 %)** | **no** |
| C3 ≤ 2 % de legítimas rechazadas | 0/61 | sí |
| C4 ≤ 5 % de legítimas retenidas | 1/61 (1,6 %) | sí |

**Casos con resultado distinto del esperado:**
- **`R-A-009`, publicado.** "11 5O5O 1234": letras O mayúsculas en lugar de
  ceros dentro del número. La pasada de dígitos no convierte letras.
- **`R-A-018`, publicado.** "juanperez en gmail, sin espacios": correo dicho
  con palabras, sin `@` ni "arroba".
- **`R-A-029`, publicado.** "сinemania.сом": la `м` cirílica (U+043C) no está
  en la tabla de confusables, así que el TLD no se reconoce.
- **`R-L-045`, retenido (falso positivo).** "una familia que vive en la calle
  Corrientes 1234": la regla de domicilio no distingue un dato de la trama de
  uno real.

**No se modificó el reservado ni se volvió a correr.** Cualquier ajuste a las
reglas por estos casos se haría con casos equivalentes en el banco de
desarrollo, y su efecto sobre un reservado sólo se podría medir con un
**conjunto nuevo, sellado otra vez**, con informe. No se hizo: queda a
criterio de la auditoría.

## Limitaciones conocidas

- **Casos sintéticos, no seguridad comprobada.** Mide reglas contra casos
  conocidos. No dice nada de eficacia contra abuso real ni contra variantes
  que los bancos no tienen.
- **El reservado no es independiente.** Lo escribió el mismo autor que las
  reglas, antes de escribirlas pero conociendo el diseño. El resultado es
  probablemente optimista; un conjunto escrito por otra persona sería una
  medida mejor.
- **Tamaño del reservado:** 61 y 60 reseñas, menos que las 150 por suite de
  la revisión §3.6, que se cumplen en el banco de desarrollo. Cada caso del
  reservado pesa 1,6–2 %.
- **Menores:** sin textos realistas, a propósito. La regla se prueba con
  combinaciones mínimas; su cobertura real es desconocida.
- **Lo que no detecta por diseño:** acoso o insultos sin términos de la
  lista, ironía, odio en código, difamación, amenazas indirectas, estafas sin
  enlaces, números ni vocabulario conocido, correos dichos con palabras,
  letras dentro de números, confusables fuera de la tabla.
- **Falsos positivos conocidos:**
  - dirección ficticia de la trama → retenida;
  - amenaza citada de una película → retenida;
  - vocabulario de inversión más un monto en una reseña legítima → retenida.
- **Duplicados, límites por cuenta, contexto real y versión de términos:**
  fuera de E1.
- **Todo es hipótesis**: listas, umbrales y ventanas. No es eficacia medida
  ni cumplimiento de Play.

## Qué no se hizo

- E2 ni ninguna entrega posterior.
- Conexión a rutas, pantallas o Supabase.
- Compilación web o Android y mediciones ajenas a E1.
