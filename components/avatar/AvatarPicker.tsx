"use client";
import { useState } from "react";
import { useAuth } from "@/components/AuthContext";
import Avatar from "./Avatar";
import AvatarModal from "./AvatarModal";

// Muestra el avatar actual + botón "Cambiar avatar" que abre el modal. Va en la
// página de perfil.
export default function AvatarPicker() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="field">
      <label>Avatar</label>
      <div className="avpicker-row">
        <Avatar seed={profile?.avatar_seed} style={profile?.avatar_style} size={64} className="avpicker-cur" />
        <button type="button" className="btn ghost" onClick={() => setOpen(true)}>Cambiar avatar</button>
      </div>
      {open && <AvatarModal onClose={() => setOpen(false)} />}
    </div>
  );
}
