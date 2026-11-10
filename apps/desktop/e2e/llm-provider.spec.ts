import { expect, test } from '@playwright/test'
import type { EngclawApi, LlmProviderTestRequest } from '@engclaw/ipc-contract'
import { FakeLlm } from './support/fake-llm'
import { launchApp } from './support/launch'

/**
 * The provider connection test and the save rules, against the fake provider's `GET /models`:
 * every outcome the settings screen can report, and what is refused before anything is sent.
 */
type Win = { engclaw: EngclawApi }

let llm: FakeLlm
test.beforeAll(async () => {
  llm = await FakeLlm.start()
})
test.afterAll(() => llm.stop())
test.beforeEach(() => llm.reset())

async function withApp<T>(
  run: (call: (req: LlmProviderTestRequest) => Promise<unknown>) => Promise<T>,
) {
  const { app, page } = await launchApp()
  try {
    return await run((req) =>
      page.evaluate((r) => (window as unknown as Win).engclaw.llm.test(r), req),
    )
  } finally {
    await app.close()
  }
}

test('lists the provider models and says whether the chosen one exists', async () => {
  await withApp(async (test) => {
    expect(await test({ baseUrl: llm.baseUrl, model: 'mock' })).toEqual({
      ok: true,
      models: ['mock', 'mock-large'],
      modelFound: true,
    })
    expect(await test({ baseUrl: llm.baseUrl, model: 'gpt-nope' })).toMatchObject({
      ok: true,
      modelFound: false,
    })
    expect(await test({ baseUrl: llm.baseUrl })).toMatchObject({ ok: true, modelFound: null })
  })
})

test('a provider with no models listed is still usable (model check skipped)', async () => {
  llm.models = []
  await withApp(async (test) => {
    expect(await test({ baseUrl: llm.baseUrl, model: 'mock' })).toEqual({
      ok: true,
      models: [],
      modelFound: null,
    })
  })
})

for (const [status, code] of [
  [401, 'UNAUTHORIZED'],
  [403, 'UNAUTHORIZED'],
  [404, 'NOT_FOUND'],
  [405, 'NOT_FOUND'],
  [500, 'SERVER'],
  [503, 'SERVER'],
] as const) {
  test(`HTTP ${status} is reported as ${code}`, async () => {
    llm.modelsStatus = status
    await withApp(async (test) => {
      expect(await test({ baseUrl: llm.baseUrl })).toEqual({ ok: false, code, status })
    })
  })
}

test('a server that is not running is a network error', async () => {
  const dead = await FakeLlm.start()
  const url = dead.baseUrl
  await dead.stop()
  await withApp(async (test) => {
    expect(await test({ baseUrl: url })).toEqual({ ok: false, code: 'NETWORK' })
  })
})

test('the API key and headers are sent with the test request', async () => {
  await withApp(async (test) => {
    const res = (await test({
      baseUrl: llm.baseUrl,
      apiKey: 'sk-test-xyz',
      headers: [{ name: 'X-Team', value: 'blue' }],
    })) as { ok: boolean }
    expect(res.ok).toBe(true)
    const req = llm.requests.at(-1)!
    expect(req.method).toBe('GET')
    expect(req.headers['authorization']).toBe('Bearer sk-test-xyz')
    expect(req.headers['x-team']).toBe('blue')
  })
})

test('a redirecting server is refused so the key never follows it to another host', async () => {
  const elsewhere = await FakeLlm.start()
  try {
    llm.modelsRedirectTo = `${elsewhere.baseUrl}/models`
    await withApp(async (test) => {
      const res = (await test({ baseUrl: llm.baseUrl, apiKey: 'sk-secret' })) as { ok: boolean }
      expect(res.ok).toBe(false)
    })
    expect(llm.requests).toHaveLength(1)
    expect(elsewhere.requests).toHaveLength(0)
  } finally {
    await elsewhere.stop()
  }
})

test.describe('addresses that are refused before anything is sent', () => {
  const refused: [string, string][] = [
    ['not a url', 'INVALID_URL'],
    ['ftp://127.0.0.1/v1', 'INVALID_URL'],
    ['http://user:pass@127.0.0.1:1234/v1', 'INVALID_URL'],
    ['http://127.0.0.1:1234/v1?key=abc', 'INVALID_URL'],
    ['http://example.com/v1', 'INSECURE_URL'],
    ['http://192.168.1.20:11434/v1', 'INSECURE_URL'],
  ]
  for (const [baseUrl, code] of refused) {
    test(`${baseUrl} -> ${code}`, async () => {
      await withApp(async (test) => {
        expect(await test({ baseUrl })).toEqual({ ok: false, code })
      })
      expect(llm.requests).toHaveLength(0)
    })
  }
})

test('save stores the provider, status never reveals the key, remove clears it', async () => {
  const { app, page } = await launchApp()
  const saved = await page.evaluate(
    (url) =>
      (window as unknown as Win).engclaw.llm.save({
        baseUrl: url,
        model: 'mock',
        apiKey: 'sk-hidden',
        headers: [{ name: 'X-Org', value: 'secret-value' }],
      }),
    llm.baseUrl,
  )
  test.skip(!saved.ok && saved.code === 'SECURE_STORAGE_UNAVAILABLE', 'no OS keychain here')
  expect(saved.ok).toBe(true)

  const status = await page.evaluate(() => (window as unknown as Win).engclaw.llm.status())
  expect(status).toMatchObject({
    kind: 'openai-compatible',
    model: 'mock',
    hasApiKey: true,
    headerNames: ['X-Org'],
  })
  expect(JSON.stringify(status)).not.toContain('sk-hidden')
  expect(JSON.stringify(status)).not.toContain('secret-value')

  const removed = await page.evaluate(() => (window as unknown as Win).engclaw.llm.remove())
  expect(removed).toMatchObject({ kind: 'none', hasApiKey: false, headerNames: [] })
  await app.close()
})

test('save refuses an insecure address and keeps the previous provider', async () => {
  const { app, page } = await launchApp()
  const result = await page.evaluate(async (url) => {
    const api = (window as unknown as Win).engclaw.llm
    await api.save({ baseUrl: url, model: 'mock' })
    const bad = await api.save({ baseUrl: 'http://example.com/v1', model: 'other' })
    return { bad, status: await api.status() }
  }, llm.baseUrl)
  expect(result.bad).toEqual({ ok: false, code: 'INSECURE_URL' })
  expect(result.status).toMatchObject({ kind: 'openai-compatible', model: 'mock' })
  await app.close()
})
