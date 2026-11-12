import { useLearningLanguage } from '@/lib/learning-language'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HistoryAttempt } from '@engclaw/ipc-contract'
import { ModelDownloadDialog } from '@/components/model-download-dialog'
import {
  HomeDashboard,
  type ModelCardData,
  type RecentRow,
} from '@/components/screens/home-screens'
import { formatBytes } from '@/lib/format'
import { modelCard } from '@/lib/model-download'
import { useModels } from '@/lib/use-models'

const RECENT_COUNT = 5

const toRow = (a: HistoryAttempt): RecentRow => ({
  id: a.id,
  text: a.text,
  mode: a.mode === 'sentence' ? 'read' : 'free',
  score: Math.round(a.score),
  at: a.createdAt,
})

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function Home() {
  const language = useLearningLanguage()
  const { models, progress, refresh } = useModels()
  const [recent, setRecent] = useState<RecentRow[] | null>(null)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const online = useOnline()

  useEffect(() => {
    void window.engclaw.history
      .list({ limit: RECENT_COUNT, language })
      .then((r) => setRecent(r.attempts.map(toRow)))
  }, [language])

  const card = modelCard(models ?? [], progress)
  const model: ModelCardData = {
    status: card.status,
    percent: card.aggregate.percent,
    received: formatBytes(card.aggregate.receivedBytes),
    total: formatBytes(card.aggregate.totalBytes),
  }
  return (
    <>
      <HomeDashboard
        data={{
          loading: models === null || recent === null,
          offline: !online,
          noProvider: true,
          recent: recent ?? [],
          items: [],
          model,
          onDownload: () => setDownloadOpen(true),
        }}
      />
      <ModelDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        onReady={() => {
          setDownloadOpen(false)
          void refresh()
        }}
      />
    </>
  )
}

export function ComingSoon() {
  const { t } = useTranslation()
  return (
    <section className="mx-auto max-w-2xl space-y-2" data-testid="coming-soon">
      <h2 className="text-xl font-semibold">{t('screens.shell.comingSoon')}</h2>
      <p className="text-muted-foreground">{t('screens.shell.comingSoonBody')}</p>
    </section>
  )
}
