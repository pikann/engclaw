import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import type { RelatedItem } from '@/lib/dictionary'
import { RelationRow } from './word-page'

let i18n: ReturnType<typeof createInstance>
beforeAll(async () => {
  i18n = createInstance()
  await i18n.use(initReactI18next).init({ ...i18nOptions, ns: [...i18nOptions.ns], lng: 'en' })
})

const render = (kind: 'synonyms' | 'antonyms', items: RelatedItem[]) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <RelationRow kind={kind} items={items} onOpenWord={() => undefined} />
    </I18nextProvider>,
  )

const words = (n: number): RelatedItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, word: `word${i + 1}` }))

describe('RelationRow', () => {
  it('renders nothing when there are no related words', () => {
    expect(render('synonyms', [])).toBe('')
  })

  it('shows every chip as a button without "show more" for a few words', () => {
    const html = render('synonyms', words(3))
    expect(html).toContain('data-testid="relation-synonyms"')
    expect(html).toContain('Synonyms:')
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).not.toContain('aria-expanded')
  })

  it('caps at 8 chips and offers "show more" with the hidden count', () => {
    const html = render('synonyms', words(11))
    expect(html.match(/aria-label="Open “word/g)).toHaveLength(8)
    expect(html).not.toContain('word9')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Show 3 more')
  })

  it('shows exactly 8 words without "show more"', () => {
    expect(render('synonyms', words(8))).not.toContain('aria-expanded')
  })

  it('renders non-entries as plain text, not buttons', () => {
    const html = render('synonyms', [{ id: null, word: 'of good cheer' }])
    expect(html).toContain('of good cheer')
    expect(html).not.toContain('<button')
  })

  it('marks indirect antonyms with an asterisk, label and footnote', () => {
    const html = render('antonyms', [
      { id: 1, word: 'cold', indirect: false },
      { id: 2, word: 'unhappy', indirect: true },
    ])
    expect(html).toContain('data-indirect="true"')
    expect(html).toContain('Open “unhappy” (indirect antonym)')
    expect(html).toContain('* indirect: opposite of the closest main sense')
    expect(html.match(/data-indirect/g)).toHaveLength(1)
  })

  it('omits the indirect footnote when every antonym is direct', () => {
    const html = render('antonyms', [{ id: 1, word: 'cold', indirect: false }])
    expect(html).not.toContain('data-indirect')
    expect(html).not.toContain('indirect:')
  })
})
