"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { resolverAvatar } from "@/lib/avatares";
import { crearFrontera } from "@/lib/comunidad/frontera-cuenta";
import { alLlegarMas, conPrimeraPagina, listaVacia, pedirMas, tandaValida, trasDenuncia, trasVoto, type EstadoLista } from "@/lib/comunidad/lista-nucleo";
import { agregadosPerfil, cabeceraValida, clavePerfil, ORDEN_PERFIL, tituloPerfil, type CabeceraPerfil } from "@/lib/comunidad/perfil-nucleo";
import { BLOQUEO_HECHO } from "@/lib/comunidad/menu-nucleo";
import type { Voto } from "@/lib/comunidad/evaluacion-nucleo";
import { hrefTitulo } from "@/lib/rutas";
import EvaluacionResena from "./EvaluacionResena";
import MenuResena from "./MenuResena";
import { pedirComo, postear } from "./peticiones";

// El perfil comunitario de un autor (E6), SÓLO con sesión. Se entra desde el
// nombre de una reseña (`/u/?id=<participante>`, igual en la web y en el
// contenedor).
//
// Todo sale de /api/comunidad/perfil con la sesión de quien mira: la base
// devuelve SÓLO la proyección (nombre comunitario, avatar del catálogo,
// reseñas y "Me sirvió" recibidos, y las reseñas visibles para quien mira),
// nunca el correo ni el perfil privado. Bloqueado: "Usuario bloqueado", sin
// nombre, avatar ni reseñas. Cuenta eliminada: sin nombre ni avatar.
//
// La lista usa el núcleo de la ficha (lib/comunidad/lista-nucleo.ts): cinco
// iniciales, "Cargar más" desde el cursor confirmado y respuestas de otra
// clave descartadas. Cambiar de cuenta o de perfil monta todo de nuevo (`key`)
// y la frontera descarta lo que llegue tarde. Votar actualiza el conteo sin
// recargar ni perder las páginas.
//
// Las reseñas muestran "Película" o "Serie" con el enlace a la ficha, sin el
// nombre del título: ese dato es de TMDB y el perfil no lo pide.

export default function PerfilComunitario({ id }: { id: string }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="wrap"><p className="loading">Cargando…</p></div>;
  if (!user) {
    return (
      <div className="wrap cm cm-perfil">
        <h1>Perfil de la comunidad</h1>
        <p className="cm-sub">Los perfiles de la comunidad se ven con sesión.</p>
        <Link className="btn" href="/cuenta">Ingresar</Link>
      </div>
    );
  }
  return <PerfilConSesion key={`${user.id}|${id}`} uid={user.id} id={id} />;
}

function PerfilConSesion({ uid, id }: { uid: string; id: string }) {
  const clave = clavePerfil(uid, id);
  const [cab, setCab] = useState<CabeceraPerfil | null>(null);
  const [apagado, setApagado] = useState(false);
  const [error, setError] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [lista, setLista] = useState<EstadoLista>(() => listaVacia(clave));
  const listaRef = useRef(lista);
  listaRef.current = lista;

  const frontera = useMemo(() => crearFrontera(uid), [uid]);
  useEffect(() => { frontera.abrir(); return () => frontera.cerrar(); }, [frontera]);
  const enviar = useCallback((ruta: string, cuerpo: Record<string, unknown>) => postear(uid, ruta, cuerpo), [uid]);
  const ruta = useCallback((cursor: string | null) =>
    `/api/comunidad/perfil?id=${id}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, [id]);

  const cargar = useCallback(async () => {
    if (!frontera.vigente()) return;
    const g = frontera.carga();
    const r = await pedirComo(uid, ruta(null));
    if (!frontera.vigente(g)) return;
    const j = r?.j as { activo?: unknown } | null | undefined;
    if (r?.status === 200 && j && j.activo === false) { setError(false); setApagado(true); return; }
    const c = r?.status === 200 ? cabeceraValida(r.j) : null;
    const t = c?.estado === "activo" ? tandaValida(r?.j, ORDEN_PERFIL) : null;
    if (!c || (c.estado === "activo" && !t)) { setError(true); return; }
    setError(false);
    setApagado(false);
    setCab(c);
    setLista((l) => (t ? conPrimeraPagina(l.clave === clave ? l : listaVacia(clave), t) : listaVacia(clave)));
  }, [frontera, uid, ruta, clave]);

  useEffect(() => { void cargar(); }, [cargar]);

  const cargarMas = useCallback(async () => {
    if (!frontera.vigente()) return;
    const p = pedirMas(listaRef.current);
    if (!p) return;
    listaRef.current = p.estado;
    setLista(p.estado);
    const r = await pedirComo(uid, ruta(p.pedido.cursor));
    if (!frontera.vigente()) return;
    const t = r?.status === 200 ? tandaValida(r.j, ORDEN_PERFIL) : null;
    setLista((l) => alLlegarMas(l, p.pedido.n, p.pedido.clave, t));
  }, [frontera, uid, ruta]);

  const votar = useCallback(async (versionId: number, voto: Voto | "retirar") => {
    const r = await enviar("/api/comunidad/votos", { version_id: versionId, voto });
    if (frontera.vigente() && r !== "sin-confirmar") setLista((l) => trasVoto(l, versionId, r.resultado, voto));
    return r;
  }, [enviar, frontera]);

  if (apagado) return <div className="wrap cm cm-perfil"><p className="cm-sub">La comunidad no está disponible.</p></div>;
  if (!cab) {
    return (
      <div className="wrap cm cm-perfil">
        {error
          ? <p className="cm-msg error" role="alert">No pudimos cargar el perfil. <button className="cm-link" onClick={() => void cargar()}>Reintentar</button></p>
          : <p className="loading" role="status">Cargando…</p>}
      </div>
    );
  }

  const avatar = cab.estado === "activo" ? resolverAvatar({ avatar_seed: cab.avatar }) : null;
  return (
    <div className="wrap cm cm-perfil">
      <div className="cm-perfil-cab">
        {avatar && <img className="cm-perfil-avatar" src={avatar.src} alt="" width={64} height={64} />}
        <div>
          <h1>{tituloPerfil(cab)}</h1>
          {cab.estado === "activo" && <p className="cm-sub">{agregadosPerfil(cab)}</p>}
        </div>
      </div>
      {error && (
        <p className="cm-msg error" role="alert">No pudimos actualizar el perfil. <button className="cm-link" onClick={() => void cargar()}>Reintentar</button></p>
      )}
      {cab.estado === "activo" && cab.propio && (
        <p className="cm-sub">Este es tu perfil comunitario. <Link className="cm-link" href="/cuenta/perfil">Cambiar mi nombre</Link></p>
      )}
      {cab.estado === "bloqueado" && (
        <p className="cm-sub">Bloqueaste a este usuario: no ves su perfil ni sus reseñas. <Link className="cm-link" href="/cuenta/bloqueados">Gestionar bloqueados</Link></p>
      )}
      {cab.estado === "eliminada" && <p className="cm-sub">Esta cuenta ya no existe.</p>}
      {bloqueado && <p className="cm-msg exito" role="status">{BLOQUEO_HECHO}</p>}

      {cab.estado === "activo" && (
        <div className="cm-lista">
          {lista.items.map((o) => (
            <article key={o.resena_id} className="review usuario">
              <div className="cm-cab">
                <div className="badge">
                  {o.titulo ? <Link href={hrefTitulo(o.titulo.tipo, o.titulo.tmdbId)}>{o.titulo.tipo === "movie" ? "Película" : "Serie"} · ver ficha</Link> : "Reseña"}
                  {o.editada ? " · editada" : ""}
                </div>
                {!cab.propio && (
                  <MenuResena versionId={o.version_id} denunciada={o.denunciada} enviar={enviar}
                    alDenunciar={() => setLista((l) => trasDenuncia(l, o.version_id))}
                    alBloquear={() => { setBloqueado(true); void cargar(); }} />
                )}
              </div>
              <p>{o.texto}</p>
              <EvaluacionResena versionId={o.version_id} utiles={o.utiles} total={o.total} miVoto={o.mi_voto} esPropia={cab.propio} votar={votar} />
            </article>
          ))}
          {lista.pedido > 0 && lista.items.length === 0 && !lista.hayMas && <p className="cm-sub">Todavía no hay reseñas para ver.</p>}
          {lista.errorMas && (
            <p className="cm-msg error" role="alert">
              No pudimos cargar más reseñas. Las que ves siguen acá.{" "}
              <button className="cm-link" onClick={() => void cargarMas()}>Reintentar</button>
            </p>
          )}
          {lista.hayMas && !lista.errorMas && (
            <button type="button" className="btn ghost cm-mas" aria-disabled={lista.cargandoMas} onClick={() => { if (!lista.cargandoMas) void cargarMas(); }}>
              {lista.cargandoMas ? "Cargando…" : "Cargar más"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
