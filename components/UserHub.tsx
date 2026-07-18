"use client";
import Link from "next/link";
import { useAuth } from "./AuthContext";
import UserShelf from "./UserShelf";
import { avatarSvg } from "@/lib/avatar";
import { itemRefs, likedRefs, historyRefs } from "@/lib/userdata";

export default function UserHub() {
  const { user, profile } = useAuth();
  const seed = profile?.avatar_seed || user?.id || "";
  const nombre = profile?.display_name || "vos";

  return (
    <div className="wrap">
      <div className="hub-head">
        <img className="hub-av" src={avatarSvg(seed)} alt="" />
        <div>
          <h1 className="hub-hi">Hola, {nombre}</h1>
          <Link href="/cuenta/perfil" className="hub-edit">Editar perfil ›</Link>
        </div>
      </div>

      <UserShelf
        title="Mi lista" href="/cuenta/lista"
        load={() => itemRefs("list")}
        empty="Todavía no guardaste nada — tocá “Mi lista” en cualquier ficha."
      />
      <UserShelf title="Me gustaron" href="/cuenta/gustaron" load={likedRefs} />
      <UserShelf title="Vistos recientemente" href="/cuenta/vistos" load={() => historyRefs(20)} />

      <div className="hub-tiles">
        <div className="hub-tile off"><span className="lock">🔒</span><span>Mis amigos</span><small>Próximamente</small></div>
        <div className="hub-tile off"><span className="lock">🔒</span><span>Mis emblemas</span><small>Próximamente</small></div>
      </div>
    </div>
  );
}
