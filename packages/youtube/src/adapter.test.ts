import { describe, expect, it } from 'vitest'
import { InnertubeAdapter, parseSidx } from './adapter'

describe('InnertubeAdapter', () => {
  it('rejects non-id input before any network call', async () => {
    const a = new InnertubeAdapter({ fetch: (() => { throw new Error('no network') }) as never })
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
