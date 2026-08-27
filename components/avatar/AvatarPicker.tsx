"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/AuthContext";
import { resolverAvatar } from "@/lib/avatares";
import Avatar from "./Avatar";

// El modal entra por `dynamic` y no por un import normal a propósito: es el
// único que recorre el catálogo entero y monta 31 `<img>`. Con un import normal,
// ese código viajaba en el bundle de /cuenta/perfil aunque nadie abriera el
// selector. `ssr: false` porque el modal es puro cliente.
const AvatarModal = dynamic(() => import("./AvatarModal"), { ssr: false });

// Muestra el avatar actual + botón "Cambiar avatar". Va en la página de perfil.
export default function AvatarPicker() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const actual = resolverAvatar(profile);

  return (
    <div className="field">
      <label>Avatar</label>
      <div className="avpicker-row">
        <Avatar perfil={profile} size={64} className="avpicker-cur" alt={`Tu avatar: ${actual.nombre}`} />
        <button type="button" className="btn ghost" onClick={() => setOpen(true)}>Cambiar avatar</button>
      </div>
      {open && <AvatarModal onClose={() => setOpen(false)} />}
    </div>
  );
}
