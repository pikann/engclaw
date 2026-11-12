import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLearningLanguage } from '@/lib/learning-language'

/** The game corpus and its progress belong to English until a Mandarin game pack exists. */
export function EnglishContentOnly({ children }: { children: ReactNode }) {
  const language = useLearningLanguage()
  const { t } = useTranslation()
  return language === 'en' ? (
    children
  ) : (
    <p className="p-6 text-muted-foreground">{t('learning.englishOnly')}</p>
  )
}
