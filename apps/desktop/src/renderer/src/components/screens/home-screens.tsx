import {
  CheckCircle2,
  Download,
  Gamepad2,
  MessageCircle,
  Mic,
  Pause,
  Play,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppShell, layoutOf } from '@/components/screens/shell'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type HomeState =
  'first-run' | 'returning' | 'partial' | 'loading' | 'downloading' | 'no-provider' | 'offline'

type ModelStatus = 'ready' | 'downloading' | 'missing'

const QUICK: { key: 'practice' | 'shadowing' | 'game' | 'converse'; icon: LucideIcon }[] = [
  { key: 'practice', icon: Mic },
  { key: 'shadowing', icon: Play },
  { key: 'game', icon: Gamepad2 },
  { key: 'converse', icon: MessageCircle },
]

const RECENT = [
  { text: 'The thorough thought went through.', mode: 'read', score: 84, hours: -2 },
  { text: 'I go to the market yesterday', mode: 'free', score: 71, hours: -5 },
  { text: 'Could you tell me where the station is?', mode: 'shadowing', score: 90, hours: -26 },
  { text: 'Chapter 12: three, free, thrill', mode: 'game', score: 65, hours: -50 },
  { text: 'She sells seashells by the seashore.', mode: 'read', score: 58, hours: -100 },
] as const

function useWhen() {
  const { i18n } = useTranslation()
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
  return (hours: number) =>
    Math.abs(hours) < 24 ? rtf.format(hours, 'hour') : rtf.format(Math.round(hours / 24), 'day')
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
      {children}
    </h3>
  )
}

function QuickActions({ state }: { state: HomeState }) {
  const { t } = useTranslation()
  return (
    <ul
      aria-label={t('screens.home.quickLabel')}
      className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
    >
      {QUICK.map(({ key, icon: Icon }) => (
        <li key={key} className="min-w-0">
          <Button
            variant={key === 'practice' ? 'default' : 'outline'}
            className="h-auto w-full justify-start gap-2 py-2.5 whitespace-normal"
          >
            <Icon aria-hidden="true" />
            <span className="min-w-0 text-left">{t(`screens.shell.${key}`)}</span>
            {key === 'converse' && state === 'no-provider' && (
              <span
                aria-hidden="true"
                className="bg-warning ml-auto size-2 shrink-0 rounded-full"
              />
            )}
          </Button>
        </li>
      ))}
    </ul>
  )
}

function ContinueCard({
  icon: Icon,
  kicker,
  title,
  meta,
  progress,
  disabledHint,
}: {
  icon: LucideIcon
  kicker: string
  title: string
  meta: string
  progress?: number
  disabledHint?: string
}) {
  const { t } = useTranslation()
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex h-full flex-col gap-3 px-4">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <Icon className="text-primary size-3.5" aria-hidden="true" />
          {kicker}
        </p>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-2 break-words font-medium">{title}</p>
          <p className="text-muted-foreground text-sm">{meta}</p>
          {progress != null && (
            <Progress value={progress} aria-label={meta} className="mt-2 h-1.5" />
          )}
        </div>
        {disabledHint && <p className="text-muted-foreground text-xs">{disabledHint}</p>}
        <Button size="sm" variant="outline" className="self-start" disabled={!!disabledHint}>
          {t('screens.home.continueCta')}
        </Button>
      </CardContent>
    </Card>
  )
}

function ContinueSection({ state }: { state: HomeState }) {
  const { t } = useTranslation()
  const when = useWhen()
  const offline = state === 'offline'
  const partial = state === 'partial'
  if (state === 'first-run') return null
  return (
    <section aria-labelledby="home-continue" className="space-y-3">
      <SectionTitle id="home-continue">{t('screens.home.continueTitle')}</SectionTitle>
      {state === 'loading' ? (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4"
          aria-hidden="true"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4"
          data-testid="home-continue-cards"
        >
          <ContinueCard
            icon={Gamepad2}
            kicker={t('screens.shell.game')}
            title="th: three, free, thrill"
            meta={t('screens.home.chapterMeta', { n: 12, stars: 2 })}
            progress={66}
          />
          <ContinueCard
            icon={Play}
            kicker={t('screens.shell.shadowing')}
            title="How to order coffee in English"
            meta={t('screens.home.videoMeta', { n: 14, total: 40 })}
            progress={35}
            disabledHint={offline ? t('screens.home.needsInternet') : undefined}
          />
          {state === 'no-provider' ? (
            <Card className="border-warning bg-warning-soft text-warning-soft-foreground gap-3 py-4">
              <CardContent className="flex h-full flex-col gap-3 px-4">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <MessageCircle className="size-3.5" aria-hidden="true" />
                  {t('screens.shell.converse')}
                </p>
                <div className="flex-1 space-y-1">
                  <p className="font-medium">{t('screens.home.noProviderTitle')}</p>
                  <p className="text-sm">{t('screens.home.noProviderBody')}</p>
                </div>
                <Button size="sm" variant="outline" className="self-start">
                  {t('screens.home.noProviderCta')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            !partial && (
              <ContinueCard
                icon={MessageCircle}
                kicker={t('screens.shell.converse')}
                title="Ordering at a café"
                meta={t('screens.home.convMeta', { when: when(-26) })}
                disabledHint={offline ? t('screens.home.needsInternet') : undefined}
              />
            )
          )}
        </div>
      )}
    </section>
  )
}

function RecentAttempts({ state }: { state: HomeState }) {
  const { t } = useTranslation()
  const when = useWhen()
  const rows = state === 'first-run' ? [] : state === 'partial' ? RECENT.slice(0, 2) : RECENT
  return (
    <section aria-labelledby="home-recent" className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle id="home-recent">{t('screens.home.recentTitle')}</SectionTitle>
        {rows.length > 0 && (
          <Button variant="link" size="xs" className="px-0">
            {t('screens.home.viewAll')}
          </Button>
        )}
      </div>
      {state === 'loading' ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed py-6" data-testid="home-recent-empty">
          <CardContent className="text-muted-foreground px-4 text-sm">
            {t('screens.home.noRecent')}
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-xl border" data-testid="home-recent">
          {rows.map((r) => (
            <li key={r.text} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.text}</p>
                <p className="text-muted-foreground text-xs">{when(r.hours)}</p>
              </div>
              <Badge variant="outline" className="max-w-[40%] shrink">
                <span className="truncate">
                  {t(
                    r.mode === 'read' || r.mode === 'free'
                      ? `screens.practice.mode.${r.mode}`
                      : `screens.shell.${r.mode}`,
                  )}
                </span>
              </Badge>
              <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
                {t('screens.home.scoreOf', { score: r.score })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ModelStatus({ status, loading }: { status: ModelStatus; loading: boolean }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="home-models" className="space-y-3">
      <SectionTitle id="home-models">{t('screens.home.modelTitle')}</SectionTitle>
      {loading ? (
        <Skeleton className="h-32 rounded-xl" aria-hidden="true" />
      ) : (
        <Card className={cn('gap-3 py-4', status === 'missing' && 'border-dashed')}>
          <CardContent className="space-y-3 px-4" data-testid={`home-models-${status}`}>
            {status === 'ready' && (
              <>
                <p className="bg-success-soft text-success-soft-foreground flex items-start gap-2 rounded-md p-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {t('screens.home.modelReady')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('screens.home.modelSize', { size: '1.3 GB' })}
                </p>
                <Button size="sm" variant="outline">
                  {t('screens.home.modelManage')}
                </Button>
              </>
            )}
            {status === 'downloading' && (
              <>
                <p className="text-sm">{t('models.dl.title')}</p>
                <div className="space-y-1.5">
                  <Progress value={62} aria-label={t('models.dl.progressLabel')} />
                  <p className="text-muted-foreground flex justify-between text-xs tabular-nums">
                    <span>{t('models.progress', { received: '812 MB', total: '1.3 GB' })}</span>
                    <span>62%</span>
                  </p>
                </div>
                <Button size="sm" variant="outline">
                  <Pause />
                  {t('models.dl.pause')}
                </Button>
              </>
            )}
            {status === 'missing' && (
              <>
                <p className="flex items-start gap-2 text-sm">
                  <Download
                    className="text-muted-foreground mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {t('screens.home.modelsNotice')}
                </p>
                <Button size="sm">
                  <Download />
                  {t('models.dl.start', { size: '1.3 GB' })}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}

/**
 * Home dashboard (IA doc §1.1): quick actions, Continue cards, recent attempts and model status.
 * One component for every state, so the first-run Home and the returning Home share a layout.
 */
export function HomeScreen({ width, state }: { width: number; state: HomeState }) {
  const { t } = useTranslation()
  const status: ModelStatus =
    state === 'first-run' ? 'missing' : state === 'downloading' ? 'downloading' : 'ready'
  const first = state === 'first-run'
  return (
    <AppShell
      layout={layoutOf(width)}
      active="home"
      title={t('screens.shell.home')}
      modelsPercent={status === 'downloading' ? 62 : null}
    >
      <div className="h-full space-y-6 overflow-auto p-6" aria-busy={state === 'loading'}>
        {state === 'loading' && (
          <p role="status" className="sr-only">
            {t('screens.home.loading')}
          </p>
        )}
        {state === 'offline' && (
          <Alert
            className="border-warning bg-warning-soft text-warning-soft-foreground flex gap-2"
            data-testid="home-offline"
          >
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">{t('screens.home.offlineTitle')}</p>
              <p>{t('screens.home.offlineBody')}</p>
            </div>
          </Alert>
        )}
        <div className="space-y-1">
          <h3 className="text-2xl font-semibold">
            {t(first ? 'screens.home.welcome' : 'screens.home.backTitle')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t(first ? 'screens.home.welcomeBody' : 'screens.home.backBody')}
          </p>
        </div>
        <QuickActions state={state} />
        <ContinueSection state={state} />
        <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6">
          <RecentAttempts state={state} />
          <ModelStatus status={status} loading={state === 'loading'} />
        </div>
      </div>
    </AppShell>
  )
}
