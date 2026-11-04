import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Play, Trash2, Upload } from 'lucide-react'
import type { HistoryAttempt, HistoryFileResult } from '@engclaw/ipc-contract'
import { Button } from '@/components/ui/button'
import { playPcm } from '@/lib/audio'

const PAGE = 20

/** Past attempts: replay the recording, delete, export / import as JSON. */
export function HistoryPanel() {
  const { t } = useTranslation()
  const [items, setItems] = useState<HistoryAttempt[]>([])
  const [total, setTotal] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const playing = useRef<{ stop: () => void } | null>(null)

  const load = useCallback(async (limit: number) => {
    const r = await window.engclaw.history.list({ limit })
    setItems(r.attempts)
    setTotal(r.total)
  }, [])

  useEffect(() => {
    void load(PAGE)
    return () => playing.current?.stop()
  }, [load])

  const replay = async (id: string): Promise<void> => {
    playing.current?.stop()
    const samples = await window.engclaw.history.audio({ id })
    if (!samples) return
    const h = playPcm(samples, 16000)
    playing.current = h
    void h.done.finally(() => {
      if (playing.current === h) playing.current = null
    })
  }

  const remove = async (id: string): Promise<void> => {
    await window.engclaw.history.delete({ id })
    await load(Math.max(PAGE, items.length))
  }

  const report = async (res: HistoryFileResult): Promise<void> => {
    if (res.status === 'exported') setNotice(t('history.exported', { count: res.count }))
    else if (res.status === 'imported') {
      setNotice(t('history.imported', { imported: res.imported, skipped: res.skipped }))
      await load(Math.max(PAGE, items.length))
    } else if (res.status === 'error') setNotice(t('history.fileError', { message: res.message }))
  }

  return (
    <section className="space-y-3 rounded-lg border p-4" data-testid="history-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('history.title')}</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="history-export"
            disabled={total === 0}
            onClick={async () => report(await window.engclaw.history.export())}
          >
            <Download />
            {t('history.export')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="history-import"
            onClick={async () => report(await window.engclaw.history.import())}
          >
            <Upload />
            {t('history.import')}
          </Button>
        </div>
      </div>
      {notice && (
        <p role="status" className="text-muted-foreground text-sm" data-testid="history-notice">
          {notice}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid="history-empty">
          {t('history.empty')}
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2" data-testid="history-item">
              <span className="w-16 text-lg font-semibold tabular-nums">{Math.round(a.score)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{a.text}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(a.createdAt).toLocaleString()} · {t(`history.mode_${a.mode}`)} ·{' '}
                  {a.errors.length > 0
                    ? t('history.errors', { count: a.errors.length })
                    : t('history.clean')}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!a.hasAudio}
                title={a.hasAudio ? undefined : t('history.noAudio')}
                aria-label={t('history.play')}
                data-testid="history-play"
                onClick={() => void replay(a.id)}
              >
                <Play />
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={t('history.delete')}
                data-testid="history-delete"
                onClick={() => void remove(a.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {items.length < total && (
        <Button size="sm" variant="outline" onClick={() => void load(items.length + PAGE)}>
          {t('history.loadMore')}
        </Button>
      )}
    </section>
  )
}
