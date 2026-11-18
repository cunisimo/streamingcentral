"use client";
import { useEffect, useState } from "react";
import TopEditor from "@/components/admin/top/TopEditor";
import { BancoTop, datosIniciales, type DatosBanco } from "@/lib/banco-top";

// Panel de control del banco local: demora, fallos simulados y "otra pestaña".
// La base en memoria se guarda en localStorage para que recargar la página
// muestre lo guardado (que es lo que se quiere comprobar al recargar).
const CLAVE = "yump:banco-top:v1";

function leerDatos(): DatosBanco {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (raw) return JSON.parse(raw) as DatosBanco;
  } catch { /* sin storage: arranca de cero */ }
  return datosIniciales();
}

export default function BancoTopCliente() {
  const [banco, setBanco] = useState<BancoTop | null>(null);
  const [, setTick] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const b = new BancoTop(
      leerDatos(),
      (d) => { try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch { /* sin storage */ } },
      () => setTick((t) => t + 1),
    );
    setBanco(b);
  }, [version]);

  if (!banco) return <div className="admin"><p className="loading">Preparando el banco…</p></div>;
  const c = banco.controles;
  const cambiar = (p: Partial<typeof c>) => { Object.assign(banco.controles, p); setTick((t) => t + 1); };
  const borradorNetflix = banco.datos.filas.find((f) => f.estado === "borrador" && f.plataforma === "n" && f.tipo === "movie");

  const aviso = (
    <details className="tde-banco" open>
      <summary>Banco local: base en memoria, no es Producción</summary>
      <div className="tde-banco-controles">
        <label>
          Demora de cada guardado: <strong>{c.demoraMs} ms</strong>
          <input type="range" min={0} max={3000} step={100} value={c.demoraMs}
            onChange={(e) => cambiar({ demoraMs: Number(e.target.value) })} />
        </label>
        <button type="button" className="btn ghost" onClick={() => cambiar({ fallarProximas: c.fallarProximas + 1 })}>
          Fallar el próximo guardado{c.fallarProximas ? ` (${c.fallarProximas})` : ""}
        </button>
        <label className="tde-banco-check">
          <input type="checkbox" checked={c.fallarTodas} onChange={(e) => cambiar({ fallarTodas: e.target.checked })} />
          Fallar todos los guardados
        </label>
        <button type="button" className="btn ghost" disabled={!borradorNetflix}
          onClick={() => borradorNetflix && banco.cambioExterno(borradorNetflix.id)}>
          Simular cambio desde otra pestaña (Netflix · Películas)
        </button>
        <button type="button" className="btn ghost" onClick={() => {
          try { localStorage.removeItem(CLAVE); } catch { /* sin storage */ }
          setVersion((v) => v + 1);
        }}>
          Reiniciar el banco
        </button>
      </div>
      <p className="admin-nota">
        Búsqueda con pósters generados (sin red). Probá «drácula» o «it». Recargar la página conserva lo guardado.
      </p>
      <ol className="tde-banco-registro" aria-label="Lo que recibió el servidor del banco">
        {banco.registro.slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}
      </ol>
    </details>
  );

  return <TopEditor key={version} transporte={banco} aviso={aviso} />;
}
