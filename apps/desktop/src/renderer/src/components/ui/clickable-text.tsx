import { useLearningLanguage } from '@/lib/learning-language'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ClickableWord } from '@/components/ui/clickable-word'
import { useWordLookup } from '@/lib/word-lookup'
import { cn } from '@/lib/utils'
import { sentenceAround } from '@/lib/ask-agent'
import { segmentText } from '@/lib/words'

const LIGHT_WORD =
  'cursor-pointer rounded-sm px-0.5 underline decoration-dotted decoration-1 underline-offset-4 transition-colors hover:bg-primary-soft hover:text-foreground hover:decoration-solid'

/**
 * Text whose words open the dictionary dialog. Without a provider (or when `disabled`) it is
 * plain text. A click that ends a text selection is ignored so copying a phrase never pops the
 * dialog, and the buttons never take focus-stealing actions on the playing video or recording.
 */
export function ClickableText({
  text,
  disabled,
  className,
  light,
}: {
  text: string
  disabled?: boolean
  className?: string
  /**
   * Long lists (the transcript) render words as inert styled spans carrying `data-word`; the list
   * handles clicks once. Thousands of real buttons make a modal dialog freeze the page, because
   * every one must be hidden from assistive technology while it is open.
   */
  light?: boolean
}) {
  const language = useLearningLanguage()
  const { t } = useTranslation()
  const lookup = useWordLookup()
  const parts = useMemo(() => {
    let offset = 0
    return segmentText(text).map((p) => {
      const part = { ...p, offset }
      offset += p.text.length
      return part
    })
  }, [text])
  if (!lookup || disabled) return <>{text}</>
  if (light)
    return (
      <>
        {parts.map((p, i) =>
          p.word === null ? (
            p.text
          ) : (
            <span
              key={i}
              lang={language === 'zh' ? 'zh-CN' : 'en'}
              data-word={p.word}
              className={cn(LIGHT_WORD, className)}
            >
              {p.text}
            </span>
          ),
        )}
      </>
    )
  return (
    <>
      {parts.map((p, i) =>
        p.word === null ? (
          p.text
        ) : (
          <ClickableWord
            key={i}
            lang={language === 'zh' ? 'zh-CN' : 'en'}
            className={className}
            aria-label={t('dict.lookupWord', { word: p.text })}
            data-word={p.word}
            onClick={() => {
              if (window.getSelection()?.toString().trim()) return
              lookup(p.word!, sentenceAround(text, p.offset))
            }}
          >
            {p.text}
          </ClickableWord>
        ),
      )}
    </>
  )
}
