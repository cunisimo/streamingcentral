"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import { SALAS_VISIBLES } from "@/lib/sala/entrada";
import { atributosEnlace, contextoDelNavegador } from "@/lib/sala/apertura";
import { ES_NATIVO } from "@/lib/plataforma";

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
// ABRE EN PESTAÑA NUEVA y el Home queda en la original (`lib/sala/apertura.ts`).
// El `target` se decide DESPUÉS de montar: en el HTML del servidor no viaja,
// así que no hay hydration mismatch, y en una PWA instalada o en el contenedor
// no se usa —ahí `_blank` expulsaría al navegador, que es otro contexto de
// almacenamiento—.
export default function CrearSalaEntrada() {
  const { user, ready } = useAuth();
  const [attrs, setAttrs] = useState<{ target?: "_blank"; rel?: string }>({});
  useEffect(() => { setAttrs(atributosEnlace(contextoDelNavegador(ES_NATIVO))); }, []);
  if (!SALAS_VISIBLES) return null;
  const href = ready && !user ? "/cuenta" : "/sala/nueva";
  return (
    <div className="dsmp">
      <Link href={href} className="dsmp-banner sala-banner" {...attrs}>
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
