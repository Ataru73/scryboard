import type { HocuspocusProvider } from "@hocuspocus/provider";
import { DEFAULT_VISION, LIGHT_PRESETS, type LightItem, type TokenItem } from "@scryboard/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
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
    <span className="field-group">
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
    </span>
  );
}

/** Raggi e colore di una luce fissa selezionata. */
export function LightFields({ light, store }: { light: LightItem; store: BoardStore }) {
  const { t } = useTranslation();
  const presetId = useId();
  return (
    <>
      <label htmlFor={presetId} className="visually-hidden">
        {t("effects.lighting.lightType")}
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
        <option value="">{t("effects.lighting.lightTypePlaceholder")}</option>
        {LIGHT_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {catalogLabel(t, "lights", p.id, p.label)}
          </option>
        ))}
      </select>
      <NumberField
        label={t("effects.lighting.bright")}
        value={light.bright}
        onChange={(bright) => store.update({ [light.id]: { bright } })}
      />
      <NumberField
        label={t("effects.lighting.dim")}
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
  const { t } = useTranslation();
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
        label={t("effects.lighting.vision")}
        value={vision.range}
        onChange={(range) => store.update({ [token.id]: { vision: { ...vision, range } } })}
      />
      <NumberField
        label={t("effects.lighting.darkvision")}
        value={vision.darkvision}
        onChange={(darkvision) =>
          store.update({ [token.id]: { vision: { ...vision, darkvision } } })
        }
      />
      <label htmlFor={lightId} className="visually-hidden">
        {t("effects.lighting.carriedLight")}
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
        <option value="">{t("effects.lighting.noLight")}</option>
        {LIGHT_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {catalogLabel(t, "lights", p.id, p.label)}
          </option>
        ))}
        {token.light && !carried && (
          <option value="custom">{t("effects.lighting.customLight")}</option>
        )}
      </select>
      <label htmlFor={ownerId} className="visually-hidden">
        {t("effects.lighting.controlledBy")}
      </label>
      <select
        id={ownerId}
        value={owner}
        onChange={(e) =>
          store.update({ [token.id]: { owners: e.target.value ? [e.target.value] : [] } })
        }
      >
        <option value="">{t("effects.lighting.noPlayer")}</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        {owner && !players.some((p) => p.id === owner) && (
          <option value={owner}>{t("effects.lighting.disconnectedPlayer")}</option>
        )}
      </select>
      <span className="toolbar-separator" />
    </>
  );
}
