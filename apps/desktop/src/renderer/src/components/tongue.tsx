import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefersReducedMotion } from '@/lib/motion'
import {
  POSE_KEYS,
  jawPath,
  lowerTeethY,
  palatePath,
  tonguePath,
  type Pose,
} from '@/lib/articulation'

/** How quickly the drawn pose catches up with the target (time constant, ms). */
const TWEEN_MS = 60
const SETTLED = 0.05

const far = (a: Pose, b: Pose): boolean => POSE_KEYS.some((k) => Math.abs(a[k] - b[k]) > SETTLED)

/** Drawn pose that eases toward `target`; jumps straight there with reduced motion. */
function useTweenedPose(target: Pose, reduced: boolean): Pose {
  const [shown, setShown] = useState<Pose>(target)
  const ref = useRef<Pose>(target)
  useEffect(() => {
    if (reduced) {
      ref.current = target
      return setShown(target)
    }
    let raf = 0
    let last = performance.now()
    const step = (now: number): void => {
      const k = 1 - Math.exp(-(now - last) / TWEEN_MS)
      last = now
      const cur = ref.current
      const next = { ...cur }
      for (const key of POSE_KEYS) next[key] = cur[key] + (target[key] - cur[key]) * k
      ref.current = far(next, target) ? next : target
      setShown(ref.current)
      if (ref.current !== target) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced])
  return shown
}

/** Side view of the mouth for one pose; eases between poses (jumps with reduced motion). */
export function Tongue({ pose, phone }: { pose: Pose; phone: string }) {
  const { t } = useTranslation()
  const reduced = usePrefersReducedMotion()
  const p = useTweenedPose(pose, reduced)
  return (
    <TongueDiagram
      pose={p}
      phone={phone}
      label={t('result.tongueAlt', { phone: phone || 'rest' })}
    />
  )
}

/** The drawing itself: palate, jaw, teeth, lips, tongue and voicing/nasal markers for a pose. */
export function TongueDiagram({
  pose: p,
  phone,
  label,
}: {
  pose: Pose
  phone: string
  label: string
}) {
  const ly = lowerTeethY(p)
  return (
    <svg
      viewBox="0 0 200 160"
      role="img"
      aria-label={label}
      data-testid="tongue"
      data-phone={phone}
      className="bg-card h-28 w-36 shrink-0 rounded-md border"
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" className="stroke-foreground/60">
        {/* Nasal airflow, shown while the soft palate is lowered. */}
        <path
          d="M128 40Q90 6 36 26"
          strokeDasharray="4 4"
          className="stroke-primary"
          opacity={p.velum}
        />
        <path d={palatePath(p.velum)} strokeWidth="3" />
        <path d="M150 38C156 80 152 116 144 150" strokeWidth="3" />
        <path d={jawPath(p)} strokeWidth="3" />
      </g>
      <path
        d={tonguePath(p)}
        data-testid="tongue-shape"
        className="fill-rose-300 stroke-rose-500 dark:fill-rose-400/70 dark:stroke-rose-300"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <g className="fill-background stroke-foreground/60" strokeWidth="1.5">
        <rect x="26" y="52" width="8" height="18" rx="2" />
        <rect x="26" y={ly} width="8" height="14" rx="2" />
      </g>
      <g className="fill-rose-400/80 stroke-rose-500" strokeWidth="1.5">
        <ellipse cx={16 + p.prot} cy="58" rx="8" ry="7" />
        <ellipse cx={18 + p.prot} cy={ly + 4 - p.lift} rx="8" ry="6" />
      </g>
      {/* Vocal folds: the zigzag shows while the sound is voiced. */}
      <path
        d="M164 112l5 5-5 5 5 5"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
        opacity={p.voice}
      />
    </svg>
  )
}
