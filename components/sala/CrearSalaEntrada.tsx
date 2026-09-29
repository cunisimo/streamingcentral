"use client";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import { SALAS_VISIBLES } from "@/lib/sala/entrada";
import { ES_NATIVO } from "@/lib/plataforma";

// La entrada a **Yumpeá** en el Home, debajo de "Ruleta Yump". Mismo lenguaje
// visual que los otros dos banners (`.dsmp-banner`), pero es un LINK, no un
// acordeón: tiene su pantalla y nada se despliega ni corre en el Home.
// Sin sesión lleva a `/cuenta` (crear exige cuenta; entrar a una sala ajena, no).
// No se dibuja en el build nativo ni con el kill switch del cliente.
//
// TEXTO VISIBLE DEFINIDO POR EL DUEÑO, literal y sin variantes: emoji 🍿, nombre
// **"Yumpeá"** (26/09; antes se llamó "Pelimatch"), bajada "Cada uno vota en su
// teléfono. Sale una sola película." y botón "Hacé match" (antes "Matcheá"). Lo
// mismo en el hub de la cuenta (components/sala/PelimatchTile.tsx); un test fija
// las cuatro piezas.
//
// La BAJADA se ve sólo en un navegador de escritorio (28/09): la decide el CSS
// (`.sala-bajada`, ver MEDIA_ESCRITORIO en lib/sala/entrada.ts) y en la app
// Android ni se dibuja. Nombre, emoji, botón, destino y posición no cambian.
//
// 🔴 EL CAMBIO DE NOMBRE ES SÓLO VISIBLE. Las rutas (`/sala/nueva`, `/sala/[id]`),
// las tablas, las RPC y hasta el nombre de este archivo y el del tile siguen
// diciendo sala/pelimatch: renombrarlos no le cambia nada a nadie y rompería
// enlaces ya compartidos.
//
// NAVEGA EN LA MISMA PESTAÑA, como el "Ver todas" de los rieles (decisión del
// dueño, 22/09): un `Link` común, sin `target` ni ventana flotante.
export default function CrearSalaEntrada() {
  const { user, ready } = useAuth();
  if (!SALAS_VISIBLES) return null;
  const href = ready && !user ? "/cuenta" : "/sala/nueva";
  return (
    <div className="dsmp">
      <Link href={href} className="dsmp-banner sala-banner">
        <span className="dsmp-banner-ico" aria-hidden>🍿</span>
        <span className="dsmp-banner-txt">
          <span className="dsmp-banner-title">Yumpeá</span>
          {!ES_NATIVO && <span className="dsmp-banner-sub sala-bajada">Cada uno vota en su teléfono. Sale una sola película.</span>}
        </span>
        <span className="dsmp-banner-cta">
          Hacé match
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </span>
      </Link>
    </div>
  );
}
