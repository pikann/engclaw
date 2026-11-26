import { describe, expect, it, vi } from 'vitest'
import { AutoStop, type VadClient } from './auto-stop'

const RATE = 48000
/** 128-sample worklet frames of a constant level, `seconds` long. */
const frames = (seconds: number, level: number) =>
  Array.from({ length: Math.round((seconds * RATE) / 128) }, () =>
    new Float32Array(128).fill(level),
  )
/** A VAD that calls a 512-sample frame speech when it is louder than `above`. */
const fakeVad = (above = 0.05) => {
  const calls: { samples: number; state?: Float32Array }[] = []
  const client: VadClient = vi.fn(async ({ frames: audio, state }) => {
    calls.push({ samples: audio.length, state })
    const probs = Array.from({ length: audio.length / 512 }, (_, i) =>
      Math.abs(audio[i * 512 + 256]!) > above ? 0.9 : 0.01,
    )
    return { ok: true as const, value: { probs, state: new Float32Array(320).fill(calls.length) } }
  })
  return { client, calls }
}
const tick = () => new Promise((r) => setTimeout(r, 0))
/** Plays frames as a microphone would, letting replies arrive between them. */
async function play(stop: AutoStop, chunks: Float32Array[]): Promise<void> {
  for (const [i, c] of chunks.entries()) {
    stop.push(c)
    if (i % 8 === 0) await tick()
  }
  await tick()
}

describe('AutoStop with the speech model', () => {
  it('stops once, 2 s after speech ends, however loud the room is', async () => {
    const onStop = vi.fn()
    // The room (0.03) is above the old loudness threshold, so only the model hears the silence.
    const { client } = fakeVad()
    const stop = new AutoStop({ sampleRate: RATE, vad: client, onStop })
    await play(stop, frames(1, 0.3))
    await play(stop, frames(1.8, 0.03))
    expect(onStop).not.toHaveBeenCalled()
    await play(stop, frames(1, 0.03))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('sends whole 16 kHz frames and carries the model state between requests', async () => {
    const { client, calls } = fakeVad()
    const stop = new AutoStop({ sampleRate: RATE, vad: client, onStop: vi.fn() })
    await play(stop, frames(1, 0.3))
    expect(calls.length).toBeGreaterThan(3)
    for (const c of calls) expect(c.samples % 512).toBe(0)
    const sent = calls.reduce((n, c) => n + c.samples, 0)
    expect(sent).toBeGreaterThan(16000 - 4 * 512)
    expect(sent).toBeLessThanOrEqual(16000)
    expect(calls[0]!.state).toBeUndefined()
    expect(calls[2]!.state![0]).toBe(2)
  })

  it('handles a 44.1 kHz microphone', async () => {
    const { client, calls } = fakeVad()
    const stop = new AutoStop({ sampleRate: 44100, vad: client, onStop: vi.fn() })
    await play(
      stop,
      Array.from({ length: 345 }, () => new Float32Array(128).fill(0.3)),
    ) // ≈ 1 s
    const sent = calls.reduce((n, c) => n + c.samples, 0)
    expect(Math.abs(sent - 16000)).toBeLessThan(4 * 512)
  })

  it('has one request in flight at a time and sends what piled up with the next', async () => {
    let release = () => {}
    const client = vi.fn<VadClient>(
      ({ frames: audio }) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              value: {
                probs: Array<number>(audio.length / 512).fill(0.01),
                state: new Float32Array(320),
              },
            })
        }),
    )
    const stop = new AutoStop({ sampleRate: RATE, vad: client, onStop: vi.fn() })
    await play(stop, frames(1, 0.3))
    expect(client).toHaveBeenCalledTimes(1)
    release()
    await tick()
    expect(client).toHaveBeenCalledTimes(2)
    expect(client.mock.calls[1]![0].frames.length).toBeGreaterThan(20 * 512)
  })

  it('does nothing after it is closed', async () => {
    const onStop = vi.fn()
    const { client, calls } = fakeVad()
    const stop = new AutoStop({ sampleRate: RATE, vad: client, onStop })
    await play(stop, frames(1, 0.3))
    stop.close()
    const before = calls.length
    await play(stop, frames(4, 0.001))
    expect(calls).toHaveLength(before)
    expect(onStop).not.toHaveBeenCalled()
  })
})

describe('AutoStop without the speech model', () => {
  const failing: [string, VadClient][] = [
    ['reports a failure', async () => ({ ok: false, code: 'FAILED', message: 'no model' })],
    ['throws', async () => Promise.reject(new Error('no bridge'))],
    ['never answers', () => new Promise(() => {})],
  ]
  it.each(failing)('falls back to the loudness detector when it %s', async (_name, vad) => {
    const onStop = vi.fn()
    const stop = new AutoStop({ sampleRate: RATE, vad, onStop })
    await play(stop, frames(1, 0.3))
    await play(stop, frames(1.8, 0.001))
    expect(onStop).not.toHaveBeenCalled()
    await play(stop, frames(1.5, 0.001))
    // A silent model is given up on after a few seconds of unanswered audio.
    await play(stop, frames(3, 0.001))
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})
