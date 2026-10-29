# Auditoría focalizada de E3a — 24/10/2026

Codex. Rama `feat/resenas-reglas`, checkout
`D:/DESARROLLO/stream central/wt-resenas-comunidad`, HEAD `faabf5a`.
Revisados `2794683`, `64daf53`, `c2bf84a`, `5ee5133` y `faabf5a`.
Sin modificaciones de código por Codex.

## Dictamen

**E3a implementada y ampliamente verificada en local, con dos correcciones
P2 pendientes antes de cerrar la entrega.** No se encontró otro defecto
bloqueante en permisos o integridad de las escrituras revisadas.

Las correcciones se limitan al tratamiento de confirmaciones perdidas y a
preservar un borrador ante cambios remotos. No requieren otra especificación,
reabrir moderación ni repetir las auditorías generales de E2a/E2b/E2c.
La próxima revisión debe centrarse en estas correcciones y sus regresiones.

## A1 [P2] — Una respuesta RPC perdida se presenta como fallo definitivo

Ubicaciones: `lib/comunidad/escritura-deps.ts:15–20`,
`lib/comunidad/escritura-nucleo.ts:114–122`,
`lib/comunidad/escritura.ts:55–56` y `lib/comunidad/mensajes.ts:55`.

El adaptador convierte cualquier error de RPC en excepción; el núcleo
traduce cualquier excepción salvo CB001 a `{resultado: "error"}`. El mensaje
visible es **"No se pudo guardar, probá de nuevo."**. Eso no permite distinguir
un error SQL que revirtió la transacción de una respuesta perdida después
de confirmar. El mismo tratamiento general aparece en `operar` para las
otras operaciones comunitarias.

### Reproducción nueva con Supabase local real

Se creó una cuenta ficticia, aceptó los términos y publicó a través de
`escribirResena` y `dependenciasEscritura`, los mismos adaptadores de la app.
Un `fetch` de prueba dejó completar la llamada real a
`/rest/v1/rpc/comunidad_publicar` y descartó únicamente su respuesta 200,
lanzando un error de transporte. No se cambiaron las rutas ni el SQL.

Resultado observado:

```text
respuestasDescartadas: 1
respuestaServidor: { resultado: "error" }
resenasGuardadas: 1
mensajeVisible: "No se pudo guardar, probá de nuevo."
```

Un reintento normal del mismo pedido devolvió `publicada`, `repetido: true`,
con una sola versión. **La idempotencia funciona; lo incorrecto es afirmar
fallo cuando la escritura pudo haberse confirmado.** La regresión existente
de respuesta perdida cubre recuperar un resultado confirmado, pero no esta
clasificación de errores entre servidor y Supabase.

### Corrección requerida

Distinguir fallo confirmado de la transacción y confirmación desconocida.
Si se pierde la respuesta después de enviar una escritura, reconciliar o
responder un estado incierto coherente con el aviso y el reintento. Conservar
el mismo `id_intento`; no generar uno nuevo ni reiniciar votos otra vez.
Revisar también la traducción compartida de las otras operaciones mutantes.
Los errores previos a enviar y los rechazos SQL confirmados pueden seguir
mostrando su resultado definitivo correspondiente.

Agregar la regresión real de respuesta RPC descartada después del commit,
incluyendo edición y su reinicio único de votos. Mantener la prueba del
error SQL confirmado con versión/votos/cupo intactos: son escenarios distintos.

## A2 [P2] — Una recarga remota descarta el borrador que está editándose

Ubicaciones: `components/comunidad/EditorResena.tsx:33–43`, `:53–56`,
`components/comunidad/ResenasComunidad.tsx:97–100` y `:125`.

**Comprobado por lectura del componente; no se reprodujo en navegador en
esta auditoría.** El comentario indica que una versión recibida se toma
cuando no se está editando, pero el efecto sólo comprueba `enviando`:

```tsx
useEffect(() => {
  if (enviando) return;
  setTexto(mia?.texto ?? "");
  setEditando(mia === null);
}, [versionVista]);
```

Secuencia concreta: el usuario abre la edición de V1 y escribe un borrador;
otra sesión de la misma cuenta guarda V2; el usuario evalúa una reseña ajena
en esta pantalla. Esa evaluación llama a `cargar`, que devuelve V2 como propia.
El editor permanece montado con su clave constante. El cambio de
`versionVista` ejecuta el efecto, sustituye el borrador por V2 y cierra la
edición sin confirmación. Un borrado remoto también puede vaciar el texto.

No basta con dejar el texto intacto: el envío construye su firma y
`version_esperada` desde la prop `mia` más reciente. Si se preservara sólo
el texto pero se adoptara V2 como base silenciosamente, se podría sobrescribir
la edición remota sin el conflicto esperado.

### Corrección requerida

Conservar el borrador y su versión base mientras se edita. Una actualización
remota debe permitir informar el conflicto y una recarga explícita, sin
descartar texto ni cambiar silenciosamente la versión esperada. La propia
escritura confirmada sí debe actualizar el editor. Mantener la limpieza al
cambiar de cuenta o título, sin trasladar borradores ni intentos entre ellos.

Agregar una prueba que comience la edición de V1, cambie la prop persistida
a V2 mediante una recarga mientras hay texto sin guardar, y verifique texto,
versión esperada y decisión explícita de recarga. Incluir el borrado remoto
y el caso de guardado propio confirmado para evitar una regresión inversa.

## Evidencia nueva de Codex

- **40/40 tests** sin fallos ni omitidos: núcleo, formato, mensajes y lógica
  de interfaz de escritura, más inventario de CORS.
- **`tsc --noEmit --incremental false`: exit 0**, sin errores.
- **Batería E3a completa: 37/37**, exit 0, con Auth, RPC, rutas HTTP y sesiones
  PostgreSQL locales. Pasaron permisos por acción, propiedad, edición/rechazos,
  límites con carreras, idempotencia, gates reales 1–4, B3a/B3b y actores cruzados.
  Una entrada es el N/A declarado de admisión de E3b: no certifica esa función.
- Limpieza de esa corrida: **96 cuentas** creadas para ella, restos
  `0|0|0|0|false` para cuentas, participantes, sesiones, locks e interruptores.
- Prueba adicional A1 con una cuenta local y publicación real; reintento sin
  duplicar. Cuenta eliminada, participante/intento propios retirados,
  reseña/versión de prueba sin restos y configuración restaurada.
- Catálogo final independiente: 12 RPC públicas; **0** ejecutables por anon
  o authenticated; 12 por service_role. **0** funciones privadas ejecutables
  por PUBLIC/roles API; 12 tablas privadas y **0** permisos de tabla para
  los roles API.
- Interruptores finales: módulo/publicación/Top en **false**. Límites
  de reseñas/ediciones/evaluaciones: **5/10/100**.
- `git diff f67ff90..HEAD --check`: exit 0.

Se verificó el destino local mediante el guardián: contexto `desktop-linux`,
tubería `npipe:////./pipe/dockerDesktopLinuxEngine`, contenedor exacto del
proyecto y API `127.0.0.1:54321`. Sólo se usó `.env.comunidad-local`.
El servidor local que Codex levantó para la batería quedó detenido.

## Límites, decisiones y próximos pasos

Leídos 014/up/down, adaptadores, núcleos, rutas, componentes, integración en
ficha, página local, exclusión Android, baterías, informe/log, plan y estado;
consultados CLAUDE.md, ISSUES.md y MANTENIMIENTO §8.b/§8.b.2.

Se inspeccionaron las capturas de teléfono/editor y respuesta perdida de
Claude. La herramienta de navegador no respondió en dos intentos; no se
declara recorrido visual propio. A2 se sostiene en la transición explícita
del componente, con el límite de verificación indicado. Las capturas y los
otros recorridos completos siguen siendo evidencia de Claude.

No se repitieron la suite general, permisos/invariantes generales, baja,
concurrencia antigua, salas, up/down/up, builds ni Android. No se restableció
la base compartida ni se borraron datos ajenos. La limpieza amplia histórica
reconocida por Claude no tiene evidencia suficiente para que Codex certifique
retroactivamente que sólo alcanzó su participante; los scripts actuales
revisados y las pruebas de esta auditoría sí delimitan sus propios ids.

La lectura es provisional y E3b/E4/E5a siguen pendientes: colas, duplicados,
revisión de rechazos, moderación, filtros y paginación no se dan por aprobados.
No habilitar publicación con esos pendientes. El borrador de términos tampoco
queda aprobado por probar su aceptación.

ZWJ/emojis compuestos: la restricción viene de 011 y ahora se avisa antes del
envío. Es una limitación documentada y una decisión de producto pendiente;
no se exige cambiarla para esta corrección. El día del contador calculado
antes de los locks sigue como límite conocido del informe, sin presentarlo
como medición exacta respecto de medianoche.

Sin Producción, E0, servicios externos, gastos, push, merge, deploy ni AAB.
E1, retención, N y el AAB conjunto conservan su estado. La siguiente entrega
debe corregir A1/A2 con sus regresiones, sin otra auditoría general de etapas
cerradas; E3b requiere autorización del dueño.
