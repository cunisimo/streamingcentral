"use client";
import Link from "next/link";
import { useAuth } from "./AuthContext";
import UserShelf from "./UserShelf";
import Avatar from "./avatar/Avatar";
import { itemRefs, likedRefs, historyRefs } from "@/lib/userdata";

export default function UserHub() {
  const { user, profile } = useAuth();
  const nombre = profile?.display_name || "vos";

  return (
    <div className="wrap">
      <div className="hub-head">
        <Avatar seed={profile?.avatar_seed || user?.id} style={profile?.avatar_style} size={64} className="hub-av" />
        <div>
          <h1 className="hub-hi">Hola, {nombre}</h1>
          <div className="hub-links">
            <Link href="/cuenta/perfil" className="hub-ico" aria-label="Editar perfil" title="Editar perfil">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </Link>
            <Link href="/cuenta/configuracion" className="hub-ico" aria-label="Configuración" title="Configuración">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      <UserShelf
        title="Mi lista" href="/cuenta/lista"
        load={async () => (await itemRefs("list")).slice(0, 20)}
        empty="Todavía no guardaste nada — tocá “Mi lista” en cualquier ficha."
      />
      <UserShelf title="Me gustaron" href="/cuenta/gustaron" load={async () => (await likedRefs()).slice(0, 20)} />
      <UserShelf title="Vistos recientemente" href="/cuenta/vistos" load={() => historyRefs(20)} />

      <div className="hub-tiles">
        <div className="hub-tile off"><span className="lock">🔒</span><span>Mis amigos</span><small>Próximamente</small></div>
        <div className="hub-tile off"><span className="lock">🔒</span><span>Mis emblemas</span><small>Próximamente</small></div>
      </div>
    </div>
  );
}
