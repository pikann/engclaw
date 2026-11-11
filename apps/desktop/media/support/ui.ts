import { expect, type Page } from '@playwright/test'
import type { EngclawApi } from '@engclaw/ipc-contract'

/** Collapses the left navigation, so the GIFs show only the feature (go to the page by hash first). */
export async function collapseSidebar(page: Page): Promise<void> {
  const trigger = page.locator('[data-sidebar="trigger"]').first()
  if ((await trigger.getAttribute('aria-expanded')) === 'false') return
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await page.waitForTimeout(500) // let the slide-out finish
  // "Collapsed" in the app leaves a thin icon rail; hide that too so the feature gets the room.
  await page.addStyleTag({
    content:
      '[data-slot="sidebar-container"]{display:none!important}[data-slot="sidebar-gap"]{width:0!important}',
  })
}

export const goto = (page: Page, route: string) => page.evaluate((r) => (location.hash = r), route)

/** Marks the first `n` game chapters as passed so the map shows some progress. */
export async function seedGame(page: Page, n: number): Promise<void> {
  await page.evaluate(async (count) => {
    for (let order = 1; order <= count; order++)
      await (window as unknown as { engclaw: EngclawApi }).engclaw.game.record({
        order,
        stars: ((order % 3) + 1) as 1 | 2 | 3,
        avgScore: 84,
        bestScore: 92,
        attempts: 6,
      })
  }, n)
}
