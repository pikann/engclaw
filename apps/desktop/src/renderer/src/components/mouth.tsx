import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefersReducedMotion } from '@/lib/motion'
import { REST, visemeFrames, visemeFor } from '@/lib/viseme'

const IMAGES = import.meta.glob<string>('../assets/mouths/*.png', {
  eager: true,
  import: 'default',
})
const src = (viseme: string): string => IMAGES[`../assets/mouths/${viseme}.png`] ?? ''

/**
 * Mouth picture for a sound. `phones` animate in sequence each time `playId` changes; with
 * reduced motion the first sound's shape is shown still instead.
 */
export function Mouth({ phones, playId }: { phones: readonly string[]; playId: number }) {
  const { t } = useTranslation()
  const reduced = usePrefersReducedMotion()
  const key = phones.join(' ')
  const [viseme, setViseme] = useState(REST)

  useEffect(() => {
    if (!phones.length) return setViseme(REST)
    if (reduced) return setViseme(visemeFor(phones[0] ?? ''))
    const timers: number[] = []
    let at = 0
    for (const f of visemeFrames(phones)) {
      timers.push(window.setTimeout(() => setViseme(f.viseme), at))
      at += f.ms
    }
    return () => timers.forEach(window.clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `phones`
  }, [key, playId, reduced])

  return (
    <img
      src={src(viseme)}
      alt={t('result.mouthAlt', { shape: viseme })}
      data-testid="mouth"
      data-viseme={viseme}
      className="size-28 rounded-md border object-contain"
    />
  )
}
