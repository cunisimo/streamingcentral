# Auditoría de la corrección de E1.2 — 251f3d0

22/10/2026. Codex. Rama revisada: `feat/resenas-reglas`, worktree
`D:\DESARROLLO\stream central\wt-resenas-comunidad`, HEAD `251f3d0`.

## Dictamen

Los dos ejemplos de la auditoría anterior están corregidos: el dominio con
terminación larga se rechaza y el correo indirecto se retiene. No se modificaron
los reservados ni se presentó una regresión como medición independiente.

Hay dos huecos mecánicos reproducibles dentro de las familias recién modificadas,
uno de ellos una regresión. Corregirlos antes de congelar la versión para una
medición independiente. E1 sigue pendiente; no avanzar a E2.

## A1 — P2: la nueva condición sobre el inicio de la ruta deja pasar enlaces antes detectados

En `lib/comunidad/reglas/reglas.ts:279`, además de ampliar el largo de la
terminación, se cambió el primer carácter de la ruta: ahora exige letra o número.
El patrón anterior admitía también `_`, `-` y otros signos. El cambio de inicio
de ruta no es necesario para ampliar la terminación y permite eludir la detección
sin cambiar el dominio ni el destino funcional de una ruta elegida por el autor.

Reproducción propia con prefijo legítimo y longitud válida:

- `Mirala en ejemplo.photography/demo sin cortes.` → `rechazo_contenido`.
- `Mirala en ejemplo.photography/_demo sin cortes.` → `publicar`, sin disparos.
- `Mirala en ejemplo.xy/_demo sin cortes.` → `publicar`, sin disparos.

Control antes/después: extraje de Git el patrón real de cada versión y lo ejecuté
con las mismas constantes. Para `ejemplo.xy/_demo`, `40288f6` detecta y `251f3d0`
no detecta. Para `ejemplo.xy/demo`, ambas detectan. Esto confirma una regresión
del patrón, no una falla del arnés ni un cambio ajeno a esta entrega.

Recomendación: conservar la cobertura previa de caracteres de ruta al generalizar
el largo de la terminación. Probar, con y sin subdominio, rutas iniciadas con
letras, dígitos, guion bajo, guion y otros caracteres que la versión anterior
admitía. Incluir controles legítimos de puntuación; no agregar sólo los ejemplos
a una lista. No hace falta navegar ni resolver esos dominios.

## A2 — P2: dos definiciones diferentes de alias fuerte permiten evadir la nueva retención

En `reglas.ts:223`, `RE_ALIAS_FUERTE_G` reconoce alias con puntos o guiones bajos,
o letras seguidas por dígitos al final. No reconoce dígitos al principio ni
intercalados entre letras. En cambio `esAliasFuerte`, en la línea siguiente,
considera fuerte cualquier combinación de letras y dígitos: el comportamiento
depende innecesariamente de si aparece la fórmula «mi correo es».

Reproducción con el mismo prefijo y sólo cambiando el alias:

- `Mandame un mail, soy cine.fan88, y te paso la lista.` → `retener`.
- `Mandame un mail, soy 88cine, y te paso la lista.` → `publicar`.
- `Mandame un mail, soy cine8fan, y te paso la lista.` → `publicar`.

La señal de correo y la intención de contacto son idénticas. No es una nueva
paráfrasis semántica: es la misma familia de alias de letras y números que la
regla y su informe declaran reconocer.

Recomendación: unificar el criterio de alias para ambos recorridos. Agregar
transformaciones con dígitos al inicio, en medio y al final, además de puntos y
guiones bajos. Conservar controles numéricos puros («agente 007»), títulos con
números y menciones técnicas: no retener automáticamente todo texto alfanumérico.
Mantener la salida de señal indirecta como retención, no rechazo.

## Correcciones y límites revisados

- Los dos literales de correo de la auditoría de `40288f6` ahora se retienen.
- La prueba del reservado 2 ya no exige que `R2-RA-042` pase inadvertido.
  Se comprueba detección sin excepciones y se registra que retener difiere de la
  etiqueta original «rechazar». Esto cumple la corrección solicitada; no exijo
  endurecer esa salida.
- `Buenísima.Recomendada/obligatoria` se rechaza, tal como informa Claude.
  Es una ambigüedad real entre texto mal puntuado y forma de dominio/ruta. No
  la considero un bloqueo de esta corrección ni recomiendo una excepción basada
  sólo en mayúsculas, tildes o palabras particulares. Conservarla documentada
  como falso positivo conocido, sin afirmar todavía una frecuencia en uso real.
- Paráfrasis sin alias reconocible siguen siendo un límite documentado. Esta
  auditoría no pide reconocer toda instrucción humana posible ni cambiar los
  criterios de aceptación después de ver un resultado.
- `git diff 1f475e3..251f3d0 -- scripts/comunidad` está vacío: los reservados y
  sus sellos se conservaron.

## Verificación propia

- Reglas: **71/71**, sin omitidas.
- Suite completa: **2320 pruebas, 2302 aprobadas, 0 fallidas y 18 omitidas**.
  Las omitidas requieren artefactos de build no generados en esta auditoría.
- Tipado: `tsc --noEmit --incremental false`, exitoso sin errores.
- `git diff --check 40288f6..251f3d0`: sin errores de formato.
- Pruebas sintéticas propias de ambos hallazgos y control del patrón anterior.
- Leídos diff, pruebas de transformación, informe de Claude, estado y criterios
  de medición de `docs/MANTENIMIENTO.md` §8.b y §8.b.2.

No preparé ni ejecuté un reservado nuevo ni los scripts oficiales de evaluación.
La suite sí ejecuta las regresiones conocidas de los conjuntos divulgados.
No presento estas verificaciones como una medición nueva de eficacia.

## Siguiente entrega recomendada

Una corrección acotada de A1/A2 con pruebas de transformaciones y controles
legítimos, versionado y documentación. Después revisar esos cambios y decidir la
medición independiente con código y alcance congelados antes de escribir los
casos. Sin reservado 3 por rutina ni cambios de umbrales.

Codex no modificó código ni los archivos ajenos del checkout principal. Este
informe es el único archivo añadido por la auditoría. Sin E2, Supabase, SQL,
Producción, red de servicios, gastos, push, merge, deploy ni AAB. Salas conserva
su aprobación y sigue incluida en el futuro AAB conjunto con reseñas.
