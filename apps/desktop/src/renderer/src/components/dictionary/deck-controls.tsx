import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookmarkCheck, BookmarkPlus, Layers, ListPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Add a single word to the flashcard deck, or take it out again. */
export function DeckToggle({ word }: { word: string }) {
  const { t } = useTranslation()
  const [inDeck, setInDeck] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setInDeck(null)
    window.engclaw.deck.has({ words: [word] }).then(
      (found) => live && setInDeck(found.includes(word)),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [word])

  const toggle = async (): Promise<void> => {
    try {
      if (inDeck) await window.engclaw.deck.remove({ word })
      else await window.engclaw.deck.add({ words: [word] })
      setInDeck(!inDeck)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        data-testid="deck-toggle"
        aria-pressed={inDeck === true}
        disabled={inDeck === null && !failed}
        onClick={() => void toggle()}
      >
        {inDeck ? <BookmarkCheck /> : <BookmarkPlus />}
        {inDeck ? t('dict.deck.remove') : t('dict.deck.add')}
      </Button>
      {failed && (
        <span role="alert" className="text-destructive text-xs">
          {t('dict.deck.failed')}
        </span>
      )}
    </>
  )
}

/** Add a whole root family to the deck, or start a flashcard drill on it. */
export function RootDeckActions({
  rootId,
  onDrill,
}: {
  rootId: number
  onDrill?: (rootId: number) => void
}) {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => setNotice(null), [rootId])

  const addAll = useCallback(async (): Promise<void> => {
    try {
      const { added, skipped } = await window.engclaw.deck.add({ rootId })
      setNotice(t('dict.deck.addedRoot', { added, skipped }))
    } catch {
      setNotice(t('dict.deck.failed'))
    }
  }, [rootId, t])

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          data-testid="deck-add-root"
          onClick={() => void addAll()}
        >
          <ListPlus />
          {t('dict.deck.addRoot')}
        </Button>
        {onDrill && (
          <Button
            variant="outline"
            size="sm"
            data-testid="deck-drill-root"
            onClick={() => onDrill(rootId)}
          >
            <Layers />
            {t('dict.deck.drill')}
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className="text-muted-foreground text-xs" data-testid="deck-root-notice">
          {notice}
        </p>
      )}
    </div>
  )
}
