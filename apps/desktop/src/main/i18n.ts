import i18next from 'i18next'
import { i18nOptions, type Locale } from '@engclaw/i18n'

const instance = i18next.createInstance()

export async function initMainI18n(language: Locale): Promise<void> {
  await instance.init({ ...i18nOptions, lng: language, ns: [...i18nOptions.ns], defaultNS: 'main' })
}

export const changeMainLanguage = (language: Locale) => instance.changeLanguage(language)

/** Translate in the `main` namespace (menus, dialogs, update prompts). */
export const t = instance.t.bind(instance)
