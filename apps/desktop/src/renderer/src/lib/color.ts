/** OKLCH -> sRGB and WCAG 2.1 contrast, used to keep the design tokens at AA. */

export interface Oklch {
  l: number
  c: number
  h: number
  alpha: number
}

/** Parses `oklch(L C H)` / `oklch(L C H / A)`; L may be a percentage. */
export function parseOklch(css: string): Oklch {
  const m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(
    css.trim(),
  )
  if (!m) throw new Error(`not an oklch() colour: ${css}`)
  const num = (v: string): number => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v))
  return { l: num(m[1]!), c: parseFloat(m[2]!), h: parseFloat(m[3]!), alpha: m[4] ? num(m[4]) : 1 }
}

/** Linear-light sRGB (clamped to the gamut) for an OKLCH colour. */
export function oklchToLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (v: number): number => Math.min(1, Math.max(0, v))
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ]
}

export function relativeLuminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearRgb(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.1 contrast ratio (1..21) between two opaque colours. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
