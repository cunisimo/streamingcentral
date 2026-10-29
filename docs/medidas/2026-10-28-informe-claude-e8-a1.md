# E8, corrección A1 — 28/10/2026

Claude, en `feat/resenas-reglas` desde `95c09b2`. Sólo Supabase local y
datos ficticios propios. Sin E9, Producción, cron instalado, gastos, push,
merge, deploy ni AAB.

**Commits:**

- `f4ad151`: copia sin cambios de la auditoría
  (`docs/medidas/2026-10-27-auditoria-e8-95c09b2.md`). Su SHA-256 es
  `593e69dc…`, igual al original.
- `d37563a`: la corrección.
- El siguiente: este informe, las salidas y ESTADO.

## El problema (A1)

La ventana del Top Yumpers (`mes_conservado`) depende del plazo de rankings
**actual**. Si después de purgar se amplía el plazo, o se deja sin plazo, el
mes vuelve a pasar la comprobación. Entonces `consolidar_mes` lo reconstruye
desde un historial que ya no existe.

**Reproducido antes de corregir**, con la batería y la 021 de `a730934`:

1. Enero de 2026 tenía 2 puntos y se purgó con un plazo de 8 meses.
2. Al volver a 12 meses, la lectura real (JWT) respondió **200 con
   `autores: 0` e `items: []`**.

Resultado: 27/28 (sólo falló la prueba nueva). Salida en
`docs/medidas/2026-10-28-e8-a1-salidas.txt`, §1.

## La corrección (la más chica que encontré)

**Una marca permanente por mes:** la tabla `comunidad.meses_sin_historial`.

- **Cuándo se marca un mes.** La purga lo marca en la misma transacción en
  que le borra:
  - el ranking consolidado (`rankings`);
  - un tramo con ese mes de primera positiva (`tramos`);
  - una suspensión cuyo intervalo cruza su corte (`suspensiones`): son los
    únicos datos que entran en el cómputo de ese mes (§2.2.2).
- **Independiente de los plazos.** La marca no tiene plazo ni lee la
  configuración: ampliar o anular `plazo_rankings` no la toca. Cubre también
  los meses que nunca se consolidaron, porque se escribe al borrar el
  historial, no al borrar el ranking.
- **`consolidar_mes` rechaza un mes marcado.** Devuelve `mes_invalido`
  (22023, que la ruta ya traduce a 400) y no escribe nada. Lo comprueba antes
  y después del exclusivo. La comprobación rápida "¿ya está consolidado?" va
  primero, así que **un ranking que se conserva se sigue leyendo** aunque su
  historial ya se haya purgado.
- **K_CORTE compartido en tramos y suspensiones**, como ya tenía rankings. La
  consolidación (exclusivo) nunca lee un historial a medio borrar: o ve todo
  el historial sin marca, o ve la marca.
- **Sin cambios** en los plazos, la fórmula del ranking ni la lectura de E7.
  El down borra la tabla nueva, con la misma advertencia: bajar después de
  purgar no recupera nada.

## Verificación

**Prueba A1, nueva en `pruebas-purga.mjs`.** Usa votos y borrados reales,
lectura por JWT y `consolidar_mes` real. Antes de corregir falló; después
pasa.

- **Preparación:**
  - enero de 2026, consolidado (2 puntos);
  - diciembre de 2025, nunca consolidado;
  - marzo de 2026, consolidado (2 puntos);
  - mayo de 2026, con historial completo y sin consolidar.
- **Purga con plazo de 8 meses:**
  - borra el ranking de enero;
  - borra el historial de enero, diciembre y marzo (marzo ya había cumplido
    el margen después de consolidado);
  - mayo conserva su historial.
- **Con el plazo de 12 meses y después sin plazo:**
  - enero: 400 por la lectura y `mes_invalido` por `consolidar_mes`;
  - diciembre (nunca consolidado): `mes_invalido`;
  - no aparece ningún mes nuevo en `top_meses`;
  - marzo (conservado, sin historial): 200, con las mismas posiciones y
    puntos;
  - los resultados de los demás meses no cambian.
- **Mayo** (historial completo) consolida normalmente: 200, con 1 punto.

**Resto de la verificación:**

| Prueba | Resultado |
|---|---|
| `pruebas-purga` | 28/28 |
| up/down/up de 021 | 6/6 |
| `pruebas-permisos` (con la tabla nueva) | 29/29 |
| `pruebas-top` (ruta real) | 10/10 |
| `pruebas-top-concurrencia` | 6/6 |
| Unitarias de purga, Top Yumpers y Top manual | 36/36, con un barrido nuevo de A1 |
| `npm test` | 2519 pasan, 0 fallan, 16 omitidas |
| `tsc` | 0 |

**Ajuste de la batería.** Las pruebas de `lock_timeout`, interrupción y
apagado volvían a consolidar julio de 2025 después de purgarlo. Con la
corrección eso se rechaza, como corresponde, así que cada una usa ahora su
propio mes: 2025-03, 2025-02 y 2025-01.

## Límites

- **Es conservadora por mes.** Si la purga borra aunque sea un tramo de un
  mes, por ejemplo el de un par sin memoria, ese mes queda sin reconstrucción
  posible aunque el resto de su historial siga. Es lo pedido ("si se perdió
  el historial necesario, no se reconstruye"). Hoy la purga sólo toca meses
  ya consolidados con margen o fuera de la conservación, así que no bloquea
  un mes que todavía esté por consolidarse.
- **Sólo protege lo que borra la purga.** Un borrado manual por SQL no marca
  nada.
- **El volcado de esquema cambia de un día a otro.** "Sin 021" ya no es el
  `3e41cc8f…` del 27/10 porque Realtime rota sus particiones diarias
  (`realtime.messages_AAAA_MM_DD`). Dentro de la corrida, el volcado antes de
  subir y después de bajar es idéntico.
- **Sin cambios respecto del informe de E8** en lo demás: pg_cron no
  ejecutado, backups, escala y Producción.

## Limpieza

- Borré sólo lo de esta corrida: cuentas, datos, meses de prueba, marcas y
  ejecuciones.
- La base quedó como al empezar, con 021 aplicada:
  - 6 participantes, 2 versiones, 42 cuentas y 2 suspensiones;
  - 0 tramos, meses, marcas, ejecuciones, órdenes y decisiones;
  - límites 5/10/100/10/3/50;
  - módulo, publicación, Top Yumpers y muestreo apagados;
  - **purga apagada** y plazo de rankings en 12 meses;
  - `SELECT` de `profiles` revocado;
  - `cron.job` con sólo `sala-barrido`;
  - sin `solo_local` ni locks.
- Docker Desktop estaba detenido: lo inicié sin tocar volúmenes. Detuve el
  servidor local de la app.
