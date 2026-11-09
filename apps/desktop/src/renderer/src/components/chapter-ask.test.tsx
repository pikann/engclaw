import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import { ChapterAsk } from './chapter-ask'

let i18n: ReturnType<typeof createInstance>
beforeAll(async () => {
  i18n = createInstance()
  await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
})

const render = (available: boolean) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ChapterAsk
        text="break the ice"
        hasAttempts={false}
        available={available}
        onAsk={() => undefined}
        onSetup={() => undefined}
      />
    </I18nextProvider>,
  )

describe('ChapterAsk', () => {
  it('enables the button without a setup hint when a provider is configured', () => {
    const html = render(true)
    expect(html).toContain('ask-button')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('ask-setup-hint')
  })

  it('disables the button and hints at setup without a provider', () => {
    const html = render(false)
    expect(html).toContain('disabled=""')
    expect(html).toContain('ask-setup-hint')
    expect(html).toContain('Open Settings')
  })
})
