import { expect, test } from '@playwright/test'
import { FakeLlm, type Scenario } from './support/fake-llm'
import {
  agentEvents,
  openConverse,
  recordAgentEvents,
  speakTurn,
  configureProvider,
} from './support/converse'
import { launchApp } from './support/launch'
import { callLog, heard, stubSpeech, waitForCalls } from './support/speech-stubs'
import type { EngclawApi } from '@engclaw/ipc-contract'

/**
 * Converse against a fake OpenAI-compatible provider (support/fake-llm.ts), driven through the real
 * voice loop: fake mic -> (stubbed) ASR -> agent -> provider -> captions -> (stubbed) TTS. Covers every
 * way the provider can answer: replies, slow streams, HTTP errors, broken bodies, dropped
 * connections, tool calls, cancellation and conversation history.
 */
const SAID = 'Hello, I am a developer'
const REPLY = 'That sounds great. What did you build today?'
type Win = { engclaw: EngclawApi }

let llm: FakeLlm
test.beforeAll(async () => {
  llm = await FakeLlm.start()
})
test.afterAll(() => llm.stop())
test.beforeEach(() => llm.reset())

async function start(opts: { analyzeFails?: boolean } = {}) {
  const { app, page } = await launchApp()
  await stubSpeech(app, {
    transcribe: [heard(SAID)],
    ...(opts.analyzeFails
      ? { analyze: [{ reply: { ok: false, code: 'FAILED', message: 'x' } }] }
      : {}),
  })
  await configureProvider(page, llm.baseUrl)
  await openConverse(page)
  return { app, page }
}

const turn = (page: Parameters<typeof speakTurn>[0]) => speakTurn(page, 1200)

test.describe('a successful turn', () => {
  test('streams the reply into the captions, speaks it, and returns to idle', async () => {
    llm.enqueue({ kind: 'reply', text: REPLY, chunkDelayMs: 40 })
    const { app, page } = await start()
    await recordAgentEvents(page)
    await turn(page)

    const transcript = page.getByTestId('converse-transcript')
    await expect(transcript).toContainText(SAID, { timeout: 20_000 })
    await expect(transcript).toContainText(REPLY, { timeout: 20_000 })
    await expect(page.getByTestId('converse-error')).toHaveCount(0)
    await expect(page.locator('[data-role]')).toHaveCount(2)
    await expect(page.getByTestId('converse-mic')).toBeEnabled({ timeout: 20_000 })

    const events = await agentEvents(page)
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(1)
    expect(events.at(-1)).toMatchObject({ type: 'done', text: REPLY })

    const [req] = llm.chats
    expect(req!.body).toMatchObject({ model: 'mock', stream: true })
    expect(req!.body!.messages[0]!.role).toBe('system')
    expect(req!.body!.messages.at(-1)).toMatchObject({ role: 'user' })
    expect(FakeLlm.textOf(req!)).toContain(SAID)

    await waitForCalls(app, 'tts')
    expect((await callLog(app)).tts[0]).toEqual({ text: REPLY })
    await expect(page.getByTestId('converse-history').getByRole('button')).toHaveCount(1)
    await app.close()
  })

  test('the reply is kept verbatim: unicode, quotes and markdown characters', async () => {
    const odd = 'Xin chào! “Quotes”, <b>tags</b> & *stars* — ok? 你好 🙂'
    llm.enqueue({ kind: 'reply', text: odd, chunk: 3 })
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText(odd, { timeout: 20_000 })
    await expect(page.locator('[data-testid="converse-transcript"] b')).toHaveCount(0)
    await app.close()
  })

  test('only the first 1000 characters of a very long reply are spoken, all of it is captioned', async () => {
    const long = 'word '.repeat(400).trim()
    llm.enqueue({ kind: 'reply', text: long, chunk: 200 })
    const { app, page } = await start()
    await turn(page)
    await waitForCalls(app, 'tts')
    const [call] = (await callLog(app)).tts
    expect(call!.text.length).toBe(1000)
    await expect(page.getByTestId('converse-transcript')).toContainText(long.slice(-30))
    await app.close()
  })

  test('a second turn sends the whole history in order', async () => {
    llm.enqueue({ kind: 'reply', text: REPLY }, { kind: 'reply', text: 'Nice. Tell me more.' })
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-mic')).toBeEnabled({ timeout: 20_000 })
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY)
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText('Nice. Tell me more.', {
      timeout: 20_000,
    })

    const roles = llm.chats[1]!.body!.messages.map((m) => m.role)
    expect(roles).toEqual(['system', 'user', 'assistant', 'user'])
    expect(JSON.stringify(llm.chats[1]!.body!.messages[2]!.content)).toContain(REPLY)
    await expect(page.locator('[data-role]')).toHaveCount(4)
    await app.close()
  })

  test('only the latest 40 messages are sent to the provider', async () => {
    const { app, page } = await start()
    const id = await page.evaluate(async () => {
      const api = (window as unknown as Win).engclaw.agent
      let conversationId: string | undefined
      for (let i = 0; i < 25; i++) {
        const sent = await api.send({
          ...(conversationId ? { conversationId } : {}),
          text: `m${i}`,
        })
        if (!sent.ok) throw new Error(sent.code)
        conversationId = sent.conversationId
        for (let n = 0; n < 200; n++) {
          if ((await api.messages({ conversationId })).length === (i + 1) * 2) break
          await new Promise((r) => setTimeout(r, 25))
        }
      }
      return conversationId!
    })
    expect(id).toBeTruthy()
    const last = llm.chats.at(-1)!.body!.messages
    expect(last.filter((m) => m.role !== 'system')).toHaveLength(40)
    expect(FakeLlm.textOf(llm.chats.at(-1)!)).toContain('m24')
    expect(FakeLlm.textOf(llm.chats.at(-1)!)).not.toContain('m0\n')
    await app.close()
  })
})

test.describe('speech analysis context', () => {
  test('the analysis rides along with the latest turn only and never shows in the captions', async () => {
    llm.enqueue({ kind: 'reply', text: REPLY }, { kind: 'reply', text: 'Great.' })
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-mic')).toBeEnabled({ timeout: 20_000 })
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText('Great.', {
      timeout: 20_000,
    })

    const [first, second] = llm.chats.map((r) => r.body!.messages.filter((m) => m.role === 'user'))
    expect(JSON.stringify(first!.at(-1)!.content)).toContain('[speech analysis')
    expect(JSON.stringify(second!.at(-1)!.content)).toContain('[speech analysis')
    expect(JSON.stringify(second![0]!.content)).not.toContain('[speech analysis')
    await expect(page.getByTestId('converse-transcript')).not.toContainText('speech analysis')
    await app.close()
  })

  test('when the analysis fails the turn still goes out as plain text', async () => {
    llm.enqueue({ kind: 'reply', text: REPLY })
    const { app, page } = await start({ analyzeFails: true })
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 20_000 })
    expect(FakeLlm.userText(llm.chats[0]!)).not.toContain('[speech analysis')
    expect(FakeLlm.userText(llm.chats[0]!)).toContain(SAID)
    await expect(page.getByTestId('converse-error')).toHaveCount(0)
    await app.close()
  })
})

test.describe('provider errors', () => {
  const cases: { name: string; scenario: Scenario; text: RegExp; detail?: string }[] = [
    {
      name: '401',
      scenario: { kind: 'status', status: 401, message: 'Bad key sk-1' },
      text: /rejected your sign-in/,
      detail: 'Bad key sk-1',
    },
    {
      name: '403',
      scenario: { kind: 'status', status: 403, message: 'Forbidden' },
      text: /rejected your sign-in/,
      detail: 'Forbidden',
    },
    {
      name: '429',
      scenario: { kind: 'status', status: 429, message: 'Slow down' },
      text: /rate limiting/,
      detail: 'Slow down',
    },
    {
      name: '500',
      scenario: { kind: 'status', status: 500, message: 'Upstream exploded' },
      text: /had a problem/,
      detail: 'Upstream exploded',
    },
    {
      name: '503',
      scenario: { kind: 'status', status: 503, body: 'Service Unavailable' },
      text: /had a problem/,
      detail: 'Service Unavailable',
    },
    {
      name: '400',
      scenario: { kind: 'status', status: 400, message: 'Unknown model' },
      text: /unreadable answer/,
      detail: 'Unknown model',
    },
    {
      name: '404',
      scenario: { kind: 'status', status: 404, message: 'No such route' },
      text: /unreadable answer/,
    },
    { name: 'a stream of garbage', scenario: { kind: 'garbage' }, text: /unreadable answer/ },
    { name: 'an HTML page', scenario: { kind: 'html' }, text: /unreadable answer/ },
    { name: 'a stream with no text', scenario: { kind: 'empty' }, text: /unreadable answer/ },
    { name: 'a redirect', scenario: { kind: 'redirect' }, text: /Couldn.t reach the provider/ },
    {
      name: 'a dropped connection',
      scenario: { kind: 'truncated', text: 'Well, I' },
      text: /Couldn.t reach the provider|unreadable answer/,
    },
  ]

  for (const c of cases) {
    test(`${c.name}: shows a clear error, keeps what the user said, drops the partial reply, and recovers`, async () => {
      llm.enqueue(c.scenario, { kind: 'reply', text: REPLY })
      const { app, page } = await start()
      await turn(page)

      const error = page.getByTestId('converse-error')
      await expect(error).toBeVisible({ timeout: 20_000 })
      await expect(error).toContainText(c.text)
      if (c.detail) await expect(page.getByTestId('converse-error-detail')).toHaveText(c.detail)
      await expect(page.getByTestId('converse-transcript')).toContainText(SAID)
      await expect(page.locator('[data-role]')).toHaveCount(1)
      await expect(page.getByTestId('converse-mic')).toBeEnabled()
      await expect(page.getByTestId('converse-stop')).toHaveCount(0)
      expect((await callLog(app)).tts).toHaveLength(0)

      await turn(page)
      await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, {
        timeout: 20_000,
      })
      await expect(page.getByTestId('converse-error')).toHaveCount(0)
      await app.close()
    })
  }

  test('a provider that is not running reads as a network problem', async () => {
    const { app, page } = await start()
    const dead = await FakeLlm.start()
    const url = dead.baseUrl
    await dead.stop()
    await configureProvider(page, url)
    await turn(page)
    await expect(page.getByTestId('converse-error')).toContainText(/Couldn.t reach the provider/, {
      timeout: 20_000,
    })
    await app.close()
  })

  test('an error reply is not saved as an assistant message', async () => {
    llm.enqueue({ kind: 'status', status: 500 })
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-error')).toBeVisible({ timeout: 20_000 })
    const stored = await page.evaluate(async () => {
      const api = (window as unknown as Win).engclaw.agent
      const [c] = await api.list()
      return (await api.messages({ conversationId: c!.id })).map((m) => m.role)
    })
    expect(stored).toEqual(['user'])
    await app.close()
  })
})

test.describe('tools', () => {
  test('lookup_dictionary: the result goes back to the model and the final answer is shown', async () => {
    llm.enqueue(
      { kind: 'tools', calls: [{ name: 'lookup_dictionary', args: { word: 'developer' } }] },
      { kind: 'reply', text: 'A developer builds software. Do you?' },
    )
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText(
      'A developer builds software',
      {
        timeout: 20_000,
      },
    )
    expect(llm.chats).toHaveLength(2)
    expect(llm.chats[0]!.body!.tools!.map((t) => t.function.name)).toEqual(
      expect.arrayContaining(['lookup_dictionary', 'get_practice_history', 'show_card']),
    )
    const tool = llm.chats[1]!.body!.messages.find((m) => m.role === 'tool')
    expect(tool).toBeTruthy()
    expect(JSON.stringify(tool!.content)).toContain('developer')
    await app.close()
  })

  test('get_practice_history answers even with no history', async () => {
    llm.enqueue(
      { kind: 'tools', calls: [{ name: 'get_practice_history', args: {} }] },
      { kind: 'reply', text: 'You have not practised yet.' },
    )
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText('not practised yet', {
      timeout: 20_000,
    })
    expect(llm.chats[1]!.body!.messages.some((m) => m.role === 'tool')).toBe(true)
    await app.close()
  })

  test('show_card puts a card next to the reply, in the live view and after reopening', async () => {
    llm.enqueue(
      {
        kind: 'tools',
        calls: [
          {
            name: 'show_card',
            args: {
              type: 'vocabulary',
              word: 'ship',
              meaning: 'to release software',
              example: 'We ship on Friday.',
            },
          },
        ],
      },
      { kind: 'reply', text: 'Let us ship it.' },
    )
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText('Let us ship it.', {
      timeout: 20_000,
    })
    await expect(page.getByText('to release software')).toBeVisible()
    await page.getByTestId('converse-new').click()
    await expect(page.getByText('to release software')).toHaveCount(0)
    await page.getByTestId('converse-history').getByRole('button').first().click()
    await expect(page.getByText('to release software')).toBeVisible()
    await app.close()
  })

  test('a tool call with invalid arguments does not break the turn', async () => {
    llm.enqueue(
      { kind: 'tools', calls: [{ name: 'lookup_dictionary', args: { nope: 1 } }] },
      { kind: 'reply', text: 'Sorry, let me explain it myself.' },
    )
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText(
      'let me explain it myself',
      {
        timeout: 20_000,
      },
    )
    await expect(page.getByTestId('converse-error')).toHaveCount(0)
    await app.close()
  })

  test('an unknown tool does not break the turn', async () => {
    llm.enqueue(
      { kind: 'tools', calls: [{ name: 'delete_everything', args: {} }] },
      { kind: 'reply', text: 'I cannot do that, but I can chat.' },
    )
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText('I can chat', {
      timeout: 20_000,
    })
    await app.close()
  })

  test('a model that never stops calling tools ends with a clear error', async () => {
    llm.fallback = { kind: 'tools', calls: [{ name: 'get_practice_history', args: {} }] }
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-error')).toContainText(/got stuck/, { timeout: 30_000 })
    expect(llm.chats.length).toBeLessThanOrEqual(5)
    await app.close()
  })
})

test.describe('cancel and concurrency', () => {
  test('Cancel during a stalled reply stops the request, drops the partial text and allows a new turn', async () => {
    llm.enqueue({ kind: 'hang', text: 'Let me th' }, { kind: 'reply', text: REPLY })
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText('Let me th', {
      timeout: 20_000,
    })
    await page.getByTestId('converse-cancel').click()

    await expect(page.getByTestId('converse-mic')).toBeEnabled()
    await expect(page.getByTestId('converse-transcript')).not.toContainText('Let me th')
    await expect(page.getByTestId('converse-error')).toHaveCount(0)
    await expect.poll(() => llm.aborted).toBe(1)

    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 20_000 })
    await app.close()
  })

  test('Cancel before any text arrives', async () => {
    llm.enqueue({ kind: 'reply', text: REPLY, startDelayMs: 5000 })
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-cancel')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('converse-cancel').click()
    await expect(page.getByTestId('converse-mic')).toBeEnabled()
    await expect(page.locator('[data-role]')).toHaveCount(1)
    await expect(page.getByTestId('converse-error')).toHaveCount(0)
    await app.close()
  })

  test('the microphone is disabled while the reply is being generated', async () => {
    llm.enqueue({ kind: 'reply', text: REPLY, startDelayMs: 1500 })
    const { app, page } = await start()
    await turn(page)
    await expect(page.getByTestId('converse-mic')).toBeDisabled()
    await expect(page.getByTestId('converse-new')).toBeDisabled()
    await expect(page.getByTestId('converse-mic')).toBeEnabled({ timeout: 20_000 })
    await app.close()
  })

  test('a second message while one is running is refused as BUSY', async () => {
    llm.enqueue({ kind: 'hang', text: 'Hmm' })
    const { app, page } = await start()
    const results = await page.evaluate(async () => {
      const api = (window as unknown as Win).engclaw.agent
      const a = await api.send({ text: 'first' })
      const b = await api.send({ text: 'second' })
      if (a.ok) await api.cancel({ requestId: a.requestId })
      return { a, b }
    })
    expect(results.a.ok).toBe(true)
    expect(results.b).toEqual({ ok: false, code: 'BUSY' })
    await app.close()
  })

  test('an unknown conversation id is refused as NOT_FOUND', async () => {
    const { app, page } = await start()
    const res = await page.evaluate(() =>
      (window as unknown as Win).engclaw.agent.send({ conversationId: 'nope', text: 'hi' }),
    )
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND' })
    await app.close()
  })
})

test.describe('provider setup', () => {
  test('without a provider a turn cannot start and nothing is sent', async () => {
    const { app, page } = await launchApp()
    await stubSpeech(app)
    await page.getByTestId('nav-converse').click()
    await expect(page.getByTestId('converse-setup')).toBeVisible()
    await expect(page.getByTestId('converse-mic')).toBeDisabled()
    const res = await page.evaluate(() =>
      (window as unknown as Win).engclaw.agent.send({ text: 'hi' }),
    )
    expect(res).toEqual({ ok: false, code: 'NO_PROVIDER' })
    expect(llm.requests).toHaveLength(0)
    await app.close()
  })

  test('removing the provider returns the screen to the setup prompt', async () => {
    const { app, page } = await start()
    await page.evaluate(() => (window as unknown as Win).engclaw.llm.remove())
    await page
      .getByTestId('nav-home')
      .click()
      .catch(() => undefined)
    await page.getByTestId('nav-converse').click()
    await expect(page.getByTestId('converse-setup')).toBeVisible()
    await app.close()
  })

  test('the API key and custom headers reach the provider', async () => {
    const { app, page } = await start()
    const saved = await configureProvider(page, llm.baseUrl, {
      apiKey: 'sk-e2e-123',
      headers: [{ name: 'X-Org', value: 'engclaw' }],
    })
    test.skip(!saved.ok && saved.code === 'SECURE_STORAGE_UNAVAILABLE', 'no OS keychain here')
    expect(saved.ok).toBe(true)
    await openConverse(page)
    await turn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 20_000 })
    const h = llm.chats[0]!.headers
    expect(h['authorization']).toBe('Bearer sk-e2e-123')
    expect(h['x-org']).toBe('engclaw')
    await app.close()
  })
})
