import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isLocale, resolveLocale, type Locale } from '@engclaw/i18n'

interface Settings {
  language?: Locale
  /** Custom models directory (air-gapped / big disk); default is `userData/models`. */
  modelsDir?: string
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

function read(): Settings {
  try {
    const raw: unknown = JSON.parse(readFileSync(file(), 'utf8'))
    const { language, modelsDir } = raw as Settings
    return {
      ...(isLocale(language) ? { language } : {}),
      ...(typeof modelsDir === 'string' && modelsDir !== '' ? { modelsDir } : {}),
    }
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

export function loadModelsDir(): string {
  return read().modelsDir ?? join(app.getPath('userData'), 'models')
}

export function saveModelsDir(modelsDir: string): void {
  writeFileSync(file(), JSON.stringify({ ...read(), modelsDir }, null, 2))
}
