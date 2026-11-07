import { useTranslation } from 'react-i18next'
import { ExternalLink, Mic } from 'lucide-react'
import type { DictionaryWord } from '@engclaw/ipc-contract'
import { DeckToggle } from '@/components/dictionary/deck-controls'
import { HearReference } from '@/components/hear-reference'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatIpa, groupSenses } from '@/lib/dictionary'
import { useDictionaryRoot, type Loadable } from '@/lib/use-dictionary'
import { cn } from '@/lib/utils'

const RELATED_LIMIT = 12

export const primaryRootId = (word: DictionaryWord): number | null =>
  (word.morphemes.find((m) => m.kind === 'root') ?? word.morphemes[0])?.root.id ?? null

function MorphemeChips({
  word,
  activeRootId,
  onOpenRoot,
}: {
  word: DictionaryWord
  activeRootId: number | null
  onOpenRoot: (rootId: number) => void
}) {
  const { t } = useTranslation()
  if (word.morphemes.length === 0)
    return <p className="text-muted-foreground text-sm">{t('dict.noParts')}</p>
  return (
    <>
      <p className="text-muted-foreground mb-2 text-xs">{t('dict.partsHint')}</p>
      <ul className="flex flex-wrap items-stretch gap-2" data-testid="morpheme-chips">
        {word.morphemes.map((m, i) => (
          <li key={`${i}-${m.form}`} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-muted-foreground">
                +
              </span>
            )}
            <button
              type="button"
              data-kind={m.kind}
              aria-pressed={m.root.id === activeRootId}
              onClick={() => onOpenRoot(m.root.id)}
              className={cn(
                'focus-visible:ring-ring/50 flex flex-col items-start rounded-lg border px-3 py-1.5 text-left',
                'hover:bg-primary-soft focus-visible:ring-[3px] focus-visible:outline-none',
                'aria-pressed:bg-primary-soft aria-pressed:border-primary',
                m.kind === 'root' && 'border-2',
              )}
            >
              <span className="text-base font-semibold break-words">{m.form}</span>
              <span className="text-muted-foreground text-xs">
                {t(`dict.kind.${m.kind}`)} · {m.root.meaning}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function Related({
  word,
  onOpenWord,
}: {
  word: DictionaryWord
  onOpenWord: (word: { id: number; word: string }) => void
}) {
  const { t } = useTranslation()
  const root = useDictionaryRoot(primaryRootId(word))
  if (!root || root.status === 'loading' || root.status === 'error' || !root.value) return null
  const others = root.value.words.filter((w) => w.id !== word.id).slice(0, RELATED_LIMIT)
  return (
    <section aria-labelledby="dict-related" className="space-y-2">
      <h4 id="dict-related" className="text-sm font-semibold">
        {t('dict.related')}
      </h4>
      <p className="text-muted-foreground text-xs">{t('dict.relatedHint', { word: word.word })}</p>
      {others.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('dict.noRelated')}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" data-testid="related-words">
          {others.map((w) => (
            <li key={w.id}>
              <Button variant="outline" size="xs" onClick={() => onOpenWord(w)}>
                {w.word}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Etymology({ etymology }: { etymology: NonNullable<DictionaryWord['etymology']> }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="dict-origin" className="space-y-1 text-sm">
      <h4 id="dict-origin" className="text-sm font-semibold">
        {t('dict.origin')}
      </h4>
      {etymology.chain.length > 0 && (
        <p>
          {etymology.chain.map((step, i) => (
            <span key={i}>
              {i > 0 && <span aria-hidden="true"> ← </span>}
              {step.lang} <i lang={step.langCode}>{step.term}</i>
            </span>
          ))}
        </p>
      )}
      {etymology.pieRoot && (
        <p>
          <span className="text-muted-foreground">{t('dict.pie')}: </span>
          {etymology.pieRoot}
        </p>
      )}
      {etymology.firstUse && (
        <p>
          <span className="text-muted-foreground">{t('dict.firstUse')}: </span>
          {etymology.firstUse}
        </p>
      )}
      <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
        {[
          [etymology.sourceUrl, t('dict.etymologySource')],
          [etymology.etymonlineUrl, t('dict.etymonline')],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            {label}
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        ))}
      </p>
    </section>
  )
}

/** Word page: IPA + audio, definitions, morpheme chips, origin and related words. */
export function WordPage({
  state,
  activeRootId,
  onOpenWord,
  onOpenRoot,
  onPractice,
}: {
  state: Loadable<DictionaryWord | null> | null
  activeRootId: number | null
  onOpenWord: (word: { id: number; word: string }) => void
  onOpenRoot: (rootId: number) => void
  onPractice: (word: string) => void
}) {
  const { t } = useTranslation()
  if (!state)
    return (
      <p className="text-muted-foreground flex min-h-40 items-center justify-center text-center text-sm">
        {t('dict.pickWord')}
      </p>
    )
  if (state.status === 'loading')
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <span role="status" className="sr-only">
          {t('dict.loading')}
        </span>
      </div>
    )
  if (state.status === 'error' || !state.value)
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('dict.notFound')}
      </p>
    )
  const word = state.value
  return (
    <article className="space-y-5" data-testid="word-page" aria-labelledby="dict-word-title">
      <header className="space-y-2">
        <h2 id="dict-word-title" lang="en" className="text-2xl font-semibold break-words">
          {word.word}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {word.pronunciations.map((ipa) => (
            <span
              key={ipa}
              lang="en-fonipa"
              aria-label={t('dict.ipa')}
              data-testid="word-ipa"
              className="text-base"
            >
              {formatIpa(ipa)}
            </span>
          ))}
          <HearReference text={word.word} variant="ghost" />
          <Button
            variant="outline"
            size="sm"
            data-testid="send-practice"
            onClick={() => onPractice(word.word)}
          >
            <Mic />
            {t('dict.sendPractice')}
          </Button>
          <DeckToggle word={word.word} />
        </div>
      </header>

      <section aria-labelledby="dict-defs" className="space-y-3">
        <h4 id="dict-defs" className="text-sm font-semibold">
          {t('dict.definitions')}
        </h4>
        {groupSenses(word.senses).map((g) => (
          <div key={g.pos} className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">
              {t(`dict.pos.${g.pos}`, { defaultValue: g.pos })}
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {g.senses.map((s, i) => (
                <li key={i}>
                  {s.definition}
                  {s.example && (
                    <span className="text-muted-foreground block italic">“{s.example}”</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <section aria-labelledby="dict-parts" className="space-y-2">
        <h4 id="dict-parts" className="text-sm font-semibold">
          {t('dict.parts')}
        </h4>
        <MorphemeChips word={word} activeRootId={activeRootId} onOpenRoot={onOpenRoot} />
      </section>

      {word.etymology && <Etymology etymology={word.etymology} />}
      <Related word={word} onOpenWord={onOpenWord} />
    </article>
  )
}
