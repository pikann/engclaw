import { describe, expect, it } from 'vitest'
import { InnertubeAdapter, parseSidx } from './adapter'
import { YouTubeError } from './types'

describe('InnertubeAdapter', () => {
  it('rejects non-id input before any network call', async () => {
    const a = new InnertubeAdapter({
      fetch: (() => {
        throw new Error('no network')
      }) as never,
    })
    await expect(a.meta('http://169.254.169.254/')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('rejects oversized ranges', async () => {
    const a = new InnertubeAdapter()
    await expect(a.audioRange('jNQXAC9IVRw', 0, 500)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('parseSidx', () => {
  it('reads fragment times and absolute byte offsets', () => {
    const refs = [
      [1000, 2000],
      [500, 3000],
    ]
    const box = new Uint8Array(32 + refs.length * 12)
    const v = new DataView(box.buffer)
    v.setUint32(0, box.length)
    v.setUint32(4, 0x73696478)
    v.setUint32(16, 1000) // timescale
    v.setUint32(24, 10) // first_offset
    v.setUint16(30, refs.length)
    refs.forEach(([size, dur], i) => {
      v.setUint32(32 + i * 12, size!)
      v.setUint32(36 + i * 12, dur!)
    })
    expect(parseSidx(box, 700)).toEqual([
      { start: 0, dur: 2, offset: 710, size: 1000 },
      { start: 2, dur: 3, offset: 1710, size: 500 },
    ])
  })
})

describe('InnertubeAdapter retries', () => {
  const okInfo = {
    playability_status: { status: 'OK' },
    basic_info: { title: 'T', duration: 5 },
    captions: { caption_tracks: [] },
  }
  function setup(outcomes: (unknown | Error)[]) {
    const sessions: number[] = []
    const logs: string[] = []
    const sleeps: number[] = []
    let calls = 0
    const adapter = new InnertubeAdapter({
      clients: ['WEB'],
      createInnertube: async () => {
        const id = sessions.push(sessions.length) - 1
        return {
          getBasicInfo: async () => {
            const o = outcomes[Math.min(calls++, outcomes.length - 1)]
            if (o instanceof Error) throw o
            void id
            return o
          },
        } as never
      },
      sleep: async (ms) => void sleeps.push(ms),
      log: (m) => logs.push(m),
    })
    return { adapter, sessions, logs, sleeps, calls: () => calls }
  }

  it('retries a transient network failure and then succeeds', async () => {
    const t = setup([new Error('fetch failed'), okInfo])
    await expect(t.adapter.meta('jNQXAC9IVRw')).resolves.toMatchObject({ title: 'T' })
    expect(t.calls()).toBe(2)
    expect(t.sleeps).toEqual([500])
  })

  it('retries an extractor failure and logs each attempt', async () => {
    const t = setup([new Error('boom'), new Error('boom'), okInfo])
    await expect(t.adapter.meta('jNQXAC9IVRw')).resolves.toBeDefined()
    expect(t.sleeps).toEqual([500, 1500])
    expect(t.logs).toHaveLength(2)
    expect(t.logs[0]).toContain('EXTRACTOR_BROKEN')
    expect(t.logs[0]).toContain('boom')
  })

  it('gives up with the last error after two retries', async () => {
    const t = setup([new Error('fetch failed')])
    await expect(t.adapter.meta('jNQXAC9IVRw')).rejects.toMatchObject({ code: 'NETWORK' })
    expect(t.calls()).toBe(3)
  })

  it('does not retry rate limits or missing videos', async () => {
    const rl = setup([new Error('status code 429')])
    await expect(rl.adapter.meta('jNQXAC9IVRw')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(rl.calls()).toBe(1)
    const nf = setup([{ playability_status: { status: 'ERROR', reason: 'gone' } }])
    await expect(nf.adapter.meta('jNQXAC9IVRw')).rejects.toBeInstanceOf(YouTubeError)
    expect(nf.calls()).toBe(1)
  })

  it('starts each retry from a fresh Innertube session', async () => {
    const t = setup([new Error('fetch failed'), okInfo])
    await t.adapter.meta('jNQXAC9IVRw')
    expect(t.sessions).toHaveLength(2)
  })

  it('retries transcript lookups too, but not a missing track', async () => {
    const t = setup([new Error('fetch failed'), okInfo])
    await expect(t.adapter.transcript('jNQXAC9IVRw', 'en')).rejects.toMatchObject({
      code: 'NO_CAPTIONS',
    })
    expect(t.calls()).toBe(2)
  })
})

describe('audio client fallback', () => {
  it('tries another client when an accepted stream index has a forbidden audio body', async () => {
    const clients: string[] = []
    const bodies: string[] = []
    const head = new Uint8Array(52)
    const sidx = new DataView(head.buffer, 8)
    sidx.setUint32(0, 44)
    sidx.setUint32(4, 0x73696478)
    sidx.setUint32(16, 1000)
    sidx.setUint16(30, 1)
    sidx.setUint32(32, 4)
    sidx.setUint32(36, 20000)
    const adapter = new InnertubeAdapter({
      clients: ['MWEB', 'IOS'],
      sleep: async () => undefined,
      createInnertube: async () =>
        ({
          getBasicInfo: async (_id: string, { client }: { client: string }) => {
            clients.push(client)
            return {
              playability_status: { status: 'OK' },
              streaming_data: {
                adaptive_formats: [
                  {
                    has_audio: true,
                    has_video: false,
                    bitrate: 1,
                    url: `https://media.example/${client}`,
                    mime_type: 'audio/mp4',
                    init_range: { start: 0, end: 7 },
                    index_range: { start: 8, end: 51 },
                  },
                ],
              },
            }
          },
        }) as never,
      fetch: (async (url: string, init: RequestInit) => {
        if ((init.headers as Record<string, string>).range === 'bytes=0-51')
          return new Response(head)
        bodies.push(new URL(url).origin + new URL(url).pathname)
        return new URL(url).pathname.endsWith('/MWEB')
          ? new Response(null, { status: 403 })
          : new Response(new Uint8Array([1, 2, 3, 4]))
      }) as never,
    })
    const result = await adapter.audioRange('2mKgniIiHi4', 0, 10)
    expect(clients).toEqual(['MWEB', 'IOS'])
    expect(bodies).toEqual(['https://media.example/MWEB', 'https://media.example/IOS'])
    expect(Array.from(result.bytes.slice(-4))).toEqual([1, 2, 3, 4])
  })
})
