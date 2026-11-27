import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhonemizeResult } from '@engclaw/ipc-contract'
import { ArticulationView } from '@/components/articulation-view'
import { englishSoundGroups, type EnglishSound } from '@/lib/english-sound'
import { HearReference } from '@/components/hear-reference'
import { usePronunciationGuide } from '@/lib/learning-language'
import { WordPractice } from '@/components/shadowing/word-practice'
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

const CENTRAL_VOWELS = {
  ʌ: { first: 'ʌ', second: 'ə', firstWord: 'cup', secondWord: 'about', tip: 'stress' },
  ə: { first: 'ʌ', second: 'ə', firstWord: 'cup', secondWord: 'about', tip: 'stress' },
  ɜ: { first: 'ɜ', second: 'ɝ', firstWord: 'bird', secondWord: 'bird', tip: 'accent' },
  ɝ: { first: 'ɝ', second: 'ɚ', firstWord: 'bird', secondWord: 'teacher', tip: 'rhoticStress' },
  ɚ: { first: 'ɝ', second: 'ɚ', firstWord: 'bird', secondWord: 'teacher', tip: 'rhoticStress' },
}

function CentralVowelComparison({ ipa, disabled }: { ipa: string; disabled: boolean }) {
  const { t } = useTranslation()
  const { language, t: guideT } = usePronunciationGuide()
  const pair = CENTRAL_VOWELS[ipa as keyof typeof CENTRAL_VOWELS]
  if (!pair) return null

  return (
    <div className="bg-muted/40 space-y-2 rounded-lg p-3" data-testid="ipa-vowel-comparison">
      <h4 className="text-sm font-semibold">{t('englishGuide.vowelComparison')}</h4>
      <p className="text-sm" lang={language}>
        {guideT(`englishGuide.vowelContrast.${pair.tip}`)}
      </p>
      <HearReference
        text={pair.firstWord}
        ipaExample={pair.first}
        label={t('englishGuide.hearWordSound', { word: pair.firstWord, sound: pair.first })}
        disabled={disabled}
        testId="ipa-vowel-comparison-first"
        alternate={{
          text: pair.secondWord,
          ipaExample: pair.second,
          label: t('englishGuide.hearWordSound', { word: pair.secondWord, sound: pair.second }),
        }}
      />
    </div>
  )
}

export function EnglishSoundGuide({
  sound,
  disabled,
  exercise = false,
}: {
  sound: EnglishSound
  disabled: boolean
  exercise?: boolean
}) {
  const { t } = useTranslation()
  const { language, t: guideT } = usePronunciationGuide()
  const [playId, setPlayId] = useState(0)
  const [recording, setRecording] = useState(false)
  const drill =
    exercise && sound.ipa === 'p'
      ? [sound.example, 'pin', 'pan', 'pet', 'pick'].join(' ')
      : sound.example

  return (
    <section
      className="space-y-3"
      aria-label={t('englishGuide.title')}
      data-testid="english-sound-guide"
    >
      <h3 className="text-base font-semibold">{t('englishGuide.title')}</h3>
      <p className="text-xl font-semibold" lang="en-fonipa">
        /{sound.ipa}/
      </p>
      <div className="space-y-2 text-sm" lang={language}>
        <p>
          {guideT(
            sound.ipa === 'dʒ' ? 'englishGuide.dzhTip' : `pronunciation.englishSounds.${sound.ipa}`,
          )}
        </p>
        <p>
          {guideT(
            drill !== sound.example
              ? 'englishGuide.sequenceExercise'
              : sound.ipa === 'dʒ'
                ? 'englishGuide.dzhExample'
                : 'englishGuide.soundExercise',
            {
              word: drill,
            },
          )}
        </p>
      </div>
      <ArticulationView phones={ipaPhones(sound.ipa)} playId={playId} holdPose={exercise} />
      <div className="flex flex-wrap gap-2">
        <HearReference
          text={exercise ? sound.ipa : sound.example}
          ipa={exercise}
          disabled={disabled || recording}
          label={
            exercise
              ? t('englishGuide.hearSound', { sound: sound.ipa })
              : t('englishGuide.hearWord', { word: sound.example })
          }
          alternate={
            exercise && drill === sound.example
              ? {
                  text: drill,
                  ipaExample: sound.ipa,
                  label: t('englishGuide.hearWord', { word: drill }),
                }
              : undefined
          }
          segmented={
            drill !== sound.example
              ? { text: drill, label: t('englishGuide.hearSequence') }
              : undefined
          }
          onPlaybackStart={() => setPlayId((id) => id + 1)}
        />
        <Button size="sm" variant="outline" onClick={() => setPlayId((id) => id + 1)}>
          {t('mandarinGuide.replayMotion')}
        </Button>
      </div>
      {exercise && <CentralVowelComparison ipa={sound.ipa} disabled={disabled || recording} />}
      {exercise && (
        <WordPractice
          word={drill}
          controls={{ prepare: () => undefined, recording, onRecordingChange: setRecording }}
          onPrepare={() => undefined}
        />
      )}
    </section>
  )
}

export function EnglishIpaChart() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<EnglishSound | null>(null)

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2" data-testid="english-ipa-chart">
      <section className="space-y-4 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">{t('englishGuide.ipaChart')}</h2>
        {englishSoundGroups.map(({ key, sounds }) => (
          <section key={key} className="space-y-2">
            <h3 className="text-sm font-medium">{t(`englishGuide.${key}`)}</h3>
            <div className="flex flex-wrap gap-2">
              {sounds.map((sound) => (
                <Button
                  key={sound.ipa}
                  variant={sound.ipa === selected?.ipa ? 'secondary' : 'outline'}
                  aria-pressed={sound.ipa === selected?.ipa}
                  onClick={() => setSelected(sound)}
                  lang="en-fonipa"
                >
                  /{sound.ipa}/
                </Button>
              ))}
            </div>
          </section>
        ))}
        <p className="text-muted-foreground text-xs">{t('englishGuide.accentNote')}</p>
      </section>
      <div className="rounded-xl border p-4">
        {selected ? (
          <EnglishSoundGuide key={selected.ipa} sound={selected} disabled={false} exercise />
        ) : (
          <p className="text-muted-foreground text-sm">{t('englishGuide.selectSound')}</p>
        )}
      </div>
    </div>
  )
}

export function EnglishPronunciation({ text, disabled }: { text: string; disabled: boolean }) {
  const { t } = useTranslation()
  const { language, t: guideT } = usePronunciationGuide()
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
          <div lang={language}>
            {language === 'vi' && (
              <p className="font-medium">{guideT('pronunciation.approximation')}</p>
            )}
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {sounds.map((sound, index) => (
                <li key={index} className="bg-card rounded-md border px-2 py-1">
                  <span lang="en-fonipa">/{sound}/</span> ·{' '}
                  {language === 'vi'
                    ? (vietnamese[sound] ?? guideT('pronunciation.listenAndCopy'))
                    : guideT(`pronunciation.englishSounds.${sound}`, {
                        defaultValue: guideT('pronunciation.listenAndCopy'),
                      })}
                </li>
              ))}
            </ul>
            <p className="mt-2">{guideT('pronunciation.attachSounds')}</p>
            {link && word && next && (
              <p className="mt-1">
                <strong>
                  {guideT('pronunciation.linkWordsTitle', { first: word.word, second: next.word })}
                </strong>{' '}
                · {guideT('pronunciation.linkWordsBody', { end: currentEnd, start: nextSound })}
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
