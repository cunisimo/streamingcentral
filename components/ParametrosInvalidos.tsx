"use client";
import Link from "next/link";

// Qué se muestra cuando `/t` o `/p` reciben parámetros que no sirven: sin
// `tipo`, con un `tipo` que no es movie/tv, o con un `id` que no es numérico.
//
// ⚠️ NO se usa `notFound()`. La documentación de Next 14 lo describe con un
// ejemplo de Server Component (`async function Profile`) y no dice que funcione
// desde un Client Component. `/t` y `/p` son clientes por necesidad —leen la
// query con `useSearchParams`—, así que en vez de apoyarse en algo no
// documentado se rinde un estado propio y explícito.
//
// Reusa `offline-state`, la misma clase del estado sin conexión: mismo lenguaje
// visual, cero CSS nuevo.
export default function ParametrosInvalidos({ volverA = "/" }: { volverA?: string }) {
  return (
    <div className="offline-state" role="status">
      <div className="offline-ico" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3>No encontramos eso</h3>
      <p>El enlace parece incompleto o mal formado.</p>
      <Link className="btn" href={volverA}>Ir al inicio</Link>
    </div>
  );
}
