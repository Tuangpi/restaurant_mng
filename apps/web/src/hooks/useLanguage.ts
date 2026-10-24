import { useState, useEffect } from "react";
import { t as sharedT, type Language } from "../lib/translations";

export function useLanguage() {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem("language");
    if (saved) setLanguage(saved as Language);
  }, []);

  const switchLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("language", lang);
  };

  const t = (keyOrLang: string | Language, keyOrParams?: string | Record<string, string>) => {
    // t("key") — single string argument
    if (typeof keyOrParams === "undefined") {
      return sharedT(language, keyOrLang as Language);
    }
    // t(language, key) — first arg is a language code
    if (typeof keyOrLang === "string" && (keyOrLang === "en" || keyOrLang === "my") && typeof keyOrParams === "string") {
      return sharedT(keyOrLang as Language, keyOrParams);
    }
    // t(key, params)
    return sharedT(language, keyOrLang as Language, keyOrParams as Record<string, string>);
  };

  return { t, switchLanguage, language };
}