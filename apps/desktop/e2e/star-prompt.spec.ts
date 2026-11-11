import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { EngclawApi } from '@engclaw/ipc-contract'
import { launchApp } from './support/launch'

type Win = { engclaw: EngclawApi }

const MOMENT = 'engclaw:star-moment'
const card = (page: Page) => page.getByTestId('star-prompt')

/** Reports `n` saved attempts with `score`, one at a time so each settings update lands. */
async function moments(page: Page, n: number, score = 90): Promise<void> {
  for (let i = 0; i < n; i++) {
    await page.evaluate(
      ([name, s]) => window.dispatchEvent(new CustomEvent(name as string, { detail: s })),
      [MOMENT, score],
    )
    // The handler reads and writes settings over IPC; wait until it has finished.
    await page.evaluate(() => (window as unknown as Win).engclaw.app.getSettings())
  }
}

const state = (page: Page) =>
  page
    .evaluate(() => (window as unknown as Win).engclaw.app.getSettings())
    .then((s) => s.starPrompt)

/** Replaces shell.openExternal so the test never opens a real browser; returns the recorded URLs. */
async function captureExternal(app: ElectronApplication): Promise<() => Promise<string[]>> {
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] }
    g.__opened = []
    shell.openExternal = async (url: string) => void g.__opened.push(url)
  })
  return () => app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened)
}

test('stays hidden until enough good results; weak scores do not count', async () => {
  const { app, page } = await launchApp()
  await expect(page.getByTestId('home')).toBeVisible()
  await moments(page, 9)
  await moments(page, 5, 30)
  await expect(card(page)).toBeHidden()
  expect((await state(page)).moments).toBe(9)
  await app.close()
})

test('"Maybe later" hides the card and it does not come straight back', async () => {
  const { app, page } = await launchApp()
  await moments(page, 10)
  await expect(card(page)).toBeVisible()
  await expect(card(page)).toHaveAccessibleName('Enjoying Engclaw?')
  await card(page).getByRole('button', { name: 'Maybe later' }).click()
  await expect(card(page)).toBeHidden()
  expect(await state(page)).toMatchObject({ done: false, shown: 1 })
  await moments(page, 3)
  await expect(card(page)).toBeHidden()
  await app.close()
})

test('"Star on GitHub" opens the repo and the choice survives a relaunch', async () => {
  const first = await launchApp()
  const opened = await captureExternal(first.app)
  await moments(first.page, 10)
  await first.page.getByTestId('star-prompt-star').click()
  await expect(card(first.page)).toBeHidden()
  expect(await opened()).toEqual(['https://github.com/pikann/engclaw'])
  expect((await state(first.page)).done).toBe(true)
  await first.app.close()

  const again = await launchApp({ userData: first.userData })
  await moments(again.page, 12)
  await expect(card(again.page)).toBeHidden()
  await again.app.close()
})

test('"Don\'t ask again" stops the reminders for good', async () => {
  const { app, page } = await launchApp()
  await moments(page, 10)
  await card(page).getByRole('button', { name: "Don't ask again" }).click()
  await expect(card(page)).toBeHidden()
  expect((await state(page)).done).toBe(true)
  await moments(page, 5)
  await expect(card(page)).toBeHidden()
  await app.close()
})
