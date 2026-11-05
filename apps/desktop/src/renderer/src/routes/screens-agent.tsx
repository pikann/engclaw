import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ConverseScreen,
  type ConverseTurn,
  type ConverseVariant,
  type ConverseView,
} from '@/components/screens/converse-screens'
import {
  ProviderOverlayScreen,
  SettingsProviderScreen,
  type ProviderStatus,
} from '@/components/screens/provider-screens'
import { Button } from '@/components/ui/button'
import type { ConnectionStatus } from '@/components/ui/provider-form'
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

const SETUP: [ProviderStatus, ConnectionStatus][] = [
  ['signed-out', 'idle'],
  ['signing-in', 'idle'],
  ['signed-in', 'idle'],
  ['expired', 'idle'],
  ['error', 'idle'],
  ['api', 'ok'],
  ['signed-out', 'testing'],
  ['signed-out', 'failed'],
]
const SETTINGS: [ProviderStatus, ConnectionStatus][] = [
  ['signed-in', 'idle'],
  ['signed-out', 'idle'],
  ['expired', 'idle'],
  ['error', 'idle'],
  ['api', 'ok'],
]
const CONVERSE: [string, ConverseView, ConverseTurn, ConverseVariant][] = [
  ['listening', 'transcript', 'listening', 'normal'],
  ['thinking', 'transcript', 'thinking', 'normal'],
  ['speaking-streaming', 'transcript', 'speaking', 'streaming'],
  ['speaking', 'transcript', 'speaking', 'normal'],
  ['interrupted', 'transcript', 'listening', 'interrupted'],
  ['cards-listening', 'cards', 'listening', 'normal'],
  ['cards-speaking', 'cards', 'speaking', 'normal'],
  ['cards-empty', 'cards', 'idle', 'empty'],
  ['empty', 'transcript', 'idle', 'empty'],
  ['tool-failed', 'transcript', 'idle', 'toolFailed'],
  ['card-error', 'cards', 'idle', 'cardError'],
  ['just-signed-in', 'transcript', 'idle', 'justSignedIn'],
  ['no-provider', 'transcript', 'idle', 'noProvider'],
  ['no-models', 'transcript', 'idle', 'noModels'],
  ['provider-expired', 'transcript', 'idle', 'providerExpired'],
  ['mic-error', 'transcript', 'idle', 'micError'],
  ['list', 'transcript', 'idle', 'listOpen'],
  ['list-empty', 'transcript', 'idle', 'emptyList'],
]

/** Dev/test-only gallery of the AI agent screens (ENGC-83). */
export function ScreensAgent() {
  const { t, i18n } = useTranslation()
  const theme = useThemePreference()
  const [sizeIdx, setSizeIdx] = useState(0)
  const size = SIZES[sizeIdx]!
  const w = size.w
  return (
    <TooltipProvider>
      <main className="space-y-10 p-8" data-testid="screens-agent">
        <header className="flex flex-wrap items-center gap-6">
          <h1 className="text-3xl font-semibold">AI agent screens</h1>
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

        <Group id="setup" title="Provider setup (first use)">
          {SETUP.map(([s, c]) => (
            <Frame
              key={`${s}-${c}`}
              id={`setup-${s}-${c}`}
              title={`Setup: ${s} / test ${c}`}
              size={size}
            >
              <ProviderOverlayScreen width={w} status={s} test={c} />
            </Frame>
          ))}
        </Group>

        <Group id="settings" title="Settings → AI provider">
          {SETTINGS.map(([s, c]) => (
            <Frame key={`${s}-${c}`} id={`settings-${s}`} title={`Settings: ${s}`} size={size}>
              <SettingsProviderScreen width={w} status={s} test={c} />
            </Frame>
          ))}
        </Group>

        <Group id="converse" title="Conversation, cards and blocking states">
          {CONVERSE.map(([id, v, turn, variant]) => (
            <Frame key={id} id={`converse-${id}`} title={`Converse: ${id}`} size={size}>
              <ConverseScreen width={w} view={v} turn={turn} variant={variant} />
            </Frame>
          ))}
        </Group>
      </main>
    </TooltipProvider>
  )
}
