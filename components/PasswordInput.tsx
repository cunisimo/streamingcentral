"use client";
import { useId, useState } from "react";

// Campo de contraseña con el "ojito" para verla en claro. Único lugar donde se
// escribe este control: lo usan login, registro, reset y el login del admin.
// Se apoya en las clases .field/.admin input que ya existen; solo agrega el
// wrapper posicionado y el botón.
export default function PasswordInput({
  label,
  value,
  onChange,
  onEnter,
  autoComplete = "current-password",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  autoComplete?: "current-password" | "new-password";
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const id = useId();

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pass-wrap">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // El tipo cambia en vivo; el valor lo mantiene React, no se pierde.
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        />
        <button
          type="button"
          className="pass-eye"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={show}
          title={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          // Sin esto, tocar el ojito saca el foco del input en desktop.
          onMouseDown={(e) => e.preventDefault()}
          tabIndex={-1}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-6.5 10-6.5 10 6.5 10 6.5-3.6 6.5-10 6.5S2 12 2 12Z" />
            <circle cx="12" cy="12" r="2.6" />
            {show && <path d="M4.5 19.5 19.5 4.5" />}
          </svg>
        </button>
      </div>
    </div>
  );
}
