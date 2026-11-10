import {
  BookOpen,
  Gamepad2,
  History,
  Home,
  type LucideIcon,
  MessageCircle,
  MessageSquareText,
  Mic,
  Play,
  Settings,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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

const FEEDBACK_URL = 'https://github.com/pikann/engclaw/issues/new/choose'

/** Sidebar button that opens the GitHub issue chooser in the system browser; shows a toast if that fails. */
function FeedbackItem({ onFailed }: { onFailed: () => void }) {
  const { t } = useTranslation()
  const open = async () => {
    const ok = await window.engclaw.app.openExternal({ url: FEEDBACK_URL }).catch(() => false)
    if (!ok) onFailed()
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        tooltip={t('screens.shell.feedbackTooltip')}
        data-testid="nav-feedback"
        onClick={() => void open()}
      >
        <MessageSquareText aria-hidden="true" />
        <span className="group-data-[collapsible=icon]:sr-only">{t('screens.shell.feedback')}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** Fallback shown when the browser could not be opened; lets the user copy the link. */
function FeedbackToast({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    timer.current = setTimeout(onClose, 15000)
    return () => clearTimeout(timer.current)
  }, [onClose])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(FEEDBACK_URL)
      setCopied(true)
    } catch {
      /* clipboard unavailable: the issues address is in the message */
    }
  }
  return (
    <div
      role="status"
      data-testid="feedback-toast"
      className="bg-card absolute right-4 bottom-10 z-20 flex max-w-sm items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg"
    >
      <span className="flex-1">
        {copied ? t('screens.shell.feedbackCopied') : t('screens.shell.feedbackFailed')}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="focus-visible:ring-ring rounded text-xs font-medium underline underline-offset-2 outline-none focus-visible:ring-2"
      >
        {t('screens.shell.feedbackCopy')}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="focus-visible:ring-ring rounded text-xs outline-none focus-visible:ring-2"
      >
        {t('screens.shell.feedbackDismiss')}
      </button>
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
  modelsMissing = false,
  linked,
  mic = 'ready',
  provider = null,
  children,
}: {
  layout: Layout
  /** Real routing: items become links and the router marks the active one. */
  linked?: boolean
  mic?: 'ready' | 'missing'
  /** Model name of the configured AI provider, or null when none is set up. */
  provider?: string | null
  active: NavKey
  title: React.ReactNode
  actions?: React.ReactNode
  /** Sidebar Models badge: download progress, or null when nothing is downloading. */
  modelsPercent?: number | null
  /** Footer: some model is not installed (and none is downloading). */
  modelsMissing?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useSidebarOpen(layout)
  const [feedbackFailed, setFeedbackFailed] = useState(false)
  const closeToast = useCallback(() => setFeedbackFailed(false), [])
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
          <div className="text-primary flex h-10 items-center gap-3 p-2.5 text-lg font-semibold group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
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
            {modelsPercent != null && (
              <Progress
                value={modelsPercent}
                aria-label={t('models.dl.progressLabel')}
                className="mx-2 w-auto group-data-[collapsible=icon]:hidden"
              />
            )}
            <FeedbackItem onFailed={() => setFeedbackFailed(true)} />
            <NavItem
              icon={Settings}
              active={active === 'settings'}
              to={linked ? '/settings' : undefined}
              label={t('screens.shell.settings')}
              trailing={
                modelsPercent != null && (
                  <SidebarMenuBadge className="tabular-nums">{modelsPercent}%</SidebarMenuBadge>
                )
              }
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
        {feedbackFailed && <FeedbackToast onClose={closeToast} />}
        <footer className="text-muted-foreground flex h-7 shrink-0 items-center gap-4 border-t px-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn('size-2 rounded-full', mic === 'ready' ? 'bg-success' : 'bg-warning')}
            />
            {t(mic === 'ready' ? 'screens.shell.micReady' : 'screens.shell.micMissing')}
          </span>
          {modelsPercent == null && modelsMissing ? (
            <span className="flex items-center gap-1.5" data-testid="footer-models">
              <span aria-hidden="true" className="bg-warning size-2 rounded-full" />
              {linked ? (
                <Link to="/settings" className="underline-offset-2 hover:underline">
                  {t('screens.shell.modelsMissing')}
                </Link>
              ) : (
                t('screens.shell.modelsMissing')
              )}
            </span>
          ) : (
            <span data-testid="footer-models">
              {t(
                modelsPercent != null
                  ? 'screens.shell.modelsDownloading'
                  : 'screens.shell.modelsReady',
              )}
            </span>
          )}
          <span data-testid="footer-provider">
            {provider
              ? t('screens.shell.providerName', { name: provider })
              : t('screens.shell.providerNone')}
          </span>
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
