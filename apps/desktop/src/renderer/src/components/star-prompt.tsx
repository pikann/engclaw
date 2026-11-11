import { useEffect, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'
import { INITIAL_STAR_STATE, REPO_URL, STAR_MOMENT_EVENT, recordMoment } from '@/lib/star-prompt'

/**
 * A friendly, dismissible card asking users to star the repository. It appears after a good
 * practice result (see `recordMoment`), never interrupts a recording, and the choice is remembered.
 */
export function StarPrompt() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    const onMoment = (e: Event) => {
      if (busy.current) return
      busy.current = true
      void (async () => {
        try {
          const settings = await window.engclaw.app.getSettings()
          const next = recordMoment(
            settings.starPrompt ?? INITIAL_STAR_STATE,
            (e as CustomEvent<number>).detail,
            Date.now(),
          )
          if (next.state !== settings.starPrompt)
            await window.engclaw.app.updateSettings({ starPrompt: next.state })
          if (next.show) setOpen(true)
        } catch (err) {
          console.error('[star-prompt] could not update state', err)
        } finally {
          busy.current = false
        }
      })()
    }
    window.addEventListener(STAR_MOMENT_EVENT, onMoment)
    return () => window.removeEventListener(STAR_MOMENT_EVENT, onMoment)
  }, [])

  const finish = async () => {
    setOpen(false)
    try {
      const s = await window.engclaw.app.getSettings()
      await window.engclaw.app.updateSettings({ starPrompt: { ...s.starPrompt, done: true } })
    } catch (err) {
      console.error('[star-prompt] could not save choice', err)
    }
  }

  const star = async () => {
    const opened = await window.engclaw.app.openExternal({ url: REPO_URL }).catch(() => false)
    if (!opened) return showToast(t('starPrompt.openFailed'), 15000)
    await finish()
  }

  if (!open) return null
  return (
    <div
      role="dialog"
      aria-labelledby="star-prompt-title"
      data-testid="star-prompt"
      className="bg-card fixed right-4 bottom-10 z-[100] max-w-sm space-y-3 rounded-lg border p-4 text-sm shadow-lg"
    >
      <div className="flex items-start gap-3">
        <Star aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div className="space-y-1">
          <p id="star-prompt-title" className="font-semibold">
            {t('starPrompt.title')}
          </p>
          <p className="text-muted-foreground">{t('starPrompt.body')}</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => void finish()}>
          {t('starPrompt.never')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
          {t('starPrompt.later')}
        </Button>
        <Button type="button" size="sm" data-testid="star-prompt-star" onClick={() => void star()}>
          {t('starPrompt.star')}
        </Button>
      </div>
    </div>
  )
}
