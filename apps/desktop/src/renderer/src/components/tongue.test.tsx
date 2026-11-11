import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import { REST_POSE, poseFor } from '@/lib/articulation'
import { Tongue, TongueDiagram } from './tongue'

const i18n = createInstance()
beforeAll(async () => {
  vi.stubGlobal('window', {})
  await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
})

const html = (node: React.ReactElement): string =>
  renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>)

describe('Tongue', () => {
  it('starts on the rest pose with an accessible label', () => {
    const out = html(<Tongue pose={REST_POSE} phone="" />)
    expect(out).toContain('data-testid="tongue"')
    expect(out).toContain('aria-label="Tongue position for rest"')
  })
  it('draws a different tongue for different sounds', () => {
    const draw = (ph: string): string =>
      html(<TongueDiagram pose={poseFor(ph)} phone={ph} label={ph} />)
    expect(draw('t')).not.toBe(draw('k'))
    expect(draw('t')).not.toBe(html(<TongueDiagram pose={REST_POSE} phone="" label="" />))
  })
})
