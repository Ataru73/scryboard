import {
  applyDamage,
  type HitPoints,
  HP_VISIBILITIES,
  type HpVisibility,
  parseDamage,
  type Role,
  type TokenItem,
} from "@scryboard/shared";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BoardStore } from "./store";

/** PF iniziali quando il GM ne dà a un token. */
const NEW_HIT_POINTS: HitPoints = { value: 10, max: 10, temp: 0 };

/**
 * Punti ferita di un token: attuali, massimi e temporanei, con un campo per danno e cura. Il GM
 * li aggiunge, li toglie e sceglie chi li vede; un giocatore cambia solo attuali e temporanei, e
 * solo se li vede (i PF segreti nel suo snapshot non ci sono).
 */
export function VitalsFields({
  token,
  store,
  role,
}: {
  token: TokenItem;
  store: BoardStore;
  role: Role;
}) {
  const { t } = useTranslation();
  const valueId = useId();
  const maxId = useId();
  const tempId = useId();
  const visibilityId = useId();
  const hp = token.hp ?? null;
  const gm = role === "gm";
  if (!hp) {
    if (!gm) return null;
    return (
      <>
        <button
          type="button"
          title={t("effects.vitals.addTitle")}
          onClick={() =>
            store.update({
              [token.id]: {
                hp: NEW_HIT_POINTS,
                // I personaggi dei giocatori li vedono tutti, i mostri solo come fascia.
                hpVisibility: token.owners?.length ? "all" : "band",
              },
            })
          }
        >
          {t("effects.vitals.add")}
        </button>
        <span className="toolbar-separator" />
      </>
    );
  }
  const set = (patch: Partial<HitPoints>) => {
    const next = { ...hp, ...patch };
    if (next.value > next.max && "max" in patch) next.value = next.max;
    store.update({ [token.id]: { hp: next } });
  };
  const integer = (text: string, min: number, max: number) => {
    const value = Number(text);
    return Number.isInteger(value) && value >= min && value <= max ? value : null;
  };
  return (
    <>
      <span className="field-group vitals-fields">
        <label htmlFor={valueId} className="small muted">
          {t("effects.vitals.valueLabel")}
        </label>
        <input
          id={valueId}
          className="number-field"
          type="number"
          min={-9999}
          max={9999}
          step={1}
          value={hp.value}
          onChange={(e) => {
            const value = integer(e.target.value, -9999, 9999);
            if (value !== null) set({ value });
          }}
        />
        <span className="small muted" aria-hidden="true">
          /
        </span>
        {gm ? (
          <>
            <label htmlFor={maxId} className="visually-hidden">
              {t("effects.vitals.maxLabel")}
            </label>
            <input
              id={maxId}
              className="number-field"
              type="number"
              min={1}
              max={9999}
              step={1}
              value={hp.max}
              onChange={(e) => {
                const max = integer(e.target.value, 1, 9999);
                if (max !== null) set({ max });
              }}
            />
          </>
        ) : (
          <span className="small">
            {hp.max}
            <span className="visually-hidden"> {t("effects.vitals.maxLabel")}</span>
          </span>
        )}
      </span>
      <span className="field-group">
        <label htmlFor={tempId} className="small muted" title={t("effects.vitals.tempLabel")}>
          {t("effects.vitals.tempShort")}
        </label>
        <input
          id={tempId}
          className="number-field"
          type="number"
          min={0}
          max={9999}
          step={1}
          value={hp.temp}
          onChange={(e) => {
            const temp = integer(e.target.value, 0, 9999);
            if (temp !== null) set({ temp });
          }}
        />
      </span>
      <DamageField tokens={[token]} store={store} />
      {gm && (
        <>
          <label htmlFor={visibilityId} className="visually-hidden">
            {t("effects.vitals.visibilityLabel")}
          </label>
          <select
            id={visibilityId}
            title={t("effects.vitals.visibilityLabel")}
            value={token.hpVisibility ?? "all"}
            onChange={(e) =>
              store.update({ [token.id]: { hpVisibility: e.target.value as HpVisibility } })
            }
          >
            {HP_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {t(`effects.vitals.visibility.${v}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-button"
            aria-label={t("effects.vitals.remove")}
            title={t("effects.vitals.remove")}
            onClick={() => store.update({ [token.id]: { hp: null } })}
          >
            ×
          </button>
        </>
      )}
      <span className="toolbar-separator" />
    </>
  );
}

/**
 * Danno o cura per uno o più token (una palla di fuoco su sei goblin): un solo passo di annulla.
 * Agisce solo sui token di cui chi scrive conosce i PF.
 */
export function DamageField({ tokens, store }: { tokens: TokenItem[]; store: BoardStore }) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState("");
  const targets = tokens.filter((token) => token.hp);
  if (targets.length === 0) return null;
  const many = tokens.length > 1;
  return (
    <span className="field-group">
      <label htmlFor={id} className={many ? "small muted" : "visually-hidden"}>
        {many
          ? t("effects.vitals.damageMany", { count: targets.length })
          : t("effects.vitals.damageLabel")}
      </label>
      <input
        id={id}
        className="number-field damage-field"
        inputMode="numeric"
        placeholder={t("effects.vitals.damagePlaceholder")}
        title={t("effects.vitals.damageTitle")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const delta = parseDamage(text);
          if (delta === null) return;
          store.update(
            Object.fromEntries(
              targets.map((token) => [token.id, { hp: applyDamage(token.hp as HitPoints, delta) }]),
            ),
          );
          setText("");
        }}
      />
    </span>
  );
}
