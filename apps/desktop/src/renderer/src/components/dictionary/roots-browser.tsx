import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import type { DictionaryRootList } from '@engclaw/ipc-contract'
import { RootFamily } from '@/components/dictionary/root-family'
import { Pane, type Layout } from '@/components/screens/shell'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Root explorer: filter the roots by origin language and text, open one to see its family. */
export function RootsBrowser({
  selectedId,
  onSelect,
  onOpenWord,
  layout,
}: {
  selectedId: number | null
  onSelect: (rootId: number) => void
  onOpenWord: (word: { id: number; word: string }) => void
  layout: Layout
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [origin, setOrigin] = useState<string | null>(null)
  const [list, setList] = useState<DictionaryRootList | null>(null)
  const [failed, setFailed] = useState(false)
  const [origins, setOrigins] = useState<string[]>([])

  useEffect(() => {
    let live = true
    window.engclaw.dictionary
      .roots({ ...(origin && { origin }), ...(query.trim() && { query: query.trim() }) })
      .then(
        (r) => {
          if (!live) return
          setList(r)
          setFailed(false)
          setOrigins((prev) => (prev.length ? prev : r.origins))
        },
        () => live && setFailed(true),
      )
    return () => {
      live = false
    }
  }, [query, origin])

  return (
    <div
      data-testid="roots-browser"
      className={cn(
        'grid h-full divide-x',
        layout === 'compact' ? 'grid-cols-[240px_1fr]' : 'grid-cols-[320px_1fr]',
      )}
    >
      <Pane title={t('dict.rootsList')}>
        <div className="space-y-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4"
            />
            <Input
              aria-label={t('dict.rootsSearch')}
              placeholder={t('dict.rootsSearch')}
              data-testid="roots-filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div role="group" aria-label={t('dict.originFilter')} className="flex flex-wrap gap-1.5">
            {[null, ...origins].map((o) => (
              <button
                key={o ?? 'all'}
                type="button"
                aria-pressed={origin === o}
                onClick={() => setOrigin(o)}
                className="hover:bg-primary-soft focus-visible:ring-ring/50 aria-pressed:bg-primary-soft aria-pressed:border-primary rounded-md border px-2 py-1 text-xs focus-visible:ring-[3px] focus-visible:outline-none aria-pressed:font-medium"
              >
                {o ?? t('dict.allOrigins')}
              </button>
            ))}
          </div>
          {failed && (
            <p role="alert" className="text-destructive text-sm">
              {t('dict.searchFailed')}
            </p>
          )}
          {list && list.roots.length === 0 && (
            <p role="status" className="text-muted-foreground text-sm">
              {t('dict.noRoots')}
            </p>
          )}
          {list && list.roots.length > 0 && (
            <ul aria-label={t('dict.rootsList')} className="space-y-0.5" data-testid="roots-list">
              {list.roots.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-current={r.id === selectedId ? 'true' : undefined}
                    onClick={() => onSelect(r.id)}
                    className="hover:bg-primary-soft focus-visible:ring-ring/50 aria-[current=true]:bg-primary-soft flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm focus-visible:ring-[3px] focus-visible:outline-none aria-[current=true]:font-medium"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="break-words">{r.root}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {t('dict.wordCount', { count: r.wordCount })}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs break-words">{r.meaning}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Pane>
      <Pane>
        <RootFamily rootId={selectedId} onOpenWord={onOpenWord} />
      </Pane>
    </div>
  )
}
