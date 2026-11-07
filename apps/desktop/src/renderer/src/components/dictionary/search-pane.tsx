import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import type { DictionarySearchResult } from '@engclaw/ipc-contract'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { RecentWord } from '@/lib/dictionary'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 120

type Search =
  | { status: 'idle' }
  | { status: 'ready'; query: string; results: DictionarySearchResult[] }
  | { status: 'error' }

/** Autocomplete search (prefix, then fuzzy) with a recent-words list when the box is empty. */
export function SearchPane({
  selectedId,
  recent,
  onOpen,
}: {
  selectedId: number | null
  recent: RecentWord[]
  onOpen: (word: RecentWord) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<Search>({ status: 'idle' })
  const [active, setActive] = useState(0)
  const listId = useId()
  const latest = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    const mine = ++latest.current
    if (!trimmed) {
      setSearch({ status: 'idle' })
      return
    }
    const timer = setTimeout(() => {
      window.engclaw.dictionary
        .search({ query: trimmed, limit: 20 })
        .then(
          (results): Search => ({ status: 'ready', query: trimmed, results }),
          (): Search => ({ status: 'error' }),
        )
        .then((next) => {
          if (latest.current !== mine) return
          setSearch(next)
          setActive(0)
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const searching = query.trim() !== ''
  const items: { id: number; word: string; fuzzy?: boolean }[] =
    searching && search.status === 'ready'
      ? search.results.map((r) => ({ id: r.id, word: r.word, fuzzy: r.match === 'fuzzy' }))
      : searching
        ? []
        : recent
  const optionId = (i: number) => `${listId}-${i}`

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return
      e.preventDefault()
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
    } else if (e.key === 'Enter') {
      const item = items[active]
      if (item) onOpen({ id: item.id, word: item.word })
    } else if (e.key === 'Escape' && query) {
      e.stopPropagation()
      setQuery('')
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
        />
        <Input
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={items.length ? optionId(active) : undefined}
          aria-label={t('dict.searchLabel')}
          placeholder={t('dict.searchPlaceholder')}
          data-testid="dictionary-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="pl-8"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {!searching && (
        <p className="text-muted-foreground text-sm">
          {t(recent.length ? 'dict.recentHint' : 'dict.noRecent')}
        </p>
      )}
      {search.status === 'error' && searching && (
        <p role="alert" className="text-destructive text-sm">
          {t('dict.searchFailed')}
        </p>
      )}
      {searching && search.status === 'ready' && items.length === 0 && (
        <p
          role="status"
          data-testid="dictionary-no-results"
          className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm"
        >
          {t('dict.noResults', { query: search.query })}
          <span className="mt-1 block">{t('dict.tryAnother')}</span>
        </p>
      )}

      {items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t(searching ? 'dict.results' : 'dict.recent')}
          data-testid="dictionary-results"
          className="space-y-0.5"
        >
          {items.map((item, i) => (
            <li
              key={item.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              data-current={item.id === selectedId ? 'true' : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => onOpen({ id: item.id, word: item.word })}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm',
                i === active && 'bg-primary-soft',
                item.id === selectedId && 'font-medium',
              )}
            >
              <span className="min-w-0 break-words">{item.word}</span>
              {item.fuzzy && <Badge variant="outline">{t('dict.didYouMean')}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
