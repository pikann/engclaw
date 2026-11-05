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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Logo } from '@/components/ui/logo'
import { Progress } from '@/components/ui/progress'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
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

const SIDEBAR_KEY = 'engclaw.sidebarCollapsed'

/** Sidebar open state: the saved choice if there is one, otherwise it follows the window width. */
function useSidebarOpen(layout: Layout): [boolean, (open: boolean) => void] {
  const [saved, setSaved] = useState<boolean | null>(() => {
    const v = localStorage.getItem(SIDEBAR_KEY)
    return v === null ? null : v === '0'
  })
  const setOpen = useCallback((open: boolean) => {
    localStorage.setItem(SIDEBAR_KEY, open ? '0' : '1')
    setSaved(open)
  }, [])
  return [saved ?? layout !== 'compact', setOpen]
}

function NavItem({
  icon: Icon,
  label,
  to,
  active,
  testId,
  trailing,
}: {
  icon: LucideIcon
  label: string
  /** Without a route the item is static (design-system gallery). */
  to?: string
  active?: boolean
  testId?: string
  trailing?: React.ReactNode
}) {
  const content = (
    <>
      <Icon aria-hidden="true" />
      <span className="group-data-[collapsible=icon]:sr-only">{label}</span>
    </>
  )
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        {to ? (
          <Link
            to={to}
            data-testid={testId ?? `nav-${to === '/' ? 'home' : to.slice(1)}`}
            aria-current={active ? 'page' : undefined}
          >
            {content}
          </Link>
        ) : (
          <div aria-current={active ? 'page' : undefined}>{content}</div>
        )}
      </SidebarMenuButton>
      {trailing}
    </SidebarMenuItem>
  )
}

/** Static app chrome for the gallery: sidebar, page header and status bar (IA doc §1.1). */
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
  const [open, setOpen] = useSidebarOpen(layout)
  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      className="bg-background text-foreground relative h-full min-h-0 w-full overflow-hidden"
    >
      <Sidebar
        collapsible="icon"
        role="navigation"
        aria-label={t('screens.shell.nav')}
        className="absolute h-full"
      >
        <SidebarHeader>
          <div className="text-primary flex h-9 items-center gap-2.5 pl-[9px] text-lg font-semibold">
            <Logo label="Engclaw" className="h-6 shrink-0" />
            <span className="truncate group-data-[collapsible=icon]:hidden">Engclaw</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {NAV.map(({ key, icon }) => (
                <NavItem
                  key={key}
                  icon={icon}
                  active={key === active}
                  to={linked ? ROUTES[key] : undefined}
                  label={t(`screens.shell.${key}`)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <NavItem
              icon={Download}
              label={t('screens.shell.models')}
              to={linked ? '/settings' : undefined}
              testId="nav-models"
              trailing={
                modelsPercent != null && (
                  <SidebarMenuBadge className="tabular-nums">{modelsPercent}%</SidebarMenuBadge>
                )
              }
            />
            {modelsPercent != null && (
              <Progress
                value={modelsPercent}
                aria-label={t('models.dl.progressLabel')}
                className="mx-2 w-auto group-data-[collapsible=icon]:hidden"
              />
            )}
            <NavItem
              icon={Settings}
              active={active === 'settings'}
              to={linked ? '/settings' : undefined}
              label={t('screens.shell.settings')}
            />
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger
            data-testid="sidebar-toggle"
            aria-label={t('screens.shell.toggleSidebar')}
            title={`${t('screens.shell.toggleSidebar')} (Ctrl/⌘ B)`}
            className="-ml-2"
          />
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
      </SidebarInset>
    </SidebarProvider>
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
