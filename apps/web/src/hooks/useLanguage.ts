import { useState, useEffect } from "react";

export function useLanguage() {
  const [language, setLanguage] = useState<"en" | "my">("en");

  useEffect(() => {
    const saved = localStorage.getItem("language");
    if (saved) setLanguage(saved as "en" | "my");
  }, []);

  const switchLanguage = (lang: "en" | "my") => {
    setLanguage(lang);
    localStorage.setItem("language", lang);
  };

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      en: {
        title: "Myanmar Restaurant POS",
        subtitle: "Point of Sale System",
      },
      my: {
        title: "Myanmar Restaurant POS",
        subtitle: "Point of Sale System",
      },
    };
    return translations[language]?.[key] || key;
  };

  return { t, switchLanguage, language };
}