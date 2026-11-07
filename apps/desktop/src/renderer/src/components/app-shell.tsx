import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import { PracticeScreen } from '@/components/practice-screen'
import { AppShell, useLayout, type NavKey } from '@/components/screens/shell'
import { modelCard } from '@/lib/model-download'
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
function useModelsPercent(): number | null {
  const { models, progress } = useModels()
  const card = modelCard(models ?? [], progress)
  return card.status === 'downloading' ? card.aggregate.percent : null
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
  const fullBleed = pathname === '/shadowing' || pathname === '/dictionary'
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
        <main className="h-full">
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
  )
}
