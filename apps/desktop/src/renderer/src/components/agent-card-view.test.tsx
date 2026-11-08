import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { i18nOptions } from '@engclaw/i18n'
import type { AgentCard } from '@engclaw/ipc-contract'
import { AgentCardList, AgentCardView } from './agent-card-view'

const cards: AgentCard[] = [
  { type: 'vocabulary', word: 'market', meaning: 'a place to buy things', example: 'I went.' },
  { type: 'pronunciation', word: 'thought', ipa: 'θɔːt', tip: 'Tongue between teeth.' },
  { type: 'grammar', title: 'Past simple', body: 'Use -ed for finished actions.' },
  { type: 'correction', said: 'I go yesterday', better: 'I went yesterday', why: 'Past tense.' },
]

const instances = {} as Record<'en' | 'vi', ReturnType<typeof createInstance>>
beforeAll(async () => {
  for (const lng of ['en', 'vi'] as const) {
    instances[lng] = createInstance()
    await instances[lng]
      .use(initReactI18next)
      .init({ ...i18nOptions, ns: [...i18nOptions.ns], lng })
  }
})

const render = (ui: React.ReactNode, lng: 'en' | 'vi' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={instances[lng]}>{ui}</I18nextProvider>)

describe('AgentCardView', () => {
  it.each([
    [cards[0]!, 'Vocabulary', 'Từ vựng', ['market', 'a place to buy things']],
    [cards[1]!, 'Pronunciation', 'Phát âm', ['thought', '/θɔːt/', 'Hear it']],
    [cards[2]!, 'Grammar tip', 'Mẹo ngữ pháp', ['Past simple']],
    [cards[3]!, 'Correction', 'Sửa lỗi', ['I go yesterday', 'I went yesterday']],
  ] as const)('renders a %$ card in en and vi', (card, en, vi, texts) => {
    const html = render(<AgentCardView card={card} />)
    expect(html).toContain(en)
    for (const t of texts) expect(html).toContain(t)
    expect(render(<AgentCardView card={card} />, 'vi')).toContain(vi)
  })

  it('shows the Vietnamese label on the Hear it button', () => {
    expect(render(<AgentCardView card={cards[1]!} />, 'vi')).toContain('Nghe thử')
  })

  it('renders model text as text, never as markup', () => {
    const evil = {
      type: 'vocabulary',
      word: 'x',
      meaning: '&lt;img src=x onerror=alert(1)&gt;',
    } as const
    const html = render(
      <AgentCardView card={{ ...evil, meaning: '<img src=x onerror=alert(1)>' }} />,
    )
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('renders nothing for an empty list and one section per card otherwise', () => {
    expect(render(<AgentCardList cards={[]} />)).toBe('')
    expect(render(<AgentCardList cards={cards} />).match(/<section/g)).toHaveLength(4)
  })
})
