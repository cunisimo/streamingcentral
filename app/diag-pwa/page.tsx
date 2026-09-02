"use client";
import { useCallback, useEffect, useState } from "react";

// Diagnóstico de la barra de estado en la PWA instalada. TEMPORAL.
//
// ============================================================================
// PARA QUÉ ESTÁ
// ============================================================================
// La franja blanca de arriba no se puede reproducir desde una máquina de
// escritorio: emular un inset de safe-area pinta un div HTML, no la barra de
// estado del sistema. Lo único que decide es un teléfono con la PWA instalada.
//
// Medido en escritorio, ningún valor del DOM puede producir blanco: con el
// sistema en claro y la app en oscuro, las metas ya están en el color oscuro
// desde el primer instante. El único color casi-blanco de todo el circuito es
// `#FAFAFD`, y vive en el MANIFEST (`theme_color` y `background_color`).
//
// 🔴 EL EXPERIMENTO QUE DECIDE es el botón rojo. Si al tocarlo la barra real se
// pone roja, Android está leyendo las metas y el arreglo por metas sirve. Si se
// queda como está, manda el manifest y hay que arreglarlo ahí — y el manifest
// no admite variante oscura, así que sería otra solución.
//
// ⚠️ BORRAR ESTA RUTA cuando el diagnóstico termine. No está enlazada desde
// ningún lado y no lee ni escribe datos: sólo informa lo que ya está en el
// dispositivo.

interface Fila { k: string; v: string }

export default function DiagPwa() {
  const [datos, setDatos] = useState<Fila[]>([]);
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [nota, setNota] = useState("");

  const leer = useCallback(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const aplica = metas.filter((m) => !m.media || matchMedia(m.media).matches);
    const f: Fila[] = [
      { k: "User agent", v: navigator.userAgent },
      { k: "¿PWA instalada?", v: String(matchMedia("(display-mode: standalone)").matches) },
      { k: "Tema del SISTEMA", v: matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro" },
      { k: "Tema de la APP", v: document.documentElement.getAttribute("data-theme") ?? "(sin fijar)" },
      { k: "Guardado en sc:theme", v: (() => { try { return localStorage.getItem("sc:theme") ?? "(nada)"; } catch { return "(bloqueado)"; } })() },
      { k: "--bg real", v: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() },
      { k: "Cantidad de metas", v: String(metas.length) },
      ...metas.map((m, i) => ({ k: `meta ${i + 1}`, v: `${m.media || "(sin media)"} → ${m.content}` })),
      { k: "La que APLICA ahora", v: aplica.map((m) => m.content).join(", ") || "(ninguna)" },
    ];
    setDatos(f);
  }, []);

  useEffect(() => {
    leer();
    fetch("/manifest.webmanifest").then((r) => r.json()).then(setManifest).catch(() => setManifest(null));
  }, [leer]);

  // El experimento decisivo: un color imposible de confundir.
  const pintar = (color: string, etiqueta: string) => {
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((m) => { m.content = color; });
    setNota(`Metas puestas en ${color} (${etiqueta}). Mirá la barra de arriba SIN cerrar la app.`);
    leer();
  };

  const cambiarTema = () => {
    const actual = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", actual);
    try { localStorage.setItem("sc:theme", actual); } catch { /* noop */ }
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((m) => { m.content = bg; });
    setNota(`Tema cambiado a ${actual} y metas puestas en ${bg}. ¿Cambió la barra real?`);
    leer();
  };

  const S: React.CSSProperties = { fontFamily: "system-ui", padding: 16, lineHeight: 1.5 };
  const btn: React.CSSProperties = {
    display: "block", width: "100%", padding: "14px 12px", margin: "8px 0",
    fontSize: 15, fontWeight: 600, borderRadius: 10, border: "1px solid #8886", cursor: "pointer",
  };

  return (
    <main style={S}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Diagnóstico de la barra de estado</h1>
      <p style={{ fontSize: 13, opacity: .7, margin: "0 0 16px" }}>
        Abrí esto <strong>desde la PWA instalada</strong>, no desde Chrome. Sacale una captura
        completa: tiene que verse la barra del sistema arriba.
      </p>

      <h2 style={{ fontSize: 16 }}>1. Qué dice el dispositivo</h2>
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <tbody>
          {datos.map((d) => (
            <tr key={d.k} style={{ borderTop: "1px solid #8884" }}>
              <td style={{ padding: "6px 8px 6px 0", opacity: .7, whiteSpace: "nowrap", verticalAlign: "top" }}>{d.k}</td>
              <td style={{ padding: "6px 0", wordBreak: "break-word", fontFamily: "monospace" }}>{d.v}</td>
            </tr>
          ))}
          <tr style={{ borderTop: "1px solid #8884" }}>
            <td style={{ padding: "6px 8px 6px 0", opacity: .7, verticalAlign: "top" }}>manifest</td>
            <td style={{ padding: "6px 0", fontFamily: "monospace" }}>
              {manifest
                ? `theme_color = ${String(manifest.theme_color)} · background_color = ${String(manifest.background_color)}`
                : "(no se pudo leer)"}
            </td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: 16, marginTop: 22 }}>2. Compará la barra real con estos</h2>
      <p style={{ fontSize: 13, opacity: .75, margin: "0 0 8px" }}>
        ¿A cuál se parece la franja de arriba de tu captura?
      </p>
      {[
        ["#FAFAFD", "manifest theme_color / meta clara / --bg claro"],
        ["#0F0E13", "meta oscura / --bg oscuro"],
        ["#F5F5F2", "el viejo BAR.light de ThemeContext"],
        ["#16171B", "el viejo BAR.dark de ThemeContext"],
      ].map(([c, q]) => (
        <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0" }}>
          <span style={{ width: 54, height: 32, background: c, border: "1px solid #8886", borderRadius: 6, flex: "0 0 auto" }} />
          <span style={{ fontFamily: "monospace", fontSize: 13 }}>{c}</span>
          <span style={{ fontSize: 12, opacity: .7 }}>{q}</span>
        </div>
      ))}

      <h2 style={{ fontSize: 16, marginTop: 22 }}>3. El experimento que decide</h2>
      <p style={{ fontSize: 13, opacity: .75, margin: "0 0 8px" }}>
        Tocá el botón rojo y mirá la barra del sistema <strong>sin cerrar la app</strong>.
      </p>
      <button type="button" style={{ ...btn, background: "#E5484D", color: "#fff" }}
        onClick={() => pintar("#E5484D", "rojo de prueba")}>
        Pintar la barra de ROJO
      </button>
      <p style={{ fontSize: 12.5, opacity: .8, margin: "4px 0 14px" }}>
        <strong>Si la barra se pone roja</strong>, Android lee las metas y el arreglo por metas sirve.<br />
        <strong>Si NO cambia</strong>, manda el <code>theme_color</code> del manifest y hay que arreglarlo ahí.
      </p>

      <button type="button" style={btn} onClick={cambiarTema}>
        Cambiar tema claro/oscuro (y poner la barra en --bg)
      </button>
      <button type="button" style={btn} onClick={leer}>Volver a leer los valores</button>

      {nota && (
        <p style={{ fontSize: 13, padding: 10, border: "1px solid #8886", borderRadius: 8 }}>{nota}</p>
      )}

      <h2 style={{ fontSize: 16, marginTop: 22 }}>4. Arranque en frío</h2>
      <p style={{ fontSize: 13, opacity: .75 }}>
        Cerrá la app del todo (sacala de recientes), volvé a abrirla desde el ícono y entrá acá
        otra vez. Sacá otra captura: interesa el color de la barra en el primer segundo.
      </p>
    </main>
  );
}
