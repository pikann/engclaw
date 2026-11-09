import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { AskAgentProps } from '@/components/dictionary/word-page'
import {
  buildAskMessage,
  buildChapterAskMessage,
  type AskKind,
  type ChapterAskContext,
  type ChapterAskKind,
} from '@/lib/ask-agent'
import { LLM_CHANGED_EVENT } from '@/lib/llm-events'

export interface AskNavigationState {
  askAgent: string
}

/** True while an AI provider is configured; follows provider changes made in Settings. */
function useAgentAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let live = true
    const refresh = (): void => {
      void window.engclaw.llm
        .status()
        .then((s) => live && setAvailable(s.kind !== 'none'))
        .catch(() => live && setAvailable(false))
    }
    refresh()
    window.addEventListener(LLM_CHANGED_EVENT, refresh)
    return () => {
      live = false
      window.removeEventListener(LLM_CHANGED_EVENT, refresh)
    }
  }, [])
  return available
}

export interface ChapterAskProps {
  available: boolean
  onAsk: (kind: ChapterAskKind, freeText?: string) => void
  onSetup: () => void
}

/** "Ask the agent" about a game chapter's whole target; `beforeNavigate` saves the chapter state. */
export function useChapterAsk(
  chapter: Omit<ChapterAskContext, 'attempts'>,
  getAttempts: () => ChapterAskContext['attempts'],
  beforeNavigate?: () => void,
): ChapterAskProps {
  const navigate = useNavigate()
  const available = useAgentAvailable()
  const onAsk = useCallback(
    (kind: ChapterAskKind, freeText?: string) => {
      if (kind === 'free' && !freeText?.trim()) return
      beforeNavigate?.()
      const state: AskNavigationState = {
        askAgent: buildChapterAskMessage(kind, { ...chapter, attempts: getAttempts() }, freeText),
      }
      void navigate('/converse', { state })
    },
    [beforeNavigate, chapter, getAttempts, navigate],
  )
  const onSetup = useCallback(() => {
    beforeNavigate?.()
    void navigate('/settings?tab=agent')
  }, [beforeNavigate, navigate])
  return { available, onAsk, onSetup }
}

/** "Ask the agent" for a dictionary word: opens Converse with the question already sent. */
export function useAskAgent(
  word: string | null,
  context: string | undefined,
  beforeNavigate?: () => void,
): AskAgentProps {
  const navigate = useNavigate()
  const available = useAgentAvailable()

  const onAsk = useCallback(
    (kind: AskKind) => {
      if (!word) return
      beforeNavigate?.()
      const state: AskNavigationState = { askAgent: buildAskMessage(kind, word, context) }
      void navigate('/converse', { state })
    },
    [beforeNavigate, context, navigate, word],
  )

  const onSetup = useCallback(() => {
    beforeNavigate?.()
    void navigate('/settings?tab=agent')
  }, [beforeNavigate, navigate])

  return { available, onAsk, onSetup }
}
