import { useLearningLanguage } from '@/lib/learning-language'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DownloadModelsButton, useModelDownload } from '@/components/download-models'
import { playPcm, playSlowPcm } from '@/lib/audio'

type State = 'idle' | 'loading' | 'playing'

interface Sample {
  text: string
  label?: string
  pinyin?: boolean
}

/** "Hear the reference": plays the Kokoro reference voice for `text` (cached after the first time). */
export function HearReference({
  text,
  variant = 'outline',
  pinyin = false,
  disabled = false,
  label,
  alternate,
  segmented,
  speedControls = false,
  defaultRate = speedControls ? 0.75 : 1,
  onPlaybackStart,
}: Sample & {
  variant?: 'outline' | 'ghost'
  disabled?: boolean
  alternate?: Sample
  segmented?: Sample
  speedControls?: boolean
  defaultRate?: 0.75 | 1
  onPlaybackStart?: () => void
}) {
  const language = useLearningLanguage()
  const { t } = useTranslation()
  const [state, setState] = useState<State>('idle')
  const [rate, setRate] = useState<number>(defaultRate)
  const [active, setActive] = useState(0)
  const [pinyinFallback, setPinyinFallback] = useState(false)
  const [error, setError] = useState<'modelMissing' | 'failed' | null>(null)
  const playing = useRef<{ stop: () => void } | null>(null)

  const token = useRef(0)
  const halt = useCallback(() => {
    token.current++
    playing.current?.stop()
    playing.current = null
  }, [])
  useEffect(() => {
    halt()
    setState('idle')
    setError(null)
    setPinyinFallback(false)
    return halt
  }, [
    text,
    language,
    pinyin,
    alternate?.text,
    alternate?.pinyin,
    segmented?.text,
    disabled,
    rate,
    halt,
  ])

  const onClick = async (sample: Sample, index: number): Promise<void> => {
    if (state === 'playing' && index === active) return playing.current?.stop()
    halt()
    const mine = token.current
    setActive(index)
    setError(null)
    setPinyinFallback(false)
    setState('loading')
    try {
      const res = await window.engclaw.tts.speak({
        text: sample.text,
        language,
        ...(sample.pinyin ? { pinyin: true } : {}),
      })
      if (mine !== token.current) return
      if (!res.ok) {
        setError(res.code === 'MODEL_MISSING' ? 'modelMissing' : 'failed')
        return setState('idle')
      }
      setPinyinFallback(res.pinyinFallback === true)
      const handle =
        rate === 1
          ? playPcm(res.samples, res.sampleRate)
          : playSlowPcm(res.samples, res.sampleRate, rate)
      playing.current = handle
      setState('playing')
      onPlaybackStart?.()
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

  const main = { text, pinyin, label }
  const download = useModelDownload(() => void onClick(main, 0))
  const samples = [
    { sample: main, id: 'hear-reference' },
    ...(alternate ? [{ sample: alternate, id: 'hear-reference-alternate' }] : []),
    ...(segmented ? [{ sample: segmented, id: 'hear-reference-segmented' }] : []),
  ]

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {samples.map(({ sample, id }, index) => {
          const status = index === active ? state : 'idle'
          return (
            <Button
              key={index}
              variant={variant}
              size="sm"
              data-testid={id}
              data-playback={status}
              disabled={disabled || state === 'loading' || !sample.text.trim()}
              onClick={() => void onClick(sample, index)}
            >
              <Volume2 />
              {status === 'loading'
                ? t('reference.loading')
                : status === 'playing'
                  ? t('reference.playing')
                  : (sample.label ?? t('reference.hear'))}
            </Button>
          )
        })}
      </div>
      {speedControls && (
        <div role="group" aria-label={t('ds.player.speed')} className="flex flex-wrap gap-1">
          {([0.75, 1] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={rate === option ? 'secondary' : 'ghost'}
              size="xs"
              disabled={disabled}
              aria-pressed={rate === option}
              onClick={() => setRate(option)}
            >
              {t(option === 1 ? 'reference.normalPlayback' : 'reference.slowPlayback')}
            </Button>
          ))}
        </div>
      )}
      {language === 'zh' && (
        <p className="text-muted-foreground text-xs">
          {t(pinyinFallback ? 'reference.pinyinFallback' : 'learning.chineseVoice')}
        </p>
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
