import { MessageSquareWarning } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { buildFeedbackLink, routeOf } from '@/lib/feedback'
import { showToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'

/** Opens a prefilled GitHub bug report for `error`. Nothing is sent until the user submits on GitHub. */
export function FeedbackButton({ getError }: { getError: () => string }) {
  const { t, i18n } = useTranslation()
  const click = async () => {
    try {
      const env = await window.engclaw.app.getEnvironment()
      const link = buildFeedbackLink({
        error: getError(),
        route: routeOf(window.location.hash),
        locale: i18n.language,
        env,
      })
      const opened = await window.engclaw.app.openExternal({ url: link.url })
      if (!opened) return showToast(t('feedback.openFailed'), 15000)
      if (link.truncated) {
        await navigator.clipboard.writeText(link.fullText).catch(() => {})
        showToast(t('feedback.copied'))
      }
    } catch (e) {
      console.error('[feedback] could not open the report', e)
      showToast(t('feedback.openFailed'), 15000)
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      title={t('feedback.tooltip')}
      aria-label={t('feedback.ariaLabel')}
      data-testid="feedback-button"
      className="focus-visible:ring-ring shrink-0 focus-visible:ring-2"
      onClick={() => void click()}
    >
      <MessageSquareWarning aria-hidden="true" />
      {t('feedback.label')}
    </Button>
  )
}
