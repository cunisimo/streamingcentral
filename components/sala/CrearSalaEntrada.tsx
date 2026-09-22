"use client";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import { SALAS_VISIBLES } from "@/lib/sala/entrada";

// La entrada a **Pelimatch** en el Home, debajo de "Ruleta Yump". Mismo lenguaje
// visual que los otros dos banners (`.dsmp-banner`), pero es un LINK, no un
// acordeón: Pelimatch tiene su pantalla y nada se despliega ni corre en el Home.
// Sin sesión lleva a `/cuenta` (crear exige cuenta; entrar a una sala ajena, no).
// No se dibuja en el build nativo ni con el kill switch del cliente.
//
// NOMBRE VISIBLE: "Pelimatch" (decisión del dueño, 22/09). La bajada sigue
// siendo PROVISORIA — no inventar la definitiva. Las rutas técnicas no cambian:
// `/sala/nueva` y `/sala/[id]`.
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
          <span className="dsmp-banner-title">Pelimatch</span>
          <span className="dsmp-banner-sub">Armá una sala: todos votan las mismas películas y ven en cuál coinciden.</span>
        </span>
        <span className="dsmp-banner-cta">
          Crear sala
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </span>
      </Link>
    </div>
  );
}
