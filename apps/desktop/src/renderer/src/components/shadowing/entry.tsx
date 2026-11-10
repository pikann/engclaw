import { AlertTriangle, Film, Loader2, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentVideo } from '@engclaw/ipc-contract'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatClock, type EntryError } from '@/lib/shadowing'

/** URL entry with the inline error banners from IA doc §4.1, plus the recent-videos grid. */
export function ShadowingEntry({
  url,
  onUrlChange,
  onSubmit,
  loading,
  error,
  onRetry,
  recents,
  onOpenRecent,
}: {
  url: string
  onUrlChange: (url: string) => void
  onSubmit: () => void
  loading: boolean
  error: EntryError | null
  onRetry: () => void
  recents: readonly RecentVideo[]
  onOpenRecent: (videoId: string) => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (error) input.current?.select()
  }, [error])

  return (
    <div
      data-testid="shadowing-entry"
      className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-auto p-8"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!loading) onSubmit()
        }}
      >
        <h3 className="text-2xl font-semibold">{t('screens.shadowing.heading')}</h3>
        <div className="flex gap-2">
          <Input
            ref={input}
            data-testid="shadowing-url"
            aria-label={t('screens.shadowing.urlLabel')}
            aria-invalid={error === 'invalid' || undefined}
            aria-describedby={error ? 'shadowing-error' : undefined}
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          <Button type="submit" data-testid="shadowing-load" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {t('screens.shadowing.load')}
          </Button>
        </div>
        {loading && (
          <p role="status" className="text-muted-foreground text-sm">
            {t('screens.shadowing.loading')}
          </p>
        )}
        {error && (
          <Alert
            variant="error"
            id="shadowing-error"
            data-testid="shadowing-error"
            data-error={error}
            className="border-destructive bg-destructive-soft text-destructive-soft-foreground flex gap-3"
          >
            {error === 'network' ? (
              <WifiOff className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="space-y-2">
              <p>{t(`screens.shadowing.error.${error}`)}</p>
              {error === 'network' && (
                <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                  {t('practice.retry')}
                </Button>
              )}
            </div>
          </Alert>
        )}
      </form>
      <section aria-labelledby="recent-title" className="space-y-3">
        <h3 id="recent-title" className="text-lg font-semibold">
          {t('screens.shadowing.recent')}
        </h3>
        {recents.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            {t('screens.shadowing.noRecents')}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {recents.map((v) => (
              <li key={v.videoId}>
                <button
                  type="button"
                  data-testid="shadowing-recent"
                  aria-label={t('screens.shadowing.openRecent', { title: v.title })}
                  disabled={loading}
                  onClick={() => onOpenRecent(v.videoId)}
                  className="focus-visible:ring-ring/50 hover:bg-muted/50 w-full space-y-1.5 rounded-md p-1 text-left outline-none focus-visible:ring-[3px] disabled:opacity-50"
                >
                  <div className="bg-muted text-muted-foreground flex aspect-video items-center justify-center rounded-md">
                    <Film aria-hidden="true" />
                  </div>
                  <p className="truncate text-sm">{v.title}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {formatClock(v.durationSec)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
