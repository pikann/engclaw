import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isLocale, resolveLocale, type Locale } from '@engclaw/i18n'

interface Settings {
  language?: Locale
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

function read(): Settings {
  try {
    const raw: unknown = JSON.parse(readFileSync(file(), 'utf8'))
    const language = (raw as Settings).language
    return isLocale(language) ? { language } : {}
  } catch {
    return {}
  }
}

/** Persisted language if valid, else derived from the OS locale, else `en`. */
export function loadLanguage(): Locale {
  return read().language ?? resolveLocale(app.getLocale())
}

export function saveLanguage(language: Locale): void {
  writeFileSync(file(), JSON.stringify({ ...read(), language }, null, 2))
}
