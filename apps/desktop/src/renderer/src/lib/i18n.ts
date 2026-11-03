import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LOCALE, i18nOptions, isLocale } from '@engclaw/i18n'

/** Initialises i18next with the language persisted by the main process and keeps it in sync. */
export async function initI18n(): Promise<void> {
  const stored = await window.engclaw.settings.getLanguage()
  await i18next.use(initReactI18next).init({
    ...i18nOptions,
    ns: [...i18nOptions.ns],
    lng: isLocale(stored) ? stored : DEFAULT_LOCALE,
  })
  document.documentElement.lang = i18next.language
  window.engclaw.settings.onLanguageChanged((language) => {
    if (isLocale(language)) void i18next.changeLanguage(language)
  })
  i18next.on('languageChanged', (lng) => {
    document.documentElement.lang = lng
  })
}
