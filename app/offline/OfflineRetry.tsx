"use client";

// Botón cliente aislado: la página /offline es server component, pero el botón
// necesita recargar. location.reload() vuelve a pedir la ruta original; si ya
// hay conexión, el Network First del SW la sirve fresca.
export default function OfflineRetry() {
  return (
    <button className="btn" onClick={() => location.reload()}>Reintentar</button>
  );
}
