import {
  CheckCircle2,
  Download,
  Gamepad2,
  MessageCircle,
  Mic,
  Play,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AppShell, layoutOf } from '@/components/screens/shell'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type HomeState =
  'first-run' | 'returning' | 'partial' | 'loading' | 'downloading' | 'no-provider' | 'offline'

export type RecentMode = 'read' | 'free' | 'shadowing' | 'game'

export interface RecentRow {
  id: string
  text: string
  mode: RecentMode
  score: number
  /** Epoch milliseconds. */
  at: number
}

export interface ContinueItem {
  kind: 'game' | 'shadowing' | 'converse'
  title: string
  meta: string
  progress?: number
}

export interface ModelCardData {
  status: 'ready' | 'downloading' | 'missing'
  percent: number
  received: string
  total: string
}

export interface HomeData {
  loading: boolean
  offline: boolean
  /** True when Converse has no AI provider to talk to. */
  noProvider: boolean
  recent: RecentRow[]
  /** Hidden until a feature has something to continue. */
  items: ContinueItem[]
  model: ModelCardData
  onDownload?: () => void
}

const QUICK: {
  key: 'practice' | 'shadowing' | 'game' | 'converse'
  icon: LucideIcon
  to: string
}[] = [
  { key: 'practice', icon: Mic, to: '/practice' },
  { key: 'shadowing', icon: Play, to: '/shadowing' },
  { key: 'game', icon: Gamepad2, to: '/game' },
  { key: 'converse', icon: MessageCircle, to: '/converse' },
]

const ICONS = { game: Gamepad2, shadowing: Play, converse: MessageCircle } as const

function useWhen() {
  const { i18n } = useTranslation()
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
  return (at: number) => {
    const hours = Math.round((at - Date.now()) / 3_600_000)
    return Math.abs(hours) < 24
      ? rtf.format(hours, 'hour')
      : rtf.format(Math.round(hours / 24), 'day')
  }
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
      {children}
    </h3>
  )
}

function QuickActions({ noProvider }: { noProvider: boolean }) {
  const { t } = useTranslation()
  return (
    <ul
      aria-label={t('screens.home.quickLabel')}
      className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
    >
      {QUICK.map(({ key, icon: Icon, to }) => (
        <li key={key} className="min-w-0">
          <Link
            to={to}
            data-testid={`home-quick-${key}`}
            className={cn(
              buttonVariants({ variant: key === 'practice' ? 'default' : 'outline' }),
              'h-auto w-full justify-start gap-2 py-2.5 whitespace-normal',
            )}
          >
            <Icon aria-hidden="true" />
            <span className="min-w-0 text-left">{t(`screens.shell.${key}`)}</span>
            {key === 'converse' && noProvider && (
              <span
                aria-hidden="true"
                className="bg-warning ml-auto size-2 shrink-0 rounded-full"
              />
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ContinueCard({ item, disabledHint }: { item: ContinueItem; disabledHint?: string }) {
  const { t } = useTranslation()
  const Icon = ICONS[item.kind]
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex h-full flex-col gap-3 px-4">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <Icon className="text-primary size-3.5" aria-hidden="true" />
          {t(`screens.shell.${item.kind}`)}
        </p>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-2 wrap-break-word font-medium">{item.title}</p>
          <p className="text-muted-foreground text-sm">{item.meta}</p>
          {item.progress != null && (
            <Progress value={item.progress} aria-label={item.meta} className="mt-2 h-1.5" />
          )}
        </div>
        {disabledHint && <p className="text-muted-foreground text-xs">{disabledHint}</p>}
        {disabledHint ? (
          <Button size="sm" variant="outline" className="self-start" disabled>
            {t('screens.home.continueCta')}
          </Button>
        ) : (
          <Link
            to={`/${item.kind}`}
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'self-start')}
          >
            {t('screens.home.continueCta')}
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

function NoProviderCard() {
  const { t } = useTranslation()
  return (
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
        <Link
          to="/settings"
          data-testid="home-no-provider"
          className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'self-start')}
        >
          {t('screens.home.noProviderCta')}
        </Link>
      </CardContent>
    </Card>
  )
}

function ContinueSection({ data, firstRun }: { data: HomeData; firstRun: boolean }) {
  const { t } = useTranslation()
  const items = data.items.filter((i) => !(data.noProvider && i.kind === 'converse'))
  const showHint = data.noProvider && !firstRun
  if (!data.loading && (firstRun || (items.length === 0 && !showHint))) return null
  return (
    <section aria-labelledby="home-continue" className="space-y-3">
      <SectionTitle id="home-continue">{t('screens.home.continueTitle')}</SectionTitle>
      {data.loading ? (
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
          {items.map((item) => (
            <ContinueCard
              key={item.kind}
              item={item}
              disabledHint={
                data.offline && item.kind !== 'game' ? t('screens.home.needsInternet') : undefined
              }
            />
          ))}
          {showHint && <NoProviderCard />}
        </div>
      )}
    </section>
  )
}

function RecentAttempts({ data }: { data: HomeData }) {
  const { t } = useTranslation()
  const when = useWhen()
  const rows = data.recent
  return (
    <section aria-labelledby="home-recent" className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle id="home-recent">{t('screens.home.recentTitle')}</SectionTitle>
        {!data.loading && rows.length > 0 && (
          <Link
            to="/history"
            data-testid="home-view-all"
            className={cn(buttonVariants({ variant: 'link', size: 'xs' }), 'px-0')}
          >
            {t('screens.home.viewAll')}
          </Link>
        )}
      </div>
      {data.loading ? (
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
            <li key={r.id}>
              <Link
                to={`/history?attempt=${encodeURIComponent(r.id)}`}
                data-testid="home-recent-item"
                className="hover:bg-muted/50 focus-visible:ring-ring flex items-center gap-3 px-4 py-2.5 outline-none first:rounded-t-xl last:rounded-b-xl focus-visible:ring-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.text}</p>
                  <p className="text-muted-foreground text-xs">{when(r.at)}</p>
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ModelStatusCard({ data }: { data: HomeData }) {
  const { t } = useTranslation()
  const { status, percent, received, total } = data.model
  const manage = (
    <Link
      to="/settings?tab=models"
      data-testid="home-models-manage"
      className={buttonVariants({ size: 'sm', variant: 'outline' })}
    >
      {t('screens.home.modelManage')}
    </Link>
  )
  return (
    <section aria-labelledby="home-models" className="space-y-3">
      <SectionTitle id="home-models">{t('screens.home.modelTitle')}</SectionTitle>
      {data.loading ? (
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
                  {t('screens.home.modelSize', { size: total })}
                </p>
                {manage}
              </>
            )}
            {status === 'downloading' && (
              <>
                <p className="text-sm">{t('models.dl.title')}</p>
                <div className="space-y-1.5">
                  <Progress
                    value={percent}
                    aria-label={t('models.dl.progressLabel')}
                    data-testid="home-models-progress"
                  />
                  <p className="text-muted-foreground flex justify-between text-xs tabular-nums">
                    <span>{t('models.progress', { received, total })}</span>
                    <span>{percent}%</span>
                  </p>
                </div>
                {manage}
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
                <Button size="sm" data-testid="home-models-download" onClick={data.onDownload}>
                  <Download />
                  {t('models.dl.start', { size: total })}
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
export function HomeDashboard({ data }: { data: HomeData }) {
  const { t } = useTranslation()
  const firstRun = data.recent.length === 0 && data.items.length === 0
  return (
    <div className="space-y-6" aria-busy={data.loading} data-testid="home">
      {data.loading && (
        <p role="status" className="sr-only">
          {t('screens.home.loading')}
        </p>
      )}
      {data.offline && (
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
          {t(firstRun ? 'screens.home.welcome' : 'screens.home.backTitle')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t(firstRun ? 'screens.home.welcomeBody' : 'screens.home.backBody')}
        </p>
      </div>
      <QuickActions noProvider={data.noProvider} />
      <ContinueSection data={data} firstRun={firstRun && !data.loading} />
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6">
        <RecentAttempts data={data} />
        <ModelStatusCard data={data} />
      </div>
    </div>
  )
}

const HOUR = 3_600_000

const MOCK_RECENT: { text: string; mode: RecentMode; score: number; hours: number }[] = [
  { text: 'The thorough thought went through.', mode: 'read', score: 84, hours: -2 },
  { text: 'I go to the market yesterday', mode: 'free', score: 71, hours: -5 },
  { text: 'Could you tell me where the station is?', mode: 'shadowing', score: 90, hours: -26 },
  { text: 'Chapter 12: three, free, thrill', mode: 'game', score: 65, hours: -50 },
  { text: 'She sells seashells by the seashore.', mode: 'read', score: 58, hours: -100 },
]

/** Gallery wrapper: the dashboard inside the static shell, fed with sample data per state. */
export function HomeScreen({ width, state }: { width: number; state: HomeState }) {
  const { t } = useTranslation()
  const when = useWhen()
  const first = state === 'first-run'
  const loading = state === 'loading'
  const recent: RecentRow[] = (
    first ? [] : state === 'partial' ? MOCK_RECENT.slice(0, 2) : MOCK_RECENT
  ).map((r, i) => ({ ...r, id: String(i), at: Date.now() + r.hours * HOUR }))
  const items: ContinueItem[] = first
    ? []
    : [
        {
          kind: 'game',
          title: 'th: three, free, thrill',
          meta: t('screens.home.chapterMeta', { n: 12, stars: 2 }),
          progress: 66,
        },
        {
          kind: 'shadowing',
          title: 'How to order coffee in English',
          meta: t('screens.home.videoMeta', { n: 14, total: 40 }),
          progress: 35,
        },
        ...(state === 'partial'
          ? []
          : [
              {
                kind: 'converse' as const,
                title: 'Ordering at a café',
                meta: t('screens.home.convMeta', { when: when(Date.now() - 26 * HOUR) }),
              },
            ]),
      ]
  const model: ModelCardData =
    first || state === 'downloading'
      ? first
        ? { status: 'missing', percent: 0, received: '0 B', total: '1.3 GB' }
        : { status: 'downloading', percent: 62, received: '812 MB', total: '1.3 GB' }
      : { status: 'ready', percent: 100, received: '1.3 GB', total: '1.3 GB' }
  return (
    <AppShell
      layout={layoutOf(width)}
      active="home"
      title={t('screens.shell.home')}
      modelsPercent={model.status === 'downloading' ? model.percent : null}
    >
      <div className="h-full overflow-auto p-6">
        <HomeDashboard
          data={{
            loading,
            offline: state === 'offline',
            noProvider: state === 'no-provider',
            recent,
            items,
            model,
          }}
        />
      </div>
    </AppShell>
  )
}
