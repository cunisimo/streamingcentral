// Qué prueba que alguien llegó de verdad desde un enlace de recuperación.
//
// ============================================================================
// EL INCIDENTE QUE ESTE MÓDULO CIERRA (issue #22)
// ============================================================================
// Reproducido el 2026-09-10 con dos cuentas de prueba, en el navegador y contra
// el proyecto Supabase real:
//
//   1. El navegador tenía una sesión abierta de la cuenta A.
//   2. Se llegó a `/cuenta/reset` con un enlace de recuperación de la cuenta B
//      YA CONSUMIDO — el fragmento traía
//      `error=access_denied&error_code=otp_expired`.
//   3. La página **ignoró el error por completo**, mostró el formulario para
//      **A**, dijo "Listo, tu contraseña se actualizó" y le cambió la
//      contraseña a **A**.
//   4. B quedó intacta: `updated_at` sin mover y su contraseña original seguía
//      entrando.
//
// Por eso el dueño veía "el cambio fue correcto" y después no podía entrar: la
// contraseña se cambió, pero en OTRA cuenta.
//
// La causa está en una sola línea del formulario viejo: decidía con
// `ready && !user`, o sea que **cualquier sesión previa alcanzaba como prueba de
// recuperación**. Una sesión no es una prueba de nada: prueba que alguien entró
// alguna vez en este navegador, no que tenga el enlace del mail.
//
// ============================================================================
// LAS TRES REGLAS QUE SALEN DE AHÍ
// ============================================================================
// 1. **El enlace manda, no la sesión.** Sin `type=recovery` en la URL no hay
//    formulario, aunque haya sesión.
// 2. **Un error del enlace se muestra, no se traga.** Y con su motivo: no es lo
//    mismo "ya lo usaste" que "se venció" que "vino roto".
// 3. **La identidad se compara.** La sesión que quedó activa tiene que ser la
//    del token del enlace; si no coinciden, no se toca nada.
//
// Módulo PURO y sin imports de runtime, por la misma razón que
// `lib/reparar-y-cachear.ts`: así estas tres reglas se pueden ejecutar en un
// test en vez de vigilarse leyendo el fuente.

/** Lo que trae la URL con la que se llegó a `/cuenta/reset`. */
export type Enlace =
  /** Supabase rechazó la verificación: viene `error` en el fragmento. */
  | { tipo: "error"; codigo: string | null; descripcion: string | null }
  /** Verificación OK: vienen los tokens de la sesión de recuperación. */
  | { tipo: "recuperacion"; accessToken: string }
  /** No hay enlace: se entró de memoria, por historial o desde un menú. */
  | { tipo: "nada" };

/**
 * Lee el resultado del enlace de la URL.
 *
 * ⚠️ **HAY QUE LLAMARLA ANTES DE QUE ARRANQUE SUPABASE.** `detectSessionInUrl`
 * consume el fragmento y lo borra de la barra de direcciones, así que si esto
 * corre después ya no queda nada que leer. En la página se llama en el
 * inicializador de un `useState`, que corre durante el render — y los efectos,
 * incluido el del `AuthProvider`, corren después.
 *
 * Mira el fragmento y TAMBIÉN la query: Supabase manda el error en el hash en
 * el flujo implícito, pero algunas configuraciones lo devuelven como query.
 * Leer los dos no cuesta nada y evita un caso mudo.
 */
export function leerEnlace(hash: string, query: string): Enlace {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const q = new URLSearchParams(query.replace(/^\?/, ""));
  const de = (k: string) => h.get(k) ?? q.get(k);

  const error = de("error") ?? de("error_code");
  if (error) {
    return { tipo: "error", codigo: de("error_code") ?? de("error"), descripcion: de("error_description") };
  }
  // El `type` tiene que decir `recovery`: un enlace de confirmación de mail
  // también deja tokens en el hash y NO habilita cambiar la contraseña.
  const accessToken = de("access_token");
  if (de("type") === "recovery" && accessToken) return { tipo: "recuperacion", accessToken };
  return { tipo: "nada" };
}

/**
 * El motivo, en castellano y sin jerga.
 *
 * El texto viejo era uno solo —"El enlace no es válido o ya venció"— para
 * cualquier causa, y esa ambigüedad es parte del incidente: el dueño no podía
 * distinguir "lo abrió alguien antes" de "se venció" ni reportarlo.
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
  /** El enlace falló: se muestra el motivo real. */
  | { vista: "error"; mensaje: string }
  /** Se llegó sin enlace. Que haya sesión NO alcanza. */
  | { vista: "sin-enlace" }
  /** El enlace verificó, pero la sesión activa es de OTRA cuenta. */
  | { vista: "identidad" }
  | { vista: "formulario" };

/**
 * La decisión, en un solo lugar y sin React.
 *
 * 🔴 **`hayUsuario` NO habilita nada por sí solo.** Es la lección del incidente:
 * el formulario viejo entraba por `!user` y por eso una sesión ajena servía de
 * llave. Acá el orden es al revés — primero se mira el enlace, y la sesión sólo
 * decide si ya está lista.
 */
export function decidirPantalla(opts: {
  ready: boolean;
  enlace: Enlace;
  usuarioId: string | null;
  /** `sub` del token del enlace, para comparar identidad. */
  sujetoDelEnlace: string | null;
}): Pantalla {
  const { ready, enlace, usuarioId, sujetoDelEnlace } = opts;

  // El error del enlace se puede contestar sin esperar a Supabase: no depende
  // de que haya sesión, y hacerlo esperar sólo alarga un "Cargando…" inútil.
  if (enlace.tipo === "error") {
    return { vista: "error", mensaje: mensajeDeEnlace(enlace.codigo, enlace.descripcion) };
  }
  if (enlace.tipo === "nada") return { vista: "sin-enlace" };

  if (!ready) return { vista: "cargando" };
  if (!usuarioId) {
    // El enlace traía tokens pero no quedó sesión: la verificación no cerró.
    return { vista: "error", mensaje: mensajeDeEnlace(null, null) };
  }
  // La sesión activa tiene que ser la del enlace. Si el navegador tenía otra
  // abierta y Supabase no llegó a reemplazarla, esto lo caza.
  if (sujetoDelEnlace && sujetoDelEnlace !== usuarioId) return { vista: "identidad" };
  return { vista: "formulario" };
}

/**
 * El `sub` de un JWT, **sin verificar la firma**.
 *
 * ⚠️ Esto NO autentica nada y no hay que usarlo para autorizar: sólo compara
 * dos identidades que ya vinieron por caminos confiables (el token del enlace y
 * la sesión que Supabase dejó activa). La verificación de verdad la hace
 * Supabase del otro lado.
 */
export function sujetoDelToken(jwt: string | null): string | null {
  if (!jwt) return null;
  const partes = jwt.split(".");
  if (partes.length < 2) return null;
  try {
    const base = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function"
      ? atob(base.padEnd(base.length + ((4 - (base.length % 4)) % 4), "="))
      : Buffer.from(base, "base64").toString("utf8");
    const carga = JSON.parse(json) as { sub?: unknown };
    return typeof carga.sub === "string" ? carga.sub : null;
  } catch {
    return null;
  }
}
