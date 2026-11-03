import { describe, expect, it } from 'vitest'
import { InnertubeAdapter } from './adapter'

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
