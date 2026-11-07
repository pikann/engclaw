import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ClickableWord } from '@/components/ui/clickable-word'
import { useWordLookup } from '@/lib/word-lookup'
import { segmentText } from '@/lib/words'

/**
 * Text whose words open the dictionary dialog. Without a provider (or when `disabled`) it is
 * plain text. A click that ends a text selection is ignored so copying a phrase never pops the
 * dialog, and the buttons never take focus-stealing actions on the playing video or recording.
 */
export function ClickableText({
  text,
  disabled,
  className,
}: {
  text: string
  disabled?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const lookup = useWordLookup()
  const parts = useMemo(() => segmentText(text), [text])
  if (!lookup || disabled) return <>{text}</>
  return (
    <>
      {parts.map((p, i) =>
        p.word === null ? (
          p.text
        ) : (
          <ClickableWord
            key={i}
            lang="en"
            className={className}
            aria-label={t('dict.lookupWord', { word: p.text })}
            data-word={p.word}
            onClick={() => {
              if (window.getSelection()?.toString().trim()) return
              lookup(p.word!)
            }}
          >
            {p.text}
          </ClickableWord>
        ),
      )}
    </>
  )
}
