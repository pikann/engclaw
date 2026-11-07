import Database from 'better-sqlite3'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrate } from './store/migrations'
import { WordImageStore } from './store/word-images'
import {
  commonsFileName,
  isAllowedWikimediaUrl,
  isConcreteCandidate,
  isFreeLicense,
  stripHtml,
  WordImageService,
} from './word-image'

const THUMB =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Golden_Gate.jpg/320px-Golden_Gate.jpg'
const PNG = new Uint8Array([1, 2, 3, 4])

const summary = (over: object = {}) => ({
  type: 'standard',
  title: 'Bridge',
  description: 'Structure built to span a physical obstacle',
  thumbnail: { source: THUMB },
  ...over,
})
const commons = (over: object = {}) => ({
  query: {
    pages: [
      {
        imageinfo: [
          {
            extmetadata: {
              Artist: { value: '<a href="x">Jane &amp; Co</a>' },
              LicenseShortName: { value: 'CC BY-SA 4.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
              ...over,
            },
          },
        ],
      },
    ],
  },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const img = (mime = 'image/jpeg') =>
  new Response(PNG, { status: 200, headers: { 'content-type': mime } })

let dir: string
let db: Database.Database
let store: WordImageStore
let enabled: boolean

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wordimg-'))
  db = new Database(':memory:')
  migrate(db)
  store = new WordImageStore(db, join(dir, 'imgs'), 1024)
  enabled = true
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function service(handler: (url: string) => Response | Promise<Response>) {
  const fetch = vi.fn((url: string | URL | Request) => Promise.resolve(handler(String(url))))
  const svc = new WordImageService({
    store,
    fetch: fetch as unknown as typeof globalThis.fetch,
    enabled: () => enabled,
    userAgent: 'Engclaw/test',
    minIntervalMs: 0,
  })
  return { svc, fetch }
}

const happy = (url: string): Response => {
  if (url.includes('/page/summary/')) return json(summary())
  if (url.includes('commons.wikimedia.org')) return json(commons())
  return img()
}

describe('word images', () => {
  it('returns an image with license and attribution for a concrete noun', async () => {
    const { svc } = service(happy)
    const res = await svc.get('bridge', true)
    expect(res).toMatchObject({
      author: 'Jane & Co',
      license: 'CC BY-SA 4.0',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:Golden_Gate.jpg',
    })
    expect(res?.src).toBe(`data:image/jpeg;base64,${Buffer.from(PNG).toString('base64')}`)
  })

  it('serves the second view from the cache without any network', async () => {
    const first = service(happy)
    await first.svc.get('bridge', true)
    const second = service(() => Promise.reject(new Error('offline')))
    expect(await second.svc.get('Bridge', true)).not.toBeNull()
    expect(second.fetch).not.toHaveBeenCalled()
  })

  it('shows nothing for abstract words without calling Wikimedia', async () => {
    const { svc, fetch } = service(happy)
    expect(await svc.get('happiness', true)).toBeNull()
    expect(await svc.get('quickly', false)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['a disambiguation page', summary({ type: 'disambiguation' })],
    ['a different title', summary({ title: 'Bridges' })],
    ['an abstract description', summary({ description: 'Philosophical concept' })],
    ['no thumbnail', summary({ thumbnail: undefined })],
    [
      'a non-Commons (fair use) file',
      summary({ thumbnail: { source: THUMB.replace('/commons/', '/en/') } }),
    ],
  ])('shows nothing for %s, and remembers it', async (_name, body) => {
    const { svc, fetch } = service(() => json(body))
    expect(await svc.get('bridge', true)).toBeNull()
    const calls = fetch.mock.calls.length
    expect(await svc.get('bridge', true)).toBeNull()
    expect(fetch.mock.calls.length).toBe(calls)
  })

  it('rejects non-free licenses', async () => {
    const { svc } = service((u) =>
      u.includes('/page/summary/')
        ? json(summary())
        : u.includes('commons.wikimedia.org')
          ? json(commons({ LicenseShortName: { value: 'CC BY-NC 4.0' } }))
          : img(),
    )
    expect(await svc.get('bridge', true)).toBeNull()
  })

  it('treats a missing page as no image, but a failure as retryable', async () => {
    expect(
      await service(() => new Response('', { status: 404 })).svc.get('castle', true),
    ).toBeNull()
    expect(store.get('castle')).toEqual({ kind: 'none' })

    const failing = service(() => new Response('', { status: 503 }))
    expect(await failing.svc.get('bridge', true)).toBeNull()
    expect(store.get('bridge')).toBeNull()
    expect(await service(happy).svc.get('bridge', true)).not.toBeNull()
  })

  it('does not touch the network when the setting is off', async () => {
    enabled = false
    const { svc, fetch } = service(happy)
    expect(await svc.get('bridge', true)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never throws on network errors or non-image bodies', async () => {
    const down = service(() => Promise.reject(new Error('offline')) as never)
    expect(await down.svc.get('bridge', true)).toBeNull()
    const html = service((u) =>
      happy(u).headers.get('content-type') === 'application/json' ? happy(u) : img('text/html'),
    )
    expect(await html.svc.get('bridge', true)).toBeNull()
  })

  it('only talks to https Wikimedia hosts and identifies itself', async () => {
    const { svc, fetch } = service(happy)
    await svc.get('bridge', true)
    for (const [url, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(isAllowedWikimediaUrl(url)).toBe(true)
      expect((init.headers as Record<string, string>)['User-Agent']).toBe('Engclaw/test')
    }
  })

  it('spaces requests out', async () => {
    const sleeps: number[] = []
    let t = 1000
    const svc = new WordImageService({
      store,
      fetch: ((u: string) => Promise.resolve(happy(String(u)))) as unknown as typeof fetch,
      enabled: () => true,
      userAgent: 'x',
      minIntervalMs: 300,
      now: () => t,
      sleep: (ms) => {
        sleeps.push(ms)
        t += ms
        return Promise.resolve()
      },
    })
    await svc.get('bridge', true)
    expect(sleeps.length).toBe(2)
    expect(sleeps.every((ms) => ms === 300)).toBe(true)
  })
})

describe('word image store', () => {
  it('evicts least recently used files past the size cap', () => {
    let t = 1
    const s = new WordImageStore(db, join(dir, 'lru'), 10, () => t++)
    const credit = { author: 'a', license: 'CC0', licenseUrl: null, pageUrl: 'p' }
    s.putFound('one', new Uint8Array(6), 'image/png', credit)
    s.putFound('two', new Uint8Array(6), 'image/png', credit)
    expect(s.get('one')).toBeNull()
    expect(s.get('two')).not.toBeNull()
    expect(readdirSync(join(dir, 'lru'))).toHaveLength(1)
  })

  it('clear removes rows and files', () => {
    store.putFound('x', new Uint8Array(2), 'image/png', {
      author: '',
      license: '',
      licenseUrl: null,
      pageUrl: '',
    })
    store.clear()
    expect(store.get('x')).toBeNull()
    expect(() => readdirSync(join(dir, 'imgs'))).toThrow()
  })

  it('expires cached "no image" after 30 days', () => {
    let t = 0
    const s = new WordImageStore(db, join(dir, 'ttl'), 100, () => t)
    s.putNone('abc')
    expect(s.get('abc')).toEqual({ kind: 'none' })
    t = 31 * 86_400_000
    expect(s.get('abc')).toBeNull()
  })
})

describe('helpers', () => {
  it('parses Commons file names', () => {
    expect(commonsFileName(THUMB)).toBe('Golden_Gate.jpg')
    expect(
      commonsFileName('https://upload.wikimedia.org/wikipedia/commons/a/ab/Golden_Gate.jpg'),
    ).toBe('Golden_Gate.jpg')
    expect(
      commonsFileName(
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Golden_Gate.jpg/320px-Golden_Gate.jpg?utm_source=en.wikipedia.org',
      ),
    ).toBe('Golden_Gate.jpg')
    expect(commonsFileName(THUMB.replace('/commons/', '/en/'))).toBeNull()
    expect(commonsFileName('https://evil.example/wikipedia/commons/a/ab/x.jpg')).toBeNull()
  })

  it('allows only https wikimedia hosts', () => {
    expect(isAllowedWikimediaUrl('https://en.wikipedia.org/api/rest_v1/page/summary/x')).toBe(true)
    expect(isAllowedWikimediaUrl('http://en.wikipedia.org/x')).toBe(false)
    expect(isAllowedWikimediaUrl('https://en.wikipedia.org.evil.com/x')).toBe(false)
    expect(isAllowedWikimediaUrl('https://user@en.wikipedia.org/x')).toBe(false)
  })

  it('classifies licenses, candidates and html', () => {
    expect(['CC BY 4.0', 'CC BY-SA 3.0', 'CC0', 'Public domain'].every(isFreeLicense)).toBe(true)
    expect(['CC BY-NC 4.0', 'CC BY-ND 2.0', 'Fair use'].some(isFreeLicense)).toBe(false)
    expect(isConcreteCandidate('umbrella', true)).toBe(true)
    expect(isConcreteCandidate('freedom', true)).toBe(false)
    expect(stripHtml('<b>A</b>  &amp; <i>B</i>')).toBe('A & B')
  })
})
