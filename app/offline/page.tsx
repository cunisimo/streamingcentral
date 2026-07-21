import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import OfflineRetry from "./OfflineRetry";

// Página que sirve el Service Worker cuando no hay red y el documento pedido no
// está en cache. Renderiza el TopBar y el BottomNav reales para que la app siga
// sintiéndose la app, no un error del navegador.
export const metadata = { title: "Sin conexión — StreamingCentral" };

export default function Offline() {
  return (
    <>
      <TopBar />
      <main>
        <div className="wrap">
          <div className="offline-state">
            <div className="offline-ico" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 1l22 22" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            </div>
            <h3>Estás sin conexión</h3>
            <p>Esta pantalla necesita internet. Podés seguir navegando por lo que ya visitaste, o reintentar cuando vuelva la conexión.</p>
            <OfflineRetry />
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
