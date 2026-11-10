import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import { Toaster } from './toaster'
import { Alert } from './alert'

let i18n: ReturnType<typeof createInstance>
beforeAll(async () => {
  i18n = createInstance()
  await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
})
const render = (ui: React.ReactNode) =>
  renderToStaticMarkup(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>)

describe('Alert feedback button', () => {
  it('is shown for error alerts, with an accessible name and tooltip', () => {
    const html = render(<Alert variant="error">Boom</Alert>)
    expect(html).toContain('data-testid="feedback-button"')
    expect(html).toContain('aria-label="Send feedback about this error"')
    expect(html).toContain('title="Report this problem on GitHub"')
  })
  it('is absent from default alerts and from the toast', () => {
    expect(render(<Alert>Info</Alert>)).not.toContain('feedback-button')
    expect(render(<Alert role="status">Saved</Alert>)).not.toContain('feedback-button')
    expect(render(<Toaster />)).not.toContain('feedback-button')
  })
})
