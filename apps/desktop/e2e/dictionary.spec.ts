import { expect, test } from '@playwright/test'
import { electron } from './electron'
import axe from 'axe-core'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const launch = () =>
  electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })

test('search autocompletes, opens a word page with morpheme chips and a root family', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-dictionary').click()
  await expect(page.getByTestId('dictionary-page')).toBeVisible()

  await page.getByTestId('dictionary-search').fill('accel')
  const results = page.getByTestId('dictionary-results')
  await expect(results.getByRole('option', { name: 'accelerate', exact: true })).toBeVisible()
  await page.getByTestId('dictionary-search').press('Enter')

  const word = page.getByTestId('word-page')
  await expect(word.getByRole('heading', { name: 'accelerate', level: 2 })).toBeVisible()
  await expect(page.getByTestId('word-ipa').first()).toContainText('/')
  await expect(word.getByTestId('word-hear')).toBeVisible()
  const chips = page.getByTestId('morpheme-chips')
  await expect(chips.getByRole('button', { name: /celer/ })).toBeVisible()
  await expect(page.getByTestId('related-words')).toBeVisible()

  await chips.getByRole('button', { name: /celer/ }).click()
  await expect(page.getByTestId('root-family')).toContainText('fast')
  await app.close()
})

test('fuzzy search finds a misspelled word and shows a no-results message', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-dictionary').click()
  await page.getByTestId('dictionary-search').fill('acelerate')
  await expect(
    page.getByTestId('dictionary-results').getByRole('option', { name: /^accelerate similar$/ }),
  ).toBeVisible()
  await page.getByTestId('dictionary-search').fill('qqzzxx')
  await expect(page.getByTestId('dictionary-no-results')).toBeVisible()
  await app.close()
})

test('root explorer filters by origin and opens a root, then a word from its family', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-dictionary').click()
  await page.getByTestId('dictionary-tab-roots').click()
  const list = page.getByTestId('roots-list')
  await expect(list).toBeVisible()
  await page.getByRole('button', { name: 'Latin', exact: true }).click()
  await page.getByTestId('roots-filter').fill('fast')
  await list.getByRole('button').first().click()
  await expect(page.getByTestId('root-family')).toBeVisible()
  await page.getByTestId('root-family-words').getByRole('button').first().click()
  await expect(page.getByTestId('word-page')).toBeVisible()
  await app.close()
})

test('Send to Practice puts the word in Read aloud', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-dictionary').click()
  await page.getByTestId('dictionary-search').fill('accelerate')
  await expect(page.getByRole('option', { name: 'accelerate', exact: true })).toBeVisible()
  await page.getByTestId('dictionary-search').press('Enter')
  await page.getByTestId('send-practice').click()
  await expect(page.getByTestId('practice-text')).toHaveValue('accelerate')
  await app.close()
})

test('the word page and root explorer have no serious accessibility violations', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.getByTestId('nav-dictionary').click()
  await page.getByTestId('dictionary-search').fill('accelerate')
  await expect(page.getByRole('option', { name: 'accelerate', exact: true })).toBeVisible()
  await page.getByTestId('dictionary-search').press('Enter')
  await expect(page.getByTestId('related-words')).toBeVisible()
  const scan = async () => {
    await page.evaluate(() => {
      const style = document.createElement('style')
      style.textContent = '*, *::before, *::after { transition: none !important }'
      document.head.append(style)
    })
    await page.evaluate(axe.source)
    const violations = await page.evaluate(async () => {
      const r = await (window as unknown as { axe: typeof axe }).axe.run(document, {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      })
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
    })
    expect(violations).toEqual([])
  }
  await scan()
  await page.getByTestId('dictionary-tab-roots').click()
  await page.getByTestId('roots-list').getByRole('button').first().click()
  await expect(page.getByTestId('root-family')).toBeVisible()
  await scan()
  await app.close()
})
