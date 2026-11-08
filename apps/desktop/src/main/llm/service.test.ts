import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LlmConfigStore, type Cipher } from './config-store'
import type { FetchLike } from './provider'
import { LlmService } from './service'

const cipher = (available = true): Cipher => ({
  available: () => available,
  encrypt: (p) => Buffer.from(p, 'utf8').reverse(),
  decrypt: (b) => Buffer.from(b).reverse().toString('utf8'),
})
const ok: FetchLike = () => Promise.resolve(new Response(JSON.stringify({ data: [{ id: 'm' }] })))

function setup(available = true, fetchFn = vi.fn<FetchLike>(ok)) {
  const file = join(mkdtempSync(join(tmpdir(), 'llm-')), 'llm-provider.json')
  const store = new LlmConfigStore(file, cipher(available))
  return { file, store, service: new LlmService(store, fetchFn), fetchFn }
}
const draft = { baseUrl: 'https://api.example.com/v1/', model: 'm', apiKey: 'sk-secret' }

describe('LlmService', () => {
  it('saves, reports status without secrets, and persists across instances', () => {
    const { service, file } = setup()
    const res = service.save({ ...draft, headers: [{ name: 'X-Org', value: 'hidden-value' }] })
    expect(res).toMatchObject({
      ok: true,
      status: {
        kind: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        model: 'm',
        hasApiKey: true,
        headerNames: ['X-Org'],
      },
    })
    expect(JSON.stringify(res)).not.toMatch(/sk-secret|hidden-value/)
    const onDisk = readFileSync(file, 'utf8')
    expect(onDisk).not.toMatch(/sk-secret|hidden-value|api\.example\.com/)
    expect(new LlmConfigStore(file, cipher()).status().hasApiKey).toBe(true)
  })

  it('keeps the stored key when the key is omitted on the same origin', async () => {
    const { service, fetchFn } = setup()
    service.save(draft)
    await service.test({ baseUrl: 'https://api.example.com/v2' })
    const init = fetchFn.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-secret')
  })

  it('never sends the stored key or headers to a different origin', async () => {
    const { service, fetchFn } = setup()
    service.save({ ...draft, headers: [{ name: 'X-Org', value: 'v' }] })
    await service.test({ baseUrl: 'https://evil.example.org/v1' })
    const headers = (fetchFn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers).not.toHaveProperty('Authorization')
    expect(headers).not.toHaveProperty('X-Org')
    service.save({ baseUrl: 'https://evil.example.org/v1', model: 'm' })
    expect(service.status().hasApiKey).toBe(false)
  })

  it('refuses to store secrets when the OS cannot encrypt, but allows a keyless local server', () => {
    const { service } = setup(false)
    expect(service.save(draft)).toEqual({ ok: false, code: 'SECURE_STORAGE_UNAVAILABLE' })
    expect(service.status().kind).toBe('none')
    expect(service.save({ baseUrl: 'http://localhost:11434/v1', model: 'llama3' })).toMatchObject({
      ok: true,
      status: { hasApiKey: false, model: 'llama3' },
    })
  })

  it('rejects an insecure URL on save and removes everything on remove', () => {
    const { service, file } = setup()
    expect(service.save({ ...draft, baseUrl: 'http://example.com/v1' })).toEqual({
      ok: false,
      code: 'INSECURE_URL',
    })
    service.save(draft)
    expect(service.remove().kind).toBe('none')
    expect(() => readFileSync(file)).toThrow()
  })

  it('can switch to a local server and replaces the previous config', () => {
    const { service } = setup()
    service.save(draft)
    const res = service.save({ baseUrl: 'http://localhost:11434/v1', model: 'llama3', apiKey: '' })
    expect(res).toMatchObject({
      ok: true,
      status: {
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3',
        hasApiKey: false,
        headerNames: [],
      },
    })
  })
})
