"use client";
import { avatarSvg } from "@/lib/avatar";
import { AVATARS, SAGAS, DEFAULT_AVATAR_ID } from "@/lib/avatars";

export default function AvatarPicker({
  current, onPick,
}: {
  current: string; onPick: (seed: string) => void;
}) {
  return (
    <div className="field">
      <label>Elegí tu avatar</label>

      <div className="avsec">
        <h5 className="avsec-t">General</h5>
        <div className="avpick">
          <Opt id={DEFAULT_AVATAR_ID} label="Por defecto" current={current} onPick={onPick} />
        </div>
      </div>

      {SAGAS.map((s) => (
        <div key={s.key} className="avsec">
          <h5 className="avsec-t">{s.label}</h5>
          <div className="avpick">
            {AVATARS.filter((a) => a.saga === s.key).map((a) => (
              <Opt key={a.id} id={a.id} label={a.name} current={current} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Opt({
  id, label, current, onPick,
}: {
  id: string; label: string; current: string; onPick: (seed: string) => void;
}) {
  return (
    <button
      type="button"
      className={`avopt ${id === current ? "on" : ""}`}
      onClick={() => onPick(id)}
      aria-pressed={id === current}
      aria-label={label}
      title={label}
    >
      <img src={avatarSvg(id)} alt="" />
    </button>
  );
}
