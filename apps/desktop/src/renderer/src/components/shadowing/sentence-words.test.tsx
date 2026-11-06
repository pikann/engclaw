import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import type { SegmentProsody } from '@engclaw/ipc-contract'
import type { ProsodyState } from '@/lib/use-prosody'
import { SentenceWords } from './sentence-words'

const word = (
  text: string,
  start: number,
  end: number,
  direction: 'rising' | 'falling' | 'flat',
  stressed = false,
) => ({ text, start, end, stressed, pitch: { direction, contour: [0, 1, 2, 3, 4] } })

const value: SegmentProsody = {
  words: [
    word('Hello,', 0, 0.5, 'falling'),
    word('big', 1, 1.3, 'flat', true),
    word('world?', 1.3, 2, 'rising'),
  ],
  pauses: [{ afterWordIndex: 0, duration: 0.45 }],
}
const ready: ProsodyState = { status: 'ready', value }
const TEXT = 'Hello, big world?'
const ipa = [
  { text: 'Hello,', ipa: 'həloʊ' },
  { text: 'big', ipa: 'bɪɡ' },
  { text: 'world?', ipa: 'wɜːld' },
]

let i18n: ReturnType<typeof createInstance>
beforeAll(async () => {
  i18n = createInstance()
  await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
})

function render(props: Partial<Parameters<typeof SentenceWords>[0]> = {}) {
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <SentenceWords text={TEXT} ipa={null} showIpa={false} prosody={null} {...props} />
    </I18nextProvider>,
  )
}

const count = (html: string, needle: string) => html.split(needle).length - 1

describe('SentenceWords', () => {
  it('shows only the plain words while the guide is off', () => {
    const html = render()
    expect(html).toContain('>Hello, big world?<')
    for (const hidden of ['shadowing-pause', 'shadowing-word-pitch'])
      expect(html).not.toContain(hidden)
  })

  it('marks the pause with its duration, stressed words and the pitch direction of each word', () => {
    const html = render({ prosody: ready })
    expect(count(html, 'data-testid="shadowing-pause"')).toBe(1)
    expect(html).toContain('aria-label="Pause 0.45 s"')
    expect(html).toContain('title="Pause 0.45 s"')
    expect(count(html, 'data-stressed="true"')).toBe(1)
    expect(count(html, 'opacity-60')).toBe(2)
    expect(html).not.toContain('underline')
    expect(html).not.toContain('font-bold underline')
    expect(html).toContain('(stressed)')
    expect(html.match(/data-direction="(\w+)"/g)).toEqual([
      'data-direction="falling"',
      'data-direction="flat"',
      'data-direction="rising"',
    ])
  })

  it('adds no markers or dimming while the analysis is pending or failed', () => {
    for (const status of ['loading', 'error', 'idle'] as const) {
      const html = render({ prosody: { status } })
      expect(html).not.toContain('shadowing-pause')
      expect(html).not.toContain('data-direction')
      expect(html).not.toContain('opacity-60')
    }
  })

  it('works with the IPA row on and keeps the sentence usable when IPA is missing', () => {
    const both = render({ prosody: ready, ipa, showIpa: true })
    expect(both).toContain('/həloʊ/')
    expect(both).toContain('data-direction="rising"')
    const pending = render({ prosody: { status: 'loading' }, ipa: null, showIpa: true })
    expect(count(pending, 'data-testid="shadowing-word-ipa"')).toBe(3)
    expect(pending).toContain('Hello,')
  })
})
