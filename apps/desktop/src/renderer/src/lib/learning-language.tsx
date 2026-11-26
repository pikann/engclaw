import { useNavigate, useLocation } from 'react-router'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveLocale } from '@engclaw/i18n'
import type { LearningLanguage, PronunciationGuideLanguage } from '@engclaw/ipc-contract'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

const Context = createContext<{ language: LearningLanguage }>({ language: 'en' })
export const useLearningLanguage = () => useContext(Context).language

const GuideContext = createContext<{
  preference: PronunciationGuideLanguage
  change: (value: PronunciationGuideLanguage) => void
  saving: boolean
  error: boolean
}>({ preference: 'auto', change: () => undefined, saving: false, error: false })

export function usePronunciationGuide() {
  const { preference } = useContext(GuideContext)
  const { i18n } = useTranslation()
  const language = preference === 'auto' ? resolveLocale(i18n.language) : preference
  return { language, t: i18n.getFixedT(language, 'common') }
}

export function PronunciationGuideLanguageSelect({ id }: { id: string }) {
  const { t } = useTranslation()
  const { preference, change, saving, error } = useContext(GuideContext)
  return (
    <div>
      <Select
        value={preference}
        disabled={saving}
        onValueChange={(value) => change(value as PronunciationGuideLanguage)}
      >
        <SelectTrigger aria-labelledby={id} data-testid="pronunciation-guide-language">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{t('pronunciation.followInterface')}</SelectItem>
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="vi">Tiếng Việt</SelectItem>
        </SelectContent>
      </Select>
      {error && <p role="alert">{t('pronunciation.saveError')}</p>}
    </div>
  )
}

const ChangeContext = createContext<{
  change: (language: LearningLanguage) => void
  saving: boolean
  error: boolean
}>({ change: () => undefined, saving: false, error: false })

export function LearningLanguageProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [preference, setPreference] = useState<PronunciationGuideLanguage>('auto')
  const [savingGuide, setSavingGuide] = useState(false)
  const [guideError, setGuideError] = useState(false)
  const [language, setLanguage] = useState<LearningLanguage>('en')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    void window.engclaw.app
      .getSettings()
      .then((settings) => {
        if (live) {
          setLanguage(settings.learningLanguage)
          setPreference(settings.pronunciationGuideLanguage)
          setReady(true)
        }
      })
      .catch(() => {
        if (live) {
          setError(true)
          setReady(true)
        }
      })
    return () => {
      live = false
    }
  }, [])
  const change = async (next: LearningLanguage) => {
    if (saving || next === language) return
    setSaving(true)
    setError(false)
    try {
      const saved = await window.engclaw.app.updateSettings({ learningLanguage: next })
      window.speechSynthesis?.cancel()
      setLanguage(saved.learningLanguage)
      navigate(pathname, { replace: true, state: null })
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }
  const changeGuide = async (value: PronunciationGuideLanguage) => {
    if (savingGuide || value === preference) return
    setSavingGuide(true)
    setGuideError(false)
    try {
      const saved = await window.engclaw.app.updateSettings({ pronunciationGuideLanguage: value })
      setPreference(saved.pronunciationGuideLanguage)
    } catch {
      setGuideError(true)
    } finally {
      setSavingGuide(false)
    }
  }

  if (!ready) return null
  return (
    <ChangeContext.Provider value={{ change: (next) => void change(next), saving, error }}>
      <Context.Provider value={{ language }}>
        <GuideContext.Provider
          value={{
            preference,
            change: (value) => void changeGuide(value),
            saving: savingGuide,
            error: guideError,
          }}
        >
          {children}
        </GuideContext.Provider>
      </Context.Provider>
    </ChangeContext.Provider>
  )
}

export function LearningLanguageSelect() {
  const { t } = useTranslation()
  const language = useLearningLanguage()
  const { change, saving, error } = useContext(ChangeContext)
  return (
    <div className="flex items-center gap-2 text-sm">
      <Label htmlFor="learning-language" className="text-muted-foreground">
        {t('learning.label')}
      </Label>
      <Select
        value={language}
        disabled={saving}
        onValueChange={(value) => change(value as LearningLanguage)}
      >
        <SelectTrigger
          id="learning-language"
          data-testid="learning-language"
          size="sm"
          title={t('learning.switchHint')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">{t('learning.en')}</SelectItem>
          <SelectItem value="zh">{t('learning.zh')}</SelectItem>
        </SelectContent>
      </Select>
      {error && <span role="alert">{t('learning.saveError')}</span>}
    </div>
  )
}
