# E9a local — integración y pruebas de la web (28/10/2026)

Claude, en `feat/resenas-reglas` desde `c9ba130`. Sólo Supabase local, la app
local y datos ficticios propios. **Es la parte local de E9a: no la cierra.**
El plan exige E0 para cerrarla, y sus consultas a Producción no están
autorizadas. Sin E9b/E9c, Producción, migraciones remotas, cron, gastos,
push, merge, deploy, AAB ni cambios de versión.

**Commits:**
- `89aac4b`: E8 cerrada en local; copia sin cambios de la auditoría de cierre
  (`2026-10-28-auditoria-e8-a1-c9ba130.md`, SHA-256 `78224a71…`, igual al
  original).
- `e7f0661`: plural del panel y freno del arnés `up-down-up.mjs`.
- `84d3ed3`: recorrido local preparado (script, `.gitignore`, `launch.json`).
- El siguiente: este informe, las salidas, la guía del dueño, las capturas,
  ESTADO y el plan.

## 🔴 Incidente: borré datos ajenos de la base local compartida

Dentro de las baterías incluí `scripts/comunidad/up-down-up.mjs` sin
revisarlo antes. Es el arnés de E2a–E3a:
- baja la 011, que borra el esquema `comunidad` **con sus filas**;
- sólo vuelve a subir hasta la 014.

Sobre una base con 015–021:
- **borró los 6 participantes, 2 versiones y 2 suspensiones** que todas las
  entregas conservaban (restos de baterías del 24/10, ajenos a esta);
- dejó el esquema a medias.

Las 42 cuentas `@comunidad.test` siguieron intactas. Lo que hice después:
- **Esquema:** volví a aplicar 011–022 en el orden de `db-local.mjs` (están
  probadas como repetibles). La configuración quedó con los mismos valores:
  interruptores y purga apagados, límites, términos y plazos. El orden de
  columnas de `config` cambió (`terminos_version` quedó al final), así que el
  volcado no es byte a byte el de antes.
- **Verificación:** permisos 29/29, invariantes 85/85 y up/down/up de la 021
  6/6.
- **Las filas borradas no se recuperaron.** No hay copia en el repo ni en los
  informes, sólo conteos y huellas. No las recreé: serían otras filas con los
  mismos números.
- **Freno (`e7f0661`):** `up-down-up.mjs` se negaba a correr si encontraba
  `decisiones`, o sea con 016 aplicada. La auditoría (A2) mostró que con 015
  sin 016 pasaba igual. Lo reemplazó el freno de la corrección A1/A2, que
  protege también `up-down-up-020.mjs`; ver
  `2026-10-28-informe-claude-e9a-a1a2.md`. Ese arnés no se corrió.
- **Línea base nueva:** desde E9a es 0 participantes, 0 versiones y 0
  suspensiones (42 cuentas). Las baterías que comparan una huella ajena
  comparan antes y después de su propia corrida, así que no dependen de
  aquellas filas.

## Qué se probó en navegador (real, local)

Ficha real con TMDB, cuenta, perfiles, panel y Top Yumpers, en escritorio
(1280) y 375 px. Capturas en `docs/medidas/2026-10-28-e9a-recorrido/` (01–38).

1. **Sin sesión:** Yump primero, invitación y encabezado sin número.
2. **Registro en la UI:** cuenta nueva → bienvenida → términos → editor.
3. **Lista:**
   - "Más útiles" y "Cargar más": 7 de 7, y el botón desaparece;
   - "Recientes" ordenada por fecha;
   - "Me sirvió": 2 → 3, sin reordenar;
   - los pulgares de la ficha siguen funcionando, comprobado en `votes`.
4. **Escritura:**
   - un teléfono es rechazado con motivo, y se pide revisión;
   - editar con aviso de reinicio de votos → publicada;
   - en la cuenta B, una edición rechazada pide confirmar la ocultación antes
     de la revisión;
   - borrar la propia.
5. **Denuncia y bloqueo:**
   - denunciar con categoría y comentario;
   - bloquear: el autor desaparece y el encabezado baja de 9 a 8;
   - desbloquear desde `/cuenta/bloqueados`: vuelve.
6. **Perfiles y nombre:** del nombre al perfil `/u?id=`; nombre comunitario
   cambiado en `/cuenta/perfil`.
7. **Top Yumpers de septiembre:** 4/3/2/1/1, con empate denso; "(vos)" y la
   posición propia con la cuenta B. El selector vuelve al Top de plataformas.
8. **Panel** (admin con dos TOTP reales y código TOTP real):
   - rechazar la revisión;
   - retirar y descartar denuncias (descartar exige motivo);
   - registro de decisiones;
   - el autor ve "Rechazada por moderación".
9. **Cambio de cuenta y respuestas tardías:**
   - con la lista retrasada 12 s, cerré sesión desde otra pestaña: las dos
     respuestas tardías no pintaron nada (invitación, sin reseñas);
   - al entrar con B: su propia reseña, la de la cuenta anterior como ajena,
     sin votos, pulgar ni bloqueos de la anterior.
10. **Baja de cuenta:** desde la UI. Se borraron cuenta, nombre comunitario,
    reseña y pulgar, y no quedaron bajas en curso.

## Todo apagado

Comparé la rama con la base `52c7ae7` (anterior a reseñas), con la misma base
local y TMDB, en Edge headless:
- **Pares (12):** Home en 1280 y 375; ficha sin sesión en 1280; ficha con
  sesión (sección abierta) en 1280 y 375; `/top` sin sesión en 1280 y 375;
  `/top` con sesión en 1280; `/cuenta` en 1280 y 375; `/cuenta/configuracion`
  y el diálogo de eliminar cuenta en 1280.
- **Resultado:** 10 de 12 pares con innerText idéntico en la primera corrida.
  Los 2 restantes (el Home de la base en 1280 todavía cargando, y el banner
  "Instalá Yump" de la PWA en la ficha con sesión de la base en 375) dieron
  **idénticos en las dos vueltas de un control alternado**.
- **Corrección del conteo (28/10, auditoría A1/A2):** este informe decía
  «12 de 14 pares»; las salidas enumeran 12 pares, y los 12 pares de archivos
  base/rama guardados lo confirman. Era un error de conteo. No se repitió el
  recorrido.
- **Baja con todo apagado:** desde la UI de la rama, completa.

## `/api/title` en ejecución (pendiente desde E5a): cerrado

8 fichas comparadas byte a byte, base contra rama, con TMDB real y alternadas
(A, B, A, B): **8/8 idénticas** en las dos corridas. La segunda incluye la
reseña editorial ficticia legible en la 550.

**Credencial:** usé el `TMDB_READ_TOKEN` de
`../streamingcentral/.env.sala-local`, que el proyecto ya usa para correr
contra la base local con TMDB real (plan de salas). Lo cargué sólo como
variable de entorno, sin copiarlo, y la base siguió siendo la local. No se
leyó `.env.local`.

## Defecto corregido

En el panel, con una sola denuncia abierta, retirar o rechazar decía «1
denuncia abierta quedan resueltas». La corrección es un helper; el test cubre
1, 2 y ninguna (14/15 con el código anterior, 15/15 con el arreglo).
Verificado en el panel real.

## Controles (reales)

| Control | Resultado |
|---|---|
| invariantes | 85/85 |
| permisos | 29/29 |
| concurrencia (casos 1–4, B3) | 21/21 |
| escritura | 43/43 |
| moderación (caso 5) | 46/46 |
| admin | 38/38 |
| baja (B8 de E2b) | 26/26 |
| lectura | 11/11 |
| voto-lista | 11/11 |
| útiles | 14/14 |
| perfiles | 25/25 |
| nombre-intento | 5/5 |
| Top (casos 6–11) | 10/10 |
| Top concurrencia (B8 real) | 6/6 |
| purga | 28/28 |
| up/down/up 021 | 6/6 (después de restaurar) |
| salas `pruebas-rls` | 37 en verde |
| `npm test` | 2519 pasan, 0 fallan, 16 omitidas |
| tests de scripts | 41/41 |
| `tsc` | 0 |
| `npm run build` | sin avisos; árbol sin cambios |

**Simulado o de fixture:**
- el reloj de septiembre para el Top (`solo-local-reloj.sql`, instalado y
  quitado);
- la demora de 12 s (interceptor de `fetch`);
- las cuentas, los textos y la reseña editorial, todos ficticios.

## Entorno local (no son defectos de la rama: la base da lo mismo)

- **Permisos de API:** la base de `supabase start` no da permisos de API sobre
  las tablas de `public` (perfil, pulgares, listas, `providers`, la editorial).
  El recorrido los concede sólo mientras dura y los revoca al limpiar.
  Producción los tiene: sin verificar, E0.
- **Bienvenida:** `providers` está vacía, así que la bienvenida no lista
  plataformas.
- **Próximamente:** `/api/upcoming` da 500 porque falta la columna de la 008
  en local.
- **Top manual:** no tiene publicaciones locales.

## Observaciones para el dueño (no cambiadas)

- **Diálogo de eliminar cuenta:** no menciona las reseñas de la comunidad,
  aunque la baja las borra. Agregarlo con el módulo encendido es una decisión
  de texto. Con todo apagado, el diálogo es idéntico a la base.
- **Panel del navegador de esta sesión:** con la ventana cerrada, a veces no
  entrega clics o teclas ni repinta capturas. Ese tramo lo verifiqué sobre el
  DOM y las capturas faltantes salieron de Edge headless. No es un defecto de
  la app.

## Para la prueba del dueño

Guía corta: `docs/medidas/2026-10-28-e9a-prueba-duenio.md`. Incluye cómo
iniciar, los pasos y cómo detener y limpiar. **No la doy por realizada.** No
quedó ningún servidor corriendo ni datos preparados.

## Limpieza

- **Lo creado en esta corrida:** borradas las 13 cuentas `@recorrido.test` (11
  con `limpiar` y 2 por baja desde la UI) y todos sus datos, más la editorial
  ficticia.
- **Permisos temporales:** revocados.
- **Estado restaurado:** interruptores, purga y muestreo apagados; rankings en
  1 año; `cron` sólo con `sala-barrido`; `proto_marca` igual (`16b2f3b4…`).
- **Temporales borrados:** la copia de la base, los perfiles de Edge y las
  entradas temporales de la configuración de la sesión.
- **Base final:** igual a la de antes, salvo las 6/2/2 filas perdidas en el
  incidente.

## E9a sigue abierta

Falta, fuera de esta autorización:
- E0 (consultas a Producción);
- el secreto HMAC dedicado de Producción;
- aplicar 011–022 en Producción;
- el informe de cuotas con datos reales;
- deploy;
- la prueba del dueño.

El teléfono real y Android quedan para E9b.
