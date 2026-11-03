import commonEn from '../locales/en/common.json'
import commonVi from '../locales/vi/common.json'
import mainEn from '../locales/en/main.json'
import mainVi from '../locales/vi/main.json'

/** Adding a locale = a `locales/<lng>/` folder + one entry in `resources` below. */
export const resources = {
  en: { common: commonEn, main: mainEn },
  vi: { common: commonVi, main: mainVi },
} as const

export type Locale = keyof typeof resources
export const SUPPORTED_LOCALES = Object.keys(resources) as Locale[]
export const DEFAULT_LOCALE: Locale = 'en'
export const NAMESPACES = ['common', 'main'] as const
export const DEFAULT_NS = 'common'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as string[]).includes(value)
}

/** Maps an OS locale such as `vi-VN` or `en_US` to a supported locale, else `en`. */
export function resolveLocale(osLocale: string | undefined): Locale {
  const base = osLocale?.split(/[-_]/)[0]?.toLowerCase()
  return isLocale(base) ? base : DEFAULT_LOCALE
}

export const i18nOptions = {
  resources,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES,
  ns: NAMESPACES as unknown as string[],
  defaultNS: DEFAULT_NS,
  interpolation: { escapeValue: false },
} as const
