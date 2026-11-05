import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  Pause,
  Play,
  WifiOff,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppShell, layoutOf } from '@/components/screens/shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export type DownloadState =
  'prompt' | 'downloading' | 'paused' | 'offline' | 'error' | 'lowDisk' | 'unwritable' | 'done'

const MODELS = [
  { key: 'phone', size: '1.0 GB' },
  { key: 'asr', size: '0.2 GB' },
  { key: 'voice', size: '0.1 GB' },
] as const

/**
 * Model download prompt (IA doc §2): fixed 560 px, never stretches. Static here so every state
 * can be shown at once; the live dialog (components/model-download-dialog.tsx) carries the
 * real dialog semantics.
 */
export function DownloadPrompt({ state }: { state: DownloadState }) {
  const { t } = useTranslation()
  const busy = state === 'downloading' || state === 'paused'
  const percent = busy ? 62 : state === 'done' ? 100 : 0
  const blocked = state === 'unwritable' || state === 'lowDisk'
  return (
    <section
      aria-labelledby={`dl-title-${state}`}
      className="bg-card w-140 max-w-full space-y-4 rounded-xl border p-6 shadow-lg"
      data-testid="screen-download"
    >
      <header className="space-y-1">
        <h3 id={`dl-title-${state}`} className="text-lg font-semibold">
          {t('models.dl.title')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t('screens.models.intro', { size: '1.3 GB' })}
        </p>
      </header>
      <table className="w-full text-sm">
        <caption className="sr-only">{t('screens.models.tableCaption')}</caption>
        <thead>
          <tr className="text-muted-foreground text-left text-xs">
            <th scope="col" className="pb-1 font-medium">
              {t('screens.models.colModel')}
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              {t('screens.models.colSize')}
            </th>
            <th scope="col" className="pb-1 pl-4 font-medium">
              {t('screens.models.colFor')}
            </th>
          </tr>
        </thead>
        <tbody>
          {MODELS.map((m) => (
            <tr key={m.key} className="border-t">
              <td className="py-1.5">{t(`screens.models.name.${m.key}`)}</td>
              <td className="py-1.5 text-right tabular-nums">{m.size}</td>
              <td className="text-muted-foreground py-1.5 pl-4">
                {t(`screens.models.for.${m.key}`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-sm">
        <HardDrive className="size-4" aria-hidden="true" />
        <span className="font-mono">~/Engclaw/models</span>
        <span>{t('models.dl.free', { size: state === 'lowDisk' ? '0.8 GB' : '84 GB' })}</span>
        <Button variant="link" size="xs" className="px-0">
          {t('models.changeFolder')}
        </Button>
      </p>

      {state === 'unwritable' && (
        <Alert className="border-destructive bg-destructive-soft text-destructive-soft-foreground flex gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t('models.dl.folderNotWritable', { dir: '/Volumes/Backup/models' })}
        </Alert>
      )}
      {state === 'lowDisk' && (
        <Alert className="border-warning bg-warning-soft text-warning-soft-foreground flex gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t('models.dl.folderNoSpace', { free: '0.8 GB', needed: '1.3 GB' })}
        </Alert>
      )}
      {state === 'offline' && (
        <Alert className="border-destructive bg-destructive-soft text-destructive-soft-foreground flex gap-2">
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          {t('screens.models.offline')}
        </Alert>
      )}
      {state === 'error' && (
        <Alert className="border-destructive bg-destructive-soft text-destructive-soft-foreground flex gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t('models.error.CHECKSUM')}
        </Alert>
      )}
      {state === 'paused' && (
        <p className="text-muted-foreground text-sm">{t('models.dl.paused')}</p>
      )}
      {state === 'done' && (
        <p
          className="bg-success-soft text-success-soft-foreground flex items-center gap-2 rounded-md p-3 text-sm"
          role="status"
        >
          <CheckCircle2 className="size-4" />
          {t('models.dl.allReady')}
        </p>
      )}

      {(busy || state === 'offline' || state === 'error') && (
        <div className="space-y-1.5">
          <Progress value={percent} aria-label={t('models.dl.progressLabel')} />
          <p className="text-muted-foreground flex justify-between text-xs tabular-nums">
            <span>{t('models.progress', { received: '812 MB', total: '1.3 GB' })}</span>
            <span>{percent}%</span>
          </p>
        </div>
      )}

      <footer className="flex justify-end gap-2">
        {state === 'done' ? (
          <Button>{t('models.dl.close')}</Button>
        ) : busy ? (
          <Button variant="outline">
            {state === 'paused' ? <Play /> : <Pause />}
            {t(state === 'paused' ? 'models.dl.resume' : 'models.dl.pause')}
          </Button>
        ) : (
          <>
            <Button variant="outline">{t('models.dl.notNow')}</Button>
            <Button disabled={blocked}>
              <Download />
              {state === 'offline' || state === 'error'
                ? t('practice.retry')
                : t('models.dl.start', { size: '1.3 GB' })}
            </Button>
          </>
        )}
      </footer>
    </section>
  )
}

/** The dialog over the dimmed feature screen it was opened from. */
export function DownloadOverlayScreen({ width, state }: { width: number; state: DownloadState }) {
  const { t } = useTranslation()
  return (
    <div className="relative h-full">
      <AppShell
        layout={layoutOf(width)}
        active="practice"
        title={t('screens.shell.practice')}
        modelsPercent={state === 'downloading' ? 62 : null}
      >
        <div className="h-full" />
      </AppShell>
      <div className="bg-background/70 absolute inset-0 flex items-center justify-center p-4 backdrop-blur-[1px]">
        <DownloadPrompt state={state} />
      </div>
    </div>
  )
}

/** "Not now": the feature opens in a locked state with a Download button (IA doc §2). */
export function LockedFeatureScreen({ width }: { width: number }) {
  const { t } = useTranslation()
  return (
    <AppShell layout={layoutOf(width)} active="practice" title={t('screens.shell.practice')}>
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="bg-muted flex size-14 items-center justify-center rounded-full">
          <Download className="text-muted-foreground size-6" aria-hidden="true" />
        </span>
        <h3 className="text-xl font-semibold">{t('screens.models.lockedTitle')}</h3>
        <p className="text-muted-foreground max-w-md text-sm">{t('practice.error.modelMissing')}</p>
        <Button size="lg">
          <Download />
          {t('practice.downloadModels')}
        </Button>
      </div>
    </AppShell>
  )
}
