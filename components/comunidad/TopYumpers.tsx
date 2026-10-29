"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { resolverAvatar } from "@/lib/avatares";
import { crearFrontera } from "@/lib/comunidad/frontera-cuenta";
import { etiquetaMes, nombreFila, textoPuntos, topValido, type TopYumpers as Top } from "@/lib/comunidad/top-yumpers-nucleo";
import { hrefPerfil } from "@/lib/rutas";
import { pedirComo } from "./peticiones";

// El Top Yumpers mensual (E7), dentro de /top y SÓLO con sesión.
//
// Todo sale de /api/comunidad/top-yumpers con la sesión de quien mira: la
// base devuelve el último mes cerrado (corte argentino) ya consolidado, con
// la posición, los puntos y, por autor, el nombre comunitario y el avatar del
// catálogo (E6). Una cuenta eliminada se ve como «Cuenta eliminada» y un
// autor bloqueado como «Usuario bloqueado», sin enlace, nombre ni avatar.
//
// 🔴 NO comparte nada con el Top de plataformas: ni `useApi`, ni /api/top,
// ni `sessionStorage` (sin snapshot de vuelta: se pide de nuevo). Montado con
// `key` por cuenta y con la frontera de E3b: una respuesta de la cuenta
// anterior o de una carga superada no se aplica.

export default function TopYumpers() {
  const { user, ready } = useAuth();
  if (!ready) return <p className="loading" role="status">Cargando…</p>;
  if (!user) {
    return (
      <div className="cm cm-top-invita">
        <p className="cm-sub">El Top Yumpers es para quienes tienen cuenta: ingresá para ver el ranking del mes.</p>
        <Link className="btn" href="/cuenta">Ingresar</Link>
      </div>
    );
  }
  return <TopConSesion key={user.id} uid={user.id} />;
}

type Estado = { tipo: "cargando" } | { tipo: "error" } | { tipo: "apagado" } | { tipo: "listo"; top: Top };

function TopConSesion({ uid }: { uid: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const frontera = useMemo(() => crearFrontera(uid), [uid]);
  useEffect(() => { frontera.abrir(); return () => frontera.cerrar(); }, [frontera]);

  const cargar = useCallback(async () => {
    if (!frontera.vigente()) return;
    const g = frontera.carga();
    setEstado((e) => (e.tipo === "listo" ? e : { tipo: "cargando" }));
    const r = await pedirComo(uid, "/api/comunidad/top-yumpers");
    if (!frontera.vigente(g)) return;
    if (r?.status === 200 && (r.j as { activo?: unknown } | null)?.activo === false) { setEstado({ tipo: "apagado" }); return; }
    const top = r?.status === 200 ? topValido(r.j) : null;
    setEstado(top ? { tipo: "listo", top } : { tipo: "error" });
  }, [frontera, uid]);
  useEffect(() => { void cargar(); }, [cargar]);

  if (estado.tipo === "cargando") return <p className="loading" role="status">Cargando el Top Yumpers…</p>;
  if (estado.tipo === "apagado") return <p className="cm-sub" role="status">El Top Yumpers no está disponible.</p>;
  if (estado.tipo === "error") {
    return (
      <p className="empty-note home-retry" role="alert">
        No pudimos cargar el Top Yumpers.{" "}
        <button className="up-retry" onClick={() => void cargar()}>Reintentar</button>
      </p>
    );
  }
  const { top } = estado;
  const mes = etiquetaMes(top.mes);
  return (
    <section className="cm cm-top" aria-labelledby="cm-top-t">
      <h2 id="cm-top-t" className="top-group">Ranking de {mes}</h2>
      <p className="cm-sub">
        Un punto por cada persona distinta a la que le sirvió alguna reseña tuya en el mes. Publicar no suma y los «No me sirvió» no restan.
      </p>
      {top.mia && <p className="cm-msg info" role="status">Tu posición en {mes}: {top.mia.posicion}.º con {textoPuntos(top.mia.puntos)}.</p>}
      {top.filas.length === 0 ? (
        <p className="cm-sub">Todavía no hay Yumpers en el ranking de {mes}.</p>
      ) : (
        <ol className="cm-top-lista">
          {top.filas.map((f, i) => {
            const avatar = f.estado === "activo" ? resolverAvatar({ avatar_seed: f.avatar }) : null;
            return (
              <li key={`${f.posicion}-${f.id ?? `x${i}`}`} className={`cm-top-fila${f.propio ? " propia" : ""}`}>
                <span className="cm-top-pos" aria-label={`Posición ${f.posicion}`}>{f.posicion}</span>
                {avatar ? <img className="cm-top-avatar" src={avatar.src} alt="" width={36} height={36} /> : <span className="cm-top-avatar vacio" aria-hidden="true" />}
                <span className="cm-top-nombre">
                  {f.estado === "activo" && f.id ? <Link href={hrefPerfil(f.id)}>{nombreFila(f)}</Link> : nombreFila(f)}
                  {f.propio ? " (vos)" : ""}
                </span>
                <span className="cm-top-puntos">{textoPuntos(f.puntos)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
