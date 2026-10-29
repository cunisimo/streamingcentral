# Auditoría de la preparación de reseñas — f64a659

21/10/2026. Codex. Alcance: diff documental `52c7ae7..f64a659`, revisión de
Claude, contraste con código de `wt-resenas-comunidad` y documentación oficial.
No se consultó Producción, no se ejecutaron proveedores ni pruebas de app.
No se cambió código, SQL, permisos ni el trabajo de Claude. Este archivo es un
informe nuevo local; el estado canónico sigue en `docs/ESTADO.md` de la rama vigente.

## Resultado

Preparación útil, pero requiere correcciones antes del plan. No es un fallo
de código nuevo: sólo se entregó documentación. El diseño copiado conserva el
SHA-256 del original y el commit modifica únicamente tres archivos Markdown.
`git diff --check 52c7ae7..f64a659` pasó; checkout de revisión limpio.

## Hallazgos sobre las propuestas

### A1 — Alto: T2/T3 no garantizan impedir escrituras fuera de la RPC

Revisión líneas 85–97: propone RPC `security invoker` y límites dentro de la
RPC. Esa función usa los permisos del llamador: si éste puede escribir en las
tablas para que la RPC funcione, hay que demostrar por qué no puede hacerlo
directamente y saltarse contadores/normalización/transiciones. RLS de propiedad
sola no basta. No es una vulnerabilidad ya implementada sino un hueco del diseño
de permisos. Resolver con un inventario de grants y funciones, invariantes en la
base que cubran todos los caminos o RPC controladas con privilegios acotados y
autorización explícita. Probar escrituras REST y RPC con roles reales.
Fuente: https://www.postgresql.org/docs/current/sql-createfunction.html

### A2 — Alto: T6 no define un cierre consistente al límite del mes

Líneas 112–118: `on conflict do nothing` evita duplicar el cierre, no recupera
el estado que había al terminar el mes. Ejemplo: un positivo válido al finalizar
octubre se retira el 1 de noviembre antes de la primera consulta; calcular en
ese momento con el estado vigente reduce octubre. Si hubo cascada por baja de
cuenta o purga, puede ser imposible reconstruirlo. Definir eventos/intervalos
con validez temporal y conservación mínima hasta consolidar el cierre, o un
mecanismo de snapshot consistente que soporte cierres tardíos. No retener texto
o identidades indefinidamente por esto. Incluir pruebas de cambios/bajas entre
el corte y la primera consulta, no sólo cierre repetido.

### A3 — Medio: T5 hace inaccesibles las reseñas posteriores a 200

Líneas 103–111: congelar como máximo 200 ids y ofrecer recargar al superar ese
tope no permite llegar al resto: recargar vuelve al comienzo. Definir continuidad
real, cursor o snapshot paginado. Tratar revalidación y bloqueos sin repetir ni
filtrar contenido retirado. No asumir volumen máximo sin regla aprobada.

### A4 — Medio: D7/F3 confunden recuperación y confirmación de correo

`docs/ISSUES.md:337` trata recuperación de contraseña Android, no una avería
demostrada del alta/confirmación. No convertir #22 en dependencia obligatoria sin
reproducir el recorrido específico. Además, con Confirm Email apagado Supabase
confirma implícitamente el email en la base: `email_confirmed_at` no prueba por
sí solo que el usuario controló el buzón. Inspeccionar configuración y distinguir
alta confirmada, autoconfirmación histórica y prueba real de posesión. No resetear
cuentas viejas ni enviar correos sin autorización. Lectura actual y control nuevo
de publicación son decisiones separadas.
Fuente: https://supabase.com/docs/guides/auth/general-configuration

### A5 — Medio: costo comparativo no describe el modo real de los candidatos

La aritmética 1.400 tokens entrada + 80 salida por 13.000 llamadas es correcta
para los precios y supuestos escritos: USD 2,34 Haiku y USD 1,326 nano. No es
costo medido, máximo de gasto ni costo completo del módulo (nombres/perfiles,
otros servicios, impuestos y revisión humana no incluidos). El 30% adicional es
un supuesto promedio, no cota de dos reintentos por llamada.

La línea 253 equipara pensamiento desactivado y esfuerzo bajo. En Haiku 5.5
son controles distintos: hay que configurar explícitamente
`thinking: {type: "disabled"}` con esfuerzo compatible. Para GPT-5 nano no
trasladar esa configuración: su familia soporta minimal/low/medium/high, no
asumir modo sin razonamiento; incluir tokens de razonamiento en el presupuesto.
La página oficial del modelo lo marca Deprecated: revisar ciclo de vida antes
de recomendarlo para un lanzamiento nuevo. No se fija aquí fecha de apagado,
pues la fecha encontrada en la referencia no quedó corroborada en la página
de deprecaciones consultada.

Fuentes:
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5
- https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5
- https://developers.openai.com/api/docs/models/gpt-5-nano

### A6 — Medio: D2 omite el planificador de salas existente

`supabase/migrations/009_salas.sql:815` agenda `sala-barrido` por minuto con
`pg_cron`. No es cierto que el único job del repositorio sea tmdb-sync. La ausencia
de `vercel.json` no implica ausencia de planificador en el sistema. Inspeccionar
jobs reales sin escribir antes de elegir; no tocar el barrido de salas ni
reactivar el cron de Netflix retirado. El diseño de Codex no daba estos nuevos
jobs por hechos: los marcaba como trabajo a definir.

## Hallazgos de Claude confirmados con su alcance correcto

- `user_reviews`: el SQL permite lectura anónima de aprobadas y conserva estado
  al editar; ambas cosas deben cambiar antes de activar el módulo. Policies,
  grants y filas efectivos en Producción todavía no comprobados.
- Editorial: `app/admin/resena/[id]/page.tsx` escribe directo mediante el cliente;
  `schema.sql:212–214` usa `is_admin()`, cuya definición no comprueba AAL2. El
  guard de pantalla no sustituye ese control. Diferencia real respecto al Top;
  mi diseño generalizaba indebidamente la doble capa. No demuestra acceso de un
  usuario no admin ni explotación real. Verificar grants/policies efectivas;
  endurecimiento separado sin quitar admin o MFA a la cuenta personal.
- Nuevos datos comunitarios deben quedar fuera de respuestas/cachés públicas,
  mantener compatibilidad del AAB antiguo y construir proyección de perfil.
- Perspective anuncia fin después del 31/12/2026. Su descarte tiene fundamento:
  https://perspectiveapi.com/
- Haiku 5.5 existe y sus tarifas para prompts cortos coinciden con el cálculo:
  https://platform.claude.com/docs/en/models/haiku-5-5/overview

## Correcciones adicionales de alcance y evidencia

- Nueva tabla frente a adaptación de `user_reviews` es una decisión técnica a
  justificar por compatibilidad, rollback y permisos; los defectos actuales se
  pueden migrar. No es una imposibilidad inherente reutilizar la tabla. Cualquier
  cambio debe partir de inventario de filas/dependencias, sin destruir historial.
- F8 ya tiene decisión del dueño: selector de Top semanal plataformas / Top
  Yumpers; no reabrir nombres por mera preferencia editorial de la revisión.
- Espera de 24 horas para reseñar es una propuesta NUEVA, no una condición ya
  aprobada. Justificar impacto sobre conversión antes de imponerla. Cifras de
  límites son hipótesis ajustables; no presentar once decisiones técnicas como
  requisitos de aprobación independientes del dueño.
- Sustituir “ninguna API de toxicidad detecta…” por límites demostrados de las
  APIs examinadas: ausencia de categoría/finalidad específica no demuestra que
  jamás detecten un caso. No garantiza que un LLM sí lo detecte.
- OpenAI: distinguir abuse monitoring y estado almacenado de Responses,
  configurar `store:false` cuando corresponda y documentar excepciones. “Hasta
  30 días” no es garantía universal. Fuente:
  https://developers.openai.com/api/docs/guides/your-data
- Anthropic: hasta 30 días estándar, excepciones por abuso/legal/acuerdo;
  marcado por EL PROVEEDOR no equivale a que Yump etiquete texto como abusivo.
  Hasta dos años para entradas/salidas marcadas y plazos distintos para scores:
  https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- Banco de 80 textos: útil para comparar, no certificación de seguridad. Añadir
  negativos difíciles por categoría, conjunto no usado para ajustar el prompt,
  resultados por caso y costo real; no usar confianza autodeclarada como
  probabilidad calibrada. Ninguna llamada externa se autorizó o realizó aquí.

## Siguiente paso

Claude debe corregir revisión y registro canónico de su rama, proponer soluciones
concretas para A1–A6 y devolver commit documental. No implementar todavía.
Luego revisar condiciones de partida con acceso de sólo lectura disponible;
reservar decisiones del dueño para gasto/proveedor, privacidad y cambios reales
de producto. Sin push, merge, migración, deploy ni AAB. Salas conserva aprobación
y viaja en el mismo AAB que reseñas.
