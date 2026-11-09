import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModelDownloadDialog } from '@/components/model-download-dialog'

/**
 * The model download prompt for a feature that failed with MODEL_MISSING. `open()` shows it;
 * once every model is installed it closes and calls `onReady` (the latest one) so the failed
 * action can run again. Render `dialog` once in the feature's tree.
 */
export function useModelDownload(onReady: () => void): { open: () => void; dialog: ReactNode } {
  const [isOpen, setOpen] = useState(false)
  const ready = useRef(onReady)
  ready.current = onReady
  const open = useCallback(() => setOpen(true), [])
  const dialog = (
    <ModelDownloadDialog
      open={isOpen}
      onOpenChange={setOpen}
      onReady={() => {
        setOpen(false)
        ready.current()
      }}
    />
  )
  return { open, dialog }
}

/** The action shown in place of "Try again" when the error is a missing model. */
export function DownloadModelsButton({
  onClick,
  testId = 'download-models',
}: {
  onClick: () => void
  testId?: string
}) {
  const { t } = useTranslation()
  return (
    <Button size="sm" data-testid={testId} onClick={onClick}>
      <Download />
      {t('practice.downloadModels')}
    </Button>
  )
}
