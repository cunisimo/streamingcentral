# Informe breve — E3b local (25/10/2026)

Autor: Claude. Rama `feat/resenas-reglas`. Autorización del dueño ("Bien
prosigamos") registrada en la auditoría de pulgares
`docs/medidas/2026-10-25-auditoria-pulgares-0af5f49.md` (copiada sin cambios
en `7698e7a`; SHA-256 `db132d89…`). Código en `2e2d00e`.

Todo local: `supabase start`, servidor en `:3100` con `.env.comunidad-local`
y cuentas ficticias `@comunidad.test`. No hubo Producción, E0, servicios
externos, gastos, push, merge, deploy ni AAB. No se reabrió el filtro (E1) ni
se preparó otro reservado. Interruptores apagados y límites restaurados.

## Qué se construyó

**Migración `015_comunidad_moderacion_datos.sql` (+ down).**

- **Límites nuevos en `comunidad.config`:**
  - admisión por autor: 2;
  - admisión global: 50;
  - filas de denuncia por versión: 50;
  - denuncias por hora: 100.

  Son **hipótesis** de P6, ajustables sin migración. Ningún valor está
  aprobado.
- **Protocolo:** dos niveles nuevos antes de la marca, que pasa de 8 a 10.
  - **8, huella:** un lock consultivo por hash de texto. El conteo de cuentas
    con el mismo texto no tiene carrera.
  - **9, cola:** un lock consultivo de la cola de retenidos o de denuncias.
    Los topes globales se cumplen bajo concurrencia.
  - El guardián de orden sigue rechazando cualquier lock fuera de orden con
    CB002.
- **Duplicados (§3.3.1):** una tabla `huellas` con dos datos por versión
  guardada:
  - el HMAC del texto plegado;
  - los HMAC de los shingles de 3 palabras, recortados a 64 bits.

  Un CHECK exige hex: la base nunca guarda fragmentos en claro. El secreto
  es una variable de servidor dedicada (`COMUNIDAD_HMAC_DUPLICADOS`). El
  valor local es de prueba, empieza con `local-prueba-` y vive sólo en
  `.env.comunidad-local` (ignorado). En un build de producción ese prefijo
  se rechaza. Sin secreto, escribir responde "error".

  Se retiene en tres casos:
  - hash igual a otra reseña propia;
  - Jaccard ≥ 0,8 con una de las últimas 50 versiones propias;
  - el mismo hash en **3 o más cuentas distintas** en 7 días.

  Borrar la reseña borra sus huellas.
- **Publicar y editar (redefinidas):**
  - duplicados;
  - **admisión a la cola**: lo que pasa las reglas se publica aunque la cola
    esté llena. Lo que sería retenido y no entra **no se guarda** ni consume
    límite. El autor ve "Tenés publicaciones en revisión…" o "No podemos
    revisar más publicaciones ahora, probá más tarde";
  - **"Pedir revisión"**: guarda la versión retenida con estado
    `revision_solicitada` y la regla. Pasa por la admisión y cuenta para el
    límite. Nunca se publica sin decisión humana (E4), ni por vencimiento.
- **Denunciar (fila C):** una denuncia por denunciante y versión.
  - Sobre 50 filas por versión, sólo suma un excedente por hora.
  - Hay un tope global por hora.
  - **No oculta nada.**
  - La cantidad sólo ordena `comunidad.cola_denuncias()`, que es interna
    (para E4): primero las graves, después por peso, y las denuncias
    descartadas de una cuenta bajan el peso de las suyas.
- **Corroboración:** la ruta vuelve a correr las reglas vigentes sobre el
  texto denunciado. Si ahora lo retienen o rechazan, la versión pasa a
  retenida **por la regla**, registrada en `corroboraciones`.
- **Bloquear y desbloquear (fila D):** bloquear desde una versión;
  desbloquear con el id del bloqueo. Hay una lista de bloqueos propios. La
  lectura provisional del título oculta al bloqueado sólo para quien bloquea;
  no se adelantó el resto de E5.

**Servidor:**
- rutas `/api/comunidad/denuncias`, `bloqueos` y `revision`, todas con
  Bearer y CORS;
- núcleos puros `duplicados`, `menu-nucleo` y `moderacion-nucleo`;
- las mutaciones reusan la reconciliación de A1. Si la confirmación se
  perdió, repiten una vez y, si tampoco se confirma, la pantalla dice que no
  se sabe y ofrece reintentar sin duplicar.

**Interfaz:**
- **Menú "⋯" en cada reseña ajena**, de 44×44, operable con flechas y
  Escape. Los diálogos van en un portal.
  - Denunciar pide las 7 categorías del diseño, un comentario opcional de
    hasta 300 caracteres y ofrece "Bloquear también al autor".
  - Bloquear pide confirmación.
  - Después de bloquear aparece un aviso con "Gestionar bloqueados" y, si no
    se denunció, "Denunciar la reseña".
- **"Pedir revisión" en el editor:** sólo tras un rechazo por regla de
  contenido y mientras el texto sea el rechazado. En una edición confirma
  antes que la publicada deja de verse y que se reinician sus votos.
- **`/cuenta/bloqueados`:** lista y desbloqueo con confirmación. La fila
  "Usuarios bloqueados" en Configuración aparece sólo con el módulo activo
  o si ya hay bloqueos.
- Se conservan los pulgares, el conteo y el rótulo "Reseña de la comunidad",
  que E6 reemplaza por el nombre comunitario.

## Verificación

Hay dos tipos de pruebas:
- **Reales:** las funciones de 014/015, los núcleos con sus adaptadores
  reales, Auth local, PostgREST, sesiones psql y el navegador.
- **Preliminares:** núcleos con dependencias falsas e inspección de código.

Salidas completas en `docs/medidas/2026-10-25-e3b-salidas.txt`.

| Corrida | Tipo | Resultado |
|---|---|---|
| `pruebas-moderacion.mjs` (E3b, nueva) | real | 46/46, restos `0\|0\|0\|false`, límites restaurados |
| las 5 de concurrencia de topes, 3 veces | real | 5/5 ×3 |
| `up-down-up-015.mjs` (nueva) | real | 5/5 |
| `pruebas-permisos.mjs` | real | 27/27 |
| `pruebas-escritura.mjs` (E3a) | real | 43/43 |
| `pruebas-concurrencia.mjs` (E2c) | real | 21/21 |
| `pruebas-baja.mjs` (E2b) | real | 26/26 |
| `pruebas-invariantes.mjs` | real | 81/81 |
| `lib/comunidad/*.test.ts` + `db-local.test.mjs` | preliminar | 67/67 (22 nuevas de E3b) |
| `npm test` | preliminar | 2424 pasan, 0 fallan, 16 omitidas |
| `tsc --noEmit` | — | 0 errores |

Por qué se repitieron las baterías existentes:
- concurrencia: cambió el orden del protocolo;
- escritura: cambiaron publicar y editar;
- permisos: hay funciones y tablas nuevas;
- invariantes: cambiaron los fixtures;
- baja: las tablas nuevas caen en cascada con las reseñas;
- `npm test`: hay tres rutas nuevas en el inventario de CORS.

**Qué fija la batería E3b** (resultados escritos antes de correr):
- **Duplicados:**
  - propio, casi duplicado (también entre reseñas propias), entre cuentas;
  - 7 cuentas a la vez con el mismo texto: exactamente 3 publicadas y 4
    retenidas;
  - inspección de la tabla: sólo hex, ninguna palabra del texto; un shingle
    en claro lo rechaza el CHECK;
  - borrado de huellas;
  - sin secreto, "error".
- **Admisión:**
  - por autor, incluida la concurrencia: 5 envíos simultáneos dan exactamente
    2 retenidos;
  - global bajo ataque: 10 cuentas a la vez con tope +3 dan exactamente 3
    adentro y 7 `admision_global`, y lo limpio se sigue publicando;
  - no hay job que publique lo retenido.
- **Revisión:**
  - publicar y editar;
  - "requiere confirmación";
  - texto que ya no se rechaza, que pasa como envío normal;
  - admisión;
  - respuesta perdida, reconciliada con una sola versión;
  - el mismo id con y sin revisión da conflicto.
- **Denuncias:**
  - sigue visible;
  - repetida;
  - propia e invisible;
  - categoría inválida;
  - **8 cuentas graves sobre una reseña legítima:** sigue publicada y sube en
    la cola;
  - cota por versión con 7 simultáneas: 3 filas y 4 de excedente;
  - tope por hora con 9 simultáneas: exactamente 4, y el bloqueo pedido se
    hace igual;
  - límite diario;
  - corroboración;
  - **"No me sirvió" ×12** sin efecto;
  - respuesta perdida.
- **Bloqueos:** oculta todas sus reseñas sólo a quien bloquea; idempotente;
  no a sí mismo; límite; denunciar después de bloquear; desbloqueo ajeno
  `sin_efecto`; respuesta perdida.
- **Matriz C/D (§2.1.2):** suspensión, correo pendiente, términos sin
  aceptar, pausa, módulo apagado, cola de retenidos llena, cola de denuncias
  llena y baja en curso.
- **Protocolo:** CB002 fuera de orden.
- **Compuertas con sesiones psql:** el segundo pedido se **observa en
  `pg_locks` esperando** el lock 7304 o 7303, relee y recibe el tope o queda
  retenido. Esto es evidencia determinística, no sólo pedidos simultáneos.
- **Acceso directo:** un JWT y anon no leen ni escriben las tablas nuevas, ni
  ejecutan las funciones nuevas.
- **Rutas HTTP:** la respuesta de la denuncia no trae el texto.

**Navegador** (en `/revision-local/comunidad`, con escritorio a 1280 y móvil
a 375 px): 19 capturas en `docs/medidas/2026-10-25-e3b-recorrido/`.
- Denunciar con bloqueo en un paso: la reseña desaparece.
- Bloquear con teclado.
- **Respuesta perdida después de llegar al servidor**: "No sabemos si se
  guardó el bloqueo", con Reintentar. En la base quedó un solo bloqueo.
- Denunciar después de bloquear.
- Cola de denuncias llena: el mensaje honesto.
- Configuración → bloqueados → desbloquear: la reseña vuelve a verse.
- "Pedir revisión" al publicar y al editar, con su confirmación: queda "En
  revisión".
- A 375 px: sin desplazamiento horizontal, botón y opciones de 44 px, y
  Escape devuelve el foco al botón.

Hallazgos del recorrido, ya corregidos:
- la oferta de revisión aparecía antes del motivo del rechazo;
- dos bloqueos del mismo título y día se veían iguales: ahora llevan la
  hora. Si coinciden también en el minuto, siguen iguales hasta E6.

## Cálculo de cotas (con las hipótesis vigentes)

| Tabla | Cota |
|---|---|
| `huellas` | 1 por versión guardada. Por cuenta y día: ≤ 5 nuevas + 10 ediciones = 15. Cada fila tiene 64 hex y ≤ 600 shingles de 16 hex (≈ 10 KB en el peor caso; ≈ 2 KB típico) |
| `denuncias` | ≤ 10 por cuenta y día, ≤ 100 por hora en total (≤ 2.400 por día), ≤ 50 filas por versión |
| `denuncias_excedentes` | ≤ 1 fila por versión y hora; los incrementos están dentro del tope por hora |
| `corroboraciones` | ≤ 1 por versión; sólo tras una denuncia nueva (≤ 2.400 por día) |
| `bloqueos` | ≤ 50 por cuenta y día y ≤ (participantes − 1) por cuenta |
| `contadores` | +2 filas por cuenta y día (`denuncia`, `bloqueo`) |
| Cola de retenidos sin resolver | ≤ 50 por admisión, más las retenciones por corroboración (no son envíos del autor; acotadas por el ingreso de denuncias) |

Ninguna fila se purga por tiempo en esta entrega: los plazos son de E8 y no
se decidieron.

## Decisiones a auditar (interpretaciones de esta entrega)

1. **Duplicado "de la misma cuenta"** se lee como de *otra* reseña. Una
   edición de la misma reseña no es duplicado de su versión anterior.
2. **"3 o más cuentas distintas"** se lee literal: con el mismo texto en 3
   cuentas, la 4.ª queda retenida.
3. **Denunciar y bloquear crean la identidad comunitaria** sin exigir
   términos, porque las filas C y D no los exigen. En E3a sólo la creaba
   aceptar los términos.
4. **La corroboración** cierra los tramos de puntos de la versión retenida.
   No pasa por la admisión. Corre sin el contexto de textos recientes del
   autor (la regla de contacto partido no mira ahí). Si la respuesta de la
   denuncia se perdió y se reconcilió, no corrobora (la denuncia ya está en
   la cola).
5. **Excedente de denuncias:** sin fila por denunciante, así que puede contar
   dos veces a una cuenta (acotado por su límite diario). Sólo ordena. La
   ventana por hora cuenta de más, nunca de menos.
6. **Listar bloqueados** es un POST con `accion: "listar"`, porque el CORS de
   la app declara un método por ruta.

## Fuera de alcance y pendientes explícitos

- **Sin resolver, a propósito:** las denuncias recibidas que caen en cascada
  al borrar una cuenta. Las tablas nuevas que cuelgan de una versión caen
  igual. Sigue pendiente antes de E4, E8 y la publicación.
- **Sin decidir:** los plazos de retención (E8, P3).
- **E4:** el dashboard, las decisiones del admin y reabrir los tramos al
  publicar un retenido.
- **E5:** el resto de la visibilidad.
- **E6:** los nombres comunitarios.
- **No verificado:**
  - un teléfono real y Android;
  - el tema claro;
  - la ficha con TMDB;
  - lectores de pantalla reales (se verificaron atributos y foco);
  - una caída real de red a mitad del commit.
- **Batería de 011 no repetida:** el up/down/up completo de 011
  (`up-down-up.mjs`) no se corrió porque borra el esquema `comunidad` entero
  de la base compartida. Se corrió `up-down-up-015.mjs`, que sólo mueve 015 y
  comprueba que los datos ajenos no cambian.
- **Limpieza de permisos:** `pruebas-permisos.mjs` no borraba sus cuentas
  (cuatro por corrida, con una reseña en el título 603). Se borraron sólo las
  de mis tres corridas del 25/10 (12 cuentas) y ahora la batería limpia lo
  suyo. Las del 24/10 siguen intactas. La base quedó con 6 participantes, 2
  versiones y 42 cuentas `@comunidad.test`, como al empezar.
