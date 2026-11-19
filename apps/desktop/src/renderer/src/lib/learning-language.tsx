import { useNavigate, useLocation } from 'react-router'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LearningLanguage } from '@engclaw/ipc-contract'
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
