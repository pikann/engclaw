import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import type { EngclawApi } from '@engclaw/ipc-contract'
import axe from 'axe-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Drives the real level map against the shipped 3,000-chapter catalog with seeded progress. */
let app: ElectronApplication
let page: Page

async function seed(passed: number): Promise<void> {
  await page.evaluate(async (n) => {
    for (let order = 1; order <= n; order++)
      await (window as unknown as { engclaw: EngclawApi }).engclaw.game.record({
        order,
        stars: ((order % 3) + 1) as 1 | 2 | 3,
        avgScore: 80,
        bestScore: 90,
        attempts: 6,
      })
  }, passed)
}

test.beforeEach(async () => {
  app = await electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })
  page = await app.firstWindow()
  await page.waitForLoadState('load')
})
test.afterEach(async () => {
  await app.close()
})

const open = async (): Promise<number> => {
  await page.evaluate(() => (location.hash = '#/'))
  const started = Date.now()
  await page.evaluate(() => (location.hash = '#/game'))
  await expect(page.getByTestId('road-map')).toBeVisible()
  await expect(page.locator('[data-testid^="game-node-"]').first()).toBeVisible()
  return Date.now() - started
}

test('fresh game: only chapter 1 is playable and locked chapters stay closed', async () => {
  await open()
  await expect(page.getByTestId('game-node-1')).toHaveAttribute('data-state', 'current')
  await expect(page.getByTestId('game-node-2')).toHaveAttribute('data-state', 'locked')
  await page.getByTestId('game-node-2').click({ force: true })
  await expect(page.getByTestId('chapter-preview')).toBeVisible()
  await expect(page.getByTestId('preview-play')).toHaveCount(0)
  await page.evaluate(() => (location.hash = '#/game/chapter/2'))
  await expect(page.getByTestId('game-locked')).toBeVisible()

  await open()
  await page.getByTestId('game-node-1').click()
  await page.getByTestId('preview-play').click()
  await expect(page.getByTestId('game-target')).toBeVisible()
})

test('passed chapters unlock the next, stay replayable, and continue jumps to the next one', async () => {
  await seed(80)
  await open()
  await expect(page.getByTestId('game-continue')).toContainText('81')
  await page.getByTestId('game-continue').click()
  await expect(page.getByTestId('world-title')).toContainText('2')
  await expect(page.getByTestId('game-node-81')).toHaveAttribute('data-state', 'current')
  await expect(page.getByTestId('game-node-82')).toHaveAttribute('data-state', 'locked')
  await page.getByTestId('game-node-80').click()
  await expect(page.getByTestId('preview-play')).toBeVisible()
  await page.getByTestId('preview-play').click()
  await expect(page.getByTestId('game-target')).toBeVisible()
})

test('selected world and scroll position are remembered', async () => {
  await open()
  await page.getByTestId('game-world-select').selectOption('12')
  await expect(page.getByTestId('world-title')).toContainText('12')
  await expect(page.getByTestId('game-node-1')).toHaveCount(0)
  await expect(page.locator('[data-testid^="game-node-"]').first()).toBeVisible()
  await page.getByTestId('road-map').evaluate((el) => (el.scrollTop = 300))
  await page.waitForTimeout(500)
  await open()
  await expect(page.getByTestId('world-title')).toContainText('12')
  await expect
    .poll(() => page.getByTestId('road-map').evaluate((el) => Math.abs(el.scrollTop - 300) <= 2))
    .toBe(true)
})

test('keyboard navigation and the list view are an accessible alternative', async () => {
  await seed(3)
  await open()
  await page.getByTestId('game-node-4').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('game-node-3')).toBeFocused()
  await expect(page.getByTestId('chapter-preview')).toBeVisible()
  await expect(page.getByTestId('game-node-3')).toHaveAttribute(
    'aria-label',
    /passed, \d of 3 stars/,
  )

  await page.getByTestId('view-list').click()
  await expect(page.getByTestId('chapter-list').getByRole('listitem')).toHaveCount(75)
  await expect(page.getByTestId('game-row-5')).toHaveAttribute('aria-disabled', 'true')
  const results = await page.evaluate(async (src) => {
    ;(0, eval)(src)
    return (window as unknown as { axe: typeof axe }).axe.run(document.body)
  }, axe.source)
  expect(
    results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
  ).toEqual([])
})

test('stays light with the whole catalog: bounded DOM, fast open, smooth scrolling', async () => {
  await seed(2999)
  const openMs = await open()
  const nodes = await page.locator('[data-testid^="game-node-"]').count()
  expect(nodes).toBeLessThan(60)
  expect(openMs).toBeLessThan(300)

  const fps = await page.getByTestId('road-map').evaluate(
    (el) =>
      new Promise<{ fps: number; worst: number }>((resolve) => {
        const max = el.scrollHeight - el.clientHeight
        let last = performance.now()
        const start = last
        let frames = 0
        let worst = 0
        const tick = (now: number): void => {
          frames++
          worst = Math.max(worst, now - last)
          last = now
          const p = Math.min(1, (now - start) / 2000)
          el.scrollTop = max * (1 - p)
          if (p < 1) requestAnimationFrame(tick)
          else resolve({ fps: (frames / (now - start)) * 1000, worst })
        }
        requestAnimationFrame(tick)
      }),
  )
  console.log(
    `PERF open=${openMs}ms nodes=${nodes} fps=${fps.fps.toFixed(1)} worstFrame=${fps.worst.toFixed(1)}ms`,
  )
  expect(fps.fps).toBeGreaterThan(50)
})
