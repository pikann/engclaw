import { asSchema } from 'ai'
import { describe, expect, it } from 'vitest'
import { AGENT_CARDS_PER_TURN, AgentCard } from '@engclaw/ipc-contract'
import { showCardTool } from './show-card'

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
  const exec = (tool: ReturnType<typeof showCardTool>, input: unknown) =>
    tool.execute!(input as never, {
      toolCallId: 'c',
      messages: [],
      context: {},
      abortSignal: new AbortController().signal,
    })

  it('collects cards and limits them per reply', async () => {
    const sink: AgentCard[] = []
    const tool = showCardTool(sink)
    for (let i = 0; i < AGENT_CARDS_PER_TURN; i++)
      await expect(exec(tool, AgentCard.parse(ok[0]))).resolves.toBe('{"shown":true}')
    await expect(exec(tool, AgentCard.parse(ok[0]))).rejects.toThrow(/at most/)
    expect(sink).toHaveLength(AGENT_CARDS_PER_TURN)
  })

  it('advertises a JSON schema that lists every card type', async () => {
    const schema = await asSchema(showCardTool([]).inputSchema).jsonSchema
    const types = JSON.stringify(schema)
    for (const t of ['vocabulary', 'pronunciation', 'grammar', 'correction'])
      expect(types).toContain(t)
    expect(types).not.toContain('additionalProperties')
  })
})
