import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { EngclawApi } from '@engclaw/ipc-contract'
import { cpSync, mkdtempSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Converse on the real app with a mocked OpenAI-compatible provider (a loopback server) and
 * Chromium's fake mic. Captions and history need no models; the spoken turn needs the installed
 * models (ENGCLAW_E2E_USER_DATA, as in practice.spec.ts) and otherwise stops at the model gate.
 */
const wav = resolve(__dirname, '../../../tests/golden/audio/bundled-developer.wav')
const modelsUserData = process.env['ENGCLAW_E2E_USER_DATA']
const REPLY = 'That sounds great. What did you build today?'

let server: Server
let baseUrl = ''

test.beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume()
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const w of REPLY.split(/(?<= )/))
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`)
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)
    res.end('data: [DONE]\n\n')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})
test.afterAll(() => server.close())

function freshUserData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))
  if (modelsUserData) cpSync(modelsUserData, dir, { recursive: true })
  return dir
}

async function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${userData}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  })
}

test('shows the provider prompt until a provider is configured', async () => {
  const app = await launch(freshUserData())
  const page = await app.firstWindow()
  await page.getByTestId('nav-converse').click()
  await expect(page.getByTestId('converse-setup')).toBeVisible()
  await expect(page.getByTestId('converse-mic')).toBeDisabled()
  await app.close()
})

test('hiding captions removes the transcript, showing restores it, and the choice persists', async () => {
  const userData = freshUserData()
  let app = await launch(userData)
  let page = await app.firstWindow()
  await page.evaluate(async (url) => {
    await (window as unknown as { engclaw: EngclawApi }).engclaw.llm.save({
      baseUrl: url,
      model: 'mock',
    })
    const sent = await (window as unknown as { engclaw: EngclawApi }).engclaw.agent.send({
      text: 'Hello, I am a developer',
    })
    if (!sent.ok) throw new Error(sent.code)
  }, baseUrl)
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { engclaw: EngclawApi }).engclaw.agent.list().then((l) => l.length),
      ),
    )
    .toBe(1)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const [c] = await (window as unknown as { engclaw: EngclawApi }).engclaw.agent.list()
        return (
          await (window as unknown as { engclaw: EngclawApi }).engclaw.agent.messages({
            conversationId: c!.id,
          })
        ).length
      }),
    )
    .toBe(2)

  await page.getByTestId('nav-converse').click()
  await page.getByTestId('converse-history').getByRole('button').first().click()
  const transcript = page.getByTestId('converse-transcript')
  await expect(transcript).toContainText('Hello, I am a developer')
  await expect(transcript).toContainText(REPLY)

  const toggle = page.getByTestId('captions-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('converse-transcript')).toHaveCount(0)
  await expect(page.getByText(REPLY)).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Captions hidden' })).toHaveCount(1)

  await page.keyboard.press('Alt+KeyC')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('converse-transcript')).toContainText(REPLY)
  await expect(page.locator('[data-role]')).toHaveCount(2)

  await page.keyboard.press('Alt+KeyC')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await app.close()

  app = await launch(userData)
  page = await app.firstWindow()
  await page.getByTestId('nav-converse').click()
  await expect(page.getByTestId('captions-toggle')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('converse-transcript')).toHaveCount(0)
  await app.close()
})

test('a spoken turn goes mic -> ASR -> mocked provider -> captions', async () => {
  const app = await launch(freshUserData())
  const page = await app.firstWindow()
  await page.evaluate(
    (url) =>
      (window as unknown as { engclaw: EngclawApi }).engclaw.llm.save({
        baseUrl: url,
        model: 'mock',
      }),
    baseUrl,
  )
  await page.getByTestId('nav-converse').click()
  await page.getByTestId('converse-mic').click()
  await expect(page.getByTestId('converse-stop')).toBeVisible()
  await page.waitForTimeout(2500)
  await page.getByTestId('converse-stop').click()
  await expect(page.getByTestId('converse-mic-error')).toHaveCount(0)

  if (modelsUserData) {
    await expect(page.getByTestId('converse-transcript')).toContainText(/developer/i, {
      timeout: 120_000,
    })
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 30_000 })
    await expect(page.getByTestId('converse-mic')).toBeEnabled({ timeout: 60_000 })
  } else {
    await expect(page.getByTestId('converse-models')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('converse-transcript')).toHaveCount(0)
  }
  await app.close()
})
