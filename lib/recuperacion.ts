// Qué prueba que alguien llegó de verdad desde un enlace de recuperación, y con
// qué credenciales se escribe la contraseña nueva.
//
// ============================================================================
// EL DEFECTO REPRODUCIDO (issue #22)
// ============================================================================
// Reproducido el 2026-09-10 con dos cuentas de prueba, en el navegador y contra
// el proyecto Supabase real: con una sesión abierta de la cuenta A y un enlace
// YA CONSUMIDO de la cuenta B (`error=access_denied&error_code=otp_expired`), la
// página vieja ignoraba el error, mostraba el formulario para A, decía "Listo"
// y le cambiaba la contraseña a A. B quedaba intacta.
//
// ⚠️ Eso es UNA causa posible, compatible con los síntomas que reportó el dueño.
// No está demostrado que su cuenta real haya pasado por esa secuencia ni qué
// consumió su enlace original. Ver el informe.
//
// ============================================================================
// LO QUE ESTÁ MAL EN DECIDIR CON LA URL O CON LA SESIÓN
// ============================================================================
// La primera corrección (`fb89b45`) decidía con `type=recovery` en la URL y con
// el `sub` de un JWT decodificado sin verificar. La auditoría lo desarmó en una
// línea: `#type=recovery&access_token=basura` con una sesión abierta habilitaba
// el formulario. Un texto en la URL no prueba nada; un JWT sin verificar tampoco.
//
// **La única prueba es la de Supabase.** En `@supabase/auth-js` 2.108.2,
// `_getSessionFromURL` hace `_getUser(access_token)` —un viaje al servidor— y
// sólo si el servidor acepta el token guarda la sesión y emite
// `PASSWORD_RECOVERY` con ella. Un token basura, vencido o consumido no llega a
// emitir nada. Ese evento es la aceptación; acá se lo llama así.
//
// Y la escritura va ATADA a esa aceptación: se hace con un cliente aislado que
// nace con los tokens que Supabase entregó, no con "la sesión que tenga el
// singleton en ese momento". Si otra pestaña cambió de cuenta entre abrir el
// formulario y pulsar Guardar, el singleton apunta a otra persona; el cliente
// aislado no. Cero escrituras sobre otra cuenta, por construcción.
//
// Módulo PURO, sin imports de runtime, misma razón que `lib/reparar-y-cachear.ts`
// y `lib/eliminar-cuenta-flujo.ts`: para que estas reglas se ejecuten en un test.

/**
 * Lo que Supabase ACEPTÓ. Viene del evento `PASSWORD_RECOVERY`, nunca de la URL.
 * Los tokens son los que el servidor entregó para esa recuperación.
 */
export interface RecuperacionAceptada {
  userId: string;
  /** Para mostrarle a la persona QUÉ cuenta va a cambiar. Viene de la sesión que Supabase devolvió, no del singleton. */
  email: string | null;
  accessToken: string;
  refreshToken: string;
}

/** Lo que trae la URL con la que se llegó. SÓLO CLASIFICA; no decide nada. */
export type Enlace =
  /** Supabase rechazó la verificación y lo dijo en la URL. */
  | { tipo: "error"; codigo: string | null; descripcion: string | null }
  /** Hay tokens con forma de recuperación: vale la pena ESPERAR a Supabase. */
  | { tipo: "posible-recuperacion" }
  /** Nada: se entró de memoria, por historial o desde un menú. */
  | { tipo: "nada" };

const params = (hash: string, query: string) => {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const q = new URLSearchParams(query.replace(/^\?/, ""));
  return (k: string) => h.get(k) ?? q.get(k);
};

/**
 * ¿La URL trae algo que Supabase pueda llegar a aceptar como recuperación?
 *
 * Es la condición para ESPERAR su decisión en vez de contestar de inmediato.
 * Acepta también tokens basura a propósito: quien los rechaza es Supabase, no
 * este módulo, y la respuesta es la misma —sin aceptación no hay formulario—.
 */
export function hayTokensDeRecuperacion(hash: string, query = ""): boolean {
  const de = params(hash, query);
  return de("type") === "recovery" && de("access_token") !== null && !de("error") && !de("error_code");
}

/**
 * Lee la URL. ⚠️ **ANTES de que arranque Supabase**: `detectSessionInUrl` borra
 * el fragmento apenas lo procesa. En la página se llama en el inicializador de
 * un `useState`, que corre durante el render; los efectos corren después.
 *
 * Mira el fragmento y la query: el flujo implícito usa el hash, pero un error
 * puede volver como query según la configuración.
 */
export function leerEnlace(hash: string, query: string): Enlace {
  const de = params(hash, query);
  const error = de("error") ?? de("error_code");
  if (error) {
    return { tipo: "error", codigo: de("error_code") ?? de("error"), descripcion: de("error_description") };
  }
  if (hayTokensDeRecuperacion(hash, query)) return { tipo: "posible-recuperacion" };
  return { tipo: "nada" };
}

/**
 * El motivo, en castellano. El texto viejo era uno solo para todo, y esa
 * ambigüedad fue parte del incidente: no se podía distinguir "lo abrió alguien
 * antes" de "se venció" ni reportarlo.
 */
export function mensajeDeEnlace(codigo: string | null, descripcion: string | null): string {
  switch (codigo) {
    case "otp_expired":
      return "Este enlace ya no sirve: o venció, o alguien lo abrió antes que vos "
        + "(algunos correos los abren solos para revisarlos). Pedí uno nuevo y usalo "
        + "apenas llegue, en este mismo navegador.";
    case "access_denied":
      return "Supabase rechazó este enlace de recuperación. Pedí uno nuevo desde tu cuenta.";
    default:
      return descripcion
        ? `El enlace de recuperación falló: ${descripcion}`
        : "El enlace de recuperación no se pudo verificar. Pedí uno nuevo desde tu cuenta.";
  }
}

/** Qué se muestra en `/cuenta/reset`. */
export type Pantalla =
  | { vista: "cargando" }
  | { vista: "error"; mensaje: string }
  /** Se llegó sin enlace. Que haya sesión no cambia nada. */
  | { vista: "sin-enlace" }
  | { vista: "formulario"; aceptada: RecuperacionAceptada };

/**
 * La decisión. Fijate qué NO recibe: ninguna sesión, ningún `user`, ningún
 * `sub`. Sólo lo que vino en la URL y lo que Supabase aceptó.
 *
 * ⚠️ `aceptada` es la copia RECLAMADA por esta pantalla, no la pendiente global.
 * Por eso puede mandar aunque la URL esté limpia: el montaje tardío legítimo es
 * exactamente ese caso. La reutilización se impide en `reclamar`, no acá.
 */
export function decidirPantalla(opts: {
  ready: boolean;
  enlace: Enlace;
  aceptada: RecuperacionAceptada | null;
  /** ¿Hay una pendiente que esta pantalla todavía no reclamó? Entre el render que la ve y el efecto que la reclama hay un render: ahí no se contesta. */
  pendiente: boolean;
}): Pantalla {
  const { ready, enlace, aceptada, pendiente } = opts;
  // Antes de que Supabase termine de arrancar no se contesta NADA, ni siquiera
  // un error que ya está en la URL. Es también lo que hace coincidir el HTML
  // del servidor (sin `window`: enlace "nada", ready false) con el primer
  // render del cliente: si acá saliera "sin enlace", ese texto se pintaría en
  // todo enlace de recuperación hasta hidratar, y la hidratación fallaría
  // (medido: React #425/#418/#423 y re-render de la raíz).
  if (!ready) return { vista: "cargando" };
  if (enlace.tipo === "error") {
    return { vista: "error", mensaje: mensajeDeEnlace(enlace.codigo, enlace.descripcion) };
  }
  // La aceptación manda, con o sin URL: Supabase borra el hash al procesarlo, y
  // un re-render que vuelva a leer la barra ya no ve nada.
  if (aceptada) return { vista: "formulario", aceptada };
  // Hay una pendiente y esta instancia aún no la reclamó (el efecto corre
  // después del render). Ni "sin enlace" ni "inválido": se espera a reclamar.
  if (pendiente) return { vista: "cargando" };
  if (enlace.tipo === "nada") return { vista: "sin-enlace" };
  // Había tokens, Supabase ya decidió y no aceptó: es un error — y no importa
  // qué sesión haya.
  return { vista: "error", mensaje: mensajeDeEnlace(null, null) };
}

// ============================================================================
// EL CICLO DE VIDA: PENDIENTE (global) → RECLAMADA (de UNA pantalla)
// ============================================================================
// Tercer P1 de la auditoría. Con la aceptación guardada en el provider global y
// limpiada sólo tras éxito o fallo de identidad, esta secuencia volvía a
// habilitar el cambio de contraseña de B sin enlace: aceptación de B → salir de
// /cuenta/reset sin guardar → cerrar sesión o entrar como A → volver a
// /cuenta/reset sin hash. El provider raíz sigue montado al navegar.
//
// La solución separa dos estados que antes eran uno:
//
//   PENDIENTE — global. Nace con `PASSWORD_RECOVERY` **si en ese momento la
//     ruta real es /cuenta/reset** (cuarto P1: una aceptación en "/" —el
//     fallback histórico al Site URL— creaba una pendiente que la navegación
//     posterior a Reset conservaba). Vive sólo mientras la ruta siga siendo
//     /cuenta/reset y hasta que una pantalla la reclame. La descarta
//     cualquier cambio de sesión a OTRA cuenta, un cierre de sesión, y una
//     pantalla que llega con un error en la URL.
//
//   RECLAMADA — local a UNA instancia de la pantalla. Se toma de la pendiente
//     una sola vez y la pendiente queda en null. Muere con la instancia. Es
//     INMUNE a los eventos del singleton: si otra pestaña entra como A con el
//     formulario de B abierto, la pantalla sigue escribiendo sobre B — el
//     servidor es quien rechaza si la sesión de recuperación fue revocada.
//
// Lo que sobrevive el tiempo justo para un chunk tardío es la PENDIENTE (la
// ruta sigue siendo /cuenta/reset y nadie la reclamó). Lo que no puede
// reutilizarse es también la pendiente, porque reclamar la consume.

export type Pendiente = RecuperacionAceptada | null;

/** Los eventos que mueven la pendiente. Son los que de verdad llegan al provider. */
export type EventoPendiente =
  /**
   * `pathname` es la ruta REAL en el momento del evento (`window.location`),
   * no la que vio un efecto anterior: el efecto de ruta no vuelve a correr si
   * el pathname no cambió, y un cierre viejo mentiría durante una navegación.
   */
  | { tipo: "aceptada"; r: RecuperacionAceptada; pathname: string }
  | { tipo: "auth"; evento: string; userId: string | null }
  | { tipo: "ruta"; pathname: string };

const RUTA_RESET = "/cuenta/reset";
// Con barra final también: el export de Capacitor usa `trailingSlash`.
const enReset = (pathname: string) => pathname === RUTA_RESET || pathname === RUTA_RESET + "/";

/** El reductor de la pendiente. Puro, y es lo que el provider ejecuta. */
export function siguientePendiente(actual: Pendiente, e: EventoPendiente): Pendiente {
  switch (e.tipo) {
    case "aceptada":
      // Fuera de /cuenta/reset una aceptación NUNCA genera una pendiente
      // reclamable — ni conserva una anterior. Adentro, reemplaza.
      return enReset(e.pathname) ? e.r : null;
    case "ruta":
      // Fuera de /cuenta/reset no hay nadie que pueda reclamarla legítimamente.
      return enReset(e.pathname) ? actual : null;
    case "auth":
      if (!actual) return null;
      // El arranque no es un cambio de cuenta, y PASSWORD_RECOVERY llega por
      // "aceptada". Todo lo demás con OTRA cuenta —o sin cuenta— la descarta.
      if (e.evento === "INITIAL_SESSION" || e.evento === "PASSWORD_RECOVERY") return actual;
      if (e.evento === "SIGNED_OUT") return null;
      return e.userId === actual.userId ? actual : null;
  }
}

/**
 * Lo que hace una pantalla al montar: intenta reclamar la pendiente.
 *
 * Con una URL en error no reclama nada Y descarta la pendiente: una URL que
 * Supabase rechazó nunca se combina con una aceptación anterior. Con una URL
 * limpia o con tokens, reclama — la limpia es el montaje tardío legítimo,
 * después de que auth-js borró el hash.
 */
export function reclamar(
  pendiente: Pendiente, enlace: Enlace,
): { reclamada: RecuperacionAceptada | null; pendiente: Pendiente } {
  if (enlace.tipo === "error") return { reclamada: null, pendiente: null };
  return { reclamada: pendiente, pendiente: null };
}

// ============================================================================
// LA ESCRITURA
// ============================================================================

export type MotivoFallo = "sin-recuperacion" | "identidad" | "fallo";
export type Resultado =
  | { ok: true }
  | { ok: false; motivo: MotivoFallo; detalle?: string };

export interface DepsEscritura {
  /**
   * Escribe la contraseña **con los tokens de `r`**, en un cliente que nadie más
   * pueda mover. Devuelve el id de la cuenta que Supabase dice haber actualizado.
   */
  escribirCon: (r: RecuperacionAceptada, password: string) => Promise<{ userId: string | null; error?: string }>;
}

/**
 * Cambia la contraseña de la cuenta de la recuperación aceptada, y de ninguna otra.
 *
 * Sin aceptación no se escribe: ese `return` temprano es el criterio de "cero
 * escrituras sobre otra cuenta". Y aun con el cliente atado, se compara lo que
 * Supabase devolvió: el costo de equivocarse es cambiarle la contraseña a otra
 * persona, y una comparación de más no cuesta nada.
 */
export async function cambiarPassword(
  deps: DepsEscritura,
  aceptada: RecuperacionAceptada | null,
  password: string,
): Promise<Resultado> {
  if (!aceptada) return { ok: false, motivo: "sin-recuperacion" };
  const { userId, error } = await deps.escribirCon(aceptada, password);
  if (error) return { ok: false, motivo: "fallo", detalle: error };
  if (userId !== aceptada.userId) return { ok: false, motivo: "identidad" };
  return { ok: true };
}
