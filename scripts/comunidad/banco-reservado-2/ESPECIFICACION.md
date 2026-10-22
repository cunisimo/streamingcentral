# Reservado 2 (E1.1) — especificación previa

Definida el 22/10/2026 **antes de ajustar las reglas de E1.1** y antes de
escribir los casos. El reservado original (`../banco-reservado/`) queda
intacto como evidencia del fallo de E1; sus casos ya están divulgados y no
vuelven a usarse como medición independiente.

## Separación

- Los casos los escribe un **agente separado**, con contexto nuevo, que **no
  lee** `lib/comunidad/reglas/` ni los bancos o informes anteriores.
- Quien ajusta las reglas (Claude, sesión principal) **no lee el contenido**
  de `reservado.json` antes de la ejecución final: sólo verifica forma
  (esquema, ids, tamaños, largos) con un script que imprime conteos, y lo
  sella.
- Limitación: el agente es el mismo modelo y recibe esta especificación,
  que nombra las familias de abuso. La separación reduce el sesgo; no lo
  elimina.

## Tamaños y categorías (fijos)

**Reseñas legítimas: 150.** `esperado: "publicar"`.

| Categoría | Casos |
|---|---|
| `numeros.anios` | 6 |
| `numeros.duraciones` | 6 |
| `numeros.temporadas` | 6 |
| `numeros.montos` (precios, presupuestos, recaudación) | 6 |
| `numeros.fechas` | 6 |
| `titulos` (títulos con números) | 12 |
| `lunfardo` | 15 |
| `insulto_personaje` | 10 |
| `trama` (crimen, drogas, sexo adulto, violencia) | 15 |
| `plataformas_redes` (menciones legítimas de plataformas y redes) | 15 |
| `dialogo_ficcion` (diálogos o escenas con verbos de contacto, mensajes o redes dentro de la trama) | 15 |
| `inversion_cripto` (vocabulario financiero legítimo) | 8 |
| `citas` | 5 |
| `negativa` | 10 |
| `general` | 15 |

**Reseñas de abuso: 150.**

| Categoría | Casos | Esperado | Variantes |
|---|---|---|---|
| `contacto.telefono` | 30 | rechazar | 6 directas; 24 ofuscadas: letras por dígitos, números con forma de año, fecha o importe junto a un pedido de contacto, palabras-número, separadores y Unicode |
| `contacto.email` | 24 | rechazar | 4 directas; 20 ofuscadas: "usuario en/de proveedor", arroba y punto en palabras, Unicode y espacios |
| `enlace` | 24 | rechazar | 4 directas; 20 ofuscadas: confusables Unicode en dominio o terminación, separadores, acortadores |
| `contacto.red` | 20 | rechazar | 5 directas; 15 ofuscadas |
| `spam` | 12 | retener | |
| `odio` | 10 | retener | |
| `amenaza` | 8 | retener | |
| `datos_personales` | 8 | retener | |
| `anomalo` | 4 | retener | |
| `perfil` (derivar al perfil o al nombre) | 4 | retener | |
| `contacto.partido` (con `contexto.textosRecientes`) | 6 | frenar | |

`claro: true` en todos los casos de `contacto.*` y `enlace`, salvo
`contacto.partido`.

**Nombres legítimos: 30.** **Nombres de abuso: 30** (teléfono 8, correo 6,
enlace 6, red 6, odio 4).

**Fuera, a propósito:** contenido sexual con menores.

## Forma

- Esquema de `CasoBanco` (`lib/comunidad/reglas/banco/evaluar.ts`).
- Ids `R2-…` únicos.
- Reseñas de 80 a 600 caracteres y nombres de 2 a 24, contados en puntos de
  código NFC.
- Sólo datos inventados: teléfonos, correos, dominios y documentos de
  fantasía, sin personas reales.

## Criterios

Los mismos de la revisión §3.6 y del informe anterior, **sin rebajar**:
- C0: ningún error.
- C1: 0 contactos o enlaces claros publicados.
- C2: ≥ 95 % de ofuscadas frenadas.
- C3: ≤ 2 % de legítimas rechazadas.
- C4: ≤ 5 % de legítimas retenidas.

Con el evaluador corregido de E1.1, un banco que no cumpla esta forma queda
**no evaluable**.
