import { Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export const SPEEDS = [0.5, 0.75, 1, 1.25] as const

/** Transport bar for shadowing / dictation: previous, play-pause, next, loop and speed. */
export function PlayerControls({
  playing,
  looping,
  speed,
  onToggle,
  onPrev,
  onNext,
  onLoop,
  onSpeed,
  className,
}: {
  playing: boolean
  looping: boolean
  speed: number
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onLoop: () => void
  onSpeed: (speed: number) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      role="toolbar"
      aria-label={t('ds.player.label')}
      className={cn('flex items-center gap-2', className)}
    >
      <Button variant="ghost" size="icon" aria-label={t('ds.player.prev')} onClick={onPrev}>
        <SkipBack />
      </Button>
      <Button
        size="icon"
        aria-label={playing ? t('ds.player.pause') : t('ds.player.play')}
        onClick={onToggle}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <Button variant="ghost" size="icon" aria-label={t('ds.player.next')} onClick={onNext}>
        <SkipForward />
      </Button>
      <Button
        variant={looping ? 'secondary' : 'ghost'}
        size="icon"
        aria-label={t('ds.player.loop')}
        aria-pressed={looping}
        onClick={onLoop}
      >
        <Repeat />
      </Button>
      <ToggleGroup
        type="single"
        value={String(speed)}
        onValueChange={(v) => v && onSpeed(Number(v))}
        aria-label={t('ds.player.speed')}
        variant="outline"
        size="sm"
      >
        {SPEEDS.map((s) => (
          <ToggleGroupItem key={s} value={String(s)}>
            {s}×
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
