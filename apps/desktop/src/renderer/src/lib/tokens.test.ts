import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseOklch } from './color'

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8')

/** Custom properties declared in the first `selector { ... }` block. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(oklch\([^)]*\))/g)].map((m) => [m[1]!, m[2]!]),
  )
}

const light = tokens(':root')
const dark = { ...light, ...tokens('.dark') }

/** [foreground, background] pairs that carry text: WCAG AA needs 4.5:1. */
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['primary-foreground', 'primary'],
  ['destructive-foreground', 'destructive'],
  ['success-foreground', 'success'],
  ['warning-foreground', 'warning'],
  ['info-foreground', 'info'],
  ['destructive-soft-foreground', 'destructive-soft'],
  ['success-soft-foreground', 'success-soft'],
  ['warning-soft-foreground', 'warning-soft'],
  ['info-soft-foreground', 'info-soft'],
  ['foreground', 'primary-soft'],
  ['primary', 'primary-soft'],
  ['primary', 'background'], // links and outline buttons use primary as text
  ['primary', 'card'],
]

/** Non-text graphics and component boundaries: WCAG 1.4.11 needs 3:1. */
/**
 * `score-mid` (amber, per the Visual Style doc) is intentionally absent: amber cannot reach 3:1
 * on a light surface. Every use is paired with the number/label (WCAG 1.4.11 only covers
 * graphics needed to understand the content), and the star fill has a `star-stroke` outline.
 */
const UI_PAIRS: [string, string][] = [
  ['ring', 'background'],
  ['ring', 'card'],
  ['input', 'background'],
  ['input', 'card'],
  ['score-high', 'background'],
  ['score-low', 'background'],
  ['score-high', 'card'],
  ['score-low', 'card'],
  ['star-stroke', 'background'],
  ['star-empty', 'background'],
  ['node-locked', 'background'],
]

for (const [mode, set] of [
  ['light', light],
  ['dark', dark],
] as const) {
  describe(`${mode} theme tokens`, () => {
    it.each(TEXT_PAIRS)('%s on %s has >= 4.5:1', (fg, bg) => {
      expect(set[fg], `--${fg} missing`).toBeDefined()
      expect(set[bg], `--${bg} missing`).toBeDefined()
      expect(contrastRatio(parseOklch(set[fg]!), parseOklch(set[bg]!))).toBeGreaterThanOrEqual(4.5)
    })

    it.each(UI_PAIRS)('%s on %s has >= 3:1', (fg, bg) => {
      expect(set[fg], `--${fg} missing`).toBeDefined()
      expect(contrastRatio(parseOklch(set[fg]!), parseOklch(set[bg]!))).toBeGreaterThanOrEqual(3)
    })
  })
}

describe('token parity', () => {
  it('every light colour token is redefined for dark', () => {
    const missing = Object.keys(light).filter((k) => !(k in tokens('.dark')) && k !== 'radius')
    expect(missing).toEqual([])
  })
})
