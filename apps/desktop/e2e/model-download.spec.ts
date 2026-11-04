import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * First-run model download with a stubbed catalog and a local server standing in for Hugging Face
 * (the app redirects its download requests there via ENGCLAW_E2E_* in unpackaged builds).
 */
const wav = resolve(__dirname, '../../../tests/golden/audio/bundled-developer.wav')
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

const ids = ['phone', 'asr-en', 'tts-ref'] as const
const files = new Map<string, Buffer>()
for (const id of ids) {
  files.set(`/stub/${id}/resolve/rev1/config.json`, Buffer.from(`{"id":"${id}"}`))
  files.set(`/stub/${id}/resolve/rev1/model.bin`, Buffer.alloc(100_000, id.length))
}
const catalog = {
  models: ids.map((id) => {
    const mine = [...files].filter(([url]) => url.startsWith(`/stub/${id}/`))
    return {
      id,
      name: `Stub ${id} model`,
      license: 'Apache-2.0',
      repo: `stub/${id}`,
      revision: 'rev1',
      files: mine.map(([url, body]) => ({
        path: url.split('/').pop(),
        size: body.length,
        sha256: sha(body),
      })),
    }
  }),
}

let server: Server
let base = ''
let failing = false

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const body = files.get(req.url ?? '')
    if (!body) return void res.writeHead(404).end()
    if (failing && req.url?.startsWith('/stub/asr-en/') && req.url.endsWith('model.bin')) {
      return void res.writeHead(500).end()
    }
    const range = /^bytes=(\d+)-$/.exec(req.headers['range'] ?? '')
    const from = range ? Number(range[1]) : 0
    res.writeHead(range ? 206 : 200, { 'content-length': body.length - from })
    res.end(body.subarray(from))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})
test.afterAll(() => server.close())

async function launch(userData: string, catalogFile: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [
      join(__dirname, '..'),
      `--user-data-dir=${userData}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
    env: {
      ...process.env,
      ENGCLAW_E2E_CATALOG: catalogFile,
      // Requests for https://huggingface.co/<repo>/... go to <base>/<repo>/...
      ENGCLAW_E2E_MODELS_URL: base,
    },
  })
}

function setup(): { userData: string; catalogFile: string } {
  const userData = mkdtempSync(join(tmpdir(), 'engclaw-e2e-'))
  const catalogFile = join(userData, 'catalog.json')
  writeFileSync(catalogFile, JSON.stringify(catalog))
  return { userData, catalogFile }
}

async function recordAndAnalyze(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('practice-text').fill('Hello, I am a developer')
  await page.getByTestId('practice-record').click()
  await expect(page.getByTestId('practice-stop')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByTestId('practice-stop').click()
}

test('analyze on a clean profile prompts to download, then resumes after a failure', async () => {
  const { userData, catalogFile } = setup()
  const app = await launch(userData, catalogFile)
  const page = await app.firstWindow()
  await recordAndAnalyze(page)

  const dialog = page.getByTestId('model-download-dialog')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('model-download-row-phone')).toContainText('Apache-2.0')
  await expect(page.getByTestId('model-download-summary')).toBeVisible()

  failing = true
  await page.getByTestId('model-download-start').click()
  await expect(page.getByTestId('model-download-error')).toBeVisible({ timeout: 30_000 })
  // The manager retries with back-off before giving up; once the server recovers, retry resumes.
  failing = false
  await page.getByTestId('model-download-retry').click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  for (const id of ids)
    expect(existsSync(join(userData, 'models', id, 'rev1', 'model.bin'))).toBe(true)
  // The analysis ran again on its own (the stub models are not real, so it fails differently).
  await expect(page.getByTestId('practice-retry')).toBeVisible({ timeout: 30_000 })
  await app.close()
})

test('a custom folder is saved, receives the models and is found on the next launch', async () => {
  const { userData, catalogFile } = setup()
  const custom = mkdtempSync(join(tmpdir(), 'engclaw-models-'))
  const app = await launch(userData, catalogFile)
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as never
  }, custom)
  const page = await app.firstWindow()
  await recordAndAnalyze(page)

  await expect(page.getByTestId('model-download-dialog')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('model-download-advanced-toggle').click()
  await page.getByTestId('model-download-choose-folder').click()
  await expect(page.getByTestId('model-download-dir')).toHaveText(custom)
  await expect(page.getByTestId('model-download-moved')).toBeVisible()

  await page.getByTestId('model-download-start').click()
  await expect(page.getByTestId('model-download-dialog')).toBeHidden({ timeout: 30_000 })
  for (const id of ids) expect(existsSync(join(custom, id, 'rev1', 'model.bin'))).toBe(true)
  await app.close()

  // Next launch: the saved folder is used and the model is already there (no network needed).
  const again = await launch(userData, catalogFile)
  const p2 = await again.firstWindow()
  await p2.getByTestId('tab-settings').click()
  for (const id of ids)
    await expect(p2.getByTestId(`model-state-${id}`)).toContainText(/Ready|Sẵn sàng/)
  await again.close()
})

test('an unwritable folder is rejected with a clear error and not saved', async () => {
  const { userData, catalogFile } = setup()
  const app = await launch(userData, catalogFile)
  // A path under a regular file can never be created.
  await app.evaluate(
    ({ dialog }, bad) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [bad] })) as never
    },
    join(catalogFile, 'nope'),
  )
  const page = await app.firstWindow()
  await recordAndAnalyze(page)
  await expect(page.getByTestId('model-download-dialog')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('model-download-advanced-toggle').click()
  const before = await page.getByTestId('model-download-dir').innerText()
  await page.getByTestId('model-download-choose-folder').click()
  await expect(page.getByTestId('model-download-folder-error')).toBeVisible()
  await expect(page.getByTestId('model-download-dir')).toHaveText(before)
  await app.close()
})
