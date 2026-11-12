import { useLearningLanguage } from '@/lib/learning-language'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentCard } from '@engclaw/ipc-contract'
import {
  CorrectionCard,
  GrammarTipCard,
  PronunciationCard,
  VocabularyCard,
} from '@/components/ui/agent-cards'
import { playPcm } from '@/lib/audio'
import { useWordLookup } from '@/lib/word-lookup'
import { resolveWord } from '@/lib/words'

/** Reference pronunciation from the local Kokoro voice; works offline once the voice model is installed. */
function useHear(word: string): () => void {
  const playing = useRef<{ stop: () => void } | null>(null)
  useEffect(() => () => playing.current?.stop(), [])
  return () => {
    playing.current?.stop()
    void window.engclaw.tts
      .speak({ text: word })
      .then((res) => {
        if (!res.ok) return
        playing.current = playPcm(res.samples, res.sampleRate)
      })
      .catch(() => undefined)
  }
}

/** The dictionary's first IPA for a word the model gave no IPA for; undefined while loading or when absent. */
function useDictionaryIpa(word: string, skip: boolean): string | undefined {
  const language = useLearningLanguage()
  const [found, setFound] = useState<{ word: string; ipa?: string } | null>(null)
  useEffect(() => {
    if (skip) return
    let live = true
    resolveWord(
      word,
      (query) => window.engclaw.dictionary.search({ query, limit: 8, language }),
      language,
    )
      .then((hit) => (hit ? window.engclaw.dictionary.word({ id: hit.id, language }) : null))
      .then(
        (entry) => live && setFound({ word, ipa: entry?.pronunciations[0] }),
        () => undefined,
      )
    return () => {
      live = false
    }
  }, [word, skip, language])
  return found?.word === word ? found.ipa : undefined
}

function Pronunciation({ card }: { card: Extract<AgentCard, { type: 'pronunciation' }> }) {
  const onHear = useHear(card.word)
  const lookup = useWordLookup()
  const fallbackIpa = useDictionaryIpa(card.word, Boolean(card.ipa))
  return (
    <PronunciationCard
      word={card.word}
      ipa={card.ipa ?? fallbackIpa}
      tip={card.tip}
      onHear={onHear}
      onLookup={lookup ? () => lookup(card.word) : undefined}
    />
  )
}

/** One explanation card. Every field is rendered as a text node, so model output can never become markup. */
export function AgentCardView({ card }: { card: AgentCard }) {
  switch (card.type) {
    case 'vocabulary':
      return (
        <VocabularyCard
          word={card.word}
          ipa={card.ipa}
          meaning={card.meaning}
          example={card.example}
        />
      )
    case 'pronunciation':
      return <Pronunciation card={card} />
    case 'grammar':
      return <GrammarTipCard title={card.title} body={card.body} example={card.example} />
    case 'correction':
      return <CorrectionCard said={card.said} better={card.better} why={card.why} />
  }
}

/** Cards of a reply, shown whether or not captions are on. */
export function AgentCardList({ cards }: { cards: readonly AgentCard[] }) {
  const { t } = useTranslation()
  if (cards.length === 0) return null
  return (
    <div
      className="space-y-2"
      role="group"
      aria-label={t('converse.cards')}
      data-testid="agent-cards"
    >
      {cards.map((c, i) => (
        <AgentCardView key={i} card={c} />
      ))}
    </div>
  )
}
