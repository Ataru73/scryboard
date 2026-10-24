import { PLAYER_COLORS } from "@scryboard/shared";
import { type FormEvent, useState } from "react";
import { newProfileId, type Profile } from "../lib/storage";

interface Props {
  roomName: string;
  isGm: boolean;
  onSubmit: (profile: Profile) => void;
}

export function ProfileForm({ roomName, isGm, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(
    () => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] as string,
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) onSubmit({ id: newProfileId(), name: name.trim(), color });
  }

  return (
    <main className="centered">
      <form className="card stack" onSubmit={submit}>
        <h2>{roomName}</h2>
        <p className="muted">{isGm ? "Entri come GM." : "Come ti chiamano al tavolo?"}</p>
        <label className="field">
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required />
        </label>
        <fieldset className="colors">
          <legend>Colore</legend>
          {PLAYER_COLORS.map((c) => (
            <label key={c} className="swatch" style={{ background: c }}>
              <input
                type="radio"
                name="color"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                aria-label={c}
              />
            </label>
          ))}
        </fieldset>
        <button type="submit" className="primary" disabled={!name.trim()}>
          Entra
        </button>
      </form>
    </main>
  );
}
