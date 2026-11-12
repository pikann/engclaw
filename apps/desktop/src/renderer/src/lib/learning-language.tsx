import { useNavigate, useLocation } from 'react-router'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LearningLanguage } from '@engclaw/ipc-contract'

const Context = createContext<{ language: LearningLanguage }>({ language: 'en' })
export const useLearningLanguage = () => useContext(Context).language

const ChangeContext = createContext<{
  change: (language: LearningLanguage) => void
  saving: boolean
  error: boolean
}>({ change: () => undefined, saving: false, error: false })

export function LearningLanguageProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
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
  if (!ready) return null
  return (
    <ChangeContext.Provider value={{ change: (next) => void change(next), saving, error }}>
      <Context.Provider value={{ language }}>{children}</Context.Provider>
    </ChangeContext.Provider>
  )
}

export function LearningLanguageSelect() {
  const { t } = useTranslation()
  const language = useLearningLanguage()
  const { change, saving, error } = useContext(ChangeContext)
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="learning-language" className="text-muted-foreground">
        {t('learning.label')}
      </label>
      <select
        id="learning-language"
        data-testid="learning-language"
        value={language}
        disabled={saving}
        title={t('learning.switchHint')}
        className="bg-background rounded-md border px-2 py-1"
        onChange={(event) => change(event.target.value as LearningLanguage)}
      >
        <option value="en">{t('learning.en')}</option>
        <option value="zh">{t('learning.zh')}</option>
      </select>
      {error && <span role="alert">{t('learning.saveError')}</span>}
    </div>
  )
}
