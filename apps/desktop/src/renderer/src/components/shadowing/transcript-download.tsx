import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { formatTranscriptText, transcriptFileName, type Segment } from '@/lib/shadowing'

/** Saves the whole transcript (one timestamped sentence per line) as a text file for printing. */
export function TranscriptDownload({
  segments,
  title,
}: {
  segments: readonly Segment[]
  title: string
}) {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)

  const download = async (): Promise<void> => {
    setNotice(null)
    try {
      const res = await window.engclaw.transcript.export({
        fileName: transcriptFileName(title),
        text: formatTranscriptText(segments, true),
      })
      if (res.status === 'saved') setNotice(t('screens.shadowing.fullSaved'))
      else if (res.status === 'error')
        setNotice(t('screens.shadowing.fullSaveError', { message: res.message }))
    } catch (e) {
      setNotice(
        t('screens.shadowing.fullSaveError', {
          message: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  }

  return (
    <div className="mb-2 space-y-1">
      <Button
        variant="outline"
        size="sm"
        disabled={segments.length === 0}
        onClick={() => void download()}
        data-testid="shadowing-transcript-download"
      >
        <Download aria-hidden />
        {t('screens.shadowing.fullDownload')}
      </Button>
      {notice && (
        <p
          role="status"
          className="text-muted-foreground text-xs"
          data-testid="shadowing-transcript-notice"
        >
          {notice}
        </p>
      )}
    </div>
  )
}
