import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { FeedbackButton } from '@/components/feedback-button'

function Fallback({ error }: { error: Error }) {
  const { t } = useTranslation()
  return (
    <div role="alert" data-testid="error-boundary" className="mx-auto max-w-md space-y-3 p-8">
      <h1 className="text-lg font-semibold">{t('feedback.boundaryTitle')}</h1>
      <p className="text-muted-foreground text-sm">{t('feedback.boundaryBody')}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => window.location.reload()}>
          {t('feedback.reload')}
        </Button>
        <FeedbackButton getError={() => `${error.name}: ${error.message}\n${error.stack ?? ''}`} />
      </div>
    </div>
  )
}

/** Top-level fallback so a render crash shows a Feedback button instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }
  render() {
    return this.state.error ? <Fallback error={this.state.error} /> : this.props.children
  }
}
