import type { HocuspocusProvider } from "@hocuspocus/provider";
import { DEFAULT_VISION, LIGHT_PRESETS, type LightItem, type TokenItem } from "@scryboard/shared";
import { useId } from "react";
import type { BoardStore } from "./store";
import { usePlayers } from "./usePlayers";

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="small muted">
        {label}
      </label>
      <input
        id={id}
        className="number-field"
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0 && n <= 100) onChange(n);
        }}
      />
    </>
  );
}

/** Raggi e colore di una luce fissa selezionata. */
export function LightFields({ light, store }: { light: LightItem; store: BoardStore }) {
  const presetId = useId();
  return (
    <>
      <label htmlFor={presetId} className="visually-hidden">
        Tipo di luce
      </label>
      <select
        id={presetId}
        value=""
        onChange={(e) => {
          const preset = LIGHT_PRESETS.find((p) => p.id === e.target.value);
          if (preset)
            store.update({
              [light.id]: { bright: preset.bright, dim: preset.dim, color: preset.color },
            });
        }}
      >
        <option value="">Tipo di luce…</option>
        {LIGHT_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <NumberField
        label="Piena"
        value={light.bright}
        onChange={(bright) => store.update({ [light.id]: { bright } })}
      />
      <NumberField
        label="Fioca"
        value={light.dim}
        onChange={(dim) => store.update({ [light.id]: { dim } })}
      />
      <span className="toolbar-separator" />
    </>
  );
}

/** Solo GM: visione, luce portata e giocatore che controlla il token. */
export function VisionFields({
  token,
  store,
  provider,
}: {
  token: TokenItem;
  store: BoardStore;
  provider: HocuspocusProvider;
}) {
  const players = usePlayers(provider);
  const vision = token.vision ?? DEFAULT_VISION;
  const lightId = useId();
  const ownerId = useId();
  const owner = token.owners?.[0] ?? "";
  const carried = token.light
    ? LIGHT_PRESETS.find(
        (p) =>
          p.bright === token.light?.bright &&
          p.dim === token.light?.dim &&
          p.color === token.light?.color,
      )
    : null;
  return (
    <>
      <NumberField
        label="Vista"
        value={vision.range}
        onChange={(range) => store.update({ [token.id]: { vision: { ...vision, range } } })}
      />
      <NumberField
        label="Scurovisione"
        value={vision.darkvision}
        onChange={(darkvision) =>
          store.update({ [token.id]: { vision: { ...vision, darkvision } } })
        }
      />
      <label htmlFor={lightId} className="visually-hidden">
        Luce portata
      </label>
      <select
        id={lightId}
        value={token.light ? (carried?.id ?? "custom") : ""}
        onChange={(e) => {
          const preset = LIGHT_PRESETS.find((p) => p.id === e.target.value);
          store.update({
            [token.id]: {
              light: preset
                ? { bright: preset.bright, dim: preset.dim, color: preset.color }
                : null,
            },
          });
        }}
      >
        <option value="">Nessuna luce</option>
        {LIGHT_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        {token.light && !carried && <option value="custom">Luce personalizzata</option>}
      </select>
      <label htmlFor={ownerId} className="visually-hidden">
        Controllato da
      </label>
      <select
        id={ownerId}
        value={owner}
        onChange={(e) =>
          store.update({ [token.id]: { owners: e.target.value ? [e.target.value] : [] } })
        }
      >
        <option value="">Nessun giocatore</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        {owner && !players.some((p) => p.id === owner) && (
          <option value={owner}>Giocatore non connesso</option>
        )}
      </select>
      <span className="toolbar-separator" />
    </>
  );
}
