import { CONDITIONS, hpBandOf, type TokenItem } from "@scryboard/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import { CONDITION_ICONS } from "./conditionIcons";
import { HP_BAND_COLORS } from "./Vitals";

const CONDITION_INFO = new Map<string, (typeof CONDITIONS)[number]>(
  CONDITIONS.map((c) => [c.id, c]),
);

/** Punti ferita (se chi guarda li conosce) o fascia, e condizioni, a parole. */
export function vitalsText(t: TFunction, token: TokenItem): string {
  let text = "";
  if (token.hp) {
    text += t("core.tokenList.hitPoints", { value: token.hp.value, max: token.hp.max });
    if (token.hp.temp > 0) text += t("core.tokenList.tempHitPoints", { count: token.hp.temp });
  } else if (token.hpBand) {
    text += t("core.tokenList.band", {
      band: catalogLabel(t, "hpBands", token.hpBand, token.hpBand).toLowerCase(),
    });
  }
  if (token.conditions?.length) {
    const list = token.conditions.map((c) =>
      catalogLabel(t, "conditions", c.id, CONDITION_INFO.get(c.id)?.label ?? c.id).toLowerCase(),
    );
    text += t("core.tokenList.conditions", { list: list.join(", ") });
  }
  return text;
}

/** Riassunto compatto per l'elenco dei turni: PF o fascia e icone delle condizioni. */
export function VitalsSummary({ token }: { token: TokenItem }) {
  const { t } = useTranslation();
  const band = token.hp ? hpBandOf(token.hp) : token.hpBand;
  if (!band && !token.conditions?.length) return null;
  return (
    <span className="vitals-summary">
      {band && (
        <span className="small">
          <span className="vitals-dot" style={{ background: HP_BAND_COLORS[band] }} />
          {token.hp ? `${token.hp.value}/${token.hp.max}` : catalogLabel(t, "hpBands", band, band)}
        </span>
      )}
      {token.conditions?.map((c) => {
        const info = CONDITION_INFO.get(c.id);
        const icon = CONDITION_ICONS[c.id];
        return (
          <svg
            key={c.id}
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            // Nei pannelli il colore del testo: i gialli del token non si leggono sul chiaro.
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={icon.dash ? "3 2.5" : undefined}
          >
            <title>{catalogLabel(t, "conditions", c.id, info?.label ?? c.id)}</title>
            <path d={icon.path} />
          </svg>
        );
      })}
    </span>
  );
}
