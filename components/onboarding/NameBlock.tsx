"use client";

export default function NameBlock({ value, onChange, onBlur }:
  { value: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <section className="ob-block">
      <h2 className="ob-h">¿Cómo querés que te llamemos?</h2>
      <div className="field">
        <label htmlFor="ob-name">Tu nombre</label>
        <input id="ob-name" type="text" value={value} autoComplete="name"
          onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      </div>
    </section>
  );
}
