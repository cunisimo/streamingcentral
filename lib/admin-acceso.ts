// Acceso al dashboard /admin: la decisión del layout, el destino que se
// conserva a través del login y del MFA, y la carga del perfil. PURO, para
// probarlo con lecturas controladas (lib/admin-acceso.test.ts).
//
// Informe del dueño (17/10): "al abrir /admin/top muchas veces termino en el
// Yump público", también en incógnito. La causa: `ready` llegaba antes que el
// perfil y el layout trataba "perfil todavía no cargado" igual que "no es
// administrador" → `router.replace("/")`. Además la lectura del perfil no
// distinguía un error de "sin permisos", una respuesta vieja podía pisar a la
// cuenta actual y el login volvía siempre a /admin, perdiendo /admin/top.
//
// 🔴 Esto sigue siendo EXPERIENCIA DE USUARIO, no seguridad: la sesión vive en
// `localStorage` y el servidor no la ve. Quien rechaza son `adminDeToken`
// (lib/admin-auth.ts) en cada API e `is_admin_mfa()` en las policies de RLS.
// Lo que garantiza este módulo es no conceder la VISTA por un error o por un
// perfil pendiente, y no echar a un administrador mientras se verifica.

export type EstadoPerfil = "pendiente" | "listo" | "error";
export type EstadoMfaAcceso = "cargando" | "sin-factor" | "falta-verificar" | "falta-respaldo" | "listo";

export interface EntradaAcceso {
  /** La sesión ya se conoce (con o sin usuario). */
  ready: boolean;
  usuario: boolean;
  estadoPerfil: EstadoPerfil;
  esAdmin: boolean;
  mfa: EstadoMfaAcceso;
  ruta: string;
}

export type Acceso =
  | { tipo: "esperar"; motivo: "sesion" | "perfil" | "mfa" }
  | { tipo: "ir"; a: string }
  | { tipo: "sin-permisos" }
  | { tipo: "error-perfil" }
  | { tipo: "mostrar" };

const LOGIN = "/admin/login";
const MFA = "/admin/mfa";

export function decidirAccesoAdmin(e: EntradaAcceso): Acceso {
  if (e.ruta === LOGIN) return { tipo: "mostrar" };
  if (!e.ready) return { tipo: "esperar", motivo: "sesion" };
  if (!e.usuario) return { tipo: "ir", a: conDestino(LOGIN, e.ruta) };
  // El perfil decide los permisos: mientras no está, se espera; si falló, se
  // muestra el error. Ninguno de los dos concede ni echa.
  if (e.estadoPerfil === "pendiente") return { tipo: "esperar", motivo: "perfil" };
  if (e.estadoPerfil === "error") return { tipo: "error-perfil" };
  if (!e.esAdmin) return { tipo: "sin-permisos" };
  if (e.mfa === "cargando") return { tipo: "esperar", motivo: "mfa" };
  // Sin segundo factor completo no se dibuja el panel: se manda a completarlo.
  if (e.ruta !== MFA && e.mfa !== "listo") return { tipo: "ir", a: conDestino(MFA, e.ruta) };
  return { tipo: "mostrar" };
}

/**
 * El destino al que volver después del login o del MFA: una ruta del panel y
 * nada más. Todo lo demás —externo, `//host`, rutas fuera de /admin, las
 * pantallas de entrada, `..` o barras invertidas— cae a `/admin`.
 */
export function destinoSeguro(crudo: string | null | undefined): string {
  if (!crudo) return "/admin";
  if (!/^\/admin(\/[A-Za-z0-9_-]+)*$/.test(crudo)) return "/admin";
  if (crudo === LOGIN || crudo === MFA) return "/admin";
  return crudo;
}

/** `/admin/login` o `/admin/mfa` con el destino a conservar (si no es el de siempre). */
export function conDestino(base: string, destino: string): string {
  const d = destinoSeguro(destino);
  return d === "/admin" ? base : `${base}?destino=${encodeURIComponent(d)}`;
}

// --- La carga del perfil ---------------------------------------------------------

export interface LecturaPerfil<P> { perfil: P | null; error: string | null }
export interface EstadoSesionPerfil<P> { userId: string | null; estadoPerfil: EstadoPerfil; perfil: P | null }

/**
 * El perfil de la sesión actual, con tres estados: pendiente, listo o error.
 * Cada cambio de sesión abre una GENERACIÓN; una respuesta de una generación
 * vieja (otra cuenta, o una sesión ya cerrada) se descarta.
 *
 * El mismo usuario otra vez (INITIAL_SESSION, TOKEN_REFRESHED, …) relee el
 * perfil sin volver a "pendiente": un refresco de token no puede sacar al
 * administrador del panel mientras se relee.
 */
export function crearSesionPerfil<P>(
  leer: (userId: string) => Promise<LecturaPerfil<P>>,
  publicar: (e: EstadoSesionPerfil<P>) => void,
) {
  let estado: EstadoSesionPerfil<P> = { userId: null, estadoPerfil: "listo", perfil: null };
  let generacion = 0;
  const fijar = (e: EstadoSesionPerfil<P>) => { estado = e; publicar(e); };

  async function cargar(userId: string, conservar: boolean) {
    const mia = ++generacion;
    if (!conservar) fijar({ userId, estadoPerfil: "pendiente", perfil: null });
    let r: LecturaPerfil<P>;
    try { r = await leer(userId); } catch (e) { r = { perfil: null, error: String(e) }; }
    if (mia !== generacion) return; // llegó tarde: ya es otra sesión
    if (r.error) {
      // Una relectura del mismo usuario que falla conserva lo que ya se sabía.
      if (conservar) return;
      fijar({ userId, estadoPerfil: "error", perfil: null });
      return;
    }
    fijar({ userId, estadoPerfil: "listo", perfil: r.perfil });
  }

  return {
    estado: () => estado,
    cambio(userId: string | null): Promise<void> {
      if (!userId) {
        generacion++;
        fijar({ userId: null, estadoPerfil: "listo", perfil: null });
        return Promise.resolve();
      }
      const mismo = userId === estado.userId && estado.estadoPerfil === "listo";
      return cargar(userId, mismo);
    },
    reintentar(): Promise<void> {
      return estado.userId ? cargar(estado.userId, false) : Promise.resolve();
    },
  };
}
