import { useState } from 'react'
import { BookOpen, Mic, Search, Sparkles, Volume2, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConverseScreen } from '@/components/screens/converse-screens'
import { PracticeScreen } from '@/components/screens/practice-screens'
import { AppShell, Pane, layoutOf } from '@/components/screens/shell'
import { ShadowingSessionScreen } from '@/components/screens/shadowing-screens'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClickableWord } from '@/components/ui/clickable-word'
import { DictionaryDialog } from '@/components/ui/dictionary'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export type ImageState = 'image' | 'loading' | 'none' | 'offline'
export type AskState = 'ready' | 'noProvider'
export type DictSource = 'chat' | 'transcript' | 'practice'

/**
 * The fixed 160 x 160 image slot (IA doc §5, §7): the layout never shifts between states.
 * Attribution is always shown under a real image; the other states explain themselves in text.
 */
export function ImageSlot({ state }: { state: ImageState }) {
  const { t } = useTranslation()
  return (
    <figure className="w-40 shrink-0 space-y-1" data-testid={`image-slot-${state}`}>
      <div className="bg-muted text-muted-foreground flex size-40 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border p-3 text-center text-xs">
        {state === 'image' && (
          <svg
            viewBox="0 0 160 160"
            role="img"
            aria-label={t('screens.dictionary.imageAlt', { word: 'inspect' })}
            className="size-full"
          >
            <rect width="160" height="160" className="fill-primary-soft" />
            <circle cx="70" cy="70" r="34" fill="none" className="stroke-primary" strokeWidth="8" />
            <path
              d="M95 95 L132 132"
              className="stroke-primary"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </svg>
        )}
        {state === 'loading' && (
          <>
            <Skeleton className="size-full" />
            <span className="sr-only" role="status">
              {t('screens.dictionary.imageLoading')}
            </span>
          </>
        )}
        {state === 'none' && (
          <>
            <BookOpen aria-hidden="true" className="size-7" />
            <span>{t('screens.dictionary.noImage')}</span>
          </>
        )}
        {state === 'offline' && (
          <>
            <WifiOff aria-hidden="true" className="size-7" />
            <span>{t('screens.dictionary.imageOffline')}</span>
          </>
        )}
      </div>
      {state === 'image' && (
        <figcaption className="text-muted-foreground text-xs">
          {t('screens.dictionary.attribution')}
        </figcaption>
      )}
    </figure>
  )
}

const PROMPTS: Record<DictSource, string[]> = {
  chat: ['explain', 'examples', 'differ'],
  transcript: ['explain', 'inContext', 'examples'],
  practice: ['pronounce', 'examples', 'explain'],
}

/** Landscape entry: image beside text, then the Ask the agent row. */
export function EntryBody({
  image,
  ask,
  source,
  showOpen = true,
}: {
  image: ImageState
  ask: AskState
  source: DictSource
  /** The "Open in Dictionary" link is for the dialog; the page is already there. */
  showOpen?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <ImageSlot state={image} />
        <div className="min-w-0 space-y-2">
          <p className="flex flex-wrap items-center gap-2">
            <span lang="en-fonipa" className="text-base">
              /ɪnˈspekt/
            </span>
            <Button variant="ghost" size="icon-sm" aria-label={t('result.hearIt')}>
              <Volume2 />
            </Button>
            <Badge variant="secondary">{t('screens.dictionary.verb')}</Badge>
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>{t('screens.dictionary.def1')}</li>
            <li>{t('screens.dictionary.def2')}</li>
          </ol>
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground">in- + spect</span> · {t('screens.dictionary.root')}
          </p>
          <p className="text-muted-foreground text-sm italic">
            “{t('screens.dictionary.example')}”
          </p>
        </div>
      </div>
      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showOpen ? (
            <Button variant="outline" size="sm">
              {t('screens.dictionary.open')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {ask === 'noProvider' && (
              <Button variant="link" size="sm" className="px-0">
                {t('screens.dictionary.setupProvider')}
              </Button>
            )}
            <Button variant="secondary" size="sm" disabled={ask === 'noProvider'}>
              <Sparkles />
              {t('ds.dict.ask')}
            </Button>
          </div>
        </div>
        {ask === 'ready' && (
          <ul aria-label={t('ds.dict.quickPrompts')} className="flex flex-wrap gap-2">
            {PROMPTS[source].map((k) => (
              <li key={k}>
                <Button variant="outline" size="xs">
                  {t(`screens.dictionary.prompt.${k}`, { word: 'inspect' })}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Static dialog (fixed 720 px) so every state can be shown at once. */
export function DictionaryDialogStatic({
  image,
  ask,
  source,
}: {
  image: ImageState
  ask: AskState
  source: DictSource
}) {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby={`dict-title-${source}-${image}-${ask}`}
      className="bg-card w-[720px] max-w-full space-y-4 rounded-xl border p-6 shadow-lg"
      data-testid="screen-dictionary-dialog"
    >
      <h3 id={`dict-title-${source}-${image}-${ask}`} className="text-lg font-semibold">
        inspect
      </h3>
      <EntryBody image={image} ask={ask} source={source} />
      <p className="sr-only">{t('ds.dict.description', { word: 'inspect' })}</p>
    </section>
  )
}

/** The dialog over the screen whose word opened it, which stays untouched behind it. */
export function DictionaryOverContextScreen({
  width,
  source,
  image,
  ask,
}: {
  width: number
  source: DictSource
  image: ImageState
  ask: AskState
}) {
  return (
    <div className="relative h-full">
      {source === 'chat' && (
        <ConverseScreen width={width} view="transcript" turn="idle" variant="normal" />
      )}
      {source === 'transcript' && (
        <ShadowingSessionScreen width={width} state="result" rail={false} />
      )}
      {source === 'practice' && <PracticeScreen width={width} mode="read" phase="result" />}
      <div className="bg-background/70 absolute inset-0 flex items-center justify-center p-4 backdrop-blur-[1px]">
        <DictionaryDialogStatic image={image} ask={ask} source={source} />
      </div>
    </div>
  )
}

const RESULTS = ['inspect', 'inspector', 'inspection', 'spectator', 'prospect', 'perspective']

export type PageState = 'word' | 'recent' | 'noResults'

function ResultsList({ state }: { state: PageState }) {
  const { t } = useTranslation()
  const query = state === 'recent' ? '' : state === 'noResults' ? 'spectz' : 'spect'
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground absolute top-2.5 left-2.5 size-4"
        />
        <Input
          aria-label={t('screens.dictionary.search')}
          placeholder={t('screens.dictionary.search')}
          defaultValue={query}
          className="pl-8"
          readOnly
        />
      </div>
      {state === 'recent' && (
        <p className="text-muted-foreground text-sm">{t('screens.dictionary.recentHint')}</p>
      )}
      {state === 'noResults' ? (
        <p
          className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm"
          data-testid="no-results"
        >
          {t('screens.dictionary.noResults', { query })}
        </p>
      ) : (
        <ul
          aria-label={t(
            state === 'recent' ? 'screens.dictionary.recent' : 'screens.dictionary.results',
          )}
          className="space-y-0.5"
        >
          {RESULTS.map((w, i) => (
            <li
              key={w}
              aria-current={i === 0 && state === 'word' ? 'true' : undefined}
              className={cn(
                'rounded-md px-2 py-1.5 text-sm',
                i === 0 && state === 'word' && 'bg-primary-soft font-medium',
              )}
            >
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Family() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap gap-2">
        <Badge variant="outline">in-</Badge>
        <Badge variant="outline">spect · {t('screens.dictionary.rootMeaning')}</Badge>
      </p>
      <div>
        <h4 className="text-muted-foreground mb-1 text-xs font-medium">
          {t('screens.dictionary.family')}
        </h4>
        <ul className="space-y-1 text-sm">
          {['inspect', 'spectator', 'perspective'].map((w) => (
            <li key={w}>
              <ClickableWord>{w}</ClickableWord>
            </li>
          ))}
        </ul>
      </div>
      <Button variant="outline" size="sm">
        {t('screens.dictionary.quiz')}
      </Button>
    </div>
  )
}

function WordPage({ image, ask }: { image: ImageState; ask: AskState }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-semibold">inspect</h3>
      <EntryBody image={image} ask={ask} source="chat" showOpen={false} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm">
          <Volume2 />
          {t('screens.dictionary.pronounce')}
        </Button>
        <Button variant="outline" size="sm">
          <Mic />
          {t('screens.dictionary.sendPractice')}
        </Button>
      </div>
    </div>
  )
}

/** Dictionary page (IA doc §5): search · word page · roots and family. */
export function DictionaryPageScreen({
  width,
  state,
  image,
  ask,
}: {
  width: number
  state: PageState
  image: ImageState
  ask: AskState
}) {
  const { t } = useTranslation()
  const layout = layoutOf(width)
  const wide = layout === 'wide'
  const compact = layout === 'compact'
  const body =
    state === 'word' ? (
      wide ? (
        <WordPage image={image} ask={ask} />
      ) : (
        <Tabs defaultValue="word">
          <TabsList>
            <TabsTrigger value="word">{t('screens.dictionary.tabWord')}</TabsTrigger>
            <TabsTrigger value="roots">{t('screens.dictionary.tabRoots')}</TabsTrigger>
          </TabsList>
          <TabsContent value="word" className="pt-4">
            <WordPage image={image} ask={ask} />
          </TabsContent>
          <TabsContent value="roots" className="pt-4">
            <Family />
          </TabsContent>
        </Tabs>
      )
    ) : (
      <p className="text-muted-foreground flex h-full min-h-40 items-center justify-center text-center text-sm">
        {t(state === 'recent' ? 'screens.dictionary.pickWord' : 'screens.dictionary.tryAnother')}
      </p>
    )
  return (
    <AppShell
      layout={layout}
      active="dictionary"
      title={t('screens.shell.dictionary')}
      actions={
        <div
          role="tablist"
          aria-label={t('screens.dictionary.sections')}
          className="bg-muted flex rounded-lg p-0.5"
        >
          {(['search', 'roots', 'flashcards'] as const).map((k) => (
            <span
              key={k}
              role="tab"
              aria-selected={k === 'search'}
              className={cn(
                'rounded-md px-3 py-1 text-sm',
                k === 'search' ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t(`screens.dictionary.section.${k}`)}
            </span>
          ))}
        </div>
      }
    >
      <div
        className={cn(
          'grid h-full divide-x',
          wide
            ? 'grid-cols-[260px_1fr_280px]'
            : compact
              ? 'grid-cols-[220px_1fr]'
              : 'grid-cols-[260px_1fr]',
        )}
      >
        <Pane title={t('screens.dictionary.section.search')}>
          <ResultsList state={state} />
        </Pane>
        <Pane>{body}</Pane>
        {wide && (
          <Pane title={t('screens.dictionary.rootsTitle')}>
            {state === 'word' ? <Family /> : null}
          </Pane>
        )}
      </div>
    </AppShell>
  )
}

/** Live demo: real words open the real dialog, which returns focus to the word on close. */
export function LiveDictionaryDemo({ image, ask }: { image: ImageState; ask: AskState }) {
  const { t } = useTranslation()
  const [word, setWord] = useState<string | null>(null)
  return (
    <div className="space-y-3" data-testid="live-dictionary">
      <p className="text-2xl leading-loose">
        {['They', 'will', 'inspect', 'the', 'market', 'tomorrow'].map((w) => (
          <span key={w} className="mr-2 inline-block">
            <ClickableWord aria-expanded={word === w} onClick={() => setWord(w)}>
              {w}
            </ClickableWord>
          </span>
        ))}
      </p>
      <p className="text-muted-foreground text-sm">{t('screens.dictionary.liveHint')}</p>
      <DictionaryDialog
        open={word !== null}
        onOpenChange={(o) => !o && setWord(null)}
        word={word ?? ''}
      >
        <EntryBody image={image} ask={ask} source="transcript" />
      </DictionaryDialog>
    </div>
  )
}
