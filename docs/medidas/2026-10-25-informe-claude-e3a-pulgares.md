# Informe breve — pulgares en la evaluación de reseñas (25/10/2026)

Autor: Claude. Rama `feat/resenas-reglas`. Es el pedido visual del dueño que
registra la auditoría `docs/medidas/2026-10-25-auditoria-e3a-a1a2-f9be491.md`
(copiada sin cambios en esta entrega; SHA-256 `6e8eee47…`). Todo local: con
`supabase start`, el servidor local y cuentas ficticias. Los interruptores
quedaron apagados. No avanza a E3b.

## Qué cambió

- `components/comunidad/EvaluacionResena.tsx`:
  - "Me sirvió" y "No me sirvió" pasan a ser **pulgar arriba** y **pulgar
    abajo**. Los trazos son los de `components/LikeButton.tsx`.
  - El SVG lleva `width`/`height` 22 propios además del CSS, para no repetir
    el ícono de 0×0 de Salas.
  - Cada botón conserva su nombre accesible (`aria-label` "Me sirvió" / "No
    me sirvió", más `title`) y `aria-pressed`. Los dos van en un grupo
    rotulado "¿Te sirvió esta opinión?".
  - El conteo va **encima**, en un `<p>` con `aria-live`.
- `lib/comunidad/evaluacion-nucleo.ts`: `conteoUtilidad` con el formato del
  dueño y `nombreBotonVoto`.

  | Caso | Texto |
  |---|---|
  | Plural | "285 de 481 encontraron útil esta opinión" |
  | Singular (concuerda con quienes la encontraron útil) | "1 de 4 encontró útil esta opinión" |
  | Ninguna útil | "0 de 3 encontraron útil esta opinión" |
  | Sin evaluaciones | "Todavía nadie evaluó esta opinión." |

  Los miles van con punto, como en `es-AR`: "1.250 de 2.400".
- `app/globals.css`:
  - `.cm-pulgar` de 44×44, redondo;
  - el **elegido** va con fondo naranja y el pulgar relleno; el no elegido,
    con contorno;
  - `:focus-visible` con anillo de 2 px;
  - `hover` sólo en dispositivos con puntero;
  - el conteo fija fuente y tamaño propios, porque dentro de `.review p`
    heredaba el texto grande de la reseña (encontrado en el recorrido).
  - Se retiraron los estilos `.cm-chip`, que no usa nadie más.
- La lógica no cambió:
  - `accionVoto`: tocar el elegido retira y tocar el otro cambia;
  - `puedeEvaluar`: en la propia, conteo sin botones.
- Ajuste encontrado en el recorrido: mientras se envía, el botón queda
  `aria-disabled` en lugar de `disabled`. La guarda `if (enviando) return`
  evita el doble envío. Con `disabled`, quien votaba con teclado perdía el
  foco y lo mandaba al principio de la página. Esto ya pasaba con los chips
  anteriores.
- `app/revision-local/comunidad/page.tsx`: el `padding: 16px` en línea pisaba
  el `padding-bottom` global de `main`, que deja lugar a la barra inferior.
  Los pulgares de la última reseña quedaban debajo de la barra a 375 px. Es
  sólo la página de revisión local; la ficha no usa ese estilo.
- `docs/medidas/2026-10-25-e3a-a1a2-salidas.txt`: se quitaron los seis
  espacios finales de las líneas 11, 13, 15, 17, 19 y 21.
  `git diff -w` sobre el archivo queda vacío: no cambió ningún resultado.

## Verificación

| Qué | Resultado |
|---|---|
| `npx tsc --noEmit --incremental false` | exit 0 |
| `node --test lib/comunidad/*.test.ts` | 38/38 |

Las pruebas nuevas o cambiadas:
- los cinco conteos, más el caso de miles;
- los nombres accesibles;
- en el código del componente: `aria-pressed`, `aria-disabled`, la guarda,
  el SVG con tamaño, que la propia no tiene botones y que no queda el texto
  visible viejo;
- en el CSS: 44×44, el ícono de 22×22, el foco y el estado elegido.

**En navegador** (servidor local, `/revision-local/comunidad?id=9711`). Con
cuentas ficticias que votaron por las funciones reales:

| Reseña | Conteo |
|---|---|
| La propia | 0 de 1 |
| A | 3 de 5 |
| B | 1 de 2 |
| C | sin evaluaciones |

- Los cuatro textos coinciden con la base. La propia no tiene pulgares.
- Botones de 44×44 e íconos de 22×22, medidos en la página.
- **Votar, cambiar y retirar en A**, comprobado contra la base en cada paso:
  - pulgar arriba: "4 de 6", `aria-pressed=true`, fondo naranja; en la base
    `voto_yo=true`;
  - pulgar abajo: "3 de 6"; en la base `false`;
  - tocar otra vez el abajo: "3 de 5"; en la base, sin voto.
- **Teclado en B:**
  - Tab al pulgar abajo: `:focus-visible` con anillo naranja;
  - Enter vota: "1 de 3";
  - tras el arreglo, Enter sobre el elegido retira: "1 de 2", y el foco
    sigue en el botón.
- **A 375 px:** sin desplazamiento horizontal (ancho del documento 375);
  botones de 44×44; tras el arreglo del margen, el último pulgar queda
  arriba de la barra (701 < 739 px).

Capturas en `docs/medidas/2026-10-25-e3a-pulgares/`:

| # | Captura |
|---|---|
| 01 | Escritorio: conteos |
| 02 | Escritorio: pulgar arriba elegido |
| 03 | Escritorio: cambio a pulgar abajo |
| 04 | Escritorio: foco de teclado (04b, detalle) |
| 05 | 375 px: voto elegido |
| 06 | 375 px: la propia sin pulgares y una sin evaluaciones |

No se repitieron baterías generales: no cambió nada del servidor ni del SQL.
La prohibición de evaluar la propia sigue en la base (`propia`, ya probada
en E3a); en la interfaz, la propia no muestra botones.

## Limpieza y límites

- Cuentas, participantes, reseñas, votos y contadores del recorrido,
  borrados por id: `0|0|0`.
- `comunidad.config` en `false/false/false`, límites 5/10/100.
- Servidor detenido y vista del navegador restablecida.
- Las 42 cuentas `@comunidad.test` del 24/10 siguen sin tocar.

**No verificado:**
- el tema claro;
- un teléfono real y Android;
- la ficha con TMDB;
- lectores de pantalla reales: se verificaron los atributos, no la locución;
- la captura de referencia del dueño: no llegó a esta sesión. El diseño
  sigue la descripción del pedido (pulgares con el conteo encima) y conviene
  que el dueño lo compare con su captura.
