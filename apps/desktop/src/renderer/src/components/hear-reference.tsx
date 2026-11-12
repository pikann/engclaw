import { useLearningLanguage } from '@/lib/learning-language'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DownloadModelsButton, useModelDownload } from '@/components/download-models'
import { playPcm } from '@/lib/audio'

type State = 'idle' | 'loading' | 'playing'

/** "Hear the reference": plays the Kokoro reference voice for `text` (cached after the first time). */
export function HearReference({
  text,
  variant = 'outline',
}: {
  text: string
  variant?: 'outline' | 'ghost'
}) {
  const language = useLearningLanguage()
  const { t } = useTranslation()
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<'modelMissing' | 'failed' | null>(null)
  const playing = useRef<{ stop: () => void } | null>(null)

  const token = useRef(0)
  const halt = useCallback(() => {
    token.current++
    playing.current?.stop()
  }, [])
  useEffect(() => {
    halt()
    setState('idle')
    setError(null)
    return halt
  }, [text, language, halt])

  const onClick = async (): Promise<void> => {
    if (state === 'playing') return playing.current?.stop()
    const mine = ++token.current
    setError(null)
    setState('loading')
    try {
      const res = await window.engclaw.tts.speak({ text, language })
      if (mine !== token.current) return
      if (!res.ok) {
        setError(res.code === 'MODEL_MISSING' ? 'modelMissing' : 'failed')
        return setState('idle')
      }
      const handle = playPcm(res.samples, res.sampleRate)
      playing.current = handle
      setState('playing')
      await handle.done
    } catch {
      if (mine === token.current) setError('failed')
    } finally {
      if (mine === token.current) {
        playing.current = null
        setState('idle')
      }
    }
  }

  const download = useModelDownload(() => void onClick())

  return (
    <div className="space-y-1">
      <Button
        variant={variant}
        size="sm"
        data-testid="hear-reference"
        disabled={state === 'loading' || !text.trim()}
        onClick={() => void onClick()}
      >
        <Volume2 />
        {state === 'loading'
          ? t('reference.loading')
          : state === 'playing'
            ? t('reference.playing')
            : t('reference.hear')}
      </Button>
      {language === 'zh' && (
        <p className="text-muted-foreground text-xs">{t('learning.chineseVoice')}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="hear-reference-error">
          {t(error === 'modelMissing' ? 'reference.modelMissing' : 'reference.failed')}
        </p>
      )}
      {error === 'modelMissing' && (
        <DownloadModelsButton testId="hear-reference-download" onClick={download.open} />
      )}
      {download.dialog}
    </div>
  )
}
