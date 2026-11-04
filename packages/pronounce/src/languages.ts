/** Language registry (OpenPronounce `languages.py`). English only for the PoC; add entries to extend. */

export interface LanguageConfig {
  code: string
  name: string
  experimental: boolean
  /** espeak-ng voice used for expected phones. */
  espeakVoice: string
  /** Catalog ids of the fixed models this language needs. */
  phoneModelId: string
  asrModelId: string
}

export const LANGUAGES: Readonly<Record<string, LanguageConfig>> = {
  en: {
    code: 'en',
    name: 'English',
    experimental: false,
    espeakVoice: 'en-us',
    phoneModelId: 'phone',
    asrModelId: 'asr-en',
  },
}

/** Catalog id of the Kokoro reference-voice model (language independent). */
export const TTS_MODEL_ID = 'tts-ref'

export const DEFAULT_LANGUAGE = 'en'

export const getLanguage = (code: string | undefined): LanguageConfig | undefined =>
  LANGUAGES[code ?? DEFAULT_LANGUAGE]
