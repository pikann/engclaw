import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HomeScreen, type HomeState } from '@/components/screens/home-screens'
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

const STATES: [HomeState, string][] = [
  ['first-run', 'First run'],
  ['returning', 'Returning user with data'],
  ['partial', 'Partial data (no conversation yet)'],
  ['loading', 'Loading skeletons'],
  ['downloading', 'Models downloading'],
  ['no-provider', 'No AI provider (Converse hint)'],
  ['offline', 'Offline'],
]

/** Dev/test-only gallery of the Home dashboard (ENGC-87): every state at the chosen size. */
export function ScreensHome() {
  const { t, i18n } = useTranslation()
  const theme = useThemePreference()
  const [sizeIdx, setSizeIdx] = useState(0)
  const size = SIZES[sizeIdx]!
  const w = size.w
  return (
    <TooltipProvider>
      <main className="space-y-10 p-8" data-testid="screens-home">
        <header className="flex flex-wrap items-center gap-6">
          <h1 className="text-3xl font-semibold">Home dashboard</h1>
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

        <Group id="home" title="Home dashboard">
          {STATES.map(([s, title]) => (
            <Frame key={s} id={`home-${s}`} title={title} size={size}>
              <HomeScreen width={w} state={s} />
            </Frame>
          ))}
        </Group>
      </main>
    </TooltipProvider>
  )
}
