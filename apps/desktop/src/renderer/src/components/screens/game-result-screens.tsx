import { PartyPopper } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ChapterScreen } from '@/components/screens/game-chapter-screens'
import { Button } from '@/components/ui/button'
import { NewBestBadge, StarBurst, StarRating, StatTile } from '@/components/ui/game'

export type ResultVariant = {
  stars: 1 | 2 | 3
  newBest?: boolean
  compare?: boolean
  last?: boolean
}

const AVG: Record<1 | 2 | 3, number> = { 1: 64, 2: 78, 3: 91 }

/** Result card (IA doc §9.6, §9.7): landscape, centred over the dimmed chapter. */
export function ResultCard({ stars, newBest, compare, last }: ResultVariant) {
  const { t } = useTranslation()
  const before = Math.max(1, stars - 1) as 1 | 2 | 3
  const id = `res-${stars}-${!!newBest}-${!!compare}-${!!last}`
  return (
    <section
      aria-labelledby={id}
      className="bg-card w-[720px] max-w-full space-y-4 rounded-xl border p-6 shadow-lg"
      data-testid="result-card"
    >
      <h3 id={id} className="text-lg font-semibold">
        {t('screens.game.complete', { n: 56 })}
      </h3>
      {last && (
        <p
          className="bg-success-soft text-success-soft-foreground flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          data-testid="last-banner"
        >
          <PartyPopper aria-hidden="true" className="size-4" />
          {t('screens.game.finishedAll')}
        </p>
      )}
      <div className="grid grid-cols-[auto_1fr] items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <StarBurst>
            <StarRating stars={stars} size="lg" reveal />
          </StarBurst>
          {newBest && <NewBestBadge />}
          <p className="text-lg font-semibold">thoroughly</p>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              label={t('screens.game.avgScore')}
              value={String(AVG[stars])}
              hint={compare ? t('screens.game.bestBefore', { score: AVG[before] }) : undefined}
            />
            <StatTile
              label={t('screens.game.attempts')}
              value="9"
              hint={compare ? t('screens.game.bestBeforeN', { n: 7 }) : undefined}
            />
            <StatTile label={t('screens.game.correctLabel')} value="5/5" />
          </div>
          {compare && (
            <table className="w-full text-sm" data-testid="compare">
              <caption className="text-muted-foreground mb-1 text-left text-xs font-medium">
                {t('screens.game.compare')}
              </caption>
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th scope="col" className="pb-1 font-medium">
                    <span className="sr-only">{t('screens.game.col.stars')}</span>
                  </th>
                  <th scope="col" className="pb-1 font-medium">
                    {t('screens.game.thisRun')}
                  </th>
                  <th scope="col" className="pb-1 font-medium">
                    {t('screens.game.prevBest')}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {t('screens.game.col.stars')}
                  </th>
                  <td>
                    <StarRating stars={stars} size="sm" />
                  </td>
                  <td>
                    <StarRating stars={before} size="sm" />
                  </td>
                </tr>
                <tr className="border-t">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {t('screens.game.avgScore')}
                  </th>
                  <td className="tabular-nums">{AVG[stars]}</td>
                  <td className="tabular-nums">{AVG[before]}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
      <footer className="flex flex-wrap justify-end gap-2">
        {last ? (
          <Button>{t('screens.game.backToMap')}</Button>
        ) : (
          <>
            <Button variant="outline">{t('screens.game.replay')}</Button>
            <Button variant="outline">{t('screens.game.map')}</Button>
            <Button>{t('screens.game.next')}</Button>
          </>
        )}
      </footer>
    </section>
  )
}

export function ResultScreen({ width, ...variant }: { width: number } & ResultVariant) {
  return (
    <div className="relative h-full">
      <ChapterScreen width={width} target="word" phase="correct" slots={5} />
      <div className="bg-background/70 absolute inset-0 z-30 flex items-center justify-center p-4 backdrop-blur-[1px]">
        <ResultCard {...variant} />
      </div>
    </div>
  )
}
