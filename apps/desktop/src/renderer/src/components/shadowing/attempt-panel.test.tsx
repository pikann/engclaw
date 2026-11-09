import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import type { AttemptErrorKind } from '@/lib/use-segment-attempt'
import { AttemptPanel } from './attempt-panel'

describe('AttemptPanel errors', () => {
  let i18n: ReturnType<typeof createInstance>
  beforeAll(async () => {
    vi.stubGlobal('window', {})
    i18n = createInstance()
    await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
  })
  const html = (kind: AttemptErrorKind) =>
    renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <AttemptPanel
          state={{ phase: 'error', kind, audio: null }}
          intonation={null}
          text="Hello"
          best={null}
          disabled={false}
          onToggleRecord={() => undefined}
          onPlay={() => undefined}
          onRetry={() => undefined}
          onDownloadModels={() => undefined}
        />
      </I18nextProvider>,
    )

  it('offers to download the models, not to retry, when a model is missing', () => {
    const out = html('model')
    expect(out).toContain('Download the speech models')
    expect(out).toContain('data-testid="shadowing-download-models"')
    expect(out).toContain('Download models')
    expect(out).not.toContain('Try again')
  })

  it.each<AttemptErrorKind>(['mic', 'failed'])('keeps Try again for a %s error', (kind) => {
    const out = html(kind)
    expect(out).toContain('Try again')
    expect(out).not.toContain('shadowing-download-models')
  })
})
