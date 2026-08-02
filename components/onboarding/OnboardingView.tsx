"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "./useOnboarding";
import PlatformPicker from "./PlatformPicker";
import NameBlock from "./NameBlock";
import AvatarPicker from "../avatar/AvatarPicker";

export default function OnboardingView() {
  const router = useRouter();
  const { selected, name, togglePlatform, clearPlatforms, setName, saveName, finish } = useOnboarding();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function comenzar() {
    setBusy(true);
    setErr("");
    saveName();                    // asegura el nombre guardado aunque no haya habido blur
    const { error } = await finish(); // onboarding_completed = true
    if (error) { setErr("No se pudo completar. Probá de nuevo."); setBusy(false); return; }
    router.push("/");
  }

  return (
    <div className="ob-wrap">
      <header className="ob-header">
        <h1>👋 ¡Bienvenido a Yump!</h1>
        <p>Personalizá tu experiencia. Solo te llevará un minuto.</p>
      </header>

      <PlatformPicker selected={selected} onToggle={togglePlatform} onNone={clearPlatforms} />

      <section className="ob-block">
        <h2 className="ob-h">Elegí tu avatar</h2>
        <AvatarPicker />
      </section>

      <NameBlock value={name} onChange={setName} onBlur={saveName} />

      <div className="ob-cta">
        {err && <p className="ob-err">{err}</p>}
        <button type="button" className="btn" onClick={comenzar} disabled={busy}>
          {busy ? "Un momento…" : "Comenzar"}
        </button>
      </div>
    </div>
  );
}
