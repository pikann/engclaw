/** Language registry (OpenPronounce `languages.py`). English pronunciation and experimental Mandarin character recognition. */

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
  zh: {
    code: 'zh',
    name: '普通话（简体中文）',
    experimental: true,
    espeakVoice: 'cmn',
    // The Mandarin recognition path does not load the phone model.
    phoneModelId: 'phone',
    asrModelId: 'asr-zh',
  },
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
