import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DownloadOverlayScreen,
  FirstRunHomeScreen,
  LockedFeatureScreen,
  type DownloadState,
} from '@/components/screens/model-screens'
import {
  PracticeScreen,
  type PracticeMode,
  type PracticePhase,
} from '@/components/screens/practice-screens'
import {
  DictationScreen,
  ShadowingEntryScreen,
  ShadowingSessionScreen,
  type DictationState,
  type EntryState,
  type SessionState,
} from '@/components/screens/shadowing-screens'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setThemePreference, useThemePreference } from '@/lib/theme'

/** Window presets: minimum, default and wide (IA doc §0.2). */
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

const PRACTICE: [PracticeMode, PracticePhase][] = [
  ['read', 'idle'],
  ['read', 'empty-hint'],
  ['read', 'recording'],
  ['read', 'analyzing'],
  ['read', 'result'],
  ['read', 'error-mic'],
  ['read', 'error-model'],
  ['read', 'error-failed'],
  ['free', 'idle'],
  ['free', 'transcribing'],
  ['free', 'check'],
  ['free', 'analyzing'],
  ['free', 'result'],
]
const ENTRY: EntryState[] = [
  'empty',
  'loading',
  'invalid',
  'noTranscript',
  'unavailable',
  'network',
  'no-recents',
]
const SESSION: [SessionState, boolean][] = [
  ['loading', true],
  ['ready', true],
  ['playing', false],
  ['recording', false],
  ['analyzing', false],
  ['result', false],
  ['hidden', false],
  ['stopped', false],
  ['focus', false],
]
const DICTATION: DictationState[] = ['typing', 'checked', 'summary', 'stopped']
const DOWNLOAD: DownloadState[] = [
  'prompt',
  'downloading',
  'paused',
  'offline',
  'error',
  'lowDisk',
  'unwritable',
  'done',
]

/**
 * Dev/test-only gallery of the core practice screens (ENGC-82): every state at the chosen
 * window size, in the current theme and language.
 */
export function ScreensCore() {
  const { t, i18n } = useTranslation()
  const theme = useThemePreference()
  const [sizeIdx, setSizeIdx] = useState(0)
  const size = SIZES[sizeIdx]!
  const w = size.w
  return (
    <TooltipProvider>
      <main className="space-y-10 p-8" data-testid="screens-core">
        <header className="flex flex-wrap items-center gap-6">
          <h1 className="text-3xl font-semibold">Core practice screens</h1>
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

        <Group id="first-run" title="First run and model download">
          <Frame id="home" title="First-run Home" size={size}>
            <FirstRunHomeScreen width={w} />
          </Frame>
          {DOWNLOAD.map((s) => (
            <Frame key={s} id={`dl-${s}`} title={`Download prompt: ${s}`} size={size}>
              <DownloadOverlayScreen width={w} state={s} />
            </Frame>
          ))}
          <Frame id="locked" title="Feature locked after Not now" size={size}>
            <LockedFeatureScreen width={w} />
          </Frame>
        </Group>

        <Group id="practice" title="Pronunciation practice">
          {PRACTICE.map(([m, p]) => (
            <Frame key={`${m}-${p}`} id={`practice-${m}-${p}`} title={`${m}: ${p}`} size={size}>
              <PracticeScreen width={w} mode={m} phase={p} />
            </Frame>
          ))}
        </Group>

        <Group id="shadowing" title="Shadowing">
          {ENTRY.map((s) => (
            <Frame key={s} id={`entry-${s}`} title={`URL entry: ${s}`} size={size}>
              <ShadowingEntryScreen width={w} state={s} />
            </Frame>
          ))}
          {SESSION.map(([s, rail]) => (
            <Frame
              key={s}
              id={`session-${s}`}
              title={`Session: ${s}${rail ? ' + transcript rail' : ''}`}
              size={size}
            >
              <ShadowingSessionScreen width={w} state={s} rail={rail} />
            </Frame>
          ))}
        </Group>

        <Group id="dictation" title="Dictation">
          {DICTATION.map((s) => (
            <Frame key={s} id={`dictation-${s}`} title={`Dictation: ${s}`} size={size}>
              <DictationScreen width={w} state={s} />
            </Frame>
          ))}
        </Group>
      </main>
    </TooltipProvider>
  )
}
