import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import { WordArticulation } from './word-articulation'

const i18n = createInstance()
beforeAll(async () => {
  vi.stubGlobal('window', {})
  await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
})
const html = (ipa: string | undefined): string =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <WordArticulation word="cat" ipa={ipa} />
    </I18nextProvider>,
  )

describe('WordArticulation', () => {
  it('shows the sounds, the mouth and tongue, and Hear it', () => {
    const out = html('ˈkæt')
    expect(out).toContain('data-testid="word-articulation"')
    expect(out).toContain('data-testid="mouth"')
    expect(out).toContain('data-testid="tongue"')
    expect(out).toContain('data-testid="word-hear"')
    expect(out.match(/data-testid="word-phone"/g)).toHaveLength(3)
  })
  it('renders nothing when the word has no usable IPA', () => {
    expect(html(undefined)).toBe('')
  })
})
