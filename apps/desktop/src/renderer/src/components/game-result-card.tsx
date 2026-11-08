import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { RunResult } from '@engclaw/game'
import type { GameProgressEntry } from '@engclaw/ipc-contract'
import { Button } from '@/components/ui/button'
import { NewBestBadge, StarBurst, StarRating, StatTile } from '@/components/ui/game'

/** Shown when a chapter run is passed: this run's result, the comparison with the stored best, and next actions. */
export function ChapterResultCard({
  order,
  hasNext,
  run,
  previous,
  newBest,
  onReplay,
}: {
  order: number
  hasNext: boolean
  run: RunResult
  previous: GameProgressEntry | null
  newBest: boolean
  onReplay: () => void
}) {
  const { t } = useTranslation()
  const avg = Math.round(run.avgScore)
  return (
    <div className="bg-card space-y-4 rounded-xl border p-5" data-testid="game-passed">
      <h3 className="text-lg font-semibold" role="status">
        {t('screens.game.complete', { n: order })}
      </h3>
      <div className="flex flex-col items-center gap-2">
        <StarBurst>
          <StarRating stars={run.stars} size="lg" reveal />
        </StarBurst>
        {newBest && (
          <span data-testid="game-new-best">
            <NewBestBadge />
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label={t('screens.game.avgScore')}
          value={String(avg)}
          hint={
            previous
              ? t('screens.game.bestBefore', { score: Math.round(previous.avgScore) })
              : undefined
          }
        />
        <StatTile label={t('screens.game.attempts')} value={String(run.attempts)} />
      </div>
      {previous && (
        <>
          <table className="w-full text-sm" data-testid="game-compare">
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
                  <StarRating stars={run.stars} size="sm" />
                </td>
                <td>
                  <StarRating stars={previous.stars} size="sm" />
                </td>
              </tr>
              <tr className="border-t">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {t('screens.game.avgScore')}
                </th>
                <td className="tabular-nums" data-testid="game-compare-this">
                  {avg}
                </td>
                <td className="tabular-nums" data-testid="game-compare-prev">
                  {Math.round(previous.avgScore)}
                </td>
              </tr>
            </tbody>
          </table>
          {!newBest && (
            <p className="text-muted-foreground text-sm" data-testid="game-best-kept">
              {t('screens.game.bestKept')}
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {hasNext ? (
          <Button asChild>
            <Link to={`/game/chapter/${order + 1}`}>{t('screens.game.next')}</Link>
          </Button>
        ) : (
          <>
            <Button disabled aria-describedby="game-next-hint" data-testid="game-next">
              {t('screens.game.next')}
            </Button>
            <p id="game-next-hint" className="text-muted-foreground w-full text-xs">
              {t('screens.game.noNextChapter')}
            </p>
          </>
        )}
        <Button variant="outline" onClick={onReplay} data-testid="game-replay">
          <RotateCcw />
          {t('screens.game.replay')}
        </Button>
        <Button asChild variant="outline">
          <Link to="/game" data-testid="game-back-map">
            {t('screens.game.backToMap')}
          </Link>
        </Button>
      </div>
    </div>
  )
}
