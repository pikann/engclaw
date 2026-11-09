import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import { PracticeScreen } from '@/components/practice-screen'
import { WordLookupProvider } from '@/components/word-lookup-dialog'
import { AppShell, useLayout, type NavKey } from '@/components/screens/shell'
import { footerModelsStatus, modelCard } from '@/lib/model-download'
import { LLM_CHANGED_EVENT } from '@/lib/llm-events'
import { useModels } from '@/lib/use-models'

const TITLES: Record<string, NavKey> = {
  '/': 'home',
  '/practice': 'practice',
  '/shadowing': 'shadowing',
  '/converse': 'converse',
  '/game': 'game',
  '/dictionary': 'dictionary',
  '/history': 'history',
  '/settings': 'settings',
}

/** Download percent while any model is downloading, otherwise null. */
function useModelsStatus(): { percent: number | null; missing: boolean } {
  const { models, progress } = useModels()
  const card = modelCard(models ?? [], progress)
  return {
    percent: card.status === 'downloading' ? card.aggregate.percent : null,
    missing: footerModelsStatus(models) === 'missing',
  }
}

function useMic(): 'ready' | 'missing' {
  const [mic, setMic] = useState<'ready' | 'missing'>('ready')
  useEffect(() => {
    const check = () =>
      void navigator.mediaDevices
        ?.enumerateDevices()
        .then((d) => setMic(d.some((x) => x.kind === 'audioinput') ? 'ready' : 'missing'))
        .catch(() => setMic('missing'))
    check()
    navigator.mediaDevices?.addEventListener('devicechange', check)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', check)
  }, [])
  return mic
}

/** Model of the configured AI provider (null if none); re-read on navigation and after settings change it. */
function useProvider(refreshKey: string): string | null {
  const [provider, setProvider] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const load = () =>
      void window.engclaw.llm
        .status()
        .then((s) => live && setProvider(s.kind === 'none' ? null : (s.model ?? s.baseUrl)))
        .catch(() => undefined)
    load()
    window.addEventListener(LLM_CHANGED_EVENT, load)
    return () => {
      live = false
      window.removeEventListener(LLM_CHANGED_EVENT, load)
    }
  }, [refreshKey])
  return provider
}

/**
 * The real app chrome. Practice is rendered here rather than as a route element so it stays
 * mounted (and an in-flight recording or analysis survives) while the user visits other pages.
 */
export function AppLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const layout = useLayout()
  const models = useModelsStatus()
  const mic = useMic()
  const provider = useProvider(pathname)
  const section = pathname.startsWith('/game/') ? '/game' : pathname
  const active = TITLES[section] ?? 'home'
  const onPractice = pathname === '/practice'
  const fullBleed =
    pathname === '/shadowing' ||
    pathname === '/converse' ||
    pathname === '/dictionary' ||
    pathname.startsWith('/game/chapter/')
  const known = section in TITLES
  return (
    <WordLookupProvider>
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
        className="bg-background text-foreground focus-visible:ring-ring/50 sr-only z-50 rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-[3px]"
      >
        {t('skipToContent')}
      </a>
      <div className="h-screen">
        <AppShell
          linked
          layout={layout}
          active={active}
          mic={mic}
          provider={provider}
          modelsPercent={models.percent}
          modelsMissing={models.missing}
          title={known ? t(`screens.shell.${active}`) : t('screens.shell.comingSoon')}
        >
          <main id="main-content" tabIndex={-1} className="h-full outline-none">
            <div hidden={!onPractice} className="h-full">
              <PracticeScreen />
            </div>
            {!onPractice && (
              <div className={fullBleed ? 'h-full' : 'h-full overflow-auto p-6'}>
                <Outlet />
              </div>
            )}
          </main>
        </AppShell>
      </div>
    </WordLookupProvider>
  )
}
