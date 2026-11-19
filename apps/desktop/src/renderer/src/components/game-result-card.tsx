import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { RunResult } from '@engclaw/game'
import type { GameProgressEntry } from '@engclaw/ipc-contract'
import { Button } from '@/components/ui/button'
import { NewBestBadge, StarBurst, StarRating, StatTile } from '@/components/ui/game'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
          <Table className="w-full caption-top text-sm" data-testid="game-compare">
            <TableCaption className="text-muted-foreground mt-0 mb-1 caption-top text-left text-xs font-medium">
              {t('screens.game.compare')}
            </TableCaption>
            <TableHeader>
              <TableRow className="text-muted-foreground text-left text-xs">
                <TableHead scope="col" className="h-auto px-0 pb-1 font-medium">
                  <span className="sr-only">{t('screens.game.col.stars')}</span>
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 pb-1 font-medium">
                  {t('screens.game.thisRun')}
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 pb-1 font-medium">
                  {t('screens.game.prevBest')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableHead scope="row" className="h-auto px-0 py-1.5 text-left font-normal">
                  {t('screens.game.col.stars')}
                </TableHead>
                <TableCell className="px-0">
                  <StarRating stars={run.stars} size="sm" />
                </TableCell>
                <TableCell className="px-0">
                  <StarRating stars={previous.stars} size="sm" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead scope="row" className="h-auto px-0 py-1.5 text-left font-normal">
                  {t('screens.game.avgScore')}
                </TableHead>
                <TableCell className="px-0 tabular-nums" data-testid="game-compare-this">
                  {avg}
                </TableCell>
                <TableCell className="px-0 tabular-nums" data-testid="game-compare-prev">
                  {Math.round(previous.avgScore)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
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
