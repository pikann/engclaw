import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import { WordLookupContext } from '@/lib/word-lookup'
import { ClickableText } from './clickable-text'

let i18n: ReturnType<typeof createInstance>
beforeAll(async () => {
  i18n = createInstance()
  await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
})

const render = (ui: React.ReactNode, lookup: ((w: string) => void) | null) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <WordLookupContext.Provider value={lookup}>{ui}</WordLookupContext.Provider>
    </I18nextProvider>,
  )

describe('ClickableText', () => {
  it('renders plain text without a dictionary provider', () => {
    expect(render(<ClickableText text="Hello, world!" />, null)).toBe('Hello, world!')
  })

  it('renders plain text when disabled', () => {
    expect(render(<ClickableText text="Hello" disabled />, () => {})).toBe('Hello')
  })

  it('makes each word a labelled button and leaves punctuation outside', () => {
    const html = render(<ClickableText text="Don’t stop, well-known!" />, () => {})
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).toContain('data-word="don&#x27;t"')
    expect(html).toContain('data-word="well-known"')
    expect(html).toContain('aria-label="Look up “stop” in the dictionary"')
    expect(html).toContain('</button>, ')
    expect(html.endsWith('</button>!')).toBe(true)
  })
})
