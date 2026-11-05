import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'

/**
 * Two resizable panes (master-detail). Handles are keyboard-operable (arrow keys) and the
 * layout is remembered per `id`.
 */
export function SplitPane({
  id,
  left,
  right,
  leftDefault = 35,
  leftMin = 20,
  rightMin = 30,
}: {
  id: string
  left: ReactNode
  right: ReactNode
  leftDefault?: number
  leftMin?: number
  rightMin?: number
}) {
  const { t } = useTranslation()
  return (
    <ResizablePanelGroup orientation="horizontal" id={id} className="min-h-0 flex-1">
      <ResizablePanel id={`${id}-left`} defaultSize={leftDefault} minSize={leftMin}>
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle aria-label={t('ds.resize')} />
      <ResizablePanel id={`${id}-right`} defaultSize={100 - leftDefault} minSize={rightMin}>
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
