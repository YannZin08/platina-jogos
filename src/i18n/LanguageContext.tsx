import * as React from 'react'
import { pt } from './locales/pt'
import { en } from './locales/en'

export type Locale = 'pt' | 'en'
export type TranslationKey = keyof typeof pt

// Novos idiomas: crie um arquivo em locales/, registre aqui e em LANGUAGES.
const dictionaries: Record<Locale, Record<TranslationKey, string>> = { pt, en }

export const LANGUAGES: { code: Locale; label: string }[] = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'English' },
]

const STORAGE_KEY = 'platina-locale'

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''))
}

interface LanguageContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const LanguageContext = React.createContext<LanguageContextValue | undefined>(undefined)

function readStoredLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'en' || stored === 'pt' ? stored : 'pt'
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(readStoredLocale)

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const t = React.useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      interpolate(dictionaries[locale][key], vars),
    [locale],
  )

  const value = React.useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = React.useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage precisa estar dentro de um LanguageProvider')
  return ctx
}
