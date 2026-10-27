"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { crearFrontera } from "@/lib/comunidad/frontera-cuenta";
import { mensajeNombre, NOMBRE_MAX, normalizarNombre, problemaNombre, type TonoNombre } from "@/lib/comunidad/nombre";
import { cabeceraValida, type CabeceraPerfil } from "@/lib/comunidad/perfil-nucleo";
import { hrefPerfil } from "@/lib/rutas";
import { pedirComo, postear } from "./peticiones";

// El nombre comunitario en "Mi perfil" (E6). Es OTRO campo que "Nombre para
// mostrar": aquél es el saludo privado (`profiles.display_name`) y no se ve
// en la comunidad; éste es el que acompaña las reseñas. Nunca se copia uno en
// el otro ni se propone el del perfil privado.
//
// El aviso previo (forma y largo) no decide nada: la ruta corre las reglas de
// E1 y la base valida de nuevo. El motivo de un rechazo se muestra tal cual.
// Montado con `key` por cuenta: una respuesta de la cuenta anterior no pisa
// a la actual (frontera de E3b).

export default function NombreComunitario({ uid }: { uid: string }) {
  const frontera = useMemo(() => crearFrontera(uid), [uid]);
  useEffect(() => { frontera.abrir(); return () => frontera.cerrar(); }, [frontera]);
  const [cab, setCab] = useState<CabeceraPerfil | null>(null);
  const [apagado, setApagado] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tono: TonoNombre; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    if (!frontera.vigente()) return;
    const g = frontera.carga();
    const r = await pedirComo(uid, "/api/comunidad/perfil?yo=1");
    if (!frontera.vigente(g)) return;
    if (r?.status === 200 && (r.j as { activo?: unknown } | null)?.activo === false) { setApagado(true); return; }
    const c = r?.status === 200 ? cabeceraValida(r.j) : null;
    if (!c) { setErrorCarga(true); return; }
    setErrorCarga(false);
    setCab(c);
  }, [frontera, uid]);
  useEffect(() => { void cargar(); }, [cargar]);

  const actual = cab?.estado === "activo" ? cab.nombre : null;
  const normalizado = normalizarNombre(nombre);
  const aviso = nombre.trim() === "" ? null : problemaNombre(normalizado);

  async function guardar() {
    if (enviando || aviso || normalizado === "") return;
    setEnviando(true);
    setMsg(null);
    const r = await postear(uid, "/api/comunidad/nombre", { nombre });
    if (!frontera.vigente()) return;
    setEnviando(false);
    setMsg(mensajeNombre(r));
    if (r !== "sin-confirmar" && (r.resultado === "nombre_cambiado" || r.resultado === "sin_cambios")) {
      setNombre("");
      void cargar();
    }
  }

  if (apagado) return null;
  return (
    <section className="cm cm-nombre" aria-labelledby="cm-nombre-t">
      <h2 id="cm-nombre-t" className="cm-h">Nombre en la comunidad</h2>
      <p className="cm-sub">
        Es el que acompaña tus reseñas y se ve en tu perfil comunitario. No es tu nombre para mostrar ni tu correo.
      </p>
      {errorCarga && (
        <p className="cm-msg error" role="alert">No pudimos cargar tu nombre comunitario. <button className="cm-link" onClick={() => void cargar()}>Reintentar</button></p>
      )}
      {cab && (
        <p className="cm-sub">
          {cab.estado === "sin_participante"
            ? "Para elegirlo, primero aceptá los términos de la comunidad desde las reseñas de cualquier ficha."
            : actual ? <>Ahora: <strong>{actual}</strong>.</> : "Todavía no elegiste uno."}
          {cab.estado === "activo" && cab.id && <> <Link className="cm-link" href={hrefPerfil(cab.id)}>Ver mi perfil</Link></>}
        </p>
      )}
      {cab && cab.estado === "activo" && (
        <>
          <div className="field">
            <label htmlFor="cm-nombre-in">{actual ? "Nuevo nombre comunitario" : "Nombre comunitario"}</label>
            <input id="cm-nombre-in" type="text" value={nombre} maxLength={NOMBRE_MAX * 4} autoComplete="off" disabled={enviando}
              onChange={(e) => { setNombre(e.target.value); setMsg(null); }} aria-describedby="cm-nombre-msg" />
          </div>
          <div id="cm-nombre-msg">
            {aviso && <p className="cm-msg rechazo" role="alert">{aviso}</p>}
            {msg && <p className={`cm-msg ${msg.tono}`} role={msg.tono === "exito" || msg.tono === "info" ? "status" : "alert"}>{msg.texto}</p>}
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => void guardar()} disabled={enviando || !!aviso || normalizado === ""}>
              {enviando ? "Guardando…" : "Guardar nombre comunitario"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
