import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import { AskAgent } from './word-page'

let i18n: ReturnType<typeof createInstance>
beforeAll(async () => {
  i18n = createInstance()
  await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
})

const render = (available: boolean) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <AskAgent available={available} onAsk={() => undefined} onSetup={() => undefined} />
    </I18nextProvider>,
  )

describe('AskAgent', () => {
  it('offers the four quick prompts when a provider is configured', () => {
    const html = render(true)
    for (const label of [
      'Explain it simply',
      'Use it in a sentence',
      'How do I pronounce it?',
      'Common mistakes',
    ])
      expect(html).toContain(label)
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('ask-setup-hint')
  })

  it('disables the prompts and hints at setup without a provider', () => {
    const html = render(false)
    expect(html.match(/disabled=""/g)).toHaveLength(4)
    expect(html).toContain('ask-setup-hint')
    expect(html).toContain('Open provider settings')
  })
})
