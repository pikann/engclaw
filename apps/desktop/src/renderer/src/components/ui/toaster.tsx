import { useTranslation } from 'react-i18next'
import { dismissToast, useToast } from '@/lib/toast'

export function Toaster() {
  const { t } = useTranslation()
  const toast = useToast()
  if (!toast) return null
  return (
    <div
      role="status"
      data-testid="app-toast"
      className="bg-card fixed right-4 bottom-10 z-[100] flex max-w-sm items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg"
    >
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={dismissToast}
        className="focus-visible:ring-ring rounded text-xs outline-none focus-visible:ring-2"
      >
        {t('feedback.dismiss')}
      </button>
    </div>
  )
}
