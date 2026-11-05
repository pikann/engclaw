import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import type { ModelProgress, ModelStatus } from '@engclaw/ipc-contract'
import { PracticeCard } from '@/components/practice-card'
import { AppShell, useLayout, type NavKey } from '@/components/screens/shell'
import { aggregateProgress } from '@/lib/model-download'

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
function useModelsPercent(): number | null {
  const [models, setModels] = useState<ModelStatus[]>([])
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({})
  useEffect(() => {
    const refresh = () => void window.engclaw.models.list().then(setModels)
    refresh()
    return window.engclaw.models.onProgress((e) => {
      setProgress((p) => ({ ...p, [e.id]: e }))
      if (e.phase === 'ready' || e.phase === 'cancelled' || e.phase === 'error') refresh()
      else setModels((m) => m.map((x) => (x.id === e.id ? { ...x, state: 'downloading' } : x)))
    })
  }, [])
  const active = models.filter((m) => m.state === 'downloading')
  return active.length > 0 ? aggregateProgress(active, progress).percent : null
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

/**
 * The real app chrome. Practice is rendered here rather than as a route element so it stays
 * mounted (and an in-flight recording or analysis survives) while the user visits other pages.
 */
export function AppLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const layout = useLayout()
  const modelsPercent = useModelsPercent()
  const mic = useMic()
  const active = TITLES[pathname] ?? 'home'
  const onPractice = pathname === '/practice'
  const known = pathname in TITLES
  return (
    <div className="h-screen">
      <AppShell
        linked
        layout={layout}
        active={active}
        mic={mic}
        modelsPercent={modelsPercent}
        title={known ? t(`screens.shell.${active}`) : t('screens.shell.comingSoon')}
      >
        <main className="h-full overflow-auto p-6">
          <div hidden={!onPractice} className="mx-auto max-w-2xl">
            <PracticeCard />
          </div>
          {!onPractice && <Outlet />}
        </main>
      </AppShell>
    </div>
  )
}
