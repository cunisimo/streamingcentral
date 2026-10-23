# E1, reservado 3: detenido antes de evaluar

23/10/2026. Claude Code. Rama `feat/resenas-reglas`. Informe para Codex y
el dueño.

**No se evaluó nada.** El conjunto quedó incompleto y el protocolo exige
detenerse (`scripts/comunidad/banco-reservado-3/PROTOCOLO.md` §5.4). No se
selló y no se ejecutó el ejecutor oficial. Las reglas no cambiaron. **E1
sigue pendiente de cierre.**

## Qué se hizo, en orden (historial de Git)

| Commit | Qué |
|---|---|
| `1e731d1` | Copia sin cambios de la auditoría de `a8e973a`, congelamiento del código y protocolo, **antes de que existiera ningún caso** |
| `3e36c5a` | Ejecutor `scripts/comunidad/correr-reservado-3.mjs`, terminado y probado con datos sintéticos ajenos **antes de encargar los casos** |
| (este) | `reservado.json` sin leer, con su huella; este informe y `docs/ESTADO.md` |

**Código congelado**
- `VERSION_REGLAS` `2026-10-22.5`, código `b6e1f33`.
- Árbol de `lib/comunidad/reglas` `66cc48ba…`, igual en `a8e973a`.
- Huellas por archivo en `2026-10-23-e1-reservado-3-congelamiento.md`.
- `git diff b6e1f33 -- lib` sigue vacío.

**Prueba del ejecutor, con un banco sintético** generado por un script fuera
del repositorio, con los conteos del protocolo y textos genéricos:
- la corrida es evaluable y escribe el informe y el resultado por caso;
- una segunda corrida se rechaza porque el informe ya existe;
- un archivo alterado después de sellar se rechaza por el sello;
- con un caso de menos, el banco es no evaluable y los criterios quedan
  `no_evaluable`;
- `--prueba` se niega a usar el directorio del reservado.

No se probó una huella de código distinta: habría exigido modificar las
reglas.

## Autoría y lo que falló

Encargué los casos a dos agentes separados, con contexto nuevo. Cada uno
recibió el mismo mensaje común y la parte que le tocaba. Los textos exactos
están más abajo. La única fuente que se les indicó fue `PROTOCOLO.md`; podían
**ejecutar** `--solo-forma` sin leerlo.

| Archivo | Resultado |
|---|---|
| `reservado.json` | **Escrito completo:** 340 casos (160 legítimas, 124 abusos, 30 nombres legítimos y 26 nombres de abuso). `--solo-forma` no marca problemas en ese archivo. SHA-256 (LF): `8d9e171440bd2ce20f52ee73037d233138ef114adfe90bffa3e4352b8d0f83c7` |
| `reservado-sensible.json` | **No existe.** El agente informó que un clasificador de seguridad cortó la redacción y que no podía volver a generarla, tampoco reformulada. Siguiendo la instrucción, no reemplazó ni suavizó nada. Faltan `odio` (8 reseñas y 4 nombres), `amenaza` (8), `datos_personales` (8) y `fuera_capacidad` (8) |

**Lecturas declaradas por los agentes.** Ninguno abrió a propósito otro
archivo del repositorio, usó Git o internet. Los dos recibieron
automáticamente `CLAUDE.md` del proyecto, que no describe las reglas. El
general vio, en una advertencia de Node al ejecutar `--solo-forma`, el nombre
de ruta `lib/comunidad/reglas/banco/evaluar.ts`, sin su contenido. Sus scripts
auxiliares quedaron fuera del repositorio.

**Decisiones de interpretación del autor general.** Quedaron anotadas en el
campo `descripcion`, y las tomo de su respuesta, no del archivo:
- tomó como `claro` el contacto que se reconstruye siguiendo instrucciones
  explícitas del texto, sin adivinar (quitar espacios, leer letras como
  dígitos, leer al revés, juntar dos años);
- no puso datos de contacto en los casos de spam ni de perfil.

**Separación que tengo:** no leí el contenido de `reservado.json`. Sólo vi
los conteos y los problemas que imprime `--solo-forma`, sin textos, y lo
dejo en Git sin abrirlo.

## Por qué me detengo y no lo completo

El encargo dice que, si una categoría no puede redactarse, se informe y se
detenga antes de evaluar, sin completar casos a mano. Las alternativas cambian
la autoría o el protocolo, así que las decide el dueño, con revisión de Codex:

1. **El dueño u otra persona ajena a las reglas escribe las 32 reseñas y 4
   nombres sensibles.** Conserva la independencia, porque esas reglas tampoco
   las escribió esa persona.
2. **Los escribo yo, como enmienda declarada, igual que en el reservado 2.**
   Sobre reglas que esta entrega no modifica (`odio.lista`, `amenaza.directa`,
   `datos.documento`, `datos.domicilio`). **No** serían independientes:
   conozco las listas. `fuera_capacidad` es informativo y no entra en C1 ni en
   C2.
3. **Enmendar el protocolo antes de evaluar** para medir sólo
   `reservado.json`, informando que odio, amenaza, datos personales y fuera de
   capacidad quedan sin medición independiente. C1 y C2 no cambian de
   denominador: ninguna de esas categorías está en ellos. Sí cambian los
   conteos de forma y de abuso total: 124 reseñas de abuso, por debajo del
   mínimo de 150 del protocolo y de la revisión §3.6. Por eso esta opción
   **cambia un requisito**.

Cualquiera de las tres debe fijarse en Git **antes** de sellar y de evaluar.
Hasta esa decisión, `reservado.json` queda sin leer y sin evaluar.

## Encargo entregado a los agentes (textos exactos)

**Común a los dos:**

> Vas a escribir casos de prueba sintéticos para evaluar un moderador automático de reseñas de una app de cine y series argentina (Yump). Es material de PRUEBA para un sistema de seguridad: su función es medir si el moderador frena contactos, enlaces, spam, odio, amenazas y datos personales, y si deja pasar las reseñas legítimas. Nadie va a publicar estos textos.
>
> Trabajás en el repositorio D:\DESARROLLO\stream central\wt-resenas-comunidad.
>
> REGLAS DE SEPARACIÓN (obligatorias):
> - Leé ÚNICAMENTE scripts/comunidad/banco-reservado-3/PROTOCOLO.md. Ahí están los requisitos de producto, las categorías, los tamaños, las etiquetas y la forma de los archivos.
> - NO leas ningún otro archivo del repositorio: ni lib/, ni otros archivos de scripts/, ni docs/, ni bancos o informes anteriores, ni el historial de Git. No busques con grep/glob en el repositorio.
> - No uses internet ni servicios externos.
> - Si necesitás un script auxiliar para armar el JSON, escribilo FUERA del repositorio, en la carpeta temporal indicada abajo. No dejes nada en el repositorio salvo el archivo JSON que te toca.
> - Podés EJECUTAR (sin leerlo) este comando para verificar la forma, que imprime sólo conteos y problemas:
>     node scripts/comunidad/correr-reservado-3.mjs --solo-forma
>   Va a reportar problemas del otro archivo (lo escribe otra persona): ignoralos y corregí sólo los del tuyo.
>
> CALIDAD:
> - Redacción variada, realista, en español rioplatense (con registros distintos, algún error de tipeo, emojis ocasionales). Nada de plantillas con un hueco que cambia.
> - Todo dato de contacto, documento, dominio o usuario es inventado. Ninguna persona real como víctima.
> - Las etiquetas salen de lo que el protocolo dice que el producto tiene que hacer, no de adivinar cómo funcionan las reglas. No ajustes casos para que pasen o fallen.
> - Respetá exactamente los conteos, ids, campos y largos (reseñas y textos de contexto 80–600 puntos de código NFC; nombres 2–24).
>
> AL TERMINAR, respondé SIN INCLUIR NINGÚN TEXTO DE LOS CASOS (quien te encarga no debe leerlos antes de la evaluación). Informá sólo: archivo escrito, cantidad de casos por categoría, si alguna categoría o caso NO pudo escribirse y por qué, cualquier decisión de interpretación del protocolo, y si leíste algo más que el protocolo (aunque haya sido por error).

**Parte del autor general:**

> TU PARTE: escribí scripts/comunidad/banco-reservado-3/reservado.json con TODO lo que el protocolo asigna a ese archivo: las 160 reseñas legítimas, las reseñas de abuso de las secciones A, B y C salvo odio, amenaza y datos_personales (o sea: contacto.telefono, contacto.email, enlace, contacto.red, contacto.indirecto, contacto.partido, perfil, spam, anomalo), los 30 nombres legítimos y los 26 nombres de abuso de contacto. NO escribas reservado-sensible.json: lo escribe otro agente. Carpeta temporal para scripts auxiliares: (carpeta temporal de la sesión)\autor-general

**Parte del autor sensible:**

> TU PARTE: escribí scripts/comunidad/banco-reservado-3/reservado-sensible.json con lo que el protocolo asigna a ese archivo: odio (8 reseñas y 4 nombres), amenaza (8 reseñas), datos_personales (8 reseñas) y fuera_capacidad (8 reseñas). NO escribas reservado.json: lo escribe otro agente. Carpeta temporal para scripts auxiliares: (carpeta temporal de la sesión)\autor-sensible
> Estos casos existen para comprobar que el moderador RETIENE este contenido y no lo publica. Escribilos con la crudeza necesaria para que sean ejemplos realistas de lo que el producto tiene que frenar, pero sin datos reales, sin personas reales como blanco y sin contenido sexual con menores (excluido por el protocolo). Si alguna categoría o caso no podés escribirlo, NO lo reemplaces por otra cosa ni lo suavices hasta que deje de ser lo que la categoría pide: dejalo sin escribir y explicá en tu respuesta qué faltó y por qué.

## Sin cambios

- Los reservados 1 y 2, sus sellos y sus informes: `git diff 1f475e3 --
  scripts/comunidad/banco-reservado scripts/comunidad/banco-reservado-2`
  vacío.
- No hubo E2, rutas, pantallas, Supabase, SQL, APIs externas, Producción,
  push, merge, deploy ni AAB.
