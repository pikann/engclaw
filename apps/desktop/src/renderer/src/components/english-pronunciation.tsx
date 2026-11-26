import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhonemizeResult } from '@engclaw/ipc-contract'
import { HearReference } from '@/components/hear-reference'
import { Button } from '@/components/ui/button'
import { ipaPhones } from '@/lib/articulation'

const vietnamese: Record<string, string> = {
  p: 'p bật hơi đầu từ',
  b: 'b',
  t: 't bật hơi đầu từ',
  d: 'đ',
  k: 'c/k',
  g: 'g',
  ɡ: 'g',
  m: 'm',
  n: 'n',
  ŋ: 'ng',
  f: 'ph',
  v: 'v',
  s: 'x',
  z: 'x có rung giọng',
  ʃ: 's với môi hơi tròn',
  ʒ: 's tròn môi, có rung giọng',
  h: 'h',
  θ: 'đặt đầu lưỡi nhẹ giữa hai răng và thổi hơi',
  ð: 'đặt lưỡi như /θ/ rồi rung giọng',
  tʃ: 'ch bật ra',
  dʒ: 'ch có rung giọng',
  l: 'l',
  ɹ: 'r giữ lưỡi, tránh rung đầu lưỡi',
  r: 'r giữ lưỡi, tránh rung đầu lưỡi',
  j: 'i lướt',
  w: 'u lướt',
  i: 'i căng',
  ɪ: 'i ngắn, thả lỏng',
  ɛ: 'e',
  e: 'ê',
  æ: 'mở miệng giữa e và a',
  ɑ: 'a mở',
  ɒ: 'o mở',
  ɔ: 'o tròn môi',
  ə: 'ơ rất nhẹ',
  ʌ: 'â mở miệng',
  ɜ: 'ơ',
  ɚ: 'ơ kèm r',
  ɝ: 'ơ kèm r',
  ʊ: 'u ngắn, thả lỏng',
  u: 'u tròn môi',
  aɪ: 'ai',
  eɪ: 'ê-i',
  oʊ: 'ô-u',
  əʊ: 'ơ-u',
  aʊ: 'ao',
  ɔɪ: 'oi',
}

const VOWEL = /^[aeiouæɑɒɔəɛɜɚɝɪʊʌ]/u

export function EnglishPronunciation({ text, disabled }: { text: string; disabled: boolean }) {
  const { t } = useTranslation()
  const [words, setWords] = useState<PhonemizeResult['words'] | null>(null)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    let stale = false
    const timer = setTimeout(() => {
      void window.engclaw.inference
        .phonemize({ text: text.trim(), language: 'en' })
        .then((result) => {
          if (!stale) setWords(result.ok ? result.value.words : [])
        })
        .catch(() => {
          if (!stale) setWords([])
        })
    }, 220)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [text])

  const word = words?.[selected]
  const sounds = word ? ipaPhones(word.phones.join('')) : []
  const ipa = word?.phones.join('')
  const next = words?.[selected + 1]
  const nextSound = next && ipaPhones(next.phones.join(''))[0]
  const currentEnd = sounds.at(-1)
  const chunks = [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)]
  const left = chunks[selected]
  const right = chunks[selected + 1]
  const link =
    nextSound &&
    currentEnd &&
    !VOWEL.test(currentEnd) &&
    VOWEL.test(nextSound) &&
    left &&
    right &&
    chunks.length === words?.length &&
    /^\s+$/u.test(text.slice(left.index + left[0].length, right.index))

  return (
    <section className="space-y-3" aria-label={t('englishGuide.title')} data-testid="english-guide">
      <h3 className="text-base font-semibold">{t('englishGuide.title')}</h3>
      {words === null && (
        <p role="status" className="text-muted-foreground text-xs">
          {t('englishGuide.loading')}
        </p>
      )}
      {words?.length === 0 && (
        <p className="text-muted-foreground text-xs">{t('englishGuide.unavailable')}</p>
      )}
      {!!words?.length && (
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto p-1">
          {words.map(({ word }, index) => (
            <Button
              key={index}
              type="button"
              variant={index === selected ? 'secondary' : 'outline'}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
            >
              <span lang="en">{word}</span>
            </Button>
          ))}
        </div>
      )}
      {ipa && (
        <div className="bg-muted/50 space-y-2 rounded-lg p-3 text-sm" aria-live="polite">
          <p className="font-semibold" lang="en-fonipa">
            /{ipa}/
          </p>
          <div lang="vi">
            <p className="font-medium">Nghe gần giống tiếng Việt</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {sounds.map((sound, index) => (
                <li key={index} className="bg-card rounded-md border px-2 py-1">
                  <span lang="en-fonipa">/{sound}/</span> ·{' '}
                  {vietnamese[sound] ?? 'nghe và bắt chước âm mẫu'}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              Ghép các âm liền nhau. Với phụ âm cuối, giữ âm gọn và tránh thêm “ơ”.
            </p>
            {link && word && next && (
              <p className="mt-1">
                <strong>
                  Đọc liền {word.word} → {next.word}
                </strong>{' '}
                · Giữ /{currentEnd}/ cuối từ rồi chuyển thẳng sang /{nextSound}/.
              </p>
            )}
          </div>
        </div>
      )}
      <p className="text-sm">
        <span className="text-muted-foreground">{t('reference.reading')}</span>{' '}
        <span lang="en" className="break-words">
          {text}
        </span>
      </p>
      <HearReference
        speedControls
        text={text}
        disabled={disabled}
        label={t('mandarinGuide.hearAll')}
        alternate={
          word
            ? { text: word.word, label: t('englishGuide.hearWord', { word: word.word }) }
            : undefined
        }
      />
    </section>
  )
}
