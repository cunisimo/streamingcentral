# Auditoría del catálogo candidato v3 — 77d8bda

23/10/2026. Codex. Rama `feat/resenas-reglas`, worktree
`D:\DESARROLLO\stream central\wt-resenas-comunidad`.
Commit revisado: `77d8bdaab99a6146d8f91a6dc9a50bca535ff783`.

## Dictamen

La detección propia de H, los mínimos puros, el guion bajo y la separación de
datos futuros están corregidos. Se mantiene una estructura de validación coherente.
No recomiendo aprobar todavía el catálogo como cerrado: su tabla de cobertura
contradice dos definiciones de las listas que acaba de fijar. Corregir esos puntos
y la atribución de licencia de IANA sin reabrir la arquitectura ni ejecutar otro
reservado. E1 sigue sin aprobarse.

## A1 — P1: el catálogo sigue excluyendo de hecho un enlace conocido que dice cubrir

§9 ubica `R3-A-064` —dominio con espacios y terminación larga— dentro de F3 por
P, B y T. Sin embargo, §2-T limita T-IANA a terminaciones pegadas, sin espacios.
Sólo T-fuerte admite espacios alrededor del punto.

La escritura ya divulgada `lacinematecadelsur . photography / analisis / ultima`
no cumple T-fuerte: comprobé que `photography` no está en las 62 entradas de la
lista vigente referenciada por §6.T1, ni en §6.T2. Sí figura en la
[lista oficial IANA](https://data.iana.org/TLD/tlds-alpha-by-domain.txt).
Por lo tanto, queda sujeta a la prohibición de espacios de T-IANA. La alternativa
de terminación alfabética con ruta también exige que esté pegada.

No basta que P y B admitan espacios si T los vuelve a prohibir. Conciliar la
composición para que una terminación de IANA con ruta acepte las formas de P/B
prometidas, sin añadir únicamente `photography` a una lista ni sacar el caso del
denominador. Si se quisiera reducir esa cobertura, debe declararse como cambio
de alcance, no afirmar simultáneamente que el fallo está cubierto.

## A2 — P2: la derivación al perfil con «fíjense» figura cubierta, pero falta su intención

§9 atribuye «fíjense en mi nombre comunitario» a S3. S3 requiere I, pero la lista
cerrada §6.I no incluye «fíjense» ni una familia que la admita. El caso divulgado
`R3-A-107` no aporta otra forma de I que salve esa falta:

> Excelente documental. Para los que me pidieron más info: fíjense en mi nombre comunitario, es mi usuario en todas las redes. Los espero por ahí.

La revisión fue por lectura, sin evaluar nuevamente el caso. No corresponde
dejar una promesa de cobertura que depende de una forma ausente del contrato.
Conciliar de forma acotada las formas de remisión al perfil que promete S3 y
sus controles narrativos, antes de fijar el catálogo candidato. No declarar el
caso cubierto solamente por la presencia de «perfil» o «usuario»: la condición
exige señales combinadas.

## A3 — P2: la cita de licencia no acredita CC0 para la lista de TLD

§1 registra la lista de dominios como CC0 citando
[Licensing Terms de IANA](https://www.iana.org/help/licensing-terms).
La declaración del 10/11/2021 allí publicada delimita expresamente su objeto a
registros de protocolos enlazados desde las páginas de protocolos/asignaciones.
No establece en esa página una licencia general para todo dato publicado por IANA.

Esa fuente, por sí sola, no acredita la condición afirmada para el archivo TLD.
Verificar el fundamento aplicable al archivo concreto o marcar la condición como
pendiente antes de incorporarlo. No concluyo que esté prohibido usarlo ni emito
un dictamen legal; señalo una atribución documental cuyo soporte no demuestra lo
afirmado. No se ha incorporado el archivo, así que se puede resolver antes de
su uso en la implementación.

## Fuentes y límites de la verificación

Consulté las fuentes oficiales en lectura:

- [DerivedGeneralCategory 18.0.0](https://www.unicode.org/Public/18.0.0/ucd/extracted/DerivedGeneralCategory.txt):
  cabecera de versión y fecha 29/06/2026 coincidentes.
- [Confusables 18.0.0](https://www.unicode.org/Public/18.0.0/security/confusables.txt):
  cabecera de versión y fecha 06/08/2026 coincidentes.
- [UTS #39](https://www.unicode.org/reports/tr39/): versión 18.0.0 publicada.
- [Lista IANA](https://data.iana.org/TLD/tlds-alpha-by-domain.txt): cabecera
  `2026102300`, fecha 23/10/2026 y 1437 entradas coincidentes con lo informado.
- [Unicode License v3](https://www.unicode.org/license.txt): la licencia citada
  existe y contempla conservar el aviso en las copias o documentación asociada.

Intenté obtener los bytes crudos por terminal para recalcular SHA-256; esos
accesos fallaron. El lector web permitió contrastar contenido y cabeceras, pero
no aporta una copia binaria cuya huella pueda recalcular aquí. Por eso **no
declaro verificadas independientemente las huellas ni todos los conteos de
categorías/confusables**. Tampoco los declaro incorrectos. Verificarlos contra los
archivos exactos sigue siendo condición de su futura incorporación; la lista
IANA es mutable y la cabecera actual no reemplaza una copia conservada.

La referencia UTS #39 no es un simple sustituidor de letras no latinas: su tabla
también contiene transformaciones ASCII, por ejemplo `m` a `rn`. Al implementar,
el plegado de los textos y de los patrones/listas debe ser compatible para no
romper coincidencias normales. Es una precaución de implementación respaldada por
el archivo oficial, no otra propuesta de arquitectura ni una prueba ejecutada.

## Lo que queda bien resuelto y lo que corresponde decidir

- CS mide disparos de su propia familia; los casos puros sostienen los mínimos
  y los mixtos no los sustituyen. La salida final sigue siendo una sola.
- `_` está presente en S y en el generador previsto.
- E8 ya distingue cobertura no certificada de imposibilidad universal. G1 se
  conserva; no propongo generar ese material.
- E9 se muestra como decisión aparte. Es una reducción de cobertura declarada
  que sigue pendiente del dueño, no una aprobación técnica automática.
- El límite de nombre propio por mayúsculas puede documentarse como límite
  explícito de H3. No implica capacidad para reconocer datos personales generales
  ni debe ocultarse al presentar el alcance residual.
- La lista T-palabra es una elección técnica para controlar falsas alarmas, no
  una derivación de IANA. Sus resultados deben medirse con C3/C4; revisarla por
  lectura no demuestra todavía su costo. Mantener `su` no queda exento de esos
  controles por conservar cobertura anterior.
- Adaptar el evaluador y fijar la asociación entre reglas y familias antes de
  cualquier conjunto futuro es correcto, con prueba sobre datos ajenos. No está
  autorizado todavía y no reemplaza el cierre del contrato.

## Evidencia local y siguiente paso

El diff de `77d8bda` es sólo documental; código, bancos y resultados permanecen
sin cambios. `git diff --check cac5c50..77d8bda` no señala errores.
Comprobé por lectura de las listas vigentes sus 50 palabras de no-alias y sus
62 terminaciones fuertes, y la ausencia de `photography` en estas últimas.
No ejecuté reglas, tests de aplicación, generadores, nuevos casos ni reservados.

Recomiendo corregir A1/A2 y la evidencia de A3 dentro de una conciliación puntual
del candidato, conservando el contrato por versión. Después se podrá presentar
el paquete P-1 a P-4 con las exclusiones y límites verdaderamente reflejados en
las definiciones. Este informe no acepta decisiones por el dueño ni autoriza
implementación, evaluación o E2.

Codex añadió sólo esta auditoría. Sin modificaciones de código, consultas de
Producción, SQL, Supabase, servicios de moderación, gastos, push, merge, deploy
ni AAB. Salas mantiene su aprobación y sigue en el futuro AAB conjunto con
reseñas, sin versión fijada.
