"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LENTA_MS, crearTraza, type Informe } from "@/lib/traza-avatares";

// PANEL DE DIAGNÓSTICO TEMPORAL — issue #15.
//
// ⚠️ NO ENTRA EN EL MERGE FINAL. Vive en la rama `diag/panel` y se borra con
// ella. Existe porque Chrome bloquea el pegado en la consola por autoprotección
// —y esa protección no se desactiva—, así que la traza se maneja con botones.
//
// Se muestra SÓLO con `?diagnostico=avatares` en la URL. Sin ese parámetro este
// componente ni se monta: la página se comporta exactamente como en producción.
//
// LO QUE NO HACE: no borra ni modifica cachés, no guarda ningún avatar, no hace
// ninguna petición propia y no manda la traza a ningún lado. Copia al
// portapapeles únicamente cuando se aprieta el botón.
export default function PanelTraza() {
  const traza = useMemo(() => crearTraza(), []);
  const [estado, setEstado] = useState<"inicial" | "preparado" | "midiendo" | "listo">("inicial");
  const [ultimo, setUltimo] = useState<Informe | null>(null);
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState("");
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; traza.detener(); }, [traza]);

  const preparar = useCallback(async () => {
    setAviso(""); setCopiado("");
    try {
      const c = await traza.preparar();
      setEstado("preparado");
      setAviso(`Listo. ${c.avataresYaEnCache} avatares ya en caché · SW: ${c.sw}`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "no se pudo preparar");
    }
  }, [traza]);

  const finalizar = useCallback(async () => {
    setEstado("midiendo"); setAviso(""); setCopiado("");
    const r = await traza.finalizar();
    if (!montado.current) return;
    setUltimo(r);
    setEstado("listo");
  }, [traza]);

  const copiar = useCallback(async () => {
    const texto = traza.volcar();
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(`Copiado: ${(texto.length / 1024).toFixed(1)} KB`);
    } catch {
      // Sin permiso de portapapeles: se deja seleccionable en un textarea.
      setCopiado("no se pudo copiar; usá el cuadro de abajo");
    }
  }, [traza]);

  const filasLentas = ultimo?.filas.filter(
    (f) => (f.cargaMs ?? 0) > LENTA_MS || (f.esperaInicioMs ?? 0) > LENTA_MS
      || (f.durMs ?? 0) > LENTA_MS || (f.decodeMs ?? 0) > LENTA_MS || (f.listaMs ?? 0) > LENTA_MS,
  ) ?? [];

  return (
    <aside className="diagp" aria-label="Diagnóstico de avatares">
      <div className="diagp-tit">
        Diagnóstico temporal · avatares
        <span className="diagp-badge">issue #15</span>
      </div>

      <div className="diagp-btns">
        <button type="button" className="btn" onClick={preparar} disabled={estado === "midiendo"}>
          1. Preparar apertura
        </button>
        <button
          type="button" className="btn ghost" onClick={finalizar}
          disabled={estado === "inicial" || estado === "midiendo"}
        >
          {estado === "midiendo" ? "Midiendo…" : "2. Finalizar medición"}
        </button>
      </div>

      <p className="diagp-paso">
        {estado === "inicial" && "Tocá \"Preparar apertura\" con el selector cerrado."}
        {estado === "preparado" && "Ahora abrí \"Cambiar avatar\", esperá a que se vean los 31, cerralo y tocá \"Finalizar\"."}
        {estado === "midiendo" && "Esperando a que carguen y decodifiquen…"}
        {estado === "listo" && "Para otra vuelta, volvé a \"Preparar apertura\"."}
      </p>

      {aviso && <p className="diagp-aviso">{aviso}</p>}

      {ultimo && (
        <>
          <div className={`diagp-veredicto ${ultimo.lentas ? "mal" : "bien"}`}>
            Apertura {ultimo.apertura} · {ultimo.lentas
              ? `${ultimo.lentas} ${ultimo.lentas === 1 ? "imagen tardó" : "imágenes tardaron"} más de 1 s`
              : "ninguna imagen pasó de 1 s"}
          </div>

          <table className="diagp-tabla">
            <tbody>
              <tr><th>avatares</th><td>{ultimo.avatares} · ok {ultimo.ok}
                {ultimo.fallos > 0 && ` · fallos ${ultimo.fallos}`}
                {ultimo.sinIniciar > 0 && ` · sin iniciar ${ultimo.sinIniciar}`}
                {ultimo.conReintento > 0 && ` · con reintento ${ultimo.conReintento}`}</td></tr>
              <tr><th>maxEsperaInicio</th><td>{ultimo.maxEsperaInicio} ms</td></tr>
              <tr><th>maxCarga</th><td>{ultimo.maxCarga} ms</td></tr>
              <tr><th>maxDecode</th><td>{ultimo.maxDecode} ms</td></tr>
              <tr><th>maxLista</th><td>{ultimo.maxLista} ms</td></tr>
              <tr><th>maxDur</th><td>{ultimo.maxDur} ms</td></tr>
              <tr><th>bytes</th><td>{(ultimo.bytesTransferidos / 1024).toFixed(1)} KB · por SW {ultimo.porSW}</td></tr>
              {/* Cronología, para leer lo de arriba. NO es criterio. */}
              <tr><th>humano</th><td>{ultimo.humanoMs} ms hasta abrir</td></tr>
            </tbody>
          </table>

          {filasLentas.length > 0 && (
            <ul className="diagp-lentas">
              {filasLentas.slice(0, 6).map((f) => (
                <li key={f.url}>
                  <b>{f.archivo}</b> · carga {f.cargaMs} · espera {f.esperaInicioMs}
                  {" · "}dur {f.durMs} · decode {f.decodeMs}
                  {f.porSW ? " · por SW" : ""} · caché antes: {f.enCacheAntes === "NO" ? "no" : "sí"}
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="btn" onClick={copiar}>Copiar informe completo</button>
          {copiado && <p className="diagp-aviso">{copiado}</p>}
          <details className="diagp-crudo">
            <summary>o copialo a mano</summary>
            <textarea readOnly rows={6} value={traza.volcar()} onFocus={(e) => e.currentTarget.select()} />
          </details>
        </>
      )}
    </aside>
  );
}
