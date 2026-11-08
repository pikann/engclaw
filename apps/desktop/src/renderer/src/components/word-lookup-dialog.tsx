import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { primaryRootId, WordPage } from '@/components/dictionary/word-page'
import { Button } from '@/components/ui/button'
import { DictionaryDialog } from '@/components/ui/dictionary'
import { useAskAgent } from '@/lib/use-ask-agent'
import { useDictionaryWord } from '@/lib/use-dictionary'
import { WordLookupContext } from '@/lib/word-lookup'
import { resolveWord } from '@/lib/words'

type Resolved = { word: string; id: number | null } | null

const search = (query: string) => window.engclaw.dictionary.search({ query, limit: 8 })

/**
 * App-wide dictionary dialog. Any `ClickableText` below it opens the entry for the clicked word
 * in place, so the session underneath (a playing video, a recording) is left untouched.
 */
export function WordLookupProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [word, setWord] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Resolved>(null)
  const [override, setOverride] = useState<{ id: number; word: string } | null>(null)
  const [context, setContext] = useState<string | undefined>()

  const lookup = useCallback((w: string, sentence?: string) => {
    setOverride(null)
    setResolved(null)
    setContext(sentence)
    setWord(w)
  }, [])

  useEffect(() => {
    if (word === null) return
    let live = true
    resolveWord(word, search).then(
      (hit) => live && setResolved({ word, id: hit?.id ?? null }),
      () => live && setResolved({ word, id: null }),
    )
    return () => {
      live = false
    }
  }, [word])

  const id = override?.id ?? (resolved?.word === word ? (resolved?.id ?? null) : null)
  const searching = word !== null && !override && resolved?.word !== word
  const entry = useDictionaryWord(id)
  const title = override?.word ?? (entry?.status === 'ready' && entry.value?.word) ?? word ?? ''

  const state = useMemo(
    () =>
      searching ? ({ status: 'loading' } as const) : (entry ?? ({ status: 'error' } as const)),
    [searching, entry],
  )
  const root = entry?.status === 'ready' && entry.value ? primaryRootId(entry.value) : null

  const close = useCallback(() => setWord(null), [])
  const ask = useAskAgent(
    entry?.status === 'ready' && entry.value ? entry.value.word : null,
    override ? undefined : context,
    close,
  )

  const openInDictionary = () => {
    if (id === null) return
    const q = new URLSearchParams({ word: String(id) })
    if (root !== null) q.set('root', String(root))
    setWord(null)
    navigate(`/dictionary?${q}`)
  }

  return (
    <WordLookupContext.Provider value={lookup}>
      {children}
      <DictionaryDialog
        open={word !== null}
        onOpenChange={(open) => !open && setWord(null)}
        word={title || ''}
        footer={
          id !== null && (
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              data-testid="open-in-dictionary"
              onClick={openInDictionary}
            >
              {t('dict.openInDictionary')}
            </Button>
          )
        }
      >
        <WordPage
          state={state}
          activeRootId={root}
          onOpenWord={setOverride}
          ask={ask}
          onOpenRoot={(rootId) => {
            setWord(null)
            navigate(
              `/dictionary?${new URLSearchParams({ word: String(id ?? ''), root: String(rootId) })}`,
            )
          }}
          onPractice={(text) => {
            setWord(null)
            navigate('/practice', { state: { practiceText: text } })
          }}
        />
      </DictionaryDialog>
    </WordLookupContext.Provider>
  )
}
