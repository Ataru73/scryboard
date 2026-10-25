import { useTranslation } from "react-i18next";
import { changeLanguage, type Language } from "./index";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <label className="language-switcher">
      <span aria-hidden="true">🌐</span>
      <select
        aria-label={t("common.language")}
        title={t("common.language")}
        value={i18n.resolvedLanguage}
        onChange={(event) => void changeLanguage(event.target.value as Language)}
      >
        <option value="it">{t("common.italian")}</option>
        <option value="en">{t("common.english")}</option>
      </select>
    </label>
  );
}
