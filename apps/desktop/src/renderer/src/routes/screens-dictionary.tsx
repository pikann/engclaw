import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DictionaryOverContextScreen,
  DictionaryPageScreen,
  LiveDictionaryDemo,
  type AskState,
  type DictSource,
  type ImageState,
  type PageState,
} from '@/components/screens/dictionary-screens'
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

const DIALOGS: [DictSource, ImageState, AskState][] = [
  ['chat', 'image', 'ready'],
  ['transcript', 'image', 'ready'],
  ['practice', 'image', 'ready'],
  ['chat', 'loading', 'ready'],
  ['chat', 'none', 'ready'],
  ['chat', 'offline', 'ready'],
  ['chat', 'image', 'noProvider'],
]
const PAGES: [PageState, ImageState, AskState][] = [
  ['word', 'image', 'ready'],
  ['word', 'loading', 'ready'],
  ['word', 'none', 'ready'],
  ['word', 'offline', 'ready'],
  ['word', 'image', 'noProvider'],
  ['recent', 'image', 'ready'],
  ['noResults', 'image', 'ready'],
]

/** Dev/test-only gallery of the dictionary dialog and page (ENGC-84). */
export function ScreensDictionary() {
  const { t, i18n } = useTranslation()
  const theme = useThemePreference()
  const [sizeIdx, setSizeIdx] = useState(0)
  const size = SIZES[sizeIdx]!
  const w = size.w
  return (
    <TooltipProvider>
      <main className="space-y-10 p-8" data-testid="screens-dictionary">
        <header className="flex flex-wrap items-center gap-6">
          <h1 className="text-3xl font-semibold">Dictionary screens</h1>
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

        <Group id="live" title="Live dialog (click a word, Esc closes and returns focus)">
          <LiveDictionaryDemo image="image" ask="ready" />
        </Group>

        <Group id="dialog" title="Dictionary dialog over its context">
          {DIALOGS.map(([src, img, ask]) => (
            <Frame
              key={`${src}-${img}-${ask}`}
              id={`dialog-${src}-${img}-${ask}`}
              title={`Dialog from ${src}: image ${img}, ask ${ask}`}
              size={size}
            >
              <DictionaryOverContextScreen width={w} source={src} image={img} ask={ask} />
            </Frame>
          ))}
        </Group>

        <Group id="page" title="Dictionary page">
          {PAGES.map(([st, img, ask]) => (
            <Frame
              key={`${st}-${img}-${ask}`}
              id={`page-${st}-${img}-${ask}`}
              title={`Page: ${st}, image ${img}, ask ${ask}`}
              size={size}
            >
              <DictionaryPageScreen width={w} state={st} image={img} ask={ask} />
            </Frame>
          ))}
        </Group>
      </main>
    </TooltipProvider>
  )
}
