import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { storage } from "../lib/storage";
import { en } from "./locales/en";
import { it } from "./locales/it";

export const SUPPORTED_LANGUAGES = ["it", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "it";

function isLanguage(value: string | null): value is Language {
  return SUPPORTED_LANGUAGES.some((language) => language === value);
}

function updateDocumentLanguage(language: string) {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

const savedLanguage = storage.getLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
  },
  lng: isLanguage(savedLanguage) ? savedLanguage : DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

i18n.on("languageChanged", updateDocumentLanguage);
updateDocumentLanguage(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE);

export async function changeLanguage(language: Language): Promise<void> {
  if (!SUPPORTED_LANGUAGES.includes(language)) return;
  storage.setLanguage(language);
  await i18n.changeLanguage(language);
}

export { i18n };
export default i18n;
