'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Locale, TranslationKey, translations } from './translations'

interface LangCtx {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LangCtx>({
  locale: 'uk',
  setLocale: () => {},
  t: (key) => key,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('uk')

  useEffect(() => {
    const saved = localStorage.getItem('odb_locale') as Locale | null
    if (saved && ['uk', 'en', 'ru'].includes(saved)) setLocaleState(saved)
  }, [])

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('odb_locale', l)
  }

  function t(key: TranslationKey): string {
    return (translations[locale] as any)[key] ?? (translations.uk as any)[key] ?? key
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() { return useContext(LanguageContext) }
