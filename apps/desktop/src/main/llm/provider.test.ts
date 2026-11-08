import { describe, expect, it, vi } from 'vitest'
import { endpoint, parseBaseUrl, requestHeaders, testConnection, type FetchLike } from './provider'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const cfg = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-secret', headers: [] }

describe('parseBaseUrl', () => {
  it('accepts https and loopback http', () => {
    for (const u of [
      'https://api.openai.com/v1',
      'http://localhost:11434/v1',
      'http://127.0.0.1:1234/v1',
      'http://[::1]:8080/v1',
    ])
      expect(parseBaseUrl(u).ok).toBe(true)
  })

  it('refuses plain http to remote hosts', () => {
    expect(parseBaseUrl('http://api.example.com/v1')).toEqual({ ok: false, code: 'INSECURE_URL' })
    expect(parseBaseUrl('http://localhost.evil.com/v1')).toEqual({
      ok: false,
      code: 'INSECURE_URL',
    })
  })

  it('refuses other schemes, credentials in the URL, and junk', () => {
    for (const u of [
      'file:///etc/passwd',
      'ftp://x/y',
      'https://user:pw@x.com/v1',
      'nope',
      '',
      'https://x.com/v1?key=1',
    ])
      expect(parseBaseUrl(u)).toEqual({ ok: false, code: 'INVALID_URL' })
  })
})

describe('request building', () => {
  it('joins paths without doubling slashes', () => {
    expect(endpoint(new URL('https://x.com/v1/'), '/models')).toBe('https://x.com/v1/models')
    expect(endpoint(new URL('http://localhost:11434'), '/models')).toBe(
      'http://localhost:11434/models',
    )
  })

  it('sends the key as a bearer token and applies extra headers', () => {
    expect(
      requestHeaders({ apiKey: 'k', headers: [{ name: 'HTTP-Referer', value: 'x' }] }),
    ).toMatchObject({
      Authorization: 'Bearer k',
      'HTTP-Referer': 'x',
    })
    expect(requestHeaders({ apiKey: '', headers: [] })).not.toHaveProperty('Authorization')
  })
})

describe('testConnection', () => {
  it('lists models and reports whether the chosen one exists', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(json({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] })),
    )
    expect(await testConnection({ ...cfg, model: 'a' }, fetchFn)).toEqual({
      ok: true,
      models: ['a', 'b'],
      modelFound: true,
    })
    expect(await testConnection({ ...cfg, model: 'zzz' }, fetchFn)).toMatchObject({
      modelFound: false,
    })
    expect(await testConnection(cfg, fetchFn)).toMatchObject({ modelFound: null })
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/models')
    expect(init.redirect).toBe('error')
  })

  it('maps failures to codes without echoing server text', async () => {
    const cases: [Response, string][] = [
      [json({ error: 'bad key sk-secret' }, 401), 'UNAUTHORIZED'],
      [json({}, 403), 'UNAUTHORIZED'],
      [json({}, 404), 'NOT_FOUND'],
      [json({}, 500), 'SERVER'],
      [new Response('<html>', { status: 200 }), 'BAD_RESPONSE'],
      [json({ nope: true }), 'BAD_RESPONSE'],
    ]
    for (const [res, code] of cases) {
      const out = await testConnection(cfg, () => Promise.resolve(res))
      expect(out).toMatchObject({ ok: false, code })
      expect(JSON.stringify(out)).not.toContain('sk-secret')
    }
  })

  it('distinguishes timeouts from network errors', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' })
    expect(await testConnection(cfg, () => Promise.reject(timeout))).toMatchObject({
      code: 'TIMEOUT',
    })
    expect(
      await testConnection(cfg, () => Promise.reject(new Error('ECONNREFUSED'))),
    ).toMatchObject({
      code: 'NETWORK',
    })
  })

  it('never calls out for an invalid or insecure URL', async () => {
    const fetchFn = vi.fn()
    expect(await testConnection({ ...cfg, baseUrl: 'http://example.com' }, fetchFn)).toMatchObject({
      code: 'INSECURE_URL',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
