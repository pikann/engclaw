import { expect, test, type Page } from '@playwright/test'
import { FakeLlm } from './support/fake-llm'
import { openConverse, speakTurn, configureProvider } from './support/converse'
import { breakMic, fixMic, launchApp } from './support/launch'
import {
  callLog,
  fail,
  heard,
  SPEECH_RMS,
  stubSpeech,
  type SpeechScript,
} from './support/speech-stubs'
import type { AudioFixture } from './support/audio'
import type { EngclawApi } from '@engclaw/ipc-contract'

/**
 * The Converse voice loop with sound fixtures: what the (fake) microphone plays reaches the speech
 * engine, silence and noise are handled, and every failure of the ASR, the analysis, the provider
 * and the TTS ends in a clear state the user can recover from.
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

async function start(audio: AudioFixture = 'speech', script: SpeechScript = {}) {
  const { app, page, userData } = await launchApp({ audio })
  await stubSpeech(app, { transcribe: [heard(SAID)], ...script })
  await configureProvider(page, llm.baseUrl)
  await openConverse(page)
  return { app, page, userData }
}
const state = (page: Page) => page.locator('[role="status"][data-state]')

test.describe('what the microphone hears', () => {
  test('spoken audio reaches the ASR, the analysis and the provider, then the reply is spoken', async () => {
    const { app, page } = await start('speech', { tts: [{ reply: { ok: true, seconds: 2 } }] })
    await page.getByTestId('converse-mic').click()
    await expect(page.getByTestId('converse-stop')).toBeVisible()
    await expect(page.getByTestId('recorder-level')).toBeVisible()
    await page.waitForTimeout(2500)
    await page.getByTestId('converse-stop').click()

    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 20_000 })
    await expect(state(page)).toHaveAttribute('data-state', 'speaking')
    await expect(page.getByTestId('converse-interrupt')).toBeVisible()
    await expect(page.getByTestId('converse-mic')).toBeEnabled({ timeout: 20_000 })
    await expect(page.getByTestId('converse-interrupt')).toHaveCount(0)

    const log = await callLog(app)
    expect(log.transcribe).toHaveLength(1)
    expect(log.transcribe[0]!.seconds).toBeGreaterThan(2)
    expect(log.transcribe[0]!.rms).toBeGreaterThan(SPEECH_RMS)
    expect(log.transcribe[0]!.peak).toBeGreaterThan(0.05)
    // The analysis is given the very same take plus the transcript.
    expect(log.analyze).toHaveLength(1)
    expect(log.analyze[0]!.text).toBe(SAID)
    expect(log.analyze[0]!.seconds).toBeCloseTo(log.transcribe[0]!.seconds, 3)
    expect(llm.chats).toHaveLength(1)
    expect(log.tts).toEqual([{ text: REPLY }])
    await app.close()
  })

  test('silence is transcribed as nothing: "I didn\'t catch that", no provider call', async () => {
    const { app, page } = await start('silence', { transcribe: [heard('')] })
    await speakTurn(page, 1500)
    await expect(page.getByText("I didn't catch that. Try again.")).toBeVisible({ timeout: 20_000 })
    const log = await callLog(app)
    expect(log.transcribe[0]!.rms).toBeLessThan(SPEECH_RMS / 10)
    expect(log.analyze).toHaveLength(0)
    expect(llm.chats).toHaveLength(0)
    await expect(page.getByTestId('converse-mic')).toBeEnabled()
    await expect(page.getByTestId('converse-error')).toHaveCount(0)
    await expect(page.locator('[data-role]')).toHaveCount(0)
    await app.close()
  })

  test('speech far too quiet to count is passed on as quiet, and an empty transcript stops the turn', async () => {
    const { app, page } = await start('quiet', { transcribe: [heard('   ')] })
    await speakTurn(page, 1500)
    await expect(page.getByText("I didn't catch that. Try again.")).toBeVisible({ timeout: 20_000 })
    const [call] = (await callLog(app)).transcribe
    expect(call!.rms).toBeLessThan(SPEECH_RMS)
    expect(llm.chats).toHaveLength(0)
    await app.close()
  })

  test('steady noise is loud but not speech: the engine decides, nothing reaches the provider', async () => {
    const { app, page } = await start('tone', { transcribe: [heard('')] })
    await speakTurn(page, 1500)
    await expect(page.getByText("I didn't catch that. Try again.")).toBeVisible({ timeout: 20_000 })
    const [call] = (await callLog(app)).transcribe
    expect(call!.rms).toBeGreaterThan(0.1)
    expect(llm.chats).toHaveLength(0)
    await app.close()
  })

  test('a tap shorter than 0.4 s is ignored without calling the speech engine', async () => {
    const { app, page } = await start()
    await page.getByTestId('converse-mic').click()
    await page.getByTestId('converse-stop').click()
    await expect(page.getByText("I didn't catch that. Try again.")).toBeVisible({ timeout: 10_000 })
    const log = await callLog(app)
    expect(log.transcribe).toHaveLength(0)
    expect(llm.chats).toHaveLength(0)
    await app.close()
  })

  test('silence after speech ends the turn on its own', async () => {
    const { app, page } = await start('speechThenSilence')
    await page.getByTestId('converse-mic').click()
    await expect(page.getByTestId('converse-stop')).toBeVisible()
    // No stop click: ~2 s of silence after the sentence stops the recording and sends the turn.
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 30_000 })
    const [call] = (await callLog(app)).transcribe
    expect(call!.seconds).toBeGreaterThan(3)
    expect(call!.seconds).toBeLessThan(8)
    await app.close()
  })

  test('with auto-stop switched off the recording keeps going through silence', async () => {
    const { app, page } = await start('speechThenSilence')
    await page.evaluate(() =>
      (window as unknown as Win).engclaw.app.updateSettings({ silenceAutoStop: false }),
    )
    await page.getByTestId('converse-mic').click()
    await expect(page.getByTestId('converse-stop')).toBeVisible()
    await page.waitForTimeout(6000)
    await expect(page.getByTestId('converse-stop')).toBeVisible()
    expect((await callLog(app)).transcribe).toHaveLength(0)
    await page.getByTestId('converse-stop').click()
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 20_000 })
    await app.close()
  })
})

test.describe('speech engine failures', () => {
  test('ASR model missing: shows the models prompt, offers the download, sends nothing', async () => {
    const { app, page } = await start('speech', {
      transcribe: [{ reply: fail('MODEL_MISSING', 'asr missing', 'asr-en') }],
    })
    await speakTurn(page)
    await expect(page.getByTestId('converse-models')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('converse-error')).toContainText('Something went wrong')
    await page.getByTestId('converse-models-open').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(llm.chats).toHaveLength(0)
    await app.close()
  })

  for (const code of ['FAILED', 'PROCESS_CRASHED', 'INVALID_INPUT', 'CLIP_TOO_LONG'] as const) {
    test(`ASR ${code}: a generic error, nothing sent, ready to try again`, async () => {
      const { app, page } = await start('speech', {
        transcribe: [{ reply: fail(code) }, heard(SAID)],
      })
      await speakTurn(page)
      await expect(page.getByTestId('converse-error')).toContainText('Something went wrong', {
        timeout: 20_000,
      })
      await expect(page.getByTestId('converse-models')).toHaveCount(0)
      expect(llm.chats).toHaveLength(0)
      await expect(page.getByTestId('converse-mic')).toBeEnabled()

      await speakTurn(page)
      await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, {
        timeout: 20_000,
      })
      await expect(page.getByTestId('converse-error')).toHaveCount(0)
      await app.close()
    })
  }

  test('a slow ASR keeps the screen in "thinking" and the microphone off', async () => {
    const { app, page } = await start('speech', {
      transcribe: [{ ...heard(SAID), delayMs: 2500 }],
    })
    await speakTurn(page)
    await expect(state(page)).toHaveAttribute('data-state', 'thinking')
    await expect(page.getByTestId('converse-mic')).toBeDisabled()
    await expect(page.getByTestId('converse-cancel')).toBeVisible()
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 20_000 })
    await app.close()
  })

  test('Cancel while the ASR is still working stops the turn and tells the engine', async () => {
    const { app, page } = await start('speech', {
      transcribe: [{ ...heard(SAID), delayMs: 4000 }],
    })
    await speakTurn(page)
    await expect(state(page)).toHaveAttribute('data-state', 'thinking')
    await page.getByTestId('converse-cancel').click()
    await expect(page.getByTestId('converse-mic')).toBeEnabled()
    expect((await callLog(app)).cancel).toHaveLength(1)
    await page.waitForTimeout(4500)
    expect(llm.chats).toHaveLength(0)
    await app.close()
  })

  test('Cancel while listening discards the take: no ASR call', async () => {
    const { app, page } = await start()
    await page.getByTestId('converse-mic').click()
    await expect(page.getByTestId('converse-stop')).toBeVisible()
    await page.waitForTimeout(800)
    await page.getByTestId('converse-cancel').click()
    await expect(page.getByTestId('converse-mic')).toBeVisible()
    await expect(page.getByTestId('converse-mic')).toBeEnabled()
    await page.waitForTimeout(500)
    expect((await callLog(app)).transcribe).toHaveLength(0)
    expect(llm.chats).toHaveLength(0)
    await app.close()
  })
})

test.describe('speaking the reply', () => {
  test('TTS failing keeps the captions, shows a notice and returns to idle', async () => {
    const { app, page } = await start('speech', {
      tts: [{ reply: { ok: false, code: 'FAILED', message: 'boom' } }],
    })
    await speakTurn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 20_000 })
    await expect(page.getByText("The reply couldn't be spoken.", { exact: false })).toBeVisible()
    await expect(page.getByTestId('converse-mic')).toBeEnabled()
    await expect(page.getByTestId('converse-models')).toHaveCount(0)
    await app.close()
  })

  test('TTS model missing also offers the model download', async () => {
    const { app, page } = await start('speech', {
      tts: [{ reply: { ok: false, code: 'MODEL_MISSING', message: 'kokoro' } }],
    })
    await speakTurn(page)
    await expect(page.getByTestId('converse-models')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY)
    await expect(page.getByTestId('converse-mic')).toBeEnabled()
    await app.close()
  })

  test('Interrupt cuts the reply off, marks it, and starts listening', async () => {
    const { app, page } = await start('speech', { tts: [{ reply: { ok: true, seconds: 30 } }] })
    await speakTurn(page)
    await expect(page.getByTestId('converse-interrupt')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('converse-interrupt').click()
    await expect(page.getByText('Interrupted', { exact: false })).toBeVisible()
    await expect(page.getByTestId('converse-stop')).toBeVisible()
    await expect(page.getByTestId('converse-interrupt')).toHaveCount(0)
    await app.close()
  })

  test('pressing the microphone while the reply plays is a barge-in', async () => {
    llm.enqueue({ kind: 'reply', text: REPLY }, { kind: 'reply', text: 'Go on.' })
    const { app, page } = await start('speech', { tts: [{ reply: { ok: true, seconds: 30 } }] })
    await speakTurn(page)
    await expect(page.getByTestId('converse-interrupt')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('converse-mic').click()
    await expect(page.getByTestId('converse-stop')).toBeVisible()
    await expect(page.getByText('Interrupted', { exact: false })).toBeVisible()
    await page.waitForTimeout(2000)
    await page.getByTestId('converse-stop').click()
    await expect(page.getByTestId('converse-transcript')).toContainText('Go on.', {
      timeout: 20_000,
    })
    expect(llm.chats).toHaveLength(2)
    await app.close()
  })

  test('leaving the screen mid-reply stops cleanly; coming back starts from a clean slate', async () => {
    const { app, page } = await start('speech', { tts: [{ reply: { ok: true, seconds: 30 } }] })
    await speakTurn(page)
    await expect(page.getByTestId('converse-interrupt')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('nav-converse').click()
    await expect(page.getByTestId('converse-mic')).toBeEnabled()
    await expect(page.getByTestId('converse-interrupt')).toHaveCount(0)
    await expect(page.getByTestId('converse-error')).toHaveCount(0)
    await expect(page.getByTestId('converse-history').getByRole('button')).toHaveCount(1)
    await app.close()
  })

  test('leaving the screen while recording releases the microphone', async () => {
    const { app, page } = await start()
    await page.getByTestId('converse-mic').click()
    await expect(page.getByTestId('converse-stop')).toBeVisible()
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('nav-converse').click()
    await expect(page.getByTestId('converse-mic')).toBeEnabled()
    await page.getByTestId('converse-mic').click()
    await expect(page.getByTestId('converse-stop')).toBeVisible()
    await expect(page.getByTestId('converse-mic-error')).toHaveCount(0)
    expect((await callLog(app)).transcribe).toHaveLength(0)
    await app.close()
  })
})

test.describe('microphone problems', () => {
  for (const [name, text] of [
    ['NotAllowedError', /Microphone access|Allow microphone|System Settings|Settings/],
    ['NotFoundError', /No microphone was found/],
    ['NotReadableError', /Could not start recording/],
  ] as const) {
    test(`${name}: explains the problem, stays idle, and works again once fixed`, async () => {
      const { app, page } = await start()
      await breakMic(page, name)
      await page.getByTestId('converse-mic').click()
      await expect(page.getByTestId('converse-mic-error')).toContainText(text)
      await expect(page.getByTestId('converse-mic')).toBeVisible()
      await expect(page.getByTestId('converse-stop')).toHaveCount(0)
      expect((await callLog(app)).transcribe).toHaveLength(0)

      await fixMic(page)
      await speakTurn(page)
      await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, {
        timeout: 20_000,
      })
      await expect(page.getByTestId('converse-mic-error')).toHaveCount(0)
      await app.close()
    })
  }
})

test.describe('conversations', () => {
  test('past conversations can be reopened, and New starts an empty one', async () => {
    llm.enqueue({ kind: 'reply', text: REPLY }, { kind: 'reply', text: 'Second chat reply.' })
    const { app, page } = await start()
    await speakTurn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 20_000 })
    await expect(page.getByTestId('converse-mic')).toBeEnabled({ timeout: 20_000 })

    await page.getByTestId('converse-new').click()
    await expect(page.getByText('Press the microphone and say hello to start.')).toBeVisible()
    await speakTurn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText('Second chat reply.', {
      timeout: 20_000,
    })
    // The new conversation did not inherit the first one's history.
    expect(llm.chats[1]!.body!.messages.filter((m) => m.role !== 'system')).toHaveLength(1)
    await expect(page.getByTestId('converse-history').getByRole('button')).toHaveCount(2)

    await page.getByTestId('converse-history').getByRole('button').last().click()
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY)
    await expect(page.getByTestId('converse-transcript')).not.toContainText('Second chat reply.')
    await app.close()
  })

  test('continuing an opened conversation sends its earlier messages', async () => {
    llm.enqueue({ kind: 'reply', text: REPLY }, { kind: 'reply', text: 'Welcome back.' })
    const { app, page } = await start()
    await speakTurn(page)
    await expect(page.getByTestId('converse-mic')).toBeEnabled({ timeout: 20_000 })
    await page.getByTestId('converse-new').click()
    await page.getByTestId('converse-history').getByRole('button').first().click()
    await speakTurn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText('Welcome back.', {
      timeout: 20_000,
    })
    expect(llm.chats[1]!.body!.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    await app.close()
  })

  test('the conversation and its captions survive a restart', async () => {
    const { app, page, userData } = await start()
    await speakTurn(page)
    await expect(page.getByTestId('converse-transcript')).toContainText(REPLY, { timeout: 20_000 })
    await app.close()

    const again = await launchApp({ userData })
    await again.page.getByTestId('nav-converse').click()
    await again.page.getByTestId('converse-history').getByRole('button').first().click()
    await expect(again.page.getByTestId('converse-transcript')).toContainText(SAID)
    await expect(again.page.getByTestId('converse-transcript')).toContainText(REPLY)
    await again.app.close()
  })
})
