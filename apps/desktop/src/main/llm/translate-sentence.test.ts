import { describe, expect, it, vi } from 'vitest'
import type { SentenceTranslationRequest } from '@engclaw/ipc-contract'
import type { FetchLike, ProviderConfig } from './provider'
import { translateSentence } from './translate-sentence'

const config: ProviderConfig = {
  baseUrl: 'https://example.com/v1',
  model: 'test-model',
  apiKey: '',
  headers: [],
}
const subtitle: SentenceTranslationRequest = { text: 'Good morning.', source: 'en', target: 'vi' }

function completion(text: string): Response {
  return Response.json({
    id: 'translation',
    created: 0,
    model: config.model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  })
}

describe('subtitle translation', () => {
  it('returns the original subtitle when the languages match without calling the provider', async () => {
    const fetch = vi.fn<FetchLike>()
    await expect(translateSentence({ ...subtitle, target: 'en' }, config, fetch)).resolves.toEqual({
      ok: true,
      text: subtitle.text,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports missing provider setup without a network request', async () => {
    const fetch = vi.fn<FetchLike>()
    await expect(translateSentence(subtitle, null, fetch)).resolves.toEqual({
      ok: false,
      code: 'NO_PROVIDER',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'UNAUTHORIZED'],
    [429, 'RATE_LIMIT'],
  ])('maps HTTP %i to %s without retries', async (status, code) => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValue(Response.json({ error: { message: 'Provider error' } }, { status }))
    await expect(translateSentence(subtitle, config, fetch)).resolves.toEqual({ ok: false, code })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reports a deadline reached during the request', async () => {
    const deadline = new AbortController()
    const fetch: FetchLike = (_url, { signal }) =>
      new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
        deadline.abort(new DOMException('Deadline exceeded', 'TimeoutError'))
      })
    await expect(translateSentence(subtitle, config, fetch, deadline.signal)).resolves.toEqual({
      ok: false,
      code: 'TIMEOUT',
    })
  })

  it('requests another translation when Vietnamese output contains unexpected Han characters', async () => {
    const line = 'A bridesmaid or maid of honour may have responsibilities before the wedding.'
    const correct = 'Phù dâu hoặc phù dâu chính có thể có trách nhiệm trước lễ cưới.'
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(completion('Người hỗ trợ và em gái tổ chức có trách nhiệm 隱.'))
      .mockResolvedValueOnce(completion(correct))
    await expect(translateSentence({ ...subtitle, text: line }, config, fetch)).resolves.toEqual({
      ok: true,
      text: correct,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('revisits multiple untranslated source words without hardcoding vocabulary', async () => {
    const text = 'You can hear what the people closest to the bride and groom say.'
    const correct = 'Bạn được nghe những người thân thiết nhất với cô dâu và chú rể nói gì.'
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(completion('Bạn có thể nghe những người gần Bride và Groom.'))
      .mockResolvedValueOnce(completion(correct))
    await expect(translateSentence({ ...subtitle, text }, config, fetch)).resolves.toEqual({
      ok: true,
      text: correct,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    const revision = JSON.parse(String(fetch.mock.calls[1]?.[1].body))
    expect(revision.messages[0].content).toContain('untranslated source words')
    const animalCare = vi.fn<FetchLike>().mockResolvedValue(completion('Tôi chải lông cho chó.'))
    await expect(
      translateSentence({ ...subtitle, text: 'I groom my dog.' }, config, animalCare),
    ).resolves.toEqual({ ok: true, text: 'Tôi chải lông cho chó.' })
    expect(animalCare).toHaveBeenCalledTimes(1)
  })

  it('allows names and brands without re-requesting the translation', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValue(completion('Alice dùng Engclaw trên máy Mac.'))
    await expect(
      translateSentence({ ...subtitle, text: 'Alice uses Engclaw on a Mac.' }, config, fetch),
    ).resolves.toMatchObject({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a second response if the provider still mixes writing systems', async () => {
    const fetch = vi.fn<FetchLike>().mockImplementation(async () => completion('Chào 隱.'))
    await expect(translateSentence(subtitle, config, fetch)).resolves.toEqual({
      ok: false,
      code: 'FAILED',
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('trims a valid response and rejects output beyond the IPC limit', async () => {
    await expect(
      translateSentence(subtitle, config, async () => completion('  Chào buổi sáng.  ')),
    ).resolves.toEqual({ ok: true, text: 'Chào buổi sáng.' })
    await expect(
      translateSentence(subtitle, config, async () => completion('a'.repeat(5001))),
    ).resolves.toEqual({ ok: false, code: 'FAILED' })
  })
})
