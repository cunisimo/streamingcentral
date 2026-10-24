# Auditoría focalizada de E2a — 24/10/2026

Codex. Rama revisada: `feat/resenas-reglas`, checkout
`D:/DESARROLLO/stream central/wt-resenas-comunidad`, HEAD `74e46af`;
implementación `1d045f3`. Sin cambios de código por Codex.

## Dictamen

**Sin defectos bloqueantes encontrados en las migraciones de E2a local.**
El esquema privado y el cierre conservador de la tabla heredada cumplen el
alcance de esta entrega. Se puede continuar con E2b local cuando lo autorice
el dueño, incluyendo los dos ajustes del arnés enumerados abajo. No hace
falta repetir una ronda general de E2a por esos ajustes.

Esto no habilita Producción, publicación, E0, push, merge, deploy ni AAB.
No aprueba la validación independiente de E1 ni reabre su riesgo residual
aceptado. Concurrencia y permisos por operación se verifican cuando existan
las funciones correspondientes, según el plan.

## Evidencia nueva de Codex

- Lectura de 011/022 y sus reversores, configuración local, auxiliares,
  fixtures, baterías SQL/REST/MFA, ejecutor de reversión, plan y salidas.
  Leídos los criterios de medición de MANTENIMIENTO §8.b y §8.b.2.
- Motor efectivo comprobado antes de las pruebas: contexto `desktop-linux`,
  endpoint local `npipe:////./pipe/dockerDesktopLinuxEngine`, contenedor
  exacto `supabase_db_streamingcentral`. API `127.0.0.1:54321`.
  Sólo se usaron las variables de `.env.comunidad-local`, sin imprimir claves.
- Batería de invariantes: **80/81 en la corrida completa**; el único fallo
  fue `VirtualAlloc ... errno=1455` al iniciar Docker para el caso de nombre
  de dos caracteres. Ese caso se repitió aisladamente con las mismas fixtures,
  constraints inmediatos y rollback: **pasó**. No hubo un rechazo SQL inesperado.
- Batería de permisos: **22/25 en la corrida completa**. Los tres fallos
  estuvieron acompañados por falta de memoria del proceso y errores derivados
  del auxiliar. Pasaron los controles SQL de esquema, grants y RLS por separado,
  los 616 pedidos REST, MFA real con dos TOTP y RPC por REST.
- Repetición focalizada de los controles interrumpidos: cero RPC
  `public.comunidad_*`, cero funciones privadas ejecutables por PUBLIC/roles
  API y ausencia de `pg_graphql`, todo comprobado. GraphQL sin datos y con
  error de extensión ausente, comprobado de nuevo con anon y service_role.
  No se repitió en esa comprobación el token del usuario común.
- Pruebas de auxiliares locales y lista de migraciones: **11/11**.
- `git diff 3ff1643..74e46af --check`: sin errores.
- Prueba de lectura local de `user_reviews`: HTTP 401, `count=null`, que la
  expresión del script heredado transforma en cero. No se ejecutó ese script
  integral ni el endpoint de eliminación de la app.

No se declara una corrida completa propia de 81/81 ni 25/25: se distinguen
las interrupciones del entorno y las comprobaciones focalizadas posteriores.
Los fallos de ejecución no se atribuyen a las migraciones.

## Dos ajustes para incorporar al comenzar E2b

### A1 — La prueba heredada de eliminación puede dar un falso resultado

`scripts/prueba-eliminar-cuenta.mjs:69` ignora el error al insertar la
reseña heredada. En líneas 73–74, el conteo ignora errores y convierte
`null` en cero. Tras 022, no prepara esa fixture y tampoco demuestra su
borrado. Es el efecto conocido que Claude informó, confirmado por lectura
y por el resultado de la API local; no se presenta como un fallo nuevo del
producto.

Corregir el arnés antes de usarlo como evidencia de E2b: comprobar errores
de preparación y lectura; exigir las cantidades iniciales previstas; preparar
los datos heredados mediante un mecanismo exclusivo de prueba local con el
dueño de la base. No reabrir policies ni grants para hacer pasar la prueba.
No convertir una falta de permisos en un cero válido.

### A2 — El guardián local no comprueba el contexto efectivo de Docker

`scripts/comunidad/local.mjs:20–26` sólo inspecciona `DOCKER_HOST`.
Sin esa variable devuelve true aunque `DOCKER_CONTEXT` seleccione un destino
remoto; la elección persistida del CLI tampoco se verifica. La comprobación
interior `postgres|socket` sólo describe la conexión de psql dentro del
contenedor y no demuestra que el motor Docker esté en esta computadora.

Reproducción del guardián, sin conectar a ningún motor remoto:
`dockerLocal({ DOCKER_CONTEXT: 'auditoria-remoto' })` devuelve true.
**Las pruebas de esta auditoría sí usaron el endpoint local verificado arriba.**

Antes de volver a usar el ejecutor destructivo up/down/up, comprobar el
endpoint del contexto efectivo y rechazar destinos remotos, considerando la
precedencia de contexto/variables. Añadir pruebas con un contexto remoto
simulado, sin establecer conexiones remotas. Este ajuste del arnés puede
entregarse junto con E2b; no exige rediseñar las migraciones.

## Evidencia heredada y límites

Los 11 controles up/down/up y los hashes de volcados coincidentes se
contrastaron con el ejecutor y el log comprometido por Claude. **No se
repitieron esos ciclos destructivos**, pues el Supabase local es compartido.
Tampoco se repitieron la batería de salas, tipado, suite general ni builds;
sus cifras siguen siendo evidencia de Claude, no una ejecución nueva de Codex.

La nueva ejecución de permisos creó cuentas y fixtures ficticias locales,
como hace esa batería; no se restableció ni borró el entorno compartido.
Las fixtures transaccionales de invariantes se revirtieron y su control final
pasó. No se tocaron cuentas reales, servicios remotos ni otros checkouts.

N=20, retención y cuestiones de Producción mantienen su estado pendiente.
La siguiente entrega funcional es E2b, sin publicación y con pruebas de baja
de cuenta; no hace falta seguir iterando sobre frases de moderación.
