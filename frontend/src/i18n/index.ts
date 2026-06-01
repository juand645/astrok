import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import es from "./es.json";

/**
 * App-wide i18n setup.
 *
 * - Translation strings live in ``./en.json`` and ``./es.json``.
 * - Language detection order: ``localStorage`` (user pick from the Profile
 *   page) → browser language (``navigator.language``) → ``htmlTag``.
 * - The user's choice persists across reloads via ``i18nextLng`` in
 *   ``localStorage``.
 *
 * To translate a string in a component:
 *
 *     import { useTranslation } from "react-i18next";
 *     const { t } = useTranslation();
 *     return <span>{t("nav.dashboard")}</span>;
 *
 * Pass a fallback value when adding a new key so unmigrated environments
 * (or missing translations) render something sensible:
 *
 *     t("foo.bar", "Default English text")
 */
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "es"],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

export default i18n;
