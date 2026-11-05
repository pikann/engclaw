import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChapterScreen,
  type AskPanel,
  type ChapterError,
  type ChapterOverlay,
  type ChapterPhase,
  type ChapterTarget,
  type ExamplesState,
} from '@/components/screens/game-chapter-screens'
import { LevelMapScreen, type MapVariant } from '@/components/screens/game-map-screens'
import { ResultScreen, type ResultVariant } from '@/components/screens/game-result-screens'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setThemePreference, useThemePreference } from '@/lib/theme'

const SIZES = [
  { w: 960, h: 600 },
  { w: 1280, h: 800 },
  { w: 1600, h: 900 },
] as const

function Frame({
  id,
  title,
  size,
  children,
}: {
  id: string
  title: string
  size: (typeof SIZES)[number]
  children: React.ReactNode
}) {
  return (
    <figure className="space-y-2" data-testid={`frame-${id}`}>
      <figcaption id={`cap-${id}`} className="text-sm font-medium">
        {title}
      </figcaption>
      <div
        role="group"
        aria-labelledby={`cap-${id}`}
        className="overflow-hidden rounded-lg border shadow-sm"
        style={{ width: size.w, height: size.h }}
      >
        {children}
      </div>
    </figure>
  )
}

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`g-${id}`} className="space-y-6 border-b pb-10">
      <h2 id={`g-${id}`} className="text-2xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

const MAPS: MapVariant[] = ['first', 'mid', 'many', 'jump', 'list', 'finished', 'none']
type Ch = [
  string,
  ChapterTarget,
  ChapterPhase,
  number,
  AskPanel,
  ChapterError,
  ChapterOverlay,
  ExamplesState,
]
const CHAPTERS: Ch[] = [
  ['word-0', 'word', 'idle', 0, 'closed', 'none', 'none', 'idle'],
  ['phrase-0', 'phrase', 'idle', 0, 'closed', 'none', 'none', 'idle'],
  ['idiom-0', 'idiom', 'idle', 0, 'closed', 'none', 'none', 'idle'],
  ['long-idiom-0', 'longIdiom', 'idle', 0, 'closed', 'none', 'none', 'idle'],
  ['word-2', 'word', 'idle', 2, 'closed', 'none', 'none', 'idle'],
  ['word-3-recording', 'word', 'recording', 3, 'closed', 'none', 'none', 'idle'],
  ['word-3-analyzing', 'word', 'analyzing', 3, 'closed', 'none', 'none', 'idle'],
  ['word-3-correct', 'word', 'correct', 3, 'closed', 'none', 'none', 'idle'],
  ['word-3-fix', 'word', 'fix', 3, 'closed', 'none', 'none', 'idle'],
  ['word-5', 'word', 'correct', 5, 'closed', 'none', 'none', 'idle'],
  ['examples-loading', 'phrase', 'idle', 1, 'closed', 'none', 'none', 'loading'],
  ['examples-playing', 'phrase', 'idle', 1, 'closed', 'none', 'none', 'playing'],
  ['examples-slow', 'phrase', 'idle', 1, 'closed', 'none', 'none', 'playingSlow'],
  ['dictionary', 'idiom', 'idle', 2, 'closed', 'none', 'dict', 'idle'],
  ['leave', 'word', 'fix', 3, 'closed', 'none', 'leave', 'idle'],
  ['ask-word', 'word', 'fix', 3, 'open', 'none', 'none', 'idle'],
  ['ask-phrase', 'phrase', 'fix', 2, 'open', 'none', 'none', 'idle'],
  ['ask-idiom', 'idiom', 'fix', 3, 'open', 'none', 'none', 'idle'],
  ['ask-long-idiom', 'longIdiom', 'fix', 3, 'open', 'none', 'none', 'idle'],
  ['ask-no-provider', 'idiom', 'idle', 2, 'noProvider', 'none', 'none', 'idle'],
  ['err-model', 'word', 'idle', 0, 'closed', 'none', 'modelMissing', 'idle'],
  ['err-mic', 'word', 'idle', 2, 'closed', 'mic', 'none', 'idle'],
  ['err-analysis', 'word', 'idle', 2, 'closed', 'analysis', 'none', 'idle'],
  ['err-offline-audio', 'phrase', 'idle', 2, 'closed', 'offlineAudio', 'none', 'idle'],
]
const RESULTS: [string, ResultVariant][] = [
  ['1-star', { stars: 1 }],
  ['2-stars', { stars: 2 }],
  ['3-stars', { stars: 3 }],
  ['new-best', { stars: 3, newBest: true }],
  ['compare', { stars: 2, compare: true }],
  ['compare-new-best', { stars: 3, compare: true, newBest: true }],
  ['last-chapter', { stars: 3, last: true, newBest: true }],
]

/** Dev/test-only gallery of the pronunciation game screens (ENGC-85). */
export function ScreensGame() {
  const { t, i18n } = useTranslation()
  const theme = useThemePreference()
  const [sizeIdx, setSizeIdx] = useState(0)
  const size = SIZES[sizeIdx]!
  const w = size.w
  return (
    <TooltipProvider>
      <main className="space-y-10 p-8" data-testid="screens-game">
        <header className="flex flex-wrap items-center gap-6">
          <h1 className="text-3xl font-semibold">Pronunciation game screens</h1>
          <div role="group" aria-label={t('settings.theme')} className="flex gap-2">
            {(['light', 'dark'] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={theme === k ? 'default' : 'outline'}
                aria-pressed={theme === k}
                data-testid={`ds-theme-${k}`}
                onClick={() => setThemePreference(k)}
              >
                {k}
              </Button>
            ))}
          </div>
          <div role="group" aria-label={t('language.label')} className="flex gap-2">
            {(['en', 'vi'] as const).map((l) => (
              <Button
                key={l}
                size="sm"
                variant={i18n.language === l ? 'default' : 'outline'}
                aria-pressed={i18n.language === l}
                data-testid={`lang-${l}`}
                onClick={() => void i18n.changeLanguage(l)}
              >
                {l}
              </Button>
            ))}
          </div>
          <div role="group" aria-label="Window size" className="flex gap-2">
            {SIZES.map((s, i) => (
              <Button
                key={s.w}
                size="sm"
                variant={sizeIdx === i ? 'default' : 'outline'}
                aria-pressed={sizeIdx === i}
                data-testid={`size-${s.w}`}
                onClick={() => setSizeIdx(i)}
              >
                {s.w}×{s.h}
              </Button>
            ))}
          </div>
        </header>

        <Group id="map" title="Level map">
          {MAPS.map((v) => (
            <Frame key={v} id={`map-${v}`} title={`Map: ${v}`} size={size}>
              <LevelMapScreen width={w} variant={v} />
            </Frame>
          ))}
        </Group>

        <Group id="chapter" title="Chapter, Ask the agent, overlays and errors">
          {CHAPTERS.map(([id, target, phase, slots, ask, error, overlay, ex]) => (
            <Frame key={id} id={`chapter-${id}`} title={`Chapter: ${id}`} size={size}>
              <ChapterScreen
                width={w}
                target={target}
                phase={phase}
                slots={slots}
                ask={ask}
                error={error}
                overlay={overlay}
                examples={ex}
              />
            </Frame>
          ))}
        </Group>

        <Group id="result" title="Result">
          {RESULTS.map(([id, v]) => (
            <Frame key={id} id={`result-${id}`} title={`Result: ${id}`} size={size}>
              <ResultScreen width={w} {...v} />
            </Frame>
          ))}
        </Group>
      </main>
    </TooltipProvider>
  )
}
