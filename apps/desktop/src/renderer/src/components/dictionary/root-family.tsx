import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useDictionaryRoot } from '@/lib/use-dictionary'

/** A root with its meaning, origin and the family of words built on it. */
export function RootFamily({
  rootId,
  currentWordId,
  onOpenWord,
}: {
  rootId: number | null
  currentWordId?: number
  onOpenWord: (word: { id: number; word: string }) => void
}) {
  const { t } = useTranslation()
  const root = useDictionaryRoot(rootId)
  if (!root) return <p className="text-muted-foreground text-sm">{t('dict.pickRoot')}</p>
  if (root.status === 'loading')
    return (
      <div aria-busy="true" className="space-y-2">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <span role="status" className="sr-only">
          {t('dict.loading')}
        </span>
      </div>
    )
  if (root.status === 'error' || !root.value)
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('dict.notFound')}
      </p>
    )
  const r = root.value
  return (
    <div className="space-y-4" data-testid="root-family">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold break-words" lang="en">
          {r.root}
        </h3>
        <p className="text-sm">
          <span className="text-muted-foreground">{t('dict.rootMeaning')}: </span>
          {r.meaning}
        </p>
        {r.forms.length > 0 && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t('dict.rootForms')}: </span>
            {r.forms.join(', ')}
          </p>
        )}
        {r.origins.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{t('dict.rootOrigin')}: </span>
            {r.origins.map((o) => (
              <Badge key={o} variant="secondary">
                {o}
              </Badge>
            ))}
          </p>
        )}
      </div>
      <div>
        <h4 className="text-muted-foreground mb-1 text-xs font-medium">
          {t('dict.family')} · {t('dict.wordCount', { count: r.total })}
        </h4>
        {r.words.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('dict.noRelated')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" data-testid="root-family-words">
            {r.words.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onOpenWord(w)}
                  aria-current={w.id === currentWordId ? 'true' : undefined}
                  className="hover:bg-primary-soft focus-visible:ring-ring/50 aria-[current=true]:bg-primary-soft rounded-md border px-2 py-1 text-sm focus-visible:ring-[3px] focus-visible:outline-none aria-[current=true]:font-medium"
                >
                  {w.word}
                </button>
              </li>
            ))}
          </ul>
        )}
        {r.total > r.words.length && (
          <p className="text-muted-foreground mt-2 text-xs">
            {t('dict.familyMore', { shown: r.words.length, total: r.total })}
          </p>
        )}
      </div>
      <a
        href={r.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
      >
        {t('dict.rootSource')}
        <ExternalLink aria-hidden="true" className="size-3" />
      </a>
    </div>
  )
}
