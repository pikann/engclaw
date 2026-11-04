import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelProgress, ModelStatus } from '@engclaw/ipc-contract'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/lib/format'

/**
 * Lists the catalogued models: consent-gated download with aggregated progress, cancel,
 * delete / re-download, offline-ready state, and the models-folder shortcuts.
 */
export function ModelsPanel() {
  const { t } = useTranslation()
  const [models, setModels] = useState<ModelStatus[]>([])
  const [dir, setDir] = useState('')
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [folderError, setFolderError] = useState<string | null>(null)
  const [consent, setConsent] = useState<ModelStatus | null>(null)

  const refresh = useCallback(async () => {
    const [list, d] = await Promise.all([
      window.engclaw.models.list(),
      window.engclaw.models.getDir(),
    ])
    setModels(list)
    setDir(d)
  }, [])

  useEffect(() => {
    void refresh()
    return window.engclaw.models.onProgress((e) => {
      setProgress((p) => ({ ...p, [e.id]: e }))
      if (e.phase === 'ready' || e.phase === 'cancelled' || e.phase === 'error') void refresh()
    })
  }, [refresh])

  const start = async (m: ModelStatus) => {
    setConsent(null)
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== m.id)))
    const res = await window.engclaw.models.download({ id: m.id })
    if (!res.ok && res.code !== 'CANCELLED')
      setErrors((e) => ({ ...e, [m.id]: t(`models.error.${res.code}`) }))
    void refresh()
  }

  return (
    <section className="space-y-3" data-testid="models-panel">
      <h2 className="text-lg font-semibold">{t('models.title')}</h2>
      {models.length === 0 && <p className="text-muted-foreground text-sm">{t('models.empty')}</p>}
      {models.map((m) => {
        const p = progress[m.id]
        const busy = m.state === 'downloading'
        const pct = p && p.totalBytes > 0 ? Math.round((p.receivedBytes / p.totalBytes) * 100) : 0
        return (
          <div key={m.id} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-muted-foreground text-xs">
                  {t('models.size', { size: formatBytes(m.sizeBytes) })} ·{' '}
                  {t('models.license', { license: m.license })}
                </div>
              </div>
              <span className="text-sm" data-testid={`model-state-${m.id}`}>
                {busy
                  ? p?.phase === 'verifying'
                    ? t('models.verifying')
                    : t('models.downloading')
                  : m.state === 'ready'
                    ? t('models.ready')
                    : m.updateAvailable
                      ? t('models.updateAvailable')
                      : t('models.notInstalled')}
              </span>
            </div>
            {busy && (
              <div className="space-y-1">
                <Progress value={pct} />
                <div className="text-muted-foreground text-xs">
                  {t('models.progress', {
                    received: formatBytes(p?.receivedBytes ?? 0),
                    total: formatBytes(p?.totalBytes ?? m.sizeBytes),
                  })}
                </div>
              </div>
            )}
            {errors[m.id] && <Alert>{errors[m.id]}</Alert>}
            <div className="flex gap-2">
              {busy ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void window.engclaw.models.cancel({ id: m.id })}
                >
                  {t('models.cancel')}
                </Button>
              ) : m.state === 'ready' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await window.engclaw.models.remove({ id: m.id })
                      setConsent(m)
                      void refresh()
                    }}
                  >
                    {t('models.redownload')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await window.engclaw.models.remove({ id: m.id })
                      void refresh()
                    }}
                  >
                    {t('models.remove')}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setConsent(m)}>
                  {m.updateAvailable ? t('models.update') : t('models.download')}
                </Button>
              )}
            </div>
          </div>
        )
      })}
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span>{t('models.folder', { dir })}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
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
            else setFolderError(res.status === 'chosen' ? t('models.dl.notMoved') : null)
            if (res.status === 'chosen') void refresh()
          }}
        >
          {t('models.changeFolder')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void window.engclaw.models.openFolder()}>
          {t('models.openFolder')}
        </Button>
      </div>

      {folderError && (
        <Alert data-testid="models-folder-message" role="status">
          {folderError}
        </Alert>
      )}

      <Dialog open={consent !== null} onOpenChange={(open) => !open && setConsent(null)}>
        <DialogContent data-testid="model-consent">
          {consent && (
            <>
              <DialogTitle>{t('models.consentTitle', { name: consent.name })}</DialogTitle>
              <DialogDescription>
                {t('models.consentBody', { size: formatBytes(consent.sizeBytes) })}
                <br />
                {t('models.consentLicense', { license: consent.license })}
              </DialogDescription>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t('models.cancel')}</Button>
                </DialogClose>
                <Button onClick={() => void start(consent)}>{t('models.consentConfirm')}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
