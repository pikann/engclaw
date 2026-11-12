import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SegmentProsody } from '@engclaw/ipc-contract'
import { ClickableText } from '@/components/ui/clickable-text'
import type { IpaToken } from '@/lib/ipa'
import { alignProsody } from '@/lib/prosody-guide'
import type { ProsodyState } from '@/lib/use-prosody'
import { cn } from '@/lib/utils'

const PITCH_ICON = { rising: ArrowUpRight, falling: ArrowDownRight, flat: ArrowRight } as const

function PitchMark({
  direction,
}: {
  direction: SegmentProsody['words'][number]['pitch']['direction']
}) {
  const { t } = useTranslation()
  const Icon = PITCH_ICON[direction]
  return (
    <Icon
      role="img"
      aria-label={t(`screens.shadowing.prosody.pitch.${direction}`)}
      data-testid="shadowing-word-pitch"
      data-direction={direction}
      className="text-muted-foreground ml-[0.1em] inline size-[0.5em] align-baseline"
    />
  )
}

function PauseMark({ seconds }: { seconds: number }) {
  const { t } = useTranslation()
  const label = t('screens.shadowing.prosody.pause', { seconds: seconds.toFixed(2) })
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="shadowing-pause"
      className="text-muted-foreground ml-[0.3em] text-[0.7em] font-bold"
    >
      ‖
    </span>
  )
}

/**
 * The shown sentence word by word, flowing and wrapping like plain text. The prosody guide adds
 * no rows: stressed words keep full opacity while the rest dim, and the pitch arrow and pause
 * mark sit inline after each word. The optional IPA row is reserved while its data loads.
 */
export function SentenceWords({
  text,
  ipa,
  showIpa,
  prosody,
  language = 'en',
}: {
  text: string
  language?: 'en' | 'zh'
  ipa: readonly IpaToken[] | null
  showIpa: boolean
  /** Null while the prosody guide is off. */
  prosody: ProsodyState | null
}) {
  const { t } = useTranslation()
  const pieces =
    /\p{Script=Han}/u.test(text) && ipa
      ? ipa.map((token) => token.text)
      : text.split(/\s+/).filter(Boolean)
  if (!showIpa && !prosody)
    return (
      <p data-testid="shadowing-sentence" className="leading-snug">
        <ClickableText text={text} />
      </p>
    )
  const aligned = prosody?.status === 'ready' ? alignProsody(text, prosody.value) : null
  return (
    <p data-testid="shadowing-sentence" className="leading-snug">
      {pieces.map((piece, i) => {
        const tok = aligned?.[i]
        const stressed = !!tok?.word?.stressed
        return (
          <span
            key={i}
            className={cn(
              'inline-flex flex-col items-center align-top',
              prosody ? 'mx-[0.3em]' : 'mx-[0.25em]',
            )}
          >
            <span className="whitespace-nowrap">
              <span
                data-testid="shadowing-word"
                data-stressed={stressed ? 'true' : undefined}
                className={cn('transition-opacity', tok?.word && !stressed && 'opacity-60')}
              >
                <ClickableText text={piece} />
                {stressed && (
                  <span className="sr-only"> ({t('screens.shadowing.prosody.stressed')})</span>
                )}
              </span>
              {tok?.word && <PitchMark direction={tok.word.pitch.direction} />}
              {tok?.pauseAfter != null && <PauseMark seconds={tok.pauseAfter} />}
            </span>
            {showIpa && (
              <span
                lang={language === 'zh' ? 'zh-Latn-pinyin' : 'en-fonipa'}
                data-testid="shadowing-word-ipa"
                className="text-muted-foreground text-[0.55em] leading-tight"
              >
                {ipa?.[i]?.ipa ? (language === 'zh' ? ipa[i]!.ipa : `/${ipa[i]!.ipa}/`) : ' '}
              </span>
            )}
          </span>
        )
      })}
    </p>
  )
}
