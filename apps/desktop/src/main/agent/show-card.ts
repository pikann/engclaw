import { AGENT_CARDS_PER_TURN, AgentCard } from '@engclaw/ipc-contract'
import { defineTool } from './tools'

/** `show_card`: the validated card is collected for this reply; the model only gets an acknowledgement. */
export const showCardTool = (sink: AgentCard[]) =>
  defineTool({
    name: 'show_card',
    description:
      'Show the learner a small explanation card next to your spoken reply: a vocabulary card (word, meaning, example), a pronunciation card (word, IPA, tip), a grammar tip, or a correction (what they said vs a better phrasing). Use it only when a visual note really helps, at most once or twice per reply. Plain text only: no markdown or HTML.',
    schema: AgentCard,
    async run(card) {
      if (sink.length >= AGENT_CARDS_PER_TURN)
        throw new Error(`at most ${AGENT_CARDS_PER_TURN} cards per reply`)
      sink.push(card)
      return { shown: true }
    },
  })
