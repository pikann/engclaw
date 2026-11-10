import { expect, type Page } from '@playwright/test'
import type { EngclawApi, AgentEvent } from '@engclaw/ipc-contract'

type Win = { engclaw: EngclawApi }

/** Points the app at the fake provider. */
export async function configureProvider(
  page: Page,
  baseUrl: string,
  extra: { model?: string; apiKey?: string; headers?: { name: string; value: string }[] } = {},
): Promise<{ ok: boolean; code?: string }> {
  return page.evaluate(
    ({ baseUrl, extra }) =>
      (window as unknown as Win).engclaw.llm.save({ baseUrl, model: 'mock', ...extra }) as Promise<{
        ok: boolean
        code?: string
      }>,
    { baseUrl, extra },
  )
}

/** Records every agent event the renderer receives, so a spec can assert on the exact stream. */
export async function recordAgentEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Win & { __events: AgentEvent[] }
    w.__events = []
    w.engclaw.agent.onEvent((e) => w.__events.push(e))
  })
}
export const agentEvents = (page: Page): Promise<AgentEvent[]> =>
  page.evaluate(() => (window as unknown as { __events: AgentEvent[] }).__events)

export async function openConverse(page: Page): Promise<void> {
  await page.getByTestId('nav-converse').click()
  await expect(page.getByTestId('converse')).toBeVisible()
  await expect(page.getByTestId('converse-setup')).toHaveCount(0)
}

/** One spoken turn: start, let the fake mic play for `ms`, stop. */
export async function speakTurn(page: Page, ms = 2500): Promise<void> {
  await page.getByTestId('converse-mic').click()
  await expect(page.getByTestId('converse-stop')).toBeVisible()
  await page.waitForTimeout(ms)
  await page.getByTestId('converse-stop').click()
}
