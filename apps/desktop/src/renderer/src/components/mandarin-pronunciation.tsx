import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HearReference } from '@/components/hear-reference'
import { usePronunciationGuide } from '@/lib/learning-language'
import { Button } from '@/components/ui/button'
import {
  finalTipKey,
  pinyinSpeech,
  toneArrows,
  vietnameseApproximation,
  type MandarinSyllable,
} from '@/lib/mandarin-pronunciation'

function readTogether(items: MandarinSyllable[], index: number): string | null {
  const current = items[index]
  const next = items[index + 1]
  if (!current || !next) return null
  if (next.pauseBefore) return 'pronunciation.pause'
  if (current.tone === 3 && next.tone === 3) return 'pronunciation.twoThirds'
  if (current.tone === 4 && next.tone === 2)
    return current.final.endsWith('n') ? 'pronunciation.fallRiseN' : 'pronunciation.fallRise'
  if (next.tone === 5) return 'pronunciation.neutralNext'
  if (current.final.endsWith('n')) return 'pronunciation.linkN'
  return 'pronunciation.linkSyllables'
}

export function MandarinPronunciation({
  items,
  text,
  isPinyin,
  disabled,
}: {
  items: MandarinSyllable[]
  text: string
  isPinyin: boolean
  disabled: boolean
}) {
  const { t } = useTranslation()
  const { language, t: guideT } = usePronunciationGuide()
  const [selected, setSelected] = useState(0)
  const item = items[selected]!
  const next = items[selected + 1]
  const tip = readTogether(items, selected)

  return (
    <section
      className="space-y-4"
      aria-label={t('mandarinGuide.title')}
      data-testid="mandarin-guide"
    >
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{t('mandarinGuide.title')}</h3>
        <p className="text-muted-foreground text-xs" lang={language}>
          {guideT('mandarinGuide.hint')}
        </p>
      </div>
      {language === 'vi' && (
        <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-sm" lang="vi">
          <p className="font-semibold">{guideT('pronunciation.approximation')}</p>
          <p
            className="text-base font-medium leading-relaxed"
            data-testid="mandarin-vietnamese-phrase"
          >
            {items.map((syllable, index) => (
              <span key={index}>
                {index > 0 && (syllable.pauseBefore ? ' | ' : ' → ')}“
                {vietnameseApproximation(syllable)}”
              </span>
            ))}
          </p>
          <p className="text-muted-foreground text-xs">
            {items.length === 1
              ? guideT('pronunciation.oneBeat')
              : items.some((syllable, index) => index > 0 && syllable.pauseBefore)
                ? guideT('pronunciation.approximationPause')
                : guideT('pronunciation.approximationTone')}
          </p>
        </div>
      )}
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto p-1">
        {items.map((syllable, index) => (
          <Button
            key={index}
            type="button"
            variant={index === selected ? 'secondary' : 'outline'}
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
          >
            {syllable.han && <span lang="zh-CN">{syllable.han}</span>}
            <span lang="zh-Latn-pinyin">{syllable.marked}</span>
            <span aria-hidden="true">{toneArrows[syllable.tone]}</span>
          </Button>
        ))}
      </div>
      <dl
        className="bg-muted/50 space-y-2 rounded-lg p-3 text-sm"
        lang={language}
        aria-live="polite"
      >
        <div>
          <dt className="font-medium">
            {guideT('pronunciation.initial')} · {item.initial || '∅'}
          </dt>
          <dd>{guideT(`pronunciation.initials.${item.initial || 'none'}`)}</dd>
        </div>
        <div>
          <dt className="font-medium">
            {guideT('pronunciation.final')} · {item.final}
          </dt>
          <dd>{guideT(finalTipKey(item), { defaultValue: guideT('pronunciation.fallback') })}</dd>
        </div>
        <div>
          <dt className="font-medium">
            {guideT('pronunciation.tone')} · {toneArrows[item.tone]}
          </dt>
          <dd>{guideT(`pronunciation.tones.${item.tone}`)}</dd>
        </div>
        {next && tip && (
          <div>
            <dt className="font-medium">
              {guideT('pronunciation.connected')} ·{' '}
              <span lang="zh-Latn-pinyin">
                {item.marked} → {next.marked}
              </span>
            </dt>
            <dd>{guideT(tip)}</dd>
          </div>
        )}
      </dl>
      <p data-testid="mandarin-reference-text" className="text-sm">
        <span className="text-muted-foreground">{t('reference.reading')}</span>{' '}
        {!isPinyin && <span lang="zh-CN">{text} · </span>}
        <span lang="zh-Latn-pinyin">
          {items
            .map(
              ({ marked, pauseBefore }, index) =>
                `${index ? (pauseBefore ? ', ' : ' ') : ''}${marked}`,
            )
            .join('')}
        </span>
      </p>
      <HearReference
        speedControls
        defaultRate={1}
        text={isPinyin ? pinyinSpeech(items) : text}
        pinyin={isPinyin}
        disabled={disabled}
        label={t('mandarinGuide.hearAll')}
        segmented={
          items.length > 1
            ? {
                text: items.map((syllable) => pinyinSpeech([syllable])).join(', '),
                label: t('mandarinGuide.hearSeparated'),
                pinyin: true,
              }
            : undefined
        }
        alternate={{
          text: pinyinSpeech([item]),
          label: t('mandarinGuide.hearSyllable', { syllable: item.marked }),
          pinyin: true,
        }}
      />
    </section>
  )
}
