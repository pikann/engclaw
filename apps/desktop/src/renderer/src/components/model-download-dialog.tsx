import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelProgress, ModelsDiskInfo, ModelStatus } from '@engclaw/ipc-contract'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/lib/format'
import { aggregateProgress, spaceProblem } from '@/lib/model-download'

type Run = 'idle' | 'downloading' | 'paused' | 'failed'
type Stop = 'pause' | 'discard' | null

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every model is installed after a download that ran in this dialog. */
  onReady: () => void
}

/**
 * First-run prompt for the models an action needs: sizes, licenses, free disk space, an advanced
 * download-folder picker, and aggregated progress with pause/resume, cancel and retry.
 * Pausing keeps the partial files, so resuming (or retrying after a failure) continues from them.
 */
export function ModelDownloadDialog({ open, onOpenChange, onReady }: Props) {
  const { t } = useTranslation()
  const [models, setModels] = useState<ModelStatus[]>([])
  const [disk, setDisk] = useState<ModelsDiskInfo | null>(null)
  const [queue, setQueue] = useState<ModelStatus[]>([])
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({})
  const [run, setRun] = useState<Run>('idle')
  const [error, setError] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [folderChanged, setFolderChanged] = useState(false)
  const stop = useRef<Stop>(null)
  const current = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    const [list, info] = await Promise.all([
      window.engclaw.models.list(),
      window.engclaw.models.diskInfo(),
    ])
    setModels(list)
    setDisk(info)
  }, [])

  useEffect(() => {
    if (!open) return
    setRun('idle')
    setError(null)
    setQueue([])
    setProgress({})
    setFolderError(null)
    void refresh()
    return window.engclaw.models.onProgress((e) => setProgress((p) => ({ ...p, [e.id]: e })))
  }, [open, refresh])

  const missing = models.filter((m) => m.state !== 'ready')
  const rows = queue.length > 0 ? queue : missing
  const totalBytes = rows.reduce((n, m) => n + m.sizeBytes, 0)
  const agg = aggregateProgress(rows, progress)
  const problem = run === 'idle' ? spaceProblem(totalBytes, disk) : null
  const downloading = run === 'downloading'

  const start = async (): Promise<void> => {
    const todo = rows
    setQueue(todo)
    setRun('downloading')
    setError(null)
    stop.current = null
    for (const m of todo) {
      current.current = m.id
      const res = await window.engclaw.models.download({ id: m.id })
      if (res.ok) continue
      if (res.code !== 'CANCELLED') {
        setError(t(`models.error.${res.code}`))
        setRun('failed')
        void refresh()
        return
      }
      if (stop.current === 'discard') {
        // Drop what this run left behind, but never an installed model.
        const now = await window.engclaw.models.list()
        for (const q of todo)
          if (now.find((n) => n.id === q.id)?.state !== 'ready')
            await window.engclaw.models.remove({ id: q.id })
        onOpenChange(false)
      } else setRun('paused')
      return
    }
    setRun('idle')
    onReady()
  }

  const interrupt = (how: Exclude<Stop, null>): void => {
    stop.current = how
    if (current.current) void window.engclaw.models.cancel({ id: current.current })
  }

  const discard = async (): Promise<void> => {
    if (downloading) return interrupt('discard')
    // Paused or failed: nothing is running, so just clear the partial files.
    for (const q of queue) await window.engclaw.models.remove({ id: q.id })
    onOpenChange(false)
  }

  const chooseFolder = async (): Promise<void> => {
    setFolderError(null)
    const res = await window.engclaw.models.chooseDir()
    if (res.status === 'rejected')
      setFolderError(
        res.reason === 'NOT_WRITABLE'
          ? t('models.dl.folderNotWritable', { dir: res.info.dir })
          : t('models.dl.folderNoSpace', {
              needed: formatBytes(res.neededBytes),
              free: formatBytes(res.info.freeBytes),
            }),
      )
    if (res.status === 'chosen') {
      setFolderChanged(true)
      setQueue([])
      setProgress({})
      setRun('idle')
      setError(null)
      await refresh()
    }
  }

  // The tick of 10 % keeps the live region from announcing every chunk.
  const announced = Math.floor(agg.percent / 10) * 10

  return (
    <Dialog open={open} onOpenChange={(o) => (o || !downloading) && onOpenChange(o)}>
      <DialogContent data-testid="model-download-dialog">
        <DialogTitle>{t('models.dl.title')}</DialogTitle>
        {rows.length === 0 && run === 'idle' ? (
          <DialogDescription data-testid="model-download-allready">
            {t('models.dl.allReady')}
          </DialogDescription>
        ) : (
          <DialogDescription>{t('models.dl.body')}</DialogDescription>
        )}

        <ul className="space-y-2">
          {rows.map((m) => (
            <li key={m.id} className="text-sm" data-testid={`model-download-row-${m.id}`}>
              <div className="font-medium">{m.name}</div>
              <div className="text-muted-foreground text-xs">
                {t('models.size', { size: formatBytes(m.sizeBytes) })} ·{' '}
                {t('models.license', { license: m.license })}
              </div>
            </li>
          ))}
        </ul>

        {rows.length > 0 && (
          <p className="text-sm" data-testid="model-download-summary">
            {t('models.dl.total', { size: formatBytes(totalBytes) })}
            {disk && ` · ${t('models.dl.free', { size: formatBytes(disk.freeBytes) })}`}
          </p>
        )}

        {run !== 'idle' && (
          <div className="space-y-1">
            <Progress
              value={agg.percent}
              aria-label={t('models.dl.progressLabel')}
              data-testid="model-download-progress"
            />
            <div className="text-muted-foreground text-xs">
              {run === 'paused'
                ? t('models.dl.paused')
                : t('models.progress', {
                    received: formatBytes(agg.receivedBytes),
                    total: formatBytes(agg.totalBytes),
                  })}
            </div>
            <p role="status" className="sr-only">
              {downloading ? t('models.dl.announce', { percent: announced }) : ''}
            </p>
          </div>
        )}

        {problem && (
          <Alert className="border-destructive" data-testid="model-download-problem">
            {problem === 'NOT_WRITABLE'
              ? t('models.dl.folderNotWritable', { dir: disk?.dir ?? '' })
              : t('models.error.DISK_SPACE')}
          </Alert>
        )}
        {error && (
          <Alert className="border-destructive" data-testid="model-download-error">
            {error}
          </Alert>
        )}

        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            aria-expanded={advanced}
            aria-controls="model-download-advanced"
            data-testid="model-download-advanced-toggle"
            onClick={() => setAdvanced((a) => !a)}
          >
            {t('models.dl.advanced')}
          </Button>
          {advanced && (
            <div id="model-download-advanced" className="space-y-2 text-sm">
              <p>{t('models.dl.location')}</p>
              <code className="block break-all text-xs" data-testid="model-download-dir">
                {disk?.dir}
              </code>
              <Button
                variant="outline"
                size="sm"
                disabled={downloading}
                data-testid="model-download-choose-folder"
                onClick={() => void chooseFolder()}
              >
                {t('models.changeFolder')}
              </Button>
              {folderError && (
                <Alert className="border-destructive" data-testid="model-download-folder-error">
                  {folderError}
                </Alert>
              )}
              {folderChanged && !folderError && (
                <p className="text-muted-foreground text-xs" data-testid="model-download-moved">
                  {t('models.dl.notMoved')}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {run === 'idle' && rows.length > 0 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('models.dl.notNow')}
              </Button>
              <Button
                disabled={problem !== null}
                data-testid="model-download-start"
                onClick={() => void start()}
              >
                {t('models.dl.start', { size: formatBytes(totalBytes) })}
              </Button>
            </>
          )}
          {run === 'idle' && rows.length === 0 && (
            <Button onClick={() => onOpenChange(false)}>{t('models.dl.close')}</Button>
          )}
          {downloading && (
            <>
              <Button
                variant="outline"
                data-testid="model-download-pause"
                onClick={() => interrupt('pause')}
              >
                {t('models.dl.pause')}
              </Button>
              <Button
                variant="outline"
                data-testid="model-download-cancel"
                onClick={() => void discard()}
              >
                {t('models.cancel')}
              </Button>
            </>
          )}
          {run === 'paused' && (
            <>
              <Button
                variant="outline"
                data-testid="model-download-cancel"
                onClick={() => void discard()}
              >
                {t('models.cancel')}
              </Button>
              <Button data-testid="model-download-resume" onClick={() => void start()}>
                {t('models.dl.resume')}
              </Button>
            </>
          )}
          {run === 'failed' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('models.dl.close')}
              </Button>
              <Button data-testid="model-download-retry" onClick={() => void start()}>
                {t('practice.retry')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
