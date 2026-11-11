/**
 * IPA phone -> tongue/jaw/lip pose for a side-view (sagittal) mouth diagram. Pure: no DOM.
 * Coordinates are in the 0..200 x 0..160 viewBox used by `components/tongue.tsx`; the face
 * looks left (lips at x~16, throat at x~150). Poses are flat numbers so they can be tweened.
 */
import { REST, clean, phoneDuration, splitPhones, visemeFor, type Viseme } from './viseme'

export interface Pose {
  /** Tongue tip, front (blade), back (dorsum) and root, as x/y pairs. */
  tx: number
  ty: number
  fx: number
  fy: number
  bx: number
  by: number
  rx: number
  ry: number
  /** Jaw opening, 0 (closed) .. 1 (wide). */
  jaw: number
  /** Lips pushed forward (rounding), px (negative = toward the viewer's left/out). */
  prot: number
  /** Lower lip raised toward the upper lip/teeth, px. */
  lift: number
  /** Soft palate lowered so air goes through the nose, 0..1. */
  velum: number
  /** Vocal folds vibrating, 0..1. */
  voice: number
}

export const POSE_KEYS = [
  'tx',
  'ty',
  'fx',
  'fy',
  'bx',
  'by',
  'rx',
  'ry',
  'jaw',
  'prot',
  'lift',
  'velum',
  'voice',
] as const satisfies readonly (keyof Pose)[]

type Pt = readonly [number, number]
type Extra = Partial<Pick<Pose, 'jaw' | 'prot' | 'lift' | 'velum' | 'voice'>>

const pose = (tip: Pt, front: Pt, back: Pt, root: Pt, extra: Extra = {}): Pose => ({
  tx: tip[0],
  ty: tip[1],
  fx: front[0],
  fy: front[1],
  bx: back[0],
  by: back[1],
  rx: root[0],
  ry: root[1],
  jaw: 0.3,
  prot: 0,
  lift: 0,
  velum: 0,
  voice: 0,
  ...extra,
})

export const REST_POSE: Pose = pose([40, 100], [70, 96], [104, 98], [138, 112], { jaw: 0.2 })

// Reusable tongue shapes: [tip, front, back, root].
type Shape = readonly [Pt, Pt, Pt, Pt]
const NEUTRAL: Shape = [
  [40, 98],
  [70, 92],
  [104, 92],
  [138, 112],
]
const ALVEOLAR: Shape = [
  [50, 52],
  [72, 80],
  [104, 96],
  [138, 112],
]
const LATERAL: Shape = [
  [50, 52],
  [70, 88],
  [102, 92],
  [138, 108],
]
const SIBILANT: Shape = [
  [46, 62],
  [66, 54],
  [104, 94],
  [138, 112],
]
const POSTALV: Shape = [
  [56, 66],
  [76, 52],
  [106, 84],
  [138, 110],
]
const BUNCHED: Shape = [
  [58, 72],
  [80, 74],
  [108, 58],
  [138, 100],
]
const VELAR: Shape = [
  [40, 100],
  [68, 96],
  [112, 54],
  [138, 100],
]
const INTERDENTAL: Shape = [
  [30, 77],
  [62, 90],
  [100, 98],
  [138, 112],
]
const PALATAL: Shape = [
  [42, 90],
  [72, 52],
  [104, 74],
  [138, 110],
]

const S = (shape: Shape, extra?: Extra): Pose => pose(shape[0], shape[1], shape[2], shape[3], extra)

const POSES: Record<string, Pose> = {
  // Stops, nasals, fricatives, approximants
  p: S(NEUTRAL, { jaw: 0, lift: 20 }),
  b: S(NEUTRAL, { jaw: 0, lift: 20, voice: 1 }),
  m: S(NEUTRAL, { jaw: 0, lift: 20, voice: 1, velum: 1 }),
  f: S(NEUTRAL, { jaw: 0.1, lift: 12 }),
  v: S(NEUTRAL, { jaw: 0.1, lift: 12, voice: 1 }),
  θ: S(INTERDENTAL, { jaw: 0.25 }),
  ð: S(INTERDENTAL, { jaw: 0.25, voice: 1 }),
  t: S(ALVEOLAR, { jaw: 0.15 }),
  d: S(ALVEOLAR, { jaw: 0.15, voice: 1 }),
  ɾ: S(ALVEOLAR, { jaw: 0.15, voice: 1 }),
  n: S(ALVEOLAR, { jaw: 0.15, voice: 1, velum: 1 }),
  l: S(LATERAL, { jaw: 0.25, voice: 1 }),
  s: S(SIBILANT, { jaw: 0.1 }),
  z: S(SIBILANT, { jaw: 0.1, voice: 1 }),
  ʃ: S(POSTALV, { jaw: 0.15, prot: -4 }),
  ʒ: S(POSTALV, { jaw: 0.15, prot: -4, voice: 1 }),
  tʃ: S(POSTALV, { jaw: 0.15, prot: -4 }),
  dʒ: S(POSTALV, { jaw: 0.15, prot: -4, voice: 1 }),
  ɹ: S(BUNCHED, { jaw: 0.2, prot: -4, voice: 1 }),
  r: S(BUNCHED, { jaw: 0.2, prot: -4, voice: 1 }),
  ʁ: S(BUNCHED, { jaw: 0.2, voice: 1 }),
  j: S(PALATAL, { jaw: 0.2, voice: 1 }),
  ɲ: S(PALATAL, { jaw: 0.2, voice: 1, velum: 1 }),
  w: pose([40, 100], [70, 92], [106, 56], [138, 104], { jaw: 0.15, prot: -6, voice: 1 }),
  k: S(VELAR, { jaw: 0.2 }),
  g: S(VELAR, { jaw: 0.2, voice: 1 }),
  ɡ: S(VELAR, { jaw: 0.2, voice: 1 }),
  ŋ: S(VELAR, { jaw: 0.2, voice: 1, velum: 1 }),
  h: S(NEUTRAL, { jaw: 0.4 }),
  ɦ: S(NEUTRAL, { jaw: 0.4, voice: 1 }),
  // Vowels (all voiced)
  i: pose([42, 90], [72, 50], [104, 72], [138, 112], { jaw: 0.15, voice: 1 }),
  y: pose([42, 90], [72, 50], [104, 72], [138, 112], { jaw: 0.15, prot: -5, voice: 1 }),
  ɪ: pose([40, 92], [72, 58], [104, 80], [138, 112], { jaw: 0.25, voice: 1 }),
  e: pose([40, 96], [70, 68], [104, 86], [138, 112], { jaw: 0.4, voice: 1 }),
  ɛ: pose([40, 98], [68, 76], [104, 90], [138, 114], { jaw: 0.55, voice: 1 }),
  ø: pose([40, 96], [70, 68], [104, 86], [138, 112], { jaw: 0.4, prot: -5, voice: 1 }),
  œ: pose([40, 98], [68, 76], [104, 90], [138, 114], { jaw: 0.55, prot: -5, voice: 1 }),
  æ: pose([40, 104], [68, 92], [100, 100], [136, 116], { jaw: 0.85, voice: 1 }),
  a: pose([40, 104], [68, 92], [100, 100], [136, 116], { jaw: 0.85, voice: 1 }),
  ə: pose([40, 98], [70, 92], [104, 90], [138, 112], { jaw: 0.35, voice: 1 }),
  ʌ: pose([40, 100], [70, 96], [106, 86], [138, 112], { jaw: 0.55, voice: 1 }),
  ɐ: pose([40, 100], [70, 96], [106, 90], [138, 112], { jaw: 0.5, voice: 1 }),
  ɑ: pose([40, 108], [70, 106], [110, 96], [132, 108], { jaw: 0.95, voice: 1 }),
  ɒ: pose([40, 108], [70, 106], [110, 96], [132, 108], { jaw: 0.85, prot: -4, voice: 1 }),
  ɔ: pose([40, 104], [70, 100], [106, 74], [136, 108], { jaw: 0.6, prot: -6, voice: 1 }),
  o: pose([40, 102], [70, 98], [106, 70], [136, 106], { jaw: 0.45, prot: -6, voice: 1 }),
  ʊ: pose([40, 100], [70, 94], [106, 66], [138, 106], { jaw: 0.3, prot: -5, voice: 1 }),
  u: pose([40, 100], [70, 92], [106, 58], [138, 104], { jaw: 0.15, prot: -7, voice: 1 }),
  ɜ: pose([50, 88], [78, 74], [108, 68], [138, 104], { jaw: 0.4, voice: 1 }),
  ɝ: pose([50, 88], [78, 74], [108, 66], [138, 102], { jaw: 0.4, prot: -3, voice: 1 }),
  ɚ: pose([50, 88], [78, 74], [108, 66], [138, 102], { jaw: 0.3, prot: -3, voice: 1 }),
}

/** Diphthongs glide between two of the poses above. */
const DIPHTHONGS: Record<string, [string, string]> = {
  eɪ: ['e', 'ɪ'],
  aɪ: ['a', 'ɪ'],
  ɔɪ: ['ɔ', 'ɪ'],
  oʊ: ['o', 'ʊ'],
  əʊ: ['ə', 'ʊ'],
  aʊ: ['a', 'ʊ'],
}

export const poseFor = (phone: string): Pose => POSES[clean(phone)] ?? REST_POSE

export interface ArticulationFrame {
  /** The sound this frame is for (IPA), or '' for the closing rest pose. */
  phone: string
  /** Front-view mouth picture to show (see `visemeFor`). */
  viseme: Viseme
  /** Side-view tongue/jaw/lip pose. */
  pose: Pose
  ms: number
}

/**
 * One timeline for both the mouth picture and the tongue diagram, so they stay in step. Each
 * sound lasts as long as `visemeFrames` says; a diphthong splits that time between its two
 * tongue poses. Always ends on the rest pose.
 */
export function articulationFrames(phones: readonly string[]): ArticulationFrame[] {
  const frames: ArticulationFrame[] = []
  for (const p of phones.flatMap(splitPhones)) {
    const parts = DIPHTHONGS[clean(p)] ?? [p]
    const ms = Math.max(MIN_STEP_MS, phoneDuration(p)) / parts.length
    for (const part of parts) {
      frames.push({ phone: part, viseme: visemeFor(p), pose: poseFor(part), ms })
    }
  }
  return [...frames, { phone: '', viseme: REST, pose: REST_POSE, ms: 0 }]
}

const MIN_STEP_MS = 150

/** Stretch or squeeze a timeline so it lasts `totalMs` (e.g. to match a spoken word). */
export function scaleFrames(
  frames: readonly ArticulationFrame[],
  totalMs: number,
): ArticulationFrame[] {
  const sum = frames.reduce((n, f) => n + f.ms, 0)
  if (!(totalMs > 0) || sum <= 0) return [...frames]
  return frames.map((f) => ({ ...f, ms: (f.ms * totalMs) / sum }))
}

// ---- geometry -------------------------------------------------------------------------------

const f = (n: number): string => (Math.round(n * 10) / 10).toString()

/**
 * Closed smooth outline through the tongue's points (Catmull-Rom -> cubic Bezier). The point
 * count is fixed so any two poses have compatible shapes.
 */
export function tonguePath(p: Pose): string {
  const pts: Pt[] = [
    [p.tx, p.ty],
    [p.fx, p.fy],
    [p.bx, p.by],
    [p.rx, p.ry],
    [142, 138],
    [92, 130],
    [p.tx + 12, Math.max(p.ty + 22, 106)],
  ]
  const n = pts.length
  const at = (i: number): Pt => pts[(i + n) % n] as Pt
  let d = `M${f(at(0)[0])} ${f(at(0)[1])}`
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  }
  return `${d}Z`
}

/** Hard palate and soft palate; the soft palate swings down for nasal sounds. */
export function palatePath(velum: number): string {
  const endY = 62 + velum * 24
  const endX = 130 + velum * 4
  return `M34 52L36 44Q48 40 58 46Q90 28 118 42Q${f(128 + velum * 2)} ${f(48 + velum * 10)} ${f(endX)} ${f(endY)}`
}

/** Lower-teeth top edge for a jaw opening. */
export const lowerTeethY = (p: Pose): number => 80 + p.jaw * 18

/** Chin/jaw line under the lower teeth. */
export function jawPath(p: Pose): string {
  const y = lowerTeethY(p)
  return `M30 ${f(y + 14)}L30 ${f(y + 28)}Q80 ${f(y + 42)} 142 146`
}

/** Phones of an IPA transcription (slashes, stress, length and tie marks dropped), keeping only sounds we can draw. */
export function ipaPhones(ipa: string): string[] {
  const bare = ipa.replace(/[/[\]()\s,.|]/g, '').replace(/\u035c|\u0361/g, '')
  return splitPhones(bare).filter((p) => visemeFor(p) !== REST)
}
