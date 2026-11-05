import {
  BookOpen,
  Download,
  Gamepad2,
  History,
  Home,
  type LucideIcon,
  MessageCircle,
  Mic,
  Play,
  Settings,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export type NavKey =
  'home' | 'practice' | 'shadowing' | 'converse' | 'game' | 'dictionary' | 'history' | 'settings'

const NAV: { key: Exclude<NavKey, 'settings'>; icon: LucideIcon }[] = [
  { key: 'home', icon: Home },
  { key: 'practice', icon: Mic },
  { key: 'shadowing', icon: Play },
  { key: 'converse', icon: MessageCircle },
  { key: 'game', icon: Gamepad2 },
  { key: 'dictionary', icon: BookOpen },
  { key: 'history', icon: History },
]

/** Windows narrower than this collapse the sidebar to icons (IA doc §0.2). */
export const COMPACT_BELOW = 1100
/** Windows at least this wide get three panes (IA doc §0.2). */
export const WIDE_FROM = 1440

export type Layout = 'compact' | 'standard' | 'wide'
export const layoutOf = (width: number): Layout =>
  width < COMPACT_BELOW ? 'compact' : width < WIDE_FROM ? 'standard' : 'wide'

function SidebarItem({
  icon: Icon,
  label,
  active,
  iconOnly,
  trailing,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  iconOnly: boolean
  trailing?: React.ReactNode
}) {
  return (
    <div
      aria-current={active ? 'page' : undefined}
      title={iconOnly ? label : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-md px-3 text-sm',
        active ? 'bg-primary-soft text-foreground font-medium' : 'text-muted-foreground',
        iconOnly && 'justify-center px-0',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {iconOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="truncate">{label}</span>
      )}
      {!iconOnly && trailing}
    </div>
  )
}

/** Static app chrome for the gallery: sidebar, page header and status bar (IA doc §1.1). */
export function AppShell({
  layout,
  active,
  title,
  actions,
  modelsPercent,
  children,
}: {
  layout: Layout
  active: NavKey
  title: React.ReactNode
  actions?: React.ReactNode
  /** Sidebar Models badge: download progress, or null when nothing is downloading. */
  modelsPercent?: number | null
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const iconOnly = layout === 'compact'
  return (
    <div className="bg-background text-foreground flex h-full w-full overflow-hidden">
      <nav
        aria-label={t('screens.shell.nav')}
        className={cn(
          'bg-card flex shrink-0 flex-col gap-1 border-r p-2',
          iconOnly ? 'w-16' : 'w-60',
        )}
      >
        <div
          className={cn(
            'text-primary mb-2 flex h-9 items-center gap-2 px-3 text-base font-semibold',
            iconOnly && 'justify-center px-0',
          )}
        >
          <span aria-hidden="true" className="bg-primary size-3 rounded-full" />
          {iconOnly ? <span className="sr-only">Engclaw</span> : 'Engclaw'}
        </div>
        {NAV.map(({ key, icon }) => (
          <SidebarItem
            key={key}
            icon={icon}
            iconOnly={iconOnly}
            active={key === active}
            label={t(`screens.shell.${key}`)}
          />
        ))}
        <div className="mt-auto space-y-1">
          <SidebarItem
            icon={Download}
            iconOnly={iconOnly}
            label={t('screens.shell.models')}
            trailing={
              modelsPercent != null && (
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {modelsPercent}%
                </span>
              )
            }
          />
          {modelsPercent != null && !iconOnly && (
            <Progress
              value={modelsPercent}
              aria-label={t('models.dl.progressLabel')}
              className="mx-3 w-auto"
            />
          )}
          <SidebarItem
            icon={Settings}
            iconOnly={iconOnly}
            active={active === 'settings'}
            label={t('screens.shell.settings')}
          />
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
          {actions}
        </header>
        <div className="min-h-0 flex-1">{children}</div>
        <footer className="text-muted-foreground flex h-7 shrink-0 items-center gap-4 border-t px-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-success size-2 rounded-full" />
            {t('screens.shell.micReady')}
          </span>
          <span>
            {t(
              modelsPercent != null
                ? 'screens.shell.modelsDownloading'
                : 'screens.shell.modelsReady',
            )}
          </span>
        </footer>
      </div>
    </div>
  )
}

/** A titled, internally scrolling pane. Work screens scroll inside panes, never the window. */
export function Pane({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('flex min-h-0 min-w-0 flex-col', className)}>
      {(title || actions) && (
        <div className="flex h-10 shrink-0 items-center gap-2 px-4">
          {title && (
            <h3 className="text-muted-foreground flex-1 text-xs font-medium tracking-wide uppercase">
              {title}
            </h3>
          )}
          {actions}
        </div>
      )}
      <div
        className={cn('min-h-0 flex-1 overflow-auto px-4 pb-4', !title && 'pt-4', bodyClassName)}
      >
        {children}
      </div>
    </section>
  )
}
