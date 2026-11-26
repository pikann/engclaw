import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HearReference } from '@/components/hear-reference'
import { Button } from '@/components/ui/button'
import {
  finalTip,
  initialTips,
  pinyinSpeech,
  toneTips,
  vietnameseApproximation,
  type MandarinSyllable,
} from '@/lib/mandarin-pronunciation'

function readTogether(items: MandarinSyllable[], index: number): string | null {
  const current = items[index]
  const next = items[index + 1]
  if (!current || !next) return null
  if (next.pauseBefore) return 'Ngắt nhẹ ở dấu câu rồi sang âm tiếp theo.'
  if (current.tone === 3 && next.tone === 3)
    return 'Khi hai thanh 3 đi liền thành một cụm, âm đầu thường lên như thanh 2. Với chuỗi dài hơn, nghe mẫu để bắt nhịp theo cụm.'
  if (current.tone === 4 && next.tone === 2) {
    const transition = current.final.endsWith('n')
      ? ' Khép bằng n rồi bật sang âm sau, không ngắt hơi.'
      : ' Chuyển sang âm sau ngay, giữ hai nhịp liền.'
    return 'Hạ giọng dứt khoát ở âm đầu rồi nâng giọng ở âm sau.' + transition
  }
  if (next.tone === 5) return 'Đọc âm sau nhẹ và ngắn, bám sát nhịp âm trước.'
  if (current.final.endsWith('n'))
    return 'Khép âm đầu bằng n rồi chuyển thẳng sang âm sau. Giữ n ở cuối âm đầu và đọc hai nhịp liền.'
  return 'Giữ nguyên phần cuối của âm đầu, rồi chuyển ngay sang âm sau trong cùng một hơi.'
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
        <p className="text-muted-foreground text-xs">{t('mandarinGuide.hint')}</p>
      </div>
      <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-sm" lang="vi">
        <p className="font-semibold">Nghe gần giống tiếng Việt</p>
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
            ? 'Đọc trong một nhịp. Dùng mẫu nghe để bắt chước thanh điệu.'
            : items.some((syllable, index) => index > 0 && syllable.pauseBefore)
              ? 'Đọc liền theo mũi tên và ngắt nhẹ ở dấu |.'
              : 'Đọc liền theo mũi tên. Dấu tiếng Việt chỉ gợi hướng lên xuống của giọng.'}
        </p>
      </div>
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
            <span aria-hidden="true">{toneTips[syllable.tone][0]}</span>
          </Button>
        ))}
      </div>
      <dl className="bg-muted/50 space-y-2 rounded-lg p-3 text-sm" lang="vi" aria-live="polite">
        <div>
          <dt className="font-medium">Âm đầu · {item.initial || '∅'}</dt>
          <dd>{initialTips[item.initial]}</dd>
        </div>
        <div>
          <dt className="font-medium">Vần · {item.final}</dt>
          <dd>{finalTip(item)}</dd>
        </div>
        <div>
          <dt className="font-medium">Cao độ · {toneTips[item.tone][0]}</dt>
          <dd>{toneTips[item.tone][1]}</dd>
        </div>
        {next && tip && (
          <div>
            <dt className="font-medium">
              Đọc liền ·{' '}
              <span lang="zh-Latn-pinyin">
                {item.marked} → {next.marked}
              </span>
            </dt>
            <dd>{tip}</dd>
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
