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
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function finalizar() {
    setBusy(true);
    setErr("");
    saveName();                       // asegura el nombre guardado aunque no haya habido blur
    const { error } = await finish(); // onboarding_completed = true
    if (error) { setErr("No se pudo completar. Probá de nuevo."); setBusy(false); return; }
    router.push("/");
  }

  return (
    <div className="ob-wrap">
      <header className="ob-header">
        <h1>👋 ¡Bienvenido a Yump!</h1>
        <p>{step === 1 ? "Personalizá tu experiencia. Solo te llevará un minuto." : "Un último toque y listo."}</p>
        <div className="ob-steps" role="progressbar" aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-label={`Paso ${step} de 2`}>
          <span className={step >= 1 ? "on" : ""} />
          <span className={step >= 2 ? "on" : ""} />
        </div>
      </header>

      {step === 1 ? (
        <>
          <PlatformPicker selected={selected} onToggle={togglePlatform} onNone={clearPlatforms} />
          <div className="ob-cta">
            <button type="button" className="btn" onClick={() => setStep(2)}>Siguiente</button>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="ob-back" onClick={() => setStep(1)}>
            <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
            Atrás
          </button>

          <section className="ob-block">
            <h2 className="ob-h">Elegí tu avatar</h2>
            <AvatarPicker />
          </section>

          <NameBlock value={name} onChange={setName} onBlur={saveName} />

          <div className="ob-cta">
            {err && <p className="ob-err">{err}</p>}
            <button type="button" className="btn" onClick={finalizar} disabled={busy}>
              {busy ? "Un momento…" : "Finalizar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
