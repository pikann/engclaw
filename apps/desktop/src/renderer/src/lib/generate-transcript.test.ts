import { describe, expect, it, vi } from 'vitest'
import { generateTranscript } from './generate-transcript'

function setup() {
  const audioRange = vi.fn(async () => ({
    ok: true,
    value: { bytes: new Uint8Array(4), offsetSec: 0 },
  }))
  const transcribe = vi.fn(async () => ({ ok: true, value: { text: '你好', language: 'zh' } }))
  const saveGeneratedTranscript = vi.fn(async () => null)
  const decode = vi.fn(async () => new Float32Array(16000))
  const progress = vi.fn()
  const deps = {
    api: { youtube: { audioRange, saveGeneratedTranscript }, inference: { transcribe } } as never,
    decode,
    videoId: '2mKgniIiHi4',
    duration: 45,
    language: 'zh' as const,
    current: () => true,
    progress,
    onRequest: vi.fn(),
  }
  return { deps, audioRange, transcribe, saveGeneratedTranscript, decode, progress }
}
describe('generated shadowing transcripts', () => {
  it('transcribes bounded windows in Mandarin, preserves timing and caches only a complete transcript', async () => {
    const s = setup()
    const cues = await generateTranscript(s.deps)
    expect(cues).toEqual([
      { start: 0, dur: 20, text: '你好' },
      { start: 20, dur: 20, text: '你好' },
      { start: 40, dur: 5, text: '你好' },
    ])
    expect(s.audioRange.mock.calls).toHaveLength(3)
    expect(s.transcribe).toHaveBeenCalledWith(expect.objectContaining({ language: 'zh' }))
    expect(s.progress.mock.calls).toEqual([[20], [40], [45]])
    expect(s.saveGeneratedTranscript).toHaveBeenCalledWith({
      videoId: '2mKgniIiHi4',
      language: 'zh',
      cues,
    })
  })
  it('does not decode, transcribe or persist a canceled lookup', async () => {
    const s = setup()
    let live = true
    s.audioRange.mockImplementation(async () => {
      live = false
      return { ok: true, value: { bytes: new Uint8Array(4), offsetSec: 0 } }
    })
    expect(await generateTranscript({ ...s.deps, current: () => live })).toBeNull()
    expect(s.decode).not.toHaveBeenCalled()
    expect(s.saveGeneratedTranscript).not.toHaveBeenCalled()
  })
  it('propagates missing-model errors without saving a partial transcript', async () => {
    const s = setup()
    s.transcribe.mockResolvedValue({
      ok: false,
      code: 'MODEL_MISSING',
      message: 'missing',
    } as never)
    await expect(generateTranscript(s.deps)).rejects.toMatchObject({ code: 'MODEL_MISSING' })
    expect(s.saveGeneratedTranscript).not.toHaveBeenCalled()
  })
})
