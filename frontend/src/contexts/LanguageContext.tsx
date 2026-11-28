import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export const APP_LANGUAGES = [
  { value: 'English', label: 'English', native: 'English', locale: 'en' },
  { value: 'Hindi', label: 'Hindi', native: 'हिन्दी', locale: 'hi' },
  { value: 'Bengali', label: 'Bengali', native: 'বাংলা', locale: 'bn' },
  { value: 'Marathi', label: 'Marathi', native: 'मराठी', locale: 'mr' },
  { value: 'Telugu', label: 'Telugu', native: 'తెలుగు', locale: 'te' },
  { value: 'Tamil', label: 'Tamil', native: 'தமிழ்', locale: 'ta' },
] as const;

export type AppLanguage = typeof APP_LANGUAGES[number]['value'] | 'French';
interface LanguageContextValue { language: AppLanguage; setLanguage: (language: AppLanguage) => void; }
const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const STORAGE_KEY = 'nuvyra_language';

function readSavedLanguage(): AppLanguage {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('nuvyra-language');
  return APP_LANGUAGES.some(item => item.value === saved) || saved === 'French' ? saved as AppLanguage : 'English';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(readSavedLanguage);
  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    localStorage.setItem(STORAGE_KEY, next);
    localStorage.setItem('nuvyra-language', next);
    window.dispatchEvent(new CustomEvent('nuvyra-language-change', { detail: next }));
  };
  useEffect(() => {
    const locale = APP_LANGUAGES.find(item => item.value === language)?.locale || (language === 'French' ? 'fr' : 'en');
    document.documentElement.lang = locale;
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
export const useLanguage = () => {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
};
