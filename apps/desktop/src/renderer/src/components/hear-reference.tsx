import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playPcm } from '@/lib/audio'

type State = 'idle' | 'loading' | 'playing'

/** "Hear the reference": plays the Kokoro reference voice for `text` (cached after the first time). */
export function HearReference({ text }: { text: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const playing = useRef<{ stop: () => void } | null>(null)

  const onClick = async (): Promise<void> => {
    if (state === 'playing') return playing.current?.stop()
    setError(null)
    setState('loading')
    try {
      const res = await window.engclaw.tts.speak({ text })
      if (!res.ok) {
        setError(t(res.code === 'MODEL_MISSING' ? 'reference.modelMissing' : 'reference.failed'))
        return setState('idle')
      }
      const handle = playPcm(res.samples, res.sampleRate)
      playing.current = handle
      setState('playing')
      await handle.done
    } catch {
      setError(t('reference.failed'))
    } finally {
      playing.current = null
      setState('idle')
    }
  }

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
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
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="hear-reference-error">
          {error}
        </p>
      )}
    </div>
  )
}
