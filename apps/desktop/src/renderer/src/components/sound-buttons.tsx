import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/** The word's sounds as buttons; picking one shows just that sound's mouth and tongue. */
export function SoundButtons({
  sounds,
  selected,
  onPick,
  wrong,
}: {
  sounds: readonly string[]
  selected: number | null
  onPick: (i: number) => void
  /** Whether sound `i` was said wrong (underlined). */
  wrong?: (i: number) => boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      {sounds.map((s, i) => (
        <button
          key={i}
          type="button"
          data-testid="word-phone"
          data-wrong={wrong?.(i) ?? false}
          aria-pressed={selected === i}
          aria-label={t('result.soundPick', { phone: s })}
          onClick={() => onPick(i)}
          className={cn(
            'rounded px-0.5',
            selected === i && 'bg-muted',
            wrong?.(i) && 'decoration-score-low underline decoration-2',
          )}
        >
          {s}
        </button>
      ))}
    </>
  )
}
