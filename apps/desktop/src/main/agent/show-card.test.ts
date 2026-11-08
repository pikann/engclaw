import { describe, expect, it } from 'vitest'
import { AGENT_CARDS_PER_TURN, AgentCard } from '@engclaw/ipc-contract'
import { showCardTool } from './show-card'
import { toolSpecs } from './tools'

const ok = [
  { type: 'vocabulary', word: 'market', meaning: 'a place to buy things', example: 'I went.' },
  { type: 'pronunciation', word: 'thought', ipa: 'θɔːt', tip: 'Tongue between teeth.' },
  { type: 'grammar', title: 'Past simple', body: 'Use -ed for finished actions.' },
  { type: 'correction', said: 'I go yesterday', better: 'I went yesterday' },
]

describe('AgentCard', () => {
  it.each(ok)('accepts a $type card', (card) => {
    expect(AgentCard.safeParse(card).success).toBe(true)
  })

  it.each([
    ['unknown type', { type: 'image', url: 'https://x.test/a.png' }],
    ['extra field', { ...ok[0], html: '<b>x</b>' }],
    ['html tag', { ...ok[0], meaning: 'a <script>alert(1)</script> place' }],
    ['self-closing tag', { ...ok[3], better: 'I went<br/>' }],
    ['oversized', { ...ok[0], meaning: 'x'.repeat(241) }],
    ['empty', { ...ok[0], word: '  ' }],
    ['missing field', { type: 'correction', said: 'I go' }],
  ])('rejects %s', (_name, card) => {
    expect(AgentCard.safeParse(card).success).toBe(false)
  })

  it('allows ordinary angle-bracket text such as comparisons', () => {
    expect(AgentCard.safeParse({ ...ok[2], body: 'Use < for fewer, > for more.' }).success).toBe(
      true,
    )
  })
})

describe('show_card tool', () => {
  it('collects cards and limits them per reply', async () => {
    const sink: AgentCard[] = []
    const tool = showCardTool(sink)
    const signal = new AbortController().signal
    for (let i = 0; i < AGENT_CARDS_PER_TURN; i++)
      await expect(tool.run(AgentCard.parse(ok[0]), signal)).resolves.toEqual({ shown: true })
    await expect(tool.run(AgentCard.parse(ok[0]), signal)).rejects.toThrow(/at most/)
    expect(sink).toHaveLength(AGENT_CARDS_PER_TURN)
  })

  it('advertises a JSON schema that lists every card type', () => {
    const [spec] = toolSpecs([showCardTool([])])
    expect(spec!.name).toBe('show_card')
    const types = JSON.stringify(spec!.parameters)
    for (const t of ['vocabulary', 'pronunciation', 'grammar', 'correction'])
      expect(types).toContain(t)
  })
})
