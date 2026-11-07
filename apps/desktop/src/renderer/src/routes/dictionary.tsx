import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { Flashcards } from '@/components/dictionary/flashcards'
import { RootFamily } from '@/components/dictionary/root-family'
import { RootsBrowser } from '@/components/dictionary/roots-browser'
import { SearchPane } from '@/components/dictionary/search-pane'
import { primaryRootId, WordPage } from '@/components/dictionary/word-page'
import { Pane, useLayout } from '@/components/screens/shell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { loadRecent, pushRecent, saveRecent, type RecentWord } from '@/lib/dictionary'
import { useDictionaryWord } from '@/lib/use-dictionary'
import { cn } from '@/lib/utils'

const toId = (raw: string | null): number | null => {
  const n = raw === null ? NaN : Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Dictionary (IA doc §5): search · word page · roots and family, plus the roots explorer. */
export function DictionaryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const layout = useLayout()
  const [params, setParams] = useSearchParams()
  const [pageTab, setPageTab] = useState('word')
  const [recent, setRecent] = useState(() => loadRecent(localStorage))

  const sectionParam = params.get('section')
  const section =
    sectionParam === 'roots' || sectionParam === 'flashcards' ? sectionParam : 'search'
  const drillRootId = toId(params.get('drill'))
  const wordId = toId(params.get('word'))
  const rootParam = toId(params.get('root'))
  const word = useDictionaryWord(section === 'search' ? wordId : null)
  const wordRootId = word?.status === 'ready' && word.value ? primaryRootId(word.value) : null
  const activeRootId = rootParam ?? wordRootId

  const go = useCallback(
    (next: Record<string, string | null>) =>
      setParams((prev) => {
        const q = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(next)) {
          if (v === null) q.delete(k)
          else q.set(k, v)
        }
        return q
      }),
    [setParams],
  )

  const openWord = useCallback(
    (w: RecentWord) => {
      setRecent((list) => {
        const next = pushRecent(list, w)
        saveRecent(localStorage, next)
        return next
      })
      setPageTab('word')
      go({ section: null, word: String(w.id), root: null })
    },
    [go],
  )
  const openRoot = (id: number) => {
    setPageTab('roots')
    go({ root: String(id) })
  }
  const drill = (id: number) => go({ section: 'flashcards', drill: String(id) })
  const practice = (text: string) => navigate('/practice', { state: { practiceText: text } })

  const wide = layout === 'wide'
  const family = (
    <RootFamily
      rootId={activeRootId}
      currentWordId={wordId ?? undefined}
      onOpenWord={openWord}
      onDrill={drill}
    />
  )
  const wordPage = (
    <WordPage
      state={word}
      activeRootId={activeRootId}
      onOpenWord={openWord}
      onOpenRoot={openRoot}
      onPractice={practice}
    />
  )

  return (
    <div className="flex h-full flex-col" data-testid="dictionary-page">
      <Tabs
        value={section}
        onValueChange={(v) => go({ section: v === 'search' ? null : v, drill: null })}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="border-b px-4 py-2">
          <TabsList aria-label={t('dict.sections')}>
            <TabsTrigger value="search" data-testid="dictionary-tab-search">
              {t('dict.section.search')}
            </TabsTrigger>
            <TabsTrigger value="roots" data-testid="dictionary-tab-roots">
              {t('dict.section.roots')}
            </TabsTrigger>
            <TabsTrigger value="flashcards" data-testid="dictionary-tab-flashcards">
              {t('dict.section.flashcards')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="search" className="min-h-0 flex-1">
          <div
            className={cn(
              'grid h-full divide-x',
              wide
                ? 'grid-cols-[260px_1fr_320px]'
                : layout === 'compact'
                  ? 'grid-cols-[220px_1fr]'
                  : 'grid-cols-[260px_1fr]',
            )}
          >
            <Pane title={t('dict.section.search')}>
              <SearchPane selectedId={wordId} recent={recent} onOpen={openWord} />
            </Pane>
            {wide ? (
              <>
                <Pane>{wordPage}</Pane>
                <Pane title={t('dict.familyTitle')}>{family}</Pane>
              </>
            ) : (
              <Pane>
                <Tabs value={pageTab} onValueChange={setPageTab}>
                  <TabsList>
                    <TabsTrigger value="word">{t('dict.tabWord')}</TabsTrigger>
                    <TabsTrigger value="roots">{t('dict.tabRoots')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="word" className="pt-4">
                    {wordPage}
                  </TabsContent>
                  <TabsContent value="roots" className="pt-4">
                    {family}
                  </TabsContent>
                </Tabs>
              </Pane>
            )}
          </div>
        </TabsContent>

        <TabsContent value="roots" className="min-h-0 flex-1">
          <RootsBrowser
            selectedId={rootParam}
            onSelect={openRoot}
            onOpenWord={openWord}
            layout={layout}
            onDrill={drill}
          />
        </TabsContent>

        <TabsContent value="flashcards" className="min-h-0 flex-1">
          <Flashcards drillRootId={drillRootId} onDrillExit={() => go({ drill: null })} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
