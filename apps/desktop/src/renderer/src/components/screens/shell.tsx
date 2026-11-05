import {
  BookOpen,
  Download,
  Gamepad2,
  History,
  Home,
  type LucideIcon,
  MessageCircle,
  Mic,
  PanelLeft,
  Play,
  Settings,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
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

const ROUTES: Record<Exclude<NavKey, 'settings'>, string> = {
  home: '/',
  practice: '/practice',
  shadowing: '/shadowing',
  converse: '/converse',
  game: '/game',
  dictionary: '/dictionary',
  history: '/history',
}

/** Windows narrower than this collapse the sidebar to icons (IA doc §0.2). */
export const COMPACT_BELOW = 1100
/** Windows at least this wide get three panes (IA doc §0.2). */
export const WIDE_FROM = 1440

export type Layout = 'compact' | 'standard' | 'wide'
export const layoutOf = (width: number): Layout =>
  width < COMPACT_BELOW ? 'compact' : width < WIDE_FROM ? 'standard' : 'wide'

/** The layout class for the live window width. */
export function useLayout(): Layout {
  const [layout, setLayout] = useState(() => layoutOf(window.innerWidth))
  useEffect(() => {
    const onResize = () => setLayout(layoutOf(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return layout
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  iconOnly,
  trailing,
  to,
  testId,
  secondary,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  iconOnly: boolean
  trailing?: React.ReactNode
  /** When set, the item is a real route link and the router decides which one is active. */
  to?: string
  testId?: string
  /** A shortcut into another item's page: a plain link that is never marked current. */
  secondary?: boolean
}) {
  const className = (isActive: boolean) =>
    cn(
      'flex h-9 items-center gap-3 rounded-md px-3 text-sm',
      isActive ? 'bg-primary-soft text-foreground font-medium' : 'text-muted-foreground',
      iconOnly && 'justify-center px-0',
      to && 'hover:text-foreground focus-visible:ring-ring outline-none focus-visible:ring-2',
    )
  const content = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {iconOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="truncate">{label}</span>
      )}
      {!iconOnly && trailing}
    </>
  )
  if (to && secondary)
    return (
      <Link
        to={to}
        title={iconOnly ? label : undefined}
        data-testid={testId}
        className={className(false)}
      >
        {content}
      </Link>
    )
  if (to)
    return (
      <NavLink
        to={to}
        end
        title={iconOnly ? label : undefined}
        data-testid={testId ?? `nav-${to === '/' ? 'home' : to.slice(1)}`}
        className={({ isActive }) => className(isActive)}
      >
        {content}
      </NavLink>
    )
  return (
    <div
      aria-current={active ? 'page' : undefined}
      title={iconOnly ? label : undefined}
      className={className(!!active)}
    >
      {content}
    </div>
  )
}

/** Static app chrome for the gallery: sidebar, page header and status bar (IA doc §1.1). */
const SIDEBAR_KEY = 'engclaw.sidebarCollapsed'

/** Collapsed state of the sidebar: the user's saved choice, else follows the window width. */
function useSidebarCollapsed(layout: Layout): [boolean, () => void] {
  const [saved, setSaved] = useState<boolean | null>(() => {
    const v = localStorage.getItem(SIDEBAR_KEY)
    return v === null ? null : v === '1'
  })
  const collapsed = saved ?? layout === 'compact'
  const toggle = useCallback(() => {
    const next = !collapsed
    localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
    setSaved(next)
  }, [collapsed])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'b' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
  return [collapsed, toggle]
}

export function AppShell({
  layout,
  active,
  title,
  actions,
  modelsPercent,
  linked,
  mic = 'ready',
  children,
}: {
  layout: Layout
  /** Real routing: items become links and the router marks the active one. */
  linked?: boolean
  mic?: 'ready' | 'missing'
  active: NavKey
  title: React.ReactNode
  actions?: React.ReactNode
  /** Sidebar Models badge: download progress, or null when nothing is downloading. */
  modelsPercent?: number | null
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const [iconOnly, toggleSidebar] = useSidebarCollapsed(layout)
  return (
    <div className="bg-background text-foreground flex h-full w-full overflow-hidden">
      <nav
        aria-label={t('screens.shell.nav')}
        className={cn(
          'bg-card flex shrink-0 flex-col gap-1 overflow-hidden border-r p-2 transition-[width] duration-200',
          iconOnly ? 'w-16' : 'w-60',
        )}
      >
        <div
          className={cn(
            'text-primary mb-2 flex h-9 items-center gap-2.5 px-3 text-base font-semibold',
            iconOnly && 'justify-center px-0',
          )}
        >
          <Logo label={iconOnly ? 'Engclaw' : undefined} className="h-5" />
          {!iconOnly && 'Engclaw'}
        </div>
        {NAV.map(({ key, icon }) => (
          <SidebarItem
            key={key}
            icon={icon}
            iconOnly={iconOnly}
            active={key === active}
            to={linked ? ROUTES[key] : undefined}
            label={t(`screens.shell.${key}`)}
          />
        ))}
        <div className="mt-auto space-y-1">
          <SidebarItem
            icon={Download}
            iconOnly={iconOnly}
            label={t('screens.shell.models')}
            to={linked ? '/settings' : undefined}
            secondary
            testId="nav-models"
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
            to={linked ? '/settings' : undefined}
            label={t('screens.shell.settings')}
          />
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="sidebar-toggle"
            aria-label={t('screens.shell.toggleSidebar')}
            aria-expanded={!iconOnly}
            title={`${t('screens.shell.toggleSidebar')} (Ctrl/⌘ B)`}
            onClick={toggleSidebar}
            className="-ml-2"
          >
            <PanelLeft aria-hidden="true" />
          </Button>
          <h1 data-testid="page-title" className="min-w-0 flex-1 truncate text-lg font-semibold">
            {title}
          </h1>
          {actions}
        </header>
        <div className="min-h-0 flex-1">{children}</div>
        <footer className="text-muted-foreground flex h-7 shrink-0 items-center gap-4 border-t px-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn('size-2 rounded-full', mic === 'ready' ? 'bg-success' : 'bg-warning')}
            />
            {t(mic === 'ready' ? 'screens.shell.micReady' : 'screens.shell.micMissing')}
          </span>
          <span>
            {t(
              modelsPercent != null
                ? 'screens.shell.modelsDownloading'
                : 'screens.shell.modelsReady',
            )}
          </span>
          <span>{t('screens.shell.providerNone')}</span>
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
