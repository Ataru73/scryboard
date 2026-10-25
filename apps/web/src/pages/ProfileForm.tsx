import { PLAYER_COLORS } from "@scryboard/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { newProfileId, newProfileSecret, type Profile } from "../lib/storage";

interface Props {
  roomName: string;
  isGm: boolean;
  onSubmit: (profile: Profile) => void;
}

export function ProfileForm({ roomName, isGm, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(
    () => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] as string,
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim())
      onSubmit({ id: newProfileId(), name: name.trim(), color, secret: newProfileSecret() });
  }

  return (
    <main className="centered">
      <form className="card stack" onSubmit={submit}>
        <h2>{roomName}</h2>
        <p className="muted">
          {isGm ? t("pages.profile.gmPrompt") : t("pages.profile.playerPrompt")}
        </p>
        <label className="field">
          <span>{t("pages.profile.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required />
        </label>
        <fieldset className="colors">
          <legend>{t("pages.profile.color")}</legend>
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
          {t("pages.profile.enter")}
        </button>
      </form>
    </main>
  );
}
